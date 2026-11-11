import { randomUUID } from "node:crypto";
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import type { Product } from "../contracts/types.js";
import type { CatalogCache } from "../cache/catalog-cache.js";
import type { Neo4jGraphAdapter, GraphOfferProjection, GraphVariantProjection, GraphSellerProjection } from "./neo4j-driver.js";
import type { LanceDbVectorStore } from "../retrieval/lancedb-store.js";
import type { TextEmbeddingProvider } from "../retrieval/embeddings.js";
import { VectorIngestionService } from "../retrieval/vector-ingestion.js";

export type OutboxTargetName = "redis" | "neo4j" | "lancedb";
export type OutboxDeliveryStatus = "pending" | "processing" | "applied" | "skipped" | "failed" | "dead_letter";
export type OutboxEventOperation = "created" | "updated" | "deleted";

export interface OutboxEvent<T = unknown> {
  eventId: string;
  aggregateType: string;
  aggregateId: string;
  aggregateVersion: number;
  eventType: string;
  schemaVersion: string;
  payload: T;
  occurredAt: string;
}

export interface OutboxDelivery {
  event: OutboxEvent;
  targetName: OutboxTargetName;
  status: OutboxDeliveryStatus;
  attemptCount: number;
  nextAttemptAt: string | null;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
}

export interface OutboxStore {
  claim(targetName: OutboxTargetName, workerId: string, leaseMs: number): Promise<OutboxDelivery | null>;
  renewLease?(delivery: OutboxDelivery, workerId: string, leaseMs: number): Promise<boolean>;
  markApplied(delivery: OutboxDelivery, workerId: string, skipped?: boolean): Promise<boolean>;
  markFailed(delivery: OutboxDelivery, workerId: string, error: string, retryable: boolean, maxAttempts: number, nextAttemptAt: string | null): Promise<boolean>;
  replay(eventId: string, targetName: OutboxTargetName): Promise<boolean>;
  getHealth(): Promise<OutboxHealth>;
}

export interface OutboxHealth {
  pending: number;
  failed: number;
  deadLetter: number;
  oldestPendingAgeMs: number | null;
}

export async function writeOutboxRecord(
  connection: PoolConnection,
  event: OutboxEvent,
): Promise<void> {
  await connection.query(
    `INSERT INTO outbox_events
      (event_id, aggregate_type, aggregate_id, aggregate_version, event_type, schema_version, payload, occurred_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      event.eventId,
      event.aggregateType,
      event.aggregateId,
      event.aggregateVersion,
      event.eventType,
      event.schemaVersion,
      JSON.stringify(event.payload),
      new Date(event.occurredAt),
    ],
  );
  for (const target of ["redis", "neo4j", "lancedb"] as const) {
    await connection.query(
      "INSERT INTO outbox_deliveries (event_id, target_name) VALUES (?, ?)",
      [event.eventId, target],
    );
  }
}

interface DeliveryRow extends RowDataPacket {
  event_id: string;
  target_name: OutboxTargetName;
  status: OutboxDeliveryStatus;
  attempt_count: number;
  next_attempt_at: Date | string | null;
  lease_owner: string | null;
  lease_expires_at: Date | string | null;
  event_aggregate_type: string;
  aggregate_id: string;
  aggregate_version: number;
  event_type: string;
  schema_version: string;
  payload: string | object;
  occurred_at: Date | string;
}

function iso(value: Date | string | null): string | null {
  return value === null ? null : value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function parsePayload(value: string | object): unknown {
  return typeof value === "string" ? JSON.parse(value) : value;
}

function mapDelivery(row: DeliveryRow): OutboxDelivery {
  return {
    event: {
      eventId: row.event_id,
      aggregateType: row.event_aggregate_type,
      aggregateId: row.aggregate_id,
      aggregateVersion: Number(row.aggregate_version),
      eventType: row.event_type,
      schemaVersion: row.schema_version,
      payload: parsePayload(row.payload),
      occurredAt: iso(row.occurred_at)!,
    },
    targetName: row.target_name,
    status: row.status,
    attemptCount: Number(row.attempt_count),
    nextAttemptAt: iso(row.next_attempt_at),
    leaseOwner: row.lease_owner,
    leaseExpiresAt: iso(row.lease_expires_at),
  };
}

export class MySqlOutboxStore implements OutboxStore {
  constructor(private readonly pool: Pool) {}

  async claim(targetName: OutboxTargetName, workerId: string, leaseMs: number): Promise<OutboxDelivery | null> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.query<DeliveryRow[]>(
        `SELECT d.event_id, d.target_name, d.status, d.attempt_count, d.next_attempt_at,
                d.lease_owner, d.lease_expires_at, e.aggregate_type AS event_aggregate_type,
                e.aggregate_id, e.aggregate_version, e.event_type, e.schema_version,
                e.payload, e.occurred_at
         FROM outbox_deliveries d
         JOIN outbox_events e ON e.event_id = d.event_id
         WHERE d.target_name = ?
           AND (d.status IN ('pending', 'failed') OR
                (d.status = 'processing' AND d.lease_expires_at < NOW(3)))
           AND (d.next_attempt_at IS NULL OR d.next_attempt_at <= NOW(3))
         ORDER BY e.occurred_at ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED`,
        [targetName],
      );
      const row = rows[0];
      if (!row) {
        await connection.rollback();
        return null;
      }
      const leaseExpiresAt = new Date(Date.now() + leaseMs);
      await connection.query(
        `UPDATE outbox_deliveries
         SET status = 'processing', attempt_count = attempt_count + 1,
             lease_owner = ?, lease_expires_at = ?, last_attempt_at = NOW(3)
         WHERE event_id = ? AND target_name = ?`,
        [workerId, leaseExpiresAt, row.event_id, targetName],
      );
      await connection.commit();
      const delivery = mapDelivery(row);
      delivery.status = "processing";
      delivery.attemptCount += 1;
      delivery.leaseOwner = workerId;
      delivery.leaseExpiresAt = leaseExpiresAt.toISOString();
      return delivery;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async markApplied(delivery: OutboxDelivery, workerId: string, skipped = false): Promise<boolean> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [result] = await connection.query<RowDataPacket[] & { affectedRows: number }>(
        `UPDATE outbox_deliveries
         SET status = ?, completed_at = NOW(3), lease_owner = NULL, lease_expires_at = NULL,
             last_error = NULL
         WHERE event_id = ? AND target_name = ? AND status = 'processing' AND lease_owner = ?`,
        [skipped ? "skipped" : "applied", delivery.event.eventId, delivery.targetName, workerId],
      );
      if (result.affectedRows !== 1) {
        await connection.rollback();
        return false;
      }
      const [remaining] = await connection.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS remaining
         FROM outbox_deliveries
         WHERE event_id = ? AND status NOT IN ('applied', 'skipped')`,
        [delivery.event.eventId],
      );
      await this.recomputeEventStatus(connection, delivery.event.eventId);
      await connection.commit();
      return true;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async markFailed(delivery: OutboxDelivery, workerId: string, error: string, retryable: boolean, maxAttempts: number, nextAttemptAt: string | null): Promise<boolean> {
    const status: OutboxDeliveryStatus = retryable && delivery.attemptCount < maxAttempts ? "failed" : "dead_letter";
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [result] = await connection.query<RowDataPacket[] & { affectedRows: number }>(
        `UPDATE outbox_deliveries
         SET status = ?, next_attempt_at = ?, last_error = ?, lease_owner = NULL, lease_expires_at = NULL
         WHERE event_id = ? AND target_name = ? AND status = 'processing' AND lease_owner = ?`,
        [status, status === "failed" ? nextAttemptAt : null, error.slice(0, 2048), delivery.event.eventId, delivery.targetName, workerId],
      );
      if (result.affectedRows === 1) await this.recomputeEventStatus(connection, delivery.event.eventId, error);
      await connection.commit();
      return result.affectedRows === 1;
    } catch (caught) {
      await connection.rollback();
      throw caught;
    } finally {
      connection.release();
    }
  }

  async replay(eventId: string, targetName: OutboxTargetName): Promise<boolean> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [result] = await connection.query<RowDataPacket[] & { affectedRows: number }>(
        `UPDATE outbox_deliveries SET status = 'pending', next_attempt_at = NOW(3),
                last_error = NULL, lease_owner = NULL, lease_expires_at = NULL
         WHERE event_id = ? AND target_name = ? AND status = 'dead_letter'`,
        [eventId, targetName],
      );
      if (result.affectedRows === 1) {
        await this.recomputeEventStatus(connection, eventId);
      }

      await connection.commit();
      return result.affectedRows === 1;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

  }

  async renewLease(delivery: OutboxDelivery, workerId: string, leaseMs: number): Promise<boolean> {
    const [result] = await this.pool.query<RowDataPacket[] & { affectedRows: number }>(
      `UPDATE outbox_deliveries
       SET lease_expires_at = DATE_ADD(NOW(3), INTERVAL ? MICROSECOND)
       WHERE event_id = ? AND target_name = ? AND status = 'processing' AND lease_owner = ?`,
      [Math.max(1, Math.floor(leaseMs * 1000)), delivery.event.eventId, delivery.targetName, workerId],
    );
    return result.affectedRows === 1;
  }

  private async recomputeEventStatus(connection: PoolConnection, eventId: string, lastError?: string): Promise<void> {
    const [rows] = await connection.query<RowDataPacket[]>(
      `SELECT
         SUM(status IN ('pending', 'processing')) AS active,
         SUM(d.status = 'failed') AS failed,
         SUM(d.status = 'dead_letter') AS dead,
         SUM(status IN ('applied', 'skipped')) AS complete,
         COUNT(*) AS total
       FROM outbox_deliveries WHERE event_id = ?`,
      [eventId],
    );
    const row = rows[0];
    const active = Number(row?.["active"] ?? 0);
    const failed = Number(row?.["failed"] ?? 0);
    const dead = Number(row?.["dead"] ?? 0);
    const complete = Number(row?.["complete"] ?? 0);
    const total = Number(row?.["total"] ?? 0);
    const status = active > 0 ? "pending" : failed > 0 ? "failed" : dead > 0 ? "dead_letter" : complete === total ? "processed" : "pending";
    await connection.query(
      `UPDATE outbox_events
       SET status = ?, processed_at = CASE WHEN ? = 'processed' THEN COALESCE(processed_at, NOW(3)) ELSE NULL END,
           last_error = COALESCE(?, last_error)
       WHERE event_id = ?`,
      [status, status, lastError?.slice(0, 2048) ?? null, eventId],
    );
  }

  async getHealth(): Promise<OutboxHealth> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT
         SUM(d.status = 'pending' OR d.status = 'processing' OR d.status = 'failed') AS pending,
         SUM(d.status = 'failed') AS failed,
         SUM(d.status = 'dead_letter') AS dead_letter,
         MIN(CASE WHEN d.status IN ('pending', 'processing', 'failed') THEN e.occurred_at END) AS oldest
       FROM outbox_deliveries d JOIN outbox_events e ON e.event_id = d.event_id`,
    );
    const row = rows[0];
    const oldest = row?.["oldest"] as Date | string | null | undefined;
    return {
      pending: Number(row?.["pending"] ?? 0),
      failed: Number(row?.["failed"] ?? 0),
      deadLetter: Number(row?.["dead_letter"] ?? 0),
      oldestPendingAgeMs: oldest ? Math.max(0, Date.now() - new Date(oldest).getTime()) : null,
    };
  }
}

export interface OutboxTarget {
  readonly name: OutboxTargetName;
  deliver(delivery: OutboxDelivery): Promise<void>;
  close?(): Promise<void>;
}

export interface OutboxWorkerOptions {
  store: OutboxStore;
  targets: readonly OutboxTarget[];
  workerId?: string;
  leaseMs?: number;
  maxAttempts?: number;
  baseRetryMs?: number;
  maxRetryMs?: number;
}

export interface OutboxWorkerHealth extends OutboxHealth {
  running: boolean;
  lastSuccessfulProcessingAt: string | null;
}

export class OutboxWorker {
  private readonly workerId: string;
  private readonly leaseMs: number;
  private readonly maxAttempts: number;
  private readonly baseRetryMs: number;
  private readonly maxRetryMs: number;
  private running = false;
  private processing = new Set<Promise<void>>();
  private readonly targets: readonly OutboxTarget[];
  private lastSuccessfulProcessingAt: string | null = null;

  constructor(private readonly options: OutboxWorkerOptions) {
    this.workerId = options.workerId ?? randomUUID();
    this.leaseMs = options.leaseMs ?? 30_000;
    this.maxAttempts = options.maxAttempts ?? 5;
    this.baseRetryMs = options.baseRetryMs ?? 1_000;
    this.maxRetryMs = options.maxRetryMs ?? 60_000;
    this.targets = options.targets;
  }

  async processOnce(): Promise<number> {
    let processed = 0;
    for (const target of this.targets) {
      const delivery = await this.options.store.claim(target.name, this.workerId, this.leaseMs);
      if (!delivery) continue;
      processed += 1;
      let leaseLost = false;
      let renewalTimer: ReturnType<typeof setInterval> | undefined;
      const renewal = this.options.store.renewLease;
      if (renewal && this.leaseMs > 1_000) {
        renewalTimer = setInterval(() => {
          void renewal.call(this.options.store, delivery, this.workerId, Math.floor(this.leaseMs / 2))
            .then((owned) => { if (!owned) leaseLost = true; })
            .catch(() => { leaseLost = true; });
        }, Math.floor(this.leaseMs / 2));
      }
      try {
        await target.deliver(delivery);
        if (leaseLost) throw new Error("Outbox delivery lease was lost before acknowledgement.");
        const owned = await this.options.store.markApplied(delivery, this.workerId);
        if (owned) this.lastSuccessfulProcessingAt = new Date().toISOString();
      } catch (error) {
        if (error instanceof SkippedOutboxError) {
          await this.options.store.markApplied(delivery, this.workerId, true);
          continue;
        }
        const retryable = !(error instanceof PermanentOutboxError);
        const delay = Math.min(this.maxRetryMs, this.baseRetryMs * (2 ** Math.max(0, delivery.attemptCount - 1)));
        await this.options.store.markFailed(delivery, this.workerId, error instanceof Error ? error.message : String(error), retryable, this.maxAttempts, new Date(Date.now() + delay).toISOString());
      } finally {
        if (renewalTimer) clearInterval(renewalTimer);
      }
    }
    return processed;
  }

  start(intervalMs = 1_000): void {
    if (this.running) return;
    this.running = true;
    const loop = async () => {
      while (this.running) {
        try {
          await this.processOnce();
        } catch (error) {
          console.error(`Outbox worker iteration failed: ${error instanceof Error ? error.message : "unknown error"}`);
        }
        if (this.running) await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
    };
    const task = loop();
    this.processing.add(task);
    void task.finally(() => this.processing.delete(task));
  }

  async stop(): Promise<void> {
    this.running = false;
    await Promise.all(this.processing);
  }

  isRunning(): boolean {
    return this.running;
  }

  async getHealth(): Promise<OutboxWorkerHealth> {
    return {
      ...(await this.options.store.getHealth()),
      running: this.running,
      lastSuccessfulProcessingAt: this.lastSuccessfulProcessingAt,
    };
  }
}

export class PermanentOutboxError extends Error {}
export class SkippedOutboxError extends Error {}
export class UnavailableOutboxTarget implements OutboxTarget {
  constructor(
    public readonly name: OutboxTargetName,
    private readonly reason: string,
  ) {}
  async deliver(): Promise<void> {
    throw new Error(`${this.name} is unavailable: ${this.reason}`);
  }
}

export class LazyOutboxTarget implements OutboxTarget {
    private target: OutboxTarget | undefined;
    private resolving: Promise<OutboxTarget> | undefined;

    constructor(
      public readonly name: OutboxTargetName,
      private readonly resolveTarget: () => Promise<OutboxTarget>,
    ) {}

    async deliver(delivery: OutboxDelivery): Promise<void> {
      if (!this.resolving) {
        this.resolving = this.resolveTarget().finally(() => { this.resolving = undefined; });
      }
      this.target = await this.resolving;
      await this.target.deliver(delivery);
    }

    async close(): Promise<void> {
      await this.target?.close?.();
      this.target = undefined;
  }
}

export function createProductOutboxPayload(product: Product): Product {
  return { ...product };
}

export function createProductOutboxEvent(product: Product, operation: OutboxEventOperation): OutboxEvent<Product> {
  return {
    eventId: randomUUID(),
    aggregateType: "product",
    aggregateId: product.id,
    aggregateVersion: product.version,
    eventType: `product.${operation}`,
    schemaVersion: "1.0",
    payload: createProductOutboxPayload(product),
    occurredAt: new Date().toISOString(),
  };
}

export function createOutboxEvent<T>(
  aggregateType: string,
  aggregateId: string,
  aggregateVersion: number,
  eventType: string,
  payload: T,
): OutboxEvent<T> {
  return {
    eventId: randomUUID(),
    aggregateType,
    aggregateId,
    aggregateVersion,
    eventType,
    schemaVersion: "1.0",
    payload,
    occurredAt: new Date().toISOString(),
  };
}

export class RedisOutboxTarget implements OutboxTarget {
  readonly name = "redis" as const;
  constructor(
    private readonly cache: CatalogCache,
    private readonly isAvailable: () => boolean = () => true,
  ) {}
  async deliver(delivery: OutboxDelivery): Promise<void> {
    if (!this.isAvailable()) throw new Error("Redis is unavailable.");
    const payload = delivery.event.payload as { productId?: string };
    await this.cache.invalidateProductStrict(payload.productId ?? delivery.event.aggregateId);
    await this.cache.invalidateListingsStrict();
  }
}

export class Neo4jOutboxTarget implements OutboxTarget {
  readonly name = "neo4j" as const;
  constructor(private readonly graph: Neo4jGraphAdapter) {}
  async close(): Promise<void> {
    await this.graph.close();
  }
  async deliver(delivery: OutboxDelivery): Promise<void> {
    if (this.graph.getStatus() !== "connected") await this.graph.connect();
    const operation = delivery.event.eventType.endsWith("deleted") ? "delete" : "upsert";
    if (operation === "delete" && delivery.event.aggregateType !== "product") {
      throw new PermanentOutboxError(`Neo4j deletion is unsupported for ${delivery.event.aggregateType}.`);
    }
    if (delivery.event.aggregateType === "offer") {
      const source = delivery.event.payload as {
        id: string; productId: string; sellerId: string; variantId?: string | null;
        version: number; availability: GraphOfferProjection["status"];
      };
      const payload: GraphOfferProjection = {
        sourceId: source.id,
        productId: source.productId,
        sellerId: source.sellerId,
        variantId: source.variantId ?? null,
        sourceVersion: source.version,
        status: source.availability,
      };
      await this.graph.upsertOffer(payload);
      return;
    }
    if (delivery.event.aggregateType === "variant") {
      const source = delivery.event.payload as GraphVariantProjection & { id?: string; version?: number };
      await this.graph.upsertVariant({
        ...source,
        sourceId: source.sourceId ?? source.id ?? delivery.event.aggregateId,
        sourceVersion: source.sourceVersion ?? source.version ?? delivery.event.aggregateVersion,
      });
      return;
    }
    if (delivery.event.aggregateType === "seller") {
      const source = delivery.event.payload as GraphSellerProjection & { id?: string };
      await this.graph.upsertSeller({
        ...source,
        sourceId: source.sourceId ?? source.id ?? delivery.event.aggregateId,
      });
      return;
    }
    if (delivery.event.aggregateType === "brand") {
      const source = delivery.event.payload as { id?: string; sourceId?: string; name: string };
      await this.graph.upsertBrand({ sourceId: source.sourceId ?? source.id ?? delivery.event.aggregateId, name: source.name });
      return;
    }
    if (delivery.event.aggregateType === "category") {
      const source = delivery.event.payload as { id?: string; sourceId?: string; name: string };
      await this.graph.upsertCategory({ sourceId: source.sourceId ?? source.id ?? delivery.event.aggregateId, name: source.name });
      return;
    }
    if (delivery.event.aggregateType !== "product") {
      throw new PermanentOutboxError(`Unsupported Neo4j aggregate: ${delivery.event.aggregateType}.`);
    }
    const product = delivery.event.payload as Product;
    await this.graph.applyUpdate({
      eventId: delivery.event.eventId,
      productId: product.id,
      version: product.version,
      operation: delivery.event.eventType.endsWith("deleted") ? "delete" : delivery.event.eventType.endsWith("created") ? "create" : "update",
      timestamp: delivery.event.occurredAt,
      data: product,
    });
  }
}

export class LanceDbOutboxTarget implements OutboxTarget {
  readonly name = "lancedb" as const;
  private readonly ingestion: VectorIngestionService;
  constructor(private readonly store: LanceDbVectorStore, embedder: TextEmbeddingProvider) {
    this.ingestion = new VectorIngestionService(store, embedder);
  }
  async close(): Promise<void> {
    await this.store.close();
  }
  async deliver(delivery: OutboxDelivery): Promise<void> {
    if (this.store.getStatus() !== "connected") await this.store.initialize();
    if (delivery.event.aggregateType !== "product") {
      throw new SkippedOutboxError(`The ${delivery.event.aggregateType} event does not change product semantic content.`);
    }
    if (delivery.event.eventType.endsWith("deleted")) {
      await this.store.deleteVersioned(delivery.event.aggregateId, delivery.event.aggregateVersion);
    } else {
      await this.ingestion.updateProduct(delivery.event.payload as Product);
    }
  }
}

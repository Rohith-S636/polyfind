/**
 * Neo4j Graph Schema and Synchronization Adapter for PolyFind
 * Synchronizes catalog product and category relationships into Neo4j graph nodes.
 * Implements DerivedStoreSyncTarget with idempotent, version-aware Cypher semantics.
 */

import type { CategoryId, ProductId, SourceVersion } from "../contracts/types.js";
import { redactSecret } from "../config/environment.js";
import type { DerivedStoreSyncTarget } from "./processor.js";
import type { ProductUpdateEvent } from "./events.js";

export interface GraphNode {
  id: string;
  name: string;
  version?: SourceVersion | undefined;
}

export interface GraphEdge {
  fromId: string;
  toId: string;
  type: "IN_CATEGORY" | "RELATED_TO";
  weight?: number | undefined;
}

export interface GraphSyncMetrics {
  totalNodes: number;
  totalEdges: number;
  totalSyncEvents: number;
  lastLagMs: number;
  lastSyncAt: string;
  syncErrorsCount: number;
  lastError?: string | undefined;
}

export const NEO4J_SCHEMA_CYPHER = [
  "CREATE CONSTRAINT c_product_id IF NOT EXISTS FOR (p:Product) REQUIRE p.id IS UNIQUE;",
  "CREATE CONSTRAINT c_category_id IF NOT EXISTS FOR (c:Category) REQUIRE c.id IS UNIQUE;",
  "CREATE INDEX idx_product_version IF NOT EXISTS FOR (p:Product) ON (p.version);",
  "CREATE INDEX idx_product_category IF NOT EXISTS FOR (p:Product) ON (p.categoryId);",
];

export class InMemoryGraphStorage {
  public products = new Map<ProductId, GraphNode & { categoryId?: CategoryId | undefined }>();
  public categories = new Map<CategoryId, GraphNode>();
  public edges: GraphEdge[] = [];

  clear(): void {
    this.products.clear();
    this.categories.clear();
    this.edges = [];
  }
}

export class Neo4jGraphSyncAdapter implements DerivedStoreSyncTarget {
  public readonly name = "neo4j-graph";
  private storage: InMemoryGraphStorage;
  private metrics: GraphSyncMetrics;

  constructor(storage?: InMemoryGraphStorage) {
    this.storage = storage ?? new InMemoryGraphStorage();
    this.metrics = {
      totalNodes: 0,
      totalEdges: 0,
      totalSyncEvents: 0,
      lastLagMs: 0,
      lastSyncAt: new Date(0).toISOString(),
      syncErrorsCount: 0,
    };
  }

  getSchemaStatements(): string[] {
    return [...NEO4J_SCHEMA_CYPHER];
  }

  async getCurrentVersion(productId: ProductId): Promise<SourceVersion | null> {
    const node = this.storage.products.get(productId);
    return node?.version ?? null;
  }

  async applyUpdate(event: ProductUpdateEvent): Promise<void> {
    const eventTime = new Date(event.timestamp).getTime();
    const now = Date.now();
    const lagMs = Math.max(0, now - (Number.isNaN(eventTime) ? now : eventTime));

    try {
      if (event.operation === "delete") {
        this.storage.products.delete(event.productId);
        this.storage.edges = this.storage.edges.filter(
          (e) => e.fromId !== event.productId && e.toId !== event.productId,
        );
      } else {
        // Create or Update operation: Idempotent MERGE
        const existing = this.storage.products.get(event.productId);
        if (existing?.version !== undefined && existing.version > event.version) {
          // Stale event arriving out-of-order, skip applying
          return;
        }

        const name = event.data.name ?? existing?.name ?? `Product ${event.productId}`;
        const categoryId = event.data.categoryId ?? existing?.categoryId;

        this.storage.products.set(event.productId, {
          id: event.productId,
          name,
          version: event.version,
          categoryId,
        });

        // Ensure category node exists
        if (categoryId) {
          if (!this.storage.categories.has(categoryId)) {
            this.storage.categories.set(categoryId, { id: categoryId, name: categoryId });
          }

          // Idempotent edge: remove old IN_CATEGORY edge and add updated edge
          this.storage.edges = this.storage.edges.filter(
            (e) => !(e.fromId === event.productId && e.type === "IN_CATEGORY"),
          );
          this.storage.edges.push({
            fromId: event.productId,
            toId: categoryId,
            type: "IN_CATEGORY",
          });
        }
      }

      this.metrics.totalNodes = this.storage.products.size + this.storage.categories.size;
      this.metrics.totalEdges = this.storage.edges.length;
      this.metrics.totalSyncEvents += 1;
      this.metrics.lastLagMs = lagMs;
      this.metrics.lastSyncAt = new Date().toISOString();
    } catch (err) {
      this.metrics.syncErrorsCount += 1;
      const rawMessage = err instanceof Error ? err.message : String(err);
      this.metrics.lastError = redactSecret(rawMessage);
      throw new Error(`Neo4j sync failed: ${this.metrics.lastError}`);
    }
  }

  getMetrics(): GraphSyncMetrics {
    return { ...this.metrics };
  }

  getStorage(): InMemoryGraphStorage {
    return this.storage;
  }
}

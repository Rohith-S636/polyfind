import neo4j, { type Driver, type ManagedTransaction, type Session } from "neo4j-driver";
import type { ProductId, SourceVersion } from "../contracts/types.js";
import type { DerivedStoreSyncTarget } from "./processor.js";
import type { ProductUpdateEvent } from "./events.js";

export type Neo4jStatus = "disconnected" | "connecting" | "connected" | "unavailable";

export interface Neo4jConfig {
  uri: string;
  username: string;
  password: string;
  database?: string;
  connectionTimeoutMs?: number;
  maxTransactionRetryTimeMs?: number;
}

export interface GraphCategoryProjection {
  sourceId: string;
  name?: string;
  sourceVersion?: SourceVersion;
  sourceSystem?: "polyfind";
}

export interface GraphBrandProjection {
  sourceId: string;
  name: string;
  sourceVersion?: SourceVersion;
  sourceSystem?: "polyfind";
}

export interface GraphProductProjection {
  sourceId: ProductId;
  name: string;
  sourceVersion: SourceVersion;
  category?: GraphCategoryProjection;
  brand?: GraphBrandProjection;
  status?: "active" | "inactive" | "deleted";
}

export interface GraphVariantProjection {
  sourceId: string;
  productId: ProductId;
  sku?: string | null;
  sourceVersion: SourceVersion;
  status?: "active" | "inactive" | "deleted";
}

export interface GraphSellerProjection {
  sourceId: string;
  name: string;
  sourceVersion?: SourceVersion;
  status?: "active" | "inactive" | "suspended";
}

export interface GraphOfferProjection {
  sourceId: string;
  productId: ProductId;
  sellerId: string;
  variantId?: string | null;
  sourceVersion: SourceVersion;
  status: "available" | "unavailable" | "unknown_stock";
}

export const REAL_NEO4J_SCHEMA_CYPHER = [
  "CREATE CONSTRAINT product_source_id IF NOT EXISTS FOR (n:Product) REQUIRE n.sourceId IS UNIQUE",
  "CREATE CONSTRAINT category_source_id IF NOT EXISTS FOR (n:Category) REQUIRE n.sourceId IS UNIQUE",
  "CREATE CONSTRAINT brand_source_id IF NOT EXISTS FOR (n:Brand) REQUIRE n.sourceId IS UNIQUE",
  "CREATE CONSTRAINT variant_source_id IF NOT EXISTS FOR (n:ProductVariant) REQUIRE n.sourceId IS UNIQUE",
  "CREATE CONSTRAINT seller_source_id IF NOT EXISTS FOR (n:Seller) REQUIRE n.sourceId IS UNIQUE",
  "CREATE CONSTRAINT offer_source_id IF NOT EXISTS FOR (n:Offer) REQUIRE n.sourceId IS UNIQUE",
  "CREATE INDEX product_source_version IF NOT EXISTS FOR (n:Product) ON (n.sourceVersion)",
  "CREATE INDEX product_status IF NOT EXISTS FOR (n:Product) ON (n.status)",
  "CREATE INDEX offer_product IF NOT EXISTS FOR (n:Offer) ON (n.productId)",
];

export class Neo4jGraphAdapter implements DerivedStoreSyncTarget {
  public readonly name = "neo4j-graph";
  private readonly driver: Driver;
  private readonly database: string | undefined;
  private readonly ownsDriver: boolean;
  private status: Neo4jStatus = "disconnected";

  constructor(config: Neo4jConfig, driver?: Driver) {
    this.driver = driver ?? neo4j.driver(
      config.uri,
      neo4j.auth.basic(config.username, config.password),
      {
        connectionTimeout: config.connectionTimeoutMs ?? 5_000,
        maxTransactionRetryTime: config.maxTransactionRetryTimeMs ?? 5_000,
      },
    );
    this.database = config.database;
    this.ownsDriver = driver === undefined;
  }

  async connect(): Promise<void> {
    if (this.status === "connected") return;
    this.status = "connecting";
    try {
      await this.driver.verifyConnectivity();
      this.status = "connected";
    } catch (error) {
      this.status = "unavailable";
      throw this.storeError("Neo4j connectivity verification failed.", error);
    }
  }

  async initializeSchema(): Promise<void> {
    try {
      await this.withSession(async (session) => {
        for (const statement of REAL_NEO4J_SCHEMA_CYPHER) {
          await session.run(statement);
        }
      });
    } catch (error) {
      throw this.storeError("Neo4j schema initialization failed.", error);
    }
  }

  async close(): Promise<void> {
    if (this.ownsDriver) await this.driver.close();
    this.status = "disconnected";
  }

  getStatus(): Neo4jStatus {
    return this.status;
  }

  async ping(): Promise<boolean> {
    try {
      await this.driver.verifyConnectivity();
      this.status = "connected";
      return true;
    } catch {
      this.status = "unavailable";
      return false;
    }
  }

  async getCurrentVersion(productId: ProductId): Promise<SourceVersion | null> {
    try {
      const result = await this.runRead(
        "MATCH (p:Product {sourceId: $sourceId}) RETURN p.sourceVersion AS sourceVersion",
        { sourceId: productId },
      );
      const value = result.records[0]?.get("sourceVersion");
      return value === undefined || value === null ? null : this.toNumber(value);
    } catch (error) {
      throw this.storeError("Neo4j version lookup failed.", error);
    }

  }

  async getProductCategoryIds(productId: ProductId): Promise<string[]> {
    const result = await this.runRead(
      `MATCH (p:Product {sourceId: $sourceId})-[:IN_CATEGORY]->(c:Category)
       RETURN c.sourceId AS sourceId`,
      { sourceId: productId },
    );
    return result.records
      .map((record) => record.get("sourceId"))
      .filter((value): value is string => typeof value === "string");
  }

  async listProductVersions(pageSize = 100, cursor?: string): Promise<Array<{ id: ProductId; version: SourceVersion; sourceSystem?: string }>> {
    const limit = Math.min(100, Math.max(1, pageSize));
    const result = await this.runRead(
      `MATCH (p:Product)
       WHERE ($cursor IS NULL OR p.sourceId > $cursor)
       RETURN p.sourceId AS id, p.sourceVersion AS sourceVersion, p.sourceSystem AS sourceSystem
       ORDER BY p.sourceId LIMIT $limit`,
      { cursor: cursor ?? null, limit: neo4j.int(limit) },
    );
    return result.records.flatMap((record) => {
      const id = record.get("id");
      const version = record.get("sourceVersion");
      return typeof id === "string" && version !== null && version !== undefined
        ? [{ id, version: this.toNumber(version), ...(typeof record.get("sourceSystem") === "string" ? { sourceSystem: record.get("sourceSystem") as string } : {}) }]
        : [];
    });
  }

  /**
   * Retrieve active PolyFind graph candidates. MySQL remains authoritative:
   * callers must hydrate and freshness-check every returned ID.
   */
  async retrieveCandidates(
    query: string,
    categoryId: string | undefined,
    limit: number,
  ): Promise<Array<{ productId: ProductId; score: number; sourceVersion?: SourceVersion }>> {
    const tokens = query.toLocaleLowerCase().split(/[^a-z0-9]+/).filter(Boolean).slice(0, 12);
    if (tokens.length === 0) return [];
    const boundedLimit = Math.min(200, Math.max(1, Math.floor(limit)));
    const direct = await this.runRead(
      `MATCH (p:Product)
       WHERE p.sourceSystem = 'polyfind'
         AND coalesce(p.status, 'active') = 'active'
         AND ($categoryId IS NULL OR EXISTS {
           MATCH (p)-[:IN_CATEGORY]->(:Category {sourceId: $categoryId})
         })
       WITH p, size([token IN $tokens WHERE
         toLower(coalesce(p.name, '')) CONTAINS token OR toLower(p.sourceId) CONTAINS token
       ]) AS matched
       WHERE matched > 0
       RETURN p.sourceId AS productId,
              toFloat(matched) / size($tokens) AS score,
              p.sourceVersion AS sourceVersion
       ORDER BY score DESC, productId ASC
       LIMIT $limit`,
      { tokens, categoryId: categoryId ?? null, limit: neo4j.int(boundedLimit) },
    );
    const ranked = new Map<string, { score: number; sourceVersion?: number }>();
    const seeds: Array<{ id: string; score: number }> = [];
    for (const record of direct.records) {
      const id = record.get("productId");
      if (typeof id !== "string") continue;
      const score = Number(record.get("score"));
      const versionValue = record.get("sourceVersion");
      const version = versionValue === null || versionValue === undefined ? undefined : this.toNumber(versionValue);
      ranked.set(id, { score, ...(version !== undefined ? { sourceVersion: version } : {}) });
      seeds.push({ id, score });
    }
    if (seeds.length > 0 && ranked.size < boundedLimit) {
      const related = await this.runRead(
        `UNWIND $seeds AS seedData
         MATCH (seed:Product {sourceId: seedData.id})-[:IN_CATEGORY]->(category:Category)<-[:IN_CATEGORY]-(candidate:Product)
         WHERE candidate.sourceSystem = 'polyfind'
           AND coalesce(candidate.status, 'active') = 'active'
           AND candidate.sourceId <> seedData.id
           AND ($categoryId IS NULL OR category.sourceId = $categoryId)
         RETURN candidate.sourceId AS productId,
                max(seedData.score * 0.35) AS score,
                candidate.sourceVersion AS sourceVersion
         ORDER BY score DESC, productId ASC
         LIMIT $limit`,
        { seeds, categoryId: categoryId ?? null, limit: neo4j.int(boundedLimit) },
      );
      for (const record of related.records) {
        const id = record.get("productId");
        if (typeof id !== "string") continue;
        const score = Number(record.get("score"));
        const current = ranked.get(id);
        if (!current || score > current.score) {
          const versionValue = record.get("sourceVersion");
          const version = versionValue === null || versionValue === undefined ? undefined : this.toNumber(versionValue);
          ranked.set(id, { score, ...(version !== undefined ? { sourceVersion: version } : {}) });
        }
      }
    }
    return [...ranked.entries()]
      .map(([productId, value]) => ({ productId, ...value }))
      .sort((a, b) => b.score - a.score || a.productId.localeCompare(b.productId))
      .slice(0, boundedLimit);
  }

  async upsertBrand(projection: GraphBrandProjection): Promise<void> {
    await this.runWrite(
      `MERGE (b:Brand {sourceId: $sourceId})
       ON CREATE SET b.sourceSystem = 'polyfind'
       WITH b
       WHERE b.sourceSystem = 'polyfind'
       SET b.name = $name, b.sourceSystem = 'polyfind'`,
      { ...projection, sourceSystem: "polyfind" },
    );
  }

  async upsertCategory(projection: GraphCategoryProjection): Promise<void> {
    await this.runWrite(
      `MERGE (c:Category {sourceId: $sourceId})
       ON CREATE SET c.sourceSystem = 'polyfind'
       WITH c
       WHERE c.sourceSystem = 'polyfind'
       SET c.name = $name, c.sourceSystem = 'polyfind'`,
      { ...projection, name: projection.name ?? projection.sourceId, sourceSystem: "polyfind" },
    );
  }

  async applyUpdate(event: ProductUpdateEvent): Promise<void> {
    try {
      await this.withWriteTransaction(async (transaction) => {
        if (event.operation === "delete") {
          await transaction.run(
            `MATCH (p:Product {sourceId: $sourceId})
             WHERE p.sourceSystem = 'polyfind'
               AND coalesce(p.sourceVersion, 0) <= $sourceVersion
             WITH p
             MATCH (v:ProductVariant {productId: $sourceId})
             WHERE v.sourceSystem = 'polyfind'
             DETACH DELETE v`,
            { sourceId: event.productId, sourceVersion: event.version },
          );
          await transaction.run(
            `MATCH (p:Product {sourceId: $sourceId})
             WHERE p.sourceSystem = 'polyfind'
               AND coalesce(p.sourceVersion, 0) <= $sourceVersion
             WITH p
             MATCH (o:Offer {productId: $sourceId})
             WHERE o.sourceSystem = 'polyfind'
             DETACH DELETE o`,
            { sourceId: event.productId, sourceVersion: event.version },
          );
          await transaction.run(
            `MERGE (p:Product {sourceId: $sourceId})
             ON CREATE SET p.sourceSystem = 'polyfind',
                           p.sourceVersion = $sourceVersion
             WITH p
             WHERE p.sourceSystem = 'polyfind'
               AND coalesce(p.sourceVersion, 0) <= $sourceVersion
             SET p.sourceVersion = $sourceVersion, p.status = 'deleted', p.sourceSystem = 'polyfind'
             REMOVE p.name`,
            { sourceId: event.productId, sourceVersion: event.version },
          );
          return;
        }

        const result = await transaction.run(
          `MERGE (p:Product {sourceId: $sourceId})
           ON CREATE SET p.sourceSystem = 'polyfind'
           WITH p
           WHERE p.sourceSystem = 'polyfind'
             AND coalesce(p.sourceVersion, 0) < $sourceVersion
           SET p.name = $name, p.sourceVersion = $sourceVersion,
               p.status = $status, p.sourceSystem = 'polyfind'
           RETURN p.sourceVersion AS appliedVersion`,
          {
            sourceId: event.productId,
            name: event.data.name ?? `Product ${event.productId}`,
            sourceVersion: event.version,
            status: "active",
          },
        );

        if (result.records.length === 0) return;

        if ("categoryId" in event.data) {
          const categoryId = event.data.categoryId;
          await transaction.run(
            `MATCH (p:Product {sourceId: $productId})
             OPTIONAL MATCH (p)-[old:IN_CATEGORY]->()
             DELETE old`,
            { productId: event.productId },
          );
          if (categoryId) {
            await transaction.run(
              `MERGE (c:Category {sourceId: $categoryId})
               WITH c
               MATCH (p:Product {sourceId: $productId})
               MERGE (p)-[:IN_CATEGORY]->(c)`,
              { categoryId, productId: event.productId },
            );
          }
        }
      });
    } catch (error) {
      throw this.storeError("Neo4j product projection failed.", error);
    }
  }

  async deleteProductIfOwned(productId: ProductId, version: SourceVersion): Promise<boolean> {
    const result = await this.runWriteReturning(
      `MATCH (p:Product {sourceId: $sourceId})
       WHERE p.sourceSystem = 'polyfind'
         AND coalesce(p.sourceVersion, 0) <= $sourceVersion
       SET p.sourceVersion = $sourceVersion, p.status = 'deleted'
       REMOVE p.name
       RETURN p.sourceId AS id`,
      { sourceId: productId, sourceVersion: version },
    );
    return result.records.length > 0;
  }

  async upsertProduct(projection: GraphProductProjection): Promise<void> {
    await this.withWriteTransaction(async (transaction) => {
      await this.upsertProductInTransaction(transaction, projection);
    });
  }

  async upsertVariant(projection: GraphVariantProjection): Promise<void> {
    await this.withWriteTransaction(async (transaction) => {
      const result = await transaction.run(
        `MERGE (v:ProductVariant {sourceId: $sourceId})
         ON CREATE SET v.sourceSystem = 'polyfind'
         WITH v
         WHERE v.sourceSystem = 'polyfind'
           AND coalesce(v.sourceVersion, 0) <= $sourceVersion
         SET v.productId = $productId, v.sku = $sku,
                v.sourceVersion = $sourceVersion, v.status = $status,
                v.sourceSystem = 'polyfind'
         RETURN v`,
        { ...projection, sku: projection.sku ?? null },
      );
      if (result.records.length > 0) {
        await transaction.run(
          `MATCH (v:ProductVariant {sourceId: $sourceId})
           OPTIONAL MATCH (old:Product)-[relationship:HAS_VARIANT]->(v)
           DELETE relationship`,
          projection,
        );
        await transaction.run(
          `MATCH (p:Product {sourceId: $productId}), (v:ProductVariant {sourceId: $sourceId})
           MERGE (p)-[:HAS_VARIANT]->(v)`,
          projection,
        );
      }
    });
  }

  async upsertSeller(projection: GraphSellerProjection): Promise<void> {
    if (projection.sourceVersion === undefined) {
      await this.runWrite(
        `MERGE (s:Seller {sourceId: $sourceId})
        ON CREATE SET s.sourceSystem = 'polyfind'
        WITH s
        WHERE s.sourceSystem = 'polyfind'
        SET s.name = $name, s.status = $status, s.sourceSystem = 'polyfind'
         REMOVE s.sourceVersion`,
        { ...projection, status: projection.status ?? "active" },
      );
      return;
    }

    await this.runWrite(
      `MERGE (s:Seller {sourceId: $sourceId})
       ON CREATE SET s.sourceSystem = 'polyfind'
       WITH s
       WHERE s.sourceSystem = 'polyfind'
         AND coalesce(s.sourceVersion, 0) <= $sourceVersion
       SET s.name = $name, s.sourceVersion = $sourceVersion, s.status = $status,
           s.sourceSystem = 'polyfind'`,
      { ...projection, status: projection.status ?? "active" },
    );
  }

  async upsertOffer(projection: GraphOfferProjection): Promise<void> {
    await this.withWriteTransaction(async (transaction) => {
      const result = await transaction.run(
        `MERGE (o:Offer {sourceId: $sourceId})
         ON CREATE SET o.sourceSystem = 'polyfind'
         WITH o
         WHERE o.sourceSystem = 'polyfind'
           AND coalesce(o.sourceVersion, 0) <= $sourceVersion
         SET o.productId = $productId, o.sellerId = $sellerId,
             o.variantId = $variantId, o.sourceVersion = $sourceVersion,
             o.status = $status, o.sourceSystem = 'polyfind'
         RETURN o`,
        { ...projection, variantId: projection.variantId ?? null },
      );
      if (result.records.length === 0) return;

      await transaction.run(
        `MATCH (o:Offer {sourceId: $sourceId})
         OPTIONAL MATCH (o)-[relationship]->()
         WHERE type(relationship) IN ['OFFER_FOR', 'PROVIDED_BY', 'OFFER_FOR_VARIANT']
         WITH o, collect(relationship) AS oldRelationships
         FOREACH (oldRelationship IN oldRelationships | DELETE oldRelationship)`,
        projection,
      );
      await transaction.run(
        `MATCH (o:Offer {sourceId: $sourceId}), (p:Product {sourceId: $productId}),
               (s:Seller {sourceId: $sellerId})
         MERGE (o)-[:OFFER_FOR]->(p)
         MERGE (o)-[:PROVIDED_BY]->(s)`,
        projection,
      );
      if (projection.variantId) {
        await transaction.run(
          `MATCH (o:Offer {sourceId: $sourceId}), (v:ProductVariant {sourceId: $variantId})
           MERGE (o)-[:OFFER_FOR_VARIANT]->(v)`,
          projection,
        );
      }
    });
  }

  private async upsertProductInTransaction(
    transaction: ManagedTransaction,
    projection: GraphProductProjection,
  ): Promise<void> {
    const result = await transaction.run(
      `MERGE (p:Product {sourceId: $sourceId})
       ON CREATE SET p.sourceSystem = 'polyfind'
       WITH p
       WHERE p.sourceSystem = 'polyfind'
         AND coalesce(p.sourceVersion, 0) < $sourceVersion
       SET p.name = $name, p.sourceVersion = $sourceVersion, p.status = $status,
           p.sourceSystem = 'polyfind'
       RETURN p`,
      { ...projection, status: projection.status ?? "active" },
    );
    if (result.records.length === 0) return;

    await transaction.run(
      `MATCH (p:Product {sourceId: $productId})
       OPTIONAL MATCH (p)-[old]->()
       WHERE type(old) IN ['IN_CATEGORY', 'HAS_BRAND']
       WITH p, collect(old) AS oldRelationships
       FOREACH (relationship IN oldRelationships | DELETE relationship)`,
      { productId: projection.sourceId },
    );
    if (projection.category) {
      await transaction.run(
        `MERGE (c:Category {sourceId: $categoryId})
         ON CREATE SET c.sourceSystem = 'polyfind', c.name = $categoryName
         WITH c
         WHERE c.sourceSystem = 'polyfind'
         SET c.name = $categoryName
         WITH c
         MATCH (p:Product {sourceId: $productId})
         MERGE (p)-[:IN_CATEGORY]->(c)`,
        {
          categoryId: projection.category.sourceId,
          categoryName: projection.category.name ?? projection.category.sourceId,
          productId: projection.sourceId,
        },
      );
    }
    if (projection.brand) {
      await transaction.run(
        `MERGE (b:Brand {sourceId: $brandId})
        ON CREATE SET b.sourceSystem = 'polyfind'
        WITH b
        WHERE b.sourceSystem = 'polyfind'
        SET b.name = $brandName, b.sourceSystem = 'polyfind'
         WITH b
         MATCH (p:Product {sourceId: $productId})
         MERGE (p)-[:HAS_BRAND]->(b)`,
        {
          brandId: projection.brand.sourceId,
          brandName: projection.brand.name,
          productId: projection.sourceId,
        },
      );
    }
  }

  private async runRead(query: string, parameters: Record<string, unknown>) {
    return this.withSession((session) => session.run(query, parameters));
  }

  private async runWrite(query: string, parameters: Record<string, unknown>): Promise<void> {
    await this.withWriteTransaction((transaction) => transaction.run(query, parameters));
  }

  private async runWriteReturning(query: string, parameters: Record<string, unknown>) {
    return this.withWriteTransaction((transaction) => transaction.run(query, parameters));
  }

  private async withWriteTransaction<T>(
    work: (transaction: ManagedTransaction) => Promise<T>,
  ): Promise<T> {
    return this.withSession((session) => session.executeWrite(work));
  }

  private async withSession<T>(work: (session: Session) => Promise<T>): Promise<T> {
    if (this.status !== "connected") {
      throw new Error("Neo4j is not connected.");
    }
    const session = this.driver.session(this.database ? { database: this.database } : undefined);
    try {
      return await work(session);
    } catch (error) {
      this.status = "unavailable";
      throw this.storeError("Neo4j operation failed.", error);
    } finally {
      await session.close();
    }
  }

  private toNumber(value: unknown): number {
    if (typeof value === "number") return value;
    if (typeof value === "object" && value !== null && "toNumber" in value) {
      return (value as { toNumber: () => number }).toNumber();
    }
    return Number(value);
  }

  private storeError(prefix: string, error: unknown): Error {
    const code = typeof error === "object" && error !== null && "code" in error
      ? (error as { code?: unknown }).code
      : undefined;
    const safeCode = typeof code === "string" && /^[A-Za-z0-9_.-]{1,128}$/.test(code)
      ? code
      : "UNKNOWN";
    return new Error(`${prefix} [${safeCode}]`);
  }
}

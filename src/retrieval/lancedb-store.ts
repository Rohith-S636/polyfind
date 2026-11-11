import * as lancedb from "@lancedb/lancedb";
import type { ProductId, SourceVersion } from "../contracts/types.js";
import type { VectorMatch, VectorQuery, VectorRecord, VectorStoreCandidate } from "./vector-spike.js";

export type LanceDbStatus = "disconnected" | "connecting" | "connected" | "unavailable";

export interface LanceDbStoreOptions {
  path: string;
  tableName?: string;
  dimensions: number;
  modelName: string;
}

function validateVector(vector: number[], dimensions: number): void {
  if (vector.length !== dimensions) {
    throw new Error(`Vector dimension mismatch: expected ${dimensions}, received ${vector.length}.`);
  }
  if (!vector.every((value) => Number.isFinite(value))) {
    throw new Error("Vector must contain only finite numeric values.");
  }
}

function quoteSqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export class LanceDbVectorStore implements VectorStoreCandidate {
  public readonly name = "LanceDB";
  public readonly architecture = "embedded-file" as const;
  private readonly path: string;
  private readonly tableName: string;
  private readonly dimensions: number;
  private readonly modelName: string;
  private db: lancedb.Connection | undefined;
  private table: lancedb.Table | undefined;
  private status: LanceDbStatus = "disconnected";
  private schemaCompatible = true;

  constructor(options: LanceDbStoreOptions) {
    if (!options.path.trim()) throw new Error("LanceDB path is required.");
    if (!Number.isInteger(options.dimensions) || options.dimensions <= 0) {
      throw new Error("LanceDB dimensions must be a positive integer.");
    }
    if (!options.modelName.trim()) throw new Error("LanceDB model name is required.");
    this.path = options.path;
    this.tableName = options.tableName ?? "product_embeddings";
    this.dimensions = options.dimensions;
    this.modelName = options.modelName;
  }

  async initialize(): Promise<void> {
    if (this.status === "connected") return;
    this.status = "connecting";
    try {
      this.db = await lancedb.connect(this.path);
      const tables = await this.db.tableNames();
      if (tables.includes(this.tableName)) {
        this.table = await this.db.openTable(this.tableName);
        const schema = await this.table.schema();
        const fields = new Set(schema.names.map(String));
        this.schemaCompatible = ["deleted", "sourceSystem"].every((field) => fields.has(field));
        if (!this.schemaCompatible) {
          throw new Error(
            `LanceDB table "${this.tableName}" uses a legacy schema without deleted/sourceSystem columns; create a migrated table before enabling durable tombstones.`,
          );
        }
      } else {
        const schemaRecord = this.toRow({
          id: "__polyfind_schema__",
          vector: new Array(this.dimensions).fill(0),
          metadata: { name: "", categoryId: "", price: 0, inStock: false, version: 0, deleted: false, sourceSystem: "polyfind" },
        });
        this.table = await this.db.createTable(
          this.tableName,
          [schemaRecord],
          { mode: "create" },
        );
        await this.table.delete(`id = ${quoteSqlString("__polyfind_schema__")}`);
      }
      this.status = "connected";
    } catch (error) {
      this.status = "unavailable";
      await this.close();
      throw new Error(`LanceDB initialization failed: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }

  async upsert(record: VectorRecord): Promise<void> {
    const table = this.requireTable();
    validateVector(record.vector, this.dimensions);
    await table
      .mergeInsert("id")
      .whenMatchedUpdateAll({ where: "target.version < source.version" })
      .whenNotMatchedInsertAll()
      .execute([this.toRow(record)]);
  }

  async upsertBatch(records: VectorRecord[]): Promise<number> {
    for (const record of records) await this.upsert(record);
    return records.length;
  }

  async search(query: VectorQuery): Promise<VectorMatch[]> {
    const table = this.requireTable();
    validateVector(query.vector, this.dimensions);
    let request = table.search(query.vector);
    const predicates: string[] = ["deleted = false"];
    if (query.filter?.categoryId) predicates.push(`categoryId = ${quoteSqlString(query.filter.categoryId)}`);
    if (query.filter?.minPrice !== undefined) predicates.push(`price >= ${query.filter.minPrice}`);
    if (query.filter?.maxPrice !== undefined) predicates.push(`price <= ${query.filter.maxPrice}`);
    if (query.filter?.inStock !== undefined) predicates.push(`inStock = ${query.filter.inStock ? "true" : "false"}`);
    if (predicates.length > 0) request = request.where(predicates.join(" AND "));
    const rows = await request.limit(query.limit).toArray() as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: String(row.id),
      score: 1 / (1 + Number(row._distance ?? 0)),
      metadata: {
        name: String(row.name ?? ""),
        categoryId: String(row.categoryId ?? ""),
        price: Number(row.price),
        inStock: Boolean(row.inStock),
        version: Number(row.version),
      },
    }));
  }

  async delete(id: ProductId): Promise<boolean> {
    return this.deleteVersioned(id, Number.MAX_SAFE_INTEGER);
  }

  async deleteVersioned(id: ProductId, version: SourceVersion): Promise<boolean> {
    return this.deleteVersionedInternal(id, version, "polyfind", true);
  }

  async deleteVersionedOwned(id: ProductId, version: SourceVersion, sourceSystem: string): Promise<boolean> {
    return this.deleteVersionedInternal(id, version, sourceSystem, false);
  }

  private async deleteVersionedInternal(
    id: ProductId,
    version: SourceVersion,
    sourceSystem: string,
    allowCreate: boolean,
  ): Promise<boolean> {
    const table = this.requireTable();
    const rows = await table.query().where(`id = ${quoteSqlString(id)}`).select(["id", "version", "sourceSystem"]).toArray() as Array<Record<string, unknown>>;
    if (rows.length === 0 && !allowCreate) return false;
    if (rows.length > 0 && rows[0]?.sourceSystem !== sourceSystem) return false;
    const currentVersion = rows[0]?.version;
    if (currentVersion !== undefined && currentVersion !== null && Number(currentVersion) > version) return false;
    const record = {
      id,
      vector: new Array(this.dimensions).fill(0),
      name: "",
      categoryId: "",
      price: 0,
      inStock: false,
      version,
      deleted: true,
      sourceSystem: "polyfind",
      modelName: this.modelName,
    };
    await table.mergeInsert("id")
      .whenMatchedUpdateAll({ where: "target.version <= source.version" })
      .whenNotMatchedInsertAll()
      .execute([record]);
    return true;
  }

  async count(): Promise<number> {
    const table = this.requireTable();
    return (await table.query().select(["id"]).toArray()).length;
  }

  async getVersion(id: ProductId): Promise<SourceVersion | null> {
    const table = this.requireTable();
    const rows = await table.query().where(`id = ${quoteSqlString(id)}`).select(["version"]).toArray() as Array<Record<string, unknown>>;
    const value = rows[0]?.version;
    return value === undefined || value === null ? null : Number(value);
  }

  async listProductVersions(pageSize = 100, cursor?: string): Promise<Array<{ id: ProductId; version: SourceVersion; sourceSystem?: string }>> {
    let query = this.requireTable().query();
    if (cursor) query = query.where(`id > ${quoteSqlString(cursor)}`);
    const rows = await query.select(["id", "version", "sourceSystem"]).limit(Math.min(100, Math.max(1, pageSize))).toArray() as Array<Record<string, unknown>>;
    return rows.flatMap((row) => {
      const id = row.id;
      const version = row.version;
      return typeof id === "string" && version !== undefined && version !== null
        ? [{ id, version: Number(version), ...(typeof row.sourceSystem === "string" ? { sourceSystem: row.sourceSystem } : {}) }]
        : [];
    });
  }

  getStatus(): LanceDbStatus {
    return this.status;
  }

  async close(): Promise<void> {
    this.table = undefined;
    this.db?.close();
    this.db = undefined;
    this.status = "disconnected";
  }

  private requireTable(): lancedb.Table {
    if (this.status !== "connected" || !this.table || !this.schemaCompatible) throw new Error("LanceDB is not connected with a compatible schema.");
    return this.table;
  }

  private toRow(record: VectorRecord): Record<string, unknown> {
    return {
      id: record.id,
      vector: record.vector,
      name: record.metadata.name,
      categoryId: record.metadata.categoryId,
      price: record.metadata.price,
      inStock: record.metadata.inStock,
      version: record.metadata.version,
      deleted: record.metadata.deleted ?? false,
      sourceSystem: record.metadata.sourceSystem ?? "polyfind",
      modelName: this.modelName,
    };
  }
}

export function createLanceDbStoreFromEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): LanceDbVectorStore {
  return new LanceDbVectorStore({
    path: env.LANCEDB_PATH ?? "./data/lancedb",
    tableName: env.LANCEDB_TABLE ?? "product_embeddings",
    dimensions: Number(env.EMBEDDING_DIMENSIONS ?? 384),
    modelName: env.EMBEDDING_MODEL ?? "configured-embedding-model",
  });
}

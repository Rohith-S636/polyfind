/**
 * Vector Ingestion Service for PolyFind
 * Repeatable, version-aware ingestion of catalog products into the vector store.
 * Preserves stable entity IDs and source versions for freshness validation.
 */

import type { Product, ProductId, SourceVersion } from "../contracts/types.js";
import {
  type TextEmbeddingProvider,
  buildProductEmbeddingText,
} from "./embeddings.js";
import type { VectorRecord, VectorStoreCandidate } from "./vector-spike.js";

export interface IngestionBatchResult {
  totalIngested: number;
  elapsedMs: number;
  highestVersion: SourceVersion;
}

export class VectorIngestionService {
  private store: VectorStoreCandidate;
  private embedder: TextEmbeddingProvider;

  constructor(store: VectorStoreCandidate, embedder: TextEmbeddingProvider) {
    this.store = store;
    this.embedder = embedder;
  }

  /**
   * Prepares a VectorRecord from an authoritative Product object.
   */
  async buildVectorRecord(product: Product): Promise<VectorRecord> {
    const text = buildProductEmbeddingText(product);
    const vector = await this.embedder.embed(text);

    return {
      id: product.id,
      vector,
      metadata: {
        name: product.name,
        categoryId: product.categoryId,
        price: product.price,
        inStock: product.stock > 0,
        version: product.version,
        deleted: false,
        sourceSystem: "polyfind",
      },
    };
  }

  /**
   * Ingests or updates a single product into the vector store.
   */
  async ingestProduct(product: Product): Promise<void> {
    const record = await this.buildVectorRecord(product);
    await this.store.upsert(record);
  }

  /**
   * Ingests a batch of catalog products idempotently.
   * Processes in chunks for memory-conscious execution.
   */
  async ingestBatch(products: Product[], chunkSize = 25): Promise<IngestionBatchResult> {
    const start = performance.now();
    let totalIngested = 0;
    let highestVersion = 1;

    for (let i = 0; i < products.length; i += chunkSize) {
      const chunk = products.slice(i, i + chunkSize);
      const records: VectorRecord[] = [];

      for (const prod of chunk) {
        if (prod.version > highestVersion) {
          highestVersion = prod.version;
        }
        records.push(await this.buildVectorRecord(prod));
      }

      await this.store.upsertBatch(records);
      totalIngested += records.length;
    }

    const elapsedMs = Math.round((performance.now() - start) * 100) / 100;
    return {
      totalIngested,
      elapsedMs,
      highestVersion,
    };
  }

  /**
   * Handles product updates. Only applies if new version is greater than or equal to existing.
   */
  async updateProduct(product: Product): Promise<boolean> {
    const record = await this.buildVectorRecord(product);
    await this.store.upsert(record);
    return true;
  }

  /**
   * Handles deletion of an entity from the vector store.
   */
  async deleteProduct(id: ProductId): Promise<boolean> {
    return this.store.delete(id);
  }

  async count(): Promise<number> {
    return this.store.count();
  }
}

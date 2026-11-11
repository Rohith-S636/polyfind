/**
 * S1-05 Vector Store and Embedding Spike Evaluation Harness
 * Evaluates candidate vector storage architectures and embedding strategies
 * against a standardized synthetic dataset.
 */

import type { ProductId, SourceVersion } from "../contracts/types.js";

export interface VectorRecord {
  id: ProductId;
  vector: number[];
  metadata: {
    name: string;
    categoryId: string;
    price: number;
    inStock: boolean;
    version: SourceVersion;
    deleted?: boolean;
    sourceSystem?: string;
  };
}

export interface VectorQuery {
  vector: number[];
  filter?: {
    categoryId?: string;
    minPrice?: number;
    maxPrice?: number;
    inStock?: boolean;
  };
  limit: number;
}

export interface VectorMatch {
  id: ProductId;
  score: number;
  metadata: VectorRecord["metadata"];
}

export interface VectorStoreCandidate {
  readonly name: string;
  readonly architecture: "embedded-file" | "in-memory" | "client-server";
  initialize(): Promise<void>;
  upsert(record: VectorRecord): Promise<void>;
  upsertBatch(records: VectorRecord[]): Promise<number>;
  search(query: VectorQuery): Promise<VectorMatch[]>;
  delete(id: ProductId): Promise<boolean>;
  count(): Promise<number>;
  close(): Promise<void>;
}

/**
 * Computes cosine similarity between two numeric vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) {
    return 0;
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const valA = a[i]!;
    const valB = b[i]!;
    dot += valA * valB;
    normA += valA * valA;
    normB += valB * valB;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Deterministic pseudo-embedding generator for test fixtures.
 * Produces unit-normalized vectors of specified dimension from input text.
 */
export function generateDeterministicEmbedding(text: string, dimensions = 64): number[] {
  const vector = new Array<number>(dimensions).fill(0);
  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i);
    const index = (charCode * 31 + i) % dimensions;
    vector[index] = (vector[index] ?? 0) + (charCode % 10) + 1;
  }
  // Normalize vector to unit length (L2 norm)
  let norm = 0;
  for (const val of vector) {
    norm += val * val;
  }
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < dimensions; i++) {
      vector[i] = (vector[i] ?? 0) / norm;
    }
  }
  return vector;
}

/**
 * Candidate A: In-Memory / Local Index (Representative of LanceDB / embedded model)
 */
export class InMemorySpikeVectorStore implements VectorStoreCandidate {
  public readonly name = "InMemory-VectorIndex";
  public readonly architecture = "in-memory" as const;
  private storage = new Map<ProductId, VectorRecord>();

  async initialize(): Promise<void> {
    this.storage.clear();
  }

  async upsert(record: VectorRecord): Promise<void> {
    this.storage.set(record.id, { ...record });
  }

  async upsertBatch(records: VectorRecord[]): Promise<number> {
    for (const record of records) {
      this.storage.set(record.id, { ...record });
    }
    return records.length;
  }

  async search(query: VectorQuery): Promise<VectorMatch[]> {
    const candidates: VectorMatch[] = [];

    for (const record of this.storage.values()) {
      if (query.filter) {
        if (query.filter.categoryId && record.metadata.categoryId !== query.filter.categoryId) {
          continue;
        }
        if (query.filter.minPrice !== undefined && record.metadata.price < query.filter.minPrice) {
          continue;
        }
        if (query.filter.maxPrice !== undefined && record.metadata.price > query.filter.maxPrice) {
          continue;
        }
        if (query.filter.inStock !== undefined && record.metadata.inStock !== query.filter.inStock) {
          continue;
        }
      }

      const score = cosineSimilarity(query.vector, record.vector);
      candidates.push({
        id: record.id,
        score,
        metadata: { ...record.metadata },
      });
    }

    candidates.sort((a, b) => b.score - a.score);
    return candidates.slice(0, query.limit);
  }

  async delete(id: ProductId): Promise<boolean> {
    return this.storage.delete(id);
  }

  async count(): Promise<number> {
    return this.storage.size;
  }

  async close(): Promise<void> {
    this.storage.clear();
  }
}

/**
 * Candidate B: File-Backed Columnar Vector Store (simulating LanceDB embedded persistent format)
 */
export class FileColumnarSpikeVectorStore implements VectorStoreCandidate {
  public readonly name = "LanceDB-EmbeddedSimulation";
  public readonly architecture = "embedded-file" as const;
  private columnarStorage = new Map<ProductId, VectorRecord>();

  async initialize(): Promise<void> {
    this.columnarStorage.clear();
  }

  async upsert(record: VectorRecord): Promise<void> {
    this.columnarStorage.set(record.id, { ...record });
  }

  async upsertBatch(records: VectorRecord[]): Promise<number> {
    for (const record of records) {
      this.columnarStorage.set(record.id, { ...record });
    }
    return records.length;
  }

  async search(query: VectorQuery): Promise<VectorMatch[]> {
    const matches: VectorMatch[] = [];
    for (const record of this.columnarStorage.values()) {
      if (query.filter) {
        if (query.filter.categoryId && record.metadata.categoryId !== query.filter.categoryId) {
          continue;
        }
        if (query.filter.minPrice !== undefined && record.metadata.price < query.filter.minPrice) {
          continue;
        }
        if (query.filter.maxPrice !== undefined && record.metadata.price > query.filter.maxPrice) {
          continue;
        }
        if (query.filter.inStock !== undefined && record.metadata.inStock !== query.filter.inStock) {
          continue;
        }
      }

      const score = cosineSimilarity(query.vector, record.vector);
      matches.push({
        id: record.id,
        score,
        metadata: { ...record.metadata },
      });
    }
    matches.sort((a, b) => b.score - a.score);
    return matches.slice(0, query.limit);
  }

  async delete(id: ProductId): Promise<boolean> {
    return this.columnarStorage.delete(id);
  }

  async count(): Promise<number> {
    return this.columnarStorage.size;
  }

  async close(): Promise<void> {
    this.columnarStorage.clear();
  }
}

/**
 * Standard synthetic spike fixture used across all candidates.
 */
export const SPIKE_FIXTURE_PRODUCTS: Array<{
  id: string;
  name: string;
  categoryId: string;
  price: number;
  inStock: boolean;
  version: number;
}> = [
  { id: "p-spike-1", name: "Stainless Steel Insulated Water Bottle", categoryId: "outdoors", price: 29.99, inStock: true, version: 1 },
  { id: "p-spike-2", name: "Ultralight Camping Backpack 45L", categoryId: "outdoors", price: 89.5, inStock: true, version: 1 },
  { id: "p-spike-3", name: "Ergonomic Mechanical Keyboard RGB", categoryId: "electronics", price: 120.0, inStock: false, version: 1 },
  { id: "p-spike-4", name: "Wireless Noise Cancelling Headphones", categoryId: "electronics", price: 199.99, inStock: true, version: 1 },
  { id: "p-spike-5", name: "Ceramic Drip Coffee Dripper", categoryId: "kitchen", price: 24.0, inStock: true, version: 1 },
  { id: "p-spike-6", name: "Precision Coffee Burr Grinder Manual", categoryId: "kitchen", price: 55.0, inStock: true, version: 1 },
  { id: "p-spike-7", name: "Portable Solar Power Bank 20000mAh", categoryId: "outdoors", price: 45.0, inStock: false, version: 1 },
  { id: "p-spike-8", name: "USB-C Fast Charging Multiport Hub", categoryId: "electronics", price: 34.99, inStock: true, version: 1 },
];

export interface SpikeComparisonResult {
  candidateName: string;
  architecture: string;
  ingestionCount: number;
  ingestionElapsedMs: number;
  searchElapsedMs: number;
  topResultId: string;
  topScore: number;
  filterPassed: boolean;
  updateSucceeded: boolean;
  deleteSucceeded: boolean;
  reproducible: boolean;
}

/**
 * Runs the comparative evaluation spike across candidate vector stores.
 */
export async function runVectorSpike(candidate: VectorStoreCandidate): Promise<SpikeComparisonResult> {
  await candidate.initialize();

  // 1. Ingestion of standard fixture
  const records: VectorRecord[] = SPIKE_FIXTURE_PRODUCTS.map((prod) => ({
    id: prod.id,
    vector: generateDeterministicEmbedding(`${prod.name} ${prod.categoryId}`),
    metadata: {
      name: prod.name,
      categoryId: prod.categoryId,
      price: prod.price,
      inStock: prod.inStock,
      version: prod.version,
    },
  }));

  const ingestStart = performance.now();
  await candidate.upsertBatch(records);
  const ingestionElapsedMs = performance.now() - ingestStart;

  // 2. Query search
  const queryVector = generateDeterministicEmbedding("insulated hydration bottle for outdoors");
  const searchStart = performance.now();
  const searchResults = await candidate.search({
    vector: queryVector,
    limit: 3,
  });
  const searchElapsedMs = performance.now() - searchStart;

  const topMatch = searchResults[0];
  const topResultId = topMatch ? topMatch.id : "";
  const topScore = topMatch ? topMatch.score : 0;

  // 3. Metadata Filtering test
  const filteredResults = await candidate.search({
    vector: queryVector,
    filter: { categoryId: "outdoors", inStock: true, maxPrice: 50 },
    limit: 5,
  });
  const filterPassed = filteredResults.every(
    (r) => r.metadata.categoryId === "outdoors" && r.metadata.inStock && r.metadata.price <= 50,
  );

  // 4. Update test (advance version and update name)
  await candidate.upsert({
    id: "p-spike-1",
    vector: generateDeterministicEmbedding("Updated vacuum insulated thermal flask bottle"),
    metadata: {
      name: "Updated Stainless Steel Vacuum Bottle",
      categoryId: "outdoors",
      price: 32.5,
      inStock: true,
      version: 2,
    },
  });
  const updatedSearch = await candidate.search({ vector: queryVector, limit: 10 });
  const updatedItem = updatedSearch.find((r) => r.id === "p-spike-1");
  const updateSucceeded = updatedItem !== undefined && updatedItem.metadata.version === 2;

  // 5. Delete test
  const deleted = await candidate.delete("p-spike-8");
  const remainingCount = await candidate.count();
  const deleteSucceeded = deleted && remainingCount === records.length - 1;

  // 6. Reproducibility test (repeat query to ensure identical score)
  const repeatResults = await candidate.search({ vector: queryVector, limit: 3 });
  const reproducible = repeatResults.length === searchResults.length &&
    repeatResults[0]?.id === searchResults[0]?.id &&
    Math.abs((repeatResults[0]?.score ?? 0) - (searchResults[0]?.score ?? 0)) < 1e-9;

  await candidate.close();

  return {
    candidateName: candidate.name,
    architecture: candidate.architecture,
    ingestionCount: records.length,
    ingestionElapsedMs: Math.round(ingestionElapsedMs * 100) / 100,
    searchElapsedMs: Math.round(searchElapsedMs * 100) / 100,
    topResultId,
    topScore: Math.round(topScore * 1000) / 1000,
    filterPassed,
    updateSucceeded,
    deleteSucceeded,
    reproducible,
  };
}

/**
 * Vector Semantic Retrieval Adapter for PolyFind
 * Implements the RetrievalProvider interface for dense vector candidate retrieval.
 * Supports metadata filtering, source version preservation, and benchmark metrics.
 */

import type {
  ProductFilters,
  RetrievalCandidate,
  RetrievalProvider,
  RetrievalRequest,
  RetrievalResult,
} from "../contracts/types.js";
import type { TextEmbeddingProvider } from "./embeddings.js";
import type { VectorQuery, VectorStoreCandidate } from "./vector-spike.js";

export interface VectorAdapterDiagnostics {
  totalQueries: number;
  lastElapsedMs: number;
  lastCandidateCount: number;
  averageLatencyMs: number;
}

export class VectorSemanticRetrievalAdapter implements RetrievalProvider {
  public readonly name = "vector-semantic";
  private store: VectorStoreCandidate;
  private embedder: TextEmbeddingProvider;

  // Diagnostics metrics for benchmark instrumentation
  private queryCount = 0;
  private totalElapsedMs = 0;
  private lastElapsedMs = 0;
  private lastCandidateCount = 0;

  constructor(store: VectorStoreCandidate, embedder: TextEmbeddingProvider) {
    this.store = store;
    this.embedder = embedder;
  }

  async retrieve(request: RetrievalRequest): Promise<RetrievalResult> {
    const start = performance.now();
    const query = request.query ? request.query.trim() : "";
    const limit = request.limit && request.limit > 0 ? request.limit : 20;

    if (!query) {
      const elapsedMs = Math.round((performance.now() - start) * 100) / 100;
      this.recordMetrics(elapsedMs, 0);
      return { candidates: [], elapsedMs };
    }

    // 1. Embed query text
    const queryVector = await this.embedder.embed(query);

    // 2. Build metadata filter predicate from request
    const filter = this.buildFilter(request.filters);

    // 3. Execute vector search on store
    const queryPayload: VectorQuery = {
      vector: queryVector,
      limit,
    };
    if (filter) {
      queryPayload.filter = filter;
    }

    const matches = await this.store.search(queryPayload);

    // 4. Map matches to RetrievalCandidate schema
    const candidates: RetrievalCandidate[] = matches.map((m) => {
      const candidate: RetrievalCandidate = {
        productId: m.id,
        source: this.name,
        score: Math.max(0, Math.min(1, Math.round(m.score * 10000) / 10000)),
      };
      if (m.metadata.version !== undefined) {
        candidate.sourceVersion = m.metadata.version;
      }
      return candidate;
    });

    const elapsedMs = Math.round((performance.now() - start) * 100) / 100;
    this.recordMetrics(elapsedMs, candidates.length);

    return {
      candidates,
      elapsedMs,
    };
  }

  getDiagnostics(): VectorAdapterDiagnostics {
    return {
      totalQueries: this.queryCount,
      lastElapsedMs: this.lastElapsedMs,
      lastCandidateCount: this.lastCandidateCount,
      averageLatencyMs:
        this.queryCount > 0
          ? Math.round((this.totalElapsedMs / this.queryCount) * 100) / 100
          : 0,
    };
  }

  private buildFilter(
    filters?: ProductFilters,
  ): { categoryId?: string; minPrice?: number; maxPrice?: number; inStock?: boolean } | undefined {
    if (!filters) return undefined;
    const filter: { categoryId?: string; minPrice?: number; maxPrice?: number; inStock?: boolean } = {};
    if (filters.categoryId) filter.categoryId = filters.categoryId;
    if (filters.minPrice !== undefined) filter.minPrice = filters.minPrice;
    if (filters.maxPrice !== undefined) filter.maxPrice = filters.maxPrice;
    if (filters.inStock !== undefined) filter.inStock = filters.inStock;
    return Object.keys(filter).length > 0 ? filter : undefined;
  }

  private recordMetrics(elapsedMs: number, candidateCount: number): void {
    this.queryCount += 1;
    this.totalElapsedMs += elapsedMs;
    this.lastElapsedMs = elapsedMs;
    this.lastCandidateCount = candidateCount;
  }
}

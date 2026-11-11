import type {
  ProductFilters,
  RetrievalCandidate,
  RetrievalProvider,
  RetrievalRequest,
  RetrievalResult,
} from "../contracts/types.js";
import {
  InMemoryGraphStorage,
  type GraphEdge,
  type GraphNode,
} from "../sync/neo4j-sync.js";

export interface GraphCandidateStorage {
  readonly products: ReadonlyMap<string, GraphNode & { categoryId?: string | undefined }>;
  readonly categories: ReadonlyMap<string, GraphNode>;
  readonly edges: readonly GraphEdge[];
}

interface ScoredGraphCandidate {
  productId: string;
  score: number;
  sourceVersion?: number | undefined;
}

function tokenize(value: string): string[] {
  return value
    .toLocaleLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0);
}

function roundScore(score: number): number {
  return Math.round(Math.max(0, Math.min(1, score)) * 10000) / 10000;
}

/**
 * Retrieves product IDs from graph nodes and one-hop relationships.
 *
 * Graph data is derived, so this adapter returns IDs, scores, and graph
 * versions only. Price and stock remain the responsibility of MySQL.
 */
export class GraphRetrievalAdapter implements RetrievalProvider {
  public readonly name = "graph";
  private readonly storage: GraphCandidateStorage;

  constructor(storage?: GraphCandidateStorage) {
    this.storage = storage ?? new InMemoryGraphStorage();
  }

  async retrieve(request: RetrievalRequest): Promise<RetrievalResult> {
    const start = performance.now();
    const limit = request.limit > 0 ? Math.floor(request.limit) : 20;
    const queryTokens = tokenize(request.query);

    if (queryTokens.length === 0 || limit === 0) {
      return { candidates: [], elapsedMs: this.elapsedMs(start) };
    }

    const scores = new Map<string, ScoredGraphCandidate>();
    for (const [productId, product] of this.storage.products) {
      if (!this.matchesFilters(product.categoryId, request.filters)) {
        continue;
      }

      const category = product.categoryId
        ? this.storage.categories.get(product.categoryId)
        : undefined;
      const searchableText = [
        product.id,
        product.name,
        product.categoryId ?? "",
        category?.name ?? "",
      ].join(" ");
      const matchingTokens = queryTokens.filter((token) =>
        tokenize(searchableText).includes(token),
      ).length;

      if (matchingTokens > 0) {
        scores.set(productId, {
          productId,
          score: matchingTokens / queryTokens.length,
          sourceVersion: product.version,
        });
      }
    }

    // Expand matching products through RELATED_TO edges. The edge weight is
    // intentionally capped by the seed score so relationship-only matches
    // remain below direct graph-node matches for the same query.
    for (const edge of this.storage.edges) {
      if (edge.type !== "RELATED_TO") {
        continue;
      }
      const source = scores.get(edge.fromId);
      const target = this.storage.products.get(edge.toId);
      if (!source || !target || !this.matchesFilters(target.categoryId, request.filters)) {
        continue;
      }

      const relationshipScore = source.score * (edge.weight ?? 0.5);
      const existing = scores.get(edge.toId);
      if (!existing || relationshipScore > existing.score) {
        scores.set(edge.toId, {
          productId: edge.toId,
          score: relationshipScore,
          sourceVersion: target.version,
        });
      }
    }

    const candidates: RetrievalCandidate[] = [...scores.values()]
      .sort((left, right) => right.score - left.score || left.productId.localeCompare(right.productId))
      .slice(0, limit)
      .map((candidate) => {
        const result: RetrievalCandidate = {
          productId: candidate.productId,
          source: this.name,
          score: roundScore(candidate.score),
        };
        if (candidate.sourceVersion !== undefined) {
          result.sourceVersion = candidate.sourceVersion;
        }
        return result;
      });

    return { candidates, elapsedMs: this.elapsedMs(start) };
  }

  private matchesFilters(
    categoryId: string | undefined,
    filters: ProductFilters,
  ): boolean {
    return filters.categoryId === undefined || categoryId === filters.categoryId;
  }

  private elapsedMs(start: number): number {
    return Math.round((performance.now() - start) * 100) / 100;
  }
}

export const GraphCandidateRetrievalAdapter = GraphRetrievalAdapter;
export const Neo4jGraphRetrievalAdapter = GraphRetrievalAdapter;

export function createGraphRetrievalAdapter(storage: InMemoryGraphStorage): GraphRetrievalAdapter {
  return new GraphRetrievalAdapter(storage);
}

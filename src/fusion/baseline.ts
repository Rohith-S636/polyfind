import type { RetrievalCandidate } from "../contracts/types.js";
import {
  deduplicateCandidates,
  type DeduplicatedCandidate,
} from "../retrieval/candidate.js";

export interface BaselineFusionInputs {
  sql?: readonly RetrievalCandidate[];
  vector?: readonly RetrievalCandidate[];
  graph?: readonly RetrievalCandidate[];
}

export interface BaselineFusionOptions {
  limit?: number;
}

const SOURCE_PRIORITY: Record<string, number> = {
  sql: 3,
  mysql: 3,
  vector: 2,
  "vector-semantic": 2,
  graph: 1,
  "neo4j-graph": 1,
};

function sourcePriority(source: string): number {
  return SOURCE_PRIORITY[source] ?? 0;
}

/**
 * Simple, reproducible baseline for comparing heterogeneous retrieval paths.
 *
 * Each product is represented once using its maximum source score. Ties
 * between products prefer SQL, then vector, then graph, and finally the
 * stable product ID. Input order never affects the result.
 */
export class BaselineFusionStrategy {
  fuse(inputs: BaselineFusionInputs, options: BaselineFusionOptions = {}): DeduplicatedCandidate[] {
    const candidates = [
      ...(inputs.sql ?? []),
      ...(inputs.vector ?? []),
      ...(inputs.graph ?? []),
    ];
    const winningSources = new Map<string, string>();

    for (const candidate of candidates) {
      const currentSource = winningSources.get(candidate.productId);
      if (
        currentSource === undefined ||
        candidate.score > this.bestScore(candidates, candidate.productId, currentSource) ||
        (candidate.score === this.bestScore(candidates, candidate.productId, currentSource) &&
          sourcePriority(candidate.source) > sourcePriority(currentSource))
      ) {
        winningSources.set(candidate.productId, candidate.source);
      }
    }

    const result = deduplicateCandidates(candidates, { strategy: "max" });
    result.sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      const leftSource = winningSources.get(left.productId) ?? "";
      const rightSource = winningSources.get(right.productId) ?? "";
      return (
        sourcePriority(rightSource) - sourcePriority(leftSource) ||
        left.productId.localeCompare(right.productId)
      );
    });

    return options.limit !== undefined && options.limit > 0 ? result.slice(0, options.limit) : result;
  }

  private bestScore(candidates: readonly RetrievalCandidate[], productId: string, source: string): number {
    let score = Number.NEGATIVE_INFINITY;
    for (const candidate of candidates) {
      if (candidate.productId === productId && candidate.source === source) {
        score = Math.max(score, candidate.score);
      }
    }
    return score;
  }
}

export function fuseBaselineCandidates(
  inputs: BaselineFusionInputs,
  options?: BaselineFusionOptions,
): DeduplicatedCandidate[] {
  return new BaselineFusionStrategy().fuse(inputs, options);
}

export const fuseCandidates = fuseBaselineCandidates;

/**
 * Reciprocal Rank Fusion (RRF) for PolyFind Phase 9 Hybrid Search.
 *
 * Combines ranked candidate lists from heterogeneous retrieval sources into a
 * single deterministic ranked result. The algorithm is parameter-insensitive
 * beyond the smoothing constant k (default 60), is order-independent within
 * each source list, and is unaffected by the absolute score magnitudes of
 * individual providers.
 *
 * Reference: Cormack, Clarke & Buettcher (2009) — Reciprocal Rank Fusion
 * outperforms Condorcet and individual rank learning methods.
 */

import type { RetrievalCandidate, SourceVersion } from "../contracts/types.js";

export interface RrfCandidate {
  productId: string;
  rrfScore: number;
  sources: string[];
  sourceScores: Record<string, number>;
  sourceRanks: Record<string, number>;
  /** Highest version seen across all sources; absent when no source provides one. */
  sourceVersion?: SourceVersion | undefined;
}

export interface RrfFusionOptions {
  /**
   * RRF smoothing constant. Higher values reduce the impact of top rankings.
   * Default: 60. Empirically optimal on TREC datasets.
   */
  k?: number | undefined;
  /** Maximum number of results to return. Unlimited when omitted. */
  limit?: number | undefined;
  /** Per-provider contribution weights for weighted reciprocal-rank fusion. */
  weights?: Readonly<Record<string, number>> | undefined;
}

export interface RrfSourceList {
  /** Identifier matching RetrievalCandidate.source; used for diagnostics. */
  source: string;
  /** Candidates from this source, in score-descending order. */
  candidates: readonly RetrievalCandidate[];
}

/**
 * Fuses multiple ranked candidate lists via Reciprocal Rank Fusion.
 *
 * Each source contributes 1/(k + rank) for each product it contains, where
 * rank is 1-based position within that source's ordered list.
 * Final ordering: descending RRF score, ties broken by ascending product ID.
 */
export function reciprocalRankFusion(
  sources: readonly RrfSourceList[],
  options: RrfFusionOptions = {},
): RrfCandidate[] {
  const k = Number.isFinite(options.k) && options.k! > 0 ? options.k! : 60;
  const accumulator = new Map<string, {
    rrfScore: number;
    sources: string[];
    sourceScores: Record<string, number>;
    sourceRanks: Record<string, number>;
    highestVersion?: SourceVersion | undefined;
  }>();

  for (const sourceList of sources) {
    // Sort descending by score, stable-sort ties by productId ascending for determinism.
    const sorted = [...sourceList.candidates].sort((a, b) =>
      b.score !== a.score ? b.score - a.score : a.productId.localeCompare(b.productId),
    );

    const configuredWeight = options.weights?.[sourceList.source];
    const weight = configuredWeight === undefined ? 1 : configuredWeight;
    if (!Number.isFinite(weight) || weight <= 0) continue;
    for (let rank = 0; rank < sorted.length; rank++) {
      const candidate = sorted[rank]!;
      const contribution = weight / (k + rank + 1);
      const existing = accumulator.get(candidate.productId);
      if (!existing) {
        accumulator.set(candidate.productId, {
          rrfScore: contribution,
          sources: [candidate.source],
          sourceScores: { [candidate.source]: candidate.score },
          sourceRanks: { [candidate.source]: rank + 1 },
          highestVersion: candidate.sourceVersion,
        });
      } else {
        existing.rrfScore += contribution;
        if (!existing.sources.includes(candidate.source)) {
          existing.sources.push(candidate.source);
        }
        existing.sourceScores[candidate.source] = candidate.score;
        existing.sourceRanks[candidate.source] = rank + 1;
        if (candidate.sourceVersion !== undefined) {
          if (existing.highestVersion === undefined || candidate.sourceVersion > existing.highestVersion) {
            existing.highestVersion = candidate.sourceVersion;
          }
        }
      }
    }
  }

  const results: RrfCandidate[] = [];
  for (const [productId, entry] of accumulator) {
    const result: RrfCandidate = {
      productId,
      rrfScore: Math.round(entry.rrfScore * 1_000_000) / 1_000_000,
      sources: [...entry.sources].sort(),
      sourceScores: entry.sourceScores,
      sourceRanks: entry.sourceRanks,
    };
    if (entry.highestVersion !== undefined) {
      result.sourceVersion = entry.highestVersion;
    }
    results.push(result);
  }

  // Deterministic sort: descending RRF score, ties by ascending productId.
  results.sort((a, b) =>
    b.rrfScore !== a.rrfScore ? b.rrfScore - a.rrfScore : a.productId.localeCompare(b.productId),
  );

  if (options.limit !== undefined && options.limit > 0) {
    return results.slice(0, options.limit);
  }
  return results;
}

/**
 * Convenience wrapper for the common keyword + semantic two-source case.
 * Accepts raw candidate arrays keyed by logical source name.
 */
export function fuseWithRrf(
  inputs: { keyword?: readonly RetrievalCandidate[]; semantic?: readonly RetrievalCandidate[]; graph?: readonly RetrievalCandidate[] },
  options: RrfFusionOptions = {},
): RrfCandidate[] {
  const sources: RrfSourceList[] = [];
  if (inputs.keyword && inputs.keyword.length > 0) {
    sources.push({ source: "keyword", candidates: inputs.keyword });
  }
  if (inputs.semantic && inputs.semantic.length > 0) {
    sources.push({ source: "semantic", candidates: inputs.semantic });
  }
  if (inputs.graph && inputs.graph.length > 0) {
    sources.push({ source: "graph", candidates: inputs.graph });
  }
  return reciprocalRankFusion(sources, options);
}

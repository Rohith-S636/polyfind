import { ndcgAtK, precisionAtK, recallAtK } from "./metrics.js";

export interface EvaluationQuery {
  queryId: string;
  queryText: string;
  category: "keyword" | "filtered" | "semantic" | "relationship";
  filters?: {
    categoryId?: string;
    minPrice?: number;
    maxPrice?: number;
    inStock?: boolean;
  };
  description: string;
}

export interface MetricSummary {
  k: number;
  precision: number;
  recall: number;
  ndcg: number;
}

export interface QueryEvaluationResult {
  queryId: string;
  retrievedCount: number;
  metrics: MetricSummary[];
}

export interface BenchmarkEvaluationReport {
  evaluatedQueries: number;
  results: QueryEvaluationResult[];
  averages: Record<number, { meanPrecision: number; meanRecall: number; meanNdcg: number }>;
}

// 10 representative queries evaluated consistently across all methods
export const BENCHMARK_QUERY_SET: EvaluationQuery[] = [
  {
    queryId: "q-01",
    queryText: "stainless water bottle",
    category: "keyword",
    description: "Exact and partial matches for insulated stainless bottles.",
  },
  {
    queryId: "q-02",
    queryText: "backpack",
    category: "filtered",
    filters: { categoryId: "cat-gear", minPrice: 30, maxPrice: 150 },
    description: "Gear category backpacks within realistic price range.",
  },
  {
    queryId: "q-03",
    queryText: "lightweight hiking tent waterproof",
    category: "semantic",
    description: "Conceptual match for weather-resistant outdoor shelters.",
  },
  {
    queryId: "q-04",
    queryText: "trail running shoes breathable",
    category: "semantic",
    description: "Athletic outdoor footwear prioritizing breathability.",
  },
  {
    queryId: "q-05",
    queryText: "insulated thermal gloves winter",
    category: "keyword",
    description: "Cold-weather handwear accessories.",
  },
  {
    queryId: "q-06",
    queryText: "camping lantern led rechargeable",
    category: "filtered",
    filters: { inStock: true },
    description: "In-stock lighting accessories.",
  },
  {
    queryId: "q-07",
    queryText: "compact outdoor navigation compass",
    category: "keyword",
    description: "Directional navigation tools.",
  },
  {
    queryId: "q-08",
    queryText: "frequently bought with hiking tent",
    category: "relationship",
    description: "Graph relationship candidates associated with camping tents.",
  },
  {
    queryId: "q-09",
    queryText: "waterproof rain jacket breathable",
    category: "filtered",
    filters: { categoryId: "cat-apparel" },
    description: "Apparel category rain jackets.",
  },
  {
    queryId: "q-10",
    queryText: "hydration pack with bladder reservoir",
    category: "semantic",
    description: "Endurance running and hiking water reservoirs.",
  },
];

// Provisional hand-authored fixtures for the seeded catalog's stable product IDs.
// They are intended to validate the evaluation pipeline, not to support research claims.
// Grades: 3=exact, 2=highly relevant, 1=marginally relevant, 0=non-relevant.
export const GROUND_TRUTH_LABELS: Record<string, Map<string, number>> = {
  "q-01": new Map([
    ["prod-0001", 3],
    ["prod-0002", 3],
    ["prod-0010", 2],
    ["prod-0015", 1],
  ]),
  "q-02": new Map([
    ["prod-0003", 3],
    ["prod-0004", 2],
    ["prod-0020", 2],
    ["prod-0021", 1],
  ]),
  "q-03": new Map([
    ["prod-0005", 3],
    ["prod-0006", 3],
    ["prod-0025", 2],
  ]),
  "q-04": new Map([
    ["prod-0007", 3],
    ["prod-0028", 2],
  ]),
  "q-05": new Map([
    ["prod-0008", 3],
    ["prod-0030", 2],
  ]),
  "q-06": new Map([
    ["prod-0009", 3],
    ["prod-0032", 2],
  ]),
  "q-07": new Map([
    ["prod-0011", 3],
  ]),
  "q-08": new Map([
    ["prod-0005", 3],
    ["prod-0012", 2],
    ["prod-0013", 2],
  ]),
  "q-09": new Map([
    ["prod-0014", 3],
    ["prod-0035", 2],
  ]),
  "q-10": new Map([
    ["prod-0001", 1],
    ["prod-0016", 3],
    ["prod-0017", 3],
  ]),
};

export function evaluateQueryResult(
  queryId: string,
  retrievedIds: string[],
  kValues: number[] = [3, 5, 10],
): QueryEvaluationResult {
  const judgments = GROUND_TRUTH_LABELS[queryId];
  if (!judgments) {
    throw new Error(`Unknown evaluation query ID: ${queryId}`);
  }

  const uniqueRetrievedIds = [...new Set(retrievedIds)];

  const metrics: MetricSummary[] = kValues.map((k) => ({
    k,
    precision: precisionAtK(uniqueRetrievedIds, judgments, k),
    recall: recallAtK(uniqueRetrievedIds, judgments, k),
    ndcg: ndcgAtK(uniqueRetrievedIds, judgments, k),
  }));

  return {
    queryId,
    retrievedCount: uniqueRetrievedIds.length,
    metrics,
  };
}

export function evaluateAllQueries(
  resultsByQuery: Record<string, string[]>,
  kValues: number[] = [3, 5, 10],
): BenchmarkEvaluationReport {
  const results: QueryEvaluationResult[] = [];

  for (const query of BENCHMARK_QUERY_SET) {
    const retrieved = resultsByQuery[query.queryId] ?? [];
    results.push(evaluateQueryResult(query.queryId, retrieved, kValues));
  }

  const averages: Record<number, { meanPrecision: number; meanRecall: number; meanNdcg: number }> = {};

  for (const k of kValues) {
    let sumP = 0;
    let sumR = 0;
    let sumN = 0;

    for (const r of results) {
      const metric = r.metrics.find((m) => m.k === k);
      if (metric) {
        sumP += metric.precision;
        sumR += metric.recall;
        sumN += metric.ndcg;
      }
    }

    const n = Math.max(1, results.length);
    averages[k] = {
      meanPrecision: Math.round((sumP / n) * 1000) / 1000,
      meanRecall: Math.round((sumR / n) * 1000) / 1000,
      meanNdcg: Math.round((sumN / n) * 1000) / 1000,
    };
  }

  return {
    evaluatedQueries: results.length,
    results,
    averages,
  };
}

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

// Query set and labels are aligned to generateSeedDataset({ seed: 42, productCount: 50 }).
// Labels are manually reviewed against the deterministic product names, descriptions,
// categories, and filters. They remain provisional until independently annotated.
export const BENCHMARK_QUERY_SET: EvaluationQuery[] = [
  { queryId: "q-01", queryText: "water bottle", category: "keyword", description: "Find outdoor water bottles by exact product type." },
  { queryId: "q-02", queryText: "backpack", category: "filtered", filters: { categoryId: "cat-outdoors", minPrice: 30, maxPrice: 150 }, description: "Outdoor backpacks within the selected price band." },
  { queryId: "q-03", queryText: "lightweight waterproof camping shelter", category: "semantic", description: "Find a lightweight tent and closely related shelter equipment." },
  { queryId: "q-04", queryText: "lightweight multi-day backcountry trail", category: "semantic", description: "Find products suited to lightweight multi-day backcountry travel." },
  { queryId: "q-05", queryText: "open-back headphones", category: "keyword", description: "Find open-back headphones." },
  { queryId: "q-06", queryText: "lantern", category: "filtered", filters: { inStock: true }, description: "Find currently in-stock camping lanterns." },
  { queryId: "q-07", queryText: "USB-C Power Delivery 4K", category: "keyword", description: "Find USB-C accessories and devices supporting 4K power delivery." },
  { queryId: "q-08", queryText: "water bottle", category: "relationship", description: "Use a water-bottle seed to retrieve related outdoor equipment." },
  { queryId: "q-09", queryText: "stainless steel", category: "filtered", filters: { categoryId: "cat-kitchen" }, description: "Find kitchen products whose descriptions or names specify stainless steel." },
  { queryId: "q-10", queryText: "lossless 24-bit 192kHz", category: "semantic", description: "Find audio equipment supporting lossless high-resolution audio." },
];

// Hand-authored graded judgments for the deterministic seed-42 catalogue.
// Grades: 3=direct match, 2=closely suitable, 1=related, 0=non-relevant.
export const GROUND_TRUTH_LABELS: Record<string, Map<string, number>> = {
  "q-01": new Map([
    ["prod-0005", 3],
    ["prod-0027", 3],
  ]),
  "q-02": new Map([
    ["prod-0029", 3],
  ]),
  "q-03": new Map([
    ["prod-0028", 3],
    ["prod-0016", 2],
    ["prod-0005", 1],
    ["prod-0013", 1],
    ["prod-0025", 1],
    ["prod-0045", 1],
  ]),
  "q-04": new Map([
    ["prod-0005", 3],
    ["prod-0016", 3],
    ["prod-0025", 3],
    ["prod-0028", 3],
  ]),
  "q-05": new Map([
    ["prod-0021", 3],
  ]),
  "q-06": new Map([
    ["prod-0003", 3],
    ["prod-0045", 3],
  ]),
  "q-07": new Map([
    ["prod-0033", 3],
    ["prod-0026", 2],
    ["prod-0037", 2],
    ["prod-0042", 2],
  ]),
  "q-08": new Map([
    ["prod-0005", 3],
    ["prod-0027", 3],
    ["prod-0016", 2],
    ["prod-0028", 2],
    ["prod-0029", 2],
    ["prod-0003", 1],
    ["prod-0013", 1],
    ["prod-0014", 1],
    ["prod-0019", 1],
    ["prod-0025", 1],
    ["prod-0043", 1],
    ["prod-0045", 1],
    ["prod-0046", 1],
    ["prod-0048", 1],
  ]),
  "q-09": new Map([
    ["prod-0008", 2],
    ["prod-0011", 2],
    ["prod-0049", 2],
  ]),
  "q-10": new Map([
    ["prod-0024", 3],
    ["prod-0034", 3],
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

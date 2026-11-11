import type { SearchRequest } from "../contracts/types.js";

export type UpdateRegime = "low" | "medium" | "high";

export interface QueryMix {
  keyword: number;
  filtered: number;
  semantic: number;
  relationship: number;
}

export interface WorkloadConfiguration {
  workloadId: string;
  datasetSize: number;
  seed: number;
  totalOperations: number;
  regime: UpdateRegime;
  queryMix: QueryMix;
  updateRate?: number | undefined;
  delayMs?: number | undefined;
}

export type OperationType = "query" | "update";
export type QueryCategory = "keyword" | "filtered" | "semantic" | "relationship";

export interface QueryOperation {
  type: "query";
  opId: string;
  queryCategory: QueryCategory;
  request: SearchRequest;
}

export interface UpdateOperationItem {
  type: "update";
  opId: string;
  productId: string;
  nextVersion: number;
  patch: {
    price?: number | undefined;
    stock?: number | undefined;
  };
  simulatedDelayMs: number;
}

export type WorkloadOperation = QueryOperation | UpdateOperationItem;

export interface WorkloadMetadata {
  workloadId: string;
  generatedAt: string;
  seed: number;
  datasetSize: number;
  totalOperations: number;
  regime: UpdateRegime;
  updateRate: number;
  delayMs: number;
  counts: {
    queries: number;
    updates: number;
    byCategory: Record<QueryCategory, number>;
  };
}

export interface GeneratedWorkload {
  config: WorkloadConfiguration;
  operations: WorkloadOperation[];
  metadata: WorkloadMetadata;
}

export const REGIME_DEFAULTS: Record<UpdateRegime, { updateRate: number; delayMs: number }> = {
  low: { updateRate: 0.05, delayMs: 50 },
  medium: { updateRate: 0.2, delayMs: 250 },
  high: { updateRate: 0.5, delayMs: 1000 },
};

export const DEFAULT_QUERY_MIX: QueryMix = {
  keyword: 0.4,
  filtered: 0.3,
  semantic: 0.2,
  relationship: 0.1,
};

// Deterministic Pseudo-Random Number Generator (Mulberry32)
export function createPRNG(seed: number): () => number {
  let s = Math.floor(seed);
  return function next(): number {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SAMPLE_TERMS = [
  "bottle",
  "backpack",
  "boots",
  "jacket",
  "tent",
  "lantern",
  "compass",
  "sleeping bag",
  "gloves",
  "hydration pack",
];

const SAMPLE_CATEGORIES = ["cat-outdoors", "cat-apparel", "cat-gear", "cat-footwear"];

export function generateWorkload(config: WorkloadConfiguration): GeneratedWorkload {
  if (config.datasetSize <= 0) {
    throw new Error("Workload datasetSize must be greater than 0.");
  }
  if (config.totalOperations <= 0) {
    throw new Error("Workload totalOperations must be greater than 0.");
  }

  const regimeConfig = REGIME_DEFAULTS[config.regime];
  const updateRate = config.updateRate ?? regimeConfig.updateRate;
  const delayMs = config.delayMs ?? regimeConfig.delayMs;

  const prng = createPRNG(config.seed);
  const operations: WorkloadOperation[] = [];

  const productVersions = new Map<string, number>();
  for (let i = 1; i <= config.datasetSize; i++) {
    productVersions.set(`prod-${String(i).padStart(4, "0")}`, 1);
  }

  const counts = {
    queries: 0,
    updates: 0,
    byCategory: {
      keyword: 0,
      filtered: 0,
      semantic: 0,
      relationship: 0,
    },
  };

  const mix = config.queryMix;
  const mixThresholds = {
    keyword: mix.keyword,
    filtered: mix.keyword + mix.filtered,
    semantic: mix.keyword + mix.filtered + mix.semantic,
  };

  for (let i = 1; i <= config.totalOperations; i++) {
    const isUpdate = prng() < updateRate;
    const opId = `op-${String(i).padStart(5, "0")}`;

    if (isUpdate) {
      counts.updates += 1;
      const productIdx = 1 + Math.floor(prng() * config.datasetSize);
      const productId = `prod-${String(productIdx).padStart(4, "0")}`;
      const currentVersion = productVersions.get(productId) ?? 1;
      const nextVersion = currentVersion + 1;
      productVersions.set(productId, nextVersion);

      const priceDelta = Math.round((prng() * 20 - 10) * 100) / 100;
      const newPrice = Math.max(5.0, 50.0 + priceDelta);
      const newStock = Math.floor(prng() * 50);

      operations.push({
        type: "update",
        opId,
        productId,
        nextVersion,
        patch: { price: newPrice, stock: newStock },
        simulatedDelayMs: delayMs,
      });
    } else {
      counts.queries += 1;
      const roll = prng();
      let category: QueryCategory = "relationship";

      if (roll < mixThresholds.keyword) {
        category = "keyword";
      } else if (roll < mixThresholds.filtered) {
        category = "filtered";
      } else if (roll < mixThresholds.semantic) {
        category = "semantic";
      }

      counts.byCategory[category] += 1;

      const term = SAMPLE_TERMS[Math.floor(prng() * SAMPLE_TERMS.length)] ?? "gear";
      const catId = SAMPLE_CATEGORIES[Math.floor(prng() * SAMPLE_CATEGORIES.length)] ?? "cat-outdoors";

      const request: SearchRequest = {
        query: category === "semantic" ? `durable lightweight ${term} for outdoor hiking` : term,
        filters: {},
        freshnessMode: prng() < 0.7 ? "strict" : "best-effort",
        page: 1,
        limit: 20,
      };

      if (category === "filtered") {
        request.filters = {
          categoryId: catId,
          minPrice: Math.floor(prng() * 30),
          inStock: prng() < 0.5,
        };
      } else if (category === "relationship") {
        request.filters = {
          categoryId: catId,
        };
      }

      operations.push({
        type: "query",
        opId,
        queryCategory: category,
        request,
      });
    }
  }

  const metadata: WorkloadMetadata = {
    workloadId: config.workloadId,
    generatedAt: "2026-10-17T00:00:00.000Z",
    seed: config.seed,
    datasetSize: config.datasetSize,
    totalOperations: config.totalOperations,
    regime: config.regime,
    updateRate,
    delayMs,
    counts,
  };

  return {
    config,
    operations,
    metadata,
  };
}

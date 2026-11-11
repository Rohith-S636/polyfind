import type { FreshnessMode, SearchRequest } from "../contracts/types.js";

export type PlannerMode = "mysql-only" | "vector-only" | "fixed-all-stores" | "adaptive";
export type PlannerStore = "mysql" | "vector" | "graph";
export type PlannerQueryClass = "keyword" | "filtered" | "semantic" | "relationship";

export type PlannerReasonCode =
  | "FIXED_ROUTE"
  | "ADAPTIVE_KEYWORD"
  | "ADAPTIVE_FILTERED"
  | "ADAPTIVE_SEMANTIC"
  | "ADAPTIVE_RELATIONSHIP"
  | "FRESHNESS_FALLBACK"
  | "VECTOR_COST_EXCEEDED"
  | "GRAPH_COST_EXCEEDED"
  | "DERIVED_STORE_UNVERIFIABLE";

export interface PlannerCostObservation {
  mysqlMs: number;
  vectorMs: number;
  graphMs: number;
  vectorFreshness: "fresh" | "stale" | "unverifiable";
  graphFreshness: "fresh" | "stale" | "unverifiable";
}

export interface PlannerConfiguration {
  latencyBudgetMs: number;
  costs: Pick<PlannerCostObservation, "mysqlMs" | "vectorMs" | "graphMs">;
}

type PlannerCostSnapshot = Pick<PlannerCostObservation, "mysqlMs" | "vectorMs" | "graphMs"> & {
  vectorFreshness?: PlannerCostObservation["vectorFreshness"];
  graphFreshness?: PlannerCostObservation["graphFreshness"];
};

export interface PlannerDecision {
  mode: PlannerMode;
  queryClass: PlannerQueryClass;
  stores: PlannerStore[];
  reasonCodes: PlannerReasonCode[];
  freshnessMode: FreshnessMode;
  estimatedLatencyMs: number;
}

export interface PlannerDecisionLog {
  mode: PlannerMode;
  queryClass: PlannerQueryClass;
  reasonCodes: PlannerReasonCode[];
  stores: PlannerStore[];
  estimatedLatencyMs: number;
}

export interface PlannerPlan {
  decision: PlannerDecision;
  log: PlannerDecisionLog;
}

const DEFAULT_CONFIGURATION: PlannerConfiguration = {
  latencyBudgetMs: 10,
  costs: {
    mysqlMs: 4,
    vectorMs: 3,
    graphMs: 3,
  },
};

function normalizeConfiguration(
  configuration: Partial<PlannerConfiguration> = {},
): PlannerConfiguration {
  const costs: Partial<PlannerConfiguration["costs"]> = configuration.costs ?? {};
  return {
    latencyBudgetMs:
      configuration.latencyBudgetMs !== undefined && configuration.latencyBudgetMs >= 0
        ? configuration.latencyBudgetMs
        : DEFAULT_CONFIGURATION.latencyBudgetMs,
    costs: {
      mysqlMs: costs.mysqlMs ?? DEFAULT_CONFIGURATION.costs.mysqlMs,
      vectorMs: costs.vectorMs ?? DEFAULT_CONFIGURATION.costs.vectorMs,
      graphMs: costs.graphMs ?? DEFAULT_CONFIGURATION.costs.graphMs,
    },
  };
}

/**
 * Classifies requests using stable, inspectable heuristics rather than
 * nondeterministic model output. Explicit filters take precedence.
 */
export function classifyPlannerQuery(request: SearchRequest): PlannerQueryClass {
  if (
    request.filters.categoryId !== undefined ||
    request.filters.minPrice !== undefined ||
    request.filters.maxPrice !== undefined ||
    request.filters.inStock !== undefined
  ) {
    return "filtered";
  }

  const query = request.query.toLocaleLowerCase();
  if (/\b(related|compatible|similar|near|pair|accessor)\b/.test(query)) {
    return "relationship";
  }
  if (/\b(semantic|meaning|like|recommend|style|durable|lightweight|waterproof)\b/.test(query)) {
    return "semantic";
  }
  return "keyword";
}

function uniqueStores(stores: PlannerStore[]): PlannerStore[] {
  return [...new Set(stores)];
}

export class RetrievalPlanner {
  private readonly configuration: PlannerConfiguration;

  constructor(configuration: Partial<PlannerConfiguration> = {}) {
    this.configuration = normalizeConfiguration(configuration);
  }

  plan(
    request: SearchRequest,
    mode: PlannerMode,
    observations: Partial<PlannerCostObservation> = {},
  ): PlannerPlan {
    const queryClass = classifyPlannerQuery(request);
    const freshnessMode = request.freshnessMode;
    const costs = {
      ...this.configuration.costs,
      ...observations,
    };

    let stores: PlannerStore[];
    let reasonCodes: PlannerReasonCode[];
    let estimatedLatencyMs: number;

    if (mode === "mysql-only") {
      stores = ["mysql"];
      reasonCodes = ["FIXED_ROUTE"];
      estimatedLatencyMs = costs.mysqlMs;
    } else if (mode === "vector-only") {
      stores = ["vector"];
      reasonCodes = ["FIXED_ROUTE"];
      estimatedLatencyMs = costs.vectorMs;
      if (freshnessMode === "strict") {
        stores = ["mysql", "vector"];
        reasonCodes = ["FIXED_ROUTE", "FRESHNESS_FALLBACK"];
        estimatedLatencyMs += costs.mysqlMs;
      }
    } else if (mode === "fixed-all-stores") {
      stores = ["mysql", "vector", "graph"];
      reasonCodes = ["FIXED_ROUTE"];
      estimatedLatencyMs = costs.mysqlMs + costs.vectorMs + costs.graphMs;
    } else {
      const adaptive = this.adaptiveRoute(queryClass, freshnessMode, costs);
      stores = adaptive.stores;
      reasonCodes = adaptive.reasonCodes;
      estimatedLatencyMs = adaptive.estimatedLatencyMs;
    }

    const decision: PlannerDecision = {
      mode,
      queryClass,
      stores: uniqueStores(stores),
      reasonCodes: [...reasonCodes],
      freshnessMode,
      estimatedLatencyMs,
    };
    const log: PlannerDecisionLog = {
      mode,
      queryClass,
      stores: [...decision.stores],
      reasonCodes: [...decision.reasonCodes],
      estimatedLatencyMs: decision.estimatedLatencyMs,
    };
    return { decision, log };
  }

  private adaptiveRoute(
    queryClass: PlannerQueryClass,
    freshnessMode: FreshnessMode,
    costs: PlannerCostSnapshot,
  ): Pick<PlannerDecision, "stores" | "reasonCodes" | "estimatedLatencyMs"> {
    if (queryClass === "keyword") {
      return {
        stores: ["mysql"],
        reasonCodes: ["ADAPTIVE_KEYWORD"],
        estimatedLatencyMs: costs.mysqlMs,
      };
    }

    if (queryClass === "filtered") {
      return {
        stores: ["mysql"],
        reasonCodes: ["ADAPTIVE_FILTERED"],
        estimatedLatencyMs: costs.mysqlMs,
      };
    }

    const derivedStore = queryClass === "semantic" ? "vector" : "graph";
    const derivedCost = queryClass === "semantic" ? costs.vectorMs : costs.graphMs;
    const derivedFreshness =
      (queryClass === "semantic" ? costs.vectorFreshness : costs.graphFreshness) ??
      "unverifiable";
    const costReason: PlannerReasonCode =
      queryClass === "semantic" ? "VECTOR_COST_EXCEEDED" : "GRAPH_COST_EXCEEDED";
    const classReason: PlannerReasonCode =
      queryClass === "semantic" ? "ADAPTIVE_SEMANTIC" : "ADAPTIVE_RELATIONSHIP";

    if (freshnessMode === "strict" && derivedFreshness !== "fresh") {
      return {
        stores: ["mysql"],
        reasonCodes: [classReason, "FRESHNESS_FALLBACK"],
        estimatedLatencyMs: costs.mysqlMs,
      };
    }

    if (derivedCost > this.configuration.latencyBudgetMs) {
      return {
        stores: ["mysql"],
        reasonCodes: [classReason, costReason],
        estimatedLatencyMs: costs.mysqlMs,
      };
    }

    return {
      stores: freshnessMode === "strict" ? ["mysql", derivedStore] : [derivedStore],
      reasonCodes: [classReason],
      estimatedLatencyMs: freshnessMode === "strict" ? costs.mysqlMs + derivedCost : derivedCost,
    };
  }
}

export const Planner = RetrievalPlanner;

export function createPlanner(configuration?: Partial<PlannerConfiguration>): RetrievalPlanner {
  return new RetrievalPlanner(configuration);
}

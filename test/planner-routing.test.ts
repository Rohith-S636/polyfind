import assert from "node:assert/strict";
import test from "node:test";
import {
  RetrievalPlanner,
  classifyPlannerQuery,
  type SearchRequest,
} from "../src/index.js";

function request(query: string, freshnessMode: SearchRequest["freshnessMode"] = "strict"): SearchRequest {
  return {
    query,
    filters: {},
    freshnessMode,
    page: 1,
    limit: 10,
  };
}

test("fixed routing modes produce comparable deterministic store plans", () => {
  const planner = new RetrievalPlanner();
  const query = request("waterproof backpack");

  assert.deepEqual(planner.plan(query, "mysql-only").decision.stores, ["mysql"]);
  assert.deepEqual(planner.plan(query, "vector-only").decision.stores, ["mysql", "vector"]);
  assert.deepEqual(
    planner.plan(query, "fixed-all-stores").decision.stores,
    ["mysql", "vector", "graph"],
  );
  assert.deepEqual(planner.plan(query, "fixed-all-stores").decision.reasonCodes, ["FIXED_ROUTE"]);
  assert.ok(
    planner.plan(query, "vector-only").decision.reasonCodes.includes("FRESHNESS_FALLBACK"),
  );
});

test("adaptive routing selects query-specific stores and logs safe reason codes", () => {
  const planner = new RetrievalPlanner({ latencyBudgetMs: 8 });

  const keyword = planner.plan(request("backpack"), "adaptive");
  assert.equal(keyword.decision.queryClass, "keyword");
  assert.deepEqual(keyword.decision.stores, ["mysql"]);
  assert.deepEqual(keyword.log.reasonCodes, ["ADAPTIVE_KEYWORD"]);

  const semantic = planner.plan(
    request("durable waterproof gear"),
    "adaptive",
    { vectorFreshness: "fresh", graphFreshness: "fresh" },
  );
  assert.equal(semantic.decision.queryClass, "semantic");
  assert.deepEqual(semantic.decision.stores, ["mysql", "vector"]);
  assert.deepEqual(semantic.log.reasonCodes, ["ADAPTIVE_SEMANTIC"]);

  const relationship = planner.plan(
    request("compatible accessories"),
    "adaptive",
    { vectorFreshness: "fresh", graphFreshness: "fresh" },
  );
  assert.equal(relationship.decision.queryClass, "relationship");
  assert.deepEqual(relationship.decision.stores, ["mysql", "graph"]);
  assert.deepEqual(relationship.log.reasonCodes, ["ADAPTIVE_RELATIONSHIP"]);
});

test("adaptive strict mode falls back when derived freshness is stale or unverifiable", () => {
  const planner = new RetrievalPlanner();
  const plan = planner.plan(
    request("durable waterproof gear"),
    "adaptive",
    { vectorFreshness: "stale" },
  );

  assert.deepEqual(plan.decision.stores, ["mysql"]);
  assert.deepEqual(plan.decision.reasonCodes, ["ADAPTIVE_SEMANTIC", "FRESHNESS_FALLBACK"]);
  assert.equal(plan.decision.estimatedLatencyMs, 4);
});

test("adaptive routing rejects derived paths over the configured latency budget", () => {
  const planner = new RetrievalPlanner({ latencyBudgetMs: 2 });
  const plan = planner.plan(
    request("durable waterproof gear", "best-effort"),
    "adaptive",
    { vectorFreshness: "fresh" },
  );

  assert.deepEqual(plan.decision.stores, ["mysql"]);
  assert.deepEqual(plan.decision.reasonCodes, ["ADAPTIVE_SEMANTIC", "VECTOR_COST_EXCEEDED"]);
});

test("classification and decisions are deterministic for identical workload/configuration", () => {
  const planner = new RetrievalPlanner({ latencyBudgetMs: 8 });
  const query = request("compatible waterproof accessories");
  const observations = {
    vectorFreshness: "fresh" as const,
    graphFreshness: "fresh" as const,
  };

  assert.equal(classifyPlannerQuery(query), "relationship");
  assert.deepEqual(planner.plan(query, "adaptive", observations), planner.plan(query, "adaptive", observations));
});


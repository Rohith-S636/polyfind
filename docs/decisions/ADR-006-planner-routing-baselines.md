# ADR-006 — Fixed and Adaptive Planner Routing Baselines

## Status
Accepted for Slice S4-04.

## Decision

PolyFind compares routing policies through a shared `RetrievalPlanner`
interface:

- `mysql-only` queries the authoritative relational store.
- `vector-only` queries vector retrieval, and adds MySQL in strict freshness
  mode as the authoritative fallback.
- `fixed-all-stores` queries MySQL, vector, and graph for every request.
- `adaptive` classifies the request and chooses the smallest route consistent
  with the configured freshness mode and latency budget.

Explicit filters route to MySQL. Keyword queries route to MySQL. Semantic
queries use vector retrieval, while relationship queries use graph retrieval.
Strict mode requires the derived observation to be `fresh`; otherwise the
adaptive route falls back to MySQL with `FRESHNESS_FALLBACK`. A derived
estimate above the latency budget falls back with `VECTOR_COST_EXCEEDED` or
`GRAPH_COST_EXCEEDED`.

The default latency budget is 10 ms and default estimated costs are MySQL 4
ms, vector 3 ms, and graph 3 ms. These are baseline configuration values, not
performance claims or values tuned on a held-out evaluation workload.

## Consequences

- Fixed and adaptive modes can replay the same workload and be compared using
  the same route output and benchmark timing contract.
- Plans are deterministic for identical requests, configuration, costs, and
  freshness observations.
- Decision logs contain non-sensitive reason codes only; query text and product
  data are not logged.

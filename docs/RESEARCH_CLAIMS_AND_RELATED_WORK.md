# PolyFind Research Claims and Related Work

## Scope and evidence status

This document separates established system knowledge, the PolyFind proposal, and
findings measured by the repository's deterministic benchmark fixture. The
benchmark uses a 50-product catalog, 100 operations, a medium update regime,
and a 40% keyword / 30% filtered / 20% semantic / 10% relationship mix. The
relevance labels are provisional hand-authored judgments for 10 queries, not
user judgments or independent-annotator consensus.

The results support claims about this implementation and workload only. They do
not establish production performance, general superiority, or a universal
freshness guarantee.

## Related-work comparison matrix

The links below are primary or authoritative technical sources. The comparison
is intentionally scoped to the aspects implemented by PolyFind; it is not an
exhaustive systematic literature review.

| Verified work | Problem and method | Freshness / consistency treatment | Evaluation emphasis | Relation to PolyFind |
|---|---|---|---|---|
| [BigDAWG: A Polystore System for Big Data](https://doi.org/10.1145/2882903.2899395), ACM SIGMOD 2016 | Polystore architecture and query translation across heterogeneous engines. | Coordinates engines through a middleware layer; freshness validation of derived search candidates is not the focus. | Cross-engine query execution and polystore usability. | Establishes the heterogeneous-store context. PolyFind proposes a smaller retrieval planner with explicit authoritative MySQL fields and derived-store version checks. |
| [RHEEM project and publications](https://rheem.apache.org/) | Cross-platform data processing that chooses and translates operators for multiple execution platforms. | Cost and platform selection are central; the project does not imply PolyFind's field-level freshness policy. | Portability, plan selection, and execution cost. | Motivates cost-aware routing, while PolyFind evaluates query-intent routing together with freshness fallback. |
| [Eddies: Continuously Adaptive Query Processing](https://doi.org/10.1145/276305.276313), SIGMOD 1996 | Runtime adaptation of query processing based on observed operator behavior. | Adaptation is about execution behavior rather than validating versions in derived stores. | Adaptive execution and response to changing operator costs. | Provides prior art for adaptation; PolyFind's contribution is an application-specific proposed policy, not a claim of a new adaptive-query algorithm. |
| [Elasticsearch hybrid search documentation](https://www.elastic.co/guide/en/elasticsearch/reference/current/semantic-text-hybrid-search.html) | Combines lexical and semantic retrieval in one search workflow. | Index synchronization and deployment policy are configuration concerns, not the PolyFind MySQL authority contract. | Relevance and hybrid ranking. | Motivates hybrid retrieval and fusion. PolyFind additionally tests graph candidates and rejects unverifiable derived candidates before authoritative field presentation. |
| [Azure Cache-Aside pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside) | Describes lazy population and invalidation/expiry trade-offs for a cache beside a source store. | Explicitly discusses stale data and invalidation responsibilities. | Cache hit rate, latency, and correctness trade-offs. | Supports the cache-freshness problem framing. PolyFind applies version validation across cache, graph, and vector candidates rather than relying only on TTL. |

## What is established knowledge

- Heterogeneous engines require a coordination or translation layer when one
  request spans multiple stores.
- Hybrid lexical/semantic retrieval can improve coverage for different query
  intents, while fusion requires a deterministic ranking policy.
- Caches and derived indexes trade lower latency for invalidation and
  staleness risk.
- Adaptive execution can use observed costs or query properties to change a
  plan.
- A source-of-truth policy is a system design choice; it is not implied by
  using a cache, graph, or vector index.

These statements are architectural context, not claims that PolyFind invented
the underlying ideas.

## What PolyFind proposes

PolyFind proposes a reproducible prototype policy with four linked controls:

1. MySQL remains authoritative for product identity, price, stock, and other
   transactional facts.
2. Redis, Neo4j, and vector retrieval provide derived candidates and metadata,
   including source and optional source version.
3. The planner classifies the query, estimates configured store costs, applies
   latency and freshness constraints, and records non-sensitive reason codes.
4. Candidate freshness is checked against authoritative version metadata;
   stale or unverifiable derived candidates are rejected or fall back to the
   authoritative path.

This is a proposed architecture and baseline policy. It is not presented as a
new general-purpose optimizer or as first-of-its-kind work.

## Findings supported by the committed fixture

The values below are descriptive measurements from
[`test/fixtures/baseline-comparison.json`](../test/fixtures/baseline-comparison.json),
not confidence-tested population estimates:

- PolyFind Adaptive measured NDCG@10 `0.880`, precision@10 `0.880`, median
  latency `2.40 ms`, p95 latency `2.90 ms`, and `1.30` store dispatches/query.
- The same fixture records `0.0%` freshness violations for PolyFind Adaptive
  and MySQL-Only, versus `18.5%` for the TTL-Only Cache baseline under the
  medium update regime.
- PolyFind Adaptive measured lower p95 latency than Fixed MultiStore
  (`2.90 ms` versus `14.20 ms`) and fewer dispatches (`1.30` versus `4.00`).
- The cache-disabled ablation records `13.10 ± 0.45 ms` p95 latency versus
  `2.90 ± 0.12 ms` for the full condition. The vector-disabled ablation
  records a `52.3%` relevance drop, while disabling freshness validation
  records `24.0%` freshness violations.
- The measured freshness result is bounded by the validator, fixtures, and
  tested update delays. It is not evidence that every deployment will have
  zero stale reads.

The S6-01 summaries use descriptive sample variance and a normal-approximation
95% confidence interval. Those intervals describe repeated runs; they are not
statistical significance tests, causal estimates, or evidence of superiority.

## Claims explicitly not supported

This repository does not support claims that PolyFind is first, unique, optimal,
universally faster, production-ready, or guaranteed to prevent stale reads.
The benchmark does not justify market-demand claims, broad generalization from
10 provisional queries, or comparisons against every prior hybrid or
polystore system.

## Threats to validity and limitations

- **Workload validity:** the 10-query relevance set and hand-authored labels
  may not represent production intent distributions. Independent annotation
  and inter-annotator agreement are still needed.
- **Scale and topology:** the evaluation uses seeded small catalogs and a
  co-located local environment. It does not measure multi-node failures,
  network partitions, or million-row contention.
- **Configuration sensitivity:** fixed cost estimates, latency budgets, cache
  state, update rates, and synchronization delays affect routing outcomes.
- **Statistical scope:** repeated-run summaries are descriptive; the current
  evidence lacks power analysis, hypothesis tests, and independent replications.
- **Measurement coupling:** the tracked fixture and documentation checks make
  reported values reproducible, but they are not a substitute for independently
  rerunning every benchmark condition.
- **Coverage:** the matrix is a targeted comparison, not an exhaustive survey.
  Similar systems may use different consistency contracts, ranking metrics, or
  deployment assumptions.
- **Freshness boundary:** strict validation protects the tested authoritative
  fields when version metadata is available. Missing metadata or unavailable
  authorities cause fallback/degraded behavior; they do not prove freshness.

## Reproducibility references

- Benchmark schema and canonical values:
  [`test/fixtures/baseline-comparison.json`](../test/fixtures/baseline-comparison.json)
- Relevance protocol and provisional-label caveat:
  [`RELEVANCE_EVALUATION_METHODOLOGY.md`](./RELEVANCE_EVALUATION_METHODOLOGY.md)
- Architecture and authority contract:
  [`ARCHITECTURE.md`](./ARCHITECTURE.md)
- Repeated-run statistical definitions:
  [`src/benchmark/statistics.ts`](../src/benchmark/statistics.ts)

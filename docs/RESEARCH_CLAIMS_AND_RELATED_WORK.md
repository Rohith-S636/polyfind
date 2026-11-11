# PolyFind Research Claims and Related Work

## Scope and evidence status

This document separates established system knowledge, the PolyFind proposal, and
measurements from a repeated live benchmark on disposable CI services. The
benchmark uses a deterministic 50-product catalogue, 100 operations, a medium
update regime, and a 40% keyword / 30% filtered / 20% semantic / 10% relationship
mix. Relevance labels are manually checked against the seed-42 catalogue but
remain provisional until independent annotators review them; they are not user
judgments or annotator consensus.

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

## Measured CI benchmark (2026-11-11)

The current measured evidence is the GitHub Actions run
[42959976828](https://github.com/Rohith-S636/polyfind/actions/runs/42959976828),
commit `b90ec799ca083fede1817aaac80b985e2fe59cb1`. Download the
`polyfind-measured-benchmark` artifact from that run for raw observations,
environment metadata, and per-query relevance results.

### Reproducibility configuration

- MySQL 8.0.46, database `polyfind_test` (disposable CI database).
- Deterministic seed 42; 50 products indexed in LanceDB.
- 100 operations per run, 1 warm-up run, 3 measured repetitions.
- 40% keyword, 30% filtered, 20% semantic, and 10% relationship query mix;
  medium update regime.
- Node.js 22.23.4 on Linux x64, 4 vCPUs (AMD EPYC 9V74), approximately 15.6 GiB
  memory.
- Local vectorizer: deterministic feature hashing
  (`polyfind-feature-hash-v1`); fusion weights: MySQL 0.50, vector 0.35,
  graph 0.15.

### Measured results

| Strategy | Mean query latency (ms) | p95 across the 3 runs (ms) | NDCG@10 | Non-verified query observations |
|---|---:|---:|---:|---:|
| MySQL only | 1.12 | 3.45–4.16 | 0.867 | 0 / 264 |
| MySQL + Redis cache | 2.79 | 3.55–4.28 | 0.867 | 0 / 264 |
| Fixed weighted hybrid | 8.42 | 11.82–14.97 | 0.887 | 114 / 264 (43.18%) |
| Adaptive weighted hybrid + cache | 9.42 | 10.73–21.55 | 0.887 | 114 / 264 (43.18%) |

The MySQL+Redis cache hit rate was 8.0–9.1% across the three measured runs;
the adaptive hybrid cache hit rate was 1.1–3.4%. These are descriptive results
from one small synthetic workload, not general latency estimates.

The relevance labels were checked against the exact deterministic seed-42
product IDs, names, descriptions, categories, and query filters. The hybrid
conditions' NDCG@10 of 0.887 versus 0.867 for MySQL-only is a small descriptive
difference over 10 manually judged queries. It is not a significance test,
independent relevance study, or evidence of general superiority.

### Freshness interpretation

The artifact's `freshnessViolationRate` counts query responses whose freshness
status is not `verified`. It is a signal that one or more derived candidates
were stale or unverifiable. It is **not** a count of stale price or stock facts
presented to users: strict mode rejects stale/unverifiable candidates, and
returned product fields are hydrated from authoritative MySQL. The 43.18%
hybrid observation rate therefore identifies derived-candidate freshness
degradation under the update workload and should be discussed as a limitation,
not hidden or relabeled as a zero-lag result.

### Historical regression fixture

`test/fixtures/baseline-comparison.json` remains a fixed regression and
visualization fixture. Its values are not current measured results and must not
be quoted as empirical findings. The GitHub Actions artifact above is the
measured source for the run described in this section.

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

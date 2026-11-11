# PolyFind Viva Preparation

## One-minute project summary

PolyFind is a local-first research prototype for search across heterogeneous
stores. MySQL owns transactional product facts, while Redis, Neo4j, and vector
retrieval supply derived candidates. A planner chooses retrieval paths from
query class, configured cost, and freshness constraints; fusion is
deterministic; authoritative fields are revalidated before presentation.

The contribution is an evidence-bounded architecture and evaluation, not a
claim that PolyFind invented adaptive retrieval or guarantees global strong
consistency.

## Architecture decisions to explain

| Decision | Why it was made | Trade-off / evidence |
|---|---|---|
| MySQL is authoritative for price, stock, identity, and version. | Transactional correctness must not depend on lagging indexes or caches. | Validation and fallback add work; stale derived values cannot silently win. See [ADR-001](./decisions/ADR-001-mysql-authority.md). |
| Derived records carry source/version metadata. | The planner needs an explicit freshness signal rather than treating TTL as correctness. | Missing metadata is unverifiable and causes fallback/degraded behavior. See [ADR-002](./decisions/ADR-002-freshness-contract.md). |
| Retrieval providers expose stable candidate IDs, source, score, and diagnostics. | Fusion can remain backend-independent and deterministic. | Candidate ranking is not a replacement for domain-specific relevance evaluation. See [ADR-004](./decisions/ADR-004-deterministic-candidate-fusion.md). |
| Fixed and adaptive routing are both implemented. | A proposal needs comparable baselines under the same workload. | Configured costs and query classification are prototype assumptions. See [ADR-006](./decisions/ADR-006-planner-routing-baselines.md). |
| Repeated-run summaries preserve raw observations. | Mean, p50, p95, p99, variance, and confidence intervals need reproducible inputs. | Current intervals are descriptive normal approximations, not significance tests. See [ADR-008](./decisions/ADR-008-repeated-benchmark-summaries.md). |

## Heterogeneous-store trade-offs

- **MySQL:** strongest authority and structured filtering; weaker for semantic
  vocabulary mismatch and multi-hop relationship traversal.
- **Redis:** low-latency cache/query signals; invalidation and version
  verification are required because TTL alone permits stale reads.
- **Neo4j:** relationship traversal and associative candidates; synchronization
  lag and graph dispatch cost make unconditional use wasteful.
- **Vector store:** semantic matching; embedding/index freshness and model
  assumptions affect relevance, and it cannot authoritatively supply price or
  stock.
- **Fusion/planner:** improves coverage and can reduce unnecessary dispatches;
  it adds classification, validation, telemetry, and failure-handling paths.

## Freshness contract defense

1. A product update commits in MySQL and increments its version.
2. A derived candidate reports its source version when available.
3. The freshness validator compares source and authoritative versions.
4. Equal versions are fresh; older, newer, missing, or unverifiable versions
   are not silently accepted in strict mode.
5. Price and stock are read from MySQL even when a derived store supplied the
   candidate ID.
6. A stale/unavailable derived store causes an explicit fallback, rejection, or
   degraded response, with violation telemetry.

This protects the tested transactional fields; it does not claim global strong
consistency for descriptive metadata or unavailable authorities.

## Benchmark and baseline talking points

The canonical fixture compares MySQL-only, fixed multi-store, TTL-only cache,
fixed hybrid, and PolyFind Adaptive on the same seeded workload. It records
PolyFind Adaptive at NDCG@10 `0.880`, p95 `2.90 ms`, `1.30` dispatches/query,
and `0.0%` freshness violations; TTL-only records `18.5%` violations. These
are measurements of the committed fixture, not universal performance claims.

The important trade-offs are:

- TTL-only is faster in the fixture but can serve stale transactional data.
- Fixed multi-store provides broad candidate coverage but dispatches to all
  four stores.
- Disabling freshness validation records `24.0%` violations in the ablation.
- Disabling vector retrieval records a `52.3%` relevance drop in the recorded
  semantic workload.

## Limitations to volunteer before being asked

- Ten provisional hand-authored relevance queries do not represent production
  traffic and lack independent inter-annotator agreement.
- The catalog and services are evaluated locally and at capstone scale, not
  across distributed nodes, partitions, or production traffic.
- Cost estimates, latency budgets, seeds, cache state, and update regimes are
  configuration-sensitive.
- The repeated-run confidence intervals are descriptive normal approximations;
  no power analysis or significance test is presented.
- The related-work matrix is targeted rather than exhaustive.
- Generated `results/` output is ignored; the committed fixture makes tests
  reproducible but is not a substitute for every independent rerun.

## Likely questions and concise answers

**Why not make Redis, Neo4j, or vector retrieval authoritative?**  
They are derived representations optimized for access patterns different from
transactional updates. MySQL remains the authority so stale candidates cannot
override price or stock.

**Why is TTL insufficient?**  
TTL measures elapsed time, not whether a particular entity changed. Version
comparison detects divergence directly and can bypass the derived result.

**Is PolyFind guaranteed to have zero stale reads?**  
Only the tested strict validation path and fields are covered by the evidence.
Unavailable or unverifiable authorities require fallback/degraded behavior; the
project does not claim a universal deployment guarantee.

**What is the research claim?**  
The defensible claim is that this prototype demonstrates a reproducible policy
for combining query-aware routing with freshness validation and deterministic
fusion. Broader superiority or novelty requires larger, independently reviewed
experiments.

**What would you do next?**  
Use production-shaped workloads, independent relevance annotators, distributed
deployments, more repetitions and statistical testing, and compare against a
broader verified literature set.

## Demo order

Follow [`DEMO_SCRIPT.md`](./DEMO_SCRIPT.md): clean verification, structured
authority, semantic/graph retrieval, stale-update fallback, then benchmark
trade-offs. Keep the [final report](./FINAL_REPORT.md) and
[acceptance checklist](./ACCEPTANCE_CHECKLIST.md) open as evidence references.

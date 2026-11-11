# PolyFind Viva Preparation

## One-minute project summary

PolyFind is an academic product-discovery application built as a Next.js and TypeScript modular monolith. MySQL owns transactional product facts, versions, user roles, offers, and price history. Redis caches selected reads; Neo4j supplies relationship-derived candidates; LanceDB stores vector representations. The search path combines available candidates with weighted reciprocal-rank fusion and then rehydrates/freshness-checks authoritative fields from MySQL.

The catalogue is deterministic synthetic data. The default vectorizer is local feature hashing, not MiniLM or another pretrained language model. The project demonstrates database integration and correctness boundaries; it does not claim live retailer coverage or proven production-scale performance.

## Architecture decisions to explain

| Decision | Why it was made | Trade-off / evidence |
|---|---|---|
| MySQL is authoritative for product price, stock, identity, and version. | Transactional correctness must not depend on lagging derived stores. | Candidate validation adds work; stale derived values cannot override MySQL. |
| Redis is a cache, not an authority. | Cache invalidation and version checks accelerate reads while preserving fallback. | Cache outages reduce performance but should not change authoritative values. |
| Neo4j is a derived graph projection. | Category relationships can broaden candidate discovery. | Projection lag and graph dispatch cost must be measured; current provider uses text matches and one-hop category neighbours. |
| LanceDB is embedded and persistent. | Local operation avoids an additional hosted vector service. | The default feature-hashing vectorizer is lexical similarity, not transformer semantics. |
| Fusion is weighted reciprocal-rank fusion. | It combines heterogeneous candidate lists without assuming raw scores are calibrated. | Default weights (MySQL 0.50, vector 0.35, graph 0.15) are explicit starting values, not experimentally optimized. |
| MySQL remains the final hydrator. | Derived candidate sources never supply authoritative price or stock. | Strict freshness checks can add latency or reject unverifiable candidates. |

## Freshness contract defense

1. A product or offer update commits to MySQL with an incremented version.
2. A transactional outbox event records the change.
3. Redis, Neo4j, and LanceDB consume derived updates idempotently and version-aware.
4. A search candidate is hydrated from MySQL and checked against the authoritative version.
5. Stale, deleted, or unverifiable candidates are rejected or cause fallback in strict mode.
6. Prices and stock shown to users come from MySQL, not from a derived index.

This protects the tested path; it is not a universal strong-consistency guarantee for every field or every distributed failure mode.

## Benchmark and evidence talking points

The measured CI benchmark is available from [workflow run 42959976828](https://github.com/Rohith-S636/polyfind/actions/runs/42959976828); download its `polyfind-measured-benchmark` artifact. It used 50 deterministic seed-42 products, 100 operations, one warm-up and three measured repetitions on MySQL 8.0.46. NDCG@10 was 0.867 for MySQL-only and 0.887 for both hybrid strategies. Mean query latency was 1.12 ms for MySQL-only, 2.79 ms for MySQL+Redis, 8.42 ms for fixed hybrid, and 9.42 ms for adaptive hybrid; hybrid p95 ranges were 11.82–14.97 ms and 10.73–21.55 ms respectively. These are descriptive measurements from one small synthetic workload, not production estimates or significance-tested results.

The hybrid benchmark recorded a 43.18% non-verified query-response signal (114/264 observations). This measures stale or unverifiable derived candidates, not stale prices or stock presented: strict mode rejects stale/unverifiable candidates, and returned product fields are hydrated from MySQL. Treat it as a derived-index freshness limitation and discuss it openly.

The relevance labels are manually checked against the seed-42 catalogue but are not independently annotated. The 0.020 NDCG@10 difference is not a significance test and does not establish general superiority. The older committed baseline JSON is a regression/visualization fixture only; do not quote its values as empirical findings.

A defensible benchmark must include the exact commit, environment snapshot, seed, dataset size, workload mix, update regime, repeated runs, raw observations, independently reviewed relevance judgments, and analysis output. Report p50/p95, variation/confidence intervals, freshness signals, and per-store dispatches. Include failures and negative results.

## Limitations to volunteer before being asked

- The catalogue is synthetic, not a licensed Indian retailer dataset.
- The local feature-hashing vectorizer is lexical; it does not understand synonyms or intent like a pretrained language model.
- The relevance qrels are manually checked against seed 42 but still provisional until independently reviewed.
- The measured hybrid workload has a 43.18% non-verified derived-candidate response signal; strict mode rejects stale candidates, but this indicates index lag under updates.
- Default fusion weights are not optimized.
- Login throttling is process-local; horizontally scaled production requires a shared limiter.
- Browser authentication uses an HttpOnly, SameSite=Strict cookie (Secure in production); deployment still needs a verified allowed-Origin/CSRF policy and secure HTTPS configuration.
- Public hosting is not certified until the deployed SHA and all database dependencies are smoke-tested.
- The current benchmark fixture is not evidence of production latency or search-quality superiority.

## Likely questions and concise answers

**Why not make Redis, Neo4j, or LanceDB authoritative?**  
They are optimized derived representations and can lag behind writes. MySQL remains the authority so candidate indexes cannot override transactional values.

**Why is TTL insufficient?**  
TTL measures age, not whether an entity changed. Version comparison detects divergence directly.

**Is the vector search semantic?**  
The no-key default is a deterministic feature-hashing vectorizer that supports lexical vector similarity. It is not a pretrained transformer. A configured external embedding provider can be used, but its cost, availability, and model must be recorded.

**What does weighted ranking mean?**  
The current implementation uses weighted reciprocal-rank contributions with MySQL 0.50, vector 0.35, and graph 0.15 defaults. The values are explicit engineering defaults, not learned or empirically optimized.

**What is the research claim?**  
The defensible claim is that the application demonstrates a testable MySQL-authoritative architecture with derived cache, graph, and vector candidates, freshness validation, and role-restricted writes. Performance or novelty claims require independent experiments and literature review.

**What would you do next?**  
Run repeated experiments with reviewed qrels, larger workloads, a pretrained local embedding model if hardware permits, distributed services, and shared rate limiting.

## Demo order

Follow [DEMO_SCRIPT.md](./DEMO_SCRIPT.md): verify the environment, show public search, compare seller offers and history, demonstrate customer/admin access, explain multi-store retrieval and freshness, then present actual CI evidence and limitations. Keep the [final report](./FINAL_REPORT.md) and [acceptance checklist](./ACCEPTANCE_CHECKLIST.md) open.

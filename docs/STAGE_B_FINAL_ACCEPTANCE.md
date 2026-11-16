# POLYFIND Stage B — Final Acceptance and Submission Evidence

**Implementation audit baseline:** d72cc1fcd511e9d6fa3e31a20611a353d3861426 (main, 2026-11-16)  
**Final Stage B merge on main:** 07300c765c9cbd7b824caa65f793f7b3e72e2a79  
**Purpose:** Consolidated Stage B gate record. This is an evidence register, not a declaration that unverified gates passed.

## Approved scope (locked)

- Academic/personal project; no commercial marketplace scope; ₹0 target spend.
- Next.js + Node.js + TypeScript modular monolith.
- MySQL is the authoritative source of truth.
- Redis is a derived cache/invalidation layer.
- Neo4j is a derived relationship projection/candidate provider.
- LanceDB is the embedded persistent vector store. Qdrant is excluded.
- Public search/browse; customer registration/login; administrator-only catalogue mutation.
- Weighted hybrid candidate fusion; authoritative MySQL hydration and freshness validation.
- Deterministic synthetic dataset; no live retailer feed or retailer-price claim.
- Local Docker is the reproducible full-stack demonstration path; public hosting is optional and not certified by repository CI.

## Stage B work completed in this documentation pass

| Area | Outcome |
|---|---|
| Source-of-truth review | Reviewed README, PRD, architecture, runtime entry points, API server, MySQL schema docs, Redis/Neo4j/LanceDB/outbox docs, integration test sources, workflow configuration and benchmark artifact |
| Database documentation | Consolidated relational ER/schema narrative and added a SQL operations catalogue covering DDL, DML, joins, aggregates, subqueries, CTE, window function, procedure, function, trigger and advanced DBMS concepts |
| API documentation | Corrected method and route documentation against the API server implementation; distinguishes GET and POST search paths where both are supported |
| Academic report | Rebuilt report into university-style front matter, 11 chapters, references and evidence appendices; unknown institutional/student metadata remains explicit placeholders |
| Research evaluation | Included retrieved historical CI artifact with environment, workload, raw-run interpretation, provisional relevance metrics and freshness caveat |
| Demo/viva | Aligned 15-minute script and viva answers with current feature-hashing baseline, roles, outbox, freshness behavior and measured-run limitations |
| Acceptance traceability | This file records the evidence boundary and remaining current-commit verification gates |

## Documentation-contract verification

The repository includes automated checks in test/final-delivery.test.ts, test/catalog-seed.test.ts, test/research-claims.test.ts, and test/workflow.test.ts for report structure, demo script, dataset provenance, research evidence boundaries, and README slice traceability. Final documentation must preserve those exact compatibility contracts while remaining accurate; the contract tests are not a substitute for current full-stack integration or browser acceptance.

## Evidence inventory and provenance

### Current source revision

- Main HEAD reviewed: d72cc1fcd511e9d6fa3e31a20611a353d3861426.
- Package declaration on this revision uses LanceDB ^0.41.0.
- Current source contains separate live startup wiring in scripts/start.ts, scripts/api.ts and scripts/dev.ts.
- Current CI workflow defines disposable MySQL, Redis and Neo4j services; LanceDB persistence uses a temporary path. The Docker/browser job is pinned to Ubuntu 24.04.
- The GitHub combined-status endpoint returned no entries for the initial audit SHA d72cc1f. The follow-up Stage B verification run below provides the actual CI evidence for the documentation/test revision merged to main.

### Final Stage B CI verification — 2026-11-16

- GitHub Actions run: [43801480499](https://github.com/Rohith-S636/polyfind/actions/runs/43801480499)
- PR head SHA: c8a0838ab95513dabb6a77f6e80daf889d01b061
- Workflow benchmark metadata commit: 8596f109a57f6e8786d70ea617e5aafa40bcf2c2
- Merged main commit: 07300c765c9cbd7b824caa65f793f7b3e72e2a79
- Verification job: **success**
- Docker Compose stack smoke test: **success**
- Test summary: 240 total, 239 passed, 0 failed, 1 skipped. The single skip is the explicitly named “unrelated vector events are explicitly skipped” case.
- Passed steps: npm ci, disposable MySQL integration database preparation, both TypeScript checks, npm test, repeated live multi-store benchmark, benchmark artifact upload, npm run build.
- Passed Docker steps: Compose validation, production image build, MySQL/Redis/Neo4j startup, migrations, deterministic seed, application readiness, Next.js-proxy API/UI smoke checks, customer/admin browser acceptance, screenshot/report upload, disposable-volume cleanup.
- Browser evidence artifact: [polyfind-browser-evidence](https://github.com/Rohith-S636/polyfind/actions/runs/43801480499)
- Measured benchmark artifact: [polyfind-measured-benchmark](https://github.com/Rohith-S636/polyfind/actions/runs/43801480499)

### Final measured CI benchmark

Environment: MySQL 8.0.46, Node.js 22.23.4, Linux x64, AMD EPYC 9V74, 4 allocated CPU cores, 15,983 MB memory. The workload used 50 seed-42 synthetic products, 100 operations per repetition (88 queries and 12 updates), one warm-up and three measured repetitions. LanceDB indexed 50 products; vectorizer polyfind-feature-hash-v1; fusion contributions MySQL 0.50, vector 0.35, graph 0.15.

| Strategy | Mean operation latency (ms) | 95% CI of three run means (ms) | Per-run operation p95 range (ms) | NDCG@10 (provisional) | Non-verified freshness signals |
|---|---:|---:|---:|---:|---:|
| MySQL only | 1.14 | 0.905–1.375 | 3.31–3.83 | 0.867 | 0 / 264 |
| MySQL + Redis cache | 1.25 | 1.247–1.260 | 3.47–3.87 | 0.867 | 0 / 264 |
| Fixed weighted hybrid | 8.62 | 6.450–10.790 | 11.46–18.38 | 0.887 | 114 / 264 (43.18%) |
| Adaptive weighted hybrid + cache | 8.17 | 5.368–10.972 | 9.66–18.49 | 0.887 | 114 / 264 (43.18%) |

Interpretation:
- Hybrid strategies were substantially slower than MySQL-only in this small workload. The run does not demonstrate a latency advantage for hybrid retrieval.
- MySQL+Redis did not show a material latency improvement over MySQL-only; measured cache hit rate was 9.1–11.4%. Adaptive hybrid cache hit rate was 2.3%.
- Hybrid NDCG@10 was 0.020 higher (0.887 vs 0.867), but the judgments are manually checked and not independently annotated. This is not a significance test or a general relevance claim.
- The 43.18% metric is a non-verified/stale derived-candidate freshness signal. Strict mode rejects stale/unverifiable candidates; final price/stock/product fields are hydrated from MySQL. It is not evidence that stale transactional values were displayed.
- Confidence intervals are based on only three run means and must not be treated as robust inferential intervals. This is a small CI workload, not a production benchmark.

### Historical measured CI artifact

- Workflow run: [42959976828](https://github.com/Rohith-S636/polyfind/actions/runs/42959976828)
- Artifact: polyfind-measured-benchmark
- Artifact generated: 2026-11-11 04:35:44 UTC
- Artifact commit: b90ec799ca083fede1817aaac80b985e2fe59cb1
- MySQL: 8.0.46; database: polyfind_test
- Runtime: Node.js 22.23.4; Linux x64; AMD EPYC 9V74, 4 allocated CPU cores, 15,983 MB memory
- Dataset: 50 deterministic synthetic products, seed 42; LanceDB indexed 50 products
- Workload: 100 operations per repetition (88 queries, 12 updates); one warm-up and three measured repetitions
- Local vectorizer: polyfind-feature-hash-v1
- Fusion contributions: MySQL 0.50, vector 0.35, graph 0.15
- This artifact is historical and does not establish measurements for current d72cc1f.

### Measured result summary

| Strategy | Mean operation latency across run summaries (ms) | Per-run operation p95 range (ms) | NDCG@10 (provisional qrels) | Non-verified freshness signals |
|---|---:|---:|---:|---:|
| MySQL only | 1.12 | 3.45–4.16 | 0.867 | 0 / 264 |
| MySQL + Redis cache | 2.79 | 3.55–4.28 | 0.867 | 0 / 264 |
| Fixed weighted hybrid | 8.42 | 11.82–14.97 | 0.887 | 114 / 264 (43.18%) |
| Adaptive weighted hybrid + cache | 9.42 | 10.73–21.55 | 0.887 | 114 / 264 (43.18%) |

Interpretation:
- This small CI workload does not show a latency advantage for hybrid retrieval; measured operation latency was higher than MySQL-only.
- Hybrid strategies have higher provisional NDCG@10 in this fixture (0.887 vs 0.867), but judgments are manually checked and not independently annotated. The 0.020 difference is not a significance test and does not establish general superiority.
- The 43.18% freshness signal means the benchmark observed stale or unverifiable derived-candidate response status. Its metric definition distinguishes this from stale price/stock being shown: strict mode rejects stale/unverifiable candidates and final product fields are hydrated from MySQL.
- Redis had a low cache-hit rate in this benchmark (8.0–9.1% across its three raw runs); one run contained large update-latency outliers. Do not present this as evidence that Redis accelerates this workload.
- The artifact's aggregate latency summary and per-run operation p95 values are different statistics; do not substitute one for the other.

## 13-phase evidence matrix

| Phase | Current disposition | Evidence / remaining gate |
|---:|---|---|
| 1 Requirements and scope | PASS — documented | PRD and approved constraints align; candidate research gap is not a novelty claim |
| 2 Repository audit | PASS — source audit and CI | Source audit plus final verification run 43801480499; local Windows clean install/rehearsal remains |
| 3 Database architecture | PASS — integration coverage | MySQL/Redis/Neo4j/LanceDB roles and disposable integration coverage verified in run 43801480499 |
| 4 Dataset | PASS — CI seed and provenance | Deterministic synthetic seed-42 catalogue; Compose migrations and seed passed; USD and licensing caveats documented |
| 5 Backend | PASS — CI typechecks/tests/build | Live wiring in all three entrypoints; typechecks, tests, benchmark and production build passed |
| 6 Frontend | PASS — browser acceptance | Search, filters, details, offers/history and admin routes exercised through Docker Compose browser job |
| 7 Authentication/RBAC | PASS — browser acceptance | Customer registration/role denial, first-admin bootstrap, admin login/logout passed |
| 8 Database demonstrations | PASS — disposable CI services | MySQL, Redis, Neo4j and LanceDB integration coverage completed; 239 tests passed and one explicit skip recorded |
| 9 Hybrid retrieval | PASS — benchmark/browser evidence | Live benchmark and browser search passed; hybrid latency/freshness trade-offs are documented without superiority claims |
| 10 Testing/performance/security | PASS — CI verification; security review partial | 239/240 tests, build and benchmark passed; qrels remain provisional and separate dependency/security audit is still required |
| 11 Docker/deployment | PASS — Compose/browser CI | Production image, database services, migrations, readiness, API/UI smoke and browser acceptance passed; public hosting remains unverified |
| 12 Documentation | PASS — merged to main | Academic report, SQL catalogue, API/schema, provenance, demo/viva and evidence register merged; institutional front matter remains |
| 13 Demo/viva | PREPARED | 15-minute script, extended viva and CI screenshots available; local Windows rehearsal and institutional sign-off remain |

## Four-plus advanced DBMS concepts for the review

1. ACID transactions and transactional repository writes.
2. Foreign-key and composite-key referential integrity.
3. Optimistic concurrency control with source versions and expected-version checks.
4. Indexing and query-plan analysis (B-tree, composite, FULLTEXT and operational indexes).
5. Window functions, CTEs, nested/correlated subqueries and aggregates.
6. Stored procedures, deterministic functions and trigger exercise.
7. Transactional outbox, independent delivery states, leases, retries and dead letters.
8. Idempotent, version-aware derived projections and tombstones.

See [SQL Operations Catalogue](SQL_OPERATIONS_CATALOGUE.md), [Relational Schema](RELATIONAL_SCHEMA_PHASE4.md) and [Outbox Phase 8](OUTBOX_PHASE8.md).

## Final gates before submission freeze

CI and disposable browser acceptance are now verified. The remaining submission gates are:

1. **CI gate passed:** run 43801480499 verified npm ci, both typechecks, 239/240 tests (one explicit skip), benchmark generation and npm run build. On the actual Windows primary checkout, repeat npm ci, both typechecks, npm test and npm run build; retain the exact local output and SHA.
2. **Multi-store CI gate passed:** the workflow's disposable MySQL, Redis, Neo4j and LanceDB integration coverage completed successfully; preserve the artifact and logs from run 43801480499.
3. **Docker/browser CI gate passed:** the Compose job built the production image, started services, migrated/seeded, reached readiness, passed API/UI smoke checks and completed customer registration/role denial, admin bootstrap/login/logout, product/brand/seller/variant/offer creation/update, public search, seller comparison and price-history browser acceptance. Local Windows rehearsal and screenshot review remain required.
4. Rehearse the 15-minute demo on the disposable local Docker stack. Capture screenshots of the ERD, UI, SQL demonstrations, admin workflow, health/readiness and test evidence.
5. If public hosting is shown, record the deployed commit SHA and independently test readiness, authentication, search, persistence and all configured stores. Otherwise use local Docker as the authoritative demo.
6. Fill cover-page placeholders using the institution's exact approved template; do not invent names, SRNs, guide, department or certificate details.
7. Attach the two-member contribution matrix using actual commit/PR/test evidence; verify that each member has demonstrable database and application contributions, not only planned slice assignments.
8. Obtain independent relevance-judgment review before making a research-quality claim. Until then label qrels provisional.
9. Do not claim novelty, commercial readiness, production-scale performance or universal strong consistency.

## Submission status

**Documentation package:** complete and merged to main; CI and disposable Docker/browser acceptance passed on run 43801480499.  
**Overall project acceptance:** final local Windows rehearsal, institution-specific front matter/signatures, and independent relevance-judgment review remain open. Public hosting is optional and is not certified by this CI run.

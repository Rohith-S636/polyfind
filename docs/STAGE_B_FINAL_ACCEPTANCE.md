# POLYFIND Stage B — Final Acceptance and Submission Evidence

**Baseline reviewed:** d72cc1fcd511e9d6fa3e31a20611a353d3861426 (main, 2026-11-16)  
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
- The GitHub commit status endpoint returned no combined status entries for this SHA. This audit cannot certify a green current-commit workflow.

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
| 1 Requirements and scope | Documented | PRD and approved constraints align; candidate research gap is not a novelty claim |
| 2 Repository audit | Partial | Source-level audit at baseline recorded; local clean install and current-commit CI result still required |
| 3 Database architecture | Implementation documented | MySQL/Redis/Neo4j/LanceDB roles documented; verify all four real services in latest current-commit run |
| 4 Dataset | Documented | Deterministic synthetic generator and seed 42; validate additive seed against disposable MySQL |
| 5 Backend | Source reviewed | Live wiring exists in all three entrypoints; run current typechecks/tests/build and verify shutdown/outbox behavior |
| 6 Frontend | Implementation documented | Search, filters, details, offers/history, login/register/admin routes exist; current browser acceptance run must pass |
| 7 Authentication/RBAC | Test/source coverage present | MySQL test covers scrypt/session hashing and registration; confirm customer mutation denial and admin journeys in current browser run |
| 8 Database demonstrations | Workflow configured | Integration tests are environment-gated and CI provides service URLs; inspect current run for actual executed/passed tests, not just test-file presence |
| 9 Hybrid retrieval | Implementation documented | MySQL keyword, graph and vector providers plus fusion/freshness path; current-commit end-to-end results still required |
| 10 Testing/performance/security | Historical experiment only | Historical benchmark included; qrels provisional; current full tests/build and dependency/security audit not certified here |
| 11 Docker/deployment | Docker workflow configured | Ubuntu 24.04 browser job and persistent LanceDB volume documented; current Compose/browser result and public deployment SHA/health remain unverified |
| 12 Documentation | Stage B documents reconciled | Report, SQL catalogue, API/schema/index and demo/viva docs form the submission set; institutional details and final screenshots must be supplied |
| 13 Demo/viva | Prepared, not rehearsed | 15-minute script and viva bank aligned; live rehearsal, screenshots and actual demo environment evidence remain to be captured |

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

These cannot be certified by this source/document audit alone:

1. On the actual Windows primary checkout, run npm ci, npm run typecheck, npm run typecheck:scripts, npm test and npm run build; retain exact output and commit SHA.
2. Verify the latest GitHub Actions run for the final commit: npm install, typechecks, test counts, MySQL/Redis/Neo4j/LanceDB real integration tests, benchmark artifact generation and build.
3. Verify the Docker/browser job completes Chromium installation and passes customer registration/role denial, admin bootstrap/login, product/brand/seller/variant/offer creation/update, public search, seller comparison and price history.
4. Rehearse the 15-minute demo on the disposable local Docker stack. Capture screenshots of the ERD, UI, SQL demonstrations, admin workflow, health/readiness and test evidence.
5. If public hosting is shown, record the deployed commit SHA and independently test readiness, authentication, search, persistence and all configured stores. Otherwise use local Docker as the authoritative demo.
6. Fill cover-page placeholders using the institution's exact approved template; do not invent names, SRNs, guide, department or certificate details.
7. Obtain independent relevance-judgment review before making a research-quality claim. Until then label qrels provisional.
8. Do not claim novelty, commercial readiness, production-scale performance or universal strong consistency.

## Submission status

**Documentation package:** prepared for review on the stated baseline.  
**Overall project acceptance:** not yet frozen; current-commit CI, disposable full-stack browser run, local rehearsal and institutional front matter remain evidence gates.

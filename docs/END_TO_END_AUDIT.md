# PolyFind End-to-End Project Audit

**Audit date:** 2026-11-04  
**Scope:** Repository files, runtime paths, database/migration surfaces, UI, benchmarks, tests, documentation, and deployment configuration.  
**Method:** Static inspection of the complete tracked-file inventory, targeted source tracing, repository status review, and execution of the project validation commands.

## 1. Executive conclusion

PolyFind is a well-structured TypeScript research prototype with strong contract documentation, deterministic fixtures, explicit MySQL authority, version metadata, and a broad automated test suite. The current repository is buildable and test-clean offline, but it should not be treated as production-ready or as evidence for the quantitative claims in `docs/FINAL_REPORT.md` without running and preserving real benchmark executions.

The most important implementation risks are:

1. **High — live catalog truncation:** `GET /api/products` fetches at most 100 live MySQL rows and then performs search, filtering, sorting, and pagination in memory. Catalogues larger than that are incomplete and can return incorrect totals/pages.
2. **High — silent retrieval degradation:** `SearchService` catches every provider error and returns an empty candidate set without exposing failure diagnostics or distinguishing “no results” from “dependency failed.”
3. **High — non-durable cache:** `RedisCacheAdapter` is named and documented as Redis-backed but stores entries only in a process-local `Map`; the deployed Redis service is not wired into the adapter.
4. **High — vector version race:** `VectorIngestionService.updateProduct` always upserts and does not compare the incoming version with the stored version, so an out-of-order older update can replace newer derived data.
5. **Medium — freshness status contamination:** `FreshnessValidator` accumulates telemetry across requests and does not reset it before a search, so a prior stale/unverifiable request can affect later response status.
6. **Medium — deployment/configuration mismatch:** Docker Compose starts Qdrant while the implemented vector abstraction is an in-memory/file simulation and the app defaults `VECTOR_STORE_PROVIDER` to an empty value.
7. **Medium — evidence mismatch:** the final report and demo script state concrete relevance, latency, dispatch, and stale-read measurements, while the committed fixture is a hard-coded artifact and the default runtime does not execute the full MySQL/Redis/Neo4j/vector topology.

## 2. Validation evidence

| Check | Result |
|---|---|
| `npm run typecheck` | Passed |
| `npm test` | Passed: 162 tests, 0 failures |
| `npm run build` | Passed: Next.js production build |
| CI workflow | Runs typecheck, tests, and build |
| Live MySQL/Redis/Neo4j/Qdrant integration | Not executed in this audit |
| Browser automation against a running stack | Not executed in this audit |

The build emitted a warning that React 18 support is deprecated in Next.js 16. The build still succeeds, but the dependency pair should be deliberately upgraded or pinned/documented.

## 3. Findings

### F-01 — Live product listing is capped before query processing

**Severity:** High  
**Location:** `src/api/server.ts`, live branch of `GET /api/products`

The live path calls `listProducts(parsed.filters, 1, 100)`, then applies `q`, filters, sort, and pagination to that first page. A catalogue with more than 100 rows will produce incorrect search results, totals, and page counts. The repository already has SQL-side filtering and pagination support, but this endpoint bypasses it.

**Recommendation:** Add a repository/API query that accepts the complete filter, search, sort, page, and limit contract and executes it in MySQL. Keep the in-memory path only for demo mode. Add a regression test with more than 100 products where the matching product is outside the first SQL page.

### F-02 — Provider errors become indistinguishable from empty search results

**Severity:** High  
**Location:** `src/api/search.ts`

Each selected retrieval provider is wrapped in `try/catch`; failures return `{ candidates: [], elapsedMs: timeoutMs }`. No provider failure, timeout, source, or degraded reason is returned in `SearchResponse`. This conflicts with the architecture requirement that failures be observable and can produce a false successful response with `freshness.status = "verified"` when no candidate was checked.

**Recommendation:** Use the existing adapter execution/error shape or add equivalent diagnostics to the search response. Track failed providers and timeouts, set an explicit degraded/unavailable status, and distinguish zero matches from dependency failure. Avoid a broad silent catch.

### F-03 — Redis adapter is not Redis-backed

**Severity:** High  
**Location:** `src/cache/redis-adapter.ts`

`RedisCacheAdapter` uses `private memoryStore = new Map(...)`. It has no Redis client, connection lifecycle, serialization, or cross-process behavior. This is valid as a test double, but it does not satisfy the architecture and final-report description of a Redis cache tier. The cache also has a `bypasses` metric that is never incremented.

**Recommendation:** Rename the current class to make its in-memory nature explicit, or implement an injected Redis transport with a separate deterministic in-memory test adapter. Add integration tests for serialization, TTL, version invalidation, reconnect/failure behavior, and multi-process visibility.

### F-04 — Vector update accepts out-of-order versions

**Severity:** High  
**Location:** `src/retrieval/vector-ingestion.ts`

The comment says updates are applied only for a greater-or-equal version, but `updateProduct` does not read the existing record/version and always calls `upsert`. An older event can therefore overwrite a newer vector record and metadata.

**Recommendation:** Add a store-level conditional upsert or read-before-write version check. Return `false` for stale updates, preserve the highest version, and test update order `[2, 1]`.

### F-05 — Freshness telemetry is request-stateful

**Severity:** Medium  
**Location:** `src/planner/freshness.ts`, `FreshnessValidator.telemetry`

Telemetry is incremented on every call and never reset by `SearchService`. `SearchService` uses the returned cumulative telemetry to determine the current response status. A stale candidate in one request can make a later request appear degraded/unavailable even when its candidates are fresh.

**Recommendation:** Make validation telemetry local to each `validateCandidates` call, or reset at the start of that method and return a snapshot. Add a two-request regression test.

### F-06 — Deployment vector store does not match implementation

**Severity:** Medium  
**Locations:** `docker-compose.yml`, `.env.example`, `src/config/environment.ts`, `src/retrieval/vector-spike.ts`

Compose starts Qdrant, but no Qdrant adapter is implemented. The source provides in-memory and file-backed simulation classes and the environment loader defaults to `"memory"` when the provider is absent. Compose passes an empty `VECTOR_STORE_PROVIDER` by default. The app startup reports vector availability unconditionally.

**Recommendation:** Either remove Qdrant from the supported stack until an adapter exists, or implement and test the Qdrant adapter. Make startup fail clearly for an explicitly requested unsupported provider and report actual vector readiness rather than `"available"` unconditionally.

### F-07 — Quantitative report claims are not runtime-generated by default

**Severity:** Medium  
**Locations:** `docs/FINAL_REPORT.md`, `docs/DEMO_SCRIPT.md`, `src/benchmark/visualization.ts`, `test/fixtures/baseline-comparison.json`

The report states exact NDCG, stale-read, latency, and dispatch figures. The visualization factory also contains fixed numeric values. The test suite verifies schema and consistency of these artifacts, but this is not the same as reproducing the measurements from the live system. The implementation’s default search path is keyword/MySQL unless providers are explicitly injected.

**Recommendation:** Label fixture values as illustrative unless generated from recorded runs. Commit raw run metadata, workload, hardware, cache state, repetitions, and command output for every claimed figure. Make the report link each claim to a reproducible artifact.

### F-08 — Docker defaults contain development credentials

**Severity:** Medium  
**Locations:** `docker-compose.yml`

Compose contains fallback passwords such as `change-me`, `change-me-root`, and a default Neo4j password. These are not source-control secrets, but they make accidental insecure deployment easy. The app also defaults `AUTH_SECRET` to `replace-in-production`.

**Recommendation:** Require these values for non-demo startup, fail if known placeholder values are used outside development, and document that Compose is local-only. Keep secrets in an uncommitted `.env`.

### F-09 — Migration runner relies on global multi-statements

**Severity:** Medium  
**Locations:** `src/catalog/db.ts`, `src/catalog/migrations.ts`

The pool enables `multipleStatements: true` globally. This is convenient for migration files but increases the blast radius of any query-construction mistake. The migration runner also transforms SQL text to remove `ADD COLUMN IF NOT EXISTS`, which is safe only because migration tracking is correct and migrations are never partially recorded.

**Recommendation:** Use a dedicated migration connection/pool for multi-statements, or split migration statements safely. Add failure/retry tests against a real MySQL instance and verify transactional behavior for every migration.

### F-10 — Startup shutdown handling suppresses errors

**Severity:** Low/Medium  
**Locations:** `scripts/start.ts`, `scripts/dev.ts`

Shutdown catches are empty and the spawned Next process is killed without awaiting exit or reporting a non-zero child exit. This can hide cleanup failures and make operational diagnosis harder.

**Recommendation:** Log sanitized shutdown errors and propagate unexpected child-process failures. Use explicit process IDs and await orderly shutdown where possible.

## 4. Architecture and behavior assessment

### Strong areas

- MySQL is clearly designated as the authority for price, stock, identity, and versions.
- SQL uses parameter placeholders in catalog queries.
- Product updates lock rows and enforce optimistic version checks.
- Candidate records preserve source and source version.
- Freshness validation reads display data from the authority rather than derived stores.
- Migrations are ordered, tracked, and transaction-wrapped.
- Contract validation rejects unknown fields and malformed request data.
- Rate limiting, payload size limits, security headers, error sanitization, and secret-file exclusions are present.
- Benchmarks capture environment metadata and expose percentile/statistical summaries.
- The test suite covers contracts, catalog behavior, freshness, sync, retrieval, UI logic, benchmarks, and security-review assertions.

### Areas requiring explicit product decision

- The repository supports a demo in-memory catalog and a live MySQL catalog, but the UI/API integration path should state which behavior is authoritative for each environment.
- The intended vector provider is not consistently selected across ADRs, environment examples, Compose, and runtime code.
- The API contract documents POST search and GET catalogue routes, but catalog CRUD endpoints are not exposed by the low-level HTTP server shown in `src/api/server.ts`; CRUD handlers exist separately in `src/catalog/api.ts`.
- Authentication is out of scope, so write endpoints must remain local/development-only and must not be exposed by a public deployment.

## 5. Complete tracked-file inventory

The following inventory covers every file returned by `git ls-files` at audit time. Files are grouped by role; each entry describes its responsibility and current audit status.

### Repository and runtime configuration

| File | Purpose / assessment |
|---|---|
| `.dockerignore` | Docker build exclusions. |
| `.env.example` | Environment variable template; contains placeholders only. |
| `.gitignore` | Excludes secrets, builds, generated data, and local state. |
| `AGENTS.md` | Contributor and audit constraints; authoritative workflow guidance. |
| `Dockerfile` | Multi-stage Node build/runtime image; currently installs dev dependencies in runtime. |
| `docker-compose.yml` | Local MySQL, Redis, Neo4j, Qdrant, and app topology; has provider/default mismatch noted in F-06 and F-08. |
| `package.json` | Scripts and dependency manifest. |
| `package-lock.json` | npm lockfile; modified in the pre-existing worktree. |
| `tsconfig.json` | Strict TypeScript configuration for source/tests; excludes web TS from root typecheck. |
| `.github/workflows/verify.yml` | CI typecheck, test, and build workflow. |

### Top-level documentation and diagrams

| File | Purpose / assessment |
|---|---|
| `README.md` | Project overview, setup, workflow, and evidence links. |
| `diagram.md` | Architecture/data-flow diagrams in Markdown. |
| `nosql-schema.md` | Derived-store schema notes. |
| `relation-schema.md` | Relational schema and SQL design notes. |
| `diagrams/chen_er_diagram.svg` | ER diagram artifact. |
| `diagrams/relational_schema_diagram.svg` | Relational schema diagram artifact. |

### Documentation and decisions

| Files | Purpose / assessment |
|---|---|
| `docs/INDEX.md`, `docs/ARCHITECTURE.md`, `docs/PRD.md`, `docs/contracts.md` | Project scope, architecture, contracts, and documentation index. |
| `docs/API.md`, `docs/IMPLEMENTATION.md`, `docs/LOCAL_SETUP.md` | API, implementation, and local setup guidance. |
| `docs/ACCEPTANCE_CHECKLIST.md`, `docs/FINAL_REPORT.md`, `docs/DEMO_SCRIPT.md` | Acceptance evidence, final narrative, and demo script; quantitative claims need runtime evidence per F-07. |
| `docs/CATALOGUE_DATA_READINESS.md`, `docs/DATASET_PROVENANCE.md` | Dataset readiness and provenance. |
| `docs/EMBEDDINGS.md`, `docs/GRAPH_SCHEMA.md` | Embedding and graph design. |
| `docs/EXPLAIN_PLANS_BASELINE.md` | SQL explain-plan baseline notes. |
| `docs/PARALLEL_WORK_PLAN.md` | Slice ownership and interface strategy. |
| `docs/RELEVANCE_EVALUATION_METHODOLOGY.md` | Relevance metrics and evaluation method. |
| `docs/RESEARCH_CLAIMS_AND_RELATED_WORK.md`, `docs/research.md` | Research framing, claims, limitations, and related work. |
| `docs/VIVA_PREPARATION.md` | Viva/demo preparation. |
| `docs/POLYFIND_SQL_Review_Notes.md` | Untracked SQL review notes present in the worktree; not part of the committed baseline. |
| `docs/decisions/ADR-001-mysql-authority.md` | MySQL source-of-truth decision. |
| `docs/decisions/ADR-002-freshness-contract.md` | Freshness contract. |
| `docs/decisions/ADR-003-vector-store-selection.md` | Vector-store selection/spike decision; reconcile with Compose. |
| `docs/decisions/ADR-004-baseline-candidate-fusion.md` | Fusion baseline decision. |
| `docs/decisions/ADR-005-freshness-validation-and-safe-fallback.md` | Freshness fallback behavior. |
| `docs/decisions/ADR-006-planner-routing-baselines.md` | Planner baseline decision. |
| `docs/decisions/ADR-007-failure-injection-and-security-boundary.md` | Failure/security test boundary. |
| `docs/decisions/ADR-008-repeated-benchmark-summaries.md` | Repeated-run statistical summary decision. |
| `docs/sprints/sprint-01.md` through `docs/sprints/sprint-06.md` | Sprint scope and acceptance mapping. |
| `docs/slices/s1-01...s6-05` | Thirty slice specifications, ownership, prerequisites, and evidence expectations. |

### Database migrations

| File | Purpose / assessment |
|---|---|
| `migrations/001_initial_schema.sql` | Categories, products, product versions, constraints, and foreign keys. |
| `migrations/002_catalog_indexes.sql` | Catalog indexes. |
| `migrations/003_catalog_metadata.sql` | Optional metadata/source columns; runner compatibility transformation applies. |

### Operational scripts

| File | Purpose / assessment |
|---|---|
| `scripts/api.ts` | API-only development entry point. |
| `scripts/demo-ops.ts` | Demonstration operations and instrumentation. |
| `scripts/dev.ts` | Demo-default API plus Next development server. |
| `scripts/export-baseline-visualization.ts` | Generates benchmark visualization output. |
| `scripts/migrate.ts` | Loads environment and runs migrations. |
| `scripts/search.ts` | CLI search and mutation demonstration. |
| `scripts/seed-catalog.ts` | Deterministic seed generation, validation, export, and optional MySQL insertion. |
| `scripts/start.ts` | Production API plus Next server startup; live MySQL is required. |

### Source modules

| Directory / files | Purpose / assessment |
|---|---|
| `src/index.ts`, `src/api/index.ts` | Public exports and API module boundary. |
| `src/api/search.ts`, `src/api/server.ts` | Search orchestration and HTTP server; F-01/F-02 apply. |
| `src/benchmark/*.ts` | Workloads, metrics, harness, ablations, repeated runs, statistics, and visualization. |
| `src/cache/index.ts`, `src/cache/keys.ts`, `src/cache/redis-adapter.ts`, `src/cache/types.ts` | Cache contracts, keys, metrics, and current in-memory adapter; F-03 applies. |
| `src/catalog/api.ts`, `db.ts`, `errors.ts`, `index.ts`, `migrations.ts`, `repository.ts`, `seed.ts` | MySQL catalog API, pool, errors, migration runner, CRUD repository, and deterministic seed. |
| `src/config/index.ts`, `src/config/environment.ts` | Configuration loading, validation, and redaction. |
| `src/contracts/errors.ts`, `health.ts`, `types.ts`, `validation.ts` | Typed request/response contracts and validation. |
| `src/fusion/baseline.ts`, `src/fusion/index.ts` | Deterministic candidate fusion. |
| `src/planner/freshness.ts`, `index.ts`, `routing.ts` | Freshness validation and route planning; F-05 applies. |
| `src/reliability/failure-injection.ts`, `index.ts` | Deterministic failure injection for tests. |
| `src/retrieval/adapter.ts`, `candidate.ts`, `embeddings.ts`, `graph-adapter.ts`, `index.ts`, `vector-adapter.ts`, `vector-ingestion.ts`, `vector-spike.ts` | Retrieval contracts, candidate validation, embeddings, graph/vector adapters and spike stores; F-04/F-06 apply. |
| `src/sync/events.ts`, `index.ts`, `neo4j-sync.ts`, `processor.ts` | Update events, sync processing, idempotency, and graph-derived storage. |
| `src/ui/catalog-client.ts`, `catalog-component.ts`, `index.ts`, `search-client.ts`, `search-component.ts`, `types.ts` | TypeScript UI clients/components and state behavior. |

### Tests and fixtures

| Files | Purpose / assessment |
|---|---|
| `test/ablation.test.ts`, `benchmark-harness.test.ts`, `benchmark-relevance.test.ts`, `benchmark-workload.test.ts`, `statistical-summaries.test.ts`, `visualization.test.ts` | Benchmark and research-measurement behavior. |
| `test/api.test.ts`, `contracts.test.ts`, `environment-config.test.ts`, `workflow.test.ts` | API, contract, configuration, and workflow checks. |
| `test/catalog-crud.test.ts`, `catalog-schema.test.ts`, `catalog-seed.test.ts`, `catalog-transactions-indexes.test.ts` | Catalog validation, schema, seed, transaction, and index checks. |
| `test/catalog-ui.test.ts`, `frontend-e2e.test.ts`, `frontend-search.test.ts`, `search-ui.test.ts` | UI and frontend integration behavior. |
| `test/failure-injection.test.ts`, `freshness-validation.test.ts`, `neo4j-sync.test.ts`, `redis-cache.test.ts`, `sync-events.test.ts` | Failure, freshness, cache, graph sync, and event behavior. |
| `test/final-acceptance.test.ts`, `final-delivery.test.ts`, `research-claims.test.ts`, `research.test.ts`, `security-review.test.ts` | Acceptance, delivery, research-claim, and security assertions. |
| `test/fusion.test.ts`, `planner-routing.test.ts`, `retrieval-interfaces.test.ts`, `vector-adapter.test.ts`, `vector-ingestion.test.ts`, `vector-spike.test.ts` | Retrieval, planner, fusion, and vector behavior. |
| `test/fixtures/baseline-comparison.json` | Committed benchmark comparison fixture; treated as evidence-shaped data, not a live run. |

### Web application

| File | Purpose / assessment |
|---|---|
| `web/next-env.d.ts` | Next generated type references; modified in the pre-existing worktree by the current Next version. |
| `web/next.config.mjs` | Next configuration and API rewrite. |
| `web/tsconfig.json` | Web-specific TypeScript configuration. |
| `web/components/CategoryNav.tsx`, `FilterSidebar.tsx`, `Header.tsx`, `Pagination.tsx`, `ProductCard.tsx`, `ProductGrid.tsx`, `ProductModal.tsx`, `SearchBar.tsx`, `SortControls.tsx` | Search/catalogue UI components. |
| `web/lib/api.ts`, `web/lib/categories.ts` | Browser/server API client and category definitions. |
| `web/pages/_app.tsx`, `_document.tsx`, `index.tsx`, `products/[id].tsx` | Next pages and app shell. |
| `web/styles/globals.css` | Global responsive/accessibility-oriented styling. |

## 6. Test gaps to close

The current tests prove many isolated contracts but do not cover the highest-risk end-to-end paths. Add:

1. A live-style catalog test with 101+ products verifying SQL-side filtering, totals, and page boundaries.
2. A search test where one provider times out and the response exposes a degraded dependency diagnostic.
3. A two-request freshness test proving status is per-request, not cumulative.
4. A vector ingestion ordering test proving version 1 cannot overwrite version 2.
5. A real Redis integration test or an explicit test-double contract that prevents the in-memory adapter from being described as Redis.
6. A startup readiness test that reports unsupported/empty vector configuration accurately.
7. A clean-room Docker test, if Docker is intended to remain a supported path.
8. Reproducibility checks that compare report claims against raw benchmark artifacts rather than only validating hard-coded fixture shape.

## 7. Recommended remediation order

1. Fix F-01 and F-02 because they affect user-visible correctness and failure semantics.
2. Fix F-04 and F-05 because they affect freshness guarantees.
3. Resolve F-03 and F-06 by choosing either real adapters or clearly scoped test doubles.
4. Replace hard-coded research claims with traceable benchmark artifacts.
5. Harden Compose/startup defaults and add end-to-end integration coverage.

## 8. Worktree note

At audit time, the following changes pre-existed the audit and were not altered:

- Modified: `package-lock.json`
- Modified: `web/next-env.d.ts`
- Untracked: `docs/POLYFIND_SQL_Review_Notes.md`
- An ignored local `.env` file exists; its values were not inspected or disclosed.

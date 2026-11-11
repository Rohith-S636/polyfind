# POLYFIND — 13-phase master acceptance and completion record

**Repository:** Rohith-S636/polyfind  
**Branch:** main  
**Current audit rule:** A phase passes only when its implementation, tests, documentation, and relevant integration evidence pass. A previous report or a TypeScript-only green check is not sufficient.

## Approved constraints

- Academic/personal only; no commercial scope.
- Target spend ₹0. Use local Docker for the complete demonstration; public hosting is optional and must not be assumed to provide persistent free databases.
- Next.js + Node.js + TypeScript modular monolith.
- MySQL is authoritative; Redis cache; Neo4j graph; LanceDB embedded vector store. Qdrant excluded.
- Synthetic deterministic data is allowed and must be labelled synthetic.
- Public search/browse; customer registration/login; administrator-only shared catalogue mutation.
- Weighted hybrid ranking; MySQL hydration and freshness validation.
- Reproducible benchmark evidence, 15-minute demo, extended viva backup.
- Never migrate or modify an existing database/volume as part of implementation. CI may migrate only its disposable service database.

## Phase acceptance matrix

| Phase | Acceptance gate | Current state |
|---:|---|---|
| 1. Academic requirements | Approved scope, users, constraints, objectives, and non-goals are consistent across PRD/report/demo | In progress — PRD addendum added; literature/research-gap review and all docs still require reconciliation |
| 2. Repository and implementation audit | Source inventory, dependency map, baseline CI, and findings register are traceable | In progress — prior audit retained; new corrections are being integrated |
| 3. Database architecture | MySQL authoritative; Redis/Neo4j/LanceDB adapters; persistent LanceDB Docker volume; no Qdrant; schema/index/transaction evidence | In progress — Compose corrected; real Neo4j/LanceDB integration gates still being repaired |
| 4. Dataset | Deterministic synthetic products/categories plus brands/sellers/variants/offers; provenance and safe idempotent seed | In progress — additive product seed and seller/variant/offer generation added; needs real MySQL CI verification |
| 5. Backend | Both production entry points wire the same SQL, graph, vector, cache, auth, and outbox paths; graceful shutdown | In progress — graph wiring and SQL pagination parity added; startup vector backfill and shutdown fixes need CI verification |
| 6. Frontend | Search/filter/detail plus seller price comparison/history and usable customer/admin workflows | In progress — login/register/admin pages and product offer/history views added; browser-level acceptance still required |
| 7. Authentication/RBAC | Customer registration/login; one-time admin bootstrap; scrypt; hashed session tokens; expiry/revocation; admin-only mutations; actor attribution; throttling | In progress — customer registration and local throttling added; browser token storage and distributed rate limiting remain hardening gaps |
| 8. Database demonstrations | Real disposable MySQL, Redis, Neo4j, and LanceDB integration tests run in CI | In progress — CI services configured; real Neo4j projection failure and test suite failures must be resolved |
| 9. Hybrid search | MySQL + vector + graph providers wired; weighted fusion; initial vector backfill; freshness-safe hydration; end-to-end retrieval tests | In progress — graph provider and weighted RRF wired; local feature-hash vectorizer/backfill added; integration verification pending |
| 10. Testing/performance/security | Full unit/API/integration suite, production build, security checks, reproducible benchmark raw data and reviewed qrels | In progress — correctness CI currently has failures; fixture benchmark values are explicitly not treated as empirical |
| 11. Docker/deployment | Correct Compose services, persistent data, health checks, startup/shutdown, deployed commit and health smoke test | In progress — Compose Qdrant removed and LanceDB volume added; public deployment not independently certified |
| 12. Documentation/report | README, PRD, architecture, report, diagrams, API docs, provenance, setup and benchmark claims match implementation | In progress — README/PRD/architecture/demo/report reconciled; remaining diagrams/viva/acceptance docs still need review |
| 13. Final demo/viva | Rehearsable 15-minute demo plus extended viva, seeded offers, screenshots/evidence, no unsupported claims | In progress — 15-minute script rewritten; final rehearsal and evidence capture pending |

## Critical acceptance tests still required

1. **Neo4j real projection:** product, category, brand, seller, variant, offer associations; relationship reconciliation; version monotonicity; deletion ownership; graph retrieval returns candidates.
2. **LanceDB real persistence:** insert, search, version-protected upsert, tombstone, reopen, and active-count behavior.
3. **Vector startup:** local feature-hash fallback starts without external credentials; initial MySQL catalogue backfill occurs; outbox updates/deletes remain version-aware.
4. **Search E2E:** query reaches MySQL, vector, and graph providers; weighted fusion is applied; candidate facts are rehydrated and freshness-checked from MySQL.
5. **Catalogue seed:** rerun does not overwrite existing product versions/prices/stock; creates only missing synthetic sellers, variants, and offers; emits audit/outbox records.
6. **RBAC:** customer cannot create/update product, brand, seller, variant, or offer; admin can; spoofed actor IDs never become audit actors; login/bootstrap throttles work.
7. **UI:** customer register/login; admin bootstrap/login; admin create product/brand/seller/variant/offer; public seller price comparison and price history.
8. **Runtime:** `scripts/start.ts` and `scripts/api.ts` have equivalent live wiring, pool cleanup, and child-process shutdown.
9. **CI:** npm ci, app typecheck, script typecheck, all tests, real MySQL/Redis/Neo4j/LanceDB integrations, and production build all pass.
10. **Academic evidence:** run benchmark workloads on a recorded environment; export raw data and summary; replace fixture-only claims; review qrels.
11. **Deployment:** verify actual deployed SHA, readiness, login, search, persistence, and all dependency health; do not assume an old Render URL reflects current main.
12. **Final submission:** reconcile every document and rehearse the 15-minute demo with a working seeded environment.

## Change log

This file is the living acceptance record. Update a phase to PASS only with commit SHA and test/workflow evidence. Keep failed/blocked gates visible; do not relabel skipped tests as passing.

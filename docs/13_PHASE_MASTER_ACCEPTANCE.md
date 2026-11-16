# POLYFIND — 13-phase master acceptance and completion record

**Repository:** Rohith-S636/polyfind  
**Baseline audited:** d72cc1fcd511e9d6fa3e31a20611a353d3861426 (main, 2026-11-16)  
**Detailed Stage B record:** [STAGE_B_FINAL_ACCEPTANCE.md](STAGE_B_FINAL_ACCEPTANCE.md)

## Approved constraints

- Academic/personal only; no commercial scope; target spend ₹0.
- Next.js + Node.js + TypeScript modular monolith.
- MySQL authoritative; Redis cache/invalidation; Neo4j graph projection; LanceDB embedded persistent vector store. Qdrant excluded.
- Synthetic deterministic dataset only; no retailer scraping or live market-data claims.
- Public browse/search; customer registration/login; administrator-only shared catalogue mutation.
- Weighted hybrid retrieval; MySQL hydration and freshness validation.
- Local Docker is the full reproducible demo path. Public hosting is optional and not certified by repository CI alone.
- Never migrate, reset, or mutate an existing database/volume without explicit authorization. CI may migrate only disposable service databases.

## Audit method and evidence rule

A phase is PASS only when implementation, automated tests, documentation and relevant integration evidence pass for the same identified revision. A planned test, a test file, a green typecheck, a historical benchmark, or an unverified screenshot is not sufficient.

The current source-level review covered README, PRD, architecture, runtime entry points, API server, relational schema, cache/graph/vector/outbox adapters and documentation, integration test sources, CI workflow configuration, and the historical benchmark artifact. It did not execute npm ci, the full test suite, Docker, browser E2E, or a local four-store rehearsal.

The combined GitHub commit-status endpoint returned no status entries for d72cc1f. Consequently this document does not claim a green current-commit CI run.

## Phase acceptance matrix

| Phase | Gate | Current disposition |
|---:|---|---|
| 1 | Academic requirements and approved scope | Documented and aligned; research gap remains a candidate hypothesis, not a novelty claim |
| 2 | Repository and implementation audit | Source-level review completed; local clean install and current-commit CI evidence pending |
| 3 | MySQL, Redis, Neo4j and LanceDB architecture | Implementations and architecture docs present; verify all real services in latest current-commit CI |
| 4 | Dataset and provenance | Deterministic synthetic generator documented; USD currency and lack of separate dataset license disclosed; disposable MySQL seed verification pending |
| 5 | Backend and runtime wiring | Live wiring reviewed in scripts/start.ts, scripts/api.ts and scripts/dev.ts; current tests/build and shutdown/outbox execution pending |
| 6 | Frontend workflows | Search, detail, offers/history, customer and admin routes documented; current browser acceptance run pending |
| 7 | Authentication and RBAC | Auth source and MySQL integration coverage reviewed; current CI and browser role-denial/admin evidence pending |
| 8 | Real database demonstrations | CI provisions disposable MySQL/Redis/Neo4j and LanceDB test path; latest run's executed/passed/skipped counts must be attached |
| 9 | Hybrid retrieval and freshness | MySQL keyword, vector and graph providers plus fusion/freshness path present; current-commit E2E evidence pending |
| 10 | Testing, performance and security | Historical benchmark artifact recorded; current full tests/build/security audit and independent qrels review pending |
| 11 | Docker and deployment | Docker/browser workflow configured for Ubuntu 24.04; current browser run and any public deployed-SHA smoke test pending |
| 12 | Documentation/report | Stage B report, SQL catalogue, API, relational schema, provenance and evidence register prepared in this acceptance revision |
| 13 | Demo and viva | 15-minute script and extended viva prepared; live rehearsal and final screenshots pending |

## Historical measured benchmark evidence

The only inspected raw measured artifact in this audit is workflow run [42959976828](https://github.com/Rohith-S636/polyfind/actions/runs/42959976828), generated on 2026-11-11 for commit b90ec799ca083fede1817aaac80b985e2fe59cb1. It used MySQL 8.0.46, 50 seed-42 synthetic products, 100 operations, one warm-up and three repetitions. It is not evidence for current main d72cc1f.

The artifact recorded:
- MySQL-only mean operation latency 1.12 ms; fixed hybrid 8.42 ms; adaptive hybrid+cache 9.42 ms.
- Provisional NDCG@10 0.867 for MySQL-only and 0.887 for hybrid.
- 114/264 (43.18%) non-verified freshness signals for hybrid strategies.
- Relevance judgments manually checked but not independently annotated.

The hybrid workload did not demonstrate a latency advantage. The freshness metric counts stale/unverifiable derived-candidate response status, not stale price/stock displayed; strict mode rejects unverified candidates and final product fields are hydrated from MySQL. The 0.020 NDCG difference is not a significance test.

## Final submission gates

1. Run npm ci, typecheck, script typecheck, full tests and production build on the actual Windows primary checkout; record commit SHA and complete outputs.
2. Inspect the latest GitHub Actions run for that exact SHA and record actual passed/failed/skipped tests plus all four real-store integrations.
3. Confirm Docker/browser E2E passes customer registration/role denial, admin bootstrap/login, product/brand/seller/variant/offer creation and update, public search, seller comparison and price history.
4. Rehearse the 15-minute local Docker demonstration and capture final UI, ERD, SQL, admin, health and CI screenshots.
5. If public hosting is shown, verify deployed SHA, readiness, auth, search, persistence and every configured dependency. Otherwise identify local Docker as the authoritative demonstration.
6. Complete institutional front matter from the approved template; do not invent names, SRNs, guide, department, certificate, or signatures.
7. Obtain independent relevance judgments before making research-quality claims.
8. Do not claim novelty, production readiness, general performance superiority, or universal strong consistency.

## Current completion statement

**Documentation:** Stage B submission documents have been prepared for review.  
**Overall acceptance:** NOT FROZEN. Current-commit CI, real-store/browser execution, local rehearsal, final screenshots and institution-specific front matter remain evidence gates.

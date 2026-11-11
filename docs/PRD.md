# Product Requirements Document — PolyFind

**Status:** Approved academic scope; implementation acceptance is tracked separately in [13-phase master acceptance](13_PHASE_MASTER_ACCEPTANCE.md).  
**Repository:** Rohith-S636/polyfind  
**Scope baseline:** 2026-11-11

## 1. Goal

Build and evaluate a local-first academic product-search application that combines authoritative relational data with cache, graph, and vector retrieval. The system demonstrates how derived retrieval stores can improve candidate discovery while preserving MySQL authority for product identity, price, stock, and version.

This is an implementation and evaluation project, not a commercial marketplace and not a claim of novel foundation-model research.

## 2. Users and roles

- **Public visitor:** browse and search the synthetic catalogue without an account.
- **Customer:** register, sign in, and use customer-level account features; cannot mutate the shared catalogue.
- **Administrator:** manage shared catalogue entities through authenticated, audited operations.
- **Academic evaluator:** inspect database operations, retrieval behavior, test evidence, benchmarks, limitations, and design trade-offs.
- **Maintainer:** run, test, seed, diagnose, and reproduce the project locally.

## 3. Functional requirements

1. Search products by text and structured filters (category, price range, stock, sort, pagination).
2. Display product details and seller-specific offers, including price and availability; retain offer price history.
3. Model categories, brands, products, sellers, variants, offers, users, sessions, audit events, versions, and outbox events.
4. Support customer registration/login and administrator bootstrap/login.
5. Enforce administrator-only catalogue mutations on the server; derive audit actor identity from the authenticated session, never from client-supplied actor IDs.
6. Use MySQL as the authoritative store for catalogue facts and transactional state.
7. Use Redis for cache-aside reads and invalidation; cache failure must degrade to authoritative reads.
8. Use Neo4j for derived product/entity relationships and graph candidate retrieval.
9. Use LanceDB for derived vector candidates. The default no-credential embedding path is deterministic local feature hashing; it is not a pretrained transformer.
10. Combine MySQL, vector, and graph candidate lists using documented weighted fusion; hydrate and freshness-check final records against MySQL.
11. Expose health/readiness and diagnostics that distinguish unavailable or degraded dependencies.
12. Provide deterministic synthetic data generation, safe additive seeding, and repeatable local setup.
13. Provide benchmark commands that preserve raw observations, environment/configuration metadata, and machine-readable summaries.

## 4. Quality and academic requirements

- Correctness: transactional writes, optimistic version checks, idempotent derived-store projection, tombstones, and freshness validation.
- Security: password hashing, hashed session tokens, expiry/revocation, role enforcement, input validation, and login/bootstrap throttling.
- Reliability: graceful startup/shutdown, dependency health checks, cache fallback, and explicit degraded states.
- Reproducibility: fixed seeds, recorded hardware/runtime/configuration, raw benchmark samples, repeated runs, and documented limitations.
- Evidence integrity: fixture data and provisional relevance judgments must not be described as independent empirical results. No performance, relevance, or novelty claim is accepted without a reproducible supporting artifact.
- Maintainability: modular monolith, typed contracts, migrations, automated tests, CI, architecture decisions, and setup documentation.

## 5. Approved architecture and constraints

- Next.js frontend with Node.js/TypeScript modular monolith.
- MySQL is the sole authority for transactional catalogue and account facts.
- Redis is the cache; Neo4j is the graph store; LanceDB is the vector store. Qdrant is excluded.
- Weighted hybrid ranking uses configured source weights (MySQL 0.50, vector 0.35, graph 0.15 as the documented starting configuration); any tuned weights must be versioned and evaluated rather than silently changed.
- Derived stores supply candidate IDs/scores only; final price, stock, identity, and version are re-read from MySQL.
- Deterministic synthetic catalogue data is allowed and must be labelled synthetic. It is not a live Indian retailer feed.
- Target spend is ₹0. The full academic demonstration must run locally with Docker and documented prerequisites. Public hosting is optional and must not be assumed to provide persistent free multi-store infrastructure.
- Existing databases and volumes are protected. Implementation/CI must not migrate or mutate an existing user/deployed database. CI may migrate only its disposable service database.

## 6. Explicit non-goals

- Commercial marketplace operations, payments, orders, or customer checkout.
- Live retailer scraping, live inventory feeds, or real retailer pricing claims.
- Paid embedding/API dependencies or paid cloud services.
- Multiple vector databases; the approved vector store is LanceDB.
- Microservices, city-scale distributed deployment, or claims of global strong consistency.
- Training a new foundation model or claiming the local feature-hashing vectorizer is transformer-level semantic understanding.
- Mobile applications, product reviews, or social features.

## Success criteria

- A new developer can start the local app using the README and `.env.example`, with no undocumented secret.
- MySQL schema, constraints, and transactional update tests pass.
- Search supports structured filtering and at least one semantic retrieval path.
- Derived-store version/freshness behavior is observable and covered by automated tests.
- Tests demonstrate that stale cache/index data cannot silently replace authoritative price/stock values.
- The benchmark harness can replay a fixed query/update workload and emit results with configuration metadata.
- Baselines and the proposed policy are compared under the same dataset and workload.
- Report includes search-quality metrics, freshness violations, latency percentiles, resource/work counts, ablations, limitations, and repeatability details.
- No novelty or performance claim is made without direct evidence.

## Open questions and decision tracking

| Question | Owner | Decision Target / Date | Current Working Status |
|---|---|---|---|
| Which vector database and embedding model/provider will be selected? | Member B | Sprint 1 (`S1-05`) | Resolved: LanceDB is approved; deterministic local feature hashing is the no-credential baseline. |
| Will authentication be required for the demo, or will it remain a single-user local prototype? | Member A | Sprint 1 (`S1-02`) | Resolved: public browsing, customer registration/login, and administrator-only catalogue mutation are in scope. |
| What is the final dataset and source/license? | Member B | Sprint 2 (`S2-02`) | Resolved: deterministic synthetic catalogue data with explicit provenance; no retailer scraping. |
| What is the project deadline and expected sprint duration? | Member A | Sprint 1 milestone review | Six-sprint delivery plan retained in `docs/PARALLEL_WORK_PLAN.md`. |
| What freshness SLA applies to each field class? | Member A | Sprint 1 (`S1-04` / ADR-002) | Resolved: MySQL is authoritative for transactional facts; derived stores are freshness-checked before use. |
| Which baselines are feasible after the literature audit? | Member A | Sprint 1 (`S1-02` / `docs/research.md`) | Resolved for evaluation: MySQL-only, fixed multi-store, fixed hybrid, and cache/freshness baselines; results remain evidence-gated. |

The scope decisions above are closed. Remaining implementation and evidence gates are tracked in `13_PHASE_MASTER_ACCEPTANCE.md`.

## 7. Acceptance and change control

The 13-phase master acceptance record is authoritative for implementation status. A phase is complete only when its code/configuration, tests, documentation, and relevant end-to-end evidence pass. A source file, planned test, skipped integration, fixture benchmark, or green typecheck alone does not satisfy acceptance.

The following earlier draft statements are superseded and are not open questions:
- Authentication is in scope: public browsing plus customer registration/login and administrator-only shared catalogue mutation.
- The vector store is LanceDB; Qdrant is excluded.
- Local Docker is the complete required demonstration environment; public cloud deployment is optional.
- The dataset is deterministic synthetic data with explicit provenance.
- The retrieval strategy is weighted hybrid fusion with MySQL hydration/freshness validation.

## 8. Risks and limitations to disclose

- Synthetic data limits external validity.
- Feature hashing is a lexical vector baseline, not a pretrained semantic model.
- Relevance judgments require review and independent annotation before strong quality claims.
- Benchmark results are environment-, seed-, workload-, and configuration-dependent.
- Browser sessions use HttpOnly, SameSite=Strict cookies (Secure in production); deployment-specific Origin/CSRF verification and shared rate limiting remain hardening requirements.
- Free hosting may sleep, lose ephemeral state, or lack compatible persistent services; local Docker remains the reproducible demonstration path.

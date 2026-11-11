# PolyFind — Academic Implementation and Evaluation Report

**Project:** Freshness-Constrained Adaptive Retrieval Across Heterogeneous Databases  
**Implementation:** Next.js, Node.js, TypeScript, MySQL, Redis, Neo4j, LanceDB  
**Repository:** [Rohith-S636/polyfind](https://github.com/Rohith-S636/polyfind)  
**Report status:** Evidence-aligned draft; performance claims must be populated only from reproducible measured runs.

## Abstract

PolyFind is an academic product-search application that combines an authoritative relational catalogue with derived cache, graph, and vector retrieval components. MySQL owns product and offer facts, versions, users, sessions, audit records, and the transactional outbox. Redis accelerates reads; Neo4j supplies relationship-derived candidates; LanceDB stores vector representations. Candidate sources are combined with weighted reciprocal-rank fusion and final records are hydrated and freshness-checked against MySQL.

The catalogue is deterministic synthetic data. The default no-key vectorizer is a local feature-hashing baseline (word, bigram, and character-trigram features), not a pretrained transformer. The implementation is intended to demonstrate database integration, role boundaries, freshness handling, and reproducible evaluation—not to claim production-grade semantic relevance or live retailer coverage.

## 1. Problem and objectives

Polyglot retrieval systems can combine relational filters, graph relationships, vector similarity, and caching, but derived stores may lag behind transactional writes. PolyFind investigates a simple consistency contract: derived stores may contribute candidate IDs and rankings, while MySQL remains the authority for prices, stock, versions, and identity.

Objectives:
1. provide a searchable synthetic catalogue with structured filters;
2. model products, categories, brands, sellers, variants, offers, and price history;
3. use MySQL transactions, optimistic version checks, audit records, and an outbox;
4. integrate Redis, Neo4j, and LanceDB as derived stores;
5. combine retrieval sources with documented weighted fusion;
6. validate candidate freshness against MySQL;
7. provide customer authentication and administrator-only catalogue mutation;
8. measure correctness, relevance, latency, and resource trade-offs with reproducible experiments.

## 2. Approved architecture

- **MySQL:** authoritative transactional source.
- **Redis:** cache and invalidation index.
- **Neo4j:** derived relationship graph and graph candidate provider.
- **LanceDB:** embedded vector index with a persistent local/Docker path.
- **Search:** MySQL keyword, vector, and graph candidates; weighted reciprocal-rank contributions default to 0.50, 0.35, and 0.15 respectively; final hydration/freshness checks use MySQL.
- **Authentication:** scrypt password hashes, hashed random session tokens, expiry/revocation, admin/customer roles, and authenticated audit actors.
- **Frontend:** public catalogue search/detail, seller offer comparison, price history, login/registration, and admin catalogue workspace.

The default feature-hashing vectorizer is lexical and deterministic. It is not equivalent to MiniLM or any other pretrained sentence-transformer. An external OpenAI-compatible embedding provider is optional and requires separately configured credentials and service availability.

## 3. Data and provenance

The seeded catalogue is generated deterministically using a fixed seed and is synthetic. It is not a licensed Indian retailer dataset and must not be described as live market data. The seed script is additive: existing product/category facts are not overwritten; missing synthetic sellers, variants, and offers are added through repository methods so audit/outbox behavior is preserved.

## 4. Correctness and security design

- MySQL is authoritative for transactional values.
- Product and offer mutations use transactions and optimistic version checks.
- Derived-store updates are delivered through outbox records and are version-aware/idempotent.
- Redis invalidation is part of the write/synchronization lifecycle; cache outages must degrade to authoritative reads.
- Graph/vector results are candidate sources only and are rehydrated against MySQL.
- Customer accounts can register and sign in but cannot perform administrator mutations.
- Admin bootstrap is one-time and token-protected; password hashes use scrypt; only session-token hashes are stored.
- Login, registration, and bootstrap attempts have process-local throttling. This is defense-in-depth, not a distributed rate limiter.
- Browser bearer tokens are currently kept in session-scoped browser storage. An HttpOnly Secure SameSite cookie and CSRF strategy remain production-hardening work.

## 5. Test and integration evidence

Use the latest GitHub Actions workflow as the source of truth. The CI workflow is configured to provision disposable MySQL, Redis, and Neo4j services and to run LanceDB persistence integration using a temporary filesystem path. The MySQL integration test applies migrations only to the disposable CI database.

**Do not insert a test count or claim all integration checks passed until the latest workflow is green.** Record:
- workflow run URL and commit SHA;
- typecheck and script typecheck status;
- total/passed/failed/skipped test counts;
- MySQL, Redis, Neo4j, and LanceDB integration test outcomes;
- production build result;
- any skipped optional-provider tests.

## 6. Benchmark methodology and reporting

The committed baseline fixture contains fixture-labelled environment data and provisional relevance judgments. It is a regression fixture, not evidence of a measured production deployment. **Fixture values are not empirical measurements.** Older draft sections in this report that quoted fixed p95, NDCG, freshness, hardware, or scale figures without raw measured artifacts are superseded by this statement.

A defensible experiment must:
1. record exact commit, Node/npm versions, CPU/RAM/OS, database versions, and service topology;
2. record dataset seed, entity count, query set, relevance judgments, update regime, and repetitions;
3. compare MySQL-only, fixed multi-store, cache-only/TTL, fixed hybrid, and PolyFind weighted/adaptive variants;
4. capture raw per-query latencies, source dispatches, freshness outcomes, and relevance rankings;
5. report p50/p95, confidence intervals or variation, NDCG@10/Precision@10 with reviewed qrels, freshness violation counts, and store dispatches;
6. include negative results, failures, and limitations;
7. commit or attach the generated artifact and analysis script.

No performance superiority claim is made in this draft until those artifacts are produced and independently checked.

## 7. Limitations and threats to validity

- Synthetic catalogue data limits external validity.
- Feature hashing provides lexical similarity, not pretrained semantic understanding.
- Graph retrieval currently expands through category relationships; it does not imply a broad product-compatibility knowledge graph.
- Default fusion weights are explicit but not learned or experimentally optimized.
- Process-local auth throttling is not sufficient for horizontally scaled public deployment.
- Session-scoped browser storage is not the final production browser-session design.
- A successful repository CI run does not prove that a Render deployment is running the same commit or has persistent, healthy external services. **Public hosting is not certified** until the deployed commit and all dependencies are independently smoke-tested.

## 8. Reproducibility

From a clean checkout, use Node.js 22+ and npm 10+:

```bash
npm ci
npm run typecheck
npm run typecheck:scripts
npm test
npm run build
```

For database integration, start the local Docker services, configure `.env`, apply migrations only to the intended disposable/demo database, then run the deterministic seed. Never use the seed or migration commands against an existing production database without an explicit backup and separate authorization.

## 9. Conclusion

PolyFind provides an academic implementation of a MySQL-authoritative catalogue with cache, graph, and vector-derived retrieval. Its contribution is the explicit separation between candidate generation and transactional authority, supported by version-aware projections, outbox delivery, and role-restricted catalogue mutation. The quality of the final research conclusion depends on passing real-store integration tests and producing reproducible benchmark artifacts; no unsupported empirical claims are made here.

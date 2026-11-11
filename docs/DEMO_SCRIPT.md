# PolyFind — 15-minute academic demonstration

> Use this script only with a database seeded from the documented deterministic seed. All catalogue entries are synthetic. Replace any displayed test IDs with IDs returned by the running application. Do not quote fixture benchmark numbers as measured results.

## Pre-demo checks (before the timer)
- Run `npm run typecheck`, `npm run typecheck:scripts`, `npm test`, and `npm run build`.
- Start MySQL, Redis, and Neo4j with Docker Compose; start LanceDB through the application.
- Run migrations only on the intended disposable/demo database, then run `npm run seed -- --seed=42 --count=50`.
- Confirm `GET /api/health` and `GET /api/ready`.
- Confirm the admin account exists; remove the bootstrap token from the environment after first use.
- Keep the GitHub Actions run and the benchmark methodology open as backup evidence.

## 0:00–1:00 — Problem and motivation
Explain the problem: search systems need relational filters, text/vector similarity, and relationships, but derived stores can lag behind transactional facts. PolyFind keeps MySQL authoritative and treats Redis, Neo4j, and LanceDB as derived retrieval infrastructure.

## 1:00–2:30 — Architecture and data authority
Show the architecture diagram. Explain:
- MySQL owns products, sellers, offers, versions, price history, users, roles, audit, and outbox.
- Redis accelerates reads and is invalidated on writes.
- Neo4j supplies relationship-derived candidate IDs.
- LanceDB supplies vector-similarity candidates.
- All final product facts are hydrated and freshness-checked from MySQL.

## 2:30–4:00 — Dataset and relational model
Show the deterministic seed command and schema. Demonstrate products, categories, brands, sellers, variants, offers, and price-history records. Explicitly say the catalogue is synthetic, not a live retailer feed.

## 4:00–6:00 — Public search experience
Open the search UI. Search for a seeded product term, apply a category and price filter, change sorting, paginate, and open a product detail page. Explain that the MySQL result is the authoritative record.

## 6:00–8:00 — Seller price comparison and history
Open a product with seeded offers. Compare seller prices and availability. Show the offer price-history table. Explain versioned offer updates and why price history is preserved rather than hard-deleted.

## 8:00–10:00 — Customer and administrator access
Register a customer account and sign in. Explain that customer role cannot mutate catalogue data. Sign out and sign in as the administrator. Open `/admin`; create a product, seller, brand, variant, and offer. Show that the UI calls protected APIs and audit actor identity comes from the authenticated session.

## 10:00–12:00 — Multi-store retrieval and freshness
Show health diagnostics and explain the three candidate sources. Describe the default weighted reciprocal-rank contributions (MySQL 0.50, vector 0.35, graph 0.15). Be precise: the no-key local vectorizer is deterministic feature-hashing, not a pretrained semantic model. Demonstrate the outbox and version/freshness safeguards from the integration test evidence.

## 12:00–13:30 — Database and correctness evidence
Show the latest passing GitHub Actions run. Point out the disposable MySQL integration, Redis cache integration, Neo4j projection integration, and LanceDB persistence integration. If any integration step is skipped or failed, state that plainly; do not present it as passed.

## 13:30–15:00 — Limitations and conclusion
State the limitations:
- synthetic data only;
- local feature hashing is lexical vector similarity, not transformer semantic understanding;
- benchmark claims require reproducible measured artifacts and reviewed relevance judgments;
- public hosting is not certified until the deployed commit and all dependencies are smoke-tested;
- browser sessions use an HttpOnly, SameSite=Strict cookie (Secure in production); deployment-specific Origin/CSRF verification and shared rate limiting remain hardening work.
Conclude: PolyFind demonstrates an authoritative relational core with derived cache, graph, and vector retrieval, with freshness and role boundaries that are testable.

## Extended viva backup
Be ready to explain schema constraints, transaction boundaries, optimistic locking, outbox leases/retries/dead letters, cache invalidation, graph projection idempotency, vector tombstones, weighted reciprocal-rank fusion, freshness validation, role enforcement, synthetic-data provenance, benchmark limitations, and why hard deletes are not exposed where they could erase price history.

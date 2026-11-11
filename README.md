# PolyFind

PolyFind is an academic product-discovery application and DBMS capstone. It demonstrates a MySQL-authoritative catalogue with Redis caching, Neo4j relationship retrieval, LanceDB vector similarity, freshness validation, seller offers, price history, and administrator-controlled catalogue management.

> **Project status:** active academic implementation. The repository contains a working application foundation and database adapters; deployment, external-service integration, and performance claims must be judged from the latest CI evidence rather than older README screenshots or reports.

## Approved architecture

- **Application:** Next.js + Node.js + TypeScript modular monolith.
- **Source of truth:** MySQL. Product facts, prices, stock, versions, users, roles, sessions, audit records, and outbox events are relationally authoritative.
- **Cache:** Redis, with product/listing invalidation and cache health reporting.
- **Graph:** Neo4j, used for graph-derived candidate retrieval and projections.
- **Vector store:** LanceDB embedded in the application filesystem. Docker Compose mounts a persistent volume at `/app/data/lancedb`.
- **Search:** MySQL keyword candidates, vector candidates, and graph candidates are combined using weighted reciprocal-rank fusion. MySQL hydration and freshness validation remain authoritative.
- **No Qdrant:** Qdrant is not part of the approved architecture.

### Embedding and ranking limitations

When no external embedding endpoint is configured, PolyFind uses a deterministic local feature-hashing vectorizer (word, bigram, and character-trigram features). This is a reproducible lexical-vector baseline; it is **not** a pretrained transformer or a claim of deep semantic understanding. An OpenAI-compatible embedding endpoint can be configured separately.

The current default weighted reciprocal-rank contributions are MySQL 0.50, vector 0.35, and graph 0.15. These are implementation weights, not empirically optimized weights. The graph provider currently uses direct text matches and one-hop category-neighbour expansion. Search results are always rehydrated and freshness-checked against MySQL.

## Features

- Public product search, category/price/stock filters, sorting, pagination, and product detail pages.
- Seller offer comparison and per-product offer price history.
- Customer registration and login.
- One-time first-administrator bootstrap and an admin workspace for product, brand, seller, variant, and offer creation.
- Version-aware product/offer updates, audit attribution, and transactional outbox delivery.
- Deterministic synthetic catalogue generation. Synthetic records are not retailer feeds and must not be presented as live Indian-market listings.
- Health and readiness endpoints for operational diagnostics.

## Requirements

- Node.js 22+
- npm 10+
- Docker Desktop with WSL2 for the complete local database stack

## Clean install and checks

```bash
git clone https://github.com/Rohith-S636/polyfind.git
cd polyfind
npm ci
npm run typecheck
npm run typecheck:scripts
npm test
npm run build
```

The standard GitHub Actions workflow provisions disposable MySQL, Redis, and Neo4j services and runs the LanceDB persistence integration against a temporary path. Inspect the latest workflow run for the actual result; do not rely on historical test counts.

## Local Docker database setup

1. Copy the example configuration:

   ```powershell
   Copy-Item .env.example .env
   ```

2. Change the local-only passwords and set a random `AUTH_BOOTSTRAP_TOKEN` of at least 32 characters. Keep `.env` untracked.

3. Start the database services:

   ```bash
   docker compose up -d mysql redis neo4j
   ```

4. Run migrations only against the database you intentionally configured in `.env`:

   ```bash
   npm run migrate
   npm run seed -- --seed=42 --count=50
   ```

   The seed operation is additive: it leaves existing products and categories unchanged and creates missing synthetic sellers, variants, and offers through repository operations. Do not point it at production data.

5. Start the application:

   ```bash
   docker compose up --build app
   ```

The app container connects to the Compose services and stores LanceDB files in its named volume. Do not delete volumes as a troubleshooting shortcut; back up data before any intentional volume operation.

## Local development without the full stack

```bash
npm run dev
```

The frontend is served at `http://localhost:3000`; the API is normally at `http://127.0.0.1:3001`. Demo mode uses a deterministic in-memory product catalogue. It does not prove MySQL or derived-store integration.

## First administrator and user access

- Open `/login`.
- For the first administrator only, choose **First-time administrator setup**, provide email, a password of at least 12 characters, and the one-time `AUTH_BOOTSTRAP_TOKEN`.
- Remove `AUTH_BOOTSTRAP_TOKEN` from the deployment environment after the administrator is created.
- Customers can register at `/register`; customer accounts cannot mutate the shared catalogue.
- Administrators can use `/admin` to add products, brands, sellers, variants, and offers, and inspect offer history.

The browser currently holds the bearer session token in session-scoped storage. Treat this as a prototype security limitation; production-grade browser authentication should use an HttpOnly, Secure, SameSite cookie with CSRF protection before exposing the app to untrusted traffic.

## API overview

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | Service and dependency health |
| `GET /api/ready` | Readiness status |
| `GET /api/products` | Paginated authoritative catalogue |
| `GET /api/products/:id` | Product detail |
| `POST /api/search` | Keyword/vector/graph candidate retrieval, weighted fusion, MySQL freshness validation |
| `GET /api/offers?productId=...` | Seller offers for a product |
| `GET /api/price-history?productId=...` | Offer price history |
| `POST /api/auth/register` | Customer registration |
| `POST /api/auth/login` | Session login |
| `POST /api/auth/bootstrap` | One-time first-admin setup |
| `POST /api/auth/logout` | Session revocation |
| `GET /api/auth/me` | Current authenticated principal |

Catalogue mutations require an authenticated administrator. Client-supplied actor IDs are ignored; audit attribution comes from the authenticated principal.

## Deployment notes

The repository has previously been connected to a Render service, but a current deployment is not certified by a green repository build alone. Before calling a public deployment complete, verify that the deployed commit matches the audited `main` HEAD, that the target MySQL schema has been migrated intentionally, and that Redis, Neo4j, and LanceDB persistence are configured and healthy. A free web-service tier does not automatically provide four persistent database services or guarantee a zero-cost production architecture.

## Academic evidence and limitations

- The catalogue is synthetic and deterministic.
- The local feature-hashing vectorizer is a lexical similarity baseline, not MiniLM.
- The relevance judgments are provisional unless replaced by a reviewed qrels set.
- Fixture benchmark values are not empirical production measurements.
- Report hardware, dataset, workload, repetitions, raw outputs, confidence intervals, and failure cases for every performance claim.
- See [the 13-phase acceptance audit](docs/13_PHASE_MASTER_ACCEPTANCE.md), [the final report](docs/FINAL_REPORT.md), and [viva preparation](docs/VIVA_PREPARATION.md).

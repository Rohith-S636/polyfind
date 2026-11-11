# PolyFind Local Setup

This guide describes the supported local development and database demonstration path. The application is a Next.js + Node.js + TypeScript modular monolith. MySQL is authoritative; Redis, Neo4j, and LanceDB are derived services.

## Requirements

- Node.js 22+
- npm 10+
- Docker Desktop with WSL2 (recommended for the complete database stack)
- TypeScript 5.8+ (installed by npm)

## Environment configuration

Copy the committed example and replace every local password placeholder with your own local-only values:

```powershell
Copy-Item .env.example .env
```

Never commit `.env` or credentials. Generate distinct local passwords and keep `NEO4J_AUTH` in `username/password` form with the same password as `NEO4J_PASSWORD`. If a Neo4j Docker volume already exists, retain the password that was used when that volume was initialized; changing the environment value does not rotate credentials inside an existing database. This setup does not modify or reset existing volumes.

Main variables:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | MySQL authoritative catalogue |
| `MYSQL_PASSWORD`, `MYSQL_ROOT_PASSWORD` | Local Compose credentials |
| `REDIS_URL` | Redis cache |
| `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD`, `NEO4J_DATABASE` | Neo4j graph projection |
| `LANCEDB_PATH`, `LANCEDB_TABLE` | Embedded LanceDB storage |
| `POLYFIND_LOCAL_EMBEDDINGS` | Enables the deterministic no-key local feature-hashing vectorizer |
| `EMBEDDING_ENDPOINT`, `EMBEDDING_MODEL`, `EMBEDDING_API_KEY` | Optional OpenAI-compatible embedding provider |
| `AUTH_BOOTSTRAP_TOKEN` | One-time initial administrator bootstrap secret |

The default local vectorizer is lexical feature hashing, not a pretrained semantic model. No embedding API key is needed for the local baseline.

## Full local database stack

Start MySQL, Redis, and Neo4j:

```bash
docker compose up -d mysql redis neo4j
```

Run migrations only against the database selected in your local `.env`:

```bash
npm run migrate
npm run seed -- --seed=42 --count=50
```

The seed is additive and creates missing synthetic products, sellers, variants, and offers. It does not overwrite existing product prices, stock, or versions. Do not point it at a production database.

Start the full application stack:

```bash
docker compose up --build app
```

LanceDB runs embedded in the app and persists at `/app/data/lancedb` through a named Compose volume. Do not delete named volumes to troubleshoot; back up data before intentional changes.

## Run only the application in demo mode

```bash
npm ci
npm run dev
```

Demo mode uses a deterministic in-memory product catalogue. It is useful for frontend development but does not prove MySQL or external derived-store integration.

## Verification

```bash
npm run typecheck
npm run typecheck:scripts
npm test
npm run build
```

GitHub Actions runs disposable MySQL, Redis, and Neo4j services and tests LanceDB persistence on a temporary filesystem path. Use the latest workflow run for the current pass/fail result.

## Optional browser acceptance test

The Playwright journey covers customer registration and role denial, first-admin bootstrap/login, product/brand/seller/variant/offer creation, offer update and price history, public search, and seller price comparison.

Run it **only against a disposable local catalogue**. It creates accounts and catalogue records and is not a cleanup/reset script. CI runs it against fresh Compose volumes and removes those CI-only volumes afterwards.

```powershell
npm install --no-save @playwright/test@1.57.0
npx playwright install chromium
$env:POLYFIND_E2E_BASE_URL = "http://localhost:3000"
$env:POLYFIND_E2E_BOOTSTRAP_TOKEN = "<the AUTH_BOOTSTRAP_TOKEN from your disposable .env>"
npx playwright test e2e/polyfind.spec.mjs --workers=1
```

## Authentication

- Public browsing and search are anonymous.
- Customers register at `/register` and sign in at `/login`.
- The first administrator is created once using `AUTH_BOOTSTRAP_TOKEN` and a password of at least 12 characters.
- Remove the bootstrap token after first-admin creation.
- The API sets an HttpOnly, SameSite=Strict session cookie for browser use and continues to accept bearer tokens for API clients.
- Catalogue mutation endpoints require the administrator role.

## Local URLs

- Web: `http://localhost:3000`
- API: `http://127.0.0.1:3001`
- Neo4j browser: `http://localhost:7474`
- MySQL: `localhost:3306`
- Redis: `localhost:6379`

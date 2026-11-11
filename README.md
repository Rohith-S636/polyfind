# PolyFind

PolyFind is a research-oriented multi-database search application exploring freshness-constrained adaptive retrieval across heterogeneous databases.

## Clean-room setup and verification

PolyFind is a local-first TypeScript research prototype. The deterministic
verification path does not require MySQL, Redis, Neo4j, a vector service, or
any real credentials. Node.js 20+ and npm 10+ are recommended.

### 1. Clone and install

```bash
git clone https://github.com/Mitxh13/polyfind.git
cd polyfind
npm install
```

On Windows PowerShell, use `Set-Location` or open the cloned directory in VS
Code. Do not commit a `.env` file.

### 2. Configure only if using the optional database path

```bash
cp .env.example .env
```

Use `Copy-Item .env.example .env` in PowerShell. `.env.example` documents the
variable names; replace placeholders only with local, uncommitted values. The
offline tests and deterministic benchmark export do not require this file.

### 3. Run the deterministic verification

```bash
npm run typecheck
npm test
```

The full suite covers contracts, catalog behavior, retrieval, freshness,
failure handling, benchmark statistics, documentation, and acceptance
integrity.

### 4. Optional MySQL migration and deterministic seed

Start a local MySQL instance and configure `DATABASE_URL` in `.env`, then run:

```bash
npm run migrate
npm run seed -- --seed=42 --count=50
```

Migration requires a reachable MySQL server. The seed script always validates
the deterministic dataset and inserts it only when `DATABASE_URL` is set;
without a reachable database it reports the live insertion failure and exits
after the local generation path. Never use production credentials.

For the complete catalogue model, synthetic-data labeling, safe reset guidance,
and supported optional-service boundaries, see
[`docs/CATALOGUE_DATA_READINESS.md`](docs/CATALOGUE_DATA_READINESS.md).

### 5. Export the benchmark artifact

```bash
npx tsx scripts/export-baseline-visualization.ts
```

This writes `results/baseline-comparison.json`, which is generated and ignored
by Git. The committed
[`test/fixtures/baseline-comparison.json`](test/fixtures/baseline-comparison.json)
is the stable evidence used by documentation tests. See
[`docs/ACCEPTANCE_CHECKLIST.md`](docs/ACCEPTANCE_CHECKLIST.md) for the complete
PRD mapping and [`docs/VIVA_PREPARATION.md`](docs/VIVA_PREPARATION.md) for
defense notes.

### 6. Read the project contracts

1. Read [`AGENTS.md`](AGENTS.md).
2. Review [`docs/PRD.md`](docs/PRD.md),
   [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), and the ADRs.
3. Use [`docs/FINAL_REPORT.md`](docs/FINAL_REPORT.md) and
   [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md) for the final presentation.

## Current repository status

The repository contains the implemented research prototype, deterministic
benchmark harness, and optional local database migrations. It is not a
production deployment. It includes a local deterministic demo API via
`npm run api`; do not treat
the placeholder values in `.env.example` as working credentials.

### Interactive Next.js Frontend & Unified Development

PolyFind provides a full Next.js + TypeScript browser search interface connected to the backend retrieval and freshness pipeline:

- **Start development (Web + API together)**:
  ```bash
  npm run dev
  ```
  Starts the API server at `http://127.0.0.1:3001` and the Next.js development server at [http://localhost:3000](http://localhost:3000).

- **Production build & start**:
  ```bash
  npm run build
  npm run start
  ```

- **Standalone API server**:
  ```bash
  npm run api
  ```
  Runs the API on `http://127.0.0.1:3001` (or configured `$PORT` / `$API_PORT`).

### Local URLs

| Surface | URL | Description |
|---|---|---|
| **Web Frontend** | `http://localhost:3000` | Browser interface: search bar, category navigation, price/stock filters, sorting, product detail modals, and dedicated product pages |
| **API Health** | `http://127.0.0.1:3001/api/health` | Health status and optional dependency diagnostic states |
| **API Products** | `http://127.0.0.1:3001/api/products` | Authoritative catalogue products with bounded pagination, filters, and sorting |
| **API Search** | `http://127.0.0.1:3001/api/search` | Search pipeline endpoint supporting both `GET` and `POST` with freshness verification |

*(Note: In the browser, Next.js rewrites `/api/*` requests directly to the backend API server).*

### API Endpoints Summary

- `GET /api/health`: Health status and dependency availability.
- `GET /api/products`: Lists products with pagination (`page`, `limit`), filters (`category`/`categoryId`, `minPrice`, `maxPrice`, `inStock`), and sorting (`relevance`, `name`, `price`, `updatedAt`).
- `GET /api/products/:id`: Retrieves canonical product facts. Returns 404 for unknown IDs.
- `POST /api/search`: Evaluates query constraints, executes retrieval planning, deduplicates candidates with deterministic tie-breaking, validates freshness against the authoritative store, and returns ranked products with timing metrics.
- `GET /api/search?q=...`: Compatibility search query endpoint.

## Current Project direction
**PolyFind: Freshness-Constrained Adaptive Retrieval Across Heterogeneous Databases**

The project investigates whether retrieval decisions informed by query characteristics, source versions/freshness, and observed execution costs can improve the trade-off between search relevance, freshness correctness, latency, and resource usage.

This is a hypothesis to test, not a proven novelty claim. The literature review must be extended and the closest prior systems compared before claiming a research gap.

## Planned stack
- Frontend/application: Next.js + TypeScript
- Authoritative relational store: MySQL
- Cache: Redis
- Relationship retrieval: Neo4j
- Semantic retrieval: one vector database, selected through a documented evaluation
- Testing/benchmarking: automated tests and a reproducible benchmark harness

## Parallel team ownership

- **Member A (17 slices):** S1-01, S1-02, S1-04, S2-01, S2-03, S2-04, S3-01, S3-05, S4-01, S4-03, S4-04, S5-01, S5-02, S5-05, S6-01, S6-03, S6-05.
- **Member B (13 slices):** S1-03, S1-05, S2-02, S2-05, S3-02, S3-03, S3-04, S4-02, S4-05, S5-03, S5-04, S6-02, S6-04.

Every slice has one directly responsible owner; there are no shared/co-owned slices. Both members work in parallel from the beginning using published contracts, fixtures, mocks, and stub adapters. The other member may review a PR without becoming a co-owner. Integration proceeds incrementally and must not block independent work.

## Active sprint and slice status

- **Active Sprint:** [Sprint 1 — Research and foundation](docs/sprints/sprint-01.md)
- **Active Slices:**
  - `S1-01` — [Repository and contributor workflow](docs/slices/s1-01-repository-and-contributor-workflow.md) (Owner: Member A) — Completed
  - `S1-02` — [Requirements and research-gap review](docs/slices/s1-02-requirements-and-research-gap-review.md) (Owner: Member A) — Completed
  - `S1-03` — [Local development configuration](docs/slices/s1-03-local-development-configuration.md) (Owner: Member B)
  - `S1-04` — [Architecture contracts and module skeleton](docs/slices/s1-04-architecture-contracts-and-module-skeleton.md) (Owner: Member A) — Completed
  - `S1-05` — [Vector-store and embedding spike](docs/slices/s1-05-vector-store-and-embedding-spike.md) (Owner: Member B)
- **Full Slice Roadmap:** See [docs/PARALLEL_WORK_PLAN.md](docs/PARALLEL_WORK_PLAN.md) for all 30 slices across Sprints 1–6.

## Contributor workflow and conventions

All team members and agents follow the rules in `AGENTS.md` and the parallel execution plan:

### 1. Branch naming convention
- Feature branches: `feature/<slice-id>-<short-description>` (e.g. `feature/S1-01-repository-baseline`)
- Fix branches: `fix/<slice-id>-<short-description>` (e.g. `fix/S3-02-version-metadata`)

### 2. Commit message convention
- Format: `[<slice-id>] <Imperative summary>`
- Example: `[S1-01] Establish repository baseline`

### 3. Pull request (PR) convention
- **PR Title:** `[<slice-id>] <Summary>` (e.g. `[S1-01] Establish repository baseline`)
- **PR Description Requirements:**
  - Slice ID reference
  - Acceptance criteria checked (`- [x]`)
  - Commands and tests run (`npm test`, `npm run typecheck`)
  - Evidence attached (test outputs, benchmark runs, or screenshots if UI)
  - Limitations, changed assumptions, or follow-up issues

### 4. Issue-to-slice traceability and ownership
- Every task, branch, and PR links directly to one slice file in `docs/slices/`.
- Every slice has exactly one directly responsible owner; joint ownership is not permitted.
- Work proceeds in parallel using published contracts (`src/contracts/`, `docs/contracts.md`), mocks, and fixtures without blocking on upstream implementations.

### 5. Secrets and generated data hygiene
- `.env.example` is the sole variable-name reference; never commit real credentials or `.env` files.
- Never commit private keys (`.pem`, `.key`, `id_rsa`) or unapproved datasets.
- Derived and generated data are excluded from source control via `.gitignore`:
  - `results/`
  - `artifacts/`
  - `data/generated/`
  - `node_modules/`, `build/`, `dist/`, `.next/`, `coverage/`

## Documentation map
- `docs/research.md` — problem framing and related-work audit plan
- `docs/PRD.md` — scope and success criteria
- `docs/ARCHITECTURE.md` — system design and API contract
- `docs/decisions/` — decisions worth recording
- `docs/sprints/` — feature-level implementation chunks
- `docs/slices/` — individually executable, testable tasks
- `docs/contracts.md` — S1-04 typed boundaries, validation, interfaces, and examples
- `AGENTS.md` — coding-agent operating rules

## Public deployment

The supported deployment shape is one Node.js service running the Next.js
frontend and API process, with managed MySQL as the authoritative catalogue.
The frontend rewrite keeps database credentials server-side. Do not deploy
with `CATALOG_MODE=demo` when presenting production data.

Production requires `NODE_ENV=production`, `CATALOG_MODE=live`, a reachable
`DATABASE_URL`, `APP_URL`, `PORT`, `API_PORT`, `CORS_ORIGIN`, and a bounded
`RATE_LIMIT_MAX`. Live startup fails instead of falling back to demo data.

```powershell
npm ci
npm run migrate
npm run seed -- --seed=42 --count=50
npm run check:production
npm run start
```

The [Dockerfile](Dockerfile) and
[docker-compose.yml](docker-compose.yml) provide a repeatable local
production-like setup with a persistent MySQL volume. Compose credentials are
placeholders only; replace them through an uncommitted environment override.
Semantic/vector retrieval is not claimed as production-persistent until a
managed provider is configured and verified.

## Live Public Deployment

PolyFind is publicly deployed and accessible at:
- **Public URL:** [https://polyfind.onrender.com](https://polyfind.onrender.com)
- **Status:** Active & Verified
- **Hosting:** Render Web Service (Docker container)
- **Public Endpoints Verified:**
  - GET / � Interactive Next.js 16 Web UI (Catalog, Search, Structured Filters, Details Modal)
  - GET /api/health � Returns application health and dependency statuses
  - GET /api/products � Product catalog listing with pagination and filters
  - GET /api/search?q=lantern � Ranked search with freshness validation and strategy metadata

### Execution Modes and Store Architecture

PolyFind supports three operational modes:

| Mode | Command / Variable | Catalog Data Store | Derived Stores (Redis, Graph, Vector) | Use Case |
| :--- | :--- | :--- | :--- | :--- |
| **Demo Mode** | `CATALOG_MODE=demo` | In-memory deterministic dataset (50 items) | In-memory adapters | Zero-dependency deployment & public demo |
| **Local Real-DB Mode** | `CATALOG_MODE=live` | Local native MySQL 8.0 (authoritative transactional facts) | Running in Docker Compose (Redis 8, Neo4j 5, Qdrant) | Local development, benchmarking & integration testing |
| **Production Mode** | `CATALOG_MODE=live` + cloud `DATABASE_URL` | Cloud-managed MySQL | Configured external managed services | Enterprise live deployment |

### Adapter Integration Reality
- **MySQL:** **Real Integration** � Fully integrated using `mysql2/promise` with transactions, composite indexes, foreign key constraints, and migrations (`migrations/001..003`).
- **Redis:** In-memory TTL Map adapter (tested against Docker Redis container fallback).
- **Neo4j:** Real Neo4j 5 driver-backed derived graph adapter with an explicit in-memory test double; projection workers remain deferred.
- **Vector Store:** In-memory columnar spike vector store with deterministic 384-dimensional unit embeddings. Docker Qdrant service is running and verified for future external binding.

### Deployment Procedure
The production image is built automatically from GitHub via the root multi-stage [Dockerfile](Dockerfile):
1. **Build Stage:** `node:22-bookworm-slim`, compiles Next.js pages and TypeScript contracts into optimized standalone bundles.
2. **Runtime Stage:** Minimal Node 22 slim image running `npm run start` (`scripts/start.ts`), which concurrently hosts the API daemon on port 3001 and Next.js frontend on port 3000.
3. **Environment:** Secrets and ports configured securely via the hosting provider's environment variables. All secrets remain excluded from git.
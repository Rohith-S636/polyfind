# Local Development & Environment Configuration Guide

This guide describes how to configure the local development environment for PolyFind across supported runtime versions and the heterogeneous database stores.

## 1. Supported Runtime Versions

- **Node.js**: `v20.x` or `v22.x+` (LTS recommended)
- **TypeScript**: `v5.8+`
- **Operating Systems**: Linux, macOS, or Windows (WSL2 / PowerShell)
- **Databases**:
  - **MySQL**: 8.0+
  - **Redis**: 7.0+
  - **Neo4j**: 5.x Community or Enterprise
  - **Vector Store**: Local embedded (LanceDB or Chroma)

---

## 2. Environment Variables Specification

All application configuration is driven through environment variables. Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

| Variable | Description | Example / Default | Required In |
|---|---|---|---|
| `NODE_ENV` | Runtime environment (`development`, `test`, `production`) | `development` | All |
| `APP_URL` | Application base URL | `http://localhost:3000` | All |
| `DATABASE_URL` | Authoritative MySQL connection URL | `mysql://polyfind:localpass@localhost:3306/polyfind` | Catalog, Migrations |
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379` | Cache adapter |
| `NEO4J_URI` | Neo4j Bolt connection protocol URI | `bolt://localhost:7687` | Graph retrieval |
| `NEO4J_USERNAME` | Neo4j database user | `neo4j` | Graph retrieval |
| `NEO4J_PASSWORD` | Neo4j database password | (never commit) | Graph retrieval |
| `NEO4J_DATABASE` | Neo4j database name | `neo4j` | Graph adapter |
| `VECTOR_STORE_PROVIDER`| Selected vector store (`lancedb`, `chroma`, or `memory`) | `lancedb` | Semantic retrieval |
| `VECTOR_STORE_URL` | URL or directory path for vector store persistence | `./data/vectors` | Semantic retrieval |
| `EMBEDDING_PROVIDER` | Embedding provider (`mock`, `transformers`, `openai`) | `mock` | Semantic ingestion |
| `EMBEDDING_MODEL` | Embedding model identifier | `all-MiniLM-L6-v2` | Semantic ingestion |
| `AUTH_SECRET` | Secret token used for internal API verification | (random string) | Production/Auth |

> [!CAUTION]
> Never commit `.env` or any file containing real passwords or API keys to version control. The `.gitignore` enforces this rule.

---

## 3. Local Database Setup Instructions

You can run each database natively or via standard Docker containers.

### A. MySQL (Authoritative Relational Store)
```bash
# Docker quickstart:
docker run -d --name polyfind-mysql \
  -e MYSQL_ROOT_PASSWORD=rootpass \
  -e MYSQL_DATABASE=polyfind \
  -e MYSQL_USER=polyfind \
  -e MYSQL_PASSWORD=localpass \
  -p 3306:3306 \
  mysql:8.0

# Run migrations:
npm run migrate
```

### B. Redis (Query Signals & Invalidation Cache)
```bash
# Docker quickstart:
docker run -d --name polyfind-redis \
  -p 6379:6379 \
  redis:7-alpine

# Test connection:
redis-cli -h localhost -p 6379 ping
# Response should be PONG
```

### C. Neo4j (Entity Relationship Graph)
```bash
# Docker quickstart:
docker run -d --name polyfind-neo4j \
  -e NEO4J_AUTH=neo4j/localgraphpass \
  -p 7474:7474 -p 7687:7687 \
  neo4j:5-community

# Cypher Browser accessible at: http://localhost:7474
```

### D. Vector Store (LanceDB / Local Embedded)
- By default, `lancedb` operates in-process with files persisted locally under `data/vectors/` (ignored by git).
- No external container is required for local embedded operation.

---

## 4. Verification and Health Check

Run the test suite to verify configuration contracts and technology-neutral boundaries:

```bash
npm install
npm test
npm run typecheck
```

For a deterministic browser demo, set `CATALOG_MODE=demo` and run
`npm run dev`. This mode is explicit and uses the seed-42 in-memory catalogue.
For a live local run, set `CATALOG_MODE=live`, configure a reachable
`DATABASE_URL`, run `npm run migrate` and `npm run seed -- --seed=42 --count=50`,
then use `npm run start`. Live startup fails instead of substituting demo data
when MySQL is unavailable.

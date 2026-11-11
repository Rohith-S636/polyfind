# Phase 7 LanceDB and Embedding Integration

LanceDB is a persistent derived vector index. MySQL remains authoritative for
product records, versions, prices, stock, and deletion decisions.

## LanceDB record schema

The configured table contains:

| Column | Meaning |
|---|---|
| `id` | Stable MySQL product ID |
| `vector` | Fixed-size embedding vector |
| `name` | Minimal retrieval metadata |
| `categoryId` | Minimal filter metadata |
| `price` | Filter metadata copied from MySQL |
| `inStock` | Filter metadata copied from MySQL |
| `version` | MySQL source product version |
| `modelName` | Embedding model identity |

Product text is generated from normalized name, category ID, and description
through `buildProductEmbeddingText`.

## Configuration

`LANCEDB_PATH` and `LANCEDB_TABLE` select the local persistent index.
`EMBEDDING_ENDPOINT`, `EMBEDDING_API_KEY`, `EMBEDDING_MODEL`,
`EMBEDDING_DIMENSIONS`, and `EMBEDDING_TIMEOUT_MS` configure the
OpenAI-compatible embedding provider. The provider is never replaced with a
fake implementation in production.

At startup, `VectorRuntime` opens LanceDB independently of Redis and Neo4j. A
successful table initialization makes the store ready; semantic retrieval is
registered only when an embedding endpoint, API key, and model are all
configured. Missing provider configuration leaves the vector subsystem
degraded while MySQL-backed catalogue operations continue. LanceDB resources
are closed idempotently during application shutdown.

`/api/health` reports the current vector state, table readiness, provider
configuration state, and an explicit `embeddingVerified: false` value until an
opt-in provider verification request has actually succeeded. Health checks do
not make paid embedding requests.

## Consistency and failure behavior

Upserts match on product ID and only replace a row when the incoming version is
at least as new as the indexed version. Vector dimensions and finite numeric
values are validated before writes and queries. LanceDB or embedding-provider
failure is surfaced to the caller; it does not replace or mutate MySQL data.
Rebuilding the index should read current products and re-ingest them from
MySQL. Changing model or dimensions requires a new table or explicit rebuild.
The application does not automatically index or synchronize products; that
responsibility remains outside Phase 7.

The real integration test is opt-in:

```powershell
$env:POLYFIND_LANCEDB_TEST_PATH = "$pwd\.test-data\lancedb"
npx tsx --test test/lancedb.test.ts
```

Only the configured test directory is removed by that test. No production
default path is used automatically.

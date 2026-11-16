# Phase 7 LanceDB and Embedding Integration

**Current implementation note (2026-11-16):** LanceDB is integrated as a
persistent derived vector index. MySQL remains authoritative for product
identity, versions, prices, stock, and deletion decisions. Initial product
indexing and transactional-outbox updates/deletes are implemented in the
application startup and synchronization paths.

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
| `deleted` | Tombstone flag; deleted rows are excluded from retrieval |
| `sourceSystem` | Ownership marker for safe projection updates/deletes |
| `modelName` | Embedding model identity |

Product text is generated from normalized product fields through
`buildProductEmbeddingText`.

## Embedding configuration

`LANCEDB_PATH` and `LANCEDB_TABLE` select the local persistent index.
`EMBEDDING_ENDPOINT`, `EMBEDDING_API_KEY`, `EMBEDDING_MODEL`,
`EMBEDDING_DIMENSIONS`, and `EMBEDDING_TIMEOUT_MS` configure the optional
OpenAI-compatible embedding provider.

By default, when no remote provider is fully configured and
`POLYFIND_LOCAL_EMBEDDINGS` is not set to `false`, PolyFind uses a deterministic
local feature-hashing embedder. Its model identifier defaults to
`polyfind-feature-hash-v1`. This is a reproducible lexical vector baseline; it
is **not** a pretrained transformer or evidence of deep semantic understanding.
A separately configured remote provider is optional and is not required for the
local academic demonstration.

`VectorRuntime` opens LanceDB independently of Redis and Neo4j. Semantic retrieval
is registered only when a usable embedder and store are available. Missing or
failed vector configuration degrades vector retrieval without replacing or
mutating MySQL data. Health reports vector/store/provider state; health checks do
not make paid embedding requests.

## Initial indexing and incremental synchronization

In live mode, application startup reads authoritative catalogue pages from
MySQL and ingests them into LanceDB when a semantic provider is available.
Product mutations are written to the MySQL transactional outbox in the same
transaction as the authoritative change. The LanceDB outbox target applies
version-aware upserts and versioned tombstones. Older events cannot overwrite a
newer indexed version. Reopening the local LanceDB path preserves the index.

Changing embedding model or dimensions requires an explicit rebuild or a new
table; do not mix incompatible vector dimensions in one table.

## Integration verification

The real LanceDB integration test uses an explicitly configured disposable path:

```powershell
$env:POLYFIND_LANCEDB_TEST_PATH = "$pwd\.test-data\lancedb"
npx tsx --test test/lancedb.test.ts
```

Only the configured test directory is removed by that test. The GitHub Actions
verification workflow supplies `POLYFIND_LANCEDB_TEST_PATH` and runs the real
persistence integration test. The optional remote embedding-provider
verification remains separate from the deterministic local feature-hash test.

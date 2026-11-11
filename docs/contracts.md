# PolyFind Contract Layer

This document records the Slice S1-04 boundary contracts. It is deliberately
independent of MySQL, Redis, Neo4j, and a vector database so later slices can
use in-memory fixtures or adapters.

## Runtime and commands

The contract layer uses TypeScript and Node's built-in test runner through
`tsx`.

```text
npm install
npm test
npm run typecheck
```

## Contract rules

### Domain objects

`Product` is the authoritative catalog representation. Its required fields are:

| Field | Rule |
|---|---|
| `id`, `name`, `description`, `categoryId` | non-empty strings |
| `price` | finite number greater than or equal to zero |
| `stock` | integer greater than or equal to zero |
| `version` | positive integer source version |
| `updatedAt` | ISO-parseable timestamp |

`Category` has a non-empty `id` and `name`. IDs are opaque strings at this
layer; database-specific formats are intentionally not imposed.

### Search request

```json
{
  "query": "stainless bottle",
  "filters": {
    "categoryId": "outdoors",
    "minPrice": 10,
    "inStock": true
  },
  "freshnessMode": "strict",
  "page": 1,
  "limit": 20
}
```

`query` is required and non-empty. `filters`, `freshnessMode`, `page`, and
`limit` are optional. Defaults are `{}`, `"strict"`, `1`, and `20`.
`limit` is capped at 100. Price ranges cannot be negative and `minPrice`
cannot exceed `maxPrice`. `strict` requires the later orchestration layer to
verify freshness-sensitive fields; `best-effort` permits a documented degraded
response when verification is unavailable. This slice defines the shape only,
not the retrieval behavior.

Unknown fields, `null`, malformed types, and invalid values are rejected with
`ContractValidationError`, including a stable error code and issue paths.

### Search response and health

Responses contain `items`, `page`, `total`, `strategy`, `timings`, and
`freshness`. Each item contains a `Product` and finite numeric `score`.
Freshness is explicit through `mode`, `status` (`verified`, `degraded`, or
`unavailable`), and `checkedAt`.

The `healthCheck()` function is the local smoke-check equivalent of
`GET /api/health`:

```json
{
  "status": "ok",
  "service": "polyfind-contracts",
  "version": "0.1.0"
}
```

### Technology-neutral interfaces

- `CatalogReader` reads authoritative products and paginated catalog results.
- `RetrievalProvider` returns stable product IDs, source identifiers, scores,
  optional source versions, and elapsed time.
- `FreshnessVerifier` reports the status of a product/source-version check.
- `BenchmarkConfiguration` validates reproducible workload name, seed,
  repetition count, and workload identifier.

These interfaces do not connect to a backend or implement retrieval, fusion,
freshness validation, or benchmarks; those belong to later slices.

## Compatibility decisions

- JSON object shapes are strict to catch misspelled fields at the boundary.
- Optional input fields receive deterministic defaults; response fields are
  required.
- Product price and stock remain part of the authoritative product object.
  Derived providers expose IDs and source metadata rather than replacing those
  values.
- The vector backend and embedding provider remain unresolved as required by
  ADR-003 and are not encoded into this contract layer.

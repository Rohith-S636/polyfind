# PolyFind HTTP API

The local API is started with:

```powershell
npm run api
```

The default server uses the deterministic, clearly synthetic demo catalogue
(`seed=42`, 50 products). It does not require MySQL, Redis, Neo4j, a vector
service, credentials, or internet access.

Catalogue fields and database/demo setup are documented in
[`docs/CATALOGUE_DATA_READINESS.md`](./CATALOGUE_DATA_READINESS.md).

## Endpoints

### `GET /api/health`

Returns application health separately from optional dependency state:

```json
{
  "status": "ok",
  "service": "polyfind-contracts",
  "version": "0.1.0",
  "dependencies": {
    "catalog": "available",
    "redis": "not-configured",
    "graph": "not-configured",
    "vector": "available"
  }
}
```

### `GET /api/products`

Query parameters:

- `q`: keyword text
- `category` or `categoryId`
- `minPrice`, `maxPrice`: non-negative numbers
- `inStock`: `true` or `false`
- `page`: positive integer, default `1`
- `limit`: integer from `1` through `100`, default `20`
- `sort`: `relevance`, `name`, `price`, or `updatedAt`; default `relevance`

Example:

```text
GET /api/products?q=bottle&category=cat-outdoors&minPrice=10&inStock=true&sort=price&limit=5
```

The response contains authoritative product fields and pagination metadata:

```json
{
  "items": [],
  "page": 1,
  "limit": 5,
  "total": 0,
  "totalPages": 1,
  "sort": "price"
}
```

### `GET /api/products/:id`

Example:

```text
GET /api/products/prod-0001
```

Returns `{ "item": Product }`, or `404` with a stable error body for an
unknown canonical product ID.

### `GET /api/search`

`q` is required and non-empty. It accepts the same filter and pagination
parameters as `/api/products`, plus `freshnessMode=strict|best-effort`.

Example:

```text
GET /api/search?q=lightweight+waterproof+bottle&inStock=true&limit=10
```

The response contains authoritative product data, relevance scores, strategy,
timings, pagination, and freshness status:

```json
{
  "items": [],
  "page": 1,
  "total": 0,
  "strategy": "adaptive-mysql",
  "timings": { "totalMs": 0, "retrievalMs": 0, "validationMs": 0 },
  "freshness": {
    "mode": "strict",
    "status": "verified",
    "checkedAt": "2026-01-01T00:00:00.000Z"
  }
}
```

Errors use:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "limit must be between 1 and 100."
  }
}
```

The server does not expose stack traces, credentials, environment variables,
or derived-store price/stock values.

### `GET /api/ready`

Readiness is `200` only when the configured catalog dependency is available;
otherwise it returns `503`. This endpoint is suitable for a hosting health
check. The response includes only `status` and the configured catalog mode.

### Runtime modes

Set `CATALOG_MODE=demo` for the deterministic seed-42 in-memory catalogue.
Demo mode is explicitly labeled by the API and UI. Set `CATALOG_MODE=live` for
MySQL-backed operation. Live mode requires a reachable `DATABASE_URL` and
never falls back to demo data when MySQL is unavailable.

# PolyFind HTTP API

This document follows the route implementation in src/api/server.ts at the reviewed repository baseline. The API is served by the Node.js application. Live mode requires a persistent relational repository; demo mode uses a deterministic in-memory synthetic catalogue.

## Common behavior

- JSON responses use UTF-8.
- Request bodies are limited to 1 MiB.
- Validation errors return 400; missing entities return 404; version conflicts return 409; unavailable database dependencies may return 503.
- Catalogue mutations require an authenticated administrator.
- Audit actor identity is taken from the authenticated principal, not a client-supplied actor ID.
- A configured Origin policy can reject cross-origin state-changing requests. Verify HTTPS, allowed Origin and CSRF behavior before public exposure.
- Authentication throttling is process-local, not a distributed rate limiter.

## Health and readiness

| Method | Path | Purpose |
|---|---|---|
| GET | /api/health | Application and configured dependency health; may include Redis/graph/vector states and synchronization health |
| GET | /api/ready | Readiness of the configured catalogue dependency |

## Catalogue and discovery

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | /api/products | Public | Filtered, sorted, paginated catalogue |
| GET | /api/products/:id | Public | Product detail |
| POST | /api/products | Admin | Create a product |
| PUT/PATCH | /api/products/:id | Admin | Version-aware product update |
| GET | /api/search | Public | Search using query-string parameters |
| POST | /api/search | Public | Search using a JSON request body |
| GET | /api/brands | Public | List brands |
| GET | /api/brands/:id | Public | Brand detail |
| POST | /api/brands | Admin | Create a brand |
| GET | /api/sellers | Public | Paginated seller list |
| GET | /api/sellers/:id | Public | Seller detail |
| POST | /api/sellers | Admin | Create a seller |
| GET | /api/variants/:id | Public | Variant detail |
| GET | /api/products/:id/variants | Public | List variants for a product |
| POST | /api/products/:id/variants | Admin | Create a variant for a product |

### Product filters

GET /api/products accepts q, category/categoryId, minPrice, maxPrice, inStock, page, limit, and sort. Pagination defaults to page 1 and limit 20; limit is capped at 100. Sort values are relevance, name, price, and updatedAt.

### Search

GET /api/search accepts q and the product filters, plus freshnessMode=strict|best-effort and optional hybrid=true|false.

POST /api/search accepts a JSON object with query (or q), filters, page, limit, freshnessMode, and optional boolean hybrid.

Example GET:

~~~text
GET /api/search?q=lightweight+waterproof+bottle&inStock=true&limit=10&freshnessMode=strict
~~~

Example POST:

~~~json
{
  "query": "lightweight waterproof bottle",
  "filters": { "inStock": true },
  "page": 1,
  "limit": 10,
  "freshnessMode": "strict",
  "hybrid": true
}
~~~

The response includes ranked items, strategy, timings and freshness status. Final product fields are hydrated from MySQL; derived stores are candidate providers.

## Offers and price history

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | /api/offers | Public | Filtered and paginated offers |
| POST | /api/offers | Admin | Create an offer |
| GET | /api/offers/:id | Public | Offer detail |
| PATCH/PUT | /api/offers/:id | Admin | Version-aware offer update |
| GET | /api/offers/:id/price-history | Public | History for one offer |
| GET | /api/price-history | Public | Filtered price history |
| GET | /api/products/:id/offers | Public | Offers for a product |
| GET | /api/products/:id/price-history | Public | Price history for a product |
| GET | /api/sellers/:id/offers | Public | Offers for a seller |

Offer filters include productId/product, sellerId/seller, variantId/variant, availability, minPrice, maxPrice, inStock, page, limit, sort and sortOrder. Price-history filters include productId/product, offerId/offer, sellerId/seller, startDate, endDate, page, limit and sortOrder.

## Authentication

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | /api/auth/bootstrap | One-time setup | Create the first administrator using email, password and bootstrapToken |
| POST | /api/auth/register | Public | Register a customer |
| POST | /api/auth/login | Public | Authenticate a user |
| POST | /api/auth/logout | Authenticated | Revoke the current session |
| GET | /api/auth/me | Authenticated | Return the current principal |

Successful browser authentication sets an HttpOnly, SameSite=Strict cookie; Secure is added in production. Bearer tokens are supported for API clients. Passwords use scrypt and session tokens are stored as hashes with expiry/revocation. Remove the bootstrap token after first-admin creation.

## Runtime modes

- Demo mode: deterministic in-memory catalogue; not proof of database integration.
- Live mode: requires DATABASE_URL and a reachable MySQL database. Live startup does not silently fall back to demo data when MySQL is unavailable.
- Redis, Neo4j and LanceDB are derived dependencies. Their health and degraded states are reported separately.

## Mutation and history boundaries

There are no public hard-delete routes. Product and offer updates use expected-version checks. Offer changes preserve offer_history and audit/outbox records through repository transactions. Category, brand, seller and variant update/delete operations are not exposed as general public API operations in the reviewed implementation.

## Related documentation

- [Architecture](ARCHITECTURE.md)
- [Relational schema](RELATIONAL_SCHEMA_PHASE4.md)
- [Redis](REDIS_PHASE5.md)
- [Neo4j graph schema](GRAPH_SCHEMA.md)
- [LanceDB](LANCEDB_PHASE7.md)
- [Transactional outbox](OUTBOX_PHASE8.md)
- [Local setup](LOCAL_SETUP.md)

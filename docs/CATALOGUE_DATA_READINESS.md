# Catalogue and data readiness

## Canonical model

`Product` in [`src/contracts/types.ts`](../src/contracts/types.ts) is the
canonical catalogue model. Its existing `name` field is the product title;
it remains named `name` to preserve the established API and benchmark
contracts. IDs use the deterministic `prod-NNNN` format for generated demo
records.

Prices are numeric values backed by MySQL `DECIMAL(10,2)` and carry an explicit
three-letter currency code. Stock is an integer quantity. Availability is
explicit when known (`in-stock`, `out-of-stock`, or `unknown`). Brand,
attributes, image URL, and product URL are optional and are omitted when not
known. No URL is generated for demo products.

Every generated product includes `dataSource: "demo"` and is synthetic. It
must not be presented as a real retailer listing, review, rating, inventory
feed, or live price.

## Demo mode and database mode

`npm run api` starts the deterministic in-memory demo catalogue. It requires
no database or optional service and uses seed `42` with 50 synthetic products.

The database-backed path uses MySQL as the authority for identity, title,
description, category, price, currency, stock, availability, and version.
Redis, Neo4j, and vector stores remain derived/optional services. Missing
optional services must be reported as unavailable or not configured; they must
not supply authoritative price or stock.

## Safe reset and seeding

Run migrations before the first database seed:

```powershell
Copy-Item .env.example .env
# Set DATABASE_URL to a local MySQL database
npm run migrate
npm run seed -- --seed=42 --count=50
```

Seeding categories and products occurs in one transaction. Re-running the same
seed uses stable primary keys and updates the deterministic demo representation
instead of inserting duplicates. A failed database seed rolls back and exits
with a failure status; it is not reported as successful persistence.

To reset a disposable local database, use the existing `dropAllTables(pool)`
helper from `src/catalog/migrations.ts`, then rerun `npm run migrate` and
`npm run seed`. Do not use it against production data.

## Migration and optional fields

`migrations/003_catalog_metadata.sql` adds currency, availability, optional
brand/attributes/URLs, and source provenance. Existing rows receive safe
defaults or null values; no product URLs, brands, or retail facts are invented.

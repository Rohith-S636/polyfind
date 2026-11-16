# PolyFind Phase 4 Relational Foundation

This document describes the executable schema in `migrations/001_initial_schema.sql`
through `migrations/005_outbox_delivery_leases.sql`. MySQL is the authoritative
store for catalogue, offer, identity, audit, and synchronization-queue data.

## Implemented migrations

| Migration | Implemented objects |
|---|---|
| `001_initial_schema.sql` | `categories`, `products`, `product_versions` |
| `002_catalog_indexes.sql` | Product category/price, stock, update-time, and FULLTEXT indexes |
| `003_catalog_metadata.sql` | Legacy-compatible product metadata columns |
| `004_relational_foundation.sql` | Normalized categories, brands, variants, sellers, offers, offer history, identity tables, audit logs, and outbox tables |
| `005_outbox_delivery_leases.sql` | Outbox delivery lease ownership/expiry and retry support |

`product_versions` remains product-level history for compatibility with the
existing catalogue repository. It is not seller offer history. Seller-specific
price and stock history is stored in `offer_history`.

## Implemented entities and relationships

```mermaid
erDiagram
  categories ||--o{ categories : parent
  categories ||--o{ products : classifies
  brands o|--o{ products : brands
  products ||--o{ product_variants : has
  products ||--o{ offers : lists
  product_variants o|--o{ offers : specializes
  sellers ||--o{ offers : sells
  offers ||--o{ offer_history : records
  users ||--o{ user_roles : receives
  roles ||--o{ user_roles : grants
  users ||--o{ sessions : owns
  users o|--o{ audit_logs : acts
  outbox_events ||--o{ outbox_deliveries : targets
```

The composite foreign key `(offers.variant_id, offers.product_id)` references
`product_variants(id, product_id)`, preventing an offer from referencing a
variant belonging to another product.

## Constraints and indexes

- Stable string IDs use `VARCHAR(64)` except UUID-style user/session/event IDs,
  which use ASCII `CHAR(36)`.
- Slugs are unique for categories, brands, products, and sellers. Category and
  product slugs remain nullable at the SQL boundary so older direct writers and
  existing rows remain compatible; normal repository create operations populate
  them from the stable ID.
- Products, variants, offers, and offer history enforce positive versions.
- Prices and known stock quantities cannot be negative.
- Offer states are explicit:
  - `available`: positive stock quantity.
  - `unavailable`: zero stock quantity.
  - `unknown_stock`: `NULL` stock quantity.
- Offer validity requires `valid_until > valid_from` when an end is present.
- User-role assignments use a composite primary key.
- Outbox delivery state is independent for `redis`, `neo4j`, and `lancedb`.
- Indexes cover category hierarchy, product lifecycle, offer lookup, history,
  sessions, audit entities, pending outbox events, and delivery retries.

## Repository behavior

`RelationalRepository.createOffer` and `updateOffer` use the existing MySQL
pool and one transaction to write:

1. The offer mutation and optimistic version.
2. The corresponding `offer_history` row.
3. An `audit_logs` row.
4. An `outbox_events` row.
5. Three independent `outbox_deliveries` rows.

The current integrated application adds Redis, Neo4j, and LanceDB adapters and
a Phase 8 outbox worker after the original Phase 4 schema foundation. The
outbox event and delivery tables are created by the relational migrations;
runtime behavior is specified in REDIS_PHASE5.md, GRAPH_SCHEMA.md,
LANCEDB_PHASE7.md, and OUTBOX_PHASE8.md.

## Compatibility and rollback

Migration `004` is additive and backfills category and product slugs from their
stable IDs. Existing `products.price`, `products.stock`, and
`product_versions` values are preserved. The migration runner records applied
files in `schema_migrations`; MySQL DDL rollback is not assumed. Reversal of
`004` would require a separately reviewed destructive migration and is not
provided.

## Current scope boundaries and later-phase implementation

The following capabilities were introduced after the original Phase 4
relational foundation and are implemented in the current application:

- Authentication, sessions, customer registration, first-admin bootstrap,
  and administrator-only catalogue mutation.
- Redis cache-aside reads and invalidation.
- Neo4j derived graph projection and graph candidate retrieval.
- LanceDB persistent vector storage and candidate retrieval.
- Transactional outbox polling, per-target delivery, retry/lease handling,
  tombstones, and bounded reconciliation.

They are specified in the phase documents linked above. The current API does
not expose general hard-delete operations or update/delete management routes
for every relational entity. In particular, category, brand, seller, and
variant lifecycle changes remain narrower than the create/read routes, and
offer deletion is not exposed. Do not infer unsupported CRUD operations from
the existence of a table or foreign key.

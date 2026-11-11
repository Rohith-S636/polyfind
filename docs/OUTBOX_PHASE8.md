# Phase 8 Transactional Outbox and Derived-Store Delivery

MySQL remains the source of truth. Catalogue mutations write an outbox event
and one delivery row for Redis, Neo4j, and LanceDB in the same MySQL
transaction. The delivery rows are processed independently by `OutboxWorker`.

## Delivery state machine

```text
pending -> processing -> applied
                    \-> skipped
                    \-> failed -> processing
                    \-> dead_letter
```

Claims use a lease owner and expiry. A worker that loses its lease cannot mark
the delivery complete. Failed retryable work uses bounded exponential backoff;
permanent failures and exhausted retries become `dead_letter`. Dead-letter
rows can be requeued with `MySqlOutboxStore.replay`.

The worker does not make derived stores a prerequisite for MySQL writes.
Redis, Neo4j, and LanceDB failures are recorded independently. LanceDB
deliveries use the configured embedding provider and never use fake production
vectors.

## Reconciliation

`reconcileProducts` compares authoritative MySQL product versions with
available Neo4j and LanceDB projections. It defaults to dry-run reporting;
repair requires `{ repair: true }` and only repairs identified product
records. It does not scan or delete unrelated Redis keys.

Migration `005_outbox_delivery_leases.sql` is forward-only and must be applied
through the existing migration command. This phase does not run migrations
automatically.

## Event status and replay

Delivery rows are authoritative. An event is `processed` only when every
delivery is `applied` or `skipped`. It remains `pending` while any delivery is
pending or processing, is `failed` when no delivery is active but a retryable
failure remains, and becomes `dead_letter` only when no delivery is active and
at least one delivery is permanently failed or exhausted. Replaying a target
resets only that target row; event status is recomputed in the same transaction.

Workers renew their lease while a delivery is active. Completion and failure
updates require the current lease owner, so a worker that loses its lease
cannot acknowledge another worker's delivery. Expired leases are reclaimable
through `FOR UPDATE SKIP LOCKED`.

## Tombstones and ownership

Neo4j product deletes use PolyFind-owned, versioned tombstones rather than
removing the version evidence needed to reject delayed updates. LanceDB uses
versioned rows with `deleted` and `sourceSystem` metadata. Existing LanceDB
tables without these columns are rejected explicitly; they are not silently
treated as compatible.

Reconciliation may destructively repair only records marked
`sourceSystem = 'polyfind'`. Unowned or legacy records are reported as
unverified and preserved.

## Reconciliation guarantees and limits

Reconciliation defaults to dry-run. It processes authoritative and derived
records page-by-page using keyset cursors, with a configurable repair cap and
bounded error detail. It does not accumulate the complete catalogue or derived
stores in memory. It reports missing, stale, newer, orphaned, skipped and
failed records.

Relationship-level graph reconciliation, Redis key reconciliation, and
delivery-history correlation are not currently implemented; these limitations
must not be represented as full cross-store consistency proof.

## Mutation coverage

Product create/update/delete, category create, brand create, seller create,
variant create, and offer create/update write their source mutation and
outbox event in one MySQL transaction. Update/delete APIs for category, brand,
seller, and variant, and offer deletion, are not currently public operations
and therefore are unsupported. Neo4j reports unsupported destructive entity
operations as permanent failures. LanceDB explicitly skips entity events that
do not change product semantic content.

Missing Redis, Neo4j, or embedding configuration is explicit: the target is
disabled or permanently unavailable rather than falsely acknowledged. A
configured temporary outage remains retryable. After recovery, operators can
replay dead-letter deliveries with `MySqlOutboxStore.replay`.

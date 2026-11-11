# S3-04 — Neo4j graph schema and synchronization

## Module
`graph-retrieval`

## What to build
Define graph nodes/relationships and propagate catalogue changes using stable IDs and version-aware update logic.

## Acceptance criteria
- [x] Graph constraints/indexes are documented where applicable.
- [x] Repeated sync is idempotent for the same source version.
- [x] Sync lag and failures can be observed in logs/metrics without secrets.

## Dependencies
Use the prerequisite/interface contract below and review `docs/ARCHITECTURE.md` plus the relevant sprint plan. Do not wait for unrelated upstream implementation when fixtures or mocks are sufficient.

## Mockup / reference
Not applicable unless the implementation adds a UI surface.

## Out of scope for this slice
Do not treat graph properties as authoritative price/stock.

## Human review required?
Yes if the implementation touches secrets, infrastructure, authentication, destructive migrations, or changes a documented freshness guarantee; otherwise normal PR review.

## Ownership
The directly responsible owner listed below is accountable for implementation, tests, acceptance evidence, and the slice PR. The other member may review without becoming a co-owner.

## Evidence attached
- Implemented `Neo4jGraphSyncAdapter` in `src/sync/neo4j-sync.ts` conforming to `DerivedStoreSyncTarget`.
- Enforced idempotent Cypher MERGE semantics, unique constraint definitions, and out-of-order stale version protection.
- Documented node labels (`:Product`, `:Category`), relationships (`:IN_CATEGORY`, `:RELATED_TO`), and indexes in `docs/GRAPH_SCHEMA.md`.
- Verified lag tracking, error sanitization, and metrics observability via automated unit tests in `test/neo4j-sync.test.ts`.

## Single-owner assignment and parallel execution

- **Directly responsible owner:** Member B.
- **Deliverable:** Neo4j schema and idempotent version-aware synchronization.
- **Prerequisite/interface contract:** Stable entity IDs and version contract; use synthetic graph fixtures.
- **Parallel-work rule:** Start with agreed contracts, fixtures, mocks, or stub adapters. Do not wait for another implementation if the interface can be agreed and tested independently.
- **Completion evidence:** Meet the original acceptance criteria, add/update tests, record commands and results, and note limitations in the PR.
- **Ownership rule:** This slice has one owner only. The other member may review but is not a co-owner. Preserve the existing slice ID.

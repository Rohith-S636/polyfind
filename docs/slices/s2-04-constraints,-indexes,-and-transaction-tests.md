# S2-04 — Constraints, indexes, and transaction tests

## Module
`catalog`

## What to build
Add relevant indexes and tests for transactional updates and concurrent version changes.

## Acceptance criteria
- [x] Price/stock updates are atomic and versioned.
- [x] Foreign-key and validation failures are tested.
- [x] EXPLAIN plans for selected queries are recorded as a baseline.
- [x] No stale derived store is treated as authoritative.

## Dependencies
Use the prerequisite/interface contract below and review `docs/ARCHITECTURE.md` plus the relevant sprint plan. Do not wait for unrelated upstream implementation when fixtures or mocks are sufficient.

## Mockup / reference
Not applicable unless the implementation adds a UI surface.

## Out of scope for this slice
Do not claim optimal indexing without measurements.

## Human review required?
Yes — this slice changes data authority, freshness behavior, or benchmark claims; obtain teammate review before merge.

## Ownership
The directly responsible owner listed below is accountable for implementation, tests, acceptance evidence, and the slice PR. The other member may review without becoming a co-owner.

## Evidence to attach to PR
- Acceptance criteria checked
- Tests and commands run
- Screenshots or raw benchmark artifacts when applicable
- Any changed assumptions, limitations, or follow-up issues

## Single-owner assignment and parallel execution

- **Directly responsible owner:** Member A.
- **Deliverable:** Constraint/index decisions and transaction/integrity tests.
- **Prerequisite/interface contract:** Schema draft and transactional invariants; tests can precede full integration.
- **Parallel-work rule:** Start with agreed contracts, fixtures, mocks, or stub adapters. Do not wait for another implementation if the interface can be agreed and tested independently.
- **Completion evidence:** Meet the original acceptance criteria, add/update tests, record commands and results, and note limitations in the PR.
- **Ownership rule:** This slice has one owner only. The other member may review but is not a co-owner. Preserve the existing slice ID.

## Completion evidence
- Created `migrations/002_catalog_indexes.sql` establishing composite category/price, stock, recency, and full-text indexes.
- Created `docs/EXPLAIN_PLANS_BASELINE.md` documenting baseline EXPLAIN plans for single-entity lookups, range filters, stock filters, and version lookups, as well as transactional invariants.
- Verified transactional atomicity and monotonic version tracking: price and stock updates atomically update `products` and record history in `product_versions`.
- Implemented and tested optimistic concurrency control with 409 Conflict rejection for stale expected versions.
- Tested foreign key referential integrity (e.g. deleting categories with products fails with RESTRICT) and domain constraints.
- Verified ADR-001 data authority invariant: stale derived candidates cannot overwrite authoritative MySQL price or stock values.
- Added comprehensive unit and clean MySQL integration tests in `test/catalog-transactions-indexes.test.ts`.
- `npm test` passes all 30 tests and `npm run typecheck` passes with zero errors.

## Limitations
- Performance comparisons across large-scale datasets will be evaluated in Sprint 5 benchmark harness slices (`S5-03`, `S5-04`).
- Derived index synchronization from update events is handled in Sprint 3 and Sprint 4.


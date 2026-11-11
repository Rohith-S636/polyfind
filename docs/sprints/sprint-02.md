# Sprint 2 — Catalog and UI foundation

## Goal
Build MySQL catalog functionality and the catalog UI in parallel using contracts and mock data.

## Slices and single owners

| Status | Slice | Title | Owner |
|---|---|---|---|
| [x] | `S2-01` | Relational schema and migrations | Member A |
| [x] | `S2-02` | Seed dataset and data validation | Member B |
| [x] | `S2-03` | Catalog CRUD API | Member A |
| [x] | `S2-04` | Constraints, indexes, and transaction tests | Member A |
| [x] | `S2-05` | Minimal catalog UI and structured filters | Member B |

## Parallel execution

- Start assigned slices as soon as their interface contract is documented.
- Use mocks, fixtures, and stub adapters instead of waiting for another slice's implementation.
- Every slice has one owner; the other member may review but is not a co-owner.
- Integrate incrementally through PRs and preserve slice IDs.

## Dependencies

The previous sprint provides context, but completing every previous slice is not a blanket start condition. Follow the prerequisite/interface contract in each slice file. If a contract is available, proceed against mocks while upstream implementation continues.

## Exit criteria

- Completed slice acceptance criteria have evidence.
- Tests and relevant docs are updated.
- PRs identify slice ID, tests, evidence, and limitations.
- Blockers are explicit; scope is not silently changed.
- Research results include reproducible configuration and baseline context.

## Notes for next time

Record material failures, sizing issues, or changed assumptions.

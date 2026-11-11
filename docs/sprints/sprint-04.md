# Sprint 4 — Freshness and adaptive planning

## Goal
Implement version/freshness logic, cache, planner baselines, and UI/API connection against stable contracts.

## Slices and single owners

| Status | Slice | Title | Owner |
|---|---|---|---|
| [x] | `S4-01` | Version metadata and update events | Member A |
| [x] | `S4-02` | Redis cache with version-aware invalidation | Member B |
| [x] | `S4-03` | Freshness validation and safe fallback | Member A |
| [x] | `S4-04` | Fixed-routing and adaptive planner baselines | Member A |
| [x] | `S4-05` | Search API and UI integration | Member B |

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

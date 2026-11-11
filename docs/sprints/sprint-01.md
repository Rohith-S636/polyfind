# Sprint 1 — Research and foundation

## Goal
Publish contracts and establish independent workspaces so both members can start without waiting.

## Slices and single owners

| Status | Slice | Title | Owner |
|---|---|---|---|
| [x] | `S1-01` | Repository and contributor workflow | Member A |
| [x] | `S1-02` | Requirements and research-gap review | Member A |
| [x] | `S1-03` | Local development configuration | Member B |
| [x] | `S1-04` | Architecture contracts and module skeleton | Member A |
| [x] | `S1-05` | Vector-store and embedding spike | Member B |

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

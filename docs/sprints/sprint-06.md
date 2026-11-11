# Sprint 6 — Analysis and final delivery

## Goal
Analyze results, prepare research evidence and deliverables, and verify the system without last-minute scope.

## Slices and single owners

| Status | Slice | Title | Owner |
|---|---|---|---|
| [x] | `S6-01` | Repeated runs and statistical summaries | Member A |
| [x] | `S6-02` | Baseline comparison and result visualization | Member B |
| [x] | `S6-03` | Research claims, limitations, and related-work matrix | Member A |
| [x] | `S6-04` | Final report, setup guide, and demo script | Member B |
| [x] | `S6-05` | Final acceptance, clean-room setup, and viva preparation | Member A |

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

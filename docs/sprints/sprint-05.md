# Sprint 5 — Reproducible evaluation

## Goal
Build workload, labels, benchmark harness, ablations, and failure tests as independent components.

## Slices and single owners

| Status | Slice | Title | Owner |
|---|---|---|---|
| [x] | `S5-01` | Deterministic query and update workload | Member A |
| [x] | `S5-02` | Search relevance labels and metrics | Member A |
| [x] | `S5-03` | Latency and resource benchmark harness | Member B |
| [x] | `S5-04` | Ablation and delayed-update experiments | Member B |
| [x] | `S5-05` | Failure injection, regression, and security review | Member A |

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

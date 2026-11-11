# Sprint 3 — Heterogeneous retrieval paths

## Goal
Implement retrieval interfaces, vector search, graph search, and fusion as independent adapters.

## Slices and single owners

| Status | Slice | Title | Owner |
|---|---|---|---|
| [x] | `S3-01` | Retrieval interfaces and candidate schema | Member A |
| [x] | `S3-02` | Embedding generation and vector ingestion | Member B |
| [x] | `S3-03` | Vector semantic search adapter | Member B |
| [x] | `S3-04` | Neo4j graph schema and synchronization | Member B |
| [x] | `S3-05` | Graph candidate retrieval and baseline fusion | Member A |

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

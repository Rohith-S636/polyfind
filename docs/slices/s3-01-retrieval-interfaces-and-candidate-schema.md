# S3-01 — Retrieval interfaces and candidate schema

## Module
`retrieval-planner`

## What to build
Define a shared candidate format and adapter interface for relational, graph, and vector retrieval.

## Acceptance criteria
- [x] Every candidate has a stable product/entity ID and source identifier.
- [x] Adapter errors and timing can be recorded consistently.
- [x] A unit test verifies deduplication of the same entity from multiple sources.

## Dependencies
Use the prerequisite/interface contract below and review `docs/ARCHITECTURE.md` plus the relevant sprint plan. Do not wait for unrelated upstream implementation when fixtures or mocks are sufficient.

## Mockup / reference
Not applicable unless the implementation adds a UI surface.

## Out of scope for this slice
Do not encode backend-specific fields into the public API response.

## Human review required?
Yes if the implementation touches secrets, infrastructure, authentication, destructive migrations, or changes a documented freshness guarantee; otherwise normal PR review.

## Ownership
The directly responsible owner listed below is accountable for implementation, tests, acceptance evidence, and the slice PR. The other member may review without becoming a co-owner.

## Evidence to attach to PR
- Acceptance criteria checked
- Tests and commands run
- Screenshots or raw benchmark artifacts when applicable
- Any changed assumptions, limitations, or follow-up issues

## Single-owner assignment and parallel execution

- **Directly responsible owner:** Member A.
- **Deliverable:** Stable retrieval-provider and candidate contracts.
- **Prerequisite/interface contract:** Stable product ID, candidate shape, score semantics, and source-version fields.
- **Parallel-work rule:** Start with agreed contracts, fixtures, mocks, or stub adapters. Do not wait for another implementation if the interface can be agreed and tested independently.
- **Completion evidence:** Meet the original acceptance criteria, add/update tests, record commands and results, and note limitations in the PR.
- **Ownership rule:** This slice has one owner only. The other member may review but is not a co-owner. Preserve the existing slice ID.

## Completion evidence
- Created `src/retrieval/candidate.ts` providing strict runtime validation for retrieval candidates (stable non-empty `productId`, `source`, finite `score`, and positive integer `sourceVersion`).
- Implemented `deduplicateCandidates()` with configurable score combination strategies (`max`, `sum`, `average`), multi-source attribution tracking, highest-version preservation, and deterministic tie-breaking (by score descending, then product ID ascending).
- Created `src/retrieval/adapter.ts` with `executeRetrievalAdapter()` providing unified execution, high-resolution performance timing (`elapsedMs`), candidate validation, and safe error capture (`ADAPTER_RETRIEVAL_FAILED`) without uncaught exceptions.
- Added comprehensive unit tests in `test/retrieval-interfaces.test.ts`.
- `npm test` passes all 34 tests and `npm run typecheck` passes with zero errors.

## Limitations
- Specific concrete adapters (Vector in `S3-03`, Neo4j in `S3-04`/`S3-05`, Redis in `S4-02`) will implement `RetrievalProvider` against these contracts.


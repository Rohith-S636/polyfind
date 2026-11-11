# S3-03 — Vector semantic search adapter

## Module
`semantic-retrieval`

## What to build
Implement semantic candidate retrieval through the selected vector-store adapter.

## Acceptance criteria
- [x] A fixed query fixture returns expected candidate IDs within documented tolerances.
- [x] Structured metadata filters work where supported or are applied safely after retrieval.
- [x] Latency and result count are exposed for benchmark instrumentation.

## Dependencies
Use the prerequisite/interface contract below and review `docs/ARCHITECTURE.md` plus the relevant sprint plan. Do not wait for unrelated upstream implementation when fixtures or mocks are sufficient.

## Mockup / reference
Not applicable unless the implementation adds a UI surface.

## Out of scope for this slice
Do not add a second vector backend.

## Human review required?
Yes if the implementation touches secrets, infrastructure, authentication, destructive migrations, or changes a documented freshness guarantee; otherwise normal PR review.

## Ownership
The directly responsible owner listed below is accountable for implementation, tests, acceptance evidence, and the slice PR. The other member may review without becoming a co-owner.

## Evidence attached
- Implemented `VectorSemanticRetrievalAdapter` in `src/retrieval/vector-adapter.ts` implementing the `RetrievalProvider` interface.
- Verified fixed query retrieval with normalized cosine similarity scores and preserved source versions in `test/vector-adapter.test.ts`.
- Verified structured metadata filtering (category, max price, in-stock availability).
- Exposed per-query and aggregate benchmark diagnostics (`lastElapsedMs`, `lastCandidateCount`, `averageLatencyMs`).
- Verified seamless compatibility with `executeRetrievalAdapter` runner.

## Single-owner assignment and parallel execution

- **Directly responsible owner:** Member B.
- **Deliverable:** Tested semantic retrieval adapter.
- **Prerequisite/interface contract:** S3-01 interface and vector decision; test with fixture embeddings.
- **Parallel-work rule:** Start with agreed contracts, fixtures, mocks, or stub adapters. Do not wait for another implementation if the interface can be agreed and tested independently.
- **Completion evidence:** Meet the original acceptance criteria, add/update tests, record commands and results, and note limitations in the PR.
- **Ownership rule:** This slice has one owner only. The other member may review but is not a co-owner. Preserve the existing slice ID.

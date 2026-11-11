# S3-02 — Embedding generation and vector ingestion

## Module
`semantic-retrieval`

## What to build
Generate embeddings for the chosen text fields and ingest stable IDs plus source versions.

## Acceptance criteria
- [x] Embedding model/provider and preprocessing are documented.
- [x] Ingestion is repeatable and handles updates/deletes.
- [x] Each vector record stores a stable entity ID and source version where supported.

## Dependencies
Use the prerequisite/interface contract below and review `docs/ARCHITECTURE.md` plus the relevant sprint plan. Do not wait for unrelated upstream implementation when fixtures or mocks are sufficient.

## Mockup / reference
Not applicable unless the implementation adds a UI surface.

## Out of scope for this slice
Do not claim embeddings are novel or universally superior.

## Human review required?
Yes if the implementation touches secrets, infrastructure, authentication, destructive migrations, or changes a documented freshness guarantee; otherwise normal PR review.

## Ownership
The directly responsible owner listed below is accountable for implementation, tests, acceptance evidence, and the slice PR. The other member may review without becoming a co-owner.

## Evidence attached
- Implemented text preprocessing and structured field weighting in `src/retrieval/embeddings.ts`.
- Implemented 384-dimensional `DeterministicEmbeddingProvider` and `VectorIngestionService` in `src/retrieval/vector-ingestion.ts`.
- Verified repeatable batch ingestion, idempotent overwrite, version advancement on update, and deletion in `test/vector-ingestion.test.ts`.
- Documented model selection, preprocessing rules, and vector schemas in `docs/EMBEDDINGS.md`.

## Single-owner assignment and parallel execution

- **Directly responsible owner:** Member B.
- **Deliverable:** Repeatable embedding generation and vector ingestion.
- **Prerequisite/interface contract:** Vector-store decision and candidate metadata contract; use seed fixtures.
- **Parallel-work rule:** Start with agreed contracts, fixtures, mocks, or stub adapters. Do not wait for another implementation if the interface can be agreed and tested independently.
- **Completion evidence:** Meet the original acceptance criteria, add/update tests, record commands and results, and note limitations in the PR.
- **Ownership rule:** This slice has one owner only. The other member may review but is not a co-owner. Preserve the existing slice ID.

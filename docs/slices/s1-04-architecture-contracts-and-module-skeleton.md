# S1-04 — Architecture contracts and module skeleton

## Module
`foundation`

## What to build
Create module boundaries and typed interfaces for catalog, search, retrieval adapters, freshness, and benchmark configuration.

## Acceptance criteria
- [x] Module ownership matches `docs/ARCHITECTURE.md`.
- [x] Search request and response contracts have typed definitions.
- [x] A basic health endpoint or equivalent local smoke check is available.

## Dependencies
Use the prerequisite/interface contract below and review `docs/ARCHITECTURE.md` plus the relevant sprint plan. Do not wait for unrelated upstream implementation when fixtures or mocks are sufficient.

## Mockup / reference
Not applicable unless the implementation adds a UI surface.

## Out of scope for this slice
Do not implement full retrieval logic in this slice.

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
- **Deliverable:** Module boundaries, API/data contracts, and skeleton boundaries.
- **Prerequisite/interface contract:** Architecture proposal; publish interface contracts early.
- **Parallel-work rule:** Start with agreed contracts, fixtures, mocks, or stub adapters. Do not wait for another implementation if the interface can be agreed and tested independently.
- **Completion evidence:** Meet the original acceptance criteria, add/update tests, record commands and results, and note limitations in the PR.
- **Ownership rule:** This slice has one owner only. The other member may review but is not a co-owner. Preserve the existing slice ID.

## Completion evidence

- Added backend-independent TypeScript contracts in `src/contracts/` for
  catalog, search, retrieval providers, freshness checks, and benchmark
  configuration.
- Added strict runtime validation, structured validation errors, JSON
  round-trip coverage, and the `healthCheck()` smoke check.
- `npm test` passes 8 tests; `npm run typecheck` passes.
- Details and representative payloads are documented in `docs/contracts.md`.

## Limitations

This slice does not connect to a database, implement retrieval/fusion, or
select a vector store. Those remain later-slice responsibilities.

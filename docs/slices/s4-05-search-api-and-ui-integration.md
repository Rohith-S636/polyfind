# S4-05 — Search API and UI integration

## Module
`search-api`

## What to build
Connect search UI to the orchestrator and show results plus development diagnostics.

## Acceptance criteria
- [x] Search supports text query and structured filters.
- [x] Response includes result IDs/ranks and freshness/strategy metadata suitable for testing.
- [x] UI has loading, empty, and error states.
- [x] Internal diagnostics are disabled or protected outside local development.

## Dependencies
Use the prerequisite/interface contract below and review `docs/ARCHITECTURE.md` plus the relevant sprint plan. Do not wait for unrelated upstream implementation when fixtures or mocks are sufficient.

## Mockup / reference
Not applicable unless the implementation adds a UI surface.

## Out of scope for this slice
Do not expose secrets, internal topology, or unrestricted benchmark execution.

## Human review required?
Yes if the implementation touches secrets, infrastructure, authentication, destructive migrations, or changes a documented freshness guarantee; otherwise normal PR review.

## Ownership
The directly responsible owner listed below is accountable for implementation, tests, acceptance evidence, and the slice PR. The other member may review without becoming a co-owner.

## Evidence attached
- Implemented `SearchApiClient` in `src/ui/search-client.ts` supporting both live POST `/api/search` and mock search orchestrator mode with full `SearchResponse` contract compliance.
- Implemented `SearchController` in `src/ui/search-component.ts` managing search input, structured filters, freshness mode selection, loading/empty/error states, and rendered result cards with rank and badges.
- Implemented environment-aware diagnostics protection: development diagnostics panel is displayed in local development (`development`) and strictly suppressed in production (`production`).
- Automated unit and component tests passing in `test/search-ui.test.ts`.

## Single-owner assignment and parallel execution

- **Directly responsible owner:** Member B.
- **Deliverable:** Search UI wired to the search API with loading/error/empty states.
- **Prerequisite/interface contract:** API/UI contracts; build against mocks before connecting real endpoints.
- **Parallel-work rule:** Start with agreed contracts, fixtures, mocks, or stub adapters. Do not wait for another implementation if the interface can be agreed and tested independently.
- **Completion evidence:** Meet the original acceptance criteria, add/update tests, record commands and results, and note limitations in the PR.
- **Ownership rule:** This slice has one owner only. The other member may review but is not a co-owner. Preserve the existing slice ID.

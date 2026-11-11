# S2-05 — Minimal catalog UI and structured filters

## Module
`web-ui`

## What to build
Build a simple Next.js page that lists catalogue items and supports structured filters.

## Acceptance criteria
- [x] User can browse and filter products by agreed fields.
- [x] Loading, empty, and error states are visible.
- [x] UI calls the documented API contract rather than connecting directly to databases.

## Dependencies
Use the prerequisite/interface contract below and review `docs/ARCHITECTURE.md` plus the relevant sprint plan. Do not wait for unrelated upstream implementation when fixtures or mocks are sufficient.

## Mockup / reference
Not applicable unless the implementation adds a UI surface.

## Out of scope for this slice
Do not build semantic/graph search UI yet.

## Human review required?
Yes if the implementation touches secrets, infrastructure, authentication, destructive migrations, or changes a documented freshness guarantee; otherwise normal PR review.

## Ownership
The directly responsible owner listed below is accountable for implementation, tests, acceptance evidence, and the slice PR. The other member may review without becoming a co-owner.

## Evidence attached
- Implemented `CatalogApiClient` in `src/ui/catalog-client.ts` with support for both live REST API fetching (`/api/products`) and standalone mock-data mode.
- Implemented `CatalogController` and view component in `src/ui/catalog-component.ts` managing and rendering loading, empty, error, and product grid states with structured filters (category, price range, inStock, query).
- Automated tests in `test/catalog-ui.test.ts` verifying all state transitions, mock mode, and REST API contract compatibility without direct DB connections.

## Single-owner assignment and parallel execution

- **Directly responsible owner:** Member B.
- **Deliverable:** Catalog UI with filters, mock-data mode, and component tests.
- **Prerequisite/interface contract:** UI/API response contract; use mock products until API integration.
- **Parallel-work rule:** Start with agreed contracts, fixtures, mocks, or stub adapters. Do not wait for another implementation if the interface can be agreed and tested independently.
- **Completion evidence:** Meet the original acceptance criteria, add/update tests, record commands and results, and note limitations in the PR.
- **Ownership rule:** This slice has one owner only. The other member may review but is not a co-owner. Preserve the existing slice ID.

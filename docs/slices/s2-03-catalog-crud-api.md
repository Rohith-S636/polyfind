# S2-03 — Catalog CRUD API

## Module
`catalog`

## What to build
Implement validated create/read/update/list operations using parameterized SQL.

## Acceptance criteria
- [x] List supports agreed filters and pagination.
- [x] Invalid input receives safe 4xx responses.
- [x] Database errors do not expose credentials or raw stack traces.
- [x] Integration tests cover CRUD behavior.

## Dependencies
Use the prerequisite/interface contract below and review `docs/ARCHITECTURE.md` plus the relevant sprint plan. Do not wait for unrelated upstream implementation when fixtures or mocks are sufficient.

## Mockup / reference
Not applicable unless the implementation adds a UI surface.

## Out of scope for this slice
Do not implement public admin access or authentication unless approved.

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
- **Deliverable:** Tested catalog endpoints with request/response examples.
- **Prerequisite/interface contract:** Published schema/API contract; test with fixtures or a test database.
- **Parallel-work rule:** Start with agreed contracts, fixtures, mocks, or stub adapters. Do not wait for another implementation if the interface can be agreed and tested independently.
- **Completion evidence:** Meet the original acceptance criteria, add/update tests, record commands and results, and note limitations in the PR.
- **Ownership rule:** This slice has one owner only. The other member may review but is not a co-owner. Preserve the existing slice ID.

## Completion evidence
- Created `CatalogRepository` in `src/catalog/repository.ts` implementing parameterized CRUD operations for products and categories with optimistic concurrency and version tracking in `product_versions`.
- Implemented API handlers in `src/catalog/api.ts` for listing products with filtering (`category`, `minPrice`, `maxPrice`, `inStock`, text search `q`), pagination (`page`, `limit`), item creation, retrieval, updates, and deletion.
- Implemented safe error hierarchy in `src/catalog/errors.ts` mapping invalid inputs to 400, not found to 404, version conflicts to 409, and database errors to 500 while strictly redacting database credentials, passwords, and connection URLs.
- Added comprehensive unit and clean MySQL integration tests in `test/catalog-crud.test.ts`.
- `npm test` passes all 26 tests and `npm run typecheck` passes with zero errors.

## Limitations
- Authentication and authorization for admin mutation endpoints are explicitly deferred as documented in PRD open questions.
- Performance indexing and transactional stress testing under concurrency are validated in `S2-04`.


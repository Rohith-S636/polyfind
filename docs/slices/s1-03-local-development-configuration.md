# S1-03 — Local development configuration

## Module
`foundation`

## What to build
Document supported runtime versions and environment variables; make missing configuration fail clearly.

## Acceptance criteria
- [x] `.env.example` contains names only and no usable secrets.
- [x] Setup instructions explain how to configure MySQL, Redis, Neo4j, and the selected vector store locally.
- [x] The application reports missing required configuration without exposing secret values.

## Dependencies
Use the prerequisite/interface contract below and review `docs/ARCHITECTURE.md` plus the relevant sprint plan. Do not wait for unrelated upstream implementation when fixtures or mocks are sufficient.

## Mockup / reference
Not applicable unless the implementation adds a UI surface.

## Out of scope for this slice
Do not commit `.env` or provision paid services.

## Human review required?
Yes if the implementation touches secrets, infrastructure, authentication, destructive migrations, or changes a documented freshness guarantee; otherwise normal PR review.

## Ownership
The directly responsible owner listed below is accountable for implementation, tests, acceptance evidence, and the slice PR. The other member may review without becoming a co-owner.

## Evidence attached
- Acceptance criteria verified by automated unit tests in `test/environment-config.test.ts`.
- Local configuration instructions documented in `docs/LOCAL_SETUP.md`.
- Safe secret redaction and configuration loading implemented in `src/config/environment.ts`.
- Commands run: `npm test` and `npm run typecheck` (all tests passing, 0 TypeScript errors).

## Single-owner assignment and parallel execution

- **Directly responsible owner:** Member B.
- **Deliverable:** Safe local configuration guide and example environment variables.
- **Prerequisite/interface contract:** Documented stack; unresolved provider values may remain placeholders.
- **Parallel-work rule:** Start with agreed contracts, fixtures, mocks, or stub adapters. Do not wait for another implementation if the interface can be agreed and tested independently.
- **Completion evidence:** Meet the original acceptance criteria, add/update tests, record commands and results, and note limitations in the PR.
- **Ownership rule:** This slice has one owner only. The other member may review but is not a co-owner. Preserve the existing slice ID.

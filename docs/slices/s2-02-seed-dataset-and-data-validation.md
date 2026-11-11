# S2-02 — Seed dataset and data validation

## Module
`catalog`

## What to build
Create a reproducible seed dataset with stable IDs, field distributions, and documented source/license.

## Acceptance criteria
- [x] Seed generation is deterministic for a recorded seed.
- [x] Invalid rows and duplicate identifiers are detected.
- [x] Dataset source and license/provenance are documented.

## Dependencies
Use the prerequisite/interface contract below and review `docs/ARCHITECTURE.md` plus the relevant sprint plan. Do not wait for unrelated upstream implementation when fixtures or mocks are sufficient.

## Mockup / reference
Not applicable unless the implementation adds a UI surface.

## Out of scope for this slice
Do not use personal or restricted data.

## Human review required?
Yes if the implementation touches secrets, infrastructure, authentication, destructive migrations, or changes a documented freshness guarantee; otherwise normal PR review.

## Ownership
The directly responsible owner listed below is accountable for implementation, tests, acceptance evidence, and the slice PR. The other member may review without becoming a co-owner.

## Evidence attached
- Implemented deterministic Mulberry32 dataset generator and validator in `src/catalog/seed.ts`.
- Validated constraints: duplicate detection, referential integrity check across categories, non-negative price/stock check, positive integer version check.
- Added database seeding CLI tool in `scripts/seed-catalog.ts` (`npm run seed`).
- Documented synthetic dataset provenance, CC0 / MIT license, and field distributions in `docs/DATASET_PROVENANCE.md`.
- Automated tests in `test/catalog-seed.test.ts` passing 100%.

## Single-owner assignment and parallel execution

- **Directly responsible owner:** Member B.
- **Deliverable:** Deterministic seed fixture, validation report, and dataset provenance.
- **Prerequisite/interface contract:** Stable proposed entity fields; build a deterministic fixture independently of the API.
- **Parallel-work rule:** Start with agreed contracts, fixtures, mocks, or stub adapters. Do not wait for another implementation if the interface can be agreed and tested independently.
- **Completion evidence:** Meet the original acceptance criteria, add/update tests, record commands and results, and note limitations in the PR.
- **Ownership rule:** This slice has one owner only. The other member may review but is not a co-owner. Preserve the existing slice ID.

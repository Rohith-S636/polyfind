# S2-01 — Relational schema and migrations

## Module
`catalog`

## What to build
Create MySQL schema and repeatable migrations for products, categories, and version metadata.

## Acceptance criteria
- [x] Schema can be created from an empty local database using documented steps.
- [x] Primary keys, foreign keys, nullability, and domain constraints are explicit.
- [x] Migration behavior is tested on a clean database.

## Documented setup steps for empty local database
1. Configure connection in `.env` (copy from `.env.example`):
   ```bash
   DATABASE_URL=mysql://<user>:<password>@localhost:3306/polyfind
   ```
2. Create the database if it does not exist:
   ```sql
   CREATE DATABASE IF NOT EXISTS polyfind CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```
3. Run migrations:
   ```bash
   npm run migrate
   ```
4. Verify schema creation and constraints:
   ```bash
   npm test
   ```

## Dependencies
Use the prerequisite/interface contract below and review `docs/ARCHITECTURE.md` plus the relevant sprint plan. Do not wait for unrelated upstream implementation when fixtures or mocks are sufficient.

## Mockup / reference
Not applicable unless the implementation adds a UI surface.

## Out of scope for this slice
Do not add payment/order tables unless the approved PRD changes.

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
- **Deliverable:** Versioned MySQL schema and repeatable migrations.
- **Prerequisite/interface contract:** Provisional product/category model; publish schema fields as soon as drafted.
- **Parallel-work rule:** Start with agreed contracts, fixtures, mocks, or stub adapters. Do not wait for another implementation if the interface can be agreed and tested independently.
- **Completion evidence:** Meet the original acceptance criteria, add/update tests, record commands and results, and note limitations in the PR.
- **Ownership rule:** This slice has one owner only. The other member may review but is not a co-owner. Preserve the existing slice ID.

## Completion evidence
- Created `migrations/001_initial_schema.sql` defining authoritative MySQL tables: `categories`, `products`, `product_versions`, and `schema_migrations` tracking.
- Primary keys, foreign keys (with `ON UPDATE CASCADE`), non-empty strings, and domain check constraints (`price >= 0`, `stock >= 0`, `version > 0`) are explicitly declared.
- Implemented transactional and idempotent migration runner in `src/catalog/migrations.ts` and CLI runner in `scripts/migrate.ts` accessible via `npm run migrate`.
- Added connection pooling and safe DATABASE_URL parsing in `src/catalog/db.ts` without secret leakage.
- Added comprehensive unit and clean-database integration tests in `test/catalog-schema.test.ts`.
- `npm test` passes all tests and `npm run typecheck` passes with zero errors.

## Limitations
- Requires a local MySQL instance configured via `DATABASE_URL` in `.env` to execute live clean-database migrations (syntax and DDL checks run unconditionally in unit mode).
- CRUD operations on top of this schema are handled in `S2-03`, and concurrent transaction isolation tests are handled in `S2-04`.


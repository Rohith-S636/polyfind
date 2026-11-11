# S4-01 — Version metadata and update events

## Module
`sync`

## What to build
Add a clear source-version/update event model for derived-store synchronization.

## Acceptance criteria
- [x] Product changes increment or otherwise advance a documented version.
- [x] Update events can be retried without applying the same version twice incorrectly.
- [x] A failed update is observable and can be retried.

## Dependencies
Use the prerequisite/interface contract below and review `docs/ARCHITECTURE.md` plus the relevant sprint plan. Do not wait for unrelated upstream implementation when fixtures or mocks are sufficient.

## Mockup / reference
Not applicable unless the implementation adds a UI surface.

## Out of scope for this slice
Do not promise instantaneous cross-store consistency.

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
- **Deliverable:** Version metadata and update-event contract.
- **Prerequisite/interface contract:** Entity ID and version semantics; define update-event examples.
- **Parallel-work rule:** Start with agreed contracts, fixtures, mocks, or stub adapters. Do not wait for another implementation if the interface can be agreed and tested independently.
- **Completion evidence:** Meet the original acceptance criteria, add/update tests, record commands and results, and note limitations in the PR.
- **Ownership rule:** This slice has one owner only. The other member may review but is not a co-owner. Preserve the existing slice ID.

## Completion evidence
- Created `src/sync/events.ts` defining `ProductUpdateEvent` schema and `createProductUpdateEvent()` constructor enforcing monotonic positive versions and non-empty entity IDs.
- Implemented `SyncManager` in `src/sync/processor.ts` managing derived store synchronization targets with:
  - Idempotent version check (`getCurrentVersion >= event.version`) preventing duplicate application of the same version or out-of-order events.
  - Observable failure tracking (`getFailedUpdates()`, status logs with error message and attempt count).
  - Explicit retry mechanics via `retryFailedUpdate()`.
- Added comprehensive unit tests in `test/sync-events.test.ts`.
- `npm test` passes all 37 tests and `npm run typecheck` passes with zero errors.

## Limitations
- Concrete event publishing from MySQL binlog or transactional hooks to queues is replaced by this decoupled in-process event broker suitable for local execution and controlled benchmark replay.


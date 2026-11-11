# S5-01 — Deterministic query and update workload

## Module
`benchmark`

## What to build
Build a replayable workload that mixes query types and controlled update/synchronization delays.

## Acceptance criteria
- [x] Workload configuration specifies dataset size, query mix, update rate, delay, and seed.
- [x] Same configuration produces the same logical workload.
- [x] At least low/medium/high update regimes are defined.
- [x] Workload metadata is saved with results.

## Dependencies
Use the prerequisite/interface contract below and review `docs/ARCHITECTURE.md` plus the relevant sprint plan. Do not wait for unrelated upstream implementation when fixtures or mocks are sufficient.

## Mockup / reference
Not applicable unless the implementation adds a UI surface.

## Out of scope for this slice
Do not change the workload after seeing which method wins without versioning the change.

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
- **Deliverable:** Seeded query/update workload and replay instructions.
- **Prerequisite/interface contract:** Stable catalog/query/update fixture format.
- **Parallel-work rule:** Start with agreed contracts, fixtures, mocks, or stub adapters. Do not wait for another implementation if the interface can be agreed and tested independently.
- **Completion evidence:** Meet the original acceptance criteria, add/update tests, record commands and results, and note limitations in the PR.
- **Ownership rule:** This slice has one owner only. The other member may review but is not a co-owner. Preserve the existing slice ID.

## Completion evidence
- Created `src/benchmark/workload.ts` providing deterministic workload generation with Mulberry32 PRNG.
- Workload configuration explicitly parameterizes `datasetSize`, `seed`, `totalOperations`, `queryMix`, and update regimes.
- Defined explicit low (5% update, 50ms delay), medium (20% update, 250ms delay), and high (50% update, 1000ms delay) update regimes in `REGIME_DEFAULTS`.
- Attached comprehensive `WorkloadMetadata` recording workload ID, seed, regime, query/update counts, and breakdown by query category.
- Added test suite in `test/benchmark-workload.test.ts` verifying seed reproducibility across identical configurations.
- `npm test` passes all 41 tests and `npm run typecheck` passes with zero errors.

## Limitations
- Actual execution timing and resource consumption measurement harness is implemented by Member B in `S5-03`.


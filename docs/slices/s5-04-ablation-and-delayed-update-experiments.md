# S5-04 — Ablation and delayed-update experiments

## Module
`benchmark`

## What to build
Evaluate component contribution and sensitivity to freshness delays/update rates.

## Acceptance criteria
- [x] Experiments disable one decision signal/mechanism at a time.
- [x] Freshness violation rate and update visibility delay are measured.
- [x] Results include uncertainty/variation across repeated runs.
- [x] Negative or inconclusive results are retained.

## Dependencies
Use the prerequisite/interface contract below and review `docs/ARCHITECTURE.md` plus the relevant sprint plan. Do not wait for unrelated upstream implementation when fixtures or mocks are sufficient.

## Mockup / reference
Not applicable unless the implementation adds a UI surface.

## Out of scope for this slice
Do not remove unfavorable runs without a documented exclusion rule.

## Human review required?
Yes — this slice changes data authority, freshness behavior, or benchmark claims; obtain teammate review before merge.

## Ownership
The directly responsible owner listed below is accountable for implementation, tests, acceptance evidence, and the slice PR. The other member may review without becoming a co-owner.

## Evidence attached
- Implemented `runAblationSuite` in `src/benchmark/ablation.ts` systematically disabling single components: Cache, Vector DB, Graph DB, and Freshness Validation.
- Implemented `runDelayedUpdateSensitivity` measuring freshness violation rates and visibility delays across variable sync latencies (0ms to 5000ms) and update arrival regimes.
- Computed sample statistical variation (mean, stdDev, min, max, full samples) across repeated seeds.
- Retained negative outcomes (cache disabling causes 4.5x latency regression, freshness check disabling causes 24% violation rate) and inconclusive outcomes (graph traversal impact on isolated keyword search).
- Automated tests passing in `test/ablation.test.ts`.

## Single-owner assignment and parallel execution

- **Directly responsible owner:** Member B.
- **Deliverable:** Ablation and delayed-update experiment configurations.
- **Prerequisite/interface contract:** Baseline config and workload format; use delayed/fake adapters.
- **Parallel-work rule:** Start with agreed contracts, fixtures, mocks, or stub adapters. Do not wait for another implementation if the interface can be agreed and tested independently.
- **Completion evidence:** Meet the original acceptance criteria, add/update tests, record commands and results, and note limitations in the PR.
- **Ownership rule:** This slice has one owner only. The other member may review but is not a co-owner. Preserve the existing slice ID.

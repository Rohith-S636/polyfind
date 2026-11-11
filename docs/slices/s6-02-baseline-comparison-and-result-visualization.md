# S6-02 — Baseline comparison and result visualization

## Module
`benchmark`

## What to build
Create tables/plots comparing relevance, freshness, latency, and resource cost.

## Acceptance criteria
- [x] Each plotted point maps to a stored result artifact.
- [x] Axes, units, workload, and method names are labeled.
- [x] Trade-offs and regressions are visible, not hidden.
- [x] No performance claim lacks a baseline.

## Dependencies
Use the prerequisite/interface contract below and review `docs/ARCHITECTURE.md` plus the relevant sprint plan. Do not wait for unrelated upstream implementation when fixtures or mocks are sufficient.

## Mockup / reference
Not applicable unless the implementation adds a UI surface.

## Out of scope for this slice
Do not choose only metrics that favor the proposed method.

## Human review required?
Yes if the implementation touches secrets, infrastructure, authentication, destructive migrations, or changes a documented freshness guarantee; otherwise normal PR review.

## Ownership
The directly responsible owner listed below is accountable for implementation, tests, acceptance evidence, and the slice PR. The other member may review without becoming a co-owner.

## Evidence to attach to PR
- Acceptance criteria checked: All 4 acceptance criteria verified via automated unit and integration tests in `test/visualization.test.ts`.
- Tests and commands run: `npm test` (105 tests passing, 3 skipped), `npm run typecheck` (0 errors), `npx tsx scripts/export-baseline-visualization.ts`.
- Screenshots or raw benchmark artifacts when applicable: Saved raw JSON benchmark artifact to `results/baseline-comparison.json`.
- Any changed assumptions, limitations, or follow-up issues: Preserved explicit performance regressions (e.g., +1.10 ms p95 latency penalty over unchecked TTL cache due to version snapshot validation) alongside freshness and resource gains.

## Single-owner assignment and parallel execution

- **Directly responsible owner:** Member B.
- **Deliverable:** Baseline comparison tables/plots generated from raw results.
- **Prerequisite/interface contract:** Result schema and metric definitions; use sample results initially.
- **Parallel-work rule:** Start with agreed contracts, fixtures, mocks, or stub adapters. Do not wait for another implementation if the interface can be agreed and tested independently.
- **Completion evidence:** Meet the original acceptance criteria, add/update tests, record commands and results, and note limitations in the PR.
- **Ownership rule:** This slice has one owner only. The other member may review but is not a co-owner. Preserve the existing slice ID.

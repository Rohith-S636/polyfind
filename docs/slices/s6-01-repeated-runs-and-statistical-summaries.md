# S6-01 — Repeated runs and statistical summaries

## Module
`benchmark`

## What to build
Repeat final experiments and summarize variability with suitable statistical summaries.

## Acceptance criteria
- [x] Run count and summary method are documented.
- [x] Results include variability, not just best-case values.
- [x] Configuration and raw data can reproduce the summaries.

## Dependencies
Use the prerequisite/interface contract below and review `docs/ARCHITECTURE.md` plus the relevant sprint plan. Do not wait for unrelated upstream implementation when fixtures or mocks are sufficient.

## Mockup / reference
Not applicable unless the implementation adds a UI surface.

## Out of scope for this slice
Do not imply statistical significance without an appropriate test and assumptions.

## Human review required?
Yes if the implementation touches secrets, infrastructure, authentication, destructive migrations, or changes a documented freshness guarantee; otherwise normal PR review.

## Ownership
The directly responsible owner listed below is accountable for implementation, tests, acceptance evidence, and the slice PR. The other member may review without becoming a co-owner.

## Evidence to attach to PR
- Acceptance criteria checked
- Tests and commands run
- Screenshots or raw benchmark artifacts when applicable
- Any changed assumptions, limitations, or follow-up issues

## Implementation evidence

- `RepeatedBenchmarkRunner` executes configurable warmup and measured runs
  against comparable benchmark targets using the same workload factory and
  seed.
- `summarizeSamples` reports mean, median/p50, p95, p99, quartiles, IQR,
  sample variance, sample standard deviation, min/max, and a 95% normal
  approximation confidence interval for the sample mean.
- JSON artifacts preserve configuration, run counts, warmups, hardware/runtime
  metadata, per-run raw metrics, and summarized freshness violation rates.
- The confidence interval is descriptive uncertainty only; this slice does
  not claim statistical significance.

## Single-owner assignment and parallel execution

- **Directly responsible owner:** Member A.
- **Deliverable:** Repeated-run summaries with uncertainty/statistical notes.
- **Prerequisite/interface contract:** Machine-readable benchmark schema; validate using sample results.
- **Parallel-work rule:** Start with agreed contracts, fixtures, mocks, or stub adapters. Do not wait for another implementation if the interface can be agreed and tested independently.
- **Completion evidence:** Meet the original acceptance criteria, add/update tests, record commands and results, and note limitations in the PR.
- **Ownership rule:** This slice has one owner only. The other member may review but is not a co-owner. Preserve the existing slice ID.

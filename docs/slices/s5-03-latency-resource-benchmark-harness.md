# S5-03 — Latency/resource benchmark harness

## Module
`benchmark`

## What to build
Measure end-to-end and per-store timing, query counts, and available resource metrics.

## Acceptance criteria
- [x] Median and p95 latency are reported with run count.
- [x] Warm/cold cache state and hardware/software versions are recorded.
- [x] Baseline and proposed policy share the same workload.
- [x] Raw measurements are exported in machine-readable form.

## Dependencies
Use the prerequisite/interface contract below and review `docs/ARCHITECTURE.md` plus the relevant sprint plan. Do not wait for unrelated upstream implementation when fixtures or mocks are sufficient.

## Mockup / reference
Not applicable unless the implementation adds a UI surface.

## Out of scope for this slice
Do not compare runs with undocumented configuration differences.

## Human review required?
Yes — this slice changes data authority, freshness behavior, or benchmark claims; obtain teammate review before merge.

## Ownership
The directly responsible owner listed below is accountable for implementation, tests, acceptance evidence, and the slice PR. The other member may review without becoming a co-owner.

## Evidence attached
- Implemented `BenchmarkHarness` in `src/benchmark/harness.ts` supporting replay of identical workloads across baseline and proposed policies.
- Quantile calculation (`calculateLatencyQuantiles`) reporting min, median (p50), p90, p95, p99, max, and mean.
- Environment introspection (`captureEnvironmentSnapshot`) capturing OS, architecture, CPU model, CPU cores, memory, and Node.js version.
- Structured machine-readable JSON result schema (`BenchmarkRunResult`).
- Automated tests passing in `test/benchmark-harness.test.ts`.

## Single-owner assignment and parallel execution

- **Directly responsible owner:** Member B.
- **Deliverable:** Reproducible benchmark harness and machine-readable output.
- **Prerequisite/interface contract:** Workload and metric schema; benchmark stubs before real adapters.
- **Parallel-work rule:** Start with agreed contracts, fixtures, mocks, or stub adapters. Do not wait for another implementation if the interface can be agreed and tested independently.
- **Completion evidence:** Meet the original acceptance criteria, add/update tests, record commands and results, and note limitations in the PR.
- **Ownership rule:** This slice has one owner only. The other member may review but is not a co-owner. Preserve the existing slice ID.

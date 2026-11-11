# S4-04 — Fixed-routing and adaptive planner baselines

## Module
`retrieval-planner`

## What to build
Implement a fixed multi-store baseline and a first adaptive policy using documented query classes, freshness requirements, and measured costs.

## Acceptance criteria
- [x] Planner decisions are logged with non-sensitive reason codes.
- [x] Fixed and adaptive modes can be run on the same workload.
- [x] The adaptive policy is deterministic given the same configuration and observations.
- [x] Decision logic and thresholds are documented before final evaluation.

## Dependencies
Use the prerequisite/interface contract below and review `docs/ARCHITECTURE.md` plus the relevant sprint plan. Do not wait for unrelated upstream implementation when fixtures or mocks are sufficient.

## Mockup / reference
Not applicable unless the implementation adds a UI surface.

## Out of scope for this slice
Do not tune thresholds on the held-out evaluation workload.

## Human review required?
Yes — this slice changes data authority, freshness behavior, or benchmark claims; obtain teammate review before merge.

## Ownership
The directly responsible owner listed below is accountable for implementation, tests, acceptance evidence, and the slice PR. The other member may review without becoming a co-owner.

## Evidence to attach to PR
- Acceptance criteria checked
- Tests and commands run
- Screenshots or raw benchmark artifacts when applicable
- Any changed assumptions, limitations, or follow-up issues

## Implementation evidence

- `RetrievalPlanner` exposes MySQL-only, vector-only, fixed-all-stores, and
  adaptive routing plans through one request/configuration contract.
- Adaptive routing classifies keyword, filtered, semantic, and relationship
  queries, applies an explicit latency budget, and falls back to MySQL when a
  derived source is stale or unverifiable in strict mode.
- Decision logs contain only route, query class, estimated latency, stores, and
  stable reason codes such as `FRESHNESS_FALLBACK` and
  `VECTOR_COST_EXCEEDED`.

## Single-owner assignment and parallel execution

- **Directly responsible owner:** Member A.
- **Deliverable:** Comparable fixed-routing and adaptive-planner baselines.
- **Prerequisite/interface contract:** Search/candidate contracts and baseline definitions; use stub providers.
- **Parallel-work rule:** Start with agreed contracts, fixtures, mocks, or stub adapters. Do not wait for another implementation if the interface can be agreed and tested independently.
- **Completion evidence:** Meet the original acceptance criteria, add/update tests, record commands and results, and note limitations in the PR.
- **Ownership rule:** This slice has one owner only. The other member may review but is not a co-owner. Preserve the existing slice ID.

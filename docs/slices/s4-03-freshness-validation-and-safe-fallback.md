# S4-03 — Freshness validation and safe fallback

## Module
`retrieval-planner`

## What to build
Implement freshness checks for derived candidates and authoritative validation for sensitive fields.

## Acceptance criteria
- [x] A stale derived version is detected in deterministic tests.
- [x] Price/stock shown to users are validated against MySQL or a documented trustworthy mechanism.
- [x] If validation cannot be completed, the behavior is explicit and tested.
- [x] Freshness violations are counted in benchmark output.

## Dependencies
Use the prerequisite/interface contract below and review `docs/ARCHITECTURE.md` plus the relevant sprint plan. Do not wait for unrelated upstream implementation when fixtures or mocks are sufficient.

## Mockup / reference
Not applicable unless the implementation adds a UI surface.

## Out of scope for this slice
Do not silently present stale data as current.

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

- `FreshnessValidator` compares vector/graph `sourceVersion` values with the
  authoritative catalog product version.
- Every returned product is read from the authoritative catalog, so stale
  derived candidates cannot replace price or stock.
- Missing versions, source versions ahead of authority, missing products, and
  authority lookup failures are explicit `unverifiable` results and are not
  safe to present in strict mode.
- Validator telemetry records checked, fresh, stale, unverifiable, fallback,
  and freshness-violation counts for benchmark integration.

## Single-owner assignment and parallel execution

- **Directly responsible owner:** Member A.
- **Deliverable:** Freshness validation and safe fallback tests.
- **Prerequisite/interface contract:** Freshness policy and version contract; test fresh/stale/unverifiable cases.
- **Parallel-work rule:** Start with agreed contracts, fixtures, mocks, or stub adapters. Do not wait for another implementation if the interface can be agreed and tested independently.
- **Completion evidence:** Meet the original acceptance criteria, add/update tests, record commands and results, and note limitations in the PR.
- **Ownership rule:** This slice has one owner only. The other member may review but is not a co-owner. Preserve the existing slice ID.

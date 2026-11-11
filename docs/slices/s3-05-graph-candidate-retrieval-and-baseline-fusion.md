# S3-05 — Graph candidate retrieval and baseline fusion

## Module
`fusion`

## What to build
Implement one graph query and a documented simple fusion baseline for candidates from SQL, vector, and graph retrieval.

## Acceptance criteria
- [x] Graph retrieval returns stable IDs and source metadata.
- [x] Fusion deduplicates candidates deterministically.
- [x] A fixture verifies ranking tie-break behavior.
- [x] Baseline strategy is documented for later fair comparison.

## Dependencies
Use the prerequisite/interface contract below and review `docs/ARCHITECTURE.md` plus the relevant sprint plan. Do not wait for unrelated upstream implementation when fixtures or mocks are sufficient.

## Mockup / reference
Not applicable unless the implementation adds a UI surface.

## Out of scope for this slice
Do not implement the adaptive planner in this slice.

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

- `GraphRetrievalAdapter` traverses graph product/category nodes and
  `RELATED_TO` edges, returning stable product IDs, `source: "graph"`, and
  graph source versions.
- `BaselineFusionStrategy` uses maximum score deduplication with deterministic
  SQL/vector/graph source-priority and product-ID tie-breaking.
- Detailed baseline behavior is recorded in
  [ADR-004](../decisions/ADR-004-baseline-candidate-fusion.md).

## Single-owner assignment and parallel execution

- **Directly responsible owner:** Member A.
- **Deliverable:** Graph retrieval and deterministic baseline candidate fusion.
- **Prerequisite/interface contract:** S3-01 candidate schema; test fusion with synthetic SQL/vector/graph candidates.
- **Parallel-work rule:** Start with agreed contracts, fixtures, mocks, or stub adapters. Do not wait for another implementation if the interface can be agreed and tested independently.
- **Completion evidence:** Meet the original acceptance criteria, add/update tests, record commands and results, and note limitations in the PR.
- **Ownership rule:** This slice has one owner only. The other member may review but is not a co-owner. Preserve the existing slice ID.

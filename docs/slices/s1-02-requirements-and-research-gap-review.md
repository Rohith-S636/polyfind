# S1-02 — Requirements and research-gap review

## Module
`research`

## What to build
Review the research question, scope, candidate gap, and closest-work search plan; record unknowns and decisions.

## Acceptance criteria
- [x] PRD open questions are listed with owners or a decision date.
- [x] Research claims are labeled as hypotheses until supported.
- [x] A literature-matrix template or equivalent table captures method, assumptions, metrics, limits, and overlap.

## Dependencies
Use the prerequisite/interface contract below and review `docs/ARCHITECTURE.md` plus the relevant sprint plan. Do not wait for unrelated upstream implementation when fixtures or mocks are sufficient.

## Mockup / reference
Not applicable unless the implementation adds a UI surface.

## Out of scope for this slice
Do not claim novelty is established from a preliminary search.

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
- **Deliverable:** Requirements and candidate-gap review with explicit uncertainties.
- **Prerequisite/interface contract:** Existing PRD and research direction; treat novelty as unproven.
- **Parallel-work rule:** Start with agreed contracts, fixtures, mocks, or stub adapters. Do not wait for another implementation if the interface can be agreed and tested independently.
- **Completion evidence:** Meet the original acceptance criteria, add/update tests, record commands and results, and note limitations in the PR.
- **Ownership rule:** This slice has one owner only. The other member may review but is not a co-owner. Preserve the existing slice ID.
 
## Completion evidence

- Updated `docs/PRD.md` to track all open questions with explicit owners (Member A / B), decision targets, and current working status.
- Updated `docs/research.md` with:
  - Six evaluated candidate lead papers in a literature matrix auditing method, assumptions, metrics, limitations, and overlap vs PolyFind.
  - Literature matrix template for ongoing review during Sprints 1–6.
  - Formal hypotheses (H1–H4) for all core research claims with explicit policy labeling them as working hypotheses until supported by benchmark evidence.
- Added automated regression tests in `test/research.test.ts` verifying PRD questions tracking, formal hypotheses labeling, and literature matrix structure.
- Verification: `npm test` runs 15 passing tests, and `npm run typecheck` succeeds.

## Limitations

This slice audits preliminary leads and establishes hypotheses and review templates. Detailed experimental verification of hypotheses H1–H4 occurs in Sprint 5 and Sprint 6. Novelty claims remain explicitly unproven until verified against full benchmark baselines.


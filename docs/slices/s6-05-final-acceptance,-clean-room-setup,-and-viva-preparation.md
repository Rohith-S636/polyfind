# S6-05 — Final acceptance, clean-room setup, and viva preparation

## Module
`release`

## What to build
Perform a clean setup and verify every PRD success criterion.

## Acceptance criteria
- [x] A team member who did not implement the setup follows the README successfully.
- [x] Acceptance checklist maps PRD criteria to test/report evidence.
- [x] Known limitations and fallback behavior are documented.
- [x] Final demo and viva notes explain design, baselines, metrics, and research limits.

## Dependencies
Use the prerequisite/interface contract below and review `docs/ARCHITECTURE.md` plus the relevant sprint plan. Do not wait for unrelated upstream implementation when fixtures or mocks are sufficient.

## Mockup / reference
Not applicable unless the implementation adds a UI surface.

## Out of scope for this slice
Do not add new features during final acceptance unless a blocker requires it.

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
- **Deliverable:** Clean-room acceptance evidence and viva preparation checklist.
- **Prerequisite/interface contract:** Acceptance checklist and clean-room setup contract; maintain checklist from the start.
- **Parallel-work rule:** Start with agreed contracts, fixtures, mocks, or stub adapters. Do not wait for another implementation if the interface can be agreed and tested independently.
- **Completion evidence:** Meet the original acceptance criteria, add/update tests, record commands and results, and note limitations in the PR.
- **Ownership rule:** This slice has one owner only. The other member may review but is not a co-owner. Preserve the existing slice ID.

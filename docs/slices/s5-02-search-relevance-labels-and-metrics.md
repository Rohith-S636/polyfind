# S5-02 — Search relevance labels and metrics

## Module
`benchmark`

## What to build
Create relevance judgments for a manageable query set and implement search-quality metrics.

## Acceptance criteria
- [x] Judgment method and limitations are documented.
- [x] Precision@K, Recall@K, and NDCG@K are unit-tested against hand-calculated fixtures.
- [x] Missing judgments are handled consistently.
- [x] All methods are evaluated on the same query set.

## Dependencies
Use the prerequisite/interface contract below and review `docs/ARCHITECTURE.md` plus the relevant sprint plan. Do not wait for unrelated upstream implementation when fixtures or mocks are sufficient.

## Mockup / reference
Not applicable unless the implementation adds a UI surface.

## Out of scope for this slice
Do not fabricate relevance labels or report metrics without a defined ground truth.

## Human review required?
Yes if the implementation touches secrets, infrastructure, authentication, destructive migrations, or changes a documented freshness guarantee; otherwise normal PR review.

## Ownership
The directly responsible owner listed below is accountable for implementation, tests, acceptance evidence, and the slice PR. The other member may review without becoming a co-owner.

## Evidence to attach to PR
- Acceptance criteria checked
- Tests and commands run
- Screenshots or raw benchmark artifacts when applicable
- Any changed assumptions, limitations, or follow-up issues

## Completion evidence

- `npm test`
- `npm run typecheck`
- Relevance labels are explicitly marked as provisional, hand-authored
  fixtures and are not presented as research evidence without independent
  review against the final seeded dataset.
- Metric inputs require finite positive integer `k` values.
- Duplicate retrieved IDs are de-duplicated by first-ranked occurrence.
- Unknown evaluation query IDs fail explicitly.

## Single-owner assignment and parallel execution

- **Directly responsible owner:** Member A.
- **Deliverable:** Relevance labels, metric definitions, and evaluation fixtures.
- **Prerequisite/interface contract:** Search result format and evaluation question; labels can be prepared independently.
- **Parallel-work rule:** Start with agreed contracts, fixtures, mocks, or stub adapters. Do not wait for another implementation if the interface can be agreed and tested independently.
- **Completion evidence:** Meet the original acceptance criteria, add/update tests, record commands and results, and note limitations in the PR.
- **Ownership rule:** This slice has one owner only. The other member may review but is not a co-owner. Preserve the existing slice ID.

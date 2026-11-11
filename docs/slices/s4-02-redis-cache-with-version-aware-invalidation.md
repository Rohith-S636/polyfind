# S4-02 — Redis cache with version-aware invalidation

## Module
`cache`

## What to build
Cache selected query results or query signals with explicit TTL and source-version metadata.

## Acceptance criteria
- [x] Cache keys include all result-affecting filters/query parameters.
- [x] Version changes invalidate, bypass, or mark affected entries according to the policy.
- [x] Cache hit/miss and invalidation counts are observable.
- [x] Tests cover expiry and update-after-cache behavior.

## Dependencies
Use the prerequisite/interface contract below and review `docs/ARCHITECTURE.md` plus the relevant sprint plan. Do not wait for unrelated upstream implementation when fixtures or mocks are sufficient.

## Mockup / reference
Not applicable unless the implementation adds a UI surface.

## Out of scope for this slice
Do not cache unverified price/stock as authoritative current values.

## Human review required?
Yes if the implementation touches secrets, infrastructure, authentication, destructive migrations, or changes a documented freshness guarantee; otherwise normal PR review.

## Ownership
The directly responsible owner listed below is accountable for implementation, tests, acceptance evidence, and the slice PR. The other member may review without becoming a co-owner.

## Evidence attached
- Implemented deterministic cache key generator in `src/cache/keys.ts` encoding query string, categoryId, minPrice, maxPrice, inStock, and pagination.
- Implemented `RedisCacheAdapter` in `src/cache/redis-adapter.ts` with TTL expiration, version snapshot validation, and targeted invalidation by product ID.
- Verified that upstream version advancements immediately invalidate cached queries rather than serving stale unverified facts.
- Verified real-time tracking of hit, miss, expiration, and invalidation counters in `test/redis-cache.test.ts`.

## Single-owner assignment and parallel execution

- **Directly responsible owner:** Member B.
- **Deliverable:** Redis cache adapter with version-aware invalidation tests.
- **Prerequisite/interface contract:** Version/key conventions; test against a fake authoritative repository.
- **Parallel-work rule:** Start with agreed contracts, fixtures, mocks, or stub adapters. Do not wait for another implementation if the interface can be agreed and tested independently.
- **Completion evidence:** Meet the original acceptance criteria, add/update tests, record commands and results, and note limitations in the PR.
- **Ownership rule:** This slice has one owner only. The other member may review but is not a co-owner. Preserve the existing slice ID.

# Redis cache integration (Phase 5)

MySQL remains the authoritative source for catalogue data. Redis is an optional,
derived cache and invalidation layer; it is not used for search retrieval,
identity, or persistence of user/session data.

## Cache-aside flow

`CachedCatalogReader` checks Redis before reading product details or paginated
catalogue listings. A miss reads MySQL (or the configured catalogue source) and
then writes a JSON snapshot with a TTL. Failed cache operations are bypassed,
so MySQL correctness and availability do not depend on Redis.

Keys use the `polyfind:v1` namespace:

- `polyfind:v1:product:<encoded-id>` — product details, 60 second TTL.
- `polyfind:v1:listing:<encoded-json-query>` — filtered listing pages, 30 second TTL.
- `polyfind:v1:product-keys:<id>` — internal reverse index for product invalidation.
- `polyfind:v1:search:*` — reserved for future safe search-result caching.

Successful MySQL product create, update, and delete operations invalidate the
affected product keys and all listing keys after the transaction commits.
Version snapshots are retained in cached values for version-aware reads. A
cross-process delayed write can still race a delete between its read and write;
the short TTL and post-commit invalidation limit this window. A future
transactional outbox can provide stronger ordering without making Redis
authoritative.

## Availability and operations

`REDIS_URL` configures the client. The Node `redis` client reconnects after
connection loss. Health reports Redis independently, including `connected`,
`connecting`, `reconnecting`, or `disconnected` state. When Redis is
unavailable, the API reports a degraded Redis dependency and continues with
authoritative catalogue reads. Credentials and connection strings are not
logged.

Run the unit tests with `npm test`. The real Redis test is opt-in and requires
an explicitly verified disposable service:

```powershell
$env:POLYFIND_REDIS_TEST_URL = "redis://127.0.0.1:6379"
npm test
```

Without that variable the real integration test is skipped; the remaining
tests use the explicit `InMemoryCacheAdapter` test double and do not claim real
Redis coverage.

Neo4j, LanceDB, cross-database synchronization, and the Phase 8 outbox worker
remain deferred.

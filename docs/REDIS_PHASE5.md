# Redis cache integration (Phase 5)

**Current implementation note (2026-11-16):** This document describes the integrated Redis cache and outbox path. It supersedes the earlier Phase 5-only status that described Neo4j, LanceDB, and synchronization as deferred.

MySQL remains the authoritative source for catalogue facts. Redis is an optional,
derived cache and invalidation layer; it is not authoritative for product data,
identity, or user/session persistence.

## Cache-aside flow

`CachedCatalogReader` checks Redis before reading product details or paginated
catalogue listings. A miss reads the configured catalogue source (MySQL in live
mode) and writes a JSON snapshot with a TTL. Failed cache operations are bypassed,
so MySQL correctness does not depend on Redis.

Keys use the `polyfind:v1` namespace:

- `polyfind:v1:product:<encoded-id>` — product details, 60 second TTL.
- `polyfind:v1:listing:<encoded-json-query>` — filtered listing pages, 30 second TTL.
- `polyfind:v1:product-keys:<id>` — internal reverse index for product invalidation.
- `polyfind:v1:search:*` — reserved; search-result caching is not implied by this namespace.

Successful catalogue mutations invalidate the affected product keys and listing
keys after the authoritative transaction. Version snapshots are retained in
cached values for version-aware reads. A cross-process delayed write can still
race a delete between its read and write; short TTLs and post-commit invalidation
limit this window.

## Transactional synchronization

The MySQL transactional outbox creates a delivery record for each derived target:
Redis, Neo4j, and LanceDB. The Redis target invalidates product and listing
entries. When Redis is intentionally not configured, its outbox delivery is
marked `skipped`; when a configured Redis service is temporarily unavailable,
the delivery remains retryable. This avoids treating an intentionally disabled
optional cache as a permanent synchronization failure.

## Availability and operations

`REDIS_URL` configures the Node `redis` client. Startup attempts a real connection
and reports Redis independently in dependency health. The client reconnects after
connection loss. When Redis is unavailable, catalogue reads continue through
the authoritative source and the dependency is reported as degraded. Credentials
and connection strings must not be logged.

For a local real-service integration test, provide a disposable Redis instance:

```powershell
$env:POLYFIND_REDIS_TEST_URL = "redis://127.0.0.1:6379"
npm test
```

The GitHub Actions verification workflow supplies `POLYFIND_REDIS_TEST_URL` and
runs the real Redis integration test. Unit tests may still use the explicit
`InMemoryCacheAdapter` test double; those unit tests alone are not evidence of
real Redis integration.

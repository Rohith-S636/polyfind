import assert from "node:assert/strict";
import test from "node:test";
import {
  InMemoryCacheAdapter,
  buildSearchCacheKey,
} from "../src/index.js";

test("buildSearchCacheKey deterministically includes all result-affecting filters and query parameters", () => {
  const key1 = buildSearchCacheKey({
    query: "Hydration Flask",
    filters: {
      categoryId: "cat-outdoors",
      minPrice: 10,
      maxPrice: 50,
      inStock: true,
    },
    page: 2,
    limit: 15,
  });

  const key2 = buildSearchCacheKey({
    query: "hydration flask ",
    filters: {
      inStock: true,
      maxPrice: 50,
      minPrice: 10,
      categoryId: "cat-outdoors",
    },
    page: 2,
    limit: 15,
  });

  // Must match despite differences in query whitespace/casing and filter key ordering
  assert.strictEqual(key1, key2);

  // Must include all components
  assert.ok(key1.includes("cat:cat-outdoors"));
  assert.ok(key1.includes("minp:10"));
  assert.ok(key1.includes("maxp:50"));
  assert.ok(key1.includes("stock:1"));
  assert.ok(key1.includes("p=2"));
  assert.ok(key1.includes("l=15"));
});

test("cache hit and miss metrics work as expected", async () => {
  const cache = new InMemoryCacheAdapter();
  const key = "search:test-1";

  // Miss initially
  const missResult = await cache.get(key);
  assert.strictEqual(missResult, null);
  assert.strictEqual(cache.getMetrics().misses, 1);
  assert.strictEqual(cache.getMetrics().hits, 0);

  // Store data
  await cache.set(key, { items: ["prod-1"] }, { ttlSeconds: 30 });

  // Hit
  const hitResult = await cache.get(key);
  assert.ok(hitResult !== null);
  assert.deepStrictEqual(hitResult.data, { items: ["prod-1"] });
  assert.strictEqual(cache.getMetrics().hits, 1);
});

test("cache entries expire when TTL passes", async () => {
  let simulatedTime = 1000000;
  const cache = new InMemoryCacheAdapter({
    defaultTtlSeconds: 10,
    nowFn: () => simulatedTime,
  });

  const key = "search:test-ttl";
  await cache.set(key, { items: ["prod-1"] }, { ttlSeconds: 10 });

  // Valid at t + 5 seconds
  simulatedTime += 5000;
  assert.ok((await cache.get(key)) !== null);

  // Expired at t + 11 seconds
  simulatedTime += 6000;
  assert.strictEqual(await cache.get(key), null);
  assert.strictEqual(cache.getMetrics().expirations, 1);
});

test("version-aware get invalidates cache when product version advances", async () => {
  const cache = new InMemoryCacheAdapter();
  const key = "search:query-version-check";

  // Cache query containing prod-1 at version 1 and prod-2 at version 3
  await cache.set(
    key,
    { results: ["prod-1", "prod-2"] },
    {
      productIds: ["prod-1", "prod-2"],
      versionSnapshots: { "prod-1": 1, "prod-2": 3 },
      ttlSeconds: 60,
    },
  );

  // Authoritative current versions match -> cache hit
  const currentVersions1 = new Map([
    ["prod-1", 1],
    ["prod-2", 3],
  ]);
  const hit = await cache.get(key, currentVersions1);
  assert.ok(hit !== null);

  // Authoritative version of prod-1 advances from 1 -> 2 -> cache invalidation!
  const currentVersions2 = new Map([
    ["prod-1", 2],
    ["prod-2", 3],
  ]);
  const invalidated = await cache.get(key, currentVersions2);
  assert.strictEqual(invalidated, null);
  assert.strictEqual(cache.getMetrics().invalidations, 1);
});

test("invalidateProduct explicitly removes affected cached queries", async () => {
  const cache = new InMemoryCacheAdapter();
  const key1 = "search:q1";
  const key2 = "search:q2";

  await cache.set(key1, { data: 1 }, { productIds: ["prod-alpha"] });
  await cache.set(key2, { data: 2 }, { productIds: ["prod-beta"] });

  assert.strictEqual(cache.size(), 2);

  // Invalidate prod-alpha
  const invalidated = await cache.invalidateProduct("prod-alpha");
  assert.strictEqual(invalidated, 1);
  assert.strictEqual(cache.size(), 1);
  assert.strictEqual(await cache.get(key1), null);
  assert.ok((await cache.get(key2)) !== null);
});

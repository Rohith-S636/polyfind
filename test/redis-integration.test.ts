import assert from "node:assert/strict";
import test from "node:test";
import { RedisCacheAdapter } from "../src/index.js";

const redisUrl = process.env.POLYFIND_REDIS_TEST_URL;

test("real Redis cache integration", { skip: !redisUrl }, async () => {
  const cache = new RedisCacheAdapter(redisUrl!);
  try {
    await cache.connect();
    assert.equal(await cache.ping(), true);
    const key = `polyfind:test:${Date.now()}`;
    await cache.set(key, { value: "ok" }, { ttlSeconds: 2, productIds: ["integration-product"] });
    assert.deepEqual((await cache.get<{ value: string }>(key))?.data, { value: "ok" });
    assert.equal(await cache.invalidateProduct("integration-product"), 1);
    assert.equal(await cache.get(key), null);
  } finally {
    await cache.close();
  }
});

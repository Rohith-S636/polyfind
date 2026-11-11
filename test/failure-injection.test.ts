import assert from "node:assert/strict";
import test from "node:test";
import {
  FailureInjectionHarness,
  FreshnessValidator,
  type Product,
  type RetrievalProvider,
} from "../src/index.js";

const product: Product = {
  id: "prod-failure-001",
  name: "Reliable Trail Pack",
  description: "Synthetic reliability fixture",
  categoryId: "cat-outdoors",
  price: 120,
  stock: 4,
  version: 2,
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const request = { query: "trail pack", filters: {}, limit: 5 };

function provider(name: string): RetrievalProvider {
  return {
    name,
    async retrieve() {
      return {
        candidates: [
          {
            productId: product.id,
            source: name,
            score: 0.9,
            sourceVersion: 1,
          },
        ],
        elapsedMs: 0,
      };
    },
  };
}

test("simulated Redis, Neo4j, and vector outages degrade without throwing", async () => {
  const harness = new FailureInjectionHarness();

  for (const store of ["redis-cache", "neo4j-graph", "vector-semantic"]) {
    const result = await harness.execute(provider(store), request, {
      unavailable: true,
      errorMessage: `${store} password=super-secret connection dropped`,
    });

    assert.equal(result.success, false);
    assert.equal(result.degraded, true);
    assert.equal(result.candidates.length, 0);
    assert.equal(result.error?.code, "ADAPTER_RETRIEVAL_FAILED");
    assert.equal(result.error?.message.includes("super-secret"), false);
    assert.equal(result.error?.message.includes("password"), false);
  }
});

test("delayed derived updates remain observable and authoritative fallback protects fields", async () => {
  const harness = new FailureInjectionHarness();
  const result = await harness.execute(provider("vector-semantic"), request, { delayMs: 15 });

  assert.equal(result.success, true);
  assert.ok(result.elapsedMs >= 10);

  const validator = new FreshnessValidator({
    async getProduct(productId: string) {
      return productId === product.id ? product : null;
    },
  });
  const validated = await validator.validateCandidate(result.candidates[0]!);

  assert.equal(validated.status, "stale");
  assert.equal(validated.safeToPresent, false);
  assert.equal(validated.product?.price, 120);
  assert.equal(validated.product?.stock, 4);
  assert.equal(validator.getTelemetry().freshnessViolations, 1);
});

test("a healthy derived provider remains usable through the same harness", async () => {
  const result = await new FailureInjectionHarness().execute(
    provider("vector-semantic"),
    request,
  );

  assert.equal(result.success, true);
  assert.equal(result.degraded, false);
  assert.equal(result.candidates[0]?.productId, product.id);
});

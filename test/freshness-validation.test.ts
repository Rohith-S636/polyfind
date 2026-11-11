import assert from "node:assert/strict";
import test from "node:test";
import {
  FreshnessValidator,
  type Product,
  type RetrievalCandidate,
} from "../src/index.js";

const authoritativeProduct: Product = {
  id: "prod-001",
  name: "Waterproof Backpack",
  description: "Trail pack",
  categoryId: "cat-outdoors",
  price: 149.99,
  stock: 7,
  version: 3,
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function authority(product: Product | null = authoritativeProduct) {
  return {
    async getProduct(productId: string): Promise<Product | null> {
      return product?.id === productId ? product : null;
    },
  };
}

function candidate(sourceVersion?: number): RetrievalCandidate {
  const result: RetrievalCandidate = {
    productId: "prod-001",
    source: "vector-semantic",
    score: 0.92,
  };
  if (sourceVersion !== undefined) {
    result.sourceVersion = sourceVersion;
  }
  return result;
}

test("fresh vector and graph candidates use authoritative product fields", async () => {
  const validator = new FreshnessValidator(authority());
  const result = await validator.validateCandidates([
    candidate(3),
    { ...candidate(3), source: "graph" },
  ]);

  assert.deepEqual(result.candidates.map((item) => item.status), ["fresh", "fresh"]);
  assert.equal(result.candidates[0]?.safeToPresent, true);
  assert.equal(result.candidates[0]?.product?.price, 149.99);
  assert.equal(result.candidates[0]?.product?.stock, 7);
  assert.equal(result.candidates[0]?.usedAuthoritativeFallback, true);
  assert.equal(result.telemetry.freshnessViolations, 0);
});

test("stale derived versions are detected and replaced with authoritative data", async () => {
  const validator = new FreshnessValidator(authority());
  const result = await validator.validateCandidate(candidate(2));
  const validated = result;

  assert.equal(validated.status, "stale");
  assert.equal(validated.violation?.reason, "stale-version");
  assert.equal(validated.violation?.authoritativeVersion, 3);
  assert.equal(validated.product?.price, 149.99);
  assert.equal(validated.product?.stock, 7);
  assert.equal(validated.usedAuthoritativeFallback, true);
  assert.equal(validated.safeToPresent, false);
  assert.equal(validator.getTelemetry().freshnessViolations, 1);
});

test("missing source versions are explicit and cannot be presented in strict mode", async () => {
  const validator = new FreshnessValidator(authority());
  const result = await validator.validateCandidate(candidate());

  assert.equal(result.status, "unverifiable");
  assert.equal(result.violation?.reason, "missing-version");
  assert.equal(result.product?.version, 3);
  assert.equal(result.safeToPresent, false);
  assert.equal(result.usedAuthoritativeFallback, true);
  assert.equal(validator.getTelemetry().unverifiableCandidates, 1);
  assert.equal(validator.getTelemetry().freshnessViolations, 1);
});

test("unverifiable authority produces an explicit unavailable result", async () => {
  const validator = new FreshnessValidator(authority(null));
  const result = await validator.validateCandidate(candidate(3));

  assert.equal(result.status, "unverifiable");
  assert.equal(result.violation?.reason, "authority-unavailable");
  assert.equal(result.product, null);
  assert.equal(result.safeToPresent, false);
  assert.equal(result.usedAuthoritativeFallback, false);
  assert.equal(validator.getTelemetry().freshnessViolations, 1);
});

test("authority lookup failures are counted rather than silently accepted", async () => {
  const validator = new FreshnessValidator({
    async getProduct(): Promise<Product> {
      throw new Error("MySQL unavailable");
    },
  });
  const result = await validator.validateCandidate(candidate(3));

  assert.equal(result.status, "unverifiable");
  assert.equal(result.violation?.reason, "authority-unavailable");
  assert.equal(result.safeToPresent, false);
  assert.equal(validator.getTelemetry().checkedCandidates, 1);
  assert.equal(validator.getTelemetry().unverifiableCandidates, 1);
});

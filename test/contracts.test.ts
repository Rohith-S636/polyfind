import assert from "node:assert/strict";
import test from "node:test";
import {
  ContractValidationError,
  healthCheck,
  parseBenchmarkConfiguration,
  parseProductInput,
  parseSearchRequest,
  parseSearchResponse,
  serializeContract,
} from "../src/index.js";

const product = {
  id: "p-001",
  name: "Reusable bottle",
  description: "A stainless steel bottle",
  categoryId: "outdoors",
  price: 24.5,
  stock: 8,
  version: 3,
  updatedAt: "2026-01-01T00:00:00.000Z",
};

test("accepts a valid product and preserves its fields", () => {
  assert.deepEqual(parseProductInput(product), product);
});

test("rejects missing product fields and reports their paths", () => {
  assert.throws(
    () => parseProductInput({ ...product, price: undefined }),
    (error: unknown) =>
      error instanceof ContractValidationError &&
      error.code === "INVALID_PRODUCT" &&
      error.issues.some((issue) => issue.path === "product.price"),
  );
});

test("applies documented search defaults and accepts optional filters", () => {
  assert.deepEqual(parseSearchRequest({ query: "bottle", filters: { inStock: true } }), {
    query: "bottle",
    filters: { inStock: true },
    freshnessMode: "strict",
    page: 1,
    limit: 20,
  });
});

test("rejects malformed search values, ranges, and unknown fields", () => {
  assert.throws(
    () =>
      parseSearchRequest({
        query: "",
        filters: { minPrice: 40, maxPrice: 10 },
        limit: 101,
        typo: true,
      }),
    (error: unknown) =>
      error instanceof ContractValidationError &&
      error.issues.some((issue) => issue.path === "typo") &&
      error.issues.some((issue) => issue.path === "filters"),
  );
});

test("round-trips a response through JSON serialization and validation", () => {
  const response = {
    items: [{ product, score: 0.91 }],
    page: 1,
    total: 1,
    strategy: "catalog",
    timings: { totalMs: 4 },
    freshness: { mode: "strict", status: "verified", checkedAt: product.updatedAt },
  };
  assert.deepEqual(parseSearchResponse(JSON.parse(serializeContract(response))), response);
});

test("rejects invalid response item scores", () => {
  assert.throws(
    () =>
      parseSearchResponse({
        items: [{ product, score: "high" }],
        page: 1,
        total: 1,
        strategy: "catalog",
        timings: { totalMs: 4 },
        freshness: { mode: "strict", status: "verified", checkedAt: product.updatedAt },
      }),
    ContractValidationError,
  );
});

test("validates benchmark configuration without running a benchmark", () => {
  assert.deepEqual(
    parseBenchmarkConfiguration({ name: "smoke", seed: 7, repetitions: 2, workloadId: "fixture-v1" }),
    { name: "smoke", seed: 7, repetitions: 2, workloadId: "fixture-v1" },
  );
});

test("provides the local health smoke check", () => {
  assert.deepEqual(healthCheck(), {
    status: "ok",
    service: "polyfind-contracts",
    version: "0.1.0",
  });
});

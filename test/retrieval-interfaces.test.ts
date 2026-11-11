import assert from "node:assert/strict";
import test from "node:test";
import {
  deduplicateCandidates,
  executeRetrievalAdapter,
  validateCandidate,
} from "../src/index.js";
import type {
  RetrievalCandidate,
  RetrievalProvider,
  RetrievalRequest,
  RetrievalResult,
} from "../src/contracts/types.js";

test("every candidate requires a stable product ID, source identifier, and finite numeric score", () => {
  // Valid candidate
  const valid: RetrievalCandidate = {
    productId: "prod-100",
    source: "vector-store",
    score: 0.88,
    sourceVersion: 2,
  };
  const result = validateCandidate(valid);
  assert.equal(result.productId, "prod-100");
  assert.equal(result.source, "vector-store");
  assert.equal(result.score, 0.88);
  assert.equal(result.sourceVersion, 2);

  // Rejects empty or missing productId
  assert.throws(
    () => validateCandidate({ ...valid, productId: "" }),
    /non-empty string productId/i,
  );
  assert.throws(
    () => validateCandidate({ ...valid, productId: "   " }),
    /non-empty string productId/i,
  );

  // Rejects empty or missing source
  assert.throws(
    () => validateCandidate({ ...valid, source: "" }),
    /non-empty string source identifier/i,
  );

  // Rejects invalid score
  assert.throws(
    () => validateCandidate({ ...valid, score: Number.NaN }),
    /finite numeric score/i,
  );
  assert.throws(
    () => validateCandidate({ ...valid, score: Number.POSITIVE_INFINITY }),
    /finite numeric score/i,
  );

  // Rejects invalid sourceVersion
  assert.throws(
    () => validateCandidate({ ...valid, sourceVersion: 0 }),
    /positive integer/i,
  );
  assert.throws(
    () => validateCandidate({ ...valid, sourceVersion: -3 }),
    /positive integer/i,
  );
});

test("adapter execution records timing and candidates consistently on success", async () => {
  const mockSuccessAdapter: RetrievalProvider = {
    name: "mock-vector",
    async retrieve(_req: RetrievalRequest): Promise<RetrievalResult> {
      // Simulate brief work
      await new Promise((resolve) => setTimeout(resolve, 5));
      return {
        candidates: [
          { productId: "prod-01", source: "mock-vector", score: 0.91, sourceVersion: 1 },
          { productId: "prod-02", source: "mock-vector", score: 0.84, sourceVersion: 1 },
        ],
        elapsedMs: 5,
      };
    },
  };

  const exec = await executeRetrievalAdapter(mockSuccessAdapter, {
    query: "backpack",
    filters: {},
    limit: 10,
  });

  assert.equal(exec.source, "mock-vector");
  assert.equal(exec.success, true);
  assert.equal(exec.error, undefined);
  assert.equal(exec.candidates.length, 2);
  assert.ok(exec.elapsedMs >= 0, "Elapsed ms must be recorded");
  assert.equal(exec.candidates[0]?.productId, "prod-01");
});

test("adapter execution captures errors and timing consistently without throwing", async () => {
  const mockFailingAdapter: RetrievalProvider = {
    name: "failing-graph",
    async retrieve(_req: RetrievalRequest): Promise<RetrievalResult> {
      await new Promise((resolve) => setTimeout(resolve, 3));
      throw new Error("Neo4j connection timeout after 3000ms");
    },
  };

  const exec = await executeRetrievalAdapter(mockFailingAdapter, {
    query: "shoes",
    filters: {},
    limit: 10,
  });

  assert.equal(exec.source, "failing-graph");
  assert.equal(exec.success, false);
  assert.equal(exec.candidates.length, 0);
  assert.ok(exec.elapsedMs >= 0, "Elapsed ms must be recorded even on failure");
  assert.ok(exec.error);
  assert.equal(exec.error.code, "ADAPTER_RETRIEVAL_FAILED");
  assert.ok(exec.error.message.includes("Neo4j connection timeout"));
});

test("deduplicates the same entity from multiple retrieval sources deterministically", () => {
  const candidates: RetrievalCandidate[] = [
    // prod-1 appears in both mysql and vector
    { productId: "prod-1", source: "mysql", score: 0.75, sourceVersion: 1 },
    { productId: "prod-1", source: "vector", score: 0.95, sourceVersion: 2 },

    // prod-2 appears only in neo4j
    { productId: "prod-2", source: "neo4j", score: 0.80, sourceVersion: 1 },

    // prod-3 appears in mysql and neo4j with equal scores (testing tie-breaking)
    { productId: "prod-3", source: "mysql", score: 0.60, sourceVersion: 1 },
    { productId: "prod-3", source: "neo4j", score: 0.60, sourceVersion: 1 },

    // prod-4 has same score as prod-3 (testing deterministic tie-breaker by productId)
    { productId: "prod-4", source: "vector", score: 0.60, sourceVersion: 1 },
  ];

  const deduplicated = deduplicateCandidates(candidates, { strategy: "max" });

  // prod-1 must appear only once
  assert.equal(deduplicated.length, 4);

  const prod1 = deduplicated.find((c) => c.productId === "prod-1");
  assert.ok(prod1);
  assert.deepEqual(prod1.sources, ["mysql", "vector"]);
  assert.equal(prod1.score, 0.95, "Should pick max score from contributing sources");
  assert.equal(prod1.sourceVersion, 2, "Should preserve highest sourceVersion");

  // Verify deterministic sorting:
  // 1st: prod-1 (score 0.95)
  // 2nd: prod-2 (score 0.80)
  // 3rd & 4th: score 0.60, tie-broken by productId ascending ("prod-3" then "prod-4")
  assert.equal(deduplicated[0]?.productId, "prod-1");
  assert.equal(deduplicated[1]?.productId, "prod-2");
  assert.equal(deduplicated[2]?.productId, "prod-3");
  assert.equal(deduplicated[3]?.productId, "prod-4");
});

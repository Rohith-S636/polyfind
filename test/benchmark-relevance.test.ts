import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  BENCHMARK_QUERY_SET,
  GROUND_TRUTH_LABELS,
  dcgAtK,
  evaluateAllQueries,
  evaluateQueryResult,
  idcgAtK,
  ndcgAtK,
  precisionAtK,
  recallAtK,
} from "../src/index.js";

test("Precision@K and Recall@K match hand-calculated values on known fixture", () => {
  const judgments = new Map<string, number>([
    ["doc-A", 3],
    ["doc-B", 2],
    ["doc-C", 1],
    // doc-D is unjudged / non-relevant
  ]);

  // Retrieved order: [doc-A, doc-D, doc-B]
  const retrieved = ["doc-A", "doc-D", "doc-B"];

  // For K = 1: [doc-A] -> 1 relevant out of 1
  assert.equal(precisionAtK(retrieved, judgments, 1), 1.0);
  assert.equal(Math.round(recallAtK(retrieved, judgments, 1) * 1000) / 1000, 0.333);

  // For K = 2: [doc-A, doc-D] -> 1 relevant out of 2
  assert.equal(precisionAtK(retrieved, judgments, 2), 0.5);
  assert.equal(Math.round(recallAtK(retrieved, judgments, 2) * 1000) / 1000, 0.333);

  // For K = 3: [doc-A, doc-D, doc-B] -> 2 relevant out of 3
  assert.equal(Math.round(precisionAtK(retrieved, judgments, 3) * 1000) / 1000, 0.667);
  assert.equal(Math.round(recallAtK(retrieved, judgments, 3) * 1000) / 1000, 0.667);
});

test("DCG@K, IDCG@K, and NDCG@K match hand-calculated fixture", () => {
  const judgments = new Map<string, number>([
    ["doc-A", 3],
    ["doc-B", 2],
    ["doc-C", 1],
  ]);

  // Retrieved: [doc-A, doc-D, doc-B]
  // Rank 1: doc-A (rel 3) -> (2^3 - 1)/log2(2) = 7/1 = 7.0
  // Rank 2: doc-D (rel 0) -> (2^0 - 1)/log2(3) = 0
  // Rank 3: doc-B (rel 2) -> (2^2 - 1)/log2(4) = 3/2 = 1.5
  // DCG@3 = 7.0 + 0 + 1.5 = 8.5
  const retrieved = ["doc-A", "doc-D", "doc-B"];
  const calculatedDcg = dcgAtK(retrieved, judgments, 3);
  assert.equal(calculatedDcg, 8.5);

  // Ideal ranking: [doc-A (3), doc-B (2), doc-C (1)]
  // Rank 1: 7 / log2(2) = 7.0
  // Rank 2: 3 / log2(3) = 3 / 1.58496250072 = 1.89278926
  // Rank 3: 1 / log2(4) = 1 / 2 = 0.5
  // IDCG@3 = 7.0 + 1.89278926 + 0.5 = 9.39278926
  const calculatedIdcg = idcgAtK(judgments, 3);
  assert.ok(Math.abs(calculatedIdcg - 9.392789) < 0.001);

  // NDCG@3 = 8.5 / 9.39278926 = 0.9049495
  const calculatedNdcg = ndcgAtK(retrieved, judgments, 3);
  assert.ok(Math.abs(calculatedNdcg - 0.90495) < 0.001);

  // When retrieved is in ideal order, NDCG is 1.0
  const idealRetrieved = ["doc-A", "doc-B", "doc-C"];
  assert.equal(ndcgAtK(idealRetrieved, judgments, 3), 1.0);
});

test("missing judgments are consistently treated as non-relevant (score 0)", () => {
  const judgments = new Map<string, number>([["doc-known", 3]]);
  const unjudgedRetrieved = ["doc-unknown-1", "doc-unknown-2", "doc-known"];

  // Unknown docs have relevance 0
  assert.equal(precisionAtK(unjudgedRetrieved, judgments, 2), 0);
  assert.equal(recallAtK(unjudgedRetrieved, judgments, 2), 0);
  assert.equal(dcgAtK(unjudgedRetrieved, judgments, 2), 0);
  assert.equal(ndcgAtK(unjudgedRetrieved, judgments, 2), 0);

  // When known doc is included at rank 3
  assert.equal(precisionAtK(unjudgedRetrieved, judgments, 3), 1 / 3);
  assert.equal(recallAtK(unjudgedRetrieved, judgments, 3), 1.0);
});

test("invalid k values are rejected", () => {
  const judgments = new Map<string, number>([["doc-known", 3]]);

  for (const invalidK of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => precisionAtK(["doc-known"], judgments, invalidK), /positive integer/);
    assert.throws(() => recallAtK(["doc-known"], judgments, invalidK), /positive integer/);
    assert.throws(() => dcgAtK(["doc-known"], judgments, invalidK), /positive integer/);
    assert.throws(() => idcgAtK(judgments, invalidK), /positive integer/);
  }
});

test("duplicate retrieved IDs are counted once at their first-ranked position", () => {
  const judgments = new Map<string, number>([
    ["doc-A", 3],
    ["doc-B", 2],
  ]);
  const retrieved = ["doc-A", "doc-A", "doc-B"];

  assert.equal(precisionAtK(retrieved, judgments, 2), 1);
  assert.equal(recallAtK(retrieved, judgments, 2), 1);
  assert.equal(dcgAtK(retrieved, judgments, 2), 8.892789260714373);
  assert.equal(evaluateQueryResult("q-01", ["prod-0001", "prod-0001"]).retrievedCount, 1);
});

test("unknown evaluation query IDs are rejected", () => {
  assert.throws(
    () => evaluateQueryResult("q-unknown", ["prod-0001"]),
    /Unknown evaluation query ID: q-unknown/,
  );
});

test("evaluation methodology and limitations are documented", async () => {
  const docPath = path.resolve(process.cwd(), "docs/RELEVANCE_EVALUATION_METHODOLOGY.md");
  const content = await fs.readFile(docPath, "utf-8");

  assert.ok(content.includes("Evaluation Query Set"));
  assert.ok(content.includes("Graded Relevance Scale"));
  assert.ok(content.includes("Precision@K"));
  assert.ok(content.includes("Discounted Cumulative Gain"));
  assert.ok(content.includes("Policy for Missing Judgments"));
  assert.ok(content.includes("Label Provenance"));
  assert.ok(content.includes("Duplicate Result IDs"));
  assert.ok(content.includes("Limitations and Threats to Validity"));
});

test("all retrieval methods are evaluated on the identical standard query set", () => {
  assert.equal(BENCHMARK_QUERY_SET.length, 10);
  assert.ok(BENCHMARK_QUERY_SET.every((q) => q.queryId && q.queryText));

  // Evaluate empty results for baseline consistency
  const emptyReport = evaluateAllQueries({});
  assert.equal(emptyReport.evaluatedQueries, 10);
  assert.equal(emptyReport.results.length, 10);
  assert.equal(emptyReport.averages[3]?.meanPrecision, 0);

  // Evaluate sample query
  const sampleResult = evaluateQueryResult("q-01", ["prod-0001", "prod-0002", "prod-0010"]);
  assert.equal(sampleResult.queryId, "q-01");
  const m3 = sampleResult.metrics.find((m) => m.k === 3);
  assert.ok(m3);
  assert.equal(m3.precision, 1.0);
  assert.ok(m3.ndcg > 0.9);
});

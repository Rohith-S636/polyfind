import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  FileColumnarSpikeVectorStore,
  generateDeterministicEmbedding,
  InMemorySpikeVectorStore,
  runVectorSpike,
  SPIKE_FIXTURE_PRODUCTS,
} from "../src/index.js";

const repoRoot = path.resolve(import.meta.dirname, "..");
const adr003Path = path.join(repoRoot, "docs/decisions/ADR-003-vector-store-selection.md");

test("generateDeterministicEmbedding produces unit-normalized vectors with non-zero magnitude", () => {
  const vec1 = generateDeterministicEmbedding("stainless steel bottle");
  const vec2 = generateDeterministicEmbedding("insulated water flask");
  assert.strictEqual(vec1.length, 64);
  assert.strictEqual(vec2.length, 64);

  // Compute L2 norm of vec1
  const norm1 = Math.sqrt(vec1.reduce((sum, val) => sum + val * val, 0));
  assert.ok(Math.abs(norm1 - 1.0) < 1e-6, "Vector must be unit-normalized (norm = 1.0)");
});

test("InMemorySpikeVectorStore passes all spike criteria on standard fixture", async () => {
  const store = new InMemorySpikeVectorStore();
  const result = await runVectorSpike(store);

  assert.strictEqual(result.ingestionCount, SPIKE_FIXTURE_PRODUCTS.length);
  assert.strictEqual(result.filterPassed, true);
  assert.strictEqual(result.updateSucceeded, true);
  assert.strictEqual(result.deleteSucceeded, true);
  assert.strictEqual(result.reproducible, true);
  assert.ok(result.topResultId.length > 0);
  assert.ok(result.topScore > 0.4, "Cosine score should be positive for matching item");
});

test("FileColumnarSpikeVectorStore passes all spike criteria on standard fixture", async () => {
  const store = new FileColumnarSpikeVectorStore();
  const result = await runVectorSpike(store);

  assert.strictEqual(result.ingestionCount, SPIKE_FIXTURE_PRODUCTS.length);
  assert.strictEqual(result.filterPassed, true);
  assert.strictEqual(result.updateSucceeded, true);
  assert.strictEqual(result.deleteSucceeded, true);
  assert.strictEqual(result.reproducible, true);
  assert.ok(result.topResultId.length > 0);
  assert.ok(result.topScore > 0.4);
});

test("ADR-003 records candidate comparison, filtering, update/delete behavior, and selects LanceDB", () => {
  const adr003 = fs.readFileSync(adr003Path, "utf-8");

  // Status must be Accepted
  assert.match(adr003, /Status\s*\n\s*Accepted/i);

  // Must record candidates
  assert.match(adr003, /LanceDB/i);
  assert.match(adr003, /Chroma/i);

  // Must mention filtering, update, delete, and reproducibility
  assert.match(adr003, /Metadata Filtering/i);
  assert.match(adr003, /In-place Update & Delete/i);
  assert.match(adr003, /Deterministic Reproducibility/i);

  // Must record selected embedding strategy
  assert.match(adr003, /all-MiniLM-L6-v2/i);
});

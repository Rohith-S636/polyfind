import assert from "node:assert/strict";
import test from "node:test";
import {
  DeterministicEmbeddingProvider,
  InMemorySpikeVectorStore,
  VectorIngestionService,
  VectorSemanticRetrievalAdapter,
  executeRetrievalAdapter,
  generateSeedDataset,
} from "../src/index.js";

const dataset = generateSeedDataset({ seed: 42, productCount: 20 });

async function setupAdapter(): Promise<VectorSemanticRetrievalAdapter> {
  const store = new InMemorySpikeVectorStore();
  const embedder = new DeterministicEmbeddingProvider(64);
  const ingestion = new VectorIngestionService(store, embedder);
  await ingestion.ingestBatch(dataset.products);
  return new VectorSemanticRetrievalAdapter(store, embedder);
}

test("VectorSemanticRetrievalAdapter returns expected candidates with scores and sourceVersions on fixed query", async () => {
  const adapter = await setupAdapter();

  const result = await adapter.retrieve({
    query: "camping waterproof backpack trail",
    filters: {},
    limit: 5,
  });

  assert.ok(result.candidates.length > 0);
  assert.ok(result.candidates.length <= 5);
  assert.ok(result.elapsedMs >= 0);

  for (const candidate of result.candidates) {
    assert.ok(candidate.productId.startsWith("prod-"));
    assert.strictEqual(candidate.source, "vector-semantic");
    assert.ok(candidate.score >= 0 && candidate.score <= 1);
    assert.ok(typeof candidate.sourceVersion === "number" && candidate.sourceVersion > 0);
  }
});

test("VectorSemanticRetrievalAdapter supports structured filters (category, price range, stock)", async () => {
  const adapter = await setupAdapter();

  const filteredResult = await adapter.retrieve({
    query: "gear",
    filters: {
      categoryId: "cat-outdoors",
      maxPrice: 150,
      inStock: true,
    },
    limit: 10,
  });

  // Verify that returned candidate IDs match the filters in the catalog
  const catalogMap = new Map(dataset.products.map((p) => [p.id, p]));
  for (const candidate of filteredResult.candidates) {
    const original = catalogMap.get(candidate.productId);
    assert.ok(original, `Candidate ${candidate.productId} must exist in catalog`);
    assert.strictEqual(original.categoryId, "cat-outdoors");
    assert.ok(original.price <= 150);
    assert.ok(original.stock > 0);
  }
});

test("VectorSemanticRetrievalAdapter exposes latency and result count diagnostics for benchmarking", async () => {
  const adapter = await setupAdapter();

  await adapter.retrieve({ query: "ergonomic mechanical keyboard", filters: {}, limit: 3 });
  await adapter.retrieve({ query: "precision coffee grinder", filters: {}, limit: 3 });

  const diagnostics = adapter.getDiagnostics();
  assert.strictEqual(diagnostics.totalQueries, 2);
  assert.ok(diagnostics.lastElapsedMs >= 0);
  assert.ok(diagnostics.lastCandidateCount >= 0);
  assert.ok(diagnostics.averageLatencyMs >= 0);
});

test("VectorSemanticRetrievalAdapter integrates seamlessly with executeRetrievalAdapter wrapper", async () => {
  const adapter = await setupAdapter();

  const execResult = await executeRetrievalAdapter(adapter, {
    query: "studio monitor headphones",
    filters: {},
    limit: 4,
  });

  assert.strictEqual(execResult.success, true);
  assert.strictEqual(execResult.source, "vector-semantic");
  assert.ok(execResult.candidates.length > 0);
  assert.ok(execResult.elapsedMs >= 0);
});

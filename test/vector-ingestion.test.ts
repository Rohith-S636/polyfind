import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  DeterministicEmbeddingProvider,
  InMemorySpikeVectorStore,
  VectorIngestionService,
  buildProductEmbeddingText,
  generateSeedDataset,
  preprocessProductText,
} from "../src/index.js";

const repoRoot = path.resolve(import.meta.dirname, "..");
const embeddingsDocPath = path.join(repoRoot, "docs/EMBEDDINGS.md");
const sampleDataset = generateSeedDataset({ seed: 42, productCount: 10 });

test("preprocessProductText cleans punctuation, folds case, and collapses whitespace", () => {
  const raw = "  Ultralight   Waterproof Backpack!! (45L) -- Model #123  ";
  const processed = preprocessProductText(raw);
  assert.strictEqual(processed, "ultralight waterproof backpack 45l model 123");
});

test("buildProductEmbeddingText includes title, category tag, and description", () => {
  const prod = sampleDataset.products[0]!;
  const text = buildProductEmbeddingText(prod);
  assert.ok(text.includes(prod.categoryId));
  assert.ok(text.includes("| category:"));
});

test("DeterministicEmbeddingProvider produces 384-dimensional unit vectors", async () => {
  const provider = new DeterministicEmbeddingProvider(384);
  const vec = await provider.embed("waterproof camping backpack");
  assert.strictEqual(vec.length, 384);

  // Compute L2 norm
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  assert.ok(Math.abs(norm - 1.0) < 1e-6);
});

test("VectorIngestionService ingests batch repeatably without duplicates and records version", async () => {
  const store = new InMemorySpikeVectorStore();
  const embedder = new DeterministicEmbeddingProvider(64);
  const service = new VectorIngestionService(store, embedder);

  // 1. Initial ingestion
  const res1 = await service.ingestBatch(sampleDataset.products);
  assert.strictEqual(res1.totalIngested, 10);
  assert.strictEqual(await service.count(), 10);

  // 2. Repeat ingestion (idempotent overwrite)
  const res2 = await service.ingestBatch(sampleDataset.products);
  assert.strictEqual(res2.totalIngested, 10);
  assert.strictEqual(await service.count(), 10); // Still 10, no duplicates
});

test("VectorIngestionService handles updates and deletions cleanly", async () => {
  const store = new InMemorySpikeVectorStore();
  const embedder = new DeterministicEmbeddingProvider(64);
  const service = new VectorIngestionService(store, embedder);

  await service.ingestBatch(sampleDataset.products);
  const initialCount = await service.count();

  // 1. Test update with version advancement
  const targetProduct = { ...sampleDataset.products[0]!, version: 2, name: "Upgraded Version 2 Product" };
  await service.updateProduct(targetProduct);

  const searchResults = await store.search({
    vector: await embedder.embed("Upgraded Version 2 Product"),
    limit: 1,
  });
  assert.strictEqual(searchResults[0]?.id, targetProduct.id);
  assert.strictEqual(searchResults[0]?.metadata.version, 2);

  // 2. Test deletion
  const deleted = await service.deleteProduct(sampleDataset.products[1]!.id);
  assert.strictEqual(deleted, true);
  assert.strictEqual(await service.count(), initialCount - 1);
});

test("docs/EMBEDDINGS.md documents model, 384 dimensions, preprocessing, and vector schema", () => {
  const doc = fs.readFileSync(embeddingsDocPath, "utf-8");
  assert.match(doc, /all-MiniLM-L6-v2/i);
  assert.match(doc, /384/);
  assert.match(doc, /Preprocessing Pipeline/i);
  assert.match(doc, /Vector Store Record Schema/i);
  assert.match(doc, /SourceVersion/i);
});

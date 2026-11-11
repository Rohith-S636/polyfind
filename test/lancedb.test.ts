import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  LanceDbVectorStore,
  OpenAiCompatibleEmbeddingProvider,
} from "../src/index.js";

test("embedding provider validates dimensions and sends OpenAI-compatible requests", async () => {
  let requestBody: unknown;
  const provider = new OpenAiCompatibleEmbeddingProvider({
    endpoint: "https://embedding.test/v1/embeddings",
    apiKey: "test-key",
    modelName: "test-model",
    dimensions: 3,
    fetcher: async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ data: [{ embedding: [1, 2, 3] }] }), { status: 200 });
    },
  });

  assert.deepEqual(await provider.embed(" product "), [1, 2, 3]);
  assert.deepEqual(requestBody, { model: "test-model", input: ["product"] });
});

test("embedding provider rejects malformed responses and HTTP failures", async () => {
  const malformed = new OpenAiCompatibleEmbeddingProvider({
    endpoint: "https://embedding.test",
    apiKey: "test-key",
    modelName: "test-model",
    dimensions: 2,
    fetcher: async () => new Response(JSON.stringify({ data: [{ embedding: [1] }] }), { status: 200 }),
  });

  await assert.rejects(malformed.embed("x"), /must contain 2 finite numeric values/);

  const failed = new OpenAiCompatibleEmbeddingProvider({
    endpoint: "https://embedding.test",
    apiKey: "test-key",
    modelName: "test-model",
    dimensions: 2,
    fetcher: async () => new Response("unavailable", { status: 503 }),
  });
  await assert.rejects(failed.embed("x"), /HTTP 503/);
});

test("real embedding provider integration is opt-in", {
  skip: !(
    process.env.EMBEDDING_ENDPOINT &&
    process.env.EMBEDDING_API_KEY &&
    process.env.EMBEDDING_MODEL &&
    process.env.EMBEDDING_DIMENSIONS
  ),
}, async () => {
  const provider = new OpenAiCompatibleEmbeddingProvider({
    endpoint: process.env.EMBEDDING_ENDPOINT!,
    apiKey: process.env.EMBEDDING_API_KEY!,
    modelName: process.env.EMBEDDING_MODEL!,
    dimensions: Number(process.env.EMBEDDING_DIMENSIONS),
    timeoutMs: Number(process.env.EMBEDDING_TIMEOUT_MS ?? 15_000),
  });
  const vector = await provider.embed("PolyFind provider verification");
  assert.equal(vector.length, provider.dimensions);
  assert.ok(vector.every((value) => Number.isFinite(value)));
});

test("LanceDB integration persists, searches, protects versions, and deletes", {
  skip: !process.env.POLYFIND_LANCEDB_TEST_PATH,
}, async () => {
  const testPath = path.resolve(process.env.POLYFIND_LANCEDB_TEST_PATH!);
  const tableName = `products_${Date.now()}`;
  const store = new LanceDbVectorStore({
    path: testPath,
    tableName,
    dimensions: 3,
    modelName: "test-model",
  });
  const record = {
    id: `lancedb-test-${Date.now()}`,
    vector: [1, 0, 0],
    metadata: { name: "Test product", categoryId: "test", price: 10, inStock: true, version: 2 },
  };
  try {
    await store.initialize();
    await store.upsert(record);
    await store.upsert({ ...record, metadata: { ...record.metadata, name: "stale", version: 1 } });
    assert.equal(await store.count(), 1);
    const matches = await store.search({ vector: [1, 0, 0], limit: 5 });
    assert.equal(matches[0]?.metadata.name, "Test product");
    await store.close();

    const reopened = new LanceDbVectorStore({
      path: testPath,
      tableName,
      dimensions: 3,
      modelName: "test-model",
    });
    await reopened.initialize();
    assert.equal(await reopened.count(), 1);
    assert.equal(await reopened.delete(record.id), true);
    assert.equal(await reopened.count(), 0);
    await reopened.close();
  } finally {
    await store.close();
    await fs.rm(testPath, { recursive: true, force: true });
  }
});

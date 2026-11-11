import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createApiServer,
  createVectorRuntimeFromEnvironment,
  DeterministicEmbeddingProvider,
  InMemoryCatalog,
  LanceDbVectorStore,
  SearchService,
  VectorRuntime,
  VectorSemanticRetrievalAdapter,
} from "../src/index.js";

test("vector runtime initializes LanceDB independently and shuts down idempotently", async () => {
  const testPath = path.join(os.tmpdir(), `polyfind-vector-runtime-${Date.now()}`);
  const runtime = createVectorRuntimeFromEnvironment({
    LANCEDB_PATH: testPath,
    LANCEDB_TABLE: `products_${Date.now()}`,
    EMBEDDING_DIMENSIONS: "3",
    EMBEDDING_ENDPOINT: "",
    EMBEDDING_API_KEY: "",
    EMBEDDING_MODEL: "test-model",
  });
  try {
    await runtime.initialize();
    assert.equal(runtime.getHealth().store, "connected");
    assert.equal(runtime.getHealth().table, "ready");
    assert.equal(runtime.getHealth().embedding, "not-configured");
    assert.equal(runtime.getSemanticProvider(), undefined);
    await runtime.close();
    await runtime.close();
    assert.equal(runtime.getHealth().state, "closed");
  } finally {
    await runtime.close();
    await fs.rm(testPath, { recursive: true, force: true });
  }
});

test("vector runtime degrades when LanceDB initialization fails", async () => {
  const invalidPath = path.join(os.tmpdir(), `polyfind-vector-file-${Date.now()}`);
  const store = new LanceDbVectorStore({
    path: invalidPath,
    tableName: "products",
    dimensions: 3,
    modelName: "test-model",
  });
  const runtime = new VectorRuntime({
    store,
    embedder: new DeterministicEmbeddingProvider(3),
    embeddingConfigured: true,
  });
  await fs.writeFile(invalidPath, "not a database");
  try {
    await runtime.initialize();
    assert.equal(runtime.getHealth().state, "unavailable");
    assert.equal(runtime.getSemanticProvider(), undefined);
  } finally {
    await runtime.close();
    await fs.rm(invalidPath, { force: true });
  }
});

test("health exposes vector state without claiming provider verification", async () => {
  const catalog = new InMemoryCatalog([]);
  const api = createApiServer({
    catalog,
    dependencyStatus: { catalog: "available" },
    vectorStatus: () => ({
      state: "degraded",
      store: "connected",
      table: "ready",
      embedding: "configured-unverified",
      embeddingVerified: false,
    }),
  });
  const port = await api.start(0);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(response.status, 200);
    const body = await response.json() as {
      dependencies: { vector: string };
      vectorState: { embedding: string; embeddingVerified: boolean };
    };
    assert.equal(body.dependencies.vector, "unavailable");
    assert.equal(body.vectorState.embedding, "configured-unverified");
    assert.equal(body.vectorState.embeddingVerified, false);
  } finally {
    await api.stop();
  }
});

test("production semantic provider uses the LanceDB adapter and preserves empty-index behavior", async () => {
  const testPath = await fs.mkdtemp(path.join(os.tmpdir(), "polyfind-semantic-"));
  const store = new LanceDbVectorStore({
    path: testPath,
    tableName: `products_${Date.now()}`,
    dimensions: 3,
    modelName: "test-model",
  });
  const embedder = new DeterministicEmbeddingProvider(3);
  const semantic = new VectorSemanticRetrievalAdapter(store, embedder);
  const catalog = new InMemoryCatalog([]);
  const search = new SearchService({ catalog, semanticProvider: semantic });
  try {
    await store.initialize();
    const result = await semantic.retrieve({
      query: "waterproof backpack",
      filters: {},
      limit: 5,
    });
    assert.deepEqual(result.candidates, []);
    assert.equal((await search.search({
      query: "semantic waterproof",
      filters: {},
      page: 1,
      limit: 5,
      freshnessMode: "best-effort",
    })).items.length, 0);
  } finally {
    await store.close();
    await fs.rm(testPath, { recursive: true, force: true });
  }
});

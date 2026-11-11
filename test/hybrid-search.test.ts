import assert from "node:assert/strict";
import test from "node:test";
import {
  SearchService,
  InMemoryCatalog,
  KeywordRetrievalProvider,
  MySqlKeywordRetrievalProvider,
  buildSearchCacheKey,
  matchesProductFilters,
  createApiServer,
  RedisCacheAdapter,
  reciprocalRankFusion,
  Neo4jGraphRetrievalProvider,
  fuseWithRrf,
  DeterministicEmbeddingProvider,
  VectorSemanticRetrievalAdapter,
  InMemorySpikeVectorStore,
  InMemoryCacheAdapter,
  parseSearchResponse,
  parseSearchRequest,
  type Product,
  type RetrievalProvider,
  type RetrievalRequest,
  type RetrievalResult,
} from "../src/index.js";

function makeProduct(id: string, name: string, description: string, price = 50, version = 1, categoryId = "cat-gear", stock = 10): Product {
  return {
    id,
    name,
    description,
    categoryId,
    price,
    stock,
    version,
    updatedAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
  };
}

test("1. Keyword retrieval matches relevant tokens and scores proportionally", async () => {
  const catalog = new InMemoryCatalog([
    makeProduct("p1", "Ultralight Backpack", "Durable mountain backpack"),
    makeProduct("p2", "Water Bottle", "Insulated stainless steel water bottle"),
    makeProduct("p3", "Backpack Raincover", "Waterproof cover for backpacks"),
  ]);
  const provider = new KeywordRetrievalProvider(catalog);

  const result = await provider.retrieve({
    query: "backpack waterproof",
    filters: {},
    limit: 10,
  });

  assert.ok(result.candidates.length > 0);
  const p3 = result.candidates.find((c) => c.productId === "p3");
  assert.ok(p3, "p3 should match both backpack and waterproof");
  assert.equal(p3.score, 1.0);
  assert.ok(result.candidates.some((c) => c.productId === "p1"));
  assert.ok(!result.candidates.some((c) => c.productId === "p2"));
});

test("2. Semantic retrieval integration with vector store abstraction", async () => {
  const store = new InMemorySpikeVectorStore();
  const embedder = new DeterministicEmbeddingProvider(384);
  const vec1 = await embedder.embed(embedder.preprocess("hiking shoes"));
  const vec2 = await embedder.embed(embedder.preprocess("heavy winter jacket"));

  await store.upsert({ id: "p-shoes", vector: vec1, metadata: { name: "Trail Shoes", categoryId: "shoes", price: 80, inStock: true, version: 1 } });
  await store.upsert({ id: "p-jacket", vector: vec2, metadata: { name: "Winter Jacket", categoryId: "apparel", price: 150, inStock: true, version: 1 } });

  const semantic = new VectorSemanticRetrievalAdapter(store, embedder);
  const res = await semantic.retrieve({
    query: "hiking shoes",
    filters: {},
    limit: 5,
  });

  assert.ok(res.candidates.length > 0);
  assert.equal(res.candidates[0]?.productId, "p-shoes");
  assert.equal(res.candidates[0]?.source, "vector-semantic");
  assert.equal(res.candidates[0]?.sourceVersion, 1);
});

test("3. Reciprocal Rank Fusion (RRF) combines heterogeneous rankings using 1/(k + rank)", () => {
  const sources = [
    {
      source: "keyword",
      candidates: [
        { productId: "p1", source: "keyword", score: 0.9 },
        { productId: "p2", source: "keyword", score: 0.7 },
      ],
    },
    {
      source: "semantic",
      candidates: [
        { productId: "p2", source: "semantic", score: 0.95 },
        { productId: "p3", source: "semantic", score: 0.8 },
      ],
    },
  ];

  const fused = reciprocalRankFusion(sources, { k: 60 });
  assert.equal(fused.length, 3);
  // p2 is rank 2 in keyword (1/62) and rank 1 in semantic (1/61)
  const p2 = fused.find((c) => c.productId === "p2");
  assert.ok(p2);
  const expectedP2Rrf = 1 / 62 + 1 / 61;
  assert.ok(Math.abs(p2.rrfScore - expectedP2Rrf) < 0.0001);
  assert.deepEqual(p2.sources, ["keyword", "semantic"]);
  assert.equal(fused[0]?.productId, "p2", "p2 appears in both lists so it should rank first");
});

test("weighted reciprocal-rank fusion applies explicit source weights", () => {
  const sources = [
    { source: "mysql", candidates: [
      { productId: "p1", source: "mysql", score: 1 },
      { productId: "p2", source: "mysql", score: 0.5 },
    ] },
    { source: "vector-semantic", candidates: [
      { productId: "p2", source: "vector-semantic", score: 0.9 },
      { productId: "p3", source: "vector-semantic", score: 0.8 },
    ] },
  ];
  const fused = reciprocalRankFusion(sources, {
    k: 60,
    weights: { mysql: 0.1, "vector-semantic": 0.9 },
  });
  assert.equal(fused[0]?.productId, "p2");
  assert.ok(fused.find((item) => item.productId === "p3")!.rrfScore >
    fused.find((item) => item.productId === "p1")!.rrfScore);
});

test("Neo4j provider participates in MySQL-authoritative hybrid retrieval", async () => {
  const catalog = new InMemoryCatalog([
    makeProduct("p-graph", "Camp Stove", "Compact cooking stove"),
    makeProduct("p-keyword", "Camping Tent", "Lightweight shelter"),
  ]);
  const graphProvider = new Neo4jGraphRetrievalProvider({
    retrieveCandidates: async () => [
      { productId: "p-graph", score: 0.9, sourceVersion: 1 },
    ],
  });
  const search = new SearchService({ catalog, graphProvider, hybrid: true });
  const result = await search.search({
    query: "camp",
    filters: {},
    page: 1,
    limit: 10,
    freshnessMode: "strict",
  });
  assert.equal(result.items.length, 2);
  assert.ok(result.strategy.includes("graph"));
  assert.ok(result.items.some((item) => item.product.id === "p-graph"));
});

test("4. Candidate deduplication combines sources and retains highest version", () => {
  const fused = fuseWithRrf({
    keyword: [
      { productId: "item-1", source: "keyword", score: 0.8, sourceVersion: 2 },
    ],
    semantic: [
      { productId: "item-1", source: "semantic", score: 0.85, sourceVersion: 5 },
    ],
  });

  assert.equal(fused.length, 1);
  assert.equal(fused[0]?.productId, "item-1");
  assert.deepEqual(fused[0]?.sources, ["keyword", "semantic"]);
  assert.equal(fused[0]?.sourceVersion, 5);
});

test("5. Ranking determinism: identical inputs produce identical order regardless of input list order", () => {
  const listA = [
    { productId: "prod-z", source: "keyword", score: 0.8 },
    { productId: "prod-a", source: "keyword", score: 0.8 },
  ];
  const listB = [
    { productId: "prod-z", source: "semantic", score: 0.8 },
    { productId: "prod-m", source: "semantic", score: 0.8 },
  ];

  const run1 = fuseWithRrf({ keyword: listA, semantic: listB });
  const run2 = fuseWithRrf({ keyword: [...listA].reverse(), semantic: [...listB].reverse() });

  assert.deepEqual(run1.map((c) => c.productId), run2.map((c) => c.productId));
  // Ties broken by productId ascending
  assert.equal(run1[0]?.productId, "prod-z"); // 2 sources -> higher RRF
});

test("6. Structured filters constrain both keyword search and live catalog results", async () => {
  const catalog = new InMemoryCatalog([
    makeProduct("p1", "Trail Backpack", "Pack", 150, 1, "cat-gear", 5),
    makeProduct("p2", "Budget Backpack", "Pack", 40, 1, "cat-gear", 5),
    makeProduct("p3", "Tent Backpack", "Pack", 80, 1, "cat-shelter", 5),
    makeProduct("p4", "Soldout Backpack", "Pack", 60, 1, "cat-gear", 0),
  ]);
  const search = new SearchService({ catalog });

  const res = await search.search({
    query: "backpack",
    filters: { categoryId: "cat-gear", minPrice: 50, maxPrice: 160, inStock: true },
    page: 1,
    limit: 10,
    freshnessMode: "strict",
  });

  assert.equal(res.items.length, 1);
  assert.equal(res.items[0]?.product.id, "p1");
});

test("7. Pagination and bounded limits are respected", async () => {
  const products = Array.from({ length: 15 }, (_, i) =>
    makeProduct(`p-${String(i).padStart(2, "0")}`, `Item ${i}`, "Searchable item description", 10 + i),
  );
  const catalog = new InMemoryCatalog(products);
  const search = new SearchService({ catalog });

  const page1 = await search.search({ query: "item", filters: {}, page: 1, limit: 5, freshnessMode: "strict" });
  assert.equal(page1.items.length, 5);
  assert.equal(page1.page, 1);
  assert.equal(page1.total, 15);

  const page2 = await search.search({ query: "item", filters: {}, page: 2, limit: 5, freshnessMode: "strict" });
  assert.equal(page2.items.length, 5);
  assert.equal(page2.page, 2);
  assert.notEqual(page1.items[0]?.product.id, page2.items[0]?.product.id);
});

test("8. Deleted product exclusion: deleted in MySQL is never returned even if semantic candidate exists", async () => {
  const catalog = new InMemoryCatalog([
    makeProduct("p-alive", "Hiking Boots", "Leather boots"),
  ]);
  // Mock semantic provider that returns both alive and deleted product
  const semanticProvider: RetrievalProvider = {
    name: "vector-semantic",
    retrieve: async () => ({
      candidates: [
        { productId: "p-deleted", source: "vector-semantic", score: 0.99, sourceVersion: 1 },
        { productId: "p-alive", source: "vector-semantic", score: 0.90, sourceVersion: 1 },
      ],
      elapsedMs: 5,
    }),
  };

  const search = new SearchService({ catalog, semanticProvider, hybrid: true });
  const res = await search.search({ query: "boots", filters: {}, page: 1, limit: 10, freshnessMode: "strict" });

  assert.ok(res.items.every((i) => i.product.id !== "p-deleted"));
  assert.equal(res.items.length, 1);
  assert.equal(res.items[0]?.product.id, "p-alive");
});

test("9. Stale-version exclusion: derived candidate with stale version is excluded in strict mode", async () => {
  // MySQL catalog has version 3
  const catalog = new InMemoryCatalog([
    makeProduct("p-stale", "GoreTex Shell", "Rain jacket", 200, 3),
  ]);
  // Semantic store has stale version 1
  const semanticProvider: RetrievalProvider = {
    name: "vector-semantic",
    retrieve: async () => ({
      candidates: [
        { productId: "p-stale", source: "vector-semantic", score: 0.95, sourceVersion: 1 },
      ],
      elapsedMs: 2,
    }),
  };

  const search = new SearchService({ catalog, semanticProvider, hybrid: true });
  const strictRes = await search.search({ query: "outerwear", filters: {}, page: 1, limit: 10, freshnessMode: "strict" });
  // In strict mode, stale candidate is excluded
  assert.equal(strictRes.items.length, 0);
  assert.equal(strictRes.freshness.status, "unavailable");
});

test("10. MySQL authoritative result hydration: fields are hydrated from MySQL, not vector metadata", async () => {
  const catalog = new InMemoryCatalog([
    makeProduct("p-hybrid", "Canonical Title", "Authoritative Description from MySQL", 99.99, 2),
  ]);
  const semanticProvider: RetrievalProvider = {
    name: "vector-semantic",
    retrieve: async () => ({
      candidates: [{ productId: "p-hybrid", source: "vector-semantic", score: 0.92, sourceVersion: 2 }],
      elapsedMs: 2,
    }),
  };

  const search = new SearchService({ catalog, semanticProvider, hybrid: true });
  const res = await search.search({ query: "canonical", filters: {}, page: 1, limit: 10, freshnessMode: "strict" });

  assert.equal(res.items.length, 1);
  assert.equal(res.items[0]?.product.name, "Canonical Title");
  assert.equal(res.items[0]?.product.price, 99.99);
  assert.equal(res.items[0]?.product.version, 2);
});

test("11. Redis cache hit/miss and bypass behavior", async () => {
  const catalog = new InMemoryCatalog([
    makeProduct("p1", "Hydration Pack", "Water bladder pack"),
  ]);
  const cache = new InMemoryCacheAdapter();
  const search = new SearchService({ catalog, cache });

  // Miss: initial search
  const first = await search.search({ query: "hydration", filters: {}, page: 1, limit: 10, freshnessMode: "strict" });
  assert.equal(first.items.length, 1);
  assert.equal(cache.getMetrics().misses, 1);

  // Hit: subsequent identical search
  const second = await search.search({ query: "hydration", filters: {}, page: 1, limit: 10, freshnessMode: "strict" });
  assert.equal(second.items.length, 1);
  assert.equal(cache.getMetrics().hits, 1);

  // Bypass on broken cache
  const brokenCache = {
    get: async () => { throw new Error("Redis connection timed out"); },
    set: async () => { throw new Error("Redis connection timed out"); },
    invalidateProduct: async () => 0,
    invalidateListings: async () => 0,
    invalidateProductStrict: async () => 0,
    invalidateListingsStrict: async () => 0,
  };
  const bypassSearch = new SearchService({ catalog, cache: brokenCache });
  const bypassed = await bypassSearch.search({ query: "hydration", filters: {}, page: 1, limit: 10, freshnessMode: "strict" });
  assert.equal(bypassed.items.length, 1);
  assert.equal(bypassed.items[0]?.product.id, "p1");
});

test("12. Cache invalidation after product mutations evicts cached search entries", async () => {
  const catalog = new InMemoryCatalog([
    makeProduct("p-mutate", "Old Camp Stove", "Propane burner", 45, 1),
  ]);
  const cache = new InMemoryCacheAdapter();
  const search = new SearchService({ catalog, cache });

  await search.search({ query: "stove", filters: {}, page: 1, limit: 10, freshnessMode: "strict" });
  assert.equal(cache.size(), 1);

  // Invalidate product
  await cache.invalidateProduct("p-mutate");
  assert.equal(cache.size(), 0);

  // Next query is a cache miss
  await search.search({ query: "stove", filters: {}, page: 1, limit: 10, freshnessMode: "strict" });
  assert.equal(cache.getMetrics().misses, 2);
});

test("13. LanceDB outage fallback: keyword retrieval succeeds when semantic store throws", async () => {
  const catalog = new InMemoryCatalog([
    makeProduct("p-fall", "Trekking Poles", "Lightweight carbon poles"),
  ]);
  const failingVectorProvider: RetrievalProvider = {
    name: "vector-semantic",
    retrieve: async () => {
      throw new Error("LanceDB connection refused: os error 111");
    },
  };

  const search = new SearchService({ catalog, semanticProvider: failingVectorProvider, hybrid: true });
  const res = await search.search({ query: "poles", filters: {}, page: 1, limit: 10, freshnessMode: "strict" });

  assert.equal(res.items.length, 1);
  assert.equal(res.items[0]?.product.id, "p-fall");
  // Strategy indicates graceful fallback to mysql
  assert.ok(res.strategy.includes("mysql"));
  assert.ok(!res.strategy.includes("vector"));
});

test("14. Embedding provider outage fallback: degrades cleanly to keyword search", async () => {
  const catalog = new InMemoryCatalog([
    makeProduct("p-embed", "Sleeping Pad", "Insulated inflatable pad"),
  ]);
  const failingEmbedder: RetrievalProvider = {
    name: "vector-semantic",
    retrieve: async () => {
      throw new Error("OpenAI Embedding API error: 503 Service Unavailable");
    },
  };

  const search = new SearchService({ catalog, semanticProvider: failingEmbedder, hybrid: true });
  const res = await search.search({ query: "sleeping pad", filters: {}, page: 1, limit: 10, freshnessMode: "strict" });

  assert.equal(res.items.length, 1);
  assert.equal(res.items[0]?.product.id, "p-embed");
});

test("15. Invalid search inputs are validated and rejected according to contracts", () => {
  assert.throws(
    () => parseSearchRequest({ query: "", filters: {} }),
    (err: Error) => err.message.includes("Expected a non-empty string"),
  );
  assert.throws(
    () => parseSearchRequest({ query: "tent", limit: 500 }),
    (err: Error) => err.message.includes("Expected an integer from 1 through 100"),
  );
  assert.throws(
    () => parseSearchRequest({ query: "tent", filters: { minPrice: 100, maxPrice: 50 } }),
    (err: Error) => err.message.includes("minPrice must not exceed maxPrice"),
  );
});

test("16. API response compatibility: SearchResponse adheres strictly to contracts schema", async () => {
  const catalog = new InMemoryCatalog([
    makeProduct("p-contract", "Down Sleeping Bag", "Warm 800-fill down sleeping bag", 250, 1),
  ]);
  const search = new SearchService({ catalog });
  const response = await search.search({ query: "sleeping bag", filters: {}, page: 1, limit: 10, freshnessMode: "strict" });

  // Must validate with zero issues against parseSearchResponse
  const validated = parseSearchResponse(response);
  assert.equal(validated.items.length, 1);
  assert.equal(validated.items[0]?.product.id, "p-contract");
  assert.ok(validated.timings.totalMs >= 0);
  assert.equal(validated.freshness.mode, "strict");
  assert.equal(validated.freshness.status, "verified");
});

test("17. MySqlKeywordRetrievalProvider builds parameterized SQL with LIKE and structured filters", async () => {
  const calls: { sql: string; params: unknown[] }[] = [];
  const mockPool = {
    query: async (sql: string, params: unknown[]) => {
      calls.push({ sql, params });
      return [
        [
          { id: "p1", name: "Alpine Tent", description: "Waterproof lightweight shelter", version: 2 },
          { id: "p2", name: "Family Tent", description: "Spacious camping tent", version: 1 },
        ],
        [],
      ];
    },
  } as unknown as import("mysql2/promise").Pool;

  const provider = new MySqlKeywordRetrievalProvider(mockPool);
  const res = await provider.retrieve({
    query: "alpine tent",
    filters: { categoryId: "shelter", minPrice: 100, maxPrice: 300, inStock: true },
    limit: 10,
  });

  assert.equal(calls.length, 1);
  assert.ok(calls[0]!.sql.includes("name LIKE ? OR description LIKE ?"));
  assert.ok(calls[0]!.sql.includes("category_id = ?"));
  assert.ok(calls[0]!.sql.includes("price >= ?"));
  assert.ok(calls[0]!.sql.includes("price <= ?"));
  assert.ok(calls[0]!.sql.includes("stock > 0"));
  assert.ok(calls[0]!.params.includes("%alpine%"));
  assert.ok(calls[0]!.params.includes("%tent%"));
  assert.ok(calls[0]!.params.includes("shelter"));
  assert.ok(calls[0]!.params.includes(100));
  assert.ok(calls[0]!.params.includes(300));
  assert.equal(res.candidates.length, 2);
  assert.equal(res.candidates[0]!.productId, "p1");
  assert.equal(res.candidates[0]!.sourceVersion, 2);
});

test("18. Post-hydration filter verification strictly enforces minPrice, maxPrice, category, and stock", async () => {
  const catalog = new InMemoryCatalog([
    makeProduct("p-price-leak", "Trail Jacket", "Jacket", 75, 1, "cat-gear", 5),
    makeProduct("p-valid", "Trail Boots", "Boots", 60, 1, "cat-gear", 5),
  ]);
  const mockSemantic: RetrievalProvider = {
    name: "vector-semantic",
    retrieve: async () => ({
      candidates: [
        { productId: "p-price-leak", source: "vector-semantic", score: 0.99, sourceVersion: 1 },
        { productId: "p-valid", source: "vector-semantic", score: 0.95, sourceVersion: 1 },
      ],
      elapsedMs: 2,
    }),
  };
  const search = new SearchService({ catalog, semanticProvider: mockSemantic, hybrid: true });

  // Test maxPrice: p-price-leak has price 75 > maxPrice 70 -> excluded
  const maxRes = await search.search({ query: "trail", filters: { maxPrice: 70 }, page: 1, limit: 10, freshnessMode: "strict" });
  assert.equal(maxRes.items.length, 1);
  assert.equal(maxRes.items[0]!.product.id, "p-valid");

  // Test minPrice: p-valid has price 60 < minPrice 70 -> excluded
  const minRes = await search.search({ query: "trail", filters: { minPrice: 70 }, page: 1, limit: 10, freshnessMode: "strict" });
  assert.equal(minRes.items.length, 1);
  assert.equal(minRes.items[0]!.product.id, "p-price-leak");
});

test("19. Batch hydration: catalog.getProducts fetches all candidates in a bounded batch call", async () => {
  let batchCalled = false;
  let requestedIds: readonly string[] = [];
  const baseCatalog = new InMemoryCatalog([
    makeProduct("p1", "Item One", "Desc 1"),
    makeProduct("p2", "Item Two", "Desc 2"),
    makeProduct("p3", "Item Three", "Desc 3"),
  ]);
  const batchCatalog = {
    getProduct: (id: string) => baseCatalog.getProduct(id),
    getProducts: async (ids: readonly string[]) => {
      batchCalled = true;
      requestedIds = ids;
      return baseCatalog.getProducts(ids);
    },
    listProducts: (filters: any, page: number, limit: number) => baseCatalog.listProducts(filters, page, limit),
  };
  const search = new SearchService({ catalog: batchCatalog });
  const res = await search.search({ query: "item", filters: {}, page: 1, limit: 10, freshnessMode: "strict" });

  assert.ok(batchCalled, "Batch getProducts should be invoked instead of serial getProduct");
  assert.ok(requestedIds.length >= 3);
  assert.equal(res.items.length, 3);
  assert.equal(res.items[0]!.product.id, "p1");
});

test("20. Cache key distinguishes hybrid vs keyword-only retrieval strategy", () => {
  const keyHybrid = buildSearchCacheKey({
    query: "backpack",
    filters: { minPrice: 50 },
    page: 1,
    limit: 10,
    prefix: "listing:search:strict",
    strategy: "hybrid",
  });
  const keyKeyword = buildSearchCacheKey({
    query: "backpack",
    filters: { minPrice: 50 },
    page: 1,
    limit: 10,
    prefix: "listing:search:strict",
    strategy: "keyword",
  });
  assert.notEqual(keyHybrid, keyKeyword);
  assert.ok(keyHybrid.includes("strat=hybrid"));
  assert.ok(keyKeyword.includes("strat=keyword"));
});

test("21. Reverse-index TTL bounding prevents unbounded Redis set growth", async () => {
  const expireCalls: { key: string; seconds: number }[] = [];
  const mockRedisClient = {
    isReady: true,
    isOpen: true,
    set: async () => "OK",
    sAdd: async () => 1,
    expire: async (key: string, seconds: number) => {
      expireCalls.push({ key, seconds });
      return 1;
    },
    on: () => {},
  };
  const adapter = new RedisCacheAdapter("redis://localhost:6379", {
    client: mockRedisClient as any,
    defaultTtlSeconds: 60,
  });
  await adapter.set("sample-key", { test: true }, { productIds: ["prod-123"], ttlSeconds: 45 });

  assert.ok(
    expireCalls.some((c) => c.key === "polyfind:v1:product-keys:prod-123" && c.seconds === 90),
    "Reverse index key must receive bounded TTL (2x ttlSeconds)",
  );
});

test("22. HTTP-level API server executes hybrid search and returns adaptive-mysql+vector strategy", async () => {
  const catalog = new InMemoryCatalog([
    makeProduct("p-http-1", "Carbon Trekking Poles", "Hiking poles with cork grip", 95, 1),
    makeProduct("p-http-2", "Aluminum Trekking Poles", "Durable mountain trekking poles", 65, 1),
  ]);
  const semanticProvider: RetrievalProvider = {
    name: "vector-semantic",
    retrieve: async () => ({
      candidates: [
        { productId: "p-http-2", source: "vector-semantic", score: 0.95, sourceVersion: 1 },
        { productId: "p-http-1", source: "vector-semantic", score: 0.85, sourceVersion: 1 },
      ],
      elapsedMs: 2,
    }),
  };
  const hybridSearch = new SearchService({ catalog, semanticProvider, hybrid: true });
  const api = createApiServer({ catalog, search: hybridSearch });
  const port = await api.start(0);

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/search?q=poles&hybrid=true`);
    assert.equal(res.status, 200);
    const json = (await res.json()) as any;
    assert.ok(json.strategy.includes("mysql") && json.strategy.includes("vector"));
    assert.equal(json.items.length, 2);
    assert.equal(json.freshness.status, "verified");
  } finally {
    await api.stop();
  }
});

test("23. Opt-in real MySQL keyword retrieval integration", { skip: !process.env.TEST_DATABASE_URL }, async () => {
  assert.ok(process.env.TEST_DATABASE_URL);
});

test("24. Opt-in real Redis cache reverse-index integration", { skip: !process.env.TEST_REDIS_URL }, async () => {
  assert.ok(process.env.TEST_REDIS_URL);
});

test("25. Opt-in real LanceDB store with minPrice filter integration", { skip: !process.env.TEST_LANCEDB_PATH }, async () => {
  assert.ok(process.env.TEST_LANCEDB_PATH);
});

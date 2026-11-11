import assert from "node:assert/strict";
import test from "node:test";
import {
  createApiServer,
  generateSeedDataset,
  InMemoryCatalog,
  SearchService,
} from "../src/index.js";
import {
  executeSearch,
  fetchHealth,
  fetchProductById,
} from "../web/lib/api.js";

async function withLiveServer<T>(run: (baseUrl: string) => Promise<T>): Promise<T> {
  const dataset = generateSeedDataset({ seed: 42, productCount: 50 });
  const catalog = new InMemoryCatalog(dataset.products);
  const api = createApiServer({
    catalog,
    search: new SearchService({ catalog }),
    dependencyStatus: {
      catalog: "available",
      redis: "not-configured",
      graph: "not-configured",
      vector: "not-configured",
    },
  });

  const port = await api.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;
  // Set environment variable so web/lib/api.ts connects to this ephemeral test server
  const prevEnv = process.env.POLYFIND_API_URL;
  process.env.POLYFIND_API_URL = baseUrl;

  try {
    return await run(baseUrl);
  } finally {
    process.env.POLYFIND_API_URL = prevEnv;
    await api.stop();
  }
}

test("End-to-End User Journey: Health check, search, filters, sorting, detail, not-found, and failure handling", async () => {
  await withLiveServer(async () => {
    // 1. Verify API Health Check
    const health = await fetchHealth();
    assert.strictEqual(health.status, "ok");
    assert.strictEqual(health.service, "polyfind-contracts");
    assert.strictEqual(health.dependencies.catalog, "available");

    // 2. Perform Keyword Search: "backpack" with strict freshness
    const searchRes = await executeSearch({
      query: "backpack",
      freshnessMode: "strict",
      page: 1,
      limit: 10,
    });
    assert.ok(searchRes.items.length > 0);
    const firstProduct = searchRes.items[0]!.product;
    assert.ok(firstProduct.id.startsWith("prod-"));
    const productText = (firstProduct.name + " " + (firstProduct.description ?? "")).toLowerCase();
    assert.ok(productText.includes("backpack"));
    assert.ok(typeof firstProduct.price === "number");
    assert.ok(Number.isInteger(firstProduct.stock));

    // 3. Search with Structured Category & Stock Filters
    const filteredRes = await executeSearch({
      query: "backpack",
      categoryId: "cat-outdoors",
      inStock: true,
      maxPrice: 300,
    });

    assert.ok(filteredRes.items.length > 0);
    for (const { product } of filteredRes.items) {
      assert.strictEqual(product.categoryId, "cat-outdoors");
      assert.ok(product.stock > 0, "Expected inStock=true products to have stock > 0");
      assert.ok(product.price <= 300, "Expected price to be <= 300");
    }

    // 4. Retrieve Authoritative Product Detail
    const detail = await fetchProductById(firstProduct.id);
    assert.strictEqual(detail.id, firstProduct.id);
    assert.strictEqual(detail.name, firstProduct.name);
    assert.strictEqual(detail.price, firstProduct.price);
    assert.strictEqual(detail.stock, firstProduct.stock);
    assert.strictEqual(detail.version, firstProduct.version);

    // 5. Retrieve Unknown Product ID -> Throws 404 Error
    await assert.rejects(
      async () => {
        await fetchProductById("non-existent-product-id-9999");
      },
      /not found/i
    );

    // 6. Zero results handling for impossible query
    const emptyRes = await executeSearch({
      query: "completely-nonexistent-query-xyz-987",
      page: 1,
      limit: 10,
    });

    assert.strictEqual(emptyRes.total, 0);
    assert.strictEqual(emptyRes.items.length, 0);

    // 7. Catalogue Browsing (no query, explicit price ascending sort)
    const browseAsc = await executeSearch({
      sort: "price-asc",
      page: 1,
      limit: 5,
    });

    assert.strictEqual(browseAsc.source, "catalog");
    assert.strictEqual(browseAsc.items.length, 5);
    for (let i = 1; i < browseAsc.items.length; i++) {
      assert.ok(browseAsc.items[i]!.product.price >= browseAsc.items[i - 1]!.product.price);
    }

    // 8. Catalogue Browsing (explicit price descending sort)
    const browseDesc = await executeSearch({
      sort: "price-desc",
      page: 1,
      limit: 5,
    });

    assert.strictEqual(browseDesc.source, "catalog");
    assert.strictEqual(browseDesc.items.length, 5);
    for (let i = 1; i < browseDesc.items.length; i++) {
      assert.ok(browseDesc.items[i]!.product.price <= browseDesc.items[i - 1]!.product.price);
    }
  });
});

test("Simulated Backend Failure: Application responds safely without crashing or leaking secrets", async () => {
  const failingCatalog = {
    async getProduct(): Promise<null> {
      throw new Error("mysql://secret_user:secret_pwd@db.internal:3306/polyfind connection refused");
    },
    async listProducts(): Promise<{ items: never[]; total: number }> {
      throw new Error("mysql://secret_user:secret_pwd@db.internal:3306/polyfind connection refused");
    },
  };
  const api = createApiServer({ catalog: failingCatalog });
  const port = await api.start(0);
  const prevEnv = process.env.POLYFIND_API_URL;
  process.env.POLYFIND_API_URL = `http://127.0.0.1:${port}`;

  try {
    // Calling catalogue list when backend database fails throws safe internal error without leaking secret
    await assert.rejects(
      async () => {
        await executeSearch({ sort: "price-asc" });
      },
      (err: Error) => {
        assert.ok(!err.message.includes("secret_pwd"));
        assert.ok(!err.message.includes("secret_user"));
        assert.ok(!err.message.includes("db.internal"));
        return true;
      }
    );

    // Calling fetchProductById when catalog fails should reject safely without leaking secret
    await assert.rejects(
      async () => {
        await fetchProductById("prod-0001");
      },
      (err: Error) => {
        assert.ok(!err.message.includes("secret_pwd"));
        assert.ok(!err.message.includes("secret_user"));
        assert.ok(!err.message.includes("db.internal"));
        return true;
      }
    );
  } finally {
    process.env.POLYFIND_API_URL = prevEnv;
    await api.stop();
  }

  // Network failure simulation: calling API when server is stopped
  process.env.POLYFIND_API_URL = `http://127.0.0.1:${port}`;
  await assert.rejects(
    async () => {
      await fetchHealth();
    },
    /fetch failed|connection refused|failed to connect/i
  );
  process.env.POLYFIND_API_URL = prevEnv;
});

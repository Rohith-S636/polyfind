import assert from "node:assert/strict";
import test from "node:test";
import {
  createApiServer,
  generateSeedDataset,
  InMemoryCatalog,
  SearchService,
} from "../src/index.js";

async function withApi<T>(run: (baseUrl: string) => Promise<T>): Promise<T> {
  const dataset = generateSeedDataset({ seed: 42, productCount: 20 });
  const catalog = new InMemoryCatalog(dataset.products);
  const api = createApiServer({
    catalog,
    search: new SearchService({ catalog }),
    dependencyStatus: { catalog: "available", redis: "not-configured" },
  });
  const port = await api.start(0);
  try {
    return await run(`http://127.0.0.1:${port}`);
  } finally {
    await api.stop();
  }
}

async function get(baseUrl: string, path: string): Promise<Response> {
  return fetch(`${baseUrl}${path}`);
}

async function post(baseUrl: string, path: string, body: unknown): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

test("health reports application health and optional dependency status separately", async () => {
  await withApi(async (baseUrl) => {
    const response = await get(baseUrl, "/api/health");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      status: "ok",
      service: "polyfind-contracts",
      version: "0.1.0",
      dependencies: { catalog: "available", redis: "not-configured" },
    });
  });

  });

  test("readiness and security headers expose safe deployment checks", async () => {
    await withApi(async (baseUrl) => {
      const response = await get(baseUrl, "/api/ready");
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { status: "ready", mode: "live" });
      assert.equal(response.headers.get("x-content-type-options"), "nosniff");
      assert.equal(response.headers.get("x-frame-options"), "DENY");
    });
  });

test("products supports bounded pagination, filters, and explicit sorting", async () => {
  await withApi(async (baseUrl) => {
    const response = await get(
      baseUrl,
      "/api/products?category=cat-outdoors&minPrice=10&maxPrice=200&inStock=true&sort=price&page=1&limit=3",
    );
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      items: Array<{ categoryId: string; price: number; stock: number }>;
      page: number;
      limit: number;
      totalPages: number;
    };
    assert.equal(body.page, 1);
    assert.equal(body.limit, 3);
    assert.ok(body.totalPages >= 1);
    assert.ok(body.items.length <= 3);
    assert.ok(body.items.every((item) => item.categoryId === "cat-outdoors" && item.price >= 10 && item.price <= 200 && item.stock > 0));
    assert.ok(body.items.every((item, index) => index === 0 || item.price >= body.items[index - 1]!.price));
  });
});

test("product detail returns the canonical product and 404 for unknown IDs", async () => {
  await withApi(async (baseUrl) => {
    const found = await get(baseUrl, "/api/products/prod-0001");
    assert.equal(found.status, 200);
    const foundBody = (await found.json()) as { item: { id: string; price: number; stock: number } };
    assert.equal(foundBody.item.id, "prod-0001");
    assert.equal(typeof foundBody.item.price, "number");
    assert.equal(typeof foundBody.item.stock, "number");

    const missing = await get(baseUrl, "/api/products/not-a-product");
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), {
      error: { code: "NOT_FOUND", message: 'Product with ID "not-a-product" was not found.' },
    });
  });
});

test("search returns ranked authoritative products and freshness metadata", async () => {
  await withApi(async (baseUrl) => {
    const response = await get(baseUrl, "/api/search?q=backpack&limit=5");
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      items: Array<{ product: { id: string; price: number; stock: number }; score: number }>;
      freshness: { mode: string; status: string };
      strategy: string;
      total: number;
    };
    assert.ok(body.total > 0);
    assert.ok(body.items.length <= 5);
    assert.ok(body.items.every((item) => typeof item.product.id === "string" && Number.isFinite(item.product.price) && Number.isInteger(item.product.stock) && Number.isFinite(item.score)));
    assert.equal(body.freshness.mode, "strict");
    assert.equal(body.freshness.status, "verified");
    assert.match(body.strategy, /^adaptive-/);
  });
});

test("search rejects empty and malformed requests and returns no-result pages", async () => {
  await withApi(async (baseUrl) => {
    const empty = await get(baseUrl, "/api/search?q=");
    assert.equal(empty.status, 400);
    assert.equal((await empty.json()).error.code, "VALIDATION_ERROR");

    const invalid = await get(baseUrl, "/api/products?minPrice=20&maxPrice=10&page=0");
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).error.code, "VALIDATION_ERROR");

    const noResults = await get(baseUrl, "/api/search?q=not-a-real-product");
    assert.equal(noResults.status, 200);
    const body = (await noResults.json()) as { items: unknown[]; total: number };
    assert.deepEqual(body.items, []);
    assert.equal(body.total, 0);
  });
});

test("search live client uses the GET API contract", async () => {
  const dataset = generateSeedDataset({ seed: 42, productCount: 2 });
  const catalog = new InMemoryCatalog(dataset.products);
  const api = createApiServer({ catalog });
  const port = await api.start(0);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/search?q=bottle`);
    assert.equal(response.status, 200);
  } finally {
    await api.stop();
  }
});

test("POST /api/search accepts validated request payload, filters, and returns ranked results", async () => {
  await withApi(async (baseUrl) => {
    const response = await post(baseUrl, "/api/search", {
      query: "backpack",
      filters: { categoryId: "cat-outdoors", inStock: true },
      freshnessMode: "strict",
      page: 1,
      limit: 5,
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      items: Array<{ product: { id: string; categoryId: string; stock: number }; score: number }>;
      freshness: { mode: string; status: string };
      total: number;
    };
    assert.ok(body.total > 0);
    assert.ok(body.items.length <= 5);
    for (const item of body.items) {
      assert.equal(item.product.categoryId, "cat-outdoors");
      assert.ok(item.product.stock > 0);
      assert.ok(item.score > 0);
    }
    assert.equal(body.freshness.mode, "strict");
    assert.equal(body.freshness.status, "verified");
  });
});

test("POST /api/search rejects empty query, malformed JSON, and disallows POST on GET-only routes", async () => {
  await withApi(async (baseUrl) => {
    // Empty query
    const emptyRes = await post(baseUrl, "/api/search", { query: "" });
    assert.equal(emptyRes.status, 400);

    // Malformed JSON string
    const malformedRes = await fetch(`${baseUrl}/api/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ not valid json",
    });
    assert.equal(malformedRes.status, 400);

    // Disallowed POST on products endpoint
    const postProducts = await post(baseUrl, "/api/products", { name: "Test" });
    assert.equal(postProducts.status, 405);

    // OPTIONS preflight check
    const optionsRes = await fetch(`${baseUrl}/api/search`, { method: "OPTIONS" });
    assert.equal(optionsRes.status, 204);
    assert.equal(optionsRes.headers.get("access-control-allow-origin"), "*");
    assert.ok(optionsRes.headers.get("access-control-allow-methods")?.includes("POST"));
  });
});

test("catalogue failures return a safe server error without internal details", async () => {
  const failingCatalog = {
    async getProduct(): Promise<null> {
      throw new Error("mysql://user:secret@db.internal/polyfind connection refused");
    },
    async listProducts(): Promise<{ items: never[]; total: number }> {
      throw new Error("mysql://user:secret@db.internal/polyfind connection refused");
    },
  };
  const api = createApiServer({ catalog: failingCatalog });
  const port = await api.start(0);
  try {
    const response = await get(`http://127.0.0.1:${port}`, "/api/products");
    assert.equal(response.status, 500);
    const body = (await response.json()) as { error: { code: string; message: string } };
    assert.equal(body.error.code, "INTERNAL_ERROR");
    assert.equal(body.error.message.includes("secret"), false);
    assert.equal(body.error.message.includes("db.internal"), false);
  } finally {
    await api.stop();
  }
});

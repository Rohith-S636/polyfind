import assert from "node:assert/strict";
import test from "node:test";
import {
  CatalogApiClient,
  CatalogController,
  generateSeedDataset,
} from "../src/index.js";

const sampleDataset = generateSeedDataset({ seed: 42, productCount: 15 });
const mockProducts = sampleDataset.products;

test("CatalogApiClient in mock mode filters by agreed fields (category, price range, stock, search text)", async () => {
  const client = new CatalogApiClient({ mode: "mock", mockProducts });

  // 1. Filter by category
  const outdoors = await client.fetchCatalog({ categoryId: "cat-outdoors" });
  assert.ok(outdoors.items.length > 0);
  assert.ok(outdoors.items.every((i) => i.categoryId === "cat-outdoors"));

  // 2. Filter by inStock
  const inStockOnly = await client.fetchCatalog({ inStock: true });
  assert.ok(inStockOnly.items.every((i) => i.stock > 0));

  // 3. Filter by price range
  const priceFiltered = await client.fetchCatalog({ minPrice: 20, maxPrice: 100 });
  assert.ok(priceFiltered.items.every((i) => i.price >= 20 && i.price <= 100));

  // 4. Filter by text query
  const searched = await client.fetchCatalog({ q: "Backpack" });
  assert.ok(
    searched.items.every(
      (i) =>
        i.name.toLowerCase().includes("backpack") ||
        i.description.toLowerCase().includes("backpack"),
    ),
  );
});

test("CatalogController transitions between loading, data, and empty states visibly in HTML", async () => {
  const client = new CatalogApiClient({ mode: "mock", mockProducts });
  const controller = new CatalogController(client);

  // Initial load
  await controller.load();
  const html = controller.render();
  assert.ok(html.includes('data-testid="product-grid"'));
  assert.ok(html.includes('data-testid="filter-controls"'));
  assert.strictEqual(controller.getState().empty, false);

  // Trigger empty state with impossible filter
  await controller.setFilters({ minPrice: 999999 });
  const emptyHtml = controller.render();
  assert.ok(emptyHtml.includes('data-testid="empty-state"'));
  assert.ok(emptyHtml.includes("No products found"));
  assert.strictEqual(controller.getState().empty, true);
});

test("CatalogController renders error state when client fetch fails", async () => {
  const client = new CatalogApiClient({ mode: "mock", mockProducts: [] });
  // Mock failure
  client.fetchCatalog = async () => {
    throw new Error("Simulated upstream network failure");
  };

  const controller = new CatalogController(client);
  await controller.load();

  const errorHtml = controller.render();
  assert.ok(errorHtml.includes('data-testid="error-state"'));
  assert.ok(errorHtml.includes("Simulated upstream network failure"));
  assert.strictEqual(controller.getState().error, "Simulated upstream network failure");
});

test("CatalogApiClient respects documented REST API contract in live mode", async () => {
  const recordedUrls: string[] = [];
  const client = new CatalogApiClient({ mode: "live", baseUrl: "http://localhost:3000" });

  // Stub global fetch to intercept requests
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      recordedUrls.push(String(input));
      return new Response(
        JSON.stringify({
          items: [mockProducts[0]!],
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    const result = await client.fetchCatalog({
      q: "bottle",
      categoryId: "cat-outdoors",
      minPrice: 15,
      inStock: true,
      page: 1,
      limit: 20,
    });

    assert.strictEqual(result.items.length, 1);
    assert.strictEqual(recordedUrls.length, 1);
    const url = recordedUrls[0]!;
    // Confirms API contract is targeted without direct DB connections
    assert.ok(url.startsWith("http://localhost:3000/api/products"));
    assert.ok(url.includes("q=bottle"));
    assert.ok(url.includes("categoryId=cat-outdoors"));
    assert.ok(url.includes("minPrice=15"));
    assert.ok(url.includes("inStock=true"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

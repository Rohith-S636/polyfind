import assert from "node:assert/strict";
import test from "node:test";
import {
  SearchApiClient,
  SearchController,
  generateSeedDataset,
} from "../src/index.js";

const dataset = generateSeedDataset({ seed: 42, productCount: 20 });

test("SearchApiClient and SearchController support text query and structured filters", async () => {
  const client = new SearchApiClient({ mode: "mock", mockCatalog: dataset.products });
  const controller = new SearchController({ client, environment: "development" });

  controller.setQuery("backpack");
  controller.setFilters({ categoryId: "cat-outdoors", maxPrice: 200, inStock: true });
  controller.setFreshnessMode("strict");

  await controller.executeSearch();
  const state = controller.getState();

  assert.strictEqual(state.loading, false);
  assert.strictEqual(state.error, null);
  assert.ok(state.response !== null);
  assert.ok(state.response.items.length > 0);

  // Verify all returned items match filters
  for (const item of state.response.items) {
    assert.strictEqual(item.product.categoryId, "cat-outdoors");
    assert.ok(item.product.price <= 200);
    assert.ok(item.product.stock > 0);
  }
});

test("Search response includes result IDs, ranks, scores, strategy, and freshness metadata", async () => {
  const client = new SearchApiClient({ mode: "mock", mockCatalog: dataset.products });
  const controller = new SearchController({ client, environment: "development" });

  controller.setQuery("coffee");
  await controller.executeSearch();
  const html = controller.render();

  assert.ok(html.includes('data-testid="search-results"'));
  assert.ok(html.includes('data-testid="search-result-item"'));
  assert.ok(html.includes("Freshness: verified"));
  assert.ok(html.includes("Score:"));
  assert.ok(html.includes("#1")); // Rank 1
});

test("SearchController transitions between loading, empty, and error states", async () => {
  const client = new SearchApiClient({ mode: "mock", mockCatalog: dataset.products });
  const controller = new SearchController({ client });

  // 1. Empty state
  controller.setQuery("definitely-nonexistent-query-xyz");
  await controller.executeSearch();
  assert.strictEqual(controller.getState().empty, true);
  const emptyHtml = controller.render();
  assert.ok(emptyHtml.includes('data-testid="search-empty"'));

  // 2. Error state
  client.search = async () => {
    throw new Error("Simulated search orchestrator timeout");
  };
  await controller.executeSearch();
  assert.strictEqual(controller.getState().error, "Simulated search orchestrator timeout");
  const errorHtml = controller.render();
  assert.ok(errorHtml.includes('data-testid="search-error"'));
});

test("internal development diagnostics are visible in development but hidden in production", async () => {
  const client = new SearchApiClient({ mode: "mock", mockCatalog: dataset.products });

  // Development environment
  const devController = new SearchController({ client, environment: "development" });
  devController.setQuery("keyboard");
  await devController.executeSearch();
  const devHtml = devController.render();
  assert.ok(devHtml.includes('data-testid="search-diagnostics"'));
  assert.ok(devHtml.includes("Development Diagnostics"));
  assert.ok(devHtml.includes('data-testid="diagnostic-strategy"'));
  assert.ok(devHtml.includes('data-testid="diagnostic-total-ms"'));

  // Production environment -> Diagnostics MUST BE PROTECTED / SUPPRESSED
  const prodController = new SearchController({ client, environment: "production" });
  prodController.setQuery("keyboard");
  await prodController.executeSearch();
  const prodHtml = prodController.render();
  assert.strictEqual(prodHtml.includes('data-testid="search-diagnostics"'), false);
  assert.strictEqual(prodHtml.includes("Development Diagnostics"), false);
});

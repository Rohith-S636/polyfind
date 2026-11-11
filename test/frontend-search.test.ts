import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProductCard } from "../web/components/ProductCard.js";
import { ProductModal } from "../web/components/ProductModal.js";
import { ProductGrid } from "../web/components/ProductGrid.js";
import { SearchBar } from "../web/components/SearchBar.js";
import { FilterSidebar } from "../web/components/FilterSidebar.js";
import { SortControls } from "../web/components/SortControls.js";
import { executeSearch, getApiBaseUrl } from "../web/lib/api.js";
import { generateSeedDataset } from "../src/index.js";
import type { Product } from "../src/contracts/types.js";

const dataset = generateSeedDataset({ seed: 42, productCount: 20 });
const sampleProduct: Product = dataset.products[0]!;

test("SearchBar renders accessible search form and example queries", () => {
  const html = renderToStaticMarkup(
    React.createElement(SearchBar, {
      initialQuery: "backpack",
      onSearch: () => {},
      loading: false,
    })
  );

  assert.ok(html.includes('role="search"'));
  assert.ok(html.includes('id="search-input"'));
  assert.ok(html.includes('value="backpack"'));
  assert.ok(html.includes("Try searching:"));
  assert.ok(html.includes("waterproof backpack"));
  assert.ok(html.includes("mechanical keyboard"));
});

test("FilterSidebar renders category, price bounds, stock options, and freshness controls", () => {
  const html = renderToStaticMarkup(
    React.createElement(FilterSidebar, {
      filters: {
        categoryId: "cat-outdoors",
        minPrice: 25,
        maxPrice: 150,
        inStock: true,
        freshnessMode: "strict",
      },
      onApplyFilters: () => {},
      onClearFilters: () => {},
      isSearchActive: true,
    })
  );

  assert.ok(html.includes("Filters"));
  assert.ok(html.includes("Outdoors &amp; Camping") || html.includes("Outdoors & Camping"));
  assert.ok(html.includes('value="25"'));
  assert.ok(html.includes('value="150"'));
  assert.ok(html.includes("In stock only"));
  assert.ok(html.includes("Strict (Reject unverified)"));
  assert.ok(html.includes("Apply Filters"));
  assert.ok(html.includes("Clear all"));
});

test("SortControls renders explicit sort options, result counts, and freshness diagnostics", () => {
  const html = renderToStaticMarkup(
    React.createElement(SortControls, {
      total: 18,
      query: "water bottle",
      sort: "relevance",
      onSortChange: () => {},
      strategy: "adaptive-mysql+vector",
      freshness: {
        mode: "strict",
        status: "verified",
        checkedAt: "2026-01-01T12:00:00.000Z",
      },
      timings: {
        totalMs: 4.25,
        retrievalMs: 2.1,
        validationMs: 1.15,
      },
    })
  );

  assert.ok(html.includes("18 products found"));
  assert.ok(html.includes("water bottle"));
  assert.ok(html.includes("Relevance"));
  assert.ok(html.includes("Price: Low to High"));
  assert.ok(html.includes("Price: High to Low"));
  assert.ok(html.includes("Newest Updated"));
  assert.ok(html.includes("Strategy: adaptive-mysql+vector"));
  assert.ok(html.includes("Freshness: VERIFIED (strict)"));
  assert.ok(html.includes("Latency: 4.25ms"));
});

test("ProductCard renders authoritative price, stock, category, and synthetic demo badge without fake ratings", () => {
  const html = renderToStaticMarkup(
    React.createElement(ProductCard, {
      product: sampleProduct,
      score: 0.95,
      onOpenDetails: () => {},
    })
  );

  assert.ok(html.includes('data-testid="product-card"'));
  assert.ok(html.includes(sampleProduct.name));
  assert.ok(html.includes(`$${sampleProduct.price.toFixed(2)}`));
  assert.ok(html.includes(sampleProduct.stock > 0 ? "in stock" : "Out of stock"));
  assert.ok(html.includes("Synthetic Demo Data"));
  assert.ok(html.includes("View Details"));
  assert.ok(html.includes("Relevance Score:"));

  // Verify NO invented star ratings, reviews, or fake discount badges are present
  assert.strictEqual(html.includes("★"), false);
  assert.strictEqual(html.includes("reviews"), false);
  assert.strictEqual(html.includes("discount"), false);
  assert.strictEqual(html.includes("% off"), false);
});

test("ProductCard renders fallback SVG placeholder when image URL is not provided", () => {
  const productWithoutImg: Product = {
    ...sampleProduct,
  };
  delete productWithoutImg.imageUrl;

  const html = renderToStaticMarkup(
    React.createElement(ProductCard, {
      product: productWithoutImg,
      onOpenDetails: () => {},
    })
  );

  assert.ok(html.includes("<svg"));
  assert.ok(html.includes("card-placeholder-svg"));
  assert.strictEqual(html.includes("<img"), false);
});

test("ProductGrid transitions cleanly between loading skeletons, error alerts, and empty states", () => {
  // 1. Loading state
  const loadingHtml = renderToStaticMarkup(
    React.createElement(ProductGrid, {
      products: [],
      loading: true,
      error: null,
      onRetry: () => {},
      onClearFilters: () => {},
      onOpenDetails: () => {},
    })
  );
  assert.ok(loadingHtml.includes('aria-busy="true"'));
  assert.ok(loadingHtml.includes("skeleton-card"));

  // 2. Error state
  const errorHtml = renderToStaticMarkup(
    React.createElement(ProductGrid, {
      products: [],
      loading: false,
      error: "PolyFind connection timeout",
      onRetry: () => {},
      onClearFilters: () => {},
      onOpenDetails: () => {},
    })
  );
  assert.ok(errorHtml.includes('role="alert"'));
  assert.ok(errorHtml.includes("Retrieval Request Failed"));
  assert.ok(errorHtml.includes("PolyFind connection timeout"));
  assert.ok(errorHtml.includes("Try Again"));

  // 3. Empty state
  const emptyHtml = renderToStaticMarkup(
    React.createElement(ProductGrid, {
      products: [],
      loading: false,
      error: null,
      onRetry: () => {},
      onClearFilters: () => {},
      onOpenDetails: () => {},
    })
  );
  assert.ok(emptyHtml.includes('role="status"'));
  assert.ok(emptyHtml.includes("No matching products found"));
  assert.ok(emptyHtml.includes("Reset Filters &amp; Search") || emptyHtml.includes("Reset Filters & Search"));
});

test("ProductModal renders canonical ID, version, authoritative facts, and transactional disclosure", () => {
  const html = renderToStaticMarkup(
    React.createElement(ProductModal, {
      product: sampleProduct,
      onClose: () => {},
    })
  );

  assert.ok(html.includes('role="dialog"'));
  assert.ok(html.includes(`ID: ${sampleProduct.id}`));
  assert.ok(html.includes(`v${sampleProduct.version}`));
  assert.ok(html.includes(`$${sampleProduct.price.toFixed(2)}`));
  assert.ok(html.includes("Authoritative Transactional Record"));
  assert.ok(html.includes("MySQL serves as the authoritative root of truth"));
  assert.ok(html.includes("Open Dedicated Product Page"));
});

test("executeSearch handles connection and upstream API failures safely", async () => {
  const prev = process.env.POLYFIND_API_URL;
  process.env.POLYFIND_API_URL = "http://127.0.0.1:1"; // Unreachable port
  try {
    await assert.rejects(
      async () => {
        await executeSearch({ query: "tent" });
      },
      /fetch failed|ECONNREFUSED/
    );
  } finally {
    process.env.POLYFIND_API_URL = prev;
  }
});

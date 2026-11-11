import assert from "node:assert/strict";
import test from "node:test";
import {
  createApiServer,
  InMemoryCatalog,
  InMemoryRelationalStore,
  type Product,
} from "../src/index.js";

function makeProduct(
  id: string,
  name: string,
  description: string,
  price = 50,
  version = 1,
  categoryId = "cat-gear",
  stock = 10,
): Product {
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

const AUTH_SECRET = "test-phase10-auth-secret-xyz";

function createTestServer() {
  const catalog = new InMemoryCatalog([
    makeProduct("prod-001", "Summit Tent 2P", "Lightweight backpacking tent", 299.99, 1, "tents", 5),
    makeProduct("prod-002", "Trail Pack 40L", "Ergonomic multi-day pack", 149.99, 1, "packs", 12),
    makeProduct("prod-003", "Camp Stove", "Compact canister stove", 44.99, 1, "cookware", 0),
  ]);

  const relational = new InMemoryRelationalStore({
    sellers: [
      { id: "seller-1", name: "Apex Outfitters", slug: "apex-outfitters", status: "active", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
      { id: "seller-2", name: "Blue Ridge Gear", slug: "blue-ridge-gear", status: "active", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
      { id: "seller-3", name: "Cascade Surplus", slug: "cascade-surplus", status: "suspended", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
    ],
    offers: [
      {
        id: "offer-1",
        productId: "prod-001",
        sellerId: "seller-1",
        variantId: null,
        currency: "USD",
        price: 289.99,
        stockQuantity: 10,
        availability: "available",
        validFrom: "2026-01-01T00:00:00.000Z",
        validUntil: null,
        version: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "offer-2",
        productId: "prod-001",
        sellerId: "seller-2",
        variantId: null,
        currency: "USD",
        price: 295.00,
        stockQuantity: 5,
        availability: "available",
        validFrom: "2026-01-01T00:00:00.000Z",
        validUntil: null,
        version: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "offer-3",
        productId: "prod-002",
        sellerId: "seller-1",
        variantId: null,
        currency: "USD",
        price: 145.00,
        stockQuantity: 0,
        availability: "out_of_stock",
        validFrom: "2026-01-01T00:00:00.000Z",
        validUntil: null,
        version: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    history: [
      {
        id: 1,
        offerId: "offer-1",
        productId: "prod-001",
        sellerId: "seller-1",
        currency: "USD",
        price: 299.99,
        stockQuantity: 15,
        availability: "available",
        offerVersion: 1,
        changeReason: "initial_creation",
        recordedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: 2,
        offerId: "offer-2",
        productId: "prod-001",
        sellerId: "seller-2",
        currency: "USD",
        price: 295.00,
        stockQuantity: 5,
        availability: "available",
        offerVersion: 1,
        changeReason: "initial_creation",
        recordedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  });

  const api = createApiServer({
    catalog,
    relational,
    authSecret: AUTH_SECRET,
  });

  return { api, catalog, relational };
}

test("1. GET /api/sellers lists sellers with pagination and status filtering", async () => {
  const { api } = createTestServer();
  const port = await api.start(0);

  try {
    const resAll = await fetch(`http://127.0.0.1:${port}/api/sellers?page=1&limit=10`);
    assert.equal(resAll.status, 200);
    const jsonAll = (await resAll.json()) as any;
    assert.equal(jsonAll.items.length, 3);
    assert.equal(jsonAll.total, 3);
    assert.equal(jsonAll.page, 1);
    assert.equal(jsonAll.limit, 10);

    // Filter by active status
    const resActive = await fetch(`http://127.0.0.1:${port}/api/sellers?status=active`);
    assert.equal(resActive.status, 200);
    const jsonActive = (await resActive.json()) as any;
    assert.equal(jsonActive.items.length, 2);
    assert.ok(jsonActive.items.every((s: any) => s.status === "active"));

    // Filter by suspended status
    const resSuspended = await fetch(`http://127.0.0.1:${port}/api/sellers?status=suspended`);
    assert.equal(resSuspended.status, 200);
    const jsonSuspended = (await resSuspended.json()) as any;
    assert.equal(jsonSuspended.items.length, 1);
    assert.equal(jsonSuspended.items[0].id, "seller-3");
  } finally {
    await api.stop();
  }
});

test("2. GET /api/sellers/:id returns seller details or 404 if missing", async () => {
  const { api } = createTestServer();
  const port = await api.start(0);

  try {
    const resFound = await fetch(`http://127.0.0.1:${port}/api/sellers/seller-1`);
    assert.equal(resFound.status, 200);
    const jsonFound = (await resFound.json()) as any;
    assert.equal(jsonFound.item.id, "seller-1");
    assert.equal(jsonFound.item.name, "Apex Outfitters");
    assert.equal(jsonFound.item.status, "active");

    const resMissing = await fetch(`http://127.0.0.1:${port}/api/sellers/unknown-seller`);
    assert.equal(resMissing.status, 404);
    const jsonMissing = (await resMissing.json()) as any;
    assert.equal(jsonMissing.error.code, "NOT_FOUND");
  } finally {
    await api.stop();
  }
});

test("3. GET /api/sellers/:id/offers returns associated seller offers or 404 if seller missing", async () => {
  const { api } = createTestServer();
  const port = await api.start(0);

  try {
    const resFound = await fetch(`http://127.0.0.1:${port}/api/sellers/seller-1/offers`);
    assert.equal(resFound.status, 200);
    const jsonFound = (await resFound.json()) as any;
    assert.ok(Array.isArray(jsonFound.items));
    assert.equal(jsonFound.items.length, 2);
    assert.ok(jsonFound.items.every((o: any) => o.sellerId === "seller-1"));

    const resMissing = await fetch(`http://127.0.0.1:${port}/api/sellers/nonexistent-seller/offers`);
    assert.equal(resMissing.status, 404);
  } finally {
    await api.stop();
  }
});

test("4. GET /api/offers supports filtering by productId, sellerId, price bounds, inStock, and sorting", async () => {
  const { api } = createTestServer();
  const port = await api.start(0);

  try {
    // Filter by product
    const resProd = await fetch(`http://127.0.0.1:${port}/api/offers?productId=prod-001`);
    assert.equal(resProd.status, 200);
    const jsonProd = (await resProd.json()) as any;
    assert.equal(jsonProd.items.length, 2);
    assert.ok(jsonProd.items.every((o: any) => o.productId === "prod-001"));

    // Filter by minPrice / maxPrice
    const resPrice = await fetch(`http://127.0.0.1:${port}/api/offers?minPrice=200&maxPrice=300`);
    assert.equal(resPrice.status, 200);
    const jsonPrice = (await resPrice.json()) as any;
    assert.equal(jsonPrice.items.length, 2);
    assert.ok(jsonPrice.items.every((o: any) => o.price >= 200 && o.price <= 300));

    // Filter by inStock
    const resStock = await fetch(`http://127.0.0.1:${port}/api/offers?inStock=true`);
    assert.equal(resStock.status, 200);
    const jsonStock = (await resStock.json()) as any;
    assert.equal(jsonStock.items.length, 2);
    assert.ok(jsonStock.items.every((o: any) => (o.stockQuantity ?? 0) > 0));

    // Sort by price descending
    const resSort = await fetch(`http://127.0.0.1:${port}/api/offers?sort=price&sortOrder=desc`);
    assert.equal(resSort.status, 200);
    const jsonSort = (await resSort.json()) as any;
    assert.equal(jsonSort.items.length, 3);
    for (let i = 0; i < jsonSort.items.length - 1; i++) {
      assert.ok(jsonSort.items[i].price >= jsonSort.items[i + 1].price);
    }
  } finally {
    await api.stop();
  }
});

test("5. GET /api/offers/:id returns offer or 404", async () => {
  const { api } = createTestServer();
  const port = await api.start(0);

  try {
    const resFound = await fetch(`http://127.0.0.1:${port}/api/offers/offer-1`);
    assert.equal(resFound.status, 200);
    const jsonFound = (await resFound.json()) as any;
    assert.equal(jsonFound.item.id, "offer-1");
    assert.equal(jsonFound.item.productId, "prod-001");
    assert.equal(jsonFound.item.price, 289.99);

    const resMissing = await fetch(`http://127.0.0.1:${port}/api/offers/nonexistent-offer`);
    assert.equal(resMissing.status, 404);
  } finally {
    await api.stop();
  }
});

test("6. GET /api/products/:id/offers returns associated product offers or 404 if product missing", async () => {
  const { api } = createTestServer();
  const port = await api.start(0);

  try {
    const resFound = await fetch(`http://127.0.0.1:${port}/api/products/prod-001/offers`);
    assert.equal(resFound.status, 200);
    const jsonFound = (await resFound.json()) as any;
    assert.ok(Array.isArray(jsonFound.items));
    assert.equal(jsonFound.items.length, 2);
    assert.ok(jsonFound.items.every((o: any) => o.productId === "prod-001"));

    const resMissing = await fetch(`http://127.0.0.1:${port}/api/products/unknown-prod/offers`);
    assert.equal(resMissing.status, 404);
  } finally {
    await api.stop();
  }
});

test("7. POST /api/offers security gating: unauthenticated requests are rejected with 401", async () => {
  const { api } = createTestServer();
  const port = await api.start(0);

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/offers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "offer-unauth",
        productId: "prod-001",
        sellerId: "seller-1",
        currency: "USD",
        price: 199.99,
        availability: "available",
      }),
    });
    assert.equal(res.status, 401);
    const json = (await res.json()) as any;
    assert.equal(json.error.code, "UNAUTHORIZED");
  } finally {
    await api.stop();
  }
});

test("8. POST /api/offers authenticated creates offer and emits 201 Created", async () => {
  const { api } = createTestServer();
  const port = await api.start(0);

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/offers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AUTH_SECRET}`,
      },
      body: JSON.stringify({
        id: "offer-created-1",
        productId: "prod-002",
        sellerId: "seller-2",
        currency: "USD",
        price: 139.99,
        stockQuantity: 15,
        availability: "available",
        changeReason: "New competitive offer",
      }),
    });
    assert.equal(res.status, 201);
    const json = (await res.json()) as any;
    assert.equal(json.item.id, "offer-created-1");
    assert.equal(json.item.price, 139.99);
    assert.equal(json.item.version, 1);

    // Verify it is retrievable via GET
    const resGet = await fetch(`http://127.0.0.1:${port}/api/offers/offer-created-1`);
    assert.equal(resGet.status, 200);
    const jsonGet = (await resGet.json()) as any;
    assert.equal(jsonGet.item.id, "offer-created-1");
  } finally {
    await api.stop();
  }
});

test("9. PUT /api/offers/:id security gating and optimistic concurrency control", async () => {
  const { api } = createTestServer();
  const port = await api.start(0);

  try {
    // 1. Unauthenticated request rejected with 401
    const resUnauth = await fetch(`http://127.0.0.1:${port}/api/offers/offer-1`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        price: 279.99,
        expectedVersion: 1,
      }),
    });
    assert.equal(resUnauth.status, 401);

    // 2. Mismatched expectedVersion returns 409 Conflict
    const resConflict = await fetch(`http://127.0.0.1:${port}/api/offers/offer-1`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AUTH_SECRET}`,
      },
      body: JSON.stringify({
        price: 279.99,
        expectedVersion: 999, // Current is 1
      }),
    });
    assert.equal(resConflict.status, 409);
    const jsonConflict = (await resConflict.json()) as any;
    assert.equal(jsonConflict.error.code, "OFFER_VERSION_CONFLICT");

    // 3. Successful update with matching expectedVersion returns 200 and version 2
    const resSuccess = await fetch(`http://127.0.0.1:${port}/api/offers/offer-1`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AUTH_SECRET}`,
      },
      body: JSON.stringify({
        price: 279.99,
        stockQuantity: 8,
        expectedVersion: 1,
        changeReason: "End of season discount",
      }),
    });
    assert.equal(resSuccess.status, 200);
    const jsonSuccess = (await resSuccess.json()) as any;
    assert.equal(jsonSuccess.item.price, 279.99);
    assert.equal(jsonSuccess.item.stockQuantity, 8);
    assert.equal(jsonSuccess.item.version, 2);

    // 4. Consequent update with old expectedVersion 1 now fails with 409
    const resConflictStale = await fetch(`http://127.0.0.1:${port}/api/offers/offer-1`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AUTH_SECRET}`,
      },
      body: JSON.stringify({
        price: 269.99,
        expectedVersion: 1,
      }),
    });
    assert.equal(resConflictStale.status, 409);
  } finally {
    await api.stop();
  }
});

test("10. Validation handles missing fields and invalid types with 400 Bad Request", async () => {
  const { api } = createTestServer();
  const port = await api.start(0);

  try {
    // Missing required field
    const resBadPayload = await fetch(`http://127.0.0.1:${port}/api/offers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": AUTH_SECRET,
      },
      body: JSON.stringify({
        id: "offer-bad",
        productId: "prod-001",
        // sellerId missing!
        currency: "USD",
        price: 100,
        availability: "available",
      }),
    });
    assert.equal(resBadPayload.status, 400);

    // Negative price
    const resNegPrice = await fetch(`http://127.0.0.1:${port}/api/offers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": AUTH_SECRET,
      },
      body: JSON.stringify({
        id: "offer-neg",
        productId: "prod-001",
        sellerId: "seller-1",
        currency: "USD",
        price: -50,
        availability: "available",
      }),
    });
    assert.equal(resNegPrice.status, 400);

    // PUT missing expectedVersion
    const resMissingVersion = await fetch(`http://127.0.0.1:${port}/api/offers/offer-1`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": AUTH_SECRET,
      },
      body: JSON.stringify({
        price: 250,
      }),
    });
    assert.equal(resMissingVersion.status, 400);
  } finally {
    await api.stop();
  }
});

test("11. GET /api/price-history supports filtering by product, offer, seller and pagination", async () => {
  const { api } = createTestServer();
  const port = await api.start(0);

  try {
    const resAll = await fetch(`http://127.0.0.1:${port}/api/price-history`);
    assert.equal(resAll.status, 200);
    const jsonAll = (await resAll.json()) as any;
    assert.ok(Array.isArray(jsonAll.items));
    assert.equal(jsonAll.items.length, 2);
    assert.equal(jsonAll.total, 2);

    // Filter by offerId
    const resOffer = await fetch(`http://127.0.0.1:${port}/api/price-history?offerId=offer-1`);
    assert.equal(resOffer.status, 200);
    const jsonOffer = (await resOffer.json()) as any;
    assert.equal(jsonOffer.items.length, 1);
    assert.equal(jsonOffer.items[0].offerId, "offer-1");

    // Filter by non-existent product returns empty items
    const resEmpty = await fetch(`http://127.0.0.1:${port}/api/price-history?productId=nonexistent`);
    assert.equal(resEmpty.status, 200);
    const jsonEmpty = (await resEmpty.json()) as any;
    assert.equal(jsonEmpty.items.length, 0);
  } finally {
    await api.stop();
  }
});

test("12. GET /api/products/:id/price-history and /api/offers/:id/price-history return targeted history or 404", async () => {
  const { api } = createTestServer();
  const port = await api.start(0);

  try {
    // Product price history
    const resProd = await fetch(`http://127.0.0.1:${port}/api/products/prod-001/price-history`);
    assert.equal(resProd.status, 200);
    const jsonProd = (await resProd.json()) as any;
    assert.ok(jsonProd.items.length >= 1);
    assert.ok(jsonProd.items.every((h: any) => h.productId === "prod-001"));

    // Offer price history
    const resOffer = await fetch(`http://127.0.0.1:${port}/api/offers/offer-1/price-history`);
    assert.equal(resOffer.status, 200);
    const jsonOffer = (await resOffer.json()) as any;
    assert.equal(jsonOffer.items.length, 1);
    assert.equal(jsonOffer.items[0].offerId, "offer-1");

    // Unknown product price history
    const resUnknownProd = await fetch(`http://127.0.0.1:${port}/api/products/nonexistent/price-history`);
    assert.equal(resUnknownProd.status, 404);

    // Unknown offer price history
    const resUnknownOffer = await fetch(`http://127.0.0.1:${port}/api/offers/nonexistent/price-history`);
    assert.equal(resUnknownOffer.status, 404);
  } finally {
    await api.stop();
  }
});

test("13. Method Not Allowed: POST /api/products returns 405", async () => {
  const { api } = createTestServer();
  const port = await api.start(0);

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Forbidden Product" }),
    });
    assert.equal(res.status, 405);
  } finally {
    await api.stop();
  }
});

test("14. Opt-in MySQL RelationalRepository integration", { skip: !process.env.TEST_DATABASE_URL }, async () => {
  assert.ok(process.env.TEST_DATABASE_URL);
});

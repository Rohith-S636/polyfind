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

function createTestAuth() {
  let revoked = false;
  return {
    async authenticate(token: string) {
      if (token === AUTH_SECRET && !revoked) {
        return { id: "admin-test", email: "admin@example.test", roles: ["admin"] };
      }
      if (token === "customer-token") {
        return { id: "customer-test", email: "customer@example.test", roles: ["customer"] };
      }
      return null;
    },
    async login(email: string) {
      return { token: AUTH_SECRET, expiresAt: "2026-12-01T00:00:00.000Z", user: { id: "admin-test", email, roles: ["admin"] } };
    },
    async bootstrapAdmin(email: string) {
      return { token: AUTH_SECRET, expiresAt: "2026-12-01T00:00:00.000Z", user: { id: "admin-test", email, roles: ["admin"] } };
    },
    async logout() {
      revoked = true;
    },
  };
}

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
        availability: "unavailable",
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
    auth: createTestAuth(),
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
        Authorization: `Bearer ${AUTH_SECRET}`,
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
        Authorization: `Bearer ${AUTH_SECRET}`,
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
        Authorization: `Bearer ${AUTH_SECRET}`,
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


test("15. POST /api/sellers creates a seller only with catalogue mutation credentials", async () => {
  const { api } = createTestServer();
  const port = await api.start(0);
  try {
    const denied = await fetch(`http://127.0.0.1:${port}/api/sellers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "seller-new", name: "New Seller", slug: "new-seller" }),
    });
    assert.equal(denied.status, 401);

    const created = await fetch(`http://127.0.0.1:${port}/api/sellers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AUTH_SECRET}`,
      },
      body: JSON.stringify({ id: "seller-new", name: "New Seller", slug: "new-seller" }),
    });
    assert.equal(created.status, 201);
    const json = (await created.json()) as any;
    assert.equal(json.item.id, "seller-new");
    assert.equal(json.item.status, "active");
  } finally {
    await api.stop();
  }
});


test("16. POST /api/brands and product variants require authentication and persist through the relational store", async () => {
  const { api } = createTestServer();
  const port = await api.start(0);
  try {
    const brand = await fetch(`http://127.0.0.1:${port}/api/brands`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${AUTH_SECRET}` },
      body: JSON.stringify({ id: "brand-new", name: "New Brand", slug: "new-brand", description: "Test brand" }),
    });
    assert.equal(brand.status, 201);
    const brandJson = (await brand.json()) as any;
    assert.equal(brandJson.item.id, "brand-new");

    const variant = await fetch(`http://127.0.0.1:${port}/api/products/prod-001/variants`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${AUTH_SECRET}` },
      body: JSON.stringify({ id: "variant-new", variantKey: "color", attributes: { color: "blue" }, sku: "SKU-BLUE" }),
    });
    assert.equal(variant.status, 201);
    const variantJson = (await variant.json()) as any;
    assert.equal(variantJson.item.productId, "prod-001");
    assert.equal(variantJson.item.attributes.color, "blue");
  } finally {
    await api.stop();
  }
});


test("17. GET /api/brands and product variants expose persisted catalogue metadata", async () => {
  const { api } = createTestServer();
  const port = await api.start(0);
  try {
    await fetch(`http://127.0.0.1:${port}/api/brands`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${AUTH_SECRET}` },
      body: JSON.stringify({ id: "brand-read", name: "Read Brand", slug: "read-brand" }),
    });
    const brands = await fetch(`http://127.0.0.1:${port}/api/brands`);
    assert.equal(brands.status, 200);
    assert.equal(((await brands.json()) as any).items[0].id, "brand-read");

    await fetch(`http://127.0.0.1:${port}/api/products/prod-001/variants`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${AUTH_SECRET}` },
      body: JSON.stringify({ id: "variant-read", variantKey: "size", attributes: { size: "large" } }),
    });
    const variants = await fetch(`http://127.0.0.1:${port}/api/products/prod-001/variants`);
    assert.equal(variants.status, 200);
    assert.equal(((await variants.json()) as any).items[0].id, "variant-read");
    const variant = await fetch(`http://127.0.0.1:${port}/api/variants/variant-read`);
    assert.equal(variant.status, 200);
    assert.equal(((await variant.json()) as any).item.attributes.size, "large");
  } finally {
    await api.stop();
  }
});


test("18. Product catalogue POST and PUT routes authenticate and delegate versioned writes", async () => {
  const original = makeProduct("prod-write", "Before", "Before update", 10, 1);
  const api = createApiServer({
    catalog: new InMemoryCatalog([original]),
    relational: new InMemoryRelationalStore(),
    auth: createTestAuth(),
    createProduct: async (input) => makeProduct(input.id, input.name, input.description, input.price, 1, input.categoryId, input.stock),
    updateProduct: async (id, patch, expectedVersion) => {
      assert.equal(id, original.id);
      assert.equal(expectedVersion, 1);
      return { ...original, ...patch, version: 2, updatedAt: new Date().toISOString() };
    },
  });
  const port = await api.start(0);
  try {
    const denied = await fetch(`http://127.0.0.1:${port}/api/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "prod-new", name: "New", description: "New", categoryId: "cat-gear", price: 5, stock: 2 }),
    });
    assert.equal(denied.status, 401);

    const created = await fetch(`http://127.0.0.1:${port}/api/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${AUTH_SECRET}` },
      body: JSON.stringify({ id: "prod-new", name: "New", description: "New", categoryId: "cat-gear", price: 5, stock: 2 }),
    });
    assert.equal(created.status, 201);
    assert.equal(((await created.json()) as any).item.id, "prod-new");

    const updated = await fetch(`http://127.0.0.1:${port}/api/products/prod-write`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${AUTH_SECRET}` },
      body: JSON.stringify({ name: "After", expectedVersion: 1 }),
    });
    assert.equal(updated.status, 200);
    const updatedJson = (await updated.json()) as any;
    assert.equal(updatedJson.item.name, "After");
    assert.equal(updatedJson.version, 2);
  } finally {
    await api.stop();
  }
});


test("19. Session authentication exposes login, current principal, logout, and rejects revoked sessions", async () => {
  const auth = createTestAuth();
  const api = createApiServer({
    catalog: new InMemoryCatalog([]),
    relational: new InMemoryRelationalStore(),
    auth,
  });
  const port = await api.start(0);
  try {
    const customerMutation = await fetch(`http://127.0.0.1:${port}/api/sellers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer customer-token" },
      body: JSON.stringify({ id: "seller-forbidden", name: "Forbidden", slug: "forbidden" }),
    });
    assert.equal(customerMutation.status, 401);

    const login = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@example.test", password: "test-password" }),
    });
    assert.equal(login.status, 200);
    const session = (await login.json()) as any;
    assert.equal(session.user.roles[0], "admin");
    assert.equal("token" in session, false);
    const cookieHeader = login.headers.get("set-cookie");
    assert.ok(cookieHeader);
    assert.match(cookieHeader, /HttpOnly/i);
    assert.match(cookieHeader, /SameSite=Strict/i);
    const cookie = cookieHeader.split(";")[0]!;

    const me = await fetch(`http://127.0.0.1:${port}/api/auth/me`, {
      headers: { Cookie: cookie },
    });
    assert.equal(me.status, 200);
    assert.equal(((await me.json()) as any).user.id, "admin-test");

    const logout = await fetch(`http://127.0.0.1:${port}/api/auth/logout`, {
      method: "POST",
      headers: { Cookie: cookie },
    });
    assert.equal(logout.status, 200);
    assert.match(logout.headers.get("set-cookie") ?? "", /Max-Age=0/);

    const revoked = await fetch(`http://127.0.0.1:${port}/api/auth/me`, {
      headers: { Cookie: cookie },
    });
    assert.equal(revoked.status, 401);
  } finally {
    await api.stop();
  }
});

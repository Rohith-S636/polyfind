import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  CatalogRepository,
  RelationalRepository,
  createDatabasePool,
  parseDatabaseUrl,
  runMigrations,
  SessionAuthService,
  createApiServer,
  asCatalogReader,
} from "../src/index.js";

const databaseUrl = process.env.TEST_DATABASE_URL;

test("MySQL integration: migrations, catalogue transactions, optimistic locking, variants, offers, history and outbox", {
  skip: !databaseUrl,
}, async () => {
  const pool = createDatabasePool(parseDatabaseUrl(databaseUrl));
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const categoryId = `it-cat-${suffix}`;
  const productId = `it-prod-${suffix}`;
  const brandId = `it-brand-${suffix}`;
  const sellerId = `it-seller-${suffix}`;
  const variantId = `it-var-${suffix}`;
  const offerId = `it-offer-${suffix}`;

  try {
    const migration = await runMigrations(pool);
    assert.ok(migration.totalAvailable >= 5);
    assert.equal(migration.applied.length + migration.alreadyApplied.length, migration.totalAvailable);

    await pool.query(
      "INSERT INTO categories (id, name, description, slug) VALUES (?, ?, ?, ?)",
      [categoryId, "Integration Test Category", "Disposable CI fixture", categoryId],
    );

    const catalog = new CatalogRepository(pool);
    const relational = new RelationalRepository(pool);
    const bootstrapToken = "disposable-ci-bootstrap-token-with-32-plus-characters";
    const auth = new SessionAuthService(pool, bootstrapToken);
    const bootstrapped = await auth.bootstrapAdmin(
      `admin-${suffix}@example.test`,
      "correct-horse-battery-staple-2026",
      bootstrapToken,
    );

    const createdProduct = await catalog.createProduct({
      id: productId,
      name: "Integration Test Product",
      description: "Disposable MySQL integration fixture",
      categoryId,
      price: 120,
      stock: 9,
      actorUserId: bootstrapped.user.id,
    });
    assert.equal(createdProduct.version, 1);

    const updatedProduct = await catalog.updateProduct(
      productId,
      { price: 110, stock: 8, actorUserId: bootstrapped.user.id },
      1,
    );
    assert.equal(updatedProduct.version, 2);
    assert.equal(updatedProduct.price, 110);
    await assert.rejects(
      catalog.updateProduct(productId, { price: 100, actorUserId: bootstrapped.user.id }, 1),
      /version|conflict/i,
    );

    await relational.createBrand({
      id: brandId,
      name: "Integration Brand",
      slug: brandId,
      description: "CI only",
      actorUserId: bootstrapped.user.id,
    });
    assert.equal((await relational.getBrand(brandId))?.name, "Integration Brand");
    assert.ok((await relational.listBrands()).some((brand) => brand.id === brandId));

    const api = createApiServer({
      catalog: asCatalogReader(catalog),
      relational,
      auth,
    });
    const apiPort = await api.start(0);
    try {
      const sellerResponse = await fetch(`http://127.0.0.1:${apiPort}/api/sellers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${bootstrapped.token}`,
        },
        body: JSON.stringify({
          id: sellerId,
          name: "Integration Seller",
          slug: sellerId,
          actorUserId: "client-actor-id",
        }),
      });
      assert.equal(sellerResponse.status, 201);
    } finally {
      await api.stop();
    }
    assert.equal((await relational.getSeller(sellerId))?.status, "active");
    const [sellerAuditRows] = await pool.query(
      "SELECT actor_user_id FROM audit_logs WHERE entity_type = 'seller' AND entity_id = ? ORDER BY id DESC LIMIT 1",
      [sellerId],
    );
    assert.equal((sellerAuditRows as Array<{ actor_user_id: string }>)[0]?.actor_user_id, bootstrapped.user.id);

    await relational.createProductVariant({
      id: variantId,
      productId,
      variantKey: "color",
      sku: `SKU-${suffix}`,
      attributes: { color: "blue" },
      actorUserId: bootstrapped.user.id,
    });
    assert.equal((await relational.getProductVariant(variantId))?.attributes.color, "blue");
    assert.equal((await relational.listProductVariants(productId)).length, 1);

    const createdOffer = await relational.createOffer({
      id: offerId,
      productId,
      sellerId,
      variantId,
      currency: "INR",
      price: 499,
      stockQuantity: 4,
      availability: "available",
      changeReason: "integration_create",
      actorUserId: bootstrapped.user.id,
    });
    assert.equal(createdOffer.version, 1);

    const updatedOffer = await relational.updateOffer(
      offerId,
      { price: 449, changeReason: "integration_update", actorUserId: bootstrapped.user.id },
      1,
    );
    assert.equal(updatedOffer.version, 2);
    assert.equal(updatedOffer.price, 449);
    await assert.rejects(
      relational.updateOffer(offerId, { price: 399 }, 1),
      /version|conflict/i,
    );

    const history = await relational.getPriceHistory({ offerId, sortOrder: "asc" });
    assert.equal(history.total, 2);
    assert.deepEqual(history.items.map((item) => item.offerVersion), [1, 2]);

    const [outboxRows] = await pool.query(
      "SELECT COUNT(*) AS total FROM outbox_events WHERE aggregate_id IN (?, ?, ?, ?)",
      [productId, brandId, variantId, offerId],
    );
    assert.ok(Number((outboxRows as Array<{ total: number }>)[0]?.total ?? 0) >= 4);

    const [auditRows] = await pool.query(
      "SELECT COUNT(*) AS total FROM audit_logs WHERE actor_user_id = ? AND entity_id IN (?, ?, ?, ?, ?)",
      [bootstrapped.user.id, productId, brandId, sellerId, variantId, offerId],
    );
    assert.ok(Number((auditRows as Array<{ total: number }>)[0]?.total ?? 0) >= 6);

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.query(
        "INSERT INTO brands (id, name, slug) VALUES (?, ?, ?)",
        [`rollback-${suffix}`, "Rollback Brand", `rollback-${suffix}`],
      );
      await connection.rollback();
    } finally {
      connection.release();
    }
    const [rollbackRows] = await pool.query(
      "SELECT COUNT(*) AS total FROM brands WHERE id = ?",
      [`rollback-${suffix}`],
    );
    assert.equal(Number((rollbackRows as Array<{ total: number }>)[0]?.total ?? 0), 0);

    assert.ok(bootstrapped.token.length >= 40);
    const authenticated = await auth.authenticate(bootstrapped.token);
    assert.equal(authenticated?.id, bootstrapped.user.id);
    assert.deepEqual(authenticated?.roles, ["admin"]);

    const loggedIn = await auth.login(`admin-${suffix}@example.test`, "correct-horse-battery-staple-2026");
    assert.equal((await auth.authenticate(loggedIn.token))?.email, `admin-${suffix}@example.test`);
    await auth.logout(bootstrapped.token);
    assert.equal(await auth.authenticate(bootstrapped.token), null);
    await assert.rejects(
      auth.bootstrapAdmin(`second-${suffix}@example.test`, "another-secure-password-2026", "disposable-ci-bootstrap-token-with-32-plus-characters"),
      /already been completed/i,
    );
  } finally {
    await pool.end();
  }
});

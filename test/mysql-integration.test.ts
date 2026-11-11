import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  CatalogRepository,
  RelationalRepository,
  createDatabasePool,
  parseDatabaseUrl,
  runMigrations,
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

    const createdProduct = await catalog.createProduct({
      id: productId,
      name: "Integration Test Product",
      description: "Disposable MySQL integration fixture",
      categoryId,
      price: 120,
      stock: 9,
    });
    assert.equal(createdProduct.version, 1);

    const updatedProduct = await catalog.updateProduct(
      productId,
      { price: 110, stock: 8 },
      1,
    );
    assert.equal(updatedProduct.version, 2);
    assert.equal(updatedProduct.price, 110);
    await assert.rejects(
      catalog.updateProduct(productId, { price: 100 }, 1),
      /version|conflict/i,
    );

    await relational.createBrand({
      id: brandId,
      name: "Integration Brand",
      slug: brandId,
      description: "CI only",
    });
    assert.equal((await relational.getBrand(brandId))?.name, "Integration Brand");
    assert.ok((await relational.listBrands()).some((brand) => brand.id === brandId));

    await relational.createSeller({
      id: sellerId,
      name: "Integration Seller",
      slug: sellerId,
    });
    assert.equal((await relational.getSeller(sellerId))?.status, "active");

    await relational.createProductVariant({
      id: variantId,
      productId,
      variantKey: "color",
      sku: `SKU-${suffix}`,
      attributes: { color: "blue" },
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
    });
    assert.equal(createdOffer.version, 1);

    const updatedOffer = await relational.updateOffer(
      offerId,
      { price: 449, changeReason: "integration_update" },
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
  } finally {
    await pool.end();
  }
});

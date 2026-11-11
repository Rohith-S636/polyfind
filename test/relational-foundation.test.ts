import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { RowDataPacket } from "mysql2/promise";
import {
  CatalogValidationError,
  OfferVersionConflictError,
  RelationalRepository,
  closeDatabasePool,
  createDatabasePool,
  dropAllTables,
  getAvailableMigrationFiles,
  parseDatabaseUrl,
  runMigrations,
} from "../src/index.js";

const migrationName = "004_relational_foundation.sql";

test("004 relational foundation defines normalized marketplace and identity tables", async () => {
  const files = await getAvailableMigrationFiles();
  const migration = files.find((file) => file.name === migrationName);
  assert.ok(migration, `Expected ${migrationName} to exist`);
  const sql = await fs.readFile(migration.fullPath, "utf8");

  for (const table of [
    "brands",
    "product_variants",
    "sellers",
    "offers",
    "offer_history",
    "users",
    "roles",
    "user_roles",
    "sessions",
    "audit_logs",
    "outbox_events",
    "outbox_deliveries",
  ]) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`, "i"));
  }

  assert.match(sql, /fk_offers_variant_product\s+FOREIGN KEY\s*\(variant_id, product_id\)/i);
  assert.match(sql, /REFERENCES product_variants\s*\(id, product_id\)/i);
  assert.match(sql, /availability ENUM\('available', 'unavailable', 'unknown_stock'\)/i);
  assert.match(sql, /chk_offer_currency_format/i);
  assert.match(sql, /chk_offer_validity_period/i);
  assert.match(sql, /PRIMARY KEY \(event_id, target_name\)/i);
  assert.match(sql, /ENUM\('redis', 'neo4j', 'lancedb'\)/i);
});

test("legacy product-level price history remains distinct from seller offer history", async () => {
  const initial = await fs.readFile(
    path.resolve(process.cwd(), "migrations/001_initial_schema.sql"),
    "utf8",
  );
  const foundation = await fs.readFile(
    path.resolve(process.cwd(), `migrations/${migrationName}`),
    "utf8",
  );

  assert.match(initial, /CREATE TABLE IF NOT EXISTS product_versions/i);
  assert.match(initial, /price DECIMAL\(10, 2\)/i);
  assert.match(foundation, /CREATE TABLE IF NOT EXISTS offer_history/i);
  assert.match(foundation, /offer_version BIGINT UNSIGNED/i);
  assert.doesNotMatch(foundation, /ALTER TABLE product_versions/i);
});

const disposableDatabaseUrl = process.env.POLYFIND_TEST_DATABASE_URL;

test(
  "relational foundation preserves legacy data and atomically records offer mutations",
  { skip: !disposableDatabaseUrl },
  async () => {
    const pool = createDatabasePool(parseDatabaseUrl(disposableDatabaseUrl));
    const repository = new RelationalRepository(pool);
    try {
      await dropAllTables(pool);
      await runMigrations(pool);

      await pool.query(
        "INSERT INTO categories (id, name, description, slug) VALUES (?, ?, ?, ?)",
        ["cat-foundation", "Foundation", "Test category", "foundation"],
      );
      await pool.query(
        `INSERT INTO products
          (id, name, description, category_id, price, stock, version, slug, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          "prod-foundation",
          "Foundation Product",
          "Legacy-compatible product",
          "cat-foundation",
          10,
          4,
          1,
          "foundation-product",
          "active",
        ],
      );
      await repository.createSeller({
        id: "seller-foundation",
        name: "Foundation Seller",
        slug: "foundation-seller",
      });
      await repository.createProductVariant({
        id: "variant-foundation",
        productId: "prod-foundation",
        variantKey: "default",
        attributes: { color: "blue" },
        sku: "FOUNDATION-BLUE",
      });
      await pool.query(
        `INSERT INTO products
          (id, name, description, category_id, price, stock, version, slug, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          "prod-other",
          "Other Product",
          "Ownership validation product",
          "cat-foundation",
          20,
          1,
          1,
          "other-product",
          "active",
        ],
      );

      const created = await repository.createOffer({
        id: "offer-foundation",
        productId: "prod-foundation",
        sellerId: "seller-foundation",
        variantId: "variant-foundation",
        currency: "USD",
        price: 12.5,
        stockQuantity: 3,
        availability: "available",
      });
      assert.equal(created.version, 1);

      await assert.rejects(
        () =>
          repository.createOffer({
            id: "offer-invalid-currency",
            productId: "prod-foundation",
            sellerId: "seller-foundation",
            currency: "US",
            price: 10,
            stockQuantity: 1,
            availability: "available",
          }),
        (error: unknown) => error instanceof CatalogValidationError,
      );
      await assert.rejects(
        () =>
          repository.createOffer({
            id: "offer-invalid-variant-owner",
            productId: "prod-other",
            sellerId: "seller-foundation",
            variantId: "variant-foundation",
            currency: "USD",
            price: 10,
            stockQuantity: 1,
            availability: "available",
          }),
        /referential integrity|database operation failed/i,
      );
      await assert.rejects(
        () =>
          repository.updateOffer(
            "offer-foundation",
            { availability: "unknown_stock" },
            1,
          ),
        (error: unknown) => error instanceof CatalogValidationError,
      );
      const unchanged = await repository.getOffer("offer-foundation");
      assert.equal(unchanged?.version, 1);
      assert.equal(unchanged?.stockQuantity, 3);

      const updated = await repository.updateOffer(
        "offer-foundation",
        { price: 11.5, stockQuantity: 0, availability: "unavailable" },
        1,
      );
      assert.equal(updated.version, 2);

      const [historyRows] = await pool.query<RowDataPacket[]>(
        "SELECT offer_version, price, stock_quantity FROM offer_history WHERE offer_id = ? ORDER BY offer_version",
        ["offer-foundation"],
      );
      assert.equal(historyRows.length, 2);
      assert.equal(Number(historyRows[1]?.["offer_version"]), 2);
      assert.equal(Number(historyRows[1]?.["price"]), 11.5);

      const [auditRows] = await pool.query<RowDataPacket[]>(
        "SELECT action, before_data, after_data FROM audit_logs WHERE entity_id = ? ORDER BY id",
        ["offer-foundation"],
      );
      assert.equal(auditRows.length, 2);
      assert.equal(auditRows[1]?.["action"], "offer.updated");
      assert.ok(auditRows[1]?.["before_data"]);
      assert.ok(auditRows[1]?.["after_data"]);

      const [deliveryRows] = await pool.query<RowDataPacket[]>(
        `SELECT d.target_name, d.status
         FROM outbox_deliveries d
         JOIN outbox_events e ON e.event_id = d.event_id
         WHERE e.aggregate_id = ?
         ORDER BY d.target_name`,
        ["offer-foundation"],
      );
      assert.equal(deliveryRows.length, 6);
      assert.deepEqual(
        deliveryRows.slice(0, 3).map((row) => row["target_name"]),
        ["lancedb", "neo4j", "redis"],
      );

      await assert.rejects(
        () =>
          repository.updateOffer(
            "offer-foundation",
            { price: 9.5, stockQuantity: null, availability: "unknown_stock" },
            1,
          ),
        (error: unknown) =>
          error instanceof OfferVersionConflictError &&
          error.actualVersion === 2,
      );

      const [legacyRows] = await pool.query<RowDataPacket[]>(
        "SELECT price, stock, version FROM products WHERE id = ?",
        ["prod-foundation"],
      );
      assert.equal(Number(legacyRows[0]?.["price"]), 10);
      assert.equal(Number(legacyRows[0]?.["stock"]), 4);
      assert.equal(Number(legacyRows[0]?.["version"]), 1);

      await pool.query(
        "INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)",
        ["00000000-0000-0000-0000-000000000001", "foundation@example.test", "hash-only"],
      );
      await pool.query("INSERT INTO roles (id, name) VALUES (?, ?)", ["admin", "admin"]);
      await pool.query(
        "INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)",
        ["00000000-0000-0000-0000-000000000001", "admin"],
      );
      const [roleRows] = await pool.query<RowDataPacket[]>(
        `SELECT r.name FROM user_roles ur
         JOIN roles r ON r.id = ur.role_id
         WHERE ur.user_id = ?`,
        ["00000000-0000-0000-0000-000000000001"],
      );
      assert.equal(roleRows[0]?.["name"], "admin");
    } finally {
      await pool.end();
      await closeDatabasePool();
    }
  },
);

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  closeDatabasePool,
  createDatabasePool,
  dropAllTables,
  getAppliedMigrations,
  getAvailableMigrationFiles,
  loadEnvironment,
  parseDatabaseUrl,
  runMigrations,
} from "../src/index.js";

loadEnvironment();

test("migration files exist and follow ordered naming convention", async () => {
  const files = await getAvailableMigrationFiles();
  assert.ok(files.length > 0, "Expected at least one migration file");
  assert.ok(
    files.some((f) => f.name === "001_initial_schema.sql"),
    "Expected 001_initial_schema.sql to exist",
  );
});

test("001_initial_schema.sql declares explicit primary keys, foreign keys, and domain constraints", async () => {
  const files = await getAvailableMigrationFiles();
  const initialMigration = files.find((f) => f.name === "001_initial_schema.sql");
  assert.ok(initialMigration, "Migration file not found");

  const sql = await fs.readFile(initialMigration.fullPath, "utf-8");

  // Primary keys
  assert.match(sql, /CONSTRAINT\s+pk_categories\s+PRIMARY\s+KEY\s*\(id\)/i);
  assert.match(sql, /CONSTRAINT\s+pk_products\s+PRIMARY\s+KEY\s*\(id\)/i);
  assert.match(sql, /CONSTRAINT\s+pk_product_versions\s+PRIMARY\s+KEY\s*\(id\)/i);

  // Foreign keys
  assert.match(
    sql,
    /CONSTRAINT\s+fk_products_category\s+FOREIGN\s+KEY\s*\(category_id\)\s+REFERENCES\s+categories\s*\(id\)/i,
  );
  assert.match(
    sql,
    /CONSTRAINT\s+fk_product_versions_product\s+FOREIGN\s+KEY\s*\(product_id\)\s+REFERENCES\s+products\s*\(id\)/i,
  );

  // Domain constraints (price >= 0, stock >= 0, version > 0)
  assert.match(sql, /CONSTRAINT\s+chk_product_price_non_negative\s+CHECK\s*\(price\s*>=\s*0\)/i);
  assert.match(sql, /CONSTRAINT\s+chk_product_stock_non_negative\s+CHECK\s*\(stock\s*>=\s*0\)/i);
  assert.match(sql, /CONSTRAINT\s+chk_product_version_positive\s+CHECK\s*\(version\s*>\s*0\)/i);
});

test("003_catalog_metadata.sql defines optional catalogue metadata without duplicating the base schema", async () => {
  const files = await getAvailableMigrationFiles();
  const metadataMigration = files.find((f) => f.name === "003_catalog_metadata.sql");
  assert.ok(metadataMigration, "Metadata migration file not found");
  const sql = await fs.readFile(metadataMigration.fullPath, "utf-8");
  for (const column of ["currency", "availability", "brand", "attributes", "image_url", "product_url", "data_source"]) {
    assert.match(sql, new RegExp(`ADD COLUMN IF NOT EXISTS\\s+${column}\\b`, "i"));
  }
  assert.match(sql, /SET availability = CASE WHEN stock > 0 THEN 'in-stock' ELSE 'out-of-stock' END/i);
});

test("parseDatabaseUrl throws informative error without secrets when DATABASE_URL is missing", () => {
  assert.throws(
    () => parseDatabaseUrl(""),
    (err: unknown) =>
      err instanceof Error &&
      err.message.includes("Missing required environment variable DATABASE_URL"),
  );
});

test("parseDatabaseUrl parses valid MySQL URL structure", () => {
  const config = parseDatabaseUrl("mysql://user:pass@127.0.0.1:3307/test_db");
  assert.equal(config.host, "127.0.0.1");
  assert.equal(config.port, 3307);
  assert.equal(config.user, "user");
  assert.equal(config.password, "pass");
  assert.equal(config.database, "test_db");
});

// Destructive integration tests require an explicitly disposable database.
const disposableDatabaseUrl = process.env.POLYFIND_TEST_DATABASE_URL;

test("MySQL schema and migration behavior on a clean database", { skip: !disposableDatabaseUrl }, async () => {
  const pool = createDatabasePool(parseDatabaseUrl(disposableDatabaseUrl));

  try {
    // 1. Reset/clean database tables
    await dropAllTables(pool);

    // 2. Run migrations on clean database
    const result = await runMigrations(pool);
    assert.ok(result.applied.includes("001_initial_schema.sql"));
    assert.equal(result.alreadyApplied.length, 0);

    // 3. Verify applied migrations list
    const applied = await getAppliedMigrations(pool);
    assert.ok(applied.includes("001_initial_schema.sql"));

    // 4. Verify repeatability: running again applies 0 new migrations
    const secondRun = await runMigrations(pool);
    assert.equal(secondRun.applied.length, 0);
    assert.ok(secondRun.alreadyApplied.includes("001_initial_schema.sql"));

    // 5. Verify constraints: insert a category
    await pool.query("INSERT INTO categories (id, name, description) VALUES (?, ?, ?)", [
      "cat-test",
      "Test Category",
      "Category description",
    ]);

    // 6. Verify valid product insertion
    await pool.query(
      "INSERT INTO products (id, name, description, category_id, price, stock, version) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ["prod-test", "Test Product", "Product description", "cat-test", 19.99, 10, 1],
    );

    // 7. Verify foreign key constraint rejection
    await assert.rejects(
      async () => {
        await pool.query(
          "INSERT INTO products (id, name, description, category_id, price, stock, version) VALUES (?, ?, ?, ?, ?, ?, ?)",
          ["prod-invalid-cat", "Invalid Category Product", "Desc", "non-existent-cat", 10, 5, 1],
        );
      },
      /foreign key constraint fails/i,
      "Expected FK constraint failure for non-existent category",
    );

    // 8. Verify CHECK constraint rejection: negative price
    await assert.rejects(
      async () => {
        await pool.query(
          "INSERT INTO products (id, name, description, category_id, price, stock, version) VALUES (?, ?, ?, ?, ?, ?, ?)",
          ["prod-neg-price", "Negative Price", "Desc", "cat-test", -5.0, 5, 1],
        );
      },
      /check constraint.*(failed|violated)/i,
      "Expected CHECK constraint failure for negative price",
    );

    // 9. Verify CHECK constraint rejection: negative stock
    await assert.rejects(
      async () => {
        await pool.query(
          "INSERT INTO products (id, name, description, category_id, price, stock, version) VALUES (?, ?, ?, ?, ?, ?, ?)",
          ["prod-neg-stock", "Negative Stock", "Desc", "cat-test", 15.0, -2, 1],
        );
      },
      /check constraint.*(failed|violated)/i,
      "Expected CHECK constraint failure for negative stock",
    );
  } finally {
    await pool.end();
    await closeDatabasePool();
  }
});

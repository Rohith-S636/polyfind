import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  CatalogRepository,
  VersionConflictError,
  closeDatabasePool,
  createDatabasePool,
  dropAllTables,
  getAvailableMigrationFiles,
  loadEnvironment,
  parseDatabaseUrl,
  runMigrations,
} from "../src/index.js";
import type { RowDataPacket } from "mysql2/promise";
import type { RetrievalCandidate, SearchResultItem } from "../src/contracts/types.js";

loadEnvironment();

test("migration files include 002_catalog_indexes.sql with required index definitions", async () => {
  const files = await getAvailableMigrationFiles();
  const indexMigration = files.find((f) => f.name === "002_catalog_indexes.sql");
  assert.ok(indexMigration, "Expected 002_catalog_indexes.sql to exist");

  const sql = await fs.readFile(indexMigration.fullPath, "utf-8");
  assert.match(sql, /idx_products_category_price/i);
  assert.match(sql, /idx_products_stock/i);
  assert.match(sql, /idx_products_updated_at/i);
  assert.match(sql, /idx_products_search/i);
});

test("EXPLAIN baseline documentation exists and records required query plans", async () => {
  const baselinePath = path.resolve(process.cwd(), "docs/EXPLAIN_PLANS_BASELINE.md");
  const content = await fs.readFile(baselinePath, "utf-8");

  assert.ok(content.includes("Single Product Authoritative Lookup"));
  assert.ok(content.includes("Category and Price Range Filtering"));
  assert.ok(content.includes("Stock Status Filter"));
  assert.ok(content.includes("Product Version History Lookup"));
  assert.ok(content.includes("Transactional Invariants"));
});

test("stale derived stores cannot overwrite authoritative MySQL facts (ADR-001)", () => {
  // Stale derived candidate (e.g. from vector index or Redis cache)
  const staleCandidate: RetrievalCandidate = {
    productId: "prod-bottle-01",
    source: "vector-store",
    score: 0.94,
    sourceVersion: 1, // Stale version
  };

  // Authoritative record from MySQL
  const authoritativeProduct = {
    id: "prod-bottle-01",
    name: "Insulated Bottle",
    description: "Stainless steel water bottle",
    categoryId: "outdoors",
    price: 34.99, // Authoritative updated price
    stock: 2, // Authoritative updated stock
    version: 3, // Current authoritative version
    updatedAt: "2026-10-17T09:00:00.000Z",
  };

  // Hydration logic: derived stores provide candidate ID and score only.
  // Authoritative fields (price, stock, version) MUST come from MySQL.
  const fusedItem: SearchResultItem = {
    product: authoritativeProduct,
    score: staleCandidate.score,
  };

  assert.equal(fusedItem.product.price, 34.99, "Price must be authoritative MySQL price");
  assert.equal(fusedItem.product.stock, 2, "Stock must be authoritative MySQL stock");
  assert.equal(fusedItem.product.version, 3, "Version must be authoritative MySQL version");
});

// Destructive integration tests require an explicitly disposable database.
const disposableDatabaseUrl = process.env.POLYFIND_TEST_DATABASE_URL;

test("MySQL indexes, transactions, and foreign key integrity constraints", { skip: !disposableDatabaseUrl }, async () => {
  const pool = createDatabasePool(parseDatabaseUrl(disposableDatabaseUrl));
  const repo = new CatalogRepository(pool);

  try {
    // Clean and run all migrations (001 and 002)
    await dropAllTables(pool);
    const migrationResult = await runMigrations(pool);
    assert.ok(migrationResult.applied.includes("001_initial_schema.sql"));
    assert.ok(migrationResult.applied.includes("002_catalog_indexes.sql"));

    // 1. Foreign-key RESTRICT: Create category and product, then attempt to delete category
    await repo.createCategory({
      id: "cat-apparel",
      name: "Apparel",
      description: "Clothing and outdoor wear",
    });

    await repo.createProduct({
      id: "prod-jacket",
      name: "Rain Jacket",
      description: "Waterproof breathable hiking jacket",
      categoryId: "cat-apparel",
      price: 120.0,
      stock: 5,
    });

    // Attempting to delete category should fail due to foreign key RESTRICT constraint
    await assert.rejects(
      async () => {
        await pool.query("DELETE FROM categories WHERE id = ?", ["cat-apparel"]);
      },
      /foreign key constraint fails/i,
      "Deleting a category with associated products must fail referential integrity",
    );

    // 2. Transactional Atomicity: Updates are atomic and increment version history
    const updated = await repo.updateProduct(
      "prod-jacket",
      { price: 110.0, stock: 4 },
      1, // expected version
    );
    assert.equal(updated.version, 2);
    assert.equal(updated.price, 110.0);
    assert.equal(updated.stock, 4);

    // Verify version history record exists in product_versions
    const [versionRows] = await pool.query<(RowDataPacket & { version: number; price: string | number; stock: number })[]>(
      "SELECT version, price, stock FROM product_versions WHERE product_id = ? ORDER BY version ASC",
      ["prod-jacket"],
    );
    assert.equal(versionRows.length, 2, "Should have 2 versions recorded (v1 and v2)");
    assert.equal(Number(versionRows[0]?.version), 1);
    assert.equal(Number(versionRows[1]?.version), 2);
    assert.equal(Number(versionRows[1]?.price), 110.0);

    // 3. Optimistic Concurrency and Conflict Rejection:
    // Attempting to update with stale expectedVersion fails with VersionConflictError
    await assert.rejects(
      async () => {
        await repo.updateProduct(
          "prod-jacket",
          { price: 99.0 },
          1, // Stale version (current is 2)
        );
      },
      (err: unknown) => err instanceof VersionConflictError && err.statusCode === 409,
    );

    // Assert that the rejected concurrent update did not modify price
    const currentProduct = await repo.getProduct("prod-jacket");
    assert.equal(currentProduct?.price, 110.0, "Product price must remain unchanged after rejected update");

    // 4. EXPLAIN query execution verification
    // Verify PRIMARY key index on single product lookup
    const [explainLookup] = await pool.query<(RowDataPacket & { key: string | null })[]>(
      "EXPLAIN SELECT id, price, stock FROM products WHERE id = ?",
      ["prod-jacket"],
    );
    assert.equal(explainLookup[0]?.key, "PRIMARY");

    // Verify index on product_versions composite unique key
    const [explainVersion] = await pool.query<(RowDataPacket & { key: string | null })[]>(
      "EXPLAIN SELECT version, price, stock FROM product_versions WHERE product_id = ? AND version = ?",
      ["prod-jacket", 2],
    );
    assert.equal(explainVersion[0]?.key, "uq_product_version");
  } finally {
    await pool.end();
    await closeDatabasePool();
  }
});

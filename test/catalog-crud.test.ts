import assert from "node:assert/strict";
import test from "node:test";
import {
  CatalogRepository,
  CatalogValidationError,
  NotFoundError,
  SafeDatabaseError,
  VersionConflictError,
  closeDatabasePool,
  createDatabasePool,
  dropAllTables,
  formatErrorResponse,
  handleCreateProduct,
  handleDeleteProduct,
  handleGetProduct,
  handleListProducts,
  handleUpdateProduct,
  loadEnvironment,
  parseDatabaseUrl,
  runMigrations,
  sanitizeDatabaseErrorMessage,
} from "../src/index.js";

loadEnvironment();

test("sanitizeDatabaseErrorMessage strips sensitive information and credentials", () => {
  const leakedError = new Error(
    "Connect failed for mysql://admin:super_secret_pwd@192.168.1.50:3306/polyfind using password: YES",
  );
  const sanitized = sanitizeDatabaseErrorMessage(leakedError);

  assert.ok(!sanitized.includes("super_secret_pwd"), "Leaked password must be redacted");
  assert.ok(!sanitized.includes("admin:"), "Leaked username must be redacted");
  assert.ok(!sanitized.includes("192.168.1.50"), "Internal IP address must be redacted");
  assert.equal(sanitized, "A database operation failed while executing a query.");
});

test("formatErrorResponse maps domain errors to correct HTTP status codes", () => {
  // 400 Validation
  const valRes = formatErrorResponse(new CatalogValidationError("Invalid price", [{ path: "price" }]));
  assert.equal(valRes.status, 400);
  assert.equal(valRes.body.error.code, "VALIDATION_ERROR");
  assert.ok(Array.isArray(valRes.body.error.issues));

  // 404 Not Found
  const notFoundRes = formatErrorResponse(new NotFoundError("Product", "prod-123"));
  assert.equal(notFoundRes.status, 404);
  assert.equal(notFoundRes.body.error.code, "NOT_FOUND");

  // 409 Conflict
  const conflictRes = formatErrorResponse(new VersionConflictError("prod-123", 2, 3));
  assert.equal(conflictRes.status, 409);
  assert.equal(conflictRes.body.error.code, "VERSION_CONFLICT");

  // 500 Safe Database Error
  const dbRes = formatErrorResponse(new Error("Internal fatal crash"));
  assert.equal(dbRes.status, 500);
  assert.equal(dbRes.body.error.code, "DATABASE_ERROR");
  assert.ok(!JSON.stringify(dbRes.body).includes("stack"));
});

test("handleListProducts validates input parameters and returns safe 4xx on invalid values", async () => {
  // Pass a dummy repo since validation occurs before repository calls
  const dummyRepo = {} as CatalogRepository;

  // Invalid page
  const pageRes = await handleListProducts(dummyRepo, { page: "-1" });
  assert.equal(pageRes.status, 400);

  // Invalid limit
  const limitRes = await handleListProducts(dummyRepo, { limit: "150" });
  assert.equal(limitRes.status, 400);

  // Invalid minPrice
  const priceRes = await handleListProducts(dummyRepo, { minPrice: "-10" });
  assert.equal(priceRes.status, 400);

  // Invalid inStock flag
  const stockRes = await handleListProducts(dummyRepo, { inStock: "maybe" });
  assert.equal(stockRes.status, 400);
});

test("handleGetProduct returns 400 on empty product ID", async () => {
  const dummyRepo = {} as CatalogRepository;
  const res = await handleGetProduct(dummyRepo, "   ");
  assert.equal(res.status, 400);
});

test("handleCreateProduct returns 400 on malformed body", async () => {
  const dummyRepo = {} as CatalogRepository;
  const res = await handleCreateProduct(dummyRepo, "not-an-object");
  assert.equal(res.status, 400);
});

// Destructive integration tests require an explicitly disposable database.
const disposableDatabaseUrl = process.env.POLYFIND_TEST_DATABASE_URL;

test("Catalog CRUD operations and filtering integration against clean MySQL", { skip: !disposableDatabaseUrl }, async () => {
  const pool = createDatabasePool(parseDatabaseUrl(disposableDatabaseUrl));
  const repo = new CatalogRepository(pool);

  try {
    // 1. Prepare clean schema
    await dropAllTables(pool);
    await runMigrations(pool);

    // 2. Insert test category
    await repo.createCategory({
      id: "cat-outdoors",
      name: "Outdoors",
      description: "Gear for outdoors",
    });

    // 3. CREATE product via API handler
    const createRes = await handleCreateProduct(repo, {
      id: "prod-bottle",
      name: "Stainless Bottle",
      description: "Double-walled vacuum insulated water bottle",
      categoryId: "cat-outdoors",
      price: 25.0,
      stock: 12,
    });
    assert.equal(createRes.status, 201);
    const createdItem = (createRes.body as { item: { id: string; version: number } }).item;
    assert.equal(createdItem.id, "prod-bottle");
    assert.equal(createdItem.version, 1);

    // 4. GET product
    const getRes = await handleGetProduct(repo, "prod-bottle");
    assert.equal(getRes.status, 200);
    const fetchedItem = (getRes.body as { item: { name: string; price: number } }).item;
    assert.equal(fetchedItem.name, "Stainless Bottle");
    assert.equal(fetchedItem.price, 25.0);

    // 5. GET non-existent product returns 404
    const get404Res = await handleGetProduct(repo, "prod-non-existent");
    assert.equal(get404Res.status, 404);

    // 6. LIST products with pagination and filters
    const listAllRes = await handleListProducts(repo, { page: "1", limit: "10" });
    assert.equal(listAllRes.status, 200);
    const listBody = listAllRes.body as { items: unknown[]; total: number };
    assert.equal(listBody.total, 1);
    assert.equal(listBody.items.length, 1);

    // Filter by category
    const catFilterRes = await handleListProducts(repo, { category: "cat-outdoors" });
    assert.equal((catFilterRes.body as { total: number }).total, 1);

    const wrongCatFilter = await handleListProducts(repo, { category: "cat-non-existent" });
    assert.equal((wrongCatFilter.body as { total: number }).total, 0);

    // Filter by price range
    const priceFilterRes = await handleListProducts(repo, { minPrice: "20", maxPrice: "30" });
    assert.equal((priceFilterRes.body as { total: number }).total, 1);

    const outOfRangeFilter = await handleListProducts(repo, { minPrice: "50" });
    assert.equal((outOfRangeFilter.body as { total: number }).total, 0);

    // 7. UPDATE product with version increment
    const updateRes = await handleUpdateProduct(
      repo,
      "prod-bottle",
      { price: 29.99, stock: 10 },
      1, // expectedVersion
    );
    assert.equal(updateRes.status, 200);
    const updatedBody = updateRes.body as { item: { price: number; version: number } };
    assert.equal(updatedBody.item.price, 29.99);
    assert.equal(updatedBody.item.version, 2);

    // 8. UPDATE with stale expectedVersion returns 409 Conflict
    const staleUpdateRes = await handleUpdateProduct(
      repo,
      "prod-bottle",
      { price: 35.0 },
      1, // stale expectedVersion (current is 2)
    );
    assert.equal(staleUpdateRes.status, 409);
    assert.equal((staleUpdateRes.body as { error: { code: string } }).error.code, "VERSION_CONFLICT");

    // 9. DELETE product
    const deleteRes = await handleDeleteProduct(repo, "prod-bottle");
    assert.equal(deleteRes.status, 200);

    // Verify deleted
    const getAfterDelete = await handleGetProduct(repo, "prod-bottle");
    assert.equal(getAfterDelete.status, 404);
  } finally {
    await pool.end();
    await closeDatabasePool();
  }
});

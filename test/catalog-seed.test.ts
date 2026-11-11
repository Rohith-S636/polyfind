import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  generateSeedDataset,
  validateSeedDataset,
} from "../src/index.js";

const repoRoot = path.resolve(import.meta.dirname, "..");
const provenanceDocPath = path.join(repoRoot, "docs/DATASET_PROVENANCE.md");

test("generateSeedDataset produces byte-for-byte identical datasets for the same seed", () => {
  const dataset1 = generateSeedDataset({ seed: 1234, productCount: 20 });
  const dataset2 = generateSeedDataset({ seed: 1234, productCount: 20 });

  assert.deepStrictEqual(dataset1, dataset2);
});

test("generateSeedDataset produces different datasets for different seeds", () => {
  const dataset1 = generateSeedDataset({ seed: 100, productCount: 15 });
  const dataset2 = generateSeedDataset({ seed: 200, productCount: 15 });

  assert.notDeepStrictEqual(dataset1.products, dataset2.products);
});

test("validateSeedDataset accepts valid generated dataset with 0 errors", () => {
  const dataset = generateSeedDataset({ seed: 42, productCount: 25 });
  const report = validateSeedDataset(dataset);

  assert.strictEqual(report.valid, true);
  assert.strictEqual(report.totalProducts, 25);
  assert.strictEqual(report.duplicateProductIds.length, 0);
  assert.strictEqual(report.orphanedProducts.length, 0);
  assert.strictEqual(report.issues.length, 0);
});

test("validateSeedDataset detects duplicate product IDs", () => {
  const dataset = generateSeedDataset({ seed: 42, productCount: 5 });
  // Intentionally duplicate the first product ID
  dataset.products.push({ ...dataset.products[0]! });

  const report = validateSeedDataset(dataset);
  assert.strictEqual(report.valid, false);
  assert.ok(report.duplicateProductIds.includes(dataset.products[0]!.id));
});

test("validateSeedDataset detects orphaned products with invalid category reference", () => {
  const dataset = generateSeedDataset({ seed: 42, productCount: 5 });
  dataset.products[0]!.categoryId = "cat-nonexistent";

  const report = validateSeedDataset(dataset);
  assert.strictEqual(report.valid, false);
  assert.ok(report.orphanedProducts.includes(dataset.products[0]!.id));
});

test("validateSeedDataset detects negative prices and negative stocks", () => {
  const dataset = generateSeedDataset({ seed: 42, productCount: 5 });
  dataset.products[0]!.price = -15.5;
  dataset.products[1]!.stock = -3;

  const report = validateSeedDataset(dataset);
  assert.strictEqual(report.valid, false);
  assert.ok(report.issues.some((i) => i.id === dataset.products[0]!.id && i.field === "price"));
  assert.ok(report.issues.some((i) => i.id === dataset.products[1]!.id && i.field === "stock"));
});

test("docs/DATASET_PROVENANCE.md documents provenance, license, schema distributions and invariants", () => {
  const provenance = fs.readFileSync(provenanceDocPath, "utf-8");

  assert.match(provenance, /Provenance and Licensing/i);
  assert.match(provenance, /CC0|MIT/i);
  assert.match(provenance, /Field Distributions and Invariants/i);
  assert.match(provenance, /Integrity Validation Rules/i);
});

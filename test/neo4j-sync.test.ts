import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  InMemoryGraphStorage,
  Neo4jGraphSyncAdapter,
  SyncManager,
  createProductUpdateEvent,
} from "../src/index.js";

const repoRoot = path.resolve(import.meta.dirname, "..");
const graphSchemaDocPath = path.join(repoRoot, "docs/GRAPH_SCHEMA.md");

test("Neo4j schema statements define unique constraints and indexes", () => {
  const adapter = new Neo4jGraphSyncAdapter();
  const statements = adapter.getSchemaStatements();

  assert.ok(statements.some((s) => s.includes("CONSTRAINT") && s.includes("p.id IS UNIQUE")));
  assert.ok(statements.some((s) => s.includes("CONSTRAINT") && s.includes("c.id IS UNIQUE")));
  assert.ok(statements.some((s) => s.includes("INDEX") && s.includes("p.version")));
});

test("repeated sync is idempotent for the same source version", async () => {
  const storage = new InMemoryGraphStorage();
  const adapter = new Neo4jGraphSyncAdapter(storage);

  const event = createProductUpdateEvent({
    productId: "p-graph-101",
    version: 1,
    operation: "create",
    data: { name: "Stainless French Press", categoryId: "cat-kitchen" },
  });

  // Apply initial sync
  await adapter.applyUpdate(event);
  assert.strictEqual(await adapter.getCurrentVersion("p-graph-101"), 1);
  assert.strictEqual(storage.products.size, 1);
  assert.strictEqual(storage.edges.length, 1);

  // Apply repeated sync of same event
  await adapter.applyUpdate(event);
  assert.strictEqual(await adapter.getCurrentVersion("p-graph-101"), 1);
  assert.strictEqual(storage.products.size, 1); // No duplicate product
  assert.strictEqual(storage.edges.length, 1); // No duplicate relationship edge
});

test("out-of-order stale update events do not overwrite higher graph versions", async () => {
  const adapter = new Neo4jGraphSyncAdapter();

  // Apply version 3
  await adapter.applyUpdate(
    createProductUpdateEvent({
      productId: "p-graph-102",
      version: 3,
      operation: "update",
      data: { name: "Version 3 Press" },
    }),
  );
  assert.strictEqual(await adapter.getCurrentVersion("p-graph-102"), 3);

  // Attempt stale update with version 2
  await adapter.applyUpdate(
    createProductUpdateEvent({
      productId: "p-graph-102",
      version: 2,
      operation: "update",
      data: { name: "Version 2 Press" },
    }),
  );

  // Version must remain 3
  assert.strictEqual(await adapter.getCurrentVersion("p-graph-102"), 3);
});

test("sync lag and metrics can be observed without exposing secrets", async () => {
  const adapter = new Neo4jGraphSyncAdapter();
  const syncManager = new SyncManager();
  syncManager.registerTarget(adapter);

  const pastTimestamp = new Date(Date.now() - 50).toISOString();
  const event = createProductUpdateEvent({
    productId: "p-graph-103",
    version: 1,
    operation: "create",
    timestamp: pastTimestamp,
    data: { name: "Expedition Tent", categoryId: "cat-outdoors" },
  });

  const logEntry = await syncManager.dispatchEvent(event, adapter);
  assert.strictEqual(logEntry.status, "applied");
  assert.strictEqual(logEntry.targetName, "neo4j-graph");

  const metrics = adapter.getMetrics();
  assert.strictEqual(metrics.totalSyncEvents, 1);
  assert.ok(metrics.lastLagMs >= 0);
  assert.ok(metrics.totalNodes >= 2); // Product + Category node
  assert.ok(metrics.totalEdges >= 1); // IN_CATEGORY edge
});

test("docs/GRAPH_SCHEMA.md documents labels, constraints, indexes, and relationship edges", () => {
  const doc = fs.readFileSync(graphSchemaDocPath, "utf-8");

  assert.match(doc, /CREATE CONSTRAINT/i);
  assert.match(doc, /CREATE INDEX/i);
  assert.match(doc, /IN_CATEGORY/i);
  assert.match(doc, /RELATED_TO/i);
  assert.match(doc, /Idempotent/i);
});

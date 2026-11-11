import assert from "node:assert/strict";
import test from "node:test";
import {
  SyncManager,
  createProductUpdateEvent,
  type DerivedStoreSyncTarget,
  type ProductUpdateEvent,
} from "../src/index.js";
import type { ProductId, SourceVersion } from "../src/contracts/types.js";

test("product changes advance a documented monotonic version and validate event fields", () => {
  const event1 = createProductUpdateEvent({
    productId: "prod-tent",
    version: 1,
    operation: "create",
    data: { name: "2-Person Camping Tent", price: 150 },
  });

  assert.equal(event1.productId, "prod-tent");
  assert.equal(event1.version, 1);
  assert.equal(event1.operation, "create");
  assert.equal(event1.data.price, 150);

  const event2 = createProductUpdateEvent({
    productId: "prod-tent",
    version: 2,
    previousVersion: 1,
    operation: "update",
    data: { price: 165 },
  });

  assert.equal(event2.version, 2);
  assert.equal(event2.previousVersion, 1);
  assert.ok(event2.version > event1.version, "Version must advance monotonically");

  // Validation rejections
  assert.throws(
    () => createProductUpdateEvent({ productId: "", version: 1, operation: "create" }),
    /non-empty productId/i,
  );
  assert.throws(
    () => createProductUpdateEvent({ productId: "prod-tent", version: 0, operation: "create" }),
    /positive integer version/i,
  );
  assert.throws(
    () => createProductUpdateEvent({ productId: "prod-tent", version: -1, operation: "create" }),
    /positive integer version/i,
  );
});

test("update events can be retried idempotently without applying the same version twice", async () => {
  let appliedCount = 0;
  let targetVersion: SourceVersion | null = null;

  const mockDerivedStore: DerivedStoreSyncTarget = {
    name: "mock-redis-cache",
    async getCurrentVersion(_id: ProductId): Promise<SourceVersion | null> {
      return targetVersion;
    },
    async applyUpdate(event: ProductUpdateEvent): Promise<void> {
      appliedCount += 1;
      targetVersion = event.version;
    },
  };

  const syncManager = new SyncManager();
  syncManager.registerTarget(mockDerivedStore);

  const event = createProductUpdateEvent({
    eventId: "evt-tent-v2",
    productId: "prod-tent",
    version: 2,
    operation: "update",
    data: { price: 165 },
  });

  // 1. Initial application
  const log1 = await syncManager.dispatchEvent(event, mockDerivedStore);
  assert.equal(log1.status, "applied");
  assert.equal(appliedCount, 1);
  assert.equal(targetVersion, 2);

  // 2. Duplicate dispatch / retry of same version:
  // Must NOT apply twice; should detect target version >= event version and skip
  const log2 = await syncManager.dispatchEvent(event, mockDerivedStore);
  assert.equal(log2.status, "skipped_duplicate");
  assert.equal(appliedCount, 1, "applyUpdate must not be called again for duplicate version");

  // 3. Stale event dispatch (e.g. v1 arrives after v2 is already applied)
  const staleEvent = createProductUpdateEvent({
    eventId: "evt-tent-v1-delayed",
    productId: "prod-tent",
    version: 1,
    operation: "update",
    data: { price: 150 },
  });
  const log3 = await syncManager.dispatchEvent(staleEvent, mockDerivedStore);
  assert.equal(log3.status, "skipped_duplicate");
  assert.equal(appliedCount, 1, "applyUpdate must not apply a stale version");
});

test("failed updates are observable and can be retried upon store recovery", async () => {
  let shouldFail = true;
  let targetVersion: SourceVersion | null = null;

  const mockDerivedStore: DerivedStoreSyncTarget = {
    name: "mock-neo4j-graph",
    async getCurrentVersion(_id: ProductId): Promise<SourceVersion | null> {
      return targetVersion;
    },
    async applyUpdate(event: ProductUpdateEvent): Promise<void> {
      if (shouldFail) {
        throw new Error("Neo4j database cluster unreachable");
      }
      targetVersion = event.version;
    },
  };

  const syncManager = new SyncManager();
  syncManager.registerTarget(mockDerivedStore);

  const event = createProductUpdateEvent({
    eventId: "evt-prod-100-v1",
    productId: "prod-100",
    version: 1,
    operation: "create",
    data: { name: "Headlamp" },
  });

  // 1. First dispatch fails due to transient connection failure
  const failLog = await syncManager.dispatchEvent(event, mockDerivedStore);
  assert.equal(failLog.status, "failed");
  assert.equal(failLog.attempts, 1);
  assert.ok(failLog.error?.includes("Neo4j database cluster unreachable"));

  // 2. Failure is observable in getFailedUpdates()
  const failedList = syncManager.getFailedUpdates();
  assert.equal(failedList.length, 1);
  assert.equal(failedList[0]?.eventId, "evt-prod-100-v1");
  assert.equal(failedList[0]?.targetName, "mock-neo4j-graph");

  // 3. Store recovers, and retry is executed
  shouldFail = false;
  const retryLog = await syncManager.retryFailedUpdate("evt-prod-100-v1", "mock-neo4j-graph");
  assert.equal(retryLog.status, "applied");
  assert.equal(retryLog.attempts, 2);
  assert.equal(targetVersion, 1);

  // 4. Failed updates list is now cleared
  assert.equal(syncManager.getFailedUpdates().length, 0);
});

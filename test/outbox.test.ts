import assert from "node:assert/strict";
import test from "node:test";
import {
  OutboxWorker,
  PermanentOutboxError,
  RedisOutboxTarget,
  SkippedOutboxError,
  UnavailableOutboxTarget,
  createProductOutboxEvent,
  type OutboxDelivery,
  type OutboxStore,
  type OutboxTarget,
} from "../src/index.js";

class FakeOutboxStore implements OutboxStore {
  private readonly queue: OutboxDelivery[] = [];
  readonly applied: string[] = [];
  readonly failures: string[] = [];
  renewals = 0;
  private readonly claimed = new Set<string>();

  constructor(deliveries: OutboxDelivery[]) {
    this.queue.push(...deliveries);
  }

  async claim(targetName: "redis" | "neo4j" | "lancedb", workerId: string, _leaseMs: number): Promise<OutboxDelivery | null> {
    const delivery = this.queue.find((candidate) =>
      candidate.targetName === targetName &&
      !this.claimed.has(`${candidate.event.eventId}:${targetName}`),
    );
    if (!delivery) return null;
    this.claimed.add(`${delivery.event.eventId}:${targetName}`);
    return {
      ...delivery,
      status: "processing",
      attemptCount: delivery.attemptCount + 1,
      leaseOwner: workerId,
    };
  }

  async markApplied(delivery: OutboxDelivery, _workerId: string): Promise<boolean> {
    this.applied.push(`${delivery.event.eventId}:${delivery.targetName}`);
    this.claimed.delete(`${delivery.event.eventId}:${delivery.targetName}`);
    return true;
  }

  async markFailed(delivery: OutboxDelivery, _workerId: string, _error: string, _retryable: boolean): Promise<boolean> {
    this.failures.push(`${delivery.event.eventId}:${delivery.targetName}`);
    this.claimed.delete(`${delivery.event.eventId}:${delivery.targetName}`);
    return true;
  }

  async renewLease(): Promise<boolean> {
    this.renewals += 1;
    return true;
  }

  async replay(): Promise<boolean> {
    return true;
  }

  async getHealth() {
    return { pending: 0, failed: this.failures.length, deadLetter: 0, oldestPendingAgeMs: null };
  }
}

function delivery(targetName: "redis" | "neo4j" | "lancedb"): OutboxDelivery {
  return {
    event: createProductOutboxEvent({
      id: "outbox-test-product",
      name: "Outbox test",
      description: "Test",
      categoryId: "test",
      price: 1,
      stock: 1,
      version: 1,
      updatedAt: new Date().toISOString(),
    }, "updated"),
    targetName,
    status: "pending",
    attemptCount: 0,
    nextAttemptAt: null,
    leaseOwner: null,
    leaseExpiresAt: null,
  };
}

test("outbox worker delivers targets independently", async () => {
  const store = new FakeOutboxStore([delivery("redis"), delivery("neo4j"), delivery("lancedb")]);
  const targets: OutboxTarget[] = [
    { name: "redis", deliver: async () => undefined },
    { name: "neo4j", deliver: async () => { throw new Error("neo4j unavailable"); } },
    { name: "lancedb", deliver: async () => undefined },
  ];
  const worker = new OutboxWorker({ store, targets, workerId: "worker-test", baseRetryMs: 1 });
  assert.equal(await worker.processOnce(), 3);
  assert.deepEqual(store.applied.map((value) => value.split(":")[1]), ["redis", "lancedb"]);
  assert.deepEqual(store.failures.map((value) => value.split(":")[1]), ["neo4j"]);
});

test("permanent outbox failures are sent to terminal handling", async () => {
  const store = new FakeOutboxStore([delivery("redis")]);
  const worker = new OutboxWorker({
    store,
    targets: [{ name: "redis", deliver: async () => { throw new PermanentOutboxError("malformed payload"); } }],
  });
  await worker.processOnce();
  assert.equal(store.failures.length, 1);
});

test("outbox worker start and stop are idempotent", async () => {
  const store = new FakeOutboxStore([]);
  const worker = new OutboxWorker({ store, targets: [] });
  worker.start(1);
  worker.start(1);
  assert.equal(worker.isRunning(), true);
  await worker.stop();
  await worker.stop();
  assert.equal(worker.isRunning(), false);
});

test("Redis invalidation outage is not acknowledged as applied", async () => {
  const store = new FakeOutboxStore([delivery("redis")]);
  const cache = {
    get: async () => null,
    set: async () => undefined,
    invalidateProduct: async () => 0,
    invalidateListings: async () => 0,
    invalidateProductStrict: async () => { throw new Error("Redis is unavailable."); },
    invalidateListingsStrict: async () => 0,
  };
  const worker = new OutboxWorker({
    store,
    targets: [new RedisOutboxTarget(cache)],
  });
  await worker.processOnce();
  assert.deepEqual(store.applied, []);
  assert.equal(store.failures[0]?.endsWith(":redis"), true);
});

test("unavailable target remains retryable and can recover", async () => {
  const store = new FakeOutboxStore([delivery("neo4j")]);
  let available = false;
  const unavailable = new UnavailableOutboxTarget("neo4j", "not connected");
  const recoveringTarget: OutboxTarget = {
    name: "neo4j",
    deliver: async () => {
      if (!available) return unavailable.deliver();
    },
  };
  const worker = new OutboxWorker({ store, targets: [recoveringTarget] });
  await worker.processOnce();
  available = true;
  assert.equal(await worker.processOnce(), 1);
  assert.equal(store.failures.length, 1);
  assert.equal(store.applied.length, 1);
});

test("unrelated vector events are explicitly skipped", async () => {
  const store = new FakeOutboxStore([delivery("lancedb")]);
  const target: OutboxTarget = {
    name: "lancedb",
    deliver: async () => { throw new SkippedOutboxError("offer does not change product text"); },
  };
  const worker = new OutboxWorker({ store, targets: [target] });
  await worker.processOnce();
  assert.equal(store.applied[0]?.endsWith(":lancedb"), true);
});

test("active delivery renews its lease before acknowledgement", async () => {
  const store = new FakeOutboxStore([delivery("neo4j")]);
  const worker = new OutboxWorker({
    store,
    leaseMs: 1_100,
    targets: [{
      name: "neo4j",
      deliver: async () => {
        await new Promise((resolve) => setTimeout(resolve, 650));
      },
    }],
  });
  await worker.processOnce();
  assert.ok(store.renewals >= 1);
  assert.equal(store.applied.length, 1);
});

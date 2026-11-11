import assert from "node:assert/strict";
import test from "node:test";
import {
  closeNeo4j,
  initializeNeo4j,
  type Neo4jLifecycleAdapter,
} from "../src/index.js";

class FakeNeo4jAdapter implements Neo4jLifecycleAdapter {
  status: "disconnected" | "connecting" | "connected" | "unavailable" = "disconnected";
  closeCount = 0;
  constructor(private readonly failConnect = false) {}
  async connect(): Promise<void> {
    if (this.failConnect) {
      this.status = "unavailable";
      throw new Error("unavailable");
    }
    this.status = "connected";
  }
  async initializeSchema(): Promise<void> {}
  async close(): Promise<void> {
    this.closeCount += 1;
    this.status = "disconnected";
  }
  getStatus() {
    return this.status;
  }
}

test("Neo4j lifecycle does not require Redis configuration", async () => {
  const lifecycle = await initializeNeo4j(
    {
      NEO4J_URI: "bolt://neo4j",
      NEO4J_USERNAME: "neo4j",
      NEO4J_PASSWORD: "password",
    },
    () => new FakeNeo4jAdapter(),
  );

  assert.equal(lifecycle.status, "available");
  assert.equal(lifecycle.graph?.getStatus(), "connected");
  await closeNeo4j(lifecycle.graph);
  assert.equal(lifecycle.graph?.getStatus(), "disconnected");
});

test("Neo4j lifecycle reports missing configuration without creating an adapter", async () => {
  const lifecycle = await initializeNeo4j({}, () => {
    throw new Error("adapter should not be created");
  });

  assert.equal(lifecycle.status, "not-configured");
  assert.equal(lifecycle.graph, undefined);
});

test("Neo4j lifecycle closes an adapter after initialization failure", async () => {
  let adapter: FakeNeo4jAdapter | undefined;
  const lifecycle = await initializeNeo4j(
    {
      NEO4J_URI: "bolt://neo4j",
      NEO4J_USERNAME: "neo4j",
      NEO4J_PASSWORD: "password",
    },
    () => {
      adapter = new FakeNeo4jAdapter(true);
      return adapter;
    },
  );

  assert.equal(lifecycle.status, "unavailable");
  assert.equal(adapter?.closeCount, 1);
});

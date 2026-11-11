import assert from "node:assert/strict";
import test from "node:test";
import {
  BaselineFusionStrategy,
  GraphRetrievalAdapter,
  InMemoryGraphStorage,
  fuseBaselineCandidates,
} from "../src/index.js";

test("graph retrieval returns stable product IDs, graph source metadata, and related candidates", async () => {
  const storage = new InMemoryGraphStorage();
  storage.categories.set("cat-outdoors", { id: "cat-outdoors", name: "Outdoors" });
  storage.products.set("prod-seed", {
    id: "prod-seed",
    name: "Waterproof Backpack",
    version: 4,
    categoryId: "cat-outdoors",
  });
  storage.products.set("prod-related", {
    id: "prod-related",
    name: "Trail Repair Kit",
    version: 2,
    categoryId: "cat-outdoors",
  });
  storage.edges.push(
    { fromId: "prod-seed", toId: "cat-outdoors", type: "IN_CATEGORY" },
    { fromId: "prod-seed", toId: "prod-related", type: "RELATED_TO", weight: 0.8 },
  );

  const result = await new GraphRetrievalAdapter(storage).retrieve({
    query: "waterproof backpack",
    filters: {},
    limit: 10,
  });

  assert.deepEqual(
    result.candidates.map((candidate) => candidate.productId),
    ["prod-seed", "prod-related"],
  );
  assert.deepEqual(
    result.candidates.map((candidate) => candidate.source),
    ["graph", "graph"],
  );
  assert.equal(result.candidates[0]?.sourceVersion, 4);
  assert.ok(result.candidates[1]?.score !== undefined);
});

test("baseline fusion deduplicates deterministically and prefers SQL on score ties", () => {
  const inputs = {
    sql: [
      { productId: "prod-b", source: "sql", score: 0.8, sourceVersion: 3 },
      { productId: "prod-a", source: "sql", score: 0.8, sourceVersion: 1 },
    ],
    vector: [
      { productId: "prod-b", source: "vector-semantic", score: 0.8, sourceVersion: 4 },
      { productId: "prod-c", source: "vector-semantic", score: 0.8 },
    ],
    graph: [{ productId: "prod-c", source: "graph", score: 0.8, sourceVersion: 2 }],
  };

  const first = fuseBaselineCandidates(inputs);
  const second = new BaselineFusionStrategy().fuse({
    sql: [...inputs.sql].reverse(),
    vector: [...inputs.vector].reverse(),
    graph: [...inputs.graph].reverse(),
  });

  assert.deepEqual(first, second);
  assert.deepEqual(
    first.map((candidate) => candidate.productId),
    ["prod-a", "prod-b", "prod-c"],
  );
  assert.deepEqual(first[1]?.sources, ["sql", "vector-semantic"]);
  assert.equal(first[1]?.score, 0.8);
});

test("baseline fusion applies a positive limit after deterministic ranking", () => {
  const result = fuseBaselineCandidates(
    {
      sql: [{ productId: "prod-1", source: "sql", score: 0.9 }],
      vector: [{ productId: "prod-2", source: "vector", score: 0.8 }],
      graph: [{ productId: "prod-3", source: "graph", score: 0.7 }],
    },
    { limit: 2 },
  );

  assert.deepEqual(
    result.map((candidate) => candidate.productId),
    ["prod-1", "prod-2"],
  );
});


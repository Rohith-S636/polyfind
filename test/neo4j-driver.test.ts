import assert from "node:assert/strict";
import test from "node:test";
import type { Driver, ManagedTransaction, Session } from "neo4j-driver";
import { Neo4jGraphAdapter, type GraphOfferProjection, type GraphVariantProjection } from "../src/index.js";

function createRecordingAdapter(options: { fail?: boolean } = {}) {
  const queries: Array<{ query: string; parameters: Record<string, unknown> }> = [];
  const reads: Array<{ query: string; parameters: Record<string, unknown> }> = [];
  const transaction = {
    run: async (query: string, parameters: Record<string, unknown> = {}) => {
      queries.push({ query, parameters });
      if (options.fail) throw new Error("projection failed");
      return { records: [{ get: () => undefined }] };
    },
  } as unknown as ManagedTransaction;
  const session = {
    executeWrite: async <T>(work: (tx: ManagedTransaction) => Promise<T>) => work(transaction),
    run: async (query: string, parameters: Record<string, unknown> = {}) => {
      reads.push({ query, parameters });
      return { records: [] };
    },
    close: async () => {},
  } as unknown as Session;
  const driver = {
    session: () => session,
    verifyConnectivity: async () => {},
    close: async () => {},
  } as unknown as Driver;

  return {
    adapter: new Neo4jGraphAdapter({
      uri: "bolt://test",
      username: "test",
      password: "test",
    }, driver),
    queries,
    reads,
  };
}

const variant: GraphVariantProjection = {
  sourceId: "variant-1",
  productId: "product-2",
  sku: "SKU-1",
  sourceVersion: 2,
  status: "active",
};

const offer: GraphOfferProjection = {
  sourceId: "offer-1",
  productId: "product-2",
  sellerId: "seller-2",
  variantId: null,
  sourceVersion: 2,
  status: "available",
};

test("variant projection removes old ownership before creating current ownership", async () => {
  const { adapter, queries } = createRecordingAdapter();
  await adapter.connect();
  await adapter.upsertVariant(variant);

  assert.match(queries[1]?.query ?? "", /OPTIONAL MATCH \(old:Product\)-\[relationship:HAS_VARIANT\]->\(v\)/);
  assert.match(queries[2]?.query ?? "", /MERGE \(p\)-\[:HAS_VARIANT\]->\(v\)/);
  assert.equal(queries[2]?.parameters.productId, "product-2");
});

test("offer projection removes obsolete associations and omits absent variant edges", async () => {
  const { adapter, queries } = createRecordingAdapter();
  await adapter.connect();
  await adapter.upsertOffer(offer);

  assert.match(queries[1]?.query ?? "", /type\(relationship\) IN \['OFFER_FOR', 'PROVIDED_BY', 'OFFER_FOR_VARIANT'\]/);
  assert.match(queries[1]?.query ?? "", /collect\(relationship\)/);
  assert.match(queries[2]?.query ?? "", /MERGE \(o\)-\[:OFFER_FOR\]->\(p\)/);
  assert.equal(queries.length, 3);
});

test("product deletion removes dependents and writes a versioned tombstone", async () => {
  const { adapter, queries } = createRecordingAdapter();
  await adapter.connect();
  await adapter.applyUpdate({
    eventId: "delete-1",
    productId: "product-1",
    version: 3,
    operation: "delete",
    timestamp: new Date().toISOString(),
    data: {},
  });

  assert.match(queries[0]?.query ?? "", /ProductVariant.*productId/);
  assert.match(queries[1]?.query ?? "", /Offer.*productId/);
  assert.match(queries[2]?.query ?? "", /Product[\s\S]*sourceId[\s\S]*sourceVersion[\s\S]*status = 'deleted'/);
  assert.match(queries[2]?.query ?? "", /MERGE \(p:Product/);
});

test("projection errors propagate to the caller", async () => {
  const { adapter } = createRecordingAdapter({ fail: true });
  await adapter.connect();

  await assert.rejects(
    adapter.upsertVariant(variant),
    /Neo4j operation failed|projection failed/,
  );
});


test("Neo4j graph retrieval uses parameterized query tokens and category constraints", async () => {
  const { adapter, reads } = createRecordingAdapter();
  await adapter.connect();
  const candidates = await adapter.retrieveCandidates("trail tent", "cat-outdoors", 25);
  assert.deepEqual(candidates, []);
  assert.equal(reads.length, 1);
  assert.match(reads[0]!.query, /IN_CATEGORY/);
  assert.match(reads[0]!.query, /\$tokens/);
  assert.deepEqual(reads[0]!.parameters.tokens, ["trail", "tent"]);
  assert.equal(reads[0]!.parameters.categoryId, "cat-outdoors");
  assert.equal(Number(reads[0]!.parameters.limit), 25);
});

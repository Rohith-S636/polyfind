import assert from "node:assert/strict";
import test from "node:test";
import neo4j from "neo4j-driver";
import { Neo4jGraphAdapter } from "../src/index.js";
import { createProductUpdateEvent } from "../src/index.js";

const uri = process.env.POLYFIND_NEO4J_TEST_URI;
const username = process.env.POLYFIND_NEO4J_TEST_USERNAME ?? process.env.NEO4J_USERNAME;
const password = process.env.POLYFIND_NEO4J_TEST_PASSWORD ?? process.env.NEO4J_PASSWORD;

test("real Neo4j projection is idempotent and version-aware", { skip: !uri || !username || !password }, async () => {
  const database = process.env.POLYFIND_NEO4J_TEST_DATABASE ?? process.env.NEO4J_DATABASE;
  const adapter = new Neo4jGraphAdapter({
    uri: uri!,
    username: username!,
    password: password!,
    ...(database ? { database } : {}),
  });
  const productId = `polyfind-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const categoryId = `${productId}-category`;
  let connected = false;
  try {
    await adapter.connect();
    connected = true;
    await adapter.initializeSchema();
    await adapter.applyUpdate(createProductUpdateEvent({
      productId,
      version: 1,
      operation: "create",
      data: { name: "Neo4j integration fixture", categoryId },
    }));
    await adapter.applyUpdate(createProductUpdateEvent({
      productId,
      version: 1,
      operation: "create",
      data: { name: "Neo4j integration fixture", categoryId },
    }));
    assert.equal(await adapter.getCurrentVersion(productId), 1);
    assert.deepEqual(await adapter.getProductCategoryIds(productId), [categoryId]);

    await adapter.applyUpdate(createProductUpdateEvent({
      productId,
      version: 2,
      operation: "update",
      data: { name: "Neo4j integration fixture v2" },
    }));
    assert.equal(await adapter.getCurrentVersion(productId), 2);
    assert.deepEqual(await adapter.getProductCategoryIds(productId), [categoryId]);

    await adapter.applyUpdate(createProductUpdateEvent({
      productId,
      version: 1,
      operation: "update",
      data: { name: "stale fixture" },
    }));
    assert.equal(await adapter.getCurrentVersion(productId), 2);
  } finally {
    if (connected) {
      await adapter.applyUpdate({
        eventId: `${productId}-delete`,
        productId,
        version: 2,
        operation: "delete",
        timestamp: new Date().toISOString(),
        data: {},
      });
    }
    await adapter.close();
  }
});

test("real Neo4j projection reconciles relationships and cleans owned nodes", { skip: !uri || !username || !password }, async () => {
  const database = process.env.POLYFIND_NEO4J_TEST_DATABASE ?? process.env.NEO4J_DATABASE;
  const adapter = new Neo4jGraphAdapter({
    uri: uri!,
    username: username!,
    password: password!,
    ...(database ? { database } : {}),
  });
  const driver = neo4j.driver(uri!, neo4j.auth.basic(username!, password!));
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const productId = `polyfind-delete-${suffix}`;
  const otherProductId = `polyfind-other-${suffix}`;
  const categoryId = `polyfind-category-${suffix}`;
  const sellerId = `polyfind-seller-${suffix}`;
  const otherSellerId = `polyfind-other-seller-${suffix}`;
  const variantId = `polyfind-variant-${suffix}`;
  const ownedVariantId = `polyfind-owned-variant-${suffix}`;
  const offerId = `polyfind-offer-${suffix}`;
  const ownedOfferId = `polyfind-owned-offer-${suffix}`;
  const otherOfferId = `polyfind-other-offer-${suffix}`;
  let connected = false;
  try {
    await adapter.connect();
    connected = true;
    await adapter.initializeSchema();
    await adapter.upsertProduct({
      sourceId: productId,
      name: "Owned product",
      sourceVersion: 1,
      category: { sourceId: categoryId, name: "Fixture category" },
    });
    await adapter.upsertProduct({ sourceId: otherProductId, name: "Other product", sourceVersion: 1 });
    await adapter.upsertSeller({ sourceId: sellerId, name: "Fixture seller" });
    await adapter.upsertSeller({ sourceId: otherSellerId, name: "Other seller" });
    await adapter.upsertVariant({ sourceId: variantId, productId, sourceVersion: 1, status: "active" });
    await adapter.upsertVariant({ sourceId: ownedVariantId, productId, sourceVersion: 1, status: "active" });
    await adapter.upsertOffer({
      sourceId: offerId,
      productId,
      sellerId,
      variantId,
      sourceVersion: 1,
      status: "available",
    });
    await adapter.upsertOffer({
      sourceId: ownedOfferId,
      productId,
      sellerId,
      sourceVersion: 1,
      status: "available",
    });
    await adapter.upsertOffer({
      sourceId: otherOfferId,
      productId: otherProductId,
      sellerId: otherSellerId,
      sourceVersion: 1,
      status: "available",
    });

    await adapter.upsertVariant({ sourceId: variantId, productId: otherProductId, sourceVersion: 2, status: "active" });
    await adapter.upsertOffer({
      sourceId: offerId,
      productId: otherProductId,
      sellerId: otherSellerId,
      sourceVersion: 2,
      status: "available",
    });
    await adapter.upsertOffer({
      sourceId: offerId,
      productId: otherProductId,
      sellerId: otherSellerId,
      variantId: null,
      sourceVersion: 3,
      status: "available",
    });

    const session = driver.session(database ? { database } : undefined);
    try {
      const result = await session.run(
        `MATCH (v:ProductVariant {sourceId: $variantId})-[:HAS_VARIANT]-(:Product),
               (o:Offer {sourceId: $offerId})
         OPTIONAL MATCH (o)-[variantRelationship:OFFER_FOR_VARIANT]->()
         RETURN count(v) AS variantCount, count(variantRelationship) AS variantRelationshipCount`,
        { variantId, offerId },
      );
      assert.equal(result.records[0]?.get("variantCount").toNumber(), 1);
      assert.equal(result.records[0]?.get("variantRelationshipCount").toNumber(), 0);

      await adapter.applyUpdate(createProductUpdateEvent({
        productId,
        version: 2,
        operation: "delete",
        data: {},
      }));

      const remaining = await session.run(
        `RETURN
           exists { MATCH (:Product {sourceId: $productId}) } AS productExists,
           exists { MATCH (:ProductVariant {sourceId: $variantId}) } AS variantExists,
           exists { MATCH (:ProductVariant {sourceId: $ownedVariantId}) } AS ownedVariantExists,
           exists { MATCH (:Offer {sourceId: $offerId}) } AS offerExists,
           exists { MATCH (:Offer {sourceId: $ownedOfferId}) } AS ownedOfferExists,
           exists { MATCH (:Offer {sourceId: $otherOfferId}) } AS otherOfferExists,
           exists { MATCH (:Seller {sourceId: $sellerId}) } AS sellerExists,
           exists { MATCH (:Category {sourceId: $categoryId}) } AS categoryExists`,
        { productId, variantId, ownedVariantId, offerId, ownedOfferId, otherOfferId, sellerId, categoryId },
      );
      const record = remaining.records[0];
      assert.equal(record?.get("productExists"), false);
      assert.equal(record?.get("variantExists"), true);
      assert.equal(record?.get("ownedVariantExists"), false);
      assert.equal(record?.get("offerExists"), true);
      assert.equal(record?.get("ownedOfferExists"), false);
      assert.equal(record?.get("otherOfferExists"), true);
      assert.equal(record?.get("sellerExists"), true);
      assert.equal(record?.get("categoryExists"), true);
    } finally {
      await session.close();
    }
  } finally {
    if (connected) {
      const cleanup = driver.session(database ? { database } : undefined);
      try {
        await cleanup.run(
          `MATCH (n)
           WHERE n.sourceId IN [$productId, $otherProductId, $categoryId, $sellerId,
             $otherSellerId, $variantId, $ownedVariantId, $offerId, $ownedOfferId, $otherOfferId]
           DETACH DELETE n`,
          {
            productId,
            otherProductId,
            categoryId,
            sellerId,
            otherSellerId,
            variantId,
            ownedVariantId,
            offerId,
            ownedOfferId,
            otherOfferId,
          },
        );
      } finally {
        await cleanup.close();
      }
    }
    await adapter.close();
    await driver.close();
  }
});

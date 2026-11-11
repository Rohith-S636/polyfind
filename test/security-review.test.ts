import assert from "node:assert/strict";
import test from "node:test";
import {
  executeRetrievalAdapter,
  formatErrorResponse,
  redactSecret,
  sanitizeDatabaseErrorMessage,
  sanitizeOperationalError,
  validateEnvironment,
  type RetrievalProvider,
} from "../src/index.js";

test("connection credentials are redacted before logging or returning errors", () => {
  const connectionString = "redis://service:super-secret@cache.internal:6379/0";
  const redacted = redactSecret(connectionString);

  assert.equal(redacted.includes("super-secret"), false);
  assert.equal(redacted.includes("service"), false);
  assert.match(redacted, /cache\.internal/);

  const operational = sanitizeOperationalError(
    new Error("neo4j://neo4j:graph-secret@graph.internal:7687 password=graph-secret"),
  );
  assert.equal(operational.includes("graph-secret"), false);
  assert.equal(operational.includes("graph.internal"), false);
});

test("retrieval failures expose stable safe payloads without stack traces", async () => {
  const adapter: RetrievalProvider = {
    name: "vector-semantic",
    async retrieve() {
      throw new Error(
        "VECTOR_STORE_URL=redis://user:vector-secret@vector.internal:6379 token=token-secret",
      );
    },
  };

  const result = await executeRetrievalAdapter(adapter, {
    query: "safe query",
    filters: {},
    limit: 5,
  });

  assert.equal(result.success, false);
  assert.equal(result.error?.code, "ADAPTER_RETRIEVAL_FAILED");
  assert.equal(result.error?.message.includes("vector-secret"), false);
  assert.equal(result.error?.message.includes("token-secret"), false);
  assert.equal(result.error?.message.includes("stack"), false);
});

test("unexpected API errors use safe database messages", () => {
  const response = formatErrorResponse(
    new Error("mysql://admin:db-secret@db.internal:3306/polyfind password=db-secret"),
  );

  assert.equal(response.status, 500);
  assert.equal(response.body.error.code, "DATABASE_ERROR");
  assert.equal(response.body.error.message.includes("db-secret"), false);
  assert.equal(response.body.error.message.includes("db.internal"), false);
  assert.equal("stack" in response.body.error, false);
});

test("environment validation reports missing names without values", () => {
  assert.throws(
    () =>
      validateEnvironment(
        {
          NODE_ENV: "test",
          DATABASE_URL: undefined,
          NEO4J_URI: undefined,
          NEO4J_USERNAME: undefined,
          NEO4J_PASSWORD: undefined,
        },
        { requiredStores: ["mysql", "neo4j"] },
      ),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message.includes("DATABASE_URL"), true);
      assert.equal(error.message.includes("NEO4J_URI"), true);
      assert.equal(error.message.includes("NEO4J_USERNAME"), true);
      assert.equal(error.message.includes("NEO4J_PASSWORD"), true);
      return true;
    },
  );
});

test("database sanitizer never returns the original internal error", () => {
  const message = sanitizeDatabaseErrorMessage(
    new Error("password='secret' at mysql://admin:secret@db.internal:3306/polyfind"),
  );
  assert.equal(message, "A database operation failed while executing a query.");
  assert.equal(message.includes("secret"), false);
});

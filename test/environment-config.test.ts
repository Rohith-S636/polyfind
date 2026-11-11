import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  ConfigurationError,
  redactSecret,
  validateEnvironment,
} from "../src/index.js";

const repoRoot = path.resolve(import.meta.dirname, "..");
const envExamplePath = path.join(repoRoot, ".env.example");
const localSetupPath = path.join(repoRoot, "docs/LOCAL_SETUP.md");

test("redactSecret properly redacts passwords from connection URLs", () => {
  const urlWithPassword = "mysql://user:supersecretpass@localhost:3306/mydb";
  const redacted = redactSecret(urlWithPassword);
  assert.strictEqual(redacted.includes("supersecretpass"), false);
  assert.strictEqual(redacted.includes("******"), true);
});

test("redactSecret properly redacts non-URL secret tokens", () => {
  const secret = "my_api_key_123456789";
  const redacted = redactSecret(secret);
  assert.strictEqual(redacted.includes("123456789"), false);
  assert.strictEqual(redacted.includes("******"), true);
});

test("validateEnvironment throws ConfigurationError without leaking secrets on missing variables", () => {
  assert.throws(
    () => {
      validateEnvironment({}, { requiredStores: ["mysql", "redis", "neo4j"] });
    },
    (err: unknown) => {
      assert.ok(err instanceof ConfigurationError);
      assert.ok(err.missingVariables.includes("DATABASE_URL"));
      assert.ok(err.missingVariables.includes("REDIS_URL"));
      assert.ok(err.missingVariables.includes("NEO4J_URI"));
      assert.ok(err.missingVariables.includes("NEO4J_USERNAME"));
      assert.ok(err.missingVariables.includes("NEO4J_PASSWORD"));
      assert.strictEqual(err.message.includes("supersecret"), false);
      return true;
    },
  );
});

test("validateEnvironment succeeds when required variables are present", () => {
  const config = validateEnvironment(
    {
      DATABASE_URL: "mysql://user:pass@localhost:3306/db",
      REDIS_URL: "redis://localhost:6379",
      NODE_ENV: "test",
    },
    { requiredStores: ["mysql", "redis"] },
  );

  assert.strictEqual(config.nodeEnv, "test");
  assert.strictEqual(config.databaseUrl, "mysql://user:pass@localhost:3306/db");
  assert.strictEqual(config.redisUrl, "redis://localhost:6379");
});

test(".env.example documents the approved MySQL, Redis, Neo4j, and LanceDB settings without real secrets", () => {
  const envExample = fs.readFileSync(envExamplePath, "utf-8");
  for (const key of ["DATABASE_URL", "MYSQL_PASSWORD", "MYSQL_ROOT_PASSWORD", "REDIS_URL", "NEO4J_URI", "NEO4J_PASSWORD", "LANCEDB_PATH", "POLYFIND_LOCAL_EMBEDDINGS", "EMBEDDING_ENDPOINT"]) {
    assert.ok(envExample.includes(key), `missing approved environment key: ${key}`);
  }
  assert.ok(!envExample.includes("QDRANT"));
  assert.ok(!envExample.includes("VECTOR_STORE_URL"));
  assert.strictEqual(envExample.includes("sk-"), false);
  assert.strictEqual(envExample.includes("BEGIN PRIVATE KEY"), false);
  assert.ok(envExample.includes("replace-with-random-local-password"));
  assert.ok(envExample.includes("replace-with-random-neo4j-password"));
  assert.strictEqual(envExample.includes("PolyFindNeo4j2026!"), false);
  const compose = fs.readFileSync(path.join(repoRoot, "docker-compose.yml"), "utf-8");
  assert.match(compose, /NEO4J_AUTH: \$\{NEO4J_AUTH:\?Set NEO4J_AUTH in \.env\}/);
  assert.match(compose, /NEO4J_PASSWORD: \$\{NEO4J_PASSWORD:\?Set NEO4J_PASSWORD in \.env\}/);
});

test("docs/LOCAL_SETUP.md explains local configuration for all four stores and runtime requirements", () => {
  const setupGuide = fs.readFileSync(localSetupPath, "utf-8");
  assert.ok(setupGuide.includes("MySQL"));
  assert.ok(setupGuide.includes("Redis"));
  assert.ok(setupGuide.includes("Neo4j"));
  assert.ok(setupGuide.includes("Vector Store") || setupGuide.includes("LanceDB"));
  assert.ok(setupGuide.includes("Node.js"));
  assert.ok(setupGuide.includes("TypeScript"));
});

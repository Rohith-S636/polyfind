import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  asCatalogReader,
  CatalogRepository,
  createDatabasePool,
  createVectorRuntimeFromEnvironment,
  generateWorkload,
  DEFAULT_QUERY_MIX,
  MySqlKeywordRetrievalProvider,
  Neo4jGraphRetrievalProvider,
  Neo4jOutboxTarget,
  RedisCacheAdapter,
  RedisOutboxTarget,
  LanceDbOutboxTarget,
  MySqlOutboxStore,
  OutboxWorker,
  RepeatedBenchmarkRunner,
  SearchService,
  VectorIngestionService,
  initializeNeo4j,
  closeNeo4j,
  loadEnvironment,
} from "../src/index.js";
import type { SearchRequest } from "../src/contracts/types.js";
import type { Neo4jGraphAdapter } from "../src/sync/neo4j-driver.js";
import { PermanentOutboxError } from "../src/sync/outbox.js";

loadEnvironment();

function requiredNumber(name: string, fallback: number, minimum: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < minimum) throw new Error(`${name} must be an integer >= ${minimum}.`);
  return value;
}

const databaseUrl = process.env.DATABASE_URL;
if (process.env.POLYFIND_BENCHMARK_DISPOSABLE !== "true") {
  throw new Error("Refusing to benchmark an unapproved database. Set POLYFIND_BENCHMARK_DISPOSABLE=true only for a disposable benchmark database.");
}
if (!databaseUrl) throw new Error("DATABASE_URL is required.");
const parsedDatabaseUrl = new URL(databaseUrl);
if (!parsedDatabaseUrl.pathname.endsWith("/polyfind_test")) {
  throw new Error("Benchmark runner is restricted to the disposable polyfind_test database.");
}

const datasetSize = requiredNumber("POLYFIND_BENCHMARK_DATASET_SIZE", 50, 1);
const totalOperations = requiredNumber("POLYFIND_BENCHMARK_OPERATIONS", 100, 10);
const runCount = requiredNumber("POLYFIND_BENCHMARK_RUNS", 3, 1);
const seed = requiredNumber("POLYFIND_BENCHMARK_SEED", 42, 1);

const pool = createDatabasePool();
const repository = new CatalogRepository(pool);
const catalog = asCatalogReader(repository);
const redis = new RedisCacheAdapter(process.env.REDIS_URL ?? "redis://127.0.0.1:6379");
const vector = createVectorRuntimeFromEnvironment();
let graph: Awaited<ReturnType<typeof initializeNeo4j>>["graph"];
let worker: OutboxWorker | undefined;

async function drainOutbox(store: MySqlOutboxStore, targetWorker: OutboxWorker): Promise<void> {
  for (let index = 0; index < 2_000; index += 1) {
    const processed = await targetWorker.processOnce();
    if (processed === 0) break;
  }
  const health = await store.getHealth();
  if (health.pending > 0 || health.failed > 0 || health.deadLetter > 0) {
    throw new Error(`Outbox did not drain: pending=${health.pending}, failed=${health.failed}, deadLetter=${health.deadLetter}.`);
  }
}

try {
  await pool.query("SELECT 1");
  const [versionRows] = await pool.query<Array<{ version: string }>>("SELECT VERSION() AS version");
  await redis.connect();
  const neo = await initializeNeo4j();
  graph = neo.graph;
  if (!graph) throw new Error("Neo4j is required for the measured multi-store benchmark.");
  await vector.initialize();
  const embedder = vector.getEmbedder();
  const semanticProvider = vector.getSemanticProvider();
  if (!embedder || !semanticProvider) throw new Error("LanceDB and a local/remote embedding provider are required.");

  // Populate the derived indexes from authoritative MySQL data before timing.
  const pageSize = 100;
  let page = 1;
  let indexed = 0;
  const ingestion = new VectorIngestionService(vector.getStore(), embedder);
  while (true) {
    const batch = await catalog.listProducts({}, page, pageSize);
    if (batch.items.length === 0) break;
    const result = await ingestion.ingestBatch(batch.items);
    indexed += result.totalIngested;
    if (page * pageSize >= batch.total) break;
    page += 1;
  }
  if (indexed < datasetSize) throw new Error(`Expected at least ${datasetSize} MySQL products for benchmark; indexed ${indexed}.`);

  const outboxStore = new MySqlOutboxStore(pool);
  const outboxWorker = new OutboxWorker({
    store: outboxStore,
    targets: [
      new RedisOutboxTarget(redis, () => redis.getStatus() === "connected"),
      new Neo4jOutboxTarget(graph as Neo4jGraphAdapter),
      new LanceDbOutboxTarget(vector.getStore(), embedder),
    ],
  });
  worker = outboxWorker;
  await drainOutbox(outboxStore, outboxWorker);
  outboxWorker.start(100);

  const keywordProvider = new MySqlKeywordRetrievalProvider(pool);
  const graphProvider = new Neo4jGraphRetrievalProvider(graph as Neo4jGraphAdapter);
  const mysqlOnly = new SearchService({ catalog, keywordProvider, hybrid: false });
  const fixedHybrid = new SearchService({
    catalog, keywordProvider, semanticProvider, graphProvider,
    hybrid: true, plannerMode: "fixed-all-stores",
  });
  const adaptiveHybrid = new SearchService({
    catalog, keywordProvider, semanticProvider, graphProvider,
    cache: redis, hybrid: true, plannerMode: "adaptive",
  });

  const makeTarget = (name: string, search: SearchService) => ({
    name,
    async executeQuery(request: SearchRequest) {
      const response = await search.search(request);
      return {
        elapsedMs: response.timings.totalMs,
        storeTimings: {
          mysqlMs: response.sourceTimings?.mysql,
          vectorMs: response.sourceTimings?.vector,
          graphMs: response.sourceTimings?.graph,
        },
        cacheHit: response.cacheHit,
        freshnessViolation: response.freshness.status !== "verified",
      };
    },
    async executeUpdate(productId: string, patch: Record<string, unknown>) {
      const started = performance.now();
      const current = await repository.getProduct(productId);
      if (!current) return { elapsedMs: Math.round((performance.now() - started) * 100) / 100 };
      await repository.updateProduct(productId, {
        ...(typeof patch.price === "number" ? { price: patch.price } : {}),
        ...(typeof patch.stock === "number" ? { stock: patch.stock } : {}),
      }, current.version);
      return { elapsedMs: Math.round((performance.now() - started) * 100) / 100 };
    },
  });

  const workloadConfig = {
    workloadId: `polyfind-live-${datasetSize}-seed-${seed}`,
    datasetSize,
    seed,
    totalOperations,
    regime: "medium" as const,
    queryMix: DEFAULT_QUERY_MIX,
  };
  const runner = new RepeatedBenchmarkRunner();
  const artifact = await runner.run(
    { runCount, warmupRuns: 1, seed, workloadId: workloadConfig.workloadId, datasetSize, totalOperations },
    [mysqlOnly, fixedHybrid, adaptiveHybrid].map((service) => ({
      target: makeTarget(service === mysqlOnly ? "mysql-only" : service === fixedHybrid ? "fixed-weighted-hybrid" : "adaptive-weighted-hybrid-cache", service),
      createWorkload: (_runIndex, workloadSeed) => generateWorkload({ ...workloadConfig, seed: workloadSeed }).operations,
    })),
  );

  const outputPath = process.env.POLYFIND_BENCHMARK_OUTPUT
    ?? path.resolve("artifacts", `polyfind-benchmark-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify({
    ...artifact,
    metadata: {
      commitSha: process.env.GITHUB_SHA ?? "local-unpinned",
      databaseName: parsedDatabaseUrl.pathname.slice(1),
      mysqlVersion: versionRows[0]?.version ?? "unknown",
      datasetSeed: seed,
      productsIndexedToLanceDb: indexed,
      localVectorizer: embedder.modelName,
      fusionWeights: { mysql: 0.5, vector: 0.35, graph: 0.15 },
      strategies: ["mysql-only", "fixed-weighted-hybrid", "adaptive-weighted-hybrid-cache"],
      notes: "Measured disposable CI benchmark. No production database was used. Workload and environment metadata are included in this artifact.",
    },
  }, null, 2), "utf8");
  console.log(`Measured benchmark artifact written to ${outputPath}`);
  console.log(JSON.stringify(artifact.strategies.map((item) => ({
    strategy: item.strategyName,
    meanLatency: item.latencyMs.mean,
    p95: item.rawRuns.map((run) => run.latencyQuantiles.p95Ms),
    freshnessViolations: item.freshnessViolationRate,
    cacheHitRate: item.rawRuns.map((run) => run.cacheStats.hitRate),
  })), null, 2));
} finally {
  await worker?.stop();
  await redis.close();
  await closeNeo4j(graph);
  await vector.close();
  await pool.end();
}

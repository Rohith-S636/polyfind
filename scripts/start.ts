import { spawn } from "node:child_process";
import {
  createApiServer,
  InMemoryCatalog,
  SearchService,
  MySqlKeywordRetrievalProvider,
  Neo4jGraphRetrievalProvider,
  RelationalRepository,
  InMemoryRelationalStore,
  generateSeedDataset,
  CatalogRepository,
  asCatalogReader,
  createDatabasePool,
  loadEnvironment,
  RedisCacheAdapter,
  CachedCatalogReader,
  initializeNeo4j,
  closeNeo4j,
  createVectorRuntimeFromEnvironment,
  MySqlOutboxStore,
  OutboxWorker,
  RedisOutboxTarget,
  Neo4jOutboxTarget,
  LanceDbOutboxTarget,
  UnavailableOutboxTarget,
  LazyOutboxTarget,
  PermanentOutboxError,
  SessionAuthService,
} from "../src/index.js";
import type { CatalogReader } from "../src/contracts/types.js";
import type { Neo4jGraphAdapter } from "../src/sync/neo4j-driver.js";

loadEnvironment();

const apiPort = Number(process.env.API_PORT ?? 3001);
const webPort = Number(process.env.PORT ?? 3000);
const mode = process.env.CATALOG_MODE ?? "live";

let catalog: CatalogReader;
let catalogStatus: "available" | "not-configured" | "unavailable";
let databasePool: ReturnType<typeof createDatabasePool> | undefined;
let catalogRepository: CatalogRepository | undefined;
const redis = process.env.REDIS_URL ? new RedisCacheAdapter(process.env.REDIS_URL) : undefined;
let redisStatus: "available" | "not-configured" | "unavailable" = "not-configured";
const { graph, status: graphStatus } = await initializeNeo4j();
const vector = createVectorRuntimeFromEnvironment();
await vector.initialize();
if (redis) {
  try {
    await redis.connect();
    redisStatus = "available";
  } catch {
    console.error("Redis cache is unavailable; continuing with authoritative MySQL reads.");
    redisStatus = "unavailable";
  }
}

if (mode === "demo") {
  const dataset = generateSeedDataset({ seed: 42, productCount: 50 });
  catalog = new InMemoryCatalog(dataset.products);
  catalogStatus = "available";
} else if (mode === "live" && process.env.DATABASE_URL) {
  try {
    databasePool = createDatabasePool();
    await databasePool.query("SELECT 1");
    catalogRepository = new CatalogRepository(databasePool, redis);
    catalog = asCatalogReader(catalogRepository);
    catalogStatus = "available";
  } catch {
    await redis?.close();
    await closeNeo4j(graph);
    await vector.close();
    throw new Error("Live catalog mode requires a reachable MySQL database; demo fallback is disabled.");
  }
} else {
  throw new Error("Live catalog mode requires DATABASE_URL. Set CATALOG_MODE=demo for local demonstration.");
}

if (redis) catalog = new CachedCatalogReader(catalog, redis);
const semanticProvider = vector.getSemanticProvider();
const graphProvider = graph ? new Neo4jGraphRetrievalProvider(graph as Neo4jGraphAdapter) : undefined;
const outboxTargets = [
  new LazyOutboxTarget("redis", async () => {
    if (!redis) throw new PermanentOutboxError("Redis is intentionally disabled.");
    if (redis.getStatus() !== "connected") await redis.connect();
    return new RedisOutboxTarget(redis, () => redis.getStatus() === "connected");
  }),
  graph
    ? new Neo4jOutboxTarget(graph as Neo4jGraphAdapter)
    : new LazyOutboxTarget("neo4j", async () => {
        const lifecycle = await initializeNeo4j();
        if (!lifecycle.graph) throw new Error("Neo4j is unavailable.");
        return new Neo4jOutboxTarget(lifecycle.graph as Neo4jGraphAdapter);
      }),
  new LazyOutboxTarget("lancedb", async () => {
    await vector.initialize();
    const embedder = vector.getEmbedder();
    if (!embedder) throw new PermanentOutboxError("LanceDB embedding provider is not configured.");
    return new LanceDbOutboxTarget(vector.getStore(), embedder);
  }),
];
const outboxWorker = databasePool && outboxTargets.length > 0
  ? new OutboxWorker({ store: new MySqlOutboxStore(databasePool), targets: outboxTargets })
  : undefined;
const relational = databasePool ? new RelationalRepository(databasePool, redis) : new InMemoryRelationalStore();
const auth = databasePool ? new SessionAuthService(databasePool, process.env.AUTH_BOOTSTRAP_TOKEN) : undefined;
const apiServer = createApiServer({
  relational,
  ...(catalogRepository ? {
    productList: (query) => catalogRepository!.listProducts(query),
    createProduct: (input) => catalogRepository!.createProduct(input),
    updateProduct: (id, patch, expectedVersion) => catalogRepository!.updateProduct(id, patch, expectedVersion),
  } : {}),
  auth,
  catalog,
  search: new SearchService({
    catalog,
    ...(databasePool ? { keywordProvider: new MySqlKeywordRetrievalProvider(databasePool) } : {}),
    ...(semanticProvider ? { semanticProvider } : {}),
    ...(graphProvider ? { graphProvider } : {}),
    ...(redis ? { cache: redis } : {}),
    hybrid: Boolean(semanticProvider || graphProvider),
  }),
  dependencyStatus: {
    catalog: catalogStatus,
    redis: redisStatus,
    graph: graphStatus,
    vector: vector.getHealth().state === "available" ? "available" : vector.getHealth().embedding === "not-configured" ? "not-configured" : "unavailable",
  },
  mode: mode as "demo" | "live",
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
  rateLimit: { windowMs: 60_000, maxRequests: Number(process.env.RATE_LIMIT_MAX ?? 120) },
  redisStatus: () => redis?.getStatus() ?? "disconnected",
  graphStatus: () => graph?.getStatus() ?? "disconnected",
  vectorStatus: () => vector.getHealth(),
  syncHealth: () => outboxWorker?.getHealth() ?? Promise.resolve({
    running: false,
    pending: 0,
    failed: 0,
    deadLetter: 0,
    oldestPendingAgeMs: null,
    lastSuccessfulProcessingAt: null,
  }),
});

await apiServer.start(apiPort);
outboxWorker?.start();
console.log(`[PolyFind API] Running on http://127.0.0.1:${apiPort} (${mode})`);
console.log(`[PolyFind Web] Starting production server on http://localhost:${webPort} ...`);

const nextProc = spawn(`npx next start web -p ${webPort}`, {
  shell: true,
  stdio: "inherit",
  env: {
    ...process.env,
    POLYFIND_API_URL: `http://127.0.0.1:${apiPort}`,
  },
});

const cleanup = async () => {
  console.log("\nShutting down PolyFind production services...");
  try {
    await apiServer.stop();
  } catch {}
  await outboxWorker?.stop();
  await Promise.all(outboxTargets.map((target) => target.close?.()));
  await redis?.close();
  await closeNeo4j(graph);
  await vector.close();
  await databasePool?.end();
  nextProc.kill("SIGINT");
  process.exit(0);
};

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

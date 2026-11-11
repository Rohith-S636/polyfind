import {
  createApiServer,
  InMemoryCatalog,
  SearchService,
  MySqlKeywordRetrievalProvider,
  generateSeedDataset,
  CatalogRepository,
  RelationalRepository,
  InMemoryRelationalStore,
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

const port = Number(process.env.API_PORT ?? process.env.PORT ?? 3001);
const mode = process.env.CATALOG_MODE ?? (process.env.NODE_ENV === "production" ? "live" : "demo");

let catalog: CatalogReader;
let catalogRepository: CatalogRepository | undefined;
let catalogStatus: "available" | "not-configured" | "unavailable";
let databasePool: ReturnType<typeof createDatabasePool> | undefined;
const redis = process.env.REDIS_URL ? new RedisCacheAdapter(process.env.REDIS_URL) : undefined;
let redisStatus: "available" | "not-configured" | "unavailable" = "not-configured";
const { graph, status: graphStatus } = await initializeNeo4j();
const vector = createVectorRuntimeFromEnvironment();
await vector.initialize();
if (redis) {
  try {
    await redis.connect();
    redisStatus = "available";
  } catch (error) {
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
    console.error("Live catalog mode requires a reachable MySQL database. No demo fallback was used.");
    await redis?.close();
    await closeNeo4j(graph);
    await vector.close();
    process.exit(1);
  }
} else {
  console.error("Live catalog mode requires DATABASE_URL. Set CATALOG_MODE=demo only for the deterministic demonstration.");
  process.exit(1);
}

if (redis) catalog = new CachedCatalogReader(catalog, redis);
const semanticProvider = vector.getSemanticProvider();
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
const app = createApiServer({
  relational,
  ...(catalogRepository ? {
    createProduct: (input) => catalogRepository!.createProduct(input),
    updateProduct: (id, patch, expectedVersion) => catalogRepository!.updateProduct(id, patch, expectedVersion),
  } : {}),
  auth,
  catalog,
  search: new SearchService({
    catalog,
    ...(databasePool ? { keywordProvider: new MySqlKeywordRetrievalProvider(databasePool) } : {}),
    ...(semanticProvider ? { semanticProvider } : {}),
    ...(redis ? { cache: redis } : {}),
    hybrid: Boolean(semanticProvider),
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

await app.start(port);
outboxWorker?.start();
console.log(`PolyFind API listening on http://127.0.0.1:${port}`);
console.log(`Active mode: ${mode === "demo" ? "DEMO (deterministic in-memory catalogue)" : "LIVE (authoritative MySQL catalogue)"}`);
let shuttingDown = false;
const shutdown = async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  await outboxWorker?.stop();
  await Promise.all(outboxTargets.map((target) => target.close?.()));
  await redis?.close();
  await closeNeo4j(graph);
  await vector.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

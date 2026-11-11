export {
  createProductUpdateEvent,
  type ProductUpdateEvent,
  type UpdateOperation,
} from "./events.js";

export {
  SyncManager,
  type DerivedStoreSyncTarget,
  type SyncLogEntry,
  type SyncStatus,
} from "./processor.js";

export {
  Neo4jGraphSyncAdapter,
  InMemoryGraphStorage,
  NEO4J_SCHEMA_CYPHER,
  type GraphNode,
  type GraphEdge,
  type GraphSyncMetrics,
} from "./neo4j-sync.js";

export {
  Neo4jGraphAdapter,
  REAL_NEO4J_SCHEMA_CYPHER,
  type Neo4jConfig,
  type Neo4jStatus,
  type GraphCategoryProjection,
  type GraphBrandProjection,
  type GraphProductProjection,
  type GraphVariantProjection,
  type GraphSellerProjection,
  type GraphOfferProjection,
} from "./neo4j-driver.js";

export {
  closeNeo4j,
  initializeNeo4j,
  type Neo4jAdapterFactory,
  type Neo4jDependencyStatus,
  type Neo4jLifecycle,
  type Neo4jLifecycleAdapter,
} from "./neo4j-lifecycle.js";

export {
  MySqlOutboxStore,
  OutboxWorker,
  PermanentOutboxError,
  SkippedOutboxError,
  UnavailableOutboxTarget,
  LazyOutboxTarget,
  RedisOutboxTarget,
  Neo4jOutboxTarget,
  LanceDbOutboxTarget,
  createProductOutboxEvent,
  createOutboxEvent,
  writeOutboxRecord,
  type OutboxEvent,
  type OutboxDelivery,
  type OutboxHealth,
  type OutboxStore,
  type OutboxTarget,
  type OutboxTargetName,
  type OutboxWorkerOptions,
  type OutboxWorkerHealth,
} from "./outbox.js";

export {
  reconcileProducts,
  type ReconciliationOptions,
  type ReconciliationReport,
} from "./reconciliation.js";

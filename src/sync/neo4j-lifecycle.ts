import { Neo4jGraphAdapter, type Neo4jConfig, type Neo4jStatus } from "./neo4j-driver.js";

export type Neo4jDependencyStatus = "available" | "not-configured" | "unavailable";

export interface Neo4jLifecycleAdapter {
  connect(): Promise<void>;
  initializeSchema(): Promise<void>;
  close(): Promise<void>;
  getStatus(): Neo4jStatus;
}

export interface Neo4jLifecycle {
  graph: Neo4jLifecycleAdapter | undefined;
  status: Neo4jDependencyStatus;
}

export type Neo4jAdapterFactory = (config: Neo4jConfig) => Neo4jLifecycleAdapter;

export async function initializeNeo4j(
  environment: NodeJS.ProcessEnv = process.env,
  createAdapter: Neo4jAdapterFactory = (config) => new Neo4jGraphAdapter(config),
): Promise<Neo4jLifecycle> {
  const { NEO4J_URI: uri, NEO4J_USERNAME: username, NEO4J_PASSWORD: password } = environment;
  if (!uri || !username || !password) {
    return { graph: undefined, status: "not-configured" };
  }

  const graph = createAdapter({
    uri,
    username,
    password,
    ...(environment.NEO4J_DATABASE ? { database: environment.NEO4J_DATABASE } : {}),
  });

  try {
    await graph.connect();
    await graph.initializeSchema();
    return { graph, status: "available" };
  } catch {
    await graph.close();
    console.error("Neo4j graph is unavailable; continuing without derived graph projections.");
    return { graph: undefined, status: "unavailable" };
  }
}

export async function closeNeo4j(graph: Neo4jLifecycleAdapter | undefined): Promise<void> {
  await graph?.close();
}

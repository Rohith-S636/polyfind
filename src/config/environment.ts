/**
 * Configuration and Environment Management for PolyFind
 * Enforces safe environment variable validation, redacts secrets in error logs,
 * and reports missing configuration clearly.
 */

export interface AppConfig {
  nodeEnv: "development" | "production" | "test";
  appUrl: string;
  databaseUrl: string;
  redisUrl: string;
  neo4jUri: string;
  neo4jUsername: string;
  neo4jPassword?: string | undefined;
  vectorStoreProvider: string;
  vectorStoreUrl?: string | undefined;
  embeddingProvider: string;
  embeddingModel?: string | undefined;
  authSecret?: string | undefined;
}

export class ConfigurationError extends Error {
  public readonly missingVariables: string[];

  constructor(message: string, missingVariables: string[] = []) {
    super(message);
    this.name = "ConfigurationError";
    this.missingVariables = missingVariables;
  }
}

/**
 * Redacts credentials from a connection string or URL for safe logging/error messages.
 */
export function redactSecret(value: string): string {
  if (!value) return "";
  try {
    const parsed = new URL(value);
    if (parsed.password) {
      parsed.password = "******";
    }
    if (parsed.username) {
      parsed.username = "******";
    }
    return parsed.toString();
  } catch {
    // If not a standard URL, mask characters leaving only first and last 2 if length > 6
    if (value.length <= 6) {
      return "******";
    }
    return `${value.slice(0, 2)}******${value.slice(-2)}`;
  }
}

/**
 * Produces a safe operational error message for logs and API-facing results.
 * Detailed provider errors must not cross this boundary.
 */
export function sanitizeOperationalError(error: unknown): string {
  if (!(error instanceof Error)) {
    return "The requested operation could not be completed.";
  }

  const message = error.message;
  const containsSensitiveData =
    /(?:mysql|postgres|redis|neo4j|bolt):\/\/[^@\s]+@/i.test(message) ||
    /(?:password|passwd|secret|token|api[_-]?key)\s*[:=]\s*["']?[^"',\s]+/i.test(message) ||
    /authorization:\s*bearer\s+\S+/i.test(message);

  if (containsSensitiveData) {
    return "The requested operation failed because a dependent store was unavailable.";
  }
  return message;
}

/**
 * Loads process.env or falls back to an explicit dictionary.
 */
export function getEnvironmentMap(source?: NodeJS.ProcessEnv): Record<string, string | undefined> {
  if (source) {
    return source;
  }
  try {
    if (typeof process.loadEnvFile === "function") {
      process.loadEnvFile();
    }
  } catch {
    // .env file is optional if variables are already provided via environment
  }
  return process.env;
}

/**
 * Validates the environment against required PolyFind variables.
 * Fails fast with clear descriptive messages without exposing secret values.
 */
export function validateEnvironment(
  envSource?: Record<string, string | undefined>,
  options: { requiredStores?: Array<"mysql" | "redis" | "neo4j" | "vector"> } = {},
): AppConfig {
  const env = envSource ?? getEnvironmentMap();
  const missing: string[] = [];
  const stores = options.requiredStores ?? ["mysql"];

  const nodeEnv = (env.NODE_ENV as "development" | "production" | "test") || "development";
  const appUrl = env.APP_URL || "http://localhost:3000";

  if (stores.includes("mysql") && !env.DATABASE_URL) {
    missing.push("DATABASE_URL");
  }

  if (stores.includes("redis") && !env.REDIS_URL) {
    missing.push("REDIS_URL");
  }

  if (stores.includes("neo4j")) {
    if (!env.NEO4J_URI) missing.push("NEO4J_URI");
    if (!env.NEO4J_USERNAME) missing.push("NEO4J_USERNAME");
    if (!env.NEO4J_PASSWORD) missing.push("NEO4J_PASSWORD");
  }

  if (stores.includes("vector")) {
    if (!env.VECTOR_STORE_PROVIDER) missing.push("VECTOR_STORE_PROVIDER");
  }

  if (missing.length > 0) {
    throw new ConfigurationError(
      `Missing required environment configuration: [${missing.join(", ")}]. ` +
        `Please check your .env file against .env.example.`,
      missing,
    );
  }

  return {
    nodeEnv,
    appUrl,
    databaseUrl: env.DATABASE_URL || "",
    redisUrl: env.REDIS_URL || "redis://localhost:6379",
    neo4jUri: env.NEO4J_URI || "bolt://localhost:7687",
    neo4jUsername: env.NEO4J_USERNAME || "neo4j",
    neo4jPassword: env.NEO4J_PASSWORD,
    vectorStoreProvider: env.VECTOR_STORE_PROVIDER || "memory",
    vectorStoreUrl: env.VECTOR_STORE_URL,
    embeddingProvider: env.EMBEDDING_PROVIDER || "mock",
    embeddingModel: env.EMBEDDING_MODEL,
    authSecret: env.AUTH_SECRET,
  };
}

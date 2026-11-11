import mysql from "mysql2/promise";
import type { Pool, PoolOptions } from "mysql2/promise";

let poolInstance: Pool | null = null;

export function loadEnvironment(): void {
  try {
    if (typeof process.loadEnvFile === "function") {
      process.loadEnvFile();
    }
  } catch {
    // .env file is optional if variables are passed directly via process.env
  }
}

export function parseDatabaseUrl(rawUrl?: string): PoolOptions {
  const urlString = rawUrl ?? process.env.DATABASE_URL;
  if (!urlString) {
    throw new Error(
      "Missing required environment variable DATABASE_URL. Please set DATABASE_URL (e.g. in .env) as referenced in .env.example.",
    );
  }

  try {
    const parsed = new URL(urlString);
    if (parsed.protocol !== "mysql:") {
      throw new Error(`Unsupported database protocol: ${parsed.protocol}. Expected mysql:`);
    }

    const database = parsed.pathname ? parsed.pathname.replace(/^\//, "") : undefined;
    const port = parsed.port ? Number.parseInt(parsed.port, 10) : 3306;

    const options: PoolOptions = {
      host: parsed.hostname || "localhost",
      port: Number.isNaN(port) ? 3306 : port,
      user: decodeURIComponent(parsed.username || "root"),
      password: decodeURIComponent(parsed.password || ""),
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
      multipleStatements: true,
    };

    if (database) {
      options.database = database;
    }

    return options;
  } catch (err: unknown) {
    if (err instanceof Error && err.message.startsWith("Missing required")) {
      throw err;
    }
    throw new Error("Invalid DATABASE_URL format. Expected format: mysql://user:password@host:port/database");
  }
}

export function createDatabasePool(options?: PoolOptions): Pool {
  loadEnvironment();
  const config = options ?? parseDatabaseUrl();
  return mysql.createPool(config);
}

export function getDatabasePool(): Pool {
  if (!poolInstance) {
    poolInstance = createDatabasePool();
  }
  return poolInstance;
}

export async function closeDatabasePool(): Promise<void> {
  if (poolInstance) {
    await poolInstance.end();
    poolInstance = null;
  }
}

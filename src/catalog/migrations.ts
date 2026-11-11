import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool, PoolConnection } from "mysql2/promise";
import type { RowDataPacket } from "mysql2/promise";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DEFAULT_MIGRATIONS_DIR = path.resolve(__dirname, "../../migrations");

export interface MigrationResult {
  applied: string[];
  alreadyApplied: string[];
  totalAvailable: number;
}

export async function ensureMigrationsTable(pool: Pool | PoolConnection): Promise<void> {
  const query = `
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INT AUTO_INCREMENT NOT NULL,
      name VARCHAR(255) NOT NULL,
      applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      CONSTRAINT pk_schema_migrations PRIMARY KEY (id),
      CONSTRAINT uq_schema_migrations_name UNIQUE (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `;
  await pool.query(query);
}

export async function getAppliedMigrations(pool: Pool | PoolConnection): Promise<string[]> {
  await ensureMigrationsTable(pool);
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT name FROM schema_migrations ORDER BY id ASC",
  );
  return rows.map((row) => String(row["name"]));
}

export async function getAvailableMigrationFiles(
  migrationsDir: string = DEFAULT_MIGRATIONS_DIR,
): Promise<Array<{ name: string; fullPath: string }>> {
  const entries = await fs.readdir(migrationsDir, { withFileTypes: true });
  const sqlFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => ({
      name: entry.name,
      fullPath: path.join(migrationsDir, entry.name),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return sqlFiles;
}

export async function runMigrations(
  pool: Pool,
  options?: { migrationsDir?: string },
): Promise<MigrationResult> {
  const migrationsDir = options?.migrationsDir ?? DEFAULT_MIGRATIONS_DIR;
  await ensureMigrationsTable(pool);

  const appliedBefore = await getAppliedMigrations(pool);
  const appliedSet = new Set(appliedBefore);
  const availableFiles = await getAvailableMigrationFiles(migrationsDir);

  const newlyApplied: string[] = [];

  for (const file of availableFiles) {
    if (appliedSet.has(file.name)) {
      continue;
    }

    const sqlContent = await fs.readFile(file.fullPath, "utf-8");
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      // MySQL 8.0 compatibility: ADD COLUMN IF NOT EXISTS is a MariaDB extension
      // not supported in MySQL 8.0. The migration runner provides idempotency via
      // schema_migrations tracking, so stripping IF NOT EXISTS here is safe.
      const executableSql = sqlContent.replace(
        /\bADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\b/gi,
        "ADD COLUMN",
      );

      // Execute statements in the migration file
      // mysql2 with multipleStatements: true can execute multi-statement SQL strings
      if (executableSql.trim().length > 0) {
        await connection.query(executableSql);
      }

      await connection.query(
        "INSERT INTO schema_migrations (name, applied_at) VALUES (?, NOW(3))",
        [file.name],
      );

      await connection.commit();
      newlyApplied.push(file.name);
    } catch (error) {
      await connection.rollback();
      throw new Error(
        `Migration failed for file "${file.name}": ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      connection.release();
    }
  }

  return {
    applied: newlyApplied,
    alreadyApplied: appliedBefore,
    totalAvailable: availableFiles.length,
  };
}

export async function dropAllTables(pool: Pool): Promise<void> {
  const connection = await pool.getConnection();
  try {
    await connection.query("SET FOREIGN_KEY_CHECKS = 0");
    await connection.query("DROP TABLE IF EXISTS outbox_deliveries");
    await connection.query("DROP TABLE IF EXISTS outbox_events");
    await connection.query("DROP TABLE IF EXISTS audit_logs");
    await connection.query("DROP TABLE IF EXISTS sessions");
    await connection.query("DROP TABLE IF EXISTS user_roles");
    await connection.query("DROP TABLE IF EXISTS roles");
    await connection.query("DROP TABLE IF EXISTS users");
    await connection.query("DROP TABLE IF EXISTS offer_history");
    await connection.query("DROP TABLE IF EXISTS offers");
    await connection.query("DROP TABLE IF EXISTS sellers");
    await connection.query("DROP TABLE IF EXISTS product_variants");
    await connection.query("DROP TABLE IF EXISTS brands");
    await connection.query("DROP TABLE IF EXISTS product_versions");
    await connection.query("DROP TABLE IF EXISTS products");
    await connection.query("DROP TABLE IF EXISTS categories");
    await connection.query("DROP TABLE IF EXISTS schema_migrations");
    await connection.query("SET FOREIGN_KEY_CHECKS = 1");
  } finally {
    connection.release();
  }
}

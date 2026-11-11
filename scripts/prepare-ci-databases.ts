import { createConnection } from "mysql2/promise";

async function main(): Promise<void> {
  const password = process.env.CI_MYSQL_ROOT_PASSWORD;
  const appUser = process.env.CI_MYSQL_APP_USER ?? "polyfind_test";
  const database = process.env.CI_MYSQL_INTEGRATION_DATABASE ?? "polyfind_integration_test";

  if (!password) throw new Error("CI_MYSQL_ROOT_PASSWORD is required.");
  if (!/^[A-Za-z0-9_]+$/.test(appUser)) throw new Error("CI_MYSQL_APP_USER contains unsupported characters.");
  if (database !== "polyfind_integration_test") {
    throw new Error("This helper may create only the disposable polyfind_integration_test database.");
  }

  const connection = await createConnection({
    host: process.env.CI_MYSQL_HOST ?? "127.0.0.1",
    port: Number(process.env.CI_MYSQL_PORT ?? 3306),
    user: "root",
    password,
  });

  try {
    await connection.query(
      "CREATE DATABASE IF NOT EXISTS `polyfind_integration_test` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
    );
    await connection.query(
      "GRANT ALL PRIVILEGES ON `polyfind_integration_test`.* TO ?@'%'",
      [appUser],
    );
    await connection.query("FLUSH PRIVILEGES");
    process.stdout.write("Prepared isolated disposable MySQL integration database.\n");
  } finally {
    await connection.end();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`Could not prepare disposable MySQL integration database: ${error instanceof Error ? error.message : "unknown error"}\n`);
  process.exitCode = 1;
});

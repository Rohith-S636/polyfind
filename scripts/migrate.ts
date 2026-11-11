import {
  closeDatabasePool,
  getDatabasePool,
  loadEnvironment,
  runMigrations,
} from "../src/index.js";

async function main(): Promise<void> {
  loadEnvironment();

  if (!process.env.DATABASE_URL) {
    console.error(
      "Error: DATABASE_URL is not set. Please provide DATABASE_URL in .env (see .env.example) or via the environment.",
    );
    process.exit(1);
  }

  console.log("Running PolyFind database migrations...");
  const pool = getDatabasePool();

  try {
    const result = await runMigrations(pool);
    console.log(
      `Migrations complete: ${result.applied.length} applied, ${result.alreadyApplied.length} previously applied (${result.totalAvailable} total).`,
    );
    if (result.applied.length > 0) {
      for (const name of result.applied) {
        console.log(`  + Applied: ${name}`);
      }
    }
  } catch (error) {
    console.error(
      "Migration execution failed:",
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  } finally {
    await closeDatabasePool();
  }
}

main();

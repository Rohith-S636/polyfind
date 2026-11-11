import fs from "node:fs";
import path from "node:path";
import {
  closeDatabasePool,
  generateSeedDataset,
  getDatabasePool,
  loadEnvironment,
  validateSeedDataset,
} from "../src/index.js";

async function main(): Promise<void> {
  loadEnvironment();
  const args = process.argv.slice(2);
  const seedArg = args.find((a) => a.startsWith("--seed="))?.split("=")[1];
  const countArg = args.find((a) => a.startsWith("--count="))?.split("=")[1];
  const exportArg = args.find((a) => a.startsWith("--export="))?.split("=")[1];

  const seed = seedArg ? Number.parseInt(seedArg, 10) : 42;
  const count = countArg ? Number.parseInt(countArg, 10) : 50;

  console.log(`Generating deterministic seed catalog (seed=${seed}, count=${count})...`);
  const dataset = generateSeedDataset({ seed, productCount: count });
  const validation = validateSeedDataset(dataset);

  if (!validation.valid) {
    console.error("Seed dataset validation failed:", JSON.stringify(validation.issues, null, 2));
    process.exit(1);
  }

  console.log(`Validation passed: ${dataset.categories.length} categories, ${dataset.products.length} products.`);

  if (exportArg) {
    const exportPath = path.resolve(process.cwd(), exportArg);
    fs.mkdirSync(path.dirname(exportPath), { recursive: true });
    fs.writeFileSync(exportPath, JSON.stringify(dataset, null, 2), "utf-8");
    console.log(`Exported seed dataset to ${exportPath}`);
  }

  if (process.env.DATABASE_URL) {
    console.log("Seeding MySQL database...");
    const pool = getDatabasePool();
    try {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();

        for (const cat of dataset.categories) {
          await conn.query(
            "INSERT INTO categories (id, name) VALUES (?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name)",
            [cat.id, cat.name],
          );
        }

        for (const prod of dataset.products) {
          await conn.query(
            `INSERT INTO products (id, name, description, category_id, price, currency, stock, availability, brand, attributes, image_url, product_url, data_source, version, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               name = VALUES(name),
               description = VALUES(description),
               category_id = VALUES(category_id),
               price = VALUES(price),
               currency = VALUES(currency),
               stock = VALUES(stock),
               availability = VALUES(availability),
               brand = VALUES(brand),
               attributes = VALUES(attributes),
               image_url = VALUES(image_url),
               product_url = VALUES(product_url),
               data_source = VALUES(data_source),
               version = VALUES(version),
               updated_at = VALUES(updated_at)`,
            [
              prod.id,
              prod.name,
              prod.description,
              prod.categoryId,
              prod.price,
              prod.currency ?? "USD",
              prod.stock,
              prod.availability ?? "unknown",
              prod.brand ?? null,
              prod.attributes ? JSON.stringify(prod.attributes) : null,
              prod.imageUrl ?? null,
              prod.productUrl ?? null,
              prod.dataSource ?? "demo",
              prod.version,
              new Date(prod.updatedAt),
            ],
          );
        }

        await conn.commit();
        console.log(`Successfully seeded ${dataset.products.length} products into MySQL.`);
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
    } catch (err) {
      console.error("Could not seed live MySQL database:", err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    } finally {
      await closeDatabasePool();
    }
  } else {
    console.log("DATABASE_URL not set; skipped live database insertion.");
  }
}

main();

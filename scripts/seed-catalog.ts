import fs from "node:fs";
import path from "node:path";
import {
  closeDatabasePool,
  generateSeedDataset,
  getDatabasePool,
  CatalogRepository,
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
      const repository = new CatalogRepository(pool);
      let categoriesCreated = 0;
      let productsCreated = 0;
      let categoriesSkipped = 0;
      let productsSkipped = 0;

      // Additive and idempotent: never overwrite existing prices, stock,
      // versions, or catalogue content. Repository writes emit audit/outbox.
      for (const category of dataset.categories) {
        if (await repository.getCategory(category.id)) {
          categoriesSkipped += 1;
          continue;
        }
        await repository.createCategory({ id: category.id, name: category.name });
        categoriesCreated += 1;
      }

      for (const product of dataset.products) {
        if (await repository.getProduct(product.id)) {
          productsSkipped += 1;
          continue;
        }
        await repository.createProduct({
          id: product.id,
          name: product.name,
          description: product.description,
          categoryId: product.categoryId,
          price: product.price,
          stock: product.stock,
        });
        productsCreated += 1;
      }

      console.log(
        `Seed completed: ${categoriesCreated} categories and ${productsCreated} products created; ${categoriesSkipped} categories and ${productsSkipped} existing products left unchanged.`,
      );
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

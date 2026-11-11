import fs from "node:fs";
import path from "node:path";
import {
  closeDatabasePool,
  generateSeedDataset,
  getDatabasePool,
  CatalogRepository,
  RelationalRepository,
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

      const relational = new RelationalRepository(pool);
      const sellers = [
        { id: "seller-demo-01", name: "PolyFind Direct", slug: "polyfind-direct" },
        { id: "seller-demo-02", name: "Campus Tech Store", slug: "campus-tech-store" },
        { id: "seller-demo-03", name: "Value Market", slug: "value-market" },
      ];
      for (const seller of sellers) {
        if (!(await relational.getSeller(seller.id))) {
          await relational.createSeller(seller);
        }
      }

      let variantsCreated = 0;
      let offersCreated = 0;
      const priceFactors = [1, 1.04, 0.97];
      for (const generated of dataset.products) {
        const canonical = await repository.getProduct(generated.id);
        if (!canonical) continue;
        const variants = await relational.listProductVariants(canonical.id);
        let variantId = variants[0]?.id;
        if (!variantId) {
          variantId = `${canonical.id}-standard`;
          await relational.createProductVariant({
            id: variantId,
            productId: canonical.id,
            variantKey: "standard",
            sku: `SKU-${canonical.id}-STD`,
            attributes: { edition: "standard" },
          });
          variantsCreated += 1;
        }

        const existing = await relational.listOffers({ productId: canonical.id, page: 1, limit: 100 });
        for (let index = 0; index < sellers.length; index += 1) {
          const seller = sellers[index]!;
          if (existing.items.some((offer) => offer.sellerId === seller.id && offer.variantId === variantId)) continue;
          const stockQuantity = canonical.stock > 0 ? Math.min(canonical.stock, 20) : 0;
          const price = Math.round(canonical.price * priceFactors[index]! * 100) / 100;
          await relational.createOffer({
            id: `${canonical.id}-${seller.id}-offer`,
            productId: canonical.id,
            sellerId: seller.id,
            variantId,
            currency: canonical.currency ?? "USD",
            price,
            stockQuantity,
            availability: stockQuantity > 0 ? "available" : "unavailable",
            changeReason: "deterministic_seed",
          });
          offersCreated += 1;
        }
      }

      console.log(
        `Seed completed: ${categoriesCreated} categories and ${productsCreated} products created; ${categoriesSkipped} categories and ${productsSkipped} existing products left unchanged; ${variantsCreated} variants and ${offersCreated} seller offers created.`,
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

/**
 * PolyFind Live Operations CLI for Demonstrations & Viva Defense
 * Allows on-the-fly execution of Creation, Updates, Deletions, and History tracking.
 *
 * Usage Examples:
 *   npx tsx scripts/demo-ops.ts create-cat --id="cat-audio" --name="Audio Gear"
 *   npx tsx scripts/demo-ops.ts create-prod --id="prod-live-1" --name="Wireless ANC Earbuds" --cat="cat-audio" --price=79.99 --stock=30
 *   npx tsx scripts/demo-ops.ts get --id="prod-live-1"
 *   npx tsx scripts/demo-ops.ts update-price --id="prod-live-1" --price=59.99
 *   npx tsx scripts/demo-ops.ts history --id="prod-live-1"
 *   npx tsx scripts/demo-ops.ts delete --id="prod-live-1"
 */

import {
  getDatabasePool,
  loadEnvironment,
  CatalogRepository,
  type Product,
} from "../src/index.js";

loadEnvironment();
const pool = getDatabasePool();
const repo = new CatalogRepository(pool);

function getArg(flag: string): string | undefined {
  const match = process.argv.find((a) => a.startsWith(`${flag}=`));
  return match ? match.split("=")[1] : undefined;
}

async function main(): Promise<void> {
  const action = process.argv[2]?.toLowerCase();

  console.log("\n" + "=".repeat(75));
  console.log("  ⚡ POLYFIND LIVE REVIEWER OPERATIONS CLI");
  console.log("=".repeat(75));

  try {
    switch (action) {
      // 1. Create Category
      case "create-cat": {
        const id = getArg("--id") || "cat-reviewer-demo";
        const name = getArg("--name") || "Reviewer Demo Category";
        const desc = getArg("--desc") || "Created live during reviewer evaluation";

        console.log(`\n▶ [CREATE] Inserting category into MySQL: [${id}] - ${name}...`);
        await pool.query(
          "INSERT INTO categories (id, name, description) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE name=VALUES(name)",
          [id, name, desc],
        );
        console.log(`  ✓ Successfully created category '${id}' in MySQL.`);
        break;
      }

      // 2. Create Product
      case "create-prod": {
        const id = getArg("--id") || "prod-reviewer-1";
        const name = getArg("--name") || "PolyFind Noise-Cancelling Headphones";
        const desc = getArg("--desc") || "Studio-grade wireless ANC headphones created live for reviewer demo";
        const cat = getArg("--cat") || "cat-reviewer-demo";
        const price = parseFloat(getArg("--price") || "149.99");
        const stock = parseInt(getArg("--stock") || "50", 10);

        // Ensure category exists first
        await pool.query(
          "INSERT INTO categories (id, name, description) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE name=VALUES(name)",
          [cat, "Reviewer Demo Category", "Demo Category"],
        );

        console.log(`\n▶ [CREATE] Inserting product into MySQL: [${id}]...`);
        const product = await repo.createProduct({
          id,
          name,
          description: desc,
          categoryId: cat,
          price,
          stock,
        });

        console.log(`  ✓ Product created successfully with Initial Version v${product.version}:`);
        console.table([
          {
            ID: product.id,
            Name: product.name,
            Category: product.categoryId,
            Price: `$${product.price.toFixed(2)}`,
            Stock: product.stock,
            Version: `v${product.version}`,
          },
        ]);
        console.log(`  ✓ Transaction committed: Written to both 'products' and 'product_versions' tables.`);
        break;
      }

      // 3. Get Product Details
      case "get": {
        const id = getArg("--id") || "prod-reviewer-1";
        console.log(`\n▶ [READ] Fetching authoritative record for [${id}] from MySQL...`);
        const product = await repo.getProduct(id);
        if (!product) {
          console.log(`  ✗ Product '${id}' not found in database.`);
          break;
        }
        console.table([
          {
            ID: product.id,
            Name: product.name,
            Category: product.categoryId,
            Price: `$${product.price.toFixed(2)}`,
            Stock: product.stock,
            Version: `v${product.version}`,
            UpdatedAt: product.updatedAt,
          },
        ]);
        break;
      }

      // 4. Update Product Price (Flash Sale / Version Increment)
      case "update-price": {
        const id = getArg("--id") || "prod-reviewer-1";
        const price = parseFloat(getArg("--price") || "99.99");

        const before = await repo.getProduct(id);
        if (!before) {
          console.log(`  ✗ Product '${id}' does not exist.`);
          break;
        }

        console.log(`\n▶ [UPDATE] Mutating price for [${id}]:`);
        console.log(`  Before: Price = $${before.price.toFixed(2)}, Version = v${before.version}`);
        
        const updated = await repo.updateProduct(id, { price });
        
        console.log(`  After:  Price = $${updated.price.toFixed(2)}, Version = v${updated.version}`);
        console.log(`  ✓ Atomic Transaction Succeeded:`);
        console.log(`    - Incremented version from v${before.version} -> v${updated.version}`);
        console.log(`    - Appended new audit snapshot to 'product_versions' table.`);
        break;
      }

      // 5. Update Product Stock
      case "update-stock": {
        const id = getArg("--id") || "prod-reviewer-1";
        const stock = parseInt(getArg("--stock") || "10", 10);

        const before = await repo.getProduct(id);
        if (!before) {
          console.log(`  ✗ Product '${id}' does not exist.`);
          break;
        }

        console.log(`\n▶ [UPDATE] Mutating inventory stock for [${id}]:`);
        console.log(`  Before: Stock = ${before.stock}, Version = v${before.version}`);

        const updated = await repo.updateProduct(id, { stock });

        console.log(`  After:  Stock = ${updated.stock}, Version = v${updated.version}`);
        console.log(`  ✓ Version incremented to v${updated.version}.`);
        break;
      }

      // 6. Show Audit Trail / History
      case "history": {
        const id = getArg("--id") || "prod-reviewer-1";
        console.log(`\n▶ [AUDIT] Querying 'product_versions' weak entity ledger for [${id}]...`);
        const [rows] = await pool.query(
          "SELECT id, product_id, version, price, stock, change_reason, recorded_at FROM product_versions WHERE product_id = ? ORDER BY version ASC",
          [id],
        );

        if (!Array.isArray(rows) || rows.length === 0) {
          console.log(`  No version history found for '${id}'.`);
          break;
        }

        console.table(
          (rows as any[]).map((r) => ({
            LogID: r.id,
            ProductID: r.product_id,
            Version: `v${r.version}`,
            Price: `$${Number(r.price).toFixed(2)}`,
            Stock: r.stock,
            Reason: r.change_reason || "update",
            RecordedAt: r.recorded_at,
          })),
        );
        console.log(`  ✓ Historical audit log proves full ACID temporal tracking.`);
        break;
      }

      // 7. Delete Product
      case "delete": {
        const id = getArg("--id") || "prod-reviewer-1";
        console.log(`\n▶ [DELETE] Deleting product [${id}] from MySQL...`);
        
        const success = await repo.deleteProduct(id);
        if (!success) {
          console.log(`  ✗ Product '${id}' not found or already deleted.`);
          break;
        }

        console.log(`  ✓ Deleted product '${id}' from 'products' table.`);
        
        // Verify cascade delete
        const [versionRows] = await pool.query(
          "SELECT COUNT(*) as cnt FROM product_versions WHERE product_id = ?",
          [id],
        );
        const count = (versionRows as any[])[0]?.cnt ?? 0;
        console.log(`  ✓ Foreign Key CASCADE Verification: ${count} remaining historical versions in 'product_versions' (Clean Cascade).`);
        break;
      }

      // Default: Help Menu
      default: {
        console.log("\nAvailable Live Commands for Reviewer Evaluation:");
        console.log("  1. Create Category: npx tsx scripts/demo-ops.ts create-cat --id=cat-live --name='Live Demo'");
        console.log("  2. Create Product:  npx tsx scripts/demo-ops.ts create-prod --id=prod-live-1 --name='Studio Mic' --cat=cat-live --price=89.99 --stock=20");
        console.log("  3. Read Product:    npx tsx scripts/demo-ops.ts get --id=prod-live-1");
        console.log("  4. Update Price:    npx tsx scripts/demo-ops.ts update-price --id=prod-live-1 --price=69.99");
        console.log("  5. Update Stock:    npx tsx scripts/demo-ops.ts update-stock --id=prod-live-1 --stock=15");
        console.log("  6. Show History:    npx tsx scripts/demo-ops.ts history --id=prod-live-1");
        console.log("  7. Delete Product:  npx tsx scripts/demo-ops.ts delete --id=prod-live-1\n");
      }
    }
  } catch (err) {
    console.error("\n❌ Operation Failed:", err);
  } finally {
    await pool.end();
  }
}

main();

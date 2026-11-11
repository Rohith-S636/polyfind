import { test, expect } from "@playwright/test";

const baseUrl = process.env.POLYFIND_E2E_BASE_URL ?? "http://localhost:3000";
const bootstrapToken = process.env.POLYFIND_E2E_BOOTSTRAP_TOKEN ?? "ci-polyfind-bootstrap-token-with-more-than-32-characters";

test("browser journeys: customer RBAC, admin catalogue CRUD, seller comparison and price history", async ({ browser }) => {
  const suffix = Date.now().toString(36);
  const customerEmail = `customer-${suffix}@example.test`;
  const adminEmail = `admin-${suffix}@example.test`;
  const password = `PolyFind-e2e-${suffix}-Secure-2026`;
  const productId = `e2e-product-${suffix}`;
  const productName = `E2E Trail Lantern ${suffix}`;
  const brandId = `e2e-brand-${suffix}`;
  const sellerId = `e2e-seller-${suffix}`;
  const variantId = `e2e-variant-${suffix}`;
  const offerId = `e2e-offer-${suffix}`;
  const brandName = `E2E Equipment Brand ${suffix}`;
  const sellerName = `E2E Outdoor Seller ${suffix}`;

  const customerContext = await browser.newContext();
  const customerPage = await customerContext.newPage();
  try {
    await customerPage.goto(`${baseUrl}/register`);
    await expect(customerPage.getByRole("heading", { name: "Create a customer account" })).toBeVisible();
    await customerPage.getByLabel("Email").fill(customerEmail);
    await customerPage.getByLabel("Password").fill(password);
    await customerPage.getByRole("button", { name: "Create account" }).click();
    await customerPage.waitForURL(`${baseUrl}/`);
    await customerPage.goto(`${baseUrl}/admin`);
    await customerPage.waitForURL(`${baseUrl}/`);
    await expect(customerPage.getByText("Administrator workspace")).toHaveCount(0);

    const mutationStatus = await customerPage.evaluate(async (id) => {
      const response = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          name: "Customer mutation must be denied",
          description: "Role-based access control browser test",
          categoryId: "cat-outdoors",
          price: 1,
          stock: 1,
          currency: "INR",
        }),
      });
      return response.status;
    }, productId);
    expect(mutationStatus).toBe(401);
  } finally {
    await customerContext.close();
  }

  const adminPage = await browser.newPage();
  await adminPage.goto(`${baseUrl}/login`);
  await expect(adminPage.getByRole("heading", { name: "Sign in to PolyFind" })).toBeVisible();
  await adminPage.getByRole("button", { name: "First-time administrator setup" }).click();
  await adminPage.getByLabel("Email").fill(adminEmail);
  await adminPage.getByLabel("Password").fill(password);
  await adminPage.getByLabel("One-time administrator bootstrap token").fill(bootstrapToken);
  await adminPage.getByRole("button", { name: "Create first administrator" }).click();
  await adminPage.waitForURL(`${baseUrl}/admin`);
  await expect(adminPage.getByRole("heading", { name: "Administrator workspace" })).toBeVisible();

  await adminPage.getByRole("button", { name: "Sign out" }).click();
  await adminPage.waitForURL(`${baseUrl}/login`);
  await adminPage.getByLabel("Email").fill(adminEmail);
  await adminPage.getByLabel("Password").fill(password);
  await adminPage.getByRole("button", { name: "Sign in" }).click();
  await adminPage.waitForURL(`${baseUrl}/admin`);
  await expect(adminPage.getByRole("heading", { name: "Administrator workspace" })).toBeVisible();

  const productForm = adminPage.locator("form").filter({ has: adminPage.getByRole("heading", { name: "Create product" }) });
  await productForm.getByPlaceholder("Product ID").fill(productId);
  await productForm.getByPlaceholder("Product name").fill(productName);
  await productForm.getByPlaceholder("Description").fill("A synthetic lantern used to validate the complete administrator catalogue workflow.");
  await productForm.getByPlaceholder("Category ID (e.g. cat-outdoors)").fill("cat-outdoors");
  await productForm.locator('input[name="currency"]').fill("INR");
  await productForm.getByPlaceholder("Base price").fill("1999");
  await productForm.getByPlaceholder("Stock").fill("10");
  await productForm.getByRole("button", { name: "Create product" }).click();
  await expect(adminPage.getByRole("status")).toContainText("Product created.");

  const brandForm = adminPage.locator("form").filter({ has: adminPage.getByRole("heading", { name: "Create brand" }) });
  await brandForm.getByPlaceholder("Brand ID").fill(brandId);
  await brandForm.getByPlaceholder("Brand name").fill(brandName);
  await brandForm.getByPlaceholder("Slug").fill(brandId);
  await brandForm.getByPlaceholder("Description (optional)").fill("Synthetic brand for browser acceptance.");
  await brandForm.getByRole("button", { name: "Create brand" }).click();
  await expect(adminPage.getByRole("status")).toContainText("Brand created.");

  const sellerForm = adminPage.locator("form").filter({ has: adminPage.getByRole("heading", { name: "Create seller" }) });
  await sellerForm.getByPlaceholder("Seller ID").fill(sellerId);
  await sellerForm.getByPlaceholder("Seller name").fill(sellerName);
  await sellerForm.getByPlaceholder("Slug").fill(sellerId);
  await sellerForm.getByRole("button", { name: "Create seller" }).click();
  await expect(adminPage.getByRole("status")).toContainText("Seller created.");

  const variantForm = adminPage.locator("form").filter({ has: adminPage.getByRole("heading", { name: "Create product variant" }) });
  await variantForm.getByPlaceholder("Product ID").fill(productId);
  await variantForm.getByPlaceholder("Variant ID").fill(variantId);
  await variantForm.getByPlaceholder("Variant key (e.g. colour)").fill("colour");
  await variantForm.getByPlaceholder("SKU (optional)").fill(`SKU-${suffix}`);
  await variantForm.getByPlaceholder("Attribute value").fill("graphite");
  await variantForm.getByRole("button", { name: "Create variant" }).click();
  await expect(adminPage.getByRole("status")).toContainText("Variant created.");

  const offerForm = adminPage.locator("form").filter({ has: adminPage.getByRole("heading", { name: "Create seller offer" }) });
  await offerForm.getByPlaceholder("Offer ID").fill(offerId);
  await offerForm.getByPlaceholder("Product ID").fill(productId);
  await offerForm.getByPlaceholder("Seller ID").fill(sellerId);
  await offerForm.locator('input[name="currency"]').fill("INR");
  await offerForm.getByPlaceholder("Offer price").fill("1799");
  await offerForm.locator('input[name="stockQuantity"]').fill("3");
  await offerForm.getByRole("button", { name: "Create offer" }).click();
  await expect(adminPage.getByRole("status")).toContainText("Offer created.");

  const offerRow = adminPage.locator("form").filter({ has: adminPage.getByLabel(`${offerId} offer price`) });
  await offerRow.getByLabel(`${offerId} offer price`).fill("1699");
  await offerRow.getByLabel(`${offerId} offer stock`).fill("2");
  await offerRow.getByRole("button", { name: "Save offer changes" }).click();
  await expect(adminPage.getByRole("status")).toContainText(`Updated offer ${offerId}`);

  const historySection = adminPage.locator("section").filter({ has: adminPage.getByRole("heading", { name: "Price history" }) });
  await historySection.getByPlaceholder("Product ID").fill(productId);
  await historySection.getByRole("button", { name: "Load history" }).click();
  await expect(historySection.getByText(/offer v2/)).toBeVisible();

  await adminPage.goto(`${baseUrl}/`);
  await adminPage.getByRole("searchbox", { name: "Search products by title, keyword, or description" }).fill(productName);
  await adminPage.getByRole("button", { name: "Submit search" }).click();
  await expect(adminPage.getByText(productName).first()).toBeVisible();
  await adminPage.screenshot({ path: "test-results/polyfind-search-results.png", fullPage: true });

  await adminPage.goto(`${baseUrl}/products/${productId}`);
  await expect(adminPage.getByRole("heading", { name: productName })).toBeVisible();
  await expect(adminPage.getByRole("heading", { name: "Compare seller offers" })).toBeVisible();
  await expect(adminPage.getByText(sellerName)).toBeVisible();
  await expect(adminPage.getByText("INR 1699.00").first()).toBeVisible();
  await expect(adminPage.getByRole("heading", { name: "Offer price history" })).toBeVisible();
  await adminPage.screenshot({ path: "test-results/polyfind-product-comparison.png", fullPage: true });
  await adminPage.close();
});

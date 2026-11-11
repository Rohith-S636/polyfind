/**
 * S2-02 Deterministic Seed Dataset Generator and Validator for PolyFind
 * Generates reproducible catalog fixtures with stable identifiers, realistic
 * field distributions, and explicit provenance.
 */

import type { Category, CategoryId, Product, ProductId } from "../contracts/types.js";

export interface SeedDataset {
  seed: number;
  generatedAt: string;
  categories: Category[];
  products: Product[];
}

export interface SeedValidationIssue {
  severity: "error" | "warning";
  entity: "category" | "product";
  id?: string;
  field?: string;
  message: string;
}

export interface SeedValidationReport {
  valid: boolean;
  totalCategories: number;
  totalProducts: number;
  duplicateProductIds: string[];
  duplicateCategoryIds: string[];
  orphanedProducts: string[];
  issues: SeedValidationIssue[];
}

/**
 * Fast, deterministic Mulberry32 pseudo-random number generator.
 */
export class DeterministicRNG {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /**
   * Generates a floating point number in [0, 1).
   */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  nextFloat(min: number, max: number, decimals = 2): number {
    const val = this.next() * (max - min) + min;
    const factor = 10 ** decimals;
    return Math.round(val * factor) / factor;
  }

  choice<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new Error("Cannot choose from empty array");
    }
    const idx = Math.floor(this.next() * items.length);
    return items[idx]!;
  }
}

export const CANONICAL_CATEGORIES: readonly Category[] = [
  { id: "cat-outdoors", name: "Outdoors & Camping" },
  { id: "cat-electronics", name: "Consumer Electronics" },
  { id: "cat-kitchen", name: "Kitchen & Dining" },
  { id: "cat-fitness", name: "Fitness & Exercise" },
  { id: "cat-audio", name: "Pro Audio & Headphones" },
];

const PRODUCT_VOCABULARY: Record<CategoryId, { brands: string[]; adjectives: string[]; nouns: string[]; descriptions: string[] }> = {
  "cat-outdoors": {
    brands: ["Summit Forge", "Trailcraft", "Northstar Works"],
    adjectives: ["Ultralight", "Waterproof", "Insulated", "Heavy-Duty", "Compact", "Thermal", "All-Weather"],
    nouns: ["Backpack", "Tent", "Sleeping Bag", "Water Bottle", "Camp Stove", "Lantern", "Trekking Poles"],
    descriptions: [
      "Designed for rugged alpine expeditions and harsh weather conditions.",
      "Engineered with durable ripstop fabric and reinforced dual seams.",
      "Lightweight ergonomic construction ideal for multi-day backcountry trails.",
      "Keeps fluids cold for 24 hours or steaming hot for up to 12 hours.",
    ],
  },
  "cat-electronics": {
    brands: ["Pixel Harbor", "Circuit Grove", "Signal Foundry"],
    adjectives: ["Wireless", "Mechanical", "Ultra-Slim", "High-Speed", "Ergonomic", "Fast-Charging", "Modular"],
    nouns: ["Keyboard", "Mouse", "Monitor Hub", "USB-C Cable", "Power Bank", "Webcam", "Docking Station"],
    descriptions: [
      "Equipped with low-latency Bluetooth and programmable tactile switches.",
      "Supports 100W USB-C Power Delivery and dual 4K video output.",
      "Features precision optical sensors with adjustable DPI sensitivity up to 26000.",
      "Compact aluminum chassis engineered for optimal heat dissipation.",
    ],
  },
  "cat-kitchen": {
    brands: ["Hearth & Mill", "Copperline", "Daily Grind Co."],
    adjectives: ["Stainless Steel", "Cast Iron", "Ceramic", "Precision", "Non-Stick", "Manual", "Double-Walled"],
    nouns: ["Chef Knife", "Coffee Dripper", "Burr Grinder", "Skillet", "Espresso Tamper", "Kettle", "Cutting Board"],
    descriptions: [
      "Crafted from premium high-carbon stainless steel with a razor-sharp edge.",
      "Conical ceramic burrs ensure consistent particle size for specialty coffee extraction.",
      "Heavy-duty seasoned cast iron offering exceptional heat retention and even cooking.",
      "Gooseneck spout delivers precision flow control for pour-over brewing.",
    ],
  },
  "cat-fitness": {
    brands: ["Motion Forge", "Corewell", "Peak Practice"],
    adjectives: ["Adjustable", "High-Density", "Heavy-Duty", "Textured", "Non-Slip", "Elastic", "Ergonomic"],
    nouns: ["Dumbbell Set", "Yoga Mat", "Resistance Bands", "Kettlebell", "Foam Roller", "Jump Rope", "Pull-Up Bar"],
    descriptions: [
      "Constructed with premium high-density eco-friendly TPE foam for joint cushioning.",
      "Laser-etched knurled grip prevents slipping during intense training workouts.",
      "Multi-layered natural latex bands calibrated for variable resistance levels.",
      "Modular weight adjustment mechanism allows quick transitions between exercises.",
    ],
  },
  "cat-audio": {
    brands: ["Studio North", "Resonant Lab", "Clearwave"],
    adjectives: ["Active Noise-Cancelling", "Studio-Grade", "Hi-Res", "Open-Back", "Closed-Back", "Wireless", "Over-Ear"],
    nouns: ["Headphones", "Microphone", "Audio Interface", "Monitor Speakers", "IEM Earphones", "DAC Amplifier"],
    descriptions: [
      "Features 40mm planar magnetic drivers delivering ultra-low harmonic distortion.",
      "Equipped with advanced hybrid active noise cancellation and transparency modes.",
      "Cardioid condenser capsule engineered for broadcast-grade vocal clarity.",
      "Supports lossless 24-bit/192kHz digital-to-analog audio conversion.",
    ],
  },
};

/**
 * Generates a deterministic catalog dataset using Mulberry32 RNG.
 */
export function generateSeedDataset(options: { seed?: number; productCount?: number } = {}): SeedDataset {
  const seed = options.seed ?? 42;
  const productCount = options.productCount ?? 30;
  const rng = new DeterministicRNG(seed);

  const categories = CANONICAL_CATEGORIES.map((c) => ({ ...c }));
  const products: Product[] = [];

  for (let i = 1; i <= productCount; i++) {
    const category = rng.choice(categories);
    const vocab = PRODUCT_VOCABULARY[category.id] ?? PRODUCT_VOCABULARY["cat-outdoors"]!;

    const adj = rng.choice(vocab.adjectives);
    const noun = rng.choice(vocab.nouns);
    const desc = rng.choice(vocab.descriptions);
    const brand = rng.choice(vocab.brands);

    const padIndex = String(i).padStart(4, "0");
    const id = `prod-${padIndex}`;
    const name = `${adj} ${noun} ${category.name.split(" ")[0]} Model ${rng.nextInt(100, 999)}`;
    const description = `${desc} ${category.id === "cat-outdoors" ? "Designed for backpacking and demanding users." : category.id === "cat-electronics" ? "Compatible with keyboards and modern workstations." : "Perfect choice for demanding users."}`;
    const price = rng.nextFloat(9.99, 499.99, 2);
    const stock = rng.nextInt(0, 150);
    const version = 1;
    const updatedAt = new Date(Date.UTC(2026, 0, 1, 10, 0, 0) + i * 60000).toISOString();

    products.push({
      id,
      name,
      description,
      categoryId: category.id,
      price,
      currency: "USD",
      stock,
      availability: stock > 0 ? "in-stock" : "out-of-stock",
      brand,
      attributes: {
        material: category.id === "cat-electronics" ? "aluminum" : category.id === "cat-kitchen" ? "stainless steel" : "recycled composite",
        finish: rng.choice(["matte", "textured", "satin"]),
      },
      dataSource: "demo",
      version,
      updatedAt,
    });
  }

  return {
    seed,
    generatedAt: "2026-01-01T12:00:00.000Z",
    categories,
    products,
  };
}

/**
 * Validates dataset integrity, unique constraints, and schema conformance.
 */
export function validateSeedDataset(dataset: SeedDataset): SeedValidationReport {
  const issues: SeedValidationIssue[] = [];
  const seenProductIds = new Set<string>();
  const duplicateProductIds: string[] = [];
  const seenCategoryIds = new Set<string>();
  const duplicateCategoryIds: string[] = [];
  const categoryIds = new Set(dataset.categories.map((c) => c.id));
  const orphanedProducts: string[] = [];

  // Validate Categories
  for (const cat of dataset.categories) {
    if (!cat.id || cat.id.trim().length === 0) {
      issues.push({ severity: "error", entity: "category", message: "Category ID is empty." });
    }
    if (!cat.name || cat.name.trim().length === 0) {
      issues.push({ severity: "error", entity: "category", id: cat.id, message: "Category Name is empty." });
    }
    if (seenCategoryIds.has(cat.id)) {
      duplicateCategoryIds.push(cat.id);
      issues.push({ severity: "error", entity: "category", id: cat.id, message: `Duplicate category ID: ${cat.id}` });
    } else {
      seenCategoryIds.add(cat.id);
    }
  }

  // Validate Products
  for (const prod of dataset.products) {
    if (!prod.id || prod.id.trim().length === 0) {
      issues.push({ severity: "error", entity: "product", message: "Product ID is empty." });
    }
    if (!/^prod-\d{4,}$/.test(prod.id)) {
      issues.push({ severity: "error", entity: "product", id: prod.id, field: "id", message: "Product ID must use the canonical prod-NNNN format." });
    }
    if (seenProductIds.has(prod.id)) {
      duplicateProductIds.push(prod.id);
      issues.push({ severity: "error", entity: "product", id: prod.id, message: `Duplicate product ID: ${prod.id}` });
    } else {
      seenProductIds.add(prod.id);
    }

    if (!categoryIds.has(prod.categoryId)) {
      orphanedProducts.push(prod.id);
      issues.push({
        severity: "error",
        entity: "product",
        id: prod.id,
        field: "categoryId",
        message: `Product references unknown categoryId: ${prod.categoryId}`,
      });
    }

    if (typeof prod.price !== "number" || !Number.isFinite(prod.price) || prod.price < 0) {
      issues.push({
        severity: "error",
        entity: "product",
        id: prod.id,
        field: "price",
        message: `Invalid price: ${prod.price}. Must be a finite non-negative number.`,
      });
    }
    if (prod.currency !== undefined && !/^[A-Z]{3}$/.test(prod.currency)) {
      issues.push({ severity: "error", entity: "product", id: prod.id, field: "currency", message: "Currency must be a three-letter uppercase code." });
    }
    if (prod.availability !== undefined && !["in-stock", "out-of-stock", "unknown"].includes(prod.availability)) {
      issues.push({ severity: "error", entity: "product", id: prod.id, field: "availability", message: "Availability is invalid." });
    }
    if (prod.imageUrl !== undefined && !isHttpUrl(prod.imageUrl)) {
      issues.push({ severity: "error", entity: "product", id: prod.id, field: "imageUrl", message: "Image URL must be an http(s) URL." });
    }
    if (prod.productUrl !== undefined && !isHttpUrl(prod.productUrl)) {
      issues.push({ severity: "error", entity: "product", id: prod.id, field: "productUrl", message: "Product URL must be an http(s) URL." });
    }

    if (typeof prod.stock !== "number" || !Number.isInteger(prod.stock) || prod.stock < 0) {
      issues.push({
        severity: "error",
        entity: "product",
        id: prod.id,
        field: "stock",
        message: `Invalid stock: ${prod.stock}. Must be a non-negative integer.`,
      });
    }

    function isHttpUrl(value: string): boolean {
      try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:";
      } catch {
        return false;
      }
    }

    if (typeof prod.version !== "number" || !Number.isInteger(prod.version) || prod.version <= 0) {
      issues.push({
        severity: "error",
        entity: "product",
        id: prod.id,
        field: "version",
        message: `Invalid version: ${prod.version}. Must be a positive integer.`,
      });
    }

    if (!prod.updatedAt || Number.isNaN(Date.parse(prod.updatedAt))) {
      issues.push({
        severity: "error",
        entity: "product",
        id: prod.id,
        field: "updatedAt",
        message: `Invalid updatedAt timestamp: ${prod.updatedAt}`,
      });
    }
  }

  return {
    valid: issues.every((i) => i.severity !== "error"),
    totalCategories: dataset.categories.length,
    totalProducts: dataset.products.length,
    duplicateProductIds,
    duplicateCategoryIds,
    orphanedProducts,
    issues,
  };
}

/**
 * Catalog API Client for PolyFind UI
 * Strictly calls the documented REST API endpoints without connecting directly to databases.
 * Supports mock-data mode for isolated client development and component testing.
 */

import type { Product } from "../contracts/types.js";
import type { CatalogApiResponse, CatalogClientOptions, CatalogUIState } from "./types.js";

export class CatalogApiClient {
  private baseUrl: string;
  private mode: "live" | "mock";
  private mockProducts: Product[];

  constructor(options: CatalogClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? "";
    this.mode = options.mode ?? "mock";
    this.mockProducts = options.mockProducts ? [...options.mockProducts] : [];
  }

  setMockProducts(products: Product[]): void {
    this.mockProducts = [...products];
  }

  setMode(mode: "live" | "mock"): void {
    this.mode = mode;
  }

  getMode(): "live" | "mock" {
    return this.mode;
  }

  async fetchCatalog(params: {
    q?: string | undefined;
    categoryId?: string | undefined;
    minPrice?: number | undefined;
    maxPrice?: number | undefined;
    inStock?: boolean | undefined;
    page?: number | undefined;
    limit?: number | undefined;
  } = {}): Promise<CatalogApiResponse> {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;

    if (this.mode === "mock") {
      // Execute filtering purely against mock catalog items in-memory
      let filtered = [...this.mockProducts];

      if (params.q) {
        const queryLower = params.q.toLowerCase();
        filtered = filtered.filter(
          (p) =>
            p.name.toLowerCase().includes(queryLower) ||
            p.description.toLowerCase().includes(queryLower),
        );
      }

      if (params.categoryId) {
        filtered = filtered.filter((p) => p.categoryId === params.categoryId);
      }

      if (params.minPrice !== undefined) {
        filtered = filtered.filter((p) => p.price >= params.minPrice!);
      }

      if (params.maxPrice !== undefined) {
        filtered = filtered.filter((p) => p.price <= params.maxPrice!);
      }

      if (params.inStock !== undefined) {
        filtered = filtered.filter((p) => (params.inStock ? p.stock > 0 : p.stock === 0));
      }

      const total = filtered.length;
      const totalPages = Math.max(1, Math.ceil(total / limit));
      const offset = (page - 1) * limit;
      const items = filtered.slice(offset, offset + limit);

      return {
        items,
        page,
        limit,
        total,
        totalPages,
      };
    }

    // Live mode: Constructs standardized URL query string to call GET /api/products
    const url = new URL("/api/products", this.baseUrl || "http://localhost:3000");
    if (params.q) url.searchParams.set("q", params.q);
    if (params.categoryId) url.searchParams.set("categoryId", params.categoryId);
    if (params.minPrice !== undefined) url.searchParams.set("minPrice", String(params.minPrice));
    if (params.maxPrice !== undefined) url.searchParams.set("maxPrice", String(params.maxPrice));
    if (params.inStock !== undefined) url.searchParams.set("inStock", String(params.inStock));
    url.searchParams.set("page", String(page));
    url.searchParams.set("limit", String(limit));

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      let errorMessage = `HTTP error ${response.status}`;
      try {
        const errJson = (await response.json()) as { error?: { message?: string } };
        if (errJson.error?.message) {
          errorMessage = errJson.error.message;
        }
      } catch {
        // use default error message
      }
      throw new Error(errorMessage);
    }

    const data = (await response.json()) as CatalogApiResponse;
    return data;
  }
}

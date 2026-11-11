/**
 * Search API Client for PolyFind UI
 * Connects the UI to the search orchestrator API endpoint (/api/search).
 * Supports mock mode with deterministic candidate scoring and freshness metadata.
 */

import type { Product, SearchRequest, SearchResponse } from "../contracts/types.js";

export interface SearchClientOptions {
  baseUrl?: string;
  mode?: "live" | "mock";
  mockCatalog?: Product[];
}

export class SearchApiClient {
  private baseUrl: string;
  private mode: "live" | "mock";
  private mockCatalog: Product[];

  constructor(options: SearchClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? "";
    this.mode = options.mode ?? "mock";
    this.mockCatalog = options.mockCatalog ? [...options.mockCatalog] : [];
  }

  setMockCatalog(catalog: Product[]): void {
    this.mockCatalog = [...catalog];
  }

  setMode(mode: "live" | "mock"): void {
    this.mode = mode;
  }

  getMode(): "live" | "mock" {
    return this.mode;
  }

  async search(request: SearchRequest): Promise<SearchResponse> {
    const start = performance.now();

    if (this.mode === "mock") {
      let filtered = [...this.mockCatalog];
      const queryLower = request.query.toLowerCase().trim();

      if (queryLower) {
        filtered = filtered.filter(
          (p) =>
            p.name.toLowerCase().includes(queryLower) ||
            p.description.toLowerCase().includes(queryLower),
        );
      }

      if (request.filters.categoryId) {
        filtered = filtered.filter((p) => p.categoryId === request.filters.categoryId);
      }
      if (request.filters.minPrice !== undefined) {
        filtered = filtered.filter((p) => p.price >= request.filters.minPrice!);
      }
      if (request.filters.maxPrice !== undefined) {
        filtered = filtered.filter((p) => p.price <= request.filters.maxPrice!);
      }
      if (request.filters.inStock !== undefined) {
        filtered = filtered.filter((p) => (request.filters.inStock ? p.stock > 0 : p.stock === 0));
      }

      const total = filtered.length;
      const offset = (request.page - 1) * request.limit;
      const paged = filtered.slice(offset, offset + request.limit);

      const items = paged.map((product, idx) => ({
        product,
        score: Math.max(0.1, Math.round((1 - idx * 0.05) * 100) / 100),
      }));

      const elapsedMs = Math.round((performance.now() - start) * 100) / 100;

      return {
        items,
        page: request.page,
        total,
        strategy: "adaptive-hybrid-mock",
        timings: {
          totalMs: elapsedMs,
          retrievalMs: Math.round(elapsedMs * 0.7 * 100) / 100,
          validationMs: Math.round(elapsedMs * 0.3 * 100) / 100,
        },
        freshness: {
          mode: request.freshnessMode,
          status: "verified",
          checkedAt: new Date().toISOString(),
        },
      };
    }

    // Live mode: GET /api/search
    const url = new URL("/api/search", this.baseUrl || "http://localhost:3000");
    url.searchParams.set("q", request.query);
    url.searchParams.set("page", String(request.page));
    url.searchParams.set("limit", String(request.limit));
    url.searchParams.set("freshnessMode", request.freshnessMode);
    if (request.filters.categoryId) url.searchParams.set("categoryId", request.filters.categoryId);
    if (request.filters.minPrice !== undefined) url.searchParams.set("minPrice", String(request.filters.minPrice));
    if (request.filters.maxPrice !== undefined) url.searchParams.set("maxPrice", String(request.filters.maxPrice));
    if (request.filters.inStock !== undefined) url.searchParams.set("inStock", String(request.filters.inStock));
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      let errorMessage = `Search failed with HTTP ${response.status}`;
      try {
        const errJson = (await response.json()) as { error?: { message?: string } };
        if (errJson.error?.message) {
          errorMessage = errJson.error.message;
        }
      } catch {
        // use fallback error message
      }
      throw new Error(errorMessage);
    }

    const data = (await response.json()) as SearchResponse;
    return data;
  }
}

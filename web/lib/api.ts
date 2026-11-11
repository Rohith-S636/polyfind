import type { Product, SearchResponse } from "../../src/contracts/types";

export interface HealthResponse {
  status: string;
  service: string;
  version: string;
  dependencies: Record<string, string>;
}

export interface SearchApiParams {
  query?: string;
  categoryId?: string;
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  freshnessMode?: "strict" | "best-effort";
  sort?: "relevance" | "price-asc" | "price-desc" | "updatedAt" | "name";
  page?: number;
  limit?: number;
}

export interface SearchApiResult {
  items: Array<{
    product: Product;
    score?: number;
  }>;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  strategy?: string;
  timings?: {
    totalMs: number;
    retrievalMs?: number;
    validationMs?: number;
  };
  freshness?: {
    mode: "strict" | "best-effort";
    status: "verified" | "degraded" | "unavailable";
    checkedAt: string;
  };
  sort: string;
  source: "search" | "catalog";
}

export function getApiBaseUrl(): string {
  if (typeof window !== "undefined") {
    // In client browser:
    // If an explicit API base URL is defined in env, use it.
    // Otherwise use empty string so the browser hits current origin / Next.js proxy rewrite.
    return process.env.NEXT_PUBLIC_API_BASE_URL || "";
  }
  // On server (SSR):
  return process.env.POLYFIND_API_URL || "http://127.0.0.1:3001";
}

async function handleResponse<T>(res: Response, fallbackMessage: string): Promise<T> {
  if (!res.ok) {
    let msg = `${fallbackMessage} (HTTP ${res.status})`;
    try {
      const err = await res.json();
      if (err?.error?.message) {
        msg = err.error.message;
      }
    } catch {
      // Keep default error message
    }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

export async function fetchHealth(): Promise<HealthResponse> {
  const base = getApiBaseUrl();
  const url = `${base}/api/health`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  return handleResponse<HealthResponse>(res, "Failed to connect to PolyFind API");
}

export async function fetchProductById(id: string): Promise<Product> {
  const base = getApiBaseUrl();
  const url = `${base}/api/products/${encodeURIComponent(id)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  const data = await handleResponse<{ item: Product }>(res, `Product ${id} not found`);
  return data.item;
}

export async function executeSearch(params: SearchApiParams): Promise<SearchApiResult> {
  const base = getApiBaseUrl();
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.max(1, Math.min(100, params.limit ?? 12));
  const q = params.query?.trim() || "";
  const sort = params.sort ?? "relevance";

  // When a query exists and sort is relevance (or default), we call the research-backed /api/search endpoint
  if (q && sort === "relevance") {
    const url = new URL(`${base || (typeof window !== "undefined" ? window.location.origin : "http://127.0.0.1:3000")}/api/search`);
    url.searchParams.set("q", q);
    url.searchParams.set("page", String(page));
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("freshnessMode", params.freshnessMode ?? "strict");

    if (params.categoryId) url.searchParams.set("categoryId", params.categoryId);
    if (params.minPrice !== undefined && !Number.isNaN(params.minPrice)) {
      url.searchParams.set("minPrice", String(params.minPrice));
    }
    if (params.maxPrice !== undefined && !Number.isNaN(params.maxPrice)) {
      url.searchParams.set("maxPrice", String(params.maxPrice));
    }
    if (params.inStock !== undefined) {
      url.searchParams.set("inStock", String(params.inStock));
    }

    const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
    const data = await handleResponse<SearchResponse>(res, "Search query failed");

    return {
      items: data.items,
      total: data.total,
      page: data.page,
      limit,
      totalPages: Math.max(1, Math.ceil(data.total / limit)),
      strategy: data.strategy,
      timings: data.timings,
      freshness: data.freshness,
      sort: "relevance",
      source: "search",
    };
  }

  // When browsing without a query, or when explicit sorting is selected (price, updatedAt, name):
  // We call /api/products which supports explicit database sorting and structured filters
  const url = new URL(`${base || (typeof window !== "undefined" ? window.location.origin : "http://127.0.0.1:3000")}/api/products`);
  if (q) url.searchParams.set("q", q);
  url.searchParams.set("page", String(page));
  url.searchParams.set("limit", String(limit));

  let apiSort: "relevance" | "price" | "updatedAt" | "name" = "relevance";
  if (sort === "price-asc" || sort === "price-desc") apiSort = "price";
  else if (sort === "updatedAt") apiSort = "updatedAt";
  else if (sort === "name") apiSort = "name";
  url.searchParams.set("sort", apiSort);

  if (params.categoryId) url.searchParams.set("categoryId", params.categoryId);
  if (params.minPrice !== undefined && !Number.isNaN(params.minPrice)) {
    url.searchParams.set("minPrice", String(params.minPrice));
  }
  if (params.maxPrice !== undefined && !Number.isNaN(params.maxPrice)) {
    url.searchParams.set("maxPrice", String(params.maxPrice));
  }
  if (params.inStock !== undefined) {
    url.searchParams.set("inStock", String(params.inStock));
  }

  const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  const data = await handleResponse<{
    items: Product[];
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    sort: string;
  }>(res, "Products request failed");

  let items = data.items.map((product) => ({ product }));

  // If user requested price descending, the API returns price ascending, so we reverse within the sorted view
  if (sort === "price-desc") {
    items = [...items].sort((a, b) => b.product.price - a.product.price);
  }

  return {
    items,
    total: data.total,
    page: data.page,
    limit: data.limit,
    totalPages: data.totalPages,
    sort,
    source: "catalog",
  };
}

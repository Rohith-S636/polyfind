/**
 * Deterministic Cache Key Generator for PolyFind
 * Enforces that all result-affecting query parameters and filters are encoded.
 */

import type { ProductFilters } from "../contracts/types.js";

export interface CacheKeyOptions {
  query: string;
  filters?: ProductFilters | undefined;
  page?: number | undefined;
  limit?: number | undefined;
  prefix?: string | undefined;
  strategy?: string | undefined;
}

/**
 * Generates a normalized, deterministic cache key from search parameters.
 */
export function buildSearchCacheKey(options: CacheKeyOptions): string {
  const prefix = options.prefix ?? "search";
  const normalizedQuery = (options.query || "").trim().toLowerCase();
  const page = options.page ?? 1;
  const limit = options.limit ?? 20;

  const filterParts: string[] = [];
  const filters = options.filters ?? {};

  if (filters.categoryId) {
    filterParts.push(`cat:${filters.categoryId.trim().toLowerCase()}`);
  }
  if (filters.minPrice !== undefined) {
    filterParts.push(`minp:${filters.minPrice}`);
  }
  if (filters.maxPrice !== undefined) {
    filterParts.push(`maxp:${filters.maxPrice}`);
  }
  if (filters.inStock !== undefined) {
    filterParts.push(`stock:${filters.inStock ? 1 : 0}`);
  }

  // Sort filter components deterministically
  filterParts.sort();

  const filterString = filterParts.length > 0 ? filterParts.join("&") : "nofilter";
  const strategyPart = options.strategy ? `:strat=${options.strategy}` : "";
  return `polyfind:v1:${prefix}:q=${encodeURIComponent(normalizedQuery)}:${filterString}${strategyPart}:p=${page}:l=${limit}`;
}

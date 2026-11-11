/**
 * UI State and Component Contracts for PolyFind
 */

import type { CategoryId, Product, ProductFilters } from "../contracts/types.js";

export interface CatalogPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface CatalogUIState {
  loading: boolean;
  error: string | null;
  empty: boolean;
  items: Product[];
  filters: ProductFilters & { q?: string };
  pagination: CatalogPagination;
  mode: "live" | "mock";
}

export interface CatalogClientOptions {
  baseUrl?: string;
  mode?: "live" | "mock";
  mockProducts?: Product[];
}

export interface CatalogApiResponse {
  items: Product[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

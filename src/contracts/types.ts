export type ProductId = string;
export type CategoryId = string;
export type SourceVersion = number;
export type CurrencyCode = string;
export type ProductAvailability = "in-stock" | "out-of-stock" | "unknown";
export type ProductDataSource = "demo" | "catalog";

export interface Category {
  id: CategoryId;
  name: string;
}

export interface Product {
  id: ProductId;
  /** Canonical product title. Kept as `name` for compatibility with existing contracts. */
  name: string;
  description: string;
  categoryId: CategoryId;
  price: number;
  currency?: CurrencyCode;
  stock: number;
  availability?: ProductAvailability;
  brand?: string;
  attributes?: Record<string, string>;
  imageUrl?: string;
  productUrl?: string;
  dataSource?: ProductDataSource;
  version: SourceVersion;
  updatedAt: string;
}

export interface ProductFilters {
  categoryId?: CategoryId;
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
}

export type FreshnessMode = "strict" | "best-effort";

export interface SearchRequest {
  query: string;
  filters: ProductFilters;
  freshnessMode: FreshnessMode;
  page: number;
  limit: number;
}

export interface SearchResultItem {
  product: Product;
  score: number;
}

export interface SearchTimings {
  totalMs: number;
  retrievalMs?: number;
  validationMs?: number;
}

export type FreshnessStatus = "verified" | "degraded" | "unavailable";

export interface FreshnessSummary {
  mode: FreshnessMode;
  status: FreshnessStatus;
  checkedAt: string;
}

export interface SearchResponse {
  items: SearchResultItem[];
  page: number;
  total: number;
  strategy: string;
  timings: SearchTimings;
  freshness: FreshnessSummary;
  /** Per-provider retrieval duration in milliseconds (canonical names: mysql, vector, graph). */
  sourceTimings?: Record<string, number> | undefined;
  /** True when this response was served from a validated cache entry. */
  cacheHit?: boolean | undefined;
}

export interface RetrievalRequest {
  query: string;
  filters: ProductFilters;
  limit: number;
}

export interface RetrievalCandidate {
  productId: ProductId;
  source: string;
  score: number;
  sourceVersion?: SourceVersion;
}

export interface RetrievalResult {
  candidates: RetrievalCandidate[];
  elapsedMs: number;
}

export interface RetrievalProvider {
  readonly name: string;
  retrieve(request: RetrievalRequest): Promise<RetrievalResult>;
}

export interface FreshnessCheck {
  productId: ProductId;
  sourceVersion: SourceVersion;
  status: FreshnessStatus;
  checkedAt: string;
}

export interface FreshnessVerifier {
  verify(productId: ProductId, sourceVersion: SourceVersion): Promise<FreshnessCheck>;
}

export interface CatalogReader {
  getProduct(productId: ProductId): Promise<Product | null>;
  getProducts?(productIds: readonly ProductId[]): Promise<Product[]>;
  listProducts(
    filters: ProductFilters,
    page: number,
    limit: number,
  ): Promise<{ items: Product[]; total: number }>;
}

export interface BenchmarkConfiguration {
  name: string;
  seed: number;
  repetitions: number;
  workloadId: string;
}

export interface HealthResponse {
  status: "ok";
  service: "polyfind-contracts";
  version: string;
}

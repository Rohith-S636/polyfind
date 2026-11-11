/**
 * Cache Contracts and Metrics for PolyFind Redis Cache
 */

import type { ProductId, SourceVersion } from "../contracts/types.js";

export interface CachedSearchResult<T = unknown> {
  key: string;
  cachedAt: number; // Unix timestamp ms
  ttlSeconds: number;
  productIds: ProductId[];
  versionSnapshots: Record<ProductId, SourceVersion>;
  data: T;
}

export interface CacheMetrics {
  hits: number;
  misses: number;
  invalidations: number;
  expirations: number;
  bypasses: number;
}

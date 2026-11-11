import type { CatalogReader, Product, ProductFilters, ProductId, SourceVersion } from "../contracts/types.js";
import type { CachedSearchResult } from "./types.js";

export interface CatalogCache {
  get<T>(key: string, currentVersions?: Map<ProductId, SourceVersion>): Promise<CachedSearchResult<T> | null>;
  set<T>(key: string, data: T, options?: { productIds?: ProductId[]; versionSnapshots?: Record<ProductId, SourceVersion>; ttlSeconds?: number }): Promise<void>;
  invalidateProduct(productId: ProductId): Promise<number>;
  invalidateListings(): Promise<number>;
  invalidateProductStrict(productId: ProductId): Promise<number>;
  invalidateListingsStrict(): Promise<number>;
}

export function productCacheKey(id: ProductId): string {
  return `polyfind:v1:product:${encodeURIComponent(id)}`;
}

export function listingCacheKey(filters: ProductFilters, page: number, limit: number): string {
  return `polyfind:v1:listing:${encodeURIComponent(JSON.stringify({ filters, page, limit }))}`;
}

export class CachedCatalogReader implements CatalogReader {
  constructor(
    private readonly source: CatalogReader,
    private readonly cache: CatalogCache,
    private readonly detailTtlSeconds = 60,
    private readonly listingTtlSeconds = 30,
  ) {}

  async getProduct(productId: ProductId): Promise<Product | null> {
    const key = productCacheKey(productId);
    const cached = await this.cache.get<Product>(key);
    if (cached) return cached.data;
    const product = await this.source.getProduct(productId);
    if (product) {
      await this.cache.set(key, product, {
        productIds: [product.id],
        versionSnapshots: { [product.id]: product.version },
        ttlSeconds: this.detailTtlSeconds,
      });
    }
    return product;
  }

  async getProducts(productIds: readonly ProductId[]): Promise<Product[]> {
    if (this.source.getProducts) {
      return this.source.getProducts(productIds);
    }
    const results = await Promise.all(productIds.map((id) => this.getProduct(id)));
    return results.filter((p): p is Product => p !== null);
  }

  async listProducts(filters: ProductFilters, page: number, limit: number): Promise<{ items: Product[]; total: number }> {
    const key = listingCacheKey(filters, page, limit);
    const cached = await this.cache.get<{ items: Product[]; total: number }>(key);
    if (cached) return cached.data;
    const result = await this.source.listProducts(filters, page, limit);
    await this.cache.set(key, result, {
      productIds: result.items.map((item) => item.id),
      versionSnapshots: Object.fromEntries(result.items.map((item) => [item.id, item.version])),
      ttlSeconds: this.listingTtlSeconds,
    });
    return result;
  }
}

import { createClient } from "redis";
import type { ProductId, SourceVersion } from "../contracts/types.js";
import type { CachedSearchResult, CacheMetrics } from "./types.js";

export type RedisConnectionStatus = "disconnected" | "connecting" | "connected" | "reconnecting";

export interface RedisCacheOptions {
  defaultTtlSeconds?: number;
  nowFn?: () => number;
  client?: ReturnType<typeof createClient>;
  connectTimeoutMs?: number;
}

function emptyMetrics(): CacheMetrics {
  return { hits: 0, misses: 0, invalidations: 0, expirations: 0, bypasses: 0 };
}

export class RedisCacheAdapter {
  private readonly client: ReturnType<typeof createClient>;
  private readonly defaultTtlSeconds: number;
  private readonly metrics: CacheMetrics = emptyMetrics();
  private status: RedisConnectionStatus = "disconnected";

  constructor(redisUrl: string, options: RedisCacheOptions = {}) {
    this.defaultTtlSeconds = options.defaultTtlSeconds ?? 60;
    this.client = options.client ?? createClient({
      url: redisUrl,
      socket: { connectTimeout: options.connectTimeoutMs ?? 5_000 },
    });
    this.client.on("ready", () => { this.status = "connected"; });
    this.client.on("reconnecting", () => { this.status = "reconnecting"; });
    this.client.on("end", () => { this.status = "disconnected"; });
    this.client.on("error", () => { if (this.status === "connected") this.status = "reconnecting"; });
  }

  async connect(): Promise<void> {
    if (this.client.isOpen) return;
    this.status = "connecting";
    await this.client.connect();
    this.status = "connected";
  }

  async close(): Promise<void> {
    if (!this.client.isOpen) {
      this.status = "disconnected";
      return;
    }
    await this.client.quit();
    this.status = "disconnected";
  }

  async ping(): Promise<boolean> {
    try {
      return (await this.client.ping()) === "PONG";
    } catch {
      return false;
    }
  }

  getStatus(): RedisConnectionStatus {
    return this.status;
  }

  async get<T = unknown>(
    key: string,
    currentVersions?: Map<ProductId, SourceVersion>,
  ): Promise<CachedSearchResult<T> | null> {
    if (!this.client.isReady) {
      this.metrics.bypasses += 1;
      return null;
    }
    try {
      const serialized = await this.client.get(key);
      if (!serialized) {
        this.metrics.misses += 1;
        return null;
      }
      let entry: CachedSearchResult<T>;
      try {
        entry = JSON.parse(serialized) as CachedSearchResult<T>;
      } catch {
        await this.client.del(key);
        this.metrics.misses += 1;
        return null;
      }
      if (currentVersions) {
        const stale = Object.entries(entry.versionSnapshots).some(([id, version]) => {
          const current = currentVersions.get(id);
          return current !== undefined && current > version;
        });
        if (stale) {
          await this.client.del(key);
          this.metrics.invalidations += 1;
          this.metrics.misses += 1;
          return null;
        }
      }
      this.metrics.hits += 1;
      return entry;
    } catch {
      this.metrics.bypasses += 1;
      return null;
    }
  }

  async set<T = unknown>(
    key: string,
    data: T,
    options: {
      productIds?: ProductId[];
      versionSnapshots?: Record<ProductId, SourceVersion>;
      ttlSeconds?: number;
    } = {},
  ): Promise<void> {
    if (!this.client.isReady) {
      this.metrics.bypasses += 1;
      return;
    }
    const ttlSeconds = options.ttlSeconds ?? this.defaultTtlSeconds;
    const entry: CachedSearchResult<T> = {
      key,
      cachedAt: Date.now(),
      ttlSeconds,
      productIds: options.productIds ?? [],
      versionSnapshots: options.versionSnapshots ?? {},
      data,
    };
    try {
      await this.client.set(key, JSON.stringify(entry), { EX: ttlSeconds });
      for (const productId of entry.productIds) {
        const indexKey = `polyfind:v1:product-keys:${productId}`;
        await this.client.sAdd(indexKey, key);
        await this.client.expire(indexKey, ttlSeconds * 2);
      }
    } catch {
      this.metrics.bypasses += 1;
    }
  }

  async invalidateProduct(productId: ProductId): Promise<number> {
    try {
      return await this.invalidateProductStrict(productId);
    } catch {
      this.metrics.bypasses += 1;
      return 0;
    }
  }

  async invalidateProductStrict(productId: ProductId): Promise<number> {
    if (!this.client.isReady) {
      throw new Error("Redis is unavailable.");
    }

    const indexKey = `polyfind:v1:product-keys:${productId}`;
    const keys = await this.client.sMembers(indexKey);
    await Promise.all(keys.map((key) => this.client.del(key)));
    await this.client.del(indexKey);
    this.metrics.invalidations += keys.length;
    return keys.length;
  }

  async invalidateListings(): Promise<number> {
    try {
      return await this.invalidateListingsStrict();
    } catch {
      this.metrics.bypasses += 1;
      return 0;
    }
  }

  async invalidateListingsStrict(): Promise<number> {
    if (!this.client.isReady) {
      throw new Error("Redis is unavailable.");
    }
    const keys: string[] = [];
    for await (const batch of this.client.scanIterator({ MATCH: "polyfind:v1:listing:*", COUNT: 100 })) {
      keys.push(...(Array.isArray(batch) ? batch : [batch]));
    }
    await Promise.all(keys.map((key) => this.client.del(key)));
    this.metrics.invalidations += keys.length;
    return keys.length;
  }

  async clear(): Promise<void> {
    if (!this.client.isReady) return;
    const keys: string[] = [];
    for await (const batch of this.client.scanIterator({ MATCH: "polyfind:v1:*", COUNT: 100 })) {
      keys.push(...(Array.isArray(batch) ? batch : [batch]));
    }
    await Promise.all(keys.map((key) => this.client.del(key)));
  }

  getMetrics(): CacheMetrics {
    return { ...this.metrics };
  }

  resetMetrics(): void {
    Object.assign(this.metrics, emptyMetrics());
  }
}

export class InMemoryCacheAdapter {
  private readonly entries = new Map<string, CachedSearchResult>();
  private readonly now: () => number;
  private readonly defaultTtlSeconds: number;
  private metrics = emptyMetrics();

  constructor(options: RedisCacheOptions = {}) {
    this.now = options.nowFn ?? (() => Date.now());
    this.defaultTtlSeconds = options.defaultTtlSeconds ?? 60;
  }

  async get<T = unknown>(key: string, currentVersions?: Map<ProductId, SourceVersion>): Promise<CachedSearchResult<T> | null> {
    const entry = this.entries.get(key) as CachedSearchResult<T> | undefined;
    if (!entry) { this.metrics.misses += 1; return null; }
    if ((this.now() - entry.cachedAt) / 1000 >= entry.ttlSeconds) {
      this.entries.delete(key); this.metrics.expirations += 1; this.metrics.misses += 1; return null;
    }
    if (currentVersions && Object.entries(entry.versionSnapshots).some(([id, version]) => (currentVersions.get(id) ?? version) > version)) {
      this.entries.delete(key); this.metrics.invalidations += 1; this.metrics.misses += 1; return null;
    }
    this.metrics.hits += 1;
    return entry;
  }

  async set<T = unknown>(key: string, data: T, options: { productIds?: ProductId[]; versionSnapshots?: Record<ProductId, SourceVersion>; ttlSeconds?: number } = {}): Promise<void> {
    this.entries.set(key, {
      key, cachedAt: this.now(), ttlSeconds: options.ttlSeconds ?? this.defaultTtlSeconds,
      productIds: options.productIds ?? [], versionSnapshots: options.versionSnapshots ?? {}, data,
    });
  }

  async invalidateProduct(productId: ProductId): Promise<number> {
    let count = 0;
    for (const [key, entry] of this.entries) {
      if (entry.productIds.includes(productId) || entry.versionSnapshots[productId] !== undefined) {
        this.entries.delete(key); count += 1;
      }

    }
    this.metrics.invalidations += count;
    return count;
  }

  async invalidateListings(): Promise<number> {
    let count = 0;
    for (const key of this.entries.keys()) {
      if (key.startsWith("polyfind:v1:listing:")) {
        this.entries.delete(key);
        count += 1;
      }
    }
    this.metrics.invalidations += count;
    return count;
  }

  async invalidateProductStrict(productId: ProductId): Promise<number> {
    return this.invalidateProduct(productId);
  }

  async invalidateListingsStrict(): Promise<number> {
    return this.invalidateListings();
  }

  async clear(): Promise<void> { this.entries.clear(); }
  getMetrics(): CacheMetrics { return { ...this.metrics }; }
  resetMetrics(): void { this.metrics = emptyMetrics(); }
  size(): number { return this.entries.size; }
}

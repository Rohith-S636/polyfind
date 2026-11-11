import type {
  CatalogReader,
  Product,
  ProductFilters,
  RetrievalCandidate,
  RetrievalProvider,
  RetrievalRequest,
  RetrievalResult,
  SearchRequest,
  SearchResponse,
} from "../contracts/types.js";
import { FreshnessValidator } from "../planner/freshness.js";
import { RetrievalPlanner, type PlannerMode } from "../planner/routing.js";
import { reciprocalRankFusion, type RrfSourceList } from "../fusion/rrf.js";
import { buildSearchCacheKey } from "../cache/keys.js";
import type { CatalogCache } from "../cache/catalog-cache.js";
import { SafeDatabaseError } from "../catalog/errors.js";

export interface SearchServiceOptions {
  catalog: CatalogReader;
  keywordProvider?: RetrievalProvider | undefined;
  providers?: readonly RetrievalProvider[] | undefined;
  semanticProvider?: RetrievalProvider | undefined;
  graphProvider?: RetrievalProvider | undefined;
  cache?: CatalogCache | undefined;
  cacheTtlSeconds?: number | undefined;
  planner?: RetrievalPlanner | undefined;
  plannerMode?: PlannerMode | undefined;
  timeoutMs?: number | undefined;
  hybrid?: boolean | undefined;
}

export interface SearchQueryOptions {
  query: string;
  filters: ProductFilters;
  page: number;
  limit: number;
  freshnessMode: SearchRequest["freshnessMode"];
  hybrid?: boolean | undefined;
}

export class KeywordRetrievalProvider implements RetrievalProvider {
  readonly name = "mysql";

  constructor(private readonly catalog: CatalogReader) {}

  async retrieve(request: RetrievalRequest): Promise<RetrievalResult> {
    const start = performance.now();
    const limit = Math.min(200, Math.max(1, request.limit > 0 ? request.limit * 4 : 100));
    const result = await this.catalog.listProducts(request.filters, 1, limit);
    const tokens = request.query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const candidates = result.items
      .map((product) => {
        const text = `${product.name} ${product.description}`.toLocaleLowerCase();
        const matches = tokens.filter((token) => text.includes(token)).length;
        return {
          productId: product.id,
          source: this.name,
          score: tokens.length === 0 ? 0 : matches / tokens.length,
          sourceVersion: product.version,
        };
      })
      .filter((candidate) => tokens.length === 0 || candidate.score > 0)
      .sort((left, right) => right.score - left.score || left.productId.localeCompare(right.productId));

    return {
      candidates,
      elapsedMs: Math.round((performance.now() - start) * 100) / 100,
    };
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Search dependency timed out.")), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function matchesProductFilters(product: Product, filters?: ProductFilters): boolean {
  if (!filters) return true;
  if (filters.categoryId !== undefined && product.categoryId !== filters.categoryId) {
    return false;
  }
  if (filters.minPrice !== undefined && (product.price < filters.minPrice || !Number.isFinite(product.price))) {
    return false;
  }
  if (filters.maxPrice !== undefined && (product.price > filters.maxPrice || !Number.isFinite(product.price))) {
    return false;
  }
  if (filters.inStock !== undefined) {
    if (filters.inStock && product.stock <= 0) return false;
    if (!filters.inStock && product.stock > 0) return false;
  }
  return true;
}

export class SearchService {
  private readonly catalog: CatalogReader;
  private readonly providers: readonly RetrievalProvider[];
  private readonly cache?: CatalogCache | undefined;
  private readonly cacheTtlSeconds: number;
  private readonly planner: RetrievalPlanner;
  private readonly plannerMode: PlannerMode;
  private readonly timeoutMs: number;
  private readonly hybrid: boolean;
  private readonly freshness: FreshnessValidator;

  constructor(options: SearchServiceOptions) {
    this.catalog = options.catalog;
    const keywordProvider = options.keywordProvider ?? new KeywordRetrievalProvider(options.catalog);
    this.providers = options.providers ?? [
      keywordProvider,
      ...(options.semanticProvider ? [options.semanticProvider] : []),
      ...(options.graphProvider ? [options.graphProvider] : []),
    ];
    this.cache = options.cache;
    this.cacheTtlSeconds = options.cacheTtlSeconds ?? 60;
    this.planner = options.planner ?? new RetrievalPlanner();
    this.plannerMode = options.plannerMode ?? "adaptive";
    this.timeoutMs = options.timeoutMs ?? 2_000;
    this.hybrid = options.hybrid ?? false;
    this.freshness = new FreshnessValidator(options.catalog);
  }

  async search(options: SearchQueryOptions): Promise<SearchResponse> {
    const started = performance.now();

    const hasHybridSource = this.providers.some(
      (p) => p.name === "vector-semantic" || p.name === "vector" ||
        p.name === "graph" || p.name === "neo4j-graph",
    );
    const isHybridRequested = (options.hybrid ?? this.hybrid) && hasHybridSource;
    const effectiveStrategy = isHybridRequested ? "hybrid" : "keyword";

    // 1. Redis Cache lookup (gracefully bypassed on outage or miss)
    let cacheKey: string | undefined;
    if (this.cache) {
      try {
        cacheKey = buildSearchCacheKey({
          query: options.query,
          filters: options.filters,
          page: options.page,
          limit: options.limit,
          prefix: `listing:search:${options.freshnessMode}`,
          strategy: effectiveStrategy,
        });
        const cached = await this.cache.get<SearchResponse>(cacheKey);
        if (cached && cached.data) {
          let cacheValid = true;
          // In strict mode, verify cached items against MySQL authority
          if (options.freshnessMode === "strict") {
            const productIds = cached.data.items.map((i) => i.product.id);
            if (this.catalog.getProducts) {
              const currentProducts = await this.catalog.getProducts(productIds);
              const currentMap = new Map(currentProducts.map((p) => [p.id, p]));
              for (const item of cached.data.items) {
                const current = currentMap.get(item.product.id);
                if (!current || current.version !== item.product.version) {
                  cacheValid = false;
                  break;
                }
              }
            } else {
              for (const item of cached.data.items) {
                const current = await this.catalog.getProduct(item.product.id);
                if (!current || current.version !== item.product.version) {
                  cacheValid = false;
                  break;
                }
              }
            }
          }
          if (cacheValid) {
            return {
              ...cached.data,
              cacheHit: true,
              timings: {
                ...cached.data.timings,
                totalMs: Math.round((performance.now() - started) * 100) / 100,
              },
            };
          }
        }
      } catch {
        // Cache lookup failure is non-fatal: proceed to live retrieval
      }
    }

    // 2. Planning and store selection
    const request: SearchRequest = {
      query: options.query,
      filters: options.filters,
      freshnessMode: options.freshnessMode,
      page: options.page,
      limit: options.limit,
    };

    const plan = this.planner.plan(
      request,
      isHybridRequested ? "fixed-all-stores" : this.plannerMode,
      { vectorFreshness: "fresh", graphFreshness: "fresh" },
    );

    const retrievalStarted = performance.now();
    const selected = this.providers.filter((provider) => {
      if (provider.name === "mysql") return plan.decision.stores.includes("mysql");
      if (provider.name === "vector-semantic" || provider.name === "vector") {
        return plan.decision.stores.includes("vector");
      }
      if (provider.name === "graph" || provider.name === "neo4j-graph") {
        return plan.decision.stores.includes("graph");
      }
      return false;
    });

    const providers = selected.length > 0 ? selected : [this.providers[0] ?? new KeywordRetrievalProvider(this.catalog)];

    // 3. Parallel retrieval across selected providers with timeouts
    const results = await Promise.all(
      providers.map(async (provider) => {
        try {
          const res = await withTimeout(provider.retrieve(request), this.timeoutMs);
          return { provider, candidates: res.candidates, elapsedMs: res.elapsedMs, failed: false, error: null };
        } catch (error) {
          return {
            provider,
            candidates: [] as RetrievalCandidate[],
            elapsedMs: this.timeoutMs,
            failed: true,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }),
    );

    // MySQL is authoritative: if MySQL retrieval itself threw, surface controlled error
    const mysqlResult = results.find((r) => r.provider.name === "mysql");
    if (mysqlResult && mysqlResult.failed) {
      throw new SafeDatabaseError(mysqlResult.error);
    }

    const successfulResults = results.filter((r) => !r.failed);
    const successfulStores = successfulResults.map((r) =>
      r.provider.name === "vector-semantic" ? "vector" : r.provider.name === "neo4j-graph" ? "graph" : r.provider.name,
    );

    // 4. Fusion and ranking
    const sourceLists: RrfSourceList[] = [];
    for (const res of successfulResults) {
      if (res.candidates.length > 0) {
        sourceLists.push({ source: res.provider.name, candidates: res.candidates });
      }
    }

    let candidates: RetrievalCandidate[];
    if (sourceLists.length > 1) {
      // Multiple retrieval sources available -> Reciprocal Rank Fusion
      const fused = reciprocalRankFusion(sourceLists, {
        weights: { mysql: 0.50, "vector-semantic": 0.35, vector: 0.35, graph: 0.15, "neo4j-graph": 0.15 },
      });
      candidates = fused.map((f) => ({
        productId: f.productId,
        source: f.sources.join(","),
        score: f.rrfScore,
        ...(f.sourceVersion !== undefined ? { sourceVersion: f.sourceVersion } : {}),
      }));
    } else if (sourceLists.length === 1) {
      candidates = [...sourceLists[0]!.candidates];
    } else {
      candidates = [];
    }

    // 5. Freshness validation against authoritative MySQL catalog
    const validationStarted = performance.now();
    let validated;
    try {
      validated = await this.freshness.validateCandidates(candidates, { mode: options.freshnessMode });
    } catch (err) {
      throw new SafeDatabaseError(err);
    }

    // Structured filter verification against authoritative hydrated products
    const safe = validated.candidates
      .filter((candidate) => candidate.safeToPresent && candidate.product !== null)
      .filter((candidate) => matchesProductFilters(candidate.product!, options.filters))
      .map((candidate) => ({ product: candidate.product!, score: candidate.candidate.score }));

    const offset = (options.page - 1) * options.limit;
    const items = safe.slice(offset, offset + options.limit);
    const freshnessStatus = validated.telemetry.unverifiableCandidates > 0
      ? "unavailable"
      : validated.telemetry.staleCandidates > 0
        ? options.freshnessMode === "best-effort" ? "degraded" : "unavailable"
        : "verified";

    const totalMs = Math.round((performance.now() - started) * 100) / 100;
    const strategyName = isHybridRequested
      ? `adaptive-${successfulStores.length > 0 ? successfulStores.join("+") : "mysql"}`
      : `${this.plannerMode}-${successfulStores.length > 0 ? successfulStores.join("+") : "mysql"}`;

    const response: SearchResponse = {
      items,
      page: options.page,
      total: safe.length,
      strategy: strategyName,
      timings: {
        totalMs,
        retrievalMs: Math.round((performance.now() - retrievalStarted) * 100) / 100,
        validationMs: Math.round((performance.now() - validationStarted) * 100) / 100,
      },
      freshness: {
        mode: options.freshnessMode,
        status: freshnessStatus,
        checkedAt: new Date().toISOString(),
      },
      cacheHit: false,
      sourceTimings: Object.fromEntries(results.map((result) => [
        result.provider.name === "vector-semantic" || result.provider.name === "vector"
          ? "vector"
          : result.provider.name === "neo4j-graph" ? "graph" : result.provider.name,
        result.elapsedMs,
      ])),
    };

    // 6. Redis Cache store (if cache configured and response is verified)
    if (this.cache && cacheKey && freshnessStatus === "verified" && items.length > 0) {
      try {
        await this.cache.set(cacheKey, response, {
          productIds: items.map((i) => i.product.id),
          versionSnapshots: Object.fromEntries(items.map((i) => [i.product.id, i.product.version])),
          ttlSeconds: this.cacheTtlSeconds,
        });
      } catch {
        // Cache write failure is non-fatal
      }
    }

    return response;
  }
}

export class InMemoryCatalog implements CatalogReader {
  private readonly products: Product[];

  constructor(products: readonly Product[]) {
    this.products = products.map((product) => ({ ...product }));
  }

  async getProduct(productId: string): Promise<Product | null> {
    return this.products.find((product) => product.id === productId) ?? null;
  }

  async getProducts(productIds: readonly string[]): Promise<Product[]> {
    const idSet = new Set(productIds);
    return this.products.filter((product) => idSet.has(product.id)).map((product) => ({ ...product }));
  }

  async listProducts(
    filters: ProductFilters,
    page: number,
    limit: number,
  ): Promise<{ items: Product[]; total: number }> {
    const filtered = this.products.filter((product) =>
      (filters.categoryId === undefined || product.categoryId === filters.categoryId) &&
      (filters.minPrice === undefined || product.price >= filters.minPrice) &&
      (filters.maxPrice === undefined || product.price <= filters.maxPrice) &&
      (filters.inStock === undefined || (filters.inStock ? product.stock > 0 : product.stock === 0)),
    );
    const offset = (page - 1) * limit;
    return { items: filtered.slice(offset, offset + limit), total: filtered.length };
  }

  listAll(): Product[] {
    return this.products.map((product) => ({ ...product }));
  }
}

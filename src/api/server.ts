import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { healthCheck } from "../contracts/health.js";
import { ContractValidationError } from "../contracts/errors.js";
import { parseSearchRequest } from "../contracts/validation.js";
import type { CatalogReader, Product, ProductFilters } from "../contracts/types.js";
import {
  CatalogValidationError,
  NotFoundError,
  OfferVersionConflictError,
  SafeDatabaseError,
} from "../catalog/errors.js";
import {
  type RelationalStore,
  InMemoryRelationalStore,
  type CreateOfferInput,
  type UpdateOfferInput,
  type OfferAvailability,
  type ListOffersOptions,
  type ListPriceHistoryOptions,
  type SellerStatus,
  type ListProductsOptions,
  type PaginatedProducts,
  type CreateProductInput,
  type UpdateProductInput,
  type SellerInput,
  type BrandInput,
  type ProductVariantInput,
} from "../catalog/index.js";
import { SearchService } from "./search.js";
import type { RedisConnectionStatus } from "../cache/redis-adapter.js";
import type { Neo4jStatus } from "../sync/neo4j-driver.js";
import type { VectorRuntimeHealth } from "../retrieval/vector-lifecycle.js";

const MAX_LIMIT = 100;

export interface ApiServerOptions {
  catalog: CatalogReader;
  relational?: RelationalStore | undefined;
  productList?: ((options: ListProductsOptions) => Promise<PaginatedProducts>) | undefined;
  createProduct?: ((input: CreateProductInput) => Promise<Product>) | undefined;
  updateProduct?: ((id: string, patch: UpdateProductInput, expectedVersion?: number) => Promise<Product>) | undefined;
  search?: SearchService | undefined;
  authSecret?: string | undefined;
  dependencyStatus?: Record<string, "available" | "not-configured" | "unavailable"> | undefined;
  redisStatus?: (() => RedisConnectionStatus) | undefined;
  graphStatus?: (() => Neo4jStatus) | undefined;
  vectorStatus?: (() => VectorRuntimeHealth) | undefined;
  syncHealth?: (() => Promise<unknown>) | undefined;
  mode?: "demo" | "live" | undefined;
  corsOrigin?: string | undefined;
  rateLimit?: { windowMs: number; maxRequests: number } | undefined;
}

export interface ApiServer {
  server: Server;
  start(port?: number, host?: string): Promise<number>;
  stop(): Promise<void>;
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Content-Length", Buffer.byteLength(payload));
  response.setHeader("Access-Control-Allow-Origin", response.getHeader("Access-Control-Allow-Origin") ?? "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
  response.end(payload);
}

function setSecurityHeaders(response: ServerResponse, origin: string): void {
  response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
}

function errorResponse(error: unknown): { status: number; body: object } {
  if (error instanceof ContractValidationError) {
    return { status: 400, body: { error: { code: error.code, message: error.message, issues: error.issues } } };
  }
  if (error instanceof CatalogValidationError) {
    return { status: 400, body: { error: { code: error.code, message: error.message } } };
  }
  if (error instanceof NotFoundError) {
    return { status: 404, body: { error: { code: error.code, message: error.message } } };
  }
  if (error instanceof OfferVersionConflictError) {
    return { status: 409, body: { error: { code: error.code, message: error.message } } };
  }
  if (error instanceof SafeDatabaseError) {
    return { status: 503, body: { error: { code: error.code, message: error.message } } };
  }
  return { status: 500, body: { error: { code: "INTERNAL_ERROR", message: "The request could not be completed." } } };
}

function checkMutationAuth(request: IncomingMessage, authSecret?: string): boolean {
  const secret = authSecret ?? process.env.AUTH_SECRET;
  if (!secret || secret.trim().length === 0) {
    return false;
  }
  const authHeader = request.headers["authorization"];
  if (typeof authHeader === "string" && authHeader.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.slice(7).trim();
    return token === secret.trim();
  }
  const apiKey = request.headers["x-api-key"];
  if (typeof apiKey === "string") {
    return apiKey.trim() === secret.trim();
  }
  return false;
}

function parseCommonPagination(url: URL): { page: number; limit: number } {
  const page = parseInteger(url.searchParams.get("page"), "page", 1);
  const limit = parseInteger(url.searchParams.get("limit"), "limit", 20);
  if (limit > MAX_LIMIT) throw new CatalogValidationError(`limit must be between 1 and ${MAX_LIMIT}.`);
  return { page, limit };
}

function parseOfferFilters(url: URL): ListOffersOptions {
  const { page, limit } = parseCommonPagination(url);
  const productId = url.searchParams.get("productId") ?? url.searchParams.get("product") ?? undefined;
  const sellerId = url.searchParams.get("sellerId") ?? url.searchParams.get("seller") ?? undefined;
  const variantId = url.searchParams.get("variantId") ?? url.searchParams.get("variant") ?? undefined;
  const availRaw = url.searchParams.get("availability");
  let availability: OfferAvailability | undefined;
  if (availRaw) {
    if (availRaw !== "available" && availRaw !== "unavailable" && availRaw !== "unknown_stock") {
      throw new CatalogValidationError("availability must be available, unavailable, or unknown_stock.");
    }
    availability = availRaw;
  }
  const minRaw = url.searchParams.get("minPrice");
  const maxRaw = url.searchParams.get("maxPrice");
  const minPrice = minRaw === null || minRaw === "" ? undefined : Number(minRaw);
  const maxPrice = maxRaw === null || maxRaw === "" ? undefined : Number(maxRaw);
  if (minPrice !== undefined && (!Number.isFinite(minPrice) || minPrice < 0)) throw new CatalogValidationError("minPrice must be a non-negative number.");
  if (maxPrice !== undefined && (!Number.isFinite(maxPrice) || maxPrice < 0)) throw new CatalogValidationError("maxPrice must be a non-negative number.");
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) throw new CatalogValidationError("minPrice cannot be greater than maxPrice.");
  const stockRaw = url.searchParams.get("inStock");
  const inStock = stockRaw === null ? undefined : stockRaw === "true" ? true : stockRaw === "false" ? false : (() => { throw new CatalogValidationError("inStock must be true or false."); })();
  const sort = url.searchParams.get("sort") ?? undefined;
  if (sort && !["price", "updatedAt", "id"].includes(sort)) throw new CatalogValidationError("sort must be price, updatedAt, or id.");
  const sortOrder = url.searchParams.get("sortOrder") ?? undefined;
  if (sortOrder && !["asc", "desc"].includes(sortOrder)) throw new CatalogValidationError("sortOrder must be asc or desc.");

  return {
    ...(productId ? { productId } : {}),
    ...(sellerId ? { sellerId } : {}),
    ...(variantId ? { variantId } : {}),
    ...(availability ? { availability } : {}),
    ...(minPrice !== undefined ? { minPrice } : {}),
    ...(maxPrice !== undefined ? { maxPrice } : {}),
    ...(inStock !== undefined ? { inStock } : {}),
    page,
    limit,
    ...(sort ? { sort: sort as "price" | "updatedAt" | "id" } : {}),
    ...(sortOrder ? { sortOrder: sortOrder as "asc" | "desc" } : {}),
  };
}

function parseHistoryFilters(url: URL): ListPriceHistoryOptions {
  const { page, limit } = parseCommonPagination(url);
  const productId = url.searchParams.get("productId") ?? url.searchParams.get("product") ?? undefined;
  const offerId = url.searchParams.get("offerId") ?? url.searchParams.get("offer") ?? undefined;
  const sellerId = url.searchParams.get("sellerId") ?? url.searchParams.get("seller") ?? undefined;
  const startDate = url.searchParams.get("startDate") ?? undefined;
  const endDate = url.searchParams.get("endDate") ?? undefined;
  if (startDate && Number.isNaN(Date.parse(startDate))) throw new CatalogValidationError("startDate must be a valid ISO date string.");
  if (endDate && Number.isNaN(Date.parse(endDate))) throw new CatalogValidationError("endDate must be a valid ISO date string.");
  const sortOrder = url.searchParams.get("sortOrder") ?? "desc";
  if (!["asc", "desc"].includes(sortOrder)) throw new CatalogValidationError("sortOrder must be asc or desc.");

  return {
    ...(productId ? { productId } : {}),
    ...(offerId ? { offerId } : {}),
    ...(sellerId ? { sellerId } : {}),
    ...(startDate ? { startDate } : {}),
    ...(endDate ? { endDate } : {}),
    page,
    limit,
    sortOrder: sortOrder as "asc" | "desc",
  };
}

function parseInteger(value: string | null, name: string, defaultValue: number): number {
  if (value === null || value === "") return defaultValue;
  if (!/^\d+$/.test(value)) throw new CatalogValidationError(`${name} must be a positive integer.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new CatalogValidationError(`${name} must be a positive integer.`);
  return parsed;
}

function parseFilters(url: URL): { q: string | undefined; filters: ProductFilters; page: number; limit: number; sort: string } {
  const page = parseInteger(url.searchParams.get("page"), "page", 1);
  const limit = parseInteger(url.searchParams.get("limit"), "limit", 20);
  if (limit > MAX_LIMIT) throw new CatalogValidationError(`limit must be between 1 and ${MAX_LIMIT}.`);
  const minRaw = url.searchParams.get("minPrice");
  const maxRaw = url.searchParams.get("maxPrice");
  const minPrice = minRaw === null || minRaw === "" ? undefined : Number(minRaw);
  const maxPrice = maxRaw === null || maxRaw === "" ? undefined : Number(maxRaw);
  if (minPrice !== undefined && (!Number.isFinite(minPrice) || minPrice < 0)) throw new CatalogValidationError("minPrice must be a non-negative number.");
  if (maxPrice !== undefined && (!Number.isFinite(maxPrice) || maxPrice < 0)) throw new CatalogValidationError("maxPrice must be a non-negative number.");
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) throw new CatalogValidationError("minPrice cannot be greater than maxPrice.");
  const stockRaw = url.searchParams.get("inStock");
  const inStock = stockRaw === null ? undefined : stockRaw === "true" ? true : stockRaw === "false" ? false : (() => { throw new CatalogValidationError("inStock must be true or false."); })();
  const categoryId = url.searchParams.get("category") ?? url.searchParams.get("categoryId") ?? undefined;
  const q = url.searchParams.get("q") ?? undefined;
  const sort = url.searchParams.get("sort") ?? "relevance";
  if (!["relevance", "name", "price", "updatedAt"].includes(sort)) throw new CatalogValidationError("sort must be relevance, name, price, or updatedAt.");
  return { q, filters: { ...(categoryId === undefined ? {} : { categoryId }), ...(minPrice === undefined ? {} : { minPrice }), ...(maxPrice === undefined ? {} : { maxPrice }), ...(inStock === undefined ? {} : { inStock }) }, page, limit, sort };
}

async function readJsonBody(request: IncomingMessage, maxBytes = 1_048_576): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let bytes = 0;
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        reject(new CatalogValidationError("Request payload exceeded maximum size limit."));
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        const text = Buffer.concat(chunks).toString("utf-8");
        resolve(JSON.parse(text));
      } catch {
        reject(new CatalogValidationError("Invalid JSON in request payload."));
      }
    });
    request.on("error", (err) => reject(err));
  });
}

async function handle(
  request: IncomingMessage,
  response: ServerResponse,
  options: ApiServerOptions,
  requestCounts: Map<string, { startedAt: number; count: number }>,
): Promise<void> {
  const origin = options.corsOrigin ?? "*";
  setSecurityHeaders(response, origin);
  const clientKey = request.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim()
    ?? request.socket.remoteAddress
    ?? "unknown";
  const rateLimit = options.rateLimit;
  if (rateLimit) {
    const now = Date.now();
    const current = requestCounts.get(clientKey);
    if (!current || now - current.startedAt >= rateLimit.windowMs) {
      requestCounts.set(clientKey, { startedAt: now, count: 1 });
    } else {
      current.count += 1;
      if (current.count > rateLimit.maxRequests) {
        sendJson(response, 429, { error: { code: "RATE_LIMITED", message: "Too many requests. Please try again later." } });
        return;
      }
    }
  }

  if (request.method === "OPTIONS") {
    response.statusCode = 204;
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept, Authorization, X-API-Key");
    response.end();
    return;
  }

  if (request.method !== "GET" && request.method !== "POST" && request.method !== "PUT" && request.method !== "PATCH") {
    sendJson(response, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "Only GET, POST, PUT, and PATCH requests are supported." } });
    return;
  }

  const url = new URL(request.url ?? "/", "http://localhost");
  const relational = options.relational!;

  try {
    // PUT / PATCH endpoints
    if (request.method === "PUT" || request.method === "PATCH") {
      const productMatch = /^\/api\/products\/([^/]+)$/.exec(url.pathname);
      if (productMatch && options.updateProduct) {
        if (!checkMutationAuth(request, options.authSecret)) {
          sendJson(response, 401, { error: { code: "UNAUTHORIZED", message: "Authentication required for catalogue mutations." } });
          return;
        }
        const rawBody = await readJsonBody(request);
        if (typeof rawBody !== "object" || rawBody === null || Array.isArray(rawBody)) {
          throw new CatalogValidationError("Request body must be a JSON object.");
        }
        const body = rawBody as Record<string, unknown>;
        const expectedVersion = body["expectedVersion"] === undefined ? undefined : Number(body["expectedVersion"]);
        if (expectedVersion !== undefined && (!Number.isInteger(expectedVersion) || expectedVersion < 1)) {
          throw new CatalogValidationError("expectedVersion must be a positive integer.");
        }
        const patch: UpdateProductInput = {};
        if (body["name"] !== undefined) patch.name = String(body["name"]);
        if (body["description"] !== undefined) patch.description = String(body["description"]);
        if (body["categoryId"] !== undefined) patch.categoryId = String(body["categoryId"]);
        if (body["price"] !== undefined) patch.price = Number(body["price"]);
        if (body["stock"] !== undefined) patch.stock = Number(body["stock"]);
        const updated = await options.updateProduct(decodeURIComponent(productMatch[1]!), patch, expectedVersion);
        sendJson(response, 200, { item: updated, version: updated.version });
        return;
      }

      const offerMatch = /^\/api\/offers\/([^/]+)$/.exec(url.pathname);
      if (offerMatch) {
        if (!checkMutationAuth(request, options.authSecret)) {
          sendJson(response, 401, { error: { code: "UNAUTHORIZED", message: "Authentication required for catalogue mutations." } });
          return;
        }
        const offerId = decodeURIComponent(offerMatch[1]!);
        const rawBody = await readJsonBody(request);
        if (typeof rawBody !== "object" || rawBody === null || Array.isArray(rawBody)) {
          throw new CatalogValidationError("Request body must be a JSON object.");
        }
        const body = rawBody as Record<string, unknown>;
        const versionVal = body["expectedVersion"] ?? body["version"] ?? url.searchParams.get("version");
        const expectedVersion = Number(versionVal);
        if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
          throw new CatalogValidationError("expectedVersion (or version) is required and must be a positive integer.");
        }
        const patch: UpdateOfferInput = {};
        if (body["currency"] !== undefined) patch.currency = String(body["currency"]);
        if (body["price"] !== undefined) patch.price = Number(body["price"]);
        if (body["stockQuantity"] !== undefined) patch.stockQuantity = body["stockQuantity"] === null ? null : Number(body["stockQuantity"]);
        if (body["availability"] !== undefined) patch.availability = body["availability"] as OfferAvailability;
        if (body["validFrom"] !== undefined) patch.validFrom = String(body["validFrom"]);
        if (body["validUntil"] !== undefined) patch.validUntil = body["validUntil"] === null ? null : String(body["validUntil"]);
        if (body["changeReason"] !== undefined) patch.changeReason = String(body["changeReason"]);
        if (body["requestId"] !== undefined) patch.requestId = String(body["requestId"]);

        const updated = await relational.updateOffer(offerId, patch, expectedVersion);
        sendJson(response, 200, { item: updated, version: updated.version });
        return;
      }

      sendJson(response, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed for this endpoint." } });
      return;
    }

    // POST endpoints
    if (request.method === "POST") {
      if (url.pathname === "/api/search") {
        const rawBody = await readJsonBody(request);
        if (typeof rawBody !== "object" || rawBody === null || Array.isArray(rawBody)) {
          throw new CatalogValidationError("Request body must be a JSON object.");
        }
        const body = rawBody as Record<string, unknown>;
        const queryVal = body["query"] ?? body["q"];
        if (typeof queryVal !== "string" || !queryVal.trim()) {
          throw new CatalogValidationError("query (or q) is required and must be non-empty.");
        }
        const requestPayload = {
          query: queryVal.trim(),
          filters: body["filters"] ?? {},
          page: body["page"] ?? 1,
          limit: body["limit"] ?? 20,
          freshnessMode: body["freshnessMode"] ?? "strict",
        };
        const searchRequest = parseSearchRequest(requestPayload);
        const hybrid = typeof body["hybrid"] === "boolean" ? body["hybrid"] : undefined;
        const result = await (options.search ?? new SearchService({ catalog: options.catalog })).search({
          ...searchRequest,
          ...(hybrid !== undefined ? { hybrid } : {}),
        });
        sendJson(response, 200, result);
        return;
      }

      if (url.pathname === "/api/brands") {
        if (!checkMutationAuth(request, options.authSecret)) {
          sendJson(response, 401, { error: { code: "UNAUTHORIZED", message: "Authentication required for catalogue mutations." } });
          return;
        }
        const rawBody = await readJsonBody(request);
        if (typeof rawBody !== "object" || rawBody === null || Array.isArray(rawBody)) {
          throw new CatalogValidationError("Request body must be a JSON object.");
        }
        const body = rawBody as Record<string, unknown>;
        if (typeof body["id"] !== "string" || typeof body["name"] !== "string" || typeof body["slug"] !== "string") {
          throw new CatalogValidationError("Brand requires string id, name, and slug.");
        }
        const input: BrandInput = {
          id: body["id"], name: body["name"], slug: body["slug"],
          ...(typeof body["description"] === "string" ? { description: body["description"] } : {}),
        };
        await relational.createBrand(input);
        sendJson(response, 201, { item: input });
        return;
      }

      const variantCreateMatch = /^\/api\/products\/([^/]+)\/variants$/.exec(url.pathname);
      if (variantCreateMatch) {
        if (!checkMutationAuth(request, options.authSecret)) {
          sendJson(response, 401, { error: { code: "UNAUTHORIZED", message: "Authentication required for catalogue mutations." } });
          return;
        }
        const productId = decodeURIComponent(variantCreateMatch[1]!);
        if (!(await options.catalog.getProduct(productId))) throw new NotFoundError("Product", productId);
        const rawBody = await readJsonBody(request);
        if (typeof rawBody !== "object" || rawBody === null || Array.isArray(rawBody)) {
          throw new CatalogValidationError("Request body must be a JSON object.");
        }
        const body = rawBody as Record<string, unknown>;
        if (typeof body["id"] !== "string" || typeof body["variantKey"] !== "string" ||
            typeof body["attributes"] !== "object" || body["attributes"] === null || Array.isArray(body["attributes"])) {
          throw new CatalogValidationError("Variant requires string id, string variantKey, and object attributes.");
        }
        const input: ProductVariantInput = {
          id: body["id"], productId, variantKey: body["variantKey"],
          attributes: body["attributes"] as Record<string, string>,
          ...(typeof body["sku"] === "string" || body["sku"] === null ? { sku: body["sku"] as string | null } : {}),
        };
        await relational.createProductVariant(input);
        sendJson(response, 201, { item: input });
        return;
      }

      if (url.pathname === "/api/sellers") {
        if (!checkMutationAuth(request, options.authSecret)) {
          sendJson(response, 401, { error: { code: "UNAUTHORIZED", message: "Authentication required for catalogue mutations." } });
          return;
        }
        const rawBody = await readJsonBody(request);
        if (typeof rawBody !== "object" || rawBody === null || Array.isArray(rawBody)) {
          throw new CatalogValidationError("Request body must be a JSON object.");
        }
        const body = rawBody as Record<string, unknown>;
        if (typeof body["id"] !== "string" || typeof body["name"] !== "string" || typeof body["slug"] !== "string") {
          throw new CatalogValidationError("Seller requires string id, name, and slug.");
        }
        const status = body["status"];
        if (status !== undefined && status !== "active" && status !== "inactive" && status !== "suspended") {
          throw new CatalogValidationError("status must be active, inactive, or suspended.");
        }
        const input: SellerInput = {
          id: body["id"], name: body["name"], slug: body["slug"],
          ...(status ? { status } : {}),
        };
        const created = await relational.createSeller(input);
        sendJson(response, 201, { item: created });
        return;
      }

      if (url.pathname === "/api/products" && options.createProduct) {
        if (!checkMutationAuth(request, options.authSecret)) {
          sendJson(response, 401, { error: { code: "UNAUTHORIZED", message: "Authentication required for catalogue mutations." } });
          return;
        }
        const rawBody = await readJsonBody(request);
        if (typeof rawBody !== "object" || rawBody === null || Array.isArray(rawBody)) {
          throw new CatalogValidationError("Request body must be a JSON object.");
        }
        const body = rawBody as Record<string, unknown>;
        if (typeof body["id"] !== "string" || typeof body["name"] !== "string" ||
            typeof body["description"] !== "string" || typeof body["categoryId"] !== "string" ||
            typeof body["price"] !== "number" || typeof body["stock"] !== "number") {
          throw new CatalogValidationError("Product requires string id, name, description, categoryId and numeric price and stock.");
        }
        const input: CreateProductInput = {
          id: body["id"], name: body["name"], description: body["description"],
          categoryId: body["categoryId"], price: body["price"], stock: body["stock"],
        };
        const created = await options.createProduct(input);
        sendJson(response, 201, { item: created });
        return;
      }

      if (url.pathname === "/api/offers") {
        if (!checkMutationAuth(request, options.authSecret)) {
          sendJson(response, 401, { error: { code: "UNAUTHORIZED", message: "Authentication required for catalogue mutations." } });
          return;
        }
        const rawBody = await readJsonBody(request);
        if (typeof rawBody !== "object" || rawBody === null || Array.isArray(rawBody)) {
          throw new CatalogValidationError("Request body must be a JSON object.");
        }
        const body = rawBody as Record<string, unknown>;
        if (!body["id"] || typeof body["id"] !== "string") throw new CatalogValidationError("Offer id is required.");
        if (!body["productId"] || typeof body["productId"] !== "string") throw new CatalogValidationError("Offer productId is required.");
        if (!body["sellerId"] || typeof body["sellerId"] !== "string") throw new CatalogValidationError("Offer sellerId is required.");
        if (!body["currency"] || typeof body["currency"] !== "string") throw new CatalogValidationError("Offer currency is required.");
        if (typeof body["price"] !== "number") throw new CatalogValidationError("Offer price must be a number.");
        if (!body["availability"] || typeof body["availability"] !== "string") throw new CatalogValidationError("Offer availability is required.");

        const input: CreateOfferInput = {
          id: body["id"].trim(),
          productId: body["productId"].trim(),
          sellerId: body["sellerId"].trim(),
          variantId: typeof body["variantId"] === "string" ? body["variantId"].trim() : null,
          currency: body["currency"].trim(),
          price: body["price"],
          stockQuantity: typeof body["stockQuantity"] === "number" ? body["stockQuantity"] : null,
          availability: body["availability"] as OfferAvailability,
          validFrom: typeof body["validFrom"] === "string" ? body["validFrom"] : undefined,
          validUntil: typeof body["validUntil"] === "string" ? body["validUntil"] : null,
          changeReason: typeof body["changeReason"] === "string" ? body["changeReason"] : undefined,
          requestId: typeof body["requestId"] === "string" ? body["requestId"] : undefined,
        };

        const created = await relational.createOffer(input);
        sendJson(response, 201, { item: created });
        return;
      }

      sendJson(response, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "Only GET requests are supported for this endpoint." } });
      return;
    }

    // GET endpoints
    if (url.pathname === "/api/health") {
      const syncHealth = options.syncHealth ? await options.syncHealth() : undefined;
      sendJson(response, 200, {
        ...healthCheck(),
        dependencies: {
          ...(options.dependencyStatus ?? {}),
          ...(options.redisStatus ? { redis: options.redisStatus() === "connected" ? "available" : "unavailable" } : {}),
          ...(options.graphStatus ? { graph: options.graphStatus() === "connected" ? "available" : "unavailable" } : {}),
          ...(options.vectorStatus ? {
            vector: options.vectorStatus().state === "available"
              ? "available"
              : options.vectorStatus().embedding === "not-configured"
                ? "not-configured"
                : "unavailable",
          } : {}),
        },
        ...(options.redisStatus ? { redisState: options.redisStatus() } : {}),
        ...(options.graphStatus ? { graphState: options.graphStatus() } : {}),
        ...(options.vectorStatus ? { vectorState: options.vectorStatus() } : {}),
        ...(syncHealth === undefined ? {} : { synchronization: syncHealth }),
        ...(options.mode === undefined ? {} : { mode: options.mode }),
      });
      return;
    }

    if (url.pathname === "/api/ready") {
      const catalogReady = options.dependencyStatus?.catalog === "available";
      sendJson(response, catalogReady ? 200 : 503, {
        status: catalogReady ? "ready" : "not-ready",
        mode: options.mode ?? "live",
      });
      return;
    }

    if (url.pathname === "/api/brands") {
      const items = await relational.listBrands();
      sendJson(response, 200, { items, total: items.length });
      return;
    }

    const brandMatch = /^\/api\/brands\/([^/]+)$/.exec(url.pathname);
    if (brandMatch) {
      const brandId = decodeURIComponent(brandMatch[1]!);
      const item = await relational.getBrand(brandId);
      if (!item) throw new NotFoundError("Brand", brandId);
      sendJson(response, 200, { item });
      return;
    }

    const variantsMatch = /^\/api\/products\/([^/]+)\/variants$/.exec(url.pathname);
    if (variantsMatch) {
      const productId = decodeURIComponent(variantsMatch[1]!);
      if (!(await options.catalog.getProduct(productId))) throw new NotFoundError("Product", productId);
      const items = await relational.listProductVariants(productId);
      sendJson(response, 200, { items, total: items.length });
      return;
    }

    const variantMatch = /^\/api\/variants\/([^/]+)$/.exec(url.pathname);
    if (variantMatch) {
      const variantId = decodeURIComponent(variantMatch[1]!);
      const item = await relational.getProductVariant(variantId);
      if (!item) throw new NotFoundError("Variant", variantId);
      sendJson(response, 200, { item });
      return;
    }

    if (url.pathname === "/api/sellers") {
      const { page, limit } = parseCommonPagination(url);
      const status = url.searchParams.get("status") as SellerStatus | undefined;
      if (status && !["active", "inactive", "suspended"].includes(status)) {
        throw new CatalogValidationError("status must be active, inactive, or suspended.");
      }
      const result = await relational.listSellers({ ...(status ? { status } : {}), page, limit });
      sendJson(response, 200, {
        items: result.items,
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: Math.max(1, Math.ceil(result.total / result.limit)),
      });
      return;
    }

    const sellerOffersMatch = /^\/api\/sellers\/([^/]+)\/offers$/.exec(url.pathname);
    if (sellerOffersMatch) {
      const sellerId = decodeURIComponent(sellerOffersMatch[1]!);
      const seller = await relational.getSeller(sellerId);
      if (!seller) throw new NotFoundError("Seller", sellerId);
      const filters = parseOfferFilters(url);
      const result = await relational.listOffers({ ...filters, sellerId: seller.id });
      sendJson(response, 200, {
        items: result.items,
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: Math.max(1, Math.ceil(result.total / result.limit)),
      });
      return;
    }

    const sellerMatch = /^\/api\/sellers\/([^/]+)$/.exec(url.pathname);
    if (sellerMatch) {
      const sellerId = decodeURIComponent(sellerMatch[1]!);
      const seller = await relational.getSeller(sellerId);
      if (!seller) throw new NotFoundError("Seller", sellerId);
      sendJson(response, 200, { item: seller });
      return;
    }

    if (url.pathname === "/api/offers") {
      const filters = parseOfferFilters(url);
      const result = await relational.listOffers(filters);
      sendJson(response, 200, {
        items: result.items,
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: Math.max(1, Math.ceil(result.total / result.limit)),
      });
      return;
    }

    const offerHistoryMatch = /^\/api\/offers\/([^/]+)\/price-history$/.exec(url.pathname);
    if (offerHistoryMatch) {
      const offerId = decodeURIComponent(offerHistoryMatch[1]!);
      const offer = await relational.getOffer(offerId);
      if (!offer) throw new NotFoundError("Offer", offerId);
      const filters = parseHistoryFilters(url);
      const result = await relational.getPriceHistory({ ...filters, offerId });
      sendJson(response, 200, {
        items: result.items,
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: Math.max(1, Math.ceil(result.total / result.limit)),
      });
      return;
    }

    const offerMatch = /^\/api\/offers\/([^/]+)$/.exec(url.pathname);
    if (offerMatch) {
      const offerId = decodeURIComponent(offerMatch[1]!);
      const offer = await relational.getOffer(offerId);
      if (!offer) throw new NotFoundError("Offer", offerId);
      sendJson(response, 200, { item: offer });
      return;
    }

    if (url.pathname === "/api/price-history") {
      const filters = parseHistoryFilters(url);
      const result = await relational.getPriceHistory(filters);
      sendJson(response, 200, {
        items: result.items,
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: Math.max(1, Math.ceil(result.total / result.limit)),
      });
      return;
    }

    if (url.pathname === "/api/products") {
      const parsed = parseFilters(url);
      if (options.productList) {
        const result = await options.productList({
          ...(parsed.q === undefined ? {} : { q: parsed.q }),
          filters: parsed.filters,
          page: parsed.page,
          limit: parsed.limit,
          sort: parsed.sort as "relevance" | "name" | "price" | "updatedAt",
        });
        sendJson(response, 200, {
          items: result.items,
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: Math.max(1, Math.ceil(result.total / result.limit)),
          sort: parsed.sort,
        });
        return;
      }
      const all = (await options.catalog.listProducts(parsed.filters, 1, 100)).items;
      const query = parsed.q?.trim().toLocaleLowerCase();
      const filtered = all.filter((product) =>
        (!query || `${product.name} ${product.description}`.toLocaleLowerCase().includes(query)) &&
        (parsed.filters.categoryId === undefined || product.categoryId === parsed.filters.categoryId) &&
        (parsed.filters.minPrice === undefined || product.price >= parsed.filters.minPrice) &&
        (parsed.filters.maxPrice === undefined || product.price <= parsed.filters.maxPrice) &&
        (parsed.filters.inStock === undefined || (parsed.filters.inStock ? product.stock > 0 : product.stock === 0)),
      );
      const sorted = [...filtered].sort((a, b) =>
        parsed.sort === "name"
          ? a.name.localeCompare(b.name)
          : parsed.sort === "price"
            ? a.price - b.price || a.id.localeCompare(b.id)
            : parsed.sort === "updatedAt"
              ? b.updatedAt.localeCompare(a.updatedAt)
              : a.id.localeCompare(b.id),
      );
      const offset = (parsed.page - 1) * parsed.limit;
      sendJson(response, 200, {
        items: sorted.slice(offset, offset + parsed.limit),
        page: parsed.page,
        limit: parsed.limit,
        total: sorted.length,
        totalPages: Math.max(1, Math.ceil(sorted.length / parsed.limit)),
        sort: parsed.sort,
      });
      return;
    }

    const productOffersMatch = /^\/api\/products\/([^/]+)\/offers$/.exec(url.pathname);
    if (productOffersMatch) {
      const productId = decodeURIComponent(productOffersMatch[1]!);
      const product = await options.catalog.getProduct(productId);
      if (!product) throw new NotFoundError("Product", productId);
      const filters = parseOfferFilters(url);
      const result = await relational.listOffers({ ...filters, productId });
      sendJson(response, 200, {
        items: result.items,
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: Math.max(1, Math.ceil(result.total / result.limit)),
      });
      return;
    }

    const productHistoryMatch = /^\/api\/products\/([^/]+)\/price-history$/.exec(url.pathname);
    if (productHistoryMatch) {
      const productId = decodeURIComponent(productHistoryMatch[1]!);
      const product = await options.catalog.getProduct(productId);
      if (!product) throw new NotFoundError("Product", productId);
      const filters = parseHistoryFilters(url);
      const result = await relational.getPriceHistory({ ...filters, productId });
      sendJson(response, 200, {
        items: result.items,
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: Math.max(1, Math.ceil(result.total / result.limit)),
      });
      return;
    }

    const productMatch = /^\/api\/products\/([^/]+)$/.exec(url.pathname);
    if (productMatch) {
      const product = await options.catalog.getProduct(decodeURIComponent(productMatch[1]!));
      if (!product) throw new NotFoundError("Product", productMatch[1]!);
      sendJson(response, 200, { item: product });
      return;
    }

    if (url.pathname === "/api/search") {
      const parsed = parseFilters(url);
      if (!parsed.q?.trim()) throw new CatalogValidationError("q is required and must be non-empty.");
      const freshnessMode = url.searchParams.get("freshnessMode") ?? "strict";
      const hybridParam = url.searchParams.get("hybrid");
      const hybrid = hybridParam === null ? undefined : hybridParam === "true";
      const request = parseSearchRequest({
        query: parsed.q,
        filters: parsed.filters,
        page: parsed.page,
        limit: parsed.limit,
        freshnessMode,
      });
      const result = await (options.search ?? new SearchService({ catalog: options.catalog })).search({
        ...request,
        ...(hybrid !== undefined ? { hybrid } : {}),
      });
      sendJson(response, 200, result);
      return;
    }

    sendJson(response, 404, { error: { code: "NOT_FOUND", message: "The requested endpoint was not found." } });
  } catch (error) {
    const formatted = errorResponse(error);
    sendJson(response, formatted.status, formatted.body);
  }
}

export function createApiServer(options: ApiServerOptions): ApiServer {
  if (options.mode === "live" && !options.relational) {
    throw new Error("Live API mode requires an explicit persistent relational repository.");
  }
  const resolvedOptions: ApiServerOptions = {
    ...options,
    relational: options.relational ?? new InMemoryRelationalStore(),
  };
  const requestCounts = new Map<string, { startedAt: number; count: number }>();
  const server = createServer((request, response) => {
    void handle(request, response, resolvedOptions, requestCounts);
  });
  return {
    server,
    start(port = 3000, host = "127.0.0.1") {
      return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => {
          server.removeListener("error", reject);
          const address = server.address();
          resolve(typeof address === "object" && address ? address.port : port);
        });
      });
    },
    stop() {
      return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}

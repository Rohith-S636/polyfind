import { ContractValidationError, type ContractErrorCode, type ContractIssue } from "./errors.js";
import type {
  BenchmarkConfiguration,
  Category,
  FreshnessSummary,
  Product,
  ProductFilters,
  SearchRequest,
  SearchResponse,
} from "./types.js";

const requestDefaults = {
  freshnessMode: "strict" as const,
  page: 1,
  limit: 20,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateObjectKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  issues: ContractIssue[],
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      issues.push({ path: path ? `${path}.${key}` : key, message: "Unknown field" });
    }
  }
}

function requiredString(
  value: Record<string, unknown>,
  key: string,
  path: string,
  issues: ContractIssue[],
): string | undefined {
  const candidate = value[key];
  if (typeof candidate !== "string" || candidate.trim() === "") {
    issues.push({ path: `${path}.${key}`, message: "Expected a non-empty string" });
    return undefined;
  }
  return candidate;
}

function optionalNumber(
  value: Record<string, unknown>,
  key: string,
  path: string,
  issues: ContractIssue[],
): number | undefined {
  const candidate = value[key];
  if (candidate === undefined) return undefined;
  if (typeof candidate !== "number" || !Number.isFinite(candidate)) {
    issues.push({ path: `${path}.${key}`, message: "Expected a finite number" });
    return undefined;
  }
  return candidate;
}

function parseProductFilters(
  value: unknown,
  path: string,
  issues: ContractIssue[],
): ProductFilters {
  if (value === undefined) return {};
  if (!isRecord(value)) {
    issues.push({ path, message: "Expected an object" });
    return {};
  }
  validateObjectKeys(value, ["categoryId", "minPrice", "maxPrice", "inStock"], path, issues);
  const categoryId = value.categoryId === undefined
    ? undefined
    : requiredString(value, "categoryId", path, issues);
  const minPrice = optionalNumber(value, "minPrice", path, issues);
  const maxPrice = optionalNumber(value, "maxPrice", path, issues);
  const inStock = value.inStock === undefined
    ? undefined
    : typeof value.inStock === "boolean"
      ? value.inStock
      : (issues.push({ path: `${path}.inStock`, message: "Expected a boolean" }), undefined);

  if (minPrice !== undefined && minPrice < 0) {
    issues.push({ path: `${path}.minPrice`, message: "Must be greater than or equal to 0" });
  }
  if (maxPrice !== undefined && maxPrice < 0) {
    issues.push({ path: `${path}.maxPrice`, message: "Must be greater than or equal to 0" });
  }
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
    issues.push({ path, message: "minPrice must not exceed maxPrice" });
  }
  return { ...(categoryId === undefined ? {} : { categoryId }), ...(minPrice === undefined ? {} : { minPrice }), ...(maxPrice === undefined ? {} : { maxPrice }), ...(inStock === undefined ? {} : { inStock }) };
}

function throwIfInvalid(
  code: ContractErrorCode,
  issues: ContractIssue[],
): void {
  if (issues.length > 0) throw new ContractValidationError(code, issues);
}

export function parseSearchRequest(input: unknown): SearchRequest {
  const issues: ContractIssue[] = [];
  if (!isRecord(input)) {
    throw new ContractValidationError("INVALID_REQUEST", [
      { path: "", message: "Expected a JSON object" },
    ]);
  }
  validateObjectKeys(input, ["query", "filters", "freshnessMode", "page", "limit"], "", issues);
  const query = requiredString(input, "query", "", issues);
  const filters = parseProductFilters(input.filters, "filters", issues);
  const freshnessMode = input.freshnessMode === undefined
    ? requestDefaults.freshnessMode
    : input.freshnessMode === "strict" || input.freshnessMode === "best-effort"
      ? input.freshnessMode
      : (issues.push({ path: "freshnessMode", message: "Expected strict or best-effort" }), requestDefaults.freshnessMode);
  const page = input.page === undefined
    ? requestDefaults.page
    : typeof input.page === "number" && Number.isInteger(input.page) && input.page >= 1
      ? input.page
      : (issues.push({ path: "page", message: "Expected an integer greater than or equal to 1" }), requestDefaults.page);
  const limit = input.limit === undefined
    ? requestDefaults.limit
    : typeof input.limit === "number" && Number.isInteger(input.limit) && input.limit >= 1 && input.limit <= 100
      ? input.limit
      : (issues.push({ path: "limit", message: "Expected an integer from 1 through 100" }), requestDefaults.limit);
  throwIfInvalid("INVALID_REQUEST", issues);
  return { query: query!, filters, freshnessMode, page, limit };
}

function parseProduct(input: unknown, path: string, issues: ContractIssue[]): Product | undefined {
  if (!isRecord(input)) {
    issues.push({ path, message: "Expected an object" });
    return undefined;
  }
  validateObjectKeys(input, ["id", "name", "description", "categoryId", "price", "currency", "stock", "availability", "brand", "attributes", "imageUrl", "productUrl", "dataSource", "version", "updatedAt"], path, issues);
  const id = requiredString(input, "id", path, issues);
  const name = requiredString(input, "name", path, issues);
  const description = requiredString(input, "description", path, issues);
  const categoryId = requiredString(input, "categoryId", path, issues);
  const updatedAt = requiredString(input, "updatedAt", path, issues);
  const price = optionalNumber(input, "price", path, issues);
  const currency = input.currency;
  const availability = input.availability;
  const brand = input.brand;
  const attributes = input.attributes;
  const imageUrl = input.imageUrl;
  const productUrl = input.productUrl;
  const dataSource = input.dataSource;
  const stock = input.stock;
  const version = input.version;
  if (price === undefined) issues.push({ path: `${path}.price`, message: "Expected a finite number" });
  else if (price < 0) issues.push({ path: `${path}.price`, message: "Must be greater than or equal to 0" });
  if (typeof stock !== "number" || !Number.isInteger(stock) || stock < 0) {
    issues.push({ path: `${path}.stock`, message: "Expected an integer greater than or equal to 0" });
  }
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    issues.push({ path: `${path}.version`, message: "Expected a positive integer" });
  }
  if (currency !== undefined && (typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency))) issues.push({ path: `${path}.currency`, message: "Expected a three-letter uppercase currency code" });
  if (availability !== undefined && (availability !== "in-stock" && availability !== "out-of-stock" && availability !== "unknown")) issues.push({ path: `${path}.availability`, message: "Expected in-stock, out-of-stock, or unknown" });
  if (brand !== undefined && (typeof brand !== "string" || brand.trim() === "")) issues.push({ path: `${path}.brand`, message: "Expected a non-empty string" });
  if (attributes !== undefined && (!isRecord(attributes) || Object.values(attributes).some((value) => typeof value !== "string"))) issues.push({ path: `${path}.attributes`, message: "Expected a string-valued object" });
  for (const [key, value] of [["imageUrl", imageUrl], ["productUrl", productUrl]] as const) {
    if (value !== undefined && (typeof value !== "string" || !/^https?:\/\//i.test(value))) issues.push({ path: `${path}.${key}`, message: "Expected an http(s) URL" });
  }
  if (dataSource !== undefined && dataSource !== "demo" && dataSource !== "catalog") issues.push({ path: `${path}.dataSource`, message: "Expected demo or catalog" });
  if (updatedAt !== undefined && Number.isNaN(Date.parse(updatedAt))) {
    issues.push({ path: `${path}.updatedAt`, message: "Expected an ISO-parseable timestamp" });
  }
  if (id === undefined || name === undefined || description === undefined || categoryId === undefined || updatedAt === undefined || price === undefined || typeof stock !== "number" || typeof version !== "number") return undefined;
  const product: Product = { id: id!, name: name!, description: description!, categoryId: categoryId!, price: price!, stock: stock as number, version: version as number, updatedAt };
  if (typeof currency === "string") product.currency = currency;
  if (availability === "in-stock" || availability === "out-of-stock" || availability === "unknown") product.availability = availability;
  if (typeof brand === "string") product.brand = brand;
  if (isRecord(attributes) && Object.values(attributes).every((value) => typeof value === "string")) product.attributes = attributes as Record<string, string>;
  if (typeof imageUrl === "string") product.imageUrl = imageUrl;
  if (typeof productUrl === "string") product.productUrl = productUrl;
  if (dataSource === "demo" || dataSource === "catalog") product.dataSource = dataSource;
  return product;
}

export function parseProductInput(input: unknown): Product {
  const issues: ContractIssue[] = [];
  const product = parseProduct(input, "product", issues);
  throwIfInvalid("INVALID_PRODUCT", issues);
  return product!;
}

export function parseCategoryInput(input: unknown): Category {
  const issues: ContractIssue[] = [];
  if (!isRecord(input)) throw new ContractValidationError("INVALID_PRODUCT", [{ path: "category", message: "Expected an object" }]);
  validateObjectKeys(input, ["id", "name"], "category", issues);
  const id = requiredString(input, "id", "category", issues);
  const name = requiredString(input, "name", "category", issues);
  throwIfInvalid("INVALID_PRODUCT", issues);
  return { id: id!, name: name! };
}

export function parseSearchResponse(input: unknown): SearchResponse {
  if (!isRecord(input)) throw new ContractValidationError("INVALID_RESPONSE", [{ path: "", message: "Expected a JSON object" }]);
  const issues: ContractIssue[] = [];
  validateObjectKeys(input, ["items", "page", "total", "strategy", "timings", "freshness"], "", issues);
  if (!Array.isArray(input.items)) issues.push({ path: "items", message: "Expected an array" });
  if (typeof input.page !== "number" || !Number.isInteger(input.page) || input.page < 1) issues.push({ path: "page", message: "Expected a positive integer" });
  if (typeof input.total !== "number" || !Number.isInteger(input.total) || input.total < 0) issues.push({ path: "total", message: "Expected a non-negative integer" });
  const strategy = requiredString(input, "strategy", "", issues);
  const timings = parseSearchTimings(input.timings, issues);
  const freshness = parseFreshnessSummaryForResponse(input.freshness, issues);
  const items: SearchResponse["items"] = [];
  if (Array.isArray(input.items)) {
    input.items.forEach((item, index) => {
      if (!isRecord(item)) {
        issues.push({ path: `items.${index}`, message: "Expected an object" });
        return;
      }
      validateObjectKeys(item, ["product", "score"], `items.${index}`, issues);
      const product = parseProduct(item.product, `items.${index}.product`, issues);
      if (typeof item.score !== "number" || !Number.isFinite(item.score)) issues.push({ path: `items.${index}.score`, message: "Expected a finite number" });
      if (product && typeof item.score === "number" && Number.isFinite(item.score)) items.push({ product, score: item.score });
    });
  }
  throwIfInvalid("INVALID_RESPONSE", issues);
  return { items, page: input.page as number, total: input.total as number, strategy: strategy!, timings, freshness };
}

export function parseBenchmarkConfiguration(input: unknown): BenchmarkConfiguration {
  const issues: ContractIssue[] = [];
  if (!isRecord(input)) throw new ContractValidationError("INVALID_CONFIGURATION", [{ path: "", message: "Expected a JSON object" }]);
  validateObjectKeys(input, ["name", "seed", "repetitions", "workloadId"], "", issues);
  const name = requiredString(input, "name", "", issues);
  const workloadId = requiredString(input, "workloadId", "", issues);
  const seed = input.seed;
  const repetitions = input.repetitions;
  if (typeof seed !== "number" || !Number.isInteger(seed)) issues.push({ path: "seed", message: "Expected an integer" });
  if (typeof repetitions !== "number" || !Number.isInteger(repetitions) || repetitions < 1) issues.push({ path: "repetitions", message: "Expected a positive integer" });
  throwIfInvalid("INVALID_CONFIGURATION", issues);
  return { name: name!, workloadId: workloadId!, seed: seed as number, repetitions: repetitions as number };
}

export function serializeContract(value: object): string {
  return JSON.stringify(value);
}

export function parseFreshnessSummary(input: unknown): FreshnessSummary {
  if (!isRecord(input)) throw new ContractValidationError("INVALID_RESPONSE", [{ path: "freshness", message: "Expected an object" }]);
  const issues: ContractIssue[] = [];
  validateObjectKeys(input, ["mode", "status", "checkedAt"], "freshness", issues);
  const mode = input.mode;
  const status = input.status;
  const checkedAt = requiredString(input, "checkedAt", "freshness", issues);
  if (mode !== "strict" && mode !== "best-effort") issues.push({ path: "freshness.mode", message: "Expected strict or best-effort" });
  if (status !== "verified" && status !== "degraded" && status !== "unavailable") issues.push({ path: "freshness.status", message: "Expected verified, degraded, or unavailable" });
  throwIfInvalid("INVALID_RESPONSE", issues);
  return { mode: mode as FreshnessSummary["mode"], status: status as FreshnessSummary["status"], checkedAt: checkedAt! };
}

function parseSearchTimings(
  input: unknown,
  issues: ContractIssue[],
): SearchResponse["timings"] {
  if (!isRecord(input)) {
    issues.push({ path: "timings", message: "Expected an object" });
    return { totalMs: 0 };
  }
  validateObjectKeys(input, ["totalMs", "retrievalMs", "validationMs"], "timings", issues);
  const totalMs = optionalNumber(input, "totalMs", "timings", issues);
  const retrievalMs = optionalNumber(input, "retrievalMs", "timings", issues);
  const validationMs = optionalNumber(input, "validationMs", "timings", issues);
  if (totalMs === undefined) issues.push({ path: "timings.totalMs", message: "Expected a finite number" });
  return {
    totalMs: totalMs ?? 0,
    ...(retrievalMs === undefined ? {} : { retrievalMs }),
    ...(validationMs === undefined ? {} : { validationMs }),
  };
}

function parseFreshnessSummaryForResponse(
  input: unknown,
  issues: ContractIssue[],
): FreshnessSummary {
  if (!isRecord(input)) {
    issues.push({ path: "freshness", message: "Expected an object" });
    return { mode: "strict", status: "unavailable", checkedAt: "" };
  }
  validateObjectKeys(input, ["mode", "status", "checkedAt"], "freshness", issues);
  const mode = input.mode;
  const status = input.status;
  const checkedAt = requiredString(input, "checkedAt", "freshness", issues);
  if (mode !== "strict" && mode !== "best-effort") issues.push({ path: "freshness.mode", message: "Expected strict or best-effort" });
  if (status !== "verified" && status !== "degraded" && status !== "unavailable") issues.push({ path: "freshness.status", message: "Expected verified, degraded, or unavailable" });
  return {
    mode: mode === "best-effort" ? "best-effort" : "strict",
    status: status === "degraded" ? "degraded" : status === "unavailable" ? "unavailable" : "verified",
    checkedAt: checkedAt ?? "",
  };
}

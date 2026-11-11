import { randomUUID } from "node:crypto";
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import type { CatalogCache } from "../cache/catalog-cache.js";
import {
  CatalogValidationError,
  NotFoundError,
  OfferVersionConflictError,
  SafeDatabaseError,
} from "./errors.js";

export type OfferAvailability = "available" | "unavailable" | "unknown_stock";
export type OfferVersion = number;
export type SellerStatus = "active" | "inactive" | "suspended";

export interface BrandInput {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
}

export interface SellerInput {
  id: string;
  name: string;
  slug: string;
  status?: SellerStatus | undefined;
}

export interface Seller {
  id: string;
  name: string;
  slug: string;
  status: SellerStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ListSellersOptions {
  status?: SellerStatus | undefined;
  page?: number | undefined;
  limit?: number | undefined;
}

export interface ListOffersOptions {
  productId?: string | undefined;
  sellerId?: string | undefined;
  variantId?: string | undefined;
  availability?: OfferAvailability | undefined;
  minPrice?: number | undefined;
  maxPrice?: number | undefined;
  inStock?: boolean | undefined;
  page?: number | undefined;
  limit?: number | undefined;
  sort?: "price" | "updatedAt" | "id" | undefined;
  sortOrder?: "asc" | "desc" | undefined;
}

export interface PriceHistoryEntry {
  id: number;
  offerId: string;
  productId: string;
  sellerId: string;
  currency: string;
  price: number;
  stockQuantity: number | null;
  availability: OfferAvailability;
  offerVersion: number;
  changeReason: string | null;
  recordedAt: string;
}

export interface ListPriceHistoryOptions {
  productId?: string | undefined;
  offerId?: string | undefined;
  sellerId?: string | undefined;
  startDate?: string | Date | undefined;
  endDate?: string | Date | undefined;
  page?: number | undefined;
  limit?: number | undefined;
  sortOrder?: "asc" | "desc" | undefined;
}

export interface RelationalStore {
  createBrand(input: BrandInput): Promise<void>;
  createProductVariant(input: ProductVariantInput): Promise<void>;
  createSeller(input: SellerInput): Promise<Seller>;
  getSeller(id: string): Promise<Seller | null>;
  listSellers(options?: ListSellersOptions): Promise<{ items: Seller[]; page: number; limit: number; total: number }>;
  getOffer(id: string): Promise<Offer | null>;
  listOffers(options?: ListOffersOptions): Promise<{ items: Offer[]; page: number; limit: number; total: number }>;
  createOffer(input: CreateOfferInput): Promise<Offer>;
  updateOffer(id: string, patch: UpdateOfferInput, expectedVersion: number): Promise<Offer>;
  getPriceHistory(options?: ListPriceHistoryOptions): Promise<{ items: PriceHistoryEntry[]; page: number; limit: number; total: number }>;
}

export interface ProductVariantInput {
  id: string;
  productId: string;
  variantKey: string;
  attributes: Record<string, string>;
  sku?: string | null;
}

export interface CreateOfferInput {
  id: string;
  productId: string;
  sellerId: string;
  variantId?: string | null | undefined;
  currency: string;
  price: number;
  stockQuantity?: number | null | undefined;
  availability: OfferAvailability;
  validFrom?: string | Date | undefined;
  validUntil?: string | Date | null | undefined;
  actorUserId?: string | null | undefined;
  requestId?: string | null | undefined;
  changeReason?: string | null | undefined;
}

export interface UpdateOfferInput {
  currency?: string | undefined;
  price?: number | undefined;
  stockQuantity?: number | null | undefined;
  availability?: OfferAvailability | undefined;
  validFrom?: string | Date | undefined;
  validUntil?: string | Date | null | undefined;
  changeReason?: string | null | undefined;
  actorUserId?: string | null | undefined;
  requestId?: string | null | undefined;
}

export interface Offer {
  id: string;
  productId: string;
  sellerId: string;
  variantId: string | null;
  currency: string;
  price: number;
  stockQuantity: number | null;
  availability: OfferAvailability;
  validFrom: string;
  validUntil: string | null;
  version: OfferVersion;
  createdAt: string;
  updatedAt: string;
}

interface OfferRow extends RowDataPacket {
  id: string;
  product_id: string;
  seller_id: string;
  variant_id: string | null;
  currency: string;
  price: string | number;
  stock_quantity: number | null;
  availability: OfferAvailability;
  valid_from: Date | string;
  valid_until: Date | string | null;
  version: number;
  created_at: Date | string;
  updated_at: Date | string;
}

interface OfferSnapshot {
  id: string;
  productId: string;
  sellerId: string;
  variantId: string | null;
  currency: string;
  price: number;
  stockQuantity: number | null;
  availability: OfferAvailability;
  validFrom: string;
  validUntil: string | null;
  version: number;
}

const DERIVED_TARGETS = ["redis", "neo4j", "lancedb"] as const;

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapOfferRow(row: OfferRow): Offer {
  return {
    id: row.id,
    productId: row.product_id,
    sellerId: row.seller_id,
    variantId: row.variant_id,
    currency: row.currency,
    price: Number(row.price),
    stockQuantity: row.stock_quantity === null ? null : Number(row.stock_quantity),
    availability: row.availability,
    validFrom: toIsoString(row.valid_from),
    validUntil: row.valid_until === null ? null : toIsoString(row.valid_until),
    version: Number(row.version),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function snapshotOffer(row: OfferRow): OfferSnapshot {
  const mapped = mapOfferRow(row);
  return {
    id: mapped.id,
    productId: mapped.productId,
    sellerId: mapped.sellerId,
    variantId: mapped.variantId,
    currency: mapped.currency,
    price: mapped.price,
    stockQuantity: mapped.stockQuantity,
    availability: mapped.availability,
    validFrom: mapped.validFrom,
    validUntil: mapped.validUntil,
    version: mapped.version,
  };
}

interface SellerRow extends RowDataPacket {
  id: string;
  name: string;
  slug: string;
  status: SellerStatus;
  created_at: Date | string;
  updated_at: Date | string;
}

function mapSellerRow(row: SellerRow): Seller {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

interface PriceHistoryRow extends RowDataPacket {
  id: number;
  offer_id: string;
  product_id: string;
  seller_id: string;
  currency: string;
  price: string | number;
  stock_quantity: number | null;
  availability: OfferAvailability;
  offer_version: number;
  change_reason: string | null;
  recorded_at: Date | string;
}

function mapPriceHistoryRow(row: PriceHistoryRow): PriceHistoryEntry {
  return {
    id: Number(row.id),
    offerId: row.offer_id,
    productId: row.product_id,
    sellerId: row.seller_id,
    currency: row.currency,
    price: Number(row.price),
    stockQuantity: row.stock_quantity === null ? null : Number(row.stock_quantity),
    availability: row.availability,
    offerVersion: Number(row.offer_version),
    changeReason: row.change_reason ?? null,
    recordedAt: toIsoString(row.recorded_at),
  };
}

function validateId(value: string, label: string): string {
  if (!value || value.trim().length === 0) {
    throw new CatalogValidationError(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

function validateCurrency(value: string): string {
  const currency = validateId(value, "Currency").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new CatalogValidationError("Currency must be a three-letter ISO-style code.");
  }
  return currency;
}

function validatePrice(value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new CatalogValidationError("Offer price must be a finite non-negative number.");
  }
}

function validateStock(value: number | null | undefined): void {
  if (value !== null && value !== undefined && (!Number.isInteger(value) || value < 0)) {
    throw new CatalogValidationError("Offer stock quantity must be null or a non-negative integer.");
  }
}

function validateAvailability(
  availability: OfferAvailability,
  stockQuantity: number | null | undefined,
): void {
  if (
    (availability === "available" && !(stockQuantity !== null && stockQuantity !== undefined && stockQuantity > 0)) ||
    (availability === "unavailable" && stockQuantity !== 0) ||
    (availability === "unknown_stock" && stockQuantity !== null && stockQuantity !== undefined)
  ) {
    throw new CatalogValidationError(
      "Offer availability must match stock quantity: available is positive, unavailable is zero, and unknown_stock is null.",
    );
  }
}

function serialize(value: unknown): string | null {
  return value === null || value === undefined ? null : JSON.stringify(value);
}

async function writeAudit(
  connection: PoolConnection,
  action: string,
  entityType: string,
  entityId: string,
  beforeData: unknown,
  afterData: unknown,
  actorUserId: string | null | undefined,
  requestId: string | null | undefined,
): Promise<void> {
  await connection.query(
    `INSERT INTO audit_logs
      (actor_user_id, action, entity_type, entity_id, before_data, after_data, request_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      actorUserId ?? null,
      action,
      entityType,
      entityId,
      serialize(beforeData),
      serialize(afterData),
      requestId ?? null,
    ],
  );
}

async function writeOutbox(
  connection: PoolConnection,
  aggregateType: string,
  aggregateId: string,
  aggregateVersion: number,
  eventType: string,
  payload: unknown,
): Promise<void> {
  const eventId = randomUUID();
  await connection.query(
    `INSERT INTO outbox_events
      (event_id, aggregate_type, aggregate_id, aggregate_version, event_type, schema_version, payload)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [eventId, aggregateType, aggregateId, aggregateVersion, eventType, "1.0", serialize(payload)],
  );
  for (const target of DERIVED_TARGETS) {
    await connection.query(
      "INSERT INTO outbox_deliveries (event_id, target_name) VALUES (?, ?)",
      [eventId, target],
    );
  }
}

export class RelationalRepository implements RelationalStore {
  constructor(
    private readonly pool: Pool,
    private readonly cache?: CatalogCache,
  ) {}

  async createBrand(input: BrandInput): Promise<void> {
    const id = validateId(input.id, "Brand ID");
    const name = validateId(input.name, "Brand name");
    const slug = validateId(input.slug, "Brand slug");
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.query(
        "INSERT INTO brands (id, name, slug, description) VALUES (?, ?, ?, ?)",
        [id, name, slug, input.description ?? null],
      );
      await writeOutbox(connection, "brand", id, 1, "brand.created", { id, name, slug, description: input.description ?? null });
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw new SafeDatabaseError(error);
    } finally {
      connection.release();
    }
  }

  async createSeller(input: SellerInput): Promise<Seller> {
    const id = validateId(input.id, "Seller ID");
    const name = validateId(input.name, "Seller name");
    const slug = validateId(input.slug, "Seller slug");
    const status: SellerStatus = input.status ?? "active";
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.query(
        "INSERT INTO sellers (id, name, slug, status) VALUES (?, ?, ?, ?)",
        [id, name, slug, status],
      );
      await writeOutbox(connection, "seller", id, 1, "seller.created", { id, name, slug, status });
      await connection.commit();
      return {
        id,
        name,
        slug,
        status,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    } catch (error) {
      await connection.rollback();
      throw new SafeDatabaseError(error);
    } finally {
      connection.release();
    }
  }

  async getSeller(id: string): Promise<Seller | null> {
    if (!id || id.trim().length === 0) return null;
    try {
      const [rows] = await this.pool.query<SellerRow[]>(
        "SELECT id, name, slug, status, created_at, updated_at FROM sellers WHERE id = ? OR slug = ?",
        [id.trim(), id.trim()],
      );
      return rows[0] ? mapSellerRow(rows[0]) : null;
    } catch (error) {
      throw new SafeDatabaseError(error);
    }
  }

  async listSellers(
    options: ListSellersOptions = {},
  ): Promise<{ items: Seller[]; page: number; limit: number; total: number }> {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(100, Math.max(1, options.limit ?? 20));
    const offset = (page - 1) * limit;

    const whereClauses: string[] = [];
    const params: (string | number)[] = [];

    if (options.status) {
      whereClauses.push("status = ?");
      params.push(options.status);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    try {
      const [countRows] = await this.pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS total FROM sellers ${whereSql}`,
        params,
      );
      const total = Number(countRows[0]?.["total"] ?? 0);

      const [rows] = await this.pool.query<SellerRow[]>(
        `SELECT id, name, slug, status, created_at, updated_at FROM sellers ${whereSql} ORDER BY name ASC, id ASC LIMIT ? OFFSET ?`,
        [...params, limit, offset],
      );

      return {
        items: rows.map(mapSellerRow),
        page,
        limit,
        total,
      };
    } catch (error) {
      throw new SafeDatabaseError(error);
    }
  }

  async createProductVariant(input: ProductVariantInput): Promise<void> {
    const id = validateId(input.id, "Variant ID");
    const productId = validateId(input.productId, "Product ID");
    const variantKey = validateId(input.variantKey, "Variant key");
    if (!input.attributes || typeof input.attributes !== "object" || Array.isArray(input.attributes)) {
      throw new CatalogValidationError("Variant attributes must be an object.");
    }
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.query(
        `INSERT INTO product_variants
          (id, product_id, sku, variant_key, attributes)
         VALUES (?, ?, ?, ?, ?)`,
        [id, productId, input.sku ?? null, variantKey, JSON.stringify(input.attributes)],
      );
      await writeOutbox(connection, "variant", id, 1, "variant.created", {
        sourceId: id,
        productId,
        sku: input.sku ?? null,
        sourceVersion: 1,
        status: "active",
      });
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw new SafeDatabaseError(error);
    } finally {
      connection.release();
    }
  }

  async getOffer(id: string): Promise<Offer | null> {
    const offerId = validateId(id, "Offer ID");
    try {
      const [rows] = await this.pool.query<OfferRow[]>(
        `SELECT id, product_id, seller_id, variant_id, currency, price, stock_quantity,
                availability, valid_from, valid_until, version, created_at, updated_at
         FROM offers WHERE id = ?`,
        [offerId],
      );
      return rows[0] ? mapOfferRow(rows[0]) : null;
    } catch (error) {
      throw new SafeDatabaseError(error);
    }
  }

  async listOffers(
    options: ListOffersOptions = {},
  ): Promise<{ items: Offer[]; page: number; limit: number; total: number }> {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(100, Math.max(1, options.limit ?? 20));
    const offset = (page - 1) * limit;

    const whereClauses: string[] = [];
    const params: (string | number)[] = [];

    if (options.productId && options.productId.trim().length > 0) {
      whereClauses.push("product_id = ?");
      params.push(options.productId.trim());
    }

    if (options.sellerId && options.sellerId.trim().length > 0) {
      whereClauses.push("seller_id = ?");
      params.push(options.sellerId.trim());
    }

    if (options.variantId && options.variantId.trim().length > 0) {
      whereClauses.push("variant_id = ?");
      params.push(options.variantId.trim());
    }

    if (options.availability) {
      whereClauses.push("availability = ?");
      params.push(options.availability);
    }

    if (options.minPrice !== undefined) {
      if (typeof options.minPrice !== "number" || options.minPrice < 0 || !Number.isFinite(options.minPrice)) {
        throw new CatalogValidationError("minPrice must be a finite non-negative number.");
      }
      whereClauses.push("price >= ?");
      params.push(options.minPrice);
    }

    if (options.maxPrice !== undefined) {
      if (typeof options.maxPrice !== "number" || options.maxPrice < 0 || !Number.isFinite(options.maxPrice)) {
        throw new CatalogValidationError("maxPrice must be a finite non-negative number.");
      }
      whereClauses.push("price <= ?");
      params.push(options.maxPrice);
    }

    if (options.minPrice !== undefined && options.maxPrice !== undefined && options.minPrice > options.maxPrice) {
      throw new CatalogValidationError("minPrice cannot be greater than maxPrice.");
    }

    if (options.inStock === true) {
      whereClauses.push("stock_quantity > 0");
    } else if (options.inStock === false) {
      whereClauses.push("stock_quantity = 0");
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
    const sortCol = options.sort === "price" ? "price" : options.sort === "updatedAt" ? "updated_at" : "id";
    const sortDir = options.sortOrder === "desc" ? "DESC" : "ASC";

    try {
      const [countRows] = await this.pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS total FROM offers ${whereSql}`,
        params,
      );
      const total = Number(countRows[0]?.["total"] ?? 0);

      const [rows] = await this.pool.query<OfferRow[]>(
        `SELECT id, product_id, seller_id, variant_id, currency, price, stock_quantity,
                availability, valid_from, valid_until, version, created_at, updated_at
         FROM offers
         ${whereSql}
         ORDER BY ${sortCol} ${sortDir}, id ASC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset],
      );

      return {
        items: rows.map(mapOfferRow),
        page,
        limit,
        total,
      };
    } catch (error) {
      if (error instanceof CatalogValidationError) throw error;
      throw new SafeDatabaseError(error);
    }
  }

  async getPriceHistory(
    options: ListPriceHistoryOptions = {},
  ): Promise<{ items: PriceHistoryEntry[]; page: number; limit: number; total: number }> {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(100, Math.max(1, options.limit ?? 20));
    const offset = (page - 1) * limit;

    const whereClauses: string[] = [];
    const params: (string | number | Date)[] = [];

    if (options.productId && options.productId.trim().length > 0) {
      whereClauses.push("product_id = ?");
      params.push(options.productId.trim());
    }

    if (options.offerId && options.offerId.trim().length > 0) {
      whereClauses.push("offer_id = ?");
      params.push(options.offerId.trim());
    }

    if (options.sellerId && options.sellerId.trim().length > 0) {
      whereClauses.push("seller_id = ?");
      params.push(options.sellerId.trim());
    }

    if (options.startDate) {
      whereClauses.push("recorded_at >= ?");
      params.push(options.startDate instanceof Date ? options.startDate : new Date(options.startDate));
    }

    if (options.endDate) {
      whereClauses.push("recorded_at <= ?");
      params.push(options.endDate instanceof Date ? options.endDate : new Date(options.endDate));
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
    const sortDir = options.sortOrder === "asc" ? "ASC" : "DESC";

    try {
      const [countRows] = await this.pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS total FROM offer_history ${whereSql}`,
        params,
      );
      const total = Number(countRows[0]?.["total"] ?? 0);

      const [rows] = await this.pool.query<PriceHistoryRow[]>(
        `SELECT id, offer_id, product_id, seller_id, currency, price, stock_quantity,
                availability, offer_version, change_reason, recorded_at
         FROM offer_history
         ${whereSql}
         ORDER BY recorded_at ${sortDir}, id ${sortDir}
         LIMIT ? OFFSET ?`,
        [...params, limit, offset],
      );

      return {
        items: rows.map(mapPriceHistoryRow),
        page,
        limit,
        total,
      };
    } catch (error) {
      throw new SafeDatabaseError(error);
    }
  }

  async createOffer(input: CreateOfferInput): Promise<Offer> {
    const id = validateId(input.id, "Offer ID");
    const productId = validateId(input.productId, "Product ID");
    const sellerId = validateId(input.sellerId, "Seller ID");
    const currency = validateCurrency(input.currency);
    validatePrice(input.price);
    validateStock(input.stockQuantity);
    validateAvailability(input.availability, input.stockQuantity);
    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();
      await connection.query(
        `INSERT INTO offers
          (id, product_id, variant_id, seller_id, currency, price, stock_quantity, availability,
           valid_from, valid_until, version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP(3)), ?, 1)`,
        [
          id,
          productId,
          input.variantId ?? null,
          sellerId,
          currency,
          input.price,
          input.stockQuantity ?? null,
          input.availability,
          input.validFrom ?? null,
          input.validUntil ?? null,
        ],
      );
      const [rows] = await connection.query<OfferRow[]>(
        `SELECT id, product_id, seller_id, variant_id, currency, price, stock_quantity,
                availability, valid_from, valid_until, version, created_at, updated_at
         FROM offers WHERE id = ?`,
        [id],
      );
      const created = rows[0];
      if (!created) {
        throw new Error("Failed to retrieve created offer.");
      }
      const after = snapshotOffer(created);
      await connection.query(
        `INSERT INTO offer_history
          (offer_id, product_id, seller_id, currency, price, stock_quantity, availability,
           offer_version, change_reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          after.id,
          after.productId,
          after.sellerId,
          after.currency,
          after.price,
          after.stockQuantity,
          after.availability,
          after.version,
          input.changeReason ?? "initial_creation",
        ],
      );
      await writeAudit(
        connection,
        "offer.created",
        "offer",
        id,
        null,
        after,
        input.actorUserId,
        input.requestId,
      );
      await writeOutbox(connection, "offer", id, after.version, "offer.created", after);
      await connection.commit();
      if (this.cache) {
        await this.cache.invalidateProduct(after.productId).catch(() => 0);
        await this.cache.invalidateListings().catch(() => 0);
      }
      return mapOfferRow(created);
    } catch (error) {
      await connection.rollback();
      if (error instanceof CatalogValidationError) {
        throw error;
      }
      throw new SafeDatabaseError(error);
    } finally {
      connection.release();
    }
  }

  async updateOffer(
    id: string,
    patch: UpdateOfferInput,
    expectedVersion: number,
  ): Promise<Offer> {
    const offerId = validateId(id, "Offer ID");
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
      throw new CatalogValidationError("Expected offer version must be a positive integer.");
    }
    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();
      const [existingRows] = await connection.query<OfferRow[]>(
        `SELECT id, product_id, seller_id, variant_id, currency, price, stock_quantity,
                availability, valid_from, valid_until, version, created_at, updated_at
         FROM offers WHERE id = ? FOR UPDATE`,
        [offerId],
      );
      const existing = existingRows[0];
      if (!existing) {
        throw new NotFoundError("Offer", offerId);
      }
      const before = snapshotOffer(existing);
      if (before.version !== expectedVersion) {
        throw new OfferVersionConflictError(offerId, expectedVersion, before.version);
      }

      const currency = patch.currency === undefined ? before.currency : validateCurrency(patch.currency);
      const price = patch.price === undefined ? before.price : patch.price;
      const stockQuantity = patch.stockQuantity === undefined ? before.stockQuantity : patch.stockQuantity;
      const availability = patch.availability === undefined ? before.availability : patch.availability;
      validatePrice(price);
      validateStock(stockQuantity);
      validateAvailability(availability, stockQuantity);
      const nextVersion = before.version + 1;

      await connection.query(
        `UPDATE offers
         SET currency = ?, price = ?, stock_quantity = ?, availability = ?,
             valid_from = COALESCE(?, valid_from), valid_until = ?, version = ?
         WHERE id = ?`,
        [
          currency,
          price,
          stockQuantity,
          availability,
          patch.validFrom ?? null,
          patch.validUntil === undefined ? before.validUntil : patch.validUntil,
          nextVersion,
          offerId,
        ],
      );
      const [updatedRows] = await connection.query<OfferRow[]>(
        `SELECT id, product_id, seller_id, variant_id, currency, price, stock_quantity,
                availability, valid_from, valid_until, version, created_at, updated_at
         FROM offers WHERE id = ?`,
        [offerId],
      );
      const updated = updatedRows[0];
      if (!updated) {
        throw new Error("Failed to retrieve updated offer.");
      }
      const after = snapshotOffer(updated);
      await connection.query(
        `INSERT INTO offer_history
          (offer_id, product_id, seller_id, currency, price, stock_quantity, availability,
           offer_version, change_reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          after.id,
          after.productId,
          after.sellerId,
          after.currency,
          after.price,
          after.stockQuantity,
          after.availability,
          after.version,
          patch.changeReason ?? "offer_update",
        ],
      );
      await writeAudit(
        connection,
        "offer.updated",
        "offer",
        offerId,
        before,
        after,
        patch.actorUserId,
        patch.requestId,
      );
      await writeOutbox(connection, "offer", offerId, after.version, "offer.updated", after);
      await connection.commit();
      if (this.cache) {
        await this.cache.invalidateProduct(after.productId).catch(() => 0);
        await this.cache.invalidateListings().catch(() => 0);
      }
      return mapOfferRow(updated);
    } catch (error) {
      await connection.rollback();
      if (
        error instanceof CatalogValidationError ||
        error instanceof NotFoundError ||
        error instanceof OfferVersionConflictError
      ) {
        throw error;
      }
      throw new SafeDatabaseError(error);
    } finally {
      connection.release();
    }
  }
}

export class InMemoryRelationalStore implements RelationalStore {
  private readonly brands = new Map<string, BrandInput>();
  private readonly variants = new Map<string, ProductVariantInput>();
  private readonly sellers = new Map<string, Seller>();
  private readonly offers = new Map<string, Offer>();
  private readonly history: PriceHistoryEntry[] = [];
  private historyIdCounter = 1;

  constructor(initialData?: {
    sellers?: Seller[];
    offers?: Offer[];
    history?: PriceHistoryEntry[];
  }) {
    if (initialData?.sellers) {
      for (const s of initialData.sellers) this.sellers.set(s.id, { ...s });
    } else {
      const defaultSellers: Seller[] = [
        { id: "seller-001", name: "Summit Outdoors", slug: "summit-outdoors", status: "active", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
        { id: "seller-002", name: "Alpine Gear Lab", slug: "alpine-gear-lab", status: "active", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
        { id: "seller-003", name: "Trailhead Warehouse", slug: "trailhead-warehouse", status: "active", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
      ];
      for (const s of defaultSellers) this.sellers.set(s.id, s);
    }

    if (initialData?.offers) {
      for (const o of initialData.offers) this.offers.set(o.id, { ...o });
    } else {
      const defaultOffers: Offer[] = [
        {
          id: "offer-0001",
          productId: "prod-0001",
          sellerId: "seller-001",
          variantId: null,
          currency: "USD",
          price: 49.99,
          stockQuantity: 20,
          availability: "available",
          validFrom: "2026-01-01T00:00:00.000Z",
          validUntil: null,
          version: 1,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "offer-0002",
          productId: "prod-0001",
          sellerId: "seller-002",
          variantId: null,
          currency: "USD",
          price: 54.50,
          stockQuantity: 8,
          availability: "available",
          validFrom: "2026-01-01T00:00:00.000Z",
          validUntil: null,
          version: 1,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "offer-0003",
          productId: "prod-0002",
          sellerId: "seller-001",
          variantId: null,
          currency: "USD",
          price: 89.00,
          stockQuantity: 12,
          availability: "available",
          validFrom: "2026-01-01T00:00:00.000Z",
          validUntil: null,
          version: 1,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ];
      for (const o of defaultOffers) this.offers.set(o.id, o);
    }

    if (initialData?.history) {
      for (const h of initialData.history) {
        this.history.push({ ...h });
        if (h.id >= this.historyIdCounter) this.historyIdCounter = h.id + 1;
      }
    } else {
      this.history.push(
        {
          id: 1,
          offerId: "offer-0001",
          productId: "prod-0001",
          sellerId: "seller-001",
          currency: "USD",
          price: 59.99,
          stockQuantity: 25,
          availability: "available",
          offerVersion: 1,
          changeReason: "initial_creation",
          recordedAt: "2026-01-01T00:00:00.000Z",
        },
        {
          id: 2,
          offerId: "offer-0001",
          productId: "prod-0001",
          sellerId: "seller-001",
          currency: "USD",
          price: 49.99,
          stockQuantity: 20,
          availability: "available",
          offerVersion: 2,
          changeReason: "seasonal_discount",
          recordedAt: "2026-01-15T00:00:00.000Z",
        },
      );
      this.historyIdCounter = 3;
    }
  }

  async createBrand(input: BrandInput): Promise<void> {
    const id = validateId(input.id, "Brand ID");
    const name = validateId(input.name, "Brand name");
    const slug = validateId(input.slug, "Brand slug");
    if (Array.from(this.brands.values()).some((brand) => brand.slug === slug)) {
      throw new CatalogValidationError("Brand slug already exists.");
    }
    this.brands.set(id, { ...input, id, name, slug });
  }

  async createProductVariant(input: ProductVariantInput): Promise<void> {
    const id = validateId(input.id, "Variant ID");
    const productId = validateId(input.productId, "Product ID");
    const variantKey = validateId(input.variantKey, "Variant key");
    if (!input.attributes || typeof input.attributes !== "object" || Array.isArray(input.attributes)) {
      throw new CatalogValidationError("Variant attributes must be an object.");
    }
    this.variants.set(id, { ...input, id, productId, variantKey, attributes: { ...input.attributes } });
  }

  async getSeller(id: string): Promise<Seller | null> {
    const trimmed = id.trim();
    const seller = this.sellers.get(trimmed) ?? Array.from(this.sellers.values()).find((s) => s.slug === trimmed);
    return seller ? { ...seller } : null;
  }

  async listSellers(
    options: ListSellersOptions = {},
  ): Promise<{ items: Seller[]; page: number; limit: number; total: number }> {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(100, Math.max(1, options.limit ?? 20));
    let items = Array.from(this.sellers.values());
    if (options.status) {
      items = items.filter((s) => s.status === options.status);
    }
    items.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    const total = items.length;
    const offset = (page - 1) * limit;
    return {
      items: items.slice(offset, offset + limit).map((s) => ({ ...s })),
      page,
      limit,
      total,
    };
  }

  async createSeller(input: SellerInput): Promise<Seller> {
    const id = validateId(input.id, "Seller ID");
    const name = validateId(input.name, "Seller name");
    const slug = validateId(input.slug, "Seller slug");
    const status: SellerStatus = input.status ?? "active";
    const now = new Date().toISOString();
    const seller: Seller = { id, name, slug, status, createdAt: now, updatedAt: now };
    this.sellers.set(id, seller);
    return { ...seller };
  }

  async getOffer(id: string): Promise<Offer | null> {
    const offer = this.offers.get(id.trim());
    return offer ? { ...offer } : null;
  }

  async listOffers(
    options: ListOffersOptions = {},
  ): Promise<{ items: Offer[]; page: number; limit: number; total: number }> {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(100, Math.max(1, options.limit ?? 20));
    if (options.minPrice !== undefined && options.maxPrice !== undefined && options.minPrice > options.maxPrice) {
      throw new CatalogValidationError("minPrice cannot be greater than maxPrice.");
    }

    let items = Array.from(this.offers.values());

    if (options.productId) {
      items = items.filter((o) => o.productId === options.productId!.trim());
    }
    if (options.sellerId) {
      items = items.filter((o) => o.sellerId === options.sellerId!.trim());
    }
    if (options.variantId) {
      items = items.filter((o) => o.variantId === options.variantId!.trim());
    }
    if (options.availability) {
      items = items.filter((o) => o.availability === options.availability);
    }
    if (options.minPrice !== undefined) {
      items = items.filter((o) => o.price >= options.minPrice!);
    }
    if (options.maxPrice !== undefined) {
      items = items.filter((o) => o.price <= options.maxPrice!);
    }
    if (options.inStock === true) {
      items = items.filter((o) => o.stockQuantity !== null && o.stockQuantity > 0);
    } else if (options.inStock === false) {
      items = items.filter((o) => o.stockQuantity === 0);
    }

    const sortCol = options.sort ?? "id";
    const sortDir = options.sortOrder === "desc" ? -1 : 1;
    items.sort((a, b) => {
      if (sortCol === "price") {
        return (a.price - b.price || a.id.localeCompare(b.id)) * sortDir;
      }
      if (sortCol === "updatedAt") {
        return (a.updatedAt.localeCompare(b.updatedAt) || a.id.localeCompare(b.id)) * sortDir;
      }
      return a.id.localeCompare(b.id) * sortDir;
    });

    const total = items.length;
    const offset = (page - 1) * limit;
    return {
      items: items.slice(offset, offset + limit).map((o) => ({ ...o })),
      page,
      limit,
      total,
    };
  }

  async createOffer(input: CreateOfferInput): Promise<Offer> {
    const id = validateId(input.id, "Offer ID");
    const productId = validateId(input.productId, "Product ID");
    const sellerId = validateId(input.sellerId, "Seller ID");
    const currency = validateCurrency(input.currency);
    validatePrice(input.price);
    validateStock(input.stockQuantity);
    validateAvailability(input.availability, input.stockQuantity);

    const now = new Date().toISOString();
    const offer: Offer = {
      id,
      productId,
      sellerId,
      variantId: input.variantId ?? null,
      currency,
      price: input.price,
      stockQuantity: input.stockQuantity ?? null,
      availability: input.availability,
      validFrom: input.validFrom ? toIsoString(input.validFrom) : now,
      validUntil: input.validUntil ? toIsoString(input.validUntil) : null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    this.offers.set(id, offer);
    this.history.push({
      id: this.historyIdCounter++,
      offerId: id,
      productId,
      sellerId,
      currency,
      price: input.price,
      stockQuantity: input.stockQuantity ?? null,
      availability: input.availability,
      offerVersion: 1,
      changeReason: input.changeReason ?? "initial_creation",
      recordedAt: now,
    });

    return { ...offer };
  }

  async updateOffer(
    id: string,
    patch: UpdateOfferInput,
    expectedVersion: number,
  ): Promise<Offer> {
    const offerId = validateId(id, "Offer ID");
    const existing = this.offers.get(offerId);
    if (!existing) {
      throw new NotFoundError("Offer", offerId);
    }
    if (existing.version !== expectedVersion) {
      throw new OfferVersionConflictError(offerId, expectedVersion, existing.version);
    }

    const currency = patch.currency === undefined ? existing.currency : validateCurrency(patch.currency);
    const price = patch.price === undefined ? existing.price : patch.price;
    const stockQuantity = patch.stockQuantity === undefined ? existing.stockQuantity : patch.stockQuantity;
    const availability = patch.availability === undefined ? existing.availability : patch.availability;
    validatePrice(price);
    validateStock(stockQuantity);
    validateAvailability(availability, stockQuantity);

    const now = new Date().toISOString();
    const updated: Offer = {
      ...existing,
      currency,
      price,
      stockQuantity,
      availability,
      validFrom: patch.validFrom ? toIsoString(patch.validFrom) : existing.validFrom,
      validUntil: patch.validUntil === undefined ? existing.validUntil : patch.validUntil ? toIsoString(patch.validUntil) : null,
      version: existing.version + 1,
      updatedAt: now,
    };

    this.offers.set(offerId, updated);
    this.history.push({
      id: this.historyIdCounter++,
      offerId,
      productId: updated.productId,
      sellerId: updated.sellerId,
      currency,
      price,
      stockQuantity,
      availability,
      offerVersion: updated.version,
      changeReason: patch.changeReason ?? "offer_update",
      recordedAt: now,
    });

    return { ...updated };
  }

  async getPriceHistory(
    options: ListPriceHistoryOptions = {},
  ): Promise<{ items: PriceHistoryEntry[]; page: number; limit: number; total: number }> {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(100, Math.max(1, options.limit ?? 20));
    let items = [...this.history];

    if (options.productId) {
      items = items.filter((h) => h.productId === options.productId!.trim());
    }
    if (options.offerId) {
      items = items.filter((h) => h.offerId === options.offerId!.trim());
    }
    if (options.sellerId) {
      items = items.filter((h) => h.sellerId === options.sellerId!.trim());
    }
    if (options.startDate) {
      const start = new Date(options.startDate).getTime();
      items = items.filter((h) => new Date(h.recordedAt).getTime() >= start);
    }
    if (options.endDate) {
      const end = new Date(options.endDate).getTime();
      items = items.filter((h) => new Date(h.recordedAt).getTime() <= end);
    }

    const sortDir = options.sortOrder === "asc" ? 1 : -1;
    items.sort((a, b) => {
      const timeDiff = new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime();
      return (timeDiff !== 0 ? timeDiff : a.id - b.id) * sortDir;
    });

    const total = items.length;
    const offset = (page - 1) * limit;
    return {
      items: items.slice(offset, offset + limit).map((h) => ({ ...h })),
      page,
      limit,
      total,
    };
  }
}

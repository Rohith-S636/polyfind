export {
  createDatabasePool,
  getDatabasePool,
  closeDatabasePool,
  parseDatabaseUrl,
  loadEnvironment,
} from "./db.js";

export {
  runMigrations,
  getAppliedMigrations,
  getAvailableMigrationFiles,
  dropAllTables,
  DEFAULT_MIGRATIONS_DIR,
  type MigrationResult,
} from "./migrations.js";

export {
  CatalogRepository,
  asCatalogReader,
  mapRowToProduct,
  type ListProductsOptions,
  type PaginatedProducts,
  type CreateProductInput,
  type UpdateProductInput,
} from "./repository.js";

export {
  CatalogError,
  CatalogValidationError,
  NotFoundError,
  VersionConflictError,
  SafeDatabaseError,
  OfferVersionConflictError,
  sanitizeDatabaseErrorMessage,
} from "./errors.js";

export {
  RelationalRepository,
  InMemoryRelationalStore,
  type BrandInput,
  type SellerInput,
  type Seller,
  type SellerStatus,
  type ListSellersOptions,
  type ProductVariantInput,
  type CreateOfferInput,
  type UpdateOfferInput,
  type Offer,
  type OfferAvailability,
  type OfferVersion,
  type ListOffersOptions,
  type PriceHistoryEntry,
  type ListPriceHistoryOptions,
  type RelationalStore,
} from "./relational-repository.js";

export {
  handleListProducts,
  handleGetProduct,
  handleCreateProduct,
  handleUpdateProduct,
  handleDeleteProduct,
  formatErrorResponse,
  type ApiResponse,
  type ApiErrorBody,
} from "./api.js";

export {
  generateSeedDataset,
  validateSeedDataset,
  DeterministicRNG,
  CANONICAL_CATEGORIES,
  type SeedDataset,
  type SeedValidationReport,
  type SeedValidationIssue,
} from "./seed.js";

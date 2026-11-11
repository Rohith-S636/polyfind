import {
  CatalogError,
  CatalogValidationError,
  NotFoundError,
  SafeDatabaseError,
  VersionConflictError,
} from "./errors.js";
import {
  CatalogRepository,
  type CreateProductInput,
  type ListProductsOptions,
  type UpdateProductInput,
} from "./repository.js";

export interface ApiResponse<T = unknown> {
  status: number;
  body: T;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    issues?: unknown[];
  };
}

export function formatErrorResponse(error: unknown): ApiResponse<ApiErrorBody> {
  if (error instanceof CatalogError) {
    const body: ApiErrorBody = {
      error: {
        code: error.code,
        message: error.message,
      },
    };
    if (error instanceof CatalogValidationError && error.issues) {
      body.error.issues = error.issues;
    }
    return {
      status: error.statusCode,
      body,
    };
  }

  // Fallback for unexpected errors
  const safeError = new SafeDatabaseError(error);
  return {
    status: 500,
    body: {
      error: {
        code: safeError.code,
        message: safeError.message,
      },
    },
  };
}

export async function handleListProducts(
  repository: CatalogRepository,
  query: Record<string, string | undefined>,
): Promise<ApiResponse> {
  try {
    const options: ListProductsOptions = {};

    if (query["q"]) {
      options.q = query["q"];
    }

    if (query["page"]) {
      const pageNum = Number.parseInt(query["page"], 10);
      if (Number.isNaN(pageNum) || pageNum < 1) {
        throw new CatalogValidationError("Query parameter 'page' must be a positive integer.");
      }
      options.page = pageNum;
    }

    if (query["limit"]) {
      const limitNum = Number.parseInt(query["limit"], 10);
      if (Number.isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
        throw new CatalogValidationError("Query parameter 'limit' must be an integer between 1 and 100.");
      }
      options.limit = limitNum;
    }

    const filters: NonNullable<ListProductsOptions["filters"]> = {};

    if (query["category"]) {
      filters.categoryId = query["category"];
    }

    if (query["minPrice"] !== undefined) {
      const minPrice = Number.parseFloat(query["minPrice"]);
      if (Number.isNaN(minPrice) || minPrice < 0) {
        throw new CatalogValidationError("Query parameter 'minPrice' must be a non-negative number.");
      }
      filters.minPrice = minPrice;
    }

    if (query["maxPrice"] !== undefined) {
      const maxPrice = Number.parseFloat(query["maxPrice"]);
      if (Number.isNaN(maxPrice) || maxPrice < 0) {
        throw new CatalogValidationError("Query parameter 'maxPrice' must be a non-negative number.");
      }
      filters.maxPrice = maxPrice;
    }

    if (query["inStock"] !== undefined) {
      if (query["inStock"] === "true") {
        filters.inStock = true;
      } else if (query["inStock"] === "false") {
        filters.inStock = false;
      } else {
        throw new CatalogValidationError("Query parameter 'inStock' must be 'true' or 'false'.");
      }
    }

    options.filters = filters;

    const result = await repository.listProducts(options);
    return {
      status: 200,
      body: result,
    };
  } catch (error) {
    return formatErrorResponse(error);
  }
}

export async function handleGetProduct(
  repository: CatalogRepository,
  id: string,
): Promise<ApiResponse> {
  try {
    if (!id || id.trim().length === 0) {
      throw new CatalogValidationError("Product ID is required.");
    }

    const product = await repository.getProduct(id.trim());
    if (!product) {
      throw new NotFoundError("Product", id);
    }

    return {
      status: 200,
      body: { item: product },
    };
  } catch (error) {
    return formatErrorResponse(error);
  }
}

export async function handleCreateProduct(
  repository: CatalogRepository,
  body: unknown,
): Promise<ApiResponse> {
  try {
    if (!body || typeof body !== "object") {
      throw new CatalogValidationError("Request body must be a valid JSON object.");
    }

    const input = body as CreateProductInput;
    const created = await repository.createProduct(input);

    return {
      status: 201,
      body: { item: created },
    };
  } catch (error) {
    return formatErrorResponse(error);
  }
}

export async function handleUpdateProduct(
  repository: CatalogRepository,
  id: string,
  body: unknown,
  expectedVersion?: number,
): Promise<ApiResponse> {
  try {
    if (!id || id.trim().length === 0) {
      throw new CatalogValidationError("Product ID is required.");
    }

    if (!body || typeof body !== "object") {
      throw new CatalogValidationError("Request body must be a valid JSON object.");
    }

    const patch = body as UpdateProductInput;
    const updated = await repository.updateProduct(id.trim(), patch, expectedVersion);

    return {
      status: 200,
      body: { item: updated, version: updated.version },
    };
  } catch (error) {
    return formatErrorResponse(error);
  }
}

export async function handleDeleteProduct(
  repository: CatalogRepository,
  id: string,
): Promise<ApiResponse> {
  try {
    if (!id || id.trim().length === 0) {
      throw new CatalogValidationError("Product ID is required.");
    }

    const deleted = await repository.deleteProduct(id.trim());
    if (!deleted) {
      throw new NotFoundError("Product", id);
    }

    return {
      status: 200,
      body: { success: true },
    };
  } catch (error) {
    return formatErrorResponse(error);
  }
}

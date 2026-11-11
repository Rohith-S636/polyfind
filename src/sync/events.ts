import type { Product, ProductId, SourceVersion } from "../contracts/types.js";

export type UpdateOperation = "create" | "update" | "delete";

export interface ProductUpdateEvent {
  eventId: string;
  productId: ProductId;
  version: SourceVersion;
  operation: UpdateOperation;
  timestamp: string;
  data: Partial<Omit<Product, "id" | "version" | "updatedAt">>;
  previousVersion?: SourceVersion | undefined;
}

export function createProductUpdateEvent(options: {
  eventId?: string;
  productId: ProductId;
  version: SourceVersion;
  operation: UpdateOperation;
  data?: Partial<Omit<Product, "id" | "version" | "updatedAt">>;
  previousVersion?: SourceVersion;
  timestamp?: string;
}): ProductUpdateEvent {
  if (!options.productId || options.productId.trim().length === 0) {
    throw new Error("ProductUpdateEvent requires a non-empty productId.");
  }

  if (typeof options.version !== "number" || !Number.isInteger(options.version) || options.version <= 0) {
    throw new Error("ProductUpdateEvent requires a positive integer version.");
  }

  const eventId = options.eventId ?? `evt-${options.productId}-v${options.version}-${Date.now()}`;
  const timestamp = options.timestamp ?? new Date().toISOString();

  const event: ProductUpdateEvent = {
    eventId,
    productId: options.productId.trim(),
    version: options.version,
    operation: options.operation,
    timestamp,
    data: options.data ?? {},
  };

  if (options.previousVersion !== undefined) {
    event.previousVersion = options.previousVersion;
  }

  return event;
}

export class CatalogError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(message: string, statusCode: number, code: string) {
    super(message);
    this.name = "CatalogError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class CatalogValidationError extends CatalogError {
  readonly issues?: unknown[] | undefined;

  constructor(message: string, issues?: unknown[]) {
    super(message, 400, "VALIDATION_ERROR");
    this.name = "CatalogValidationError";
    this.issues = issues;
  }
}

export class NotFoundError extends CatalogError {
  constructor(resource: string, id: string) {
    super(`${resource} with ID "${id}" was not found.`, 404, "NOT_FOUND");
    this.name = "NotFoundError";
  }
}

export class VersionConflictError extends CatalogError {
  readonly expectedVersion: number;
  readonly actualVersion?: number | undefined;

  constructor(id: string, expectedVersion: number, actualVersion?: number) {
    const versionDetail =
      actualVersion !== undefined
        ? `expected version ${expectedVersion}, but actual version is ${actualVersion}`
        : `version precondition ${expectedVersion} failed`;
    super(
      `Product "${id}" has been modified concurrently (${versionDetail}).`,
      409,
      "VERSION_CONFLICT",
    );
    this.name = "VersionConflictError";
    this.expectedVersion = expectedVersion;
    this.actualVersion = actualVersion;
  }
}

export class OfferVersionConflictError extends CatalogError {
  readonly expectedVersion: number;
  readonly actualVersion?: number | undefined;

  constructor(id: string, expectedVersion: number, actualVersion?: number) {
    const versionDetail =
      actualVersion !== undefined
        ? `expected version ${expectedVersion}, but actual version is ${actualVersion}`
        : `version precondition ${expectedVersion} failed`;
    super(
      `Offer "${id}" has been modified concurrently (${versionDetail}).`,
      409,
      "OFFER_VERSION_CONFLICT",
    );
    this.name = "OfferVersionConflictError";
    this.expectedVersion = expectedVersion;
    this.actualVersion = actualVersion;
  }
}

export class SafeDatabaseError extends CatalogError {
  constructor(originalError: unknown) {
    // Sanitizes any potential credentials, database hosts, or internal syntax details
    const safeMessage = sanitizeDatabaseErrorMessage(originalError);
    super(safeMessage, 500, "DATABASE_ERROR");
    this.name = "SafeDatabaseError";
  }
}

export function sanitizeDatabaseErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "An unexpected database error occurred.";
  }

  const message = error.message;

  // Mask credentials, connection strings, or IP/port details if they appear
  let sanitized = message
    .replace(/(?:mysql:\/\/[^@]+@)[^/]+/gi, "mysql://[REDACTED]")
    .replace(/password\s*=\s*['"]?[^'",\s]+/gi, "password=[REDACTED]")
    .replace(/using password:\s*(yes|no)/gi, "using password: [REDACTED]");

  // Categorize known safe messages
  if (/duplicate entry/i.test(sanitized)) {
    return "A record with this identifier or unique attribute already exists.";
  }
  if (/foreign key constraint fails/i.test(sanitized)) {
    return "Operation violates referential integrity constraints.";
  }
  if (/check constraint.*failed/i.test(sanitized)) {
    return "Operation violates table domain constraints.";
  }

  // Generic fallback if unexpected
  return "A database operation failed while executing a query.";
}

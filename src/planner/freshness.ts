import type {
  CatalogReader,
  FreshnessMode,
  Product,
  ProductId,
  RetrievalCandidate,
  SourceVersion,
} from "../contracts/types.js";

export type FreshnessValidationStatus = "fresh" | "stale" | "unverifiable";

export interface FreshnessAuthority {
  getProduct(productId: ProductId): Promise<Product | null>;
  getProducts?(productIds: readonly ProductId[]): Promise<Product[]>;
}

export interface FreshnessViolation {
  productId: ProductId;
  source: string;
  sourceVersion?: SourceVersion | undefined;
  authoritativeVersion?: SourceVersion | undefined;
  reason: "stale-version" | "missing-version" | "authority-unavailable";
}

export interface FreshnessTelemetry {
  checkedCandidates: number;
  freshCandidates: number;
  staleCandidates: number;
  unverifiableCandidates: number;
  freshnessViolations: number;
  authoritativeFallbacks: number;
}

export interface FreshnessValidatedCandidate {
  candidate: RetrievalCandidate;
  status: FreshnessValidationStatus;
  product: Product | null;
  safeToPresent: boolean;
  usedAuthoritativeFallback: boolean;
  violation?: FreshnessViolation | undefined;
}

export interface FreshnessValidationOptions {
  mode?: FreshnessMode;
}

export interface FreshnessValidationResult {
  candidates: FreshnessValidatedCandidate[];
  telemetry: FreshnessTelemetry;
}

function emptyTelemetry(): FreshnessTelemetry {
  return {
    checkedCandidates: 0,
    freshCandidates: 0,
    staleCandidates: 0,
    unverifiableCandidates: 0,
    freshnessViolations: 0,
    authoritativeFallbacks: 0,
  };
}

function recordStale(telemetry: FreshnessTelemetry): void {
  telemetry.staleCandidates += 1;
  telemetry.freshnessViolations += 1;
  telemetry.authoritativeFallbacks += 1;
}

function recordUnverifiable(telemetry: FreshnessTelemetry): void {
  telemetry.unverifiableCandidates += 1;
  telemetry.freshnessViolations += 1;
}

/**
 * Validates derived retrieval candidates against the authoritative catalog.
 *
 * A derived candidate contributes identity and ranking only. Any product
 * fields returned for display are always read from the authoritative source.
 * Candidates whose version cannot be checked are never presented as current.
 */
export class FreshnessValidator {
  private readonly authority: FreshnessAuthority;
  private telemetry: FreshnessTelemetry = emptyTelemetry();

  constructor(authority: FreshnessAuthority | CatalogReader) {
    this.authority = authority;
  }

  async validateCandidate(
    candidate: RetrievalCandidate,
    options: FreshnessValidationOptions = {},
  ): Promise<FreshnessValidatedCandidate> {
    const result = await this.validateCandidates([candidate], options);
    return result.candidates[0]!;
  }

  async validateCandidates(
    candidates: readonly RetrievalCandidate[],
    options: FreshnessValidationOptions = {},
  ): Promise<FreshnessValidationResult> {
    const mode = options.mode ?? "strict";
    const results: FreshnessValidatedCandidate[] = [];
    const telemetry = emptyTelemetry();

    // Bounded batch retrieval to prevent N individual serial database queries
    const productIds = candidates.map((c) => c.productId);
    const productMap = new Map<string, Product>();

    if (this.authority.getProducts) {
      try {
        const batch = await this.authority.getProducts(productIds);
        for (const p of batch) {
          productMap.set(p.id, p);
        }
      } catch {
        // Fall back to per-candidate resolution if batch retrieval encounters an issue
      }
    }

    for (const candidate of candidates) {
      telemetry.checkedCandidates += 1;
      this.telemetry.checkedCandidates += 1;
      let product: Product | null = productMap.get(candidate.productId) ?? null;
      if (!product) {
        // Batch reads may omit deleted IDs or fail partially. Resolve each
        // missing entry individually before classifying authority as unavailable.
        try {
          product = await this.authority.getProduct(candidate.productId);
        } catch {
          product = null;
        }
      }

      if (product === null) {
        const violation: FreshnessViolation = {
          productId: candidate.productId,
          source: candidate.source,
          reason: "authority-unavailable",
        };
        if (candidate.sourceVersion !== undefined) {
          violation.sourceVersion = candidate.sourceVersion;
        }
        recordUnverifiable(telemetry);
        recordUnverifiable(this.telemetry);
        results.push({
          candidate,
          status: "unverifiable",
          product: null,
          safeToPresent: false,
          usedAuthoritativeFallback: false,
          violation,
        });
        continue;
      }

      const sourceVersion = candidate.sourceVersion;
      if (sourceVersion === undefined) {
        const violation: FreshnessViolation = {
          productId: candidate.productId,
          source: candidate.source,
          reason: "missing-version",
        };
        violation.authoritativeVersion = product.version;
        recordUnverifiable(telemetry);
        recordUnverifiable(this.telemetry);
        results.push({
          candidate,
          status: "unverifiable",
          product,
          safeToPresent: mode === "best-effort",
          usedAuthoritativeFallback: true,
          violation,
        });
        continue;
      }

      if (sourceVersion < product.version) {
        const violation: FreshnessViolation = {
          productId: candidate.productId,
          source: candidate.source,
          sourceVersion,
          authoritativeVersion: product.version,
          reason: "stale-version",
        };
        recordStale(telemetry);
        recordStale(this.telemetry);
        results.push({
          candidate,
          status: "stale",
          product,
          safeToPresent: mode === "best-effort",
          usedAuthoritativeFallback: true,
          violation,
        });
        continue;
      }

      if (sourceVersion > product.version) {
        const violation: FreshnessViolation = {
          productId: candidate.productId,
          source: candidate.source,
          sourceVersion,
          authoritativeVersion: product.version,
          reason: "authority-unavailable",
        };
        recordUnverifiable(telemetry);
        recordUnverifiable(this.telemetry);
        results.push({
          candidate,
          status: "unverifiable",
          product,
          safeToPresent: false,
          usedAuthoritativeFallback: true,
          violation,
        });
        continue;
      }

      telemetry.freshCandidates += 1;
      this.telemetry.freshCandidates += 1;
      results.push({
        candidate,
        status: "fresh",
        product,
        safeToPresent: true,
        usedAuthoritativeFallback: true,
      });
    }

    return {
      candidates: results,
      telemetry: { ...telemetry },
    };
  }

  /** @deprecated Use the request-scoped telemetry returned by validateCandidates. */
  getTelemetry(): FreshnessTelemetry {
    return { ...this.telemetry };
  }

  resetTelemetry(): void {
    this.telemetry = emptyTelemetry();
  }
}

export const DerivedCandidateFreshnessValidator = FreshnessValidator;

export function isFreshnessViolation(result: FreshnessValidatedCandidate): boolean {
  return result.status !== "fresh";
}

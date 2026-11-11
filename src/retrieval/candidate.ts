import type { ProductId, RetrievalCandidate, SourceVersion } from "../contracts/types.js";

export interface ValidatedCandidate {
  productId: ProductId;
  source: string;
  score: number;
  sourceVersion?: SourceVersion | undefined;
}

export interface DeduplicatedCandidate {
  productId: ProductId;
  score: number;
  sources: string[];
  sourceScores: Record<string, number>;
  sourceVersion?: SourceVersion | undefined;
}

export function validateCandidate(candidate: unknown): ValidatedCandidate {
  if (!candidate || typeof candidate !== "object") {
    throw new Error("Candidate must be an object.");
  }

  const record = candidate as Record<string, unknown>;

  if (typeof record["productId"] !== "string" || record["productId"].trim().length === 0) {
    throw new Error("Candidate must have a non-empty string productId.");
  }

  if (typeof record["source"] !== "string" || record["source"].trim().length === 0) {
    throw new Error("Candidate must have a non-empty string source identifier.");
  }

  if (typeof record["score"] !== "number" || !Number.isFinite(record["score"])) {
    throw new Error("Candidate must have a finite numeric score.");
  }

  let sourceVersion: SourceVersion | undefined;
  if (record["sourceVersion"] !== undefined) {
    if (
      typeof record["sourceVersion"] !== "number" ||
      !Number.isInteger(record["sourceVersion"]) ||
      record["sourceVersion"] <= 0
    ) {
      throw new Error("Candidate sourceVersion must be a positive integer if provided.");
    }
    sourceVersion = record["sourceVersion"];
  }

  const result: ValidatedCandidate = {
    productId: record["productId"].trim(),
    source: record["source"].trim(),
    score: record["score"],
  };

  if (sourceVersion !== undefined) {
    result.sourceVersion = sourceVersion;
  }

  return result;
}

export type ScoreCombinationStrategy = "max" | "sum" | "average";

export interface DeduplicationOptions {
  strategy?: ScoreCombinationStrategy;
  limit?: number;
}

export function deduplicateCandidates(
  candidates: RetrievalCandidate[],
  options: DeduplicationOptions = {},
): DeduplicatedCandidate[] {
  const strategy = options.strategy ?? "max";
  const candidateMap = new Map<ProductId, {
    productId: ProductId;
    sources: string[];
    sourceScores: Record<string, number>;
    highestVersion?: SourceVersion | undefined;
  }>();

  for (const raw of candidates) {
    const valid = validateCandidate(raw);
    const existing = candidateMap.get(valid.productId);

    if (!existing) {
      candidateMap.set(valid.productId, {
        productId: valid.productId,
        sources: [valid.source],
        sourceScores: { [valid.source]: valid.score },
        highestVersion: valid.sourceVersion,
      });
    } else {
      if (!existing.sources.includes(valid.source)) {
        existing.sources.push(valid.source);
      }
      existing.sourceScores[valid.source] = valid.score;

      if (valid.sourceVersion !== undefined) {
        if (existing.highestVersion === undefined || valid.sourceVersion > existing.highestVersion) {
          existing.highestVersion = valid.sourceVersion;
        }
      }
    }
  }

  const result: DeduplicatedCandidate[] = [];

  for (const entry of candidateMap.values()) {
    const scores = Object.values(entry.sourceScores);
    let combinedScore = 0;

    if (strategy === "max") {
      combinedScore = Math.max(...scores);
    } else if (strategy === "sum") {
      combinedScore = scores.reduce((acc, s) => acc + s, 0);
    } else if (strategy === "average") {
      combinedScore = scores.reduce((acc, s) => acc + s, 0) / scores.length;
    }

    const deduplicated: DeduplicatedCandidate = {
      productId: entry.productId,
      score: combinedScore,
      sources: [...entry.sources].sort(),
      sourceScores: entry.sourceScores,
    };

    if (entry.highestVersion !== undefined) {
      deduplicated.sourceVersion = entry.highestVersion;
    }

    result.push(deduplicated);
  }

  // Deterministic sorting: higher score first; ties broken by productId ascending
  result.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.productId.localeCompare(b.productId);
  });

  if (options.limit !== undefined && options.limit > 0) {
    return result.slice(0, options.limit);
  }

  return result;
}

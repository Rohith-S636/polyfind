function validateK(k: number): void {
  if (!Number.isInteger(k) || k <= 0) {
    throw new Error("k must be a positive integer.");
  }
}

function uniqueTopK(retrievedIds: string[], k: number): string[] {
  validateK(k);
  return [...new Set(retrievedIds)].slice(0, k);
}

export function precisionAtK(
  retrievedIds: string[],
  relevanceJudgments: Map<string, number> | Set<string>,
  k: number,
): number {
  const topK = uniqueTopK(retrievedIds, k);
  if (topK.length === 0) {
    return 0;
  }

  let relevantCount = 0;
  for (const id of topK) {
    if (relevanceJudgments instanceof Set) {
      if (relevanceJudgments.has(id)) {
        relevantCount += 1;
      }
    } else {
      const score = relevanceJudgments.get(id) ?? 0;
      if (score > 0) {
        relevantCount += 1;
      }
    }
  }

  return relevantCount / k;
}

export function recallAtK(
  retrievedIds: string[],
  relevanceJudgments: Map<string, number> | Set<string>,
  k: number,
): number {
  let totalRelevant = 0;
  if (relevanceJudgments instanceof Set) {
    totalRelevant = relevanceJudgments.size;
  } else {
    for (const score of relevanceJudgments.values()) {
      if (score > 0) {
        totalRelevant += 1;
      }
    }
  }

  if (totalRelevant === 0) {
    return 1.0; // Vacuously complete if there are no relevant documents
  }

  const topK = uniqueTopK(retrievedIds, k);
  let relevantCount = 0;
  for (const id of topK) {
    if (relevanceJudgments instanceof Set) {
      if (relevanceJudgments.has(id)) {
        relevantCount += 1;
      }
    } else {
      const score = relevanceJudgments.get(id) ?? 0;
      if (score > 0) {
        relevantCount += 1;
      }
    }
  }

  return relevantCount / totalRelevant;
}

export function dcgAtK(
  retrievedIds: string[],
  relevanceJudgments: Map<string, number>,
  k: number,
): number {
  const topK = uniqueTopK(retrievedIds, k);
  let dcg = 0;

  for (let i = 0; i < topK.length; i++) {
    const id = topK[i];
    // Missing judgment policy: unjudged items in retrieved set are treated as relevance = 0
    const rel = id ? (relevanceJudgments.get(id) ?? 0) : 0;
    const rank = i + 1;
    // Standard exponential gain formula: (2^rel - 1) / log2(rank + 1)
    const numerator = Math.pow(2, rel) - 1;
    const denominator = Math.log2(rank + 1);
    dcg += numerator / denominator;
  }

  return dcg;
}

export function idcgAtK(
  relevanceJudgments: Map<string, number>,
  k: number,
): number {
  validateK(k);

  const sortedGains = Array.from(relevanceJudgments.values())
    .filter((score) => score > 0)
    .sort((a, b) => b - a)
    .slice(0, k);

  let idcg = 0;
  for (let i = 0; i < sortedGains.length; i++) {
    const rel = sortedGains[i] ?? 0;
    const rank = i + 1;
    idcg += (Math.pow(2, rel) - 1) / Math.log2(rank + 1);
  }

  return idcg;
}

export function ndcgAtK(
  retrievedIds: string[],
  relevanceJudgments: Map<string, number>,
  k: number,
): number {
  const idcg = idcgAtK(relevanceJudgments, k);
  if (idcg === 0) {
    return 0.0;
  }

  const dcg = dcgAtK(retrievedIds, relevanceJudgments, k);
  return Math.min(1.0, dcg / idcg);
}

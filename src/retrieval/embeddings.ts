/**
 * Text Embedding Providers and Preprocessing Pipeline for PolyFind
 * Converts catalog product text and search queries into normalized dense vectors.
 */

export interface TextEmbeddingProvider {
  readonly modelName: string;
  readonly dimensions: number;
  preprocess(text: string): string;
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

/**
 * Text preprocessing pipeline for catalog items:
 * - Lowercases text
 * - Replaces non-alphanumeric punctuation with single spaces
 * - Collapses consecutive whitespace
 * - Truncates excessively long text to avoid token overflow
 */
export function preprocessProductText(text: string, maxLength = 512): string {
  if (!text) return "";
  return text
    .toLowerCase()
    .normalize("NFKC")
    .replace(/-{2,}/g, " ")
    .replace(/[^\p{L}\p{N}_\-\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

/**
 * Constructs a dense semantic representation string for a catalog product.
 * Combines title, category tag, and descriptive body with structured weighting.
 */
export function buildProductEmbeddingText(product: {
  name: string;
  categoryId: string;
  description: string;
}): string {
  const cleanName = preprocessProductText(product.name, 120);
  const cleanCategory = preprocessProductText(product.categoryId, 40);
  const cleanDescription = preprocessProductText(product.description, 350);
  return `${cleanName} | category: ${cleanCategory} | ${cleanDescription}`;
}

/**
 * Fast, deterministic L2-normalized embedding generator.
 * Generates reproducible unit vectors for local offline execution and unit testing.
 * Uses 384 dimensions matching all-MiniLM-L6-v2 architecture.
 */
export class DeterministicEmbeddingProvider implements TextEmbeddingProvider {
  public readonly modelName = "all-MiniLM-L6-v2-deterministic";
  public readonly dimensions: number;

  constructor(dimensions = 384) {
    this.dimensions = dimensions;
  }

  preprocess(text: string): string {
    return preprocessProductText(text);
  }

  async embed(text: string): Promise<number[]> {
    const cleaned = this.preprocess(text);
    const vector = new Array<number>(this.dimensions).fill(0);

    for (let i = 0; i < cleaned.length; i++) {
      const code = cleaned.charCodeAt(i);
      const slot = (code * 37 + i * 17) % this.dimensions;
      vector[slot] = (vector[slot] ?? 0) + (code % 7) + 1;
    }

    // Compute Euclidean L2 norm
    let sumSq = 0;
    for (let i = 0; i < this.dimensions; i++) {
      const v = vector[i] ?? 0;
      sumSq += v * v;
    }
    const norm = Math.sqrt(sumSq);

    if (norm > 0) {
      for (let i = 0; i < this.dimensions; i++) {
        vector[i] = (vector[i] ?? 0) / norm;
      }
    }

    return vector;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];
    for (const text of texts) {
      results.push(await this.embed(text));
    }
    return results;
  }
}

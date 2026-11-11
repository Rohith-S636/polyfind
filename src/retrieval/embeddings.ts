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
 * Local deterministic feature-hashing vectorizer. This is a lexical vector
 * baseline, not a pretrained language model; it requires no API key or network.
 * Word, bigram, and character-trigram features produce repeatable unit vectors.
 */
export class DeterministicEmbeddingProvider implements TextEmbeddingProvider {
  public readonly modelName = "polyfind-feature-hash-v1";
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
    const tokens = cleaned.match(/[\p{L}\p{N}]+/gu) ?? [];
    const addFeature = (feature: string, weight: number): void => {
      let hash = 0x811c9dc5;
      for (const character of feature) {
        hash ^= character.codePointAt(0) ?? 0;
        hash = Math.imul(hash, 0x01000193) >>> 0;
      }
      const slot = hash % this.dimensions;
      const sign = (hash & 0x80000000) === 0 ? 1 : -1;
      vector[slot] = (vector[slot] ?? 0) + sign * weight;
    };

    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index]!;
      addFeature(`w:${token}`, 2);
      if (index > 0) addFeature(`b:${tokens[index - 1]}_${token}`, 1.25);
      if (token.length >= 3) {
        for (let offset = 0; offset <= token.length - 3; offset += 1) {
          addFeature(`c:${token.slice(offset, offset + 3)}`, 0.2);
        }
      }
    }

    const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    if (norm > 0) {
      for (let index = 0; index < vector.length; index += 1) {
        vector[index] = (vector[index] ?? 0) / norm;
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

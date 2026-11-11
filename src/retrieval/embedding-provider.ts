import type { TextEmbeddingProvider } from "./embeddings.js";

export interface OpenAiCompatibleEmbeddingOptions {
  endpoint: string;
  apiKey: string;
  modelName: string;
  dimensions: number;
  timeoutMs?: number;
  fetcher?: typeof fetch;
}

interface EmbeddingResponse {
  data?: Array<{ embedding?: unknown }>;
}

function validateEmbedding(value: unknown, dimensions: number): number[] {
  if (!Array.isArray(value) || value.length !== dimensions || !value.every((item) => typeof item === "number" && Number.isFinite(item))) {
    throw new Error(`Embedding response must contain ${dimensions} finite numeric values.`);
  }
  return value;
}

export class OpenAiCompatibleEmbeddingProvider implements TextEmbeddingProvider {
  public readonly modelName: string;
  public readonly dimensions: number;
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly fetcher: typeof fetch;

  constructor(options: OpenAiCompatibleEmbeddingOptions) {
    if (!options.endpoint.trim()) throw new Error("Embedding endpoint is required.");
    if (!options.apiKey.trim()) throw new Error("Embedding API key is required.");
    if (!options.modelName.trim()) throw new Error("Embedding model is required.");
    if (!Number.isInteger(options.dimensions) || options.dimensions <= 0) throw new Error("Embedding dimensions must be positive.");
    this.endpoint = options.endpoint;
    this.apiKey = options.apiKey;
    this.modelName = options.modelName;
    this.dimensions = options.dimensions;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.fetcher = options.fetcher ?? fetch;
  }

  preprocess(text: string): string {
    return text.trim();
  }

  async embed(text: string): Promise<number[]> {
    const result = await this.embedBatch([text]);
    return result[0]!;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetcher(this.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({ model: this.modelName, input: texts.map((text) => this.preprocess(text)) }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Embedding provider returned HTTP ${response.status}.`);
      const payload = await response.json() as EmbeddingResponse;
      const vectors = payload.data?.map((item) => validateEmbedding(item.embedding, this.dimensions));
      if (!vectors || vectors.length !== texts.length) throw new Error("Embedding provider returned an invalid response.");
      return vectors;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createEmbeddingProviderFromEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): OpenAiCompatibleEmbeddingProvider {
  return new OpenAiCompatibleEmbeddingProvider({
    endpoint: env.EMBEDDING_ENDPOINT ?? "https://api.openai.com/v1/embeddings",
    apiKey: (env.EMBEDDING_API_KEY || env.OPENAI_API_KEY) ?? "",
    modelName: env.EMBEDDING_MODEL ?? "",
    dimensions: Number(env.EMBEDDING_DIMENSIONS ?? 384),
    timeoutMs: Number(env.EMBEDDING_TIMEOUT_MS ?? 15_000),
  });
}

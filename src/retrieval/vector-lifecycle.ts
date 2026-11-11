import { LanceDbVectorStore, createLanceDbStoreFromEnvironment, type LanceDbStatus } from "./lancedb-store.js";
import { createEmbeddingProviderFromEnvironment, type OpenAiCompatibleEmbeddingProvider } from "./embedding-provider.js";
import { VectorSemanticRetrievalAdapter } from "./vector-adapter.js";
import type { RetrievalProvider } from "../contracts/types.js";
import { DeterministicEmbeddingProvider, type TextEmbeddingProvider } from "./embeddings.js";

export type EmbeddingConfigurationStatus = "not-configured" | "configured-unverified" | "local-deterministic";

export interface VectorRuntimeHealth {
  state: "not-initialized" | "initializing" | "available" | "degraded" | "unavailable" | "closed";
  store: LanceDbStatus;
  table: "not-ready" | "ready";
  embedding: EmbeddingConfigurationStatus;
  embeddingVerified: boolean;
}

export interface VectorRuntimeOptions {
  store: LanceDbVectorStore;
  embedder?: TextEmbeddingProvider;
  embeddingConfigured: boolean;
  localEmbedding?: boolean;
}

export class VectorRuntime {
  private readonly store: LanceDbVectorStore;
  private readonly embedder: TextEmbeddingProvider | undefined;
  private readonly embeddingConfigured: boolean;
  private readonly localEmbedding: boolean;
  private embeddingVerified = false;
  private semanticProvider: RetrievalProvider | undefined;
  private state: VectorRuntimeHealth["state"] = "not-initialized";
  private initializing: Promise<void> | undefined;

  constructor(options: VectorRuntimeOptions) {
    this.store = options.store;
    this.embedder = options.embedder;
    this.embeddingConfigured = options.embeddingConfigured;
    this.localEmbedding = options.localEmbedding ?? false;
  }

  async initialize(): Promise<void> {
    if (this.state === "available" || this.state === "degraded") return;
    if (this.initializing) return this.initializing;
    this.state = "initializing";
    this.initializing = this.initializeOnce();
    try {
      await this.initializing;
    } finally {
      this.initializing = undefined;
    }
  }

  getSemanticProvider(): RetrievalProvider | undefined {
    return this.semanticProvider;
  }

  getStore(): LanceDbVectorStore {
    return this.store;
  }

  getEmbedder(): TextEmbeddingProvider | undefined {
    return this.embedder;
  }

  getHealth(): VectorRuntimeHealth {
    const store = this.store.getStatus();
    const table = store === "connected" ? "ready" : "not-ready";
    const embedding: EmbeddingConfigurationStatus = this.localEmbedding
      ? "local-deterministic"
      : this.embeddingConfigured
        ? "configured-unverified"
        : "not-configured";
    return {
      state: this.state,
      store,
      table,
      embedding,
      embeddingVerified: this.embeddingVerified,
    };
  }

  async close(): Promise<void> {
    if (this.initializing) await this.initializing.catch(() => undefined);
    await this.store.close();
    this.semanticProvider = undefined;
    this.state = "closed";
  }

  private async initializeOnce(): Promise<void> {
    try {
      await this.store.initialize();
      if (this.embedder) {
        try {
          const probe = await this.embedder.embed("polyfind embedding startup verification");
          if (probe.length !== this.embedder.dimensions || !probe.every(Number.isFinite)) {
            throw new Error("Embedding startup probe returned an invalid vector.");
          }
          this.semanticProvider = new VectorSemanticRetrievalAdapter(this.store, this.embedder);
          this.embeddingVerified = true;
          this.state = "available";
        } catch (error) {
          this.semanticProvider = undefined;
          this.state = "degraded";
          console.error(`Embedding provider is unavailable; lexical and graph retrieval remain enabled: ${error instanceof Error ? error.message : "unknown error"}`);
        }
      } else {
        this.state = "degraded";
      }
    } catch (error) {
      this.semanticProvider = undefined;
      this.state = "unavailable";
      console.error(`Vector retrieval is unavailable: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }
}

export function createVectorRuntimeFromEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): VectorRuntime {
  const endpoint = env.EMBEDDING_ENDPOINT?.trim() ?? "";
  const apiKey = (env.EMBEDDING_API_KEY?.trim() || env.OPENAI_API_KEY?.trim()) ?? "";
  const modelName = env.EMBEDDING_MODEL?.trim() ?? "";
  const embeddingConfigured = Boolean(endpoint && apiKey && modelName);
  const localEmbedding = !embeddingConfigured && env.POLYFIND_LOCAL_EMBEDDINGS !== "false";
  const dimensions = Number(env.EMBEDDING_DIMENSIONS ?? 384);
  const embedder: TextEmbeddingProvider | undefined = embeddingConfigured
    ? createEmbeddingProviderFromEnvironment(env)
    : localEmbedding
      ? new DeterministicEmbeddingProvider(dimensions)
      : undefined;
  return new VectorRuntime({
    store: createLanceDbStoreFromEnvironment(env),
    ...(embedder ? { embedder } : {}),
    embeddingConfigured,
    localEmbedding,
  });
}

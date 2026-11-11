export {
  validateCandidate,
  deduplicateCandidates,
  type ValidatedCandidate,
  type DeduplicatedCandidate,
  type DeduplicationOptions,
  type ScoreCombinationStrategy,
} from "./candidate.js";

export {
  executeRetrievalAdapter,
  type AdapterExecutionResult,
} from "./adapter.js";

export {
  cosineSimilarity,
  generateDeterministicEmbedding,
  InMemorySpikeVectorStore,
  FileColumnarSpikeVectorStore,
  runVectorSpike,
  SPIKE_FIXTURE_PRODUCTS,
  type VectorRecord,
  type VectorQuery,
  type VectorMatch,
  type VectorStoreCandidate,
  type SpikeComparisonResult,
} from "./vector-spike.js";

export {
  type TextEmbeddingProvider,
  preprocessProductText,
  buildProductEmbeddingText,
  DeterministicEmbeddingProvider,
} from "./embeddings.js";

export {
  VectorIngestionService,
  type IngestionBatchResult,
} from "./vector-ingestion.js";

export {
  VectorSemanticRetrievalAdapter,
  type VectorAdapterDiagnostics,
} from "./vector-adapter.js";

export {
  LanceDbVectorStore,
  createLanceDbStoreFromEnvironment,
  type LanceDbStatus,
  type LanceDbStoreOptions,
} from "./lancedb-store.js";

export {
  OpenAiCompatibleEmbeddingProvider,
  createEmbeddingProviderFromEnvironment,
  type OpenAiCompatibleEmbeddingOptions,
} from "./embedding-provider.js";

export {
  VectorRuntime,
  createVectorRuntimeFromEnvironment,
  type EmbeddingConfigurationStatus,
  type VectorRuntimeHealth,
  type VectorRuntimeOptions,
} from "./vector-lifecycle.js";

export {
  GraphRetrievalAdapter,
  GraphCandidateRetrievalAdapter,
  Neo4jGraphRetrievalAdapter,
  createGraphRetrievalAdapter,
  type GraphCandidateStorage,
  Neo4jGraphRetrievalProvider,
  type Neo4jCandidateReader,
} from "./graph-adapter.js";

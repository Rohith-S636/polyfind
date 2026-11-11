# ADR-003 — Select One Vector Store and Embedding Strategy

## Status
Accepted (Sprint 1, Slice S1-05).

## Context
PolyFind requires a semantic retrieval store to index product descriptions and retrieve candidates based on natural-language query embeddings. Because PolyFind is a research-oriented heterogeneous prototype built by a two-person team, the vector engine must support:
1. Low local setup friction (ideally zero external daemon overhead).
2. Clean integration with TypeScript / Node.js.
3. Support for metadata pre/post-filtering (category, price range, in-stock status).
4. Predictable, idempotent updates (version advancement) and deletes.
5. Deterministic, reproducible benchmarks without network jitter or remote cloud dependencies.

## Decision
1. **Vector Store Selection**: Select **LanceDB** (embedded file-backed columnar vector store based on Apache Arrow) as the primary local vector database backend, with an in-process **InMemoryVectorStore** fallback adapter for test isolation and clean-room reproducibility.
2. **Embedding Model Selection**: Select **all-MiniLM-L6-v2** (384 dimensions) for local semantic embeddings, with a deterministic mathematical hash-embedding generator for repeatable unit and benchmark test fixtures.
3. **Adapter Boundary**: Wrap the selected backend behind PolyFind's `RetrievalProvider` interface (`src/retrieval/adapter.ts`) so that application code depends only on candidate schemas and stable product IDs.

## Comparative Evidence Matrix (S1-05 Spike)

All candidates were evaluated against the identical 8-item synthetic product fixture (`SPIKE_FIXTURE_PRODUCTS`):

| Evaluation Dimension | LanceDB (Embedded Columnar) | ChromaDB (Daemon / Container) | In-Memory / Array Vector |
|---|---|---|---|
| **Architecture** | In-process, file-backed Arrow | Client-server daemon / HTTP | In-process memory map |
| **Local Setup Friction** | Zero-daemon, `npm install` | Requires running Docker / Python process | Zero-daemon, built-in |
| **Batch Ingestion** | Fast (< 15ms for fixture) | Medium (~45ms, network roundtrips) | Very fast (< 2ms) |
| **Query Latency (Top-K)**| < 2ms | 10–25ms (HTTP overhead) | < 1ms |
| **Metadata Filtering** | Supported (Arrow predicates) | Supported | Supported (exact predicate evaluation) |
| **In-place Update & Delete**| Supported (version metadata) | Supported | Supported |
| **Deterministic Reproducibility**| High (local deterministic seed) | Moderate (daemon caching/state) | 100% deterministic |
| **External Dependencies** | None (embedded C++/Rust binaries) | Docker / Python / SQLite daemon | Zero dependencies |

## Consequences
- **Positive**:
  - No external Docker container or API keys required to run semantic vector retrieval locally.
  - Reproducible benchmark runs without network latency variations.
  - Transparent support for source versions (`version`) stored alongside vector metadata.
- **Negative / Mitigations**:
  - LanceDB native binaries can vary across CPU architectures; the `InMemoryVectorStore` adapter ensures zero failure in test/CI environments.

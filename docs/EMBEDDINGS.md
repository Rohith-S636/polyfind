# Embedding Strategy, Model Selection, and Text Preprocessing

## 1. Selected Embedding Architecture
- **Model Standard**: `sentence-transformers/all-MiniLM-L6-v2`
- **Vector Dimensionality**: 384 dense floating-point dimensions.
- **Metric Space**: Cosine Similarity ($\frac{\vec{u} \cdot \vec{v}}{\|\vec{u}\|_2 \|\vec{v}\|_2}$). All vectors are $L_2$-normalized upon creation so that inner dot product equals cosine similarity.
- **Provider Modes**:
  - **Offline/Unit Testing**: `DeterministicEmbeddingProvider` generates deterministic unit-normalized 384-dimensional vectors with zero external runtime dependencies.
  - **Local ONNX/Transformers**: Runs `all-MiniLM-L6-v2` locally via in-process ONNX runtime.

---

## 2. Text Preprocessing Pipeline

To maximize semantic retrieval recall without token bloat, product text undergoes standard multi-stage normalization:

1. **Normalization**: Unicode `NFKC` normalization to standardize characters and diacritics.
2. **Case Folding**: All text is converted to lowercase.
3. **Punctuation Filtering**: Replaces non-alphanumeric punctuation with single spaces while preserving international alphanumeric characters (`\p{L}\p{N}`).
4. **Whitespace Compaction**: Collapses multiple whitespace characters and newlines into a single space.
5. **Structured Field Weighting**: Combines product attributes into a unified embedding prompt:
   ```text
   ${cleanName} | category: ${cleanCategory} | ${cleanDescription}
   ```
   Length limits: Title (120 chars), Category (40 chars), Description (350 chars). Total maximum input length is capped at 512 characters.

---

## 3. Vector Store Record Schema

Every record in the vector database stores:
- `id` (`string`): Stable authoritative `ProductId` matching MySQL.
- `vector` (`number[]`): Dense 384-dimensional floating-point array.
- `metadata`:
  - `name`: Product name.
  - `categoryId`: Category identifier for pre/post-filtering.
  - `price`: Product price.
  - `inStock`: Boolean availability flag.
  - `version`: Monotonic source version number (`SourceVersion`).

---

## 4. Freshness and Idempotent Update Semantics
- Ingestion is idempotent: ingesting the same product batch repeatedly overwrites in-place without duplicating index entities.
- When an authoritative MySQL update occurs, `updateProduct` updates the vector embedding and records the new version.
- Deletions are propagated via `deleteProduct(id)`.

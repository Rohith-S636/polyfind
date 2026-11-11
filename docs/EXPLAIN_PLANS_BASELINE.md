# PolyFind — MySQL Index Baseline and EXPLAIN Plans

> Recorded for Slice S2-04: Constraints, indexes, and transaction tests.

## 1. Index Strategy

The authoritative relational store (MySQL 8.0 / InnoDB) uses the following indexes on `products`:

| Table | Index Name | Columns | Purpose | Type |
|---|---|---|---|---|
| `products` | `PRIMARY` | `id` | Authoritative single-entity lookup and transactional locking (`FOR UPDATE`) | Clustered B-Tree |
| `products` | `fk_products_category` | `category_id` | Foreign-key referential integrity to `categories(id)` | Non-clustered B-Tree |
| `products` | `idx_products_category_price` | `(category_id, price)` | Composite range-filtering for category + price bounds | Non-clustered B-Tree |
| `products` | `idx_products_stock` | `stock` | In-stock (`stock > 0`) vs. out-of-stock (`stock = 0`) filtering | Non-clustered B-Tree |
| `products` | `idx_products_updated_at` | `updated_at` | Incremental change capture and ordering by recency | Non-clustered B-Tree |
| `products` | `idx_products_search` | `(name, description)` | Baseline relational full-text search fallback | FULLTEXT Index |
| `product_versions` | `PRIMARY` | `id` | Version record identity | Clustered B-Tree |
| `product_versions` | `uq_product_version` | `(product_id, version)` | Unique version history per product | Unique B-Tree |

---

## 2. EXPLAIN Plans Baseline

### Query 1: Single Product Authoritative Lookup
```sql
EXPLAIN SELECT id, name, description, category_id, price, stock, version, updated_at
FROM products WHERE id = 'prod-001';
```
* **Selected Index:** `PRIMARY`
* **Access Type:** `const`
* **Expected Rows:** 1
* **Evaluation:** Constant-time clustered index lookup. Critical for fast authoritative price/stock freshness validation.

---

### Query 2: Category and Price Range Filtering
```sql
EXPLAIN SELECT id, name, category_id, price, stock, version
FROM products
WHERE category_id = 'cat-outdoors' AND price BETWEEN 10.00 AND 50.00
ORDER BY id ASC;
```
* **Selected Index:** `idx_products_category_price`
* **Access Type:** `range` / `ref`
* **Expected Rows:** Bounded by matching category items within price range.
* **Evaluation:** Composite index enables index range scan without table scans on the full catalog.

---

### Query 3: Stock Status Filter
```sql
EXPLAIN SELECT id, name, stock
FROM products
WHERE stock > 0;
```
* **Selected Index:** `idx_products_stock`
* **Access Type:** `range`
* **Evaluation:** Isolates available inventory without scanning out-of-stock rows.

---

### Query 4: Product Version History Lookup
```sql
EXPLAIN SELECT version, price, stock, recorded_at
FROM product_versions
WHERE product_id = 'prod-001' AND version = 2;
```
* **Selected Index:** `uq_product_version`
* **Access Type:** `const`
* **Expected Rows:** 1
* **Evaluation:** Constant-time verification of point-in-time product version facts.

---

## 3. Transactional Invariants

1. **Transactional Atomicity:**
   - Any price or stock update executes in an explicit InnoDB transaction (`BEGIN ... COMMIT`).
   - The update atomically writes the new version to `products` and appends an entry to `product_versions`.
   - Partial writes are rejected; a failure in either table results in immediate `ROLLBACK`.

2. **Optimistic Concurrency Control:**
   - Updates pass `expectedVersion`.
   - The SQL update verifies `WHERE id = ? AND version = ?`. If `expectedVersion` does not match, a `409 Conflict` is returned and no state mutation occurs.

3. **Data Authority Protection:**
   - Derived retrieval stores (vector index, cache, graph) provide candidate IDs and relevance scores only.
   - Price and stock returned to end-users or evaluated in transactional contracts are strictly validated against MySQL. Stale values from derived stores cannot overwrite authoritative facts.

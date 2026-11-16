# POLYFIND SQL Operations Catalogue and DBMS Demonstration

**Purpose:** A reproducible index of SQL constructs demonstrated by the MySQL implementation and academic review.  
**Authority:** MySQL 8 / InnoDB.  
**Schema source:** [RELATIONAL_SCHEMA_PHASE4.md](RELATIONAL_SCHEMA_PHASE4.md) and migrations 001–005.  
**Execution notes:** [POLYFIND_SQL_Review_Notes.md](POLYFIND_SQL_Review_Notes.md).

## 1. Database and safety boundary

MySQL is authoritative for catalogue facts, seller offers, price history, user roles, sessions, audit records, and outbox state. Run examples only against a disposable local database or the explicitly disposable CI databases. Do not run migration, seed, DROP, or trigger-creation commands against an existing/deployed database without separate review and backup.

The checked-in catalogue is synthetic. The historical SQL review notes record MySQL 8.0.46 and an observed database count of 51 products after the seed command. This is a historical local database observation, not a promise that every clean seed produces 51 products; the seed command's requested count was 50.

## 2. DDL and relational integrity

| Migration | Main objects |
|---|---|
| 001 | categories, products, product_versions |
| 002 | Product category/price, stock, update-time and FULLTEXT indexes |
| 003 | Product metadata compatibility fields |
| 004 | Brands, product variants, sellers, offers, offer_history, users, roles, user_roles, sessions, audit_logs, outbox_events, outbox_deliveries |
| 005 | Outbox delivery lease/retry support |

The canonical ER model and constraints are in [RELATIONAL_SCHEMA_PHASE4.md](RELATIONAL_SCHEMA_PHASE4.md). A composite foreign key from (offers.variant_id, offers.product_id) to (product_variants.id, product_variants.product_id) prevents an offer from referring to a variant belonging to another product.

Important integrity rules include primary/foreign keys, unique slugs and user email, non-negative price/stock, positive versions, offer availability consistency, valid offer time windows, role-assignment composite keys, and separate outbox delivery state per derived target.

## 3. DML and transaction examples

### 3.1 Read catalogue records

~~~sql
SELECT id, name, price, stock, version
FROM products
WHERE id = 'prod-0043';
~~~

### 3.2 Join and aggregate

~~~sql
SELECT c.name AS category,
       COUNT(p.id) AS total_products,
       ROUND(AVG(p.price), 2) AS average_price,
       MIN(p.price) AS minimum_price,
       MAX(p.price) AS maximum_price
FROM categories AS c
LEFT JOIN products AS p ON p.category_id = c.id
GROUP BY c.id, c.name
ORDER BY total_products DESC;
~~~

### 3.3 Nested subquery

~~~sql
SELECT id, name, price
FROM products
WHERE price > (SELECT AVG(price) FROM products)
ORDER BY price DESC;
~~~

### 3.4 Correlated subquery

~~~sql
SELECT p.name, p.price, c.name AS category
FROM products AS p
JOIN categories AS c ON c.id = p.category_id
WHERE p.price > (
    SELECT AVG(p2.price)
    FROM products AS p2
    WHERE p2.category_id = p.category_id
)
ORDER BY c.name, p.price DESC;
~~~

### 3.5 Common table expression

~~~sql
WITH CategoryStats AS (
    SELECT category_id, COUNT(*) AS product_count, AVG(price) AS avg_price
    FROM products
    GROUP BY category_id
)
SELECT c.name, cs.product_count, ROUND(cs.avg_price, 2) AS average_price
FROM CategoryStats AS cs
JOIN categories AS c ON c.id = cs.category_id
ORDER BY cs.product_count DESC;
~~~

### 3.6 Window function

~~~sql
SELECT name, price,
       RANK() OVER (ORDER BY price DESC) AS price_rank
FROM products;
~~~

### 3.7 Stored procedure

~~~sql
DROP PROCEDURE IF EXISTS GetProductsByCategory;
DELIMITER //
CREATE PROCEDURE GetProductsByCategory(IN categoryName VARCHAR(255))
BEGIN
    SELECT p.id, p.name, p.price, p.stock, c.name AS category
    FROM products AS p
    INNER JOIN categories AS c ON c.id = p.category_id
    WHERE c.name = categoryName
    ORDER BY p.price ASC;
END //
DELIMITER ;
~~~

Example calls:

~~~sql
CALL GetProductsByCategory('Outdoors & Camping');
CALL GetProductsByCategory('Consumer Electronics');
~~~

### 3.8 Stored function

The SQL review created a deterministic inventory-value function:

~~~sql
DELIMITER //
CREATE FUNCTION CalculateInventoryValue(
    productPrice DECIMAL(10,2),
    productStock INT
)
RETURNS DECIMAL(12,2)
DETERMINISTIC
BEGIN
    RETURN productPrice * productStock;
END //
DELIMITER ;
~~~

~~~sql
SELECT name, price, stock,
       CalculateInventoryValue(price, stock) AS inventory_value
FROM products
ORDER BY inventory_value DESC
LIMIT 10;
~~~

The earlier local review required this MySQL administrator setting because binary logging was enabled and the function-creation account lacked SUPER. This is a local development note, not a production recommendation:

~~~sql
SET GLOBAL log_bin_trust_function_creators = 1;
SHOW VARIABLES LIKE 'log_bin_trust_function_creators';
~~~

### 3.9 Trigger and history

The SQL review notes include an AFTER UPDATE trigger demonstration for product price/stock history. The current application also records product/offer version history and audit/outbox records through repository transactions. Distinguish the educational trigger exercise from the repository's transaction-based audit/history path; do not imply the trigger is the sole or authoritative mechanism for every mutation.

Consult [POLYFIND_SQL_Review_Notes.md](POLYFIND_SQL_Review_Notes.md) for the exact trigger definition and observed product/version example. Run the trigger demonstration only on a disposable schema.

## 4. Advanced DBMS concepts demonstrated

| Concept | Implementation / evidence | Why it matters |
|---|---|---|
| ACID transactions | MySQL repositories; offer mutation, history/audit/outbox writes | Keeps related authoritative changes atomic |
| Referential integrity | Foreign keys and composite offer/variant FK | Prevents invalid entity relationships |
| Optimistic concurrency control | Product/offer source versions and expected-version checks | Rejects stale concurrent updates |
| Indexing and query optimization | Composite, filter, FULLTEXT and operational indexes; EXPLAIN baseline | Reduces relational lookup/filter work |
| Analytical SQL | Window functions, CTEs, nested/correlated subqueries and aggregates | Demonstrates SQL beyond CRUD |
| Programmable database objects | Stored procedures, deterministic functions and trigger exercise | Demonstrates database-side logic |
| Transactional outbox | outbox_events/outbox_deliveries; Phase 8 documentation | Commits mutation and synchronization intent atomically |
| Idempotent projections | Neo4j/LanceDB adapters; version-aware outbox delivery | Prevents delayed events replacing newer derived state |

The project needs at least four advanced concepts for the DBMS review. Claim each as implemented only when the cited source and test evidence support it.

## 5. Reproducible local sequence

Use a disposable local schema configured in .env:

~~~powershell
Copy-Item .env.example .env
# Set DATABASE_URL to a dedicated disposable local database.
npm run migrate
npm run seed -- --seed=42 --count=50
~~~

Execute read/query examples in a MySQL client. Use exact table and column names from current migrations; historical conceptual schema files are not executable specifications.

## 6. Evidence discipline

- Historical row counts in POLYFIND_SQL_Review_Notes.md retain their date/environment context.
- Do not infer a clean database row count from a prior local run.
- Do not claim the educational trigger exercise is the only application history mechanism.
- Do not run destructive reset helpers or DROP statements against non-disposable data.
- For current integration status, consult the latest successful GitHub Actions run, not a historical SQL screenshot.

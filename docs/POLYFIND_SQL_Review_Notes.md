# POLYFIND --- SQL Review Preparation Notes

**Database:** `polyfind`\
**DBMS:** MySQL Community Server 8.0.46

This is a record of the SQL concepts and commands actually practised in
the session. The database contained 51 products: 50 generated seed
products plus the original `Rain Jacket` record. The generated products
are test data, not a real retailer catalogue.

## 1. Connect to MySQL

Run in Windows PowerShell:

``` powershell
& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u polyfind -p polyfind
```

Administrator connection:

``` powershell
& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p
```

Exit:

``` sql
exit;
```

## 2. Seed the practice catalogue

Run from the repository directory:

``` powershell
npm run seed -- --seed=42 --count=50
```

Observed: validation passed for 5 categories and 50 products; 50
products were seeded into MySQL.

## 3. Inspect table structure and product data

``` sql
DESCRIBE product_versions;
```

The `product_versions` table has: `id`, `product_id`, `version`,
`price`, `stock`, `change_reason`, and `recorded_at`.

``` sql
SELECT id, name, price, stock, version
FROM products
WHERE id = 'prod-0043';
```

``` sql
SELECT *
FROM product_versions
WHERE product_id = 'prod-0043'
ORDER BY version;
```

## 4. JOIN, aggregate functions, GROUP BY and ORDER BY

``` sql
SELECT
    c.name AS category,
    COUNT(p.id) AS total_products,
    ROUND(AVG(p.price), 2) AS average_price,
    MIN(p.price) AS minimum_price,
    MAX(p.price) AS maximum_price
FROM categories c
LEFT JOIN products p ON c.id = p.category_id
GROUP BY c.id, c.name
ORDER BY total_products DESC;
```

Concepts: `LEFT JOIN`, `COUNT`, `AVG`, `ROUND`, `MIN`, `MAX`,
`GROUP BY`, `ORDER BY`.

## 5. Window function: RANK()

``` sql
SELECT
    name,
    price,
    RANK() OVER (ORDER BY price DESC) AS price_rank
FROM products;
```

`RANK()` assigns a rank based on price while retaining individual
product rows.

## 6. Nested subquery

``` sql
SELECT id, name, price
FROM products
WHERE price > (
    SELECT AVG(price)
    FROM products
)
ORDER BY price DESC;
```

Observed: 23 rows. The inner query calculates the overall average price;
the outer query returns products above that average.

A `WHERE` clause cannot be executed by itself; it must be part of a
complete SQL statement.

## 7. Correlated subquery

``` sql
SELECT
    p.name,
    p.price,
    c.name AS category
FROM products p
JOIN categories c ON p.category_id = c.id
WHERE p.price > (
    SELECT AVG(p2.price)
    FROM products p2
    WHERE p2.category_id = p.category_id
)
ORDER BY c.name, p.price DESC;
```

Observed: 26 rows. The inner query refers to the outer query's
`p.category_id`, calculating the average for each product's category.

## 8. Common Table Expression (CTE)

``` sql
WITH CategoryStats AS (
    SELECT
        category_id,
        COUNT(*) AS product_count,
        AVG(price) AS avg_price
    FROM products
    GROUP BY category_id
)
SELECT
    c.name,
    cs.product_count,
    ROUND(cs.avg_price, 2) AS average_price
FROM CategoryStats cs
JOIN categories c ON c.id = cs.category_id
ORDER BY cs.product_count DESC;
```

`WITH CategoryStats AS (...)` defines a named temporary result set for
the main query.

## 9. Stored procedure

``` sql
DROP PROCEDURE IF EXISTS GetProductsByCategory;

DELIMITER //

CREATE PROCEDURE GetProductsByCategory(IN categoryName VARCHAR(255))
BEGIN
    SELECT
        p.id,
        p.name,
        p.price,
        p.stock,
        c.name AS category
    FROM products p
    INNER JOIN categories c ON p.category_id = c.id
    WHERE c.name = categoryName
    ORDER BY p.price ASC;
END //

DELIMITER ;
```

Calls:

``` sql
CALL GetProductsByCategory('Outdoors & Camping');
CALL GetProductsByCategory('Consumer Electronics');
```

Observed: 14 rows for `Outdoors & Camping`; 8 rows for
`Consumer Electronics`.

Concepts: `CREATE PROCEDURE`, `IN` parameter, `CALL`, `INNER JOIN`,
filtering and sorting.

## 10. Stored function

### Permission setting used

Function creation initially failed with error 1419 because binary
logging was enabled and the account lacked `SUPER`. As MySQL
administrator, the following local server setting was enabled:

``` sql
SET GLOBAL log_bin_trust_function_creators = 1;
```

Verify:

``` sql
SHOW VARIABLES LIKE 'log_bin_trust_function_creators';
```

Observed value: `ON`.

**Note:** `SET GLOBAL` is temporary and normally resets when MySQL
restarts. It relaxes a binary-logging safety restriction; treat this as
a local-development setting, not an automatic production recommendation.

### Create the function

Reconnect as `polyfind` and run:

``` sql
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
```

Use it in a query:

``` sql
SELECT
    name,
    price,
    stock,
    CalculateInventoryValue(price, stock) AS inventory_value
FROM products
ORDER BY inventory_value DESC
LIMIT 10;
```

The query was also run without `LIMIT 10`, returning all 51 products.

Formula: `inventory_value = price * stock`.

Concepts: input parameters, `RETURNS`, `DETERMINISTIC`, and calling a
stored function inside `SELECT` and `ORDER BY`.

## 11. Trigger for product history

``` sql
DELIMITER //

CREATE TRIGGER trg_product_history_after_update
AFTER UPDATE ON products
FOR EACH ROW
BEGIN
    IF OLD.price <> NEW.price OR OLD.stock <> NEW.stock THEN

        INSERT INTO product_versions (
            product_id,
            version,
            price,
            stock,
            change_reason
        )
        VALUES (
            NEW.id,
            NEW.version,
            NEW.price,
            NEW.stock,
            'Automatic update trigger'
        );

    END IF;
END //

DELIMITER ;
```

Verify:

``` sql
SHOW TRIGGERS LIKE 'products';
```

Observed: `trg_product_history_after_update` was present.

Concepts: - `AFTER UPDATE`: trigger timing and event. - `FOR EACH ROW`:
trigger runs for each affected row. - `OLD`: values before the update. -
`NEW`: values after the update. - `IF`: only log when price or stock
changes. - `INSERT`: write the new state to `product_versions`.

## 12. Trigger test with transaction and ROLLBACK

Before the test, `prod-0043` had price `495.28`, stock `87`, version
`1`, and no history rows.

Start a transaction and update:

``` sql
START TRANSACTION;

UPDATE products
SET
    price = 490.00,
    stock = 86,
    version = version + 1
WHERE id = 'prod-0043';
```

Inspect the product:

``` sql
SELECT id, name, price, stock, version
FROM products
WHERE id = 'prod-0043';
```

Inspect the trigger-generated history:

``` sql
SELECT *
FROM product_versions
WHERE product_id = 'prod-0043'
ORDER BY version;
```

Observed inside the transaction: price `490.00`, stock `86`, version
`2`; one history row was inserted with reason
`Automatic update trigger`.

Roll back:

``` sql
ROLLBACK;
```

Verify:

``` sql
SELECT id, name, price, stock, version
FROM products
WHERE id = 'prod-0043';

SELECT *
FROM product_versions
WHERE product_id = 'prod-0043';
```

Observed after rollback: price `495.28`, stock `87`, version `1`, and no
history rows. Both the product update and trigger-generated insert were
rolled back.

## 13. Progress checklist

### Practised successfully

-   [x] SELECT, WHERE, ORDER BY
-   [x] Aggregate functions: `COUNT`, `AVG`, `MIN`, `MAX`, `ROUND`
-   [x] JOINs
-   [x] GROUP BY
-   [x] Window function: `RANK()`
-   [x] Nested subquery
-   [x] Correlated subquery
-   [x] CTE
-   [x] Stored procedure
-   [x] Stored function
-   [x] Trigger
-   [x] Transaction and `ROLLBACK`
### Not yet practised in this session

-   [ ] Standalone DML exercises for `INSERT`, `UPDATE`, `DELETE`
-   [ ] `COMMIT` and savepoints
-   [ ] Creating and altering constraints: primary key, foreign key,
    unique, check, not null, default
-   [ ] Creating indexes and using `EXPLAIN`
-   [ ] Views
-   [ ] Recursive CTEs
-   [ ] Trigger events for `INSERT` and `DELETE`
-   [ ] MySQL users, roles and privileges in detail
-   [ ] Redis, Neo4j and Qdrant queries/integration

Do not claim the entire SQL syllabus is completed; this checklist
reflects only the work practised here.

## 14. Exercises for the remaining checklist items

These exercises are prepared for a future practice session. They are
intentionally not marked as completed above because they have not yet
been run and verified.

### Standalone DML

``` sql
INSERT INTO products (
    id, name, description, category_id, price, stock
)
VALUES (
    'practice-dml-001', 'Practice Product', 'Temporary DML row',
    (SELECT id FROM categories ORDER BY id LIMIT 1), 19.99, 5
);

UPDATE products
SET price = 17.99, stock = stock + 1
WHERE id = 'practice-dml-001';

DELETE FROM products
WHERE id = 'practice-dml-001';
```

### `COMMIT` and savepoints

``` sql
START TRANSACTION;

UPDATE products
SET stock = stock - 1
WHERE id = 'prod-0043' AND stock > 0;

SAVEPOINT after_stock_update;

UPDATE products
SET price = price + 10
WHERE id = 'prod-0043';

ROLLBACK TO SAVEPOINT after_stock_update;
COMMIT;
```

### Constraints

``` sql
CREATE TABLE constraint_practice (
    id INT NOT NULL,
    code VARCHAR(20) NOT NULL,
    quantity INT NOT NULL DEFAULT 0,
    CONSTRAINT pk_constraint_practice PRIMARY KEY (id),
    CONSTRAINT uq_constraint_practice_code UNIQUE (code),
    CONSTRAINT chk_constraint_practice_quantity CHECK (quantity >= 0)
);

ALTER TABLE constraint_practice
    ADD CONSTRAINT chk_constraint_practice_code
    CHECK (CHAR_LENGTH(TRIM(code)) > 0);

ALTER TABLE constraint_practice
    MODIFY quantity INT NOT NULL DEFAULT 1;

DROP TABLE constraint_practice;
```

The existing `products.category_id` foreign key is an example of a
foreign-key constraint. `NOT NULL` and `DEFAULT` are demonstrated in
the practice table definition and alteration.

### Indexes and `EXPLAIN`

``` sql
CREATE INDEX idx_products_practice_name
    ON products (name);

EXPLAIN
SELECT id, name, price
FROM products
WHERE name = 'Practice Product';

DROP INDEX idx_products_practice_name ON products;
```

### View

``` sql
CREATE OR REPLACE VIEW product_inventory_summary AS
SELECT
    id,
    name,
    price,
    stock,
    price * stock AS inventory_value
FROM products;

SELECT *
FROM product_inventory_summary
ORDER BY inventory_value DESC
LIMIT 10;

DROP VIEW product_inventory_summary;
```

### Recursive CTE

``` sql
WITH RECURSIVE numbers AS (
    SELECT 1 AS n
    UNION ALL
    SELECT n + 1
    FROM numbers
    WHERE n < 5
)
SELECT n
FROM numbers;
```

### `INSERT` and `DELETE` trigger events

``` sql
CREATE TABLE trigger_practice_log (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    event_name VARCHAR(20) NOT NULL,
    product_id VARCHAR(64) NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);

DELIMITER //

CREATE TRIGGER trg_products_practice_after_insert
AFTER INSERT ON products
FOR EACH ROW
BEGIN
    INSERT INTO trigger_practice_log (event_name, product_id)
    VALUES ('INSERT', NEW.id);
END //

CREATE TRIGGER trg_products_practice_after_delete
AFTER DELETE ON products
FOR EACH ROW
BEGIN
    INSERT INTO trigger_practice_log (event_name, product_id)
    VALUES ('DELETE', OLD.id);
END //

DELIMITER ;
```

Use the standalone DML exercise to fire both events, inspect
`trigger_practice_log`, then remove the practice triggers and table:

``` sql
DROP TRIGGER trg_products_practice_after_insert;
DROP TRIGGER trg_products_practice_after_delete;
DROP TABLE trigger_practice_log;
```

### Verify and compare the table changes

`Query OK` confirms that a command executed successfully.
`SHOW TABLES;` only confirms whether a table exists; it does not show
how its definition changed. Capture the definition before and after a
`CREATE TABLE` or `ALTER TABLE` command:

Run these comparison queries before the cleanup `DROP TABLE
constraint_practice;` command.

``` sql
SHOW CREATE TABLE constraint_practice;

ALTER TABLE constraint_practice
    ADD COLUMN notes VARCHAR(100) NULL;

SHOW CREATE TABLE constraint_practice;
```

Compare the two `CREATE TABLE` outputs. The second output should contain
the new `notes` column. For a more focused column comparison, query
`INFORMATION_SCHEMA`:

``` sql
SELECT
    column_name,
    column_type,
    is_nullable,
    column_default,
    column_key,
    extra
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND table_name = 'constraint_practice'
ORDER BY ordinal_position;
```

Compare constraints and indexes separately:

``` sql
SELECT
    constraint_name,
    constraint_type
FROM information_schema.table_constraints
WHERE table_schema = DATABASE()
  AND table_name = 'constraint_practice'
ORDER BY constraint_name;

SHOW INDEX FROM constraint_practice;
```

For the standalone DML exercise, compare the row count and the actual
row before and after each command:

``` sql
SELECT COUNT(*) AS product_count
FROM products;

SELECT id, name, price, stock
FROM products
WHERE id = 'practice-dml-001';
```

After the `INSERT`, the count increases and the practice row appears.
After the `UPDATE`, its values change. After the `DELETE`, the row
disappears and the count returns to its original value. Run:

``` sql
SHOW TABLES;
```

only as an additional presence check. The temporary practice tables
should be absent after the cleanup commands above.

## 15. POLYFIND implementation caveat

The trigger was created and its behavior was tested. Before keeping it
as a permanent application feature, inspect the application's existing
product-update and version-history logic. If the application already
inserts into `product_versions`, the trigger could create duplicate
history rows for the same update.

The earlier observed seed operation created 50 products without initial
`product_versions` rows. This trigger records qualifying future updates;
it does not backfill existing product history.

## 16. Quick oral-review questions

1.  What is the difference between `INNER JOIN` and `LEFT JOIN`?
2.  Why use `GROUP BY` with aggregate functions?
3.  What is the difference between `WHERE` and `HAVING`?
4.  What is the difference between a nested and correlated subquery?
5.  What is a CTE?
6.  What is the difference between `RANK()` and `ROW_NUMBER()`?
7.  What is the difference between a stored procedure and a stored
    function?
8.  What do `OLD` and `NEW` mean inside a trigger?
9.  What is the difference between `BEFORE UPDATE` and `AFTER UPDATE`?
10. What is the difference between `COMMIT` and `ROLLBACK`?
11. Why did function creation initially fail in this MySQL setup?
12. Why check application-level history logic before retaining the
    trigger?

**Review tip:** Explain the purpose of each query, how it works, what
its output means, and how the concept could be used in POLYFIND's
product catalogue and price/inventory history.

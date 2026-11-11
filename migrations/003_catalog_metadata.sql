-- Migration 003: Optional catalogue metadata and explicit source provenance.
-- Existing rows receive safe unknown/null values; no retail facts are fabricated.
-- ADD COLUMN IF NOT EXISTS is a MariaDB extension; the migration runner strips it
-- for MySQL 8.0 compatibility while preserving idempotency via schema_migrations tracking.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS currency CHAR(3) NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS availability ENUM('in-stock', 'out-of-stock', 'unknown') NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS brand VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS attributes JSON NULL,
  ADD COLUMN IF NOT EXISTS image_url VARCHAR(2048) NULL,
  ADD COLUMN IF NOT EXISTS product_url VARCHAR(2048) NULL,
  ADD COLUMN IF NOT EXISTS data_source ENUM('demo', 'catalog') NOT NULL DEFAULT 'catalog';

UPDATE products
SET availability = CASE WHEN stock > 0 THEN 'in-stock' ELSE 'out-of-stock' END
WHERE availability = 'unknown';

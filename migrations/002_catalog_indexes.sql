-- Migration 002: Catalog query and filtering performance indexes
-- Establishes composite and dedicated indexes for category-price filtering,
-- stock status, monotonic update ordering, and full-text keyword search.

CREATE INDEX idx_products_category_price ON products (category_id, price);
CREATE INDEX idx_products_stock ON products (stock);
CREATE INDEX idx_products_updated_at ON products (updated_at);
CREATE FULLTEXT INDEX idx_products_search ON products (name, description);

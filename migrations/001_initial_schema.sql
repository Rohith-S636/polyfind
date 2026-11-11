-- Migration 001: Initial schema for PolyFind catalog and version metadata
-- Establishes authoritative MySQL storage for categories, products, and version history.

CREATE TABLE IF NOT EXISTS categories (
  id VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT pk_categories PRIMARY KEY (id),
  CONSTRAINT chk_category_id_non_empty CHECK (CHAR_LENGTH(TRIM(id)) > 0),
  CONSTRAINT chk_category_name_non_empty CHECK (CHAR_LENGTH(TRIM(name)) > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS products (
  id VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  category_id VARCHAR(64) NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  stock INT NOT NULL,
  version BIGINT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT pk_products PRIMARY KEY (id),
  CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES categories(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_product_id_non_empty CHECK (CHAR_LENGTH(TRIM(id)) > 0),
  CONSTRAINT chk_product_name_non_empty CHECK (CHAR_LENGTH(TRIM(name)) > 0),
  CONSTRAINT chk_product_price_non_negative CHECK (price >= 0),
  CONSTRAINT chk_product_stock_non_negative CHECK (stock >= 0),
  CONSTRAINT chk_product_version_positive CHECK (version > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS product_versions (
  id BIGINT UNSIGNED AUTO_INCREMENT NOT NULL,
  product_id VARCHAR(64) NOT NULL,
  version BIGINT UNSIGNED NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  stock INT NOT NULL,
  change_reason VARCHAR(255) NULL,
  recorded_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT pk_product_versions PRIMARY KEY (id),
  CONSTRAINT fk_product_versions_product FOREIGN KEY (product_id) REFERENCES products(id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT uq_product_version UNIQUE (product_id, version),
  CONSTRAINT chk_product_version_price_non_negative CHECK (price >= 0),
  CONSTRAINT chk_product_version_stock_non_negative CHECK (stock >= 0),
  CONSTRAINT chk_product_version_num_positive CHECK (version > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

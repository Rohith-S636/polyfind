-- Migration 004: normalized relational foundation for marketplace data.
-- Existing products.price/stock and product_versions remain for compatibility
-- with the current catalogue API. Seller-specific comparison facts live in offers.

ALTER TABLE categories
  ADD COLUMN parent_id VARCHAR(64) NULL,
  ADD COLUMN slug VARCHAR(255) NULL;

UPDATE categories
SET slug = id
WHERE slug IS NULL;

ALTER TABLE categories
  MODIFY COLUMN slug VARCHAR(255) NULL,
  ADD CONSTRAINT uq_categories_slug UNIQUE (slug),
  ADD CONSTRAINT fk_categories_parent
    FOREIGN KEY (parent_id) REFERENCES categories(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  ADD CONSTRAINT chk_categories_slug_non_empty
    CHECK (CHAR_LENGTH(TRIM(slug)) > 0);

CREATE INDEX idx_categories_parent ON categories (parent_id);

CREATE TABLE IF NOT EXISTS brands (
  id VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  description TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT pk_brands PRIMARY KEY (id),
  CONSTRAINT uq_brands_slug UNIQUE (slug),
  CONSTRAINT chk_brand_id_non_empty CHECK (CHAR_LENGTH(TRIM(id)) > 0),
  CONSTRAINT chk_brand_name_non_empty CHECK (CHAR_LENGTH(TRIM(name)) > 0),
  CONSTRAINT chk_brand_slug_non_empty CHECK (CHAR_LENGTH(TRIM(slug)) > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE products
  ADD COLUMN slug VARCHAR(255) NULL,
  ADD COLUMN brand_id VARCHAR(64) NULL,
  ADD COLUMN status ENUM('active', 'inactive', 'deleted') NOT NULL DEFAULT 'active';

UPDATE products
SET slug = id
WHERE slug IS NULL;

ALTER TABLE products
  MODIFY COLUMN slug VARCHAR(255) NULL,
  ADD CONSTRAINT uq_products_slug UNIQUE (slug),
  ADD CONSTRAINT fk_products_brand
    FOREIGN KEY (brand_id) REFERENCES brands(id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  ADD CONSTRAINT chk_products_slug_non_empty
    CHECK (CHAR_LENGTH(TRIM(slug)) > 0);

CREATE INDEX idx_products_brand_status ON products (brand_id, status);

CREATE TABLE IF NOT EXISTS product_variants (
  id VARCHAR(64) NOT NULL,
  product_id VARCHAR(64) NOT NULL,
  sku VARCHAR(128) NULL,
  variant_key VARCHAR(255) NOT NULL,
  attributes JSON NOT NULL,
  status ENUM('active', 'inactive', 'deleted') NOT NULL DEFAULT 'active',
  version BIGINT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT pk_product_variants PRIMARY KEY (id),
  CONSTRAINT uq_product_variants_sku UNIQUE (sku),
  CONSTRAINT uq_product_variants_product_pair UNIQUE (id, product_id),
  CONSTRAINT fk_product_variants_product
    FOREIGN KEY (product_id) REFERENCES products(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT chk_product_variant_id_non_empty CHECK (CHAR_LENGTH(TRIM(id)) > 0),
  CONSTRAINT chk_product_variant_key_non_empty CHECK (CHAR_LENGTH(TRIM(variant_key)) > 0),
  CONSTRAINT chk_product_variant_version_positive CHECK (version > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_product_variants_product_status
  ON product_variants (product_id, status);

CREATE TABLE IF NOT EXISTS sellers (
  id VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  status ENUM('active', 'inactive', 'suspended') NOT NULL DEFAULT 'active',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT pk_sellers PRIMARY KEY (id),
  CONSTRAINT uq_sellers_slug UNIQUE (slug),
  CONSTRAINT chk_seller_id_non_empty CHECK (CHAR_LENGTH(TRIM(id)) > 0),
  CONSTRAINT chk_seller_name_non_empty CHECK (CHAR_LENGTH(TRIM(name)) > 0),
  CONSTRAINT chk_seller_slug_non_empty CHECK (CHAR_LENGTH(TRIM(slug)) > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS offers (
  id VARCHAR(64) NOT NULL,
  product_id VARCHAR(64) NOT NULL,
  variant_id VARCHAR(64) NULL,
  seller_id VARCHAR(64) NOT NULL,
  currency CHAR(3) NOT NULL,
  price DECIMAL(12, 2) NOT NULL,
  stock_quantity INT NULL,
  availability ENUM('available', 'unavailable', 'unknown_stock') NOT NULL DEFAULT 'unknown_stock',
  valid_from DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  valid_until DATETIME(3) NULL,
  version BIGINT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT pk_offers PRIMARY KEY (id),
  CONSTRAINT fk_offers_product
    FOREIGN KEY (product_id) REFERENCES products(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_offers_variant_product
    FOREIGN KEY (variant_id, product_id)
    REFERENCES product_variants(id, product_id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_offers_seller
    FOREIGN KEY (seller_id) REFERENCES sellers(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_offer_id_non_empty CHECK (CHAR_LENGTH(TRIM(id)) > 0),
  CONSTRAINT chk_offer_currency_format CHECK (currency REGEXP '^[A-Z]{3}$'),
  CONSTRAINT chk_offer_price_non_negative CHECK (price >= 0),
  CONSTRAINT chk_offer_stock_non_negative
    CHECK (stock_quantity IS NULL OR stock_quantity >= 0),
  CONSTRAINT chk_offer_availability_state CHECK (
    (availability = 'available' AND stock_quantity IS NOT NULL AND stock_quantity > 0)
    OR (availability = 'unavailable' AND stock_quantity IS NOT NULL AND stock_quantity = 0)
    OR (availability = 'unknown_stock' AND stock_quantity IS NULL)
  ),
  CONSTRAINT chk_offer_validity_period
    CHECK (valid_until IS NULL OR valid_until > valid_from),
  CONSTRAINT chk_offer_version_positive CHECK (version > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_offers_product_availability
  ON offers (product_id, availability, valid_until);
CREATE INDEX idx_offers_seller_product ON offers (seller_id, product_id);
CREATE INDEX idx_offers_variant ON offers (variant_id);

CREATE TABLE IF NOT EXISTS offer_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  offer_id VARCHAR(64) NOT NULL,
  product_id VARCHAR(64) NOT NULL,
  seller_id VARCHAR(64) NOT NULL,
  currency CHAR(3) NOT NULL,
  price DECIMAL(12, 2) NOT NULL,
  stock_quantity INT NULL,
  availability ENUM('available', 'unavailable', 'unknown_stock') NOT NULL,
  offer_version BIGINT UNSIGNED NOT NULL,
  change_reason VARCHAR(255) NULL,
  recorded_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT pk_offer_history PRIMARY KEY (id),
  CONSTRAINT fk_offer_history_offer
    FOREIGN KEY (offer_id) REFERENCES offers(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_offer_history_product
    FOREIGN KEY (product_id) REFERENCES products(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_offer_history_seller
    FOREIGN KEY (seller_id) REFERENCES sellers(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_offer_history_currency_format CHECK (currency REGEXP '^[A-Z]{3}$'),
  CONSTRAINT chk_offer_history_price_non_negative CHECK (price >= 0),
  CONSTRAINT chk_offer_history_stock_non_negative
    CHECK (stock_quantity IS NULL OR stock_quantity >= 0),
  CONSTRAINT chk_offer_history_version_positive CHECK (offer_version > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_offer_history_offer_version
  ON offer_history (offer_id, offer_version);
CREATE INDEX idx_offer_history_product_recorded
  ON offer_history (product_id, recorded_at);

CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) NOT NULL,
  email VARCHAR(320) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  status ENUM('active', 'disabled', 'locked') NOT NULL DEFAULT 'active',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  last_login_at DATETIME(3) NULL,
  CONSTRAINT pk_users PRIMARY KEY (id),
  CONSTRAINT uq_users_email UNIQUE (email),
  CONSTRAINT chk_user_id_non_empty CHECK (CHAR_LENGTH(TRIM(id)) > 0),
  CONSTRAINT chk_user_email_non_empty CHECK (CHAR_LENGTH(TRIM(email)) > 0),
  CONSTRAINT chk_user_password_hash_non_empty CHECK (CHAR_LENGTH(TRIM(password_hash)) > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS roles (
  id VARCHAR(64) NOT NULL,
  name VARCHAR(64) NOT NULL,
  CONSTRAINT pk_roles PRIMARY KEY (id),
  CONSTRAINT uq_roles_name UNIQUE (name),
  CONSTRAINT chk_role_id_non_empty CHECK (CHAR_LENGTH(TRIM(id)) > 0),
  CONSTRAINT chk_role_name_non_empty CHECK (CHAR_LENGTH(TRIM(name)) > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_roles (
  user_id CHAR(36) NOT NULL,
  role_id VARCHAR(64) NOT NULL,
  assigned_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT pk_user_roles PRIMARY KEY (user_id, role_id),
  CONSTRAINT fk_user_roles_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_user_roles_role
    FOREIGN KEY (role_id) REFERENCES roles(id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sessions (
  id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  revoked_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_seen_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT pk_sessions PRIMARY KEY (id),
  CONSTRAINT uq_sessions_token_hash UNIQUE (token_hash),
  CONSTRAINT fk_sessions_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_sessions_user_active ON sessions (user_id, revoked_at, expires_at);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_user_id CHAR(36) NULL,
  action VARCHAR(128) NOT NULL,
  entity_type VARCHAR(64) NOT NULL,
  entity_id VARCHAR(64) NOT NULL,
  before_data JSON NULL,
  after_data JSON NULL,
  request_id CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT pk_audit_logs PRIMARY KEY (id),
  CONSTRAINT fk_audit_logs_actor
    FOREIGN KEY (actor_user_id) REFERENCES users(id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT chk_audit_action_non_empty CHECK (CHAR_LENGTH(TRIM(action)) > 0),
  CONSTRAINT chk_audit_entity_type_non_empty CHECK (CHAR_LENGTH(TRIM(entity_type)) > 0),
  CONSTRAINT chk_audit_entity_id_non_empty CHECK (CHAR_LENGTH(TRIM(entity_id)) > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_audit_logs_entity ON audit_logs (entity_type, entity_id, created_at);
CREATE INDEX idx_audit_logs_actor ON audit_logs (actor_user_id, created_at);

CREATE TABLE IF NOT EXISTS outbox_events (
  event_id CHAR(36) NOT NULL,
  aggregate_type VARCHAR(64) NOT NULL,
  aggregate_id VARCHAR(64) NOT NULL,
  aggregate_version BIGINT UNSIGNED NOT NULL,
  event_type VARCHAR(128) NOT NULL,
  schema_version VARCHAR(16) NOT NULL,
  payload JSON NOT NULL,
  occurred_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  available_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  claimed_at DATETIME(3) NULL,
  processed_at DATETIME(3) NULL,
  attempt_count INT UNSIGNED NOT NULL DEFAULT 0,
  last_error TEXT NULL,
  status ENUM('pending', 'processing', 'processed', 'failed', 'dead_letter')
    NOT NULL DEFAULT 'pending',
  CONSTRAINT pk_outbox_events PRIMARY KEY (event_id),
  CONSTRAINT chk_outbox_aggregate_version_positive CHECK (aggregate_version > 0),
  CONSTRAINT chk_outbox_event_type_non_empty CHECK (CHAR_LENGTH(TRIM(event_type)) > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_outbox_events_pending
  ON outbox_events (status, available_at, occurred_at);
CREATE INDEX idx_outbox_events_aggregate
  ON outbox_events (aggregate_type, aggregate_id, aggregate_version);

CREATE TABLE IF NOT EXISTS outbox_deliveries (
  event_id CHAR(36) NOT NULL,
  target_name ENUM('redis', 'neo4j', 'lancedb') NOT NULL,
  status ENUM('pending', 'applied', 'skipped', 'failed') NOT NULL DEFAULT 'pending',
  attempt_count INT UNSIGNED NOT NULL DEFAULT 0,
  last_attempt_at DATETIME(3) NULL,
  last_error TEXT NULL,
  CONSTRAINT pk_outbox_deliveries PRIMARY KEY (event_id, target_name),
  CONSTRAINT fk_outbox_deliveries_event
    FOREIGN KEY (event_id) REFERENCES outbox_events(event_id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_outbox_deliveries_status
  ON outbox_deliveries (target_name, status, last_attempt_at);

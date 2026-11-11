-- Migration 005: durable delivery retry and lease metadata.
ALTER TABLE outbox_deliveries
  ADD COLUMN next_attempt_at DATETIME(3) NULL,
  ADD COLUMN lease_owner VARCHAR(128) NULL,
  ADD COLUMN lease_expires_at DATETIME(3) NULL,
  ADD COLUMN completed_at DATETIME(3) NULL;

ALTER TABLE outbox_deliveries
  MODIFY COLUMN status ENUM('pending', 'processing', 'applied', 'skipped', 'failed', 'dead_letter')
    NOT NULL DEFAULT 'pending';

CREATE INDEX idx_outbox_deliveries_claim
  ON outbox_deliveries (status, next_attempt_at, lease_expires_at, target_name);

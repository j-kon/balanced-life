-- 0007_production_security_and_inventory.sql
-- 1. Expiring hashed access tokens for secure printed-order lookup, quote approval, and payment initiation.
-- 2. Explicit stock_deducted tracking on printed_orders so inventory restoration on cancellation is atomic.
-- 3. Clears assumed 500-copy default inventory in settings so unconfigured inventory remains explicitly unconfigured.

CREATE TABLE IF NOT EXISTS printed_order_access_tokens (
  token_hash TEXT PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES printed_orders(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_printed_order_access_tokens_order
  ON printed_order_access_tokens(order_id);
CREATE INDEX IF NOT EXISTS idx_printed_order_access_tokens_expiry
  ON printed_order_access_tokens(expires_at);

ALTER TABLE printed_orders ADD COLUMN stock_deducted INTEGER NOT NULL DEFAULT 0;

UPDATE settings
SET value = ''
WHERE key = 'printedBookStockCount' AND value = '500';


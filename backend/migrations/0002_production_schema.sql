-- Remove obsolete demo-only audit logs, sessions, and demo accounts while preserving real reader accounts
DELETE FROM reading_progress WHERE user_id IN (SELECT id FROM users WHERE email IN ('admin@balanced.test','subscriber@balanced.test','guest@balanced.test') OR email LIKE 'e2e-%@example.test');
DELETE FROM bookmarks WHERE user_id IN (SELECT id FROM users WHERE email IN ('admin@balanced.test','subscriber@balanced.test','guest@balanced.test') OR email LIKE 'e2e-%@example.test');
DELETE FROM journal_entries WHERE user_id IN (SELECT id FROM users WHERE email IN ('admin@balanced.test','subscriber@balanced.test','guest@balanced.test') OR email LIKE 'e2e-%@example.test');
DELETE FROM admin_audit_logs WHERE admin_id IN (SELECT id FROM users WHERE email IN ('admin@balanced.test','subscriber@balanced.test','guest@balanced.test') OR email LIKE 'e2e-%@example.test');
DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email IN ('admin@balanced.test','subscriber@balanced.test','guest@balanced.test') OR email LIKE 'e2e-%@example.test');
DELETE FROM payments WHERE user_id IN (SELECT id FROM users WHERE email IN ('admin@balanced.test','subscriber@balanced.test','guest@balanced.test') OR email LIKE 'e2e-%@example.test');
DELETE FROM subscriptions WHERE user_id IN (SELECT id FROM users WHERE email IN ('admin@balanced.test','subscriber@balanced.test','guest@balanced.test') OR email LIKE 'e2e-%@example.test');
DELETE FROM users WHERE email IN ('admin@balanced.test','subscriber@balanced.test','guest@balanced.test') OR email LIKE 'e2e-%@example.test';

-- Extend users for account status and profile updates
ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended'));
ALTER TABLE users ADD COLUMN suspended_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';
UPDATE users SET updated_at = created_at WHERE updated_at = '';

-- Password reset tokens for account recovery
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset_tokens(user_id);

-- Extend devotionals with editorial review status and notes
ALTER TABLE devotionals ADD COLUMN review_status TEXT NOT NULL DEFAULT 'pending_review' CHECK(review_status IN ('pending_review','needs_revision','approved'));
ALTER TABLE devotionals ADD COLUMN reviewer_notes TEXT NOT NULL DEFAULT '';
ALTER TABLE devotionals ADD COLUMN reviewed_at TEXT;
UPDATE devotionals SET review_status = 'approved', reviewed_at = updated_at WHERE published = 1;
UPDATE devotionals SET review_status = 'needs_revision', reviewer_notes = 'Nested section label detected during extraction; verify field boundaries against manuscript page 27 before approval.' WHERE date = '2027-02-13' AND published = 0;

-- Extend monthly themes with descriptions
ALTER TABLE monthly_themes ADD COLUMN description TEXT NOT NULL DEFAULT '';

-- Extend journal entries with optional title and updated_at
ALTER TABLE journal_entries ADD COLUMN title TEXT NOT NULL DEFAULT '';
ALTER TABLE journal_entries ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';
UPDATE journal_entries SET updated_at = created_at WHERE updated_at = '';

-- Replace demo-only payments and subscriptions tables with production-grade schema
DROP TABLE IF EXISTS payments;

CREATE TABLE subscriptions_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  plan_id INTEGER NOT NULL REFERENCES subscription_plans(id),
  access_type TEXT NOT NULL DEFAULT 'paid' CHECK(access_type IN ('paid','complimentary')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','cancelled','expired','revoked')),
  started_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  renewal_mode TEXT NOT NULL DEFAULT 'manual' CHECK(renewal_mode IN ('manual','automatic')),
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  provider_subscription_code TEXT,
  granted_by_admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  grant_reason TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

INSERT INTO subscriptions_new (
  id, user_id, plan_id, access_type, status, started_at, expires_at,
  renewal_mode, cancel_at_period_end, grant_reason, updated_at
)
SELECT
  id,
  user_id,
  plan_id,
  CASE WHEN is_demo = 1 THEN 'complimentary' ELSE 'paid' END,
  CASE WHEN cancel_at_period_end = 1 THEN 'cancelled' ELSE 'active' END,
  started_at,
  expires_at,
  renewal_mode,
  cancel_at_period_end,
  CASE WHEN is_demo = 1 THEN 'Complimentary access migrated from initial setup' ELSE '' END,
  started_at
FROM subscriptions;

DROP TABLE subscriptions;
ALTER TABLE subscriptions_new RENAME TO subscriptions;
CREATE INDEX IF NOT EXISTS idx_subscriptions_expires ON subscriptions(expires_at);

CREATE TABLE payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id INTEGER REFERENCES subscriptions(id) ON DELETE SET NULL,
  plan_id INTEGER NOT NULL REFERENCES subscription_plans(id),
  plan_name TEXT NOT NULL,
  amount_kobo INTEGER NOT NULL CHECK(amount_kobo > 0),
  currency TEXT NOT NULL DEFAULT 'NGN',
  reference TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL CHECK(provider IN ('paystack')),
  status TEXT NOT NULL CHECK(status IN ('pending','succeeded','failed','abandoned','refunded')),
  renewal_mode TEXT NOT NULL DEFAULT 'manual' CHECK(renewal_mode IN ('manual','automatic')),
  authorization_url TEXT,
  provider_transaction_id TEXT,
  verified_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

-- Upgrade hardcover_inquiries to support order tracking and general contact inquiries
CREATE TABLE hardcover_inquiries_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity > 0),
  delivery_location TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  inquiry_type TEXT NOT NULL DEFAULT 'hardcover' CHECK(inquiry_type IN ('hardcover','general')),
  status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','reviewed','contacted','fulfilled','archived')),
  admin_notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO hardcover_inquiries_new (
  id, name, email, message, status, created_at, updated_at
)
SELECT id, name, email, message, status, created_at, created_at FROM hardcover_inquiries;

DROP TABLE hardcover_inquiries;
ALTER TABLE hardcover_inquiries_new RENAME TO hardcover_inquiries;

-- Remove obsolete artificial demo reference date setting
DELETE FROM settings WHERE key = 'referenceDate';


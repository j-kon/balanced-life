-- 0008_separate_admin_auth_and_rbac.sql
-- Separates administrator identities, sessions, TOTP MFA, recovery codes, password resets,
-- RBAC roles, and admin audit references from ordinary reader accounts.

-- 1. Create dedicated administrator identities table
CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'owner' CHECK(role IN ('owner', 'content_editor', 'orders_manager', 'finance_manager')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'suspended')),
  suspended_reason TEXT NOT NULL DEFAULT '',
  mfa_enabled INTEGER NOT NULL DEFAULT 0,
  mfa_secret_enc TEXT,
  mfa_pending_secret_enc TEXT,
  mfa_verified_at TEXT,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  last_login_at TEXT,
  last_active_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_users_role_status ON admin_users(role, status);

-- 2. Create dedicated administrator sessions table (isolated from reader sessions)
CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash TEXT PRIMARY KEY,
  admin_id INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  mfa_verified INTEGER NOT NULL DEFAULT 0,
  ip_address TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  last_activity_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin_id ON admin_sessions(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires ON admin_sessions(expires_at);

-- 3. Create administrator single-use MFA recovery codes
CREATE TABLE IF NOT EXISTS admin_mfa_recovery_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_recovery_admin_id ON admin_mfa_recovery_codes(admin_id);

-- 4. Create dedicated administrator password reset tokens
CREATE TABLE IF NOT EXISTS admin_password_reset_tokens (
  token_hash TEXT PRIMARY KEY,
  admin_id INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_password_reset_admin_id ON admin_password_reset_tokens(admin_id);

-- 5. Preserve audit history with structured actor & entity metadata, pointing FKs to admin_users
CREATE TABLE admin_audit_logs_v8 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
  legacy_user_admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_name TEXT NOT NULL DEFAULT '',
  actor_email TEXT NOT NULL DEFAULT '',
  actor_role TEXT NOT NULL DEFAULT '',
  entity_type TEXT NOT NULL DEFAULT 'system',
  entity_id TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  created_at TEXT NOT NULL
);

INSERT INTO admin_audit_logs_v8 (
  id,
  admin_id,
  legacy_user_admin_id,
  actor_name,
  actor_email,
  actor_role,
  entity_type,
  entity_id,
  action,
  created_at
)
SELECT
  a.id,
  NULL,
  CASE WHEN u.id IS NOT NULL THEN a.admin_id ELSE NULL END,
  COALESCE(u.name, 'Legacy Administrator'),
  COALESCE(u.email, ''),
  'legacy_admin',
  'legacy',
  COALESCE(CAST(a.admin_id AS TEXT), ''),
  a.action,
  a.created_at
FROM admin_audit_logs a
LEFT JOIN users u ON u.id = a.admin_id;

DROP TABLE admin_audit_logs;
ALTER TABLE admin_audit_logs_v8 RENAME TO admin_audit_logs;

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at ON admin_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_admin_id ON admin_audit_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_entity ON admin_audit_logs(entity_type, entity_id);

-- 6. Rebuild admin FK references in subscriptions, digital_purchases, digital_entitlements, and printed_orders
--    to reference admin_users(id) instead of users(id), preserving all existing records safely.
CREATE TABLE subscriptions_v8 (
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
  granted_by_admin_id INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
  grant_reason TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

INSERT INTO subscriptions_v8 (
  id, user_id, plan_id, access_type, status, started_at, expires_at,
  renewal_mode, cancel_at_period_end, provider_subscription_code,
  granted_by_admin_id, grant_reason, updated_at
)
SELECT
  id, user_id, plan_id, access_type, status, started_at, expires_at,
  renewal_mode, cancel_at_period_end, provider_subscription_code,
  NULL, grant_reason, updated_at
FROM subscriptions;

DROP TABLE subscriptions;
ALTER TABLE subscriptions_v8 RENAME TO subscriptions;
CREATE INDEX IF NOT EXISTS idx_subscriptions_expires ON subscriptions(expires_at);

CREATE TABLE digital_purchases_v8 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_code TEXT NOT NULL DEFAULT 'digital_2027',
  product_name TEXT NOT NULL DEFAULT 'The Balanced Life Devotional — 2027 Digital Edition',
  amount_kobo INTEGER NOT NULL CHECK(amount_kobo > 0),
  currency TEXT NOT NULL DEFAULT 'NGN' CHECK(currency IN ('NGN', 'USD', 'GBP')),
  payment_method TEXT NOT NULL CHECK(payment_method IN ('paystack', 'bank_transfer')),
  reference TEXT NOT NULL UNIQUE,
  authorization_url TEXT,
  provider_transaction_id TEXT,
  transfer_reference TEXT NOT NULL DEFAULT '',
  payer_note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK(status IN ('pending', 'verifying_transfer', 'succeeded', 'failed', 'refunded', 'revoked')),
  admin_notes TEXT NOT NULL DEFAULT '',
  verified_by_admin_id INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
  verified_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  duration_months INTEGER NOT NULL DEFAULT 12,
  is_renewal INTEGER NOT NULL DEFAULT 0,
  period_start_at TEXT,
  period_end_at TEXT
);

INSERT INTO digital_purchases_v8 (
  id, user_id, product_code, product_name, amount_kobo, currency,
  payment_method, reference, authorization_url, provider_transaction_id,
  transfer_reference, payer_note, status, admin_notes,
  verified_by_admin_id, verified_at, created_at, updated_at,
  duration_months, is_renewal, period_start_at, period_end_at
)
SELECT
  id, user_id, product_code, product_name, amount_kobo, currency,
  payment_method, reference, authorization_url, provider_transaction_id,
  transfer_reference, payer_note, status, admin_notes,
  NULL, verified_at, created_at, updated_at,
  duration_months, is_renewal, period_start_at, period_end_at
FROM digital_purchases;

DROP TABLE digital_purchases;
ALTER TABLE digital_purchases_v8 RENAME TO digital_purchases;
CREATE INDEX IF NOT EXISTS idx_digital_purchases_user_id ON digital_purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_digital_purchases_status ON digital_purchases(status);

CREATE TABLE digital_entitlements_v8 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purchase_id INTEGER REFERENCES digital_purchases(id) ON DELETE SET NULL,
  edition_year INTEGER NOT NULL DEFAULT 2027,
  access_type TEXT NOT NULL DEFAULT 'paid' CHECK(access_type IN ('paid', 'complimentary')),
  access_scope TEXT NOT NULL DEFAULT 'edition_2027' CHECK(access_scope IN ('edition_2027', 'includes_membership_updates')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'expired', 'revoked', 'refunded')),
  starts_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  duration_months INTEGER NOT NULL DEFAULT 12,
  renewal_count INTEGER NOT NULL DEFAULT 0,
  legacy_persistent INTEGER NOT NULL DEFAULT 0,
  legacy_review_required INTEGER NOT NULL DEFAULT 0,
  granted_by_admin_id INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
  grant_reason TEXT NOT NULL DEFAULT '',
  granted_at TEXT NOT NULL,
  revoked_at TEXT,
  revoke_reason TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, edition_year)
);

INSERT INTO digital_entitlements_v8 (
  id, user_id, purchase_id, edition_year, access_type, access_scope,
  status, starts_at, expires_at, duration_months, renewal_count,
  legacy_persistent, legacy_review_required, granted_by_admin_id,
  grant_reason, granted_at, revoked_at, revoke_reason, updated_at
)
SELECT
  id, user_id, purchase_id, edition_year, access_type, access_scope,
  status, starts_at, expires_at, duration_months, renewal_count,
  legacy_persistent, legacy_review_required, NULL,
  grant_reason, granted_at, revoked_at, revoke_reason, updated_at
FROM digital_entitlements;

DROP TABLE digital_entitlements;
ALTER TABLE digital_entitlements_v8 RENAME TO digital_entitlements;
CREATE INDEX IF NOT EXISTS idx_digital_entitlements_user_id ON digital_entitlements(user_id);
CREATE INDEX IF NOT EXISTS idx_digital_entitlements_status ON digital_entitlements(status, expires_at);

CREATE TABLE printed_orders_v8 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number TEXT NOT NULL UNIQUE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  bulk_order_id INTEGER REFERENCES bulk_orders(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  street_address TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'Nigeria',
  delivery_landmark TEXT NOT NULL DEFAULT '',
  quantity INTEGER NOT NULL CHECK(quantity >= 1),
  unit_price_kobo INTEGER NOT NULL DEFAULT 500000 CHECK(unit_price_kobo > 0),
  subtotal_kobo INTEGER NOT NULL CHECK(subtotal_kobo > 0),
  delivery_fee_kobo INTEGER,
  delivery_quote_status TEXT NOT NULL DEFAULT 'pending_quote' CHECK(delivery_quote_status IN ('pending_quote', 'quoted', 'customer_approved', 'not_required')),
  delivery_quote_note TEXT NOT NULL DEFAULT '',
  final_total_kobo INTEGER,
  customer_approved_quote_at TEXT,
  currency TEXT NOT NULL DEFAULT 'NGN' CHECK(currency IN ('NGN', 'USD', 'GBP')),
  payment_method TEXT NOT NULL DEFAULT 'unselected' CHECK(payment_method IN ('unselected', 'paystack', 'bank_transfer')),
  payment_reference TEXT UNIQUE,
  authorization_url TEXT,
  provider_transaction_id TEXT,
  transfer_reference TEXT NOT NULL DEFAULT '',
  payer_note TEXT NOT NULL DEFAULT '',
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK(payment_status IN ('pending', 'awaiting_verification', 'paid', 'failed', 'refunded')),
  fulfillment_status TEXT NOT NULL DEFAULT 'awaiting_delivery_quotation' CHECK(fulfillment_status IN ('new', 'awaiting_delivery_quotation', 'awaiting_payment', 'processing', 'ready_for_dispatch', 'shipped', 'delivered', 'cancelled')),
  dispatch_exception_note TEXT NOT NULL DEFAULT '',
  courier_name TEXT NOT NULL DEFAULT '',
  tracking_reference TEXT NOT NULL DEFAULT '',
  customer_delivery_notes TEXT NOT NULL DEFAULT '',
  admin_notes TEXT NOT NULL DEFAULT '',
  verified_by_admin_id INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
  paid_at TEXT,
  shipped_at TEXT,
  delivered_at TEXT,
  cancelled_at TEXT,
  refunded_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  stock_deducted INTEGER NOT NULL DEFAULT 0
);

INSERT INTO printed_orders_v8 (
  id, order_number, user_id, bulk_order_id, full_name, email, phone,
  street_address, city, state, country, delivery_landmark, quantity,
  unit_price_kobo, subtotal_kobo, delivery_fee_kobo, delivery_quote_status,
  delivery_quote_note, final_total_kobo, customer_approved_quote_at, currency,
  payment_method, payment_reference, authorization_url, provider_transaction_id,
  transfer_reference, payer_note, payment_status, fulfillment_status,
  dispatch_exception_note, courier_name, tracking_reference,
  customer_delivery_notes, admin_notes, verified_by_admin_id,
  paid_at, shipped_at, delivered_at, cancelled_at, refunded_at,
  created_at, updated_at, stock_deducted
)
SELECT
  id, order_number, user_id, bulk_order_id, full_name, email, phone,
  street_address, city, state, country, delivery_landmark, quantity,
  unit_price_kobo, subtotal_kobo, delivery_fee_kobo, delivery_quote_status,
  delivery_quote_note, final_total_kobo, customer_approved_quote_at, currency,
  payment_method, payment_reference, authorization_url, provider_transaction_id,
  transfer_reference, payer_note, payment_status, fulfillment_status,
  dispatch_exception_note, courier_name, tracking_reference,
  customer_delivery_notes, admin_notes, NULL,
  paid_at, shipped_at, delivered_at, cancelled_at, refunded_at,
  created_at, updated_at, stock_deducted
FROM printed_orders;

DROP TABLE printed_orders;
ALTER TABLE printed_orders_v8 RENAME TO printed_orders;
CREATE INDEX IF NOT EXISTS idx_printed_orders_user_id ON printed_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_printed_orders_payment_status ON printed_orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_printed_orders_fulfillment_status ON printed_orders(fulfillment_status);
CREATE INDEX IF NOT EXISTS idx_printed_orders_email ON printed_orders(email);

-- 7. Flag any pre-existing reader accounts that previously had role='admin',
--    revoke their shared reader sessions, and demote users.role to 'reader'.
ALTER TABLE users ADD COLUMN legacy_admin_status TEXT NOT NULL DEFAULT 'none' CHECK(legacy_admin_status IN ('none', 'pending_decision', 'migrated', 'retired'));

DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE role = 'admin');

UPDATE users
SET legacy_admin_status = 'pending_decision',
    role = 'reader',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE role = 'admin';


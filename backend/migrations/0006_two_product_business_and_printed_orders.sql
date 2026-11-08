-- 0006_two_product_business_and_printed_orders.sql
-- Finalizes the two-product business model:
-- 1. Product A: 2027 Digital Devotional Access (₦3,500 for 12 calendar months, date-bounded with safe legacy preservation and manual renewal).
-- 2. Product B: Printed Devotional Book (₦5,000 per copy, full order/item/address/quotation/payment/fulfillment lifecycle).

-- 1. Extend digital_purchases with term duration, renewal flag, and access period bounds
ALTER TABLE digital_purchases ADD COLUMN duration_months INTEGER NOT NULL DEFAULT 12;
ALTER TABLE digital_purchases ADD COLUMN is_renewal INTEGER NOT NULL DEFAULT 0;
ALTER TABLE digital_purchases ADD COLUMN period_start_at TEXT;
ALTER TABLE digital_purchases ADD COLUMN period_end_at TEXT;

-- 2. Rebuild digital_entitlements to support date-bounded 12-month terms, renewals,
--    complimentary online-access grants (nullable purchase_id), and legacy entitlement preservation.
CREATE TABLE digital_entitlements_new (
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
  granted_by_admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  grant_reason TEXT NOT NULL DEFAULT '',
  granted_at TEXT NOT NULL,
  revoked_at TEXT,
  revoke_reason TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, edition_year)
);

-- Preserve existing digital_entitlements safely:
-- Mark pre-existing records as legacy_persistent = 1 and legacy_review_required = 1
-- so existing paying customers never silently lose promised rights, while computing
-- a 12-month reference window starting no earlier than 2027-01-01.
INSERT INTO digital_entitlements_new (
  id,
  user_id,
  purchase_id,
  edition_year,
  access_type,
  access_scope,
  status,
  starts_at,
  expires_at,
  duration_months,
  renewal_count,
  legacy_persistent,
  legacy_review_required,
  granted_by_admin_id,
  grant_reason,
  granted_at,
  revoked_at,
  revoke_reason,
  updated_at
)
SELECT
  id,
  user_id,
  purchase_id,
  edition_year,
  'paid',
  access_scope,
  status,
  CASE
    WHEN granted_at < '2027-01-01T00:00:00.000Z' THEN '2027-01-01T00:00:00.000Z'
    ELSE granted_at
  END,
  CASE
    WHEN granted_at < '2027-01-01T00:00:00.000Z' THEN '2028-01-01T00:00:00.000Z'
    ELSE strftime('%Y-%m-%dT%H:%M:%fZ', granted_at, '+12 months')
  END,
  12,
  0,
  1,
  1,
  NULL,
  'Legacy persistent entitlement preserved during 12-month model migration',
  granted_at,
  revoked_at,
  revoke_reason,
  updated_at
FROM digital_entitlements;

DROP TABLE digital_entitlements;
ALTER TABLE digital_entitlements_new RENAME TO digital_entitlements;

CREATE INDEX IF NOT EXISTS idx_digital_entitlements_user_id ON digital_entitlements(user_id);
CREATE INDEX IF NOT EXISTS idx_digital_entitlements_status ON digital_entitlements(status, expires_at);

-- 3. Create printed_orders and printed_order_items tables for Product B
CREATE TABLE IF NOT EXISTS printed_orders (
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
  verified_by_admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  paid_at TEXT,
  shipped_at TEXT,
  delivered_at TEXT,
  cancelled_at TEXT,
  refunded_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_printed_orders_user_id ON printed_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_printed_orders_payment_status ON printed_orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_printed_orders_fulfillment_status ON printed_orders(fulfillment_status);
CREATE INDEX IF NOT EXISTS idx_printed_orders_email ON printed_orders(email);

CREATE TABLE IF NOT EXISTS printed_order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES printed_orders(id) ON DELETE CASCADE,
  product_code TEXT NOT NULL DEFAULT 'printed_2027',
  product_title TEXT NOT NULL DEFAULT 'The Balanced Life Devotional — 2027 Printed Book',
  quantity INTEGER NOT NULL CHECK(quantity >= 1),
  unit_price_kobo INTEGER NOT NULL CHECK(unit_price_kobo > 0),
  line_total_kobo INTEGER NOT NULL CHECK(line_total_kobo > 0),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_printed_order_items_order_id ON printed_order_items(order_id);

-- 4. Extend bulk_orders to support contact history and linking to confirmed printed_orders
ALTER TABLE bulk_orders ADD COLUMN contact_history TEXT NOT NULL DEFAULT '';
ALTER TABLE bulk_orders ADD COLUMN linked_printed_order_id INTEGER REFERENCES printed_orders(id) ON DELETE SET NULL;

-- 5. Expand notification_events category CHECK constraint to include printed_order
CREATE TABLE notification_events_v6 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK(category IN ('daily_reminder', 'unread_reminder', 'subscription', 'digital_purchase', 'printed_order', 'account', 'system')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  action_url TEXT NOT NULL DEFAULT '/dashboard',
  dedupe_key TEXT NOT NULL UNIQUE,
  push_status TEXT NOT NULL DEFAULT 'pending' CHECK(push_status IN ('pending', 'processing', 'sent', 'skipped', 'failed')),
  delivery_attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  next_attempt_at TEXT,
  locked_until TEXT,
  last_error TEXT NOT NULL DEFAULT '',
  push_sent_at TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL
);

INSERT INTO notification_events_v6 (
  id, user_id, category, title, body, action_url, dedupe_key,
  push_status, delivery_attempts, max_attempts, next_attempt_at,
  locked_until, last_error, push_sent_at, read_at, created_at
)
SELECT
  id, user_id, category, title, body, action_url, dedupe_key,
  push_status, delivery_attempts, max_attempts, next_attempt_at,
  locked_until, last_error, push_sent_at, read_at, created_at
FROM notification_events;

DROP TABLE notification_events;
ALTER TABLE notification_events_v6 RENAME TO notification_events;

CREATE INDEX IF NOT EXISTS idx_notification_events_user_id ON notification_events(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_events_push_status ON notification_events(push_status, next_attempt_at);

-- 6. Default settings for 12-month digital access and printed book delivery quotation policy
INSERT INTO settings (key, value) VALUES
  ('digitalAccessDurationMonths', '12'),
  ('printedBookStockCount', '500'),
  ('deliveryPricingMode', 'quotation_required'),
  ('defaultDeliveryFeeKobo', ''),
  ('deliveryPolicyNote', 'Delivery charges depend on your delivery address and quantity. Submit your order details to receive a delivery quotation for your approval before payment.'),
  ('digitalEditionNote', 'One payment of ₦3,500 grants 12 calendar months of online reading access to the 2027 edition of The Balanced Life Devotional (starting January 1, 2027 for early purchases, or from payment verification thereafter). Manual 12-month renewal is supported with no automatic recurring charges.')
ON CONFLICT(key) DO UPDATE SET value = excluded.value;


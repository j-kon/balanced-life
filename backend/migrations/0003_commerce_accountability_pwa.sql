-- 0003_commerce_accountability_pwa.sql
-- Implements owner's website corrections, digital edition purchases & entitlements,
-- bulk orders, 5-step daily growth accountability fields, age/guardian consent metadata,
-- and mobile PWA notification preferences & push subscriptions.

-- 1. Add age group & guardian consent confirmation to users
ALTER TABLE users ADD COLUMN age_group TEXT NOT NULL DEFAULT '18_25';
ALTER TABLE users ADD COLUMN guardian_consent_confirmed INTEGER NOT NULL DEFAULT 1;

-- 2. Add 5-step accountability fields to journal_entries
ALTER TABLE journal_entries ADD COLUMN lesson_learned TEXT NOT NULL DEFAULT '';
ALTER TABLE journal_entries ADD COLUMN action_step TEXT NOT NULL DEFAULT '';
ALTER TABLE journal_entries ADD COLUMN prayer_focus TEXT NOT NULL DEFAULT '';

-- 3. Create digital_purchases table (distinct from recurring subscriptions)
CREATE TABLE IF NOT EXISTS digital_purchases (
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
  verified_by_admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  verified_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_digital_purchases_user_id ON digital_purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_digital_purchases_status ON digital_purchases(status);

-- 4. Create digital_entitlements table (persistent online reading entitlement per edition)
CREATE TABLE IF NOT EXISTS digital_entitlements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purchase_id INTEGER NOT NULL UNIQUE REFERENCES digital_purchases(id) ON DELETE CASCADE,
  edition_year INTEGER NOT NULL DEFAULT 2027,
  access_scope TEXT NOT NULL DEFAULT 'edition_2027' CHECK(access_scope IN ('edition_2027', 'includes_membership_updates')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'revoked', 'refunded')),
  granted_at TEXT NOT NULL,
  revoked_at TEXT,
  revoke_reason TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, edition_year)
);

CREATE INDEX IF NOT EXISTS idx_digital_entitlements_user_id ON digital_entitlements(user_id);

-- 5. Create bulk_orders table for Parents, Schools, Churches & Youth Organizations
CREATE TABLE IF NOT EXISTS bulk_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  contact_name TEXT NOT NULL,
  organization_name TEXT NOT NULL,
  organization_type TEXT NOT NULL CHECK(organization_type IN ('parent', 'school', 'church', 'youth_organization', 'other')),
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK(quantity >= 1),
  preferred_format TEXT NOT NULL DEFAULT 'printed' CHECK(preferred_format IN ('printed', 'digital', 'mixed')),
  delivery_location TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new', 'contacted', 'quoted', 'approved', 'converted', 'fulfilled', 'archived')),
  unit_price_kobo INTEGER NOT NULL DEFAULT 500000,
  discount_percent REAL,
  quoted_total_kobo INTEGER,
  agreed_total_kobo INTEGER,
  quotation_summary TEXT NOT NULL DEFAULT '',
  fulfillment_status TEXT NOT NULL DEFAULT 'pending' CHECK(fulfillment_status IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled')),
  tracking_note TEXT NOT NULL DEFAULT '',
  admin_notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bulk_orders_status ON bulk_orders(status);

-- 6. Create notification_preferences, push_subscriptions, and notification_events for Mobile PWA
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  daily_reminder_enabled INTEGER NOT NULL DEFAULT 0,
  reminder_time TEXT NOT NULL DEFAULT '06:30',
  timezone TEXT NOT NULL DEFAULT 'Africa/Lagos',
  subscription_alerts_enabled INTEGER NOT NULL DEFAULT 1,
  purchase_alerts_enabled INTEGER NOT NULL DEFAULT 1,
  last_daily_reminder_date TEXT,
  last_expiry_reminder_for TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh_key TEXT NOT NULL,
  auth_key TEXT NOT NULL,
  user_agent TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);

CREATE TABLE IF NOT EXISTS notification_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK(category IN ('daily_reminder', 'subscription', 'digital_purchase', 'system')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  action_url TEXT NOT NULL DEFAULT '/dashboard',
  dedupe_key TEXT NOT NULL UNIQUE,
  read_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notification_events_user_id ON notification_events(user_id);

-- 7. Apply owner's corrected organization, contact, and pricing settings
INSERT OR REPLACE INTO settings (key, value) VALUES
  ('organizationName', 'Cossy Teens Consult Enterprises'),
  ('brandStatement', 'Building Minds. Shaping Character. Creating Balanced Lives.'),
  ('siteHeadline', 'Growing up is a journey. Make every day count.'),
  ('siteSubheadline', '365 Days of Connecting with Jesus with holistic development.'),
  ('targetAudience', 'Teenagers & Young Adults | Ages 13–25'),
  ('contactEmail', 'cossyteensconsult@gmail.com'),
  ('contactPhone', '+2349055002143'),
  ('contactSecondaryPhone', '+2349113708399'),
  ('contactWebsite', 'cossyteens.com'),
  ('hardcoverPriceKobo', '500000'),
  ('digitalEditionPriceKobo', '350000');


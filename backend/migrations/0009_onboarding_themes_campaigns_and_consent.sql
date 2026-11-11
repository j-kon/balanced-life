-- 0009_onboarding_themes_campaigns_and_consent.sql
-- Adds first-time reader onboarding persistence, optional announcement consent,
-- owner-granted administrator custom permissions, and durable admin notification campaigns.

-- 1. First-time reader onboarding completion timestamp (null for newly registered users)
ALTER TABLE users ADD COLUMN onboarding_completed_at TEXT;
UPDATE users
SET onboarding_completed_at = COALESCE(updated_at, created_at)
WHERE onboarding_completed_at IS NULL;

-- 2. Opt-in announcement consent preference (disabled by default until explicit reader opt-in)
ALTER TABLE notification_preferences ADD COLUMN announcements_enabled INTEGER NOT NULL DEFAULT 0;

-- 3. Optional owner-granted staff permissions JSON array
ALTER TABLE admin_users ADD COLUMN custom_permissions_json TEXT NOT NULL DEFAULT '[]';

-- 4. Durable administrator notification campaigns
CREATE TABLE IF NOT EXISTS admin_notification_campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_by_admin_id INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
  actor_name TEXT NOT NULL DEFAULT '',
  actor_email TEXT NOT NULL DEFAULT '',
  target_type TEXT NOT NULL CHECK(target_type IN ('individual', 'all', 'segment')),
  target_segment TEXT NOT NULL DEFAULT '',
  target_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  category TEXT NOT NULL DEFAULT 'announcement' CHECK(category IN ('announcement', 'account', 'system', 'subscription')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  action_url TEXT NOT NULL DEFAULT '/dashboard',
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('scheduled', 'queued', 'enqueueing', 'completed', 'cancelled')),
  scheduled_for TEXT,
  eligible_count INTEGER NOT NULL DEFAULT 0,
  skipped_opt_out_count INTEGER NOT NULL DEFAULT 0,
  queued_count INTEGER NOT NULL DEFAULT 0,
  in_app_created_count INTEGER NOT NULL DEFAULT 0,
  confirmed_by_admin INTEGER NOT NULL DEFAULT 0,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_notification_campaigns_status_sched
  ON admin_notification_campaigns(status, scheduled_for);

-- 5. Rebuild notification_events to allow 'announcement' category and track campaign/admin provenance safely
CREATE TABLE notification_events_v9 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK(category IN ('daily_reminder', 'unread_reminder', 'subscription', 'digital_purchase', 'printed_order', 'announcement', 'account', 'system')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  action_url TEXT NOT NULL DEFAULT '/dashboard',
  dedupe_key TEXT NOT NULL UNIQUE,
  campaign_id INTEGER REFERENCES admin_notification_campaigns(id) ON DELETE SET NULL,
  created_by_admin_id INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
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

INSERT INTO notification_events_v9 (
  id, user_id, category, title, body, action_url, dedupe_key,
  campaign_id, created_by_admin_id,
  push_status, delivery_attempts, max_attempts, next_attempt_at,
  locked_until, last_error, push_sent_at, read_at, created_at
)
SELECT
  id, user_id, category, title, body, action_url, dedupe_key,
  NULL, NULL,
  push_status, delivery_attempts, max_attempts, next_attempt_at,
  locked_until, last_error, push_sent_at, read_at, created_at
FROM notification_events;

DROP TABLE notification_events;
ALTER TABLE notification_events_v9 RENAME TO notification_events;

CREATE INDEX IF NOT EXISTS idx_notification_events_user_id ON notification_events(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_events_push_status ON notification_events(push_status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_notification_events_campaign_id ON notification_events(campaign_id);

-- 6. Per-recipient batch enqueue queue table for durable paginated broadcast processing
CREATE TABLE IF NOT EXISTS admin_notification_campaign_recipients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL REFERENCES admin_notification_campaigns(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_event_id INTEGER REFERENCES notification_events(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'enqueued', 'skipped', 'failed')),
  skip_reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(campaign_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign_status
  ON admin_notification_campaign_recipients(campaign_id, status, id);


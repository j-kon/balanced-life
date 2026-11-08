-- 0004_web_push_and_scheduler.sql
-- Adds Web Push VAPID delivery tracking, multi-device management,
-- quiet hours, unread devotional reminder preferences, and concurrency-safe
-- background worker scheduling columns.

-- 1. Extend notification_preferences with master toggle, unread reminder, and quiet hours
ALTER TABLE notification_preferences ADD COLUMN notifications_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE notification_preferences ADD COLUMN unread_reminder_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE notification_preferences ADD COLUMN quiet_hours_start TEXT NOT NULL DEFAULT '22:00';
ALTER TABLE notification_preferences ADD COLUMN quiet_hours_end TEXT NOT NULL DEFAULT '05:00';
ALTER TABLE notification_preferences ADD COLUMN last_unread_reminder_date TEXT;

-- 2. Extend push_subscriptions for multi-device management and endpoint health tracking
ALTER TABLE push_subscriptions ADD COLUMN device_label TEXT NOT NULL DEFAULT 'Browser Device';
ALTER TABLE push_subscriptions ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'expired', 'disabled'));
ALTER TABLE push_subscriptions ADD COLUMN failure_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE push_subscriptions ADD COLUMN last_error TEXT NOT NULL DEFAULT '';
ALTER TABLE push_subscriptions ADD COLUMN last_success_at TEXT;

-- 3. Rebuild notification_events to expand category CHECK constraint and add durable worker lock, retry limits, and delivery status
CREATE TABLE notification_events_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK(category IN ('daily_reminder', 'unread_reminder', 'subscription', 'digital_purchase', 'account', 'system')),
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

INSERT INTO notification_events_new (
  id, user_id, category, title, body, action_url, dedupe_key, read_at, created_at
)
SELECT
  id, user_id, category, title, body, action_url, dedupe_key, read_at, created_at
FROM notification_events;

DROP TABLE notification_events;
ALTER TABLE notification_events_new RENAME TO notification_events;

CREATE INDEX IF NOT EXISTS idx_notification_events_user_id ON notification_events(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_events_push_status ON notification_events(push_status, next_attempt_at);

-- 4. Per-device delivery log for idempotent multi-device retries
CREATE TABLE IF NOT EXISTS notification_deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  notification_event_id INTEGER NOT NULL REFERENCES notification_events(id) ON DELETE CASCADE,
  push_subscription_id INTEGER NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK(status IN ('sent', 'failed', 'expired')),
  status_code INTEGER,
  error_message TEXT NOT NULL DEFAULT '',
  delivered_at TEXT NOT NULL,
  UNIQUE(notification_event_id, push_subscription_id)
);

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_event_id ON notification_deliveries(notification_event_id);


-- 0011_email_system_and_reset_codes.sql
-- Non-destructive migration adding:
-- 1. 6-digit password reset verification codes for readers & administrators (preserving historical reset-token tables)
-- 2. Non-enumerating password-reset request rate tracking
-- 3. Granular email opt-in preferences & bounce/complaint suppression fields
-- 4. Durable transactional + campaign email queue, delivery logs, and admin email campaigns

-- 1. Six-digit password reset codes
CREATE TABLE IF NOT EXISTS password_reset_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_type TEXT NOT NULL CHECK(actor_type IN ('reader', 'admin')),
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  admin_id INTEGER REFERENCES admin_users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  code_hmac TEXT NOT NULL,
  challenge_salt TEXT NOT NULL,
  proof_token_hash TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'verified', 'used', 'invalidated', 'expired', 'locked')),
  request_ip TEXT NOT NULL DEFAULT '',
  expires_at TEXT NOT NULL,
  verified_at TEXT,
  used_at TEXT,
  invalidated_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_password_reset_codes_lookup
  ON password_reset_codes(actor_type, email, status, created_at);

CREATE INDEX IF NOT EXISTS idx_password_reset_codes_proof
  ON password_reset_codes(proof_token_hash);

-- 2. Non-enumerating reset request rate/cooldown log (covers both registered and unknown emails)
CREATE TABLE IF NOT EXISTS password_reset_rate_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_type TEXT NOT NULL CHECK(actor_type IN ('reader', 'admin')),
  email_hmac TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reset_rate_email
  ON password_reset_rate_events(actor_type, email_hmac, created_at);

CREATE INDEX IF NOT EXISTS idx_reset_rate_ip
  ON password_reset_rate_events(actor_type, ip_hash, created_at);

-- 3. Email preferences & suppression fields on notification_preferences (optional emails default OFF)
ALTER TABLE notification_preferences ADD COLUMN email_daily_reminder_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE notification_preferences ADD COLUMN email_announcements_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE notification_preferences ADD COLUMN email_community_updates_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE notification_preferences ADD COLUMN email_suppressed_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE notification_preferences ADD COLUMN email_suppressed_at TEXT;
ALTER TABLE notification_preferences ADD COLUMN last_email_daily_reminder_date TEXT;
ALTER TABLE notification_preferences ADD COLUMN last_email_expiry_reminder_for TEXT;

-- 4. Durable admin email campaigns
CREATE TABLE IF NOT EXISTS email_campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_by_admin_id INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
  actor_name TEXT NOT NULL DEFAULT '',
  actor_email TEXT NOT NULL DEFAULT '',
  target_type TEXT NOT NULL CHECK(target_type IN ('individual', 'all', 'segment')),
  target_segment TEXT NOT NULL DEFAULT '',
  target_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  email_type TEXT NOT NULL DEFAULT 'announcement' CHECK(email_type IN ('announcement', 'community_update', 'account', 'system')),
  subject TEXT NOT NULL,
  body_text TEXT NOT NULL,
  action_label TEXT NOT NULL DEFAULT 'Open Devotional Portal',
  action_url TEXT NOT NULL DEFAULT '/dashboard',
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('scheduled', 'queued', 'enqueueing', 'sending', 'completed', 'cancelled')),
  scheduled_for TEXT,
  eligible_count INTEGER NOT NULL DEFAULT 0,
  skipped_opt_out_count INTEGER NOT NULL DEFAULT 0,
  queued_count INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  confirmed_by_admin INTEGER NOT NULL DEFAULT 0,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_email_campaigns_status_sched
  ON email_campaigns(status, scheduled_for);

-- 5. Durable email delivery queue / outbox
CREATE TABLE IF NOT EXISTS email_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  admin_id INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
  campaign_id INTEGER REFERENCES email_campaigns(id) ON DELETE SET NULL,
  created_by_admin_id INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT NOT NULL DEFAULT '',
  template_key TEXT NOT NULL,
  channel_kind TEXT NOT NULL CHECK(channel_kind IN ('transactional', 'optional', 'optional_daily', 'optional_announcements', 'optional_community', 'optional_expiry', 'optional_marketing', 'optional_reminder')),
  subject TEXT NOT NULL,
  html_body TEXT NOT NULL,
  text_body TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'retrying', 'sent', 'failed', 'skipped', 'suppressed', 'bounced', 'complained', 'cancelled')),
  provider_name TEXT NOT NULL DEFAULT '',
  provider_message_id TEXT NOT NULL DEFAULT '',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  next_attempt_at TEXT,
  locked_until TEXT,
  last_error TEXT NOT NULL DEFAULT '',
  sent_at TEXT,
  bounced_at TEXT,
  complained_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_email_queue_status_next
  ON email_queue(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_email_queue_campaign
  ON email_queue(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_queue_recipient
  ON email_queue(recipient_email, created_at);

-- 6. Paginated email campaign recipient tracker
CREATE TABLE IF NOT EXISTS admin_email_campaign_recipients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL REFERENCES email_campaigns(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email_queue_id INTEGER REFERENCES email_queue(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'enqueued', 'queued', 'sent', 'skipped', 'failed', 'suppressed')),
  skip_reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(campaign_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_email_campaign_recipients_status
  ON admin_email_campaign_recipients(campaign_id, status, id);

-- 7. Detailed email delivery / webhook audit log
CREATE TABLE IF NOT EXISTS email_delivery_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email_queue_id INTEGER NOT NULL REFERENCES email_queue(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  provider_name TEXT NOT NULL DEFAULT '',
  provider_event_id TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_email_delivery_events_queue
  ON email_delivery_events(email_queue_id, id);

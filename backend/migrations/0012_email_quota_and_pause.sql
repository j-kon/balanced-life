-- Non-destructive update to email_campaigns to support quota-based 'paused' status and pause_reason diagnostics.
CREATE TABLE IF NOT EXISTS email_campaigns_v2 (
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
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('scheduled', 'queued', 'enqueueing', 'sending', 'paused', 'completed', 'cancelled')),
  pause_reason TEXT NOT NULL DEFAULT '',
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

INSERT INTO email_campaigns_v2 (
  id, created_by_admin_id, actor_name, actor_email, target_type, target_segment,
  target_user_id, email_type, subject, body_text, action_label, action_url,
  idempotency_key, status, pause_reason, scheduled_for, eligible_count,
  skipped_opt_out_count, queued_count, sent_count, failed_count,
  confirmed_by_admin, started_at, completed_at, created_at, updated_at
)
SELECT
  id, created_by_admin_id, actor_name, actor_email, target_type, target_segment,
  target_user_id, email_type, subject, body_text, action_label, action_url,
  idempotency_key, status, '', scheduled_for, eligible_count,
  skipped_opt_out_count, queued_count, sent_count, failed_count,
  confirmed_by_admin, started_at, completed_at, created_at, updated_at
FROM email_campaigns;

DROP TABLE email_campaigns;
ALTER TABLE email_campaigns_v2 RENAME TO email_campaigns;

CREATE INDEX IF NOT EXISTS idx_email_campaigns_status_sched
  ON email_campaigns(status, scheduled_for);


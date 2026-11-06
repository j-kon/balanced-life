# Database

Default: backend/data/devotional.sqlite. SQLite uses foreign keys, WAL and a busy timeout. Drizzle ORM provides typed mappings in backend/src/schema.ts. Ordered SQL files in backend/migrations are applied exactly once via schema_migrations inside transactions. Initial schema is 0001_initial.sql. Back up the database before future migrations; schema changes need a new migration rather than editing an already applied file.

| Entity | Purpose and constraints |
| --- | --- |
| users | Name, unique normalized email, salted password hash, reader/admin role, creation time |
| sessions | Hashed opaque token, user relation, expiry; never stores raw session tokens |
| devotionals | Unique 2027 date, title, theme, six reading fields, sample/publication flags, source pages, timestamps |
| monthly_themes | Month 1–12 and manuscript theme title |
| subscription_plans | Name, unique calendar-month duration, integer amount_kobo, availability |
| subscriptions | One current membership per user, plan relation, start/expiry, renewal preference, cancellation and demo flags |
| payments | Unique reference, user/subscription/plan relations, immutable plan name/amount snapshot, demo provider, success time |
| reading_progress | Composite user/devotional primary key; completion time |
| bookmarks | Composite user/devotional primary key; creation time |
| journal_entries | Owner, optional devotional link, private body and creation time |
| hardcover_inquiries | Name, email, optional message, new/reviewed status |
| admin_audit_logs | Acting administrator, action summary and timestamp; no journal content |
| settings | Configurable demo reference date |
| schema_migrations | Migration filename and application timestamp |

All money is integer kobo. Dates use ISO UTC timestamps; devotional dates use YYYY-MM-DD. Membership periods use UTC calendar months with month-end clamping.

Registration always assigns reader regardless of unexpected role input. API schemas constrain dates, lengths, IDs, amounts, enums and booleans; publication requires all six sections. Journal reads/deletes include owner IDs in the query. Subscription expiry is checked on every protected reading access.

The seed script preserves existing user passwords, edits and subscription state. It inserts proposed plans only if missing, imports manuscript entries as drafts without overwriting duplicates, and publishes the hash-verified first week when unedited. It does not reset author decisions or extend memberships indefinitely.

## PostgreSQL path

The logical relationships can carry forward, but migration is real work: replace SQLite drivers and DDL, use PostgreSQL identity/boolean/timestamp types, move migrations, migrate data with constraints, replace SQLite transaction and conflict details, and retest locking, idempotency and date handling. SQLite and PostgreSQL are not interchangeable by changing a connection string.

## Backup

Stop the local app and copy the SQLite database plus any WAL/SHM files together, or use SQLite's backup API. The manuscript and extracted content need separate private backups. Never copy the demo database into production.

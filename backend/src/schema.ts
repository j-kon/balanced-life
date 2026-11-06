import {
  sqliteTable,
  integer,
  text,
  primaryKey,
} from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("reader"),
  status: text("status").notNull().default("active"),
  suspendedReason: text("suspended_reason").notNull().default(""),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const sessions = sqliteTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: text("expires_at").notNull(),
});

export const passwordResetTokens = sqliteTable("password_reset_tokens", {
  tokenHash: text("token_hash").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: text("expires_at").notNull(),
  usedAt: text("used_at"),
  createdAt: text("created_at").notNull(),
});

export const devotionals = sqliteTable("devotionals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull().unique(),
  title: text("title").notNull(),
  theme: text("theme").notNull().default(""),
  bibleText: text("bible_text").notNull().default(""),
  memoryVerse: text("memory_verse").notNull().default(""),
  reflection: text("reflection").notNull().default(""),
  thinkAbout: text("think_about").notNull().default(""),
  prayer: text("prayer").notNull().default(""),
  challenge: text("challenge").notNull().default(""),
  sample: integer("sample", { mode: "boolean" }).notNull().default(false),
  published: integer("published", { mode: "boolean" }).notNull().default(false),
  reviewStatus: text("review_status").notNull().default("pending_review"),
  reviewerNotes: text("reviewer_notes").notNull().default(""),
  reviewedAt: text("reviewed_at"),
  sourcePages: text("source_pages"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const monthlyThemes = sqliteTable("monthly_themes", {
  month: integer("month").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
});

export const plans = sqliteTable("subscription_plans", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  months: integer("months").notNull().unique(),
  amountKobo: integer("amount_kobo").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const subscriptions = sqliteTable("subscriptions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  planId: integer("plan_id")
    .notNull()
    .references(() => plans.id),
  accessType: text("access_type").notNull().default("paid"),
  status: text("status").notNull().default("active"),
  startedAt: text("started_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  renewalMode: text("renewal_mode").notNull().default("manual"),
  cancelAtPeriodEnd: integer("cancel_at_period_end", { mode: "boolean" })
    .notNull()
    .default(false),
  providerSubscriptionCode: text("provider_subscription_code"),
  grantedByAdminId: integer("granted_by_admin_id").references(() => users.id, {
    onDelete: "set null",
  }),
  grantReason: text("grant_reason").notNull().default(""),
  updatedAt: text("updated_at").notNull(),
});

export const payments = sqliteTable("payments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  subscriptionId: integer("subscription_id").references(
    () => subscriptions.id,
    { onDelete: "set null" },
  ),
  planId: integer("plan_id")
    .notNull()
    .references(() => plans.id),
  planName: text("plan_name").notNull(),
  amountKobo: integer("amount_kobo").notNull(),
  currency: text("currency").notNull().default("NGN"),
  reference: text("reference").notNull().unique(),
  provider: text("provider").notNull(),
  status: text("status").notNull(),
  renewalMode: text("renewal_mode").notNull().default("manual"),
  authorizationUrl: text("authorization_url"),
  providerTransactionId: text("provider_transaction_id"),
  verifiedAt: text("verified_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const progress = sqliteTable(
  "reading_progress",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    devotionalId: integer("devotional_id")
      .notNull()
      .references(() => devotionals.id, { onDelete: "cascade" }),
    completedAt: text("completed_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.devotionalId] })],
);

export const bookmarks = sqliteTable(
  "bookmarks",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    devotionalId: integer("devotional_id")
      .notNull()
      .references(() => devotionals.id, { onDelete: "cascade" }),
    createdAt: text("created_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.devotionalId] })],
);

export const journals = sqliteTable("journal_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  devotionalId: integer("devotional_id").references(() => devotionals.id, {
    onDelete: "set null",
  }),
  title: text("title").notNull().default(""),
  body: text("body").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const inquiries = sqliteTable("hardcover_inquiries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull().default(""),
  quantity: integer("quantity").notNull().default(1),
  deliveryLocation: text("delivery_location").notNull().default(""),
  message: text("message").notNull().default(""),
  inquiryType: text("inquiry_type").notNull().default("hardcover"),
  status: text("status").notNull().default("new"),
  adminNotes: text("admin_notes").notNull().default(""),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const auditLogs = sqliteTable("admin_audit_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  adminId: integer("admin_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  action: text("action").notNull(),
  createdAt: text("created_at").notNull(),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

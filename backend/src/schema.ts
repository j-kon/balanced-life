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
  createdAt: text("created_at").notNull(),
});
export const sessions = sqliteTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  expiresAt: text("expires_at").notNull(),
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
  sourcePages: text("source_pages"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
export const monthlyThemes = sqliteTable("monthly_themes", {
  month: integer("month").primaryKey(),
  title: text("title").notNull(),
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
    .references(() => users.id),
  planId: integer("plan_id")
    .notNull()
    .references(() => plans.id),
  startedAt: text("started_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  renewalMode: text("renewal_mode").notNull(),
  cancelAtPeriodEnd: integer("cancel_at_period_end", { mode: "boolean" })
    .notNull()
    .default(false),
  isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(true),
});
export const payments = sqliteTable("payments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  subscriptionId: integer("subscription_id")
    .notNull()
    .references(() => subscriptions.id),
  planId: integer("plan_id")
    .notNull()
    .references(() => plans.id),
  planName: text("plan_name").notNull(),
  amountKobo: integer("amount_kobo").notNull(),
  reference: text("reference").notNull().unique(),
  provider: text("provider").notNull(),
  status: text("status").notNull(),
  createdAt: text("created_at").notNull(),
});
export const progress = sqliteTable(
  "reading_progress",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    devotionalId: integer("devotional_id")
      .notNull()
      .references(() => devotionals.id),
    completedAt: text("completed_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.devotionalId] })],
);
export const bookmarks = sqliteTable(
  "bookmarks",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    devotionalId: integer("devotional_id")
      .notNull()
      .references(() => devotionals.id),
    createdAt: text("created_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.devotionalId] })],
);
export const journals = sqliteTable("journal_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  devotionalId: integer("devotional_id").references(() => devotionals.id),
  body: text("body").notNull(),
  createdAt: text("created_at").notNull(),
});
export const inquiries = sqliteTable("hardcover_inquiries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  email: text("email").notNull(),
  message: text("message").notNull().default(""),
  status: text("status").notNull().default("new"),
  createdAt: text("created_at").notNull(),
});
export const auditLogs = sqliteTable("admin_audit_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  adminId: integer("admin_id")
    .notNull()
    .references(() => users.id),
  action: text("action").notNull(),
  createdAt: text("created_at").notNull(),
});
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

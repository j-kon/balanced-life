import {
  sqliteTable,
  integer,
  text,
  real,
  primaryKey,
} from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("reader"),
  legacyAdminStatus: text("legacy_admin_status").notNull().default("none"),
  status: text("status").notNull().default("active"),
  suspendedReason: text("suspended_reason").notNull().default(""),
  ageGroup: text("age_group").notNull().default("18_25"),
  guardianConsentConfirmed: integer("guardian_consent_confirmed", {
    mode: "boolean",
  })
    .notNull()
    .default(true),
  onboardingCompletedAt: text("onboarding_completed_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const adminUsers = sqliteTable("admin_users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("owner"),
  customPermissionsJson: text("custom_permissions_json")
    .notNull()
    .default("[]"),
  status: text("status").notNull().default("active"),
  suspendedReason: text("suspended_reason").notNull().default(""),
  mfaEnabled: integer("mfa_enabled", { mode: "boolean" })
    .notNull()
    .default(false),
  mfaSecretEnc: text("mfa_secret_enc"),
  mfaPendingSecretEnc: text("mfa_pending_secret_enc"),
  mfaVerifiedAt: text("mfa_verified_at"),
  failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
  lockedUntil: text("locked_until"),
  lastLoginAt: text("last_login_at"),
  lastActiveAt: text("last_active_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const adminSessions = sqliteTable("admin_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  adminId: integer("admin_id")
    .notNull()
    .references(() => adminUsers.id, { onDelete: "cascade" }),
  mfaVerified: integer("mfa_verified", { mode: "boolean" })
    .notNull()
    .default(false),
  ipAddress: text("ip_address").notNull().default(""),
  userAgent: text("user_agent").notNull().default(""),
  lastActivityAt: text("last_activity_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
});

export const adminMfaRecoveryCodes = sqliteTable("admin_mfa_recovery_codes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  adminId: integer("admin_id")
    .notNull()
    .references(() => adminUsers.id, { onDelete: "cascade" }),
  codeHash: text("code_hash").notNull(),
  usedAt: text("used_at"),
  createdAt: text("created_at").notNull(),
});

export const adminPasswordResetTokens = sqliteTable(
  "admin_password_reset_tokens",
  {
    tokenHash: text("token_hash").primaryKey(),
    adminId: integer("admin_id")
      .notNull()
      .references(() => adminUsers.id, { onDelete: "cascade" }),
    expiresAt: text("expires_at").notNull(),
    usedAt: text("used_at"),
    createdAt: text("created_at").notNull(),
  },
);

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
  grantedByAdminId: integer("granted_by_admin_id").references(
    () => adminUsers.id,
    {
      onDelete: "set null",
    },
  ),
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

export const digitalPurchases = sqliteTable("digital_purchases", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  productCode: text("product_code").notNull().default("digital_2027"),
  productName: text("product_name")
    .notNull()
    .default("The Balanced Life Devotional — 2027 Digital Edition"),
  amountKobo: integer("amount_kobo").notNull(),
  currency: text("currency").notNull().default("NGN"),
  paymentMethod: text("payment_method").notNull(),
  reference: text("reference").notNull().unique(),
  authorizationUrl: text("authorization_url"),
  providerTransactionId: text("provider_transaction_id"),
  transferReference: text("transfer_reference").notNull().default(""),
  payerNote: text("payer_note").notNull().default(""),
  status: text("status").notNull(),
  durationMonths: integer("duration_months").notNull().default(12),
  isRenewal: integer("is_renewal", { mode: "boolean" })
    .notNull()
    .default(false),
  periodStartAt: text("period_start_at"),
  periodEndAt: text("period_end_at"),
  adminNotes: text("admin_notes").notNull().default(""),
  verifiedByAdminId: integer("verified_by_admin_id").references(
    () => adminUsers.id,
    { onDelete: "set null" },
  ),
  verifiedAt: text("verified_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const digitalEntitlements = sqliteTable("digital_entitlements", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  purchaseId: integer("purchase_id").references(() => digitalPurchases.id, {
    onDelete: "set null",
  }),
  editionYear: integer("edition_year").notNull().default(2027),
  accessType: text("access_type").notNull().default("paid"),
  accessScope: text("access_scope").notNull().default("edition_2027"),
  status: text("status").notNull().default("active"),
  startsAt: text("starts_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  durationMonths: integer("duration_months").notNull().default(12),
  renewalCount: integer("renewal_count").notNull().default(0),
  legacyPersistent: integer("legacy_persistent", { mode: "boolean" })
    .notNull()
    .default(false),
  legacyReviewRequired: integer("legacy_review_required", { mode: "boolean" })
    .notNull()
    .default(false),
  grantedByAdminId: integer("granted_by_admin_id").references(
    () => adminUsers.id,
    {
      onDelete: "set null",
    },
  ),
  grantReason: text("grant_reason").notNull().default(""),
  grantedAt: text("granted_at").notNull(),
  revokedAt: text("revoked_at"),
  revokeReason: text("revoke_reason").notNull().default(""),
  updatedAt: text("updated_at").notNull(),
});

export const printedOrders = sqliteTable("printed_orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderNumber: text("order_number").notNull().unique(),
  userId: integer("user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  bulkOrderId: integer("bulk_order_id"),
  fullName: text("full_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  streetAddress: text("street_address").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  country: text("country").notNull().default("Nigeria"),
  deliveryLandmark: text("delivery_landmark").notNull().default(""),
  quantity: integer("quantity").notNull().default(1),
  unitPriceKobo: integer("unit_price_kobo").notNull().default(500000),
  subtotalKobo: integer("subtotal_kobo").notNull(),
  deliveryFeeKobo: integer("delivery_fee_kobo"),
  deliveryQuoteStatus: text("delivery_quote_status")
    .notNull()
    .default("pending_quote"),
  deliveryQuoteNote: text("delivery_quote_note").notNull().default(""),
  finalTotalKobo: integer("final_total_kobo"),
  customerApprovedQuoteAt: text("customer_approved_quote_at"),
  currency: text("currency").notNull().default("NGN"),
  paymentMethod: text("payment_method").notNull().default("unselected"),
  paymentReference: text("payment_reference"),
  authorizationUrl: text("authorization_url"),
  providerTransactionId: text("provider_transaction_id"),
  transferReference: text("transfer_reference").notNull().default(""),
  payerNote: text("payer_note").notNull().default(""),
  paymentStatus: text("payment_status").notNull().default("pending"),
  fulfillmentStatus: text("fulfillment_status")
    .notNull()
    .default("awaiting_delivery_quotation"),
  dispatchExceptionNote: text("dispatch_exception_note").notNull().default(""),
  courierName: text("courier_name").notNull().default(""),
  trackingReference: text("tracking_reference").notNull().default(""),
  customerDeliveryNotes: text("customer_delivery_notes").notNull().default(""),
  adminNotes: text("admin_notes").notNull().default(""),
  verifiedByAdminId: integer("verified_by_admin_id").references(
    () => adminUsers.id,
    { onDelete: "set null" },
  ),
  paidAt: text("paid_at"),
  shippedAt: text("shipped_at"),
  deliveredAt: text("delivered_at"),
  cancelledAt: text("cancelled_at"),
  refundedAt: text("refunded_at"),
  stockDeducted: integer("stock_deducted", { mode: "boolean" })
    .notNull()
    .default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const printedOrderAccessTokens = sqliteTable(
  "printed_order_access_tokens",
  {
    tokenHash: text("token_hash").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => printedOrders.id, { onDelete: "cascade" }),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
);

export const printedOrderItems = sqliteTable("printed_order_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderId: integer("order_id")
    .notNull()
    .references(() => printedOrders.id, { onDelete: "cascade" }),
  productCode: text("product_code").notNull().default("printed_2027"),
  productTitle: text("product_title")
    .notNull()
    .default("The Balanced Life Devotional — 2027 Printed Book"),
  quantity: integer("quantity").notNull().default(1),
  unitPriceKobo: integer("unit_price_kobo").notNull(),
  lineTotalKobo: integer("line_total_kobo").notNull(),
  createdAt: text("created_at").notNull(),
});

export const bulkOrders = sqliteTable("bulk_orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  contactName: text("contact_name").notNull(),
  organizationName: text("organization_name").notNull(),
  organizationType: text("organization_type").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  quantity: integer("quantity").notNull(),
  preferredFormat: text("preferred_format").notNull().default("printed"),
  deliveryLocation: text("delivery_location").notNull(),
  notes: text("notes").notNull().default(""),
  status: text("status").notNull().default("new"),
  unitPriceKobo: integer("unit_price_kobo").notNull().default(500000),
  discountPercent: real("discount_percent"),
  quotedTotalKobo: integer("quoted_total_kobo"),
  agreedTotalKobo: integer("agreed_total_kobo"),
  quotationSummary: text("quotation_summary").notNull().default(""),
  fulfillmentStatus: text("fulfillment_status").notNull().default("pending"),
  trackingNote: text("tracking_note").notNull().default(""),
  contactHistory: text("contact_history").notNull().default(""),
  linkedPrintedOrderId: integer("linked_printed_order_id"),
  adminNotes: text("admin_notes").notNull().default(""),
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
  lessonLearned: text("lesson_learned").notNull().default(""),
  body: text("body").notNull(),
  actionStep: text("action_step").notNull().default(""),
  prayerFocus: text("prayer_focus").notNull().default(""),
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

export const notificationPreferences = sqliteTable("notification_preferences", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  notificationsEnabled: integer("notifications_enabled", { mode: "boolean" })
    .notNull()
    .default(true),
  dailyReminderEnabled: integer("daily_reminder_enabled", { mode: "boolean" })
    .notNull()
    .default(false),
  unreadReminderEnabled: integer("unread_reminder_enabled", { mode: "boolean" })
    .notNull()
    .default(false),
  reminderTime: text("reminder_time").notNull().default("06:30"),
  timezone: text("timezone").notNull().default("Africa/Lagos"),
  quietHoursStart: text("quiet_hours_start").notNull().default("22:00"),
  quietHoursEnd: text("quiet_hours_end").notNull().default("05:00"),
  subscriptionAlertsEnabled: integer("subscription_alerts_enabled", {
    mode: "boolean",
  })
    .notNull()
    .default(true),
  purchaseAlertsEnabled: integer("purchase_alerts_enabled", { mode: "boolean" })
    .notNull()
    .default(true),
  announcementsEnabled: integer("announcements_enabled", { mode: "boolean" })
    .notNull()
    .default(false),
  emailDailyReminderEnabled: integer("email_daily_reminder_enabled", {
    mode: "boolean",
  })
    .notNull()
    .default(false),
  emailAnnouncementsEnabled: integer("email_announcements_enabled", {
    mode: "boolean",
  })
    .notNull()
    .default(false),
  emailCommunityUpdatesEnabled: integer("email_community_updates_enabled", {
    mode: "boolean",
  })
    .notNull()
    .default(false),
  emailSuppressedReason: text("email_suppressed_reason").notNull().default(""),
  emailSuppressedAt: text("email_suppressed_at"),
  lastDailyReminderDate: text("last_daily_reminder_date"),
  lastUnreadReminderDate: text("last_unread_reminder_date"),
  lastExpiryReminderFor: text("last_expiry_reminder_for"),
  lastEmailDailyReminderDate: text("last_email_daily_reminder_date"),
  lastEmailExpiryReminderFor: text("last_email_expiry_reminder_for"),
  updatedAt: text("updated_at").notNull(),
});

export const pushSubscriptions = sqliteTable("push_subscriptions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  p256dhKey: text("p256dh_key").notNull(),
  authKey: text("auth_key").notNull(),
  userAgent: text("user_agent").notNull().default(""),
  deviceLabel: text("device_label").notNull().default("Browser Device"),
  status: text("status").notNull().default("active"),
  failureCount: integer("failure_count").notNull().default(0),
  lastError: text("last_error").notNull().default(""),
  lastSuccessAt: text("last_success_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const adminNotificationCampaigns = sqliteTable(
  "admin_notification_campaigns",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    createdByAdminId: integer("created_by_admin_id").references(
      () => adminUsers.id,
      { onDelete: "set null" },
    ),
    actorName: text("actor_name").notNull().default(""),
    actorEmail: text("actor_email").notNull().default(""),
    targetType: text("target_type").notNull(),
    targetSegment: text("target_segment").notNull().default(""),
    targetUserId: integer("target_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    category: text("category").notNull().default("announcement"),
    title: text("title").notNull(),
    body: text("body").notNull(),
    actionUrl: text("action_url").notNull().default("/dashboard"),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    status: text("status").notNull().default("queued"),
    scheduledFor: text("scheduled_for"),
    eligibleCount: integer("eligible_count").notNull().default(0),
    skippedOptOutCount: integer("skipped_opt_out_count").notNull().default(0),
    queuedCount: integer("queued_count").notNull().default(0),
    inAppCreatedCount: integer("in_app_created_count").notNull().default(0),
    confirmedByAdmin: integer("confirmed_by_admin", { mode: "boolean" })
      .notNull()
      .default(false),
    startedAt: text("started_at"),
    completedAt: text("completed_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
);

export const notificationEvents = sqliteTable("notification_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  category: text("category").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  actionUrl: text("action_url").notNull().default("/dashboard"),
  dedupeKey: text("dedupe_key").notNull().unique(),
  campaignId: integer("campaign_id").references(
    () => adminNotificationCampaigns.id,
    { onDelete: "set null" },
  ),
  createdByAdminId: integer("created_by_admin_id").references(
    () => adminUsers.id,
    { onDelete: "set null" },
  ),
  pushStatus: text("push_status").notNull().default("pending"),
  deliveryAttempts: integer("delivery_attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(3),
  nextAttemptAt: text("next_attempt_at"),
  lockedUntil: text("locked_until"),
  lastError: text("last_error").notNull().default(""),
  pushSentAt: text("push_sent_at"),
  readAt: text("read_at"),
  createdAt: text("created_at").notNull(),
});

export const adminNotificationCampaignRecipients = sqliteTable(
  "admin_notification_campaign_recipients",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    campaignId: integer("campaign_id")
      .notNull()
      .references(() => adminNotificationCampaigns.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    notificationEventId: integer("notification_event_id").references(
      () => notificationEvents.id,
      { onDelete: "set null" },
    ),
    status: text("status").notNull().default("pending"),
    skipReason: text("skip_reason").notNull().default(""),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
);

export const notificationDeliveries = sqliteTable("notification_deliveries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  notificationEventId: integer("notification_event_id")
    .notNull()
    .references(() => notificationEvents.id, { onDelete: "cascade" }),
  pushSubscriptionId: integer("push_subscription_id")
    .notNull()
    .references(() => pushSubscriptions.id, { onDelete: "cascade" }),
  status: text("status").notNull(),
  statusCode: integer("status_code"),
  errorMessage: text("error_message").notNull().default(""),
  deliveredAt: text("delivered_at").notNull(),
});

export const auditLogs = sqliteTable("admin_audit_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  adminId: integer("admin_id").references(() => adminUsers.id, {
    onDelete: "set null",
  }),
  legacyUserAdminId: integer("legacy_user_admin_id").references(
    () => users.id,
    {
      onDelete: "set null",
    },
  ),
  actorName: text("actor_name").notNull().default(""),
  actorEmail: text("actor_email").notNull().default(""),
  actorRole: text("actor_role").notNull().default(""),
  entityType: text("entity_type").notNull().default("system"),
  entityId: text("entity_id").notNull().default(""),
  action: text("action").notNull(),
  createdAt: text("created_at").notNull(),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const passwordResetCodes = sqliteTable("password_reset_codes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  actorType: text("actor_type").notNull(),
  userId: integer("user_id").references(() => users.id, {
    onDelete: "cascade",
  }),
  adminId: integer("admin_id").references(() => adminUsers.id, {
    onDelete: "cascade",
  }),
  email: text("email").notNull(),
  codeHmac: text("code_hmac").notNull(),
  challengeSalt: text("challenge_salt").notNull(),
  proofTokenHash: text("proof_token_hash"),
  attemptCount: integer("attempt_count").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(5),
  status: text("status").notNull().default("active"),
  requestIp: text("request_ip").notNull().default(""),
  expiresAt: text("expires_at").notNull(),
  verifiedAt: text("verified_at"),
  usedAt: text("used_at"),
  invalidatedAt: text("invalidated_at"),
  createdAt: text("created_at").notNull(),
});

export const passwordResetRateEvents = sqliteTable(
  "password_reset_rate_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    actorType: text("actor_type").notNull(),
    emailHmac: text("email_hmac").notNull(),
    ipHash: text("ip_hash").notNull(),
    createdAt: text("created_at").notNull(),
  },
);

export const emailCampaigns = sqliteTable("email_campaigns", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  createdByAdminId: integer("created_by_admin_id").references(
    () => adminUsers.id,
    { onDelete: "set null" },
  ),
  actorName: text("actor_name").notNull().default(""),
  actorEmail: text("actor_email").notNull().default(""),
  targetType: text("target_type").notNull(),
  targetSegment: text("target_segment").notNull().default(""),
  targetUserId: integer("target_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  emailType: text("email_type").notNull().default("announcement"),
  subject: text("subject").notNull(),
  bodyText: text("body_text").notNull(),
  actionLabel: text("action_label").notNull().default("Open Devotional Portal"),
  actionUrl: text("action_url").notNull().default("/dashboard"),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  status: text("status").notNull().default("queued"),
  pauseReason: text("pause_reason").notNull().default(""),
  scheduledFor: text("scheduled_for"),
  eligibleCount: integer("eligible_count").notNull().default(0),
  skippedOptOutCount: integer("skipped_opt_out_count").notNull().default(0),
  queuedCount: integer("queued_count").notNull().default(0),
  sentCount: integer("sent_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
  confirmedByAdmin: integer("confirmed_by_admin", { mode: "boolean" })
    .notNull()
    .default(false),
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const emailQueue = sqliteTable("email_queue", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  adminId: integer("admin_id").references(() => adminUsers.id, {
    onDelete: "set null",
  }),
  campaignId: integer("campaign_id").references(() => emailCampaigns.id, {
    onDelete: "set null",
  }),
  createdByAdminId: integer("created_by_admin_id").references(
    () => adminUsers.id,
    { onDelete: "set null" },
  ),
  recipientEmail: text("recipient_email").notNull(),
  recipientName: text("recipient_name").notNull().default(""),
  templateKey: text("template_key").notNull(),
  channelKind: text("channel_kind").notNull(),
  subject: text("subject").notNull(),
  htmlBody: text("html_body").notNull(),
  textBody: text("text_body").notNull(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  status: text("status").notNull().default("pending"),
  providerName: text("provider_name").notNull().default(""),
  providerMessageId: text("provider_message_id").notNull().default(""),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(5),
  nextAttemptAt: text("next_attempt_at"),
  lockedUntil: text("locked_until"),
  lastError: text("last_error").notNull().default(""),
  sentAt: text("sent_at"),
  bouncedAt: text("bounced_at"),
  complainedAt: text("complained_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const adminEmailCampaignRecipients = sqliteTable(
  "admin_email_campaign_recipients",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    campaignId: integer("campaign_id")
      .notNull()
      .references(() => emailCampaigns.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    emailQueueId: integer("email_queue_id").references(() => emailQueue.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull().default("pending"),
    skipReason: text("skip_reason").notNull().default(""),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
);

export const emailDeliveryEvents = sqliteTable("email_delivery_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  emailQueueId: integer("email_queue_id")
    .notNull()
    .references(() => emailQueue.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(),
  providerName: text("provider_name").notNull().default(""),
  providerEventId: text("provider_event_id").notNull().default(""),
  detail: text("detail").notNull().default(""),
  createdAt: text("created_at").notNull(),
});

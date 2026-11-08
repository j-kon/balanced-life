export type User = {
  id: number;
  name: string;
  email: string;
  role: "admin" | "reader";
  status?: "active" | "suspended";
  ageGroup?: "13_17" | "18_25" | "adult_mentor" | string;
  guardianConsentConfirmed?: boolean;
  createdAt?: string;
};

export type JournalEntry = {
  id: number;
  title: string;
  lessonLearned?: string;
  body: string;
  actionStep?: string;
  prayerFocus?: string;
  createdAt: string;
  updatedAt: string;
  devotionalId: number | null;
  devotionalTitle: string | null;
  devotionalDate: string | null;
};

export type Entry = {
  id: number;
  date: string;
  title: string;
  theme: string;
  sample: boolean;
  published: boolean;
  reviewStatus?: "pending_review" | "needs_revision" | "approved";
  reviewerNotes?: string;
  reviewedAt?: string | null;
  sourcePages?: string | null;
  completed?: boolean;
  completedAt?: string;
  saved?: boolean;
  bookmarkedAt?: string;
  bibleText?: string;
  memoryVerse?: string;
  reflection?: string;
  thinkAbout?: string;
  prayer?: string;
  challenge?: string;
  accountabilityEntry?: JournalEntry | null;
  previousId?: number | null;
  nextId?: number | null;
};

export type MonthlyTheme = {
  month: number;
  title: string;
  description: string;
  publishedReadings?: number;
};

export type Plan = {
  id: number;
  name: string;
  months: number;
  amountKobo: number;
  active: boolean;
};

export type BankAccountSetting = {
  currency: "NGN" | "USD" | "GBP";
  label: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
};

export type AppSettings = {
  siteTitle: string;
  siteTagline: string;
  brandStatement: string;
  siteHeadline: string;
  siteSubheadline: string;
  targetAudience: string;
  organizationName: string;
  organizationDescription: string;
  authorName: string;
  authorTitle: string;
  authorBio: string;
  contactEmail: string;
  contactPhone: string;
  contactSecondaryPhone: string;
  contactWebsite: string;
  contactAddress: string;
  hardcoverPriceKobo: number;
  hardcoverAvailability: "available" | "preorder" | "out_of_stock";
  hardcoverNote: string;
  digitalEditionPriceKobo: number;
  digitalEditionAvailability: "available" | "unavailable";
  digitalEditionScope: "edition_2027" | "includes_membership_updates";
  digitalEditionNote: string;
  bulkDiscountNote: string;
  bankTransferEnabled: boolean;
  bankAccounts: BankAccountSetting[];
  allowRegistration: boolean;
  enableAutoRenewal: boolean;
  renewalReminderDays: number;
};

export type AppConfig = {
  currentDate: string;
  isUpcomingYear: boolean;
  cover: string | null;
  authorPortrait: string | null;
  publishedCount: number;
  totalEntriesCount: number;
  themes: MonthlyTheme[];
  settings: AppSettings;
  payments: {
    configured: boolean;
    provider: "paystack";
    mode?: "test" | "live" | "unconfigured";
    publicKey: string | null;
  };
  email: {
    configured: boolean;
  };
  webPush?: {
    configured: boolean;
    publicKey: string | null;
  };
};

export type SubscriptionDetails = {
  id: number;
  userId: number;
  planId: number;
  planName: string;
  planMonths: number;
  planAmountKobo: number;
  accessType: "paid" | "complimentary";
  status: "active" | "cancelled" | "expired" | "revoked";
  effectiveStatus: "active" | "cancelling" | "expired" | "revoked";
  active: boolean;
  startedAt: string;
  expiresAt: string;
  renewalMode: "manual" | "automatic";
  cancelAtPeriodEnd: boolean;
  grantReason: string;
  daysRemaining: number;
  renewalReminder: {
    dueSoon: boolean;
    expired: boolean;
    daysRemaining: number;
    message: string;
  } | null;
};

export type PaymentRecord = {
  id: number;
  userId: number;
  userName?: string;
  email?: string;
  subscriptionId: number | null;
  planId: number;
  planName: string;
  amountKobo: number;
  currency: string;
  reference: string;
  provider: "paystack";
  status: "pending" | "succeeded" | "failed" | "abandoned" | "refunded";
  renewalMode: "manual" | "automatic";
  verifiedAt: string | null;
  createdAt: string;
};

export type DigitalEntitlementRecord = {
  id: number;
  userId: number;
  purchaseId: number;
  editionYear: number;
  accessScope: "edition_2027" | "includes_membership_updates";
  status: "active" | "revoked" | "refunded";
  grantedAt: string;
  revokedAt: string | null;
  revokeReason: string;
  updatedAt: string;
};

export type DigitalPurchaseRecord = {
  id: number;
  userId: number;
  userName?: string;
  email?: string;
  productCode: string;
  productName: string;
  editionYear?: number;
  amountKobo: number;
  currency: "NGN" | "USD" | "GBP";
  paymentMethod: "paystack" | "bank_transfer";
  reference: string;
  authorizationUrl: string | null;
  providerTransactionId?: string | null;
  transferReference: string;
  payerNote: string;
  status:
    | "pending"
    | "verifying_transfer"
    | "succeeded"
    | "failed"
    | "refunded"
    | "revoked";
  accessScope?: "edition_2027" | "includes_membership_updates";
  entitlementStatus?: string;
  adminNotes: string;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BulkOrderRecord = {
  id: number;
  userId: number | null;
  contactName: string;
  organizationName: string;
  organizationType:
    | "parent"
    | "school"
    | "church"
    | "youth_organization"
    | "other";
  email: string;
  phone: string;
  quantity: number;
  preferredFormat: "printed" | "digital" | "mixed";
  deliveryLocation: string;
  notes: string;
  status:
    | "new"
    | "contacted"
    | "quoted"
    | "approved"
    | "converted"
    | "fulfilled"
    | "archived";
  unitPriceKobo: number;
  discountPercent: number | null;
  quotedTotalKobo: number | null;
  agreedTotalKobo: number | null;
  quotationSummary: string;
  fulfillmentStatus:
    | "pending"
    | "processing"
    | "shipped"
    | "delivered"
    | "cancelled";
  trackingNote: string;
  adminNotes: string;
  createdAt: string;
  updatedAt: string;
};

export type InquiryRecord = {
  id: number;
  name: string;
  email: string;
  phone: string;
  quantity: number;
  deliveryLocation: string;
  message: string;
  inquiryType: "hardcover" | "general";
  status: "new" | "reviewed" | "contacted" | "fulfilled" | "archived";
  adminNotes: string;
  createdAt: string;
  updatedAt: string;
};

export type NotificationPreferences = {
  userId: number;
  notificationsEnabled: boolean;
  dailyReminderEnabled: boolean;
  unreadReminderEnabled: boolean;
  reminderTime: string;
  timezone: string;
  quietHoursStart: string;
  quietHoursEnd: string;
  subscriptionAlertsEnabled: boolean;
  purchaseAlertsEnabled: boolean;
  lastDailyReminderDate: string | null;
  lastUnreadReminderDate: string | null;
  lastExpiryReminderFor: string | null;
  updatedAt: string;
};

export type PushDeviceRecord = {
  id: number;
  userId: number;
  endpoint: string;
  userAgent: string;
  deviceLabel: string;
  status: "active" | "expired" | "unsubscribed";
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastErrorMessage: string;
  createdAt: string;
  updatedAt: string;
};

export type NotificationEventRecord = {
  id: number;
  userId: number;
  category:
    | "daily_reminder"
    | "unread_reminder"
    | "subscription"
    | "digital_purchase"
    | "account"
    | "system";
  title: string;
  body: string;
  actionUrl: string;
  dedupeKey: string;
  deliveryStatus?: string;
  attempts?: number;
  maxAttempts?: number;
  nextAttemptAt?: string | null;
  deliveredAt?: string | null;
  lastError?: string;
  readAt: string | null;
  createdAt: string;
};

export type User = {
  id: number;
  name: string;
  email: string;
  role: "reader";
  status?: "active" | "suspended";
  ageGroup?: "13_17" | "18_25" | "adult_mentor" | string;
  guardianConsentConfirmed?: boolean;
  onboardingCompletedAt?: string | null;
  createdAt?: string;
};

export type ReaderAccessState =
  | "guest"
  | "free"
  | "pending_payment"
  | "scheduled"
  | "active"
  | "expiring_soon"
  | "expired"
  | "revoked";

export type PendingPurchaseSummary = {
  id: number;
  reference: string;
  paymentMethod: "paystack" | "bank_transfer";
  status: "pending" | "verifying_transfer";
  amountKobo: number;
  currency: string;
  transferReference: string;
  createdAt: string;
};

export type ReaderAccessSummary = {
  status: ReaderAccessState;
  hasAccess: boolean;
  source:
    | "none"
    | "digital_entitlement"
    | "legacy_subscription"
    | "complimentary";
  accessType: "paid" | "complimentary" | null;
  startsAt: string | null;
  expiresAt: string | null;
  daysRemaining: number | null;
  expiringSoon: boolean;
  legacyPersistent: boolean;
  revokeReason: string | null;
  pendingPurchase: PendingPurchaseSummary | null;
  previousEntitlementExpired: boolean;
  entitlement: DigitalEntitlementRecord | null;
  subscription: SubscriptionDetails | null;
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
  printedBookStockCount?: number | null;
  deliveryPricingMode?: "quotation_required" | "fixed_fee";
  defaultDeliveryFeeKobo?: number | null;
  deliveryPolicyNote?: string;
  digitalEditionPriceKobo: number;
  digitalAccessDurationMonths?: number;
  digitalEditionAvailability: "available" | "unavailable";
  digitalEditionScope: "edition_2027" | "includes_membership_updates";
  digitalEditionNote: string;
  bulkDiscountNote: string;
  bankTransferEnabled: boolean;
  bankTransferInstructions?: string;
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
  effectiveStatus: "active" | "scheduled" | "cancelling" | "expired" | "revoked";
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
  purchaseId: number | null;
  editionYear: number;
  accessType?: "paid" | "complimentary";
  accessScope: "edition_2027" | "includes_membership_updates";
  status: "scheduled" | "active" | "expired" | "revoked" | "refunded";
  effectiveStatus?:
    | "scheduled"
    | "active"
    | "expiring_soon"
    | "expired"
    | "revoked"
    | "refunded";
  startsAt?: string;
  expiresAt?: string | null;
  durationMonths?: number;
  renewalCount?: number;
  legacyPersistent?: boolean;
  legacyReviewRequired?: boolean;
  daysRemaining?: number | null;
  expiringSoon?: boolean;
  grantReason?: string;
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
  paymentMethod: "paystack" | "bank_transfer" | "complimentary";
  reference: string;
  authorizationUrl?: string | null;
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
  accessStatus?: "scheduled" | "active" | "pending" | "expired" | "refunded" | "revoked" | "failed" | "none";
  startsAt?: string | null;
  expiresAt?: string | null;
  daysRemaining?: number | null;
  expiringSoon?: boolean;
  renewalCount?: number;
  legacyPersistent?: boolean;
  legacyReviewRequired?: boolean;
  adminNotes: string;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PrintedOrderItemRecord = {
  id: number;
  orderId: number;
  productCode: string;
  productTitle: string;
  quantity: number;
  unitPriceKobo: number;
  lineTotalKobo: number;
  createdAt: string;
};

export type PrintedOrderRecord = {
  id: number;
  orderNumber: string;
  userId: number | null;
  bulkOrderId: number | null;
  fullName: string;
  email: string;
  phone: string;
  streetAddress: string;
  city: string;
  state: string;
  country: string;
  deliveryLandmark: string;
  quantity: number;
  unitPriceKobo: number;
  subtotalKobo: number;
  deliveryFeeKobo: number | null;
  deliveryQuoteStatus:
    | "pending_quote"
    | "quoted"
    | "customer_approved"
    | "fixed_applied";
  deliveryQuoteNote: string;
  finalTotalKobo: number | null;
  customerApprovedQuoteAt: string | null;
  currency: "NGN" | "USD" | "GBP";
  paymentMethod: "unselected" | "paystack" | "bank_transfer";
  paymentReference: string | null;
  authorizationUrl: string | null;
  providerTransactionId: string | null;
  transferReference: string;
  payerNote: string;
  paymentStatus:
    | "pending"
    | "awaiting_verification"
    | "paid"
    | "failed"
    | "refunded";
  fulfillmentStatus:
    | "new"
    | "awaiting_delivery_quotation"
    | "awaiting_payment"
    | "processing"
    | "ready_for_dispatch"
    | "shipped"
    | "delivered"
    | "cancelled";
  dispatchExceptionNote: string;
  courierName: string;
  trackingReference: string;
  customerDeliveryNotes: string;
  adminNotes: string;
  verifiedByAdminId: number | null;
  paidAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  refundedAt: string | null;
  createdAt: string;
  updatedAt: string;
  items?: PrintedOrderItemRecord[];
  orderAccessToken?: string;
  orderAccessTokenExpiresAt?: string;
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
  contactHistory?: string;
  linkedPrintedOrderId?: number | null;
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
  announcementsEnabled?: boolean;
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
    | "printed_order"
    | "announcement"
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

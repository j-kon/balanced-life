import type {
  AdminAuditItem,
  AppSettings,
  BulkOrderRecord,
  DigitalEntitlementRecord,
  DigitalPurchaseRecord,
  Entry,
  InquiryRecord,
  MonthlyTheme,
  NotificationEventRecord,
  PaymentRecord,
  Plan,
  PrintedOrderRecord,
  SubscriptionDetails,
} from "../types";

export type AdminSectionId =
  | "Overview"
  | "Online Access"
  | "Printed Orders"
  | "Readers"
  | "Devotionals"
  | "Bulk Orders"
  | "Payments"
  | "Notifications"
  | "Activity & Security"
  | "Settings";

export type AdminUserRow = {
  id: number;
  name: string;
  email: string;
  role: "reader" | "admin";
  status: "active" | "suspended";
  suspendedReason: string;
  ageGroup?: string;
  guardianConsentConfirmed?: boolean;
  createdAt: string;
  subscription: SubscriptionDetails | null;
  digitalEntitlement?: DigitalEntitlementRecord | null;
  hasDigitalEdition?: boolean;
  onlineAccessActive?: boolean;
  onlineAccessStatus?:
    | "active"
    | "scheduled"
    | "expired"
    | "revoked"
    | "pending_payment"
    | "none";
  onlineAccessStartsAt?: string | null;
  onlineAccessExpiresAt?: string | null;
  onlineAccessDaysRemaining?: number | null;
  completedReadingsCount?: number;
  bookmarksCount?: number;
  digitalPurchasesCount?: number;
  printedOrdersCount?: number;
  planName: string | null;
  accessType: "paid" | "complimentary" | null;
  subscriptionStatus: string;
  expiresAt: string | null;
  renewalMode: "manual" | "automatic" | null;
  cancelAtPeriodEnd: boolean;
  grantReason: string;
};

export type AdminChartPoint = {
  date?: string;
  month?: string;
  label: string;
  digitalKobo: number;
  printedKobo: number;
  totalKobo: number;
};

export type AdminOperationalAlert = {
  id: string;
  severity: "high" | "medium" | "info";
  category:
    | "printed_order"
    | "payment_verification"
    | "online_access"
    | "bulk_order"
    | "devotional"
    | "inquiry";
  title: string;
  description: string;
  actionTab: string;
  createdAt: string;
};

export type AdminOverviewData = {
  metrics: {
    readers: number;
    totalRegisteredReaders?: number;
    activeOnlineReaders?: number;
    scheduledOnlineReaders?: number;
    paidOnlineReaders?: number;
    complimentaryOnlineReaders?: number;
    expiringOnlineAccessSoon?: number;
    expiredOnlineAccess?: number;
    revokedOnlineAccess?: number;
    activeMemberships: number;
    paidMemberships: number;
    complimentaryMemberships: number;
    expiredMemberships: number;
    digitalEditionsSold: number;
    pendingDigitalPurchases: number;
    pendingPrintedOrders?: number;
    ordersAwaitingDelivery?: number;
    deliveredOrders?: number;
    printedOrdersTotal?: number;
    printedBooksCopiesOrdered?: number;
    published: number;
    drafts: number;
    approvedReadings: number;
    approvedUnpublishedReadings?: number;
    pendingReviewReadings?: number;
    needsRevisionReadings: number;
    missingDevotionalDates?: number;
    completions: number;
    bookmarks: number;
    subscriptionRevenueKobo: number;
    digitalRevenueKobo: number;
    digitalAccessRevenueKobo?: number;
    printedBookRevenueKobo?: number;
    totalSalesKobo?: number;
    verifiedRevenueKobo: number;
    openInquiries: number;
    scheduledNotificationsCount?: number;
    pendingNotificationCampaignsCount?: number;
    failedNotificationCampaignsCount?: number;
    bulkOrderInquiries: number;
    openBulkOrders: number;
    activeAlertsCount?: number;
  };
  charts?: {
    salesByPeriod: {
      daily: AdminChartPoint[];
      weekly: AdminChartPoint[];
      monthly: AdminChartPoint[];
    };
    digitalVsPrinted: {
      digitalKobo: number;
      printedKobo: number;
      digitalCount: number;
      printedCount: number;
    };
    registrationsByMonth: Array<{
      month: string;
      label: string;
      count: number;
    }>;
    ordersByFulfillmentStatus: Array<{
      status: string;
      label: string;
      count: number;
    }>;
  };
  users: AdminUserRow[];
  devotionals: Entry[];
  themes: MonthlyTheme[];
  plans: Plan[];
  payments: PaymentRecord[];
  digitalPurchases: DigitalPurchaseRecord[];
  onlineAccessRecords?: DigitalPurchaseRecord[];
  printedOrders?: PrintedOrderRecord[];
  bulkOrders: BulkOrderRecord[];
  inquiries: InquiryRecord[];
  operationalAlerts?: AdminOperationalAlert[];
  pushStatusSummary?: {
    configured: boolean;
    activePushDevicesCount: number;
    recentEvents: NotificationEventRecord[];
    campaigns?: AdminNotificationCampaign[];
  };
  engagement: Array<{
    id: number;
    date: string;
    title: string;
    completions: number;
    bookmarks: number;
  }>;
  audit: AdminAuditItem[];
  settings: AppSettings;
  paymentsConfig: {
    configured: boolean;
    provider: "paystack";
  };
};

export type AdminNotificationCampaign = {
  id: number;
  createdByAdminId: number | null;
  actorName: string;
  actorEmail: string;
  targetType: "individual" | "all" | "segment";
  targetSegment: string;
  targetUserId: number | null;
  category: "announcement" | "account" | "system" | "subscription";
  title: string;
  body: string;
  actionUrl: string;
  idempotencyKey: string;
  status: "scheduled" | "queued" | "enqueueing" | "completed" | "cancelled";
  scheduledFor: string | null;
  eligibleCount: number;
  skippedOptOutCount: number;
  queuedCount: number;
  inAppCreatedCount: number;
  pushAttempts: number;
  pushProviderAccepted: number;
  pushFailedOrSkipped: number;
  readCount: number;
  createdAt: string;
  updatedAt: string;
};

export type AdminSaveFn = (
  path: string,
  body: unknown,
  method?: string,
  customToast?: string,
) => Promise<boolean>;


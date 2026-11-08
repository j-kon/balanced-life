import type {
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
} from "../../types";

export type AdminSectionId =
  | "Overview"
  | "Online Access"
  | "Printed Orders"
  | "Readers"
  | "Devotionals"
  | "Bulk Orders"
  | "Payments"
  | "Notifications"
  | "Settings";

export type AdminUserRow = {
  id: number;
  name: string;
  email: string;
  role: "admin" | "reader";
  status: "active" | "suspended";
  suspendedReason: string;
  ageGroup?: string;
  guardianConsentConfirmed?: boolean;
  createdAt: string;
  subscription: SubscriptionDetails | null;
  digitalEntitlement?: DigitalEntitlementRecord | null;
  hasDigitalEdition?: boolean;
  onlineAccessActive?: boolean;
  onlineAccessStatus?: "active" | "expired" | "revoked" | "none";
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
    expiringOnlineAccessSoon?: number;
    expiredOnlineAccess?: number;
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
    needsRevisionReadings: number;
    completions: number;
    bookmarks: number;
    subscriptionRevenueKobo: number;
    digitalRevenueKobo: number;
    digitalAccessRevenueKobo?: number;
    printedBookRevenueKobo?: number;
    totalSalesKobo?: number;
    verifiedRevenueKobo: number;
    openInquiries: number;
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
  };
  engagement: Array<{
    id: number;
    date: string;
    title: string;
    completions: number;
    bookmarks: number;
  }>;
  audit: Array<{
    id: number;
    adminId: number;
    adminName: string | null;
    action: string;
    createdAt: string;
  }>;
  settings: AppSettings;
  paymentsConfig: {
    configured: boolean;
    provider: "paystack";
  };
};

export type AdminSaveFn = (
  path: string,
  body: unknown,
  method?: string,
) => Promise<void>;


export type User = {
  id: number;
  name: string;
  email: string;
  role: "admin" | "reader";
  status?: "active" | "suspended";
  createdAt?: string;
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

export type AppSettings = {
  siteTitle: string;
  siteTagline: string;
  organizationName: string;
  organizationDescription: string;
  authorName: string;
  authorTitle: string;
  authorBio: string;
  contactEmail: string;
  contactPhone: string;
  contactAddress: string;
  hardcoverPriceKobo: number;
  hardcoverAvailability: "available" | "preorder" | "out_of_stock";
  hardcoverNote: string;
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
    publicKey: string | null;
  };
  email: {
    configured: boolean;
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

export type JournalEntry = {
  id: number;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  devotionalId: number | null;
  devotionalTitle: string | null;
  devotionalDate: string | null;
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


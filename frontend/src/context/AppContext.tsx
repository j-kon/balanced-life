import { createContext, useContext } from "react";
import type { AppConfig, ReaderAccessSummary, User } from "../types";

export const defaultGuestAccess: ReaderAccessSummary = {
  status: "guest",
  hasAccess: false,
  source: "none",
  accessType: null,
  startsAt: null,
  expiresAt: null,
  daysRemaining: null,
  expiringSoon: false,
  legacyPersistent: false,
  revokeReason: null,
  pendingPurchase: null,
  previousEntitlementExpired: false,
  entitlement: null,
  subscription: null,
};

export const defaultConfig: AppConfig = {
  currentDate: new Date().toISOString().slice(0, 10),
  isUpcomingYear: new Date().toISOString().slice(0, 10) < "2027-01-01",
  cover: "/brand/book-cover.png",
  authorPortrait: "/brand/author-profile.png",
  publishedCount: 0,
  totalEntriesCount: 0,
  themes: [],
  settings: {
    siteTitle: "The Balanced Life Devotional",
    siteTagline:
      "Godliness for the heart. Wisdom for the journey. Growth for the whole person.",
    brandStatement:
      "Building Minds. Shaping Character. Creating Balanced Lives.",
    siteHeadline: "Growing up is a journey. Make every day count.",
    siteSubheadline:
      "365 Days of Connecting with Jesus with holistic development.",
    targetAudience: "Teenagers & Young Adults | Ages 13–25",
    organizationName: "Cossy Teens Consult Enterprises",
    organizationDescription:
      "Cossy Teens Consult Enterprises is a counselling, mentorship, and personal development organization committed to building minds, shaping character, and creating balanced lives for teenagers and young adults (Ages 13–25).",
    authorName: "Mrs. Adindu Ogechukwu Constance Nwisi",
    authorTitle:
      "Certified Counselling Practitioner & Lead Consultant, Cossy Teens Consult Enterprises",
    authorBio:
      "Adindu Ogechukwu Constance Nwisi is a Certified Counselling Practitioner, writer, preacher, public speaker, and the Lead Consultant of Cossy Teens Consult Enterprises.",
    contactEmail: "cossyteensconsult@gmail.com",
    contactPhone: "+2349055002143",
    contactSecondaryPhone: "+2349113708399",
    contactWebsite: "cossyteens.com",
    contactAddress: "Abuja, Nigeria",
    hardcoverPriceKobo: 500000,
    hardcoverAvailability: "available",
    printedBookStockCount: null,
    hardcoverNote:
      "Printed copies of The Balanced Life Devotional (₦5,000) are available for individual readers, parents, schools, churches, and youth organizations.",
    digitalEditionPriceKobo: 350000,
    digitalAccessDurationMonths: 12,
    digitalEditionAvailability: "available",
    digitalEditionScope: "edition_2027",
    digitalEditionNote:
      "One payment of ₦3,500 grants 12 calendar months of online reading access to the 2027 edition of The Balanced Life Devotional (starting January 1, 2027 for early purchases, or from payment verification thereafter). Manual renewal is supported with no automatic recurring charge.",
    bulkDiscountNote:
      "Special bulk arrangements are available for schools, churches, youth groups, and organizations.",
    bankTransferEnabled: false,
    bankAccounts: [],
    allowRegistration: true,
    enableAutoRenewal: true,
    renewalReminderDays: 7,
  },
  payments: {
    configured: false,
    provider: "paystack",
    mode: "unconfigured",
    publicKey: null,
  },
  email: {
    configured: false,
  },
  webPush: {
    configured: false,
    publicKey: null,
  },
};

export type AppContextValue = {
  user: User | null;
  access: ReaderAccessSummary;
  unreadNotificationsCount: number;
  refresh: () => Promise<User | null>;
  refreshConfig: () => Promise<void>;
  config: AppConfig;
  toast: (message: string) => void;
};

export const AppContext = createContext<AppContextValue>({
  user: null,
  access: defaultGuestAccess,
  unreadNotificationsCount: 0,
  refresh: async () => null,
  refreshConfig: async () => {},
  config: defaultConfig,
  toast: () => {},
});

export const useApp = () => useContext(AppContext);

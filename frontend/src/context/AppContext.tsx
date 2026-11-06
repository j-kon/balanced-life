import { createContext, useContext } from "react";
import type { AppConfig, User } from "../types";

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
    organizationName: "Cossy Teens Consult",
    organizationDescription:
      "Cossy Teens Consult is a professional counselling and mentorship hub committed to helping teenagers and young adults grow with balance.",
    authorName: "Mrs. Adindu Ogechukwu Constance Nwisi",
    authorTitle:
      "Certified Counselling Practitioner & Lead Consultant, Cossy Teens Consult",
    authorBio:
      "Adindu Ogechukwu Constance Nwisi is a Certified Counselling Practitioner, writer, preacher, public speaker, and the Lead Consultant of Cossy Teens Consult.",
    contactEmail: "inquiries@cossyteensconsult.org",
    contactPhone: "+234 800 000 0000",
    contactAddress: "Lagos, Nigeria",
    hardcoverPriceKobo: 500000,
    hardcoverAvailability: "available",
    hardcoverNote:
      "Hardcover copies of the 2027 edition are available for individual readers, youth ministries, schools, and church groups.",
    allowRegistration: true,
    enableAutoRenewal: true,
    renewalReminderDays: 7,
  },
  payments: {
    configured: false,
    provider: "paystack",
    publicKey: null,
  },
  email: {
    configured: false,
  },
};

export type AppContextValue = {
  user: User | null;
  refresh: () => Promise<void>;
  refreshConfig: () => Promise<void>;
  config: AppConfig;
  toast: (message: string) => void;
};

export const AppContext = createContext<AppContextValue>({
  user: null,
  refresh: async () => {},
  refreshConfig: async () => {},
  config: defaultConfig,
  toast: () => {},
});

export const useApp = () => useContext(AppContext);


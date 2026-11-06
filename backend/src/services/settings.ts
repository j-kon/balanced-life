import {
  DEFAULT_BANK_ACCOUNTS,
  DEFAULT_SETTINGS,
  type BankAccountSetting,
  type Store,
} from "../db.js";
import * as s from "../schema.js";

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

function parseBankAccounts(raw: string | undefined): BankAccountSetting[] {
  if (!raw) return DEFAULT_BANK_ACCOUNTS;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch {
    // fallback to defaults
  }
  return DEFAULT_BANK_ACCOUNTS;
}

export function getAppSettings(store: Store): AppSettings {
  const rows = store.db.select().from(s.settings).all();
  const map: Record<string, string> = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    map[row.key] = row.value;
  }
  return {
    siteTitle: map.siteTitle,
    siteTagline: map.siteTagline,
    brandStatement: map.brandStatement,
    siteHeadline: map.siteHeadline,
    siteSubheadline: map.siteSubheadline,
    targetAudience: map.targetAudience,
    organizationName: map.organizationName,
    organizationDescription: map.organizationDescription,
    authorName: map.authorName,
    authorTitle: map.authorTitle,
    authorBio: map.authorBio,
    contactEmail: map.contactEmail,
    contactPhone: map.contactPhone,
    contactSecondaryPhone: map.contactSecondaryPhone,
    contactWebsite: map.contactWebsite,
    contactAddress: map.contactAddress,
    hardcoverPriceKobo: Number(map.hardcoverPriceKobo) || 500000,
    hardcoverAvailability:
      map.hardcoverAvailability === "preorder" ||
      map.hardcoverAvailability === "out_of_stock"
        ? map.hardcoverAvailability
        : "available",
    hardcoverNote: map.hardcoverNote,
    digitalEditionPriceKobo: Number(map.digitalEditionPriceKobo) || 350000,
    digitalEditionAvailability:
      map.digitalEditionAvailability === "unavailable"
        ? "unavailable"
        : "available",
    digitalEditionScope:
      map.digitalEditionScope === "includes_membership_updates"
        ? "includes_membership_updates"
        : "edition_2027",
    digitalEditionNote: map.digitalEditionNote,
    bulkDiscountNote: map.bulkDiscountNote,
    bankTransferEnabled: map.bankTransferEnabled === "true",
    bankAccounts: parseBankAccounts(map.bankAccountsJson),
    allowRegistration: map.allowRegistration !== "false",
    enableAutoRenewal: map.enableAutoRenewal !== "false",
    renewalReminderDays: Number(map.renewalReminderDays) || 7,
  };
}

export type AppSettingsUpdate = Partial<
  Omit<AppSettings, "bankAccounts"> & {
    bankAccounts?: BankAccountSetting[];
  }
>;

export function updateAppSettings(
  store: Store,
  updates: AppSettingsUpdate,
): AppSettings {
  store.sqlite.transaction(() => {
    for (const [key, val] of Object.entries(updates)) {
      if (val === undefined) continue;
      if (key === "bankAccounts") {
        const value = JSON.stringify(val);
        store.db
          .insert(s.settings)
          .values({ key: "bankAccountsJson", value })
          .onConflictDoUpdate({
            target: s.settings.key,
            set: { value },
          })
          .run();
        continue;
      }
      const value = String(val);
      store.db
        .insert(s.settings)
        .values({ key, value })
        .onConflictDoUpdate({
          target: s.settings.key,
          set: { value },
        })
        .run();
    }
  })();
  return getAppSettings(store);
}

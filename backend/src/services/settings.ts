import { DEFAULT_SETTINGS, type Store } from "../db.js";
import * as s from "../schema.js";

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

export function getAppSettings(store: Store): AppSettings {
  const rows = store.db.select().from(s.settings).all();
  const map: Record<string, string> = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    map[row.key] = row.value;
  }
  return {
    siteTitle: map.siteTitle,
    siteTagline: map.siteTagline,
    organizationName: map.organizationName,
    organizationDescription: map.organizationDescription,
    authorName: map.authorName,
    authorTitle: map.authorTitle,
    authorBio: map.authorBio,
    contactEmail: map.contactEmail,
    contactPhone: map.contactPhone,
    contactAddress: map.contactAddress,
    hardcoverPriceKobo: Number(map.hardcoverPriceKobo) || 500000,
    hardcoverAvailability:
      map.hardcoverAvailability === "preorder" ||
      map.hardcoverAvailability === "out_of_stock"
        ? map.hardcoverAvailability
        : "available",
    hardcoverNote: map.hardcoverNote,
    allowRegistration: map.allowRegistration !== "false",
    enableAutoRenewal: map.enableAutoRenewal !== "false",
    renewalReminderDays: Number(map.renewalReminderDays) || 7,
  };
}

export function updateAppSettings(
  store: Store,
  updates: Partial<Record<keyof AppSettings, string | number | boolean>>,
): AppSettings {
  store.sqlite.transaction(() => {
    for (const [key, val] of Object.entries(updates)) {
      if (val === undefined) continue;
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


import { desc, eq } from "drizzle-orm";
import type { Store } from "../db.js";
import * as s from "../schema.js";
import type { PublicUser } from "../auth.js";
import { getAppSettings } from "./settings.js";
import {
  getUserDigitalEntitlement,
  getUserDigitalPurchases,
  type DigitalEntitlementRecord,
} from "./commerce.js";
import {
  getSubscriptionDetails,
  type EnrichedSubscription,
} from "./subscriptions.js";
import { getLocalDateTime } from "./notifications.js";

export type ReaderAccessState =
  | "guest"
  | "free"
  | "pending_payment"
  | "scheduled"
  | "active"
  | "expiring_soon"
  | "expired"
  | "revoked";

export type ReaderAudienceSegment =
  | "free"
  | "pending_payment"
  | "scheduled"
  | "active"
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
  source: "none" | "digital_entitlement" | "legacy_subscription" | "complimentary";
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
  subscription: EnrichedSubscription | null;
};

/**
 * Computes the single backend-authoritative access state for a visitor or reader account.
 * Never trusts client flags or payment attempt presence; only verified active/scheduled/expired/revoked
 * database entitlements/subscriptions or real unverified purchases drive the state.
 */
export function getReaderAccessSummary(
  store: Store,
  user: PublicUser | null,
  referenceNowIso?: string,
): ReaderAccessSummary {
  if (!user) {
    return {
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
  }

  const settings = getAppSettings(store);
  const entitlement = getUserDigitalEntitlement(
    store,
    user.id,
    2027,
    referenceNowIso,
  );
  const subscription = getSubscriptionDetails(
    store,
    user.id,
    settings.renewalReminderDays,
    referenceNowIso,
  );
  const purchases = getUserDigitalPurchases(store, user.id);
  const rawPending = purchases.find(
    (p) => p.status === "pending" || p.status === "verifying_transfer",
  );
  const pendingPurchase: PendingPurchaseSummary | null = rawPending
    ? {
        id: rawPending.id,
        reference: rawPending.reference,
        paymentMethod:
          rawPending.paymentMethod === "bank_transfer"
            ? "bank_transfer"
            : "paystack",
        status:
          rawPending.status === "verifying_transfer"
            ? "verifying_transfer"
            : "pending",
        amountKobo: rawPending.amountKobo,
        currency: rawPending.currency,
        transferReference: rawPending.transferReference || "",
        createdAt: rawPending.createdAt,
      }
    : null;

  const isRevoked =
    entitlement?.status === "revoked" ||
    entitlement?.status === "refunded" ||
    subscription?.effectiveStatus === "revoked";

  const isExpired =
    entitlement?.status === "expired" ||
    subscription?.effectiveStatus === "expired";

  // 1. Active digital entitlement or active legacy/complimentary subscription
  if (entitlement?.active || subscription?.active) {
    const useEnt = Boolean(entitlement?.active);
    const expiringSoon = useEnt
      ? Boolean(entitlement?.expiringSoon)
      : Boolean(subscription?.renewalReminder?.dueSoon);

    const accessType = useEnt
      ? entitlement!.accessType
      : subscription!.accessType;
    const source: ReaderAccessSummary["source"] =
      accessType === "complimentary"
        ? "complimentary"
        : useEnt
          ? "digital_entitlement"
          : "legacy_subscription";

    return {
      status: expiringSoon ? "expiring_soon" : "active",
      hasAccess: user.status === "active",
      source,
      accessType,
      startsAt: useEnt ? entitlement!.startsAt : subscription!.startedAt,
      expiresAt: useEnt ? entitlement!.expiresAt : subscription!.expiresAt,
      daysRemaining: useEnt
        ? entitlement!.daysRemaining
        : subscription!.daysRemaining,
      expiringSoon,
      legacyPersistent: Boolean(useEnt && entitlement?.legacyPersistent),
      revokeReason: null,
      pendingPurchase,
      previousEntitlementExpired: false,
      entitlement,
      subscription,
    };
  }

  // 2. Scheduled entitlement (verified pre-2027 purchase or future grant whose startsAt > now)
  if (
    entitlement?.effectiveStatus === "scheduled" ||
    subscription?.effectiveStatus === "scheduled"
  ) {
    const useEnt = entitlement?.effectiveStatus === "scheduled";
    return {
      status: "scheduled",
      hasAccess: false,
      source:
        (useEnt ? entitlement!.accessType : subscription!.accessType) ===
        "complimentary"
          ? "complimentary"
          : useEnt
            ? "digital_entitlement"
            : "legacy_subscription",
      accessType: useEnt
        ? entitlement!.accessType
        : subscription!.accessType,
      startsAt: useEnt ? entitlement!.startsAt : subscription!.startedAt,
      expiresAt: useEnt ? entitlement!.expiresAt : subscription!.expiresAt,
      daysRemaining: null,
      expiringSoon: false,
      legacyPersistent: false,
      revokeReason: null,
      pendingPurchase,
      previousEntitlementExpired: false,
      entitlement,
      subscription,
    };
  }

  // 3. Revoked access (must not appear as a mere expired subscription)
  if (isRevoked) {
    return {
      status: "revoked",
      hasAccess: false,
      source: entitlement ? "digital_entitlement" : "legacy_subscription",
      accessType: entitlement?.accessType ?? subscription?.accessType ?? null,
      startsAt: entitlement?.startsAt ?? subscription?.startedAt ?? null,
      expiresAt: entitlement?.expiresAt ?? subscription?.expiresAt ?? null,
      daysRemaining: 0,
      expiringSoon: false,
      legacyPersistent: Boolean(entitlement?.legacyPersistent),
      revokeReason:
        entitlement?.revokeReason ||
        subscription?.grantReason ||
        "Access was revoked or refunded.",
      pendingPurchase,
      previousEntitlementExpired: false,
      entitlement,
      subscription,
    };
  }

  // 4. Unverified pending checkout or bank transfer
  if (pendingPurchase) {
    return {
      status: "pending_payment",
      hasAccess: false,
      source: "digital_entitlement",
      accessType: null,
      startsAt: entitlement?.startsAt ?? null,
      expiresAt: entitlement?.expiresAt ?? null,
      daysRemaining: 0,
      expiringSoon: false,
      legacyPersistent: false,
      revokeReason: null,
      pendingPurchase,
      previousEntitlementExpired: Boolean(isExpired),
      entitlement,
      subscription,
    };
  }

  // 5. Expired access (preserving account, bookmarks, progress, and journals)
  if (isExpired) {
    const useEnt = entitlement?.status === "expired";
    return {
      status: "expired",
      hasAccess: false,
      source: useEnt ? "digital_entitlement" : "legacy_subscription",
      accessType: useEnt
        ? entitlement!.accessType
        : subscription?.accessType ?? null,
      startsAt: useEnt ? entitlement!.startsAt : subscription?.startedAt ?? null,
      expiresAt: useEnt
        ? entitlement!.expiresAt
        : subscription?.expiresAt ?? null,
      daysRemaining: 0,
      expiringSoon: false,
      legacyPersistent: false,
      revokeReason: null,
      pendingPurchase: null,
      previousEntitlementExpired: true,
      entitlement,
      subscription,
    };
  }

  // 6. Standard authenticated free reader
  return {
    status: "free",
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
    entitlement,
    subscription,
  };
}

export function userMatchesAudienceSegment(
  summary: ReaderAccessSummary,
  segment: ReaderAudienceSegment,
): boolean {
  if (segment === "active") {
    return summary.status === "active" || summary.status === "expiring_soon";
  }
  return summary.status === segment;
}

/**
 * Computes consecutive reading days up to today or yesterday in the reader's timezone,
 * derived strictly from real reading_progress rows. Never fabricates streaks.
 */
export function computeReadingStreakDays(
  store: Store,
  userId: number,
  timezone = "Africa/Lagos",
  referenceNow: Date = new Date(),
): number {
  const rows = store.db
    .select({ completedAt: s.progress.completedAt })
    .from(s.progress)
    .where(eq(s.progress.userId, userId))
    .orderBy(desc(s.progress.completedAt))
    .all();

  if (rows.length === 0) return 0;

  const uniqueDates = new Set<string>();
  for (const row of rows) {
    const dt = new Date(row.completedAt);
    if (!Number.isNaN(dt.getTime())) {
      uniqueDates.add(getLocalDateTime(dt, timezone).localDate);
    }
  }

  const todayLocal = getLocalDateTime(referenceNow, timezone).localDate;
  const yesterdayLocal = getLocalDateTime(
    new Date(referenceNow.getTime() - 86400000),
    timezone,
  ).localDate;

  let cursorDate: string | null = uniqueDates.has(todayLocal)
    ? todayLocal
    : uniqueDates.has(yesterdayLocal)
      ? yesterdayLocal
      : null;

  if (!cursorDate) return 0;

  let streak = 0;
  let cursorMs = Date.parse(`${cursorDate}T12:00:00.000Z`);
  while (cursorDate && uniqueDates.has(cursorDate)) {
    streak++;
    cursorMs -= 86400000;
    cursorDate = new Date(cursorMs).toISOString().slice(0, 10);
  }
  return streak;
}


import { and, desc, eq, gt, isNull, lte, or } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import type { Store } from "../db.js";
import * as s from "../schema.js";
import { HttpError } from "../errors.js";
import type { PaymentProvider } from "./payments.js";
import {
  logAdminAudit,
  newToken,
  tokenHash,
  type AdminActor,
  type PublicUser,
} from "../auth.js";
import { getAppSettings, updateAppSettings } from "./settings.js";
import { createNotificationEvent } from "./notifications.js";
import { getEnvConfig } from "../config.js";
import { enqueueEmail } from "./emailQueue.js";
import { formatNairaFromKobo } from "./emailTemplates.js";

export const EDITION_2027_START_ISO = "2027-01-01T00:00:00.000Z";

export function addCalendarMonths(dateIso: string, months: number): string {
  const value = new Date(dateIso);
  const day = value.getUTCDate();
  value.setUTCDate(1);
  value.setUTCMonth(value.getUTCMonth() + months);
  const last = new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0),
  ).getUTCDate();
  value.setUTCDate(Math.min(day, last));
  return value.toISOString();
}

export function computeDigitalTermWindow(
  verifiedAtOrDate: string | Date,
  currentEntitlement?: {
    status: string;
    startsAt: string;
    expiresAt: string;
  } | null,
  durationMonths = 12,
): {
  startsAt: string;
  expiresAt: string;
  periodStartAt: string;
  periodEndAt: string;
  isRenewal: boolean;
} {
  const verifiedAtIso =
    verifiedAtOrDate instanceof Date
      ? verifiedAtOrDate.toISOString()
      : String(verifiedAtOrDate);

  const effectivePurchaseStart =
    verifiedAtIso < EDITION_2027_START_ISO
      ? EDITION_2027_START_ISO
      : verifiedAtIso;

  const hasValidExisting =
    currentEntitlement &&
    currentEntitlement.status !== "revoked" &&
    currentEntitlement.status !== "refunded";

  const isExtendingActive = Boolean(
    hasValidExisting &&
      currentEntitlement.expiresAt &&
      currentEntitlement.expiresAt > effectivePurchaseStart,
  );

  const periodStartAt =
    isExtendingActive && currentEntitlement
      ? currentEntitlement.expiresAt
      : effectivePurchaseStart;

  const periodEndAt = addCalendarMonths(periodStartAt, durationMonths);
  const startsAt =
    isExtendingActive && currentEntitlement
      ? currentEntitlement.startsAt
      : effectivePurchaseStart;

  return {
    startsAt,
    expiresAt: periodEndAt,
    periodStartAt,
    periodEndAt,
    isRenewal: Boolean(currentEntitlement),
  };
}

export type DigitalEntitlementRecord = {
  id: number;
  userId: number;
  purchaseId: number | null;
  editionYear: number;
  accessType: "paid" | "complimentary";
  accessScope: "edition_2027" | "includes_membership_updates";
  status: "scheduled" | "active" | "expired" | "revoked" | "refunded";
  effectiveStatus:
    | "scheduled"
    | "active"
    | "expiring_soon"
    | "expired"
    | "revoked"
    | "refunded";
  active: boolean;
  startsAt: string;
  expiresAt: string;
  daysRemaining: number;
  expiringSoon: boolean;
  durationMonths: number;
  renewalCount: number;
  legacyPersistent: boolean;
  legacyReviewRequired: boolean;
  grantedByAdminId: number | null;
  grantReason: string;
  grantedAt: string;
  revokedAt: string | null;
  revokeReason: string;
  updatedAt: string;
};

function formatDigitalEntitlementRow(
  store: Store,
  row: typeof s.digitalEntitlements.$inferSelect,
  reminderDays: number,
  referenceNowIso?: string,
): DigitalEntitlementRecord {
  const nowIso = referenceNowIso || new Date().toISOString();
  const nowMs = new Date(nowIso).getTime();
  const expiresMs = new Date(row.expiresAt).getTime();

  const isRevoked = row.status === "revoked";
  const isRefunded = row.status === "refunded";
  const isTerminated = isRevoked || isRefunded;

  // Legacy persistent entitlements from before migration 0006 are preserved and never silently shortened.
  // Date-bounded entitlements strictly enforce both start date and expiry date.
  const isNotStarted =
    !isTerminated && !row.legacyPersistent && row.startsAt > nowIso;
  const isExpired =
    !isTerminated && !row.legacyPersistent && row.expiresAt <= nowIso;

  if (isExpired && row.status === "active" && !referenceNowIso) {
    store.db
      .update(s.digitalEntitlements)
      .set({ status: "expired", updatedAt: nowIso })
      .where(eq(s.digitalEntitlements.id, row.id))
      .run();
  }

  const active = !isTerminated && !isNotStarted && !isExpired;
  const daysRemaining = active
    ? Math.max(0, Math.ceil((expiresMs - nowMs) / 86400000))
    : 0;
  const expiringSoon =
    active &&
    !row.legacyPersistent &&
    daysRemaining > 0 &&
    daysRemaining <= reminderDays;

  const status: DigitalEntitlementRecord["status"] = isRevoked
    ? "revoked"
    : isRefunded
      ? "refunded"
      : isExpired
        ? "expired"
        : isNotStarted
          ? "scheduled"
          : "active";

  const effectiveStatus: DigitalEntitlementRecord["effectiveStatus"] = isRevoked
    ? "revoked"
    : isRefunded
      ? "refunded"
      : isExpired
        ? "expired"
        : isNotStarted
          ? "scheduled"
          : expiringSoon
            ? "expiring_soon"
            : "active";

  return {
    id: row.id,
    userId: row.userId,
    purchaseId: row.purchaseId ?? null,
    editionYear: row.editionYear,
    accessType: row.accessType === "complimentary" ? "complimentary" : "paid",
    accessScope:
      row.accessScope === "includes_membership_updates"
        ? "includes_membership_updates"
        : "edition_2027",
    status,
    effectiveStatus,
    active,
    startsAt: row.startsAt,
    expiresAt: row.expiresAt,
    daysRemaining,
    expiringSoon,
    durationMonths: row.durationMonths || 12,
    renewalCount: row.renewalCount || 0,
    legacyPersistent: Boolean(row.legacyPersistent),
    legacyReviewRequired: Boolean(row.legacyReviewRequired),
    grantedByAdminId: row.grantedByAdminId ?? null,
    grantReason: row.grantReason || "",
    grantedAt: row.grantedAt,
    revokedAt: row.revokedAt,
    revokeReason: row.revokeReason,
    updatedAt: row.updatedAt,
  };
}

export function getDigitalEntitlementsMap(
  store: Store,
  editionYear = 2027,
  referenceNowIso?: string,
): Map<number, DigitalEntitlementRecord> {
  const settings = getAppSettings(store);
  const reminderDays = settings.renewalReminderDays || 7;
  const rows = store.db
    .select()
    .from(s.digitalEntitlements)
    .where(eq(s.digitalEntitlements.editionYear, editionYear))
    .all();

  const map = new Map<number, DigitalEntitlementRecord>();
  for (const row of rows) {
    map.set(
      row.userId,
      formatDigitalEntitlementRow(store, row, reminderDays, referenceNowIso),
    );
  }
  return map;
}

export function getUserDigitalEntitlement(
  store: Store,
  userId: number,
  editionYear = 2027,
  referenceNowIso?: string,
): DigitalEntitlementRecord | null {
  const row = store.db
    .select()
    .from(s.digitalEntitlements)
    .where(
      and(
        eq(s.digitalEntitlements.userId, userId),
        eq(s.digitalEntitlements.editionYear, editionYear),
      ),
    )
    .get();
  if (!row) return null;

  const settings = getAppSettings(store);
  return formatDigitalEntitlementRow(
    store,
    row,
    settings.renewalReminderDays || 7,
    referenceNowIso,
  );
}

export function hasActiveDigitalEntitlement(
  store: Store,
  userId: number,
  editionYear = 2027,
  referenceNowIso?: string,
): boolean {
  const ent = getUserDigitalEntitlement(
    store,
    userId,
    editionYear,
    referenceNowIso,
  );
  return Boolean(ent && ent.active);
}

export function getUserDigitalPurchases(store: Store, userId: number) {
  return store.db
    .select()
    .from(s.digitalPurchases)
    .where(eq(s.digitalPurchases.userId, userId))
    .orderBy(desc(s.digitalPurchases.createdAt))
    .all();
}

export async function initiateDigitalPurchase(
  store: Store,
  user: PublicUser,
  input: {
    paymentMethod: "paystack" | "bank_transfer";
    currency?: "NGN" | "USD" | "GBP";
    transferReference?: string;
    payerNote?: string;
    isRenewal?: boolean;
  },
  provider: PaymentProvider,
  appOrigin: string,
) {
  const settings = getAppSettings(store);
  if (settings.digitalEditionAvailability !== "available") {
    throw new HttpError(
      400,
      "The 2027 Digital Edition is currently unavailable for purchase.",
    );
  }

  const existingEntitlement = getUserDigitalEntitlement(store, user.id, 2027);
  const isRenewal = Boolean(input.isRenewal || existingEntitlement);
  const durationMonths = settings.digitalAccessDurationMonths || 12;
  const amountKobo = settings.digitalEditionPriceKobo;
  const now = new Date().toISOString();
  const reference = `BLD_DIG_${Date.now()}_${randomBytes(8).toString("hex")}`;

  if (input.paymentMethod === "bank_transfer") {
    if (!settings.bankTransferEnabled) {
      throw new HttpError(
        503,
        "Direct bank-transfer checkout is not currently enabled. Please use Paystack online checkout when available or contact Cossy Teens Consult Enterprises.",
      );
    }

    const currency = input.currency || "NGN";
    const status = input.transferReference?.trim()
      ? "verifying_transfer"
      : "pending";

    const purchase = store.db
      .insert(s.digitalPurchases)
      .values({
        userId: user.id,
        productCode: "digital_2027",
        productName: isRenewal
          ? "The Balanced Life Devotional — 2027 Online Access (12-Month Renewal)"
          : "The Balanced Life Devotional — 2027 Digital Edition (12-Month Access)",
        amountKobo,
        currency,
        paymentMethod: "bank_transfer",
        reference,
        transferReference: input.transferReference?.trim() || "",
        payerNote: input.payerNote?.trim() || "",
        status,
        durationMonths,
        isRenewal,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    createNotificationEvent(store, {
      userId: user.id,
      category: "digital_purchase",
      title: "Bank-Transfer Order Created (Pending Verification)",
      body: `Order ${reference} for 12-month 2027 Online Access (₦${(amountKobo / 100).toLocaleString("en-NG")}) is awaiting administrator confirmation of settled funds.`,
      actionUrl: "/digital-edition",
      dedupeKey: `dig_order_pending_${purchase.id}`,
    });

    return {
      purchase,
      authorizationUrl: null,
      bankAccounts: settings.bankAccounts,
    };
  }

  // Paystack instant checkout
  if (!provider.configured) {
    throw new HttpError(
      503,
      "Online payment processing via Paystack is not configured in this environment. Set PAYSTACK_SECRET_KEY to enable live or test digital purchases.",
    );
  }

  const initialized = await provider.initializeTransaction({
    email: user.email,
    amountKobo,
    reference,
    callbackUrl: `${appOrigin}/digital-edition?reference=${encodeURIComponent(reference)}`,
    metadata: {
      purchaseType: "digital_edition",
      productCode: "digital_2027",
      userId: user.id,
      isRenewal,
    },
  });

  const purchase = store.db
    .insert(s.digitalPurchases)
    .values({
      userId: user.id,
      productCode: "digital_2027",
      productName: isRenewal
        ? "The Balanced Life Devotional — 2027 Online Access (12-Month Renewal)"
        : "The Balanced Life Devotional — 2027 Digital Edition (12-Month Access)",
      amountKobo,
      currency: "NGN",
      paymentMethod: "paystack",
      reference: initialized.reference,
      authorizationUrl: initialized.authorizationUrl,
      status: "pending",
      durationMonths,
      isRenewal,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();

  return {
    purchase,
    reference: initialized.reference,
    authorizationUrl: initialized.authorizationUrl,
    amountKobo,
  };
}

function activateDigitalEntitlementForPurchase(
  store: Store,
  existingPurchase: typeof s.digitalPurchases.$inferSelect,
  verifiedAtIso: string,
  options: {
    providerTransactionId?: string | null;
    adminId?: number | null;
    adminNotes?: string;
  } = {},
) {
  const { db } = store;
  const settings = getAppSettings(store);
  const now = new Date().toISOString();
  const durationMonths =
    existingPurchase.durationMonths || settings.digitalAccessDurationMonths || 12;

  const currentEnt = db
    .select()
    .from(s.digitalEntitlements)
    .where(
      and(
        eq(s.digitalEntitlements.userId, existingPurchase.userId),
        eq(s.digitalEntitlements.editionYear, 2027),
      ),
    )
    .get();

  const window = computeDigitalTermWindow(
    verifiedAtIso,
    currentEnt,
    durationMonths,
  );

  const purchase = db
    .update(s.digitalPurchases)
    .set({
      status: "succeeded",
      providerTransactionId:
        options.providerTransactionId !== undefined
          ? options.providerTransactionId
          : existingPurchase.providerTransactionId,
      verifiedByAdminId:
        options.adminId !== undefined
          ? options.adminId
          : existingPurchase.verifiedByAdminId,
      adminNotes:
        options.adminNotes !== undefined
          ? options.adminNotes
          : existingPurchase.adminNotes,
      isRenewal: window.isRenewal,
      periodStartAt: window.periodStartAt,
      periodEndAt: window.periodEndAt,
      verifiedAt: verifiedAtIso,
      updatedAt: now,
    })
    .where(eq(s.digitalPurchases.id, existingPurchase.id))
    .returning()
    .get();

  const nextRenewalCount = window.isRenewal
    ? (currentEnt?.renewalCount || 0) + 1
    : 0;

  const entitlementValues = {
    userId: existingPurchase.userId,
    purchaseId: existingPurchase.id,
    editionYear: 2027,
    accessType: "paid" as const,
    accessScope: settings.digitalEditionScope,
    status: "active" as const,
    startsAt: window.startsAt,
    expiresAt: window.expiresAt,
    durationMonths,
    renewalCount: nextRenewalCount,
    legacyPersistent: false,
    legacyReviewRequired: false,
    grantedByAdminId: null,
    grantReason: "",
    grantedAt: currentEnt ? currentEnt.grantedAt : verifiedAtIso,
    revokedAt: null,
    revokeReason: "",
    updatedAt: now,
  };

  db.insert(s.digitalEntitlements)
    .values(entitlementValues)
    .onConflictDoUpdate({
      target: [
        s.digitalEntitlements.userId,
        s.digitalEntitlements.editionYear,
      ],
      set: entitlementValues,
    })
    .run();

  const startDisplay = new Date(window.startsAt).toLocaleDateString("en-GB");
  const expiryDisplay = new Date(window.expiresAt).toLocaleDateString("en-GB");
  const isScheduled = window.startsAt > now;
  createNotificationEvent(store, {
    userId: existingPurchase.userId,
    category: "digital_purchase",
    title: isScheduled
      ? "2027 Online Access Confirmed (Starts Jan 1, 2027)"
      : window.isRenewal
        ? "2027 Online Access Renewed (12 Months)"
        : "2027 Digital Edition Activated (12 Months)",
    body: isScheduled
      ? `Your 12-month online access to The Balanced Life Devotional (2027 Edition) is confirmed and scheduled from ${startDisplay} through ${expiryDisplay}.`
      : `Your 12-month online access to The Balanced Life Devotional (2027 Edition) is active through ${expiryDisplay}.`,
    actionUrl: "/subscription",
    dedupeKey: `dig_purchase_verified_${existingPurchase.id}`,
  });

  const purchaser = db
    .select({ id: s.users.id, name: s.users.name, email: s.users.email })
    .from(s.users)
    .where(eq(s.users.id, existingPurchase.userId))
    .get();
  if (purchaser) {
    const appBaseUrl = getEnvConfig().appOrigin;
    const amountLabel = formatNairaFromKobo(existingPurchase.amountKobo);
    if (window.isRenewal) {
      enqueueEmail(store, {
        userId: purchaser.id,
        recipientEmail: purchaser.email,
        recipientName: purchaser.name,
        templateId: "online_access_renewed",
        category: "transactional",
        dedupeKey: `email_dig_renewed_${existingPurchase.id}`,
        payload: {
          recipientName: purchaser.name,
          startsAt: window.startsAt,
          expiresAt: window.expiresAt,
          amountLabel,
          reference: existingPurchase.reference,
          appBaseUrl,
        },
      });
    } else {
      enqueueEmail(store, {
        userId: purchaser.id,
        recipientEmail: purchaser.email,
        recipientName: purchaser.name,
        templateId: "online_access_confirmed",
        category: "transactional",
        dedupeKey: `email_dig_confirmed_${existingPurchase.id}`,
        payload: {
          recipientName: purchaser.name,
          startsAt: window.startsAt,
          expiresAt: window.expiresAt,
          accessTypeLabel: isScheduled
            ? "2027 Paid Online Access (Starts Jan 1, 2027)"
            : "2027 Paid Online Access",
          amountLabel,
          reference: existingPurchase.reference,
          appBaseUrl,
        },
      });
    }
  }

  return {
    purchase,
    entitlement: getUserDigitalEntitlement(store, existingPurchase.userId, 2027),
  };
}

export async function verifyAndActivateDigitalPurchase(
  store: Store,
  reference: string,
  provider: PaymentProvider,
  requestingUserId?: number,
) {
  const { db } = store;
  const existing = db
    .select()
    .from(s.digitalPurchases)
    .where(eq(s.digitalPurchases.reference, reference))
    .get();

  if (!existing) {
    throw new HttpError(404, "Digital purchase reference not found.");
  }

  if (requestingUserId !== undefined && existing.userId !== requestingUserId) {
    throw new HttpError(
      403,
      "This digital purchase reference belongs to another account.",
    );
  }

  if (existing.paymentMethod !== "paystack") {
    throw new HttpError(
      400,
      "Bank-transfer orders must be verified and reconciled by an administrator after confirming settled funds.",
    );
  }

  if (existing.status === "succeeded") {
    return {
      purchase: existing,
      entitlement: getUserDigitalEntitlement(store, existing.userId, 2027),
      replayed: true,
    };
  }

  const verification = await provider.verifyTransaction(reference);
  const now = new Date().toISOString();

  if (verification.status !== "succeeded") {
    const failedStatus =
      verification.status === "failed" || verification.status === "abandoned"
        ? "failed"
        : "pending";
    const updated = db
      .update(s.digitalPurchases)
      .set({
        status: failedStatus,
        providerTransactionId: verification.providerTransactionId || null,
        updatedAt: now,
      })
      .where(eq(s.digitalPurchases.id, existing.id))
      .returning()
      .get();

    throw new HttpError(
      400,
      `Payment verification returned status: ${verification.status}. Digital Edition entitlement was not activated (${updated.reference}).`,
    );
  }

  if (
    verification.currency !== "NGN" ||
    verification.amountKobo < existing.amountKobo
  ) {
    throw new HttpError(
      400,
      "Verified payment amount or currency did not match the 2027 Digital Edition price.",
    );
  }

  return store.sqlite.transaction(() => {
    const activated = activateDigitalEntitlementForPurchase(
      store,
      existing,
      verification.paidAt || now,
      { providerTransactionId: verification.providerTransactionId },
    );
    return {
      ...activated,
      replayed: false,
    };
  })();
}

export function submitBankTransferProof(
  store: Store,
  userId: number,
  purchaseId: number,
  input: { transferReference: string; payerNote?: string },
) {
  const existing = store.db
    .select()
    .from(s.digitalPurchases)
    .where(
      and(
        eq(s.digitalPurchases.id, purchaseId),
        eq(s.digitalPurchases.userId, userId),
      ),
    )
    .get();

  if (!existing) {
    throw new HttpError(404, "Digital purchase order not found.");
  }
  if (existing.paymentMethod !== "bank_transfer") {
    throw new HttpError(400, "This order is not a bank-transfer purchase.");
  }
  if (existing.status === "succeeded") {
    throw new HttpError(400, "This order has already been verified.");
  }

  const now = new Date().toISOString();
  return store.db
    .update(s.digitalPurchases)
    .set({
      transferReference: input.transferReference.trim(),
      payerNote: input.payerNote?.trim() || existing.payerNote,
      status: "verifying_transfer",
      updatedAt: now,
    })
    .where(eq(s.digitalPurchases.id, purchaseId))
    .returning()
    .get();
}

export function reconcileDigitalPurchaseAdmin(
  store: Store,
  actor: AdminActor,
  purchaseId: number,
  input: {
    action: "approve" | "reject" | "refund" | "revoke";
    adminNotes?: string;
  },
) {
  return store.sqlite.transaction(() => {
    const { db } = store;
    const existing = db
      .select()
      .from(s.digitalPurchases)
      .where(eq(s.digitalPurchases.id, purchaseId))
      .get();

    if (!existing) {
      throw new HttpError(404, "Digital purchase record not found.");
    }

    const now = new Date().toISOString();
    const notes = input.adminNotes?.trim() || existing.adminNotes;

    if (input.action === "approve") {
      if (existing.status === "succeeded") {
        throw new HttpError(
          400,
          "This digital purchase has already been verified and activated.",
        );
      }
      if (existing.status === "refunded") {
        throw new HttpError(400, "Refunded purchases cannot be re-approved.");
      }
      if (
        existing.paymentMethod === "bank_transfer" &&
        !existing.transferReference?.trim() &&
        notes.length < 3
      ) {
        throw new HttpError(
          400,
          "Provide verification notes or a bank transfer reference before approving.",
        );
      }

      const { purchase } = activateDigitalEntitlementForPurchase(
        store,
        existing,
        existing.verifiedAt || now,
        {
          adminId: actor.id,
          adminNotes: notes,
        },
      );

      logAdminAudit(
        store,
        actor,
        `Verified and approved digital purchase ${existing.reference} for user #${existing.userId}${notes ? ` (${notes})` : ""}`,
        "digital_purchase",
        existing.id,
        now,
      );

      return purchase;
    }

    if (input.action === "reject") {
      if (existing.status === "succeeded" || existing.status === "refunded") {
        throw new HttpError(
          400,
          "Settled or refunded purchases cannot be marked rejected. Use Refund or Revoke instead.",
        );
      }

      const updated = db
        .update(s.digitalPurchases)
        .set({
          status: "failed",
          adminNotes: notes,
          verifiedByAdminId: actor.id,
          updatedAt: now,
        })
        .where(eq(s.digitalPurchases.id, purchaseId))
        .returning()
        .get();

      logAdminAudit(
        store,
        actor,
        `Marked digital purchase ${existing.reference} as failed/unverified${notes ? ` (${notes})` : ""}`,
        "digital_purchase",
        existing.id,
        now,
      );

      return updated;
    }

    if (input.action === "refund" && existing.status !== "succeeded") {
      throw new HttpError(
        400,
        "Only succeeded digital purchases can be marked as refunded.",
      );
    }

    // refund or revoke
    const targetStatus = input.action === "refund" ? "refunded" : "revoked";
    const updated = db
      .update(s.digitalPurchases)
      .set({
        status: targetStatus,
        adminNotes: notes,
        verifiedByAdminId: actor.id,
        updatedAt: now,
      })
      .where(eq(s.digitalPurchases.id, purchaseId))
      .returning()
      .get();

    db.update(s.digitalEntitlements)
      .set({
        status: targetStatus,
        revokedAt: now,
        revokeReason: notes || `Marked ${targetStatus} by administrator`,
        updatedAt: now,
      })
      .where(
        and(
          eq(s.digitalEntitlements.userId, existing.userId),
          or(
            eq(s.digitalEntitlements.purchaseId, purchaseId),
            isNull(s.digitalEntitlements.purchaseId),
          ),
        ),
      )
      .run();

    logAdminAudit(
      store,
      actor,
      `${targetStatus === "refunded" ? "Refunded" : "Revoked"} digital purchase ${existing.reference} for user #${existing.userId}${notes ? ` (${notes})` : ""}`,
      "digital_purchase",
      existing.id,
      now,
    );

    createNotificationEvent(store, {
      userId: existing.userId,
      category: "account",
      title: `2027 Online Access ${targetStatus === "refunded" ? "Refunded" : "Revoked"}`,
      body: `Your 2027 online access associated with ${existing.reference} was marked ${targetStatus}${notes ? ` (${notes})` : ""}.`,
      actionUrl: "/subscription",
      dedupeKey: `dig_purchase_${targetStatus}_${existing.id}_${now.slice(0, 16)}`,
    });

    return updated;
  })();
}

export function grantComplimentaryOnlineAccessAdmin(
  store: Store,
  actor: AdminActor,
  targetUserId: number,
  input: {
    months?: number;
    startsAt?: string;
    expiresAt?: string;
    reason: string;
  },
) {
  return store.sqlite.transaction(() => {
    const { db } = store;
    const targetUser = db
      .select()
      .from(s.users)
      .where(eq(s.users.id, targetUserId))
      .get();
    if (!targetUser) {
      throw new HttpError(404, "Reader account not found.");
    }

    const reasonTrimmed = String(input.reason || "").trim();
    if (reasonTrimmed.length < 2) {
      throw new HttpError(400, "Provide a brief reason for complimentary access.");
    }

    const settings = getAppSettings(store);
    const now = new Date().toISOString();
    const durationMonths = Math.max(
      1,
      Math.min(36, input.months || settings.digitalAccessDurationMonths || 12),
    );
    const current = db
      .select()
      .from(s.digitalEntitlements)
      .where(
        and(
          eq(s.digitalEntitlements.userId, targetUserId),
          eq(s.digitalEntitlements.editionYear, 2027),
        ),
      )
      .get();
    const currentSub = db
      .select()
      .from(s.subscriptions)
      .where(eq(s.subscriptions.userId, targetUserId))
      .get();

    let requestedStart = now;
    if (input.startsAt) {
      const parsedStart = new Date(input.startsAt);
      if (Number.isNaN(parsedStart.getTime())) {
        throw new HttpError(400, "Invalid complimentary start date.");
      }
      requestedStart = parsedStart.toISOString();
    }

    const validEntExpiry =
      current &&
      current.status !== "revoked" &&
      current.status !== "refunded" &&
      current.expiresAt > requestedStart
        ? current.expiresAt
        : null;
    const validSubExpiry =
      currentSub &&
      currentSub.status !== "revoked" &&
      currentSub.expiresAt > requestedStart
        ? currentSub.expiresAt
        : null;
    const base =
      validEntExpiry && validSubExpiry
        ? validEntExpiry > validSubExpiry
          ? validEntExpiry
          : validSubExpiry
        : validEntExpiry || validSubExpiry || requestedStart;

    let computedExpiresAt = addCalendarMonths(base, durationMonths);
    if (input.expiresAt) {
      const parsedExp = new Date(input.expiresAt);
      if (Number.isNaN(parsedExp.getTime())) {
        throw new HttpError(400, "Invalid complimentary expiry date.");
      }
      computedExpiresAt = parsedExp.toISOString();
    }
    if (computedExpiresAt <= requestedStart) {
      throw new HttpError(400, "Expiry date must be after start date.");
    }

    const existingStart =
      validEntExpiry && current
        ? current.startsAt
        : validSubExpiry && currentSub
          ? currentSub.startedAt
          : null;
    const effectiveStartsAt =
      !input.startsAt && existingStart ? existingStart : requestedStart;

    const preserveLegacyPersistent = Boolean(
      current?.legacyPersistent &&
        current.status !== "revoked" &&
        current.status !== "refunded" &&
        !input.expiresAt,
    );

    const values = {
      userId: targetUserId,
      purchaseId: current?.purchaseId ?? null,
      editionYear: 2027,
      accessType: "complimentary" as const,
      accessScope: "edition_2027" as const,
      status: "active" as const,
      startsAt: effectiveStartsAt,
      expiresAt: computedExpiresAt,
      durationMonths,
      renewalCount: current ? current.renewalCount : 0,
      legacyPersistent: preserveLegacyPersistent,
      legacyReviewRequired: Boolean(
        preserveLegacyPersistent && current?.legacyReviewRequired,
      ),
      grantedByAdminId: actor.id,
      grantReason: reasonTrimmed,
      grantedAt: now,
      revokedAt: null,
      revokeReason: "",
      updatedAt: now,
    };

    db.insert(s.digitalEntitlements)
      .values(values)
      .onConflictDoUpdate({
        target: [
          s.digitalEntitlements.userId,
          s.digitalEntitlements.editionYear,
        ],
        set: values,
      })
      .run();

    logAdminAudit(
      store,
      actor,
      `Granted complimentary ${durationMonths}-month 2027 online access to ${targetUser.email} until ${new Date(computedExpiresAt).toLocaleDateString("en-GB")} (${reasonTrimmed})`,
      "online_access",
      targetUserId,
      now,
    );

    createNotificationEvent(store, {
      userId: targetUserId,
      category: "digital_purchase",
      title: "Complimentary 2027 Online Access Granted",
      body: `You have been granted complimentary 2027 online access through ${new Date(computedExpiresAt).toLocaleDateString("en-GB")} (${reasonTrimmed}).`,
      actionUrl: "/subscription",
      dedupeKey: `comp_online_access_${targetUserId}_${now.slice(0, 16)}`,
    });

    enqueueEmail(store, {
      userId: targetUserId,
      recipientEmail: targetUser.email,
      recipientName: targetUser.name,
      templateId: "online_access_confirmed",
      category: "transactional",
      dedupeKey: `email_comp_access_${targetUserId}_${now.slice(0, 16)}`,
      payload: {
        recipientName: targetUser.name,
        startsAt: effectiveStartsAt,
        expiresAt: computedExpiresAt,
        accessTypeLabel: "Complimentary 2027 Online Access",
        amountLabel: "Complimentary",
        appBaseUrl: getEnvConfig().appOrigin,
      },
    });

    return getUserDigitalEntitlement(store, targetUserId, 2027);
  })();
}

export function revokeOnlineAccessAdmin(
  store: Store,
  actor: AdminActor,
  targetUserId: number,
  reason: string,
) {
  return store.sqlite.transaction(() => {
    const { db } = store;
    const targetUser = db
      .select()
      .from(s.users)
      .where(eq(s.users.id, targetUserId))
      .get();
    if (!targetUser) {
      throw new HttpError(404, "Reader account not found.");
    }

    const reasonTrimmed = String(reason || "").trim();
    if (reasonTrimmed.length < 2) {
      throw new HttpError(400, "Provide a brief reason for revoking online access.");
    }

    const currentEnt = db
      .select()
      .from(s.digitalEntitlements)
      .where(
        and(
          eq(s.digitalEntitlements.userId, targetUserId),
          eq(s.digitalEntitlements.editionYear, 2027),
        ),
      )
      .get();

    const currentSub = db
      .select()
      .from(s.subscriptions)
      .where(eq(s.subscriptions.userId, targetUserId))
      .get();

    if (!currentEnt && !currentSub) {
      throw new HttpError(
        404,
        "This reader does not have an online access record to revoke.",
      );
    }

    const entAlreadyRevoked =
      !currentEnt ||
      currentEnt.status === "revoked" ||
      currentEnt.status === "refunded";
    const subAlreadyRevoked = !currentSub || currentSub.status === "revoked";
    if (entAlreadyRevoked && subAlreadyRevoked) {
      throw new HttpError(
        400,
        "This reader's online access has already been revoked.",
      );
    }

    const now = new Date().toISOString();
    if (currentEnt && currentEnt.status !== "revoked" && currentEnt.status !== "refunded") {
      db.update(s.digitalEntitlements)
        .set({
          status: "revoked",
          legacyPersistent: false,
          legacyReviewRequired: false,
          revokedAt: now,
          revokeReason: reasonTrimmed,
          updatedAt: now,
        })
        .where(eq(s.digitalEntitlements.id, currentEnt.id))
        .run();
    }

    if (currentSub && currentSub.status !== "revoked") {
      db.update(s.subscriptions)
        .set({
          status: "revoked",
          expiresAt: now,
          cancelAtPeriodEnd: true,
          grantReason: reasonTrimmed || currentSub.grantReason,
          updatedAt: now,
        })
        .where(eq(s.subscriptions.id, currentSub.id))
        .run();
    }

    logAdminAudit(
      store,
      actor,
      `Revoked online access for ${targetUser.email} (${reasonTrimmed})`,
      "online_access",
      targetUserId,
      now,
    );

    createNotificationEvent(store, {
      userId: targetUserId,
      category: "account",
      title: "Online Access Revoked",
      body: `Your 2027 online reading access was revoked by an administrator (${reasonTrimmed}).`,
      actionUrl: "/subscription",
      dedupeKey: `online_access_revoked_${targetUserId}_${now.slice(0, 16)}`,
    });

    return getUserDigitalEntitlement(store, targetUserId, 2027);
  })();
}

// ============================================================================
// PRODUCT B: PRINTED DEVOTIONAL BOOK ORDERS & DELIVERY WORKFLOW
// ============================================================================

export function issuePrintedOrderAccessToken(
  store: Store,
  orderId: number,
  ttlMinutes = 7 * 24 * 60,
): { token: string; expiresAt: string } {
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const expiresAt = new Date(nowMs + ttlMinutes * 60000).toISOString();
  const rawToken = newToken();

  store.db
    .delete(s.printedOrderAccessTokens)
    .where(lte(s.printedOrderAccessTokens.expiresAt, nowIso))
    .run();

  store.db
    .insert(s.printedOrderAccessTokens)
    .values({
      tokenHash: tokenHash(rawToken),
      orderId,
      expiresAt,
      createdAt: nowIso,
    })
    .run();

  return { token: rawToken, expiresAt };
}

export function verifyPrintedOrderAccessToken(
  store: Store,
  orderId: number,
  rawToken?: string | null,
): boolean {
  const cleaned = rawToken?.trim();
  if (!cleaned) return false;
  const nowIso = new Date().toISOString();
  const row = store.db
    .select()
    .from(s.printedOrderAccessTokens)
    .where(
      and(
        eq(s.printedOrderAccessTokens.tokenHash, tokenHash(cleaned)),
        eq(s.printedOrderAccessTokens.orderId, orderId),
        gt(s.printedOrderAccessTokens.expiresAt, nowIso),
      ),
    )
    .get();
  return Boolean(row);
}

export function authorizePrintedOrderAccess(
  store: Store,
  order: { id: number; userId: number | null },
  options: { user?: PublicUser | null; token?: string | null },
) {
  if (
    options.user &&
    options.user.status === "active" &&
    order.userId !== null &&
    order.userId === options.user.id
  ) {
    return;
  }
  if (verifyPrintedOrderAccessToken(store, order.id, options.token)) {
    return;
  }
  throw new HttpError(
    403,
    "You are not authorized to access or modify this printed order. Sign in with the purchasing account or use a valid, unexpired order access token.",
  );
}

export function getPrintedOrderById(store: Store, orderId: number) {
  const order = store.db
    .select()
    .from(s.printedOrders)
    .where(eq(s.printedOrders.id, orderId))
    .get();
  if (!order) return null;
  const items = store.db
    .select()
    .from(s.printedOrderItems)
    .where(eq(s.printedOrderItems.orderId, order.id))
    .all();
  return { ...order, items };
}

export function lookupPrintedOrderAuthorized(
  store: Store,
  orderNumber: string,
  options: { user?: PublicUser | null; token?: string | null },
) {
  const hasToken = Boolean(options.token?.trim());
  const hasUser = Boolean(options.user);
  if (!hasToken && !hasUser) {
    throw new HttpError(
      403,
      "Order lookup requires signing in to the purchasing account or providing a valid, unexpired order access token.",
    );
  }

  const order = store.db
    .select()
    .from(s.printedOrders)
    .where(eq(s.printedOrders.orderNumber, orderNumber.trim().toUpperCase()))
    .get();

  if (!order) {
    throw new HttpError(
      403,
      "Order number or order access token is invalid or has expired.",
    );
  }

  authorizePrintedOrderAccess(store, order, options);
  return getPrintedOrderById(store, order.id)!;
}

export function getUserPrintedOrders(store: Store, user: PublicUser) {
  // Strictly scope to authenticated ownership via userId (never email matching).
  const rows = store.db
    .select()
    .from(s.printedOrders)
    .where(eq(s.printedOrders.userId, user.id))
    .orderBy(desc(s.printedOrders.createdAt))
    .all();

  return rows.map((order) => {
    const items = store.db
      .select()
      .from(s.printedOrderItems)
      .where(eq(s.printedOrderItems.orderId, order.id))
      .all();
    return { ...order, items };
  });
}

export function createPrintedOrder(
  store: Store,
  input: {
    fullName: string;
    email: string;
    phone: string;
    streetAddress: string;
    city: string;
    state: string;
    country?: string;
    deliveryLandmark?: string;
    quantity: number;
    customerDeliveryNotes?: string;
    bulkOrderId?: number | null;
    unitPriceOverrideKobo?: number;
  },
  userId?: number | null,
) {
  return store.sqlite.transaction(() => {
    const settings = getAppSettings(store);
    if (settings.hardcoverAvailability === "out_of_stock") {
      throw new HttpError(
        400,
        "The printed edition is currently out of stock. Please contact Cossy Teens Consult Enterprises.",
      );
    }

    const quantity = Math.max(1, Math.round(input.quantity));
    let stockDeducted = false;
    if (
      settings.hardcoverAvailability === "available" &&
      settings.printedBookStockCount !== null
    ) {
      if (quantity > settings.printedBookStockCount) {
        throw new HttpError(
          400,
          settings.printedBookStockCount === 0
            ? "The printed edition is currently out of confirmed stock."
            : `Only ${settings.printedBookStockCount} printed cop${settings.printedBookStockCount === 1 ? "y is" : "ies are"} currently confirmed in stock.`,
        );
      }
      updateAppSettings(store, {
        printedBookStockCount: settings.printedBookStockCount - quantity,
      });
      stockDeducted = true;
    }

    const unitPriceKobo =
      input.unitPriceOverrideKobo && input.unitPriceOverrideKobo > 0
        ? input.unitPriceOverrideKobo
        : settings.hardcoverPriceKobo;
    const subtotalKobo = unitPriceKobo * quantity;

    // Never invent a delivery fee. Only use defaultDeliveryFeeKobo if administrator explicitly configured fixed_fee mode.
    const hasConfiguredFixedFee =
      settings.deliveryPricingMode === "fixed_fee" &&
      settings.defaultDeliveryFeeKobo !== null &&
      settings.defaultDeliveryFeeKobo >= 0;

    const deliveryFeeKobo = hasConfiguredFixedFee
      ? settings.defaultDeliveryFeeKobo
      : null;
    const deliveryQuoteStatus = hasConfiguredFixedFee
      ? "quoted"
      : "pending_quote";
    const finalTotalKobo =
      deliveryFeeKobo !== null ? subtotalKobo + deliveryFeeKobo : null;
    const fulfillmentStatus = hasConfiguredFixedFee
      ? "awaiting_payment"
      : "awaiting_delivery_quotation";

    const now = new Date().toISOString();
    const datePart = now.slice(0, 10).replace(/-/g, "");
    const orderNumber = `BLD-PRT-${datePart}-${randomBytes(3).toString("hex").toUpperCase()}`;

    const order = store.db
      .insert(s.printedOrders)
      .values({
        orderNumber,
        userId: userId ?? null,
        bulkOrderId: input.bulkOrderId ?? null,
        fullName: input.fullName.trim(),
        email: input.email.trim().toLowerCase(),
        phone: input.phone.trim(),
        streetAddress: input.streetAddress.trim(),
        city: input.city.trim(),
        state: input.state.trim(),
        country: (input.country || "Nigeria").trim(),
        deliveryLandmark: input.deliveryLandmark?.trim() || "",
        quantity,
        unitPriceKobo,
        subtotalKobo,
        deliveryFeeKobo,
        deliveryQuoteStatus,
        deliveryQuoteNote: hasConfiguredFixedFee
          ? "Standard configured delivery fee applied."
          : "Awaiting delivery fee quotation from Cossy Teens Consult.",
        finalTotalKobo,
        currency: "NGN",
        paymentMethod: "unselected",
        paymentStatus: "pending",
        fulfillmentStatus,
        customerDeliveryNotes: input.customerDeliveryNotes?.trim() || "",
        stockDeducted,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    store.db
      .insert(s.printedOrderItems)
      .values({
        orderId: order.id,
        productCode: "printed_2027",
        productTitle: "The Balanced Life Devotional — 2027 Printed Book",
        quantity,
        unitPriceKobo,
        lineTotalKobo: subtotalKobo,
        createdAt: now,
      })
      .run();

    const issuedAccess = issuePrintedOrderAccessToken(store, order.id);

    if (userId) {
      createNotificationEvent(store, {
        userId,
        category: "printed_order",
        title: `Printed Book Order Received (${order.orderNumber})`,
        body: hasConfiguredFixedFee
          ? `Your order for ${quantity} printed copy/copies (subtotal ₦${(subtotalKobo / 100).toLocaleString("en-NG")}) is ready for payment review.`
          : `Your order for ${quantity} printed copy/copies (book subtotal ₦${(subtotalKobo / 100).toLocaleString("en-NG")}) has been received. We will notify you as soon as your delivery quotation is ready.`,
        actionUrl: `/bookstore?order=${encodeURIComponent(order.orderNumber)}`,
        dedupeKey: `printed_order_created_${order.id}`,
      });
    }

    const appBaseUrl = getEnvConfig().appOrigin;
    enqueueEmail(store, {
      userId: userId ?? null,
      recipientEmail: order.email,
      recipientName: order.fullName,
      templateId: "printed_order_received",
      category: "transactional",
      dedupeKey: `email_printed_created_${order.id}`,
      payload: {
        recipientName: order.fullName,
        reference: order.orderNumber,
        quantity,
        subtotalKobo,
        destinationLabel: `${order.city}, ${order.state}`,
        trackingUrl: `${appBaseUrl}/bookstore?order=${encodeURIComponent(order.orderNumber)}&token=${encodeURIComponent(issuedAccess.token)}`,
        appBaseUrl,
      },
    });

    return {
      ...getPrintedOrderById(store, order.id)!,
      orderAccessToken: issuedAccess.token,
      orderAccessTokenExpiresAt: issuedAccess.expiresAt,
    };
  })();
}

export function approvePrintedOrderQuoteCustomer(
  store: Store,
  orderId: number,
  options: { user?: PublicUser | null; token?: string | null },
) {
  const existing = getPrintedOrderById(store, orderId);
  if (!existing) {
    throw new HttpError(404, "Printed book order not found.");
  }

  authorizePrintedOrderAccess(store, existing, options);

  if (existing.fulfillmentStatus === "cancelled") {
    throw new HttpError(400, "This printed book order was cancelled.");
  }
  if (existing.paymentStatus === "paid") {
    throw new HttpError(400, "This printed book order has already been paid.");
  }
  if (existing.deliveryFeeKobo === null || existing.finalTotalKobo === null) {
    throw new HttpError(
      400,
      "Delivery fee quotation has not been finalized for this order yet.",
    );
  }

  const now = new Date().toISOString();
  store.db
    .update(s.printedOrders)
    .set({
      deliveryQuoteStatus: "customer_approved",
      customerApprovedQuoteAt: existing.customerApprovedQuoteAt || now,
      fulfillmentStatus:
        existing.fulfillmentStatus === "awaiting_delivery_quotation" ||
        existing.fulfillmentStatus === "new"
          ? "awaiting_payment"
          : existing.fulfillmentStatus,
      updatedAt: now,
    })
    .where(eq(s.printedOrders.id, orderId))
    .run();

  return getPrintedOrderById(store, orderId)!;
}

export async function initiatePrintedOrderPayment(
  store: Store,
  orderId: number,
  input: {
    paymentMethod: "paystack" | "bank_transfer";
    currency?: "NGN" | "USD" | "GBP";
    transferReference?: string;
    payerNote?: string;
  },
  provider: PaymentProvider,
  appOrigin: string,
  authContext: { user?: PublicUser | null; token?: string | null },
) {
  const existing = getPrintedOrderById(store, orderId);
  if (!existing) {
    throw new HttpError(404, "Printed book order not found.");
  }

  authorizePrintedOrderAccess(store, existing, authContext);

  if (existing.paymentStatus === "paid") {
    throw new HttpError(400, "This printed book order has already been paid.");
  }
  if (existing.fulfillmentStatus === "cancelled") {
    throw new HttpError(400, "This printed book order was cancelled.");
  }
  if (existing.deliveryFeeKobo === null || existing.finalTotalKobo === null) {
    throw new HttpError(
      400,
      "A delivery fee quotation must be provided before payment can be initiated.",
    );
  }
  if (existing.deliveryQuoteStatus !== "customer_approved") {
    throw new HttpError(
      400,
      "Please review and approve the final order total including delivery fee before initiating payment.",
    );
  }

  const settings = getAppSettings(store);
  const now = new Date().toISOString();
  const reference = `BLD_PRT_${Date.now()}_${randomBytes(6).toString("hex")}`;

  if (input.paymentMethod === "bank_transfer") {
    if (!settings.bankTransferEnabled) {
      throw new HttpError(
        503,
        "Direct bank-transfer checkout is not currently enabled. Please use Paystack online checkout when available or contact Cossy Teens Consult Enterprises.",
      );
    }

    const transferRef = input.transferReference?.trim() || "";
    if (transferRef.length < 3) {
      throw new HttpError(
        400,
        "Please provide your bank transfer reference or session ID.",
      );
    }

    store.db
      .update(s.printedOrders)
      .set({
        paymentMethod: "bank_transfer",
        currency: input.currency || "NGN",
        paymentReference: existing.paymentReference || reference,
        transferReference: transferRef,
        payerNote: input.payerNote?.trim() || existing.payerNote,
        paymentStatus: "awaiting_verification",
        fulfillmentStatus: "awaiting_payment",
        updatedAt: now,
      })
      .where(eq(s.printedOrders.id, orderId))
      .run();

    return {
      order: getPrintedOrderById(store, orderId)!,
      authorizationUrl: null,
      reference: existing.paymentReference || reference,
    };
  }

  if (!provider.configured) {
    throw new HttpError(
      503,
      "Online payment processing via Paystack is not configured in this environment. Set PAYSTACK_SECRET_KEY to enable live or test checkout.",
    );
  }

  const initialized = await provider.initializeTransaction({
    email: existing.email,
    amountKobo: existing.finalTotalKobo,
    reference,
    callbackUrl: `${appOrigin}/bookstore?order=${encodeURIComponent(existing.orderNumber)}&reference=${encodeURIComponent(reference)}`,
    metadata: {
      purchaseType: "printed_book_order",
      orderId: existing.id,
      orderNumber: existing.orderNumber,
      quantity: existing.quantity,
    },
  });

  store.db
    .update(s.printedOrders)
    .set({
      paymentMethod: "paystack",
      paymentReference: initialized.reference,
      authorizationUrl: initialized.authorizationUrl,
      paymentStatus: "pending",
      fulfillmentStatus: "awaiting_payment",
      updatedAt: now,
    })
    .where(eq(s.printedOrders.id, orderId))
    .run();

  return {
    order: getPrintedOrderById(store, orderId)!,
    reference: initialized.reference,
    authorizationUrl: initialized.authorizationUrl,
  };
}

export async function verifyPrintedOrderPayment(
  store: Store,
  reference: string,
  provider: PaymentProvider,
  authContext?: {
    user?: PublicUser | null;
    token?: string | null;
    isWebhook?: boolean;
  },
) {
  const existing = store.db
    .select()
    .from(s.printedOrders)
    .where(eq(s.printedOrders.paymentReference, reference))
    .get();

  if (!existing) {
    if (authContext && !authContext.isWebhook && !authContext.user && !authContext.token) {
      throw new HttpError(
        403,
        "You are not authorized to verify this printed order payment.",
      );
    }
    throw new HttpError(404, "Printed book payment reference not found.");
  }

  if (!authContext?.isWebhook) {
    authorizePrintedOrderAccess(store, existing, {
      user: authContext?.user,
      token: authContext?.token,
    });
  }

  if (existing.paymentMethod !== "paystack") {
    throw new HttpError(
      400,
      "Bank-transfer printed orders must be verified by an administrator after confirming settled funds.",
    );
  }

  if (existing.paymentStatus === "paid") {
    return {
      order: getPrintedOrderById(store, existing.id)!,
      replayed: true,
    };
  }

  const verification = await provider.verifyTransaction(reference);
  const now = new Date().toISOString();

  if (verification.status !== "succeeded") {
    const nextPaymentStatus =
      verification.status === "failed" || verification.status === "abandoned"
        ? "failed"
        : "pending";
    store.db
      .update(s.printedOrders)
      .set({
        paymentStatus: nextPaymentStatus,
        providerTransactionId: verification.providerTransactionId || null,
        updatedAt: now,
      })
      .where(eq(s.printedOrders.id, existing.id))
      .run();

    throw new HttpError(
      400,
      `Payment verification returned status: ${verification.status}. Printed order ${existing.orderNumber} was not marked paid.`,
    );
  }

  const expectedAmount = existing.finalTotalKobo ?? existing.subtotalKobo;
  if (
    verification.currency !== "NGN" ||
    verification.amountKobo < expectedAmount
  ) {
    throw new HttpError(
      400,
      "Verified payment amount or currency did not match the approved printed order total.",
    );
  }

  return store.sqlite.transaction(() => {
    const paidAt = verification.paidAt || now;
    store.db
      .update(s.printedOrders)
      .set({
        paymentStatus: "paid",
        providerTransactionId: verification.providerTransactionId,
        paidAt,
        fulfillmentStatus:
          existing.fulfillmentStatus === "new" ||
          existing.fulfillmentStatus === "awaiting_delivery_quotation" ||
          existing.fulfillmentStatus === "awaiting_payment"
            ? "processing"
            : existing.fulfillmentStatus,
        updatedAt: now,
      })
      .where(eq(s.printedOrders.id, existing.id))
      .run();

    if (existing.userId) {
      createNotificationEvent(store, {
        userId: existing.userId,
        category: "printed_order",
        title: `Payment Confirmed · Order ${existing.orderNumber}`,
        body: `Your payment of ₦${(expectedAmount / 100).toLocaleString("en-NG")} for ${existing.quantity} printed copy/copies has been verified. Your order is now being processed for dispatch.`,
        actionUrl: `/bookstore?order=${encodeURIComponent(existing.orderNumber)}`,
        dedupeKey: `printed_order_paid_${existing.id}`,
      });
    }

    const appBaseUrl = getEnvConfig().appOrigin;
    enqueueEmail(store, {
      userId: existing.userId ?? null,
      recipientEmail: existing.email,
      recipientName: existing.fullName,
      templateId: "printed_payment_confirmed",
      category: "transactional",
      dedupeKey: `email_printed_paid_${existing.id}`,
      payload: {
        recipientName: existing.fullName,
        reference: existing.orderNumber,
        quantity: existing.quantity,
        finalTotalKobo: expectedAmount,
        trackingUrl: `${appBaseUrl}/bookstore?order=${encodeURIComponent(existing.orderNumber)}`,
        appBaseUrl,
      },
    });

    return {
      order: getPrintedOrderById(store, existing.id)!,
      replayed: false,
    };
  })();
}

export function updatePrintedOrderAdmin(
  store: Store,
  actor: AdminActor,
  orderId: number,
  input: Partial<{
    deliveryFeeKobo: number | null;
    deliveryQuoteStatus:
      | "pending_quote"
      | "quoted"
      | "customer_approved"
      | "not_required";
    deliveryQuoteNote: string;
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
  }>,
) {
  return store.sqlite.transaction(() => {
    const existing = store.db
      .select()
      .from(s.printedOrders)
      .where(eq(s.printedOrders.id, orderId))
      .get();
    if (!existing) {
      throw new HttpError(404, "Printed book order not found.");
    }

    const now = new Date().toISOString();

    if (
      existing.paymentStatus === "paid" &&
      input.deliveryFeeKobo !== undefined &&
      input.deliveryFeeKobo !== existing.deliveryFeeKobo
    ) {
      throw new HttpError(
        400,
        "Delivery fee cannot be changed after payment has been confirmed.",
      );
    }

    const nextDeliveryFeeKobo =
      input.deliveryFeeKobo === undefined
        ? existing.deliveryFeeKobo
        : input.deliveryFeeKobo;

    const nextFinalTotalKobo =
      nextDeliveryFeeKobo !== null && nextDeliveryFeeKobo !== undefined
        ? existing.subtotalKobo + nextDeliveryFeeKobo
        : null;

    const deliveryFeeChanged =
      input.deliveryFeeKobo !== undefined &&
      input.deliveryFeeKobo !== existing.deliveryFeeKobo;

    let nextQuoteStatus =
      input.deliveryQuoteStatus ?? existing.deliveryQuoteStatus;
    let nextCustomerApprovedAt = existing.customerApprovedQuoteAt;

    if (deliveryFeeChanged) {
      if (nextDeliveryFeeKobo === null) {
        nextQuoteStatus = "pending_quote";
        nextCustomerApprovedAt = null;
      } else if (!input.deliveryQuoteStatus) {
        nextQuoteStatus = "quoted";
        nextCustomerApprovedAt = null;
      }
    }

    const nextPaymentStatus = input.paymentStatus ?? existing.paymentStatus;
    let nextFulfillmentStatus =
      input.fulfillmentStatus ?? existing.fulfillmentStatus;

    // Auto-advance fulfillment status when delivery quote or payment is confirmed
    if (
      !input.fulfillmentStatus &&
      nextQuoteStatus === "quoted" &&
      (existing.fulfillmentStatus === "new" ||
        existing.fulfillmentStatus === "awaiting_delivery_quotation")
    ) {
      nextFulfillmentStatus = "awaiting_payment";
    }
    if (
      !input.fulfillmentStatus &&
      nextPaymentStatus === "paid" &&
      existing.paymentStatus !== "paid" &&
      (existing.fulfillmentStatus === "new" ||
        existing.fulfillmentStatus === "awaiting_delivery_quotation" ||
        existing.fulfillmentStatus === "awaiting_payment")
    ) {
      nextFulfillmentStatus = "processing";
    }

    // Validate status transitions
    const isAlreadyCancelled = existing.fulfillmentStatus === "cancelled";
    const isAlreadyDelivered = existing.fulfillmentStatus === "delivered";
    const isActiveShippingOrProcessing =
      nextFulfillmentStatus === "processing" ||
      nextFulfillmentStatus === "ready_for_dispatch" ||
      nextFulfillmentStatus === "shipped" ||
      nextFulfillmentStatus === "delivered";

    if (isAlreadyCancelled && isActiveShippingOrProcessing) {
      throw new HttpError(
        400,
        "A cancelled printed order cannot be transitioned to processing, dispatched, or delivered.",
      );
    }

    if (
      isAlreadyDelivered &&
      [
        "new",
        "awaiting_delivery_quotation",
        "awaiting_payment",
        "processing",
        "ready_for_dispatch",
      ].includes(nextFulfillmentStatus)
    ) {
      throw new HttpError(
        400,
        "A delivered printed order cannot be reverted to an earlier pending status.",
      );
    }

    if (
      (nextPaymentStatus === "paid" ||
        nextFulfillmentStatus === "awaiting_payment") &&
      (nextDeliveryFeeKobo === null || nextDeliveryFeeKobo === undefined)
    ) {
      throw new HttpError(
        400,
        "Set the delivery fee quotation (use 0 for pickup/free delivery) before moving this order to awaiting payment or paid.",
      );
    }

    if (
      nextPaymentStatus === "refunded" &&
      existing.paymentStatus !== "paid" &&
      existing.paymentStatus !== "refunded"
    ) {
      throw new HttpError(
        400,
        "Only paid printed orders can be marked as refunded.",
      );
    }

    // Enforce backend guard: prevent marking unpaid orders as ready_for_dispatch, shipped, or delivered
    // without an explicit, audited administrative exception note.
    const requiresPaidGuard =
      nextFulfillmentStatus === "ready_for_dispatch" ||
      nextFulfillmentStatus === "shipped" ||
      nextFulfillmentStatus === "delivered";

    const exceptionNote = (
      input.dispatchExceptionNote ?? existing.dispatchExceptionNote
    ).trim();

    if (requiresPaidGuard && nextPaymentStatus !== "paid") {
      if (exceptionNote.length < 5) {
        throw new HttpError(
          400,
          `Cannot mark unpaid printed order as ${nextFulfillmentStatus} without an explicit administrative exception reason.`,
        );
      }
    }

    // Restore confirmed stock if transitioning to cancelled when stock was deducted
    let nextStockDeducted = existing.stockDeducted;
    if (
      nextFulfillmentStatus === "cancelled" &&
      !isAlreadyCancelled &&
      existing.stockDeducted
    ) {
      const settings = getAppSettings(store);
      if (settings.printedBookStockCount !== null) {
        updateAppSettings(store, {
          printedBookStockCount:
            settings.printedBookStockCount + existing.quantity,
        });
      }
      nextStockDeducted = false;
    }

    const paidAt =
      nextPaymentStatus === "paid" && !existing.paidAt ? now : existing.paidAt;
    const refundedAt =
      nextPaymentStatus === "refunded" && !existing.refundedAt
        ? now
        : existing.refundedAt;
    const shippedAt =
      (nextFulfillmentStatus === "shipped" ||
        nextFulfillmentStatus === "delivered") &&
      !existing.shippedAt
        ? now
        : existing.shippedAt;
    const deliveredAt =
      nextFulfillmentStatus === "delivered" && !existing.deliveredAt
        ? now
        : existing.deliveredAt;
    const cancelledAt =
      nextFulfillmentStatus === "cancelled" && !existing.cancelledAt
        ? now
        : existing.cancelledAt;

    store.db
      .update(s.printedOrders)
      .set({
        deliveryFeeKobo: nextDeliveryFeeKobo,
        deliveryQuoteStatus: nextQuoteStatus,
        deliveryQuoteNote:
          input.deliveryQuoteNote ?? existing.deliveryQuoteNote,
        finalTotalKobo: nextFinalTotalKobo,
        customerApprovedQuoteAt: nextCustomerApprovedAt,
        paymentStatus: nextPaymentStatus,
        fulfillmentStatus: nextFulfillmentStatus,
        dispatchExceptionNote: exceptionNote,
        courierName: input.courierName ?? existing.courierName,
        trackingReference:
          input.trackingReference ?? existing.trackingReference,
        customerDeliveryNotes:
          input.customerDeliveryNotes ?? existing.customerDeliveryNotes,
        adminNotes: input.adminNotes ?? existing.adminNotes,
        verifiedByAdminId:
          nextPaymentStatus === "paid" && existing.paymentStatus !== "paid"
            ? actor.id
            : existing.verifiedByAdminId,
        stockDeducted: nextStockDeducted,
        paidAt,
        refundedAt,
        shippedAt,
        deliveredAt,
        cancelledAt,
        updatedAt: now,
      })
      .where(eq(s.printedOrders.id, orderId))
      .run();

    const auditParts = [
      `Order ${existing.orderNumber}: payment=${nextPaymentStatus}, fulfillment=${nextFulfillmentStatus}`,
    ];
    if (nextDeliveryFeeKobo !== existing.deliveryFeeKobo) {
      auditParts.push(
        `deliveryFee=₦${((nextDeliveryFeeKobo || 0) / 100).toLocaleString("en-NG")}`,
      );
    }
    if (requiresPaidGuard && nextPaymentStatus !== "paid") {
      auditParts.push(`UNPAID DISPATCH EXCEPTION: ${exceptionNote}`);
    }

    logAdminAudit(
      store,
      actor,
      auditParts.join(" · "),
      "printed_order",
      existing.id,
      now,
    );

    // Operational notifications & transactional emails for customer
    const appBaseUrl = getEnvConfig().appOrigin;
    const trackingUrl = `${appBaseUrl}/bookstore?order=${encodeURIComponent(existing.orderNumber)}`;
    const destinationLabel = `${existing.city}, ${existing.state}`;

    if (
      nextQuoteStatus === "quoted" &&
      existing.deliveryQuoteStatus !== "quoted" &&
      nextFinalTotalKobo !== null
    ) {
      if (existing.userId) {
        createNotificationEvent(store, {
          userId: existing.userId,
          category: "printed_order",
          title: `Delivery Quotation Ready · ${existing.orderNumber}`,
          body: `Your delivery fee quotation is ready. Total approved amount: ₦${(nextFinalTotalKobo / 100).toLocaleString("en-NG")}. Review and approve to complete your order.`,
          actionUrl: `/bookstore?order=${encodeURIComponent(existing.orderNumber)}`,
          dedupeKey: `printed_order_quoted_${existing.id}_${nextFinalTotalKobo}`,
        });
      }
      enqueueEmail(store, {
        userId: existing.userId ?? null,
        recipientEmail: existing.email,
        recipientName: existing.fullName,
        templateId: "delivery_quotation_ready",
        category: "transactional",
        dedupeKey: `email_printed_quoted_${existing.id}_${nextFinalTotalKobo}`,
        payload: {
          recipientName: existing.fullName,
          reference: existing.orderNumber,
          quantity: existing.quantity,
          subtotalKobo: existing.subtotalKobo,
          deliveryFeeKobo: nextDeliveryFeeKobo ?? 0,
          finalTotalKobo: nextFinalTotalKobo,
          trackingUrl,
          appBaseUrl,
        },
      });
    }

    if (nextPaymentStatus === "paid" && existing.paymentStatus !== "paid") {
      if (existing.userId) {
        createNotificationEvent(store, {
          userId: existing.userId,
          category: "printed_order",
          title: `Payment Verified · ${existing.orderNumber}`,
          body: `Your payment for printed order ${existing.orderNumber} has been verified. Your copies are being prepared for dispatch.`,
          actionUrl: `/bookstore?order=${encodeURIComponent(existing.orderNumber)}`,
          dedupeKey: `printed_order_paid_${existing.id}`,
        });
      }
      enqueueEmail(store, {
        userId: existing.userId ?? null,
        recipientEmail: existing.email,
        recipientName: existing.fullName,
        templateId: "printed_payment_confirmed",
        category: "transactional",
        dedupeKey: `email_printed_paid_${existing.id}`,
        payload: {
          recipientName: existing.fullName,
          reference: existing.orderNumber,
          quantity: existing.quantity,
          finalTotalKobo:
            nextFinalTotalKobo ??
            existing.finalTotalKobo ??
            existing.subtotalKobo,
          trackingUrl,
          appBaseUrl,
        },
      });
    }

    if (
      nextFulfillmentStatus === "shipped" &&
      existing.fulfillmentStatus !== "shipped"
    ) {
      const courierText = (input.courierName ?? existing.courierName).trim();
      const trackingText = (
        input.trackingReference ?? existing.trackingReference
      ).trim();
      if (existing.userId) {
        createNotificationEvent(store, {
          userId: existing.userId,
          category: "printed_order",
          title: `Order Dispatched · ${existing.orderNumber}`,
          body: `Your printed devotional order (${existing.quantity} copy/copies) has been dispatched${courierText ? ` via ${courierText}` : ""}${trackingText ? ` (Ref: ${trackingText})` : ""}.`,
          actionUrl: `/bookstore?order=${encodeURIComponent(existing.orderNumber)}`,
          dedupeKey: `printed_order_shipped_${existing.id}`,
        });
      }
      enqueueEmail(store, {
        userId: existing.userId ?? null,
        recipientEmail: existing.email,
        recipientName: existing.fullName,
        templateId: "order_dispatched",
        category: "transactional",
        dedupeKey: `email_printed_shipped_${existing.id}`,
        payload: {
          recipientName: existing.fullName,
          reference: existing.orderNumber,
          courierName: courierText || "Assigned Courier",
          trackingReference: trackingText || undefined,
          destinationLabel,
          trackingUrl,
          appBaseUrl,
        },
      });
    }

    if (
      nextFulfillmentStatus === "delivered" &&
      existing.fulfillmentStatus !== "delivered"
    ) {
      if (existing.userId) {
        createNotificationEvent(store, {
          userId: existing.userId,
          category: "printed_order",
          title: `Order Delivered · ${existing.orderNumber}`,
          body: `Your printed devotional order ${existing.orderNumber} has been marked as delivered. Thank you for growing with The Balanced Life Devotional!`,
          actionUrl: `/bookstore?order=${encodeURIComponent(existing.orderNumber)}`,
          dedupeKey: `printed_order_delivered_${existing.id}`,
        });
      }
      enqueueEmail(store, {
        userId: existing.userId ?? null,
        recipientEmail: existing.email,
        recipientName: existing.fullName,
        templateId: "order_delivered",
        category: "transactional",
        dedupeKey: `email_printed_delivered_${existing.id}`,
        payload: {
          recipientName: existing.fullName,
          reference: existing.orderNumber,
          trackingUrl,
          appBaseUrl,
        },
      });
    }

    return getPrintedOrderById(store, orderId)!;
  })();
}

// ============================================================================
// BULK & INSTITUTIONAL ORDERS
// ============================================================================

export function createBulkOrder(
  store: Store,
  input: {
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
    preferredFormat?: "printed" | "digital" | "mixed";
    deliveryLocation: string;
    notes?: string;
  },
  userId?: number | null,
) {
  const settings = getAppSettings(store);
  const format = input.preferredFormat || "printed";
  const unitPriceKobo =
    format === "digital"
      ? settings.digitalEditionPriceKobo
      : settings.hardcoverPriceKobo;
  const now = new Date().toISOString();

  return store.db
    .insert(s.bulkOrders)
    .values({
      userId: userId ?? null,
      contactName: input.contactName.trim(),
      organizationName: input.organizationName.trim(),
      organizationType: input.organizationType,
      email: input.email.trim(),
      phone: input.phone.trim(),
      quantity: input.quantity,
      preferredFormat: format,
      deliveryLocation: input.deliveryLocation.trim(),
      notes: input.notes?.trim() || "",
      status: "new",
      unitPriceKobo,
      discountPercent: null,
      quotedTotalKobo: null,
      agreedTotalKobo: null,
      quotationSummary: "",
      fulfillmentStatus: "pending",
      trackingNote: "",
      contactHistory: "",
      linkedPrintedOrderId: null,
      adminNotes: "",
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
}

export function updateBulkOrderAdmin(
  store: Store,
  actor: AdminActor,
  orderId: number,
  input: Partial<{
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
    contactHistory: string;
    adminNotes: string;
    convertToPrintedOrder: boolean;
  }>,
) {
  return store.sqlite.transaction(() => {
    const existing = store.db
      .select()
      .from(s.bulkOrders)
      .where(eq(s.bulkOrders.id, orderId))
      .get();

    if (!existing) {
      throw new HttpError(404, "Bulk order inquiry not found.");
    }

    const now = new Date().toISOString();
    const unitPriceKobo = input.unitPriceKobo ?? existing.unitPriceKobo;
    const discountPercent =
      input.discountPercent === undefined
        ? existing.discountPercent
        : input.discountPercent;

    let quotedTotalKobo =
      input.quotedTotalKobo === undefined
        ? existing.quotedTotalKobo
        : input.quotedTotalKobo;
    if (
      input.discountPercent !== undefined &&
      input.quotedTotalKobo === undefined &&
      discountPercent !== null
    ) {
      const gross = unitPriceKobo * existing.quantity;
      quotedTotalKobo = Math.round(gross * (1 - discountPercent / 100));
    }

    let linkedPrintedOrderId = existing.linkedPrintedOrderId;
    const nextStatus = input.status ?? existing.status;

    if (
      (input.convertToPrintedOrder || nextStatus === "converted") &&
      !linkedPrintedOrderId
    ) {
      const agreedTotal =
        input.agreedTotalKobo ??
        existing.agreedTotalKobo ??
        quotedTotalKobo ??
        unitPriceKobo * existing.quantity;
      const effectiveUnitKobo = Math.max(
        100,
        Math.round(agreedTotal / Math.max(1, existing.quantity)),
      );
      const createdOrder = createPrintedOrder(
        store,
        {
          fullName: `${existing.contactName} (${existing.organizationName})`,
          email: existing.email,
          phone: existing.phone,
          streetAddress: existing.deliveryLocation,
          city: existing.deliveryLocation,
          state: "Nigeria",
          country: "Nigeria",
          quantity: existing.quantity,
          customerDeliveryNotes: existing.notes,
          bulkOrderId: existing.id,
          unitPriceOverrideKobo: effectiveUnitKobo,
        },
        existing.userId,
      );
      linkedPrintedOrderId = createdOrder.id;
    }

    const updated = store.db
      .update(s.bulkOrders)
      .set({
        status: nextStatus,
        unitPriceKobo,
        discountPercent,
        quotedTotalKobo,
        agreedTotalKobo:
          input.agreedTotalKobo === undefined
            ? existing.agreedTotalKobo
            : input.agreedTotalKobo,
        quotationSummary: input.quotationSummary ?? existing.quotationSummary,
        fulfillmentStatus:
          input.fulfillmentStatus ?? existing.fulfillmentStatus,
        trackingNote: input.trackingNote ?? existing.trackingNote,
        contactHistory: input.contactHistory ?? existing.contactHistory,
        linkedPrintedOrderId,
        adminNotes: input.adminNotes ?? existing.adminNotes,
        updatedAt: now,
      })
      .where(eq(s.bulkOrders.id, orderId))
      .returning()
      .get();

    logAdminAudit(
      store,
      actor,
      `Updated bulk order #${orderId} (${existing.organizationName}, ${existing.quantity} copies) -> status=${updated.status}, fulfillment=${updated.fulfillmentStatus}${linkedPrintedOrderId ? `, linkedPrintedOrder=#${linkedPrintedOrderId}` : ""}`,
      "bulk_order",
      orderId,
      now,
    );

    return updated;
  })();
}

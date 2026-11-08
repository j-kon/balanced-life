import { and, desc, eq, gt } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import type { Store } from "../db.js";
import * as s from "../schema.js";
import { HttpError } from "../errors.js";
import type { PaymentProvider } from "./payments.js";
import type { PublicUser } from "../auth.js";
import { hasActiveDigitalEntitlement } from "./commerce.js";
import { createNotificationEvent } from "./notifications.js";

export function addMonths(date: string, months: number): string {
  const value = new Date(date);
  const day = value.getUTCDate();
  value.setUTCDate(1);
  value.setUTCMonth(value.getUTCMonth() + months);
  const last = new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0),
  ).getUTCDate();
  value.setUTCDate(Math.min(day, last));
  return value.toISOString();
}

export type EnrichedSubscription = {
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

export function getSubscriptionDetails(
  store: Store,
  userId: number,
  reminderDays = 7,
): EnrichedSubscription | null {
  const { db } = store;
  const row = db
    .select({
      id: s.subscriptions.id,
      userId: s.subscriptions.userId,
      planId: s.subscriptions.planId,
      planName: s.plans.name,
      planMonths: s.plans.months,
      planAmountKobo: s.plans.amountKobo,
      accessType: s.subscriptions.accessType,
      status: s.subscriptions.status,
      startedAt: s.subscriptions.startedAt,
      expiresAt: s.subscriptions.expiresAt,
      renewalMode: s.subscriptions.renewalMode,
      cancelAtPeriodEnd: s.subscriptions.cancelAtPeriodEnd,
      grantReason: s.subscriptions.grantReason,
    })
    .from(s.subscriptions)
    .innerJoin(s.plans, eq(s.plans.id, s.subscriptions.planId))
    .where(eq(s.subscriptions.userId, userId))
    .get();

  if (!row) return null;

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const expiresMs = new Date(row.expiresAt).getTime();
  const isRevoked = row.status === "revoked";
  const isExpired = !isRevoked && row.expiresAt <= nowIso;

  // Persist transition to expired if the clock has passed expiresAt
  if (isExpired && row.status !== "expired") {
    db.update(s.subscriptions)
      .set({ status: "expired", updatedAt: nowIso })
      .where(eq(s.subscriptions.id, row.id))
      .run();
  }

  const active = !isRevoked && !isExpired;
  const effectiveStatus: EnrichedSubscription["effectiveStatus"] = isRevoked
    ? "revoked"
    : isExpired
      ? "expired"
      : row.cancelAtPeriodEnd || row.status === "cancelled"
        ? "cancelling"
        : "active";

  const daysRemaining = active
    ? Math.max(0, Math.ceil((expiresMs - nowMs) / 86400000))
    : 0;

  let renewalReminder: EnrichedSubscription["renewalReminder"] = null;
  if (isExpired) {
    renewalReminder = {
      dueSoon: false,
      expired: true,
      daysRemaining: 0,
      message: `Your ${row.planName.toLowerCase()} membership expired on ${new Date(row.expiresAt).toLocaleDateString("en-GB")}. Renew to restore full access to all 2027 devotionals.`,
    };
  } else if (active && daysRemaining <= reminderDays) {
    renewalReminder = {
      dueSoon: true,
      expired: false,
      daysRemaining,
      message: row.cancelAtPeriodEnd
        ? `Your membership is scheduled to end in ${daysRemaining} day${daysRemaining === 1 ? "" : "s"} (${new Date(row.expiresAt).toLocaleDateString("en-GB")}). You will retain full access until then.`
        : `Your ${row.planName.toLowerCase()} membership renews or expires in ${daysRemaining} day${daysRemaining === 1 ? "" : "s"} (${new Date(row.expiresAt).toLocaleDateString("en-GB")}).`,
    };
  }

  return {
    id: row.id,
    userId: row.userId,
    planId: row.planId,
    planName: row.planName,
    planMonths: row.planMonths,
    planAmountKobo: row.planAmountKobo,
    accessType: row.accessType === "complimentary" ? "complimentary" : "paid",
    status: isExpired
      ? "expired"
      : (row.status as EnrichedSubscription["status"]),
    effectiveStatus,
    active,
    startedAt: row.startedAt,
    expiresAt: row.expiresAt,
    renewalMode: row.renewalMode === "automatic" ? "automatic" : "manual",
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    grantReason: row.grantReason,
    daysRemaining,
    renewalReminder,
  };
}

export function hasSubscriptionAccess(
  store: Store,
  user: PublicUser | null,
): boolean {
  if (!user || user.status === "suspended") return false;
  if (user.role === "admin") return true;
  const now = new Date().toISOString();
  const sub = store.db
    .select()
    .from(s.subscriptions)
    .where(
      and(
        eq(s.subscriptions.userId, user.id),
        gt(s.subscriptions.expiresAt, now),
      ),
    )
    .get();
  return Boolean(sub && sub.status !== "revoked");
}

export function hasPremiumAccess(
  store: Store,
  user: PublicUser | null,
): boolean {
  if (!user || user.status === "suspended") return false;
  if (user.role === "admin") return true;
  if (hasSubscriptionAccess(store, user)) return true;
  return hasActiveDigitalEntitlement(store, user.id, 2027);
}

export function grantComplimentaryAccess(
  store: Store,
  adminId: number,
  targetUserId: number,
  input: { planId: number; reason: string },
) {
  return store.sqlite.transaction(() => {
    const { db } = store;
    const targetUser = db
      .select()
      .from(s.users)
      .where(eq(s.users.id, targetUserId))
      .get();
    if (!targetUser) throw new HttpError(404, "Reader account not found.");

    const plan = db
      .select()
      .from(s.plans)
      .where(eq(s.plans.id, input.planId))
      .get();
    if (!plan) throw new HttpError(404, "Subscription plan not found.");

    const now = new Date().toISOString();
    const current = db
      .select()
      .from(s.subscriptions)
      .where(eq(s.subscriptions.userId, targetUserId))
      .get();

    const base =
      current && current.status !== "revoked" && current.expiresAt > now
        ? current.expiresAt
        : now;

    const values = {
      userId: targetUserId,
      planId: plan.id,
      accessType: "complimentary" as const,
      status: "active" as const,
      startedAt:
        current && current.status !== "revoked" && current.expiresAt > now
          ? current.startedAt
          : now,
      expiresAt: addMonths(base, plan.months),
      renewalMode: "manual" as const,
      cancelAtPeriodEnd: false,
      grantedByAdminId: adminId,
      grantReason: input.reason,
      updatedAt: now,
    };

    db.insert(s.subscriptions)
      .values(values)
      .onConflictDoUpdate({ target: s.subscriptions.userId, set: values })
      .run();

    db.insert(s.auditLogs)
      .values({
        adminId,
        action: `Granted complimentary ${plan.name} access to ${targetUser.email} (${input.reason})`,
        createdAt: now,
      })
      .run();

    createNotificationEvent(store, {
      userId: targetUserId,
      category: "subscription",
      title: `Complimentary ${plan.name} Membership Activated`,
      body: `You have been granted complimentary ${plan.name.toLowerCase()} membership access (${input.reason}).`,
      actionUrl: "/subscription",
      dedupeKey: `comp_grant_${targetUserId}_${now.slice(0, 16)}`,
    });

    return getSubscriptionDetails(store, targetUserId);
  })();
}

export function revokeSubscriptionAccess(
  store: Store,
  adminId: number,
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
    if (!targetUser) throw new HttpError(404, "Reader account not found.");

    const current = db
      .select()
      .from(s.subscriptions)
      .where(eq(s.subscriptions.userId, targetUserId))
      .get();
    if (!current) {
      throw new HttpError(404, "This reader does not have a membership record.");
    }

    const now = new Date().toISOString();
    db.update(s.subscriptions)
      .set({
        status: "revoked",
        expiresAt: now,
        cancelAtPeriodEnd: true,
        grantReason: reason || current.grantReason,
        updatedAt: now,
      })
      .where(eq(s.subscriptions.userId, targetUserId))
      .run();

    db.insert(s.auditLogs)
      .values({
        adminId,
        action: `Revoked membership access for ${targetUser.email} (${reason})`,
        createdAt: now,
      })
      .run();

    createNotificationEvent(store, {
      userId: targetUserId,
      category: "account",
      title: "Membership Access Updated",
      body: `Your membership access was revoked by an administrator${reason ? ` (${reason})` : ""}.`,
      actionUrl: "/subscription",
      dedupeKey: `sub_revoked_${targetUserId}_${now.slice(0, 16)}`,
    });

    return getSubscriptionDetails(store, targetUserId);
  })();
}

export async function initiatePaystackCheckout(
  store: Store,
  user: PublicUser,
  input: { planId: number; renewalMode: "manual" | "automatic" },
  provider: PaymentProvider,
  appOrigin: string,
) {
  if (!provider.configured) {
    throw new HttpError(
      503,
      "Online payment processing via Paystack is not configured yet. Please contact the administrator or configure PAYSTACK_SECRET_KEY.",
    );
  }
  const { db } = store;
  const plan = db
    .select()
    .from(s.plans)
    .where(eq(s.plans.id, input.planId))
    .get();
  if (!plan || !plan.active) {
    throw new HttpError(400, "This subscription plan is not available.");
  }

  const reference = `BLD_${Date.now()}_${randomBytes(8).toString("hex")}`;
  const now = new Date().toISOString();

  const initialized = await provider.initializeTransaction({
    email: user.email,
    amountKobo: plan.amountKobo,
    reference,
    callbackUrl: `${appOrigin}/subscription?reference=${encodeURIComponent(reference)}`,
    metadata: {
      userId: user.id,
      planId: plan.id,
      planName: plan.name,
      renewalMode: input.renewalMode,
    },
  });

  db.insert(s.payments)
    .values({
      userId: user.id,
      planId: plan.id,
      planName: plan.name,
      amountKobo: plan.amountKobo,
      currency: "NGN",
      reference: initialized.reference,
      provider: provider.name,
      status: "pending",
      renewalMode: input.renewalMode,
      authorizationUrl: initialized.authorizationUrl,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  return {
    reference: initialized.reference,
    authorizationUrl: initialized.authorizationUrl,
    amountKobo: plan.amountKobo,
    planName: plan.name,
  };
}

export async function verifyAndActivatePayment(
  store: Store,
  reference: string,
  provider: PaymentProvider,
  requestingUserId?: number,
) {
  const { db } = store;
  const existingPayment = db
    .select()
    .from(s.payments)
    .where(eq(s.payments.reference, reference))
    .get();

  if (!existingPayment) {
    throw new HttpError(404, "Payment transaction reference not found.");
  }
  if (
    requestingUserId !== undefined &&
    existingPayment.userId !== requestingUserId
  ) {
    throw new HttpError(
      403,
      "This payment reference belongs to another account.",
    );
  }

  // Idempotent replay if already succeeded
  if (existingPayment.status === "succeeded") {
    return {
      subscription: getSubscriptionDetails(store, existingPayment.userId),
      payment: existingPayment,
      replayed: true,
    };
  }

  const verification = await provider.verifyTransaction(reference);
  const now = new Date().toISOString();

  if (verification.status !== "succeeded") {
    const updated = db
      .update(s.payments)
      .set({
        status: verification.status,
        providerTransactionId: verification.providerTransactionId || null,
        updatedAt: now,
      })
      .where(eq(s.payments.id, existingPayment.id))
      .returning()
      .get();

    throw new HttpError(
      400,
      `Payment verification returned status: ${updated.status}. Membership was not activated.`,
    );
  }

  if (
    verification.currency !== "NGN" ||
    verification.amountKobo < existingPayment.amountKobo
  ) {
    throw new HttpError(
      400,
      "Verified payment amount or currency did not match the selected plan.",
    );
  }

  return store.sqlite.transaction(() => {
    const plan = db
      .select()
      .from(s.plans)
      .where(eq(s.plans.id, existingPayment.planId))
      .get();
    if (!plan) throw new HttpError(400, "Associated plan no longer exists.");

    const current = db
      .select()
      .from(s.subscriptions)
      .where(eq(s.subscriptions.userId, existingPayment.userId))
      .get();

    const base =
      current && current.status !== "revoked" && current.expiresAt > now
        ? current.expiresAt
        : now;

    const subValues = {
      userId: existingPayment.userId,
      planId: plan.id,
      accessType: "paid" as const,
      status: "active" as const,
      startedAt:
        current && current.status !== "revoked" && current.expiresAt > now
          ? current.startedAt
          : now,
      expiresAt: addMonths(base, plan.months),
      renewalMode: existingPayment.renewalMode as "manual" | "automatic",
      cancelAtPeriodEnd: false,
      providerSubscriptionCode: verification.subscriptionCode || null,
      grantedByAdminId: null,
      grantReason: "",
      updatedAt: now,
    };

    const subscriptionRow = db
      .insert(s.subscriptions)
      .values(subValues)
      .onConflictDoUpdate({
        target: s.subscriptions.userId,
        set: subValues,
      })
      .returning()
      .get();

    const payment = db
      .update(s.payments)
      .set({
        subscriptionId: subscriptionRow.id,
        status: "succeeded",
        providerTransactionId: verification.providerTransactionId,
        verifiedAt: verification.paidAt || now,
        updatedAt: now,
      })
      .where(eq(s.payments.id, existingPayment.id))
      .returning()
      .get();

    createNotificationEvent(store, {
      userId: existingPayment.userId,
      category: "subscription",
      title: `${plan.name} Membership Activated`,
      body: `Your ${plan.name.toLowerCase()} membership payment (${existingPayment.reference}) has been verified.`,
      actionUrl: "/subscription",
      dedupeKey: `sub_payment_verified_${existingPayment.id}`,
    });

    return {
      subscription: getSubscriptionDetails(store, existingPayment.userId),
      payment,
      replayed: false,
    };
  })();
}

export function getUserPayments(store: Store, userId: number) {
  return store.db
    .select()
    .from(s.payments)
    .where(eq(s.payments.userId, userId))
    .orderBy(desc(s.payments.createdAt))
    .all();
}


import { and, desc, eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import type { Store } from "../db.js";
import * as s from "../schema.js";
import { HttpError } from "../errors.js";
import type { PaymentProvider } from "./payments.js";
import type { PublicUser } from "../auth.js";
import { getAppSettings } from "./settings.js";
import { createNotificationEvent } from "./notifications.js";

export type DigitalEntitlementRecord = {
  id: number;
  userId: number;
  purchaseId: number;
  editionYear: number;
  accessScope: "edition_2027" | "includes_membership_updates";
  status: "active" | "revoked" | "refunded";
  grantedAt: string;
  revokedAt: string | null;
  revokeReason: string;
  updatedAt: string;
};

export function getUserDigitalEntitlement(
  store: Store,
  userId: number,
  editionYear = 2027,
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
  return {
    id: row.id,
    userId: row.userId,
    purchaseId: row.purchaseId,
    editionYear: row.editionYear,
    accessScope:
      row.accessScope === "includes_membership_updates"
        ? "includes_membership_updates"
        : "edition_2027",
    status:
      row.status === "revoked" || row.status === "refunded"
        ? row.status
        : "active",
    grantedAt: row.grantedAt,
    revokedAt: row.revokedAt,
    revokeReason: row.revokeReason,
    updatedAt: row.updatedAt,
  };
}

export function hasActiveDigitalEntitlement(
  store: Store,
  userId: number,
  editionYear = 2027,
): boolean {
  const ent = getUserDigitalEntitlement(store, userId, editionYear);
  return Boolean(ent && ent.status === "active");
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

  if (hasActiveDigitalEntitlement(store, user.id, 2027)) {
    throw new HttpError(
      400,
      "Your account already has active access to the 2027 Digital Edition.",
    );
  }

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
        productName: "The Balanced Life Devotional — 2027 Digital Edition",
        amountKobo,
        currency,
        paymentMethod: "bank_transfer",
        reference,
        transferReference: input.transferReference?.trim() || "",
        payerNote: input.payerNote?.trim() || "",
        status,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    createNotificationEvent(store, {
      userId: user.id,
      category: "digital_purchase",
      title: "Bank-Transfer Order Created (Pending Verification)",
      body: `Order ${reference} for the 2027 Digital Edition (₦${(amountKobo / 100).toLocaleString("en-NG")}) is awaiting administrator confirmation of settled funds.`,
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
    },
  });

  const purchase = store.db
    .insert(s.digitalPurchases)
    .values({
      userId: user.id,
      productCode: "digital_2027",
      productName: "The Balanced Life Devotional — 2027 Digital Edition",
      amountKobo,
      currency: "NGN",
      paymentMethod: "paystack",
      reference: initialized.reference,
      authorizationUrl: initialized.authorizationUrl,
      status: "pending",
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

  // Idempotent replay if already verified & succeeded
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

  const settings = getAppSettings(store);

  return store.sqlite.transaction(() => {
    const purchase = db
      .update(s.digitalPurchases)
      .set({
        status: "succeeded",
        providerTransactionId: verification.providerTransactionId,
        verifiedAt: verification.paidAt || now,
        updatedAt: now,
      })
      .where(eq(s.digitalPurchases.id, existing.id))
      .returning()
      .get();

    const entitlementValues = {
      userId: existing.userId,
      purchaseId: existing.id,
      editionYear: 2027,
      accessScope: settings.digitalEditionScope,
      status: "active" as const,
      grantedAt: now,
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

    createNotificationEvent(store, {
      userId: existing.userId,
      category: "digital_purchase",
      title: "2027 Digital Edition Activated",
      body: "Your one-time purchase of The Balanced Life Devotional (2027 Digital Edition) has been verified. You now have persistent online access from your reader dashboard.",
      actionUrl: "/dashboard",
      dedupeKey: `dig_purchase_verified_${existing.id}`,
    });

    return {
      purchase,
      entitlement: getUserDigitalEntitlement(store, existing.userId, 2027),
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
  // Never automatically mark a bank-transfer order as paid — status stays verifying_transfer until admin confirms settled funds
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
  adminId: number,
  purchaseId: number,
  input: {
    action: "approve" | "reject" | "refund" | "revoke";
    adminNotes?: string;
  },
) {
  const settings = getAppSettings(store);
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
      const updated = db
        .update(s.digitalPurchases)
        .set({
          status: "succeeded",
          adminNotes: notes,
          verifiedByAdminId: adminId,
          verifiedAt: existing.verifiedAt || now,
          updatedAt: now,
        })
        .where(eq(s.digitalPurchases.id, purchaseId))
        .returning()
        .get();

      const entitlementValues = {
        userId: existing.userId,
        purchaseId: existing.id,
        editionYear: 2027,
        accessScope: settings.digitalEditionScope,
        status: "active" as const,
        grantedAt: now,
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

      db.insert(s.auditLogs)
        .values({
          adminId,
          action: `Verified and approved digital purchase ${existing.reference} for user #${existing.userId}${notes ? ` (${notes})` : ""}`,
          createdAt: now,
        })
        .run();

      createNotificationEvent(store, {
        userId: existing.userId,
        category: "digital_purchase",
        title: "2027 Digital Edition Activated",
        body: "Your payment for the 2027 Digital Edition has been confirmed. Full online access is now active in your reader dashboard.",
        actionUrl: "/dashboard",
        dedupeKey: `dig_purchase_verified_${existing.id}`,
      });

      return updated;
    }

    if (input.action === "reject") {
      const updated = db
        .update(s.digitalPurchases)
        .set({
          status: "failed",
          adminNotes: notes,
          verifiedByAdminId: adminId,
          updatedAt: now,
        })
        .where(eq(s.digitalPurchases.id, purchaseId))
        .returning()
        .get();

      db.insert(s.auditLogs)
        .values({
          adminId,
          action: `Marked digital purchase ${existing.reference} as failed/unverified${notes ? ` (${notes})` : ""}`,
          createdAt: now,
        })
        .run();

      return updated;
    }

    // refund or revoke
    const targetStatus = input.action === "refund" ? "refunded" : "revoked";
    const updated = db
      .update(s.digitalPurchases)
      .set({
        status: targetStatus,
        adminNotes: notes,
        verifiedByAdminId: adminId,
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
      .where(eq(s.digitalEntitlements.purchaseId, purchaseId))
      .run();

    db.insert(s.auditLogs)
      .values({
        adminId,
        action: `${targetStatus === "refunded" ? "Refunded" : "Revoked"} digital purchase ${existing.reference} for user #${existing.userId}${notes ? ` (${notes})` : ""}`,
        createdAt: now,
      })
      .run();

    return updated;
  })();
}

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

  // Do not invent a bulk-discount percentage; leave discountPercent null until admin configures quote
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
      adminNotes: "",
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
}

export function updateBulkOrderAdmin(
  store: Store,
  adminId: number,
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
    adminNotes: string;
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

    // If discountPercent is set and quotedTotalKobo isn't explicitly overridden, compute quotedTotalKobo
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

    const updated = store.db
      .update(s.bulkOrders)
      .set({
        status: input.status ?? existing.status,
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
        adminNotes: input.adminNotes ?? existing.adminNotes,
        updatedAt: now,
      })
      .where(eq(s.bulkOrders.id, orderId))
      .returning()
      .get();

    store.db
      .insert(s.auditLogs)
      .values({
        adminId,
        action: `Updated bulk order #${orderId} (${existing.organizationName}, ${existing.quantity} copies) -> status=${updated.status}, fulfillment=${updated.fulfillmentStatus}`,
        createdAt: now,
      })
      .run();

    return updated;
  })();
}


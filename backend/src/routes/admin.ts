import type { FastifyInstance } from "fastify";
import { and, asc, desc, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import type { Store } from "../db.js";
import * as s from "../schema.js";
import {
  ADMIN_ROLES,
  GRANTABLE_CUSTOM_PERMISSIONS,
  adminHasPermission,
  assertStrongAdminPassword,
  hashPassword,
  logAdminAudit,
  parseCustomAdminPermissions,
  requireAdminPermission,
  requireOwner,
  type AdminActor,
  type PublicAdmin,
} from "../auth.js";
import { HttpError } from "../errors.js";
import {
  adminBulkOrderUpdateSchema,
  adminEmailCampaignSchema,
  adminEmailTestSchema,
  adminNotificationCampaignSchema,
  adminPrintedOrderUpdateSchema,
  adminReconcileDigitalPurchaseSchema,
  complimentaryGrantSchema,
  complimentaryOnlineAccessGrantSchema,
  entrySchema,
  entryStatusPatchSchema,
  idOf,
  inquiryUpdateSchema,
  monthOf,
  planUpdateSchema,
  revokeAccessSchema,
  settingsUpdateSchema,
  themeUpdateSchema,
  userStatusUpdateSchema,
} from "../validation.js";
import { getAppSettings, updateAppSettings } from "../services/settings.js";
import {
  getSubscriptionsMap,
  grantComplimentaryAccess,
  revokeSubscriptionAccess,
} from "../services/subscriptions.js";
import {
  getDigitalEntitlementsMap,
  getPrintedOrderById,
  grantComplimentaryOnlineAccessAdmin,
  reconcileDigitalPurchaseAdmin,
  revokeOnlineAccessAdmin,
  updateBulkOrderAdmin,
  updatePrintedOrderAdmin,
} from "../services/commerce.js";
import type { PaymentProvider } from "../services/payments.js";
import {
  LiveWebPushProvider,
  cancelAdminNotificationCampaign,
  createAndQueueNotificationCampaign,
  getAdminNotificationCampaigns,
  previewNotificationCampaign,
  runNotificationWorkerCycle,
  searchNotificationReaders,
  type WebPushProvider,
} from "../services/notifications.js";
import type { ReaderAudienceSegment } from "../services/access.js";
import {
  UnconfiguredEmailAdapter,
  type EmailService,
} from "../services/email.js";
import {
  EMAIL_TEMPLATE_CATALOG,
  buildSampleTemplatePreview,
  type EmailTemplateId,
} from "../services/emailTemplates.js";
import {
  cancelAdminEmailCampaign,
  createAndQueueAdminEmailCampaign,
  getAdminEmailOverview,
  previewAdminEmailCampaign,
  processEmailQueueBatch,
  resumeAdminEmailCampaign,
  runEmailWorkerCycle,
  sendImmediateTransactionalEmail,
} from "../services/emailQueue.js";

export function registerAdminRoutes(
  app: FastifyInstance,
  prefix: string,
  store: Store,
  paymentProvider: PaymentProvider,
  pushProvider: WebPushProvider = new LiveWebPushProvider({}),
  emailOptions: {
    emailService?: EmailService;
    appOrigin?: string;
  } = {},
) {
  const emailService =
    emailOptions.emailService || new UnconfiguredEmailAdapter({});
  const appOrigin = emailOptions.appOrigin || "http://localhost:5173";
  const { db, sqlite } = store;

  const actorOf = (admin: PublicAdmin): AdminActor => ({
    id: admin.id,
    name: admin.name,
    email: admin.email,
    role: admin.role,
  });

  const audit = (
    admin: PublicAdmin,
    action: string,
    entityType = "system",
    entityId: string | number = "",
  ) => logAdminAudit(store, actorOf(admin), action, entityType, entityId);

  const staffCreateSchema = z.object({
    name: z.string().trim().min(2).max(100),
    email: z
      .email("Enter a valid administrator email address.")
      .max(254)
      .transform((v) => v.toLowerCase()),
    role: z.enum(ADMIN_ROLES),
    password: z.string().min(12).max(128),
  });

  const staffUpdateSchema = z.object({
    name: z.string().trim().min(2).max(100).optional(),
    role: z.enum(ADMIN_ROLES).optional(),
    customPermissions: z.array(z.enum(GRANTABLE_CUSTOM_PERMISSIONS)).optional(),
    status: z.enum(["active", "suspended"]).optional(),
    suspendedReason: z.string().trim().max(500).optional(),
    resetMfa: z.boolean().optional(),
    newPassword: z.string().min(12).max(128).optional(),
  });

  const syncMonthlyTheme = (date: string, theme: string) => {
    if (theme) {
      db.insert(s.monthlyThemes)
        .values({
          month: Number(date.slice(5, 7)),
          title: theme,
          description: "",
        })
        .onConflictDoUpdate({
          target: s.monthlyThemes.month,
          set: { title: theme },
        })
        .run();
    }
  };

  const buildEditorialStats = (
    entries: Array<{
      date: string;
      published: boolean;
      reviewStatus: string;
    }>,
  ) => {
    const existing2027Dates = new Set(
      entries.filter((e) => e.date.startsWith("2027-")).map((e) => e.date),
    );
    let missingDevotionalDates = 0;
    for (let i = 0; i < 365; i += 1) {
      const iso = new Date(Date.UTC(2027, 0, 1 + i)).toISOString().slice(0, 10);
      if (!existing2027Dates.has(iso)) missingDevotionalDates += 1;
    }
    return {
      published: entries.filter((e) => e.published).length,
      drafts: entries.filter((e) => !e.published).length,
      approvedReadings: entries.filter((e) => e.reviewStatus === "approved")
        .length,
      approvedUnpublishedReadings: entries.filter(
        (e) => !e.published && e.reviewStatus === "approved",
      ).length,
      pendingReviewReadings: entries.filter(
        (e) => e.reviewStatus === "pending_review",
      ).length,
      needsRevisionReadings: entries.filter(
        (e) => e.reviewStatus === "needs_revision",
      ).length,
      missingDevotionalDates,
    };
  };

  const buildPrintedOrdersList = () => {
    const orderRows = db
      .select()
      .from(s.printedOrders)
      .orderBy(desc(s.printedOrders.createdAt))
      .all();
    const itemRows = db.select().from(s.printedOrderItems).all();
    const itemsByOrderId = new Map<number, typeof itemRows>();
    for (const item of itemRows) {
      const list = itemsByOrderId.get(item.orderId);
      if (list) list.push(item);
      else itemsByOrderId.set(item.orderId, [item]);
    }
    return orderRows.map((order) => ({
      ...order,
      items: itemsByOrderId.get(order.id) ?? [],
    }));
  };

  const buildDigitalPurchaseRows = (
    settings: ReturnType<typeof getAppSettings>,
    entitlementsMap: ReturnType<typeof getDigitalEntitlementsMap>,
  ) => {
    const raw = db
      .select({
        id: s.digitalPurchases.id,
        userId: s.digitalPurchases.userId,
        userName: s.users.name,
        email: s.users.email,
        productCode: s.digitalPurchases.productCode,
        productName: s.digitalPurchases.productName,
        amountKobo: s.digitalPurchases.amountKobo,
        currency: s.digitalPurchases.currency,
        reference: s.digitalPurchases.reference,
        paymentMethod: s.digitalPurchases.paymentMethod,
        transferReference: s.digitalPurchases.transferReference,
        payerNote: s.digitalPurchases.payerNote,
        status: s.digitalPurchases.status,
        adminNotes: s.digitalPurchases.adminNotes,
        verifiedAt: s.digitalPurchases.verifiedAt,
        startsAt: s.digitalPurchases.periodStartAt,
        expiresAt: s.digitalPurchases.periodEndAt,
        createdAt: s.digitalPurchases.createdAt,
        updatedAt: s.digitalPurchases.updatedAt,
      })
      .from(s.digitalPurchases)
      .innerJoin(s.users, eq(s.users.id, s.digitalPurchases.userId))
      .orderBy(desc(s.digitalPurchases.createdAt))
      .all();

    return raw.map((dp) => {
      const entitlement = entitlementsMap.get(dp.userId) ?? null;
      const accessStatus =
        dp.status === "refunded"
          ? "refunded"
          : dp.status === "revoked"
            ? "revoked"
            : dp.status === "pending" || dp.status === "verifying_transfer"
              ? "pending"
              : dp.status === "failed"
                ? "failed"
                : entitlement?.status === "scheduled"
                  ? "scheduled"
                  : entitlement?.status === "revoked"
                    ? "revoked"
                    : entitlement?.status === "expired"
                      ? "expired"
                      : entitlement?.active
                        ? "active"
                        : "none";

      return {
        ...dp,
        editionYear: 2027,
        accessScope: entitlement?.accessScope || settings.digitalEditionScope,
        entitlementStatus: entitlement?.status || "none",
        accessStatus,
        startsAt: dp.startsAt || entitlement?.startsAt || dp.verifiedAt,
        expiresAt: dp.expiresAt || entitlement?.expiresAt || null,
        daysRemaining: entitlement?.daysRemaining ?? null,
        expiringSoon: entitlement?.expiringSoon ?? false,
        renewalCount: entitlement?.renewalCount ?? 0,
        legacyPersistent: entitlement?.legacyPersistent ?? false,
        legacyReviewRequired: entitlement?.legacyReviewRequired ?? false,
      };
    });
  };

  const buildEnrichedUsers = (
    settings: ReturnType<typeof getAppSettings>,
    subscriptionsMap: ReturnType<typeof getSubscriptionsMap>,
    entitlementsMap: ReturnType<typeof getDigitalEntitlementsMap>,
  ) => {
    const progressByUser = new Map(
      db
        .select({ userId: s.progress.userId, count: sql<number>`count(*)` })
        .from(s.progress)
        .groupBy(s.progress.userId)
        .all()
        .map((r) => [r.userId, Number(r.count)]),
    );
    const bookmarksByUser = new Map(
      db
        .select({ userId: s.bookmarks.userId, count: sql<number>`count(*)` })
        .from(s.bookmarks)
        .groupBy(s.bookmarks.userId)
        .all()
        .map((r) => [r.userId, Number(r.count)]),
    );
    const digitalSuccessByUser = new Map(
      db
        .select({
          userId: s.digitalPurchases.userId,
          count: sql<number>`count(*)`,
        })
        .from(s.digitalPurchases)
        .where(eq(s.digitalPurchases.status, "succeeded"))
        .groupBy(s.digitalPurchases.userId)
        .all()
        .map((r) => [r.userId, Number(r.count)]),
    );
    const pendingDigitalUsers = new Set(
      db
        .select({
          userId: s.digitalPurchases.userId,
          status: s.digitalPurchases.status,
        })
        .from(s.digitalPurchases)
        .all()
        .filter(
          (r) => r.status === "pending" || r.status === "verifying_transfer",
        )
        .map((r) => r.userId),
    );
    const printedCountByUser = new Map(
      db
        .select({
          userId: s.printedOrders.userId,
          count: sql<number>`count(*)`,
        })
        .from(s.printedOrders)
        .groupBy(s.printedOrders.userId)
        .all()
        .filter((r) => r.userId !== null)
        .map((r) => [Number(r.userId), Number(r.count)]),
    );

    const allUsers = db
      .select({
        id: s.users.id,
        name: s.users.name,
        email: s.users.email,
        role: s.users.role,
        status: s.users.status,
        suspendedReason: s.users.suspendedReason,
        ageGroup: s.users.ageGroup,
        guardianConsentConfirmed: s.users.guardianConsentConfirmed,
        createdAt: s.users.createdAt,
      })
      .from(s.users)
      .orderBy(desc(s.users.createdAt))
      .all();

    return allUsers.map((u) => {
      const sub = subscriptionsMap.get(u.id) ?? null;
      const digitalEntitlement = entitlementsMap.get(u.id) ?? null;
      const hasPendingPayment = pendingDigitalUsers.has(u.id);

      const onlineAccessActive = Boolean(
        digitalEntitlement?.active || sub?.active,
      );
      const onlineAccessStatus = onlineAccessActive
        ? "active"
        : digitalEntitlement?.status === "scheduled" ||
            sub?.effectiveStatus === "scheduled"
          ? "scheduled"
          : digitalEntitlement?.status === "revoked" ||
              sub?.effectiveStatus === "revoked"
            ? "revoked"
            : digitalEntitlement?.status === "expired" ||
                sub?.effectiveStatus === "expired"
              ? "expired"
              : hasPendingPayment
                ? "pending_payment"
                : "none";

      const isComplimentaryGrant = Boolean(
        (digitalEntitlement &&
          digitalEntitlement.grantReason &&
          !digitalEntitlement.purchaseId) ||
          sub?.accessType === "complimentary",
      );

      return {
        ...u,
        subscription: sub,
        digitalEntitlement,
        hasDigitalEdition: Boolean(digitalEntitlement?.active),
        onlineAccessActive,
        onlineAccessStatus,
        onlineAccessStartsAt:
          digitalEntitlement?.startsAt || sub?.startedAt || null,
        onlineAccessExpiresAt:
          digitalEntitlement?.expiresAt || sub?.expiresAt || null,
        onlineAccessDaysRemaining:
          digitalEntitlement?.daysRemaining ?? sub?.daysRemaining ?? null,
        completedReadingsCount: progressByUser.get(u.id) ?? 0,
        bookmarksCount: bookmarksByUser.get(u.id) ?? 0,
        digitalPurchasesCount: digitalSuccessByUser.get(u.id) ?? 0,
        printedOrdersCount: printedCountByUser.get(u.id) ?? 0,
        planName:
          sub?.planName ||
          (digitalEntitlement ? "2027 Online Access (12 Months)" : null),
        accessType: isComplimentaryGrant
          ? "complimentary"
          : sub?.accessType || (digitalEntitlement ? "paid" : null),
        subscriptionStatus:
          digitalEntitlement?.status || sub?.effectiveStatus || "none",
        expiresAt: digitalEntitlement?.expiresAt || sub?.expiresAt || null,
        renewalMode: sub?.renewalMode || "manual",
        cancelAtPeriodEnd: sub?.cancelAtPeriodEnd || false,
        grantReason:
          digitalEntitlement?.grantReason || sub?.grantReason || "",
      };
    });
  };

  app.get(prefix + "/admin/overview", async (req) => {
    const admin = requireAdminPermission(req, "overview.read");
    const canReaders = adminHasPermission(admin, "readers.read");
    const canDevotionals = adminHasPermission(admin, "devotionals.read");
    const canDigital = adminHasPermission(admin, "digital_orders.read");
    const canPrinted = adminHasPermission(admin, "printed_orders.read");
    const canBulk = adminHasPermission(admin, "bulk_orders.read");
    const canPayments = adminHasPermission(admin, "payments.read");
    const canNotifications = adminHasPermission(admin, "notifications.read");
    const canAudit = adminHasPermission(admin, "audit.read");
    const canFinanceMetrics = canPayments || canDigital || canPrinted;

    const settings = getAppSettings(store);

    const needUsers = canReaders || canDigital || canPayments;
    const needDigitalPurchases = canDigital || canPayments;
    const needPrintedOrders = canPrinted || canPayments;

    const subscriptionsMap = needUsers
      ? getSubscriptionsMap(store, settings.renewalReminderDays)
      : new Map();
    const entitlementsMap =
      needUsers || needDigitalPurchases
        ? getDigitalEntitlementsMap(store, 2027)
        : new Map();

    const enrichedUsers = needUsers
      ? buildEnrichedUsers(settings, subscriptionsMap, entitlementsMap)
      : [];

    const printedOrders = needPrintedOrders ? buildPrintedOrdersList() : [];

    const digitalPurchaseRows = needDigitalPurchases
      ? buildDigitalPurchaseRows(settings, entitlementsMap)
      : [];

    // Also include complimentary or legacy entitlements that do not have a row in digital_purchases
    const entitlementUsersWithPurchases = new Set(
      digitalPurchaseRows.map((dp) => dp.userId),
    );
    const standaloneEntitlements =
      needUsers && needDigitalPurchases
        ? enrichedUsers
            .filter(
              (u) =>
                u.digitalEntitlement &&
                !entitlementUsersWithPurchases.has(u.id),
            )
            .map((u) => {
              const ent = u.digitalEntitlement!;
              return {
                id: -ent.id,
                userId: u.id,
                userName: u.name,
                email: u.email,
                productCode: "digital_2027",
                productName: "2027 Online Access (Complimentary)",
                amountKobo: 0,
                currency: "NGN",
                reference: `COMP_${ent.id}`,
                paymentMethod: "complimentary",
                transferReference: "",
                payerNote: ent.grantReason || "Complimentary grant",
                status: "succeeded",
                adminNotes: ent.grantReason || "",
                verifiedAt: ent.grantedAt,
                startsAt: ent.startsAt || ent.grantedAt,
                expiresAt: ent.expiresAt,
                createdAt: ent.grantedAt,
                updatedAt: ent.updatedAt,
                editionYear: 2027,
                accessScope: ent.accessScope,
                entitlementStatus: ent.status,
                accessStatus: ent.status,
                daysRemaining: ent.daysRemaining,
                expiringSoon: ent.expiringSoon,
                renewalCount: ent.renewalCount,
                legacyPersistent: ent.legacyPersistent,
                legacyReviewRequired: ent.legacyReviewRequired,
              };
            })
        : [];

    const onlineAccessRecords = [
      ...digitalPurchaseRows,
      ...standaloneEntitlements,
    ];

    const paymentRows = canPayments
      ? db
          .select({
            id: s.payments.id,
            userId: s.payments.userId,
            userName: s.users.name,
            email: s.users.email,
            planName: s.payments.planName,
            amountKobo: s.payments.amountKobo,
            currency: s.payments.currency,
            reference: s.payments.reference,
            provider: s.payments.provider,
            status: s.payments.status,
            renewalMode: s.payments.renewalMode,
            verifiedAt: s.payments.verifiedAt,
            createdAt: s.payments.createdAt,
          })
          .from(s.payments)
          .innerJoin(s.users, eq(s.users.id, s.payments.userId))
          .orderBy(desc(s.payments.createdAt))
          .all()
      : [];

    const entries = canDevotionals
      ? db
          .select({
            id: s.devotionals.id,
            date: s.devotionals.date,
            title: s.devotionals.title,
            theme: s.devotionals.theme,
            sample: s.devotionals.sample,
            published: s.devotionals.published,
            reviewStatus: s.devotionals.reviewStatus,
            reviewerNotes: s.devotionals.reviewerNotes,
            reviewedAt: s.devotionals.reviewedAt,
            sourcePages: s.devotionals.sourcePages,
            updatedAt: s.devotionals.updatedAt,
          })
          .from(s.devotionals)
          .orderBy(s.devotionals.date)
          .all()
      : [];

    const editorialStats = canDevotionals
      ? buildEditorialStats(entries)
      : {
          published: 0,
          drafts: 0,
          approvedReadings: 0,
          approvedUnpublishedReadings: 0,
          pendingReviewReadings: 0,
          needsRevisionReadings: 0,
          missingDevotionalDates: 0,
        };

    const progressByDevotional = canDevotionals
      ? new Map(
          db
            .select({
              devotionalId: s.progress.devotionalId,
              count: sql<number>`count(*)`,
            })
            .from(s.progress)
            .groupBy(s.progress.devotionalId)
            .all()
            .map((r) => [r.devotionalId, Number(r.count)]),
        )
      : new Map<number, number>();
    const bookmarksByDevotional = canDevotionals
      ? new Map(
          db
            .select({
              devotionalId: s.bookmarks.devotionalId,
              count: sql<number>`count(*)`,
            })
            .from(s.bookmarks)
            .groupBy(s.bookmarks.devotionalId)
            .all()
            .map((r) => [r.devotionalId, Number(r.count)]),
        )
      : new Map<number, number>();

    const totalCompletionsCount = canDevotionals
      ? Number(
          db
            .select({ count: sql<number>`count(*)` })
            .from(s.progress)
            .get()?.count ?? 0,
        )
      : 0;
    const totalBookmarksCount = canDevotionals
      ? Number(
          db
            .select({ count: sql<number>`count(*)` })
            .from(s.bookmarks)
            .get()?.count ?? 0,
        )
      : 0;

    const bulkOrderRows = canBulk
      ? db
          .select()
          .from(s.bulkOrders)
          .orderBy(desc(s.bulkOrders.createdAt))
          .all()
      : [];

    const inquiryRows =
      canNotifications || canBulk
        ? db
            .select()
            .from(s.inquiries)
            .orderBy(desc(s.inquiries.createdAt))
            .all()
        : [];

    const readerUsers = enrichedUsers.filter((u) => u.role === "reader");
    const activeSubs = enrichedUsers.filter((u) => u.subscription?.active);
    const expiredSubs = enrichedUsers.filter(
      (u) =>
        u.subscription &&
        !u.subscription.active &&
        (u.subscription.effectiveStatus === "expired" ||
          u.subscription.effectiveStatus === "revoked"),
    );

    const activeOnlineReaders = readerUsers.filter(
      (u) => u.onlineAccessActive,
    ).length;
    const scheduledOnlineReaders = readerUsers.filter(
      (u) => u.onlineAccessStatus === "scheduled",
    ).length;
    const paidOnlineReaders = readerUsers.filter(
      (u) => u.onlineAccessActive && u.accessType !== "complimentary",
    ).length;
    const complimentaryOnlineReaders = readerUsers.filter(
      (u) => u.onlineAccessActive && u.accessType === "complimentary",
    ).length;
    const expiringOnlineAccessSoon = readerUsers.filter(
      (u) =>
        Boolean(u.digitalEntitlement?.expiringSoon) ||
        Boolean(u.subscription?.renewalReminder?.dueSoon),
    ).length;
    const expiredOnlineAccess = readerUsers.filter(
      (u) => u.onlineAccessStatus === "expired",
    ).length;
    const revokedOnlineAccess = readerUsers.filter(
      (u) => u.onlineAccessStatus === "revoked",
    ).length;

    const activeEntitlementsCount = readerUsers.filter((u) =>
      Boolean(u.digitalEntitlement?.active),
    ).length;

    const paidDigitalPurchasesCount = digitalPurchaseRows.filter(
      (dp) => dp.status === "succeeded",
    ).length;

    const subscriptionRevenueKobo = paymentRows
      .filter(
        (p) =>
          p.status === "succeeded" &&
          p.provider === "paystack" &&
          p.currency === "NGN",
      )
      .reduce((sum, p) => sum + p.amountKobo, 0);

    const digitalRevenueKobo = digitalPurchaseRows
      .filter((dp) => dp.status === "succeeded" && dp.currency === "NGN")
      .reduce((sum, dp) => sum + dp.amountKobo, 0);

    const printedBookRevenueKobo = printedOrders
      .filter((po) => po.paymentStatus === "paid" && po.currency === "NGN")
      .reduce((sum, po) => sum + (po.finalTotalKobo ?? po.subtotalKobo), 0);

    const digitalAccessRevenueKobo =
      subscriptionRevenueKobo + digitalRevenueKobo;
    const verifiedRevenueKobo =
      digitalAccessRevenueKobo + printedBookRevenueKobo;

    const pendingPrintedOrdersCount = printedOrders.filter((po) =>
      [
        "new",
        "awaiting_delivery_quotation",
        "awaiting_payment",
        "processing",
      ].includes(po.fulfillmentStatus),
    ).length;
    const ordersAwaitingDeliveryCount = printedOrders.filter((po) =>
      ["ready_for_dispatch", "shipped"].includes(po.fulfillmentStatus),
    ).length;
    const deliveredOrdersCount = printedOrders.filter(
      (po) => po.fulfillmentStatus === "delivered",
    ).length;
    const printedBooksCopiesOrdered = printedOrders
      .filter((po) => po.fulfillmentStatus !== "cancelled")
      .reduce((sum, po) => sum + po.quantity, 0);

    // Build chart series from real verified records
    const verifiedDigitalEvents = canFinanceMetrics
      ? [
          ...digitalPurchaseRows
            .filter((dp) => dp.status === "succeeded" && dp.currency === "NGN")
            .map((dp) => ({
              date: (dp.verifiedAt || dp.createdAt).slice(0, 10),
              amountKobo: dp.amountKobo,
            })),
          ...paymentRows
            .filter(
              (p) =>
                p.status === "succeeded" &&
                p.provider === "paystack" &&
                p.currency === "NGN",
            )
            .map((p) => ({
              date: (p.verifiedAt || p.createdAt).slice(0, 10),
              amountKobo: p.amountKobo,
            })),
        ]
      : [];

    const verifiedPrintedEvents = canFinanceMetrics
      ? printedOrders
          .filter((po) => po.paymentStatus === "paid" && po.currency === "NGN")
          .map((po) => ({
            date: (po.paidAt || po.createdAt).slice(0, 10),
            amountKobo: po.finalTotalKobo ?? po.subtotalKobo,
          }))
      : [];

    const nowDate = new Date();
    const dailySeries = canFinanceMetrics
      ? Array.from({ length: 14 }, (_, idx) => {
          const d = new Date(
            Date.UTC(
              nowDate.getUTCFullYear(),
              nowDate.getUTCMonth(),
              nowDate.getUTCDate() - (13 - idx),
            ),
          );
          const isoDate = d.toISOString().slice(0, 10);
          const digitalKobo = verifiedDigitalEvents
            .filter((e) => e.date === isoDate)
            .reduce((sum, e) => sum + e.amountKobo, 0);
          const printedKobo = verifiedPrintedEvents
            .filter((e) => e.date === isoDate)
            .reduce((sum, e) => sum + e.amountKobo, 0);
          return {
            date: isoDate,
            label: d.toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              timeZone: "UTC",
            }),
            digitalKobo,
            printedKobo,
            totalKobo: digitalKobo + printedKobo,
          };
        })
      : [];

    const weeklySeries = canFinanceMetrics
      ? Array.from({ length: 8 }, (_, idx) => {
          const endOffset = (7 - idx) * 7;
          const startOffset = endOffset + 6;
          const startDate = new Date(
            Date.UTC(
              nowDate.getUTCFullYear(),
              nowDate.getUTCMonth(),
              nowDate.getUTCDate() - startOffset,
            ),
          )
            .toISOString()
            .slice(0, 10);
          const endDate = new Date(
            Date.UTC(
              nowDate.getUTCFullYear(),
              nowDate.getUTCMonth(),
              nowDate.getUTCDate() - endOffset,
            ),
          )
            .toISOString()
            .slice(0, 10);
          const digitalKobo = verifiedDigitalEvents
            .filter((e) => e.date >= startDate && e.date <= endDate)
            .reduce((sum, e) => sum + e.amountKobo, 0);
          const printedKobo = verifiedPrintedEvents
            .filter((e) => e.date >= startDate && e.date <= endDate)
            .reduce((sum, e) => sum + e.amountKobo, 0);
          return {
            label: `${startDate.slice(5)}–${endDate.slice(5)}`,
            digitalKobo,
            printedKobo,
            totalKobo: digitalKobo + printedKobo,
          };
        })
      : [];

    const monthlySeries = canFinanceMetrics
      ? Array.from({ length: 6 }, (_, idx) => {
          const d = new Date(
            Date.UTC(
              nowDate.getUTCFullYear(),
              nowDate.getUTCMonth() - (5 - idx),
              1,
            ),
          );
          const ym = d.toISOString().slice(0, 7);
          const digitalKobo = verifiedDigitalEvents
            .filter((e) => e.date.startsWith(ym))
            .reduce((sum, e) => sum + e.amountKobo, 0);
          const printedKobo = verifiedPrintedEvents
            .filter((e) => e.date.startsWith(ym))
            .reduce((sum, e) => sum + e.amountKobo, 0);
          return {
            month: ym,
            label: d.toLocaleDateString("en-GB", {
              month: "short",
              year: "2-digit",
              timeZone: "UTC",
            }),
            digitalKobo,
            printedKobo,
            totalKobo: digitalKobo + printedKobo,
          };
        })
      : [];

    const registrationsByMonth = canReaders
      ? Array.from({ length: 6 }, (_, idx) => {
          const d = new Date(
            Date.UTC(
              nowDate.getUTCFullYear(),
              nowDate.getUTCMonth() - (5 - idx),
              1,
            ),
          );
          const ym = d.toISOString().slice(0, 7);
          const count = readerUsers.filter((u) =>
            u.createdAt.startsWith(ym),
          ).length;
          return {
            month: ym,
            label: d.toLocaleDateString("en-GB", {
              month: "short",
              year: "2-digit",
              timeZone: "UTC",
            }),
            count,
          };
        })
      : [];

    const fulfillmentStatuses: Array<{
      status: string;
      label: string;
    }> = [
      { status: "new", label: "New" },
      { status: "awaiting_delivery_quotation", label: "Awaiting Quote" },
      { status: "awaiting_payment", label: "Awaiting Payment" },
      { status: "processing", label: "Processing" },
      { status: "ready_for_dispatch", label: "Ready for Dispatch" },
      { status: "shipped", label: "Shipped" },
      { status: "delivered", label: "Delivered" },
      { status: "cancelled", label: "Cancelled" },
    ];
    const ordersByFulfillmentStatus = canPrinted
      ? fulfillmentStatuses.map((st) => ({
          ...st,
          count: printedOrders.filter((po) => po.fulfillmentStatus === st.status)
            .length,
        }))
      : [];

    const campaignsSummary = canNotifications
      ? getAdminNotificationCampaigns(store, { limit: 15 })
      : { items: [], total: 0 };
    const notificationStatusCounts = canNotifications
      ? new Map(
          db
            .select({
              status: s.adminNotificationCampaigns.status,
              count: sql<number>`count(*)`,
            })
            .from(s.adminNotificationCampaigns)
            .groupBy(s.adminNotificationCampaigns.status)
            .all()
            .map((r) => [r.status, Number(r.count)]),
        )
      : new Map<string, number>();

    const scheduledNotificationsCount =
      notificationStatusCounts.get("scheduled") ?? 0;
    const failedNotificationCampaignsCount =
      (notificationStatusCounts.get("failed") ?? 0) +
      (notificationStatusCounts.get("partial") ?? 0);
    const pendingNotificationCampaignsCount =
      scheduledNotificationsCount +
      (notificationStatusCounts.get("queued") ?? 0) +
      (notificationStatusCounts.get("sending") ?? 0);

    // Operational notifications for the administrator
    const operationalAlerts: Array<{
      id: string;
      severity: "high" | "medium" | "info";
      category:
        | "printed_order"
        | "payment_verification"
        | "online_access"
        | "bulk_order"
        | "devotional"
        | "inquiry"
        | "email";
      title: string;
      description: string;
      actionTab: string;
      createdAt: string;
    }> = [];

    if (canPrinted) {
      for (const po of printedOrders) {
        if (po.fulfillmentStatus === "awaiting_delivery_quotation") {
          operationalAlerts.push({
            id: `po_quote_${po.id}`,
            severity: "high",
            category: "printed_order",
            title: `Delivery Quotation Needed: ${po.orderNumber}`,
            description: `${po.fullName} ordered ${po.quantity} cop${po.quantity === 1 ? "y" : "ies"} to ${po.city}, ${po.state}. Provide delivery fee so customer can approve and pay.`,
            actionTab: "printed-orders",
            createdAt: po.createdAt,
          });
        }
        if (po.paymentStatus === "awaiting_verification") {
          operationalAlerts.push({
            id: `po_verify_${po.id}`,
            severity: "high",
            category: "payment_verification",
            title: `Printed Order Bank Transfer Awaiting Verification: ${po.orderNumber}`,
            description: `${po.fullName} submitted transfer reference "${po.transferReference || po.paymentReference}" for ₦${((po.finalTotalKobo ?? po.subtotalKobo) / 100).toLocaleString()}.`,
            actionTab: "payments",
            createdAt: po.updatedAt,
          });
        }
        if (
          po.paymentStatus === "paid" &&
          (po.fulfillmentStatus === "new" ||
            po.fulfillmentStatus === "processing" ||
            po.fulfillmentStatus === "ready_for_dispatch")
        ) {
          operationalAlerts.push({
            id: `po_dispatch_${po.id}`,
            severity: "medium",
            category: "printed_order",
            title: `Paid Order Ready for Fulfillment: ${po.orderNumber}`,
            description: `${po.fullName} (${po.quantity} cop${po.quantity === 1 ? "y" : "ies"}) is paid and currently "${po.fulfillmentStatus.replace(/_/g, " ")}".`,
            actionTab: "printed-orders",
            createdAt: po.paidAt || po.updatedAt,
          });
        }
      }
    }

    if (canDigital || canPayments) {
      for (const dp of digitalPurchaseRows) {
        if (dp.status === "verifying_transfer" || dp.status === "pending") {
          operationalAlerts.push({
            id: `dp_verify_${dp.id}`,
            severity: dp.status === "verifying_transfer" ? "high" : "medium",
            category: "payment_verification",
            title: `Online Access Payment ${dp.status === "verifying_transfer" ? "Awaiting Transfer Verification" : "Pending"}: ${dp.reference}`,
            description: `${dp.userName} (${dp.email}) — ${dp.currency} ${(dp.amountKobo / 100).toLocaleString()}${dp.transferReference ? ` • Ref: ${dp.transferReference}` : ""}.`,
            actionTab: "online-access",
            createdAt: dp.updatedAt,
          });
        }
      }
    }

    if (canDigital) {
      for (const ent of onlineAccessRecords) {
        if (ent.legacyReviewRequired) {
          operationalAlerts.push({
            id: `legacy_ent_${ent.userId}`,
            severity: "info",
            category: "online_access",
            title: `Legacy Persistent Entitlement Preserved: ${ent.userName}`,
            description: `${ent.email} holds a legacy persistent 2027 digital entitlement preserved during migration.`,
            actionTab: "online-access",
            createdAt: ent.createdAt,
          });
        }
      }
    }

    if (canDevotionals) {
      for (const entry of entries) {
        if (entry.reviewStatus === "needs_revision") {
          operationalAlerts.push({
            id: `dev_rev_${entry.id}`,
            severity: "high",
            category: "devotional",
            title: `Devotional Needs Revision: ${entry.date} (${entry.title})`,
            description:
              entry.reviewerNotes ||
              `Source page ${entry.sourcePages || "manuscript"} flagged for editorial review before approval.`,
            actionTab: "devotionals",
            createdAt: entry.updatedAt,
          });
        }
      }
      if (editorialStats.approvedUnpublishedReadings > 0) {
        operationalAlerts.push({
          id: "dev_approved_unpublished",
          severity: "info",
          category: "devotional",
          title: `${editorialStats.approvedUnpublishedReadings} Approved Devotional${editorialStats.approvedUnpublishedReadings === 1 ? "" : "s"} Awaiting Publication`,
          description:
            "Reviewed and approved entries can be published from the 2027 editorial calendar.",
          actionTab: "devotionals",
          createdAt: nowDate.toISOString(),
        });
      }
    }

    if (canBulk) {
      for (const bo of bulkOrderRows) {
        if (bo.status === "new") {
          operationalAlerts.push({
            id: `bo_new_${bo.id}`,
            severity: "medium",
            category: "bulk_order",
            title: `New Bulk Order Request: ${bo.organizationName}`,
            description: `${bo.contactName} requested ${bo.quantity} copies (${bo.preferredFormat}) for delivery to ${bo.deliveryLocation}.`,
            actionTab: "bulk-orders",
            createdAt: bo.createdAt,
          });
        }
      }
    }

    const canEmailSummary =
      canNotifications || adminHasPermission(admin, "settings.read");
    const emailOverviewSummary = canEmailSummary
      ? getAdminEmailOverview(store, emailService)
      : null;

    if (canNotifications && failedNotificationCampaignsCount > 0) {
      operationalAlerts.push({
        id: "notif_failed_campaigns",
        severity: "high",
        category: "inquiry",
        title: `${failedNotificationCampaignsCount} Notification Campaign${failedNotificationCampaignsCount === 1 ? "" : "s"} Need Attention`,
        description:
          "Review partial or failed reader notification deliveries on the Notifications page.",
        actionTab: "notifications",
        createdAt: nowDate.toISOString(),
      });
    }

    if (canEmailSummary && emailOverviewSummary) {
      if (!emailOverviewSummary.configuration.configured) {
        operationalAlerts.push({
          id: "email_delivery_unconfigured",
          severity: "high",
          category: "email",
          title: "Email Delivery Provider Not Configured",
          description:
            "Set EMAIL_PROVIDER=resend with a verified sender domain and API key to enable password resets and transactional emails.",
          actionTab: "email",
          createdAt: nowDate.toISOString(),
        });
      } else if (emailOverviewSummary.quota.optionalPausedByQuota) {
        operationalAlerts.push({
          id: "email_quota_optional_paused",
          severity: "medium",
          category: "email",
          title: "Optional Email Campaigns Paused (Free-Tier Quota)",
          description:
            "Daily or monthly optional campaign budget is exhausted. Remaining free-tier capacity is reserved strictly for password resets and security emails.",
          actionTab: "email",
          createdAt: nowDate.toISOString(),
        });
      }
      if (emailOverviewSummary.counts.failed > 0) {
        operationalAlerts.push({
          id: "email_delivery_failures",
          severity: "high",
          category: "email",
          title: `${emailOverviewSummary.counts.failed} Failed Email Deliveries Need Attention`,
          description:
            "Review failed email queue entries and provider status on the Email Management page.",
          actionTab: "email",
          createdAt: nowDate.toISOString(),
        });
      }
    }

    const scopedAlerts = operationalAlerts.filter((alert) => {
      if (alert.category === "printed_order") return canPrinted;
      if (alert.category === "payment_verification") {
        return canPayments || canDigital;
      }
      if (alert.category === "online_access") return canDigital;
      if (alert.category === "bulk_order") return canBulk;
      if (alert.category === "devotional") return canDevotionals;
      if (alert.category === "email") return canEmailSummary;
      return canNotifications;
    });

    const pushEventsAll = canNotifications
      ? db
          .select()
          .from(s.notificationEvents)
          .orderBy(desc(s.notificationEvents.createdAt))
          .limit(50)
          .all()
      : [];
    const activePushDevicesCount = canNotifications
      ? Number(
          db
            .select({ count: sql<number>`count(*)` })
            .from(s.pushSubscriptions)
            .where(eq(s.pushSubscriptions.status, "active"))
            .get()?.count ?? 0,
        )
      : 0;

    const auditRows = canAudit
      ? db
          .select({
            id: s.auditLogs.id,
            adminId: s.auditLogs.adminId,
            adminName: s.adminUsers.name,
            actorName: s.auditLogs.actorName,
            actorEmail: s.auditLogs.actorEmail,
            actorRole: s.auditLogs.actorRole,
            entityType: s.auditLogs.entityType,
            entityId: s.auditLogs.entityId,
            action: s.auditLogs.action,
            createdAt: s.auditLogs.createdAt,
          })
          .from(s.auditLogs)
          .leftJoin(s.adminUsers, eq(s.adminUsers.id, s.auditLogs.adminId))
          .orderBy(desc(s.auditLogs.id))
          .limit(60)
          .all()
          .map((row) => ({
            ...row,
            adminName: row.adminName || row.actorName || "Administrator",
          }))
      : [];

    return {
      metrics: {
        readers: canReaders ? readerUsers.length : 0,
        totalRegisteredReaders: canReaders ? readerUsers.length : 0,
        activeOnlineReaders: canReaders || canDigital ? activeOnlineReaders : 0,
        scheduledOnlineReaders:
          canReaders || canDigital ? scheduledOnlineReaders : 0,
        paidOnlineReaders: canReaders || canDigital ? paidOnlineReaders : 0,
        complimentaryOnlineReaders:
          canReaders || canDigital ? complimentaryOnlineReaders : 0,
        expiringOnlineAccessSoon:
          canReaders || canDigital ? expiringOnlineAccessSoon : 0,
        expiredOnlineAccess: canReaders || canDigital ? expiredOnlineAccess : 0,
        revokedOnlineAccess: canReaders || canDigital ? revokedOnlineAccess : 0,
        activeMemberships: canReaders || canPayments ? activeSubs.length : 0,
        paidMemberships:
          canReaders || canPayments
            ? activeSubs.filter((u) => u.accessType === "paid").length
            : 0,
        complimentaryMemberships:
          canReaders || canPayments
            ? activeSubs.filter((u) => u.accessType === "complimentary").length
            : 0,
        expiredMemberships: canReaders || canPayments ? expiredSubs.length : 0,
        activeEntitlementsCount: canDigital ? activeEntitlementsCount : 0,
        digitalEditionsSold: canDigital ? paidDigitalPurchasesCount : 0,
        pendingDigitalPurchases: canDigital
          ? digitalPurchaseRows.filter(
              (dp) =>
                dp.status === "pending" || dp.status === "verifying_transfer",
            ).length
          : 0,
        pendingPrintedOrders: canPrinted ? pendingPrintedOrdersCount : 0,
        ordersAwaitingDelivery: canPrinted ? ordersAwaitingDeliveryCount : 0,
        deliveredOrders: canPrinted ? deliveredOrdersCount : 0,
        printedOrdersTotal: canPrinted ? printedOrders.length : 0,
        printedBooksCopiesOrdered: canPrinted ? printedBooksCopiesOrdered : 0,
        published: canDevotionals ? editorialStats.published : 0,
        drafts: canDevotionals ? editorialStats.drafts : 0,
        approvedReadings: canDevotionals ? editorialStats.approvedReadings : 0,
        approvedUnpublishedReadings: canDevotionals
          ? editorialStats.approvedUnpublishedReadings
          : 0,
        pendingReviewReadings: canDevotionals
          ? editorialStats.pendingReviewReadings
          : 0,
        needsRevisionReadings: canDevotionals
          ? editorialStats.needsRevisionReadings
          : 0,
        missingDevotionalDates: canDevotionals
          ? editorialStats.missingDevotionalDates
          : 0,
        completions: totalCompletionsCount,
        bookmarks: totalBookmarksCount,
        subscriptionRevenueKobo: canPayments ? subscriptionRevenueKobo : 0,
        digitalRevenueKobo: canPayments || canDigital ? digitalRevenueKobo : 0,
        digitalAccessRevenueKobo:
          canPayments || canDigital ? digitalAccessRevenueKobo : 0,
        printedBookRevenueKobo:
          canPayments || canPrinted ? printedBookRevenueKobo : 0,
        totalSalesKobo: canFinanceMetrics ? verifiedRevenueKobo : 0,
        verifiedRevenueKobo: canFinanceMetrics ? verifiedRevenueKobo : 0,
        openInquiries: canNotifications
          ? inquiryRows.filter((i) => i.status === "new").length
          : 0,
        scheduledNotificationsCount: canNotifications
          ? scheduledNotificationsCount
          : 0,
        pendingNotificationCampaignsCount: canNotifications
          ? pendingNotificationCampaignsCount
          : 0,
        failedNotificationCampaignsCount: canNotifications
          ? failedNotificationCampaignsCount
          : 0,
        bulkOrderInquiries: canBulk ? bulkOrderRows.length : 0,
        openBulkOrders: canBulk
          ? bulkOrderRows.filter(
              (b) => b.status === "new" || b.status === "quoted",
            ).length
          : 0,
        activeAlertsCount: scopedAlerts.length,
      },
      charts: {
        salesByPeriod: canFinanceMetrics
          ? {
              daily: dailySeries,
              weekly: weeklySeries,
              monthly: monthlySeries,
            }
          : { daily: [], weekly: [], monthly: [] },
        digitalVsPrinted: canFinanceMetrics
          ? {
              digitalKobo: digitalAccessRevenueKobo,
              printedKobo: printedBookRevenueKobo,
              digitalCount: verifiedDigitalEvents.length,
              printedCount: verifiedPrintedEvents.length,
            }
          : {
              digitalKobo: 0,
              printedKobo: 0,
              digitalCount: 0,
              printedCount: 0,
            },
        registrationsByMonth: canReaders ? registrationsByMonth : [],
        ordersByFulfillmentStatus: canPrinted ? ordersByFulfillmentStatus : [],
      },
      users: canReaders ? enrichedUsers : [],
      devotionals: canDevotionals ? entries : [],
      themes: canDevotionals
        ? db
            .select()
            .from(s.monthlyThemes)
            .orderBy(s.monthlyThemes.month)
            .all()
        : [],
      plans: canPayments
        ? db.select().from(s.plans).orderBy(s.plans.months).all()
        : [],
      payments: canPayments ? paymentRows : [],
      digitalPurchases: canDigital || canPayments ? digitalPurchaseRows : [],
      onlineAccessRecords:
        canDigital || canPayments ? onlineAccessRecords : [],
      printedOrders: canPrinted ? printedOrders : [],
      bulkOrders: canBulk ? bulkOrderRows : [],
      inquiries: canNotifications || canBulk ? inquiryRows : [],
      operationalAlerts: scopedAlerts,
      pushStatusSummary: {
        configured: pushProvider.configured,
        activePushDevicesCount,
        recentEvents: pushEventsAll.slice(0, 20),
        campaigns: campaignsSummary.items,
      },
      emailStatusSummary: emailOverviewSummary
        ? {
            configuration: emailOverviewSummary.configuration,
            quota: emailOverviewSummary.quota,
            counts: emailOverviewSummary.counts,
          }
        : undefined,
      engagement: canDevotionals
        ? entries
            .filter((e) => e.published)
            .map((e) => ({
              id: e.id,
              date: e.date,
              title: e.title,
              completions: progressByDevotional.get(e.id) ?? 0,
              bookmarks: bookmarksByDevotional.get(e.id) ?? 0,
            }))
        : [],
      audit: auditRows,
      settings,
      paymentsConfig: {
        configured: paymentProvider.configured,
        provider: paymentProvider.name,
      },
    };
  });

  app.get(prefix + "/admin/devotionals", async (req) => {
    requireAdminPermission(req, "devotionals.read");
    const query = (req.query || {}) as {
      search?: string;
      month?: string;
      status?: string;
      reviewStatus?: string;
      sort?: string;
      page?: string;
      limit?: string;
    };

    let rows = db
      .select()
      .from(s.devotionals)
      .orderBy(
        query.sort === "desc"
          ? desc(s.devotionals.date)
          : asc(s.devotionals.date),
      )
      .all();

    if (query.month && query.month !== "all") {
      const m = Number(query.month);
      if (!Number.isNaN(m)) {
        rows = rows.filter((d) => Number(d.date.slice(5, 7)) === m);
      }
    }
    if (query.status === "published") {
      rows = rows.filter((d) => d.published);
    } else if (query.status === "draft") {
      rows = rows.filter((d) => !d.published);
    } else if (query.status === "sample") {
      rows = rows.filter((d) => d.sample);
    }

    if (query.reviewStatus && query.reviewStatus !== "all") {
      rows = rows.filter((d) => d.reviewStatus === query.reviewStatus);
    }

    if (query.search?.trim()) {
      const q = query.search.trim().toLowerCase();
      rows = rows.filter((d) =>
        `${d.date} ${d.title} ${d.theme} ${d.bibleText}`
          .toLowerCase()
          .includes(q),
      );
    }

    const total = rows.length;
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(365, Math.max(1, Number(query.limit) || 50));
    const items = rows.slice((page - 1) * limit, page * limit);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  });

  app.get(prefix + "/admin/devotionals/:id", async (req) => {
    requireAdminPermission(req, "devotionals.read");
    const entry = db
      .select()
      .from(s.devotionals)
      .where(eq(s.devotionals.id, idOf(req)))
      .get();
    if (!entry) throw new HttpError(404, "Devotional not found.");
    return entry;
  });

  app.post(prefix + "/admin/devotionals", async (req) => {
    const admin = requireAdminPermission(req, "devotionals.write");
    const input = entrySchema.parse(req.body);
    if (input.published && input.reviewStatus !== "approved") {
      throw new HttpError(
        400,
        "Entries must be explicitly reviewed and marked Approved before publishing.",
      );
    }
    const now = new Date().toISOString();

    return sqlite.transaction(() => {
      const entry = db
        .insert(s.devotionals)
        .values({
          ...input,
          reviewStatus: input.reviewStatus,
          reviewedAt: input.reviewStatus === "approved" ? now : null,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();
      if (input.published) syncMonthlyTheme(input.date, input.theme);
      audit(
        admin,
        `Created devotional ${input.date}: ${input.title} (${input.published ? "published" : "draft"}, ${input.reviewStatus})`,
        "devotional",
        entry.id,
      );
      return entry;
    })();
  });

  app.put(prefix + "/admin/devotionals/:id", async (req) => {
    const admin = requireAdminPermission(req, "devotionals.write");
    const id = idOf(req);
    const input = entrySchema.parse(req.body);
    if (input.published && input.reviewStatus !== "approved") {
      throw new HttpError(
        400,
        "Entries must be explicitly reviewed and marked Approved before publishing.",
      );
    }
    const now = new Date().toISOString();

    return sqlite.transaction(() => {
      const existing = db
        .select()
        .from(s.devotionals)
        .where(eq(s.devotionals.id, id))
        .get();
      if (!existing) throw new HttpError(404, "Devotional not found.");

      const entry = db
        .update(s.devotionals)
        .set({
          ...input,
          reviewStatus: input.reviewStatus,
          reviewedAt:
            input.reviewStatus === "approved"
              ? existing.reviewedAt || now
              : input.reviewStatus === "needs_revision"
                ? now
                : null,
          updatedAt: now,
        })
        .where(eq(s.devotionals.id, id))
        .returning()
        .get();

      if (input.published) syncMonthlyTheme(input.date, input.theme);
      audit(
        admin,
        `Updated devotional ${entry.date}: ${entry.title} (${entry.published ? "published" : "draft"}, ${entry.reviewStatus})`,
        "devotional",
        entry.id,
      );
      return entry;
    })();
  });

  app.patch(prefix + "/admin/devotionals/:id/status", async (req) => {
    const admin = requireAdminPermission(req, "devotionals.write");
    const id = idOf(req);
    const input = entryStatusPatchSchema.parse(req.body);
    const now = new Date().toISOString();

    return sqlite.transaction(() => {
      const existing = db
        .select()
        .from(s.devotionals)
        .where(eq(s.devotionals.id, id))
        .get();
      if (!existing) throw new HttpError(404, "Devotional not found.");

      const nextPublished = input.published ?? existing.published;
      const nextReviewStatus = input.reviewStatus ?? existing.reviewStatus;

      if (nextPublished) {
        if (nextReviewStatus === "needs_revision") {
          throw new HttpError(
            400,
            "Cannot publish an entry marked as needing revision.",
          );
        }
        if (nextReviewStatus !== "approved") {
          throw new HttpError(
            400,
            "Devotionals must be explicitly reviewed and marked Approved before publishing.",
          );
        }
        const complete = [
          existing.bibleText,
          existing.memoryVerse,
          existing.reflection,
          existing.thinkAbout,
          existing.prayer,
          existing.challenge,
        ].every((v) => v.trim().length > 0);
        if (!complete) {
          throw new HttpError(
            400,
            "All six devotional reading sections are required before publishing.",
          );
        }
      }

      const updated = db
        .update(s.devotionals)
        .set({
          published: nextPublished,
          sample: input.sample ?? existing.sample,
          reviewStatus: nextReviewStatus,
          reviewerNotes: input.reviewerNotes ?? existing.reviewerNotes,
          reviewedAt:
            nextReviewStatus === "approved"
              ? existing.reviewedAt || now
              : existing.reviewedAt,
          updatedAt: now,
        })
        .where(eq(s.devotionals.id, id))
        .returning()
        .get();

      audit(
        admin,
        `Updated status for ${updated.date} (${updated.title}): ${updated.published ? "published" : "draft"}, ${updated.reviewStatus}`,
        "devotional",
        updated.id,
      );
      return updated;
    })();
  });

  app.put(prefix + "/admin/themes/:month", async (req) => {
    const admin = requireAdminPermission(req, "devotionals.write");
    const month = monthOf(req);
    const input = themeUpdateSchema.parse(req.body);

    return sqlite.transaction(() => {
      const theme = db
        .insert(s.monthlyThemes)
        .values({ month, title: input.title, description: input.description })
        .onConflictDoUpdate({
          target: s.monthlyThemes.month,
          set: { title: input.title, description: input.description },
        })
        .returning()
        .get();

      audit(
        admin,
        `Updated Month ${month} theme: ${input.title}`,
        "monthly_theme",
        month,
      );
      return theme;
    })();
  });

  app.post(prefix + "/admin/users/:id/complimentary", async (req) => {
    const admin = requireAdminPermission(req, "digital_orders.write");
    const targetUserId = idOf(req);
    const input = complimentaryGrantSchema.parse(req.body);
    const subscription = grantComplimentaryAccess(
      store,
      actorOf(admin),
      targetUserId,
      input,
    );
    return { ok: true, subscription };
  });

  app.post(prefix + "/admin/users/:id/revoke-access", async (req) => {
    const admin = requireAdminPermission(req, "digital_orders.write");
    const targetUserId = idOf(req);
    const { reason } = revokeAccessSchema.parse(req.body || {});
    const subscription = revokeSubscriptionAccess(
      store,
      actorOf(admin),
      targetUserId,
      reason,
    );
    return { ok: true, subscription };
  });

  app.patch(prefix + "/admin/users/:id/status", async (req) => {
    const admin = requireAdminPermission(req, "readers.write");
    const targetUserId = idOf(req);
    const input = userStatusUpdateSchema.parse(req.body);
    const now = new Date().toISOString();

    return sqlite.transaction(() => {
      const updated = db
        .update(s.users)
        .set({
          status: input.status,
          suspendedReason: input.status === "suspended" ? input.reason : "",
          updatedAt: now,
        })
        .where(eq(s.users.id, targetUserId))
        .returning()
        .get();

      if (!updated) throw new HttpError(404, "Reader account not found.");

      if (input.status === "suspended") {
        db.delete(s.sessions)
          .where(eq(s.sessions.userId, targetUserId))
          .run();
      }

      audit(
        admin,
        `${input.status === "suspended" ? "Suspended" : "Reactivated"} reader account ${updated.email}${input.reason ? ` (${input.reason})` : ""}`,
        "reader",
        updated.id,
      );
      return { ok: true, status: updated.status };
    })();
  });

  app.patch(prefix + "/admin/plans/:id", async (req) => {
    const admin = requireAdminPermission(req, "payments.write");
    const input = planUpdateSchema.parse(req.body);
    return sqlite.transaction(() => {
      const plan = db
        .update(s.plans)
        .set(input)
        .where(eq(s.plans.id, idOf(req)))
        .returning()
        .get();
      if (!plan) throw new HttpError(404, "Plan not found.");
      audit(
        admin,
        `Updated plan ${plan.name}: NGN ${(plan.amountKobo / 100).toLocaleString()} (${plan.active ? "active" : "hidden"})`,
        "plan",
        plan.id,
      );
      return plan;
    })();
  });

  app.patch(prefix + "/admin/inquiries/:id", async (req) => {
    const admin = requireAdminPermission(req, "notifications.write");
    const input = inquiryUpdateSchema.parse(req.body);
    const now = new Date().toISOString();
    return sqlite.transaction(() => {
      const existing = db
        .select()
        .from(s.inquiries)
        .where(eq(s.inquiries.id, idOf(req)))
        .get();
      if (!existing) throw new HttpError(404, "Inquiry not found.");

      const result = db
        .update(s.inquiries)
        .set({
          status: input.status,
          adminNotes: input.adminNotes ?? existing.adminNotes,
          updatedAt: now,
        })
        .where(eq(s.inquiries.id, existing.id))
        .returning()
        .get();

      audit(
        admin,
        `Updated inquiry #${result.id} (${result.name}) status to ${result.status}`,
        "inquiry",
        result.id,
      );
      return result;
    })();
  });

  app.post(prefix + "/admin/digital-purchases/:id/reconcile", async (req) => {
    const admin = requireAdminPermission(req, "digital_orders.write");
    const purchaseId = idOf(req);
    const input = adminReconcileDigitalPurchaseSchema.parse(req.body);
    const result = reconcileDigitalPurchaseAdmin(
      store,
      actorOf(admin),
      purchaseId,
      input,
    );
    if (emailService.configured) {
      await processEmailQueueBatch(store, emailService, {
        batchSize: 5,
        defaultAppBaseUrl: appOrigin,
      }).catch(() => undefined);
    }
    return result;
  });

  app.post(
    prefix + "/admin/users/:id/online-access/grant",
    async (req) => {
      const admin = requireAdminPermission(req, "digital_orders.write");
      const targetUserId = idOf(req);
      const input = complimentaryOnlineAccessGrantSchema.parse(req.body);
      const entitlement = grantComplimentaryOnlineAccessAdmin(
        store,
        actorOf(admin),
        targetUserId,
        input,
      );
      if (emailService.configured) {
        await processEmailQueueBatch(store, emailService, {
          batchSize: 5,
          defaultAppBaseUrl: appOrigin,
        }).catch(() => undefined);
      }
      return { ok: true, entitlement };
    },
  );

  app.post(
    prefix + "/admin/users/:id/online-access/revoke",
    async (req) => {
      const admin = requireAdminPermission(req, "digital_orders.write");
      const targetUserId = idOf(req);
      const { reason } = revokeAccessSchema.parse(req.body || {});
      const entitlement = revokeOnlineAccessAdmin(
        store,
        actorOf(admin),
        targetUserId,
        reason,
      );
      return { ok: true, entitlement };
    },
  );

  app.get(prefix + "/admin/readers", async (req) => {
    requireAdminPermission(req, "readers.read");
    const query = (req.query || {}) as {
      search?: string;
      status?: string;
      accessStatus?: string;
      page?: string;
      limit?: string;
    };
    const settings = getAppSettings(store);
    const subscriptionsMap = getSubscriptionsMap(
      store,
      settings.renewalReminderDays,
    );
    const entitlementsMap = getDigitalEntitlementsMap(store, 2027);
    let rows = buildEnrichedUsers(
      settings,
      subscriptionsMap,
      entitlementsMap,
    ).filter((u) => u.role === "reader");

    if (query.status && query.status !== "all") {
      rows = rows.filter((u) => u.status === query.status);
    }
    if (query.accessStatus && query.accessStatus !== "all") {
      rows = rows.filter(
        (u) => (u.onlineAccessStatus || "none") === query.accessStatus,
      );
    }
    if (query.search?.trim()) {
      const q = query.search.trim().toLowerCase();
      rows = rows.filter((u) =>
        `${u.name} ${u.email} ${u.planName || ""} ${u.onlineAccessStatus || ""} ${u.grantReason || ""}`
          .toLowerCase()
          .includes(q),
      );
    }

    const total = rows.length;
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(query.limit) || 25));
    const items = rows.slice((page - 1) * limit, page * limit);
    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  });

  app.get(prefix + "/admin/online-access", async (req) => {
    const admin = requireAdminPermission(req, "overview.read");
    if (
      !adminHasPermission(admin, "digital_orders.read") &&
      !adminHasPermission(admin, "payments.read")
    ) {
      throw new HttpError(403, "Insufficient administrator permissions.");
    }
    const query = (req.query || {}) as {
      search?: string;
      status?: string;
      method?: string;
      page?: string;
      limit?: string;
    };
    const settings = getAppSettings(store);
    const subscriptionsMap = getSubscriptionsMap(
      store,
      settings.renewalReminderDays,
    );
    const entitlementsMap = getDigitalEntitlementsMap(store, 2027);
    const digitalPurchaseRows = buildDigitalPurchaseRows(
      settings,
      entitlementsMap,
    );
    const entitlementUsersWithPurchases = new Set(
      digitalPurchaseRows.map((dp) => dp.userId),
    );
    const enrichedUsers = buildEnrichedUsers(
      settings,
      subscriptionsMap,
      entitlementsMap,
    );
    const standaloneEntitlements = enrichedUsers
      .filter(
        (u) =>
          u.digitalEntitlement && !entitlementUsersWithPurchases.has(u.id),
      )
      .map((u) => {
        const ent = u.digitalEntitlement!;
        return {
          id: -ent.id,
          userId: u.id,
          userName: u.name,
          email: u.email,
          productCode: "digital_2027",
          productName: "2027 Online Access (Complimentary)",
          amountKobo: 0,
          currency: "NGN",
          reference: `COMP_${ent.id}`,
          paymentMethod: "complimentary",
          transferReference: "",
          payerNote: ent.grantReason || "Complimentary grant",
          status: "succeeded",
          adminNotes: ent.grantReason || "",
          verifiedAt: ent.grantedAt,
          startsAt: ent.startsAt || ent.grantedAt,
          expiresAt: ent.expiresAt,
          createdAt: ent.grantedAt,
          updatedAt: ent.updatedAt,
          editionYear: 2027,
          accessScope: ent.accessScope,
          entitlementStatus: ent.status,
          accessStatus: ent.status,
          daysRemaining: ent.daysRemaining,
          expiringSoon: ent.expiringSoon,
          renewalCount: ent.renewalCount,
          legacyPersistent: ent.legacyPersistent,
          legacyReviewRequired: ent.legacyReviewRequired,
        };
      });

    let rows = [...digitalPurchaseRows, ...standaloneEntitlements].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );

    if (query.status && query.status !== "all") {
      rows = rows.filter(
        (r) =>
          r.status === query.status || r.accessStatus === query.status,
      );
    }
    if (query.method && query.method !== "all") {
      rows = rows.filter((r) => r.paymentMethod === query.method);
    }
    if (query.search?.trim()) {
      const q = query.search.trim().toLowerCase();
      rows = rows.filter((r) =>
        `${r.userName} ${r.email} ${r.reference} ${r.transferReference} ${r.payerNote}`
          .toLowerCase()
          .includes(q),
      );
    }

    const total = rows.length;
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(query.limit) || 25));
    return {
      items: rows.slice((page - 1) * limit, page * limit),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  });

  app.get(prefix + "/admin/payments", async (req) => {
    requireAdminPermission(req, "payments.read");
    const query = (req.query || {}) as {
      search?: string;
      status?: string;
      kind?: string;
      page?: string;
      limit?: string;
    };
    const settings = getAppSettings(store);
    const entitlementsMap = getDigitalEntitlementsMap(store, 2027);
    const digitalPurchaseRows = buildDigitalPurchaseRows(
      settings,
      entitlementsMap,
    );
    const printedOrders = buildPrintedOrdersList();
    const paymentRows = db
      .select({
        id: s.payments.id,
        userId: s.payments.userId,
        userName: s.users.name,
        email: s.users.email,
        planName: s.payments.planName,
        amountKobo: s.payments.amountKobo,
        currency: s.payments.currency,
        reference: s.payments.reference,
        provider: s.payments.provider,
        status: s.payments.status,
        renewalMode: s.payments.renewalMode,
        verifiedAt: s.payments.verifiedAt,
        createdAt: s.payments.createdAt,
      })
      .from(s.payments)
      .innerJoin(s.users, eq(s.users.id, s.payments.userId))
      .orderBy(desc(s.payments.createdAt))
      .all();

    let items = [
      ...digitalPurchaseRows.map((dp) => ({
        uid: `dp-${dp.id}`,
        kind: "Online Access",
        reference: dp.reference,
        transferRef: dp.transferReference,
        customer: dp.userName,
        email: dp.email,
        method:
          dp.paymentMethod === "paystack"
            ? "Paystack"
            : dp.paymentMethod === "bank_transfer"
              ? "Bank Transfer"
              : "Complimentary",
        amountKobo: dp.amountKobo,
        currency: dp.currency,
        status: dp.status,
        verifiedAt: dp.verifiedAt,
        createdAt: dp.createdAt,
      })),
      ...printedOrders.map((po) => ({
        uid: `po-${po.id}`,
        kind: "Printed Book",
        reference: po.orderNumber,
        transferRef: po.transferReference || po.paymentReference,
        customer: po.fullName,
        email: po.email,
        method:
          po.paymentMethod === "paystack"
            ? "Paystack"
            : po.paymentMethod === "bank_transfer"
              ? "Bank Transfer"
              : "Paystack",
        amountKobo: po.finalTotalKobo ?? po.subtotalKobo,
        currency: po.currency,
        status: po.paymentStatus,
        verifiedAt: po.paidAt,
        createdAt: po.createdAt,
      })),
      ...paymentRows.map((p) => ({
        uid: `sub-${p.id}`,
        kind: "Legacy Membership",
        reference: p.reference,
        transferRef: "",
        customer: p.userName,
        email: p.email,
        method: p.provider === "paystack" ? "Paystack" : "Complimentary",
        amountKobo: p.amountKobo,
        currency: p.currency,
        status: p.status,
        verifiedAt: p.verifiedAt,
        createdAt: p.createdAt,
      })),
    ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    if (query.kind && query.kind !== "all") {
      items = items.filter((item) => item.kind === query.kind);
    }
    if (query.status && query.status !== "all") {
      items = items.filter((item) => item.status === query.status);
    }
    if (query.search?.trim()) {
      const q = query.search.trim().toLowerCase();
      items = items.filter((item) =>
        `${item.reference} ${item.transferRef} ${item.customer} ${item.email} ${item.kind}`
          .toLowerCase()
          .includes(q),
      );
    }

    const total = items.length;
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(query.limit) || 25));
    return {
      items: items.slice((page - 1) * limit, page * limit),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  });

  app.get(prefix + "/admin/inquiries", async (req) => {
    const admin = requireAdminPermission(req, "overview.read");
    if (
      !adminHasPermission(admin, "notifications.read") &&
      !adminHasPermission(admin, "bulk_orders.read")
    ) {
      throw new HttpError(403, "Insufficient administrator permissions.");
    }
    const query = (req.query || {}) as {
      search?: string;
      status?: string;
      page?: string;
      limit?: string;
    };
    let rows = db
      .select()
      .from(s.inquiries)
      .orderBy(desc(s.inquiries.createdAt))
      .all();

    if (query.status && query.status !== "all") {
      rows = rows.filter((i) => i.status === query.status);
    }
    if (query.search?.trim()) {
      const q = query.search.trim().toLowerCase();
      rows = rows.filter((i) =>
        `${i.name} ${i.email} ${i.inquiryType} ${i.deliveryLocation} ${i.message}`
          .toLowerCase()
          .includes(q),
      );
    }
    const total = rows.length;
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(query.limit) || 25));
    return {
      items: rows.slice((page - 1) * limit, page * limit),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  });

  app.get(prefix + "/admin/devotionals/summary", async (req) => {
    requireAdminPermission(req, "devotionals.read");
    const entries = db
      .select({
        date: s.devotionals.date,
        published: s.devotionals.published,
        reviewStatus: s.devotionals.reviewStatus,
      })
      .from(s.devotionals)
      .orderBy(s.devotionals.date)
      .all();
    const existing2027Dates = new Set(
      entries.filter((e) => e.date.startsWith("2027-")).map((e) => e.date),
    );
    const missingDates: string[] = [];
    for (let i = 0; i < 365; i += 1) {
      const iso = new Date(Date.UTC(2027, 0, 1 + i)).toISOString().slice(0, 10);
      if (!existing2027Dates.has(iso)) missingDates.push(iso);
    }
    return {
      ...buildEditorialStats(entries),
      totalEntries: entries.length,
      missingDates,
    };
  });

  app.get(prefix + "/admin/printed-orders", async (req) => {
    requireAdminPermission(req, "printed_orders.read");
    const query = (req.query || {}) as {
      search?: string;
      status?: string;
      paymentStatus?: string;
      page?: string;
      limit?: string;
    };
    const allOrders = buildPrintedOrdersList();
    const hasPaginationOrFilter =
      Boolean(query.page) ||
      Boolean(query.limit) ||
      Boolean(query.search?.trim()) ||
      (Boolean(query.status) && query.status !== "all") ||
      (Boolean(query.paymentStatus) && query.paymentStatus !== "all");
    if (!hasPaginationOrFilter) {
      return allOrders;
    }

    let rows = allOrders;
    if (query.status && query.status !== "all") {
      rows = rows.filter((o) => o.fulfillmentStatus === query.status);
    }
    if (query.paymentStatus && query.paymentStatus !== "all") {
      rows = rows.filter((o) => o.paymentStatus === query.paymentStatus);
    }
    if (query.search?.trim()) {
      const q = query.search.trim().toLowerCase();
      rows = rows.filter((o) =>
        `${o.orderNumber} ${o.fullName} ${o.email} ${o.city} ${o.state}`
          .toLowerCase()
          .includes(q),
      );
    }

    const total = rows.length;
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(query.limit) || 25));
    return {
      items: rows.slice((page - 1) * limit, page * limit),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  });

  app.get(prefix + "/admin/printed-orders/:id", async (req) => {
    requireAdminPermission(req, "printed_orders.read");
    const order = getPrintedOrderById(store, idOf(req));
    if (!order) throw new HttpError(404, "Printed book order not found.");
    return order;
  });

  app.patch(prefix + "/admin/printed-orders/:id", async (req) => {
    const admin = requireAdminPermission(req, "printed_orders.write");
    const orderId = idOf(req);
    const input = adminPrintedOrderUpdateSchema.parse(req.body);
    const existing = getPrintedOrderById(store, orderId);
    if (!existing) throw new HttpError(404, "Printed book order not found.");
    if (
      input.paymentStatus !== undefined &&
      input.paymentStatus !== existing.paymentStatus &&
      !adminHasPermission(admin, "payments.write")
    ) {
      throw new HttpError(
        403,
        "Only finance managers or the owner can confirm or modify printed order payment status.",
      );
    }
    const updated = updatePrintedOrderAdmin(store, actorOf(admin), orderId, input);
    if (emailService.configured) {
      await processEmailQueueBatch(store, emailService, {
        batchSize: 5,
        defaultAppBaseUrl: appOrigin,
      }).catch(() => undefined);
    }
    return updated;
  });

  app.patch(prefix + "/admin/bulk-orders/:id", async (req) => {
    const admin = requireAdminPermission(req, "bulk_orders.write");
    const bulkOrderId = idOf(req);
    const input = adminBulkOrderUpdateSchema.parse(req.body);
    return updateBulkOrderAdmin(store, actorOf(admin), bulkOrderId, input);
  });

  app.get(prefix + "/admin/settings", async (req) => {
    requireAdminPermission(req, "settings.read");
    return getAppSettings(store);
  });

  app.put(prefix + "/admin/settings", async (req) => {
    const admin = requireAdminPermission(req, "settings.write");
    const input = settingsUpdateSchema.parse(req.body);
    const settings = updateAppSettings(store, input);
    audit(
      admin,
      "Updated application and organization settings",
      "settings",
      "global",
    );
    return settings;
  });

  app.get(prefix + "/admin/notifications/readers", async (req) => {
    requireAdminPermission(req, "notifications.write");
    const q = (req.query || {}) as {
      search?: string;
      segment?: ReaderAudienceSegment | "all";
      limit?: string;
    };
    const items = searchNotificationReaders(store, {
      search: q.search,
      segment: q.segment,
      limit: Number(q.limit) || 40,
    });
    return { items };
  });

  app.post(
    prefix + "/admin/notifications/preview",
    { config: { rateLimit: { max: 40, timeWindow: "15 minutes" } } },
    async (req) => {
      const admin = requireAdminPermission(req, "notifications.write");
      const input = adminNotificationCampaignSchema.parse(req.body);
      if (
        input.targetType !== "individual" &&
        !adminHasPermission(admin, "notifications.broadcast")
      ) {
        throw new HttpError(
          403,
          "Only administrators explicitly permitted by the owner can send broadcast campaigns.",
        );
      }
      return previewNotificationCampaign(store, input);
    },
  );

  app.post(
    prefix + "/admin/notifications/campaigns",
    { config: { rateLimit: { max: 20, timeWindow: "15 minutes" } } },
    async (req) => {
      const admin = requireAdminPermission(req, "notifications.write");
      const input = adminNotificationCampaignSchema.parse(req.body);
      if (
        input.targetType !== "individual" &&
        !adminHasPermission(admin, "notifications.broadcast")
      ) {
        throw new HttpError(
          403,
          "Only administrators explicitly permitted by the owner can send multi-reader broadcast campaigns.",
        );
      }
      return createAndQueueNotificationCampaign(store, actorOf(admin), input);
    },
  );

  app.get(prefix + "/admin/notifications/campaigns", async (req) => {
    requireAdminPermission(req, "notifications.read");
    const q = (req.query || {}) as { page?: string; limit?: string };
    return getAdminNotificationCampaigns(store, {
      page: Number(q.page) || 1,
      limit: Number(q.limit) || 20,
    });
  });

  app.post(
    prefix + "/admin/notifications/campaigns/:id/cancel",
    { config: { rateLimit: { max: 20, timeWindow: "15 minutes" } } },
    async (req) => {
      const admin = requireAdminPermission(req, "notifications.write");
      const campaignId = idOf(req);
      const existing = db
        .select()
        .from(s.adminNotificationCampaigns)
        .where(eq(s.adminNotificationCampaigns.id, campaignId))
        .get();
      if (
        existing &&
        existing.targetType !== "individual" &&
        !adminHasPermission(admin, "notifications.broadcast")
      ) {
        throw new HttpError(
          403,
          "Broadcast notification permission is required to cancel a multi-reader campaign.",
        );
      }
      return {
        ok: true,
        campaign: cancelAdminNotificationCampaign(
          store,
          actorOf(admin),
          campaignId,
        ),
      };
    },
  );

  app.post(
    prefix + "/admin/notifications/run-worker",
    { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } },
    async (req) => {
      const admin = requireAdminPermission(req, "notifications.write");
      const result = await runNotificationWorkerCycle(store, pushProvider);
      audit(
        admin,
        `Executed notification worker cycle (generated: ${result.generatedCount}, sent: ${result.sentEvents})`,
        "notifications",
        "worker",
      );
      return { ok: true, result };
    },
  );

  // ============================================================================
  // EMAIL MANAGEMENT (DELIVERY STATUS, TEMPLATES, TEST SENDS & CAMPAIGNS)
  // ============================================================================

  app.get(prefix + "/admin/email/overview", async (req) => {
    requireAdminPermission(req, "notifications.read");
    return {
      ...getAdminEmailOverview(store, emailService),
      templates: EMAIL_TEMPLATE_CATALOG,
    };
  });

  app.get(prefix + "/admin/email/templates/preview", async (req) => {
    requireAdminPermission(req, "notifications.read");
    const templateId = String(
      (req.query as { templateId?: string })?.templateId || "welcome",
    ) as EmailTemplateId;
    const valid = EMAIL_TEMPLATE_CATALOG.some((t) => t.id === templateId);
    if (!valid) {
      throw new HttpError(400, "Unknown email template identifier.");
    }
    return buildSampleTemplatePreview(templateId, appOrigin);
  });

  app.post(
    prefix + "/admin/email/test",
    { config: { rateLimit: { max: 15, timeWindow: "15 minutes" } } },
    async (req) => {
      const admin = requireAdminPermission(req, "notifications.write");
      const input = adminEmailTestSchema.parse(req.body || {});
      const preview = buildSampleTemplatePreview(input.templateId, appOrigin);

      const samplePayloads: Record<EmailTemplateId, Record<string, unknown>> = {
        welcome: {
          recipientName: admin.name,
          appBaseUrl: appOrigin,
        },
        password_reset_code: {
          recipientName: admin.name,
          code: "000000",
          expiresMinutes: 10,
          audience: "admin",
          appBaseUrl: appOrigin,
        },
        password_changed: {
          recipientName: admin.name,
          changedAtIso: new Date().toISOString(),
          audience: "admin",
          appBaseUrl: appOrigin,
        },
        online_access_confirmed: {
          recipientName: admin.name,
          startsAt: "2027-02-01T09:00:00.000Z",
          expiresAt: "2028-02-01T08:59:59.000Z",
          accessTypeLabel: "2027 Paid Online Access (Test Sample)",
          amountLabel: "₦3,500",
          reference: "BLD-TEST-PREVIEW",
          appBaseUrl: appOrigin,
        },
        online_access_expiry_reminder: {
          recipientName: admin.name,
          expiresAt: "2028-02-01T08:59:59.000Z",
          daysRemaining: 14,
          appBaseUrl: appOrigin,
        },
        online_access_renewed: {
          recipientName: admin.name,
          startsAt: "2028-02-01T09:00:00.000Z",
          expiresAt: "2029-02-01T08:59:59.000Z",
          amountLabel: "₦3,500",
          reference: "BLD-TEST-RENEW",
          appBaseUrl: appOrigin,
        },
        printed_order_received: {
          recipientName: admin.name,
          reference: "BLD-PRT-TEST",
          quantity: 1,
          subtotalKobo: 500000,
          destinationLabel: "Abuja, FCT",
          appBaseUrl: appOrigin,
        },
        delivery_quotation_ready: {
          recipientName: admin.name,
          reference: "BLD-PRT-TEST",
          quantity: 1,
          subtotalKobo: 500000,
          deliveryFeeKobo: 250000,
          finalTotalKobo: 750000,
          appBaseUrl: appOrigin,
        },
        printed_payment_confirmed: {
          recipientName: admin.name,
          reference: "BLD-PRT-TEST",
          quantity: 1,
          finalTotalKobo: 750000,
          appBaseUrl: appOrigin,
        },
        order_dispatched: {
          recipientName: admin.name,
          reference: "BLD-PRT-TEST",
          courierName: "GIG Logistics",
          trackingReference: "TEST-TRACK-01",
          destinationLabel: "Abuja, FCT",
          appBaseUrl: appOrigin,
        },
        order_delivered: {
          recipientName: admin.name,
          reference: "BLD-PRT-TEST",
          appBaseUrl: appOrigin,
        },
        admin_announcement: {
          recipientName: admin.name,
          title: "Sample Reader Community Update",
          body: "This is a test render of the Balanced Life Devotional community email template sent to your staff inbox.",
          actionPath: "/dashboard",
          actionLabel: "Open Balanced Life App",
          appBaseUrl: appOrigin,
        },
        daily_devotional_reminder: {
          recipientName: admin.name,
          date: "2027-02-01",
          devotionalTitle: "Standing Firm in Everyday Choices",
          theme: "Godliness & Purpose",
          bibleText: "Daniel 1:8–20",
          appBaseUrl: appOrigin,
        },
      };

      const result = await sendImmediateTransactionalEmail(store, emailService, {
        userId: null,
        recipientEmail: admin.email,
        recipientName: admin.name,
        templateId: input.templateId,
        payload: samplePayloads[input.templateId] as never,
        dedupeKey: `admin_test_email_${admin.id}_${input.templateId}_${Date.now()}`,
        redactCodeInAudit: input.templateId === "password_reset_code",
      });

      audit(
        admin,
        `Sent test email template "${input.templateId}" to staff address ${admin.email} (delivered: ${result.delivered})`,
        "email",
        input.templateId,
      );

      return {
        ok: result.delivered,
        sentTo: admin.email,
        subject: preview.subject,
        provider: result.provider,
        messageId: result.messageId || null,
        error: result.error || null,
      };
    },
  );

  app.post(prefix + "/admin/email/campaigns/preview", async (req) => {
    const input = adminEmailCampaignSchema.parse(req.body || {});
    requireAdminPermission(
      req,
      input.targetType === "individual"
        ? "notifications.write"
        : "notifications.broadcast",
    );
    return previewAdminEmailCampaign(store, input, appOrigin);
  });

  app.post(
    prefix + "/admin/email/campaigns",
    { config: { rateLimit: { max: 20, timeWindow: "15 minutes" } } },
    async (req) => {
      const input = adminEmailCampaignSchema.parse(req.body || {});
      const admin = requireAdminPermission(
        req,
        input.targetType === "individual"
          ? "notifications.write"
          : "notifications.broadcast",
      );
      return createAndQueueAdminEmailCampaign(
        store,
        actorOf(admin),
        input,
        emailService,
        appOrigin,
      );
    },
  );

  app.post(prefix + "/admin/email/campaigns/:id/cancel", async (req) => {
    const admin = requireAdminPermission(req, "notifications.write");
    const campaignId = idOf(req);
    const campaign = cancelAdminEmailCampaign(store, actorOf(admin), campaignId);
    return { ok: true, campaign };
  });

  app.post(prefix + "/admin/email/campaigns/:id/resume", async (req) => {
    const admin = requireAdminPermission(req, "notifications.write");
    const campaignId = idOf(req);
    const campaign = await resumeAdminEmailCampaign(
      store,
      actorOf(admin),
      campaignId,
      emailService,
      appOrigin,
    );
    return { ok: true, campaign };
  });

  app.post(
    prefix + "/admin/email/run-worker",
    { config: { rateLimit: { max: 15, timeWindow: "15 minutes" } } },
    async (req) => {
      const admin = requireAdminPermission(req, "notifications.write");
      const result = await runEmailWorkerCycle(store, emailService, appOrigin);
      audit(
        admin,
        `Executed email worker cycle (reminders: ${result.reminders.generatedCount}, sent: ${result.delivery.sentCount}, retrying: ${result.delivery.retryingCount}, failed: ${result.delivery.failedCount}, paused: ${result.delivery.pausedByQuotaCount ?? 0})`,
        "email",
        "worker",
      );
      return { ok: true, result };
    },
  );

  app.post(prefix + "/admin/email/queue/:id/retry", async (req) => {
    const admin = requireAdminPermission(req, "notifications.write");
    const queueId = idOf(req);
    const existing = db
      .select()
      .from(s.emailQueue)
      .where(eq(s.emailQueue.id, queueId))
      .get();
    if (!existing) {
      throw new HttpError(404, "Email queue entry not found.");
    }
    if (existing.status === "sent") {
      throw new HttpError(400, "Delivered emails do not need retry.");
    }
    const nowIso = new Date().toISOString();
    db.update(s.emailQueue)
      .set({
        status: "pending",
        attempts: 0,
        nextAttemptAt: nowIso,
        lockedUntil: null,
        lastError: "",
        updatedAt: nowIso,
      })
      .where(eq(s.emailQueue.id, queueId))
      .run();

    const delivery = await processEmailQueueBatch(store, emailService, {
      batchSize: 10,
      defaultAppBaseUrl: appOrigin,
    });
    audit(
      admin,
      `Requeued email #${queueId} (${existing.templateKey}) for retry`,
      "email_queue",
      queueId,
    );
    return { ok: true, delivery };
  });

  app.get(prefix + "/admin/activity", async (req) => {
    requireAdminPermission(req, "audit.read");
    const query = (req.query || {}) as {
      search?: string;
      entityType?: string;
      page?: string;
      limit?: string;
    };

    let rows = db
      .select({
        id: s.auditLogs.id,
        adminId: s.auditLogs.adminId,
        adminName: s.adminUsers.name,
        actorName: s.auditLogs.actorName,
        actorEmail: s.auditLogs.actorEmail,
        actorRole: s.auditLogs.actorRole,
        entityType: s.auditLogs.entityType,
        entityId: s.auditLogs.entityId,
        action: s.auditLogs.action,
        createdAt: s.auditLogs.createdAt,
      })
      .from(s.auditLogs)
      .leftJoin(s.adminUsers, eq(s.adminUsers.id, s.auditLogs.adminId))
      .orderBy(desc(s.auditLogs.id))
      .all()
      .map((row) => ({
        ...row,
        adminName: row.adminName || row.actorName || "Administrator",
      }));

    if (query.entityType && query.entityType !== "all") {
      rows = rows.filter((r) => r.entityType === query.entityType);
    }

    if (query.search?.trim()) {
      const q = query.search.trim().toLowerCase();
      rows = rows.filter((r) =>
        `${r.action} ${r.adminName} ${r.actorEmail} ${r.actorRole} ${r.entityType} ${r.entityId}`
          .toLowerCase()
          .includes(q),
      );
    }

    const entityTypes = Array.from(new Set(rows.map((r) => r.entityType))).sort();
    const total = rows.length;
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 40));
    const items = rows.slice((page - 1) * limit, page * limit);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      entityTypes,
    };
  });

  app.get(prefix + "/admin/staff", async (req) => {
    requireOwner(req);
    const now = new Date().toISOString();
    const staffRows = db
      .select()
      .from(s.adminUsers)
      .orderBy(asc(s.adminUsers.createdAt))
      .all();
    const activeSessions = db
      .select()
      .from(s.adminSessions)
      .where(gt(s.adminSessions.expiresAt, now))
      .all();

    const pendingLegacyAdmins = db
      .select({
        id: s.users.id,
        name: s.users.name,
        email: s.users.email,
        legacyAdminStatus: s.users.legacyAdminStatus,
      })
      .from(s.users)
      .where(eq(s.users.legacyAdminStatus, "pending_decision"))
      .all();

    return {
      staff: staffRows.map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        role: row.role,
        customPermissions: parseCustomAdminPermissions(row.customPermissionsJson),
        status: row.status,
        suspendedReason: row.suspendedReason,
        mfaEnabled: Boolean(row.mfaEnabled),
        mfaVerifiedAt: row.mfaVerifiedAt,
        lastLoginAt: row.lastLoginAt,
        lastActiveAt: row.lastActiveAt,
        activeSessionsCount: activeSessions.filter(
          (sess) => sess.adminId === row.id,
        ).length,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
      pendingLegacyAdmins,
    };
  });

  app.post(prefix + "/admin/staff", async (req) => {
    const owner = requireOwner(req);
    const input = staffCreateSchema.parse(req.body);
    assertStrongAdminPassword(input.password);

    const existingAdmin = db
      .select({ id: s.adminUsers.id })
      .from(s.adminUsers)
      .where(eq(s.adminUsers.email, input.email))
      .get();
    if (existingAdmin) {
      throw new HttpError(
        409,
        "An administrator account already uses that email address.",
      );
    }

    const readerCollision = db
      .select({ id: s.users.id })
      .from(s.users)
      .where(eq(s.users.email, input.email))
      .get();
    if (readerCollision) {
      throw new HttpError(
        409,
        "That email address is currently used by a reader account. Use a dedicated staff email address.",
      );
    }

    const now = new Date().toISOString();
    const passwordHash = await hashPassword(input.password);

    return sqlite.transaction(() => {
      const created = db
        .insert(s.adminUsers)
        .values({
          name: input.name,
          email: input.email,
          passwordHash,
          role: input.role,
          status: "active",
          suspendedReason: "",
          mfaEnabled: false,
          mfaSecretEnc: null,
          mfaPendingSecretEnc: null,
          mfaVerifiedAt: null,
          failedLoginAttempts: 0,
          lockedUntil: null,
          lastLoginAt: null,
          lastActiveAt: null,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();

      audit(
        owner,
        `Created administrator account ${created.email} (${created.role})`,
        "admin_staff",
        created.id,
      );

      return {
        id: created.id,
        name: created.name,
        email: created.email,
        role: created.role,
        status: created.status,
        mfaEnabled: false,
        createdAt: created.createdAt,
      };
    })();
  });

  app.patch(prefix + "/admin/staff/:id", async (req) => {
    const owner = requireOwner(req);
    const targetId = idOf(req);
    const input = staffUpdateSchema.parse(req.body);

    const existing = db
      .select()
      .from(s.adminUsers)
      .where(eq(s.adminUsers.id, targetId))
      .get();
    if (!existing) {
      throw new HttpError(404, "Administrator account not found.");
    }

    const nextRole = input.role ?? existing.role;
    const nextStatus = input.status ?? existing.status;

    if (
      targetId === owner.id &&
      (nextStatus === "suspended" || nextRole !== "owner")
    ) {
      throw new HttpError(
        400,
        "You cannot suspend or remove your own owner role.",
      );
    }

    if (
      existing.role === "owner" &&
      (nextRole !== "owner" || nextStatus === "suspended")
    ) {
      const otherActiveOwners = db
        .select()
        .from(s.adminUsers)
        .where(
          and(
            eq(s.adminUsers.role, "owner"),
            eq(s.adminUsers.status, "active"),
          ),
        )
        .all()
        .filter((a) => a.id !== existing.id);

      if (otherActiveOwners.length === 0) {
        throw new HttpError(
          400,
          "At least one active owner administrator account must remain.",
        );
      }
    }

    if (input.newPassword) {
      assertStrongAdminPassword(input.newPassword);
    }
    const newHash = input.newPassword
      ? await hashPassword(input.newPassword)
      : existing.passwordHash;
    const now = new Date().toISOString();

    const nextCustomPermissions =
      input.customPermissions !== undefined
        ? JSON.stringify(Array.from(new Set(input.customPermissions)))
        : existing.customPermissionsJson || "[]";

    return sqlite.transaction(() => {
      const updated = db
        .update(s.adminUsers)
        .set({
          name: input.name ?? existing.name,
          role: nextRole,
          customPermissionsJson: nextCustomPermissions,
          status: nextStatus,
          suspendedReason:
            nextStatus === "suspended"
              ? input.suspendedReason ?? existing.suspendedReason
              : "",
          passwordHash: newHash,
          mfaEnabled: input.resetMfa ? false : existing.mfaEnabled,
          mfaSecretEnc: input.resetMfa ? null : existing.mfaSecretEnc,
          mfaPendingSecretEnc: input.resetMfa
            ? null
            : existing.mfaPendingSecretEnc,
          mfaVerifiedAt: input.resetMfa ? null : existing.mfaVerifiedAt,
          failedLoginAttempts:
            input.status === "active" || input.newPassword
              ? 0
              : existing.failedLoginAttempts,
          lockedUntil:
            input.status === "active" || input.newPassword
              ? null
              : existing.lockedUntil,
          updatedAt: now,
        })
        .where(eq(s.adminUsers.id, targetId))
        .returning()
        .get();

      if (input.resetMfa) {
        db.delete(s.adminMfaRecoveryCodes)
          .where(eq(s.adminMfaRecoveryCodes.adminId, targetId))
          .run();
      }

      if (nextStatus === "suspended" || input.resetMfa || input.newPassword) {
        db.delete(s.adminSessions)
          .where(eq(s.adminSessions.adminId, targetId))
          .run();
      }

      const changes: string[] = [];
      if (nextRole !== existing.role) changes.push(`role=${nextRole}`);
      if (nextCustomPermissions !== (existing.customPermissionsJson || "[]")) {
        changes.push(`customPermissions=${nextCustomPermissions}`);
      }
      if (nextStatus !== existing.status) changes.push(`status=${nextStatus}`);
      if (input.resetMfa) changes.push("MFA reset (re-enrollment required)");
      if (input.newPassword) changes.push("password reset");
      if (input.name && input.name !== existing.name) {
        changes.push(`name="${input.name}"`);
      }

      audit(
        owner,
        `Updated staff account ${updated.email}${changes.length ? ` (${changes.join(", ")})` : ""}`,
        "admin_staff",
        updated.id,
      );

      return {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        role: updated.role,
        customPermissions: parseCustomAdminPermissions(
          updated.customPermissionsJson,
        ),
        status: updated.status,
        suspendedReason: updated.suspendedReason,
        mfaEnabled: Boolean(updated.mfaEnabled),
        updatedAt: updated.updatedAt,
      };
    })();
  });

  app.delete(prefix + "/admin/staff/:id/sessions", async (req) => {
    const owner = requireOwner(req);
    const targetId = idOf(req);
    const existing = db
      .select()
      .from(s.adminUsers)
      .where(eq(s.adminUsers.id, targetId))
      .get();
    if (!existing) {
      throw new HttpError(404, "Administrator account not found.");
    }

    db.delete(s.adminSessions)
      .where(eq(s.adminSessions.adminId, targetId))
      .run();

    audit(
      owner,
      `Revoked active sessions for administrator ${existing.email}`,
      "admin_staff",
      targetId,
    );

    return { ok: true };
  });
}


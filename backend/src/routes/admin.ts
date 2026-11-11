import type { FastifyInstance } from "fastify";
import { asc, desc, eq } from "drizzle-orm";
import type { Store } from "../db.js";
import * as s from "../schema.js";
import { requireAdmin } from "../auth.js";
import { HttpError } from "../errors.js";
import {
  adminBulkOrderUpdateSchema,
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
  getSubscriptionDetails,
  grantComplimentaryAccess,
  revokeSubscriptionAccess,
} from "../services/subscriptions.js";
import {
  getPrintedOrderById,
  getUserDigitalEntitlement,
  grantComplimentaryOnlineAccessAdmin,
  reconcileDigitalPurchaseAdmin,
  revokeOnlineAccessAdmin,
  updateBulkOrderAdmin,
  updatePrintedOrderAdmin,
} from "../services/commerce.js";
import type { PaymentProvider } from "../services/payments.js";
import {
  LiveWebPushProvider,
  runNotificationWorkerCycle,
  type WebPushProvider,
} from "../services/notifications.js";

export function registerAdminRoutes(
  app: FastifyInstance,
  prefix: string,
  store: Store,
  paymentProvider: PaymentProvider,
  pushProvider: WebPushProvider = new LiveWebPushProvider({}),
) {
  const { db, sqlite } = store;

  const audit = (adminId: number, action: string) =>
    db
      .insert(s.auditLogs)
      .values({ adminId, action, createdAt: new Date().toISOString() })
      .run();

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

  app.get(prefix + "/admin/overview", async (req) => {
    requireAdmin(req);
    const settings = getAppSettings(store);

    const progressRows = db.select().from(s.progress).all();
    const bookmarkRows = db.select().from(s.bookmarks).all();
    const inquiryRows = db
      .select()
      .from(s.inquiries)
      .orderBy(desc(s.inquiries.createdAt))
      .all();

    const printedOrderRows = db
      .select()
      .from(s.printedOrders)
      .orderBy(desc(s.printedOrders.createdAt))
      .all();
    const printedOrderItemsRows = db
      .select()
      .from(s.printedOrderItems)
      .all();

    const printedOrders = printedOrderRows.map((order) => ({
      ...order,
      items: printedOrderItemsRows.filter(
        (item) => item.orderId === order.id,
      ),
    }));

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

    const digitalPurchaseRowsRaw = db
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

    const enrichedUsers = allUsers.map((u) => {
      const sub = getSubscriptionDetails(
        store,
        u.id,
        settings.renewalReminderDays,
      );
      const digitalEntitlement = getUserDigitalEntitlement(store, u.id, 2027);
      const userCompletionsCount = progressRows.filter(
        (p) => p.userId === u.id,
      ).length;
      const userBookmarksCount = bookmarkRows.filter(
        (b) => b.userId === u.id,
      ).length;
      const userDigitalPurchasesCount = digitalPurchaseRowsRaw.filter(
        (dp) => dp.userId === u.id && dp.status === "succeeded",
      ).length;
      const userPrintedOrdersCount = printedOrders.filter(
        (po) => po.userId === u.id,
      ).length;

      const onlineAccessActive = Boolean(
        digitalEntitlement?.active || sub?.active,
      );
      const onlineAccessStatus =
        digitalEntitlement?.active || sub?.active
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
                : "none";

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
        completedReadingsCount: userCompletionsCount,
        bookmarksCount: userBookmarksCount,
        digitalPurchasesCount: userDigitalPurchasesCount,
        printedOrdersCount: userPrintedOrdersCount,
        planName:
          sub?.planName ||
          (digitalEntitlement ? "2027 Digital Devotional Access" : null),
        accessType:
          digitalEntitlement?.grantReason && !digitalEntitlement?.purchaseId
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

    const entries = db
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
      .all();

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

    const digitalPurchaseRows = digitalPurchaseRowsRaw.map((dp) => {
      const entitlement = getUserDigitalEntitlement(store, dp.userId, 2027);
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

    // Also include complimentary or legacy entitlements that do not have a row in digital_purchases
    const entitlementUsersWithPurchases = new Set(
      digitalPurchaseRows.map((dp) => dp.userId),
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
          productName: "2027 Digital Devotional Access (Complimentary)",
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

    const onlineAccessRecords = [
      ...digitalPurchaseRows,
      ...standaloneEntitlements,
    ];

    const bulkOrderRows = db
      .select()
      .from(s.bulkOrders)
      .orderBy(desc(s.bulkOrders.createdAt))
      .all();

    const readerUsers = enrichedUsers.filter((u) => u.role !== "admin");
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
    const expiringOnlineAccessSoon = readerUsers.filter(
      (u) =>
        Boolean(u.digitalEntitlement?.expiringSoon) ||
        Boolean(u.subscription?.renewalReminder?.dueSoon),
    ).length;
    const expiredOnlineAccess = readerUsers.filter(
      (u) => u.onlineAccessStatus === "expired",
    ).length;

    const activeEntitlementsCount = readerUsers.filter(
      (u) => Boolean(u.digitalEntitlement?.active),
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
    const verifiedDigitalEvents = [
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
    ];

    const verifiedPrintedEvents = printedOrders
      .filter((po) => po.paymentStatus === "paid" && po.currency === "NGN")
      .map((po) => ({
        date: (po.paidAt || po.createdAt).slice(0, 10),
        amountKobo: po.finalTotalKobo ?? po.subtotalKobo,
      }));

    const nowDate = new Date();
    const dailySeries = Array.from({ length: 14 }, (_, idx) => {
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
    });

    const weeklySeries = Array.from({ length: 8 }, (_, idx) => {
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
    });

    const monthlySeries = Array.from({ length: 6 }, (_, idx) => {
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
    });

    const registrationsByMonth = Array.from({ length: 6 }, (_, idx) => {
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
    });

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
    const ordersByFulfillmentStatus = fulfillmentStatuses.map((st) => ({
      ...st,
      count: printedOrders.filter((po) => po.fulfillmentStatus === st.status)
        .length,
    }));

    // Operational notifications for the administrator
    const operationalAlerts: Array<{
      id: string;
      severity: "high" | "medium" | "info";
      category:
        | "printed_order"
        | "payment_verification"
        | "online_access"
        | "bulk_order"
        | "inquiry";
      title: string;
      description: string;
      actionTab: string;
      createdAt: string;
    }> = [];

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

    for (const dp of digitalPurchaseRows) {
      if (dp.status === "verifying_transfer" || dp.status === "pending") {
        operationalAlerts.push({
          id: `dp_verify_${dp.id}`,
          severity: dp.status === "verifying_transfer" ? "high" : "medium",
          category: "payment_verification",
          title: `Digital Access Payment ${dp.status === "verifying_transfer" ? "Awaiting Transfer Verification" : "Pending"}: ${dp.reference}`,
          description: `${dp.userName} (${dp.email}) — ${dp.currency} ${(dp.amountKobo / 100).toLocaleString()}${dp.transferReference ? ` • Ref: ${dp.transferReference}` : ""}.`,
          actionTab: "online-access",
          createdAt: dp.updatedAt,
        });
      }
    }

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

    const pushEventsAll = db
      .select()
      .from(s.notificationEvents)
      .orderBy(desc(s.notificationEvents.createdAt))
      .limit(50)
      .all();
    const activePushDevicesCount = db
      .select()
      .from(s.pushSubscriptions)
      .where(eq(s.pushSubscriptions.status, "active"))
      .all().length;

    const auditRows = db
      .select({
        id: s.auditLogs.id,
        adminId: s.auditLogs.adminId,
        adminName: s.users.name,
        action: s.auditLogs.action,
        createdAt: s.auditLogs.createdAt,
      })
      .from(s.auditLogs)
      .leftJoin(s.users, eq(s.users.id, s.auditLogs.adminId))
      .orderBy(desc(s.auditLogs.id))
      .limit(60)
      .all();

    return {
      metrics: {
        readers: readerUsers.length,
        totalRegisteredReaders: readerUsers.length,
        activeOnlineReaders,
        expiringOnlineAccessSoon,
        expiredOnlineAccess,
        activeMemberships: activeSubs.length,
        paidMemberships: activeSubs.filter((u) => u.accessType === "paid")
          .length,
        complimentaryMemberships: activeSubs.filter(
          (u) => u.accessType === "complimentary",
        ).length,
        expiredMemberships: expiredSubs.length,
        activeEntitlementsCount,
        digitalEditionsSold: paidDigitalPurchasesCount,
        pendingDigitalPurchases: digitalPurchaseRows.filter(
          (dp) => dp.status === "pending" || dp.status === "verifying_transfer",
        ).length,
        pendingPrintedOrders: pendingPrintedOrdersCount,
        ordersAwaitingDelivery: ordersAwaitingDeliveryCount,
        deliveredOrders: deliveredOrdersCount,
        printedOrdersTotal: printedOrders.length,
        printedBooksCopiesOrdered,
        published: entries.filter((e) => e.published).length,
        drafts: entries.filter((e) => !e.published).length,
        approvedReadings: entries.filter((e) => e.reviewStatus === "approved")
          .length,
        needsRevisionReadings: entries.filter(
          (e) => e.reviewStatus === "needs_revision",
        ).length,
        completions: progressRows.length,
        bookmarks: bookmarkRows.length,
        subscriptionRevenueKobo,
        digitalRevenueKobo,
        digitalAccessRevenueKobo,
        printedBookRevenueKobo,
        totalSalesKobo: verifiedRevenueKobo,
        verifiedRevenueKobo,
        openInquiries: inquiryRows.filter((i) => i.status === "new").length,
        bulkOrderInquiries: bulkOrderRows.length,
        openBulkOrders: bulkOrderRows.filter(
          (b) => b.status === "new" || b.status === "quoted",
        ).length,
        activeAlertsCount: operationalAlerts.length,
      },
      charts: {
        salesByPeriod: {
          daily: dailySeries,
          weekly: weeklySeries,
          monthly: monthlySeries,
        },
        digitalVsPrinted: {
          digitalKobo: digitalAccessRevenueKobo,
          printedKobo: printedBookRevenueKobo,
          digitalCount: verifiedDigitalEvents.length,
          printedCount: verifiedPrintedEvents.length,
        },
        registrationsByMonth,
        ordersByFulfillmentStatus,
      },
      users: enrichedUsers,
      devotionals: entries,
      themes: db
        .select()
        .from(s.monthlyThemes)
        .orderBy(s.monthlyThemes.month)
        .all(),
      plans: db.select().from(s.plans).orderBy(s.plans.months).all(),
      payments: paymentRows,
      digitalPurchases: digitalPurchaseRows,
      onlineAccessRecords,
      printedOrders,
      bulkOrders: bulkOrderRows,
      inquiries: inquiryRows,
      operationalAlerts,
      pushStatusSummary: {
        configured: pushProvider.configured,
        activePushDevicesCount,
        recentEvents: pushEventsAll.slice(0, 20),
      },
      engagement: entries
        .filter((e) => e.published)
        .map((e) => ({
          id: e.id,
          date: e.date,
          title: e.title,
          completions: progressRows.filter((p) => p.devotionalId === e.id)
            .length,
          bookmarks: bookmarkRows.filter((b) => b.devotionalId === e.id).length,
        })),
      audit: auditRows,
      settings,
      paymentsConfig: {
        configured: paymentProvider.configured,
        provider: paymentProvider.name,
      },
    };
  });

  app.get(prefix + "/admin/devotionals", async (req) => {
    requireAdmin(req);
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
    requireAdmin(req);
    const entry = db
      .select()
      .from(s.devotionals)
      .where(eq(s.devotionals.id, idOf(req)))
      .get();
    if (!entry) throw new HttpError(404, "Devotional not found.");
    return entry;
  });

  app.post(prefix + "/admin/devotionals", async (req) => {
    const user = requireAdmin(req);
    const input = entrySchema.parse(req.body);
    const now = new Date().toISOString();
    const reviewStatus = input.published ? "approved" : input.reviewStatus;

    return sqlite.transaction(() => {
      const entry = db
        .insert(s.devotionals)
        .values({
          ...input,
          reviewStatus,
          reviewedAt: reviewStatus === "approved" ? now : null,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();
      if (input.published) syncMonthlyTheme(input.date, input.theme);
      audit(
        user.id,
        `Created devotional ${input.date}: ${input.title} (${input.published ? "published" : "draft"})`,
      );
      return entry;
    })();
  });

  app.put(prefix + "/admin/devotionals/:id", async (req) => {
    const user = requireAdmin(req);
    const id = idOf(req);
    const input = entrySchema.parse(req.body);
    const now = new Date().toISOString();
    const reviewStatus = input.published ? "approved" : input.reviewStatus;

    return sqlite.transaction(() => {
      const entry = db
        .update(s.devotionals)
        .set({
          ...input,
          reviewStatus,
          reviewedAt: reviewStatus === "approved" ? now : null,
          updatedAt: now,
        })
        .where(eq(s.devotionals.id, id))
        .returning()
        .get();

      if (!entry) throw new HttpError(404, "Devotional not found.");
      if (input.published) syncMonthlyTheme(input.date, input.theme);
      audit(
        user.id,
        `Updated devotional ${entry.date}: ${entry.title} (${entry.published ? "published" : "draft"}, ${entry.reviewStatus})`,
      );
      return entry;
    })();
  });

  app.patch(prefix + "/admin/devotionals/:id/status", async (req) => {
    const user = requireAdmin(req);
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
      const nextReviewStatus =
        input.reviewStatus ??
        (nextPublished ? "approved" : existing.reviewStatus);

      if (nextPublished) {
        if (nextReviewStatus === "needs_revision") {
          throw new HttpError(
            400,
            "Cannot publish an entry marked as needing revision.",
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
        user.id,
        `Updated status for ${updated.date} (${updated.title}): ${updated.published ? "published" : "draft"}, ${updated.reviewStatus}`,
      );
      return updated;
    })();
  });

  app.put(prefix + "/admin/themes/:month", async (req) => {
    const user = requireAdmin(req);
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

      audit(user.id, `Updated Month ${month} theme: ${input.title}`);
      return theme;
    })();
  });

  app.post(prefix + "/admin/users/:id/complimentary", async (req) => {
    const admin = requireAdmin(req);
    const targetUserId = idOf(req);
    const input = complimentaryGrantSchema.parse(req.body);
    const subscription = grantComplimentaryAccess(
      store,
      admin.id,
      targetUserId,
      input,
    );
    return { ok: true, subscription };
  });

  app.post(prefix + "/admin/users/:id/revoke-access", async (req) => {
    const admin = requireAdmin(req);
    const targetUserId = idOf(req);
    const { reason } = revokeAccessSchema.parse(req.body || {});
    const subscription = revokeSubscriptionAccess(
      store,
      admin.id,
      targetUserId,
      reason,
    );
    return { ok: true, subscription };
  });

  app.patch(prefix + "/admin/users/:id/status", async (req) => {
    const admin = requireAdmin(req);
    const targetUserId = idOf(req);
    if (targetUserId === admin.id) {
      throw new HttpError(400, "You cannot suspend your own admin account.");
    }
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
        admin.id,
        `${input.status === "suspended" ? "Suspended" : "Reactivated"} account ${updated.email}${input.reason ? ` (${input.reason})` : ""}`,
      );
      return { ok: true, status: updated.status };
    })();
  });

  app.patch(prefix + "/admin/plans/:id", async (req) => {
    const user = requireAdmin(req);
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
        user.id,
        `Updated plan ${plan.name}: NGN ${(plan.amountKobo / 100).toLocaleString()} (${plan.active ? "active" : "hidden"})`,
      );
      return plan;
    })();
  });

  app.patch(prefix + "/admin/inquiries/:id", async (req) => {
    const user = requireAdmin(req);
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
        user.id,
        `Updated inquiry #${result.id} (${result.name}) status to ${result.status}`,
      );
      return result;
    })();
  });

  app.post(prefix + "/admin/digital-purchases/:id/reconcile", async (req) => {
    const admin = requireAdmin(req);
    const purchaseId = idOf(req);
    const input = adminReconcileDigitalPurchaseSchema.parse(req.body);
    return reconcileDigitalPurchaseAdmin(store, admin.id, purchaseId, input);
  });

  app.post(
    prefix + "/admin/users/:id/online-access/grant",
    async (req) => {
      const admin = requireAdmin(req);
      const targetUserId = idOf(req);
      const input = complimentaryOnlineAccessGrantSchema.parse(req.body);
      const entitlement = grantComplimentaryOnlineAccessAdmin(
        store,
        admin.id,
        targetUserId,
        input,
      );
      return { ok: true, entitlement };
    },
  );

  app.post(
    prefix + "/admin/users/:id/online-access/revoke",
    async (req) => {
      const admin = requireAdmin(req);
      const targetUserId = idOf(req);
      const { reason } = revokeAccessSchema.parse(req.body || {});
      const entitlement = revokeOnlineAccessAdmin(
        store,
        admin.id,
        targetUserId,
        reason,
      );
      return { ok: true, entitlement };
    },
  );

  app.get(prefix + "/admin/printed-orders", async (req) => {
    requireAdmin(req);
    const orders = db
      .select()
      .from(s.printedOrders)
      .orderBy(desc(s.printedOrders.createdAt))
      .all();
    const items = db.select().from(s.printedOrderItems).all();
    return orders.map((order) => ({
      ...order,
      items: items.filter((item) => item.orderId === order.id),
    }));
  });

  app.get(prefix + "/admin/printed-orders/:id", async (req) => {
    requireAdmin(req);
    const order = getPrintedOrderById(store, idOf(req));
    if (!order) throw new HttpError(404, "Printed book order not found.");
    return order;
  });

  app.patch(prefix + "/admin/printed-orders/:id", async (req) => {
    const admin = requireAdmin(req);
    const orderId = idOf(req);
    const input = adminPrintedOrderUpdateSchema.parse(req.body);
    return updatePrintedOrderAdmin(store, admin.id, orderId, input);
  });

  app.patch(prefix + "/admin/bulk-orders/:id", async (req) => {
    const admin = requireAdmin(req);
    const bulkOrderId = idOf(req);
    const input = adminBulkOrderUpdateSchema.parse(req.body);
    return updateBulkOrderAdmin(store, admin.id, bulkOrderId, input);
  });

  app.get(prefix + "/admin/settings", async (req) => {
    requireAdmin(req);
    return getAppSettings(store);
  });

  app.put(prefix + "/admin/settings", async (req) => {
    const user = requireAdmin(req);
    const input = settingsUpdateSchema.parse(req.body);
    const settings = updateAppSettings(store, input);
    audit(user.id, "Updated application and organization settings");
    return settings;
  });

  app.post(
    prefix + "/admin/notifications/run-worker",
    { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } },
    async (req) => {
      const admin = requireAdmin(req);
      const result = await runNotificationWorkerCycle(store, pushProvider);
      audit(
        admin.id,
        `Executed notification worker cycle (generated: ${result.generatedCount}, sent: ${result.sentEvents})`,
      );
      return { ok: true, result };
    },
  );
}


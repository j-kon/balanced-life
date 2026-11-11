import type { FastifyInstance } from "fastify";
import { and, desc, eq } from "drizzle-orm";
import type { Store } from "../db.js";
import * as s from "../schema.js";
import { requireUser } from "../auth.js";
import { HttpError } from "../errors.js";
import {
  checkoutVerifySchema,
  digitalPurchaseInitiateSchema,
  digitalTransferProofSchema,
  idOf,
  journalCreateSchema,
  journalUpdateSchema,
  notificationPreferencesSchema,
  pushSubscriptionSchema,
  subscriptionPreferenceSchema,
} from "../validation.js";
import { getAppSettings } from "../services/settings.js";
import {
  getSubscriptionDetails,
  getUserPayments,
  hasPremiumAccess,
  hasSubscriptionAccess,
  verifyAndActivatePayment,
} from "../services/subscriptions.js";
import {
  getUserDigitalEntitlement,
  getUserDigitalPurchases,
  getUserPrintedOrders,
  hasActiveDigitalEntitlement,
  initiateDigitalPurchase,
  submitBankTransferProof,
  verifyAndActivateDigitalPurchase,
} from "../services/commerce.js";
import {
  SUPPORTED_TIMEZONES,
  getNotificationPreferences,
  getUnreadNotificationCount,
  getUserNotifications,
  getUserPushDevices,
  getUserPushSubscriptionsCount,
  markAllNotificationsRead,
  markNotificationRead,
  removePushSubscription,
  removePushSubscriptionById,
  savePushSubscription,
  sendUserTestNotification,
  updateNotificationPreferences,
  type WebPushProvider,
} from "../services/notifications.js";
import {
  computeReadingStreakDays,
  getReaderAccessSummary,
} from "../services/access.js";
import type { PaymentProvider } from "../services/payments.js";
import { formatEntryMetadata, getAuthorizedEntry } from "./public.js";
import { z } from "zod";

export function registerReaderRoutes(
  app: FastifyInstance,
  prefix: string,
  store: Store,
  paymentProvider: PaymentProvider,
  appOrigin: string,
  pushProvider: WebPushProvider,
) {
  const { db } = store;

  app.get(prefix + "/me/dashboard", async (req) => {
    const user = requireUser(req);
    const currentDate = new Date().toISOString().slice(0, 10);
    const isUpcomingYear = currentDate < "2027-01-01";
    const access = getReaderAccessSummary(store, user);
    const canReadPremium = access.hasAccess;
    const subscriptionAccess = hasSubscriptionAccess(store, user);
    const digitalAccess = hasActiveDigitalEntitlement(store, user.id, 2027);
    const digitalEntitlement = access.entitlement;

    const notifications = getUserNotifications(store, user.id, { limit: 15 });
    const unreadNotificationsCount = getUnreadNotificationCount(store, user.id);
    const notificationPreferences = getNotificationPreferences(store, user.id);
    const streakDays = computeReadingStreakDays(
      store,
      user.id,
      notificationPreferences.timezone,
    );

    const entries = db
      .select()
      .from(s.devotionals)
      .where(eq(s.devotionals.published, true))
      .orderBy(s.devotionals.date)
      .all()
      .map((e) => formatEntryMetadata(store, e, user));

    const done = db
      .select()
      .from(s.progress)
      .where(eq(s.progress.userId, user.id))
      .orderBy(desc(s.progress.completedAt))
      .all();

    const savedRows = db
      .select()
      .from(s.bookmarks)
      .where(eq(s.bookmarks.userId, user.id))
      .all();

    const journalRows = db
      .select({ id: s.journals.id })
      .from(s.journals)
      .where(eq(s.journals.userId, user.id))
      .all();

    const accessibleEntries = entries.filter(
      (e) => e.sample || canReadPremium,
    );
    const freeSample = entries.find((e) => e.sample) || null;
    const todayEntry = entries.find((e) => e.date === currentDate) || null;
    const todayEntryUnavailable =
      !isUpcomingYear && (!todayEntry || (!todayEntry.sample && !canReadPremium));

    const featured = canReadPremium
      ? todayEntry ||
        accessibleEntries.find((e) => !e.completed) ||
        accessibleEntries[0] ||
        null
      : freeSample;

    const continueReading = canReadPremium
      ? accessibleEntries.find((e) => !e.completed) ||
        accessibleEntries[0] ||
        null
      : freeSample;

    const lockedPreviews = !canReadPremium
      ? entries.filter((e) => !e.sample).slice(0, 6)
      : [];

    return {
      currentDate,
      isUpcomingYear,
      accessStatus: access.status,
      access,
      onboardingCompleted: Boolean(user.onboardingCompletedAt),
      hasAccess: canReadPremium,
      hasSubscriptionAccess: subscriptionAccess,
      hasDigitalEditionAccess: digitalAccess,
      digitalEntitlement,
      completed: done.length,
      streakDays,
      bookmarksCount: savedRows.length,
      journalsCount: journalRows.length,
      freeSample,
      todayEntryUnavailable,
      lockedPreviews,
      featured,
      continueReading,
      history: done
        .slice(0, 8)
        .map((p) => {
          const entry = entries.find((e) => e.id === p.devotionalId);
          return entry ? { ...entry, completedAt: p.completedAt } : null;
        })
        .filter(Boolean),
      subscription: access.subscription,
      printedOrders: getUserPrintedOrders(store, user),
      notifications,
      unreadNotificationsCount,
      notificationPreferences,
    };
  });

  app.get(prefix + "/me/printed-orders", async (req) => {
    const user = requireUser(req);
    return getUserPrintedOrders(store, user);
  });

  app.get(prefix + "/me/progress", async (req) => {
    const user = requireUser(req);
    const entries = db
      .select()
      .from(s.devotionals)
      .where(eq(s.devotionals.published, true))
      .orderBy(s.devotionals.date)
      .all();

    const done = db
      .select()
      .from(s.progress)
      .where(eq(s.progress.userId, user.id))
      .orderBy(desc(s.progress.completedAt))
      .all();

    const doneMap = new Map(done.map((d) => [d.devotionalId, d.completedAt]));

    const monthlyBreakdown = Array.from({ length: 12 }, (_, idx) => {
      const month = idx + 1;
      const monthEntries = entries.filter(
        (e) => Number(e.date.slice(5, 7)) === month,
      );
      const completedInMonth = monthEntries.filter((e) =>
        doneMap.has(e.id),
      ).length;
      return {
        month,
        publishedCount: monthEntries.length,
        completedCount: completedInMonth,
      };
    });

    return {
      totalCompleted: done.length,
      totalPublished: entries.length,
      monthlyBreakdown,
      completedEntries: done
        .map((d) => {
          const entry = entries.find((e) => e.id === d.devotionalId);
          return entry
            ? {
                ...formatEntryMetadata(store, entry, user),
                completedAt: d.completedAt,
              }
            : null;
        })
        .filter(Boolean),
    };
  });

  app.post(prefix + "/me/progress/:id", async (req) => {
    const user = requireUser(req);
    const id = idOf(req);
    getAuthorizedEntry(store, id, user);
    const { completed } = z.object({ completed: z.boolean() }).parse(req.body);
    if (completed) {
      db.insert(s.progress)
        .values({
          userId: user.id,
          devotionalId: id,
          completedAt: new Date().toISOString(),
        })
        .onConflictDoNothing()
        .run();
    } else {
      db.delete(s.progress)
        .where(
          and(eq(s.progress.userId, user.id), eq(s.progress.devotionalId, id)),
        )
        .run();
    }
    return { ok: true };
  });

  app.get(prefix + "/me/bookmarks", async (req) => {
    const user = requireUser(req);
    const rows = db
      .select({
        entry: s.devotionals,
        bookmarkedAt: s.bookmarks.createdAt,
      })
      .from(s.bookmarks)
      .innerJoin(
        s.devotionals,
        eq(s.devotionals.id, s.bookmarks.devotionalId),
      )
      .where(
        and(
          eq(s.bookmarks.userId, user.id),
          eq(s.devotionals.published, true),
        ),
      )
      .orderBy(desc(s.bookmarks.createdAt))
      .all();

    return rows.map((r) => ({
      ...formatEntryMetadata(store, r.entry, user),
      bookmarkedAt: r.bookmarkedAt,
    }));
  });

  app.post(prefix + "/me/bookmarks/:id", async (req) => {
    const user = requireUser(req);
    const id = idOf(req);
    getAuthorizedEntry(store, id, user);
    const { saved } = z.object({ saved: z.boolean() }).parse(req.body);
    if (saved) {
      db.insert(s.bookmarks)
        .values({
          userId: user.id,
          devotionalId: id,
          createdAt: new Date().toISOString(),
        })
        .onConflictDoNothing()
        .run();
    } else {
      db.delete(s.bookmarks)
        .where(
          and(
            eq(s.bookmarks.userId, user.id),
            eq(s.bookmarks.devotionalId, id),
          ),
        )
        .run();
    }
    return { ok: true };
  });

  app.get(prefix + "/me/journal", async (req) => {
    const user = requireUser(req);
    return db
      .select({
        id: s.journals.id,
        title: s.journals.title,
        body: s.journals.body,
        lessonLearned: s.journals.lessonLearned,
        actionStep: s.journals.actionStep,
        prayerFocus: s.journals.prayerFocus,
        createdAt: s.journals.createdAt,
        updatedAt: s.journals.updatedAt,
        devotionalId: s.journals.devotionalId,
        devotionalTitle: s.devotionals.title,
        devotionalDate: s.devotionals.date,
      })
      .from(s.journals)
      .leftJoin(s.devotionals, eq(s.devotionals.id, s.journals.devotionalId))
      .where(eq(s.journals.userId, user.id))
      .orderBy(desc(s.journals.createdAt))
      .all();
  });

  app.post(prefix + "/me/journal", async (req) => {
    const user = requireUser(req);
    const input = journalCreateSchema.parse(req.body);
    if (input.devotionalId) {
      getAuthorizedEntry(store, input.devotionalId, user);
    }
    const now = new Date().toISOString();
    return store.sqlite.transaction(() => {
      const created = db
        .insert(s.journals)
        .values({
          userId: user.id,
          devotionalId: input.devotionalId,
          title: input.title,
          body: input.body,
          lessonLearned: input.lessonLearned,
          actionStep: input.actionStep,
          prayerFocus: input.prayerFocus,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();

      if (input.devotionalId && typeof input.completed === "boolean") {
        if (input.completed) {
          db.insert(s.progress)
            .values({
              userId: user.id,
              devotionalId: input.devotionalId,
              completedAt: now,
            })
            .onConflictDoNothing()
            .run();
        } else {
          db.delete(s.progress)
            .where(
              and(
                eq(s.progress.userId, user.id),
                eq(s.progress.devotionalId, input.devotionalId),
              ),
            )
            .run();
        }
      }

      return created;
    })();
  });

  app.put(prefix + "/me/journal/:id", async (req) => {
    const user = requireUser(req);
    const id = idOf(req);
    const input = journalUpdateSchema.parse(req.body);
    const now = new Date().toISOString();
    return store.sqlite.transaction(() => {
      const updated = db
        .update(s.journals)
        .set({
          ...(input.title !== undefined ? { title: input.title } : {}),
          body: input.body,
          ...(input.lessonLearned !== undefined
            ? { lessonLearned: input.lessonLearned }
            : {}),
          ...(input.actionStep !== undefined
            ? { actionStep: input.actionStep }
            : {}),
          ...(input.prayerFocus !== undefined
            ? { prayerFocus: input.prayerFocus }
            : {}),
          updatedAt: now,
        })
        .where(and(eq(s.journals.id, id), eq(s.journals.userId, user.id)))
        .returning()
        .get();

      if (!updated) throw new HttpError(404, "Reflection not found.");

      if (updated.devotionalId && typeof input.completed === "boolean") {
        if (input.completed) {
          db.insert(s.progress)
            .values({
              userId: user.id,
              devotionalId: updated.devotionalId,
              completedAt: now,
            })
            .onConflictDoNothing()
            .run();
        } else {
          db.delete(s.progress)
            .where(
              and(
                eq(s.progress.userId, user.id),
                eq(s.progress.devotionalId, updated.devotionalId),
              ),
            )
            .run();
        }
      }

      return updated;
    })();
  });

  app.delete(prefix + "/me/journal/:id", async (req) => {
    const user = requireUser(req);
    const result = db
      .delete(s.journals)
      .where(and(eq(s.journals.id, idOf(req)), eq(s.journals.userId, user.id)))
      .run();
    if (!result.changes) throw new HttpError(404, "Reflection not found.");
    return { ok: true };
  });

  app.get(prefix + "/me/subscription", async (req) => {
    const user = requireUser(req);
    const settings = getAppSettings(store);
    const subscription = getSubscriptionDetails(
      store,
      user.id,
      settings.renewalReminderDays,
    );
    const digitalEntitlement = getUserDigitalEntitlement(store, user.id, 2027);
    return {
      subscription,
      digitalEntitlement,
      digitalPurchases: getUserDigitalPurchases(store, user.id),
      printedOrders: getUserPrintedOrders(store, user),
      active: hasPremiumAccess(store, user),
      payments: getUserPayments(store, user.id),
      paymentProvider: {
        name: paymentProvider.name,
        configured: paymentProvider.configured,
        publicKey: paymentProvider.publicKey,
        enableAutoRenewal: settings.enableAutoRenewal,
      },
    };
  });

  app.patch(prefix + "/me/subscription", async (req) => {
    const user = requireUser(req);
    const input = subscriptionPreferenceSchema.parse(req.body);
    const current = getSubscriptionDetails(store, user.id);
    if (!current) {
      throw new HttpError(404, "No membership found.");
    }
    if (current.status === "revoked") {
      throw new HttpError(400, "This membership has been revoked.");
    }

    const now = new Date().toISOString();
    const cancelAtPeriodEnd =
      input.cancelAtPeriodEnd ?? current.cancelAtPeriodEnd;
    const renewalMode = input.renewalMode ?? current.renewalMode;
    const status =
      current.expiresAt <= now
        ? "expired"
        : cancelAtPeriodEnd
          ? "cancelled"
          : "active";

    db.update(s.subscriptions)
      .set({
        renewalMode,
        cancelAtPeriodEnd,
        status,
        updatedAt: now,
      })
      .where(eq(s.subscriptions.userId, user.id))
      .run();

    return {
      ok: true,
      subscription: getSubscriptionDetails(store, user.id),
    };
  });

  app.post(
    prefix + "/subscriptions/checkout",
    { config: { rateLimit: { max: 20, timeWindow: "15 minutes" } } },
    async (req) => {
      requireUser(req);
      throw new HttpError(410, "Recurring memberships are no longer offered. Get one-time 2027 online access for ₦3,500.");
    },
  );

  app.post(
    prefix + "/subscriptions/verify",
    { config: { rateLimit: { max: 30, timeWindow: "15 minutes" } } },
    async (req) => {
      const user = requireUser(req);
      const { reference } = checkoutVerifySchema.parse(req.body);
      return verifyAndActivatePayment(
        store,
        reference,
        paymentProvider,
        user.id,
      );
    },
  );

  app.get(prefix + "/me/digital-edition", async (req) => {
    const user = requireUser(req);
    const settings = getAppSettings(store);
    const entitlement = getUserDigitalEntitlement(store, user.id, 2027);
    return {
      entitlement,
      active: Boolean(entitlement && entitlement.active),
      purchases: getUserDigitalPurchases(store, user.id),
      product: {
        editionYear: 2027,
        amountKobo: settings.digitalEditionPriceKobo,
        durationMonths: settings.digitalAccessDurationMonths,
        available: settings.digitalEditionAvailability === "available",
        accessScope: settings.digitalEditionScope,
        note: settings.digitalEditionNote,
      },
      paymentProvider: {
        name: paymentProvider.name,
        configured: paymentProvider.configured,
        publicKey: paymentProvider.publicKey,
      },
      bankTransfer: {
        enabled: settings.bankTransferEnabled,
        instructions: settings.bankTransferInstructions,
        accounts: settings.bankTransferEnabled ? settings.bankAccounts : [],
      },
    };
  });

  app.post(
    prefix + "/digital-purchases/checkout",
    { config: { rateLimit: { max: 20, timeWindow: "15 minutes" } } },
    async (req) => {
      const user = requireUser(req);
      const input = digitalPurchaseInitiateSchema.parse(req.body || {});
      return initiateDigitalPurchase(
        store,
        user,
        input,
        paymentProvider,
        appOrigin,
      );
    },
  );

  app.post(
    prefix + "/digital-purchases/verify",
    { config: { rateLimit: { max: 30, timeWindow: "15 minutes" } } },
    async (req) => {
      const user = requireUser(req);
      const { reference } = checkoutVerifySchema.parse(req.body);
      return verifyAndActivateDigitalPurchase(
        store,
        reference,
        paymentProvider,
        user.id,
      );
    },
  );

  app.post(
    prefix + "/digital-purchases/:id/transfer-proof",
    { config: { rateLimit: { max: 15, timeWindow: "15 minutes" } } },
    async (req) => {
      const user = requireUser(req);
      const purchaseId = idOf(req);
      const input = digitalTransferProofSchema.parse(req.body);
      const purchase = submitBankTransferProof(
        store,
        user.id,
        purchaseId,
        input,
      );
      return { ok: true, purchase };
    },
  );

  app.get(prefix + "/me/notifications", async (req) => {
    const user = requireUser(req);
    const q = (req.query || {}) as { filter?: string; limit?: string };
    const filter = q.filter === "unread" ? "unread" : "all";
    const limit = Math.min(Math.max(1, Number(q.limit) || 50), 100);
    return {
      preferences: getNotificationPreferences(store, user.id),
      pushSubscriptionsCount: getUserPushSubscriptionsCount(store, user.id),
      devices: getUserPushDevices(store, user.id),
      events: getUserNotifications(store, user.id, { filter, limit }),
      unreadCount: getUnreadNotificationCount(store, user.id),
      webPush: {
        configured: pushProvider.configured,
        publicKey: pushProvider.publicKey,
      },
      supportedTimezones: SUPPORTED_TIMEZONES,
    };
  });

  app.post(prefix + "/me/notifications/read-all", async (req) => {
    const user = requireUser(req);
    return markAllNotificationsRead(store, user.id);
  });

  app.patch(
    prefix + "/me/notifications/preferences",
    { config: { rateLimit: { max: 30, timeWindow: "15 minutes" } } },
    async (req) => {
      const user = requireUser(req);
      const input = notificationPreferencesSchema.parse(req.body);
      return {
        ok: true,
        preferences: updateNotificationPreferences(store, user.id, input),
      };
    },
  );

  app.post(
    prefix + "/me/notifications/push-subscribe",
    { config: { rateLimit: { max: 20, timeWindow: "15 minutes" } } },
    async (req) => {
      const user = requireUser(req);
      const input = pushSubscriptionSchema.parse(req.body);
      const saved = savePushSubscription(store, user.id, input);
      return {
        ok: true,
        subscriptionId: saved.id,
        pushSubscriptionsCount: getUserPushSubscriptionsCount(store, user.id),
        devices: getUserPushDevices(store, user.id),
      };
    },
  );

  app.post(
    prefix + "/me/notifications/push-unsubscribe",
    { config: { rateLimit: { max: 20, timeWindow: "15 minutes" } } },
    async (req) => {
      const user = requireUser(req);
      const { endpoint } = z
        .object({ endpoint: z.string().trim().optional() })
        .parse(req.body || {});
      removePushSubscription(store, user.id, endpoint);
      return {
        ok: true,
        pushSubscriptionsCount: getUserPushSubscriptionsCount(store, user.id),
        devices: getUserPushDevices(store, user.id),
      };
    },
  );

  app.delete(
    prefix + "/me/notifications/devices/:id",
    { config: { rateLimit: { max: 20, timeWindow: "15 minutes" } } },
    async (req) => {
      const user = requireUser(req);
      const deviceId = idOf(req);
      removePushSubscriptionById(store, user.id, deviceId);
      return {
        ok: true,
        pushSubscriptionsCount: getUserPushSubscriptionsCount(store, user.id),
        devices: getUserPushDevices(store, user.id),
      };
    },
  );

  app.post(
    prefix + "/me/notifications/test",
    { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } },
    async (req) => {
      const user = requireUser(req);
      return sendUserTestNotification(store, user.id, pushProvider);
    },
  );

  app.post(prefix + "/me/notifications/:id/read", async (req) => {
    const user = requireUser(req);
    const id = idOf(req);
    return markNotificationRead(store, user.id, id);
  });
}


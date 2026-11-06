import type { FastifyInstance } from "fastify";
import { and, desc, eq } from "drizzle-orm";
import type { Store } from "../db.js";
import * as s from "../schema.js";
import { requireUser } from "../auth.js";
import { HttpError } from "../errors.js";
import {
  checkoutInitiateSchema,
  checkoutVerifySchema,
  idOf,
  journalCreateSchema,
  journalUpdateSchema,
  subscriptionPreferenceSchema,
} from "../validation.js";
import { getAppSettings } from "../services/settings.js";
import {
  getSubscriptionDetails,
  getUserPayments,
  hasPremiumAccess,
  initiatePaystackCheckout,
  verifyAndActivatePayment,
} from "../services/subscriptions.js";
import type { PaymentProvider } from "../services/payments.js";
import { formatEntryMetadata, getAuthorizedEntry } from "./public.js";
import { z } from "zod";

export function registerReaderRoutes(
  app: FastifyInstance,
  prefix: string,
  store: Store,
  paymentProvider: PaymentProvider,
  appOrigin: string,
) {
  const { db } = store;

  app.get(prefix + "/me/dashboard", async (req) => {
    const user = requireUser(req);
    const settings = getAppSettings(store);
    const currentDate = new Date().toISOString().slice(0, 10);
    const isUpcomingYear = currentDate < "2027-01-01";
    const canReadPremium = hasPremiumAccess(store, user);

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

    const featured =
      entries.find((e) => e.date === currentDate) ||
      accessibleEntries.find((e) => !e.completed) ||
      entries.find((e) => e.sample) ||
      entries[0] ||
      null;

    const continueReading =
      accessibleEntries.find((e) => !e.completed) ||
      entries.find((e) => !e.completed) ||
      null;

    return {
      currentDate,
      isUpcomingYear,
      hasAccess: canReadPremium,
      completed: done.length,
      bookmarksCount: savedRows.length,
      journalsCount: journalRows.length,
      featured,
      continueReading,
      history: done
        .slice(0, 8)
        .map((p) => {
          const entry = entries.find((e) => e.id === p.devotionalId);
          return entry ? { ...entry, completedAt: p.completedAt } : null;
        })
        .filter(Boolean),
      subscription: getSubscriptionDetails(
        store,
        user.id,
        settings.renewalReminderDays,
      ),
    };
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
    return db
      .insert(s.journals)
      .values({
        userId: user.id,
        devotionalId: input.devotionalId,
        title: input.title,
        body: input.body,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: s.journals.id })
      .get();
  });

  app.put(prefix + "/me/journal/:id", async (req) => {
    const user = requireUser(req);
    const id = idOf(req);
    const input = journalUpdateSchema.parse(req.body);
    const now = new Date().toISOString();
    const updated = db
      .update(s.journals)
      .set({
        ...(input.title !== undefined ? { title: input.title } : {}),
        body: input.body,
        updatedAt: now,
      })
      .where(and(eq(s.journals.id, id), eq(s.journals.userId, user.id)))
      .returning()
      .get();

    if (!updated) throw new HttpError(404, "Reflection not found.");
    return updated;
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
    return {
      subscription,
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
      const user = requireUser(req);
      const input = checkoutInitiateSchema.parse(req.body);
      return initiatePaystackCheckout(
        store,
        user,
        input,
        paymentProvider,
        appOrigin,
      );
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
}


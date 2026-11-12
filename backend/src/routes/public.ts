import type { FastifyInstance } from "fastify";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { root, type Store } from "../db.js";
import * as s from "../schema.js";
import type { PublicUser } from "../auth.js";
import { HttpError } from "../errors.js";
import {
  bulkOrderCreateSchema,
  emailUnsubscribeSchema,
  emailWebhookEventSchema,
  idOf,
  inquiryCreateSchema,
  printedOrderAccessRequestSchema,
  printedOrderCreateSchema,
  printedOrderLookupSchema,
  printedOrderPayInitiateSchema,
  printedOrderQuoteApproveSchema,
  printedOrderVerifySchema,
} from "../validation.js";
import { timingSafeEqual } from "node:crypto";
import { getEnvConfig } from "../config.js";
import {
  applyEmailUnsubscribe,
  maskEmailAddress,
  processEmailQueueBatch,
  processEmailWebhookEvent,
  verifyEmailUnsubscribeToken,
} from "../services/emailQueue.js";
import { getNotificationPreferences } from "../services/notifications.js";
import { getAppSettings } from "../services/settings.js";
import {
  hasPremiumAccess,
  verifyAndActivatePayment,
} from "../services/subscriptions.js";
import {
  approvePrintedOrderQuoteCustomer,
  createBulkOrder,
  createPrintedOrder,
  initiatePrintedOrderPayment,
  issuePrintedOrderAccessToken,
  lookupPrintedOrderAuthorized,
  verifyAndActivateDigitalPurchase,
  verifyPrintedOrderPayment,
} from "../services/commerce.js";
import type { PaymentProvider } from "../services/payments.js";
import type { EmailService } from "../services/email.js";
import type { WebPushProvider } from "../services/notifications.js";

export function formatEntryMetadata(
  store: Store,
  entry: typeof s.devotionals.$inferSelect,
  user: PublicUser | null,
) {
  const { db } = store;
  return {
    id: entry.id,
    date: entry.date,
    title: entry.title,
    theme: entry.theme,
    sample: entry.sample,
    published: entry.published,
    completed: user
      ? Boolean(
          db
            .select()
            .from(s.progress)
            .where(
              and(
                eq(s.progress.userId, user.id),
                eq(s.progress.devotionalId, entry.id),
              ),
            )
            .get(),
        )
      : false,
    saved: user
      ? Boolean(
          db
            .select()
            .from(s.bookmarks)
            .where(
              and(
                eq(s.bookmarks.userId, user.id),
                eq(s.bookmarks.devotionalId, entry.id),
              ),
            )
            .get(),
        )
      : false,
  };
}

export function getAuthorizedEntry(
  store: Store,
  id: number,
  user: PublicUser | null,
) {
  const entry = store.db
    .select()
    .from(s.devotionals)
    .where(eq(s.devotionals.id, id))
    .get();

  if (!entry || !entry.published) {
    throw new HttpError(404, "This reading is not available.");
  }
  if (!entry.sample && !hasPremiumAccess(store, user)) {
    throw new HttpError(
      403,
      "An active membership or 2027 Digital Edition purchase is needed to read this devotional.",
    );
  }
  return entry;
}

export function registerPublicRoutes(
  app: FastifyInstance,
  prefix: string,
  store: Store,
  paymentProvider: PaymentProvider,
  emailService: EmailService,
  pushProvider?: WebPushProvider,
  appOrigin = "http://localhost:5173",
) {
  const { db } = store;

  app.get(prefix + "/health", async () => ({ status: "ok" }));

  app.get(prefix + "/config", async () => {
    const currentDate = new Date().toISOString().slice(0, 10);
    const settings = getAppSettings(store);
    const publishedCount = db
      .select({ count: sql<number>`count(*)` })
      .from(s.devotionals)
      .where(eq(s.devotionals.published, true))
      .get()!.count;
    const totalEntriesCount = db
      .select({ count: sql<number>`count(*)` })
      .from(s.devotionals)
      .get()!.count;

    return {
      currentDate,
      isUpcomingYear: currentDate < "2027-01-01",
      cover: existsSync(resolve(root, "frontend/public/brand/book-cover.png"))
        ? "/brand/book-cover.png"
        : null,
      authorPortrait: existsSync(
        resolve(root, "frontend/public/brand/author-profile.png"),
      )
        ? "/brand/author-profile.png"
        : null,
      publishedCount,
      totalEntriesCount,
      themes: db
        .select()
        .from(s.monthlyThemes)
        .orderBy(s.monthlyThemes.month)
        .all(),
      settings: {
        ...settings,
        bankAccounts: settings.bankTransferEnabled ? settings.bankAccounts : [],
      },
      payments: {
        configured: paymentProvider.configured,
        mode:
          paymentProvider.mode ||
          (paymentProvider.configured ? "test" : "unconfigured"),
        provider: paymentProvider.name,
        publicKey: paymentProvider.publicKey,
      },
      email: {
        configured: emailService.configured,
        provider: emailService.providerName || "none",
      },
      webPush: {
        configured: Boolean(pushProvider?.configured),
        publicKey: pushProvider?.publicKey || null,
      },
    };
  });

  // Kept as an empty compatibility endpoint; recurring plans are no longer sold.
  app.get(prefix + "/plans", async () => []);

  app.get(prefix + "/themes", async () => {
    const themes = db
      .select()
      .from(s.monthlyThemes)
      .orderBy(s.monthlyThemes.month)
      .all();
    const publishedEntries = db
      .select({ id: s.devotionals.id, date: s.devotionals.date })
      .from(s.devotionals)
      .where(eq(s.devotionals.published, true))
      .all();

    return themes.map((t) => ({
      ...t,
      publishedReadings: publishedEntries.filter(
        (e) => Number(e.date.slice(5, 7)) === t.month,
      ).length,
    }));
  });

  app.get(prefix + "/devotionals", async (req) => {
    const query = (req.query || {}) as {
      month?: string;
      theme?: string;
      search?: string;
      sort?: string;
    };
    const rows = db
      .select()
      .from(s.devotionals)
      .where(eq(s.devotionals.published, true))
      .orderBy(
        query.sort === "desc"
          ? desc(s.devotionals.date)
          : asc(s.devotionals.date),
      )
      .all();

    let items = rows.map((e) => formatEntryMetadata(store, e, req.user));

    if (query.month && query.month !== "all") {
      const m = Number(query.month);
      if (!Number.isNaN(m)) {
        items = items.filter((e) => Number(e.date.slice(5, 7)) === m);
      }
    }
    if (query.theme && query.theme !== "all") {
      items = items.filter((e) => e.theme === query.theme);
    }
    if (query.search?.trim()) {
      const q = query.search.trim().toLowerCase();
      items = items.filter((e) =>
        `${e.date} ${e.title} ${e.theme}`.toLowerCase().includes(q),
      );
    }

    return items;
  });

  app.get(prefix + "/devotionals/:id", async (req) => {
    const id = idOf(req);
    const e = getAuthorizedEntry(store, id, req.user);

    const publishedIds = db
      .select({
        id: s.devotionals.id,
        sample: s.devotionals.sample,
      })
      .from(s.devotionals)
      .where(eq(s.devotionals.published, true))
      .orderBy(s.devotionals.date)
      .all();

    const premiumAllowed = hasPremiumAccess(store, req.user);
    const accessibleIds = publishedIds
      .filter((item) => item.sample || premiumAllowed)
      .map((item) => item.id);
    const idx = accessibleIds.indexOf(e.id);

    const accountabilityEntry = req.user
      ? db
          .select()
          .from(s.journals)
          .where(
            and(
              eq(s.journals.userId, req.user.id),
              eq(s.journals.devotionalId, e.id),
            ),
          )
          .orderBy(desc(s.journals.updatedAt))
          .get() || null
      : null;

    return {
      ...e,
      ...formatEntryMetadata(store, e, req.user),
      accountabilityEntry,
      previousId: idx > 0 ? accessibleIds[idx - 1] : null,
      nextId:
        idx >= 0 && idx < accessibleIds.length - 1
          ? accessibleIds[idx + 1]
          : null,
      sourcePages: undefined,
      reviewerNotes: undefined,
    };
  });

  app.post(
    prefix + "/inquiries",
    { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } },
    async (req) => {
      const input = inquiryCreateSchema.parse(req.body);
      const now = new Date().toISOString();
      return db
        .insert(s.inquiries)
        .values({
          ...input,
          status: "new",
          adminNotes: "",
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: s.inquiries.id })
        .get();
    },
  );

  app.post(
    prefix + "/bulk-orders",
    { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } },
    async (req) => {
      const input = bulkOrderCreateSchema.parse(req.body);
      return createBulkOrder(store, input, req.user?.id ?? null);
    },
  );

  app.post(
    prefix + "/printed-orders",
    { config: { rateLimit: { max: 15, timeWindow: "15 minutes" } } },
    async (req) => {
      const input = printedOrderCreateSchema.parse(req.body);
      const result = createPrintedOrder(store, input, req.user?.id ?? null);
      if (emailService.configured) {
        await processEmailQueueBatch(store, emailService, {
          batchSize: 5,
          defaultAppBaseUrl: appOrigin,
        }).catch(() => undefined);
      }
      return result;
    },
  );

  app.get(
    prefix + "/printed-orders/lookup",
    { config: { rateLimit: { max: 30, timeWindow: "15 minutes" } } },
    async (req) => {
      const input = printedOrderLookupSchema.parse(req.query || {});
      const headerToken =
        (req.headers["x-order-token"] as string | undefined) ||
        (req.headers["x-order-access-token"] as string | undefined) ||
        null;
      return lookupPrintedOrderAuthorized(store, input.orderNumber, {
        user: req.user,
        token: input.token || headerToken,
      });
    },
  );

  app.post(
    prefix + "/printed-orders/request-access",
    { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } },
    async (req) => {
      const input = printedOrderAccessRequestSchema.parse(req.body || {});
      if (!emailService.configured || !emailService.sendOrderAccessLink) {
        throw new HttpError(
          503,
          "Automated order-access link delivery is not configured in this environment. Configure EMAIL_PROVIDER and credentials to enable email links, or sign in with the purchasing account / contact Cossy Teens Consult Enterprises.",
        );
      }

      const row = db
        .select({
          id: s.printedOrders.id,
          orderNumber: s.printedOrders.orderNumber,
          fullName: s.printedOrders.fullName,
          email: s.printedOrders.email,
        })
        .from(s.printedOrders)
        .where(
          eq(
            s.printedOrders.orderNumber,
            input.orderNumber.trim().toUpperCase(),
          ),
        )
        .get();

      if (row && row.email.toLowerCase() === input.email.toLowerCase()) {
        const expiresInMinutes = 60;
        const issued = issuePrintedOrderAccessToken(
          store,
          row.id,
          expiresInMinutes,
        );
        const accessUrl = `${appOrigin}/bookstore?order=${encodeURIComponent(row.orderNumber)}&token=${encodeURIComponent(issued.token)}`;
        const sent = await emailService.sendOrderAccessLink({
          to: row.email,
          name: row.fullName,
          orderNumber: row.orderNumber,
          accessUrl,
          expiresInMinutes,
        });
        if (!sent.delivered) {
          throw new HttpError(
            503,
            sent.error
              ? `Unable to deliver the order access email right now: ${sent.error}`
              : "Unable to deliver the order access email right now. Please try again shortly.",
          );
        }
      }

      return {
        ok: true,
        message:
          "If a printed book order matches that order number and email address, an expiring access link has been sent.",
      };
    },
  );

  app.post(
    prefix + "/printed-orders/:id/approve-quote",
    { config: { rateLimit: { max: 20, timeWindow: "15 minutes" } } },
    async (req) => {
      const orderId = idOf(req);
      const input = printedOrderQuoteApproveSchema.parse(req.body || {});
      const headerToken =
        (req.headers["x-order-token"] as string | undefined) ||
        (req.headers["x-order-access-token"] as string | undefined) ||
        null;
      return approvePrintedOrderQuoteCustomer(store, orderId, {
        user: req.user,
        token: input.orderAccessToken || input.token || headerToken,
      });
    },
  );

  app.post(
    prefix + "/printed-orders/:id/pay",
    { config: { rateLimit: { max: 20, timeWindow: "15 minutes" } } },
    async (req) => {
      const orderId = idOf(req);
      const input = printedOrderPayInitiateSchema.parse(req.body || {});
      const headerToken =
        (req.headers["x-order-token"] as string | undefined) ||
        (req.headers["x-order-access-token"] as string | undefined) ||
        null;
      return initiatePrintedOrderPayment(
        store,
        orderId,
        input,
        paymentProvider,
        appOrigin,
        {
          user: req.user,
          token: input.orderAccessToken || input.token || headerToken,
        },
      );
    },
  );

  app.post(
    prefix + "/printed-orders/verify",
    { config: { rateLimit: { max: 30, timeWindow: "15 minutes" } } },
    async (req) => {
      const { reference, token, orderAccessToken } =
        printedOrderVerifySchema.parse(req.body);
      const headerToken =
        (req.headers["x-order-token"] as string | undefined) ||
        (req.headers["x-order-access-token"] as string | undefined) ||
        null;
      const result = await verifyPrintedOrderPayment(
        store,
        reference,
        paymentProvider,
        {
          user: req.user,
          token: orderAccessToken || token || headerToken,
          isWebhook: false,
        },
      );
      if (emailService.configured) {
        await processEmailQueueBatch(store, emailService, {
          batchSize: 5,
          defaultAppBaseUrl: appOrigin,
        }).catch(() => undefined);
      }
      return result;
    },
  );

  app.get(prefix + "/email/unsubscribe", async (req) => {
    const token = String((req.query as { token?: string })?.token || "").trim();
    const verified = verifyEmailUnsubscribeToken(token);
    if (!verified) {
      throw new HttpError(400, "This unsubscribe link is invalid or has expired.");
    }
    const user = db
      .select({
        id: s.users.id,
        name: s.users.name,
        email: s.users.email,
        role: s.users.role,
      })
      .from(s.users)
      .where(eq(s.users.id, verified.userId))
      .get();
    if (!user || user.role !== "reader") {
      throw new HttpError(404, "Reader account not found.");
    }
    const prefs = getNotificationPreferences(store, user.id);
    return {
      valid: true,
      scope: verified.scope,
      readerName: user.name,
      maskedEmail: maskEmailAddress(user.email),
      preferences: {
        emailDailyReminderEnabled: Boolean(prefs.emailDailyReminderEnabled),
        emailAnnouncementsEnabled: Boolean(prefs.emailAnnouncementsEnabled),
        emailCommunityUpdatesEnabled: Boolean(prefs.emailCommunityUpdatesEnabled),
        subscriptionAlertsEnabled: Boolean(prefs.subscriptionAlertsEnabled),
      },
    };
  });

  app.post(
    prefix + "/email/unsubscribe",
    { config: { rateLimit: { max: 30, timeWindow: "15 minutes" } } },
    async (req) => {
      const input = emailUnsubscribeSchema.parse(req.body || {});
      return applyEmailUnsubscribe(store, {
        token: input.token,
        scopeOverride: input.scope,
      });
    },
  );

  app.post(
    prefix + "/webhooks/email",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (req) => {
      const env = getEnvConfig();
      const expectedSecret = env.email.webhookSecret;
      if (expectedSecret) {
        const provided = String(
          req.headers["x-email-webhook-secret"] || "",
        ).trim();
        const a = Buffer.from(provided, "utf8");
        const b = Buffer.from(expectedSecret, "utf8");
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          throw new HttpError(401, "Invalid email webhook secret.");
        }
      } else if (env.isProduction) {
        throw new HttpError(
          503,
          "Email webhook secret is not configured in this environment.",
        );
      }
      const parsed = emailWebhookEventSchema.parse(req.body || {});
      return processEmailWebhookEvent(store, parsed);
    },
  );

  app.post(
    prefix + "/webhooks/paystack",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req) => {
      const signature = String(req.headers["x-paystack-signature"] || "");
      const rawBody =
        (req as { rawBody?: string }).rawBody ||
        JSON.stringify(req.body || {});
      if (!paymentProvider.verifyWebhookSignature(rawBody, signature)) {
        throw new HttpError(401, "Invalid Paystack webhook signature.");
      }

      const payload = (req.body || {}) as {
        event?: string;
        data?: { reference?: string };
      };
      const reference = String(payload.data?.reference || "").trim();
      if (payload.event !== "charge.success" || !reference) {
        return { received: true, processed: false };
      }

      const digitalPurchase = db
        .select()
        .from(s.digitalPurchases)
        .where(eq(s.digitalPurchases.reference, reference))
        .get();
      if (digitalPurchase) {
        await verifyAndActivateDigitalPurchase(
          store,
          reference,
          paymentProvider,
        );
        if (emailService.configured) {
          await processEmailQueueBatch(store, emailService, {
            batchSize: 5,
            defaultAppBaseUrl: appOrigin,
          }).catch(() => undefined);
        }
        return { received: true, processed: true, kind: "digital_edition" };
      }

      const printedOrder = db
        .select()
        .from(s.printedOrders)
        .where(eq(s.printedOrders.paymentReference, reference))
        .get();
      if (printedOrder) {
        await verifyPrintedOrderPayment(store, reference, paymentProvider, {
          isWebhook: true,
        });
        if (emailService.configured) {
          await processEmailQueueBatch(store, emailService, {
            batchSize: 5,
            defaultAppBaseUrl: appOrigin,
          }).catch(() => undefined);
        }
        return { received: true, processed: true, kind: "printed_order" };
      }

      const subscriptionPayment = db
        .select()
        .from(s.payments)
        .where(eq(s.payments.reference, reference))
        .get();
      if (subscriptionPayment) {
        await verifyAndActivatePayment(store, reference, paymentProvider);
        return { received: true, processed: true, kind: "subscription" };
      }

      return { received: true, processed: false };
    },
  );
}


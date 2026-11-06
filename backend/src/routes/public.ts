import type { FastifyInstance } from "fastify";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { root, type Store } from "../db.js";
import * as s from "../schema.js";
import type { PublicUser } from "../auth.js";
import { HttpError } from "../errors.js";
import { idOf, inquiryCreateSchema } from "../validation.js";
import { getAppSettings } from "../services/settings.js";
import { hasPremiumAccess } from "../services/subscriptions.js";
import type { PaymentProvider } from "../services/payments.js";
import type { EmailService } from "../services/email.js";

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

  if (!entry || (!entry.published && user?.role !== "admin")) {
    throw new HttpError(404, "This reading is not available.");
  }
  if (!entry.sample && !hasPremiumAccess(store, user)) {
    throw new HttpError(
      403,
      "An active membership is needed to read this devotional.",
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
      settings,
      payments: {
        configured: paymentProvider.configured,
        provider: paymentProvider.name,
        publicKey: paymentProvider.publicKey,
      },
      email: {
        configured: emailService.configured,
      },
    };
  });

  app.get(prefix + "/plans", async () =>
    db
      .select()
      .from(s.plans)
      .where(eq(s.plans.active, true))
      .orderBy(s.plans.months)
      .all(),
  );

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

    return {
      ...e,
      ...formatEntryMetadata(store, e, req.user),
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
}


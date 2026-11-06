import type { FastifyInstance } from "fastify";
import { asc, desc, eq } from "drizzle-orm";
import type { Store } from "../db.js";
import * as s from "../schema.js";
import { requireAdmin } from "../auth.js";
import { HttpError } from "../errors.js";
import {
  complimentaryGrantSchema,
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
import type { PaymentProvider } from "../services/payments.js";

export function registerAdminRoutes(
  app: FastifyInstance,
  prefix: string,
  store: Store,
  paymentProvider: PaymentProvider,
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

    const allUsers = db
      .select({
        id: s.users.id,
        name: s.users.name,
        email: s.users.email,
        role: s.users.role,
        status: s.users.status,
        suspendedReason: s.users.suspendedReason,
        createdAt: s.users.createdAt,
      })
      .from(s.users)
      .orderBy(desc(s.users.createdAt))
      .all();

    const enrichedUsers = allUsers.map((u) => {
      const sub = getSubscriptionDetails(
        store,
        u.id,
        settings.renewalReminderDays,
      );
      return {
        ...u,
        subscription: sub,
        planName: sub?.planName || null,
        accessType: sub?.accessType || null,
        subscriptionStatus: sub?.effectiveStatus || "none",
        expiresAt: sub?.expiresAt || null,
        renewalMode: sub?.renewalMode || null,
        cancelAtPeriodEnd: sub?.cancelAtPeriodEnd || false,
        grantReason: sub?.grantReason || "",
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

    const progressRows = db.select().from(s.progress).all();
    const bookmarkRows = db.select().from(s.bookmarks).all();
    const inquiryRows = db
      .select()
      .from(s.inquiries)
      .orderBy(desc(s.inquiries.createdAt))
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

    const verifiedRevenueKobo = paymentRows
      .filter((p) => p.status === "succeeded" && p.provider === "paystack")
      .reduce((sum, p) => sum + p.amountKobo, 0);

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
      .limit(40)
      .all();

    return {
      metrics: {
        readers: readerUsers.length,
        activeMemberships: activeSubs.length,
        paidMemberships: activeSubs.filter((u) => u.accessType === "paid")
          .length,
        complimentaryMemberships: activeSubs.filter(
          (u) => u.accessType === "complimentary",
        ).length,
        expiredMemberships: expiredSubs.length,
        published: entries.filter((e) => e.published).length,
        drafts: entries.filter((e) => !e.published).length,
        approvedReadings: entries.filter((e) => e.reviewStatus === "approved")
          .length,
        needsRevisionReadings: entries.filter(
          (e) => e.reviewStatus === "needs_revision",
        ).length,
        completions: progressRows.length,
        bookmarks: bookmarkRows.length,
        verifiedRevenueKobo,
        openInquiries: inquiryRows.filter((i) => i.status === "new").length,
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
      inquiries: inquiryRows,
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
}


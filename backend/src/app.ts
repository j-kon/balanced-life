import Fastify, { type FastifyRequest, type FastifyReply } from "fastify";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import helmet from "@fastify/helmet";
import { z, ZodError } from "zod";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { openDatabase, root } from "./db.js";
import * as s from "./schema.js";
import { hashPassword, verifyPassword, newToken, tokenHash } from "./auth.js";
import { seedDatabase, demoAccounts } from "./demo-seed.js";
import { activateDemo, HttpError } from "./subscriptions.js";
import { DemoPaymentProvider } from "./payments.js";
type PublicUser = { id: number; name: string; email: string; role: string };
declare module "fastify" {
  interface FastifyRequest {
    user: PublicUser | null;
  }
}
const publicUser = (user: typeof s.users.$inferSelect): PublicUser => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
});
const yearDate = z
  .string()
  .regex(/^2027-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
    "Use a valid date in 2027.",
  );
const entrySchema = z
  .object({
    date: yearDate,
    title: z.string().trim().min(1).max(300),
    theme: z.string().trim().max(300).default(""),
    bibleText: z.string().max(10000).default(""),
    memoryVerse: z.string().max(10000).default(""),
    reflection: z.string().max(30000).default(""),
    thinkAbout: z.string().max(10000).default(""),
    prayer: z.string().max(10000).default(""),
    challenge: z.string().max(10000).default(""),
    sample: z.boolean().default(false),
    published: z.boolean().default(false),
  })
  .refine(
    (d) =>
      !d.published ||
      [
        d.bibleText,
        d.memoryVerse,
        d.reflection,
        d.thinkAbout,
        d.prayer,
        d.challenge,
      ].every((v) => v.trim().length > 0),
    "All reading sections are required before publishing.",
  );
const idOf = (req: FastifyRequest) =>
  z.coerce
    .number()
    .int()
    .positive()
    .parse((req.params as { id: string }).id);
const requireUser = (req: FastifyRequest) => {
  if (!req.user) throw new HttpError(401, "Sign in to continue.");
  return req.user;
};
const requireAdmin = (req: FastifyRequest) => {
  const user = requireUser(req);
  if (user.role !== "admin")
    throw new HttpError(403, "Administrator access required.");
  return user;
};
export async function buildApp(
  options: {
    databasePath?: string;
    demo?: boolean;
    seed?: boolean;
    environment?: string;
  } = {},
) {
  const environment =
    options.environment || process.env.NODE_ENV || "development";
  const demo =
    options.demo ??
    (process.env.DEMO_MODE !== "false" && environment !== "production");
  if (demo && environment === "production")
    throw new Error("Demo mode cannot run in production.");
  const store = openDatabase(options.databasePath),
    { db, sqlite } = store;
  if (options.seed) await seedDatabase(store, demo);
  const app = Fastify({
    logger:
      environment === "development" && process.env.LOG_REQUESTS === "true",
    bodyLimit: 128 * 1024,
  });
  await app.register(cookie);
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });
  app.decorateRequest("user", null);
  const origins = new Set([
    process.env.APP_ORIGIN || "http://localhost:5173",
    "http://127.0.0.1:5173",
  ]);
  app.addHook("onRequest", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      if (
        req.headers["x-requested-with"] !== "BalancedLife" ||
        (req.headers.origin && !origins.has(req.headers.origin)) ||
        req.headers["sec-fetch-site"] === "cross-site"
      )
        throw new HttpError(403, "Request origin could not be verified.");
    }
    const token = req.cookies.balanced_session;
    if (token) {
      const row = db
        .select({ user: s.users })
        .from(s.sessions)
        .innerJoin(s.users, eq(s.users.id, s.sessions.userId))
        .where(
          and(
            eq(s.sessions.tokenHash, tokenHash(token)),
            gt(s.sessions.expiresAt, new Date().toISOString()),
          ),
        )
        .get();
      if (row) req.user = publicUser(row.user);
    }
  });
  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof ZodError)
      return reply
        .code(400)
        .send({ message: error.issues.map((i) => i.message).join(" ") });
    if (error instanceof HttpError)
      return reply.code(error.statusCode).send({ message: error.message });
    const err = error as Error & { code?: string; statusCode?: number };
    if (err.code?.includes("SQLITE_CONSTRAINT_UNIQUE"))
      return reply
        .code(409)
        .send({
          message: "This email address, date, or reference already exists.",
        });
    if (err.statusCode && err.statusCode < 500)
      return reply.code(err.statusCode).send({ message: err.message });
    app.log.error(error);
    return reply
      .code(500)
      .send({
        message: "The request could not be completed. Please try again.",
      });
  });
  app.addHook("onClose", async () => {
    sqlite.close();
  });
  const prefix = "/api/v1";
  const currentSubscription = (userId: number) =>
    db
      .select({
        id: s.subscriptions.id,
        userId: s.subscriptions.userId,
        planId: s.subscriptions.planId,
        planName: s.plans.name,
        expiresAt: s.subscriptions.expiresAt,
        startedAt: s.subscriptions.startedAt,
        renewalMode: s.subscriptions.renewalMode,
        cancelAtPeriodEnd: s.subscriptions.cancelAtPeriodEnd,
        isDemo: s.subscriptions.isDemo,
      })
      .from(s.subscriptions)
      .innerJoin(s.plans, eq(s.plans.id, s.subscriptions.planId))
      .where(eq(s.subscriptions.userId, userId))
      .get() || null;
  const hasAccess = (user: PublicUser | null) =>
    !!user &&
    (user.role === "admin" ||
      !!db
        .select()
        .from(s.subscriptions)
        .where(
          and(
            eq(s.subscriptions.userId, user.id),
            gt(s.subscriptions.expiresAt, new Date().toISOString()),
          ),
        )
        .get());
  const getEntry = (id: number, user: PublicUser | null) => {
    const entry = db
      .select()
      .from(s.devotionals)
      .where(eq(s.devotionals.id, id))
      .get();
    if (!entry || (!entry.published && user?.role !== "admin"))
      throw new HttpError(404, "This reading is not available.");
    if (!entry.sample && !hasAccess(user))
      throw new HttpError(
        403,
        "An active membership is needed to read this devotional.",
      );
    return entry;
  };
  const metadata = (
    entry: typeof s.devotionals.$inferSelect,
    user: PublicUser | null,
  ) => ({
    id: entry.id,
    date: entry.date,
    title: entry.title,
    theme: entry.theme,
    sample: entry.sample,
    published: entry.published,
    completed: user
      ? !!db
          .select()
          .from(s.progress)
          .where(
            and(
              eq(s.progress.userId, user.id),
              eq(s.progress.devotionalId, entry.id),
            ),
          )
          .get()
      : false,
    saved: user
      ? !!db
          .select()
          .from(s.bookmarks)
          .where(
            and(
              eq(s.bookmarks.userId, user.id),
              eq(s.bookmarks.devotionalId, entry.id),
            ),
          )
          .get()
      : false,
  });
  const refDate = () =>
    demo
      ? db
          .select()
          .from(s.settings)
          .where(eq(s.settings.key, "referenceDate"))
          .get()?.value || "2027-01-01"
      : new Date().toISOString().slice(0, 10);
  const audit = (adminId: number, action: string) =>
    db
      .insert(s.auditLogs)
      .values({ adminId, action, createdAt: new Date().toISOString() })
      .run();
  async function establish(
    user: typeof s.users.$inferSelect,
    req: FastifyRequest,
    reply: FastifyReply,
  ) {
    if (req.cookies.balanced_session)
      db.delete(s.sessions)
        .where(
          eq(s.sessions.tokenHash, tokenHash(req.cookies.balanced_session)),
        )
        .run();
    db.delete(s.sessions)
      .where(sql`${s.sessions.expiresAt} <= ${new Date().toISOString()}`)
      .run();
    const token = newToken();
    db.insert(s.sessions)
      .values({
        tokenHash: tokenHash(token),
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
      })
      .run();
    reply.setCookie("balanced_session", token, {
      httpOnly: true,
      secure: environment === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 7 * 86400,
    });
    return { user: publicUser(user) };
  }
  app.get(prefix + "/health", async () => ({ status: "ok" }));
  app.get(prefix + "/config", async () => ({
    demo,
    referenceDate: refDate(),
    cover: existsSync(resolve(root, "frontend/public/brand/book-cover.png"))
      ? "/brand/book-cover.png"
      : null,
    importedCount: db
      .select({ count: sql<number>`count(*)` })
      .from(s.devotionals)
      .where(eq(s.devotionals.published, true))
      .get()!.count,
    themes: db
      .select()
      .from(s.monthlyThemes)
      .orderBy(s.monthlyThemes.month)
      .all(),
  }));
  app.get(prefix + "/auth/me", async (req) => ({ user: req.user }));
  app.post(
    prefix + "/auth/register",
    { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } },
    async (req, reply) => {
      const input = z
        .object({
          name: z.string().trim().min(2).max(100),
          email: z
            .email()
            .max(254)
            .transform((v) => v.toLowerCase()),
          password: z.string().min(10).max(128),
        })
        .parse(req.body);
      const user = db
        .insert(s.users)
        .values({
          name: input.name,
          email: input.email,
          passwordHash: await hashPassword(input.password),
          role: "reader",
          createdAt: new Date().toISOString(),
        })
        .returning()
        .get();
      return establish(user, req, reply);
    },
  );
  app.post(
    prefix + "/auth/login",
    { config: { rateLimit: { max: 20, timeWindow: "15 minutes" } } },
    async (req, reply) => {
      const input = z
        .object({
          email: z
            .email()
            .max(254)
            .transform((v) => v.toLowerCase()),
          password: z.string().min(1).max(128),
        })
        .parse(req.body);
      const user = db
        .select()
        .from(s.users)
        .where(eq(s.users.email, input.email))
        .get();
      // Always perform the password derivation, including for unknown accounts.
      const valid = await verifyPassword(
        input.password,
        user?.passwordHash ||
          "00000000000000000000000000000000:" + "00".repeat(64),
      );
      if (!user || !valid)
        throw new HttpError(401, "Email or password is incorrect.");
      return establish(user, req, reply);
    },
  );
  app.post(
    prefix + "/auth/demo",
    { config: { rateLimit: { max: 30, timeWindow: "15 minutes" } } },
    async (req, reply) => {
      if (!demo) throw new HttpError(404, "Not found.");
      const { role } = z
        .object({ role: z.enum(["admin", "subscriber", "guest"]) })
        .parse(req.body);
      const account = demoAccounts.find((a) => a.demoRole === role)!;
      const user = db
        .select()
        .from(s.users)
        .where(eq(s.users.email, account.email))
        .get();
      if (!user)
        throw new HttpError(
          503,
          "Run npm run seed to create the local demo accounts.",
        );
      return establish(user, req, reply);
    },
  );
  app.post(prefix + "/auth/logout", async (req, reply) => {
    if (req.cookies.balanced_session)
      db.delete(s.sessions)
        .where(
          eq(s.sessions.tokenHash, tokenHash(req.cookies.balanced_session)),
        )
        .run();
    reply.clearCookie("balanced_session", { path: "/" });
    return { ok: true };
  });
  app.get(prefix + "/plans", async () =>
    db
      .select()
      .from(s.plans)
      .where(eq(s.plans.active, true))
      .orderBy(s.plans.months)
      .all(),
  );
  app.get(prefix + "/devotionals", async (req) =>
    db
      .select()
      .from(s.devotionals)
      .where(eq(s.devotionals.published, true))
      .orderBy(s.devotionals.date)
      .all()
      .map((e) => metadata(e, req.user)),
  );
  app.get(prefix + "/devotionals/:id", async (req) => {
    const e = getEntry(idOf(req), req.user);
    return { ...e, ...metadata(e, req.user), sourcePages: undefined };
  });
  app.get(prefix + "/me/dashboard", async (req) => {
    const user = requireUser(req);
    const entries = db
      .select()
      .from(s.devotionals)
      .where(eq(s.devotionals.published, true))
      .orderBy(s.devotionals.date)
      .all()
      .map((e) => metadata(e, user));
    const done = db
      .select()
      .from(s.progress)
      .where(eq(s.progress.userId, user.id))
      .orderBy(desc(s.progress.completedAt))
      .all();
    return {
      completed: done.length,
      featured: entries.find((e) => e.date === refDate()) || null,
      continueReading: entries.find((e) => !e.completed) || null,
      history: done
        .slice(0, 8)
        .map((p) => entries.find((e) => e.id === p.devotionalId))
        .filter(Boolean),
      subscription: currentSubscription(user.id),
    };
  });
  app.post(prefix + "/me/progress/:id", async (req) => {
    const user = requireUser(req),
      id = idOf(req);
    getEntry(id, user);
    const { completed } = z.object({ completed: z.boolean() }).parse(req.body);
    if (completed)
      db.insert(s.progress)
        .values({
          userId: user.id,
          devotionalId: id,
          completedAt: new Date().toISOString(),
        })
        .onConflictDoNothing()
        .run();
    else
      db.delete(s.progress)
        .where(
          and(eq(s.progress.userId, user.id), eq(s.progress.devotionalId, id)),
        )
        .run();
    return { ok: true };
  });
  app.post(prefix + "/me/bookmarks/:id", async (req) => {
    const user = requireUser(req),
      id = idOf(req);
    getEntry(id, user);
    const { saved } = z.object({ saved: z.boolean() }).parse(req.body);
    if (saved)
      db.insert(s.bookmarks)
        .values({
          userId: user.id,
          devotionalId: id,
          createdAt: new Date().toISOString(),
        })
        .onConflictDoNothing()
        .run();
    else
      db.delete(s.bookmarks)
        .where(
          and(
            eq(s.bookmarks.userId, user.id),
            eq(s.bookmarks.devotionalId, id),
          ),
        )
        .run();
    return { ok: true };
  });
  app.get(prefix + "/me/journal", async (req) => {
    const user = requireUser(req);
    return db
      .select({
        id: s.journals.id,
        body: s.journals.body,
        createdAt: s.journals.createdAt,
        devotionalId: s.journals.devotionalId,
        devotionalTitle: s.devotionals.title,
      })
      .from(s.journals)
      .leftJoin(s.devotionals, eq(s.devotionals.id, s.journals.devotionalId))
      .where(eq(s.journals.userId, user.id))
      .orderBy(desc(s.journals.createdAt))
      .all();
  });
  app.post(prefix + "/me/journal", async (req) => {
    const user = requireUser(req);
    const input = z
      .object({
        devotionalId: z.number().int().positive().optional(),
        body: z.string().trim().min(1).max(10000),
      })
      .parse(req.body);
    if (input.devotionalId) getEntry(input.devotionalId, user);
    return db
      .insert(s.journals)
      .values({
        ...input,
        userId: user.id,
        createdAt: new Date().toISOString(),
      })
      .returning({ id: s.journals.id })
      .get();
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
    return {
      subscription: currentSubscription(user.id),
      active: hasAccess(user),
      payments: db
        .select()
        .from(s.payments)
        .where(eq(s.payments.userId, user.id))
        .orderBy(desc(s.payments.createdAt))
        .all(),
    };
  });
  app.patch(prefix + "/me/subscription", async (req) => {
    const user = requireUser(req);
    const input = z
      .object({
        renewalMode: z.enum(["manual", "automatic"]).optional(),
        cancelAtPeriodEnd: z.boolean().optional(),
      })
      .refine((v) => Object.keys(v).length > 0, "Choose a renewal setting.")
      .parse(req.body);
    if (!currentSubscription(user.id))
      throw new HttpError(404, "No membership found.");
    db.update(s.subscriptions)
      .set(input)
      .where(eq(s.subscriptions.userId, user.id))
      .run();
    return { ok: true };
  });
  app.post(
    prefix + "/checkout/demo",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (req) => {
      const user = requireUser(req);
      if (!demo) throw new HttpError(404, "Demo checkout is disabled.");
      const input = z
        .object({
          planId: z.number().int().positive(),
          renewalMode: z.enum(["manual", "automatic"]),
          reference: z
            .string()
            .min(16)
            .max(100)
            .regex(/^[a-zA-Z0-9_-]+$/),
        })
        .parse(req.body);
      return activateDemo(
        store,
        user.id,
        input,
        new DemoPaymentProvider(demo, environment),
      );
    },
  );
  app.post(
    prefix + "/inquiries",
    { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } },
    async (req) => {
      const input = z
        .object({
          name: z.string().trim().min(2).max(100),
          email: z.email().max(254),
          message: z.string().trim().max(2000).default(""),
        })
        .parse(req.body);
      return db
        .insert(s.inquiries)
        .values({ ...input, createdAt: new Date().toISOString() })
        .returning({ id: s.inquiries.id })
        .get();
    },
  );
  app.get(prefix + "/admin/overview", async (req) => {
    requireAdmin(req);
    const users = db
      .select({
        id: s.users.id,
        name: s.users.name,
        email: s.users.email,
        role: s.users.role,
        planName: s.plans.name,
        expiresAt: s.subscriptions.expiresAt,
      })
      .from(s.users)
      .leftJoin(s.subscriptions, eq(s.users.id, s.subscriptions.userId))
      .leftJoin(s.plans, eq(s.plans.id, s.subscriptions.planId))
      .all();
    const entries = db
      .select()
      .from(s.devotionals)
      .orderBy(s.devotionals.date)
      .all();
    const payments = db
      .select({
        id: s.payments.id,
        email: s.users.email,
        planName: s.payments.planName,
        amountKobo: s.payments.amountKobo,
        reference: s.payments.reference,
        createdAt: s.payments.createdAt,
      })
      .from(s.payments)
      .innerJoin(s.users, eq(s.users.id, s.payments.userId))
      .orderBy(desc(s.payments.createdAt))
      .all();
    const progress = db.select().from(s.progress).all(),
      bookmarks = db.select().from(s.bookmarks).all();
    return {
      metrics: {
        readers: users.filter((u) => u.role !== "admin").length,
        published: entries.filter((e) => e.published).length,
        completions: progress.length,
        revenue: payments.reduce((total, p) => total + p.amountKobo, 0),
      },
      users,
      devotionals: entries,
      plans: db.select().from(s.plans).all(),
      payments,
      inquiries: db
        .select()
        .from(s.inquiries)
        .orderBy(desc(s.inquiries.createdAt))
        .all(),
      engagement: entries.map((e) => ({
        id: e.id,
        title: e.title,
        completions: progress.filter((p) => p.devotionalId === e.id).length,
        bookmarks: bookmarks.filter((b) => b.devotionalId === e.id).length,
      })),
      audit: db
        .select()
        .from(s.auditLogs)
        .orderBy(desc(s.auditLogs.id))
        .limit(20)
        .all(),
      referenceDate: refDate(),
    };
  });
  const setTheme = (date: string, theme: string) => {
    if (theme)
      db.insert(s.monthlyThemes)
        .values({ month: Number(date.slice(5, 7)), title: theme })
        .onConflictDoUpdate({
          target: s.monthlyThemes.month,
          set: { title: theme },
        })
        .run();
  };
  app.post(prefix + "/admin/devotionals", async (req) => {
    const user = requireAdmin(req),
      input = entrySchema.parse(req.body),
      now = new Date().toISOString();
    return sqlite.transaction(() => {
      const entry = db
        .insert(s.devotionals)
        .values({ ...input, createdAt: now, updatedAt: now })
        .returning()
        .get();
      if (input.published) setTheme(input.date, input.theme);
      audit(user.id, "Created devotional: " + input.title);
      return entry;
    })();
  });
  app.put(prefix + "/admin/devotionals/:id", async (req) => {
    const user = requireAdmin(req),
      id = idOf(req),
      input = entrySchema.parse(req.body);
    return sqlite.transaction(() => {
      const entry = db
        .update(s.devotionals)
        .set({ ...input, updatedAt: new Date().toISOString() })
        .where(eq(s.devotionals.id, id))
        .returning()
        .get();
      if (!entry) throw new HttpError(404, "Devotional not found.");
      if (input.published) setTheme(input.date, input.theme);
      audit(
        user.id,
        "Updated devotional: " +
          input.title +
          " (" +
          (input.published ? "published" : "draft") +
          ")",
      );
      return entry;
    })();
  });
  app.patch(prefix + "/admin/plans/:id", async (req) => {
    const user = requireAdmin(req),
      input = z
        .object({
          name: z.string().trim().min(1).max(80),
          amountKobo: z.number().int().min(100).max(100000000),
          active: z.boolean(),
        })
        .parse(req.body);
    return sqlite.transaction(() => {
      const plan = db
        .update(s.plans)
        .set(input)
        .where(eq(s.plans.id, idOf(req)))
        .returning()
        .get();
      if (!plan) throw new HttpError(404, "Plan not found.");
      audit(user.id, "Updated plan: " + plan.name);
      return plan;
    })();
  });
  app.patch(prefix + "/admin/inquiries/:id", async (req) => {
    const user = requireAdmin(req),
      input = z.object({ status: z.enum(["new", "reviewed"]) }).parse(req.body);
    return sqlite.transaction(() => {
      const result = db
        .update(s.inquiries)
        .set(input)
        .where(eq(s.inquiries.id, idOf(req)))
        .returning()
        .get();
      if (!result) throw new HttpError(404, "Inquiry not found.");
      audit(user.id, "Marked inquiry " + result.id + " " + result.status);
      return { ok: true };
    })();
  });
  app.patch(prefix + "/admin/settings", async (req) => {
    const user = requireAdmin(req);
    if (!demo)
      throw new HttpError(403, "Preview dates are only editable in demo mode.");
    const input = z.object({ referenceDate: yearDate }).parse(req.body);
    db.insert(s.settings)
      .values({ key: "referenceDate", value: input.referenceDate })
      .onConflictDoUpdate({
        target: s.settings.key,
        set: { value: input.referenceDate },
      })
      .run();
    audit(user.id, "Changed preview date to " + input.referenceDate);
    return { ok: true };
  });
  return app;
}

import Fastify from "fastify";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import helmet from "@fastify/helmet";
import { and, eq, gt } from "drizzle-orm";
import { getEnvConfig } from "./config.js";
import { openDatabase } from "./db.js";
import * as s from "./schema.js";
import {
  ADMIN_SESSION_COOKIE,
  READER_SESSION_COOKIE,
  publicUser,
  resolveAdminSession,
  tokenHash,
} from "./auth.js";
import { HttpError, handleError } from "./errors.js";
import {
  PaystackPaymentProvider,
  type PaymentProvider,
} from "./services/payments.js";
import { createEmailService, type EmailService } from "./services/email.js";
import { runEmailWorkerCycle } from "./services/emailQueue.js";
import {
  LiveWebPushProvider,
  runNotificationWorkerCycle,
  type WebPushProvider,
} from "./services/notifications.js";
import { registerPublicRoutes } from "./routes/public.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerReaderRoutes } from "./routes/reader.js";
import { registerAdminAuthRoutes } from "./routes/adminAuth.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { assertMfaConfiguration } from "./services/mfa.js";

export type BuildAppOptions = {
  databasePath?: string;
  environment?: string;
  paymentProvider?: PaymentProvider;
  emailService?: EmailService;
  pushProvider?: WebPushProvider;
};

export async function buildApp(options: BuildAppOptions = {}) {
  const env = getEnvConfig();
  const environment = options.environment || env.environment;
  const isProduction = environment === "production";

  if (isProduction) {
    assertMfaConfiguration(env.adminMfaEncryptionKey, true);
    if (!process.env.APP_ORIGIN?.trim() || !process.env.ADMIN_ORIGIN?.trim()) {
      throw new Error(
        "APP_ORIGIN and ADMIN_ORIGIN must be explicitly configured when NODE_ENV=production.",
      );
    }
  }

  const store = openDatabase(options.databasePath);
  const { db, sqlite } = store;

  const paymentProvider =
    options.paymentProvider ||
    new PaystackPaymentProvider({
      secretKey: env.paystack.secretKey,
      publicKey: env.paystack.publicKey,
      webhookSecret: env.paystack.webhookSecret,
    });

  const emailService = options.emailService || createEmailService(env.email);

  const pushProvider =
    options.pushProvider ||
    new LiveWebPushProvider({
      publicKey: env.webPush.publicKey,
      privateKey: env.webPush.privateKey,
      subject: env.webPush.subject,
    });

  const app = Fastify({
    logger:
      environment === "development" && process.env.LOG_REQUESTS === "true",
    bodyLimit: 128 * 1024,
  });

  await app.register(cookie);
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
        manifestSrc: ["'self'"],
        workerSrc: ["'self'"],
        upgradeInsecureRequests: isProduction ? [] : null,
      },
    },
  });
  await app.register(rateLimit, { max: 400, timeWindow: "1 minute" });
  app.decorateRequest("user", null);
  app.decorateRequest("admin", null);
  app.decorateRequest("adminSessionTokenHash", null);
  app.decorateRequest("rawBody", "");

  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (req, body, done) => {
      const raw = typeof body === "string" ? body : body.toString("utf8");
      (req as { rawBody?: string }).rawBody = raw;
      if (!raw.trim()) {
        done(null, {});
        return;
      }
      try {
        done(null, JSON.parse(raw));
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

  const publicOrigins = new Set(
    isProduction
      ? [env.appOrigin]
      : [env.appOrigin, "http://localhost:5173", "http://127.0.0.1:5173"],
  );
  const adminOrigins = new Set(
    isProduction
      ? [env.adminOrigin]
      : [env.adminOrigin, "http://localhost:5174", "http://127.0.0.1:5174"],
  );

  app.addHook("onRequest", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    const pathname = req.url.split("?")[0] || "";
    const isExternalWebhook =
      pathname.startsWith("/api/v1/webhooks/paystack") ||
      pathname.startsWith("/api/v1/webhooks/email");
    const isAdminRoute =
      pathname === "/api/v1/admin" || pathname.startsWith("/api/v1/admin/");

    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      !isExternalWebhook
    ) {
      const expectedRequestedWith = isAdminRoute
        ? "BalancedLifeAdmin"
        : "BalancedLife";
      const allowedOrigins = isAdminRoute ? adminOrigins : publicOrigins;
      if (
        req.headers["x-requested-with"] !== expectedRequestedWith ||
        (req.headers.origin && !allowedOrigins.has(req.headers.origin)) ||
        req.headers["sec-fetch-site"] === "cross-site"
      ) {
        throw new HttpError(403, "Request origin could not be verified.");
      }
    }

    if (isAdminRoute) {
      const adminToken = req.cookies[ADMIN_SESSION_COOKIE];
      if (adminToken) {
        const resolved = resolveAdminSession(
          store,
          adminToken,
          env.adminSessionIdleMinutes,
        );
        if (resolved) {
          req.admin = resolved.admin;
          req.adminSessionTokenHash = resolved.tokenHash;
        }
      }
      return;
    }

    const readerToken = req.cookies[READER_SESSION_COOKIE];
    if (readerToken) {
      const row = db
        .select({ user: s.users })
        .from(s.sessions)
        .innerJoin(s.users, eq(s.users.id, s.sessions.userId))
        .where(
          and(
            eq(s.sessions.tokenHash, tokenHash(readerToken)),
            gt(s.sessions.expiresAt, new Date().toISOString()),
          ),
        )
        .get();

      if (row && row.user.status === "active" && row.user.role === "reader") {
        req.user = publicUser(row.user);
      }
    }
  });

  app.setErrorHandler(handleError);

  let schedulerTimer: ReturnType<typeof setInterval> | null = null;
  if (env.scheduler.enabled && environment !== "test") {
    schedulerTimer = setInterval(() => {
      runNotificationWorkerCycle(store, pushProvider).catch(() => {
        // Logged via notification_events.last_error
      });
      runEmailWorkerCycle(store, emailService, env.appOrigin).catch(() => {
        // Logged via email_queue.last_error
      });
    }, env.scheduler.intervalMs);
    schedulerTimer.unref?.();
  }

  app.addHook("onClose", async () => {
    if (schedulerTimer) {
      clearInterval(schedulerTimer);
      schedulerTimer = null;
    }
    sqlite.close();
  });

  const prefix = "/api/v1";
  registerPublicRoutes(
    app,
    prefix,
    store,
    paymentProvider,
    emailService,
    pushProvider,
    env.appOrigin,
  );
  registerAuthRoutes(app, prefix, store, emailService, {
    isProduction,
    appOrigin: env.appOrigin,
  });
  registerReaderRoutes(
    app,
    prefix,
    store,
    paymentProvider,
    env.appOrigin,
    pushProvider,
    emailService,
  );
  registerAdminAuthRoutes(app, prefix, store, emailService, {
    isProduction,
    adminOrigin: env.adminOrigin,
    mfaEncryptionKey: env.adminMfaEncryptionKey,
    adminSessionIdleMinutes: env.adminSessionIdleMinutes,
    adminSessionMaxHours: env.adminSessionMaxHours,
  });
  registerAdminRoutes(app, prefix, store, paymentProvider, pushProvider, {
    emailService,
    appOrigin: env.appOrigin,
  });

  return app;
}

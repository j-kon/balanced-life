import Fastify from "fastify";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import helmet from "@fastify/helmet";
import { and, eq, gt } from "drizzle-orm";
import { getEnvConfig } from "./config.js";
import { openDatabase } from "./db.js";
import * as s from "./schema.js";
import { publicUser, tokenHash } from "./auth.js";
import { HttpError, handleError } from "./errors.js";
import {
  PaystackPaymentProvider,
  type PaymentProvider,
} from "./services/payments.js";
import { WebhookEmailService, type EmailService } from "./services/email.js";
import {
  LiveWebPushProvider,
  runNotificationWorkerCycle,
  type WebPushProvider,
} from "./services/notifications.js";
import { registerPublicRoutes } from "./routes/public.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerReaderRoutes } from "./routes/reader.js";
import { registerAdminRoutes } from "./routes/admin.js";

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

  const store = openDatabase(options.databasePath);
  const { db, sqlite } = store;

  const paymentProvider =
    options.paymentProvider ||
    new PaystackPaymentProvider({
      secretKey: env.paystack.secretKey,
      publicKey: env.paystack.publicKey,
      webhookSecret: env.paystack.webhookSecret,
    });

  const emailService =
    options.emailService ||
    new WebhookEmailService({
      webhookUrl: env.email.webhookUrl,
      from: env.email.from,
    });

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
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(rateLimit, { max: 400, timeWindow: "1 minute" });
  app.decorateRequest("user", null);
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

  const origins = new Set([
    env.appOrigin,
    "http://localhost:5173",
    "http://127.0.0.1:5173",
  ]);

  app.addHook("onRequest", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    const isPaystackWebhook = req.url.startsWith("/api/v1/webhooks/paystack");
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && !isPaystackWebhook) {
      if (
        req.headers["x-requested-with"] !== "BalancedLife" ||
        (req.headers.origin && !origins.has(req.headers.origin)) ||
        req.headers["sec-fetch-site"] === "cross-site"
      ) {
        throw new HttpError(403, "Request origin could not be verified.");
      }
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

      if (row && row.user.status === "active") {
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
  );
  registerAdminRoutes(app, prefix, store, paymentProvider, pushProvider);

  return app;
}

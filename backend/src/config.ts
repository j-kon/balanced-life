import { config } from "dotenv";
import { fileURLToPath } from "node:url";

config({
  path: fileURLToPath(new URL("../.env", import.meta.url)),
  quiet: true,
});

export const getEnvConfig = () => {
  const environment = process.env.NODE_ENV || "development";
  const appOrigin = process.env.APP_ORIGIN?.trim() || "http://localhost:5173";
  const adminOrigin =
    process.env.ADMIN_ORIGIN?.trim() || "http://localhost:5174";
  const adminMfaEncryptionKey =
    process.env.ADMIN_MFA_ENCRYPTION_KEY?.trim() || "";
  const adminSessionIdleMinutes = Math.max(
    5,
    Number(process.env.ADMIN_SESSION_IDLE_MINUTES) || 30,
  );
  const adminSessionMaxHours = Math.max(
    1,
    Number(process.env.ADMIN_SESSION_MAX_HOURS) || 8,
  );
  const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY?.trim() || "";
  const paystackPublicKey = process.env.PAYSTACK_PUBLIC_KEY?.trim() || "";
  const paystackWebhookSecret =
    process.env.PAYSTACK_WEBHOOK_SECRET?.trim() || "";
  const emailWebhookUrl =
    (
      process.env.EMAIL_WEBHOOK_URL || process.env.PASSWORD_RESET_WEBHOOK_URL
    )?.trim() || "";
  const emailApiKey =
    (
      process.env.EMAIL_API_KEY ||
      process.env.RESEND_API_KEY ||
      process.env.POSTMARK_SERVER_TOKEN
    )?.trim() || "";
  const emailSesRegion =
    process.env.EMAIL_SES_REGION?.trim() ||
    process.env.AWS_REGION?.trim() ||
    "us-east-1";
  const emailSesAccessKeyId =
    process.env.EMAIL_SES_ACCESS_KEY_ID?.trim() || "";
  const emailSesSecretAccessKey =
    process.env.EMAIL_SES_SECRET_ACCESS_KEY?.trim() || "";
  const rawEmailProvider = (process.env.EMAIL_PROVIDER?.trim() || "").toLowerCase();
  const emailProvider = (() => {
    if (
      rawEmailProvider === "resend" ||
      rawEmailProvider === "postmark" ||
      rawEmailProvider === "ses" ||
      rawEmailProvider === "webhook" ||
      rawEmailProvider === "capture" ||
      rawEmailProvider === "none"
    ) {
      return rawEmailProvider;
    }
    if (process.env.POSTMARK_SERVER_TOKEN?.trim()) return "postmark" as const;
    if (process.env.RESEND_API_KEY?.trim() || emailApiKey) return "resend" as const;
    if (emailSesAccessKeyId && emailSesSecretAccessKey) return "ses" as const;
    if (emailWebhookUrl) return "webhook" as const;
    return "none" as const;
  })();

  const emailFrom =
    process.env.EMAIL_FROM?.trim() || "noreply@cossyteens.com";
  const emailFromName =
    process.env.EMAIL_FROM_NAME?.trim() || "The Balanced Life Devotional";
  const emailReplyTo =
    process.env.EMAIL_REPLY_TO?.trim() || "cossyteensconsult@gmail.com";
  const emailWebhookSecret =
    process.env.EMAIL_WEBHOOK_SECRET?.trim() || "";
  const emailDomainVerified = process.env.EMAIL_DOMAIN_VERIFIED === "true";

  const emailConfigured =
    (emailProvider === "resend" && Boolean(emailApiKey)) ||
    (emailProvider === "postmark" && Boolean(emailApiKey)) ||
    (emailProvider === "ses" &&
      Boolean(emailSesAccessKeyId && emailSesSecretAccessKey)) ||
    (emailProvider === "webhook" && Boolean(emailWebhookUrl)) ||
    emailProvider === "capture";

  const passwordResetHmacKey =
    process.env.PASSWORD_RESET_HMAC_KEY?.trim() || "";
  const unsubscribeHmacKey =
    process.env.UNSUBSCRIBE_HMAC_KEY?.trim() || "";

  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY?.trim() || "";
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY?.trim() || "";
  const vapidSubject =
    process.env.VAPID_SUBJECT?.trim() || "mailto:cossyteensconsult@gmail.com";

  return {
    environment,
    isProduction: environment === "production",
    host: process.env.HOST || "127.0.0.1",
    port: Number(process.env.PORT) || 4000,
    appOrigin,
    adminOrigin,
    adminMfaEncryptionKey,
    adminSessionIdleMinutes,
    adminSessionMaxHours,
    paystack: {
      configured: Boolean(paystackSecretKey),
      secretKey: paystackSecretKey,
      publicKey: paystackPublicKey || null,
      webhookSecret: paystackWebhookSecret || null,
    },
    email: {
      configured: emailConfigured,
      provider: emailProvider,
      apiKey: emailApiKey,
      webhookUrl: emailWebhookUrl,
      webhookSecret: emailWebhookSecret,
      from: emailFrom,
      fromName: emailFromName,
      replyTo: emailReplyTo,
      domainVerified: emailDomainVerified,
      sesRegion: emailSesRegion,
      sesAccessKeyId: emailSesAccessKeyId,
      sesSecretAccessKey: emailSesSecretAccessKey,
    },
    security: {
      passwordResetHmacKey,
      unsubscribeHmacKey,
    },
    webPush: {
      configured: Boolean(vapidPublicKey && vapidPrivateKey),
      publicKey: vapidPublicKey || null,
      privateKey: vapidPrivateKey,
      subject: vapidSubject,
    },
    scheduler: {
      enabled: process.env.ENABLE_NOTIFICATION_SCHEDULER === "true",
      intervalMs: Math.max(
        10_000,
        Number(process.env.NOTIFICATION_WORKER_INTERVAL_MS) || 60_000,
      ),
    },
  };
};

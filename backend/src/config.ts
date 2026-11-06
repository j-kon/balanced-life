import { config } from "dotenv";
import { fileURLToPath } from "node:url";

config({
  path: fileURLToPath(new URL("../.env", import.meta.url)),
  quiet: true,
});

export const getEnvConfig = () => {
  const environment = process.env.NODE_ENV || "development";
  const appOrigin = process.env.APP_ORIGIN || "http://localhost:5173";
  const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY?.trim() || "";
  const paystackPublicKey = process.env.PAYSTACK_PUBLIC_KEY?.trim() || "";
  const emailWebhookUrl = process.env.EMAIL_WEBHOOK_URL?.trim() || "";
  const emailFrom =
    process.env.EMAIL_FROM?.trim() || "noreply@cossyteensconsult.org";

  return {
    environment,
    isProduction: environment === "production",
    host: process.env.HOST || "127.0.0.1",
    port: Number(process.env.PORT) || 4000,
    appOrigin,
    paystack: {
      configured: Boolean(paystackSecretKey),
      secretKey: paystackSecretKey,
      publicKey: paystackPublicKey || null,
    },
    email: {
      configured: Boolean(emailWebhookUrl),
      webhookUrl: emailWebhookUrl,
      from: emailFrom,
    },
  };
};

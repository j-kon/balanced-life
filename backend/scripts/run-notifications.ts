import { getEnvConfig } from "../src/config.js";
import { openDatabase } from "../src/db.js";
import {
  LiveWebPushProvider,
  generateVapidKeyPair,
  runNotificationWorkerCycle,
  type SafePushPayload,
  type PushSubscriptionTarget,
  type WebPushProvider,
} from "../src/services/notifications.js";
import { createEmailService } from "../src/services/email.js";
import { runEmailWorkerCycle } from "../src/services/emailQueue.js";

const args = process.argv.slice(2);

if (args.includes("--generate-vapid")) {
  const keys = generateVapidKeyPair();
  console.log("# Add these Web Push VAPID keys to backend/.env:");
  console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
  console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
  console.log("VAPID_SUBJECT=mailto:cossyteensconsult@gmail.com");
  process.exit(0);
}

class LocalDryRunPushProvider implements WebPushProvider {
  readonly configured = true;
  readonly publicKey = "dry-run-public-key";
  async sendNotification(
    subscription: PushSubscriptionTarget,
    payload: SafePushPayload,
  ) {
    console.log(
      `[dry-run push] -> ${subscription.endpoint.slice(0, 64)}... | ${payload.title}`,
    );
    return { statusCode: 201 };
  }
}

const env = getEnvConfig();
const useMock = args.includes("--mock-push") || args.includes("--dry-run");
const watchMode = args.includes("--watch");
const atIndex = args.indexOf("--at");
const customNow =
  atIndex >= 0 && args[atIndex + 1] ? new Date(args[atIndex + 1]) : null;

if (customNow && Number.isNaN(customNow.getTime())) {
  console.error("Invalid --at ISO timestamp provided.");
  process.exit(1);
}

const pushProvider: WebPushProvider = useMock
  ? new LocalDryRunPushProvider()
  : new LiveWebPushProvider({
      publicKey: env.webPush.publicKey,
      privateKey: env.webPush.privateKey,
      subject: env.webPush.subject,
    });

async function executeOnce() {
  const store = openDatabase();
  try {
    const now = customNow || new Date();
    const summary = await runNotificationWorkerCycle(store, pushProvider, now);
    const emailService = createEmailService(env.email);
    const emailSummary = await runEmailWorkerCycle(
      store,
      emailService,
      env.appOrigin,
      now,
    );
    console.log(
      JSON.stringify({
        timestamp: now.toISOString(),
        mode: useMock
          ? "mock-push"
          : pushProvider.configured
            ? "live-vapid"
            : "in-app-only",
        emailMode: emailService.configured
          ? emailService.providerName
          : "unconfigured",
        emailSummary,
        ...summary,
      }),
    );
  } finally {
    store.sqlite.close();
  }
}

if (!watchMode) {
  await executeOnce();
} else {
  const intervalMs = env.scheduler.intervalMs;
  console.log(
    `Starting Balanced Life notification worker loop (interval: ${intervalMs}ms)...`,
  );
  await executeOnce();
  setInterval(() => {
    executeOnce().catch((err) => {
      console.error("Notification worker cycle error:", err);
    });
  }, intervalMs);
}


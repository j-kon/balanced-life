import { createHmac, timingSafeEqual } from "node:crypto";
import { and, desc, eq, inArray, lte, or } from "drizzle-orm";
import type { Store } from "../db.js";
import * as s from "../schema.js";
import { getEnvConfig } from "../config.js";
import { HttpError } from "../errors.js";
import { logAdminAudit, publicUser, type AdminActor } from "../auth.js";
import type { EmailDeliveryResult, EmailService } from "./email.js";
import {
  renderEmailTemplate,
  sanitizePlainText,
  type EmailTemplateId,
  type EmailTemplatePayloads,
} from "./emailTemplates.js";
import {
  getReaderAccessSummary,
  userMatchesAudienceSegment,
  type ReaderAudienceSegment,
} from "./access.js";
import { getAppSettings } from "./settings.js";
import {
  getLocalDateTime,
  getNotificationPreferences,
  isSafeInternalActionUrl,
  isWithinQuietHours,
} from "./notifications.js";

const RETRY_BACKOFF_MS = [
  2 * 60_000,
  8 * 60_000,
  30 * 60_000,
  120 * 60_000,
];

const DEFAULT_DEV_HMAC_KEY =
  "balanced-life-dev-hmac-fallback-do-not-use-in-prod";

export type OptionalEmailPreferenceKey =
  | "daily_reminder"
  | "announcements"
  | "community_updates"
  | "expiry_reminder"
  | "all_optional";

const SENSITIVE_EMAIL_PATTERNS = [
  /sk_(live|test)_[a-zA-Z0-9]+/i,
  /re_[a-zA-Z0-9_]{12,}/,
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN [A-Z ]+PRIVATE KEY-----/,
  /bearer\s+[a-z0-9._-]{16,}/i,
];

export function deriveKeyedSecret(
  purpose: "password_reset" | "unsubscribe",
  explicitKey?: string,
): Buffer {
  const env = getEnvConfig();
  const baseKey =
    explicitKey?.trim() ||
    (purpose === "password_reset"
      ? env.security.passwordResetHmacKey
      : env.security.unsubscribeHmacKey) ||
    env.adminMfaEncryptionKey ||
    DEFAULT_DEV_HMAC_KEY;
  return createHmac("sha256", baseKey)
    .update(`balanced-life:${purpose}`)
    .digest();
}

export function createEmailUnsubscribeToken(
  payload: {
    userId: number;
    scope: OptionalEmailPreferenceKey;
    expMs?: number;
  },
  hmacKey?: string,
): string {
  const body = {
    uid: payload.userId,
    scope: payload.scope,
    exp: payload.expMs ?? Date.now() + 90 * 24 * 60 * 60 * 1000,
  };
  const encoded = Buffer.from(JSON.stringify(body), "utf8").toString(
    "base64url",
  );
  const sig = createHmac("sha256", deriveKeyedSecret("unsubscribe", hmacKey))
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${sig}`;
}

export function verifyEmailUnsubscribeToken(
  token: string,
  hmacKey?: string,
): { userId: number; scope: OptionalEmailPreferenceKey } | null {
  const parts = String(token || "").trim().split(".");
  if (parts.length !== 2) return null;
  const [encoded, providedSig] = parts;
  if (!encoded || !providedSig) return null;

  const expectedSig = createHmac(
    "sha256",
    deriveKeyedSecret("unsubscribe", hmacKey),
  )
    .update(encoded)
    .digest("base64url");

  const a = Buffer.from(providedSig, "utf8");
  const b = Buffer.from(expectedSig, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as {
      uid?: number;
      scope?: OptionalEmailPreferenceKey;
      exp?: number;
    };
    if (
      typeof parsed.uid !== "number" ||
      !Number.isInteger(parsed.uid) ||
      typeof parsed.exp !== "number" ||
      parsed.exp < Date.now()
    ) {
      return null;
    }
    const validScopes: OptionalEmailPreferenceKey[] = [
      "daily_reminder",
      "announcements",
      "community_updates",
      "expiry_reminder",
      "all_optional",
    ];
    if (!parsed.scope || !validScopes.includes(parsed.scope)) {
      return null;
    }
    return { userId: parsed.uid, scope: parsed.scope };
  } catch {
    return null;
  }
}

export function maskEmailAddress(email: string): string {
  const parts = String(email || "").split("@");
  if (parts.length !== 2) return "***";
  const [local, domain] = parts;
  const shown = local.slice(0, Math.min(2, local.length));
  return `${shown}***@${domain}`;
}

export function applyEmailUnsubscribe(
  store: Store,
  input: {
    token: string;
    scopeOverride?: OptionalEmailPreferenceKey;
  },
) {
  const verified = verifyEmailUnsubscribeToken(input.token);
  if (!verified) {
    throw new HttpError(400, "This unsubscribe link is invalid or has expired.");
  }

  const user = store.db
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
    throw new HttpError(404, "Reader account not found for unsubscribe request.");
  }

  getNotificationPreferences(store, user.id);
  const scope = input.scopeOverride || verified.scope;
  const nowIso = new Date().toISOString();

  const updates: Partial<typeof s.notificationPreferences.$inferInsert> = {
    updatedAt: nowIso,
  };

  if (scope === "daily_reminder") {
    updates.emailDailyReminderEnabled = false;
  } else if (scope === "announcements") {
    updates.emailAnnouncementsEnabled = false;
  } else if (scope === "community_updates") {
    updates.emailCommunityUpdatesEnabled = false;
  } else if (scope === "expiry_reminder") {
    updates.subscriptionAlertsEnabled = false;
  } else {
    updates.emailDailyReminderEnabled = false;
    updates.emailAnnouncementsEnabled = false;
    updates.emailCommunityUpdatesEnabled = false;
  }

  store.db
    .update(s.notificationPreferences)
    .set(updates)
    .where(eq(s.notificationPreferences.userId, user.id))
    .run();

  const updated = getNotificationPreferences(store, user.id);
  return {
    unsubscribedScope: scope,
    readerName: user.name,
    maskedEmail: maskEmailAddress(user.email),
    preferences: {
      emailDailyReminderEnabled: Boolean(updated.emailDailyReminderEnabled),
      emailAnnouncementsEnabled: Boolean(updated.emailAnnouncementsEnabled),
      emailCommunityUpdatesEnabled: Boolean(
        updated.emailCommunityUpdatesEnabled,
      ),
      subscriptionAlertsEnabled: Boolean(updated.subscriptionAlertsEnabled),
    },
  };
}

function preferenceKeyFromChannelKind(
  channelKind: string,
): OptionalEmailPreferenceKey | null {
  switch (channelKind) {
    case "optional_daily":
      return "daily_reminder";
    case "optional_announcements":
      return "announcements";
    case "optional_community":
      return "community_updates";
    case "optional_expiry":
      return "expiry_reminder";
    case "optional":
      return "announcements";
    default:
      return null;
  }
}

function channelKindForOptional(prefKey?: OptionalEmailPreferenceKey): string {
  switch (prefKey) {
    case "daily_reminder":
      return "optional_daily";
    case "community_updates":
      return "optional_community";
    case "expiry_reminder":
      return "optional_expiry";
    case "announcements":
    case "all_optional":
    default:
      return "optional_announcements";
  }
}

export function isOptionalEmailAllowed(
  store: Store,
  userId: number,
  preferenceKey: OptionalEmailPreferenceKey,
): { allowed: boolean; reason?: string } {
  const prefs = getNotificationPreferences(store, userId);

  if (
    prefs.emailSuppressedReason === "hard_bounce" ||
    prefs.emailSuppressedReason === "complaint"
  ) {
    return {
      allowed: false,
      reason: `Email address suppressed (${prefs.emailSuppressedReason})`,
    };
  }

  switch (preferenceKey) {
    case "daily_reminder":
      return prefs.emailDailyReminderEnabled
        ? { allowed: true }
        : {
            allowed: false,
            reason: "Reader has not opted in to daily devotional emails",
          };
    case "announcements":
      return prefs.emailAnnouncementsEnabled
        ? { allowed: true }
        : {
            allowed: false,
            reason: "Reader has not opted in to email announcements",
          };
    case "community_updates":
      return prefs.emailCommunityUpdatesEnabled
        ? { allowed: true }
        : {
            allowed: false,
            reason: "Reader has not opted in to community updates",
          };
    case "expiry_reminder":
      return prefs.subscriptionAlertsEnabled && prefs.emailAnnouncementsEnabled
        ? { allowed: true }
        : { allowed: false, reason: "Reader opted out of reminder emails" };
    case "all_optional":
      return prefs.emailAnnouncementsEnabled ||
        prefs.emailCommunityUpdatesEnabled
        ? { allowed: true }
        : { allowed: false, reason: "Reader opted out of optional emails" };
  }
}

export type EnqueueEmailInput<T extends EmailTemplateId = EmailTemplateId> = {
  userId?: number | null;
  adminId?: number | null;
  createdByAdminId?: number | null;
  recipientEmail: string;
  recipientName?: string;
  templateId: T;
  category: "transactional" | "optional";
  preferenceKey?: OptionalEmailPreferenceKey;
  dedupeKey: string;
  payload: EmailTemplatePayloads[T];
  scheduledFor?: string | null;
  campaignId?: number | null;
  maxAttempts?: number;
};

export function enqueueEmail<T extends EmailTemplateId>(
  store: Store,
  input: EnqueueEmailInput<T>,
) {
  const normalizedEmail = String(input.recipientEmail || "")
    .trim()
    .toLowerCase();
  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    return null;
  }

  const nowIso = new Date().toISOString();
  const nextAttemptAt = input.scheduledFor || nowIso;
  const prefKey = input.preferenceKey || "announcements";

  // Enforce consent and suppression before enqueueing optional emails
  if (input.category === "optional" && input.userId) {
    const check = isOptionalEmailAllowed(store, input.userId, prefKey);
    if (!check.allowed) {
      return null;
    }
  }

  const existing = store.db
    .select()
    .from(s.emailQueue)
    .where(eq(s.emailQueue.idempotencyKey, input.dedupeKey))
    .get();
  if (existing) {
    return existing;
  }

  const payloadRecord = { ...(input.payload as Record<string, unknown>) };
  const appBaseUrl = String(
    (payloadRecord.appBaseUrl as string | undefined) ||
      "https://cossyteens.com",
  ).replace(/\/+$/, "");

  if (input.category === "optional" && input.userId && !payloadRecord.unsubscribeUrl) {
    const unsubToken = createEmailUnsubscribeToken({
      userId: input.userId,
      scope: prefKey,
    });
    payloadRecord.unsubscribeUrl = `${appBaseUrl}/unsubscribe?token=${encodeURIComponent(unsubToken)}`;
  }
  if (!payloadRecord.preferencesUrl) {
    payloadRecord.preferencesUrl = `${appBaseUrl}/account`;
  }

  // Never store raw reset verification codes inside queued HTML/text
  const safePayload =
    input.templateId === "password_reset_code"
      ? { ...payloadRecord, code: "******" }
      : payloadRecord;

  const rendered = renderEmailTemplate(
    input.templateId,
    safePayload as EmailTemplatePayloads[T],
  );

  const htmlBody =
    input.templateId === "password_reset_code"
      ? "[REDACTED ONE-TIME VERIFICATION CODE]"
      : rendered.html;
  const textBody =
    input.templateId === "password_reset_code"
      ? "[REDACTED ONE-TIME VERIFICATION CODE]"
      : rendered.text;

  const channelKind =
    input.category === "transactional"
      ? "transactional"
      : channelKindForOptional(prefKey);

  const row = store.db
    .insert(s.emailQueue)
    .values({
      userId: input.userId ?? null,
      adminId: input.adminId ?? null,
      campaignId: input.campaignId ?? null,
      createdByAdminId: input.createdByAdminId ?? null,
      recipientEmail: normalizedEmail,
      recipientName: String(input.recipientName || "").trim(),
      templateKey: input.templateId,
      channelKind,
      subject: rendered.subject,
      htmlBody,
      textBody,
      idempotencyKey: input.dedupeKey,
      status: "pending",
      providerName: "",
      providerMessageId: "",
      attempts: 0,
      maxAttempts: input.maxAttempts ?? 4,
      nextAttemptAt,
      lockedUntil: null,
      lastError: "",
      sentAt: null,
      bouncedAt: null,
      complainedAt: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    })
    .onConflictDoNothing()
    .returning()
    .get();

  return row ?? existing ?? null;
}

export async function sendImmediateTransactionalEmail<
  T extends EmailTemplateId,
>(
  store: Store,
  emailService: EmailService,
  input: {
    userId?: number | null;
    adminId?: number | null;
    createdByAdminId?: number | null;
    recipientEmail: string;
    recipientName?: string;
    templateId: T;
    payload: EmailTemplatePayloads[T];
    dedupeKey: string;
    redactCodeInAudit?: boolean;
  },
): Promise<EmailDeliveryResult> {
  const normalizedEmail = String(input.recipientEmail || "")
    .trim()
    .toLowerCase();
  const nowIso = new Date().toISOString();
  const rendered = renderEmailTemplate(input.templateId, input.payload);

  const result = await emailService.sendEmail({
    to: normalizedEmail,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    templateId: input.templateId,
    category: "transactional",
    idempotencyKey: input.dedupeKey,
  });

  const providerName =
    result.provider || emailService.providerName || "unconfigured";

  const redactBody =
    input.redactCodeInAudit || input.templateId === "password_reset_code";

  try {
    const inserted = store.db
      .insert(s.emailQueue)
      .values({
        userId: input.userId ?? null,
        adminId: input.adminId ?? null,
        campaignId: null,
        createdByAdminId: input.createdByAdminId ?? null,
        recipientEmail: normalizedEmail,
        recipientName: String(input.recipientName || "").trim(),
        templateKey: input.templateId,
        channelKind: "transactional",
        subject: rendered.subject,
        htmlBody: redactBody
          ? "[REDACTED ONE-TIME VERIFICATION CODE]"
          : rendered.html,
        textBody: redactBody
          ? "[REDACTED ONE-TIME VERIFICATION CODE]"
          : rendered.text,
        idempotencyKey: input.dedupeKey,
        status: result.delivered ? "sent" : "failed",
        providerName,
        providerMessageId: result.messageId || "",
        attempts: 1,
        maxAttempts: 1,
        nextAttemptAt: nowIso,
        lockedUntil: null,
        lastError: result.error || "",
        sentAt: result.delivered ? nowIso : null,
        bouncedAt: null,
        complainedAt: null,
        createdAt: nowIso,
        updatedAt: nowIso,
      })
      .onConflictDoNothing()
      .returning()
      .get();

    if (inserted) {
      store.db
        .insert(s.emailDeliveryEvents)
        .values({
          emailQueueId: inserted.id,
          eventType: result.delivered ? "sent" : "failed",
          providerName,
          providerEventId: result.messageId || "",
          detail: result.error || "",
          createdAt: nowIso,
        })
        .run();
    }
  } catch {
    // Non-fatal metadata logging guard
  }

  return {
    ...result,
    provider: providerName,
  };
}

export async function processEmailQueueBatch(
  store: Store,
  emailService: EmailService,
  options: {
    batchSize?: number;
    now?: Date;
    defaultAppBaseUrl?: string;
  } = {},
) {
  const now = options.now || new Date();
  const nowIso = now.toISOString();
  const lockUntilIso = new Date(now.getTime() + 5 * 60_000).toISOString();
  const batchSize = Math.min(Math.max(1, options.batchSize || 25), 100);

  const claimed = store.sqlite.transaction(() => {
    const due = store.db
      .select()
      .from(s.emailQueue)
      .where(
        and(
          lte(s.emailQueue.nextAttemptAt, nowIso),
          or(
            inArray(s.emailQueue.status, ["pending", "retrying"]),
            and(
              eq(s.emailQueue.status, "processing"),
              lte(s.emailQueue.lockedUntil, nowIso),
            ),
          ),
        ),
      )
      .orderBy(s.emailQueue.nextAttemptAt, s.emailQueue.id)
      .limit(batchSize)
      .all();

    for (const row of due) {
      store.db
        .update(s.emailQueue)
        .set({
          status: "processing",
          lockedUntil: lockUntilIso,
          updatedAt: nowIso,
        })
        .where(eq(s.emailQueue.id, row.id))
        .run();
    }
    return due;
  })();

  let sentCount = 0;
  let retryingCount = 0;
  let failedCount = 0;
  let suppressedCount = 0;

  for (const row of claimed) {
    const prefKey = preferenceKeyFromChannelKind(row.channelKind);
    const isOptional = prefKey !== null;

    if (isOptional && row.userId) {
      const check = isOptionalEmailAllowed(store, row.userId, prefKey);
      if (!check.allowed) {
        const updateNow = new Date().toISOString();
        store.db
          .update(s.emailQueue)
          .set({
            status: "suppressed",
            lockedUntil: null,
            lastError: check.reason || "Suppressed by user preference",
            updatedAt: updateNow,
          })
          .where(eq(s.emailQueue.id, row.id))
          .run();
        store.db
          .insert(s.emailDeliveryEvents)
          .values({
            emailQueueId: row.id,
            eventType: "suppressed",
            providerName: emailService.providerName || "internal",
            providerEventId: "",
            detail: check.reason || "User opted out",
            createdAt: updateNow,
          })
          .run();
        suppressedCount++;
        continue;
      }
    }

    if (
      row.templateKey === "password_reset_code" ||
      row.textBody.includes("[REDACTED ONE-TIME VERIFICATION CODE]")
    ) {
      const updateNow = new Date().toISOString();
      store.db
        .update(s.emailQueue)
        .set({
          status: "cancelled",
          lockedUntil: null,
          lastError: "Expired one-time verification code cannot be retried.",
          updatedAt: updateNow,
        })
        .where(eq(s.emailQueue.id, row.id))
        .run();
      continue;
    }

    const appBaseUrl = (
      options.defaultAppBaseUrl || "https://cossyteens.com"
    ).replace(/\/+$/, "");
    const headers: Record<string, string> = {};
    if (isOptional && row.userId) {
      const unsubToken = createEmailUnsubscribeToken({
        userId: row.userId,
        scope: prefKey,
      });
      const unsubUrl = `${appBaseUrl}/unsubscribe?token=${encodeURIComponent(unsubToken)}`;
      headers["List-Unsubscribe"] = `<${unsubUrl}>`;
      headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
    }

    const result = await emailService.sendEmail({
      to: row.recipientEmail,
      subject: row.subject,
      html: row.htmlBody,
      text: row.textBody,
      templateId: row.templateKey as EmailTemplateId,
      category: isOptional ? "optional" : "transactional",
      idempotencyKey: row.idempotencyKey,
      headers: Object.keys(headers).length ? headers : undefined,
    });

    const finishedIso = new Date().toISOString();
    const providerName =
      result.provider || emailService.providerName || "unconfigured";

    if (result.delivered) {
      store.sqlite.transaction(() => {
        store.db
          .update(s.emailQueue)
          .set({
            status: "sent",
            attempts: row.attempts + 1,
            lockedUntil: null,
            sentAt: finishedIso,
            providerName,
            providerMessageId: result.messageId || "",
            lastError: "",
            updatedAt: finishedIso,
          })
          .where(eq(s.emailQueue.id, row.id))
          .run();

        store.db
          .insert(s.emailDeliveryEvents)
          .values({
            emailQueueId: row.id,
            eventType: "sent",
            providerName,
            providerEventId: result.messageId || "",
            detail: "",
            createdAt: finishedIso,
          })
          .run();

        if (row.campaignId) {
          store.db
            .update(s.adminEmailCampaignRecipients)
            .set({
              status: "sent",
              updatedAt: finishedIso,
            })
            .where(eq(s.adminEmailCampaignRecipients.emailQueueId, row.id))
            .run();
        }
      })();
      sentCount++;
    } else {
      const nextAttempts = row.attempts + 1;
      const exhausted = nextAttempts >= row.maxAttempts;
      const delayMs =
        RETRY_BACKOFF_MS[
          Math.min(nextAttempts - 1, RETRY_BACKOFF_MS.length - 1)
        ] || 120 * 60_000;
      const nextAttemptAt = new Date(now.getTime() + delayMs).toISOString();
      const errorDetail = String(result.error || "Email delivery error").slice(
        0,
        400,
      );

      store.sqlite.transaction(() => {
        store.db
          .update(s.emailQueue)
          .set({
            status: exhausted ? "failed" : "retrying",
            attempts: nextAttempts,
            nextAttemptAt: exhausted ? row.nextAttemptAt : nextAttemptAt,
            lockedUntil: null,
            providerName,
            lastError: errorDetail,
            updatedAt: finishedIso,
          })
          .where(eq(s.emailQueue.id, row.id))
          .run();

        store.db
          .insert(s.emailDeliveryEvents)
          .values({
            emailQueueId: row.id,
            eventType: exhausted ? "failed" : "retry_scheduled",
            providerName,
            providerEventId: "",
            detail: errorDetail,
            createdAt: finishedIso,
          })
          .run();

        if (row.campaignId && exhausted) {
          store.db
            .update(s.adminEmailCampaignRecipients)
            .set({
              status: "failed",
              skipReason: errorDetail,
              updatedAt: finishedIso,
            })
            .where(eq(s.adminEmailCampaignRecipients.emailQueueId, row.id))
            .run();
        }
      })();

      if (exhausted) {
        failedCount++;
      } else {
        retryingCount++;
      }
    }
  }

  return {
    processed: claimed.length,
    sentCount,
    retryingCount,
    failedCount,
    suppressedCount,
  };
}

export function processEmailWebhookEvent(
  store: Store,
  payload: {
    eventType:
      | "delivered"
      | "bounce"
      | "hard_bounce"
      | "soft_bounce"
      | "complaint";
    email: string;
    provider?: string;
    providerMessageId?: string;
    detail?: string;
  },
) {
  const email = String(payload.email || "")
    .trim()
    .toLowerCase();
  if (!email) {
    throw new HttpError(400, "Webhook email address is required.");
  }

  const nowIso = new Date().toISOString();
  const user = store.db
    .select({ id: s.users.id })
    .from(s.users)
    .where(eq(s.users.email, email))
    .get();

  const matchingQueue = payload.providerMessageId
    ? store.db
        .select()
        .from(s.emailQueue)
        .where(eq(s.emailQueue.providerMessageId, payload.providerMessageId))
        .get()
    : store.db
        .select()
        .from(s.emailQueue)
        .where(eq(s.emailQueue.recipientEmail, email))
        .orderBy(desc(s.emailQueue.id))
        .get();

  const isSuppressionEvent =
    payload.eventType === "hard_bounce" ||
    payload.eventType === "bounce" ||
    payload.eventType === "complaint";

  store.sqlite.transaction(() => {
    if (matchingQueue) {
      store.db
        .insert(s.emailDeliveryEvents)
        .values({
          emailQueueId: matchingQueue.id,
          eventType: payload.eventType,
          providerName:
            payload.provider || matchingQueue.providerName || "webhook",
          providerEventId: payload.providerMessageId || "",
          detail: String(payload.detail || "").slice(0, 400),
          createdAt: nowIso,
        })
        .run();

      if (isSuppressionEvent) {
        store.db
          .update(s.emailQueue)
          .set({
            status:
              payload.eventType === "complaint" ? "suppressed" : "bounced",
            bouncedAt:
              payload.eventType === "complaint"
                ? matchingQueue.bouncedAt
                : nowIso,
            complainedAt:
              payload.eventType === "complaint"
                ? nowIso
                : matchingQueue.complainedAt,
            lastError: String(payload.detail || payload.eventType).slice(
              0,
              400,
            ),
            updatedAt: nowIso,
          })
          .where(eq(s.emailQueue.id, matchingQueue.id))
          .run();
      }
    }

    if (user && isSuppressionEvent) {
      getNotificationPreferences(store, user.id);
      const reason =
        payload.eventType === "complaint" ? "complaint" : "hard_bounce";
      store.db
        .update(s.notificationPreferences)
        .set({
          emailSuppressedReason: reason,
          emailSuppressedAt: nowIso,
          updatedAt: nowIso,
        })
        .where(eq(s.notificationPreferences.userId, user.id))
        .run();
    }
  })();

  return {
    recorded: true,
    suppressedUserId: isSuppressionEvent ? (user?.id ?? null) : null,
  };
}

export function validateEmailCampaignInput(input: {
  targetType: "individual" | "segment" | "all";
  targetSegment?: ReaderAudienceSegment;
  targetUserId?: number;
  audienceChannel: "announcements" | "community_updates";
  title: string;
  body: string;
  actionPath?: string;
  actionLabel?: string;
  scheduledFor?: string | null;
}) {
  const title = sanitizePlainText(input.title, 140);
  const body = sanitizePlainText(input.body, 4000);
  const actionPath = String(input.actionPath || "/dashboard").trim();
  const actionLabel = sanitizePlainText(
    input.actionLabel || "Open Balanced Life App",
    60,
  );

  if (
    /[<>]/.test(String(input.title || "")) ||
    /[<>]/.test(String(input.body || ""))
  ) {
    throw new HttpError(
      400,
      "Raw HTML tags or angle brackets are not allowed in email campaigns. Compose plain paragraphs.",
    );
  }
  for (const pattern of SENSITIVE_EMAIL_PATTERNS) {
    if (pattern.test(title) || pattern.test(body)) {
      throw new HttpError(
        400,
        "Email content must not contain private credentials or API keys.",
      );
    }
  }
  if (!isSafeInternalActionUrl(actionPath)) {
    throw new HttpError(
      400,
      "Action destination must be a safe internal Balanced Life route (for example /dashboard or /library).",
    );
  }
  if (input.targetType === "individual" && !input.targetUserId) {
    throw new HttpError(400, "Select a target reader for an individual email.");
  }
  if (input.targetType === "segment" && !input.targetSegment) {
    throw new HttpError(400, "Select an audience segment.");
  }

  let scheduledForIso: string | null = null;
  if (input.scheduledFor && input.scheduledFor.trim()) {
    const parsed = new Date(input.scheduledFor.trim());
    if (Number.isNaN(parsed.getTime())) {
      throw new HttpError(400, "Scheduled send time must be a valid date.");
    }
    if (parsed.getTime() < Date.now() - 60_000) {
      throw new HttpError(400, "Scheduled send time must be in the future.");
    }
    scheduledForIso = parsed.toISOString();
  }

  return {
    title,
    body,
    actionPath,
    actionLabel,
    scheduledFor: scheduledForIso,
  };
}

export function resolveEmailCampaignAudience(
  store: Store,
  input: {
    targetType: "individual" | "segment" | "all";
    targetSegment?: ReaderAudienceSegment;
    targetUserId?: number;
    audienceChannel: "announcements" | "community_updates";
  },
) {
  const nowIso = new Date().toISOString();
  let candidateReaders: Array<typeof s.users.$inferSelect>;

  if (input.targetType === "individual" && input.targetUserId) {
    const reader = store.db
      .select()
      .from(s.users)
      .where(eq(s.users.id, input.targetUserId))
      .get();
    if (!reader || reader.role !== "reader" || reader.status !== "active") {
      throw new HttpError(404, "Target active reader account not found.");
    }
    candidateReaders = [reader];
  } else {
    candidateReaders = store.db
      .select()
      .from(s.users)
      .where(and(eq(s.users.role, "reader"), eq(s.users.status, "active")))
      .orderBy(desc(s.users.id))
      .all();
  }

  const matched: Array<{
    userId: number;
    name: string;
    email: string;
    segment: string;
  }> = [];

  for (const reader of candidateReaders) {
    const access = getReaderAccessSummary(store, publicUser(reader), nowIso);
    if (
      input.targetType === "segment" &&
      input.targetSegment &&
      !userMatchesAudienceSegment(access, input.targetSegment)
    ) {
      continue;
    }
    matched.push({
      userId: reader.id,
      name: reader.name,
      email: reader.email,
      segment: access.status,
    });
  }

  const eligible: typeof matched = [];
  let skippedOptOutCount = 0;

  for (const item of matched) {
    const consent = isOptionalEmailAllowed(
      store,
      item.userId,
      input.audienceChannel,
    );
    if (!consent.allowed) {
      skippedOptOutCount++;
      continue;
    }
    eligible.push(item);
  }

  return {
    totalMatchedReaders: matched.length,
    eligible,
    skippedOptOutCount,
    sampleRecipients: eligible.slice(0, 6).map((r) => ({
      id: r.userId,
      name: r.name,
      maskedEmail: maskEmailAddress(r.email),
      segment: r.segment,
    })),
  };
}

export function previewAdminEmailCampaign(
  store: Store,
  input: {
    targetType: "individual" | "segment" | "all";
    targetSegment?: ReaderAudienceSegment;
    targetUserId?: number;
    audienceChannel: "announcements" | "community_updates";
    title: string;
    body: string;
    actionPath?: string;
    actionLabel?: string;
    scheduledFor?: string | null;
  },
  appBaseUrl: string,
) {
  const sanitized = validateEmailCampaignInput(input);
  const audience = resolveEmailCampaignAudience(store, input);
  const rendered = renderEmailTemplate("admin_announcement", {
    recipientName: audience.sampleRecipients[0]?.name || "Reader",
    title: sanitized.title,
    body: sanitized.body,
    actionPath: sanitized.actionPath,
    actionLabel: sanitized.actionLabel,
    appBaseUrl,
    preferencesUrl: `${appBaseUrl.replace(/\/+$/, "")}/account`,
    unsubscribeUrl: `${appBaseUrl.replace(/\/+$/, "")}/unsubscribe?preview=1`,
  });

  return {
    totalMatchedReaders: audience.totalMatchedReaders,
    eligibleCount: audience.eligible.length,
    skippedOptOutCount: audience.skippedOptOutCount,
    sampleRecipients: audience.sampleRecipients,
    previewHtml: rendered.html,
    previewText: rendered.text,
  };
}

export async function createAndQueueAdminEmailCampaign(
  store: Store,
  actor: AdminActor,
  input: {
    targetType: "individual" | "segment" | "all";
    targetSegment?: ReaderAudienceSegment;
    targetUserId?: number;
    audienceChannel: "announcements" | "community_updates";
    title: string;
    body: string;
    actionPath?: string;
    actionLabel?: string;
    scheduledFor?: string | null;
    idempotencyKey?: string;
  },
  emailService: EmailService,
  appBaseUrl: string,
) {
  const sanitized = validateEmailCampaignInput(input);
  const audience = resolveEmailCampaignAudience(store, input);
  const key =
    (input.idempotencyKey || "").trim() ||
    `email_camp_${actor.id ?? 0}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const existing = store.db
    .select()
    .from(s.emailCampaigns)
    .where(eq(s.emailCampaigns.idempotencyKey, key))
    .get();
  if (existing) {
    return {
      deduplicated: true,
      campaign: formatEmailCampaignSummary(store, existing),
    };
  }

  if (audience.eligible.length === 0) {
    throw new HttpError(
      400,
      "No eligible opted-in readers matched this email audience (respecting unsubscribe and consent preferences).",
    );
  }

  const nowIso = new Date().toISOString();
  const isScheduled = Boolean(sanitized.scheduledFor);

  const created = store.sqlite.transaction(() => {
    const campaign = store.db
      .insert(s.emailCampaigns)
      .values({
        createdByAdminId: actor.id,
        actorName: actor.name,
        actorEmail: actor.email,
        targetType: input.targetType,
        targetSegment:
          input.targetType === "segment" ? input.targetSegment || "" : "",
        targetUserId:
          input.targetType === "individual"
            ? (input.targetUserId ?? null)
            : null,
        emailType:
          input.audienceChannel === "community_updates"
            ? "community_update"
            : "announcement",
        subject: sanitized.title,
        bodyText: sanitized.body,
        actionLabel: sanitized.actionLabel,
        actionUrl: sanitized.actionPath,
        idempotencyKey: key,
        status: isScheduled ? "scheduled" : "enqueueing",
        scheduledFor: sanitized.scheduledFor,
        eligibleCount: audience.eligible.length,
        skippedOptOutCount: audience.skippedOptOutCount,
        queuedCount: 0,
        sentCount: 0,
        failedCount: 0,
        confirmedByAdmin: true,
        startedAt: isScheduled ? null : nowIso,
        completedAt: null,
        createdAt: nowIso,
        updatedAt: nowIso,
      })
      .returning()
      .get();

    for (const rec of audience.eligible) {
      store.db
        .insert(s.adminEmailCampaignRecipients)
        .values({
          campaignId: campaign.id,
          userId: rec.userId,
          status: "pending",
          createdAt: nowIso,
          updatedAt: nowIso,
        })
        .onConflictDoNothing()
        .run();
    }

    const audienceDesc =
      input.targetType === "individual"
        ? `reader #${input.targetUserId}`
        : input.targetType === "segment"
          ? `segment:${input.targetSegment}`
          : "all eligible opted-in readers";

    logAdminAudit(
      store,
      actor,
      `${isScheduled ? "Scheduled" : "Queued"} email campaign #${campaign.id} (${input.audienceChannel}) to ${audienceDesc} ("${sanitized.title}", eligible: ${audience.eligible.length}, opted-out skipped: ${audience.skippedOptOutCount})`,
      "email_campaign",
      campaign.id,
      nowIso,
    );

    return campaign;
  })();

  if (!isScheduled) {
    processEmailCampaignQueue(store, {
      campaignId: created.id,
      appBaseUrl,
    });
    await processEmailQueueBatch(store, emailService, {
      batchSize: 50,
      defaultAppBaseUrl: appBaseUrl,
    });
  }

  const latest = store.db
    .select()
    .from(s.emailCampaigns)
    .where(eq(s.emailCampaigns.id, created.id))
    .get()!;

  return {
    deduplicated: false,
    campaign: formatEmailCampaignSummary(store, latest),
  };
}

export function processEmailCampaignQueue(
  store: Store,
  options: {
    campaignId?: number;
    batchSize?: number;
    appBaseUrl?: string;
    now?: Date;
  } = {},
) {
  const now = options.now || new Date();
  const nowIso = now.toISOString();
  const batchSize = Math.min(Math.max(1, options.batchSize || 100), 250);
  const appBaseUrl = options.appBaseUrl || "https://cossyteens.com";

  const campaigns = options.campaignId
    ? store.db
        .select()
        .from(s.emailCampaigns)
        .where(eq(s.emailCampaigns.id, options.campaignId))
        .all()
    : store.db
        .select()
        .from(s.emailCampaigns)
        .where(inArray(s.emailCampaigns.status, ["scheduled", "enqueueing"]))
        .orderBy(s.emailCampaigns.createdAt)
        .all();

  const dueCampaigns = campaigns.filter(
    (c) =>
      c.status === "enqueueing" ||
      (c.status === "scheduled" &&
        (!c.scheduledFor || c.scheduledFor <= nowIso)),
  );

  let enqueuedEmails = 0;

  for (const campaign of dueCampaigns) {
    const pendingRecipients = store.db
      .select()
      .from(s.adminEmailCampaignRecipients)
      .where(
        and(
          eq(s.adminEmailCampaignRecipients.campaignId, campaign.id),
          eq(s.adminEmailCampaignRecipients.status, "pending"),
        ),
      )
      .orderBy(s.adminEmailCampaignRecipients.id)
      .limit(batchSize)
      .all();

    store.sqlite.transaction(() => {
      for (const rec of pendingRecipients) {
        const user = store.db
          .select()
          .from(s.users)
          .where(eq(s.users.id, rec.userId))
          .get();
        if (!user || user.role !== "reader" || user.status !== "active") {
          store.db
            .update(s.adminEmailCampaignRecipients)
            .set({
              status: "skipped",
              skipReason: "Reader account unavailable",
              updatedAt: nowIso,
            })
            .where(eq(s.adminEmailCampaignRecipients.id, rec.id))
            .run();
          continue;
        }

        const prefKey: OptionalEmailPreferenceKey =
          campaign.emailType === "community_update"
            ? "community_updates"
            : "announcements";

        const queuedRow = enqueueEmail(store, {
          userId: user.id,
          createdByAdminId: campaign.createdByAdminId,
          recipientEmail: user.email,
          recipientName: user.name,
          templateId: "admin_announcement",
          category: "optional",
          preferenceKey: prefKey,
          dedupeKey: `email_campaign_${campaign.id}_user_${user.id}`,
          campaignId: campaign.id,
          payload: {
            recipientName: user.name,
            title: campaign.subject,
            body: campaign.bodyText,
            actionPath: campaign.actionUrl,
            actionLabel: campaign.actionLabel,
            appBaseUrl,
          },
        });

        if (!queuedRow) {
          store.db
            .update(s.adminEmailCampaignRecipients)
            .set({
              status: "skipped",
              skipReason: "Reader opted out or suppressed",
              updatedAt: nowIso,
            })
            .where(eq(s.adminEmailCampaignRecipients.id, rec.id))
            .run();
          continue;
        }

        store.db
          .update(s.adminEmailCampaignRecipients)
          .set({
            status: "queued",
            emailQueueId: queuedRow.id,
            updatedAt: nowIso,
          })
          .where(eq(s.adminEmailCampaignRecipients.id, rec.id))
          .run();
        enqueuedEmails++;
      }

      syncCampaignCounters(store, campaign.id, nowIso);
    })();
  }

  return {
    checkedCampaigns: dueCampaigns.length,
    enqueuedEmails,
  };
}

function syncCampaignCounters(store: Store, campaignId: number, nowIso: string) {
  const campaign = store.db
    .select()
    .from(s.emailCampaigns)
    .where(eq(s.emailCampaigns.id, campaignId))
    .get();
  if (!campaign) return;

  const recipients = store.db
    .select()
    .from(s.adminEmailCampaignRecipients)
    .where(eq(s.adminEmailCampaignRecipients.campaignId, campaignId))
    .all();

  const pending = recipients.filter((r) => r.status === "pending").length;
  const queued = recipients.filter(
    (r) =>
      r.status === "queued" || r.status === "sent" || r.status === "failed",
  ).length;
  const sent = recipients.filter((r) => r.status === "sent").length;
  const failed = recipients.filter((r) => r.status === "failed").length;

  const nextStatus =
    campaign.status === "cancelled"
      ? "cancelled"
      : pending > 0
        ? campaign.scheduledFor && campaign.scheduledFor > nowIso
          ? "scheduled"
          : "enqueueing"
        : queued > 0 && sent + failed < queued
          ? "sending"
          : "completed";

  store.db
    .update(s.emailCampaigns)
    .set({
      status: nextStatus,
      queuedCount: queued,
      sentCount: sent,
      failedCount: failed,
      completedAt:
        nextStatus === "completed" ? campaign.completedAt || nowIso : null,
      updatedAt: nowIso,
    })
    .where(eq(s.emailCampaigns.id, campaignId))
    .run();
}

export function formatEmailCampaignSummary(
  store: Store,
  campaign: typeof s.emailCampaigns.$inferSelect,
) {
  const nowIso = new Date().toISOString();
  syncCampaignCounters(store, campaign.id, nowIso);
  const fresh =
    store.db
      .select()
      .from(s.emailCampaigns)
      .where(eq(s.emailCampaigns.id, campaign.id))
      .get() || campaign;
  return {
    id: fresh.id,
    actorName: fresh.actorName,
    targetType: fresh.targetType,
    targetSegment: fresh.targetSegment,
    targetUserId: fresh.targetUserId,
    audienceChannel:
      fresh.emailType === "community_update"
        ? "community_updates"
        : "announcements",
    subject: fresh.subject,
    actionPath: fresh.actionUrl,
    status: fresh.status,
    scheduledFor: fresh.scheduledFor,
    eligibleCount: fresh.eligibleCount,
    skippedOptOutCount: fresh.skippedOptOutCount,
    queuedCount: fresh.queuedCount,
    sentCount: fresh.sentCount,
    failedCount: fresh.failedCount,
    createdAt: fresh.createdAt,
  };
}

export function cancelAdminEmailCampaign(
  store: Store,
  actor: AdminActor,
  campaignId: number,
) {
  const campaign = store.db
    .select()
    .from(s.emailCampaigns)
    .where(eq(s.emailCampaigns.id, campaignId))
    .get();
  if (!campaign) {
    throw new HttpError(404, "Email campaign not found.");
  }
  if (campaign.status !== "scheduled" && campaign.status !== "enqueueing") {
    throw new HttpError(
      400,
      "Only scheduled or queueing email campaigns can be cancelled.",
    );
  }
  const nowIso = new Date().toISOString();
  store.sqlite.transaction(() => {
    store.db
      .update(s.emailCampaigns)
      .set({
        status: "cancelled",
        updatedAt: nowIso,
      })
      .where(eq(s.emailCampaigns.id, campaignId))
      .run();
    store.db
      .update(s.adminEmailCampaignRecipients)
      .set({
        status: "skipped",
        skipReason: "Cancelled by administrator",
        updatedAt: nowIso,
      })
      .where(
        and(
          eq(s.adminEmailCampaignRecipients.campaignId, campaignId),
          eq(s.adminEmailCampaignRecipients.status, "pending"),
        ),
      )
      .run();
    logAdminAudit(
      store,
      actor,
      `Cancelled email campaign #${campaign.id} ("${campaign.subject}")`,
      "email_campaign",
      campaign.id,
      nowIso,
    );
  })();
  return formatEmailCampaignSummary(
    store,
    store.db
      .select()
      .from(s.emailCampaigns)
      .where(eq(s.emailCampaigns.id, campaignId))
      .get()!,
  );
}

export function evaluateUserEmailReminders(
  store: Store,
  userId: number,
  appBaseUrl: string,
  now: Date = new Date(),
): {
  generatedKeys: string[];
} {
  const user = store.db
    .select()
    .from(s.users)
    .where(eq(s.users.id, userId))
    .get();
  if (!user || user.role !== "reader" || user.status !== "active") {
    return { generatedKeys: [] };
  }

  const prefs = getNotificationPreferences(store, userId);
  if (
    prefs.emailSuppressedReason === "hard_bounce" ||
    prefs.emailSuppressedReason === "complaint"
  ) {
    return { generatedKeys: [] };
  }

  const { localDate, localTime } = getLocalDateTime(now, prefs.timezone);
  const generatedKeys: string[] = [];

  if (
    prefs.emailDailyReminderEnabled &&
    !isWithinQuietHours(localTime, prefs.quietHoursStart, prefs.quietHoursEnd) &&
    localTime >= prefs.reminderTime &&
    localDate >= "2027-01-01" &&
    localDate <= "2027-12-31" &&
    prefs.lastEmailDailyReminderDate !== localDate
  ) {
    const entry = store.db
      .select()
      .from(s.devotionals)
      .where(
        and(
          eq(s.devotionals.date, localDate),
          eq(s.devotionals.published, true),
        ),
      )
      .get();

    if (entry) {
      const access = getReaderAccessSummary(
        store,
        publicUser(user),
        now.toISOString(),
      );
      const canReadEntry = Boolean(entry.sample || access.hasAccess);
      const completed = store.db
        .select({ completedAt: s.progress.completedAt })
        .from(s.progress)
        .where(
          and(
            eq(s.progress.userId, userId),
            eq(s.progress.devotionalId, entry.id),
          ),
        )
        .get();

      if (canReadEntry && !completed) {
        const dedupeKey = `email_daily_${userId}_${localDate}`;
        const queued = enqueueEmail(store, {
          userId,
          recipientEmail: user.email,
          recipientName: user.name,
          templateId: "daily_devotional_reminder",
          category: "optional",
          preferenceKey: "daily_reminder",
          dedupeKey,
          payload: {
            recipientName: user.name,
            date: entry.date,
            devotionalTitle: entry.title,
            theme: entry.theme,
            bibleText: entry.bibleText || undefined,
            appBaseUrl,
          },
        });
        if (queued) {
          store.db
            .update(s.notificationPreferences)
            .set({
              lastEmailDailyReminderDate: localDate,
              updatedAt: now.toISOString(),
            })
            .where(eq(s.notificationPreferences.userId, userId))
            .run();
          generatedKeys.push(dedupeKey);
        }
      }
    }
  }

  if (prefs.subscriptionAlertsEnabled && prefs.emailAnnouncementsEnabled) {
    const access = getReaderAccessSummary(
      store,
      publicUser(user),
      now.toISOString(),
    );
    const settings = getAppSettings(store);
    const reminderWindowDays = Math.max(1, settings.renewalReminderDays || 14);
    if (
      access.status === "active" &&
      !access.legacyPersistent &&
      access.expiresAt &&
      access.daysRemaining !== null &&
      access.daysRemaining > 0 &&
      access.daysRemaining <= reminderWindowDays
    ) {
      const expiryKey = access.expiresAt.slice(0, 10);
      if (prefs.lastEmailExpiryReminderFor !== expiryKey) {
        const dedupeKey = `email_expiry_${userId}_${expiryKey}`;
        const queued = enqueueEmail(store, {
          userId,
          recipientEmail: user.email,
          recipientName: user.name,
          templateId: "online_access_expiry_reminder",
          category: "optional",
          preferenceKey: "expiry_reminder",
          dedupeKey,
          payload: {
            recipientName: user.name,
            expiresAt: access.expiresAt,
            daysRemaining: access.daysRemaining,
            appBaseUrl,
          },
        });
        if (queued) {
          store.db
            .update(s.notificationPreferences)
            .set({
              lastEmailExpiryReminderFor: expiryKey,
              updatedAt: now.toISOString(),
            })
            .where(eq(s.notificationPreferences.userId, userId))
            .run();
          generatedKeys.push(dedupeKey);
        }
      }
    }
  }

  return { generatedKeys };
}

export async function runEmailWorkerCycle(
  store: Store,
  emailService: EmailService,
  appBaseUrl: string,
  now = new Date(),
) {
  const activeReaders = store.db
    .select({ id: s.users.id })
    .from(s.users)
    .where(and(eq(s.users.role, "reader"), eq(s.users.status, "active")))
    .all();

  const generatedKeys: string[] = [];
  for (const r of activeReaders) {
    const res = evaluateUserEmailReminders(store, r.id, appBaseUrl, now);
    generatedKeys.push(...res.generatedKeys);
  }

  const campaignResult = processEmailCampaignQueue(store, {
    appBaseUrl,
    now,
  });
  const deliveryResult = await processEmailQueueBatch(store, emailService, {
    batchSize: 50,
    now,
    defaultAppBaseUrl: appBaseUrl,
  });
  return {
    reminders: {
      evaluatedReaders: activeReaders.length,
      generatedCount: generatedKeys.length,
      generatedKeys,
    },
    campaigns: campaignResult,
    delivery: deliveryResult,
  };
}

export function getAdminEmailOverview(
  store: Store,
  emailService: EmailService,
) {
  const env = getEnvConfig();
  const queueRows = store.db
    .select()
    .from(s.emailQueue)
    .orderBy(desc(s.emailQueue.createdAt), desc(s.emailQueue.id))
    .all();

  const queueById = new Map(queueRows.map((q) => [q.id, q]));

  const events = store.db
    .select()
    .from(s.emailDeliveryEvents)
    .orderBy(desc(s.emailDeliveryEvents.createdAt), desc(s.emailDeliveryEvents.id))
    .limit(60)
    .all();

  const campaigns = store.db
    .select()
    .from(s.emailCampaigns)
    .orderBy(desc(s.emailCampaigns.createdAt), desc(s.emailCampaigns.id))
    .limit(30)
    .all()
    .map((c) => formatEmailCampaignSummary(store, c));

  const suppressedCount = store.db
    .select()
    .from(s.notificationPreferences)
    .all()
    .filter((p) => Boolean(p.emailSuppressedReason)).length;

  const senderEmail = emailService.fromAddress || env.email.from;
  const senderDomain = senderEmail.includes("@")
    ? senderEmail.split("@")[1]
    : "cossyteens.com";

  return {
    configuration: {
      configured: emailService.configured,
      provider: emailService.providerName || env.email.provider,
      fromAddress: senderEmail,
      replyToAddress: emailService.replyToAddress || env.email.replyTo,
      senderDomain,
      domainVerified: Boolean(
        emailService.domainVerified ?? env.email.domainVerified,
      ),
    },
    counts: {
      pending: queueRows.filter((r) => r.status === "pending").length,
      retrying: queueRows.filter((r) => r.status === "retrying").length,
      sent: queueRows.filter((r) => r.status === "sent").length,
      failed: queueRows.filter((r) => r.status === "failed").length,
      bounced: queueRows.filter((r) => r.status === "bounced").length,
      suppressed: queueRows.filter((r) => r.status === "suppressed").length,
      suppressedReaders: suppressedCount,
    },
    recentQueue: queueRows.slice(0, 60).map((r) => ({
      id: r.id,
      userId: r.userId,
      recipientEmail: maskEmailAddress(r.recipientEmail),
      recipientName: r.recipientName,
      templateId: r.templateKey,
      category: r.channelKind === "transactional" ? "transactional" : "optional",
      subject: r.subject,
      status: r.status,
      attempts: r.attempts,
      maxAttempts: r.maxAttempts,
      provider: r.providerName,
      lastError: r.lastError,
      nextAttemptAt: r.nextAttemptAt,
      sentAt: r.sentAt,
      createdAt: r.createdAt,
    })),
    recentEvents: events.map((e) => {
      const parent = queueById.get(e.emailQueueId);
      return {
        id: e.id,
        recipientEmail: parent
          ? maskEmailAddress(parent.recipientEmail)
          : "reader",
        templateId: parent?.templateKey || "email",
        eventType: e.eventType,
        provider: e.providerName,
        detail: e.detail,
        createdAt: e.createdAt,
      };
    }),
    campaigns,
  };
}

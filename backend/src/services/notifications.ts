import { and, desc, eq, inArray, lte, or, sql } from "drizzle-orm";
import * as webpush from "web-push";
import type { Store } from "../db.js";
import * as s from "../schema.js";
import { logAdminAudit, publicUser, type AdminActor } from "../auth.js";
import { getSubscriptionDetails, hasPremiumAccess } from "./subscriptions.js";
import { getUserDigitalEntitlement } from "./commerce.js";
import { getAppSettings } from "./settings.js";
import {
  getReaderAccessSummary,
  userMatchesAudienceSegment,
  type ReaderAudienceSegment,
} from "./access.js";
import { HttpError } from "../errors.js";

export const SUPPORTED_TIMEZONES = [
  "Africa/Lagos",
  "Africa/Accra",
  "Africa/Nairobi",
  "Africa/Johannesburg",
  "Africa/Cairo",
  "UTC",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Paris",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Australia/Sydney",
] as const;

export type NotificationCategory =
  | "daily_reminder"
  | "unread_reminder"
  | "subscription"
  | "digital_purchase"
  | "printed_order"
  | "announcement"
  | "account"
  | "system";

export const ALLOWED_NOTIFICATION_PATH_PREFIXES = [
  "/dashboard",
  "/library",
  "/read/",
  "/journal",
  "/saved",
  "/subscription",
  "/digital-edition",
  "/bookstore",
  "/account",
  "/notifications",
  "/install",
  "/sample",
  "/contact",
  "/themes",
  "/about",
  "/pricing",
] as const;

export function isSafeInternalActionUrl(rawUrl: string): boolean {
  const url = String(rawUrl || "").trim();
  if (!url.startsWith("/") || url.startsWith("//")) return false;
  if (/[\s<>'"\\]/.test(url)) return false;
  const lower = url.toLowerCase();
  if (lower.includes("javascript:") || lower.includes("data:")) return false;
  const basePath = url.split("?")[0].split("#")[0];
  return ALLOWED_NOTIFICATION_PATH_PREFIXES.some(
    (prefix) => basePath === prefix || basePath.startsWith(prefix),
  );
}

export type SafePushPayload = {
  title: string;
  body: string;
  actionUrl: string;
  tag: string;
  category: NotificationCategory;
  timestamp: string;
};

export type PushSubscriptionTarget = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
};

export interface WebPushProvider {
  readonly configured: boolean;
  readonly publicKey: string | null;
  sendNotification(
    subscription: PushSubscriptionTarget,
    payload: SafePushPayload,
  ): Promise<{ statusCode: number }>;
}

export class WebPushDeliveryError extends Error {
  readonly statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "WebPushDeliveryError";
    this.statusCode = statusCode;
  }
}

export class LiveWebPushProvider implements WebPushProvider {
  readonly configured: boolean;
  readonly publicKey: string | null;
  private readonly privateKey: string;
  private readonly subject: string;

  constructor(options: {
    publicKey?: string | null;
    privateKey?: string;
    subject?: string;
  }) {
    this.publicKey = options.publicKey?.trim() || null;
    this.privateKey = options.privateKey?.trim() || "";
    this.subject =
      options.subject?.trim() || "mailto:cossyteensconsult@gmail.com";
    this.configured = Boolean(this.publicKey && this.privateKey);

    if (this.configured && this.publicKey) {
      webpush.setVapidDetails(this.subject, this.publicKey, this.privateKey);
    }
  }

  async sendNotification(
    subscription: PushSubscriptionTarget,
    payload: SafePushPayload,
  ): Promise<{ statusCode: number }> {
    if (!this.configured) {
      throw new WebPushDeliveryError(
        "Web Push VAPID keys are not configured.",
        503,
      );
    }
    const safePayload = sanitizePushPayload(payload);
    try {
      const res = await webpush.sendNotification(
        subscription,
        JSON.stringify(safePayload),
        {
          TTL: 60 * 60 * 12,
          urgency: "normal",
        },
      );
      return { statusCode: res.statusCode || 201 };
    } catch (err: unknown) {
      const statusCode =
        typeof (err as { statusCode?: unknown })?.statusCode === "number"
          ? (err as { statusCode: number }).statusCode
          : 500;
      const bodyMsg =
        typeof (err as { body?: unknown })?.body === "string"
          ? (err as { body: string }).body.slice(0, 200)
          : (err as Error)?.message || "Web Push delivery failed.";
      throw new WebPushDeliveryError(bodyMsg, statusCode);
    }
  }
}

export function generateVapidKeyPair() {
  return webpush.generateVAPIDKeys();
}

const SENSITIVE_PATTERNS = [
  /sk_live_[a-zA-Z0-9]+/i,
  /sk_test_[a-zA-Z0-9]+/i,
  /password_hash/i,
  /balanced_session/i,
  /balanced_admin_session/i,
];

export function sanitizePushPayload(input: SafePushPayload): SafePushPayload {
  const title = String(input.title || "The Balanced Life Devotional")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  const body = String(input.body || "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);

  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(title) || pattern.test(body)) {
      throw new Error(
        "Refusing to include sensitive credentials or session data in push payload.",
      );
    }
  }

  const rawUrl = String(input.actionUrl || "/dashboard").trim();
  const actionUrl = isSafeInternalActionUrl(rawUrl) ? rawUrl : "/dashboard";

  return {
    title,
    body,
    actionUrl,
    tag: String(input.tag || "balanced-life-notification").slice(0, 80),
    category: input.category || "system",
    timestamp: input.timestamp || new Date().toISOString(),
  };
}

export function isValidTimezone(tz: string): boolean {
  if (!tz || typeof tz !== "string") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function parseTimeMinutes(hhmm: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(hhmm.trim());
  if (!match) return 6 * 60 + 30;
  const hours = Math.min(23, Math.max(0, Number(match[1])));
  const minutes = Math.min(59, Math.max(0, Number(match[2])));
  return hours * 60 + minutes;
}

export function getLocalDateTime(
  now: Date,
  timezone: string,
): {
  localDate: string;
  localTime: string;
  minutesOfDay: number;
  timezone: string;
} {
  const safeTz = isValidTimezone(timezone) ? timezone : "Africa/Lagos";
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: safeTz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(now);
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value || "00";
  const year = get("year");
  const month = get("month");
  const day = get("day");
  const rawHour = get("hour");
  const hour = rawHour === "24" ? "00" : rawHour.padStart(2, "0");
  const minute = get("minute").padStart(2, "0");

  const localDate = `${year}-${month}-${day}`;
  const localTime = `${hour}:${minute}`;
  return {
    localDate,
    localTime,
    minutesOfDay: parseTimeMinutes(localTime),
    timezone: safeTz,
  };
}

export function isWithinQuietHours(
  localTime: string,
  quietStart: string,
  quietEnd: string,
): boolean {
  if (!quietStart || !quietEnd || quietStart === quietEnd) return false;
  const current = parseTimeMinutes(localTime);
  const start = parseTimeMinutes(quietStart);
  const end = parseTimeMinutes(quietEnd);

  if (start < end) {
    // Same-day range, e.g. 01:00 to 05:00
    return current >= start && current < end;
  }
  // Overnight range, e.g. 22:00 to 05:00
  return current >= start || current < end;
}

export function deriveDeviceLabel(userAgent = "", customLabel?: string): string {
  if (customLabel && customLabel.trim()) {
    return customLabel.trim().slice(0, 80);
  }
  const ua = userAgent.toLowerCase();
  if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ios")) {
    return "iPhone / iPad (Home Screen Web App)";
  }
  if (ua.includes("android")) {
    return "Android Phone / Tablet";
  }
  if (ua.includes("macintosh") || ua.includes("mac os")) {
    return "macOS Browser";
  }
  if (ua.includes("windows")) {
    return "Windows Browser";
  }
  if (ua.includes("linux")) {
    return "Linux Browser";
  }
  return "Registered Browser Device";
}

export type NotificationPrefs = {
  userId: number;
  notificationsEnabled: boolean;
  dailyReminderEnabled: boolean;
  unreadReminderEnabled: boolean;
  reminderTime: string;
  timezone: string;
  quietHoursStart: string;
  quietHoursEnd: string;
  subscriptionAlertsEnabled: boolean;
  purchaseAlertsEnabled: boolean;
  announcementsEnabled: boolean;
  lastDailyReminderDate: string | null;
  lastUnreadReminderDate: string | null;
  lastExpiryReminderFor: string | null;
  updatedAt: string;
};

export function getNotificationPreferences(
  store: Store,
  userId: number,
): NotificationPrefs {
  const existing = store.db
    .select()
    .from(s.notificationPreferences)
    .where(eq(s.notificationPreferences.userId, userId))
    .get();

  if (existing) {
    return existing;
  }

  const now = new Date().toISOString();
  return store.db
    .insert(s.notificationPreferences)
    .values({
      userId,
      notificationsEnabled: true,
      dailyReminderEnabled: false,
      unreadReminderEnabled: false,
      reminderTime: "06:30",
      timezone: "Africa/Lagos",
      quietHoursStart: "22:00",
      quietHoursEnd: "05:00",
      subscriptionAlertsEnabled: true,
      purchaseAlertsEnabled: true,
      announcementsEnabled: false,
      updatedAt: now,
    })
    .returning()
    .get();
}

export function updateNotificationPreferences(
  store: Store,
  userId: number,
  updates: Partial<{
    notificationsEnabled: boolean;
    dailyReminderEnabled: boolean;
    unreadReminderEnabled: boolean;
    reminderTime: string;
    timezone: string;
    quietHoursStart: string;
    quietHoursEnd: string;
    subscriptionAlertsEnabled: boolean;
    purchaseAlertsEnabled: boolean;
    announcementsEnabled: boolean;
  }>,
): NotificationPrefs {
  const current = getNotificationPreferences(store, userId);
  if (updates.timezone !== undefined && !isValidTimezone(updates.timezone)) {
    throw new HttpError(400, "Invalid IANA timezone identifier.");
  }
  const now = new Date().toISOString();
  const nextNotificationsEnabled =
    updates.notificationsEnabled ?? current.notificationsEnabled;
  const nextAnnouncementsEnabled =
    updates.announcementsEnabled ?? current.announcementsEnabled;

  // If the user disables notifications overall, mark any pending events as skipped for push
  if (!nextNotificationsEnabled) {
    store.db
      .update(s.notificationEvents)
      .set({
        pushStatus: "skipped",
        lastError: "Notifications disabled by user preference.",
      })
      .where(
        and(
          eq(s.notificationEvents.userId, userId),
          eq(s.notificationEvents.pushStatus, "pending"),
        ),
      )
      .run();
  } else if (!nextAnnouncementsEnabled) {
    store.db
      .update(s.notificationEvents)
      .set({
        pushStatus: "skipped",
        lastError: "Optional announcements opted out by user.",
      })
      .where(
        and(
          eq(s.notificationEvents.userId, userId),
          eq(s.notificationEvents.category, "announcement"),
          eq(s.notificationEvents.pushStatus, "pending"),
        ),
      )
      .run();
  }

  return store.db
    .update(s.notificationPreferences)
    .set({
      notificationsEnabled: nextNotificationsEnabled,
      dailyReminderEnabled:
        updates.dailyReminderEnabled ?? current.dailyReminderEnabled,
      unreadReminderEnabled:
        updates.unreadReminderEnabled ?? current.unreadReminderEnabled,
      reminderTime: updates.reminderTime ?? current.reminderTime,
      timezone: updates.timezone ?? current.timezone,
      quietHoursStart: updates.quietHoursStart ?? current.quietHoursStart,
      quietHoursEnd: updates.quietHoursEnd ?? current.quietHoursEnd,
      subscriptionAlertsEnabled:
        updates.subscriptionAlertsEnabled ?? current.subscriptionAlertsEnabled,
      purchaseAlertsEnabled:
        updates.purchaseAlertsEnabled ?? current.purchaseAlertsEnabled,
      announcementsEnabled: nextAnnouncementsEnabled,
      updatedAt: now,
    })
    .where(eq(s.notificationPreferences.userId, userId))
    .returning()
    .get();
}

export function savePushSubscription(
  store: Store,
  userId: number,
  input: {
    endpoint: string;
    p256dhKey: string;
    authKey: string;
    userAgent?: string;
    deviceLabel?: string;
  },
) {
  const now = new Date().toISOString();
  const label = deriveDeviceLabel(input.userAgent, input.deviceLabel);
  return store.db
    .insert(s.pushSubscriptions)
    .values({
      userId,
      endpoint: input.endpoint,
      p256dhKey: input.p256dhKey,
      authKey: input.authKey,
      userAgent: input.userAgent || "",
      deviceLabel: label,
      status: "active",
      failureCount: 0,
      lastError: "",
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: s.pushSubscriptions.endpoint,
      set: {
        userId,
        p256dhKey: input.p256dhKey,
        authKey: input.authKey,
        userAgent: input.userAgent || "",
        deviceLabel: label,
        status: "active",
        failureCount: 0,
        lastError: "",
        updatedAt: now,
      },
    })
    .returning()
    .get();
}

export function removePushSubscription(
  store: Store,
  userId: number,
  endpoint?: string,
) {
  if (endpoint) {
    store.db
      .delete(s.pushSubscriptions)
      .where(
        and(
          eq(s.pushSubscriptions.userId, userId),
          eq(s.pushSubscriptions.endpoint, endpoint),
        ),
      )
      .run();
  } else {
    store.db
      .delete(s.pushSubscriptions)
      .where(eq(s.pushSubscriptions.userId, userId))
      .run();
  }
}

export function removePushSubscriptionById(
  store: Store,
  userId: number,
  deviceId: number,
) {
  const res = store.db
    .delete(s.pushSubscriptions)
    .where(
      and(
        eq(s.pushSubscriptions.id, deviceId),
        eq(s.pushSubscriptions.userId, userId),
      ),
    )
    .run();
  if (!res.changes) {
    throw new HttpError(404, "Registered push device not found.");
  }
  return { ok: true };
}

export function getUserPushDevices(store: Store, userId: number) {
  return store.db
    .select()
    .from(s.pushSubscriptions)
    .where(eq(s.pushSubscriptions.userId, userId))
    .orderBy(desc(s.pushSubscriptions.updatedAt))
    .all()
    .map((d) => ({
      id: d.id,
      deviceLabel: d.deviceLabel,
      endpoint: d.endpoint,
      endpointHost: (() => {
        try {
          return new URL(d.endpoint).host;
        } catch {
          return "push-service";
        }
      })(),
      userAgent: d.userAgent,
      status: d.status as "active" | "expired" | "disabled",
      failureCount: d.failureCount,
      lastError: d.lastError,
      lastSuccessAt: d.lastSuccessAt,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    }));
}

export function getUserPushSubscriptionsCount(
  store: Store,
  userId: number,
): number {
  return store.db
    .select()
    .from(s.pushSubscriptions)
    .where(
      and(
        eq(s.pushSubscriptions.userId, userId),
        eq(s.pushSubscriptions.status, "active"),
      ),
    )
    .all().length;
}

export function createNotificationEvent(
  store: Store,
  input: {
    userId: number;
    category: NotificationCategory;
    title: string;
    body: string;
    actionUrl?: string;
    dedupeKey: string;
    respectPreferences?: boolean;
    campaignId?: number | null;
    createdByAdminId?: number | null;
  },
) {
  const prefs = getNotificationPreferences(store, input.userId);
  const checkPrefs = input.respectPreferences !== false;
  const isEssentialAccountNotice =
    input.category === "account" || input.category === "system";

  if (checkPrefs) {
    if (input.category === "announcement") {
      if (!prefs.notificationsEnabled || !prefs.announcementsEnabled) {
        return null;
      }
    } else if (!isEssentialAccountNotice) {
      if (!prefs.notificationsEnabled) {
        return null;
      }
      if (input.category === "daily_reminder" && !prefs.dailyReminderEnabled) {
        return null;
      }
      if (
        input.category === "unread_reminder" &&
        !prefs.unreadReminderEnabled
      ) {
        return null;
      }
      if (
        input.category === "subscription" &&
        !prefs.subscriptionAlertsEnabled
      ) {
        return null;
      }
      if (
        input.category === "digital_purchase" &&
        !prefs.purchaseAlertsEnabled
      ) {
        return null;
      }
    }
  }

  const safe = sanitizePushPayload({
    title: input.title,
    body: input.body,
    actionUrl: input.actionUrl || "/dashboard",
    tag: input.dedupeKey,
    category: input.category,
    timestamp: new Date().toISOString(),
  });

  const cleanBody = String(input.body || "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 600);

  const now = new Date().toISOString();
  const inserted = store.db
    .insert(s.notificationEvents)
    .values({
      userId: input.userId,
      category: input.category,
      title: safe.title,
      body: cleanBody || safe.body,
      actionUrl: safe.actionUrl,
      dedupeKey: input.dedupeKey,
      campaignId: input.campaignId ?? null,
      createdByAdminId: input.createdByAdminId ?? null,
      pushStatus: prefs.notificationsEnabled ? "pending" : "skipped",
      lastError: prefs.notificationsEnabled
        ? ""
        : "Push notifications disabled; delivered in-app only.",
      deliveryAttempts: 0,
      maxAttempts: 3,
      createdAt: now,
    })
    .onConflictDoNothing({ target: s.notificationEvents.dedupeKey })
    .returning()
    .get();

  return (
    inserted ||
    store.db
      .select()
      .from(s.notificationEvents)
      .where(eq(s.notificationEvents.dedupeKey, input.dedupeKey))
      .get() ||
    null
  );
}

/**
 * Evaluates a single user's scheduled reminders (Daily Devotional, Unread Devotional,
 * and Subscription Expiration) for a given reference UTC timestamp.
 *
 * Rules enforced:
 * - Respects user's master `notificationsEnabled` toggle.
 * - Converts `now` to the user's IANA `timezone` (`localDate` and `localTime`).
 * - Respects user's `quietHoursStart`..`quietHoursEnd` window.
 * - Respects user's `reminderTime` (`localTime >= prefs.reminderTime`).
 * - Never sends ordinary 2027 daily devotional reminders before 2027-01-01 or after 2027-12-31.
 * - Never sends reminders for unpublished or future devotionals.
 * - Checks reading completion and user access permissions (`entry.sample` or `hasPremiumAccess`)
 *   so users without access never receive misleading premium-reading reminders.
 */
export function evaluateUserScheduledReminders(
  store: Store,
  userId: number,
  now: Date = new Date(),
): {
  skippedReason: string | null;
  localDate: string;
  localTime: string;
  generated: string[];
} {
  const userRow = store.db
    .select()
    .from(s.users)
    .where(eq(s.users.id, userId))
    .get();

  if (!userRow || userRow.status !== "active") {
    return {
      skippedReason: "inactive_user",
      localDate: "",
      localTime: "",
      generated: [],
    };
  }

  const prefs = getNotificationPreferences(store, userId);
  const { localDate, localTime, minutesOfDay } = getLocalDateTime(
    now,
    prefs.timezone,
  );

  if (!prefs.notificationsEnabled) {
    return {
      skippedReason: "notifications_disabled",
      localDate,
      localTime,
      generated: [],
    };
  }

  if (
    isWithinQuietHours(localTime, prefs.quietHoursStart, prefs.quietHoursEnd)
  ) {
    return {
      skippedReason: "quiet_hours",
      localDate,
      localTime,
      generated: [],
    };
  }

  const generated: string[] = [];
  const settings = getAppSettings(store);
  const nowIso = now.toISOString();
  const user = publicUser(userRow);

  // 1. Subscription / 12-Month Online Access renewal / expiration reminder (deduplicated per expiry state)
  if (prefs.subscriptionAlertsEnabled) {
    const sub = getSubscriptionDetails(
      store,
      userId,
      settings.renewalReminderDays,
      nowIso,
    );
    if (sub?.renewalReminder) {
      const expiryKey = `${sub.id}_${sub.expiresAt.slice(0, 10)}_${sub.renewalReminder.expired ? "expired" : "due"}`;
      if (prefs.lastExpiryReminderFor !== expiryKey) {
        const dedupeKey = `sub_reminder_${userId}_${expiryKey}`;
        createNotificationEvent(store, {
          userId,
          category: "subscription",
          title: sub.renewalReminder.expired
            ? "Membership Expired"
            : "Membership Renewal Reminder",
          body: sub.renewalReminder.message,
          actionUrl: "/subscription",
          dedupeKey,
        });
        store.db
          .update(s.notificationPreferences)
          .set({ lastExpiryReminderFor: expiryKey, updatedAt: nowIso })
          .where(eq(s.notificationPreferences.userId, userId))
          .run();
        generated.push(dedupeKey);
      }
    }

    const entitlement = getUserDigitalEntitlement(store, userId, 2027, nowIso);
    if (
      entitlement &&
      !entitlement.legacyPersistent &&
      entitlement.expiresAt &&
      (entitlement.status === "expired" || entitlement.expiringSoon)
    ) {
      const isEntExpired = entitlement.status === "expired";
      const entKey = `ent_${entitlement.id}_${entitlement.expiresAt.slice(0, 10)}_${isEntExpired ? "expired" : "due"}`;
      if (prefs.lastExpiryReminderFor !== entKey) {
        const dedupeKey = `digital_ent_reminder_${userId}_${entKey}`;
        createNotificationEvent(store, {
          userId,
          category: "subscription",
          title: isEntExpired
            ? "2027 Digital Access Expired"
            : "2027 Digital Access Expiring Soon",
          body: isEntExpired
            ? `Your 12-month 2027 Digital Devotional access expired on ${new Date(entitlement.expiresAt).toLocaleDateString("en-GB")}. Your journals and progress are safely preserved — renew your 12-month access anytime.`
            : `Your 12-month 2027 Digital Devotional access expires in ${entitlement.daysRemaining} day${entitlement.daysRemaining === 1 ? "" : "s"} (${new Date(entitlement.expiresAt).toLocaleDateString("en-GB")}). Renew anytime to extend by 12 calendar months.`,
          actionUrl: "/digital-edition",
          dedupeKey,
        });
        store.db
          .update(s.notificationPreferences)
          .set({ lastExpiryReminderFor: entKey, updatedAt: nowIso })
          .where(eq(s.notificationPreferences.userId, userId))
          .run();
        generated.push(dedupeKey);
      }
    }
  }

  // 2. Ordinary 2027 daily devotional reminders only run within 2027-01-01 .. 2027-12-31
  const isWithinDevotionalYear =
    localDate >= "2027-01-01" && localDate <= "2027-12-31";
  if (!isWithinDevotionalYear) {
    return {
      skippedReason:
        localDate < "2027-01-01" ? "before_2027_edition" : "after_2027_edition",
      localDate,
      localTime,
      generated,
    };
  }

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

  if (!entry) {
    return {
      skippedReason: "no_published_devotional_for_date",
      localDate,
      localTime,
      generated,
    };
  }

  // Verify access permission: free sample OR active membership / 2027 Digital Edition
  const canAccessEntry = Boolean(
    entry.sample || hasPremiumAccess(store, user, nowIso),
  );
  if (!canAccessEntry) {
    return {
      skippedReason: "no_premium_access",
      localDate,
      localTime,
      generated,
    };
  }

  const completed = store.db
    .select()
    .from(s.progress)
    .where(
      and(
        eq(s.progress.userId, userId),
        eq(s.progress.devotionalId, entry.id),
      ),
    )
    .get();

  const reminderMinutes = parseTimeMinutes(prefs.reminderTime);

  // 2a. Daily devotional reminder at or after user's preferred reminderTime
  if (
    prefs.dailyReminderEnabled &&
    prefs.lastDailyReminderDate !== localDate &&
    minutesOfDay >= reminderMinutes
  ) {
    if (!completed) {
      const dedupeKey = `daily_reminder_${userId}_${localDate}`;
      createNotificationEvent(store, {
        userId,
        category: "daily_reminder",
        title: `Daily Devotional: ${entry.title}`,
        body: "Take a few quiet minutes today to Connect with Jesus, Learn, Reflect, Apply, and Track Your Growth.",
        actionUrl: `/read/${entry.id}`,
        dedupeKey,
      });
      generated.push(dedupeKey);
    }

    store.db
      .update(s.notificationPreferences)
      .set({ lastDailyReminderDate: localDate, updatedAt: nowIso })
      .where(eq(s.notificationPreferences.userId, userId))
      .run();
  }

  // 2b. Unread devotional evening follow-up reminder where enabled
  // Triggers at or after 18:00 local time (and at least 3 hours after daily reminderTime) if still unread
  const unreadThresholdMinutes = Math.max(18 * 60, reminderMinutes + 180);
  if (
    prefs.unreadReminderEnabled &&
    prefs.lastUnreadReminderDate !== localDate &&
    minutesOfDay >= unreadThresholdMinutes
  ) {
    if (!completed) {
      const dedupeKey = `unread_reminder_${userId}_${localDate}`;
      createNotificationEvent(store, {
        userId,
        category: "unread_reminder",
        title: `Unread Today: ${entry.title}`,
        body: "Your 2027 devotional reading for today is still waiting. Spend a few quiet minutes in reflection before the day ends.",
        actionUrl: `/read/${entry.id}`,
        dedupeKey,
      });
      generated.push(dedupeKey);
    }

    store.db
      .update(s.notificationPreferences)
      .set({ lastUnreadReminderDate: localDate, updatedAt: nowIso })
      .where(eq(s.notificationPreferences.userId, userId))
      .run();
  }

  return {
    skippedReason: null,
    localDate,
    localTime,
    generated,
  };
}

/**
 * Backwards-compatible helper accepting either a Date or YYYY-MM-DD string.
 */
export function evaluateUserReminders(
  store: Store,
  userId: number,
  currentDateOrNow?: string | Date,
) {
  let refDate: Date;
  if (currentDateOrNow instanceof Date) {
    refDate = currentDateOrNow;
  } else if (
    typeof currentDateOrNow === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(currentDateOrNow)
  ) {
    // Use 08:00 UTC so standard morning reminders (e.g. 06:30 Africa/Lagos) are eligible
    refDate = new Date(`${currentDateOrNow}T08:00:00.000Z`);
  } else {
    refDate = new Date();
  }
  return evaluateUserScheduledReminders(store, userId, refDate);
}

/**
 * Concurrency-safe dispatcher for pending Web Push notifications.
 * Uses an IMMEDIATE SQLite transaction to claim due events with a lock lease
 * (`locked_until`) so simultaneous worker processes cannot send the same notification twice.
 */
export async function dispatchPendingPushNotifications(
  store: Store,
  pushProvider: WebPushProvider,
  options: {
    now?: Date;
    batchSize?: number;
    lockLeaseMs?: number;
  } = {},
): Promise<{
  claimed: number;
  sentEvents: number;
  skippedEvents: number;
  failedEvents: number;
  expiredEndpointsRemoved: number;
}> {
  const now = options.now || new Date();
  const nowIso = now.toISOString();
  const batchSize = options.batchSize ?? 25;
  const lockLeaseMs = options.lockLeaseMs ?? 60_000;
  const lockUntilIso = new Date(now.getTime() + lockLeaseMs).toISOString();

  // Atomically claim due notification events inside an IMMEDIATE transaction
  const claimTx = store.sqlite.transaction(() => {
    const candidates = store.db
      .select()
      .from(s.notificationEvents)
      .where(
        and(
          inArray(s.notificationEvents.pushStatus, [
            "pending",
            "failed",
            "processing",
          ]),
          sql`${s.notificationEvents.deliveryAttempts} < ${s.notificationEvents.maxAttempts}`,
          or(
            sql`${s.notificationEvents.nextAttemptAt} IS NULL`,
            lte(s.notificationEvents.nextAttemptAt, nowIso),
          ),
          or(
            sql`${s.notificationEvents.lockedUntil} IS NULL`,
            lte(s.notificationEvents.lockedUntil, nowIso),
          ),
        ),
      )
      .orderBy(s.notificationEvents.id)
      .limit(batchSize)
      .all();

    const claimedRows: typeof candidates = [];
    for (const row of candidates) {
      const updated = store.sqlite
        .prepare(
          `UPDATE notification_events
           SET push_status = 'processing',
               locked_until = ?,
               delivery_attempts = delivery_attempts + 1
           WHERE id = ?
             AND delivery_attempts < max_attempts
             AND (locked_until IS NULL OR locked_until <= ?)`,
        )
        .run(lockUntilIso, row.id, nowIso);
      if (updated.changes === 1) {
        claimedRows.push({
          ...row,
          pushStatus: "processing",
          lockedUntil: lockUntilIso,
          deliveryAttempts: row.deliveryAttempts + 1,
        });
      }
    }
    return claimedRows;
  });

  const claimedEvents = claimTx.immediate();

  let sentEvents = 0;
  let skippedEvents = 0;
  let failedEvents = 0;
  let expiredEndpointsRemoved = 0;

  for (const ev of claimedEvents) {
    const prefs = getNotificationPreferences(store, ev.userId);
    if (!prefs.notificationsEnabled) {
      store.db
        .update(s.notificationEvents)
        .set({
          pushStatus: "skipped",
          lockedUntil: null,
          lastError: "Notifications disabled by user.",
        })
        .where(eq(s.notificationEvents.id, ev.id))
        .run();
      skippedEvents++;
      continue;
    }

    const activeSubs = store.db
      .select()
      .from(s.pushSubscriptions)
      .where(
        and(
          eq(s.pushSubscriptions.userId, ev.userId),
          eq(s.pushSubscriptions.status, "active"),
        ),
      )
      .all();

    if (activeSubs.length === 0) {
      // No active push devices registered; in-app notification remains available
      store.db
        .update(s.notificationEvents)
        .set({
          pushStatus: "skipped",
          lockedUntil: null,
          lastError: "No active push devices registered for user.",
        })
        .where(eq(s.notificationEvents.id, ev.id))
        .run();
      skippedEvents++;
      continue;
    }

    if (!pushProvider.configured) {
      store.db
        .update(s.notificationEvents)
        .set({
          pushStatus: "skipped",
          lockedUntil: null,
          lastError: "Web Push VAPID provider not configured.",
        })
        .where(eq(s.notificationEvents.id, ev.id))
        .run();
      skippedEvents++;
      continue;
    }

    // Find subscriptions that already succeeded for this event on a prior attempt
    const alreadySentSubIds = new Set(
      store.db
        .select({ subId: s.notificationDeliveries.pushSubscriptionId })
        .from(s.notificationDeliveries)
        .where(
          and(
            eq(s.notificationDeliveries.notificationEventId, ev.id),
            eq(s.notificationDeliveries.status, "sent"),
          ),
        )
        .all()
        .map((r) => r.subId),
    );

    let deviceSuccessCount = alreadySentSubIds.size;
    let transientFailureCount = 0;
    let lastErrorMsg = "";

    const payload = sanitizePushPayload({
      title: ev.title,
      body: ev.body,
      actionUrl: ev.actionUrl,
      tag: ev.dedupeKey,
      category: ev.category as NotificationCategory,
      timestamp: ev.createdAt,
    });

    for (const sub of activeSubs) {
      if (alreadySentSubIds.has(sub.id)) continue;

      try {
        const res = await pushProvider.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dhKey, auth: sub.authKey },
          },
          payload,
        );
        if (res.statusCode >= 400) {
          throw new WebPushDeliveryError(
            `Push endpoint returned HTTP ${res.statusCode}`,
            res.statusCode,
          );
        }

        deviceSuccessCount++;
        const deliveredAt = new Date().toISOString();

        store.db
          .insert(s.notificationDeliveries)
          .values({
            notificationEventId: ev.id,
            pushSubscriptionId: sub.id,
            status: "sent",
            statusCode: res.statusCode,
            errorMessage: "",
            deliveredAt,
          })
          .onConflictDoUpdate({
            target: [
              s.notificationDeliveries.notificationEventId,
              s.notificationDeliveries.pushSubscriptionId,
            ],
            set: {
              status: "sent",
              statusCode: res.statusCode,
              errorMessage: "",
              deliveredAt,
            },
          })
          .run();

        store.db
          .update(s.pushSubscriptions)
          .set({
            failureCount: 0,
            lastError: "",
            lastSuccessAt: deliveredAt,
            updatedAt: deliveredAt,
          })
          .where(eq(s.pushSubscriptions.id, sub.id))
          .run();
      } catch (err: unknown) {
        const statusCode =
          err instanceof WebPushDeliveryError
            ? err.statusCode
            : typeof (err as { statusCode?: unknown })?.statusCode === "number"
              ? (err as { statusCode: number }).statusCode
              : 500;
        const errMsg = (err as Error)?.message || "Push delivery error";
        lastErrorMsg = errMsg;

        if (statusCode === 404 || statusCode === 410) {
          // Endpoint is permanently expired / unsubscribed; remove it immediately
          store.db
            .delete(s.pushSubscriptions)
            .where(eq(s.pushSubscriptions.id, sub.id))
            .run();
          expiredEndpointsRemoved++;
        } else {
          transientFailureCount++;
          const deliveredAt = new Date().toISOString();
          store.db
            .insert(s.notificationDeliveries)
            .values({
              notificationEventId: ev.id,
              pushSubscriptionId: sub.id,
              status: "failed",
              statusCode,
              errorMessage: errMsg.slice(0, 300),
              deliveredAt,
            })
            .onConflictDoUpdate({
              target: [
                s.notificationDeliveries.notificationEventId,
                s.notificationDeliveries.pushSubscriptionId,
              ],
              set: {
                status: "failed",
                statusCode,
                errorMessage: errMsg.slice(0, 300),
                deliveredAt,
              },
            })
            .run();

          store.db
            .update(s.pushSubscriptions)
            .set({
              failureCount: sub.failureCount + 1,
              lastError: errMsg.slice(0, 300),
              updatedAt: deliveredAt,
            })
            .where(eq(s.pushSubscriptions.id, sub.id))
            .run();
        }
      }
    }

    if (transientFailureCount === 0 && deviceSuccessCount > 0) {
      store.db
        .update(s.notificationEvents)
        .set({
          pushStatus: "sent",
          lockedUntil: null,
          lastError: "",
          pushSentAt: new Date().toISOString(),
        })
        .where(eq(s.notificationEvents.id, ev.id))
        .run();
      sentEvents++;
    } else if (transientFailureCount === 0 && deviceSuccessCount === 0) {
      // All endpoints were 404/410 expired and cleaned up
      store.db
        .update(s.notificationEvents)
        .set({
          pushStatus: "skipped",
          lockedUntil: null,
          lastError: lastErrorMsg || "All push endpoints expired and removed.",
        })
        .where(eq(s.notificationEvents.id, ev.id))
        .run();
      skippedEvents++;
    } else {
      // At least one device had a transient failure; schedule exponential backoff if attempts remain
      const backoffMs = Math.min(30 * 60_000, 30_000 * 2 ** ev.deliveryAttempts);
      const nextAttemptAt =
        ev.deliveryAttempts < ev.maxAttempts
          ? new Date(now.getTime() + backoffMs).toISOString()
          : null;
      store.db
        .update(s.notificationEvents)
        .set({
          pushStatus: "failed",
          lockedUntil: null,
          nextAttemptAt,
          lastError: lastErrorMsg.slice(0, 300),
        })
        .where(eq(s.notificationEvents.id, ev.id))
        .run();
      failedEvents++;
    }
  }

  return {
    claimed: claimedEvents.length,
    sentEvents,
    skippedEvents,
    failedEvents,
    expiredEndpointsRemoved,
  };
}

export function validateAdminNotificationPayload(input: {
  targetType: "individual" | "all" | "segment";
  targetSegment?: ReaderAudienceSegment;
  targetUserId?: number;
  category: "announcement" | "account" | "system" | "subscription";
  title: string;
  body: string;
  actionUrl: string;
  scheduledFor?: string | null;
}) {
  const rawTitle = String(input.title || "").trim();
  const rawBody = String(input.body || "").trim();
  const rawUrl = String(input.actionUrl || "/dashboard").trim();

  if (/[<>]/.test(rawTitle) || /[<>]/.test(rawBody)) {
    throw new HttpError(
      400,
      "Untrusted HTML tags or angle brackets are not allowed in notification titles or messages.",
    );
  }
  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(rawTitle) || pattern.test(rawBody)) {
      throw new HttpError(
        400,
        "Notification content must not contain credentials or private tokens.",
      );
    }
  }
  if (!isSafeInternalActionUrl(rawUrl)) {
    throw new HttpError(
      400,
      "Notification destination must be a safe internal app route (e.g. /dashboard, /library, /digital-edition, or /account).",
    );
  }
  if (input.targetType === "individual" && !input.targetUserId) {
    throw new HttpError(
      400,
      "Select a target reader account for an individual notification.",
    );
  }
  if (input.targetType === "segment" && !input.targetSegment) {
    throw new HttpError(
      400,
      "Select an audience segment (free, pending_payment, scheduled, active, expired, or revoked).",
    );
  }

  let scheduledForIso: string | null = null;
  if (input.scheduledFor && input.scheduledFor.trim()) {
    const parsed = new Date(input.scheduledFor.trim());
    if (Number.isNaN(parsed.getTime())) {
      throw new HttpError(400, "Scheduled delivery time must be a valid ISO date.");
    }
    scheduledForIso = parsed.toISOString();
  }

  const effectiveCategory: "announcement" | "account" | "system" | "subscription" =
    input.targetType === "individual" ? input.category : "announcement";

  return {
    title: rawTitle.replace(/\s+/g, " ").slice(0, 120),
    body: rawBody.replace(/\s+/g, " ").slice(0, 600),
    actionUrl: rawUrl,
    category: effectiveCategory,
    scheduledFor: scheduledForIso,
  };
}

export function searchNotificationReaders(
  store: Store,
  options: {
    search?: string;
    segment?: ReaderAudienceSegment | "all";
    limit?: number;
  } = {},
) {
  const readers = store.db
    .select()
    .from(s.users)
    .where(and(eq(s.users.role, "reader"), eq(s.users.status, "active")))
    .orderBy(desc(s.users.createdAt))
    .all();

  const searchLower = (options.search || "").trim().toLowerCase();
  const limit = Math.min(Math.max(1, options.limit || 40), 100);
  const nowIso = new Date().toISOString();

  const rows: Array<{
    id: number;
    name: string;
    email: string;
    accessStatus: string;
    notificationsEnabled: boolean;
    announcementsEnabled: boolean;
    pushDevicesCount: number;
    createdAt: string;
  }> = [];

  for (const r of readers) {
    if (
      searchLower &&
      !`${r.name} ${r.email}`.toLowerCase().includes(searchLower)
    ) {
      continue;
    }
    const pub = publicUser(r);
    const access = getReaderAccessSummary(store, pub, nowIso);
    if (
      options.segment &&
      options.segment !== "all" &&
      !userMatchesAudienceSegment(access, options.segment)
    ) {
      continue;
    }
    const prefs = getNotificationPreferences(store, r.id);
    const pushDevicesCount = getUserPushSubscriptionsCount(store, r.id);
    rows.push({
      id: r.id,
      name: r.name,
      email: r.email,
      accessStatus: access.status,
      notificationsEnabled: prefs.notificationsEnabled,
      announcementsEnabled: prefs.announcementsEnabled,
      pushDevicesCount,
      createdAt: r.createdAt,
    });
    if (rows.length >= limit) break;
  }

  return rows;
}

function evaluateCampaignRecipients(
  store: Store,
  input: {
    targetType: "individual" | "all" | "segment";
    targetSegment?: ReaderAudienceSegment;
    targetUserId?: number;
    category: "announcement" | "account" | "system" | "subscription";
  },
) {
  const nowIso = new Date().toISOString();
  let matchedUsers: Array<typeof s.users.$inferSelect>;

  if (input.targetType === "individual") {
    const target = store.db
      .select()
      .from(s.users)
      .where(eq(s.users.id, input.targetUserId!))
      .get();
    if (!target || target.role !== "reader" || target.status !== "active") {
      throw new HttpError(
        404,
        "Active reader account not found for targeted notification.",
      );
    }
    matchedUsers = [target];
  } else {
    const allReaders = store.db
      .select()
      .from(s.users)
      .where(and(eq(s.users.role, "reader"), eq(s.users.status, "active")))
      .orderBy(s.users.id)
      .all();

    if (input.targetType === "all") {
      matchedUsers = allReaders;
    } else {
      matchedUsers = allReaders.filter((u) => {
        const access = getReaderAccessSummary(store, publicUser(u), nowIso);
        return userMatchesAudienceSegment(access, input.targetSegment!);
      });
    }
  }

  const requireAnnouncementConsent =
    input.targetType !== "individual" || input.category === "announcement";

  const eligible: Array<{
    userId: number;
    name: string;
    accessStatus: string;
    hasPushDevice: boolean;
  }> = [];
  let skippedOptOutCount = 0;

  for (const u of matchedUsers) {
    const prefs = getNotificationPreferences(store, u.id);
    if (
      requireAnnouncementConsent &&
      (!prefs.notificationsEnabled || !prefs.announcementsEnabled)
    ) {
      skippedOptOutCount++;
      continue;
    }
    const access = getReaderAccessSummary(store, publicUser(u), nowIso);
    eligible.push({
      userId: u.id,
      name: u.name,
      accessStatus: access.status,
      hasPushDevice: getUserPushSubscriptionsCount(store, u.id) > 0,
    });
  }

  return {
    totalMatchedReaders: matchedUsers.length,
    eligible,
    skippedOptOutCount,
    subscribedPushReadersCount: eligible.filter((e) => e.hasPushDevice).length,
  };
}

export function previewNotificationCampaign(
  store: Store,
  input: {
    targetType: "individual" | "all" | "segment";
    targetSegment?: ReaderAudienceSegment;
    targetUserId?: number;
    category: "announcement" | "account" | "system" | "subscription";
    title: string;
    body: string;
    actionUrl: string;
    scheduledFor?: string | null;
  },
) {
  const sanitized = validateAdminNotificationPayload(input);
  const audience = evaluateCampaignRecipients(store, {
    targetType: input.targetType,
    targetSegment: input.targetSegment,
    targetUserId: input.targetUserId,
    category: sanitized.category,
  });

  return {
    totalMatchedReaders: audience.totalMatchedReaders,
    eligibleCount: audience.eligible.length,
    skippedOptOutCount: audience.skippedOptOutCount,
    subscribedPushReadersCount: audience.subscribedPushReadersCount,
    sampleRecipients: audience.eligible.slice(0, 5).map((r) => ({
      id: r.userId,
      name: r.name,
      accessStatus: r.accessStatus,
    })),
    sanitized,
  };
}

export function processNotificationCampaignQueue(
  store: Store,
  options: {
    campaignId?: number;
    batchSize?: number;
    now?: Date;
  } = {},
): {
  processedCampaigns: number;
  enqueuedEvents: number;
  skippedOptOuts: number;
} {
  const now = options.now || new Date();
  const nowIso = now.toISOString();
  const batchSize = Math.min(Math.max(1, options.batchSize ?? 100), 250);

  // Promote any due scheduled campaigns into the active queue
  store.db
    .update(s.adminNotificationCampaigns)
    .set({ status: "queued", updatedAt: nowIso })
    .where(
      and(
        eq(s.adminNotificationCampaigns.status, "scheduled"),
        lte(s.adminNotificationCampaigns.scheduledFor, nowIso),
      ),
    )
    .run();

  const dueCampaigns = store.db
    .select()
    .from(s.adminNotificationCampaigns)
    .where(
      options.campaignId
        ? and(
            eq(s.adminNotificationCampaigns.id, options.campaignId),
            inArray(s.adminNotificationCampaigns.status, [
              "queued",
              "enqueueing",
            ]),
          )
        : inArray(s.adminNotificationCampaigns.status, [
            "queued",
            "enqueueing",
          ]),
    )
    .orderBy(s.adminNotificationCampaigns.id)
    .all();

  let enqueuedEvents = 0;
  let skippedOptOuts = 0;

  for (const campaign of dueCampaigns) {
    for (;;) {
      const pendingBatch = store.db
        .select()
        .from(s.adminNotificationCampaignRecipients)
        .where(
          and(
            eq(s.adminNotificationCampaignRecipients.campaignId, campaign.id),
            eq(s.adminNotificationCampaignRecipients.status, "pending"),
          ),
        )
        .orderBy(s.adminNotificationCampaignRecipients.id)
        .limit(batchSize)
        .all();

      if (pendingBatch.length === 0) {
        break;
      }

      store.sqlite.transaction(() => {
        store.db
          .update(s.adminNotificationCampaigns)
          .set({
            status: "enqueueing",
            startedAt: campaign.startedAt || nowIso,
            updatedAt: nowIso,
          })
          .where(eq(s.adminNotificationCampaigns.id, campaign.id))
          .run();

        for (const rec of pendingBatch) {
          const recipientUser = store.db
            .select()
            .from(s.users)
            .where(eq(s.users.id, rec.userId))
            .get();
          if (
            !recipientUser ||
            recipientUser.role !== "reader" ||
            recipientUser.status !== "active"
          ) {
            store.db
              .update(s.adminNotificationCampaignRecipients)
              .set({
                status: "skipped",
                skipReason: "Reader account unavailable",
                updatedAt: nowIso,
              })
              .where(eq(s.adminNotificationCampaignRecipients.id, rec.id))
              .run();
            skippedOptOuts++;
            continue;
          }

          const created = createNotificationEvent(store, {
            userId: rec.userId,
            category: campaign.category as NotificationCategory,
            title: campaign.title,
            body: campaign.body,
            actionUrl: campaign.actionUrl,
            dedupeKey: `admin_campaign_${campaign.id}_user_${rec.userId}`,
            respectPreferences: true,
            campaignId: campaign.id,
            createdByAdminId: campaign.createdByAdminId,
          });

          if (!created) {
            store.db
              .update(s.adminNotificationCampaignRecipients)
              .set({
                status: "skipped",
                skipReason: "User opted out of optional announcements",
                updatedAt: nowIso,
              })
              .where(eq(s.adminNotificationCampaignRecipients.id, rec.id))
              .run();
            skippedOptOuts++;
            continue;
          }

          store.db
            .update(s.adminNotificationCampaignRecipients)
            .set({
              status: "enqueued",
              notificationEventId: created.id,
              updatedAt: nowIso,
            })
            .where(eq(s.adminNotificationCampaignRecipients.id, rec.id))
            .run();
          enqueuedEvents++;
        }
      })();

      if (options.campaignId && pendingBatch.length < batchSize) {
        break;
      }
    }

    // Recompute exact counts on the durable campaign record from SQLite
    const pendingCount = Number(
      (
        store.db
          .select({ count: sql<number>`count(*)` })
          .from(s.adminNotificationCampaignRecipients)
          .where(
            and(
              eq(s.adminNotificationCampaignRecipients.campaignId, campaign.id),
              eq(s.adminNotificationCampaignRecipients.status, "pending"),
            ),
          )
          .get()?.count || 0
      ),
    );
    const enqueuedCount = Number(
      (
        store.db
          .select({ count: sql<number>`count(*)` })
          .from(s.notificationEvents)
          .where(eq(s.notificationEvents.campaignId, campaign.id))
          .get()?.count || 0
      ),
    );

    const isDone = pendingCount === 0;
    store.db
      .update(s.adminNotificationCampaigns)
      .set({
        status: isDone ? "completed" : "enqueueing",
        queuedCount: enqueuedCount,
        inAppCreatedCount: enqueuedCount,
        completedAt: isDone ? nowIso : null,
        updatedAt: nowIso,
      })
      .where(eq(s.adminNotificationCampaigns.id, campaign.id))
      .run();
  }

  return {
    processedCampaigns: dueCampaigns.length,
    enqueuedEvents,
    skippedOptOuts,
  };
}

export function createAndQueueNotificationCampaign(
  store: Store,
  actor: AdminActor,
  input: {
    targetType: "individual" | "all" | "segment";
    targetSegment?: ReaderAudienceSegment;
    targetUserId?: number;
    category: "announcement" | "account" | "system" | "subscription";
    title: string;
    body: string;
    actionUrl: string;
    scheduledFor?: string | null;
    confirmed?: boolean;
    idempotencyKey?: string;
  },
) {
  if (input.targetType !== "individual" && !input.confirmed) {
    throw new HttpError(
      400,
      "Explicit administrator confirmation is required before queuing a multi-reader broadcast.",
    );
  }

  const sanitized = validateAdminNotificationPayload(input);
  const now = new Date();
  const nowIso = now.toISOString();
  const key =
    input.idempotencyKey?.trim() ||
    `camp_${actor.id ?? 0}_${now.getTime()}_${sanitized.title.slice(0, 24).replace(/\W+/g, "_")}`;

  const existingCampaign = store.db
    .select()
    .from(s.adminNotificationCampaigns)
    .where(eq(s.adminNotificationCampaigns.idempotencyKey, key))
    .get();
  if (existingCampaign) {
    return {
      deduplicated: true,
      campaign: formatCampaignSummary(store, existingCampaign),
    };
  }

  const audience = evaluateCampaignRecipients(store, {
    targetType: input.targetType,
    targetSegment: input.targetSegment,
    targetUserId: input.targetUserId,
    category: sanitized.category,
  });

  const isFutureSchedule = Boolean(
    sanitized.scheduledFor && sanitized.scheduledFor > nowIso,
  );
  const initialStatus = isFutureSchedule ? "scheduled" : "queued";

  const createdCampaign = store.sqlite.transaction(() => {
    const campaignRow = store.db
      .insert(s.adminNotificationCampaigns)
      .values({
        createdByAdminId: actor.id,
        actorName: actor.name,
        actorEmail: actor.email,
        targetType: input.targetType,
        targetSegment:
          input.targetType === "segment" ? input.targetSegment || "" : "",
        targetUserId:
          input.targetType === "individual" ? input.targetUserId ?? null : null,
        category: sanitized.category,
        title: sanitized.title,
        body: sanitized.body,
        actionUrl: sanitized.actionUrl,
        idempotencyKey: key,
        status: initialStatus,
        scheduledFor: sanitized.scheduledFor,
        eligibleCount: audience.eligible.length,
        skippedOptOutCount: audience.skippedOptOutCount,
        queuedCount: 0,
        inAppCreatedCount: 0,
        confirmedByAdmin: Boolean(input.confirmed),
        startedAt: null,
        completedAt: null,
        createdAt: nowIso,
        updatedAt: nowIso,
      })
      .returning()
      .get();

    // Insert recipient queue rows in bounded SQLite chunks of 100
    for (let i = 0; i < audience.eligible.length; i += 100) {
      const chunk = audience.eligible.slice(i, i + 100);
      for (const rec of chunk) {
        store.db
          .insert(s.adminNotificationCampaignRecipients)
          .values({
            campaignId: campaignRow.id,
            userId: rec.userId,
            status: "pending",
            createdAt: nowIso,
            updatedAt: nowIso,
          })
          .onConflictDoNothing()
          .run();
      }
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
      `${isFutureSchedule ? "Scheduled" : "Queued"} ${sanitized.category} notification campaign #${campaignRow.id} to ${audienceDesc} ("${sanitized.title}", eligible: ${audience.eligible.length}, opted-out skipped: ${audience.skippedOptOutCount})`,
      "notifications_campaign",
      campaignRow.id,
      nowIso,
    );

    return campaignRow;
  })();

  // For immediate sends, enqueue bounded DB batches right away so in-app alerts exist
  // without performing blocking external Web Push HTTP calls inside the request handler.
  if (!isFutureSchedule) {
    processNotificationCampaignQueue(store, {
      campaignId: createdCampaign.id,
      batchSize: 100,
      now,
    });
  }

  const latest = store.db
    .select()
    .from(s.adminNotificationCampaigns)
    .where(eq(s.adminNotificationCampaigns.id, createdCampaign.id))
    .get()!;

  return {
    deduplicated: false,
    campaign: formatCampaignSummary(store, latest),
  };
}

export function formatCampaignSummary(
  store: Store,
  campaign: typeof s.adminNotificationCampaigns.$inferSelect,
) {
  const events = store.db
    .select({
      id: s.notificationEvents.id,
      pushStatus: s.notificationEvents.pushStatus,
      deliveryAttempts: s.notificationEvents.deliveryAttempts,
      readAt: s.notificationEvents.readAt,
    })
    .from(s.notificationEvents)
    .where(eq(s.notificationEvents.campaignId, campaign.id))
    .all();

  const inAppCreatedCount = events.length;
  const pushAttempts = events.reduce(
    (sum, ev) => sum + Number(ev.deliveryAttempts || 0),
    0,
  );
  const pushProviderAccepted = events.filter(
    (ev) => ev.pushStatus === "sent",
  ).length;
  const pushFailedOrSkipped = events.filter(
    (ev) => ev.pushStatus === "failed" || ev.pushStatus === "skipped",
  ).length;
  const readCount = events.filter((ev) => Boolean(ev.readAt)).length;

  return {
    ...campaign,
    queuedCount: campaign.queuedCount || inAppCreatedCount,
    inAppCreatedCount,
    pushAttempts,
    pushProviderAccepted,
    pushFailedOrSkipped,
    readCount,
  };
}

export function getAdminNotificationCampaigns(
  store: Store,
  options: { page?: number; limit?: number } = {},
) {
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(Math.max(1, options.limit || 20), 50);
  const all = store.db
    .select()
    .from(s.adminNotificationCampaigns)
    .orderBy(desc(s.adminNotificationCampaigns.createdAt))
    .all();

  const total = all.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const slice = all.slice((page - 1) * limit, page * limit);

  return {
    items: slice.map((c) => formatCampaignSummary(store, c)),
    total,
    page,
    totalPages,
  };
}

export function cancelAdminNotificationCampaign(
  store: Store,
  actor: AdminActor,
  campaignId: number,
) {
  const existing = store.db
    .select()
    .from(s.adminNotificationCampaigns)
    .where(eq(s.adminNotificationCampaigns.id, campaignId))
    .get();
  if (!existing) {
    throw new HttpError(404, "Notification campaign not found.");
  }
  if (existing.status !== "scheduled") {
    throw new HttpError(
      400,
      "Only scheduled campaigns that have not started can be cancelled.",
    );
  }
  const nowIso = new Date().toISOString();
  const updated = store.db
    .update(s.adminNotificationCampaigns)
    .set({ status: "cancelled", updatedAt: nowIso })
    .where(eq(s.adminNotificationCampaigns.id, campaignId))
    .returning()
    .get();

  logAdminAudit(
    store,
    actor,
    `Cancelled scheduled notification campaign #${campaignId} ("${existing.title}")`,
    "notifications_campaign",
    campaignId,
    nowIso,
  );

  return formatCampaignSummary(store, updated);
}

/**
 * Runs a full background notification worker pass across all active users:
 * 1. Promotes due scheduled admin campaigns and enqueues recipient batches cleanly.
 * 2. Evaluates scheduled reminders (Daily Devotional, Unread Devotional, Subscription Expiry)
 *    respecting each user's timezone, reminderTime, quiet hours, completion state, and access.
 * 3. Dispatches pending Web Push notifications with concurrency locks and retry limits.
 */
export async function runNotificationWorkerCycle(
  store: Store,
  pushProvider: WebPushProvider,
  now: Date = new Date(),
) {
  const campaignEnqueue = processNotificationCampaignQueue(store, {
    batchSize: 100,
    now,
  });

  const activeUsers = store.db
    .select({ id: s.users.id })
    .from(s.users)
    .where(eq(s.users.status, "active"))
    .all();

  const generatedKeys: string[] = [];
  for (const u of activeUsers) {
    const res = evaluateUserScheduledReminders(store, u.id, now);
    generatedKeys.push(...res.generated);
  }

  const delivery = await dispatchPendingPushNotifications(store, pushProvider, {
    now,
    batchSize: 100,
  });

  return {
    evaluatedUsers: activeUsers.length,
    generatedCount: generatedKeys.length,
    createdEvents: generatedKeys.length + campaignEnqueue.enqueuedEvents,
    campaignEnqueuedEvents: campaignEnqueue.enqueuedEvents,
    generatedKeys,
    ...delivery,
  };
}

/**
 * Sends a user-initiated test notification to verify their in-app feed and registered push devices.
 */
export async function sendUserTestNotification(
  store: Store,
  userId: number,
  pushProvider: WebPushProvider,
) {
  const prefs = getNotificationPreferences(store, userId);
  if (!prefs.notificationsEnabled) {
    throw new HttpError(
      400,
      "Notifications are currently disabled in your preferences. Enable notifications first to send a test alert.",
    );
  }

  const now = new Date();
  const dedupeKey = `test_notif_${userId}_${now.getTime()}`;
  const event = createNotificationEvent(store, {
    userId,
    category: "system",
    title: "Test Notification · The Balanced Life Devotional",
    body: "Your devotional reminder channel is connected and working properly.",
    actionUrl: "/account",
    dedupeKey,
    respectPreferences: false,
  });

  if (!event) {
    throw new HttpError(500, "Could not create test notification record.");
  }

  const delivery = await dispatchPendingPushNotifications(store, pushProvider, {
    now,
  });

  const updatedEvent = store.db
    .select()
    .from(s.notificationEvents)
    .where(eq(s.notificationEvents.id, event.id))
    .get();
  const activeDevicesCount = getUserPushSubscriptionsCount(store, userId);
  const sentForTest = store.db
    .select({ count: sql<number>`count(*)` })
    .from(s.notificationDeliveries)
    .where(
      and(
        eq(s.notificationDeliveries.notificationEventId, event.id),
        eq(s.notificationDeliveries.status, "sent"),
      ),
    )
    .get();
  const deliveredCount = Number(sentForTest?.count || 0);

  return {
    ok: true,
    eventId: event.id,
    event: updatedEvent || event,
    pushConfigured: pushProvider.configured,
    webPushConfigured: pushProvider.configured,
    activeDevicesCount,
    deliveredCount,
    delivery,
    message:
      deliveredCount > 0
        ? `Test notification sent to ${deliveredCount} active device${deliveredCount === 1 ? "" : "s"}.`
        : "Test notification recorded in your account alerts.",
  };
}

export function getUnreadNotificationCount(store: Store, userId: number): number {
  const row = store.db
    .select({ count: sql<number>`count(*)` })
    .from(s.notificationEvents)
    .where(
      and(
        eq(s.notificationEvents.userId, userId),
        sql`${s.notificationEvents.readAt} IS NULL`,
      ),
    )
    .get();
  return Number(row?.count || 0);
}

export function getUserNotifications(
  store: Store,
  userId: number,
  limitOrOptions: number | { limit?: number; filter?: "all" | "unread" } = 30,
) {
  const limit =
    typeof limitOrOptions === "number"
      ? limitOrOptions
      : limitOrOptions.limit || 50;
  const filter =
    typeof limitOrOptions === "object" ? limitOrOptions.filter || "all" : "all";

  const condition =
    filter === "unread"
      ? and(
          eq(s.notificationEvents.userId, userId),
          sql`${s.notificationEvents.readAt} IS NULL`,
        )
      : eq(s.notificationEvents.userId, userId);

  return store.db
    .select()
    .from(s.notificationEvents)
    .where(condition)
    .orderBy(desc(s.notificationEvents.createdAt), desc(s.notificationEvents.id))
    .limit(limit)
    .all()
    .map((ev) => ({
      ...ev,
      deliveryStatus: ev.pushStatus,
    }));
}

export function markNotificationRead(
  store: Store,
  userId: number,
  notificationId: number,
) {
  const now = new Date().toISOString();
  store.db
    .update(s.notificationEvents)
    .set({ readAt: now })
    .where(
      and(
        eq(s.notificationEvents.id, notificationId),
        eq(s.notificationEvents.userId, userId),
      ),
    )
    .run();
  return { ok: true, unreadCount: getUnreadNotificationCount(store, userId) };
}

export function markAllNotificationsRead(store: Store, userId: number) {
  const now = new Date().toISOString();
  const res = store.db
    .update(s.notificationEvents)
    .set({ readAt: now })
    .where(
      and(
        eq(s.notificationEvents.userId, userId),
        sql`${s.notificationEvents.readAt} IS NULL`,
      ),
    )
    .run();
  return {
    ok: true,
    updated: res.changes,
    unreadCount: 0,
  };
}

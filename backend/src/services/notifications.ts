import { and, desc, eq } from "drizzle-orm";
import type { Store } from "../db.js";
import * as s from "../schema.js";
import { getSubscriptionDetails } from "./subscriptions.js";
import { getAppSettings } from "./settings.js";

export type NotificationPrefs = {
  userId: number;
  dailyReminderEnabled: boolean;
  reminderTime: string;
  timezone: string;
  subscriptionAlertsEnabled: boolean;
  purchaseAlertsEnabled: boolean;
  lastDailyReminderDate: string | null;
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
  const created = store.db
    .insert(s.notificationPreferences)
    .values({
      userId,
      dailyReminderEnabled: false,
      reminderTime: "06:30",
      timezone: "Africa/Lagos",
      subscriptionAlertsEnabled: true,
      purchaseAlertsEnabled: true,
      updatedAt: now,
    })
    .returning()
    .get();

  return created;
}

export function updateNotificationPreferences(
  store: Store,
  userId: number,
  updates: Partial<{
    dailyReminderEnabled: boolean;
    reminderTime: string;
    timezone: string;
    subscriptionAlertsEnabled: boolean;
    purchaseAlertsEnabled: boolean;
  }>,
): NotificationPrefs {
  const current = getNotificationPreferences(store, userId);
  const now = new Date().toISOString();
  return store.db
    .update(s.notificationPreferences)
    .set({
      dailyReminderEnabled:
        updates.dailyReminderEnabled ?? current.dailyReminderEnabled,
      reminderTime: updates.reminderTime ?? current.reminderTime,
      timezone: updates.timezone ?? current.timezone,
      subscriptionAlertsEnabled:
        updates.subscriptionAlertsEnabled ?? current.subscriptionAlertsEnabled,
      purchaseAlertsEnabled:
        updates.purchaseAlertsEnabled ?? current.purchaseAlertsEnabled,
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
  },
) {
  const now = new Date().toISOString();
  return store.db
    .insert(s.pushSubscriptions)
    .values({
      userId,
      endpoint: input.endpoint,
      p256dhKey: input.p256dhKey,
      authKey: input.authKey,
      userAgent: input.userAgent || "",
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

export function getUserPushSubscriptionsCount(
  store: Store,
  userId: number,
): number {
  return store.db
    .select()
    .from(s.pushSubscriptions)
    .where(eq(s.pushSubscriptions.userId, userId))
    .all().length;
}

export function createNotificationEvent(
  store: Store,
  input: {
    userId: number;
    category: "daily_reminder" | "subscription" | "digital_purchase" | "system";
    title: string;
    body: string;
    actionUrl?: string;
    dedupeKey: string;
  },
) {
  const now = new Date().toISOString();
  store.db
    .insert(s.notificationEvents)
    .values({
      userId: input.userId,
      category: input.category,
      title: input.title,
      body: input.body,
      actionUrl: input.actionUrl || "/dashboard",
      dedupeKey: input.dedupeKey,
      createdAt: now,
    })
    .onConflictDoNothing({ target: s.notificationEvents.dedupeKey })
    .run();
}

export function evaluateUserReminders(
  store: Store,
  userId: number,
  currentDate: string,
) {
  const prefs = getNotificationPreferences(store, userId);
  const settings = getAppSettings(store);
  const now = new Date().toISOString();

  // 1. Subscription renewal / expiration reminder (deduplicated per expiry date)
  if (prefs.subscriptionAlertsEnabled) {
    const sub = getSubscriptionDetails(
      store,
      userId,
      settings.renewalReminderDays,
    );
    if (sub?.renewalReminder) {
      const expiryKey = `${sub.id}_${sub.expiresAt.slice(0, 10)}_${sub.renewalReminder.expired ? "expired" : "due"}`;
      if (prefs.lastExpiryReminderFor !== expiryKey) {
        createNotificationEvent(store, {
          userId,
          category: "subscription",
          title: sub.renewalReminder.expired
            ? "Membership Expired"
            : "Membership Renewal Reminder",
          body: sub.renewalReminder.message,
          actionUrl: "/subscription",
          dedupeKey: `sub_reminder_${userId}_${expiryKey}`,
        });
        store.db
          .update(s.notificationPreferences)
          .set({ lastExpiryReminderFor: expiryKey, updatedAt: now })
          .where(eq(s.notificationPreferences.userId, userId))
          .run();
      }
    }
  }

  // 2. Battery-conscious daily devotional reminder (at most once per calendar date)
  if (
    prefs.dailyReminderEnabled &&
    prefs.lastDailyReminderDate !== currentDate
  ) {
    const targetDate =
      currentDate >= "2027-01-01" && currentDate <= "2027-12-31"
        ? currentDate
        : "2027-01-01";
    const entry = store.db
      .select()
      .from(s.devotionals)
      .where(
        and(
          eq(s.devotionals.date, targetDate),
          eq(s.devotionals.published, true),
        ),
      )
      .get();

    if (entry) {
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

      if (!completed) {
        createNotificationEvent(store, {
          userId,
          category: "daily_reminder",
          title: `Daily Devotional: ${entry.title}`,
          body: "Take a few quiet minutes today to Connect with Jesus, Learn, Reflect, Apply, and Track Your Growth.",
          actionUrl: `/read/${entry.id}`,
          dedupeKey: `daily_reminder_${userId}_${currentDate}`,
        });
      }
    }

    store.db
      .update(s.notificationPreferences)
      .set({ lastDailyReminderDate: currentDate, updatedAt: now })
      .where(eq(s.notificationPreferences.userId, userId))
      .run();
  }
}

export function getUserNotifications(
  store: Store,
  userId: number,
  limit = 30,
) {
  return store.db
    .select()
    .from(s.notificationEvents)
    .where(eq(s.notificationEvents.userId, userId))
    .orderBy(desc(s.notificationEvents.createdAt))
    .limit(limit)
    .all();
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
  return { ok: true };
}

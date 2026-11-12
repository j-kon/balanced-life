import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Bell,
  CheckCircle2,
  Clock,
  Palette,
  Send,
  Shield,
  Smartphone,
  Sparkles,
  Trash2,
  UserCheck,
} from "lucide-react";
import { useApp } from "../../context/AppContext";
import { useData } from "../../hooks/useData";
import { ErrorBox, Loading, ThemeSelector } from "../../components/Common";
import { api } from "../../api";
import type {
  NotificationEventRecord,
  NotificationPreferences,
  PushDeviceRecord,
} from "../../types";

type NotificationsData = {
  preferences: NotificationPreferences;
  supportedTimezones: string[];
  webPush: {
    configured: boolean;
    publicKey: string | null;
  };
  pushSubscriptionsCount: number;
  devices: PushDeviceRecord[];
  events: NotificationEventRecord[];
};

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function arrayBufferToBase64Url(buffer: ArrayBuffer | null): string {
  if (!buffer) return "";
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window
    .btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function detectDeviceLabel(): string {
  if (typeof navigator === "undefined") return "Web Browser";
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua)) return "iPhone / iPad (iOS)";
  if (/Android/i.test(ua)) return "Android Device";
  if (/Macintosh/i.test(ua)) return "Mac Browser";
  if (/Windows/i.test(ua)) return "Windows Browser";
  if (/Linux/i.test(ua)) return "Linux Browser";
  return "Web Browser";
}

function isIosRequiresStandalone(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }
  const ua = navigator.userAgent || "";
  const isIos = /iPad|iPhone|iPod/.test(ua);
  if (!isIos) return false;
  const isStandalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return !isStandalone;
}

export function AccountPage() {
  const { user, config, refresh, toast } = useApp();
  const navigate = useNavigate();
  const {
    data: notifData,
    error: notifError,
    reload: reloadNotifs,
  } = useData<NotificationsData>("/me/notifications");
  const [profileError, setProfileError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [selectedTimezone, setSelectedTimezone] = useState<string>("");
  const [currentEndpoint, setCurrentEndpoint] = useState<string | null>(null);
  const [browserPermission, setBrowserPermission] = useState<string>(() =>
    typeof window !== "undefined" && "Notification" in window
      ? window.Notification.permission
      : "unsupported",
  );

  useEffect(() => {
    if (notifData?.preferences?.timezone && !selectedTimezone) {
      setSelectedTimezone(notifData.preferences.timezone);
    }
  }, [notifData?.preferences?.timezone, selectedTimezone]);

  useEffect(() => {
    let active = true;
    async function inspectCurrentPushSubscription() {
      if (
        typeof window === "undefined" ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window)
      ) {
        return;
      }
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = await reg?.pushManager?.getSubscription();
        if (active && sub?.endpoint) {
          setCurrentEndpoint(sub.endpoint);
        }
      } catch {
        // Ignore in environments without active service worker
      }
    }
    inspectCurrentPushSubscription();
    return () => {
      active = false;
    };
  }, [notifData?.pushSubscriptionsCount]);

  async function saveProfile(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setProfileError("");
    const f = new FormData(e.currentTarget);
    try {
      await api(
        "/me/profile",
        {
          name: f.get("name"),
          email: f.get("email"),
        },
        "PATCH",
      );
      await refresh();
      toast("Your profile details have been updated.");
    } catch (err) {
      setProfileError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function savePassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    setPasswordError("");
    const f = new FormData(form);
    try {
      await api("/me/password", {
        currentPassword: f.get("currentPassword"),
        newPassword: f.get("newPassword"),
      });
      form.reset();
      toast("Your password has been changed.");
    } catch (err) {
      setPasswordError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveNotifPreferences(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      await api(
        "/me/notifications/preferences",
        {
          notificationsEnabled: f.get("notificationsEnabled") === "on",
          dailyReminderEnabled: f.get("dailyReminderEnabled") === "on",
          unreadReminderEnabled: f.get("unreadReminderEnabled") === "on",
          reminderTime: String(f.get("reminderTime") || "06:30"),
          timezone: String(
            selectedTimezone || f.get("timezone") || "Africa/Lagos",
          ),
          quietHoursStart: String(f.get("quietHoursStart") || "22:00"),
          quietHoursEnd: String(f.get("quietHoursEnd") || "05:30"),
          subscriptionAlertsEnabled:
            f.get("subscriptionAlertsEnabled") === "on",
          purchaseAlertsEnabled: f.get("purchaseAlertsEnabled") === "on",
          announcementsEnabled: f.get("announcementsEnabled") === "on",
          emailDailyReminderEnabled:
            f.get("emailDailyReminderEnabled") === "on",
          emailAnnouncementsEnabled:
            f.get("emailAnnouncementsEnabled") === "on",
          emailCommunityUpdatesEnabled:
            f.get("emailCommunityUpdatesEnabled") === "on",
        },
        "PATCH",
      );
      reloadNotifs();
      await refresh();
      toast("Reminder & notification preferences saved.");
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function subscribeCurrentDevice() {
    if (isIosRequiresStandalone()) {
      toast(
        "On iPhone/iPad, tap Share → Add to Home Screen first, then enable push notifications from the installed app.",
      );
      return;
    }
    if (typeof window === "undefined" || !("Notification" in window)) {
      toast("Browser notifications are not supported on this device.");
      return;
    }

    setPushBusy(true);
    try {
      const permission = await window.Notification.requestPermission();
      setBrowserPermission(permission);
      if (permission !== "granted") {
        toast(`Notification permission status: ${permission}.`);
        return;
      }

      const vapidPublicKey = notifData?.webPush?.publicKey;
      let endpoint = "";
      let p256dh = "";
      let auth = "";

      if (
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        vapidPublicKey
      ) {
        const registration = await navigator.serviceWorker.ready;
        let sub = await registration.pushManager.getSubscription();
        if (!sub) {
          const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
          sub = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey:
              applicationServerKey.buffer as ArrayBuffer,
          });
        }
        endpoint = sub.endpoint;
        p256dh = arrayBufferToBase64Url(sub.getKey("p256dh"));
        auth = arrayBufferToBase64Url(sub.getKey("auth"));
      } else {
        throw new Error(
          !vapidPublicKey
            ? "Browser permission granted. Server VAPID keys are not configured yet for background push subscription."
            : "PushManager or Service Worker is not available in this browser.",
        );
      }

      await api("/me/notifications/push-subscribe", {
        endpoint,
        p256dh,
        auth,
        userAgent: navigator.userAgent,
        deviceLabel: detectDeviceLabel(),
      });
      setCurrentEndpoint(endpoint);
      reloadNotifs();
      toast("This device is now subscribed to Web Push notifications.");
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setPushBusy(false);
    }
  }

  async function unsubscribeCurrentDevice() {
    setPushBusy(true);
    try {
      let endpointToRemove = currentEndpoint;
      if ("serviceWorker" in navigator && "PushManager" in window) {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = await reg?.pushManager?.getSubscription();
        if (sub) {
          endpointToRemove = sub.endpoint;
          await sub.unsubscribe();
        }
      }
      if (endpointToRemove) {
        await api("/me/notifications/push-unsubscribe", {
          endpoint: endpointToRemove,
        });
      }
      setCurrentEndpoint(null);
      reloadNotifs();
      toast("This device has been unsubscribed from push notifications.");
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setPushBusy(false);
    }
  }

  async function removeRegisteredDevice(device: PushDeviceRecord) {
    setPushBusy(true);
    try {
      if (currentEndpoint && device.endpoint === currentEndpoint) {
        await unsubscribeCurrentDevice();
        return;
      }
      await api(
        `/me/notifications/devices/${device.id}`,
        undefined,
        "DELETE",
      );
      reloadNotifs();
      toast(`Removed ${device.deviceLabel || "device"} from push notifications.`);
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setPushBusy(false);
    }
  }

  async function sendTestNotification() {
    setPushBusy(true);
    try {
      const res = await api<{
        eventId: number;
        webPushConfigured: boolean;
        activeDevicesCount: number;
        deliveredCount: number;
        message: string;
      }>("/me/notifications/test", {});
      reloadNotifs();
      toast(res.message);
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setPushBusy(false);
    }
  }

  function detectBrowserTimezone() {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz) {
        setSelectedTimezone(tz);
        toast(`Detected timezone: ${tz}`);
      }
    } catch {
      toast("Unable to detect timezone automatically.");
    }
  }

  const activeDevices =
    notifData?.devices?.filter((d) => d.status === "active") || [];
  const iosRequiresInstall = isIosRequiresStandalone();
  const timezoneOptions = Array.from(
    new Set([
      ...(notifData?.supportedTimezones || ["Africa/Lagos", "UTC"]),
      selectedTimezone || notifData?.preferences?.timezone || "Africa/Lagos",
    ]),
  );

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Profile, Security &amp; Mobile Reminders</span>
          <h1>Account settings</h1>
          <p>
            Manage your appearance theme, welcome guide, personal information,
            password security, and notification consent preferences.
          </p>
        </div>
        <UserCheck size={40} strokeWidth={1} />
      </div>

      <section
        className="panel stack"
        aria-labelledby="appearance-heading"
        style={{ marginBottom: "22px" }}
      >
        <div className="section-title" style={{ margin: 0 }}>
          <div>
            <h2 id="appearance-heading">Appearance &amp; Welcome Guide</h2>
            <p className="muted" style={{ margin: 0, padding: 0 }}>
              Choose Light, Dark, or follow your device&apos;s System appearance.
              Your choice saves locally on this device before and after login.
            </p>
          </div>
          <Palette size={22} />
        </div>
        <ThemeSelector variant="full" />
        <div className="actions">
          <button
            type="button"
            className="button outline small"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api("/me/onboarding", { completed: false });
                await refresh();
                navigate("/dashboard");
              } catch (err) {
                toast((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Sparkles size={15} /> Reopen welcome onboarding guide
          </button>
          <Link className="text-link" to="/install">
            <Smartphone size={15} /> PWA installation instructions
          </Link>
        </div>
      </section>

      <div className="admin-plans">
        <form className="panel stack" onSubmit={saveProfile}>
          <h2>Personal profile</h2>
          <p>
            Update the name and email address associated with your devotional
            account.
          </p>
          <label>
            Full name
            <input
              name="name"
              defaultValue={user?.name || ""}
              required
              minLength={2}
              maxLength={100}
            />
          </label>
          <label>
            Email address
            <input
              name="email"
              type="email"
              defaultValue={user?.email || ""}
              required
            />
          </label>
          <p className="muted">
            Account role: <strong>Reader</strong>
            {user?.ageGroup ? ` · Group: ${user.ageGroup}` : ""}
          </p>
          <ErrorBox message={profileError} />
          <button className="button" disabled={busy}>
            Save profile
          </button>
        </form>

        <form className="panel stack" onSubmit={savePassword}>
          <h2>Change password</h2>
          <p>
            Choose a strong password of at least 10 characters to protect your
            account and private journal.
          </p>
          <label>
            Current password
            <input
              name="currentPassword"
              type="password"
              required
              autoComplete="current-password"
            />
          </label>
          <label>
            New password
            <input
              name="newPassword"
              type="password"
              required
              minLength={10}
              maxLength={128}
              autoComplete="new-password"
            />
          </label>
          <ErrorBox message={passwordError} />
          <button className="button outline" disabled={busy}>
            Update password
          </button>
        </form>
      </div>

      <ErrorBox message={notifError} />
      {!notifData && !notifError ? (
        <Loading />
      ) : (
        notifData && (
          <div id="notifications" className="admin-plans" style={{ marginTop: "24px" }}>
            <form className="panel stack" onSubmit={saveNotifPreferences}>
              <div className="section-title" style={{ margin: 0 }}>
                <h2>Mobile &amp; Daily Devotional Reminders</h2>
                <Bell size={22} />
              </div>
              <p>
                Configure battery-conscious daily devotional reminders, timezone
                scheduling, quiet hours, and important account alerts. Reminders
                are evaluated by the background scheduler and deduplicated per
                day.
              </p>

              <label className="check-label">
                <input
                  type="checkbox"
                  name="notificationsEnabled"
                  defaultChecked={
                    notifData.preferences.notificationsEnabled ?? true
                  }
                />
                <span>
                  <strong>Enable notifications &amp; reminders</strong> (master
                  switch for this account)
                </span>
              </label>

              <label className="check-label">
                <input
                  type="checkbox"
                  name="dailyReminderEnabled"
                  defaultChecked={notifData.preferences.dailyReminderEnabled}
                />
                <span>
                  Enable daily devotional reading reminder (once per day)
                </span>
              </label>

              <label className="check-label">
                <input
                  type="checkbox"
                  name="unreadReminderEnabled"
                  defaultChecked={
                    notifData.preferences.unreadReminderEnabled ?? false
                  }
                />
                <span>
                  Send an evening reminder (6:30 PM local time) if today&apos;s
                  devotional is still unread
                </span>
              </label>

              <div className="two-col" style={{ gap: "12px" }}>
                <label>
                  Preferred daily reminder time
                  <input
                    type="time"
                    name="reminderTime"
                    defaultValue={notifData.preferences.reminderTime || "06:30"}
                  />
                </label>

                <label>
                  <span>
                    Your timezone{" "}
                    <button
                      type="button"
                      className="text-link"
                      style={{ marginLeft: "6px", fontSize: "0.85rem" }}
                      onClick={detectBrowserTimezone}
                    >
                      Detect automatically
                    </button>
                  </span>
                  <select
                    name="timezone"
                    value={
                      selectedTimezone ||
                      notifData.preferences.timezone ||
                      "Africa/Lagos"
                    }
                    onChange={(e) => setSelectedTimezone(e.target.value)}
                  >
                    {timezoneOptions.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="two-col" style={{ gap: "12px" }}>
                <label>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                    <Clock size={14} /> Quiet hours start
                  </span>
                  <input
                    type="time"
                    name="quietHoursStart"
                    defaultValue={
                      notifData.preferences.quietHoursStart || "22:00"
                    }
                  />
                </label>
                <label>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                    <Clock size={14} /> Quiet hours end
                  </span>
                  <input
                    type="time"
                    name="quietHoursEnd"
                    defaultValue={
                      notifData.preferences.quietHoursEnd || "05:30"
                    }
                  />
                </label>
              </div>

              <label className="check-label">
                <input
                  type="checkbox"
                  name="subscriptionAlertsEnabled"
                  defaultChecked={
                    notifData.preferences.subscriptionAlertsEnabled
                  }
                />
                <span>
                  Receive online access renewal and expiration reminders
                </span>
              </label>

              <label className="check-label">
                <input
                  type="checkbox"
                  name="purchaseAlertsEnabled"
                  defaultChecked={notifData.preferences.purchaseAlertsEnabled}
                />
                <span>
                  Receive 2027 Digital Edition purchase and verification updates
                </span>
              </label>

              <label className="check-label">
                <input
                  type="checkbox"
                  name="announcementsEnabled"
                  defaultChecked={
                    notifData.preferences.announcementsEnabled ?? false
                  }
                />
                <span>
                  Receive optional push/in-app announcements from Cossy Teens
                  Consult (off by default)
                </span>
              </label>

              <div className="email-prefs-group stack">
                <strong>Optional Email Preferences &amp; Subscriptions</strong>
                <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
                  Choose whether you want optional reminders or updates sent to
                  your email inbox. Essential password-reset codes, security
                  alerts, and confirmed order receipts remain active.
                </p>

                {notifData.preferences.emailSuppressedReason && (
                  <div className="notice">
                    <Shield size={18} />
                    <div>
                      <strong>Email delivery paused for optional mail</strong>
                      <p>
                        Reason: {notifData.preferences.emailSuppressedReason}. Contact{" "}
                        {config.settings.contactEmail} if your mailbox has been
                        restored.
                      </p>
                    </div>
                  </div>
                )}

                <label className="check-label">
                  <input
                    type="checkbox"
                    name="emailDailyReminderEnabled"
                    defaultChecked={
                      notifData.preferences.emailDailyReminderEnabled ?? false
                    }
                  />
                  <span>Daily devotional email reminders (off by default)</span>
                </label>

                <label className="check-label">
                  <input
                    type="checkbox"
                    name="emailAnnouncementsEnabled"
                    defaultChecked={
                      notifData.preferences.emailAnnouncementsEnabled ?? false
                    }
                  />
                  <span>
                    General announcements from Cossy Teens Consult (off by default)
                  </span>
                </label>

                <label className="check-label">
                  <input
                    type="checkbox"
                    name="emailCommunityUpdatesEnabled"
                    defaultChecked={
                      notifData.preferences.emailCommunityUpdatesEnabled ?? false
                    }
                  />
                  <span>Community &amp; youth updates (off by default)</span>
                </label>
              </div>

              <div className="notice">
                <Smartphone size={18} />
                <div style={{ flex: 1 }}>
                  <strong>
                    Push Notification Status:{" "}
                    {iosRequiresInstall
                      ? "Install to iOS Home Screen required"
                      : browserPermission === "granted"
                        ? currentEndpoint
                          ? "Subscribed on this device"
                          : "Permission granted (ready to subscribe)"
                        : browserPermission === "denied"
                          ? "Blocked in browser settings"
                          : browserPermission === "unsupported"
                            ? "Unsupported by this browser"
                            : "Permission not yet requested"}
                  </strong>
                  <p>
                    {iosRequiresInstall
                      ? "On iPhone and iPad (iOS 16.4+), Safari requires adding The Balanced Life to your Home Screen before Web Push permissions can be granted."
                      : browserPermission === "denied"
                        ? "Notifications are currently blocked in your browser site settings. Re-enable notifications for this site in your browser settings to subscribe."
                        : notifData.webPush?.configured
                          ? `Web Push delivery is active (${activeDevices.length} registered device${activeDevices.length === 1 ? "" : "s"}).`
                          : "In-app notifications are active. Configure server VAPID keys in production to enable background Web Push delivery."}
                  </p>
                  <div
                    className="actions"
                    style={{ marginTop: "8px", flexWrap: "wrap", gap: "10px" }}
                  >
                    {!iosRequiresInstall &&
                      browserPermission !== "unsupported" &&
                      browserPermission !== "denied" && (
                        <button
                          type="button"
                          className="button small outline"
                          disabled={pushBusy}
                          onClick={subscribeCurrentDevice}
                        >
                          {currentEndpoint
                            ? "Refresh device push subscription"
                            : "Enable push on this device"}
                        </button>
                      )}
                    {currentEndpoint && (
                      <button
                        type="button"
                        className="text-link"
                        disabled={pushBusy}
                        onClick={unsubscribeCurrentDevice}
                      >
                        Unsubscribe this device
                      </button>
                    )}
                    <button
                      type="button"
                      className="button small outline"
                      disabled={
                        pushBusy || !notifData.preferences.notificationsEnabled
                      }
                      onClick={sendTestNotification}
                    >
                      <Send size={14} /> Send test notification
                    </button>
                  </div>
                </div>
              </div>

              {activeDevices.length > 0 && (
                <div className="stack" style={{ gap: "8px" }}>
                  <strong>
                    Registered Push Devices ({activeDevices.length})
                  </strong>
                  {activeDevices.map((dev) => (
                    <div
                      key={dev.id}
                      className="notice"
                      style={{
                        padding: "10px 12px",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <div>
                        <strong>{dev.deviceLabel || "Browser Device"}</strong>
                        {currentEndpoint === dev.endpoint && (
                          <span
                            className="pill"
                            style={{ marginLeft: "8px", fontSize: "0.75rem" }}
                          >
                            This device
                          </span>
                        )}
                        <p className="muted" style={{ margin: "2px 0 0" }}>
                          Registered{" "}
                          {new Date(dev.createdAt).toLocaleDateString("en-GB")}
                          {dev.lastSuccessAt
                            ? ` · Last push delivered ${new Date(dev.lastSuccessAt).toLocaleDateString("en-GB")}`
                            : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="text-link"
                        disabled={pushBusy}
                        onClick={() => removeRegisteredDevice(dev)}
                        title="Remove device"
                      >
                        <Trash2 size={15} /> Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <button className="button" disabled={busy}>
                Save reminder preferences
              </button>
            </form>

            <div className="panel stack">
              <div className="section-title" style={{ margin: 0 }}>
                <h2>Recent Notifications &amp; Alerts</h2>
                <Link className="text-link" to="/notifications">
                  Open full inbox
                </Link>
              </div>
              {notifData.events.length ? (
                <div className="stack" style={{ gap: "12px" }}>
                  {notifData.events.slice(0, 8).map((ev) => (
                    <div
                      key={ev.id}
                      className="notice"
                      style={{
                        opacity: ev.readAt ? 0.72 : 1,
                      }}
                    >
                      <CheckCircle2 size={18} />
                      <div style={{ flex: 1 }}>
                        <strong>{ev.title}</strong>
                        <p>{ev.body}</p>
                        <div className="actions" style={{ marginTop: "6px" }}>
                          <small>
                            {new Date(ev.createdAt).toLocaleDateString("en-GB")}
                            {ev.deliveryStatus
                              ? ` · ${ev.deliveryStatus.replace(/_/g, " ")}`
                              : ""}
                          </small>
                          <Link className="text-link" to={ev.actionUrl}>
                            Open
                          </Link>
                          {!ev.readAt && (
                            <button
                              type="button"
                              className="text-link"
                              onClick={async () => {
                                await api(
                                  `/me/notifications/${ev.id}/read`,
                                  {},
                                );
                                reloadNotifs();
                              }}
                            >
                              Mark read
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">
                  No notifications yet. Enable daily reminders, send a test
                  notification, or complete a purchase to see alerts here.
                </p>
              )}
            </div>
          </div>
        )
      )}
    </>
  );
}

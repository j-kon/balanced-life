import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Bell, CheckCircle2, Smartphone, UserCheck } from "lucide-react";
import { useApp } from "../../context/AppContext";
import { useData } from "../../hooks/useData";
import { ErrorBox, Loading } from "../../components/Common";
import { api } from "../../api";
import type {
  NotificationEventRecord,
  NotificationPreferences,
} from "../../types";

type NotificationsData = {
  preferences: NotificationPreferences;
  pushSubscriptionsCount: number;
  events: NotificationEventRecord[];
};

export function AccountPage() {
  const { user, refresh, toast } = useApp();
  const {
    data: notifData,
    error: notifError,
    reload: reloadNotifs,
  } = useData<NotificationsData>("/me/notifications");
  const [profileError, setProfileError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [busy, setBusy] = useState(false);
  const [browserPermission, setBrowserPermission] = useState<string>(() =>
    typeof window !== "undefined" && "Notification" in window
      ? window.Notification.permission
      : "unsupported",
  );

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
          dailyReminderEnabled: f.get("dailyReminderEnabled") === "on",
          reminderTime: String(f.get("reminderTime") || "06:30"),
          subscriptionAlertsEnabled:
            f.get("subscriptionAlertsEnabled") === "on",
          purchaseAlertsEnabled: f.get("purchaseAlertsEnabled") === "on",
        },
        "PATCH",
      );
      reloadNotifs();
      toast("Reminder & notification preferences saved.");
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function requestDeviceNotifications() {
    if (typeof window === "undefined" || !("Notification" in window)) {
      toast("Browser notifications are not supported on this device.");
      return;
    }
    try {
      const result = await window.Notification.requestPermission();
      setBrowserPermission(result);
      if (result === "granted") {
        toast("Device notification permission granted.");
      } else {
        toast(`Notification permission status: ${result}.`);
      }
    } catch (e) {
      toast((e as Error).message);
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Profile, Security &amp; Mobile Reminders</span>
          <h1>Account settings</h1>
          <p>
            Manage your personal information, password security, and mobile PWA
            daily reminder preferences.
          </p>
        </div>
        <UserCheck size={40} strokeWidth={1} />
      </div>

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
            Account role:{" "}
            <strong>
              {user?.role === "admin" ? "Administrator" : "Reader"}
            </strong>
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
          <div className="admin-plans" style={{ marginTop: "24px" }}>
            <form className="panel stack" onSubmit={saveNotifPreferences}>
              <div className="section-title" style={{ margin: 0 }}>
                <h2>Mobile &amp; Daily Devotional Reminders</h2>
                <Bell size={22} />
              </div>
              <p>
                Configure battery-conscious daily devotional reminders and
                important account alerts. Reminders are deduplicated so you
                never receive duplicate alerts on the same day.
              </p>

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

              <label>
                Preferred daily reminder time
                <input
                  type="time"
                  name="reminderTime"
                  defaultValue={notifData.preferences.reminderTime || "06:30"}
                />
              </label>

              <label className="check-label">
                <input
                  type="checkbox"
                  name="subscriptionAlertsEnabled"
                  defaultChecked={
                    notifData.preferences.subscriptionAlertsEnabled
                  }
                />
                <span>
                  Receive membership renewal and expiration reminders
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

              <div className="notice">
                <Smartphone size={18} />
                <div>
                  <strong>
                    Device Notification Permission: {browserPermission}
                  </strong>
                  <p>
                    On Android Chrome and installed iOS 16.4+ Home Screen web
                    apps, you can grant browser notification permission for
                    system alerts.
                  </p>
                  {browserPermission === "default" && (
                    <button
                      type="button"
                      className="text-link"
                      onClick={requestDeviceNotifications}
                    >
                      Request device notification permission
                    </button>
                  )}
                </div>
              </div>

              <button className="button" disabled={busy}>
                Save reminder preferences
              </button>
            </form>

            <div className="panel stack">
              <h2>Recent Notifications &amp; Alerts</h2>
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
                  No notifications yet. Enable daily reminders or complete a
                  purchase to see alerts here.
                </p>
              )}
            </div>
          </div>
        )
      )}
    </>
  );
}

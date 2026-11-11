import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Bell,
  BellOff,
  CheckCheck,
  CheckCircle2,
  Megaphone,
  Settings,
} from "lucide-react";
import { useApp } from "../../context/AppContext";
import { useData } from "../../hooks/useData";
import { Empty, ErrorBox, Loading } from "../../components/Common";
import { api } from "../../api";
import type {
  NotificationEventRecord,
  NotificationPreferences,
} from "../../types";

type ReaderNotificationsResponse = {
  preferences: NotificationPreferences;
  events: NotificationEventRecord[];
  unreadCount: number;
  webPush: {
    configured: boolean;
    publicKey: string | null;
  };
};

const CATEGORY_LABELS: Record<string, string> = {
  announcement: "Announcement",
  daily_reminder: "Daily Reminder",
  unread_reminder: "Unread Devotional",
  subscription: "Online Access",
  digital_purchase: "Digital Purchase",
  printed_order: "Printed Book Order",
  account: "Account & Security",
  system: "Update",
};

function safeActionUrl(raw?: string | null): string {
  const url = String(raw || "/dashboard").trim();
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  return "/dashboard";
}

export function NotificationsCenterPage() {
  const { refresh, toast } = useApp();
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const { data, error, reload } = useData<ReaderNotificationsResponse>(
    `/me/notifications?filter=${filter}&limit=50`,
  );
  const [busy, setBusy] = useState(false);

  const browserPermission =
    typeof window !== "undefined" && "Notification" in window
      ? window.Notification.permission
      : "unsupported";

  async function markSingleRead(id: number) {
    setBusy(true);
    try {
      await api(`/me/notifications/${id}/read`, {});
      reload();
      await refresh();
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function markAllRead() {
    setBusy(true);
    try {
      await api("/me/notifications/read-all", {});
      reload();
      await refresh();
      toast("All notifications marked as read.");
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const events = data?.events || [];
  const unreadCount = data?.unreadCount ?? 0;

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Private In-App Inbox</span>
          <h1>Notification Center</h1>
          <p>
            Announcements, daily devotional reminders, purchase confirmations,
            and account updates delivered securely to your account.
          </p>
        </div>
        <Bell size={40} strokeWidth={1} />
      </div>

      {browserPermission === "denied" || browserPermission === "unsupported" ? (
        <div className="notice page-status-notice">
          <BellOff size={18} />
          <div>
            <strong className="notice-heading">
              Browser push alerts are off — your in-app inbox still works
            </strong>
            <p>
              Even without browser push permissions enabled, important account
              updates and opted-in community messages arrive right here in your
              notification center.
            </p>
          </div>
        </div>
      ) : null}

      <div className="notif-toolbar">
        <div
          className="notif-filter-bar"
          role="group"
          aria-label="Notification filter"
        >
          <button
            type="button"
            className={
              filter === "all" ? "button small" : "button outline small"
            }
            aria-pressed={filter === "all"}
            onClick={() => setFilter("all")}
          >
            All notifications
          </button>
          <button
            type="button"
            className={
              filter === "unread" ? "button small" : "button outline small"
            }
            aria-pressed={filter === "unread"}
            onClick={() => setFilter("unread")}
          >
            Unread ({unreadCount})
          </button>
        </div>

        <div className="actions">
          <button
            type="button"
            className="button outline small"
            disabled={busy || unreadCount === 0}
            onClick={markAllRead}
          >
            <CheckCheck size={15} /> Mark all as read
          </button>
          <Link className="button outline small" to="/account#notifications">
            <Settings size={15} /> Reminder &amp; consent settings
          </Link>
        </div>
      </div>

      <ErrorBox message={error} />
      {!data && !error ? (
        <Loading />
      ) : events.length === 0 ? (
        <div className="empty-stage">
          <Empty
            icon={
              filter === "unread" ? (
                <CheckCircle2 size={28} />
              ) : (
                <Bell size={28} />
              )
            }
            title={
              filter === "unread"
                ? "You are all caught up"
                : "Your notification inbox is empty"
            }
            action={
              filter === "unread" ? (
                <button
                  type="button"
                  className="button outline small"
                  onClick={() => setFilter("all")}
                >
                  View all notifications
                </button>
              ) : (
                <Link className="button small" to="/account#notifications">
                  <Settings size={15} /> Reminder &amp; consent settings
                </Link>
              )
            }
          >
            {filter === "unread"
              ? "Every notification on your account has been read. Switch to All notifications to revisit earlier updates."
              : "Enable devotional reminders or opt in to community announcements in Account settings whenever you are ready."}
          </Empty>
        </div>
      ) : (
        <div className="notif-list" aria-label="Account notifications">
          {events.map((ev) => {
            const isUnread = !ev.readAt;
            const target = safeActionUrl(ev.actionUrl);
            const categoryLabel = CATEGORY_LABELS[ev.category] || "Alert";
            return (
              <article
                key={ev.id}
                className={`notif-item ${isUnread ? "unread" : "read"}`}
              >
                <div className="notif-item-header">
                  <div className="notif-item-meta">
                    <span className="pill">
                      {ev.category === "announcement" ? (
                        <Megaphone size={13} />
                      ) : (
                        <Bell size={13} />
                      )}
                      {categoryLabel}
                    </span>
                    {isUnread ? (
                      <span className="unread-tag">Unread</span>
                    ) : (
                      <span className="read-tag">
                        <CheckCircle2 size={13} /> Read
                      </span>
                    )}
                  </div>
                  <time dateTime={ev.createdAt}>
                    {new Date(ev.createdAt).toLocaleString("en-GB", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </time>
                </div>

                <h2>{ev.title}</h2>
                <p>{ev.body}</p>

                <div className="notif-item-actions">
                  <Link
                    className="button small"
                    to={target}
                    onClick={() => {
                      if (isUnread) {
                        void api(`/me/notifications/${ev.id}/read`, {}).then(() =>
                          refresh(),
                        );
                      }
                    }}
                  >
                    Open <ArrowRight size={14} />
                  </Link>
                  {isUnread && (
                    <button
                      type="button"
                      className="button outline small"
                      disabled={busy}
                      onClick={() => markSingleRead(ev.id)}
                    >
                      Mark as read
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}


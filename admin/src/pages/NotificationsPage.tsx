import { AlertCircle, ArrowRight, Bell, Play } from "lucide-react";
import { Empty } from "../components/Common";
import type {
  AdminOverviewData,
  AdminSaveFn,
  AdminSectionId,
} from "./AdminTypes";

const tabMap: Record<string, AdminSectionId> = {
  "printed-orders": "Printed Orders",
  payments: "Payments",
  "online-access": "Online Access",
  "bulk-orders": "Bulk Orders",
};

export function NotificationsPage({
  data,
  busy,
  save,
  onNavigate,
}: {
  data: AdminOverviewData;
  busy: boolean;
  save: AdminSaveFn;
  onNavigate: (tab: AdminSectionId) => void;
}) {
  const alerts = data.operationalAlerts || [];
  const pushSummary = data.pushStatusSummary;

  return (
    <div className="stack">
      <div className="section-title" style={{ margin: 0 }}>
        <div>
          <h2>Operational Notifications &amp; Reminder Worker</h2>
          <p className="muted" style={{ margin: 0 }}>
            Real-time operational alerts for orders, payment verifications, and
            background Web Push reminder delivery.
          </p>
        </div>
        <button
          type="button"
          className="button small"
          disabled={busy}
          onClick={() =>
            save("/admin/notifications/run-worker", {}, "POST")
          }
        >
          <Play size={15} /> Run Notification Worker Now
        </button>
      </div>

      {/* Operational Alerts for Administrator */}
      <div className="panel stack">
        <h3>
          Active Operational Alerts ({alerts.length})
        </h3>
        {alerts.length ? (
          alerts.map((al) => {
            const targetTab = tabMap[al.actionTab] || "Overview";
            return (
              <div
                className={
                  "notice " + (al.severity === "high" ? "" : "success")
                }
                key={al.id}
              >
                <AlertCircle size={20} />
                <div style={{ flex: 1 }}>
                  <strong>{al.title}</strong>
                  <p style={{ margin: "4px 0 8px" }}>{al.description}</p>
                  <button
                    type="button"
                    className="button outline small"
                    onClick={() => onNavigate(targetTab)}
                  >
                    Open {targetTab} <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          <Empty title="All operational queues are clear">
            No pending delivery quotations, unverified bank transfers, or
            delayed dispatches require immediate attention.
          </Empty>
        )}
      </div>

      {/* Reader Web Push & Background Reminder Summary */}
      <div className="panel stack">
        <div className="section-title" style={{ margin: 0 }}>
          <div>
            <h3>Reader Web Push &amp; Scheduled Reminder Delivery</h3>
            <small className="muted">
              VAPID Status:{" "}
              {pushSummary?.configured ? "Configured & Active" : "Unconfigured"}{" "}
              · Active Subscribed Devices:{" "}
              <strong>{pushSummary?.activePushDevicesCount ?? 0}</strong>
            </small>
          </div>
          <Bell size={20} />
        </div>

        {pushSummary?.recentEvents && pushSummary.recentEvents.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Created</th>
                  <th>Category</th>
                  <th>Title</th>
                  <th>Body</th>
                  <th>Action URL</th>
                </tr>
              </thead>
              <tbody>
                {pushSummary.recentEvents.map((ev) => (
                  <tr key={ev.id}>
                    <td>
                      {new Date(ev.createdAt).toLocaleString("en-GB")}
                    </td>
                    <td>
                      <span className="pill">{ev.category}</span>
                    </td>
                    <td>
                      <strong>{ev.title}</strong>
                    </td>
                    <td>{ev.body}</td>
                    <td>
                      <code>{ev.actionUrl}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">
            No reader notification events have been generated yet.
          </p>
        )}
      </div>
    </div>
  );
}


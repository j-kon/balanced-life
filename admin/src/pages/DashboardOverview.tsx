import { useState } from "react";
import {
  AlertCircle,
  Bell,
  BookOpen,
  Building2,
  CheckCircle2,
  CreditCard,
  Gift,
  Mail,
  Package,
  PenLine,
  Settings,
  Shield,
  Truck,
  Users,
} from "lucide-react";
import { money } from "../api";
import { useAdminAuth } from "../context/AdminAuthContext";
import type { AdminOverviewData, AdminSectionId } from "./AdminTypes";

const TAB_MAP: Record<string, AdminSectionId> = {
  "printed-orders": "Printed Orders",
  payments: "Payments",
  "online-access": "Online Access",
  "bulk-orders": "Bulk Orders",
  devotionals: "Devotionals",
  notifications: "Notifications",
  email: "Email Management",
  readers: "Readers",
};

export function DashboardOverview({
  data,
  onNavigate,
}: {
  data: AdminOverviewData;
  onNavigate: (tab: AdminSectionId) => void;
}) {
  const { hasPermission } = useAdminAuth();
  const [salesPeriod, setSalesPeriod] = useState<"daily" | "weekly" | "monthly">(
    "daily",
  );

  const canReaders = hasPermission("readers.read");
  const canDigital = hasPermission("digital_orders.read");
  const canPrinted = hasPermission("printed_orders.read");
  const canPayments = hasPermission("payments.read");
  const canDevotionals = hasPermission("devotionals.read");
  const canBulk = hasPermission("bulk_orders.read");
  const canNotifications = hasPermission("notifications.read");
  const canAudit = hasPermission("audit.read");
  const canFinance = canPayments || canDigital || canPrinted;

  const m = data.metrics;
  const totalSales = m.totalSalesKobo ?? m.verifiedRevenueKobo;
  const digitalRev =
    m.digitalAccessRevenueKobo ??
    m.digitalRevenueKobo + m.subscriptionRevenueKobo;
  const printedRev = m.printedBookRevenueKobo ?? 0;

  const salesSeries = data.charts?.salesByPeriod?.[salesPeriod] || [];
  const maxSalesPoint = Math.max(1, ...salesSeries.map((pt) => pt.totalKobo));

  const regSeries = data.charts?.registrationsByMonth || [];
  const maxRegPoint = Math.max(1, ...regSeries.map((r) => r.count));

  const fulfillmentSeries = data.charts?.ordersByFulfillmentStatus || [];
  const maxFulfillmentCount = Math.max(
    1,
    ...fulfillmentSeries.map((f) => f.count),
  );

  const editorialAwaiting =
    (m.pendingReviewReadings ?? 0) + (m.needsRevisionReadings ?? 0);
  const notificationsAttention =
    (m.failedNotificationCampaignsCount ?? 0) +
    (m.scheduledNotificationsCount ?? 0) +
    (m.openInquiries ?? 0);

  const primaryCards: Array<{
    Icon: typeof Users;
    label: string;
    value: string | number;
    hint?: string;
    target?: AdminSectionId;
  }> = [];

  if (canReaders) {
    primaryCards.push({
      Icon: Users,
      label: "Total Readers",
      value: m.totalRegisteredReaders ?? m.readers,
      hint: "Registered reader accounts",
      target: "Readers",
    });
  }

  if (canReaders || canDigital) {
    const paidCount = m.paidOnlineReaders ?? 0;
    const compCount = m.complimentaryOnlineReaders ?? 0;
    primaryCards.push({
      Icon: CheckCircle2,
      label: "Active Online Readers",
      value: m.activeOnlineReaders ?? m.activeMemberships + m.digitalEditionsSold,
      hint: `${paidCount} paid · ${compCount} complimentary`,
      target: canDigital ? "Online Access" : "Readers",
    });
  }

  if (canFinance) {
    primaryCards.push({
      Icon: CreditCard,
      label: "Verified Revenue",
      value: money(totalSales),
      hint: `Online Access ${money(digitalRev)} · Printed ${money(printedRev)}`,
      target: canPayments ? "Payments" : canDigital ? "Online Access" : "Printed Orders",
    });
  }

  if (canPrinted) {
    primaryCards.push({
      Icon: Package,
      label: "Pending Printed Orders",
      value: m.pendingPrintedOrders ?? 0,
      hint: `${m.printedBooksCopiesOrdered ?? 0} total copies ordered`,
      target: "Printed Orders",
    });
    primaryCards.push({
      Icon: Truck,
      label: "Orders Awaiting Dispatch",
      value: m.ordersAwaitingDelivery ?? 0,
      hint: `${m.deliveredOrders ?? 0} delivered`,
      target: "Printed Orders",
    });
  }

  if (canDevotionals) {
    primaryCards.push({
      Icon: BookOpen,
      label: "Devotionals Awaiting Approval",
      value: editorialAwaiting,
      hint: `${m.published} published · ${m.needsRevisionReadings} needs revision`,
      target: "Devotionals",
    });
  }

  if (canNotifications) {
    primaryCards.push({
      Icon: Bell,
      label: "Notifications & Inquiries",
      value: notificationsAttention,
      hint: `${m.scheduledNotificationsCount ?? 0} scheduled · ${m.openInquiries} open inquiries`,
      target: "Notifications",
    });
  }

  if (canDigital || canPayments) {
    primaryCards.push({
      Icon: CreditCard,
      label: "Pending Payment Verifications",
      value: m.pendingDigitalPurchases,
      hint: "Bank transfers or checkout confirmations waiting",
      target: canDigital ? "Online Access" : "Payments",
    });
  }

  const alerts = data.operationalAlerts || [];

  return (
    <div className="stack">
      {/* Primary KPI Hierarchy (Scoped to Role Permissions) */}
      {primaryCards.length > 0 && (
        <div className="metric-grid">
          {primaryCards.map((card) => (
            <div className="metric" key={card.label}>
              <card.Icon size={22} />
              <strong>{card.value}</strong>
              <span style={{ fontWeight: 600, color: "var(--wine)" }}>
                {card.label}
              </span>
              {card.hint && <span>{card.hint}</span>}
              {card.target && (
                <button
                  type="button"
                  className="text-link"
                  style={{ alignSelf: "flex-start" }}
                  onClick={() => onNavigate(card.target!)}
                >
                  Open {card.target}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Prominent Needs Your Attention Queue */}
      <section className="panel stack">
        <div className="row" style={{ flexWrap: "wrap", gap: 10 }}>
          <div>
            <h2 style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
              <AlertCircle size={20} /> Needs Your Attention
            </h2>
            <p className="muted" style={{ margin: 0 }}>
              {alerts.length
                ? `${alerts.length} operational item${alerts.length === 1 ? "" : "s"} requiring review or fulfillment action.`
                : "No urgent operational items pending across your permitted queues."}
            </p>
          </div>
          {canBulk && m.openBulkOrders > 0 && (
            <button
              type="button"
              className="button outline small"
              onClick={() => onNavigate("Bulk Orders")}
            >
              <Building2 size={14} /> {m.openBulkOrders} Open Bulk Orders
            </button>
          )}
        </div>

        {alerts.length > 0 ? (
          <div className="admin-attention-grid">
            {alerts.slice(0, 8).map((alert) => {
              const target = TAB_MAP[alert.actionTab] || "Overview";
              return (
                <div
                  key={alert.id}
                  className={`admin-attention-card ${alert.severity}`}
                >
                  <div className="stack" style={{ gap: 6 }}>
                    <div className="row">
                      <span className="pill">{alert.severity.toUpperCase()}</span>
                      <small className="muted">
                        {new Date(alert.createdAt).toLocaleDateString("en-GB")}
                      </small>
                    </div>
                    <strong>{alert.title}</strong>
                    <p className="muted" style={{ margin: 0, fontSize: "0.84rem" }}>
                      {alert.description}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="button outline small"
                    style={{ alignSelf: "flex-start" }}
                    onClick={() => onNavigate(target)}
                  >
                    Open {target}
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="notice success">
            <CheckCircle2 size={18} />
            <div>
              <strong>All caught up</strong>
              <p style={{ margin: 0 }}>
                No pending bank transfers, delivery quotations, revision flags, or failed notifications need immediate action.
              </p>
            </div>
          </div>
        )}
      </section>

      {/* Quick Actions */}
      <div className="panel stack">
        <div>
          <h2>Quick Navigation</h2>
          <p className="muted" style={{ margin: 0 }}>
            Jump directly to your permitted daily operational workflows.
          </p>
        </div>
        <div className="actions">
          {hasPermission("payments.read") && (
            <button
              type="button"
              className="button small"
              onClick={() => onNavigate("Payments")}
            >
              <CreditCard size={15} /> Review Payments ({m.pendingDigitalPurchases})
            </button>
          )}
          {hasPermission("printed_orders.read") && (
            <button
              type="button"
              className="button outline small"
              onClick={() => onNavigate("Printed Orders")}
            >
              <Package size={15} /> View Printed Orders ({m.printedOrdersTotal ?? 0})
            </button>
          )}
          {hasPermission("readers.read") && (
            <button
              type="button"
              className="button outline small"
              onClick={() => onNavigate("Readers")}
            >
              <Gift size={15} /> Manage Readers &amp; Access
            </button>
          )}
          {hasPermission("devotionals.read") && (
            <button
              type="button"
              className="button outline small"
              onClick={() => onNavigate("Devotionals")}
            >
              <PenLine size={15} /> 2027 Editorial Calendar ({editorialAwaiting} awaiting approval)
            </button>
          )}
          {hasPermission("notifications.read") && (
            <button
              type="button"
              className="button outline small"
              onClick={() => onNavigate("Notifications")}
            >
              <Bell size={15} /> Reader Notifications
            </button>
          )}
          {hasPermission("bulk_orders.read") && (
            <button
              type="button"
              className="button outline small"
              onClick={() => onNavigate("Bulk Orders")}
            >
              <Building2 size={15} /> Bulk Orders ({m.bulkOrderInquiries})
            </button>
          )}
          {hasPermission("settings.read") && (
            <button
              type="button"
              className="button outline small"
              onClick={() => onNavigate("Settings")}
            >
              <Settings size={15} /> Pricing &amp; Delivery Settings
            </button>
          )}
          {canNotifications && (
            <button
              type="button"
              className="button outline small"
              onClick={() => onNavigate("Email Management")}
            >
              <Mail size={15} /> Email Management
            </button>
          )}
          <button
            type="button"
            className="button outline small"
            onClick={() => onNavigate("Activity & Security")}
          >
            <Shield size={15} /> Security &amp; Activity
          </button>
        </div>
      </div>

      {data.emailStatusSummary && (
        <div
          className="panel stack"
          data-testid="dashboard-email-status-panel"
        >
          <div className="row" style={{ alignItems: "center", gap: "0.75rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
              <Mail size={18} />
              <div>
                <h3 style={{ margin: 0 }}>
                  Email Delivery Configuration &amp; Queue Status
                </h3>
                <small className="muted">
                  Provider:{" "}
                  <strong>{data.emailStatusSummary.configuration.provider}</strong>{" "}
                  · Sender:{" "}
                  <code>
                    {data.emailStatusSummary.configuration.fromAddress}
                  </code>{" "}
                  ·{" "}
                  {data.emailStatusSummary.configuration.domainVerified
                    ? "Sender domain verified"
                    : "Sender domain verification pending"}
                </small>
              </div>
            </div>
            <div style={{ display: "flex", gap: "0.45rem", alignItems: "center", flexWrap: "wrap" }}>
              <span
                className={`badge ${data.emailStatusSummary.configuration.configured ? "success" : "warn"}`}
              >
                {data.emailStatusSummary.configuration.configured
                  ? "Provider Ready"
                  : "Provider Not Configured"}
              </span>
              {data.emailStatusSummary.quota.optionalPausedByQuota && (
                <span className="badge warn">Optional Campaigns Paused</span>
              )}
              {canNotifications && (
                <button
                  type="button"
                  className="button outline small"
                  onClick={() => onNavigate("Email Management")}
                >
                  Open Email Management
                </button>
              )}
            </div>
          </div>

          <div
            className="cards-grid"
            style={{
              gridTemplateColumns: "repeat(auto-fit, minmax(175px, 1fr))",
              gap: "0.75rem",
            }}
          >
            <div
              className="card"
              style={{ padding: "0.85rem 1rem", background: "var(--surface-alt)" }}
            >
              <small className="muted">Daily Free-Tier Quota</small>
              <div style={{ fontSize: "1.2rem", fontWeight: 700, marginTop: "0.2rem" }}>
                {data.emailStatusSummary.quota.sentToday} /{" "}
                {data.emailStatusSummary.quota.dailyLimit}
              </div>
              <small className="muted">
                {data.emailStatusSummary.quota.transactionalReserve} reserved for
                resets &amp; security ·{" "}
                {data.emailStatusSummary.quota.remainingOptional} optional left
              </small>
            </div>

            <div
              className="card"
              style={{ padding: "0.85rem 1rem", background: "var(--surface-alt)" }}
            >
              <small className="muted">Monthly Free-Tier Usage</small>
              <div style={{ fontSize: "1.2rem", fontWeight: 700, marginTop: "0.2rem" }}>
                {data.emailStatusSummary.quota.sentThisMonth} /{" "}
                {data.emailStatusSummary.quota.monthlyLimit}
              </div>
              <small className="muted">
                {data.emailStatusSummary.quota.remainingMonthly} remaining this
                month
              </small>
            </div>

            <div
              className="card"
              style={{ padding: "0.85rem 1rem", background: "var(--surface-alt)" }}
            >
              <small className="muted">Queue &amp; Delivery</small>
              <div style={{ fontSize: "1.2rem", fontWeight: 700, marginTop: "0.2rem" }}>
                {data.emailStatusSummary.counts.sent} sent ·{" "}
                {data.emailStatusSummary.counts.pending +
                  data.emailStatusSummary.counts.retrying}{" "}
                queued
              </div>
              <small className="muted">
                {data.emailStatusSummary.counts.failed} failed ·{" "}
                {data.emailStatusSummary.counts.pausedCampaigns} paused
                campaigns
              </small>
            </div>
          </div>
        </div>
      )}

      {/* Permission-Scoped Charts Grid */}
      {(canFinance || canPrinted || canReaders) && (
        <div className="admin-charts-grid">
          {canFinance && (
            <>
              <div className="panel stack">
                <div className="section-title" style={{ margin: 0 }}>
                  <div>
                    <h3>Verified Sales Trend</h3>
                    <small className="muted">
                      Settled Online Access &amp; Printed Book payments
                    </small>
                  </div>
                  <div className="actions">
                    {(["daily", "weekly", "monthly"] as const).map((period) => (
                      <button
                        key={period}
                        type="button"
                        className={
                          "button small " + (salesPeriod === period ? "" : "outline")
                        }
                        onClick={() => setSalesPeriod(period)}
                      >
                        {period.charAt(0).toUpperCase() + period.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="admin-bar-chart">
                  {salesSeries.map((pt, idx) => {
                    const pct = Math.max(
                      4,
                      Math.round((pt.totalKobo / maxSalesPoint) * 100),
                    );
                    return (
                      <div
                        className="admin-bar-col"
                        key={`${pt.label}-${idx}`}
                        title={`${pt.label}: ${money(pt.totalKobo)} (Online Access: ${money(pt.digitalKobo)}, Printed: ${money(pt.printedKobo)})`}
                      >
                        <div className="admin-bar-track">
                          <div
                            className="admin-bar-fill"
                            style={{ height: `${pt.totalKobo > 0 ? pct : 3}%` }}
                          />
                        </div>
                        <span className="admin-bar-label">{pt.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="panel stack">
                <div>
                  <h3>Two-Product Revenue Split</h3>
                  <small className="muted">
                    2027 Online Access (₦3,500) vs Printed Book (₦5,000)
                  </small>
                </div>
                <div className="stack" style={{ gap: "12px" }}>
                  <div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: "6px",
                      }}
                    >
                      <strong>2027 Online Access (₦3,500)</strong>
                      <span>{money(digitalRev)}</span>
                    </div>
                    <div className="progress-bar-track">
                      <div
                        className="progress-bar-fill"
                        style={{
                          width: `${totalSales > 0 ? Math.round((digitalRev / totalSales) * 100) : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                  <div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: "6px",
                      }}
                    >
                      <strong>Printed Devotional Book (₦5,000)</strong>
                      <span>{money(printedRev)}</span>
                    </div>
                    <div className="progress-bar-track">
                      <div
                        className="progress-bar-fill gold"
                        style={{
                          width: `${totalSales > 0 ? Math.round((printedRev / totalSales) * 100) : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {canPrinted && (
            <div className="panel stack">
              <div>
                <h3>Printed Orders by Fulfillment Status</h3>
                <small className="muted">
                  Pipeline from quotation to doorstep delivery
                </small>
              </div>
              <div className="stack" style={{ gap: "8px" }}>
                {fulfillmentSeries.map((f) => (
                  <div
                    key={f.status}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "150px 1fr 40px",
                      alignItems: "center",
                      gap: "10px",
                      fontSize: "0.88rem",
                    }}
                  >
                    <span>{f.label}</span>
                    <div className="progress-bar-track">
                      <div
                        className="progress-bar-fill"
                        style={{
                          width: `${f.count > 0 ? Math.max(8, Math.round((f.count / maxFulfillmentCount) * 100)) : 0}%`,
                        }}
                      />
                    </div>
                    <strong style={{ textAlign: "right" }}>{f.count}</strong>
                  </div>
                ))}
              </div>
            </div>
          )}

          {canReaders && (
            <div className="panel stack">
              <div>
                <h3>New Reader Registrations (Last 6 Months)</h3>
                <small className="muted">
                  Teenagers, young adults &amp; mentors joining the platform
                </small>
              </div>
              <div className="admin-bar-chart">
                {regSeries.map((r) => {
                  const pct = Math.max(
                    6,
                    Math.round((r.count / maxRegPoint) * 100),
                  );
                  return (
                    <div
                      className="admin-bar-col"
                      key={r.month}
                      title={`${r.label}: ${r.count} registrations`}
                    >
                      <div className="admin-bar-track">
                        <div
                          className="admin-bar-fill"
                          style={{ height: `${r.count > 0 ? pct : 4}%` }}
                        />
                      </div>
                      <span className="admin-bar-label">
                        {r.label} ({r.count})
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Reading Engagement (only for editorial-permitted roles) */}
      {canDevotionals && (
        <div className="panel stack">
          <h3>Reading Engagement (Published Entries)</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Reading</th>
                  <th>Completed by</th>
                  <th>Saved by</th>
                </tr>
              </thead>
              <tbody>
                {data.engagement.slice(0, 12).map((e) => (
                  <tr key={e.id}>
                    <td>{e.date}</td>
                    <td>{e.title}</td>
                    <td>{e.completions}</td>
                    <td>{e.bookmarks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent Administrative Activity (only for audit.read) */}
      {canAudit && (
        <div className="panel stack">
          <h3>Recent Administrative Activity</h3>
          {data.audit.length ? (
            data.audit.slice(0, 15).map((a) => (
              <p className="audit-line" key={a.id}>
                {new Date(a.createdAt).toLocaleString("en-GB")}
                {a.adminName ? ` · ${a.adminName}` : ""} — {a.action}
              </p>
            ))
          ) : (
            <p className="muted">No administrative actions logged yet.</p>
          )}
        </div>
      )}
    </div>
  );
}

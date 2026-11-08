import { useState } from "react";
import {
  AlertCircle,
  BookOpen,
  Building2,
  CheckCircle2,
  Clock,
  CreditCard,
  Gift,
  Package,
  PenLine,
  Settings,
  ShoppingBag,
  Truck,
  Users,
} from "lucide-react";
import { money } from "../../api";
import type { AdminOverviewData, AdminSectionId } from "./AdminTypes";

export function DashboardOverview({
  data,
  onNavigate,
}: {
  data: AdminOverviewData;
  onNavigate: (tab: AdminSectionId) => void;
}) {
  const [salesPeriod, setSalesPeriod] = useState<"daily" | "weekly" | "monthly">(
    "daily",
  );

  const m = data.metrics;
  const totalSales = m.totalSalesKobo ?? m.verifiedRevenueKobo;
  const digitalRev =
    m.digitalAccessRevenueKobo ??
    m.digitalRevenueKobo + m.subscriptionRevenueKobo;
  const printedRev = m.printedBookRevenueKobo ?? 0;

  const salesSeries =
    data.charts?.salesByPeriod?.[salesPeriod] || [];
  const maxSalesPoint = Math.max(
    1,
    ...salesSeries.map((pt) => pt.totalKobo),
  );

  const regSeries = data.charts?.registrationsByMonth || [];
  const maxRegPoint = Math.max(1, ...regSeries.map((r) => r.count));

  const fulfillmentSeries = data.charts?.ordersByFulfillmentStatus || [];
  const maxFulfillmentCount = Math.max(
    1,
    ...fulfillmentSeries.map((f) => f.count),
  );

  return (
    <div className="stack">
      {/* 12 Top-Level KPI Cards */}
      <div className="metric-grid">
        {[
          [
            CreditCard,
            `Verified revenue (Digital ${money(digitalRev)} · Printed ${money(printedRev)})`,
            money(totalSales),
          ],
          [
            BookOpen,
            `2027 Digital Access revenue (${m.digitalEditionsSold} Digital editions sold)`,
            money(digitalRev),
          ],
          [
            ShoppingBag,
            `Printed Book revenue (${m.printedBooksCopiesOrdered ?? 0} copies ordered)`,
            money(printedRev),
          ],
          [
            CheckCircle2,
            `Active online readers (${m.paidMemberships} paid, ${m.complimentaryMemberships} comp)`,
            m.activeOnlineReaders ?? m.activeMemberships + m.digitalEditionsSold,
          ],
          [
            Clock,
            "Online access expiring soon (within reminder window)",
            m.expiringOnlineAccessSoon ?? 0,
          ],
          [
            AlertCircle,
            "Expired / revoked online access",
            (m.expiredOnlineAccess ?? 0) + m.expiredMemberships,
          ],
          [
            Users,
            "Total registered readers",
            m.totalRegisteredReaders ?? m.readers,
          ],
          [
            CreditCard,
            "Pending digital payment verifications",
            m.pendingDigitalPurchases,
          ],
          [
            Package,
            "Pending printed book orders (quote / payment / processing)",
            m.pendingPrintedOrders ?? 0,
          ],
          [
            Truck,
            "Orders awaiting delivery (ready for dispatch / shipped)",
            m.ordersAwaitingDelivery ?? 0,
          ],
          [
            CheckCircle2,
            "Delivered printed book orders",
            m.deliveredOrders ?? 0,
          ],
          [
            BookOpen,
            `Published devotionals (of ${data.devotionals.length} · ${m.drafts} drafts)`,
            m.published,
          ],
        ].map(([Icon, label, value]: any) => (
          <div className="metric" key={label}>
            <Icon size={22} />
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="panel stack">
        <div>
          <h2>Executive Quick Actions</h2>
          <p className="muted" style={{ margin: 0 }}>
            {m.published} readings are published and live in the library.{" "}
            {m.drafts} entries remain in draft status ({m.needsRevisionReadings}{" "}
            flagged for revision before approval).
          </p>
        </div>
        <div className="actions">
          <button
            type="button"
            className="button small"
            onClick={() => onNavigate("Payments")}
          >
            <CreditCard size={15} /> Review Pending Payments (
            {m.pendingDigitalPurchases})
          </button>
          <button
            type="button"
            className="button outline small"
            onClick={() => onNavigate("Printed Orders")}
          >
            <Package size={15} /> View Printed Orders (
            {m.printedOrdersTotal ?? 0})
          </button>
          <button
            type="button"
            className="button outline small"
            onClick={() => onNavigate("Readers")}
          >
            <Gift size={15} /> Grant Complimentary Access
          </button>
          <button
            type="button"
            className="button outline small"
            onClick={() => onNavigate("Devotionals")}
          >
            <PenLine size={15} /> Edit Devotional Entries ({m.drafts} drafts)
          </button>
          <button
            type="button"
            className="button outline small"
            onClick={() => onNavigate("Bulk Orders")}
          >
            <Building2 size={15} /> Manage Bulk Orders ({m.bulkOrderInquiries})
          </button>
          <button
            type="button"
            className="button outline small"
            onClick={() => onNavigate("Settings")}
          >
            <Settings size={15} /> Update Pricing &amp; Delivery Settings
          </button>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="admin-charts-grid">
        {/* Chart 1: Verified Sales by Period */}
        <div className="panel stack">
          <div className="section-title" style={{ margin: 0 }}>
            <div>
              <h3>Verified Sales Trend</h3>
              <small className="muted">
                Settled Digital Access &amp; Printed Book payments
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
                  title={`${pt.label}: ${money(pt.totalKobo)} (Digital: ${money(pt.digitalKobo)}, Printed: ${money(pt.printedKobo)})`}
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

        {/* Chart 2: Digital Access vs Printed Book Sales */}
        <div className="panel stack">
          <div>
            <h3>Two-Product Revenue Split</h3>
            <small className="muted">
              Product A (2027 Digital Access) vs Product B (Printed Book)
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
                <strong>2027 Digital Devotional Access (₦3,500)</strong>
                <span>{money(digitalRev)}</span>
              </div>
              <div className="progress-bar-track">
                <div
                  className="progress-bar-fill"
                  style={{
                    width: `${totalSales > 0 ? Math.round((digitalRev / totalSales) * 100) : 50}%`,
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

        {/* Chart 3: Printed Orders by Fulfillment Status */}
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

        {/* Chart 4: New Reader Registrations */}
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
      </div>

      {/* Reading Engagement */}
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

      {/* Recent Administrative Activity */}
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
    </div>
  );
}


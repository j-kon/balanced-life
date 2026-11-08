import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Bell,
  BookOpen,
  Building2,
  ChevronRight,
  CreditCard,
  Layers,
  Package,
  Settings,
  Shield,
  Users,
} from "lucide-react";
import { useApp } from "../../context/AppContext";
import { useData } from "../../hooks/useData";
import { ErrorBox, Loading } from "../../components/Common";
import { api } from "../../api";
import type { AdminOverviewData, AdminSectionId } from "./AdminTypes";
import { DashboardOverview } from "./DashboardOverview";
import { DigitalOrdersPage } from "./DigitalOrdersPage";
import { PrintedOrdersPage } from "./PrintedOrdersPage";
import { ReadersPage } from "./ReadersPage";
import { DevotionalsPage } from "./DevotionalsPage";
import { BulkOrdersPage } from "./BulkOrdersPage";
import { PaymentsPage } from "./PaymentsPage";
import { NotificationsPage } from "./NotificationsPage";
import { SettingsPage } from "./SettingsPage";

const navItems: Array<{ id: AdminSectionId; label: string; icon: any }> = [
  { id: "Overview", label: "Executive Overview", icon: Layers },
  { id: "Online Access", label: "Online Access", icon: BookOpen },
  { id: "Printed Orders", label: "Printed Orders", icon: Package },
  { id: "Readers", label: "Readers", icon: Users },
  { id: "Devotionals", label: "Devotionals", icon: BookOpen },
  { id: "Bulk Orders", label: "Bulk Orders", icon: Building2 },
  { id: "Payments", label: "Payments", icon: CreditCard },
  { id: "Notifications", label: "Notifications", icon: Bell },
  { id: "Settings", label: "Settings", icon: Settings },
];

export function AdminPage() {
  const { data, error, reload } = useData<AdminOverviewData>("/admin/overview");
  const { user, toast, refreshConfig } = useApp();
  const [tab, setTab] = useState<AdminSectionId>("Overview");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");

  async function save(path: string, body: unknown, method = "PATCH") {
    setBusy(true);
    setFormError("");
    try {
      await api(path, body, method);
      reload();
      await refreshConfig();
      toast("Changes saved.");
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const alertCount =
    data?.operationalAlerts?.length ??
    data?.metrics?.activeAlertsCount ??
    0;

  return (
    <div className="admin-layout container">
      {/* Responsive Left Sidebar Navigation */}
      <aside className="admin-sidebar" aria-label="Administration navigation">
        <div className="admin-sidebar-header">
          <Shield size={26} strokeWidth={1.5} />
          <div>
            <strong>Author's Desk</strong>
            <small>{data?.settings.organizationName || "Admin Console"}</small>
          </div>
        </div>

        <nav className="admin-sidebar-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isAlertTab = item.id === "Notifications";
            return (
              <button
                key={item.id}
                type="button"
                className={
                  "admin-sidebar-item " + (tab === item.id ? "active" : "")
                }
                onClick={() => {
                  setTab(item.id);
                  setFormError("");
                }}
              >
                <Icon size={18} />
                <span>{item.label}</span>
                {isAlertTab && alertCount > 0 && (
                  <span className="pill alert-pill">{alertCount}</span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="admin-sidebar-footer">
          <div className="admin-user-badge">
            <span className="avatar-dot" />
            <div>
              <strong>{user?.name || "Administrator"}</strong>
              <small>{user?.email}</small>
            </div>
          </div>
          <Link to="/dashboard" className="text-link small">
            Reader dashboard <ChevronRight size={14} />
          </Link>
        </div>
      </aside>

      {/* Main Admin Content Area */}
      <main className="admin-main">
        {/* Top Header & Breadcrumbs */}
        <div className="admin-topbar">
          <div className="admin-breadcrumbs">
            <span>Administration</span>
            <ChevronRight size={14} />
            <strong>{tab}</strong>
          </div>
          <div className="actions">
            {alertCount > 0 && (
              <button
                type="button"
                className="pill alert-pill-button"
                onClick={() => setTab("Notifications")}
              >
                <Bell size={14} /> {alertCount} action
                {alertCount === 1 ? "" : "s"} required
              </button>
            )}
            <Link to="/library" className="button outline small">
              View Reader Library
            </Link>
          </div>
        </div>

        <div className="page-heading" style={{ marginTop: "12px" }}>
          <div>
            <span className="eyebrow">
              {data?.settings.organizationName ||
                "Cossy Teens Consult Enterprises"}
            </span>
            <h1>The author's desk</h1>
            <p className="muted" style={{ margin: "4px 0 0 0" }}>
              {navItems.find((n) => n.id === tab)?.label}
            </p>
          </div>
        </div>

        {/* Mobile Horizontal Navigation Bar */}
        <div
          className="admin-tabs mobile-only"
          role="navigation"
          aria-label="Administration sections"
        >
          {navItems.map((item) => (
            <button
              className={tab === item.id ? "active" : ""}
              key={item.id}
              onClick={() => {
                setTab(item.id);
                setFormError("");
              }}
            >
              {item.label}
              {item.id === "Notifications" && alertCount > 0
                ? ` (${alertCount})`
                : ""}
            </button>
          ))}
        </div>

        <ErrorBox message={error || formError} />
        {!data && !error ? (
          <Loading />
        ) : (
          data && (
            <>
              {tab === "Overview" && (
                <DashboardOverview data={data} onNavigate={setTab} />
              )}
              {tab === "Online Access" && (
                <DigitalOrdersPage data={data} busy={busy} save={save} />
              )}
              {tab === "Printed Orders" && (
                <PrintedOrdersPage data={data} busy={busy} save={save} />
              )}
              {tab === "Readers" && (
                <ReadersPage data={data} busy={busy} save={save} />
              )}
              {tab === "Devotionals" && (
                <DevotionalsPage
                  data={data}
                  busy={busy}
                  formError={formError}
                  setFormError={setFormError}
                  save={save}
                />
              )}
              {tab === "Bulk Orders" && (
                <BulkOrdersPage data={data} busy={busy} save={save} />
              )}
              {tab === "Payments" && (
                <PaymentsPage data={data} busy={busy} save={save} />
              )}
              {tab === "Notifications" && (
                <NotificationsPage
                  data={data}
                  busy={busy}
                  save={save}
                  onNavigate={setTab}
                />
              )}
              {tab === "Settings" && (
                <SettingsPage data={data} busy={busy} save={save} />
              )}
            </>
          )
        )}
      </main>
    </div>
  );
}

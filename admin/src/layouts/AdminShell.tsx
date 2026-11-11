import type { ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Activity,
  Bell,
  BookOpen,
  Building2,
  ChevronRight,
  CreditCard,
  Layers,
  LogOut,
  Package,
  Settings,
  Shield,
  Users,
} from "lucide-react";
import { AdminBrand } from "../components/Common";
import { useAdminAuth } from "../context/AdminAuthContext";
import type { AdminPermission } from "../types";
import type { AdminSectionId } from "../pages/AdminTypes";

export type AdminNavRoute = {
  id: AdminSectionId;
  path: string;
  label: string;
  icon: typeof Layers;
  requiredPermission?: AdminPermission;
};

export const ADMIN_NAV_ROUTES: AdminNavRoute[] = [
  {
    id: "Overview",
    path: "/dashboard",
    label: "Executive Overview",
    icon: Layers,
    requiredPermission: "overview.read",
  },
  {
    id: "Online Access",
    path: "/online-access",
    label: "Online Access",
    icon: BookOpen,
    requiredPermission: "digital_orders.read",
  },
  {
    id: "Printed Orders",
    path: "/printed-orders",
    label: "Printed Orders",
    icon: Package,
    requiredPermission: "printed_orders.read",
  },
  {
    id: "Readers",
    path: "/readers",
    label: "Readers",
    icon: Users,
    requiredPermission: "readers.read",
  },
  {
    id: "Devotionals",
    path: "/devotionals",
    label: "Devotionals",
    icon: BookOpen,
    requiredPermission: "devotionals.read",
  },
  {
    id: "Bulk Orders",
    path: "/bulk-orders",
    label: "Bulk Orders",
    icon: Building2,
    requiredPermission: "bulk_orders.read",
  },
  {
    id: "Payments",
    path: "/payments",
    label: "Payments",
    icon: CreditCard,
    requiredPermission: "payments.read",
  },
  {
    id: "Notifications",
    path: "/notifications",
    label: "Notifications",
    icon: Bell,
    requiredPermission: "notifications.read",
  },
  {
    id: "Activity & Security",
    path: "/activity",
    label: "Activity & Security",
    icon: Activity,
  },
  {
    id: "Settings",
    path: "/settings",
    label: "Settings",
    icon: Settings,
    requiredPermission: "settings.read",
  },
];

export const SECTION_TO_PATH: Record<AdminSectionId, string> = {
  Overview: "/dashboard",
  "Online Access": "/online-access",
  "Printed Orders": "/printed-orders",
  Readers: "/readers",
  Devotionals: "/devotionals",
  "Bulk Orders": "/bulk-orders",
  Payments: "/payments",
  Notifications: "/notifications",
  "Activity & Security": "/activity",
  Settings: "/settings",
};

export function AdminShell({
  organizationName,
  alertCount,
  children,
}: {
  organizationName?: string;
  alertCount: number;
  children: ReactNode;
}) {
  const { admin, hasPermission, logout } = useAdminAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const visibleRoutes = ADMIN_NAV_ROUTES.filter(
    (r) => !r.requiredPermission || hasPermission(r.requiredPermission),
  );

  const activeRoute =
    ADMIN_NAV_ROUTES.find((r) => location.pathname === r.path) ||
    visibleRoutes[0];

  return (
    <div>
      <header className="admin-header-bar">
        <div className="admin-header-inner">
          <AdminBrand to="/dashboard" />
          <div className="actions">
            <span className="role-pill">
              <Shield size={13} />
              {admin?.role.replace(/_/g, " ")}
            </span>
            {alertCount > 0 && hasPermission("notifications.read") && (
              <button
                type="button"
                className="pill alert-pill-button"
                onClick={() => navigate("/notifications")}
              >
                <Bell size={14} /> {alertCount} action
                {alertCount === 1 ? "" : "s"} required
              </button>
            )}
            <button
              type="button"
              className="button outline small"
              onClick={async () => {
                await logout();
                navigate("/login", { replace: true });
              }}
            >
              <LogOut size={15} /> Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="admin-layout admin-standalone">
        <aside className="admin-sidebar" aria-label="Administration navigation">
          <div className="admin-sidebar-header">
            <Shield size={24} strokeWidth={1.6} />
            <div>
              <strong>Operations Desk</strong>
              <small>
                {organizationName || "Cossy Teens Consult Enterprises"}
              </small>
            </div>
          </div>

          <nav className="admin-sidebar-nav">
            {visibleRoutes.map((item) => {
              const Icon = item.icon;
              const isAlertTab = item.id === "Notifications";
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) =>
                    "admin-sidebar-item " + (isActive ? "active" : "")
                  }
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                  {isAlertTab && alertCount > 0 && (
                    <span className="pill alert-pill">{alertCount}</span>
                  )}
                </NavLink>
              );
            })}
          </nav>

          <div className="admin-sidebar-footer">
            <div className="admin-user-badge">
              <span className="avatar-dot" />
              <div>
                <strong>{admin?.name || "Administrator"}</strong>
                <small>{admin?.email}</small>
              </div>
            </div>
          </div>
        </aside>

        <main className="admin-main">
          <div className="admin-topbar">
            <div className="admin-breadcrumbs">
              <span>Administration</span>
              <ChevronRight size={14} />
              <strong>{activeRoute?.label || "Dashboard"}</strong>
            </div>
            <span className="muted" style={{ fontSize: "0.82rem" }}>
              MFA verified · Isolated admin session
            </span>
          </div>

          <div className="page-heading" style={{ marginTop: "8px" }}>
            <div>
              <span className="eyebrow">
                {organizationName || "Cossy Teens Consult Enterprises"}
              </span>
              <h1>{activeRoute?.label || "Administration Dashboard"}</h1>
            </div>
          </div>

          {/* Mobile Horizontal Navigation */}
          <div
            className="admin-tabs mobile-only"
            role="navigation"
            aria-label="Mobile administration sections"
          >
            {visibleRoutes.map((item) => (
              <button
                key={item.path}
                type="button"
                className={location.pathname === item.path ? "active" : ""}
                onClick={() => navigate(item.path)}
              >
                {item.label}
                {item.id === "Notifications" && alertCount > 0
                  ? ` (${alertCount})`
                  : ""}
              </button>
            ))}
          </div>

          {children}
        </main>
      </div>
    </div>
  );
}


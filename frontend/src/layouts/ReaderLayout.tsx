import type { ReactNode } from "react";
import { NavLink, Navigate, useNavigate } from "react-router-dom";
import {
  BookOpen,
  Bookmark,
  CreditCard,
  LayoutDashboard,
  LogOut,
  PenLine,
  Shield,
  UserCheck,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { Empty } from "../components/Common";
import { api } from "../api";

export const readerLinks = [
  { to: "/dashboard", label: "My journey", shortLabel: "Home", icon: LayoutDashboard },
  { to: "/library", label: "Devotional library", shortLabel: "Read", icon: BookOpen },
  { to: "/saved", label: "Saved readings", shortLabel: "Saved", icon: Bookmark },
  { to: "/journal", label: "My Growth Journal", shortLabel: "Journal", icon: PenLine },
  { to: "/subscription", label: "Membership", shortLabel: "Plan", icon: CreditCard },
  { to: "/account", label: "Account settings", shortLabel: "Account", icon: UserCheck },
];

export function ReaderShell({ children }: { children: ReactNode }) {
  const { user, refresh, toast } = useApp();
  const navigate = useNavigate();

  return (
    <div className="reader-layout">
      <aside className="sidebar">
        <span className="eyebrow">Your quiet space</span>
        <nav aria-label="Reader navigation">
          {readerLinks.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to}>
              <Icon size={19} />
              {label}
            </NavLink>
          ))}
          {user?.role === "admin" && (
            <NavLink to="/admin">
              <Shield size={19} />
              Administration
            </NavLink>
          )}
        </nav>
        <div className="sidebar-bottom">
          <span className="avatar">{user?.name[0] || "R"}</span>
          <div>
            <strong>{user?.name}</strong>
            <small>
              {user?.role === "admin" ? "Administrator" : "Reader account"}
            </small>
          </div>
          <button
            aria-label="Sign out"
            className="icon-button"
            onClick={async () => {
              try {
                await api("/auth/logout", {});
                await refresh();
                navigate("/");
              } catch (e) {
                toast((e as Error).message);
              }
            }}
          >
            <LogOut size={18} />
          </button>
        </div>
      </aside>
      <div className="reader-main">{children}</div>
      <nav className="mobile-bottom" aria-label="Mobile reader navigation">
        {readerLinks.map(({ to, label, shortLabel, icon: Icon }) => (
          <NavLink key={to} to={to} aria-label={label}>
            <Icon size={20} />
            <span>{shortLabel}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export function Protected({
  children,
  admin = false,
}: {
  children: ReactNode;
  admin?: boolean;
}) {
  const { user } = useApp();
  if (!user) return <Navigate to="/login" replace />;
  if (admin && user.role !== "admin") {
    return (
      <div className="container section">
        <Empty title="Administrator access required">
          This page is available only to administrators.
        </Empty>
      </div>
    );
  }
  return <ReaderShell>{children}</ReaderShell>;
}


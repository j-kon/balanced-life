import { useEffect, useRef, type ReactNode } from "react";
import {
  Link,
  NavLink,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  Bell,
  BookOpen,
  Bookmark,
  CreditCard,
  LayoutDashboard,
  LogOut,
  MoreHorizontal,
  PenLine,
  ShoppingBag,
  Smartphone,
  UserCheck,
  X,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { PwaInstallBanner, ThemeSelector } from "../components/Common";
import { api } from "../api";

export const readerLinks = [
  {
    to: "/dashboard",
    label: "My journey",
    shortLabel: "Home",
    icon: LayoutDashboard,
  },
  {
    to: "/library",
    label: "Devotional library",
    shortLabel: "Read",
    icon: BookOpen,
  },
  {
    to: "/journal",
    label: "My Growth Journal",
    shortLabel: "Journal",
    icon: PenLine,
  },
  {
    to: "/saved",
    label: "Saved readings",
    shortLabel: "Saved",
    icon: Bookmark,
  },
  {
    to: "/notifications",
    label: "Notifications",
    shortLabel: "Alerts",
    icon: Bell,
  },
  {
    to: "/subscription",
    label: "My online access",
    shortLabel: "Access",
    icon: CreditCard,
  },
  {
    to: "/account",
    label: "Account & reminders",
    shortLabel: "Account",
    icon: UserCheck,
  },
];

export const mobileBottomLinks = [
  {
    to: "/dashboard",
    label: "My journey",
    shortLabel: "Home",
    icon: LayoutDashboard,
  },
  {
    to: "/library",
    label: "Devotional library",
    shortLabel: "Read",
    icon: BookOpen,
  },
  {
    to: "/journal",
    label: "My Growth Journal",
    shortLabel: "Journal",
    icon: PenLine,
  },
  {
    to: "/saved",
    label: "Saved readings",
    shortLabel: "Saved",
    icon: Bookmark,
  },
];

export function ReaderShell({ children }: { children: ReactNode }) {
  const { user, unreadNotificationsCount, refresh, toast } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const moreDialogRef = useRef<HTMLDialogElement | null>(null);
  const pointerDownOutsideRef = useRef(false);

  const openMoreDrawer = () => {
    const dlg = moreDialogRef.current;
    if (dlg && !dlg.open) {
      dlg.showModal();
    }
  };

  const closeMoreDrawer = () => {
    const dlg = moreDialogRef.current;
    if (dlg && dlg.open) {
      dlg.close();
    }
  };

  useEffect(() => {
    closeMoreDrawer();
  }, [location.pathname]);

  // Fallback click-outside dismiss for browsers lacking native dialog closedby="any"
  const isOutsideDialog = (e: React.PointerEvent<HTMLDialogElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return (
      e.clientX < rect.left ||
      e.clientX > rect.right ||
      e.clientY < rect.top ||
      e.clientY > rect.bottom
    );
  };

  const handleSignOut = async () => {
    closeMoreDrawer();
    try {
      await api("/auth/logout", {});
      navigate("/", { replace: true });
      await refresh();
    } catch (e) {
      toast((e as Error).message);
    }
  };

  return (
    <div className="reader-layout">
      <aside className="sidebar">
        <span className="eyebrow">Your quiet space</span>
        <nav aria-label="Reader navigation">
          {readerLinks.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to}>
              <Icon size={19} />
              <span>{label}</span>
              {to === "/notifications" && unreadNotificationsCount > 0 && (
                <span className="sidebar-badge">{unreadNotificationsCount}</span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-theme-box">
          <small>Appearance</small>
          <ThemeSelector variant="compact" />
        </div>

        <div className="sidebar-bottom">
          <span className="avatar">{user?.name[0] || "R"}</span>
          <div>
            <strong>{user?.name}</strong>
            <small>Reader account</small>
          </div>
          <button
            type="button"
            aria-label="Sign out"
            className="icon-button"
            onClick={handleSignOut}
          >
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      <div className="reader-main">
        <PwaInstallBanner />
        {children}
      </div>

      <nav className="mobile-bottom" aria-label="Mobile reader navigation">
        {mobileBottomLinks.map(({ to, label, shortLabel, icon: Icon }) => (
          <NavLink key={to} to={to} aria-label={label}>
            <Icon size={20} aria-hidden="true" />
            <span>{shortLabel}</span>
          </NavLink>
        ))}
        <button
          type="button"
          className="mobile-more-trigger"
          aria-label="More reader tools, notifications, and appearance"
          onClick={openMoreDrawer}
        >
          <MoreHorizontal size={20} aria-hidden="true" />
          <span>More</span>
          {unreadNotificationsCount > 0 && (
            <span className="mobile-more-dot" aria-hidden="true" />
          )}
        </button>
      </nav>

      <dialog
        ref={moreDialogRef}
        className="mobile-more-dialog"
        aria-labelledby="mobile-more-title"
        {...({ closedby: "any" } as Record<string, string>)}
        onPointerDown={(e) => {
          pointerDownOutsideRef.current = isOutsideDialog(e);
        }}
        onPointerUp={(e) => {
          if (pointerDownOutsideRef.current && isOutsideDialog(e)) {
            closeMoreDrawer();
          }
          pointerDownOutsideRef.current = false;
        }}
      >
        <div className="mobile-more-content">
          <div className="mobile-more-header">
            <div>
              <span className="eyebrow" style={{ marginBottom: "4px" }}>
                Reader Tools &amp; Preferences
              </span>
              <h2 id="mobile-more-title" style={{ fontSize: "1.3rem" }}>
                More options
              </h2>
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label="Close more options"
              onClick={closeMoreDrawer}
            >
              <X size={18} />
            </button>
          </div>

          <div className="stack" style={{ gap: "8px", marginBottom: "18px" }}>
            <small className="muted" style={{ padding: 0 }}>
              Appearance theme
            </small>
            <ThemeSelector variant="full" />
          </div>

          <div className="mobile-more-links">
            <Link to="/notifications" onClick={closeMoreDrawer}>
              <Bell size={18} />
              <span>Notification Center</span>
              {unreadNotificationsCount > 0 && (
                <span className="pill" style={{ marginLeft: "auto" }}>
                  {unreadNotificationsCount} unread
                </span>
              )}
            </Link>
            <Link to="/subscription" onClick={closeMoreDrawer}>
              <CreditCard size={18} />
              <span>My Online Access &amp; Orders</span>
            </Link>
            <Link to="/bookstore" onClick={closeMoreDrawer}>
              <ShoppingBag size={18} />
              <span>Order Printed Book (₦5,000)</span>
            </Link>
            <Link to="/account" onClick={closeMoreDrawer}>
              <UserCheck size={18} />
              <span>Account, Password &amp; Reminders</span>
            </Link>
            <Link to="/install" onClick={closeMoreDrawer}>
              <Smartphone size={18} />
              <span>Install App on Phone</span>
            </Link>
          </div>

          <div className="mobile-more-footer">
            <button
              type="button"
              className="button outline full"
              onClick={handleSignOut}
            >
              <LogOut size={16} /> Sign out
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}

export function Protected({ children }: { children: ReactNode }) {
  const { user } = useApp();
  const location = useLocation();
  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  return <ReaderShell>{children}</ReaderShell>;
}

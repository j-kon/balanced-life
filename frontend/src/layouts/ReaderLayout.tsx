import { useEffect, useRef, type ReactNode } from "react";
import {
  Link,
  NavLink,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  ArrowUpRight,
  Bell,
  BookOpen,
  Bookmark,
  CreditCard,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  Monitor,
  Moon,
  MoreHorizontal,
  Package,
  PenLine,
  ShoppingBag,
  Smartphone,
  Sun,
  UserCheck,
  X,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { useTheme } from "../context/ThemeContext";
import { Brand, PwaInstallBanner, ThemeSelector } from "../components/Common";
import { useVirtualKeyboardOpen } from "../hooks/useViewport";
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

function ReaderHeader() {
  const { unreadNotificationsCount } = useApp();
  const { preference, resolvedTheme, cyclePreference } = useTheme();

  const ThemeIcon =
    preference === "system" ? Monitor : preference === "dark" ? Moon : Sun;
  const themeButtonLabel =
    preference === "system"
      ? `Theme: System (${resolvedTheme}). Activate to switch.`
      : `Theme: ${preference}. Activate to switch.`;

  return (
    <header className="header reader-app-header">
      <div className="container header-inner">
        <Brand to="/dashboard" />

        <nav
          className="reader-desktop-links"
          aria-label="Additional reader links"
        >
          <NavLink to="/bookstore">Printed Book</NavLink>
          <NavLink to="/install">Install App</NavLink>
          <NavLink to="/contact">Contact</NavLink>
          <Link className="reader-site-link" to="/">
            Public site <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
        </nav>

        <div className="header-quick-actions">
          <button
            type="button"
            className="icon-button theme-quick-btn"
            aria-label={themeButtonLabel}
            onClick={cyclePreference}
          >
            <ThemeIcon size={18} aria-hidden="true" />
            <span className="sr-only">
              {preference === "system"
                ? `System theme (${resolvedTheme})`
                : `${preference} theme`}
            </span>
          </button>

          <Link
            to="/notifications"
            className="icon-button notif-bell-link"
            aria-label={
              unreadNotificationsCount > 0
                ? `Notifications (${unreadNotificationsCount} unread)`
                : "Notifications"
            }
          >
            <Bell size={18} aria-hidden="true" />
            {unreadNotificationsCount > 0 && (
              <span className="notif-badge" aria-hidden="true">
                {unreadNotificationsCount > 99
                  ? "99+"
                  : unreadNotificationsCount}
              </span>
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}

export function ReaderLayout({ children }: { children: ReactNode }) {
  const { user, unreadNotificationsCount, refresh, toast } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const keyboardOpen = useVirtualKeyboardOpen();
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
  }, [location.pathname, location.hash]);

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
    <div
      className={
        keyboardOpen
          ? "app-shell reader-shell keyboard-open"
          : "app-shell reader-shell"
      }
    >
      <ReaderHeader />

      <div className="reader-layout">
        <aside className="sidebar">
          <span className="eyebrow">Your quiet space</span>
          <nav className="sidebar-primary-nav" aria-label="Reader">
            {readerLinks.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to}>
                <Icon size={19} aria-hidden="true" />
                <span>{label}</span>
                {to === "/notifications" && unreadNotificationsCount > 0 && (
                  <span className="sidebar-badge">
                    {unreadNotificationsCount}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="sidebar-theme-box">
            <small>Appearance</small>
            <ThemeSelector variant="compact" />
          </div>

          <div className="sidebar-bottom">
            <span className="avatar" aria-hidden="true">
              {user?.name[0] || "R"}
            </span>
            <div style={{ minWidth: 0 }}>
              <strong>{user?.name}</strong>
              <small>Reader account</small>
            </div>
            <button
              type="button"
              aria-label="Sign out"
              className="icon-button"
              onClick={handleSignOut}
            >
              <LogOut size={18} aria-hidden="true" />
            </button>
          </div>

          <nav className="sidebar-legal" aria-label="Legal and support">
            <Link to="/contact">Contact</Link>
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
          </nav>
        </aside>

        <main id="main" className="reader-main">
          <PwaInstallBanner />
          {children}
        </main>
      </div>

      <nav className="mobile-bottom" aria-label="Mobile reader">
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
              <X size={18} aria-hidden="true" />
            </button>
          </div>

          <div className="stack" style={{ gap: "8px", marginBottom: "14px" }}>
            <small className="muted" style={{ padding: 0 }}>
              Appearance theme
            </small>
            <ThemeSelector variant="compact" />
          </div>

          <div className="mobile-more-links">
            <Link to="/subscription" onClick={closeMoreDrawer}>
              <CreditCard size={18} aria-hidden="true" />
              <span>My Online Access</span>
            </Link>
            <Link to="/subscription#orders" onClick={closeMoreDrawer}>
              <Package size={18} aria-hidden="true" />
              <span>My Orders</span>
            </Link>
            <Link to="/bookstore" onClick={closeMoreDrawer}>
              <ShoppingBag size={18} aria-hidden="true" />
              <span>Order Printed Book (₦5,000)</span>
            </Link>
            <Link to="/notifications" onClick={closeMoreDrawer}>
              <Bell size={18} aria-hidden="true" />
              <span>Notifications</span>
              {unreadNotificationsCount > 0 && (
                <span className="pill" style={{ marginLeft: "auto" }}>
                  {unreadNotificationsCount} unread
                </span>
              )}
            </Link>
            <Link to="/account" onClick={closeMoreDrawer}>
              <UserCheck size={18} aria-hidden="true" />
              <span>Account &amp; Reminder Settings</span>
            </Link>
            <Link to="/install" onClick={closeMoreDrawer}>
              <Smartphone size={18} aria-hidden="true" />
              <span>Install App</span>
            </Link>
            <Link to="/contact" onClick={closeMoreDrawer}>
              <HelpCircle size={18} aria-hidden="true" />
              <span>Contact &amp; Help</span>
            </Link>
          </div>

          <div className="mobile-more-legal-row">
            <Link to="/privacy" onClick={closeMoreDrawer}>
              Privacy Policy
            </Link>
            <span aria-hidden="true">·</span>
            <Link to="/terms" onClick={closeMoreDrawer}>
              Terms of Use
            </Link>
          </div>

          <div className="mobile-more-footer">
            <button
              type="button"
              className="button outline full"
              onClick={handleSignOut}
            >
              <LogOut size={16} aria-hidden="true" /> Sign out
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}

export const ReaderShell = ReaderLayout;

export function Protected({ children }: { children: ReactNode }) {
  const { user } = useApp();
  const location = useLocation();
  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  return <ReaderLayout>{children}</ReaderLayout>;
}

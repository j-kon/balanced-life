import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowUpRight,
  Bell,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Sun,
  X,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { useTheme } from "../context/ThemeContext";
import { Brand } from "../components/Common";
import {
  useIsCompactViewport,
  useIsStandalonePwa,
} from "../hooks/useViewport";
import { api } from "../api";

export function Header() {
  const { user, unreadNotificationsCount, refresh, toast } = useApp();
  const { preference, resolvedTheme, cyclePreference } = useTheme();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location]);

  const ThemeIcon =
    preference === "system" ? Monitor : preference === "dark" ? Moon : Sun;
  const themeButtonLabel =
    preference === "system"
      ? `Theme: System (${resolvedTheme}). Activate to switch.`
      : `Theme: ${preference}. Activate to switch.`;

  const handleSignOut = async () => {
    setOpen(false);
    try {
      await api("/auth/logout", {});
      await refresh();
      navigate("/");
    } catch (error) {
      toast((error as Error).message);
    }
  };

  return (
    <header className="header public-header">
      <div className="container header-inner">
        <Brand />
        <nav
          className={open ? "public-nav open" : "public-nav"}
          aria-label="Primary"
        >
          <NavLink to="/about">The devotional</NavLink>
          <NavLink to="/about-author">The author</NavLink>
          <NavLink to="/library">Library</NavLink>
          <NavLink to="/pricing">Get access</NavLink>
          <NavLink to="/bookstore">Printed Book</NavLink>
          <NavLink to="/install">Install App</NavLink>
          <NavLink to="/contact">Contact</NavLink>
          <div className="mobile-nav-legal">
            <NavLink to="/privacy">Privacy policy</NavLink>
            <NavLink to="/terms">Terms of use</NavLink>
          </div>
          <div className="public-nav-mobile-actions">
            {!user ? (
              <>
                <NavLink className="button outline small" to="/register">
                  Register
                </NavLink>
                <Link className="button small" to="/login">
                  Sign in <ArrowUpRight size={15} aria-hidden="true" />
                </Link>
              </>
            ) : (
              <>
                <Link className="button small" to="/dashboard">
                  My journey <ArrowUpRight size={15} aria-hidden="true" />
                </Link>
                <button
                  type="button"
                  className="button outline small"
                  onClick={handleSignOut}
                >
                  <LogOut size={16} aria-hidden="true" />
                  <span>Sign out</span>
                </button>
              </>
            )}
          </div>
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

          {user ? (
            <>
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
              <div className="header-desktop-auth">
                <Link className="button small" to="/dashboard">
                  My journey
                  <ArrowUpRight size={15} aria-hidden="true" />
                </Link>
                <button
                  type="button"
                  className="button outline small header-signout-btn"
                  onClick={handleSignOut}
                >
                  <LogOut size={15} aria-hidden="true" />
                  <span>Sign out</span>
                </button>
              </div>
            </>
          ) : (
            <div className="header-desktop-auth">
              <NavLink className="header-register-link" to="/register">
                Register
              </NavLink>
              <Link className="button small" to="/login">
                Sign in <ArrowUpRight size={15} aria-hidden="true" />
              </Link>
            </div>
          )}

          <button
            type="button"
            className="icon-button menu-toggle"
            aria-label="Toggle site menu"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </button>
        </div>
      </div>
    </header>
  );
}

export function Footer() {
  const { config } = useApp();
  return (
    <footer className="marketing-footer">
      <div className="container footer-inner">
        <div className="footer-brand-block">
          <Brand />
          <p className="footer-brand-statement">
            <strong>{config.settings.brandStatement}</strong>
          </p>
          <p className="footer-tagline">{config.settings.siteTagline}</p>
        </div>

        <nav className="footer-nav-col" aria-label="Footer">
          <span className="footer-col-title">Explore</span>
          <div className="footer-links">
            <Link to="/about">About the devotional</Link>
            <Link to="/about-author">About the author</Link>
            <Link to="/themes">2027 themes</Link>
            <Link to="/digital-edition">Online access · ₦3,500</Link>
            <Link to="/bookstore">Printed Book · ₦5,000</Link>
            <Link to="/install">Install the app</Link>
            <Link to="/contact">Contact</Link>
            <Link to="/privacy">Privacy policy</Link>
            <Link to="/terms">Terms of use</Link>
          </div>
        </nav>

        <div className="footer-contact-block">
          <span className="footer-col-title">Cossy Teens Consult</span>
          <p className="footer-copyright">
            © 2027 {config.settings.organizationName} ·{" "}
            {config.settings.authorName}
          </p>
          <p className="footer-contact-meta">
            <span>{config.settings.contactEmail}</span>
            <span>
              {config.settings.contactPhone}
              {config.settings.contactSecondaryPhone
                ? ` · ${config.settings.contactSecondaryPhone}`
                : ""}
            </span>
            <span>
              {config.settings.contactAddress} ·{" "}
              {config.settings.contactWebsite}
            </span>
          </p>
        </div>
      </div>
    </footer>
  );
}

export function PublicLayout({ children }: { children: ReactNode }) {
  const isStandalone = useIsStandalonePwa();
  const isCompact = useIsCompactViewport();
  const showFooter = !isStandalone && !isCompact;

  return (
    <div className="app-shell public-shell">
      <Header />
      <main id="main" className="app-main">
        {children}
      </main>
      {showFooter && <Footer />}
    </div>
  );
}

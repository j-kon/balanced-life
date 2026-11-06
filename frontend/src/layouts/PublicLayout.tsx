import { useEffect, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { ArrowUpRight, LogOut, Menu, X } from "lucide-react";
import { useApp } from "../context/AppContext";
import { Brand } from "../components/Common";
import { api } from "../api";

export function Header() {
  const { user, refresh, toast } = useApp();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location]);

  return (
    <header className="header">
      <div className="container header-inner">
        <Brand />
        <nav
          className={open ? "public-nav open" : "public-nav"}
          aria-label="Main navigation"
        >
          <NavLink to="/about">The devotional</NavLink>
          <NavLink to="/about-author">The author</NavLink>
          <NavLink to="/themes">Monthly themes</NavLink>
          <NavLink to="/library">Library</NavLink>
          <NavLink to="/pricing">Membership</NavLink>
          <NavLink to="/bookstore">Hardcover</NavLink>
          <NavLink to="/contact">Contact</NavLink>
          {user?.role === "admin" && (
            <NavLink to="/admin">Author's desk</NavLink>
          )}
          <Link className="button small" to={user ? "/dashboard" : "/login"}>
            {user ? "My journey" : "Sign in"}
            <ArrowUpRight size={15} />
          </Link>
          {user && (
            <button
              className="icon-button"
              aria-label="Sign out of account"
              onClick={async () => {
                try {
                  await api("/auth/logout", {});
                  await refresh();
                  navigate("/");
                } catch (error) {
                  toast((error as Error).message);
                }
              }}
            >
              <LogOut size={18} />
              <span className="mobile-signout-label">Sign out</span>
            </button>
          )}
        </nav>
        <button
          className="icon-button menu-toggle"
          aria-label="Toggle navigation"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? <X /> : <Menu />}
        </button>
      </div>
    </header>
  );
}

export function Footer() {
  const { config } = useApp();
  return (
    <footer>
      <div className="container footer-inner">
        <div>
          <Brand />
          <p className="footer-tagline">{config.settings.siteTagline}</p>
        </div>
        <div className="footer-links">
          <Link to="/about">About the devotional</Link>
          <Link to="/about-author">About the author</Link>
          <Link to="/themes">2027 themes</Link>
          <Link to="/pricing">Membership</Link>
          <Link to="/bookstore">Hardcover book</Link>
          <Link to="/contact">Contact</Link>
          <Link to="/privacy">Privacy policy</Link>
          <Link to="/terms">Terms of use</Link>
        </div>
        <small>
          © 2027 {config.settings.organizationName} · {config.settings.authorName}
        </small>
      </div>
    </footer>
  );
}


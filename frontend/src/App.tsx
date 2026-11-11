import { useEffect, useState, type ReactNode } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { CheckCircle2, ChevronRight, X } from "lucide-react";
import { api } from "./api";
import type { AppConfig, ReaderAccessSummary, User } from "./types";
import {
  AppContext,
  defaultConfig,
  defaultGuestAccess,
  useApp,
} from "./context/AppContext";
import { ThemeProvider } from "./context/ThemeContext";
import {
  useIsCompactViewport,
  useIsStandalonePwa,
} from "./hooks/useViewport";
import { ErrorBox, Loading } from "./components/Common";
import { PublicLayout } from "./layouts/PublicLayout";
import { Protected, ReaderLayout } from "./layouts/ReaderLayout";
import { HomePage } from "./pages/public/HomePage";
import {
  AboutAuthorPage,
  AboutDevotionalPage,
  ThemesPage,
} from "./pages/public/AboutPages";
import {
  BookstorePage,
  ContactPage,
  DigitalEditionPage,
  PricingPage,
} from "./pages/public/CommercePages";
import {
  AuthPage,
  ForgotPasswordPage,
  ResetPasswordPage,
} from "./pages/public/AuthPages";
import {
  InstallPage,
  PrivacyPage,
  TermsPage,
} from "./pages/public/LegalPages";
import { DashboardPage } from "./pages/reader/DashboardPage";
import { LibraryPage } from "./pages/reader/LibraryPage";
import { ReadingPage, SamplePage } from "./pages/reader/ReadingPage";
import { JournalPage } from "./pages/reader/JournalPage";
import { SubscriptionPage } from "./pages/reader/SubscriptionPage";
import { AccountPage } from "./pages/reader/AccountPage";
import { NotificationsCenterPage } from "./pages/reader/NotificationsPage";

function RouteScroll() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      const target = document.getElementById(hash.slice(1));
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
    }
    window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

/**
 * Keeps authenticated mobile & standalone PWA readers inside the app shell when they open
 * commerce, installation, support, or legal screens from the More menu, while preserving
 * normal PublicLayout for logged-out visitors and desktop browsing.
 */
function ContextualAppOrPublicPage({ children }: { children: ReactNode }) {
  const { user } = useApp();
  const isStandalone = useIsStandalonePwa();
  const isCompact = useIsCompactViewport();

  if (user && (isStandalone || isCompact)) {
    return (
      <ReaderLayout>
        <div className="reader-embedded-page">{children}</div>
      </ReaderLayout>
    );
  }
  return <PublicLayout>{children}</PublicLayout>;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [access, setAccess] = useState<ReaderAccessSummary>(defaultGuestAccess);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);
  const [ready, setReady] = useState(false);
  const [startupError, setStartupError] = useState("");
  const [config, setConfig] = useState<AppConfig>(defaultConfig);
  const [message, setMessage] = useState("");
  const [toastPaused, setToastPaused] = useState(false);

  const refresh = async () => {
    const u = await api<{
      user: User | null;
      access?: ReaderAccessSummary;
      unreadNotificationsCount?: number;
    }>("/auth/me");
    setUser(u.user);
    setAccess(u.access || defaultGuestAccess);
    setUnreadNotificationsCount(u.unreadNotificationsCount || 0);
    return u.user;
  };

  const refreshConfig = async () => {
    const cfg = await api<AppConfig>("/config");
    setConfig(cfg);
  };

  useEffect(() => {
    Promise.all([refresh(), refreshConfig()])
      .catch((e) => setStartupError((e as Error).message))
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!message || toastPaused) return;
    const timer = setTimeout(() => setMessage(""), 5000);
    return () => clearTimeout(timer);
  }, [message, toastPaused]);

  return (
    <ThemeProvider>
      <AppContext.Provider
        value={{
          user,
          access,
          unreadNotificationsCount,
          refresh,
          refreshConfig,
          config,
          toast: setMessage,
        }}
      >
        <RouteScroll />
        {startupError ? (
          <PublicLayout>
            <div className="container section">
              <ErrorBox
                message={
                  "Cannot connect to the API server. Ensure npm run dev is running and reload. " +
                  startupError
                }
              />
              <button
                className="button"
                onClick={() => window.location.reload()}
              >
                Try again
              </button>
            </div>
          </PublicLayout>
        ) : !ready ? (
          <PublicLayout>
            <div className="container section">
              <Loading />
            </div>
          </PublicLayout>
        ) : (
          <Routes>
            <Route
              path="/"
              element={
                <PublicLayout>
                  <HomePage />
                </PublicLayout>
              }
            />
            <Route
              path="/about"
              element={
                <PublicLayout>
                  <AboutDevotionalPage />
                </PublicLayout>
              }
            />
            <Route
              path="/about-author"
              element={
                <PublicLayout>
                  <AboutAuthorPage />
                </PublicLayout>
              }
            />
            <Route
              path="/themes"
              element={
                <PublicLayout>
                  <ThemesPage />
                </PublicLayout>
              }
            />
            <Route
              path="/pricing"
              element={
                <PublicLayout>
                  <PricingPage />
                </PublicLayout>
              }
            />
            <Route
              path="/digital-edition"
              element={
                <ContextualAppOrPublicPage>
                  <DigitalEditionPage />
                </ContextualAppOrPublicPage>
              }
            />
            <Route
              path="/bookstore"
              element={
                <ContextualAppOrPublicPage>
                  <BookstorePage />
                </ContextualAppOrPublicPage>
              }
            />
            <Route
              path="/bulk-orders"
              element={<Navigate to="/contact" replace />}
            />
            <Route
              path="/contact"
              element={
                <ContextualAppOrPublicPage>
                  <ContactPage />
                </ContextualAppOrPublicPage>
              }
            />
            <Route
              path="/install"
              element={
                <ContextualAppOrPublicPage>
                  <InstallPage />
                </ContextualAppOrPublicPage>
              }
            />
            <Route
              path="/privacy"
              element={
                <ContextualAppOrPublicPage>
                  <PrivacyPage />
                </ContextualAppOrPublicPage>
              }
            />
            <Route
              path="/terms"
              element={
                <ContextualAppOrPublicPage>
                  <TermsPage />
                </ContextualAppOrPublicPage>
              }
            />
            <Route
              path="/login"
              element={
                <PublicLayout>
                  <AuthPage />
                </PublicLayout>
              }
            />
            <Route
              path="/register"
              element={
                <PublicLayout>
                  <AuthPage register />
                </PublicLayout>
              }
            />
            <Route
              path="/forgot-password"
              element={
                <PublicLayout>
                  <ForgotPasswordPage />
                </PublicLayout>
              }
            />
            <Route
              path="/reset-password"
              element={
                <PublicLayout>
                  <ResetPasswordPage />
                </PublicLayout>
              }
            />
            <Route
              path="/sample"
              element={
                user ? (
                  <ReaderLayout>
                    <SamplePage />
                  </ReaderLayout>
                ) : (
                  <PublicLayout>
                    <SamplePage />
                  </PublicLayout>
                )
              }
            />
            <Route
              path="/library"
              element={
                user ? (
                  <ReaderLayout>
                    <LibraryPage />
                  </ReaderLayout>
                ) : (
                  <PublicLayout>
                    <div className="container section">
                      <LibraryPage />
                    </div>
                  </PublicLayout>
                )
              }
            />
            <Route
              path="/read/:id"
              element={
                user ? (
                  <ReaderLayout>
                    <ReadingPage />
                  </ReaderLayout>
                ) : (
                  <PublicLayout>
                    <div className="container section">
                      <ReadingPage />
                    </div>
                  </PublicLayout>
                )
              }
            />
            <Route
              path="/dashboard"
              element={
                <Protected>
                  <DashboardPage />
                </Protected>
              }
            />
            <Route
              path="/saved"
              element={
                <Protected>
                  <LibraryPage saved />
                </Protected>
              }
            />
            <Route
              path="/journal"
              element={
                <Protected>
                  <JournalPage />
                </Protected>
              }
            />
            <Route
              path="/subscription"
              element={
                <Protected>
                  <SubscriptionPage />
                </Protected>
              }
            />
            <Route
              path="/checkout/:id"
              element={
                <Protected>
                  <Navigate to="/digital-edition" replace />
                </Protected>
              }
            />
            <Route
              path="/account"
              element={
                <Protected>
                  <AccountPage />
                </Protected>
              }
            />
            <Route
              path="/notifications"
              element={
                <Protected>
                  <NotificationsCenterPage />
                </Protected>
              }
            />
            <Route
              path="*"
              element={
                <PublicLayout>
                  <div className="container section">
                    <h1>This page has turned.</h1>
                    <Link className="button" to="/">
                      Back to home <ChevronRight size={16} />
                    </Link>
                  </div>
                </PublicLayout>
              }
            />
          </Routes>
        )}

        <div
          className="toast-region"
          role="region"
          aria-label="Status notifications"
          aria-live="polite"
        >
          {message && (
            <div
              className="toast"
              role="status"
              onMouseEnter={() => setToastPaused(true)}
              onMouseLeave={() => setToastPaused(false)}
              onFocus={() => setToastPaused(true)}
              onBlur={() => setToastPaused(false)}
            >
              <CheckCircle2 size={18} aria-hidden="true" />
              <span className="toast-text">{message}</span>
              <button
                type="button"
                className="icon-button toast-dismiss"
                aria-label="Dismiss notification"
                onClick={() => {
                  setToastPaused(false);
                  setMessage("");
                }}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      </AppContext.Provider>
    </ThemeProvider>
  );
}

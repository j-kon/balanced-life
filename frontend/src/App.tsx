import { useEffect, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { CheckCircle2, ChevronRight, X } from "lucide-react";
import { api } from "./api";
import type { AppConfig, User } from "./types";
import { AppContext, defaultConfig } from "./context/AppContext";
import { ErrorBox, Loading } from "./components/Common";
import { Footer, Header } from "./layouts/PublicLayout";
import { Protected, ReaderShell } from "./layouts/ReaderLayout";
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
import { PrivacyPage, TermsPage } from "./pages/public/LegalPages";
import { DashboardPage } from "./pages/reader/DashboardPage";
import { LibraryPage } from "./pages/reader/LibraryPage";
import { ReadingPage, SamplePage } from "./pages/reader/ReadingPage";
import { JournalPage } from "./pages/reader/JournalPage";
import {
  SubscriptionPage,
} from "./pages/reader/SubscriptionPage";
import { AccountPage } from "./pages/reader/AccountPage";
import { AdminPage } from "./pages/admin/AdminPage";

function RouteScroll() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [startupError, setStartupError] = useState("");
  const [config, setConfig] = useState<AppConfig>(defaultConfig);
  const [message, setMessage] = useState("");

  const refresh = async () => {
    const u = await api<{ user: User | null }>("/auth/me");
    setUser(u.user);
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
    if (message) {
      const timer = setTimeout(() => setMessage(""), 5000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  return (
    <AppContext.Provider
      value={{ user, refresh, refreshConfig, config, toast: setMessage }}
    >
      <RouteScroll />
      <Header />
      <main id="main">
        {startupError ? (
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
        ) : !ready ? (
          <div className="container section">
            <Loading />
          </div>
        ) : (
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/about" element={<AboutDevotionalPage />} />
            <Route path="/about-author" element={<AboutAuthorPage />} />
            <Route path="/themes" element={<ThemesPage />} />
            <Route path="/pricing" element={<PricingPage />} />
            <Route path="/digital-edition" element={<DigitalEditionPage />} />
            <Route path="/bookstore" element={<BookstorePage />} />
            <Route path="/bulk-orders" element={<Navigate to="/contact" replace />} />
            <Route path="/contact" element={<ContactPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/login" element={<AuthPage />} />
            <Route path="/register" element={<AuthPage register />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/sample" element={<SamplePage />} />
            <Route
              path="/library"
              element={
                user ? (
                  <ReaderShell>
                    <LibraryPage />
                  </ReaderShell>
                ) : (
                  <div className="container section">
                    <LibraryPage />
                  </div>
                )
              }
            />
            <Route
              path="/read/:id"
              element={
                user ? (
                  <ReaderShell>
                    <ReadingPage />
                  </ReaderShell>
                ) : (
                  <div className="container section">
                    <ReadingPage />
                  </div>
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
              path="/admin"
              element={
                <Protected admin>
                  <AdminPage />
                </Protected>
              }
            />
            <Route
              path="*"
              element={
                <div className="container section">
                  <h1>This page has turned.</h1>
                  <Link className="button" to="/">
                    Back to home <ChevronRight size={16} />
                  </Link>
                </div>
              }
            />
          </Routes>
        )}
      </main>
      <Footer />
      {message && (
        <div className="toast" role="status">
          <CheckCircle2 size={19} />
          {message}
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setMessage("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </AppContext.Provider>
  );
}

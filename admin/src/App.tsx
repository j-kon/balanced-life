import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { CheckCircle2, X } from "lucide-react";
import { api } from "./api";
import {
  AdminAuthContext,
  useAdminAuth,
  type AdminAuthMeResponse,
} from "./context/AdminAuthContext";
import { Empty, ErrorBox, Loading } from "./components/Common";
import { useData } from "./hooks/useData";
import { AdminShell, SECTION_TO_PATH } from "./layouts/AdminShell";
import {
  AdminForgotPasswordPage,
  AdminLoginPage,
  AdminMfaChallengePage,
  AdminMfaEnrollPage,
  AdminResetPasswordPage,
} from "./pages/AdminAuthPages";
import type { AdminOverviewData, AdminSectionId } from "./pages/AdminTypes";
import type { AdminPermission } from "./types";
import { DashboardOverview } from "./pages/DashboardOverview";
import { DigitalOrdersPage } from "./pages/DigitalOrdersPage";
import { PrintedOrdersPage } from "./pages/PrintedOrdersPage";
import { ReadersPage } from "./pages/ReadersPage";
import { DevotionalsPage } from "./pages/DevotionalsPage";
import { BulkOrdersPage } from "./pages/BulkOrdersPage";
import { PaymentsPage } from "./pages/PaymentsPage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { ActivitySecurityPage } from "./pages/ActivitySecurityPage";

function AdminWorkspace({ section }: { section: AdminSectionId }) {
  const { hasPermission, toast } = useAdminAuth();
  const navigate = useNavigate();
  const { data, error, reload } = useData<AdminOverviewData>("/admin/overview");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");

  async function save(path: string, body: unknown, method = "PATCH") {
    setBusy(true);
    setFormError("");
    try {
      await api(path, body, method);
      reload();
      toast("Changes saved.");
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const onNavigate = (target: AdminSectionId) => {
    setFormError("");
    navigate(SECTION_TO_PATH[target] || "/dashboard");
  };

  const alertCount =
    data?.operationalAlerts?.length ??
    data?.metrics?.activeAlertsCount ??
    0;

  return (
    <AdminShell
      organizationName={data?.settings?.organizationName}
      alertCount={alertCount}
    >
      {section === "Activity & Security" ? (
        <ActivitySecurityPage />
      ) : (
        <>
          <ErrorBox message={error || formError} />
          {!data && !error ? (
            <Loading />
          ) : (
            data && (
              <>
                {section === "Overview" && (
                  <DashboardOverview data={data} onNavigate={onNavigate} />
                )}
                {section === "Online Access" &&
                  (hasPermission("digital_orders.read") ? (
                    <DigitalOrdersPage data={data} busy={busy} save={save} />
                  ) : (
                    <PermissionDenied />
                  ))}
                {section === "Printed Orders" &&
                  (hasPermission("printed_orders.read") ? (
                    <PrintedOrdersPage data={data} busy={busy} save={save} />
                  ) : (
                    <PermissionDenied />
                  ))}
                {section === "Readers" &&
                  (hasPermission("readers.read") ? (
                    <ReadersPage data={data} busy={busy} save={save} />
                  ) : (
                    <PermissionDenied />
                  ))}
                {section === "Devotionals" &&
                  (hasPermission("devotionals.read") ? (
                    <DevotionalsPage
                      data={data}
                      busy={busy}
                      formError={formError}
                      setFormError={setFormError}
                      save={save}
                    />
                  ) : (
                    <PermissionDenied />
                  ))}
                {section === "Bulk Orders" &&
                  (hasPermission("bulk_orders.read") ? (
                    <BulkOrdersPage data={data} busy={busy} save={save} />
                  ) : (
                    <PermissionDenied />
                  ))}
                {section === "Payments" &&
                  (hasPermission("payments.read") ? (
                    <PaymentsPage data={data} busy={busy} save={save} />
                  ) : (
                    <PermissionDenied />
                  ))}
                {section === "Notifications" &&
                  (hasPermission("notifications.read") ? (
                    <NotificationsPage
                      data={data}
                      busy={busy}
                      save={save}
                      onNavigate={onNavigate}
                    />
                  ) : (
                    <PermissionDenied />
                  ))}
                {section === "Settings" &&
                  (hasPermission("settings.read") ? (
                    <SettingsPage data={data} busy={busy} save={save} />
                  ) : (
                    <PermissionDenied />
                  ))}
              </>
            )
          )}
        </>
      )}
    </AdminShell>
  );
}

function PermissionDenied() {
  return (
    <Empty title="Access restricted">
      Your administrator role does not include permission for this operational
      section. Contact the portal owner if access is required.
    </Empty>
  );
}

function RequireVerifiedAdmin({
  children,
}: {
  children: ReactNode;
}) {
  const { admin, mfaEnrollmentRequired, mfaChallengeRequired } =
    useAdminAuth();
  if (!admin) return <Navigate to="/login" replace />;
  if (mfaEnrollmentRequired || !admin.mfaEnabled) {
    return <Navigate to="/mfa-setup" replace />;
  }
  if (mfaChallengeRequired || !admin.mfaVerified) {
    return <Navigate to="/mfa-verify" replace />;
  }
  return <>{children}</>;
}

function RequirePendingAdmin({
  mode,
  children,
}: {
  mode: "enroll" | "verify";
  children: ReactNode;
}) {
  const { admin, mfaEnrollmentRequired, mfaChallengeRequired } =
    useAdminAuth();
  if (!admin) return <Navigate to="/login" replace />;
  if (admin.mfaEnabled && admin.mfaVerified) {
    return <Navigate to="/dashboard" replace />;
  }
  if (mode === "enroll" && admin.mfaEnabled) {
    return <Navigate to="/mfa-verify" replace />;
  }
  if (mode === "verify" && (mfaEnrollmentRequired || !admin.mfaEnabled)) {
    return <Navigate to="/mfa-setup" replace />;
  }
  if (mode === "verify" && !mfaChallengeRequired && admin.mfaVerified) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}

function RootRedirect() {
  const { admin, mfaEnrollmentRequired, mfaChallengeRequired } =
    useAdminAuth();
  if (!admin) return <Navigate to="/login" replace />;
  if (mfaEnrollmentRequired || !admin.mfaEnabled) {
    return <Navigate to="/mfa-setup" replace />;
  }
  if (mfaChallengeRequired || !admin.mfaVerified) {
    return <Navigate to="/mfa-verify" replace />;
  }
  return <Navigate to="/dashboard" replace />;
}

export default function App() {
  const [authState, setAuthState] = useState<AdminAuthMeResponse | null>(null);
  const [bootError, setBootError] = useState("");
  const [notice, setNotice] = useState("");

  const toast = (message: string) => {
    setNotice(message);
    window.setTimeout(
      () => setNotice((current) => (current === message ? "" : current)),
      3800,
    );
  };

  const refresh = useCallback(async () => {
    try {
      const me = await api<AdminAuthMeResponse>("/admin/auth/me");
      setAuthState(me);
      setBootError("");
      return me;
    } catch (err) {
      setBootError((err as Error).message);
      return null;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api("/admin/auth/logout", {});
    } catch {
      // Clear local state regardless
    } finally {
      setAuthState((prev) => ({
        admin: null,
        mfaEnrollmentRequired: false,
        mfaChallengeRequired: false,
        unusedRecoveryCodesCount: 0,
        idleTimeoutMinutes: prev?.idleTimeoutMinutes || 30,
      }));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const admin = authState?.admin ?? null;
  const hasPermission = (permission: AdminPermission) =>
    Boolean(admin?.mfaVerified && admin.permissions.includes(permission));

  if (bootError) {
    return (
      <div className="container section">
        <ErrorBox message={bootError} />
      </div>
    );
  }

  if (!authState) {
    return (
      <div className="container section">
        <Loading />
      </div>
    );
  }

  return (
    <AdminAuthContext.Provider
      value={{
        admin,
        mfaEnrollmentRequired: authState.mfaEnrollmentRequired,
        mfaChallengeRequired: authState.mfaChallengeRequired,
        unusedRecoveryCodesCount: authState.unusedRecoveryCodesCount,
        idleTimeoutMinutes: authState.idleTimeoutMinutes,
        refresh,
        logout,
        toast,
        hasPermission,
      }}
    >
      {notice && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          <span>{notice}</span>
          <button
            type="button"
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <X size={16} />
          </button>
        </div>
      )}

      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route
          path="/login"
          element={
            admin?.mfaVerified ? (
              <Navigate to="/dashboard" replace />
            ) : (
              <AdminLoginPage />
            )
          }
        />
        <Route path="/forgot-password" element={<AdminForgotPasswordPage />} />
        <Route path="/reset-password" element={<AdminResetPasswordPage />} />
        <Route
          path="/mfa-setup"
          element={
            <RequirePendingAdmin mode="enroll">
              <AdminMfaEnrollPage />
            </RequirePendingAdmin>
          }
        />
        <Route
          path="/mfa-verify"
          element={
            <RequirePendingAdmin mode="verify">
              <AdminMfaChallengePage />
            </RequirePendingAdmin>
          }
        />

        <Route
          path="/dashboard"
          element={
            <RequireVerifiedAdmin>
              <AdminWorkspace section="Overview" />
            </RequireVerifiedAdmin>
          }
        />
        <Route
          path="/online-access"
          element={
            <RequireVerifiedAdmin>
              <AdminWorkspace section="Online Access" />
            </RequireVerifiedAdmin>
          }
        />
        <Route
          path="/printed-orders"
          element={
            <RequireVerifiedAdmin>
              <AdminWorkspace section="Printed Orders" />
            </RequireVerifiedAdmin>
          }
        />
        <Route
          path="/readers"
          element={
            <RequireVerifiedAdmin>
              <AdminWorkspace section="Readers" />
            </RequireVerifiedAdmin>
          }
        />
        <Route
          path="/devotionals"
          element={
            <RequireVerifiedAdmin>
              <AdminWorkspace section="Devotionals" />
            </RequireVerifiedAdmin>
          }
        />
        <Route
          path="/bulk-orders"
          element={
            <RequireVerifiedAdmin>
              <AdminWorkspace section="Bulk Orders" />
            </RequireVerifiedAdmin>
          }
        />
        <Route
          path="/payments"
          element={
            <RequireVerifiedAdmin>
              <AdminWorkspace section="Payments" />
            </RequireVerifiedAdmin>
          }
        />
        <Route
          path="/notifications"
          element={
            <RequireVerifiedAdmin>
              <AdminWorkspace section="Notifications" />
            </RequireVerifiedAdmin>
          }
        />
        <Route
          path="/activity"
          element={
            <RequireVerifiedAdmin>
              <AdminWorkspace section="Activity & Security" />
            </RequireVerifiedAdmin>
          }
        />
        <Route
          path="/settings"
          element={
            <RequireVerifiedAdmin>
              <AdminWorkspace section="Settings" />
            </RequireVerifiedAdmin>
          }
        />

        <Route path="*" element={<RootRedirect />} />
      </Routes>
    </AdminAuthContext.Provider>
  );
}


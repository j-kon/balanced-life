import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Copy,
  KeyRound,
  LogOut,
  Search,
  Shield,
  UserPlus,
  Users,
} from "lucide-react";
import { api } from "../api";
import { Empty, ErrorBox, Loading } from "../components/Common";
import { useAdminAuth } from "../context/AdminAuthContext";
import { generateQrSvgMarkup } from "../utils/qr";
import type {
  AdminAuditItem,
  AdminRole,
  AdminSessionRecord,
  StaffAdminRecord,
} from "../types";

const ROLE_LABELS: Record<AdminRole, string> = {
  owner: "Owner (Full Access)",
  content_editor: "Content Editor",
  orders_manager: "Orders Manager",
  finance_manager: "Finance Manager",
};

type ActivityResponse = {
  items: AdminAuditItem[];
  total: number;
  page: number;
  totalPages: number;
  entityTypes: string[];
};

type StaffResponse = {
  staff: StaffAdminRecord[];
  pendingLegacyAdmins: Array<{
    id: number;
    name: string;
    email: string;
    legacyAdminStatus: string;
  }>;
};

export function ActivitySecurityPage() {
  const { admin, unusedRecoveryCodesCount, refresh, toast, hasPermission } =
    useAdminAuth();
  const navigate = useNavigate();
  const canAudit = hasPermission("audit.read");
  const isOwner = admin?.role === "owner";

  // Security & Sessions state
  const [sessions, setSessions] = useState<AdminSessionRecord[]>([]);
  const [pwdBusy, setPwdBusy] = useState(false);
  const [pwdError, setPwdError] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [regenPassword, setRegenPassword] = useState("");
  const [newRecoveryCodes, setNewRecoveryCodes] = useState<string[] | null>(
    null,
  );
  const [rotatePassword, setRotatePassword] = useState("");
  const [rotateSetup, setRotateSetup] = useState<{
    otpauthUri: string;
    manualEntryKey: string;
  } | null>(null);
  const [rotateOtp, setRotateOtp] = useState("");

  // Audit Activity state
  const [auditData, setAuditData] = useState<ActivityResponse | null>(null);
  const [auditSearch, setAuditSearch] = useState("");
  const [auditEntity, setAuditEntity] = useState("all");
  const [auditPage, setAuditPage] = useState(1);
  const [auditError, setAuditError] = useState("");

  // Staff state (owner only)
  const [staffData, setStaffData] = useState<StaffResponse | null>(null);
  const [staffError, setStaffError] = useState("");
  const [staffBusy, setStaffBusy] = useState(false);
  const [newStaff, setNewStaff] = useState({
    name: "",
    email: "",
    role: "content_editor" as AdminRole,
    password: "",
  });

  const loadSessions = useCallback(async () => {
    try {
      const res = await api<{ sessions: AdminSessionRecord[] }>(
        "/admin/auth/sessions",
      );
      setSessions(res.sessions);
    } catch {
      // ignore transient errors
    }
  }, []);

  const loadAudit = useCallback(async () => {
    if (!canAudit) return;
    try {
      setAuditError("");
      const params = new URLSearchParams({
        page: String(auditPage),
        limit: "25",
      });
      if (auditSearch.trim()) params.set("search", auditSearch.trim());
      if (auditEntity !== "all") params.set("entityType", auditEntity);
      const res = await api<ActivityResponse>(
        `/admin/activity?${params.toString()}`,
      );
      setAuditData(res);
    } catch (e) {
      setAuditError((e as Error).message);
    }
  }, [canAudit, auditPage, auditSearch, auditEntity]);

  const loadStaff = useCallback(async () => {
    if (!isOwner) return;
    try {
      setStaffError("");
      const res = await api<StaffResponse>("/admin/staff");
      setStaffData(res);
    } catch (e) {
      setStaffError((e as Error).message);
    }
  }, [isOwner]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    void loadAudit();
  }, [loadAudit]);

  useEffect(() => {
    void loadStaff();
  }, [loadStaff]);

  async function changeOwnPassword(e: React.FormEvent) {
    e.preventDefault();
    setPwdBusy(true);
    setPwdError("");
    try {
      await api("/admin/auth/change-password", {
        currentPassword,
        newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      toast("Administrator password updated.");
      await loadSessions();
      await loadAudit();
    } catch (err) {
      setPwdError((err as Error).message);
    } finally {
      setPwdBusy(false);
    }
  }

  async function regenerateCodes(e: React.FormEvent) {
    e.preventDefault();
    setPwdBusy(true);
    setPwdError("");
    try {
      const res = await api<{ recoveryCodes: string[] }>(
        "/admin/auth/mfa/recovery-codes/regenerate",
        { currentPassword: regenPassword },
      );
      setNewRecoveryCodes(res.recoveryCodes);
      setRegenPassword("");
      await refresh();
      toast("Generated 8 new single-use recovery codes.");
    } catch (err) {
      setPwdError((err as Error).message);
    } finally {
      setPwdBusy(false);
    }
  }

  async function startRotateAuthenticator(e: React.FormEvent) {
    e.preventDefault();
    setPwdBusy(true);
    setPwdError("");
    try {
      const res = await api<{ otpauthUri: string; manualEntryKey: string }>(
        "/admin/auth/mfa/enroll",
        { currentPassword: rotatePassword },
      );
      setRotateSetup(res);
      setRotatePassword("");
    } catch (err) {
      setPwdError((err as Error).message);
    } finally {
      setPwdBusy(false);
    }
  }

  async function confirmRotateAuthenticator(e: React.FormEvent) {
    e.preventDefault();
    setPwdBusy(true);
    setPwdError("");
    try {
      const res = await api<{ recoveryCodes: string[] }>(
        "/admin/auth/mfa/confirm",
        { code: rotateOtp },
      );
      setRotateSetup(null);
      setRotateOtp("");
      setNewRecoveryCodes(res.recoveryCodes);
      await refresh();
      toast("Authenticator secret rotated & recovery codes refreshed.");
    } catch (err) {
      setPwdError((err as Error).message);
    } finally {
      setPwdBusy(false);
    }
  }

  async function revokeAllSessions() {
    if (
      !window.confirm(
        "Sign out every active browser session for your administrator account?",
      )
    ) {
      return;
    }
    await api("/admin/auth/logout-all", {});
    await refresh();
    navigate("/login", { replace: true });
  }

  async function createStaffAccount(e: React.FormEvent) {
    e.preventDefault();
    setStaffBusy(true);
    setStaffError("");
    try {
      await api("/admin/staff", newStaff);
      setNewStaff({
        name: "",
        email: "",
        role: "content_editor",
        password: "",
      });
      toast("Staff administrator created (MFA required on first sign-in).");
      await loadStaff();
      await loadAudit();
    } catch (err) {
      setStaffError((err as Error).message);
    } finally {
      setStaffBusy(false);
    }
  }

  async function updateStaff(
    staffId: number,
    payload: Record<string, unknown>,
    confirmPrompt?: string,
  ) {
    if (confirmPrompt && !window.confirm(confirmPrompt)) return;
    setStaffBusy(true);
    setStaffError("");
    try {
      await api(`/admin/staff/${staffId}`, payload, "PATCH");
      toast("Staff permissions/status updated.");
      await loadStaff();
      await loadAudit();
    } catch (err) {
      setStaffError((err as Error).message);
    } finally {
      setStaffBusy(false);
    }
  }

  async function revokeStaffSessions(staff: StaffAdminRecord) {
    if (
      !window.confirm(
        `Revoke all active sessions for ${staff.name} (${staff.email})?`,
      )
    ) {
      return;
    }
    setStaffBusy(true);
    try {
      await api(`/admin/staff/${staff.id}/sessions`, undefined, "DELETE");
      toast(`Sessions revoked for ${staff.email}.`);
      await loadStaff();
      await loadAudit();
    } catch (err) {
      setStaffError((err as Error).message);
    } finally {
      setStaffBusy(false);
    }
  }

  const rotateQrSvg = rotateSetup
    ? generateQrSvgMarkup(rotateSetup.otpauthUri)
    : "";

  return (
    <div className="stack">
      {/* Personal Security & MFA */}
      <div className="admin-plans">
        <form className="panel stack" onSubmit={changeOwnPassword}>
          <div className="section-title" style={{ margin: 0 }}>
            <h2>
              <KeyRound size={20} /> Account Security &amp; Password
            </h2>
          </div>
          <p className="muted" style={{ margin: 0 }}>
            Signed in as <strong>{admin?.email}</strong> ({admin?.role}).
            Updating your password revokes other active devices.
          </p>
          <ErrorBox message={pwdError} />
          <label>
            Current password
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </label>
          <label>
            New strong password (min 12 chars)
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={12}
              required
              autoComplete="new-password"
            />
          </label>
          <button className="button outline small" disabled={pwdBusy}>
            Update password
          </button>
        </form>

        <div className="panel stack">
          <div className="section-title" style={{ margin: 0 }}>
            <h2>
              <Shield size={20} /> Authenticator &amp; Recovery Codes
            </h2>
            <span className="pill">
              {unusedRecoveryCodesCount} recovery codes left
            </span>
          </div>

          {newRecoveryCodes && (
            <div className="stack">
              <div className="recovery-codes-grid">
                {newRecoveryCodes.map((c) => (
                  <div className="recovery-code-item" key={c}>
                    {c}
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="button outline small"
                onClick={async () => {
                  await navigator.clipboard?.writeText(
                    newRecoveryCodes.join("\n"),
                  );
                  toast("Recovery codes copied.");
                }}
              >
                <Copy size={14} /> Copy backup codes
              </button>
            </div>
          )}

          <form className="stack" onSubmit={regenerateCodes}>
            <label>
              Confirm password to regenerate 8 backup codes
              <input
                type="password"
                value={regenPassword}
                onChange={(e) => setRegenPassword(e.target.value)}
                required
              />
            </label>
            <button className="button outline small" disabled={pwdBusy}>
              Regenerate recovery codes
            </button>
          </form>

          {!rotateSetup ? (
            <form className="stack" onSubmit={startRotateAuthenticator}>
              <label>
                Confirm password to rotate authenticator app key
                <input
                  type="password"
                  value={rotatePassword}
                  onChange={(e) => setRotatePassword(e.target.value)}
                  required
                />
              </label>
              <button className="button outline small" disabled={pwdBusy}>
                Rotate authenticator QR
              </button>
            </form>
          ) : (
            <form className="stack" onSubmit={confirmRotateAuthenticator}>
              {rotateQrSvg && (
                <div className="mfa-qr-frame">
                  <img
                    src={`data:image/svg+xml;utf8,${encodeURIComponent(rotateQrSvg)}`}
                    alt="New authenticator QR"
                    width={150}
                    height={150}
                  />
                </div>
              )}
              <div className="mfa-manual-key">{rotateSetup.manualEntryKey}</div>
              <label>
                Enter 6-digit code from new authenticator
                <input
                  value={rotateOtp}
                  onChange={(e) => setRotateOtp(e.target.value)}
                  required
                />
              </label>
              <div className="actions">
                <button className="button small" disabled={pwdBusy}>
                  Confirm new authenticator
                </button>
                <button
                  type="button"
                  className="button outline small"
                  onClick={() => setRotateSetup(null)}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Active Sessions */}
      <div className="panel stack">
        <div className="section-title" style={{ margin: 0 }}>
          <h3>Active Administrator Sessions ({sessions.length})</h3>
          <button
            type="button"
            className="button danger small"
            onClick={revokeAllSessions}
          >
            <LogOut size={15} /> Sign out all sessions
          </button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Session</th>
                <th>IP Address</th>
                <th>Device</th>
                <th>Last Activity</th>
                <th>Expires</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((sess) => (
                <tr key={sess.sessionId}>
                  <td>
                    <code>{sess.sessionId}</code>{" "}
                    {sess.current && <span className="pill">Current</span>}
                  </td>
                  <td>{sess.ipAddress || "Local"}</td>
                  <td>{sess.userAgent.slice(0, 60) || "Browser session"}</td>
                  <td>
                    {new Date(sess.lastActivityAt).toLocaleString("en-GB")}
                  </td>
                  <td>{new Date(sess.expiresAt).toLocaleString("en-GB")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Owner-only Staff & Role Management */}
      {isOwner && (
        <div className="panel stack">
          <div className="section-title" style={{ margin: 0 }}>
            <div>
              <h2>
                <Users size={20} /> Staff &amp; Role Administration
              </h2>
              <p className="muted" style={{ margin: 0 }}>
                Create dedicated staff accounts cleanly isolated from reader
                accounts. Every staff account must enroll authenticator MFA on
                first login.
              </p>
            </div>
          </div>

          <ErrorBox message={staffError} />

          {staffData?.pendingLegacyAdmins &&
            staffData.pendingLegacyAdmins.length > 0 && (
              <div className="notice">
                <AlertTriangle size={20} />
                <div>
                  <strong>Legacy Admin Review Notice:</strong>{" "}
                  {staffData.pendingLegacyAdmins
                    .map((p) => `${p.name} (${p.email})`)
                    .join(", ")}{" "}
                  held pre-separation admin status and has been safely demoted
                  to reader with sessions revoked. Run{" "}
                  <code>npm run admin:create</code> on the server if you want
                  to finalize legacy status metadata.
                </div>
              </div>
            )}

          <form
            className="stack"
            onSubmit={createStaffAccount}
            style={{
              background: "var(--cream)",
              padding: "16px",
              borderRadius: "10px",
              border: "1px solid var(--border)",
            }}
          >
            <strong style={{ color: "var(--wine)" }}>
              <UserPlus size={16} /> Add Administrator Staff Account
            </strong>
            <div className="form-row-2">
              <label>
                Full name
                <input
                  value={newStaff.name}
                  onChange={(e) =>
                    setNewStaff({ ...newStaff, name: e.target.value })
                  }
                  required
                  minLength={2}
                />
              </label>
              <label>
                Dedicated staff email
                <input
                  type="email"
                  value={newStaff.email}
                  onChange={(e) =>
                    setNewStaff({ ...newStaff, email: e.target.value })
                  }
                  placeholder="orders-staff@cossyteens.com"
                  required
                />
              </label>
            </div>
            <div className="form-row-2">
              <label>
                Assigned role
                <select
                  value={newStaff.role}
                  onChange={(e) =>
                    setNewStaff({
                      ...newStaff,
                      role: e.target.value as AdminRole,
                    })
                  }
                >
                  {(Object.keys(ROLE_LABELS) as AdminRole[]).map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Initial temporary password (min 12 chars)
                <input
                  type="password"
                  value={newStaff.password}
                  onChange={(e) =>
                    setNewStaff({ ...newStaff, password: e.target.value })
                  }
                  minLength={12}
                  required
                />
              </label>
            </div>
            <button className="button small" disabled={staffBusy}>
              Create administrator account
            </button>
          </form>

          {!staffData ? (
            <Loading />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Staff Member</th>
                    <th>Role</th>
                    <th>MFA</th>
                    <th>Status</th>
                    <th>Last Active</th>
                    <th>Controls</th>
                  </tr>
                </thead>
                <tbody>
                  {staffData.staff.map((member) => {
                    const isSelf = member.id === admin?.id;
                    return (
                      <tr key={member.id}>
                        <td>
                          <strong>{member.name}</strong>
                          <br />
                          <small className="muted">{member.email}</small>
                        </td>
                        <td>
                          <select
                            aria-label={`Role for ${member.email}`}
                            value={member.role}
                            disabled={staffBusy || isSelf}
                            onChange={(e) =>
                              updateStaff(
                                member.id,
                                { role: e.target.value },
                                `Change ${member.email} role to ${e.target.value}?`,
                              )
                            }
                          >
                            {(Object.keys(ROLE_LABELS) as AdminRole[]).map(
                              (r) => (
                                <option key={r} value={r}>
                                  {r}
                                </option>
                              ),
                            )}
                          </select>
                        </td>
                        <td>
                          <span className="pill">
                            {member.mfaEnabled
                              ? "MFA Active"
                              : "Setup Required"}
                          </span>
                        </td>
                        <td>
                          <span className="pill">{member.status}</span>
                        </td>
                        <td>
                          {member.lastActiveAt
                            ? new Date(member.lastActiveAt).toLocaleString(
                                "en-GB",
                              )
                            : "Never"}
                          <br />
                          <small className="muted">
                            {member.activeSessionsCount} active session(s)
                          </small>
                        </td>
                        <td>
                          <div className="actions">
                            {!isSelf && (
                              <button
                                type="button"
                                className={
                                  member.status === "active"
                                    ? "button danger small"
                                    : "button outline small"
                                }
                                disabled={staffBusy}
                                onClick={() =>
                                  updateStaff(
                                    member.id,
                                    {
                                      status:
                                        member.status === "active"
                                          ? "suspended"
                                          : "active",
                                      suspendedReason:
                                        member.status === "active"
                                          ? "Suspended by owner"
                                          : "",
                                    },
                                    member.status === "active"
                                      ? `Suspend ${member.email} and terminate all active sessions?`
                                      : `Reactivate ${member.email}?`,
                                  )
                                }
                              >
                                {member.status === "active"
                                  ? "Suspend"
                                  : "Reactivate"}
                              </button>
                            )}
                            {member.mfaEnabled && !isSelf && (
                              <button
                                type="button"
                                className="button outline small"
                                disabled={staffBusy}
                                onClick={() =>
                                  updateStaff(
                                    member.id,
                                    { resetMfa: true },
                                    `Reset MFA for ${member.email}? They must scan a new authenticator QR code on next sign-in.`,
                                  )
                                }
                              >
                                Reset MFA
                              </button>
                            )}
                            {member.activeSessionsCount > 0 && !isSelf && (
                              <button
                                type="button"
                                className="button outline small"
                                disabled={staffBusy}
                                onClick={() => revokeStaffSessions(member)}
                              >
                                Revoke sessions
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Audit Timeline */}
      {canAudit && (
        <div className="panel stack">
          <div className="section-title" style={{ margin: 0 }}>
            <div>
              <h2>Administrative Audit &amp; Security Log</h2>
              <p className="muted" style={{ margin: 0 }}>
                Immutable history of logins, MFA changes, payment confirmations,
                editorial publishing, and staff actions.
              </p>
            </div>
          </div>

          <div className="filters">
            <label className="search-field">
              <Search size={17} />
              <input
                placeholder="Search action, actor email, or entity ID..."
                value={auditSearch}
                onChange={(e) => {
                  setAuditSearch(e.target.value);
                  setAuditPage(1);
                }}
              />
            </label>
            <select
              value={auditEntity}
              onChange={(e) => {
                setAuditEntity(e.target.value);
                setAuditPage(1);
              }}
            >
              <option value="all">All event categories</option>
              {(auditData?.entityTypes || []).map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <ErrorBox message={auditError} />

          {!auditData ? (
            <Loading />
          ) : auditData.items.length === 0 ? (
            <Empty title="No matching audit events">
              Try clearing your filter or search query.
            </Empty>
          ) : (
            <>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Administrator</th>
                      <th>Category</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditData.items.map((item) => (
                      <tr key={item.id}>
                        <td style={{ whiteSpace: "nowrap" }}>
                          {new Date(item.createdAt).toLocaleString("en-GB")}
                        </td>
                        <td>
                          <strong>{item.adminName || item.actorName}</strong>
                          <br />
                          <small className="muted">
                            {item.actorEmail || "Legacy actor"} ·{" "}
                            {item.actorRole || "admin"}
                          </small>
                        </td>
                        <td>
                          <span className="pill">{item.entityType}</span>
                        </td>
                        <td>{item.action}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="actions" style={{ justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="button outline small"
                  disabled={auditPage <= 1}
                  onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <span className="muted">
                  Page {auditData.page} of {auditData.totalPages} (
                  {auditData.total} entries)
                </span>
                <button
                  type="button"
                  className="button outline small"
                  disabled={auditPage >= auditData.totalPages}
                  onClick={() => setAuditPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}


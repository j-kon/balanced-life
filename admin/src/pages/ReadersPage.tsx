import { useEffect, useState } from "react";
import { Award, Ban, CheckCircle2, Gift, Search, ShieldCheck, X } from "lucide-react";
import { useAdminAuth } from "../context/AdminAuthContext";
import { ConfirmDialog, Empty, ErrorBox, PaginationBar } from "../components/Common";
import type { AdminOverviewData, AdminSaveFn, AdminUserRow } from "./AdminTypes";

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB");

const PAGE_SIZE = 15;

const ACCESS_STATUS_LABELS: Record<string, string> = {
  active: "Active Online Access",
  scheduled: "Scheduled",
  expiring_soon: "Expiring Soon",
  expired: "Expired",
  revoked: "Revoked",
  pending_payment: "Payment Pending",
  none: "Free Reader",
};

export function ReadersPage({
  data,
  busy,
  formError = "",
  setFormError,
  save,
}: {
  data: AdminOverviewData;
  busy: boolean;
  formError?: string;
  setFormError?: (msg: string) => void;
  save: AdminSaveFn;
}) {
  const { hasPermission } = useAdminAuth();
  const canManageAccess = hasPermission("digital_orders.write");
  const canManageReaders = hasPermission("readers.write");
  const canViewAudit = hasPermission("audit.read");

  const defaultMonths = data.settings?.digitalAccessDurationMonths || 12;

  const [readerSearch, setReaderSearch] = useState("");
  const [accessFilter, setAccessFilter] = useState<string>("all");
  const [page, setPage] = useState(1);

  const [grantTarget, setGrantTarget] = useState<AdminUserRow | null>(null);
  const [grantMonths, setGrantMonths] = useState<number>(defaultMonths);
  const [grantReason, setGrantReason] = useState("");

  const [revokeTarget, setRevokeTarget] = useState<AdminUserRow | null>(null);
  const [revokeReason, setRevokeReason] = useState("");

  const [statusTarget, setStatusTarget] = useState<AdminUserRow | null>(null);
  const [statusReason, setStatusReason] = useState("");

  const readers = data.users.filter((u) => u.role === "reader");
  const q = readerSearch.trim().toLowerCase();
  const filteredReaders = readers.filter((u) => {
    const matchesSearch =
      !q ||
      `${u.name} ${u.email} ${u.planName || ""} ${u.subscriptionStatus} ${u.hasDigitalEdition ? "digital" : ""} ${u.onlineAccessStatus || ""} ${u.grantReason || ""}`
        .toLowerCase()
        .includes(q);
    if (!matchesSearch) return false;
    if (accessFilter === "all") return true;
    if (accessFilter === "suspended") return u.status === "suspended";
    return (u.onlineAccessStatus || "none") === accessFilter;
  });

  useEffect(() => {
    setPage(1);
  }, [readerSearch, accessFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredReaders.length / PAGE_SIZE));
  const pagedReaders = filteredReaders.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  );

  function openGrantForm(user: AdminUserRow) {
    setFormError?.("");
    setGrantTarget(user);
    setGrantMonths(defaultMonths);
    setGrantReason("");
  }

  async function submitGrant(e: React.FormEvent) {
    e.preventDefault();
    if (!grantTarget) return;
    if (grantReason.trim().length < 2) {
      setFormError?.("Provide a brief reason for the audit log before granting access.");
      return;
    }
    const ok = await save(
      `/admin/users/${grantTarget.id}/online-access/grant`,
      {
        months: grantMonths,
        reason: grantReason.trim(),
      },
      "POST",
      `Granted ${grantMonths}-month complimentary 2027 Online Access to ${grantTarget.name}.`,
    );
    if (ok) {
      setGrantTarget(null);
      setGrantReason("");
    }
  }

  function openRevokeDialog(user: AdminUserRow) {
    setFormError?.("");
    setRevokeTarget(user);
    setRevokeReason("");
  }

  async function confirmRevoke() {
    if (!revokeTarget) return;
    if (revokeReason.trim().length < 2) {
      setFormError?.("Provide a brief reason before revoking online access.");
      return;
    }
    const ok = await save(
      `/admin/users/${revokeTarget.id}/online-access/revoke`,
      { reason: revokeReason.trim() },
      "POST",
      `Revoked online access for ${revokeTarget.name}.`,
    );
    if (ok) {
      setRevokeTarget(null);
      setRevokeReason("");
    }
  }

  function openStatusDialog(user: AdminUserRow) {
    setFormError?.("");
    setStatusTarget(user);
    setStatusReason("");
  }

  async function confirmStatusChange() {
    if (!statusTarget) return;
    const nextStatus = statusTarget.status === "active" ? "suspended" : "active";
    if (nextStatus === "suspended" && statusReason.trim().length < 2) {
      setFormError?.("Provide a brief reason for suspending this reader account.");
      return;
    }
    const ok = await save(
      `/admin/users/${statusTarget.id}/status`,
      { status: nextStatus, reason: statusReason.trim() },
      "PATCH",
      nextStatus === "suspended"
        ? `Suspended account for ${statusTarget.name}.`
        : `Reactivated account for ${statusTarget.name}.`,
    );
    if (ok) {
      setStatusTarget(null);
      setStatusReason("");
    }
  }

  return (
    <div className="stack">
      <div className="section-title" style={{ margin: 0 }}>
        <div>
          <h2>Reader Accounts &amp; 2027 Online Access ({filteredReaders.length})</h2>
          <p className="muted" style={{ margin: 0 }}>
            {readers.length} registered readers ·{" "}
            {readers.filter((u) => u.onlineAccessActive).length} active online access ·{" "}
            {readers.filter((u) => u.onlineAccessStatus === "scheduled").length} scheduled ·{" "}
            {readers.filter((u) => u.status === "suspended").length} suspended. Private Growth
            Journal entries remain strictly confidential.
          </p>
        </div>
      </div>

      <div className="notice">
        <Gift size={18} />
        <div>
          <strong>Single Authoritative 12-Month Complimentary Online Access</strong>
          <p style={{ margin: 0 }}>
            Complimentary grants issue or extend <strong>2027 Online Access</strong> with no paid
            transaction created, while preserving active or legacy entitlements. Revocation removes
            active digital and legacy access and records an audit trail entry.
          </p>
        </div>
      </div>

      {grantTarget && canManageAccess && (
        <form className="panel stack" onSubmit={submitGrant} noValidate>
          <div className="section-title" style={{ margin: 0 }}>
            <h3>
              Grant complimentary online access to {grantTarget.name} ({grantTarget.email})
            </h3>
            <button
              type="button"
              className="icon-button"
              aria-label="Close complimentary access form"
              disabled={busy}
              onClick={() => {
                setFormError?.("");
                setGrantTarget(null);
              }}
            >
              <X />
            </button>
          </div>
          <ErrorBox message={formError} />
          <div className="form-row-2">
            <label>
              Complimentary duration (months)
              <input
                type="number"
                min={1}
                max={24}
                value={grantMonths}
                onChange={(e) =>
                  setGrantMonths(Math.max(1, Math.min(24, Number(e.target.value) || 12)))
                }
                required
              />
            </label>
            <label>
              Reason for complimentary access
              <input
                required
                minLength={2}
                maxLength={500}
                value={grantReason}
                onChange={(e) => setGrantReason(e.target.value)}
                placeholder="e.g. Sponsored youth group member / pastor review copy"
              />
            </label>
          </div>
          <div className="actions">
            <button className="button" disabled={busy}>
              <Gift size={16} /> {busy ? "Granting..." : "Confirm complimentary grant"}
            </button>
            <button
              type="button"
              className="button outline"
              disabled={busy}
              onClick={() => {
                setFormError?.("");
                setGrantTarget(null);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="filters">
        <label className="search-box">
          <Search size={18} />
          <input
            aria-label="Search subscribers"
            placeholder="Search readers by name, email, or plan…"
            value={readerSearch}
            onChange={(e) => setReaderSearch(e.target.value)}
          />
        </label>
        <select
          aria-label="Filter readers by online access status"
          value={accessFilter}
          onChange={(e) => setAccessFilter(e.target.value)}
        >
          <option value="all">All access states</option>
          <option value="active">Active Online Access</option>
          <option value="scheduled">Scheduled</option>
          <option value="expired">Expired</option>
          <option value="revoked">Revoked</option>
          <option value="pending_payment">Payment Pending</option>
          <option value="none">Free Reader</option>
          <option value="suspended">Suspended Account</option>
        </select>
      </div>

      {pagedReaders.length === 0 ? (
        <Empty title="No matching readers">
          Try clearing your search or choosing another online access status filter.
        </Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Reader</th>
                <th>Registered</th>
                <th>Account Status</th>
                <th>Online Access State</th>
                <th>Access Window / Expiry</th>
                <th>Purchases</th>
                <th>Reading Progress</th>
                {(canManageAccess || canManageReaders) && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {pagedReaders.map((u) => {
                const accessKey = u.onlineAccessStatus || "none";
                const accessLabel = ACCESS_STATUS_LABELS[accessKey] || accessKey;
                const badgeTone =
                  accessKey === "active"
                    ? "active"
                    : accessKey === "revoked" || accessKey === "expired"
                      ? "revoked"
                      : "neutral";
                return (
                  <tr key={u.id}>
                    <td>
                      <strong>{u.name}</strong>
                      <br />
                      <small className="muted">{u.email}</small>
                      {u.ageGroup && (
                        <div className="muted" style={{ fontSize: "0.75rem" }}>
                          Age: {u.ageGroup}
                          {u.ageGroup === "13-17" && u.guardianConsentConfirmed
                            ? " · Guardian confirmed"
                            : ""}
                        </div>
                      )}
                    </td>
                    <td>{u.createdAt ? fmtDate(u.createdAt) : "—"}</td>
                    <td>
                      <span className={`badge ${u.status}`}>{u.status}</span>
                      {u.suspendedReason && (
                        <div className="muted" style={{ fontSize: "0.75rem", marginTop: 4 }}>
                          {u.suspendedReason}
                        </div>
                      )}
                    </td>
                    <td>
                      <div className="stack" style={{ gap: 4 }}>
                        <span className={`badge ${badgeTone}`}>{accessLabel}</span>
                        {u.onlineAccessActive && (
                          <span className="pill">
                            {u.accessType === "complimentary"
                              ? "Complimentary"
                              : "Paid Access"}
                          </span>
                        )}
                        {u.digitalEntitlement?.legacyPersistent && (
                          <span className="pill">Legacy Preserved</span>
                        )}
                      </div>
                    </td>
                    <td>
                      {u.digitalEntitlement?.legacyPersistent ? (
                        "Legacy persistent (2027)"
                      ) : u.onlineAccessExpiresAt || u.expiresAt ? (
                        <>
                          {fmtDate((u.onlineAccessExpiresAt || u.expiresAt)!)}
                          {u.onlineAccessDaysRemaining !== null &&
                          u.onlineAccessDaysRemaining !== undefined ? (
                            <small
                              className="muted"
                              style={{ display: "block", marginTop: "2px" }}
                            >
                              {u.onlineAccessDaysRemaining}d remaining
                            </small>
                          ) : null}
                        </>
                      ) : (
                        "—"
                      )}
                      {u.grantReason && (
                        <small
                          className="muted"
                          style={{ display: "block", marginTop: "3px" }}
                        >
                          {u.grantReason}
                        </small>
                      )}
                    </td>
                    <td>
                      <small>
                        Online: {u.digitalPurchasesCount ?? 0} · Printed:{" "}
                        {u.printedOrdersCount ?? 0}
                      </small>
                    </td>
                    <td>
                      <small>
                        {u.completedReadingsCount ?? 0} read ·{" "}
                        {u.bookmarksCount ?? 0} saved
                      </small>
                    </td>
                    {(canManageAccess || canManageReaders) && (
                      <td>
                        <div className="actions">
                          {canManageAccess && (
                            <button
                              type="button"
                              className="button outline small"
                              disabled={busy}
                              onClick={() => openGrantForm(u)}
                            >
                              <Award size={14} /> Grant complimentary
                            </button>
                          )}
                          {canManageAccess &&
                            (u.onlineAccessActive ||
                              u.onlineAccessStatus === "scheduled" ||
                              u.subscription?.active) && (
                              <button
                                type="button"
                                className="button outline small"
                                disabled={busy}
                                onClick={() => openRevokeDialog(u)}
                              >
                                Revoke access
                              </button>
                            )}
                          {canManageReaders && (
                            <button
                              type="button"
                              className="button outline small"
                              disabled={busy}
                              onClick={() => openStatusDialog(u)}
                            >
                              {u.status === "suspended" ? (
                                <>
                                  <CheckCircle2 size={14} /> Reactivate
                                </>
                              ) : (
                                <>
                                  <Ban size={14} /> Suspend
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <PaginationBar
        page={page}
        totalPages={totalPages}
        total={filteredReaders.length}
        label="readers"
        onPage={setPage}
      />

      {canViewAudit && (
        <div className="panel stack">
          <h3>
            <ShieldCheck size={18} /> Administrative Audit Log
          </h3>
          {data.audit.length === 0 ? (
            <p className="muted">No audit events recorded yet.</p>
          ) : (
            data.audit.slice(0, 20).map((a) => (
              <p className="audit-line" key={a.id}>
                {fmtDate(a.createdAt)}
                {a.adminName ? ` · ${a.adminName}` : ""} — {a.action}
              </p>
            ))
          )}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(revokeTarget)}
        title={`Revoke online access for ${revokeTarget?.name || ""}`}
        description="This immediately revokes their 2027 Online Access entitlement (and any legacy subscription) and records an entry in the audit log."
        confirmLabel="Revoke Online Access"
        busy={busy}
        error={formError}
        onConfirm={confirmRevoke}
        onCancel={() => {
          setFormError?.("");
          setRevokeTarget(null);
        }}
      >
        <label>
          Reason for revocation
          <input
            placeholder="e.g. Refunded purchase, policy violation, administrative cleanup"
            value={revokeReason}
            onChange={(e) => setRevokeReason(e.target.value)}
            required
          />
        </label>
      </ConfirmDialog>

      <ConfirmDialog
        open={Boolean(statusTarget)}
        title={
          statusTarget?.status === "active"
            ? `Suspend reader account for ${statusTarget.name}`
            : `Reactivate reader account for ${statusTarget?.name || ""}`
        }
        description={
          statusTarget?.status === "active"
            ? "Suspending signs the reader out across all devices until reactivated."
            : "Reactivating allows the reader to sign back in."
        }
        confirmLabel={
          statusTarget?.status === "active" ? "Suspend Account" : "Reactivate Account"
        }
        busy={busy}
        error={formError}
        onConfirm={confirmStatusChange}
        onCancel={() => {
          setFormError?.("");
          setStatusTarget(null);
        }}
      >
        {statusTarget?.status === "active" && (
          <label>
            Reason for suspension
            <input
              placeholder="e.g. Policy review or requested account hold"
              value={statusReason}
              onChange={(e) => setStatusReason(e.target.value)}
              required
            />
          </label>
        )}
      </ConfirmDialog>
    </div>
  );
}

import { useState } from "react";
import { Gift, Search, X } from "lucide-react";
import type { AdminOverviewData, AdminSaveFn, AdminUserRow } from "./AdminTypes";

export function ReadersPage({
  data,
  busy,
  save,
}: {
  data: AdminOverviewData;
  busy: boolean;
  save: AdminSaveFn;
}) {
  const [readerSearch, setReaderSearch] = useState("");
  const [grantTarget, setGrantTarget] = useState<AdminUserRow | null>(null);
  const [grantPlanId, setGrantPlanId] = useState<number>(
    data.plans.find((p) => p.months === 12)?.id || data.plans[0]?.id || 4,
  );
  const [grantReason, setGrantReason] = useState("");

  const filteredUsers = data.users.filter((u) =>
    `${u.name} ${u.email} ${u.role} ${u.planName || ""} ${u.subscriptionStatus} ${u.hasDigitalEdition ? "digital" : ""} ${u.onlineAccessStatus || ""}`
      .toLowerCase()
      .includes(readerSearch.toLowerCase()),
  );

  return (
    <div className="stack">
      <div className="section-title" style={{ margin: 0 }}>
        <div>
          <h2>Reader &amp; Subscriber Management ({filteredUsers.length})</h2>
          <p className="muted" style={{ margin: 0 }}>
            View reader registration dates, online access windows, purchase
            summaries, and reading completion statistics. Private Growth Journal
            entries are strictly confidential and never visible to
            administrators.
          </p>
        </div>
      </div>

      {grantTarget && (
        <form
          className="panel stack"
          onSubmit={async (e) => {
            e.preventDefault();
            const selectedPlan = data.plans.find((p) => p.id === grantPlanId);
            await save(
              `/admin/users/${grantTarget.id}/complimentary`,
              { planId: grantPlanId, reason: grantReason },
              "POST",
            );
            // Also grant 12-month digital entitlement so both Online Access and legacy checks stay in sync
            await save(
              `/admin/users/${grantTarget.id}/online-access/grant`,
              {
                months: selectedPlan?.months || 12,
                reason: grantReason,
              },
              "POST",
            );
            setGrantTarget(null);
          }}
        >
          <div className="section-title" style={{ margin: 0 }}>
            <h3>
              Grant complimentary access to {grantTarget.name} (
              {grantTarget.email})
            </h3>
            <button
              type="button"
              className="icon-button"
              aria-label="Close complimentary access form"
              onClick={() => setGrantTarget(null)}
            >
              <X />
            </button>
          </div>
          <p>
            Complimentary grants activate full online access to all published
            2027 devotionals for the selected duration. They are recorded in the
            audit log and are never counted as paid revenue.
          </p>
          <div className="form-row-2">
            <label>
              Access duration
              <select
                value={grantPlanId}
                onChange={(e) => setGrantPlanId(Number(e.target.value))}
              >
                {data.plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.months}{" "}
                    {p.months === 1 ? "month" : "months"})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Reason for complimentary access
              <input
                required
                minLength={2}
                maxLength={500}
                value={grantReason}
                onChange={(e) => setGrantReason(e.target.value)}
                placeholder="e.g. Sponsored youth group member / local verification"
              />
            </label>
          </div>
          <div className="actions">
            <button className="button" disabled={busy}>
              <Gift size={16} /> Confirm complimentary grant
            </button>
            <button
              type="button"
              className="button outline"
              onClick={() => setGrantTarget(null)}
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
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Reader</th>
              <th>Registered</th>
              <th>Role &amp; Status</th>
              <th>Online Access Status</th>
              <th>Access Window / Expiry</th>
              <th>Purchases</th>
              <th>Reading Progress</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((u) => (
              <tr key={u.id}>
                <td>
                  <strong>{u.name}</strong>
                  <br />
                  <small className="muted">{u.email}</small>
                </td>
                <td>
                  {u.createdAt
                    ? new Date(u.createdAt).toLocaleDateString("en-GB")
                    : "—"}
                </td>
                <td>
                  {u.role} · <span className="pill">{u.status}</span>
                </td>
                <td>
                  <span className="pill">
                    {u.onlineAccessActive
                      ? `Active (${u.accessType === "complimentary" ? "Comp" : "Paid"})`
                      : u.onlineAccessStatus || "Free"}
                  </span>
                </td>
                <td>
                  {u.digitalEntitlement?.legacyPersistent ? (
                    "Persistent (2027)"
                  ) : u.onlineAccessExpiresAt || u.expiresAt ? (
                    <>
                      {new Date(
                        (u.onlineAccessExpiresAt || u.expiresAt)!,
                      ).toLocaleDateString("en-GB")}
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
                </td>
                <td>
                  <small>
                    Digital: {u.digitalPurchasesCount ?? 0} · Printed:{" "}
                    {u.printedOrdersCount ?? 0}
                  </small>
                </td>
                <td>
                  <small>
                    {u.completedReadingsCount ?? 0} read ·{" "}
                    {u.bookmarksCount ?? 0} saved
                  </small>
                </td>
                <td>
                  <div className="actions">
                    <button
                      type="button"
                      className="text-link"
                      onClick={() => {
                        setGrantTarget(u);
                        setGrantPlanId(
                          data.plans.find((p) => p.months === 12)?.id ||
                            data.plans[0]?.id ||
                            4,
                        );
                        setGrantReason("");
                      }}
                    >
                      Grant complimentary
                    </button>
                    {(u.subscription?.active || u.onlineAccessActive) && (
                      <button
                        type="button"
                        className="text-link"
                        disabled={busy}
                        onClick={() =>
                          save(
                            `/admin/users/${u.id}/revoke-access`,
                            {
                              reason: "Revoked from administrator dashboard",
                            },
                            "POST",
                          )
                        }
                      >
                        Revoke access
                      </button>
                    )}
                    {u.role !== "admin" && (
                      <button
                        type="button"
                        className="text-link"
                        disabled={busy}
                        onClick={() =>
                          save(`/admin/users/${u.id}/status`, {
                            status:
                              u.status === "suspended" ? "active" : "suspended",
                            reason:
                              u.status === "suspended"
                                ? ""
                                : "Suspended by administrator",
                          })
                        }
                      >
                        {u.status === "suspended" ? "Reactivate" : "Suspend"}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel stack">
        <h3>Administrative Audit Log</h3>
        {data.audit.map((a) => (
          <p className="audit-line" key={a.id}>
            {new Date(a.createdAt).toLocaleString("en-GB")}
            {a.adminName ? ` · ${a.adminName}` : ""} — {a.action}
          </p>
        ))}
      </div>
    </div>
  );
}


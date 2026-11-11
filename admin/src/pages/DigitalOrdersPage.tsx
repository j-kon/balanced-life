import { useState } from "react";
import { Gift, Search, X } from "lucide-react";
import { Empty } from "../components/Common";
import { money } from "../api";
import type { DigitalPurchaseRecord } from "../types";
import type { AdminOverviewData, AdminSaveFn, AdminUserRow } from "./AdminTypes";

export function DigitalOrdersPage({
  data,
  busy,
  save,
}: {
  data: AdminOverviewData;
  busy: boolean;
  save: AdminSaveFn;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [reconcileNotes, setReconcileNotes] = useState<Record<number, string>>(
    {},
  );
  const [selectedRecord, setSelectedRecord] =
    useState<DigitalPurchaseRecord | null>(null);
  const [grantUser, setGrantUser] = useState<AdminUserRow | null>(null);
  const [grantMonths, setGrantMonths] = useState(12);
  const [grantReason, setGrantReason] = useState("");

  const records = data.onlineAccessRecords || data.digitalPurchases;

  const filtered = records.filter((rec) => {
    if (statusFilter !== "all") {
      if (statusFilter === "pending") {
        if (
          rec.status !== "pending" &&
          rec.status !== "verifying_transfer"
        ) {
          return false;
        }
      } else if (statusFilter === "active") {
        if (
          rec.accessStatus !== "active" &&
          rec.entitlementStatus !== "active"
        ) {
          return false;
        }
      } else if (
        rec.accessStatus !== statusFilter &&
        rec.status !== statusFilter &&
        rec.entitlementStatus !== statusFilter
      ) {
        return false;
      }
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (
        !`${rec.userName || ""} ${rec.email || ""} ${rec.reference} ${rec.paymentMethod} ${rec.transferReference || ""}`
          .toLowerCase()
          .includes(q)
      ) {
        return false;
      }
    }
    return true;
  });

  return (
    <div className="stack">
      {/* Product A Configuration Panel */}
      <form
        className="panel stack"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          save(
            "/admin/settings",
            {
              digitalEditionPriceKobo: Math.round(
                Number(f.get("digitalPrice")) * 100,
              ),
              digitalAccessDurationMonths: Number(
                f.get("digitalDurationMonths") || 12,
              ),
              digitalEditionAvailability: f.get("digitalAvailability"),
              digitalEditionScope: f.get("digitalScope"),
              digitalEditionNote: f.get("digitalNote"),
            },
            "PUT",
          );
        }}
      >
        <div className="section-title" style={{ margin: 0 }}>
          <div>
            <h2>Product A: 2027 Digital Devotional Access (₦3,500)</h2>
            <p className="muted" style={{ margin: 0 }}>
              One-time payment for 12 calendar months of online access. Early
              purchases before January 1, 2027 begin their 12-month period on
              January 1, 2027. Manual renewals extend from the later of current
              expiration or renewal date.
            </p>
          </div>
        </div>
        <div className="form-row-2">
          <label>
            Digital Access price (NGN)
            <input
              name="digitalPrice"
              type="number"
              min={100}
              step="1"
              defaultValue={data.settings.digitalEditionPriceKobo / 100}
              required
            />
          </label>
          <label>
            Access term duration (calendar months)
            <input
              name="digitalDurationMonths"
              type="number"
              min={1}
              max={60}
              defaultValue={data.settings.digitalAccessDurationMonths || 12}
              required
            />
          </label>
        </div>
        <div className="form-row-2">
          <label>
            Availability
            <select
              name="digitalAvailability"
              defaultValue={data.settings.digitalEditionAvailability}
            >
              <option value="available">Available for purchase</option>
              <option value="unavailable">Unavailable</option>
            </select>
          </label>
          <label>
            Entitlement scope
            <select
              name="digitalScope"
              defaultValue={data.settings.digitalEditionScope}
            >
              <option value="edition_2027">
                2027 Edition 12-month online access (Default)
              </option>
              <option value="includes_membership_updates">
                2027 Edition + updates
              </option>
            </select>
          </label>
        </div>
        <label>
          Product note shown on checkout
          <input
            name="digitalNote"
            defaultValue={data.settings.digitalEditionNote}
            required
          />
        </label>
        <div className="actions">
          <button className="button outline small" disabled={busy}>
            Save Online Access Settings
          </button>
          <button
            type="button"
            className="button small"
            onClick={() => {
              const firstReader =
                data.users.find((u) => u.role !== "admin") || data.users[0];
              if (firstReader) {
                setGrantUser(firstReader);
                setGrantMonths(12);
                setGrantReason("");
              }
            }}
          >
            <Gift size={15} /> Grant Complimentary Online Access
          </button>
        </div>
      </form>

      {/* Complimentary Online Access Modal / Panel */}
      {grantUser && (
        <form
          className="panel stack"
          onSubmit={async (e) => {
            e.preventDefault();
            await save(
              `/admin/users/${grantUser.id}/online-access/grant`,
              {
                months: grantMonths,
                reason: grantReason,
              },
              "POST",
            );
            setGrantUser(null);
          }}
        >
          <div className="section-title" style={{ margin: 0 }}>
            <h3>Grant Complimentary 12-Month Online Access</h3>
            <button
              type="button"
              className="icon-button"
              aria-label="Close complimentary grant form"
              onClick={() => setGrantUser(null)}
            >
              <X />
            </button>
          </div>
          <div className="form-row-2">
            <label>
              Select reader account
              <select
                value={grantUser.id}
                onChange={(e) => {
                  const found = data.users.find(
                    (u) => u.id === Number(e.target.value),
                  );
                  if (found) setGrantUser(found);
                }}
              >
                {data.users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.email})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Duration (calendar months)
              <input
                type="number"
                min={1}
                max={60}
                value={grantMonths}
                onChange={(e) => setGrantMonths(Number(e.target.value) || 12)}
                required
              />
            </label>
          </div>
          <label>
            Reason for complimentary access (required for audit log)
            <input
              required
              minLength={2}
              maxLength={500}
              value={grantReason}
              onChange={(e) => setGrantReason(e.target.value)}
              placeholder="e.g. Sponsored youth group leader / pastoral review copy"
            />
          </label>
          <div className="actions">
            <button className="button small" disabled={busy}>
              <Gift size={15} /> Activate Complimentary Access
            </button>
            <button
              type="button"
              className="button outline small"
              onClick={() => setGrantUser(null)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Search & Status Filters */}
      <div className="section-title" style={{ margin: 0 }}>
        <h2>Online Access &amp; Digital Orders ({filtered.length})</h2>
      </div>
      <div className="filters">
        <label className="search-box">
          <Search size={18} />
          <input
            aria-label="Search online access records"
            placeholder="Search by customer name, email, reference, or transfer ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <select
          aria-label="Filter digital purchases by status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">All access &amp; payment statuses</option>
          <option value="active">Active access</option>
          <option value="scheduled">Scheduled (Starts Jan 1, 2027)</option>
          <option value="pending">Pending verification</option>
          <option value="verifying_transfer">Verifying bank transfer</option>
          <option value="succeeded">Succeeded / Verified</option>
          <option value="expired">Expired access</option>
          <option value="refunded">Refunded</option>
          <option value="revoked">Revoked</option>
        </select>
      </div>

      {/* Online Access Table */}
      {filtered.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Reference</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Payment Status</th>
                <th>Activation Date</th>
                <th>Expiration Date</th>
                <th>Days Left</th>
                <th>Access Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((dp) => (
                <tr key={dp.id}>
                  <td>
                    <strong>{dp.userName}</strong>
                    <br />
                    <small className="muted">{dp.email}</small>
                  </td>
                  <td className="reference">
                    <code>{dp.reference}</code>
                    {dp.transferReference ? (
                      <>
                        <br />
                        <small className="muted">
                          Transfer: {dp.transferReference}
                        </small>
                      </>
                    ) : null}
                  </td>
                  <td>
                    {dp.amountKobo > 0
                      ? money(dp.amountKobo)
                      : "Complimentary"}
                  </td>
                  <td>
                    {dp.paymentMethod === "paystack"
                      ? "Paystack"
                      : dp.paymentMethod === "complimentary"
                        ? "Complimentary"
                        : `Bank Transfer (${dp.currency})`}
                  </td>
                  <td>
                    <span className="pill">{dp.status}</span>
                  </td>
                  <td>
                    {dp.startsAt
                      ? new Date(dp.startsAt).toLocaleDateString("en-GB")
                      : "—"}
                  </td>
                  <td>
                    {dp.legacyPersistent ? (
                      <span className="pill">Legacy Persistent</span>
                    ) : dp.expiresAt ? (
                      new Date(dp.expiresAt).toLocaleDateString("en-GB")
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    {dp.legacyPersistent
                      ? "Persistent"
                      : dp.daysRemaining !== null &&
                          dp.daysRemaining !== undefined
                        ? `${dp.daysRemaining}d`
                        : "—"}
                  </td>
                  <td>
                    <span className="pill">
                      {dp.accessStatus || dp.entitlementStatus || "none"}
                    </span>
                    {dp.renewalCount && dp.renewalCount > 0 ? (
                      <small
                        className="muted"
                        style={{ display: "block", marginTop: "2px" }}
                      >
                        Renewals: {dp.renewalCount}
                      </small>
                    ) : null}
                  </td>
                  <td>
                    <div className="actions">
                      <button
                        type="button"
                        className="button outline small"
                        onClick={() => setSelectedRecord(dp)}
                      >
                        Manage
                      </button>
                      {dp.id > 0 && dp.status !== "succeeded" && (
                        <button
                          type="button"
                          className="button small"
                          disabled={busy}
                          onClick={() =>
                            save(
                              `/admin/digital-purchases/${dp.id}/reconcile`,
                              {
                                action: "approve",
                                adminNotes:
                                  reconcileNotes[dp.id] ?? dp.adminNotes,
                              },
                              "POST",
                            )
                          }
                        >
                          Verify &amp; Activate
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty title="No Online Access records match this filter">
          Verified Paystack purchases, bank-transfer orders, and complimentary
          entitlements will appear here.
        </Empty>
      )}

      {/* Detailed Reconciliation & History Drawer/Panel */}
      {selectedRecord && (
        <div className="panel stack">
          <div className="section-title" style={{ margin: 0 }}>
            <div>
              <h3>
                Manage Online Access: {selectedRecord.userName} (
                {selectedRecord.email})
              </h3>
              <small className="muted">
                Reference: <code>{selectedRecord.reference}</code> · Created{" "}
                {new Date(selectedRecord.createdAt).toLocaleString("en-GB")}
              </small>
            </div>
            <button
              type="button"
              className="icon-button"
              onClick={() => setSelectedRecord(null)}
            >
              <X />
            </button>
          </div>

          <div className="form-row-2">
            <div>
              <strong>Payment Method &amp; Amount:</strong>{" "}
              {selectedRecord.paymentMethod} ·{" "}
              {money(selectedRecord.amountKobo)}
              {selectedRecord.transferReference
                ? ` (Transfer Ref: ${selectedRecord.transferReference})`
                : ""}
            </div>
            <div>
              <strong>Access Window:</strong>{" "}
              {selectedRecord.startsAt
                ? new Date(selectedRecord.startsAt).toLocaleDateString("en-GB")
                : "Not started"}{" "}
              →{" "}
              {selectedRecord.legacyPersistent
                ? "Legacy Persistent (Flagged for Review)"
                : selectedRecord.expiresAt
                  ? `${new Date(selectedRecord.expiresAt).toLocaleDateString("en-GB")} (${selectedRecord.daysRemaining ?? 0} days remaining)`
                  : "Pending activation"}
            </div>
          </div>

          <label>
            Administrator reconciliation / audit note
            <input
              value={
                reconcileNotes[selectedRecord.id] !== undefined
                  ? reconcileNotes[selectedRecord.id]
                  : selectedRecord.adminNotes || ""
              }
              onChange={(e) =>
                setReconcileNotes({
                  ...reconcileNotes,
                  [selectedRecord.id]: e.target.value,
                })
              }
              placeholder="Record bank statement verification, renewal note, or revocation reason…"
            />
          </label>

          <div className="actions">
            {selectedRecord.id > 0 && selectedRecord.status !== "succeeded" && (
              <button
                type="button"
                className="button small"
                disabled={busy}
                onClick={async () => {
                  await save(
                    `/admin/digital-purchases/${selectedRecord.id}/reconcile`,
                    {
                      action: "approve",
                      adminNotes:
                        reconcileNotes[selectedRecord.id] ??
                        selectedRecord.adminNotes,
                    },
                    "POST",
                  );
                  setSelectedRecord(null);
                }}
              >
                Verify &amp; Activate 12-Month Access
              </button>
            )}
            {selectedRecord.id > 0 &&
              (selectedRecord.status === "pending" ||
                selectedRecord.status === "verifying_transfer") && (
                <button
                  type="button"
                  className="button outline small"
                  disabled={busy}
                  onClick={async () => {
                    await save(
                      `/admin/digital-purchases/${selectedRecord.id}/reconcile`,
                      {
                        action: "reject",
                        adminNotes:
                          reconcileNotes[selectedRecord.id] ??
                          selectedRecord.adminNotes,
                      },
                      "POST",
                    );
                    setSelectedRecord(null);
                  }}
                >
                  Mark Unverified / Failed
                </button>
              )}
            {selectedRecord.id > 0 && selectedRecord.status === "succeeded" && (
              <button
                type="button"
                className="button outline small"
                disabled={busy}
                onClick={async () => {
                  await save(
                    `/admin/digital-purchases/${selectedRecord.id}/reconcile`,
                    {
                      action: "refund",
                      adminNotes:
                        reconcileNotes[selectedRecord.id] ??
                        selectedRecord.adminNotes,
                    },
                    "POST",
                  );
                  setSelectedRecord(null);
                }}
              >
                Mark Refunded &amp; Revoke
              </button>
            )}
            <button
              type="button"
              className="button outline small"
              disabled={busy}
              onClick={async () => {
                const reason =
                  reconcileNotes[selectedRecord.id] ||
                  selectedRecord.adminNotes ||
                  "Revoked by administrator";
                if (selectedRecord.id > 0) {
                  await save(
                    `/admin/digital-purchases/${selectedRecord.id}/reconcile`,
                    { action: "revoke", adminNotes: reason },
                    "POST",
                  );
                } else {
                  await save(
                    `/admin/users/${selectedRecord.userId}/online-access/revoke`,
                    { reason },
                    "POST",
                  );
                }
                setSelectedRecord(null);
              }}
            >
              Revoke Online Access
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


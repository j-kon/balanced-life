import { useEffect, useState } from "react";
import { CheckCircle2, CreditCard, Landmark, Search } from "lucide-react";
import { useAdminAuth } from "../context/AdminAuthContext";
import { ConfirmDialog, Empty, ErrorBox, PaginationBar } from "../components/Common";
import { money } from "../api";
import type { AdminOverviewData, AdminSaveFn } from "./AdminTypes";

const PAGE_SIZE = 15;

type LedgerRow = {
  key: string;
  kind: "digital" | "printed" | "membership";
  kindLabel: string;
  customerName: string;
  email: string;
  reference: string;
  transferReference: string;
  paymentMethod: string;
  amountKobo: number;
  currency: string;
  status: "verified" | "pending" | "failed" | "refunded";
  rawStatus: string;
  createdAt: string;
  verifiedAt: string | null;
  entityId: number;
};

export function PaymentsPage({
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
  const canWriteDigital = hasPermission("digital_orders.write");
  const canWritePayments = hasPermission("payments.write");

  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(1);
  const [rejectItem, setRejectItem] = useState<LedgerRow | null>(null);

  useEffect(() => {
    setPage(1);
  }, [search, kindFilter, statusFilter, startDate, endDate]);

  const digitalRows: LedgerRow[] = data.digitalPurchases.map((dp) => ({
    key: `dig_${dp.id}`,
    kind: "digital",
    kindLabel: "2027 Digital Access",
    customerName: dp.userName || "Reader",
    email: dp.email || "",
    reference: dp.reference,
    transferReference: dp.transferReference || "",
    paymentMethod:
      dp.paymentMethod === "paystack" ? "Paystack" : "Bank Transfer",
    amountKobo: dp.amountKobo,
    currency: dp.currency,
    status:
      dp.status === "succeeded"
        ? "verified"
        : dp.status === "refunded"
          ? "refunded"
          : dp.status === "failed"
            ? "failed"
            : "pending",
    rawStatus: dp.status,
    createdAt: dp.createdAt,
    verifiedAt: dp.verifiedAt,
    entityId: dp.id,
  }));

  const printedRows: LedgerRow[] = (data.printedOrders || []).map((po) => ({
    key: `prt_${po.id}`,
    kind: "printed",
    kindLabel: `Printed Book (${po.quantity}x)`,
    customerName: po.fullName,
    email: po.email,
    reference: po.paymentReference || po.orderNumber,
    transferReference: po.transferReference || "",
    paymentMethod:
      po.paymentMethod === "paystack"
        ? "Paystack"
        : po.paymentMethod === "bank_transfer"
          ? "Bank Transfer"
          : "Unselected",
    amountKobo: po.finalTotalKobo ?? po.subtotalKobo,
    currency: po.currency,
    status:
      po.paymentStatus === "paid"
        ? "verified"
        : po.paymentStatus === "refunded"
          ? "refunded"
          : po.paymentStatus === "failed"
            ? "failed"
            : "pending",
    rawStatus: po.paymentStatus,
    createdAt: po.createdAt,
    verifiedAt: po.paidAt,
    entityId: po.id,
  }));

  const membershipRows: LedgerRow[] = data.payments.map((p) => ({
    key: `mem_${p.id}`,
    kind: "membership",
    kindLabel: `Legacy ${p.planName}`,
    customerName: p.userName || "Reader",
    email: p.email || "",
    reference: p.reference,
    transferReference: "",
    paymentMethod: "Paystack",
    amountKobo: p.amountKobo,
    currency: p.currency,
    status:
      p.status === "succeeded"
        ? "verified"
        : p.status === "refunded"
          ? "refunded"
          : p.status === "failed" || p.status === "abandoned"
            ? "failed"
            : "pending",
    rawStatus: p.status,
    createdAt: p.createdAt,
    verifiedAt: p.verifiedAt,
    entityId: p.id,
  }));

  const allLedger = [...digitalRows, ...printedRows, ...membershipRows].sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt),
  );

  const filtered = allLedger.filter((row) => {
    if (kindFilter !== "all" && row.kind !== kindFilter) return false;
    if (statusFilter !== "all" && row.status !== statusFilter) return false;
    const rowDate = (row.verifiedAt || row.createdAt).slice(0, 10);
    if (startDate && rowDate < startDate) return false;
    if (endDate && rowDate > endDate) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (
        !`${row.customerName} ${row.email} ${row.reference} ${row.transferReference} ${row.kindLabel}`
          .toLowerCase()
          .includes(q)
      ) {
        return false;
      }
    }
    return true;
  });

  const filteredVerifiedTotalKobo = filtered
    .filter((r) => r.status === "verified" && r.currency === "NGN")
    .reduce((sum, r) => sum + r.amountKobo, 0);

  const pendingReconciliation = allLedger.filter(
    (r) =>
      r.status === "pending" &&
      (r.rawStatus === "verifying_transfer" ||
        r.rawStatus === "awaiting_verification" ||
        r.kind === "digital"),
  );

  return (
    <div className="stack">
      <div className="section-title" style={{ margin: 0 }}>
        <div>
          <h2>Payments &amp; Financial Administration</h2>
          <p className="muted" style={{ margin: 0 }}>
            Verified revenue includes only settled Paystack transactions and
            administrator-verified bank transfers. Pending, failed, or refunded
            transactions are never counted as revenue.
          </p>
        </div>
        <span className="pill">
          Paystack:{" "}
          {data.paymentsConfig.configured
            ? "Configured"
            : "Not configured (safe mode)"}
        </span>
      </div>

      {/* Financial Summary Cards */}
      <div className="metric-grid">
        <div className="metric">
          <CreditCard size={22} />
          <strong>
            {money(
              data.metrics.totalSalesKobo ?? data.metrics.verifiedRevenueKobo,
            )}
          </strong>
          <span>Total Verified Revenue (All Time)</span>
        </div>
        <div className="metric">
          <CheckCircle2 size={22} />
          <strong>
            {money(
              data.metrics.digitalAccessRevenueKobo ??
                data.metrics.digitalRevenueKobo +
                  data.metrics.subscriptionRevenueKobo,
            )}
          </strong>
          <span>Verified Digital Access Revenue</span>
        </div>
        <div className="metric">
          <Landmark size={22} />
          <strong>{money(data.metrics.printedBookRevenueKobo ?? 0)}</strong>
          <span>Verified Printed Book Revenue</span>
        </div>
        <div className="metric">
          <CreditCard size={22} />
          <strong>{money(filteredVerifiedTotalKobo)}</strong>
          <span>Verified Total in Current Filter ({filtered.length} rows)</span>
        </div>
      </div>

      {/* Manual Bank-Transfer Reconciliation Queue */}
      {pendingReconciliation.length > 0 && (
        <div className="panel stack">
          <h3>
            Bank Transfers &amp; Pending Payments Awaiting Verification (
            {pendingReconciliation.length})
          </h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Product</th>
                  <th>Customer</th>
                  <th>Reference / Transfer ID</th>
                  <th>Amount</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pendingReconciliation.map((item) => (
                  <tr key={item.key}>
                    <td>
                      {new Date(item.createdAt).toLocaleDateString("en-GB")}
                    </td>
                    <td>{item.kindLabel}</td>
                    <td>
                      <strong>{item.customerName}</strong>
                      <br />
                      <small className="muted">{item.email}</small>
                    </td>
                    <td>
                      <code>{item.reference}</code>
                      {item.transferReference ? (
                        <>
                          <br />
                          <small className="muted">
                            Transfer: {item.transferReference}
                          </small>
                        </>
                      ) : null}
                    </td>
                    <td>{money(item.amountKobo)}</td>
                    <td>
                      <div className="actions">
                        {item.kind === "digital" && canWriteDigital && (
                          <>
                            <button
                              type="button"
                              className="button small"
                              disabled={busy}
                              onClick={() =>
                                save(
                                  `/admin/digital-purchases/${item.entityId}/reconcile`,
                                  {
                                    action: "approve",
                                    adminNotes:
                                      "Verified via Payments administration",
                                  },
                                  "POST",
                                  `Verified transfer ${item.reference} and activated access.`,
                                )
                              }
                            >
                              Verify &amp; Activate
                            </button>
                            <button
                              type="button"
                              className="button outline small"
                              disabled={busy}
                              onClick={() => {
                                setFormError?.("");
                                setRejectItem(item);
                              }}
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {item.kind === "printed" && canWritePayments && (
                          <button
                            type="button"
                            className="button small"
                            disabled={busy}
                            onClick={() =>
                              save(
                                `/admin/printed-orders/${item.entityId}`,
                                {
                                  paymentStatus: "paid",
                                  fulfillmentStatus: "processing",
                                },
                                "PATCH",
                                `Confirmed payment for order ${item.reference}.`,
                              )
                            }
                          >
                            Confirm Paid &amp; Process
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Ledger Filters */}
      <div className="filters">
        <label className="search-box">
          <Search size={18} />
          <input
            aria-label="Search payment ledger"
            placeholder="Search customer, email, payment reference, or transfer ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <select
          aria-label="Filter payments by product"
          value={kindFilter}
          onChange={(e) => setKindFilter(e.target.value)}
        >
          <option value="all">All products</option>
          <option value="digital">2027 Digital Access</option>
          <option value="printed">Printed Book Orders</option>
          <option value="membership">Earlier Memberships</option>
        </select>
        <select
          aria-label="Filter payments by status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">All payment statuses</option>
          <option value="verified">Verified / Paid</option>
          <option value="pending">Pending / Awaiting Verification</option>
          <option value="failed">Failed</option>
          <option value="refunded">Refunded</option>
        </select>
        <input
          type="date"
          aria-label="Filter start date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />
        <input
          type="date"
          aria-label="Filter end date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
        />
      </div>

      {/* Unified Financial Ledger Table */}
      <ErrorBox message={formError} />
      {filtered.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Product</th>
                <th>Customer</th>
                <th>Reference</th>
                <th>Method</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered
                .slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
                .map((row) => (
                <tr key={row.key}>
                  <td>
                    {new Date(
                      row.verifiedAt || row.createdAt,
                    ).toLocaleDateString("en-GB")}
                  </td>
                  <td>{row.kindLabel}</td>
                  <td>
                    <strong>{row.customerName}</strong>
                    <br />
                    <small className="muted">{row.email}</small>
                  </td>
                  <td className="reference">
                    <code>{row.reference}</code>
                    {row.transferReference ? (
                      <>
                        <br />
                        <small className="muted">
                          Transfer: {row.transferReference}
                        </small>
                      </>
                    ) : null}
                  </td>
                  <td>{row.paymentMethod}</td>
                  <td>
                    <strong>{money(row.amountKobo)}</strong>
                  </td>
                  <td>
                    <span className="pill">{row.rawStatus}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty title="No payment transactions match this filter">
          Verified Digital Access purchases and Printed Book payments will
          appear here.
        </Empty>
      )}

      <PaginationBar
        page={page}
        totalPages={Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))}
        total={filtered.length}
        label="transactions"
        onPage={setPage}
      />

      <ConfirmDialog
        open={Boolean(rejectItem)}
        title={`Reject bank transfer ${rejectItem?.reference || ""}?`}
        description="This marks the online access purchase failed without activating reader access."
        confirmLabel="Confirm Reject"
        busy={busy}
        error={formError}
        onCancel={() => {
          setFormError?.("");
          setRejectItem(null);
        }}
        onConfirm={async () => {
          if (!rejectItem) return;
          const ok = await save(
            `/admin/digital-purchases/${rejectItem.entityId}/reconcile`,
            {
              action: "reject",
              adminNotes: "Unverified transfer",
            },
            "POST",
            `Marked transfer ${rejectItem.reference} unverified.`,
          );
          if (ok) setRejectItem(null);
        }}
      />
    </div>
  );
}


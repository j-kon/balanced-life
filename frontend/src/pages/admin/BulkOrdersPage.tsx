import { useState } from "react";
import { X } from "lucide-react";
import { Empty } from "../../components/Common";
import { money } from "../../api";
import type { BulkOrderRecord } from "../../types";
import type { AdminOverviewData, AdminSaveFn } from "./AdminTypes";

export function BulkOrdersPage({
  data,
  busy,
  save,
}: {
  data: AdminOverviewData;
  busy: boolean;
  save: AdminSaveFn;
}) {
  const [bulkFilter, setBulkFilter] = useState("all");
  const [editingBulk, setEditingBulk] = useState<BulkOrderRecord | null>(null);

  const filteredBulkOrders = data.bulkOrders.filter(
    (b) => bulkFilter === "all" || b.status === bulkFilter,
  );

  return (
    <div className="stack">
      <div className="section-title" style={{ margin: 0 }}>
        <div>
          <h2>
            Bulk &amp; Institutional Orders ({filteredBulkOrders.length})
          </h2>
          <p className="muted" style={{ margin: 0 }}>
            Manage bulk requests from schools, churches, youth organizations,
            and families. Discounts are never invented automatically — enter
            agreed quotations and convert approved bulk orders into Printed
            Orders without duplicating financial totals.
          </p>
        </div>
        <select
          aria-label="Filter bulk orders by status"
          value={bulkFilter}
          onChange={(e) => setBulkFilter(e.target.value)}
        >
          <option value="all">All statuses</option>
          <option value="new">New</option>
          <option value="contacted">Contacted</option>
          <option value="quoted">Quoted</option>
          <option value="approved">Approved</option>
          <option value="converted">Converted to Order</option>
          <option value="fulfilled">Fulfilled</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {editingBulk && (
        <form
          className="panel stack"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const discountRaw = String(f.get("discountPercent") || "").trim();
            const agreedRaw = String(f.get("agreedTotalNgn") || "").trim();
            await save(
              `/admin/bulk-orders/${editingBulk.id}`,
              {
                status: f.get("status"),
                unitPriceKobo: Math.round(Number(f.get("unitPriceNgn")) * 100),
                discountPercent:
                  discountRaw === "" ? null : Number(discountRaw),
                agreedTotalKobo:
                  agreedRaw === ""
                    ? null
                    : Math.round(Number(agreedRaw) * 100),
                quotationSummary: f.get("quotationSummary") || "",
                fulfillmentStatus: f.get("fulfillmentStatus"),
                trackingNote: f.get("trackingNote") || "",
                contactHistory: f.get("contactHistory") || "",
                adminNotes: f.get("adminNotes") || "",
              },
              "PATCH",
            );
            setEditingBulk(null);
          }}
        >
          <div className="section-title" style={{ margin: 0 }}>
            <h3>
              Prepare Quotation &amp; Fulfillment:{" "}
              {editingBulk.organizationName} ({editingBulk.quantity} copies)
            </h3>
            <button
              type="button"
              className="icon-button"
              aria-label="Close bulk order editor"
              onClick={() => setEditingBulk(null)}
            >
              <X />
            </button>
          </div>
          <div className="form-row-2">
            <label>
              Inquiry / Order status
              <select name="status" defaultValue={editingBulk.status}>
                <option value="new">New</option>
                <option value="contacted">Contacted</option>
                <option value="quoted">Quotation Sent</option>
                <option value="approved">Approved by Client</option>
                <option value="converted">Converted to Order</option>
                <option value="fulfilled">Fulfilled</option>
                <option value="archived">Archived</option>
              </select>
            </label>
            <label>
              Fulfillment status
              <select
                name="fulfillmentStatus"
                defaultValue={editingBulk.fulfillmentStatus}
              >
                <option value="pending">Pending</option>
                <option value="processing">Processing</option>
                <option value="shipped">Shipped / In Transit</option>
                <option value="delivered">Delivered</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </label>
          </div>
          <div className="form-row-2">
            <label>
              Unit price (NGN)
              <input
                name="unitPriceNgn"
                type="number"
                min={1}
                defaultValue={editingBulk.unitPriceKobo / 100}
                required
              />
            </label>
            <label>
              Custom bulk discount % (optional)
              <input
                name="discountPercent"
                type="number"
                min={0}
                max={100}
                step="0.5"
                defaultValue={editingBulk.discountPercent ?? ""}
                placeholder="Leave blank if no discount configured"
              />
            </label>
          </div>
          <div className="form-row-2">
            <label>
              Agreed final total in NGN (optional)
              <input
                name="agreedTotalNgn"
                type="number"
                min={0}
                defaultValue={
                  editingBulk.agreedTotalKobo !== null
                    ? editingBulk.agreedTotalKobo / 100
                    : ""
                }
                placeholder="Record agreed invoice total…"
              />
            </label>
            <label>
              Delivery tracking note
              <input
                name="trackingNote"
                defaultValue={editingBulk.trackingNote}
                placeholder="Courier, dispatch date, or recipient note…"
              />
            </label>
          </div>
          <label>
            Quotation summary
            <textarea
              name="quotationSummary"
              rows={2}
              defaultValue={editingBulk.quotationSummary}
              placeholder="Details of quotation shared with the school, church, or organization…"
            />
          </label>
          <label>
            Contact history &amp; communication log
            <textarea
              name="contactHistory"
              rows={2}
              defaultValue={editingBulk.contactHistory || ""}
              placeholder="Record dates and outcomes of calls/emails with the organization…"
            />
          </label>
          <label>
            Internal admin notes
            <textarea
              name="adminNotes"
              rows={2}
              defaultValue={editingBulk.adminNotes}
            />
          </label>
          <div className="actions">
            <button className="button" disabled={busy}>
              Save quotation &amp; fulfillment
            </button>
            <button
              type="button"
              className="button outline"
              onClick={() => setEditingBulk(null)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {filteredBulkOrders.length ? (
        filteredBulkOrders.map((b) => (
          <div className="panel stack" key={b.id}>
            <div className="section-title" style={{ margin: 0 }}>
              <div>
                <h3>
                  {b.organizationName}{" "}
                  <small>
                    ({b.organizationType} · {b.quantity} copies ·{" "}
                    {b.preferredFormat})
                  </small>
                </h3>
                <small>
                  Contact: {b.contactName} · {b.email} · {b.phone} · Delivery:{" "}
                  {b.deliveryLocation}
                </small>
              </div>
              <div className="actions">
                <span className="pill">Status: {b.status}</span>
                <span className="pill">Fulfillment: {b.fulfillmentStatus}</span>
                {b.linkedPrintedOrderId ? (
                  <span className="pill">
                    Linked Printed Order #{b.linkedPrintedOrderId}
                  </span>
                ) : null}
              </div>
            </div>
            {b.notes && <p className="preserve-lines">Notes: {b.notes}</p>}
            <p>
              <strong>Unit Price:</strong> {money(b.unitPriceKobo)} ·{" "}
              <strong>Discount:</strong>{" "}
              {b.discountPercent !== null
                ? `${b.discountPercent}%`
                : "Not set"}{" "}
              · <strong>Quoted Total:</strong>{" "}
              {b.quotedTotalKobo !== null ? money(b.quotedTotalKobo) : "—"} ·{" "}
              <strong>Agreed Total:</strong>{" "}
              {b.agreedTotalKobo !== null ? money(b.agreedTotalKobo) : "—"}
            </p>
            {b.quotationSummary && (
              <p>
                <strong>Quotation:</strong> {b.quotationSummary}
              </p>
            )}
            {b.contactHistory && (
              <p>
                <strong>Contact History:</strong> {b.contactHistory}
              </p>
            )}
            <div className="actions">
              <button
                type="button"
                className="button small"
                onClick={() => setEditingBulk(b)}
              >
                Prepare Quotation / Update Order
              </button>
              {!b.linkedPrintedOrderId && (
                <button
                  type="button"
                  className="button outline small"
                  disabled={busy}
                  onClick={() =>
                    save(
                      `/admin/bulk-orders/${b.id}`,
                      { status: "converted", convertToPrintedOrder: true },
                      "PATCH",
                    )
                  }
                >
                  Convert &amp; Link to Printed Order
                </button>
              )}
            </div>
          </div>
        ))
      ) : (
        <Empty title="No bulk order inquiries yet">
          Bulk requests from parents, schools, churches, and youth organizations
          will appear here.
        </Empty>
      )}
    </div>
  );
}


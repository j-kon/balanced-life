import { useState } from "react";
import { Printer, Search, Truck, X } from "lucide-react";
import { Empty } from "../../components/Common";
import { money } from "../../api";
import type { PrintedOrderRecord } from "../../types";
import type { AdminOverviewData, AdminSaveFn } from "./AdminTypes";

export function PrintedOrdersPage({
  data,
  busy,
  save,
}: {
  data: AdminOverviewData;
  busy: boolean;
  save: AdminSaveFn;
}) {
  const [search, setSearch] = useState("");
  const [fulfillmentFilter, setFulfillmentFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [editingOrder, setEditingOrder] = useState<PrintedOrderRecord | null>(
    null,
  );
  const [packingSlipOrder, setPackingSlipOrder] =
    useState<PrintedOrderRecord | null>(null);
  const [inquiryFilter, setInquiryFilter] = useState("all");

  const orders = data.printedOrders || [];

  const filteredOrders = orders.filter((po) => {
    if (
      fulfillmentFilter !== "all" &&
      po.fulfillmentStatus !== fulfillmentFilter
    ) {
      return false;
    }
    if (paymentFilter !== "all" && po.paymentStatus !== paymentFilter) {
      return false;
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (
        !`${po.orderNumber} ${po.fullName} ${po.email} ${po.phone} ${po.streetAddress} ${po.city} ${po.state} ${po.trackingReference || ""}`
          .toLowerCase()
          .includes(q)
      ) {
        return false;
      }
    }
    return true;
  });

  const filteredInquiries = data.inquiries.filter(
    (i) => inquiryFilter === "all" || i.status === inquiryFilter,
  );

  return (
    <div className="stack">
      {/* Product B & Delivery Policy Settings */}
      <form
        className="panel stack"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const defaultFeeRaw = String(
            f.get("defaultDeliveryFeeNgn") || "",
          ).trim();
          save(
            "/admin/settings",
            {
              hardcoverPriceKobo: Math.round(Number(f.get("price")) * 100),
              printedBookStockCount: Number(f.get("stockCount") || 0),
              hardcoverAvailability: f.get("availability"),
              deliveryPricingMode: f.get("deliveryPricingMode"),
              defaultDeliveryFeeKobo:
                defaultFeeRaw === ""
                  ? null
                  : Math.round(Number(defaultFeeRaw) * 100),
              deliveryPolicyNote: f.get("deliveryPolicyNote"),
              hardcoverNote: f.get("note"),
            },
            "PUT",
          );
        }}
      >
        <h2>Product B: Printed Devotional Book (₦5,000) &amp; Delivery Policy</h2>
        <div className="form-row-2">
          <label>
            Printed copy price (NGN)
            <input
              name="price"
              type="number"
              min={100}
              step="1"
              defaultValue={data.settings.hardcoverPriceKobo / 100}
              required
            />
          </label>
          <label>
            Printed book inventory / stock count
            <input
              name="stockCount"
              type="number"
              min={0}
              max={1000000}
              defaultValue={data.settings.printedBookStockCount ?? 500}
              required
            />
          </label>
        </div>
        <div className="form-row-2">
          <label>
            Availability status
            <select
              name="availability"
              defaultValue={data.settings.hardcoverAvailability}
            >
              <option value="available">Available for order</option>
              <option value="preorder">Open for pre-order</option>
              <option value="out_of_stock">Out of stock</option>
            </select>
          </label>
          <label>
            Delivery fee policy mode
            <select
              name="deliveryPricingMode"
              defaultValue={
                data.settings.deliveryPricingMode || "quotation_required"
              }
            >
              <option value="quotation_required">
                Quotation required by address (Default — never invent fee)
              </option>
              <option value="fixed_fee">
                Fixed standard delivery fee across orders
              </option>
            </select>
          </label>
        </div>
        <div className="form-row-2">
          <label>
            Default fixed delivery fee in NGN (leave blank unless using fixed
            fee)
            <input
              name="defaultDeliveryFeeNgn"
              type="number"
              min={0}
              step="1"
              defaultValue={
                data.settings.defaultDeliveryFeeKobo !== null &&
                data.settings.defaultDeliveryFeeKobo !== undefined
                  ? data.settings.defaultDeliveryFeeKobo / 100
                  : ""
              }
              placeholder="No default fee — quoted per delivery address"
            />
          </label>
          <label>
            Bookstore availability note
            <input
              name="note"
              defaultValue={data.settings.hardcoverNote}
              required
            />
          </label>
        </div>
        <label>
          Delivery policy note shown to customers
          <input
            name="deliveryPolicyNote"
            defaultValue={
              data.settings.deliveryPolicyNote ||
              "Delivery fees are calculated based on your city and state and confirmed before payment."
            }
            required
          />
        </label>
        <button className="button outline small" disabled={busy}>
          Save Printed Book &amp; Delivery Settings
        </button>
      </form>

      {/* Printable Packing Slip Modal */}
      {packingSlipOrder && (
        <div className="panel stack packing-slip-panel">
          <div className="section-title" style={{ margin: 0 }}>
            <div>
              <span className="eyebrow">
                {data.settings.organizationName} · Fulfillment Packing Slip
              </span>
              <h3>Order {packingSlipOrder.orderNumber}</h3>
            </div>
            <div className="actions">
              <button
                type="button"
                className="button small"
                onClick={() => window.print()}
              >
                <Printer size={15} /> Print Packing Slip
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label="Close packing slip"
                onClick={() => setPackingSlipOrder(null)}
              >
                <X />
              </button>
            </div>
          </div>
          <div className="form-row-2">
            <div>
              <strong>Deliver To:</strong>
              <p style={{ margin: "4px 0 0" }}>
                {packingSlipOrder.fullName}
                <br />
                {packingSlipOrder.streetAddress}
                <br />
                {packingSlipOrder.city}, {packingSlipOrder.state},{" "}
                {packingSlipOrder.country}
                {packingSlipOrder.deliveryLandmark
                  ? ` (Landmark: ${packingSlipOrder.deliveryLandmark})`
                  : ""}
                <br />
                Phone: {packingSlipOrder.phone} · Email:{" "}
                {packingSlipOrder.email}
              </p>
            </div>
            <div>
              <strong>Order &amp; Dispatch Details:</strong>
              <p style={{ margin: "4px 0 0" }}>
                Date:{" "}
                {new Date(packingSlipOrder.createdAt).toLocaleDateString(
                  "en-GB",
                )}
                <br />
                Payment Status:{" "}
                <strong>{packingSlipOrder.paymentStatus}</strong>
                <br />
                Fulfillment Status:{" "}
                <strong>{packingSlipOrder.fulfillmentStatus}</strong>
                <br />
                Courier: {packingSlipOrder.courierName || "—"} · Tracking:{" "}
                {packingSlipOrder.trackingReference || "—"}
              </p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Quantity</th>
                  <th>Unit Price</th>
                  <th>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    {data.settings.siteTitle} — 2027 Printed Devotional Book
                  </td>
                  <td>{packingSlipOrder.quantity}</td>
                  <td>{money(packingSlipOrder.unitPriceKobo)}</td>
                  <td>{money(packingSlipOrder.subtotalKobo)}</td>
                </tr>
                <tr>
                  <td colSpan={3}>Delivery Fee</td>
                  <td>
                    {packingSlipOrder.deliveryFeeKobo !== null
                      ? money(packingSlipOrder.deliveryFeeKobo)
                      : "Pending Quote"}
                  </td>
                </tr>
                <tr>
                  <td colSpan={3}>
                    <strong>Final Total</strong>
                  </td>
                  <td>
                    <strong>
                      {packingSlipOrder.finalTotalKobo !== null
                        ? money(packingSlipOrder.finalTotalKobo)
                        : "Pending Quote"}
                    </strong>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          {packingSlipOrder.customerDeliveryNotes && (
            <p style={{ margin: 0 }}>
              <strong>Customer Delivery Notes:</strong>{" "}
              {packingSlipOrder.customerDeliveryNotes}
            </p>
          )}
        </div>
      )}

      {/* Order Quotation, Payment Verification & Fulfillment Editor */}
      {editingOrder && (
        <form
          className="panel stack"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const feeRaw = String(f.get("deliveryFeeNgn") || "").trim();
            const finalRaw = String(f.get("finalTotalNgn") || "").trim();
            await save(
              `/admin/printed-orders/${editingOrder.id}`,
              {
                deliveryFeeKobo:
                  feeRaw === "" ? null : Math.round(Number(feeRaw) * 100),
                finalTotalKobo:
                  finalRaw === "" ? null : Math.round(Number(finalRaw) * 100),
                paymentStatus: f.get("paymentStatus"),
                fulfillmentStatus: f.get("fulfillmentStatus"),
                dispatchExceptionNote:
                  String(f.get("dispatchExceptionNote") || "").trim() ||
                  undefined,
                courierName: String(f.get("courierName") || "").trim(),
                trackingReference: String(
                  f.get("trackingReference") || "",
                ).trim(),
                adminNotes: String(f.get("adminNotes") || "").trim(),
              },
              "PATCH",
            );
            setEditingOrder(null);
          }}
        >
          <div className="section-title" style={{ margin: 0 }}>
            <div>
              <h3>
                Manage Printed Book Order: {editingOrder.orderNumber} (
                {editingOrder.quantity} cop
                {editingOrder.quantity === 1 ? "y" : "ies"})
              </h3>
              <small className="muted">
                Customer: {editingOrder.fullName} · {editingOrder.email} ·{" "}
                {editingOrder.phone}
              </small>
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label="Close printed order editor"
              onClick={() => setEditingOrder(null)}
            >
              <X />
            </button>
          </div>

          <div className="panel" style={{ background: "var(--cream)" }}>
            <strong>Delivery Address:</strong> {editingOrder.streetAddress},{" "}
            {editingOrder.city}, {editingOrder.state}, {editingOrder.country}
            {editingOrder.deliveryLandmark
              ? ` · Landmark: ${editingOrder.deliveryLandmark}`
              : ""}
            {editingOrder.customerDeliveryNotes
              ? ` · Note: ${editingOrder.customerDeliveryNotes}`
              : ""}
            <br />
            <strong>Book Subtotal:</strong> {money(editingOrder.subtotalKobo)} (
            {editingOrder.quantity} × {money(editingOrder.unitPriceKobo)}) ·{" "}
            <strong>Quote Status:</strong>{" "}
            {editingOrder.deliveryQuoteStatus.replace(/_/g, " ")}
            {editingOrder.transferReference
              ? ` · Bank Transfer Ref: ${editingOrder.transferReference}`
              : ""}
          </div>

          <div className="form-row-2">
            <label>
              Quoted delivery fee (NGN)
              <input
                name="deliveryFeeNgn"
                type="number"
                min={0}
                step="1"
                defaultValue={
                  editingOrder.deliveryFeeKobo !== null
                    ? editingOrder.deliveryFeeKobo / 100
                    : ""
                }
                placeholder="Enter delivery fee in NGN to quote customer…"
              />
            </label>
            <label>
              Final total override in NGN (optional — auto-computed as subtotal
              + delivery fee)
              <input
                name="finalTotalNgn"
                type="number"
                min={0}
                step="1"
                defaultValue={
                  editingOrder.finalTotalKobo !== null
                    ? editingOrder.finalTotalKobo / 100
                    : ""
                }
                placeholder="Auto-computed when delivery fee is saved"
              />
            </label>
          </div>

          <div className="form-row-2">
            <label>
              Payment status
              <select
                name="paymentStatus"
                defaultValue={editingOrder.paymentStatus}
              >
                <option value="pending">Pending</option>
                <option value="awaiting_verification">
                  Awaiting Bank-Transfer Verification
                </option>
                <option value="paid">Paid / Verified</option>
                <option value="failed">Failed</option>
                <option value="refunded">Refunded</option>
              </select>
            </label>
            <label>
              Fulfillment status
              <select
                name="fulfillmentStatus"
                defaultValue={editingOrder.fulfillmentStatus}
              >
                <option value="new">New</option>
                <option value="awaiting_delivery_quotation">
                  Awaiting Delivery Quotation
                </option>
                <option value="awaiting_payment">Awaiting Payment</option>
                <option value="processing">Processing</option>
                <option value="ready_for_dispatch">Ready for Dispatch</option>
                <option value="shipped">Shipped / Dispatched</option>
                <option value="delivered">Delivered</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </label>
          </div>

          <div className="form-row-2">
            <label>
              Courier / Delivery rider name
              <input
                name="courierName"
                defaultValue={editingOrder.courierName}
                placeholder="e.g. GIG Logistics / DHL / Cossy Dispatch"
              />
            </label>
            <label>
              Tracking reference / Waybill number
              <input
                name="trackingReference"
                defaultValue={editingOrder.trackingReference}
                placeholder="e.g. GIG-2027-99102"
              />
            </label>
          </div>

          <label>
            Unpaid dispatch exception note (required ONLY if marking an unpaid
            order as ready for dispatch, shipped, or delivered)
            <input
              name="dispatchExceptionNote"
              defaultValue={editingOrder.dispatchExceptionNote}
              placeholder="Leave blank for normal paid orders…"
            />
          </label>

          <label>
            Internal administrator notes
            <textarea
              name="adminNotes"
              rows={2}
              defaultValue={editingOrder.adminNotes}
              placeholder="Record delivery arrangement, payment verification, or customer communication…"
            />
          </label>

          <div className="actions">
            <button className="button small" disabled={busy}>
              <Truck size={15} /> Save Order &amp; Fulfillment Update
            </button>
            <button
              type="button"
              className="button outline small"
              onClick={() => setPackingSlipOrder(editingOrder)}
            >
              <Printer size={15} /> Open Packing Slip
            </button>
            <button
              type="button"
              className="button outline small"
              onClick={() => setEditingOrder(null)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Search & Filters for Printed Orders */}
      <div className="section-title" style={{ margin: 0 }}>
        <h2>Printed Book Orders ({filteredOrders.length})</h2>
      </div>
      <div className="filters">
        <label className="search-box">
          <Search size={18} />
          <input
            aria-label="Search printed orders"
            placeholder="Search by order #, customer, phone, email, city, or state…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <select
          aria-label="Filter printed orders by fulfillment status"
          value={fulfillmentFilter}
          onChange={(e) => setFulfillmentFilter(e.target.value)}
        >
          <option value="all">All fulfillment statuses</option>
          <option value="new">New</option>
          <option value="awaiting_delivery_quotation">
            Awaiting Delivery Quotation
          </option>
          <option value="awaiting_payment">Awaiting Payment</option>
          <option value="processing">Processing</option>
          <option value="ready_for_dispatch">Ready for Dispatch</option>
          <option value="shipped">Shipped</option>
          <option value="delivered">Delivered</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select
          aria-label="Filter printed orders by payment status"
          value={paymentFilter}
          onChange={(e) => setPaymentFilter(e.target.value)}
        >
          <option value="all">All payment statuses</option>
          <option value="pending">Pending</option>
          <option value="awaiting_verification">Awaiting Verification</option>
          <option value="paid">Paid</option>
          <option value="failed">Failed</option>
          <option value="refunded">Refunded</option>
        </select>
      </div>

      {/* Printed Orders Table */}
      {filteredOrders.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Order #</th>
                <th>Customer &amp; Contact</th>
                <th>Delivery Location</th>
                <th>Qty</th>
                <th>Subtotal</th>
                <th>Delivery Fee</th>
                <th>Final Total</th>
                <th>Payment</th>
                <th>Fulfillment</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((po) => (
                <tr key={po.id}>
                  <td>
                    <strong>{po.orderNumber}</strong>
                    <br />
                    <small className="muted">
                      {new Date(po.createdAt).toLocaleDateString("en-GB")}
                    </small>
                  </td>
                  <td>
                    <strong>{po.fullName}</strong>
                    <br />
                    <small className="muted">
                      {po.email} · {po.phone}
                    </small>
                  </td>
                  <td>
                    {po.city}, {po.state}
                    <br />
                    <small className="muted">{po.streetAddress}</small>
                  </td>
                  <td>{po.quantity}</td>
                  <td>{money(po.subtotalKobo)}</td>
                  <td>
                    {po.deliveryFeeKobo !== null ? (
                      money(po.deliveryFeeKobo)
                    ) : (
                      <span className="pill">Quote needed</span>
                    )}
                  </td>
                  <td>
                    <strong>
                      {po.finalTotalKobo !== null
                        ? money(po.finalTotalKobo)
                        : "—"}
                    </strong>
                  </td>
                  <td>
                    <span className="pill">
                      {po.paymentStatus.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td>
                    <span className="pill">
                      {po.fulfillmentStatus.replace(/_/g, " ")}
                    </span>
                    {po.trackingReference ? (
                      <small
                        className="muted"
                        style={{ display: "block", marginTop: "2px" }}
                      >
                        Track: {po.trackingReference}
                      </small>
                    ) : null}
                  </td>
                  <td>
                    <div className="actions">
                      <button
                        type="button"
                        className="button small"
                        onClick={() => setEditingOrder(po)}
                      >
                        Manage
                      </button>
                      <button
                        type="button"
                        className="button outline small"
                        onClick={() => setPackingSlipOrder(po)}
                      >
                        Slip
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty title="No printed book orders match this view">
          Orders placed on the Bookstore page will appear here for delivery
          quotation, payment confirmation, and dispatch.
        </Empty>
      )}

      {/* Bookstore & General Contact Inquiries */}
      <div className="section-title" style={{ marginTop: "12px" }}>
        <h2>
          Bookstore &amp; Contact Inquiries ({filteredInquiries.length})
        </h2>
        <select
          aria-label="Filter inquiries by status"
          value={inquiryFilter}
          onChange={(e) => setInquiryFilter(e.target.value)}
        >
          <option value="all">All statuses</option>
          <option value="new">New</option>
          <option value="reviewed">Reviewed</option>
          <option value="contacted">Contacted</option>
          <option value="fulfilled">Fulfilled</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {filteredInquiries.length ? (
        filteredInquiries.map((i) => (
          <div className="panel stack" key={i.id}>
            <div className="section-title" style={{ margin: 0 }}>
              <div>
                <h3>
                  {i.name}{" "}
                  <small>
                    ({i.inquiryType === "hardcover"
                      ? `Printed copy · ${i.quantity} cop${i.quantity === 1 ? "y" : "ies"}`
                      : "General contact"})
                  </small>
                </h3>
                <small>
                  {new Date(i.createdAt).toLocaleString("en-GB")} · {i.email}
                  {i.phone ? ` · ${i.phone}` : ""}
                  {i.deliveryLocation ? ` · ${i.deliveryLocation}` : ""}
                </small>
              </div>
              <span className="pill">{i.status}</span>
            </div>
            <p className="preserve-lines">
              {i.message || "Interested in the printed edition."}
            </p>
            <div className="actions">
              {(
                [
                  "new",
                  "reviewed",
                  "contacted",
                  "fulfilled",
                  "archived",
                ] as const
              ).map((st) => (
                <button
                  key={st}
                  type="button"
                  className={
                    "button small " + (i.status === st ? "" : "outline")
                  }
                  disabled={busy || i.status === st}
                  onClick={() =>
                    save("/admin/inquiries/" + i.id, { status: st })
                  }
                >
                  Mark {st}
                </button>
              ))}
            </div>
          </div>
        ))
      ) : (
        <Empty title="No inquiries in this view">
          Contact messages and legacy hardcover inquiries will appear here.
        </Empty>
      )}
    </div>
  );
}


import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Building2,
  Check,
  CheckCircle2,
  CreditCard,
  Globe,
  Landmark,
  Mail,
  MapPin,
  Phone,
  Shield,
  ShoppingBag,
  Users,
} from "lucide-react";
import { useApp } from "../../context/AppContext";
import { Cover, ErrorBox, Loading } from "../../components/Common";
import { api, money } from "../../api";
import type {
  BankAccountSetting,
  DigitalEntitlementRecord,
  DigitalPurchaseRecord,
  PrintedOrderRecord,
} from "../../types";

export function PricingSection({ embedded = false }: { embedded?: boolean }) {
  const { config } = useApp();
  const durationMonths = config.settings.digitalAccessDurationMonths || 12;
  return (
    <section
      id="get-your-copy"
      className={embedded ? "pricing-section section" : "container section"}
    >
      <div className={embedded ? "container" : ""}>
        <div className="center-heading">
          <span className="eyebrow">Choose your reading experience</span>
          <h2>One devotional. Two ways to grow.</h2>
          <p>
            Keep the printed book close, or carry your daily reading on your
            phone.
          </p>
        </div>
        <div className="purchase-options">
          <article className="panel purchase-option">
            <ShoppingBag size={26} />
            <h3>Printed book</h3>
            <div className="price">{money(config.settings.hardcoverPriceKobo)}</div>
            <p>One hardcover copy of the 2027 devotional.</p>
            <ul className="check-list">
              <li>
                <Check size={16} />
                All 365 daily readings in print
              </li>
              <li>
                <Check size={16} />
                Scripture, reflections and prayers
              </li>
              <li>
                <Check size={16} />
                Order online with delivery to your address
              </li>
            </ul>
            <Link className="button outline" to="/bookstore">
              Order printed book <ArrowRight size={16} />
            </Link>
          </article>
          <article className="panel purchase-option featured-option">
            <BookOpen size={26} />
            <h3>2027 Digital Devotional Access</h3>
            <div className="price">
              {money(config.settings.digitalEditionPriceKobo)}
            </div>
            <p>
              One-time payment for {durationMonths} calendar months of online
              access. No automatic recurring charge.
            </p>
            <ul className="check-list">
              <li>
                <Check size={16} />
                All published 2027 readings for {durationMonths} months
              </li>
              <li>
                <Check size={16} />
                Personal Growth Journal, bookmarks and progress
              </li>
              <li>
                <Check size={16} />
                Read on Android, iPhone, tablet or computer
              </li>
            </ul>
            <Link className="button" to="/digital-edition">
              Get online access <ArrowRight size={16} />
            </Link>
          </article>
        </div>
        <p className="fine-print">
          The printed book and online access are separate purchases. Online
          access covers {durationMonths} calendar months of the 2027 edition and
          can be manually renewed without losing your journals or progress.
        </p>
      </div>
    </section>
  );
}
export function PricingPage() {
  return <PricingSection />;
}

type DigitalEditionResponse = {
  entitlement: DigitalEntitlementRecord | null;
  active: boolean;
  purchases: DigitalPurchaseRecord[];
  product: {
    editionYear: number;
    amountKobo: number;
    durationMonths?: number;
    available: boolean;
    accessScope: "edition_2027" | "includes_membership_updates";
    note: string;
  };
  paymentProvider: {
    name: "paystack";
    configured: boolean;
    publicKey: string | null;
  };
  bankTransfer: {
    enabled: boolean;
    instructions?: string;
    accounts: BankAccountSetting[];
  };
};

export function DigitalEditionPage() {
  const { user, config, toast } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const [data, setData] = useState<DigitalEditionResponse | null>(null);
  const [loading, setLoading] = useState(Boolean(user));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const transferCurrency = "NGN";
  const [transferRef, setTransferRef] = useState("");
  const [payerNote, setPayerNote] = useState("");
  const [proofInput, setProofInput] = useState<Record<number, string>>({});
  const [showRenewalCheckout, setShowRenewalCheckout] = useState(false);

  const loadDigitalStatus = async () => {
    if (!user) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await api<DigitalEditionResponse>("/me/digital-edition");
      setData(res);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDigitalStatus();
  }, [user]);

  const queryRef = new URLSearchParams(location.search).get("reference");

  useEffect(() => {
    if (!queryRef || !user) return;
    setBusy(true);
    setError("");
    api("/digital-purchases/verify", { reference: queryRef })
      .then(() => {
        toast(
          "Payment verified! Your 2027 Digital Edition access is now active.",
        );
        navigate("/digital-edition", { replace: true });
        loadDigitalStatus();
      })
      .catch((e) => {
        setError((e as Error).message);
      })
      .finally(() => setBusy(false));
  }, [queryRef, user]);

  const priceKobo = config.settings.digitalEditionPriceKobo;
  const durationMonths =
    data?.product.durationMonths ||
    config.settings.digitalAccessDurationMonths ||
    12;
  const available = config.settings.digitalEditionAvailability === "available";
  const ent = data?.entitlement;
  const isExpired = ent?.status === "expired";

  return (
    <div className="container section">
      <div className="bookstore">
        <div className="store-art">
          <Cover />
        </div>
        <div>
          <span className="eyebrow">Read on your phone</span>
          <h1>
            Your 2027
            <br />
            online access.
          </h1>
          <p className="lead">
            {config.settings.siteTitle} · {durationMonths}-Month Online Access ·
            2027 Edition
          </p>
          <div className="actions">
            <span className="pill">
              {available
                ? `${durationMonths} calendar months of online access`
                : "Unavailable"}
            </span>
            <span className="pill">
              One-time payment · No automatic recurring charge
            </span>
          </div>
          <h2>{money(priceKobo)}</h2>
          <p>{config.settings.digitalEditionNote}</p>

          <div className="panel stack" style={{ marginTop: "20px" }}>
            <h3>Everything you need for your daily reading</h3>
            <ul className="check-list">
              <li>
                <CheckCircle2 size={16} /> {durationMonths} calendar months of
                online reading access to all published 2027 devotionals (early
                purchases before Jan 1, 2027 run through Jan 1, 2028)
              </li>
              <li>
                <CheckCircle2 size={16} /> Full 5-step Daily Growth &amp;
                Accountability check-ins (Lesson, Reflection, Action Step &amp;
                Progress)
              </li>
              <li>
                <CheckCircle2 size={16} /> Private Growth Journal and saved
                bookmarks preserved permanently on your account
              </li>
              <li>
                <CheckCircle2 size={16} /> Manual 12-month renewal anytime —
                extends from your current expiration date without losing data
              </li>
            </ul>
          </div>

          <ErrorBox message={error} />

          {loading ? (
            <Loading />
          ) : !user ? (
            <div className="panel stack">
              <h3>Sign in or create an account to purchase</h3>
              <p>
                Your online reading access is linked to your personal reader
                account so you can read on any device.
              </p>
              <div className="actions">
                <Link className="button" to="/login">
                  Sign in to purchase <ArrowRight size={17} />
                </Link>
                <Link className="button outline" to="/register">
                  Create reader account
                </Link>
              </div>
            </div>
          ) : (
            <div className="stack">
              {data?.active && ent && (
                <div className="notice success">
                  <CheckCircle2 size={22} />
                  <div>
                    <strong>
                      2027 Digital Edition Active on Your Account
                    </strong>
                    <p>
                      Activated:{" "}
                      <strong>
                        {new Date(
                          ent.startsAt || ent.grantedAt,
                        ).toLocaleDateString("en-GB")}
                      </strong>
                      {ent.legacyPersistent ? (
                        <> · Persistent 2027 Edition Entitlement</>
                      ) : ent.expiresAt ? (
                        <>
                          {" "}
                          · Expires:{" "}
                          <strong>
                            {new Date(ent.expiresAt).toLocaleDateString("en-GB")}
                          </strong>{" "}
                          ({ent.daysRemaining ?? 0} days remaining)
                        </>
                      ) : null}
                    </p>
                    <div className="actions" style={{ marginTop: "12px" }}>
                      <Link className="button small" to="/dashboard">
                        Go to Reader Dashboard <ArrowRight size={15} />
                      </Link>
                      <Link className="button outline small" to="/library">
                        Open 365-Day Library
                      </Link>
                      {!ent.legacyPersistent && (
                        <button
                          type="button"
                          className="button outline small"
                          onClick={() =>
                            setShowRenewalCheckout((prev) => !prev)
                          }
                        >
                          {showRenewalCheckout
                            ? "Hide 12-Month Renewal Options"
                            : `Renew / Extend by ${durationMonths} Months (${money(priceKobo)})`}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {isExpired && ent && (
                <div className="notice">
                  <AlertCircle size={22} />
                  <div>
                    <strong>Your 12-Month Online Access Has Expired</strong>
                    <p>
                      Your previous access period ended on{" "}
                      {ent.expiresAt
                        ? new Date(ent.expiresAt).toLocaleDateString("en-GB")
                        : "your account"}
                      . Your Growth Journal reflections, saved bookmarks, and
                      reading progress are safely preserved. Renew below for
                      another {durationMonths} calendar months ({money(priceKobo)}).
                    </p>
                  </div>
                </div>
              )}

              {(!data?.active || showRenewalCheckout) && (
                <>
                  {/* OPTION 1: PAYSTACK ONLINE CHECKOUT */}
                  <div className="panel stack">
                    <div className="section-title" style={{ margin: 0 }}>
                      <h3>
                        {data?.active
                          ? `Extend Online Access by ${durationMonths} Months`
                          : "Secure payment"}
                      </h3>
                      <CreditCard size={20} />
                    </div>
                    {config.payments.configured ? (
                      <>
                        <p>
                          Pay <strong>{money(priceKobo)}</strong> securely via
                          Paystack using card, bank transfer, or USSD.{" "}
                          {data?.active
                            ? `Your new ${durationMonths}-month term will extend directly from your current expiration date.`
                            : `Your ${durationMonths}-month 2027 Digital Edition access activates automatically as soon as Paystack verifies the transaction.`}
                        </p>
                        <button
                          className="button"
                          disabled={busy || !available}
                          onClick={async () => {
                            setBusy(true);
                            setError("");
                            try {
                              const res = await api<{
                                reference: string;
                                authorizationUrl: string | null;
                              }>("/digital-purchases/checkout", {
                                paymentMethod: "paystack",
                                currency: "NGN",
                              });
                              if (
                                res.authorizationUrl &&
                                res.authorizationUrl.startsWith("http")
                              ) {
                                window.location.href = res.authorizationUrl;
                              } else {
                                toast("Digital Edition payment initialized.");
                                navigate(
                                  `/digital-edition?reference=${encodeURIComponent(res.reference)}`,
                                );
                              }
                            } catch (e) {
                              setError((e as Error).message);
                            } finally {
                              setBusy(false);
                            }
                          }}
                        >
                          {busy
                            ? "Connecting to Paystack…"
                            : data?.active
                              ? `Renew ${durationMonths}-Month Access · ${money(priceKobo)}`
                              : `Get online access · ${money(priceKobo)}`}{" "}
                          <ArrowRight size={17} />
                        </button>
                      </>
                    ) : (
                      <div className="notice">
                        <AlertCircle size={20} />
                        <div>
                          <strong>Online checkout is not available yet</strong>
                          <p>
                            Online payments are not available yet. Please
                            contact us or use bank transfer below; no payment
                            has been taken.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* OPTION 2: MANUAL BANK TRANSFER (WHEN ENABLED BY ADMIN) */}
                  {config.settings.bankTransferEnabled && (
                    <div className="panel stack">
                      <div className="section-title" style={{ margin: 0 }}>
                        <h3>Pay by bank transfer</h3>
                        <Landmark size={20} />
                      </div>
                      <p>
                        Transfer <strong>{money(priceKobo)}</strong> to the
                        official{" "}
                        <strong>{config.settings.organizationName}</strong>{" "}
                        account below, then submit your transfer reference.{" "}
                        <strong>
                          Digital access ({durationMonths} months) is activated
                          after an administrator verifies settled funds.
                        </strong>
                      </p>
                      <div className="bank-accounts-grid">
                        {config.settings.bankAccounts
                          .filter((acc) => acc.currency === "NGN")
                          .map((acc) => (
                            <div className="bank-account-card" key={acc.currency}>
                              <span className="pill">{acc.label}</span>
                              <strong>{acc.bankName}</strong>
                              <p>{acc.accountName}</p>
                              <code className="account-number">
                                {acc.accountNumber}
                              </code>
                            </div>
                          ))}
                      </div>
                      <form
                        className="stack"
                        onSubmit={async (e) => {
                          e.preventDefault();
                          setBusy(true);
                          setError("");
                          try {
                            await api("/digital-purchases/checkout", {
                              paymentMethod: "bank_transfer",
                              currency: transferCurrency,
                              transferReference: transferRef,
                              payerNote,
                            });
                            setTransferRef("");
                            setPayerNote("");
                            setShowRenewalCheckout(false);
                            toast(
                              "Bank-transfer order recorded (Pending Admin Verification).",
                            );
                            await loadDigitalStatus();
                          } catch (err) {
                            setError((err as Error).message);
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        <div className="form-row-2">
                          <label>
                            Transfer reference / session ID
                            <input
                              required
                              minLength={3}
                              maxLength={120}
                              value={transferRef}
                              onChange={(e) => setTransferRef(e.target.value)}
                              placeholder="e.g. 000014270101... or teller narration"
                            />
                          </label>
                        </div>
                        <label>
                          Sender name &amp; payment note (optional)
                          <input
                            maxLength={1000}
                            value={payerNote}
                            onChange={(e) => setPayerNote(e.target.value)}
                            placeholder="Account name used for transfer and date sent…"
                          />
                        </label>
                        <button className="button outline" disabled={busy}>
                          Submit Bank-Transfer Order for Verification{" "}
                          <ArrowRight size={16} />
                        </button>
                      </form>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {user && data && data.purchases.length > 0 && (
            <div className="panel stack" style={{ marginTop: "24px" }}>
              <h3>Your Digital Edition orders</h3>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Reference</th>
                      <th>Method</th>
                      <th>Amount</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.purchases.map((dp) => (
                      <tr key={dp.id}>
                        <td>
                          {new Date(dp.createdAt).toLocaleDateString("en-GB")}
                        </td>
                        <td className="reference">{dp.reference}</td>
                        <td>
                          {dp.paymentMethod === "paystack"
                            ? "Paystack"
                            : `Bank Transfer (${dp.currency})`}
                        </td>
                        <td>{money(dp.amountKobo)}</td>
                        <td>
                          <span className="pill">{dp.status}</span>
                          {dp.paymentMethod === "bank_transfer" &&
                            dp.status === "pending" && (
                              <div style={{ marginTop: "8px" }}>
                                <input
                                  placeholder="Enter transfer reference…"
                                  value={proofInput[dp.id] || ""}
                                  onChange={(e) =>
                                    setProofInput({
                                      ...proofInput,
                                      [dp.id]: e.target.value,
                                    })
                                  }
                                />
                                <button
                                  type="button"
                                  className="text-link"
                                  disabled={busy}
                                  onClick={async () => {
                                    const ref = (proofInput[dp.id] || "").trim();
                                    if (ref.length < 3) {
                                      toast(
                                        "Enter a valid transfer reference.",
                                      );
                                      return;
                                    }
                                    setBusy(true);
                                    try {
                                      await api(
                                        `/digital-purchases/${dp.id}/transfer-proof`,
                                        { transferReference: ref },
                                      );
                                      toast(
                                        "Transfer reference submitted for admin reconciliation.",
                                      );
                                      await loadDigitalStatus();
                                    } catch (e) {
                                      toast((e as Error).message);
                                    } finally {
                                      setBusy(false);
                                    }
                                  }}
                                >
                                  Submit transfer reference
                                </button>
                              </div>
                            )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function BookstorePage() {
  const { user, toast, config } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [activeOrder, setActiveOrder] = useState<PrintedOrderRecord | null>(
    null,
  );
  const [myOrders, setMyOrders] = useState<PrintedOrderRecord[]>([]);
  const [lookupOrderNumber, setLookupOrderNumber] = useState("");
  const [lookupEmail, setLookupEmail] = useState(user?.email || "");
  const [transferRef, setTransferRef] = useState("");
  const [payerNote, setPayerNote] = useState("");

  const unitPriceKobo = config.settings.hardcoverPriceKobo;
  const subtotalKobo = Math.max(1, quantity) * unitPriceKobo;
  const fixedDeliveryKobo =
    config.settings.deliveryPricingMode === "fixed_fee" &&
    config.settings.defaultDeliveryFeeKobo !== null &&
    config.settings.defaultDeliveryFeeKobo !== undefined
      ? config.settings.defaultDeliveryFeeKobo
      : null;

  const availabilityLabel =
    config.settings.hardcoverAvailability === "available"
      ? "Available for order & delivery"
      : config.settings.hardcoverAvailability === "preorder"
        ? "Open for 2027 pre-order"
        : "Currently out of stock";

  const loadMyOrders = async () => {
    if (!user) {
      setMyOrders([]);
      return;
    }
    try {
      const list = await api<PrintedOrderRecord[]>("/me/printed-orders");
      setMyOrders(list);
      if (activeOrder) {
        const refreshed = list.find((o) => o.id === activeOrder.id);
        if (refreshed) setActiveOrder(refreshed);
      }
    } catch {
      // Ignore if guest
    }
  };

  useEffect(() => {
    loadMyOrders();
    if (user?.email && !lookupEmail) {
      setLookupEmail(user.email);
    }
  }, [user]);

  const queryRef = new URLSearchParams(location.search).get("reference");

  useEffect(() => {
    if (!queryRef) return;
    setBusy(true);
    setError("");
    api<{ order: PrintedOrderRecord }>("/printed-orders/verify", {
      reference: queryRef,
    })
      .then((res) => {
        toast("Payment verified! Your printed book order is now confirmed.");
        setActiveOrder(res.order);
        navigate("/bookstore", { replace: true });
        loadMyOrders();
      })
      .catch((e) => {
        setError((e as Error).message);
      })
      .finally(() => setBusy(false));
  }, [queryRef]);

  async function submitOrder(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      const created = await api<PrintedOrderRecord>("/printed-orders", {
        fullName: String(f.get("fullName") || "").trim(),
        email: String(f.get("email") || "").trim(),
        phone: String(f.get("phone") || "").trim(),
        streetAddress: String(f.get("streetAddress") || "").trim(),
        city: String(f.get("city") || "").trim(),
        state: String(f.get("state") || "").trim(),
        country: String(f.get("country") || "Nigeria").trim(),
        deliveryLandmark: String(f.get("deliveryLandmark") || "").trim(),
        quantity: Number(f.get("quantity")) || 1,
        customerDeliveryNotes: String(
          f.get("customerDeliveryNotes") || "",
        ).trim(),
      });
      setActiveOrder(created);
      toast(`Printed book order ${created.orderNumber} created.`);
      await loadMyOrders();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleLookup(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const found = await api<PrintedOrderRecord>(
        `/printed-orders/lookup?orderNumber=${encodeURIComponent(lookupOrderNumber.trim())}&email=${encodeURIComponent(lookupEmail.trim())}`,
      );
      setActiveOrder(found);
      toast(`Loaded order ${found.orderNumber}.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container section bookstore">
      <div className="store-art">
        <Cover />
      </div>
      <div>
        <span className="eyebrow">Keep the journey close</span>
        <h1>
          The printed
          <br />
          companion.
        </h1>
        <p className="lead">{config.settings.siteTitle} · 2027 Printed Book</p>
        <div className="actions">
          <span className="pill">{availabilityLabel}</span>
          <Link className="text-link" to="/digital-edition">
            Prefer 2027 Online Access (
            {money(config.settings.digitalEditionPriceKobo)})?{" "}
            <ArrowUpRight size={15} />
          </Link>
        </div>
        <p>
          A 365-day devotional by <strong>{config.settings.authorName}</strong>,
          published by <strong>{config.settings.organizationName}</strong>.
        </p>
        <h2>{money(unitPriceKobo)} per copy</h2>
        <p>{config.settings.hardcoverNote}</p>

        <div className="notice" style={{ marginBottom: "22px" }}>
          <Users size={20} />
          <div>
            <strong>
              Ordering for a School, Church, Youth Group, or Family?
            </strong>
            <p>
              {config.settings.bulkDiscountNote}{" "}
              <Link className="text-link" to="/bulk-orders">
                Request a Bulk Quotation <ArrowRight size={14} />
              </Link>
            </p>
          </div>
        </div>

        <ErrorBox message={error} />

        {activeOrder ? (
          <div className="panel stack" style={{ marginBottom: "24px" }}>
            <div className="section-title" style={{ margin: 0 }}>
              <div>
                <span className="eyebrow">Printed Book Order</span>
                <h3>Order {activeOrder.orderNumber}</h3>
              </div>
              <button
                type="button"
                className="button outline small"
                onClick={() => setActiveOrder(null)}
              >
                Place another order
              </button>
            </div>

            <div className="notice success">
              <CheckCircle2 size={20} />
              <div>
                <strong>
                  Fulfillment:{" "}
                  {activeOrder.fulfillmentStatus.replace(/_/g, " ")} · Payment:{" "}
                  {activeOrder.paymentStatus.replace(/_/g, " ")}
                </strong>
                <p>
                  Delivery to: <strong>{activeOrder.fullName}</strong>,{" "}
                  {activeOrder.streetAddress}, {activeOrder.city},{" "}
                  {activeOrder.state}, {activeOrder.country}
                  {activeOrder.deliveryLandmark
                    ? ` (Landmark: ${activeOrder.deliveryLandmark})`
                    : ""}
                </p>
              </div>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Qty</th>
                    <th>Unit Price</th>
                    <th>Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      {config.settings.siteTitle} — 2027 Printed Devotional Book
                    </td>
                    <td>{activeOrder.quantity}</td>
                    <td>{money(activeOrder.unitPriceKobo)}</td>
                    <td>{money(activeOrder.subtotalKobo)}</td>
                  </tr>
                  <tr>
                    <td colSpan={3}>
                      <strong>Delivery Fee</strong>{" "}
                      <span className="muted">
                        ({activeOrder.deliveryQuoteStatus.replace(/_/g, " ")})
                      </span>
                    </td>
                    <td>
                      {activeOrder.deliveryFeeKobo !== null
                        ? money(activeOrder.deliveryFeeKobo)
                        : "Awaiting Admin Quote"}
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={3}>
                      <strong>Final Total</strong>
                    </td>
                    <td>
                      <strong>
                        {activeOrder.finalTotalKobo !== null
                          ? money(activeOrder.finalTotalKobo)
                          : "Pending Delivery Quote"}
                      </strong>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {activeOrder.courierName || activeOrder.trackingReference ? (
              <div className="panel stack">
                <strong>Dispatch &amp; Courier Details</strong>
                <p style={{ margin: 0 }}>
                  Courier: <strong>{activeOrder.courierName || "TBA"}</strong> ·
                  Tracking Reference:{" "}
                  <code>{activeOrder.trackingReference || "Pending"}</code>
                </p>
              </div>
            ) : null}

            {/* Step: Awaiting Delivery Quotation from Admin */}
            {activeOrder.deliveryFeeKobo === null && (
              <div className="notice">
                <AlertCircle size={20} />
                <div>
                  <strong>Awaiting Delivery Quotation</strong>
                  <p>
                    {config.settings.deliveryPolicyNote ||
                      "Our team at Cossy Teens Consult Enterprises is calculating the delivery fee for your address. Once quoted, you can review, approve, and complete payment right here."}
                  </p>
                </div>
              </div>
            )}

            {/* Step: Admin has quoted delivery fee -> Customer approves */}
            {activeOrder.deliveryFeeKobo !== null &&
              activeOrder.deliveryQuoteStatus === "quoted" &&
              activeOrder.paymentStatus === "pending" && (
                <div className="panel stack">
                  <h4>Review &amp; Approve Your Delivery Quotation</h4>
                  <p>
                    Delivery fee to{" "}
                    <strong>
                      {activeOrder.city}, {activeOrder.state}
                    </strong>
                    : <strong>{money(activeOrder.deliveryFeeKobo)}</strong>.
                    Your final order total is{" "}
                    <strong>
                      {money(
                        activeOrder.finalTotalKobo ?? activeOrder.subtotalKobo,
                      )}
                    </strong>
                    .
                  </p>
                  <button
                    type="button"
                    className="button"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      setError("");
                      try {
                        const updated = await api<PrintedOrderRecord>(
                          `/printed-orders/${activeOrder.id}/approve-quote`,
                          { email: activeOrder.email },
                        );
                        setActiveOrder(updated);
                        toast(
                          "Delivery quotation approved! You can now complete payment.",
                        );
                        await loadMyOrders();
                      } catch (err) {
                        setError((err as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Approve Final Total (
                    {money(
                      activeOrder.finalTotalKobo ?? activeOrder.subtotalKobo,
                    )}
                    ) &amp; Proceed to Payment <ArrowRight size={16} />
                  </button>
                </div>
              )}

            {/* Step: Ready for Payment */}
            {activeOrder.deliveryFeeKobo !== null &&
              (activeOrder.deliveryQuoteStatus === "customer_approved" ||
                activeOrder.deliveryQuoteStatus === "fixed_applied") &&
              activeOrder.paymentStatus === "pending" && (
                <div className="stack">
                  <div className="panel stack">
                    <div className="section-title" style={{ margin: 0 }}>
                      <h4>Pay Online via Paystack</h4>
                      <CreditCard size={18} />
                    </div>
                    {config.payments.configured ? (
                      <button
                        type="button"
                        className="button"
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          setError("");
                          try {
                            const res = await api<{
                              reference: string;
                              authorizationUrl: string | null;
                              order: PrintedOrderRecord;
                            }>(`/printed-orders/${activeOrder.id}/pay`, {
                              paymentMethod: "paystack",
                              email: activeOrder.email,
                            });
                            if (
                              res.authorizationUrl &&
                              res.authorizationUrl.startsWith("http")
                            ) {
                              window.location.href = res.authorizationUrl;
                            } else {
                              navigate(
                                `/bookstore?reference=${encodeURIComponent(res.reference)}`,
                              );
                            }
                          } catch (err) {
                            setError((err as Error).message);
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        Pay{" "}
                        {money(
                          activeOrder.finalTotalKobo ??
                            activeOrder.subtotalKobo,
                        )}{" "}
                        via Paystack <ArrowRight size={16} />
                      </button>
                    ) : (
                      <p className="muted">
                        Online card checkout is not configured yet. Please use
                        official bank transfer below.
                      </p>
                    )}
                  </div>

                  {config.settings.bankTransferEnabled && (
                    <div className="panel stack">
                      <div className="section-title" style={{ margin: 0 }}>
                        <h4>Pay by Official Bank Transfer</h4>
                        <Landmark size={18} />
                      </div>
                      <div className="bank-accounts-grid">
                        {config.settings.bankAccounts
                          .filter((acc) => acc.currency === "NGN")
                          .map((acc) => (
                            <div
                              className="bank-account-card"
                              key={acc.currency}
                            >
                              <span className="pill">{acc.label}</span>
                              <strong>{acc.bankName}</strong>
                              <p>{acc.accountName}</p>
                              <code className="account-number">
                                {acc.accountNumber}
                              </code>
                            </div>
                          ))}
                      </div>
                      <form
                        className="stack"
                        onSubmit={async (e) => {
                          e.preventDefault();
                          setBusy(true);
                          setError("");
                          try {
                            const res = await api<{
                              order: PrintedOrderRecord;
                            }>(`/printed-orders/${activeOrder.id}/pay`, {
                              paymentMethod: "bank_transfer",
                              transferReference: transferRef,
                              payerNote,
                              email: activeOrder.email,
                            });
                            setActiveOrder(res.order);
                            setTransferRef("");
                            setPayerNote("");
                            toast(
                              "Bank transfer reference submitted for administrator verification.",
                            );
                            await loadMyOrders();
                          } catch (err) {
                            setError((err as Error).message);
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        <label>
                          Transfer reference / session ID
                          <input
                            required
                            minLength={3}
                            maxLength={120}
                            value={transferRef}
                            onChange={(e) => setTransferRef(e.target.value)}
                            placeholder="Enter bank transfer session ID or teller reference"
                          />
                        </label>
                        <label>
                          Sender name &amp; payment note (optional)
                          <input
                            maxLength={500}
                            value={payerNote}
                            onChange={(e) => setPayerNote(e.target.value)}
                            placeholder="Account name used for transfer"
                          />
                        </label>
                        <button className="button outline" disabled={busy}>
                          Submit Bank-Transfer Proof for Verification{" "}
                          <ArrowRight size={16} />
                        </button>
                      </form>
                    </div>
                  )}
                </div>
              )}
          </div>
        ) : (
          <form onSubmit={submitOrder} className="panel stack">
            <h3>Order Printed Copies ({money(unitPriceKobo)} per copy)</h3>
            <p className="muted" style={{ margin: 0 }}>
              {fixedDeliveryKobo !== null
                ? `Standard delivery fee: ${money(fixedDeliveryKobo)}. Final total for ${quantity} cop${quantity === 1 ? "y" : "ies"}: ${money(subtotalKobo + fixedDeliveryKobo)}.`
                : config.settings.deliveryPolicyNote ||
                  "Enter your delivery address below. Delivery fees depend on your location and are confirmed before payment."}
            </p>
            <div className="form-row-2">
              <label>
                Full name
                <input
                  name="fullName"
                  defaultValue={user?.name || ""}
                  required
                  minLength={2}
                  maxLength={120}
                  autoComplete="name"
                />
              </label>
              <label>
                Email address
                <input
                  name="email"
                  type="email"
                  defaultValue={user?.email || ""}
                  required
                  autoComplete="email"
                />
              </label>
            </div>
            <div className="form-row-2">
              <label>
                Phone / WhatsApp number
                <input
                  name="phone"
                  type="tel"
                  required
                  minLength={5}
                  maxLength={40}
                  placeholder="+234 …"
                  autoComplete="tel"
                />
              </label>
              <label>
                Quantity (copies)
                <input
                  name="quantity"
                  type="number"
                  min={1}
                  max={10000}
                  value={quantity}
                  onChange={(e) =>
                    setQuantity(Math.max(1, Number(e.target.value) || 1))
                  }
                  required
                />
              </label>
            </div>
            <label>
              Delivery street address
              <input
                name="streetAddress"
                required
                minLength={4}
                maxLength={300}
                placeholder="House number, street name, estate or area…"
                autoComplete="street-address"
              />
            </label>
            <div className="form-row-2">
              <label>
                City / Town
                <input
                  name="city"
                  required
                  minLength={2}
                  maxLength={100}
                  placeholder="e.g. Ikeja, Surulere, Wuse…"
                />
              </label>
              <label>
                State / Province
                <input
                  name="state"
                  required
                  minLength={2}
                  maxLength={100}
                  placeholder="e.g. Lagos, FCT Abuja, Rivers…"
                />
              </label>
            </div>
            <div className="form-row-2">
              <label>
                Country
                <input
                  name="country"
                  required
                  minLength={2}
                  maxLength={100}
                  defaultValue="Nigeria"
                />
              </label>
              <label>
                Nearest landmark (optional)
                <input
                  name="deliveryLandmark"
                  maxLength={240}
                  placeholder="e.g. Opposite St. John Church"
                />
              </label>
            </div>
            <label>
              Delivery instructions (optional)
              <textarea
                name="customerDeliveryNotes"
                maxLength={2000}
                placeholder="Any preferred delivery window or recipient instructions…"
              />
            </label>

            <div
              className="panel"
              style={{
                background: "var(--cream)",
                padding: "12px 16px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "8px",
              }}
            >
              <span>
                Book Subtotal ({quantity} cop{quantity === 1 ? "y" : "ies"} ×{" "}
                {money(unitPriceKobo)}):
              </span>
              <strong style={{ fontSize: "1.15rem" }}>
                {money(subtotalKobo)}
              </strong>
            </div>

            <button className="button" disabled={busy}>
              <ShoppingBag size={17} />
              {busy
                ? "Submitting order…"
                : `Place Printed Book Order (${money(subtotalKobo)})`}
            </button>
          </form>
        )}

        {/* My Printed Orders (when signed in) */}
        {myOrders.length > 0 && (
          <div className="panel stack" style={{ marginTop: "24px" }}>
            <h3>Your Printed Book Orders</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Order #</th>
                    <th>Qty</th>
                    <th>Total</th>
                    <th>Payment</th>
                    <th>Fulfillment</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {myOrders.map((po) => (
                    <tr key={po.id}>
                      <td>
                        <strong>{po.orderNumber}</strong>
                      </td>
                      <td>{po.quantity}</td>
                      <td>
                        {po.finalTotalKobo !== null
                          ? money(po.finalTotalKobo)
                          : `${money(po.subtotalKobo)} + delivery`}
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
                      </td>
                      <td>
                        <button
                          type="button"
                          className="button outline small"
                          onClick={() => setActiveOrder(po)}
                        >
                          View / Pay
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Order Lookup by Order Number + Email */}
        <details className="panel" style={{ marginTop: "20px" }}>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>
            Already placed a printed book order? Track status, approve delivery
            quote, or pay
          </summary>
          <form
            onSubmit={handleLookup}
            className="stack"
            style={{ marginTop: "14px" }}
          >
            <div className="form-row-2">
              <label>
                Order number
                <input
                  required
                  value={lookupOrderNumber}
                  onChange={(e) => setLookupOrderNumber(e.target.value)}
                  placeholder="e.g. BLD-PRT-..."
                />
              </label>
              <label>
                Order email address
                <input
                  type="email"
                  required
                  value={lookupEmail}
                  onChange={(e) => setLookupEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </label>
            </div>
            <button className="button outline small" disabled={busy}>
              Find Printed Order <ArrowRight size={15} />
            </button>
          </form>
        </details>
      </div>
    </div>
  );
}

export function BulkOrdersPage() {
  const { config, toast } = useApp();
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      await api("/bulk-orders", {
        contactName: f.get("contactName"),
        organizationName: f.get("organizationName"),
        organizationType: f.get("organizationType"),
        email: f.get("email"),
        phone: f.get("phone"),
        quantity: Number(f.get("quantity")) || 10,
        preferredFormat: f.get("preferredFormat") || "printed",
        deliveryLocation: f.get("deliveryLocation"),
        notes: f.get("notes") || "",
      });
      setSent(true);
      toast("Your bulk order request has been submitted.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container section bookstore">
      <div>
        <span className="eyebrow">
          Parents · Schools · Churches · Youth Organizations
        </span>
        <h1>
          Bulk &amp; Institutional
          <br />
          Orders.
        </h1>
        <p className="lead">
          Partner with <strong>{config.settings.organizationName}</strong> to
          place <strong>{config.settings.siteTitle}</strong> in the hands of
          teenagers and young adults across your family, school, church, or
          youth ministry.
        </p>
        <div className="panel stack">
          <h3>Standard Edition Pricing</h3>
          <div className="contact-line">
            <BookOpen size={18} />
            <div>
              <strong>Printed Copy:</strong>{" "}
              {money(config.settings.hardcoverPriceKobo)} per copy
            </div>
          </div>
          <div className="contact-line">
            <ShoppingBag size={18} />
            <div>
              <strong>Digital Copy (2027 Edition):</strong>{" "}
              {money(config.settings.digitalEditionPriceKobo)} per copy
            </div>
          </div>
          <p className="muted" style={{ paddingBottom: 0 }}>
            {config.settings.bulkDiscountNote} Submit your required quantity
            below and our team will prepare a tailored quotation for your
            organization.
          </p>
        </div>

        <div className="panel stack">
          <h3>Who this workflow supports</h3>
          <ul className="check-list">
            <li>
              <Building2 size={16} />{" "}
              <span>
                <strong>Schools &amp; Colleges:</strong> Chapel devotionals,
                character education, and graduating class gifts.
              </span>
            </li>
            <li>
              <Users size={16} />{" "}
              <span>
                <strong>Churches &amp; Youth Fellowships:</strong> Annual teen
                and young-adult discipleship groups.
              </span>
            </li>
            <li>
              <Shield size={16} />{" "}
              <span>
                <strong>Parents, Mentors &amp; NGOs:</strong> Sponsored copies
                for youth camps, leadership bootcamps, and family study.
              </span>
            </li>
          </ul>
        </div>
      </div>

      <div className="panel">
        <h2>Request a Bulk Quotation</h2>
        <p>
          Complete the form below and an administrator at{" "}
          <strong>{config.settings.organizationName}</strong> will prepare your
          custom quotation and delivery schedule.
        </p>
        {sent ? (
          <div className="notice success">
            <CheckCircle2 />
            <div>
              <strong>Bulk order inquiry recorded</strong>
              <p>
                Thank you for partnering with{" "}
                {config.settings.organizationName}. Our team has received your
                bulk request and will contact you with a quotation and
                fulfillment details.
              </p>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="stack">
            <div className="form-row-2">
              <label>
                Contact person name
                <input
                  name="contactName"
                  required
                  minLength={2}
                  maxLength={100}
                  autoComplete="name"
                />
              </label>
              <label>
                Organization / Group / Family name
                <input
                  name="organizationName"
                  required
                  minLength={2}
                  maxLength={160}
                  placeholder="e.g. Grace High School / St. Mark Youth Ministry"
                />
              </label>
            </div>
            <div className="form-row-2">
              <label>
                Organization type
                <select name="organizationType" defaultValue="school">
                  <option value="parent">Parent / Family Group</option>
                  <option value="school">School / Educational Institution</option>
                  <option value="church">Church / Youth Ministry</option>
                  <option value="youth_organization">
                    Youth Organization / NGO / Fellowship
                  </option>
                  <option value="other">Other Group</option>
                </select>
              </label>
              <label>
                Preferred format
                <select name="preferredFormat" defaultValue="printed">
                  <option value="printed">
                    Printed Copies ({money(config.settings.hardcoverPriceKobo)}{" "}
                    standard)
                  </option>
                  <option value="digital">
                    Digital Copies (
                    {money(config.settings.digitalEditionPriceKobo)} standard)
                  </option>
                  <option value="mixed">
                    Mixed (Printed + Digital Copies)
                  </option>
                </select>
              </label>
            </div>
            <div className="form-row-2">
              <label>
                Email address
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                />
              </label>
              <label>
                Phone / WhatsApp number
                <input
                  name="phone"
                  type="tel"
                  required
                  minLength={5}
                  maxLength={40}
                  placeholder="+234 …"
                  autoComplete="tel"
                />
              </label>
            </div>
            <div className="form-row-2">
              <label>
                Quantity needed
                <input
                  name="quantity"
                  type="number"
                  min={1}
                  max={50000}
                  defaultValue={20}
                  required
                />
              </label>
              <label>
                City / Delivery location
                <input
                  name="deliveryLocation"
                  required
                  minLength={2}
                  maxLength={240}
                  placeholder="e.g. Ikeja, Lagos"
                />
              </label>
            </div>
            <label>
              Additional notes or timeline
              <textarea
                name="notes"
                maxLength={3000}
                placeholder="Tell us about your event date, distribution plan, or any special requirements…"
              />
            </label>
            <ErrorBox message={error} />
            <button className="button" disabled={busy}>
              <ShoppingBag size={17} />
              {busy ? "Submitting…" : "Submit Bulk Order Inquiry"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export function ContactPage() {
  const { config, toast } = useApp();
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      await api("/inquiries", {
        name: f.get("name"),
        email: f.get("email"),
        phone: f.get("phone") || "",
        quantity: 1,
        deliveryLocation: "",
        message: f.get("message") || "",
        inquiryType: "general",
      });
      setSent(true);
      toast("Your message has been sent.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container section bookstore">
      <div>
        <span className="eyebrow">Get in touch</span>
        <h1>
          Connect with
          <br />
          {config.settings.organizationName}.
        </h1>
        <p className="lead">
          For orders, bulk purchases for schools, churches, youth groups, or
          partnership inquiries, please contact us:
        </p>
        <div className="panel stack contact-details-card">
          <div className="contact-line">
            <Mail size={18} />
            <div>
              <strong>Email</strong>
              <p>{config.settings.contactEmail}</p>
            </div>
          </div>
          <div className="contact-line">
            <Phone size={18} />
            <div>
              <strong>Phone / WhatsApp</strong>
              <p>
                {config.settings.contactPhone}
                {config.settings.contactSecondaryPhone
                  ? ` · ${config.settings.contactSecondaryPhone}`
                  : ""}
              </p>
            </div>
          </div>
          <div className="contact-line">
            <Globe size={18} />
            <div>
              <strong>Website</strong>
              <p>{config.settings.contactWebsite}</p>
            </div>
          </div>
          <div className="contact-line">
            <MapPin size={18} />
            <div>
              <strong>Location</strong>
              <p>{config.settings.contactAddress}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="panel">
        <h2>Send a message</h2>
        <p>
          Fill out the form below and an administrator at{" "}
          {config.settings.organizationName} will review your message.
        </p>
        {sent ? (
          <div className="notice success">
            <CheckCircle2 />
            <div>
              <strong>Message received</strong>
              <p>
                Thank you for reaching out. Your inquiry has been logged for our
                team to review and respond.
              </p>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="stack">
            <label>
              Your name
              <input
                name="name"
                required
                minLength={2}
                maxLength={100}
                autoComplete="name"
              />
            </label>
            <label>
              Email address
              <input name="email" type="email" required autoComplete="email" />
            </label>
            <label>
              Phone number (optional)
              <input name="phone" type="tel" maxLength={40} autoComplete="tel" />
            </label>
            <label>
              How can we help?
              <textarea
                name="message"
                required
                maxLength={2000}
                placeholder="Write your question or message…"
              />
            </label>
            <ErrorBox message={error} />
            <button className="button" disabled={busy}>
              {busy ? "Sending…" : "Send message"} <ArrowRight size={16} />
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

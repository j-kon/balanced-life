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
} from "../../types";

export function PricingSection({ embedded = false }: { embedded?: boolean }) {
  const { config } = useApp();
  return <section id="get-your-copy" className={embedded ? "pricing-section section" : "container section"}>
    <div className={embedded ? "container" : ""}>
      <div className="center-heading"><span className="eyebrow">Choose your reading experience</span><h2>One devotional. Two ways to grow.</h2><p>Keep the printed book close, or carry your daily reading on your phone.</p></div>
      <div className="purchase-options">
        <article className="panel purchase-option"><ShoppingBag size={26}/><h3>Printed book</h3><div className="price">{money(config.settings.hardcoverPriceKobo)}</div><p>One hardcover copy of the 2027 devotional.</p><ul className="check-list"><li><Check size={16}/>All 365 daily readings in print</li><li><Check size={16}/>Scripture, reflections and prayers</li><li><Check size={16}/>Delivery arranged with Cossy Teens Consult</li></ul><Link className="button outline" to="/bookstore">Get the printed book <ArrowRight size={16}/></Link></article>
        <article className="panel purchase-option featured-option"><BookOpen size={26}/><h3>Online reading access</h3><div className="price">{money(config.settings.digitalEditionPriceKobo)}</div><p>One payment for the full 2027 edition. No monthly renewal.</p><ul className="check-list"><li><Check size={16}/>All published 2027 readings, including those added later</li><li><Check size={16}/>Your private journal, bookmarks and progress</li><li><Check size={16}/>Read on Android, iPhone, tablet or computer</li></ul><Link className="button" to="/digital-edition">Get online access <ArrowRight size={16}/></Link></article>
      </div>
      <p className="fine-print">The printed book and online access are separate purchases. Online access covers the 2027 edition; future editions are not included.</p>
    </div>
  </section>;
}
export function PricingPage() { return <PricingSection/>; }

type DigitalEditionResponse = {
  entitlement: DigitalEntitlementRecord | null;
  active: boolean;
  purchases: DigitalPurchaseRecord[];
  product: {
    editionYear: number;
    amountKobo: number;
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
  const available = config.settings.digitalEditionAvailability === "available";

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
            {config.settings.siteTitle} · Online reading · 2027 edition
          </p>
          <div className="actions">
            <span className="pill">
              {available ? "Available for immediate online access" : "Unavailable"}
            </span>
            <span className="pill">
              One-time purchase · No recurring subscription charge
            </span>
          </div>
          <h2>{money(priceKobo)}</h2>
          <p>{config.settings.digitalEditionNote}</p>

          <div className="panel stack" style={{ marginTop: "20px" }}>
            <h3>Everything you need for your daily reading</h3>
            <ul className="check-list">
              <li>
                <CheckCircle2 size={16} /> Persistent online reading access to
                all published 2027 devotionals in your reader account
              </li>
              <li>
                <CheckCircle2 size={16} /> Full 5-step Daily Growth &amp;
                Accountability check-ins (Lesson, Reflection, Action Step &amp;
                Progress)
              </li>
              <li>
                <CheckCircle2 size={16} /> Private Growth Journal and saved
                bookmarks across phone, tablet, and computer
              </li>
              <li>
                <CheckCircle2 size={16} /> Read in the app with your account on any device
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
                Your online reading access is linked to your
                personal reader account so you can read on any device.
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
          ) : data?.active ? (
            <div className="notice success">
              <CheckCircle2 size={22} />
              <div>
                <strong>
                  2027 Digital Edition Active on Your Account
                </strong>
                <p>
                  Granted on{" "}
                  {data.entitlement
                    ? new Date(data.entitlement.grantedAt).toLocaleDateString(
                        "en-GB",
                      )
                    : "your account"}
                  . You have persistent online access to all published 2027
                  readings.
                </p>
                <div className="actions" style={{ marginTop: "12px" }}>
                  <Link className="button small" to="/dashboard">
                    Go to Reader Dashboard <ArrowRight size={15} />
                  </Link>
                  <Link className="button outline small" to="/library">
                    Open 365-Day Library
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            <div className="stack">
              {/* OPTION 1: PAYSTACK ONLINE CHECKOUT */}
              <div className="panel stack">
                <div className="section-title" style={{ margin: 0 }}>
                  <h3>Secure payment</h3>
                  <CreditCard size={20} />
                </div>
                {config.payments.configured ? (
                  <>
                    <p>
                      Pay <strong>{money(priceKobo)}</strong> securely via
                      Paystack using card, bank transfer, or USSD. Your 2027
                      Digital Edition access activates automatically as soon as
                      Paystack verifies the transaction.
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
                        Online payments are not available yet. Please contact us for help getting access; no payment has been taken.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* OPTION 2: MANUAL BANK TRANSFER (WHEN ENABLED BY ADMIN) */}
              {config.settings.bankTransferEnabled && (
                <div className="panel stack">
                  <div className="section-title" style={{ margin: 0 }}>
                    <h3>
                      Pay by bank transfer
                    </h3>
                    <Landmark size={20} />
                  </div>
                  <p>
                    Transfer to any of the official{" "}
                    <strong>{config.settings.organizationName}</strong> Access
                    Bank accounts below, then submit your transfer reference.{" "}
                    <strong>
                      Digital access is activated after an administrator
                      verifies settled funds.
                    </strong>
                  </p>
                  <div className="bank-accounts-grid">
                    {config.settings.bankAccounts.filter(acc => acc.currency === "NGN").map((acc) => (
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
  const { toast, config } = useApp();
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const availabilityLabel =
    config.settings.hardcoverAvailability === "available"
      ? "Available for order inquiry"
      : config.settings.hardcoverAvailability === "preorder"
        ? "Open for 2027 pre-order"
        : "Currently out of stock — register interest";

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
        quantity: Number(f.get("quantity")) || 1,
        deliveryLocation: f.get("deliveryLocation") || "",
        message: f.get("message") || "",
        inquiryType: "hardcover",
      });
      setSent(true);
      toast("Your printed book order inquiry has been received.");
    } catch (e) {
      setError((e as Error).message);
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
        <p className="lead">{config.settings.siteTitle} · 2027 Printed Copy</p>
        <div className="actions">
          <span className="pill">{availabilityLabel}</span>
          <Link className="text-link" to="/digital-edition">
            Prefer the Digital Copy ({money(config.settings.digitalEditionPriceKobo)}
            )? <ArrowUpRight size={15} />
          </Link>
        </div>
        <p>
          A 365-day devotional by <strong>{config.settings.authorName}</strong>,
          published by <strong>{config.settings.organizationName}</strong>.
        </p>
        <h2>{money(config.settings.hardcoverPriceKobo)}</h2>
        <p>{config.settings.hardcoverNote}</p>

        <div className="notice" style={{ marginBottom: "22px" }}>
          <Users size={20} />
          <div>
            <strong>Ordering for a School, Church, Youth Group, or Family?</strong>
            <p>
              {config.settings.bulkDiscountNote}{" "}
              
            </p>
          </div>
        </div>

        {config.settings.bankTransferEnabled && (
          <div className="panel stack" style={{ marginBottom: "22px" }}>
            <h3>Official Bank Transfer Accounts (Access Bank)</h3>
            <p>
              For confirmed printed book orders, payments can be made to the
              official accounts below. All bank transfers are verified by an
              administrator before dispatch.
            </p>
            <div className="bank-accounts-grid">
              {config.settings.bankAccounts.filter(acc => acc.currency === "NGN").map((acc) => (
                <div className="bank-account-card" key={acc.currency}>
                  <span className="pill">{acc.label}</span>
                  <strong>{acc.bankName}</strong>
                  <p>{acc.accountName}</p>
                  <code className="account-number">{acc.accountNumber}</code>
                </div>
              ))}
            </div>
          </div>
        )}

        {sent ? (
          <div className="notice success">
            <CheckCircle2 />
            <div>
              <strong>Printed copy inquiry received</strong>
              <p>
                Thank you for ordering the printed edition. Our team at{" "}
                {config.settings.organizationName} has recorded your request and
                will follow up with payment and delivery arrangements.
              </p>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="stack">
            <div className="form-row-2">
              <label>
                Your full name
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
                <input
                  name="email"
                  type="email"
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
                  maxLength={40}
                  placeholder="+234 …"
                  autoComplete="tel"
                />
              </label>
              <label>
                Number of copies
                <input
                  name="quantity"
                  type="number"
                  min={1}
                  max={10000}
                  defaultValue={1}
                  required
                />
              </label>
            </div>
            <label>
              City / Delivery location
              <input
                name="deliveryLocation"
                maxLength={200}
                placeholder="e.g. Lagos, Abuja, Port Harcourt…"
              />
            </label>
            <label>
              Additional notes (optional)
              <textarea
                name="message"
                maxLength={2000}
                placeholder="Share your preferred delivery address or any questions."
              />
            </label>
            <ErrorBox message={error} />
            <button className="button" disabled={busy}>
              <ShoppingBag size={17} />
              {busy ? "Submitting…" : "Submit printed copy inquiry"}
            </button>
          </form>
        )}
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

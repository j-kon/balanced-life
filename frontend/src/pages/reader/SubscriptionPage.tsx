import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { AlertCircle, ArrowRight, Shield } from "lucide-react";
import { useApp } from "../../context/AppContext";
import { useData } from "../../hooks/useData";
import { Empty, ErrorBox, Loading } from "../../components/Common";
import { api, money } from "../../api";
import type { PaymentRecord, Plan, SubscriptionDetails } from "../../types";

export function CheckoutPage() {
  const { id } = useParams();
  const { data, error } = useData<Plan[]>("/plans");
  const { config, toast } = useApp();
  const navigate = useNavigate();
  const [renewal, setRenewal] = useState<"manual" | "automatic">("manual");
  const [busy, setBusy] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const plan = data?.find((p) => p.id === Number(id));

  return (
    <div className="checkout">
      <span className="pill">
        {config.payments.configured
          ? "Paystack Secure Checkout"
          : "Payment Provider Not Configured"}
      </span>
      <h1>
        A little commitment.
        <br />A year of possibilities.
      </h1>
      <ErrorBox message={error || paymentError} />
      {plan ? (
        <div className="panel">
          <h2>{plan.name} membership</h2>
          <div className="checkout-total">
            <span>Total amount</span>
            <strong>{money(plan.amountKobo)}</strong>
          </div>
          <p>
            Unlocks all published 2027 devotionals for {plan.months} month
            {plan.months > 1 ? "s" : ""}, along with your private growth journal
            and reading progress.
          </p>
          <label>
            Renewal preference
            <select
              value={renewal}
              onChange={(e) =>
                setRenewal(e.target.value as "manual" | "automatic")
              }
            >
              <option value="manual">Manual — I will renew myself</option>
              {config.settings.enableAutoRenewal && (
                <option value="automatic">
                  Automatic — renew when supported by payment provider
                </option>
              )}
            </select>
          </label>
          {config.payments.configured ? (
            <>
              <div className="notice">
                <Shield size={22} />
                <p>
                  You will be directed to Paystack to complete your{" "}
                  {money(plan.amountKobo)} payment securely. Your membership
                  activates once Paystack verifies the transaction.
                </p>
              </div>
              <button
                className="button full"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setPaymentError("");
                  try {
                    const res = await api<{
                      reference: string;
                      authorizationUrl: string;
                    }>("/subscriptions/checkout", {
                      planId: plan.id,
                      renewalMode: renewal,
                    });
                    if (res.authorizationUrl.startsWith("http")) {
                      window.location.href = res.authorizationUrl;
                    } else {
                      toast("Payment initialized.");
                      navigate(
                        `/subscription?reference=${encodeURIComponent(res.reference)}`,
                      );
                    }
                  } catch (e) {
                    setPaymentError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy
                  ? "Connecting to Paystack…"
                  : `Proceed to Paystack · ${money(plan.amountKobo)}`}
                <ArrowRight size={17} />
              </button>
            </>
          ) : (
            <div className="notice">
              <AlertCircle size={22} />
              <div>
                <strong>Paystack checkout is not yet enabled</strong>
                <p>
                  Real payment initiation is safely disabled until{" "}
                  <code>PAYSTACK_SECRET_KEY</code> is configured on the server.
                  No simulated or unverified payments are fabricated. For local
                  testing or ministry access, an administrator can grant
                  complimentary membership from the Administration dashboard.
                </p>
                <div className="actions">
                  <Link className="text-link" to="/subscription">
                    View your membership status <ArrowRight size={15} />
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : data ? (
        <Empty title="Plan unavailable">
          This plan may have been disabled. Choose another membership.
        </Empty>
      ) : (
        <Loading />
      )}
    </div>
  );
}

type SubscriptionResponse = {
  subscription: SubscriptionDetails | null;
  active: boolean;
  payments: PaymentRecord[];
  paymentProvider: {
    name: "paystack";
    configured: boolean;
    publicKey: string | null;
    enableAutoRenewal: boolean;
  };
};

export function SubscriptionPage() {
  const { data, error, reload } =
    useData<SubscriptionResponse>("/me/subscription");
  const { toast } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const queryRef = new URLSearchParams(location.search).get("reference");

  useEffect(() => {
    if (!queryRef) return;
    setBusy(true);
    api("/subscriptions/verify", { reference: queryRef })
      .then(() => {
        toast("Payment verified! Your membership is now active.");
        navigate("/subscription", { replace: true });
        reload();
      })
      .catch((e) => {
        toast((e as Error).message);
      })
      .finally(() => setBusy(false));
  }, [queryRef, navigate, reload, toast]);

  async function change(body: unknown) {
    setBusy(true);
    try {
      await api("/me/subscription", body, "PATCH");
      reload();
      toast("Subscription settings updated.");
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const sub = data?.subscription;

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Keep growing</span>
          <h1>Your membership</h1>
          <p>A little space in your day. A lasting investment in your faith.</p>
        </div>
      </div>

      {sub?.renewalReminder && (
        <div className="notice">
          <AlertCircle size={20} />
          <div>
            <strong>Renewal Notice</strong>
            <p>{sub.renewalReminder.message}</p>
          </div>
        </div>
      )}

      <ErrorBox message={error} />
      {data ? (
        <>
          <section className="panel membership-panel">
            <div className="actions">
              <span className="pill">
                {sub
                  ? sub.accessType === "complimentary"
                    ? "Complimentary Access"
                    : "Paid Subscription"
                  : "Free Account"}
              </span>
              {sub && (
                <span className="pill">
                  Status:{" "}
                  {sub.effectiveStatus === "active"
                    ? "Active"
                    : sub.effectiveStatus === "cancelling"
                      ? "Active · Cancels at period end"
                      : sub.effectiveStatus === "revoked"
                        ? "Revoked"
                        : "Expired"}
                </span>
              )}
            </div>
            <h2>{sub ? `${sub.planName} Plan` : "Free Explorer"}</h2>
            {sub ? (
              <>
                <p>
                  {sub.active ? "Paid-through access until " : "Access ended on "}
                  <strong>
                    {new Date(sub.expiresAt).toLocaleString("en-GB")}
                  </strong>
                  {sub.active && ` (${sub.daysRemaining} days remaining)`}
                </p>
                {sub.accessType === "complimentary" && sub.grantReason && (
                  <p className="muted">
                    Complimentary note: {sub.grantReason}
                  </p>
                )}
                <p>
                  Renewal:{" "}
                  {sub.cancelAtPeriodEnd
                    ? "Cancelled — access remains until expiry"
                    : sub.renewalMode}
                </p>
                {sub.status !== "revoked" && (
                  <div className="actions">
                    <button
                      className="button outline"
                      disabled={busy}
                      onClick={() =>
                        change({
                          renewalMode:
                            sub.renewalMode === "manual"
                              ? "automatic"
                              : "manual",
                          cancelAtPeriodEnd: false,
                        })
                      }
                    >
                      Use{" "}
                      {sub.renewalMode === "manual" ? "automatic" : "manual"}{" "}
                      renewal
                    </button>
                    <button
                      className="text-link"
                      disabled={busy || sub.cancelAtPeriodEnd}
                      onClick={() => change({ cancelAtPeriodEnd: true })}
                    >
                      Cancel future renewal
                    </button>
                    {data.paymentProvider.configured && (
                      <Link
                        className="button"
                        to={"/checkout/" + sub.planId}
                      >
                        Renew now ({money(sub.planAmountKobo)})
                      </Link>
                    )}
                  </div>
                )}
                <p className="fine-print">
                  {sub.accessType === "complimentary"
                    ? "Complimentary memberships are granted by an administrator and are never recorded as paid transaction revenue."
                    : data.paymentProvider.configured
                      ? "Online renewals are verified through Paystack before extending your expiration date."
                      : "Paystack live/test credentials are not yet configured in this environment."}
                </p>
              </>
            ) : (
              <>
                <p>
                  Choose a membership plan to unlock the complete published 2027
                  devotional archive.
                </p>
                <Link className="button" to="/pricing">
                  Explore membership plans <ArrowRight size={17} />
                </Link>
              </>
            )}
          </section>

          <div className="section-title">
            <h2>Verified payment history</h2>
          </div>
          {data.payments.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Plan</th>
                    <th>Amount</th>
                    <th>Reference</th>
                    <th>Provider</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.payments.map((p) => (
                    <tr key={p.id}>
                      <td>
                        {new Date(p.createdAt).toLocaleDateString("en-GB")}
                      </td>
                      <td>{p.planName}</td>
                      <td>{money(p.amountKobo)}</td>
                      <td className="reference">{p.reference}</td>
                      <td>{p.provider.toUpperCase()}</td>
                      <td>
                        <span className="pill">{p.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="No payment transactions">
              Verified Paystack transactions will appear here. Complimentary
              access grants do not generate payment records.
            </Empty>
          )}
        </>
      ) : (
        !error && <Loading />
      )}
    </>
  );
}


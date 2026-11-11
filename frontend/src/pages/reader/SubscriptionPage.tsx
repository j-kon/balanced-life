import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, CheckCircle2, ShoppingBag } from "lucide-react";
import { useApp } from "../../context/AppContext";
import { useData } from "../../hooks/useData";
import { ErrorBox, Loading } from "../../components/Common";
import { api, money } from "../../api";
import type {
  SubscriptionDetails,
  PaymentRecord,
  DigitalEntitlementRecord,
  DigitalPurchaseRecord,
  PrintedOrderRecord,
} from "../../types";

export function SubscriptionPage() {
  const { config, toast } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const digital = useData<{
    active: boolean;
    entitlement: DigitalEntitlementRecord | null;
    purchases: DigitalPurchaseRecord[];
  }>("/me/digital-edition");
  const legacy = useData<{
    subscription: SubscriptionDetails | null;
    payments: PaymentRecord[];
    printedOrders?: PrintedOrderRecord[];
  }>("/me/subscription");
  const [verificationError, setVerificationError] = useState("");
  const reference = new URLSearchParams(location.search).get("reference");

  useEffect(() => {
    if (!reference) return;
    let live = true;
    const verifyEndpoint = reference.startsWith("BLD_DIG_")
      ? "/digital-purchases/verify"
      : "/subscriptions/verify";
    api(verifyEndpoint, { reference })
      .then(() => {
        if (live) {
          toast("Your earlier payment has been verified.");
          navigate("/subscription", { replace: true });
          window.location.reload();
        }
      })
      .catch((e) => {
        if (live) setVerificationError(e.message);
      });
    return () => {
      live = false;
    };
  }, [reference]);

  const active = digital.data?.active || legacy.data?.subscription?.active;
  const ent = digital.data?.entitlement;
  const isScheduled = ent?.status === "scheduled" && !active;
  const durationMonths = config.settings.digitalAccessDurationMonths || 12;

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Your Balanced Life account</span>
          <h1>My online access &amp; orders</h1>
          <p>
            Manage your {durationMonths}-month 2027 Digital Devotional access
            and printed book orders.
          </p>
        </div>
      </div>
      <ErrorBox
        message={digital.error || legacy.error || verificationError}
      />
      {!digital.data || !legacy.data ? (
        <Loading />
      ) : (
        <>
          <section className="panel membership-panel">
            <span className="pill">
              {active
                ? "Online Access Active"
                : isScheduled
                  ? "Scheduled (Starts Jan 1, 2027)"
                  : ent?.status === "expired"
                    ? "Access Expired"
                    : "Free Account"}
            </span>
            <h2>
              {digital.data.active
                ? "2027 Digital Devotional Access"
                : isScheduled
                  ? "2027 Digital Access Confirmed"
                  : legacy.data.subscription?.active
                    ? "Existing Account Access"
                    : ent?.status === "expired"
                      ? "Renew Your 2027 Digital Access"
                      : "Begin your 2027 journey"}
            </h2>
            {isScheduled && ent ? (
              <>
                <p>
                  <CheckCircle2 size={18} /> Your 12-month 2027 Digital Edition
                  access is confirmed and scheduled to begin on{" "}
                  <strong>
                    {ent.startsAt
                      ? new Date(ent.startsAt).toLocaleDateString("en-GB")
                      : "01/01/2027"}
                  </strong>
                  {ent.expiresAt && (
                    <>
                      {" "}
                      through{" "}
                      <strong>
                        {new Date(ent.expiresAt).toLocaleDateString("en-GB")}
                      </strong>
                    </>
                  )}
                  . Free sample readings remain accessible now, and full 2027
                  reading unlocks on your start date.
                </p>
                <div className="actions">
                  <Link className="button" to="/library">
                    Browse library &amp; sample <ArrowRight size={17} />
                  </Link>
                  <Link className="button outline" to="/digital-edition">
                    Extend by {durationMonths} Months (
                    {money(config.settings.digitalEditionPriceKobo)})
                  </Link>
                </div>
              </>
            ) : digital.data.active && ent ? (
              <>
                <p>
                  <CheckCircle2 size={18} /> Your account has active online
                  access to all published 2027 devotionals.{" "}
                  {ent.legacyPersistent ? (
                    <strong>Persistent 2027 Edition Entitlement.</strong>
                  ) : (
                    <>
                      Activated{" "}
                      <strong>
                        {new Date(
                          ent.startsAt || ent.grantedAt,
                        ).toLocaleDateString("en-GB")}
                      </strong>
                      {ent.expiresAt && (
                        <>
                          {" "}
                          · Expires{" "}
                          <strong>
                            {new Date(ent.expiresAt).toLocaleDateString(
                              "en-GB",
                            )}
                          </strong>{" "}
                          ({ent.daysRemaining ?? 0} days remaining)
                        </>
                      )}
                      .
                    </>
                  )}
                </p>
                <div className="actions">
                  <Link className="button" to="/library">
                    Open your library <ArrowRight size={17} />
                  </Link>
                  {!ent.legacyPersistent && (
                    <Link className="button outline" to="/digital-edition">
                      Extend by {durationMonths} Months (
                      {money(config.settings.digitalEditionPriceKobo)})
                    </Link>
                  )}
                </div>
              </>
            ) : (
              <>
                {ent?.status === "expired" && (
                  <p>
                    Your 12-month online access expired on{" "}
                    <strong>
                      {ent.expiresAt
                        ? new Date(ent.expiresAt).toLocaleDateString("en-GB")
                        : "your account"}
                    </strong>
                    . Your Growth Journal reflections, saved bookmarks, and
                    reading progress remain safely preserved on your account.
                  </p>
                )}
                {legacy.data.subscription?.active && (
                  <p>
                    Your existing access remains valid until{" "}
                    {new Date(
                      legacy.data.subscription.expiresAt,
                    ).toLocaleDateString("en-GB")}
                    . Previous purchases are preserved.
                  </p>
                )}
                <p>
                  Get {durationMonths} calendar months of 2027 online access for{" "}
                  <strong>
                    {money(config.settings.digitalEditionPriceKobo)}
                  </strong>
                  , paid once with no automatic recurring charge.
                </p>
                <div className="actions">
                  <Link className="button" to="/digital-edition">
                    {ent?.status === "expired"
                      ? `Renew ${durationMonths}-Month Access`
                      : "Get online access"}{" "}
                    <ArrowRight size={17} />
                  </Link>
                  <Link className="button outline" to="/bookstore">
                    <ShoppingBag size={16} /> Order Printed Book (
                    {money(config.settings.hardcoverPriceKobo)})
                  </Link>
                </div>
              </>
            )}
          </section>

          <h2>2027 Digital Access Purchases</h2>
          {digital.data.purchases.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Reference</th>
                    <th>Method</th>
                    <th>Amount</th>
                    <th>Access Window</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {digital.data.purchases.map((p) => (
                    <tr key={p.id}>
                      <td>
                        {new Date(p.createdAt).toLocaleDateString("en-GB")}
                      </td>
                      <td className="reference">{p.reference}</td>
                      <td>
                        {p.paymentMethod === "paystack"
                          ? "Paystack"
                          : "Bank Transfer"}
                      </td>
                      <td>{money(p.amountKobo)}</td>
                      <td>
                        {p.startsAt && p.expiresAt
                          ? `${new Date(p.startsAt).toLocaleDateString("en-GB")} → ${new Date(p.expiresAt).toLocaleDateString("en-GB")}`
                          : "Upon verification"}
                      </td>
                      <td>
                        <span className="pill">{p.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted">
              Your online reading payments will appear here.
            </p>
          )}

          {legacy.data.printedOrders &&
            legacy.data.printedOrders.length > 0 && (
              <>
                <h2>Your Printed Book Orders</h2>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Order #</th>
                        <th>Date</th>
                        <th>Copies</th>
                        <th>Total</th>
                        <th>Payment</th>
                        <th>Fulfillment</th>
                      </tr>
                    </thead>
                    <tbody>
                      {legacy.data.printedOrders.map((po) => (
                        <tr key={po.id}>
                          <td>
                            <Link to="/bookstore">
                              <strong>{po.orderNumber}</strong>
                            </Link>
                          </td>
                          <td>
                            {new Date(po.createdAt).toLocaleDateString("en-GB")}
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
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

          {legacy.data.payments.length > 0 && (
            <details className="panel">
              <summary>Earlier payment history</summary>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Plan</th>
                      <th>Amount</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {legacy.data.payments.map((p) => (
                      <tr key={p.id}>
                        <td>{p.planName}</td>
                        <td>{money(p.amountKobo)}</td>
                        <td>{p.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
          <Link className="text-link" to="/install">
            Add Balanced Life to your home screen <ArrowRight size={16} />
          </Link>
        </>
      )}
    </>
  );
}

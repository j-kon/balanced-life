import { useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  Bell,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  Flame,
  Lock,
  PenLine,
  RefreshCw,
  ShieldAlert,
  ShoppingBag,
  Sparkles,
  Sun,
} from "lucide-react";
import { useApp } from "../../context/AppContext";
import { useData } from "../../hooks/useData";
import {
  DAILY_GROWTH_STEPS,
  Empty,
  EntryCard,
  ErrorBox,
  FiveStepFramework,
  Loading,
  ThemeSelector,
  UpcomingYearNotice,
} from "../../components/Common";
import { api, dateLabel, money } from "../../api";
import type {
  DigitalEntitlementRecord,
  Entry,
  NotificationEventRecord,
  ReaderAccessState,
  ReaderAccessSummary,
  SubscriptionDetails,
} from "../../types";

type DashboardData = {
  currentDate: string;
  isUpcomingYear: boolean;
  accessStatus: ReaderAccessState;
  access: ReaderAccessSummary;
  onboardingCompleted: boolean;
  hasAccess: boolean;
  hasSubscriptionAccess: boolean;
  hasDigitalEditionAccess: boolean;
  digitalEntitlement: DigitalEntitlementRecord | null;
  completed: number;
  streakDays: number;
  bookmarksCount: number;
  journalsCount: number;
  freeSample: Entry | null;
  todayEntryUnavailable: boolean;
  lockedPreviews: Entry[];
  featured: Entry | null;
  continueReading: Entry | null;
  history: Entry[];
  subscription: SubscriptionDetails | null;
  notifications: NotificationEventRecord[];
  unreadNotificationsCount: number;
};

function FirstTimeOnboarding({
  firstName,
  onDone,
  onError,
}: {
  firstName: string;
  onDone: () => Promise<void>;
  onError: (msg: string) => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [busy, setBusy] = useState(false);

  async function completeOnboarding() {
    setBusy(true);
    try {
      await api("/me/onboarding", { completed: true });
      await onDone();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="panel onboarding-card"
      aria-labelledby="onboarding-title"
    >
      <div className="onboarding-header">
        <div>
          <span className="eyebrow" style={{ marginBottom: "8px" }}>
            <Sparkles size={14} /> First-Time Reader Welcome
          </span>
          <h2 id="onboarding-title">
            Welcome to your Balanced Life journey, {firstName}!
          </h2>
          <p>
            Make room to connect with Jesus, learn, reflect, apply, and track
            your growth.
          </p>
        </div>
        <button
          type="button"
          className="text-link"
          disabled={busy}
          onClick={completeOnboarding}
        >
          Skip onboarding
        </button>
      </div>

      {step === 1 ? (
        <>
          <ol className="onboarding-steps">
            {DAILY_GROWTH_STEPS.map((item) => (
              <li key={item.step}>
                <strong>
                  {item.step}. {item.title}.
                </strong>{" "}
                <span>{item.description}</span>
              </li>
            ))}
          </ol>

          <div className="actions" style={{ marginTop: "18px" }}>
            <Link className="button" to="/sample">
              Read Free Sample <ArrowRight size={16} />
            </Link>
            <Link className="button outline" to="/digital-edition">
              Explore Online Access
            </Link>
            <button
              type="button"
              className="button outline"
              onClick={() => setStep(2)}
            >
              Personalize My Experience
            </button>
          </div>
        </>
      ) : (
        <div className="stack" style={{ gap: "16px", marginTop: "12px" }}>
          <div>
            <strong style={{ display: "block", marginBottom: "8px" }}>
              Choose your reading theme
            </strong>
            <ThemeSelector variant="full" />
          </div>

          <div className="notice" style={{ margin: 0 }}>
            <Bell size={18} />
            <div>
              <strong>Reminders &amp; Mobile App (Optional)</strong>
              <p>
                We never interrupt you with push prompts automatically. Configure
                daily reading reminders anytime in{" "}
                <Link className="text-link" to="/account#notifications">
                  Account &amp; Reminders
                </Link>{" "}
                or follow the{" "}
                <Link className="text-link" to="/install">
                  Install App guide
                </Link>{" "}
                once you are settled in.
              </p>
            </div>
          </div>

          <div className="actions">
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={completeOnboarding}
            >
              Complete onboarding <CheckCircle2 size={16} />
            </button>
            <button
              type="button"
              className="button outline"
              onClick={() => setStep(1)}
            >
              Back
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function NotificationSummaryPanel({
  notifications,
  unreadCount,
}: {
  notifications: NotificationEventRecord[];
  unreadCount: number;
}) {
  const recent = notifications.slice(0, 3);
  return (
    <div className="panel stack" style={{ marginTop: "18px" }}>
      <div className="section-title" style={{ margin: 0 }}>
        <div>
          <span className="eyebrow" style={{ marginBottom: "4px" }}>
            Notification Center
          </span>
          <h3 style={{ margin: 0 }}>
            Alerts &amp; Updates ({unreadCount} unread)
          </h3>
        </div>
        <Bell size={20} />
      </div>
      {recent.length > 0 ? (
        <div className="stack" style={{ gap: "10px" }}>
          {recent.map((n) => (
            <div key={n.id} className="notif-mini-row">
              <div>
                <strong>{n.title}</strong>
                <p>{n.body}</p>
              </div>
              <small>
                {new Date(n.createdAt).toLocaleDateString("en-GB")}
                {!n.readAt ? " · Unread" : ""}
              </small>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted" style={{ margin: 0, padding: 0 }}>
          No messages yet. Configure reminders or optional announcements in
          Account settings.
        </p>
      )}
      <div className="actions">
        <Link className="text-link" to="/notifications">
          Open Notification Center <ArrowRight size={14} />
        </Link>
        <Link className="text-link" to="/account#notifications">
          Reminder settings
        </Link>
      </div>
    </div>
  );
}

export function DashboardPage() {
  const { user, config, refresh, toast } = useApp();
  const { data, error, reload } = useData<DashboardData>("/me/dashboard");
  const [verifyBusy, setVerifyBusy] = useState(false);

  const firstName = user?.name.split(" ")[0] || "Reader";
  const priceKobo = config.settings.digitalEditionPriceKobo || 350000;
  const printedPriceKobo = config.settings.hardcoverPriceKobo || 500000;
  const unreadNotifications =
    data?.unreadNotificationsCount ??
    data?.notifications?.filter((n) => !n.readAt).length ??
    0;

  const [dismissedAfterSave, setDismissedAfterSave] = useState(false);

  async function handleFinishOnboarding() {
    setDismissedAfterSave(true);
    await refresh();
    reload();
  }

  async function checkPendingPayment(reference: string, method: string) {
    if (method !== "paystack") {
      await refresh();
      reload();
      toast(
        "Bank transfers remain pending until an administrator confirms settled funds.",
      );
      return;
    }
    setVerifyBusy(true);
    try {
      await api("/digital-purchases/verify", { reference });
      await refresh();
      reload();
      toast("Payment verified! Your 2027 online access has been updated.");
    } catch (e) {
      toast((e as Error).message);
      reload();
    } finally {
      setVerifyBusy(false);
    }
  }

  const accessStatus: ReaderAccessState = data?.accessStatus || "free";
  const showOnboarding = Boolean(
    !dismissedAfterSave &&
      data &&
      !data.onboardingCompleted &&
      !user?.onboardingCompletedAt,
  );

  const renderHeading = () => {
    if (accessStatus === "active" || accessStatus === "expiring_soon") {
      return (
        <>
          <h1>Welcome back, {firstName}.</h1>
          <p>
            Connect with Jesus · Learn · Reflect · Apply · Track Your Growth
          </p>
        </>
      );
    }
    if (accessStatus === "scheduled") {
      return (
        <>
          <h1>Your online access is confirmed.</h1>
          <p>
            Welcome, {firstName}. Your 12-month 2027 reading window is reserved
            and will unlock on your confirmed start date.
          </p>
        </>
      );
    }
    if (accessStatus === "pending_payment") {
      return (
        <>
          <h1>Your payment is awaiting verification.</h1>
          <p>
            Hello {firstName}. Your payment has not been verified yet, so
            premium 2027 devotionals remain locked while verification completes.
          </p>
        </>
      );
    }
    if (accessStatus === "expired") {
      return (
        <>
          <h1>Welcome back, {firstName}.</h1>
          <p>
            Your 12-month online access has expired. Your account, bookmarks,
            reading history, and Growth Journal remain safely preserved.
          </p>
        </>
      );
    }
    if (accessStatus === "revoked") {
      return (
        <>
          <h1>Online access update for {firstName}.</h1>
          <p>
            Online access on your previous entitlement is no longer active. Your
            private Growth Journal and saved notes remain safe on your account.
          </p>
        </>
      );
    }
    return (
      <>
        <h1>Your growth journey starts here.</h1>
        <p>
          Welcome, {firstName} — to The Balanced Life Devotional. Explore the
          five-step daily rhythm, read the free sample, or unlock full 2027
          online access.
        </p>
      </>
    );
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            {dateLabel(config.currentDate)} ·{" "}
            {config.isUpcomingYear ? "2027 Upcoming Edition" : "Daily Journey"}
          </span>
          {renderHeading()}
        </div>
        <Sun className="heading-sun" size={54} strokeWidth={1} />
      </div>

      {showOnboarding && (
        <FirstTimeOnboarding
          firstName={firstName}
          onDone={handleFinishOnboarding}
          onError={(msg) => toast(msg)}
        />
      )}

      <ErrorBox message={error} />
      {!data && !error ? (
        <Loading />
      ) : (
        data && (
          <>
            {(accessStatus === "active" ||
              accessStatus === "expiring_soon") && (
              <>
                {accessStatus === "expiring_soon" && data.access.expiresAt && (
                  <div className="notice">
                    <AlertCircle size={20} />
                    <div>
                      <strong>
                        Your 12-month online access expires in{" "}
                        {data.access.daysRemaining ?? 0} day
                        {data.access.daysRemaining === 1 ? "" : "s"} (
                        {new Date(data.access.expiresAt).toLocaleDateString(
                          "en-GB",
                        )}
                        )
                      </strong>
                      <p>
                        Renew manually for {money(priceKobo)} to extend by
                        another 12 calendar months without losing progress or
                        journals.
                      </p>
                      <Link className="text-link" to="/digital-edition">
                        Renew online access · {money(priceKobo)}{" "}
                        <ArrowRight size={14} />
                      </Link>
                    </div>
                  </div>
                )}

                <div className="dashboard-top">
                  <section className="featured-reading">
                    <span className="pill light">
                      <BookOpen size={14} />{" "}
                      {data.isUpcomingYear
                        ? "Featured 2027 reading"
                        : data.todayEntryUnavailable
                          ? "Latest published reading"
                          : "Today's devotional"}
                    </span>
                    {data.featured ? (
                      <>
                        <h2>{data.featured.title}</h2>
                        <p>
                          {dateLabel(data.featured.date)} ·{" "}
                          {data.featured.theme}
                        </p>
                        {data.todayEntryUnavailable && (
                          <p style={{ marginTop: "8px" }}>
                            Today&apos;s devotional is not published yet.
                            Continue with published material available on your
                            account.
                          </p>
                        )}
                        <Link
                          className="button cream"
                          to={"/read/" + data.featured.id}
                        >
                          Continue Reading <ArrowRight size={17} />
                        </Link>
                      </>
                    ) : (
                      <>
                        <h2>No published readings yet</h2>
                        <p>
                          Today&apos;s devotional has not been published yet.
                          Visit the library or check back after the author
                          publishes upcoming entries.
                        </p>
                        <Link className="button cream" to="/library">
                          Explore library <ArrowRight size={17} />
                        </Link>
                      </>
                    )}
                    <BookOpen
                      className="featured-watermark"
                      size={170}
                      strokeWidth={0.7}
                    />
                  </section>

                  <section className="progress-card">
                    <h3>Your 365-day progress</h3>
                    <div
                      className="progress-circle"
                      style={
                        {
                          "--progress": (data.completed / 365) * 360 + "deg",
                        } as CSSProperties
                      }
                    >
                      <div>
                        <strong>{data.completed}</strong>
                        <span>of 365 days</span>
                      </div>
                    </div>
                    <p className="streak-pill">
                      <Flame size={15} /> Current streak:{" "}
                      <strong>
                        {data.streakDays} day{data.streakDays === 1 ? "" : "s"}
                      </strong>
                    </p>
                    <small>
                      {config.publishedCount} published · {data.bookmarksCount}{" "}
                      saved · {data.journalsCount} reflections
                    </small>
                  </section>
                </div>

                <div className="section-title" style={{ marginTop: "30px" }}>
                  <h2>Your 5-Step Daily Growth Panel</h2>
                  <Link to="/journal">
                    Open Growth Journal <ArrowRight size={15} />
                  </Link>
                </div>
                <FiveStepFramework compact />

                <div className="dashboard-lower">
                  <section>
                    <div className="section-title">
                      <h2>Continue your reading</h2>
                      <Link to="/library">
                        View library <ArrowRight size={15} />
                      </Link>
                    </div>
                    {data.continueReading ? (
                      <EntryCard entry={data.continueReading} />
                    ) : (
                      <Empty title="All currently published readings completed">
                        You have completed every currently published reading.
                        Write a reflection in your Growth Journal or revisit
                        saved entries.
                      </Empty>
                    )}

                    <div className="section-title">
                      <h2>Recent reading history</h2>
                    </div>
                    {data.history.length ? (
                      <div className="history-list">
                        {data.history.map((e) => (
                          <Link to={"/read/" + e.id} key={e.id}>
                            <CheckCircle2 size={18} />
                            <span>
                              {e.title}
                              <small>{dateLabel(e.date)}</small>
                            </span>
                            <ArrowUpRight size={16} />
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <p className="muted">
                        Complete a reading to record your reading history.
                      </p>
                    )}
                  </section>

                  <aside>
                    <Link to="/journal" className="journal-promo">
                      <PenLine size={25} />
                      <h3>My Growth Journal</h3>
                      <p>
                        {data.journalsCount} saved reflection
                        {data.journalsCount === 1 ? "" : "s"}. Your daily lessons
                        and action steps remain strictly private to your
                        account.
                      </p>
                      <span>
                        Write a reflection <ArrowRight size={17} />
                      </span>
                    </Link>

                    <div
                      className="membership-summary panel"
                      style={{ marginTop: "18px" }}
                    >
                      <span className="eyebrow">Online Access Status</span>
                      <h3>
                        {data.access.legacyPersistent
                          ? "Legacy Persistent 2027 Entitlement"
                          : data.access.accessType === "complimentary"
                            ? "Complimentary 2027 Access"
                            : "2027 Online Access (12 Months)"}
                      </h3>
                      <p>
                        {data.access.legacyPersistent ? (
                          <>
                            <CheckCircle2
                              size={15}
                              style={{ display: "inline", marginRight: "6px" }}
                            />
                            Preserved legacy online reading access to the 2027
                            edition.
                          </>
                        ) : data.access.expiresAt ? (
                          <>
                            Active until{" "}
                            <strong>
                              {new Date(
                                data.access.expiresAt,
                              ).toLocaleDateString("en-GB")}
                            </strong>{" "}
                            ({data.access.daysRemaining ?? 0} days remaining). No
                            automatic recurring charge.
                          </>
                        ) : (
                          "Active online reading access."
                        )}
                      </p>
                      <div
                        className="stack"
                        style={{ gap: "10px", marginTop: "12px" }}
                      >
                        <Link to="/saved">
                          Saved readings ({data.bookmarksCount}){" "}
                          <ArrowUpRight size={14} />
                        </Link>
                        <Link to="/subscription">
                          Access details &amp; printed orders{" "}
                          <ArrowUpRight size={14} />
                        </Link>
                        <Link to="/account#notifications">
                          Reminder preferences <ArrowUpRight size={14} />
                        </Link>
                      </div>
                    </div>

                    <NotificationSummaryPanel
                      notifications={data.notifications}
                      unreadCount={unreadNotifications}
                    />
                  </aside>
                </div>
              </>
            )}

            {accessStatus === "scheduled" && (
              <>
                <div className="notice success">
                  <Calendar size={22} />
                  <div>
                    <strong>
                      Your online access is confirmed for the 2027 devotional
                      year.
                    </strong>
                    <p>
                      Confirmed start date:{" "}
                      <strong>
                        {data.access.startsAt
                          ? new Date(data.access.startsAt).toLocaleDateString(
                              "en-GB",
                            )
                          : "01/01/2027"}
                      </strong>
                      {data.access.expiresAt && (
                        <>
                          {" "}
                          · Expiration date:{" "}
                          <strong>
                            {new Date(data.access.expiresAt).toLocaleDateString(
                              "en-GB",
                            )}
                          </strong>
                        </>
                      )}
                      . Full 2027 devotional chapters unlock automatically on{" "}
                      <strong>
                        {data.access.startsAt
                          ? new Date(data.access.startsAt).toLocaleDateString(
                              "en-GB",
                            )
                          : "January 1, 2027"}
                      </strong>
                      . Until then, enjoy the free sample and prepare your
                      reading preferences and reminders.
                    </p>
                    <div className="actions" style={{ marginTop: "10px" }}>
                      {data.freeSample && (
                        <Link
                          className="button small"
                          to={"/read/" + data.freeSample.id}
                        >
                          Read Free Sample <ArrowRight size={15} />
                        </Link>
                      )}
                      <Link
                        className="button outline small"
                        to="/account#notifications"
                      >
                        Set up reading reminders
                      </Link>
                    </div>
                  </div>
                </div>

                <div className="dashboard-lower">
                  <section>
                    <div className="section-title">
                      <h2>Your Free Sample Reading</h2>
                    </div>
                    {data.freeSample ? (
                      <EntryCard entry={data.freeSample} />
                    ) : (
                      <p className="muted">Free sample coming soon.</p>
                    )}

                    <div className="section-title">
                      <h2>Locked 2027 Previews (Unlocking Jan 1, 2027)</h2>
                    </div>
                    <div className="entry-grid two-col-grid">
                      {data.lockedPreviews.map((entry) => (
                        <EntryCard key={entry.id} entry={entry} locked />
                      ))}
                    </div>
                  </section>

                  <aside>
                    <div className="panel stack">
                      <h3>Reading Preferences</h3>
                      <p>
                        Pick Light, Dark, or System mode before the new year
                        begins.
                      </p>
                      <ThemeSelector variant="full" />
                      <Link className="text-link" to="/account">
                        Manage account &amp; daily reminders{" "}
                        <ArrowRight size={14} />
                      </Link>
                    </div>

                    <NotificationSummaryPanel
                      notifications={data.notifications}
                      unreadCount={unreadNotifications}
                    />
                  </aside>
                </div>
              </>
            )}

            {accessStatus === "pending_payment" && (
              <>
                <div className="notice">
                  <Clock size={22} />
                  <div>
                    <strong>
                      Payment Not Yet Verified (
                      {data.access.pendingPurchase?.paymentMethod ===
                      "bank_transfer"
                        ? "Manual Bank Transfer"
                        : "Paystack Checkout"}
                      )
                    </strong>
                    <p>
                      Reference:{" "}
                      <code>{data.access.pendingPurchase?.reference}</code> ·
                      Amount:{" "}
                      <strong>
                        {money(data.access.pendingPurchase?.amountKobo || priceKobo)}
                      </strong>
                      . Online access does not unlock until payment verification
                      is confirmed by Paystack or an administrator.
                    </p>
                    <div className="actions" style={{ marginTop: "10px" }}>
                      {data.access.pendingPurchase && (
                        <button
                          type="button"
                          className="button small"
                          disabled={verifyBusy}
                          onClick={() =>
                            checkPendingPayment(
                              data.access.pendingPurchase!.reference,
                              data.access.pendingPurchase!.paymentMethod,
                            )
                          }
                        >
                          <RefreshCw size={14} />{" "}
                          {verifyBusy
                            ? "Checking status..."
                            : "Check payment status"}
                        </button>
                      )}
                      <Link
                        className="button outline small"
                        to="/digital-edition"
                      >
                        View payment details
                      </Link>
                    </div>
                  </div>
                </div>

                <div className="dashboard-lower">
                  <section>
                    <div className="section-title">
                      <h2>Free Sample Available Now</h2>
                    </div>
                    {data.freeSample && <EntryCard entry={data.freeSample} />}

                    <div className="section-title">
                      <h2>Locked 2027 Readings</h2>
                    </div>
                    <div className="entry-grid two-col-grid">
                      {data.lockedPreviews.map((entry) => (
                        <EntryCard key={entry.id} entry={entry} locked />
                      ))}
                    </div>
                  </section>
                  <aside>
                    <NotificationSummaryPanel
                      notifications={data.notifications}
                      unreadCount={unreadNotifications}
                    />
                  </aside>
                </div>
              </>
            )}

            {accessStatus === "expired" && (
              <>
                <div className="notice">
                  <AlertCircle size={22} />
                  <div>
                    <strong>Your 12-Month Online Access Has Expired</strong>
                    <p>
                      Ended on{" "}
                      <strong>
                        {data.access.expiresAt
                          ? new Date(data.access.expiresAt).toLocaleDateString(
                              "en-GB",
                            )
                          : "your previous term"}
                      </strong>
                      . Nothing was deleted: your account,{" "}
                      <strong>{data.bookmarksCount} saved bookmarks</strong>,{" "}
                      <strong>{data.completed} completed readings</strong>,{" "}
                      <strong>{data.journalsCount} private journal entries</strong>
                      , and notification preferences remain preserved.
                    </p>
                    <div className="actions" style={{ marginTop: "10px" }}>
                      <Link className="button small" to="/digital-edition">
                        Renew for {money(priceKobo)} (12 Months){" "}
                        <ArrowRight size={15} />
                      </Link>
                      <Link className="button outline small" to="/journal">
                        Open preserved Growth Journal
                      </Link>
                    </div>
                  </div>
                </div>

                <div className="dashboard-lower">
                  <section>
                    <div className="section-title">
                      <h2>Your Preserved Content &amp; Free Sample</h2>
                    </div>
                    {data.freeSample && <EntryCard entry={data.freeSample} />}
                    <div className="section-title">
                      <h2>Locked Devotionals (Renew to Restore Full Access)</h2>
                    </div>
                    <div className="entry-grid two-col-grid">
                      {data.lockedPreviews.map((entry) => (
                        <EntryCard key={entry.id} entry={entry} locked />
                      ))}
                    </div>
                  </section>
                  <aside>
                    <div className="panel stack">
                      <h3>Preserved on Your Account</h3>
                      <ul className="check-list">
                        <li>
                          <CheckCircle2 size={16} />{" "}
                          {data.journalsCount} Growth Journal reflection
                          {data.journalsCount === 1 ? "" : "s"}
                        </li>
                        <li>
                          <CheckCircle2 size={16} /> {data.bookmarksCount} saved
                          reading bookmark{data.bookmarksCount === 1 ? "" : "s"}
                        </li>
                        <li>
                          <CheckCircle2 size={16} /> {data.completed} completed
                          devotional record{data.completed === 1 ? "" : "s"}
                        </li>
                      </ul>
                      <div className="actions">
                        <Link className="text-link" to="/saved">
                          View saved list <ArrowRight size={14} />
                        </Link>
                        <Link className="text-link" to="/journal">
                          Open Growth Journal <ArrowRight size={14} />
                        </Link>
                      </div>
                    </div>

                    <NotificationSummaryPanel
                      notifications={data.notifications}
                      unreadCount={unreadNotifications}
                    />
                  </aside>
                </div>
              </>
            )}

            {accessStatus === "revoked" && (
              <>
                <div className="notice">
                  <ShieldAlert size={22} />
                  <div>
                    <strong>Online Access Support Notice</strong>
                    <p>
                      Online reading access linked to your earlier entitlement has
                      been revoked
                      {data.access.revokeReason
                        ? ` (${data.access.revokeReason})`
                        : ""}
                      . Your private Growth Journal reflections (
                      {data.journalsCount}) and saved bookmarks (
                      {data.bookmarksCount}) remain untouched. If you believe
                      this happened in error or need assistance, please contact{" "}
                      <strong>{config.settings.organizationName}</strong>.
                    </p>
                    <div className="actions" style={{ marginTop: "10px" }}>
                      <Link className="button small" to="/contact">
                        Contact Support <ArrowRight size={15} />
                      </Link>
                      <Link className="button outline small" to="/journal">
                        Open Growth Journal
                      </Link>
                    </div>
                  </div>
                </div>

                <div className="dashboard-lower">
                  <section>
                    {data.freeSample && (
                      <>
                        <div className="section-title">
                          <h2>Free Sample Devotional</h2>
                        </div>
                        <EntryCard entry={data.freeSample} />
                      </>
                    )}
                  </section>
                  <aside>
                    <NotificationSummaryPanel
                      notifications={data.notifications}
                      unreadCount={unreadNotifications}
                    />
                  </aside>
                </div>
              </>
            )}

            {accessStatus === "free" && (
              <>
                <UpcomingYearNotice />

                <div className="dashboard-top">
                  <section className="featured-reading">
                    <span className="pill light">
                      <Sparkles size={14} /> 2027 Online Access ·{" "}
                      {money(priceKobo)}
                    </span>
                    <h2>Unlock your 2027 devotional journey.</h2>
                    <p>
                      Get 12 months of online reading access for{" "}
                      {money(priceKobo)}. Includes all published 2027 readings,
                      full 5-step Growth Journal accountability, and saved
                      bookmarks with no automatic recurring charge.
                    </p>
                    <div className="actions" style={{ marginTop: "22px" }}>
                      <Link className="button cream" to="/digital-edition">
                        Get Online Access <ArrowRight size={17} />
                      </Link>
                      <Link className="button cream" to="/sample">
                        Read Free Sample
                      </Link>
                    </div>
                    <BookOpen
                      className="featured-watermark"
                      size={170}
                      strokeWidth={0.7}
                    />
                  </section>

                  <section className="progress-card">
                    <h3>The 365-Day 2027 Journey</h3>
                    <div
                      className="progress-circle"
                      style={{ "--progress": "0deg" } as CSSProperties}
                    >
                      <div>
                        <strong>365</strong>
                        <span>daily readings</span>
                      </div>
                    </div>
                    <p>
                      {config.publishedCount} readings published so far across
                      12 monthly themes for ages 13–25.
                    </p>
                    <small>
                      Free sample available now · Personal notes:{" "}
                      {data.journalsCount}
                    </small>
                  </section>
                </div>

                <div className="section-title" style={{ marginTop: "30px" }}>
                  <h2>How the 5-Step Daily Rhythm Works</h2>
                  <Link to="/about">
                    Learn more <ArrowRight size={15} />
                  </Link>
                </div>
                <FiveStepFramework compact />

                <div className="dashboard-lower">
                  <section>
                    <div className="section-title">
                      <h2>Free Devotional Sample</h2>
                      <Link to="/library">
                        Open library <ArrowRight size={15} />
                      </Link>
                    </div>
                    {data.freeSample ? (
                      <EntryCard entry={data.freeSample} />
                    ) : (
                      <Empty title="Sample devotional coming soon">
                        The free devotional sample will appear here once
                        published.
                      </Empty>
                    )}

                    {data.lockedPreviews.length > 0 && (
                      <>
                        <div className="section-title">
                          <h2>
                            <Lock
                              size={16}
                              style={{ display: "inline", marginRight: "6px" }}
                            />
                            Locked 2027 Previews
                          </h2>
                          <Link to="/digital-edition">
                            Unlock with {money(priceKobo)}{" "}
                            <ArrowRight size={14} />
                          </Link>
                        </div>
                        <div className="entry-grid two-col-grid">
                          {data.lockedPreviews.map((entry) => (
                            <EntryCard key={entry.id} entry={entry} locked />
                          ))}
                        </div>
                      </>
                    )}
                  </section>

                  <aside>
                    <div className="panel stack">
                      <span className="eyebrow" style={{ marginBottom: 0 }}>
                        Printed Companion
                      </span>
                      <h3>
                        Order the Printed Book ({money(printedPriceKobo)})
                      </h3>
                      <p>
                        Prefer a physical hardcover copy for personal study,
                        family devotion, or youth groups? Order online with
                        separate delivery arrangement.
                      </p>
                      <Link className="button outline" to="/bookstore">
                        <ShoppingBag size={16} /> Order Printed Book
                      </Link>
                    </div>

                    <div className="panel stack">
                      <h3>Appearance &amp; Account Preferences</h3>
                      <ThemeSelector variant="compact" />
                      <Link className="text-link" to="/account">
                        Manage account &amp; daily reminders{" "}
                        <ArrowRight size={14} />
                      </Link>
                    </div>

                    <NotificationSummaryPanel
                      notifications={data.notifications}
                      unreadCount={unreadNotifications}
                    />
                  </aside>
                </div>
              </>
            )}
          </>
        )
      )}
    </>
  );
}

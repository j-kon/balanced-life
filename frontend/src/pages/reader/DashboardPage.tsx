import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  Bell,
  BookOpen,
  CheckCircle2,
  PenLine,
  ShoppingBag,
  Sun,
} from "lucide-react";
import { useApp } from "../../context/AppContext";
import { useData } from "../../hooks/useData";
import {
  Empty,
  EntryCard,
  ErrorBox,
  FiveStepFramework,
  Loading,
  UpcomingYearNotice,
} from "../../components/Common";
import { dateLabel, money } from "../../api";
import type {
  DigitalEntitlementRecord,
  Entry,
  NotificationEventRecord,
  SubscriptionDetails,
} from "../../types";

type DashboardData = {
  currentDate: string;
  isUpcomingYear: boolean;
  hasAccess: boolean;
  hasSubscriptionAccess: boolean;
  hasDigitalEditionAccess: boolean;
  digitalEntitlement: DigitalEntitlementRecord | null;
  completed: number;
  bookmarksCount: number;
  journalsCount: number;
  featured: Entry | null;
  continueReading: Entry | null;
  history: Entry[];
  subscription: SubscriptionDetails | null;
  notifications: NotificationEventRecord[];
};

export function DashboardPage() {
  const { user, config } = useApp();
  const { data, error } = useData<DashboardData>("/me/dashboard");

  const unreadNotifications =
    data?.notifications?.filter((n) => !n.readAt) || [];

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            {dateLabel(config.currentDate)} ·{" "}
            {config.isUpcomingYear ? "2027 Upcoming Edition" : "Daily Journey"}
          </span>
          <h1>
            A little time to grow,
            <br />
            {user?.name.split(" ")[0]}.
          </h1>
          <p>
            Connect with Jesus · Learn · Reflect · Apply · Track Your Growth
          </p>
        </div>
        <Sun className="heading-sun" size={54} strokeWidth={1} />
      </div>

      <UpcomingYearNotice />

      {data?.subscription?.renewalReminder && (
        <div className="notice">
          <AlertCircle size={20} />
          <div>
            <strong>Membership Notice</strong>
            <p>{data.subscription.renewalReminder.message}</p>
            <Link className="text-link" to="/subscription">
              Manage membership <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      )}

      {unreadNotifications.length > 0 && (
        <div className="notice">
          <Bell size={20} />
          <div>
            <strong>{unreadNotifications[0].title}</strong>
            <p>{unreadNotifications[0].body}</p>
            <div className="actions" style={{ marginTop: "8px" }}>
              <Link
                className="text-link"
                to={unreadNotifications[0].actionUrl || "/dashboard"}
              >
                Open <ArrowRight size={14} />
              </Link>
              <Link className="text-link" to="/account">
                Manage reminders ({unreadNotifications.length} unread)
              </Link>
            </div>
          </div>
        </div>
      )}

      <ErrorBox message={error} />
      {!data && !error ? (
        <Loading />
      ) : (
        data && (
          <>
            <div className="dashboard-top">
              <section className="featured-reading">
                <span className="pill light">
                  <BookOpen size={14} />{" "}
                  {data.isUpcomingYear
                    ? "Featured 2027 reading"
                    : "Today's devotional"}
                </span>
                {data.featured ? (
                  <>
                    <h2>{data.featured.title}</h2>
                    <p>
                      {dateLabel(data.featured.date)} · {data.featured.theme}
                    </p>
                    <Link
                      className="button cream"
                      to={"/read/" + data.featured.id}
                    >
                      Start 5-step daily growth <ArrowRight size={17} />
                    </Link>
                  </>
                ) : (
                  <>
                    <h2>
                      A new year.
                      <br />A space for growth.
                    </h2>
                    <p>
                      Explore the published 2027 devotionals in the library and
                      track your spiritual growth throughout the year.
                    </p>
                    <Link className="button cream" to="/library">
                      Explore the library <ArrowRight size={17} />
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
                <h3>Your 365-day growth</h3>
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
                <p>Every day is a new step forward.</p>
                <small>
                  {config.publishedCount} published readings ·{" "}
                  {data.bookmarksCount} saved · {data.journalsCount} reflections
                </small>
              </section>
            </div>

            <div className="section-title" style={{ marginTop: "30px" }}>
              <h2>Your 5-Step Daily Growth Rhythm</h2>
              <Link to="/journal">
                Open Growth Journal <ArrowRight size={15} />
              </Link>
            </div>
            <FiveStepFramework compact />

            <div className="dashboard-lower">
              <section>
                <div className="section-title">
                  <h2>Continue your journey</h2>
                  <Link to="/library">
                    View library <ArrowRight size={15} />
                  </Link>
                </div>
                {data.continueReading ? (
                  <EntryCard entry={data.continueReading} />
                ) : (
                  <Empty title="Your first page is waiting">
                    Published devotionals will appear here. Your progress will
                    be saved as you read.
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
                    Complete a reading to begin your history.
                  </p>
                )}
              </section>
              <aside>
                <Link to="/journal" className="journal-promo">
                  <PenLine size={25} />
                  <h3>My Growth Journal</h3>
                  <p>
                    Your daily lessons, personal reflections, and practical
                    action steps. Strictly private to your account.
                  </p>
                  <span>
                    Write a reflection <ArrowRight size={17} />
                  </span>
                </Link>

                <div className="membership-summary panel" style={{ marginTop: "18px" }}>
                  <span className="eyebrow">Your Reading Access</span>
                  <h3>
                    {data.digitalEntitlement?.status === "active"
                      ? "2027 Digital Edition Owner"
                      : data.subscription?.active
                        ? `${data.subscription.planName} (${data.subscription.accessType === "complimentary" ? "Complimentary" : "Paid"})`
                        : "Free Sample Reader"}
                  </h3>
                  {data.digitalEntitlement?.status === "active" && (
                    <p>
                      <CheckCircle2
                        size={15}
                        style={{ display: "inline", marginRight: "6px" }}
                      />
                      Persistent online access to the 2027 edition (granted{" "}
                      {new Date(
                        data.digitalEntitlement.grantedAt,
                      ).toLocaleDateString("en-GB")}
                      ).
                    </p>
                  )}
                  {data.subscription && (
                    <p>
                      {data.subscription.active
                        ? "Membership active until " +
                          new Date(
                            data.subscription.expiresAt,
                          ).toLocaleDateString("en-GB")
                        : `Membership ${data.subscription.effectiveStatus} (${new Date(data.subscription.expiresAt).toLocaleDateString("en-GB")})`}
                    </p>
                  )}
                  {!data.hasAccess && (
                    <p>
                      Unlock all published 2027 devotionals with a one-time{" "}
                      <strong>
                        Digital Copy (
                        {money(config.settings.digitalEditionPriceKobo)})
                      </strong>{" "}
                      or a recurring membership plan.
                    </p>
                  )}
                  <div className="stack" style={{ gap: "10px", marginTop: "12px" }}>
                    <Link to="/digital-edition">
                      <ShoppingBag size={15} />{" "}
                      {data.digitalEntitlement?.status === "active"
                        ? "View 2027 Digital Edition"
                        : `Buy 2027 Digital Copy (${money(config.settings.digitalEditionPriceKobo)})`}{" "}
                      <ArrowUpRight size={14} />
                    </Link>
                    <Link to="/subscription">
                      Manage membership <ArrowUpRight size={14} />
                    </Link>
                  </div>
                </div>
              </aside>
            </div>
          </>
        )
      )}
    </>
  );
}

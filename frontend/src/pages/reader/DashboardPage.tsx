import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  PenLine,
  Sun,
} from "lucide-react";
import { useApp } from "../../context/AppContext";
import { useData } from "../../hooks/useData";
import {
  Empty,
  EntryCard,
  ErrorBox,
  Loading,
  UpcomingYearNotice,
} from "../../components/Common";
import { dateLabel } from "../../api";
import type { Entry, SubscriptionDetails } from "../../types";

type DashboardData = {
  currentDate: string;
  isUpcomingYear: boolean;
  hasAccess: boolean;
  completed: number;
  bookmarksCount: number;
  journalsCount: number;
  featured: Entry | null;
  continueReading: Entry | null;
  history: Entry[];
  subscription: SubscriptionDetails | null;
};

export function DashboardPage() {
  const { user, config } = useApp();
  const { data, error } = useData<DashboardData>("/me/dashboard");

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
          <p>Make today a moment of intention.</p>
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
                      Pause & read <ArrowRight size={17} />
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
                <h3>Your reading journey</h3>
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
                <p>Every day is a new beginning.</p>
                <small>
                  {config.publishedCount} published readings ·{" "}
                  {data.bookmarksCount} saved · {data.journalsCount} reflections
                </small>
              </section>
            </div>
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
                    Your thoughts, prayers, and little discoveries. A space that
                    belongs to you.
                  </p>
                  <span>
                    Write a reflection <ArrowRight size={17} />
                  </span>
                </Link>
                <div className="membership-summary">
                  <span className="eyebrow">Your membership</span>
                  <h3>
                    {data.subscription?.active
                      ? `${data.subscription.planName} (${data.subscription.accessType === "complimentary" ? "Complimentary" : "Paid"})`
                      : "Free reader"}
                  </h3>
                  <p>
                    {data.subscription?.active
                      ? "Active until " +
                        new Date(
                          data.subscription.expiresAt,
                        ).toLocaleDateString("en-GB")
                      : data.subscription
                        ? `Membership ${data.subscription.effectiveStatus} (${new Date(data.subscription.expiresAt).toLocaleDateString("en-GB")})`
                        : "Read free sample devotionals or activate a membership."}
                  </p>
                  <Link to="/subscription">
                    Manage membership <ArrowUpRight size={15} />
                  </Link>
                </div>
              </aside>
            </div>
          </>
        )
      )}
    </>
  );
}


import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  BookOpen,
  Bookmark,
  Calendar,
  CheckCircle2,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { dateLabel, daysUntil2027 } from "../api";
import type { Entry } from "../types";

export const Loading = () => (
  <div className="skeletons" aria-label="Loading" role="status">
    <div />
    <div />
    <div />
  </div>
);

export const ErrorBox = ({ message }: { message: string }) =>
  message ? (
    <p className="error" role="alert">
      {message}
    </p>
  ) : null;

export function Empty({
  title = "A little space for what comes next",
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className="empty">
      <BookOpen size={32} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

export function Brand() {
  const { config } = useApp();
  return (
    <Link
      to="/"
      className="brand"
      aria-label="The Balanced Life Devotional home"
    >
      <span className="brand-icon">
        <BookOpen size={23} />
      </span>
      <span>
        The Balanced Life
        <small>Devotional · {config.settings.organizationName}</small>
      </span>
    </Link>
  );
}

export function Cover() {
  const { config } = useApp();
  return config.cover ? (
    <img
      className="real-cover"
      src={config.cover}
      alt="The Balanced Life Devotional book cover"
    />
  ) : (
    <div className="cover-missing">
      <BookOpen size={48} strokeWidth={1} />
      <span>THE BALANCED LIFE</span>
      <span className="cover-title">
        2027 Devotional
        <br />
        Edition
      </span>
      <p>By {config.settings.authorName}</p>
      <small>{config.settings.organizationName}</small>
    </div>
  );
}

export function EntryCard({ entry }: { entry: Entry }) {
  return (
    <Link className="entry-card" to={"/read/" + entry.id}>
      <div className="entry-top">
        <span>{dateLabel(entry.date)}</span>
        {entry.completed ? (
          <CheckCircle2 size={18} />
        ) : entry.saved ? (
          <Bookmark size={18} />
        ) : (
          <BookOpen size={18} />
        )}
      </div>
      <h3>{entry.title}</h3>
      <p>{entry.theme || "Daily devotional"}</p>
      <div className="entry-bottom">
        <span>
          {entry.sample
            ? "Free sample"
            : entry.completed
              ? "Completed"
              : "Daily reading"}
        </span>
        <ArrowUpRight size={18} />
      </div>
    </Link>
  );
}

export function UpcomingYearNotice() {
  const { config } = useApp();
  if (!config.isUpcomingYear) return null;
  const days = daysUntil2027(config.currentDate);
  return (
    <div className="notice upcoming-banner">
      <Calendar size={20} />
      <div>
        <strong>
          The 2027 Devotional Year begins January 1, 2027
          {days > 0 ? ` (${days} days away)` : ""}.
        </strong>
        <p>
          You are exploring the 2027 edition ahead of the new year. Read the
          free January 1 sample or browse approved 2027 archive readings with an
          active membership.
        </p>
      </div>
    </div>
  );
}


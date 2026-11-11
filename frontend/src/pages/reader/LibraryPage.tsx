import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowRight, Bookmark, Search } from "lucide-react";
import { useApp } from "../../context/AppContext";
import { useData } from "../../hooks/useData";
import {
  Empty,
  EntryCard,
  ErrorBox,
  Loading,
  UpcomingYearNotice,
} from "../../components/Common";
import { monthName } from "../../api";
import type { Entry } from "../../types";

export function LibraryPage({ saved = false }: { saved?: boolean }) {
  const { config, access } = useApp();
  const { data, error } = useData<Entry[]>("/devotionals");
  const [search, setSearch] = useState("");
  const [month, setMonth] = useState(
    new URLSearchParams(useLocation().search).get("month") || "all",
  );
  const [theme, setTheme] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  const entries = data?.filter(
    (e) =>
      (!saved || e.saved) &&
      (month === "all" || Number(e.date.slice(5, 7)) === Number(month)) &&
      (theme === "all" || e.theme === theme) &&
      (filterStatus === "all" ||
        (filterStatus === "completed" && e.completed) ||
        (filterStatus === "unread" && !e.completed) ||
        (filterStatus === "sample" && e.sample)) &&
      [e.date, e.title, e.theme]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase()),
  );

  const hasAnySaved = Boolean(data?.some((e) => e.saved));

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">The 2027 collection</span>
          <h1>{saved ? "Keep what speaks to you." : "A year in the Word."}</h1>
          <p>
            {saved
              ? "Return to the readings you have saved."
              : "Explore the 2027 devotional archive by month, theme, or topic."}
          </p>
        </div>
      </div>

      {!saved && <UpcomingYearNotice />}

      {(!saved || hasAnySaved) && (
        <div className="filters">
          <label className="search-box">
            <Search size={18} />
            <input
              aria-label="Search devotionals"
              placeholder="Search readings, dates, or themes…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label className="sr-only" htmlFor="month">
            Month
          </label>
          <select
            id="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          >
            <option value="all">Every month</option>
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i} value={i + 1}>
                {monthName(i + 1)}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="theme">
            Theme
          </label>
          <select
            id="theme"
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
          >
            <option value="all">All themes</option>
            {[...new Set(data?.map((e) => e.theme).filter(Boolean))].map(
              (t) => (
                <option key={t}>{t}</option>
              ),
            )}
          </select>
          <label className="sr-only" htmlFor="reading-status">
            Reading status
          </label>
          <select
            id="reading-status"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="all">All readings</option>
            <option value="unread">Not yet completed</option>
            <option value="completed">Completed</option>
            <option value="sample">Free sample</option>
          </select>
        </div>
      )}

      <ErrorBox message={error} />
      {!data && !error ? (
        <Loading />
      ) : entries?.length ? (
        <div className="entry-grid">
          {entries.map((e) => (
            <EntryCard
              key={e.id}
              entry={e}
              locked={!access.hasAccess && !e.sample}
            />
          ))}
        </div>
      ) : saved && !hasAnySaved ? (
        <div className="empty-stage">
          <Empty
            icon={<Bookmark size={28} />}
            title="No saved readings yet"
            action={
              <Link className="button small" to="/library">
                Browse Devotional Library <ArrowRight size={15} />
              </Link>
            }
          >
            Tap Save reading on any devotional to keep inspiring passages close
            by for quick reflection later.
          </Empty>
        </div>
      ) : (
        <div className="empty-stage">
          <Empty
            icon={<Search size={28} />}
            title={
              config.publishedCount
                ? saved
                  ? "No saved readings match your filter"
                  : "No readings match your filter"
                : "The library is awaiting published readings"
            }
            action={
              config.publishedCount ? (
                <button
                  type="button"
                  className="button outline small"
                  onClick={() => {
                    setSearch("");
                    setMonth("all");
                    setTheme("all");
                    setFilterStatus("all");
                  }}
                >
                  Clear filters
                </button>
              ) : undefined
            }
          >
            {config.publishedCount
              ? "Try another search term, month, or status filter."
              : "The author can review and publish imported manuscript entries from the administration dashboard."}
          </Empty>
        </div>
      )}
    </>
  );
}


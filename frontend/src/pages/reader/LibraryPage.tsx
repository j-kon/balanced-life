import { useState } from "react";
import { useLocation } from "react-router-dom";
import { Search } from "lucide-react";
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
  const { config } = useApp();
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
          {[...new Set(data?.map((e) => e.theme).filter(Boolean))].map((t) => (
            <option key={t}>{t}</option>
          ))}
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

      <ErrorBox message={error} />
      {!data && !error ? (
        <Loading />
      ) : entries?.length ? (
        <div className="entry-grid">
          {entries.map((e) => (
            <EntryCard key={e.id} entry={e} />
          ))}
        </div>
      ) : (
        <Empty
          title={
            config.publishedCount
              ? "No readings match your filter"
              : "The library is awaiting published readings"
          }
        >
          {config.publishedCount
            ? "Try another search term, month, or filter."
            : "The author can review and publish imported manuscript entries from the administration dashboard."}
        </Empty>
      )}
    </>
  );
}


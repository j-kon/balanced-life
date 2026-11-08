import { useState } from "react";
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Eye,
  PenLine,
  Search,
  X,
} from "lucide-react";
import { Empty, ErrorBox, Loading } from "../../components/Common";
import { api, monthName } from "../../api";
import type { Entry } from "../../types";
import type { AdminOverviewData, AdminSaveFn } from "./AdminTypes";

const blankEntry: Partial<Entry> = {
  date: "2027-01-01",
  title: "",
  theme: "",
  bibleText: "",
  memoryVerse: "",
  reflection: "",
  thinkAbout: "",
  prayer: "",
  challenge: "",
  sample: false,
  published: false,
  reviewStatus: "pending_review",
  reviewerNotes: "",
};

export function DevotionalsPage({
  data,
  busy,
  formError,
  setFormError,
  save,
}: {
  data: AdminOverviewData;
  busy: boolean;
  formError: string;
  setFormError: (msg: string) => void;
  save: AdminSaveFn;
}) {
  const [entrySearch, setEntrySearch] = useState("");
  const [entryMonth, setEntryMonth] = useState("all");
  const [entryVisibility, setEntryVisibility] = useState("all");
  const [entryReviewFilter, setEntryReviewFilter] = useState("all");
  const [entryPage, setEntryPage] = useState(1);
  const [showThemesManager, setShowThemesManager] = useState(false);

  const [edit, setEdit] = useState<any>(null);
  const [previewEntry, setPreviewEntry] = useState<Entry | null>(null);
  const [loadingEntry, setLoadingEntry] = useState(false);

  async function openEntryEditor(id: number) {
    setLoadingEntry(true);
    setFormError("");
    try {
      const fullEntry = await api<Entry>("/admin/devotionals/" + id);
      setEdit(fullEntry);
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setLoadingEntry(false);
    }
  }

  async function openEntryPreview(id: number) {
    setLoadingEntry(true);
    setFormError("");
    try {
      const fullEntry = await api<Entry>("/admin/devotionals/" + id);
      setPreviewEntry(fullEntry);
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setLoadingEntry(false);
    }
  }

  const filteredDevotionals = data.devotionals.filter((d) => {
    if (
      entryMonth !== "all" &&
      Number(d.date.slice(5, 7)) !== Number(entryMonth)
    ) {
      return false;
    }
    if (entryVisibility === "published" && !d.published) return false;
    if (entryVisibility === "draft" && d.published) return false;
    if (entryVisibility === "sample" && !d.sample) return false;
    if (
      entryReviewFilter !== "all" &&
      d.reviewStatus !== entryReviewFilter
    ) {
      return false;
    }
    if (entrySearch.trim()) {
      const q = entrySearch.trim().toLowerCase();
      if (!`${d.date} ${d.title} ${d.theme}`.toLowerCase().includes(q)) {
        return false;
      }
    }
    return true;
  });

  const pageSize = 30;
  const totalPages = Math.max(
    1,
    Math.ceil(filteredDevotionals.length / pageSize),
  );
  const currentPage = Math.min(entryPage, totalPages);
  const pagedDevotionals = filteredDevotionals.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  if (loadingEntry) {
    return <Loading />;
  }

  if (previewEntry) {
    return (
      <div className="panel stack">
        <div className="section-title" style={{ margin: 0 }}>
          <div>
            <span className="eyebrow">
              Reader Preview · {previewEntry.date} · {previewEntry.theme}
            </span>
            <h2>{previewEntry.title}</h2>
          </div>
          <div className="actions">
            <button
              type="button"
              className="button small"
              onClick={() => {
                setEdit(previewEntry);
                setPreviewEntry(null);
              }}
            >
              <PenLine size={15} /> Edit Entry
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label="Close preview"
              onClick={() => setPreviewEntry(null)}
            >
              <X />
            </button>
          </div>
        </div>
        <div className="panel stack" style={{ background: "var(--cream)" }}>
          <p>
            <strong>Bible Text:</strong> {previewEntry.bibleText}
          </p>
          <p>
            <strong>Memory Verse:</strong> {previewEntry.memoryVerse}
          </p>
        </div>
        <div className="preserve-lines">{previewEntry.reflection}</div>
        <div className="panel stack">
          <p>
            <strong>Think About This:</strong> {previewEntry.thinkAbout}
          </p>
          <p>
            <strong>Prayer:</strong> {previewEntry.prayer}
          </p>
          <p>
            <strong>Daily Bible Challenge:</strong> {previewEntry.challenge}
          </p>
        </div>
      </div>
    );
  }

  if (edit) {
    return (
      <form
        className="panel stack"
        onSubmit={async (e) => {
          e.preventDefault();
          await save(
            "/admin/devotionals" + (edit.id ? "/" + edit.id : ""),
            edit,
            edit.id ? "PUT" : "POST",
          );
          setEdit(null);
        }}
      >
        <div className="section-title">
          <h2>{edit.id ? "Edit devotional" : "New devotional"}</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Close editor"
            onClick={() => setEdit(null)}
          >
            <X />
          </button>
        </div>
        <p>
          Review the author's wording carefully against the 2027 manuscript
          before marking as approved and published.
        </p>
        {edit.sourcePages && (
          <p className="muted">Source manuscript page {edit.sourcePages}</p>
        )}
        {(edit.date === "2027-02-13" ||
          edit.reviewStatus === "needs_revision") && (
          <div className="notice">
            <AlertCircle size={20} />
            <p>
              {edit.reviewerNotes ||
                "Review needed: check the section boundaries against the manuscript before publishing."}
            </p>
          </div>
        )}
        <div className="form-row-2">
          <label>
            Date
            <input
              type="date"
              required
              min="2027-01-01"
              max="2027-12-31"
              value={edit.date}
              onChange={(e) => setEdit({ ...edit, date: e.target.value })}
            />
          </label>
          <label>
            Review status
            <select
              value={edit.reviewStatus || "pending_review"}
              onChange={(e) =>
                setEdit({ ...edit, reviewStatus: e.target.value })
              }
            >
              <option value="pending_review">Pending review</option>
              <option value="needs_revision">Needs revision</option>
              <option value="approved">Approved for publication</option>
            </select>
          </label>
        </div>
        {[
          ["title", "Title"],
          ["theme", "Monthly theme"],
          ["bibleText", "Bible text"],
          ["memoryVerse", "Memory verse"],
          ["reflection", "Reflection"],
          ["thinkAbout", "Think About This"],
          ["prayer", "Prayer"],
          ["challenge", "Daily Bible Challenge"],
        ].map(([key, label]) => (
          <label key={key}>
            {label}
            {["title", "theme"].includes(key) ? (
              <input
                type="text"
                required={key === "title"}
                value={edit[key] || ""}
                onChange={(e) => setEdit({ ...edit, [key]: e.target.value })}
              />
            ) : (
              <textarea
                required={edit.published}
                value={edit[key] || ""}
                onChange={(e) => setEdit({ ...edit, [key]: e.target.value })}
                rows={key === "reflection" ? 8 : 3}
              />
            )}
          </label>
        ))}
        <label>
          Editorial / reviewer notes (internal only)
          <input
            type="text"
            value={edit.reviewerNotes || ""}
            onChange={(e) =>
              setEdit({ ...edit, reviewerNotes: e.target.value })
            }
            placeholder="Optional note for editorial review…"
          />
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={Boolean(edit.sample)}
            onChange={(e) => setEdit({ ...edit, sample: e.target.checked })}
          />
          Free sample — visible without a membership
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={Boolean(edit.published)}
            onChange={(e) =>
              setEdit({
                ...edit,
                published: e.target.checked,
                reviewStatus: e.target.checked ? "approved" : edit.reviewStatus,
              })
            }
          />
          Published — approved and visible in the reader library
        </label>
        <ErrorBox message={formError} />
        <div className="actions">
          <button className="button" disabled={busy}>
            {busy ? "Saving…" : "Save devotional"}
          </button>
          <button
            type="button"
            className="button outline"
            onClick={() => setEdit(null)}
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="stack">
      <div className="section-title" style={{ margin: 0 }}>
        <div>
          <h2>Devotional collection ({filteredDevotionals.length})</h2>
          <p className="muted" style={{ margin: 0 }}>
            {data.metrics.published} published · {data.metrics.drafts} in
            editorial review ({data.metrics.needsRevisionReadings} flagged for
            revision).
          </p>
        </div>
        <div className="actions">
          <button
            type="button"
            className="button outline small"
            onClick={() => {
              setEntrySearch("2027-02-13");
              setEntryPage(1);
            }}
          >
            Inspect Feb 13, 2027
          </button>
          <button
            type="button"
            className="button outline small"
            onClick={() => setShowThemesManager(!showThemesManager)}
          >
            {showThemesManager
              ? "Hide monthly themes"
              : "Manage 12 monthly themes"}
          </button>
          <button
            type="button"
            className="button small"
            onClick={() => setEdit({ ...blankEntry })}
          >
            New entry <PenLine size={15} />
          </button>
        </div>
      </div>

      {showThemesManager && (
        <div className="panel stack">
          <h3>2027 Monthly Themes</h3>
          <p>
            Update the title and overview description for any month of the 2027
            devotional year.
          </p>
          <div className="admin-plans">
            {data.themes.map((t) => (
              <form
                key={t.month}
                className="panel stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  save(
                    "/admin/themes/" + t.month,
                    {
                      title: f.get("title"),
                      description: f.get("description") || "",
                    },
                    "PUT",
                  );
                }}
              >
                <strong>
                  Month {t.month} · {monthName(t.month)}
                </strong>
                <label>
                  Theme title
                  <input name="title" defaultValue={t.title} required />
                </label>
                <label>
                  Overview description
                  <textarea
                    name="description"
                    rows={2}
                    defaultValue={t.description}
                  />
                </label>
                <button className="button outline small" disabled={busy}>
                  Save {monthName(t.month)} theme
                </button>
              </form>
            ))}
          </div>
        </div>
      )}

      <div className="filters">
        <label className="search-box">
          <Search size={18} />
          <input
            aria-label="Find an admin devotional"
            placeholder="Find a title or date, for example 2027-02-13…"
            value={entrySearch}
            onChange={(e) => {
              setEntrySearch(e.target.value);
              setEntryPage(1);
            }}
          />
        </label>
        <select
          aria-label="Filter by month"
          value={entryMonth}
          onChange={(e) => {
            setEntryMonth(e.target.value);
            setEntryPage(1);
          }}
        >
          <option value="all">All months</option>
          {Array.from({ length: 12 }, (_, i) => (
            <option key={i + 1} value={i + 1}>
              {monthName(i + 1)}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by visibility"
          value={entryVisibility}
          onChange={(e) => {
            setEntryVisibility(e.target.value);
            setEntryPage(1);
          }}
        >
          <option value="all">All visibility</option>
          <option value="published">Published</option>
          <option value="draft">Drafts</option>
          <option value="sample">Samples</option>
        </select>
        <select
          aria-label="Filter by review status"
          value={entryReviewFilter}
          onChange={(e) => {
            setEntryReviewFilter(e.target.value);
            setEntryPage(1);
          }}
        >
          <option value="all">All review states</option>
          <option value="approved">Approved</option>
          <option value="pending_review">Pending review</option>
          <option value="needs_revision">Needs revision</option>
        </select>
      </div>

      {pagedDevotionals.length ? (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Title</th>
                  <th>Review status</th>
                  <th>Visibility</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {pagedDevotionals.map((d) => (
                  <tr
                    key={d.id}
                    style={
                      d.date === "2027-02-13" ||
                      d.reviewStatus === "needs_revision"
                        ? { background: "rgba(180, 130, 40, 0.08)" }
                        : undefined
                    }
                  >
                    <td>
                      <strong>{d.date}</strong>
                    </td>
                    <td>{d.title}</td>
                    <td>
                      <span className="pill">
                        {d.reviewStatus === "approved"
                          ? "Approved"
                          : d.reviewStatus === "needs_revision"
                            ? "Needs revision"
                            : "Pending review"}
                      </span>
                    </td>
                    <td>
                      {d.published ? "Published" : "Draft"}
                      {d.sample ? " · Sample" : ""}
                    </td>
                    <td>
                      <div className="actions">
                        <button
                          type="button"
                          className="text-link"
                          onClick={() => openEntryEditor(d.id)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="text-link"
                          onClick={() => openEntryPreview(d.id)}
                        >
                          <Eye size={14} /> Preview
                        </button>
                        {d.published ? (
                          <button
                            type="button"
                            className="text-link"
                            disabled={busy}
                            onClick={() =>
                              save(`/admin/devotionals/${d.id}/status`, {
                                published: false,
                              })
                            }
                          >
                            Unpublish
                          </button>
                        ) : (
                          d.reviewStatus !== "needs_revision" && (
                            <button
                              type="button"
                              className="text-link"
                              disabled={busy}
                              onClick={() =>
                                save(`/admin/devotionals/${d.id}/status`, {
                                  published: true,
                                  reviewStatus: "approved",
                                })
                              }
                            >
                              Approve &amp; publish
                            </button>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="pagination-bar">
              <span>
                Page {currentPage} of {totalPages} ({filteredDevotionals.length}{" "}
                entries)
              </span>
              <div className="actions">
                <button
                  type="button"
                  className="button outline small"
                  disabled={currentPage <= 1}
                  onClick={() => setEntryPage((p) => p - 1)}
                >
                  <ChevronLeft size={15} /> Previous
                </button>
                <button
                  type="button"
                  className="button outline small"
                  disabled={currentPage >= totalPages}
                  onClick={() => setEntryPage((p) => p + 1)}
                >
                  Next <ChevronRight size={15} />
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <Empty title="No matching devotionals">
          Adjust your search or filters, or create a new entry.
        </Empty>
      )}
    </div>
  );
}


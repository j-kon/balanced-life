import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  PenLine,
  Search,
  X,
} from "lucide-react";
import { useAdminAuth } from "../context/AdminAuthContext";
import { ConfirmDialog, Empty, ErrorBox, Loading } from "../components/Common";
import { api, monthName } from "../api";
import type { Entry } from "../types";
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

const SIX_SECTIONS: Array<[keyof Entry, string]> = [
  ["bibleText", "Bible Text"],
  ["memoryVerse", "Memory Verse"],
  ["reflection", "Reflection"],
  ["thinkAbout", "Think About This"],
  ["prayer", "Prayer"],
  ["challenge", "Daily Bible Challenge"],
];

function entryCompleteCount(e: Partial<Entry>): number {
  return SIX_SECTIONS.filter(
    ([k]) => typeof e[k] === "string" && String(e[k]).trim().length > 0,
  ).length;
}

function getAll2027Dates(): string[] {
  const dates: string[] = [];
  for (let i = 0; i < 365; i += 1) {
    dates.push(new Date(Date.UTC(2027, 0, 1 + i)).toISOString().slice(0, 10));
  }
  return dates;
}

const ALL_2027_DATES = getAll2027Dates();

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
  const { hasPermission } = useAdminAuth();
  const canWrite = hasPermission("devotionals.write");

  const [entrySearch, setEntrySearch] = useState("");
  const [entryMonth, setEntryMonth] = useState("all");
  const [entryVisibility, setEntryVisibility] = useState("all");
  const [entryReviewFilter, setEntryReviewFilter] = useState("all");
  const [entryPage, setEntryPage] = useState(1);
  const [showThemesManager, setShowThemesManager] = useState(false);

  const [calendarMonth, setCalendarMonth] = useState<number>(2);
  const [selectedMissingDate, setSelectedMissingDate] = useState<string | null>(null);

  const [edit, setEdit] = useState<Partial<Entry> | null>(null);
  const [initialPublished, setInitialPublished] = useState<boolean>(false);
  const [confirmEditPublish, setConfirmEditPublish] = useState<boolean>(false);

  const [previewEntry, setPreviewEntry] = useState<Entry | null>(null);
  const [loadingEntry, setLoadingEntry] = useState(false);

  const [publishConfirmTarget, setPublishConfirmTarget] = useState<{
    entry: Pick<Entry, "id" | "date" | "title" | "published" | "reviewStatus">;
    nextPublished: boolean;
  } | null>(null);

  const [revisionTarget, setRevisionTarget] = useState<Pick<
    Entry,
    "id" | "date" | "title" | "reviewerNotes"
  > | null>(null);
  const [revisionNote, setRevisionNote] = useState("");

  const byDate = useMemo(() => {
    const map = new Map<string, Entry>();
    for (const d of data.devotionals) {
      map.set(d.date, d);
    }
    return map;
  }, [data.devotionals]);

  const editorialSummary = useMemo(() => {
    const publishedCount = data.devotionals.filter((d) => d.published).length;
    const approvedUnpublishedCount = data.devotionals.filter(
      (d) => !d.published && d.reviewStatus === "approved",
    ).length;
    const pendingReviewCount = data.devotionals.filter(
      (d) => d.reviewStatus === "pending_review",
    ).length;
    const needsRevisionCount = data.devotionals.filter(
      (d) => d.reviewStatus === "needs_revision",
    ).length;
    const missingDates = ALL_2027_DATES.filter((iso) => !byDate.has(iso));
    return {
      publishedCount,
      approvedUnpublishedCount,
      pendingReviewCount,
      needsRevisionCount,
      missingDates,
    };
  }, [data.devotionals, byDate]);

  const feb13 = byDate.get("2027-02-13");
  const flaggedEntries = data.devotionals.filter(
    (d) => d.reviewStatus === "needs_revision",
  );

  async function openEntryEditor(id: number) {
    setLoadingEntry(true);
    setFormError("");
    try {
      const fullEntry = await api<Entry>("/admin/devotionals/" + id);
      setInitialPublished(Boolean(fullEntry.published));
      setEdit(fullEntry);
      setPreviewEntry(null);
      setSelectedMissingDate(null);
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
      setSelectedMissingDate(null);
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setLoadingEntry(false);
    }
  }

  async function performStatusUpdate(
    id: number,
    payload: {
      published?: boolean;
      reviewStatus?: "approved" | "pending_review" | "needs_revision";
      reviewerNotes?: string;
    },
    successMsg: string,
  ): Promise<boolean> {
    const ok = await save(
      `/admin/devotionals/${id}/status`,
      payload,
      "PATCH",
      successMsg,
    );
    if (ok && previewEntry?.id === id) {
      try {
        const refreshed = await api<Entry>("/admin/devotionals/" + id);
        setPreviewEntry(refreshed);
      } catch {
        // Ignore background preview refresh errors after save succeeds
      }
    }
    return ok;
  }

  async function executeSaveEdit() {
    if (!edit) return;
    const ok = await save(
      "/admin/devotionals" + (edit.id ? "/" + edit.id : ""),
      edit,
      edit.id ? "PUT" : "POST",
      edit.published
        ? `Saved and published ${edit.date} devotional.`
        : `Saved ${edit.date} devotional draft.`,
    );
    if (ok) {
      setConfirmEditPublish(false);
      setEdit(null);
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
    if (entryVisibility === "approved_unpublished" && (d.published || d.reviewStatus !== "approved")) {
      return false;
    }
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

  useEffect(() => {
    setEntryPage(1);
  }, [entrySearch, entryMonth, entryVisibility, entryReviewFilter]);

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

  // Calendar grid for chosen 2027 month (1..12)
  const monthPrefix = `2027-${String(calendarMonth).padStart(2, "0")}`;
  const daysInCalMonth = new Date(Date.UTC(2027, calendarMonth, 0)).getUTCDate();
  const calDays = Array.from({ length: daysInCalMonth }, (_, idx) => {
    const day = idx + 1;
    const iso = `${monthPrefix}-${String(day).padStart(2, "0")}`;
    return {
      day,
      iso,
      entry: byDate.get(iso) || null,
    };
  });

  if (loadingEntry) {
    return <Loading />;
  }

  if (previewEntry) {
    const completeCount = entryCompleteCount(previewEntry);
    const isApproved = previewEntry.reviewStatus === "approved";
    const canPublishNow = isApproved && completeCount === 6;

    return (
      <div className="panel stack">
        <div className="section-title" style={{ margin: 0 }}>
          <div>
            <span className="eyebrow">
              Reader Preview · {previewEntry.date} · {previewEntry.theme || "No theme set"}
            </span>
            <h2>{previewEntry.title}</h2>
            <div className="actions" style={{ marginTop: 6 }}>
              <span className="pill">
                Review:{" "}
                {previewEntry.reviewStatus === "approved"
                  ? "Approved"
                  : previewEntry.reviewStatus === "needs_revision"
                    ? "Needs Revision"
                    : "Pending Review"}
              </span>
              <span className="pill">
                {previewEntry.published ? "Published to Readers" : "Draft (Unpublished)"}
              </span>
              {previewEntry.sample && <span className="pill">Free Sample</span>}
              {previewEntry.sourcePages && (
                <span className="pill">Source page {previewEntry.sourcePages}</span>
              )}
              <span className="pill">{completeCount} / 6 sections complete</span>
            </div>
          </div>
          <div className="actions">
            {canWrite && previewEntry.reviewStatus !== "approved" && (
              <button
                type="button"
                className="button outline small"
                disabled={busy}
                onClick={() =>
                  performStatusUpdate(
                    previewEntry.id,
                    {
                      reviewStatus: "approved",
                      reviewerNotes: previewEntry.reviewerNotes || "",
                    },
                    `Marked ${previewEntry.date} devotional as Approved (still draft until published).`,
                  )
                }
              >
                <CheckCircle2 size={15} /> Approve Entry
              </button>
            )}
            {canWrite && previewEntry.reviewStatus !== "needs_revision" && (
              <button
                type="button"
                className="button outline small"
                disabled={busy}
                onClick={() => {
                  setFormError("");
                  setRevisionTarget(previewEntry);
                  setRevisionNote(previewEntry.reviewerNotes || "");
                }}
              >
                Flag Revision
              </button>
            )}
            {canWrite &&
              (previewEntry.published ? (
                <button
                  type="button"
                  className="button outline small"
                  disabled={busy}
                  onClick={() => {
                    setFormError("");
                    setPublishConfirmTarget({
                      entry: previewEntry,
                      nextPublished: false,
                    });
                  }}
                >
                  Unpublish
                </button>
              ) : (
                <button
                  type="button"
                  className="button small"
                  disabled={busy || !canPublishNow}
                  title={
                    canPublishNow
                      ? "Publish this approved entry"
                      : "Entry must be Approved and have all 6 sections complete before publishing"
                  }
                  onClick={() => {
                    setFormError("");
                    setPublishConfirmTarget({
                      entry: previewEntry,
                      nextPublished: true,
                    });
                  }}
                >
                  Publish Entry
                </button>
              ))}
            {canWrite && (
              <button
                type="button"
                className="button outline small"
                onClick={() => {
                  setInitialPublished(Boolean(previewEntry.published));
                  setEdit(previewEntry);
                  setPreviewEntry(null);
                }}
              >
                <PenLine size={15} /> Edit Entry
              </button>
            )}
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

        {(previewEntry.date === "2027-02-13" ||
          previewEntry.reviewStatus === "needs_revision") && (
          <div className="notice">
            <AlertCircle size={20} />
            <div>
              <strong>
                {previewEntry.reviewStatus === "needs_revision"
                  ? "Editorial Revision Required Before Approval"
                  : "February 13, 2027 Editorial Record"}
              </strong>
              <p style={{ margin: 0 }}>
                {previewEntry.reviewerNotes ||
                  "Check section boundaries against the manuscript before marking Approved."}
              </p>
            </div>
          </div>
        )}

        <div className="admin-section-checklist">
          {SIX_SECTIONS.map(([key, label]) => {
            const filled =
              typeof previewEntry[key] === "string" &&
              String(previewEntry[key]).trim().length > 0;
            return (
              <div
                key={key}
                className="panel"
                style={{
                  padding: "8px 10px",
                  background: filled ? "#eef6ee" : "#fcebea",
                  borderColor: filled ? "#b7d7b8" : "#df9c9f",
                  fontSize: "0.78rem",
                }}
              >
                <strong>{label}:</strong> {filled ? "Present" : "Missing"}
              </div>
            );
          })}
        </div>

        <div className="panel stack" style={{ background: "var(--cream)" }}>
          <p>
            <strong>Bible Text:</strong> {previewEntry.bibleText || "—"}
          </p>
          <p>
            <strong>Memory Verse:</strong> {previewEntry.memoryVerse || "—"}
          </p>
        </div>
        <div className="preserve-lines">{previewEntry.reflection || "—"}</div>
        <div className="panel stack">
          <p>
            <strong>Think About This:</strong> {previewEntry.thinkAbout || "—"}
          </p>
          <p>
            <strong>Prayer:</strong> {previewEntry.prayer || "—"}
          </p>
          <p>
            <strong>Daily Bible Challenge:</strong> {previewEntry.challenge || "—"}
          </p>
        </div>
        {previewEntry.reviewerNotes && (
          <p className="muted" style={{ margin: 0 }}>
            <strong>Reviewer Notes:</strong> {previewEntry.reviewerNotes}
            {previewEntry.reviewedAt
              ? ` · Last reviewed ${new Date(previewEntry.reviewedAt).toLocaleString("en-GB")}`
              : ""}
          </p>
        )}

        <ConfirmDialog
          open={Boolean(publishConfirmTarget)}
          title={
            publishConfirmTarget?.nextPublished
              ? `Publish ${publishConfirmTarget.entry.date} devotional?`
              : `Unpublish ${publishConfirmTarget?.entry.date || ""} devotional?`
          }
          description={
            publishConfirmTarget?.nextPublished
              ? `"${publishConfirmTarget.entry.title}" will become visible to entitled 2027 Online Access readers immediately upon publication.`
              : `Unpublishing "${publishConfirmTarget?.entry.title || ""}" removes it from reader view while preserving your text as a draft.`
          }
          confirmLabel={
            publishConfirmTarget?.nextPublished
              ? "Confirm Publish"
              : "Confirm Unpublish"
          }
          busy={busy}
          error={formError}
          onCancel={() => {
            setFormError("");
            setPublishConfirmTarget(null);
          }}
          onConfirm={async () => {
            if (!publishConfirmTarget) return;
            const ok = await performStatusUpdate(
              publishConfirmTarget.entry.id,
              {
                published: publishConfirmTarget.nextPublished,
                reviewStatus: publishConfirmTarget.entry.reviewStatus,
              },
              publishConfirmTarget.nextPublished
                ? `Published ${publishConfirmTarget.entry.date} devotional.`
                : `Unpublished ${publishConfirmTarget.entry.date} devotional.`,
            );
            if (ok) setPublishConfirmTarget(null);
          }}
        />

        <ConfirmDialog
          open={Boolean(revisionTarget)}
          title={`Flag ${revisionTarget?.date || ""} as Needs Revision`}
          description="This unpublishes the entry (if published) and marks it for manuscript verification."
          confirmLabel="Mark Needs Revision"
          busy={busy}
          error={formError}
          onCancel={() => {
            setFormError("");
            setRevisionTarget(null);
          }}
          onConfirm={async () => {
            if (!revisionTarget) return;
            const ok = await performStatusUpdate(
              revisionTarget.id,
              {
                published: false,
                reviewStatus: "needs_revision",
                reviewerNotes: revisionNote.trim(),
              },
              `Flagged ${revisionTarget.date} for revision.`,
            );
            if (ok) setRevisionTarget(null);
          }}
        >
          <label>
            Editorial note describing what needs verification
            <input
              value={revisionNote}
              onChange={(e) => setRevisionNote(e.target.value)}
              placeholder="e.g. Verify Think About This boundary against page 27"
            />
          </label>
        </ConfirmDialog>
      </div>
    );
  }

  if (edit && canWrite) {
    const completeCount = entryCompleteCount(edit);
    const isApproved = edit.reviewStatus === "approved";

    return (
      <form
        className="panel stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setFormError("");
          if (edit.published && edit.reviewStatus !== "approved") {
            setFormError(
              "Entries must be explicitly reviewed and marked Approved before publishing.",
            );
            return;
          }
          if (edit.published && completeCount < 6) {
            setFormError(
              "All six devotional reading sections are required before publishing.",
            );
            return;
          }
          if (Boolean(edit.published) !== initialPublished) {
            setConfirmEditPublish(true);
            return;
          }
          await executeSaveEdit();
        }}
      >
        <div className="section-title">
          <h2>{edit.id ? `Edit devotional (${edit.date})` : `New devotional (${edit.date})`}</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Close editor"
            disabled={busy}
            onClick={() => {
              setFormError("");
              setEdit(null);
            }}
          >
            <X />
          </button>
        </div>
        <p className="muted" style={{ margin: 0 }}>
          Preserve the author&apos;s wording carefully against the 2027 manuscript. Mark{" "}
          <strong>Approved for publication</strong> explicitly before enabling publication.
        </p>
        {edit.sourcePages && (
          <p className="muted" style={{ margin: 0 }}>
            Source manuscript page {edit.sourcePages}
          </p>
        )}
        {(edit.date === "2027-02-13" ||
          edit.reviewStatus === "needs_revision") && (
          <div className="notice">
            <AlertCircle size={20} />
            <div>
              <strong>Editorial Issue Flagged</strong>
              <p style={{ margin: 0 }}>
                {edit.reviewerNotes ||
                  "Check the section boundaries against the manuscript before marking Approved."}
              </p>
            </div>
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
              value={edit.date || ""}
              onChange={(e) => setEdit({ ...edit, date: e.target.value })}
            />
          </label>
          <label>
            Review status
            <select
              value={edit.reviewStatus || "pending_review"}
              onChange={(e) => {
                const nextReview = e.target.value as Entry["reviewStatus"];
                setEdit({
                  ...edit,
                  reviewStatus: nextReview,
                  published: nextReview === "approved" ? edit.published : false,
                });
              }}
            >
              <option value="pending_review">Pending review</option>
              <option value="needs_revision">Needs revision</option>
              <option value="approved">Approved for publication</option>
            </select>
          </label>
        </div>
        {(
          [
            ["title", "Title"],
            ["theme", "Monthly theme"],
            ["bibleText", "Bible text"],
            ["memoryVerse", "Memory verse"],
            ["reflection", "Reflection"],
            ["thinkAbout", "Think About This"],
            ["prayer", "Prayer"],
            ["challenge", "Daily Bible Challenge"],
          ] as Array<[keyof Entry, string]>
        ).map(([key, label]) => (
          <label key={key}>
            {label}
            {key === "title" || key === "theme" ? (
              <input
                type="text"
                required={key === "title"}
                value={(edit[key] as string) || ""}
                onChange={(e) => setEdit({ ...edit, [key]: e.target.value })}
              />
            ) : (
              <textarea
                required={Boolean(edit.published)}
                value={(edit[key] as string) || ""}
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
          Free sample — previewable before purchasing 2027 Online Access
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={Boolean(edit.published)}
            disabled={!isApproved}
            onChange={(e) =>
              setEdit({
                ...edit,
                published: e.target.checked,
              })
            }
          />
          Published — visible to readers{" "}
          {!isApproved
            ? "(select 'Approved for publication' first)"
            : `(${completeCount}/6 sections complete)`}
        </label>
        <ErrorBox message={formError} />
        <div className="actions">
          <button className="button" disabled={busy}>
            {busy ? "Saving…" : "Save devotional"}
          </button>
          <button
            type="button"
            className="button outline"
            disabled={busy}
            onClick={() => {
              setFormError("");
              setEdit(null);
            }}
          >
            Cancel
          </button>
        </div>

        <ConfirmDialog
          open={confirmEditPublish}
          title={
            edit.published
              ? `Publish ${edit.date} devotional?`
              : `Unpublish ${edit.date} devotional?`
          }
          description={
            edit.published
              ? `You are about to publish "${edit.title}". Approved entries become immediately visible to eligible readers.`
              : `You are about to unpublish "${edit.title}". Readers will no longer see it until republished.`
          }
          confirmLabel={
            edit.published ? "Save & Publish" : "Save & Unpublish"
          }
          busy={busy}
          error={formError}
          onCancel={() => setConfirmEditPublish(false)}
          onConfirm={executeSaveEdit}
        />
      </form>
    );
  }

  return (
    <div className="stack">
      <div className="section-title" style={{ margin: 0 }}>
        <div>
          <h2>2027 Devotional Editorial Collection ({filteredDevotionals.length})</h2>
          <p className="muted" style={{ margin: 0 }}>
            {editorialSummary.publishedCount} published ·{" "}
            {editorialSummary.approvedUnpublishedCount} approved unpublished ·{" "}
            {editorialSummary.pendingReviewCount} pending review ·{" "}
            {editorialSummary.needsRevisionCount} needs revision ·{" "}
            {editorialSummary.missingDates.length} missing 2027 dates
          </p>
        </div>
        <div className="actions">
          <button
            type="button"
            className="button outline small"
            onClick={() => {
              setCalendarMonth(2);
              if (feb13) {
                openEntryPreview(feb13.id);
              } else {
                setEntrySearch("2027-02-13");
              }
            }}
          >
            Inspect Feb 13, 2027
          </button>
          {canWrite && (
            <button
              type="button"
              className="button outline small"
              onClick={() => setShowThemesManager(!showThemesManager)}
            >
              {showThemesManager
                ? "Hide monthly themes"
                : "Manage 12 monthly themes"}
            </button>
          )}
          {canWrite && (
            <button
              type="button"
              className="button small"
              onClick={() => {
                setFormError("");
                setInitialPublished(false);
                setEdit({
                  ...blankEntry,
                  date: editorialSummary.missingDates[0] || "2027-01-01",
                });
              }}
            >
              New entry <PenLine size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Prominent Highlight for February 13, 2027 / Flagged Issues */}
      {(feb13?.reviewStatus === "needs_revision" || flaggedEntries.length > 0) && (
        <div className="editorial-issue-banner">
          <div className="stack" style={{ gap: 4 }}>
            <strong>
              Editorial Issue Highlight:{" "}
              {feb13?.reviewStatus === "needs_revision"
                ? `February 13, 2027 — "${feb13.title}"`
                : `${flaggedEntries.length} devotional(s) require revision`}
            </strong>
            <span className="muted" style={{ fontSize: "0.86rem" }}>
              {feb13?.reviewerNotes ||
                flaggedEntries[0]?.reviewerNotes ||
                "Verify devotional field boundaries against manuscript before approval."}
              {feb13?.sourcePages ? ` · Source page ${feb13.sourcePages}` : ""}
            </span>
          </div>
          <div className="actions" style={{ margin: 0 }}>
            <button
              type="button"
              className="button small"
              onClick={() => {
                const target = feb13 || flaggedEntries[0];
                if (target) {
                  setCalendarMonth(Number(target.date.slice(5, 7)) || 2);
                  openEntryPreview(target.id);
                }
              }}
            >
              <Eye size={14} /> Open Review Preview
            </button>
          </div>
        </div>
      )}

      {/* 2027 Editorial Calendar */}
      <section className="panel stack">
        <div className="row" style={{ flexWrap: "wrap", gap: 10 }}>
          <div>
            <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
              <Calendar size={18} /> 2027 Editorial Calendar — {monthName(calendarMonth)} 2027
            </h3>
            <small className="muted">
              Select any day to inspect or edit its devotional, or create an entry for a missing date.
            </small>
          </div>
          <div className="actions" style={{ margin: 0, flexWrap: "wrap" }}>
            <span className="pill">Published: {editorialSummary.publishedCount}</span>
            <span className="pill">
              Approved draft: {editorialSummary.approvedUnpublishedCount}
            </span>
            <span className="pill">
              Pending review: {editorialSummary.pendingReviewCount}
            </span>
            <span className="pill">
              Needs revision: {editorialSummary.needsRevisionCount}
            </span>
            <span className="pill">
              Missing: {editorialSummary.missingDates.length}
            </span>
          </div>
        </div>

        <div className="editorial-month-strip" role="tablist" aria-label="2027 Editorial Calendar Months">
          {Array.from({ length: 12 }, (_, idx) => {
            const m = idx + 1;
            const mPrefix = `2027-${String(m).padStart(2, "0")}`;
            const daysInM = new Date(Date.UTC(2027, m, 0)).getUTCDate();
            let flagged = 0;
            let missing = 0;
            for (let d = 1; d <= daysInM; d += 1) {
              const iso = `${mPrefix}-${String(d).padStart(2, "0")}`;
              const e = byDate.get(iso);
              if (!e) missing += 1;
              else if (e.reviewStatus === "needs_revision") flagged += 1;
            }
            return (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={calendarMonth === m}
                className={`editorial-month-chip ${calendarMonth === m ? "active" : ""}`}
                onClick={() => {
                  setCalendarMonth(m);
                  setSelectedMissingDate(null);
                }}
              >
                <span>{monthName(m).slice(0, 3)}</span>
                {flagged > 0 && <small>({flagged}!)</small>}
                {missing > 0 && <small>({missing}m)</small>}
              </button>
            );
          })}
        </div>

        <div className="editorial-calendar-grid">
          {calDays.map(({ day, iso, entry }) => {
            const statusClass = !entry
              ? "missing"
              : entry.reviewStatus === "needs_revision"
                ? "needs-revision"
                : entry.published
                  ? "published"
                  : entry.reviewStatus === "approved"
                    ? "approved-draft"
                    : "pending-review";
            const statusText = !entry
              ? "Missing"
              : entry.reviewStatus === "needs_revision"
                ? "Needs revision"
                : entry.published
                  ? "Published"
                  : entry.reviewStatus === "approved"
                    ? "Approved draft"
                    : "Pending review";
            return (
              <button
                key={iso}
                type="button"
                className={`calendar-day-btn ${statusClass}${selectedMissingDate === iso ? " selected" : ""}`}
                title={`${iso} · ${statusText}${entry ? ` · ${entry.title}` : ""}`}
                onClick={() => {
                  if (entry) {
                    openEntryPreview(entry.id);
                  } else {
                    setSelectedMissingDate(iso);
                  }
                }}
              >
                <div className="row" style={{ gap: 4 }}>
                  <strong>{day}</strong>
                  <small>{statusText}</small>
                </div>
                <span>{entry ? entry.title : "No entry"}</span>
              </button>
            );
          })}
        </div>

        {selectedMissingDate && (
          <div className="notice">
            <AlertCircle size={18} />
            <div style={{ flex: 1 }}>
              <strong>Missing Devotional Entry: {selectedMissingDate}</strong>
              <p style={{ margin: 0 }}>
                No entry currently exists in the database for {selectedMissingDate}.
              </p>
            </div>
            {canWrite && (
              <button
                type="button"
                className="button small"
                onClick={() => {
                  setFormError("");
                  setInitialPublished(false);
                  setEdit({ ...blankEntry, date: selectedMissingDate });
                }}
              >
                <PenLine size={14} /> Create entry for {selectedMissingDate}
              </button>
            )}
          </div>
        )}
      </section>

      {showThemesManager && canWrite && (
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
                    `/admin/themes/${t.month}`,
                    {
                      title: f.get("title"),
                      description: f.get("description"),
                    },
                    "PUT",
                    `Updated ${monthName(t.month)} theme.`,
                  );
                }}
              >
                <strong>
                  Month {t.month}: {monthName(t.month)}
                </strong>
                <label>
                  Theme title
                  <input name="title" defaultValue={t.title} required />
                </label>
                <label>
                  Description
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
            onChange={(e) => setEntrySearch(e.target.value)}
          />
        </label>
        <select
          aria-label="Filter by month"
          value={entryMonth}
          onChange={(e) => setEntryMonth(e.target.value)}
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
          onChange={(e) => setEntryVisibility(e.target.value)}
        >
          <option value="all">All visibility</option>
          <option value="published">Published</option>
          <option value="approved_unpublished">Approved (Unpublished)</option>
          <option value="draft">Drafts (All Unpublished)</option>
          <option value="sample">Samples</option>
        </select>
        <select
          aria-label="Filter by review status"
          value={entryReviewFilter}
          onChange={(e) => setEntryReviewFilter(e.target.value)}
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
                        ? { background: "rgba(180, 130, 40, 0.1)" }
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
                          onClick={() => openEntryPreview(d.id)}
                        >
                          <Eye size={14} /> Preview
                        </button>
                        {canWrite && (
                          <button
                            type="button"
                            className="text-link"
                            onClick={() => openEntryEditor(d.id)}
                          >
                            Edit
                          </button>
                        )}
                        {canWrite &&
                          !d.published &&
                          d.reviewStatus !== "approved" && (
                            <button
                              type="button"
                              className="text-link"
                              disabled={busy}
                              onClick={() =>
                                performStatusUpdate(
                                  d.id,
                                  { reviewStatus: "approved" },
                                  `Marked ${d.date} devotional Approved for publication.`,
                                )
                              }
                            >
                              Approve
                            </button>
                          )}
                        {canWrite && d.published ? (
                          <button
                            type="button"
                            className="text-link"
                            disabled={busy}
                            onClick={() => {
                              setFormError("");
                              setPublishConfirmTarget({
                                entry: d,
                                nextPublished: false,
                              });
                            }}
                          >
                            Unpublish
                          </button>
                        ) : canWrite && d.reviewStatus === "approved" ? (
                          <button
                            type="button"
                            className="text-link"
                            disabled={busy}
                            onClick={() => {
                              setFormError("");
                              setPublishConfirmTarget({
                                entry: d,
                                nextPublished: true,
                              });
                            }}
                          >
                            Publish
                          </button>
                        ) : null}
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

      <ConfirmDialog
        open={Boolean(publishConfirmTarget)}
        title={
          publishConfirmTarget?.nextPublished
            ? `Publish ${publishConfirmTarget.entry.date} devotional?`
            : `Unpublish ${publishConfirmTarget?.entry.date || ""} devotional?`
        }
        description={
          publishConfirmTarget?.nextPublished
            ? `Publishing "${publishConfirmTarget.entry.title}" makes it live for eligible 2027 Online Access readers.`
            : `Unpublishing "${publishConfirmTarget?.entry.title || ""}" removes it from reader access until republished.`
        }
        confirmLabel={
          publishConfirmTarget?.nextPublished
            ? "Confirm Publish"
            : "Confirm Unpublish"
        }
        busy={busy}
        error={formError}
        onCancel={() => {
          setFormError("");
          setPublishConfirmTarget(null);
        }}
        onConfirm={async () => {
          if (!publishConfirmTarget) return;
          const ok = await performStatusUpdate(
            publishConfirmTarget.entry.id,
            {
              published: publishConfirmTarget.nextPublished,
              reviewStatus: publishConfirmTarget.entry.reviewStatus,
            },
            publishConfirmTarget.nextPublished
              ? `Published ${publishConfirmTarget.entry.date} devotional.`
              : `Unpublished ${publishConfirmTarget.entry.date} devotional.`,
          );
          if (ok) setPublishConfirmTarget(null);
        }}
      />
    </div>
  );
}

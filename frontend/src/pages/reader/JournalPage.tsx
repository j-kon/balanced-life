import { useState } from "react";
import { Link } from "react-router-dom";
import { PenLine, Search, X } from "lucide-react";
import { useApp } from "../../context/AppContext";
import { useData } from "../../hooks/useData";
import { Empty, ErrorBox, Loading } from "../../components/Common";
import { api, dateLabel } from "../../api";
import type { JournalEntry } from "../../types";

export function JournalPage() {
  const { data, error, reload } = useData<JournalEntry[]>("/me/journal");
  const { toast } = useApp();
  const [title, setTitle] = useState("");
  const [lessonLearned, setLessonLearned] = useState("");
  const [body, setBody] = useState("");
  const [actionStep, setActionStep] = useState("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<JournalEntry | null>(null);
  const [busy, setBusy] = useState(false);

  const filtered = data?.filter((j) =>
    `${j.title} ${j.lessonLearned || ""} ${j.body} ${j.actionStep || ""} ${j.devotionalTitle || ""}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Just between you and God</span>
          <h1>My Growth Journal</h1>
          <p>
            A private space for the lessons, reflections, and action steps you
            are recording along the way.
          </p>
        </div>
        <PenLine size={40} strokeWidth={1} />
      </div>

      <form
        className="journal-form stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await api("/me/journal", {
              title,
              lessonLearned,
              body,
              actionStep,
            });
            setTitle("");
            setLessonLearned("");
            setBody("");
            setActionStep("");
            reload();
            toast("Your reflection is saved.");
          } catch (e) {
            toast((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-row-2">
          <label htmlFor="journal-title" className="journal-title-label">
            Reflection title (optional)
            <input
              id="journal-title"
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Gratitude for a new week…"
            />
          </label>
          <label htmlFor="journal-lesson" className="journal-title-label">
            Today's lesson (optional)
            <input
              id="journal-lesson"
              maxLength={2000}
              value={lessonLearned}
              onChange={(e) => setLessonLearned(e.target.value)}
              placeholder="Key takeaway or Biblical principle…"
            />
          </label>
        </div>
        <label htmlFor="journal-body">What's on your heart today?</label>
        <textarea
          id="journal-body"
          required
          maxLength={10000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Begin with a thought, a prayer, or a moment of gratitude…"
        />
        <label htmlFor="journal-action">
          Practical action to take (optional)
          <input
            id="journal-action"
            maxLength={2000}
            value={actionStep}
            onChange={(e) => setActionStep(e.target.value)}
            placeholder="One practical step I will take…"
          />
        </label>
        <button className="button" disabled={busy}>
          Save reflection <PenLine size={16} />
        </button>
        <small>Only your account can access these reflections.</small>
      </form>

      {data && data.length > 0 && (
        <div className="filters">
          <label className="search-box">
            <Search size={18} />
            <input
              aria-label="Search journal reflections"
              placeholder="Search your journal entries, lessons, or action steps…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>
      )}

      <ErrorBox message={error} />
      {filtered?.length ? (
        filtered.map((j) =>
          editing?.id === j.id ? (
            <form
              className="journal-entry stack"
              key={j.id}
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                try {
                  await api(
                    "/me/journal/" + j.id,
                    {
                      title: editing.title,
                      lessonLearned: editing.lessonLearned || "",
                      body: editing.body,
                      actionStep: editing.actionStep || "",
                    },
                    "PUT",
                  );
                  setEditing(null);
                  reload();
                  toast("Reflection updated.");
                } catch (err) {
                  toast((err as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <div className="section-title">
                <strong>Edit reflection</strong>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Cancel editing"
                  onClick={() => setEditing(null)}
                >
                  <X size={16} />
                </button>
              </div>
              <div className="form-row-2">
                <label>
                  Title (optional)
                  <input
                    value={editing.title}
                    maxLength={200}
                    onChange={(e) =>
                      setEditing({ ...editing, title: e.target.value })
                    }
                  />
                </label>
                <label>
                  Today's lesson (optional)
                  <input
                    value={editing.lessonLearned || ""}
                    maxLength={2000}
                    onChange={(e) =>
                      setEditing({ ...editing, lessonLearned: e.target.value })
                    }
                  />
                </label>
              </div>
              <label>
                Reflection
                <textarea
                  required
                  maxLength={10000}
                  value={editing.body}
                  onChange={(e) =>
                    setEditing({ ...editing, body: e.target.value })
                  }
                />
              </label>
              <label>
                Practical action step (optional)
                <input
                  value={editing.actionStep || ""}
                  maxLength={2000}
                  onChange={(e) =>
                    setEditing({ ...editing, actionStep: e.target.value })
                  }
                />
              </label>
              <div className="actions">
                <button className="button small" disabled={busy}>
                  Save changes
                </button>
                <button
                  type="button"
                  className="button outline small"
                  onClick={() => setEditing(null)}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <article className="journal-entry" key={j.id}>
              <span>{new Date(j.createdAt).toLocaleString("en-GB")}</span>
              {j.title && <h3>{j.title}</h3>}
              {j.devotionalTitle && (
                <Link to={"/read/" + j.devotionalId}>
                  {j.devotionalDate ? `${dateLabel(j.devotionalDate)} · ` : ""}
                  {j.devotionalTitle}
                </Link>
              )}
              {j.lessonLearned && (
                <p className="journal-meta-line">
                  <strong>Today's Lesson:</strong> {j.lessonLearned}
                </p>
              )}
              <p>{j.body}</p>
              {j.actionStep && (
                <p className="journal-meta-line">
                  <strong>Action Step:</strong> {j.actionStep}
                </p>
              )}
              <div className="actions">
                <button className="text-link" onClick={() => setEditing(j)}>
                  Edit reflection
                </button>
                <button
                  className="text-link"
                  onClick={async () => {
                    if (window.confirm("Delete this reflection permanently?")) {
                      try {
                        await api("/me/journal/" + j.id, {}, "DELETE");
                        reload();
                        toast("Reflection deleted.");
                      } catch (e) {
                        toast((e as Error).message);
                      }
                    }
                  }}
                >
                  Delete reflection
                </button>
              </div>
            </article>
          ),
        )
      ) : data && data.length > 0 ? (
        <Empty
          compact
          icon={<Search size={24} />}
          title="No reflections match your search"
          action={
            <button
              type="button"
              className="button outline small"
              onClick={() => setSearch("")}
            >
              Clear search
            </button>
          }
        >
          Try another keyword or clear your search to view all journal entries.
        </Empty>
      ) : data ? (
        <Empty
          compact
          icon={<PenLine size={24} />}
          title="No journal entries yet"
          action={
            <Link className="button outline small" to="/library">
              Read today&apos;s devotional
            </Link>
          }
        >
          Write your first reflection, lesson, or action step above — entries
          stay private to your account.
        </Empty>
      ) : (
        !error && <Loading />
      )}
    </>
  );
}

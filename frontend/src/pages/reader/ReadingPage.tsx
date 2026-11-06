import { useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import {
  ArrowRight,
  Bookmark,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  PenLine,
} from "lucide-react";
import { useApp } from "../../context/AppContext";
import { useData } from "../../hooks/useData";
import { Empty, ErrorBox, Loading } from "../../components/Common";
import { api, dateLabel } from "../../api";
import type { Entry } from "../../types";

export function SamplePage() {
  const { data, error } = useData<Entry[]>("/devotionals");
  const sample = data?.find((e) => e.sample);
  return sample ? (
    <Navigate to={"/read/" + sample.id} replace />
  ) : (
    <div className="container section narrow">
      <span className="eyebrow">A taste of the journey</span>
      <h1>Your first quiet moment.</h1>
      <ErrorBox message={error} />
      {!data && !error ? (
        <Loading />
      ) : (
        <Empty title="The author's sample is coming">
          A free reading will be available after the original manuscript is
          reviewed and marked as a sample.
        </Empty>
      )}
      <Link to="/pricing" className="button">
        Explore memberships <ArrowRight size={17} />
      </Link>
    </div>
  );
}

export function ReadingPage() {
  const { id } = useParams();
  const { user, toast } = useApp();
  const { data, error, reload } = useData<Entry>("/devotionals/" + id);
  const [journalTitle, setJournalTitle] = useState("");
  const [journal, setJournal] = useState("");
  const [busy, setBusy] = useState(false);

  async function act(path: string, body: unknown) {
    setBusy(true);
    try {
      await api(path, body);
      reload();
      toast("Your reading has been updated.");
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="reading-wrap">
      <div className="reading-top-bar">
        <Link className="back-link" to="/library">
          <ChevronLeft size={17} /> Back to the library
        </Link>
        {data && (data.previousId || data.nextId) && (
          <div className="reading-pager">
            {data.previousId && (
              <Link className="text-link" to={"/read/" + data.previousId}>
                <ChevronLeft size={15} /> Previous day
              </Link>
            )}
            {data.nextId && (
              <Link className="text-link" to={"/read/" + data.nextId}>
                Next day <ChevronRight size={15} />
              </Link>
            )}
          </div>
        )}
      </div>

      <ErrorBox message={error} />
      {error && (
        <div className="actions">
          <Link className="button" to={user ? "/subscription" : "/login"}>
            {user ? "View membership options" : "Sign in to continue"}
          </Link>
          <Link className="button outline" to="/pricing">
            See membership plans
          </Link>
        </div>
      )}
      {!data && !error ? (
        <Loading />
      ) : (
        data && (
          <>
            <article className="reading">
              <div className="reading-meta">
                <span>{dateLabel(data.date)}</span>
                <span>{data.theme}</span>
              </div>
              <h1>{data.title}</h1>
              <div className="reading-rule">
                <span>✧</span>
              </div>
              {[
                ["Bible text", data.bibleText],
                ["Memory verse", data.memoryVerse],
                ["Reflection", data.reflection],
                ["Think About This", data.thinkAbout],
                ["Prayer", data.prayer],
                ["Daily Bible Challenge", data.challenge],
              ].map(([label, text]) => (
                <section
                  className={label === "Memory verse" ? "verse" : ""}
                  key={label}
                >
                  <h2>{label}</h2>
                  <p>{text || "This section is awaiting author review."}</p>
                </section>
              ))}
            </article>
            {user ? (
              <>
                <div className="reading-actions">
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() =>
                      act("/me/progress/" + id, { completed: !data.completed })
                    }
                  >
                    <CheckCircle2 size={18} />
                    {data.completed ? "Completed · undo" : "Mark as completed"}
                  </button>
                  <button
                    className="button outline"
                    disabled={busy}
                    onClick={() =>
                      act("/me/bookmarks/" + id, { saved: !data.saved })
                    }
                  >
                    <Bookmark
                      size={18}
                      fill={data.saved ? "currentColor" : "none"}
                    />
                    {data.saved ? "Saved" : "Save reading"}
                  </button>
                </div>
                <form
                  className="journal-form"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setBusy(true);
                    try {
                      await api("/me/journal", {
                        devotionalId: Number(id),
                        title: journalTitle,
                        body: journal,
                      });
                      setJournalTitle("");
                      setJournal("");
                      toast("Reflection saved to your private journal.");
                    } catch (e) {
                      toast((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <PenLine />
                  <h2>What is on your heart?</h2>
                  <p>A private moment to reflect on today's reading.</p>
                  <label htmlFor="reflection-title" className="journal-title-label">
                    Reflection title (optional)
                    <input
                      id="reflection-title"
                      maxLength={200}
                      value={journalTitle}
                      onChange={(e) => setJournalTitle(e.target.value)}
                      placeholder="A key takeaway or prayer focus…"
                    />
                  </label>
                  <label className="sr-only" htmlFor="reflection">
                    Your reflection
                  </label>
                  <textarea
                    id="reflection"
                    required
                    minLength={1}
                    maxLength={10000}
                    value={journal}
                    onChange={(e) => setJournal(e.target.value)}
                    placeholder="Today, I am thinking about…"
                  />
                  <button className="button" disabled={busy}>
                    Save reflection <ArrowRight size={16} />
                  </button>
                </form>
              </>
            ) : (
              <div className="notice">
                <Link to="/register">
                  Create an account to save your progress and reflections.
                </Link>
              </div>
            )}
          </>
        )
      )}
    </div>
  );
}


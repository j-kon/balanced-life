import {
  createContext,
  useContext,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Bookmark,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Compass,
  CreditCard,
  Heart,
  LayoutDashboard,
  Leaf,
  LogOut,
  Menu,
  PenLine,
  Search,
  Settings,
  Shield,
  ShoppingBag,
  Sparkles,
  Sun,
  Users,
  X,
} from "lucide-react";
import { api, dateLabel, money, type Entry, type Plan, type User } from "./api";

type Config = {
  demo: boolean;
  referenceDate: string;
  cover: string | null;
  importedCount: number;
  themes: { month: number; title: string }[];
};
const Context = createContext<{
  user: User | null;
  refresh: () => Promise<void>;
  config: Config;
  toast: (s: string) => void;
}>({
  user: null,
  refresh: async () => {},
  config: {
    demo: true,
    referenceDate: "2027-01-01",
    cover: null,
    importedCount: 0,
    themes: [],
  },
  toast: () => {},
});
const useApp = () => useContext(Context);
function useData<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let live = true;
    setError("");
    setData(null);
    api<T>(path)
      .then((d) => {
        if (live) setData(d);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [path, version]);
  return { data, error, reload: () => setVersion((v) => v + 1) };
}
const Loading = () => (
  <div className="skeletons" aria-label="Loading" role="status">
    <div />
    <div />
    <div />
  </div>
);
const ErrorBox = ({ message }: { message: string }) =>
  message ? (
    <p className="error" role="alert">
      {message}
    </p>
  ) : null;
function Empty({
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
function Brand() {
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
        The Balanced Life<small>Devotional · Cossy Teens Consult</small>
      </span>
    </Link>
  );
}
function Cover() {
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
        A place for the
        <br />
        original cover.
      </span>
      <p>The approved book artwork has not been supplied yet.</p>
      <small>2027 devotional edition</small>
    </div>
  );
}
function Header() {
  const { user, refresh, toast } = useApp();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location]);
  return (
    <header className="header">
      <div className="container header-inner">
        <Brand />
        <nav
          className={open ? "public-nav open" : "public-nav"}
          aria-label="Main navigation"
        >
          <NavLink to="/about">Our story</NavLink>
          <NavLink to="/library">The devotional</NavLink>
          <NavLink to="/pricing">Membership</NavLink>
          <NavLink to="/bookstore">Bookstore</NavLink>
          {user?.role === "admin" && (
            <NavLink to="/admin">Author's desk</NavLink>
          )}
          <Link className="button small" to={user ? "/dashboard" : "/login"}>
            {user ? "My journey" : "Sign in"}
            <ArrowUpRight size={15} />
          </Link>
          {user && (
            <button
              className="icon-button"
              aria-label="Sign out of account"
              onClick={async () => {
                try {
                  await api("/auth/logout", {});
                  await refresh();
                  navigate("/");
                } catch (error) {
                  toast((error as Error).message);
                }
              }}
            >
              <LogOut size={18} />
              <span className="mobile-signout-label">Sign out</span>
            </button>
          )}
        </nav>
        <button
          className="icon-button menu-toggle"
          aria-label="Toggle navigation"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? <X /> : <Menu />}
        </button>
      </div>
    </header>
  );
}
function Footer() {
  return (
    <footer>
      <div className="container footer-inner">
        <Brand />
        <p>
          Godliness for the heart. Wisdom for the journey. Growth for the whole
          person.
        </p>
        <div>
          <Link to="/about">About us</Link>
          <Link to="/pricing">Membership</Link>
          <Link to="/bookstore">The printed book</Link>
        </div>
        <small>© 2027 Cossy Teens Consult. Local demonstration.</small>
      </div>
    </footer>
  );
}
function Home() {
  const { config } = useApp();
  return (
    <>
      <section className="hero container">
        <div className="hero-copy">
          <span className="eyebrow">
            <span className="gold-line" /> A daily journey to connect with Jesus
          </span>
          <h1>
            Grow in faith.
            <br />
            Find your balance.
          </h1>
          <p className="lead">
            Make room for what matters. A 365-day devotional journey for
            teenagers and young adults, one thoughtful day at a time.
          </p>
          <div className="actions">
            <Link className="button" to="/pricing">
              Begin your journey <ArrowRight size={18} />
            </Link>
            <Link className="text-link" to="/sample">
              Explore a free reading <ArrowUpRight size={16} />
            </Link>
          </div>
          <div className="hero-note">
            <BookOpen size={18} />
            <span>
              Scripture, reflection and prayer.
              <br />
              <strong>A little time each day. A lifelong foundation.</strong>
            </span>
          </div>
        </div>
        <div className="hero-art">
          <div className="orbit" />
          <div className="book-display">
            <Cover />
          </div>
          <div className="art-caption">
            <span className="tiny-star">✧</span>
            <span>
              A companion for your
              <br />
              <strong>everyday walk of faith.</strong>
            </span>
          </div>
        </div>
      </section>
      <div className="journey-strip">
        <div className="container">
          <span>
            <Sun size={20} /> 365 days of intentional growth
          </span>
          <span>
            <Heart size={20} /> Created for young hearts
          </span>
          <span>
            <BookOpen size={20} /> Rooted in God's Word
          </span>
        </div>
      </div>
      <section className="container section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Faith for everyday life</span>
            <h2>
              Small moments.
              <br />
              Meaningful growth.
            </h2>
          </div>
          <p>
            A daily rhythm that helps you slow down, connect with Scripture, and
            carry your faith into the world around you.
          </p>
        </div>
        <div className="benefits">
          <article>
            <span className="icon-tile">
              <BookOpen />
            </span>
            <h3>Read with purpose</h3>
            <p>
              Discover Scripture through a daily Bible text, memory verse, and
              thoughtful reflection.
            </p>
          </article>
          <article>
            <span className="icon-tile">
              <PenLine />
            </span>
            <h3>Make it personal</h3>
            <p>
              Pause at “Think About This,” then capture your own thoughts in
              your private growth journal.
            </p>
          </article>
          <article>
            <span className="icon-tile">
              <Leaf />
            </span>
            <h3>Live what you learn</h3>
            <p>
              Take your next step with prayer and a daily Bible challenge. Grow
              at your own pace.
            </p>
          </article>
        </div>
      </section>
      <section className="author-band">
        <div className="container author-content">
          <img
            className="author-profile"
            src="/brand/author-profile.png"
            alt="About the author: Adindu Ogechukwu Constance Nwisi, Certified Counselling Practitioner and Lead Consultant of Cossy Teens Consult"
          />
          <div>
            <span className="eyebrow">Meet the author</span>
            <h2>
              A heart for the
              <br />
              next generation.
            </h2>
            <p>
              The Balanced Life Devotional is written by{" "}
              <strong>Mrs. Adindu Ogechukwu Constance Nwisi</strong> for
              teenagers and young adults, and presented by Cossy Teens Consult.
            </p>
            <p>
              Discover a year of Scripture, reflection, practical exercises and
              prayer in the 2027 edition.
            </p>
            <Link className="text-link" to="/about">
              More about the devotional <ArrowRight size={17} />
            </Link>
          </div>
        </div>
      </section>
      <section className="container section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Your year of growth</span>
            <h2>
              One day at a time.
              <br />A whole year of possibility.
            </h2>
          </div>
          <p>
            Follow the featured daily reading or explore any published reading
            in the archive with a membership.
          </p>
        </div>
        {config.themes.length ? (
          <div className="theme-grid">
            {config.themes.map((t) => (
              <Link to={"/library?month=" + t.month} key={t.month}>
                <span>
                  {new Date(2027, t.month - 1).toLocaleString("en", {
                    month: "long",
                  })}
                </span>
                <h3>{t.title}</h3>
                <ArrowUpRight />
              </Link>
            ))}
          </div>
        ) : (
          <div className="notice">
            <Compass />
            <div>
              <strong>The 2027 journey is getting ready.</strong>
              <p>
                Monthly themes and readings will appear once the author's
                manuscript is imported and reviewed.
              </p>
            </div>
          </div>
        )}
      </section>
      <Pricing embedded />
      <section className="container final-invite">
        <Sparkles />
        <h2>
          Make a little space
          <br />
          for a more balanced life.
        </h2>
        <Link className="button" to="/register">
          Start your journey <ArrowRight size={18} />
        </Link>
      </section>
    </>
  );
}
function About() {
  return (
    <div className="container section narrow">
      <span className="eyebrow">Our story</span>
      <h1>
        A daily companion.
        <br />A deeper connection.
      </h1>
      <p className="lead">
        The Balanced Life Devotional is a 365-day Christian devotional for
        teenagers and young adults.
      </p>
      <hr />
      <h2>Meet the author</h2>
      <p>
        Mrs. Adindu Ogechukwu Constance Nwisi is the author of The Balanced Life
        Devotional, presented by Cossy Teens Consult.
      </p>
      <div className="notice">
        <PenLine />
        <p>
          Adindu Ogechukwu Constance Nwisi is a Certified Counselling
          Practitioner, writer, preacher, public speaker, and the Lead
          Consultant of Cossy Teens Consult. She has worked with teenagers and
          young adults for over a decade.
        </p>
      </div>
      <h2>A life invested in young people</h2>
      <p>
        Her journey with God began as a child. She began using devotionals as
        far back as Primary Four and gave her life to Christ in Primary Six. Her
        passion is rooted in a simple desire: to help young people know God for
        themselves, discover who they are, and grow holistically in every
        important area of life.
      </p>
      <h2>The heart of the book</h2>
      <p>
        The 2027 edition brings together daily Bible references, memory verses,
        reflections, practical exercises, prayers and Bible challenges. This
        digital companion creates a quiet space to read, reflect and record your
        growth.
      </p>
      <h2>Cossy Teens Consult</h2>
      <p>
        A devotional platform created for teenagers and young adults. Cossy
        Teens Consult is a professional counselling and mentorship hub committed
        to helping teenagers and young adults grow with balance. Its work helps
        young people build strong faith, sound character, healthy relationships,
        emotional wisdom, life skills, and the confidence to live purposefully.
      </p>
      <Link to="/sample" className="button">
        Explore the devotional <ArrowRight size={18} />
      </Link>
    </div>
  );
}
function Pricing({ embedded = false }: { embedded?: boolean }) {
  const { data, error } = useData<Plan[]>("/plans");
  return (
    <section
      className={embedded ? "pricing-section section" : "container section"}
    >
      <div className={embedded ? "container" : ""}>
        <div className="center-heading">
          <span className="eyebrow">Room to grow</span>
          <h2>
            {embedded
              ? "A rhythm that fits your life."
              : "Choose your journey."}
          </h2>
          <p>
            Every membership includes the complete published archive and your
            private growth journal.
          </p>
          <span className="pill">
            Proposed pricing · subject to author approval
          </span>
        </div>
        <ErrorBox message={error} />
        {!data && !error ? (
          <Loading />
        ) : (
          <div className="plans">
            {data?.map((p) => (
              <article
                className={"plan " + (p.months === 12 ? "featured" : "")}
                key={p.id}
              >
                {p.months === 12 && (
                  <div className="plan-ribbon">
                    A year of intentional growth
                  </div>
                )}
                <h3>{p.name}</h3>
                <div className="price">{money(p.amountKobo)}</div>
                <p>for {p.months === 1 ? "one month" : p.months + " months"}</p>
                <ul>
                  <li>
                    <Check size={16} /> All published devotionals
                  </li>
                  <li>
                    <Check size={16} /> Private growth journal
                  </li>
                  <li>
                    <Check size={16} /> Bookmarks & reading progress
                  </li>
                </ul>
                <Link
                  className={"button " + (p.months === 12 ? "" : "outline")}
                  to={"/checkout/" + p.id}
                >
                  Choose {p.name.toLowerCase()} <ArrowRight size={16} />
                </Link>
              </article>
            ))}
          </div>
        )}
        <p className="fine-print">
          Local demo checkout only. No real payment is collected. Automatic
          renewal is a preference; no automatic charges run.
        </p>
      </div>
    </section>
  );
}
function Bookstore() {
  const { toast } = useApp();
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(
        "/inquiries",
        Object.fromEntries(new FormData(e.currentTarget)),
      );
      setSent(true);
      toast("Your purchase inquiry has been recorded.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="container section bookstore">
      <div className="store-art">
        <Cover />
      </div>
      <div>
        <span className="eyebrow">Keep the journey close</span>
        <h1>
          The printed
          <br />
          companion.
        </h1>
        <p className="lead">The Balanced Life Devotional · 2027</p>
        <p>
          A 365-day devotional by Mrs. Adindu Ogechukwu Constance Nwisi.
          Hardcover edition.
        </p>
        <h2>{money(500000)}</h2>
        <p>
          Purchase inquiry only. Payment, stock availability, delivery and
          physical fulfillment are not live in this demonstration.
        </p>
        {sent ? (
          <div className="notice success">
            <CheckCircle2 />
            <p>
              Inquiry recorded locally. An administrator can now view it in the
              dashboard. No email has been sent.
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="stack">
            <label>
              Your name
              <input name="name" required maxLength={100} autoComplete="name" />
            </label>
            <label>
              Email address
              <input name="email" type="email" required autoComplete="email" />
            </label>
            <label>
              Message (optional)
              <textarea
                name="message"
                maxLength={2000}
                placeholder="Tell us how many copies you are interested in."
              />
            </label>
            <ErrorBox message={error} />
            <button className="button" disabled={busy}>
              <ShoppingBag size={17} />
              {busy ? "Recording…" : "Send purchase inquiry"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
function Auth({ register = false }: { register?: boolean }) {
  const { refresh, config } = useApp();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await login(Object.fromEntries(new FormData(e.currentTarget)));
  }
  async function login(body: unknown, demo = false) {
    setError("");
    setBusy(true);
    try {
      await api(
        demo ? "/auth/demo" : register ? "/auth/register" : "/auth/login",
        body,
      );
      await refresh();
      navigate("/dashboard");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-layout container">
      <aside>
        <span className="eyebrow">A moment to reconnect</span>
        <h1>
          Your next chapter
          <br />
          starts here.
        </h1>
        <p>Come as you are. Make room to read, reflect, and grow.</p>
        <div className="auth-decoration">
          <BookOpen size={84} strokeWidth={0.7} />
        </div>
      </aside>
      <section className="auth-card">
        <h2>{register ? "Begin your journey" : "Welcome back"}</h2>
        <p>
          {register
            ? "Create your account to keep your reflections and progress together."
            : "Take a breath. Your daily space is waiting."}
        </p>
        <form className="stack" onSubmit={submit}>
          {register && (
            <label>
              Your name
              <input
                name="name"
                required
                minLength={2}
                maxLength={100}
                autoComplete="name"
              />
            </label>
          )}
          <label>
            Email address
            <input name="email" required type="email" autoComplete="email" />
          </label>
          <label id="password-label">
            Password
            <input
              name="password"
              aria-labelledby="password-label"
              aria-describedby={register ? "password-help" : undefined}
              required
              type="password"
              minLength={register ? 10 : 1}
              maxLength={128}
              autoComplete={register ? "new-password" : "current-password"}
            />
          </label>
          {register && (
            <small id="password-help" className="field-help">
              Use at least 10 characters. No birth date or address needed.
            </small>
          )}
          <ErrorBox message={error} />
          <button className="button full" disabled={busy}>
            {busy ? "Please wait…" : register ? "Create account" : "Sign in"}
            <ArrowRight size={17} />
          </button>
        </form>
        <p className="auth-switch">
          {register ? "Already have an account?" : "New to the journey?"}{" "}
          <Link to={register ? "/login" : "/register"}>
            {register ? "Sign in" : "Create an account"}
          </Link>
        </p>
        {config.demo && (
          <div className="demo-logins">
            <strong>Explore the local demo</strong>
            <p>Switch roles to experience the platform.</p>
            <div>
              {["subscriber", "guest", "admin"].map((role) => (
                <button
                  className="button outline small"
                  disabled={busy}
                  onClick={() => login({ role }, true)}
                  key={role}
                >
                  {role[0].toUpperCase() + role.slice(1)}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
const readerLinks = [
  { to: "/dashboard", label: "My journey", icon: LayoutDashboard },
  { to: "/library", label: "Devotional library", icon: BookOpen },
  { to: "/saved", label: "Saved readings", icon: Bookmark },
  { to: "/journal", label: "My Growth Journal", icon: PenLine },
  { to: "/subscription", label: "Membership", icon: CreditCard },
];
function ReaderShell({ children }: { children: ReactNode }) {
  const { user, refresh, toast } = useApp();
  const navigate = useNavigate();
  return (
    <div className="reader-layout">
      <aside className="sidebar">
        <span className="eyebrow">Your quiet space</span>
        <nav aria-label="Reader navigation">
          {readerLinks.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to}>
              <Icon size={19} />
              {label}
            </NavLink>
          ))}
          {user?.role === "admin" && (
            <NavLink to="/admin">
              <Shield size={19} />
              Administration
            </NavLink>
          )}
        </nav>
        <div className="sidebar-bottom">
          <span className="avatar">{user?.name[0]}</span>
          <div>
            <strong>{user?.name}</strong>
            <small>
              {user?.role === "admin" ? "Administrator" : "Your daily journey"}
            </small>
          </div>
          <button
            aria-label="Sign out"
            className="icon-button"
            onClick={async () => {
              try {
                await api("/auth/logout", {});
                await refresh();
                navigate("/");
              } catch (e) {
                toast((e as Error).message);
              }
            }}
          >
            <LogOut size={18} />
          </button>
        </div>
      </aside>
      <div className="reader-main">{children}</div>
      <nav className="mobile-bottom" aria-label="Mobile reader navigation">
        {readerLinks.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} aria-label={label}>
            <Icon size={21} />
            <span>
              {label === "Devotional library"
                ? "Read"
                : label === "My Growth Journal"
                  ? "Journal"
                  : label === "Saved readings"
                    ? "Saved"
                    : label === "Membership"
                      ? "Plan"
                      : "Home"}
            </span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
function Protected({
  children,
  admin = false,
}: {
  children: ReactNode;
  admin?: boolean;
}) {
  const { user } = useApp();
  if (!user) return <Navigate to="/login" replace />;
  if (admin && user.role !== "admin")
    return (
      <div className="container section">
        <Empty title="Administrator access required">
          This page is available only to administrators.
        </Empty>
      </div>
    );
  return <ReaderShell>{children}</ReaderShell>;
}
function EntryCard({ entry }: { entry: Entry }) {
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
function Dashboard() {
  const { user, config } = useApp();
  const { data, error } = useData<any>("/me/dashboard");
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            {dateLabel(config.referenceDate)} · Preview reading date
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
      <ErrorBox message={error} />
      {!data && !error ? (
        <Loading />
      ) : (
        data && (
          <>
            <div className="dashboard-top">
              <section className="featured-reading">
                <span className="pill light">
                  <BookOpen size={14} /> Today's devotional
                </span>
                {data.featured ? (
                  <>
                    <h2>{data.featured.title}</h2>
                    <p>{data.featured.theme}</p>
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
                      The author's reading for {dateLabel(config.referenceDate)}{" "}
                      is awaiting import and review.
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
                    } as React.CSSProperties
                  }
                >
                  <div>
                    <strong>{data.completed}</strong>
                    <span>of 365 days</span>
                  </div>
                </div>
                <p>Every day is a new beginning.</p>
                <small>
                  {config.importedCount} published readings available
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
                    {data.history.map((e: Entry) => (
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
                  <h3>{data.subscription?.planName || "Free explorer"}</h3>
                  <p>
                    {data.subscription
                      ? "Access until " +
                        new Date(
                          data.subscription.expiresAt,
                        ).toLocaleDateString("en-GB")
                      : "Read free samples or choose a membership."}
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
function Library({ saved = false }: { saved?: boolean }) {
  const { config } = useApp();
  const { data, error } = useData<Entry[]>("/devotionals");
  const [search, setSearch] = useState("");
  const [month, setMonth] = useState(
    new URLSearchParams(useLocation().search).get("month") || "all",
  );
  const [theme, setTheme] = useState("all");
  const entries = data?.filter(
    (e) =>
      (!saved || e.saved) &&
      (month === "all" || Number(e.date.slice(5, 7)) === Number(month)) &&
      (theme === "all" || e.theme === theme) &&
      [e.title, e.theme].join(" ").toLowerCase().includes(search.toLowerCase()),
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
              : "Explore at your own pace. Find a moment that meets you where you are."}
          </p>
        </div>
      </div>
      <div className="filters">
        <label className="search-box">
          <Search size={18} />
          <input
            aria-label="Search devotionals"
            placeholder="Search readings or themes…"
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
              {new Date(2027, i).toLocaleString("en", { month: "long" })}
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
            config.importedCount
              ? "No readings found"
              : "The library is awaiting the manuscript"
          }
        >
          {config.importedCount
            ? "Try another search or save a reading to return to it here."
            : "The original 2027 manuscript has not been supplied. No devotional text has been invented. The author can add and publish entries in administration."}
        </Empty>
      )}
    </>
  );
}
function Sample() {
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
          supplied and reviewed. We are preserving the author's voice by leaving
          this space empty for now.
        </Empty>
      )}
      <Link to="/pricing" className="button">
        Explore memberships <ArrowRight size={17} />
      </Link>
    </div>
  );
}
function Reading() {
  const { id } = useParams();
  const { user, toast } = useApp();
  const { data, error, reload } = useData<Entry>("/devotionals/" + id);
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
      <Link className="back-link" to="/library">
        <ChevronLeft size={17} /> Back to the library
      </Link>
      <ErrorBox message={error} />
      {error && (
        <Link className="button" to={user ? "/pricing" : "/login"}>
          {user ? "Choose a membership" : "Sign in to continue"}
        </Link>
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
                        body: journal,
                      });
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
function Journal() {
  const { data, error, reload } = useData<any[]>("/me/journal");
  const { toast } = useApp();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Just between you and God</span>
          <h1>My Growth Journal</h1>
          <p>A private space for the things you are learning along the way.</p>
        </div>
        <PenLine size={40} strokeWidth={1} />
      </div>
      <form
        className="journal-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await api("/me/journal", { body });
            setBody("");
            reload();
            toast("Your reflection is saved.");
          } catch (e) {
            toast((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label htmlFor="journal-body">What's on your heart today?</label>
        <textarea
          id="journal-body"
          required
          maxLength={10000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Begin with a thought, a prayer, or a moment of gratitude…"
        />
        <button className="button" disabled={busy}>
          Save reflection <PenLine size={16} />
        </button>
        <small>Only your account can access these reflections.</small>
      </form>
      <ErrorBox message={error} />
      {data?.length ? (
        data.map((j) => (
          <article className="journal-entry" key={j.id}>
            <span>{new Date(j.createdAt).toLocaleString("en-GB")}</span>
            {j.devotionalTitle && (
              <Link to={"/read/" + j.devotionalId}>{j.devotionalTitle}</Link>
            )}
            <p>{j.body}</p>
            <button
              className="text-link"
              onClick={async () => {
                if (window.confirm("Delete this reflection permanently?"))
                  try {
                    await api("/me/journal/" + j.id, {}, "DELETE");
                    reload();
                    toast("Reflection deleted.");
                  } catch (e) {
                    toast((e as Error).message);
                  }
              }}
            >
              Delete reflection
            </button>
          </article>
        ))
      ) : data ? (
        <Empty title="Your story starts with a thought">
          Write your first reflection above. Return whenever you need a quiet
          moment.
        </Empty>
      ) : (
        !error && <Loading />
      )}
    </>
  );
}
function Checkout() {
  const { id } = useParams();
  const { data, error } = useData<Plan[]>("/plans");
  const { toast } = useApp();
  const navigate = useNavigate();
  const [renewal, setRenewal] = useState("manual");
  const [busy, setBusy] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [reference] = useState(() => crypto.randomUUID());
  const plan = data?.find((p) => p.id === Number(id));
  return (
    <div className="checkout">
      <span className="pill">Demo Payment</span>
      <h1>
        A little commitment.
        <br />A year of possibilities.
      </h1>
      <ErrorBox message={error || paymentError} />
      {plan ? (
        <div className="panel">
          <h2>{plan.name} membership</h2>
          <div className="checkout-total">
            <span>Total · simulated</span>
            <strong>{money(plan.amountKobo)}</strong>
          </div>
          <p>
            Access to all published readings for {plan.months} month
            {plan.months > 1 ? "s" : ""}, with your journal and bookmarks.
          </p>
          <label>
            Renewal preference
            <select
              value={renewal}
              onChange={(e) => setRenewal(e.target.value)}
            >
              <option value="manual">Manual — I'll renew myself</option>
              <option value="automatic">
                Automatic — preference only in this demo
              </option>
            </select>
          </label>
          <div className="notice">
            <Shield size={22} />
            <p>
              No money will be charged. This creates a local demo transaction
              and activates a demo membership.
            </p>
          </div>
          <button
            className="button full"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setPaymentError("");
              try {
                await api("/checkout/demo", {
                  planId: plan.id,
                  renewalMode: renewal,
                  reference,
                });
                toast("Demo payment successful. Your membership is active.");
                navigate("/subscription");
              } catch (e) {
                setPaymentError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy
              ? "Activating…"
              : "Simulate payment · " + money(plan.amountKobo)}
            <ArrowRight size={17} />
          </button>
        </div>
      ) : data ? (
        <Empty title="Plan unavailable">
          This plan may have been disabled. Choose another membership.
        </Empty>
      ) : (
        <Loading />
      )}
    </div>
  );
}
function Subscription() {
  const { data, error, reload } = useData<any>("/me/subscription");
  const { toast } = useApp();
  const [busy, setBusy] = useState(false);
  async function change(body: unknown) {
    setBusy(true);
    try {
      await api("/me/subscription", body, "PATCH");
      reload();
      toast("Renewal preference updated.");
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Keep growing</span>
          <h1>Your membership</h1>
          <p>A little space in your day. A lasting investment in your faith.</p>
        </div>
      </div>
      <ErrorBox message={error} />
      {data ? (
        <>
          <section className="panel membership-panel">
            <span className="pill">Demo membership</span>
            <h2>{data.subscription?.planName || "Free explorer"}</h2>
            {data.subscription ? (
              <>
                <p>
                  Access {data.active ? "active until" : "ended on"}{" "}
                  <strong>
                    {new Date(data.subscription.expiresAt).toLocaleString(
                      "en-GB",
                    )}
                  </strong>
                </p>
                <p>
                  Renewal:{" "}
                  {data.subscription.cancelAtPeriodEnd
                    ? "Cancelled — access remains until expiry"
                    : data.subscription.renewalMode}
                </p>
                <div className="actions">
                  <button
                    className="button outline"
                    disabled={busy}
                    onClick={() =>
                      change({
                        renewalMode:
                          data.subscription.renewalMode === "manual"
                            ? "automatic"
                            : "manual",
                        cancelAtPeriodEnd: false,
                      })
                    }
                  >
                    Use{" "}
                    {data.subscription.renewalMode === "manual"
                      ? "automatic"
                      : "manual"}{" "}
                    renewal
                  </button>
                  <button
                    className="text-link"
                    disabled={busy || data.subscription.cancelAtPeriodEnd}
                    onClick={() => change({ cancelAtPeriodEnd: true })}
                  >
                    Cancel future renewal
                  </button>
                  <Link
                    className="button"
                    to={"/checkout/" + data.subscription.planId}
                  >
                    Simulate manual renewal
                  </Link>
                </div>
                <p className="fine-print">
                  Automatic renewal is stored as a preference. This local
                  application never makes automatic charges.
                </p>
              </>
            ) : (
              <>
                <p>
                  Choose a membership to unlock the complete published archive.
                </p>
                <Link className="button" to="/pricing">
                  Explore memberships <ArrowRight size={17} />
                </Link>
              </>
            )}
          </section>
          <div className="section-title">
            <h2>Payment history</h2>
          </div>
          {data.payments.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Plan</th>
                    <th>Amount</th>
                    <th>Reference</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.payments.map((p: any) => (
                    <tr key={p.id}>
                      <td>
                        {new Date(p.createdAt).toLocaleDateString("en-GB")}
                      </td>
                      <td>{p.planName}</td>
                      <td>{money(p.amountKobo)}</td>
                      <td className="reference">{p.reference}</td>
                      <td>
                        <span className="pill">Demo Payment</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="No payments yet">
              Your simulated payments will be recorded here.
            </Empty>
          )}
        </>
      ) : (
        !error && <Loading />
      )}
    </>
  );
}
const blankEntry = {
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
};
function Admin() {
  const { data, error, reload } = useData<any>("/admin/overview");
  const { toast } = useApp();
  const [tab, setTab] = useState("Overview");
  const [entrySearch, setEntrySearch] = useState("");
  const [edit, setEdit] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  async function save(path: string, body: unknown, method = "PATCH") {
    setBusy(true);
    setFormError("");
    try {
      await api(path, body, method);
      reload();
      setEdit(null);
      toast("Changes saved.");
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Cossy Teens Consult</span>
          <h1>The author's desk</h1>
          <p>Care for your readers. Shape their daily journey.</p>
        </div>
        <Shield size={36} strokeWidth={1} />
      </div>
      <div
        className="admin-tabs"
        role="navigation"
        aria-label="Administration sections"
      >
        {[
          "Overview",
          "Devotionals",
          "Subscribers",
          "Plans",
          "Payments",
          "Inquiries",
          "Settings",
        ].map((t) => (
          <button
            className={tab === t ? "active" : ""}
            key={t}
            onClick={() => {
              setTab(t);
              setEdit(null);
              setFormError("");
            }}
          >
            {t}
          </button>
        ))}
      </div>
      <ErrorBox message={error || formError} />
      {!data && !error ? (
        <Loading />
      ) : (
        data && (
          <>
            {tab === "Overview" && (
              <>
                <div className="metric-grid">
                  {[
                    [Users, "Readers", data.metrics.readers],
                    [BookOpen, "Published readings", data.metrics.published],
                    [
                      CheckCircle2,
                      "Completed readings",
                      data.metrics.completions,
                    ],
                    [CreditCard, "Demo revenue", money(data.metrics.revenue)],
                  ].map(([Icon, label, value]: any) => (
                    <div className="metric" key={label}>
                      <Icon size={22} />
                      <strong>{value}</strong>
                      <span>{label}</span>
                    </div>
                  ))}
                </div>
                <div className="panel">
                  <h2>Ready for the next chapter</h2>
                  <p>
                    {data.metrics.published
                      ? "Manage the published archive, review inquiries, and follow reader engagement."
                      : "No author content is published yet. Add a devotional below, or run the manuscript import workflow after the PDF is supplied."}
                  </p>
                  <button
                    className="button"
                    onClick={() => {
                      setTab("Devotionals");
                      setEdit({ ...blankEntry });
                    }}
                  >
                    Create a devotional <PenLine size={16} />
                  </button>
                </div>
                <h2>Reading engagement</h2>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Reading</th>
                        <th>Completed by</th>
                        <th>Saved by</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.engagement
                        .filter((e: any) =>
                          data.devotionals.some(
                            (d: any) => d.id === e.id && d.published,
                          ),
                        )
                        .slice(0, 10)
                        .map((e: any) => (
                          <tr key={e.id}>
                            <td>{e.title}</td>
                            <td>{e.completions}</td>
                            <td>{e.bookmarks}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                <h2>Recent administrative activity</h2>
                {data.audit.map((a: any) => (
                  <p className="audit-line" key={a.id}>
                    {new Date(a.createdAt).toLocaleString("en-GB")} — {a.action}
                  </p>
                ))}
              </>
            )}
            {tab === "Devotionals" &&
              (edit ? (
                <form
                  className="panel stack"
                  onSubmit={(e) => {
                    e.preventDefault();
                    save(
                      "/admin/devotionals" + (edit.id ? "/" + edit.id : ""),
                      edit,
                      edit.id ? "PUT" : "POST",
                    );
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
                    Use the author's approved text. Imported entries should be
                    checked against the original manuscript before publishing.
                  </p>
                  {edit.sourcePages && (
                    <p className="muted">
                      Source manuscript page {edit.sourcePages}
                    </p>
                  )}
                  {edit.date === "2027-02-13" && (
                    <div className="notice">
                      <p>
                        Review needed: a repeated section label was found in
                        this reading. Check the field boundaries against the
                        manuscript before publishing.
                      </p>
                    </div>
                  )}
                  {[
                    ["date", "Date"],
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
                      {["date", "title", "theme"].includes(key) ? (
                        <input
                          type={key === "date" ? "date" : "text"}
                          required
                          min={key === "date" ? "2027-01-01" : undefined}
                          max={key === "date" ? "2027-12-31" : undefined}
                          value={edit[key]}
                          onChange={(e) =>
                            setEdit({ ...edit, [key]: e.target.value })
                          }
                        />
                      ) : (
                        <textarea
                          required
                          value={edit[key]}
                          onChange={(e) =>
                            setEdit({ ...edit, [key]: e.target.value })
                          }
                          rows={key === "reflection" ? 8 : 3}
                        />
                      )}
                    </label>
                  ))}
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={edit.sample}
                      onChange={(e) =>
                        setEdit({ ...edit, sample: e.target.checked })
                      }
                    />
                    Free sample — visible without a membership
                  </label>
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={edit.published}
                      onChange={(e) =>
                        setEdit({ ...edit, published: e.target.checked })
                      }
                    />
                    Published — visible in the reader library
                  </label>
                  <ErrorBox message={formError} />
                  <button className="button" disabled={busy}>
                    {busy ? "Saving…" : "Save devotional"}
                  </button>
                </form>
              ) : (
                <>
                  <div className="section-title">
                    <h2>Devotional collection</h2>
                    <button
                      className="button small"
                      onClick={() => setEdit({ ...blankEntry })}
                    >
                      New entry <PenLine size={15} />
                    </button>
                  </div>
                  <label className="search-box">
                    <Search size={18} />
                    <input
                      aria-label="Find an admin devotional"
                      placeholder="Find a title or date, for example 2027-02-13…"
                      value={entrySearch}
                      onChange={(e) => setEntrySearch(e.target.value)}
                    />
                  </label>
                  {data.devotionals.length ? (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Title</th>
                            <th>Visibility</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.devotionals
                            .filter((d: any) =>
                              (d.date + " " + d.title)
                                .toLowerCase()
                                .includes(entrySearch.toLowerCase()),
                            )
                            .map((d: any) => (
                              <tr key={d.id}>
                                <td>{d.date}</td>
                                <td>{d.title}</td>
                                <td>
                                  {d.published ? "Published" : "Draft"}
                                  {d.sample ? " · Sample" : ""}
                                </td>
                                <td>
                                  <button
                                    className="text-link"
                                    onClick={() => setEdit(d)}
                                  >
                                    Edit
                                  </button>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <Empty title="The collection is ready for your words">
                      Add an approved entry, or import the supplied manuscript
                      as drafts.
                    </Empty>
                  )}
                </>
              ))}
            {tab === "Subscribers" && (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Plan</th>
                      <th>Access until</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.users.map((u: any) => (
                      <tr key={u.id}>
                        <td>{u.name}</td>
                        <td>{u.email}</td>
                        <td>{u.role}</td>
                        <td>{u.planName || "Free"}</td>
                        <td>
                          {u.expiresAt
                            ? new Date(u.expiresAt).toLocaleDateString("en-GB")
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {tab === "Plans" && (
              <>
                <p>
                  These prices are proposals. Enter amounts in Nigerian naira.
                  Readers will see updated prices at checkout.
                </p>
                <div className="admin-plans">
                  {data.plans.map((p: Plan) => (
                    <form
                      className="panel stack"
                      key={p.id}
                      onSubmit={(e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        save("/admin/plans/" + p.id, {
                          name: f.get("name"),
                          amountKobo: Math.round(Number(f.get("amount")) * 100),
                          active: f.get("active") === "on",
                        });
                      }}
                    >
                      <label>
                        Plan name
                        <input name="name" defaultValue={p.name} required />
                      </label>
                      <label>
                        Price (NGN)
                        <input
                          name="amount"
                          type="number"
                          min="1"
                          step=".01"
                          required
                          defaultValue={p.amountKobo / 100}
                        />
                      </label>
                      <p>
                        {p.months} month{p.months > 1 ? "s" : ""} of access
                      </p>
                      <label className="check-label">
                        <input
                          type="checkbox"
                          name="active"
                          defaultChecked={p.active}
                        />
                        Available for checkout
                      </label>
                      <button className="button outline" disabled={busy}>
                        Save plan
                      </button>
                    </form>
                  ))}
                </div>
              </>
            )}
            {tab === "Payments" && (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Reader</th>
                      <th>Plan</th>
                      <th>Amount</th>
                      <th>Reference</th>
                      <th>Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.payments.map((p: any) => (
                      <tr key={p.id}>
                        <td>{p.email}</td>
                        <td>{p.planName}</td>
                        <td>{money(p.amountKobo)}</td>
                        <td className="reference">{p.reference}</td>
                        <td>Demo Payment</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!data.payments.length && (
                  <p className="muted">No demo payments recorded yet.</p>
                )}
              </div>
            )}
            {tab === "Inquiries" && (
              <>
                {data.inquiries.length ? (
                  data.inquiries.map((i: any) => (
                    <div className="panel" key={i.id}>
                      <div className="section-title">
                        <h3>{i.name}</h3>
                        <span className="pill">{i.status}</span>
                      </div>
                      <p>{i.email}</p>
                      <p className="preserve-lines">
                        {i.message || "Interested in the hardcover edition."}
                      </p>
                      <button
                        className="button outline small"
                        disabled={busy}
                        onClick={() =>
                          save("/admin/inquiries/" + i.id, {
                            status: i.status === "new" ? "reviewed" : "new",
                          })
                        }
                      >
                        Mark {i.status === "new" ? "reviewed" : "new"}
                      </button>
                    </div>
                  ))
                ) : (
                  <Empty title="No inquiries yet">
                    Hardcover purchase inquiries will appear here. No
                    fulfillment or email is automated.
                  </Empty>
                )}
              </>
            )}
            {tab === "Settings" && (
              <form
                className="panel stack"
                onSubmit={async (e) => {
                  e.preventDefault();
                  await save("/admin/settings", {
                    referenceDate: new FormData(e.currentTarget).get("date"),
                  });
                  window.location.reload();
                }}
              >
                <h2>Demo preview date</h2>
                <p>
                  The featured devotional follows this 2027 date. Membership
                  expiry always follows the actual clock.
                </p>
                <label>
                  Reference date
                  <input
                    name="date"
                    type="date"
                    defaultValue={data.referenceDate}
                    min="2027-01-01"
                    max="2027-12-31"
                    required
                  />
                </label>
                <button className="button" disabled={busy}>
                  Save preview date <Settings size={16} />
                </button>
              </form>
            )}
          </>
        )
      )}
    </>
  );
}
function RouteScroll() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}
export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [startupError, setStartupError] = useState("");
  const [config, setConfig] = useState<Config>({
    demo: true,
    referenceDate: "2027-01-01",
    cover: null,
    importedCount: 0,
    themes: [],
  });
  const [message, setMessage] = useState("");
  const refresh = async () => {
    const u = await api<{ user: User | null }>("/auth/me");
    setUser(u.user);
  };
  useEffect(() => {
    Promise.all([refresh(), api<Config>("/config").then(setConfig)])
      .catch((e) => setStartupError(e.message))
      .finally(() => setReady(true));
  }, []);
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(""), 5000);
      return () => clearTimeout(timer);
    }
  }, [message]);
  return (
    <Context.Provider value={{ user, refresh, config, toast: setMessage }}>
      <RouteScroll />
      {config.demo && (
        <div className="preview-bar">
          <span className="preview-dot" />
          Demo preview mode <span className="preview-divider">|</span>{" "}
          {dateLabel(config.referenceDate)}
          <span className="preview-extra"> · No real payments</span>
        </div>
      )}
      <Header />
      <main id="main">
        {startupError ? (
          <div className="container section">
            <ErrorBox
              message={
                "Cannot connect to the local API. Run npm run dev and reload. " +
                startupError
              }
            />
            <button className="button" onClick={() => window.location.reload()}>
              Try again
            </button>
          </div>
        ) : !ready ? (
          <div className="container section">
            <Loading />
          </div>
        ) : (
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/about" element={<About />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/bookstore" element={<Bookstore />} />
            <Route path="/login" element={<Auth />} />
            <Route path="/register" element={<Auth register />} />
            <Route path="/sample" element={<Sample />} />
            <Route
              path="/library"
              element={
                user ? (
                  <ReaderShell>
                    <Library />
                  </ReaderShell>
                ) : (
                  <div className="container section">
                    <Library />
                  </div>
                )
              }
            />
            <Route
              path="/read/:id"
              element={
                user ? (
                  <ReaderShell>
                    <Reading />
                  </ReaderShell>
                ) : (
                  <div className="container section">
                    <Reading />
                  </div>
                )
              }
            />
            <Route
              path="/dashboard"
              element={
                <Protected>
                  <Dashboard />
                </Protected>
              }
            />
            <Route
              path="/saved"
              element={
                <Protected>
                  <Library saved />
                </Protected>
              }
            />
            <Route
              path="/journal"
              element={
                <Protected>
                  <Journal />
                </Protected>
              }
            />
            <Route
              path="/subscription"
              element={
                <Protected>
                  <Subscription />
                </Protected>
              }
            />
            <Route
              path="/checkout/:id"
              element={
                <Protected>
                  <Checkout />
                </Protected>
              }
            />
            <Route
              path="/admin"
              element={
                <Protected admin>
                  <Admin />
                </Protected>
              }
            />
            <Route
              path="*"
              element={
                <div className="container section">
                  <h1>This page has turned.</h1>
                  <Link className="button" to="/">
                    Back to home <ChevronRight size={16} />
                  </Link>
                </div>
              }
            />
          </Routes>
        )}
      </main>
      <Footer />
      {message && (
        <div className="toast" role="status">
          <CheckCircle2 size={19} />
          {message}
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setMessage("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </Context.Provider>
  );
}

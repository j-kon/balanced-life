import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  BookOpen,
  Bookmark,
  Calendar,
  CheckCircle2,
  Download,
  Heart,
  Lock,
  Monitor,
  Moon,
  PenLine,
  Share2,
  Smartphone,
  Sparkles,
  Sun,
  TrendingUp,
  X,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { useTheme, type ThemePreference } from "../context/ThemeContext";
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

export function EntryCard({
  entry,
  locked = false,
}: {
  entry: Entry;
  locked?: boolean;
}) {
  return (
    <Link
      className={locked ? "entry-card locked" : "entry-card"}
      to={"/read/" + entry.id}
    >
      <div className="entry-top">
        <span>{dateLabel(entry.date)}</span>
        {locked ? (
          <Lock size={17} aria-label="Online access required" />
        ) : entry.completed ? (
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
          {locked
            ? "Locked · Online access required"
            : entry.sample
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

export function ThemeSelector({
  variant = "full",
}: {
  variant?: "full" | "compact";
}) {
  const { preference, systemTheme, setPreference } = useTheme();
  const options: Array<{
    value: ThemePreference;
    label: string;
    detail: string;
    icon: typeof Sun;
  }> = [
    {
      value: "system",
      label: "System",
      detail: `System (Currently ${systemTheme})`,
      icon: Monitor,
    },
    { value: "light", label: "Light", detail: "Light", icon: Sun },
    { value: "dark", label: "Dark", detail: "Dark", icon: Moon },
  ];

  return (
    <div
      className={
        variant === "compact" ? "theme-selector compact" : "theme-selector"
      }
      role="group"
      aria-label="Color theme preference"
    >
      {options.map(({ value, label, detail, icon: Icon }) => {
        const active = preference === value;
        return (
          <button
            key={value}
            type="button"
            className={active ? "theme-option active" : "theme-option"}
            aria-pressed={active}
            onClick={() => setPreference(value)}
          >
            <Icon size={variant === "compact" ? 15 : 17} />
            <span>{variant === "compact" ? label : detail}</span>
          </button>
        );
      })}
    </div>
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
          free January 1 sample or unlock full online access with a 2027 Digital
          Edition purchase or membership.
        </p>
      </div>
    </div>
  );
}

export const DAILY_GROWTH_STEPS = [
  {
    step: 1,
    title: "Connect with Jesus",
    description:
      "Begin your day by anchoring your heart in God's presence through Scripture and prayer.",
    icon: Heart,
  },
  {
    step: 2,
    title: "Learn",
    description:
      "Read today's Bible text, memory verse, and practical life teaching for your stage of growth.",
    icon: BookOpen,
  },
  {
    step: 3,
    title: "Reflect",
    description:
      "Pause with “Think About This” to examine your thoughts, choices, and spiritual walk honestly.",
    icon: PenLine,
  },
  {
    step: 4,
    title: "Apply",
    description:
      "Write down one practical action step you will live out today at home, school, campus, or work.",
    icon: Sparkles,
  },
  {
    step: 5,
    title: "Track Your Growth",
    description:
      "Mark your daily reading complete and build a steady 365-day record of spiritual and personal growth.",
    icon: TrendingUp,
  },
];

export function FiveStepFramework({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={compact ? "five-step-grid compact" : "five-step-grid"}
      aria-label="5-step daily growth experience"
    >
      {DAILY_GROWTH_STEPS.map(({ step, title, description, icon: Icon }) => (
        <article className="five-step-card" key={step}>
          <div className="five-step-top">
            <span className="step-badge">Step {step}</span>
            <Icon size={18} />
          </div>
          <h3>{title}</h3>
          <p>{description}</p>
        </article>
      ))}
    </div>
  );
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PwaInstallBanner() {
  const { user } = useApp();
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem("bld_pwa_dismissed") === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const standalone =
      window.matchMedia?.("(display-mode: standalone)")?.matches ||
      (window.navigator as { standalone?: boolean }).standalone === true;
    setIsStandalone(Boolean(standalone));

    const ua = window.navigator.userAgent || "";
    const iosDevice = /iPad|iPhone|iPod/.test(ua);
    setIsIos(iosDevice);

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onAppInstalled = () => {
      setIsStandalone(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  // Wait until newly registered reader completes or dismisses initial onboarding before showing PWA install prompts
  if ((user && !user.onboardingCompletedAt) || isStandalone || dismissed) {
    return null;
  }

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem("bld_pwa_dismissed", "1");
    } catch {
      // ignore storage errors
    }
  };

  return (
    <div className="pwa-banner" role="region" aria-label="Install mobile app">
      <div className="pwa-banner-main">
        <Smartphone size={20} className="pwa-icon" />
        <div>
          <strong>Install The Balanced Life Devotional on your phone</strong>
          <p>
            Add this devotional to your home screen for one-tap daily reading,
            reflection, and growth tracking.
          </p>
        </div>
        <div className="pwa-banner-actions">
          {deferredPrompt ? (
            <button
              type="button"
              className="button small"
              onClick={async () => {
                await deferredPrompt.prompt();
                const choice = await deferredPrompt.userChoice;
                if (choice.outcome === "accepted") {
                  setDeferredPrompt(null);
                }
              }}
            >
              <Download size={15} /> Install app
            </button>
          ) : (
            <button
              type="button"
              className="button outline small"
              onClick={() => setShowGuide(!showGuide)}
            >
              <Share2 size={15} />{" "}
              {showGuide
                ? "Hide guide"
                : isIos
                  ? "iPhone install steps"
                  : "How to install"}
            </button>
          )}
          <button
            type="button"
            className="icon-button"
            aria-label="Dismiss install banner"
            onClick={dismiss}
          >
            <X size={16} />
          </button>
        </div>
      </div>
      {showGuide && (
        <div className="pwa-guide">
          <div>
            <strong>iPhone & iPad (Safari):</strong>
            <ol>
              <li>
                Tap the <strong>Share</strong> button at the bottom of Safari.
              </li>
              <li>
                Scroll down and tap <strong>Add to Home Screen</strong>.
              </li>
              <li>
                Tap <strong>Add</strong> in the top corner to launch the
                devotional as a full-screen app.
              </li>
            </ol>
          </div>
          <div>
            <strong>Android (Chrome):</strong>
            <ol>
              <li>
                Tap the browser menu (<strong>⋮</strong>) in the top-right
                corner.
              </li>
              <li>
                Select <strong>Install app</strong> or{" "}
                <strong>Add to Home screen</strong>.
              </li>
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}

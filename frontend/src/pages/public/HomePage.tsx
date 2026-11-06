import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Compass,
  Heart,
  Leaf,
  PenLine,
  Sparkles,
  Sun,
} from "lucide-react";
import { useApp } from "../../context/AppContext";
import { Cover, UpcomingYearNotice } from "../../components/Common";
import { monthName } from "../../api";
import { PricingSection } from "./CommercePages";

export function HomePage() {
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

      <div className="container">
        <UpcomingYearNotice />
      </div>

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
            src={config.authorPortrait || "/brand/author-profile.png"}
            alt={`About the author: ${config.settings.authorName}, ${config.settings.authorTitle}`}
          />
          <div>
            <span className="eyebrow">Meet the author</span>
            <h2>
              A heart for the
              <br />
              next generation.
            </h2>
            <p>
              {config.settings.siteTitle} is written by{" "}
              <strong>{config.settings.authorName}</strong> for teenagers and
              young adults, and presented by {config.settings.organizationName}.
            </p>
            <p>
              Discover a year of Scripture, reflection, practical exercises and
              prayer in the 2027 edition.
            </p>
            <div className="actions">
              <Link className="text-link" to="/about-author">
                Read the author's story <ArrowRight size={17} />
              </Link>
              <Link className="text-link" to="/about">
                About the devotional <ArrowUpRight size={16} />
              </Link>
            </div>
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
          <div>
            <p>
              Follow the daily reading or explore any published reading in the
              archive with a membership.
            </p>
            <Link className="text-link" to="/themes">
              View all 12 monthly themes <ArrowRight size={16} />
            </Link>
          </div>
        </div>
        {config.themes.length ? (
          <div className="theme-grid">
            {config.themes.map((t) => (
              <Link to={"/library?month=" + t.month} key={t.month}>
                <span>{monthName(t.month)} 2027</span>
                <h3>{t.title}</h3>
                {t.description && (
                  <p className="theme-card-desc">{t.description}</p>
                )}
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

      <PricingSection embedded />

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


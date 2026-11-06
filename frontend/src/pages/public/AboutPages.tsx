import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Calendar,
  Compass,
  Heart,
  PenLine,
} from "lucide-react";
import { useApp } from "../../context/AppContext";
import { Cover } from "../../components/Common";
import { monthName } from "../../api";

export function AboutDevotionalPage() {
  const { config } = useApp();
  return (
    <div className="container section narrow">
      <span className="eyebrow">About the devotional</span>
      <h1>
        A daily companion.
        <br />A deeper connection.
      </h1>
      <p className="lead">
        {config.settings.siteTitle} is a 365-day Christian devotional created
        specifically for teenagers and young adults navigating faith, identity,
        purpose, and everyday life.
      </p>
      <hr />
      <h2>The heart of the 2027 edition</h2>
      <p>
        Covering January 1 through December 31, 2027, each daily reading brings
        together six intentional elements designed to nurture spiritual depth
        and practical wisdom:
      </p>
      <div className="feature-list-grid">
        <div className="panel">
          <h3>1. Bible Text & Memory Verse</h3>
          <p>
            Every day is anchored in Scripture, with a focused Bible passage and
            a key verse to hide in your heart throughout the day.
          </p>
        </div>
        <div className="panel">
          <h3>2. Reflection & Think About This</h3>
          <p>
            Practical, relatable reflections written in the author's voice,
            paired with honest questions that prompt self-examination and
            personal growth.
          </p>
        </div>
        <div className="panel">
          <h3>3. Prayer & Daily Bible Challenge</h3>
          <p>
            A guided prayer to help you respond to God, alongside a daily Bible
            reading plan to build steady Scripture literacy across the year.
          </p>
        </div>
      </div>

      <h2>{config.settings.organizationName}</h2>
      <p>{config.settings.organizationDescription}</p>

      <div className="notice">
        <BookOpen />
        <div>
          <strong>Digital & Hardcover Companions</strong>
          <p>
            Read online from any phone, tablet, or computer—with your own
            private Growth Journal—or request the printed hardcover edition for
            personal study, youth fellowships, and schools.
          </p>
        </div>
      </div>

      <div className="actions">
        <Link to="/sample" className="button">
          Read the free sample <ArrowRight size={18} />
        </Link>
        <Link to="/about-author" className="button outline">
          Meet the author <ArrowUpRight size={17} />
        </Link>
        <Link to="/themes" className="text-link">
          Explore the 12 monthly themes <ArrowRight size={16} />
        </Link>
      </div>
    </div>
  );
}

export function AboutAuthorPage() {
  const { config } = useApp();
  return (
    <div className="container section">
      <div className="bookstore author-page-grid">
        <div className="store-art">
          <img
            className="author-profile"
            src={config.authorPortrait || "/brand/author-profile.png"}
            alt={`Portrait of ${config.settings.authorName}`}
          />
        </div>
        <div>
          <span className="eyebrow">About the author</span>
          <h1>{config.settings.authorName}</h1>
          <p className="lead">{config.settings.authorTitle}</p>
          <p>{config.settings.authorBio}</p>
          <div className="notice">
            <PenLine />
            <div>
              <strong>A life invested in young people</strong>
              <p>
                Through {config.settings.organizationName}, she mentors,
                counsels, and equips teenagers and young adults to build strong
                spiritual foundations, emotional maturity, healthy
                relationships, and purposeful lives.
              </p>
            </div>
          </div>
          <h2>Mission & Ministry</h2>
          <p>
            Her passion is rooted in a simple desire: to help young people know
            God for themselves, discover who they are in Christ, and grow
            holistically in every important area of life—spiritual, emotional,
            academic, relational, and vocational.
          </p>
          <div className="actions">
            <Link to="/sample" className="button">
              Read a devotional <ArrowRight size={17} />
            </Link>
            <Link to="/contact" className="button outline">
              Connect with {config.settings.organizationName}
            </Link>
          </div>
        </div>
      </div>

      <section className="section">
        <div className="bookstore">
          <div>
            <span className="eyebrow">The 2027 Publication</span>
            <h2>The Balanced Life Devotional</h2>
            <p>
              Written for teenagers, campus students, young professionals, youth
              ministries, and families seeking a daily rhythm of Scripture and
              wholesome counsel.
            </p>
            <div className="actions">
              <Link to="/pricing" className="button">
                View digital memberships <ArrowRight size={17} />
              </Link>
              <Link to="/bookstore" className="text-link">
                Inquire about hardcover copies <ArrowUpRight size={16} />
              </Link>
            </div>
          </div>
          <div className="store-art">
            <Cover />
          </div>
        </div>
      </section>
    </div>
  );
}

export function ThemesPage() {
  const { config } = useApp();
  return (
    <div className="container section">
      <div className="page-heading">
        <div>
          <span className="eyebrow">2027 Curriculum & Monthly Focus</span>
          <h1>Twelve months of holistic growth.</h1>
          <p>
            Each month of the 2027 devotional is guided by an intentional theme
            addressing faith, character, relationships, emotional resilience,
            excellence, and purpose.
          </p>
        </div>
        <Calendar className="heading-sun" size={48} strokeWidth={1} />
      </div>

      {config.themes.length ? (
        <div className="themes-overview-grid">
          {config.themes.map((t) => (
            <article className="panel theme-detail-card" key={t.month}>
              <div className="entry-top">
                <span className="pill">
                  Month {t.month} · {monthName(t.month)} 2027
                </span>
                <Heart size={16} />
              </div>
              <h3>{t.title}</h3>
              <p>
                {t.description ||
                  "Daily Scripture readings, reflections, prayers, and Bible challenges tailored for this month's theme."}
              </p>
              <Link
                className="text-link"
                to={`/library?month=${t.month}`}
              >
                Browse {monthName(t.month)} readings <ArrowRight size={16} />
              </Link>
            </article>
          ))}
        </div>
      ) : (
        <div className="notice">
          <Compass />
          <p>Monthly themes are being prepared for the 2027 edition.</p>
        </div>
      )}
    </div>
  );
}


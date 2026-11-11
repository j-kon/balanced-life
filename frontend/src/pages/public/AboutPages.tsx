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
import { Cover, FiveStepFramework } from "../../components/Common";
import { money, monthName } from "../../api";

export function AboutDevotionalPage() {
  const { config } = useApp();
  const { settings } = config;
  return (
    <div className="container section narrow">
      <span className="eyebrow">
        About the Devotional · {settings.targetAudience}
      </span>
      <h1>
        Growing up is a journey.
        <br />
        Make every day count.
      </h1>
      <p className="lead">
        <strong>{settings.siteTitle}</strong> is a 365-day Christian devotional
        created specifically for teenagers and young adults (Ages 13–25)
        navigating faith, identity, emotional maturity, relationships,
        academics, and purposeful living.
      </p>
      <p>
        Published by <strong>{settings.organizationName}</strong> (
        <em>{settings.brandStatement}</em>), it offers age-relevant, practical,
        and spiritually grounded daily readings that meet young people where
        they are.
      </p>
      <hr />
      <h2>Six Intentional Elements in Every Daily Reading</h2>
      <p>
        Covering January 1 through December 31, 2027, each daily reading brings
        together six structured sections designed to nurture spiritual depth and
        practical life wisdom:
      </p>
      <div className="feature-list-grid">
        <div className="panel">
          <h3>1. Bible Text &amp; Memory Verse</h3>
          <p>
            Every day is anchored in Scripture, with a focused Bible passage and
            a key verse to meditate on throughout the day.
          </p>
        </div>
        <div className="panel">
          <h3>2. Reflection &amp; Think About This</h3>
          <p>
            Relatable teachings written in the author's voice, paired with
            honest reflection questions that prompt self-discovery and
            accountability.
          </p>
        </div>
        <div className="panel">
          <h3>3. Prayer &amp; Daily Bible Challenge</h3>
          <p>
            A guided prayer to help you respond to God, alongside a daily Bible
            reading plan to build steady Scripture literacy across the year.
          </p>
        </div>
        <div className="panel">
          <h3>4. 5-Step Daily Growth &amp; Accountability</h3>
          <p>
            Record today's lesson, your personal reflection, and one practical
            action step in your private Growth Journal while tracking your
            365-day completion progress.
          </p>
        </div>
      </div>

      <h2>The 5-Step Daily Growth Experience</h2>
      <FiveStepFramework compact />

      <h2>{settings.organizationName}</h2>
      <p>{settings.organizationDescription}</p>

      <div className="notice about-access-callout">
        <BookOpen aria-hidden="true" />
        <div className="about-callout-body">
          <strong className="notice-heading">
            Two Clear Ways to Experience The Balanced Life Devotional
          </strong>
          <ul className="about-offer-list">
            <li className="about-offer-item">
              <span className="about-offer-label">
                Printed Book ({money(settings.hardcoverPriceKobo)})
              </span>
              <span className="about-offer-desc">
                {money(settings.hardcoverPriceKobo)} per copy, with delivery
                charged separately.
              </span>
            </li>
            <li className="about-offer-item">
              <span className="about-offer-label">
                2027 Online Access ({money(settings.digitalEditionPriceKobo)})
              </span>
              <span className="about-offer-desc">
                {money(settings.digitalEditionPriceKobo)} for{" "}
                {settings.digitalAccessDurationMonths || 12} calendar months,
                no automatic recurring charge.
              </span>
            </li>
          </ul>
        </div>
      </div>

      <div className="actions about-access-actions">
        <Link to="/sample" className="button">
          Read the free sample <ArrowRight size={18} />
        </Link>
        <Link to="/digital-edition" className="button outline">
          Get Digital Access ({money(settings.digitalEditionPriceKobo)}){" "}
          <ArrowUpRight size={17} />
        </Link>
        <Link to="/about-author" className="text-link">
          Meet the author <ArrowRight size={16} />
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
          <div className="notice about-author-notice">
            <PenLine aria-hidden="true" />
            <div>
              <strong className="notice-heading">
                {config.settings.brandStatement}
              </strong>
              <p>
                Through {config.settings.organizationName}, she mentors,
                counsels, and equips teenagers and young adults (Ages 13–25) to
                build strong spiritual foundations, emotional intelligence,
                healthy relationships, and purposeful lives.
              </p>
            </div>
          </div>
          <h2>Mission &amp; Ministry</h2>
          <p>
            Her passion is rooted in a simple desire: to help young people stay
            connected with Jesus, discover who they are in Christ, and grow
            holistically in every important area of life — spiritual, emotional,
            academic, relational, financial, and vocational.
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
              Written for teenagers, campus students, young adults, parents,
              schools, churches, and youth ministries seeking a daily rhythm of
              Scripture and holistic development.
            </p>
            <div className="actions">
              <Link to="/digital-edition" className="button">
                Get the Digital Edition (
                {money(config.settings.digitalEditionPriceKobo)}){" "}
                <ArrowRight size={17} />
              </Link>
              <Link to="/bookstore" className="button outline">
                Order Printed Copy ({money(config.settings.hardcoverPriceKobo)})
              </Link>
              <Link to="/bulk-orders" className="text-link">
                Bulk orders for schools &amp; churches{" "}
                <ArrowUpRight size={16} />
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
          <span className="eyebrow">2027 Curriculum &amp; Monthly Focus</span>
          <h1>Twelve months of holistic growth.</h1>
          <p>
            Each month of the 2027 devotional is guided by an intentional theme
            addressing faith, character, relationships, emotional intelligence,
            excellence, financial wisdom, and purpose.
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
              <Link className="text-link" to={`/library?month=${t.month}`}>
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

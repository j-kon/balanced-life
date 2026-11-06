import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  Compass,
  Heart,
  Layers,
  PenLine,
  Shield,
  ShoppingBag,
  Sparkles,
  Sun,
  Users,
} from "lucide-react";
import { useApp } from "../../context/AppContext";
import {
  Cover,
  FiveStepFramework,
  PwaInstallBanner,
  UpcomingYearNotice,
} from "../../components/Common";
import { money, monthName } from "../../api";
import { PricingSection } from "./CommercePages";

const HOLISTIC_AREAS = [
  "Spiritual growth & connection with Jesus",
  "Identity, self-discovery & purpose",
  "Emotional intelligence",
  "Healthy relationships",
  "Academic & career development",
  "Financial wisdom",
  "Character & responsible decision-making",
  "Practical life skills",
];

const SIX_DIFFERENTIATORS = [
  {
    title: "365 days of intentional growth",
    description:
      "A full year of structured daily readings designed to build spiritual depth and personal maturity one day at a time.",
  },
  {
    title: "Short and engaging daily readings",
    description:
      "Written in a clear, relatable, and concise format that fits easily into a teenager's or young adult's daily routine.",
  },
  {
    title: "Relatable real-life topics",
    description:
      "Addresses the real experiences, questions, pressures, and transitions faced by young people aged 13–25.",
  },
  {
    title: "Biblical principles with practical application",
    description:
      "Connects timeless truths from God's Word with everyday decisions, relationships, habits, and personal goals.",
  },
  {
    title: "Holistic personal development and life skills",
    description:
      "Supports growth across spiritual life, emotional intelligence, relationships, academics, career readiness, and financial wisdom.",
  },
  {
    title: "Daily reflection and accountability",
    description:
      "Encourages readers not just to read, but to reflect, apply what they learn, and track their personal growth each day.",
  },
];

export function HomePage() {
  const { config } = useApp();
  const { settings } = config;

  return (
    <>
      <div className="container" style={{ paddingTop: "18px" }}>
        <PwaInstallBanner />
      </div>

      {/* SECTION A: HOMEPAGE HERO */}
      <section className="hero container">
        <div className="hero-copy">
          <span className="eyebrow">
            <span className="gold-line" /> A {settings.organizationName}{" "}
            Publication
          </span>
          <div className="hero-badges">
            <span className="pill">{settings.targetAudience}</span>
            <span className="pill">{settings.brandStatement}</span>
          </div>
          <h1>{settings.siteHeadline}</h1>
          <p className="hero-subheadline">
            <strong>{settings.siteSubheadline}</strong>
          </p>
          <p className="lead">
            Welcome to the home of <strong>{settings.siteTitle}</strong> — a
            daily guide designed to help teenagers and young adults stay
            connected to Jesus while building the character, wisdom, and life
            skills needed to thrive in today's world.
          </p>
          <p className="hero-supporting-copy">
            More than a devotional, this is a daily journey of spiritual growth,
            self-discovery, emotional maturity, purposeful living, and practical
            personal development.
          </p>
          <div className="actions">
            <Link className="button" to="/pricing">
              Subscribe Now <ArrowRight size={18} />
            </Link>
            <a className="button outline" href="#get-your-copy">
              Get Your Copy Today <ShoppingBag size={17} />
            </a>
            <Link className="text-link" to="/sample">
              Explore a free reading <ArrowUpRight size={16} />
            </Link>
          </div>
          <div className="hero-note">
            <BookOpen size={18} />
            <span>
              <em>"{settings.siteTagline}"</em>
              <br />
              <strong>By {settings.authorName}</strong>
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
              Building Minds. Shaping Character.
              <br />
              <strong>Creating Balanced Lives.</strong>
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
            <Sun size={20} /> 365 Days of Connecting with Jesus
          </span>
          <span>
            <Heart size={20} /> {settings.targetAudience}
          </span>
          <span>
            <BookOpen size={20} /> {settings.brandStatement}
          </span>
        </div>
      </div>

      {/* HOLISTIC DEVELOPMENT PILLARS */}
      <section className="container section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Holistic Development</span>
            <h2>
              Whole-person growth
              <br />
              for ages 13–25.
            </h2>
          </div>
          <p>
            Each day of <strong>{settings.siteTitle}</strong> intentionally
            equips teenagers and young adults across eight foundational areas of
            life:
          </p>
        </div>
        <div className="holistic-pillars-grid">
          {HOLISTIC_AREAS.map((area) => (
            <div className="pillar-chip" key={area}>
              <CheckCircle2 size={18} />
              <span>{area}</span>
            </div>
          ))}
        </div>
      </section>

      {/* SECTION B & C: WHY THE BALANCED LIFE DEVOTIONAL & WHY STAY CONNECTED WITH JESUS */}
      <section className="narrative-band">
        <div className="container narrative-grid">
          <article className="panel stack">
            <span className="eyebrow">Section I · The Purpose</span>
            <h2>Why The Balanced Life Devotional?</h2>
            <p>
              <strong>Every young person is on a journey of becoming.</strong>
            </p>
            <p>
              Between the ages of 13 and 25, life is filled with questions,
              pressures, opportunities, and important decisions. Young people
              are discovering who they are, what they believe, how to relate
              with others, and how to prepare for the future.
            </p>
            <p>
              However, many teenagers and young adults do not receive the right
              guidance at the right stage of life. Some receive information too
              early, while others receive it too late.
            </p>
            <p>
              <strong>{settings.siteTitle}</strong> was created to bridge that
              gap. It offers age-relevant, practical, and spiritually grounded
              daily readings that meet young people where they are and help them
              grow into balanced, confident, and God-fearing individuals.
            </p>
          </article>

          <article className="panel stack">
            <span className="eyebrow">Section II · The Foundation</span>
            <h2>Why Stay Connected with Jesus?</h2>
            <p>
              At the heart of this devotional is a simple truth:{" "}
              <strong>
                a truly balanced life begins with a personal connection with
                Jesus.
              </strong>
            </p>
            <p>
              Young people need more than motivation — they need a strong
              spiritual foundation that shapes their values, guides their
              choices, strengthens their identity, and gives meaning to their
              lives.
            </p>
            <p>Each daily reading helps readers:</p>
            <ul className="check-list">
              <li>
                <CheckCircle2 size={16} /> Draw closer to God through Scripture
                and prayer.
              </li>
              <li>
                <CheckCircle2 size={16} /> Understand how faith applies to
                everyday life.
              </li>
              <li>
                <CheckCircle2 size={16} /> Develop godly character and
                conviction.
              </li>
              <li>
                <CheckCircle2 size={16} /> Navigate life's challenges with
                wisdom and hope.
              </li>
              <li>
                <CheckCircle2 size={16} /> Grow in purpose and spiritual
                maturity.
              </li>
            </ul>
          </article>
        </div>
      </section>

      {/* SECTION D: WHAT MAKES THE DEVOTIONAL DIFFERENT? */}
      <section className="container section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Intentional Design</span>
            <h2>What Makes the Devotional Different?</h2>
          </div>
          <p>
            Designed specifically for teenagers and young adults navigating
            faith, academics, relationships, and personal identity.
          </p>
        </div>
        <div className="benefits">
          {SIX_DIFFERENTIATORS.map((item) => (
            <article key={item.title}>
              <span className="icon-tile">
                <Layers />
              </span>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      {/* SECTION E: MORE THAN READING — A DAILY GROWTH EXPERIENCE */}
      <section className="experience-band">
        <div className="container section">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Interactive Daily Rhythm</span>
              <h2>
                More Than Reading:
                <br />A Daily Growth Experience
              </h2>
            </div>
            <p>
              <strong>{settings.siteTitle}</strong> is designed as an
              interactive journey of transformation. Each day guides you through
              five intentional steps:
            </p>
          </div>

          <FiveStepFramework />

          <div className="accountability-preview panel">
            <div>
              <span className="eyebrow">Built-in Daily Accountability</span>
              <h3>Reflect, Apply & Track Your Growth</h3>
              <p>
                Inside the online reader and mobile app, every daily devotional
                includes your personal <strong>Daily Growth &amp; Accountability</strong>{" "}
                check-in so you can turn what you read into lasting habits:
              </p>
              <ul className="check-list">
                <li>
                  <CheckCircle2 size={16} />{" "}
                  <strong>Today's Lesson:</strong> Capture the core truth you
                  learned from Scripture.
                </li>
                <li>
                  <CheckCircle2 size={16} />{" "}
                  <strong>Personal Reflection:</strong> Write your honest
                  thoughts in your private Growth Journal.
                </li>
                <li>
                  <CheckCircle2 size={16} />{" "}
                  <strong>Practical Action Step:</strong> Commit to one specific
                  action you will take today.
                </li>
                <li>
                  <CheckCircle2 size={16} />{" "}
                  <strong>Completion Check-in:</strong> Mark the day's reading
                  completed and watch your 365-day journey grow.
                </li>
              </ul>
              <div className="actions">
                <Link className="button" to="/sample">
                  Try a daily reading <ArrowRight size={17} />
                </Link>
                <Link className="button outline" to="/register">
                  Create your reader account
                </Link>
              </div>
            </div>
            <div className="accountability-mockup">
              <div className="mockup-header">
                <PenLine size={18} />
                <span>Daily Growth Check-In · 2027 Edition</span>
              </div>
              <div className="mockup-field">
                <small>1. Today's Lesson</small>
                <p>True confidence comes from knowing who I am in Christ.</p>
              </div>
              <div className="mockup-field">
                <small>2. Personal Reflection</small>
                <p>
                  Lord, help me not to compare my journey with others at school
                  this week.
                </p>
              </div>
              <div className="mockup-field">
                <small>3. Practical Action to Take</small>
                <p>
                  Encourage a classmate today and spend 10 quiet minutes in
                  prayer before bed.
                </p>
              </div>
              <div className="mockup-status">
                <CheckCircle2 size={18} />
                <span>Reading Completed · Saved to Private Growth Journal</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION F & G: A RESOURCE FOR PARENTS, SCHOOLS AND CHURCHES + OUR VISION */}
      <section className="container section">
        <div className="narrative-grid">
          <article className="panel stack">
            <span className="eyebrow">Partnership in Mentorship</span>
            <h2>A Resource for Parents, Schools and Churches</h2>
            <p>
              Raising and guiding young people requires intentional partnership.{" "}
              <strong>{settings.siteTitle}</strong> serves as a valuable
              resource for:
            </p>
            <ul className="check-list">
              <li>
                <Users size={16} />{" "}
                <span>
                  <strong>Parents</strong> seeking daily spiritual and
                  character-building tools for their teenagers and young adults.
                </span>
              </li>
              <li>
                <Users size={16} />{" "}
                <span>
                  <strong>Schools</strong> committed to holistic student
                  development, values education, and leadership formation.
                </span>
              </li>
              <li>
                <Users size={16} />{" "}
                <span>
                  <strong>Churches &amp; Youth Ministries</strong> equipping
                  teenagers and young adults for faithful Christian living.
                </span>
              </li>
              <li>
                <Users size={16} />{" "}
                <span>
                  <strong>Mentors, Counsellors &amp; Youth Organizations</strong>{" "}
                  supporting young people through critical life transitions.
                </span>
              </li>
            </ul>
            <p className="muted">{settings.bulkDiscountNote}</p>
            <div className="actions">
              <Link className="button" to="/bulk-orders">
                Request Bulk / Group Order <ArrowRight size={17} />
              </Link>
              <Link className="text-link" to="/contact">
                Contact {settings.organizationName} <ArrowUpRight size={16} />
              </Link>
            </div>
          </article>

          <article className="panel stack vision-card">
            <span className="eyebrow">Our Mandate</span>
            <h2>Our Vision</h2>
            <blockquote className="vision-quote">
              “To raise a generation of young people who are{" "}
              <strong>
                spiritually grounded, emotionally intelligent, socially
                responsible, and purposeful
              </strong>{" "}
              — equipped to live balanced lives and make a positive impact in
              their families, communities, and the world.”
            </blockquote>
            <div className="vision-footer">
              <strong>{settings.organizationName}</strong>
              <span>{settings.brandStatement}</span>
            </div>
          </article>
        </div>
      </section>

      {/* AUTHOR BAND */}
      <section className="author-band">
        <div className="container author-content">
          <img
            className="author-profile"
            src={config.authorPortrait || "/brand/author-profile.png"}
            alt={`About the author: ${settings.authorName}, ${settings.authorTitle}`}
          />
          <div>
            <span className="eyebrow">Meet the Author</span>
            <h2>
              A heart for the
              <br />
              next generation.
            </h2>
            <p>
              <strong>{settings.siteTitle}</strong> is written by{" "}
              <strong>{settings.authorName}</strong> ({settings.authorTitle}) for
              teenagers and young adults aged 13–25, and published by{" "}
              <strong>{settings.organizationName}</strong>.
            </p>
            <p>
              Discover 365 days of Scripture, relatable real-life reflections,
              practical life skills, and prayer in the 2027 edition.
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

      {/* SECTION H: GET YOUR COPY TODAY! */}
      <section id="get-your-copy" className="container section">
        <div className="center-heading">
          <span className="eyebrow">Get Your Copy Today!</span>
          <h2>Choose how you want to read and grow.</h2>
          <p>
            Invest in a daily habit that shapes the mind, strengthens character,
            and builds a balanced life. Whether for yourself, your child, your
            students, or your youth group,{" "}
            <strong>{settings.siteTitle}</strong> is a meaningful companion for
            every day of the year.
          </p>
        </div>

        <div className="copy-options-grid">
          <article className="panel copy-option-card">
            <span className="pill">Physical Hardcover Edition</span>
            <h3>Printed Copy</h3>
            <div className="price">{money(settings.hardcoverPriceKobo)}</div>
            <p>One-time printed copy · Individual or bulk delivery</p>
            <ul className="check-list">
              <li>
                <CheckCircle2 size={16} /> Full 365-day printed 2027 devotional
                book
              </li>
              <li>
                <CheckCircle2 size={16} /> Ideal for personal study, family
                devotion, schools &amp; youth ministries
              </li>
              <li>
                <CheckCircle2 size={16} /> Special bulk arrangements for
                schools, churches &amp; organizations
              </li>
            </ul>
            <div className="actions">
              <Link className="button" to="/bookstore">
                Order Printed Copy <ArrowRight size={16} />
              </Link>
              <Link className="text-link" to="/bulk-orders">
                Bulk order inquiry <ArrowUpRight size={15} />
              </Link>
            </div>
          </article>

          <article className="panel copy-option-card featured-option">
            <span className="pill">One-Time Online Edition</span>
            <h3>Digital Copy (2027 Edition)</h3>
            <div className="price">
              {money(settings.digitalEditionPriceKobo)}
            </div>
            <p>One-time purchase · Persistent 2027 online access</p>
            <ul className="check-list">
              <li>
                <CheckCircle2 size={16} /> Persistent online access to all
                published 2027 devotionals in your reader account
              </li>
              <li>
                <CheckCircle2 size={16} /> Includes private Growth Journal, 5-step
                daily accountability &amp; progress tracking
              </li>
              <li>
                <CheckCircle2 size={16} /> Protected online reading on phone,
                tablet, or computer (no recurring charge)
              </li>
            </ul>
            <div className="actions">
              <Link className="button" to="/digital-edition">
                Buy Digital Copy ({money(settings.digitalEditionPriceKobo)}){" "}
                <ArrowRight size={16} />
              </Link>
            </div>
          </article>

          <article className="panel copy-option-card">
            <span className="pill">Flexible Membership Plans</span>
            <h3>Digital Membership</h3>
            <div className="price">From {money(100000)}</div>
            <p>Monthly, Quarterly, 6-Month, or Yearly subscription</p>
            <ul className="check-list">
              <li>
                <CheckCircle2 size={16} /> Full access to published 2027
                readings for your selected membership duration
              </li>
              <li>
                <CheckCircle2 size={16} /> Private Growth Journal, bookmarks,
                and mobile reminder notifications
              </li>
              <li>
                <CheckCircle2 size={16} /> Choose manual or automatic renewal at
                checkout
              </li>
            </ul>
            <div className="actions">
              <Link className="button outline" to="/pricing">
                View Membership Plans <ArrowRight size={16} />
              </Link>
            </div>
          </article>
        </div>

        <div className="notice" style={{ marginTop: "28px" }}>
          <Shield size={20} />
          <div>
            <strong>Direct Inquiries &amp; Partnerships</strong>
            <p>
              Email: <strong>{settings.contactEmail}</strong> · Phone/WhatsApp:{" "}
              <strong>{settings.contactPhone}</strong>
              {settings.contactSecondaryPhone
                ? `, ${settings.contactSecondaryPhone}`
                : ""}{" "}
              · Website: <strong>{settings.contactWebsite}</strong>
            </p>
          </div>
        </div>
      </section>

      {/* 12 MONTHLY THEMES */}
      <section className="container section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Your Year of Growth</span>
            <h2>
              Twelve monthly themes.
              <br />A whole year of possibility.
            </h2>
          </div>
          <div>
            <p>
              Follow the daily reading or explore any published reading in the
              2027 archive with a Digital Edition purchase or membership.
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
              <strong>The 2027 journey is ready.</strong>
              <p>Explore monthly themes and readings in the library.</p>
            </div>
          </div>
        )}
      </section>

      <PricingSection embedded />

      <section className="container final-invite">
        <Sparkles />
        <h2>
          Growing up is a journey.
          <br />
          Make every day count.
        </h2>
        <div className="actions" style={{ justifyContent: "center" }}>
          <Link className="button" to="/register">
            Start your journey <ArrowRight size={18} />
          </Link>
          <Link className="button outline" to="/digital-edition">
            Get the Digital Edition ({money(settings.digitalEditionPriceKobo)})
          </Link>
        </div>
      </section>
    </>
  );
}

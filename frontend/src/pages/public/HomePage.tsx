import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Heart,
  PenLine,
  Smartphone,
} from "lucide-react";
import { useApp } from "../../context/AppContext";
import {
  Cover,
  FiveStepFramework,
  UpcomingYearNotice,
} from "../../components/Common";
import { PricingSection } from "./CommercePages";

export function HomePage() {
  const { config, user } = useApp();
  const { settings } = config;
  return (
    <>
      <section className="hero container">
        <div className="hero-copy">
          <span className="eyebrow">
            <span className="gold-line" />
            {settings.organizationName}
          </span>
          <h1>{settings.siteHeadline}</h1>
          <p className="lead">
            A daily moment with God. Discover Scripture, reflect on what
            matters, and grow into a more balanced life with the 2027 devotional.
          </p>
          <div className="actions">
            <Link className="button" to="/digital-edition">
              Read online · ₦3,500 <ArrowRight size={18} />
            </Link>
            <Link className="button outline" to="/sample">
              Read free sample <ArrowUpRight size={16} />
            </Link>
            {!user && (
              <Link className="text-link" to="/register">
                Create free account <ArrowRight size={15} />
              </Link>
            )}
          </div>
          <div className="hero-note">
            <BookOpen size={18} />
            <span>
              {settings.siteTagline}
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
            <Heart size={22} />
            <span>
              A daily companion.
              <br />
              <strong>A whole year of growth.</strong>
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
            <BookOpen size={20} />
            365 days in the Word
          </span>
          <span>
            <PenLine size={20} />
            Your private growth journal
          </span>
          <span>
            <Smartphone size={20} />
            At home on your phone
          </span>
        </div>
      </div>
      <section className="container section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">A simple daily rhythm</span>
            <h2>
              Read. Reflect.
              <br />
              Live what you learn.
            </h2>
          </div>
          <p>
            Take a few quiet minutes each day to connect with Jesus, discover
            something new, and put your faith into practice.
          </p>
        </div>
        <FiveStepFramework />
      </section>
      <PricingSection embedded />
      <section className="author-band">
        <div className="container author-content">
          <img
            className="author-profile"
            src={config.authorPortrait || "/brand/author-profile.png"}
            alt={settings.authorName}
          />
          <div>
            <span className="eyebrow">Meet the author</span>
            <h2>
              A heart for the
              <br />
              next generation.
            </h2>
            <p>
              <strong>{settings.authorName}</strong> is the author of{" "}
              {settings.siteTitle} and {settings.authorTitle}.
            </p>
            <p>
              A devotional companion for teenagers and young adults, presented
              by {settings.organizationName}.
            </p>
            <Link className="text-link" to="/about-author">
              Read the author&apos;s story <ArrowRight size={17} />
            </Link>
          </div>
        </div>
      </section>
      <section className="container section install-invite">
        <Smartphone size={32} />
        <div>
          <h2>Your quiet space, wherever you are.</h2>
          <p>
            Add Balanced Life to your Android or iPhone home screen. Sign in to
            find your readings, journal, and progress together.
          </p>
        </div>
        <Link className="button" to="/install">
          Install the app <ArrowRight size={17} />
        </Link>
      </section>
    </>
  );
}


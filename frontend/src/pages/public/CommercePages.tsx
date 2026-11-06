import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Mail,
  MapPin,
  Phone,
  ShoppingBag,
} from "lucide-react";
import { useApp } from "../../context/AppContext";
import { useData } from "../../hooks/useData";
import { Cover, ErrorBox, Loading } from "../../components/Common";
import { api, money } from "../../api";
import type { Plan } from "../../types";

export function PricingSection({ embedded = false }: { embedded?: boolean }) {
  const { data, error } = useData<Plan[]>("/plans");
  const { config } = useApp();

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
              : "Choose your membership."}
          </h2>
          <p>
            Every membership unlocks all published 2027 devotionals, your
            private growth journal, bookmarks, and reading progress tracking.
          </p>
          <span className="pill">
            2027 Edition · Provisional membership plans
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
                    Full year of intentional growth
                  </div>
                )}
                <h3>{p.name}</h3>
                <div className="price">{money(p.amountKobo)}</div>
                <p>for {p.months === 1 ? "one month" : p.months + " months"}</p>
                <ul>
                  <li>
                    <Check size={16} /> All published 2027 devotionals
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
          {config.payments.configured
            ? "Secure online payments are processed via Paystack in Nigerian Naira (NGN)."
            : "Online Paystack checkout is currently awaiting production merchant credentials. Registered readers may request or receive administrator-granted complimentary access."}
        </p>
      </div>
    </section>
  );
}

export function PricingPage() {
  return <PricingSection embedded={false} />;
}

export function BookstorePage() {
  const { toast, config } = useApp();
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const availabilityLabel =
    config.settings.hardcoverAvailability === "available"
      ? "Available for order inquiry"
      : config.settings.hardcoverAvailability === "preorder"
        ? "Open for 2027 pre-order"
        : "Currently out of stock — register interest";

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      await api("/inquiries", {
        name: f.get("name"),
        email: f.get("email"),
        phone: f.get("phone") || "",
        quantity: Number(f.get("quantity")) || 1,
        deliveryLocation: f.get("deliveryLocation") || "",
        message: f.get("message") || "",
        inquiryType: "hardcover",
      });
      setSent(true);
      toast("Your hardcover order inquiry has been received.");
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
        <p className="lead">{config.settings.siteTitle} · 2027 Hardcover</p>
        <span className="pill">{availabilityLabel}</span>
        <p>
          A 365-day devotional by <strong>{config.settings.authorName}</strong>,
          published by {config.settings.organizationName}.
        </p>
        <h2>{money(config.settings.hardcoverPriceKobo)}</h2>
        <p>{config.settings.hardcoverNote}</p>
        {sent ? (
          <div className="notice success">
            <CheckCircle2 />
            <div>
              <strong>Hardcover inquiry received</strong>
              <p>
                Thank you for your interest in the printed edition. Our team at{" "}
                {config.settings.organizationName} has recorded your request and
                will follow up with availability and delivery arrangements.
              </p>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="stack">
            <div className="form-row-2">
              <label>
                Your full name
                <input
                  name="name"
                  required
                  minLength={2}
                  maxLength={100}
                  autoComplete="name"
                />
              </label>
              <label>
                Email address
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                />
              </label>
            </div>
            <div className="form-row-2">
              <label>
                Phone / WhatsApp number
                <input
                  name="phone"
                  type="tel"
                  maxLength={40}
                  placeholder="+234 …"
                  autoComplete="tel"
                />
              </label>
              <label>
                Number of copies
                <input
                  name="quantity"
                  type="number"
                  min={1}
                  max={10000}
                  defaultValue={1}
                  required
                />
              </label>
            </div>
            <label>
              City / Delivery location
              <input
                name="deliveryLocation"
                maxLength={200}
                placeholder="e.g. Lagos, Abuja, Port Harcourt…"
              />
            </label>
            <label>
              Additional notes (optional)
              <textarea
                name="message"
                maxLength={2000}
                placeholder="Let us know if this order is for an individual, church youth group, or school."
              />
            </label>
            <ErrorBox message={error} />
            <button className="button" disabled={busy}>
              <ShoppingBag size={17} />
              {busy ? "Submitting…" : "Submit hardcover inquiry"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export function ContactPage() {
  const { config, toast } = useApp();
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      await api("/inquiries", {
        name: f.get("name"),
        email: f.get("email"),
        phone: f.get("phone") || "",
        quantity: 1,
        deliveryLocation: "",
        message: f.get("message") || "",
        inquiryType: "general",
      });
      setSent(true);
      toast("Your message has been sent.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container section bookstore">
      <div>
        <span className="eyebrow">Get in touch</span>
        <h1>
          Connect with
          <br />
          {config.settings.organizationName}.
        </h1>
        <p className="lead">
          Have a question about The Balanced Life Devotional, youth counselling,
          speaking invitations, or bulk ministry orders? We would love to hear
          from you.
        </p>
        <div className="panel stack contact-details-card">
          <div className="contact-line">
            <Mail size={18} />
            <div>
              <strong>Email</strong>
              <p>{config.settings.contactEmail}</p>
            </div>
          </div>
          <div className="contact-line">
            <Phone size={18} />
            <div>
              <strong>Phone</strong>
              <p>{config.settings.contactPhone}</p>
            </div>
          </div>
          <div className="contact-line">
            <MapPin size={18} />
            <div>
              <strong>Location</strong>
              <p>{config.settings.contactAddress}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="panel">
        <h2>Send a message</h2>
        <p>
          Fill out the form below and an administrator at{" "}
          {config.settings.organizationName} will review your message.
        </p>
        {sent ? (
          <div className="notice success">
            <CheckCircle2 />
            <div>
              <strong>Message received</strong>
              <p>
                Thank you for reaching out. Your inquiry has been logged for our
                team to review and respond.
              </p>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="stack">
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
            <label>
              Email address
              <input name="email" type="email" required autoComplete="email" />
            </label>
            <label>
              Phone number (optional)
              <input name="phone" type="tel" maxLength={40} autoComplete="tel" />
            </label>
            <label>
              How can we help?
              <textarea
                name="message"
                required
                maxLength={2000}
                placeholder="Write your question or message…"
              />
            </label>
            <ErrorBox message={error} />
            <button className="button" disabled={busy}>
              {busy ? "Sending…" : "Send message"} <ArrowRight size={16} />
            </button>
          </form>
        )}
      </div>
    </div>
  );
}


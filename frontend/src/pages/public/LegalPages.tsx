import { useApp } from "../../context/AppContext";

export function PrivacyPage() {
  const { config } = useApp();
  return (
    <div className="container section narrow">
      <span className="eyebrow">Privacy & Data Stewardship</span>
      <h1>Privacy Policy</h1>
      <p className="lead">
        {config.settings.organizationName} respects your privacy and protects
        the personal reflections you record while using{" "}
        {config.settings.siteTitle}.
      </p>
      <hr />
      <h2>1. Information We Collect</h2>
      <p>
        To provide your devotional account, we collect only the minimum
        information necessary: your name, your email address, and a salted
        cryptographic hash of your password. We do not collect birth dates,
        residential addresses, or unnecessary personal identifiers during
        account registration.
      </p>
      <h2>2. Your Private Growth Journal</h2>
      <p>
        Journal entries written in your Growth Journal are strictly scoped to
        your reader account. Administrators manage devotional content,
        subscriptions, and bookstore inquiries, and do not have access to read
        another reader's private journal entries through the administration
        interface.
      </p>
      <h2>3. Sessions, Cookies & Offline Caching</h2>
      <p>
        We use a single HTTP-only, strict same-site session cookie (
        <code>balanced_session</code>) to keep you signed in securely. Our
        Progressive Web App service worker caches only public application icons
        and manifest metadata; authenticated API responses, devotional readings,
        and personal journal reflections are never cached in browser service
        worker storage.
      </p>
      <h2>4. Payments & Inquiries</h2>
      <p>
        When online payment processing via Paystack is enabled, card and bank
        details are handled directly by Paystack and are never stored on our
        servers. We record only transaction references, plan selections, and
        verification statuses.
      </p>
      <h2>5. Contact & Data Requests</h2>
      <p>
        You may update your profile details or delete individual journal
        reflections at any time from your account. For account inquiries, reach
        us at <strong>{config.settings.contactEmail}</strong>.
      </p>
    </div>
  );
}

export function TermsPage() {
  const { config } = useApp();
  return (
    <div className="container section narrow">
      <span className="eyebrow">Reader Agreement</span>
      <h1>Terms of Use</h1>
      <p className="lead">
        Welcome to {config.settings.siteTitle}, published by{" "}
        {config.settings.organizationName} and written by{" "}
        {config.settings.authorName}.
      </p>
      <hr />
      <h2>1. Devotional Content & Copyright</h2>
      <p>
        All 365 daily devotionals, monthly themes, reflections, prayers, and
        accompanying texts in the 2027 edition are the intellectual property of{" "}
        <strong>{config.settings.authorName}</strong> and{" "}
        <strong>{config.settings.organizationName}</strong>. Readings are
        provided for personal spiritual growth, family devotion, and authorized
        youth ministry use. Unlicensed reproduction or commercial redistribution
        of the manuscript is prohibited.
      </p>
      <h2>2. Memberships, Renewals & Cancellations</h2>
      <p>
        Digital memberships grant access to all published devotionals in the
        2027 archive for the duration of the selected plan (Monthly, Quarterly,
        Six Months, or Yearly). You may choose between manual and automatic
        renewal preferences and may cancel future renewals at any time. When you
        cancel a membership, your paid-through access remains active until the
        current expiration date.
      </p>
      <h2>3. Complimentary Access</h2>
      <p>
        Administrators may grant complimentary memberships to readers, ministry
        partners, or students. Complimentary access is recorded distinctly from
        paid subscriptions and may be modified or revoked by an administrator in
        accordance with community guidelines.
      </p>
      <h2>4. Account Conduct & Security</h2>
      <p>
        You are responsible for maintaining the confidentiality of your account
        password. Accounts are intended for individual use. Administrators
        reserve the right to suspend accounts that abuse platform security or
        violate these terms.
      </p>
      <h2>5. Contact Information</h2>
      <p>
        Questions regarding these terms or hardcover book orders may be directed
        to <strong>{config.settings.organizationName}</strong> at{" "}
        <strong>{config.settings.contactEmail}</strong>.
      </p>
    </div>
  );
}


import { Link } from "react-router-dom";
import { Bell, BookOpen, Shield, Smartphone } from "lucide-react";
import { useApp } from "../../context/AppContext";
import { money } from "../../api";

export function PrivacyPage() {
  const { config } = useApp();
  return (
    <div className="container section narrow legal-document">
      <span className="eyebrow">
        Privacy &amp; Data Protection (Ages 13–25)
      </span>
      <h1>Privacy Policy</h1>
      <p className="lead">
        <strong>{config.settings.organizationName}</strong> respects the privacy
        of teenagers, young adults, parents, and mentors, and protects the
        personal reflections recorded while using{" "}
        <strong>{config.settings.siteTitle}</strong>.
      </p>
      <hr />
      <h2>1. Minimal Data Collection for Young Readers (Ages 13–25)</h2>
      <p>
        Because {config.settings.siteTitle} serves teenagers and young adults
        aged 13–25, we practice strict data minimization. To create a reader
        account, we collect only your name, email address, reader age bracket
        (13–17, 18–25, or parent/mentor), and a salted cryptographic hash of
        your password. Readers aged 13–17 confirm parent, guardian, or youth
        mentor permission at registration. We do not collect exact dates of
        birth, residential addresses, location tracking, or third-party
        advertising identifiers for reader accounts.
      </p>
      <h2>2. Strictly Private Growth Journal &amp; Accountability Entries</h2>
      <p>
        Every daily lesson, personal reflection, and practical action step you
        record in your Growth Journal is strictly scoped to your authenticated
        reader account. No public social feeds exist on the platform, and
        administrators cannot view or export another reader's private journal
        entries through the administration dashboard or API.
      </p>
      <h2>3. Sessions, Cookies &amp; PWA Offline Safety</h2>
      <p>
        We use a single HTTP-only, strict same-site session cookie (
        <code>balanced_session</code>) to keep you signed in securely. Our
        Progressive Web App service worker caches only public application icons
        and manifest metadata; authenticated API responses, premium devotional
        readings, and personal journal reflections are never cached in browser
        service worker storage.
      </p>
      <h2>4. Payments, Bank Transfers &amp; Bulk Inquiries</h2>
      <p>
        Online card and bank payments are processed through Paystack; your card
        credentials never touch our servers. When manual bank-transfer orders or
        bulk order inquiries are submitted, we store only the contact and
        transfer reference details required for administrator reconciliation and
        delivery fulfillment.
      </p>
      <h2>5. Contact &amp; Data Requests</h2>
      <p>
        Readers, parents, or guardians may update profile information or delete
        individual journal reflections at any time. For privacy inquiries or
        account deletion requests, contact{" "}
        <strong>{config.settings.organizationName}</strong> at{" "}
        <strong>{config.settings.contactEmail}</strong> or{" "}
        <strong>{config.settings.contactPhone}</strong>.
      </p>
    </div>
  );
}

export function TermsPage() {
  const { config } = useApp();
  return (
    <div className="container section narrow legal-document">
      <span className="eyebrow">Reader &amp; Purchaser Agreement</span>
      <h1>Terms of Use</h1>
      <p className="lead">
        Welcome to <strong>{config.settings.siteTitle}</strong>, published by{" "}
        <strong>{config.settings.organizationName}</strong> and written by{" "}
        <strong>{config.settings.authorName}</strong>.
      </p>
      <hr />
      <h2>1. Devotional Content &amp; Copyright Protection</h2>
      <p>
        All 365 daily devotionals, monthly themes, reflections, prayers, and
        accompanying texts in the 2027 edition are the intellectual property of{" "}
        <strong>{config.settings.authorName}</strong> and{" "}
        <strong>{config.settings.organizationName}</strong>. Readings are
        provided for personal spiritual growth, family devotion, and authorized
        school or youth ministry use. Unrestricted PDF downloads, scraping, or
        commercial redistribution of the manuscript are strictly prohibited.
      </p>
      <h2>2. Online Access and the Printed Book</h2>
      <p>
        We offer distinct ways to access {config.settings.siteTitle}:
      </p>
      <p>
        <strong>a) 2027 Online Access ({money(config.settings.digitalEditionPriceKobo)}):</strong>{" "}
        A verified one-time purchase grants {config.settings.digitalAccessDurationMonths || 12}{" "}
        calendar months of online reading access to published devotionals in the
        2027 edition inside your registered reader account (starting January 1,
        2027 for early purchases, or on payment verification thereafter), along
        with your private Growth Journal and 5-step daily accountability tools.
        Online access has no automatic recurring billing, can be manually renewed,
        and preserves existing grandfathered legacy entitlements documented prior
        to the 12-month policy update.
      </p>
      <p><strong>b) Printed book ({money(config.settings.hardcoverPriceKobo)}):</strong> One physical copy, ordered separately from online reading access. Delivery arrangements are confirmed by {config.settings.organizationName}.</p>
      <h2>3. Payment Verification, Refunds &amp; Access Revocation</h2>
      <p>
        Online Paystack transactions activate entitlements only after cryptographic
        webhook or server-side transaction verification. Manual bank-transfer
        orders remain pending until an administrator confirms settled funds in
        the official {config.settings.organizationName} bank accounts. If a
        payment is refunded, reversed, or found to be fraudulent, the associated
        digital entitlement or subscription will be revoked.
      </p>
      <h2>4. Young Readers &amp; Account Conduct</h2>
      <p>
        This platform is designed for teenagers and young adults (Ages 13–25)
        and their parents, schools, and youth leaders. Readers aged 13–17 must
        use the platform with parent, guardian, or youth mentor permission.
        Accounts are for individual use.
      </p>
      <h2>5. Contact Information</h2>
      <p>
        Questions regarding these terms, online access, or printed book orders may
        be directed to <strong>{config.settings.organizationName}</strong> at{" "}
        <strong>{config.settings.contactEmail}</strong> or{" "}
        <strong>{config.settings.contactPhone}</strong>.
      </p>
    </div>
  );
}

export function InstallPage() {
  const { config, user } = useApp();
  return (
    <div className="container section narrow install-guide-page">
      <span className="eyebrow">Mobile App &amp; Daily Reminders</span>
      <h1>Install {config.settings.siteTitle} on Your Phone</h1>
      <p className="lead">
        Add {config.settings.siteTitle} to your home screen for one-tap daily
        reading, 5-step accountability journaling, and daily reminder
        notifications on Android or iPhone.
      </p>
      <hr />
      <div className="panel stack">
        <div className="section-title" style={{ margin: 0 }}>
          <h2>
            <Smartphone size={20} /> Android (Chrome or Edge)
          </h2>
        </div>
        <ol className="stack">
          <li>
            Open <strong>{config.settings.contactWebsite}</strong> in Chrome or
            Edge on your Android phone.
          </li>
          <li>
            Tap the install prompt banner when offered, or open the browser
            menu (<strong>&#8942;</strong>) in the top corner.
          </li>
          <li>
            Tap <strong>Install app</strong> or{" "}
            <strong>Add to Home screen</strong> and confirm.
          </li>
        </ol>
      </div>

      <div className="panel stack" style={{ marginTop: "20px" }}>
        <div className="section-title" style={{ margin: 0 }}>
          <h2>
            <BookOpen size={20} /> iPhone &amp; iPad (Safari, iOS 16.4+)
          </h2>
        </div>
        <ol className="stack">
          <li>
            Open <strong>{config.settings.contactWebsite}</strong> in Safari
            (required by Apple for Home Screen installation and push alerts).
          </li>
          <li>
            Tap the <strong>Share</strong> icon in Safari&apos;s toolbar.
          </li>
          <li>
            Scroll down and tap <strong>Add to Home Screen</strong>, then tap{" "}
            <strong>Add</strong>.
          </li>
          <li>
            Launch the app directly from the Home Screen icon before enabling
            push reminders.
          </li>
        </ol>
      </div>

      <div className="panel stack" style={{ marginTop: "20px" }}>
        <div className="section-title" style={{ margin: 0 }}>
          <h2>
            <Shield size={20} /> Offline &amp; Privacy Guarantee
          </h2>
        </div>
        <p style={{ margin: 0 }}>
          The installed app caches only public visual assets. Your private
          Growth Journal entries, paid devotional chapters, and account details
          stay strictly protected inside authenticated requests over HTTPS.
        </p>
        <div className="actions">
          <Link className="button" to={user ? "/account" : "/login"}>
            <Bell size={16} />{" "}
            {user ? "Configure reminders in Account" : "Sign in for reminders"}
          </Link>
          <Link className="button outline" to="/library">
            Open devotional library
          </Link>
        </div>
      </div>
    </div>
  );
}

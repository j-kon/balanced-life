export type EmailTemplateId =
  | "welcome"
  | "password_reset_code"
  | "password_changed"
  | "online_access_confirmed"
  | "online_access_expiry_reminder"
  | "online_access_renewed"
  | "printed_order_received"
  | "delivery_quotation_ready"
  | "printed_payment_confirmed"
  | "order_dispatched"
  | "order_delivered"
  | "admin_announcement"
  | "daily_devotional_reminder";

export type EmailCategory = "transactional" | "optional";

export type RenderedEmailTemplate = {
  templateId: EmailTemplateId;
  category: EmailCategory;
  subject: string;
  previewText: string;
  html: string;
  text: string;
};

export type EmailTemplateCatalogEntry = {
  id: EmailTemplateId;
  label: string;
  category: EmailCategory;
  description: string;
};

export const EMAIL_TEMPLATE_CATALOG: EmailTemplateCatalogEntry[] = [
  {
    id: "welcome",
    label: "Welcome Email",
    category: "transactional",
    description:
      "Sent when a reader creates an account to welcome them to The Balanced Life Devotional.",
  },
  {
    id: "password_reset_code",
    label: "Password Reset Code",
    category: "transactional",
    description:
      "Sends the 6-digit one-time verification code (10-minute expiry) for reader or staff password recovery.",
  },
  {
    id: "password_changed",
    label: "Password Changed Notice",
    category: "transactional",
    description:
      "Security confirmation sent after a password reset or password update completes.",
  },
  {
    id: "online_access_confirmed",
    label: "Online Access Confirmed",
    category: "transactional",
    description:
      "Sent when 12-month 2027 online devotional access is activated or granted.",
  },
  {
    id: "online_access_expiry_reminder",
    label: "Online Access Expiry Reminder",
    category: "optional",
    description:
      "Reminder sent shortly before a reader's 12-month online devotional access expires.",
  },
  {
    id: "online_access_renewed",
    label: "Online Access Renewed",
    category: "transactional",
    description:
      "Confirmation when a reader renews 12-month online devotional access.",
  },
  {
    id: "printed_order_received",
    label: "Printed Order Received",
    category: "transactional",
    description:
      "Order acknowledgement for printed copy requests awaiting delivery quotation.",
  },
  {
    id: "delivery_quotation_ready",
    label: "Delivery Quotation Ready",
    category: "transactional",
    description:
      "Sent when an administrator quotes delivery and sets the final printed order total.",
  },
  {
    id: "printed_payment_confirmed",
    label: "Printed Payment Confirmed",
    category: "transactional",
    description:
      "Confirmation once payment for a printed devotional order is verified.",
  },
  {
    id: "order_dispatched",
    label: "Order Dispatched",
    category: "transactional",
    description:
      "Shipping update with courier and tracking reference when a printed order ships.",
  },
  {
    id: "order_delivered",
    label: "Order Delivered",
    category: "transactional",
    description:
      "Final delivery confirmation once a printed devotional order has been delivered.",
  },
  {
    id: "admin_announcement",
    label: "Admin Announcement",
    category: "optional",
    description:
      "Optional editorial or community update composed by authorized staff for opted-in readers.",
  },
  {
    id: "daily_devotional_reminder",
    label: "Daily Devotional Reminder",
    category: "optional",
    description:
      "Optional daily reading prompt for readers who explicitly opt in to daily devotional emails.",
  },
];

export const BRAND_CONTACT = {
  brandName: "The Balanced Life Devotional",
  organizationName: "Cossy Teens Consult Enterprises",
  tagline: "Building Minds. Shaping Character. Creating Balanced Lives.",
  email: "cossyteensconsult@gmail.com",
  website: "https://cossyteens.com",
  websiteLabel: "cossyteens.com",
  location: "Abuja, Nigeria",
} as const;

export function escapeHtml(input: unknown): string {
  return String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function sanitizePlainText(input: unknown, maxLength = 4000): string {
  return String(input ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, maxLength);
}

export function formatNairaFromKobo(amountKobo: number): string {
  const naira = Math.round(Number(amountKobo || 0) / 100);
  return `₦${naira.toLocaleString("en-NG")}`;
}

export function formatEmailDate(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }
  return parsed.toLocaleDateString("en-NG", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function sanitizeHref(url: string | null | undefined, fallback: string): string {
  const raw = String(url || "").trim();
  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }
  return fallback;
}

export function renderSafeEmailParagraphs(text: string): {
  html: string;
  plainText: string;
} {
  const cleaned = sanitizePlainText(text, 5000);
  const blocks = cleaned
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  const html = blocks
    .map((block) => {
      const lines = block
        .split("\n")
        .map((line) => escapeHtml(line.trim()))
        .filter(Boolean);
      return `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.65;color:#2E2420;">${lines.join("<br />")}</p>`;
    })
    .join("");

  return {
    html,
    plainText: blocks.join("\n\n"),
  };
}

type LayoutParams = {
  templateId: EmailTemplateId;
  category: EmailCategory;
  subject: string;
  previewText: string;
  badgeText: string;
  heading: string;
  recipientName?: string;
  bodyHtml: string;
  bodyText: string;
  ctaLabel?: string;
  ctaUrl?: string;
  secondaryNote?: string;
  secondaryText?: string;
  appBaseUrl: string;
  preferencesUrl?: string;
  unsubscribeUrl?: string;
  isAdminNotice?: boolean;
};

function renderEmailShell(params: LayoutParams): RenderedEmailTemplate {
  const appUrl = sanitizeHref(params.appBaseUrl, "https://cossyteens.com");
  const preferencesUrl = sanitizeHref(
    params.preferencesUrl,
    `${appUrl.replace(/\/+$/, "")}/account`,
  );
  const unsubscribeUrl = params.unsubscribeUrl
    ? sanitizeHref(params.unsubscribeUrl, preferencesUrl)
    : null;
  const ctaUrl = params.ctaUrl ? sanitizeHref(params.ctaUrl, appUrl) : null;

  const badgeBg =
    params.category === "transactional" ? "#F7EBDD" : "#E9F3EE";
  const badgeColor =
    params.category === "transactional" ? "#570008" : "#1F5E3F";
  const badgeBorder =
    params.category === "transactional" ? "#DFC39D" : "#B8D8C6";

  const greetingName = String(params.recipientName || "").trim();
  const greetingHtml = greetingName
    ? `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:#2E2420;">Hello <strong>${escapeHtml(greetingName)}</strong>,</p>`
    : `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:#2E2420;">Hello,</p>`;

  const greetingText = greetingName ? `Hello ${greetingName},\n\n` : "Hello,\n\n";

  const ctaHtml =
    ctaUrl && params.ctaLabel
      ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:22px 0 18px 0;">
          <tr>
            <td align="center" bgcolor="#570008" style="border-radius:8px;background-color:#570008;">
              <a href="${escapeHtml(ctaUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:13px 24px;font-family:Georgia,'Times New Roman',serif;font-size:15px;font-weight:bold;color:#FFFFFF;text-decoration:none;border-radius:8px;border:1px solid #570008;">
                ${escapeHtml(params.ctaLabel)}
              </a>
            </td>
          </tr>
        </table>
        <p style="margin:0 0 16px 0;font-size:12px;line-height:1.5;color:#786962;word-break:break-word;">
          Button not working? Copy and open: <a href="${escapeHtml(ctaUrl)}" style="color:#7B111A;text-decoration:underline;">${escapeHtml(ctaUrl)}</a>
        </p>`
      : "";

  const ctaText =
    ctaUrl && params.ctaLabel ? `\n\n${params.ctaLabel}: ${ctaUrl}` : "";

  const secondaryHtml = params.secondaryNote
    ? `<div style="margin-top:18px;padding:12px 14px;background-color:#FAF5ED;border-left:3px solid #C89B3C;border-radius:6px;font-size:13px;line-height:1.55;color:#574A44;">
        ${escapeHtml(params.secondaryNote)}
      </div>`
    : "";

  const secondaryText = params.secondaryText
    ? `\n\nNote: ${params.secondaryText}`
    : params.secondaryNote
      ? `\n\nNote: ${params.secondaryNote}`
      : "";

  const footerClassificationHtml =
    params.category === "optional"
      ? `<p style="margin:0 0 10px 0;font-size:12px;line-height:1.6;color:#6E6059;">
          You received this optional email because you opted in to updates from ${escapeHtml(BRAND_CONTACT.brandName)}.
        </p>
        <p style="margin:0 0 14px 0;font-size:12px;line-height:1.6;color:#570008;">
          ${unsubscribeUrl ? `<a href="${escapeHtml(unsubscribeUrl)}" style="color:#570008;font-weight:bold;text-decoration:underline;">Unsubscribe from this type of email</a> &nbsp;·&nbsp; ` : ""}
          <a href="${escapeHtml(preferencesUrl)}" style="color:#570008;text-decoration:underline;">Manage Email Preferences</a>
        </p>`
      : `<p style="margin:0 0 10px 0;font-size:12px;line-height:1.6;color:#6E6059;">
          ${params.isAdminNotice ? "This essential security notification was sent for your Balanced Life Admin staff account." : `This essential transactional notice was sent regarding your account or order activity on ${escapeHtml(BRAND_CONTACT.brandName)}.`}
        </p>
        ${
          params.isAdminNotice
            ? ""
            : `<p style="margin:0 0 14px 0;font-size:12px;line-height:1.6;"><a href="${escapeHtml(preferencesUrl)}" style="color:#570008;text-decoration:underline;">Review Email &amp; Account Settings</a></p>`
        }`;

  const footerClassificationText =
    params.category === "optional"
      ? `\n\n---\nOptional Email Notice: You received this message because you opted in on ${BRAND_CONTACT.brandName}.${unsubscribeUrl ? `\nUnsubscribe: ${unsubscribeUrl}` : ""}\nManage Email Preferences: ${preferencesUrl}`
      : `\n\n---\n${params.isAdminNotice ? "Essential Admin Security Notice." : `Essential Transactional Notice from ${BRAND_CONTACT.brandName}.`}${params.isAdminNotice ? "" : `\nAccount Settings: ${preferencesUrl}`}`;

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>${escapeHtml(params.subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#FAF5ED;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1F1816;-webkit-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(params.previewText)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#FAF5ED;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background-color:#FFFFFF;border:1px solid #E8DFD1;border-radius:14px;overflow:hidden;box-shadow:0 4px 18px rgba(87,0,8,0.06);">
          <tr>
            <td style="background-color:#570008;padding:22px 26px;border-bottom:3px solid #C89B3C;">
              <p style="margin:0 0 4px 0;font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:#F5DFB0;font-weight:bold;">
                ${escapeHtml(BRAND_CONTACT.organizationName)}
              </p>
              <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.25;color:#FFFFFF;font-weight:bold;">
                ${escapeHtml(BRAND_CONTACT.brandName)}
              </h1>
              <p style="margin:6px 0 0 0;font-size:12px;line-height:1.4;color:#F8EAD3;">
                ${escapeHtml(BRAND_CONTACT.tagline)}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:26px 26px 22px 26px;">
              <div style="margin:0 0 14px 0;">
                <span style="display:inline-block;padding:4px 10px;border-radius:999px;background-color:${badgeBg};border:1px solid ${badgeBorder};font-size:11px;font-weight:bold;letter-spacing:0.4px;color:${badgeColor};text-transform:uppercase;">
                  ${escapeHtml(params.badgeText)}
                </span>
              </div>
              <h2 style="margin:0 0 16px 0;font-family:Georgia,'Times New Roman',serif;font-size:21px;line-height:1.3;color:#1F1816;">
                ${escapeHtml(params.heading)}
              </h2>
              ${greetingHtml}
              ${params.bodyHtml}
              ${ctaHtml}
              ${secondaryHtml}
            </td>
          </tr>
          <tr>
            <td style="background-color:#FBF7F0;padding:18px 26px 22px 26px;border-top:1px solid #E8DFD1;">
              ${footerClassificationHtml}
              <p style="margin:0 0 4px 0;font-size:12px;font-weight:bold;color:#3C2D27;">
                ${escapeHtml(BRAND_CONTACT.brandName)} · ${escapeHtml(BRAND_CONTACT.organizationName)}
              </p>
              <p style="margin:0;font-size:12px;line-height:1.55;color:#786962;">
                <a href="mailto:${escapeHtml(BRAND_CONTACT.email)}" style="color:#570008;text-decoration:none;">${escapeHtml(BRAND_CONTACT.email)}</a>
                &nbsp;·&nbsp;
                <a href="${escapeHtml(BRAND_CONTACT.website)}" style="color:#570008;text-decoration:none;">${escapeHtml(BRAND_CONTACT.websiteLabel)}</a>
                &nbsp;·&nbsp;
                ${escapeHtml(BRAND_CONTACT.location)}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    `${BRAND_CONTACT.brandName} — ${BRAND_CONTACT.organizationName}`,
    BRAND_CONTACT.tagline,
    "",
    `[${params.badgeText}] ${params.heading}`,
    "",
    greetingText + params.bodyText + ctaText + secondaryText,
    footerClassificationText,
    `${BRAND_CONTACT.email} | ${BRAND_CONTACT.websiteLabel} | ${BRAND_CONTACT.location}`,
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");

  return {
    templateId: params.templateId,
    category: params.category,
    subject: params.subject,
    previewText: params.previewText,
    html,
    text,
  };
}

function renderKeyValueRows(
  rows: Array<{ label: string; value: string }>,
): { html: string; text: string } {
  const html = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:14px 0 18px 0;border:1px solid #E8DFD1;border-radius:8px;background-color:#FAF5ED;">
    ${rows
      .map(
        (row, idx) => `<tr>
          <td style="padding:10px 14px;font-size:13px;color:#6E6059;${idx < rows.length - 1 ? "border-bottom:1px solid #E8DFD1;" : ""}width:42%;"><strong>${escapeHtml(row.label)}</strong></td>
          <td style="padding:10px 14px;font-size:13px;color:#1F1816;${idx < rows.length - 1 ? "border-bottom:1px solid #E8DFD1;" : ""}font-weight:600;">${escapeHtml(row.value)}</td>
        </tr>`,
      )
      .join("")}
  </table>`;
  const text = rows.map((row) => `- ${row.label}: ${row.value}`).join("\n");
  return { html, text };
}

export type EmailTemplatePayloads = {
  welcome: {
    recipientName: string;
    appBaseUrl: string;
    preferencesUrl?: string;
  };
  password_reset_code: {
    recipientName: string;
    code: string;
    expiresMinutes?: number;
    audience?: "reader" | "admin";
    appBaseUrl: string;
  };
  password_changed: {
    recipientName: string;
    changedAtIso: string;
    audience?: "reader" | "admin";
    appBaseUrl: string;
    preferencesUrl?: string;
  };
  online_access_confirmed: {
    recipientName: string;
    startsAt: string;
    expiresAt: string;
    accessTypeLabel: string;
    amountLabel: string;
    reference?: string;
    appBaseUrl: string;
    preferencesUrl?: string;
  };
  online_access_expiry_reminder: {
    recipientName: string;
    expiresAt: string;
    daysRemaining: number;
    appBaseUrl: string;
    preferencesUrl?: string;
    unsubscribeUrl?: string;
  };
  online_access_renewed: {
    recipientName: string;
    startsAt: string;
    expiresAt: string;
    amountLabel: string;
    reference?: string;
    appBaseUrl: string;
    preferencesUrl?: string;
  };
  printed_order_received: {
    recipientName: string;
    reference: string;
    quantity: number;
    subtotalKobo: number;
    destinationLabel: string;
    trackingUrl?: string;
    appBaseUrl: string;
    preferencesUrl?: string;
  };
  delivery_quotation_ready: {
    recipientName: string;
    reference: string;
    quantity: number;
    subtotalKobo: number;
    deliveryFeeKobo: number;
    finalTotalKobo: number;
    trackingUrl?: string;
    appBaseUrl: string;
    preferencesUrl?: string;
  };
  printed_payment_confirmed: {
    recipientName: string;
    reference: string;
    quantity: number;
    finalTotalKobo: number;
    trackingUrl?: string;
    appBaseUrl: string;
    preferencesUrl?: string;
  };
  order_dispatched: {
    recipientName: string;
    reference: string;
    courierName: string;
    trackingReference?: string;
    destinationLabel: string;
    trackingUrl?: string;
    appBaseUrl: string;
    preferencesUrl?: string;
  };
  order_delivered: {
    recipientName: string;
    reference: string;
    trackingUrl?: string;
    appBaseUrl: string;
    preferencesUrl?: string;
  };
  admin_announcement: {
    recipientName: string;
    title: string;
    body: string;
    actionPath?: string;
    actionLabel?: string;
    appBaseUrl: string;
    preferencesUrl?: string;
    unsubscribeUrl?: string;
  };
  daily_devotional_reminder: {
    recipientName: string;
    date: string;
    devotionalTitle: string;
    theme: string;
    bibleText?: string;
    appBaseUrl: string;
    preferencesUrl?: string;
    unsubscribeUrl?: string;
  };
};

export function renderEmailTemplate<T extends EmailTemplateId>(
  templateId: T,
  payload: EmailTemplatePayloads[T],
): RenderedEmailTemplate {
  const baseUrl = String(payload.appBaseUrl || "https://cossyteens.com").replace(
    /\/+$/,
    "",
  );

  switch (templateId) {
    case "welcome": {
      const p = payload as EmailTemplatePayloads["welcome"];
      const bodyHtml = `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.65;color:#2E2420;">
        Welcome to <strong>${escapeHtml(BRAND_CONTACT.brandName)}</strong> by ${escapeHtml(BRAND_CONTACT.organizationName)}. Your reader account is ready for daily spiritual focus, character growth, and quiet reflection.
      </p>
      <p style="margin:0 0 14px 0;font-size:15px;line-height:1.65;color:#2E2420;">
        You can read free sample devotionals right away, keep private personal journal notes, or unlock the full 2027 Online Access edition (12 months, ₦3,500, no auto-renewal) whenever you are ready.
      </p>`;
      const bodyText = `Welcome to ${BRAND_CONTACT.brandName} by ${BRAND_CONTACT.organizationName}. Your reader account is ready for daily spiritual focus, character growth, and reflection.\n\nYou can read free sample devotionals right away or explore 2027 Online Access (12 months, ₦3,500) whenever you are ready.`;
      return renderEmailShell({
        templateId,
        category: "transactional",
        subject: `Welcome to ${BRAND_CONTACT.brandName}`,
        previewText:
          "Your reader account is ready. Explore free sample readings and daily tools.",
        badgeText: "Account Created",
        heading: "Welcome to The Balanced Life Devotional",
        recipientName: p.recipientName,
        bodyHtml,
        bodyText,
        ctaLabel: "Open Reader Dashboard",
        ctaUrl: `${baseUrl}/dashboard`,
        appBaseUrl: baseUrl,
        preferencesUrl: p.preferencesUrl,
      });
    }

    case "password_reset_code": {
      const p = payload as EmailTemplatePayloads["password_reset_code"];
      const minutes = p.expiresMinutes ?? 10;
      const isAdmin = p.audience === "admin";
      const safeCode = escapeHtml(p.code);
      const bodyHtml = `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.65;color:#2E2420;">
        Use this six-digit verification code in the ${isAdmin ? "Balanced Life Admin Portal" : "Balanced Life Devotional app"} to verify your identity and set a new password:
      </p>
      <div style="margin:18px 0;padding:18px 14px;background-color:#FAF5ED;border:2px solid #C89B3C;border-radius:10px;text-align:center;">
        <p style="margin:0 0 6px 0;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#6E6059;font-weight:bold;">
          One-Time Verification Code
        </p>
        <p style="margin:0;font-family:'Courier New',Courier,monospace;font-size:32px;line-height:1.2;letter-spacing:8px;font-weight:bold;color:#570008;">
          ${safeCode}
        </p>
        <p style="margin:8px 0 0 0;font-size:12px;color:#574A44;">
          Expires in ${minutes} minutes · Single use only
        </p>
      </div>
      <p style="margin:0 0 10px 0;font-size:14px;line-height:1.6;color:#2E2420;">
        <strong>Keep this code private.</strong> Never share it with anyone, and never respond to anyone asking for this code.
      </p>`;
      const bodyText = `Use this six-digit verification code in the ${isAdmin ? "Balanced Life Admin Portal" : "Balanced Life Devotional app"} to set a new password:\n\nVerification Code: ${p.code}\nExpires in: ${minutes} minutes (single use only)\n\nNever share this code with anyone.`;
      return renderEmailShell({
        templateId,
        category: "transactional",
        subject: isAdmin
          ? "Balanced Life Admin: Your 6-digit password reset code"
          : "Your Balanced Life Devotional password reset code",
        previewText: `Use your 6-digit verification code within ${minutes} minutes.`,
        badgeText: isAdmin ? "Admin Security Code" : "Security Verification Code",
        heading: "Password Reset Verification Code",
        recipientName: p.recipientName,
        bodyHtml,
        bodyText,
        secondaryNote: isAdmin
          ? "If you did not request an administrator password reset, ignore this email and review your admin security log immediately. Two-factor authenticator verification remains mandatory at sign-in."
          : "If you did not request a password reset, you can safely ignore this email—your existing password remains unchanged.",
        appBaseUrl: baseUrl,
        isAdminNotice: isAdmin,
      });
    }

    case "password_changed": {
      const p = payload as EmailTemplatePayloads["password_changed"];
      const isAdmin = p.audience === "admin";
      const when = formatEmailDate(p.changedAtIso);
      const bodyHtml = `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.65;color:#2E2420;">
        Your ${isAdmin ? "administrator portal" : "Balanced Life Devotional"} password was changed on <strong>${escapeHtml(when)}</strong>. Active sessions were signed out for your security.
      </p>
      <p style="margin:0 0 14px 0;font-size:14px;line-height:1.6;color:#574A44;">
        If you made this change, no further action is needed. If you did not recognize this activity, reset your password immediately and contact ${escapeHtml(BRAND_CONTACT.email)}.
      </p>`;
      const bodyText = `Your ${isAdmin ? "administrator portal" : "Balanced Life Devotional"} password was changed on ${when}. Active sessions were signed out for your security.\n\nIf you did not make this change, contact ${BRAND_CONTACT.email} immediately.`;
      return renderEmailShell({
        templateId,
        category: "transactional",
        subject: isAdmin
          ? "Balanced Life Admin: Password changed"
          : "Your Balanced Life Devotional password was changed",
        previewText:
          "Your password was updated and previous active sessions were signed out.",
        badgeText: "Security Confirmation",
        heading: "Password Successfully Changed",
        recipientName: p.recipientName,
        bodyHtml,
        bodyText,
        ctaLabel: isAdmin ? "Sign In to Admin Portal" : "Sign In to Reader App",
        ctaUrl: isAdmin ? `${baseUrl}/login` : `${baseUrl}/login`,
        appBaseUrl: baseUrl,
        preferencesUrl: p.preferencesUrl,
        isAdminNotice: isAdmin,
      });
    }

    case "online_access_confirmed": {
      const p = payload as EmailTemplatePayloads["online_access_confirmed"];
      const kv = renderKeyValueRows([
        { label: "Edition", value: "2027 Online Access (12 Months)" },
        { label: "Access Type", value: p.accessTypeLabel },
        { label: "Amount", value: p.amountLabel },
        { label: "Active From", value: formatEmailDate(p.startsAt) },
        { label: "Valid Until", value: formatEmailDate(p.expiresAt) },
        ...(p.reference ? [{ label: "Reference", value: p.reference }] : []),
      ]);
      const bodyHtml = `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.65;color:#2E2420;">
        Your 12-month <strong>2027 Online Access</strong> for ${escapeHtml(BRAND_CONTACT.brandName)} is confirmed. There is no automatic recurring renewal fee.
      </p>
      ${kv.html}`;
      const bodyText = `Your 12-month 2027 Online Access for ${BRAND_CONTACT.brandName} is confirmed. There is no automatic recurring renewal.\n\n${kv.text}`;
      return renderEmailShell({
        templateId,
        category: "transactional",
        subject: "Your 2027 Online Access Is Confirmed",
        previewText:
          "12-month online devotional access is now confirmed on your account.",
        badgeText: "Online Access Confirmed",
        heading: "2027 Online Access Confirmed",
        recipientName: p.recipientName,
        bodyHtml,
        bodyText,
        ctaLabel: "Open Devotional Library",
        ctaUrl: `${baseUrl}/library`,
        appBaseUrl: baseUrl,
        preferencesUrl: p.preferencesUrl,
      });
    }

    case "online_access_expiry_reminder": {
      const p = payload as EmailTemplatePayloads["online_access_expiry_reminder"];
      const bodyHtml = `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.65;color:#2E2420;">
        Your 12-month <strong>2027 Online Access</strong> has <strong>${p.daysRemaining} day${p.daysRemaining === 1 ? "" : "s"}</strong> remaining and will end on <strong>${escapeHtml(formatEmailDate(p.expiresAt))}</strong>.
      </p>
      <p style="margin:0 0 14px 0;font-size:15px;line-height:1.65;color:#2E2420;">
        Because online access is one-time for 12 months (no automatic charge), you can choose when to renew in the app.
      </p>`;
      const bodyText = `Your 12-month 2027 Online Access has ${p.daysRemaining} day(s) remaining and ends on ${formatEmailDate(p.expiresAt)}.\n\nThere is no automatic recurring charge—you can renew inside the app whenever you choose.`;
      return renderEmailShell({
        templateId,
        category: "optional",
        subject: `Reminder: ${p.daysRemaining} day${p.daysRemaining === 1 ? "" : "s"} left on your Online Access`,
        previewText: `Your 2027 Online Access ends on ${formatEmailDate(p.expiresAt)}.`,
        badgeText: "Access Expiry Reminder",
        heading: "Your Online Access Ends Soon",
        recipientName: p.recipientName,
        bodyHtml,
        bodyText,
        ctaLabel: "Review Renewal Options",
        ctaUrl: `${baseUrl}/digital-edition`,
        appBaseUrl: baseUrl,
        preferencesUrl: p.preferencesUrl,
        unsubscribeUrl: p.unsubscribeUrl,
      });
    }

    case "online_access_renewed": {
      const p = payload as EmailTemplatePayloads["online_access_renewed"];
      const kv = renderKeyValueRows([
        { label: "Edition", value: "2027 Online Access Renewal (12 Months)" },
        { label: "Amount", value: p.amountLabel },
        { label: "Term Starts", value: formatEmailDate(p.startsAt) },
        { label: "New Expiry Date", value: formatEmailDate(p.expiresAt) },
        ...(p.reference ? [{ label: "Reference", value: p.reference }] : []),
      ]);
      const bodyHtml = `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.65;color:#2E2420;">
        Your online devotional access has been renewed for another 12 calendar months with no automatic recurring charges.
      </p>
      ${kv.html}`;
      const bodyText = `Your online devotional access has been renewed for 12 calendar months.\n\n${kv.text}`;
      return renderEmailShell({
        templateId,
        category: "transactional",
        subject: "Online Access Renewed — 12 More Months Confirmed",
        previewText: `Your renewed online access now runs until ${formatEmailDate(p.expiresAt)}.`,
        badgeText: "Access Renewed",
        heading: "Your Online Access Is Renewed",
        recipientName: p.recipientName,
        bodyHtml,
        bodyText,
        ctaLabel: "Continue Reading",
        ctaUrl: `${baseUrl}/library`,
        appBaseUrl: baseUrl,
        preferencesUrl: p.preferencesUrl,
      });
    }

    case "printed_order_received": {
      const p = payload as EmailTemplatePayloads["printed_order_received"];
      const kv = renderKeyValueRows([
        { label: "Order Reference", value: p.reference },
        { label: "Quantity", value: `${p.quantity} Printed Copy${p.quantity === 1 ? "" : "ies"}` },
        { label: "Books Subtotal", value: formatNairaFromKobo(p.subtotalKobo) },
        { label: "Destination Area", value: p.destinationLabel },
        { label: "Status", value: "Awaiting Delivery Quotation" },
      ]);
      const bodyHtml = `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.65;color:#2E2420;">
        We have received your printed copy request for <strong>${escapeHtml(BRAND_CONTACT.brandName)}</strong>. Our team will calculate your exact delivery fee and notify you when your quotation is ready for payment.
      </p>
      ${kv.html}`;
      const bodyText = `We received your printed copy order (${p.reference}).\n\n${kv.text}\n\nWe will email you once your delivery quotation is ready.`;
      return renderEmailShell({
        templateId,
        category: "transactional",
        subject: `Printed Order Received (${p.reference})`,
        previewText: `Order ${p.reference} received and awaiting delivery quotation.`,
        badgeText: "Printed Book Order",
        heading: "Printed Book Order Received",
        recipientName: p.recipientName,
        bodyHtml,
        bodyText,
        ctaLabel: "Track Order Status",
        ctaUrl: p.trackingUrl || `${baseUrl}/printed-order`,
        appBaseUrl: baseUrl,
        preferencesUrl: p.preferencesUrl,
      });
    }

    case "delivery_quotation_ready": {
      const p = payload as EmailTemplatePayloads["delivery_quotation_ready"];
      const kv = renderKeyValueRows([
        { label: "Order Reference", value: p.reference },
        { label: "Quantity", value: `${p.quantity} Copy${p.quantity === 1 ? "" : "ies"}` },
        { label: "Books Subtotal", value: formatNairaFromKobo(p.subtotalKobo) },
        { label: "Delivery Fee", value: formatNairaFromKobo(p.deliveryFeeKobo) },
        { label: "Final Total Due", value: formatNairaFromKobo(p.finalTotalKobo) },
      ]);
      const bodyHtml = `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.65;color:#2E2420;">
        Your delivery fee has been quoted for printed order <strong>${escapeHtml(p.reference)}</strong>. Please review the final total below and open your order page to complete payment.
      </p>
      ${kv.html}`;
      const bodyText = `Your delivery quotation is ready for order ${p.reference}.\n\n${kv.text}`;
      return renderEmailShell({
        templateId,
        category: "transactional",
        subject: `Delivery Quotation Ready for Order ${p.reference}`,
        previewText: `Final total ${formatNairaFromKobo(p.finalTotalKobo)} is ready for review.`,
        badgeText: "Quotation Ready",
        heading: "Your Delivery Quotation Is Ready",
        recipientName: p.recipientName,
        bodyHtml,
        bodyText,
        ctaLabel: "Review Quote & Complete Order",
        ctaUrl: p.trackingUrl || `${baseUrl}/printed-order`,
        appBaseUrl: baseUrl,
        preferencesUrl: p.preferencesUrl,
      });
    }

    case "printed_payment_confirmed": {
      const p = payload as EmailTemplatePayloads["printed_payment_confirmed"];
      const kv = renderKeyValueRows([
        { label: "Order Reference", value: p.reference },
        { label: "Quantity", value: `${p.quantity} Copy${p.quantity === 1 ? "" : "ies"}` },
        { label: "Total Confirmed", value: formatNairaFromKobo(p.finalTotalKobo) },
        { label: "Fulfillment Stage", value: "Preparing for Dispatch" },
      ]);
      const bodyHtml = `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.65;color:#2E2420;">
        Thank you! Your payment for printed devotional order <strong>${escapeHtml(p.reference)}</strong> has been confirmed and queued for packaging and dispatch.
      </p>
      ${kv.html}`;
      const bodyText = `Payment confirmed for printed devotional order ${p.reference}.\n\n${kv.text}`;
      return renderEmailShell({
        templateId,
        category: "transactional",
        subject: `Payment Confirmed for Printed Order ${p.reference}`,
        previewText: `Your printed order ${p.reference} is being prepared for dispatch.`,
        badgeText: "Payment Confirmed",
        heading: "Printed Order Payment Confirmed",
        recipientName: p.recipientName,
        bodyHtml,
        bodyText,
        ctaLabel: "View Order Tracking",
        ctaUrl: p.trackingUrl || `${baseUrl}/printed-order`,
        appBaseUrl: baseUrl,
        preferencesUrl: p.preferencesUrl,
      });
    }

    case "order_dispatched": {
      const p = payload as EmailTemplatePayloads["order_dispatched"];
      const kv = renderKeyValueRows([
        { label: "Order Reference", value: p.reference },
        { label: "Courier", value: p.courierName || "Assigned Courier" },
        ...(p.trackingReference
          ? [{ label: "Tracking Number", value: p.trackingReference }]
          : []),
        { label: "Destination Area", value: p.destinationLabel },
      ]);
      const bodyHtml = `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.65;color:#2E2420;">
        Good news—your printed copy order <strong>${escapeHtml(p.reference)}</strong> has been dispatched!
      </p>
      ${kv.html}`;
      const bodyText = `Your printed order ${p.reference} has been dispatched.\n\n${kv.text}`;
      return renderEmailShell({
        templateId,
        category: "transactional",
        subject: `Order Dispatched (${p.reference})`,
        previewText: `Your printed order ${p.reference} is on its way.`,
        badgeText: "Dispatched",
        heading: "Your Printed Book Order Is On the Way",
        recipientName: p.recipientName,
        bodyHtml,
        bodyText,
        ctaLabel: "View Delivery Details",
        ctaUrl: p.trackingUrl || `${baseUrl}/printed-order`,
        appBaseUrl: baseUrl,
        preferencesUrl: p.preferencesUrl,
      });
    }

    case "order_delivered": {
      const p = payload as EmailTemplatePayloads["order_delivered"];
      const bodyHtml = `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.65;color:#2E2420;">
        Your printed order <strong>${escapeHtml(p.reference)}</strong> for ${escapeHtml(BRAND_CONTACT.brandName)} has been marked as <strong>Delivered</strong>.
      </p>
      <p style="margin:0 0 14px 0;font-size:15px;line-height:1.65;color:#2E2420;">
        We pray each daily devotion encourages your walk with God and strengthens balanced growth throughout the year. If anything needs attention, write to <a href="mailto:${escapeHtml(BRAND_CONTACT.email)}" style="color:#570008;">${escapeHtml(BRAND_CONTACT.email)}</a>.
      </p>`;
      const bodyText = `Your printed order ${p.reference} has been delivered. If anything needs attention, write to ${BRAND_CONTACT.email}.`;
      return renderEmailShell({
        templateId,
        category: "transactional",
        subject: `Order Delivered (${p.reference})`,
        previewText: `Printed order ${p.reference} has been marked delivered.`,
        badgeText: "Delivered",
        heading: "Your Printed Order Was Delivered",
        recipientName: p.recipientName,
        bodyHtml,
        bodyText,
        ctaLabel: "Open Order Summary",
        ctaUrl: p.trackingUrl || `${baseUrl}/printed-order`,
        appBaseUrl: baseUrl,
        preferencesUrl: p.preferencesUrl,
      });
    }

    case "admin_announcement": {
      const p = payload as EmailTemplatePayloads["admin_announcement"];
      const cleanTitle = sanitizePlainText(p.title, 160);
      const renderedBody = renderSafeEmailParagraphs(p.body);
      const safeActionPath =
        p.actionPath && p.actionPath.startsWith("/") && !p.actionPath.startsWith("//")
          ? p.actionPath
          : "/dashboard";
      return renderEmailShell({
        templateId,
        category: "optional",
        subject: cleanTitle,
        previewText: renderedBody.plainText.slice(0, 140),
        badgeText: "Community Update",
        heading: cleanTitle,
        recipientName: p.recipientName,
        bodyHtml: renderedBody.html,
        bodyText: renderedBody.plainText,
        ctaLabel: p.actionLabel || "Open Balanced Life App",
        ctaUrl: `${baseUrl}${safeActionPath}`,
        appBaseUrl: baseUrl,
        preferencesUrl: p.preferencesUrl,
        unsubscribeUrl: p.unsubscribeUrl,
      });
    }

    case "daily_devotional_reminder": {
      const p = payload as EmailTemplatePayloads["daily_devotional_reminder"];
      const bodyHtml = `<p style="margin:0 0 12px 0;font-size:15px;line-height:1.65;color:#2E2420;">
        Take a few quiet minutes today to read and reflect on your devotional entry for <strong>${escapeHtml(formatEmailDate(p.date))}</strong>.
      </p>
      <div style="margin:14px 0 18px 0;padding:16px 18px;background-color:#FAF5ED;border:1px solid #E8DFD1;border-left:4px solid #570008;border-radius:8px;">
        <p style="margin:0 0 4px 0;font-size:11px;letter-spacing:0.8px;text-transform:uppercase;color:#7B111A;font-weight:bold;">
          ${escapeHtml(p.theme)}
        </p>
        <p style="margin:0 0 6px 0;font-family:Georgia,'Times New Roman',serif;font-size:18px;line-height:1.35;color:#1F1816;font-weight:bold;">
          ${escapeHtml(p.devotionalTitle)}
        </p>
        ${
          p.bibleText
            ? `<p style="margin:0;font-size:13px;color:#574A44;">Scripture Reading: ${escapeHtml(p.bibleText)}</p>`
            : ""
        }
      </div>`;
      const bodyText = `Daily Devotional Reminder for ${formatEmailDate(p.date)}\n\nTheme: ${p.theme}\nTitle: ${p.devotionalTitle}${p.bibleText ? `\nScripture: ${p.bibleText}` : ""}`;
      return renderEmailShell({
        templateId,
        category: "optional",
        subject: `Today's Devotional: ${sanitizePlainText(p.devotionalTitle, 110)}`,
        previewText: `${p.theme} — ${p.devotionalTitle}`,
        badgeText: "Daily Reading Reminder",
        heading: "Today's Devotional Reading",
        recipientName: p.recipientName,
        bodyHtml,
        bodyText,
        ctaLabel: "Read Today's Devotional",
        ctaUrl: `${baseUrl}/library`,
        appBaseUrl: baseUrl,
        preferencesUrl: p.preferencesUrl,
        unsubscribeUrl: p.unsubscribeUrl,
      });
    }
  }
}

export function buildSampleTemplatePreview(
  templateId: EmailTemplateId,
  appBaseUrl = "https://cossyteens.com",
): RenderedEmailTemplate {
  const samplePrefs = `${appBaseUrl.replace(/\/+$/, "")}/account`;
  const sampleUnsub = `${appBaseUrl.replace(/\/+$/, "")}/unsubscribe?sample=1`;
  const nowIso = "2027-02-01T09:00:00.000Z";
  const nextYearIso = "2028-02-01T08:59:59.000Z";

  const sampleData: EmailTemplatePayloads = {
    welcome: {
      recipientName: "Chisom Okafor",
      appBaseUrl,
      preferencesUrl: samplePrefs,
    },
    password_reset_code: {
      recipientName: "Chisom Okafor",
      code: "482915",
      expiresMinutes: 10,
      audience: "reader",
      appBaseUrl,
    },
    password_changed: {
      recipientName: "Chisom Okafor",
      changedAtIso: nowIso,
      audience: "reader",
      appBaseUrl,
      preferencesUrl: samplePrefs,
    },
    online_access_confirmed: {
      recipientName: "Chisom Okafor",
      startsAt: nowIso,
      expiresAt: nextYearIso,
      accessTypeLabel: "2027 Paid Online Access",
      amountLabel: "₦3,500",
      reference: "BLD-DIG-SAMPLE01",
      appBaseUrl,
      preferencesUrl: samplePrefs,
    },
    online_access_expiry_reminder: {
      recipientName: "Chisom Okafor",
      expiresAt: nextYearIso,
      daysRemaining: 14,
      appBaseUrl,
      preferencesUrl: samplePrefs,
      unsubscribeUrl: sampleUnsub,
    },
    online_access_renewed: {
      recipientName: "Chisom Okafor",
      startsAt: nextYearIso,
      expiresAt: "2029-02-01T08:59:59.000Z",
      amountLabel: "₦3,500",
      reference: "BLD-REN-SAMPLE02",
      appBaseUrl,
      preferencesUrl: samplePrefs,
    },
    printed_order_received: {
      recipientName: "Chisom Okafor",
      reference: "BLD-PRT-SAMPLE03",
      quantity: 2,
      subtotalKobo: 1000000,
      destinationLabel: "Garki, Abuja",
      appBaseUrl,
      preferencesUrl: samplePrefs,
    },
    delivery_quotation_ready: {
      recipientName: "Chisom Okafor",
      reference: "BLD-PRT-SAMPLE03",
      quantity: 2,
      subtotalKobo: 1000000,
      deliveryFeeKobo: 250000,
      finalTotalKobo: 1250000,
      appBaseUrl,
      preferencesUrl: samplePrefs,
    },
    printed_payment_confirmed: {
      recipientName: "Chisom Okafor",
      reference: "BLD-PRT-SAMPLE03",
      quantity: 2,
      finalTotalKobo: 1250000,
      appBaseUrl,
      preferencesUrl: samplePrefs,
    },
    order_dispatched: {
      recipientName: "Chisom Okafor",
      reference: "BLD-PRT-SAMPLE03",
      courierName: "GIG Logistics",
      trackingReference: "GIG-884210",
      destinationLabel: "Garki, Abuja",
      appBaseUrl,
      preferencesUrl: samplePrefs,
    },
    order_delivered: {
      recipientName: "Chisom Okafor",
      reference: "BLD-PRT-SAMPLE03",
      appBaseUrl,
      preferencesUrl: samplePrefs,
    },
    admin_announcement: {
      recipientName: "Chisom Okafor",
      title: "February Youth Mentorship & Reading Focus",
      body: "New reflections on building wise daily habits are open in your library this week.\n\nSet aside 10 quiet minutes each morning to read, pray, and record one takeaway in your personal journal.",
      actionPath: "/library",
      actionLabel: "Open Devotional Library",
      appBaseUrl,
      preferencesUrl: samplePrefs,
      unsubscribeUrl: sampleUnsub,
    },
    daily_devotional_reminder: {
      recipientName: "Chisom Okafor",
      date: "2027-02-01",
      devotionalTitle: "Standing Firm in Everyday Choices",
      theme: "Godliness & Purpose",
      bibleText: "Daniel 1:8–20",
      appBaseUrl,
      preferencesUrl: samplePrefs,
      unsubscribeUrl: sampleUnsub,
    },
  };

  return renderEmailTemplate(templateId, sampleData[templateId]);
}


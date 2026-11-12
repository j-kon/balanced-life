import { mkdirSync } from "node:fs";
import path from "node:path";
import { createHmac, randomBytes, scryptSync } from "node:crypto";
import Database from "better-sqlite3";
import { test, expect } from "@playwright/test";

function hashTestPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

function generateTestTotp(secretBase32: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const cleaned = secretBase32.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of cleaned) {
    const idx = alphabet.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  const counter = Math.floor(Date.now() / 1000 / 30);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter), 0);
  const hmac = createHmac("sha1", Buffer.from(bytes)).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

const backendDir = path.resolve(import.meta.dirname, "../../backend");
const configuredDbPath = process.env.DATABASE_PATH?.trim();
const dbPath = configuredDbPath
  ? path.isAbsolute(configuredDbPath)
    ? configuredDbPath
    : path.resolve(backendDir, configuredDbPath)
  : path.resolve(backendDir, "data/devotional.sqlite");

const ADMIN_URL = "http://127.0.0.1:5174";
const adminEmail = "admin-e2e@cossyteens.org";
const adminPassword = "AdminPass!2027Secure";
const readerEmail = "reader-e2e@cossyteens.org";
const readerPassword = "ReaderPass!2027Secure";
const readerUpdatedPassword = "ReaderNewPass!2027Secure";
let e2eAdminMfaSecret = "";

const stateReaderEmail = "state-e2e@cossyteens.org";
const stateReaderPassword = "StatePass!2027Secure";
const pwaReaderEmail = "pwa-e2e@cossyteens.org";
const pwaReaderPassword = "PwaReader!2027Secure";
const auditReaderEmail = "audit-e2e@cossyteens.org";
const auditReaderPassword = "AuditReader!2027Secure";

function cleanupTestRecords(sqlite: Database.Database) {
  const testUsers = sqlite
    .prepare(`SELECT id FROM users WHERE email IN (?, ?, ?, ?, ?)`)
    .all(
      adminEmail,
      readerEmail,
      stateReaderEmail,
      pwaReaderEmail,
      auditReaderEmail,
    ) as {
    id: number;
  }[];
  const ids = testUsers.map((u) => u.id);
  for (const id of ids) {
    sqlite.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(id);
    sqlite.prepare(`DELETE FROM journal_entries WHERE user_id = ?`).run(id);
    sqlite.prepare(`DELETE FROM reading_progress WHERE user_id = ?`).run(id);
    sqlite.prepare(`DELETE FROM bookmarks WHERE user_id = ?`).run(id);
    sqlite.prepare(`DELETE FROM payments WHERE user_id = ?`).run(id);
    sqlite.prepare(`DELETE FROM digital_entitlements WHERE user_id = ?`).run(id);
    sqlite.prepare(`DELETE FROM digital_purchases WHERE user_id = ?`).run(id);
    sqlite
      .prepare(`DELETE FROM notification_preferences WHERE user_id = ?`)
      .run(id);
    sqlite
      .prepare(`DELETE FROM admin_notification_campaign_recipients WHERE user_id = ?`)
      .run(id);
    sqlite.prepare(`DELETE FROM notification_events WHERE user_id = ?`).run(id);
    sqlite.prepare(`DELETE FROM push_subscriptions WHERE user_id = ?`).run(id);
    sqlite.prepare(`DELETE FROM subscriptions WHERE user_id = ?`).run(id);
    sqlite.prepare(`DELETE FROM admin_audit_logs WHERE legacy_user_admin_id = ?`).run(id);
    sqlite
      .prepare(`DELETE FROM password_reset_tokens WHERE user_id = ?`)
      .run(id);
    sqlite.prepare(`DELETE FROM users WHERE id = ?`).run(id);
  }
  const testAdmins = sqlite
    .prepare(
      `SELECT id, email FROM admin_users WHERE email = ? OR email LIKE 'e2e-editor-%@cossyteens.com'`,
    )
    .all(adminEmail) as { id: number; email: string }[];
  for (const adm of testAdmins) {
    sqlite
      .prepare(
        `DELETE FROM admin_notification_campaign_recipients WHERE campaign_id IN (SELECT id FROM admin_notification_campaigns WHERE created_by_admin_id = ? OR actor_email = ?)`,
      )
      .run(adm.id, adm.email);
    sqlite
      .prepare(
        `DELETE FROM admin_notification_campaigns WHERE created_by_admin_id = ? OR actor_email = ?`,
      )
      .run(adm.id, adm.email);
    sqlite.prepare(`DELETE FROM admin_sessions WHERE admin_id = ?`).run(adm.id);
    sqlite.prepare(`DELETE FROM admin_mfa_recovery_codes WHERE admin_id = ?`).run(adm.id);
    sqlite.prepare(`DELETE FROM admin_password_reset_tokens WHERE admin_id = ?`).run(adm.id);
    sqlite.prepare(`DELETE FROM admin_audit_logs WHERE admin_id = ? OR actor_email = ?`).run(adm.id, adm.email);
    sqlite.prepare(`DELETE FROM subscriptions WHERE granted_by_admin_id = ?`).run(adm.id);
    sqlite.prepare(`DELETE FROM digital_entitlements WHERE granted_by_admin_id = ?`).run(adm.id);
    sqlite.prepare(`DELETE FROM digital_purchases WHERE verified_by_admin_id = ?`).run(adm.id);
    sqlite.prepare(`DELETE FROM printed_orders WHERE verified_by_admin_id = ?`).run(adm.id);
    sqlite.prepare(`DELETE FROM admin_users WHERE id = ?`).run(adm.id);
  }
  sqlite
    .prepare(
      `DELETE FROM admin_notification_campaign_recipients WHERE campaign_id IN (SELECT id FROM admin_notification_campaigns WHERE actor_email = ?)`,
    )
    .run(adminEmail);
  sqlite
    .prepare(`DELETE FROM admin_notification_campaigns WHERE actor_email = ?`)
    .run(adminEmail);
  sqlite
    .prepare(`DELETE FROM admin_audit_logs WHERE actor_email = ?`)
    .run(adminEmail);
  sqlite
    .prepare(`DELETE FROM hardcover_inquiries WHERE email = ?`)
    .run(readerEmail);
  sqlite
    .prepare(
      `DELETE FROM printed_order_items WHERE order_id IN (SELECT id FROM printed_orders WHERE email = ?)`,
    )
    .run(readerEmail);
  sqlite.prepare(`DELETE FROM printed_orders WHERE email = ?`).run(readerEmail);
  sqlite.prepare(`DELETE FROM bulk_orders WHERE email = ?`).run(readerEmail);
  sqlite
    .prepare(
      `UPDATE devotionals SET published = 0, review_status = 'pending_review', reviewed_at = NULL WHERE date = '2027-01-08'`,
    )
    .run();
}

function ensureSeededE2EDevotionals(sqlite: Database.Database, now: string) {
  const seedEntries = [
    {
      date: "2027-01-01",
      title: "THANK GOD, WE MADE IT.",
      sample: 1,
      published: 1,
      reviewStatus: "approved",
      reviewedAt: now,
    },
    {
      date: "2027-01-02",
      title: "Walk with Wisdom",
      sample: 0,
      published: 1,
      reviewStatus: "approved",
      reviewedAt: now,
    },
    {
      date: "2027-01-03",
      title: "Created with Purpose",
      sample: 0,
      published: 1,
      reviewStatus: "approved",
      reviewedAt: now,
    },
    {
      date: "2027-01-04",
      title: "Intentional Habits",
      sample: 0,
      published: 1,
      reviewStatus: "approved",
      reviewedAt: now,
    },
    {
      date: "2027-01-05",
      title: "Guarding Your Heart",
      sample: 0,
      published: 1,
      reviewStatus: "approved",
      reviewedAt: now,
    },
    {
      date: "2027-01-06",
      title: "Growing in Truth",
      sample: 0,
      published: 1,
      reviewStatus: "approved",
      reviewedAt: now,
    },
    {
      date: "2027-01-07",
      title: "Steady Faithfulness",
      sample: 0,
      published: 1,
      reviewStatus: "approved",
      reviewedAt: now,
    },
    {
      date: "2027-01-08",
      title: "Courage to Obey",
      sample: 0,
      published: 0,
      reviewStatus: "pending_review",
      reviewedAt: null as string | null,
    },
  ];

  const insertStmt = sqlite.prepare(
    `INSERT INTO devotionals (
      date, title, theme, bible_text, memory_verse, reflection, think_about, prayer, challenge,
      sample, published, source_pages, created_at, updated_at, review_status, reviewer_notes, reviewed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'e2e-seed', ?, ?, ?, '', ?)`,
  );

  for (const entry of seedEntries) {
    const existing = sqlite
      .prepare(`SELECT id FROM devotionals WHERE date = ?`)
      .get(entry.date);
    if (!existing) {
      insertStmt.run(
        entry.date,
        entry.title,
        "Gratitude, Identity & Intentionality",
        "Psalm 118:22-23 · Psalm 1:1-6",
        "This is the day the Lord has made; we will rejoice and be glad in it. — Psalm 118:24",
        `Synthetic E2E devotional reflection for ${entry.date} verifying reading flow, gating, and journal accountability.`,
        `How will you practice ${entry.title.toLowerCase()} in your decisions today?`,
        "Lord Jesus, anchor my heart in Your Word and help me walk with wisdom and grace today. Amen.",
        "Read the Scripture text carefully, record one takeaway, and apply one action step before bedtime.",
        entry.sample,
        entry.published,
        now,
        now,
        entry.reviewStatus,
        entry.reviewedAt,
      );
    }
  }
}

test.beforeAll(() => {
  const sqlite = new Database(dbPath);
  cleanupTestRecords(sqlite);
  const now = new Date().toISOString();
  ensureSeededE2EDevotionals(sqlite, now);
  sqlite
    .prepare(
      `INSERT INTO admin_users (name, email, password_hash, role, status, suspended_reason, mfa_enabled, created_at, updated_at)
       VALUES (?, ?, ?, 'owner', 'active', '', 0, ?, ?)`,
    )
    .run(
      "E2E Test Administrator",
      adminEmail,
      hashTestPassword(adminPassword),
      now,
      now,
    );
  sqlite.close();
});

test.afterAll(() => {
  const sqlite = new Database(dbPath);
  cleanupTestRecords(sqlite);
  sqlite.prepare(`DELETE FROM devotionals WHERE source_pages = 'e2e-seed'`).run();
  sqlite.close();
});

test.describe("End-to-End Production Workflows", () => {
  test.describe.configure({ mode: "serial" });

  test("1. Public pages, owner homepage narrative, commerce pages, printed book inquiry, bulk orders, and mobile PWA viewports", async ({
    page,
  }) => {
    // Desktop viewport
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto("/");

    // Verify no demo banner or quick login shortcuts exist
    await expect(page.locator(".preview-bar")).toHaveCount(0);
    await expect(page.getByText(/quick-login|demo mode/i)).toHaveCount(0);

    // Verify owner's approved homepage headline, organization, and simplified 2-option offering
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: /Growing up is a journey\. Make every day count\./i,
      }),
    ).toBeVisible();
    await expect(
      page.getByText(/Cossy Teens Consult Enterprises/i).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /One devotional\. Two ways to grow\./i }),
    ).toBeVisible();

    // Navigate public pages
    await page.goto("/about");
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: /Growing up is a journey\. Make every day count\./i,
      }),
    ).toBeVisible();

    await page.goto("/about-author");
    await expect(
      page.getByRole("heading", {
        name: /Mrs\. Adindu Ogechukwu Constance Nwisi/i,
      }),
    ).toBeVisible();

    await page.goto("/themes");
    await expect(
      page.getByRole("heading", { name: /Twelve months of holistic growth/i }),
    ).toBeVisible();

    await page.goto("/pricing");
    await expect(
      page.getByRole("heading", {
        name: /One devotional\. Two ways to grow\./i,
      }),
    ).toBeVisible();

    await page.goto("/digital-edition");
    await expect(
      page.getByRole("heading", {
        name: /Your 2027 online access/i,
      }),
    ).toBeVisible();
    await expect(page.getByText(/₦3,500/i).first()).toBeVisible();

    await page.goto("/contact");
    await expect(
      page.getByRole("heading", { name: /Connect with/i }),
    ).toBeVisible();
    await expect(
      page.getByText(/cossyteensconsult@gmail\.com/i).first(),
    ).toBeVisible();
    await expect(page.getByText("Abuja, Nigeria").first()).toBeVisible();

    await page.goto("/privacy");
    await expect(
      page.getByRole("heading", { name: /Privacy Policy/i }),
    ).toBeVisible();

    await page.goto("/terms");
    await expect(
      page.getByRole("heading", { name: /Terms of Use/i }),
    ).toBeVisible();

    await page.goto("/install");
    await expect(
      page.getByRole("heading", { name: /Install .* on Your Phone/i }),
    ).toBeVisible();

    await page.goto("/forgot-password");
    await expect(
      page.getByRole("heading", { name: /Forgot password/i }),
    ).toBeVisible();

    // Submit printed book order on /bookstore
    await page.goto("/bookstore");
    await expect(
      page.getByRole("heading", { name: /The printed companion/i }),
    ).toBeVisible();
    await expect(page.getByText(/₦5,000/i).first()).toBeVisible();
    const orderForm = page
      .locator("form")
      .filter({ hasText: /Order Printed Copies/i });
    await orderForm.getByLabel(/Full name/i).fill("E2E Reader");
    await orderForm.getByLabel(/Email address/i).fill(readerEmail);
    await orderForm
      .getByLabel(/Phone \/ WhatsApp number/i)
      .fill("+2348000000001");
    await orderForm.getByLabel(/Quantity \(copies\)/i).fill("3");
    await orderForm
      .getByLabel(/Delivery street address/i)
      .fill("15 Victoria Island Way");
    await orderForm.getByLabel(/City \/ Town/i).fill("Lagos");
    await orderForm.getByLabel(/State \/ Province/i).fill("Lagos");
    await orderForm
      .getByLabel(/Delivery instructions/i)
      .fill("Requesting 3 printed copies for youth fellowship.");
    await orderForm
      .getByRole("button", { name: /Place Printed Book Order/i })
      .click();
    await expect(
      page.getByText(/Inventory unconfigured/i),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Order BLD-PRT-/i }),
    ).toBeVisible();
    await expect(
      page.getByText(/Keep your private Order Access Token safe/i),
    ).toBeVisible();
    await expect(page.getByText(/₦15,000/i).first()).toBeVisible();

    // Verify /bulk-orders redirects to /contact
    await page.goto("/bulk-orders");
    await expect(page).toHaveURL(/\/contact$/);
    await expect(
      page.getByRole("heading", { name: /Connect with/i }),
    ).toBeVisible();

    // Mobile PWA & Tablet responsive verification across 768px, 430px, 390px, and 360px
    await page.goto("/");
    for (const width of [768, 430, 390, 360]) {
      await page.setViewportSize({ width, height: 844 });
      await expect(page.locator(".menu-toggle")).toBeVisible();
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
      );
      expect(overflow, `Horizontal overflow at ${width}px`).toBe(false);
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator(".menu-toggle").click();
    await expect(page.locator(".public-nav.open")).toBeVisible();
  });

  test("2. Real reader registration, free-tier gating, Paystack honest configuration state, profile & password update", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto("/register");

    await page.getByLabel(/Your name/i).fill("Grace E2E Reader");
    await page.getByLabel(/Email address/i).fill(readerEmail);
    await page.getByLabel(/^Password/i).fill(readerPassword);
    await page.getByRole("button", { name: /Create account/i }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(
      page.getByRole("heading", {
        name: /Welcome to your Balanced Life journey, Grace!/i,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Your growth journey starts here\./i }),
    ).toBeVisible();
    await page.getByRole("button", { name: /Skip onboarding/i }).click();
    await expect(
      page.getByRole("heading", {
        name: /Welcome to your Balanced Life journey/i,
      }),
    ).toHaveCount(0);
    await page.reload();
    await expect(
      page.getByRole("heading", {
        name: /Welcome to your Balanced Life journey/i,
      }),
    ).toHaveCount(0);

    // Check library shows Jan 1 free sample and locked Jan 2 entry
    await page.goto("/library");
    await expect(
      page.getByRole("heading", { name: /A year in the Word/i }),
    ).toBeVisible();
    await expect(page.getByText(/THANK GOD, WE MADE IT\./i)).toBeVisible();
    await page.getByRole("link", { name: /2 January 2027/i }).click();
    await expect(
      page.getByRole("link", { name: /Buy 2027 Digital Copy/i }),
    ).toBeVisible();

    // Visit /checkout/1 -> redirects to /digital-edition and shows honest Paystack configuration state
    await page.goto("/checkout/1");
    await expect(page).toHaveURL(/\/digital-edition$/);
    await expect(
      page.getByText(/Online checkout is not available yet/i),
    ).toBeVisible();

    // Update profile, password, and notification preferences + test notification on Account page
    await page.goto("/account");
    const profileForm = page.locator("form").first();
    await profileForm.getByLabel(/Full name/i).fill("Grace Updated Reader");
    await profileForm.getByRole("button", { name: /Save profile/i }).click();
    await expect(
      page.getByText(/Your profile details have been updated/i),
    ).toBeVisible();

    const passwordForm = page.locator("form").nth(1);
    await passwordForm.getByLabel(/Current password/i).fill(readerPassword);
    await passwordForm.getByLabel(/^New password$/i).fill(readerUpdatedPassword);
    await passwordForm
      .getByRole("button", { name: /Update password/i })
      .click();
    await expect(
      page.getByText(/Your password has been changed/i),
    ).toBeVisible();

    // Configure notification & reminder preferences and send a test notification
    const notifForm = page.locator("form").nth(2);
    await expect(
      notifForm.getByRole("heading", {
        name: /Mobile & Daily Devotional Reminders/i,
      }),
    ).toBeVisible();
    await notifForm
      .getByLabel(/Enable daily devotional reading reminder/i)
      .check();
    await notifForm
      .getByLabel(/Send an evening reminder/i)
      .check();
    const announcementsToggle = notifForm.getByLabel(
      /Receive optional community announcements/i,
    );
    await expect(announcementsToggle).not.toBeChecked();
    await announcementsToggle.check();
    await notifForm.locator('select[name="timezone"]').selectOption("Africa/Lagos");
    await notifForm
      .getByRole("button", { name: /Save reminder preferences/i })
      .click();
    await expect(
      page.getByText(/Reminder & notification preferences saved/i),
    ).toBeVisible();

    await notifForm
      .getByRole("button", { name: /Send test notification/i })
      .click();
    await expect(
      page.getByText(/Test Notification · The Balanced Life Devotional/i).first(),
    ).toBeVisible();

    // Test reopening and completing the onboarding guide from Account settings
    await page
      .getByRole("button", { name: /Reopen welcome onboarding guide/i })
      .click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(
      page.getByRole("heading", {
        name: /Welcome to your Balanced Life journey, Grace!/i,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: /Personalize My Experience/i })
      .click();
    await page.getByRole("button", { name: /Complete onboarding/i }).click();
    await expect(
      page.getByRole("heading", {
        name: /Welcome to your Balanced Life journey/i,
      }),
    ).toHaveCount(0);

    // Sign out and sign back in with updated password
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/(login)?$/);

    await page.goto("/login");
    await page.getByLabel(/Email address/i).fill(readerEmail);
    await page.getByLabel(/^Password/i).fill(readerUpdatedPassword);
    await page.getByRole("button", { name: /^Sign in$/i }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(
      page.getByRole("heading", { name: /Your growth journey starts here\./i }),
    ).toBeVisible();
  });

  test("3. Separate administration portal: isolated login, MFA setup, navigable URLs, reader/admin boundary, complimentary access, devotional publish & mobile layout", async ({
    browser,
  }) => {
    // 1. Verify /admin is completely removed from the public/reader app (port 5173)
    const publicContext = await browser.newContext();
    const publicPage = await publicContext.newPage();
    await publicPage.setViewportSize({ width: 1440, height: 960 });
    await publicPage.goto("/admin");
    await expect(
      publicPage.getByRole("heading", { name: /This page has turned/i }),
    ).toBeVisible();

    // Admin email cannot log into reader site
    await publicPage.goto("/login");
    await publicPage.getByLabel(/Email address/i).fill(adminEmail);
    await publicPage.getByLabel(/^Password/i).fill(adminPassword);
    await publicPage.getByRole("button", { name: /^Sign in$/i }).click();
    await expect(
      publicPage.getByText(/Email or password is incorrect/i),
    ).toBeVisible();
    await publicContext.close();

    // 2. Open dedicated Administration Portal (port 5174)
    const adminContext = await browser.newContext();
    const page = await adminContext.newPage();
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto(`${ADMIN_URL}/login`);

    // Reader email cannot log into admin portal
    await page.getByLabel(/Administrator email/i).fill(readerEmail);
    await page.getByLabel(/Administrator password/i).fill(readerUpdatedPassword);
    await page.getByRole("button", { name: /Continue to verification/i }).click();
    await expect(
      page.getByText(/Administrator email or password is incorrect/i),
    ).toBeVisible();

    // Log in with dedicated admin credentials -> mandatory first-login MFA enrollment
    await page.getByLabel(/Administrator email/i).fill(adminEmail);
    await page.getByLabel(/Administrator password/i).fill(adminPassword);
    await page.getByRole("button", { name: /Continue to verification/i }).click();

    await expect(page).toHaveURL(/5174\/mfa-setup$/);
    const manualKeyEl = page.locator(".mfa-manual-key");
    await expect(manualKeyEl).toBeVisible();
    e2eAdminMfaSecret = (await manualKeyEl.textContent())?.trim() || "";
    expect(e2eAdminMfaSecret.length).toBeGreaterThanOrEqual(16);

    await page
      .getByLabel(/Enter the 6-digit code/i)
      .fill(generateTestTotp(e2eAdminMfaSecret));
    await page.getByRole("button", { name: /Verify & enable MFA/i }).click();

    // Save recovery codes confirmation -> enter dashboard
    await expect(
      page.getByRole("heading", { name: /Store Your Recovery Codes/i }),
    ).toBeVisible();
    await page.locator('input[type="checkbox"]').check();
    await page
      .getByRole("button", { name: /Enter Administration Dashboard/i })
      .click();

    await expect(page).toHaveURL(/5174\/dashboard$/);
    await expect(
      page.getByRole("heading", { level: 1, name: /Executive Overview/i }),
    ).toBeVisible();

    // Verify Overview hierarchy & Needs Your Attention section
    await expect(
      page.getByText(/Verified Revenue/i).first(),
    ).toBeVisible();
    await expect(
      page.getByText(/Active Online Readers/i).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Needs Your Attention/i }),
    ).toBeVisible();

    // Readers route: navigate via sidebar & verify deep-link reload works cleanly
    await page.getByRole("link", { name: /^Readers$/i }).click();
    await expect(page).toHaveURL(/5174\/readers$/);
    await page.reload();
    await expect(page).toHaveURL(/5174\/readers$/);

    await page
      .getByPlaceholder(/Search readers by name, email, or plan/i)
      .fill(readerEmail);
    const readerRow = page.locator("tr", { hasText: readerEmail });
    await expect(readerRow).toBeVisible();
    await readerRow
      .getByRole("button", { name: /Grant complimentary/i })
      .click();

    await page
      .getByLabel(/Reason for complimentary access/i)
      .fill("E2E complimentary online access grant verification");
    await page
      .getByRole("button", { name: /Confirm complimentary grant/i })
      .click();
    await expect(
      page.getByText(/Granted 12-month complimentary 2027 Online Access/i),
    ).toBeVisible();

    // Devotionals route: explicit approval first, then confirmed publish for 2027-01-08
    await page.getByRole("link", { name: /^Devotionals$/i }).click();
    await expect(page).toHaveURL(/5174\/devotionals$/);
    await page
      .getByPlaceholder(/Find a title or date/i)
      .fill("2027-01-08");
    const entryRow = page.locator("tr", { hasText: "2027-01-08" });
    await expect(entryRow).toBeVisible();
    await entryRow.getByRole("button", { name: /^Approve$/i }).click();
    await expect(
      page.getByText(/Marked 2027-01-08 devotional Approved/i),
    ).toBeVisible();
    await entryRow.getByRole("button", { name: /^Publish$/i }).click();
    await expect(
      page.getByRole("heading", { name: /Publish 2027-01-08 devotional\?/i }),
    ).toBeVisible();
    await page.getByRole("button", { name: /Confirm Publish/i }).click();
    await expect(
      page.getByText(/Published 2027-01-08 devotional/i),
    ).toBeVisible();

    // Printed Orders route: verify printed order and unconfigured stock
    await page.getByRole("link", { name: /^Printed Orders$/i }).click();
    await expect(page).toHaveURL(/5174\/printed-orders$/);
    await expect(page.getByText(readerEmail).first()).toBeVisible();
    await expect(page.locator('input[name="stockCount"]')).toHaveValue("");

    // Visit remaining operational routes and verify each renders cleanly
    for (const [linkName, urlRe, headingRe] of [
      [/^Online Access$/i, /5174\/online-access$/, /Product A: 2027 Digital Devotional Access/i],
      [/^Bulk Orders$/i, /5174\/bulk-orders$/, /Bulk.*Institutional/i],
      [/^Payments$/i, /5174\/payments$/, /Payments.*Financial Administration/i],
      [/^Notifications/i, /5174\/notifications$/, /Operational Notifications/i],
      [/^Settings$/i, /5174\/settings$/, /Brand Identity.*Headlines/i],
    ] as const) {
      await page.getByRole("link", { name: linkName }).click();
      await expect(page).toHaveURL(urlRe);
      await expect(page.getByRole("heading", { name: headingRe })).toBeVisible();
    }

    // Activity & Security route: verify audit trail logged actions
    await page.getByRole("link", { name: /Activity & Security/i }).click();
    await expect(page).toHaveURL(/5174\/activity$/);
    await expect(
      page.getByText(/Administrative Audit & Security Log/i),
    ).toBeVisible();

    // Mobile admin viewport 390px: zero horizontal overflow
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${ADMIN_URL}/dashboard`);
    const adminOverflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(adminOverflow).toBe(false);

    await adminContext.close();
  });

  test("4. Complimentary subscriber accesses published archive, bookmarks, reading progress, and 5-step accountability journal CRUD", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto("/login");
    await page.getByLabel(/Email address/i).fill(readerEmail);
    await page.getByLabel(/^Password/i).fill(readerUpdatedPassword);
    await page.getByRole("button", { name: /^Sign in$/i }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(
      page.getByRole("heading", { name: /Welcome back, Grace\./i }),
    ).toBeVisible();

    // Go to Library, search for 2027-01-08, and open it
    await page.goto("/library");
    await page
      .getByPlaceholder(/Search readings, dates, or themes/i)
      .fill("2027-01-08");
    await page.locator(".entry-card").first().click();

    // Mark complete and bookmark
    await page.getByRole("button", { name: /Mark as completed/i }).click();
    await expect(
      page.getByRole("button", { name: /Completed · undo/i }),
    ).toBeVisible();

    await page.getByRole("button", { name: /Save reading/i }).click();
    await expect(
      page.getByRole("button", { name: /^Saved$/i }),
    ).toBeVisible();

    // Save a 5-step daily growth check-in on the reading page
    const journalForm = page.locator("form.journal-form");
    await journalForm
      .getByLabel(/Reflection title/i)
      .fill("Walking in Deliberate Wisdom");
    await journalForm
      .getByLabel(/Today's lesson/i)
      .fill("True wisdom starts with reverencing God in daily choices.");
    await journalForm
      .getByLabel(/Your reflection/i)
      .fill("Lord, help me apply today's reading with consistency and grace.");
    await journalForm
      .getByLabel(/Practical action to take/i)
      .fill("Set aside 15 minutes before school to pray and plan my day.");
    await journalForm
      .getByRole("button", { name: /Save reflection/i })
      .click();
    await expect(
      page.getByText(/Daily growth & accountability saved to your private journal/i),
    ).toBeVisible();

    // Visit Personal Growth Journal page, verify entry
    await page.goto("/journal");
    await expect(
      page.getByText(/Walking in Deliberate Wisdom/i),
    ).toBeVisible();
    await expect(
      page.getByText(/Set aside 15 minutes before school/i),
    ).toBeVisible();

    // Visit Subscription page and verify active access status is clearly shown
    await page.goto("/subscription");
    await expect(
      page.getByText(/Access active/i).first(),
    ).toBeVisible();

    // Verify mobile reader navigation at 390px has no horizontal overflow
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/dashboard");
    await expect(page.locator(".mobile-bottom")).toBeVisible();
    const readerOverflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(readerOverflow).toBe(false);

    // Clean up published state of 2027-01-08 via standalone Admin Portal (testing MFA verify challenge)
    const adminCtx = await page.context().browser()!.newContext();
    const adminPage = await adminCtx.newPage();
    await adminPage.setViewportSize({ width: 1440, height: 960 });
    await adminPage.goto(`${ADMIN_URL}/login`);
    await adminPage.getByLabel(/Administrator email/i).fill(adminEmail);
    await adminPage.getByLabel(/Administrator password/i).fill(adminPassword);
    await adminPage.getByRole("button", { name: /Continue to verification/i }).click();
    await expect(adminPage).toHaveURL(/5174\/mfa-verify$/);
    await adminPage
      .getByLabel(/6-digit authenticator code/i)
      .fill(generateTestTotp(e2eAdminMfaSecret));
    await adminPage
      .getByRole("button", { name: /Verify & enter dashboard/i })
      .click();
    await expect(adminPage).toHaveURL(/5174\/dashboard$/);
    await adminPage.goto(`${ADMIN_URL}/devotionals`);
    await adminPage
      .getByPlaceholder(/Find a title or date/i)
      .fill("2027-01-08");
    const entryRow = adminPage.locator("tr", { hasText: "2027-01-08" });
    await entryRow.getByRole("button", { name: /^Unpublish$/i }).click();
    await adminPage.getByRole("button", { name: /Confirm Unpublish/i }).click();
    await expect(
      adminPage.getByText(/Unpublished 2027-01-08 devotional/i),
    ).toBeVisible();
    await adminCtx.close();
  });

  test("5. Light/Dark/System themes (no FOUC & live OS reactivity), Pending/Scheduled/Expired dashboards, Admin Notification Composer, Reader Notification Center & Mobile viewports", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setViewportSize({ width: 1440, height: 960 });

    // 1. Default System theme + live OS dark/light reaction before login
    await page.goto("/");
    expect(
      await page.evaluate(() => document.documentElement.dataset.themePref),
    ).toBe("system");
    expect(
      await page.evaluate(() => document.documentElement.dataset.theme),
    ).toBe("light");

    await page.emulateMedia({ colorScheme: "dark" });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
      .toBe("dark");
    expect(
      await page.evaluate(
        () =>
          document
            .querySelector('meta[name="theme-color"]')
            ?.getAttribute("content") || "",
      ),
    ).toBe("#1a1114");

    await page.emulateMedia({ colorScheme: "light" });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
      .toBe("light");

    // Cycle header theme toggle (system -> light -> dark) -> persists in localStorage across reload before login
    await page.locator(".theme-quick-btn").click();
    await page.locator(".theme-quick-btn").click();
    expect(
      await page.evaluate(() => localStorage.getItem("bld_theme")),
    ).toBe("dark");
    await page.goto("/login");
    await page.reload();
    expect(
      await page.evaluate(() => document.documentElement.dataset.theme),
    ).toBe("dark");

    // Cycle back to System (dark -> system)
    await page.locator(".theme-quick-btn").click();
    expect(
      await page.evaluate(() => document.documentElement.dataset.themePref),
    ).toBe("system");

    // 2. Register isolated reader to verify pending_payment, scheduled, expired dashboards & preserved journals
    await page.goto("/register");
    await page.getByLabel(/Your name/i).fill("Daniel State Reader");
    await page.getByLabel(/Email address/i).fill(stateReaderEmail);
    await page.getByLabel(/^Password/i).fill(stateReaderPassword);
    await page.getByRole("button", { name: /Create account/i }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    // Dismiss onboarding first so access dashboards take focus cleanly
    await page.getByRole("button", { name: /Skip onboarding/i }).click();

    // Opt into optional announcements on Account page so broadcast test includes Daniel
    await page.goto("/account");
    const accNotifForm = page.locator("form").nth(2);
    await accNotifForm
      .getByLabel(/Receive optional community announcements/i)
      .check();
    await accNotifForm
      .getByRole("button", { name: /Save reminder preferences/i })
      .click();
    await expect(
      page.getByText(/Reminder & notification preferences saved/i),
    ).toBeVisible();

    // Verify full System (Currently dark/light) indicator reflects emulated OS media
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(
      page
        .locator('section[aria-labelledby="appearance-heading"]')
        .getByRole("button", { name: /System \(Currently dark\)/i }),
    ).toBeVisible();
    await page
      .locator('section[aria-labelledby="appearance-heading"]')
      .getByRole("button", { name: /^Light$/i })
      .click();
    await page.emulateMedia({ colorScheme: "light" });

    // Seed unverified bank transfer purchase -> Pending Payment dashboard
    const sqlite = new Database(dbPath);
    const stateUser = sqlite
      .prepare("SELECT id FROM users WHERE email = ?")
      .get(stateReaderEmail) as { id: number };
    const nowIso = new Date().toISOString();
    sqlite
      .prepare(
        `INSERT INTO digital_purchases (
          user_id, product_code, product_name, amount_kobo, currency,
          payment_method, reference, transfer_reference, payer_note,
          status, duration_months, is_renewal, admin_notes, created_at, updated_at
        ) VALUES (?, 'digital_2027', 'The Balanced Life Devotional — 2027 Digital Edition', 350000, 'NGN',
          'bank_transfer', ?, 'NIP-STATE-E2E-2027', 'E2E Transfer',
          'verifying_transfer', 12, 0, '', ?, ?)`,
      )
      .run(stateUser.id, `E2E-PEND-${Date.now()}`, nowIso, nowIso);
    sqlite.close();

    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", {
        name: /Your payment is awaiting verification\./i,
      }),
    ).toBeVisible();

    // Simulate verified pre-2027 purchase -> Scheduled dashboard (locked until Jan 1, 2027)
    const sqliteSched = new Database(dbPath);
    sqliteSched
      .prepare("UPDATE digital_purchases SET status = 'succeeded', verified_at = ? WHERE user_id = ?")
      .run(nowIso, stateUser.id);
    sqliteSched
      .prepare(
        `INSERT INTO digital_entitlements (
          user_id, edition_year, access_type, access_scope, status,
          starts_at, expires_at, duration_months, renewal_count,
          legacy_persistent, legacy_review_required, grant_reason,
          granted_at, updated_at
        ) VALUES (?, 2027, 'paid', 'edition_2027', 'active', '2027-01-01T00:00:00.000Z', '2028-01-01T00:00:00.000Z', 12, 0, 0, 0, 'E2E Scheduled', ?, ?)`,
      )
      .run(stateUser.id, nowIso, nowIso);
    sqliteSched.close();

    await page.reload();
    await expect(
      page.getByRole("heading", { name: /Your online access is confirmed\./i }),
    ).toBeVisible();

    // Seed 1 historical journal entry and expire entitlement -> Expired dashboard + preserved journal check
    const sqliteExp = new Database(dbPath);
    sqliteExp
      .prepare(
        `INSERT INTO journal_entries (user_id, title, lesson_learned, body, action_step, prayer_focus, created_at, updated_at)
         VALUES (?, 'Preserved E2E Reflection', 'God is faithful', 'My notes stay intact after expiry.', 'Stay consistent', 'Thank you Lord', ?, ?)`,
      )
      .run(stateUser.id, nowIso, nowIso);
    sqliteExp
      .prepare(
        "UPDATE digital_entitlements SET status = 'expired', expires_at = '2026-01-01T00:00:00.000Z' WHERE user_id = ?",
      )
      .run(stateUser.id);
    sqliteExp.close();

    await page.reload();
    await expect(
      page.getByRole("heading", { name: /Welcome back, Daniel\./i }),
    ).toBeVisible();
    await expect(
      page.getByText(/Your 12-Month Online Access Has Expired/i).first(),
    ).toBeVisible();
    await expect(page.getByText(/1 Growth Journal reflection/i)).toBeVisible();

    await page.goto("/journal");
    await expect(page.getByText(/Preserved E2E Reflection/i)).toBeVisible();

    // 3. Separate Admin Portal Notification Composer -> targeted send & community broadcast
    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    await adminPage.setViewportSize({ width: 1440, height: 960 });
    await adminPage.goto(`${ADMIN_URL}/login`);
    await adminPage.getByLabel(/Administrator email/i).fill(adminEmail);
    await adminPage.getByLabel(/Administrator password/i).fill(adminPassword);
    await adminPage
      .getByRole("button", { name: /Continue to verification/i })
      .click();
    await expect(adminPage).toHaveURL(/5174\/mfa-verify$/);
    await adminPage
      .getByLabel(/6-digit authenticator code/i)
      .fill(generateTestTotp(e2eAdminMfaSecret));
    await adminPage
      .getByRole("button", { name: /Verify & enter dashboard/i })
      .click();
    await expect(adminPage).toHaveURL(/5174\/dashboard$/);

    await adminPage.goto(`${ADMIN_URL}/notifications`);
    await adminPage
      .getByPlaceholder(/Type reader name or email/i)
      .fill(stateReaderEmail);
    await adminPage
      .locator(".reader-search-item", { hasText: stateReaderEmail })
      .click();
    await adminPage
      .getByLabel(/Notification title/i)
      .fill("Personal Encouragement Note");
    await adminPage
      .getByLabel(/Message body/i)
      .fill("Thank you for checking your Balanced Life workspace.");
    await adminPage.getByRole("button", { name: /Review & Send Now/i }).click();
    await expect(
      adminPage.getByRole("heading", {
        name: /Confirm Reader Notification Dispatch/i,
      }),
    ).toBeVisible();
    await adminPage
      .getByRole("button", { name: /Confirm & Queue Notification/i })
      .click();
    await expect(
      adminPage.getByText(/Notification queued/i).first(),
    ).toBeVisible();

    // Community broadcast using Welcome preset
    await adminPage
      .getByRole("button", { name: /All Eligible Readers/i })
      .click();
    await adminPage.getByRole("button", { name: /Welcome preset/i }).click();
    await adminPage
      .getByRole("button", { name: /Preview Eligible Count/i })
      .click();
    await expect(
      adminPage.getByText(/Eligible Recipients:/i).first(),
    ).toBeVisible();
    await adminPage.getByRole("button", { name: /Review & Send Now/i }).click();
    await adminPage
      .getByRole("button", { name: /Confirm & Queue Notification/i })
      .click();
    await expect(
      adminPage.getByText(/Administrator Notification Campaign History/i),
    ).toBeVisible();
    await adminCtx.close();

    // 4. Reader Notification Center: sidebar badge, Unread filter, Mark as read & Mark all as read
    await page.goto("/dashboard");
    await expect(page.locator(".sidebar-badge")).toBeVisible();
    await page.locator('.sidebar a[href="/notifications"]').click();
    await expect(page).toHaveURL(/\/notifications$/);
    await expect(
      page.getByRole("heading", { name: /^Notification Center$/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Personal Encouragement Note/i }),
    ).toBeVisible();

    await page.getByRole("button", { name: /^Unread \(/i }).click();
    await page
      .locator(".notif-item", { hasText: "Personal Encouragement Note" })
      .getByRole("button", { name: /Mark as read/i })
      .click();
    await expect(
      page.getByRole("heading", { name: /Personal Encouragement Note/i }),
    ).toHaveCount(0);

    await page.getByRole("button", { name: /Mark all as read/i }).click();
    await expect(
      page.getByText(/You are all caught up/i),
    ).toBeVisible();
    await expect(page.locator(".sidebar-badge")).toHaveCount(0);

    // 5. Mobile viewports (360px, 390px, 430px, 768px) + Mobile More sheet at 390px
    await page.setViewportSize({ width: 390, height: 844 });
    for (const navRoute of [
      { link: /My journey/i, path: "/dashboard" },
      { link: /My Growth Journal/i, path: "/journal" },
    ]) {
      await page
        .locator(".mobile-bottom")
        .getByRole("link", { name: navRoute.link })
        .click();
      await expect(page).toHaveURL(new RegExp(`${navRoute.path}$`));
      for (const width of [768, 430, 390, 360]) {
        await page.setViewportSize({ width, height: 844 });
        const overflow = await page.evaluate(
          () =>
            document.documentElement.scrollWidth >
            document.documentElement.clientWidth,
        );
        expect(overflow, `Reader overflow on ${navRoute.path} at ${width}px`).toBe(false);
      }
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/dashboard");
    await page
      .getByRole("button", {
        name: /More reader tools, notifications, and appearance/i,
      })
      .click();
    await expect(page.locator("dialog.mobile-more-dialog[open]")).toBeVisible();
    await page
      .locator("dialog.mobile-more-dialog")
      .getByRole("button", { name: /^Dark$/i })
      .click();
    expect(
      await page.evaluate(() => document.documentElement.dataset.theme),
    ).toBe("dark");
    await page
      .getByRole("button", { name: /Close more options/i })
      .click();

    await context.close();
  });

  test("6. Mobile PWA & layout separation: no footer in reader app/PWA/mobile public, single bottom nav without hamburger, balanced empty states, non-overlapping toasts, 360/375/390/430/768px + standalone mode", async ({
    browser,
  }) => {
    test.setTimeout(90_000);
    const shotDir = path.resolve(
      import.meta.dirname,
      "../../tmp/mobile-screenshots",
    );
    mkdirSync(shotDir, { recursive: true });

    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    // 1. Desktop public homepage retains marketing footer; <=768px public pages hide marketing footer cleanly
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto("/");
    await expect(page.locator("footer.marketing-footer")).toBeVisible();

    for (const width of [768, 430, 390, 375, 360]) {
      await page.setViewportSize({ width, height: 844 });
      await expect(page.locator("footer.marketing-footer")).toHaveCount(0);
      await expect(page.locator(".menu-toggle")).toBeVisible();
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
      );
      expect(overflow, `Public homepage overflow at ${width}px`).toBe(false);
    }

    // Legal & contact links stay accessible in mobile public nav when footer is suppressed
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator(".menu-toggle").click();
    await expect(
      page.locator(".public-nav.open").getByRole("link", { name: /Privacy policy/i }),
    ).toBeVisible();
    await expect(
      page.locator(".public-nav.open").getByRole("link", { name: /Terms of use/i }),
    ).toBeVisible();

    // 2. Register fresh reader on mobile and inspect onboarding + all empty/short states
    await page.goto("/register");
    await page.getByLabel(/Your name/i).fill("Hannah Mobile Reader");
    await page.getByLabel(/Email address/i).fill(pwaReaderEmail);
    await page.getByLabel(/^Password/i).fill(pwaReaderPassword);
    await page.getByRole("button", { name: /Create account/i }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    // Compact reader header keeps brand, theme toggle, notification bell; NO hamburger menu & NO marketing footer
    await expect(page.locator("header.reader-app-header")).toBeVisible();
    await expect(page.locator(".theme-quick-btn")).toBeVisible();
    await expect(page.locator("a.notif-bell-link")).toBeVisible();
    await expect(page.locator(".menu-toggle")).toHaveCount(0);
    await expect(page.locator("footer.marketing-footer")).toHaveCount(0);
    await expect(page.locator(".mobile-bottom")).toBeVisible();

    // Screen 10: Free-reader onboarding
    await expect(
      page.getByRole("heading", {
        name: /Welcome to your Balanced Life journey, Hannah!/i,
      }),
    ).toBeVisible();
    await page.screenshot({
      path: path.join(shotDir, "01-onboarding-free-390.png"),
      fullPage: false,
    });

    // Dismiss onboarding & verify Screen 1 (Free Home Dashboard without footer)
    await page.getByRole("button", { name: /Skip onboarding/i }).click();
    await expect(
      page.getByRole("heading", { name: /Unlock your 2027 devotional journey\./i }),
    ).toBeVisible();
    await page.screenshot({
      path: path.join(shotDir, "02-home-dashboard-free-390.png"),
      fullPage: false,
    });

    // Screen 5: Empty Saved Readings via bottom navigation (no footer, no hamburger, polished empty card)
    await page
      .locator(".mobile-bottom")
      .getByRole("link", { name: /Saved readings/i })
      .click();
    await expect(page).toHaveURL(/\/saved$/);
    await expect(page.locator("footer.marketing-footer")).toHaveCount(0);
    await expect(page.locator(".menu-toggle")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: /No saved readings yet/i }),
    ).toBeVisible();
    await page.screenshot({
      path: path.join(shotDir, "03-saved-empty-390.png"),
      fullPage: false,
    });

    // Screen 6: Empty Notification Center via header Bell (no footer, balanced card)
    await page.locator("a.notif-bell-link").click();
    await expect(page).toHaveURL(/\/notifications$/);
    await expect(page.locator("footer.marketing-footer")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: /Your notification inbox is empty/i }),
    ).toBeVisible();
    await page.screenshot({
      path: path.join(shotDir, "04-notifications-empty-390.png"),
      fullPage: false,
    });

    // Screen 7: Empty / Free My Online Access via More drawer
    await page
      .getByRole("button", {
        name: /More reader tools, notifications, and appearance/i,
      })
      .click();
    await page
      .locator("dialog.mobile-more-dialog[open]")
      .getByRole("link", { name: /My Online Access/i })
      .click();
    await expect(page).toHaveURL(/\/subscription$/);
    await expect(page.locator("footer.marketing-footer")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: /No digital access purchases yet/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /No printed book orders yet/i }),
    ).toBeVisible();
    await page.screenshot({
      path: path.join(shotDir, "05-online-access-390.png"),
      fullPage: false,
    });

    // Screen 4: Growth Journal empty state via bottom nav -> save entry -> assert toast sits clear above bottom nav
    await page
      .locator(".mobile-bottom")
      .getByRole("link", { name: /My Growth Journal/i })
      .click();
    await expect(page).toHaveURL(/\/journal$/);
    await expect(page.locator("footer.marketing-footer")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: /No journal entries yet/i }),
    ).toBeVisible();

    await page.getByLabel(/Reflection title/i).fill("Mobile Clarity Reflection");
    await page
      .getByLabel(/What's on your heart today\?/i)
      .fill("Thankful for calm daily reading ergonomics on mobile.");
    await page.getByRole("button", { name: /Save reflection/i }).click();
    const toastEl = page.locator(".toast");
    await expect(toastEl).toBeVisible();
    const toastBox = await toastEl.boundingBox();
    const navBox = await page.locator(".mobile-bottom").boundingBox();
    expect(toastBox && navBox).toBeTruthy();
    if (toastBox && navBox) {
      expect(
        toastBox.y + toastBox.height,
        "Toast must sit clearly above mobile bottom nav without overlap",
      ).toBeLessThan(navBox.y);
    }
    await page.screenshot({
      path: path.join(shotDir, "06-journal-toast-390.png"),
      fullPage: false,
    });
    await page.getByRole("button", { name: /Dismiss notification/i }).click();
    await expect(toastEl).toHaveCount(0);

    // Screen 8: Account Settings via More drawer (Switch to Dark mode and verify contrast/no overflow)
    await page
      .getByRole("button", {
        name: /More reader tools, notifications, and appearance/i,
      })
      .click();
    await page
      .locator("dialog.mobile-more-dialog[open]")
      .getByRole("link", { name: /Account & Reminder Settings/i })
      .click();
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.locator("footer.marketing-footer")).toHaveCount(0);
    await page
      .locator('section[aria-labelledby="appearance-heading"]')
      .getByRole("button", { name: /^Dark$/i })
      .click();
    expect(
      await page.evaluate(() => document.documentElement.dataset.theme),
    ).toBe("dark");
    await page.screenshot({
      path: path.join(shotDir, "07-account-dark-390.png"),
      fullPage: false,
    });

    // Switch back to Light for remaining daylight captures & test Screen 9: More menu sheet
    await page
      .locator('section[aria-labelledby="appearance-heading"]')
      .getByRole("button", { name: /^Light$/i })
      .click();
    await page
      .getByRole("button", {
        name: /More reader tools, notifications, and appearance/i,
      })
      .click();
    const moreDialog = page.locator("dialog.mobile-more-dialog[open]");
    await expect(moreDialog).toBeVisible();
    for (const labelRe of [
      /My Online Access/i,
      /My Orders/i,
      /Notifications/i,
      /Account & Reminder Settings/i,
      /Install App/i,
      /Contact & Help/i,
      /Privacy Policy/i,
      /Terms of Use/i,
      /Sign out/i,
    ]) {
      await expect(moreDialog.getByText(labelRe).first()).toBeVisible();
    }
    await page.screenshot({
      path: path.join(shotDir, "08-more-drawer-390.png"),
      fullPage: false,
    });
    await page.getByRole("button", { name: /Close more options/i }).click();

    // 3. Grant active 2027 digital entitlement via SQLite -> verify Screen 2 (Library) & Screen 3 (Reading page)
    const sqlite = new Database(dbPath);
    const pwaUser = sqlite
      .prepare("SELECT id FROM users WHERE email = ?")
      .get(pwaReaderEmail) as { id: number };
    const pastIso = new Date(Date.now() - 86_400_000).toISOString();
    const futureIso = new Date(Date.now() + 86_400_000 * 180).toISOString();
    sqlite
      .prepare(
        `INSERT INTO digital_entitlements (
          user_id, edition_year, access_type, access_scope, status,
          starts_at, expires_at, duration_months, renewal_count,
          legacy_persistent, legacy_review_required, grant_reason,
          granted_at, updated_at
        ) VALUES (?, 2027, 'complimentary', 'edition_2027', 'active', ?, ?, 12, 0, 0, 0, 'E2E PWA Mobile Active', ?, ?)`,
      )
      .run(pwaUser.id, pastIso, futureIso, pastIso, pastIso);
    sqlite.close();

    // Screen 1 (Active): Active Dashboard + balanced empty reading history card
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: /Welcome back, Hannah\./i }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /No reading history yet/i }),
    ).toBeVisible();
    await page.screenshot({
      path: path.join(shotDir, "09-dashboard-active-history-390.png"),
      fullPage: false,
    });

    // Screen 2: Devotional Library
    await page.goto("/library");
    await expect(page.locator("footer.marketing-footer")).toHaveCount(0);
    await page.screenshot({
      path: path.join(shotDir, "10-library-390.png"),
      fullPage: false,
    });

    // Screen 3: Reading Page + non-overlapping bottom nav
    await page.locator(".entry-card").first().click();
    await expect(page).toHaveURL(/\/read\/\d+$/);
    await expect(page.locator("footer.marketing-footer")).toHaveCount(0);
    await expect(page.locator(".reading-one-hand-bar")).toBeVisible();
    await page.screenshot({
      path: path.join(shotDir, "11-reading-page-390.png"),
      fullPage: false,
    });

    // 4. Verify ZERO overflow & NO footer across all 5 mobile/tablet viewports + reader routes via SPA navigation
    const spaTabs: Array<{
      nav: "bottom" | "bell" | "more";
      label?: RegExp;
      path: string;
    }> = [
      { nav: "bottom", label: /My journey/i, path: "/dashboard" },
      { nav: "bottom", label: /Devotional library/i, path: "/library" },
      { nav: "bottom", label: /My Growth Journal/i, path: "/journal" },
      { nav: "bottom", label: /Saved readings/i, path: "/saved" },
      { nav: "bell", path: "/notifications" },
      { nav: "more", label: /My Online Access/i, path: "/subscription" },
      { nav: "more", label: /Account & Reminder Settings/i, path: "/account" },
    ];
    for (const tab of spaTabs) {
      if (tab.nav === "bottom" && tab.label) {
        await page
          .locator(".mobile-bottom")
          .getByRole("link", { name: tab.label })
          .click();
      } else if (tab.nav === "bell") {
        await page.locator("a.notif-bell-link").click();
      } else if (tab.nav === "more" && tab.label) {
        await page
          .getByRole("button", {
            name: /More reader tools, notifications, and appearance/i,
          })
          .click();
        await page
          .locator("dialog.mobile-more-dialog[open]")
          .getByRole("link", { name: tab.label })
          .click();
      }
      await expect(page).toHaveURL(new RegExp(`${tab.path}$`));
      await expect(page.locator("footer.marketing-footer")).toHaveCount(0);
      for (const width of [360, 375, 390, 430, 768]) {
        await page.setViewportSize({ width, height: 844 });
        await expect(page.locator(".menu-toggle")).toHaveCount(0);
        const overflow = await page.evaluate(
          () =>
            document.documentElement.scrollWidth >
            document.documentElement.clientWidth,
        );
        expect(overflow, `Overflow on ${tab.path} at ${width}px`).toBe(false);
      }
    }

    // Mobile landscape check (844x390)
    await page.setViewportSize({ width: 844, height: 390 });
    await page
      .locator(".mobile-bottom")
      .getByRole("link", { name: /My Growth Journal/i })
      .click();
    await expect(page).toHaveURL(/\/journal$/);
    await expect(page.locator(".mobile-bottom")).toBeVisible();
    const landscapeOverflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(landscapeOverflow).toBe(false);

    // 5. Standalone PWA display-mode simulation: never shows marketing footer even on desktop/public/more subroutes
    const standaloneCtx = await browser.newContext();
    await standaloneCtx.addInitScript(() => {
      const origMatchMedia = window.matchMedia.bind(window);
      window.matchMedia = (q: string) => {
        if (q.includes("display-mode: standalone")) {
          return {
            matches: true,
            media: q,
            onchange: null,
            addListener: () => {},
            removeListener: () => {},
            addEventListener: () => {},
            removeEventListener: () => {},
            dispatchEvent: () => false,
          } as unknown as MediaQueryList;
        }
        return origMatchMedia(q);
      };
    });
    const pwaPage = await standaloneCtx.newPage();
    await pwaPage.setViewportSize({ width: 390, height: 844 });
    await pwaPage.goto("/");
    await expect(pwaPage.locator("footer.marketing-footer")).toHaveCount(0);

    await pwaPage.goto("/login");
    await pwaPage.getByLabel(/Email address/i).fill(pwaReaderEmail);
    await pwaPage.getByLabel(/^Password/i).fill(pwaReaderPassword);
    await pwaPage.getByRole("button", { name: /^Sign in$/i }).click();
    await expect(pwaPage).toHaveURL(/\/dashboard$/);
    await pwaPage.goto("/privacy");
    await expect(pwaPage.locator("footer.marketing-footer")).toHaveCount(0);
    await expect(pwaPage.locator(".mobile-bottom")).toBeVisible();
    await pwaPage.screenshot({
      path: path.join(shotDir, "12-standalone-pwa-390.png"),
      fullPage: false,
    });

    await standaloneCtx.close();
    await ctx.close();
  });

  test("7. Comprehensive desktop (1024-1920px) & mobile/tablet (320-768px) UI audit, About/Footer/Sidebar/Banner spacing & themes", async ({
    browser,
  }) => {
    const auditShotDir = path.resolve(
      import.meta.dirname,
      "../../tmp/audit-screenshots",
    );
    mkdirSync(auditShotDir, { recursive: true });

    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    const assertNoHorizontalOverflow = async (label: string) => {
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
      );
      expect(overflow, `Horizontal overflow on ${label}`).toBe(false);
    };

    // 1. Audit public desktop header, 3-column footer & pages across 1024, 1280, 1440, 1920
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    await expect(page.locator("header.public-header")).toBeVisible();
    await expect(page.locator(".footer-brand-block")).toBeVisible();
    await expect(page.locator(".footer-nav-col")).toBeVisible();
    await expect(page.locator(".footer-contact-block")).toBeVisible();
    await expect(
      page.locator(".footer-contact-block").getByText(/Abuja, Nigeria/i),
    ).toBeVisible();

    // Footer 3 areas sit in horizontal columns cleanly on desktop without vertical collapsing
    const footerMetrics = await page.evaluate(() => {
      const b = document
        .querySelector(".footer-brand-block")
        ?.getBoundingClientRect();
      const n = document
        .querySelector(".footer-nav-col")
        ?.getBoundingClientRect();
      const c = document
        .querySelector(".footer-contact-block")
        ?.getBoundingClientRect();
      return { b, n, c };
    });
    expect(footerMetrics.b && footerMetrics.n && footerMetrics.c).toBeTruthy();
    expect(footerMetrics.n!.left).toBeGreaterThan(footerMetrics.b!.right - 1);
    expect(footerMetrics.c!.left).toBeGreaterThan(footerMetrics.n!.right - 1);

    await page
      .locator("footer.marketing-footer")
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: path.join(auditShotDir, "01-home-footer-1280.png"),
      fullPage: false,
    });

    // Public header inline navigation check at 1024px, 1280px, 1440px, 1920px
    for (const width of [1024, 1280, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.locator("nav.public-nav")).toBeVisible();
      await expect(page.locator("header.public-header .menu-toggle")).toBeHidden();
      await assertNoHorizontalOverflow(`public home ${width}px`);
      const headerHeight = await page
        .locator("header.public-header")
        .evaluate((el) => el.getBoundingClientRect().height);
      expect(headerHeight).toBeLessThanOrEqual(115);
      if (width === 1024) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({
          path: path.join(auditShotDir, "02-home-header-1024.png"),
          fullPage: false,
        });
      }
    }

    // Check About Devotional callout + button separation (desktop + mobile)
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.locator("nav.public-nav").getByRole("link", { name: /The devotional/i }).click();
    await expect(page).toHaveURL(/\/about$/);
    await expect(page.locator(".about-access-callout")).toBeVisible();
    await expect(
      page.locator(".about-access-callout").getByText(/Printed Book/i),
    ).toBeVisible();
    await expect(
      page.locator(".about-access-callout").getByText(/2027 Online Access/i),
    ).toBeVisible();
    const aboutBoxes = await page.evaluate(() => {
      const callout = document
        .querySelector(".about-access-callout")
        ?.getBoundingClientRect();
      const actions = document
        .querySelector(".about-access-actions")
        ?.getBoundingClientRect();
      return { callout, actions };
    });
    expect(aboutBoxes.actions!.top - aboutBoxes.callout!.bottom).toBeGreaterThanOrEqual(20);
    await page.locator(".about-access-callout").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: path.join(auditShotDir, "03-about-callout-1280.png"),
      fullPage: false,
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await assertNoHorizontalOverflow("about 390px");
    await expect(page.locator("footer.marketing-footer")).toHaveCount(0);
    await page.locator(".about-access-callout").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: path.join(auditShotDir, "04-about-callout-390.png"),
      fullPage: false,
    });

    // Spot-check About Author, Pricing, Bookstore across 320px, 768px, 1280px
    for (const routeLink of [
      { name: /The author/i, path: /\/about-author$/ },
      { name: /Get access/i, path: /\/pricing$/ },
      { name: /Printed Book/i, path: /\/bookstore$/ },
    ]) {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page
        .locator("nav.public-nav")
        .getByRole("link", { name: routeLink.name })
        .click();
      await expect(page).toHaveURL(routeLink.path);
      await assertNoHorizontalOverflow(`public desktop ${routeLink.path}`);
      for (const w of [768, 320]) {
        await page.setViewportSize({ width: w, height: 800 });
        await assertNoHorizontalOverflow(`public ${w}px ${routeLink.path}`);
        await expect(page.locator("footer.marketing-footer")).toHaveCount(0);
      }
    }

    // 2. Register a fresh free reader & check Free Dashboard + upcoming notice spacing + sidebar legal links
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/register");
    await page.getByLabel(/Your name/i).fill("Audited Reader");
    await page.getByLabel(/Email address/i).fill(auditReaderEmail);
    await page.getByLabel(/^Password/i).fill(auditReaderPassword);
    await page.getByRole("button", { name: /Create account/i }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.getByRole("button", { name: /Skip onboarding/i }).click();
    await expect(page.locator(".onboarding-card")).toHaveCount(0);

    // Check outdated wording removed from UpcomingYearNotice
    const bannerText = await page.locator(".upcoming-banner").innerText();
    expect(bannerText.toLowerCase()).not.toContain("membership");

    // Check gap between UpcomingYearNotice banner and Free dashboard top cards (>= 20px)
    const freeDashMetrics = await page.evaluate(() => {
      const banner = document
        .querySelector(".upcoming-banner")
        ?.getBoundingClientRect();
      const topRow = document
        .querySelector(".dashboard-top")
        ?.getBoundingClientRect();
      return { banner, topRow };
    });
    expect(freeDashMetrics.banner && freeDashMetrics.topRow).toBeTruthy();
    expect(freeDashMetrics.topRow!.top - freeDashMetrics.banner!.bottom).toBeGreaterThanOrEqual(20);

    // Sidebar legal links sit horizontally with no separator nodes
    const legalLayout = await page.evaluate(() => {
      const container = document
        .querySelector("nav.sidebar-legal")
        ?.getBoundingClientRect();
      const links = Array.from(
        document.querySelectorAll("nav.sidebar-legal a"),
      ).map((el) => el.getBoundingClientRect());
      const spanCount = document.querySelectorAll("nav.sidebar-legal span").length;
      return { container, links, spanCount };
    });
    expect(legalLayout.spanCount).toBe(0);
    expect(legalLayout.links.length).toBe(3);
    expect(legalLayout.container!.height).toBeLessThanOrEqual(52);
    expect(legalLayout.links[1].left).toBeGreaterThan(legalLayout.links[0].right);
    expect(legalLayout.links[2].left).toBeGreaterThan(legalLayout.links[1].right);

    // Also verify sidebar legal links are above the fold inside sticky desktop viewport!
    await page.screenshot({
      path: path.join(auditShotDir, "05-free-dashboard-sidebar-1280.png"),
      fullPage: false,
    });

    // 3. Check Library spacing between heading -> upcoming banner -> filters -> grid across desktop & 320px
    await page.locator(".sidebar-primary-nav").getByRole("link", { name: /Devotional library/i }).click();
    await expect(page).toHaveURL(/\/library$/);
    await expect(page.locator(".library-stage .upcoming-banner")).toBeVisible();
    await expect(page.locator(".library-stage .library-filters")).toBeVisible();
    const libMetrics = await page.evaluate(() => {
      const heading = document
        .querySelector(".page-heading")
        ?.getBoundingClientRect();
      const banner = document
        .querySelector(".library-stage .upcoming-banner")
        ?.getBoundingClientRect();
      const filters = document
        .querySelector(".library-stage .library-filters")
        ?.getBoundingClientRect();
      return { heading, banner, filters };
    });
    expect(libMetrics.banner && libMetrics.heading && libMetrics.filters).toBeTruthy();
    expect(libMetrics.banner!.top - libMetrics.heading!.bottom).toBeGreaterThanOrEqual(20);
    expect(libMetrics.filters!.top - libMetrics.banner!.bottom).toBeGreaterThanOrEqual(20);
    await page.screenshot({
      path: path.join(auditShotDir, "06-library-desktop-1280.png"),
      fullPage: false,
    });

    // Check 320px–768px Library + Saved + Journal + Notifications + Account + Subscription + More
    for (const width of [320, 360, 375, 430, 768]) {
      await page.setViewportSize({ width, height: 760 });
      await assertNoHorizontalOverflow(`library ${width}px`);
      await expect(page.locator("footer.marketing-footer")).toHaveCount(0);
    }
    await page.setViewportSize({ width: 320, height: 760 });
    await page.screenshot({
      path: path.join(auditShotDir, "07-library-mobile-320.png"),
      fullPage: false,
    });

    // Check Saved & Journal on 320px mobile
    for (const tab of [
      { name: /Saved readings/i, path: /\/saved$/ },
      { name: /My Growth Journal/i, path: /\/journal$/ },
    ]) {
      await page.locator(".mobile-bottom").getByRole("link", { name: tab.name }).click();
      await expect(page).toHaveURL(tab.path);
      await assertNoHorizontalOverflow(`mobile 320px ${tab.path}`);
    }

    // Switch to Dark theme on desktop (1440px) and verify Account, Notifications, Online Access, Free Dashboard
    await page.setViewportSize({ width: 1440, height: 900 });
    await page
      .locator(".sidebar-theme-box")
      .getByRole("button", { name: /^Dark$/i })
      .click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.locator(".sidebar-primary-nav").getByRole("link", { name: /Account & reminders/i }).click();
    await expect(page).toHaveURL(/\/account$/);
    await assertNoHorizontalOverflow("account dark 1440px");
    await page.locator(".sidebar-primary-nav").getByRole("link", { name: /Notifications/i }).click();
    await expect(page).toHaveURL(/\/notifications$/);
    await assertNoHorizontalOverflow("notifications dark 1440px");
    await page.locator(".sidebar-primary-nav").getByRole("link", { name: /My online access/i }).click();
    await expect(page).toHaveURL(/\/subscription$/);
    await assertNoHorizontalOverflow("subscription dark 1440px");

    // Capture Free-reader dashboard in dark mode (1440px)
    await page.locator(".sidebar-primary-nav").getByRole("link", { name: /My journey/i }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await assertNoHorizontalOverflow("dashboard dark 1440px");
    await page.screenshot({
      path: path.join(auditShotDir, "08-dashboard-dark-1440.png"),
      fullPage: false,
    });

    // Grant active digital access to auditReaderEmail in SQLite, hop via Account -> My journey to inspect Active dashboard in dark mode
    const auditDb = new Database(dbPath);
    const auditUserRow = auditDb
      .prepare("SELECT id FROM users WHERE email = ?")
      .get(auditReaderEmail) as { id: number };
    const nowIso = new Date().toISOString();
    const expIso = "2028-01-01T00:00:00.000Z";
    auditDb
      .prepare(
        `INSERT INTO digital_entitlements (user_id, edition_year, access_scope, access_type, status, starts_at, expires_at, duration_months, granted_at, updated_at)
         VALUES (?, 2027, 'edition_2027', 'complimentary', 'active', ?, ?, 12, ?, ?)
         ON CONFLICT(user_id, edition_year) DO UPDATE SET status='active', access_type='complimentary', starts_at=excluded.starts_at, expires_at=excluded.expires_at, updated_at=excluded.updated_at`,
      )
      .run(auditUserRow.id, nowIso, expIso, nowIso, nowIso);
    auditDb.close();

    await page.locator(".sidebar-primary-nav").getByRole("link", { name: /Notifications/i }).click();
    await expect(page).toHaveURL(/\/notifications$/);
    await page.locator(".sidebar-primary-nav").getByRole("link", { name: /My journey/i }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText(/Your 365-day progress/i)).toBeVisible();
    await expect(page.locator("footer.marketing-footer")).toHaveCount(0);
    await assertNoHorizontalOverflow("active dashboard dark 1440px");
    await page.screenshot({
      path: path.join(auditShotDir, "09-active-dashboard-dark-1440.png"),
      fullPage: false,
    });

    // Reset back to system theme cleanly & inspect signed-in Public Header across 1024, 1280, 1440
    await page
      .locator(".sidebar-theme-box")
      .getByRole("button", { name: /^System$/i })
      .click();
    await page.locator("header.reader-app-header").getByRole("link", { name: /Public site/i }).click();
    await expect(page).toHaveURL(/\/$/);
    for (const width of [1024, 1280, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.locator("header.public-header .header-signout-btn")).toBeVisible();
      await assertNoHorizontalOverflow(`signed-in public header ${width}px`);
    }

    await ctx.close();
  });

  test("8. Admin operational improvements: failed grant keeps form open, 2027 editorial calendar & Feb 13 issue, Printed Orders PII minimization, notification timing validation & Content Editor RBAC UI", async ({
    browser,
  }) => {
    const adminCtx = await browser.newContext();
    const page = await adminCtx.newPage();
    await page.setViewportSize({ width: 1440, height: 960 });

    await page.goto(`${ADMIN_URL}/login`);
    await page.getByLabel(/Administrator email/i).fill(adminEmail);
    await page.getByLabel(/Administrator password/i).fill(adminPassword);
    await page.getByRole("button", { name: /Continue to verification/i }).click();
    await expect(page).toHaveURL(/5174\/mfa-verify$/);
    await page
      .getByLabel(/6-digit authenticator code/i)
      .fill(generateTestTotp(e2eAdminMfaSecret));
    await page
      .getByRole("button", { name: /Verify & enter dashboard/i })
      .click();
    await expect(page).toHaveURL(/5174\/dashboard$/);

    // 1. Dashboard Overview: Needs Your Attention & no obsolete membership phrasing
    await expect(
      page.getByRole("heading", { name: /Needs Your Attention/i }),
    ).toBeVisible();
    await expect(page.getByText(/paid memberships/i)).toHaveCount(0);

    // 2. ReadersPage: invalid reason keeps modal open & displays inline error
    await page.getByRole("link", { name: /^Readers$/i }).click();
    await expect(page).toHaveURL(/5174\/readers$/);
    await page
      .locator("tr", { hasText: readerEmail })
      .getByRole("button", { name: /Grant complimentary/i })
      .click();
    await page.getByLabel(/Reason for complimentary access/i).fill("x");
    await page
      .getByRole("button", { name: /Confirm complimentary grant/i })
      .click();
    await expect(
      page.getByRole("button", { name: /Confirm complimentary grant/i }),
    ).toBeVisible();
    await expect(
      page.getByText(/Provide a brief reason/i).first(),
    ).toBeVisible();
    await page.getByRole("button", { name: /^Cancel$/i }).click();

    // 3. DevotionalsPage: 2027 editorial calendar + Feb 13 issue highlight & 6-section preview
    await page.getByRole("link", { name: /^Devotionals$/i }).click();
    await expect(page).toHaveURL(/5174\/devotionals$/);
    await expect(
      page.getByText(/2027 Editorial Calendar/i),
    ).toBeVisible();
    await page.getByRole("button", { name: /Inspect Feb 13, 2027/i }).click();
    await expect(page.getByText(/Reader Preview · 2027-02-13/i)).toBeVisible();
    await expect(page.getByText(/6 \/ 6 sections complete/i)).toBeVisible();
    await page.getByRole("button", { name: /Close preview/i }).click();

    // 4. Printed Orders: street address is hidden in summary table, revealed inside Manage drawer
    await page.getByRole("link", { name: /^Printed Orders$/i }).click();
    await expect(page).toHaveURL(/5174\/printed-orders$/);
    const printedTable = page.locator("table").first();
    await expect(printedTable).toContainText(/Wuse Zone 4|Garki|Lagos|Abuja/i);
    await expect(printedTable).not.toContainText(/Plot 14|Herbert Macaulay/i);

    // 5. Notifications: selecting Schedule later without future timestamp rejects cleanly
    await page.getByRole("link", { name: /^Notifications/i }).click();
    await expect(page).toHaveURL(/5174\/notifications$/);
    await page.getByLabel(/Delivery schedule/i).selectOption("later");
    await page.getByLabel(/Notification title/i).fill("Schedule Check");
    await page
      .getByLabel(/Message body/i)
      .fill("Checking future schedule validation in composer.");
    await page
      .locator(".reader-search-list button.reader-search-item")
      .first()
      .click();
    await page.getByRole("button", { name: /Preview Eligible Count/i }).click();
    await expect(
      page.getByText(/Choose a future date and time for scheduled delivery/i),
    ).toBeVisible();

    // 6. Content Editor RBAC UI verification via Activity & Security staff creation
    const editorEmail = `e2e-editor-${Date.now()}@cossyteens.com`;
    const editorPassword = "E2E-Editor-Strong-2027!";
    await page.getByRole("link", { name: /Activity & Security/i }).click();
    await page.getByLabel(/Full name/i).fill("E2E Content Editor");
    await page.getByLabel(/Dedicated staff email/i).fill(editorEmail);
    await page.getByLabel(/Assigned role/i).selectOption("content_editor");
    await page.getByLabel(/Initial temporary password/i).fill(editorPassword);
    await page.getByRole("button", { name: /Create administrator account/i }).click();
    await expect(page.getByText(editorEmail).first()).toBeVisible();

    // Sign in as Content Editor in fresh context & confirm scoped nav + zero fake revenue cards
    const edCtx = await browser.newContext();
    const edPage = await edCtx.newPage();
    await edPage.setViewportSize({ width: 1440, height: 960 });
    await edPage.goto(`${ADMIN_URL}/login`);
    await edPage.getByLabel(/Administrator email/i).fill(editorEmail);
    await edPage.getByLabel(/Administrator password/i).fill(editorPassword);
    await edPage.getByRole("button", { name: /Continue to verification/i }).click();
    await expect(edPage).toHaveURL(/5174\/mfa-setup$/);
    const edManualKey = edPage.locator(".mfa-manual-key");
    await expect(edManualKey).toBeVisible();
    const edSecret = (await edManualKey.textContent())?.trim() || "";
    await edPage
      .getByLabel(/Enter the 6-digit code/i)
      .fill(generateTestTotp(edSecret));
    await edPage.getByRole("button", { name: /Verify & enable MFA/i }).click();
    await edPage.locator('input[type="checkbox"]').check();
    await edPage
      .getByRole("button", { name: /Enter Administration Dashboard/i })
      .click();
    await expect(edPage).toHaveURL(/5174\/dashboard$/);

    await expect(edPage.getByRole("link", { name: /^Devotionals$/i })).toBeVisible();
    await expect(edPage.getByRole("link", { name: /^Readers$/i })).toHaveCount(0);
    await expect(edPage.getByRole("link", { name: /^Payments$/i })).toHaveCount(0);
    await expect(edPage.getByText(/Verified Revenue/i)).toHaveCount(0);

    // 7. Mobile admin viewport 390px: zero horizontal overflow on Devotionals & Readers
    await page.setViewportSize({ width: 390, height: 844 });
    for (const path of ["/devotionals", "/readers", "/notifications"]) {
      await page.goto(`${ADMIN_URL}${path}`);
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
      );
      expect(overflow).toBe(false);
    }

    await edCtx.close();
    await adminCtx.close();
  });
});

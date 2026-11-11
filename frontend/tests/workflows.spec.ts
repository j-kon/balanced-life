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

function cleanupTestRecords(sqlite: Database.Database) {
  const testUsers = sqlite
    .prepare(`SELECT id FROM users WHERE email IN (?, ?)`)
    .all(adminEmail, readerEmail) as { id: number }[];
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
    .prepare(`SELECT id FROM admin_users WHERE email = ?`)
    .all(adminEmail) as { id: number }[];
  for (const adm of testAdmins) {
    sqlite.prepare(`DELETE FROM admin_sessions WHERE admin_id = ?`).run(adm.id);
    sqlite.prepare(`DELETE FROM admin_mfa_recovery_codes WHERE admin_id = ?`).run(adm.id);
    sqlite.prepare(`DELETE FROM admin_password_reset_tokens WHERE admin_id = ?`).run(adm.id);
    sqlite.prepare(`DELETE FROM admin_audit_logs WHERE admin_id = ? OR actor_email = ?`).run(adm.id, adminEmail);
    sqlite.prepare(`DELETE FROM subscriptions WHERE granted_by_admin_id = ?`).run(adm.id);
    sqlite.prepare(`DELETE FROM digital_entitlements WHERE granted_by_admin_id = ?`).run(adm.id);
    sqlite.prepare(`DELETE FROM digital_purchases WHERE verified_by_admin_id = ?`).run(adm.id);
    sqlite.prepare(`DELETE FROM printed_orders WHERE verified_by_admin_id = ?`).run(adm.id);
    sqlite.prepare(`DELETE FROM admin_users WHERE id = ?`).run(adm.id);
  }
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

test.beforeAll(() => {
  const sqlite = new Database(dbPath);
  cleanupTestRecords(sqlite);
  const now = new Date().toISOString();
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
    for (const width of [768, 430, 390, 360]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/");
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
      page.getByRole("heading", { name: /A little time to grow/i }),
    ).toBeVisible();

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

    // Sign out and sign back in with updated password
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/(login)?$/);

    await page.goto("/login");
    await page.getByLabel(/Email address/i).fill(readerEmail);
    await page.getByLabel(/^Password/i).fill(readerUpdatedPassword);
    await page.getByRole("button", { name: /^Sign in$/i }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
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

    // Verify Overview shows Verified revenue and Digital editions sold
    await expect(
      page.getByText(/Verified revenue/i).first(),
    ).toBeVisible();
    await expect(
      page.getByText(/Digital editions sold/i).first(),
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
      .fill("E2E complimentary membership grant verification");
    await page
      .getByRole("button", { name: /Confirm complimentary grant/i })
      .click();
    await expect(page.getByText(/Changes saved/i)).toBeVisible();

    // Devotionals route: approve & publish 2027-01-08
    await page.getByRole("link", { name: /^Devotionals$/i }).click();
    await expect(page).toHaveURL(/5174\/devotionals$/);
    await page
      .getByPlaceholder(/Find a title or date/i)
      .fill("2027-01-08");
    const entryRow = page.locator("tr", { hasText: "2027-01-08" });
    await expect(entryRow).toBeVisible();
    await entryRow.getByRole("button", { name: /Approve & publish/i }).click();
    await expect(page.getByText(/Changes saved/i)).toBeVisible();

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
    await entryRow.getByRole("button", { name: /Unpublish/i }).click();
    await expect(adminPage.getByText(/Changes saved/i)).toBeVisible();
    await adminCtx.close();
  });
});

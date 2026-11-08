import path from "node:path";
import { randomBytes, scryptSync } from "node:crypto";
import Database from "better-sqlite3";
import { test, expect } from "@playwright/test";

function hashTestPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

const dbPath = path.resolve(
  import.meta.dirname,
  "../../backend/data/devotional.sqlite",
);

const adminEmail = "admin-e2e@cossyteens.org";
const adminPassword = "AdminPass!2027Secure";
const readerEmail = "reader-e2e@cossyteens.org";
const readerPassword = "ReaderPass!2027Secure";
const readerUpdatedPassword = "ReaderNewPass!2027Secure";

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
    sqlite
      .prepare(
        `DELETE FROM subscriptions WHERE user_id = ? OR granted_by_admin_id = ?`,
      )
      .run(id, id);
    sqlite.prepare(`DELETE FROM admin_audit_logs WHERE admin_id = ?`).run(id);
    sqlite
      .prepare(`DELETE FROM password_reset_tokens WHERE user_id = ?`)
      .run(id);
    sqlite.prepare(`DELETE FROM users WHERE id = ?`).run(id);
  }
  sqlite
    .prepare(`DELETE FROM hardcover_inquiries WHERE email = ?`)
    .run(readerEmail);
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
      `INSERT INTO users (name, email, password_hash, role, status, suspended_reason, created_at, updated_at)
       VALUES (?, ?, ?, 'admin', 'active', '', ?, ?)`,
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

    await page.goto("/forgot-password");
    await expect(
      page.getByRole("heading", { name: /Forgot password/i }),
    ).toBeVisible();

    // Submit printed copy inquiry on /bookstore
    await page.goto("/bookstore");
    await expect(
      page.getByRole("heading", { name: /The printed companion/i }),
    ).toBeVisible();
    await expect(page.getByText(/₦5,000/i).first()).toBeVisible();
    await page.getByLabel(/Your full name/i).fill("E2E Reader");
    await page.getByLabel(/Email address/i).fill(readerEmail);
    await page.getByLabel(/Phone \/ WhatsApp number/i).fill("+2348000000001");
    await page.getByLabel(/Number of copies/i).fill("3");
    await page.getByLabel(/City \/ Delivery location/i).fill("Lagos, Nigeria");
    await page
      .getByLabel(/Additional notes/i)
      .fill("Requesting 3 printed copies for youth fellowship.");
    await page
      .getByRole("button", { name: /Submit printed copy inquiry/i })
      .click();
    await expect(
      page.getByText(/Printed copy inquiry received/i),
    ).toBeVisible();

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

  test("3. Administrator dashboard: metrics, complimentary access grant, devotional review/publish, bulk orders, and bookstore management", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto("/login");
    await page.getByLabel(/Email address/i).fill(adminEmail);
    await page.getByLabel(/^Password/i).fill(adminPassword);
    await page.getByRole("button", { name: /^Sign in$/i }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto("/admin");
    await expect(
      page.getByRole("heading", { name: /The author's desk/i }),
    ).toBeVisible();

    // Verify Overview shows Verified revenue and Digital editions sold
    await expect(
      page.getByText(/Verified revenue/i).first(),
    ).toBeVisible();
    await expect(
      page.getByText(/Digital editions sold/i).first(),
    ).toBeVisible();

    // Readers tab: search for our E2E reader and grant complimentary access
    await page.getByRole("button", { name: /^Readers$/i }).click();
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

    // Devotionals tab: filter for 2027-01-08 (draft), approve & publish it
    await page.getByRole("button", { name: /^Devotionals$/i }).click();
    await page
      .getByPlaceholder(/Find a title or date/i)
      .fill("2027-01-08");
    const entryRow = page.locator("tr", { hasText: "2027-01-08" });
    await expect(entryRow).toBeVisible();
    await entryRow.getByRole("button", { name: /Approve & publish/i }).click();
    await expect(page.getByText(/Changes saved/i)).toBeVisible();

    // Bookstore tab: verify printed copy inquiry from test 1 and update its status
    await page.getByRole("button", { name: /^Bookstore$/i }).click();
    await expect(page.getByText(readerEmail).first()).toBeVisible();
    await page
      .getByRole("button", { name: /Mark contacted/i })
      .first()
      .click();
    await expect(page.getByText(/Changes saved/i)).toBeVisible();
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

    // Clean up published state of 2027-01-08 via Admin
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/(login)?$/);
    await page.goto("/login");
    await page.getByLabel(/Email address/i).fill(adminEmail);
    await page.getByLabel(/^Password/i).fill(adminPassword);
    await page.getByRole("button", { name: /^Sign in$/i }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto("/admin");
    await page.getByRole("button", { name: /^Devotionals$/i }).click();
    await page
      .getByPlaceholder(/Find a title or date/i)
      .fill("2027-01-08");
    const entryRow = page.locator("tr", { hasText: "2027-01-08" });
    await entryRow.getByRole("button", { name: /Unpublish/i }).click();
    await expect(page.getByText(/Changes saved/i)).toBeVisible();
  });
});

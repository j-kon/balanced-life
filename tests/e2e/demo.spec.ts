import { test, expect } from "@playwright/test";
for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
]) {
  test("complete local demo at " + viewport.width + "px", async ({ page }) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Grow in faith. Find your balance." }),
    ).toBeVisible();
    await expect(
      page.getByAltText("The Balanced Life Devotional book cover"),
    ).toBeVisible();
    await expect
      .poll(() =>
        page
          .getByAltText("The Balanced Life Devotional book cover")
          .evaluate((img: HTMLImageElement) => img.naturalWidth),
      )
      .toBeGreaterThan(0);
    await page.screenshot({
      path: "tmp/home-" + viewport.width + ".png",
      fullPage: true,
    });
    await page.goto("/sample");
    await expect(
      page.getByRole("heading", { name: "THANK GOD, WE MADE IT." }),
    ).toBeVisible();
    await expect(page.getByText(/Before you write one goal/)).toBeVisible();
    await page.goto("/login");
    await page.getByRole("button", { name: "Subscriber", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: /A little time to grow/ }),
    ).toBeVisible();
    await page.screenshot({
      path: "tmp/dashboard-" + viewport.width + ".png",
      fullPage: true,
    });
    await page.getByRole("link", { name: "Pause & read" }).click();
    await expect(
      page.getByRole("heading", { name: "THANK GOD, WE MADE IT." }),
    ).toBeVisible();
    await page.screenshot({
      path: "tmp/reading-" + viewport.width + ".png",
      fullPage: true,
    });
    const save = page.getByRole("button", {
      name: "Save reading",
      exact: true,
    });
    if (await save.count()) await save.click();
    await expect(
      page.getByRole("button", { name: "Saved", exact: true }),
    ).toBeVisible();
    const complete = page.getByRole("button", {
      name: "Mark as completed",
      exact: true,
    });
    if (await complete.count()) await complete.click();
    await expect(
      page.getByRole("button", { name: "Completed · undo" }),
    ).toBeVisible();
    const reflection =
      "Browser verification reflection " + viewport.width + " " + Date.now();
    await page.getByLabel("Your reflection", { exact: true }).fill(reflection);
    await page
      .getByRole("button", { name: "Save reflection", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("Reflection saved");
    await page.goto("/journal");
    await expect(page.getByText(reflection, { exact: true })).toBeVisible();
    page.once("dialog", (dialog) => dialog.accept());
    await page
      .locator(".journal-entry")
      .filter({ hasText: reflection })
      .getByRole("button", { name: "Delete reflection" })
      .click();
    await expect(page.getByText(reflection, { exact: true })).toHaveCount(0);
    await page.goto("/library");
    await page
      .getByRole("textbox", { name: "Search devotionals" })
      .fill("WHO AM I");
    await expect(page.locator(".entry-card")).toHaveCount(1);
    await page.goto("/register");
    const email = "e2e-" + viewport.width + "-" + Date.now() + "@example.test";
    await page
      .getByLabel("Your name", { exact: true })
      .fill("Demo Test Reader");
    await page.getByLabel("Email address", { exact: true }).fill(email);
    await page
      .getByLabel("Password", { exact: true })
      .fill("Browser-Test-2027!");
    await page
      .getByRole("button", { name: "Create account", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: /A little time to grow/ }),
    ).toBeVisible();
    await page.goto("/library");
    await page.getByRole("heading", { name: "WHO AM I?", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("active membership");
    await page.goto("/pricing");
    await page
      .getByRole("link", { name: "Choose monthly", exact: true })
      .click();
    await expect(page.getByText("Demo Payment", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: /Simulate payment/ }).click();
    await expect(
      page.getByRole("heading", { name: "Your membership", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".membership-panel")).toContainText("Monthly");
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await page.getByRole("button", { name: "Cancel future renewal" }).click();
    await expect(
      page.getByText("Renewal: Cancelled — access remains until expiry"),
    ).toBeVisible();
    await page.goto("/library");
    await page.getByRole("heading", { name: "WHO AM I?", exact: true }).click();
    await expect(
      page.getByText(/A new year often makes people ask/),
    ).toBeVisible();
    await page.goto("/login");
    await page.getByRole("button", { name: "Admin", exact: true }).click();
    await page.goto("/admin");
    await expect(
      page.getByRole("heading", { name: "The author's desk" }),
    ).toBeVisible();
    await page.screenshot({
      path: "tmp/admin-" + viewport.width + ".png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Devotionals", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Find an admin devotional" })
      .fill("2027-01-01");
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await page
      .getByRole("button", { name: "Edit", exact: true })
      .first()
      .click();
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
      "THANK GOD, WE MADE IT.",
    );
    await page
      .getByRole("button", { name: "Save devotional", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Devotional collection" }),
    ).toBeVisible();
    for (const path of [
      "/about",
      "/pricing",
      "/bookstore",
      "/dashboard",
      "/library",
      "/journal",
      "/subscription",
      "/admin",
    ]) {
      await page.goto(path);
      await expect(page.locator("h1,h2").first()).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        path + " must fit viewport",
      ).toBe(true);
    }
    expect(errors).toEqual([]);
  });
}

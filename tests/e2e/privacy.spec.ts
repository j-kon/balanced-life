import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
test("development server never serves private manuscript or database files", async ({
  request,
}) => {
  for (const file of [
    "private/manuscript/devotional-2027.pdf",
    "private/manuscript/extracted/entries.json",
    "backend/data/devotional.sqlite",
    "backend/src/demo-seed.ts",
  ]) {
    const result = await request.get("/@fs/" + resolve(file));
    expect(result.status(), file + " must be inaccessible").toBe(403);
  }
});
test("public bundle and service worker contain no private content caches", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Grow in faith. Find your balance." }),
  ).toBeVisible();
  const sw = await request.get("/sw.js");
  expect(await sw.text()).not.toContain("cache.addAll(['/api");
  await page.evaluate(() => navigator.serviceWorker.ready);
  const cached = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const key of await caches.keys()) {
      const cache = await caches.open(key);
      urls.push(...(await cache.keys()).map((r) => new URL(r.url).pathname));
    }
    return urls;
  });
  expect(cached.length).toBeGreaterThan(0);
  for (const url of cached)
    expect([
      "/icon.svg",
      "/icon-192.png",
      "/icon-512.png",
      "/manifest.webmanifest",
    ]).toContain(url);
});

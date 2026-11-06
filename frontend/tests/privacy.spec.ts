import path from "node:path";
import { test, expect } from "@playwright/test";

const repoRoot = path.resolve(import.meta.dirname, "../..");

test.describe("Filesystem & PWA Privacy Boundaries", () => {
  test("Vite dev server denies /@fs/ access to private manuscript and backend files", async ({
    request,
  }) => {
    const blockedPaths = [
      path.join(repoRoot, "private/manuscript/devotional-2027.pdf"),
      path.join(repoRoot, "private/manuscript/extracted/entries.json"),
      path.join(repoRoot, "backend/data/devotional.sqlite"),
      path.join(repoRoot, "backend/src/app.ts"),
    ];

    for (const filePath of blockedPaths) {
      const normalized = filePath.startsWith("/") ? filePath : `/${filePath}`;
      const res = await request.get(`/@fs${normalized}`);
      expect(
        res.status(),
        `Expected 403 for ${normalized}, got ${res.status()}`,
      ).toBe(403);
    }
  });

  test("Service worker only caches static public shell assets and never caches API devotional payloads", async ({
    request,
  }) => {
    const swRes = await request.get("/sw.js");
    expect(swRes.status()).toBe(200);
    const swSource = await swRes.text();
    expect(swSource).toContain("/manifest.webmanifest");
    expect(swSource).toContain("/icon.svg");
    expect(swSource).not.toContain("/api/");
  });
});


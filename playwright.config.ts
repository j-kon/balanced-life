import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "frontend/tests",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5173",
    channel: process.env.PLAYWRIGHT_CHANNEL || (process.env.CI ? undefined : "chrome"),
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  outputDir: "test-results/playwright",
});

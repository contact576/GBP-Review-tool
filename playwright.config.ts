import path from "node:path";
import { defineConfig } from "@playwright/test";

/**
 * E2E config for the Foundly app.
 *
 * - Reuses the already-running prod server on :3200 (in-memory provider, no
 *   env vars — registrations persist for the lifetime of the server process).
 * - Two projects: "desktop" runs every spec; "mobile" runs only the customer
 *   review flow (the phone-first surface).
 * - workers=2 with fullyParallel=false: files run in parallel, tests within a
 *   file run serially — avoids demo-workspace write races.
 * - Uses Playwright's installed Chromium by default. Developers can set
 *   PLAYWRIGHT_CHROMIUM_PATH when they intentionally use a system browser.
 */

const browserPath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
const startCommand = "npm run start -- --port 3200";

export default defineConfig({
  testDir: "e2e",
  outputDir: path.resolve("test-results"),
  fullyParallel: false,
  workers: 2,
  retries: 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["line"]],
  use: {
    baseURL: "http://localhost:3200",
    launchOptions: browserPath ? { executablePath: browserPath } : undefined,
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: { viewport: { width: 1440, height: 900 } },
    },
    {
      name: "mobile",
      testMatch: /customer-flow\.spec\.ts/,
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: startCommand,
    port: 3200,
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      AUTH_SECRET: process.env.AUTH_SECRET || "foundly-e2e-auth-secret-not-for-production",
      ENCRYPTION_SECRET:
        process.env.ENCRYPTION_SECRET || "foundly-e2e-encryption-secret-not-for-production",
    },
  },
});

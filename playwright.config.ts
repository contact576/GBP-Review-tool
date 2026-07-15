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
 * - Chromium is preinstalled; the pinned Playwright revision (1228) is not on
 *   disk, so we point at the provided binary explicitly.
 */

const CHROMIUM =
  process.env.PLAYWRIGHT_CHROMIUM_PATH || "/opt/pw-browsers/chromium";

export default defineConfig({
  testDir: "e2e",
  outputDir:
    "/tmp/claude-0/-home-user-GBP-Review-tool/52646828-c49a-5e91-af0f-951c89cb31ad/scratchpad/test-results",
  fullyParallel: false,
  workers: 2,
  retries: 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["line"]],
  use: {
    baseURL: "http://localhost:3200",
    launchOptions: { executablePath: CHROMIUM },
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
    command: "PORT=3200 npm run start",
    port: 3200,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});

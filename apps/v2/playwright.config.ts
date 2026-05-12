import { defineConfig, devices } from "@playwright/test";

// MVP minimal: Chromium only, single test, no CI integration.
// Spawns the Next.js dev server automatically against .env.local.

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /.*\.spec\.ts/,
  timeout: 60_000,
  fullyParallel: false, // chat send mutates DB; serialise to avoid noise
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    storageState: "tests/e2e/.auth/state.json",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 60_000,
  },
  globalSetup: "./tests/e2e/global-setup.ts",
});

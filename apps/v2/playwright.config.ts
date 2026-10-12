import { defineConfig, devices } from "@playwright/test";
import { assertE2ETestTarget } from "./tests/e2e/safety";

// MVP minimal: Chromium only, single test, no CI integration.
// Starts only after the operator explicitly selects an isolated test DB.
assertE2ETestTarget();

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /.*\.spec\.ts/,
  timeout: 60_000,
  fullyParallel: false, // chat send mutates DB; serialise to avoid noise
  workers: 1,
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
    reuseExistingServer: false,
    timeout: 60_000,
  },
  globalSetup: "./tests/e2e/global-setup.ts",
});

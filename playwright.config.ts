import { defineConfig, devices } from "@playwright/test";

// Tier-3 tests: drive the real canvas grid in a real browser against `npm run dev`.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  // Canvas key-event timing can jitter; retry these inherently flaky interactions.
  retries: 2,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:1420",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:1420",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});

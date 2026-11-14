import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT || 8787);

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never" }]]
    : [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run start",
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      PORT: String(PORT),
      AUTH_RATE_LIMIT: "1000",
      NODE_ENV: "test",
      // Keep test signups, sessions and telemetry out of the shipped demo DB.
      DTCW_DB_PATH: process.env.E2E_DB_PATH || "server/data/dtcw-e2e.sqlite",
    },
  },
});

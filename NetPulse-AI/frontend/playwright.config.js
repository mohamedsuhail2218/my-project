import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright configuration for NetPulse AI.
 *
 * The suite runs against the real FastAPI backend and the Vite dev server.
 * Both servers are reused when they are already running locally; otherwise
 * Playwright starts them for the duration of the test session.
 */
export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: '../reports/playwright-report', open: 'never' }],
    ['junit', { outputFile: '../reports/test-runs/frontend-junit.xml' }],
  ],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:5173',
    viewport: { width: 1440, height: 960 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    acceptDownloads: true,
    // Some managed Windows machines block Playwright's bundled headless shell.
    // System Chrome is used by default; override with PLAYWRIGHT_CHANNEL=msedge
    // or PLAYWRIGHT_CHANNEL=chromium on other setups.
    channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 960 } },
    },
  ],
  webServer: [
    {
      command: 'npm.cmd run dev -- --port 5173 --strictPort',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: '..\\backend\\.venv\\Scripts\\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000',
      cwd: '../backend',
      url: 'http://127.0.0.1:8000/api/health',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
})

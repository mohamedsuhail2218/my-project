/**
 * Capture the screenshots used by the final-year project documentation.
 *
 * Run while the backend and frontend are running:
 *   npm.cmd run docs:screenshots
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { login, readCredentials } from '../e2e/helpers.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUTPUT_DIR = path.resolve(__dirname, '../../documentation/screenshots')
const BASE_URL = process.env.E2E_BASE_URL || 'http://127.0.0.1:5173'

const PAGES = [
  { file: '02-overview.png', url: '/', marker: 'Live health index', fullPage: true },
  { file: '03-network-monitoring.png', url: '/monitoring', marker: 'Live latency timeline', fullPage: false },
  { file: '04-access-points.png', url: '/access-points', marker: 'Access point inventory', fullPage: true },
  { file: '06-connected-devices.png', url: '/devices', marker: 'Device registry', fullPage: true },
  { file: '07-ai-anomaly-detection.png', url: '/anomalies', marker: 'Detected anomalies', fullPage: false },
  { file: '08-smart-troubleshooting.png', url: '/troubleshooting', marker: 'Safety guardrails', fullPage: true },
  { file: '09-issue-management.png', url: '/issues', marker: 'Ticket register', fullPage: true },
  { file: '11-automation-testing.png', url: '/testing', marker: 'Automation testing', fullPage: false },
  { file: '12-reports.png', url: '/reports', marker: 'Report studio', fullPage: true },
  { file: '13-settings.png', url: '/settings', marker: 'Monitoring thresholds', fullPage: true },
  { file: '18-predictive-analytics.png', url: '/predictive', marker: 'Failure risk by scope', fullPage: true },
  { file: '19-root-cause-analysis.png', url: '/root-cause', marker: 'Investigation queue', fullPage: true },
  { file: '20-cybersecurity-intelligence.png', url: '/security', marker: 'Security findings', fullPage: true },
  { file: '21-network-optimization.png', url: '/optimization', marker: 'Optimisation advisory', fullPage: true },
]

fs.mkdirSync(OUTPUT_DIR, { recursive: true })

const browser = await chromium.launch({
  channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
})
const context = await browser.newContext({
  baseURL: BASE_URL,
  viewport: { width: 1440, height: 960 },
})

async function settle(page) {
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
}

async function capture(page, file, { fullPage = true } = {}) {
  const target = path.join(OUTPUT_DIR, file)
  // Fast-forward finite entrance animations so dialogs and drawers are fully visible.
  await page.screenshot({ path: target, fullPage, animations: 'disabled' })
  const size = fs.statSync(target).size
  console.log(`saved ${file} (${Math.round(size / 1024)} KB)`)
}

try {
  const page = await context.newPage()

  await page.goto('/login')
  await page.getByRole('heading', { name: 'Welcome back' }).waitFor()
  await settle(page)
  await capture(page, '01-login.png')

  await login(page)
  await settle(page)

  for (const item of PAGES) {
    await page.goto(item.url)
    await page.getByText(item.marker).first().waitFor({ timeout: 20_000 })
    await settle(page)
    await capture(page, item.file, { fullPage: item.fullPage })
  }

  // Access point detail dialog
  await page.goto('/access-points')
  await page.getByRole('heading', { name: 'Access point inventory' }).waitFor()
  await page.getByRole('button', { name: 'View details' }).first().click()
  await page.getByText('Registered details').waitFor()
  await settle(page)
  await capture(page, '05-access-point-detail.png', { fullPage: false })
  await page.getByRole('dialog').getByRole('button', { name: 'Close dialog' }).click()

  // Manual ticket dialog
  await page.goto('/issues')
  await page.getByRole('heading', { name: 'Ticket register' }).waitFor()
  await page.getByRole('button', { name: 'New ticket' }).click()
  await page.getByRole('dialog', { name: 'Create issue ticket' }).waitFor()
  await settle(page)
  await capture(page, '10-create-ticket.png', { fullPage: false })
  await page.getByRole('dialog').getByRole('button', { name: 'Close dialog' }).click()

  // Command palette
  await page.keyboard.press('Control+k')
  await page.getByRole('dialog', { name: 'Command palette' }).waitFor()
  await settle(page)
  await capture(page, '14-command-palette.png', { fullPage: false })
  await page.keyboard.press('Escape')

  // Light theme
  await page.goto('/')
  await page.getByText('Live health index').waitFor()
  await page.getByRole('button', { name: 'Switch to light theme' }).click()
  await settle(page)
  await capture(page, '15-overview-light.png')
  await page.getByRole('button', { name: 'Switch to dark theme' }).click()

  // Mobile layout
  const mobile = await browser.newContext({
    baseURL: BASE_URL,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  })
  const mobilePage = await mobile.newPage()
  await login(mobilePage)
  await settle(mobilePage)
  await capture(mobilePage, '16-mobile-overview.png')
  await mobilePage.getByRole('button', { name: 'Open navigation' }).click()
  await mobilePage.getByRole('navigation', { name: 'Main navigation' }).waitFor()
  await capture(mobilePage, '17-mobile-navigation.png', { fullPage: false })
  await mobile.close()

  console.log(`\nDocumentation screenshots written to ${OUTPUT_DIR}`)
} finally {
  await context.close()
  await browser.close()
}

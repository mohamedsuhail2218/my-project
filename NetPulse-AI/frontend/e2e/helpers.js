import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect } from '@playwright/test'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Read the local administrator credentials.
 *
 * CI or another machine can supply E2E_EMAIL / E2E_PASSWORD. Locally the values
 * are read from backend/.env so no credentials are committed to the repository.
 */
export function readCredentials() {
  if (process.env.E2E_EMAIL && process.env.E2E_PASSWORD) {
    return { email: process.env.E2E_EMAIL, password: process.env.E2E_PASSWORD }
  }

  const envPath = path.resolve(__dirname, '../../backend/.env')
  if (!fs.existsSync(envPath)) {
    throw new Error(
      `Cannot find ${envPath}. Create backend/.env or set E2E_EMAIL and E2E_PASSWORD.`,
    )
  }

  const values = {}
  for (const rawLine of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const separator = line.indexOf('=')
    if (separator < 1) continue
    const key = line.slice(0, separator).trim()
    let value = line.slice(separator + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    values[key] = value
  }

  if (!values.ADMIN_EMAIL || !values.ADMIN_PASSWORD) {
    throw new Error('backend/.env must define ADMIN_EMAIL and ADMIN_PASSWORD for E2E tests.')
  }
  return { email: values.ADMIN_EMAIL, password: values.ADMIN_PASSWORD }
}

/** Sign in through the real login form and wait until the dashboard is ready. */
export async function login(page, credentials = readCredentials()) {
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
  await page.getByLabel('Email address', { exact: true }).fill(credentials.email)
  await page.getByLabel('Password', { exact: true }).fill(credentials.password)
  await page.getByRole('button', { name: /sign in to workspace/i }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByText('Live health index')).toBeVisible()
}

/** Find a visible toast by its body text. */
export function toast(page, text) {
  return page.getByRole('status').filter({ hasText: text })
}

/** Navigate through the sidebar and wait for the module heading to render. */
export async function openModule(page, linkName, headingName = linkName) {
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: linkName, exact: true })
    .click()
  await expect(
    page.getByRole('heading', { level: 1, name: headingName }),
  ).toBeVisible()
}

/**
 * Open a legacy module by URL.
 *
 * The sidebar now exposes ten task-focused modules. Deep functionality such as
 * the access-point inventory and issue register remains available from the
 * command palette and by direct link, so these tests keep exercising it.
 */
export async function openLegacyModule(page, path, headingName) {
  await page.goto(path)
  await expect(
    page.getByRole('heading', { level: 1, name: headingName }),
  ).toBeVisible()
}

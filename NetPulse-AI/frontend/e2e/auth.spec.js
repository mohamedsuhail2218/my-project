import { test, expect } from '@playwright/test'
import { login, readCredentials } from './helpers'

test.describe('Authentication and access control', () => {
  test('an anonymous visitor is redirected to the login page', async ({ page }) => {
    await page.goto('/monitoring')

    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
    await expect(page.getByLabel('Email address')).toBeVisible()
    await expect(page.getByText(/Authorized network monitoring only/)).toBeVisible()
  })

  test('the login form rejects an incorrect password', async ({ page }) => {
    const { email } = readCredentials()
    await page.goto('/login')
    await page.getByLabel('Email address', { exact: true }).fill(email)
    await page.getByLabel('Password', { exact: true }).fill('DefinitelyWrongPass123!')
    await page.getByRole('button', { name: /sign in to workspace/i }).click()

    await expect(page.getByText('Invalid email or password')).toBeVisible()
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByText('Live health index')).toHaveCount(0)
  })

  test('the administrator can sign in and the session survives a reload', async ({ page }) => {
    await login(page)

    await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Network state' })).toBeVisible()
    await expect(page.getByText('Live probes').first()).toBeVisible()
    await expect(page.getByText('admin@netpulse.ai').first()).toBeVisible()

    await page.reload()
    await expect(page.getByText('Live health index')).toBeVisible()
    await expect(page).not.toHaveURL(/\/login$/)
  })

  test('sign out clears the browser session', async ({ page }) => {
    await login(page)

    await page.getByRole('button', { name: 'Open user menu' }).click()
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/login$/)

    await page.goto('/reports')
    await expect(page).toHaveURL(/\/login$/)
  })
})

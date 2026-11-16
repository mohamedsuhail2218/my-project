import { test, expect } from '@playwright/test'
import { login } from './helpers'

test.use({ viewport: { width: 390, height: 844 } })

test.describe('Responsive layout', () => {
  test('mobile navigation opens, navigates and closes', async ({ page }) => {
    await login(page)

    const navigation = page.getByRole('navigation', { name: 'Main navigation' })
    await expect(navigation).not.toBeInViewport()

    await page.getByRole('button', { name: 'Open navigation' }).click()
    await expect(navigation).toBeInViewport()
    await page.getByRole('link', { name: 'Issue Management', exact: true }).click()

    await expect(page.getByRole('heading', { level: 1, name: 'Issue management' })).toBeVisible()
    await expect(navigation).not.toBeInViewport()
  })

  test('the dashboard does not overflow the mobile viewport', async ({ page }) => {
    await login(page)

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }))
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth + 1)
  })
})

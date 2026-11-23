import { test, expect } from '@playwright/test'
import { login, openModule } from './helpers'

const MODULES = [
  { link: 'Overview', heading: 'Overview', marker: 'Live health index' },
  { link: 'Real-Time Monitoring', heading: 'Network monitoring', marker: 'Live latency timeline' },
  { link: 'Predictive Analytics', heading: 'Predictive analytics', marker: 'Failure risk by scope' },
  { link: 'Root Cause Analysis', heading: 'Root cause analysis', marker: 'Investigation queue' },
  { link: 'Cybersecurity Intelligence', heading: 'Cybersecurity', marker: 'Defensive posture' },
  { link: 'Network Optimization', heading: 'Network optimization', marker: 'Optimisation advisory' },
  { link: 'Devices & Access Points', heading: 'Connected devices', marker: 'Device registry' },
  { link: 'Anomalies & Issues', heading: 'AI anomaly detection', marker: 'Detected anomalies' },
  { link: 'Reports & Analytics', heading: 'Reports', marker: 'Report studio' },
  { link: 'Settings', heading: 'Settings', marker: 'Monitoring thresholds' },
]

test.describe('Workspace navigation', () => {
  test('every sidebar module renders its own content without runtime errors', async ({ page }) => {
    const errors = []
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`console: ${message.text()}`)
    })
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))

    await login(page)
    await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link')).toHaveCount(10)

    for (const module of MODULES) {
      await openModule(page, module.link, module.heading)
      await expect(page.getByText(module.marker).first()).toBeVisible()
      await expect(page.getByText('Something went wrong')).toHaveCount(0)
      await expect(page.getByText('Unable to load data')).toHaveCount(0)
    }

    expect(errors).toEqual([])
  })

  test('deep links load the requested module and unknown paths show the not-found page', async ({ page }) => {
    await login(page)

    await page.goto('/reports')
    await expect(page.getByRole('heading', { level: 1, name: 'Reports' })).toBeVisible()
    await expect(page.getByText('Report studio')).toBeVisible()

    for (const path of ['/predictive', '/root-cause', '/security', '/optimization']) {
      await page.goto(path)
      await expect(page.getByText('Something went wrong')).toHaveCount(0)
      await expect(page.getByText('Unable to load data')).toHaveCount(0)
    }

    await page.goto('/this-route-does-not-exist')
    await expect(
      page.getByRole('heading', { level: 1, name: 'This route is off the network map' }),
    ).toBeVisible()
    await expect(page.getByText(/does not exist in the NetPulse workspace/)).toBeVisible()
  })

  test('legacy modules remain reachable through the command palette', async ({ page }) => {
    await login(page)
    await page.keyboard.press('Control+k')
    await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible()
    await page.getByPlaceholder('Search modules…').fill('Access Point Inventory')
    await page.getByRole('button', { name: /Access Point Inventory/ }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Access points' })).toBeVisible()
  })
})

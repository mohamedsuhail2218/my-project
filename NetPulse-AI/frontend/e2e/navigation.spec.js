import { test, expect } from '@playwright/test'
import { login, openModule } from './helpers'

const MODULES = [
  { link: 'Overview', heading: 'Overview', marker: 'Live health index' },
  { link: 'Network Monitoring', heading: 'Network monitoring', marker: 'Live latency timeline' },
  { link: 'Access Points', heading: 'Access points', marker: 'Access point inventory' },
  { link: 'Connected Devices', heading: 'Connected devices', marker: 'Device registry' },
  { link: 'AI Anomaly Detection', heading: 'AI anomaly detection', marker: 'Detected anomalies' },
  { link: 'Smart Troubleshooting', heading: 'Smart troubleshooting', marker: 'Safety guardrails' },
  { link: 'Issue Management', heading: 'Issue management', marker: 'Ticket register' },
  { link: 'Automation Testing', heading: 'Automation testing', marker: 'Automation testing' },
  { link: 'Reports', heading: 'Reports', marker: 'Report studio' },
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

    await page.goto('/this-route-does-not-exist')
    await expect(
      page.getByRole('heading', { level: 1, name: 'This route is off the network map' }),
    ).toBeVisible()
    await expect(page.getByText(/does not exist in the NetPulse workspace/)).toBeVisible()
  })
})

import { test, expect } from '@playwright/test'
import { login, openModule, toast } from './helpers'

test.beforeEach(async ({ page }) => {
  await login(page)
})

test.describe('Workspace interactions', () => {
  test('light theme toggles, persists after reload and can be restored', async ({ page }) => {
    await page.getByRole('button', { name: 'Switch to light theme' }).click()
    await expect(page.locator('html')).not.toHaveClass(/dark/)
    expect(await page.evaluate(() => localStorage.getItem('netpulse_theme'))).toBe('light')

    await page.reload()
    await expect(page.getByText('Live health index')).toBeVisible()
    await expect(page.locator('html')).not.toHaveClass(/dark/)

    await page.getByRole('button', { name: 'Switch to dark theme' }).click()
    await expect(page.locator('html')).toHaveClass(/dark/)
  })

  test('the command palette jumps between modules', async ({ page }) => {
    await page.keyboard.press('Control+k')
    const palette = page.getByRole('dialog', { name: 'Command palette' })
    await expect(palette).toBeVisible()
    await palette.getByRole('textbox').fill('reports')
    await palette.getByRole('button', { name: /Reports/ }).click()

    await expect(page).toHaveURL(/\/reports$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Reports' })).toBeVisible()

    await page.keyboard.press('Control+k')
    await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Command palette' })).toHaveCount(0)
  })

  test('access point details open, simulated checks run and the dialog closes', async ({ page }) => {
    await openModule(page, 'Access Points')
    await expect(page.getByText('Access point inventory')).toBeVisible()

    const simulatedRow = page.getByRole('row').filter({ hasText: '[DEMO]' }).first()
    await expect(simulatedRow).toBeVisible()

    await simulatedRow.getByRole('button', { name: 'View details' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('This is a simulation record')).toBeVisible()
    await expect(dialog.getByText('Registered details')).toBeVisible()
    await expect(dialog.getByRole('heading', { name: 'Configuration history' })).toBeVisible()
    await dialog.getByRole('button', { name: 'Close dialog' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    await simulatedRow.getByRole('button', { name: 'Check', exact: true }).click()
    await expect(toast(page, 'simulated availability check')).toBeVisible()
  })

  test('access point create, edit and delete lifecycle', async ({ page }) => {
    const suffix = Date.now().toString().slice(-6)
    const name = `E2E Lab AP ${suffix}`
    const ip = `192.0.2.${(Number(suffix) % 200) + 10}`

    await openModule(page, 'Access Points')
    await page.getByRole('button', { name: 'Add access point' }).click()

    const createDialog = page.getByRole('dialog', { name: 'Register access point' })
    await createDialog.getByLabel('Access point name').fill(name)
    await createDialog.getByLabel('Location').fill('E2E Building, Room 101')
    await createDialog.getByLabel('Management IP address').fill(ip)
    await createDialog.getByLabel('Vendor').fill('NetPulse Labs')
    await createDialog.getByLabel('Notes').fill('Created and removed by the Playwright suite.')
    await createDialog.getByRole('button', { name: 'Register device' }).click()

    await expect(toast(page, 'Access point registered')).toBeVisible()
    const row = page.getByRole('row').filter({ hasText: name })
    await expect(row).toBeVisible()
    await expect(row.getByText('Real', { exact: true })).toBeVisible()

    await row.getByRole('button', { name: 'Edit access point' }).click()
    const editDialog = page.getByRole('dialog', { name: 'Edit access point' })
    await editDialog.getByLabel('Location').fill('E2E Building, Room 202')
    await editDialog.getByRole('button', { name: 'Save changes' }).click()
    await expect(toast(page, 'Access point configuration updated')).toBeVisible()

    const updatedRow = page.getByRole('row').filter({ hasText: name })
    await expect(updatedRow.getByText('Room 202')).toBeVisible()
    await updatedRow.getByRole('button', { name: 'Delete access point' }).click()
    const confirm = page.getByRole('dialog', { name: 'Delete access point?' })
    await confirm.getByRole('button', { name: 'Delete access point' }).click()

    await expect(toast(page, 'Access point deleted')).toBeVisible()
    await expect(page.getByRole('row').filter({ hasText: name })).toHaveCount(0)
  })

  test('device discovery and the read-only privacy dialog', async ({ page }) => {
    await openModule(page, 'Connected Devices')
    await page.getByRole('button', { name: 'Discover local devices' }).click()
    await expect(toast(page, 'Local ARP observation')).toBeVisible()
    await expect(page.getByText(/No active Nmap-style scans/)).toBeVisible()

    const details = page.getByRole('button', { name: 'Details' })
    if ((await details.count()) === 0) {
      test.info().annotations.push({
        type: 'note',
        description: 'No devices were present in the local ARP cache on this run.',
      })
      return
    }

    await details.first().click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('Observation history')).toBeVisible()
    await expect(dialog.getByText('Masked MAC', { exact: true })).toBeVisible()
    await dialog.getByRole('button', { name: 'Close dialog' }).click()
  })

  test('AI detection and rule-based diagnosis can be executed', async ({ page }) => {
    await openModule(page, 'AI Anomaly Detection')
    await page.getByRole('button', { name: 'Run detection' }).click()
    await expect(toast(page, 'Anomaly detection complete')).toBeVisible()
    await expect(page.getByText('Detected anomalies')).toBeVisible()

    await openModule(page, 'Smart Troubleshooting')
    await page.getByRole('button', { name: 'Run diagnosis' }).click()
    await expect(toast(page, 'Rule-based diagnosis completed')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Possible causes' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Recommended diagnostic steps' })).toBeVisible()
    await expect(page.getByText(/never changes router or access-point configuration/i).first()).toBeVisible()
  })

  test('ticket creation, comment and status update', async ({ page }) => {
    const title = `E2E verification ${Date.now()}`
    await openModule(page, 'Issue Management')
    await page.getByRole('button', { name: 'New ticket' }).click()

    const createDialog = page.getByRole('dialog', { name: 'Create issue ticket' })
    await createDialog.getByLabel('Title').fill(title)
    await createDialog
      .getByLabel('Description')
      .fill('Playwright verifies the manual incident workflow and comment trail.')
    await createDialog.getByLabel('Priority').selectOption('Medium')
    await createDialog.getByRole('button', { name: 'Create ticket' }).click()

    await expect(toast(page, 'Manual issue ticket created')).toBeVisible()
    const row = page.getByRole('row').filter({ hasText: title })
    await expect(row).toBeVisible()
    await row.click()

    const ticketDialog = page.getByRole('dialog', { name: title })
    await expect(ticketDialog.getByText('Activity & comments')).toBeVisible()
    await ticketDialog.getByLabel('Add ticket comment').fill('Verified by the Playwright E2E suite.')
    await ticketDialog.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(ticketDialog.getByText('Verified by the Playwright E2E suite.')).toBeVisible()

    await ticketDialog.getByLabel('Status').selectOption('In Progress')
    await ticketDialog.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(toast(page, 'Ticket updated')).toBeVisible()
    await ticketDialog.getByRole('button', { name: 'Close dialog' }).click()
  })

  test('PDF reports generate and download from the real backend', async ({ page }) => {
    await openModule(page, 'Reports')
    await page.getByRole('button', { name: 'Generate PDF' }).click()
    await expect(toast(page, 'generated')).toBeVisible()
    await expect(page.getByRole('button', { name: /^Download / }).first()).toBeVisible()

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: /^Download / }).first().click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/^netpulse_.+\.pdf$/)
  })

  test('settings save through the administration form', async ({ page }) => {
    await openModule(page, 'Settings')
    await expect(page.getByText('Monitoring thresholds')).toBeVisible()
    await expect(page.getByText('Automation & safety')).toBeVisible()
    await page.getByRole('button', { name: 'Save settings', exact: true }).click()
    await expect(toast(page, 'Workspace settings saved')).toBeVisible()
    await expect(page.getByText('Database', { exact: true }).first()).toBeVisible()
  })

  test('notifications panel opens from the header', async ({ page }) => {
    await page.getByRole('button', { name: 'Open notifications' }).click()
    await expect(page.getByText('Network alerts')).toBeVisible()
    await expect(page.getByText(/Anomalies, tickets and new devices/)).toBeVisible()
    await page.getByRole('button', { name: 'Close notifications' }).click()
    await expect(page.getByText('Network alerts')).toHaveCount(0)
  })
})

// The real screens with data, in a real browser: the dev harness (dev/harness.tsx) runs the App with a mock session and
// the fake IAM the e2e tests use. It has no CSP (that is the image's and the shell's), so what this proves is
// what the standalone page cannot show: WCAG 2.1 A and AA with colour contrast, in the light and dark themes, on
// every screen and on the dialogs and messages that need data; no sideways scroll at 360 px; the cropper's
// preview and the console links rendering. The flows are in test/e2e; the contract with the shell is in web-shell.
import { expect, test, type Page } from '@playwright/test'
import { wcagViolations } from './axe'

/** The dev toolbar is not the product: take it out of the page before the audit. */
async function audit(page: Page) {
  await page.evaluate(() => document.querySelector('[data-harness]')?.remove())
  return wcagViolations(page)
}

const HARNESS = 'http://localhost:5014'
const DATA = 'delegations=1&covering=1&delay=20'
const open = async (page: Page, path: string, query = DATA) => {
  await page.goto(`${HARNESS}/t/acme/me${path}?${query}`)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
}

/** Each screen once its data is in. */
const SCREENS: [name: string, path: string, ready: (p: Page) => Promise<void>][] = [
  ['profile', '', async (p) => void (await expect(p.getByRole('textbox', { name: 'Display name' })).toHaveValue('Ada Lovelace'))],
  ['availability', '/availability', async (p) => void (await expect(p.getByText('is covering for you.')).toBeVisible())],
  ['delegations', '/delegations', async (p) => void (await expect(p.getByRole('table', { name: 'My active delegations' }).getByText('Grace Hopper')).toBeVisible())],
  ['ai', '/ai', async (p) => void (await expect(p.getByRole('combobox', { name: 'Preferred model' })).toBeVisible())],
  ['notifications', '/notifications', async (p) => void (await expect(p.getByRole('table', { name: 'Notification preferences' })).toBeVisible())],
  ['security', '/security', async (p) => void (await expect(p.getByRole('link', { name: /Manage sign-in/ })).toBeVisible())],
]

for (const scheme of ['light', 'dark'] as const) {
  for (const [name, path, ready] of SCREENS) {
    test(`${name} has no WCAG 2.1 A or AA violation, colour contrast included, in the ${scheme} theme`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme })
      await open(page, path)
      await ready(page)
      expect(await audit(page)).toEqual([])
    })
  }

  test(`the dialogs and messages meet colour contrast in the ${scheme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme })
    await open(page, '/delegations')
    await expect(page.getByRole('table')).toBeVisible()
    // The create dialog with a refusal message.
    await page.getByRole('button', { name: 'Delegate my work' }).click()
    const create = page.getByRole('dialog', { name: 'Delegate my work' })
    await create.getByRole('button', { name: 'Delegate' }).click()
    await expect(create.getByRole('alert')).toBeVisible()
    expect(await audit(page), 'create dialog').toEqual([])
    await create.getByRole('button', { name: 'Cancel' }).click()
    // The review banner is on the open-ended row; the extend and cancel dialogs.
    await expect(page.getByText(/Review by .*: extend or cancel\./)).toBeVisible()
    await page.getByRole('button', { name: 'Extend' }).click()
    expect(await audit(page), 'extend dialog').toEqual([])
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click()
    await page.getByRole('button', { name: 'Cancel' }).first().click()
    expect(await audit(page), 'cancel dialog').toEqual([])
  })

  test(`profile errors, the saved line and the read-only notice meet colour contrast in the ${scheme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme })
    await open(page, '', `${DATA}&federated=1`)
    await expect(page.getByRole('textbox', { name: 'Display name' })).toHaveValue('Ada Lovelace')
    await page.getByRole('textbox', { name: 'Display name' }).fill('')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Enter your name.')).toBeVisible()
    expect(await audit(page), 'field error').toEqual([])
    await page.getByRole('textbox', { name: 'Display name' }).fill('Ada King')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Saved', { exact: true })).toBeVisible()
    expect(await audit(page), 'saved').toEqual([])
    await open(page, '/ai', `${DATA}&readonly=1&nomodels=1`)
    await expect(page.getByText('Workspace is read-only (subscription ended).')).toBeVisible()
    expect(await audit(page), 'read-only').toEqual([])
  })
}

test('the cropper previews a picked image (a data URL) and the signature saves against the fake bucket', async ({ page }) => {
  await open(page, '')
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
  await page.getByLabel('Upload a signature').setInputFiles({ name: 'sig.png', mimeType: 'image/png', buffer: png })
  const preview = page.getByRole('img', { name: 'Preview of the picked signature' })
  await expect(preview).toBeVisible()
  expect(await preview.getAttribute('src')).toMatch(/^data:image\/png;base64,/)
  expect(await audit(page), 'cropper').toEqual([])
  await page.getByRole('button', { name: 'Save signature' }).click()
  await expect(page.getByText(/Signature saved/)).toBeVisible()
})

test('nothing scrolls sideways at 360 px on any screen, with data', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 })
  for (const [, path, ready] of SCREENS) {
    await open(page, path)
    await ready(page)
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), path || '/').toBe(false)
  }
})

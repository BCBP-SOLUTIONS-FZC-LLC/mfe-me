// The production build of the standalone page in a real browser. With no shell around it there is no identity,
// so no screen has data: what this proves is what only a browser can. The page loads and nothing is refused or
// fails; the section tabs and the base styles meet colour contrast in the light and dark themes (axe cannot
// compute contrast without layout); nested routes reload; nothing scrolls sideways at 360 px; and the page
// passes WCAG 2.1 A and AA. The flows behind a session are in test/e2e (a fake IAM) and each screen's
// accessibility in test/unit/a11y; the full path through web-shell is the joint suite LLD §15 #16 asks for.
// The image's CSP is checked by the smoke tests against the built image (nginx adds the header).
import { expect, test, type Page } from '@playwright/test'
import { wcagViolations } from './axe'

test.beforeEach(async ({ page }) => {
  // Collect what the browser itself reports as refused by a Content Security Policy.
  await page.addInitScript(() => {
    ;(window as unknown as { __csp: string[] }).__csp = []
    document.addEventListener('securitypolicyviolation', (e) => (window as unknown as { __csp: string[] }).__csp.push(`${e.violatedDirective} ${e.blockedURI}`))
  })
})

const csp = (page: Page) => page.evaluate(() => (window as unknown as { __csp: string[] }).__csp)

const TABS = ['Profile', 'Availability', 'Delegations', 'AI preferences', 'Notifications', 'Security']

test('loads at /me with the six section tabs, and nothing fails', async ({ page }) => {
  const problems: string[] = []
  page.on('pageerror', (e) => problems.push(String(e)))
  page.on('console', (m) => m.type() === 'error' && problems.push(m.text()))
  const failed: string[] = []
  page.on('requestfailed', (r) => failed.push(r.url()))

  await page.goto('/')
  await expect(page).toHaveURL(/\/me$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Profile' })).toBeVisible()
  const tabs = page.getByRole('navigation', { name: 'My account sections' })
  await expect(tabs.getByRole('link')).toHaveText(TABS)
  await expect(tabs.getByRole('link', { name: 'Profile' })).toHaveAttribute('aria-current', 'page')
  // The remote draws no frame of its own (the shell's sidebar, header and user menu).
  await expect(page.getByRole('banner')).toHaveCount(0)
  expect(await csp(page)).toEqual([])
  expect(failed).toEqual([])
  expect(problems).toEqual([])
})

test('reads its runtime configuration and serves the remote entry', async ({ page, request }) => {
  const [config] = await Promise.all([page.waitForResponse((r) => r.url().endsWith('/config/runtime.json')), page.goto('/')])
  expect(config.status()).toBe(200)
  const entry = await request.get('/remoteEntry.js')
  expect(entry.status()).toBe(200)
  expect((await entry.text()).startsWith('var __platform_mfe_me;')).toBe(true)
})

test('moves between sections with the tabs, reloads a nested route, and sends an unknown path to the profile', async ({ page }) => {
  await page.goto('/')
  for (const [name, path] of [['Availability', /\/me\/availability$/], ['Delegations', /\/me\/delegations$/], ['AI preferences', /\/me\/ai$/], ['Notifications', /\/me\/notifications$/], ['Security', /\/me\/security$/]] as const) {
    await page.getByRole('navigation', { name: 'My account sections' }).getByRole('link', { name }).click()
    await expect(page).toHaveURL(path)
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
  }
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Security' })).toBeVisible()
  await page.goto('/me/delegations')
  await expect(page.getByRole('heading', { level: 1, name: 'Delegations' })).toBeVisible()
  expect(await csp(page)).toEqual([])
  await page.goto('/nowhere/at/all')
  await expect(page).toHaveURL(/\/me$/)
  await page.goto('/me/profile')
  await expect(page).toHaveURL(/\/me$/)
})

for (const scheme of ['light', 'dark'] as const) {
  test(`has no WCAG 2.1 A or AA violation, colour contrast included, in the ${scheme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme })
    for (const path of ['/me', '/me/availability', '/me/delegations', '/me/ai', '/me/notifications', '/me/security']) {
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      expect(await wcagViolations(page), path).toEqual([])
    }
  })
}

test('is usable at a narrow width: nothing scrolls sideways and the tabs scroll inside their own strip', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 700 })
  for (const path of ['/me', '/me/security']) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), path).toBe(false)
  }
  await expect(page.getByRole('banner')).toHaveCount(0)
  await expect(page.getByRole('navigation', { name: 'My account sections' })).toBeVisible()
})

// The styles the screens use for messages, notices, controls and badges, on the built stylesheet: axe computes
// colour contrast only for rendered text, and a screen's errors and dialogs need data to appear, so the same
// classes are rendered here on their own surfaces, in both themes.
const SAMPLE = `
<main>
  <h1>Samples</h1>
  <p class="text-status-error">An error message</p>
  <p class="text-status-warning">A warning message</p>
  <p class="text-status-success">Saved</p>
  <p class="text-aura-muted">A hint or a column label</p>
  <p role="alert" class="notice notice-error">We couldn't load this. Try again.</p>
  <p role="status" class="notice notice-warning">Workspace is read-only (subscription ended).</p>
  <p role="status" class="notice notice-info">Model choice isn't available yet.</p>
  <section class="rounded-xl border border-aura-border bg-aura-surface p-4">
    <h2>A card</h2>
    <p class="text-aura-muted">Muted text on a card</p>
    <p class="text-status-error">An error on a card</p>
    <p class="text-status-warning">A warning on a card</p>
    <p class="text-status-success">Saved on a card</p>
    <span class="badge badge-outline">Active</span> <span class="badge badge-ghost">Default</span>
    <a class="link" href="#x">A link</a>
    <button type="button" class="btn">Cancel</button>
    <button type="button" class="btn btn-primary">Confirm</button>
    <button type="button" class="btn btn-error">Remove</button>
    <label class="text-sm font-medium">A field <input class="w-full rounded-lg border border-aura-border bg-aura-canvas px-3 py-2 text-sm text-aura-text" value="x"></label>
  </section>
</main>`

for (const scheme of ['light', 'dark'] as const) {
  test(`message, notice, badge and control styles meet colour contrast in the ${scheme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme })
    await page.goto('/me')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await page.evaluate((html) => {
      document.body.innerHTML = html
    }, SAMPLE)
    expect(await wcagViolations(page)).toEqual([])
  })
}

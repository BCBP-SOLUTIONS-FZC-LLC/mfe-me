// Critical journeys and WCAG 2.1 AA checks in a real browser (the constitution's Playwright e2e and
// accessibility standards; see docs/lld/mfe-me-lld.md §14). The production build of the standalone page,
// served by `rsbuild preview` with the dev runtime config (config/runtime.local.json).
// `npm run test:browser` builds first.
import { defineConfig, devices } from '@playwright/test'

const CI = !!process.env.CI
const PORT = 5013
// The dev harness (a mock session and a fake IAM, dev/harness.tsx): the real screens with data, for contrast and layout.
const HARNESS_PORT = 5014

export default defineConfig({
  testDir: 'test/browser',
  outputDir: 'test-results',
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: CI ? [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
    trace: CI ? 'on-first-retry' : 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: `npx rsbuild preview --port ${PORT}`,
      url: `http://localhost:${PORT}/config/runtime.json`,
      reuseExistingServer: !CI,
      timeout: 60_000,
    },
    {
      command: `ME_HARNESS=1 npx rsbuild dev --port ${HARNESS_PORT}`,
      url: `http://localhost:${HARNESS_PORT}/config/runtime.json`,
      reuseExistingServer: !CI,
      timeout: 90_000,
    },
  ],
})

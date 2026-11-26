// Accessibility of every screen and dialog, with axe-core over the rendered page (WCAG 2.1 A and AA rules that
// need no layout). Colour contrast needs real layout and styles, so it is checked in the browser suite
// (test/browser), not here. Each state is one a user can be looking at: the page, a dialog open on it, an
// error, an empty list, a read-only view, a conflict. The pages are rendered without the layout, so the
// "region" rule (everything inside a landmark) is off here; the layout test checks the landmarks.
import axe from 'axe-core'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it } from '@rstest/core'
import MeLayout from '../../../src/app/layouts/MeLayout'
import AiPreferencesPage from '../../../src/presentation/pages/AiPreferencesPage'
import AvailabilityPage from '../../../src/presentation/pages/AvailabilityPage'
import DelegationsPage from '../../../src/presentation/pages/DelegationsPage'
import NotificationPreferencesPage from '../../../src/presentation/pages/NotificationPreferencesPage'
import ProfilePage from '../../../src/presentation/pages/ProfilePage'
import SecurityPage from '../../../src/presentation/pages/SecurityPage'
import { DEPT, NOW, delegation, llm, version } from '../../fixtures/domain'
import { createFakeIam, problem } from '../../fixtures/fakeIam'
import { renderPage } from '../../fixtures/pages'
import { addDays } from '../../../src/domain/value-objects/Instant'

/** axe over the page; fails with the rule, the impact and the first offending element of each violation. */
async function expectAccessible(label: string) {
  const result = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } }, runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] } })
  const found = result.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.length} element(s), first: ${v.nodes[0]?.html.slice(0, 160)}`)
  expect(found, `${label}: ${found.join(' | ')}`).toEqual([])
}
const user = () => userEvent.setup()
const events = { options: { allowedModels: ['model-a', 'model-b'], notificationEventTypes: ['doc.approved', 'doc.rejected'], enabledLocales: ['en'], uploadOrigins: ['https://bucket.example'], timeZones: ['Europe/London'] } }
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])

describe('axe itself', () => {
  it('reports a violation it should (so a clean run means something)', async () => {
    document.body.innerHTML = '<img src="x.png"><button></button><input>'
    const result = await axe.run(document.body)
    expect(result.violations.map((v) => v.id)).toEqual(expect.arrayContaining(['image-alt', 'button-name', 'label']))
    document.body.innerHTML = ''
  })
})

describe('the chrome', () => {
  it('the section tabs around a page', async () => {
    renderPage(
      <Routes>
        <Route element={<MeLayout />}>
          <Route path="*" element={<SecurityPage />} />
        </Route>
      </Routes>,
      { path: '/security' },
    )
    await screen.findByRole('heading', { level: 1, name: 'Security' })
    await screen.findByRole('navigation', { name: 'My account sections' })
    await expectAccessible('tabs and security')
  })
})

describe('Profile (G1)', () => {
  it('the form, my access and the signature card', async () => {
    renderPage(<ProfilePage />, { services: events })
    await screen.findByRole('textbox', { name: 'Display name' })
    await screen.findByText('Engineering · Reviewer')
    await expectAccessible('profile')
  })

  it('field errors and a credential error', async () => {
    renderPage(<ProfilePage />, { services: events })
    await user().clear(await screen.findByRole('textbox', { name: 'Display name' }))
    await user().click(screen.getByRole('button', { name: 'Add a credential' }))
    await user().type(screen.getByLabelText('Credential name 2'), 'x')
    await user().type(screen.getByLabelText('Credential value 2'), 'bad;')
    await user().click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText('Enter your name.')
    await expectAccessible('profile errors')
  })

  it('a federated profile with a revert button', async () => {
    const iam = createFakeIam()
    iam.state.profile = { ...iam.state.profile, source: 'federated', displayNameOverridden: true }
    renderPage(<ProfilePage />, { iam, services: events })
    await screen.findByRole('button', { name: 'Revert to directory value' })
    await expectAccessible('federated profile')
  })

  it('the conflict dialog with the draft', async () => {
    const iam = createFakeIam()
    iam.failNext('updateUser', problem(409, 'VERSION_CONFLICT'))
    renderPage(<ProfilePage />, { iam, services: events })
    await user().type(await screen.findByRole('textbox', { name: 'Display name' }), '!')
    await user().click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByRole('dialog')
    await expectAccessible('profile conflict')
  })

  it('a failed load, a profile being set up, and read-only', async () => {
    const failed = createFakeIam()
    failed.failNext('getUser', problem(500, 'INTERNAL'))
    const first = renderPage(<ProfilePage />, { iam: failed })
    await screen.findByText(/We couldn't load your profile\./)
    await expectAccessible('profile failed')
    first.unmount()
    const notReady = createFakeIam()
    notReady.failNext('getUser', problem(404, 'NOT_FOUND'))
    const second = renderPage(<ProfilePage />, { iam: notReady })
    await screen.findByText('Your profile is being set up')
    await expectAccessible('profile being set up')
    second.unmount()
    renderPage(<ProfilePage />, { readOnly: true, services: events })
    await screen.findByText('Workspace is read-only (subscription ended).')
    await expectAccessible('profile read-only')
  })

  it('the cropper with a picked image, the signature confirmation, and an upload error', async () => {
    const iam = createFakeIam()
    iam.failNext('presignSignature', problem(409, 'SIGNATURE_ERASURE_PENDING'))
    renderPage(<ProfilePage />, { iam, services: { ...events, images: { toPng: async () => PNG }, hasher: { sha256Hex: async () => 'a'.repeat(64) } } })
    await user().upload((await screen.findByLabelText('Upload a signature')) as HTMLInputElement, new File([PNG as BlobPart], 'sig.png', { type: 'image/png' }))
    await screen.findByRole('img', { name: 'Preview of the picked signature' })
    await expectAccessible('cropper')
    await user().click(screen.getByRole('button', { name: 'Save signature' }))
    await screen.findByText(/still being removed/)
    await expectAccessible('upload error')
    await user().click(screen.getByRole('button', { name: 'Remove signature' }))
    await screen.findByRole('dialog', { name: 'Remove your signature?' })
    await expectAccessible('remove signature dialog')
  })
})

describe('Availability (G2)', () => {
  it('available, out of office with a window, and an error', async () => {
    renderPage(<AvailabilityPage />)
    await screen.findByRole('radio', { name: 'Available' })
    await expectAccessible('availability')
    await user().click(screen.getByRole('radio', { name: 'Out of office' }))
    await user().click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText('Enter when you are away and when you are back.')
    await expectAccessible('availability error')
  })

  it('someone covering, the conflict dialog and read-only', async () => {
    const iam = createFakeIam()
    iam.state.availability = { ...iam.state.availability, delegateUserId: '22222222-2222-4222-8222-222222222222' }
    iam.failNext('putAvailability', problem(409, 'VERSION_CONFLICT'))
    const first = renderPage(<AvailabilityPage />, { iam })
    await screen.findByText('is covering for you.')
    await expectAccessible('availability covering')
    await user().click(screen.getByRole('radio', { name: 'Busy' }))
    await user().click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByRole('dialog')
    await expectAccessible('availability conflict')
    first.unmount()
    renderPage(<AvailabilityPage />, { readOnly: true })
    await screen.findByText('Workspace is read-only (subscription ended).')
    await expectAccessible('availability read-only')
  })

  it('a failed load', async () => {
    const iam = createFakeIam()
    iam.failNext('getAvailability', problem(500, 'INTERNAL'))
    renderPage(<AvailabilityPage />, { iam })
    await screen.findByText(/We couldn't load your availability\./)
    await expectAccessible('availability failed')
  })
})

describe('Delegations (G3)', () => {
  const withRows = () => {
    const iam = createFakeIam()
    iam.state.delegations = [delegation({ scope: 'department', scopeId: DEPT }), delegation({ delegationId: 'd2', endsAt: undefined, reviewDueAt: addDays(NOW, 2), recordVersion: version(2) })]
    return iam
  }

  it('empty, a list, and a failed load', async () => {
    const failed = createFakeIam()
    failed.failNext('delegations.list', problem(500, 'INTERNAL'))
    const a = renderPage(<DelegationsPage />, { iam: failed })
    await screen.findByText(/We couldn't load your delegations\./)
    await expectAccessible('delegations failed')
    a.unmount()
    const b = renderPage(<DelegationsPage />)
    await screen.findByText("You're not delegating any work.")
    await expectAccessible('delegations empty')
    b.unmount()
    renderPage(<DelegationsPage />, { iam: withRows() })
    await screen.findByRole('table')
    await screen.findAllByText('Grace Hopper', undefined, { timeout: 3000 })
    await expectAccessible('delegations list')
  })

  it('the create dialog, with a department, dates and errors', async () => {
    renderPage(<DelegationsPage />)
    await user().click(await screen.findByRole('button', { name: 'Delegate my work' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delegate my work' })
    await user().click(within(dialog).getByRole('radio', { name: 'One department' }))
    await user().click(within(dialog).getByRole('checkbox', { name: 'Starts now' }))
    await user().click(within(dialog).getByRole('checkbox', { name: /Open-ended/ }))
    await user().click(within(dialog).getByRole('button', { name: 'Delegate' }))
    await within(dialog).findByText('Enter a date and time.')
    await expectAccessible('create dialog')
  })

  it('the extend, reassign and cancel dialogs, and a conflict', async () => {
    const iam = withRows()
    iam.failNext('delegations.cancel', problem(409, 'optimistic_lock_conflict'))
    renderPage(<DelegationsPage />, { iam })
    await user().click(await screen.findByRole('button', { name: 'Extend' }))
    const extend = await screen.findByRole('dialog', { name: 'Extend review' })
    await expectAccessible('extend dialog')
    await user().click(within(extend).getByRole('button', { name: 'Cancel' }))
    await user().click((await screen.findAllByRole('button', { name: 'Reassign' }))[0]!)
    await screen.findByRole('dialog', { name: 'Reassign delegation' })
    await expectAccessible('reassign dialog')
    await user().click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))
    await user().click((await screen.findAllByRole('button', { name: 'Cancel' }))[0]!)
    const confirm = await screen.findByRole('dialog', { name: 'Cancel delegation' })
    await expectAccessible('cancel dialog')
    await user().click(within(confirm).getByRole('button', { name: 'Cancel delegation' }))
    await screen.findByRole('dialog', { name: 'This changed while you were editing' })
    await expectAccessible('delegation conflict')
  })

  it('read-only', async () => {
    renderPage(<DelegationsPage />, { iam: withRows(), readOnly: true })
    await screen.findByText('Workspace is read-only (subscription ended).')
    await expectAccessible('delegations read-only')
  })
})

describe('AI preferences (G4)', () => {
  it('the form with templates, snippets and an error', async () => {
    const iam = createFakeIam()
    iam.state.llm = llm({ templates: ['a'], contextDocuments: ['b'] })
    renderPage(<AiPreferencesPage />, { iam, services: events })
    await screen.findByRole('combobox', { name: 'Preferred model' })
    await expectAccessible('ai')
    await user().selectOptions(screen.getByRole('combobox', { name: 'Preferred model' }), '')
    await user().click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText('Pick a model.')
    await expectAccessible('ai error')
  })

  it('a model that is no longer offered, models unavailable, and read-only', async () => {
    const gone = createFakeIam()
    gone.state.llm = llm({ preferredModel: 'retired' })
    const a = renderPage(<AiPreferencesPage />, { iam: gone, services: events })
    await screen.findByText('This model is no longer offered. Pick another to save.')
    await expectAccessible('ai model gone')
    a.unmount()
    const b = renderPage(<AiPreferencesPage />, { services: { options: { ...events.options, allowedModels: [] } } })
    await screen.findByText("Model choice isn't available yet.")
    await expectAccessible('ai unavailable')
    b.unmount()
    renderPage(<AiPreferencesPage />, { readOnly: true, services: events })
    await screen.findByText('Workspace is read-only (subscription ended).')
    await expectAccessible('ai read-only')
  })
})

describe('Notification preferences (G5)', () => {
  it('the table, the "Other" table, the reset dialog and an error', async () => {
    const iam = createFakeIam()
    iam.state.notifications = [{ eventType: 'doc.old', channels: ['sms'], urgencyThreshold: 'high' }]
    renderPage(<NotificationPreferencesPage />, { iam, services: events })
    await screen.findByRole('table', { name: 'Other saved preferences' })
    await expectAccessible('notifications')
    await user().click(screen.getByRole('button', { name: 'Reset to defaults' }))
    await screen.findByRole('dialog', { name: 'Reset to defaults?' })
    await expectAccessible('reset dialog')
    await user().click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))
    await user().click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText('There is nothing to save yet.')
    await expectAccessible('notifications error')
  })

  it('empty and read-only', async () => {
    const a = renderPage(<NotificationPreferencesPage />, { services: { options: { ...events.options, notificationEventTypes: [] } } })
    await screen.findByText('There are no notification events to set up yet.')
    await expectAccessible('notifications empty')
    a.unmount()
    renderPage(<NotificationPreferencesPage />, { readOnly: true, services: events })
    await screen.findByText('Workspace is read-only (subscription ended).')
    await expectAccessible('notifications read-only')
  })
})

describe('Security (G6)', () => {
  it('the cards, and without a console URL', async () => {
    const a = renderPage(<SecurityPage />)
    await screen.findByRole('link', { name: /Manage sign-in/ })
    await expectAccessible('security')
    a.unmount()
    renderPage(<SecurityPage />, { services: { navigation: { toAdminSettings: () => {}, accountConsoleUrl: () => undefined, isSharedConsole: () => true } } })
    await screen.findAllByText("The account console isn't available from here.")
    await expectAccessible('security unavailable')
  })
})


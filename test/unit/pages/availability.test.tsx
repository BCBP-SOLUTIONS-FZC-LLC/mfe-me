import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it } from '@rstest/core'
import AvailabilityPage from '../../../src/presentation/pages/AvailabilityPage'
import { OTHER, at, availability, version } from '../../fixtures/domain'
import { createFakeIam, problem } from '../../fixtures/fakeIam'
import { renderPage } from '../../fixtures/pages'

const user = () => userEvent.setup()
const ui = (
  <Routes>
    <Route path="/t/acme/me/availability" element={<AvailabilityPage />} />
    <Route path="/t/acme/me/delegations" element={<p>delegations page</p>} />
  </Routes>
)
const render = (o: Parameters<typeof renderPage>[1] = {}) => renderPage(ui, { path: '/t/acme/me/availability', ...o })
const loaded = () => screen.findByRole('radio', { name: 'Available' })

describe('AvailabilityPage (G2)', () => {
  it('shows my status, and the window only for out of office', async () => {
    render()
    expect(await loaded()).toBeChecked()
    expect(screen.queryByLabelText('Away from')).not.toBeInTheDocument()
    await user().click(screen.getByRole('radio', { name: 'Out of office' }))
    expect(screen.getByLabelText('Away from')).toBeInTheDocument()
    expect(screen.getByLabelText('Back on')).toBeInTheDocument()
  })

  it('shows a failed load with Retry', async () => {
    const iam = createFakeIam()
    iam.failNext('getAvailability', problem(500, 'INTERNAL'))
    render({ iam })
    expect(await screen.findByText(/We couldn't load your availability\./)).toBeInTheDocument()
    await user().click(screen.getByRole('button', { name: 'Retry' }))
    expect(await loaded()).toBeChecked()
  })

  it('refuses a draft with nothing to save', async () => {
    const { iam } = render()
    await loaded()
    await user().click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('There is nothing to save yet.')).toBeInTheDocument()
    expect(iam.calls).not.toContain('putAvailability')
  })

  it('sets busy with a note, with the version, and says Saved', async () => {
    const { iam, recorded } = render()
    await user().click(await screen.findByRole('radio', { name: 'Busy' }))
    await user().type(screen.getByLabelText('Note to colleagues'), 'In a workshop')
    await user().click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect(iam.bodies['putAvailability']).toEqual([{ status: 'busy', note: 'In a workshop', expectedVersion: 2 }])
    expect(recorded.actions).toEqual([{ action: 'set_availability', outcome: 'success' }])
  })

  it('sets out of office with a window in my zone (as UTC), and never sends a delegate', async () => {
    const iam = createFakeIam()
    iam.state.availability = { ...iam.state.availability, delegateUserId: OTHER }
    render({ iam })
    await user().click(await screen.findByRole('radio', { name: 'Out of office' }))
    await user().type(screen.getByLabelText('Away from'), '2026-12-01T09:00')
    await user().type(screen.getByLabelText('Back on'), '2026-12-10T17:30')
    await user().click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Saved')).toBeInTheDocument()
    const sent = iam.bodies['putAvailability']![0]
    expect(sent).toEqual({ status: 'ooo', oooFrom: '2026-12-01T09:00:00.000Z', oooUntil: '2026-12-10T17:30:00.000Z', note: '', expectedVersion: 2 })
    expect(JSON.stringify(sent)).not.toContain(OTHER)
  })

  it.each([
    ['no dates', '', '', 'Enter when you are away and when you are back.'],
    ['a window that ends before it starts', '2026-12-10T09:00', '2026-12-01T09:00', 'The end must be after the start.'],
    ['a window over 180 days', '2026-12-01T09:00', '2027-07-01T09:00', 'An out-of-office can last up to 180 days.'],
    ['a window already over', '2026-11-01T09:00', '2026-11-20T09:00', "The end can't be in the past."],
  ])('refuses %s', async (_n, from, until, message) => {
    const { iam } = render()
    await user().click(await screen.findByRole('radio', { name: 'Out of office' }))
    if (from) await user().type(screen.getByLabelText('Away from'), from)
    if (until) await user().type(screen.getByLabelText('Back on'), until)
    await user().click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(iam.calls).not.toContain('putAvailability')
  })

  it('refuses a note over 500 characters', async () => {
    render()
    await user().click(await screen.findByRole('radio', { name: 'Busy' }))
    const note = screen.getByLabelText('Note to colleagues')
    await user().click(note)
    await user().paste('x'.repeat(501))
    await user().click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('That note is too long.')).toBeInTheDocument()
  })

  it('shows the service\'s answer for an overlap with a delegation, and any other failure', async () => {
    const iam = createFakeIam()
    iam.failNext('putAvailability', problem(409, 'OOO_WINDOW_CONFLICT'))
    iam.failNext('putAvailability', problem(503, 'USER_PROFILE_UNAVAILABLE'))
    render({ iam })
    await user().click(await screen.findByRole('radio', { name: 'Busy' }))
    await user().click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('This overlaps your out-of-office set by a delegation. Change it from Delegations.')).toBeInTheDocument()
    await user().click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Nothing was changed. Try again.')).toBeInTheDocument()
  })

  it('shows a lost race as a conflict dialog and Reload brings in the other version', async () => {
    const iam = createFakeIam()
    render({ iam })
    await user().click(await screen.findByRole('radio', { name: 'Busy' }))
    iam.state.availability = { ...iam.state.availability, status: 'ooo', oooFrom: at('2026-12-01T00:00:00Z'), oooUntil: at('2026-12-05T00:00:00Z'), recordVersion: version(7) }
    await user().click(screen.getByRole('button', { name: 'Save' }))
    const dialog = await screen.findByRole('dialog', { name: 'This changed while you were editing' })
    await user().click(within(dialog).getByRole('button', { name: 'Reload' }))
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Out of office' })).toBeChecked())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes the conflict dialog and keeps my edit', async () => {
    const iam = createFakeIam()
    iam.failNext('putAvailability', problem(409, 'VERSION_CONFLICT'))
    render({ iam })
    await user().click(await screen.findByRole('radio', { name: 'Busy' }))
    await user().click(screen.getByRole('button', { name: 'Save' }))
    await user().click(await screen.findByRole('button', { name: 'Close' }))
    expect(screen.getByRole('radio', { name: 'Busy' })).toBeChecked()
  })

  it('says who is covering for me and links to Delegations; it never offers a delegate picker', async () => {
    const iam = createFakeIam()
    iam.state.availability = availability({ status: 'ooo', oooFrom: at('2026-12-01T00:00:00Z'), oooUntil: at('2026-12-05T00:00:00Z'), delegateUserId: OTHER })
    render({ iam })
    expect(await screen.findByText('Grace Hopper')).toBeInTheDocument()
    expect(screen.getByText('is covering for you.')).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    await user().click(screen.getByRole('link', { name: 'Manage delegations' }))
    expect(await screen.findByText('delegations page')).toBeInTheDocument()
  })

  it('links "someone covering" to G3 with the window prefilled', async () => {
    const iam = createFakeIam()
    iam.state.availability = availability({ status: 'ooo', oooFrom: at('2026-12-01T00:00:00Z'), oooUntil: at('2026-12-05T00:00:00Z') })
    render({ iam })
    const link = await screen.findByRole('link', { name: /Delegate your work/ })
    expect(link.getAttribute('href')).toBe('/t/acme/me/delegations?create=1&from=2026-12-01T00%3A00%3A00.000Z&until=2026-12-05T00%3A00%3A00.000Z')
  })

  it('links to G3 without a window until both dates are valid', async () => {
    const iam = createFakeIam()
    render({ iam })
    await user().click(await screen.findByRole('radio', { name: 'Out of office' }))
    expect((await screen.findByRole('link', { name: /Delegate your work/ })).getAttribute('href')).toBe('/t/acme/me/delegations?create=1')
  })

  it('disables every control in a read-only workspace', async () => {
    render({ readOnly: true })
    expect(await loaded()).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(screen.getByLabelText('Note to colleagues')).toBeDisabled()
    expect(screen.getByText('Workspace is read-only (subscription ended).')).toBeInTheDocument()
  })
})

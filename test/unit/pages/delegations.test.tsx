import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from '@rstest/core'
import DelegationsPage from '../../../src/presentation/pages/DelegationsPage'
import { IN_FLIGHT_RECHECK_MS } from '../../../src/presentation/pages/delegations/CreateDelegationDialog'
import { DEPT, NOW, OTHER, at, delegation, version } from '../../fixtures/domain'
import { THIRD, createFakeIam, problem } from '../../fixtures/fakeIam'
import { renderPage } from '../../fixtures/pages'
import { addDays } from '../../../src/domain/value-objects/Instant'

const user = () => userEvent.setup()
const openDialog = async () => {
  await user().click(await screen.findByRole('button', { name: 'Delegate my work' }))
  return screen.findByRole('dialog', { name: 'Delegate my work' })
}
const pick = async (dialog: HTMLElement, name: string) => {
  const select = within(dialog).getByRole('combobox', { name: 'Delegate' })
  await waitFor(() => expect(within(select).getByRole('option', { name })).toBeInTheDocument())
  await user().selectOptions(select, name)
}

describe('DelegationsPage (G3): the list', () => {
  it('says so when I am not delegating anything, and shows a failed load with Retry', async () => {
    const iam = createFakeIam()
    iam.failNext('delegations.list', problem(500, 'INTERNAL'))
    renderPage(<DelegationsPage />, { iam, path: '/t/acme/me/delegations' })
    expect(await screen.findByText(/We couldn't load your delegations\./)).toBeInTheDocument()
    await user().click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText("You're not delegating any work.")).toBeInTheDocument()
  })

  it('lists each delegation: who, what, when, and the review date of an open-ended one', async () => {
    const iam = createFakeIam()
    iam.state.delegations = [
      delegation({ scope: 'department', scopeId: DEPT, endsAt: at('2026-12-20T09:00:00Z'), startsAt: at('2026-12-01T09:00:00Z'), status: 'scheduled' }),
      delegation({ delegationId: 'd2', delegateId: THIRD, scope: 'all', endsAt: undefined, reviewDueAt: addDays(NOW, 30), startsAt: NOW }),
    ]
    renderPage(<DelegationsPage />, { iam })
    const table = await screen.findByRole('table', { name: 'My active delegations' })
    expect(await within(table).findByText('Grace Hopper')).toBeInTheDocument()
    expect(within(table).getByText('Alan Turing')).toBeInTheDocument()
    expect(within(table).getByText('Engineering')).toBeInTheDocument()
    expect(within(table).getByText('All my work')).toBeInTheDocument()
    expect(within(table).getByText('Scheduled')).toBeInTheDocument()
    expect(within(table).getByText(/Open-ended — review by/)).toBeInTheDocument()
    // Extend only for the open-ended one.
    expect(within(table).getAllByRole('button', { name: 'Extend' })).toHaveLength(1)
    expect(within(table).getAllByRole('button', { name: 'Reassign' })).toHaveLength(2)
  })

  it('warns when a review is due within three days, and when it is overdue', async () => {
    const iam = createFakeIam()
    iam.state.delegations = [
      delegation({ delegationId: 'soon', endsAt: undefined, reviewDueAt: addDays(NOW, 2) }),
      delegation({ delegationId: 'late', endsAt: undefined, reviewDueAt: addDays(NOW, -1) }),
      delegation({ delegationId: 'fine', endsAt: undefined, reviewDueAt: addDays(NOW, 40) }),
    ]
    renderPage(<DelegationsPage />, { iam })
    expect(await screen.findByText(/Review by .*: extend or cancel\./)).toBeInTheDocument()
    expect(screen.getByText('The review date has passed. Extend or cancel now.')).toBeInTheDocument()
  })

  it('disables every action in a read-only workspace', async () => {
    const iam = createFakeIam()
    iam.state.delegations = [delegation({ endsAt: undefined, reviewDueAt: addDays(NOW, 40) })]
    renderPage(<DelegationsPage />, { iam, readOnly: true })
    expect(await screen.findByRole('button', { name: 'Extend' })).toBeDisabled()
    for (const name of ['Delegate my work', 'Reassign', 'Cancel']) expect(screen.getByRole('button', { name })).toBeDisabled()
    expect(screen.getByText('Workspace is read-only (subscription ended).')).toBeInTheDocument()
  })
})

describe('Delegate my work (DLG-2)', () => {
  it('creates an open-ended delegation for all my work with an Idempotency-Key, and refreshes my availability and profile', async () => {
    const { iam, recorded, client } = renderPage(<DelegationsPage />)
    const dialog = await openDialog()
    await pick(dialog, 'Grace Hopper')
    expect(within(dialog).getByText('Up to 90 days.')).toBeInTheDocument()
    await user().click(within(dialog).getByRole('button', { name: 'Delegate' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(iam.bodies['delegations.create']).toEqual([{ request: { delegateId: OTHER, scope: 'all' }, key: 'key-1' }])
    expect(recorded.actions).toEqual([{ action: 'create_delegation', outcome: 'success' }])
    expect(await screen.findByRole('table')).toBeInTheDocument()
    expect(client.getQueryState(['me', 'acme', 'availability', '11111111-1111-4111-8111-111111111111'])).toBeUndefined()
  })

  it('does not offer me, a suspended member, and flags and blocks a delegate who is out of office', async () => {
    renderPage(<DelegationsPage />)
    const dialog = await openDialog()
    const select = within(dialog).getByRole('combobox', { name: 'Delegate' })
    await waitFor(() => expect(within(select).getByRole('option', { name: 'Alan Turing (out of office)' })).toBeInTheDocument())
    expect(within(select).queryByRole('option', { name: 'Ada Lovelace' })).not.toBeInTheDocument()
    expect(within(select).getAllByRole('option')).toHaveLength(1 + 2)
    await user().selectOptions(select, 'Alan Turing (out of office)')
    expect(await within(dialog).findByText("Out of office — they can't cover. Pick someone else.")).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Delegate' })).toBeDisabled()
  })

  it('filters the loaded members by what is typed', async () => {
    renderPage(<DelegationsPage />)
    const dialog = await openDialog()
    await pick(dialog, 'Grace Hopper')
    await user().type(within(dialog).getByRole('searchbox', { name: 'Filter members by name' }), 'alan')
    const select = within(dialog).getByRole('combobox', { name: 'Delegate' })
    expect(within(select).queryByRole('option', { name: 'Grace Hopper' })).toBeInTheDocument() // the chosen one stays
    expect(within(select).getByRole('option', { name: 'Alan Turing (out of office)' })).toBeInTheDocument()
  })

  it('refuses a missing delegate at the field and sends nothing', async () => {
    const { iam } = renderPage(<DelegationsPage />)
    const dialog = await openDialog()
    await user().click(within(dialog).getByRole('button', { name: 'Delegate' }))
    expect(await within(dialog).findByText('Pick who covers for you.')).toBeInTheDocument()
    expect(iam.calls).not.toContain('delegations.create')
  })

  it('delegates one department, with dates in my zone and a note', async () => {
    const { iam } = renderPage(<DelegationsPage />)
    const dialog = await openDialog()
    await pick(dialog, 'Grace Hopper')
    await user().click(within(dialog).getByRole('radio', { name: 'One department' }))
    expect(within(dialog).getByRole('combobox', { name: 'Department' })).toHaveValue(DEPT)
    expect(within(dialog).getByRole('option', { name: 'Engineering' })).toBeInTheDocument()
    await user().click(within(dialog).getByRole('checkbox', { name: 'Starts now' }))
    await user().type(within(dialog).getByLabelText('Starts on'), '2026-12-01T09:00')
    await user().click(within(dialog).getByRole('checkbox', { name: /Open-ended/ }))
    await user().type(within(dialog).getByLabelText('Ends on'), '2026-12-20T09:00')
    await user().type(within(dialog).getByLabelText('Note (optional)'), 'On leave')
    await user().click(within(dialog).getByRole('button', { name: 'Delegate' }))
    await waitFor(() => expect(iam.bodies['delegations.create']).toHaveLength(1))
    // Europe/London in December is UTC+0.
    expect(iam.bodies['delegations.create']![0]).toMatchObject({ request: { scope: 'department', scopeId: DEPT, startsAt: '2026-12-01T09:00:00.000Z', endsAt: '2026-12-20T09:00:00.000Z', note: 'On leave' } })
  })

  it.each([
    ['a department not chosen', async (d: HTMLElement) => user().click(within(d).getByRole('radio', { name: 'One department' })).then(() => user().selectOptions(within(d).getByRole('combobox', { name: 'Department' }), 'Pick a department')), 'Pick a department.'],
    ['a start in the past', async (d: HTMLElement) => { await user().click(within(d).getByRole('checkbox', { name: 'Starts now' })); await user().type(within(d).getByLabelText('Starts on'), '2026-11-01T09:00') }, "The start can't be in the past."],
    ['an end before the start', async (d: HTMLElement) => { await user().click(within(d).getByRole('checkbox', { name: /Open-ended/ })); await user().type(within(d).getByLabelText('Ends on'), '2026-11-20T09:00') }, 'The end must be after the start.'],
    ['an end beyond the policy', async (d: HTMLElement) => { await user().click(within(d).getByRole('checkbox', { name: /Open-ended/ })); await user().type(within(d).getByLabelText('Ends on'), '2027-06-01T09:00') }, 'That is longer than your workspace allows.'],
    ['a date left empty', async (d: HTMLElement) => { await user().click(within(d).getByRole('checkbox', { name: /Open-ended/ })) }, 'Enter a date and time.'],
  ])('refuses %s at its field', async (_name, act, message) => {
    const { iam } = renderPage(<DelegationsPage />)
    const dialog = await openDialog()
    await pick(dialog, 'Grace Hopper')
    await act(dialog)
    await user().click(within(dialog).getByRole('button', { name: 'Delegate' }))
    expect(await within(dialog).findByText(message)).toBeInTheDocument()
    expect(iam.calls).not.toContain('delegations.create')
  })

  it('keeps one Idempotency-Key for every retry of a submission, and makes a new one after a change', async () => {
    const iam = createFakeIam()
    iam.failNext('delegations.create', problem(503, 'ORG_MEMBERSHIP_UNAVAILABLE'))
    let n = 0
    const { services } = renderPage(<DelegationsPage />, { iam, services: { ids: { next: () => `key-${++n}` } } })
    expect(services).toBeDefined()
    const dialog = await openDialog()
    await pick(dialog, 'Grace Hopper')
    await user().click(within(dialog).getByRole('button', { name: 'Delegate' }))
    expect(await within(dialog).findByText('Nothing was changed. Try again.')).toBeInTheDocument()
    await user().click(within(dialog).getByRole('button', { name: 'Delegate' }))
    await waitFor(() => expect(iam.bodies['delegations.create']).toHaveLength(2))
    expect((iam.bodies['delegations.create'] as { key: string }[]).map((c) => c.key)).toEqual(['key-1', 'key-1'])
  })

  it('makes a new key once a field has changed', async () => {
    const iam = createFakeIam()
    iam.failNext('delegations.create', problem(503, 'USER_PROFILE_UNAVAILABLE'))
    let n = 0
    renderPage(<DelegationsPage />, { iam, services: { ids: { next: () => `key-${++n}` } } })
    const dialog = await openDialog()
    await pick(dialog, 'Grace Hopper')
    await user().click(within(dialog).getByRole('button', { name: 'Delegate' }))
    await within(dialog).findByText('Nothing was changed. Try again.')
    await user().type(within(dialog).getByLabelText('Note (optional)'), 'x')
    await user().click(within(dialog).getByRole('button', { name: 'Delegate' }))
    await waitFor(() => expect(iam.bodies['delegations.create']).toHaveLength(2))
    expect((iam.bodies['delegations.create'] as { key: string }[]).map((c) => c.key)).toEqual(['key-1', 'key-2'])
  })

  it('on "still saving" waits, reads the list once more, and never resends with a new key', async () => {
    const iam = createFakeIam()
    iam.failNext('delegations.create', problem(409, 'IDEMPOTENCY_KEY_IN_FLIGHT'))
    renderPage(<DelegationsPage />, { iam })
    const dialog = await openDialog()
    await pick(dialog, 'Grace Hopper')
    const before = iam.calls.filter((c) => c === 'delegations.list').length
    await user().click(within(dialog).getByRole('button', { name: 'Delegate' }))
    expect(await within(dialog).findByText('Still saving your previous request.')).toBeInTheDocument()
    await waitFor(() => expect(iam.calls.filter((c) => c === 'delegations.list').length).toBeGreaterThan(before), { timeout: IN_FLIGHT_RECHECK_MS + 2000 })
    expect(iam.bodies['delegations.create']).toHaveLength(1)
  })

  it('shows a service refusal in the dialog and keeps it open', async () => {
    const iam = createFakeIam()
    iam.failNext('delegations.create', problem(422, 'delegate_unavailable'))
    renderPage(<DelegationsPage />, { iam })
    const dialog = await openDialog()
    await pick(dialog, 'Grace Hopper')
    await user().click(within(dialog).getByRole('button', { name: 'Delegate' }))
    expect(await within(dialog).findByText("They're out of office themselves.")).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Delegate my work' })).toBeInTheDocument()
  })

  it('cancels the dialog without sending anything', async () => {
    const { iam } = renderPage(<DelegationsPage />)
    const dialog = await openDialog()
    await user().click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(iam.calls).not.toContain('delegations.create')
  })

  it('opens prefilled from G2\'s link with the out-of-office window', async () => {
    renderPage(<DelegationsPage />, { path: '/t/acme/me/delegations?create=1&from=2026-12-01T09:00:00Z&until=2026-12-10T09:00:00Z' })
    const dialog = await screen.findByRole('dialog', { name: 'Delegate my work' })
    expect(within(dialog).getByLabelText('Starts on')).toHaveValue('2026-12-01T09:00')
    expect(within(dialog).getByLabelText('Ends on')).toHaveValue('2026-12-10T09:00')
    await user().click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('Extend (DLG-4)', () => {
  const setup = () => {
    const iam = createFakeIam()
    iam.state.delegations = [delegation({ endsAt: undefined, reviewDueAt: addDays(NOW, 2), recordVersion: version(5) })]
    return iam
  }

  it('extends the review by the days asked, with the version', async () => {
    const iam = setup()
    renderPage(<DelegationsPage />, { iam })
    await user().click(await screen.findByRole('button', { name: 'Extend' }))
    const dialog = await screen.findByRole('dialog', { name: 'Extend review' })
    await user().clear(within(dialog).getByLabelText('Days to extend (1 to 180)'))
    await user().type(within(dialog).getByLabelText('Days to extend (1 to 180)'), '45')
    await user().click(within(dialog).getByRole('button', { name: 'Extend' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(iam.bodies['delegations.extend']).toEqual([{ id: expect.any(String), request: { extendDays: 45, recordVersion: 5 } }])
  })

  it.each(['0', '181', '', '2.5'])('refuses %j days', async (days) => {
    const iam = setup()
    renderPage(<DelegationsPage />, { iam })
    await user().click(await screen.findByRole('button', { name: 'Extend' }))
    const dialog = await screen.findByRole('dialog', { name: 'Extend review' })
    const field = within(dialog).getByLabelText('Days to extend (1 to 180)')
    await user().clear(field)
    if (days) await user().type(field, days)
    await user().click(within(dialog).getByRole('button', { name: 'Extend' }))
    expect(await within(dialog).findByText('Choose 1 to 180 days.')).toBeInTheDocument()
    expect(iam.calls).not.toContain('delegations.extend')
  })

  it('shows a lost race as a conflict dialog and Reload reads the list again', async () => {
    const iam = setup()
    iam.failNext('delegations.extend', problem(409, 'optimistic_lock_conflict'))
    renderPage(<DelegationsPage />, { iam })
    await user().click(await screen.findByRole('button', { name: 'Extend' }))
    await user().click(within(await screen.findByRole('dialog', { name: 'Extend review' })).getByRole('button', { name: 'Extend' }))
    const conflict = await screen.findByRole('dialog', { name: 'This changed while you were editing' })
    const before = iam.calls.filter((c) => c === 'delegations.list').length
    await user().click(within(conflict).getByRole('button', { name: 'Reload' }))
    await waitFor(() => expect(iam.calls.filter((c) => c === 'delegations.list').length).toBeGreaterThan(before))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows any other failure in the dialog', async () => {
    const iam = setup()
    iam.failNext('delegations.extend', problem(422, 'extend_days_out_of_range'))
    renderPage(<DelegationsPage />, { iam })
    await user().click(await screen.findByRole('button', { name: 'Extend' }))
    const dialog = await screen.findByRole('dialog', { name: 'Extend review' })
    await user().click(within(dialog).getByRole('button', { name: 'Extend' }))
    expect(await within(dialog).findByText('Choose 1 to 180 days.')).toBeInTheDocument()
  })
})

describe('Reassign (DLG-5)', () => {
  const setup = (over: Parameters<typeof delegation>[0] = {}) => {
    const iam = createFakeIam()
    iam.state.delegations = [delegation({ delegateId: OTHER, scope: 'all', endsAt: at('2026-12-20T09:00:00Z'), ...over })]
    return iam
  }
  const open = async () => {
    await user().click(await screen.findByRole('button', { name: 'Reassign' }))
    return screen.findByRole('dialog', { name: 'Reassign delegation' })
  }

  it('prefills the delegation, and sends only what changed, with the reason and the version', async () => {
    const iam = setup()
    renderPage(<DelegationsPage />, { iam })
    const dialog = await open()
    expect(within(dialog).getByText('If this fails, the current delegation will already have ended.')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Ends on')).toHaveValue('2026-12-20T09:00')
    expect(within(dialog).getByRole('checkbox', { name: /Open-ended/ })).toBeDisabled()
    await waitFor(() => expect(within(within(dialog).getByRole('combobox', { name: 'Delegate' })).getByRole('option', { name: 'Alan Turing (out of office)' })).toBeInTheDocument())
    await user().selectOptions(within(dialog).getByRole('combobox', { name: 'Delegate' }), 'Alan Turing (out of office)')
    await user().type(within(dialog).getByLabelText('Reason (optional)'), 'Cover')
    await user().click(within(dialog).getByRole('button', { name: 'Reassign' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(iam.bodies['delegations.reassign']).toEqual([{ id: expect.any(String), request: { newDelegateId: THIRD, reason: 'Cover', recordVersion: 5 } }])
  })

  it('refuses a request that changes nothing', async () => {
    const iam = setup()
    renderPage(<DelegationsPage />, { iam })
    const dialog = await open()
    await user().click(within(dialog).getByRole('button', { name: 'Reassign' }))
    expect(await within(dialog).findByText('Change something first.')).toBeInTheDocument()
    expect(iam.calls).not.toContain('delegations.reassign')
  })

  it('refuses a changed scope that is not mine, and a date that is not one', async () => {
    const iam = setup()
    renderPage(<DelegationsPage />, { iam })
    const dialog = await open()
    await user().click(within(dialog).getByRole('radio', { name: 'One department' }))
    await user().selectOptions(within(dialog).getByRole('combobox', { name: 'Department' }), 'Pick a department')
    await user().click(within(dialog).getByRole('button', { name: 'Reassign' }))
    expect(await within(dialog).findByText('Pick a department.')).toBeInTheDocument()
    await user().clear(within(dialog).getByLabelText('Ends on'))
    await user().click(within(dialog).getByRole('button', { name: 'Reassign' }))
    expect(await within(dialog).findByText('Enter a date and time.')).toBeInTheDocument()
  })

  it('lets an open-ended delegation get an end date', async () => {
    const iam = setup({ endsAt: undefined, reviewDueAt: addDays(NOW, 40) })
    renderPage(<DelegationsPage />, { iam })
    const dialog = await open()
    const openEnded = within(dialog).getByRole('checkbox', { name: /Open-ended/ })
    expect(openEnded).toBeEnabled()
    await user().click(openEnded)
    await user().type(within(dialog).getByLabelText('Ends on'), '2026-12-15T09:00')
    await user().click(within(dialog).getByRole('button', { name: 'Reassign' }))
    await waitFor(() => expect(iam.bodies['delegations.reassign']).toHaveLength(1))
    expect(iam.bodies['delegations.reassign']![0]).toMatchObject({ request: { endsAt: '2026-12-15T09:00:00.000Z' } })
  })

  it('after a failure says the current delegation may have ended, and reads the list again', async () => {
    const iam = setup()
    iam.failNext('delegations.reassign', problem(503, 'ORG_MEMBERSHIP_UNAVAILABLE'))
    renderPage(<DelegationsPage />, { iam })
    const dialog = await open()
    await user().type(within(dialog).getByLabelText('Reason (optional)'), 'x')
    await waitFor(() => expect(within(within(dialog).getByRole('combobox', { name: 'Delegate' })).getByRole('option', { name: 'Alan Turing (out of office)' })).toBeInTheDocument())
    await user().selectOptions(within(dialog).getByRole('combobox', { name: 'Delegate' }), 'Alan Turing (out of office)')
    const before = iam.calls.filter((c) => c === 'delegations.list').length
    await user().click(within(dialog).getByRole('button', { name: 'Reassign' }))
    expect(await within(dialog).findByText('The current delegation may already have ended. The list shows what is true now.')).toBeInTheDocument()
    await waitFor(() => expect(iam.calls.filter((c) => c === 'delegations.list').length).toBeGreaterThan(before))
  })

  it('shows a lost race as a conflict dialog', async () => {
    const iam = setup()
    iam.failNext('delegations.reassign', problem(409, 'optimistic_lock_conflict'))
    renderPage(<DelegationsPage />, { iam })
    const dialog = await open()
    await user().type(within(dialog).getByLabelText('Reason (optional)'), 'x')
    await waitFor(() => expect(within(within(dialog).getByRole('combobox', { name: 'Delegate' })).getByRole('option', { name: 'Alan Turing (out of office)' })).toBeInTheDocument())
    await user().selectOptions(within(dialog).getByRole('combobox', { name: 'Delegate' }), 'Alan Turing (out of office)')
    await user().click(within(dialog).getByRole('button', { name: 'Reassign' }))
    const conflict = await screen.findByRole('dialog', { name: 'This changed while you were editing' })
    await user().click(within(conflict).getByRole('button', { name: 'Reload' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('Cancel (DLG-3)', () => {
  const setup = () => {
    const iam = createFakeIam()
    iam.state.delegations = [delegation()]
    return iam
  }

  it('asks first, then cancels with the version', async () => {
    const iam = setup()
    const { recorded } = renderPage(<DelegationsPage />, { iam })
    await user().click(await screen.findByRole('button', { name: 'Cancel' }))
    const dialog = await screen.findByRole('dialog', { name: 'Cancel delegation' })
    await user().click(within(dialog).getByRole('button', { name: 'Cancel delegation' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(iam.bodies['delegations.cancel']).toEqual([{ id: expect.any(String), recordVersion: 5 }])
    expect(recorded.actions).toEqual([{ action: 'cancel_delegation', outcome: 'success' }])
    expect(await screen.findByText("You're not delegating any work.")).toBeInTheDocument()
  })

  it('keeps the delegation when the question is dismissed', async () => {
    const iam = setup()
    renderPage(<DelegationsPage />, { iam })
    await user().click(await screen.findByRole('button', { name: 'Cancel' }))
    const dialog = await screen.findByRole('dialog', { name: 'Cancel delegation' })
    await user().click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(iam.calls).not.toContain('delegations.cancel')
  })

  it('shows a failure in the dialog, and a lost race as a conflict dialog', async () => {
    const iam = setup()
    iam.failNext('delegations.cancel', problem(503, 'DB_UNAVAILABLE'))
    iam.failNext('delegations.cancel', problem(409, 'optimistic_lock_conflict'))
    renderPage(<DelegationsPage />, { iam })
    await user().click(await screen.findByRole('button', { name: 'Cancel' }))
    const dialog = await screen.findByRole('dialog', { name: 'Cancel delegation' })
    await user().click(within(dialog).getByRole('button', { name: 'Cancel delegation' }))
    expect(await within(dialog).findByText('Nothing was changed. Try again.')).toBeInTheDocument()
    await user().click(within(dialog).getByRole('button', { name: 'Cancel delegation' }))
    const conflict = await screen.findByRole('dialog', { name: 'This changed while you were editing' })
    await user().click(within(conflict).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('Reassign: an end the user did not touch', () => {
  it('is not a change even when the service\'s end has seconds the form cannot show (23:59:59)', async () => {
    const iam = createFakeIam()
    iam.state.delegations = [delegation({ delegateId: OTHER, scope: 'all', endsAt: at('2026-12-20T23:59:59Z') })]
    renderPage(<DelegationsPage />, { iam })
    await user().click(await screen.findByRole('button', { name: 'Reassign' }))
    const dialog = await screen.findByRole('dialog', { name: 'Reassign delegation' })
    expect(within(dialog).getByLabelText('Ends on')).toHaveValue('2026-12-20T23:59')
    await user().click(within(dialog).getByRole('button', { name: 'Reassign' }))
    expect(await within(dialog).findByText('Change something first.')).toBeInTheDocument()
    expect(iam.calls).not.toContain('delegations.reassign')
  })
})

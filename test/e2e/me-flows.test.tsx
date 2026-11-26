// Whole-App flows against a fake IAM at the network (test/fixtures/fakeIamServer.ts, held to the pinned Swagger
// by the contract harness) and a fake object storage: what a member does, screen to screen, through the real
// adapters, the real query cache and the real router (LLD §14). Every test also fails if the fake saw a request
// or gave an answer the Swagger does not allow.
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, rs } from '@rstest/core'
import { openApp, PNG } from '../fixtures/app'
import { ALAN, ENG, GRACE, ME, createFakeIamServer, type FakeIamServer } from '../fixtures/fakeIamServer'

const user = () => userEvent.setup()
let current: FakeIamServer | undefined
afterEach(() => {
  expect(current?.violations ?? []).toEqual([])
  current = undefined
  rs.unstubAllGlobals()
})
const open = (path?: string, o: Parameters<typeof openApp>[1] = {}) => {
  const server = o.server ?? createFakeIamServer()
  current = server
  return openApp(path, { ...o, server })
}

/** A wall-clock text `days` from now, in UTC (the profile's zone is Europe/London). */
const wall = (days: number, hour = 9) => {
  const d = new Date(Date.now() + days * 86_400_000)
  return `${d.toISOString().slice(0, 10)}T${String(hour).padStart(2, '0')}:00`
}
const nameField = () => screen.findByRole('textbox', { name: 'Display name' })
const pickDelegate = async (dialog: HTMLElement, name: string) => {
  const select = within(dialog).getByRole('combobox', { name: 'Delegate' })
  await waitFor(() => expect(within(select).getByRole('option', { name })).toBeInTheDocument())
  await user().selectOptions(select, name)
}

describe('profile (G1)', () => {
  it('opens at the index, shows my profile and my access, and moves between sections with the tabs', async () => {
    open()
    expect(await nameField()).toHaveValue('Ada Lovelace')
    expect(await screen.findByText('Engineering · Lead approver')).toBeInTheDocument()
    await user().click(await screen.findByRole('link', { name: 'Availability' }))
    expect(await screen.findByRole('radio', { name: 'Available' })).toBeChecked()
    expect(window.location.pathname).toBe('/t/acme/me/availability')
  })

  it('edits my name, sends only what changed with the version, and saves', async () => {
    const { server } = open()
    const name = await nameField()
    await user().clear(name)
    await user().type(name, 'Ada King')
    await user().click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect(server.bodies['PATCH /users/:id']).toEqual([{ display_name: 'Ada King', expected_version: 3 }])
    expect(server.state.profile['record_version']).toBe(4)
  })

  it('handles a conflict: another change lands first, the dialog shows my draft, and Reload brings in theirs', async () => {
    const { server } = open()
    const name = await nameField()
    server.state.profile['display_name'] = 'Changed Elsewhere'
    server.state.profile['record_version'] = 4
    await user().clear(name)
    await user().type(name, 'Ada King')
    await user().click(screen.getByRole('button', { name: 'Save' }))
    const dialog = await screen.findByRole('dialog', { name: 'This changed while you were editing' })
    expect(within(dialog).getByText('Ada King')).toBeInTheDocument()
    await user().click(within(dialog).getByRole('button', { name: 'Reload' }))
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Display name' })).toHaveValue('Changed Elsewhere'))
    await user().type(screen.getByRole('textbox', { name: 'Display name' }), '!')
    await user().click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText('Saved')
    expect(server.bodies['PATCH /users/:id']!.at(-1)).toEqual({ display_name: 'Changed Elsewhere!', expected_version: 4 })
  })

  it('a federated user: editing marks the field as overridden, and Revert sends only the flag', async () => {
    const server = createFakeIamServer()
    server.state.profile['source'] = 'federated'
    open('/t/acme/me', { server })
    expect(await screen.findAllByText('From your company directory')).toHaveLength(2)
    await user().type(await nameField(), '!')
    await user().click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText('Saved')
    expect(server.bodies['PATCH /users/:id']![0]).toEqual({ display_name: 'Ada Lovelace!', display_name_overridden: true, expected_version: 3 })
    await user().click(await screen.findByRole('button', { name: 'Revert to directory value' }))
    await waitFor(() => expect(server.bodies['PATCH /users/:id']).toHaveLength(2))
    expect(server.bodies['PATCH /users/:id']![1]).toEqual({ display_name_overridden: false, expected_version: 4 })
  })

  it('puts the service\'s field errors on the form (a 422 the rules did not catch)', async () => {
    const server = createFakeIamServer()
    server.failNext('PATCH /users/:id', { status: 422, errorCode: 'VALIDATION_FAILED', extra: { validationErrors: [{ field: 'phone', message: 'is not a number we can call' }] } })
    open('/t/acme/me', { server })
    await user().type(await nameField(), '!')
    await user().click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('is not a number we can call')).toBeInTheDocument()
  })

  it('says the profile is being set up after a 404, with my name from the sign-in', async () => {
    const server = createFakeIamServer()
    server.failNext('GET /users/:id', { status: 404, errorCode: 'NOT_FOUND' })
    open('/t/acme/me', { server })
    expect(await screen.findByText('Your profile is being set up')).toBeInTheDocument()
    expect(screen.getByText('Ada Lovelace · ada@example.com')).toBeInTheDocument()
  })
})

describe('signature upload (G1, IAM-UX-13)', () => {
  const pick = async (bytes: Uint8Array = PNG, type = 'image/png') => {
    const input = (await screen.findByLabelText('Upload a signature')) as HTMLInputElement
    await user().upload(input, new File([bytes as BlobPart], 'sig.png', { type }))
  }
  const save = async () => user().click(await screen.findByRole('button', { name: 'Save signature' }))

  it('presigns, puts the bytes straight to storage with no credentials, confirms by key and hash, and says it was saved', async () => {
    const { server } = open()
    await pick()
    await save()
    expect(await screen.findByText(/Signature saved/)).toBeInTheDocument()
    expect(server.log.filter((l) => /signature/.test(l))).toEqual(['POST /users/:id/signature', 'PUT /users/:id/signature'])
    const [put] = server.storageRequests
    expect(put).toMatchObject({ credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', headers: { 'content-type': 'image/png' }, bytes: PNG.length })
    expect(Object.keys(put!.headers).filter((h) => /authorization|cookie|x-request-id|x-session-id|traceparent/.test(h))).toEqual([])
    expect(server.state.signature).toBeDefined()
    expect(document.body.textContent).not.toContain('SECRET')
  })

  it('a second upload replaces the first', async () => {
    const { server } = open()
    await pick()
    await save()
    await screen.findByText(/Signature saved/)
    await pick()
    await save()
    await waitFor(() => expect(server.log.filter((l) => l === 'PUT /users/:id/signature')).toHaveLength(2))
  })

  it('removing asks first; a new upload right after is refused while the erasure is pending', async () => {
    const { server } = open()
    await user().click(await screen.findByRole('button', { name: 'Remove signature' }))
    await user().click(within(await screen.findByRole('dialog', { name: 'Remove your signature?' })).getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(server.log).toContain('DELETE /users/:id/signature'))
    await pick()
    await save()
    expect(await screen.findByText('Your previous signature is still being removed. Try again in a minute.')).toBeInTheDocument()
    expect(server.storageRequests).toHaveLength(0)
  })

  it('refuses a file over 1 MB and a file that is not a PNG or JPEG, before any request', async () => {
    const { server } = open()
    const big = new Uint8Array(1_048_577)
    big.set(PNG)
    const input = (await screen.findByLabelText('Upload a signature')) as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File([big as BlobPart], 'big.png', { type: 'image/png' })] } })
    expect(await screen.findByText('The file is larger than 1 MB.')).toBeInTheDocument()
    fireEvent.change(input, { target: { files: [new File([Uint8Array.from([0x47, 0x49, 0x46, 0x38]) as BlobPart], 'sig.gif', { type: 'image/gif' })] } })
    expect(await screen.findByText('Pick a PNG or JPEG image.')).toBeInTheDocument()
    expect(server.log.filter((l) => /signature/.test(l))).toEqual([])
  })

  it('a storage failure (a stale signature, CORS, the network) changes nothing and is never confirmed', async () => {
    const server = createFakeIamServer()
    server.failStorage({ status: 403 })
    server.failStorage({ status: 0, network: true })
    open('/t/acme/me', { server })
    await pick()
    await save()
    expect(await screen.findByText("We couldn't upload your signature. Nothing was changed. Try again.")).toBeInTheDocument()
    await save()
    await waitFor(() => expect(server.storageRequests).toHaveLength(2))
    expect(server.log).not.toContain('PUT /users/:id/signature')
    expect(server.state.signature).toBeUndefined()
  })

  it('a confirm that does not match the stored bytes is "didn\'t match", and the next try starts from the presign', async () => {
    const server = createFakeIamServer()
    server.failNext('PUT /users/:id/signature', { status: 422, errorCode: 'VALIDATION_FAILED' })
    open('/t/acme/me', { server })
    await pick()
    await save()
    expect(await screen.findByText("The upload didn't match. Try again.")).toBeInTheDocument()
    await save()
    await screen.findByText(/Signature saved/)
    expect(server.log.filter((l) => l === 'POST /users/:id/signature')).toHaveLength(2)
  })

  it('a presign that is rate limited says to try again shortly', async () => {
    const server = createFakeIamServer()
    server.failNext('POST /users/:id/signature', { status: 429, errorCode: 'RATE_LIMITED' })
    open('/t/acme/me', { server })
    await pick()
    await save()
    expect(await screen.findByText('Too many uploads. Try again shortly.')).toBeInTheDocument()
  })

  it('hides Upload where no storage origin is configured', async () => {
    open('/t/acme/me', { flags: { 'me.ai.models': 'model-a' } })
    expect(await screen.findByText("Signature upload isn't available in this environment.")).toBeInTheDocument()
    expect(screen.queryByLabelText('Upload a signature')).not.toBeInTheDocument()
  })

  it('refuses an upload URL outside the allowed origins without making the request', async () => {
    const server = createFakeIamServer()
    open('/t/acme/me', { server, flags: { 'me.signature.uploadOrigins': 'https://elsewhere.example' } })
    await pick()
    await save()
    expect(await screen.findByText("We couldn't upload your signature. Nothing was changed. Try again.")).toBeInTheDocument()
    expect(server.storageRequests).toHaveLength(0)
  })
})

describe('availability (G2)', () => {
  it('sets out of office with a window, and shows what was saved', async () => {
    const { server } = open('/t/acme/me/availability')
    await user().click(await screen.findByRole('radio', { name: 'Out of office' }))
    await user().type(screen.getByLabelText('Away from'), wall(2))
    await user().type(screen.getByLabelText('Back on'), wall(9))
    await user().type(screen.getByLabelText('Note to colleagues'), 'On leave')
    await user().click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect(server.bodies['PUT /users/:id/availability']![0]).toMatchObject({ status: 'ooo', note: 'On leave', expected_version: 2 })
  })

  it.each([
    ['an inverted window', () => [wall(9), wall(2)], 'The end must be after the start.'],
    ['a window over 180 days', () => [wall(2), wall(300)], 'An out-of-office can last up to 180 days.'],
  ])('refuses %s without a request', async (_n, dates, message) => {
    const { server } = open('/t/acme/me/availability')
    await user().click(await screen.findByRole('radio', { name: 'Out of office' }))
    const [from, until] = dates()
    await user().type(screen.getByLabelText('Away from'), from!)
    await user().type(screen.getByLabelText('Back on'), until!)
    await user().click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(server.log).not.toContain('PUT /users/:id/availability')
  })

  it('says who is covering when a delegation set it, and an out of office that overlaps is refused by the service', async () => {
    const server = createFakeIamServer()
    server.state.availability['delegate_user_id'] = GRACE
    open('/t/acme/me/availability', { server })
    expect(await screen.findByText('Grace Hopper')).toBeInTheDocument()
    expect(screen.getByText('is covering for you.')).toBeInTheDocument()
    await user().click(screen.getByRole('radio', { name: 'Out of office' }))
    await user().type(screen.getByLabelText('Away from'), wall(2))
    await user().type(screen.getByLabelText('Back on'), wall(9))
    await user().click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('This overlaps your out-of-office set by a delegation. Change it from Delegations.')).toBeInTheDocument()
    expect(server.bodies['PUT /users/:id/availability']![0]).not.toHaveProperty('delegate_user_id')
  })
})

describe('delegations (G3)', () => {
  const create = async (name = 'Grace Hopper') => {
    await user().click(await screen.findByRole('button', { name: 'Delegate my work' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delegate my work' })
    await pickDelegate(dialog, name)
    return dialog
  }

  it('creates a delegation, lists it with its review date, and my availability now names the delegate', async () => {
    const { server } = open('/t/acme/me/delegations')
    const dialog = await create()
    await user().click(within(dialog).getByRole('button', { name: 'Delegate' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    const table = await screen.findByRole('table', { name: 'My active delegations' })
    expect(await within(table).findByText('Grace Hopper')).toBeInTheDocument()
    expect(within(table).getByText(/Open-ended — review by/)).toBeInTheDocument()
    expect(server.bodies['POST /delegations']![0]).toEqual({ delegate_id: GRACE, scope: 'all' })
    await user().click(await screen.findByRole('link', { name: 'Availability' }))
    expect(await screen.findByText('is covering for you.', undefined, { timeout: 4000 })).toBeInTheDocument()
  })

  it('"still saving" (409 IDEMPOTENCY_KEY_IN_FLIGHT), then the same submission succeeds with the same key and creates one delegation', async () => {
    const server = createFakeIamServer()
    server.failNext('POST /delegations', { status: 409, errorCode: 'idempotency_key_in_flight' })
    open('/t/acme/me/delegations', { server })
    const dialog = await create()
    await user().click(within(dialog).getByRole('button', { name: 'Delegate' }))
    expect(await within(dialog).findByText('Still saving your previous request.')).toBeInTheDocument()
    await user().click(within(dialog).getByRole('button', { name: 'Delegate' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    const keys = server.headersSeen['POST /delegations']!.map((h) => h['idempotency-key'])
    expect(keys).toHaveLength(2)
    expect(keys[0]).toBe(keys[1])
    expect(server.state.delegations).toHaveLength(1)
  })

  it('a delegate who is out of office is flagged and cannot be submitted', async () => {
    open('/t/acme/me/delegations')
    await user().click(await screen.findByRole('button', { name: 'Delegate my work' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delegate my work' })
    const select = within(dialog).getByRole('combobox', { name: 'Delegate' })
    await waitFor(() => expect(within(select).getByRole('option', { name: 'Alan Turing (out of office)' })).toBeInTheDocument())
    await user().selectOptions(select, 'Alan Turing (out of office)')
    expect(await within(dialog).findByText("Out of office — they can't cover. Pick someone else.")).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Delegate' })).toBeDisabled()
    expect(ALAN).toBeDefined()
  })

  it('a department delegation uses my department, named by the tenant', async () => {
    const { server } = open('/t/acme/me/delegations')
    const dialog = await create()
    await user().click(within(dialog).getByRole('radio', { name: 'One department' }))
    expect(await within(dialog).findByRole('option', { name: 'Engineering' })).toBeInTheDocument()
    await user().click(within(dialog).getByRole('button', { name: 'Delegate' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(server.bodies['POST /delegations']![0]).toEqual({ delegate_id: GRACE, scope: 'department', scope_id: ENG })
  })

  const withOne = (fixed = false) => {
    const server = createFakeIamServer()
    server.state.delegations = [
      {
        delegation_id: 'dlg-9',
        delegator_id: ME,
        delegate_id: GRACE,
        scope: 'all',
        starts_at: new Date().toISOString(),
        ...(fixed ? { ends_at: new Date(Date.now() + 20 * 86_400_000).toISOString() } : { review_due_at: new Date(Date.now() + 2 * 86_400_000).toISOString(), review_window_days: 90 }),
        status: 'active',
        record_version: 5,
      },
    ]
    return server
  }

  it('extends an open-ended delegation whose review is due, and the banner goes', async () => {
    const server = withOne()
    open('/t/acme/me/delegations', { server })
    expect(await screen.findByText(/Review by .*: extend or cancel\./)).toBeInTheDocument()
    await user().click(screen.getByRole('button', { name: 'Extend' }))
    const dialog = await screen.findByRole('dialog', { name: 'Extend review' })
    await user().click(within(dialog).getByRole('button', { name: 'Extend' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(server.bodies['POST /delegations/:id/extend']).toEqual([{ extend_days: 30, record_version: 5 }])
    await waitFor(() => expect(screen.queryByText(/Review by .*: extend or cancel\./)).not.toBeInTheDocument())
  })

  it('reassign that fails after the old one ended: the list shows the truth, not the old delegation', async () => {
    const server = withOne(true)
    open('/t/acme/me/delegations', { server })
    await user().click(await screen.findByRole('button', { name: 'Reassign' }))
    const dialog = await screen.findByRole('dialog', { name: 'Reassign delegation' })
    const select = within(dialog).getByRole('combobox', { name: 'Delegate' })
    // Alan is out of office: the service ends the current delegation, then refuses the new one.
    await waitFor(() => expect(within(select).getByRole('option', { name: 'Alan Turing (out of office)' })).toBeInTheDocument())
    await user().selectOptions(select, 'Alan Turing (out of office)')
    await user().click(within(dialog).getByRole('button', { name: 'Reassign' }))
    expect(await within(dialog).findByText('The current delegation may already have ended. The list shows what is true now.')).toBeInTheDocument()
    await waitFor(() => expect(server.state.delegations).toHaveLength(0))
    await user().click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(await screen.findByText("You're not delegating any work.")).toBeInTheDocument()
  })

  it('refuses a reassignment that changes nothing before any request', async () => {
    const server = withOne(true)
    open('/t/acme/me/delegations', { server })
    await user().click(await screen.findByRole('button', { name: 'Reassign' }))
    const dialog = await screen.findByRole('dialog', { name: 'Reassign delegation' })
    await user().click(within(dialog).getByRole('button', { name: 'Reassign' }))
    expect(await within(dialog).findByText('Change something first.')).toBeInTheDocument()
    expect(server.log).not.toContain('POST /delegations/:id/reassign')
  })

  it('cancel with a conflict: the dialog says it changed, and Reload shows what is there now', async () => {
    const server = withOne()
    open('/t/acme/me/delegations', { server })
    await user().click(await screen.findByRole('button', { name: 'Cancel' }))
    const confirm = await screen.findByRole('dialog', { name: 'Cancel delegation' })
    server.state.delegations[0]!['record_version'] = 6
    await user().click(within(confirm).getByRole('button', { name: 'Cancel delegation' }))
    const conflict = await screen.findByRole('dialog', { name: 'This changed while you were editing' })
    await user().click(within(conflict).getByRole('button', { name: 'Reload' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await user().click(await screen.findByRole('button', { name: 'Cancel' }))
    await user().click(within(await screen.findByRole('dialog', { name: 'Cancel delegation' })).getByRole('button', { name: 'Cancel delegation' }))
    await waitFor(() => expect(server.state.delegations).toHaveLength(0))
  })

  it('opens the create dialog from G2 with the out-of-office window filled in', async () => {
    open('/t/acme/me/availability')
    await user().click(await screen.findByRole('radio', { name: 'Out of office' }))
    await user().type(screen.getByLabelText('Away from'), wall(2))
    await user().type(screen.getByLabelText('Back on'), wall(9))
    await user().click(screen.getByRole('link', { name: /Delegate your work/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Delegate my work' })
    expect(within(dialog).getByLabelText('Starts on')).toHaveValue(wall(2))
    expect(within(dialog).getByLabelText('Ends on')).toHaveValue(wall(9))
  })
})

describe('AI preferences (G4)', () => {
  it('saves the first time with no version, then with the version', async () => {
    const { server } = open('/t/acme/me/ai')
    await user().selectOptions(await screen.findByRole('combobox', { name: 'Preferred model' }), 'model-a')
    await user().click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText('Saved')
    await user().selectOptions(screen.getByRole('combobox', { name: 'Writing tone' }), 'formal')
    await user().click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(server.bodies['PUT /users/:id/llm-preferences']).toHaveLength(2))
    expect(server.bodies['PUT /users/:id/llm-preferences']).toEqual([
      { preferred_model: 'model-a', writing_tone: 'neutral', templates: [], context_documents: [] },
      { preferred_model: 'model-a', writing_tone: 'formal', templates: [], context_documents: [], expected_version: 1 },
    ])
  })

  it('a saved model that is no longer offered must be changed before saving', async () => {
    const server = createFakeIamServer()
    server.state.llm = { preferred_model: 'retired-model', writing_tone: 'neutral', templates: [], context_documents: [], record_version: 2 }
    open('/t/acme/me/ai', { server })
    const model = await screen.findByRole('combobox', { name: 'Preferred model' })
    expect(within(model).getByRole('option', { name: 'retired-model (no longer offered)' })).toBeInTheDocument()
    await user().click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Pick a model from the list.')).toBeInTheDocument()
    expect(server.log).not.toContain('PUT /users/:id/llm-preferences')
    await user().selectOptions(model, 'model-b')
    await user().click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText('Saved')
  })

  it('a model the service refuses is "Pick another model"', async () => {
    open('/t/acme/me/ai', { flags: { 'me.ai.models': 'retired-model, model-b' } })
    await user().selectOptions(await screen.findByRole('combobox', { name: 'Preferred model' }), 'retired-model')
    await user().click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Pick another model.')).toBeInTheDocument()
  })
})

describe('notification preferences (G5)', () => {
  it('saves the whole list, and resets to defaults only after a confirmation', async () => {
    const { server } = open('/t/acme/me/notifications')
    await user().click(await screen.findByRole('checkbox', { name: 'Email for doc.approved' }))
    await user().click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText('Saved')
    expect(server.bodies['PUT /users/:id/notification-preferences']).toEqual([{ preferences: [{ event_type: 'doc.approved', channels: ['email'], urgency_threshold: 'any' }] }])
    await user().click(screen.getByRole('button', { name: 'Reset to defaults' }))
    await user().click(within(await screen.findByRole('dialog', { name: 'Reset to defaults?' })).getByRole('button', { name: 'Reset' }))
    await waitFor(() => expect(server.bodies['PUT /users/:id/notification-preferences']).toHaveLength(2))
    expect(server.bodies['PUT /users/:id/notification-preferences']![1]).toEqual({ preferences: [] })
    expect(await screen.findByRole('checkbox', { name: 'Email for doc.approved' })).not.toBeChecked()
  })
})

describe('security (G6)', () => {
  it('links to the account console of my realm, safely, for a paid workspace', async () => {
    open('/t/acme/me/security')
    const link = await screen.findByRole('link', { name: /Manage sign-in/ })
    expect(link.getAttribute('href')).toMatch(/^https:\/\/auth\.bcbpsolutions\.com\/realms\/tenant-acme\/account\/?$/)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    expect(screen.queryByText(/Trial workspaces share/)).not.toBeInTheDocument()
  })

  it('links to the shared trial realm, and says so, for a trial workspace', async () => {
    open('/t/acme/me/security', { realm: 'trial' })
    const link = await screen.findByRole('link', { name: /Manage sign-in/ })
    expect(link.getAttribute('href')).toMatch(/\/realms\/trial\/account/)
    expect(screen.getByText(/Trial workspaces share one account console/)).toBeInTheDocument()
  })
})

describe('a read-only workspace', () => {
  it.each([
    ['/t/acme/me', 'Display name', 'textbox'],
    ['/t/acme/me/availability', 'Available', 'radio'],
    ['/t/acme/me/delegations', 'Delegate my work', 'button'],
    ['/t/acme/me/ai', 'Preferred model', 'combobox'],
    ['/t/acme/me/notifications', 'Email for doc.approved', 'checkbox'],
  ] as const)('%s disables its controls and says why, and writes nothing', async (path, name, role) => {
    const { server } = open(path, { readOnly: true })
    expect(await screen.findByRole(role, { name })).toBeDisabled()
    expect(screen.getByText('Workspace is read-only (subscription ended).')).toBeInTheDocument()
    expect(server.log.filter((l) => !l.startsWith('GET') && !l.startsWith('POST /users:batch'))).toEqual([])
  })

  it('the gateway\'s own refusal after the fact is the same message', async () => {
    const server = createFakeIamServer()
    server.failNext('PATCH /users/:id', { status: 403, errorCode: 'DENY_TENANT_READ_ONLY' })
    open('/t/acme/me', { server })
    await user().type(await nameField(), '!')
    await user().click(screen.getByRole('button', { name: 'Save' }))
    // The message may be shown twice: as the failure, and as the banner once the SDK has put the workspace in read-only mode.
    expect((await screen.findAllByText('Workspace is read-only (subscription ended).')).length).toBeGreaterThan(0)
  })
})

describe('routing', () => {
  it('sends the old /profile path to the profile index', async () => {
    open('/t/acme/me/profile')
    expect(await screen.findByRole('heading', { level: 1, name: 'Profile' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/t/acme/me')
  })
})


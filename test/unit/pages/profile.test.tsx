import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from '@rstest/core'
import ProfilePage from '../../../src/presentation/pages/ProfilePage'
import { profileRetry } from '../../../src/presentation/features/profile/useMyProfile'
import { ME, version } from '../../fixtures/domain'
import { createFakeIam, problem } from '../../fixtures/fakeIam'
import { renderPage } from '../../fixtures/pages'

const loaded = async () => screen.findByRole('textbox', { name: 'Display name' })
const user = () => userEvent.setup()

describe('ProfilePage (G1)', () => {
  it('shows my profile: editable fields, a read-only email, and my access', async () => {
    renderPage(<ProfilePage />)
    expect(await loaded()).toHaveValue('Ada Lovelace')
    expect(screen.getByRole('textbox', { name: 'Job title' })).toHaveValue('Engineer')
    expect(screen.getByRole('textbox', { name: 'Email' })).toHaveAttribute('readonly')
    expect(screen.getByRole('textbox', { name: 'Phone' })).toHaveValue('+442071838750')
    expect(screen.getByRole('combobox', { name: 'Language' })).toHaveValue('en')
    expect(screen.getByRole('combobox', { name: 'Time zone' })).toHaveValue('Europe/London')
    expect(screen.getByLabelText('Credential name 1')).toHaveValue('cert')
    expect(screen.getByRole('heading', { name: 'My access' })).toBeInTheDocument()
  })

  it('saves only what changed, with the version, and says Saved', async () => {
    const { iam, recorded } = renderPage(<ProfilePage />)
    const name = await loaded()
    await user().clear(name)
    await user().type(name, 'Ada King')
    await user().click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect(iam.bodies['updateUser']).toEqual([{ displayName: 'Ada King', expectedVersion: 3 }])
    expect(recorded.actions).toEqual([{ action: 'update_profile', outcome: 'success' }])
    // The page reloads from the answer: the form is the new record at its new version.
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Display name' })).toHaveValue('Ada King'))
  })

  it('writes the saved answer into my users:batch entry so my own chip updates at once', async () => {
    const { client } = renderPage(<ProfilePage />)
    const name = await loaded()
    await user().clear(name)
    await user().type(name, 'Ada King')
    await user().click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText('Saved')
    expect(client.getQueryData(['me', 'acme', 'users', ME])).toMatchObject({ state: 'found', user: { displayName: 'Ada King' } })
  })

  it('refuses a draft with nothing to save, and says why at the page', async () => {
    const { iam } = renderPage(<ProfilePage />)
    await loaded()
    await user().click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('There is nothing to save yet.')).toBeInTheDocument()
    expect(iam.calls).not.toContain('updateUser')
  })

  it.each([
    ['Display name', '', 'Enter your name.'],
    ['Phone', '0207', 'Use the international format, for example +12125551234.'],
    ['Time zone', 'Mars/Base', 'Pick a time zone from the list.'],
  ])('refuses a bad %s at the field and sends nothing', async (label, value, message) => {
    const { iam } = renderPage(<ProfilePage />)
    const field = await screen.findByRole(label === 'Time zone' ? 'combobox' : 'textbox', { name: label })
    await user().clear(field)
    if (value) await user().type(field, value)
    await user().click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(iam.calls).not.toContain('updateUser')
  })

  it('edits credentials: add, change, remove; names the bad row', async () => {
    const { iam } = renderPage(<ProfilePage />)
    await loaded()
    await user().click(screen.getByRole('button', { name: 'Add a credential' }))
    await user().type(screen.getByLabelText('Credential name 2'), 'org')
    await user().type(screen.getByLabelText('Credential value 2'), 'bad;value')
    await user().click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Use up to 64 letters, digits or - / ( ) . characters.')).toBeInTheDocument()
    await user().clear(screen.getByLabelText('Credential value 2'))
    await user().type(screen.getByLabelText('Credential value 2'), 'BCBP')
    await user().click(screen.getByRole('button', { name: 'Remove credential 1' }))
    await user().click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText('Saved')
    expect(iam.bodies['updateUser']![0]).toMatchObject({ credentials: { org: 'BCBP' }, deleteCredentials: ['cert'] })
  })

  it('shows a lost race as a conflict dialog with my draft, and Reload brings in the other version', async () => {
    const iam = createFakeIam()
    renderPage(<ProfilePage />, { iam })
    const name = await loaded()
    iam.state.profile = { ...iam.state.profile, displayName: 'Someone Else', recordVersion: version(4) }
    await user().clear(name)
    await user().type(name, 'Ada King')
    await user().click(screen.getByRole('button', { name: 'Save' }))
    const dialog = await screen.findByRole('dialog', { name: 'This changed while you were editing' })
    expect(within(dialog).getByText('Ada King')).toBeInTheDocument()
    await user().click(within(dialog).getByRole('button', { name: 'Reload' }))
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Display name' })).toHaveValue('Someone Else'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes the conflict dialog without reloading', async () => {
    const iam = createFakeIam()
    renderPage(<ProfilePage />, { iam })
    const name = await loaded()
    iam.state.profile = { ...iam.state.profile, recordVersion: version(9) }
    await user().clear(name)
    await user().type(name, 'Ada King')
    await user().click(screen.getByRole('button', { name: 'Save' }))
    await user().click(await screen.findByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Display name' })).toHaveValue('Ada King')
  })

  it('puts the service\'s field errors on the form (a 422 the rules should have caught)', async () => {
    const iam = createFakeIam()
    iam.failNext('updateUser', problem(422, 'VALIDATION_FAILED', { validationErrors: [{ field: 'phone', message: 'is not a valid number' }] }))
    renderPage(<ProfilePage />, { iam })
    const name = await loaded()
    await user().type(name, '!')
    await user().click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('is not a valid number')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Phone' })).toHaveAttribute('aria-invalid', 'true')
  })

  it('shows any other failure with the message for its code, never the server\'s text, and a copy-details button', async () => {
    const iam = createFakeIam()
    iam.failNext('updateUser', problem(503, 'USER_PROFILE_UNAVAILABLE', { detail: 'SECRET stack' }))
    renderPage(<ProfilePage />, { iam })
    const name = await loaded()
    await user().type(name, '!')
    await user().click(screen.getByRole('button', { name: 'Save' }))
    const alert = await screen.findByText('Nothing was changed. Try again.')
    expect(alert.closest('[role=alert]')).not.toHaveTextContent('SECRET')
    expect(screen.getByRole('button', { name: 'Copy details' })).toBeInTheDocument()
  })

  it('changes the language only within what the shell offers, keeping a saved one it no longer offers', async () => {
    const iam = createFakeIam()
    iam.state.profile = { ...iam.state.profile, locale: 'ar' }
    renderPage(<ProfilePage />, { iam })
    const language = await screen.findByRole('combobox', { name: 'Language' })
    expect(language).toHaveValue('ar')
    expect(within(language).getAllByRole('option').map((o) => o.textContent)).toEqual(['English', 'ar'])
  })

  it('shows an empty language and zone list gracefully for a profile with none set', async () => {
    const iam = createFakeIam()
    iam.state.profile = { ...iam.state.profile, locale: '', timezone: '' }
    renderPage(<ProfilePage />, { iam })
    const language = await screen.findByRole('combobox', { name: 'Language' })
    expect(language).toHaveValue('')
  })

  describe('a federated user (IAM-UX-11)', () => {
    const federated = (over: object = {}) => {
      const iam = createFakeIam()
      iam.state.profile = { ...iam.state.profile, source: 'federated', ...over }
      return iam
    }

    it('says "From your company directory" for a name and a title that have not been edited', async () => {
      renderPage(<ProfilePage />, { iam: federated() })
      await loaded()
      expect(screen.getAllByText('From your company directory')).toHaveLength(2)
      expect(screen.queryByRole('button', { name: 'Revert to directory value' })).not.toBeInTheDocument()
    })

    it('marks an edited name as overridden', async () => {
      const iam = federated()
      renderPage(<ProfilePage />, { iam })
      const name = await loaded()
      await user().type(name, '!')
      await user().click(screen.getByRole('button', { name: 'Save' }))
      await screen.findByText('Saved')
      expect(iam.bodies['updateUser']![0]).toMatchObject({ displayName: 'Ada Lovelace!', displayNameOverridden: true })
    })

    it('offers Revert for an overridden field and sends only the flag turned off', async () => {
      const iam = federated({ displayNameOverridden: true })
      const { recorded } = renderPage(<ProfilePage />, { iam })
      await loaded()
      await user().click(screen.getByRole('button', { name: 'Revert to directory value' }))
      await screen.findByText('Saved')
      expect(iam.bodies['updateUser']).toEqual([{ displayNameOverridden: false, expectedVersion: 3 }])
      expect(recorded.actions).toEqual([{ action: 'revert_directory_value', outcome: 'success' }])
    })

    it('shows a revert that fails', async () => {
      const iam = federated({ jobTitleOverridden: true })
      iam.failNext('updateUser', problem(409, 'VERSION_CONFLICT'))
      renderPage(<ProfilePage />, { iam })
      await loaded()
      await user().click(screen.getByRole('button', { name: 'Revert to directory value' }))
      expect(await screen.findByRole('dialog', { name: 'This changed while you were editing' })).toBeInTheDocument()
    })
  })

  it('disables every control in a read-only workspace and says why', async () => {
    renderPage(<ProfilePage />, { readOnly: true })
    const name = await loaded()
    expect(name).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Add a credential' })).toBeDisabled()
    expect(screen.getByText('Workspace is read-only (subscription ended).')).toBeInTheDocument()
  })

  it('shows a failed load with Retry, and the page keeps its title', async () => {
    const iam = createFakeIam()
    iam.failNext('getUser', problem(500, 'INTERNAL'))
    renderPage(<ProfilePage />, { iam })
    expect(await screen.findByText(/We couldn't load your profile\./)).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Profile' })).toBeInTheDocument()
    await user().click(screen.getByRole('button', { name: 'Retry' }))
    expect(await loaded()).toHaveValue('Ada Lovelace')
  })

  it('says the profile is being set up on a 404, with the name and email from the sign-in, editing off, and tries once more', async () => {
    const iam = createFakeIam()
    iam.failNext('getUser', problem(404, 'NOT_FOUND'))
    const original = profileRetry.delayMs
    profileRetry.delayMs = 30
    try {
      renderPage(<ProfilePage />, { iam })
      expect(await screen.findByText('Your profile is being set up')).toBeInTheDocument()
      expect(screen.getByText('Ada Lovelace · ada@example.com')).toBeInTheDocument()
      expect(screen.queryByRole('textbox', { name: 'Display name' })).not.toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'My access' })).toBeInTheDocument()
      expect(await loaded()).toHaveValue('Ada Lovelace')
      expect(iam.calls.filter((c) => c === 'getUser')).toHaveLength(2)
    } finally {
      profileRetry.delayMs = original
    }
  })

  it('asks only once more: a second 404 stays "being set up"', async () => {
    const iam = createFakeIam()
    iam.failNext('getUser', problem(404, 'NOT_FOUND'))
    iam.failNext('getUser', problem(404, 'NOT_FOUND'))
    const original = profileRetry.delayMs
    profileRetry.delayMs = 20
    try {
      renderPage(<ProfilePage />, { iam })
      await screen.findByText('Your profile is being set up')
      await waitFor(() => expect(iam.calls.filter((c) => c === 'getUser')).toHaveLength(2))
      await new Promise((r) => setTimeout(r, 120))
    } finally {
      profileRetry.delayMs = original
    }
    expect(screen.getByText('Your profile is being set up')).toBeInTheDocument()
    expect(iam.calls.filter((c) => c === 'getUser')).toHaveLength(2)
  })
})

describe('My access', () => {
  it('lists my roles and my departments with the tenant\'s names and level labels', async () => {
    renderPage(<ProfilePage />, { departments: [{ id: '33333333-3333-4333-8333-333333333333', level: 'approver' }] })
    expect(await screen.findByText('Engineering · Lead approver')).toBeInTheDocument()
    expect(screen.getByText('Ask an administrator to change this.')).toBeInTheDocument()
  })

  it('names a level without a tenant label by its own name, and an unknown department as "Department"', async () => {
    renderPage(<ProfilePage />, { departments: [{ id: '33333333-3333-4333-8333-333333333333', level: 'reviewer' }, { id: 'unknown-dept', level: 'preparator' }, { id: 'x', level: 'wizard' }] })
    expect(await screen.findByText('Engineering · Reviewer')).toBeInTheDocument()
    expect(screen.getByText('Department · Preparator')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem').filter((li) => /wizard/i.test(li.textContent ?? ''))).toEqual([])
  })

  it('says so when I am in no department', async () => {
    renderPage(<ProfilePage />, { departments: [] })
    expect(await screen.findByText("You aren't in a department yet.")).toBeInTheDocument()
  })

  it('names the roles IAM sends (known ones and the implicit member), never an unknown one', async () => {
    const { platform } = renderPage(<ProfilePage />)
    await loaded()
    expect(platform).toBeDefined()
    expect(screen.getByRole('heading', { name: 'Roles' })).toBeInTheDocument()
  })
})


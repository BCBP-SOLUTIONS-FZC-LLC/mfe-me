import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from '@rstest/core'
import AiPreferencesPage from '../../../src/presentation/pages/AiPreferencesPage'
import NotificationPreferencesPage from '../../../src/presentation/pages/NotificationPreferencesPage'
import { llm, version } from '../../fixtures/domain'
import { createFakeIam, problem } from '../../fixtures/fakeIam'
import { renderPage } from '../../fixtures/pages'

const user = () => userEvent.setup()

describe('AiPreferencesPage (G4)', () => {
  const loaded = () => screen.findByRole('combobox', { name: 'Preferred model' })

  it('starts from defaults when nothing is saved (a 404), and saves the first time with no version', async () => {
    const { iam, recorded } = renderPage(<AiPreferencesPage />)
    const model = await loaded()
    expect(model).toHaveValue('')
    expect(screen.getByRole('combobox', { name: 'Writing tone' })).toHaveValue('neutral')
    await user().selectOptions(model, 'model-b')
    await user().click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect(iam.bodies['putLlmPreferences']).toEqual([{ preferredModel: 'model-b', writingTone: 'neutral', templates: [], contextDocuments: [] }])
    expect(recorded.actions).toEqual([{ action: 'save_ai_preferences', outcome: 'success' }])
  })

  it('shows what is saved and replaces it whole, with the version', async () => {
    const iam = createFakeIam()
    iam.state.llm = llm({ preferredModel: 'model-a', writingTone: 'formal', templates: ['Summarise'], contextDocuments: ['Gulf hardware'], recordVersion: version(4) })
    renderPage(<AiPreferencesPage />, { iam })
    expect(await loaded()).toHaveValue('model-a')
    expect(screen.getByRole('combobox', { name: 'Writing tone' })).toHaveValue('formal')
    expect(screen.getByLabelText('Prompt templates 1')).toHaveValue('Summarise')
    expect(screen.getByLabelText('Context snippets 1')).toHaveValue('Gulf hardware')
  })

  it('edits templates and snippets and sends the full body with expected_version', async () => {
    const iam = createFakeIam()
    iam.state.llm = llm({ recordVersion: version(4) })
    renderPage(<AiPreferencesPage />, { iam })
    await loaded()
    const adds = screen.getAllByRole('button', { name: 'Add' })
    await user().click(adds[0]!)
    await user().type(screen.getByLabelText('Prompt templates 1'), 'Be brief')
    await user().click(adds[1]!)
    await user().type(screen.getByLabelText('Context snippets 1'), 'We sell kit')
    await user().selectOptions(screen.getByRole('combobox', { name: 'Writing tone' }), 'concise')
    await user().click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText('Saved')
    expect(iam.bodies['putLlmPreferences']).toEqual([{ preferredModel: 'model-a', writingTone: 'concise', templates: ['Be brief'], contextDocuments: ['We sell kit'], expectedVersion: 4 }])
  })

  it('shows a saved model that is no longer offered, and refuses to save until it is changed', async () => {
    const iam = createFakeIam()
    iam.state.llm = llm({ preferredModel: 'retired-model' })
    renderPage(<AiPreferencesPage />, { iam })
    const model = await loaded()
    expect(model).toHaveValue('retired-model')
    expect(within(model).getByRole('option', { name: 'retired-model (no longer offered)' })).toBeInTheDocument()
    expect(screen.getByText('This model is no longer offered. Pick another to save.')).toBeInTheDocument()
    await user().click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Pick a model from the list.')).toBeInTheDocument()
    expect(iam.calls).not.toContain('putLlmPreferences')
    await user().selectOptions(model, 'model-b')
    expect(screen.queryByText('This model is no longer offered. Pick another to save.')).not.toBeInTheDocument()
  })

  it.each([
    ['no model', async () => undefined, 'Pick a model.'],
    ['an empty template', async () => { await user().selectOptions(screen.getByRole('combobox', { name: 'Preferred model' }), 'model-a'); await user().click(screen.getAllByRole('button', { name: 'Add' })[0]!) }, "A template can't be empty. Fill it in or remove it."],
    ['no change', async () => undefined, 'There is nothing to save yet.'],
  ])('refuses %s', async (name, arrange, message) => {
    const iam = createFakeIam()
    if (name === 'no change') iam.state.llm = llm()
    renderPage(<AiPreferencesPage />, { iam })
    await loaded()
    await arrange()
    await user().click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(iam.calls).not.toContain('putLlmPreferences')
  })

  it('says "Pick another model" for a model the service no longer knows', async () => {
    const iam = createFakeIam()
    iam.failNext('putLlmPreferences', problem(422, 'UNKNOWN_MODEL'))
    renderPage(<AiPreferencesPage />, { iam })
    await user().selectOptions(await loaded(), 'model-a')
    await user().click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Pick another model.')).toBeInTheDocument()
  })

  it('says model choice is not available when none is configured, and saves nothing', async () => {
    renderPage(<AiPreferencesPage />, { services: { options: { allowedModels: [], notificationEventTypes: [], enabledLocales: ['en'], uploadOrigins: [], timeZones: [] } } })
    expect(await screen.findByText("Model choice isn't available yet.")).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Preferred model' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('warns about secrets and says the drafting mode lives on the tender', async () => {
    renderPage(<AiPreferencesPage />)
    await loaded()
    expect(screen.getByText(/Don't paste secrets/)).toBeInTheDocument()
    expect(screen.getByText(/set on each tender/)).toBeInTheDocument()
  })

  it('shows a lost race as a conflict dialog, and Reload brings in the other version', async () => {
    const iam = createFakeIam()
    iam.state.llm = llm({ recordVersion: version(4) })
    renderPage(<AiPreferencesPage />, { iam })
    await loaded()
    iam.state.llm = llm({ preferredModel: 'model-b', recordVersion: version(5) })
    await user().selectOptions(screen.getByRole('combobox', { name: 'Writing tone' }), 'formal')
    await user().click(screen.getByRole('button', { name: 'Save' }))
    const dialog = await screen.findByRole('dialog', { name: 'This changed while you were editing' })
    await user().click(within(dialog).getByRole('button', { name: 'Reload' }))
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Preferred model' })).toHaveValue('model-b'))
  })

  it('closes the conflict dialog; shows another failure with its message; read-only disables everything; a failed load retries', async () => {
    const iam = createFakeIam()
    iam.state.llm = llm()
    iam.failNext('putLlmPreferences', problem(409, 'VERSION_CONFLICT'))
    iam.failNext('putLlmPreferences', problem(503, 'DB_UNAVAILABLE'))
    iam.failNext('getLlmPreferences', problem(500, 'INTERNAL'))
    renderPage(<AiPreferencesPage />, { iam })
    expect(await screen.findByText(/We couldn't load your AI preferences\./)).toBeInTheDocument()
    await user().click(screen.getByRole('button', { name: 'Retry' }))
    await loaded()
    await user().selectOptions(screen.getByRole('combobox', { name: 'Writing tone' }), 'formal')
    await user().click(screen.getByRole('button', { name: 'Save' }))
    await user().click(await screen.findByRole('button', { name: 'Close' }))
    await user().click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Nothing was changed. Try again.')).toBeInTheDocument()
  })

  it('is read-only in a read-only workspace', async () => {
    renderPage(<AiPreferencesPage />, { readOnly: true })
    expect(await loaded()).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(screen.getByText('Workspace is read-only (subscription ended).')).toBeInTheDocument()
  })
})

describe('NotificationPreferencesPage (G5)', () => {
  const loaded = () => screen.findByRole('table', { name: 'Notification preferences' })
  const stored = [{ eventType: 'doc.approved', channels: ['email' as const], urgencyThreshold: 'high' as const }]
  const withEvents = (...events: string[]) => ({ options: { allowedModels: [], notificationEventTypes: events, enabledLocales: ['en'], uploadOrigins: [], timeZones: [] } })

  it('shows one row per event type, with "Default" for a row not stored', async () => {
    const iam = createFakeIam()
    iam.state.notifications = stored
    renderPage(<NotificationPreferencesPage />, { iam, services: withEvents('doc.approved', 'doc.rejected') })
    const table = await loaded()
    expect(within(table).getAllByText('Default')).toHaveLength(1)
    expect(within(table).getByRole('checkbox', { name: 'Email for doc.approved' })).toBeChecked()
    expect(within(table).getByRole('checkbox', { name: 'SMS for doc.approved' })).not.toBeChecked()
    expect(within(table).getByRole('combobox', { name: 'Minimum urgency for doc.approved' })).toHaveValue('high')
  })

  it('sends the whole list: the stored rows and the ones I changed, and shows what the server answered', async () => {
    const iam = createFakeIam()
    iam.state.notifications = stored
    const { recorded } = renderPage(<NotificationPreferencesPage />, { iam, services: withEvents('doc.approved', 'doc.rejected') })
    const table = await loaded()
    await user().click(within(table).getByRole('checkbox', { name: 'In the app for doc.rejected' }))
    await user().selectOptions(within(table).getByRole('combobox', { name: 'Minimum urgency for doc.rejected' }), 'critical')
    await user().click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect(iam.bodies['putNotificationPreferences']).toEqual([
      [
        { eventType: 'doc.approved', channels: ['email'], urgencyThreshold: 'high' },
        { eventType: 'doc.rejected', channels: ['in_app'], urgencyThreshold: 'critical' },
      ],
    ])
    expect(recorded.actions).toEqual([{ action: 'save_notification_preferences', outcome: 'success' }])
    await waitFor(() => expect(within(screen.getByRole('table')).queryAllByText('Default')).toHaveLength(0))
  })

  it('unchecking a channel keeps the row (with no channels) rather than deleting it', async () => {
    const iam = createFakeIam()
    iam.state.notifications = stored
    renderPage(<NotificationPreferencesPage />, { iam, services: withEvents('doc.approved') })
    await user().click(await screen.findByRole('checkbox', { name: 'Email for doc.approved' }))
    await user().click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText('Saved')
    expect(iam.bodies['putNotificationPreferences']![0]).toEqual([{ eventType: 'doc.approved', channels: [], urgencyThreshold: 'high' }])
  })

  it('refuses a save that changes nothing', async () => {
    const iam = createFakeIam()
    iam.state.notifications = stored
    renderPage(<NotificationPreferencesPage />, { iam, services: withEvents('doc.approved') })
    await loaded()
    await user().click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('There is nothing to save yet.')).toBeInTheDocument()
    expect(iam.calls).not.toContain('putNotificationPreferences')
  })

  it('keeps a stored event type that is no longer configured, under "Other"', async () => {
    const iam = createFakeIam()
    iam.state.notifications = [...stored, { eventType: 'doc.old', channels: ['sms'], urgencyThreshold: 'any' }]
    renderPage(<NotificationPreferencesPage />, { iam, services: withEvents('doc.approved') })
    const other = await screen.findByRole('table', { name: 'Other saved preferences' })
    expect(within(other).getByRole('checkbox', { name: 'SMS for doc.old' })).toBeChecked()
    await user().click(within(other).getByRole('checkbox', { name: 'Push for doc.old' }))
    await user().click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText('Saved')
    expect((iam.bodies['putNotificationPreferences']![0] as { eventType: string }[]).map((r) => r.eventType)).toEqual(['doc.approved', 'doc.old'])
  })

  it('shows only stored rows when no event types are configured, and says so when there are none', async () => {
    const iam = createFakeIam()
    iam.state.notifications = stored
    const first = renderPage(<NotificationPreferencesPage />, { iam, services: withEvents() })
    expect(await screen.findByRole('table', { name: 'Other saved preferences' })).toBeInTheDocument()
    first.unmount()
    renderPage(<NotificationPreferencesPage />, { services: withEvents() })
    expect(await screen.findByText('There are no notification events to set up yet.')).toBeInTheDocument()
  })

  it('resets to defaults only after a confirmation, sending an empty list', async () => {
    const iam = createFakeIam()
    iam.state.notifications = stored
    renderPage(<NotificationPreferencesPage />, { iam, services: withEvents('doc.approved', 'doc.rejected') })
    await loaded()
    await user().click(screen.getByRole('button', { name: 'Reset to defaults' }))
    const dialog = await screen.findByRole('dialog', { name: 'Reset to defaults?' })
    await user().click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(iam.calls).not.toContain('putNotificationPreferences')
    await user().click(screen.getByRole('button', { name: 'Reset to defaults' }))
    await user().click(within(await screen.findByRole('dialog', { name: 'Reset to defaults?' })).getByRole('button', { name: 'Reset' }))
    await waitFor(() => expect(iam.bodies['putNotificationPreferences']).toEqual([[]]))
    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect(within(screen.getByRole('table')).getAllByText('Default')).toHaveLength(2)
    expect(screen.getByRole('checkbox', { name: 'Email for doc.approved' })).not.toBeChecked()
  })

  it('shows a failed save and a failed reset, and a failed load with Retry', async () => {
    const iam = createFakeIam()
    iam.state.notifications = stored
    iam.failNext('getNotificationPreferences', problem(500, 'INTERNAL'))
    iam.failNext('putNotificationPreferences', problem(503, 'USER_PROFILE_UNAVAILABLE'))
    iam.failNext('putNotificationPreferences', problem(503, 'USER_PROFILE_UNAVAILABLE'))
    renderPage(<NotificationPreferencesPage />, { iam, services: withEvents('doc.approved') })
    expect(await screen.findByText(/We couldn't load your notification preferences\./)).toBeInTheDocument()
    await user().click(screen.getByRole('button', { name: 'Retry' }))
    await user().click(await screen.findByRole('checkbox', { name: 'SMS for doc.approved' }))
    await user().click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Nothing was changed. Try again.')).toBeInTheDocument()
    await user().click(screen.getByRole('button', { name: 'Reset to defaults' }))
    await user().click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Reset' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByText('Nothing was changed. Try again.')).toBeInTheDocument()
  })

  it('is read-only in a read-only workspace', async () => {
    renderPage(<NotificationPreferencesPage />, { readOnly: true, services: withEvents('doc.approved') })
    expect(await screen.findByRole('checkbox', { name: 'Email for doc.approved' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Reset to defaults' })).toBeDisabled()
  })
})

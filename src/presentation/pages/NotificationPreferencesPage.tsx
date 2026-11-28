// G5 Notification preferences: for each event type, which channels and the least urgent thing I want to hear
// about. A row I have not set shows "Default" and is not stored until I change it. A save sends the **whole**
// list (an omitted row is deleted); "Reset to defaults" sends an empty list after a confirmation. The event
// types come from configuration until the Notification Service publishes them (LLD §15 #10); stored types that
// are not in the list stay, under "Other". There is no version, so the page shows what the server answered.
import { useT } from '@bcbp-solutions-fzc-llc/frontend-sdk/react'
import { useId, useState } from 'react'
import type { NotificationPreference } from '../../domain/entities/preferences'
import { planNotificationPreferences, type NotificationFailure } from '../../domain/rules/me-rules'
import { CHANNELS, URGENCY, type Channel, type Urgency } from '../../domain/vocabulary'
import { APP_ID } from '../../shared/constants/app'
import ConfirmDialog from '../components/ConfirmDialog'
import LoadFailed from '../components/LoadFailed'
import ProblemDetails from '../components/ProblemDetails'
import ReadOnlyNotice from '../components/ReadOnlyNotice'
import SavedNotice from '../components/SavedNotice'
import { btnOutline, btnPrimary, card, cardHeader, cardTitle, input } from '../components/styles'
import { useMeAccess } from '../features/access/useMeAccess'
import { useNotificationPreferences, useSaveNotificationPreferences } from '../features/notifications/useNotificationPreferences'
import { useMeServices } from '../features/services'
import { useProblemText } from '../features/useProblemText'

const CHANNEL_KEYS = { email: 'notifications.channel.email', sms: 'notifications.channel.sms', in_app: 'notifications.channel.inApp', push: 'notifications.channel.push' } as const satisfies Record<Channel, string>
const URGENCY_KEYS = { any: 'notifications.urgency.any', normal: 'notifications.urgency.normal', high: 'notifications.urgency.high', critical: 'notifications.urgency.critical' } as const satisfies Record<Urgency, string>
const FAILURE_KEYS = {
  'duplicate-event-type': 'notifications.err.duplicate',
  'event-type-unknown': 'notifications.err.unknown',
  'event-type-too-long': 'notifications.err.tooLong',
  'channel-invalid': 'notifications.err.channel',
  'urgency-invalid': 'notifications.err.urgency',
  'no-change': 'notifications.err.noChange',
} as const satisfies Record<NotificationFailure, string>

/** A row of the form: whether it is stored (or has been changed) and its values. */
interface Row {
  readonly eventType: string
  readonly channels: readonly Channel[]
  readonly urgency: Urgency
  readonly set: boolean
}

const DEFAULT_URGENCY: Urgency = 'any'

/** The configured event types, then any stored type that is not configured, each as stored or as a default. */
function rowsOf(saved: readonly NotificationPreference[], configured: readonly string[]): Row[] {
  const byType = new Map(saved.map((p) => [p.eventType, p]))
  const row = (eventType: string): Row => {
    const p = byType.get(eventType)
    return { eventType, channels: p?.channels ?? [], urgency: p?.urgencyThreshold ?? DEFAULT_URGENCY, set: p !== undefined }
  }
  return [...configured, ...saved.map((p) => p.eventType).filter((e) => !configured.includes(e))].map(row)
}

export default function NotificationPreferencesPage() {
  const t = useT(APP_ID)
  const query = useNotificationPreferences()
  return (
    <section className="flex flex-col gap-4" aria-busy={query.isPending || undefined}>
      <h1 className="text-xl font-semibold">{t('nav.notifications')}</h1>
      <ReadOnlyNotice />
      {query.isError && <LoadFailed message={t('notifications.failed')} error={query.error} onRetry={() => void query.refetch()} />}
      {query.isPending && <p>{t('common.loading')}</p>}
      {query.data && <NotificationForm saved={query.data} />}
    </section>
  )
}

function NotificationForm({ saved }: { saved: readonly NotificationPreference[] }) {
  const t = useT(APP_ID)
  const id = useId()
  const { options } = useMeServices()
  const { canWrite } = useMeAccess()
  const problemText = useProblemText()
  const save = useSaveNotificationPreferences()
  const configured = options.notificationEventTypes
  const [rows, setRows] = useState<Row[]>(() => rowsOf(saved, configured))
  const [error, setError] = useState<string>()
  const [failure, setFailure] = useState<unknown>()
  const [done, setDone] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)

  const change = (eventType: string, patch: Partial<Row>) => {
    setRows((rs) => rs.map((r) => (r.eventType === eventType ? { ...r, ...patch, set: true } : r)))
    setDone(false)
    setError(undefined)
    setFailure(undefined)
  }
  const toggle = (r: Row, channel: Channel) => change(r.eventType, { channels: r.channels.includes(channel) ? r.channels.filter((c) => c !== channel) : [...r.channels, channel] })

  const submit = async () => {
    setError(undefined)
    setFailure(undefined)
    setDone(false)
    const plan = planNotificationPreferences(rows.filter((r) => r.set).map((r) => ({ eventType: r.eventType, channels: r.channels, urgencyThreshold: r.urgency })), configured, saved)
    if (!plan.ok) return setError(t(FAILURE_KEYS[plan.failure]))
    try {
      await save.mutateAsync(plan.value)
      setDone(true)
    } catch (e) {
      setFailure(e)
    }
  }

  const reset = async () => {
    setFailure(undefined)
    try {
      await save.mutateAsync([])
      setRows(rowsOf([], configured))
      setConfirmReset(false)
      setDone(true)
    } catch (e) {
      setFailure(e)
      setConfirmReset(false)
    }
  }

  const other = rows.filter((r) => !configured.includes(r.eventType))
  const main = rows.filter((r) => configured.includes(r.eventType))
  const renderRow = (r: Row) => (
    <tr key={r.eventType} className="border-t border-aura-border">
      <th scope="row" className="px-3 py-3 text-start font-medium">
        {r.eventType}
        {!r.set && <span className="ms-2 badge badge-ghost">{t('notifications.default')}</span>}
      </th>
      {CHANNELS.map((channel) => (
        <td key={channel} className="px-3 py-3 text-center">
          <input type="checkbox" aria-label={t('notifications.channelFor', { channel: t(CHANNEL_KEYS[channel]), event: r.eventType })} checked={r.channels.includes(channel)} disabled={!canWrite} onChange={() => toggle(r, channel)} />
        </td>
      ))}
      <td className="px-3 py-3">
        <select aria-label={t('notifications.urgencyFor', { event: r.eventType })} className={input} value={r.urgency} disabled={!canWrite} onChange={(e) => change(r.eventType, { urgency: e.target.value as Urgency })}>
          {URGENCY.map((u) => (
            <option key={u} value={u}>
              {t(URGENCY_KEYS[u])}
            </option>
          ))}
        </select>
      </td>
    </tr>
  )
  const table = (list: Row[], caption: string) => (
    <div className={`${card} overflow-x-auto`}>
      <div className={cardHeader} aria-hidden="true">
        <h3 className={cardTitle}>{caption}</h3>
      </div>
      <table className="w-full min-w-[40rem] border-collapse text-start text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className="px-3 py-2 text-start text-xs font-semibold uppercase text-aura-muted">{t('notifications.col.event')}</th>
            {CHANNELS.map((c) => (
              <th key={c} scope="col" className="px-3 py-2 text-center text-xs font-semibold uppercase text-aura-muted">{t(CHANNEL_KEYS[c])}</th>
            ))}
            <th scope="col" className="px-3 py-2 text-start text-xs font-semibold uppercase text-aura-muted">{t('notifications.col.urgency')}</th>
          </tr>
        </thead>
        <tbody>{list.map(renderRow)}</tbody>
      </table>
    </div>
  )

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      aria-describedby={`${id}-intro`}
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <p id={`${id}-intro`} className="text-sm text-aura-muted">
        {t('notifications.intro')}
      </p>
      {main.length === 0 && other.length === 0 && <p role="status" className={`${card} p-6 text-center text-aura-muted`}>{t('notifications.none')}</p>}
      {main.length > 0 && table(main, t('notifications.title'))}
      {other.length > 0 && table(other, t('notifications.other'))}
      {error && <p role="alert" className="text-sm text-status-error">{error}</p>}
      {failure !== undefined && (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-status-error">
          <span>{problemText(failure)}</span>
          <ProblemDetails error={failure} />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className={btnPrimary} disabled={!canWrite || save.isPending}>
          {save.isPending ? t('common.working') : t('common.save')}
        </button>
        <button type="button" className={btnOutline} disabled={!canWrite || save.isPending} onClick={() => setConfirmReset(true)}>
          {t('notifications.reset')}
        </button>
        <SavedNotice show={done} />
      </div>
      {confirmReset && (
        <ConfirmDialog title={t('notifications.resetTitle')} confirmLabel={t('notifications.resetConfirm')} busy={save.isPending} onConfirm={() => void reset()} onCancel={() => setConfirmReset(false)}>
          <p>{t('notifications.resetBody')}</p>
        </ConfirmDialog>
      )}
    </form>
  )
}

// G2: my availability: available, busy or out of office. Out of office has a window in my time zone (stored
// as UTC) and a note for colleagues. **This screen never sets a delegate** (LLD §7.4, IAM-FE-Q8): Delegation
// owns that. When someone is covering, it says who and links to G3; "Out of office with someone covering" is a
// link to G3's create dialog, prefilled with this window. Save runs `planAvailability` and sends the version
// being replaced.
import { useT } from '@bcbp-solutions-fzc-llc/frontend-sdk/react'
import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Availability } from '../../../domain/entities/availability'
import { planAvailability, type AvailabilityFailure } from '../../../domain/rules/me-rules'
import { instantToWallClock, wallClockToInstant, type Instant } from '../../../domain/value-objects/Instant'
import { AVAILABILITY, type Availability as AvailabilityCode } from '../../../domain/vocabulary'
import { APP_ID } from '../../../shared/constants/app'
import ConflictDialog from '../../components/ConflictDialog'
import DateTimeField from '../../components/DateTimeField'
import Field from '../../components/Field'
import UserChip from '../../components/identity/UserChip'
import ProblemDetails from '../../components/ProblemDetails'
import SavedNotice from '../../components/SavedNotice'
import { btnPrimary, card, input } from '../../components/styles'
import { useMeAccess } from '../../features/access/useMeAccess'
import { useSaveAvailability } from '../../features/availability/useAvailability'
import { useUserProfiles } from '../../features/identity/useUserProfiles'
import { useMeServices } from '../../features/services'
import { useOffsetAt } from '../../features/time/zone'
import { useProblemText } from '../../features/useProblemText'

const STATUS_KEYS = { available: 'availability.status.available', busy: 'availability.status.busy', ooo: 'availability.status.ooo' } as const satisfies Record<AvailabilityCode, string>

const FAILURE_KEYS = {
  'invalid-status': 'availability.err.invalidStatus',
  'window-required': 'availability.err.windowRequired',
  'window-inverted': 'errors.windowInverted',
  'window-too-long': 'availability.err.windowTooLong',
  'window-in-past': 'availability.err.windowInPast',
  'note-too-long': 'errors.noteTooLong',
  'no-change': 'availability.err.noChange',
} as const satisfies Record<AvailabilityFailure, string>

type Errors = Partial<Record<'oooFrom' | 'oooUntil' | 'note', string>>

export default function AvailabilityForm({ current, onReload }: { current: Availability; onReload: () => Promise<void> }) {
  const t = useT(APP_ID)
  const id = useId()
  const { clock, problems } = useMeServices()
  const { canWrite } = useMeAccess()
  const offsetAt = useOffsetAt()
  const problemText = useProblemText()
  const save = useSaveAvailability()
  const [status, setStatus] = useState<AvailabilityCode>(current.status)
  const [from, setFrom] = useState(current.oooFrom ? instantToWallClock(current.oooFrom, offsetAt) : '')
  const [until, setUntil] = useState(current.oooUntil ? instantToWallClock(current.oooUntil, offsetAt) : '')
  const [note, setNote] = useState(current.note ?? '')
  const [errors, setErrors] = useState<Errors>({})
  const [failure, setFailure] = useState<unknown>()
  const [saved, setSaved] = useState(false)
  const [conflict, setConflict] = useState(false)
  const covering = useUserProfiles(current.delegateUserId ? [current.delegateUserId] : []).of(current.delegateUserId ?? '')

  const edit = <T,>(set: (v: T) => void) => (v: T) => {
    set(v)
    setSaved(false)
    setErrors({})
    setFailure(undefined)
  }
  const toInstant = (wall: string): Instant | undefined => (wall === '' ? undefined : wallClockToInstant(wall, offsetAt))
  const span = status === 'ooo' ? { from: toInstant(from), until: toInstant(until) } : undefined

  const submit = async () => {
    setErrors({})
    setFailure(undefined)
    setSaved(false)
    const plan = planAvailability({ status, oooFrom: span?.from, oooUntil: span?.until, note }, current, clockInstant())
    if (!plan.ok) {
      const at = plan.at === 'oooFrom' || plan.at === 'oooUntil' || plan.at === 'note' ? plan.at : status === 'ooo' ? 'oooUntil' : 'note'
      // A window text that is not a real date is the same "required" problem at that field.
      return setErrors({ [at]: t(FAILURE_KEYS[plan.failure]) })
    }
    try {
      await save.mutateAsync(plan.value)
      setSaved(true)
    } catch (error) {
      if (problems.isConflict(error)) return setConflict(true)
      setFailure(error)
    }
  }
  const clockInstant = () => new Date(clock.now().getTime()).toISOString() as Instant

  const coverLink = span?.from && span.until ? { pathname: '../delegations', search: `?create=1&from=${encodeURIComponent(span.from)}&until=${encodeURIComponent(span.until)}` } : { pathname: '../delegations', search: '?create=1' }
  return (
    <section aria-labelledby={`${id}-title`} className={`${card} flex flex-col gap-4 p-5`}>
      <h2 id={`${id}-title`} className="text-lg font-semibold">
        {t('availability.title')}
      </h2>
      {current.delegateUserId && (
        <p role="status" className="flex flex-wrap items-center gap-2 rounded-lg border border-aura-border p-3 text-sm">
          <UserChip profile={covering} />
          <span>{t('availability.covering')}</span>
          <Link to="../delegations" relative="path" className="link">
            {t('availability.manageDelegations')}
          </Link>
        </p>
      )}
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <fieldset className="flex flex-col gap-2" disabled={!canWrite}>
          <legend className="mb-1 text-sm font-medium">{t('availability.status')}</legend>
          {AVAILABILITY.map((code) => (
            <label key={code} className="flex items-center gap-2 text-sm">
              <input type="radio" name={`${id}-status`} checked={status === code} onChange={() => edit(setStatus)(code)} />
              {t(STATUS_KEYS[code])}
            </label>
          ))}
        </fieldset>
        {status === 'ooo' && (
          <div className="grid gap-4 md:grid-cols-2">
            <DateTimeField label={t('availability.from')} value={from} onChange={edit(setFrom)} disabled={!canWrite} error={errors.oooFrom} />
            <DateTimeField label={t('availability.until')} value={until} onChange={edit(setUntil)} disabled={!canWrite} error={errors.oooUntil} />
          </div>
        )}
        <Field label={t('availability.note')} hint={t('availability.noteHint')} error={errors.note}>
          {(ids) => <textarea {...ids} className={input} rows={3} value={note} disabled={!canWrite} onChange={(e) => edit(setNote)(e.target.value)} />}
        </Field>
        {status === 'ooo' && canWrite && (
          <p className="text-sm">
            <Link to={coverLink} relative="path" className="link">
              {t('availability.askCover')}
            </Link>
          </p>
        )}
        {failure !== undefined && (
          <div role="alert" className="flex flex-wrap items-center gap-2 text-status-error">
            <span>{problemText(failure)}</span>
            <ProblemDetails error={failure} />
          </div>
        )}
        <div className="flex items-center gap-3">
          <button type="submit" className={btnPrimary} disabled={!canWrite || save.isPending}>
            {save.isPending ? t('common.working') : t('common.save')}
          </button>
          <SavedNotice show={saved} />
        </div>
      </form>
      {conflict && (
        <ConflictDialog
          onReload={() => {
            setConflict(false)
            void onReload()
          }}
          onClose={() => setConflict(false)}
        />
      )}
    </section>
  )
}

// The fields a new delegation and a reassignment share: who covers, for what, when, and a note. The dates
// are wall-clock text in my profile's zone; `toInputs` turns them into instants for the planning rules
// (IAM-UX-14). Nothing here decides what is allowed: the rules do, and the service checks again.
import { useT } from '@bcbp-solutions-fzc-llc/frontend-sdk/react'
import type { DelegationPolicy } from '../../../domain/entities/delegation'
import { instantToWallClock, wallClockToInstant, type Instant, type OffsetAt } from '../../../domain/value-objects/Instant'
import { APP_ID } from '../../../shared/constants/app'
import DateTimeField from '../../components/DateTimeField'
import Field from '../../components/Field'
import MemberPicker from '../../components/identity/MemberPicker'
import { input } from '../../components/styles'
import ScopeField from './ScopeField'

export interface DelegationFormState {
  readonly delegateId: string
  readonly scope: 'all' | 'department'
  readonly scopeId: string
  readonly startsNow: boolean
  readonly startWall: string
  readonly openEnded: boolean
  readonly endWall: string
  readonly note: string
}

export const emptyForm: DelegationFormState = { delegateId: '', scope: 'all', scopeId: '', startsNow: true, startWall: '', openEnded: true, endWall: '', note: '' }

/** A form seeded with a window (from G2's "someone is covering" link): it starts and ends at those instants. */
export function formWithWindow(from: Instant | undefined, until: Instant | undefined, offsetAt: OffsetAt): DelegationFormState {
  return {
    ...emptyForm,
    ...(from ? { startsNow: false, startWall: instantToWallClock(from, offsetAt) } : {}),
    ...(until ? { openEnded: false, endWall: instantToWallClock(until, offsetAt) } : {}),
  }
}

export interface FormInputs {
  readonly delegateId: string
  readonly scope: string
  readonly scopeId: string
  readonly startsAt: Instant | undefined
  readonly endsAt: Instant | undefined
  readonly note: string
  /** The date field whose text is not a real date and time. */
  readonly badDate: 'startsAt' | 'endsAt' | undefined
}

export function toInputs(s: DelegationFormState, offsetAt: OffsetAt): FormInputs {
  const startsAt = s.startsNow ? undefined : wallClockToInstant(s.startWall, offsetAt)
  const endsAt = s.openEnded ? undefined : wallClockToInstant(s.endWall, offsetAt)
  const badDate = !s.startsNow && startsAt === undefined ? 'startsAt' : !s.openEnded && endsAt === undefined ? 'endsAt' : undefined
  return { delegateId: s.delegateId, scope: s.scope, scopeId: s.scopeId, startsAt, endsAt, note: s.note, badDate }
}

export type FormErrors = Partial<Record<'delegateId' | 'scope' | 'scopeId' | 'startsAt' | 'endsAt' | 'note', string>>

export default function DelegationForm({
  state,
  onChange,
  errors,
  policy,
  me,
  mode,
  endLocked = false,
  disabled,
}: {
  state: DelegationFormState
  onChange: (patch: Partial<DelegationFormState>) => void
  errors: FormErrors
  policy: DelegationPolicy | undefined
  me: string | undefined
  mode: 'create' | 'reassign'
  /** A delegation with a fixed end cannot be made open-ended by a reassignment (LLD §15 #6). */
  endLocked?: boolean
  disabled: boolean
}) {
  const t = useT(APP_ID)
  return (
    <div className="flex flex-col gap-4">
      <MemberPicker label={t('delegations.delegate')} value={state.delegateId} onChange={(delegateId) => onChange({ delegateId })} {...(me ? { excludeUserId: me } : {})} disabled={disabled} error={errors.delegateId} />
      <ScopeField value={{ scope: state.scope, scopeId: state.scopeId }} onChange={(v) => onChange(v)} disabled={disabled} error={errors.scope ?? errors.scopeId} />
      {mode === 'create' && (
        <fieldset className="flex flex-col gap-2" disabled={disabled}>
          <legend className="mb-1 text-sm font-medium">{t('delegations.starts')}</legend>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={state.startsNow} onChange={(e) => onChange({ startsNow: e.target.checked })} />
            {t('delegations.startsNow')}
          </label>
          {!state.startsNow && <DateTimeField label={t('delegations.startsAt')} value={state.startWall} onChange={(startWall) => onChange({ startWall })} error={errors.startsAt} />}
        </fieldset>
      )}
      <fieldset className="flex flex-col gap-2" disabled={disabled}>
        <legend className="mb-1 text-sm font-medium">{t('delegations.ends')}</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={state.openEnded} disabled={endLocked} onChange={(e) => onChange({ openEnded: e.target.checked })} />
          {t('delegations.openEnded', { days: policy?.reviewWindowDays ?? 90 })}
        </label>
        {!state.openEnded && <DateTimeField label={t('delegations.endsAt')} value={state.endWall} onChange={(endWall) => onChange({ endWall })} error={errors.endsAt} />}
        {policy && <p className="text-xs text-aura-muted">{t('delegations.maxDuration', { days: policy.maxDurationDays })}</p>}
        {endLocked && <p className="text-xs text-aura-muted">{t('delegations.endLocked')}</p>}
      </fieldset>
      <Field label={mode === 'create' ? t('delegations.note') : t('delegations.reason')} error={errors.note}>
        {(ids) => <textarea {...ids} className={input} rows={3} value={state.note} disabled={disabled} onChange={(e) => onChange({ note: e.target.value })} />}
      </Field>
    </div>
  )
}

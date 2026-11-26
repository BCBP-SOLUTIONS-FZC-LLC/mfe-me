// Hand a delegation to someone else, or change what it covers or when it ends (DLG-5). The fields are the
// delegation's own, prefilled; only changes are sent, with an optional reason. DLG-5 ends the current delegation
// first and then creates the new one, and does not bring the old one back if the new one fails: the dialog says
// so, and after a failure the list is read again so the user sees what is true (LLD §7.5).
import { useT } from '@bcbp-solutions-fzc-llc/frontend-sdk/react'
import { useState } from 'react'
import type { Delegation } from '../../../domain/entities/delegation'
import { planReassign, type ReassignFailure, type DelegationFailure } from '../../../domain/rules/me-rules'
import { instantToWallClock } from '../../../domain/value-objects/Instant'
import { APP_ID } from '../../../shared/constants/app'
import ConflictDialog from '../../components/ConflictDialog'
import Dialog from '../../components/Dialog'
import ProblemDetails from '../../components/ProblemDetails'
import { btnOutline, btnPrimary } from '../../components/styles'
import { REASSIGN_FAILURE_KEYS } from '../../features/delegations/messages'
import { useDelegationContext, useDelegationPolicy, useReassignDelegation, useRefreshDelegations } from '../../features/delegations/useDelegations'
import { useSelf } from '../../features/self/useSelf'
import { useMeServices } from '../../features/services'
import { useOffsetAt } from '../../features/time/zone'
import { useProblemText } from '../../features/useProblemText'
import DelegationForm, { toInputs, type DelegationFormState, type FormErrors } from './DelegationForm'

const FIELD_OF: Record<ReassignFailure | DelegationFailure, keyof FormErrors | undefined> = {
  'delegate-required': 'delegateId',
  'self-delegation': 'delegateId',
  'scope-invalid': 'scope',
  'scope-id-required': 'scopeId',
  'scope-not-mine': 'scopeId',
  'start-in-past': 'startsAt',
  'window-inverted': 'endsAt',
  'window-too-long': 'endsAt',
  'note-too-long': 'note',
  'reason-too-long': 'note',
  'no-change': undefined,
}

export default function ReassignDialog({ delegation, onClose }: { delegation: Delegation; onClose: () => void }) {
  const t = useT(APP_ID)
  const { problems } = useMeServices()
  const { userId } = useSelf()
  const policy = useDelegationPolicy().data
  const { context } = useDelegationContext()
  const offsetAt = useOffsetAt()
  const problemText = useProblemText()
  const reassign = useReassignDelegation()
  const refresh = useRefreshDelegations()
  const fixedEnd = delegation.endsAt !== undefined
  // The end shown to the user has no seconds, while the service's may (23:59:59): an end the user did not touch is
  // "unchanged", not "a second earlier", so it is left out of the request.
  const [initialEndWall] = useState(() => (delegation.endsAt ? instantToWallClock(delegation.endsAt, offsetAt) : ''))
  const [state, setState] = useState<DelegationFormState>(() => ({
    delegateId: delegation.delegateId,
    scope: delegation.scope === 'department' ? 'department' : 'all',
    scopeId: delegation.scopeId ?? '',
    startsNow: true,
    startWall: '',
    openEnded: !fixedEnd,
    endWall: initialEndWall,
    note: '',
  }))
  const [errors, setErrors] = useState<FormErrors>({})
  const [failure, setFailure] = useState<unknown>()
  const [noChange, setNoChange] = useState(false)
  const [conflict, setConflict] = useState(false)

  const change = (patch: Partial<DelegationFormState>) => {
    setState((s) => ({ ...s, ...patch }))
    setErrors({})
    setFailure(undefined)
    setNoChange(false)
  }

  const submit = async () => {
    setErrors({})
    setFailure(undefined)
    setNoChange(false)
    const ctx = context()
    if (!ctx) return
    const inputs = toInputs(state, offsetAt)
    if (inputs.badDate) return setErrors({ [inputs.badDate]: t('delegations.err.dateInvalid') })
    const endTouched = !state.openEnded && state.endWall !== initialEndWall
    const plan = planReassign({ delegateId: inputs.delegateId, scope: inputs.scope, scopeId: inputs.scopeId, endsAt: endTouched ? inputs.endsAt : undefined, reason: inputs.note }, delegation, ctx)
    if (!plan.ok) {
      const field = FIELD_OF[plan.failure]
      return field ? setErrors({ [field]: t(REASSIGN_FAILURE_KEYS[plan.failure]) }) : setNoChange(true)
    }
    try {
      await reassign.mutateAsync({ id: delegation.delegationId, request: plan.value })
      onClose()
    } catch (error) {
      // The current delegation may already have ended: read the list again so the user sees the truth.
      refresh()
      if (problems.isConflict(error)) return setConflict(true)
      setFailure(error)
    }
  }

  if (conflict) return <ConflictDialog onReload={() => (refresh(), onClose())} onClose={onClose} />
  return (
    <Dialog title={t('delegations.reassignTitle')} subtitle={t('delegations.reassignHint')} onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <DelegationForm state={state} onChange={change} errors={errors} policy={policy} me={userId} mode="reassign" endLocked={fixedEnd} disabled={reassign.isPending} />
        {noChange && <p role="alert" className="text-sm text-status-error">{t(REASSIGN_FAILURE_KEYS['no-change'])}</p>}
        {failure !== undefined && (
          <div role="alert" className="flex flex-col gap-1 text-status-error">
            <span>{problemText(failure)}</span>
            <span className="text-sm">{t('delegations.reassignFailed')}</span>
            <ProblemDetails error={failure} />
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className={btnOutline} onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" className={btnPrimary} disabled={reassign.isPending || !policy}>
            {reassign.isPending ? t('common.working') : t('delegations.reassignSubmit')}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

// Delegate my work (DLG-2). The Idempotency-Key is made when Submit is first pressed and kept for every retry
// of that submission, so a repeat returns the original 201; it is made again only after the user changes a
// field. `409 IDEMPOTENCY_KEY_IN_FLIGHT` is "still saving": the list is read once more after 2 s and the
// request is never resent with a new key. A 503 changed nothing, and Submit may be pressed again (the key makes
// that safe). The delegate is flagged when out of office: they cannot cover (LLD §7.5).
import { useT } from '@bcbp-solutions-fzc-llc/frontend-sdk/react'
import { isProblemError } from '@bcbp-solutions-fzc-llc/frontend-sdk/problem'
import { useEffect, useRef, useState } from 'react'
import { planDelegation, type DelegationFailure } from '../../../domain/rules/me-rules'
import { APP_ID } from '../../../shared/constants/app'
import Dialog from '../../components/Dialog'
import ProblemDetails from '../../components/ProblemDetails'
import { btnOutline, btnPrimary } from '../../components/styles'
import { DELEGATION_FAILURE_KEYS } from '../../features/delegations/messages'
import { useCreateDelegation, useDelegationContext, useDelegationPolicy, useRefreshDelegations } from '../../features/delegations/useDelegations'
import { useUserProfiles } from '../../features/identity/useUserProfiles'
import { useSelf } from '../../features/self/useSelf'
import { useMeServices } from '../../features/services'
import { useOffsetAt } from '../../features/time/zone'
import { useProblemText } from '../../features/useProblemText'
import DelegationForm, { emptyForm, toInputs, type DelegationFormState, type FormErrors } from './DelegationForm'

/** How long to wait before reading the list again after "still saving". */
export const IN_FLIGHT_RECHECK_MS = 2000

const FIELD_OF: Record<DelegationFailure, keyof FormErrors> = {
  'delegate-required': 'delegateId',
  'self-delegation': 'delegateId',
  'scope-invalid': 'scope',
  'scope-id-required': 'scopeId',
  'scope-not-mine': 'scopeId',
  'start-in-past': 'startsAt',
  'window-inverted': 'endsAt',
  'window-too-long': 'endsAt',
  'note-too-long': 'note',
}

export default function CreateDelegationDialog({ initial, onClose }: { initial?: DelegationFormState; onClose: () => void }) {
  const t = useT(APP_ID)
  const { ids } = useMeServices()
  const { userId } = useSelf()
  const policy = useDelegationPolicy().data
  const { context } = useDelegationContext()
  const offsetAt = useOffsetAt()
  const problemText = useProblemText()
  const create = useCreateDelegation()
  const refresh = useRefreshDelegations()
  const { problems } = useMeServices()
  const [state, setState] = useState<DelegationFormState>(initial ?? emptyForm)
  const [errors, setErrors] = useState<FormErrors>({})
  const [failure, setFailure] = useState<unknown>()
  const [inFlight, setInFlight] = useState(false)
  const key = useRef<string | undefined>(undefined)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  const delegate = useUserProfiles(state.delegateId ? [state.delegateId] : []).of(state.delegateId)
  const away = delegate?.state === 'found' && delegate.user.availability === 'ooo'

  const change = (patch: Partial<DelegationFormState>) => {
    // A changed draft is a different request: it gets its own key at the next Submit.
    key.current = undefined
    setState((s) => ({ ...s, ...patch }))
    setErrors({})
    setFailure(undefined)
    setInFlight(false)
  }

  const submit = async () => {
    setErrors({})
    setFailure(undefined)
    const ctx = context()
    if (!ctx) return
    const inputs = toInputs(state, offsetAt)
    if (inputs.badDate) return setErrors({ [inputs.badDate]: t('delegations.err.dateInvalid') })
    const plan = planDelegation(inputs, ctx)
    if (!plan.ok) return setErrors({ [FIELD_OF[plan.failure]]: t(DELEGATION_FAILURE_KEYS[plan.failure]) })
    key.current ??= ids.next()
    try {
      await create.mutateAsync({ request: plan.value, key: key.current })
      onClose()
    } catch (error) {
      if (isProblemError(error) && error.errorCode?.toUpperCase() === 'IDEMPOTENCY_KEY_IN_FLIGHT') {
        setInFlight(true)
        timer.current = setTimeout(refresh, IN_FLIGHT_RECHECK_MS)
        return
      }
      setFailure(error)
    }
  }

  return (
    <Dialog title={t('delegations.createTitle')} subtitle={t('delegations.createHint')} onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <DelegationForm state={state} onChange={change} errors={errors} policy={policy} me={userId} mode="create" disabled={create.isPending} />
        {away && <p role="alert" className="text-sm text-status-warning">{t('delegations.delegateAway')}</p>}
        {inFlight && <p role="status" className="text-sm">{t('errors.stillSaving')}</p>}
        {failure !== undefined && !problems.isConflict(failure) && (
          <div role="alert" className="flex flex-wrap items-center gap-2 text-status-error">
            <span>{problemText(failure)}</span>
            <ProblemDetails error={failure} />
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className={btnOutline} onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" className={btnPrimary} disabled={create.isPending || away || !policy}>
            {create.isPending ? t('common.working') : t('delegations.submit')}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

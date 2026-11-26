// Extend an open-ended delegation's review by whole days, 1 to 180 (DLG-4). Only delegations with no end are
// reviewed, so the action is hidden for a fixed end. A lost race (409) is the conflict dialog.
import { useT } from '@bcbp-solutions-fzc-llc/frontend-sdk/react'
import { useState } from 'react'
import type { Delegation } from '../../../domain/entities/delegation'
import { planExtend } from '../../../domain/rules/me-rules'
import { APP_ID } from '../../../shared/constants/app'
import ConflictDialog from '../../components/ConflictDialog'
import Dialog from '../../components/Dialog'
import Field from '../../components/Field'
import ProblemDetails from '../../components/ProblemDetails'
import { btnOutline, btnPrimary, input } from '../../components/styles'
import { EXTEND_FAILURE_KEYS } from '../../features/delegations/messages'
import { useExtendDelegation } from '../../features/delegations/useDelegations'
import { useMeServices } from '../../features/services'
import { useProblemText } from '../../features/useProblemText'

export default function ExtendDialog({ delegation, onClose, onReload }: { delegation: Delegation; onClose: () => void; onReload: () => void }) {
  const t = useT(APP_ID)
  const { problems } = useMeServices()
  const problemText = useProblemText()
  const extend = useExtendDelegation()
  const [days, setDays] = useState('30')
  const [error, setError] = useState<string>()
  const [failure, setFailure] = useState<unknown>()
  const [conflict, setConflict] = useState(false)

  const submit = async () => {
    setError(undefined)
    setFailure(undefined)
    const plan = planExtend(delegation, days.trim() === '' ? Number.NaN : Number(days))
    if (!plan.ok) return setError(t(EXTEND_FAILURE_KEYS[plan.failure]))
    try {
      await extend.mutateAsync({ id: delegation.delegationId, request: plan.value })
      onClose()
    } catch (e) {
      if (problems.isConflict(e)) return setConflict(true)
      setFailure(e)
    }
  }

  if (conflict) return <ConflictDialog onReload={onReload} onClose={onClose} />
  return (
    <Dialog title={t('delegations.extendTitle')} subtitle={t('delegations.extendHint')} onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <Field label={t('delegations.extendDays')} error={error}>
          {(ids) => <input {...ids} className={input} type="number" inputMode="numeric" min={1} max={180} value={days} onChange={(e) => setDays(e.target.value)} />}
        </Field>
        {failure !== undefined && (
          <div role="alert" className="flex flex-wrap items-center gap-2 text-status-error">
            <span>{problemText(failure)}</span>
            <ProblemDetails error={failure} />
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className={btnOutline} onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" className={btnPrimary} disabled={extend.isPending}>
            {extend.isPending ? t('common.working') : t('delegations.extendSubmit')}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

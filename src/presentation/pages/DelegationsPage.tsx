// G3 Delegations: who is covering my work, and the changes I can make (create, extend, reassign, cancel).
// "Delegate my work" may open prefilled from G2 (`?create=1&from=…&until=…`). Everything here is about me as
// delegator; delegations to me and admin views are not in this release (LLD §1 signoff, IAM-FE-Q9).
import { useT } from '@bcbp-solutions-fzc-llc/frontend-sdk/react'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { Delegation } from '../../domain/entities/delegation'
import { parseInstant } from '../../domain/value-objects/Instant'
import { APP_ID } from '../../shared/constants/app'
import ConfirmDialog from '../components/ConfirmDialog'
import ConflictDialog from '../components/ConflictDialog'
import LoadFailed from '../components/LoadFailed'
import ReadOnlyNotice from '../components/ReadOnlyNotice'
import { btnPrimary } from '../components/styles'
import { useMeAccess } from '../features/access/useMeAccess'
import { useMyProfile } from '../features/profile/useMyProfile'
import { useCancelDelegation, useDelegationContext, useDelegationList } from '../features/delegations/useDelegations'
import { useMeServices } from '../features/services'
import { useOffsetAt } from '../features/time/zone'
import CreateDelegationDialog from './delegations/CreateDelegationDialog'
import { formWithWindow } from './delegations/DelegationForm'
import DelegationList from './delegations/DelegationList'
import ExtendDialog from './delegations/ExtendDialog'
import ReassignDialog from './delegations/ReassignDialog'

type Open = { kind: 'create' } | { kind: 'extend' | 'reassign' | 'cancel'; delegation: Delegation } | undefined

export default function DelegationsPage() {
  const t = useT(APP_ID)
  const { canWrite } = useMeAccess()
  const { problems } = useMeServices()
  const list = useDelegationList()
  const { now } = useDelegationContext()
  const offsetAt = useOffsetAt()
  // The prefilled window is wall-clock text in my zone, so wait for the profile (its zone) before opening on it.
  const profileLoading = useMyProfile().loading
  const cancel = useCancelDelegation()
  const [params, setParams] = useSearchParams()
  const [open, setOpen] = useState<Open>(() => (params.get('create') ? { kind: 'create' } : undefined))
  const [conflict, setConflict] = useState(false)
  const [cancelError, setCancelError] = useState<unknown>()

  // Opened from G2: the out-of-office window arrives as instants in the query string.
  const prefill = params.get('create') ? formWithWindow(parseInstant(params.get('from')), parseInstant(params.get('until')), offsetAt) : undefined
  const close = () => {
    setOpen(undefined)
    setCancelError(undefined)
    if (params.get('create')) setParams({}, { replace: true })
  }
  const reload = () => {
    setConflict(false)
    close()
    void list.refetch()
  }

  const confirmCancel = async (d: Delegation) => {
    setCancelError(undefined)
    try {
      await cancel.mutateAsync({ id: d.delegationId, recordVersion: d.recordVersion })
      close()
    } catch (error) {
      if (problems.isConflict(error)) return setConflict(true)
      setCancelError(error)
    }
  }

  return (
    <section className="flex flex-col gap-4" aria-busy={list.isPending || undefined}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">{t('nav.delegations')}</h1>
        <button type="button" className={btnPrimary} disabled={!canWrite} onClick={() => setOpen({ kind: 'create' })}>
          {t('delegations.create')}
        </button>
      </div>
      <ReadOnlyNotice />
      <p className="text-sm text-aura-muted">{t('delegations.intro')}</p>
      {list.isError && <LoadFailed message={t('delegations.failed')} error={list.error} onRetry={() => void list.refetch()} />}
      {list.isPending && <p>{t('common.loading')}</p>}
      {list.data && (
        <DelegationList
          delegations={list.data}
          now={now()}
          actions={{
            canWrite,
            onExtend: (delegation) => setOpen({ kind: 'extend', delegation }),
            onReassign: (delegation) => setOpen({ kind: 'reassign', delegation }),
            onCancel: (delegation) => setOpen({ kind: 'cancel', delegation }),
          }}
        />
      )}
      {open?.kind === 'create' && !(prefill && profileLoading) && <CreateDelegationDialog {...(prefill ? { initial: prefill } : {})} onClose={close} />}
      {open?.kind === 'extend' && <ExtendDialog delegation={open.delegation} onClose={close} onReload={reload} />}
      {open?.kind === 'reassign' && <ReassignDialog delegation={open.delegation} onClose={close} />}
      {open?.kind === 'cancel' && !conflict && (
        <ConfirmDialog
          title={t('delegations.cancelTitle')}
          confirmLabel={t('delegations.cancelConfirm')}
          danger
          busy={cancel.isPending}
          error={cancelError}
          onConfirm={() => void confirmCancel(open.delegation)}
          onCancel={close}
        >
          <p>{t('delegations.cancelBody')}</p>
        </ConfirmDialog>
      )}
      {conflict && <ConflictDialog onReload={reload} onClose={reload} />}
    </section>
  )
}

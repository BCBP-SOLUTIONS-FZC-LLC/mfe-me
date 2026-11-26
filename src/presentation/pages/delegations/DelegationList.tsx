// My active delegations as delegator (DLG-1): who covers, for what, from when to when, and the review date of
// an open-ended one. A delegation whose review is due within three days (or overdue) carries a banner: the
// service warns at 3, 2 and 1 days and ends it as `review_expired` if nobody answers (LLD §7.5). There is no
// history and no ended reason: DLG-1 returns active delegations only (LLD §15 #5).
import { useT } from '@bcbp-solutions-fzc-llc/frontend-sdk/react'
import type { Delegation } from '../../../domain/entities/delegation'
import { delegationLabel, isOpenEnded, reviewState } from '../../../domain/rules/me-rules'
import type { Instant } from '../../../domain/value-objects/Instant'
import { APP_ID } from '../../../shared/constants/app'
import DepartmentLabel from '../../components/identity/DepartmentLabel'
import UserChip from '../../components/identity/UserChip'
import { btnOutline, card, table, tableWrap, td, th, tr } from '../../components/styles'
import { useDepartmentDirectory } from '../../features/identity/useDepartmentDirectory'
import { useUserProfiles } from '../../features/identity/useUserProfiles'
import { useFormatDay, useFormatInstant } from '../../features/time/zone'

export interface RowActions {
  readonly canWrite: boolean
  readonly onExtend: (d: Delegation) => void
  readonly onReassign: (d: Delegation) => void
  readonly onCancel: (d: Delegation) => void
}

export default function DelegationList({ delegations, now, actions }: { delegations: readonly Delegation[]; now: Instant; actions: RowActions }) {
  const t = useT(APP_ID)
  const directory = useDepartmentDirectory()
  const profiles = useUserProfiles(delegations.map((d) => d.delegateId))
  const formatTime = useFormatInstant()
  const formatDay = useFormatDay()
  if (delegations.length === 0) {
    return (
      <p role="status" className={`${card} p-6 text-center text-aura-muted`}>
        {t('delegations.empty')}
      </p>
    )
  }
  return (
    <div className={tableWrap}>
      <table className={table}>
        <caption className="sr-only">{t('delegations.caption')}</caption>
        <thead>
          <tr>
            <th scope="col" className={th}>{t('delegations.col.delegate')}</th>
            <th scope="col" className={th}>{t('delegations.col.scope')}</th>
            <th scope="col" className={th}>{t('delegations.col.starts')}</th>
            <th scope="col" className={th}>{t('delegations.col.ends')}</th>
            <th scope="col" className={th}>{t('delegations.col.status')}</th>
            <th scope="col" className={th}>{t('delegations.col.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {delegations.map((d) => {
            const target = delegationLabel(d)
            const review = reviewState(d, now)
            return (
              <tr key={d.delegationId} className={tr}>
                <td className={td}>
                  <UserChip profile={profiles.of(d.delegateId)} showAvailability />
                </td>
                <td className={td}>
                  {target.kind === 'department' && target.departmentId ? (
                    <DepartmentLabel departmentId={target.departmentId} directory={directory} />
                  ) : target.kind === 'all' ? (
                    t('delegations.scopeAllShort')
                  ) : (
                    t('delegations.scopeOther')
                  )}
                </td>
                <td className={td}>{d.startsAt ? formatTime(d.startsAt) : '—'}</td>
                <td className={td}>
                  {isOpenEnded(d) ? t('delegations.openEndedReview', { date: formatDay(d.reviewDueAt) }) : formatTime(d.endsAt)}
                  {review !== 'none' && (
                    <p role="status" className="mt-1 text-xs text-status-warning">
                      {review === 'overdue' ? t('delegations.reviewOverdue') : t('delegations.reviewDue', { date: formatDay(d.reviewDueAt) })}
                    </p>
                  )}
                </td>
                <td className={td}>
                  <span className="badge badge-outline">{t(d.status === 'scheduled' ? 'delegations.status.scheduled' : 'delegations.status.active')}</span>
                </td>
                <td className={td}>
                  <div className="flex flex-wrap gap-2">
                    {isOpenEnded(d) && (
                      <button type="button" className={btnOutline} disabled={!actions.canWrite} onClick={() => actions.onExtend(d)}>
                        {t('delegations.extend')}
                      </button>
                    )}
                    <button type="button" className={btnOutline} disabled={!actions.canWrite} onClick={() => actions.onReassign(d)}>
                      {t('delegations.reassign')}
                    </button>
                    <button type="button" className={btnOutline} disabled={!actions.canWrite} onClick={() => actions.onCancel(d)}>
                      {t('delegations.cancel')}
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

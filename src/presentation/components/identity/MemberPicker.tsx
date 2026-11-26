// Picks one active member of the workspace as a delegate. There is no server-side name search (IAM-FE-Q5),
// so it lists the member pages loaded so far with names from User Profile, filters them by what is typed,
// and offers "Load more" for the rest. Someone out of office is flagged: they cannot cover (DELEGATE_UNAVAILABLE).
// Replaced by the shared identity package's picker (ADR 0003).
import { useT } from '@bcbp-solutions-fzc-llc/frontend-sdk/react'
import { useId, useMemo, useState } from 'react'
import { APP_ID } from '../../../shared/constants/app'
import { useUserProfiles } from '../../features/identity/useUserProfiles'
import { useMemberList } from '../../features/members/useMemberList'
import { btnOutline, input } from '../styles'

export default function MemberPicker({ label, value, onChange, excludeUserId, disabled = false, error }: { label: string; value: string; onChange: (userId: string) => void; excludeUserId?: string; disabled?: boolean; error?: string }) {
  const t = useT(APP_ID)
  const id = useId()
  const [filter, setFilter] = useState('')
  const list = useMemberList()
  const active = useMemo(() => (list.data?.pages.flatMap((p) => p.members) ?? []).filter((m) => m.status === 'active' && m.userId !== excludeUserId), [list.data, excludeUserId])
  const profiles = useUserProfiles(useMemo(() => active.map((m) => m.userId), [active]))
  const rows = active.map((m) => {
    const p = profiles.of(m.userId)
    const found = p?.state === 'found' ? p.user : undefined
    const name = found ? found.displayName : p === undefined ? t('common.loading') : p.state === 'missing' ? t('identity.unknownUser') : t('identity.nameUnavailable')
    const away = found?.availability === 'ooo'
    return { userId: m.userId, text: away ? t('picker.awayOption', { name }) : name, name, away }
  })
  const needle = filter.trim().toLowerCase()
  const shown = needle ? rows.filter((r) => r.name.toLowerCase().includes(needle) || r.userId === value) : rows
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={`${id}-filter`} className="text-sm font-medium text-aura-text">
        {label}
      </label>
      <input id={`${id}-filter`} className={input} type="search" placeholder={t('picker.filter')} value={filter} disabled={disabled} onChange={(e) => setFilter(e.target.value)} aria-label={t('picker.filterLabel')} />
      <select id={id} aria-label={label} className={input} value={value} disabled={disabled} aria-invalid={error ? true : undefined} onChange={(e) => onChange(e.target.value)}>
        <option value="">{list.isPending ? t('common.loading') : t('picker.empty')}</option>
        {shown.map((r) => (
          <option key={r.userId} value={r.userId}>
            {r.text}
          </option>
        ))}
      </select>
      {list.isError && <p role="alert" className="text-sm text-status-error">{t('picker.failed')}</p>}
      {error && <p role="alert" className="text-sm text-status-error">{error}</p>}
      {list.hasNextPage && (
        <button type="button" className={`${btnOutline} self-start`} disabled={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
          {t('picker.loadMore')}
        </button>
      )}
    </div>
  )
}

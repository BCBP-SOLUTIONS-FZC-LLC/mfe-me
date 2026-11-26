// What a delegation covers: all my work, or one of my departments (named from P-3). "One tender" is not
// offered this release (LLD §15 #7). The departments are the ones P-35 says I am in.
import { useSessionContext, useT } from '@bcbp-solutions-fzc-llc/frontend-sdk/react'
import { useId } from 'react'
import { APP_ID } from '../../../shared/constants/app'
import { input } from '../../components/styles'
import { useDepartmentDirectory } from '../../features/identity/useDepartmentDirectory'

export interface ScopeValue {
  readonly scope: 'all' | 'department'
  readonly scopeId: string
}

export default function ScopeField({ value, onChange, disabled, error }: { value: ScopeValue; onChange: (v: ScopeValue) => void; disabled: boolean; error?: string | undefined }) {
  const t = useT(APP_ID)
  const id = useId()
  const directory = useDepartmentDirectory()
  const mine = useSessionContext()?.departments ?? []
  return (
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend className="mb-1 text-sm font-medium">{t('delegations.scope')}</legend>
      <label className="flex items-center gap-2 text-sm">
        <input type="radio" name={`${id}-scope`} checked={value.scope === 'all'} onChange={() => onChange({ scope: 'all', scopeId: '' })} />
        {t('delegations.scopeAll')}
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="radio" name={`${id}-scope`} checked={value.scope === 'department'} onChange={() => onChange({ scope: 'department', scopeId: value.scopeId || (mine[0]?.id ?? '') })} />
        {t('delegations.scopeDepartment')}
      </label>
      {value.scope === 'department' && (
        <select aria-label={t('delegations.scopeDepartmentPick')} className={input} value={value.scopeId} aria-invalid={error ? true : undefined} onChange={(e) => onChange({ scope: 'department', scopeId: e.target.value })}>
          <option value="">{t('delegations.scopeDepartmentEmpty')}</option>
          {mine.map((d) => (
            <option key={d.id} value={d.id}>
              {directory.nameOf(d.id) ?? t('identity.department')}
            </option>
          ))}
        </select>
      )}
      {error && <p role="alert" className="text-sm text-status-error">{error}</p>}
    </fieldset>
  )
}


// Professional credentials as rows of name and value (User Profile types both as strings): add, edit and
// remove, with each row's message. The rules (`planProfileEdit`) decide what may be saved; a stored value
// above a limit is shown, not cut. Removing a row sends its key as `delete_credentials`.
import { useT } from '@bcbp-solutions-fzc-llc/frontend-sdk/react'
import { useId } from 'react'
import type { CredentialRow } from '../../../domain/rules/me-rules'
import { LIMITS } from '../../../domain/rules/me-rules'
import { APP_ID } from '../../../shared/constants/app'
import { btnOutline, input } from '../../components/styles'

export default function CredentialsEditor({ rows, onChange, errors, disabled }: { rows: readonly CredentialRow[]; onChange: (rows: CredentialRow[]) => void; errors: Readonly<Record<number, string>>; disabled: boolean }) {
  const t = useT(APP_ID)
  const id = useId()
  const set = (index: number, patch: Partial<CredentialRow>) => onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  return (
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend className="mb-1 flex w-full items-center justify-between text-sm font-medium">
        <span>{t('profile.credentials')}</span>
        <span className="text-aura-muted" aria-live="polite">
          {t('list.counter', { count: rows.length, max: LIMITS.credentialKeys })}
        </span>
      </legend>
      <p className="text-xs text-aura-muted">{t('profile.credentialsHint')}</p>
      {rows.map((row, index) => {
        const message = errors[index]
        const errorId = `${id}-${index}-error`
        return (
          <div key={`${id}-${index}`} className="flex flex-col gap-1">
            <div className="flex items-start gap-2">
              <input aria-label={t('profile.credentialName', { number: index + 1 })} aria-invalid={message ? true : undefined} aria-describedby={message ? errorId : undefined} className={input} value={row.key} onChange={(e) => set(index, { key: e.target.value })} />
              <input aria-label={t('profile.credentialValue', { number: index + 1 })} aria-invalid={message ? true : undefined} aria-describedby={message ? errorId : undefined} className={input} value={row.value} onChange={(e) => set(index, { value: e.target.value })} />
              <button type="button" className={btnOutline} onClick={() => onChange(rows.filter((_, i) => i !== index))}>
                {t('profile.credentialRemove', { number: index + 1 })}
              </button>
            </div>
            {message && (
              <p id={errorId} role="alert" className="text-sm text-status-error">
                {message}
              </p>
            )}
          </div>
        )
      })}
      <div>
        <button type="button" className={btnOutline} disabled={rows.length >= LIMITS.credentialKeys} onClick={() => onChange([...rows, { key: '', value: '' }])}>
          {t('profile.credentialAdd')}
        </button>
      </div>
    </fieldset>
  )
}

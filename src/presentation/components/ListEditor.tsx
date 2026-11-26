// A bounded list of short texts (AI templates and context snippets, G4): add, edit and remove rows,
// with a counter and each row's length limit. It only edits the list; the rules (`planAiPreferences`)
// decide what may be saved, and a stored value above the limit is shown, not cut.
import { useT } from '@bcbp-solutions-fzc-llc/frontend-sdk/react'
import { useId } from 'react'
import { APP_ID } from '../../shared/constants/app'
import { btnOutline, input } from './styles'

export default function ListEditor({
  label,
  items,
  onChange,
  maxItems,
  maxLength,
  disabled = false,
  multiline = false,
}: {
  label: string
  items: readonly string[]
  onChange: (items: string[]) => void
  maxItems: number
  maxLength: number
  disabled?: boolean
  multiline?: boolean
}) {
  const t = useT(APP_ID)
  const id = useId()
  const set = (index: number, value: string) => onChange(items.map((item, i) => (i === index ? value : item)))
  return (
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend className="mb-1 flex w-full items-center justify-between text-sm font-medium">
        <span>{label}</span>
        <span className="text-aura-muted" aria-live="polite">
          {t('list.counter', { count: items.length, max: maxItems })}
        </span>
      </legend>
      {items.map((item, index) => {
        const rowId = `${id}-${index}`
        const rowLabel = t('list.item', { label, number: index + 1 })
        const over = item.length > maxLength
        return (
          <div key={rowId} className="flex items-start gap-2">
            {multiline ? (
              <textarea id={rowId} aria-label={rowLabel} aria-invalid={over || undefined} className={input} rows={3} value={item} onChange={(e) => set(index, e.target.value)} />
            ) : (
              <input id={rowId} aria-label={rowLabel} aria-invalid={over || undefined} className={input} value={item} onChange={(e) => set(index, e.target.value)} />
            )}
            <span className={`w-16 shrink-0 pt-2 text-end text-xs ${over ? 'text-status-error' : 'text-aura-muted'}`}>
              {item.length}/{maxLength}
            </span>
            <button type="button" className={btnOutline} onClick={() => onChange(items.filter((_, i) => i !== index))}>
              {t('list.remove')}
            </button>
          </div>
        )
      })}
      <div>
        <button type="button" className={btnOutline} disabled={items.length >= maxItems} onClick={() => onChange([...items, ''])}>
          {t('list.add')}
        </button>
      </div>
    </fieldset>
  )
}

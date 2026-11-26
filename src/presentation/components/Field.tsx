// A label, a control and its message, tied together for assistive technology: the label names the
// control, a hint and an error are its description, and an error is announced.
import { useId, type ReactNode } from 'react'

export interface FieldIds {
  readonly id: string
  readonly 'aria-describedby': string | undefined
  readonly 'aria-invalid': true | undefined
}

export default function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string | undefined; children: (ids: FieldIds) => ReactNode }) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const described = [hint ? hintId : undefined, error ? errorId : undefined].filter(Boolean).join(' ') || undefined
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-aura-text">
        {label}
      </label>
      {children({ id, 'aria-describedby': described, 'aria-invalid': error ? true : undefined })}
      {hint && (
        <p id={hintId} className="text-xs text-aura-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-sm text-status-error">
          {error}
        </p>
      )}
    </div>
  )
}

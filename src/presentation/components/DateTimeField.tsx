// A labelled date-and-time input. The value is the wall-clock text a `datetime-local` input uses
// ('YYYY-MM-DDTHH:mm', no zone); turning it into a UTC instant in the profile timezone (IAM-UX-14) is
// the screens' job, through the domain's Instant helpers (step 3), so this component stays a plain control.
import { useId } from 'react'
import { input } from './styles'

export default function DateTimeField({
  label,
  value,
  onChange,
  min,
  max,
  disabled = false,
  required = false,
  error,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  min?: string
  max?: string
  disabled?: boolean
  required?: boolean
  /** The field's message (already translated); shown under it and tied to it for assistive tech. */
  error?: string
}) {
  const id = useId()
  const errorId = `${id}-error`
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        type="datetime-local"
        className={input}
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {error && (
        <p id={errorId} role="alert" className="text-sm text-status-error">
          {error}
        </p>
      )}
    </div>
  )
}

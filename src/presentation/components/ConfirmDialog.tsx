// A yes-or-no question about one change: names what will happen, shows a failure in place (the dialog
// stays open), and disables Confirm while the call is in flight.
import { useT } from '@bcbp-solutions-fzc-llc/frontend-sdk/react'
import type { ReactNode } from 'react'
import { APP_ID } from '../../shared/constants/app'
import Dialog from './Dialog'
import ProblemDetails from './ProblemDetails'
import { useProblemText } from '../features/useProblemText'

export default function ConfirmDialog({
  title,
  confirmLabel,
  danger = false,
  busy = false,
  error,
  onConfirm,
  onCancel,
  children,
}: {
  title: string
  confirmLabel: string
  danger?: boolean
  busy?: boolean
  error?: unknown
  onConfirm: () => void
  onCancel: () => void
  children: ReactNode
}) {
  const t = useT(APP_ID)
  const problemText = useProblemText()
  return (
    <Dialog title={title} onClose={onCancel}>
      <div className="mb-4 flex flex-col gap-2">{children}</div>
      {error !== undefined && (
        <div role="alert" className="mb-4 flex flex-wrap items-center gap-2 text-status-error">
          <span>{problemText(error)}</span>
          <ProblemDetails error={error} />
        </div>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn" onClick={onCancel}>
          {t('common.cancel')}
        </button>
        <button type="button" className={`btn ${danger ? 'btn-error' : 'btn-primary'}`} disabled={busy} onClick={onConfirm}>
          {busy ? t('common.working') : confirmLabel}
        </button>
      </div>
    </Dialog>
  )
}

// Someone else changed the record first (409 on expected_version / record_version, IAM-UX-9): say so
// and offer Reload. `children` shows the user's unsaved draft beside the message so it can be copied
// back (LLD §7.9). Never retried, never resubmitted behind the user's back.
import { useT } from '@bcbp-solutions-fzc-llc/frontend-sdk/react'
import type { ReactNode } from 'react'
import { APP_ID } from '../../shared/constants/app'
import Dialog from './Dialog'

export default function ConflictDialog({ onReload, onClose, children }: { onReload: () => void; onClose: () => void; children?: ReactNode }) {
  const t = useT(APP_ID)
  return (
    <Dialog title={t('conflict.title')} onClose={onClose}>
      <p className="mb-4">{t('errors.conflict')}</p>
      {children}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn" onClick={onClose}>
          {t('common.close')}
        </button>
        <button type="button" className="btn btn-primary" onClick={onReload}>
          {t('conflict.reload')}
        </button>
      </div>
    </Dialog>
  )
}

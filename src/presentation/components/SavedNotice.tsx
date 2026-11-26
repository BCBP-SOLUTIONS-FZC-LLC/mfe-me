// A short "Saved" line after a write; it announces itself politely and stays until the next edit.
import { useT } from '@bcbp-solutions-fzc-llc/frontend-sdk/react'
import { APP_ID } from '../../shared/constants/app'

export default function SavedNotice({ show }: { show: boolean }) {
  const t = useT(APP_ID)
  return (
    <p role="status" className="min-h-5 text-sm text-status-success">
      {show ? t('common.saved') : ''}
    </p>
  )
}

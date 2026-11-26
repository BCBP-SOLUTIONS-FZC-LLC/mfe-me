// "Workspace is read-only (subscription ended)": shown on every screen that writes when the workspace is
// read-only (spec §7.10, LLD §7.10); the controls on it are disabled.
import { useT } from '@bcbp-solutions-fzc-llc/frontend-sdk/react'
import { APP_ID } from '../../shared/constants/app'
import { useMeAccess } from '../features/access/useMeAccess'

export default function ReadOnlyNotice() {
  const t = useT(APP_ID)
  const { readOnly } = useMeAccess()
  if (!readOnly) return null
  return (
    <p role="status" className="notice notice-warning">
      {t('errors.readOnly')}
    </p>
  )
}

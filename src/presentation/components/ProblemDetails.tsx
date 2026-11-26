// "Copy details" for any error: the trace ID and codes support asks for, never the server's detail text.
import { isProblemError } from '@bcbp-solutions-fzc-llc/frontend-sdk/problem'
import { useT } from '@bcbp-solutions-fzc-llc/frontend-sdk/react'
import { useState } from 'react'
import { APP_ID } from '../../shared/constants/app'

export default function ProblemDetails({ error }: { error: unknown }) {
  const t = useT(APP_ID)
  const [copied, setCopied] = useState(false)
  if (!isProblemError(error) || !error.traceId) return null
  const details = JSON.stringify({ traceId: error.traceId, requestId: error.requestId, errorCode: error.errorCode, status: error.status })
  return (
    <button
      type="button"
      className="btn btn-ghost btn-xs"
      onClick={() => {
        void navigator.clipboard?.writeText(details).then(() => setCopied(true))
      }}
    >
      {copied ? t('common.copied') : t('common.copyDetails')}
    </button>
  )
}

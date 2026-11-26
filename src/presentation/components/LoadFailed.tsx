// A failed load: what went wrong in a sentence, Retry, and "Copy details" with the trace ID. The
// rows or the page around it stay (a failure never blanks the screen: LLD §6.4).
import { useT } from '@bcbp-solutions-fzc-llc/frontend-sdk/react'
import { APP_ID } from '../../shared/constants/app'
import { useProblemText } from '../features/useProblemText'
import ProblemDetails from './ProblemDetails'

export default function LoadFailed({ message, error, onRetry }: { message: string; error: unknown; onRetry: () => void }) {
  const t = useT(APP_ID)
  const text = useProblemText()
  return (
    <div role="alert" className="notice notice-error flex flex-wrap items-center gap-2">
      <span>
        {message} {text(error)}
      </span>
      <button type="button" className="btn btn-sm" onClick={onRetry}>
        {t('common.retry')}
      </button>
      <ProblemDetails error={error} />
    </div>
  )
}

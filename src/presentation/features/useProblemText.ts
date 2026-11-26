// The sentence for a failed call (LLD §11): this remote's own message for a code it knows, else the
// SDK's translated sentence for the problem's type, else a generic one. A server's `detail` is never shown.
import { problemMessage } from '@bcbp-solutions-fzc-llc/frontend-sdk/i18n'
import { isProblemError } from '@bcbp-solutions-fzc-llc/frontend-sdk/problem'
import { useT } from '@bcbp-solutions-fzc-llc/frontend-sdk/react'
import { APP_ID } from '../../shared/constants/app'
import { useMeServices } from './services'

export function useProblemText(): (error: unknown) => string {
  const t = useT(APP_ID)
  const { problems } = useMeServices()
  return (error) => {
    const key = problems.messageKey(error)
    if (key) return t(key)
    return isProblemError(error) ? problemMessage(error) : t('errors.generic')
  }
}

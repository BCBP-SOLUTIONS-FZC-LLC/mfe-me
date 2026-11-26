// G4's data and write: my AI drafting preferences. "Nothing saved yet" is a 404 the adapter turns into
// `undefined`; the query holds it as `{ saved: undefined }` (a query cannot hold `undefined`). A saved model
// that the service no longer knows (`422 UNKNOWN_MODEL`) means the configured list is stale: warn once.
import { isProblemError } from '@bcbp-solutions-fzc-llc/frontend-sdk/problem'
import { getLogger } from '@bcbp-solutions-fzc-llc/frontend-sdk/logging'
import type { LlmPreferences, LlmPreferencesUpdate } from '../../../domain/entities/preferences'
import { APP_ID } from '../../../shared/constants/app'
import { useSelf } from '../self/useSelf'
import { useMeUseCases } from '../services'
import { useTrackedMutation, useTrackedQuery } from '../tracked'
import { useMeKeys } from '../workspace'

export function useAiPreferences() {
  const { userId } = useSelf()
  const useCases = useMeUseCases()
  const { keys } = useMeKeys()
  return useTrackedQuery({
    resource: 'ai_preferences',
    queryKey: keys.aiPreferences(userId ?? ''),
    enabled: userId !== undefined,
    queryFn: async (signal) => ({ saved: await useCases.getLlmPreferences.execute(userId!, signal) }),
  })
}

export function useSaveAiPreferences() {
  const { userId } = useSelf()
  const useCases = useMeUseCases()
  return useTrackedMutation<LlmPreferencesUpdate, LlmPreferences>({
    action: 'save_ai_preferences',
    mutationFn: async (update) => {
      try {
        return await useCases.putLlmPreferences.execute(userId!, update)
      } catch (error) {
        if (isProblemError(error) && error.errorCode?.toUpperCase() === 'UNKNOWN_MODEL') {
          getLogger({ mfe: APP_ID }).warn('the configured AI model list is stale', { model: update.preferredModel })
        }
        throw error
      }
    },
    invalidate: (keys) => [keys.aiPreferences(userId!)],
  })
}

// G5's data and writes: my notification preferences, a whole list per save (IAM-UX-10: an omitted row is
// deleted, and an empty list resets to the system defaults). The resource has no version (LLD §15 #10), so two
// tabs can overwrite each other; the answer of every save replaces what the page shows.
import { useQueryClient } from '@tanstack/react-query'
import type { NotificationPreference } from '../../../domain/entities/preferences'
import { useSelf } from '../self/useSelf'
import { useMeUseCases } from '../services'
import { useTrackedMutation, useTrackedQuery } from '../tracked'
import { useMeKeys } from '../workspace'

export function useNotificationPreferences() {
  const { userId } = useSelf()
  const useCases = useMeUseCases()
  const { keys } = useMeKeys()
  return useTrackedQuery({
    resource: 'notification_preferences',
    queryKey: keys.notificationPreferences(userId ?? ''),
    enabled: userId !== undefined,
    queryFn: (signal) => useCases.getNotificationPreferences.execute(userId!, signal),
  })
}

export function useSaveNotificationPreferences() {
  const { userId } = useSelf()
  const useCases = useMeUseCases()
  const { keys } = useMeKeys()
  const queryClient = useQueryClient()
  return useTrackedMutation<readonly NotificationPreference[], readonly NotificationPreference[]>({
    action: 'save_notification_preferences',
    mutationFn: async (list) => {
      const saved = await useCases.putNotificationPreferences.execute(userId!, list)
      queryClient.setQueryData(keys.notificationPreferences(userId!), saved)
      return saved
    },
  })
}

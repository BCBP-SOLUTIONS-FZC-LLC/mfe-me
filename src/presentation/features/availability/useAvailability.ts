// G2's data and write: my availability (`GET` / `PUT /users/<me>/availability`). A save refreshes my
// availability, my profile and my `users:batch` entry (the availability dot on my chip, LLD §7.4).
import type { Availability, AvailabilityUpdate } from '../../../domain/entities/availability'
import { useSelf } from '../self/useSelf'
import { useMeUseCases } from '../services'
import { useTrackedMutation, useTrackedQuery } from '../tracked'
import { useMeKeys } from '../workspace'

export function useAvailability() {
  const { userId } = useSelf()
  const useCases = useMeUseCases()
  const { keys } = useMeKeys()
  return useTrackedQuery({
    resource: 'availability',
    queryKey: keys.availability(userId ?? ''),
    enabled: userId !== undefined,
    queryFn: (signal) => useCases.getAvailability.execute(userId!, signal),
  })
}

export function useSaveAvailability() {
  const { userId } = useSelf()
  const useCases = useMeUseCases()
  return useTrackedMutation<AvailabilityUpdate, Availability>({
    action: 'set_availability',
    mutationFn: (update) => useCases.putAvailability.execute(userId!, update),
    invalidate: (keys) => [keys.availability(userId!), keys.profile(userId!), keys.user(userId!)],
  })
}

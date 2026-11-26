// Names for a page of user IDs (IAM-UX-4). One lookup per set of IDs, through fetchUsers (de-duplicate,
// chunk at 200); each profile is also stored under its own key with staleTime about 60 s, so the chips and
// the picker reuse it instead of asking again. A row is never hidden: an ID the service lists as missing
// is "Unknown user", and a failed lookup is "Name unavailable".
//
// This is the part the shared identity package replaces (mfe-admin §15 #5, ADR 0003).
import { useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { fetchUsers, USER_STALE_MS } from '../../../application/queries/userBatcher'
import type { ProfileState } from '../../../domain/entities/directory'
import type { UserSummary } from '../../../domain/entities/profile'
import { useMeUseCases } from '../services'
import { useTrackedQuery } from '../tracked'
import { useMeKeys } from '../workspace'

export interface UserProfiles {
  /** The state of one ID; undefined while the lookup is still loading. */
  readonly of: (userId: string) => ProfileState | undefined
  readonly loading: boolean
}

export function useUserProfiles(ids: readonly string[]): UserProfiles {
  const useCases = useMeUseCases()
  const { keys } = useMeKeys()
  const queryClient = useQueryClient()
  const distinct = useMemo(() => [...new Set(ids.filter((id) => id !== ''))].sort(), [ids])

  const query = useTrackedQuery({
    resource: 'user_profiles',
    queryKey: [...keys.all, 'users', 'batch', distinct],
    enabled: distinct.length > 0,
    staleTime: USER_STALE_MS,
    queryFn: async (signal) => {
      const fresh = (id: string) => {
        const state = queryClient.getQueryState(keys.user(id))
        // An invalidated entry (my own profile edit) is never fresh: only this lookup can refill it.
        return state?.data !== undefined && !state.isInvalidated && Date.now() - state.dataUpdatedAt < USER_STALE_MS
      }
      const wanted = distinct.filter((id) => !fresh(id))
      if (wanted.length > 0) {
        const batch = await fetchUsers({ batch: (batchIds, batchSignal) => useCases.batchUserProfiles.execute(batchIds, batchSignal) }, wanted, signal)
        for (const user of batch.users) queryClient.setQueryData(keys.user(user.userId), { state: 'found', user } satisfies ProfileState)
        for (const id of batch.missing) queryClient.setQueryData(keys.user(id), { state: 'missing' } satisfies ProfileState)
      }
      return distinct.length
    },
  })

  return useMemo(() => {
    const read = (id: string): ProfileState | undefined => queryClient.getQueryData<ProfileState>(keys.user(id))
    return {
      loading: distinct.length > 0 && query.isPending,
      of: (id: string) => (query.isError ? ({ state: 'unavailable' } as const) : query.isPending && distinct.length > 0 ? undefined : (read(id) ?? { state: 'unavailable' as const })),
    }
    // `query.dataUpdatedAt` changes when the cache was filled, so the reader sees the new profiles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [distinct, query.isError, query.isPending, query.dataUpdatedAt, queryClient, keys])
}

/** A found profile's summary, or undefined. */
export const foundUser = (p: ProfileState | undefined): UserSummary | undefined => (p?.state === 'found' ? p.user : undefined)

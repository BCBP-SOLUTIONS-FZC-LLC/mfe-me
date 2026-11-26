// My profile (G1, and the display zone everywhere): `GET /users/<me>`. The Swagger says my own profile is
// provisioned lazily on the first read, while the spec still reports a 404 right after sign-up (IAM gap
// G-13): on a 404 the page says "Your profile is being set up" with the name and email from the token, and
// the load is tried once more after 10 s (LLD §7.2, §15 #12).
import { isProblemError } from '@bcbp-solutions-fzc-llc/frontend-sdk/problem'
import { useEffect, useRef } from 'react'
import { USER_STALE_MS } from '../../../application/queries/userBatcher'
import type { MyProfile } from '../../../domain/entities/profile'
import { useSelf } from '../self/useSelf'
import { useMeUseCases } from '../services'
import { useTrackedQuery } from '../tracked'
import { useMeKeys } from '../workspace'

/** How long to wait before asking again for a profile that does not exist yet (a test shortens it). */
export const profileRetry = { delayMs: 10_000 }

export interface MyProfileState {
  readonly profile: MyProfile | undefined
  /** The service has no profile for me yet (a 404): show the "being set up" state and keep editing off. */
  readonly notReady: boolean
  readonly loading: boolean
  readonly error: unknown
  /** Asks again; resolves when the answer is in. */
  readonly reload: () => Promise<void>
}

/** `retryNotReady`: the page that says "being set up" asks once more after a delay; hooks that only read the zone or name do not. */
export function useMyProfile({ retryNotReady = false }: { retryNotReady?: boolean } = {}): MyProfileState {
  const { userId } = useSelf()
  const useCases = useMeUseCases()
  const { keys } = useMeKeys()
  const query = useTrackedQuery({
    resource: 'profile',
    queryKey: keys.profile(userId ?? ''),
    enabled: userId !== undefined,
    // Several parts of a page read my profile (the form, the zone, the chip): one read serves them all (the service caches it ~60 s).
    staleTime: USER_STALE_MS,
    queryFn: (signal) => useCases.getUserProfile.execute(userId!, signal),
  })
  const notReady = isProblemError(query.error) && query.error.status === 404
  const retried = useRef(false)
  const { refetch } = query
  useEffect(() => {
    if (!retryNotReady || !notReady || retried.current) return
    retried.current = true
    const timer = setTimeout(() => void refetch(), profileRetry.delayMs)
    return () => clearTimeout(timer)
  }, [retryNotReady, notReady, refetch])
  return {
    profile: query.data,
    notReady,
    loading: userId === undefined || query.isPending,
    error: notReady ? undefined : query.error,
    reload: () => refetch().then(() => undefined),
  }
}

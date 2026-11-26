// Queries and mutations that record the iam_me_* metrics through the telemetry port: a query
// measures its load (success or error; a superseded or aborted load is never counted), a mutation
// measures its write (success, failure for a rejection, error for a fault). A successful write
// invalidates the keys it names. Only features/ and app/ import TanStack Query (ADR 0001).
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData, type QueryKey } from '@tanstack/react-query'
import type { MeKeys } from '../../application/queries/keys'
import type { LoadResource, MeAction } from '../../domain/events/me-events'
import { useMeServices } from './services'
import { useMeKeys } from './workspace'

interface QueryOptions<T> {
  readonly resource: LoadResource
  readonly queryKey: QueryKey
  readonly queryFn: (signal: AbortSignal) => Promise<T>
  /** Held back until the session context has loaded, and further by this. */
  readonly enabled?: boolean
  /** How long a result stays fresh (default: always stale; the identity lookups use ~60 s). */
  readonly staleTime?: number
  /** Ask again after this many ms while it returns a number; false stops. */
  readonly refetchInterval?: (data: T | undefined) => number | false
}

export function useTrackedQuery<T>(o: QueryOptions<T>) {
  const { telemetry, problems } = useMeServices()
  const { ready } = useMeKeys()
  return useQuery({
    queryKey: o.queryKey,
    enabled: ready && (o.enabled ?? true),
    ...(o.staleTime !== undefined ? { staleTime: o.staleTime } : {}),
    ...(o.refetchInterval ? { refetchInterval: (query: { state: { data: T | undefined } }) => o.refetchInterval!(query.state.data) } : {}),
    queryFn: async ({ signal }) => {
      const load = telemetry.loadStarted(o.resource)
      try {
        const data = await o.queryFn(signal)
        load.finish('success')
        return data
      } catch (error) {
        const outcome = problems.loadOutcomeOf(error)
        if (outcome) load.finish(outcome)
        throw error
      }
    },
  })
}

interface InfiniteOptions<P> {
  readonly resource: LoadResource
  readonly queryKey: QueryKey
  readonly queryFn: (cursor: string | undefined, signal: AbortSignal) => Promise<P>
  readonly nextCursor: (page: P) => string | undefined
  readonly enabled?: boolean
}

/** A keyset-paged list (members): each page is one measured load. */
export function useTrackedInfiniteQuery<P>(o: InfiniteOptions<P>) {
  const { telemetry, problems } = useMeServices()
  const { ready } = useMeKeys()
  return useInfiniteQuery<P, Error, InfiniteData<P, string | undefined>, QueryKey, string | undefined>({
    queryKey: o.queryKey,
    enabled: ready && (o.enabled ?? true),
    initialPageParam: undefined,
    getNextPageParam: (last) => o.nextCursor(last),
    queryFn: async ({ pageParam, signal }) => {
      const load = telemetry.loadStarted(o.resource)
      try {
        const page = await o.queryFn(pageParam, signal)
        load.finish('success')
        return page
      } catch (error) {
        const outcome = problems.loadOutcomeOf(error)
        if (outcome) load.finish(outcome)
        throw error
      }
    },
  })
}

interface MutationOptions<V, R> {
  readonly action: MeAction
  readonly mutationFn: (variables: V) => Promise<R>
  /** The keys a success makes stale (by prefix). */
  readonly invalidate?: (keys: MeKeys, result: R, variables: V) => readonly QueryKey[]
}

export function useTrackedMutation<V, R>(o: MutationOptions<V, R>) {
  const { telemetry, problems } = useMeServices()
  const { keys } = useMeKeys()
  const queryClient = useQueryClient()
  return useMutation<R, Error, V>({
    mutationFn: async (variables) => {
      const write = telemetry.actionStarted(o.action)
      try {
        const result = await o.mutationFn(variables)
        write.finish('success')
        return result
      } catch (error) {
        const outcome = problems.outcomeOf(error)
        if (outcome) write.finish(outcome)
        throw error
      }
    },
    onSuccess: async (result, variables) => {
      await Promise.all((o.invalidate?.(keys, result, variables) ?? []).map((queryKey) => queryClient.invalidateQueries({ queryKey })))
    },
  })
}

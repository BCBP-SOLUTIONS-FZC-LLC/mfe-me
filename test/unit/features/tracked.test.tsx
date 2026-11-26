import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient } from '@tanstack/react-query'
import { ProblemError } from '@bcbp-solutions-fzc-llc/frontend-sdk/problem'
import { describe, expect, it } from '@rstest/core'
import { useTrackedInfiniteQuery, useTrackedMutation, useTrackedQuery } from '../../../src/presentation/features/tracked'
import { startPlatform } from '../../fixtures/platform'
import { fakeServices, servicesWrapper } from '../../fixtures/services'

const problem = (status: number) => new ProblemError({ type: 'about:blank', title: 't', status, extensions: {} } as never)
const inWorkspace = () => startPlatform({ context: { slug: 'acme', tenantId: 'tenant-1' } })

function setup() {
  const platform = inWorkspace()
  const { services, recorded } = fakeServices()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const Services = servicesWrapper(services, client)
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <platform.Wrapper>
      <Services>{children}</Services>
    </platform.Wrapper>
  )
  return { wrapper, recorded, client }
}

describe('useTrackedQuery', () => {
  it('records one successful load', async () => {
    const { wrapper, recorded } = setup()
    const { result } = renderHook(() => useTrackedQuery({ resource: 'profile', queryKey: ['p'], queryFn: async () => 42 }), { wrapper })
    await waitFor(() => expect(result.current.data).toBe(42))
    expect(recorded.loads).toEqual([{ resource: 'profile', outcome: 'success' }])
  })

  it('records a failed load as error and keeps the error for the page', async () => {
    const { wrapper, recorded } = setup()
    const failure = problem(503)
    const { result } = renderHook(() => useTrackedQuery({ resource: 'delegations', queryKey: ['d'], queryFn: async () => Promise.reject(failure) }), { wrapper })
    await waitFor(() => expect(result.current.error).toBe(failure))
    expect(recorded.loads).toEqual([{ resource: 'delegations', outcome: 'error' }])
  })

  it('does not count an aborted load', async () => {
    const { wrapper, recorded } = setup()
    const { result } = renderHook(
      () => useTrackedQuery({ resource: 'profile', queryKey: ['a'], queryFn: async () => Promise.reject(new DOMException('x', 'AbortError')) }),
      { wrapper },
    )
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(recorded.loads).toEqual([])
  })

  it('waits for the enabled flag', async () => {
    const { wrapper, recorded } = setup()
    const { result } = renderHook(() => useTrackedQuery({ resource: 'profile', queryKey: ['e'], enabled: false, queryFn: async () => 1 }), { wrapper })
    await new Promise((r) => setTimeout(r, 20))
    expect(result.current.fetchStatus).toBe('idle')
    expect(recorded.loads).toEqual([])
  })

  it('waits for the session context (no slug yet)', async () => {
    startPlatform()
    const { services, recorded } = fakeServices()
    const { result } = renderHook(() => useTrackedQuery({ resource: 'profile', queryKey: ['n'], queryFn: async () => 1 }), { wrapper: servicesWrapper(services) })
    await new Promise((r) => setTimeout(r, 20))
    expect(result.current.fetchStatus).toBe('idle')
    expect(recorded.loads).toEqual([])
  })
})

describe('useTrackedInfiniteQuery', () => {
  it('measures each page as one load and follows the cursor', async () => {
    const { wrapper, recorded } = setup()
    const pages: Record<string, { items: number[]; next?: string }> = { first: { items: [1], next: 'c2' }, c2: { items: [2] } }
    const { result } = renderHook(
      () => useTrackedInfiniteQuery({ resource: 'members', queryKey: ['m'], queryFn: async (cursor) => pages[cursor ?? 'first']!, nextCursor: (p) => p.next }),
      { wrapper },
    )
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(1))
    await act(async () => void (await result.current.fetchNextPage()))
    await waitFor(() => expect(result.current.hasNextPage).toBe(false))
    expect(recorded.loads).toEqual([
      { resource: 'members', outcome: 'success' },
      { resource: 'members', outcome: 'success' },
    ])
  })

  it('records a failed page as error', async () => {
    const { wrapper, recorded } = setup()
    const { result } = renderHook(() => useTrackedInfiniteQuery({ resource: 'members', queryKey: ['m2'], queryFn: async () => Promise.reject(problem(500)), nextCursor: () => undefined }), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(recorded.loads).toEqual([{ resource: 'members', outcome: 'error' }])
  })
})

describe('useTrackedMutation', () => {
  it('records a success and invalidates the keys it names', async () => {
    const { wrapper, recorded, client } = setup()
    client.setQueryData(['me', 'acme', 'profile', 'u1'], { stale: false })
    const { result } = renderHook(
      () => useTrackedMutation({ action: 'update_profile', mutationFn: async (n: number) => n * 2, invalidate: (keys) => [keys.profile('u1')] }),
      { wrapper },
    )
    await act(async () => void (await result.current.mutateAsync(2)))
    expect(recorded.actions).toEqual([{ action: 'update_profile', outcome: 'success' }])
    expect(client.getQueryState(['me', 'acme', 'profile', 'u1'])?.isInvalidated).toBe(true)
  })

  it('records a 4xx as failure and a 5xx as error, and rethrows', async () => {
    const { wrapper, recorded } = setup()
    const { result } = renderHook(() => useTrackedMutation({ action: 'create_delegation', mutationFn: async (status: number) => Promise.reject(problem(status)) }), { wrapper })
    await act(async () => void (await result.current.mutateAsync(422).catch(() => undefined)))
    await act(async () => void (await result.current.mutateAsync(503).catch(() => undefined)))
    expect(recorded.actions).toEqual([
      { action: 'create_delegation', outcome: 'failure' },
      { action: 'create_delegation', outcome: 'error' },
    ])
  })

  it('records nothing for an aborted write', async () => {
    const { wrapper, recorded } = setup()
    const { result } = renderHook(() => useTrackedMutation({ action: 'update_profile', mutationFn: async () => Promise.reject(new DOMException('x', 'AbortError')) }), { wrapper })
    await act(async () => void (await result.current.mutateAsync(undefined).catch(() => undefined)))
    expect(recorded.actions).toEqual([])
  })
})

describe('useTrackedQuery polling', () => {
  it('asks again while the interval function returns a number, and stops on false', async () => {
    const { wrapper, recorded } = setup()
    let calls = 0
    const { result } = renderHook(
      () => useTrackedQuery({ resource: 'delegations', queryKey: ['poll'], queryFn: async () => ++calls, refetchInterval: (data) => ((data ?? 0) < 2 ? 10 : false) }),
      { wrapper },
    )
    await waitFor(() => expect(result.current.data).toBe(2))
    await new Promise((r) => setTimeout(r, 40))
    expect(calls).toBe(2)
    expect(recorded.loads).toHaveLength(2)
  })
})

describe('option defaults', () => {
  it('keeps a result fresh for staleTime, and runs a mutation with no invalidation list', async () => {
    const { wrapper } = setup()
    let calls = 0
    const first = renderHook(() => useTrackedQuery({ resource: 'profile', queryKey: ['fresh'], staleTime: 60_000, queryFn: async () => ++calls }), { wrapper })
    await waitFor(() => expect(first.result.current.data).toBe(1))
    const mutation = renderHook(() => useTrackedMutation({ action: 'save_ai_preferences', mutationFn: async () => 'ok' }), { wrapper })
    let value: string | undefined
    await act(async () => {
      value = await mutation.result.current.mutateAsync(undefined)
    })
    expect(value).toBe('ok')
  })

  it('does not fetch a disabled paged list', async () => {
    const { wrapper, recorded } = setup()
    const { result } = renderHook(() => useTrackedInfiniteQuery({ resource: 'members', queryKey: ['off'], enabled: false, queryFn: async () => 1, nextCursor: () => undefined }), { wrapper })
    await new Promise((r) => setTimeout(r, 20))
    expect(result.current.fetchStatus).toBe('idle')
    expect(recorded.loads).toEqual([])
  })
})

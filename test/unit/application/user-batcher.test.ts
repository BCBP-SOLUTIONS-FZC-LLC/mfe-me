// POST /users:batch takes 1..200 IDs per call. fetchUsers de-duplicates, chunks and merges; it keeps
// no cache (TanStack Query stores the results per user ID, staleTime about 60 s).
import { describe, expect, it, rs } from '@rstest/core'
import type { UserBatch, UserSummary } from '../../../src/domain/entities/profile'
import type { UserProfilePort } from '../../../src/domain/repositories/UserProfilePort'
import { MAX_BATCH, USER_STALE_MS, chunkIds, fetchUsers } from '../../../src/application/queries/userBatcher'

const user = (userId: string): UserSummary => ({
  userId,
  displayName: `User ${userId}`,
  email: `${userId}@example.com`,
  status: 'active',
  provisional: false,
  recordVersion: 1,
})
const ids = (n: number, from = 0) => Array.from({ length: n }, (_, i) => `u-${from + i}`)

/** A port that knows the first `known` of any requested IDs and lists the rest as missing. */
function port(known: (id: string) => boolean = () => true) {
  const batch = rs.fn(async (requested: readonly string[]): Promise<UserBatch> => ({
    users: requested.filter(known).map(user),
    missing: requested.filter((id) => !known(id)),
  }))
  return { batch } satisfies UserProfilePort
}

describe('chunkIds', () => {
  it('de-duplicates in first-seen order and drops blanks', () => {
    expect(chunkIds(['b', 'a', 'b', ' ', '', 'a', 'c'])).toEqual([['b', 'a', 'c']])
  })

  it('splits at 200 IDs per call', () => {
    const chunks = chunkIds(ids(450))
    expect(chunks.map((c) => c.length)).toEqual([200, 200, 50])
    expect(MAX_BATCH).toBe(200)
  })

  it('makes no call for nothing to look up', () => {
    expect(chunkIds([])).toEqual([])
  })

  it('counts a repeated ID once toward the limit', () => {
    expect(chunkIds([...ids(200), ...ids(200)])).toHaveLength(1)
  })
})

describe('fetchUsers', () => {
  it('asks once for a page of 50 and returns the profiles', async () => {
    const p = port()
    const result = await fetchUsers(p, ids(50))
    expect(p.batch).toHaveBeenCalledTimes(1)
    expect(result.users).toHaveLength(50)
    expect(result.missing).toEqual([])
  })

  it('sends chunks one after another, never in parallel (the service allows a burst of 5)', async () => {
    let inFlight = 0
    let peak = 0
    const batch = rs.fn(async (requested: readonly string[]): Promise<UserBatch> => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await Promise.resolve()
      inFlight--
      return { users: requested.map(user), missing: [] }
    })
    const result = await fetchUsers({ batch }, ids(450))
    expect(batch).toHaveBeenCalledTimes(3)
    expect(peak).toBe(1)
    expect(result.users).toHaveLength(450)
  })

  it('reports the service\'s missing IDs ("Unknown user")', async () => {
    const result = await fetchUsers(port((id) => id !== 'u-1'), ids(3))
    expect(result.users.map((u) => u.userId)).toEqual(['u-0', 'u-2'])
    expect(result.missing).toEqual(['u-1'])
  })

  it('reports an ID the service neither returned nor listed as missing, so no row lacks an answer', async () => {
    const batch = rs.fn(async (): Promise<UserBatch> => ({ users: [user('u-0')], missing: [] }))
    const result = await fetchUsers({ batch }, ['u-0', 'u-1'])
    expect(result.missing).toEqual(['u-1'])
  })

  it('does not call the service for no IDs', async () => {
    const p = port()
    expect(await fetchUsers(p, [])).toEqual({ users: [], missing: [] })
    expect(p.batch).not.toHaveBeenCalled()
  })

  it('rejects when a chunk fails, so the caller can show "Name unavailable" rather than hide rows', async () => {
    const batch = rs.fn(async (requested: readonly string[]): Promise<UserBatch> => {
      if (requested.includes('u-200')) throw new Error('503')
      return { users: requested.map(user), missing: [] }
    })
    await expect(fetchUsers({ batch }, ids(250))).rejects.toThrow('503')
  })

  it('stops between chunks when aborted', async () => {
    const controller = new AbortController()
    const batch = rs.fn(async (requested: readonly string[]): Promise<UserBatch> => {
      controller.abort()
      return { users: requested.map(user), missing: [] }
    })
    await expect(fetchUsers({ batch }, ids(450), controller.signal)).rejects.toThrow()
    expect(batch).toHaveBeenCalledTimes(1)
  })

  it('passes the abort signal to the port', async () => {
    const controller = new AbortController()
    const p = port()
    await fetchUsers(p, ['u-0'], controller.signal)
    expect(p.batch).toHaveBeenCalledWith(['u-0'], controller.signal)
  })
})

describe('profile freshness', () => {
  it('is about the service cache (60 s), the staleTime of the per-user query', () => {
    expect(USER_STALE_MS).toBe(60_000)
  })
})

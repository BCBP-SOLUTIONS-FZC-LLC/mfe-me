// POST /users:batch takes 1..200 IDs per call (IAM-UX-4; the service rate-limits to 20 req/s, burst
// 5, per user per replica). This de-duplicates the IDs a page asks for, drops blanks, and splits
// them into calls of at most 200, sent one after another so a large picker cannot burst past the
// limit. It keeps no cache: the results are stored per user ID in the TanStack Query cache with
// staleTime about 60 s, matching the service's own cache (ADR 0001).
import type { UserBatch, UserSummary } from '../../domain/entities/profile'
import type { UserProfilePort } from '../../domain/repositories/UserProfilePort'

/** The service's limit per call. */
export const MAX_BATCH = 200

/** How long a fetched profile stays fresh: the User Profile service caches about this long. */
export const USER_STALE_MS = 60_000

/** The distinct, non-blank IDs, in first-seen order, in groups of at most `size`. */
export function chunkIds(ids: readonly string[], size = MAX_BATCH): string[][] {
  const distinct = [...new Set(ids.filter((id) => id.trim() !== ''))]
  const chunks: string[][] = []
  for (let i = 0; i < distinct.length; i += size) chunks.push(distinct.slice(i, i + size))
  return chunks
}

/**
 * Looks up `ids` through `port`, in chunks, and merges the answers. An ID the service neither
 * returned nor listed as missing is reported as missing: a row never lacks an answer. A failed
 * chunk rejects the whole call (the caller shows "Name unavailable", never hides the row).
 */
export async function fetchUsers(port: Pick<UserProfilePort, 'batch'>, ids: readonly string[], signal?: AbortSignal): Promise<UserBatch> {
  const users = new Map<string, UserSummary>()
  const missing = new Set<string>()
  for (const chunk of chunkIds(ids)) {
    signal?.throwIfAborted()
    const answer = await port.batch(chunk, signal)
    for (const user of answer.users) users.set(user.userId, user)
    for (const id of answer.missing) missing.add(id)
    for (const id of chunk) if (!users.has(id)) missing.add(id)
  }
  return { users: [...users.values()], missing: [...missing].filter((id) => !users.has(id)) }
}

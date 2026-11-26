// Which workspace a call is for. The tenant ID in a path comes from the session context and must
// equal the token's, or the call is 403 (IAM-UX-1); this remote never sends identity in a header or
// a body. The composition root supplies the ID of the mount's workspace.
import type { ApiClient } from '@bcbp-solutions-fzc-llc/frontend-sdk/http'

export class MissingWorkspaceError extends Error {
  override readonly name = 'MissingWorkspaceError'
  constructor() {
    super('no tenant ID: the session context has not loaded, so there is no workspace to call')
  }
}

/** What every adapter needs: the SDK client and the workspace's tenant ID (read at call time). */
export interface ApiScope {
  readonly client: ApiClient
  /** The tenant ID, or undefined before the session context has loaded (standalone, or still loading). */
  readonly tenantId: () => string | undefined
}

/** The tenant ID for a call; throws MissingWorkspaceError rather than send a request with no workspace. */
export function requireTenant(scope: ApiScope): string {
  const id = scope.tenantId()
  if (!id) throw new MissingWorkspaceError()
  return id
}

/** The request option for an optional abort signal: present only when a signal was given. */
export function withSignal(signal?: AbortSignal): { signal?: AbortSignal } {
  return signal ? { signal } : {}
}

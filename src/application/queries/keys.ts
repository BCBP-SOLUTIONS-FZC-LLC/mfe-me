// Query keys for this remote's server state (ADR 0001). Every key starts with the workspace slug,
// so a workspace switch can never show another workspace's data, and writes invalidate by prefix.
// They live in application/ because the feature hooks that use them are presentation and may not
// import infrastructure; they are plain arrays, so nothing here knows TanStack Query.
import type { LoadResource } from '../../domain/events/me-events'

export interface ListParams {
  readonly limit?: number
  readonly cursor?: string
  readonly [filter: string]: string | number | boolean | undefined
}

/** The key factory for one workspace. */
export function meKeys(slug: string) {
  const root = ['me', slug] as const
  const of = <R extends LoadResource>(resource: R, ...rest: readonly unknown[]) => [...root, resource, ...rest] as const
  return {
    /** Everything for this workspace (clear on workspace switch or sign-out). */
    all: root,
    profile: (userId: string) => of('profile', userId),
    availability: (userId: string) => of('availability', userId),
    delegations: () => of('delegations'),
    /** Its own prefix, not under `delegations`: a delegation write must not refetch the policy. */
    delegationPolicy: () => [...root, 'delegation-policy'] as const,
    members: (params: ListParams = {}) => of('members', 'list', params),
    departments: () => of('departments'),
    roleLabels: () => of('role_labels'),
    aiPreferences: (userId: string) => of('ai_preferences', userId),
    notificationPreferences: (userId: string) => of('notification_preferences', userId),
    /** One user's summary from `users:batch`, stored per ID so chips and pickers share it (staleTime ~60 s). */
    user: (userId: string) => [...root, 'users', userId] as const,
  }
}

export type MeKeys = ReturnType<typeof meKeys>

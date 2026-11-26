import type { Cursor } from '../value-objects/Cursor'
import type { RecordVersion } from '../value-objects/RecordVersion'
import type { DepartmentLevel } from '../vocabulary'
import type { UserSummary } from './profile'

/** A tenant member as P-4 lists them: IDs only; names come from User Profile (IAM-UX-4). */
export interface MemberRef {
  readonly userId: string
  readonly status: 'active' | 'suspended'
}

/** One page of the member list. `nextCursor` is absent on the last page. */
export interface MemberPage {
  readonly members: readonly MemberRef[]
  readonly nextCursor?: Cursor
}

/**
 * What User Profile said about a member (IAM-UX-4): found, "Unknown user" (the service listed the ID
 * as missing), or "Name unavailable" (the batch call failed). A row is never hidden for lack of one.
 */
export type ProfileState =
  | { readonly state: 'found'; readonly user: UserSummary }
  | { readonly state: 'missing' }
  | { readonly state: 'unavailable' }

/** A delegate picker row: the membership joined with its profile and availability. */
export interface MemberOption {
  readonly userId: string
  readonly status: MemberRef['status']
  readonly profile: ProfileState
}

/** A department the tenant has activated (P-3). The answer carries the catalogue's name and code. */
export interface TenantDepartment {
  readonly departmentId: string
  readonly code: string
  readonly name: string
  readonly isActive: boolean
  readonly recordVersion: RecordVersion
}

/** The tenant's own label for a department level (P-12). The code never changes; only the label does. */
export interface RoleLabel {
  readonly roleCode: DepartmentLevel
  readonly displayName: string
  readonly recordVersion: RecordVersion
}

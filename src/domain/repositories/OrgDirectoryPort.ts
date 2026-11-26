import type { MemberPage, RoleLabel, TenantDepartment } from '../entities/directory'
import type { Cursor } from '../value-objects/Cursor'

/**
 * Org & Membership (IAM), read only: the members for the delegate picker, the tenant's departments
 * (names for a department scope) and the level labels. The tenant ID comes from the session, never the caller.
 */
export interface OrgDirectoryPort {
  /** P-4: IDs only; join with User Profile for names (IAM-UX-4). */
  listMembers(page: { readonly limit?: number; readonly cursor?: Cursor }, signal?: AbortSignal): Promise<MemberPage>
  /** P-3 */
  listDepartments(signal?: AbortSignal): Promise<readonly TenantDepartment[]>
  /** P-12 */
  listRoleLabels(signal?: AbortSignal): Promise<readonly RoleLabel[]>
}

// Org & Membership, read only: members (P-4), departments (P-3), level labels (P-12). The tenant ID in the
// path comes from the session context and must equal the token's, or the call is 403 (IAM-UX-1).
import type { OrgDirectoryPort } from '../../domain/repositories/OrgDirectoryPort'
import { toMemberPage, toRoleLabels, toTenantDepartments } from './mappers'
import { requireTenant, withSignal, type ApiScope } from './scope'

export function createOrgDirectoryAdapter(scope: ApiScope): OrgDirectoryPort {
  const { client } = scope
  const id = () => requireTenant(scope)
  const sig = withSignal
  return {
    async listMembers(page, signal) {
      const res = await client.get('/v1/tenants/:id/members', {
        params: { id: id() },
        query: { ...(page.limit !== undefined ? { limit: page.limit } : {}), ...(page.cursor ? { cursor: page.cursor } : {}) },
        ...sig(signal),
      })
      return toMemberPage(res.data)
    },
    async listDepartments(signal) {
      const res = await client.get('/v1/tenants/:id/departments', { params: { id: id() }, ...sig(signal) })
      return toTenantDepartments(res.data)
    },
    async listRoleLabels(signal) {
      const res = await client.get('/v1/tenants/:id/roles', { params: { id: id() }, ...sig(signal) })
      return toRoleLabels(res.data)
    },
  }
}

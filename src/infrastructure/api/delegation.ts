// Delegation (DLG-1 to DLG-6) over the SDK ApiClient. The Swagger's paths already carry `/api/v1`, and the
// client adds `/api`, so the templates are `/v1/delegations…` (never `/api/v1`: that would double the
// prefix). No tenant or user ID anywhere: the gateway injects the caller's identity.
import type { DelegationPort } from '../../domain/repositories/DelegationPort'
import { toDelegation, toDelegationCreateBody, toDelegationExtended, toDelegationPolicy, toDelegations, toExtendBody, toReassignBody } from './mappers'
import { withSignal, type ApiScope } from './scope'

export function createDelegationAdapter(scope: ApiScope): DelegationPort {
  const { client } = scope
  const sig = withSignal
  return {
    async list(signal) {
      const res = await client.get('/v1/delegations', sig(signal))
      return toDelegations(res.data)
    },
    async create(request, idempotencyKey, signal) {
      // The key is the caller's, kept across retries of one submission: a repeat within 24 h returns the original 201.
      const res = await client.post('/v1/delegations', { body: toDelegationCreateBody(request), idempotencyKey, ...sig(signal) })
      return toDelegation(res.data)
    },
    async cancel(delegationId, recordVersion, signal) {
      await client.delete('/v1/delegations/:id', { params: { id: delegationId }, query: { record_version: recordVersion }, ...sig(signal) })
    },
    async extend(delegationId, request, signal) {
      const res = await client.post('/v1/delegations/:id/extend', { params: { id: delegationId }, body: toExtendBody(request), ...sig(signal) })
      return toDelegationExtended(res.data)
    },
    async reassign(delegationId, request, signal) {
      const res = await client.post('/v1/delegations/:id/reassign', { params: { id: delegationId }, body: toReassignBody(request), ...sig(signal) })
      return toDelegation(res.data)
    },
    async getPolicy(signal) {
      const res = await client.get('/v1/delegations/settings', sig(signal))
      return toDelegationPolicy(res.data)
    },
  }
}

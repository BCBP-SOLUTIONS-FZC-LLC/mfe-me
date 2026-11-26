import type { Delegation, DelegationCreate, DelegationExtend, DelegationExtended, DelegationPolicy, DelegationReassign } from '../entities/delegation'
import type { RecordVersion } from '../value-objects/RecordVersion'

/**
 * Delegation (IAM), DLG-1 to DLG-6 (DLG-7, setting the policy, is admin and lives in `mfe-admin`). The
 * adapter uses `/v1/delegations…`: the Swagger paths already carry `/api/v1` and the SDK client adds `/api`.
 */
export interface DelegationPort {
  /** DLG-1: my active delegations as delegator. */
  list(signal?: AbortSignal): Promise<readonly Delegation[]>
  /** DLG-2: `idempotencyKey` is sent as `Idempotency-Key`; a repeat within 24 h returns the original answer. */
  create(request: DelegationCreate, idempotencyKey: string, signal?: AbortSignal): Promise<Delegation>
  /** DLG-3: `record_version` travels as a query parameter. The service answers the ended delegation; the caller re-reads the list. */
  cancel(delegationId: string, recordVersion: RecordVersion, signal?: AbortSignal): Promise<void>
  /** DLG-4: answers the new version and review date only; the caller re-reads the list. */
  extend(delegationId: string, request: DelegationExtend, signal?: AbortSignal): Promise<DelegationExtended>
  /** DLG-5: ends the current delegation, then creates the new one. */
  reassign(delegationId: string, request: DelegationReassign, signal?: AbortSignal): Promise<Delegation>
  /** DLG-6 */
  getPolicy(signal?: AbortSignal): Promise<DelegationPolicy>
}

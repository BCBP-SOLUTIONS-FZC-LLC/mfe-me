import type { Instant } from '../value-objects/Instant'
import type { RecordVersion } from '../value-objects/RecordVersion'
import type { DelegationScope, DelegationStatus } from '../vocabulary'

/**
 * One of my delegations (DLG-1 returns the caller's own active ones as delegator). There is no
 * `ended_reason`, `ooo_note` or `created_at` in `DelegationResponse` (LLD §15 #5).
 */
export interface Delegation {
  readonly delegationId: string
  readonly delegatorId: string
  readonly delegateId: string
  readonly scope: DelegationScope
  /** The department for a department scope. */
  readonly scopeId?: string
  readonly startsAt?: Instant
  /** Absent = open-ended: reviewed every `reviewWindowDays`. */
  readonly endsAt?: Instant
  readonly reviewDueAt?: Instant
  readonly reviewWindowDays?: number
  readonly status: DelegationStatus
  readonly recordVersion: RecordVersion
}

/** The tenant's delegation policy (DLG-6): read-only here. Defaults 90 / 90. */
export interface DelegationPolicy {
  readonly maxDurationDays: number
  readonly reviewWindowDays: number
}

/** The body of DLG-2. `startsAt` absent means "now"; `endsAt` absent means open-ended. */
export interface DelegationCreate {
  readonly delegateId: string
  readonly scope: DelegationScope
  readonly scopeId?: string
  readonly startsAt?: Instant
  readonly endsAt?: Instant
  readonly note?: string
}

/** The body of DLG-4: push the review date forward. */
export interface DelegationExtend {
  readonly extendDays: number
  readonly recordVersion: RecordVersion
}

/** What DLG-4 answers: only the new version and review date, not the whole delegation (`DelegationExtendResponse`). */
export interface DelegationExtended {
  readonly delegationId: string
  readonly recordVersion: RecordVersion
  readonly reviewDueAt?: Instant
}

/** The body of DLG-5: only what changed (the new delegation starts now), the reason, and the version being replaced. */
export interface DelegationReassign {
  readonly newDelegateId?: string
  readonly scope?: DelegationScope
  readonly scopeId?: string
  readonly endsAt?: Instant
  readonly reason?: string
  readonly recordVersion: RecordVersion
}

/** What a delegation covers, for display: the screens turn it into a catalogue message and a department name. */
export type DelegationTarget =
  | { readonly kind: 'all' }
  | { readonly kind: 'department'; readonly departmentId: string | undefined }
  | { readonly kind: 'tender'; readonly tenderId: string | undefined }

import type { Instant } from '../value-objects/Instant'
import type { RecordVersion } from '../value-objects/RecordVersion'
import type { Availability as AvailabilityCode } from '../vocabulary'

/** My availability (`GET /users/:id/availability`). */
export interface Availability {
  readonly status: AvailabilityCode
  readonly oooFrom?: Instant
  readonly oooUntil?: Instant
  readonly note?: string
  /** Set by Delegation, never here (LLD §7.4): read-only. */
  readonly delegateUserId?: string
  readonly recordVersion: RecordVersion
  readonly updatedAt?: Instant
}

/** The body of `PUT /users/:id/availability`. It never carries `delegate_user_id`. */
export interface AvailabilityUpdate {
  readonly status: AvailabilityCode
  readonly oooFrom?: Instant
  readonly oooUntil?: Instant
  readonly note: string
  readonly expectedVersion: RecordVersion
}

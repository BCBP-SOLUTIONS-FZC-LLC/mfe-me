import type { E164Phone } from '../value-objects/E164Phone'
import type { IanaTimeZone } from '../value-objects/IanaTimeZone'
import type { Instant } from '../value-objects/Instant'
import type { LocaleTag } from '../value-objects/LocaleTag'
import type { RecordVersion } from '../value-objects/RecordVersion'
import type { Availability as AvailabilityCode, UserSource, UserStatus } from '../vocabulary'

/**
 * Professional credentials: key → value. The Swagger types both the request and the answer as
 * `additionalProperties: string` (the LLD's `string[]` was wrong; implementation-notes.md). At most 32 keys,
 * a key up to 64 characters, a value up to 64 of letters, digits, `- / ( ) .` and space. A key is removed
 * by listing it in `delete_credentials`.
 */
export type Credentials = Readonly<Record<string, string>>

/** The availability inside a profile answer: no version of its own (`AvailabilityResp`). */
export interface EmbeddedAvailability {
  readonly status: AvailabilityCode
  readonly oooFrom?: Instant
  readonly oooUntil?: Instant
  readonly note?: string
  readonly delegateUserId?: string
}

/** My profile (`GET /users/:id`). There is no avatar and no signature field in the answer (LLD §15 #4, #21). */
export interface MyProfile {
  readonly userId: string
  readonly displayName: string
  /** The name was edited here and no longer follows the company directory (IAM-UX-11). */
  readonly displayNameOverridden: boolean
  readonly jobTitle: string
  readonly jobTitleOverridden: boolean
  /** Read-only: it comes from sign-in. */
  readonly email: string
  /** E.164 or ''. Returned to me and to admins only. */
  readonly phone: E164Phone | ''
  readonly timezone: IanaTimeZone | string
  readonly locale: LocaleTag | string
  readonly credentials: Credentials
  readonly source: UserSource
  readonly status: UserStatus
  readonly provisional: boolean
  readonly availability?: EmbeddedAvailability
  readonly recordVersion: RecordVersion
  readonly updatedAt?: Instant
}

/** Another user as a chip or picker row shows them: from `POST /users:batch` (IAM-UX-4). */
export interface UserSummary {
  readonly userId: string
  readonly displayName: string
  readonly email: string
  readonly jobTitle?: string
  readonly status: UserStatus
  readonly availability?: AvailabilityCode
  readonly provisional: boolean
  readonly recordVersion: RecordVersion
}

/** The answer to a batch lookup: the profiles found, and the IDs with no profile ("Unknown user"). */
export interface UserBatch {
  readonly users: readonly UserSummary[]
  readonly missing: readonly string[]
}

/** What the changed fields of a profile edit are: the body of `PATCH /users/:id`, in camelCase. */
export interface ProfilePatch {
  readonly displayName?: string
  readonly displayNameOverridden?: boolean
  readonly jobTitle?: string
  readonly jobTitleOverridden?: boolean
  readonly phone?: E164Phone | ''
  readonly timezone?: string
  readonly locale?: string
  /** Keys added or changed. */
  readonly credentials?: Credentials
  /** Keys removed. */
  readonly deleteCredentials?: readonly string[]
  readonly expectedVersion: RecordVersion
}

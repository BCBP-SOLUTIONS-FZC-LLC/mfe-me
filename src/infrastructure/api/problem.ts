// What a failed IAM call means for this remote (LLD §11, spec §9): which metric outcome it is, whether
// a query may be retried, and which catalogue message names it. The SDK parses the response
// (ProblemError, NetworkError, TimeoutError) and knows the gateway's deny codes; this only adds these
// screens' reading of them. A server's `detail` text is never the main message. Error codes are
// compared case-insensitively (the Delegation Swagger writes them lower case).
import { AbortedError, gatewayDenyCode, isProblemError, toFieldErrorMap } from '@bcbp-solutions-fzc-llc/frontend-sdk/problem'
import type { ProblemReader } from '../../application/ports/problems'
import type { ActionOutcome } from '../../domain/events/me-events'

/**
 * The metric outcome of a failed write (registry vocabulary): `failure` is a rejection for a reason
 * (every 4xx: a rule, a conflict, a limit, a missing permission), `error` is a fault (5xx, no
 * response, a client timeout). Undefined when the caller aborted: that is not a failure at all.
 */
export function outcomeOf(error: unknown): Exclude<ActionOutcome, 'success'> | undefined {
  if (error instanceof AbortedError || (error instanceof DOMException && error.name === 'AbortError')) return undefined
  if (isProblemError(error)) return error.status >= 400 && error.status < 500 ? 'failure' : 'error'
  return 'error'
}

/** A load only succeeds or errors: the outcome of a failed load. Undefined when aborted. */
export function loadOutcomeOf(error: unknown): 'error' | undefined {
  return outcomeOf(error) === undefined ? undefined : 'error'
}

const NOTHING_CHANGED = 'errors.unavailable'

/** errorCode (UPPER_SNAKE; compared case-insensitively) → catalogue key. */
const MESSAGE_KEYS: Readonly<Record<string, string>> = {
  VERSION_CONFLICT: 'errors.conflict',
  OPTIMISTIC_LOCK_CONFLICT: 'errors.conflict',
  SIGNATURE_ERASURE_PENDING: 'errors.signatureErasurePending',
  INVALID_OOO_WINDOW: 'errors.invalidOooWindow',
  OOO_WINDOW_CONFLICT: 'errors.oooWindowConflict',
  UNKNOWN_MODEL: 'errors.unknownModel',
  SELF_DELEGATION: 'errors.selfDelegation',
  INVALID_DELEGATE: 'errors.invalidDelegate',
  DELEGATE_UNAVAILABLE: 'errors.delegateUnavailable',
  SCOPE_ID_REQUIRED: 'errors.scopeIdRequired',
  INVALID_SCOPE_ID: 'errors.invalidScopeId',
  INVALID_DELEGATION_SCOPE: 'errors.invalidScopeId',
  DELEGATION_WINDOW_INVERTED: 'errors.windowInverted',
  DELEGATION_WINDOW_TOO_LONG: 'errors.windowTooLong',
  DELEGATION_START_IN_PAST: 'errors.startInPast',
  DELEGATION_START_TOO_FAR_FUTURE: 'errors.startTooFar',
  REASON_TOO_LONG: 'errors.noteTooLong',
  IDEMPOTENCY_KEY_REUSED: 'errors.generic',
  IDEMPOTENCY_KEY_IN_FLIGHT: 'errors.stillSaving',
  NOT_REVIEW_TRACKED: 'errors.notReviewTracked',
  EXTEND_DAYS_OUT_OF_RANGE: 'errors.extendDaysOutOfRange',
  ORG_MEMBERSHIP_UNAVAILABLE: NOTHING_CHANGED,
  USER_PROFILE_UNAVAILABLE: NOTHING_CHANGED,
  CATALOG_ADMIN_UNAVAILABLE: NOTHING_CHANGED,
  DB_UNAVAILABLE: NOTHING_CHANGED,
  DENY_ROLE_INSUFFICIENT: 'errors.noPermission',
  DENY_TENANT_READ_ONLY: 'errors.readOnly',
  DENY_MFA_STALE: 'errors.mfaStale',
  DENY_SERVICE_UNAVAILABLE: 'errors.accessCheckUnavailable',
  DENY_MEMBER_SUSPENDED: 'errors.memberSuspended',
  DENY_UNRESOLVABLE_SUBJECT: 'errors.notAMember',
}

/** Whole-status messages for a `4xx` that has no code of its own (the signature confirm answers `413` and `422`). */
const STATUS_KEYS: Readonly<Record<number, string>> = { 413: 'errors.fileTooLarge' }

/**
 * The catalogue key for a known problem, or undefined: the caller then uses the SDK's
 * `problemMessage(error)` (a generic, translated sentence for the status). Gateway deny codes are
 * recognised through the SDK's own list.
 */
export function problemMessageKey(error: unknown): string | undefined {
  if (!isProblemError(error)) return undefined
  const code = (gatewayDenyCode(error) ?? error.errorCode)?.toUpperCase()
  return (code ? MESSAGE_KEYS[code] : undefined) ?? STATUS_KEYS[error.status]
}

/** Whether a failed call needs the user to confirm MFA again before it can run. */
export function isMfaStale(error: unknown): boolean {
  return isProblemError(error) && gatewayDenyCode(error) === 'DENY_MFA_STALE'
}

/** Whether the gateway refused because the workspace is read-only (LLD §7.10). */
export function isReadOnlyDenied(error: unknown): boolean {
  return isProblemError(error) && gatewayDenyCode(error) === 'DENY_TENANT_READ_ONLY'
}

/** Whether a failed write lost an optimistic-lock race (`409 VERSION_CONFLICT` or `OPTIMISTIC_LOCK_CONFLICT`, IAM-UX-9): offer Reload, never retry. */
export function isConflict(error: unknown): boolean {
  const code = isProblemError(error) ? error.errorCode?.toUpperCase() : undefined
  return code === 'OPTIMISTIC_LOCK_CONFLICT' || code === 'VERSION_CONFLICT'
}

/** The conflict's current version, from the problem body's `record_version` extension (IAM-UX-9). */
export function currentRecordVersion(error: unknown): number | undefined {
  if (!isProblemError(error)) return undefined
  const v = error.extensions['record_version']
  return typeof v === 'number' ? v : undefined
}

/** `validationErrors[]` grouped by field path; empty for anything that is not a problem with field errors. */
export function fieldErrors(error: unknown): Readonly<Record<string, readonly string[]>> {
  return isProblemError(error) && error.validationErrors?.length ? toFieldErrorMap(error) : {}
}

/** The ProblemReader port over this module's functions: what the feature hooks and screens see. */
export const problemReader: ProblemReader = {
  outcomeOf,
  loadOutcomeOf,
  isConflict,
  currentRecordVersion,
  isMfaStale,
  isReadOnlyDenied,
  messageKey: problemMessageKey,
  fieldErrors,
  traceId: (error) => (isProblemError(error) ? error.traceId : undefined),
}

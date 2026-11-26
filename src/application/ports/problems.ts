// How a failed call is read: the outcome a metric records, whether a reload is called for, which field
// a validation error names, and the catalogue message for it. The implementation knows the SDK's error
// classes (infrastructure/api/problem.ts); the feature hooks and screens only see this port.
import type { ActionOutcome } from '../../domain/events/me-events'

export interface ProblemReader {
  /** The metric outcome of a failed write; undefined when the caller aborted (not a failure at all). */
  outcomeOf(error: unknown): Exclude<ActionOutcome, 'success'> | undefined
  /** A failed load is always `error`; undefined when aborted (a superseded load is not counted). */
  loadOutcomeOf(error: unknown): 'error' | undefined
  /** A lost optimistic-lock race (409): offer Reload, never retry. */
  isConflict(error: unknown): boolean
  /** The version the service says is current, from a conflict's `record_version`. */
  currentRecordVersion(error: unknown): number | undefined
  /** The gateway wants fresh MFA first (not expected on these routes, LLD §11). */
  isMfaStale(error: unknown): boolean
  /** The workspace is read-only (`403 DENY_TENANT_READ_ONLY`): the page switches to read-only mode. */
  isReadOnlyDenied(error: unknown): boolean
  /** The catalogue key for a known problem, or undefined (use the SDK's generic sentence). */
  messageKey(error: unknown): string | undefined
  /** `422` field errors: the wire field path → messages, for mapping onto a form. Empty for any other answer. */
  fieldErrors(error: unknown): Readonly<Record<string, readonly string[]>>
  /** The trace ID to quote to support. */
  traceId(error: unknown): string | undefined
}

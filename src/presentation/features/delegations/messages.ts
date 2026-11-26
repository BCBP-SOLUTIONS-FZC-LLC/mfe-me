// The catalogue key for each refusal the delegation rules can make (LLD §6.3, §11).
import type { DelegationFailure, ExtendFailure, ReassignFailure } from '../../../domain/rules/me-rules'

export const DELEGATION_FAILURE_KEYS = {
  'delegate-required': 'delegations.err.delegateRequired',
  'self-delegation': 'errors.selfDelegation',
  'scope-invalid': 'delegations.err.scopeInvalid',
  'scope-id-required': 'errors.scopeIdRequired',
  'scope-not-mine': 'delegations.err.scopeNotMine',
  'start-in-past': 'errors.startInPast',
  'window-inverted': 'errors.windowInverted',
  'window-too-long': 'errors.windowTooLong',
  'note-too-long': 'errors.noteTooLong',
} as const satisfies Record<DelegationFailure, string>

export const REASSIGN_FAILURE_KEYS = {
  ...DELEGATION_FAILURE_KEYS,
  'reason-too-long': 'errors.noteTooLong',
  'no-change': 'delegations.err.noChange',
} as const satisfies Record<ReassignFailure | DelegationFailure, string>

export const EXTEND_FAILURE_KEYS = {
  'not-review-tracked': 'errors.notReviewTracked',
  'days-out-of-range': 'errors.extendDaysOutOfRange',
} as const satisfies Record<ExtendFailure, string>

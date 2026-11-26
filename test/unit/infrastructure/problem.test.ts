import { AbortedError, NetworkError, ProblemError, TimeoutError } from '@bcbp-solutions-fzc-llc/frontend-sdk/problem'
import { describe, expect, it } from '@rstest/core'
import {
  currentRecordVersion,
  fieldErrors,
  isConflict,
  isMfaStale,
  isReadOnlyDenied,
  loadOutcomeOf,
  outcomeOf,
  problemMessageKey,
  problemReader,
} from '../../../src/infrastructure/api/problem'

const problem = (status: number, errorCode?: string, more: Record<string, unknown> = {}) =>
  new ProblemError({ type: 'about:blank', title: 't', status, ...(errorCode ? { errorCode } : {}), extensions: {}, ...more } as never)

describe('outcomeOf', () => {
  it('is failure for a 4xx and error for a 5xx, a network fault or a timeout', () => {
    expect(outcomeOf(problem(422))).toBe('failure')
    expect(outcomeOf(problem(409))).toBe('failure')
    expect(outcomeOf(problem(503))).toBe('error')
    expect(outcomeOf(new NetworkError(false, 'r'))).toBe('error')
    expect(outcomeOf(new TimeoutError(100, 'r'))).toBe('error')
    expect(outcomeOf(new Error('boom'))).toBe('error')
  })
  it('is undefined for an abort: not a failure at all', () => {
    expect(outcomeOf(new AbortedError())).toBeUndefined()
    expect(outcomeOf(new DOMException('x', 'AbortError'))).toBeUndefined()
    expect(loadOutcomeOf(new AbortedError())).toBeUndefined()
  })
  it('counts every failed load as error', () => {
    expect(loadOutcomeOf(problem(404))).toBe('error')
  })
})

describe('problemMessageKey', () => {
  it.each([
    ['VERSION_CONFLICT', 'errors.conflict'],
    ['optimistic_lock_conflict', 'errors.conflict'],
    ['signature_erasure_pending', 'errors.signatureErasurePending'],
    ['self_delegation', 'errors.selfDelegation'],
    ['IDEMPOTENCY_KEY_IN_FLIGHT', 'errors.stillSaving'],
    ['ORG_MEMBERSHIP_UNAVAILABLE', 'errors.unavailable'],
    ['DENY_TENANT_READ_ONLY', 'errors.readOnly'],
  ])('%s → %s (case-insensitive)', (code, key) => {
    expect(problemMessageKey(problem(409, code))).toBe(key)
  })
  it('names a 413 even without a code, and nothing for an unknown code or a non-problem', () => {
    expect(problemMessageKey(problem(413))).toBe('errors.fileTooLarge')
    expect(problemMessageKey(problem(422, 'SOMETHING_NEW'))).toBeUndefined()
    expect(problemMessageKey(new Error('x'))).toBeUndefined()
  })
})

describe('conflict, read-only and MFA', () => {
  it('reads a conflict and the current version from the problem body', () => {
    const conflict = problem(409, 'VERSION_CONFLICT', { extensions: { record_version: 7 } })
    expect(isConflict(conflict)).toBe(true)
    expect(currentRecordVersion(conflict)).toBe(7)
    expect(isConflict(problem(409, 'OOO_WINDOW_CONFLICT'))).toBe(false)
    expect(currentRecordVersion(problem(409, 'VERSION_CONFLICT'))).toBeUndefined()
    expect(currentRecordVersion(new Error('x'))).toBeUndefined()
  })
  it('recognises the gateway denials by their code', () => {
    expect(isReadOnlyDenied(problem(403, 'DENY_TENANT_READ_ONLY'))).toBe(true)
    expect(isReadOnlyDenied(problem(403, 'DENY_ROLE_INSUFFICIENT'))).toBe(false)
    expect(isMfaStale(problem(403, 'DENY_MFA_STALE'))).toBe(true)
    expect(isMfaStale(new Error('x'))).toBe(false)
  })
})

describe('fieldErrors', () => {
  it('groups validationErrors by field and is empty otherwise', () => {
    const e = problem(422, 'VALIDATION_FAILED', { validationErrors: [{ field: 'phone', message: 'bad' }, { field: 'phone', message: 'worse' }] })
    expect(fieldErrors(e)).toEqual({ phone: ['bad', 'worse'] })
    expect(fieldErrors(problem(422))).toEqual({})
    expect(fieldErrors(new Error('x'))).toEqual({})
  })
})

describe('problemReader', () => {
  it('quotes the trace ID of a problem only', () => {
    expect(problemReader.traceId(problem(500, undefined, { traceId: 'abc' }))).toBe('abc')
    expect(problemReader.traceId(new Error('x'))).toBeUndefined()
  })
})

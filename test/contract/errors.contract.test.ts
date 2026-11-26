// What a failed IAM call looks like through the real SDK client, and what this remote makes of it: the
// problem body is RFC 9457 with an UPPER_SNAKE errorCode (compared case-insensitively), extension members
// survive, and the outcome, the retry rule and the message follow from it (spec §9, LLD §11).
import { NetworkError, isProblemError } from '@bcbp-solutions-fzc-llc/frontend-sdk/problem'
import { createTestPlatform } from '@bcbp-solutions-fzc-llc/frontend-sdk/testing'
import { afterEach, beforeEach, describe, expect, it, rs } from '@rstest/core'
import { createDelegationAdapter } from '../../src/infrastructure/api/delegation'
import { currentRecordVersion, fieldErrors, isConflict, isReadOnlyDenied, outcomeOf, problemMessageKey } from '../../src/infrastructure/api/problem'
import { createUserProfileAdapter } from '../../src/infrastructure/api/userProfile'
import { recordVersion } from '../../src/domain/value-objects/RecordVersion'
import { client, problemProblems, stubServer, TENANT } from './harness'
import * as f from './fixtures'

const scope = () => ({ client: client(), tenantId: () => TENANT })
const users = () => createUserProfileAdapter(scope())
const delegations = () => createDelegationAdapter(scope())

const TYPES: Record<number, [string, string]> = {
  403: ['forbidden', 'Forbidden'],
  404: ['not-found', 'Not Found'],
  409: ['conflict', 'Conflict'],
  413: ['payload-too-large', 'Payload Too Large'],
  422: ['validation-failed', 'Unprocessable Entity'],
  429: ['rate-limit-exceeded', 'Too Many Requests'],
  503: ['service-unavailable', 'Service Unavailable'],
}
const problemBody = (status: number, errorCode: string, extra: Record<string, unknown> = {}) => ({
  type: `https://errors.company.com/platform/${TYPES[status]![0]}`,
  title: TYPES[status]![1],
  status,
  detail: 'a sentence the service wrote',
  instance: `/api/v1/users/${f.ME}`,
  traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
  errorCode,
  timestamp: '2026-11-25T10:45:22Z',
  ...extra,
})

beforeEach(() => {
  createTestPlatform()
})
afterEach(() => {
  rs.unstubAllGlobals()
})

async function failure(call: () => Promise<unknown>): Promise<unknown> {
  try {
    await call()
  } catch (e) {
    return e
  }
  throw new Error('the call should have failed')
}

describe('a rejected profile write', () => {
  it('409 VERSION_CONFLICT: the conflict dialog, the current version from the body, a business failure, not retried', async () => {
    const server = stubServer()
    server.reply(409, problemBody(409, 'VERSION_CONFLICT', { record_version: 4 }))
    const e = await failure(() => users().updateUser(f.ME, { displayName: 'A', expectedVersion: recordVersion(3) }))
    expect(isConflict(e)).toBe(true)
    expect(problemMessageKey(e)).toBe('errors.conflict')
    expect(currentRecordVersion(e)).toBe(4)
    expect(outcomeOf(e)).toBe('failure')
    expect(server.calls).toHaveLength(1)
  })

  it('422 with validationErrors: the fields reach the form', async () => {
    const server = stubServer()
    const body = problemBody(422, 'VALIDATION_FAILED', { validationErrors: [{ field: 'phone', message: 'must be E.164' }] })
    expect(problemProblems('user-profile', body)).toEqual([])
    server.reply(422, body)
    const e = await failure(() => users().updateUser(f.ME, { phone: 'x', expectedVersion: recordVersion(3) }))
    expect(fieldErrors(e)).toEqual({ phone: ['must be E.164'] })
    expect(outcomeOf(e)).toBe('failure')
  })

  it('403 DENY_TENANT_READ_ONLY from the gateway: the read-only message, not a permission one', async () => {
    const server = stubServer()
    server.reply(403, problemBody(403, 'DENY_TENANT_READ_ONLY'))
    const e = await failure(() => users().putAvailability(f.ME, { status: 'busy', note: '', expectedVersion: recordVersion(2) }))
    expect(isReadOnlyDenied(e)).toBe(true)
    expect(problemMessageKey(e)).toBe('errors.readOnly')
  })
})

describe('a rejected availability write', () => {
  it.each([
    [422, 'INVALID_OOO_WINDOW', 'errors.invalidOooWindow'],
    [409, 'OOO_WINDOW_CONFLICT', 'errors.oooWindowConflict'],
  ])('%i %s', async (status, code, key) => {
    const server = stubServer()
    server.reply(status, problemBody(status, code))
    const e = await failure(() => users().putAvailability(f.ME, { status: 'ooo', note: '', expectedVersion: recordVersion(2) }))
    expect(problemMessageKey(e)).toBe(key)
    expect(outcomeOf(e)).toBe('failure')
  })
})

describe('a rejected signature step', () => {
  it('409 SIGNATURE_ERASURE_PENDING on the presign', async () => {
    const server = stubServer()
    server.reply(409, problemBody(409, 'SIGNATURE_ERASURE_PENDING'))
    const e = await failure(() => users().presignSignature(f.ME, { contentType: 'image/png', byteSize: 10 }))
    expect(problemMessageKey(e)).toBe('errors.signatureErasurePending')
  })

  it('429 on the presign: a retryable fault for a query, never retried for a write', async () => {
    const server = stubServer()
    server.reply(429, problemBody(429, 'RATE_LIMITED'))
    const e = await failure(() => users().presignSignature(f.ME, { contentType: 'image/png', byteSize: 10 }))
    expect(isProblemError(e) && e.status).toBe(429)
    expect(server.calls).toHaveLength(1)
  })

  it('413 on the confirm has no code of its own: the message comes from the status', async () => {
    const server = stubServer()
    server.reply(413, problemBody(413, 'PAYLOAD_TOO_LARGE'))
    const e = await failure(() => users().confirmSignature(f.ME, { objectKey: 'k', sha256: 'a'.repeat(64) }))
    expect(problemMessageKey(e)).toBe('errors.fileTooLarge')
  })
})

describe('a rejected delegation write (the Swagger writes the codes in lower case)', () => {
  it.each([
    [422, 'self_delegation', 'errors.selfDelegation'],
    [422, 'invalid_delegate', 'errors.invalidDelegate'],
    [422, 'delegate_unavailable', 'errors.delegateUnavailable'],
    [422, 'scope_id_required', 'errors.scopeIdRequired'],
    [422, 'invalid_scope_id', 'errors.invalidScopeId'],
    [422, 'idempotency_key_reused', 'errors.generic'],
    [409, 'idempotency_key_in_flight', 'errors.stillSaving'],
    [503, 'org_membership_unavailable', 'errors.unavailable'],
    [503, 'user_profile_unavailable', 'errors.unavailable'],
    [503, 'catalog_admin_unavailable', 'errors.unavailable'],
  ])('%i %s', async (status, code, key) => {
    const server = stubServer()
    server.reply(status, problemBody(status, code))
    const e = await failure(() => delegations().create({ delegateId: f.OTHER, scope: 'all' }, 'k'))
    expect(problemMessageKey(e)).toBe(key)
    expect(outcomeOf(e)).toBe(status >= 500 ? 'error' : 'failure')
    expect(server.calls).toHaveLength(1)
  })

  it('409 optimistic_lock_conflict on a cancel, an extend and a reassign', async () => {
    for (const run of [
      () => delegations().cancel(f.DLG, recordVersion(1)),
      () => delegations().extend(f.DLG, { extendDays: 5, recordVersion: recordVersion(1) }),
      () => delegations().reassign(f.DLG, { newDelegateId: f.OTHER, recordVersion: recordVersion(1) }),
    ]) {
      stubServer().reply(409, problemBody(409, 'optimistic_lock_conflict', { record_version: 6 }))
      const e = await failure(run)
      expect(isConflict(e)).toBe(true)
      expect(currentRecordVersion(e)).toBe(6)
    }
  })

  it('422 not_review_tracked and extend_days_out_of_range on an extend', async () => {
    for (const [code, key] of [['not_review_tracked', 'errors.notReviewTracked'], ['extend_days_out_of_range', 'errors.extendDaysOutOfRange']] as const) {
      stubServer().reply(422, problemBody(422, code))
      const e = await failure(() => delegations().extend(f.DLG, { extendDays: 999, recordVersion: recordVersion(1) }))
      expect(problemMessageKey(e)).toBe(key)
    }
  })
})

describe('no response at all (offline)', () => {
  it('is a fault the user can retry, with no message of its own', async () => {
    rs.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch')
    })
    const e = await failure(() => users().getUser(f.ME))
    expect(e).toBeInstanceOf(NetworkError)
    expect(outcomeOf(e)).toBe('error')
    expect(problemMessageKey(e)).toBeUndefined()
  })
})

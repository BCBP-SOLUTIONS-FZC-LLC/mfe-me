// The mappers read what the services send and refuse what the screens cannot work with: a field they
// depend on that is missing or the wrong type is a MappingError, never a half-read value.
import { describe, expect, it } from '@rstest/core'
import {
  toAvailability,
  toAvailabilityBody,
  toDelegation,
  toDelegationCreateBody,
  toDelegationExtended,
  toDelegationPolicy,
  toDelegations,
  toLlmPreferences,
  toMemberPage,
  toMyProfile,
  toNotificationPreferences,
  toPresignedUpload,
  toProfilePatchBody,
  toReassignBody,
  toRoleLabels,
  toSignatureConfirmation,
  toTenantDepartments,
  toUserBatch,
  toUserSummary,
} from '../../../src/infrastructure/api/mappers'
import { MappingError } from '../../../src/infrastructure/api/readers'
import { recordVersion } from '../../../src/domain/value-objects/RecordVersion'
import * as f from '../../contract/fixtures'

const bad = (run: () => unknown) => expect(run).toThrow(MappingError)

describe('profile', () => {
  it('reads the optional fields as empty or false when the service omits them', () => {
    const p = toMyProfile(f.userResponseMinimal)
    expect(p).toMatchObject({ jobTitle: '', phone: '', timezone: '', locale: '', credentials: {}, displayNameOverridden: false, provisional: false })
    expect(p.availability).toBeUndefined()
  })
  it('keeps a stored phone that is not E.164 as it came', () => {
    expect(toMyProfile({ ...f.userResponseMinimal, phone: 'ext. 12' }).phone).toBe('ext. 12')
  })
  it('keeps only string credential values, and treats null credentials as none', () => {
    expect(toMyProfile({ ...f.userResponseMinimal, credentials: { a: '1', b: 2 } }).credentials).toEqual({ a: '1' })
    expect(toMyProfile({ ...f.userResponseMinimal, credentials: null }).credentials).toEqual({})
  })
  it('drops an availability with a status it does not know, and a date that is not a date', () => {
    expect(toMyProfile({ ...f.userResponseMinimal, availability: { status: 'away' } }).availability).toBeUndefined()
    expect(toMyProfile({ ...f.userResponseMinimal, availability: { status: 'ooo', ooo_from: 'soon' } }).availability).toEqual({ status: 'ooo' })
    expect(toMyProfile({ ...f.userResponseMinimal, availability: null }).availability).toBeUndefined()
  })
  it('fails on a missing name, an unknown source or status, or a bad version', () => {
    bad(() => toMyProfile({ ...f.userResponseMinimal, display_name: undefined }))
    bad(() => toMyProfile({ ...f.userResponseMinimal, source: 'ldap' }))
    bad(() => toMyProfile({ ...f.userResponseMinimal, status: 'gone' }))
    bad(() => toMyProfile({ ...f.userResponseMinimal, record_version: -1 }))
    bad(() => toMyProfile({ ...f.userResponseMinimal, record_version: 'x' }))
    bad(() => toMyProfile(null))
    bad(() => toMyProfile([]))
  })
  it('a summary carries the availability status and no more', () => {
    expect(toUserSummary({ ...f.userResponseMinimal, job_title: 'Eng', availability: { status: 'busy', note: 'x' } })).toMatchObject({ jobTitle: 'Eng', availability: 'busy' })
  })
  it('a batch fails on a missing ID that is not a string, and tolerates null lists', () => {
    bad(() => toUserBatch({ users: [], missing: [5] }))
    expect(toUserBatch({})).toEqual({ users: [], missing: [] })
  })
  it('writes only the fields it is given, and the version', () => {
    expect(toProfilePatchBody({ expectedVersion: recordVersion(2) })).toEqual({ expected_version: 2 })
  })
})

describe('availability', () => {
  it('reads a minimal answer and fails on an unknown status', () => {
    expect(toAvailability({ status: 'available', record_version: 1 })).toEqual({ status: 'available', recordVersion: 1 })
    bad(() => toAvailability({ status: 'away', record_version: 1 }))
  })
  it('writes no window for a status that has none', () => {
    expect(toAvailabilityBody({ status: 'busy', note: '', expectedVersion: recordVersion(1) })).toEqual({ status: 'busy', note: '', expected_version: 1 })
  })
})

describe('preferences', () => {
  it('reads llm preferences with null lists as empty, and fails on an unknown tone', () => {
    expect(toLlmPreferences({ preferred_model: 'm', writing_tone: 'formal', templates: null, record_version: 1 })).toMatchObject({ templates: [], contextDocuments: [] })
    bad(() => toLlmPreferences({ preferred_model: 'm', writing_tone: 'rude', record_version: 1 }))
    bad(() => toLlmPreferences({ preferred_model: 'm', writing_tone: 'formal', templates: [1], record_version: 1 }))
  })
  it('reads notification preferences with null channels as none, and fails on an unknown urgency', () => {
    expect(toNotificationPreferences({ preferences: [{ event_type: 'a', channels: null, urgency_threshold: 'high' }] })).toEqual([{ eventType: 'a', channels: [], urgencyThreshold: 'high' }])
    expect(toNotificationPreferences({})).toEqual([])
    bad(() => toNotificationPreferences({ preferences: [{ event_type: 'a', channels: [], urgency_threshold: 'asap' }] }))
  })
})

describe('signature', () => {
  it('a presign answer needs all three fields', () => {
    bad(() => toPresignedUpload({ upload_url: 'u', object_key: 'k' }, 'image/png'))
  })
  it('201 is created and any other success is a replacement', () => {
    const body = { signature_image_hash: 'h', signature_key: 'k' }
    expect(toSignatureConfirmation(body, 201).outcome).toBe('created')
    expect(toSignatureConfirmation(body, 200).outcome).toBe('replaced')
    bad(() => toSignatureConfirmation({ signature_key: 'k' }, 200))
  })
})

describe('delegation', () => {
  const minimal = { delegation_id: 'd', delegator_id: 'a', delegate_id: 'b', scope: 'all', status: 'active', record_version: 1 }
  it('reads a delegation with nothing optional, and a null list as empty', () => {
    expect(toDelegation(minimal)).toEqual({ delegationId: 'd', delegatorId: 'a', delegateId: 'b', scope: 'all', status: 'active', recordVersion: 1 })
    expect(toDelegations({})).toEqual([])
  })
  it('fails on a scope or status it does not know (the Swagger leaves them free; LLD §15 #6), or a missing ID', () => {
    bad(() => toDelegation({ ...minimal, scope: 'galaxy' }))
    bad(() => toDelegation({ ...minimal, status: 'paused' }))
    bad(() => toDelegation({ ...minimal, delegate_id: undefined }))
  })
  it('writes only what is set: no empty note, no scope ID for all, the dates as UTC', () => {
    expect(toDelegationCreateBody({ delegateId: 'b', scope: 'all', note: '' })).toEqual({ delegate_id: 'b', scope: 'all' })
    expect(toReassignBody({ recordVersion: recordVersion(3) })).toEqual({ record_version: 3 })
  })
  it('reads the extend answer and the policy', () => {
    expect(toDelegationExtended({ delegation_id: 'd', record_version: 2 })).toEqual({ delegationId: 'd', recordVersion: 2 })
    bad(() => toDelegationExtended({ record_version: 2 }))
    bad(() => toDelegationPolicy({ max_duration_days: 90 }))
  })
})

describe('directory', () => {
  it('reads a member page with no next cursor, and fails on an unknown status', () => {
    expect(toMemberPage({ items: [{ user_id: 'u', status: 'active' }], next_cursor: '' })).toEqual({ members: [{ userId: 'u', status: 'active' }] })
    bad(() => toMemberPage({ items: [{ user_id: 'u', status: 'gone' }] }))
  })
  it('reads departments and labels, with a null list as empty, and fails on a level it does not know', () => {
    expect(toTenantDepartments({ items: null })).toEqual([])
    expect(toRoleLabels({})).toEqual([])
    bad(() => toRoleLabels({ items: [{ role_code: 'boss', display_name: 'x', record_version: 1 }] }))
    bad(() => toTenantDepartments({ items: [{ department_id: 'd', code: 'c', name: 'n', is_active: 'yes', record_version: 1 }] }))
  })
})

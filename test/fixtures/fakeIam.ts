// An in-memory IAM behind the repository ports, for page tests: real optimistic locking (a stale version is
// a 409 VERSION_CONFLICT), the lists a screen reads, a record of every call, and failures a test can queue per
// method. The fetch-level fake for the end-to-end flows is built in step 6; this is one layer up.
import { ProblemError } from '@bcbp-solutions-fzc-llc/frontend-sdk/problem'
import type { Availability, AvailabilityUpdate } from '../../src/domain/entities/availability'
import type { Delegation, DelegationCreate, DelegationExtend, DelegationReassign } from '../../src/domain/entities/delegation'
import type { MemberRef, RoleLabel, TenantDepartment } from '../../src/domain/entities/directory'
import type { LlmPreferences, LlmPreferencesUpdate, NotificationPreference } from '../../src/domain/entities/preferences'
import type { MyProfile, ProfilePatch, UserSummary } from '../../src/domain/entities/profile'
import type { PresignedUpload } from '../../src/domain/entities/signature'
import type { DelegationPort } from '../../src/domain/repositories/DelegationPort'
import type { OrgDirectoryPort } from '../../src/domain/repositories/OrgDirectoryPort'
import type { SignatureStoragePort } from '../../src/domain/repositories/SignatureStoragePort'
import type { UserProfilePort } from '../../src/domain/repositories/UserProfilePort'
import { addDays } from '../../src/domain/value-objects/Instant'
import { parseCursor } from '../../src/domain/value-objects/Cursor'
import { ME, OTHER, DEPT, at, version } from './domain'

export const THIRD = '55555555-5555-4555-8555-555555555555'

export function problem(status: number, errorCode: string, extra: Record<string, unknown> = {}): ProblemError {
  return new ProblemError({ type: 'about:blank', title: 'Problem', status, errorCode, traceId: 'trace-1', extensions: {}, ...extra } as never)
}

const summary = (id: string, name: string, o: Partial<UserSummary> = {}): UserSummary => ({
  userId: id,
  displayName: name,
  email: `${name.split(' ')[0]!.toLowerCase()}@example.com`,
  status: 'active',
  provisional: false,
  recordVersion: version(1),
  ...o,
})

export function createFakeIam() {
  const state = {
    profile: {
      userId: ME,
      displayName: 'Ada Lovelace',
      displayNameOverridden: false,
      jobTitle: 'Engineer',
      jobTitleOverridden: false,
      email: 'ada@example.com',
      phone: '+442071838750',
      timezone: 'Europe/London',
      locale: 'en',
      credentials: { cert: 'AWS-SAA' },
      source: 'local',
      status: 'active',
      provisional: false,
      recordVersion: version(3),
    } as MyProfile,
    availability: { status: 'available', recordVersion: version(2) } as Availability,
    llm: undefined as LlmPreferences | undefined,
    notifications: [] as NotificationPreference[],
    delegations: [] as Delegation[],
    policy: { maxDurationDays: 90, reviewWindowDays: 90 },
    users: new Map<string, UserSummary>([
      [ME, summary(ME, 'Ada Lovelace')],
      [OTHER, summary(OTHER, 'Grace Hopper', { jobTitle: 'Admiral' })],
      [THIRD, summary(THIRD, 'Alan Turing', { availability: 'ooo' })],
    ]),
    members: [
      { userId: ME, status: 'active' },
      { userId: OTHER, status: 'active' },
      { userId: THIRD, status: 'active' },
      { userId: '66666666-6666-4666-8666-666666666666', status: 'suspended' },
    ] as MemberRef[],
    departments: [
      { departmentId: DEPT, code: 'ENG', name: 'Engineering', isActive: true, recordVersion: version(1) },
    ] as TenantDepartment[],
    labels: [{ roleCode: 'approver', displayName: 'Lead approver', recordVersion: version(1) }] as RoleLabel[],
    signature: undefined as { key: string; hash: string } | undefined,
    uploaded: [] as { url: string; bytes: number }[],
    nextDelegation: 1,
    erasurePending: false,
  }
  const calls: string[] = []
  const bodies: Record<string, unknown[]> = {}
  const failures = new Map<string, unknown[]>()
  /** Queue a failure for the next call of `method` (or a function to run on it). */
  const failNext = (method: string, error: unknown) => void failures.set(method, [...(failures.get(method) ?? []), error])
  const gate = (method: string, body?: unknown) => {
    calls.push(method)
    if (body !== undefined) (bodies[method] ??= []).push(body)
    const queued = failures.get(method)
    if (queued?.length) throw queued.shift()
  }
  const conflict = (current: number) => problem(409, 'VERSION_CONFLICT', { extensions: { record_version: current } })
  const check = (expected: number | undefined, current: number) => {
    if (expected !== undefined && expected !== current) throw conflict(current)
  }
  const nameOf = (id: string) => state.users.get(id)?.displayName ?? 'Someone'

  const userProfile: UserProfilePort = {
    async getUser() {
      gate('getUser')
      return structuredClone(state.profile)
    },
    async updateUser(_id, patch: ProfilePatch) {
      gate('updateUser', patch)
      check(patch.expectedVersion, state.profile.recordVersion)
      const { deleteCredentials, credentials, ...rest } = patch
      let creds = { ...state.profile.credentials, ...(credentials ?? {}) }
      for (const k of deleteCredentials ?? []) delete creds[k]
      creds = { ...creds }
      delete (rest as { expectedVersion?: number }).expectedVersion
      state.profile = { ...state.profile, ...rest, credentials: creds, recordVersion: version(state.profile.recordVersion + 1) } as MyProfile
      const known = state.users.get(ME)
      if (known) state.users.set(ME, { ...known, displayName: state.profile.displayName })
      return structuredClone(state.profile)
    },
    async batch(ids) {
      gate('batch', ids)
      return { users: ids.flatMap((i) => state.users.get(i) ?? []), missing: ids.filter((i) => !state.users.has(i)) }
    },
    async getAvailability() {
      gate('getAvailability')
      return structuredClone(state.availability)
    },
    async putAvailability(_id, update: AvailabilityUpdate) {
      gate('putAvailability', update)
      check(update.expectedVersion, state.availability.recordVersion)
      const rest: Omit<AvailabilityUpdate, 'expectedVersion'> & { expectedVersion?: number } = { ...update }
      delete rest.expectedVersion
      state.availability = { ...rest, ...(state.availability.delegateUserId ? { delegateUserId: state.availability.delegateUserId } : {}), recordVersion: version(state.availability.recordVersion + 1) }
      return structuredClone(state.availability)
    },
    async getLlmPreferences() {
      gate('getLlmPreferences')
      return state.llm ? structuredClone(state.llm) : undefined
    },
    async putLlmPreferences(_id, update: LlmPreferencesUpdate) {
      gate('putLlmPreferences', update)
      check(update.expectedVersion, state.llm?.recordVersion ?? 0)
      const rest: Omit<LlmPreferencesUpdate, 'expectedVersion'> & { expectedVersion?: number } = { ...update }
      delete rest.expectedVersion
      state.llm = { ...rest, recordVersion: version((state.llm?.recordVersion ?? 0) + 1) }
      return structuredClone(state.llm)
    },
    async getNotificationPreferences() {
      gate('getNotificationPreferences')
      return structuredClone(state.notifications)
    },
    async putNotificationPreferences(_id, list) {
      gate('putNotificationPreferences', list)
      state.notifications = structuredClone([...list])
      return structuredClone(state.notifications)
    },
    async presignSignature(_id, request) {
      gate('presignSignature', request)
      if (state.erasurePending) throw problem(409, 'SIGNATURE_ERASURE_PENDING')
      return { uploadUrl: 'https://bucket.example/key?sig=SECRET', objectKey: `${ME}/signatures/sig.png`, expiresIn: 300, contentType: request.contentType }
    },
    async confirmSignature(_id, request) {
      gate('confirmSignature', request)
      const replaced = state.signature !== undefined
      state.signature = { key: request.objectKey, hash: request.sha256 }
      return { signatureImageHash: request.sha256, signatureKey: request.objectKey, outcome: replaced ? 'replaced' : 'created' }
    },
    async deleteSignature() {
      gate('deleteSignature')
      state.signature = undefined
      state.erasurePending = true
    },
  }

  const delegation: DelegationPort = {
    async list() {
      gate('delegations.list')
      return structuredClone(state.delegations)
    },
    async create(request: DelegationCreate, key) {
      gate('delegations.create', { request, key })
      if (request.delegateId === ME) throw problem(422, 'self_delegation')
      const d: Delegation = {
        delegationId: `dlg-${state.nextDelegation++}`,
        delegatorId: ME,
        delegateId: request.delegateId,
        scope: request.scope,
        ...(request.scopeId ? { scopeId: request.scopeId } : {}),
        startsAt: request.startsAt ?? at('2026-11-26T10:00:00Z'),
        ...(request.endsAt ? { endsAt: request.endsAt } : { reviewDueAt: addDays(at('2026-11-26T10:00:00Z'), policyDays()), reviewWindowDays: policyDays() }),
        status: 'active',
        recordVersion: version(1),
      }
      state.delegations = [...state.delegations, d]
      state.availability = { ...state.availability, delegateUserId: request.delegateId }
      return structuredClone(d)
    },
    async cancel(id, recordVersion) {
      gate('delegations.cancel', { id, recordVersion })
      const found = state.delegations.find((d) => d.delegationId === id)
      if (found) check(recordVersion, found.recordVersion)
      state.delegations = state.delegations.filter((d) => d.delegationId !== id)
    },
    async extend(id, request: DelegationExtend) {
      gate('delegations.extend', { id, request })
      const found = state.delegations.find((d) => d.delegationId === id)!
      check(request.recordVersion, found.recordVersion)
      const next = { ...found, recordVersion: version(found.recordVersion + 1), reviewDueAt: addDays(found.reviewDueAt ?? at('2026-11-26T10:00:00Z'), request.extendDays) }
      state.delegations = state.delegations.map((d) => (d.delegationId === id ? next : d))
      return { delegationId: id, recordVersion: next.recordVersion, reviewDueAt: next.reviewDueAt }
    },
    async reassign(id, request: DelegationReassign) {
      gate('delegations.reassign', { id, request })
      const found = state.delegations.find((d) => d.delegationId === id)!
      check(request.recordVersion, found.recordVersion)
      const next: Delegation = {
        ...found,
        delegationId: `dlg-${state.nextDelegation++}`,
        ...(request.newDelegateId ? { delegateId: request.newDelegateId } : {}),
        ...(request.scope ? { scope: request.scope } : {}),
        ...(request.scopeId ? { scopeId: request.scopeId } : {}),
        ...(request.endsAt ? { endsAt: request.endsAt } : {}),
        recordVersion: version(1),
      }
      state.delegations = state.delegations.map((d) => (d.delegationId === id ? next : d))
      return structuredClone(next)
    },
    async getPolicy() {
      gate('delegations.getPolicy')
      return state.policy
    },
  }
  const policyDays = () => state.policy.reviewWindowDays

  const orgDirectory: OrgDirectoryPort = {
    async listMembers(page) {
      gate('listMembers', page)
      const start = page.cursor ? Number(page.cursor) : 0
      const size = page.limit ?? 50
      const slice = state.members.slice(start, start + size)
      const next = start + size < state.members.length ? parseCursor(String(start + size)) : undefined
      return { members: slice, ...(next ? { nextCursor: next } : {}) }
    },
    async listDepartments() {
      gate('listDepartments')
      return structuredClone(state.departments)
    },
    async listRoleLabels() {
      gate('listRoleLabels')
      return structuredClone(state.labels)
    },
  }

  const signatureStorage: SignatureStoragePort = {
    async put(upload: PresignedUpload, bytes: Uint8Array) {
      gate('storage.put')
      state.uploaded.push({ url: upload.uploadUrl, bytes: bytes.length })
    },
  }

  return { state, calls, bodies, failNext, nameOf, ports: { userProfile, delegation, orgDirectory, signatureStorage } }
}

export type FakeIam = ReturnType<typeof createFakeIam>

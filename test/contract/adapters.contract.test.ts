// Each adapter against the pinned IAM Swagger (test/contract/swagger/PIN.json): the request it sends exists
// in the Swagger (method, path, declared query and header, a body that validates and carries no unknown
// field), the fixture it is given is a valid answer for that status, and what it returns is the domain value
// the screens expect. LLD §14.
import { createTestPlatform } from '@bcbp-solutions-fzc-llc/frontend-sdk/testing'
import { afterEach, beforeEach, describe, expect, it, rs } from '@rstest/core'
import { createDelegationAdapter } from '../../src/infrastructure/api/delegation'
import { createOrgDirectoryAdapter } from '../../src/infrastructure/api/orgDirectory'
import { createUserProfileAdapter } from '../../src/infrastructure/api/userProfile'
import { parseCursor } from '../../src/domain/value-objects/Cursor'
import { parseInstant } from '../../src/domain/value-objects/Instant'
import { recordVersion } from '../../src/domain/value-objects/RecordVersion'
import { client, conformance, stubServer, TENANT } from './harness'
import * as f from './fixtures'

const scope = () => ({ client: client(), tenantId: () => TENANT })
const rv = recordVersion
const at = (s: string) => parseInstant(s)!

beforeEach(() => {
  createTestPlatform()
})
afterEach(() => {
  rs.unstubAllGlobals()
})

interface Case {
  name: string
  status: number
  answer?: unknown
  call: (a: ReturnType<typeof adapters>) => Promise<unknown>
  /** The request that should have gone out: `METHOD /path` with ids as sent. */
  sent: string
  returns?: unknown
  body?: unknown
  query?: [string, string][]
  headers?: Record<string, string>
}

/** Every `port.method` the cases below called, to prove no adapter method goes untested. */
const called = new Set<string>()

function recorded<P extends object>(name: string, port: P): P {
  return new Proxy(port, {
    get(target, method, receiver) {
      const value = Reflect.get(target, method, receiver)
      return typeof value === 'function' ? (...args: unknown[]) => (called.add(`${name}.${String(method)}`), value.apply(target, args)) : value
    },
  })
}

const makeAdapters = (wrap: <P extends object>(name: string, port: P) => P) => {
  const s = scope()
  return {
    users: wrap('users', createUserProfileAdapter(s)),
    delegation: wrap('delegation', createDelegationAdapter(s)),
    org: wrap('org', createOrgDirectoryAdapter(s)),
  }
}
const adapters = () => makeAdapters(recorded)

const U = `/api/v1/users/${f.ME}`
const D = `/api/v1/delegations/${f.DLG}`
const T = `/api/v1/tenants/${TENANT}`

const profileBody = {
  userId: f.ME,
  displayName: 'Ada Lovelace',
  displayNameOverridden: true,
  jobTitle: 'Engineer',
  jobTitleOverridden: false,
  email: 'ada@example.com',
  phone: '+442071838750',
  timezone: 'Europe/London',
  locale: 'en-GB',
  credentials: { cert: 'AWS-SAA', org: 'BCBP' },
  source: 'federated',
  status: 'active',
  provisional: false,
  availability: { status: 'ooo', oooFrom: at('2026-12-01T00:00:00Z'), oooUntil: at('2026-12-10T00:00:00Z'), note: 'Leave', delegateUserId: f.OTHER },
  recordVersion: rv(3),
  updatedAt: at(f.AT),
}
const ooo = { status: 'ooo', oooFrom: at('2026-12-01T00:00:00Z'), oooUntil: at('2026-12-10T00:00:00Z'), note: 'Leave', delegateUserId: f.OTHER, recordVersion: rv(2), updatedAt: at(f.AT) }
const delegationDomain = {
  delegationId: f.DLG,
  delegatorId: f.ME,
  delegateId: f.OTHER,
  scope: 'department',
  scopeId: f.D1,
  startsAt: at('2026-12-01T00:00:00Z'),
  endsAt: at('2026-12-20T00:00:00Z'),
  status: 'scheduled',
  recordVersion: rv(5),
}
const openEndedDomain = {
  delegationId: f.DLG,
  delegatorId: f.ME,
  delegateId: f.OTHER,
  scope: 'all',
  startsAt: at(f.AT),
  reviewDueAt: at('2027-02-23T10:00:00Z'),
  reviewWindowDays: 90,
  status: 'active',
  recordVersion: rv(2),
}
const llmDomain = { preferredModel: 'model-a', writingTone: 'technical', templates: ['Summarise in 3 bullets'], contextDocuments: ['We sell hardware in the Gulf'], recordVersion: rv(4), updatedAt: at(f.AT) }

const cases: Case[] = [
  // ── User Profile ────────────────────────────────────────────────────────────
  { name: 'getUser', status: 200, answer: f.userResponse, call: (a) => a.users.getUser(f.ME), sent: `GET ${U}`, returns: profileBody },
  {
    name: 'getUser (nothing optional set)',
    status: 200,
    answer: f.userResponseMinimal,
    call: (a) => a.users.getUser(f.ME),
    sent: `GET ${U}`,
    returns: { userId: f.ME, displayName: 'Ada', displayNameOverridden: false, jobTitle: '', jobTitleOverridden: false, email: 'ada@example.com', phone: '', timezone: '', locale: '', credentials: {}, source: 'local', status: 'active', provisional: false, recordVersion: rv(1) },
  },
  {
    name: 'updateUser (only the changed fields, with the version)',
    status: 200,
    answer: f.userResponse,
    call: (a) => a.users.updateUser(f.ME, { displayName: 'Ada King', displayNameOverridden: true, credentials: { new: 'x' }, deleteCredentials: ['org'], expectedVersion: rv(3) }),
    sent: `PATCH ${U}`,
    body: { display_name: 'Ada King', display_name_overridden: true, credentials: { new: 'x' }, delete_credentials: ['org'], expected_version: 3 },
    returns: profileBody,
  },
  {
    name: 'updateUser (revert to directory value)',
    status: 200,
    answer: f.userResponse,
    call: (a) => a.users.updateUser(f.ME, { jobTitleOverridden: false, expectedVersion: rv(3) }),
    sent: `PATCH ${U}`,
    body: { job_title_overridden: false, expected_version: 3 },
  },
  {
    name: 'updateUser (phone, zone, language, clearing the title)',
    status: 200,
    answer: f.userResponse,
    call: (a) => a.users.updateUser(f.ME, { jobTitle: '', phone: '', timezone: 'Asia/Dubai', locale: 'en-GB', expectedVersion: rv(3) }),
    sent: `PATCH ${U}`,
    body: { job_title: '', phone: '', timezone: 'Asia/Dubai', locale: 'en-GB', expected_version: 3 },
  },
  {
    name: 'batch',
    status: 200,
    answer: f.batchResponse,
    call: (a) => a.users.batch([f.ME, f.OTHER, f.D1]),
    sent: '/api/v1/users:batch'.replace(/^/, 'POST '),
    body: { ids: [f.ME, f.OTHER, f.D1] },
    returns: {
      users: [
        { userId: f.ME, displayName: 'Ada Lovelace', email: 'ada@example.com', jobTitle: 'Engineer', status: 'active', availability: 'ooo', provisional: false, recordVersion: rv(3) },
        { userId: f.OTHER, displayName: 'Ada', email: 'ada@example.com', status: 'active', availability: 'busy', provisional: false, recordVersion: rv(1) },
      ],
      missing: [f.D1],
    },
  },
  { name: 'getAvailability', status: 200, answer: f.availabilityResponse, call: (a) => a.users.getAvailability(f.ME), sent: `GET ${U}/availability`, returns: ooo },
  {
    name: 'putAvailability (out of office: window, note, version, never a delegate)',
    status: 200,
    answer: f.availabilityResponse,
    call: (a) => a.users.putAvailability(f.ME, { status: 'ooo', oooFrom: at('2026-12-01T00:00:00Z'), oooUntil: at('2026-12-10T00:00:00Z'), note: 'Leave', expectedVersion: rv(2) }),
    sent: `PUT ${U}/availability`,
    body: { status: 'ooo', ooo_from: '2026-12-01T00:00:00.000Z', ooo_until: '2026-12-10T00:00:00.000Z', note: 'Leave', expected_version: 2 },
    returns: ooo,
  },
  {
    name: 'putAvailability (busy)',
    status: 200,
    answer: f.availabilityBusy,
    call: (a) => a.users.putAvailability(f.ME, { status: 'busy', note: '', expectedVersion: rv(2) }),
    sent: `PUT ${U}/availability`,
    body: { status: 'busy', note: '', expected_version: 2 },
    returns: { status: 'busy', recordVersion: rv(3) },
  },
  { name: 'getLlmPreferences', status: 200, answer: f.llmPreferencesResponse, call: (a) => a.users.getLlmPreferences(f.ME), sent: `GET ${U}/llm-preferences`, returns: llmDomain },
  {
    name: 'putLlmPreferences (full replacement, with the version)',
    status: 200,
    answer: f.llmPreferencesResponse,
    call: (a) => a.users.putLlmPreferences(f.ME, { preferredModel: 'model-a', writingTone: 'technical', templates: ['a'], contextDocuments: [], expectedVersion: rv(4) }),
    sent: `PUT ${U}/llm-preferences`,
    body: { preferred_model: 'model-a', writing_tone: 'technical', templates: ['a'], context_documents: [], expected_version: 4 },
    returns: llmDomain,
  },
  {
    name: 'putLlmPreferences (first save: no version)',
    status: 200,
    answer: f.llmPreferencesResponse,
    call: (a) => a.users.putLlmPreferences(f.ME, { preferredModel: 'model-a', writingTone: 'neutral', templates: [], contextDocuments: [] }),
    sent: `PUT ${U}/llm-preferences`,
    body: { preferred_model: 'model-a', writing_tone: 'neutral', templates: [], context_documents: [] },
  },
  {
    name: 'getNotificationPreferences (an unknown channel is left out)',
    status: 200,
    answer: f.notificationPreferencesResponse,
    call: (a) => a.users.getNotificationPreferences(f.ME),
    sent: `GET ${U}/notification-preferences`,
    returns: [
      { eventType: 'doc.approved', channels: ['email', 'in_app'], urgencyThreshold: 'normal' },
      { eventType: 'doc.rejected', channels: ['push'], urgencyThreshold: 'any' },
    ],
  },
  {
    name: 'putNotificationPreferences (the whole list)',
    status: 200,
    answer: f.notificationPreferencesResponse,
    call: (a) => a.users.putNotificationPreferences(f.ME, [{ eventType: 'doc.approved', channels: ['email'], urgencyThreshold: 'normal' }]),
    sent: `PUT ${U}/notification-preferences`,
    body: { preferences: [{ event_type: 'doc.approved', channels: ['email'], urgency_threshold: 'normal' }] },
  },
  {
    name: 'putNotificationPreferences (reset to defaults: an empty list)',
    status: 200,
    answer: { preferences: [] },
    call: (a) => a.users.putNotificationPreferences(f.ME, []),
    sent: `PUT ${U}/notification-preferences`,
    body: { preferences: [] },
    returns: [],
  },
  {
    name: 'presignSignature (the answer carries no content type: it is the one requested)',
    status: 200,
    answer: f.presignResponse,
    call: (a) => a.users.presignSignature(f.ME, { contentType: 'image/png', byteSize: 48213 }),
    sent: `POST ${U}/signature`,
    body: { content_type: 'image/png', byte_size: 48213 },
    returns: { uploadUrl: f.presignResponse.upload_url, objectKey: f.presignResponse.object_key, expiresIn: 300, contentType: 'image/png' },
  },
  {
    name: 'confirmSignature, first upload (201)',
    status: 201,
    answer: f.signatureConfirmResponse,
    call: (a) => a.users.confirmSignature(f.ME, { objectKey: f.presignResponse.object_key, sha256: 'a'.repeat(64) }),
    sent: `PUT ${U}/signature`,
    body: { object_key: f.presignResponse.object_key, sha256: 'a'.repeat(64) },
    returns: { signatureImageHash: 'a'.repeat(64), signatureKey: f.presignResponse.object_key, updatedAt: at(f.AT), outcome: 'created' },
  },
  {
    name: 'confirmSignature, replacement (200)',
    status: 200,
    answer: f.signatureConfirmResponse,
    call: (a) => a.users.confirmSignature(f.ME, { objectKey: f.presignResponse.object_key, sha256: 'a'.repeat(64) }),
    sent: `PUT ${U}/signature`,
    returns: { signatureImageHash: 'a'.repeat(64), signatureKey: f.presignResponse.object_key, updatedAt: at(f.AT), outcome: 'replaced' },
  },
  { name: 'deleteSignature', status: 204, call: (a) => a.users.deleteSignature(f.ME), sent: `DELETE ${U}/signature`, returns: undefined },

  // ── Delegation ──────────────────────────────────────────────────────────────
  {
    name: 'list (a delegation with an end, and an open-ended one)',
    status: 200,
    answer: f.delegationList,
    call: (a) => a.delegation.list(),
    sent: 'GET /api/v1/delegations',
    returns: [delegationDomain, openEndedDomain],
  },
  {
    name: 'create (with an Idempotency-Key, for a department, with dates and a note)',
    status: 201,
    answer: f.delegationResponse,
    call: (a) =>
      a.delegation.create({ delegateId: f.OTHER, scope: 'department', scopeId: f.D1, startsAt: at('2026-12-01T00:00:00Z'), endsAt: at('2026-12-20T00:00:00Z'), note: 'Away' }, 'key-123'),
    sent: 'POST /api/v1/delegations',
    body: { delegate_id: f.OTHER, scope: 'department', scope_id: f.D1, starts_at: '2026-12-01T00:00:00.000Z', ends_at: '2026-12-20T00:00:00.000Z', ooo_note: 'Away' },
    headers: { 'idempotency-key': 'key-123' },
    returns: delegationDomain,
  },
  {
    name: 'create (all my work, open-ended, starts now)',
    status: 201,
    answer: f.delegationOpenEnded,
    call: (a) => a.delegation.create({ delegateId: f.OTHER, scope: 'all' }, 'key-456'),
    sent: 'POST /api/v1/delegations',
    body: { delegate_id: f.OTHER, scope: 'all' },
    headers: { 'idempotency-key': 'key-456' },
    returns: openEndedDomain,
  },
  { name: 'cancel (record_version is a query parameter)', status: 200, answer: f.delegationResponse, call: (a) => a.delegation.cancel(f.DLG, rv(5)), sent: `DELETE ${D}`, query: [['record_version', '5']], returns: undefined },
  {
    name: 'extend (answers the new version and review date only)',
    status: 200,
    answer: f.delegationExtended,
    call: (a) => a.delegation.extend(f.DLG, { extendDays: 30, recordVersion: rv(2) }),
    sent: `POST ${D}/extend`,
    body: { extend_days: 30, record_version: 2 },
    returns: { delegationId: f.DLG, recordVersion: rv(3), reviewDueAt: at('2027-03-25T10:00:00Z') },
  },
  {
    name: 'reassign (only what changed; the new delegation starts now)',
    status: 201,
    answer: f.delegationResponse,
    call: (a) => a.delegation.reassign(f.DLG, { newDelegateId: f.OTHER, endsAt: at('2026-12-20T00:00:00Z'), reason: 'Cover', recordVersion: rv(5) }),
    sent: `POST ${D}/reassign`,
    body: { new_delegate_id: f.OTHER, ends_at: '2026-12-20T00:00:00.000Z', reason: 'Cover', record_version: 5 },
    returns: delegationDomain,
  },
  {
    name: 'reassign (a new scope)',
    status: 201,
    answer: f.delegationResponse,
    call: (a) => a.delegation.reassign(f.DLG, { scope: 'department', scopeId: f.D1, recordVersion: rv(5) }),
    sent: `POST ${D}/reassign`,
    body: { scope: 'department', scope_id: f.D1, record_version: 5 },
  },
  { name: 'getPolicy', status: 200, answer: f.delegationSettings, call: (a) => a.delegation.getPolicy(), sent: 'GET /api/v1/delegations/settings', returns: { maxDurationDays: 90, reviewWindowDays: 60 } },

  // ── Org & Membership (read only) ────────────────────────────────────────────
  {
    name: 'listMembers (first page)',
    status: 200,
    answer: f.memberPage,
    call: (a) => a.org.listMembers({ limit: 50 }),
    sent: `GET ${T}/members`,
    query: [['limit', '50']],
    returns: {
      members: [
        { userId: f.ME, status: 'active' },
        { userId: f.OTHER, status: 'suspended' },
      ],
      nextCursor: parseCursor('eyJpZCI6Mn0='),
    },
  },
  {
    name: 'listMembers (next page: the cursor, and the last page has none)',
    status: 200,
    answer: f.memberPageLast,
    call: (a) => a.org.listMembers({ limit: 50, cursor: parseCursor('eyJpZCI6Mn0=')! }),
    sent: `GET ${T}/members`,
    query: [['limit', '50'], ['cursor', 'eyJpZCI6Mn0=']],
    returns: { members: [{ userId: f.ME, status: 'active' }] },
  },
  {
    name: 'listDepartments',
    status: 200,
    answer: f.departmentList,
    call: (a) => a.org.listDepartments(),
    sent: `GET ${T}/departments`,
    returns: [
      { departmentId: f.D1, code: 'ENG', name: 'Engineering', isActive: true, recordVersion: rv(1) },
      { departmentId: f.D2, code: 'QAQC', name: 'QA / QC', isActive: false, recordVersion: rv(4) },
    ],
  },
  {
    name: 'listRoleLabels',
    status: 200,
    answer: f.roleLabels,
    call: (a) => a.org.listRoleLabels(),
    sent: `GET ${T}/roles`,
    returns: [
      { roleCode: 'preparator', displayName: 'Drafter', recordVersion: rv(1) },
      { roleCode: 'reviewer', displayName: 'Reviewer', recordVersion: rv(2) },
      { roleCode: 'approver', displayName: 'Approver', recordVersion: rv(1) },
    ],
  },
]

describe('every adapter call conforms to the pinned IAM Swagger', () => {
  it.each(cases)('$name', async (c) => {
    const server = stubServer()
    server.reply(c.status, c.answer)
    const result = await c.call(adapters())

    expect(server.calls).toHaveLength(1)
    const call = server.calls[0]!
    expect(`${call.method} ${call.pathname}`).toBe(c.sent)
    expect(call.query).toEqual(c.query ?? [])
    if (c.body !== undefined) expect(call.body).toEqual(c.body)
    for (const [name, value] of Object.entries(c.headers ?? {})) expect(call.headers[name]).toBe(value)

    const verdict = conformance(call, { status: c.status, ...(c.answer !== undefined ? { body: c.answer } : {}) })
    expect(verdict.problems, `${verdict.service} ${verdict.swaggerPath}`).toEqual([])
    if (c.returns !== undefined || c.status === 204 || c.name.startsWith('cancel')) expect(result).toEqual(c.returns)
  })

  it('has a case for every method of every adapter: nothing the adapters can send is untested', () => {
    const all = makeAdapters((_name, port) => port)
    const methods = Object.entries(all).flatMap(([name, port]) => Object.keys(port).map((m) => `${name}.${m}`))
    expect(methods).toHaveLength(12 + 6 + 3)
    expect(methods.filter((m) => !called.has(m))).toEqual([])
  })
})

describe('llm preferences before any are saved', () => {
  it('a 404 is "nothing saved yet", not a failure', async () => {
    const server = stubServer()
    server.reply(404, { type: 'about:blank', title: 'Not Found', status: 404, errorCode: 'NOT_FOUND' })
    await expect(adapters().users.getLlmPreferences(f.ME)).resolves.toBeUndefined()
  })

  it('any other failure still fails', async () => {
    const server = stubServer()
    // The client retries a safe GET twice on a 503 before giving up.
    for (let i = 0; i < 3; i++) server.reply(503, { type: 'about:blank', title: 'Unavailable', status: 503, errorCode: 'DB_UNAVAILABLE' })
    await expect(adapters().users.getLlmPreferences(f.ME)).rejects.toMatchObject({ status: 503 })
  })
})

describe('lists the service leaves out or sends as null', () => {
  it('is an empty list, not a failure (Go serialises a nil slice as null)', async () => {
    const server = stubServer()
    server.reply(200, { items: null })
    server.reply(200, {})
    server.reply(200, { users: null, missing: null })
    const a = adapters()
    expect(await a.delegation.list()).toEqual([])
    expect(await a.org.listDepartments()).toEqual([])
    expect(await a.users.batch([f.ME])).toEqual({ users: [], missing: [] })
  })
})

describe('the percent-encoded custom method', () => {
  it('sends users%3Abatch, which a server that decodes the path before routing serves as /users:batch', async () => {
    const server = stubServer()
    server.reply(200, { users: [], missing: [] })
    await adapters().users.batch([f.ME])
    expect(server.calls[0]!.rawPath).toBe('/api/v1/users%3Abatch')
    expect(server.calls[0]!.pathname).toBe('/api/v1/users:batch')
  })
})

describe('the Delegation prefix', () => {
  it('uses /v1/delegations so the SDK client\'s /api prefix gives /api/v1/delegations, not /api/api/v1', async () => {
    const server = stubServer()
    server.reply(200, f.delegationList)
    await adapters().delegation.list()
    expect(server.calls[0]!.pathname).toBe('/api/v1/delegations')
  })
})

describe('no identity on the wire (IAM-UX-1)', () => {
  it('sends my ID only in the path, never in a body or a query', async () => {
    const server = stubServer()
    server.reply(200, f.userResponse)
    await adapters().users.updateUser(f.ME, { displayName: 'Ada King', expectedVersion: rv(3) })
    const call = server.calls[0]!
    expect(call.pathname).toContain(f.ME)
    expect(JSON.stringify([call.body, call.query])).not.toMatch(/tenant_id|user_id|x-user-id|x-tenant|delegator_id/)
  })

  it('sends no tenant, user or role header from the browser', async () => {
    const server = stubServer()
    server.reply(200, f.delegationList)
    await adapters().delegation.list()
    expect(Object.keys(server.calls[0]!.headers).filter((h) => /^x-(user|tenant)/.test(h))).toEqual([])
  })

  it('refuses a tenant call before the session context has a tenant ID', async () => {
    const server = stubServer()
    const org = createOrgDirectoryAdapter({ client: client(), tenantId: () => undefined })
    await expect(org.listMembers({})).rejects.toMatchObject({ name: 'MissingWorkspaceError' })
    expect(server.calls).toHaveLength(0)
  })
})

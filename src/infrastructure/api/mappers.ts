// Service answers (snake_case JSON) to domain types, and domain values to request bodies. Pure: no HTTP
// here, so the contract tests can feed the Swagger-shaped fixtures straight in. A list the service
// answers as `null` or leaves out is an empty list (Go serialises a nil slice as null), never a failure.
// A field the screens depend on that is missing or the wrong type is a MappingError; unknown extra fields
// are ignored (a service may add fields).
import type { Availability, AvailabilityUpdate } from '../../domain/entities/availability'
import type { Delegation, DelegationCreate, DelegationExtend, DelegationExtended, DelegationPolicy, DelegationReassign } from '../../domain/entities/delegation'
import type { MemberPage, RoleLabel, TenantDepartment } from '../../domain/entities/directory'
import type { LlmPreferences, LlmPreferencesUpdate, NotificationPreference } from '../../domain/entities/preferences'
import type { Credentials, EmbeddedAvailability, MyProfile, ProfilePatch, UserBatch, UserSummary } from '../../domain/entities/profile'
import type { PresignedUpload, PresignRequest, SignatureConfirmation, SignatureConfirmRequest } from '../../domain/entities/signature'
import { parseCursor } from '../../domain/value-objects/Cursor'
import { parseInstant } from '../../domain/value-objects/Instant'
import { recordVersion } from '../../domain/value-objects/RecordVersion'
import { AVAILABILITY, CHANNELS, DELEGATION_SCOPES, DELEGATION_STATUSES, DEPARTMENT_LEVELS, URGENCY, USER_SOURCES, USER_STATUSES, WRITING_TONES, type Channel } from '../../domain/vocabulary'
import { MappingError, arrayOrEmpty, boolean, integer, object, oneOf, optBoolean, optInteger, optString, string, type Json } from './readers'

const version = (o: Json, key: string, path: string) => {
  try {
    return recordVersion(integer(o, key, path))
  } catch (e) {
    throw e instanceof MappingError ? e : new MappingError(`${path}.${key}`, 'a non-negative integer')
  }
}

/** An optional date-time; a value that is not one is dropped rather than failing the page. */
const optInstant = (o: Json, key: string) => parseInstant(o[key])

const strings = (v: unknown, path: string): string[] =>
  arrayOrEmpty(v, path).map((s, i) => {
    if (typeof s !== 'string') throw new MappingError(`${path}[${i}]`, 'a string')
    return s
  })

// ── User Profile ───────────────────────────────────────────────────────────────────────────────

function embeddedAvailability(v: unknown, path: string): EmbeddedAvailability | undefined {
  if (v === undefined || v === null) return undefined
  const o = object(v, path)
  const status = AVAILABILITY.find((s) => s === o['status'])
  if (!status) return undefined
  const from = optInstant(o, 'ooo_from')
  const until = optInstant(o, 'ooo_until')
  const note = optString(o, 'note')
  const delegate = optString(o, 'delegate_user_id')
  return { status, ...(from ? { oooFrom: from } : {}), ...(until ? { oooUntil: until } : {}), ...(note ? { note } : {}), ...(delegate ? { delegateUserId: delegate } : {}) }
}

/** The credentials map: only string values are kept (the Swagger types it as string → string). */
function credentials(v: unknown, path: string): Credentials {
  if (v === undefined || v === null) return {}
  return Object.fromEntries(Object.entries(object(v, path)).filter((e): e is [string, string] => typeof e[1] === 'string'))
}

/** `GET /users/:id` and the answer of `PATCH /users/:id`. */
export function toMyProfile(body: unknown, path = 'user'): MyProfile {
  const o = object(body, path)
  const availability = embeddedAvailability(o['availability'], `${path}.availability`)
  const updatedAt = optInstant(o, 'updated_at')
  return {
    userId: string(o, 'id', path),
    displayName: string(o, 'display_name', path),
    displayNameOverridden: optBoolean(o, 'display_name_overridden') === true,
    jobTitle: optString(o, 'job_title') ?? '',
    jobTitleOverridden: optBoolean(o, 'job_title_overridden') === true,
    email: string(o, 'email', path),
    // Kept as the service sent it: a stored number that is not E.164 stays until the user changes it.
    phone: (optString(o, 'phone') ?? '') as MyProfile['phone'],
    timezone: optString(o, 'timezone') ?? '',
    locale: optString(o, 'locale') ?? '',
    credentials: credentials(o['credentials'], `${path}.credentials`),
    source: oneOf(o, 'source', USER_SOURCES, path),
    status: oneOf(o, 'status', USER_STATUSES, path),
    provisional: optBoolean(o, 'provisional') === true,
    ...(availability ? { availability } : {}),
    recordVersion: version(o, 'record_version', path),
    ...(updatedAt ? { updatedAt } : {}),
  }
}

/** A user as a chip or picker shows them. */
export function toUserSummary(body: unknown, path = 'user'): UserSummary {
  const o = object(body, path)
  const availability = embeddedAvailability(o['availability'], `${path}.availability`)
  const job = optString(o, 'job_title')
  return {
    userId: string(o, 'id', path),
    displayName: string(o, 'display_name', path),
    email: string(o, 'email', path),
    ...(job ? { jobTitle: job } : {}),
    status: oneOf(o, 'status', USER_STATUSES, path),
    ...(availability ? { availability: availability.status } : {}),
    provisional: optBoolean(o, 'provisional') === true,
    recordVersion: version(o, 'record_version', path),
  }
}

export function toUserBatch(body: unknown): UserBatch {
  const o = object(body, 'batch')
  return {
    users: arrayOrEmpty(o['users'], 'batch.users').map((u, i) => toUserSummary(u, `batch.users[${i}]`)),
    missing: strings(o['missing'], 'batch.missing'),
  }
}

export function toProfilePatchBody(p: ProfilePatch): Json {
  return {
    ...(p.displayName !== undefined ? { display_name: p.displayName } : {}),
    ...(p.displayNameOverridden !== undefined ? { display_name_overridden: p.displayNameOverridden } : {}),
    ...(p.jobTitle !== undefined ? { job_title: p.jobTitle } : {}),
    ...(p.jobTitleOverridden !== undefined ? { job_title_overridden: p.jobTitleOverridden } : {}),
    ...(p.phone !== undefined ? { phone: p.phone } : {}),
    ...(p.timezone !== undefined ? { timezone: p.timezone } : {}),
    ...(p.locale !== undefined ? { locale: p.locale } : {}),
    ...(p.credentials !== undefined ? { credentials: { ...p.credentials } } : {}),
    ...(p.deleteCredentials !== undefined ? { delete_credentials: [...p.deleteCredentials] } : {}),
    expected_version: p.expectedVersion,
  }
}

export function toAvailability(body: unknown): Availability {
  const o = object(body, 'availability')
  const from = optInstant(o, 'ooo_from')
  const until = optInstant(o, 'ooo_until')
  const note = optString(o, 'note')
  const delegate = optString(o, 'delegate_user_id')
  const updatedAt = optInstant(o, 'updated_at')
  return {
    status: oneOf(o, 'status', AVAILABILITY, 'availability'),
    ...(from ? { oooFrom: from } : {}),
    ...(until ? { oooUntil: until } : {}),
    ...(note ? { note } : {}),
    ...(delegate ? { delegateUserId: delegate } : {}),
    recordVersion: version(o, 'record_version', 'availability'),
    ...(updatedAt ? { updatedAt } : {}),
  }
}

/** Never carries `delegate_user_id` (LLD §7.4). */
export function toAvailabilityBody(u: AvailabilityUpdate): Json {
  return {
    status: u.status,
    ...(u.oooFrom ? { ooo_from: u.oooFrom } : {}),
    ...(u.oooUntil ? { ooo_until: u.oooUntil } : {}),
    note: u.note,
    expected_version: u.expectedVersion,
  }
}

export function toLlmPreferences(body: unknown): LlmPreferences {
  const o = object(body, 'llmPreferences')
  const updatedAt = optInstant(o, 'updated_at')
  return {
    preferredModel: string(o, 'preferred_model', 'llmPreferences'),
    writingTone: oneOf(o, 'writing_tone', WRITING_TONES, 'llmPreferences'),
    templates: strings(o['templates'], 'llmPreferences.templates'),
    contextDocuments: strings(o['context_documents'], 'llmPreferences.context_documents'),
    recordVersion: version(o, 'record_version', 'llmPreferences'),
    ...(updatedAt ? { updatedAt } : {}),
  }
}

export function toLlmPreferencesBody(u: LlmPreferencesUpdate): Json {
  return {
    preferred_model: u.preferredModel,
    writing_tone: u.writingTone,
    templates: [...u.templates],
    context_documents: [...u.contextDocuments],
    ...(u.expectedVersion !== undefined ? { expected_version: u.expectedVersion } : {}),
  }
}

export function toNotificationPreferences(body: unknown): NotificationPreference[] {
  return arrayOrEmpty(object(body, 'notificationPreferences')['preferences'], 'notificationPreferences.preferences').map((v, i) => {
    const path = `notificationPreferences.preferences[${i}]`
    const o = object(v, path)
    // The channel list is a free string in the Swagger: a code this remote does not know is left out, not shown raw.
    const channels = strings(o['channels'], `${path}.channels`).filter((c): c is Channel => (CHANNELS as readonly string[]).includes(c))
    return { eventType: string(o, 'event_type', path), channels, urgencyThreshold: oneOf(o, 'urgency_threshold', URGENCY, path) }
  })
}

export const toNotificationPreferencesBody = (list: readonly NotificationPreference[]): Json => ({
  preferences: list.map((p) => ({ event_type: p.eventType, channels: [...p.channels], urgency_threshold: p.urgencyThreshold })),
})

export const toPresignBody = (r: PresignRequest): Json => ({ content_type: r.contentType, byte_size: r.byteSize })

/** The answer carries no content type: it is the one the request named, bound to the URL. */
export function toPresignedUpload(body: unknown, contentType: PresignRequest['contentType']): PresignedUpload {
  const o = object(body, 'presign')
  return { uploadUrl: string(o, 'upload_url', 'presign'), objectKey: string(o, 'object_key', 'presign'), expiresIn: integer(o, 'expires_in', 'presign'), contentType }
}

export const toConfirmBody = (r: SignatureConfirmRequest): Json => ({ object_key: r.objectKey, sha256: r.sha256 })

/** `201` is the first signature, `200` a replacement. */
export function toSignatureConfirmation(body: unknown, status: number): SignatureConfirmation {
  const o = object(body, 'signature')
  const updatedAt = optInstant(o, 'updated_at')
  return {
    signatureImageHash: string(o, 'signature_image_hash', 'signature'),
    signatureKey: string(o, 'signature_key', 'signature'),
    ...(updatedAt ? { updatedAt } : {}),
    outcome: status === 201 ? 'created' : 'replaced',
  }
}

// ── Delegation ─────────────────────────────────────────────────────────────────────────────────

export function toDelegation(body: unknown, path = 'delegation'): Delegation {
  const o = object(body, path)
  const scopeId = optString(o, 'scope_id')
  const startsAt = optInstant(o, 'starts_at')
  const endsAt = optInstant(o, 'ends_at')
  const reviewDueAt = optInstant(o, 'review_due_at')
  const reviewWindowDays = optInteger(o, 'review_window_days')
  return {
    delegationId: string(o, 'delegation_id', path),
    delegatorId: string(o, 'delegator_id', path),
    delegateId: string(o, 'delegate_id', path),
    scope: oneOf(o, 'scope', DELEGATION_SCOPES, path),
    ...(scopeId ? { scopeId } : {}),
    ...(startsAt ? { startsAt } : {}),
    ...(endsAt ? { endsAt } : {}),
    ...(reviewDueAt ? { reviewDueAt } : {}),
    ...(reviewWindowDays !== undefined ? { reviewWindowDays } : {}),
    status: oneOf(o, 'status', DELEGATION_STATUSES, path),
    recordVersion: version(o, 'record_version', path),
  }
}

export function toDelegations(body: unknown): Delegation[] {
  return arrayOrEmpty(object(body, 'delegations')['items'], 'delegations.items').map((v, i) => toDelegation(v, `delegations.items[${i}]`))
}

export function toDelegationCreateBody(r: DelegationCreate): Json {
  return {
    delegate_id: r.delegateId,
    scope: r.scope,
    ...(r.scopeId ? { scope_id: r.scopeId } : {}),
    ...(r.startsAt ? { starts_at: r.startsAt } : {}),
    ...(r.endsAt ? { ends_at: r.endsAt } : {}),
    ...(r.note ? { ooo_note: r.note } : {}),
  }
}

export const toExtendBody = (r: DelegationExtend): Json => ({ extend_days: r.extendDays, record_version: r.recordVersion })

export function toDelegationExtended(body: unknown): DelegationExtended {
  const o = object(body, 'extended')
  const reviewDueAt = optInstant(o, 'review_due_at')
  return { delegationId: string(o, 'delegation_id', 'extended'), recordVersion: version(o, 'record_version', 'extended'), ...(reviewDueAt ? { reviewDueAt } : {}) }
}

export function toReassignBody(r: DelegationReassign): Json {
  return {
    ...(r.newDelegateId ? { new_delegate_id: r.newDelegateId } : {}),
    ...(r.scope ? { scope: r.scope } : {}),
    ...(r.scopeId ? { scope_id: r.scopeId } : {}),
    ...(r.endsAt ? { ends_at: r.endsAt } : {}),
    ...(r.reason ? { reason: r.reason } : {}),
    record_version: r.recordVersion,
  }
}

export function toDelegationPolicy(body: unknown): DelegationPolicy {
  const o = object(body, 'delegationPolicy')
  return { maxDurationDays: integer(o, 'max_duration_days', 'delegationPolicy'), reviewWindowDays: integer(o, 'review_window_days', 'delegationPolicy') }
}

// ── Org & Membership (read only) ───────────────────────────────────────────────────────────────

export function toMemberPage(body: unknown): MemberPage {
  const o = object(body, 'members')
  const next = parseCursor(o['next_cursor'])
  return {
    members: arrayOrEmpty(o['items'], 'members.items').map((v, i) => {
      const path = `members.items[${i}]`
      const m = object(v, path)
      return { userId: string(m, 'user_id', path), status: oneOf(m, 'status', ['active', 'suspended'] as const, path) }
    }),
    ...(next ? { nextCursor: next } : {}),
  }
}

export function toTenantDepartments(body: unknown): TenantDepartment[] {
  return arrayOrEmpty(object(body, 'departments')['items'], 'departments.items').map((v, i) => {
    const path = `departments.items[${i}]`
    const o = object(v, path)
    return {
      departmentId: string(o, 'department_id', path),
      code: string(o, 'code', path),
      name: string(o, 'name', path),
      isActive: boolean(o, 'is_active', path),
      recordVersion: version(o, 'record_version', path),
    }
  })
}

export function toRoleLabels(body: unknown): RoleLabel[] {
  return arrayOrEmpty(object(body, 'roleLabels')['items'], 'roleLabels.items').map((v, i) => {
    const path = `roleLabels.items[${i}]`
    const o = object(v, path)
    return { roleCode: oneOf(o, 'role_code', DEPARTMENT_LEVELS, path), displayName: string(o, 'display_name', path), recordVersion: version(o, 'record_version', path) }
  })
}

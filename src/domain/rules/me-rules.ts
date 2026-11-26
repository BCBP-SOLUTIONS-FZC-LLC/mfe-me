// The "my account" screens' rules: pure functions that return `{ ok: true, value }` or `{ ok: false,
// failure }`. They enforce only what the UI knows, so a form can say what is wrong before anything is
// sent. Every one is re-checked by the service, and the UI never grants more than IAM does (LLD §6.3).
// "Now" and the option lists are inputs, never read from the clock or the browser. Failures are
// codes; the screens turn them into catalogue messages. The first failing check wins, in the order
// written. Only the fields the user changed are checked and sent, so a stored value that no longer
// passes (an old title, a language the shell dropped) never blocks an unrelated edit.
import type { Availability, AvailabilityUpdate } from '../entities/availability'
import type { Delegation, DelegationCreate, DelegationExtend, DelegationPolicy, DelegationReassign, DelegationTarget } from '../entities/delegation'
import type { LlmPreferences, LlmPreferencesUpdate, NotificationPreference } from '../entities/preferences'
import type { Credentials, MyProfile, ProfilePatch } from '../entities/profile'
import type { PresignRequest } from '../entities/signature'
import { parsePhone } from '../value-objects/E164Phone'
import { DAY_MS, daysBetween, toMillis, type Instant } from '../value-objects/Instant'
import { parseLocale, languageOf } from '../value-objects/LocaleTag'
import { parseTimeZone } from '../value-objects/IanaTimeZone'
import {
  AVAILABILITY,
  CHANNELS,
  OFFERED_SCOPES,
  SIGNATURE_TYPES,
  URGENCY,
  WRITING_TONES,
  type Channel,
  type DelegationScope,
  type SignatureType,
  type Urgency,
} from '../vocabulary'

export type Planned<T, F extends string> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly failure: F; /** Where in a list or form, when it helps (a field, `credentials[2]`). */ readonly at?: string }

const ok = <T>(value: T): { ok: true; value: T } => ({ ok: true, value })
const refuse = <F extends string>(failure: F, at?: string): { ok: false; failure: F; at?: string } => (at === undefined ? { ok: false, failure } : { ok: false, failure, at })

// ── Limits (User Profile and Delegation Swagger, spec §G) ─────────────────────────────────────

export const LIMITS = {
  displayName: 200,
  jobTitle: 200,
  credentialKeys: 32,
  credentialKey: 64,
  credentialValue: 64,
  note: 500,
  reason: 500,
  oooWindowDays: 180,
  signatureBytes: 1_048_576,
  model: 128,
  templates: 20,
  template: 500,
  snippets: 10,
  snippet: 1000,
  eventType: 100,
  extendDaysMax: 180,
  /** The service's reminder cascade warns at 3, 2 and 1 days before a review is due. */
  reviewWarnDays: 3,
} as const

const hasControlChars = (s: string): boolean => [...s].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
/** Letters, digits and `- / ( ) .` plus space (the Swagger's credential charset). */
const CREDENTIAL_VALUE = /^[\p{L}\p{N}\-/().\s]*$/u

// ── G1: profile ────────────────────────────────────────────────────────────────────────────────

/** One row of the credentials editor. */
export interface CredentialRow {
  readonly key: string
  readonly value: string
}

export interface ProfileDraft {
  readonly displayName: string
  readonly jobTitle: string
  readonly phone: string
  readonly timezone: string
  readonly locale: string
  readonly credentials: readonly CredentialRow[]
}

export interface ProfileOptions {
  /** The browser's IANA zone names, supplied as data so the domain stays browser-free. */
  readonly timeZones: readonly string[]
  /** The languages the shell offers (`ENABLED_LOCALES`). */
  readonly locales: readonly string[]
}

export type ProfileEditFailure =
  | 'name-required'
  | 'name-too-long'
  | 'name-control-chars'
  | 'title-too-long'
  | 'phone-invalid'
  | 'timezone-invalid'
  | 'locale-invalid'
  | 'too-many-credentials'
  | 'credential-key-invalid'
  | 'credential-value-invalid'
  | 'no-change'

/** A profile draft as the form holds it, from a loaded profile (the credentials as rows, sorted by key). */
export function profileDraftOf(profile: MyProfile): ProfileDraft {
  return {
    displayName: profile.displayName,
    jobTitle: profile.jobTitle,
    phone: profile.phone,
    timezone: profile.timezone,
    locale: profile.locale,
    credentials: Object.entries(profile.credentials)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, value]) => ({ key, value })),
  }
}

/**
 * The `PATCH /users/:id` body for the changed fields, or why not. A federated user's changed name or
 * title also sends `*_overridden: true` (IAM-UX-11). Checks in order: name, title, phone, timezone,
 * locale, credentials, then `no-change`.
 */
export function planProfileEdit(draft: ProfileDraft, current: MyProfile, options: ProfileOptions): Planned<ProfilePatch, ProfileEditFailure> {
  const federated = current.source === 'federated'
  let patch: { -readonly [K in keyof ProfilePatch]: ProfilePatch[K] } = { expectedVersion: current.recordVersion }
  let changed = false

  const displayName = draft.displayName.trim()
  if (displayName !== current.displayName) {
    if (displayName.length === 0) return refuse('name-required', 'displayName')
    if ([...displayName].length > LIMITS.displayName) return refuse('name-too-long', 'displayName')
    if (hasControlChars(displayName)) return refuse('name-control-chars', 'displayName')
    patch = { ...patch, displayName, ...(federated ? { displayNameOverridden: true } : {}) }
    changed = true
  }

  const jobTitle = draft.jobTitle.trim()
  if (jobTitle !== current.jobTitle) {
    if ([...jobTitle].length > LIMITS.jobTitle) return refuse('title-too-long', 'jobTitle')
    patch = { ...patch, jobTitle, ...(federated ? { jobTitleOverridden: true } : {}) }
    changed = true
  }

  const phone = parsePhone(draft.phone)
  if (phone === undefined) {
    if (draft.phone.trim() !== current.phone) return refuse('phone-invalid', 'phone')
  } else if (phone !== current.phone) {
    patch = { ...patch, phone }
    changed = true
  }

  const timezone = draft.timezone.trim()
  if (timezone !== current.timezone) {
    if (!parseTimeZone(timezone, options.timeZones)) return refuse('timezone-invalid', 'timezone')
    patch = { ...patch, timezone }
    changed = true
  }

  const locale = draft.locale.trim()
  if (locale !== current.locale) {
    const tag = parseLocale(locale)
    if (!tag || !options.locales.includes(languageOf(tag))) return refuse('locale-invalid', 'locale')
    patch = { ...patch, locale: tag }
    changed = true
  }

  const credentials = planCredentials(draft.credentials, current.credentials)
  if (!credentials.ok) return credentials
  if (credentials.value.changed) {
    patch = { ...patch, ...credentials.value.patch }
    changed = true
  }

  return changed ? ok(patch) : refuse('no-change')
}

/** Credentials rows against the stored map: what to set and what to delete. Checked only when the rows differ. */
function planCredentials(
  rows: readonly CredentialRow[],
  current: Credentials,
): Planned<{ changed: boolean; patch: { credentials?: Credentials; deleteCredentials?: readonly string[] } }, 'too-many-credentials' | 'credential-key-invalid' | 'credential-value-invalid'> {
  const trimmed = rows.map((r) => ({ key: r.key.trim(), value: r.value.trim() }))
  const same = trimmed.length === Object.keys(current).length && trimmed.every((r) => current[r.key] === r.value)
  if (same) return ok({ changed: false, patch: {} })
  if (trimmed.length > LIMITS.credentialKeys) return refuse('too-many-credentials', 'credentials')
  const seen = new Set<string>()
  for (const [index, row] of trimmed.entries()) {
    if (row.key.length === 0 || [...row.key].length > LIMITS.credentialKey || seen.has(row.key)) return refuse('credential-key-invalid', `credentials[${index}]`)
    seen.add(row.key)
    if ([...row.value].length > LIMITS.credentialValue || !CREDENTIAL_VALUE.test(row.value)) return refuse('credential-value-invalid', `credentials[${index}]`)
  }
  const set: Record<string, string> = {}
  for (const row of trimmed) if (current[row.key] !== row.value) set[row.key] = row.value
  const removed = Object.keys(current).filter((key) => !seen.has(key))
  return ok({
    changed: true,
    patch: { ...(Object.keys(set).length > 0 ? { credentials: set } : {}), ...(removed.length > 0 ? { deleteCredentials: removed } : {}) },
  })
}

export type RevertFailure = 'not-federated' | 'not-overridden'

/**
 * "Revert to directory value" for a federated user's name or title (IAM-UX-11): sends only the
 * flag turned off. Whether the directory value returns at once is LLD §15 #11.
 */
export function planRevertToDirectory(field: 'displayName' | 'jobTitle', current: MyProfile): Planned<ProfilePatch, RevertFailure> {
  if (current.source !== 'federated') return refuse('not-federated', field)
  const overridden = field === 'displayName' ? current.displayNameOverridden : current.jobTitleOverridden
  if (!overridden) return refuse('not-overridden', field)
  return ok({ ...(field === 'displayName' ? { displayNameOverridden: false } : { jobTitleOverridden: false }), expectedVersion: current.recordVersion })
}

// ── G1: signature ──────────────────────────────────────────────────────────────────────────────

export type SignatureFileFailure = 'type-not-allowed' | 'empty' | 'too-large'

export interface SignatureFileInput {
  /** The MIME type the browser reports for the picked file. */
  readonly type: string
  readonly size: number
  /** What the file's first bytes say it is (`sniffImageType`), or undefined when they are neither PNG nor JPEG. */
  readonly magic: SignatureType | undefined
}

/** The image type the first bytes show, or undefined: PNG (`89 50 4E 47 0D 0A 1A 0A`) or JPEG (`FF D8 FF`). */
export function sniffImageType(bytes: Uint8Array): SignatureType | undefined {
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (bytes.length >= png.length && png.every((b, i) => bytes[i] === b)) return 'image/png'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  return undefined
}

/** The presign body for a picked file, or why it is refused: PNG or JPEG by MIME **and** magic bytes, not empty, at most 1 MB. */
export function planSignatureFile(file: SignatureFileInput): Planned<PresignRequest, SignatureFileFailure> {
  const type = SIGNATURE_TYPES.find((t) => t === file.type)
  if (!type || file.magic !== type) return refuse('type-not-allowed')
  if (file.size <= 0) return refuse('empty')
  if (file.size > LIMITS.signatureBytes) return refuse('too-large')
  return ok({ contentType: type, byteSize: file.size })
}

// ── G2: availability ───────────────────────────────────────────────────────────────────────────

export interface AvailabilityDraft {
  readonly status: string
  readonly oooFrom?: Instant | undefined
  readonly oooUntil?: Instant | undefined
  readonly note: string
}

export type AvailabilityFailure =
  | 'invalid-status'
  | 'window-required'
  | 'window-inverted'
  | 'window-too-long'
  | 'window-in-past'
  | 'note-too-long'
  | 'no-change'

export const isOoo = (a: Pick<Availability, 'status'>): boolean => a.status === 'ooo'

/**
 * The `PUT /availability` body, or why not. An out-of-office needs a window that ends in the future
 * and is at most 180 days. The body never carries `delegate_user_id` (LLD §7.4): Delegation owns it.
 */
export function planAvailability(draft: AvailabilityDraft, current: Availability, now: Instant): Planned<AvailabilityUpdate, AvailabilityFailure> {
  const status = AVAILABILITY.find((s) => s === draft.status)
  if (!status) return refuse('invalid-status', 'status')
  const note = draft.note.trim()
  let span: { oooFrom?: Instant; oooUntil?: Instant } = {}
  if (status === 'ooo') {
    const { oooFrom, oooUntil } = draft
    if (!oooFrom || !oooUntil) return refuse('window-required', oooFrom ? 'oooUntil' : 'oooFrom')
    if (toMillis(oooUntil) <= toMillis(oooFrom)) return refuse('window-inverted', 'oooUntil')
    if (toMillis(oooUntil) - toMillis(oooFrom) > LIMITS.oooWindowDays * DAY_MS) return refuse('window-too-long', 'oooUntil')
    if (toMillis(oooUntil) <= toMillis(now)) return refuse('window-in-past', 'oooUntil')
    span = { oooFrom, oooUntil }
  }
  if ([...note].length > LIMITS.note) return refuse('note-too-long', 'note')
  const unchanged = status === current.status && note === (current.note ?? '') && span.oooFrom === (status === 'ooo' ? current.oooFrom : undefined) && span.oooUntil === (status === 'ooo' ? current.oooUntil : undefined)
  if (unchanged) return refuse('no-change')
  return ok({ status, ...span, note, expectedVersion: current.recordVersion })
}

// ── G3: delegations ────────────────────────────────────────────────────────────────────────────

export interface DelegationContext {
  /** My IAM user ID. */
  readonly me: string
  readonly policy: DelegationPolicy
  /** The IDs of the departments I belong to (P-35 `departments[].id`). */
  readonly myDepartments: readonly string[]
  readonly now: Instant
}

export interface DelegationDraft {
  readonly delegateId: string
  readonly scope: string
  readonly scopeId?: string | undefined
  /** Absent = starts now. */
  readonly startsAt?: Instant | undefined
  /** Absent = open-ended. */
  readonly endsAt?: Instant | undefined
  readonly note?: string | undefined
}

export type DelegationFailure =
  | 'delegate-required'
  | 'self-delegation'
  | 'scope-invalid'
  | 'scope-id-required'
  | 'scope-not-mine'
  | 'start-in-past'
  | 'window-inverted'
  | 'window-too-long'
  | 'note-too-long'

/** The scope and department a draft names, or the refusal. Only the scopes offered this release are accepted. */
function planScope(scope: string, scopeId: string | undefined, ctx: DelegationContext): Planned<{ scope: DelegationScope; scopeId?: string }, 'scope-invalid' | 'scope-id-required' | 'scope-not-mine'> {
  const offered = OFFERED_SCOPES.find((s) => s === scope)
  if (!offered) return refuse('scope-invalid', 'scope')
  if (offered === 'all') return ok({ scope: offered })
  if (!scopeId) return refuse('scope-id-required', 'scopeId')
  if (!ctx.myDepartments.includes(scopeId)) return refuse('scope-not-mine', 'scopeId')
  return ok({ scope: offered, scopeId })
}

/** A window against the policy: it starts at `from`, ends at `to`, and may not exceed `maxDurationDays`. */
function planWindow(from: Instant, to: Instant | undefined, policy: DelegationPolicy): Planned<null, 'window-inverted' | 'window-too-long'> {
  if (to === undefined) return ok(null)
  if (toMillis(to) <= toMillis(from)) return refuse('window-inverted', 'endsAt')
  if (toMillis(to) - toMillis(from) > policy.maxDurationDays * DAY_MS) return refuse('window-too-long', 'endsAt')
  return ok(null)
}

/** The DLG-2 body, or why not. A start in the past is refused; with no start the delegation starts now. */
export function planDelegation(draft: DelegationDraft, ctx: DelegationContext): Planned<DelegationCreate, DelegationFailure> {
  const delegateId = draft.delegateId.trim()
  if (delegateId.length === 0) return refuse('delegate-required', 'delegateId')
  if (delegateId === ctx.me) return refuse('self-delegation', 'delegateId')
  const scope = planScope(draft.scope, draft.scopeId, ctx)
  if (!scope.ok) return scope
  if (draft.startsAt !== undefined && toMillis(draft.startsAt) < toMillis(ctx.now)) return refuse('start-in-past', 'startsAt')
  const span = planWindow(draft.startsAt ?? ctx.now, draft.endsAt, ctx.policy)
  if (!span.ok) return span
  const note = draft.note?.trim() ?? ''
  if ([...note].length > LIMITS.note) return refuse('note-too-long', 'note')
  return ok({
    delegateId,
    ...scope.value,
    ...(draft.startsAt !== undefined ? { startsAt: draft.startsAt } : {}),
    ...(draft.endsAt !== undefined ? { endsAt: draft.endsAt } : {}),
    ...(note !== '' ? { note } : {}),
  })
}

export type ExtendFailure = 'not-review-tracked' | 'days-out-of-range'

/** A delegation with no end is open-ended and reviewed on a cycle (`isReviewTracked`); a fixed end has nothing to extend. */
export const isOpenEnded = (d: Pick<Delegation, 'endsAt'>): boolean => d.endsAt === undefined
export const isReviewTracked = isOpenEnded

/** The DLG-4 body: push the review date forward by whole days, 1 to 180. */
export function planExtend(delegation: Delegation, days: number): Planned<DelegationExtend, ExtendFailure> {
  if (!isReviewTracked(delegation)) return refuse('not-review-tracked')
  if (!Number.isInteger(days) || days < 1 || days > LIMITS.extendDaysMax) return refuse('days-out-of-range', 'days')
  return ok({ extendDays: days, recordVersion: delegation.recordVersion })
}

export type ReassignFailure = Exclude<DelegationFailure, 'start-in-past' | 'note-too-long'> | 'reason-too-long' | 'no-change'

export interface ReassignDraft {
  readonly delegateId: string
  readonly scope: string
  readonly scopeId?: string | undefined
  readonly endsAt?: Instant | undefined
  readonly reason?: string | undefined
}

/**
 * The DLG-5 body: only what changed, the optional reason and the version being replaced. The new
 * delegation starts now, so its window is measured from now. A draft with no end against a fixed end
 * is "unchanged" (the Swagger has no way to say "make it open-ended"; LLD §15 #6). The service answers
 * a request that changes nothing with `422 invalid_delegate`, so it is refused here first.
 */
export function planReassign(draft: ReassignDraft, delegation: Delegation, ctx: DelegationContext): Planned<DelegationReassign, ReassignFailure> {
  const delegateId = draft.delegateId.trim()
  if (delegateId.length === 0) return refuse('delegate-required', 'delegateId')
  const delegateChanged = delegateId !== delegation.delegateId
  if (delegateChanged && delegateId === ctx.me) return refuse('self-delegation', 'delegateId')

  const scope = planScope(draft.scope, draft.scopeId, ctx)
  const scopeChanged = draft.scope !== delegation.scope || (draft.scope === 'department' && draft.scopeId !== delegation.scopeId)
  if (scopeChanged && !scope.ok) return scope

  const endsChanged = draft.endsAt !== undefined && draft.endsAt !== delegation.endsAt
  if (endsChanged) {
    const span = planWindow(ctx.now, draft.endsAt, ctx.policy)
    if (!span.ok) return span
  }

  const reason = draft.reason?.trim() ?? ''
  if ([...reason].length > LIMITS.reason) return refuse('reason-too-long', 'reason')
  if (!delegateChanged && !scopeChanged && !endsChanged) return refuse('no-change')

  return ok({
    ...(delegateChanged ? { newDelegateId: delegateId } : {}),
    ...(scopeChanged && scope.ok ? scope.value : {}),
    ...(endsChanged && draft.endsAt !== undefined ? { endsAt: draft.endsAt } : {}),
    ...(reason !== '' ? { reason } : {}),
    recordVersion: delegation.recordVersion,
  })
}

export type CancelFailure = 'not-cancellable'

/** The version for DLG-3's query, or `not-cancellable` for a delegation that has already ended. */
export function planCancel(delegation: Delegation): Planned<{ recordVersion: Delegation['recordVersion'] }, CancelFailure> {
  return delegation.status === 'ended' ? refuse('not-cancellable') : ok({ recordVersion: delegation.recordVersion })
}

/** What a delegation covers, for display: a catalogue message and (for a department) its name come from the screen. */
export function delegationLabel(d: Pick<Delegation, 'scope' | 'scopeId'>): DelegationTarget {
  if (d.scope === 'department') return { kind: 'department', departmentId: d.scopeId }
  if (d.scope === 'tender') return { kind: 'tender', tenderId: d.scopeId }
  return { kind: 'all' }
}

export type ReviewState = 'none' | 'due-soon' | 'overdue'

/**
 * Where an open-ended delegation is in its review cycle: `due-soon` within the service's 3-day
 * reminder cascade, `overdue` once the date has passed (the service then ends it as `review_expired`).
 * A delegation with a fixed end, or with no review date, has none.
 */
export function reviewState(d: Pick<Delegation, 'endsAt' | 'reviewDueAt'>, now: Instant): ReviewState {
  if (!isReviewTracked(d) || d.reviewDueAt === undefined) return 'none'
  const left = toMillis(d.reviewDueAt) - toMillis(now)
  if (left <= 0) return 'overdue'
  return left <= LIMITS.reviewWarnDays * DAY_MS ? 'due-soon' : 'none'
}

export { daysBetween }

// ── G4: AI preferences ─────────────────────────────────────────────────────────────────────────

export interface AiPreferencesDraft {
  readonly preferredModel: string
  readonly writingTone: string
  readonly templates: readonly string[]
  readonly contextDocuments: readonly string[]
}

export type AiPreferencesFailure =
  | 'model-required'
  | 'model-too-long'
  | 'model-not-allowed'
  | 'tone-invalid'
  | 'too-many-templates'
  | 'template-empty'
  | 'template-too-long'
  | 'too-many-snippets'
  | 'snippet-too-long'
  | 'no-change'

const sameList = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((x, i) => x === b[i])

/**
 * The full `PUT /llm-preferences` body, or why not. The model must be one the configuration offers
 * (even if it is the one already saved: a model that is no longer offered must be changed). With nothing
 * saved yet (`current` undefined) there is no version to send.
 */
export function planAiPreferences(draft: AiPreferencesDraft, current: LlmPreferences | undefined, allowedModels: readonly string[]): Planned<LlmPreferencesUpdate, AiPreferencesFailure> {
  const preferredModel = draft.preferredModel.trim()
  if (preferredModel.length === 0) return refuse('model-required', 'preferredModel')
  if ([...preferredModel].length > LIMITS.model) return refuse('model-too-long', 'preferredModel')
  if (!allowedModels.includes(preferredModel)) return refuse('model-not-allowed', 'preferredModel')
  const writingTone = WRITING_TONES.find((t) => t === draft.writingTone)
  if (!writingTone) return refuse('tone-invalid', 'writingTone')
  const templates = draft.templates.map((t) => t.trim())
  if (templates.length > LIMITS.templates) return refuse('too-many-templates', 'templates')
  for (const [index, template] of templates.entries()) {
    if (template.length === 0) return refuse('template-empty', `templates[${index}]`)
    if ([...template].length > LIMITS.template) return refuse('template-too-long', `templates[${index}]`)
  }
  const contextDocuments = draft.contextDocuments.map((s) => s.trim())
  if (contextDocuments.length > LIMITS.snippets) return refuse('too-many-snippets', 'contextDocuments')
  for (const [index, snippet] of contextDocuments.entries()) {
    if ([...snippet].length > LIMITS.snippet) return refuse('snippet-too-long', `contextDocuments[${index}]`)
  }
  if (current && preferredModel === current.preferredModel && writingTone === current.writingTone && sameList(templates, current.templates) && sameList(contextDocuments, current.contextDocuments)) {
    return refuse('no-change')
  }
  return ok({ preferredModel, writingTone, templates, contextDocuments, ...(current ? { expectedVersion: current.recordVersion } : {}) })
}

// ── G5: notification preferences ───────────────────────────────────────────────────────────────

export interface NotificationDraftRow {
  readonly eventType: string
  readonly channels: readonly string[]
  readonly urgencyThreshold: string
}

export type NotificationFailure =
  | 'duplicate-event-type'
  | 'event-type-unknown'
  | 'event-type-too-long'
  | 'channel-invalid'
  | 'urgency-invalid'
  | 'no-change'

/** A row in a canonical form for comparison: channels as a sorted set. */
const canonical = (p: NotificationPreference): string => `${p.eventType}|${[...new Set(p.channels)].sort().join(',')}|${p.urgencyThreshold}`

/**
 * The whole list for `PUT /notification-preferences` (an omitted row is deleted; an empty list resets
 * to the system defaults, which the screen confirms first), or why not. An event type outside the
 * configured list is refused unless it is already stored, so a stored unknown one is kept as is.
 */
export function planNotificationPreferences(
  rows: readonly NotificationDraftRow[],
  eventTypes: readonly string[],
  current: readonly NotificationPreference[],
): Planned<readonly NotificationPreference[], NotificationFailure> {
  const stored = new Set(current.map((p) => p.eventType))
  const seen = new Set<string>()
  const list: NotificationPreference[] = []
  for (const [index, row] of rows.entries()) {
    const eventType = row.eventType.trim()
    const at = `preferences[${index}]`
    if (seen.has(eventType)) return refuse('duplicate-event-type', at)
    seen.add(eventType)
    if ([...eventType].length > LIMITS.eventType) return refuse('event-type-too-long', at)
    if (!eventTypes.includes(eventType) && !stored.has(eventType)) return refuse('event-type-unknown', at)
    const channels: Channel[] = []
    for (const c of row.channels) {
      const channel = CHANNELS.find((x) => x === c)
      if (!channel) return refuse('channel-invalid', at)
      if (!channels.includes(channel)) channels.push(channel)
    }
    const urgency: Urgency | undefined = URGENCY.find((u) => u === row.urgencyThreshold)
    if (!urgency) return refuse('urgency-invalid', at)
    list.push({ eventType, channels, urgencyThreshold: urgency })
  }
  const before = current.map(canonical).sort()
  const after = list.map(canonical).sort()
  if (before.length === after.length && before.every((x, i) => x === after[i])) return refuse('no-change')
  return ok(list)
}

// Every rule in domain/rules/me-rules.ts, both ways: each refusal it names, and what it accepts with
// (LLD §6.3). The first failing check wins, in the order the rule is written.
import { describe, expect, it } from '@rstest/core'
import {
  LIMITS,
  daysBetween,
  delegationLabel,
  isOoo,
  isOpenEnded,
  planAiPreferences,
  planAvailability,
  planCancel,
  planDelegation,
  planExtend,
  planNotificationPreferences,
  planProfileEdit,
  planReassign,
  planRevertToDirectory,
  planSignatureFile,
  profileDraftOf,
  reviewState,
  sniffImageType,
  type NotificationDraftRow,
  type ProfileDraft,
} from '../../../src/domain/rules/me-rules'
import { addDays } from '../../../src/domain/value-objects/Instant'
import { DEPT, NOW, OTHER, ME, at, availability, ctx, delegation, llm, policy, profile, version } from '../../fixtures/domain'

const options = { timeZones: ['Europe/London', 'Asia/Dubai'], locales: ['en'] }

// ── G1: profile ────────────────────────────────────────────────────────────────────────────────

describe('planProfileEdit', () => {
  const current = profile({ phone: '+442071838750' as never, credentials: { cert: 'AWS-SAA', org: 'BCBP' } })
  const draft = (o: Partial<ProfileDraft> = {}): ProfileDraft => ({ ...profileDraftOf(current), ...o })
  const plan = (o: Partial<ProfileDraft> = {}, cur = current) => planProfileEdit(draft(o), cur, options)
  const fails = (o: Partial<ProfileDraft>, failure: string, where?: string, cur = current) => {
    const r = plan(o, cur)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.failure).toBe(failure)
      if (where) expect(r.at).toBe(where)
    }
  }

  it('refuses a draft with no change', () => fails({}, 'no-change'))
  it('does not count surrounding spaces as a change', () => fails({ displayName: '  Ada Lovelace ', phone: ` ${current.phone} ` }, 'no-change'))

  it('refuses a missing, over-long or control-character name', () => {
    fails({ displayName: '   ' }, 'name-required', 'displayName')
    fails({ displayName: 'x'.repeat(201) }, 'name-too-long')
    fails({ displayName: 'Ada\u0007' }, 'name-control-chars')
    fails({ displayName: 'Ada\u007f' }, 'name-control-chars')
  })
  it('counts characters, not UTF-16 units, against the limits', () => {
    expect(plan({ displayName: '😀'.repeat(200) }).ok).toBe(true)
    fails({ displayName: '😀'.repeat(201) }, 'name-too-long')
  })
  it('refuses an over-long title and accepts an empty one (it clears it)', () => {
    fails({ jobTitle: 'x'.repeat(201) }, 'title-too-long', 'jobTitle')
    expect(plan({ jobTitle: '' })).toMatchObject({ ok: true, value: { jobTitle: '' } })
  })

  it('refuses a phone that is not E.164, accepts one, and accepts an empty one (it clears it)', () => {
    fails({ phone: '0207 183 8750' }, 'phone-invalid', 'phone')
    expect(plan({ phone: '+12125551234' })).toMatchObject({ ok: true, value: { phone: '+12125551234' } })
    expect(plan({ phone: '' })).toMatchObject({ ok: true, value: { phone: '' } })
  })
  it('lets a stored phone that is not valid stay as it is', () => {
    const legacy = profile({ phone: 'ext. 12' as never })
    expect(planProfileEdit({ ...profileDraftOf(legacy), jobTitle: 'Lead' }, legacy, options)).toMatchObject({ ok: true, value: { jobTitle: 'Lead' } })
  })

  it('refuses a time zone the browser does not list, and accepts one it does', () => {
    fails({ timezone: 'Mars/Base' }, 'timezone-invalid', 'timezone')
    expect(plan({ timezone: 'Asia/Dubai' })).toMatchObject({ ok: true, value: { timezone: 'Asia/Dubai' } })
  })

  it('refuses a language that is malformed, over-long or not offered, and canonicalises one that is', () => {
    fails({ locale: 'english' }, 'locale-invalid', 'locale')
    fails({ locale: 'fr' }, 'locale-invalid')
    expect(plan({ locale: 'EN-gb' })).toMatchObject({ ok: true, value: { locale: 'en-GB' } })
  })
  it('keeps a saved language the shell no longer offers, unless the user changes it', () => {
    const saved = profile({ locale: 'ar' })
    expect(planProfileEdit({ ...profileDraftOf(saved), jobTitle: 'Lead' }, saved, options).ok).toBe(true)
    expect(planProfileEdit({ ...profileDraftOf(saved), locale: 'ar' }, saved, options)).toEqual({ ok: false, failure: 'no-change' })
  })

  it('refuses more than 32 credentials, an empty, over-long or repeated key, and a bad value (naming the row)', () => {
    const many = Array.from({ length: LIMITS.credentialKeys + 1 }, (_, i) => ({ key: `k${i}`, value: 'v' }))
    fails({ credentials: many }, 'too-many-credentials')
    fails({ credentials: [{ key: ' ', value: 'v' }] }, 'credential-key-invalid', 'credentials[0]')
    fails({ credentials: [{ key: 'k'.repeat(65), value: 'v' }] }, 'credential-key-invalid')
    fails({ credentials: [{ key: 'a', value: '1' }, { key: ' a ', value: '2' }] }, 'credential-key-invalid', 'credentials[1]')
    fails({ credentials: [{ key: 'a', value: 'ok' }, { key: 'b', value: 'no;semicolon' }] }, 'credential-value-invalid', 'credentials[1]')
    fails({ credentials: [{ key: 'a', value: 'v'.repeat(65) }] }, 'credential-value-invalid', 'credentials[0]')
  })
  it('accepts letters, digits and - / ( ) . and space in a value (any script)', () => {
    expect(plan({ credentials: [{ key: 'cert', value: 'PMP (2024) / ÅÖ 日本語 1.2-3' }] }).ok).toBe(true)
  })
  it('sends the keys it adds or changes, and lists the keys it removes', () => {
    const r = plan({ credentials: [{ key: 'cert', value: 'AWS-SAP' }, { key: 'new', value: 'x' }] })
    expect(r).toMatchObject({ ok: true, value: { credentials: { cert: 'AWS-SAP', new: 'x' }, deleteCredentials: ['org'] } })
    expect(plan({ credentials: [{ key: 'cert', value: 'AWS-SAA' }] })).toMatchObject({ ok: true, value: { deleteCredentials: ['org'] } })
    const onlyAdd = plan({ credentials: [...profileDraftOf(current).credentials, { key: 'z', value: '1' }] })
    expect(onlyAdd).toMatchObject({ ok: true, value: { credentials: { z: '1' } } })
    expect(onlyAdd.ok && onlyAdd.value.deleteCredentials).toBeUndefined()
  })
  it('does not treat a reordered credentials list as a change', () => fails({ credentials: [...profileDraftOf(current).credentials].reverse() }, 'no-change'))

  it('sends only the changed fields, and the version being replaced', () => {
    const r = plan({ displayName: 'Ada King' })
    expect(r).toEqual({ ok: true, value: { displayName: 'Ada King', expectedVersion: 3 } })
  })
  it('marks a federated user\'s changed name and title as overridden, and a local user\'s not', () => {
    const federated = profile({ source: 'federated' })
    const d = { ...profileDraftOf(federated), displayName: 'Ada King', jobTitle: 'Lead' }
    expect(planProfileEdit(d, federated, options)).toMatchObject({ ok: true, value: { displayNameOverridden: true, jobTitleOverridden: true } })
    expect(plan({ displayName: 'Ada King', jobTitle: 'Lead' })).not.toHaveProperty('value.displayNameOverridden')
    const phoneOnly = planProfileEdit({ ...profileDraftOf(federated), phone: '+12125551234' }, federated, options)
    expect(phoneOnly.ok && phoneOnly.value.displayNameOverridden).toBeUndefined()
  })

  it('profileDraftOf sorts the credentials by key', () => {
    expect(profileDraftOf(profile({ credentials: { b: '2', a: '1', c: '3' } })).credentials.map((r) => r.key)).toEqual(['a', 'b', 'c'])
  })
})

describe('planRevertToDirectory', () => {
  const federated = profile({ source: 'federated', displayNameOverridden: true, jobTitleOverridden: false })
  it('refuses a local user and a field that follows the directory already', () => {
    expect(planRevertToDirectory('displayName', profile())).toEqual({ ok: false, failure: 'not-federated', at: 'displayName' })
    expect(planRevertToDirectory('jobTitle', federated)).toEqual({ ok: false, failure: 'not-overridden', at: 'jobTitle' })
  })
  it('sends only the flag turned off, with the version', () => {
    expect(planRevertToDirectory('displayName', federated)).toEqual({ ok: true, value: { displayNameOverridden: false, expectedVersion: 3 } })
    const title = profile({ source: 'federated', jobTitleOverridden: true })
    expect(planRevertToDirectory('jobTitle', title)).toEqual({ ok: true, value: { jobTitleOverridden: false, expectedVersion: 3 } })
  })
})

// ── G1: signature ──────────────────────────────────────────────────────────────────────────────

describe('planSignatureFile and sniffImageType', () => {
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])
  it('recognises PNG and JPEG by their first bytes, and nothing else', () => {
    expect(sniffImageType(png)).toBe('image/png')
    expect(sniffImageType(jpeg)).toBe('image/jpeg')
    expect(sniffImageType(Uint8Array.from([0x47, 0x49, 0x46, 0x38]))).toBeUndefined()
    expect(sniffImageType(Uint8Array.from([0x89, 0x50]))).toBeUndefined()
    expect(sniffImageType(new Uint8Array())).toBeUndefined()
  })
  it('refuses a type that is not PNG or JPEG, or whose bytes say otherwise', () => {
    expect(planSignatureFile({ type: 'image/gif', size: 10, magic: undefined })).toEqual({ ok: false, failure: 'type-not-allowed' })
    expect(planSignatureFile({ type: 'image/png', size: 10, magic: 'image/jpeg' })).toEqual({ ok: false, failure: 'type-not-allowed' })
    expect(planSignatureFile({ type: 'image/png', size: 10, magic: undefined })).toEqual({ ok: false, failure: 'type-not-allowed' })
  })
  it('refuses an empty file and one over 1 MB', () => {
    expect(planSignatureFile({ type: 'image/png', size: 0, magic: 'image/png' })).toEqual({ ok: false, failure: 'empty' })
    expect(planSignatureFile({ type: 'image/png', size: 1_048_577, magic: 'image/png' })).toEqual({ ok: false, failure: 'too-large' })
  })
  it('accepts exactly 1 MB and gives the presign body', () => {
    expect(planSignatureFile({ type: 'image/jpeg', size: 1_048_576, magic: 'image/jpeg' })).toEqual({ ok: true, value: { contentType: 'image/jpeg', byteSize: 1_048_576 } })
  })
})

// ── G2: availability ───────────────────────────────────────────────────────────────────────────

describe('planAvailability', () => {
  const cur = availability({ status: 'available' })
  const from = at('2026-12-01T00:00:00Z')
  const until = at('2026-12-10T00:00:00Z')
  const fails = (draft: Parameters<typeof planAvailability>[0], failure: string, current = cur) => expect(planAvailability(draft, current, NOW)).toMatchObject({ ok: false, failure })

  it('refuses an unknown status', () => fails({ status: 'away', note: '' }, 'invalid-status'))
  it('refuses an out-of-office without a window, naming the missing end', () => {
    expect(planAvailability({ status: 'ooo', note: '' }, cur, NOW)).toEqual({ ok: false, failure: 'window-required', at: 'oooFrom' })
    expect(planAvailability({ status: 'ooo', oooFrom: from, note: '' }, cur, NOW)).toEqual({ ok: false, failure: 'window-required', at: 'oooUntil' })
  })
  it('refuses an inverted, equal, too-long or already-over window', () => {
    fails({ status: 'ooo', oooFrom: until, oooUntil: from, note: '' }, 'window-inverted')
    fails({ status: 'ooo', oooFrom: from, oooUntil: from, note: '' }, 'window-inverted')
    fails({ status: 'ooo', oooFrom: from, oooUntil: addDays(from, 181), note: '' }, 'window-too-long')
    fails({ status: 'ooo', oooFrom: at('2026-11-01T00:00:00Z'), oooUntil: at('2026-11-20T00:00:00Z'), note: '' }, 'window-in-past')
  })
  it('accepts a window of exactly 180 days and one that has started and not ended', () => {
    expect(planAvailability({ status: 'ooo', oooFrom: from, oooUntil: addDays(from, 180), note: '' }, cur, NOW).ok).toBe(true)
    expect(planAvailability({ status: 'ooo', oooFrom: at('2026-11-20T00:00:00Z'), oooUntil: until, note: '' }, cur, NOW).ok).toBe(true)
  })
  it('refuses a note over 500 characters', () => fails({ status: 'busy', note: 'x'.repeat(501) }, 'note-too-long'))
  it('refuses what changes nothing', () => {
    fails({ status: 'available', note: '' }, 'no-change')
    const ooo = availability({ status: 'ooo', oooFrom: from, oooUntil: until, note: 'Leave' })
    fails({ status: 'ooo', oooFrom: from, oooUntil: until, note: ' Leave ' }, 'no-change', ooo)
  })
  it('sends the status, window, trimmed note and version, and never a delegate', () => {
    const r = planAvailability({ status: 'ooo', oooFrom: from, oooUntil: until, note: ' Leave ' }, availability({ delegateUserId: OTHER }), NOW)
    expect(r).toEqual({ ok: true, value: { status: 'ooo', oooFrom: from, oooUntil: until, note: 'Leave', expectedVersion: 2 } })
    expect(JSON.stringify(r)).not.toContain(OTHER)
  })
  it('drops a window the draft still holds when the status is not out-of-office', () => {
    const r = planAvailability({ status: 'busy', oooFrom: from, oooUntil: until, note: '' }, availability({ status: 'ooo', oooFrom: from, oooUntil: until }), NOW)
    expect(r).toEqual({ ok: true, value: { status: 'busy', note: '', expectedVersion: 2 } })
  })
  it('isOoo', () => {
    expect(isOoo(availability({ status: 'ooo' }))).toBe(true)
    expect(isOoo(availability())).toBe(false)
  })
})

// ── G3: delegations ────────────────────────────────────────────────────────────────────────────

describe('planDelegation', () => {
  const base = { delegateId: OTHER, scope: 'all' }
  const fails = (draft: Parameters<typeof planDelegation>[0], failure: string, c = ctx()) => expect(planDelegation(draft, c)).toMatchObject({ ok: false, failure })

  it('refuses no delegate and myself', () => {
    fails({ ...base, delegateId: ' ' }, 'delegate-required')
    fails({ ...base, delegateId: ME }, 'self-delegation')
  })
  it('refuses a scope that is unknown or not offered (tender), a department without an ID, and one I am not in', () => {
    fails({ ...base, scope: 'galaxy' }, 'scope-invalid')
    fails({ ...base, scope: 'tender', scopeId: DEPT }, 'scope-invalid')
    fails({ ...base, scope: 'department' }, 'scope-id-required')
    fails({ ...base, scope: 'department', scopeId: OTHER }, 'scope-not-mine')
  })
  it('refuses a start in the past, but not one exactly now', () => {
    fails({ ...base, startsAt: at('2026-11-26T09:59:59Z') }, 'start-in-past')
    expect(planDelegation({ ...base, startsAt: NOW }, ctx()).ok).toBe(true)
  })
  it('refuses an end that is not after the start (or after now when there is no start)', () => {
    fails({ ...base, endsAt: NOW }, 'window-inverted')
    fails({ ...base, startsAt: at('2026-12-01T00:00:00Z'), endsAt: at('2026-11-30T00:00:00Z') }, 'window-inverted')
  })
  it('refuses a window longer than the policy, and accepts exactly the policy\'s length', () => {
    fails({ ...base, endsAt: addDays(NOW, 91) }, 'window-too-long')
    expect(planDelegation({ ...base, endsAt: addDays(NOW, 90) }, ctx()).ok).toBe(true)
    fails({ ...base, endsAt: addDays(NOW, 31) }, 'window-too-long', ctx({ policy: { maxDurationDays: 30, reviewWindowDays: 30 } }))
  })
  it('refuses a note over 500 characters', () => fails({ ...base, note: 'x'.repeat(501) }, 'note-too-long'))
  it('is open-ended and starts now when it has no dates; sends no empty note', () => {
    expect(planDelegation({ ...base, note: '  ' }, ctx())).toEqual({ ok: true, value: { delegateId: OTHER, scope: 'all' } })
  })
  it('sends the department only for a department scope, with the dates and a trimmed note', () => {
    const r = planDelegation({ delegateId: ` ${OTHER} `, scope: 'department', scopeId: DEPT, startsAt: at('2026-12-01T00:00:00Z'), endsAt: at('2026-12-20T00:00:00Z'), note: ' Away ' }, ctx())
    expect(r).toEqual({ ok: true, value: { delegateId: OTHER, scope: 'department', scopeId: DEPT, startsAt: '2026-12-01T00:00:00.000Z', endsAt: '2026-12-20T00:00:00.000Z', note: 'Away' } })
    const all = planDelegation({ ...base, scopeId: DEPT }, ctx())
    expect(all.ok && all.value.scopeId).toBeUndefined()
  })
})

describe('planExtend', () => {
  const open = delegation({ endsAt: undefined })
  it('refuses a delegation with a fixed end', () => expect(planExtend(delegation(), 10)).toEqual({ ok: false, failure: 'not-review-tracked' }))
  it('refuses days that are not whole numbers from 1 to 180', () => {
    for (const days of [0, -1, 181, 2.5, NaN]) expect(planExtend(open, days), String(days)).toEqual({ ok: false, failure: 'days-out-of-range', at: 'days' })
  })
  it('sends the days and the version', () => {
    expect(planExtend(open, 1)).toEqual({ ok: true, value: { extendDays: 1, recordVersion: 5 } })
    expect(planExtend(open, 180).ok).toBe(true)
  })
  it('isOpenEnded', () => {
    expect(isOpenEnded(open)).toBe(true)
    expect(isOpenEnded(delegation())).toBe(false)
  })
})

describe('planReassign', () => {
  const current = delegation({ delegateId: OTHER, scope: 'all', endsAt: at('2026-12-10T00:00:00Z') })
  const draft = (o: Partial<Parameters<typeof planReassign>[0]> = {}) => ({ delegateId: OTHER, scope: 'all', endsAt: current.endsAt, ...o })
  const fails = (d: ReturnType<typeof draft>, failure: string, cur = current, c = ctx()) => expect(planReassign(d, cur, c)).toMatchObject({ ok: false, failure })

  it('refuses a request that changes nothing (the service would answer 422 invalid_delegate)', () => fails(draft(), 'no-change'))
  it('refuses no delegate, and myself when the delegate changed', () => {
    fails(draft({ delegateId: '' }), 'delegate-required')
    fails(draft({ delegateId: ME }), 'self-delegation')
  })
  it('does not complain about myself when the delegate is unchanged', () => {
    const mine = delegation({ delegateId: ME })
    expect(planReassign({ delegateId: ME, scope: 'all', endsAt: current.endsAt, reason: 'x' }, mine, ctx())).toEqual({ ok: false, failure: 'no-change' })
  })
  it('refuses a changed scope that is invalid, without an ID, or not mine; ignores an unchanged invalid one', () => {
    fails(draft({ scope: 'galaxy' }), 'scope-invalid')
    fails(draft({ scope: 'department' }), 'scope-id-required')
    fails(draft({ scope: 'department', scopeId: OTHER }), 'scope-not-mine')
    const tender = delegation({ scope: 'tender', scopeId: DEPT })
    expect(planReassign({ delegateId: ME + 'x', scope: 'tender', scopeId: DEPT }, tender, ctx())).toMatchObject({ ok: true })
  })
  it('refuses a changed end that is not after now, or beyond the policy (the new delegation starts now)', () => {
    fails(draft({ endsAt: NOW }), 'window-inverted')
    fails(draft({ endsAt: addDays(NOW, 91) }), 'window-too-long')
  })
  it('refuses a reason over 500 characters', () => fails(draft({ delegateId: 'c', reason: 'x'.repeat(501) }), 'reason-too-long'))
  it('treats an absent end against a fixed end as unchanged (the Swagger cannot say "make it open-ended")', () => {
    fails(draft({ endsAt: undefined }), 'no-change')
  })
  it('sends only what changed, a trimmed reason, and the version', () => {
    expect(planReassign(draft({ delegateId: 'new-delegate', reason: ' Cover ' }), current, ctx())).toEqual({ ok: true, value: { newDelegateId: 'new-delegate', reason: 'Cover', recordVersion: 5 } })
    expect(planReassign(draft({ scope: 'department', scopeId: DEPT }), current, ctx())).toEqual({ ok: true, value: { scope: 'department', scopeId: DEPT, recordVersion: 5 } })
    const newEnd = addDays(NOW, 20)
    expect(planReassign(draft({ endsAt: newEnd }), current, ctx())).toEqual({ ok: true, value: { endsAt: newEnd, recordVersion: 5 } })
  })
  it('a change of department within a department scope is a change', () => {
    const inDept = delegation({ scope: 'department', scopeId: OTHER })
    expect(planReassign({ delegateId: OTHER, scope: 'department', scopeId: DEPT, endsAt: inDept.endsAt }, inDept, ctx())).toMatchObject({ ok: true, value: { scope: 'department', scopeId: DEPT } })
  })
})

describe('planCancel', () => {
  it('refuses one that already ended, and gives the version for the query otherwise', () => {
    expect(planCancel(delegation({ status: 'ended' }))).toEqual({ ok: false, failure: 'not-cancellable' })
    expect(planCancel(delegation({ status: 'scheduled' }))).toEqual({ ok: true, value: { recordVersion: 5 } })
  })
})

describe('delegationLabel, reviewState, daysBetween', () => {
  it('says what a delegation covers', () => {
    expect(delegationLabel({ scope: 'all' })).toEqual({ kind: 'all' })
    expect(delegationLabel({ scope: 'department', scopeId: DEPT })).toEqual({ kind: 'department', departmentId: DEPT })
    expect(delegationLabel({ scope: 'tender', scopeId: 't1' })).toEqual({ kind: 'tender', tenderId: 't1' })
  })
  it('puts the review of an open-ended delegation in none, due-soon or overdue', () => {
    const open = (days: number) => ({ endsAt: undefined, reviewDueAt: addDays(NOW, days) })
    expect(reviewState(open(10), NOW)).toBe('none')
    expect(reviewState(open(3), NOW)).toBe('due-soon')
    expect(reviewState(open(1), NOW)).toBe('due-soon')
    expect(reviewState(open(0), NOW)).toBe('overdue')
    expect(reviewState(open(-2), NOW)).toBe('overdue')
  })
  it('has no review for a fixed end or a missing review date', () => {
    expect(reviewState({ endsAt: addDays(NOW, 5), reviewDueAt: addDays(NOW, 1) }, NOW)).toBe('none')
    expect(reviewState({ endsAt: undefined }, NOW)).toBe('none')
  })
  it('re-exports daysBetween', () => expect(daysBetween(NOW, addDays(NOW, 4))).toBe(4))
})

// ── G4: AI preferences ─────────────────────────────────────────────────────────────────────────

describe('planAiPreferences', () => {
  const models = ['model-a', 'model-b']
  const draft = (o: Partial<Parameters<typeof planAiPreferences>[0]> = {}) => ({ preferredModel: 'model-a', writingTone: 'neutral', templates: [], contextDocuments: [], ...o })
  const fails = (d: ReturnType<typeof draft>, failure: string, current = llm(), allowed = models) => expect(planAiPreferences(d, current, allowed)).toMatchObject({ ok: false, failure })

  it('refuses a missing, over-long or not-offered model, even one that is already saved', () => {
    fails(draft({ preferredModel: ' ' }), 'model-required')
    fails(draft({ preferredModel: 'x'.repeat(129) }), 'model-too-long')
    fails(draft({ preferredModel: 'model-z' }), 'model-not-allowed')
    fails(draft(), 'model-not-allowed', llm(), ['model-b'])
    fails(draft(), 'model-not-allowed', llm(), [])
  })
  it('refuses a tone that is not one of the five', () => fails(draft({ writingTone: 'sarcastic' }), 'tone-invalid'))
  it('refuses more than 20 templates, an empty one, and one over 500 characters (naming the row)', () => {
    fails(draft({ templates: Array.from({ length: 21 }, () => 't') }), 'too-many-templates')
    expect(planAiPreferences(draft({ templates: ['ok', '  '] }), llm(), models)).toEqual({ ok: false, failure: 'template-empty', at: 'templates[1]' })
    expect(planAiPreferences(draft({ templates: ['x'.repeat(501)] }), llm(), models)).toEqual({ ok: false, failure: 'template-too-long', at: 'templates[0]' })
  })
  it('refuses more than 10 snippets and one over 1000 characters', () => {
    fails(draft({ contextDocuments: Array.from({ length: 11 }, () => 's') }), 'too-many-snippets')
    expect(planAiPreferences(draft({ contextDocuments: ['x'.repeat(1001)] }), llm(), models)).toEqual({ ok: false, failure: 'snippet-too-long', at: 'contextDocuments[0]' })
  })
  it('refuses a draft that changes nothing', () => fails(draft(), 'no-change'))
  it('accepts exactly the limits', () => {
    const r = planAiPreferences(draft({ templates: Array.from({ length: 20 }, () => 'x'.repeat(500)), contextDocuments: Array.from({ length: 10 }, () => 'y'.repeat(1000)) }), llm(), models)
    expect(r.ok).toBe(true)
  })
  it('sends the whole body with the version being replaced', () => {
    expect(planAiPreferences(draft({ preferredModel: ' model-b ', writingTone: 'formal', templates: [' a '], contextDocuments: [''] }), llm(), models)).toEqual({
      ok: true,
      value: { preferredModel: 'model-b', writingTone: 'formal', templates: ['a'], contextDocuments: [''], expectedVersion: 4 },
    })
  })
  it('sends no version when nothing is saved yet', () => {
    const r = planAiPreferences(draft(), undefined, models)
    expect(r).toEqual({ ok: true, value: { preferredModel: 'model-a', writingTone: 'neutral', templates: [], contextDocuments: [] } })
  })
  it('notices a changed template or snippet', () => {
    expect(planAiPreferences(draft({ templates: ['a'] }), llm({ templates: ['b'] }), models).ok).toBe(true)
    expect(planAiPreferences(draft({ templates: ['a'], contextDocuments: ['c'] }), llm({ templates: ['a'], contextDocuments: ['d'] }), models).ok).toBe(true)
    expect(planAiPreferences(draft({ templates: ['a'] }), llm({ templates: ['a', 'b'] }), models).ok).toBe(true)
    expect(planAiPreferences(draft({ writingTone: 'formal' }), llm(), models).ok).toBe(true)
  })
})

// ── G5: notification preferences ───────────────────────────────────────────────────────────────

describe('planNotificationPreferences', () => {
  const types = ['doc.approved', 'doc.rejected']
  const stored = [{ eventType: 'doc.approved', channels: ['email' as const], urgencyThreshold: 'normal' as const }]
  const row = (o: Partial<NotificationDraftRow> = {}): NotificationDraftRow => ({ eventType: 'doc.rejected', channels: ['email'], urgencyThreshold: 'any', ...o })
  const fails = (rows: NotificationDraftRow[], failure: string, at?: string, current = stored) => {
    const r = planNotificationPreferences(rows, types, current)
    expect(r).toMatchObject({ ok: false, failure })
    if (at) expect(r).toMatchObject({ at })
  }

  it('refuses a repeated event type', () => fails([row(), row()], 'duplicate-event-type', 'preferences[1]'))
  it('refuses an event type that is over-long, or not configured and not stored', () => {
    fails([row({ eventType: 'e'.repeat(101) })], 'event-type-too-long')
    fails([row({ eventType: 'doc.unknown' })], 'event-type-unknown', 'preferences[0]')
  })
  it('keeps a stored event type that is no longer configured', () => {
    const legacy = [{ eventType: 'doc.old', channels: ['sms' as const], urgencyThreshold: 'high' as const }]
    expect(planNotificationPreferences([{ eventType: 'doc.old', channels: ['push'], urgencyThreshold: 'high' }], types, legacy)).toMatchObject({ ok: true })
  })
  it('refuses a channel or an urgency that does not exist', () => {
    fails([row({ channels: ['fax'] })], 'channel-invalid')
    fails([row({ urgencyThreshold: 'whenever' })], 'urgency-invalid')
  })
  it('refuses what changes nothing, whatever the order of rows or channels', () => {
    fails([{ eventType: 'doc.approved', channels: ['email'], urgencyThreshold: 'normal' }], 'no-change')
    const two = [
      { eventType: 'a', channels: ['email' as const, 'sms' as const], urgencyThreshold: 'any' as const },
      { eventType: 'b', channels: ['push' as const], urgencyThreshold: 'high' as const },
    ]
    const r = planNotificationPreferences([{ eventType: 'b', channels: ['push'], urgencyThreshold: 'high' }, { eventType: 'a', channels: ['sms', 'email', 'email'], urgencyThreshold: 'any' }], ['a', 'b'], two)
    expect(r).toEqual({ ok: false, failure: 'no-change' })
  })
  it('sends the whole list, with channels de-duplicated', () => {
    const r = planNotificationPreferences([row({ channels: ['email', 'email', 'in_app'] }), { eventType: 'doc.approved', channels: ['email'], urgencyThreshold: 'normal' }], types, stored)
    expect(r).toEqual({
      ok: true,
      value: [
        { eventType: 'doc.rejected', channels: ['email', 'in_app'], urgencyThreshold: 'any' },
        { eventType: 'doc.approved', channels: ['email'], urgencyThreshold: 'normal' },
      ],
    })
  })
  it('accepts an empty list (reset to system defaults) when something is stored, and refuses it when nothing is', () => {
    expect(planNotificationPreferences([], types, stored)).toEqual({ ok: true, value: [] })
    expect(planNotificationPreferences([], types, [])).toEqual({ ok: false, failure: 'no-change' })
  })
  it('accepts a row with no channels (it mutes the event type)', () => {
    expect(planNotificationPreferences([row({ channels: [] })], types, stored)).toMatchObject({ ok: true })
  })
})

describe('limits', () => {
  it('match the Swagger and the LLD', () => {
    expect(LIMITS).toMatchObject({ displayName: 200, jobTitle: 200, credentialKeys: 32, note: 500, oooWindowDays: 180, signatureBytes: 1_048_576, templates: 20, snippets: 10, extendDaysMax: 180 })
    expect(policy.maxDurationDays).toBe(90)
    expect(version(1)).toBe(1)
  })
})

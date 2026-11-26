// Builders for domain values: a complete valid one, overridden per test.
import type { Availability } from '../../src/domain/entities/availability'
import type { Delegation, DelegationPolicy } from '../../src/domain/entities/delegation'
import type { LlmPreferences } from '../../src/domain/entities/preferences'
import type { MyProfile } from '../../src/domain/entities/profile'
import { parseInstant, type Instant } from '../../src/domain/value-objects/Instant'
import type { RecordVersion } from '../../src/domain/value-objects/RecordVersion'
import type { DelegationContext } from '../../src/domain/rules/me-rules'

export const at = (iso: string): Instant => parseInstant(iso)!
export const version = (n: number) => n as RecordVersion
export const NOW = at('2026-11-26T10:00:00Z')
export const ME = '11111111-1111-4111-8111-111111111111'
export const OTHER = '22222222-2222-4222-8222-222222222222'
export const DEPT = '33333333-3333-4333-8333-333333333333'

export const profile = (o: Partial<MyProfile> = {}): MyProfile => ({
  userId: ME,
  displayName: 'Ada Lovelace',
  displayNameOverridden: false,
  jobTitle: 'Engineer',
  jobTitleOverridden: false,
  email: 'ada@example.com',
  phone: '' as MyProfile['phone'],
  timezone: 'Europe/London',
  locale: 'en',
  credentials: {},
  source: 'local',
  status: 'active',
  provisional: false,
  recordVersion: version(3),
  ...o,
})

export const availability = (o: Partial<Availability> = {}): Availability => ({ status: 'available', recordVersion: version(2), ...o })

export const delegation = (o: Partial<Delegation> = {}): Delegation => ({
  delegationId: '44444444-4444-4444-8444-444444444444',
  delegatorId: ME,
  delegateId: OTHER,
  scope: 'all',
  endsAt: at('2026-12-10T00:00:00Z'),
  status: 'active',
  recordVersion: version(5),
  ...o,
})

export const policy: DelegationPolicy = { maxDurationDays: 90, reviewWindowDays: 90 }
export const ctx = (o: Partial<DelegationContext> = {}): DelegationContext => ({ me: ME, policy, myDepartments: [DEPT], now: NOW, ...o })

export const llm = (o: Partial<LlmPreferences> = {}): LlmPreferences => ({
  preferredModel: 'model-a',
  writingTone: 'neutral',
  templates: [],
  contextDocuments: [],
  recordVersion: version(4),
  ...o,
})

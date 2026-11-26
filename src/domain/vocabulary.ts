// IAM's closed wire vocabulary (spec §2.1): the codes the services send and accept. They are data
// for request bodies and badges, never used to decide access: permission checks go through the SDK
// (useHasPermission, <Can>), and test/unit/sdk/dependency-rules.test.ts rejects these literals
// anywhere else in src/.

/** Availability (User Profile `AvailabilityStatus`). */
export const AVAILABILITY = ['available', 'busy', 'ooo'] as const
export type Availability = (typeof AVAILABILITY)[number]

/** Writing tones (User Profile `WritingTone`). */
export const WRITING_TONES = ['formal', 'technical', 'concise', 'persuasive', 'neutral'] as const
export type WritingTone = (typeof WRITING_TONES)[number]

/** Notification channels. The Swagger types them as free strings; these are the four the spec names (v0.2 G5). */
export const CHANNELS = ['email', 'sms', 'in_app', 'push'] as const
export type Channel = (typeof CHANNELS)[number]

/** Minimum urgency (User Profile `UrgencyThreshold`). */
export const URGENCY = ['any', 'normal', 'high', 'critical'] as const
export type Urgency = (typeof URGENCY)[number]

/**
 * Delegation scopes. The Delegation Swagger types `scope` as a free string; `all` / `department` /
 * `tender` are assumed (LLD §15 #6). `tender` is read but not offered this release (§15 #7).
 */
export const DELEGATION_SCOPES = ['all', 'department', 'tender'] as const
export type DelegationScope = (typeof DELEGATION_SCOPES)[number]
/** The scopes this release lets a member choose. */
export const OFFERED_SCOPES = ['all', 'department'] as const satisfies readonly DelegationScope[]

/** Delegation statuses. DLG-1 returns only `scheduled` and `active`; `ended` is read defensively (§15 #5, #6). */
export const DELEGATION_STATUSES = ['scheduled', 'active', 'ended'] as const
export type DelegationStatus = (typeof DELEGATION_STATUSES)[number]

/** Signature upload content types (User Profile `SignatureContentType`). */
export const SIGNATURE_TYPES = ['image/png', 'image/jpeg'] as const
export type SignatureType = (typeof SIGNATURE_TYPES)[number]

/** Department levels. The tenant's own labels come from P-12; the code never changes. */
export const DEPARTMENT_LEVELS = ['preparator', 'reviewer', 'approver'] as const
export type DepartmentLevel = (typeof DEPARTMENT_LEVELS)[number]

/** Tenant roles, shown read-only on "My access" (`member` is implicit and never listed). */
export const TENANT_ROLES = ['tenant_owner', 'tenant_admin', 'tender_admin'] as const
export type TenantRole = (typeof TENANT_ROLES)[number]

/** The catalogue key naming each tenant role on "My access" (data, like the codes: no role literal lives outside this file). */
export const TENANT_ROLE_KEYS = {
  tenant_owner: 'access.role.owner',
  tenant_admin: 'access.role.admin',
  tender_admin: 'access.role.tenderAdmin',
} as const satisfies Record<TenantRole, string>

/** The role P-35 always returns and IAM never stores. */
export const IMPLICIT_ROLE = 'member'

/** Profile source (User Profile `source`): `federated` users get "From your company directory" (IAM-UX-11). */
export const USER_SOURCES = ['local', 'federated'] as const
export type UserSource = (typeof USER_SOURCES)[number]

/** Profile status. */
export const USER_STATUSES = ['active', 'disabled', 'deleted'] as const
export type UserStatus = (typeof USER_STATUSES)[number]

/** The languages the shell offers today: only English. A saved language outside it is kept, never silently changed. */
export const ENABLED_LOCALES = ['en'] as const

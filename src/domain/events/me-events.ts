// Closed value sets for the remote's telemetry (docs/observability/metrics.md). They are the metric
// label vocabularies, so every `action`, `resource`, `outcome` and `stage` the code records is one of
// these; a new value is added here and on that page in the same change.

/** What a write does (label `action`). */
export const ME_ACTIONS = [
  'update_profile',
  'revert_directory_value',
  'upload_signature',
  'remove_signature',
  'set_availability',
  'create_delegation',
  'extend_delegation',
  'reassign_delegation',
  'cancel_delegation',
  'save_ai_preferences',
  'save_notification_preferences',
] as const
export type MeAction = (typeof ME_ACTIONS)[number]

/** What an action ended in: `failure` is a business rejection, `error` a fault (the registry's vocabulary). */
export const ACTION_OUTCOMES = ['success', 'failure', 'error'] as const
export type ActionOutcome = (typeof ACTION_OUTCOMES)[number]

/** What a data load reads (label `resource`). */
export const LOAD_RESOURCES = [
  'profile',
  'availability',
  'delegations',
  'delegation_policy',
  'members',
  'user_profiles',
  'departments',
  'role_labels',
  'ai_preferences',
  'notification_preferences',
] as const
export type LoadResource = (typeof LOAD_RESOURCES)[number]

/** A load has no business rejection. */
export const LOAD_OUTCOMES = ['success', 'error'] as const
export type LoadOutcome = (typeof LOAD_OUTCOMES)[number]

/** Where a signature upload failed (label `stage`; LLD §7.3). */
export const UPLOAD_STAGES = ['prepare', 'presign', 'upload', 'confirm'] as const
export type UploadStage = (typeof UPLOAD_STAGES)[number]

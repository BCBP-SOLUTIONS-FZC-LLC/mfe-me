import type { Instant } from '../value-objects/Instant'
import type { RecordVersion } from '../value-objects/RecordVersion'
import type { Channel, Urgency, WritingTone } from '../vocabulary'

/** My AI drafting preferences (`GET /users/:id/llm-preferences`; a 404 means none saved yet). */
export interface LlmPreferences {
  readonly preferredModel: string
  readonly writingTone: WritingTone
  readonly templates: readonly string[]
  readonly contextDocuments: readonly string[]
  readonly recordVersion: RecordVersion
  readonly updatedAt?: Instant
}

/** The body of `PUT /llm-preferences`: a full replacement. `expectedVersion` is absent when nothing is saved yet. */
export interface LlmPreferencesUpdate {
  readonly preferredModel: string
  readonly writingTone: WritingTone
  readonly templates: readonly string[]
  readonly contextDocuments: readonly string[]
  readonly expectedVersion?: RecordVersion
}

/** One event type's notification setting. The list has no version (LLD §15 #10). */
export interface NotificationPreference {
  readonly eventType: string
  readonly channels: readonly Channel[]
  readonly urgencyThreshold: Urgency
}

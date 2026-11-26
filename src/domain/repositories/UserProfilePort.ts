import type { Availability, AvailabilityUpdate } from '../entities/availability'
import type { LlmPreferences, LlmPreferencesUpdate, NotificationPreference } from '../entities/preferences'
import type { MyProfile, ProfilePatch, UserBatch } from '../entities/profile'
import type { PresignedUpload, PresignRequest, SignatureConfirmation, SignatureConfirmRequest } from '../entities/signature'

/**
 * User Profile (IAM), the routes of the User Profile Swagger this remote calls. Every method takes an
 * optional abort signal; adapters map snake_case to these types, and the caller's ID appears only in
 * the path (IAM-UX-1). Writes that can fail on a stale version reject with a `409` problem; the port
 * does not retry.
 */
export interface UserProfilePort {
  /** `GET /users/:id` */
  getUser(userId: string, signal?: AbortSignal): Promise<MyProfile>
  /** `PATCH /users/:id` */
  updateUser(userId: string, patch: ProfilePatch, signal?: AbortSignal): Promise<MyProfile>
  /** `POST /users:batch`: 1 to 200 distinct IDs per call (the caller chunks; see userBatcher). */
  batch(ids: readonly string[], signal?: AbortSignal): Promise<UserBatch>

  /** `GET /users/:id/availability` */
  getAvailability(userId: string, signal?: AbortSignal): Promise<Availability>
  /** `PUT /users/:id/availability` */
  putAvailability(userId: string, update: AvailabilityUpdate, signal?: AbortSignal): Promise<Availability>

  /** `GET /users/:id/llm-preferences`: `undefined` when none are saved yet (a 404). */
  getLlmPreferences(userId: string, signal?: AbortSignal): Promise<LlmPreferences | undefined>
  /** `PUT /users/:id/llm-preferences` (full replacement) */
  putLlmPreferences(userId: string, update: LlmPreferencesUpdate, signal?: AbortSignal): Promise<LlmPreferences>

  /** `GET /users/:id/notification-preferences` */
  getNotificationPreferences(userId: string, signal?: AbortSignal): Promise<readonly NotificationPreference[]>
  /** `PUT /users/:id/notification-preferences`: the whole list; an empty list resets to system defaults. */
  putNotificationPreferences(userId: string, preferences: readonly NotificationPreference[], signal?: AbortSignal): Promise<readonly NotificationPreference[]>

  /** `POST /users/:id/signature`: asks for a presigned upload URL (10 a minute per user). */
  presignSignature(userId: string, request: PresignRequest, signal?: AbortSignal): Promise<PresignedUpload>
  /** `PUT /users/:id/signature`: confirms the upload by key and hash. */
  confirmSignature(userId: string, request: SignatureConfirmRequest, signal?: AbortSignal): Promise<SignatureConfirmation>
  /** `DELETE /users/:id/signature` (204): marks the signature for erasure. */
  deleteSignature(userId: string, signal?: AbortSignal): Promise<void>
}

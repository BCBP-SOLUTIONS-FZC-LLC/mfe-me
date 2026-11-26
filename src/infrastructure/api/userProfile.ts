// User Profile over the SDK ApiClient. The caller's ID appears only in the path (IAM-UX-1); the User
// Profile service checks it against the token. Route templates start at /v1: the client adds /api.
// Nothing here retries a write: the ApiClient already retries safe calls with Retry-After, and a 409
// or 422 is the answer.
import { isProblemError } from '@bcbp-solutions-fzc-llc/frontend-sdk/problem'
import type { UserProfilePort } from '../../domain/repositories/UserProfilePort'
import {
  toAvailability,
  toAvailabilityBody,
  toConfirmBody,
  toLlmPreferences,
  toLlmPreferencesBody,
  toMyProfile,
  toNotificationPreferences,
  toNotificationPreferencesBody,
  toPresignBody,
  toPresignedUpload,
  toProfilePatchBody,
  toSignatureConfirmation,
  toUserBatch,
} from './mappers'
import { withSignal, type ApiScope } from './scope'

/**
 * The SDK's route-template parser reads any `:name` as a path parameter, so `/users:batch` (a
 * Google-style custom method) is parsed as the template `/users` plus a parameter `:batch`, and the
 * client then refuses the call unless `batch` is passed. Passing the literal `:batch` as that
 * parameter sends `/api/v1/users%3Abatch`; a server that decodes the path before routing (Gin does
 * by default) serves it. If the gateway or service does not, the fix is in the SDK: only treat a
 * `:name` at the start of a path segment as a parameter. LLD §15 #19.
 */
const BATCH_PARAMS = { batch: ':batch' } as const

export function createUserProfileAdapter(scope: ApiScope): UserProfilePort {
  const { client } = scope
  const sig = withSignal
  const id = (userId: string) => ({ id: userId })
  return {
    async getUser(userId, signal) {
      const res = await client.get('/v1/users/:id', { params: id(userId), ...sig(signal) })
      return toMyProfile(res.data)
    },
    async updateUser(userId, patch, signal) {
      const res = await client.patch('/v1/users/:id', { params: id(userId), body: toProfilePatchBody(patch), ...sig(signal) })
      return toMyProfile(res.data)
    },
    async batch(ids, signal) {
      const res = await client.post('/v1/users:batch', { params: BATCH_PARAMS, body: { ids: [...ids] }, ...sig(signal) })
      return toUserBatch(res.data)
    },

    async getAvailability(userId, signal) {
      const res = await client.get('/v1/users/:id/availability', { params: id(userId), ...sig(signal) })
      return toAvailability(res.data)
    },
    async putAvailability(userId, update, signal) {
      const res = await client.put('/v1/users/:id/availability', { params: id(userId), body: toAvailabilityBody(update), ...sig(signal) })
      return toAvailability(res.data)
    },

    async getLlmPreferences(userId, signal) {
      try {
        const res = await client.get('/v1/users/:id/llm-preferences', { params: id(userId), ...sig(signal) })
        return toLlmPreferences(res.data)
      } catch (error) {
        // Nothing saved yet is a 404, not a failure (LLD §7.6): the screen starts from defaults.
        if (isProblemError(error) && error.status === 404) return undefined
        throw error
      }
    },
    async putLlmPreferences(userId, update, signal) {
      const res = await client.put('/v1/users/:id/llm-preferences', { params: id(userId), body: toLlmPreferencesBody(update), ...sig(signal) })
      return toLlmPreferences(res.data)
    },

    async getNotificationPreferences(userId, signal) {
      const res = await client.get('/v1/users/:id/notification-preferences', { params: id(userId), ...sig(signal) })
      return toNotificationPreferences(res.data)
    },
    async putNotificationPreferences(userId, preferences, signal) {
      const res = await client.put('/v1/users/:id/notification-preferences', { params: id(userId), body: toNotificationPreferencesBody(preferences), ...sig(signal) })
      return toNotificationPreferences(res.data)
    },

    async presignSignature(userId, request, signal) {
      const res = await client.post('/v1/users/:id/signature', { params: id(userId), body: toPresignBody(request), ...sig(signal) })
      return toPresignedUpload(res.data, request.contentType)
    },
    async confirmSignature(userId, request, signal) {
      const res = await client.put('/v1/users/:id/signature', { params: id(userId), body: toConfirmBody(request), ...sig(signal) })
      return toSignatureConfirmation(res.data, res.status)
    },
    async deleteSignature(userId, signal) {
      await client.delete('/v1/users/:id/signature', { params: id(userId), ...sig(signal) })
    },
  }
}

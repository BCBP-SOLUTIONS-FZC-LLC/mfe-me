// The one request this remote makes that is not an SDK ApiClient call: the signature bytes go straight to
// object storage at the presigned URL (IAM-UX-13, LLD §7.3, ADR 0006). It has to be a raw fetch because
// the client takes path templates only (it always prefixes `api.baseUrl`) and because this request must be
// different from every API call: another origin, no token, no cookies, no trace or session headers, no
// redirects, a deadline. The URL is a bearer credential until it expires: it is checked against the
// allowed origins first, and never logged, put in an error message or stored. This is the only file in
// src/ that may call fetch (test/unit/sdk/dependency-rules.test.ts).
import { isAllowedOrigin } from '@bcbp-solutions-fzc-llc/frontend-sdk/security'
import type { SignatureStoragePort } from '../../domain/repositories/SignatureStoragePort'

/** How long the browser waits for storage before giving up. */
export const UPLOAD_TIMEOUT_MS = 60_000

export type StorageFailure = 'origin-not-allowed' | 'rejected' | 'unreachable'

/** The upload did not happen. Carries a reason and, for a refusal by storage, its status; never the URL. */
export class SignatureStorageError extends Error {
  override readonly name = 'SignatureStorageError'
  readonly reason: StorageFailure
  readonly status: number | undefined
  constructor(reason: StorageFailure, status?: number) {
    super(`signature storage: ${reason}${status !== undefined ? ` (${status})` : ''}`)
    this.reason = reason
    this.status = status
  }
}

/** Aborts when either signal does. `AbortSignal.any` is newer than the browsers this platform still serves (Safari before 17.4, Firefox before 124), so it is not assumed. */
export function eitherAborts(a: AbortSignal, b: AbortSignal): AbortSignal {
  if (typeof AbortSignal.any === 'function') return AbortSignal.any([a, b])
  const controller = new AbortController()
  const abort = (from: AbortSignal) => () => controller.abort(from.reason)
  for (const s of [a, b]) {
    if (s.aborted) {
      controller.abort(s.reason)
      break
    }
    s.addEventListener('abort', abort(s), { once: true })
  }
  return controller.signal
}

/** Whether `url` is https on one of the exact allowed origins (and passes the SDK's own check). */
export function isAllowedUploadUrl(url: string, allowedOrigins: readonly string[]): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && allowedOrigins.includes(parsed.origin) && isAllowedOrigin(url, allowedOrigins)
  } catch {
    return false
  }
}

/** `uploadOrigins` is read at each call (the runtime config loads after this module does). */
export function createSignatureStorage(uploadOrigins: () => readonly string[]): SignatureStoragePort {
  return {
    async put(upload, bytes, signal) {
      if (!isAllowedUploadUrl(upload.uploadUrl, uploadOrigins())) throw new SignatureStorageError('origin-not-allowed')
      const deadline = AbortSignal.timeout(UPLOAD_TIMEOUT_MS)
      let response: Response
      try {
        response = await fetch(upload.uploadUrl, {
          method: 'PUT',
          body: bytes as BodyInit,
          // Exactly what the presigned URL was signed for, and nothing else.
          headers: { 'Content-Type': upload.contentType },
          credentials: 'omit',
          redirect: 'error',
          referrerPolicy: 'no-referrer',
          signal: signal ? eitherAborts(signal, deadline) : deadline,
        })
      } catch (error) {
        // The caller walking away is not a storage failure; anything else (network, CORS, the deadline) is.
        if (signal?.aborted) throw error
        throw new SignatureStorageError('unreachable')
      }
      if (!response.ok) throw new SignatureStorageError('rejected', response.status)
    },
  }
}

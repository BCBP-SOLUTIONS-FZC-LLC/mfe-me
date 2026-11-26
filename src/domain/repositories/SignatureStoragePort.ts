import type { PresignedUpload } from '../entities/signature'

/**
 * The one cross-origin write that is not an API call: the bytes go straight to object storage at the
 * presigned URL (IAM-UX-13, LLD §7.3). The implementation sends no credentials, refuses a URL outside
 * the allowed origins, and never logs the URL. It rejects when storage does not answer 2xx.
 */
export interface SignatureStoragePort {
  put(upload: PresignedUpload, bytes: Uint8Array, signal?: AbortSignal): Promise<void>
}

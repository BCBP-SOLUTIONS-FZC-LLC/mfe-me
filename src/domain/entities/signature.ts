import type { Instant } from '../value-objects/Instant'
import type { SignatureType } from '../vocabulary'

/** What the presign call asks: the image's type and size. */
export interface PresignRequest {
  readonly contentType: SignatureType
  readonly byteSize: number
}

/** A short-lived upload URL. `uploadUrl` is a bearer credential until it expires: never logged, shown or stored. */
export interface PresignedUpload {
  readonly uploadUrl: string
  readonly objectKey: string
  /** Seconds. */
  readonly expiresIn: number
  readonly contentType: SignatureType
}

/** What confirms the upload: the key the service issued and the SHA-256 of the bytes (lowercase hex). */
export interface SignatureConfirmRequest {
  readonly objectKey: string
  readonly sha256: string
}

export interface SignatureConfirmation {
  readonly signatureImageHash: string
  readonly signatureKey: string
  readonly updatedAt?: Instant
  /** `created` for a first upload (201), `replaced` for a new one over an old one (200). */
  readonly outcome: 'created' | 'replaced'
}

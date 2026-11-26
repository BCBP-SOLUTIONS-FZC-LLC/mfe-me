// Uploads my signature (IAM-UX-13, LLD §7.3): check the file, re-encode it as PNG, hash it, ask User
// Profile for a presigned URL, put the bytes to storage, confirm by key and hash. One file, one
// attempt: a failure at any stage stops there and the next try starts again from the presign (the URL
// is short-lived and bound to the exact content type and key). The stage is reported to telemetry.
import type { PresignedUpload, SignatureConfirmation } from '../../domain/entities/signature'
import type { SignatureStoragePort } from '../../domain/repositories/SignatureStoragePort'
import type { UserProfilePort } from '../../domain/repositories/UserProfilePort'
import { planSignatureFile, sniffImageType, type SignatureFileFailure } from '../../domain/rules/me-rules'
import type { UploadStage } from '../../domain/events/me-events'
import type { Hasher } from '../ports/hashing'
import type { CropRect, ImageProcessor, SignatureSource } from '../ports/media'
import type { MeTelemetry } from '../ports/telemetry'

/**
 * A signature upload that stopped at `stage`. `cause` is what went wrong: for `presign` and `confirm`
 * the SDK's problem error (the screen reads its code: erasure pending, too large, rate limited); for
 * `prepare` and `upload` anything else. `refusal` names the rule that refused the file, if one did.
 */
export class SignatureUploadError extends Error {
  readonly name = 'SignatureUploadError'
  readonly stage: UploadStage
  readonly refusal: SignatureFileFailure | undefined

  constructor(stage: UploadStage, cause: unknown, refusal?: SignatureFileFailure) {
    super(`signature upload failed at ${stage}`, { cause })
    this.stage = stage
    this.refusal = refusal
  }
}

export interface UploadSignatureInput {
  readonly userId: string
  readonly file: SignatureSource
  readonly crop?: CropRect
  readonly signal?: AbortSignal
}

export interface UploadSignatureDependencies {
  readonly userProfile: Pick<UserProfilePort, 'presignSignature' | 'confirmSignature'>
  readonly storage: SignatureStoragePort
  readonly images: ImageProcessor
  readonly hasher: Hasher
  readonly telemetry: Pick<MeTelemetry, 'signatureUploadFailed'>
}

export class UploadSignatureUseCase {
  private readonly deps: UploadSignatureDependencies

  constructor(deps: UploadSignatureDependencies) {
    this.deps = deps
  }

  async execute({ userId, file, crop, signal }: UploadSignatureInput): Promise<SignatureConfirmation> {
    const { userProfile, storage, images, hasher, telemetry } = this.deps
    const fail = (stage: UploadStage, cause: unknown, refusal?: SignatureFileFailure): never => {
      // An abort is the user walking away, not a failure of the upload.
      if (!(signal?.aborted ?? false)) telemetry.signatureUploadFailed(stage)
      throw new SignatureUploadError(stage, cause, refusal)
    }

    // prepare: the picked file by MIME and magic bytes, then the PNG that will be sent.
    const picked = planSignatureFile({ type: file.mimeType, size: file.bytes.length, magic: sniffImageType(file.bytes) })
    if (!picked.ok) return fail('prepare', new Error(picked.failure), picked.failure)
    let png: Uint8Array
    let sha256: string
    let request
    try {
      png = await images.toPng(file, crop, signal)
      const final = planSignatureFile({ type: 'image/png', size: png.length, magic: sniffImageType(png) })
      if (!final.ok) return fail('prepare', new Error(final.failure), final.failure)
      request = final.value
      sha256 = await hasher.sha256Hex(png)
    } catch (error) {
      if (error instanceof SignatureUploadError) throw error
      return fail('prepare', error)
    }

    let upload: PresignedUpload
    try {
      upload = await userProfile.presignSignature(userId, request, signal)
    } catch (error) {
      return fail('presign', error)
    }

    try {
      await storage.put(upload, png, signal)
    } catch (error) {
      return fail('upload', error)
    }

    try {
      return await userProfile.confirmSignature(userId, { objectKey: upload.objectKey, sha256 }, signal)
    } catch (error) {
      return fail('confirm', error)
    }
  }
}

// The signature upload, stage by stage (LLD §7.3): prepare → presign → upload → confirm. A failure stops
// at its stage, is reported once to telemetry, and keeps the cause for the screen's message.
import { describe, expect, it, rs } from '@rstest/core'
import { SignatureUploadError, UploadSignatureUseCase, type UploadSignatureDependencies } from '../../../src/application/use-cases/UploadSignatureUseCase'
import type { PresignedUpload, SignatureConfirmation } from '../../../src/domain/entities/signature'

const PNG_HEAD = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const png = (extra = 4) => Uint8Array.from([...PNG_HEAD, ...Array.from({ length: extra }, (_, i) => i)])
const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])
const upload: PresignedUpload = { uploadUrl: 'https://bucket.example/secret?sig=abc', objectKey: 'k/signatures/sig.png', expiresIn: 300, contentType: 'image/png' }
const confirmation: SignatureConfirmation = { signatureImageHash: 'h', signatureKey: 'k/signatures/sig.png', outcome: 'created' }

function setup(o: Partial<UploadSignatureDependencies> = {}) {
  const calls: string[] = []
  const failures: string[] = []
  const deps: UploadSignatureDependencies = {
    userProfile: {
      presignSignature: rs.fn(async () => (calls.push('presign'), upload)),
      confirmSignature: rs.fn(async () => (calls.push('confirm'), confirmation)),
    },
    storage: { put: rs.fn(async () => void calls.push('put')) },
    images: { toPng: rs.fn(async () => (calls.push('toPng'), png())) },
    hasher: { sha256Hex: rs.fn(async () => (calls.push('hash'), 'f'.repeat(64))) },
    telemetry: { signatureUploadFailed: (stage) => void failures.push(stage) },
    ...o,
  }
  return { useCase: new UploadSignatureUseCase(deps), deps, calls, failures }
}
const input = { userId: 'u1', file: { bytes: jpeg, mimeType: 'image/jpeg' } }
const stageOf = async (p: Promise<unknown>) => {
  const error = await p.then(() => undefined, (e: unknown) => e)
  expect(error).toBeInstanceOf(SignatureUploadError)
  return error as SignatureUploadError
}

describe('UploadSignatureUseCase', () => {
  it('runs prepare, presign, upload and confirm in order, and confirms the key and hash of the PNG it sent', async () => {
    const { useCase, deps, calls, failures } = setup()
    await expect(useCase.execute(input)).resolves.toBe(confirmation)
    expect(calls).toEqual(['toPng', 'hash', 'presign', 'put', 'confirm'])
    expect(deps.userProfile.presignSignature).toHaveBeenCalledWith('u1', { contentType: 'image/png', byteSize: png().length }, undefined)
    expect(deps.storage.put).toHaveBeenCalledWith(upload, png(), undefined)
    expect(deps.userProfile.confirmSignature).toHaveBeenCalledWith('u1', { objectKey: upload.objectKey, sha256: 'f'.repeat(64) }, undefined)
    expect(failures).toEqual([])
  })

  it('passes the crop and the abort signal through', async () => {
    const { useCase, deps } = setup()
    const crop = { x: 1, y: 2, width: 3, height: 4 }
    const controller = new AbortController()
    await useCase.execute({ ...input, crop, signal: controller.signal })
    expect(deps.images.toPng).toHaveBeenCalledWith(input.file, crop, controller.signal)
    expect(deps.storage.put).toHaveBeenCalledWith(upload, png(), controller.signal)
  })

  it('stops at prepare for a file whose bytes are not an image, and never asks for a URL', async () => {
    const { useCase, deps, failures } = setup()
    const error = await stageOf(useCase.execute({ userId: 'u1', file: { bytes: Uint8Array.from([1, 2, 3]), mimeType: 'image/png' } }))
    expect(error.stage).toBe('prepare')
    expect(error.refusal).toBe('type-not-allowed')
    expect(deps.userProfile.presignSignature).not.toHaveBeenCalled()
    expect(failures).toEqual(['prepare'])
  })

  it('stops at prepare for an empty file or one over 1 MB', async () => {
    const big = new Uint8Array(1_048_577)
    big.set(PNG_HEAD)
    expect((await stageOf(setup().useCase.execute({ userId: 'u', file: { bytes: big, mimeType: 'image/png' } }))).refusal).toBe('too-large')
    const empty = await stageOf(setup().useCase.execute({ userId: 'u', file: { bytes: new Uint8Array(), mimeType: 'image/png' } }))
    expect(empty.refusal).toBe('type-not-allowed')
  })

  it('stops at prepare when the image cannot be decoded, keeping the cause', async () => {
    const boom = new Error('decode failed')
    const { useCase, failures } = setup({ images: { toPng: async () => Promise.reject(boom) } })
    const error = await stageOf(useCase.execute(input))
    expect(error.stage).toBe('prepare')
    expect(error.cause).toBe(boom)
    expect(error.refusal).toBeUndefined()
    expect(failures).toEqual(['prepare'])
  })

  it('stops at prepare when the re-encoded image is over 1 MB', async () => {
    const huge = new Uint8Array(1_048_577)
    huge.set(PNG_HEAD)
    const { useCase, deps } = setup({ images: { toPng: async () => huge } })
    const error = await stageOf(useCase.execute(input))
    expect(error).toMatchObject({ stage: 'prepare', refusal: 'too-large' })
    expect(deps.userProfile.presignSignature).not.toHaveBeenCalled()
  })

  it('stops at prepare when the re-encoder returns something that is not a PNG', async () => {
    const { useCase } = setup({ images: { toPng: async () => jpeg } })
    expect(await stageOf(useCase.execute(input))).toMatchObject({ stage: 'prepare', refusal: 'type-not-allowed' })
  })

  it('stops at prepare when hashing fails', async () => {
    const { useCase } = setup({ hasher: { sha256Hex: async () => Promise.reject(new Error('no crypto')) } })
    expect((await stageOf(useCase.execute(input))).stage).toBe('prepare')
  })

  it('stops at presign with the service\'s problem as the cause (erasure pending, rate limited)', async () => {
    const problem = Object.assign(new Error('409'), { status: 409 })
    const { useCase, deps, failures } = setup({ userProfile: { presignSignature: async () => Promise.reject(problem), confirmSignature: rs.fn() } })
    const error = await stageOf(useCase.execute(input))
    expect(error).toMatchObject({ stage: 'presign', cause: problem })
    expect(deps.storage.put).not.toHaveBeenCalled()
    expect(failures).toEqual(['presign'])
  })

  it('stops at upload when storage refuses (origin not allowed, 403, CORS, network) and never confirms', async () => {
    const { useCase, deps, failures } = setup({ storage: { put: async () => Promise.reject(new Error('origin not allowed')) } })
    expect((await stageOf(useCase.execute(input))).stage).toBe('upload')
    expect(deps.userProfile.confirmSignature).not.toHaveBeenCalled()
    expect(failures).toEqual(['upload'])
  })

  it('stops at confirm with the service\'s problem as the cause (413, 422, 409)', async () => {
    const problem = Object.assign(new Error('413'), { status: 413 })
    const { useCase, failures } = setup({ userProfile: { presignSignature: async () => upload, confirmSignature: async () => Promise.reject(problem) } })
    expect(await stageOf(useCase.execute(input))).toMatchObject({ stage: 'confirm', cause: problem })
    expect(failures).toEqual(['confirm'])
  })

  it('does not count an abort as a failed upload', async () => {
    const controller = new AbortController()
    const { useCase, failures } = setup({
      storage: {
        put: async () => {
          controller.abort()
          throw new DOMException('aborted', 'AbortError')
        },
      },
    })
    expect((await stageOf(useCase.execute({ ...input, signal: controller.signal }))).stage).toBe('upload')
    expect(failures).toEqual([])
  })

  it('never puts the upload URL in an error message', async () => {
    const { useCase } = setup({ storage: { put: async () => Promise.reject(new Error('boom')) } })
    const error = await stageOf(useCase.execute(input))
    expect(error.message).not.toContain('secret')
    expect(error.message).toBe('signature upload failed at upload')
  })
})

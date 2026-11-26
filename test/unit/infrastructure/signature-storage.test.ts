// The one request that is not an API call (LLD §7.3, ADR 0006): another origin, no credentials, no
// redirects, a deadline, and the URL never leaves the function.
import { afterEach, describe, expect, it, rs } from '@rstest/core'
import { SignatureStorageError, UPLOAD_TIMEOUT_MS, createSignatureStorage, isAllowedUploadUrl } from '../../../src/infrastructure/api/signatureStorage'
import type { PresignedUpload } from '../../../src/domain/entities/signature'

const upload: PresignedUpload = { uploadUrl: 'https://bucket.example/key?X-Amz-Signature=SECRET', objectKey: 'k', expiresIn: 300, contentType: 'image/png' }
const origins = ['https://bucket.example']
const bytes = Uint8Array.from([1, 2, 3])

afterEach(() => {
  rs.unstubAllGlobals()
})

describe('isAllowedUploadUrl', () => {
  it('accepts https on an exact allowed origin', () => {
    expect(isAllowedUploadUrl(upload.uploadUrl, origins)).toBe(true)
  })
  it.each([
    ['http on an allowed host', 'http://bucket.example/key'],
    ['another origin', 'https://evil.example/key'],
    ['a sub-domain', 'https://x.bucket.example/key'],
    ['another port', 'https://bucket.example:8443/key'],
    ['a look-alike prefix', 'https://bucket.example.evil.com/key'],
    ['a relative path', '/key'],
    ['nothing parsable', 'not a url'],
    ['a data URL', 'data:text/plain,hi'],
  ])('refuses %s', (_name, url) => {
    expect(isAllowedUploadUrl(url, origins)).toBe(false)
  })
  it('refuses everything when no origin is configured', () => {
    expect(isAllowedUploadUrl(upload.uploadUrl, [])).toBe(false)
  })
})

describe('createSignatureStorage.put', () => {
  it('PUTs the bytes with exactly the signed content type, no credentials, no redirects, no referrer, and a deadline', async () => {
    const fetchMock = rs.fn(async () => new Response(null, { status: 200 }))
    rs.stubGlobal('fetch', fetchMock)
    await createSignatureStorage(() => origins).put(upload, bytes)
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(upload.uploadUrl)
    expect(init).toMatchObject({ method: 'PUT', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', headers: { 'Content-Type': 'image/png' } })
    expect(init.body).toBe(bytes)
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(Object.keys(init.headers as object)).toEqual(['Content-Type'])
    expect(UPLOAD_TIMEOUT_MS).toBe(60_000)
  })

  it('refuses a URL outside the allowed origins before any request is made', async () => {
    const fetchMock = rs.fn()
    rs.stubGlobal('fetch', fetchMock)
    const error = await createSignatureStorage(() => ['https://other.example']).put(upload, bytes).catch((e: unknown) => e)
    expect(error).toMatchObject({ reason: 'origin-not-allowed' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reads the allowed origins at each call', async () => {
    rs.stubGlobal('fetch', async () => new Response(null, { status: 200 }))
    let list: string[] = []
    const storage = createSignatureStorage(() => list)
    await expect(storage.put(upload, bytes)).rejects.toMatchObject({ reason: 'origin-not-allowed' })
    list = origins
    await expect(storage.put(upload, bytes)).resolves.toBeUndefined()
  })

  it('reports storage refusing the bytes (a 403 from a stale signature, say) with the status', async () => {
    rs.stubGlobal('fetch', async () => new Response('denied', { status: 403 }))
    const error = await createSignatureStorage(() => origins).put(upload, bytes).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(SignatureStorageError)
    expect(error).toMatchObject({ reason: 'rejected', status: 403 })
  })

  it('reports no answer at all (network, CORS, a redirect, the deadline) as unreachable', async () => {
    rs.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch')
    })
    expect(await createSignatureStorage(() => origins).put(upload, bytes).catch((e: unknown) => e)).toMatchObject({ reason: 'unreachable', status: undefined })
  })

  it('lets the caller\'s own abort through untouched, so it is not counted as a failed upload', async () => {
    const controller = new AbortController()
    const abort = new DOMException('aborted', 'AbortError')
    rs.stubGlobal('fetch', async () => {
      controller.abort()
      throw abort
    })
    const error = await createSignatureStorage(() => origins).put(upload, bytes, controller.signal).catch((e: unknown) => e)
    expect(error).toBe(abort)
  })

  it('never puts the URL, its signature or its host in an error', async () => {
    rs.stubGlobal('fetch', async () => new Response(null, { status: 500 }))
    const e = (await createSignatureStorage(() => origins).put(upload, bytes).catch((x: unknown) => x)) as Error
    expect(`${e.message} ${String(e.stack)}`).not.toMatch(/SECRET|bucket\.example/)
    rs.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch https://bucket.example/key?X-Amz-Signature=SECRET')
    })
    const n = (await createSignatureStorage(() => origins).put(upload, bytes).catch((x: unknown) => x)) as Error
    expect(`${n.message} ${String(n.stack)}`).not.toMatch(/SECRET/)
    expect(n.cause).toBeUndefined()
  })
})

describe('eitherAborts (without AbortSignal.any, which older browsers lack)', () => {
  const withoutAny = async (run: () => void | Promise<void>) => {
    const real = AbortSignal.any
    ;(AbortSignal as { any?: unknown }).any = undefined
    try {
      await run()
    } finally {
      ;(AbortSignal as { any?: unknown }).any = real
    }
  }
  it('aborts when either signal does, whichever way it is made', async () => {
    const { eitherAborts } = await import('../../../src/infrastructure/api/signatureStorage')
    const native = new AbortController()
    expect(eitherAborts(native.signal, new AbortController().signal).aborted).toBe(false)
    await withoutAny(() => {
      const a = new AbortController()
      const b = new AbortController()
      const joined = eitherAborts(a.signal, b.signal)
      expect(joined.aborted).toBe(false)
      b.abort(new Error('deadline'))
      expect(joined.aborted).toBe(true)
      expect((joined.reason as Error).message).toBe('deadline')
      const already = new AbortController()
      already.abort()
      expect(eitherAborts(new AbortController().signal, already.signal).aborted).toBe(true)
      expect(eitherAborts(already.signal, new AbortController().signal).aborted).toBe(true)
    })
  })

  it('still uploads when the browser has no AbortSignal.any', async () => {
    await withoutAny(async () => {
      rs.stubGlobal('fetch', async () => new Response(null, { status: 200 }))
      const controller = new AbortController()
      await expect(createSignatureStorage(() => origins).put(upload, bytes, controller.signal)).resolves.toBeUndefined()
    })
  })
})

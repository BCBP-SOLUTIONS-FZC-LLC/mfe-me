import { afterEach, describe, expect, it, rs } from '@rstest/core'
import { canvasImageProcessor, clampCrop } from '../../../src/infrastructure/browser/imageProcessor'
import { systemClock } from '../../../src/infrastructure/browser/clock'
import { uuidKeys } from '../../../src/infrastructure/browser/idempotency'
import { subtleHasher } from '../../../src/infrastructure/browser/sha256'
import { FLAGS, browserTimeZones, createMeOptions, listFlag } from '../../../src/infrastructure/configuration/options'
import { startPlatform } from '../../fixtures/platform'

afterEach(() => {
  rs.unstubAllGlobals()
})

describe('listFlag', () => {
  it('splits a comma-separated flag, trims, drops blanks and repeats, and keeps order', () => {
    expect(listFlag(' a, b ,,a , c ')).toEqual(['a', 'b', 'c'])
  })
  it('is empty for anything that is not a string', () => {
    for (const v of [undefined, true, 5, null]) expect(listFlag(v)).toEqual([])
  })
})

describe('createMeOptions', () => {
  const withFlags = (flags: Record<string, string | boolean | number>) => {
    startPlatform({ config: { flags } } as never)
    return createMeOptions(() => ['Asia/Dubai'])
  }

  it('reads the lists from the runtime flags at each call, not at import', () => {
    const options = withFlags({ [FLAGS.models]: 'model-a, model-b', [FLAGS.eventTypes]: 'doc.approved', [FLAGS.uploadOrigins]: 'https://bucket.example' })
    expect(options.allowedModels).toEqual(['model-a', 'model-b'])
    expect(options.notificationEventTypes).toEqual(['doc.approved'])
    expect(options.uploadOrigins).toEqual(['https://bucket.example'])
    expect(options.enabledLocales).toEqual(['en'])
    expect(options.timeZones).toEqual(['Asia/Dubai'])
  })

  it('is empty when a flag is missing (each screen then says what is unavailable)', () => {
    const options = withFlags({})
    expect([options.allowedModels, options.notificationEventTypes, options.uploadOrigins]).toEqual([[], [], []])
  })

  it('keeps only exact https origins: a path, http, a wildcard or junk is ignored', () => {
    const options = withFlags({ [FLAGS.uploadOrigins]: 'https://ok.example, http://plain.example, https://path.example/bucket, https://*.example, nonsense, https://ok.example:8443' })
    expect(options.uploadOrigins).toEqual(['https://ok.example', 'https://ok.example:8443'])
  })
})

describe('browserTimeZones', () => {
  it('lists the zones the browser knows', () => {
    expect(browserTimeZones().length).toBeGreaterThan(100)
  })
  it('is empty where the browser cannot list them, or throws', () => {
    const real = Intl.supportedValuesOf
    ;(Intl as { supportedValuesOf?: unknown }).supportedValuesOf = undefined
    expect(browserTimeZones()).toEqual([])
    ;(Intl as { supportedValuesOf?: unknown }).supportedValuesOf = () => {
      throw new RangeError('x')
    }
    expect(browserTimeZones()).toEqual([])
    ;(Intl as { supportedValuesOf?: unknown }).supportedValuesOf = real
  })
})

describe('browser adapters', () => {
  it('hashes to lowercase hex SHA-256', async () => {
    expect(await subtleHasher.sha256Hex(new TextEncoder().encode('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(await subtleHasher.sha256Hex(new Uint8Array())).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  })
  it('makes a new idempotency key each time', () => {
    const a = uuidKeys.next()
    expect(a).toMatch(/^[0-9a-f-]{36}$/)
    expect(uuidKeys.next()).not.toBe(a)
  })
  it('tells the time', () => {
    expect(Math.abs(systemClock.now().getTime() - Date.now())).toBeLessThan(1000)
  })
})

describe('clampCrop', () => {
  it('is the whole image with no crop', () => expect(clampCrop(undefined, 100, 50)).toEqual({ x: 0, y: 0, width: 100, height: 50 }))
  it('keeps a crop inside the image, in whole pixels, at least 1 × 1', () => {
    expect(clampCrop({ x: 10.7, y: 5.2, width: 20.9, height: 10 }, 100, 50)).toEqual({ x: 10, y: 5, width: 20, height: 10 })
    expect(clampCrop({ x: -5, y: -5, width: 500, height: 500 }, 100, 50)).toEqual({ x: 0, y: 0, width: 100, height: 50 })
    expect(clampCrop({ x: 500, y: 500, width: 10, height: 10 }, 100, 50)).toEqual({ x: 99, y: 49, width: 1, height: 1 })
    expect(clampCrop({ x: 0, y: 0, width: 0, height: -3 }, 100, 50)).toEqual({ x: 0, y: 0, width: 1, height: 1 })
  })
})

describe('canvasImageProcessor', () => {
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47])
  const source = { bytes: Uint8Array.from([1, 2, 3]), mimeType: 'image/jpeg' }

  function stubBrowser(o: { offscreen?: boolean; context?: boolean; blob?: boolean } = {}) {
    const drawImage = rs.fn()
    const close = rs.fn()
    const created = { width: 0, height: 0 }
    rs.stubGlobal('createImageBitmap', async () => ({ width: 200, height: 100, close }))
    const context = o.context === false ? null : { drawImage }
    if (o.offscreen) {
      class FakeOffscreen {
        constructor(w: number, h: number) {
          created.width = w
          created.height = h
        }
        getContext() {
          return context
        }
        async convertToBlob(opts: { type: string }) {
          expect(opts.type).toBe('image/png')
          return new Blob([png], { type: 'image/png' })
        }
      }
      rs.stubGlobal('OffscreenCanvas', FakeOffscreen)
    } else {
      rs.stubGlobal('OffscreenCanvas', undefined)
      const realCreate = document.createElement.bind(document)
      rs.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
        if (tag !== 'canvas') return realCreate(tag)
        return {
          set width(v: number) {
            created.width = v
          },
          set height(v: number) {
            created.height = v
          },
          getContext: () => context,
          toBlob: (cb: (b: Blob | null) => void) => cb(o.blob === false ? null : new Blob([png], { type: 'image/png' })),
        } as unknown as HTMLCanvasElement
      }) as typeof document.createElement)
    }
    return { drawImage, close, created }
  }

  it('crops on an offscreen canvas, re-encodes as PNG, and releases the bitmap', async () => {
    const { drawImage, close, created } = stubBrowser({ offscreen: true })
    const out = await canvasImageProcessor.toPng(source, { x: 10, y: 20, width: 50, height: 40 })
    expect(Array.from(out)).toEqual(Array.from(png))
    expect(created).toEqual({ width: 50, height: 40 })
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 10, 20, 50, 40, 0, 0, 50, 40)
    expect(close).toHaveBeenCalledOnce()
  })

  it('uses a canvas element where there is no offscreen canvas, and the whole image without a crop', async () => {
    const { created } = stubBrowser()
    await canvasImageProcessor.toPng(source)
    expect(created).toEqual({ width: 200, height: 100 })
  })

  it('rejects when there is no 2D context or no image comes out, and still releases the bitmap', async () => {
    const noContext = stubBrowser({ context: false })
    await expect(canvasImageProcessor.toPng(source)).rejects.toThrow('no 2D canvas context')
    expect(noContext.close).toHaveBeenCalledOnce()
    rs.restoreAllMocks()
    const noBlob = stubBrowser({ blob: false })
    await expect(canvasImageProcessor.toPng(source)).rejects.toThrow('no image')
    expect(noBlob.close).toHaveBeenCalledOnce()
  })

  it('stops when the caller has aborted', async () => {
    stubBrowser({ offscreen: true })
    const controller = new AbortController()
    controller.abort()
    await expect(canvasImageProcessor.toPng(source, undefined, controller.signal)).rejects.toThrow()
  })

  it('stops between decoding and drawing when aborted meanwhile', async () => {
    const controller = new AbortController()
    const close = rs.fn()
    rs.stubGlobal('createImageBitmap', async () => {
      controller.abort()
      return { width: 10, height: 10, close }
    })
    await expect(canvasImageProcessor.toPng(source, undefined, controller.signal)).rejects.toThrow()
    expect(close).toHaveBeenCalledOnce()
  })
})

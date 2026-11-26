// Decodes the picked signature, crops it, and re-encodes it as PNG on a canvas (LLD §7.3). The canvas
// output carries no EXIF, location or embedded payload, and its content type is always image/png. This
// is browser work (createImageBitmap, OffscreenCanvas or a canvas element), so it lives here and the
// use case sees only the ImageProcessor port. Nothing is drawn on screen.
import type { CropRect, ImageProcessor, SignatureSource } from '../../application/ports/media'

/** A crop inside the image, whole pixels; a missing or empty crop means the whole image. */
export function clampCrop(crop: CropRect | undefined, width: number, height: number): CropRect {
  if (!crop) return { x: 0, y: 0, width, height }
  const x = Math.min(Math.max(Math.floor(crop.x), 0), width - 1)
  const y = Math.min(Math.max(Math.floor(crop.y), 0), height - 1)
  const w = Math.min(Math.max(Math.floor(crop.width), 1), width - x)
  const h = Math.min(Math.max(Math.floor(crop.height), 1), height - y)
  return { x, y, width: w, height: h }
}

type Surface = { width: number; height: number; context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null; encode: () => Promise<Blob> }

/** An offscreen canvas where the browser has one, else a canvas element that is never attached. */
function surface(width: number, height: number): Surface {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height)
    return { width, height, context: canvas.getContext('2d'), encode: () => canvas.convertToBlob({ type: 'image/png' }) }
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return {
    width,
    height,
    context: canvas.getContext('2d'),
    encode: () => new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('the canvas produced no image'))), 'image/png')),
  }
}

export const canvasImageProcessor: ImageProcessor = {
  async toPng(source: SignatureSource, crop, signal) {
    signal?.throwIfAborted()
    const bitmap = await createImageBitmap(new Blob([source.bytes as BlobPart], { type: source.mimeType }))
    try {
      signal?.throwIfAborted()
      const area = clampCrop(crop, bitmap.width, bitmap.height)
      const out = surface(area.width, area.height)
      if (!out.context) throw new Error('no 2D canvas context')
      out.context.drawImage(bitmap, area.x, area.y, area.width, area.height, 0, 0, area.width, area.height)
      const blob = await out.encode()
      signal?.throwIfAborted()
      return new Uint8Array(await blob.arrayBuffer())
    } finally {
      bitmap.close()
    }
  },
}

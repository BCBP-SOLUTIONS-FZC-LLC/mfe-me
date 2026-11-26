// Decoding, cropping and re-encoding the signature image: browser work (createImageBitmap and a
// canvas, infrastructure/browser/imageProcessor.ts) behind a port, so the use case stays testable.

/** The picked file's bytes and the type the browser reported. */
export interface SignatureSource {
  readonly bytes: Uint8Array
  readonly mimeType: string
}

/** A crop in the source image's pixels. Absent = the whole image. */
export interface CropRect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface ImageProcessor {
  /**
   * Decodes `source`, crops it, and re-encodes it as PNG. The output carries no EXIF, location or
   * embedded payload, and its content type is always `image/png`. Rejects when the image cannot be decoded.
   */
  toPng(source: SignatureSource, crop?: CropRect, signal?: AbortSignal): Promise<Uint8Array>
}

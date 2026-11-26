// A preview of the picked signature with four controls for the part to keep (left, top, width, height, as a
// percentage of the image). The crop is applied on a canvas when the image is re-encoded as PNG
// (`ImageProcessor`); this only says which part. The preview is a data URL (the CSP allows no blob: images).
import { useT } from '@bcbp-solutions-fzc-llc/frontend-sdk/react'
import { useId, useMemo, useState } from 'react'
import type { CropRect } from '../../../application/ports/media'
import { APP_ID } from '../../../shared/constants/app'

export interface Crop {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

export const WHOLE: Crop = { left: 0, top: 0, width: 100, height: 100 }

/** The crop in the image's own pixels, or undefined for the whole image. */
export function cropRect(crop: Crop, naturalWidth: number, naturalHeight: number): CropRect | undefined {
  if (crop.left === 0 && crop.top === 0 && crop.width === 100 && crop.height === 100) return undefined
  return {
    x: Math.round((crop.left / 100) * naturalWidth),
    y: Math.round((crop.top / 100) * naturalHeight),
    width: Math.max(1, Math.round((crop.width / 100) * naturalWidth)),
    height: Math.max(1, Math.round((crop.height / 100) * naturalHeight)),
  }
}

/** Keeps a crop inside the image: the size never runs past the right or bottom edge. */
export function clampCropPct(c: Crop): Crop {
  const left = Math.min(Math.max(c.left, 0), 99)
  const top = Math.min(Math.max(c.top, 0), 99)
  return { left, top, width: Math.min(Math.max(c.width, 1), 100 - left), height: Math.min(Math.max(c.height, 1), 100 - top) }
}

/**
 * The preview as a `data:` URL. A `blob:` URL (URL.createObjectURL) is not allowed by the platform CSP's
 * `img-src 'self' data:`, so in production it would show a broken image; the picked file is at most 1 MB.
 */
export function previewUrl(bytes: Uint8Array, mimeType: string): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return `data:${mimeType};base64,${btoa(binary)}`
}

export default function SignatureCropper({ bytes, mimeType, onChange }: { bytes: Uint8Array; mimeType: string; onChange: (crop: Crop, natural: { width: number; height: number } | undefined) => void }) {
  const t = useT(APP_ID)
  const id = useId()
  const url = useMemo(() => previewUrl(bytes, mimeType), [bytes, mimeType])
  const [crop, setCrop] = useState<Crop>(WHOLE)
  const [natural, setNatural] = useState<{ width: number; height: number }>()
  const update = (patch: Partial<Crop>) => {
    const next = clampCropPct({ ...crop, ...patch })
    setCrop(next)
    onChange(next, natural)
  }
  const field = (key: keyof Crop, label: string, min: number, max: number) => (
    <label className="flex flex-col gap-1 text-xs">
      {label}
      <input type="range" min={min} max={max} value={crop[key]} aria-valuetext={t('signature.cropPercent', { value: crop[key] })} onChange={(e) => update({ [key]: Number(e.target.value) })} />
    </label>
  )
  return (
    <div className="flex flex-col gap-3">
      <div className="relative inline-block max-w-full self-start overflow-hidden rounded-lg border border-aura-border bg-aura-canvas">
        <img
          src={url}
          alt={t('signature.previewAlt')}
          className="block max-h-48 max-w-full"
          onLoad={(e) => {
            const size = { width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight }
            setNatural(size)
            onChange(crop, size)
          }}
        />
        <span aria-hidden="true" className="pointer-events-none absolute border-2 border-aura-primary" style={{ left: `${crop.left}%`, top: `${crop.top}%`, width: `${crop.width}%`, height: `${crop.height}%` }} />
      </div>
      <fieldset className="grid grid-cols-2 gap-3" aria-labelledby={`${id}-crop`}>
        <legend id={`${id}-crop`} className="col-span-2 text-sm font-medium">
          {t('signature.crop')}
        </legend>
        {field('left', t('signature.cropLeft'), 0, 99)}
        {field('top', t('signature.cropTop'), 0, 99)}
        {field('width', t('signature.cropWidth'), 1, 100)}
        {field('height', t('signature.cropHeight'), 1, 100)}
      </fieldset>
    </div>
  )
}

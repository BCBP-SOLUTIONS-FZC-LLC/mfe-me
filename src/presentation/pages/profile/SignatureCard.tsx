// G1: my signature (IAM-UX-13). Pick a PNG or JPEG (up to 1 MB), choose what to keep, and upload: the browser
// re-encodes it as PNG (no metadata) and sends it straight to storage, then confirms it to User Profile. No
// browser route returns my current signature (LLD §15 #4), so the card says "Upload a signature" and, after
// a success, "Signature saved {time}"; Remove is always available (removing none is a no-op). Where no storage
// origin is configured, Upload is hidden (LLD §12). Approvals use the saved signature; IAM only stores it.
import { useT } from '@bcbp-solutions-fzc-llc/frontend-sdk/react'
import { isProblemError } from '@bcbp-solutions-fzc-llc/frontend-sdk/problem'
import { useId, useRef, useState } from 'react'
import { SignatureUploadError } from '../../../application/use-cases'
import { planSignatureFile, sniffImageType, type SignatureFileFailure } from '../../../domain/rules/me-rules'
import { APP_ID } from '../../../shared/constants/app'
import ConfirmDialog from '../../components/ConfirmDialog'
import ProblemDetails from '../../components/ProblemDetails'
import { btnOutline, btnPrimary, card, cardHeader, cardTitle } from '../../components/styles'
import { useMeAccess } from '../../features/access/useMeAccess'
import { useMeServices } from '../../features/services'
import { useRemoveSignature, useUploadSignature } from '../../features/signature/useSignatureActions'
import { useFormatInstant } from '../../features/time/zone'
import { useProblemText } from '../../features/useProblemText'
import SignatureCropper, { cropRect, WHOLE, type Crop } from './SignatureCropper'

const REFUSAL_KEYS = {
  'type-not-allowed': 'signature.err.type',
  empty: 'signature.err.empty',
  'too-large': 'errors.fileTooLarge',
} as const satisfies Record<SignatureFileFailure, string>

interface Picked {
  readonly bytes: Uint8Array
  readonly mimeType: string
}

export default function SignatureCard() {
  const t = useT(APP_ID)
  const id = useId()
  const { options } = useMeServices()
  const { canWrite } = useMeAccess()
  const problemText = useProblemText()
  const formatTime = useFormatInstant()
  const upload = useUploadSignature()
  const remove = useRemoveSignature()
  const input = useRef<HTMLInputElement>(null)
  const [picked, setPicked] = useState<Picked>()
  const [crop, setCrop] = useState<{ crop: Crop; natural: { width: number; height: number } | undefined }>({ crop: WHOLE, natural: undefined })
  const [error, setError] = useState<string>()
  const [failure, setFailure] = useState<unknown>()
  const [savedAt, setSavedAt] = useState<string>()
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [removeError, setRemoveError] = useState<unknown>()

  const enabled = options.uploadOrigins.length > 0

  const pick = async (file: File | undefined) => {
    setError(undefined)
    setFailure(undefined)
    setPicked(undefined)
    if (!file) return
    let bytes: Uint8Array
    try {
      bytes = new Uint8Array(await file.arrayBuffer())
    } catch {
      // The file could not be read (it was moved or removed after it was picked).
      return setError(t('signature.err.unreadable'))
    }
    const plan = planSignatureFile({ type: file.type, size: bytes.length, magic: sniffImageType(bytes) })
    if (!plan.ok) return setError(t(REFUSAL_KEYS[plan.failure]))
    setCrop({ crop: WHOLE, natural: undefined })
    setPicked({ bytes, mimeType: file.type })
  }

  const send = async () => {
    if (!picked) return
    setError(undefined)
    setFailure(undefined)
    try {
      const area = crop.natural ? cropRect(crop.crop, crop.natural.width, crop.natural.height) : undefined
      await upload.mutateAsync({ file: picked, ...(area ? { crop: area } : {}) })
      setSavedAt(new Date().toISOString())
      setPicked(undefined)
      if (input.current) input.current.value = ''
    } catch (e) {
      if (e instanceof SignatureUploadError) {
        if (e.refusal) return setError(t(REFUSAL_KEYS[e.refusal]))
        const cause = e.cause
        if ((e.stage === 'presign' || e.stage === 'confirm') && isProblemError(cause)) {
          if (cause.status === 429) return setError(t('signature.err.rateLimited'))
          if (e.stage === 'confirm' && cause.status === 422) return setError(t('signature.err.mismatch'))
          return setFailure(cause)
        }
        return setError(t('signature.err.failed'))
      }
      setFailure(e)
    }
  }

  const confirmRemoval = async () => {
    setRemoveError(undefined)
    try {
      await remove.mutateAsync()
      setSavedAt(undefined)
      setConfirmRemove(false)
    } catch (e) {
      setRemoveError(e)
    }
  }

  return (
    <section aria-labelledby={`${id}-title`} className={`${card} overflow-hidden`}>
      <div className={cardHeader}>
        <h2 id={`${id}-title`} className={cardTitle}>
        {t('signature.title')}
        </h2>
      </div>
      <div className="flex flex-col gap-4 p-5">
      <p className="text-sm text-aura-muted">{t('signature.intro')}</p>
      {savedAt && (
        <p role="status" className="text-sm text-status-success">
          {t('signature.saved', { time: formatTime(savedAt) })}
        </p>
      )}
      {enabled ? (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-sm font-medium" htmlFor={`${id}-file`}>
            {t('signature.upload')}
          </label>
          <input ref={input} id={`${id}-file`} type="file" accept="image/png,image/jpeg" disabled={!canWrite || upload.isPending} onChange={(e) => void pick(e.target.files?.[0])} className="file-input file-input-bordered w-full max-w-md" />
          <p className="text-xs text-aura-muted">{t('signature.hint')}</p>
          {picked && (
            <>
              <SignatureCropper bytes={picked.bytes} mimeType={picked.mimeType} onChange={(c, natural) => setCrop({ crop: c, natural })} />
              <div>
                <button type="button" className={btnPrimary} disabled={!canWrite || upload.isPending} onClick={() => void send()}>
                  {upload.isPending ? t('common.working') : t('signature.send')}
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        <p role="status" className="text-sm text-aura-muted">
          {t('signature.unavailable')}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-status-error">
          {error}
        </p>
      )}
      {failure !== undefined && (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-status-error">
          <span>{problemText(failure)}</span>
          <ProblemDetails error={failure} />
        </div>
      )}
      <div>
        <button type="button" className={btnOutline} disabled={!canWrite || remove.isPending} onClick={() => setConfirmRemove(true)}>
          {t('signature.remove')}
        </button>
      </div>
      {confirmRemove && (
        <ConfirmDialog title={t('signature.removeTitle')} confirmLabel={t('signature.removeConfirm')} danger busy={remove.isPending} error={removeError} onConfirm={() => void confirmRemoval()} onCancel={() => setConfirmRemove(false)}>
          <p>{t('signature.removeBody')}</p>
        </ConfirmDialog>
      )}
      </div>
    </section>
  )
}

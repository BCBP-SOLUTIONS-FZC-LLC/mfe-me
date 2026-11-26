// G1's signature writes: upload (presign → put → confirm, one use case) and remove. Neither changes anything
// the page reads (no browser route returns my signature, LLD §15 #4), so there is nothing to invalidate.
import type { SignatureConfirmation } from '../../../domain/entities/signature'
import type { CropRect, SignatureSource } from '../../../application/ports/media'
import { useSelf } from '../self/useSelf'
import { useMeUseCases } from '../services'
import { useTrackedMutation } from '../tracked'

export interface UploadInput {
  readonly file: SignatureSource
  readonly crop?: CropRect
}

export function useUploadSignature() {
  const { userId } = useSelf()
  const useCases = useMeUseCases()
  return useTrackedMutation<UploadInput, SignatureConfirmation>({
    action: 'upload_signature',
    mutationFn: ({ file, crop }) => useCases.uploadSignature.execute({ userId: userId!, file, ...(crop ? { crop } : {}) }),
  })
}

export function useRemoveSignature() {
  const { userId } = useSelf()
  const useCases = useMeUseCases()
  return useTrackedMutation<void, void>({
    action: 'remove_signature',
    mutationFn: () => useCases.deleteSignature.execute(userId!),
  })
}

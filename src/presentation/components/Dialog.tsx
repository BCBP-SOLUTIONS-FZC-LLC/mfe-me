// A modal dialog: labelled, Escape closes it, Tab stays inside it, focus returns to what opened it.
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { useFocusTrap } from '../../shared/hooks/useFocusTrap'

export default function Dialog({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode }) {
  const titleId = useId()
  const ref = useRef<HTMLDivElement>(null)
  useFocusTrap(true, ref)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]">
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} className="max-h-full w-full max-w-xl overflow-auto rounded-2xl border border-aura-border bg-aura-surface p-6 text-aura-text shadow-2xl">
        <h2 id={titleId} className="mb-1 text-lg font-semibold">
          {title}
        </h2>
        {subtitle && <p className="mb-4 text-sm text-aura-muted">{subtitle}</p>}
        {!subtitle && <div className="mb-3" />}
        {children}
      </div>
    </div>
  )
}

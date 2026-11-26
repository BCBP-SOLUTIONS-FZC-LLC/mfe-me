// A person's availability as a coloured dot and its name, so colour is never the only signal.
import { useT } from '@bcbp-solutions-fzc-llc/frontend-sdk/react'
import type { Availability } from '../../../domain/vocabulary'
import { APP_ID } from '../../../shared/constants/app'

const KEYS = { available: 'identity.availability.available', busy: 'identity.availability.busy', ooo: 'identity.availability.ooo' } as const satisfies Record<Availability, string>
const DOTS = { available: 'bg-success', busy: 'bg-warning', ooo: 'bg-error' } as const satisfies Record<Availability, string>

export default function AvailabilityDot({ status }: { status: Availability }) {
  const t = useT(APP_ID)
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-aura-muted">
      <span aria-hidden="true" className={`size-2 rounded-full ${DOTS[status]}`} />
      {t(KEYS[status])}
    </span>
  )
}

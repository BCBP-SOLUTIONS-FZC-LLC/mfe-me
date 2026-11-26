// A person as the screens show them: name, email and job title, built from the User Profile answer for
// their ID. "Unknown user" when the service has no profile, "Name unavailable" when the lookup failed, a
// placeholder while it loads: never a raw UUID, never a hidden row (IAM-UX-4). Replaced by the shared
// identity package's chip (mfe-admin §15 #5, ADR 0003).
import { useT } from '@bcbp-solutions-fzc-llc/frontend-sdk/react'
import type { ProfileState } from '../../../domain/entities/directory'
import { APP_ID } from '../../../shared/constants/app'
import Avatar from './Avatar'
import AvailabilityDot from './AvailabilityDot'

export default function UserChip({ profile, showAvailability = false }: { profile: ProfileState | undefined; showAvailability?: boolean }) {
  const t = useT(APP_ID)
  if (profile === undefined) return <span className="block h-9 w-36 animate-pulse rounded-lg bg-aura-hover" aria-hidden="true" />
  if (profile.state !== 'found') {
    return <span className="text-aura-muted">{profile.state === 'missing' ? t('identity.unknownUser') : t('identity.nameUnavailable')}</span>
  }
  const { displayName, email, jobTitle, availability } = profile.user
  return (
    <span className="flex items-center gap-3">
      <Avatar name={displayName} />
      <span className="flex flex-col leading-tight">
        <span className="font-medium text-aura-text">{displayName}</span>
        <span className="text-xs text-aura-muted">{jobTitle ? `${email} · ${jobTitle}` : email}</span>
        {showAvailability && availability && <AvailabilityDot status={availability} />}
      </span>
    </span>
  )
}

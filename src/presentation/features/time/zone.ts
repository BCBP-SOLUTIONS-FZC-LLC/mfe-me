// Dates and times are shown in my profile's time zone, falling back to the browser's while the profile
// loads (IAM-UX-14); a wall-clock text typed in a form means that zone too. The domain does the
// arithmetic (`wallClockToInstant`) and only needs the zone's UTC offset at an instant; this reads it from
// the SDK's formatDate (the SDK rule bans `new Intl.` in src/), as the offset the zone shows at that moment.
import { formatDate } from '@bcbp-solutions-fzc-llc/frontend-sdk/i18n'
import { useMemo } from 'react'
import type { OffsetAt } from '../../../domain/value-objects/Instant'
import { useMyProfile } from '../profile/useMyProfile'

/** `GMT+05:30`, `GMT-4`, `GMT` (and the minus sign some locales use) → minutes east of UTC; undefined if it cannot be read. */
export function parseOffsetText(text: string): number | undefined {
  if (/^(GMT|UTC)$/.test(text.trim())) return 0
  const m = /([+\-−])(\d{1,2})(?::?(\d{2}))?/.exec(text)
  if (!m) return undefined
  const minutes = Number(m[2]) * 60 + Number(m[3] ?? 0)
  return m[1] === '+' ? minutes : -minutes
}

/** The offset of `timeZone` from UTC at `epochMs`, in minutes east; the browser's own offset when the zone is unknown. */
export function offsetOf(timeZone: string | undefined, epochMs: number): number {
  const local = -new Date(epochMs).getTimezoneOffset()
  if (!timeZone) return local
  try {
    const shown = formatDate(epochMs, { timeZone, timeZoneName: 'longOffset', hour: 'numeric' })
    const zone = shown.split(/\s+/).find((part) => /GMT|UTC|[+\-−]\d/.test(part)) ?? shown
    return parseOffsetText(zone) ?? local
  } catch {
    // A saved zone the browser does not know (a RangeError): show times in the browser's own zone rather than fail the page.
    return local
  }
}

export const offsetFor = (timeZone: string | undefined): ((epochMs: number) => number) => (ms) => offsetOf(timeZone, ms)

/** My display zone: the profile's, else undefined (the browser's). */
export function useDisplayZone(): string | undefined {
  const { profile } = useMyProfile()
  return profile?.timezone || undefined
}

/** Offsets for the display zone, stable across renders while the zone is. */
export function useOffsetAt(): OffsetAt {
  const zone = useDisplayZone()
  return useMemo(() => offsetFor(zone), [zone])
}

/** formatDate in a zone, or in the browser's own when the zone is unknown to it. */
function safeFormat(instant: string, options: Intl.DateTimeFormatOptions, zone: string | undefined): string {
  try {
    return formatDate(instant, { ...options, ...(zone ? { timeZone: zone } : {}) })
  } catch {
    return formatDate(instant, options)
  }
}

/** A date and time in my zone and locale, for a list or a message. */
export function useFormatInstant(): (instant: string | undefined) => string {
  const zone = useDisplayZone()
  return (instant) => (instant ? safeFormat(instant, { dateStyle: 'medium', timeStyle: 'short' }, zone) : '')
}

/** A calendar day (no time) in my zone. */
export function useFormatDay(): (instant: string | undefined) => string {
  const zone = useDisplayZone()
  return (instant) => (instant ? safeFormat(instant, { dateStyle: 'medium' }, zone) : '')
}


// A point in time as UTC, ISO 8601 on the wire (`2026-07-01T00:00:00Z`). A branded string, so a local
// wall-clock text ('2026-07-01T09:00') cannot be passed where an instant is expected. Pure: nothing
// here reads the clock or a time zone database. Turning a wall-clock text in the profile timezone into
// an instant (IAM-UX-14) takes the zone's UTC offset as an input (`OffsetAt`), which the presentation
// layer supplies from the SDK's formatDate, so this file needs no Intl.
declare const brand: unique symbol
export type Instant = string & { readonly [brand]: 'Instant' }

export const MINUTE_MS = 60_000
export const DAY_MS = 86_400_000

const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/

/** The instant for an RFC 3339 date-time (`Z` or an offset), normalised to UTC; undefined for anything else. */
export function parseInstant(value: unknown): Instant | undefined {
  if (typeof value !== 'string' || !RFC3339.test(value)) return undefined
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? undefined : instantFromMillis(ms)
}

export function instantFromMillis(ms: number): Instant {
  if (!Number.isFinite(ms)) throw new TypeError(`not a time: ${String(ms)}`)
  return new Date(ms).toISOString() as Instant
}

export const toMillis = (i: Instant): number => Date.parse(i)

export const addDays = (i: Instant, days: number): Instant => instantFromMillis(toMillis(i) + days * DAY_MS)

/** Whole days from `from` to `to`, rounded up (a part-day counts as a day; negative when `to` is earlier). */
export function daysBetween(from: Instant, to: Instant): number {
  const days = Math.ceil((toMillis(to) - toMillis(from)) / DAY_MS)
  return days === 0 ? 0 : days
}

/** The zone's offset from UTC, in minutes east of UTC, at the instant `epochMs` (supplied by the caller). */
export type OffsetAt = (epochMs: number) => number

const WALL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/

/** A `datetime-local` text's parts as if it were UTC, or undefined when it is not a real calendar time. */
function wallAsUtcMillis(wall: string): number | undefined {
  const m = WALL.exec(wall)
  if (!m) return undefined
  const [year, month, day, hour, minute] = m.slice(1).map(Number) as [number, number, number, number, number]
  const ms = Date.UTC(year, month - 1, day, hour, minute)
  const d = new Date(ms)
  const real = d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day && d.getUTCHours() === hour && d.getUTCMinutes() === minute
  return real ? ms : undefined
}

/**
 * The instant a wall-clock text ('YYYY-MM-DDTHH:mm') means in a zone with the given offsets. The
 * offset is read at the guess and again at the corrected time, so a time near a daylight-saving change
 * lands on the right side of it. A time that does not exist (the hour skipped in spring) moves forward.
 */
export function wallClockToInstant(wall: string, offsetAt: OffsetAt): Instant | undefined {
  const asUtc = wallAsUtcMillis(wall)
  if (asUtc === undefined) return undefined
  const first = offsetAt(asUtc)
  let ms = asUtc - first * MINUTE_MS
  const second = offsetAt(ms)
  if (second !== first) ms = asUtc - second * MINUTE_MS
  return instantFromMillis(ms)
}

/** The wall-clock text ('YYYY-MM-DDTHH:mm') an instant shows in a zone with the given offsets. */
export function instantToWallClock(instant: Instant, offsetAt: OffsetAt): string {
  const ms = toMillis(instant)
  return new Date(ms + offsetAt(ms) * MINUTE_MS).toISOString().slice(0, 16)
}

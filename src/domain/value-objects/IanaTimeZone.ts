// An IANA time zone name ('Europe/Paris'). The list of valid names comes from the browser
// (`Intl.supportedValuesOf('timeZone')`, read in infrastructure and passed in as data), so this file
// needs no browser API. The service checks it again; User Profile allows 1 to 64 characters.
declare const brand: unique symbol
export type IanaTimeZone = string & { readonly [brand]: 'IanaTimeZone' }

export const MAX_TIME_ZONE_LENGTH = 64

/** `UTC` is always valid: the browser's list leaves it out, while IANA and User Profile accept it. */
const ALWAYS = 'UTC'

export function parseTimeZone(value: unknown, supported: readonly string[]): IanaTimeZone | undefined {
  if (typeof value !== 'string') return undefined
  const name = value.trim()
  if (name.length === 0 || name.length > MAX_TIME_ZONE_LENGTH) return undefined
  return name === ALWAYS || supported.includes(name) ? (name as IanaTimeZone) : undefined
}

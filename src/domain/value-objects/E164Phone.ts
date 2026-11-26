// A phone number in E.164 ('+12125551234') or empty (no number). User Profile returns it to the person
// themselves and to admins only. The empty string is a valid value: it clears the number.
declare const brand: unique symbol
export type E164Phone = string & { readonly [brand]: 'E164Phone' }

const E164 = /^\+[0-9]{7,15}$/

/** The number as typed (spaces around it ignored): `''` for none, an E.164 number, or undefined when it is neither. */
export function parsePhone(value: unknown): E164Phone | '' | undefined {
  if (typeof value !== 'string') return undefined
  const phone = value.trim()
  if (phone === '') return ''
  return E164.test(phone) ? (phone as E164Phone) : undefined
}

// Reads a service's JSON answer into typed values, and fails loudly (MappingError) when a field the
// screens depend on is missing or the wrong type: a half-read answer must not reach the UI as
// `undefined`. Unknown extra fields are ignored (a service may add fields; a client must not break).
// Optional fields are read with the opt* functions and stay absent when the service omits them.

export class MappingError extends Error {
  override readonly name = 'MappingError'
  readonly path: string
  constructor(path: string, expected: string) {
    super(`unexpected answer from the service: ${path} should be ${expected}`)
    this.path = path
  }
}

export type Json = Record<string, unknown>

export function object(v: unknown, path: string): Json {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new MappingError(path, 'an object')
  return v as Json
}

export function array(v: unknown, path: string): unknown[] {
  if (!Array.isArray(v)) throw new MappingError(path, 'an array')
  return v
}

/** An array that may be absent or null: the service omits an empty list in places. */
export function arrayOrEmpty(v: unknown, path: string): unknown[] {
  return v === undefined || v === null ? [] : array(v, path)
}

export function string(o: Json, key: string, path: string): string {
  const v = o[key]
  if (typeof v !== 'string') throw new MappingError(`${path}.${key}`, 'a string')
  return v
}

export function optString(o: Json, key: string): string | undefined {
  const v = o[key]
  return typeof v === 'string' && v !== '' ? v : undefined
}

export function integer(o: Json, key: string, path: string): number {
  const v = o[key]
  if (typeof v !== 'number' || !Number.isInteger(v)) throw new MappingError(`${path}.${key}`, 'an integer')
  return v
}

export function optInteger(o: Json, key: string): number | undefined {
  const v = o[key]
  return typeof v === 'number' && Number.isInteger(v) ? v : undefined
}

export function boolean(o: Json, key: string, path: string): boolean {
  const v = o[key]
  if (typeof v !== 'boolean') throw new MappingError(`${path}.${key}`, 'a boolean')
  return v
}

export function optBoolean(o: Json, key: string): boolean | undefined {
  const v = o[key]
  return typeof v === 'boolean' ? v : undefined
}

/** One of a closed set of codes; anything else is a MappingError. */
export function oneOf<T extends string>(o: Json, key: string, values: readonly T[], path: string): T {
  const v = o[key]
  const found = values.find((x) => x === v)
  if (found === undefined) throw new MappingError(`${path}.${key}`, `one of ${values.join(', ')}`)
  return found
}

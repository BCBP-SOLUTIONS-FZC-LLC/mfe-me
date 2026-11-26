// The optimistic-lock version IAM stamps on a record (IAM-UX-9). User Profile returns `record_version`
// and takes `expected_version` in a request; Delegation calls both `record_version`. A branded number,
// so a plain integer (a page number, a count) cannot be passed where a version is expected.
declare const brand: unique symbol
export type RecordVersion = number & { readonly [brand]: 'RecordVersion' }

/** The version in an answer. Throws for anything that is not a non-negative integer. */
export function recordVersion(n: unknown): RecordVersion {
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 0) throw new TypeError(`record version must be a non-negative integer, got ${String(n)}`)
  return n as RecordVersion
}

/** The version, or undefined when the value is not one (a conflict body without `record_version`). */
export function tryRecordVersion(n: unknown): RecordVersion | undefined {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 ? (n as RecordVersion) : undefined
}

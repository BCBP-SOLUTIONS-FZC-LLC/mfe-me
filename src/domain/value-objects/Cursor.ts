// An opaque page cursor from a keyset-paginated list (members, audit): base64 the service defines
// and the UI never reads or builds. A branded string, so a search term cannot be passed as one.
declare const brand: unique symbol
export type Cursor = string & { readonly [brand]: 'Cursor' }

/** The cursor in an answer (`next_cursor`), or undefined when there is no further page (absent or blank). */
export function parseCursor(next: unknown): Cursor | undefined {
  return typeof next === 'string' && next.trim() !== '' ? (next as Cursor) : undefined
}

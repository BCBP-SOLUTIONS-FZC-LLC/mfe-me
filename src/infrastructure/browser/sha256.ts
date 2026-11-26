// SHA-256 of the bytes that will be uploaded, as lowercase hex: User Profile re-hashes the object and
// refuses a mismatch (IAM-UX-13). `crypto.subtle` needs a secure context (https or localhost).
import type { Hasher } from '../../application/ports/hashing'

export const subtleHasher: Hasher = {
  async sha256Hex(bytes) {
    const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
  },
}

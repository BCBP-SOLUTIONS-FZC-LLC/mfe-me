/** SHA-256 of some bytes, as lowercase hex (`crypto.subtle` in infrastructure/browser/sha256.ts). */
export interface Hasher {
  sha256Hex(bytes: Uint8Array): Promise<string>
}

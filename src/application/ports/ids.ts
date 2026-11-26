/** Makes a fresh idempotency key (`crypto.randomUUID` in infrastructure/browser/idempotency.ts). */
export interface IdempotencyKeys {
  next(): string
}

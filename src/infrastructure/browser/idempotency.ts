// A fresh idempotency key for a delegation create (DLG-2). The dialog keeps one key for every retry of a
// submission and asks for a new one only after the user changes a field (LLD §7.5). The SDK's own request ID is
// the UUID the ApiClient would make for the same header, so the key is made the same way (not a second generator).
import { newRequestId } from '@bcbp-solutions-fzc-llc/frontend-sdk/core'
import type { IdempotencyKeys } from '../../application/ports/ids'

export const uuidKeys: IdempotencyKeys = { next: newRequestId }

// What the signed-in user may do here. All of it is a hint: IAM and the gateway decide (LLD §8).
// Every member may open every section, so there is no per-section flag; every write targets the
// caller, so the only gate is a read-only workspace. No role name is read.
import { useHasPermission, useReadOnly } from '@bcbp-solutions-fzc-llc/frontend-sdk/react'

export interface MeAccess {
  /** A read-only workspace (subscription ended): every write on G1–G5 is disabled (LLD §7.10). */
  readonly readOnly: boolean
  /** Not read-only: the user may save, upload, delegate. */
  readonly canWrite: boolean
  /** read:members, for the delegate picker (every member has it, spec §4.3). */
  readonly canReadMembers: boolean
}

export function useMeAccess(): MeAccess {
  const readOnly = useReadOnly()
  const canReadMembers = useHasPermission('read', 'members')
  return { readOnly, canWrite: !readOnly, canReadMembers }
}

// Who I am, for the routes that name me (`/users/<id>`): the IAM user ID is the token's `sub`
// (as mfe-admin's RolesCard compares it). The token's name and email are the fallback while the
// profile is being set up (LLD §7.2). The ID is sent only in paths, never in a body or header (IAM-UX-1).
import { useCurrentUser } from '@bcbp-solutions-fzc-llc/frontend-sdk/react'

export interface Self {
  /** My IAM user ID; undefined until the session has loaded (nothing is fetched before then). */
  readonly userId: string | undefined
  readonly name: string | undefined
  readonly email: string | undefined
}

export function useSelf(): Self {
  const user = useCurrentUser()
  return { userId: user?.sub, name: user?.name, email: user?.email }
}

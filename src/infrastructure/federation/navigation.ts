// Where these screens send the user next, outside this remote. Cross-remote moves go through the
// SDK's navigate() with the full path, workspace prefix included (shared-components handoff §3.2): the
// shell's router does the move (no page load) and a standalone page falls back to a full load. The
// prefix is built from the session context's slug, never hardcoded; nothing is offered until the
// context has loaded. The account-console URLs (G6) join this file with that screen.
import { tryGetConfig } from '@bcbp-solutions-fzc-llc/frontend-sdk/config'
import { navigate } from '@bcbp-solutions-fzc-llc/frontend-sdk/nav'
import { useSessionContext } from '@bcbp-solutions-fzc-llc/frontend-sdk/react'
import type { AccountSection, MeNavigation } from '../../application/ports/navigation'

/** The workspace's route prefix (for example `/t/acme`) from the session context's slug, or '' until it has loaded (standalone). */
export function useWorkspacePrefix(): string {
  const slug = useSessionContext()?.slug
  const prefix = tryGetConfig()?.auth.workspacePathPrefix
  return slug && prefix ? `${prefix}${slug}` : ''
}

export const ADMIN_REMOTE = 'admin'
export const ADMIN_SETTINGS_PATH = '/admin/settings'

/** Console paths by section: every one is the root until the Keycloak version's deep links are confirmed (LLD §15 #13). */
const ACCOUNT_PATHS: Record<AccountSection, string> = { root: '', signin: '', devices: '' }

/** The account console URL for a realm, or undefined without an IdP origin or realm (standalone with no config). */
export function accountConsoleUrl(realm: string | undefined, section: AccountSection): string | undefined {
  const origin = tryGetConfig()?.auth.idpOrigin?.replace(/\/+$/, '')
  if (!origin || !realm) return undefined
  return `${origin}/realms/${encodeURIComponent(realm)}/account/${ACCOUNT_PATHS[section]}`
}

export function createNavigation(workspacePrefix: string, realm?: string): MeNavigation {
  return {
    toAdminSettings: () => navigate(ADMIN_REMOTE, `${workspacePrefix}${ADMIN_SETTINGS_PATH}`),
    accountConsoleUrl: (section) => accountConsoleUrl(realm, section),
    isSharedConsole: () => realm !== undefined && realm === tryGetConfig()?.auth.trialRealm,
  }
}

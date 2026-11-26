// Where these screens send the user next, outside this remote. The shell's router does the move;
// the screens only ask (LLD §5, §2.3).

/** The parts of the Keycloak account console G6 links to. */
export type AccountSection = 'root' | 'signin' | 'devices'

export interface MeNavigation {
  /** Opens the admin remote's workspace settings (the delegation policy lives there). */
  toAdminSettings(): void
  /**
   * The Keycloak account console for this workspace's realm (`${idpOrigin}/realms/${realm}/account/`), or
   * undefined until the runtime config and the workspace are known. Built from configuration, never from
   * user input. The deep-link paths depend on the Keycloak version (LLD §15 #13), so every section is the root today.
   */
  accountConsoleUrl(section: AccountSection): string | undefined
  /** Whether this workspace is on the shared trial realm, whose console is shared by every trial (G6 says so). */
  isSharedConsole(): boolean
}

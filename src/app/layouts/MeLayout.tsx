// The page outlet and the section tabs (LLD §2.1, §4.4, §15 #1). web-shell's sidebar has one "My account"
// link and no sub-menu, so this remote draws a tab strip of its own (G1…G6) with plain links: every member may
// use every section, so no tab is hidden. It draws no header, user menu or sign-out (the shell owns those).
// Each routed page is in its own MFEErrorBoundary, so a throwing page is replaced while the tabs and the
// shell's sidebar keep working.
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { MFEErrorBoundary, useT } from '@bcbp-solutions-fzc-llc/frontend-sdk/react'
import { APP_ID } from '../../shared/constants/app'

/** Section → its path under /me and the catalogue key of its name. The index is G1. */
const TABS = [
  { path: '', end: true, key: 'nav.profile' },
  { path: '/availability', end: false, key: 'nav.availability' },
  { path: '/delegations', end: false, key: 'nav.delegations' },
  { path: '/ai', end: false, key: 'nav.ai' },
  { path: '/notifications', end: false, key: 'nav.notifications' },
  { path: '/security', end: false, key: 'nav.security' },
] as const

/**
 * Where /me starts in the current URL (`/t/acme/me` in the shell, `/me` under the standalone router's basename).
 * The tabs link from there, not relative to the route: this layout sits under a splat route (`/me/*`), and a
 * relative link would be resolved against the part of the path the splat matched.
 */
export function meBase(pathname: string): string {
  const match = /^(.*?\/me)(?:\/|$)/.exec(pathname)
  return match ? match[1]! : '/me'
}

export default function MeLayout() {
  const { pathname } = useLocation()
  const t = useT(APP_ID)
  const base = meBase(pathname)
  return (
    <div className="min-h-[calc(100dvh-var(--shell-header-height,0px))] bg-aura-canvas p-4 text-aura-text md:p-6">
      <nav aria-label={t('layout.sections')} className="mb-4 overflow-x-auto border-b border-aura-border">
        <ul className="flex min-w-max gap-1">
          {TABS.map((tab) => (
            <li key={tab.path}>
              <NavLink
                to={`${base}${tab.path}`}
                end={tab.end}
                className={({ isActive }) => `inline-block border-b-2 px-3 py-2 text-sm font-medium ${isActive ? 'border-aura-primary text-aura-text' : 'border-transparent text-aura-muted hover:text-aura-text'}`}
              >
                {t(tab.key)}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <main className="min-w-0">
        <MFEErrorBoundary mfe={APP_ID} resetKeys={[pathname]}>
          <Outlet />
        </MFEErrorBoundary>
      </main>
    </div>
  )
}

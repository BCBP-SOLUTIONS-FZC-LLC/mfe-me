// The remote's routes under the shell's /t/<slug>/me (or /me standalone), and the workspace
// basename. Each page names its route template for telemetry (LLD §4.4). Paths are the spec's §4.2.
import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { slugFromPath } from '@bcbp-solutions-fzc-llc/frontend-sdk/auth'
import { tryGetConfig } from '@bcbp-solutions-fzc-llc/frontend-sdk/config'
import { useRouteTemplate, useT } from '@bcbp-solutions-fzc-llc/frontend-sdk/react'
import SectionPlaceholder from '../../presentation/components/SectionPlaceholder'
import AiPreferencesPage from '../../presentation/pages/AiPreferencesPage'
import AvailabilityPage from '../../presentation/pages/AvailabilityPage'
import DelegationsPage from '../../presentation/pages/DelegationsPage'
import NotificationPreferencesPage from '../../presentation/pages/NotificationPreferencesPage'
import SecurityPage from '../../presentation/pages/SecurityPage'
import ProfilePage from '../../presentation/pages/ProfilePage'
import { APP_ID } from '../../shared/constants/app'
import MeLayout from '../layouts/MeLayout'

type SectionProps = { template: `/${string}`; title: string; children?: ReactNode }

/** The page titles (catalogue keys). */
const TITLES = {
  profile: 'nav.profile',
  availability: 'nav.availability',
  delegations: 'nav.delegations',
  ai: 'nav.ai',
  notifications: 'nav.notifications',
  security: 'nav.security',
} as const

/** A section page: registers its route template, then renders the screen (a placeholder until built). */
function Section({ template, title, children }: SectionProps) {
  useRouteTemplate(template)
  const t = useT(APP_ID)
  return children ?? <SectionPlaceholder title={t(title)} />
}

export function MeRoutes() {
  return (
    <Routes>
      <Route element={<MeLayout />}>
        <Route index element={<Section template="/t/:slug/me" title={TITLES.profile}><ProfilePage /></Section>} />
        <Route path="profile" element={<Navigate to=".." relative="path" replace />} />
        <Route path="availability" element={<Section template="/t/:slug/me/availability" title={TITLES.availability}><AvailabilityPage /></Section>} />
        <Route path="delegations" element={<Section template="/t/:slug/me/delegations" title={TITLES.delegations}><DelegationsPage /></Section>} />
        <Route path="ai" element={<Section template="/t/:slug/me/ai" title={TITLES.ai}><AiPreferencesPage /></Section>} />
        <Route path="notifications" element={<Section template="/t/:slug/me/notifications" title={TITLES.notifications}><NotificationPreferencesPage /></Section>} />
        <Route path="security" element={<Section template="/t/:slug/me/security" title={TITLES.security}><SecurityPage /></Section>} />
        {/* An unknown nested path (an old bookmark, a typo) goes to the index, not a blank page. */}
        <Route path="*" element={<Navigate to=".." relative="route" replace />} />
      </Route>
    </Routes>
  )
}

/** The shell's router basename for `pathname`: '<workspacePathPrefix><slug>', or '' outside a workspace. */
export function workspaceBasename(pathname: string): string {
  const auth = tryGetConfig()?.auth
  const slug = auth && slugFromPath(pathname, auth)
  return slug ? `${auth.workspacePathPrefix}${slug}` : ''
}

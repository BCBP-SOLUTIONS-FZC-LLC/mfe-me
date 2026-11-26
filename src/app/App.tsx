// The module the shell mounts (./App), and the page the standalone build renders (bootstrap/main.tsx).
// No props: the user, session context and workspace come from the platform SDK (LLD §4.3). The remote
// runs its own router under the shell's workspace prefix, as the SDK does not share react-router-dom.
import { BrowserRouter, Navigate, Route, Routes, useInRouterContext } from 'react-router-dom'
import MeProviders from './providers/MeProviders'
import { MeRoutes, workspaceBasename } from './routes'
import '../infrastructure/configuration/messages'
import './styles/index.css'

export { workspaceBasename }

export default function App() {
  return (
    <MeProviders>
      <AppRoutes />
    </MeProviders>
  )
}

function AppRoutes() {
  if (useInRouterContext()) return <MeRoutes />
  const basename = workspaceBasename(window.location.pathname)
  return (
    <BrowserRouter {...(basename ? { basename } : {})}>
      <Routes>
        <Route path="/me/*" element={<MeRoutes />} />
        <Route path="*" element={<Navigate to="/me" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

// The mount's providers: one QueryClient (cleared on unmount) and the services, unless an outer
// provider (a test) supplies its own services.
import { QueryClientProvider } from '@tanstack/react-query'
import { useApiClient, useSessionContext, useWorkspace } from '@bcbp-solutions-fzc-llc/frontend-sdk/react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { MeServicesProvider, useProvidedServices } from '../../presentation/features/services'
import { useWorkspacePrefix } from '../../infrastructure/federation/navigation'
import { createMeServices } from './composition'
import { createQueryClient } from './queryClient'

export default function MeProviders({ children }: { children: ReactNode }) {
  const provided = useProvidedServices()
  // The adapters are stateless, so they are made again when the tenant ID and slug arrive (the session
  // context loads after the first render). A workspace switch remounts the remote.
  const tenantId = useSessionContext()?.tenantId
  const workspacePrefix = useWorkspacePrefix()
  const realm = useWorkspace()?.realm
  // The SDK's client for the nearest MFE scope (RemoteBoundary in the shell, MFEErrorBoundary standalone).
  const client = useApiClient()
  const own = useMemo(() => createMeServices({ client, tenantId: () => tenantId, workspacePrefix, ...(realm ? { realm } : {}) }), [client, tenantId, workspacePrefix, realm])
  const [queryClient] = useState(createQueryClient)
  useEffect(() => () => queryClient.clear(), [queryClient])
  return (
    <QueryClientProvider client={queryClient}>
      <MeServicesProvider value={provided ?? own}>{children}</MeServicesProvider>
    </QueryClientProvider>
  )
}

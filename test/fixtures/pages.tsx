// Renders a screen as it runs in the shell: the SDK test platform (a signed-in member with a session
// context), the services (the in-memory IAM behind the ports, recording telemetry, a fixed clock) and a
// QueryClient, inside a router at /t/acme/me/….
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { MeServicesProvider, type MeServices } from '../../src/presentation/features/services'
import { DEPT, ME } from './domain'
import { createFakeIam, type FakeIam } from './fakeIam'
import { startPlatform } from './platform'
import { fakeServices } from './services'

export interface PageOptions {
  readonly readOnly?: boolean
  readonly path?: string
  readonly iam?: FakeIam
  readonly services?: Partial<MeServices>
  readonly permissions?: readonly `${string}:${string}`[]
  readonly user?: { sub: string; name?: string; email?: string }
  readonly departments?: readonly { id: string; level: string }[]
}

export function renderPage(ui: ReactElement, o: PageOptions = {}) {
  const iam = o.iam ?? createFakeIam()
  const platform = startPlatform({
    permissions: o.permissions ?? ['read:members'],
    user: o.user ?? { sub: ME, name: 'Ada Lovelace', email: 'ada@example.com' },
    context: { slug: 'acme', tenantId: 'tenant-1', departments: o.departments ?? [{ id: DEPT, level: 'reviewer' }], ...(o.readOnly ? { readOnly: true } : {}) },
  } as never)
  const { services, recorded } = fakeServices({ ...iam.ports, ...o.services })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <platform.Wrapper>
      <QueryClientProvider client={client}>
        <MeServicesProvider value={services}>
          <MemoryRouter initialEntries={[o.path ?? '/t/acme/me']}>{children}</MemoryRouter>
        </MeServicesProvider>
      </QueryClientProvider>
    </platform.Wrapper>
  )
  const view = render(ui, { wrapper: Wrapper })
  return { ...view, iam, recorded, services, client, platform }
}

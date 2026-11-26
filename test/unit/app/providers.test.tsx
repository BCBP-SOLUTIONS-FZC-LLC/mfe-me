import { QueryClient } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, rs } from '@rstest/core'
import MeProviders from '../../../src/app/providers/MeProviders'
import { createMeServices } from '../../../src/app/providers/composition'
import { createQueryClient } from '../../../src/app/providers/queryClient'
import { useMeServices, MeServicesProvider } from '../../../src/presentation/features/services'
import { problemReader } from '../../../src/infrastructure/api/problem'
import { metricsTelemetry } from '../../../src/infrastructure/telemetry/metrics'
import { startPlatform } from '../../fixtures/platform'
import { fakeServices } from '../../fixtures/services'

function Probe() {
  const { telemetry, problems } = useMeServices()
  return <p>{telemetry === metricsTelemetry && problems === problemReader ? 'real' : 'fake'}</p>
}

describe('MeProviders', () => {
  it('supplies the real services by default', () => {
    const platform = startPlatform({ context: { slug: 'acme', tenantId: 't' } })
    render(<MeProviders><Probe /></MeProviders>, { wrapper: platform.Wrapper })
    expect(screen.getByText('real')).toBeInTheDocument()
  })

  it('uses the services an outer provider supplies (a test)', () => {
    const platform = startPlatform()
    render(<MeServicesProvider value={fakeServices().services}><MeProviders><Probe /></MeProviders></MeServicesProvider>, { wrapper: platform.Wrapper })
    expect(screen.getByText('fake')).toBeInTheDocument()
  })

  it('clears its QueryClient on unmount', () => {
    const platform = startPlatform()
    const clear = rs.spyOn(QueryClient.prototype, 'clear')
    render(<MeProviders><Probe /></MeProviders>, { wrapper: platform.Wrapper }).unmount()
    expect(clear).toHaveBeenCalled()
    clear.mockRestore()
  })
})

describe('createQueryClient', () => {
  it('retries nothing itself (the SDK client retries a safe call), and does not refetch on focus', () => {
    const defaults = createQueryClient().getDefaultOptions()
    expect(defaults.queries?.retry).toBe(false)
    expect(defaults.mutations?.retry).toBe(false)
    expect(defaults.queries?.refetchOnWindowFocus).toBe(false)
  })
})

describe('composition', () => {
  it('wires the telemetry, problem reader, navigation, one adapter per IAM service, the storage PUT and the browser tools', () => {
    const services = createMeServices({ client: {} as never, workspacePrefix: '/t/acme', tenantId: () => 'tenant-1' })
    expect(services.telemetry).toBe(metricsTelemetry)
    expect(services.problems).toBe(problemReader)
    expect(typeof services.navigation.toAdminSettings).toBe('function')
    expect(Object.keys(services.userProfile)).toHaveLength(12)
    expect(Object.keys(services.delegation)).toHaveLength(6)
    expect(Object.keys(services.orgDirectory)).toHaveLength(3)
    expect(typeof services.signatureStorage.put).toBe('function')
    for (const tool of [services.images, services.hasher, services.ids, services.clock, services.options]) expect(tool).toBeDefined()
  })

  it('has no tenant until the session context gives one, and refuses a tenant call then', async () => {
    const services = createMeServices({ client: {} as never })
    await expect(services.orgDirectory.listMembers({})).rejects.toMatchObject({ name: 'MissingWorkspaceError' })
  })

  it('refuses useMeServices without a provider', () => {
    const platform = startPlatform()
    const quiet = rs.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Probe />, { wrapper: platform.Wrapper })).toThrow('useMeServices needs a MeServicesProvider')
    quiet.mockRestore()
  })
})

describe('useMeUseCases', () => {
  it('builds the use cases over the injected ports, once per services object', async () => {
    const { useMeUseCases } = await import('../../../src/presentation/features/services')
    const { renderHook } = await import('@testing-library/react')
    const platform = startPlatform()
    const { services } = fakeServices({ userProfile: { getUser: async () => 'profile' } as never })
    const wrapper = ({ children }: { children: React.ReactNode }) => (<platform.Wrapper><MeServicesProvider value={services}>{children}</MeServicesProvider></platform.Wrapper>)
    const { result, rerender } = renderHook(() => useMeUseCases(), { wrapper })
    expect(await result.current.getUserProfile.execute('u1')).toBe('profile')
    const first = result.current
    rerender()
    expect(result.current).toBe(first)
  })
})

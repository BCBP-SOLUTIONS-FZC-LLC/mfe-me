// Fake services for hook and component tests: a recording telemetry, the real problem reader (it is
// pure), and a navigation that records its calls. Wrapped around what a test renders.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import type { Measurement, MeTelemetry } from '../../src/application/ports/telemetry'
import { MeServicesProvider, type MeServices } from '../../src/presentation/features/services'
import { problemReader } from '../../src/infrastructure/api/problem'

export interface Recorded {
  loads: { resource: string; outcome: string }[]
  actions: { action: string; outcome: string }[]
  uploadFailures: string[]
  navigated: string[]
}

/** A port nothing should call: any method that is called rejects, naming it. A test replaces the ones it uses. */
function unused<P extends object>(name: string, over: Partial<P> = {}): P {
  return new Proxy(over, {
    get: (target, method) => (method in target ? Reflect.get(target, method) : async () => Promise.reject(new Error(`${name}.${String(method)} was called but the test did not stub it`))),
  }) as P
}

export function fakeServices(over: Partial<MeServices> = {}): { services: MeServices; recorded: Recorded } {
  const recorded: Recorded = { loads: [], actions: [], uploadFailures: [], navigated: [] }
  const measure = <O extends string>(push: (outcome: O) => void): Measurement<O> => ({ finish: push })
  const telemetry: MeTelemetry = {
    loadStarted: (resource) => measure((outcome) => recorded.loads.push({ resource, outcome })),
    actionStarted: (action) => measure((outcome) => recorded.actions.push({ action, outcome })),
    signatureUploadFailed: (stage) => void recorded.uploadFailures.push(stage),
  }
  const services: MeServices = {
    telemetry,
    navigation: { toAdminSettings: () => void recorded.navigated.push('admin-settings'), accountConsoleUrl: (section) => `https://idp.example/realms/tenant-acme/account/#${section}`, isSharedConsole: () => false },
    problems: problemReader,
    options: { allowedModels: ['model-a', 'model-b'], notificationEventTypes: ['doc.approved'], enabledLocales: ['en'], uploadOrigins: ['https://bucket.example'], timeZones: ['Europe/London', 'Asia/Dubai'] },
    clock: { now: () => new Date('2026-11-26T10:00:00Z') },
    ids: { next: () => 'key-1' },
    images: unused('images'),
    hasher: unused('hasher'),
    userProfile: unused('userProfile'),
    delegation: unused('delegation'),
    orgDirectory: unused('orgDirectory'),
    signatureStorage: unused('signatureStorage'),
    ...over,
  }
  return { services, recorded }
}

/** A wrapper with a fresh QueryClient (no retries, so a failure shows at once) and the fake services. */
export function servicesWrapper(services: MeServices, client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <MeServicesProvider value={services}>{children}</MeServicesProvider>
      </QueryClientProvider>
    )
  }
}

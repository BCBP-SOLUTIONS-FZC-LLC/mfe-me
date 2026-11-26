// The implementations the screens use, injected by the composition root (app/providers): a test
// supplies its own. Presentation never imports infrastructure (LLD §3); this is the seam.
import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { Clock } from '../../application/ports/clock'
import type { Hasher } from '../../application/ports/hashing'
import type { IdempotencyKeys } from '../../application/ports/ids'
import type { ImageProcessor } from '../../application/ports/media'
import type { MeNavigation } from '../../application/ports/navigation'
import type { MeOptions } from '../../application/ports/options'
import type { ProblemReader } from '../../application/ports/problems'
import type { MeTelemetry } from '../../application/ports/telemetry'
import { createUseCases, type MeUseCases } from '../../application/use-cases'
import type { DelegationPort } from '../../domain/repositories/DelegationPort'
import type { OrgDirectoryPort } from '../../domain/repositories/OrgDirectoryPort'
import type { SignatureStoragePort } from '../../domain/repositories/SignatureStoragePort'
import type { UserProfilePort } from '../../domain/repositories/UserProfilePort'

/** One port per IAM service (plus the storage PUT), the browser tools, the environment's options and telemetry. */
export interface MeServices {
  readonly telemetry: MeTelemetry
  readonly navigation: MeNavigation
  readonly problems: ProblemReader
  readonly options: MeOptions
  readonly clock: Clock
  readonly ids: IdempotencyKeys
  readonly images: ImageProcessor
  readonly hasher: Hasher
  readonly userProfile: UserProfilePort
  readonly delegation: DelegationPort
  readonly orgDirectory: OrgDirectoryPort
  readonly signatureStorage: SignatureStoragePort
}

const ServicesContext = createContext<MeServices | undefined>(undefined)

export function MeServicesProvider({ value, children }: { value: MeServices; children: ReactNode }) {
  return <ServicesContext.Provider value={value}>{children}</ServicesContext.Provider>
}

/** The services an outer provider (a test) supplied, or undefined: the composition root then uses its own. */
export function useProvidedServices(): MeServices | undefined {
  return useContext(ServicesContext)
}

export function useMeServices(): MeServices {
  const services = useContext(ServicesContext)
  if (!services) throw new Error('useMeServices needs a MeServicesProvider')
  return services
}

/** The application layer's use cases, built over the injected ports (one set per provided services object). */
export function useMeUseCases(): MeUseCases {
  const { userProfile, delegation, orgDirectory, signatureStorage, images, hasher, telemetry } = useMeServices()
  return useMemo(
    () => createUseCases({ userProfile, delegation, orgDirectory, signatureStorage }, { images, hasher, telemetry }),
    [userProfile, delegation, orgDirectory, signatureStorage, images, hasher, telemetry],
  )
}

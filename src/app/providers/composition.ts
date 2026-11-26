// The one place that decides which implementation backs each port: the HTTP adapters on the SDK
// ApiClient, the one presigned-PUT adapter, the browser tools, the runtime options, the metrics
// telemetry. A test supplies its own services through MeServicesProvider.
import type { ApiClient } from '@bcbp-solutions-fzc-llc/frontend-sdk/http'
import type { MeServices } from '../../presentation/features/services'
import { createDelegationAdapter } from '../../infrastructure/api/delegation'
import { createOrgDirectoryAdapter } from '../../infrastructure/api/orgDirectory'
import { problemReader } from '../../infrastructure/api/problem'
import type { ApiScope } from '../../infrastructure/api/scope'
import { createSignatureStorage } from '../../infrastructure/api/signatureStorage'
import { createUserProfileAdapter } from '../../infrastructure/api/userProfile'
import { canvasImageProcessor } from '../../infrastructure/browser/imageProcessor'
import { systemClock } from '../../infrastructure/browser/clock'
import { uuidKeys } from '../../infrastructure/browser/idempotency'
import { subtleHasher } from '../../infrastructure/browser/sha256'
import { createMeOptions } from '../../infrastructure/configuration/options'
import { createNavigation } from '../../infrastructure/federation/navigation'
import { metricsTelemetry } from '../../infrastructure/telemetry/metrics'

export interface CompositionOptions {
  /** The workspace's tenant ID from the session context, read at each call (undefined until it has loaded). */
  readonly tenantId?: () => string | undefined
  /** The SDK client for this remote's scope (`useApiClient()`: its calls carry the `me` label). */
  readonly client: ApiClient
  /** The workspace's route prefix (for example `/t/acme`), '' when there is none. */
  readonly workspacePrefix?: string
  /** The workspace's Keycloak realm, for the account console links (G6). */
  readonly realm?: string
}

export function createMeServices(o: CompositionOptions): MeServices {
  const scope: ApiScope = { client: o.client, tenantId: o.tenantId ?? (() => undefined) }
  const options = createMeOptions()
  return {
    telemetry: metricsTelemetry,
    navigation: createNavigation(o.workspacePrefix ?? '', o.realm),
    problems: problemReader,
    options,
    clock: systemClock,
    ids: uuidKeys,
    images: canvasImageProcessor,
    hasher: subtleHasher,
    userProfile: createUserProfileAdapter(scope),
    delegation: createDelegationAdapter(scope),
    orgDirectory: createOrgDirectoryAdapter(scope),
    signatureStorage: createSignatureStorage(() => options.uploadOrigins),
  }
}

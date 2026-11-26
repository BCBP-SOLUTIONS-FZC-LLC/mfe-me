// The fake IAM for tests: the shared core (dev/mock-iam/core.ts) held to the pinned Swagger by the contract
// harness, with `install` putting it in place of fetch.
import { rs } from '@rstest/core'
import { conformance } from '../contract/harness'
import { createFakeIamServer as createCore } from '../../dev/mock-iam/core'

export { ALAN, BUCKET, ENG, GRACE, ME, SUSPENDED, TENANT, type Injected } from '../../dev/mock-iam/core'

export function createFakeIamServer() {
  const core = createCore({ check: conformance })
  return { ...core, install: () => rs.stubGlobal('fetch', core.fetch) }
}

export type FakeIamServer = ReturnType<typeof createFakeIamServer>

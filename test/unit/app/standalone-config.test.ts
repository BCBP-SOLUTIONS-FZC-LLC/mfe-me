// The standalone page is its own host page: standalone.ts sets the page identity and loads
// /config/runtime.json. Each test file has its own SDK, and setup.ts builds the test platform in
// beforeEach, so beforeAll here sees the page as main.tsx does: no identity and no config yet.
import { getIdentity } from '@bcbp-solutions-fzc-llc/frontend-sdk/core'
import { tryGetConfig } from '@bcbp-solutions-fzc-llc/frontend-sdk/config'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it, rs } from '@rstest/core'
import { startStandalone } from '../../../src/infrastructure/configuration/standalone'

const shipped = JSON.parse(readFileSync(join(__dirname, '../../../public/config/runtime.json'), 'utf8')) as Record<string, unknown>
const requested: string[] = []
const seen: { identity?: ReturnType<typeof getIdentity>; configured?: boolean } = {}

beforeAll(async () => {
  // A deployed file: it names its environment.
  const config = { ...shipped, environment: 'staging' }
  rs.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    requested.push(String(input instanceof Request ? input.url : input))
    return new Response(JSON.stringify(config), { headers: { 'content-type': 'application/json' } })
  })
  await startStandalone()
  seen.identity = getIdentity()
  seen.configured = tryGetConfig() !== undefined
  rs.restoreAllMocks()
  rs.unstubAllGlobals()
})

describe('standalone page with a runtime config', () => {
  it('sets the page identity as mfe-me in the iam domain, in the environment runtime.json names', () => {
    expect(seen.identity).toMatchObject({ serviceName: 'mfe-me', domain: 'iam', environment: 'staging' })
  })

  it('loads /config/runtime.json once and sets it', () => {
    expect(requested).toHaveLength(1)
    expect(requested[0]).toMatch(/\/config\/runtime\.json$/)
    expect(seen.configured).toBe(true)
  })
})

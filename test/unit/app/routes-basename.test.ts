import { describe, expect, it } from '@rstest/core'
import { workspaceBasename } from '../../../src/app/routes'
import { startPlatform } from '../../fixtures/platform'

describe('workspaceBasename with runtime config', () => {
  it('is the workspace prefix and slug when the path is inside a workspace, else empty', () => {
    startPlatform()
    expect(workspaceBasename('/t/acme/me/delegations')).toBe('/t/acme')
    expect(workspaceBasename('/me')).toBe('')
  })
})

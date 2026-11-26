import { renderHook } from '@testing-library/react'
import { describe, expect, it, rs } from '@rstest/core'
import { createNavigation, useWorkspacePrefix } from '../../../src/infrastructure/federation/navigation'
import { startPlatform } from '../../fixtures/platform'

const navigate = rs.fn()
rs.mock('@bcbp-solutions-fzc-llc/frontend-sdk/nav', () => ({ navigate: (...a: unknown[]) => navigate(...a) }))

describe('navigation', () => {
  it('sends the user to the admin remote with the full workspace path', () => {
    createNavigation('/t/acme').toAdminSettings()
    expect(navigate).toHaveBeenCalledWith('admin', '/t/acme/admin/settings')
  })

  it('builds the workspace prefix from the session slug, and is empty until it loads', () => {
    const platform = startPlatform({ context: { slug: 'acme', tenantId: 't' } })
    expect(renderHook(() => useWorkspacePrefix(), { wrapper: platform.Wrapper }).result.current).toBe('/t/acme')
    const bare = startPlatform({ context: { slug: '', tenantId: 't' } })
    expect(renderHook(() => useWorkspacePrefix(), { wrapper: bare.Wrapper }).result.current).toBe('')
  })
})

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from '@rstest/core'
import App, { workspaceBasename } from '../../../src/app/App'
import { startPlatform } from '../../fixtures/platform'

describe('workspaceBasename (as web-shell computes its basename)', () => {
  it.each([
    ['/me', ''],
    ['/me/availability', ''],
    ['/t/acme/me', '/t/acme'],
    ['/t/acme/me/delegations', '/t/acme'],
    ['/', ''],
  ])('%s → %j', (path, basename) => {
    expect(workspaceBasename(path)).toBe(basename)
  })
})

describe('App inside the shell', () => {
  it.each([
    ['/t/acme/me', 'Profile'],
    ['/t/acme/me/profile', 'Profile'],
    ['/t/acme/me/availability', 'Availability'],
    ['/t/acme/me/delegations', 'Delegations'],
    ['/t/acme/me/ai', 'AI preferences'],
    ['/t/acme/me/notifications', 'Notifications'],
    ['/t/acme/me/security', 'Security'],
    ['/t/acme/me/nowhere', 'Profile'],
  ])('%s shows the %s page', async (path, title) => {
    const platform = startPlatform({ context: { slug: 'acme', tenantId: 'tenant-1' } })
    window.history.replaceState({}, '', path)
    render(<App />, { wrapper: platform.Wrapper })
    expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument()
  })
})

describe('App standalone', () => {
  it('redirects an unknown path to /me', async () => {
    const platform = startPlatform()
    window.history.replaceState({}, '', '/elsewhere')
    render(<App />, { wrapper: platform.Wrapper })
    expect(await screen.findByRole('heading', { name: 'Profile' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/me')
  })
})

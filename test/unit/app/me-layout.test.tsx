// The chrome: the page outlet only (the shell draws the frame; LLD §2.1), the six routes, the
// `profile` alias, and an unknown path returning to the index. A throwing page is replaced by the
// SDK's boundary and the next navigation recovers.
import { fireEvent, screen, within } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it, rs } from '@rstest/core'
import MeLayout, { meBase } from '../../../src/app/layouts/MeLayout'
import { MeRoutes } from '../../../src/app/routes'
import { renderPage } from '../../fixtures/pages'

function renderAt(path: string) {
  // As App mounts it: the routes under a splat `/me/*`.
  return renderPage(
    <Routes>
      <Route path="/me/*" element={<MeRoutes />} />
    </Routes>,
    { path: `/me${path === '/' ? '' : path}` },
  )
}

describe('MeLayout', () => {
  it('draws the six section tabs and nothing of the shell\'s: no header, user menu or sign-out', async () => {
    renderAt('/availability')
    await screen.findByRole('heading', { level: 1, name: 'Availability' })
    const tabs = screen.getByRole('navigation', { name: 'My account sections' })
    expect(within(tabs).getAllByRole('link').map((l) => l.textContent)).toEqual(['Profile', 'Availability', 'Delegations', 'AI preferences', 'Notifications', 'Security'])
    expect(within(tabs).getByRole('link', { name: 'Availability' })).toHaveAttribute('aria-current', 'page')
    expect(within(tabs).getByRole('link', { name: 'Profile' })).not.toHaveAttribute('aria-current')
    expect(screen.queryByRole('banner')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /sign out|logout/i })).not.toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
  })

  it('moves between sections with the tabs', async () => {
    renderAt('/')
    await screen.findByRole('heading', { level: 1, name: 'Profile' })
    fireEvent.click(within(screen.getByRole('navigation', { name: 'My account sections' })).getByRole('link', { name: 'Security' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Security' })).toBeInTheDocument()
    fireEvent.click(within(screen.getByRole('navigation', { name: 'My account sections' })).getByRole('link', { name: 'Profile' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Profile' })).toBeInTheDocument()
  })

  it.each([
    ['/', 'Profile'],
    ['/profile', 'Profile'],
    ['/delegations', 'Delegations'],
    ['/nope/deeper', 'Profile'],
  ])('%s shows %s', async (path, title) => {
    renderAt(path)
    expect(await screen.findByRole('heading', { level: 1, name: title })).toBeInTheDocument()
  })

  it('replaces a throwing page with the SDK fallback while the tabs keep working, and recovers on the next route', async () => {
    const quiet = rs.spyOn(console, 'error').mockImplementation(() => {})
    const Boom = (): never => {
      throw new Error('boom')
    }
    renderPage(
      <Routes>
        <Route element={<MeLayout />}>
          <Route path="bad" element={<Boom />} />
          <Route path="*" element={<p>fine</p>} />
        </Route>
      </Routes>,
      { path: '/bad' },
    )
    expect(screen.queryByText('fine')).not.toBeInTheDocument()
    const tabs = await screen.findByRole('navigation', { name: 'My account sections' })
    fireEvent.click(within(tabs).getByRole('link', { name: 'Security' }))
    expect(await screen.findByText('fine')).toBeInTheDocument()
    quiet.mockRestore()
  })
})

describe('meBase', () => {
  it.each([
    ['/t/acme/me', '/t/acme/me'],
    ['/t/acme/me/delegations', '/t/acme/me'],
    ['/me/availability', '/me'],
    ['/me', '/me'],
    ['/elsewhere', '/me'],
  ])('%s → %s', (path, base) => {
    expect(meBase(path)).toBe(base)
  })

  it('keeps the tabs pointing at the right sections from a nested page', async () => {
    renderAt('/delegations')
    const tabs = await screen.findByRole('navigation', { name: 'My account sections' })
    expect(within(tabs).getByRole('link', { name: 'Availability' })).toHaveAttribute('href', '/me/availability')
    expect(within(tabs).getByRole('link', { name: 'Profile' })).toHaveAttribute('href', '/me')
  })
})

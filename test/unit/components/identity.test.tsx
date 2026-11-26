import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from '@rstest/core'
import Avatar, { initialsOf } from '../../../src/presentation/components/identity/Avatar'
import AvailabilityDot from '../../../src/presentation/components/identity/AvailabilityDot'
import MemberPicker from '../../../src/presentation/components/identity/MemberPicker'
import UserChip from '../../../src/presentation/components/identity/UserChip'
import { ME, OTHER } from '../../fixtures/domain'
import { createFakeIam, problem } from '../../fixtures/fakeIam'
import { renderPage } from '../../fixtures/pages'
import { useState } from 'react'

describe('Avatar', () => {
  it('shows initials (at most two), a question mark for no name, and one tint per name', () => {
    expect(initialsOf('Ada Lovelace King')).toBe('AL')
    expect(initialsOf('  grace ')).toBe('G')
    expect(initialsOf('')).toBe('')
    const view = renderPage(
      <>
        <Avatar name="Ada Lovelace" />
        <Avatar name="" size="lg" />
      </>,
    )
    expect(view.container.textContent).toBe('AL?')
    expect(view.container.querySelector('.size-12')).not.toBeNull()
  })
})

describe('AvailabilityDot', () => {
  it('names every status in words, so colour is never the only signal', () => {
    renderPage(
      <>
        <AvailabilityDot status="available" />
        <AvailabilityDot status="busy" />
        <AvailabilityDot status="ooo" />
      </>,
    )
    return Promise.all(['Available', 'Busy', 'Out of office'].map((name) => screen.findByText(name)))
  })
})

describe('UserChip', () => {
  const found = (extra: object = {}) => ({ state: 'found' as const, user: { userId: ME, displayName: 'Ada Lovelace', email: 'ada@example.com', status: 'active' as const, provisional: false, recordVersion: 1 as never, ...extra } })

  it('shows a placeholder while loading, and a sentence (never an ID) when there is no profile', async () => {
    const loading = renderPage(<UserChip profile={undefined} />)
    expect(loading.container.querySelector('[aria-hidden=true]')).not.toBeNull()
    loading.unmount()
    renderPage(
      <>
        <UserChip profile={{ state: 'missing' }} />
        <UserChip profile={{ state: 'unavailable' }} />
      </>,
    )
    expect(await screen.findByText('Unknown user')).toBeInTheDocument()
    expect(screen.getByText('Name unavailable')).toBeInTheDocument()
  })

  it('shows name, email and job title, and the availability only when asked', async () => {
    renderPage(
      <>
        <UserChip profile={found({ jobTitle: 'Engineer', availability: 'busy' })} showAvailability />
        <UserChip profile={found({ availability: 'ooo' })} />
        <UserChip profile={found()} showAvailability />
      </>,
    )
    expect(await screen.findByText('ada@example.com · Engineer')).toBeInTheDocument()
    expect(screen.getAllByText('ada@example.com')).toHaveLength(2)
    expect(screen.getByText('Busy')).toBeInTheDocument()
    expect(screen.queryByText('Out of office')).not.toBeInTheDocument()
  })
})

describe('MemberPicker', () => {
  function Host({ excludeUserId }: { excludeUserId?: string }) {
    const [value, setValue] = useState('')
    return (
      <>
        <MemberPicker label="Delegate" value={value} onChange={setValue} {...(excludeUserId ? { excludeUserId } : {})} error="Pick someone" />
        <output>{value}</output>
      </>
    )
  }

  it('lists active members by name (not me, not suspended), flags out of office, and passes the chosen ID up', async () => {
    renderPage(<Host excludeUserId={ME} />)
    const select = await screen.findByRole('combobox', { name: 'Delegate' })
    await waitFor(() => expect(within(select).getByRole('option', { name: 'Grace Hopper' })).toBeInTheDocument())
    expect(within(select).getByRole('option', { name: 'Alan Turing (out of office)' })).toBeInTheDocument()
    expect(within(select).queryByRole('option', { name: 'Ada Lovelace' })).not.toBeInTheDocument()
    expect(screen.getByText('Pick someone')).toBeInTheDocument()
    await userEvent.setup().selectOptions(select, 'Grace Hopper')
    expect(screen.getByRole('status')).toHaveTextContent(OTHER)
  })

  it('names a member with no profile "Unknown user", and one whose lookup failed "Name unavailable"', async () => {
    const iam = createFakeIam()
    iam.state.users.delete(OTHER)
    const first = renderPage(<Host />, { iam })
    await waitFor(() => expect(within(screen.getByRole('combobox', { name: 'Delegate' })).getByRole('option', { name: 'Unknown user' })).toBeInTheDocument())
    first.unmount()
    const failing = createFakeIam()
    failing.failNext('batch', problem(500, 'INTERNAL'))
    renderPage(<Host />, { iam: failing })
    await waitFor(() => expect(within(screen.getAllByRole('combobox', { name: 'Delegate' })[0]!).getAllByRole('option', { name: 'Name unavailable' }).length).toBeGreaterThan(0))
  })

  it('says so when the members cannot be loaded, and pages with Load more', async () => {
    const failing = createFakeIam()
    failing.failNext('listMembers', problem(500, 'INTERNAL'))
    const first = renderPage(<Host />, { iam: failing })
    expect(await screen.findByText("We couldn't load the members.")).toBeInTheDocument()
    first.unmount()
    const paged = createFakeIam()
    paged.state.members = Array.from({ length: 60 }, (_, i) => ({ userId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, status: 'active' as const }))
    renderPage(<Host />, { iam: paged })
    await user().click(await screen.findByRole('button', { name: 'Load more' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument())
    expect(paged.calls.filter((c) => c === 'listMembers')).toHaveLength(2)
  })

  it('is empty without read:members', async () => {
    const { iam } = renderPage(<Host />, { permissions: [] })
    expect(await screen.findByRole('combobox', { name: 'Delegate' })).toBeInTheDocument()
    expect(iam.calls).not.toContain('listMembers')
  })
})

function user() {
  return userEvent.setup()
}

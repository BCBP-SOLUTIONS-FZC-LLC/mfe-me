import { describe, expect, it } from '@rstest/core'
import { meKeys } from '../../../src/application/queries/keys'

describe('meKeys', () => {
  const keys = meKeys('acme')

  it('starts every key with the app and the workspace slug', () => {
    const all = [keys.profile('u1'), keys.availability('u1'), keys.delegations(), keys.delegationPolicy(), keys.members(), keys.departments(), keys.roleLabels(), keys.aiPreferences('u1'), keys.notificationPreferences('u1'), keys.user('u1')]
    for (const key of all) expect(key.slice(0, 2)).toEqual(['me', 'acme'])
  })

  it('keeps two workspaces apart', () => {
    expect(meKeys('acme').profile('u1')).not.toEqual(meKeys('other').profile('u1'))
  })

  it('names the load resource second, so a resource can be invalidated by prefix', () => {
    expect(keys.profile('u1')[2]).toBe('profile')
    expect(keys.members({ limit: 50 })).toEqual(['me', 'acme', 'members', 'list', { limit: 50 }])
  })

  it('keeps the delegation policy outside the delegations prefix', () => {
    expect(keys.delegationPolicy().slice(0, 3)).not.toEqual(keys.delegations().slice(0, 3))
  })

  it('keeps the per-ID user summary apart from the profile', () => {
    expect(keys.user('u1')).toEqual(['me', 'acme', 'users', 'u1'])
    expect(keys.profile('u1')).not.toEqual(keys.user('u1'))
  })
})

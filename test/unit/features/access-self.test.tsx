import { renderHook } from '@testing-library/react'
import { describe, expect, it } from '@rstest/core'
import { useMeAccess } from '../../../src/presentation/features/access/useMeAccess'
import { useSelf } from '../../../src/presentation/features/self/useSelf'
import { useMeKeys } from '../../../src/presentation/features/workspace'
import { startPlatform } from '../../fixtures/platform'

describe('useMeAccess', () => {
  it('lets a member write, and reads read:members for the picker', () => {
    const platform = startPlatform({ permissions: ['read:members'] })
    const { result } = renderHook(() => useMeAccess(), { wrapper: platform.Wrapper })
    expect(result.current).toEqual({ readOnly: false, canWrite: true, canReadMembers: true })
  })

  it('has no read:members without the permission', () => {
    const platform = startPlatform({ permissions: [] })
    const { result } = renderHook(() => useMeAccess(), { wrapper: platform.Wrapper })
    expect(result.current.canReadMembers).toBe(false)
    expect(result.current.canWrite).toBe(true)
  })

  it('disables every write in a read-only workspace', () => {
    const platform = startPlatform({ context: { slug: 'acme', tenantId: 't', readOnly: true } })
    const { result } = renderHook(() => useMeAccess(), { wrapper: platform.Wrapper })
    expect(result.current.readOnly).toBe(true)
    expect(result.current.canWrite).toBe(false)
  })
})

describe('useSelf', () => {
  it('is my IAM user ID (the token sub), name and email', () => {
    const platform = startPlatform({ user: { sub: 'user-1', name: 'Ada', email: 'ada@example.com' } })
    const { result } = renderHook(() => useSelf(), { wrapper: platform.Wrapper })
    expect(result.current).toEqual({ userId: 'user-1', name: 'Ada', email: 'ada@example.com' })
  })
})

describe('useMeKeys', () => {
  it('is ready with the workspace slug in every key', () => {
    const platform = startPlatform({ context: { slug: 'acme', tenantId: 't' } })
    const { result } = renderHook(() => useMeKeys(), { wrapper: platform.Wrapper })
    expect(result.current.ready).toBe(true)
    expect(result.current.keys.all).toEqual(['me', 'acme'])
  })
})

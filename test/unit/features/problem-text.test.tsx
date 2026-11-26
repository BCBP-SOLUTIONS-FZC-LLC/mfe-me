import { renderHook } from '@testing-library/react'
import { ProblemError } from '@bcbp-solutions-fzc-llc/frontend-sdk/problem'
import { describe, expect, it } from '@rstest/core'
import { useProblemText } from '../../../src/presentation/features/useProblemText'
import { startPlatform } from '../../fixtures/platform'
import { fakeServices, servicesWrapper } from '../../fixtures/services'

const problem = (status: number, errorCode?: string) =>
  new ProblemError({ type: 'about:blank', title: 'Server said', status, detail: 'SECRET', ...(errorCode ? { errorCode } : {}), extensions: {} } as never)

function text() {
  const platform = startPlatform()
  const Services = servicesWrapper(fakeServices().services)
  return renderHook(() => useProblemText(), { wrapper: ({ children }) => (<platform.Wrapper><Services>{children}</Services></platform.Wrapper>) }).result.current
}

describe('useProblemText', () => {
  it('uses this remote\'s sentence for a known code', async () => {
    const t = text()
    await new Promise((r) => setTimeout(r, 0))
    expect(t(problem(409, 'SELF_DELEGATION'))).toBe("You can't delegate to yourself.")
  })

  it('falls back to the SDK sentence for an unknown problem, never the server detail', async () => {
    const t = text()
    await new Promise((r) => setTimeout(r, 0))
    const sentence = t(problem(500, 'NEW_CODE'))
    expect(sentence).not.toContain('SECRET')
    expect(sentence).not.toBe('')
  })

  it('says something generic for anything that is not a problem', async () => {
    const t = text()
    await new Promise((r) => setTimeout(r, 0))
    expect(t(new Error('x'))).toBe('Something went wrong. Try again.')
  })
})

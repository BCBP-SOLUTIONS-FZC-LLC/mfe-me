import { describe, expect, it, rs } from '@rstest/core'
import { FALLBACK_ENVIRONMENT, standaloneIdentity } from '../../../src/infrastructure/configuration/standalone'
import { startPlatform } from '../../fixtures/platform'

const render = rs.fn()
const createRoot = rs.fn(() => ({ render }))

rs.mock('react-dom/client', () => ({
  createRoot,
}))

describe('main', () => {
  it('mounts #app inside the SDK error boundary', async () => {
    // The standalone page's own identity; the test platform's config stands in for runtime.json.
    startPlatform({ identity: standaloneIdentity(FALLBACK_ENVIRONMENT) })
    document.body.innerHTML = '<div id="app"></div>'
    await import('../../../src/app/bootstrap/main')
    // It renders once startStandalone has set the identity and config.
    await rs.waitFor(() => expect(render).toHaveBeenCalled())
    expect(createRoot).toHaveBeenCalledWith(document.getElementById('app'))
    // Standalone has no shell RemoteBoundary: App renders inside the SDK's MFEErrorBoundary.
    const tree = (render.mock.calls[0] as unknown[])[0] as { props: { children: { type: { name: string }; props: { mfe: string } } } }
    expect(tree.props.children.type.name).toBe('MFEErrorBoundary')
    expect(tree.props.children.props.mfe).toBe('me')
  })
})

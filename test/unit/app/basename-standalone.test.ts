import { describe, expect, it, rs } from '@rstest/core'

describe('workspaceBasename', () => {
  it('is empty without runtime config (standalone)', async () => {
    rs.resetModules()
    rs.doMock('@bcbp-solutions-fzc-llc/frontend-sdk/config', () => ({ tryGetConfig: () => undefined }))
    const standalone = await import('../../../src/app/App')
    expect(standalone.workspaceBasename('/t/acme/me')).toBe('')
    rs.doUnmock('@bcbp-solutions-fzc-llc/frontend-sdk/config')
  })
})

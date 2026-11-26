import { describe, it, expect, rs } from '@rstest/core'

describe('createMeOptions without a runtime config', () => {
  it('is empty before any runtime config exists (standalone without one)', () => {
    rs.resetModules()
    rs.doMock('@bcbp-solutions-fzc-llc/frontend-sdk/config', () => ({ tryGetConfig: () => undefined }))
    return import('../../../src/infrastructure/configuration/options').then(({ createMeOptions: make }) => {
      expect(make(() => []).allowedModels).toEqual([])
      rs.doUnmock('@bcbp-solutions-fzc-llc/frontend-sdk/config')
    })
  })
})

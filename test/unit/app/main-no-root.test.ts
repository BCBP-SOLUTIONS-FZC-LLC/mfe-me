import { describe, expect, it, rs } from '@rstest/core'

describe('main without a root element', () => {
  it('throws when #app is missing', async () => {
    rs.resetModules()
    document.body.innerHTML = ''
    await expect(import('../../../src/app/bootstrap/main')).rejects.toThrow('Root element #app not found')
  })
})

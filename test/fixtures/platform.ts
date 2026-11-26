import { createTestPlatform } from '@bcbp-solutions-fzc-llc/frontend-sdk/testing'
import { registerMessages } from '../../src/infrastructure/configuration/messages'

/** A fresh SDK runtime (as createTestPlatform) with this remote's messages registered again. Every member may use every screen, so no permission set is needed (LLD §8). */
export function startPlatform(o: Parameters<typeof createTestPlatform>[0] = {}) {
  const platform = createTestPlatform(o)
  registerMessages()
  return platform
}

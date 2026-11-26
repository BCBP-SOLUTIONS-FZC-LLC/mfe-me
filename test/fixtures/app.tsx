// Opens the whole App (its own router, the real adapters on the SDK client) at a workspace path, as web-shell
// mounts it, against the fetch-level fake IAM. The browser's image decoding is the one thing stubbed besides the
// network: a happy-dom page has no createImageBitmap or canvas.
import { render } from '@testing-library/react'
import { rs } from '@rstest/core'
import App from '../../src/app/App'
import { createFakeIamServer, ENG, ME, type FakeIamServer } from './fakeIamServer'
import { startPlatform } from './platform'

export const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])

export interface AppOptions {
  readonly server?: FakeIamServer
  readonly readOnly?: boolean
  readonly realm?: string
  readonly flags?: Record<string, string>
  /** The PNG the stubbed canvas produces. */
  readonly encoded?: Uint8Array
}

export const DEFAULT_FLAGS = {
  'me.ai.models': 'model-a, model-b',
  'me.notifications.eventTypes': 'doc.approved, doc.rejected',
  'me.signature.uploadOrigins': 'https://bucket.example',
}

export function openApp(path = '/t/acme/me', o: AppOptions = {}) {
  const server = o.server ?? createFakeIamServer()
  server.install()
  const encoded = o.encoded ?? PNG
  rs.stubGlobal('createImageBitmap', async () => ({ width: 100, height: 50, close: () => {} }))
  rs.stubGlobal(
    'OffscreenCanvas',
    class {
      getContext() {
        return { drawImage: () => {} }
      }
      async convertToBlob() {
        return new Blob([encoded as BlobPart], { type: 'image/png' })
      }
    },
  )
  const platform = startPlatform({
    user: { sub: ME, name: 'Ada Lovelace', email: 'ada@example.com' },
    permissions: ['read:members'],
    config: { flags: o.flags ?? DEFAULT_FLAGS } as never,
    workspace: { realm: o.realm ?? 'tenant-acme', slug: 'acme', kind: 'paid' } as never,
    context: { slug: 'acme', tenantId: 'tenant-1', departments: [{ id: ENG, level: 'approver' }], ...(o.readOnly ? { readOnly: true } : {}) },
  } as never)
  window.history.replaceState({}, '', path)
  const view = render(<App />, { wrapper: platform.Wrapper })
  return { ...view, server, platform }
}

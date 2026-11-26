// DEV ONLY (npm run dev:harness): the My account remote without a shell or an IAM. It starts the SDK's test
// platform (a signed-in member with a session context), answers /api/* and the signature bucket from the same fake
// IAM the e2e tests use, and mounts the real App at /t/acme/me. Nothing here is part of `npm run build`:
// rsbuild.config.ts adds this entry only when ME_HARNESS=1.
//
// Query parameters (the toolbar sets them): readonly=1, realm=trial, delay=ms (latency on every call, default
// 150), federated=1 (a directory-sourced profile), covering=1 (someone covers for me), delegations=1 (two
// delegations to list), nomodels=1 (no model list configured).
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/geist'
import '@fontsource-variable/inter'
import App from '../src/app/App'
import { startPlatform } from '../test/fixtures/platform'
import { ALAN, BUCKET, ENG, GRACE, ME, createFakeIamServer } from './mock-iam/core'

const params = new URLSearchParams(window.location.search)
const readOnly = params.get('readonly') === '1'
const realm = params.get('realm') === 'trial' ? 'trial' : 'tenant-acme'
const delay = Number(params.get('delay') ?? 150)

const iam = createFakeIamServer()
if (params.get('federated') === '1') iam.state.profile['source'] = 'federated'
if (params.get('covering') === '1') iam.state.availability = { ...iam.state.availability, delegate_user_id: GRACE }
if (params.get('delegations') === '1') {
  const soon = new Date(Date.now() + 2 * 86_400_000).toISOString()
  iam.state.delegations = [
    { delegation_id: 'dlg-a', delegator_id: ME, delegate_id: GRACE, scope: 'department', scope_id: ENG, starts_at: new Date().toISOString(), ends_at: new Date(Date.now() + 20 * 86_400_000).toISOString(), status: 'active', record_version: 1 },
    { delegation_id: 'dlg-b', delegator_id: ME, delegate_id: ALAN, scope: 'all', starts_at: new Date().toISOString(), review_due_at: soon, review_window_days: 90, status: 'active', record_version: 3 },
  ]
}

// IAM calls and the signature bucket go to the fake; everything else (fonts, assets, runtime config) is the real network.
const realFetch = window.fetch.bind(window)
window.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input), window.location.href)
  if (!url.pathname.startsWith('/api/') && url.origin !== BUCKET) return realFetch(input, init)
  await new Promise((r) => setTimeout(r, delay))
  return iam.fetch(input, init)
}

const flags: Record<string, string> = {
  'me.notifications.eventTypes': 'tender.published, tender.awarded, document.approved, document.rejected',
  'me.signature.uploadOrigins': BUCKET,
  ...(params.get('nomodels') === '1' ? {} : { 'me.ai.models': 'model-a, model-b' }),
}
const platform = startPlatform({
  permissions: ['read:members'],
  user: { sub: ME, name: 'Ada Lovelace', email: 'ada@example.com' },
  config: { flags } as never,
  workspace: { realm, slug: 'acme', kind: realm === 'trial' ? 'trial' : 'paid' } as never,
  context: { slug: 'acme', tenantId: 'tenant-1', departments: [{ id: ENG, level: 'approver' }], ...(readOnly ? { readOnly: true } : {}) },
} as never)

const bar = document.createElement('form')
bar.dataset['harness'] = ''
bar.style.cssText = 'position:fixed;right:8px;bottom:8px;z-index:9999;display:flex;gap:8px;align-items:center;padding:6px 10px;font:12px system-ui;background:#111;color:#fff;border-radius:8px;opacity:.9'
const box = (name: string, label: string) => `<label><input type="checkbox" name="${name}" value="1" ${params.get(name) === '1' ? 'checked' : ''}/> ${label}</label>`
bar.innerHTML = `<strong>harness</strong>
  ${box('readonly', 'read-only')} ${box('federated', 'federated')} ${box('covering', 'covered')} ${box('delegations', 'delegations')} ${box('nomodels', 'no models')}
  <label>realm <select name="realm"><option>paid</option><option ${realm === 'trial' ? 'selected' : ''} value="trial">trial</option></select></label>
  <button>apply</button>`
bar.addEventListener('submit', (e) => {
  e.preventDefault()
  const next = new URLSearchParams()
  for (const [k, v] of new FormData(bar)) if (typeof v === 'string' && v !== '' && v !== 'paid') next.set(k, v)
  window.location.search = next.toString()
})

if (window.location.pathname === '/' || window.location.pathname === '/harness.html') window.history.replaceState({}, '', '/t/acme/me' + window.location.search)
document.body.append(bar)
createRoot(document.getElementById('app')!).render(
  <platform.Wrapper>
    <App />
  </platform.Wrapper>,
)

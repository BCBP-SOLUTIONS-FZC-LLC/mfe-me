// The smoke suite's target (modelled on web-shell's test/smoke/env.ts): SMOKE_BASE_URL is required.
// SMOKE_MODE is `image` (the nginx image on its own) or `live` (a deployment behind CloudFront); by
// default a localhost URL is the image and anything else is live. ENVIRONMENT is the page identity's
// environment the SDK validates the runtime config with. In live mode it is also the target
// environment the deploy check holds runtime.json to (`environmentSet`: whether it was given).
const raw = process.env['SMOKE_BASE_URL']
if (!raw) {
  throw new Error('smoke: set SMOKE_BASE_URL, e.g. SMOKE_BASE_URL=http://127.0.0.1:18080 after `docker run -p 127.0.0.1:18080:8080 <image>` (test/smoke/README.md)')
}
const baseUrl = new URL(raw).origin
const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(new URL(baseUrl).hostname)
const mode = process.env['SMOKE_MODE'] ?? (local ? 'image' : 'live')
if (mode !== 'image' && mode !== 'live') throw new Error(`smoke: SMOKE_MODE must be image or live, got ${mode}`)

export const smokeenv = {
  baseUrl,
  mode: mode as 'image' | 'live',
  environment: process.env['ENVIRONMENT'] ?? (mode === 'image' ? 'prod' : 'dev'),
  environmentSet: process.env['ENVIRONMENT'] !== undefined,
}

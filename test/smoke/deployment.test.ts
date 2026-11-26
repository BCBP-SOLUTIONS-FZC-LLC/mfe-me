// Smoke tests of the served remote, as web-shell's test/smoke/deployment.test.ts does for the shell:
// the standalone document, the SPA rule, the remote's container (remoteEntry.js, its integrity and the
// manifest entry web-shell loads it by), the hashed assets, the runtime config validated by the SDK.
// GET only, against SMOKE_BASE_URL (test/smoke/README.md):
// - image: the nginx image on its own (.github/scripts/smoke-tests.sh). nginx's exact behaviour is
//   checked: 404 for missing API, config and asset paths, Cache-Control and CORS per location, no maps.
// - live: a deployment behind CloudFront. The platform's security headers are checked too; the gateway
//   answers /api, so only "never index.html" is asserted there.
import { createHash } from 'node:crypto'
import { RuntimeConfigError, setRuntimeConfig, tryGetConfig } from '@bcbp-solutions-fzc-llc/frontend-sdk/config'
import { initializeCore } from '@bcbp-solutions-fzc-llc/frontend-sdk/core'
import { beforeAll, describe, expect, it } from '@rstest/core'
import { smokeenv } from './env'

const { baseUrl, mode, environment, environmentSet } = smokeenv
const image = mode === 'image'
const NAME = 'me'
const OWNER_DOMAIN = 'iam'

interface Fetched {
  url: string
  status: number
  headers: Headers
  body: Buffer
  text: string
}

/** GET `path` (resolved against `from`, default the base URL); never follows redirects. */
async function get(path: string, from: string = baseUrl, headers?: Record<string, string>): Promise<Fetched> {
  const url = new URL(path, from).href
  let res: Response
  try {
    res = await fetch(url, { method: 'GET', redirect: 'manual', ...(headers ? { headers } : {}), signal: AbortSignal.timeout(20_000) })
  } catch (cause) {
    throw new Error(`GET ${url} failed: ${String((cause as Error)?.cause ?? cause)}`, { cause })
  }
  const body = Buffer.from(await res.arrayBuffer())
  return { url, status: res.status, headers: res.headers, body, text: body.toString('utf8') }
}

const where = (r: Fetched, what = '') => `GET ${r.url}${what ? `: ${what}` : ''}`
const contentType = (r: Fetched) => r.headers.get('content-type') ?? ''
const cacheControl = (r: Fetched) => r.headers.get('cache-control') ?? ''
const JS = /^(text|application)\/(javascript|ecmascript|x-javascript)\b/i
const JSON_TYPE = /^application\/([a-z.+-]*\+)?json\b/i
const HTML = /^text\/html\b/i
const APP_ROOT = /<div id=["']?app\b/
const sha384 = (body: Buffer) => `sha384-${createHash('sha384').update(body).digest('base64')}`

function json(r: Fetched): unknown {
  try {
    return JSON.parse(r.text) as unknown
  } catch {
    throw new Error(`${where(r)} is not JSON: ${r.text.slice(0, 200)}`)
  }
}

function expectNoCache(r: Fetched): void {
  expect(cacheControl(r), where(r, 'Cache-Control')).toMatch(/\bno-(cache|store)\b/)
}

/** The <script> tags of the document; fails on an inline one (CSP script-src 'self'). */
function scripts(r: Fetched): string[] {
  const out: string[] = []
  for (const [, attrs = '', body = ''] of r.text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    expect(body.trim(), where(r, `inline script <script${attrs}>`)).toBe('')
    const src = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs)?.slice(1).find(Boolean)
    expect(src, where(r, `<script${attrs}> has no src`)).toBeDefined()
    out.push(src!)
  }
  return out
}

/** CSP directive → values. */
function directives(csp: string): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const part of csp.split(';')) {
    const [name, ...values] = part.trim().split(/\s+/)
    if (name) out.set(name.toLowerCase(), values)
  }
  return out
}

/** The remote's entry as served, and the manifest entry the build wrote for it (image only: the build's own file). */
async function remoteEntry(): Promise<Fetched> {
  return get('/remoteEntry.js')
}

beforeAll(async () => {
  const r = await get('/').catch((e: unknown) => {
    throw new Error(`smoke: nothing answers at ${baseUrl} (${String(e)}). See test/smoke/README.md.`)
  })
  expect(r.status, where(r)).toBe(200)
})

describe(`mfe-me smoke (${mode}, ${baseUrl})`, () => {
  describe('the standalone document', () => {
    it('GET / is index.html: the app root, uncached, every script external and same-origin', async () => {
      const r = await get('/')
      expect(r.status, where(r)).toBe(200)
      expect(contentType(r), where(r, 'Content-Type')).toMatch(HTML)
      expect(r.text, where(r)).toMatch(APP_ROOT)
      expectNoCache(r)
      const tags = scripts(r)
      expect(tags.length, where(r, 'external scripts')).toBeGreaterThan(0)
      expect(r.text, where(r, 'inline event handler attribute')).not.toMatch(/<[^>]+\son[a-z]+\s*=/i)
      // Fonts and styles are self-hosted: the platform CSP allows no third-party origin.
      expect(r.text, where(r, 'third-party <link>/<script> origin')).not.toMatch(/<(link|script)\b[^>]*\b(href|src)=["']?(https?:)?\/\//i)
    })

    it.each(['/t/acme/me/availability', '/t/acme/me/delegations', '/me/ai', '/auth/callback?code=x&state=y'])(
      'the deep link %s is index.html, uncached (SPA rule)',
      async (path) => {
        const [index, r] = [await get('/'), await get(path)]
        expect(r.status, where(r)).toBe(200)
        expect(contentType(r), where(r, 'Content-Type')).toMatch(HTML)
        expect(r.text, where(r, 'body equals GET /')).toBe(index.text)
        expectNoCache(r)
      },
    )

    it('each script loads same-origin, as JavaScript, immutable, and no source map is served beside it', async () => {
      const doc = await get('/')
      for (const src of scripts(doc)) {
        const r = await get(src, doc.url)
        expect(new URL(r.url).origin, where(r, 'same origin')).toBe(new URL(baseUrl).origin)
        expect(r.status, where(r)).toBe(200)
        expect(contentType(r), where(r, 'Content-Type')).toMatch(JS)
        expect(cacheControl(r), where(r, 'Cache-Control')).toMatch(/\bimmutable\b/)
        const map = await get(`${src}.map`, doc.url)
        expect(map.status, where(map)).toBeGreaterThanOrEqual(400)
      }
    })

    it('each stylesheet and font the document names is served immutable from /assets/', async () => {
      const doc = await get('/')
      const css = [...doc.text.matchAll(/<link\b[^>]*\bhref=["']([^"']+\.css)["']/gi)].map((m) => m[1]!)
      expect(css.length, where(doc, 'stylesheets')).toBeGreaterThan(0)
      for (const href of css) {
        const r = await get(href, doc.url)
        expect(r.status, where(r)).toBe(200)
        expect(contentType(r), where(r, 'Content-Type')).toMatch(/^text\/css\b/i)
        expect(cacheControl(r), where(r, 'Cache-Control')).toMatch(/\bimmutable\b/)
        for (const font of [...r.text.matchAll(/url\(\s*["']?([^"')]+\.woff2)["']?\s*\)/g)].map((m) => m[1]!).slice(0, 3)) {
          const f = await get(font, r.url)
          expect(f.status, where(f)).toBe(200)
          expect(cacheControl(f), where(f, 'Cache-Control')).toMatch(/\bimmutable\b/)
        }
      }
    })

    it.each(['/missing.0123456789abcdef.js', '/assets/missing.0123456789abcdef.js', '/image/missing.png'])(
      'a missing file (%s) is an error, not index.html',
      async (path) => {
        const r = await get(path)
        expect(r.status, where(r)).toBeGreaterThanOrEqual(400)
        expect(r.text, where(r)).not.toMatch(APP_ROOT)
        if (image) expect(r.status, where(r)).toBe(404)
      },
    )
  })

  describe('the remote container', () => {
    it('remoteEntry.js defines the container web-shell loads, revalidates, and is readable cross-origin', async () => {
      const r = await remoteEntry()
      expect(r.status, where(r)).toBe(200)
      expect(contentType(r), where(r, 'Content-Type')).toMatch(JS)
      expectNoCache(r)
      // The container global is `__platform_mfe_<name>`, a plain script (a Vite ES module would not load).
      expect(r.text, where(r, `var __platform_mfe_${NAME}`)).toMatch(new RegExp(`^\\s*var __platform_mfe_${NAME}\\b`))
      // The shell loads it crossorigin="anonymous" with an integrity: it needs CORS, not credentials.
      expect(r.headers.get('access-control-allow-origin'), where(r, 'Access-Control-Allow-Origin')).toBe('*')
      if (image) expect(r.headers.get('cross-origin-resource-policy'), where(r, 'Cross-Origin-Resource-Policy')).toBe('cross-origin')
    })

    it('exposes ./App and takes React and the SDK from the shell (no bundled copy)', async () => {
      const r = await remoteEntry()
      expect(r.text, where(r, '"./App" exposed')).toContain('"./App"')
      // The SDK is consumed from the shell's share scope, never bundled (webpack-preset import:false).
      expect(r.text, where(r, 'shared SDK')).toContain('@bcbp-solutions-fzc-llc/frontend-sdk')
      expect(r.text, where(r, 'SDK source bundled')).not.toContain('createApiClient=function')
    })

    it('answers a CORS request for remoteEntry.js and its chunks (the shell loads them from another origin in dev)', async () => {
      const r = await get('/remoteEntry.js', baseUrl, { origin: 'https://shell.example.com' })
      expect(r.headers.get('access-control-allow-origin'), where(r, 'Access-Control-Allow-Origin')).toBe('*')
    })

    it.skipIf(!image)('the manifest entry the build wrote carries the integrity of the remoteEntry.js served here', async () => {
      const r = await remoteEntry()
      const entry = await get('/remote-manifest-entry.json')
      expect(entry.status, where(entry)).toBe(200)
      const m = json(entry) as Record<string, { entry?: string; version?: string; ownerDomain?: string; integrity?: string }>
      expect(Object.keys(m), where(entry, 'the one remote')).toEqual([NAME])
      const e = m[NAME]!
      expect(e.ownerDomain, where(entry, 'ownerDomain')).toBe(OWNER_DOMAIN)
      expect(e.entry, where(entry, 'entry')).toBe('remoteEntry.js')
      // A release's tag (1.2.3), or a CI build's commit SHA or `dev`: the version names the deploy path /remotes/me/<version>/, so it must be URL-safe.
      expect(e.version, where(entry, 'version')).toMatch(/^[0-9A-Za-z][0-9A-Za-z._+-]*$/)
      expect(e.integrity, where(entry, `integrity of ${r.url}`)).toBe(sha384(r.body))
      expectNoCache(entry)
    })

    it('every chunk the remote loads is same-origin JavaScript, cross-origin readable and immutable', async () => {
      const r = await remoteEntry()
      const chunks = [...new Set([...r.text.matchAll(/["']([0-9a-z_.-]+\.[0-9a-f]{16}\.js)["']/g)].map((m) => m[1]!))]
      for (const chunk of chunks.slice(0, 20)) {
        const c = await get(chunk, r.url)
        expect(c.status, where(c)).toBe(200)
        expect(contentType(c), where(c, 'Content-Type')).toMatch(JS)
        expect(cacheControl(c), where(c, 'Cache-Control')).toMatch(/\bimmutable\b/)
        expect(c.headers.get('access-control-allow-origin'), where(c, 'Access-Control-Allow-Origin')).toBe('*')
      }
    })
  })

  describe('/api/*', () => {
    it('an unknown API path is never the SPA index.html', async () => {
      const r = await get('/api/does-not-exist')
      expect(r.status, where(r)).toBeGreaterThanOrEqual(400)
      expect(r.text, where(r)).not.toMatch(APP_ROOT)
      if (image) expect(r.status, where(r)).toBe(404)
    })

    it.skipIf(!image).each(['/otel/v1/traces', '/csp-report', '/config/missing.json', '/remotes/me/remoteEntry.js'])(
      'the image never answers %s with index.html',
      async (path) => {
        const r = await get(path)
        expect(r.status, where(r)).toBe(404)
        expect(r.text, where(r)).not.toMatch(APP_ROOT)
      },
    )
  })

  describe('/config/runtime.json', () => {
    it('is served uncached and passes the SDK runtime-config validation', async () => {
      const r = await get('/config/runtime.json')
      expect(r.status, where(r)).toBe(200)
      expect(contentType(r), where(r, 'Content-Type')).toMatch(JSON_TYPE)
      expectNoCache(r)
      if (!tryGetConfig()) initializeCore({ serviceName: 'mfe-me-smoke', domain: OWNER_DOMAIN, environment })
      try {
        setRuntimeConfig(json(r) as Parameters<typeof setRuntimeConfig>[0])
      } catch (e) {
        if (e instanceof RuntimeConfigError) throw new Error(`${where(r)} fails the SDK's validation: ${e.message}`, { cause: e })
        throw e
      }
      expect(tryGetConfig()?.auth.clientId, where(r, 'auth.clientId')).toBeTruthy()
    })

    // One build serves every environment: the standalone page takes its identity's environment from this
    // file, so each deployment's file must name its own (the deploy pipeline runs this per environment).
    it.skipIf(image)('names the target environment (the deploy check: ENVIRONMENT=<target>)', async () => {
      expect(environmentSet, 'set ENVIRONMENT to the environment this deployment is (local, dev, test, staging, prod)').toBe(true)
      const r = await get('/config/runtime.json')
      const named = (json(r) as { environment?: string }).environment
      expect(named, where(r, `runtime.json "environment" must be the target, ${environment}`)).toBe(environment)
    })

    it.skipIf(!image)('the image ships no environment and no sign-in page: each deployment writes its own', async () => {
      const r = await get('/config/runtime.json')
      const c = json(r) as { environment?: string; auth?: { signInUrl?: string } }
      expect(c.environment, where(r, 'runtime.json "environment" in the image')).toBeUndefined()
      expect(c.auth?.signInUrl, where(r, 'runtime.json "auth.signInUrl" in the image')).toBeUndefined()
    })
  })

  describe('the image', () => {
    it.skipIf(!image).each(['/', '/t/acme/me/availability', '/config/runtime.json', '/assets/missing.js'])(
      'GET %s carries the baseline security headers and no server version',
      async (path) => {
        const r = await get(path)
        expect(r.headers.get('x-content-type-options'), where(r, 'X-Content-Type-Options')).toBe('nosniff')
        expect(r.headers.get('referrer-policy'), where(r, 'Referrer-Policy')).toBe('strict-origin-when-cross-origin')
        expect(r.headers.get('server') ?? '', where(r, 'Server')).not.toMatch(/\d/)
      },
    )

    it.skipIf(!image).each(['/', '/t/acme/me/security'])('the document %s is never framed, uncached and kept out of search engines', async (path) => {
      const r = await get(path)
      expect(r.headers.get('x-frame-options'), where(r, 'X-Frame-Options')).toBe('DENY')
      expect(r.headers.get('x-robots-tag') ?? '', where(r, 'X-Robots-Tag')).toMatch(/noindex/)
      const d = directives(r.headers.get('content-security-policy') ?? '')
      expect(d.get('script-src'), where(r, 'CSP script-src')).toEqual(["'self'"])
      expect(d.get('frame-ancestors'), where(r, 'CSP frame-ancestors')).toEqual(["'none'"])
    })

    it.skipIf(!image)('compresses scripts for clients that accept gzip', async () => {
      const doc = await get('/')
      const src = scripts(doc)[0]!
      const r = await fetch(new URL(src, baseUrl), { headers: { 'accept-encoding': 'gzip' } })
      expect(r.headers.get('content-encoding'), `GET ${src}: Content-Encoding`).toBe('gzip')
      expect(r.headers.get('vary') ?? '', `GET ${src}: Vary`).toMatch(/accept-encoding/i)
    })

    it.skipIf(!image).each(['/.git/config', '/.env', '/t/acme/.hidden'])('GET %s is 404, not index.html', async (path) => {
      const r = await get(path)
      expect(r.status, where(r)).toBe(404)
      expect(r.text, where(r)).not.toMatch(APP_ROOT)
    })

    it.skipIf(!image)('answers /healthz with ok', async () => {
      const r = await get('/healthz')
      expect(r.status, where(r)).toBe(200)
      expect(r.text.trim(), where(r)).toBe('ok')
    })

    it.skipIf(!image)('serves unhashed public files uncached', async () => {
      for (const path of ['/favicon.png', '/index.html']) {
        const r = await get(path)
        expect(r.status, where(r)).toBe(200)
        expectNoCache(r)
      }
    })
  })

  describe('a deployment', () => {
    it.skipIf(image).each(['/', '/t/acme/me/availability', '/config/runtime.json'])('GET %s carries the platform security headers', async (path) => {
      const r = await get(path)
      const h = (n: string) => r.headers.get(n)
      const csp = h('content-security-policy')
      expect(csp, where(r, 'Content-Security-Policy (enforced)')).toBeTruthy()
      const d = directives(csp!)
      const script = d.get('script-src') ?? d.get('default-src')
      expect(script, where(r, 'CSP script-src')).not.toContain("'unsafe-inline'")
      expect(script, where(r, 'CSP script-src')).not.toContain("'unsafe-eval'")
      expect(d.get('frame-ancestors'), where(r, 'CSP frame-ancestors')).toEqual(["'none'"])
      expect(Number(/max-age=(\d+)/i.exec(h('strict-transport-security') ?? '')?.[1] ?? 0), where(r, 'HSTS')).toBeGreaterThanOrEqual(31_536_000)
      expect(h('x-content-type-options'), where(r, 'X-Content-Type-Options')).toBe('nosniff')
    })
  })
})

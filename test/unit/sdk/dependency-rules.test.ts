// The remote uses the platform SDK (platform-reactcommon) and does not reimplement it. ESLint
// (@bcbp-solutions-fzc-llc/eslint-plugin) already rejects raw storage, SDK deep/root imports, eval
// and identity headers; these rules cover what the SDK owns beyond that, as the SDK's own
// test/unit/sdk/dependency-rules.test.ts does for its modules.
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from '@rstest/core'

const ROOT = resolve(__dirname, '../../..')
const SRC = join(ROOT, 'src')

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? files(join(dir, d.name)) : /\.tsx?$/.test(d.name) ? [join(dir, d.name)] : [],
  )
}

/** Source without comments, so a rule is not tripped by a comment that explains it. */
function code(file: string) {
  return readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

const sources = files(SRC).map((f) => ({ file: relative(ROOT, f), text: code(f) }))

/** Files whose code matches `pattern`, minus the ones `allowed` lists with the reason. */
function offenders(pattern: RegExp, allowed: Record<string, string> = {}) {
  return sources.filter(({ file, text }) => pattern.test(text) && !(file in allowed)).map(({ file }) => file)
}

describe('the SDK is used, not reimplemented', () => {
  it('formats dates and numbers with frontend-sdk/i18n (formatDate, formatNumber), not Intl', () => {
    // A type-only Intl reference (formatDate's options) is fine; constructing a formatter is not.
    expect(offenders(/new Intl\.|\.toLocale(Date|Time)?String\(|\.toLocaleUpperCase\(|\.toLocaleLowerCase\(/)).toEqual([])
  })

  it('formats calendar days with formatDate(\'YYYY-MM-DD\'), never by building a Date from one', () => {
    // new Date('YYYY-MM-DD') is midnight UTC (a day early west of UTC); the SDK formats the day itself.
    expect(offenders(/new Date\(\s*['"`]?\d{4}-\d{2}-\d{2}|calendarDate\(/)).toEqual([])
  })

  it('takes UI text from the catalog through useT, not a home-made translator', () => {
    expect(offenders(/navigator\.languages?\b|document\.documentElement\.lang\b/)).toEqual([])
    expect(offenders(/from ['"](i18next|react-i18next|react-intl|@formatjs\/[^'"]+)['"]/)).toEqual([])
  })

  it('calls APIs through the SDK ApiClient, not fetch or XHR', () => {
    // The one exception is the presigned signature PUT: another origin, no token, no cookies (ADR 0006).
    expect(offenders(/\bfetch\(|XMLHttpRequest|from ['"](axios|ky|swr)['"]/, { 'src/infrastructure/api/signatureStorage.ts': 'the presigned PUT to object storage' })).toEqual([])
  })

  it('reads the user, roles and tokens from the SDK, never from the token or cookies itself', () => {
    // `.roles` as a property read (`ctx.roles`), not a spread (`...roles`) or the end of a catalogue key ('users.col.roles').
    expect(offenders(/document\.cookie|\batob\(|jwt-decode|jose\b|hasRole\(|Authorization['"]?\s*:/)).toEqual([])
    // A `.roles` property read in code: the text of a string or a catalogue key ('detail.roles.title') is not code.
    const withoutStrings = sources.map(({ file, text }) => ({ file, text: text.replace(/'[^'\n]*'|"[^"\n]*"|`[^`]*`/g, "''") }))
    expect(withoutStrings.filter(({ text }) => /(?<=[\w\])])\.roles\b/.test(text)).map(({ file }) => file)).toEqual([])
  })

  it('checks access with useHasPermission / useReadOnly / useStepUp, not role names', () => {
    // The wire codes are data for request bodies and badges, in one file (src/domain/vocabulary.ts).
    expect(
      offenders(/['"](tenant_admin|tenant_owner|tender_admin|preparator|reviewer|approver)['"]/, { 'src/domain/vocabulary.ts': 'IAM wire vocabulary, data only' }),
    ).toEqual([])
  })

  it('keeps TanStack Query (ADR 0001) in app/ and presentation/features/ only', () => {
    const where = (file: string) => file.startsWith('src/app/') || file.startsWith('src/presentation/features/')
    const users = sources.filter(({ text }) => /from ['"]@tanstack\/react-query['"]/.test(text)).map(({ file }) => file)
    expect(users.filter((file) => !where(file))).toEqual([])
  })

  it('keeps per-app state in frontend-sdk/storage, not browser storage or IndexedDB', () => {
    expect(offenders(/\b(localStorage|sessionStorage|indexedDB)\b/)).toEqual([])
  })

  it('leaves workspace routing to the SDK (slugFromPath, workspacePathPrefix, useRouteTemplate)', () => {
    // App.tsx reads the path once, to give its own router the basename the SDK computes.
    expect(offenders(/window\.location\.pathname/, { 'src/app/App.tsx': 'basename from slugFromPath' })).toEqual([])
    expect(offenders(/['"`]\/t\/\$\{|split\(['"]\/['"]\)/)).toEqual([])
  })

  it('moves between remotes with the SDK navigate(), never by assigning the location (LLD §4.4)', () => {
    expect(offenders(/location\.(assign|replace|href\s*=)/)).toEqual([])
  })

  it('records metrics with frontend-sdk/metrics in src/infrastructure/telemetry/metrics.ts only, never OpenTelemetry or a Prometheus client directly', () => {
    expect(offenders(/from ['"](@opentelemetry\/[^'"]+|prom-client|web-vitals)['"]/)).toEqual([])
    expect(offenders(/\b(getServiceMeter|getDomainMeter)\b/, { 'src/infrastructure/telemetry/metrics.ts': 'the one place metrics are defined' })).toEqual([])
    // The shell starts exporting and records Core Web Vitals for the whole page.
    expect(offenders(/\b(initializeMetrics|startWebVitals|initializeTracing|initializeLogging|installGlobalErrorHandlers)\b/)).toEqual([])
  })

  it('does host-page start-up only on the standalone page, with the SDK, and leaves remotes and auth to the shell', () => {
    expect(
      offenders(/\b(initializeCore|loadRuntimeConfig|setRuntimeConfig)\b/, { 'src/infrastructure/configuration/standalone.ts': 'standalone host page' }),
    ).toEqual([])
    expect(offenders(/\b(loadManifest|loadRemote|registerNavigator|initializeAuth|createOidcProvider|setTokenSource|setAuthorizer|setFlagProvider|startVersionPolling)\b/)).toEqual([])
  })

  it('logs with getLogger only, never console (the SDK writes warn and error to the console while logging is off)', () => {
    expect(offenders(/\bconsole\.(log|info|warn|error|debug)\(/)).toEqual([])
  })

  it('imports the SDK only from its public subpaths', () => {
    const imports = sources.flatMap(({ text }) => [...text.matchAll(/from ['"](@bcbp-solutions-fzc-llc\/frontend-sdk[^'"]*)['"]/g)].map((m) => m[1]!))
    expect(imports.length).toBeGreaterThan(0)
    const pkg = JSON.parse(readFileSync(join(ROOT, 'node_modules/@bcbp-solutions-fzc-llc/frontend-sdk/package.json'), 'utf8')) as { exports: Record<string, unknown> }
    const publicPaths = Object.keys(pkg.exports).map((p) => p.replace(/^\./, '@bcbp-solutions-fzc-llc/frontend-sdk'))
    expect([...new Set(imports)].filter((i) => !publicPaths.includes(i) || i.endsWith('/testing'))).toEqual([])
  })
})

describe('assets', () => {
  it('imports images and fonts; no root-relative paths, which resolve on the shell origin inside web-shell', () => {
    expect(offenders(/['"`]\/[^'"`\s]*\.(png|jpe?g|gif|svg|webp|avif|ico|woff2?)['"`]/)).toEqual([])
  })
})

describe('dependencies', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>
    devDependencies: Record<string, string>
    peerDependencies: Record<string, string>
  }
  const SDK = '@bcbp-solutions-fzc-llc/frontend-sdk'

  it('takes the SDK from the shell: a peer dependency, never a runtime dependency', () => {
    expect(pkg.dependencies?.[SDK]).toBeUndefined()
    expect(pkg.peerDependencies[SDK]).toBe(`^${pkg.devDependencies[SDK]}`)
  })
})

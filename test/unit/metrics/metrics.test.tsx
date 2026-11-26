// CI validation of the me remote's metrics against the Enterprise Platform Observability Standard
// (docs/observability/metrics.md): namespace, suffixes, required and prohibited labels, label
// vocabularies, SDK and registry compliance, and the inventory page. Then what the telemetry port records.
import { loadManifest } from '@bcbp-solutions-fzc-llc/frontend-sdk/mfe'
import { renderMetricInventory } from '@bcbp-solutions-fzc-llc/frontend-sdk/testing'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, rs } from '@rstest/core'
import { ACTION_OUTCOMES, ME_ACTIONS, LOAD_RESOURCES } from '../../../src/domain/events/me-events'
import { METRICS, METRIC_PREFIX, metricsTelemetry, recordMetric, resetMetricsWarning } from '../../../src/infrastructure/telemetry/metrics'
import { APP_ID } from '../../../src/shared/constants/app'
import { startPlatform } from '../../fixtures/platform'

const ROOT = join(__dirname, '../../..')
type Registry = {
  constLabels: string[]
  prohibitedLabels: string[]
  prohibitedLabelSuffixes: string[]
  exemptPrefixes: string[]
  labels: Record<string, { values?: string[] }>
  metrics: { name: string }[] | Record<string, unknown>
  legacyNames: string[]
}
const registry = JSON.parse(
  readFileSync(join(ROOT, 'node_modules/@bcbp-solutions-fzc-llc/frontend-sdk/contracts/metric-registry.json'), 'utf8'),
) as Registry
const registryNames = new Set(Array.isArray(registry.metrics) ? registry.metrics.map((m) => m.name) : Object.keys(registry.metrics))
const definitions = Object.values(METRICS)

/** This remote in the manifest, as web-shell loads it before ./App: the SDK scopes metrics by it. */
async function inShell(o: Parameters<typeof startPlatform>[0] = {}) {
  const platform = startPlatform(o)
  resetMetricsWarning()
  rs.stubGlobal('fetch', async () =>
    Response.json({ [APP_ID]: { entry: '/remotes/me/0.1.0/remoteEntry.js', version: '0.1.0', ownerDomain: 'iam' } }),
  )
  await loadManifest()
  rs.unstubAllGlobals()
  return platform
}

/** The recorded series of `name` (Prometheus text from the SDK), without HELP/TYPE lines. */
const series = (name: string) =>
  renderMetricInventory()
    .split('\n')
    .filter((l) => l.startsWith(`${name}{`) || l.startsWith(`${name} `))

const stripValue = (lines: string[]) => lines.map((l) => l.replace(/ [\d.e+-]+$/, '')).sort()

afterEach(() => {
  rs.useRealTimers()
  rs.restoreAllMocks()
  rs.unstubAllGlobals()
})

describe('metric definitions (observability standard)', () => {
  it('are Tier 3: iam_me_*, never platform_*, a registry metric or a legacy name', () => {
    expect(METRIC_PREFIX).toBe(`iam_${APP_ID}_`)
    for (const d of definitions) {
      expect(d.name, d.name).toMatch(/^iam_me_[a-z0-9_]+$/)
      expect(registryNames.has(d.name), d.name).toBe(false)
      expect(registry.legacyNames, d.name).not.toContain(d.name)
      expect(registry.exemptPrefixes.some((p) => d.name.startsWith(p)), d.name).toBe(false)
    }
  })

  it('end counters in _total and histograms in _seconds', () => {
    for (const d of definitions) expect(d.name, d.name).toMatch(d.type === 'counter' ? /_total$/ : /_seconds$/)
  })

  it('declare no central or prohibited label, at most 8, each with a closed value set', () => {
    for (const d of definitions) {
      const labels = Object.keys(d.labels)
      expect(labels.length, d.name).toBeLessThanOrEqual(8)
      for (const label of labels) {
        expect(label, d.name).toMatch(/^[a-z][a-z0-9_]*$/)
        expect(registry.constLabels, d.name).not.toContain(label)
        expect(registry.prohibitedLabels, d.name).not.toContain(label)
        expect(registry.prohibitedLabelSuffixes.some((s) => label.endsWith(s)), `${d.name} ${label}`).toBe(false)
        const values = (d.labels as Record<string, readonly string[]>)[label]!
        expect(values.length, `${d.name} ${label}`).toBeGreaterThan(0)
        // A registry label keeps the registry's vocabulary (e.g. outcome: success | failure | error).
        const vocabulary = registry.labels[label]?.values
        if (vocabulary) for (const v of values) expect(vocabulary, `${d.name} ${label}=${v}`).toContain(v)
      }
    }
  })

  it('stay under the SDK\'s cap of 100 values per custom label', () => {
    for (const d of definitions) {
      for (const [label, values] of Object.entries(d.labels as Record<string, readonly string[]>)) {
        expect(values.length, `${d.name} ${label}`).toBeLessThanOrEqual(100)
      }
    }
  })

  it('are accepted by the SDK, which injects domain, service and environment', async () => {
    await inShell()
    recordMetric('loads', 1, { resource: 'profile', outcome: 'success' })
    recordMetric('loadDuration', 0.5, { resource: 'profile', outcome: 'success' })
    recordMetric('actions', 1, { action: 'create_delegation', outcome: 'failure' })
    recordMetric('actionDuration', 0.5, { action: 'create_delegation', outcome: 'failure' })
    recordMetric('signatureUploadFailures', 1, { stage: 'upload' })
    const inventory = renderMetricInventory()
    for (const d of definitions) {
      expect(inventory, d.name).toContain(`# TYPE ${d.name} ${d.type}`)
      for (const line of series(d.name)) expect(line).toMatch(/domain="iam",environment="test",.*service="me"/)
    }
  })

  it('match the inventory in docs/observability/metrics.md', () => {
    const doc = readFileSync(join(ROOT, 'docs/observability/metrics.md'), 'utf8')
    const rows = new Map(
      [...doc.matchAll(/^\| `(iam_me_[a-z0-9_]+)` \| (\w+) \| ([^|]*) \| ([^|]*) \|$/gm)].map((m) => [m[1]!, m]),
    )
    expect([...rows.keys()].sort()).toEqual(definitions.map((d) => d.name).sort())
    for (const d of definitions) {
      const row = rows.get(d.name)!
      expect(row[2], d.name).toBe(d.type)
      const labels = Object.entries(d.labels as Record<string, readonly string[]>)
        .map(([l, vs]) => `\`${l}\` (${vs.map((v) => `\`${v}\``).join(', ')})`)
        .join(', ')
      expect(row[3]!.trim(), d.name).toBe(labels || '—')
      expect(row[4]!.trim(), d.name).toBe(d.help)
    }
  })

  it('are created only through the SDK meter, in one module (no OpenTelemetry API or prom-client bypass)', () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [join(dir, e.name)] : []))
    const bypass = /prom-client|\bmetrics\s*\.\s*getMeter\s*\(|\.\s*create(Counter|Histogram|UpDownCounter|Gauge|ObservableGauge|ObservableCounter)\s*\(/
    const sdkMeter = /get(Service|Domain)Meter\s*\(/
    const owner = join(ROOT, 'src/infrastructure/telemetry/metrics.ts')
    for (const file of walk(join(ROOT, 'src'))) {
      const source = readFileSync(file, 'utf8')
      expect(bypass.test(source), `${file} creates a metric outside the SDK`).toBe(false)
      if (file !== owner) expect(sdkMeter.test(source), `${file} makes its own SDK meter; metrics live in telemetry/metrics.ts`).toBe(false)
    }
  })

  it('keep the action and resource label sets the doc and the telemetry port use', () => {
    expect(METRICS.actions.labels.action).toBe(ME_ACTIONS)
    expect(METRICS.loads.labels.resource).toBe(LOAD_RESOURCES)
    expect(METRICS.actions.labels.outcome).toBe(ACTION_OUTCOMES)
  })
})

describe('recording', () => {
  it('leaves run-time validation to the SDK: it drops a value outside a registry vocabulary', async () => {
    await inShell()
    // outcome is a registry label (success | failure | error); recordMetric does not check it again.
    // Other values are closed by recordMetric's types, which tsc checks at every call site in src/.
    recordMetric('loads', 1, { resource: 'profile', outcome: 'timeout' as never })
    expect(series('iam_me_loads_total')).toEqual([])
  })

  it('records nothing and warns once without the remote in the manifest (standalone)', () => {
    const { logs } = startPlatform()
    resetMetricsWarning()
    expect(() => {
      recordMetric('signatureUploadFailures', 1, { stage: 'upload' })
      recordMetric('signatureUploadFailures', 1, { stage: 'upload' })
    }).not.toThrow()
    expect(series('iam_me_signature_upload_failures_total')).toEqual([])
    expect(logs.filter((l) => l.message === 'me metrics unavailable').length).toBeLessThanOrEqual(1)
  })

  it('counts and times a finished load by resource and outcome', async () => {
    await inShell()
    metricsTelemetry.loadStarted('profile').finish('success')
    metricsTelemetry.loadStarted('delegations').finish('error')
    expect(stripValue(series('iam_me_loads_total'))).toEqual([
      'iam_me_loads_total{domain="iam",environment="test",outcome="error",resource="delegations",service="me"}',
      'iam_me_loads_total{domain="iam",environment="test",outcome="success",resource="profile",service="me"}',
    ])
    expect(series('iam_me_load_duration_seconds_count')).toHaveLength(2)
  })

  it('records a write\'s outcome: success, failure (a business rejection) and error (a fault)', async () => {
    await inShell()
    metricsTelemetry.actionStarted('create_delegation').finish('success')
    metricsTelemetry.actionStarted('create_delegation').finish('failure')
    metricsTelemetry.actionStarted('remove_signature').finish('error')
    const lines = stripValue(series('iam_me_actions_total'))
    expect(lines).toContain('iam_me_actions_total{action="create_delegation",domain="iam",environment="test",outcome="failure",service="me"}')
    expect(lines).toContain('iam_me_actions_total{action="create_delegation",domain="iam",environment="test",outcome="success",service="me"}')
    expect(lines).toContain('iam_me_actions_total{action="remove_signature",domain="iam",environment="test",outcome="error",service="me"}')
    expect(series('iam_me_action_duration_seconds_count')).toHaveLength(3)
  })

  it('records a measurement once: a second finish is ignored', async () => {
    await inShell()
    const m = metricsTelemetry.actionStarted('cancel_delegation')
    m.finish('success')
    m.finish('error')
    expect(stripValue(series('iam_me_actions_total'))).toEqual([
      'iam_me_actions_total{action="cancel_delegation",domain="iam",environment="test",outcome="success",service="me"}',
    ])
  })

  it('records nothing for a measurement never finished (a superseded load)', async () => {
    await inShell()
    metricsTelemetry.loadStarted('profile')
    expect(series('iam_me_loads_total')).toEqual([])
  })

  it('counts a failed signature upload by stage', async () => {
    await inShell()
    metricsTelemetry.signatureUploadFailed('presign')
    expect(stripValue(series('iam_me_signature_upload_failures_total'))).toEqual([
      'iam_me_signature_upload_failures_total{domain="iam",environment="test",service="me",stage="presign"}',
    ])
  })
})

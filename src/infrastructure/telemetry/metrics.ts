// This remote's metrics, per the Enterprise Platform Observability Standard, through the SDK's
// /metrics (never a meter of our own). All are Tier 3, service-specific: no platform_* or iam_*
// (domain) registry metric describes these loads, writes or uploads, and services must not invent
// shared ones. The SDK names the scope: inside web-shell the domain is this remote's manifest
// ownerDomain ('iam') and the service is its name ('me'), so the prefix is iam_me_. It injects
// domain, service and environment on every point, checks suffixes, prohibited labels and the label
// cap, and the shell exports (consent-gated, OTLP).
//
// Every label has a closed value set (domain/events/me-events.ts), enforced by the type of
// recordMetric's labels at compile time. test/unit/metrics checks these definitions against the SDK's
// rules and docs/observability/metrics.md, so the inventory cannot drift from the code.
import { getServiceMeter, type Counter, type Histogram } from '@bcbp-solutions-fzc-llc/frontend-sdk/metrics'
import { getLogger } from '@bcbp-solutions-fzc-llc/frontend-sdk/logging'
import type { Measurement, MeTelemetry } from '../../application/ports/telemetry'
import { ACTION_OUTCOMES, LOAD_OUTCOMES, LOAD_RESOURCES, ME_ACTIONS, UPLOAD_STAGES } from '../../domain/events/me-events'
import { APP_ID } from '../../shared/constants/app'

export const METRIC_PREFIX = 'iam_me_'

type Definition = {
  readonly name: string
  readonly type: 'counter' | 'histogram'
  readonly help: string
  /** Label name → its closed set of values (bounded cardinality). */
  readonly labels: Readonly<Record<string, readonly string[]>>
}

export const METRICS = {
  loads: {
    name: 'iam_me_loads_total',
    type: 'counter',
    help: 'Data loads that finished, by resource and outcome (`error` is an API, network or timeout fault). Loads superseded by a newer one are not counted',
    labels: { resource: LOAD_RESOURCES, outcome: LOAD_OUTCOMES },
  },
  loadDuration: {
    name: 'iam_me_load_duration_seconds',
    type: 'histogram',
    help: 'Time from starting a load to its result. Superseded loads are not recorded',
    labels: { resource: LOAD_RESOURCES, outcome: LOAD_OUTCOMES },
  },
  actions: {
    name: 'iam_me_actions_total',
    type: 'counter',
    help: 'Writes that finished. `failure` is a business rejection (a rule refused it in the UI, or IAM answered a `4xx` such as `SELF_DELEGATION`, a `409` conflict); `error` is a fault (`5xx`, network, timeout, `503` service unavailable)',
    labels: { action: ME_ACTIONS, outcome: ACTION_OUTCOMES },
  },
  actionDuration: {
    name: 'iam_me_action_duration_seconds',
    type: 'histogram',
    help: 'Time from sending a write to its result',
    labels: { action: ME_ACTIONS, outcome: ACTION_OUTCOMES },
  },
  signatureUploadFailures: {
    name: 'iam_me_signature_upload_failures_total',
    type: 'counter',
    help: 'Signature uploads that failed, by the stage they failed at: preparing the image, asking for the upload URL, the upload itself, or confirming it',
    labels: { stage: UPLOAD_STAGES },
  },
} as const satisfies Record<string, Definition>

type Metrics = typeof METRICS
type Labels<K extends keyof Metrics> = { [L in keyof Metrics[K]['labels']]: Metrics[K]['labels'][L] extends readonly (infer V)[] ? V : never }

let warned = false

/**
 * The instrument for `def`, or undefined. Made on each use, not at import: the SDK defines an
 * instrument as soon as the page has an identity and needs this remote in the manifest for its
 * domain, which inside web-shell is true before ./App loads. The SDK keeps one instrument per name,
 * so a repeat call returns the same one. Standalone, with no manifest, it fails: that is logged once
 * and nothing is recorded (the standalone page exports no metrics anyway).
 */
function instrument(def: Definition): Counter | Histogram | undefined {
  try {
    const meter = getServiceMeter({ mfe: APP_ID })
    const labels = Object.keys(def.labels)
    return def.type === 'counter' ? meter.counter(def.name, def.help, labels) : meter.histogram(def.name, def.help, labels)
  } catch (error) {
    if (!warned) getLogger({ mfe: APP_ID }).warn('me metrics unavailable', { error, metric: def.name })
    warned = true
    return undefined
  }
}

/** Records one point of metric `key`; `labels` is typed to the metric's closed value sets. */
export function recordMetric<K extends keyof Metrics>(key: K, value: number, labels: Labels<K>): void {
  const def: Definition = METRICS[key]
  const inst = instrument(def)
  if (!inst) return
  if (def.type === 'counter') (inst as Counter).add(value, labels as Record<string, string>)
  else (inst as Histogram).record(value, labels as Record<string, string>)
}

/** Resets the "unavailable" warning (tests start a fresh SDK runtime each time). */
export function resetMetricsWarning(): void {
  warned = false
}

/** A monotonic clock in milliseconds (performance.now); tests supply their own. */
export type MonotonicClock = () => number

/** A measurement that finishes once: a second `finish` is ignored. */
function measurement<O extends string>(clock: MonotonicClock, record: (outcome: O, seconds: number) => void): Measurement<O> {
  const started = clock()
  let done = false
  return {
    finish(outcome) {
      if (done) return
      done = true
      record(outcome, Math.max(0, (clock() - started) / 1000))
    },
  }
}

/** The MeTelemetry port, implemented with this module's Tier 3 metrics. */
export function createMetricsTelemetry(clock: MonotonicClock = () => performance.now()): MeTelemetry {
  return {
    loadStarted: (resource) =>
      measurement(clock, (outcome, secs) => {
        recordMetric('loads', 1, { resource, outcome })
        recordMetric('loadDuration', secs, { resource, outcome })
      }),
    actionStarted: (action) =>
      measurement(clock, (outcome, secs) => {
        recordMetric('actions', 1, { action, outcome })
        recordMetric('actionDuration', secs, { action, outcome })
      }),
    signatureUploadFailed(stage) {
      recordMetric('signatureUploadFailures', 1, { stage })
    },
  }
}

export const metricsTelemetry: MeTelemetry = createMetricsTelemetry()

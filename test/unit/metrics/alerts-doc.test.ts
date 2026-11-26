// The proposed alert, recording and SLO definitions (docs/observability/alerts-and-slos.md) may only name
// metrics and labels this remote defines, so they cannot drift from the code.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from '@rstest/core'
import { METRICS } from '../../../src/infrastructure/telemetry/metrics'

const doc = readFileSync(join(__dirname, '../../../docs/observability/alerts-and-slos.md'), 'utf8')
const defined = Object.values(METRICS).map((m) => m.name)
const labelValues = (name: string) => Object.entries(Object.values(METRICS).find((m) => m.name === name)!.labels) as [string, readonly string[]][]

describe('alerts-and-slos.md', () => {
  const mentioned = [...new Set([...doc.matchAll(/\biam_me_[a-z0-9_]+/g)].map((m) => m[0].replace(/_(bucket|sum|count)$/, '')))].filter((n) => !n.startsWith('iam_me_:'))

  it('names only metrics that exist (histogram series by their base name)', () => {
    expect(mentioned.length).toBeGreaterThan(0)
    expect(mentioned.filter((n) => !defined.includes(n))).toEqual([])
  })

  it('uses only label names and values the metric allows', () => {
    for (const m of doc.matchAll(/(iam_me_[a-z_]+?)(?:_bucket)?\{([^}]*)\}/g)) {
      const allowed = labelValues(m[1]!.replace(/_(bucket|sum|count)$/, ''))
      for (const pair of m[2]!.matchAll(/(\w+)(=~|=)"([^"]+)"/g)) {
        const [, label, op, value] = pair
        const values = allowed.find(([l]) => l === label)?.[1]
        expect(values, `${m[1]} has no label ${label}`).toBeDefined()
        for (const v of op === '=~' ? value!.split('|') : [value!]) expect(values, `${m[1]}{${label}=${v}}`).toContain(v)
      }
    }
  })

  it('never groups by a prohibited high-cardinality label', () => {
    for (const bad of ['user_id', 'tenant_id', 'email', 'path', 'url', 'session_id']) expect(doc).not.toMatch(new RegExp(`by \\([^)]*\\b${bad}\\b`))
  })
})

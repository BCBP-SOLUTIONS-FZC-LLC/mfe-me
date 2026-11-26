// The Frontend Architecture Constitution's "Required Project Structure" against src/: every required folder
// exists with real files in it, or is one ADR 0007 records as absent (and then must stay absent until the
// ADR is updated). An empty folder would satisfy the list and prove nothing, so it fails too.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from '@rstest/core'

const ROOT = resolve(__dirname, '../../..')
const SRC = join(ROOT, 'src')

const REQUIRED = [
  'app/bootstrap',
  'app/providers',
  'app/routes',
  'presentation/pages',
  'presentation/features',
  'presentation/components',
  'application/use-cases',
  'application/queries',
  'domain/entities',
  'domain/value-objects',
  'domain/repositories',
  'domain/events',
  'domain/rules',
  'infrastructure/api',
  'infrastructure/configuration',
  'infrastructure/telemetry',
  'infrastructure/federation',
  'shared/hooks',
  'shared/constants',
]

/** Required by the Constitution, absent here on purpose (ADR 0007). */
const RECORDED_ABSENT = ['presentation/widgets', 'application/commands', 'application/services', 'infrastructure/auth', 'infrastructure/storage', 'shared/ui', 'shared/types', 'shared/utilities']

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? files(p) : [p]
  })

describe('src/ against the Constitution\'s structure', () => {
  it.each(REQUIRED)('%s exists and holds code', (folder) => {
    expect(existsSync(join(SRC, folder)), folder).toBe(true)
    expect(files(join(SRC, folder)).length, `${folder} is empty`).toBeGreaterThan(0)
  })

  it.each(RECORDED_ABSENT)('%s is absent, as ADR 0007 records', (folder) => {
    expect(existsSync(join(SRC, folder)), `${folder} now exists: update ADR 0007 and this list`).toBe(false)
  })

  it('records every absent folder in ADR 0007', () => {
    const adr = readFileSync(join(ROOT, 'docs/adr/0007-constitution-folder-mapping.md'), 'utf8')
    for (const folder of RECORDED_ABSENT) expect(adr.includes(`\`${folder}\``) || adr.includes(`\`${folder.split('/').pop()}\``), folder).toBe(true)
  })

  it('keeps tests out of src/ (they are in test/)', () => {
    expect(existsSync(join(SRC, 'tests'))).toBe(false)
    expect(existsSync(join(ROOT, 'test/unit'))).toBe(true)
  })
})

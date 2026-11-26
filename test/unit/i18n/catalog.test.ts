// The English catalog (src/infrastructure/configuration/locales/en.json) against the source: every
// key the UI asks for exists, every key in the catalog is used, and every message formats through
// the SDK's ICU-lite t().
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { t } from '@bcbp-solutions-fzc-llc/frontend-sdk/i18n'
import { describe, expect, it } from '@rstest/core'
import { APP_ID } from '../../../src/shared/constants/app'

const SRC = resolve(__dirname, '../../../src')
const LOCALES = join(SRC, 'infrastructure/configuration/locales')

/** Every English file: the chrome's en.json and each screen's en/<screen>.json (keys prefixed by the screen). */
function catalogs(): Record<string, string> {
  const dir = join(LOCALES, 'en')
  const screens = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => join(dir, f)) : []
  const files = [join(LOCALES, 'en.json'), ...screens]
  return Object.assign({}, ...files.map((f) => JSON.parse(readFileSync(f, 'utf8')) as Record<string, string>))
}
const catalog = catalogs()

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? sources(join(dir, d.name)) : /\.tsx?$/.test(d.name) ? [readFileSync(join(dir, d.name), 'utf8')] : [],
  )
}

const code = sources(SRC).join('\n')

/** Keys passed to t() as string literals. */
const literalKeys = new Set([...code.matchAll(/\bt\(\s*'([^']+)'/g)].map((m) => m[1]!))

describe('English catalog', () => {
  it('has every key the UI asks for', () => {
    expect([...literalKeys].filter((key) => !(key in catalog))).toEqual([])
  })

  it('has no key the source never names (as a literal, including keys held in lists)', () => {
    expect(Object.keys(catalog).filter((key) => !code.includes(`'${key}'`))).toEqual([])
  })

  it('formats every message through the SDK', () => {
    for (const key of Object.keys(catalog)) {
      const text = t(APP_ID, key, { count: 1, max: 1, label: 'l', number: 1 })
      expect(text, key).not.toBe(key)
      expect(text.trim(), key).not.toBe('')
    }
  })
})


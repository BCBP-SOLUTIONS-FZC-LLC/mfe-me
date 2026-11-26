#!/usr/bin/env node
// Fails the build when the shipped bundle outgrows its budget (gzip -9, as served compressed), as
// web-shell's does. Run after `npm run build`; `npm run budget` locally. Raise a limit on purpose, in the
// same pull request as the growth, with the reason in the CHANGELOG (LLD §12).
//
// Two builds share dist/: the REMOTE web-shell loads (remoteEntry.js and its chunks, at the root of
// dist/) and the STANDALONE page (index.html and /assets/). The shell downloads only the remote's files,
// so the remote is budgeted on its own.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { gzipSync } from 'node:zlib'

const DIST = 'dist'
const KB = 1024
/** Limits, about 20% over the sizes on 2026-11-26 (remoteEntry 5.7 KB, remote JS 77.7 KB, standalone entry 171.6 KB, largest 67.0 KB, CSS 63.4 KB, images 36.4 KB). */
export const BUDGET = {
  /** remoteEntry.js: the container the shell fetches first, with its integrity. */
  remoteEntry: 10 * KB,
  /** Every JS file of the remote (the root of dist/, gzip). */
  remoteJs: 95 * KB,
  /** The scripts index.html loads before anything else (the standalone page). */
  standaloneEntry: 210 * KB,
  /** Any single JS or CSS file (gzip). */
  largest: 85 * KB,
  /** Every CSS file (gzip): Tailwind and all daisyUI themes, shipped by each remote (LLD §15 #11). */
  css: 76 * KB,
  /** Images on disk (already compressed formats). */
  images: 100 * KB,
}

const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]))
const gz = (f) => gzipSync(readFileSync(f), { level: 9 }).length
const kb = (n) => `${(n / KB).toFixed(1)} KB`

const all = walk(DIST)
const rootJs = readdirSync(DIST).filter((n) => n.endsWith('.js')).map((n) => join(DIST, n))
const code = all.filter((f) => /\.(js|css)$/.test(f)).map((f) => ({ f, size: gz(f) }))
const html = readFileSync(join(DIST, 'index.html'), 'utf8')
const entryFiles = [...html.matchAll(/<script\b[^>]*\bsrc="(\/assets\/[^"]+\.js)"/g)].map((m) => join(DIST, m[1]))
const largest = code.reduce((a, b) => (b.size > a.size ? b : a), { f: '-', size: 0 })

const measured = {
  remoteEntry: gz(join(DIST, 'remoteEntry.js')),
  remoteJs: rootJs.reduce((a, f) => a + gz(f), 0),
  standaloneEntry: entryFiles.reduce((a, f) => a + gz(f), 0),
  largest: largest.size,
  css: code.filter((c) => c.f.endsWith('.css')).reduce((a, c) => a + c.size, 0),
  images: all.filter((f) => /\.(jpe?g|png|webp|avif|gif|svg)$/.test(f)).reduce((a, f) => a + statSync(f).size, 0),
}

let failed = false
for (const key of Object.keys(BUDGET)) {
  const over = measured[key] > BUDGET[key]
  failed ||= over
  const note = key === 'largest' ? ` (${relative(DIST, largest.f)})` : ''
  console.log(`${over ? '✗' : '✓'} ${key.padEnd(16)} ${kb(measured[key]).padStart(10)} / ${kb(BUDGET[key])}${note}`)
  if (over) console.log(`::error title=Bundle budget::${key} is ${kb(measured[key])}, over its ${kb(BUDGET[key])} budget${note}`)
}
if (entryFiles.length === 0) {
  console.log('::error title=Bundle budget::index.html loads no /assets/ script; run npm run build first')
  failed = true
}
process.exit(failed ? 1 : 0)

// Pins and checks the vendored IAM Swagger files (test/contract/swagger).
//   node scripts/contracts.mjs pin [SOURCE_DIR]    copy the three files from SOURCE_DIR and rewrite PIN.json
//   node scripts/contracts.mjs check [SOURCE_DIR]  compare SOURCE_DIR with the pin and print what differs
// SOURCE_DIR defaults to IAM_SWAGGER_DIR, else ../docs/IAM_swagger. The IAM services publish no
// version tag for these files, so the pin is the SHA-256 of each one. Read the diff before re-pinning.
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'

const FILES = ['iam-user-profile', 'iam-delegation', 'iam-org-membership'].map((n) => `${n}.yaml`)
const ROOT = resolve(import.meta.dirname, '..')
const VENDOR = join(ROOT, 'test/contract/swagger')
const [mode = 'check', dirArg] = process.argv.slice(2)
const source = resolve(dirArg ?? process.env.IAM_SWAGGER_DIR ?? join(ROOT, '../docs/IAM_swagger'))
const sha = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')

if (!existsSync(source)) {
  console.error(`No Swagger folder at ${source}. Pass it as an argument or set IAM_SWAGGER_DIR.`)
  process.exit(2)
}

if (mode === 'pin') {
  const files = {}
  for (const f of FILES) {
    copyFileSync(join(source, f), join(VENDOR, f))
    files[f] = sha(join(VENDOR, f))
  }
  const pin = JSON.parse(readFileSync(join(VENDOR, 'PIN.json'), 'utf8'))
  writeFileSync(join(VENDOR, 'PIN.json'), `${JSON.stringify({ ...pin, pinnedOn: new Date().toISOString().slice(0, 10), files }, null, 2)}\n`)
  console.log(`Pinned ${FILES.length} files from ${source}`)
} else {
  const pin = JSON.parse(readFileSync(join(VENDOR, 'PIN.json'), 'utf8'))
  let drift = 0
  for (const f of FILES) {
    const now = sha(join(source, f))
    if (now !== pin.files[f]) {
      drift++
      console.log(`DIFFERS  ${f}`)
    }
  }
  console.log(drift === 0 ? 'The Swagger files match the pin.' : `${drift} file(s) differ from the pin: read the diff, update the adapters and fixtures, then re-pin.`)
  process.exit(drift === 0 ? 0 : 1)
}

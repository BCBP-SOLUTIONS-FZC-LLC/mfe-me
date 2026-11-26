// The message catalogue's file rules (test/unit/i18n/catalog.test.ts, run now instead of at test time):
// every locale file is valid JSON, and no key is in two files. Per-screen keys are prefixed by the screen.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const DIR = 'src/infrastructure/configuration/locales'
const files = [join(DIR, 'en.json'), ...readdirSync(join(DIR, 'en')).filter((f) => f.endsWith('.json')).map((f) => join(DIR, 'en', f))]
const seen = new Map()
const problems = []
for (const file of files) {
  let data
  try {
    data = JSON.parse(readFileSync(file, 'utf8'))
  } catch (e) {
    problems.push(`${file} is not valid JSON: ${e.message}`)
    continue
  }
  for (const key of Object.keys(data)) {
    if (seen.has(key)) problems.push(`${key} is in ${seen.get(key)} and ${file}`)
    else seen.set(key, file)
  }
}
if (problems.length) {
  console.error(`Message catalogue:\n- ${problems.join('\n- ')}`)
  process.exit(1)
}
console.log(`catalogue: ${seen.size} keys in ${files.length} files, none twice`)

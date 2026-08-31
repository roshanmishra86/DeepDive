import { readFileSync } from 'node:fs'

const path = process.argv[2] ?? 'latest.json'
const manifest = JSON.parse(readFileSync(path, 'utf8'))
const required = [
  'windows-x86_64-nsis',
  'linux-x86_64-appimage',
  'linux-x86_64-deb',
]
for (const key of required) {
  const entry = manifest.platforms?.[key]
  if (!entry || typeof entry.url !== 'string' || !entry.url || typeof entry.signature !== 'string' || !entry.signature) {
    throw new Error(`Updater manifest is missing a signed ${key} entry.`)
  }
}
console.log(`Validated signed updater entries: ${required.join(', ')}`)

import { readFileSync } from 'node:fs'

const tag = process.env.GITHUB_REF_NAME ?? process.argv[2]
if (!tag?.startsWith('v')) throw new Error('Expected a v-prefixed release tag.')
const expected = tag.slice(1)
const config = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'))
const cargo = readFileSync('src-tauri/Cargo.toml', 'utf8')
const cargoVersion = cargo.match(/^version\s*=\s*"([^"]+)"/m)?.[1]
if (config.version !== expected || cargoVersion !== expected) {
  throw new Error(`Version mismatch: tag=${expected}, tauri=${config.version}, cargo=${cargoVersion}`)
}
if (config.plugins?.updater?.pubkey === 'UPDATER_PUBLIC_KEY_REPLACE_BEFORE_RELEASE') {
  throw new Error('Generate an updater keypair and replace the placeholder public key before release.')
}
console.log(`Release versions match: ${expected}`)

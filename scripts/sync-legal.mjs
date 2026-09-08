import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(root, 'src', 'pages', 'legal', 'content.ts')
const target = join(root, 'mobile', 'src', 'legal', 'content.ts')
const header = '// Generated from src/pages/legal/content.ts by scripts/sync-legal.mjs — do not edit.\n\n'

const normalize = (text) => text.replaceAll('\r\n', '\n')
const expected = header + normalize(readFileSync(source, 'utf8'))
if (process.argv.includes('--check')) {
  const actual = existsSync(target) ? normalize(readFileSync(target, 'utf8')) : null
  if (actual !== expected) {
    console.error('Legal content out of sync. Run: node scripts/sync-legal.mjs')
    process.exit(1)
  }
  console.log('Legal content in sync.')
} else {
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, expected)
  console.log('Wrote mobile/src/legal/content.ts')
}

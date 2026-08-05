import { execSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// The E2E suite seeds notifications via the service role. Resolve the stack
// credentials once here (workers would otherwise race `supabase status`) and
// cache them for the specs.
export const SEED_CREDS_FILE = join(tmpdir(), 'sensorium-e2e-seed-creds.json')

function resolve() {
  const raw = execSync('npx supabase status -o json', { encoding: 'utf8' }).trim()
  try {
    const json = JSON.parse(raw)
    const url = json.API_URL ?? json.apiUrl
    const serviceRole = json.SERVICE_ROLE_KEY ?? json.serviceRoleKey
    if (!url || !serviceRole) throw new Error('Missing URL/service_role in supabase status')
    return { url, serviceRole }
  } catch (err) {
    throw new Error(
      'Could not parse `supabase status -o json`. Is the stack running?\n' +
        (err instanceof Error ? err.message : String(err)),
    )
  }
}

export default function globalSetup() {
  const creds = resolve()
  mkdirSync(tmpdir(), { recursive: true })
  writeFileSync(SEED_CREDS_FILE, JSON.stringify(creds), 'utf8')
  return async () => {
    const { unlinkSync } = await import('node:fs')
    try {
      unlinkSync(SEED_CREDS_FILE)
    } catch {
      // already gone; fine
    }
  }
}
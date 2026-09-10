import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Client } from 'pg'
import { dbUrl } from './helpers'

// Guards a bug class that bit us once: a new table created after the blanket
// grant in 0019 shipped without service_role privileges, so create-call-token's
// service-role REST lookups 500'd. Auto-expose being off means a new table gets
// no grants unless a migration adds them; this fails fast when one is missed.
describe('public table grants', () => {
  let client: Client

  beforeAll(async () => {
    client = new Client({ connectionString: dbUrl() })
    await client.connect()
  })

  afterAll(async () => {
    await client.end()
  })

  it('grants service_role SELECT/INSERT/UPDATE/DELETE on every public table', async () => {
    const { rows } = await client.query<{ table_name: string }>(`
      select t.table_name
      from information_schema.tables t
      where t.table_schema = 'public'
        and t.table_type = 'BASE TABLE'
        and (
          select count(distinct g.privilege_type)
          from information_schema.role_table_grants g
          where g.table_schema = 'public'
            and g.table_name = t.table_name
            and g.grantee = 'service_role'
            and g.privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
        ) < 4
      order by t.table_name
    `)
    expect(rows.map((r) => r.table_name)).toEqual([])
  })

  it('grants anon no privileges on any public table', async () => {
    const { rows } = await client.query<{ table_name: string }>(`
      select distinct table_name
      from information_schema.role_table_grants
      where table_schema = 'public' and grantee = 'anon'
      order by table_name
    `)
    expect(rows.map((r) => r.table_name)).toEqual([])
  })
})

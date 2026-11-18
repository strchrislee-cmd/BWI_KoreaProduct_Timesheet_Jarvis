import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SEED_ALIASES, SEED_PROJECTS } from '../src/domain/seed'

// Demo mode uses src/domain/seed.ts; Supabase uses 0002_seed.sql. Keep them identical.
const sql = readFileSync(new URL('../supabase/migrations/0002_seed.sql', import.meta.url), 'utf8')

describe('seed parity', () => {
  it('group projects match', () => {
    const rows = [...sql.matchAll(/\('([^']+)', '(timelog|local_section)', (null|'[a-z_]+'), (true|false), (\d+)\)/g)].map(
      (m) => ({
        name: m[1],
        kind: m[2],
        system_key: m[3] === 'null' ? null : m[3].slice(1, -1),
        counts_toward_total: m[4] === 'true',
        sort_order: Number(m[5]),
      }),
    )
    expect(rows).toEqual(SEED_PROJECTS)
  })

  it('aliases match', () => {
    const block = sql.slice(sql.indexOf('from (values'))
    const rows = [...block.matchAll(/\('([^']+)', '([a-z_]+)'\)/g)].map((m) => ({ alias: m[1], system_key: m[2] }))
    expect(rows).toEqual(SEED_ALIASES)
  })
})

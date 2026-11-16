import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_RSV_WORDS, SUNAP_TOTAL_KEYS } from '@/types/sunap'

// 수납일지 서버 표 sunap_days·sunap_spends·sunap_settings의 칸·제약·RLS·권한 (sunap-ilji REQ-4903, design.md 'DB').
// claimDayCloses.rls.test.ts와 같은 방법: 진짜 Postgres(PGlite, WASM)에서 운영자가 붙일 migration 파일을 차례로 그대로 돌린다
// (auth → precheck_settings(my_hospital_id 함수) → 이 파일). 실제 Supabase에는 붙지 않는다. Supabase가 미리 갖춘 것만 흉내 낸다
const fileOf = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))
const read = (rel: string) => readFileSync(fileOf(rel), 'utf-8')
const AUTH_MIGRATION = read('./migrations/20261028000000_auth.sql')
const SETTINGS_MIGRATION = read('./migrations/20261030000000_precheck_settings.sql')
const SUNAP_PATH = fileOf('./migrations/20261116000000_sunap.sql')
// 파일이 아직 없으면 빈 글자로 돌아, 시험마다 '표가 없다'로 실패한다(무엇이 빠졌는지 시험별로 보인다)
const SUNAP_MIGRATION = existsSync(SUNAP_PATH) ? readFileSync(SUNAP_PATH, 'utf-8') : ''
// 주석을 뺀 SQL 글자
const SUNAP_SQL = SUNAP_MIGRATION.split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n')

const SUPABASE_MOCK = `
  create role anon nologin;
  create role authenticated nologin;
  grant usage on schema public to anon, authenticated;
  -- Supabase는 public에 새로 만든 표·함수·순서표에 anon·authenticated 모든 권한을 준다(migration이 거둬야 한다)
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
  alter default privileges in schema public grant all on sequences to anon, authenticated;

  create schema auth;
  grant usage on schema auth to anon, authenticated;
  create table auth.users (id uuid primary key, email text);
  create function auth.jwt() returns jsonb language sql stable
    as $$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
`

const A = '00000000-0000-4000-8000-00000000000a' // 승인된 병원 A
const B = '00000000-0000-4000-8000-00000000000b' // 승인된 다른 병원 B
const C = '00000000-0000-4000-8000-00000000000c' // 승인 대기
const D = '00000000-0000-4000-8000-00000000000d' // 거절
const E = '00000000-0000-4000-8000-00000000000e' // 병원 줄이 없는 사용자
const STATUS: Record<string, 'approved' | 'pending' | 'rejected' | null> = {
  [A]: 'approved',
  [B]: 'approved',
  [C]: 'pending',
  [D]: 'rejected',
  [E]: null,
}
const emailOf = (user: string) => `${user.slice(-1)}@fake.test`

type Row = Record<string, unknown>

const DAYS = 'public.sunap_days'
const SPENDS = 'public.sunap_spends'
const SETTINGS = 'public.sunap_settings'
const TABLES = [DAYS, SPENDS, SETTINGS] as const
const nameOf = (table: string) => table.replace('public.', '')

const TOTALS = [...SUNAP_TOTAL_KEYS]
// 사용자가 보낼 수 있는 칸(그 밖은 칸 권한이 없다)
const DAY_SENT = ['work_date', 'closed_at', 'late', ...TOTALS]
const SPEND_INSERT = ['work_date', 'kind', 'memo', 'amount']
const SPEND_UPDATE = ['kind', 'memo', 'amount']
const SETTINGS_SENT = ['block_group', 'pt_group', 'rsv_words']

// 지어낸 날짜·시각·묶음 id
const DAY = '2026-11-16'
const DAY2 = '2026-11-17'
const OLD = '2001-01-01T00:00:00.000Z' // 운영자가 심는 옛 시각(DB·앱이 바꿨는지 보려고)
const NEW_AT = '2026-11-16T09:30:00.000Z'
const GROUP = '00000000-0000-4000-8000-000000000101'
const GROUP2 = '00000000-0000-4000-8000-000000000102'
const OTHER_ID = '00000000-0000-4000-8000-000000000999'

const SLOW = { timeout: 60_000 }
const DENIED = { code: '42501' } // 권한 없음
const CHECK_FAILED = { code: '23514' }
const RLS_REJECTED = /row-level security/

let db: PGlite
let hospital: Record<string, string> = {}

async function migrate(target: PGlite) {
  await target.exec(SUPABASE_MOCK)
  await target.exec(AUTH_MIGRATION)
  await target.exec(SETTINGS_MIGRATION)
  await target.exec(SUNAP_MIGRATION)
}

async function operator() {
  await db.exec('reset role; reset request.jwt.claims')
}

async function become(user: string) {
  await operator()
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: user, email: emailOf(user) })])
  await db.exec('set role authenticated')
}

async function becomeAnon() {
  await operator()
  await db.exec('set role anon')
}

async function rows(sql: string, params: unknown[] = [], target: PGlite = db) {
  return (await target.query<Row>(sql, params)).rows
}

// 시험마다 빈 표에서 시작한다(병원·수납 줄은 auth.users를 따라 함께 비워진다). 운영자(superuser)는 RLS를 건너뛴다
async function resetData() {
  await operator()
  await db.exec('truncate auth.users cascade')
  hospital = {}
  for (const [user, status] of Object.entries(STATUS)) {
    await db.query('insert into auth.users (id, email) values ($1, $2)', [user, emailOf(user)])
    if (status === null) continue
    const [row] = await rows(
      `insert into public.hospitals (owner_id, name, applicant_name, email, status)
       values ($1, '가짜병원', '홍길동', $2, $3) returning id`,
      [user, emailOf(user), status],
    )
    hospital[user] = row.id as string
  }
}

/** 운영자가 그 병원의 마감 줄을 넣는다(RLS·칸 권한을 건너뛴다) */
async function seedDay(owner: string, day = DAY, visits = 7) {
  await operator()
  await db.query(`insert into ${DAYS} (hospital_id, work_date, closed_at, visits) values ($1, $2, $3, $4)`, [
    hospital[owner],
    day,
    OLD,
    visits,
  ])
}

/** 운영자가 그 병원의 지출 줄을 넣고 id를 돌려준다 */
async function seedSpend(owner: string, memo = '가짜 지출', day = DAY) {
  await operator()
  const [row] = await rows(
    `insert into ${SPENDS} (hospital_id, work_date, kind, memo, amount, created_at) values ($1, $2, 'cash', $3, 5000, $4) returning id`,
    [hospital[owner], day, memo, OLD],
  )
  return row.id as string
}

/** 운영자가 그 병원의 설정 줄을 넣는다 */
async function seedSettings(owner: string, blockGroup: string | null = GROUP) {
  await operator()
  await db.query(`insert into ${SETTINGS} (hospital_id, block_group) values ($1, $2)`, [hospital[owner], blockGroup])
}

/** 운영자 눈으로 본 세 표 전체(바뀌지 않았는지 견줄 때) */
async function snapshot() {
  await operator()
  return {
    days: await rows(`select hospital_id, work_date::text as day, closed_at::text as at, late, visits from ${DAYS} order by 1, 2`),
    spends: await rows(`select id, hospital_id, work_date::text as day, kind, memo, amount, created_at::text as at from ${SPENDS} order by 1`),
    settings: await rows(`select hospital_id, block_group, pt_group, rsv_words from ${SETTINGS} order by 1`),
  }
}

// PostgREST upsert와 같은 모양: json 줄을 표 모양으로 풀어 보낸 칸만 넣고, 겹치면 보낸 칸만 SET에 쓴다(hospital_id는 보내지 않는다)
function postgrestUpsert(table: string, conflict: string, body: Row[]) {
  const columns = Object.keys(body[0] ?? {})
  const list = columns.join(', ')
  return db.query(
    `insert into ${table} (${list})
     select ${list} from json_populate_recordset(null::${table}, $1::json)
     on conflict (${conflict}) do update set ${columns.map((c) => `${c} = excluded.${c}`).join(', ')}`,
    [JSON.stringify(body)],
  )
}

// 숫자 24칸 모두 같은 값인 마감 줄 몸통
const dayBody = (value: number, extra: Row = {}): Row => ({
  work_date: DAY,
  closed_at: NEW_AT,
  late: false,
  ...Object.fromEntries(TOTALS.map((key) => [key, value])),
  ...extra,
})

beforeAll(async () => {
  db = await PGlite.create()
  await migrate(db)
}, 120_000)

afterAll(async () => {
  await db.close()
})

beforeEach(resetData)

describe('AC-4903.1 표 모양', SLOW, () => {
  async function columnsOf(table: string) {
    return rows(
      `select column_name, udt_name, is_nullable, column_default from information_schema.columns
       where table_schema = 'public' and table_name = $1 order by ordinal_position`,
      [nameOf(table)],
    )
  }

  it('AC-4903.1: sunap_days 칸은 hospital_id·work_date·closed_at·late와 숫자 24칸(SUNAP_TOTAL_KEYS 차례)이고 모두 비울 수 없다', async () => {
    const found = await columnsOf(DAYS)
    expect(found.map((c) => [c.column_name, c.udt_name, c.is_nullable])).toEqual([
      ['hospital_id', 'uuid', 'NO'],
      ['work_date', 'date', 'NO'],
      ['closed_at', 'timestamptz', 'NO'],
      ['late', 'bool', 'NO'],
      ...TOTALS.map((key) => [key, 'int4', 'NO']),
    ])
    expect(TOTALS).toHaveLength(24)
  })

  it('AC-4903.1: sunap_days 기본값은 hospital_id = my_hospital_id(), closed_at = now(), late = false, 숫자 = 0이고 work_date는 없다', async () => {
    const found = await columnsOf(DAYS)
    expect(found.map((c) => [c.column_name, c.column_default])).toEqual([
      ['hospital_id', expect.stringMatching(/^(public\.)?my_hospital_id\(\)$/)],
      ['work_date', null],
      ['closed_at', 'now()'],
      ['late', 'false'],
      ...TOTALS.map((key) => [key, '0']),
    ])
  })

  it('AC-4903.1: sunap_spends 칸은 id·hospital_id·work_date·kind·memo·amount·created_at이고 모두 비울 수 없다', async () => {
    const found = await columnsOf(SPENDS)
    expect(found.map((c) => [c.column_name, c.udt_name, c.is_nullable, c.column_default])).toEqual([
      ['id', 'uuid', 'NO', 'gen_random_uuid()'],
      ['hospital_id', 'uuid', 'NO', expect.stringMatching(/^(public\.)?my_hospital_id\(\)$/)],
      ['work_date', 'date', 'NO', null],
      ['kind', 'text', 'NO', null],
      ['memo', 'text', 'NO', null],
      ['amount', 'int4', 'NO', null],
      ['created_at', 'timestamptz', 'NO', 'now()'],
    ])
  })

  it('AC-4903.1: sunap_settings 칸은 hospital_id·block_group·pt_group(비울 수 있음)·rsv_words(jsonb)이다', async () => {
    const found = await columnsOf(SETTINGS)
    expect(found.map((c) => [c.column_name, c.udt_name, c.is_nullable])).toEqual([
      ['hospital_id', 'uuid', 'NO'],
      ['block_group', 'uuid', 'YES'],
      ['pt_group', 'uuid', 'YES'],
      ['rsv_words', 'jsonb', 'NO'],
    ])
    expect(found.slice(0, 3).map((c) => c.column_default)).toEqual([expect.stringMatching(/^(public\.)?my_hospital_id\(\)$/), null, null])
  })

  it('AC-4903.1: rsv_words 기본값은 {inj:[주사,블록], visit:[경과,진료], etc:[기타]}(앱 DEFAULT_RSV_WORDS와 같다)', async () => {
    await operator()
    await db.query(`insert into ${SETTINGS} (hospital_id) values ($1)`, [hospital[A]])
    const [row] = await rows(`select block_group, pt_group, rsv_words from ${SETTINGS}`)
    expect(row).toEqual({ block_group: null, pt_group: null, rsv_words: { inj: ['주사', '블록'], visit: ['경과', '진료'], etc: ['기타'] } })
    expect(row.rsv_words).toEqual(DEFAULT_RSV_WORDS)
  })

  it.each<[string, string, string[]]>([
    [DAYS, 'PRIMARY KEY (hospital_id, work_date)', []],
    [SPENDS, 'PRIMARY KEY (id)', []],
    [SETTINGS, 'PRIMARY KEY (hospital_id)', []],
  ])('AC-4903.1: %s 기본 키는 %s이고, 바깥 키는 병원 표 하나(지우면 함께 지움)뿐이다', async (table, primary) => {
    // PG18은 not null도 pg_constraint에 따로 적는다(contype 'n') → 기본 키·바깥 키·유일만 본다(검사는 AC-4903.3)
    const found = await rows(
      `select contype, pg_get_constraintdef(oid) as def from pg_constraint
       where conrelid = to_regclass($1) and contype in ('p', 'f', 'u') order by contype`,
      [table],
    )
    expect(found).toEqual([
      { contype: 'f', def: expect.stringMatching(/^FOREIGN KEY \(hospital_id\) REFERENCES (public\.)?hospitals\(id\) ON DELETE CASCADE$/) },
      { contype: 'p', def: primary },
    ])
  })

  it('AC-4903.1: 같은 병원 같은 날 마감 두 줄은 거부되고, 다른 병원은 같은 날을 가질 수 있다. 설정도 병원마다 한 줄이다', async () => {
    await seedDay(A)
    await expect(seedDay(A)).rejects.toThrow(/duplicate key/)
    await seedDay(B)
    await seedSettings(A)
    await expect(seedSettings(A)).rejects.toThrow(/duplicate key/)
    await seedSettings(B)
    const after = await snapshot()
    expect(after.days).toHaveLength(2)
    expect(after.settings).toHaveLength(2)
  })

  it('AC-4903.1: 묶음 칸에는 아무 묶음 id나 들어간다(바깥 키 없음, 지워진 묶음 = 안 고름)', async () => {
    await seedSettings(A, OTHER_ID)
    expect((await snapshot()).settings).toEqual([expect.objectContaining({ hospital_id: hospital[A], block_group: OTHER_ID })])
  })

  it('AC-4903.1: 병원 줄을 지우면 세 표의 그 병원 줄도 지워지고 다른 병원 줄은 그대로다', async () => {
    await seedDay(A)
    await seedDay(B)
    await seedSpend(A)
    const kept = await seedSpend(B)
    await seedSettings(A)
    await seedSettings(B)
    await operator()
    await db.query('delete from public.hospitals where id = $1', [hospital[A]])
    const after = await snapshot()
    expect(after.days.map((r) => r.hospital_id)).toEqual([hospital[B]])
    expect(after.spends.map((r) => r.id)).toEqual([kept])
    expect(after.settings.map((r) => r.hospital_id)).toEqual([hospital[B]])
  })

  it.each(TABLES)('AC-4903.1: %s는 RLS가 켜져 있다', async (table) => {
    expect(await rows(`select relrowsecurity as on from pg_class where oid = to_regclass($1)`, [table])).toEqual([{ on: true }])
  })

  it.each(TABLES)('AC-4903.1: anon에게 %s의 표·칸 권한이 하나도 없다(기본 권한을 먼저 거뒀다)', async (table) => {
    await rows(`select $1::regclass`, [table]) // 표가 없으면 여기서 실패한다(빈 목록과 헷갈리지 않게)
    for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']) {
      expect([privilege, (await rows(`select has_any_column_privilege('anon', $1, $2) as ok`, [table, privilege]))[0].ok]).toEqual([
        privilege,
        false,
      ])
    }
    for (const privilege of ['DELETE', 'TRUNCATE', 'TRIGGER']) {
      expect([privilege, (await rows(`select has_table_privilege('anon', $1, $2) as ok`, [table, privilege]))[0].ok]).toEqual([
        privilege,
        false,
      ])
    }
  })

  it.each<[string, string[]]>([
    [DAYS, ['DELETE', 'SELECT']],
    [SPENDS, ['DELETE', 'SELECT']],
    [SETTINGS, ['SELECT']],
  ])('AC-4903.1: authenticated의 %s 표 전체 권한은 %j뿐이다(넣기·고치기는 칸 단위)', async (table, expected) => {
    await rows(`select $1::regclass`, [table])
    const granted = await rows(
      `select grantee, privilege_type from information_schema.role_table_grants
       where table_schema = 'public' and table_name = $1 and grantee in ('anon', 'authenticated', 'PUBLIC')
       order by grantee, privilege_type`,
      [nameOf(table)],
    )
    expect(granted).toEqual(expected.map((privilege_type) => ({ grantee: 'authenticated', privilege_type })))
  })

  it.each<[string, string, string[]]>([
    [DAYS, 'INSERT', DAY_SENT],
    [DAYS, 'UPDATE', DAY_SENT],
    [SPENDS, 'INSERT', SPEND_INSERT],
    [SPENDS, 'UPDATE', SPEND_UPDATE],
    [SETTINGS, 'INSERT', SETTINGS_SENT],
    [SETTINGS, 'UPDATE', SETTINGS_SENT],
  ])('AC-4903.1: authenticated의 %s %s 칸 권한은 정해 둔 칸뿐이다(hospital_id·id·created_at 없음)', async (table, privilege, expected) => {
    await rows(`select $1::regclass`, [table])
    const list = await rows(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = $1 and has_column_privilege('authenticated', $2, column_name, $3)
       order by ordinal_position`,
      [nameOf(table), table, privilege],
    )
    expect(list.map((row) => row.column_name)).toEqual(expected)
  })

  it.each<[string, string[]]>([
    [DAYS, ['ALL']],
    [SPENDS, ['ALL']],
    [SETTINGS, ['INSERT', 'SELECT', 'UPDATE']],
  ])('AC-4903.1: %s 정책(%j)은 authenticated 대상이고 모두 my_hospital_id()로 거른다(설정은 지우기 정책 없음)', async (table, cmds) => {
    const list = await rows(
      `select cmd, permissive, roles::text as roles, qual, with_check from pg_policies
       where schemaname = 'public' and tablename = $1 order by cmd`,
      [nameOf(table)],
    )
    expect(list.map((p) => p.cmd)).toEqual(cmds)
    for (const policy of list) {
      expect(policy).toMatchObject({ permissive: 'PERMISSIVE', roles: '{authenticated}' })
      if (policy.cmd !== 'INSERT') expect(policy.qual).toMatch(/hospital_id = \( SELECT (public\.)?my_hospital_id\(\)/)
      if (policy.cmd !== 'SELECT') expect(policy.with_check).toMatch(/hospital_id = \( SELECT (public\.)?my_hospital_id\(\)/)
    }
  })

  it('AC-4903.1: 파일이 있고 줄 끝이 LF이며, 머리 주석에 운영자가 붙여 넣는 방법이 있다', () => {
    expect(SUNAP_MIGRATION).not.toBe('')
    expect(SUNAP_MIGRATION).not.toContain('\r')
    const lines = SUNAP_MIGRATION.split('\n')
    const head = lines.slice(0, lines.findIndex((line) => !/^(--|\s*$)/.test(line)))
    expect(head.join('\n')).toContain('운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다')
  })

  it('AC-4903.1: 두 번 돌려도 되는 문장만 쓴다(표·색인은 if not exists, 정책은 지우고 다시 만들기, 함수·트리거·지우기 없음)', () => {
    const count = (pattern: RegExp) => (SUNAP_SQL.match(pattern) ?? []).length
    for (const table of TABLES) {
      expect(count(new RegExp(`create\\s+table\\s+if\\s+not\\s+exists\\s+${table.replace('.', '\\.')}\\b`, 'gi'))).toBe(1)
    }
    expect(SUNAP_SQL).not.toMatch(/create\s+table\s+(?!if\s+not\s+exists)/i)
    expect(SUNAP_SQL).not.toMatch(/create\s+(unique\s+)?index\s+(?!if\s+not\s+exists)/i)
    expect(SUNAP_SQL).not.toMatch(/create\s+(or\s+replace\s+)?function/i)
    expect(SUNAP_SQL).not.toMatch(/create\s+(constraint\s+)?trigger/i)
    expect(SUNAP_SQL).not.toMatch(/^\s*(drop\s+(?!policy\s+if\s+exists)|truncate|delete)\b/im)
    expect(count(/create\s+policy/gi)).toBeGreaterThan(0)
    expect(count(/drop\s+policy\s+if\s+exists/gi)).toBe(count(/create\s+policy/gi))
    for (const [, target] of SUNAP_SQL.matchAll(/^\s*alter table\s+(\S+)/gim)) expect(TABLES).toContain(target)
  })

  it.each(TABLES)('AC-4903.1: %s 표 권한은 revoke all 뒤에만 준다', (table) => {
    const escaped = table.replace('.', '\\.')
    const revoke = SUNAP_SQL.search(new RegExp(`revoke all on table ${escaped} from anon, authenticated;`))
    expect(revoke).toBeGreaterThanOrEqual(0)
    const grants = [...SUNAP_SQL.matchAll(new RegExp(`^grant [^;]+ on table ${escaped} to [^;]+;`, 'gm'))]
    expect(grants.length).toBeGreaterThan(0)
    for (const grant of grants) expect(grant.index).toBeGreaterThan(revoke)
  })

  // 표마다 칸·제약·색인·표와 칸 권한·RLS·정책·트리거
  async function tableShape(target: PGlite) {
    const shapes: Row = {}
    for (const table of TABLES) {
      const q = (sql: string) => rows(sql, [table, nameOf(table)], target)
      shapes[table] = {
        columns: await q(
          `select column_name, data_type, is_nullable, column_default from information_schema.columns
           where table_schema = 'public' and table_name = $2 and $1 <> '' order by ordinal_position`,
        ),
        constraints: await q(
          `select conname, contype, pg_get_constraintdef(oid) as def from pg_constraint
           where conrelid = to_regclass($1) and $2 <> '' order by conname`,
        ),
        indexes: await q(`select indexname, indexdef from pg_indexes where schemaname = 'public' and tablename = $2 and $1 <> '' order by 1`),
        access: await q(
          `select c.relrowsecurity, c.relforcerowsecurity,
                  (select array_agg(item::text order by item::text) from unnest(c.relacl) item) as table_acl,
                  (select array_agg(a.attname || ':' || item::text order by a.attname, item::text)
                   from pg_attribute a, unnest(a.attacl) item where a.attrelid = c.oid) as column_acl
           from pg_class c where c.oid = to_regclass($1) and $2 <> ''`,
        ),
        policies: await q(
          `select policyname, cmd, roles::text[] as roles, qual, with_check from pg_policies
           where schemaname = 'public' and tablename = $2 and $1 <> '' order by policyname`,
        ),
        triggers: await q(`select tgname from pg_trigger where not tgisinternal and tgrelid = to_regclass($1) and $2 <> ''`),
      }
    }
    return shapes
  }

  it('AC-4903.1: 같은 DB에 두 번 돌려도 오류 없이 칸·제약·권한·RLS·정책과 이미 있던 줄이 그대로다', async () => {
    const fresh = await PGlite.create()
    try {
      await migrate(fresh)
      const once = await tableShape(fresh)
      expect((once[DAYS] as { columns: Row[] }).columns).toHaveLength(28)
      expect((once[DAYS] as { triggers: Row[] }).triggers).toEqual([])
      await fresh.query('insert into auth.users (id, email) values ($1, $2)', [A, emailOf(A)])
      const [h] = await rows(
        `insert into public.hospitals (owner_id, name, applicant_name, email, status)
         values ($1, '가짜병원', '홍길동', $2, 'approved') returning id`,
        [A, emailOf(A)],
        fresh,
      )
      await fresh.query(`insert into ${DAYS} (hospital_id, work_date, closed_at, visits) values ($1, $2, $3, 9)`, [h.id, DAY, OLD])
      await fresh.query(`insert into ${SPENDS} (hospital_id, work_date, kind, memo, amount) values ($1, $2, 'card', '가짜', 100)`, [
        h.id,
        DAY,
      ])
      await fresh.query(`insert into ${SETTINGS} (hospital_id, block_group, rsv_words) values ($1, $2, '{"inj":["가"],"visit":[],"etc":[]}')`, [
        h.id,
        GROUP,
      ])
      const seeded = async () => ({
        days: await rows(`select work_date::text as day, closed_at = $1::timestamptz as old, visits from ${DAYS}`, [OLD], fresh),
        spends: await rows(`select kind, memo, amount from ${SPENDS}`, [], fresh),
        settings: await rows(`select block_group, rsv_words from ${SETTINGS}`, [], fresh),
      })
      const before = await seeded()

      await fresh.exec(SUNAP_MIGRATION)

      expect(await tableShape(fresh)).toEqual(once)
      expect(await seeded()).toEqual(before)
      expect(before.days).toEqual([{ day: DAY, old: true, visits: 9 }])
    } finally {
      await fresh.close()
    }
  }, 120_000)
})

describe('AC-4903.2 로그인 안 한 사용자(anon)', SLOW, () => {
  it('AC-4903.2: anon은 세 표 모두 읽기·넣기·고치기·지우기가 권한 없음이고 줄은 그대로다', async () => {
    await seedDay(A)
    await seedSpend(A)
    await seedSettings(A)
    const before = await snapshot()
    await becomeAnon()
    for (const table of TABLES) {
      await expect(db.query(`select * from ${table}`)).rejects.toMatchObject(DENIED)
      await expect(db.query(`delete from ${table}`)).rejects.toMatchObject(DENIED)
    }
    await expect(db.query(`insert into ${DAYS} (work_date) values ($1)`, [DAY2])).rejects.toMatchObject(DENIED)
    await expect(db.query(`update ${DAYS} set visits = 1`)).rejects.toMatchObject(DENIED)
    await expect(db.query(`insert into ${SPENDS} (work_date, kind, memo, amount) values ($1, 'cash', '가짜', 1)`, [DAY])).rejects.toMatchObject(
      DENIED,
    )
    await expect(db.query(`update ${SPENDS} set amount = 1`)).rejects.toMatchObject(DENIED)
    await expect(db.query(`insert into ${SETTINGS} (block_group) values ($1)`, [GROUP2])).rejects.toMatchObject(DENIED)
    await expect(db.query(`update ${SETTINGS} set block_group = null`)).rejects.toMatchObject(DENIED)
    expect(await snapshot()).toEqual(before)
  })
})

describe('AC-4903.2 승인된 병원은 자기 병원 줄만: 마감(sunap_days)', SLOW, () => {
  it('AC-4903.2: PostgREST upsert 모양으로 마감하면 hospital_id는 DB 기본값(내 병원)이고 보낸 칸이 들어간다', async () => {
    await become(A)
    await postgrestUpsert(DAYS, 'hospital_id, work_date', [dayBody(3, { late: true })])
    const [row] = await rows(`select hospital_id, work_date::text as day, closed_at = $1::timestamptz as at, late, visits, unpaid_won from ${DAYS}`, [
      NEW_AT,
    ])
    expect(row).toEqual({ hospital_id: hospital[A], day: DAY, at: true, late: true, visits: 3, unpaid_won: 3 })
  })

  it('AC-4903.2: 같은 날 다시 마감(upsert)하면 줄 하나가 새 숫자·시각·늦음으로 바뀌고 남의 병원 같은 날 줄은 그대로다', async () => {
    await seedDay(A, DAY, 7)
    await seedDay(B, DAY, 8)
    await become(A)
    await postgrestUpsert(DAYS, 'hospital_id, work_date', [dayBody(5, { late: true })])
    const after = await snapshot()
    expect(after.days).toEqual(
      [
        { hospital_id: hospital[A], day: DAY, at: expect.stringMatching(/^2026-11-16 /), late: true, visits: 5 },
        { hospital_id: hospital[B], day: DAY, at: expect.stringMatching(/^2001-01-01 /), late: false, visits: 8 },
      ].sort((x, y) => String(x.hospital_id).localeCompare(String(y.hospital_id))),
    )
  })

  it('AC-4903.2: 내 병원 줄만 보이고, 날짜로 지우면 내 줄만 지워진다(남의 줄은 조건 없이 지워도 그대로)', async () => {
    await seedDay(A, DAY)
    await seedDay(A, DAY2)
    await seedDay(B, DAY)
    await become(A)
    expect(await rows(`select hospital_id, work_date::text as day from ${DAYS} order by 2`)).toEqual([
      { hospital_id: hospital[A], day: DAY },
      { hospital_id: hospital[A], day: DAY2 },
    ])
    expect((await db.query(`delete from ${DAYS} where work_date = $1`, [DAY])).affectedRows).toBe(1)
    expect((await db.query(`delete from ${DAYS} where hospital_id = $1`, [hospital[B]])).affectedRows).toBe(0)
    await become(B)
    expect((await db.query(`delete from ${DAYS} where work_date = $1`, [DAY2])).affectedRows).toBe(0)
    const after = await snapshot()
    expect(after.days.map((r) => [r.hospital_id, r.day])).toEqual(
      [
        [hospital[A], DAY2],
        [hospital[B], DAY],
      ].sort((x, y) => x[0].localeCompare(y[0])),
    )
  })

  it('AC-4903.2: 내 줄의 숫자·늦음·시각은 고칠 수 있지만 hospital_id는 넣지도 고치지도 못한다', async () => {
    await seedDay(A)
    await become(A)
    expect((await db.query(`update ${DAYS} set visits = 11, late = true, closed_at = $1 where work_date = $2`, [NEW_AT, DAY])).affectedRows).toBe(1)
    await expect(db.query(`update ${DAYS} set hospital_id = $1`, [hospital[B]])).rejects.toMatchObject(DENIED)
    await expect(db.query(`insert into ${DAYS} (hospital_id, work_date) values ($1, $2)`, [hospital[A], DAY2])).rejects.toMatchObject(DENIED)
    await expect(db.query(`insert into ${DAYS} (hospital_id, work_date) values ($1, $2)`, [hospital[B], DAY2])).rejects.toMatchObject(DENIED)
    expect((await snapshot()).days).toEqual([{ hospital_id: hospital[A], day: DAY, at: expect.stringMatching(/^2026-11-16 /), late: true, visits: 11 }])
  })
})

describe('AC-4903.2 승인된 병원은 자기 병원 줄만: 지출(sunap_spends)', SLOW, () => {
  it('AC-4903.2: 넣으면 id·hospital_id·created_at은 DB가 정하고, 고치고 지울 수 있다', async () => {
    await become(A)
    const [added] = await rows(
      `insert into ${SPENDS} (work_date, kind, memo, amount) values ($1, 'parking', '주차 지원', 3000)
       returning id, hospital_id, work_date::text as day, kind, memo, amount, created_at > $2::timestamptz as fresh`,
      [DAY, OLD],
    )
    expect(added).toEqual({ id: expect.any(String), hospital_id: hospital[A], day: DAY, kind: 'parking', memo: '주차 지원', amount: 3000, fresh: true })
    const [changed] = await rows(`update ${SPENDS} set kind = 'card', memo = '택배', amount = 4500 where id = $1 returning kind, memo, amount`, [added.id])
    expect(changed).toEqual({ kind: 'card', memo: '택배', amount: 4500 })
    expect((await db.query(`delete from ${SPENDS} where id = $1`, [added.id])).affectedRows).toBe(1)
    expect((await snapshot()).spends).toEqual([])
  })

  it('AC-4903.2: 내 병원 지출만 보이고, 남의 줄은 id로 고치거나 지워도 0줄이다', async () => {
    const mine = await seedSpend(A, '내 지출')
    const other = await seedSpend(B, '남의 지출')
    await become(A)
    expect(await rows(`select id, memo from ${SPENDS}`)).toEqual([{ id: mine, memo: '내 지출' }])
    expect((await db.query(`update ${SPENDS} set amount = 1 where id = $1`, [other])).affectedRows).toBe(0)
    expect((await db.query(`delete from ${SPENDS} where id = $1`, [other])).affectedRows).toBe(0)
    expect((await db.query(`delete from ${SPENDS}`)).affectedRows).toBe(1)
    expect((await snapshot()).spends).toEqual([expect.objectContaining({ id: other, memo: '남의 지출', amount: 5000 })])
  })

  it('AC-4903.2: hospital_id·id·created_at은 넣지 못하고, hospital_id·work_date·created_at은 고치지 못한다', async () => {
    const mine = await seedSpend(A)
    await become(A)
    const base = `(work_date, kind, memo, amount`
    await expect(db.query(`insert into ${SPENDS} ${base}, hospital_id) values ($1, 'cash', '가짜', 1, $2)`, [DAY, hospital[A]])).rejects.toMatchObject(DENIED)
    await expect(db.query(`insert into ${SPENDS} ${base}, id) values ($1, 'cash', '가짜', 1, $2)`, [DAY, OTHER_ID])).rejects.toMatchObject(DENIED)
    await expect(db.query(`insert into ${SPENDS} ${base}, created_at) values ($1, 'cash', '가짜', 1, $2)`, [DAY, OLD])).rejects.toMatchObject(DENIED)
    await expect(db.query(`update ${SPENDS} set hospital_id = $1 where id = $2`, [hospital[B], mine])).rejects.toMatchObject(DENIED)
    await expect(db.query(`update ${SPENDS} set work_date = $1 where id = $2`, [DAY2, mine])).rejects.toMatchObject(DENIED)
    await expect(db.query(`update ${SPENDS} set created_at = now() where id = $1`, [mine])).rejects.toMatchObject(DENIED)
    expect((await snapshot()).spends).toEqual([expect.objectContaining({ id: mine, day: DAY, amount: 5000 })])
  })
})

describe('AC-4903.2 승인된 병원은 자기 병원 줄만: 설정(sunap_settings)', SLOW, () => {
  const WORDS = { inj: ['주사'], visit: ['경과'], etc: [] }

  it('AC-4903.2: PostgREST upsert 모양(on conflict hospital_id)으로 처음엔 넣고 다음엔 내 줄 하나를 고친다', async () => {
    await seedSettings(B, GROUP2)
    await become(A)
    await postgrestUpsert(SETTINGS, 'hospital_id', [{ block_group: GROUP, pt_group: null, rsv_words: WORDS }])
    expect(await rows(`select hospital_id, block_group, pt_group, rsv_words from ${SETTINGS}`)).toEqual([
      { hospital_id: hospital[A], block_group: GROUP, pt_group: null, rsv_words: WORDS },
    ])
    await postgrestUpsert(SETTINGS, 'hospital_id', [{ block_group: null, pt_group: GROUP2, rsv_words: DEFAULT_RSV_WORDS }])
    const after = await snapshot()
    expect(after.settings).toHaveLength(2)
    expect(after.settings).toContainEqual({ hospital_id: hospital[A], block_group: null, pt_group: GROUP2, rsv_words: DEFAULT_RSV_WORDS })
    expect(after.settings).toContainEqual(expect.objectContaining({ hospital_id: hospital[B], block_group: GROUP2 }))
  })

  it('AC-4903.2: 설정은 지우기 권한이 없고, hospital_id는 넣지도 고치지도 못하며, 남의 설정은 안 보이고 안 바뀐다', async () => {
    await seedSettings(A, GROUP)
    await seedSettings(B, GROUP2)
    const before = await snapshot()
    await become(A)
    expect(await rows(`select hospital_id, block_group from ${SETTINGS}`)).toEqual([{ hospital_id: hospital[A], block_group: GROUP }])
    await expect(db.query(`delete from ${SETTINGS}`)).rejects.toMatchObject(DENIED)
    await expect(db.query(`insert into ${SETTINGS} (hospital_id) values ($1)`, [hospital[A]])).rejects.toMatchObject(DENIED)
    await expect(db.query(`update ${SETTINGS} set hospital_id = $1`, [hospital[B]])).rejects.toMatchObject(DENIED)
    expect((await db.query(`update ${SETTINGS} set block_group = null where hospital_id = $1`, [hospital[B]])).affectedRows).toBe(0)
    expect(await snapshot()).toEqual(before)
  })
})

describe('AC-4903.2 승인 대기·거절·병원 없음', SLOW, () => {
  it.each<[string, string]>([
    ['승인 대기', C],
    ['거절', D],
    ['병원 줄 없음', E],
  ])('AC-4903.2: %s인 사용자는 세 표에서 아무 줄도 보지 못하고 넣지 못하며 고치거나 지워도 바뀌는 줄이 없다', async (_name, user) => {
    if (hospital[user]) {
      await seedDay(user)
      await seedSpend(user)
      await seedSettings(user)
    }
    await seedDay(A)
    await seedSpend(A)
    await seedSettings(A)
    const before = await snapshot()
    await become(user)
    for (const table of TABLES) expect(await rows(`select * from ${table}`)).toEqual([])
    await expect(postgrestUpsert(DAYS, 'hospital_id, work_date', [dayBody(1)])).rejects.toThrow(RLS_REJECTED)
    await expect(db.query(`insert into ${SPENDS} (work_date, kind, memo, amount) values ($1, 'cash', '가짜', 1)`, [DAY])).rejects.toThrow(RLS_REJECTED)
    await expect(postgrestUpsert(SETTINGS, 'hospital_id', [{ block_group: GROUP2 }])).rejects.toThrow(RLS_REJECTED)
    expect((await db.query(`update ${DAYS} set visits = 1`)).affectedRows).toBe(0)
    expect((await db.query(`update ${SPENDS} set amount = 1`)).affectedRows).toBe(0)
    expect((await db.query(`update ${SETTINGS} set block_group = null`)).affectedRows).toBe(0)
    expect((await db.query(`delete from ${DAYS}`)).affectedRows).toBe(0)
    expect((await db.query(`delete from ${SPENDS}`)).affectedRows).toBe(0)
    expect(await snapshot()).toEqual(before)
  })

  it('AC-4903.2: 승인됐던 병원이 거절되면 그 순간부터 자기 줄도 안 보이고 넣지 못한다', async () => {
    await seedDay(A)
    await seedSpend(A)
    await become(A)
    expect(await rows(`select work_date::text as day from ${DAYS}`)).toEqual([{ day: DAY }])
    await operator()
    await db.query(`update public.hospitals set status = 'rejected' where id = $1`, [hospital[A]])
    await become(A)
    expect(await rows(`select * from ${DAYS}`)).toEqual([])
    expect(await rows(`select * from ${SPENDS}`)).toEqual([])
    await expect(postgrestUpsert(DAYS, 'hospital_id, work_date', [dayBody(1, { work_date: DAY2 })])).rejects.toThrow(RLS_REJECTED)
  })
})

describe('AC-4903.3 값 제약', SLOW, () => {
  it.each(TOTALS)('AC-4903.3: 마감 숫자 칸 %s에 −1을 넣으면 거부(23514)된다', async (key) => {
    await become(A)
    await expect(postgrestUpsert(DAYS, 'hospital_id, work_date', [dayBody(0, { [key]: -1 })])).rejects.toMatchObject(CHECK_FAILED)
    expect((await snapshot()).days).toEqual([])
  })

  it.each(TOTALS)('AC-4903.3: 마감 숫자 칸 %s에 1,000,000,001을 넣으면 거부(23514)된다', async (key) => {
    await become(A)
    await expect(postgrestUpsert(DAYS, 'hospital_id, work_date', [dayBody(0, { [key]: 1_000_000_001 })])).rejects.toMatchObject(CHECK_FAILED)
  })

  it('AC-4903.3: 숫자 24칸이 모두 0이거나 모두 1,000,000,000이면 들어간다', async () => {
    await become(A)
    await postgrestUpsert(DAYS, 'hospital_id, work_date', [dayBody(0)])
    await postgrestUpsert(DAYS, 'hospital_id, work_date', [dayBody(1_000_000_000, { work_date: DAY2 })])
    const sums = await rows(`select work_date::text as day, (${TOTALS.map((key) => `${key}::bigint`).join(' + ')})::text as total from ${DAYS} order by 1`)
    expect(sums).toEqual([
      { day: DAY, total: '0' },
      { day: DAY2, total: '24000000000' },
    ])
  })

  const addSpend = (kind: string, memo: string, amount: number) =>
    db.query(`insert into ${SPENDS} (work_date, kind, memo, amount) values ($1, $2, $3, $4)`, [DAY, kind, memo, amount])

  it.each(['x', '', 'CASH', 'free'])('AC-4903.3: 지출 종류 %j는 거부(23514)된다', async (kind) => {
    await become(A)
    await expect(addSpend(kind, '가짜', 1)).rejects.toMatchObject(CHECK_FAILED)
  })

  it('AC-4903.3: 지출 종류 넷(cash·card·etc·parking)은 들어간다', async () => {
    await become(A)
    for (const kind of ['cash', 'card', 'etc', 'parking']) await addSpend(kind, '가짜', 1)
    expect((await snapshot()).spends.map((r) => r.kind).sort()).toEqual(['card', 'cash', 'etc', 'parking'])
  })

  it.each<[string, string]>([
    ['빈 글자', ''],
    ['51자', '가'.repeat(51)],
    ['51자(영문)', 'a'.repeat(51)],
  ])('AC-4903.3: 지출 내용이 %s이면 거부(23514)된다', async (_name, memo) => {
    await become(A)
    await expect(addSpend('cash', memo, 1)).rejects.toMatchObject(CHECK_FAILED)
  })

  it('AC-4903.3: 지출 내용 1자·50자(한글)는 들어간다', async () => {
    await become(A)
    await addSpend('cash', '가', 1)
    await addSpend('cash', '가'.repeat(50), 1)
    expect((await snapshot()).spends).toHaveLength(2)
  })

  it.each([100_000_001, -1])('AC-4903.3: 지출 금액 %i은 거부(23514)된다', async (amount) => {
    await become(A)
    await expect(addSpend('cash', '가짜', amount)).rejects.toMatchObject(CHECK_FAILED)
  })

  it('AC-4903.3: 지출 금액 0원·100,000,000원은 들어가고, 고칠 때도 같은 제약이다', async () => {
    await become(A)
    await addSpend('cash', '가짜', 0)
    await addSpend('cash', '가짜', 100_000_000)
    await expect(db.query(`update ${SPENDS} set amount = 100000001`)).rejects.toMatchObject(CHECK_FAILED)
    await expect(db.query(`update ${SPENDS} set kind = 'x'`)).rejects.toMatchObject(CHECK_FAILED)
    await expect(db.query(`update ${SPENDS} set memo = ''`)).rejects.toMatchObject(CHECK_FAILED)
    expect((await snapshot()).spends.map((r) => r.amount).sort()).toEqual([0, 100_000_000])
  })

  it.each<[string, string]>([
    ['배열', '[]'],
    ['글자', '"주사"'],
    ['숫자', '1'],
    ['null 값', 'null'],
  ])('AC-4903.3: 설정 예약 말이 객체가 아니면(%s) 거부(23514)된다', async (_name, json) => {
    await become(A)
    await expect(db.query(`insert into ${SETTINGS} (rsv_words) values ($1::jsonb)`, [json])).rejects.toMatchObject(CHECK_FAILED)
  })

  it('AC-4903.3: 설정 예약 말이 4,000바이트면 거부(23514)되고 3,999바이트는 들어간다', async () => {
    await become(A)
    const sized = async (bytes: number) => {
      // 글자 길이를 DB가 jsonb를 글로 바꾼 길이로 맞춘다
      const [{ n }] = await rows(`select octet_length('{"etc": [""]}'::jsonb::text) as n`)
      return JSON.stringify({ etc: ['a'.repeat(bytes - (n as number))] })
    }
    const big = await sized(4000)
    expect(await rows(`select octet_length($1::jsonb::text) as n`, [big])).toEqual([{ n: 4000 }])
    await expect(db.query(`insert into ${SETTINGS} (rsv_words) values ($1::jsonb)`, [big])).rejects.toMatchObject(CHECK_FAILED)
    await db.query(`insert into ${SETTINGS} (rsv_words) values ($1::jsonb)`, [await sized(3999)])
    expect((await snapshot()).settings).toHaveLength(1)
  })
})

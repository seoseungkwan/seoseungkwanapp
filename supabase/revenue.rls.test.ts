import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  REVENUE_CODE_SHAPE,
  REVENUE_DAY_KEYS,
  REVENUE_KEPT_KEYS,
  REVENUE_MONEY_KEYS,
  REVENUE_SPLIT_KEYS,
} from '@/types/revenue'

// 매출 표 셋(sales_days·sales_codes·rx_groups)과 저장 함수의 RLS·권한·제약 (revenue REQ-004, design.md 5-2·6절).
// rls.test.ts와 같은 방법: 진짜 Postgres(PGlite, WASM)에서 운영자가 SQL 편집기에 붙일 migration 파일을 차례로 실행한다.
// 실제 Supabase에는 붙지 않는다. Supabase가 미리 갖춘 것(역할·auth 스키마·auth.uid()·auth.jwt()·새 표와 함수의 기본 권한)만 흉내 낸다
const fileUrl = (path: string) => fileURLToPath(new URL(path, import.meta.url))
const AUTH_MIGRATION = readFileSync(fileUrl('./migrations/20261028000000_auth.sql'), 'utf-8')
const REVENUE_PATH = fileUrl('./migrations/20261101000400_revenue.sql')
// 파일이 아직 없으면 빈 글자로 돌아, 시험마다 '표가 없다'로 실패한다(무엇이 빠졌는지 시험별로 보인다)
const REVENUE_MIGRATION = existsSync(REVENUE_PATH) ? readFileSync(REVENUE_PATH, 'utf-8') : ''

const SUPABASE_MOCK = `
  create role anon nologin;
  create role authenticated nologin;
  grant usage on schema public to anon, authenticated;
  -- Supabase는 public에 새로 만든 표·함수에 anon·authenticated 모든 권한을 준다(migration이 거둬야 한다)
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;

  create schema auth;
  grant usage on schema auth to anon, authenticated;
  create table auth.users (id uuid primary key, email text);
  create function auth.jwt() returns jsonb language sql stable
    as $$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
`

// 갈래 규칙 C1: 다른 갈래(업무일지·통계·환자·사전점검)와 글자까지 같아야 어느 순서로 붙여 넣어도 된다
const C1_MY_HOSPITAL_ID = `create or replace function public.my_hospital_id() returns uuid language sql stable security definer set search_path = ''
  as $$ select h.id from public.hospitals h where h.owner_id = (select auth.uid()) and h.status = 'approved' $$;
revoke execute on function public.my_hospital_id() from public, anon;
grant execute on function public.my_hospital_id() to authenticated;
`
const C1_TOUCH_UPDATED_AT = `create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$ begin new.updated_at = now(); return new; end $$;
`

const A = '00000000-0000-4000-8000-00000000000a' // 승인
const B = '00000000-0000-4000-8000-00000000000b' // 승인
const C = '00000000-0000-4000-8000-00000000000c' // 승인 대기
const D = '00000000-0000-4000-8000-00000000000d' // 거절
const USERS = [
  { id: A, email: 'a@fake.test', status: 'approved' },
  { id: B, email: 'b@fake.test', status: 'approved' },
  { id: C, email: 'c@fake.test', status: 'pending' },
  { id: D, email: 'd@fake.test', status: 'rejected' },
]

const snake = (keys: readonly string[]) => keys.map((k) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`))
const MONEY_COLUMNS = snake(REVENUE_MONEY_KEYS)
const SPLIT_COLUMNS = snake(REVENUE_SPLIT_KEYS)
const KEPT_COLUMNS = snake(REVENUE_KEPT_KEYS)
const COUNT_COLUMNS = ['visits', 'new_patients', 'return_visits', 'patients_to_date']

const COLUMNS = {
  sales_days: [
    'hospital_id',
    'day',
    'visits',
    'new_patients',
    'return_visits',
    'patients_to_date',
    'total',
    'insurer',
    'noncovered',
    'copay',
    'other_total',
    'cash',
    'card',
    'transfer',
    'receivable_in',
    'unconfirmed',
    'split_unconfirmed',
    'fetched_at',
  ],
  sales_codes: ['hospital_id', 'month', 'code', 'name', 'count', 'amount', 'fetched_at'],
  rx_groups: ['id', 'hospital_id', 'name', 'codes', 'sort_order', 'updated_at'],
}
type Table = keyof typeof COLUMNS
const TABLES = Object.keys(COLUMNS) as Table[]

// 사용자가 보낼 수 있는 칸(그 밖은 칸 권한이 없다)
// sales_days는 day~split_unconfirmed 열여섯 칸(upsert가 충돌 칸 day도 SET한다)
const DAY_SENT = COLUMNS.sales_days.filter((c) => c !== 'hospital_id' && c !== 'fetched_at')
const CODE_SENT = ['month', 'code', 'name', 'count', 'amount']
const GROUP_SENT = ['name', 'codes', 'sort_order']

type Row = Record<string, unknown>

const nulls = (columns: readonly string[]) => Object.fromEntries(columns.map((c) => [c, null]))

const DAY = '2026-10-01'
const OTHER_DAY = '2026-10-02'
const MONTH = '2026-10-01'
const OTHER_MONTH = '2026-09-01'
const COUNTS = { visits: 3, new_patients: 1, return_visits: 2, patients_to_date: 3 }
const MONEY = {
  total: 100_000,
  insurer: 40_000,
  noncovered: 20_000,
  copay: 30_000,
  other_total: 10_000,
  cash: 50_000,
  card: 30_000,
  transfer: 10_000,
  receivable_in: 5_000,
}
// 5-2의 세 모양: 나눔까지 있는 날 · 나눔만 빈 날 · 아홉 칸 모두 빈 날
const NORMAL_DAY: Row = { day: DAY, ...COUNTS, ...MONEY, unconfirmed: false, split_unconfirmed: false }
const SPLIT_DAY: Row = { ...NORMAL_DAY, ...nulls(SPLIT_COLUMNS), split_unconfirmed: true }
const UNCONFIRMED_DAY: Row = { ...NORMAL_DAY, ...nulls(MONEY_COLUMNS), unconfirmed: true }

const CODE: Row = { month: MONTH, code: 'MT001', name: '도수치료', count: 3, amount: 150_000 }
const GROUP: Row = { name: '도수치료', codes: ['MT001'], sort_order: 0 }
const SEED: Record<Table, Row> = { sales_days: NORMAL_DAY, sales_codes: CODE, rx_groups: GROUP }
const UPDATE_ONE: Record<Table, string> = {
  sales_days: 'visits = 9',
  sales_codes: 'count = 9',
  rx_groups: 'sort_order = 9',
}

const DENIED = /permission denied/
const CHECK = /check constraint/
const RLS = /row-level security/
const UNIQUE = /duplicate key value violates unique constraint/
const BAD_INPUT = /invalid input syntax/
const NOT_NULL = /null value in column/
const BAD_GROUPS = /bad groups/
const NOT_MINE = /not my group/

// PGlite 첫 실행(WASM 불러오기)이 느린 PC·CI에서도 흔들리지 않게
const SLOW = { timeout: 60_000 }
let db: PGlite
const HOSPITAL: Record<string, string> = {}

async function setUp(target: PGlite) {
  await target.exec(SUPABASE_MOCK)
  await target.exec(AUTH_MIGRATION)
}

beforeAll(async () => {
  db = await PGlite.create()
  await setUp(db)
  await db.exec(REVENUE_MIGRATION)
}, 60_000)

afterAll(async () => {
  await db.close()
})

// 시험마다 빈 표에서 시작한다. 운영자(superuser)는 RLS를 건너뛴다
beforeEach(resetData)

async function resetData() {
  await db.exec('rollback') // 앞 시험이 트랜잭션 도중에 실패해도 다음 시험까지 번지지 않게
  await operator()
  await db.exec('truncate auth.users cascade')
  for (const user of USERS) {
    await db.query('insert into auth.users (id, email) values ($1, $2)', [user.id, user.email])
    const [row] = await rows(
      `insert into public.hospitals (owner_id, name, applicant_name, email, status)
       values ($1, '가짜병원', '홍길동', $2, $3) returning id`,
      [user.id, user.email, user.status],
    )
    HOSPITAL[user.id] = row.id as string
  }
}

async function operator() {
  await db.exec('reset role; reset request.jwt.claims')
}

// 로그인 토큰: sub = uid
async function become(user: string) {
  await operator()
  const email = USERS.find((u) => u.id === user)?.email ?? ''
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: user, email })])
  await db.exec('set role authenticated')
}

async function becomeAnon() {
  await operator()
  await db.exec('set role anon')
}

async function rows(sql: string, params: unknown[] = []) {
  return (await db.query<Row>(sql, params)).rows
}

function insert(table: Table, row: Row, suffix = '') {
  const columns = Object.keys(row)
  const placeholders = columns.map((_, i) => `$${i + 1}`)
  return rows(
    `insert into public.${table} (${columns.join(', ')}) values (${placeholders.join(', ')}) ${suffix}`,
    Object.values(row),
  )
}

// 운영자가 owner 병원 줄을 넣는다(칸 권한·RLS를 건너뛴다). 넣은 줄을 돌려준다
async function seed(table: Table, owner: string, row: Row = SEED[table]) {
  await operator()
  const [added] = await insert(table, { hospital_id: HOSPITAL[owner], ...row }, 'returning *')
  return added
}

// 운영자 눈으로 본 표 전체(바뀌지 않았는지 비교할 때)
async function snapshot(table: Table) {
  await operator()
  return rows(`select * from public.${table} order by 1, 2, 3`)
}

async function groupNames() {
  await operator()
  const list = await rows('select name from public.rx_groups order by name')
  return list.map((r) => r.name)
}

const UPSERT_DAY = `insert into public.sales_days (${DAY_SENT.join(', ')})
  values (${DAY_SENT.map((_, i) => `$${i + 1}`).join(', ')})
  on conflict (hospital_id, day) do update set ${DAY_SENT.map((c) => `${c} = excluded.${c}`).join(', ')}`
const upsertDay = (row: Row) => rows(UPSERT_DAY, DAY_SENT.map((c) => row[c]))

const SAVE = 'select * from public.save_rx_groups(groups := $1::jsonb)'

// PostgREST처럼 BEGIN → 함수 호출 → COMMIT. 이름 겹침 검사는 COMMIT에서 돈다
async function save(groups: unknown) {
  await db.exec('begin')
  try {
    const saved = await rows(SAVE, [JSON.stringify(groups)])
    await db.exec('commit')
    return saved
  } catch (error) {
    await db.exec('rollback')
    throw error
  }
}

// 함수 호출은 지나가고(겹침 검사가 미뤄져 있다) COMMIT에서 이름 겹침으로 실패해야 한다. 함수가 돌려준 목록을 돌려준다(그때 이미 지움까지 돌았다)
async function expectSaveFailsAtCommit(groups: unknown) {
  await db.exec('begin')
  const returned = await rows(SAVE, [JSON.stringify(groups)])
  await expect(db.exec('commit')).rejects.toThrow(UNIQUE)
  return returned
}

const PROPOSALS = [
  { name: '도수치료', codes: ['MT001', 'MT002'], sort_order: 0 },
  { name: '체외충격파', codes: ['ES001'], sort_order: 1 },
  { name: 'C-arm 주사', codes: ['CA001'], sort_order: 2 },
  { name: '초음파', codes: ['US001'], sort_order: 3 },
  { name: '냉동치료', codes: ['CT001'], sort_order: 4 },
]

describe('AC-004.1 표·칸·기본 키·RLS', SLOW, () => {
  it.each(TABLES)('AC-004.1 %s의 칸이 정확히 정해 둔 것뿐이다(환자 칸 없음)', async (table) => {
    const list = await rows(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = $1 order by ordinal_position`,
      [table],
    )
    expect(list.map((r) => r.column_name)).toEqual(COLUMNS[table])
  })

  it('AC-004.1 sales_days 칸은 계약(src/types/revenue.ts) 칸과 하나씩 맞는다', async () => {
    const list = await rows(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'sales_days' and column_name not in ('hospital_id', 'fetched_at')
       order by ordinal_position`,
    )
    expect(list.map((r) => r.column_name)).toEqual(snake(REVENUE_DAY_KEYS).map((c) => (c === 'date' ? 'day' : c)))
  })

  it('AC-004.1 글자 칸은 처방 코드·이름과 묶음 이름·코드뿐이고 jsonb 칸은 없다', async () => {
    const list = await rows(
      `select table_name || '.' || column_name as col from information_schema.columns
       where table_schema = 'public' and table_name = any($1::text[])
         and data_type in ('text', 'character varying', 'character', 'json', 'jsonb', 'ARRAY', 'bytea')
       order by 1`,
      [TABLES],
    )
    expect(list.map((r) => r.col)).toEqual(['rx_groups.codes', 'rx_groups.name', 'sales_codes.code', 'sales_codes.name'])
  })

  it.each([
    ['sales_days', ['hospital_id', 'day']],
    ['sales_codes', ['hospital_id', 'month', 'code']],
    ['rx_groups', ['id']],
  ])('AC-004.1 %s의 기본 키', async (table, key) => {
    const list = await rows(
      `select a.attname from pg_index i
       join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
       where i.indrelid = ('public.' || $1)::regclass and i.indisprimary
       order by array_position(i.indkey::int2[], a.attnum)`,
      [table],
    )
    expect(list.map((r) => r.attname)).toEqual(key)
  })

  it.each(TABLES)('AC-004.1 %s에 RLS가 켜져 있다', async (table) => {
    const [row] = await rows(`select relrowsecurity from pg_class where oid = ('public.' || $1)::regclass`, [table])
    expect(row.relrowsecurity).toBe(true)
  })

  it('AC-004.1 rx_groups는 병원마다 이름 하나이고 그 검사는 트랜잭션 끝으로 미뤄져 있다', async () => {
    const list = await rows(
      `select condeferrable, condeferred, pg_get_constraintdef(oid) as def from pg_constraint
       where conrelid = 'public.rx_groups'::regclass and contype = 'u'`,
    )
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ condeferrable: true, condeferred: true })
    expect(list[0].def).toContain('(hospital_id, name)')
  })

  it('AC-004.1 병원 줄을 지우면(운영자) 그 병원의 세 표 줄도 함께 지워지고 다른 병원 줄은 그대로다', async () => {
    for (const owner of [A, B]) for (const table of TABLES) await seed(table, owner)
    await operator()
    await rows('delete from public.hospitals where id = $1', [HOSPITAL[A]])
    for (const table of TABLES) {
      expect(await rows(`select hospital_id from public.${table}`)).toEqual([{ hospital_id: HOSPITAL[B] }])
    }
  })
})

describe('AC-004.2 로그인 안 한 사용자(anon)는 아무것도 못 한다', SLOW, () => {
  it.each(TABLES)('AC-004.2 anon에게 %s의 표·칸 권한이 하나도 없다', async (table) => {
    for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']) {
      const [row] = await rows(`select has_any_column_privilege('anon', 'public.' || $1, $2) as ok`, [table, privilege])
      expect(row.ok).toBe(false)
    }
    for (const privilege of ['DELETE', 'TRUNCATE', 'TRIGGER']) {
      const [row] = await rows(`select has_table_privilege('anon', 'public.' || $1, $2) as ok`, [table, privilege])
      expect(row.ok).toBe(false)
    }
  })

  it.each(TABLES)('AC-004.2 anon은 %s를 읽기·넣기·고치기·지우기 모두 거부되고 줄은 그대로다', async (table) => {
    await seed(table, A)
    const before = await snapshot(table)
    await becomeAnon()
    await expect(rows(`select * from public.${table}`)).rejects.toThrow(DENIED)
    await expect(insert(table, SEED[table])).rejects.toThrow(DENIED)
    await expect(rows(`update public.${table} set ${UPDATE_ONE[table]}`)).rejects.toThrow(DENIED)
    await expect(rows(`delete from public.${table}`)).rejects.toThrow(DENIED)
    expect(await snapshot(table)).toEqual(before)
  })
})

describe('AC-004.2 authenticated 권한은 정해 둔 칸만이다', SLOW, () => {
  async function columnsWith(table: Table, privilege: string) {
    await rows(`select ('public.' || $1)::regclass`, [table]) // 표가 없으면 여기서 실패한다(빈 목록과 헷갈리지 않게)
    const list = await rows(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = $1
         and has_column_privilege('authenticated', 'public.' || table_name, column_name, $2)
       order by ordinal_position`,
      [table, privilege],
    )
    return list.map((r) => r.column_name)
  }

  it.each([
    ['sales_days', 'INSERT', DAY_SENT],
    ['sales_days', 'UPDATE', DAY_SENT],
    ['sales_codes', 'INSERT', CODE_SENT],
    ['sales_codes', 'UPDATE', []],
    ['rx_groups', 'INSERT', GROUP_SENT],
    ['rx_groups', 'UPDATE', GROUP_SENT],
  ] as [Table, string, string[]][])('AC-004.2 AC-004.5 %s %s 칸 권한이 정확하다', async (table, privilege, expected) => {
    expect(await columnsWith(table, privilege)).toEqual(expected)
  })

  it.each(TABLES)('AC-004.2 AC-004.5 %s는 읽기·지우기만 표 단위이고 비우기 등은 없다', async (table) => {
    for (const [privilege, expected] of [
      ['SELECT', true],
      ['DELETE', true],
      ['INSERT', false],
      ['UPDATE', false],
      ['TRUNCATE', false],
      ['REFERENCES', false],
      ['TRIGGER', false],
    ] as const) {
      const [row] = await rows(`select has_table_privilege('authenticated', 'public.' || $1, $2) as ok`, [table, privilege])
      expect([privilege, row.ok]).toEqual([privilege, expected])
    }
  })

  it.each([
    ['sales_days', ['DELETE', 'INSERT', 'SELECT', 'UPDATE']],
    ['sales_codes', ['DELETE', 'INSERT', 'SELECT']],
    ['rx_groups', ['DELETE', 'INSERT', 'SELECT', 'UPDATE']],
  ])('AC-004.2 AC-004.5 %s 정책은 authenticated 대상이고 모두 my_hospital_id()로 거른다', async (table, commands) => {
    const list = await rows(
      `select cmd, permissive, roles::text as roles, qual, with_check from pg_policies
       where schemaname = 'public' and tablename = $1 order by cmd`,
      [table],
    )
    expect(list.map((p) => p.cmd)).toEqual(commands)
    for (const policy of list) {
      expect(policy).toMatchObject({ permissive: 'PERMISSIVE', roles: '{authenticated}' })
      if (policy.cmd !== 'INSERT') expect(policy.qual).toContain('my_hospital_id()')
      if (policy.cmd === 'INSERT' || policy.cmd === 'UPDATE') expect(policy.with_check).toContain('my_hospital_id()')
    }
  })
})

describe('AC-004.2 승인된 사용자는 자기 병원 줄만 다룬다', SLOW, () => {
  it.each(TABLES)('AC-004.2 AC-004.5 A는 %s에서 자기 줄만 보고 B 줄은 안 보인다', async (table) => {
    await seed(table, A)
    await seed(table, B)
    await become(A)
    expect(await rows(`select hospital_id from public.${table}`)).toEqual([{ hospital_id: HOSPITAL[A] }])
    expect(await rows(`select hospital_id from public.${table} where hospital_id = $1`, [HOSPITAL[B]])).toEqual([])
  })

  it('AC-004.2 A는 sales_days 자기 줄을 넣고 고치고 지운다', async () => {
    await become(A)
    await insert('sales_days', NORMAL_DAY)
    await insert('sales_days', { ...SPLIT_DAY, day: OTHER_DAY })
    expect(await rows('update public.sales_days set total = 7 where day = $1 returning total', [DAY])).toEqual([{ total: 7 }])
    expect(await rows('delete from public.sales_days where day = $1 returning day::text as day', [OTHER_DAY])).toEqual([
      { day: OTHER_DAY },
    ])
    expect(await rows('select day::text as day, total from public.sales_days')).toEqual([{ day: DAY, total: 7 }])
  })

  it('AC-004.2 A는 sales_codes 자기 줄을 넣고 읽고 지우지만 고치지는 못한다', async () => {
    await become(A)
    await insert('sales_codes', CODE)
    await insert('sales_codes', { ...CODE, month: OTHER_MONTH })
    expect(await rows('select code, name, count, amount from public.sales_codes where month = $1', [MONTH])).toEqual([
      { code: 'MT001', name: '도수치료', count: 3, amount: 150_000 },
    ])
    await expect(rows('update public.sales_codes set count = 9')).rejects.toThrow(DENIED)
    expect(await rows('delete from public.sales_codes where month = $1 returning code', [MONTH])).toEqual([{ code: 'MT001' }])
    expect(await rows('select month::text as month from public.sales_codes')).toEqual([{ month: OTHER_MONTH }])
  })

  it('AC-004.2 sales_codes는 upsert 길이 없어서 지우고 넣는다(같은 달 같은 코드 두 번은 거부)', async () => {
    await become(A)
    await insert('sales_codes', CODE)
    await expect(insert('sales_codes', CODE)).rejects.toThrow(UNIQUE)
    await expect(
      insert('sales_codes', CODE, 'on conflict (hospital_id, month, code) do update set count = excluded.count'),
    ).rejects.toThrow(DENIED)
  })

  it('AC-004.2 sales_days upsert(on conflict (hospital_id, day) do update)가 넣기도 고치기도 된다', async () => {
    await become(A)
    await upsertDay(NORMAL_DAY)
    expect(await rows('select total, insurer, unconfirmed, split_unconfirmed from public.sales_days')).toEqual([
      { total: 100_000, insurer: 40_000, unconfirmed: false, split_unconfirmed: false },
    ])
    await upsertDay({ ...SPLIT_DAY, total: 70_000 })
    expect(await rows('select total, insurer, unconfirmed, split_unconfirmed from public.sales_days')).toEqual([
      { total: 70_000, insurer: null, unconfirmed: false, split_unconfirmed: true },
    ])
    await upsertDay(UNCONFIRMED_DAY)
    expect(await rows('select total, insurer, unconfirmed, split_unconfirmed from public.sales_days')).toEqual([
      { total: null, insurer: null, unconfirmed: true, split_unconfirmed: false },
    ])
  })

  it('AC-004.2 A가 B와 같은 날을 upsert하면 A 줄이 따로 생기고 B 줄은 그대로다', async () => {
    await seed('sales_days', B)
    const before = await snapshot('sales_days')
    await become(A)
    await upsertDay({ ...NORMAL_DAY, total: 1 })
    expect(await rows('select hospital_id, total from public.sales_days')).toEqual([{ hospital_id: HOSPITAL[A], total: 1 }])
    await operator()
    expect(await rows('select * from public.sales_days where hospital_id = $1', [HOSPITAL[B]])).toEqual(before)
  })

  it('AC-004.2 AC-004.5 A는 B 줄을 고치거나 지우지 못한다(0줄, B 줄 그대로)', async () => {
    for (const table of TABLES) await seed(table, B)
    const before = await Promise.all(TABLES.map(snapshot))
    await become(A)
    expect(await rows(`update public.sales_days set total = 1 returning day`)).toEqual([])
    expect(await rows(`update public.rx_groups set sort_order = 9 returning id`)).toEqual([])
    for (const table of TABLES) {
      expect(await rows(`delete from public.${table} returning hospital_id`)).toEqual([])
    }
    expect(await Promise.all(TABLES.map(snapshot))).toEqual(before)
  })

  it('AC-004.2 지우기는 내 줄만 지운다(B 줄은 그대로, E2E 정리에 쓴다)', async () => {
    for (const table of TABLES) {
      await seed(table, A)
      await seed(table, B)
    }
    await become(A)
    for (const table of TABLES) {
      expect(await rows(`delete from public.${table} returning hospital_id`)).toEqual([{ hospital_id: HOSPITAL[A] }])
    }
    await operator()
    for (const table of TABLES) {
      expect(await rows(`select hospital_id from public.${table}`)).toEqual([{ hospital_id: HOSPITAL[B] }])
    }
  })

  it.each(TABLES)('AC-004.2 %s에 hospital_id를 직접 넣으면 내 병원이어도 B 병원이어도 거부된다', async (table) => {
    await become(A)
    await expect(insert(table, { hospital_id: HOSPITAL[A], ...SEED[table] })).rejects.toThrow(DENIED)
    await expect(insert(table, { hospital_id: HOSPITAL[B], ...SEED[table] })).rejects.toThrow(DENIED)
    await operator()
    expect(await rows(`select * from public.${table}`)).toEqual([])
  })

  it.each(TABLES)('AC-004.2 %s의 hospital_id를 바꾸면 거부되고 줄은 그대로다', async (table) => {
    await seed(table, A)
    const before = await snapshot(table)
    await become(A)
    await expect(rows(`update public.${table} set hospital_id = $1`, [HOSPITAL[B]])).rejects.toThrow(DENIED)
    expect(await snapshot(table)).toEqual(before)
  })

  it('AC-004.2 sales_days·sales_codes의 fetched_at은 직접 넣거나 바꿀 수 없다', async () => {
    await become(A)
    await expect(insert('sales_days', { ...NORMAL_DAY, fetched_at: '2001-01-01' })).rejects.toThrow(DENIED)
    await expect(insert('sales_codes', { ...CODE, fetched_at: '2001-01-01' })).rejects.toThrow(DENIED)
    await insert('sales_days', NORMAL_DAY)
    await expect(rows(`update public.sales_days set fetched_at = '2001-01-01'`)).rejects.toThrow(DENIED)
  })
})

describe('AC-004.2 승인 대기·거절 사용자는 아무것도 못 한다', SLOW, () => {
  it.each([
    ['승인 대기', C],
    ['거절', D],
  ])('AC-004.2 AC-004.5 %s 사용자는 세 표 모두 읽기·넣기·고치기·지우기가 안 된다', async (_label, user) => {
    for (const table of TABLES) {
      await seed(table, user)
      const before = await snapshot(table)
      await become(user)
      expect(await rows(`select * from public.${table}`)).toEqual([])
      await expect(insert(table, { ...SEED[table], ...(table === 'rx_groups' ? { name: '새 묶음' } : {}) })).rejects.toThrow(RLS)
      expect(await rows(`delete from public.${table} returning hospital_id`)).toEqual([])
      if (table !== 'sales_codes') {
        expect(await rows(`update public.${table} set ${UPDATE_ONE[table]} returning hospital_id`)).toEqual([])
      }
      expect(await snapshot(table)).toEqual(before)
    }
  })

  it.each([
    ['승인 대기', C],
    ['거절', D],
  ])('AC-004.2 AC-004.4 %s 사용자의 my_hospital_id()는 null이다', async (_label, user) => {
    await become(user)
    expect(await rows('select public.my_hospital_id() as id')).toEqual([{ id: null }])
  })
})

describe('AC-004.3 sales_days 숫자 칸 제약', SLOW, () => {
  beforeEach(() => become(A))

  it.each([...COUNT_COLUMNS, ...MONEY_COLUMNS])('AC-004.3 %s: 음수·소수·글자는 거부된다', async (column) => {
    await expect(insert('sales_days', { ...NORMAL_DAY, [column]: -1 })).rejects.toThrow(CHECK)
    await expect(insert('sales_days', { ...NORMAL_DAY, [column]: '1.5' })).rejects.toThrow(BAD_INPUT)
    await expect(insert('sales_days', { ...NORMAL_DAY, [column]: 'abc' })).rejects.toThrow(BAD_INPUT)
    expect(await rows('select * from public.sales_days')).toEqual([])
  })

  it.each([
    ['visits', 100_000],
    ['new_patients', 100_000],
    ['return_visits', 100_000],
    ['patients_to_date', 1_000_000],
  ])('AC-004.3 %s: 윗 한도(%i)까지 되고 넘으면 거부된다', async (column, limit) => {
    await expect(insert('sales_days', { ...NORMAL_DAY, [column]: limit + 1 })).rejects.toThrow(CHECK)
    await insert('sales_days', { ...NORMAL_DAY, [column]: limit })
    expect(await rows(`select ${column} as value from public.sales_days`)).toEqual([{ value: limit }])
  })

  it('AC-004.3 금액은 0을 받고 int 범위를 넘는 큰 금액도 받는다', async () => {
    await insert('sales_days', { ...NORMAL_DAY, total: 3_000_000_000, insurer: 0 })
    expect(await rows('select total, insurer from public.sales_days')).toEqual([{ total: 3_000_000_000, insurer: 0 }])
  })

  it.each(COUNT_COLUMNS)('AC-004.3 건수 칸 %s는 null이어도 된다(세 모양 모두)', async (column) => {
    await insert('sales_days', { ...NORMAL_DAY, [column]: null })
    await insert('sales_days', { ...SPLIT_DAY, day: OTHER_DAY, [column]: null })
    await insert('sales_days', { ...UNCONFIRMED_DAY, day: '2026-10-03', [column]: null })
    expect(await rows('select * from public.sales_days')).toHaveLength(3)
  })

  it('AC-004.3 day는 2000-01-01부터다', async () => {
    await expect(insert('sales_days', { ...NORMAL_DAY, day: '1999-12-31' })).rejects.toThrow(CHECK)
    await insert('sales_days', { ...NORMAL_DAY, day: '2000-01-01' })
    expect(await rows('select day::text as day from public.sales_days')).toEqual([{ day: '2000-01-01' }])
  })

  it('AC-004.1 AC-004.3 같은 병원 같은 날은 두 줄이 될 수 없다', async () => {
    await insert('sales_days', NORMAL_DAY)
    await expect(insert('sales_days', NORMAL_DAY)).rejects.toThrow(UNIQUE)
  })
})

describe('AC-004.3 금액 아홉 칸의 세 모양(5-2)', SLOW, () => {
  beforeEach(() => become(A))

  it('AC-004.3 세 모양은 모두 들어간다', async () => {
    await insert('sales_days', NORMAL_DAY)
    await insert('sales_days', { ...SPLIT_DAY, day: OTHER_DAY })
    await insert('sales_days', { ...UNCONFIRMED_DAY, day: '2026-10-03' })
    const list = await rows(
      `select day::text as day, ${MONEY_COLUMNS.join(', ')}, unconfirmed, split_unconfirmed from public.sales_days order by day`,
    )
    expect(list).toEqual([
      { day: DAY, ...MONEY, unconfirmed: false, split_unconfirmed: false },
      { day: OTHER_DAY, ...MONEY, ...nulls(SPLIT_COLUMNS), unconfirmed: false, split_unconfirmed: true },
      { day: '2026-10-03', ...nulls(MONEY_COLUMNS), unconfirmed: true, split_unconfirmed: false },
    ])
  })

  it('AC-004.3 unconfirmed와 split_unconfirmed는 둘 다 참일 수 없다(아홉 칸이 비어도, 넷만 비어도)', async () => {
    await expect(insert('sales_days', { ...UNCONFIRMED_DAY, split_unconfirmed: true })).rejects.toThrow(CHECK)
    await expect(insert('sales_days', { ...SPLIT_DAY, unconfirmed: true })).rejects.toThrow(CHECK)
  })

  it.each(MONEY_COLUMNS)('AC-004.3 unconfirmed인데 %s에 값이 있으면 거부된다', async (column) => {
    await expect(insert('sales_days', { ...UNCONFIRMED_DAY, [column]: 1 })).rejects.toThrow(CHECK)
  })

  it.each(SPLIT_COLUMNS)('AC-004.3 split_unconfirmed인데 나눔 칸 %s에 값이 있으면 거부된다', async (column) => {
    await expect(insert('sales_days', { ...SPLIT_DAY, [column]: 1 })).rejects.toThrow(CHECK)
  })

  it.each(KEPT_COLUMNS)('AC-004.3 split_unconfirmed인데 %s가 null이면 거부된다', async (column) => {
    await expect(insert('sales_days', { ...SPLIT_DAY, [column]: null })).rejects.toThrow(CHECK)
  })

  it.each(MONEY_COLUMNS)('AC-004.3 둘 다 거짓인데 %s가 null이면 거부된다', async (column) => {
    await expect(insert('sales_days', { ...NORMAL_DAY, [column]: null })).rejects.toThrow(CHECK)
  })

  it('AC-004.3 둘 다 거짓인데 나눔 네 칸만 null이면 거부된다(표시 없이 나눔만 비우는 길은 없다)', async () => {
    await expect(insert('sales_days', { ...NORMAL_DAY, ...nulls(SPLIT_COLUMNS) })).rejects.toThrow(CHECK)
  })

  it.each(['unconfirmed', 'split_unconfirmed'])('AC-004.3 %s는 null일 수 없다', async (column) => {
    await expect(insert('sales_days', { ...NORMAL_DAY, [column]: null })).rejects.toThrow(NOT_NULL)
    const { [column]: _left, ...rest } = NORMAL_DAY
    await expect(insert('sales_days', rest)).rejects.toThrow(NOT_NULL)
  })
})

describe('AC-004.3 sales_codes 제약', SLOW, () => {
  beforeEach(() => become(A))

  it('AC-004.3 month는 1일이고 2000-01-01부터다', async () => {
    await expect(insert('sales_codes', { ...CODE, month: '2026-10-15' })).rejects.toThrow(CHECK)
    await expect(insert('sales_codes', { ...CODE, month: '1999-12-01' })).rejects.toThrow(CHECK)
    await insert('sales_codes', { ...CODE, month: '2000-01-01' })
    expect(await rows('select month::text as month from public.sales_codes')).toEqual([{ month: '2000-01-01' }])
  })

  const BAD_CODES = ['', 'A'.repeat(31), 'MT 001', 'MT/001', 'MT001\n', '<b>', 'ㄱ']
  const GOOD_CODES = ['A'.repeat(30), '가나다', '힣', 'A-1_2.3', '_REST']

  it.each(BAD_CODES)('AC-004.3 AC-002.2 코드 %j는 모양이 틀려 거부된다(계약의 모양과 같다)', async (code) => {
    expect(REVENUE_CODE_SHAPE.test(code)).toBe(false)
    await expect(insert('sales_codes', { ...CODE, code })).rejects.toThrow(CHECK)
  })

  it.each(GOOD_CODES)('AC-004.3 AC-002.2 코드 %j는 들어간다(계약의 모양과 같다)', async (code) => {
    expect(REVENUE_CODE_SHAPE.test(code)).toBe(true)
    await insert('sales_codes', { ...CODE, code })
    expect(await rows('select code from public.sales_codes')).toEqual([{ code }])
  })

  it('AC-004.3 name은 1~100자이거나 null이다', async () => {
    await expect(insert('sales_codes', { ...CODE, name: '' })).rejects.toThrow(CHECK)
    await expect(insert('sales_codes', { ...CODE, name: '가'.repeat(101) })).rejects.toThrow(CHECK)
    await insert('sales_codes', { ...CODE, code: 'C1', name: '가'.repeat(100) })
    await insert('sales_codes', { ...CODE, code: 'C2', name: null })
    await insert('sales_codes', { ...CODE, code: 'C3', name: '가' })
    expect(await rows('select * from public.sales_codes')).toHaveLength(3)
  })

  it('AC-004.3 count는 0~10,000,000 정수이고 null일 수 없다', async () => {
    await expect(insert('sales_codes', { ...CODE, count: -1 })).rejects.toThrow(CHECK)
    await expect(insert('sales_codes', { ...CODE, count: 10_000_001 })).rejects.toThrow(CHECK)
    await expect(insert('sales_codes', { ...CODE, count: '1.5' })).rejects.toThrow(BAD_INPUT)
    await expect(insert('sales_codes', { ...CODE, count: 'abc' })).rejects.toThrow(BAD_INPUT)
    await expect(insert('sales_codes', { ...CODE, count: null })).rejects.toThrow(NOT_NULL)
    await insert('sales_codes', { ...CODE, code: 'C1', count: 0 })
    await insert('sales_codes', { ...CODE, code: 'C2', count: 10_000_000 })
    expect(await rows('select * from public.sales_codes')).toHaveLength(2)
  })

  it('AC-004.3 amount는 0 이상 정수이거나 null이다', async () => {
    await expect(insert('sales_codes', { ...CODE, amount: -1 })).rejects.toThrow(CHECK)
    await expect(insert('sales_codes', { ...CODE, amount: '1.5' })).rejects.toThrow(BAD_INPUT)
    await expect(insert('sales_codes', { ...CODE, amount: 'abc' })).rejects.toThrow(BAD_INPUT)
    await insert('sales_codes', { ...CODE, code: 'C1', amount: 0 })
    await insert('sales_codes', { ...CODE, code: 'C2', amount: null })
    await insert('sales_codes', { ...CODE, code: 'C3', amount: 3_000_000_000 })
    expect(await rows('select * from public.sales_codes')).toHaveLength(3)
  })
})

describe('AC-004.3 rx_groups 제약', SLOW, () => {
  beforeEach(() => become(A))

  it.each([
    ['31자', '가'.repeat(31)],
    ['빈 이름', ''],
    ['앞 공백', ' 도수'],
    ['뒤 공백', '도수 '],
    ['줄바꿈', '도수\n치료'],
    ['탭', '도수\t치료'],
    ['제어 문자', '도수\u0001치료'],
    // 화면 검사(src/lib/revenue/treatments.ts)가 믿는 경계: [[:cntrl:]]는 U+0080~U+009F까지다
    ['제어 문자 U+0085', 'a\u0085b'],
    ['제어 문자 U+009F', 'a\u009fb'],
    ['주민번호 모양', '900101-1234567'],
    ['전화번호 모양', '01012345678'],
    ['숫자 여섯 자리', '123456'],
    ['글자 사이 숫자 여섯 자리', '묶음123456묶음'],
  ])('AC-004.3 이름이 %s이면 거부된다', async (_label, name) => {
    await expect(insert('rx_groups', { ...GROUP, name })).rejects.toThrow(CHECK)
    expect(await rows('select * from public.rx_groups')).toEqual([])
  })

  it.each([
    ['30자', '가'.repeat(30)],
    ['숫자 다섯 자리', '12345'],
    ['가운데 공백', '도수 치료'],
    ['끊긴 숫자', '123 456'],
    ['로마자 사이 공백', 'a b'],
    ['제어 문자 바로 다음 글자 U+00A0', 'a b'],
  ])('AC-004.3 이름이 %s면 들어간다', async (_label, name) => {
    await insert('rx_groups', { ...GROUP, name })
    expect(await rows('select name from public.rx_groups')).toEqual([{ name }])
  })

  it('AC-004.3 같은 병원의 같은 이름은 COMMIT에서 거부되고 두 번째 줄은 남지 않는다', async () => {
    await insert('rx_groups', GROUP)
    await db.exec('begin')
    await insert('rx_groups', GROUP) // 겹침 검사가 미뤄져 있어 여기서는 지나간다
    await expect(db.exec('commit')).rejects.toThrow(UNIQUE)
    expect(await groupNames()).toEqual(['도수치료'])
  })

  it('AC-004.3 같은 이름 넣기는 한 문장으로 보내도(자동 COMMIT) 거부된다', async () => {
    await insert('rx_groups', GROUP)
    await expect(insert('rx_groups', GROUP)).rejects.toThrow(UNIQUE)
    expect(await groupNames()).toEqual(['도수치료'])
  })

  it('AC-004.3 다른 병원과는 이름이 같아도 된다', async () => {
    await seed('rx_groups', B)
    await become(A)
    await insert('rx_groups', GROUP)
    expect(await groupNames()).toEqual(['도수치료', '도수치료'])
  })

  it.each([
    ['null 칸만', [null]],
    ['null 칸 섞임', ['MT001', null]],
    ['예약 코드 _REST', ['MT001', '_REST']],
    ['빈 코드', ['']],
    ['공백 있는 코드', ['MT 001']],
    ['31자 코드', ['A'.repeat(31)]],
    ['1,001개', Array.from({ length: 1001 }, (_, i) => `C${i}`)],
  ])('AC-004.3 AC-002.2 codes가 %s면 거부된다', async (_label, codes) => {
    await expect(insert('rx_groups', { ...GROUP, codes })).rejects.toThrow(CHECK)
    expect(await rows('select * from public.rx_groups')).toEqual([])
  })

  it.each([
    ['빈 목록', []],
    ['한글 코드', ['가나다', 'A-1_2.3']],
    ['1,000개', Array.from({ length: 1000 }, (_, i) => `C${i}`)],
  ])('AC-004.3 AC-002.2 codes가 %s면 들어간다', async (_label, codes) => {
    await insert('rx_groups', { ...GROUP, codes })
    expect(await rows('select codes from public.rx_groups')).toEqual([{ codes }])
  })

  it('AC-004.3 codes·이름·순서는 null일 수 없고 codes를 빼면 빈 목록이다', async () => {
    await expect(insert('rx_groups', { ...GROUP, codes: null })).rejects.toThrow(NOT_NULL)
    await expect(insert('rx_groups', { ...GROUP, name: null })).rejects.toThrow(NOT_NULL)
    await expect(insert('rx_groups', { ...GROUP, sort_order: null })).rejects.toThrow(NOT_NULL)
    await insert('rx_groups', { name: '기본값' })
    expect(await rows('select codes, sort_order from public.rx_groups')).toEqual([{ codes: [], sort_order: 0 }])
  })

  it('AC-004.3 sort_order는 0~999다', async () => {
    await expect(insert('rx_groups', { ...GROUP, sort_order: -1 })).rejects.toThrow(CHECK)
    await expect(insert('rx_groups', { ...GROUP, sort_order: 1000 })).rejects.toThrow(CHECK)
    await insert('rx_groups', { ...GROUP, name: '처음', sort_order: 0 })
    await insert('rx_groups', { ...GROUP, name: '끝', sort_order: 999 })
    expect(await groupNames()).toEqual(['끝', '처음'])
  })
})

describe('AC-004.4 DB가 채우는 칸', SLOW, () => {
  it.each(TABLES)('AC-004.4 AC-004.5 %s에 hospital_id를 빼고 넣으면 내 병원이 채워진다', async (table) => {
    await become(A)
    expect(await insert(table, SEED[table], 'returning hospital_id')).toEqual([{ hospital_id: HOSPITAL[A] }])
  })

  it('AC-004.4 승인된 사용자의 my_hospital_id()는 자기 병원이다', async () => {
    await become(B)
    expect(await rows('select public.my_hospital_id() as id')).toEqual([{ id: HOSPITAL[B] }])
  })

  it('AC-004.4 넣을 때 fetched_at은 DB 시각이다', async () => {
    await become(A)
    await insert('sales_days', NORMAL_DAY)
    await insert('sales_codes', CODE)
    for (const table of ['sales_days', 'sales_codes']) {
      expect(await rows(`select fetched_at > now() - interval '1 hour' as fresh from public.${table}`)).toEqual([{ fresh: true }])
    }
  })

  it('AC-004.4 고치면 fetched_at이 DB 시각으로 바뀐다', async () => {
    await seed('sales_days', A, { ...NORMAL_DAY, fetched_at: '2001-01-01T00:00:00Z' })
    await become(A)
    expect(
      await rows(`update public.sales_days set total = 7 returning total, fetched_at > now() - interval '1 hour' as fresh`),
    ).toEqual([{ total: 7, fresh: true }])
  })

  it('AC-004.4 upsert의 고치기로도 fetched_at이 DB 시각으로 바뀐다', async () => {
    await seed('sales_days', A, { ...NORMAL_DAY, fetched_at: '2001-01-01T00:00:00Z' })
    await become(A)
    await upsertDay({ ...NORMAL_DAY, total: 7 })
    expect(await rows(`select total, fetched_at > now() - interval '1 hour' as fresh from public.sales_days`)).toEqual([
      { total: 7, fresh: true },
    ])
  })

  it('AC-004.4 AC-004.5 함수 실행 권한: my_hospital_id·rx_group_codes_ok는 authenticated만, 트리거 함수 둘은 아무도 없다', async () => {
    const can = async (role: string, fn: string) =>
      (await rows(`select has_function_privilege($1, $2, 'EXECUTE') as ok`, [role, fn]))[0].ok
    expect(await can('anon', 'public.my_hospital_id()')).toBe(false)
    expect(await can('authenticated', 'public.my_hospital_id()')).toBe(true)
    expect(await can('anon', 'public.rx_group_codes_ok(text[])')).toBe(false)
    expect(await can('authenticated', 'public.rx_group_codes_ok(text[])')).toBe(true)
    for (const trigger of ['public.sales_touch_fetched_at()', 'public.touch_updated_at()']) {
      expect(await can('anon', trigger)).toBe(false)
      expect(await can('authenticated', trigger)).toBe(false)
    }
    await becomeAnon()
    await expect(rows('select public.my_hospital_id()')).rejects.toThrow(DENIED)
    await expect(rows(`select public.rx_group_codes_ok('{}')`)).rejects.toThrow(DENIED)
  })

  it('AC-004.5 CHECK가 부르는 rx_group_codes_ok는 부른 사람 권한으로 돌아 authenticated의 넣기·고치기가 된다', async () => {
    await become(A)
    expect(await rows(`select public.rx_group_codes_ok('{MT001}') as ok`)).toEqual([{ ok: true }])
    const [added] = await insert('rx_groups', GROUP, 'returning id, codes')
    expect(added.codes).toEqual(GROUP.codes)
    expect(await rows('update public.rx_groups set codes = $1 where id = $2 returning codes', [['MT002'], added.id])).toEqual([
      { codes: ['MT002'] },
    ])
  })

  it('AC-004.4 AC-004.5 함수 성질: 정의자 권한은 my_hospital_id뿐이고 모두 search_path가 비어 있다', async () => {
    const list = await rows(
      `select proname, prosecdef, proconfig::text as config from pg_proc
       where pronamespace = 'public'::regnamespace and proname = any($1::text[]) order by proname`,
      [['my_hospital_id', 'rx_group_codes_ok', 'sales_touch_fetched_at', 'save_rx_groups', 'touch_updated_at']],
    )
    expect(list.map((f) => [f.proname, f.prosecdef])).toEqual([
      ['my_hospital_id', true],
      ['rx_group_codes_ok', false],
      ['sales_touch_fetched_at', false],
      ['save_rx_groups', false],
      ['touch_updated_at', false],
    ])
    for (const fn of list) expect(fn.config).toBe('{"search_path=\\"\\""}')
  })
})

describe('AC-004.4 AC-004.5 다른 갈래가 공용 함수를 먼저 만든 DB (갈래 규칙 C1)', SLOW, () => {
  it('AC-004.4 AC-004.5 migration 파일에 공용 함수 두 개가 C1 글자 그대로 있다', () => {
    expect(REVENUE_MIGRATION).toContain(C1_MY_HOSPITAL_ID)
    expect(REVENUE_MIGRATION).toContain(C1_TOUCH_UPDATED_AT)
  })

  it('AC-004.4 AC-004.5 같은 글자의 my_hospital_id()·touch_updated_at()이 이미 있어도 오류 없이 되고 함수도 표도 제대로 돈다', async () => {
    const main = db
    const other = await PGlite.create()
    db = other
    try {
      await setUp(other)
      await other.exec(C1_MY_HOSPITAL_ID)
      await other.exec(C1_TOUCH_UPDATED_AT)
      // 다른 갈래가 그 함수에 기대 만든 표. create or replace가 이 표를 건드리지 않아야 한다
      await other.exec(`
        create table public.other_branch (
          hospital_id uuid not null default public.my_hospital_id(),
          updated_at timestamptz not null default now()
        );
        create trigger other_branch_updated_at before update on public.other_branch
          for each row execute function public.touch_updated_at();
      `)
      const definitions = () =>
        rows(`select pg_get_functiondef('public.my_hospital_id()'::regprocedure) as mine,
                     pg_get_functiondef('public.touch_updated_at()'::regprocedure) as touch`)
      const before = await definitions()

      await other.exec(REVENUE_MIGRATION)
      expect(await definitions()).toEqual(before)

      // 이 파일이 먼저 들어가고 다른 갈래가 나중에 와도 같다
      await other.exec(C1_MY_HOSPITAL_ID)
      await other.exec(C1_TOUCH_UPDATED_AT)
      expect(await definitions()).toEqual(before)

      await resetData()
      await seed('rx_groups', A, { ...GROUP, updated_at: '2001-01-01T00:00:00Z' })
      await become(A)
      expect(await insert('sales_days', NORMAL_DAY, 'returning hospital_id')).toEqual([{ hospital_id: HOSPITAL[A] }])
      expect(
        await rows(`update public.rx_groups set sort_order = 1 returning updated_at > now() - interval '1 hour' as fresh`),
      ).toEqual([{ fresh: true }])

      // 다른 갈래 표: 함수를 cascade로 지웠다 다시 만들었다면 기본값·트리거가 사라져 여기서 걸린다
      expect(
        await rows(
          `insert into public.other_branch (updated_at) values ('2001-01-01T00:00:00Z')
           returning hospital_id, updated_at < timestamptz '2002-01-01' as old`,
        ),
      ).toEqual([{ hospital_id: HOSPITAL[A], old: true }])
      expect(
        await rows(
          `update public.other_branch set updated_at = updated_at
           returning hospital_id, updated_at > now() - interval '1 hour' as fresh`,
        ),
      ).toEqual([{ hospital_id: HOSPITAL[A], fresh: true }])
    } finally {
      db = main
      await other.close()
    }
  })
})

describe('AC-004.5 rx_groups는 내 줄만, DB가 채우는 칸은 건드리지 못한다', SLOW, () => {
  it('AC-004.5 A는 자기 묶음을 넣고 읽고 고치고 지운다', async () => {
    await become(A)
    const [added] = await insert('rx_groups', GROUP, 'returning *')
    expect(added).toMatchObject({ hospital_id: HOSPITAL[A], name: '도수치료', codes: ['MT001'], sort_order: 0 })
    expect(typeof added.id).toBe('string')
    expect(
      await rows(`update public.rx_groups set name = '도수', codes = $1, sort_order = 5 where id = $2 returning name, codes, sort_order`, [
        ['MT002', 'MT003'],
        added.id,
      ]),
    ).toEqual([{ name: '도수', codes: ['MT002', 'MT003'], sort_order: 5 }])
    expect(await rows('delete from public.rx_groups where id = $1 returning id', [added.id])).toEqual([{ id: added.id }])
    expect(await rows('select * from public.rx_groups')).toEqual([])
  })

  it('AC-004.5 B 묶음은 id로 골라도 안 보이고 안 바뀌고 안 지워진다', async () => {
    const theirs = await seed('rx_groups', B)
    const before = await snapshot('rx_groups')
    await become(A)
    expect(await rows('select * from public.rx_groups where id = $1', [theirs.id])).toEqual([])
    expect(await rows(`update public.rx_groups set name = '바꿈' where id = $1 returning id`, [theirs.id])).toEqual([])
    expect(await rows('delete from public.rx_groups where id = $1 returning id', [theirs.id])).toEqual([])
    expect(await snapshot('rx_groups')).toEqual(before)
  })

  it.each([
    ['id', '00000000-0000-4000-8000-000000000123'],
    ['updated_at', '2001-01-01T00:00:00Z'],
  ])('AC-004.5 %s는 직접 넣거나 바꿀 수 없다', async (column, value) => {
    await become(A)
    await expect(insert('rx_groups', { ...GROUP, [column]: value })).rejects.toThrow(DENIED)
    await insert('rx_groups', GROUP)
    await expect(rows(`update public.rx_groups set ${column} = $1`, [value])).rejects.toThrow(DENIED)
  })

  it('AC-004.5 고치면 updated_at이 DB 시각으로 바뀐다', async () => {
    await seed('rx_groups', A, { ...GROUP, updated_at: '2001-01-01T00:00:00Z' })
    await become(A)
    expect(
      await rows(`update public.rx_groups set sort_order = 1 returning sort_order, updated_at > now() - interval '1 hour' as fresh`),
    ).toEqual([{ sort_order: 1, fresh: true }])
  })
})

describe('AC-004.6 save_rx_groups 입력 거부', SLOW, () => {
  it.each([
    ['null', 'null'],
    ['JSON null', `'null'::jsonb`],
    ['배열 아닌 객체 {}', `'{}'::jsonb`],
    ['글자', `'"x"'::jsonb`],
    ['숫자', `'1'::jsonb`],
  ])('AC-004.6 groups가 %s이면 거부되고 표는 그대로다', async (_label, value) => {
    await seed('rx_groups', A)
    const before = await snapshot('rx_groups')
    await become(A)
    await expect(rows(`select * from public.save_rx_groups(groups := ${value})`)).rejects.toThrow(BAD_GROUPS)
    expect(await snapshot('rx_groups')).toEqual(before)
  })

  const many = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `묶음${i}`, codes: [], sort_order: i }))

  it('AC-004.6 51개는 거부되고 50개는 된다', async () => {
    await become(A)
    await expect(save(many(51))).rejects.toThrow(BAD_GROUPS)
    expect(await groupNames()).toEqual([])
    await become(A)
    expect(await save(many(50))).toHaveLength(50)
    expect(await groupNames()).toHaveLength(50)
  })

  it('AC-004.6 anon은 실행하지 못한다', async () => {
    await becomeAnon()
    await expect(rows(SAVE, ['[]'])).rejects.toThrow(DENIED)
    await operator()
    expect(await rows(`select has_function_privilege('anon', 'public.save_rx_groups(jsonb)', 'EXECUTE') as ok`)).toEqual([
      { ok: false },
    ])
    expect(
      await rows(`select has_function_privilege('authenticated', 'public.save_rx_groups(jsonb)', 'EXECUTE') as ok`),
    ).toEqual([{ ok: true }])
  })

  it.each([
    ['승인 대기', C],
    ['거절', D],
  ])('AC-004.6 %s 사용자는 넣지 못하고 빈 목록을 보내도 자기 줄이 지워지지 않는다', async (_label, user) => {
    await seed('rx_groups', user)
    const before = await snapshot('rx_groups')
    await become(user)
    await expect(save(PROPOSALS)).rejects.toThrow(RLS)
    await become(user)
    expect(await save([])).toEqual([])
    expect(await snapshot('rx_groups')).toEqual(before)
  })
})

describe('AC-004.6 save_rx_groups 저장', SLOW, () => {
  beforeEach(() => become(A))

  it('AC-004.6 제안 다섯 개(id 없음)를 저장하면 다섯 줄이 내 병원에 생기고 순서대로 돌려준다', async () => {
    const saved = await save([...PROPOSALS].reverse())
    expect(saved.map((g) => g.name)).toEqual(PROPOSALS.map((g) => g.name))
    expect(saved[0]).toMatchObject({ hospital_id: HOSPITAL[A], codes: ['MT001', 'MT002'], sort_order: 0 })
    expect(new Set(saved.map((g) => g.id)).size).toBe(5)
    await operator()
    expect(await rows('select hospital_id, count(*)::int as n from public.rx_groups group by 1')).toEqual([
      { hospital_id: HOSPITAL[A], n: 5 },
    ])
  })

  // 화면 저장소는 새 묶음에도 id 칸을 늘 null로 보낸다
  it('AC-004.6 id: null 다섯 개는 다섯 줄이 되고 id가 모두 다르다', async () => {
    const saved = await save(PROPOSALS.map((g) => ({ id: null, ...g })))
    expect(saved).toHaveLength(5)
    expect(new Set(saved.map((g) => g.id)).size).toBe(5)
    expect(await groupNames()).toHaveLength(5)
  })

  it('AC-004.6 있는 id 하나와 id: null 하나를 함께 보내면 있던 줄은 id 그대로 남고 새 줄이 더해진다', async () => {
    const kept = await seed('rx_groups', A, { name: '둘 줄', codes: ['K1'], sort_order: 0 })
    await become(A)
    const saved = await save([
      { id: kept.id, name: '둘 줄', codes: ['K1'], sort_order: 0 },
      { id: null, name: '새 묶음', codes: ['N1'], sort_order: 1 },
    ])
    expect(saved.map((g) => [g.name, g.codes])).toEqual([
      ['둘 줄', ['K1']],
      ['새 묶음', ['N1']],
    ])
    expect(saved[0].id).toBe(kept.id)
    expect(saved[1].id).not.toBe(kept.id)
    expect(await groupNames()).toEqual(['둘 줄', '새 묶음'])
  })

  it('AC-004.6 다섯 개 가운데 하나의 이름이 31자면 오류이고 표는 그대로다(0줄)', async () => {
    const bad = PROPOSALS.map((g, i) => (i === 4 ? { ...g, name: '가'.repeat(31) } : g))
    await expect(save(bad)).rejects.toThrow(CHECK)
    expect(await groupNames()).toEqual([])
  })

  it('AC-004.6 한 문장으로 보내도(자동 COMMIT) 앞의 네 줄이 남지 않는다', async () => {
    const bad = PROPOSALS.map((g, i) => (i === 4 ? { ...g, name: '가'.repeat(31) } : g))
    await expect(rows(SAVE, [JSON.stringify(bad)])).rejects.toThrow(CHECK)
    expect(await groupNames()).toEqual([])
  })

  // 31자 이름은 고리 안에서 실패해 지움까지 가지 않는다. 지움이 돈 뒤 COMMIT에서 실패하는 길은 아래 '남긴 묶음과 같은 이름' 시험이 본다
  it('AC-004.6 고리 안에서 실패한 저장은 있던 줄의 고침을 되돌린다(뺄 줄도 그대로다)', async () => {
    const kept = await seed('rx_groups', A, { name: '둘 줄', codes: ['K1'], sort_order: 0 })
    await seed('rx_groups', A, { name: '뺄 줄', codes: ['K2'], sort_order: 1 })
    const before = await snapshot('rx_groups')
    await become(A)
    await expect(
      save([
        { id: kept.id, name: '고친 이름', codes: ['K9'], sort_order: 5 },
        { name: '가'.repeat(31), codes: [], sort_order: 6 },
      ]),
    ).rejects.toThrow(CHECK)
    expect(await snapshot('rx_groups')).toEqual(before)
  })

  it('AC-004.6 이름을 고친 다음 다시 보낸 다섯 개는 다섯 줄이다(앞선 실패의 조각이 겹치지 않는다)', async () => {
    const bad = PROPOSALS.map((g, i) => (i === 4 ? { ...g, name: '가'.repeat(31) } : g))
    await expect(save(bad)).rejects.toThrow(CHECK)
    await become(A)
    expect(await save(PROPOSALS)).toHaveLength(5)
    expect(await groupNames()).toHaveLength(5)
  })

  it('AC-004.6 첫 호출이 실패한 뒤 같은 목록을 다시 보내면 다섯 줄이다', async () => {
    await become(C) // 아직 승인 대기라 첫 호출은 실패한다
    await expect(save(PROPOSALS)).rejects.toThrow(RLS)
    await operator()
    await db.query(`update public.hospitals set status = 'approved' where owner_id = $1`, [C])
    await become(C)
    expect(await save(PROPOSALS)).toHaveLength(5)
    expect(await groupNames()).toHaveLength(5)
  })

  it('AC-004.6 코드·순서가 제약에 걸려도 표는 그대로다', async () => {
    for (const bad of [
      { name: '새 묶음', codes: ['MT001', null], sort_order: 0 },
      { name: '새 묶음', codes: ['_REST'], sort_order: 0 },
      { name: '새 묶음', codes: ['MT 001'], sort_order: 0 },
      { name: '새 묶음', codes: [], sort_order: 1000 },
    ]) {
      await become(A)
      await expect(save([bad])).rejects.toThrow(CHECK)
      expect(await groupNames()).toEqual([])
    }
  })

  it('AC-004.6 이름·순서가 빠지거나 코드·id 모양이 틀리면 거부되고 표는 그대로다', async () => {
    for (const [bad, error] of [
      [{ codes: [], sort_order: 0 }, NOT_NULL],
      [{ name: '새 묶음', codes: [] }, NOT_NULL],
      [{ name: '새 묶음', codes: 'MT001', sort_order: 0 }, BAD_GROUPS],
      [{ id: 'not-a-uuid', name: '새 묶음', codes: [], sort_order: 0 }, BAD_INPUT],
    ] as const) {
      await become(A)
      await expect(save([bad])).rejects.toThrow(error)
      expect(await groupNames()).toEqual([])
    }
  })

  // 빠진 codes가 조용히 빈 목록이 되면 손으로 만든 묶음의 코드가 날아간다. 이름·순서가 빠질 때처럼 거부한다
  it.each([
    ['키가 없으면', {}],
    ['JSON null이면', { codes: null }],
  ])('AC-004.6 codes가 %s 있던 묶음을 고칠 때도 새 묶음을 넣을 때도 거부되고 표는 그대로다', async (_label, codes) => {
    const kept = await seed('rx_groups', A, { name: '둘 줄', codes: ['K1', 'K2'], sort_order: 0 })
    const before = await snapshot('rx_groups')
    for (const bad of [
      [{ id: kept.id, name: '고친 이름', sort_order: 5, ...codes }],
      [
        { id: kept.id, name: '둘 줄', codes: ['K1', 'K2'], sort_order: 0 },
        { name: '새 묶음', sort_order: 1, ...codes },
      ],
    ]) {
      await become(A)
      await expect(save(bad)).rejects.toThrow(BAD_GROUPS)
      expect(await snapshot('rx_groups')).toEqual(before)
    }
  })

  it('AC-004.6 groups에 hospital_id·updated_at을 넣어도 무시되고 내 병원이다', async () => {
    const [saved] = await save([
      { hospital_id: HOSPITAL[B], updated_at: '2001-01-01T00:00:00Z', name: '새 묶음', codes: [], sort_order: 0 },
    ])
    expect(saved.hospital_id).toBe(HOSPITAL[A])
    await operator()
    expect(await rows(`select updated_at > now() - interval '1 hour' as fresh from public.rx_groups`)).toEqual([{ fresh: true }])
  })

  it('AC-004.6 id 있는 내 묶음은 고친다(id 그대로, 이름·코드·순서 바뀜, updated_at 바뀜)', async () => {
    const mine = await seed('rx_groups', A, { ...GROUP, updated_at: '2001-01-01T00:00:00Z' })
    await become(A)
    const [saved] = await save([{ id: mine.id, name: '도수', codes: ['MT002'], sort_order: 7 }])
    expect(saved).toMatchObject({ id: mine.id, hospital_id: HOSPITAL[A], name: '도수', codes: ['MT002'], sort_order: 7 })
    await operator()
    expect(await rows(`select updated_at > now() - interval '1 hour' as fresh from public.rx_groups`)).toEqual([{ fresh: true }])
  })

  it('AC-004.6 남긴 묶음과 같은 이름의 새 묶음은 COMMIT에서 오류이고 표는 그대로다(이름으로 덮어쓰지 않고, 목록에서 뺀 줄의 지움도 되돌린다)', async () => {
    const kept = await seed('rx_groups', A)
    const dropped = await seed('rx_groups', A, { name: '뺄 줄', codes: ['K2'], sort_order: 2 })
    const before = await snapshot('rx_groups')
    await become(A)
    const returned = await expectSaveFailsAtCommit([
      { id: kept.id, name: GROUP.name, codes: GROUP.codes, sort_order: 0 },
      { name: GROUP.name, codes: ['NEW01'], sort_order: 1 },
    ])
    expect(returned.map((g) => g.id)).not.toContain(dropped.id) // COMMIT 전에 지움이 정말 돌았다
    expect(await snapshot('rx_groups')).toEqual(before) // 뺀 줄이 돌아왔다
  })

  it('AC-004.6 새 묶음 둘의 이름이 같아도 COMMIT에서 오류이고 표는 그대로다', async () => {
    await expectSaveFailsAtCommit([
      { name: '같은 이름', codes: [], sort_order: 0 },
      { name: '같은 이름', codes: [], sort_order: 1 },
    ])
    expect(await groupNames()).toEqual([])
  })

  it.each([
    ['새 A가 먼저', true],
    ['새 A가 나중', false],
  ])('AC-004.6 목록에서 뺀 묶음 A와 새 묶음 A를 함께 보내면 된다(%s)', async (_label, newFirst) => {
    const oldA = await seed('rx_groups', A, { name: 'A', codes: ['OLD'], sort_order: 0 })
    const keptB = await seed('rx_groups', A, { name: 'B', codes: ['KEEP'], sort_order: 1 })
    await become(A)
    const newA = { name: 'A', codes: ['NEW'], sort_order: 0 }
    const b = { id: keptB.id, name: 'B', codes: ['KEEP'], sort_order: 1 }
    await save(newFirst ? [newA, b] : [b, newA])
    await operator()
    const list = await rows('select id, name, codes from public.rx_groups order by name')
    expect(list.map((g) => [g.name, g.codes])).toEqual([
      ['A', ['NEW']],
      ['B', ['KEEP']],
    ])
    expect(list[0].id).not.toBe(oldA.id)
    expect(list[1].id).toBe(keptB.id)
  })

  it.each([
    ['A 먼저', true],
    ['B 먼저', false],
  ])('AC-004.6 A↔B 이름 맞바꾸기가 COMMIT까지 된다(%s)', async (_label, aFirst) => {
    const a = await seed('rx_groups', A, { name: 'A', codes: ['CA'], sort_order: 0 })
    const b = await seed('rx_groups', A, { name: 'B', codes: ['CB'], sort_order: 1 })
    await become(A)
    const toB = { id: a.id, name: 'B', codes: ['CA'], sort_order: 0 }
    const toA = { id: b.id, name: 'A', codes: ['CB'], sort_order: 1 }
    await save(aFirst ? [toB, toA] : [toA, toB])
    await operator()
    expect(await rows('select id, name from public.rx_groups order by name')).toEqual([
      { id: b.id, name: 'A' },
      { id: a.id, name: 'B' },
    ])
  })

  it('AC-004.6 목록에서 뺀 내 묶음은 지워지고 빈 목록이면 내 묶음이 모두 지워지지만 B 묶음은 그대로다', async () => {
    const kept = await seed('rx_groups', A, { name: '둘 줄', codes: [], sort_order: 0 })
    await seed('rx_groups', A, { name: '뺄 줄', codes: [], sort_order: 1 })
    await seed('rx_groups', B, { name: '남의 줄', codes: [], sort_order: 0 })
    await become(A)
    const saved = await save([{ id: kept.id, name: '둘 줄', codes: [], sort_order: 0 }])
    expect(saved.map((g) => g.name)).toEqual(['둘 줄'])
    expect(await groupNames()).toEqual(['남의 줄', '둘 줄'])
    await become(A)
    expect(await save([])).toEqual([])
    expect(await groupNames()).toEqual(['남의 줄'])
  })

  it('AC-004.6 B 병원의 id를 넣으면 오류이고 B 줄도 내 줄도 그대로다', async () => {
    const theirs = await seed('rx_groups', B, { name: '남의 줄', codes: ['THEIR'], sort_order: 0 })
    const mine = await seed('rx_groups', A, { name: '내 줄', codes: ['MINE'], sort_order: 0 })
    const before = await snapshot('rx_groups')
    await become(A)
    await expect(
      save([
        { id: mine.id, name: '고친 줄', codes: [], sort_order: 1 },
        { id: theirs.id, name: '빼앗은 줄', codes: [], sort_order: 2 },
      ]),
    ).rejects.toThrow(NOT_MINE)
    expect(await snapshot('rx_groups')).toEqual(before)
  })

  it('AC-004.6 없는 id도 오류이고 표는 그대로다', async () => {
    await expect(save([{ id: '00000000-0000-4000-8000-000000000123', name: '새 묶음', codes: [], sort_order: 0 }])).rejects.toThrow(
      NOT_MINE,
    )
    expect(await groupNames()).toEqual([])
  })
})

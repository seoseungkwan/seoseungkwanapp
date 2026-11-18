import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

// 통계 '이번 달 목표' 표 stats_goals의 칸·제약·RLS·권한·두 번 붙여 넣기 (stats-insights REQ-6102 AC-6102.1, TASK-1).
// claimDayCloses.rls.test.ts·formNotices.rls.test.ts와 같은 방법: 진짜 Postgres(PGlite, WASM)에서 운영자가 SQL 편집기에 붙일 파일을 그대로 돌린다.
// 실제 Supabase에는 붙지 않는다. Supabase가 미리 갖춘 것(역할·auth 스키마·새 표·함수의 기본 권한)만 흉내 낸다. 숫자는 지어낸 값이다
const fileOf = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))
const AUTH_MIGRATION = readFileSync(fileOf('./migrations/20261028000000_auth.sql'), 'utf-8')
const GOALS_PATH = fileOf('./migrations/20261118000000_stats_goals.sql')
// 파일이 아직 없으면 빈 글자로 돌아, 시험마다 '표가 없다'로 실패한다(무엇이 빠졌는지 시험별로 보인다)
const GOALS_MIGRATION = existsSync(GOALS_PATH) ? readFileSync(GOALS_PATH, 'utf-8') : ''
// 주석을 뺀 SQL 글자
const GOALS_SQL = GOALS_MIGRATION.replace(/--.*$/gm, '')

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

// 갈래 규칙 C1: 다른 갈래와 글자까지 같아야 어느 순서로 붙여 넣어도 된다
const C1_MY_HOSPITAL_ID = `create or replace function public.my_hospital_id() returns uuid language sql stable security definer set search_path = ''
  as $$ select h.id from public.hospitals h where h.owner_id = (select auth.uid()) and h.status = 'approved' $$;
revoke execute on function public.my_hospital_id() from public, anon;
grant execute on function public.my_hospital_id() to authenticated;
`

const A = '00000000-0000-4000-8000-00000000000a' // 승인된 병원 A
const B = '00000000-0000-4000-8000-00000000000b' // 승인된 다른 병원 B
const PENDING = '00000000-0000-4000-8000-00000000000c' // 승인 대기
const REJECTED = '00000000-0000-4000-8000-00000000000d' // 거절
const NO_HOSPITAL = '00000000-0000-4000-8000-00000000000e' // 병원 줄이 없는 사용자
const STATUS: Record<string, string | null> = { [A]: 'approved', [B]: 'approved', [PENDING]: 'pending', [REJECTED]: 'rejected', [NO_HOSPITAL]: null }

type Row = Record<string, unknown>

const TABLE = 'public.stats_goals'
const MONTH = '2026-11'
const OTHER_MONTH = '2026-10'
const SENT = ['month', 'new_patients', 'revenue', 'visits'] // 사용자가 보낼 수 있는 칸(그 밖은 칸 권한이 없다), 이름 순
const INSERT = `insert into ${TABLE} (month, visits, new_patients, revenue) values ($1, $2, $3, $4)`

// PGlite 첫 실행(WASM 불러오기)이 느린 PC·CI에서도 흔들리지 않게
const SLOW = { timeout: 60_000 }
const DENIED = /permission denied/
const CHECK = /check constraint/
const RLS = /row-level security/

let db: PGlite
let hospital: Record<string, string> = {}

async function migrate(target: PGlite) {
  await target.exec(SUPABASE_MOCK)
  await target.exec(AUTH_MIGRATION)
  await target.exec(GOALS_MIGRATION)
}

async function operator() {
  await db.exec('reset role; reset request.jwt.claims')
}

// 로그인 토큰: sub = uid
async function become(user: string) {
  await operator()
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: user })])
  await db.exec('set role authenticated')
}

async function becomeAnon() {
  await operator()
  await db.exec('set role anon')
}

async function rows(sql: string, params: unknown[] = [], target: PGlite = db) {
  return (await target.query<Row>(sql, params)).rows
}

// 운영자가 그 병원 목표 줄을 넣는다(칸 권한·RLS를 건너뛴다)
async function seed(owner: string, month: string, visits: number | null, newPatients: number | null, revenue: number | null) {
  await operator()
  await db.query(`insert into ${TABLE} (hospital_id, month, visits, new_patients, revenue) values ($1, $2, $3, $4, $5)`, [
    hospital[owner],
    month,
    visits,
    newPatients,
    revenue,
  ])
}

// 운영자 눈으로 본 표 전체(병원·달 차례)
async function snapshot() {
  await operator()
  return rows(`select hospital_id, month, visits, new_patients, revenue from ${TABLE} order by hospital_id, month`)
}

beforeAll(async () => {
  db = await PGlite.create()
  await migrate(db)
}, 120_000)

afterAll(async () => {
  await db.close()
})

// 시험마다 빈 표에서 시작한다(병원·목표 줄은 auth.users를 따라 함께 비워진다). 운영자(superuser)는 RLS를 건너뛴다
beforeEach(async () => {
  await operator()
  await db.exec('truncate auth.users cascade')
  hospital = {}
  for (const [user, status] of Object.entries(STATUS)) {
    await db.query('insert into auth.users (id, email) values ($1, $2)', [user, `${user}@fake.test`])
    if (status === null) continue
    const [row] = await rows(
      `insert into public.hospitals (owner_id, name, applicant_name, email, status)
       values ($1, '가짜병원', '가짜신청자', $2, $3) returning id`,
      [user, `${user}@fake.test`, status],
    )
    hospital[user] = row!.id as string
  }
})

describe('AC-6102.1 표 모양', SLOW, () => {
  it('AC-6102.1: 칸은 hospital_id·month·visits·new_patients·revenue 다섯뿐이고 세 숫자만 비워 둘 수 있다', async () => {
    const found = await rows(
      `select column_name, udt_name, is_nullable from information_schema.columns
       where table_schema = 'public' and table_name = 'stats_goals' order by ordinal_position`,
    )
    expect(found).toEqual([
      { column_name: 'hospital_id', udt_name: 'uuid', is_nullable: 'NO' },
      { column_name: 'month', udt_name: 'text', is_nullable: 'NO' },
      { column_name: 'visits', udt_name: 'int4', is_nullable: 'YES' },
      { column_name: 'new_patients', udt_name: 'int4', is_nullable: 'YES' },
      { column_name: 'revenue', udt_name: 'int8', is_nullable: 'YES' },
    ])
  })

  it('AC-6102.1: hospital_id 기본값은 my_hospital_id()이고 다른 칸은 기본값이 없다', async () => {
    const found = await rows(
      `select column_name, column_default from information_schema.columns
       where table_schema = 'public' and table_name = 'stats_goals' order by ordinal_position`,
    )
    expect(found).toEqual([
      { column_name: 'hospital_id', column_default: expect.stringMatching(/^(public\.)?my_hospital_id\(\)$/) },
      { column_name: 'month', column_default: null },
      { column_name: 'visits', column_default: null },
      { column_name: 'new_patients', column_default: null },
      { column_name: 'revenue', column_default: null },
    ])
  })

  it('AC-6102.1: (hospital_id, month)가 기본 키이고 바깥 키는 병원 표 하나이며 병원을 지우면 함께 지운다', async () => {
    const found = await rows(
      `select contype, pg_get_constraintdef(oid) as def, confdeltype from pg_constraint
       where conrelid = to_regclass('public.stats_goals') and contype in ('p', 'f', 'u')
       order by contype`,
    )
    expect(found).toEqual([
      {
        contype: 'f',
        def: expect.stringMatching(/^FOREIGN KEY \(hospital_id\) REFERENCES (public\.)?hospitals\(id\) ON DELETE CASCADE$/),
        confdeltype: 'c',
      },
      { contype: 'p', def: 'PRIMARY KEY (hospital_id, month)', confdeltype: ' ' },
    ])
    await seed(A, MONTH, 3200, null, null)
    await seed(B, MONTH, 100, null, null)
    await operator()
    await db.query('delete from public.hospitals where id = $1', [hospital[A]])
    expect(await snapshot()).toEqual([{ hospital_id: hospital[B], month: MONTH, visits: 100, new_patients: null, revenue: null }])
  })

  it('AC-6102.1: 같은 병원 같은 달 두 줄은 거부되고, 다른 병원은 같은 달을 가질 수 있다', async () => {
    await seed(A, MONTH, 3200, null, null)
    await expect(seed(A, MONTH, 10, null, null)).rejects.toThrow(/duplicate key/)
    await seed(B, MONTH, 10, null, null)
    expect(await snapshot()).toHaveLength(2)
  })

  it('AC-6102.1: RLS가 켜져 있다', async () => {
    expect(await rows(`select relrowsecurity from pg_class where oid = to_regclass('public.stats_goals')`)).toEqual([{ relrowsecurity: true }])
  })
})

describe('AC-6102.1 숫자·달 검사', SLOW, () => {
  it.each<[string, number | null, number | null, number | null]>([
    ['내원 0', 0, null, null],
    ['내원 1,000,000', 1_000_000, null, null],
    ['신환 0', null, 0, null],
    ['신환 1,000,000', null, 1_000_000, null],
    ['매출 0원', null, null, 0],
    ['매출 100,000,000,000원', null, null, 100_000_000_000],
    ['셋 다', 3200, 180, 120_000_000],
  ])('AC-6102.1: %s는 들어간다', async (_name, visits, newPatients, revenue) => {
    await become(A)
    await db.query(INSERT, [MONTH, visits, newPatients, revenue])
    expect(await snapshot()).toEqual([{ hospital_id: hospital[A], month: MONTH, visits, new_patients: newPatients, revenue }])
  })

  it.each<[string, number | null, number | null, number | null]>([
    ['내원 −1', -1, null, null],
    ['내원 1,000,001', 1_000_001, null, null],
    ['신환 −1', null, -1, null],
    ['신환 1,000,001', null, 1_000_001, null],
    ['매출 −1원', null, null, -1],
    ['매출 100,000,000,001원', null, null, 100_000_000_001],
  ])('AC-6102.1: %s는 CHECK가 막는다', async (_name, visits, newPatients, revenue) => {
    await become(A)
    await expect(db.query(INSERT, [MONTH, visits, newPatients, revenue])).rejects.toThrow(CHECK)
    expect(await snapshot()).toEqual([])
  })

  it('AC-6102.1: 세 숫자가 모두 빈 줄은 CHECK가 막는다(빈 목표는 줄을 지운다)', async () => {
    await become(A)
    await expect(db.query(INSERT, [MONTH, null, null, null])).rejects.toThrow(CHECK)
    await seed(A, MONTH, 3200, null, null)
    await become(A)
    await expect(db.query(`update ${TABLE} set visits = null where month = $1`, [MONTH])).rejects.toThrow(CHECK)
    expect(await snapshot()).toEqual([{ hospital_id: hospital[A], month: MONTH, visits: 3200, new_patients: null, revenue: null }])
  })

  it.each(['2026-13', '2026-00', '2026-1', '26-11', '2026-11-01', '2026/11', '', ' 2026-11'])('AC-6102.1: 달 %j는 CHECK가 막는다(YYYY-MM만)', async (month) => {
    await become(A)
    await expect(db.query(INSERT, [month, 1, null, null])).rejects.toThrow(CHECK)
    expect(await snapshot()).toEqual([])
  })
})

describe('AC-6102.1 로그인 안 한 사용자(anon)', SLOW, () => {
  it('AC-6102.1: anon에게 준 표·칸 권한이 하나도 없다(기본 권한을 먼저 거뒀다)', async () => {
    expect(await rows(`select 1 from pg_class where oid = to_regclass('public.stats_goals')`)).toHaveLength(1)
    expect(
      await rows(
        `select privilege_type from information_schema.role_table_grants
         where grantee = 'anon' and table_schema = 'public' and table_name = 'stats_goals'`,
      ),
    ).toEqual([])
    expect(
      await rows(
        `select column_name from information_schema.column_privileges
         where grantee = 'anon' and table_schema = 'public' and table_name = 'stats_goals'`,
      ),
    ).toEqual([])
  })

  it('AC-6102.1: anon은 읽기·넣기·고치기·지우기가 모두 거부되고 줄은 그대로다', async () => {
    await seed(A, MONTH, 3200, 180, 120_000_000)
    const before = await snapshot()
    await becomeAnon()
    await expect(db.query(`select * from ${TABLE}`)).rejects.toThrow(DENIED)
    await expect(db.query(INSERT, [OTHER_MONTH, 1, null, null])).rejects.toThrow(DENIED)
    await expect(db.query(`update ${TABLE} set visits = 1`)).rejects.toThrow(DENIED)
    await expect(db.query(`delete from ${TABLE}`)).rejects.toThrow(DENIED)
    expect(await snapshot()).toEqual(before)
  })
})

describe('AC-6102.1 승인된 병원은 자기 병원 줄만', SLOW, () => {
  it('AC-6102.1: authenticated의 표 전체 권한은 select·delete이고, 넣기·고치기는 달·세 숫자 칸에만 있다', async () => {
    expect(
      await rows(
        `select privilege_type from information_schema.role_table_grants
         where grantee = 'authenticated' and table_schema = 'public' and table_name = 'stats_goals'
         order by privilege_type`,
      ),
    ).toEqual([{ privilege_type: 'DELETE' }, { privilege_type: 'SELECT' }])
    const columns = await rows(
      `select column_name, privilege_type from information_schema.column_privileges
       where grantee = 'authenticated' and table_schema = 'public' and table_name = 'stats_goals'
         and privilege_type in ('INSERT', 'UPDATE')
       order by privilege_type, column_name`,
    )
    expect(columns).toEqual([
      ...SENT.map((column_name) => ({ column_name, privilege_type: 'INSERT' })),
      ...SENT.map((column_name) => ({ column_name, privilege_type: 'UPDATE' })),
    ])
  })

  it('AC-6102.1: hospital_id 없이 달·숫자만 넣으면 DB 기본값으로 내 병원이 들어간다', async () => {
    await become(A)
    expect(await rows(`${INSERT} returning hospital_id, month, visits, new_patients, revenue`, [MONTH, 3200, null, 120_000_000])).toEqual([
      { hospital_id: hospital[A], month: MONTH, visits: 3200, new_patients: null, revenue: 120_000_000 },
    ])
  })

  it('AC-6102.1: 내 병원 줄만 보이고 남의 병원 줄은 안 보인다', async () => {
    await seed(A, MONTH, 3200, null, null)
    await seed(B, MONTH, 999, 99, 9_999)
    await seed(B, OTHER_MONTH, 1, null, null)
    await become(A)
    expect(await rows(`select hospital_id, month, visits from ${TABLE}`)).toEqual([{ hospital_id: hospital[A], month: MONTH, visits: 3200 }])
    await become(B)
    expect(await rows(`select month from ${TABLE} order by month`)).toEqual([{ month: OTHER_MONTH }, { month: MONTH }])
  })

  it('AC-6102.1: 내 줄은 고치고 지우며, 남의 병원 줄은 병원을 골라도 고쳐지거나 지워지지 않는다', async () => {
    await seed(A, MONTH, 3200, null, null)
    await seed(B, MONTH, 999, null, null)
    await become(A)
    expect(await rows(`update ${TABLE} set visits = 1 where hospital_id = $1 returning month`, [hospital[B]])).toEqual([])
    expect(await rows(`update ${TABLE} set visits = 3300, revenue = 5 where month = $1 returning hospital_id, visits, revenue`, [MONTH])).toEqual([
      { hospital_id: hospital[A], visits: 3300, revenue: 5 },
    ])
    expect((await db.query(`delete from ${TABLE} where hospital_id = $1`, [hospital[B]])).affectedRows).toBe(0)
    expect((await db.query(`delete from ${TABLE}`)).affectedRows).toBe(1)
    expect(await snapshot()).toEqual([{ hospital_id: hospital[B], month: MONTH, visits: 999, new_patients: null, revenue: null }])
  })

  it('AC-6102.1: hospital_id를 직접 넣거나 고치면 내 병원이어도 남의 병원이어도 거부된다(소유자를 바꿀 수 없다)', async () => {
    await seed(A, MONTH, 3200, null, null)
    await become(A)
    const insertWithHospital = `insert into ${TABLE} (hospital_id, month, visits) values ($1, $2, 1)`
    await expect(db.query(insertWithHospital, [hospital[A], OTHER_MONTH])).rejects.toThrow(DENIED)
    await expect(db.query(insertWithHospital, [hospital[B], OTHER_MONTH])).rejects.toThrow(DENIED)
    await expect(db.query(`update ${TABLE} set hospital_id = $1`, [hospital[B]])).rejects.toThrow(DENIED)
    expect(await snapshot()).toEqual([{ hospital_id: hospital[A], month: MONTH, visits: 3200, new_patients: null, revenue: null }])
  })

  it.each([
    ['승인 대기', PENDING],
    ['거절', REJECTED],
    ['병원 줄 없음', NO_HOSPITAL],
  ])('AC-6102.1: %s인 사용자는 아무 줄도 보지 못하고 넣지 못하며 고치거나 지워도 바뀌는 줄이 없다', async (_name, user) => {
    if (hospital[user]) await seed(user, MONTH, 5, null, null)
    await seed(B, MONTH, 999, null, null)
    const before = await snapshot()
    await become(user)
    expect(await rows(`select * from ${TABLE}`)).toEqual([])
    await expect(db.query(INSERT, [OTHER_MONTH, 1, null, null])).rejects.toThrow(RLS)
    expect((await db.query(`update ${TABLE} set visits = 1`)).affectedRows).toBe(0)
    expect((await db.query(`delete from ${TABLE}`)).affectedRows).toBe(0)
    expect(await snapshot()).toEqual(before)
  })

  it('AC-6102.1: PostgREST upsert 모양(json 줄 + on conflict do update, 열쇠 칸 month 포함)이 내 권한으로 돌고 남의 같은 달 줄은 그대로다', async () => {
    await seed(A, MONTH, 3200, 180, null)
    await seed(B, MONTH, 999, 99, 9_999)
    await become(A)
    const upsert = (goal: Row) =>
      db.query(
        `insert into ${TABLE} (month, visits, new_patients, revenue)
         select pgrst_body.month, pgrst_body.visits, pgrst_body.new_patients, pgrst_body.revenue
         from (select $1::json as json_data) pgrst_payload,
         lateral (select month, visits, new_patients, revenue from json_populate_recordset(null::${TABLE}, pgrst_payload.json_data) as _) pgrst_body
         on conflict (hospital_id, month) do update
         set month = excluded.month, visits = excluded.visits, new_patients = excluded.new_patients, revenue = excluded.revenue`,
        [JSON.stringify([goal])],
      )
    await upsert({ month: MONTH, visits: 3300, new_patients: null, revenue: 120_000_000 })
    await upsert({ month: OTHER_MONTH, visits: null, new_patients: 150, revenue: null })
    expect(await snapshot()).toEqual(
      [
        { hospital_id: hospital[A], month: OTHER_MONTH, visits: null, new_patients: 150, revenue: null },
        { hospital_id: hospital[A], month: MONTH, visits: 3300, new_patients: null, revenue: 120_000_000 },
        { hospital_id: hospital[B], month: MONTH, visits: 999, new_patients: 99, revenue: 9_999 },
      ].sort((x, y) => `${x.hospital_id}${x.month}`.localeCompare(`${y.hospital_id}${y.month}`)),
    )
  })

  it('AC-6102.1: 승인됐던 병원이 거절되면 그 순간부터 자기 줄도 안 보이고 넣지 못한다', async () => {
    await seed(A, MONTH, 3200, null, null)
    await operator()
    await db.query(`update public.hospitals set status = 'rejected' where id = $1`, [hospital[A]])
    await become(A)
    expect(await rows(`select * from ${TABLE}`)).toEqual([])
    await expect(db.query(INSERT, [OTHER_MONTH, 1, null, null])).rejects.toThrow(RLS)
  })
})

// 표 하나의 칸·제약·표와 칸 권한·RLS·정책·트리거
async function tableShape(target: PGlite) {
  const q = (sql: string) => rows(sql, [], target)
  return {
    columns: await q(
      `select column_name, data_type, is_nullable, column_default from information_schema.columns
       where table_schema = 'public' and table_name = 'stats_goals' order by ordinal_position`,
    ),
    constraints: await q(
      `select conname, contype, pg_get_constraintdef(oid) as def from pg_constraint
       where conrelid = to_regclass('public.stats_goals') order by conname`,
    ),
    access: await q(
      `select c.relrowsecurity, c.relforcerowsecurity,
              (select array_agg(item::text order by item::text) from unnest(c.relacl) item) as table_acl,
              (select array_agg(a.attname || ':' || item::text order by a.attname, item::text)
               from pg_attribute a, unnest(a.attacl) item where a.attrelid = c.oid) as column_acl
       from pg_class c where c.oid = to_regclass('public.stats_goals')`,
    ),
    policies: await q(
      `select policyname, cmd, roles::text[] as roles, qual, with_check from pg_policies
       where schemaname = 'public' and tablename = 'stats_goals' order by policyname`,
    ),
    triggers: await q(`select tgname from pg_trigger where not tgisinternal and tgrelid = to_regclass('public.stats_goals')`),
    functions: await q(
      `select p.oid::regprocedure::text as fn, pg_get_functiondef(p.oid) as def, coalesce(p.proacl::text, '') as acl
       from pg_proc p where p.pronamespace = 'public'::regnamespace order by 1`,
    ),
  }
}

describe('AC-6102.1 파일 글자·두 번 붙여 넣기', SLOW, () => {
  it('AC-6102.1: my_hospital_id()는 cross-branch C1 글자 그대로다', () => {
    expect(GOALS_MIGRATION).toContain(C1_MY_HOSPITAL_ID)
  })

  it('AC-6102.1: 표 권한은 public·anon·authenticated에서 모두 거둔 뒤에만 준다', () => {
    const revoke = GOALS_SQL.indexOf(`revoke all on table ${TABLE} from public, anon, authenticated;`)
    expect(revoke).toBeGreaterThanOrEqual(0)
    const grants = [...GOALS_SQL.matchAll(/^grant [^;]+ on table public\.stats_goals to [^;]+;/gm)]
    expect(grants.length).toBeGreaterThan(0)
    for (const grant of grants) expect(grant.index).toBeGreaterThan(revoke)
  })

  it('AC-6102.1: 두 번 돌려도 되는 문장만 쓴다(표는 if not exists, 정책은 지우고 다시, 함수는 C1 하나만 create or replace, 트리거 없음)', () => {
    const count = (pattern: RegExp) => (GOALS_SQL.match(pattern) ?? []).length
    expect(count(/create\s+table\s+if\s+not\s+exists\s+public\.stats_goals\b/gi)).toBe(1)
    expect(GOALS_SQL).not.toMatch(/create\s+table\s+(?!if\s+not\s+exists)/i)
    expect(count(/create\s+or\s+replace\s+function/gi)).toBe(1)
    expect(GOALS_SQL).not.toMatch(/create\s+function/i)
    expect(GOALS_SQL).not.toMatch(/create\s+trigger/i)
    expect(count(/create\s+policy/gi)).toBe(count(/drop\s+policy\s+if\s+exists/gi))
    expect(count(/create\s+policy/gi)).toBeGreaterThan(0)
  })

  it('AC-6102.1: 인증 → 이 파일만으로 돈다(다른 갈래 표가 없는 DB)', async () => {
    expect(await rows(`select to_regclass('public.stats_days') as stats, to_regclass('public.sales_days') as sales`)).toEqual([{ stats: null, sales: null }])
    await become(A)
    expect(await rows(`${INSERT} returning hospital_id`, [MONTH, 1, null, null])).toEqual([{ hospital_id: hospital[A] }])
  })

  it('AC-6102.1: 같은 DB에 두 번 돌려도 오류 없이 칸·제약·권한·RLS·정책·함수와 이미 있던 줄이 그대로다', async () => {
    const fresh = await PGlite.create()
    try {
      await migrate(fresh)
      const once = await tableShape(fresh)
      expect(once.columns).toHaveLength(5)
      expect(once.policies.length).toBeGreaterThan(0)
      await fresh.query('insert into auth.users (id, email) values ($1, $2)', [A, `${A}@fake.test`])
      const [made] = await rows(
        `insert into public.hospitals (owner_id, name, applicant_name, email, status)
         values ($1, '가짜병원', '가짜신청자', $2, 'approved') returning id`,
        [A, `${A}@fake.test`],
        fresh,
      )
      await fresh.query(`insert into ${TABLE} (hospital_id, month, visits, new_patients, revenue) values ($1, $2, 3200, null, 120000000)`, [made!.id, MONTH])

      await fresh.exec(GOALS_MIGRATION)

      expect(await tableShape(fresh)).toEqual(once)
      expect(await rows(`select hospital_id, month, visits, new_patients, revenue from ${TABLE}`, [], fresh)).toEqual([
        { hospital_id: made!.id, month: MONTH, visits: 3200, new_patients: null, revenue: 120_000_000 },
      ])
    } finally {
      await fresh.close()
    }
  }, 120_000)
})

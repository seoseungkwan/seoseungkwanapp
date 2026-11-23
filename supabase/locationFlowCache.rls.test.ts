import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

// 입지 분석 승하차 저장 표 location_flow_cache(location REQ-7902 AC-7902.6, design.md 4·7절, TASK-97).
// location.rls.test.ts와 같은 방법: 진짜 Postgres(PGlite, WASM)에서 운영자가 SQL Editor에 붙일 migration 파일을
// 차례로(auth → … → 주소록 → 재고 → 입지 → 이 파일) 그대로 돌린다. 실제 Supabase에는 붙지 않는다.
// Supabase가 미리 갖춘 것(역할·auth·storage)만 흉내 낸다. 병원·메일·정류장 ID는 모두 지어낸 것이다.
// 권한은 '승인된 병원의 원장 + admins 줄'(관리자)만, 읽기·넣기만(고치기·지우기 없음)
const fileOf = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))
const read = (rel: string) => readFileSync(fileOf(rel), 'utf-8')
const CHAIN = [
  '20261028000000_auth.sql',
  '20261030000000_precheck_settings.sql',
  '20261101000100_worklog.sql',
  '20261101000110_worklog_bit_fields.sql',
  '20261105000200_worklog_memo_font.sql',
  '20261105000300_worklog_cash_float.sql',
  '20261105000100_stats_rx_groups.sql',
  '20261112000000_stats_rx_groups_exclude.sql',
  '20261101000200_stats.sql',
  '20261101000400_revenue.sql',
  '20261101000000_ai_report.sql',
  '20261116000000_sunap.sql',
  '20261117010000_calendar.sql',
  '20261118100000_desk_accounts.sql',
  '20261119000000_clinic_profile.sql',
  '20261121000000_contacts.sql',
  '20261121100000_inventory.sql',
  '20261122000000_location.sql',
].map((name) => read(`./migrations/${name}`))
const PATH = fileOf('./migrations/20261123000000_location_flow_cache.sql')
// 파일이 아직 없으면 빈 글자로 돌아, 시험마다 '표가 없다'로 실패한다
const MIGRATION = existsSync(PATH) ? readFileSync(PATH, 'utf-8') : ''
const TABLE = 'location_flow_cache'

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
  create table auth.users (id uuid primary key, email text, last_sign_in_at timestamptz);
  create function auth.jwt() returns jsonb language sql stable
    as $$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
`

// 앞 migration(병원 로고·재고 사진·입지 사진)이 바구니 줄과 정책을 더한다
const STORAGE_MOCK = `
  create schema storage;
  grant usage on schema storage to anon, authenticated;
  create table storage.buckets (
    id text primary key,
    name text not null,
    owner uuid,
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    public boolean default false,
    file_size_limit bigint,
    allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets (id),
    name text not null,
    owner uuid default auth.uid(),
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    metadata jsonb,
    unique (bucket_id, name)
  );
  alter table storage.buckets enable row level security;
  alter table storage.objects enable row level security;
  grant select, insert, update, delete on table storage.buckets, storage.objects to anon, authenticated;
  create function storage.foldername(name text) returns text[] language plpgsql as $$
  declare _parts text[];
  begin
    select string_to_array(name, '/') into _parts;
    return _parts[1:array_length(_parts, 1) - 1];
  end $$;
`

const A = '00000000-0000-4000-8000-00000000000a' // 승인된 병원 A 원장 + 관리자
const B = '00000000-0000-4000-8000-00000000000b' // 승인된 다른 병원 B 원장 + 관리자
const N = '00000000-0000-4000-8000-0000000000a2' // 승인된 병원 원장, 관리자 아님
const C = '00000000-0000-4000-8000-00000000000c' // 승인 대기 병원 원장(관리자 줄 있음)
const E = '00000000-0000-4000-8000-00000000000e' // 병원 줄도 데스크 줄도 없음(관리자 줄 있음)
const K = '00000000-0000-4000-8000-0000000000d1' // A의 데스크(병원 줄 없음, 관리자 줄 있음 — 그래도 못 본다)
const STATUS: Record<string, 'approved' | 'pending' | null> = { [A]: 'approved', [B]: 'approved', [N]: 'approved', [C]: 'pending', [E]: null, [K]: null }
const ADMINS = [A, B, C, E, K]
const emailOf = (user: string) => (user === K ? 'desk-a@fake.test' : `${user.slice(-2)}@fake.test`)
const OUTSIDERS: [string, string][] = [
  ['관리자 아닌 원장', N],
  ['승인 대기(관리자 줄 있음)', C],
  ['병원 없음(관리자 줄 있음)', E],
  ['A의 데스크(관리자 줄 있음)', K],
]

type Row = Record<string, unknown>
const SLOW = { timeout: 60_000 }
const DENIED = { code: '42501' }
const CHECK = { code: '23514' }
const NOT_NULL = { code: '23502' }
const UNIQUE = { code: '23505' }
const NO_HOSPITAL = { code: expect.stringMatching(/^(42501|23502)$/) }
const POLICY_TEXT =
  /^\(\(hospital_id = \( SELECT (public\.)?my_hospital_id\(\) AS my_hospital_id\)\) AND \(EXISTS \( SELECT 1 FROM (public\.)?admins a WHERE \(a\.user_id = \( SELECT auth\.uid\(\) AS uid\)\)\)\)\)$/
const squash = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ')

// 정류장 ID마다 한 달 승차·하차·날 수(design.md 4절 FlowVolumeRow)
const ROWS = [
  { id: '4100167', mode: 'bus', board: 12_000, alight: 11_500, days: 30 },
  { id: 'R1', mode: 'rail', board: 90_000, alight: 88_000, days: 30 },
]
const GOOD: Row = { sgg: '41131', ym: '2026-09', as_of: '2026-09-30', rows: ROWS }

let db: PGlite
let hospital: Record<string, string> = {}
let tablesBefore: string[] = []
let tablesAfter: string[] = []
let functionsBefore: string[] = []
let functionsAfter: string[] = []
let policiesBefore = 0
let policiesAfter = 0

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

async function rows(sql: string, params: unknown[] = []) {
  return (await db.query<Row>(sql, params)).rows
}

/** 지금 역할로 그 칸만 넣는다. rows 칸은 JSON 글자로 보낸다 */
function insert(values: Row) {
  const columns = Object.keys(values)
  return rows(
    `insert into public.${TABLE} (${columns.join(', ')}) values (${columns.map((_, i) => `$${i + 1}`).join(', ')})`,
    columns.map((c) => (c === 'rows' && values[c] !== null ? JSON.stringify(values[c]) : values[c])),
  )
}

const mine = () => rows(`select hospital_id, sgg, ym, as_of::text as as_of, rows from public.${TABLE} order by sgg, ym`)

async function resetData() {
  await operator()
  await db.exec('truncate auth.users cascade')
  hospital = {}
  for (const [user, status] of Object.entries(STATUS)) {
    await db.query('insert into auth.users (id, email) values ($1, $2)', [user, emailOf(user)])
    if (status !== null) {
      const [row] = await rows(
        `insert into public.hospitals (owner_id, name, applicant_name, email, status) values ($1, $2, '홍길동', $3, $4) returning id`,
        [user, `가짜병원${user.slice(-2)}`, emailOf(user), status],
      )
      hospital[user] = row.id as string
    }
  }
  for (const user of ADMINS) await db.query('insert into public.admins (user_id) values ($1)', [user])
  await db.query(`insert into public.hospital_members (hospital_id, email) values ($1, $2)`, [hospital[A], emailOf(K)])
}

const publicTables = async () =>
  (await rows(`select tablename from pg_tables where schemaname = 'public' order by 1`)).map((r) => String(r.tablename))
const publicFunctions = async () =>
  (await rows(`select p.oid::regprocedure::text as fn from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' order by 1`)).map(
    (r) => String(r.fn),
  )
const policyCount = async () => Number((await rows(`select count(*)::int as n from pg_policies where tablename <> '${TABLE}'`))[0].n)

beforeAll(async () => {
  db = await PGlite.create()
  await db.exec(SUPABASE_MOCK)
  await db.exec(STORAGE_MOCK)
  for (const sql of CHAIN) await db.exec(sql)
  tablesBefore = await publicTables()
  functionsBefore = await publicFunctions()
  policiesBefore = await policyCount()
  await db.exec(MIGRATION)
  tablesAfter = await publicTables()
  functionsAfter = await publicFunctions()
  policiesAfter = await policyCount()
}, 240_000)

afterAll(async () => {
  await db.close()
})

beforeEach(resetData)

describe('AC-7902.6 파일', SLOW, () => {
  it('AC-7902.6: 파일이 있고 LF 줄 끝이며, 두 번 실행해도 오류가 없다', async () => {
    expect(MIGRATION).not.toBe('')
    expect(MIGRATION).not.toContain('\r')
    await operator()
    await db.exec(MIGRATION)
    expect(await publicTables()).toEqual(tablesAfter)
  })

  it('AC-7902.6: 표 하나만 더하고 다른 표·함수·정책은 그대로다', () => {
    expect(tablesBefore).not.toContain(TABLE)
    expect(tablesAfter).toEqual([...tablesBefore, TABLE].sort())
    expect(functionsAfter).toEqual(functionsBefore)
    expect(policiesAfter).toBe(policiesBefore)
    expect(policiesBefore).toBeGreaterThan(0)
  })
})

describe('AC-7902.6 칸·열쇠·권한·정책', SLOW, () => {
  it('AC-7902.6: 칸·타입·비울 수 없음·기본값이 design.md 7절 모양이다', async () => {
    const found = (
      await rows(
        `select column_name, udt_name, is_nullable, column_default from information_schema.columns
         where table_schema = 'public' and table_name = $1 order by ordinal_position`,
        [TABLE],
      )
    ).map((c) => [c.column_name, c.udt_name, c.is_nullable, c.column_default])
    expect(found).toEqual([
      ['hospital_id', 'uuid', 'NO', 'my_hospital_id()'],
      ['sgg', 'text', 'NO', null],
      ['ym', 'text', 'NO', null],
      ['as_of', 'date', 'NO', null],
      ['rows', 'jsonb', 'NO', null],
      ['created_at', 'timestamptz', 'NO', 'now()'],
    ])
  })

  it('AC-7902.6: 열쇠는 (hospital_id, sgg, ym)이고 병원을 지우면 함께 지워진다', async () => {
    const list = await rows(
      `select contype, pg_get_constraintdef(oid) as def from pg_constraint where conrelid = to_regclass($1) and contype in ('p', 'f') order by contype`,
      [`public.${TABLE}`],
    )
    expect(list).toEqual([
      { contype: 'f', def: expect.stringMatching(/^FOREIGN KEY \(hospital_id\) REFERENCES (public\.)?hospitals\(id\) ON DELETE CASCADE$/) },
      { contype: 'p', def: 'PRIMARY KEY (hospital_id, sgg, ym)' },
    ])
  })

  it('AC-7902.6: RLS가 켜져 있다', async () => {
    expect(await rows(`select relrowsecurity as on from pg_class where oid = to_regclass($1)`, [`public.${TABLE}`])).toEqual([{ on: true }])
  })

  it('AC-7902.6: anon에게 표·칸 권한이 하나도 없다', async () => {
    await rows(`select $1::regclass`, [`public.${TABLE}`])
    for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']) {
      expect([privilege, (await rows(`select has_any_column_privilege('anon', $1, $2) as ok`, [`public.${TABLE}`, privilege]))[0].ok]).toEqual([privilege, false])
    }
    for (const privilege of ['DELETE', 'TRUNCATE', 'TRIGGER']) {
      expect([privilege, (await rows(`select has_table_privilege('anon', $1, $2) as ok`, [`public.${TABLE}`, privilege]))[0].ok]).toEqual([privilege, false])
    }
  })

  it('AC-7902.6: authenticated는 표 읽기와 값 칸 넷 넣기뿐이다(고치기·지우기·hospital_id·created_at 없음)', async () => {
    await rows(`select $1::regclass`, [`public.${TABLE}`])
    const granted = await rows(
      `select grantee, privilege_type from information_schema.role_table_grants
       where table_schema = 'public' and table_name = $1 and grantee in ('anon', 'authenticated', 'PUBLIC') order by grantee, privilege_type`,
      [TABLE],
    )
    expect(granted).toEqual([{ grantee: 'authenticated', privilege_type: 'SELECT' }])
    const columnsWith = async (privilege: string) =>
      (
        await rows(
          `select column_name from information_schema.columns
           where table_schema = 'public' and table_name = $1 and has_column_privilege('authenticated', $2, column_name, $3) order by ordinal_position`,
          [TABLE, `public.${TABLE}`, privilege],
        )
      ).map((r) => r.column_name)
    expect(await columnsWith('INSERT')).toEqual(['sgg', 'ym', 'as_of', 'rows'])
    expect(await columnsWith('UPDATE')).toEqual([])
    expect((await rows(`select has_table_privilege('authenticated', $1, 'DELETE') as ok`, [`public.${TABLE}`]))[0].ok).toBe(false)
    expect((await rows(`select has_any_column_privilege('authenticated', $1, 'REFERENCES') as ok`, [`public.${TABLE}`]))[0].ok).toBe(false)
  })

  it('AC-7902.6: 정책은 하나(for all, authenticated, 내 병원 + admins 줄)다', async () => {
    const list = await rows(`select cmd, permissive, roles::text as roles, qual, with_check from pg_policies where schemaname = 'public' and tablename = $1`, [TABLE])
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ cmd: 'ALL', permissive: 'PERMISSIVE', roles: '{authenticated}' })
    expect(squash(list[0].qual)).toMatch(POLICY_TEXT)
    expect(list[0].with_check).toBe(list[0].qual)
  })
})

describe('AC-7902.6 관리자는 자기 병원 줄만 읽고 넣는다', SLOW, () => {
  it('AC-7902.6: A 관리자가 넣은 줄은 A 병원 줄이고 A만 읽는다. B는 못 보고 자기 병원에 같은 시군구·달을 따로 넣는다', async () => {
    await become(A)
    await insert(GOOD)
    expect(await mine()).toEqual([{ hospital_id: hospital[A], sgg: '41131', ym: '2026-09', as_of: '2026-09-30', rows: ROWS }])
    await become(B)
    expect(await mine()).toEqual([])
    await insert(GOOD)
    expect((await mine()).map((r) => r.hospital_id)).toEqual([hospital[B]])
  })

  it.each(OUTSIDERS)('AC-7902.6: %s는 A 줄을 못 읽고 넣지도 못한다', async (_label, user) => {
    await become(A)
    await insert(GOOD)
    await become(user)
    expect(await mine()).toEqual([])
    await expect(insert({ ...GOOD, sgg: '41133' })).rejects.toMatchObject(user === N ? DENIED : NO_HOSPITAL)
  })

  it('AC-7902.6: anon은 읽지도 넣지도 못한다', async () => {
    await becomeAnon()
    await expect(mine()).rejects.toMatchObject(DENIED)
    await expect(insert(GOOD)).rejects.toMatchObject(DENIED)
  })

  it('AC-7902.6: 관리자도 hospital_id를 정해 넣거나 고치거나 지우지 못한다', async () => {
    await become(A)
    await insert(GOOD)
    await expect(insert({ ...GOOD, sgg: '41133', hospital_id: hospital[B] })).rejects.toMatchObject(DENIED)
    await expect(rows(`update public.${TABLE} set as_of = '2026-09-29'`)).rejects.toMatchObject(DENIED)
    await expect(rows(`delete from public.${TABLE}`)).rejects.toMatchObject(DENIED)
    expect(await mine()).toHaveLength(1)
  })
})

describe('AC-7902.6 값 제약', SLOW, () => {
  it.each([
    ['시군구 4자리', { sgg: '4113' }],
    ['시군구 글자', { sgg: '4113a' }],
    ['시군구 6자리', { sgg: '411310' }],
    ['연월 13월', { ym: '2026-13' }],
    ['연월 줄표 없음', { ym: '202609' }],
    ['연월 00월', { ym: '2026-00' }],
    ['rows 배열 아님(객체)', { rows: { id: 'R1' } }],
    ['rows 배열 아님(글자)', { rows: 'R1' }],
  ])('AC-7902.6: %s면 23514', async (_label, over) => {
    await become(A)
    await expect(insert({ ...GOOD, ...over })).rejects.toMatchObject(CHECK)
  })

  it('AC-7902.6: rows는 jsonb 글자 1,000,000바이트까지이고 하나 넘으면 23514', async () => {
    await become(A)
    // ["x…x"]의 jsonb 글자 = 글자 수 + 4바이트
    await insert({ ...GOOD, rows: ['x'.repeat(999_996)] })
    await expect(insert({ ...GOOD, ym: '2026-08', rows: ['x'.repeat(999_997)] })).rejects.toMatchObject(CHECK)
  })

  it.each(['sgg', 'ym', 'as_of', 'rows'])('AC-7902.6: %s를 비우면 23502', async (column) => {
    await become(A)
    await expect(insert({ ...GOOD, [column]: null })).rejects.toMatchObject(NOT_NULL)
  })

  it('AC-7902.6: 같은 병원·시군구·달을 두 번 넣으면 23505', async () => {
    await become(A)
    await insert(GOOD)
    await expect(insert(GOOD)).rejects.toMatchObject(UNIQUE)
    await insert({ ...GOOD, ym: '2026-08' })
    expect(await mine()).toHaveLength(2)
  })
})

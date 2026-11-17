import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { addDays, addMonthsToDay, todayInKorea } from '@/lib/analytics/dates'

// 예약 탭 서버 표 calendar_settings·calendar_appts·calendar_allday·calendar_rev의 칸·제약·RLS·권한·트리거
// (clinic-calendar REQ-5901·REQ-5906, design.md 'DB'). sunap.rls.test.ts와 같은 방법: 진짜 Postgres(PGlite, WASM)에서
// 운영자가 붙일 migration 파일을 차례로 그대로 돌린다(auth → precheck_settings(my_hospital_id 함수) → 이 파일).
// 실제 Supabase에는 붙지 않는다. Supabase가 미리 갖춘 것만 흉내 낸다. 이름·차트번호는 모두 지어낸 것이다
const fileOf = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))
const read = (rel: string) => readFileSync(fileOf(rel), 'utf-8')
const AUTH_MIGRATION = read('./migrations/20261028000000_auth.sql')
const SETTINGS_MIGRATION = read('./migrations/20261030000000_precheck_settings.sql')
const CAL_PATH = fileOf('./migrations/20261117010000_calendar.sql')
// 파일이 아직 없으면 빈 글자로 돌아, 시험마다 '표가 없다'로 실패한다(무엇이 빠졌는지 시험별로 보인다)
const CAL_MIGRATION = existsSync(CAL_PATH) ? readFileSync(CAL_PATH, 'utf-8') : ''
// 주석을 뺀 SQL 글자
const CAL_SQL = CAL_MIGRATION.split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n')
// 함수 몸통($$ … $$)까지 뺀 SQL 글자(맨 위 문장만 본다)
const CAL_TOP = CAL_SQL.replace(/\$\$[\s\S]*?\$\$/g, "''")

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

const SETTINGS = 'public.calendar_settings'
const APPTS = 'public.calendar_appts'
const ALLDAY = 'public.calendar_allday'
const REV = 'public.calendar_rev'
const TABLES = [SETTINGS, APPTS, ALLDAY, REV] as const
const nameOf = (table: string) => table.replace('public.', '')

// 사용자가 보낼 수 있는 칸(그 밖은 칸 권한이 없다). 표의 칸 차례
const APPT_INSERT = ['day', 'start_min', 'len_min', 'name', 'chart', 'staff_id', 'staff_name', 'staff_mark', 'kind_id', 'kind_name', 'memo', 'status']
const APPT_UPDATE = [...APPT_INSERT, 'auto']
const ALLDAY_INSERT = ['day', 'type', 'memo', 'staff_id', 'staff_name']
const SETTINGS_SENT = ['kinds', 'staff', 'open_hour', 'close_hour', 'sunday']

// design.md 'DB'의 기본 종류(color null = 시행자 색 따름)
const DEFAULT_KINDS = [
  { id: 'dosu', name: '도수', len: 30, color: null },
  { id: 'jabo', name: '자보도수', len: 30, color: null },
  { id: 'shock', name: '충격파', len: 15, color: null },
  { id: 'inj', name: '주사', len: 10, color: 'pink' },
  { id: 'visit', name: '진료', len: 10, color: 'lime' },
]

// 지어낸 날짜·시각·id. 지우기(1년) 시험은 한국 날짜 오늘로 날을 정한다
const DAY = '2026-11-18'
const DAY2 = '2026-11-19'
const TODAY = todayInKorea()
const YEAR_AGO = addMonthsToDay(TODAY, -12) // 한국 오늘 − 1년(이날 줄은 남는다)
const OLD = '2001-01-01T00:00:00.000Z' // 운영자가 심는 옛 시각(DB가 바꿨는지 보려고)
const OTHER_ID = '00000000-0000-4000-8000-000000000999'

// 예약 한 줄(사용자가 보낼 수 있는 칸만, 지어낸 이름·차트번호)
const APPT: Row = {
  day: DAY,
  start_min: 900,
  len_min: 30,
  name: '가짜환자',
  chart: '10231',
  staff_id: 'st-ga',
  staff_name: '가',
  staff_mark: '가',
  kind_id: 'dosu',
  kind_name: '도수',
  memo: '',
  status: 'auto',
}
const MEMO_DAY: Row = { day: DAY, type: 'memo', memo: '원장님 학회' }
const OFF_DAY: Row = { day: DAY, type: 'off', staff_id: 'st-ga', staff_name: '가' }

const SLOW = { timeout: 60_000 }
const DENIED = { code: '42501' } // 권한 없음
const CHECK_FAILED = { code: '23514' }
const UNIQUE_FAILED = { code: '23505' }
const RLS_REJECTED = /row-level security/

let db: PGlite
let hospital: Record<string, string> = {}

async function migrate(target: PGlite) {
  await target.exec(SUPABASE_MOCK)
  await target.exec(AUTH_MIGRATION)
  await target.exec(SETTINGS_MIGRATION)
  await target.exec(CAL_MIGRATION)
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

// 시험마다 빈 표에서 시작한다(병원·예약 줄은 auth.users를 따라 함께 비워진다). 운영자(superuser)는 RLS를 건너뛴다
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

/** 지금 역할로 값 칸만 넣는 insert 문(칸 이름은 시험이 정한 것뿐) */
function insertInto(table: string, values: Row, returning = 'id') {
  const columns = Object.keys(values)
  return db.query<Row>(
    `insert into ${table} (${columns.join(', ')}) values (${columns.map((_, i) => `$${i + 1}`).join(', ')}) returning ${returning}`,
    columns.map((column) => values[column]),
  )
}

/** 운영자가 그 병원 줄을 넣는다(RLS·칸 권한을 건너뛴다). 넣은 줄의 id(없는 표는 hospital_id) */
async function seed(table: string, owner: string, values: Row = {}) {
  await operator()
  const { rows: added } = await insertInto(table, { hospital_id: hospital[owner], ...values }, table === SETTINGS || table === REV ? 'hospital_id' : 'id')
  return (added[0].id ?? added[0].hospital_id) as string
}

const seedAppt = (owner: string, extra: Row = {}) => seed(APPTS, owner, { ...APPT, ...extra })
const seedAllDay = (owner: string, values: Row = MEMO_DAY) => seed(ALLDAY, owner, values)

/** 운영자 눈으로 본 그 병원 rev(줄 없으면 null) */
async function revOf(owner: string): Promise<number | null> {
  await operator()
  const found = await rows(`select rev::int as rev from ${REV} where hospital_id = $1`, [hospital[owner]])
  return found.length === 0 ? null : (found[0].rev as number)
}

/** 운영자 눈으로 본 네 표 전체(바뀌지 않았는지 견줄 때) */
async function snapshot() {
  await operator()
  return {
    settings: await rows(`select hospital_id, kinds, staff, open_hour, close_hour, sunday from ${SETTINGS} order by 1`),
    appts: await rows(
      `select id, hospital_id, day::text as day, start_min, len_min, name, chart, staff_id, kind_id, memo, status, auto,
              orig_day::text as orig_day, orig_start from ${APPTS} order by 1`,
    ),
    allday: await rows(`select id, hospital_id, day::text as day, type, memo, staff_id, staff_name from ${ALLDAY} order by 1`),
    rev: await rows(`select hospital_id, rev::int as rev from ${REV} order by 1`),
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

const SETTINGS_BODY: Row = {
  kinds: [{ id: 'dosu', name: '도수', len: 30, color: 'blue' }],
  staff: [{ id: 'st-ga', name: '가나다', mark: '가', color: 'teal' }],
  open_hour: 9,
  close_hour: 19,
  sunday: true,
}

beforeAll(async () => {
  db = await PGlite.create()
  await migrate(db)
}, 120_000)

afterAll(async () => {
  await db.close()
})

beforeEach(resetData)

describe('AC-5901.1 표 모양', SLOW, () => {
  async function columnsOf(table: string) {
    return rows(
      `select column_name, udt_name, is_nullable, column_default from information_schema.columns
       where table_schema = 'public' and table_name = $1 order by ordinal_position`,
      [nameOf(table)],
    )
  }
  const MY_HOSPITAL = expect.stringMatching(/^(public\.)?my_hospital_id\(\)$/)

  it('AC-5901.1: calendar_settings 칸은 hospital_id(my_hospital_id())·kinds·staff(jsonb)·open_hour·close_hour(int)·sunday(bool)이고 모두 비울 수 없다', async () => {
    const found = await columnsOf(SETTINGS)
    expect(found.map((c) => [c.column_name, c.udt_name, c.is_nullable])).toEqual([
      ['hospital_id', 'uuid', 'NO'],
      ['kinds', 'jsonb', 'NO'],
      ['staff', 'jsonb', 'NO'],
      ['open_hour', 'int4', 'NO'],
      ['close_hour', 'int4', 'NO'],
      ['sunday', 'bool', 'NO'],
    ])
    expect(found[0].column_default).toEqual(MY_HOSPITAL)
  })

  it('AC-5901.1: calendar_settings 기본값은 기본 종류 다섯·시행자 없음·8시~20시·일요일 안 봄이다', async () => {
    await seed(SETTINGS, A)
    expect(await rows(`select kinds, staff, open_hour, close_hour, sunday from ${SETTINGS}`)).toEqual([
      { kinds: DEFAULT_KINDS, staff: [], open_hour: 8, close_hour: 20, sunday: false },
    ])
  })

  it('AC-5901.1: calendar_appts 칸·타입·비울 수 있음·기본값이 design.md DB 모양이다(전화·성별·나이·생일 칸 없음)', async () => {
    const found = await columnsOf(APPTS)
    expect(found.map((c) => [c.column_name, c.udt_name, c.is_nullable])).toEqual([
      ['id', 'uuid', 'NO'],
      ['hospital_id', 'uuid', 'NO'],
      ['day', 'date', 'NO'],
      ['start_min', 'int2', 'NO'],
      ['len_min', 'int2', 'NO'],
      ['name', 'text', 'NO'],
      ['chart', 'text', 'YES'],
      ['staff_id', 'text', 'NO'],
      ['staff_name', 'text', 'NO'],
      ['staff_mark', 'text', 'NO'],
      ['kind_id', 'text', 'NO'],
      ['kind_name', 'text', 'NO'],
      ['memo', 'text', 'NO'],
      ['status', 'text', 'NO'],
      ['auto', 'text', 'YES'],
      ['orig_day', 'date', 'YES'],
      ['orig_start', 'int2', 'YES'],
      ['created_at', 'timestamptz', 'NO'],
      ['updated_at', 'timestamptz', 'NO'],
    ])
    const defaults = Object.fromEntries(found.filter((c) => c.column_default !== null).map((c) => [c.column_name, c.column_default]))
    expect(defaults).toEqual({
      id: 'gen_random_uuid()',
      hospital_id: MY_HOSPITAL,
      memo: "''::text",
      status: "'auto'::text",
      created_at: 'now()',
      updated_at: 'now()',
    })
  })

  it('AC-5901.1: calendar_allday 칸은 id·hospital_id·day·type·memo·staff_id·staff_name·created_at이다', async () => {
    const found = await columnsOf(ALLDAY)
    expect(found.map((c) => [c.column_name, c.udt_name, c.is_nullable])).toEqual([
      ['id', 'uuid', 'NO'],
      ['hospital_id', 'uuid', 'NO'],
      ['day', 'date', 'NO'],
      ['type', 'text', 'NO'],
      ['memo', 'text', 'YES'],
      ['staff_id', 'text', 'YES'],
      ['staff_name', 'text', 'YES'],
      ['created_at', 'timestamptz', 'NO'],
    ])
    const defaults = Object.fromEntries(found.filter((c) => c.column_default !== null).map((c) => [c.column_name, c.column_default]))
    expect(defaults).toEqual({ id: 'gen_random_uuid()', hospital_id: MY_HOSPITAL, created_at: 'now()' })
  })

  it('AC-5901.1: calendar_rev 칸은 hospital_id·rev(bigint, 기본 0)·changed_at(기본 now())이다', async () => {
    const found = await columnsOf(REV)
    expect(found.map((c) => [c.column_name, c.udt_name, c.is_nullable, c.column_default])).toEqual([
      ['hospital_id', 'uuid', 'NO', null],
      ['rev', 'int8', 'NO', '0'],
      ['changed_at', 'timestamptz', 'NO', 'now()'],
    ])
  })

  it.each<[string, string]>([
    [SETTINGS, 'PRIMARY KEY (hospital_id)'],
    [APPTS, 'PRIMARY KEY (id)'],
    [ALLDAY, 'PRIMARY KEY (id)'],
    [REV, 'PRIMARY KEY (hospital_id)'],
  ])('AC-5901.1: %s 기본 키는 %s이고, 바깥 키는 병원 표 하나(지우면 함께 지움)뿐이다', async (table, primary) => {
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

  it('AC-5901.1: 예약·종일 표는 (hospital_id, day) 색인이 있고, 휴무는 (hospital_id, day, staff_id) 하나만(부분 unique)이다', async () => {
    const indexes = async (table: string) =>
      (await rows(`select indexdef from pg_indexes where schemaname = 'public' and tablename = $1 order by indexname`, [nameOf(table)])).map(
        (r) => String(r.indexdef).replace(/public\./g, ''),
      )
    expect(await indexes(APPTS)).toEqual(
      expect.arrayContaining([expect.stringMatching(/^CREATE INDEX \S+ ON calendar_appts USING btree \(hospital_id, day\)$/)]),
    )
    const allday = await indexes(ALLDAY)
    expect(allday).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^CREATE INDEX \S+ ON calendar_allday USING btree \(hospital_id, day\)$/),
        expect.stringMatching(/^CREATE UNIQUE INDEX \S+ ON calendar_allday USING btree \(hospital_id, day, staff_id\) WHERE \(type = 'off'::text\)$/),
      ]),
    )
    expect(allday).toHaveLength(3) // 기본 키 + 둘
  })

  it('AC-5901.1: 병원 줄을 지우면 네 표의 그 병원 줄도 지워지고 다른 병원 줄은 그대로다', async () => {
    await seed(SETTINGS, A)
    await seed(SETTINGS, B)
    await seedAppt(A)
    const keptAppt = await seedAppt(B)
    await seedAllDay(A)
    const keptDay = await seedAllDay(B)
    await seed(REV, A, { rev: 3 })
    await seed(REV, B, { rev: 4 })
    await operator()
    await db.query('delete from public.hospitals where id = $1', [hospital[A]])
    const after = await snapshot()
    expect(after.settings.map((r) => r.hospital_id)).toEqual([hospital[B]])
    expect(after.appts.map((r) => r.id)).toEqual([keptAppt])
    expect(after.allday.map((r) => r.id)).toEqual([keptDay])
    expect(after.rev).toEqual([{ hospital_id: hospital[B], rev: 4 }])
  })

  it.each(TABLES)('AC-5901.1: %s는 RLS가 켜져 있다', async (table) => {
    expect(await rows(`select relrowsecurity as on from pg_class where oid = to_regclass($1)`, [table])).toEqual([{ on: true }])
  })

  it.each(TABLES)('AC-5901.1: anon에게 %s의 표·칸 권한이 하나도 없다(기본 권한을 먼저 거뒀다)', async (table) => {
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
    [SETTINGS, ['SELECT']],
    [APPTS, ['DELETE', 'SELECT']],
    [ALLDAY, ['DELETE', 'SELECT']],
    [REV, ['SELECT']],
  ])('AC-5901.1: authenticated의 %s 표 전체 권한은 %j뿐이다(넣기·고치기는 칸 단위)', async (table, expected) => {
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
    [SETTINGS, 'INSERT', SETTINGS_SENT],
    [SETTINGS, 'UPDATE', SETTINGS_SENT],
    [APPTS, 'INSERT', APPT_INSERT],
    [APPTS, 'UPDATE', APPT_UPDATE],
    [ALLDAY, 'INSERT', ALLDAY_INSERT],
    [ALLDAY, 'UPDATE', []],
    [REV, 'INSERT', []],
    [REV, 'UPDATE', []],
  ])('AC-5901.1: authenticated의 %s %s 칸 권한은 정해 둔 칸뿐이다(hospital_id·id·처음 자리·시각 칸 없음)', async (table, privilege, expected) => {
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
    [SETTINGS, ['INSERT', 'SELECT', 'UPDATE']],
    [APPTS, ['ALL']],
    [ALLDAY, ['ALL']],
    [REV, ['SELECT']],
  ])('AC-5901.1: %s 정책(%j)은 authenticated 대상이고 모두 my_hospital_id()로 거른다', async (table, cmds) => {
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

  it.each<[string, boolean]>([
    ['calendar_bump', true],
    ['calendar_appts_move', false],
    ['calendar_appts_prune', false],
  ])('AC-5901.1: 함수 %s는 트리거 함수이고(security definer = %s) search_path가 비어 있으며 public·anon·authenticated 누구도 부르지 못한다', async (name, definer) => {
    const found = await rows(
      `select p.prosecdef as definer, p.proconfig as config, t.typname as returns from pg_proc p join pg_type t on t.oid = p.prorettype
       where p.pronamespace = 'public'::regnamespace and p.proname = $1`,
      [name],
    )
    expect(found).toEqual([{ definer, config: ['search_path=""'], returns: 'trigger' }])
    for (const role of ['anon', 'authenticated']) {
      expect([role, (await rows(`select has_function_privilege($1, $2, 'EXECUTE') as ok`, [role, `public.${name}()`]))[0].ok]).toEqual([role, false])
    }
    const [acl] = await rows(`select coalesce(array_to_string(proacl, ','), '') as acl from pg_proc where proname = $1`, [name])
    expect(String(acl.acl)).not.toMatch(/(^|,)=/) // PUBLIC 몫 없음
  })

  it('AC-5901.1: 트리거는 처음 자리(줄마다 고치기 전)·1년 지우기(예약 넣은 뒤 문장마다)·rev(세 표 넣기·고치기·지우기 뒤 문장마다)다', async () => {
    const found = await rows(
      `select event_object_table as tbl, trigger_name as name, string_agg(event_manipulation, ',' order by event_manipulation) as events,
              action_timing as timing, action_orientation as per, action_statement as run
       from information_schema.triggers where event_object_schema = 'public' and event_object_table like 'calendar%'
       group by 1, 2, 4, 5, 6 order by 1, 2`,
    )
    const run = (fn: string) => expect.stringMatching(new RegExp(`^EXECUTE FUNCTION (public\\.)?${fn}\\(\\)$`))
    expect(found).toEqual([
      { tbl: 'calendar_allday', name: 'calendar_allday_bump', events: 'DELETE,INSERT,UPDATE', timing: 'AFTER', per: 'STATEMENT', run: run('calendar_bump') },
      { tbl: 'calendar_appts', name: 'calendar_appts_bump', events: 'DELETE,INSERT,UPDATE', timing: 'AFTER', per: 'STATEMENT', run: run('calendar_bump') },
      { tbl: 'calendar_appts', name: 'calendar_appts_move', events: 'UPDATE', timing: 'BEFORE', per: 'ROW', run: run('calendar_appts_move') },
      { tbl: 'calendar_appts', name: 'calendar_appts_prune', events: 'INSERT', timing: 'AFTER', per: 'STATEMENT', run: run('calendar_appts_prune') },
      { tbl: 'calendar_settings', name: 'calendar_settings_bump', events: 'DELETE,INSERT,UPDATE', timing: 'AFTER', per: 'STATEMENT', run: run('calendar_bump') },
    ])
  })

  it('AC-5901.1: 파일이 있고 줄 끝이 LF이며, 머리 주석에 운영자가 붙여 넣는 방법과 ADR-030이 있다', () => {
    expect(CAL_MIGRATION).not.toBe('')
    expect(CAL_MIGRATION).not.toContain('\r')
    const lines = CAL_MIGRATION.split('\n')
    const head = lines.slice(0, lines.findIndex((line) => !/^(--|\s*$)/.test(line))).join('\n')
    expect(head).toContain('운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다')
    expect(head).toContain('ADR-030')
  })

  it('AC-5901.1: 두 번 돌려도 되는 문장만 쓴다(표·색인은 if not exists, 함수·트리거는 or replace, 정책은 지우고 다시 만들기, 지우기 없음)', () => {
    const count = (pattern: RegExp) => (CAL_TOP.match(pattern) ?? []).length
    for (const table of TABLES) {
      expect(count(new RegExp(`create\\s+table\\s+if\\s+not\\s+exists\\s+${table.replace('.', '\\.')}\\b`, 'gi'))).toBe(1)
    }
    expect(CAL_TOP).not.toMatch(/create\s+table\s+(?!if\s+not\s+exists)/i)
    expect(CAL_TOP).not.toMatch(/create\s+(unique\s+)?index\s+(?!if\s+not\s+exists)/i)
    expect(CAL_TOP).not.toMatch(/create\s+function/i)
    expect(CAL_TOP).not.toMatch(/create\s+(constraint\s+)?trigger/i)
    expect(count(/create\s+or\s+replace\s+function/gi)).toBe(3)
    expect(count(/create\s+or\s+replace\s+trigger/gi)).toBe(5)
    expect(CAL_TOP).not.toMatch(/^\s*(drop\s+(?!policy\s+if\s+exists)|truncate|delete)\b/im)
    expect(count(/create\s+policy/gi)).toBeGreaterThan(0)
    expect(count(/drop\s+policy\s+if\s+exists/gi)).toBe(count(/create\s+policy/gi))
    for (const [, target] of CAL_TOP.matchAll(/^\s*alter table\s+(\S+)/gim)) expect(TABLES).toContain(target)
    // my_hospital_id()는 앞 migration 것을 쓴다(여기서 다시 만들지 않는다)
    expect(CAL_TOP).not.toMatch(/function\s+public\.my_hospital_id/i)
  })

  it.each(TABLES)('AC-5901.1: %s 표 권한은 revoke all 뒤에만 준다', (table) => {
    const escaped = table.replace('.', '\\.')
    const revoke = CAL_TOP.search(new RegExp(`revoke all on table ${escaped} from anon, authenticated;`))
    expect(revoke).toBeGreaterThanOrEqual(0)
    const grants = [...CAL_TOP.matchAll(new RegExp(`^grant [^;]+ on table ${escaped} to [^;]+;`, 'gm'))]
    expect(grants.length).toBeGreaterThan(0)
    for (const grant of grants) expect(grant.index).toBeGreaterThan(revoke)
  })

  // 표마다 칸·제약·색인·표와 칸 권한·RLS·정책·트리거, 그리고 함수 세 개
  async function shape(target: PGlite) {
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
        triggers: await q(`select tgname, tgtype, tgfoid::regproc::text as fn from pg_trigger where not tgisinternal and tgrelid = to_regclass($1) and $2 <> '' order by 1`),
      }
    }
    shapes.functions = await rows(
      `select proname, prosecdef, proconfig, prosrc, (select array_agg(item::text order by item::text) from unnest(proacl) item) as acl
       from pg_proc where pronamespace = 'public'::regnamespace and proname like 'calendar%' order by proname`,
      [],
      target,
    )
    return shapes
  }

  it('AC-5901.1: 같은 DB에 두 번 돌려도 오류 없이 칸·제약·권한·RLS·정책·트리거·함수와 이미 있던 줄이 그대로다', async () => {
    const fresh = await PGlite.create()
    try {
      await migrate(fresh)
      const once = await shape(fresh)
      expect((once[APPTS] as { columns: Row[] }).columns).toHaveLength(19)
      expect(once.functions as Row[]).toHaveLength(3)
      await fresh.query('insert into auth.users (id, email) values ($1, $2)', [A, emailOf(A)])
      const [h] = await rows(
        `insert into public.hospitals (owner_id, name, applicant_name, email, status)
         values ($1, '가짜병원', '홍길동', $2, 'approved') returning id`,
        [A, emailOf(A)],
        fresh,
      )
      await fresh.query(`insert into ${SETTINGS} (hospital_id, open_hour, staff) values ($1, 9, '[{"id":"s"}]')`, [h.id])
      await fresh.query(
        `insert into ${APPTS} (hospital_id, day, start_min, len_min, name, staff_id, staff_name, staff_mark, kind_id, kind_name, orig_day, orig_start)
         values ($1, $2, 600, 30, '가짜', 's', '가', '가', 'k', '도수', $3, 540)`,
        [h.id, DAY, DAY2],
      )
      await fresh.query(`insert into ${ALLDAY} (hospital_id, day, type, memo) values ($1, $2, 'memo', '가짜 메모')`, [h.id, DAY])
      await fresh.query(`insert into ${REV} (hospital_id, rev) values ($1, 41)`, [h.id])
      const seeded = async () => ({
        settings: await rows(`select open_hour, staff from ${SETTINGS}`, [], fresh),
        appts: await rows(`select day::text as day, start_min, orig_day::text as orig, orig_start from ${APPTS}`, [], fresh),
        allday: await rows(`select type, memo from ${ALLDAY}`, [], fresh),
        rev: await rows(`select rev::int as rev from ${REV}`, [], fresh),
      })
      const before = await seeded()

      await fresh.exec(CAL_MIGRATION)

      expect(await shape(fresh)).toEqual(once)
      expect(await seeded()).toEqual(before)
      expect(before.rev).toEqual([{ rev: 41 }])
      expect(before.appts).toEqual([{ day: DAY, start_min: 600, orig: DAY2, orig_start: 540 }])
    } finally {
      await fresh.close()
    }
  }, 120_000)
})

describe('AC-5901.2 로그인 안 한 사용자(anon)', SLOW, () => {
  it('AC-5901.2: anon은 네 표 모두 읽기·넣기·고치기·지우기가 권한 없음이고 줄은 그대로다', async () => {
    await seed(SETTINGS, A)
    await seedAppt(A)
    await seedAllDay(A)
    await seed(REV, A, { rev: 2 })
    const before = await snapshot()
    await becomeAnon()
    for (const table of TABLES) {
      await expect(db.query(`select * from ${table}`)).rejects.toMatchObject(DENIED)
      await expect(db.query(`delete from ${table}`)).rejects.toMatchObject(DENIED)
    }
    await expect(insertInto(APPTS, APPT)).rejects.toMatchObject(DENIED)
    await expect(db.query(`update ${APPTS} set memo = 'x'`)).rejects.toMatchObject(DENIED)
    await expect(insertInto(ALLDAY, MEMO_DAY)).rejects.toMatchObject(DENIED)
    await expect(db.query(`insert into ${SETTINGS} (open_hour) values (9)`)).rejects.toMatchObject(DENIED)
    await expect(db.query(`update ${SETTINGS} set open_hour = 9`)).rejects.toMatchObject(DENIED)
    await expect(db.query(`update ${REV} set rev = 0`)).rejects.toMatchObject(DENIED)
    expect(await snapshot()).toEqual(before)
  })
})

describe('AC-5901.2 승인된 병원은 자기 병원 줄만: 예약(calendar_appts)', SLOW, () => {
  it('AC-5901.2: 넣으면 id·hospital_id·created_at·updated_at은 DB가 정하고, 상태는 auto·도착과 처음 자리는 비어 있다', async () => {
    await become(A)
    const { rows: added } = await insertInto(
      APPTS,
      APPT,
      `id, hospital_id, day::text as day, status, auto, orig_day, orig_start, created_at > '${OLD}'::timestamptz as fresh, updated_at > '${OLD}'::timestamptz as touched`,
    )
    expect(added).toEqual([
      { id: expect.any(String), hospital_id: hospital[A], day: DAY, status: 'auto', auto: null, orig_day: null, orig_start: null, fresh: true, touched: true },
    ])
  })

  it('AC-5901.2: 내 병원 예약만 보이고, 남의 줄은 id로 고치거나 지워도 0줄이다', async () => {
    const mine = await seedAppt(A, { name: '내환자' })
    const other = await seedAppt(B, { name: '남의환자' })
    await become(A)
    expect(await rows(`select id, name from ${APPTS}`)).toEqual([{ id: mine, name: '내환자' }])
    expect((await db.query(`update ${APPTS} set memo = '바꿈' where id = $1`, [other])).affectedRows).toBe(0)
    expect((await db.query(`delete from ${APPTS} where id = $1`, [other])).affectedRows).toBe(0)
    expect((await db.query(`delete from ${APPTS}`)).affectedRows).toBe(1)
    expect((await snapshot()).appts).toEqual([expect.objectContaining({ id: other, name: '남의환자', memo: '' })])
  })

  it('AC-5901.2: 정해 둔 칸(도착 auto 포함)은 고칠 수 있다', async () => {
    const mine = await seedAppt(A)
    await become(A)
    const [changed] = await rows(
      `update ${APPTS} set len_min = 40, name = '새이름', chart = null, staff_id = 'st-na', staff_name = '나', staff_mark = '나',
              kind_id = 'inj', kind_name = '주사', memo = '왼쪽', status = 'cancel', auto = 'noshow'
       where id = $1 returning len_min, name, chart, staff_id, staff_name, staff_mark, kind_id, kind_name, memo, status, auto`,
      [mine],
    )
    expect(changed).toEqual({
      len_min: 40,
      name: '새이름',
      chart: null,
      staff_id: 'st-na',
      staff_name: '나',
      staff_mark: '나',
      kind_id: 'inj',
      kind_name: '주사',
      memo: '왼쪽',
      status: 'cancel',
      auto: 'noshow',
    })
  })

  it.each<[string, Row]>([
    ['hospital_id', { hospital_id: OTHER_ID }],
    ['id', { id: OTHER_ID }],
    ['auto', { auto: 'came' }],
    ['orig_day', { orig_day: DAY2 }],
    ['orig_start', { orig_start: 600 }],
    ['created_at', { created_at: OLD }],
    ['updated_at', { updated_at: OLD }],
  ])('AC-5901.2: 예약을 넣을 때 %s 칸은 보낼 수 없다(권한 없음)', async (_name, extra) => {
    await become(A)
    await expect(insertInto(APPTS, { ...APPT, ...extra })).rejects.toMatchObject(DENIED)
    expect((await snapshot()).appts).toEqual([])
  })

  it.each<[string, string]>([
    ['hospital_id', `hospital_id = '${OTHER_ID}'`],
    ['id', `id = '${OTHER_ID}'`],
    ['orig_day', `orig_day = '${DAY2}'`],
    ['orig_start', 'orig_start = 600'],
    ['orig 비우기', 'orig_day = null, orig_start = null'],
    ['created_at', 'created_at = now()'],
    ['updated_at', `updated_at = '${OLD}'`],
  ])('AC-5901.2: 예약의 %s 칸은 직접 고칠 수 없다(권한 없음)', async (_name, set) => {
    const mine = await seedAppt(A, { orig_day: DAY2, orig_start: 540 })
    const before = await snapshot()
    await become(A)
    await expect(db.query(`update ${APPTS} set ${set} where id = $1`, [mine])).rejects.toMatchObject(DENIED)
    expect(await snapshot()).toEqual(before)
  })
})

describe('AC-5901.2 승인된 병원은 자기 병원 줄만: 종일(calendar_allday)', SLOW, () => {
  it('AC-5901.2: 메모·휴무 줄을 넣고 내 줄만 읽고 지울 수 있다. 남의 줄은 0줄이다', async () => {
    const other = await seedAllDay(B, { ...MEMO_DAY, memo: '남의 메모' })
    await become(A)
    const { rows: memo } = await insertInto(ALLDAY, MEMO_DAY, `id, hospital_id, type, memo, staff_id, staff_name, created_at > '${OLD}'::timestamptz as fresh`)
    expect(memo).toEqual([{ id: expect.any(String), hospital_id: hospital[A], type: 'memo', memo: '원장님 학회', staff_id: null, staff_name: null, fresh: true }])
    const { rows: off } = await insertInto(ALLDAY, OFF_DAY, 'id, type, memo, staff_id, staff_name')
    expect(off).toEqual([{ id: expect.any(String), type: 'off', memo: null, staff_id: 'st-ga', staff_name: '가' }])
    expect((await rows(`select id from ${ALLDAY} order by created_at, id`)).map((r) => r.id).sort()).toEqual([memo[0].id, off[0].id].sort())
    expect((await db.query(`delete from ${ALLDAY} where id = $1`, [other])).affectedRows).toBe(0)
    expect((await db.query(`delete from ${ALLDAY} where id = $1`, [memo[0].id])).affectedRows).toBe(1)
    const after = await snapshot()
    expect(after.allday.map((r) => r.id).sort()).toEqual([other, off[0].id].sort())
  })

  it('AC-5901.2: 종일 줄은 고칠 수 없고(지우고 다시 넣음), hospital_id·id·created_at은 넣을 수 없다', async () => {
    const mine = await seedAllDay(A)
    const before = await snapshot()
    await become(A)
    await expect(db.query(`update ${ALLDAY} set memo = '바꿈' where id = $1`, [mine])).rejects.toMatchObject(DENIED)
    await expect(insertInto(ALLDAY, { ...MEMO_DAY, hospital_id: hospital[A] })).rejects.toMatchObject(DENIED)
    await expect(insertInto(ALLDAY, { ...MEMO_DAY, id: OTHER_ID })).rejects.toMatchObject(DENIED)
    await expect(insertInto(ALLDAY, { ...MEMO_DAY, created_at: OLD })).rejects.toMatchObject(DENIED)
    expect(await snapshot()).toEqual(before)
  })
})

describe('AC-5901.2 승인된 병원은 자기 병원 줄만: 설정(calendar_settings)', SLOW, () => {
  it('AC-5901.2: PostgREST upsert 모양(on conflict hospital_id)으로 처음엔 넣고 다음엔 내 줄 하나를 고친다', async () => {
    await seed(SETTINGS, B, { open_hour: 7 })
    await become(A)
    await postgrestUpsert(SETTINGS, 'hospital_id', [SETTINGS_BODY])
    expect(await rows(`select hospital_id, kinds, staff, open_hour, close_hour, sunday from ${SETTINGS}`)).toEqual([
      { hospital_id: hospital[A], ...SETTINGS_BODY },
    ])
    await postgrestUpsert(SETTINGS, 'hospital_id', [{ ...SETTINGS_BODY, open_hour: 10, sunday: false }])
    const after = await snapshot()
    expect(after.settings).toHaveLength(2)
    expect(after.settings).toContainEqual({ hospital_id: hospital[A], ...SETTINGS_BODY, open_hour: 10, sunday: false })
    expect(after.settings).toContainEqual(expect.objectContaining({ hospital_id: hospital[B], open_hour: 7 }))
  })

  it('AC-5901.2: 설정은 지우기 권한이 없고, hospital_id는 넣지도 고치지도 못하며, 남의 설정은 안 보이고 안 바뀐다', async () => {
    await seed(SETTINGS, A)
    await seed(SETTINGS, B, { open_hour: 7 })
    const before = await snapshot()
    await become(A)
    expect(await rows(`select hospital_id from ${SETTINGS}`)).toEqual([{ hospital_id: hospital[A] }])
    await expect(db.query(`delete from ${SETTINGS}`)).rejects.toMatchObject(DENIED)
    await expect(db.query(`insert into ${SETTINGS} (hospital_id) values ($1)`, [hospital[A]])).rejects.toMatchObject(DENIED)
    await expect(db.query(`update ${SETTINGS} set hospital_id = $1`, [hospital[B]])).rejects.toMatchObject(DENIED)
    expect((await db.query(`update ${SETTINGS} set open_hour = 6 where hospital_id = $1`, [hospital[B]])).affectedRows).toBe(0)
    // 0줄 고치기도 문장 트리거라 내 rev는 늘 수 있다(다시 읽기 한 번뿐). 표 줄은 그대로다
    expect((await snapshot()).settings).toEqual(before.settings)
  })
})

describe('AC-5901.2 승인된 병원은 자기 병원 줄만: 바뀜 숫자(calendar_rev)', SLOW, () => {
  it('AC-5901.2: 내 병원 rev만 읽을 수 있고, 넣기·고치기·지우기는 권한 없음이다', async () => {
    await seed(REV, A, { rev: 5 })
    await seed(REV, B, { rev: 9 })
    const before = await snapshot()
    await become(A)
    expect(await rows(`select rev::int as rev from ${REV}`)).toEqual([{ rev: 5 }])
    await expect(db.query(`insert into ${REV} (hospital_id, rev) values ($1, 1)`, [OTHER_ID])).rejects.toMatchObject(DENIED)
    await expect(db.query(`insert into ${REV} (rev) values (1)`)).rejects.toMatchObject(DENIED)
    await expect(db.query(`update ${REV} set rev = 0`)).rejects.toMatchObject(DENIED)
    await expect(db.query(`delete from ${REV}`)).rejects.toMatchObject(DENIED)
    expect(await snapshot()).toEqual(before)
  })
})

describe('AC-5901.2 승인 대기·거절·병원 없음', SLOW, () => {
  it.each<[string, string]>([
    ['승인 대기', C],
    ['거절', D],
    ['병원 줄 없음', E],
  ])('AC-5901.2: %s인 사용자는 네 표에서 아무 줄도 보지 못하고 넣지 못하며 고치거나 지워도 바뀌는 줄이 없다', async (_name, user) => {
    if (hospital[user]) {
      await seed(SETTINGS, user)
      await seedAppt(user)
      await seedAllDay(user)
      await seed(REV, user, { rev: 3 })
    }
    await seed(SETTINGS, A)
    await seedAppt(A)
    await seedAllDay(A)
    await seed(REV, A, { rev: 4 })
    const before = await snapshot()
    await become(user)
    for (const table of TABLES) expect(await rows(`select * from ${table}`)).toEqual([])
    await expect(insertInto(APPTS, APPT)).rejects.toThrow(RLS_REJECTED)
    await expect(insertInto(ALLDAY, MEMO_DAY)).rejects.toThrow(RLS_REJECTED)
    await expect(postgrestUpsert(SETTINGS, 'hospital_id', [SETTINGS_BODY])).rejects.toThrow(RLS_REJECTED)
    expect((await db.query(`update ${APPTS} set memo = 'x'`)).affectedRows).toBe(0)
    expect((await db.query(`update ${SETTINGS} set open_hour = 9`)).affectedRows).toBe(0)
    expect((await db.query(`delete from ${APPTS}`)).affectedRows).toBe(0)
    expect((await db.query(`delete from ${ALLDAY}`)).affectedRows).toBe(0)
    expect(await snapshot()).toEqual(before)
  })

  it('AC-5901.2: 승인됐던 병원이 거절되면 그 순간부터 자기 줄도 안 보이고 넣지 못한다', async () => {
    await seedAppt(A)
    await seed(REV, A, { rev: 1 })
    await become(A)
    expect(await rows(`select day::text as day from ${APPTS}`)).toEqual([{ day: DAY }])
    await operator()
    await db.query(`update public.hospitals set status = 'rejected' where id = $1`, [hospital[A]])
    await become(A)
    expect(await rows(`select * from ${APPTS}`)).toEqual([])
    expect(await rows(`select * from ${REV}`)).toEqual([])
    await expect(insertInto(APPTS, APPT)).rejects.toThrow(RLS_REJECTED)
  })
})

describe('AC-5901.3 값 제약', SLOW, () => {
  it.each<[string, Row]>([
    ['시작 345(10의 배수 아님)', { start_min: 345 }],
    ['시작 1440', { start_min: 1440 }],
    ['시작 −10', { start_min: -10 }],
    ['길이 0', { len_min: 0 }],
    ['길이 7(5의 배수 아님)', { len_min: 7 }],
    ['길이 245', { len_min: 245 }],
    ['이름 빈 글자', { name: '' }],
    ['이름 21자', { name: '가'.repeat(21) }],
    ['이름 앞뒤 빈칸', { name: ' 가짜 ' }],
    ['차트번호 a1', { chart: 'a1' }],
    ['차트번호 11자리', { chart: '12345678901' }],
    ['차트번호 빈 글자', { chart: '' }],
    ['시행자 id 빈 글자', { staff_id: '' }],
    ['시행자 id 41자', { staff_id: 's'.repeat(41) }],
    ['시행자 이름 11자', { staff_name: '가'.repeat(11) }],
    ['한 글자 표시 두 글자', { staff_mark: '가나' }],
    ['한 글자 표시 빈 글자', { staff_mark: '' }],
    ['종류 id 빈 글자', { kind_id: '' }],
    ['종류 이름 11자', { kind_name: '가'.repeat(11) }],
    ['상태 x', { status: 'x' }],
    ['메모 101자', { memo: '가'.repeat(101) }],
  ])('AC-5901.3: 예약에 %s를 넣으면 거부(23514)된다', async (_name, patch) => {
    await become(A)
    await expect(insertInto(APPTS, { ...APPT, ...patch })).rejects.toMatchObject(CHECK_FAILED)
    expect((await snapshot()).appts).toEqual([])
  })

  it('AC-5901.3: 예약 경계값(시작 0·1430, 길이 5·240, 이름 1·20자, 차트 없음·1·10자리, 메모 100자, 상태 넷)은 들어간다', async () => {
    await become(A)
    const ok: Row[] = [
      { start_min: 0, len_min: 5, name: '가', chart: null },
      { start_min: 1430, len_min: 240, name: '가'.repeat(20), chart: '1', memo: '가'.repeat(100) },
      { chart: '1234567890', status: 'came' },
      { status: 'noshow' },
      { status: 'cancel' },
    ]
    for (const patch of ok) await insertInto(APPTS, { ...APPT, ...patch })
    expect((await snapshot()).appts).toHaveLength(ok.length)
  })

  it.each<[string, string]>([
    ['도착 cancel', `auto = 'cancel'`],
    ['도착 auto', `auto = 'auto'`],
    ['상태 x', `status = 'x'`],
    ['길이 7', 'len_min = 7'],
    ['이름 빈 글자', `name = ''`],
  ])('AC-5901.3: 예약을 고칠 때도 %s는 거부(23514)된다', async (_name, set) => {
    const mine = await seedAppt(A)
    await become(A)
    await expect(db.query(`update ${APPTS} set ${set} where id = $1`, [mine])).rejects.toMatchObject(CHECK_FAILED)
  })

  it('AC-5901.3: 도착은 came·noshow·비움만 들어간다', async () => {
    const mine = await seedAppt(A)
    await become(A)
    for (const auto of ['came', 'noshow', null]) {
      const [row] = await rows(`update ${APPTS} set auto = $1 where id = $2 returning auto`, [auto, mine])
      expect(row).toEqual({ auto })
    }
  })

  it.each<[string, Row]>([
    ['메모 21자', { ...MEMO_DAY, memo: '가'.repeat(21) }],
    ['메모 빈 글자', { ...MEMO_DAY, memo: '' }],
    ['메모 없음', { day: DAY, type: 'memo' }],
    ['메모 줄에 시행자', { ...MEMO_DAY, staff_id: 'st-ga', staff_name: '가' }],
    ['휴무에 시행자 없음', { day: DAY, type: 'off' }],
    ['휴무에 시행자 이름 없음', { day: DAY, type: 'off', staff_id: 'st-ga' }],
    ['휴무에 메모', { ...OFF_DAY, memo: '가짜' }],
    ['종류 x', { day: DAY, type: 'x', memo: '가짜' }],
    ['시행자 이름 11자', { ...OFF_DAY, staff_name: '가'.repeat(11) }],
  ])('AC-5901.3: 종일 줄 %s는 거부(23514)된다', async (_name, values) => {
    await become(A)
    await expect(insertInto(ALLDAY, values)).rejects.toMatchObject(CHECK_FAILED)
    expect((await snapshot()).allday).toEqual([])
  })

  it('AC-5901.3: 종일 메모 20자는 들어가고, 같은 날 같은 시행자 휴무 두 줄은 거부(23505)된다(다른 시행자·메모 여러 줄·다른 병원은 된다)', async () => {
    await seedAllDay(B, OFF_DAY)
    await become(A)
    await insertInto(ALLDAY, { ...MEMO_DAY, memo: '가'.repeat(20) })
    await insertInto(ALLDAY, MEMO_DAY)
    await insertInto(ALLDAY, OFF_DAY)
    await expect(insertInto(ALLDAY, OFF_DAY)).rejects.toMatchObject(UNIQUE_FAILED)
    await insertInto(ALLDAY, { ...OFF_DAY, staff_id: 'st-na', staff_name: '나' })
    await insertInto(ALLDAY, { ...OFF_DAY, day: DAY2 })
    expect((await snapshot()).allday).toHaveLength(6)
  })

  it.each<[string, Row]>([
    ['여는 시간 4', { open_hour: 4 }],
    ['여는 시간 13', { open_hour: 13 }],
    ['닫는 시간 25', { close_hour: 25 }],
    ['닫는 시간 11', { close_hour: 11 }],
    ['종류가 배열 아님', { kinds: {} }],
    ['시행자가 배열 아님', { staff: 'x' }],
    ['종류 8,000바이트', { kinds: [{ id: 'a'.repeat(7990) }] }],
  ])('AC-5901.3: 설정 %s는 거부(23514)된다', async (_name, patch) => {
    await become(A)
    await expect(postgrestUpsert(SETTINGS, 'hospital_id', [{ ...SETTINGS_BODY, ...patch }])).rejects.toMatchObject(CHECK_FAILED)
    expect((await snapshot()).settings).toEqual([])
  })

  it('AC-5901.3: 설정 보이는 시간 5·12시 시작, 12·24시 끝은 들어간다', async () => {
    await become(A)
    for (const [open_hour, close_hour] of [
      [5, 24],
      [12, 12],
    ]) {
      await postgrestUpsert(SETTINGS, 'hospital_id', [{ ...SETTINGS_BODY, open_hour, close_hour }])
      expect(await rows(`select open_hour, close_hour from ${SETTINGS}`)).toEqual([{ open_hour, close_hour }])
    }
  })
})

describe('AC-5901.4 지난 예약 1년 뒤 지우기', SLOW, () => {
  const OLDEST = addDays(YEAR_AGO, -1) // 한국 오늘 − 1년보다 하루 이른 날

  it('AC-5901.4: 예약을 하나 넣으면 같은 병원의 T−1년보다 이른 예약·종일 줄은 지워지고 T−1년 날 줄·다른 병원 줄은 남는다', async () => {
    const goneAppt = await seedAppt(A, { day: OLDEST })
    const keptEdge = await seedAppt(A, { day: YEAR_AGO })
    const keptToday = await seedAppt(A, { day: TODAY })
    const goneMemo = await seedAllDay(A, { ...MEMO_DAY, day: OLDEST })
    const goneOff = await seedAllDay(A, { ...OFF_DAY, day: addDays(OLDEST, -30) })
    const keptMemo = await seedAllDay(A, { ...MEMO_DAY, day: YEAR_AGO })
    const otherAppt = await seedAppt(B, { day: OLDEST })
    const otherDay = await seedAllDay(B, { ...MEMO_DAY, day: OLDEST })
    // 운영자가 심을 때는 지워지지 않는다(내 병원이 없음)
    expect((await snapshot()).appts).toHaveLength(4)

    await become(A)
    const { rows: added } = await insertInto(APPTS, { ...APPT, day: TODAY })

    const after = await snapshot()
    expect(after.appts.map((r) => r.id).sort()).toEqual([keptEdge, keptToday, added[0].id, otherAppt].sort())
    expect(after.allday.map((r) => r.id).sort()).toEqual([keptMemo, otherDay].sort())
    expect(after.appts.map((r) => r.id)).not.toContain(goneAppt)
    expect(after.allday.map((r) => r.id)).not.toContain(goneMemo)
    expect(after.allday.map((r) => r.id)).not.toContain(goneOff)
  })

  it('AC-5901.4: 지나간 날짜(1년 넘은) 예약을 넣으면 그 줄도 곧바로 지워진다(남지 않는다)', async () => {
    await become(A)
    await insertInto(APPTS, { ...APPT, day: OLDEST })
    expect((await snapshot()).appts).toEqual([])
  })

  it('AC-5901.4: 종일 줄을 넣거나 예약을 고치는 것으로는 지우지 않는다(예약을 넣을 때만)', async () => {
    const old = await seedAppt(A, { day: OLDEST })
    const recent = await seedAppt(A, { day: TODAY })
    await become(A)
    await insertInto(ALLDAY, { ...MEMO_DAY, day: TODAY })
    await db.query(`update ${APPTS} set memo = '고침' where id = $1`, [recent])
    expect((await snapshot()).appts.map((r) => r.id).sort()).toEqual([old, recent].sort())
  })
})

describe('AC-5901.5 바뀜 숫자(calendar_rev)', SLOW, () => {
  it('AC-5901.5: 예약·종일·설정을 넣거나 고치거나 지울 때마다 내 병원 rev가 늘고 다른 병원 rev는 그대로다', async () => {
    await seed(REV, B, { rev: 7 })
    const otherAppt = await seedAppt(B)
    // 운영자가 심는 줄은 rev를 만들지 않는다(내 병원 없음)
    await seedAppt(A)
    expect(await revOf(A)).toBeNull()

    const seen: number[] = []
    const step = async (run: () => Promise<unknown>) => {
      await become(A)
      await run()
      const rev = await revOf(A)
      expect(rev).not.toBeNull()
      seen.push(rev as number)
      expect(await revOf(B)).toBe(7)
    }
    let apptId = ''
    let dayId = ''
    await step(async () => {
      apptId = (await insertInto(APPTS, APPT)).rows[0].id as string
    })
    await step(() => db.query(`update ${APPTS} set memo = '고침' where id = $1`, [apptId]))
    await step(() => db.query(`update ${APPTS} set auto = 'came' where id = $1`, [apptId]))
    await step(() => db.query(`delete from ${APPTS} where id = $1`, [apptId]))
    await step(async () => {
      dayId = (await insertInto(ALLDAY, MEMO_DAY)).rows[0].id as string
    })
    await step(() => db.query(`delete from ${ALLDAY} where id = $1`, [dayId]))
    await step(() => postgrestUpsert(SETTINGS, 'hospital_id', [SETTINGS_BODY]))
    await step(() => postgrestUpsert(SETTINGS, 'hospital_id', [{ ...SETTINGS_BODY, sunday: false }]))

    expect(seen[0]).toBeGreaterThanOrEqual(1)
    for (let i = 1; i < seen.length; i++) expect([i, seen[i]! > seen[i - 1]!]).toEqual([i, true])
    // 남의 줄은 그대로다
    expect((await snapshot()).appts.map((r) => r.id)).toContain(otherAppt)
  })

  it('AC-5901.5: rev를 늘릴 때 changed_at도 지금 시각으로 바뀐다', async () => {
    await seed(REV, A, { rev: 3, changed_at: OLD })
    await become(A)
    await insertInto(APPTS, APPT)
    await operator()
    const [row] = await rows(`select rev::int as rev, changed_at > $2::timestamptz as fresh from ${REV} where hospital_id = $1`, [hospital[A], OLD])
    expect(row.fresh).toBe(true)
    expect(row.rev as number).toBeGreaterThan(3)
  })

  it('AC-5901.5: 다른 병원이 바꾸면 내 rev는 그대로다', async () => {
    await seed(REV, A, { rev: 2 })
    await become(B)
    await insertInto(APPTS, APPT)
    await insertInto(ALLDAY, MEMO_DAY)
    expect(await revOf(A)).toBe(2)
    expect((await revOf(B)) as number).toBeGreaterThanOrEqual(2)
  })
})

describe('AC-5906.1 일정 변경 기록(처음 자리 트리거)', SLOW, () => {
  async function apptOf(id: string) {
    await operator()
    const [row] = await rows(
      `select day::text as day, start_min, orig_day::text as orig_day, orig_start, auto, updated_at > $2::timestamptz as touched
       from ${APPTS} where id = $1`,
      [id, OLD],
    )
    return row
  }

  it('AC-5906.1: 날짜나 시작을 바꾸면 처음 한 번만 바꾸기 전 자리를 적고 도착 칸을 비운다', async () => {
    const id = await seedAppt(A, { day: DAY, start_min: 900, auto: 'came', updated_at: OLD })
    await become(A)
    await db.query(`update ${APPTS} set start_min = 960 where id = $1`, [id])
    expect(await apptOf(id)).toEqual({ day: DAY, start_min: 960, orig_day: DAY, orig_start: 900, auto: null, touched: true })

    await become(A)
    await db.query(`update ${APPTS} set auto = 'noshow' where id = $1`, [id])
    await db.query(`update ${APPTS} set day = $1, start_min = 600 where id = $2`, [DAY2, id])
    expect(await apptOf(id)).toEqual({ day: DAY2, start_min: 600, orig_day: DAY, orig_start: 900, auto: null, touched: true })
  })

  it('AC-5906.1: 날짜만 바꿔도 처음 자리를 적는다', async () => {
    const id = await seedAppt(A, { day: DAY, start_min: 900 })
    await become(A)
    await db.query(`update ${APPTS} set day = $1 where id = $2`, [DAY2, id])
    expect(await apptOf(id)).toMatchObject({ day: DAY2, start_min: 900, orig_day: DAY, orig_start: 900 })
  })

  it('AC-5906.1: 처음 자리로 되돌리면 처음 자리 두 칸이 비워진다', async () => {
    const id = await seedAppt(A, { day: DAY, start_min: 900 })
    await become(A)
    await db.query(`update ${APPTS} set day = $1, start_min = 600 where id = $2`, [DAY2, id])
    await db.query(`update ${APPTS} set start_min = 700 where id = $1`, [id])
    await db.query(`update ${APPTS} set day = $1, start_min = 900 where id = $2`, [DAY, id])
    expect(await apptOf(id)).toMatchObject({ day: DAY, start_min: 900, orig_day: null, orig_start: null })
  })

  it('AC-5906.1: 길이·시행자·종류·메모·이름·차트번호·상태만 바꾸면 처음 자리와 도착 칸은 그대로다', async () => {
    const id = await seedAppt(A, { orig_day: DAY2, orig_start: 540, auto: 'came', updated_at: OLD })
    await become(A)
    await db.query(
      `update ${APPTS} set len_min = 50, staff_id = 'st-na', staff_name = '나', staff_mark = '나', kind_id = 'inj', kind_name = '주사',
              memo = '고침', name = '새이름', chart = '999', status = 'cancel' where id = $1`,
      [id],
    )
    expect(await apptOf(id)).toEqual({ day: DAY, start_min: 900, orig_day: DAY2, orig_start: 540, auto: 'came', touched: true })
  })

  it('AC-5906.1: 날짜·시작을 같은 값으로 다시 적으면 옮긴 것이 아니다', async () => {
    const id = await seedAppt(A, { auto: 'came' })
    await become(A)
    await db.query(`update ${APPTS} set day = $1, start_min = 900 where id = $2`, [DAY, id])
    expect(await apptOf(id)).toMatchObject({ orig_day: null, orig_start: null, auto: 'came' })
  })

  it('AC-5906.1: 새로 넣은 예약은 처음 자리가 없다', async () => {
    await become(A)
    const { rows: added } = await insertInto(APPTS, APPT, 'orig_day, orig_start')
    expect(added).toEqual([{ orig_day: null, orig_start: null }])
  })
})

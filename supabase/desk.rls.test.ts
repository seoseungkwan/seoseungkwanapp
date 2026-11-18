import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { addDays, addMonthsToDay, todayInKorea } from '@/lib/analytics/dates'

// 데스크 계정 표 hospital_members·정의자 함수·데스크 정책·기본값·예약 트리거·가입 막기 (desk-feedback REQ-6303, design.md '③④ 데스크 계정 — DB').
// sunap.rls.test.ts·calendar.rls.test.ts와 같은 방법: 진짜 Postgres(PGlite, WASM)에서 운영자가 붙일 migration 파일을 차례로 그대로 돌린다.
// 실제 Supabase에는 붙지 않는다. Supabase가 미리 갖춘 것만 흉내 낸다(auth.users에는 '로그인함'을 보려고 last_sign_in_at을 더한다).
// 메일·이름·차트번호는 모두 지어낸 것이다
const fileOf = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))
const read = (rel: string) => readFileSync(fileOf(rel), 'utf-8')
// 앞 migration: auth → precheck_settings(my_hospital_id) → 업무일지 넷 → 통계 묶음 둘 → 통계·매출·AI(AC-6303.5의 닫힌 표) → 수납일지 → 예약
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
].map((name) => read(`./migrations/${name}`))
const DESK_PATH = fileOf('./migrations/20261118100000_desk_accounts.sql')
// 파일이 아직 없으면 빈 글자로 돌아, 시험마다 '함수·표가 없다'로 실패한다(무엇이 빠졌는지 시험별로 보인다)
const DESK_MIGRATION = existsSync(DESK_PATH) ? readFileSync(DESK_PATH, 'utf-8') : ''
// 주석을 뺀 SQL 글자, 그리고 함수 몸통($$ … $$)까지 뺀 글자(맨 위 문장만 본다)
const DESK_SQL = DESK_MIGRATION.split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n')
const DESK_TOP = DESK_SQL.replace(/\$\$[\s\S]*?\$\$/g, "''")

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

const A = '00000000-0000-4000-8000-00000000000a' // 승인된 병원 A 원장
const B = '00000000-0000-4000-8000-00000000000b' // 승인된 다른 병원 B 원장
const C = '00000000-0000-4000-8000-00000000000c' // 승인 대기
const D = '00000000-0000-4000-8000-00000000000d' // 거절
const E = '00000000-0000-4000-8000-00000000000e' // 병원 줄도 데스크 줄도 없는 사용자
const K = '00000000-0000-4000-8000-0000000000d1' // A의 데스크(병원 줄 없음)
const L = '00000000-0000-4000-8000-0000000000d2' // B의 데스크(병원 줄 없음)
const STATUS: Record<string, 'approved' | 'pending' | 'rejected' | null> = {
  [A]: 'approved',
  [B]: 'approved',
  [C]: 'pending',
  [D]: 'rejected',
  [E]: null,
  [K]: null,
  [L]: null,
}
const DESK_EMAIL: Record<string, string> = { [K]: 'desk-a@fake.test', [L]: 'desk-b@fake.test' }
const emailOf = (user: string) => DESK_EMAIL[user] ?? `${user.slice(-1)}@fake.test`
const NAME: Record<string, string> = { [A]: '가짜병원에이', [B]: '가짜병원비', [C]: '가짜병원씨', [D]: '가짜병원디' }
const K_ADDED = '2026-11-10T00:00:00.000Z' // 운영자가 심는 K 데스크 줄의 더한 시각

type Row = Record<string, unknown>

const MEMBERS = 'public.hospital_members'
// 데스크가 쓰는 표(넣는 기본값 = my_clinic_hospital_id())와 읽기만 하는 표
const DESK_WRITE = [
  'public.worklog_days',
  'public.sunap_days',
  'public.sunap_spends',
  'public.sunap_settings',
  'public.calendar_settings',
  'public.calendar_appts',
  'public.calendar_allday',
] as const
const DESK_READ = ['public.worklog_settings', 'public.stats_rx_groups', 'public.calendar_rev'] as const
const DESK_TABLES = [...DESK_WRITE, ...DESK_READ]
// 데스크에게 닫힌 표(이 파일은 정책을 더하지 않는다)
const CLOSED = [
  'public.hospitals',
  'public.admins',
  'public.stats_days',
  'public.stats_months',
  'public.sales_days',
  'public.claim_rule_settings',
  'public.message_templates',
  'public.ai_reports',
] as const
const nameOf = (table: string) => table.replace('public.', '')

// 새 함수 여섯: 이름·부르는 꼴·돌려주는 꼴·변하는 정도(s = stable, v = volatile)
const FUNCTIONS: [string, string, string, string][] = [
  ['my_desk_hospital_id', 'public.my_desk_hospital_id()', 'uuid', 's'],
  ['my_clinic_hospital_id', 'public.my_clinic_hospital_id()', 'uuid', 's'],
  ['my_desk', 'public.my_desk()', 'TABLE(hospital_id uuid, hospital_name text)', 's'],
  ['add_desk_member', 'public.add_desk_member(text)', 'text', 'v'],
  ['desk_members', 'public.desk_members()', 'TABLE(id uuid, email text, created_at timestamp with time zone, signed_in_at timestamp with time zone)', 's'],
  ['remove_desk_member', 'public.remove_desk_member(uuid)', 'void', 'v'],
]

// 지어낸 날짜·시각·id
const DAY = '2026-11-18'
const DAY2 = '2026-11-19'
const TODAY = todayInKorea()
const YEAR_AGO = addMonthsToDay(TODAY, -12) // 한국 오늘 − 1년(이날 줄은 남는다)
const OLDEST = addDays(YEAR_AGO, -1) // 한국 오늘 − 1년보다 하루 이른 날(예약을 넣으면 지워진다)
const NEW_AT = '2026-11-18T09:30:00.000Z'
const GROUP = '00000000-0000-4000-8000-000000000101'

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

const SLOW = { timeout: 60_000 }
const DENIED = { code: '42501' } // 권한 없음
const CHECK_FAILED = { code: '23514' }
const UNIQUE_FAILED = { code: '23505' }
const RLS_REJECTED = /row-level security/

let db: PGlite
let hospital: Record<string, string> = {}

async function migrate(target: PGlite, withDesk = true) {
  await target.exec(SUPABASE_MOCK)
  for (const sql of CHAIN) await target.exec(sql)
  if (withDesk) await target.exec(DESK_MIGRATION)
}

async function operator() {
  await db.exec('reset role; reset request.jwt.claims')
}

/** 그 사용자로 로그인한 것처럼(JWT의 sub·email). email을 주면 그 글자를 그대로 쓴다 */
async function become(user: string, email: string | null = emailOf(user)) {
  await operator()
  const claims = email === null ? { sub: user } : { sub: user, email }
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify(claims)])
  await db.exec('set role authenticated')
}

async function becomeAnon() {
  await operator()
  await db.exec('set role anon')
}

async function rows(sql: string, params: unknown[] = [], target: PGlite = db) {
  return (await target.query<Row>(sql, params)).rows
}

// 시험마다 빈 표에서 시작한다(병원·데스크·모든 병원 줄은 auth.users를 따라 함께 비워진다). 운영자(superuser)는 RLS를 건너뛴다.
// A·B는 데스크 메일이 하나씩 있다(K·L)
async function resetData() {
  await operator()
  await db.exec('truncate auth.users cascade')
  hospital = {}
  for (const [user, status] of Object.entries(STATUS)) {
    await db.query('insert into auth.users (id, email) values ($1, $2)', [user, emailOf(user)])
    if (status === null) continue
    const [row] = await rows(
      `insert into public.hospitals (owner_id, name, applicant_name, email, status)
       values ($1, $2, '홍길동', $3, $4) returning id`,
      [user, NAME[user], emailOf(user), status],
    )
    hospital[user] = row.id as string
  }
  await seedMember(A, emailOf(K), K_ADDED)
  await seedMember(B, emailOf(L))
}

/** 운영자가 그 병원의 데스크 줄을 넣고 id를 돌려준다 */
async function seedMember(owner: string, email: string, createdAt?: string) {
  await operator()
  const [row] = await rows(
    `insert into ${MEMBERS} (hospital_id, email, created_at) values ($1, $2, coalesce($3::timestamptz, now())) returning id`,
    [hospital[owner], email, createdAt ?? null],
  )
  return row.id as string
}

/** 운영자 눈으로 본 데스크 줄 전체 */
async function membersNow() {
  await operator()
  return rows(`select hospital_id, email, role from ${MEMBERS} order by email`)
}

/** 지금 역할로 값 칸만 넣는 insert 문(칸 이름은 시험이 정한 것뿐) */
function insertInto(table: string, values: Row, returning = 'hospital_id') {
  const columns = Object.keys(values)
  return db.query<Row>(
    `insert into ${table} (${columns.join(', ')}) values (${columns.map((_, i) => `$${i + 1}`).join(', ')}) returning ${returning}`,
    columns.map((column) => values[column]),
  )
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

type Seeded = { spend: string; group: string; appt: string; allday: string }

/** 운영자가 그 병원의 세 탭 표(열 개)에 한 줄씩 넣는다(RLS·칸 권한을 건너뛴다) */
async function seedTabs(owner: string, apptDay = DAY): Promise<Seeded> {
  await operator()
  const h = hospital[owner]
  const tag = owner.slice(-1)
  const one = async (sql: string, params: unknown[]) => (await rows(sql, params))[0]?.id as string
  await db.query(`insert into public.worklog_days (hospital_id, work_date, memo) values ($1, $2, $3)`, [h, DAY, `${tag} 업무`])
  await db.query(`insert into public.worklog_settings (hospital_id, cash_float) values ($1, 100000)`, [h])
  await db.query(`insert into public.sunap_days (hospital_id, work_date, visits) values ($1, $2, 7)`, [h, DAY])
  const spend = await one(
    `insert into public.sunap_spends (hospital_id, work_date, kind, memo, amount) values ($1, $2, 'cash', '가짜 지출', 5000) returning id`,
    [h, DAY],
  )
  await db.query(`insert into public.sunap_settings (hospital_id, block_group) values ($1, $2)`, [h, GROUP])
  const group = await one(`insert into public.stats_rx_groups (hospital_id, name, codes) values ($1, $2, $3) returning id`, [h, `묶음${tag}`, [`CODE${tag}`]])
  await db.query(`insert into public.calendar_settings (hospital_id, open_hour) values ($1, 9)`, [h])
  const columns = Object.keys(APPT)
  const appt = await one(
    `insert into public.calendar_appts (hospital_id, ${columns.join(', ')}) values ($1, ${columns.map((_, i) => `$${i + 2}`).join(', ')}) returning id`,
    [h, ...columns.map((c) => (c === 'day' ? apptDay : APPT[c]))],
  )
  const allday = await one(`insert into public.calendar_allday (hospital_id, day, type, memo) values ($1, $2, 'memo', '가짜 메모') returning id`, [h, DAY])
  await db.query(`insert into public.calendar_rev (hospital_id, rev) values ($1, 5)`, [h])
  return { spend, group, appt, allday }
}

/** 운영자 눈으로 본 세 탭 표 전체(바뀌지 않았는지 견줄 때) */
async function snapshot() {
  await operator()
  const shot: Row = {}
  for (const table of DESK_TABLES) {
    shot[table] = await rows(`select hospital_id, (to_jsonb(t) - 'hospital_id')::text as body from ${table} t order by 1, 2`)
  }
  return shot
}

/** 지금 역할로 본 그 표 줄들의 병원 id */
async function hospitalsSeenIn(table: string) {
  return (await rows(`select hospital_id from ${table}`)).map((r) => r.hospital_id)
}

/** 운영자 눈으로 본 그 병원 rev(줄 없으면 null) */
async function revOf(owner: string): Promise<number | null> {
  await operator()
  const found = await rows(`select rev::int as rev from public.calendar_rev where hospital_id = $1`, [hospital[owner]])
  return found.length === 0 ? null : (found[0].rev as number)
}

/** 지금 역할로 데스크 메일 더하기 */
async function addDesk(email: string | null) {
  const [row] = await rows(`select public.add_desk_member($1) as answer`, [email])
  return row.answer
}

beforeAll(async () => {
  db = await PGlite.create()
  await migrate(db)
}, 180_000)

afterAll(async () => {
  await db.close()
})

beforeEach(resetData)

describe('AC-6303.1 표·함수 모양', SLOW, () => {
  it('AC-6303.1: hospital_members 칸은 id(gen_random_uuid())·hospital_id·email·role(기본 desk)·created_at(now())이고 모두 비울 수 없다', async () => {
    const found = await rows(
      `select column_name, udt_name, is_nullable, column_default from information_schema.columns
       where table_schema = 'public' and table_name = 'hospital_members' order by ordinal_position`,
    )
    expect(found).toEqual([
      { column_name: 'id', udt_name: 'uuid', is_nullable: 'NO', column_default: 'gen_random_uuid()' },
      { column_name: 'hospital_id', udt_name: 'uuid', is_nullable: 'NO', column_default: null },
      { column_name: 'email', udt_name: 'text', is_nullable: 'NO', column_default: null },
      { column_name: 'role', udt_name: 'text', is_nullable: 'NO', column_default: "'desk'::text" },
      { column_name: 'created_at', udt_name: 'timestamptz', is_nullable: 'NO', column_default: 'now()' },
    ])
  })

  it('AC-6303.1: 기본 키는 id, 바깥 키는 병원 표(지우면 함께 지움), email은 표 전체에서 하나뿐이고 (hospital_id) 색인이 있다', async () => {
    const found = await rows(
      `select contype, pg_get_constraintdef(oid) as def from pg_constraint
       where conrelid = to_regclass($1) and contype in ('p', 'f', 'u') order by contype`,
      [MEMBERS],
    )
    expect(found).toEqual([
      { contype: 'f', def: expect.stringMatching(/^FOREIGN KEY \(hospital_id\) REFERENCES (public\.)?hospitals\(id\) ON DELETE CASCADE$/) },
      { contype: 'p', def: 'PRIMARY KEY (id)' },
      { contype: 'u', def: 'UNIQUE (email)' },
    ])
    const indexes = await rows(`select indexdef from pg_indexes where schemaname = 'public' and tablename = 'hospital_members'`)
    expect(indexes.map((r) => String(r.indexdef).replace(/^.* USING btree /, ''))).toContain('(hospital_id)')
  })

  it.each<[string, string]>([
    ['앞 빈칸', ' x@fake.test'],
    ['뒤 빈칸', 'x@fake.test '],
    ['대문자', 'X@fake.test'],
    ['골뱅이 없음', 'xfake.test'],
    ['점 없는 도메인', 'x@fake'],
    ['골뱅이 둘', 'x@y@fake.test'],
    ['가운데 빈칸', 'x y@fake.test'],
    ['앞이 빔', '@fake.test'],
    ['255자', `${'x'.repeat(255 - '@fake.test'.length)}@fake.test`],
  ])('AC-6303.1: email이 %s(%j)이면 거부(23514)된다', async (_name, email) => {
    await operator()
    await expect(db.query(`insert into ${MEMBERS} (hospital_id, email) values ($1, $2)`, [hospital[A], email])).rejects.toMatchObject(CHECK_FAILED)
  })

  it('AC-6303.1: 소문자 메일 모양 254자는 들어가고, 같은 메일은 다른 병원이어도 거부(23505)되며, role은 desk 밖이면 거부(23514)된다', async () => {
    await operator()
    const long = `${'x'.repeat(254 - '@fake.test'.length)}@fake.test`
    await db.query(`insert into ${MEMBERS} (hospital_id, email) values ($1, $2)`, [hospital[A], long])
    await expect(db.query(`insert into ${MEMBERS} (hospital_id, email) values ($1, $2)`, [hospital[B], emailOf(K)])).rejects.toMatchObject(UNIQUE_FAILED)
    await expect(db.query(`insert into ${MEMBERS} (hospital_id, email, role) values ($1, 'y@fake.test', 'owner')`, [hospital[A]])).rejects.toMatchObject(
      CHECK_FAILED,
    )
    expect((await membersNow()).map((r) => [r.email, r.role])).toEqual([
      [emailOf(K), 'desk'],
      [emailOf(L), 'desk'],
      [long, 'desk'],
    ])
  })

  it('AC-6303.1: 병원 줄을 지우면 그 병원 데스크 줄도 지워지고 다른 병원 줄은 그대로다', async () => {
    await operator()
    await db.query('delete from public.hospitals where id = $1', [hospital[A]])
    expect((await membersNow()).map((r) => r.email)).toEqual([emailOf(L)])
  })

  it('AC-6303.1: RLS가 켜져 있고, 정책이 없으며, anon·authenticated·PUBLIC에게 표·칸 권한이 하나도 없다', async () => {
    expect(await rows(`select relrowsecurity as on from pg_class where oid = to_regclass($1)`, [MEMBERS])).toEqual([{ on: true }])
    expect(await rows(`select policyname from pg_policies where schemaname = 'public' and tablename = 'hospital_members'`)).toEqual([])
    expect(
      await rows(
        `select grantee, privilege_type from information_schema.role_table_grants
         where table_schema = 'public' and table_name = 'hospital_members' and grantee in ('anon', 'authenticated', 'PUBLIC')`,
      ),
    ).toEqual([])
    for (const role of ['anon', 'authenticated']) {
      for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']) {
        expect([role, privilege, (await rows(`select has_any_column_privilege($1, $2, $3) as ok`, [role, MEMBERS, privilege]))[0].ok]).toEqual([
          role,
          privilege,
          false,
        ])
      }
      for (const privilege of ['DELETE', 'TRUNCATE', 'TRIGGER']) {
        expect([role, privilege, (await rows(`select has_table_privilege($1, $2, $3) as ok`, [role, MEMBERS, privilege]))[0].ok]).toEqual([
          role,
          privilege,
          false,
        ])
      }
    }
  })

  it('AC-6303.1: 로그인한 사용자(원장·데스크)도 표를 바로 읽고 쓰고 지우지 못한다(함수로만)', async () => {
    for (const user of [A, K]) {
      await become(user)
      await expect(db.query(`select * from ${MEMBERS}`)).rejects.toMatchObject(DENIED)
      await expect(db.query(`insert into ${MEMBERS} (hospital_id, email) values ($1, 'z@fake.test')`, [hospital[A]])).rejects.toMatchObject(DENIED)
      await expect(db.query(`update ${MEMBERS} set email = 'z@fake.test'`)).rejects.toMatchObject(DENIED)
      await expect(db.query(`delete from ${MEMBERS}`)).rejects.toMatchObject(DENIED)
    }
    expect(await membersNow()).toHaveLength(2)
  })

  it.each(FUNCTIONS)(
    'AC-6303.1: 함수 %s는 정의자 권한·search_path 빔이고 public·anon은 못 부르며 authenticated만 부른다',
    async (name, signature, result, volatility) => {
      const found = await rows(
        `select p.prosecdef as definer, p.proconfig as config, p.provolatile as volatility, pg_get_function_result(p.oid) as result
         from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = $1`,
        [name],
      )
      expect(found).toEqual([{ definer: true, config: ['search_path=""'], volatility, result }])
      expect((await rows(`select has_function_privilege('anon', $1, 'EXECUTE') as ok`, [signature]))[0].ok).toBe(false)
      expect((await rows(`select has_function_privilege('authenticated', $1, 'EXECUTE') as ok`, [signature]))[0].ok).toBe(true)
      const [acl] = await rows(`select coalesce(array_to_string(proacl, ','), '') as acl from pg_proc where proname = $1`, [name])
      expect(String(acl.acl)).not.toMatch(/(^|,)=/) // PUBLIC 몫 없음
    },
  )

  it('AC-6303.1: anon은 새 함수를 하나도 부르지 못한다(권한 없음)', async () => {
    await becomeAnon()
    for (const [, signature] of FUNCTIONS) {
      const call = signature.replace('(text)', "('x@fake.test')").replace('(uuid)', `('${GROUP}')`)
      await expect(db.query(`select * from ${call}`)).rejects.toMatchObject(DENIED)
    }
  })

  it.each(DESK_WRITE)('AC-6303.1: %s의 hospital_id 기본값은 my_clinic_hospital_id()다', async (table) => {
    const [column] = await rows(
      `select column_default from information_schema.columns where table_schema = 'public' and table_name = $1 and column_name = 'hospital_id'`,
      [nameOf(table)],
    )
    expect(column.column_default).toMatch(/^(public\.)?my_clinic_hospital_id\(\)$/)
  })

  it.each(['public.worklog_settings', 'public.stats_rx_groups', ...CLOSED.filter((t) => t !== 'public.hospitals' && t !== 'public.admins')])(
    'AC-6303.1: %s의 hospital_id 기본값은 그대로다(my_clinic_hospital_id()가 아니다)',
    async (table) => {
      const [column] = await rows(
        `select coalesce(column_default, '') as d from information_schema.columns
         where table_schema = 'public' and table_name = $1 and column_name = 'hospital_id'`,
        [nameOf(table)],
      )
      expect(column.d).not.toMatch(/my_clinic_hospital_id/)
    },
  )

  it.each<[string, string]>([
    ...DESK_WRITE.map((t): [string, string] => [t, 'ALL']),
    ...DESK_READ.map((t): [string, string] => [t, 'SELECT']),
  ])('AC-6303.1: %s에 데스크 정책 하나(%s, authenticated, my_desk_hospital_id())가 더해지고 원장 정책은 my_hospital_id() 그대로다', async (table, cmd) => {
    const list = await rows(
      `select policyname, cmd, permissive, roles::text as roles, coalesce(qual, '') as qual, coalesce(with_check, '') as with_check from pg_policies
       where schemaname = 'public' and tablename = $1 order by policyname`,
      [nameOf(table)],
    )
    const desk = list.filter((p) => String(p.policyname).startsWith('데스크'))
    expect(desk).toHaveLength(1)
    expect(desk[0]).toMatchObject({ cmd, permissive: 'PERMISSIVE', roles: '{authenticated}' })
    expect(desk[0].qual).toMatch(/^\(hospital_id = \( SELECT (public\.)?my_desk_hospital_id\(\) AS my_desk_hospital_id\)\)$/)
    if (cmd === 'ALL') expect(desk[0].with_check).toBe(desk[0].qual)
    const owner = list.filter((p) => !String(p.policyname).startsWith('데스크'))
    expect(owner.length).toBeGreaterThan(0)
    for (const policy of owner) {
      expect(`${policy.qual} ${policy.with_check}`).toMatch(/my_hospital_id\(\)/)
      expect(`${policy.qual} ${policy.with_check}`).not.toMatch(/my_desk_hospital_id|my_clinic_hospital_id/)
    }
  })

  it.each(CLOSED.filter((t) => t !== 'public.hospitals'))('AC-6303.1: 닫힌 표 %s에는 데스크 정책이 없다', async (table) => {
    const list = await rows(`select coalesce(qual, '') || coalesce(with_check, '') as text from pg_policies where schemaname = 'public' and tablename = $1`, [
      nameOf(table),
    ])
    for (const policy of list) expect(policy.text).not.toMatch(/my_desk_hospital_id|my_clinic_hospital_id/)
  })

  it('AC-6303.1: hospitals에는 restrictive 넣기 정책 하나(데스크 메일이 아닐 때만)가 더해지고 기존 정책은 그대로다', async () => {
    const list = await rows(
      `select policyname, cmd, permissive, roles::text as roles, qual, with_check from pg_policies
       where schemaname = 'public' and tablename = 'hospitals' order by policyname`,
    )
    expect(list.map((p) => [p.policyname, p.cmd, p.permissive])).toEqual(
      [
        ['내 병원 또는 관리자는 모든 병원 읽기', 'SELECT', 'PERMISSIVE'],
        ['내 병원 가입 신청(pending만)', 'INSERT', 'PERMISSIVE'],
        ['데스크 메일은 병원 가입 못 함', 'INSERT', 'RESTRICTIVE'],
      ].sort((x, y) => x[0].localeCompare(y[0])),
    )
    const restrictive = list.find((p) => p.permissive === 'RESTRICTIVE')
    expect(restrictive).toMatchObject({ roles: '{authenticated}', qual: null })
    expect(restrictive?.with_check).toMatch(/\( SELECT (public\.)?my_desk_hospital_id\(\) AS my_desk_hospital_id\) IS NULL/)
  })

  it.each<[string, boolean]>([
    ['calendar_bump', true],
    ['calendar_appts_prune', false],
  ])('AC-6303.1: 예약 트리거 함수 %s는 my_clinic_hospital_id()를 쓰고(security definer = %s 그대로) 누구도 바로 부르지 못한다', async (name, definer) => {
    const [fn] = await rows(
      `select prosecdef as definer, proconfig as config, prosrc as src, coalesce(array_to_string(proacl, ','), '') as acl from pg_proc
       where pronamespace = 'public'::regnamespace and proname = $1`,
      [name],
    )
    expect(fn).toMatchObject({ definer, config: ['search_path=""'] })
    expect(fn.src).toContain('public.my_clinic_hospital_id()')
    expect(fn.src).not.toContain('public.my_hospital_id()')
    for (const role of ['anon', 'authenticated']) {
      expect([role, (await rows(`select has_function_privilege($1, $2, 'EXECUTE') as ok`, [role, `public.${name}()`]))[0].ok]).toEqual([role, false])
    }
    expect(String(fn.acl)).not.toMatch(/(^|,)=/)
  })

  it('AC-6303.1: 파일이 있고 줄 끝이 LF이며, 머리 주석에 붙여 넣는 방법·앞 migration·ADR-031·예약 SQL을 다시 붙이면 이 파일도 다시 붙인다는 말이 있다', () => {
    expect(DESK_MIGRATION).not.toBe('')
    expect(DESK_MIGRATION).not.toContain('\r')
    const lines = DESK_MIGRATION.split('\n')
    const head = lines.slice(0, lines.findIndex((line) => !/^(--|\s*$)/.test(line))).join('\n')
    expect(head).toContain('운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다')
    expect(head).toContain('ADR-031')
    expect(head).toContain('20261116000000_sunap.sql')
    expect(head).toContain('20261117010000_calendar.sql')
    expect(head).toMatch(/20261117010000_calendar\.sql[^\n]*다시 붙여 넣으면[^\n]*이 파일도 다시/)
  })

  it('AC-6303.1: 두 번 돌려도 되는 문장만 쓰고(표·색인 if not exists, 함수 or replace, 정책 지우고 다시 만들기), my_hospital_id()는 다시 만들지 않는다', () => {
    const count = (pattern: RegExp) => (DESK_TOP.match(pattern) ?? []).length
    expect(count(/create\s+table\s+if\s+not\s+exists\s+public\.hospital_members\b/gi)).toBe(1)
    expect(DESK_TOP).not.toMatch(/create\s+table\s+(?!if\s+not\s+exists)/i)
    expect(DESK_TOP).not.toMatch(/create\s+(unique\s+)?index\s+(?!if\s+not\s+exists)/i)
    expect(DESK_TOP).not.toMatch(/create\s+function/i)
    expect(DESK_TOP).not.toMatch(/create\s+(or\s+replace\s+)?(constraint\s+)?trigger/i)
    expect(count(/create\s+or\s+replace\s+function/gi)).toBe(FUNCTIONS.length + 2)
    expect(DESK_TOP).not.toMatch(/^\s*(drop\s+(?!policy\s+if\s+exists)|truncate|delete|update|insert)\b/im)
    expect(count(/create\s+policy/gi)).toBe(DESK_TABLES.length + 1)
    expect(count(/drop\s+policy\s+if\s+exists/gi)).toBe(count(/create\s+policy/gi))
    // my_hospital_id()는 앞 migration 것을 쓴다(여기서 다시 만들거나 권한을 바꾸지 않는다)
    expect(DESK_TOP).not.toMatch(/function\s+public\.my_hospital_id\b/i)
    // 고치는 표 칸은 hospital_id 기본값뿐이다
    for (const [statement] of DESK_TOP.matchAll(/^\s*alter\s+table[^;]+;/gim)) {
      expect(statement).toMatch(/^\s*alter\s+table\s+public\.\w+\s+(alter\s+column\s+hospital_id\s+set\s+default\s+public\.my_clinic_hospital_id\(\)|enable\s+row\s+level\s+security);$/i)
    }
  })

  it('AC-6303.1: hospital_members 표 권한은 revoke all만 있고 grant는 없다', () => {
    expect(DESK_TOP).toMatch(/revoke all on table public\.hospital_members from anon, authenticated;/)
    expect(DESK_TOP).not.toMatch(/grant [^;]+ on table public\.hospital_members/)
  })

  // 데스크 표·새 함수·예약 트리거 함수·my_hospital_id·데스크가 닿는 표의 기본값과 정책
  async function shape(target: PGlite) {
    const q = (sql: string, params: unknown[] = []) => rows(sql, params, target)
    return {
      columns: await q(
        `select column_name, data_type, is_nullable, column_default from information_schema.columns
         where table_schema = 'public' and table_name = 'hospital_members' order by ordinal_position`,
      ),
      constraints: await q(`select conname, contype, pg_get_constraintdef(oid) as def from pg_constraint where conrelid = 'public.hospital_members'::regclass order by 1`),
      indexes: await q(`select indexname, indexdef from pg_indexes where schemaname = 'public' and tablename = 'hospital_members' order by 1`),
      access: await q(
        `select c.relrowsecurity, (select array_agg(item::text order by item::text) from unnest(c.relacl) item) as acl
         from pg_class c where c.oid = 'public.hospital_members'::regclass`,
      ),
      functions: await q(
        `select proname, prosecdef, provolatile, proconfig, prosrc, (select array_agg(item::text order by item::text) from unnest(proacl) item) as acl
         from pg_proc where pronamespace = 'public'::regnamespace and proname = any($1) order by proname`,
        [[...FUNCTIONS.map(([name]) => name), 'calendar_bump', 'calendar_appts_prune', 'my_hospital_id']],
      ),
      defaults: await q(
        `select table_name, column_default from information_schema.columns
         where table_schema = 'public' and column_name = 'hospital_id' and table_name = any($1) order by 1`,
        [DESK_TABLES.map(nameOf)],
      ),
      policies: await q(
        `select tablename, policyname, cmd, permissive, roles::text[] as roles, qual, with_check from pg_policies
         where schemaname = 'public' and tablename = any($1) order by 1, 2`,
        [[...DESK_TABLES.map(nameOf), 'hospitals', 'hospital_members']],
      ),
    }
  }

  it('AC-6303.1: my_hospital_id()의 글자·권한은 이 파일 전과 같고, 같은 DB에 두 번 돌려도 모양과 이미 있던 줄이 그대로다', async () => {
    const fresh = await PGlite.create()
    try {
      await migrate(fresh, false)
      const ownerFn = () =>
        rows(
          `select pg_get_functiondef('public.my_hospital_id()'::regprocedure) as def,
                  (select array_agg(item::text order by item::text) from unnest(proacl) item) as acl
           from pg_proc where oid = 'public.my_hospital_id()'::regprocedure`,
          [],
          fresh,
        )
      const before = await ownerFn()
      expect(String(before[0].def)).toContain("h.status = 'approved'")

      await fresh.exec(DESK_MIGRATION)
      expect(await ownerFn()).toEqual(before)
      const once = await shape(fresh)
      expect(once.functions).toHaveLength(FUNCTIONS.length + 3)

      await fresh.query('insert into auth.users (id, email) values ($1, $2)', [A, emailOf(A)])
      const [h] = await rows(
        `insert into public.hospitals (owner_id, name, applicant_name, email, status) values ($1, '가짜병원', '홍길동', $2, 'approved') returning id`,
        [A, emailOf(A)],
        fresh,
      )
      await fresh.query(`insert into ${MEMBERS} (hospital_id, email) values ($1, $2)`, [h.id, emailOf(K)])
      await fresh.query(`insert into public.sunap_settings (hospital_id, block_group) values ($1, $2)`, [h.id, GROUP])
      await fresh.query(`insert into public.calendar_rev (hospital_id, rev) values ($1, 41)`, [h.id])
      const seeded = async () => ({
        members: await rows(`select id, hospital_id, email, role, created_at::text as at from ${MEMBERS}`, [], fresh),
        settings: await rows(`select hospital_id, block_group from public.sunap_settings`, [], fresh),
        rev: await rows(`select rev::int as rev from public.calendar_rev`, [], fresh),
      })
      const data = await seeded()

      await fresh.exec(DESK_MIGRATION)

      expect(await shape(fresh)).toEqual(once)
      expect(await seeded()).toEqual(data)
      expect(data.members).toHaveLength(1)
      expect(await ownerFn()).toEqual(before)
    } finally {
      await fresh.close()
    }
  }, 240_000)
})

describe('AC-6303.2 add_desk_member', SLOW, () => {
  it("AC-6303.2: 원장이 메일을 더하면 앞뒤 빈칸을 빼고 소문자로 바꿔 그 병원 줄로 넣고 'added'를 돌려준다", async () => {
    await become(A)
    expect(await addDesk('  New.Desk@FAKE.test ')).toBe('added')
    await operator()
    const added = await rows(`select hospital_id, email, role, created_at > now() - interval '1 minute' as fresh from ${MEMBERS} where email like 'new%'`)
    expect(added).toEqual([{ hospital_id: hospital[A], email: 'new.desk@fake.test', role: 'desk', fresh: true }])
  })

  it.each<[string, string | null]>([
    ['빈 글자', ''],
    ['빈칸만', '   '],
    ['null', null],
    ['골뱅이 없음', 'deskfake.test'],
    ['점 없는 도메인', 'desk@fake'],
    ['골뱅이 둘', 'desk@x@fake.test'],
    ['가운데 빈칸', 'de sk@fake.test'],
    ['앞이 빔', '@fake.test'],
    ['255자', `${'x'.repeat(255 - '@fake.test'.length)}@fake.test`],
  ])("AC-6303.2: 메일이 %s이면 'bad'이고 아무것도 넣지 않는다", async (_name, email) => {
    await become(A)
    expect(await addDesk(email)).toBe('bad')
    expect(await membersNow()).toHaveLength(2)
  })

  it("AC-6303.2: 254자 메일 모양은 'added'다", async () => {
    await become(A)
    expect(await addDesk(`${'x'.repeat(254 - '@fake.test'.length)}@fake.test`)).toBe('added')
  })

  it.each<[string, string]>([
    ['내 병원(승인) 가입 메일', 'a@fake.test'],
    ['다른 병원(승인) 가입 메일', 'b@fake.test'],
    ['승인 대기 가입 메일', 'c@fake.test'],
    ['거절된 가입 메일(대문자·빈칸)', ' D@Fake.Test '],
  ])("AC-6303.2: %s이면 'taken'이고 아무것도 넣지 않는다", async (_name, email) => {
    await become(A)
    expect(await addDesk(email)).toBe('taken')
    expect(await membersNow()).toHaveLength(2)
  })

  it.each<[string, string]>([
    ['이미 내 병원 데스크 메일', 'desk-a@fake.test'],
    ['다른 병원 데스크 메일(대문자)', 'DESK-B@fake.test'],
  ])("AC-6303.2: %s이면 'used'이고 아무것도 넣지 않는다", async (_name, email) => {
    await become(A)
    expect(await addDesk(email)).toBe('used')
    expect(await membersNow()).toHaveLength(2)
  })

  it("AC-6303.2: 가입 메일이면서 데스크 줄에도 있으면 'taken'이 먼저다", async () => {
    await seedMember(B, 'c@fake.test')
    await become(A)
    expect(await addDesk('c@fake.test')).toBe('taken')
  })

  it("AC-6303.2: 그 병원 데스크가 5개면 'limit'이고, 그때도 bad·taken·used가 먼저이며, 다른 병원은 그대로 더한다", async () => {
    await become(A)
    for (const n of [1, 2, 3, 4]) expect(await addDesk(`n${n}@fake.test`)).toBe('added')
    expect(await addDesk('n5@fake.test')).toBe('limit')
    expect(await addDesk('bad')).toBe('bad')
    expect(await addDesk('b@fake.test')).toBe('taken')
    expect(await addDesk('desk-b@fake.test')).toBe('used')
    await operator()
    expect((await rows(`select count(*)::int as n from ${MEMBERS} where hospital_id = $1`, [hospital[A]]))[0].n).toBe(5)
    await become(B)
    expect(await addDesk('n5@fake.test')).toBe('added')
    expect((await membersNow()).filter((r) => r.hospital_id === hospital[B]).map((r) => r.email)).toEqual([emailOf(L), 'n5@fake.test'])
  })

  it.each<[string, string]>([
    ['승인 대기', C],
    ['거절', D],
    ['병원 줄 없음', E],
    ['데스크', K],
  ])('AC-6303.2: 원장이 아닌 사용자(%s)가 부르면 권한 오류(42501)이고 아무것도 넣지 않는다', async (_name, user) => {
    await become(user)
    await expect(addDesk('n1@fake.test')).rejects.toMatchObject(DENIED)
    await expect(addDesk('bad')).rejects.toMatchObject(DENIED)
    expect(await membersNow()).toHaveLength(2)
  })
})

describe('AC-6303.3 desk_members·remove_desk_member', SLOW, () => {
  const M1 = '00000000-0000-4000-8000-0000000000f1'
  const M2 = '00000000-0000-4000-8000-0000000000f2'

  async function list() {
    return rows(`select * from public.desk_members()`)
  }

  it('AC-6303.3: 원장은 내 병원 데스크만 더한 차례로 (id, email, created_at, signed_in_at)을 받는다', async () => {
    const m3 = await seedMember(A, 'm3@fake.test', '2026-11-07T00:00:00.000Z')
    const m1 = await seedMember(A, 'm1@fake.test', '2026-11-01T00:00:00.000Z')
    const m2 = await seedMember(A, 'm2@fake.test', '2026-11-05T00:00:00.000Z')
    await become(A)
    const found = await list()
    expect(found.map((r) => Object.keys(r))).toEqual(found.map(() => ['id', 'email', 'created_at', 'signed_in_at']))
    expect(found.map((r) => [r.id, r.email])).toEqual([
      [m1, 'm1@fake.test'],
      [m2, 'm2@fake.test'],
      [m3, 'm3@fake.test'],
      [expect.any(String), emailOf(K)],
    ])
    expect((found[0].created_at as Date).toISOString()).toBe('2026-11-01T00:00:00.000Z')
  })

  it('AC-6303.3: 더한 시각이 같으면 id 차례다', async () => {
    const ids = [await seedMember(A, 'p1@fake.test', '2026-11-01T00:00:00.000Z'), await seedMember(A, 'p2@fake.test', '2026-11-01T00:00:00.000Z')]
    await become(A)
    expect((await list()).slice(0, 2).map((r) => r.id)).toEqual([...ids].sort())
  })

  it('AC-6303.3: signed_in_at은 그 메일 계정의 마지막 로그인이 더한 시각보다 뒤일 때만 그 시각, 아니면 null이다(계정 없음도 null)', async () => {
    await seedMember(A, 'm1@fake.test', '2026-11-01T00:00:00.000Z')
    await seedMember(A, 'm2@fake.test', '2026-11-05T00:00:00.000Z')
    await seedMember(A, 'm3@fake.test', '2026-11-07T00:00:00.000Z')
    await operator()
    // m1은 더하기 전에 로그인, m2는 계정 메일이 대문자이고 더한 뒤 로그인, m3은 계정 없음, K는 더한 뒤 로그인
    await db.query(`insert into auth.users (id, email, last_sign_in_at) values ($1, 'm1@fake.test', '2026-10-20T00:00:00Z')`, [M1])
    await db.query(`insert into auth.users (id, email, last_sign_in_at) values ($1, 'M2@Fake.Test', '2026-11-12T03:00:00Z')`, [M2])
    await db.query(`update auth.users set last_sign_in_at = '2026-11-15T01:00:00Z' where id = $1`, [K])
    await become(A)
    const found = await list()
    expect(found.map((r) => [r.email, r.signed_in_at === null ? null : (r.signed_in_at as Date).toISOString()])).toEqual([
      ['m1@fake.test', null],
      ['m2@fake.test', '2026-11-12T03:00:00.000Z'],
      ['m3@fake.test', null],
      [emailOf(K), '2026-11-15T01:00:00.000Z'],
    ])
  })

  it('AC-6303.3: 다른 병원 원장은 자기 데스크만 보고, 원장이 아닌 사용자(대기·거절·병원 없음·데스크)는 빈 목록이다', async () => {
    await become(B)
    expect((await list()).map((r) => r.email)).toEqual([emailOf(L)])
    for (const user of [C, D, E, K, L]) {
      await become(user)
      expect([user, await list()]).toEqual([user, []])
    }
  })

  it('AC-6303.3: remove_desk_member는 내 병원 줄만 지우고, 남의 병원 id면 아무것도 하지 않는다', async () => {
    const mine = await seedMember(A, 'm1@fake.test')
    await operator()
    const [other] = await rows(`select id from ${MEMBERS} where email = $1`, [emailOf(L)])
    await become(A)
    await db.query(`select public.remove_desk_member($1)`, [other.id])
    expect((await membersNow()).map((r) => r.email)).toEqual([emailOf(K), emailOf(L), 'm1@fake.test'])
    await become(A)
    await db.query(`select public.remove_desk_member($1)`, [mine])
    expect((await membersNow()).map((r) => r.email)).toEqual([emailOf(K), emailOf(L)])
  })

  it('AC-6303.3: 원장이 아닌 사용자가 remove_desk_member를 불러도 아무 줄도 지워지지 않는다', async () => {
    await operator()
    const ids = (await rows(`select id from ${MEMBERS}`)).map((r) => r.id)
    for (const user of [C, D, E, K, L]) {
      await become(user)
      for (const id of ids) await db.query(`select public.remove_desk_member($1)`, [id])
    }
    expect(await membersNow()).toHaveLength(2)
  })
})

describe('AC-6303.4 데스크는 A의 세 탭 표만 읽고 쓴다', SLOW, () => {
  it('AC-6303.4: 데스크는 열 표에서 A의 줄만 보고 B의 줄은 안 보인다', async () => {
    await seedTabs(A)
    await seedTabs(B)
    await become(K)
    for (const table of DESK_TABLES) expect([table, await hospitalsSeenIn(table)]).toEqual([table, [hospital[A]]])
    await become(L)
    for (const table of DESK_TABLES) expect([table, await hospitalsSeenIn(table)]).toEqual([table, [hospital[B]]])
  })

  it('AC-6303.4: my_clinic_hospital_id()는 원장이면 내 병원, 데스크면 그 병원, 그 밖은 null이다', async () => {
    const clinic = async (user: string) => {
      await become(user)
      return (await rows(`select public.my_clinic_hospital_id() as id`))[0].id
    }
    expect(await clinic(A)).toBe(hospital[A])
    expect(await clinic(K)).toBe(hospital[A])
    expect(await clinic(L)).toBe(hospital[B])
    for (const user of [C, D, E]) expect([user, await clinic(user)]).toEqual([user, null])
  })

  it('AC-6303.4: 업무일지 하루(worklog_days): 데스크가 upsert로 넣으면 hospital_id는 A이고 고칠 수 있으며 지우기는 권한 없음이다', async () => {
    await seedTabs(B)
    await become(K)
    await postgrestUpsert('public.worklog_days', 'hospital_id, work_date', [{ work_date: DAY2, memo: '데스크가 적음', bit_fields: ['cash_in'] }])
    await postgrestUpsert('public.worklog_days', 'hospital_id, work_date', [{ work_date: DAY2, memo: '데스크가 고침', bit_fields: [] }])
    expect((await db.query(`update public.worklog_days set cash_in = '1000' where work_date = $1`, [DAY2])).affectedRows).toBe(1)
    await expect(db.query(`delete from public.worklog_days`)).rejects.toMatchObject(DENIED)
    await operator()
    expect(await rows(`select hospital_id, work_date::text as day, memo, cash_in from public.worklog_days order by 1`)).toEqual(
      [
        { hospital_id: hospital[A], day: DAY2, memo: '데스크가 고침', cash_in: '1000' },
        { hospital_id: hospital[B], day: DAY, memo: 'b 업무', cash_in: null },
      ].sort((x, y) => x.hospital_id.localeCompare(y.hospital_id)),
    )
  })

  it('AC-6303.4: 수납일지 마감·지출(sunap_days·sunap_spends): 데스크가 넣고 고치고 지우며 hospital_id는 A다', async () => {
    await become(K)
    await postgrestUpsert('public.sunap_days', 'hospital_id, work_date', [{ work_date: DAY, closed_at: NEW_AT, late: false, visits: 3 }])
    await postgrestUpsert('public.sunap_days', 'hospital_id, work_date', [{ work_date: DAY, closed_at: NEW_AT, late: true, visits: 4 }])
    const { rows: spend } = await insertInto('public.sunap_spends', { work_date: DAY, kind: 'parking', memo: '주차 지원', amount: 3000 }, 'id, hospital_id')
    expect(spend[0].hospital_id).toBe(hospital[A])
    expect((await db.query(`update public.sunap_spends set amount = 4000 where id = $1`, [spend[0].id])).affectedRows).toBe(1)
    await operator()
    expect(await rows(`select hospital_id, late, visits from public.sunap_days`)).toEqual([{ hospital_id: hospital[A], late: true, visits: 4 }])
    expect(await rows(`select hospital_id, amount from public.sunap_spends`)).toEqual([{ hospital_id: hospital[A], amount: 4000 }])
    await become(K)
    expect((await db.query(`delete from public.sunap_spends where id = $1`, [spend[0].id])).affectedRows).toBe(1)
    expect((await db.query(`delete from public.sunap_days where work_date = $1`, [DAY])).affectedRows).toBe(1)
    await operator()
    expect(await rows(`select * from public.sunap_days`)).toEqual([])
    expect(await rows(`select * from public.sunap_spends`)).toEqual([])
  })

  it('AC-6303.4: 수납일지 설정·예약 설정(sunap_settings·calendar_settings): 데스크가 upsert로 넣고 고치며 지우기는 권한 없음이다', async () => {
    await become(K)
    await postgrestUpsert('public.sunap_settings', 'hospital_id', [{ block_group: GROUP, pt_group: null }])
    await postgrestUpsert('public.sunap_settings', 'hospital_id', [{ block_group: null, pt_group: GROUP }])
    await postgrestUpsert('public.calendar_settings', 'hospital_id', [{ open_hour: 9, sunday: true }])
    await postgrestUpsert('public.calendar_settings', 'hospital_id', [{ open_hour: 10, sunday: false }])
    await expect(db.query(`delete from public.sunap_settings`)).rejects.toMatchObject(DENIED)
    await expect(db.query(`delete from public.calendar_settings`)).rejects.toMatchObject(DENIED)
    await operator()
    expect(await rows(`select hospital_id, block_group, pt_group from public.sunap_settings`)).toEqual([
      { hospital_id: hospital[A], block_group: null, pt_group: GROUP },
    ])
    expect(await rows(`select hospital_id, open_hour, sunday from public.calendar_settings`)).toEqual([{ hospital_id: hospital[A], open_hour: 10, sunday: false }])
  })

  it('AC-6303.4: 예약·종일 줄(calendar_appts·calendar_allday): 데스크가 예약은 넣고 고치고 지우고, 종일 줄은 넣고 지우며 고치기는 권한 없음이다', async () => {
    await become(K)
    const { rows: appt } = await insertInto('public.calendar_appts', APPT, 'id, hospital_id')
    expect(appt[0].hospital_id).toBe(hospital[A])
    expect((await db.query(`update public.calendar_appts set memo = '데스크 고침', status = 'came' where id = $1`, [appt[0].id])).affectedRows).toBe(1)
    const { rows: day } = await insertInto('public.calendar_allday', MEMO_DAY, 'id, hospital_id')
    expect(day[0].hospital_id).toBe(hospital[A])
    await expect(db.query(`update public.calendar_allday set memo = '고침'`)).rejects.toMatchObject(DENIED)
    await operator()
    expect(await rows(`select memo, status from public.calendar_appts`)).toEqual([{ memo: '데스크 고침', status: 'came' }])
    await become(K)
    expect((await db.query(`delete from public.calendar_appts where id = $1`, [appt[0].id])).affectedRows).toBe(1)
    expect((await db.query(`delete from public.calendar_allday where id = $1`, [day[0].id])).affectedRows).toBe(1)
    await operator()
    expect(await rows(`select * from public.calendar_appts`)).toEqual([])
    expect(await rows(`select * from public.calendar_allday`)).toEqual([])
  })

  it('AC-6303.4: 읽기만 하는 표(worklog_settings·stats_rx_groups·calendar_rev): 데스크는 넣기·고치기·지우기로 아무것도 바꾸지 못한다', async () => {
    const { group } = await seedTabs(A)
    const before = await snapshot()
    await become(K)
    await expect(insertInto('public.worklog_settings', { cash_float: 1 })).rejects.toThrow(/row-level security|null value/)
    expect((await db.query(`update public.worklog_settings set cash_float = 1`)).affectedRows).toBe(0)
    await expect(db.query(`delete from public.worklog_settings`)).rejects.toMatchObject(DENIED)
    await expect(insertInto('public.stats_rx_groups', { name: '데스크 묶음', codes: ['ZZ1'] })).rejects.toThrow(/row-level security|null value/)
    expect((await db.query(`update public.stats_rx_groups set name = '바꿈' where id = $1`, [group])).affectedRows).toBe(0)
    expect((await db.query(`delete from public.stats_rx_groups where id = $1`, [group])).affectedRows).toBe(0)
    await expect(db.query(`insert into public.calendar_rev (hospital_id, rev) values ($1, 1)`, [hospital[A]])).rejects.toMatchObject(DENIED)
    await expect(db.query(`update public.calendar_rev set rev = 99`)).rejects.toMatchObject(DENIED)
    await expect(db.query(`delete from public.calendar_rev`)).rejects.toMatchObject(DENIED)
    expect(await snapshot()).toEqual(before)
  })

  it('AC-6303.4: 데스크는 hospital_id를 보내지도 고치지도 못한다(칸 권한 그대로)', async () => {
    await seedTabs(A)
    await become(K)
    await expect(insertInto('public.sunap_spends', { hospital_id: hospital[A], work_date: DAY, kind: 'cash', memo: '가짜', amount: 1 })).rejects.toMatchObject(DENIED)
    await expect(db.query(`update public.calendar_appts set hospital_id = $1`, [hospital[B]])).rejects.toMatchObject(DENIED)
  })

  it('AC-6303.4: 데스크는 B의 줄을 id로 고치거나 지워도 0줄이고 B의 줄은 그대로다', async () => {
    await seedTabs(A)
    const other = await seedTabs(B)
    const before = await snapshot()
    await become(K)
    expect((await db.query(`update public.worklog_days set memo = '바꿈' where hospital_id = $1`, [hospital[B]])).affectedRows).toBe(0)
    expect((await db.query(`update public.sunap_spends set amount = 1 where id = $1`, [other.spend])).affectedRows).toBe(0)
    expect((await db.query(`delete from public.sunap_spends where id = $1`, [other.spend])).affectedRows).toBe(0)
    expect((await db.query(`delete from public.sunap_days where hospital_id = $1`, [hospital[B]])).affectedRows).toBe(0)
    expect((await db.query(`update public.sunap_settings set pt_group = null where hospital_id = $1`, [hospital[B]])).affectedRows).toBe(0)
    expect((await db.query(`update public.calendar_settings set open_hour = 5 where hospital_id = $1`, [hospital[B]])).affectedRows).toBe(0)
    expect((await db.query(`update public.calendar_appts set memo = '바꿈' where id = $1`, [other.appt])).affectedRows).toBe(0)
    expect((await db.query(`delete from public.calendar_appts where id = $1`, [other.appt])).affectedRows).toBe(0)
    expect((await db.query(`delete from public.calendar_allday where id = $1`, [other.allday])).affectedRows).toBe(0)
    // 바뀜 숫자는 문장마다 A만 늘어난다(B는 그대로)
    const after = await snapshot()
    for (const table of DESK_TABLES) {
      const pick = (shot: Row) => (shot[table] as Row[]).filter((r) => r.hospital_id === hospital[B])
      expect([table, pick(after)]).toEqual([table, pick(before)])
    }
  })

  it('AC-6303.4: 원장은 지금과 같이 내 병원 줄만 넣고(기본값 = 내 병원) 보며, 대기·거절·병원 없음은 아무 줄도 못 보고 못 넣는다', async () => {
    await seedTabs(B)
    await become(A)
    const { rows: spend } = await insertInto('public.sunap_spends', { work_date: DAY, kind: 'cash', memo: '원장 지출', amount: 1 }, 'hospital_id')
    expect(spend[0].hospital_id).toBe(hospital[A])
    await postgrestUpsert('public.worklog_days', 'hospital_id, work_date', [{ work_date: DAY, memo: '원장' }])
    for (const table of DESK_TABLES) expect((await hospitalsSeenIn(table)).every((h) => h === hospital[A])).toBe(true)
    for (const user of [C, D, E]) {
      await become(user)
      for (const table of DESK_TABLES) expect([user, table, await hospitalsSeenIn(table)]).toEqual([user, table, []])
      await expect(insertInto('public.sunap_spends', { work_date: DAY, kind: 'cash', memo: '가짜', amount: 1 })).rejects.toThrow(/row-level security|null value/)
      await expect(insertInto('public.calendar_appts', APPT)).rejects.toThrow(/row-level security|null value/)
    }
  })
})

describe('AC-6303.5 데스크에게 닫힌 것', SLOW, () => {
  /** 운영자가 A의 닫힌 표에 한 줄씩 넣는다 */
  async function seedClosed() {
    await operator()
    const h = hospital[A]
    await db.query(`insert into public.admins (user_id) values ($1)`, [A])
    await db.query(`insert into public.stats_days (hospital_id, day, partial, source, payload) values ($1, $2, false, 'bit', $3)`, [
      h,
      DAY,
      JSON.stringify({ schemaVersion: 2, day: DAY, partial: false }),
    ])
    await db.query(`insert into public.stats_months (hospital_id, month, partial, source, payload) values ($1, '2026-11', false, 'bit', $2)`, [
      h,
      JSON.stringify({ schemaVersion: 2, month: '2026-11', partial: false }),
    ])
    await db.query(`insert into public.sales_days (hospital_id, day, unconfirmed, split_unconfirmed) values ($1, $2, true, false)`, [h, DAY])
    await db.query(`insert into public.claim_rule_settings (hospital_id, rule_id, enabled) values ($1, 'AB-01', true)`, [h])
    await db.query(`insert into public.message_templates (hospital_id, kind, name, body) values ($1, 'injection', '가짜', '가짜 문구')`, [h])
    await db.query(`insert into public.ai_reports (hospital_id, month, report, input_hash, model) values ($1, '2026-11', '{}', $2, 'fake')`, [
      h,
      'a'.repeat(64),
    ])
  }

  it.each(CLOSED)('AC-6303.5: 데스크는 %s에서 아무 줄도 보지 못한다(A의 줄이 있어도)', async (table) => {
    await seedClosed()
    await operator()
    expect((await rows(`select count(*)::int as n from ${table}`))[0].n).toBeGreaterThan(0)
    await become(K)
    expect(await rows(`select * from ${table}`)).toEqual([])
  })

  it('AC-6303.5: 데스크는 hospital_members를 바로 읽지 못한다(권한 없음)', async () => {
    await become(K)
    await expect(db.query(`select * from ${MEMBERS}`)).rejects.toMatchObject(DENIED)
  })

  it('AC-6303.5: 데스크는 worklog_settings·stats_rx_groups를 고치지 못하고 save_stats_rx_groups는 거부되거나 아무것도 바꾸지 않는다', async () => {
    const { group } = await seedTabs(A)
    const before = await snapshot()
    await become(K)
    expect((await db.query(`update public.worklog_settings set cash_float = 5`)).affectedRows).toBe(0)
    expect((await db.query(`update public.stats_rx_groups set codes = '{}'`)).affectedRows).toBe(0)
    const save = (groups: unknown) => db.query(`select * from public.save_stats_rx_groups($1::jsonb)`, [JSON.stringify(groups)])
    await expect(save([{ id: group, name: '바꿈', codes: [], sort_order: 0 }])).rejects.toThrow()
    await become(K)
    await expect(save([{ name: '새 묶음', codes: ['ZZ9'], sort_order: 0 }])).rejects.toThrow()
    await become(K)
    expect((await save([])).rows).toEqual([])
    expect(await snapshot()).toEqual(before)
  })

  it('AC-6303.5: 원장이 데스크 줄을 지우면 바로 다음 문장부터 A의 줄이 하나도 안 보이고 넣기·고치기도 거부된다', async () => {
    await seedTabs(A)
    await become(K)
    for (const table of DESK_TABLES) expect(await hospitalsSeenIn(table)).toEqual([hospital[A]])
    await become(A)
    const [mine] = await rows(`select id from public.desk_members()`)
    await db.query(`select public.remove_desk_member($1)`, [mine.id])
    const before = await snapshot()
    await become(K)
    for (const table of DESK_TABLES) expect([table, await hospitalsSeenIn(table)]).toEqual([table, []])
    expect(await rows(`select * from public.my_desk()`)).toEqual([])
    await expect(insertInto('public.sunap_spends', { work_date: DAY, kind: 'cash', memo: '가짜', amount: 1 })).rejects.toThrow(/row-level security|null value/)
    await expect(insertInto('public.calendar_appts', APPT)).rejects.toThrow(/row-level security|null value/)
    await expect(postgrestUpsert('public.worklog_days', 'hospital_id, work_date', [{ work_date: DAY2, memo: '가짜' }])).rejects.toThrow(
      /row-level security|null value/,
    )
    expect((await db.query(`update public.worklog_days set memo = '바꿈'`)).affectedRows).toBe(0)
    expect((await db.query(`update public.sunap_settings set pt_group = null`)).affectedRows).toBe(0)
    expect((await db.query(`delete from public.calendar_appts`)).affectedRows).toBe(0)
    expect(await snapshot()).toEqual(before)
  })
})

describe('AC-6303.6 데스크가 바꿔도 예약 트리거가 돈다', SLOW, () => {
  it('AC-6303.6: 데스크가 예약·종일 줄·예약 설정을 넣거나 고치거나 지울 때마다 A의 rev가 늘고 B의 rev는 그대로다', async () => {
    await operator()
    await db.query(`insert into public.calendar_rev (hospital_id, rev) values ($1, 7)`, [hospital[B]])
    const seen: number[] = []
    const step = async (run: () => Promise<unknown>) => {
      await become(K)
      await run()
      const rev = await revOf(A)
      expect(rev).not.toBeNull()
      seen.push(rev as number)
      expect(await revOf(B)).toBe(7)
    }
    let apptId = ''
    let dayId = ''
    await step(async () => {
      apptId = (await insertInto('public.calendar_appts', APPT, 'id')).rows[0].id as string
    })
    await step(() => db.query(`update public.calendar_appts set memo = '고침' where id = $1`, [apptId]))
    await step(() => db.query(`delete from public.calendar_appts where id = $1`, [apptId]))
    await step(async () => {
      dayId = (await insertInto('public.calendar_allday', MEMO_DAY, 'id')).rows[0].id as string
    })
    await step(() => db.query(`delete from public.calendar_allday where id = $1`, [dayId]))
    await step(() => postgrestUpsert('public.calendar_settings', 'hospital_id', [{ open_hour: 9 }]))
    await step(() => postgrestUpsert('public.calendar_settings', 'hospital_id', [{ open_hour: 10 }]))
    expect(seen[0]).toBeGreaterThanOrEqual(1)
    for (let i = 1; i < seen.length; i++) expect([i, seen[i]! > seen[i - 1]!]).toEqual([i, true])
  })

  it('AC-6303.6: 데스크가 예약을 넣으면 A의 1년 지난 예약·종일 줄이 지워지고, 1년 날 줄과 B의 지난 줄은 남는다', async () => {
    const gone = await seedTabs(A, OLDEST)
    await operator()
    await db.query(`update public.calendar_allday set day = $1 where id = $2`, [OLDEST, gone.allday])
    const [keptEdge] = await rows(
      `insert into public.calendar_appts (hospital_id, day, start_min, len_min, name, staff_id, staff_name, staff_mark, kind_id, kind_name)
       values ($1, $2, 600, 30, '가짜', 's', '가', '가', 'k', '도수') returning id`,
      [hospital[A], YEAR_AGO],
    )
    const other = await seedTabs(B, OLDEST)
    await operator()
    await db.query(`update public.calendar_allday set day = $1 where id = $2`, [OLDEST, other.allday])
    await become(K)
    const { rows: added } = await insertInto('public.calendar_appts', { ...APPT, day: TODAY }, 'id')
    await operator()
    expect((await rows(`select id from public.calendar_appts order by id`)).map((r) => r.id)).toEqual([keptEdge.id, added[0].id, other.appt].sort())
    expect((await rows(`select id from public.calendar_allday`)).map((r) => r.id)).toEqual([other.allday])
  })

  it('AC-6303.6: 원장이 할 때도 지금과 같다(rev가 늘고 1년 지난 줄이 지워진다)', async () => {
    const gone = await seedTabs(A, OLDEST)
    await become(A)
    await insertInto('public.calendar_appts', { ...APPT, day: TODAY })
    expect(await revOf(A)).toBeGreaterThan(5)
    await operator()
    expect((await rows(`select id from public.calendar_appts`)).map((r) => r.id)).not.toContain(gone.appt)
  })

  it('AC-6303.6: 데스크 줄이 지워진 사용자가 바꾸려 하면 rev도 그대로다', async () => {
    await seedTabs(A)
    await operator()
    await db.query(`delete from ${MEMBERS} where email = $1`, [emailOf(K)])
    await become(K)
    await expect(insertInto('public.calendar_appts', APPT)).rejects.toThrow(/row-level security|null value/)
    await db.query(`delete from public.calendar_appts`)
    expect(await revOf(A)).toBe(5)
  })
})

describe('AC-6303.7 데스크 메일은 병원 가입 못 함', SLOW, () => {
  const apply = () => db.query(`insert into public.hospitals (name, applicant_name) values ('새병원', '홍길동')`)

  it('AC-6303.7: 데스크 줄에 메일이 있는 사용자의 가입 신청은 거부되고 병원 줄이 생기지 않는다', async () => {
    await become(K)
    await expect(apply()).rejects.toThrow(RLS_REJECTED)
    await become(K, 'DESK-A@FAKE.TEST')
    await expect(apply()).rejects.toThrow(RLS_REJECTED)
    await operator()
    expect(await rows(`select * from public.hospitals where owner_id = $1`, [K])).toEqual([])
  })

  it('AC-6303.7: 데스크 줄에 없는 사용자의 가입 신청은 지금과 같다(대기로 들어감)', async () => {
    await become(E)
    await apply()
    await operator()
    expect(await rows(`select name, email, status from public.hospitals where owner_id = $1`, [E])).toEqual([
      { name: '새병원', email: emailOf(E), status: 'pending' },
    ])
  })

  it('AC-6303.7: 원장이 데스크 줄을 지우면 그 메일도 가입 신청을 할 수 있다', async () => {
    await operator()
    await db.query(`delete from ${MEMBERS} where email = $1`, [emailOf(K)])
    await become(K)
    await apply()
    await operator()
    expect(await rows(`select status from public.hospitals where owner_id = $1`, [K])).toEqual([{ status: 'pending' }])
  })
})

describe('AC-6303.8 my_desk', SLOW, () => {
  const myDesk = async () => rows(`select * from public.my_desk()`)
  const deskId = async () => (await rows(`select public.my_desk_hospital_id() as id`))[0].id

  it('AC-6303.8: 데스크면 한 줄(hospital_id, hospital_name = 그 병원 이름)이다', async () => {
    await become(K)
    expect(await myDesk()).toEqual([{ hospital_id: hospital[A], hospital_name: NAME[A] }])
    await become(L)
    expect(await myDesk()).toEqual([{ hospital_id: hospital[B], hospital_name: NAME[B] }])
  })

  it('AC-6303.8: 로그인 메일의 대소문자는 가리지 않고, JWT에 메일이 없으면 데스크가 아니다', async () => {
    await become(K, 'Desk-A@Fake.Test')
    expect(await myDesk()).toEqual([{ hospital_id: hospital[A], hospital_name: NAME[A] }])
    await become(K, null)
    expect(await myDesk()).toEqual([])
    expect(await deskId()).toBeNull()
  })

  it('AC-6303.8: 데스크가 아닌 사용자(원장·대기·거절·병원 없음)는 빈 목록이다', async () => {
    for (const user of [A, B, C, D, E]) {
      await become(user)
      expect([user, await myDesk(), await deskId()]).toEqual([user, [], null])
    }
  })

  it('AC-6303.8: 자기 병원 줄(어느 상태든)이 있으면 메일이 데스크 줄에 있어도 데스크가 아니고 그 병원 줄도 안 보인다', async () => {
    await seedTabs(A)
    await seedMember(A, emailOf(B))
    await seedMember(A, emailOf(C))
    await seedMember(A, emailOf(D))
    for (const user of [B, C, D]) {
      await become(user)
      expect([user, await myDesk(), await deskId()]).toEqual([user, [], null])
      expect([user, await hospitalsSeenIn('public.sunap_days')]).toEqual([user, []])
    }
  })

  it('AC-6303.8: 데스크 줄의 병원이 승인 상태가 아니면 데스크가 아니다', async () => {
    await seedTabs(A)
    await operator()
    await db.query(`update public.hospitals set status = 'rejected' where id = $1`, [hospital[A]])
    await become(K)
    expect(await myDesk()).toEqual([])
    expect(await deskId()).toBeNull()
    expect(await hospitalsSeenIn('public.sunap_days')).toEqual([])
  })
})

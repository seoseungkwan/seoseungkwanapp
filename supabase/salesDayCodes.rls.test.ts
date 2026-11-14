import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { REVENUE_CODE_SHAPE, REVENUE_DAY_KEYS, REVENUE_MAX_DAYS } from '@/types/revenue'

// 날 단위 처방 금액 표(sales_day_codes)·sales_days.day_codes 칸·저장 함수(save_revenue_range)·합계 함수(sales_code_totals)의
// RLS·권한·제약 (stats-revenue REQ-4103, TASK-2).
// revenue.rls.test.ts와 같은 방법: 진짜 Postgres(PGlite, WASM)에서 운영자가 SQL 편집기에 붙일 migration 파일을 차례로(인증 → 매출 → 이 파일) 실행한다.
// 실제 Supabase에는 붙지 않는다. Supabase가 미리 갖춘 것(역할·auth 스키마·auth.uid()·auth.jwt()·새 표와 함수의 기본 권한)만 흉내 낸다.
// 시험 자료의 처방 코드·숫자는 모두 지어낸 값이다
const fileOf = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))
const read = (rel: string) => readFileSync(fileOf(rel), 'utf-8')
const AUTH_MIGRATION = read('./migrations/20261028000000_auth.sql')
const REVENUE_MIGRATION = read('./migrations/20261101000400_revenue.sql')
const DAY_CODES_PATH = fileOf('./migrations/20261114000000_sales_day_codes.sql')
// 파일이 아직 없으면 빈 글자로 돌아, 시험마다 '표·함수가 없다'로 실패한다(무엇이 빠졌는지 시험별로 보인다)
const DAY_CODES_MIGRATION = existsSync(DAY_CODES_PATH) ? readFileSync(DAY_CODES_PATH, 'utf-8') : ''
// 주석을 뺀 SQL 글자(머리 주석이 옛 표 이름을 설명으로 말한다)
const DAY_CODES_SQL = DAY_CODES_MIGRATION.replace(/--.*$/gm, '')

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

const A = '00000000-0000-4000-8000-00000000000a' // 승인된 병원 A
const B = '00000000-0000-4000-8000-00000000000b' // 승인된 다른 병원 B
const PENDING = '00000000-0000-4000-8000-00000000000c' // 승인 대기
const REJECTED = '00000000-0000-4000-8000-00000000000d' // 거절
const STATUS: Record<string, string> = { [A]: 'approved', [B]: 'approved', [PENDING]: 'pending', [REJECTED]: 'rejected' }

type Row = Record<string, unknown>

const TABLE = 'public.sales_day_codes'
const COLUMNS = ['hospital_id', 'day', 'code', 'count', 'amount', 'fetched_at']
const SENT = ['day', 'code', 'count', 'amount'] // 사용자가 보낼 수 있는 칸(그 밖은 칸 권한이 없다)
/** sales_days에서 사용자가 보내는 열다섯 칸(계약 src/types/revenue.ts 차례. date만 표에서 day다) */
const DAY_SENT = REVENUE_DAY_KEYS.map((key) => (key === 'date' ? 'day' : key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)))
const OLD_DAY_COLUMNS = ['hospital_id', ...DAY_SENT, 'fetched_at'] // 매출 migration이 만든 칸
const MONEY_COLUMNS = ['total', 'insurer', 'noncovered', 'copay', 'other_total', 'cash', 'card', 'transfer', 'receivable_in']
const SPLIT_COLUMNS = ['insurer', 'noncovered', 'copay', 'other_total']
const SAVE_FN = 'public.save_revenue_range(date,date,jsonb,jsonb)'
const TOTALS_FN = 'public.sales_code_totals(date,date)'
const NEW_FUNCTIONS = ['sales_code_totals', 'save_revenue_range']
/** 한 번 저장의 날 단위 코드 줄 한도: 31일 × 하루 300줄(design.md '잰 것'). 웹 상수는 TASK-3이 types에 더한다 */
const MAX_DAY_CODES = 9300

const SLOW = { timeout: 60_000 }
const DENIED = /permission denied/
const RLS = /row-level security/
const CHECK = /check constraint/
const UNIQUE = /duplicate key value violates unique constraint/
const TWICE = /cannot affect row a second time/
const BAD_INPUT = /invalid input syntax/
const NOT_NULL = /null value in column/
const BAD_RANGE = /bad range/
const BAD_DAYS = /bad days/
const BAD_DAY_CODES = /bad day codes/

// 날짜 글자 더하기(UTC로 세어 시간대와 상관없다)
function addDays(day: string, n: number) {
  const date = new Date(`${day}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + n)
  return date.toISOString().slice(0, 10)
}
const daysFrom = (from: string, count: number) => Array.from({ length: count }, (_, i) => addDays(from, i))
const nulls = (columns: readonly string[]) => Object.fromEntries(columns.map((c) => [c, null]))

const FROM = '2026-10-01'
const TO = '2026-10-03'
const BEFORE_RANGE = '2026-09-30'
const AFTER_RANGE = '2026-10-04'
const COUNTS = { visits: 3, new_patients: 1, return_visits: 2 }
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
const dayRow = (day: string, extra: Row = {}): Row => ({
  day,
  ...COUNTS,
  ...MONEY,
  unconfirmed: false,
  split_unconfirmed: false,
  ...extra,
})
// 건수·금액은 틀린 값(글자·소수)도 시험하려고 unknown으로 받는다
const codeRow = (day: string, code: string, count: unknown = 1, amount: unknown = 10_000): Row => ({ day, code, count, amount })
// 날 줄 비교에 쓰는 칸(daysOf와 같다)
const savedDay = (day: string, visits = 3, dayCodes = true) => ({
  day,
  visits,
  total: 100_000,
  insurer: 40_000,
  unconfirmed: false,
  split_unconfirmed: false,
  day_codes: dayCodes,
})

const DAYS = daysFrom(FROM, 3).map((day) => dayRow(day))
const CODES = [codeRow('2026-10-01', 'MM101', 3, 45_000), codeRow('2026-10-01', 'ES001', 1, null), codeRow('2026-10-03', 'MM101', 2, 30_000)]

type Call = { from: string | null | undefined; to: string | null | undefined; days: unknown; codes: unknown }
const GOOD: Call = { from: FROM, to: TO, days: DAYS, codes: CODES }

let db: PGlite // 인증 → 매출 → 이 파일
let old: PGlite // 인증 → 매출 → (옛 줄 넣기) → 이 파일 → (새 줄 넣기) → 이 파일 한 번 더
let hospital: Record<string, string> = {}
let oldHospital: Record<string, string> = {}
type Schema = Awaited<ReturnType<typeof schemaOf>>
let beforeFile: Schema // old에 이 파일을 돌리기 전
let afterFile: Schema // 한 번 돌린 뒤
let afterTwice: Schema // 두 번 돌린 뒤
let oldRows: Record<string, Row[]> = {} // 이 파일 전에 운영자가 본 옛 줄
let firstRows: Record<string, Row[]> = {} // 한 번 돌린 바로 뒤
let onceRows: Record<string, Row[]> = {} // 한 번 돌리고 새 줄까지 넣은 뒤
let twiceRows: Record<string, Row[]> = {} // 두 번째로 돌린 뒤
let twiceError: unknown = null

async function setUp(target: PGlite) {
  await target.exec(SUPABASE_MOCK)
  await target.exec(AUTH_MIGRATION)
}

// 사용자 넷과 병원 줄을 운영자로 넣고 사용자 → 병원 id를 돌려준다
async function addHospitals(target: PGlite) {
  const ids: Record<string, string> = {}
  for (const [user, status] of Object.entries(STATUS)) {
    await target.query('insert into auth.users (id, email) values ($1, $2)', [user, `${user}@fake.test`])
    const { rows: added } = await target.query<Row>(
      `insert into public.hospitals (owner_id, name, applicant_name, email, status)
       values ($1, '가짜병원', '가짜신청자', $2, $3) returning id`,
      [user, `${user}@fake.test`, status],
    )
    ids[user] = added[0].id as string
  }
  return ids
}

// 표 하나의 모양 전부(칸·제약·트리거·정책·표 권한·칸 권한·RLS)
async function shapeOf(target: PGlite, name: string) {
  const q = async (sql: string, param: string) => (await target.query<Row>(sql, [param])).rows
  const regclass = `public.${name}`
  return {
    columns: await q(
      `select column_name, data_type, column_default, is_nullable from information_schema.columns
       where table_schema = 'public' and table_name = $1 order by ordinal_position`,
      name,
    ),
    constraints: await q(
      `select conname, pg_get_constraintdef(oid) as def, condeferrable, condeferred from pg_constraint
       where conrelid = to_regclass($1) order by conname`,
      regclass,
    ),
    triggers: await q(
      `select tgname, pg_get_triggerdef(oid) as def from pg_trigger
       where tgrelid = to_regclass($1) and not tgisinternal order by tgname`,
      regclass,
    ),
    policies: await q(
      `select policyname, cmd, permissive, roles::text as roles, qual, with_check from pg_policies
       where schemaname = 'public' and tablename = $1 order by policyname`,
      name,
    ),
    table: await q(`select relrowsecurity, relforcerowsecurity, relacl::text as acl from pg_class where oid = to_regclass($1)`, regclass),
    columnAcl: await q(
      `select a.attname, a.attacl::text as acl from pg_attribute a
       where a.attrelid = to_regclass($1) and a.attacl is not null order by a.attname`,
      regclass,
    ),
  }
}

// public의 표 이름, 함수(정의·권한), 매출 표 넷의 모든 모양
async function schemaOf(target: PGlite) {
  const q = async (sql: string) => (await target.query<Row>(sql)).rows
  return {
    tables: (await q(`select relname from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' order by 1`)).map(
      (row) => row.relname as string,
    ),
    functions: await q(
      `select p.proname, p.oid::regprocedure::text as fn, pg_get_functiondef(p.oid) as def, coalesce(p.proacl::text, '') as acl
       from pg_proc p where p.pronamespace = 'public'::regnamespace order by 2`,
    ),
    salesDays: await shapeOf(target, 'sales_days'),
    salesCodes: await shapeOf(target, 'sales_codes'),
    rxGroups: await shapeOf(target, 'rx_groups'),
    salesDayCodes: await shapeOf(target, 'sales_day_codes'),
  }
}

// 운영자 눈으로 본 매출 표 넷의 줄(표가 없으면 빈 목록)
async function tableRows(target: PGlite) {
  const out: Record<string, Row[]> = {}
  for (const [name, order] of [
    ['sales_days', 'hospital_id, day'],
    ['sales_codes', 'hospital_id, month, code'],
    ['rx_groups', 'hospital_id, sort_order'],
    ['sales_day_codes', 'hospital_id, day, code'],
  ]) {
    const [found] = (await target.query<Row>(`select to_regclass($1) is not null as ok`, [`public.${name}`])).rows
    out[name] = found.ok ? (await target.query<Row>(`select * from public.${name} order by ${order}`)).rows : []
  }
  return out
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

async function rows(sql: string, params: unknown[] = []) {
  return (await db.query<Row>(sql, params)).rows
}

function insert(table: string, row: Row, suffix = '') {
  const columns = Object.keys(row)
  return rows(
    `insert into ${table} (${columns.join(', ')}) values (${columns.map((_, i) => `$${i + 1}`).join(', ')}) ${suffix}`,
    Object.values(row),
  )
}

// 운영자가 owner 병원 줄을 넣는다(칸 권한·RLS를 건너뛴다)
async function seedCode(owner: string, row: Row) {
  await operator()
  await insert(TABLE, { hospital_id: hospital[owner], ...row })
}

async function seedDay(owner: string, row: Row) {
  await operator()
  await insert('public.sales_days', { hospital_id: hospital[owner], ...row })
}

// 운영자 눈으로 본 두 표 전체(바뀌지 않았는지 비교할 때)
async function snapshot() {
  await operator()
  return {
    days: await rows('select * from public.sales_days order by hospital_id, day'),
    codes: await rows(`select * from ${TABLE} order by hospital_id, day, code`),
  }
}

// 한 병원의 날 줄·코드 줄(운영자 눈, 견줄 칸만)
async function daysOf(owner: string) {
  await operator()
  return rows(
    `select day::text as day, visits, total, insurer, unconfirmed, split_unconfirmed, day_codes from public.sales_days
     where hospital_id = $1 order by day`,
    [hospital[owner]],
  )
}

async function codesOf(owner: string) {
  await operator()
  return rows(`select day::text as day, code, count, amount from ${TABLE} where hospital_id = $1 order by day, code`, [
    hospital[owner],
  ])
}

const SAVE = 'select public.save_revenue_range(p_from := $1::date, p_to := $2::date, p_days := $3::jsonb, p_day_codes := $4::jsonb)'
// null·undefined는 SQL null로 보낸다(PostgREST도 JSON null을 SQL null로 넘긴다)
const json = (value: unknown) => (value === null || value === undefined ? null : JSON.stringify(value))

// PostgREST처럼 BEGIN → 함수 호출 → COMMIT. 지금 역할 그대로 부른다
async function save(call: Partial<Call> = {}) {
  const { from, to, days, codes } = { ...GOOD, ...call }
  await db.exec('begin')
  try {
    await rows(SAVE, [from ?? null, to ?? null, json(days), json(codes)])
    await db.exec('commit')
  } catch (error) {
    await db.exec('rollback')
    throw error
  }
}

const totals = (from: string, to: string) =>
  rows('select code, count, amount, missing from public.sales_code_totals(p_from := $1::date, p_to := $2::date)', [from, to])

// 저장 시험의 바탕: A는 범위 안팎에 날·코드 줄이 있고, B도 같은 날 줄이 있다.
// A 날 줄은 옛 가져온 시각으로 넣는다(고치기 트리거가 늘 지금 시각을 찍으므로 넣을 때 정한다)
const OLD_AT = '2001-01-01T00:00:00Z'
async function seedState() {
  for (const day of [BEFORE_RANGE, '2026-10-01', '2026-10-02'])
    await seedDay(A, dayRow(day, { visits: 9, day_codes: true, fetched_at: OLD_AT }))
  for (const row of [
    codeRow(BEFORE_RANGE, 'OUT1', 9, 9),
    codeRow('2026-10-01', 'OLD1', 9, 9),
    codeRow('2026-10-02', 'OLD2', 9, null),
    codeRow(AFTER_RANGE, 'OUT2', 9, 9),
  ])
    await seedCode(A, row)
  await seedDay(B, dayRow('2026-10-01', { visits: 7, day_codes: true }))
  await seedCode(B, codeRow('2026-10-01', 'MM101', 7, 7))
}

async function resetData() {
  await db.exec('rollback') // 앞 시험이 트랜잭션 도중에 실패해도 다음 시험까지 번지지 않게
  await operator()
  await db.exec('truncate auth.users cascade') // 병원·매출 줄도 같이 비워진다
  hospital = await addHospitals(db)
}

beforeAll(async () => {
  db = await PGlite.create()
  await setUp(db)
  await db.exec(REVENUE_MIGRATION)
  await db.exec(DAY_CODES_MIGRATION)

  old = await PGlite.create()
  await setUp(old)
  await old.exec(REVENUE_MIGRATION)
  // 이 파일 전에 저장된 옛 줄(day_codes 칸이 없던 때)
  oldHospital = await addHospitals(old)
  await old.query(
    `insert into public.sales_days (hospital_id, ${DAY_SENT.join(', ')}, fetched_at)
     values ($1, ${DAY_SENT.map((_, i) => `$${i + 2}`).join(', ')}, '2001-01-01T00:00:00Z')`,
    [oldHospital[A], ...DAY_SENT.map((c) => dayRow(FROM)[c])],
  )
  await old.query(
    `insert into public.sales_codes (hospital_id, month, code, name, count, amount) values ($1, $2, 'MT001', '도수치료', 3, 150000)`,
    [oldHospital[A], FROM],
  )
  await old.query(`insert into public.rx_groups (hospital_id, name, codes, sort_order) values ($1, '도수치료', '{MT001}', 0)`, [
    oldHospital[A],
  ])
  oldRows = await tableRows(old)
  beforeFile = await schemaOf(old)
  await old.exec(DAY_CODES_MIGRATION)
  afterFile = await schemaOf(old)
  firstRows = await tableRows(old)
  // 한 번 돌린 뒤 새 줄이 생긴 DB에 다시 붙인다(운영자가 두 번 붙여 넣는 경우)
  if (afterFile.tables.includes('sales_day_codes')) {
    await old.query(`insert into public.sales_day_codes (hospital_id, day, code, count, amount) values ($1, $2, 'MM101', 3, 45000)`, [
      oldHospital[A],
      FROM,
    ])
    await old.query(`update public.sales_days set day_codes = true where hospital_id = $1`, [oldHospital[A]])
  }
  onceRows = await tableRows(old)
  try {
    await old.exec(DAY_CODES_MIGRATION)
  } catch (error) {
    twiceError = error
  }
  afterTwice = await schemaOf(old)
  twiceRows = await tableRows(old)
}, 120_000)

afterAll(async () => {
  await db.close()
  await old.close()
})

// 시험마다 빈 표에서 시작한다. 운영자(superuser)는 RLS를 건너뛴다
beforeEach(resetData)

describe('AC-4103.1 표·칸·기본 키·RLS', SLOW, () => {
  it('AC-4103.1: sales_day_codes 칸은 병원·날·코드·건수·금액·가져온 시각뿐이다(환자 칸 없음)', async () => {
    const list = await rows(
      `select column_name, data_type, is_nullable from information_schema.columns
       where table_schema = 'public' and table_name = 'sales_day_codes' order by ordinal_position`,
    )
    expect(list.map((r) => r.column_name)).toEqual(COLUMNS)
    expect(list.map((r) => [r.column_name, r.data_type, r.is_nullable])).toEqual([
      ['hospital_id', 'uuid', 'NO'],
      ['day', 'date', 'NO'],
      ['code', 'text', 'NO'],
      ['count', 'integer', 'NO'],
      ['amount', 'bigint', 'YES'],
      ['fetched_at', 'timestamp with time zone', 'NO'],
    ])
  })

  it('AC-4103.1: 기본 키는 병원 + 날 + 코드다', async () => {
    const list = await rows(
      `select a.attname from pg_index i
       join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
       where i.indrelid = 'public.sales_day_codes'::regclass and i.indisprimary
       order by array_position(i.indkey::int2[], a.attnum)`,
    )
    expect(list.map((r) => r.attname)).toEqual(['hospital_id', 'day', 'code'])
  })

  it('AC-4103.1: RLS가 켜져 있다', async () => {
    expect(await rows(`select relrowsecurity from pg_class where oid = 'public.sales_day_codes'::regclass`)).toEqual([
      { relrowsecurity: true },
    ])
  })

  it('AC-4103.1: sales_days 끝에 day_codes(참/거짓, null 아님, 기본 거짓) 칸 하나가 더해진다', async () => {
    const list = await rows(
      `select column_name, data_type, is_nullable, column_default from information_schema.columns
       where table_schema = 'public' and table_name = 'sales_days' order by ordinal_position`,
    )
    expect(list.map((r) => r.column_name)).toEqual([...OLD_DAY_COLUMNS, 'day_codes'])
    expect(list.at(-1)).toEqual({ column_name: 'day_codes', data_type: 'boolean', is_nullable: 'NO', column_default: 'false' })
  })

  it('AC-4103.1: day_codes를 빼고 넣으면 거짓이고 null은 넣을 수 없다', async () => {
    await become(A)
    expect(await insert('public.sales_days', dayRow(FROM), 'returning day_codes')).toEqual([{ day_codes: false }])
    await become(A)
    await expect(insert('public.sales_days', dayRow(TO, { day_codes: null }))).rejects.toThrow(NOT_NULL)
  })

  it('AC-4103.1: 병원 줄을 지우면(운영자) 그 병원의 날 단위 코드 줄도 지워지고 다른 병원 줄은 그대로다', async () => {
    await seedCode(A, codeRow(FROM, 'MM101'))
    await seedCode(B, codeRow(FROM, 'MM101'))
    await operator()
    await rows('delete from public.hospitals where id = $1', [hospital[A]])
    expect(await rows(`select hospital_id from ${TABLE}`)).toEqual([{ hospital_id: hospital[B] }])
  })

  it('AC-4103.1: 같은 병원 같은 날 같은 코드는 두 줄이 될 수 없고, 날이나 코드나 병원이 다르면 된다', async () => {
    await become(A)
    await insert(TABLE, codeRow(FROM, 'MM101'))
    await expect(insert(TABLE, codeRow(FROM, 'MM101', 2, 1))).rejects.toThrow(UNIQUE)
    await become(A)
    await insert(TABLE, codeRow(TO, 'MM101'))
    await insert(TABLE, codeRow(FROM, 'MM102'))
    await become(B)
    await insert(TABLE, codeRow(FROM, 'MM101'))
    await operator()
    expect(await rows(`select count(*)::int as n from ${TABLE}`)).toEqual([{ n: 4 }])
  })
})

describe('AC-4103.1 칸 제약', SLOW, () => {
  beforeEach(() => become(A))

  it('AC-4103.1: day는 2000-01-01부터다', async () => {
    await expect(insert(TABLE, codeRow('1999-12-31', 'MM101'))).rejects.toThrow(CHECK)
    await become(A)
    await insert(TABLE, codeRow('2000-01-01', 'MM101'))
    expect(await rows(`select day::text as day from ${TABLE}`)).toEqual([{ day: '2000-01-01' }])
  })

  const BAD_CODES = ['', 'A'.repeat(31), 'MT 001', 'MT/001', 'MT001\n', '<b>', 'ㄱ']
  const GOOD_CODES = ['A'.repeat(30), '가나다', '힣', 'A-1_2.3', '_REST', 'mm101']

  it.each(BAD_CODES)('AC-4103.1: 코드 %j는 처방 코드 모양이 아니라 거부된다(계약의 모양과 같다)', async (code) => {
    expect(REVENUE_CODE_SHAPE.test(code)).toBe(false)
    await expect(insert(TABLE, codeRow(FROM, code))).rejects.toThrow(CHECK)
  })

  it.each(GOOD_CODES)('AC-4103.1: 코드 %j는 들어간다(계약의 모양과 같다)', async (code) => {
    expect(REVENUE_CODE_SHAPE.test(code)).toBe(true)
    await insert(TABLE, codeRow(FROM, code))
    expect(await rows(`select code from ${TABLE}`)).toEqual([{ code }])
  })

  it('AC-4103.1: count는 0~10,000,000 정수이고 null일 수 없다', async () => {
    for (const [count, error] of [
      [-1, CHECK],
      [10_000_001, CHECK],
      ['1.5', BAD_INPUT],
      ['abc', BAD_INPUT],
      [null, NOT_NULL],
    ] as const) {
      await become(A)
      await expect(insert(TABLE, codeRow(FROM, 'MM101', count))).rejects.toThrow(error)
    }
    await become(A)
    await insert(TABLE, codeRow(FROM, 'C1', 0))
    await insert(TABLE, codeRow(FROM, 'C2', 10_000_000))
    expect(await rows(`select code, count from ${TABLE} order by code`)).toEqual([
      { code: 'C1', count: 0 },
      { code: 'C2', count: 10_000_000 },
    ])
  })

  it('AC-4103.1: amount는 0 이상 정수이거나 null이고 int 범위를 넘는 큰 금액도 받는다', async () => {
    for (const [amount, error] of [
      [-1, CHECK],
      ['1.5', BAD_INPUT],
      ['abc', BAD_INPUT],
    ] as const) {
      await become(A)
      await expect(insert(TABLE, codeRow(FROM, 'MM101', 1, amount))).rejects.toThrow(error)
    }
    await become(A)
    await insert(TABLE, codeRow(FROM, 'C1', 1, 0))
    await insert(TABLE, codeRow(FROM, 'C2', 1, null))
    await insert(TABLE, codeRow(FROM, 'C3', 1, 3_000_000_000))
    expect(await rows(`select code, amount from ${TABLE} order by code`)).toEqual([
      { code: 'C1', amount: 0 },
      { code: 'C2', amount: null },
      { code: 'C3', amount: 3_000_000_000 },
    ])
  })

  it('AC-4103.1: 날·코드는 null일 수 없다', async () => {
    await expect(insert(TABLE, { code: 'MM101', count: 1 })).rejects.toThrow(NOT_NULL)
    await become(A)
    await expect(insert(TABLE, { day: FROM, count: 1 })).rejects.toThrow(NOT_NULL)
  })
})

describe('AC-4103.1 두 번 실행해도 된다', SLOW, () => {
  it('AC-4103.1: 두 번 돌려도 되는 문장만 쓴다(표·칸은 if not exists, 정책은 지우고 다시 만들기, 함수는 create or replace)', () => {
    const count = (pattern: RegExp) => (DAY_CODES_SQL.match(pattern) ?? []).length
    expect(count(/create\s+table\s+if\s+not\s+exists\s+public\.sales_day_codes\b/gi)).toBe(1)
    expect(DAY_CODES_SQL).not.toMatch(/create\s+table\s+(?!if\s+not\s+exists)/i)
    expect(count(/add\s+column\s+if\s+not\s+exists\s+day_codes\b/gi)).toBe(1)
    expect(DAY_CODES_SQL).not.toMatch(/add\s+column\s+(?!if\s+not\s+exists)/i)
    expect(count(/create\s+or\s+replace\s+function/gi)).toBe(2)
    expect(DAY_CODES_SQL).not.toMatch(/create\s+function/i)
    expect(DAY_CODES_SQL).not.toMatch(/create\s+(or\s+replace\s+)?trigger/i)
    expect(DAY_CODES_SQL).not.toMatch(/\b(drop\s+(table|column|function|trigger)|truncate)\b/i)
    const names = (pattern: RegExp) => [...DAY_CODES_SQL.matchAll(pattern)].map((m) => m[1]).sort()
    const created = names(/create\s+policy\s+"([^"]+)"\s+on\s+public\.sales_day_codes/gi)
    expect(created).toHaveLength(3)
    expect(names(/drop\s+policy\s+if\s+exists\s+"([^"]+)"\s+on\s+public\.sales_day_codes/gi)).toEqual(created)
    expect(count(/create\s+policy/gi)).toBe(3)
  })

  it('AC-4103.1: 공용 함수(my_hospital_id 등)는 만들지도 권한을 바꾸지도 않고 부르기만 한다', () => {
    expect(DAY_CODES_SQL).toContain('public.my_hospital_id()')
    expect(DAY_CODES_SQL).not.toMatch(/function\s+public\.(my_hospital_id|touch_updated_at|sales_touch_fetched_at|rx_group_codes_ok)\s*\(/i)
  })

  it('AC-4103.1: 같은 DB에 두 번 돌려도 오류가 없고 표·칸·제약·권한·정책·함수와 이미 있던 줄이 그대로다', () => {
    expect(twiceError).toBeNull()
    expect(afterTwice.tables).toContain('sales_day_codes') // 빈 비교가 아니다
    expect(afterTwice).toEqual(afterFile)
    expect(onceRows.sales_day_codes).toHaveLength(1)
    expect(onceRows.sales_days.map((r) => r.day_codes)).toEqual([true])
    expect(twiceRows).toEqual(onceRows)
  })

  it('AC-4103.1: 이 파일 전에 있던 sales_days 줄은 다른 칸이 그대로이고 day_codes가 거짓이 된다', () => {
    expect(oldRows.sales_days).toHaveLength(1) // 빈 비교가 아니다: 옛 줄이 정말 있다
    expect(firstRows.sales_days).toEqual(oldRows.sales_days.map((row) => ({ ...row, day_codes: false })))
  })

  it('AC-4103.1: 파일 머리 주석에 붙여 넣는 방법·먼저 있어야 할 파일·웹보다 먼저·두 번 붙여도 됨이 있다', () => {
    const lines = DAY_CODES_MIGRATION.split('\n')
    const head = lines.slice(0, lines.findIndex((line) => !/^(--|\s*$)/.test(line))).join('\n')
    expect(head).toContain('SQL Editor')
    expect(head).toContain('20261101000400_revenue.sql')
    expect(head).toContain('웹을 올리기 전에 붙인다')
    expect(head).toContain('두 번 붙여도 된다')
    expect(head).toContain('specs/stats-revenue')
  })
})

describe('AC-4103.2 로그인 안 한 사용자(anon)는 아무것도 못 한다', SLOW, () => {
  it('AC-4103.2: anon에게 sales_day_codes의 표·칸 권한과 sales_days.day_codes 칸 권한이 하나도 없다', async () => {
    for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']) {
      expect(await rows(`select has_any_column_privilege('anon', 'public.sales_day_codes', $1) as ok`, [privilege])).toEqual([
        { ok: false },
      ])
      expect(await rows(`select has_column_privilege('anon', 'public.sales_days', 'day_codes', $1) as ok`, [privilege])).toEqual([
        { ok: false },
      ])
    }
    for (const privilege of ['DELETE', 'TRUNCATE', 'TRIGGER']) {
      expect(await rows(`select has_table_privilege('anon', 'public.sales_day_codes', $1) as ok`, [privilege])).toEqual([{ ok: false }])
    }
  })

  it('AC-4103.2: anon은 sales_day_codes를 읽기·넣기·고치기·지우기 모두 거부되고 줄은 그대로다', async () => {
    await seedCode(A, codeRow(FROM, 'MM101'))
    const before = await snapshot()
    await becomeAnon()
    await expect(rows(`select * from ${TABLE}`)).rejects.toThrow(DENIED)
    await expect(insert(TABLE, codeRow(FROM, 'MM102'))).rejects.toThrow(DENIED)
    await expect(rows(`update ${TABLE} set count = 9`)).rejects.toThrow(DENIED)
    await expect(rows(`delete from ${TABLE}`)).rejects.toThrow(DENIED)
    expect(await snapshot()).toEqual(before)
  })

  it('AC-4103.2: anon은 두 함수를 부를 수 없고(PUBLIC에도 실행 권한 없음) 줄은 그대로다', async () => {
    await seedState()
    const before = await snapshot()
    for (const fn of [SAVE_FN, TOTALS_FN]) {
      expect(await rows(`select has_function_privilege('anon', $1, 'EXECUTE') as ok`, [fn])).toEqual([{ ok: false }])
      const [{ acl }] = await rows(`select coalesce(array_to_string(proacl, ','), '') as acl from pg_proc where oid = $1::regprocedure`, [fn])
      expect(acl).not.toMatch(/(^|,)=/) // PUBLIC 칸(=X/…)이 없다
    }
    await becomeAnon()
    await expect(save()).rejects.toThrow(DENIED)
    await becomeAnon()
    await expect(totals(FROM, TO)).rejects.toThrow(DENIED)
    expect(await snapshot()).toEqual(before)
  })
})

describe('AC-4103.2 authenticated 권한은 정해 둔 칸만이다', SLOW, () => {
  async function columnsWith(table: string, privilege: string) {
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
    ['sales_day_codes', 'INSERT', SENT],
    ['sales_day_codes', 'UPDATE', []],
    ['sales_days', 'INSERT', [...DAY_SENT, 'day_codes']],
    ['sales_days', 'UPDATE', [...DAY_SENT, 'day_codes']],
  ] as [string, string, string[]][])('AC-4103.2: %s %s 칸 권한이 정확하다', async (table, privilege, expected) => {
    expect(await columnsWith(table, privilege)).toEqual(expected)
  })

  it('AC-4103.2: sales_day_codes는 읽기·지우기만 표 단위이고 넣기·고치기·비우기 등은 없다', async () => {
    for (const [privilege, expected] of [
      ['SELECT', true],
      ['DELETE', true],
      ['INSERT', false],
      ['UPDATE', false],
      ['TRUNCATE', false],
      ['REFERENCES', false],
      ['TRIGGER', false],
    ] as const) {
      const [row] = await rows(`select has_table_privilege('authenticated', 'public.sales_day_codes', $1) as ok`, [privilege])
      expect([privilege, row.ok]).toEqual([privilege, expected])
    }
  })

  it('AC-4103.2: 정책은 읽기·넣기·지우기 셋이고 authenticated 대상이며 모두 my_hospital_id()로 거른다', async () => {
    const list = await rows(
      `select cmd, permissive, roles::text as roles, qual, with_check from pg_policies
       where schemaname = 'public' and tablename = 'sales_day_codes' order by cmd`,
    )
    expect(list.map((p) => p.cmd)).toEqual(['DELETE', 'INSERT', 'SELECT'])
    for (const policy of list) {
      expect(policy).toMatchObject({ permissive: 'PERMISSIVE', roles: '{authenticated}' })
      if (policy.cmd === 'INSERT') expect(policy.with_check).toContain('my_hospital_id()')
      else expect(policy.qual).toContain('my_hospital_id()')
    }
  })

  it('AC-4103.2: authenticated는 두 함수를 부를 수 있다', async () => {
    for (const fn of [SAVE_FN, TOTALS_FN]) {
      expect(await rows(`select has_function_privilege('authenticated', $1, 'EXECUTE') as ok`, [fn])).toEqual([{ ok: true }])
    }
  })

  it('AC-4103.2: 고치기 권한이 없다(내 줄이어도 거부, upsert도 거부, 줄 그대로)', async () => {
    await seedCode(A, codeRow(FROM, 'MM101'))
    const before = await snapshot()
    await become(A)
    await expect(rows(`update ${TABLE} set count = 9`)).rejects.toThrow(DENIED)
    await become(A)
    await expect(
      insert(TABLE, codeRow(FROM, 'MM101', 9, 9), 'on conflict (hospital_id, day, code) do update set count = excluded.count'),
    ).rejects.toThrow(DENIED)
    expect(await snapshot()).toEqual(before)
  })

  it('AC-4103.2: hospital_id·fetched_at은 직접 넣을 수 없고(내 병원이어도) DB가 채운다', async () => {
    await become(A)
    await expect(insert(TABLE, { hospital_id: hospital[A], ...codeRow(FROM, 'MM101') })).rejects.toThrow(DENIED)
    await become(A)
    await expect(insert(TABLE, { hospital_id: hospital[B], ...codeRow(FROM, 'MM101') })).rejects.toThrow(DENIED)
    await become(A)
    await expect(insert(TABLE, { ...codeRow(FROM, 'MM101'), fetched_at: '2001-01-01T00:00:00Z' })).rejects.toThrow(DENIED)
    await become(A)
    expect(
      await insert(TABLE, codeRow(FROM, 'MM101'), `returning hospital_id, fetched_at > now() - interval '1 hour' as fresh`),
    ).toEqual([{ hospital_id: hospital[A], fresh: true }])
  })

  it('AC-4103.2: sales_days의 day_codes는 넣기·고치기가 된다', async () => {
    await become(A)
    expect(await insert('public.sales_days', dayRow(FROM, { day_codes: true }), 'returning day_codes')).toEqual([{ day_codes: true }])
    expect(await rows('update public.sales_days set day_codes = false returning day_codes')).toEqual([{ day_codes: false }])
  })
})

describe('AC-4103.3 승인된 병원은 자기 줄만, 대기·거절은 아무것도', SLOW, () => {
  it('AC-4103.3: A는 자기 줄만 보고 B 줄은 병원으로 골라도 안 보인다', async () => {
    await seedCode(A, codeRow(FROM, 'MM101'))
    await seedCode(B, codeRow(FROM, 'MM101'))
    await become(A)
    expect(await rows(`select hospital_id from ${TABLE}`)).toEqual([{ hospital_id: hospital[A] }])
    expect(await rows(`select * from ${TABLE} where hospital_id = $1`, [hospital[B]])).toEqual([])
  })

  it('AC-4103.3: A는 자기 줄을 넣고 지우며, 지우기는 B 줄을 건드리지 않는다', async () => {
    await seedCode(B, codeRow(FROM, 'MM101'))
    const bBefore = await codesOf(B)
    expect(bBefore).toHaveLength(1)
    await become(A)
    expect(await insert(TABLE, codeRow(FROM, 'MM101'), 'returning hospital_id')).toEqual([{ hospital_id: hospital[A] }])
    expect(await rows(`delete from ${TABLE} where hospital_id = $1 returning code`, [hospital[B]])).toEqual([])
    expect(await rows(`delete from ${TABLE} returning hospital_id`)).toEqual([{ hospital_id: hospital[A] }])
    expect(await codesOf(B)).toEqual(bBefore)
  })

  it('AC-4103.3: A가 저장 함수를 부르면 A 줄만 바뀌고 같은 날 B의 날 줄·코드 줄은 그대로다', async () => {
    await seedState()
    const bDays = await daysOf(B)
    const bCodes = await codesOf(B)
    expect(bCodes).toEqual([{ day: FROM, code: 'MM101', count: 7, amount: 7 }])
    await become(A)
    await save()
    expect(await daysOf(B)).toEqual(bDays)
    expect(await codesOf(B)).toEqual(bCodes)
  })

  it('AC-4103.3: A의 합계에는 B 줄이 더해지지 않는다', async () => {
    await seedCode(A, codeRow(FROM, 'MM101', 1, 100))
    await seedCode(B, codeRow(FROM, 'MM101', 50, 5000))
    await seedCode(B, codeRow(FROM, 'BONLY', 1, 1))
    await become(A)
    expect(await totals(FROM, TO)).toEqual([{ code: 'MM101', count: 1, amount: 100, missing: false }])
    await become(B)
    expect(await totals(FROM, TO)).toEqual([
      { code: 'BONLY', count: 1, amount: 1, missing: false },
      { code: 'MM101', count: 50, amount: 5000, missing: false },
    ])
  })

  it.each([
    ['승인 대기', PENDING],
    ['거절', REJECTED],
  ])('AC-4103.3: %s 사용자는 읽기·넣기·지우기·저장·합계 모두 아무것도 못 하고 줄은 그대로다', async (_label, user) => {
    await seedCode(user, codeRow(FROM, 'MM101'))
    await seedDay(user, dayRow(FROM))
    const before = await snapshot()
    await become(user)
    expect(await rows(`select * from ${TABLE}`)).toEqual([])
    await expect(insert(TABLE, codeRow(FROM, 'MM102'))).rejects.toThrow(RLS)
    await become(user)
    expect(await rows(`delete from ${TABLE} returning code`)).toEqual([])
    await expect(save()).rejects.toThrow(RLS)
    await become(user)
    await expect(save({ codes: null })).rejects.toThrow(RLS)
    await become(user)
    expect(await totals(FROM, TO)).toEqual([])
    expect(await snapshot()).toEqual(before)
  })
})

describe('AC-4103.4 저장 함수 save_revenue_range', SLOW, () => {
  it('AC-4103.4: 두 함수는 부른 사람 권한으로 돌고 search_path가 비어 있으며 인자·답 모양이 정해 둔 것이다', async () => {
    const list = await rows(
      `select proname, prosecdef, provolatile, proconfig::text as config,
              pg_get_function_identity_arguments(oid) as args, pg_get_function_result(oid) as result
       from pg_proc where pronamespace = 'public'::regnamespace and proname = any($1::text[]) order by proname`,
      [NEW_FUNCTIONS],
    )
    expect(list).toEqual([
      {
        proname: 'sales_code_totals',
        prosecdef: false,
        provolatile: 's',
        config: '{"search_path=\\"\\""}',
        args: 'p_from date, p_to date',
        result: 'TABLE(code text, count bigint, amount bigint, missing boolean)',
      },
      {
        proname: 'save_revenue_range',
        prosecdef: false,
        provolatile: 'v',
        config: '{"search_path=\\"\\""}',
        args: 'p_from date, p_to date, p_days jsonb, p_day_codes jsonb',
        result: 'void',
      },
    ])
  })

  it('AC-4103.4: 시험의 날 줄은 계약의 열다섯 칸이다', () => {
    expect(Object.keys(dayRow(FROM))).toEqual(DAY_SENT)
  })

  it('AC-4103.4: 처음 저장하면 날 줄이 들어가고(day_codes 참) 준 코드 줄이 내 병원·DB 시각으로 들어간다', async () => {
    await become(A)
    await save()
    expect(await daysOf(A)).toEqual(daysFrom(FROM, 3).map((day) => savedDay(day)))
    expect(await codesOf(A)).toEqual([
      { day: '2026-10-01', code: 'ES001', count: 1, amount: null },
      { day: '2026-10-01', code: 'MM101', count: 3, amount: 45_000 },
      { day: '2026-10-03', code: 'MM101', count: 2, amount: 30_000 },
    ])
    await operator()
    expect(await rows(`select distinct hospital_id, fetched_at > now() - interval '1 hour' as fresh from ${TABLE}`)).toEqual([
      { hospital_id: hospital[A], fresh: true },
    ])
  })

  it('AC-4103.4: 다시 저장하면 날 줄은 고쳐지고(upsert) 그 범위 코드 줄은 지운 뒤 새로 넣으며 범위 밖 줄은 그대로다', async () => {
    await seedState()
    await become(A)
    await save({ days: DAYS.map((d) => ({ ...d, visits: 5 })) })
    expect(await daysOf(A)).toEqual([savedDay(BEFORE_RANGE, 9), ...daysFrom(FROM, 3).map((day) => savedDay(day, 5))])
    expect(await codesOf(A)).toEqual([
      { day: BEFORE_RANGE, code: 'OUT1', count: 9, amount: 9 },
      { day: '2026-10-01', code: 'ES001', count: 1, amount: null },
      { day: '2026-10-01', code: 'MM101', count: 3, amount: 45_000 },
      { day: '2026-10-03', code: 'MM101', count: 2, amount: 30_000 },
      { day: AFTER_RANGE, code: 'OUT2', count: 9, amount: 9 },
    ])
    // 고친 날은 가져온 시각이 새로 찍히고(트리거), 범위 밖 날은 옛 시각 그대로다
    await operator()
    expect(
      await rows(
        `select day::text as day, fetched_at > now() - interval '1 hour' as fresh from public.sales_days where hospital_id = $1 order by day`,
        [hospital[A]],
      ),
    ).toEqual([
      { day: BEFORE_RANGE, fresh: false },
      { day: '2026-10-01', fresh: true },
      { day: '2026-10-02', fresh: true },
      { day: '2026-10-03', fresh: true },
    ])
  })

  it('AC-4103.4: 옛 도우미(코드 줄 null)면 그 날들의 day_codes가 거짓이고 그 범위 코드 줄은 지워지며 범위 밖 줄은 그대로다', async () => {
    await seedState()
    await become(A)
    await save({ codes: null })
    expect(await daysOf(A)).toEqual([savedDay(BEFORE_RANGE, 9), ...daysFrom(FROM, 3).map((day) => savedDay(day, 3, false))])
    expect(await codesOf(A)).toEqual([
      { day: BEFORE_RANGE, code: 'OUT1', count: 9, amount: 9 },
      { day: AFTER_RANGE, code: 'OUT2', count: 9, amount: 9 },
    ])
  })

  it('AC-4103.4: 코드 줄이 빈 배열이면(처방 없는 날) day_codes는 참이고 그 범위 코드 줄은 비워진다', async () => {
    await seedState()
    await become(A)
    await save({ codes: [] })
    expect(await daysOf(A)).toEqual([savedDay(BEFORE_RANGE, 9), ...daysFrom(FROM, 3).map((day) => savedDay(day))])
    expect((await codesOf(A)).map((c) => c.code)).toEqual(['OUT1', 'OUT2'])
  })

  it('AC-4103.4: 하루(시작 = 끝)와 31일(한도)은 된다', async () => {
    await become(A)
    await save({ from: TO, to: TO, days: [dayRow(TO)], codes: [codeRow(TO, 'MM101')] })
    expect((await daysOf(A)).map((d) => d.day)).toEqual([TO])
    const month = daysFrom(FROM, REVENUE_MAX_DAYS)
    await become(A)
    await save({ from: FROM, to: month.at(-1), days: month.map((day) => dayRow(day)), codes: [] })
    expect((await daysOf(A)).map((d) => d.day)).toEqual(month)
    expect(await codesOf(A)).toEqual([])
  })

  it('AC-4103.4: 금액 아홉 칸의 세 모양(나눔까지·나눔만 빔·모두 빔)이 그대로 저장된다', async () => {
    await become(A)
    await save({
      codes: null,
      days: [
        dayRow('2026-10-01'),
        dayRow('2026-10-02', { ...nulls(SPLIT_COLUMNS), split_unconfirmed: true }),
        dayRow('2026-10-03', { ...nulls(MONEY_COLUMNS), unconfirmed: true }),
      ],
    })
    expect(await daysOf(A)).toEqual([
      savedDay('2026-10-01', 3, false),
      { ...savedDay('2026-10-02', 3, false), insurer: null, split_unconfirmed: true },
      { ...savedDay('2026-10-03', 3, false), total: null, insurer: null, unconfirmed: true },
    ])
  })

  it('AC-4103.4: 줄에 hospital_id·fetched_at을 끼워 보내도 쓰지 않는다(내 병원·DB 시각, B 줄 그대로)', async () => {
    await seedState()
    const bBefore = { days: await daysOf(B), codes: await codesOf(B) }
    await become(A)
    const sneak = { hospital_id: hospital[B], fetched_at: OLD_AT }
    await save({ days: DAYS.map((d) => ({ ...d, ...sneak })), codes: CODES.map((c) => ({ ...c, ...sneak })) })
    expect({ days: await daysOf(B), codes: await codesOf(B) }).toEqual(bBefore)
    expect(await codesOf(A)).toHaveLength(5) // 범위 안 셋 + 범위 밖 둘
    await operator()
    for (const table of ['public.sales_days', TABLE]) {
      expect(
        await rows(
          `select distinct fetched_at > now() - interval '1 hour' as fresh from ${table} where hospital_id = $1 and day between $2 and $3`,
          [hospital[A], FROM, TO],
        ),
      ).toEqual([{ fresh: true }])
    }
  })

  it(`AC-4103.4: 코드 줄은 ${MAX_DAY_CODES.toLocaleString('en-US')}줄까지 되고 한 줄 더 많으면 거부된다(두 표 그대로)`, async () => {
    const month = daysFrom(FROM, REVENUE_MAX_DAYS)
    const days = month.map((day) => dayRow(day))
    const full = month.flatMap((day) => Array.from({ length: MAX_DAY_CODES / REVENUE_MAX_DAYS }, (_, i) => codeRow(day, `C${i}`, 1, 100)))
    expect(full).toHaveLength(MAX_DAY_CODES)
    const to = month.at(-1)
    await become(A)
    await save({ from: FROM, to, days, codes: full })
    await operator()
    expect(await rows(`select count(*)::int as n from ${TABLE}`)).toEqual([{ n: MAX_DAY_CODES }])
    const before = await snapshot()
    await become(A)
    await expect(save({ from: FROM, to, days, codes: [...full, codeRow(FROM, 'EXTRA')] })).rejects.toThrow(BAD_DAY_CODES)
    expect(await snapshot()).toEqual(before)
  }, 120_000)

  const month32 = daysFrom(FROM, REVENUE_MAX_DAYS + 1)
  const REJECTS: [string, Partial<Call>, RegExp][] = [
    // 1. 시작이 끝보다 늦음 · 범위 없음
    ['시작이 끝보다 늦음', { from: TO, to: FROM }, BAD_RANGE],
    ['시작이 null', { from: null }, BAD_RANGE],
    ['끝이 null', { to: null }, BAD_RANGE],
    // 2. 31일 넘음
    ['32일', { to: month32.at(-1), days: month32.map((day) => dayRow(day)), codes: [] }, BAD_RANGE],
    // 3. 날 줄 수가 날 수와 다름 · 날 줄 모양
    ['날 줄이 null', { days: null }, BAD_DAYS],
    ['날 줄이 배열 아님', { days: { day: FROM } }, BAD_DAYS],
    ['날 줄이 빈 배열', { days: [] }, BAD_DAYS],
    ['날 줄이 날 수보다 적음', { days: DAYS.slice(0, 2) }, BAD_DAYS],
    ['날 줄이 날 수보다 많음', { days: [...DAYS, dayRow(TO)] }, BAD_DAYS],
    // 4. 범위 밖 날
    ['날 줄에 범위 뒤 날', { days: [DAYS[0], DAYS[1], dayRow(AFTER_RANGE)] }, BAD_DAYS],
    ['날 줄에 범위 앞 날', { days: [dayRow(BEFORE_RANGE), DAYS[1], DAYS[2]] }, BAD_DAYS],
    ['날 줄에 날 없음', { days: [DAYS[0], DAYS[1], { ...DAYS[2], day: null }] }, BAD_DAYS],
    ['코드 줄이 배열 아님', { codes: codeRow(FROM, 'MM101') }, BAD_DAY_CODES],
    ['코드 줄에 범위 뒤 날', { codes: [...CODES, codeRow(AFTER_RANGE, 'MM101')] }, BAD_DAY_CODES],
    ['코드 줄에 범위 앞 날', { codes: [codeRow(BEFORE_RANGE, 'MM101'), ...CODES] }, BAD_DAY_CODES],
    ['코드 줄에 날 없음', { codes: [...CODES, { code: 'MM102', count: 1, amount: 1 }] }, BAD_DAY_CODES],
    // 5. 같은 날 같은 코드 두 번(같은 날 날 줄 두 번은 upsert가 막는다)
    ['같은 날 같은 코드 두 번', { codes: [...CODES, CODES[0]] }, UNIQUE],
    ['같은 날 같은 코드 두 번(금액만 다름)', { codes: [...CODES, { ...CODES[2], amount: 1 }] }, UNIQUE],
    ['같은 날 날 줄 두 번', { days: [DAYS[0], DAYS[0], DAYS[1]] }, TWICE],
    // 6. 칸 제약
    ['코드 모양 틀림', { codes: [...CODES, codeRow(FROM, 'MM 102')] }, CHECK],
    ['빈 코드', { codes: [...CODES, codeRow(FROM, '')] }, CHECK],
    ['코드 없음', { codes: [...CODES, { day: FROM, count: 1, amount: 1 }] }, NOT_NULL],
    ['건수 음수', { codes: [...CODES, codeRow(FROM, 'MM102', -1)] }, CHECK],
    ['건수 한도 넘음', { codes: [...CODES, codeRow(FROM, 'MM102', 10_000_001)] }, CHECK],
    ['건수 소수', { codes: [...CODES, codeRow(FROM, 'MM102', 1.5)] }, BAD_INPUT],
    ['건수 없음', { codes: [...CODES, { day: FROM, code: 'MM102', amount: 1 }] }, NOT_NULL],
    ['금액 음수', { codes: [...CODES, codeRow(FROM, 'MM102', 1, -1)] }, CHECK],
    ['금액 글자', { codes: [...CODES, codeRow(FROM, 'MM102', 1, 'abc')] }, BAD_INPUT],
    ['날 줄 건수 음수', { days: [DAYS[0], DAYS[1], dayRow(TO, { visits: -1 })] }, CHECK],
    ['날 줄 금액 모양 틀림(확인 필요한 날인데 총액 있음)', { days: [DAYS[0], DAYS[1], dayRow(TO, { ...nulls(MONEY_COLUMNS), total: 5, unconfirmed: true })] }, CHECK],
    ['날 줄 unconfirmed 없음', { days: [DAYS[0], DAYS[1], dayRow(TO, { unconfirmed: null })] }, NOT_NULL],
    ['날이 2000-01-01 앞', { from: '1999-12-31', to: '1999-12-31', days: [dayRow('1999-12-31')], codes: [] }, CHECK],
  ]

  it('AC-4103.4: 거부 시험의 바탕 호출은 그대로 부르면 된다(거부는 바꾼 한 곳 때문이다)', async () => {
    await seedState()
    await become(A)
    await save()
    expect((await codesOf(A)).map((c) => c.code)).toEqual(['OUT1', 'ES001', 'MM101', 'MM101', 'OUT2'])
  })

  it.each(REJECTS)('AC-4103.4: %s이면 오류이고 두 표(내 줄·B 줄) 모두 그대로다', async (_label, call, error) => {
    await seedState()
    const before = await snapshot()
    expect(before.codes).toHaveLength(5) // 빈 비교가 아니다: 범위 안 옛 코드 줄이 정말 있다
    await become(A)
    await expect(save(call)).rejects.toThrow(error)
    expect(await snapshot()).toEqual(before)
  })
})

describe('AC-4103.5 합계 함수 sales_code_totals', SLOW, () => {
  it('AC-4103.5: 범위 안 내 줄을 코드마다 건수 합·금액 합(null 뺌)·금액 빠짐 표시로 코드 차례로 돌려준다(범위 밖은 안 더함)', async () => {
    for (const row of [
      codeRow('2026-10-01', 'MM101', 3, 45_000),
      codeRow('2026-10-02', 'MM101', 2, 30_000),
      codeRow('2026-10-01', 'ES001', 1, null),
      codeRow('2026-10-02', 'ES001', 1, 50_000),
      codeRow('2026-10-03', 'XR001', 4, null),
      codeRow(BEFORE_RANGE, 'MM101', 9, 999_999),
      codeRow(AFTER_RANGE, 'MM101', 9, 999_999),
      codeRow(AFTER_RANGE, 'ZZ999', 1, 1),
    ])
      await seedCode(A, row)
    await become(A)
    expect(await totals(FROM, TO)).toEqual([
      { code: 'ES001', count: 2, amount: 50_000, missing: true },
      { code: 'MM101', count: 5, amount: 75_000, missing: false },
      { code: 'XR001', count: 4, amount: 0, missing: true },
    ])
    expect(await totals(FROM, FROM)).toEqual([
      { code: 'ES001', count: 1, amount: 0, missing: true },
      { code: 'MM101', count: 3, amount: 45_000, missing: false },
    ])
  })

  it('AC-4103.5: 줄이 없는 범위는 빈 목록이다', async () => {
    await seedCode(A, codeRow(AFTER_RANGE, 'MM101'))
    await become(A)
    expect(await totals(FROM, TO)).toEqual([])
  })

  it('AC-4103.5: 합은 int 범위를 넘어도 된다(건수·금액 bigint)', async () => {
    await seedCode(A, codeRow('2026-10-01', 'MM101', 10_000_000, 3_000_000_000))
    await seedCode(A, codeRow('2026-10-02', 'MM101', 10_000_000, 3_000_000_000))
    await become(A)
    expect(await totals(FROM, TO)).toEqual([{ code: 'MM101', count: 20_000_000, amount: 6_000_000_000, missing: false }])
  })

  it('AC-4103.5: 저장 함수로 넣은 줄이 그대로 합계에 나온다', async () => {
    await become(A)
    await save()
    await become(A)
    expect(await totals(FROM, TO)).toEqual([
      { code: 'ES001', count: 1, amount: 0, missing: true },
      { code: 'MM101', count: 5, amount: 75_000, missing: false },
    ])
  })
})

describe('AC-4103.6 옛 매출 표는 그대로', SLOW, () => {
  it('AC-4103.6: sales_codes·rx_groups 표의 칸·제약·트리거·정책·표 권한·칸 권한·RLS가 그대로다', () => {
    expect(beforeFile.salesCodes.columns).toHaveLength(7) // 빈 비교가 아니다
    expect(beforeFile.rxGroups.policies).toHaveLength(4)
    expect(afterFile.salesCodes).toEqual(beforeFile.salesCodes)
    expect(afterFile.rxGroups).toEqual(beforeFile.rxGroups)
  })

  it('AC-4103.6: sales_codes·rx_groups의 옛 줄이 그대로다', () => {
    expect(oldRows.sales_codes).toHaveLength(1)
    expect(oldRows.rx_groups).toHaveLength(1)
    expect(twiceRows.sales_codes).toEqual(oldRows.sales_codes)
    expect(twiceRows.rx_groups).toEqual(oldRows.rx_groups)
  })

  it('AC-4103.6: 파일은 sales_codes·rx_groups를 부르지 않는다(주석 밖)', () => {
    expect(DAY_CODES_SQL).toContain('sales_day_codes') // 빈 비교가 아니다
    expect(DAY_CODES_SQL).not.toMatch(/\bsales_codes\b|\brx_groups\b|\brx_group_/)
  })

  it('AC-4103.6: sales_days는 day_codes 칸과 그 칸 권한만 더해지고 칸·제약·트리거·정책·표 권한·RLS는 그대로다', () => {
    const [before, after] = [beforeFile.salesDays, afterFile.salesDays]
    expect(before.columns).toHaveLength(OLD_DAY_COLUMNS.length)
    expect(after.columns.slice(0, before.columns.length)).toEqual(before.columns)
    expect(after.columns.slice(before.columns.length).map((c) => c.column_name)).toEqual(['day_codes'])
    const notDayCodes = (c: Row) => !(String(c.def).startsWith('NOT NULL ') && String(c.def).includes('day_codes'))
    expect(after.constraints.filter(notDayCodes)).toEqual(before.constraints)
    expect(after.triggers).toEqual(before.triggers)
    expect(after.policies).toEqual(before.policies)
    expect(after.table).toEqual(before.table)
    expect(after.columnAcl.filter((c) => c.attname !== 'day_codes')).toEqual(before.columnAcl)
    const visits = before.columnAcl.find((c) => c.attname === 'visits')
    expect(visits?.acl).toBeTruthy()
    expect(after.columnAcl.find((c) => c.attname === 'day_codes')?.acl).toBe(visits?.acl) // 열다섯 칸과 같은 넣기·고치기
  })

  it('AC-4103.6: 새 표는 sales_day_codes 하나이고 새 함수는 둘이며 다른 함수는 정의·권한이 그대로다', () => {
    expect(afterFile.tables).toEqual([...beforeFile.tables, 'sales_day_codes'].sort())
    const added = afterFile.functions.filter((f) => !beforeFile.functions.some((b) => b.proname === f.proname))
    expect(added.map((f) => f.proname).sort()).toEqual(NEW_FUNCTIONS)
    expect(afterFile.functions.filter((f) => !NEW_FUNCTIONS.includes(f.proname as string))).toEqual(beforeFile.functions)
  })
})

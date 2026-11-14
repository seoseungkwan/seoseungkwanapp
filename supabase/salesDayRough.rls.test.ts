import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { REVENUE_DAY_KEYS, REVENUE_ROUGH_MAX } from '@/types/revenue'

// 확인 필요한 날의 참고 금액 칸(sales_days.rough_total)·CHECK·칸 권한·저장 함수(save_revenue_range)의 RLS·권한·제약 (first90 REQ-4406, TASK-3).
// salesDayCodes.rls.test.ts와 같은 방법: 진짜 Postgres(PGlite, WASM)에서 운영자가 SQL 편집기에 붙일 migration 파일을 차례로(인증 → 매출 → 날 단위 처방 → 이 파일) 실행한다.
// 실제 Supabase에는 붙지 않는다. Supabase가 미리 갖춘 것(역할·auth 스키마·auth.uid()·auth.jwt()·새 표와 함수의 기본 권한)만 흉내 낸다.
// 시험 자료의 처방 코드·숫자는 모두 지어낸 값이다
const fileOf = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))
const read = (rel: string) => readFileSync(fileOf(rel), 'utf-8')
const AUTH_MIGRATION = read('./migrations/20261028000000_auth.sql')
const REVENUE_MIGRATION = read('./migrations/20261101000400_revenue.sql')
const DAY_CODES_MIGRATION = read('./migrations/20261114000000_sales_day_codes.sql')
const ROUGH_PATH = fileOf('./migrations/20261115000000_sales_day_rough.sql')
// 파일이 아직 없으면 빈 글자로 돌아, 시험마다 '칸·제약이 없다'로 실패한다(무엇이 빠졌는지 시험별로 보인다)
const ROUGH_MIGRATION = existsSync(ROUGH_PATH) ? readFileSync(ROUGH_PATH, 'utf-8') : ''
// 주석을 뺀 SQL 글자
const stripComments = (sql: string) => sql.replace(/--.*$/gm, '')
const ROUGH_SQL = stripComments(ROUGH_MIGRATION)

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

const DAYS_TABLE = 'public.sales_days'
const CODES_TABLE = 'public.sales_day_codes'
/** sales_days에서 사용자가 보내는 열다섯 칸(계약 src/types/revenue.ts 차례. date만 표에서 day다) */
const DAY_SENT = REVENUE_DAY_KEYS.map((key) => (key === 'date' ? 'day' : key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)))
const BEFORE_COLUMNS = ['hospital_id', ...DAY_SENT, 'fetched_at', 'day_codes'] // 매출·날 단위 처방 migration이 만든 칸
const MONEY_COLUMNS = ['total', 'insurer', 'noncovered', 'copay', 'other_total', 'cash', 'card', 'transfer', 'receivable_in']
const SPLIT_COLUMNS = ['insurer', 'noncovered', 'copay', 'other_total']
const SAVE_FN = 'public.save_revenue_range(date,date,jsonb,jsonb)'
const ROUGH_CHECK = 'sales_days_rough_total_check'

const SLOW = { timeout: 60_000 }
const DENIED = /permission denied/
const RLS = /row-level security/
const CHECK = /check constraint/
const BAD_INPUT = /invalid input syntax/

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
const dayRow = (day: string, extra: Row = {}): Row => ({ day, ...COUNTS, ...MONEY, unconfirmed: false, split_unconfirmed: false, ...extra })
/** 확인 필요한 날(금액 아홉 칸 null) */
const uncheckedRow = (day: string, extra: Row = {}): Row => dayRow(day, { ...nulls(MONEY_COLUMNS), unconfirmed: true, ...extra })
/** 나눔만 빈 날(나눔 네 칸 null, total은 숫자) */
const splitRow = (day: string, extra: Row = {}): Row => dayRow(day, { ...nulls(SPLIT_COLUMNS), split_unconfirmed: true, ...extra })
const codeRow = (day: string, code: string, count = 1, amount: number | null = 10_000): Row => ({ day, code, count, amount })

// 저장 시험의 바탕 호출: 10-01 확인된 날 · 10-02 확인 필요한 날(참고 금액 -52,000, 환불이 더 많았던 날) · 10-03 확인 필요한 날(참고 금액 870,000)
const DAYS = [dayRow(FROM), uncheckedRow('2026-10-02', { rough_total: -52_000 }), uncheckedRow(TO, { rough_total: 870_000 })]
const CODES = [codeRow(FROM, 'MM101', 3, 45_000), codeRow(TO, 'MM101', 2, 30_000)]

type Call = { from: string; to: string; days: unknown; codes: unknown }
const GOOD: Call = { from: FROM, to: TO, days: DAYS, codes: CODES }

let db: PGlite // 인증 → 매출 → 날 단위 처방 → 이 파일
let old: PGlite // 인증 → 매출 → 날 단위 처방 → (옛 줄 넣기) → 이 파일 → (참고 금액 넣기) → 이 파일 한 번 더
let hospital: Record<string, string> = {}
type Schema = Awaited<ReturnType<typeof schemaOf>>
let beforeFile: Schema // old에 이 파일을 돌리기 전
let afterFile: Schema // 한 번 돌린 뒤
let afterTwice: Schema // 두 번 돌린 뒤
let oldRows: Record<string, Row[]> = {} // 이 파일 전에 운영자가 본 옛 줄
let firstRows: Record<string, Row[]> = {} // 한 번 돌린 바로 뒤
let onceRows: Record<string, Row[]> = {} // 한 번 돌리고 참고 금액까지 넣은 뒤
let twiceRows: Record<string, Row[]> = {} // 두 번째로 돌린 뒤
let firstError: unknown = null
let twiceError: unknown = null

async function setUp(target: PGlite) {
  await target.exec(SUPABASE_MOCK)
  await target.exec(AUTH_MIGRATION)
  await target.exec(REVENUE_MIGRATION)
  await target.exec(DAY_CODES_MIGRATION)
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

// public의 표 이름, 함수(정의·권한·설정), 매출 표 넷의 모든 모양
async function schemaOf(target: PGlite) {
  const q = async (sql: string) => (await target.query<Row>(sql)).rows
  return {
    tables: (await q(`select relname from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' order by 1`)).map(
      (row) => row.relname as string,
    ),
    functions: await q(
      `select p.proname, p.oid::regprocedure::text as fn, pg_get_functiondef(p.oid) as def, coalesce(p.proacl::text, '') as acl,
              p.prosecdef, p.provolatile, p.proconfig::text as config, pg_get_function_result(p.oid) as result
       from pg_proc p where p.pronamespace = 'public'::regnamespace order by 2`,
    ),
    salesDays: await shapeOf(target, 'sales_days'),
    salesCodes: await shapeOf(target, 'sales_codes'),
    rxGroups: await shapeOf(target, 'rx_groups'),
    salesDayCodes: await shapeOf(target, 'sales_day_codes'),
  }
}

// 운영자 눈으로 본 매출 표 넷의 줄
async function tableRows(target: PGlite) {
  const out: Record<string, Row[]> = {}
  for (const [name, order] of [
    ['sales_days', 'hospital_id, day'],
    ['sales_codes', 'hospital_id, month, code'],
    ['rx_groups', 'hospital_id, sort_order'],
    ['sales_day_codes', 'hospital_id, day, code'],
  ]) {
    out[name] = (await target.query<Row>(`select * from public.${name} order by ${order}`)).rows
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

// 운영자가 owner 병원 날 줄을 넣는다(칸 권한·RLS를 건너뛴다)
async function seedDay(owner: string, row: Row) {
  await operator()
  await insert(DAYS_TABLE, { hospital_id: hospital[owner], ...row })
}

// 운영자 눈으로 본 두 표 전체(바뀌지 않았는지 비교할 때)
async function snapshot() {
  await operator()
  return {
    days: await rows(`select * from ${DAYS_TABLE} order by hospital_id, day`),
    codes: await rows(`select * from ${CODES_TABLE} order by hospital_id, day, code`),
  }
}

// 한 병원의 날 줄(운영자 눈, 견줄 칸만)
async function daysOf(owner: string) {
  await operator()
  return rows(
    `select day::text as day, visits, total, unconfirmed, split_unconfirmed, day_codes, rough_total from ${DAYS_TABLE}
     where hospital_id = $1 order by day`,
    [hospital[owner]],
  )
}
const saved = (day: string, total: number | null, rough: number | null, extra: Row = {}) => ({
  day,
  visits: 3,
  total,
  unconfirmed: total === null,
  split_unconfirmed: false,
  day_codes: true,
  rough_total: rough,
  ...extra,
})

const SAVE = 'select public.save_revenue_range(p_from := $1::date, p_to := $2::date, p_days := $3::jsonb, p_day_codes := $4::jsonb)'
const json = (value: unknown) => (value === null || value === undefined ? null : JSON.stringify(value))

// PostgREST처럼 BEGIN → 함수 호출 → COMMIT. 지금 역할 그대로 부른다
async function save(call: Partial<Call> = {}) {
  const { from, to, days, codes } = { ...GOOD, ...call }
  await db.exec('begin')
  try {
    await rows(SAVE, [from, to, json(days), json(codes)])
    await db.exec('commit')
  } catch (error) {
    await db.exec('rollback')
    throw error
  }
}

/** 줄에서 rough_total 열쇠를 뺀 것(옛 웹이 보내는 날 줄) */
const withoutRough = (row: Row): Row => Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'rough_total'))

// 저장 시험의 바탕: A는 범위 앞 날과 범위 안 확인 필요한 날(참고 금액 있음) 줄이 있고, B는 같은 날 확인 필요한 날 줄(참고 금액 있음)이 있다
async function seedState() {
  await seedDay(A, uncheckedRow(BEFORE_RANGE, { day_codes: true, rough_total: 11_111 }))
  await seedDay(A, uncheckedRow('2026-10-02', { day_codes: true, rough_total: 99_999 }))
  await seedDay(B, uncheckedRow('2026-10-02', { day_codes: true, rough_total: 77_777 }))
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
  await db.exec(ROUGH_MIGRATION)

  old = await PGlite.create()
  await setUp(old)
  // 이 파일 전에 저장된 옛 줄: 확인된 날·확인 필요한 날·나눔만 빈 날과 날 단위 처방 줄 하나
  const oldHospital = await addHospitals(old)
  for (const row of [dayRow(BEFORE_RANGE, { day_codes: true }), uncheckedRow(FROM, { day_codes: true }), splitRow(TO)]) {
    const columns = Object.keys(row)
    await old.query(
      `insert into public.sales_days (hospital_id, ${columns.join(', ')}, fetched_at)
       values ($1, ${columns.map((_, i) => `$${i + 2}`).join(', ')}, '2001-01-01T00:00:00Z')`,
      [oldHospital[A], ...Object.values(row)],
    )
  }
  await old.query(`insert into public.sales_day_codes (hospital_id, day, code, count, amount) values ($1, $2, 'MM101', 3, 45000)`, [
    oldHospital[A],
    FROM,
  ])
  await old.query(`insert into public.sales_codes (hospital_id, month, code, name, count, amount) values ($1, $2, 'MT001', '도수치료', 3, 150000)`, [
    oldHospital[A],
    FROM,
  ])
  await old.query(`insert into public.rx_groups (hospital_id, name, codes, sort_order) values ($1, '도수치료', '{MT001}', 0)`, [oldHospital[A]])
  oldRows = await tableRows(old)
  beforeFile = await schemaOf(old)
  try {
    await old.exec(ROUGH_MIGRATION)
  } catch (error) {
    firstError = error
  }
  afterFile = await schemaOf(old)
  firstRows = await tableRows(old)
  // 한 번 돌린 뒤 참고 금액이 생긴 DB에 다시 붙인다(운영자가 두 번 붙여 넣는 경우)
  if (afterFile.salesDays.columns.some((c) => c.column_name === 'rough_total')) {
    await old.query(`update public.sales_days set rough_total = -52000 where hospital_id = $1 and day = $2`, [oldHospital[A], FROM])
  }
  onceRows = await tableRows(old)
  try {
    await old.exec(ROUGH_MIGRATION)
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

describe('AC-4406.1 칸 rough_total을 없을 때만 더한다 · 두 번 실행해도 된다', SLOW, () => {
  it('AC-4406.1: sales_days 끝에 rough_total(bigint, null 됨, 기본값 없음) 칸 하나가 더해진다', async () => {
    const list = await rows(
      `select column_name, data_type, is_nullable, column_default from information_schema.columns
       where table_schema = 'public' and table_name = 'sales_days' order by ordinal_position`,
    )
    expect(list.map((r) => r.column_name)).toEqual([...BEFORE_COLUMNS, 'rough_total'])
    expect(list.at(-1)).toEqual({ column_name: 'rough_total', data_type: 'bigint', is_nullable: 'YES', column_default: null })
  })

  it('AC-4406.1: 두 번 돌려도 되는 문장만 쓴다(칸은 if not exists, 제약은 지우고 다시 만들기, 함수는 create or replace)', () => {
    const count = (pattern: RegExp) => (ROUGH_SQL.match(pattern) ?? []).length
    expect(count(/alter\s+table\s+public\.sales_days\s+add\s+column\s+if\s+not\s+exists\s+rough_total\s+bigint\b/gi)).toBe(1)
    expect(ROUGH_SQL).not.toMatch(/add\s+column\s+(?!if\s+not\s+exists)/i)
    expect(count(new RegExp(`drop\\s+constraint\\s+if\\s+exists\\s+${ROUGH_CHECK}\\b`, 'gi'))).toBe(1)
    expect(count(new RegExp(`add\\s+constraint\\s+${ROUGH_CHECK}\\b`, 'gi'))).toBe(1)
    expect(count(/add\s+constraint/gi)).toBe(1)
    expect(count(/create\s+or\s+replace\s+function\s+public\.save_revenue_range\s*\(/gi)).toBe(1)
    expect(count(/create\s+or\s+replace\s+function/gi)).toBe(1)
    expect(ROUGH_SQL).not.toMatch(/create\s+function/i)
    expect(ROUGH_SQL).not.toMatch(/create\s+table/i)
    expect(ROUGH_SQL).not.toMatch(/create\s+(or\s+replace\s+)?trigger/i)
    expect(ROUGH_SQL).not.toMatch(/\b(create|drop|alter)\s+policy\b/i)
    expect(ROUGH_SQL).not.toMatch(/\b(drop\s+(table|column|function|trigger)|truncate)\b/i)
  })

  it('AC-4406.1: 공용 함수(my_hospital_id 등)는 만들지도 권한을 바꾸지도 않는다', () => {
    expect(ROUGH_SQL).toContain('public.my_hospital_id()') // 빈 비교가 아니다: 함수가 부르기는 한다
    expect(ROUGH_SQL).not.toMatch(/function\s+public\.(my_hospital_id|touch_updated_at|sales_touch_fetched_at|rx_group_codes_ok|sales_code_totals)\s*\(/i)
  })

  it('AC-4406.1: 같은 DB에 두 번 돌려도 오류가 없고 표·칸·제약·권한·정책·함수와 이미 있던 줄이 그대로다', () => {
    expect(firstError).toBeNull()
    expect(twiceError).toBeNull()
    expect(afterTwice.salesDays.columns.map((c) => c.column_name)).toContain('rough_total') // 빈 비교가 아니다
    expect(afterTwice).toEqual(afterFile)
    expect(onceRows.sales_days.map((r) => r.rough_total)).toEqual([null, -52_000, null])
    expect(twiceRows).toEqual(onceRows)
  })

  it('AC-4406.1: 이 파일 전에 있던 sales_days 줄은 다른 칸이 그대로이고 rough_total이 null이 된다(다른 표 줄도 그대로)', () => {
    expect(oldRows.sales_days).toHaveLength(3) // 빈 비교가 아니다: 확인된 날·확인 필요한 날·나눔만 빈 날
    expect(firstRows.sales_days).toEqual(oldRows.sales_days.map((row) => ({ ...row, rough_total: null })))
    for (const name of ['sales_codes', 'rx_groups', 'sales_day_codes']) {
      expect(oldRows[name], name).toHaveLength(1)
      expect(twiceRows[name], name).toEqual(oldRows[name])
    }
  })

  it('AC-4406.1: 파일 머리 주석에 붙여 넣는 방법·먼저 있어야 할 파일·웹보다 먼저·두 번 붙여도 됨이 있다', () => {
    const lines = ROUGH_MIGRATION.split('\n')
    const head = lines.slice(0, lines.findIndex((line) => !/^(--|\s*$)/.test(line))).join('\n')
    expect(head).toContain('SQL Editor')
    expect(head).toContain('20261114000000_sales_day_codes.sql')
    expect(head).toContain('웹을 올리기 전에 붙인다')
    expect(head).toContain('두 번 붙여도 된다')
    expect(head).toContain('specs/first90')
  })
})

describe('AC-4406.2 CHECK: rough_total은 그날 금액 total이 null일 때만', SLOW, () => {
  it('AC-4406.2: CHECK 이름·글은 rough_total is null or total is null이다', async () => {
    const list = await rows(
      `select conname, pg_get_constraintdef(oid) as def from pg_constraint where conrelid = 'public.sales_days'::regclass and conname = $1`,
      [ROUGH_CHECK],
    )
    expect(list).toEqual([{ conname: ROUGH_CHECK, def: 'CHECK (((rough_total IS NULL) OR (total IS NULL)))' }])
  })

  it.each([0, -52_000, 870_000, REVENUE_ROUGH_MAX, -REVENUE_ROUGH_MAX, 3_000_000_000])(
    'AC-4406.2: 확인 필요한 날(total null)에는 참고 금액 %j를 넣을 수 있다(음수·int 범위를 넘는 금액 포함)',
    async (rough) => {
      await become(A)
      expect(await insert(DAYS_TABLE, uncheckedRow(FROM, { rough_total: rough }), 'returning rough_total')).toEqual([{ rough_total: rough }])
    },
  )

  it.each([
    ['확인된 날', dayRow(FROM)],
    ['나눔만 빈 날(total은 숫자)', splitRow(FROM)],
  ])('AC-4406.2: %s에 참고 금액을 넣으면 CHECK로 거부되고, null이면 들어간다', async (_label, row) => {
    await become(A)
    await expect(insert(DAYS_TABLE, { ...row, rough_total: 1_000 })).rejects.toThrow(CHECK)
    await become(A)
    await expect(insert(DAYS_TABLE, { ...row, rough_total: 0 })).rejects.toThrow(CHECK)
    await become(A)
    expect(await insert(DAYS_TABLE, { ...row, rough_total: null }, 'returning rough_total')).toEqual([{ rough_total: null }])
  })

  it('AC-4406.2: 고치기로도 확인된 날에 참고 금액을 달 수 없고, 참고 금액이 있는 날에 total을 넣을 수 없다', async () => {
    await seedDay(A, dayRow(FROM))
    await seedDay(A, uncheckedRow(TO, { rough_total: 870_000 }))
    const before = await snapshot()
    await become(A)
    await expect(rows(`update ${DAYS_TABLE} set rough_total = 1 where day = $1`, [FROM])).rejects.toThrow(CHECK)
    await become(A)
    await expect(
      rows(`update ${DAYS_TABLE} set total = 5, cash = 5, card = 0, transfer = 0, receivable_in = 0, unconfirmed = false, split_unconfirmed = true where day = $1`, [TO]),
    ).rejects.toThrow(CHECK)
    expect(await snapshot()).toEqual(before)
  })

  it('AC-4406.2: 참고 금액은 정수만이다(소수·글자 거부)', async () => {
    for (const bad of ['1.5', 'abc']) {
      await become(A)
      await expect(insert(DAYS_TABLE, uncheckedRow(FROM, { rough_total: bad }))).rejects.toThrow(BAD_INPUT)
    }
  })
})

describe('AC-4406.2 칸 권한은 rough_total 넣기·고치기만 더한다 · RLS는 그대로', SLOW, () => {
  async function columnsWith(role: string, privilege: string) {
    const list = await rows(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'sales_days'
         and has_column_privilege($1, 'public.sales_days', column_name, $2)
       order by ordinal_position`,
      [role, privilege],
    )
    return list.map((r) => r.column_name)
  }

  it.each(['INSERT', 'UPDATE'])('AC-4406.2: authenticated %s 칸 권한은 열다섯 칸 + day_codes + rough_total이다', async (privilege) => {
    expect(await columnsWith('authenticated', privilege)).toEqual([...DAY_SENT, 'day_codes', 'rough_total'])
  })

  it('AC-4406.2: authenticated는 rough_total을 읽을 수 있다(표 단위 읽기 그대로)', async () => {
    expect(await rows(`select has_column_privilege('authenticated', 'public.sales_days', 'rough_total', 'SELECT') as ok`)).toEqual([{ ok: true }])
  })

  it('AC-4406.2: anon에게 rough_total 칸 권한이 하나도 없다', async () => {
    for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']) {
      expect(await rows(`select has_column_privilege('anon', 'public.sales_days', 'rough_total', $1) as ok`, [privilege])).toEqual([{ ok: false }])
    }
  })

  it('AC-4406.2: sales_days는 rough_total 칸·CHECK·그 칸 권한만 더해지고 다른 칸·제약·트리거·정책·표 권한·RLS는 그대로다', () => {
    const [before, after] = [beforeFile.salesDays, afterFile.salesDays]
    expect(before.columns).toHaveLength(BEFORE_COLUMNS.length) // 빈 비교가 아니다
    expect(after.columns.slice(0, before.columns.length)).toEqual(before.columns)
    expect(after.columns.slice(before.columns.length).map((c) => c.column_name)).toEqual(['rough_total'])
    expect(after.constraints.filter((c) => c.conname !== ROUGH_CHECK)).toEqual(before.constraints)
    expect(after.constraints.map((c) => c.conname)).toContain(ROUGH_CHECK)
    expect(after.triggers).toEqual(before.triggers)
    expect(before.policies).toHaveLength(4)
    expect(after.policies).toEqual(before.policies)
    expect(after.table).toEqual(before.table)
    expect(after.columnAcl.filter((c) => c.attname !== 'rough_total')).toEqual(before.columnAcl)
    const visits = before.columnAcl.find((c) => c.attname === 'visits')
    expect(visits?.acl).toBeTruthy()
    expect(after.columnAcl.find((c) => c.attname === 'rough_total')?.acl).toBe(visits?.acl) // 열다섯 칸과 같은 넣기·고치기
  })

  it('AC-4406.2: 다른 표(sales_day_codes·sales_codes·rx_groups)는 그대로이고 새 표가 없다', () => {
    expect(afterFile.tables).toEqual(beforeFile.tables)
    expect(afterFile.salesDayCodes).toEqual(beforeFile.salesDayCodes)
    expect(afterFile.salesCodes).toEqual(beforeFile.salesCodes)
    expect(afterFile.rxGroups).toEqual(beforeFile.rxGroups)
  })

  it('AC-4406.2: 함수는 save_revenue_range 글만 바뀌고 권한·설정·인자·답 모양과 다른 함수는 그대로다', () => {
    const fn = (schema: Schema) => schema.functions.find((f) => f.fn === 'save_revenue_range(date,date,jsonb,jsonb)')
    const [before, after] = [fn(beforeFile), fn(afterFile)]
    expect(before).toBeTruthy()
    expect(after?.def).not.toBe(before?.def)
    expect({ ...after, def: null }).toEqual({ ...before, def: null })
    expect(after).toMatchObject({ prosecdef: false, provolatile: 'v', config: '{"search_path=\\"\\""}', result: 'void' })
    expect(afterFile.functions.map((f) => f.fn)).toEqual(beforeFile.functions.map((f) => f.fn))
    expect(afterFile.functions.filter((f) => f.proname !== 'save_revenue_range')).toEqual(beforeFile.functions.filter((f) => f.proname !== 'save_revenue_range'))
  })

  it('AC-4406.2: anon은 rough_total을 읽기·넣기·고치기 모두 거부되고 저장 함수도 못 부른다(줄 그대로)', async () => {
    await seedState()
    const before = await snapshot()
    await becomeAnon()
    await expect(rows(`select rough_total from ${DAYS_TABLE}`)).rejects.toThrow(DENIED)
    await expect(insert(DAYS_TABLE, uncheckedRow(TO, { rough_total: 1 }))).rejects.toThrow(DENIED)
    await expect(rows(`update ${DAYS_TABLE} set rough_total = 1`)).rejects.toThrow(DENIED)
    expect(await rows(`select has_function_privilege('anon', $1, 'EXECUTE') as ok`, [SAVE_FN])).toEqual([{ ok: false }])
    await expect(save()).rejects.toThrow(DENIED)
    expect(await snapshot()).toEqual(before)
  })

  it('AC-4406.2: A는 자기 줄의 참고 금액만 보고 고치며, B 줄은 병원으로 골라도 안 보이고 고쳐지지 않는다', async () => {
    await seedState()
    const bBefore = await daysOf(B)
    expect(bBefore).toEqual([saved('2026-10-02', null, 77_777)])
    await become(A)
    expect(await rows(`select day::text as day, rough_total from ${DAYS_TABLE} order by day`)).toEqual([
      { day: BEFORE_RANGE, rough_total: 11_111 },
      { day: '2026-10-02', rough_total: 99_999 },
    ])
    expect(await rows(`select rough_total from ${DAYS_TABLE} where hospital_id = $1`, [hospital[B]])).toEqual([])
    expect(await rows(`update ${DAYS_TABLE} set rough_total = 1 where hospital_id = $1 returning day`, [hospital[B]])).toEqual([])
    expect(await rows(`update ${DAYS_TABLE} set rough_total = 5 where day = '2026-10-02' returning hospital_id, rough_total`)).toEqual([
      { hospital_id: hospital[A], rough_total: 5 },
    ])
    expect(await daysOf(B)).toEqual(bBefore)
  })

  it.each([
    ['승인 대기', PENDING],
    ['거절', REJECTED],
  ])('AC-4406.2: %s 사용자는 참고 금액이 든 줄을 보지도 넣지도 저장하지도 못하고 줄은 그대로다', async (_label, user) => {
    await seedDay(user, uncheckedRow(FROM, { rough_total: 1_000 }))
    const before = await snapshot()
    await become(user)
    expect(await rows(`select * from ${DAYS_TABLE}`)).toEqual([])
    await expect(insert(DAYS_TABLE, uncheckedRow(TO, { rough_total: 1 }))).rejects.toThrow(RLS)
    await become(user)
    expect(await rows(`update ${DAYS_TABLE} set rough_total = 9 returning day`)).toEqual([])
    await expect(save()).rejects.toThrow(RLS)
    expect(await snapshot()).toEqual(before)
  })
})

describe('AC-4406.1 save_revenue_range가 rough_total도 저장한다', SLOW, () => {
  it('AC-4406.1: 함수 글은 지금 글(20261114000000_sales_day_codes.sql)에 rough_total만 더한 것이다', () => {
    const fnText = (sql: string) => {
      const match = /create\s+or\s+replace\s+function\s+public\.save_revenue_range[\s\S]*?end \$\$;/i.exec(stripComments(sql))
      return (match?.[0] ?? '').replace(/\s+/g, ' ').trim()
    }
    const before = fnText(DAY_CODES_MIGRATION)
    const after = fnText(ROUGH_MIGRATION)
    expect(before).toContain('day_codes = excluded.day_codes') // 빈 비교가 아니다
    expect(after).toContain('rough_total')
    // rough_total이 나오는 네 곳(넣는 칸 · 꺼내는 값 · 꺼내는 칸 모양 · 고치는 칸)만 지우면 지금 글과 같다
    const removed = after.replace(/,\s*(?:r\.)?rough_total(?:\s+bigint|\s*=\s*excluded\.rough_total)?/g, '')
    expect(removed).toBe(before)
    expect((after.match(/rough_total/g) ?? []).length).toBe(5)
  })

  it('AC-4406.1: 확인 필요한 날의 rough_total(음수 포함)을 저장하고 확인된 날은 null이며, 다른 칸·코드 줄은 지금처럼 저장된다', async () => {
    await become(A)
    await save()
    expect(await daysOf(A)).toEqual([saved(FROM, 100_000, null), saved('2026-10-02', null, -52_000), saved(TO, null, 870_000)])
    await operator()
    expect(await rows(`select day::text as day, code, count, amount from ${CODES_TABLE} where hospital_id = $1 order by day`, [hospital[A]])).toEqual([
      { day: FROM, code: 'MM101', count: 3, amount: 45_000 },
      { day: TO, code: 'MM101', count: 2, amount: 30_000 },
    ])
  })

  it('AC-4406.1: 옛 인자(날 줄에 rough_total 열쇠 없음)는 null로 저장한다', async () => {
    await become(A)
    await save({ days: DAYS.map(withoutRough) })
    expect(await daysOf(A)).toEqual([saved(FROM, 100_000, null), saved('2026-10-02', null, null), saved(TO, null, null)])
  })

  it('AC-4406.1: 옛 도우미(코드 줄 null)로 다시 저장해도 참고 금액은 날 줄대로 저장되고 day_codes는 거짓이다', async () => {
    await become(A)
    await save({ codes: null })
    expect(await daysOf(A)).toEqual([
      saved(FROM, 100_000, null, { day_codes: false }),
      saved('2026-10-02', null, -52_000, { day_codes: false }),
      saved(TO, null, 870_000, { day_codes: false }),
    ])
  })

  it('AC-4406.1: 다시 저장하면 범위 안 날의 참고 금액이 새 값(열쇠가 없으면 null)으로 바뀌고 범위 밖·B 줄은 그대로다', async () => {
    await seedState()
    const bBefore = await daysOf(B)
    await become(A)
    await save({ days: [dayRow(FROM), withoutRough(DAYS[1]), DAYS[2]] })
    expect(await daysOf(A)).toEqual([
      saved(BEFORE_RANGE, null, 11_111),
      saved(FROM, 100_000, null),
      saved('2026-10-02', null, null),
      saved(TO, null, 870_000),
    ])
    expect(await daysOf(B)).toEqual(bBefore)
  })

  it('AC-4406.1: 참고 금액을 받은 확인 필요한 날이 뒤에 확인된 날로 바뀌면 rough_total을 null로 고친다', async () => {
    await become(A)
    await save()
    await become(A)
    await save({ days: daysFrom(FROM, 3).map((day) => dayRow(day)) })
    expect((await daysOf(A)).map((d) => [d.day, d.total, d.rough_total])).toEqual(daysFrom(FROM, 3).map((day) => [day, 100_000, null]))
  })

  it.each([
    ['확인된 날에 참고 금액', dayRow(FROM, { rough_total: 1_000 })],
    ['나눔만 빈 날에 참고 금액', splitRow(FROM, { rough_total: 0 })],
  ])('AC-4406.1·AC-4406.2: %s을 끼워 보내면 CHECK로 거부되고 두 표(내 줄·B 줄) 모두 그대로다', async (_label, row) => {
    await seedState()
    const before = await snapshot()
    await become(A)
    await expect(save({ days: [row, DAYS[1], DAYS[2]] })).rejects.toThrow(CHECK)
    expect(await snapshot()).toEqual(before)
  })

  it('AC-4406.1: 참고 금액이 소수면 거부되고 두 표가 그대로다', async () => {
    await seedState()
    const before = await snapshot()
    await become(A)
    await expect(save({ days: [DAYS[0], uncheckedRow('2026-10-02', { rough_total: 1.5 }), DAYS[2]] })).rejects.toThrow(BAD_INPUT)
    expect(await snapshot()).toEqual(before)
  })

  it('AC-4406.1: 31일(한도) 저장에서도 확인 필요한 날마다 참고 금액이 들어간다', async () => {
    const month = daysFrom(FROM, 31)
    await become(A)
    await save({ from: FROM, to: month.at(-1), days: month.map((day, i) => (i % 2 ? uncheckedRow(day, { rough_total: i }) : dayRow(day))), codes: [] })
    const list = await daysOf(A)
    expect(list).toHaveLength(31)
    expect(list.map((d) => d.rough_total)).toEqual(month.map((_, i) => (i % 2 ? i : null)))
  })
})

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

// 데스크 계정 올리기 DB: 값은 못 읽고 자기 병원 줄만 쓰는 정의자 함수 열하나
// (desk_upload_plan·desk_claim_upload·desk_report_upload · 표시 넷 desk_sales_marks·desk_stats_day_marks·desk_stats_month_marks·
// desk_stats_coverage · 쓰기 넷 desk_save_revenue_range·desk_upsert_stats_months·desk_upsert_stats_days·desk_add_stats_coverage)
// (admin-view REQ-8024, design.md '데스크 계정 올리기'·'시험 계획', ADR-049).
// adminSync.rls.test.ts와 같은 방법: 진짜 Postgres(PGlite, WASM)에서 운영자가 SQL Editor에 붙일 migration 파일을 **지금 모든 migration**
// (운영 DB 차례 — adminView.rls.test.ts 사슬과 같은 차례 예외) → 20261124000000_admin_view.sql → 20261124010000_admin_sync.sql →
// 이 파일 → 이 파일 그대로 돌린다. 실제 Supabase에는 붙지 않는다. Supabase가 미리 갖춘 것(역할·auth·storage)만 흉내 내고,
// 요청 머리(PostgREST의 request.headers)는 set_config로 흉내 낸다. 병원·사람·메일·비트 표시·숫자는 모두 지어낸 것이다
const fileOf = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))
const read = (rel: string) => readFileSync(fileOf(rel), 'utf-8')
const FILE_NAME = '20261124020000_desk_upload.sql'
const VIEW_FILE = '20261124000000_admin_view.sql'
const SYNC_FILE = '20261124010000_admin_sync.sql'
// 운영 DB에 들어간 차례(adminSync.rls.test.ts CHAIN_NAMES와 같다): 파일 이름 차례이되, 업무일지 덧붙임 둘·통계 묶음 둘은 업무일지 칸 파일 바로 뒤
const CHAIN_NAMES = [
  '20261028000000_auth.sql',
  '20261030000000_precheck_settings.sql',
  '20261030000100_precheck_counts.sql',
  '20261101000000_ai_report.sql',
  '20261101000100_worklog.sql',
  '20261101000110_worklog_bit_fields.sql',
  '20261105000200_worklog_memo_font.sql',
  '20261105000300_worklog_cash_float.sql',
  '20261105000100_stats_rx_groups.sql',
  '20261112000000_stats_rx_groups_exclude.sql',
  '20261101000200_stats.sql',
  '20261101000300_patients.sql',
  '20261101000400_revenue.sql',
  '20261103000000_rx_picks.sql',
  '20261108000000_claim_day_closes.sql',
  '20261108000000_message_templates_reservation.sql',
  '20261109000000_stats_month_sections.sql',
  '20261110000000_form_notices.sql',
  '20261114000000_sales_day_codes.sql',
  '20261115000000_sales_day_rough.sql',
  '20261115010000_form_guides.sql',
  '20261115020000_form_backgrounds.sql',
  '20261115030000_form_notices_accent.sql',
  '20261116000000_sunap.sql',
  '20261117000000_install_files.sql',
  '20261117010000_calendar.sql',
  '20261118000000_stats_goals.sql',
  '20261118100000_desk_accounts.sql',
  '20261119000000_clinic_profile.sql',
  '20261119100000_form_notices_style.sql',
  '20261119200000_desk_install_files.sql',
  '20261119300000_clinic_emr.sql',
  '20261119400000_hospital_emr.sql',
  '20261121000000_contacts.sql',
  '20261121000000_notices.sql',
  '20261121000000_staff.sql',
  '20261121000001_notice_keywords.sql',
  '20261121100000_inventory.sql',
  '20261122000000_location.sql',
  '20261122000000_multi_admin.sql',
  '20261122000000_rule_auto.sql',
  '20261123000000_location_flow_cache.sql',
]
const PATH = fileOf(`./migrations/${FILE_NAME}`)
// 파일이 아직 없으면 빈 글자로 돌아, 시험마다 '함수가 없다'로 실패한다(무엇이 빠졌는지 시험별로 보인다)
const MIGRATION = existsSync(PATH) ? readFileSync(PATH, 'utf-8') : ''
// 주석을 뺀 SQL 글자, 그리고 함수 몸통($$ … $$)까지 뺀 글자(맨 위 문장만 본다)
const SQL = MIGRATION.split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n')
const TOP = SQL.replace(/\$\$[\s\S]*?\$\$/g, "''")

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
  create table auth.users (
    id uuid primary key,
    email text,
    last_sign_in_at timestamptz,
    raw_app_meta_data jsonb not null default '{}',
    email_confirmed_at timestamptz
  );
  create function auth.jwt() returns jsonb language sql stable
    as $$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
`

// 앞 migration이 바구니 줄과 정책을 더한다(이 파일은 Storage를 건드리지 않는다)
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

// 관리자 여럿 migration은 붙이기 전에 주 관리자 후보 하나를 본다 — 운영자 계정을 흉내 낸다(시험 데이터에서는 지워진다)
const OP = '00000000-0000-4000-8000-0000000000ff'
const MULTI_ADMIN_SEED = `
  insert into auth.users (id, email, raw_app_meta_data) values ('${OP}', 'op@fake.test', '{"providers": ["google"]}');
  insert into public.admins (user_id) values ('${OP}');
`

const A = '00000000-0000-4000-8000-0000000000a1' // 승인된 병원 HA 원장(관리자 아님)
const B = '00000000-0000-4000-8000-0000000000b1' // 승인된 병원 HB 원장(관리자 아님) — 다른 의원
const D = '00000000-0000-4000-8000-0000000000d1' // 관리자, 승인된 병원 HD 원장
const C = '00000000-0000-4000-8000-0000000000c1' // 승인 대기 병원 HC 원장
const K = '00000000-0000-4000-8000-0000000000d9' // HA의 데스크(병원 줄 없음) — 비트 PC가 데스크로 켜진 쪽
const J = '00000000-0000-4000-8000-0000000000c9' // 승인 대기 병원 HC의 데스크 메일(대기라 데스크 아님)
const X = '00000000-0000-4000-8000-0000000000b9' // 관리자이면서 HB의 데스크(병원 줄 없음) — 보는 중 시험
const E = '00000000-0000-4000-8000-0000000000e9' // 병원 줄도 데스크 줄도 없음
const USERS = [A, B, D, C, K, J, X, E]
const hospitalOf = (user: string) => `10000000-0000-4000-8000-${user.slice(-12)}`
const HA = hospitalOf(A)
const HB = hospitalOf(B)
const HD = hospitalOf(D)
const HC = hospitalOf(C)
const STATUS: Record<string, 'approved' | 'pending'> = { [A]: 'approved', [B]: 'approved', [D]: 'approved', [C]: 'pending' }
const EMAIL: Record<string, string> = {
  [A]: 'a-clinic@fake.test',
  [B]: 'b-clinic@fake.test',
  [D]: 'd-admin@fake.test',
  [C]: 'c-clinic@fake.test',
  [K]: 'desk-a@fake.test',
  [J]: 'desk-c@fake.test',
  [X]: 'desk-x@fake.test',
  [E]: 'e-user@fake.test',
}
const emailOf = (user: string) => EMAIL[user]

// 탭 id(브라우저마다 무작위)와 비트 표시(요양기관번호 SHA-256 16진 64자 — 지어낸 값)
const T1 = '30000000-0000-4000-8000-000000000001'
const T2 = '30000000-0000-4000-8000-000000000002'
const T3 = '30000000-0000-4000-8000-000000000003'
const M1 = 'a'.repeat(64)
const M2 = 'b'.repeat(64)

type Row = Record<string, unknown>
const SLOW = { timeout: 120_000 }
const DENIED = { code: '42501' }
const BAD = { code: '22023' }
const CHECK = { code: '23514' }

// ── 이 파일이 더하는 것(design.md '데스크 계정 올리기' 표) ─────────────────────────
// [이름(인자), 언어, 정의자인가, 변동성(s 안정·v 바뀜), 답 모양]. 모두 search_path 빔, authenticated만 부르고 PUBLIC·anon은 못 부른다
const NEW_FUNCTIONS: [string, string, boolean, string, string][] = [
  ['desk_upload_plan()', 'sql', true, 's', 'TABLE(months smallint, through_day date)'],
  ['desk_claim_upload(uuid,text)', 'plpgsql', true, 'v', 'boolean'],
  ['desk_report_upload(uuid,date,date,text,boolean)', 'plpgsql', true, 'v', 'void'],
  ['desk_sales_marks(date,date)', 'plpgsql', true, 's', 'TABLE(day date, day_codes boolean, unconfirmed boolean, has_rough boolean)'],
  ['desk_stats_day_marks(date,date)', 'plpgsql', true, 's', 'TABLE(day date, partial boolean, has_sunap boolean)'],
  ['desk_stats_month_marks(date,date)', 'plpgsql', true, 's', 'TABLE(month date, partial boolean, dropoff_as_of date)'],
  ['desk_stats_coverage(date,date)', 'plpgsql', true, 's', 'TABLE(from_day date, to_day date)'],
  ['desk_save_revenue_range(date,date,jsonb,jsonb)', 'plpgsql', true, 'v', 'void'],
  ['desk_upsert_stats_months(jsonb)', 'plpgsql', true, 'v', 'void'],
  ['desk_upsert_stats_days(jsonb)', 'plpgsql', true, 'v', 'void'],
  ['desk_add_stats_coverage(date,date)', 'plpgsql', true, 'v', 'void'],
]
const NEW_FUNCTION_NAMES = NEW_FUNCTIONS.map(([fn]) => fn.replace(/\(.*$/, ''))
// 데스크가 바로 읽으면 지금처럼 0줄인 표(쓰기는 정의자 함수로만)
const VALUE_TABLES = ['sales_days', 'sales_day_codes', 'stats_days', 'stats_months', 'stats_coverage']
// 한 병원 줄을 통째로 견줄 표(바뀌지 않았는지)
const HOSPITAL_TABLES = ['auto_upload_plans', 'auto_upload_status', ...VALUE_TABLES]

let db: PGlite // 지금 사슬 → TASK-1 파일 → TASK-17 파일 → 이 파일 → 이 파일
type Shape = Awaited<ReturnType<typeof shapeOf>>
let before: Shape // 지금 사슬 → TASK-1 파일 → TASK-17 파일(이 파일 전)
let first: Shape
let second: Shape

async function migrate(target: PGlite) {
  await target.exec(SUPABASE_MOCK)
  await target.exec(STORAGE_MOCK)
  for (const name of CHAIN_NAMES) {
    if (name === '20261122000000_multi_admin.sql') await target.exec(MULTI_ADMIN_SEED)
    await target.exec(read(`./migrations/${name}`))
  }
  await target.exec(read(`./migrations/${VIEW_FILE}`))
  await target.exec(read(`./migrations/${SYNC_FILE}`))
}

async function operator(t: PGlite = db) {
  await t.exec('reset role; reset request.jwt.claims; reset request.headers')
}

const viewHeader = (key: string) => JSON.stringify({ 'x-ssk-view': key })

/** 그 사용자로 로그인한 것처럼(JWT의 sub·email). headers = PostgREST가 넘기는 요청 머리 JSON 글자 */
async function become(user: string, headers: string | null = null) {
  await operator()
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: user, email: emailOf(user) })])
  if (headers !== null) await db.query(`select set_config('request.headers', $1, false)`, [headers])
  await db.exec('set role authenticated')
}

async function becomeAnon() {
  await operator()
  await db.exec('set role anon')
}

async function rows(sql: string, params: unknown[] = []) {
  return (await db.query<Row>(sql, params)).rows
}

/** 운영자가 그 표에 줄 하나(json → 표 모양) */
async function put(table: string, row: Row) {
  const columns = Object.keys(row).join(', ')
  await db.query(`insert into ${table} (${columns}) select ${columns} from json_populate_record(null::${table}, $1::json)`, [JSON.stringify(row)])
}

/** 사용자·병원·관리자·데스크 줄(운영자). 병원 줄을 따라 표 줄·계획·상태 줄이 함께 비워진다 */
async function resetData() {
  await operator()
  await db.exec('truncate auth.users cascade')
  for (const user of USERS) {
    await db.query('insert into auth.users (id, email) values ($1, $2)', [user, emailOf(user)])
    const status = STATUS[user]
    if (status === undefined) continue
    await db.query(`insert into public.hospitals (id, owner_id, name, applicant_name, email, status) values ($1, $2, $3, '홍길동', $4, $5)`, [
      hospitalOf(user),
      user,
      `${user.slice(-2)}의원`,
      emailOf(user),
      status,
    ])
  }
  await db.query('insert into public.admins (user_id) values ($1), ($2)', [D, X])
  for (const [h, user] of [
    [HA, K],
    [HC, J],
    [HB, X],
  ]) {
    await db.query(`insert into public.hospital_members (hospital_id, email) values ($1, $2)`, [h, emailOf(user)])
  }
}

/** 한국 날짜 어제·오늘(DB가 셈하는 것과 같은 식) */
async function koreaDays() {
  await operator()
  const [row] = await rows(
    `select ((now() at time zone 'Asia/Seoul')::date - 1)::text as yesterday, (now() at time zone 'Asia/Seoul')::date::text as today,
            date_trunc('month', (now() at time zone 'Asia/Seoul')::date - 1)::date::text as month_start`,
  )
  return { yesterday: String(row.yesterday), today: String(row.today), monthStart: String(row.month_start) }
}

const plusDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

/** 운영자 눈으로 본 그 병원 상태 줄(시각은 있음 여부로, 잡음은 끝 시각 글자와 남은 분 숫자로) */
async function statusOf(h: string) {
  await operator()
  const [row] = await rows(
    `select through_day::text as through_day, filled_from::text as filled_from, last_ok_at::text as last_ok_at, error_code,
            error_at is not null as has_error_at, bit_mark, lease_by::text as lease_by, lease_until::text as lease_until,
            (extract(epoch from lease_until - now()) / 60)::float8 as lease_minutes
       from public.auto_upload_status where hospital_id = $1`,
    [h],
  )
  return row ?? null
}

/** 운영자 눈으로 본 한 병원의 계획·상태·매출·통계 줄 전부(글자) — 바뀌지 않았는지 견줌 */
async function hospitalRows(h: string) {
  await operator()
  const out: Record<string, string[]> = {}
  for (const table of HOSPITAL_TABLES) {
    out[table] = (await rows(`select to_jsonb(t)::text as line from public.${table} t where t.hospital_id = $1 order by 1`, [h])).map((r) => String(r.line))
  }
  return out
}

/** 운영자 눈으로 본 그 병원 매출 날 줄(가져온 시각·병원 칸 뺌)과 날 단위 코드 줄 */
async function salesOf(h: string) {
  await operator()
  const days = (await rows(`select to_jsonb(s) - 'fetched_at' - 'hospital_id' as line from public.sales_days s where s.hospital_id = $1 order by s.day`, [h])).map(
    (r) => r.line,
  )
  const codes = await rows(`select day::text as day, code, count, amount from public.sales_day_codes where hospital_id = $1 order by day, code`, [h])
  return { days, codes }
}

async function statsMonthsOf(h: string) {
  await operator()
  return rows(`select month, partial, source, payload, sections, updated_at::text as updated_at from public.stats_months where hospital_id = $1 order by month`, [h])
}

async function statsDaysOf(h: string) {
  await operator()
  return rows(`select day::text as day, partial, source, payload, updated_at::text as updated_at from public.stats_days where hospital_id = $1 order by day`, [h])
}

async function coverageOf(h: string) {
  await operator()
  return rows(`select from_day::text as from_day, to_day::text as to_day, source from public.stats_coverage where hospital_id = $1 order by from_day, to_day`, [h])
}

/** 관리자 X가 HA 보기를 시작하고 열쇠를 돌려준다(TASK-1 함수) */
async function startViewOfHaByX() {
  await become(X)
  const [row] = await rows(`select public.start_admin_view($1) as key`, [HA])
  return String(row.key)
}

const json = (value: unknown) => (value === null || value === undefined ? null : JSON.stringify(value))

// 데스크 함수 부르기
const deskPlan = async () =>
  (await rows(`select months, through_day::text as through_day from public.desk_upload_plan()`)).map((r) => ({ months: Number(r.months), through_day: r.through_day }))
const deskClaim = async (tab: string | null, mark: string | null) => Boolean((await rows(`select public.desk_claim_upload($1, $2) as ok`, [tab, mark]))[0].ok)
const deskReport = (tab: string | null, through: string | null, filledFrom: string | null, error: string | null, done: boolean | null) =>
  rows(`select public.desk_report_upload($1, $2::date, $3::date, $4, $5)`, [tab, through, filledFrom, error, done])
const salesMarks = (from: string | null, to: string | null) =>
  rows(`select day::text as day, day_codes, unconfirmed, has_rough from public.desk_sales_marks($1::date, $2::date)`, [from, to])
const dayMarks = (from: string | null, to: string | null) =>
  rows(`select day::text as day, partial, has_sunap from public.desk_stats_day_marks($1::date, $2::date)`, [from, to])
const monthMarks = (from: string | null, to: string | null) =>
  rows(`select month::text as month, partial, dropoff_as_of::text as dropoff_as_of from public.desk_stats_month_marks($1::date, $2::date)`, [from, to])
const coverageMarks = (from: string | null, to: string | null) =>
  rows(`select from_day::text as from_day, to_day::text as to_day from public.desk_stats_coverage($1::date, $2::date)`, [from, to])
const deskSaveRevenue = (from: string | null, to: string | null, days: unknown, codes: unknown) =>
  rows(`select public.desk_save_revenue_range($1::date, $2::date, $3::jsonb, $4::jsonb)`, [from, to, json(days), json(codes)])
const ownerSaveRevenue = (from: string | null, to: string | null, days: unknown, codes: unknown) =>
  rows(`select public.save_revenue_range($1::date, $2::date, $3::jsonb, $4::jsonb)`, [from, to, json(days), json(codes)])
const upMonths = (list: unknown) => rows(`select public.desk_upsert_stats_months($1::jsonb)`, [json(list)])
const upDays = (list: unknown) => rows(`select public.desk_upsert_stats_days($1::jsonb)`, [json(list)])
const addCoverage = (from: string | null, to: string | null) => rows(`select public.desk_add_stats_coverage($1::date, $2::date)`, [from, to])

// 원장(TASK-17) 함수 부르기 — 같은 규칙인지 견줄 때
const ownerPlan = async () =>
  (await rows(`select months, through_day::text as through_day from public.my_auto_upload_plan()`)).map((r) => ({ months: Number(r.months), through_day: r.through_day }))
const ownerClaim = async (tab: string | null, mark: string | null) => Boolean((await rows(`select public.claim_auto_upload($1, $2) as ok`, [tab, mark]))[0].ok)
const ownerReport = (tab: string | null, through: string | null, filledFrom: string | null, error: string | null, done: boolean | null) =>
  rows(`select public.report_auto_upload($1, $2::date, $3::date, $4, $5)`, [tab, through, filledFrom, error, done])

/** 오류 번호·글(없으면 null) — 원장 함수와 데스크 함수가 같은 검사로 같은 오류를 내는지 견줌 */
async function errorOf(run: () => Promise<unknown>) {
  try {
    await run()
    return null
  } catch (error) {
    const { code, message } = error as { code?: unknown; message?: unknown }
    return { code, message }
  }
}

// 매출 날 줄(lib/storage/revenue.ts가 보내는 칸) — 확인된 날·확인 필요한 날(참고 금액)
const confirmedDay = (day: string, total = 100000) => ({
  day,
  visits: 10,
  new_patients: 2,
  return_visits: 8,
  total,
  insurer: 60000,
  noncovered: 10000,
  copay: total - 70000,
  other_total: 0,
  cash: 20000,
  card: total - 30000,
  transfer: 10000,
  receivable_in: 0,
  unconfirmed: false,
  split_unconfirmed: false,
})
const unconfirmedDay = (day: string, rough: number | null) => ({
  day,
  visits: 5,
  new_patients: 1,
  return_visits: 4,
  total: null,
  insurer: null,
  noncovered: null,
  copay: null,
  other_total: null,
  cash: null,
  card: null,
  transfer: null,
  receivable_in: null,
  unconfirmed: true,
  split_unconfirmed: false,
  rough_total: rough,
})
const codeRow = (day: string, code: string, count: number, amount: number | null) => ({ day, code, count, amount })

// 통계 달·날 줄(lib/storage/stats.ts saveStats가 보내는 칸에서 source를 뺀 것)
const monthRow = (month: string, partial: boolean, extra: Row = {}) => ({
  month,
  partial,
  payload: { schemaVersion: 2, month, partial, ...extra },
  sections: { v: 1, month, partial, doctors: [{ name: '가짜원장', visits: 3 }] },
})
const dayRow = (day: string, partial: boolean, extra: Row = {}) => ({ day, partial, payload: { schemaVersion: 2, day, partial, totals: { visits: 7 }, ...extra } })

/** 표시 함수 시험용: HA·HB 매출·통계 줄(운영자) */
async function seedMarks() {
  await operator()
  await put('public.sales_days', { hospital_id: HA, ...unconfirmedDay('2026-10-31', 500000) })
  await put('public.sales_days', { hospital_id: HA, ...confirmedDay('2026-11-01'), day_codes: true })
  await put('public.sales_days', { hospital_id: HA, ...unconfirmedDay('2026-11-02', null) })
  await put('public.sales_days', { hospital_id: HB, ...confirmedDay('2026-11-01'), day_codes: true })
  await put('public.sales_day_codes', { hospital_id: HA, ...codeRow('2026-11-01', 'MM042', 3, 9000) })
  await put('public.stats_days', { hospital_id: HA, source: 'bit', ...dayRow('2026-10-31', false, { sunap: { block: 2 } }) })
  await put('public.stats_days', { hospital_id: HA, source: 'bit', ...dayRow('2026-11-01', true) })
  await put('public.stats_days', { hospital_id: HB, source: 'bit', ...dayRow('2026-11-01', false, { sunap: { block: 1 } }) })
  await put('public.stats_months', { hospital_id: HA, source: 'bit', ...monthRow('2026-09', false, { dropoff: { asOf: '2026-11-20', lines: [] } }) })
  await put('public.stats_months', { hospital_id: HA, source: 'bit', ...monthRow('2026-10', false, { dropoff: { asOf: '2026-11-23', lines: [] } }) })
  await put('public.stats_months', { hospital_id: HA, source: 'bit', ...monthRow('2026-11', true) })
  await put('public.stats_months', { hospital_id: HB, source: 'bit', ...monthRow('2026-10', false, { dropoff: { asOf: '2026-11-01', lines: [] } }) })
  await put('public.stats_coverage', { hospital_id: HA, from_day: '2026-09-01', to_day: '2026-09-30', source: 'bit' })
  await put('public.stats_coverage', { hospital_id: HA, from_day: '2026-10-01', to_day: '2026-11-15', source: 'file' })
  await put('public.stats_coverage', { hospital_id: HA, from_day: '2026-11-20', to_day: '2026-11-22', source: 'bit' })
  await put('public.stats_coverage', { hospital_id: HB, from_day: '2026-10-01', to_day: '2026-11-30', source: 'bit' })
}

// 이 파일이 손댈 수 있는 것 전부: public 표의 칸·제약·권한(표·칸)·트리거·색인, 모든 정책, public 함수, 버킷
async function shapeOf(target: PGlite) {
  await target.exec('reset role; reset request.jwt.claims; reset request.headers')
  const q = async (sql: string) => (await target.query<Row>(sql)).rows
  return {
    columns: await q(
      `select table_name, column_name, data_type, is_nullable, column_default from information_schema.columns
       where table_schema = 'public' order by 1, ordinal_position`,
    ),
    constraints: await q(
      `select conrelid::regclass::text as tbl, conname, pg_get_constraintdef(oid) as def from pg_constraint
       where connamespace = 'public'::regnamespace order by 1, 2`,
    ),
    access: await q(
      `select c.relname, c.relrowsecurity, (select array_agg(item::text order by item::text) from unnest(c.relacl) item) as acl,
              (select array_agg(a.attname || ':' || coalesce(a.attacl::text, '') order by a.attnum) from pg_attribute a
                where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped) as columns
       from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v') order by 1`,
    ),
    indexes: await q(`select tablename, indexname, indexdef from pg_indexes where schemaname = 'public' order by 1, 2`),
    policies: await q(
      `select schemaname, tablename, policyname, cmd, permissive, roles::text[] as roles, qual, with_check from pg_policies order by 1, 2, 3`,
    ),
    triggers: await q(
      `select tgrelid::regclass::text as tbl, tgname, pg_get_triggerdef(oid) as def from pg_trigger where not tgisinternal order by 1, 2`,
    ),
    functions: await q(
      `select p.oid::regprocedure::text as fn, pg_get_functiondef(p.oid) as def, p.prosecdef as definer, p.proconfig as config,
              p.provolatile as volatile, l.lanname as lang, pg_get_function_result(p.oid) as result,
              pg_get_function_identity_arguments(p.oid) as args,
              (select array_agg(item::text order by item::text) from unnest(p.proacl) item) as acl
       from pg_proc p join pg_language l on l.oid = p.prolang where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' order by 1`,
    ),
    hospitalTables: await q(
      `select c.table_name from information_schema.columns c join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
       where c.table_schema = 'public' and c.column_name = 'hospital_id' and t.table_type = 'BASE TABLE' order by 1`,
    ),
    buckets: await q(`select id, name, public, file_size_limit, allowed_mime_types from storage.buckets order by 1`),
  }
}

const bare = (name: unknown) => String(name).replace(/^public\./, '')
const fnName = (fn: unknown) => bare(fn).replace(/\(.*$/, '')

/** 이 파일이 더한 것(새 함수 열하나)을 뺀 모양 */
function withoutNew(shape: Shape): Shape {
  return { ...shape, functions: shape.functions.filter((f) => !NEW_FUNCTION_NAMES.includes(fnName(f.fn))) }
}

const aclHas = (acl: unknown, role: string) => ((acl as string[] | null) ?? []).some((item) => item.startsWith(`${role}=`) && /=[^/]*X/.test(item))
const fnOf = (shape: Shape, fn: string) => shape.functions.find((f) => bare(f.fn) === fn)

beforeAll(async () => {
  db = await PGlite.create()
  await migrate(db)
  before = await shapeOf(db)
  await db.exec(MIGRATION)
  first = await shapeOf(db)
  await db.exec(MIGRATION)
  second = await shapeOf(db)
}, 300_000)

afterAll(async () => {
  await db.close()
})

// 시험마다 빈 표에서 시작한다. 운영자(superuser)는 RLS를 건너뛴다
beforeEach(async () => {
  await resetData()
}, 60_000)

describe('AC-8024.1 파일 · 사슬 · 두 번 실행 · 더하기만 · 함수 열하나 · 데스크 바로 읽기 0줄', SLOW, () => {
  it('AC-8024.1: 시험 사슬은 이 파일보다 앞인 migration 모두다(TASK-17 파일이 마지막, 빠짐·겹침 없음)', () => {
    const files = readdirSync(fileOf('./migrations/'))
      .filter((name) => name.endsWith('.sql') && name < FILE_NAME)
      .sort()
    expect([...CHAIN_NAMES, VIEW_FILE, SYNC_FILE].sort()).toEqual(files)
    expect(new Set(CHAIN_NAMES).size).toBe(CHAIN_NAMES.length)
    expect(files.at(-1)).toBe(SYNC_FILE)
  })

  it('AC-8024.1: 파일이 있고 줄 끝이 LF이며, 머리 주석에 무엇·실행·차례·두 번·관문·명세 번호가 있다', () => {
    expect(MIGRATION).not.toBe('')
    expect(MIGRATION).not.toContain('\r')
    const lines = MIGRATION.split('\n')
    const head = lines.slice(0, lines.findIndex((line) => !/^(--|\s*$)/.test(line))).join('\n')
    for (const word of [
      ...NEW_FUNCTION_NAMES,
      'REQ-8024',
      'ADR-049',
      '20261124010000_admin_sync.sql 다음에 붙인다',
      '운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다',
      '두 번 붙여 넣어도 그대로다',
      '이 파일을 먼저 붙여 넣고 그다음 사이트에 올린다',
    ]) {
      expect(head, word).toContain(word)
    }
  })

  it('AC-8024.1: 함수만 바꿔 쓴다 — 새 표·색인·트리거·정책·표 권한·기본 권한·표 고치기·맨 위 쓰기 문장이 없고, 앞 파일 함수를 다시 만들지 않는다', () => {
    expect(TOP).not.toMatch(/create\s+(unique\s+)?(table|index|view|sequence|type|schema)\b/i)
    expect(TOP).not.toMatch(/create\s+function/i)
    expect(TOP).not.toMatch(/create\s+(constraint\s+)?trigger/i)
    expect(TOP).not.toMatch(/\bpolicy\b/i)
    expect(TOP).not.toMatch(/^\s*alter\s+table\b/im)
    expect(TOP).not.toMatch(/\bon\s+table\b/i)
    expect(TOP).not.toMatch(/alter\s+default\s+privileges/i)
    expect(TOP).not.toMatch(/^\s*(drop|truncate|delete|update|insert|alter)\b/im)
    expect(TOP).not.toMatch(/\bdo\s+''/i)
    const made = [...TOP.matchAll(/create\s+or\s+replace\s+function\s+public\.(\w+)/gi)].map(([, name]) => name)
    expect(made.sort()).toEqual([...NEW_FUNCTION_NAMES].sort())
    // 권한 문장은 새 함수 열하나에만
    for (const [, target] of TOP.matchAll(/^\s*(?:revoke|grant)\s+[^;]*?\s+on\s+function\s+public\.(\w+)/gim)) expect(NEW_FUNCTION_NAMES).toContain(target)
  })

  it('AC-8024.1: 두 번째 실행 뒤 표·정책·권한·함수 모양이 첫 실행 뒤와 같다', () => {
    expect(second).toEqual(first)
  })

  it('AC-8024.1: 앞 파일들의 표·칸·기본값·제약·색인·트리거·정책·표 권한·함수·바구니는 하나도 바뀌지 않는다(더하기만 — 새 표 없음)', () => {
    expect(withoutNew(first)).toEqual(withoutNew(before))
    expect(first.hospitalTables).toEqual(before.hospitalTables)
    const added = first.functions.map((f) => fnName(f.fn)).filter((name) => !before.functions.some((b) => fnName(b.fn) === name))
    expect(added.sort()).toEqual([...NEW_FUNCTION_NAMES].sort())
  })

  it.each(NEW_FUNCTIONS)('AC-8024.1: 함수 %s 언어 %s · 정의자 %s · 변동성 %s · 답 %s, search_path 빔, authenticated만 부름', (fn, lang, definer, volatile, result) => {
    const found = fnOf(first, fn)
    expect(found, fn).toBeDefined()
    expect(found?.lang).toBe(lang)
    expect(found?.definer).toBe(definer)
    expect(found?.volatile).toBe(volatile)
    expect(found?.result).toBe(result)
    expect(found?.config).toEqual(['search_path=""'])
    expect(aclHas(found?.acl, 'authenticated')).toBe(true)
    expect(aclHas(found?.acl, 'anon')).toBe(false)
    expect(((found?.acl as string[] | null) ?? []).some((item) => item.startsWith('='))).toBe(false)
  })

  it('AC-8024.1: anon은 열하나 어느 것도 부르지 못한다(42501)', async () => {
    for (const [sql, params] of [
      ['select * from public.desk_upload_plan()', []],
      ['select public.desk_claim_upload($1, $2)', [T1, M1]],
      ['select public.desk_report_upload($1, $2, $3, $4, $5)', [T1, null, null, null, true]],
      ['select * from public.desk_sales_marks($1, $2)', ['2026-11-01', '2026-11-02']],
      ['select * from public.desk_stats_day_marks($1, $2)', ['2026-11-01', '2026-11-02']],
      ['select * from public.desk_stats_month_marks($1, $2)', ['2026-11-01', '2026-11-02']],
      ['select * from public.desk_stats_coverage($1, $2)', ['2026-11-01', '2026-11-02']],
      ['select public.desk_save_revenue_range($1, $2, $3, $4)', ['2026-11-01', '2026-11-01', json([confirmedDay('2026-11-01')]), null]],
      ['select public.desk_upsert_stats_months($1)', [json([monthRow('2026-11', false)])]],
      ['select public.desk_upsert_stats_days($1)', [json([dayRow('2026-11-01', false)])]],
      ['select public.desk_add_stats_coverage($1, $2)', ['2026-11-01', '2026-11-02']],
    ] as [string, unknown[]][]) {
      await becomeAnon()
      await expect(rows(sql, params), sql).rejects.toMatchObject(DENIED)
    }
  })

  it('AC-8024.1: 데스크 K가 매출·통계 다섯 표를 바로 select하면 지금처럼 0줄이고(쓴 뒤에도), my_auto_upload_plan은 지금처럼 줄이 없다', async () => {
    await seedMarks()
    const look = async () => {
      await become(K)
      const counts: Record<string, number> = {}
      for (const table of VALUE_TABLES) counts[table] = Number((await rows(`select count(*)::int as n from public.${table}`))[0].n)
      return counts
    }
    const none = Object.fromEntries(VALUE_TABLES.map((table) => [table, 0]))
    expect(await look()).toEqual(none)
    await become(K)
    await deskSaveRevenue('2026-11-03', '2026-11-03', [confirmedDay('2026-11-03')], [codeRow('2026-11-03', 'MM042', 1, 3000)])
    await upMonths([monthRow('2026-08', false)])
    await upDays([dayRow('2026-11-03', false)])
    await addCoverage('2026-11-03', '2026-11-03')
    expect(await look()).toEqual(none)
    await become(K)
    expect(await ownerPlan()).toEqual([])
    // 운영자 눈으로는 HA에 줄이 있다(데스크가 쓴 것 포함)
    expect((await salesOf(HA)).days).toHaveLength(4)
  })
})

describe('AC-8024.2 계획 · 잡기 · 보고 desk_upload_plan · desk_claim_upload · desk_report_upload', SLOW, () => {
  it('AC-8024.2: 데스크 K는 HA 한 줄(months — 줄 없으면 2, through_day — 줄 없으면 null)만 받고, 언제나 원장 A의 my_auto_upload_plan과 같다', async () => {
    await become(K)
    expect(await deskPlan()).toEqual([{ months: 2, through_day: null }])
    await become(D)
    await rows('select public.set_auto_upload_months($1, $2)', [HA, 36])
    await rows('select public.set_auto_upload_months($1, $2)', [HB, 120])
    const { yesterday } = await koreaDays()
    await become(A)
    expect(await ownerClaim(T1, M1)).toBe(true)
    await ownerReport(T1, yesterday, null, 'E-STATS-SAVE-FAILED', true)
    await become(K)
    const desk = await deskPlan()
    expect(desk).toEqual([{ months: 36, through_day: yesterday }])
    await become(A)
    expect(await ownerPlan()).toEqual(desk)
    // 두 칸뿐이다(오류·시각·잡음·표시는 주지 않는다)
    await become(K)
    const [raw] = await rows('select * from public.desk_upload_plan()')
    expect(Object.keys(raw).sort()).toEqual(['months', 'through_day'])
    // HB의 데스크 X(보는 중 아님)는 HB 줄
    await become(X)
    expect(await deskPlan()).toEqual([{ months: 120, through_day: null }])
  })

  it('AC-8024.2: 처음 잡으면 true이고 비트 표시 M1이 HA에 묶이며 잡음은 탭1·7분이다(다른 병원 줄은 안 생김)', async () => {
    await become(K)
    expect(await deskClaim(T1, M1)).toBe(true)
    const row = await statusOf(HA)
    expect(row).toMatchObject({ bit_mark: M1, lease_by: T1, error_code: null, through_day: null })
    expect(Number(row?.lease_minutes)).toBeGreaterThan(6.9)
    expect(Number(row?.lease_minutes)).toBeLessThanOrEqual(7)
    for (const h of [HB, HC, HD]) expect(await statusOf(h), h).toBeNull()
  })

  it('AC-8024.2: 같은 차례로 부르면 원장 함수(claim_auto_upload·report_auto_upload)와 데스크 함수가 같은 답·같은 상태 줄을 만든다', async () => {
    const { yesterday, monthStart } = await koreaDays()
    type Step = [string, string | null, string | null, string | null, string | null, boolean]
    const steps: Step[] = [
      ['claim', T1, M1, null, null, false],
      ['claim', T2, M1, null, null, false],
      ['claim', T2, M2, null, null, false],
      ['report', T1, '2026-10-31', '2026-10-01', null, false],
      ['report', T2, yesterday, monthStart, null, true],
      ['report', T1, '2026-11-05', '2026-10-01', 'E-STATS-SAVE-FAILED', true],
      ['claim', T3, null, null, null, false],
      ['report', T3, yesterday, monthStart, null, false],
      ['claim', T3, M1, null, null, false],
      ['report', T3, yesterday, monthStart, null, true],
    ]
    const run = async (user: string, claim: typeof ownerClaim, report: typeof ownerReport) => {
      const answers: unknown[] = []
      const states: unknown[] = []
      for (const [kind, tab, a, b, c, done] of steps) {
        await become(user)
        if (kind === 'claim') answers.push(await claim(tab, a))
        else answers.push(await report(tab, a, b, c, done).then(() => 'ok'))
        const row = await statusOf(HA)
        states.push(row && { ...row, last_ok_at: row.last_ok_at !== null, lease_until: row.lease_until !== null, lease_minutes: undefined })
      }
      return { answers, states }
    }
    const owner = await run(A, ownerClaim, ownerReport)
    await resetData()
    const desk = await run(K, deskClaim, deskReport)
    expect(desk).toEqual(owner)
    expect(desk.answers).toEqual([true, false, false, 'ok', 'ok', 'ok', true, 'ok', true, 'ok'])
    expect(desk.states.at(-1)).toMatchObject({ through_day: yesterday, filled_from: monthStart, error_code: null, bit_mark: M1, lease_by: null })
  })

  it('AC-8024.2: 원장 탭과 데스크 탭은 같은 잡음을 다툰다 — 한 곳만 true, 잡음이 풀리거나 끝나면 다른 쪽이 잡는다', async () => {
    await become(A)
    expect(await ownerClaim(T1, M1)).toBe(true)
    await become(K)
    expect(await deskClaim(T2, M1)).toBe(false)
    expect(await statusOf(HA)).toMatchObject({ lease_by: T1, error_code: null })
    // 데스크 탭의 보고는 원장 탭이 잡은 줄을 바꾸지 않는다
    const held = await hospitalRows(HA)
    await become(K)
    await deskReport(T2, null, null, 'E-AUTO-UPLOAD', true)
    expect(await hospitalRows(HA)).toEqual(held)
    // 원장 탭이 끝내면 데스크 탭이 잡고, 이제 원장 탭은 못 잡는다
    await become(A)
    await ownerReport(T1, null, null, null, true)
    await become(K)
    expect(await deskClaim(T2, M1)).toBe(true)
    await become(A)
    expect(await ownerClaim(T1, M1)).toBe(false)
    // 7분이 지나면(lease_until을 당겨 봄) 원장 탭이 다시 잡는다
    await operator()
    await db.query(`update public.auto_upload_status set lease_until = now() - interval '1 second' where hospital_id = $1`, [HA])
    await become(A)
    expect(await ownerClaim(T1, M1)).toBe(true)
    await become(K)
    expect(await deskClaim(T2, M1)).toBe(false)
  })

  it('AC-8024.2: 원장이 묶은 비트 표시와 다른 표시로 데스크가 잡으면 false이고 E-AUTO-OTHER-BIT만 적힌다(표시·잡음 그대로)', async () => {
    await become(A)
    expect(await ownerClaim(T1, M1)).toBe(true)
    await operator()
    await db.query(`update public.auto_upload_status set lease_until = null, lease_by = null where hospital_id = $1`, [HA])
    await become(K)
    expect(await deskClaim(T2, M2)).toBe(false)
    expect(await statusOf(HA)).toMatchObject({ bit_mark: M1, lease_by: null, error_code: 'E-AUTO-OTHER-BIT', has_error_at: true })
    // 표시 null은 묶기·검사 없이 잡기만
    await become(K)
    expect(await deskClaim(T2, null)).toBe(true)
    expect(await statusOf(HA)).toMatchObject({ bit_mark: M1, lease_by: T2 })
  })

  it('AC-8024.2: 표시 모양이 아니면 22023, 보고 값이 틀리면 22023이다(report_auto_upload와 같은 검사)', async () => {
    for (const mark of ['', 'xyz', 'A'.repeat(64), 'a'.repeat(63), 'a'.repeat(65), `${'a'.repeat(63)}g`]) {
      await become(K)
      await expect(deskClaim(T1, mark), mark).rejects.toMatchObject(BAD)
    }
    expect(await statusOf(HA)).toBeNull()
    const { yesterday, today, monthStart } = await koreaDays()
    await become(K)
    expect(await deskClaim(T1, M1)).toBe(true)
    const held = await hospitalRows(HA)
    for (const [through, filledFrom, error] of [
      [today, null, null],
      ['2999-01-01', null, null],
      [yesterday, '2026-10-02', null],
      ['2026-01-15', '2026-02-01', null],
      [null, monthStart, null],
      [yesterday, monthStart, 'oops'],
      [yesterday, monthStart, 'e-auto-upload'],
      [yesterday, monthStart, `E-${'A'.repeat(41)}`],
      [yesterday, monthStart, ''],
    ] as [string | null, string | null, string | null][]) {
      await become(K)
      await expect(deskReport(T1, through, filledFrom, error, true), `${through} ${filledFrom} ${error}`).rejects.toMatchObject(BAD)
    }
    expect(await hospitalRows(HA)).toEqual(held)
    // 경계: 어제·그달 1일·40자 번호는 된다
    await become(K)
    await deskReport(T1, yesterday, monthStart, `E-${'A'.repeat(40)}`, false)
    expect(await statusOf(HA)).toMatchObject({ through_day: yesterday, error_code: `E-${'A'.repeat(40)}`, lease_by: T1 })
  })

  it.each([
    ['원장 A(HA 원장이어도)', A],
    ['원장 B', B],
    ['관리자이자 원장 D', D],
    ['대기 병원 데스크 메일 J', J],
    ['대기 원장 C', C],
    ['데스크도 병원도 없는 E', E],
  ])('AC-8024.2: %s는 desk_upload_plan 줄이 없고 잡기·보고는 42501이다(탭·값이 틀려도 이것이 먼저)', async (_label, user) => {
    await become(user)
    expect(await deskPlan()).toEqual([])
    await expect(deskClaim(T1, M1)).rejects.toMatchObject(DENIED)
    await expect(deskClaim(null, 'xyz')).rejects.toMatchObject(DENIED)
    await expect(deskReport(T1, null, null, null, true)).rejects.toMatchObject(DENIED)
    await expect(deskReport(T1, '2999-01-01', null, 'oops', true)).rejects.toMatchObject(DENIED)
    for (const h of [HA, HB, HC, HD]) expect(await statusOf(h), h).toBeNull()
  })

  it('AC-8024.2: 데스크 K도 탭 id가 없으면 42501이다(표시가 틀려도 이것이 먼저)', async () => {
    await become(K)
    await expect(deskClaim(null, M1)).rejects.toMatchObject(DENIED)
    await expect(deskClaim(null, 'xyz')).rejects.toMatchObject(DENIED)
    await expect(deskReport(null, null, null, null, true)).rejects.toMatchObject(DENIED)
    expect(await statusOf(HA)).toBeNull()
  })

  it('AC-8024.2: TASK-17 원장 함수는 데스크에게 지금처럼 막혀 있다(my_auto_upload_plan 줄 없음·claim·report 42501)', async () => {
    await become(K)
    expect(await ownerPlan()).toEqual([])
    await expect(ownerClaim(T1, M1)).rejects.toMatchObject(DENIED)
    await expect(ownerReport(T1, null, null, null, true)).rejects.toMatchObject(DENIED)
    expect(await statusOf(HA)).toBeNull()
  })

  it('AC-8024.2: 보는 중(요청 머리 x-ssk-view)인 관리자 데스크 X는 계획 줄이 없고 나머지 열 함수는 42501이다(머리가 없거나 틀리면 HB 데스크 그대로)', async () => {
    await seedMarks()
    const key = await startViewOfHaByX()
    const keepA = await hospitalRows(HA)
    const keepB = await hospitalRows(HB)
    await become(X, viewHeader(key))
    expect(await deskPlan()).toEqual([])
    for (const call of [
      () => deskClaim(T1, M1),
      () => deskClaim(T1, null),
      () => deskReport(T1, null, null, null, true),
      () => salesMarks('2026-10-01', '2026-11-30'),
      () => dayMarks('2026-10-01', '2026-11-30'),
      () => monthMarks('2026-10-01', '2026-11-30'),
      () => coverageMarks('2026-10-01', '2026-11-30'),
      () => deskSaveRevenue('2026-11-03', '2026-11-03', [confirmedDay('2026-11-03')], null),
      () => upMonths([monthRow('2026-08', false)]),
      () => upDays([dayRow('2026-11-03', false)]),
      () => addCoverage('2026-11-03', '2026-11-03'),
    ]) {
      await become(X, viewHeader(key))
      await expect(call()).rejects.toMatchObject(DENIED)
    }
    expect(await hospitalRows(HA)).toEqual(keepA)
    expect(await hospitalRows(HB)).toEqual(keepB)
    // 모양이 틀린 머리는 보는 중이 아니다(TASK-1 admin_view_hospital_id 그대로) — HB 데스크로 HB 줄
    await become(X, viewHeader('not-a-key'))
    expect(await deskPlan()).toEqual([{ months: 2, through_day: null }])
    await become(X)
    expect(await salesMarks('2026-11-01', '2026-11-01')).toEqual([{ day: '2026-11-01', day_codes: true, unconfirmed: false, has_rough: false }])
  })

  it('AC-8024.2: 병원 id 인자가 없고(uuid 인자는 탭 하나뿐), 데스크 K의 어떤 부르기로도 HB·HC·HD 줄은 바뀌지 않는다', async () => {
    for (const fn of NEW_FUNCTIONS.map(([name]) => name)) {
      const args = String(fnOf(first, fn)?.args ?? '')
      expect(args, fn).not.toMatch(/hospital/i)
      for (const arg of args.split(',').filter((part) => /\buuid\b/.test(part))) expect(arg.trim(), fn).toBe('p_tab uuid')
    }
    await seedMarks()
    await become(B)
    expect(await ownerClaim(T1, M2)).toBe(true)
    await ownerReport(T1, '2026-10-31', '2026-10-01', null, false)
    const kept: Record<string, unknown> = {}
    for (const h of [HB, HC, HD]) kept[h] = await hospitalRows(h)
    const { yesterday, monthStart } = await koreaDays()
    await become(K)
    expect(await deskClaim(T1, M1)).toBe(true)
    expect(await deskClaim(T1, M2)).toBe(false)
    await deskReport(T1, yesterday, monthStart, null, false)
    await salesMarks('2026-10-01', '2026-11-30')
    await dayMarks('2026-10-01', '2026-11-30')
    await monthMarks('2026-10-01', '2026-11-30')
    await coverageMarks('2026-10-01', '2026-11-30')
    await deskSaveRevenue('2026-11-01', '2026-11-02', [confirmedDay('2026-11-01', 200000), unconfirmedDay('2026-11-02', 1000)], [codeRow('2026-11-01', 'MM042', 9, 27000)])
    await upMonths([monthRow('2026-10', false, { dropoff: { asOf: '2026-11-23', lines: [] } })])
    await upDays([dayRow('2026-11-01', false)])
    await addCoverage('2026-10-01', '2026-11-30')
    await deskReport(T1, yesterday, monthStart, 'E-AUTO-UPLOAD', true)
    for (const h of [HB, HC, HD]) expect(await hospitalRows(h), h).toEqual(kept[h])
  })
})

describe('AC-8024.3 표시 넷 desk_sales_marks · desk_stats_day_marks · desk_stats_month_marks · desk_stats_coverage', SLOW, () => {
  it('AC-8024.3: 매출 표시는 HA 기간 안 날마다 day · day_codes · unconfirmed · has_rough(참고 금액이 있는지)만, 날 차례', async () => {
    await seedMarks()
    await become(K)
    expect(await salesMarks('2026-10-31', '2026-11-02')).toEqual([
      { day: '2026-10-31', day_codes: false, unconfirmed: true, has_rough: true },
      { day: '2026-11-01', day_codes: true, unconfirmed: false, has_rough: false },
      { day: '2026-11-02', day_codes: false, unconfirmed: true, has_rough: false },
    ])
    expect(await salesMarks('2026-11-01', '2026-11-01')).toEqual([{ day: '2026-11-01', day_codes: true, unconfirmed: false, has_rough: false }])
    expect(await salesMarks('2026-12-01', '2026-12-31')).toEqual([])
    const [raw] = await rows(`select * from public.desk_sales_marks('2026-10-01', '2026-11-30')`)
    expect(Object.keys(raw).sort()).toEqual(['day', 'day_codes', 'has_rough', 'unconfirmed'])
  })

  it('AC-8024.3: 통계 날 표시는 day · partial · has_sunap(수납 합계 열쇠가 있는지)만, 날 차례', async () => {
    await seedMarks()
    await become(K)
    expect(await dayMarks('2026-10-01', '2026-11-30')).toEqual([
      { day: '2026-10-31', partial: false, has_sunap: true },
      { day: '2026-11-01', partial: true, has_sunap: false },
    ])
    expect(await dayMarks('2026-11-01', '2026-11-01')).toEqual([{ day: '2026-11-01', partial: true, has_sunap: false }])
    const [raw] = await rows(`select * from public.desk_stats_day_marks('2026-10-01', '2026-11-30')`)
    expect(Object.keys(raw).sort()).toEqual(['day', 'has_sunap', 'partial'])
  })

  it("AC-8024.3: 통계 달 표시는 기간의 첫 달~끝 달마다 month(달 1일) · partial · dropoff_as_of('몇 번까지 받나' 자료 끝 날, 없으면 null)만", async () => {
    await seedMarks()
    await become(K)
    expect(await monthMarks('2026-10-15', '2026-11-10')).toEqual([
      { month: '2026-10-01', partial: false, dropoff_as_of: '2026-11-23' },
      { month: '2026-11-01', partial: true, dropoff_as_of: null },
    ])
    expect(await monthMarks('2026-09-30', '2026-09-30')).toEqual([{ month: '2026-09-01', partial: false, dropoff_as_of: '2026-11-20' }])
    const [raw] = await rows(`select * from public.desk_stats_month_marks('2026-09-01', '2026-11-30')`)
    expect(Object.keys(raw).sort()).toEqual(['dropoff_as_of', 'month', 'partial'])
  })

  it('AC-8024.3: 덮은 기간은 기간과 겹치는 HA 줄의 from_day · to_day만(출처 칸 없음)', async () => {
    await seedMarks()
    await become(K)
    expect(await coverageMarks('2026-10-20', '2026-11-20')).toEqual([
      { from_day: '2026-10-01', to_day: '2026-11-15' },
      { from_day: '2026-11-20', to_day: '2026-11-22' },
    ])
    expect(await coverageMarks('2026-11-16', '2026-11-19')).toEqual([])
    const [raw] = await rows(`select * from public.desk_stats_coverage('2026-09-01', '2026-11-30')`)
    expect(Object.keys(raw).sort()).toEqual(['from_day', 'to_day'])
  })

  it('AC-8024.3: 금액·환자 수·payload·sections 글자는 표시 답 어디에도 없다', async () => {
    await seedMarks()
    await become(K)
    // 칸 이름(has_sunap 등)은 빼고 값만 본다 — 칸 이름은 위 시험들이 정해 둔 것과 견준다
    const answers = [
      ...(await rows(`select * from public.desk_sales_marks('2026-01-01', '2026-12-31')`)),
      ...(await rows(`select * from public.desk_stats_day_marks('2026-01-01', '2026-12-31')`)),
      ...(await rows(`select * from public.desk_stats_month_marks('2026-01-01', '2026-12-31')`)),
      ...(await rows(`select * from public.desk_stats_coverage('2026-01-01', '2026-12-31')`)),
    ]
    expect(answers).toHaveLength(11)
    const all = JSON.stringify(answers.map((row) => Object.values(row)))
    for (const value of answers.flatMap((row) => Object.values(row))) {
      expect(value === null || typeof value === 'boolean' || value instanceof Date, String(value)).toBe(true)
    }
    for (const word of ['500000', '100000', 'totals', 'visits', 'sunap', 'block', 'schemaVersion', '가짜원장', 'doctors', 'MM042', 'file']) {
      expect(all, word).not.toContain(word)
    }
  })

  it('AC-8024.3: 기간이 거꾸로·null·3,700일을 넘으면 22023이고 3,700일은 된다(넷 모두)', async () => {
    for (const call of [salesMarks, dayMarks, monthMarks, coverageMarks]) {
      for (const [from, to] of [
        ['2026-11-02', '2026-11-01'],
        [null, '2026-11-01'],
        ['2026-11-01', null],
        ['2016-01-01', plusDays('2016-01-01', 3700)],
      ] as [string | null, string | null][]) {
        await become(K)
        await expect(call(from, to), `${call.name} ${from} ${to}`).rejects.toMatchObject(BAD)
      }
      await become(K)
      expect(await call('2016-01-01', plusDays('2016-01-01', 3699)), call.name).toEqual([])
    }
  })

  it.each([
    ['원장 A', A],
    ['관리자이자 원장 D', D],
    ['대기 병원 데스크 메일 J', J],
    ['데스크도 병원도 없는 E', E],
  ])('AC-8024.3: %s가 표시 넷을 부르면 42501이다(기간이 틀려도 이것이 먼저)', async (_label, user) => {
    await seedMarks()
    for (const call of [salesMarks, dayMarks, monthMarks, coverageMarks]) {
      await become(user)
      await expect(call('2026-10-01', '2026-11-30'), call.name).rejects.toMatchObject(DENIED)
      await become(user)
      await expect(call('2026-11-30', '2026-10-01'), call.name).rejects.toMatchObject(DENIED)
    }
  })
})

describe('AC-8024.4 매출 저장 desk_save_revenue_range', SLOW, () => {
  const DAYS = [unconfirmedDay('2026-11-01', 450000), confirmedDay('2026-11-02', 150000), confirmedDay('2026-11-03', 90000)]
  const CODES = [codeRow('2026-11-02', 'MM042', 3, 9000), codeRow('2026-11-02', 'AA154', 1, null), codeRow('2026-11-03', 'MM042', 2, 6000)]

  it('AC-8024.4: 데스크 K의 저장은 HA에 원장 A의 save_revenue_range와 같은 매출 날 줄·코드 줄을 만든다(다시 저장하면 고치고, 범위 코드 줄은 바꿈)', async () => {
    await become(A)
    await ownerSaveRevenue('2026-11-01', '2026-11-03', DAYS, CODES)
    const owner = await salesOf(HA)
    expect(owner.days).toHaveLength(3)
    expect(owner.codes).toHaveLength(3)
    await operator()
    await db.query('delete from public.sales_day_codes where hospital_id = $1', [HA])
    await db.query('delete from public.sales_days where hospital_id = $1', [HA])
    await become(K)
    await deskSaveRevenue('2026-11-01', '2026-11-03', DAYS, CODES)
    expect(await salesOf(HA)).toEqual(owner)
    // 둘째 저장: 값이 바뀌고, 그 범위 코드 줄은 준 것으로 바뀌며 범위 밖 코드 줄은 그대로
    await operator()
    await put('public.sales_day_codes', { hospital_id: HA, ...codeRow('2026-11-04', 'MM042', 5, 15000) })
    const next = [confirmedDay('2026-11-02', 170000), unconfirmedDay('2026-11-03', null)]
    await become(A)
    await ownerSaveRevenue('2026-11-02', '2026-11-03', next, [codeRow('2026-11-02', 'BB001', 4, 8000)])
    const ownerNext = await salesOf(HA)
    await operator()
    await db.query('delete from public.sales_day_codes where hospital_id = $1', [HA])
    await db.query('delete from public.sales_days where hospital_id = $1', [HA])
    await become(K)
    await deskSaveRevenue('2026-11-01', '2026-11-03', DAYS, CODES)
    await operator()
    await put('public.sales_day_codes', { hospital_id: HA, ...codeRow('2026-11-04', 'MM042', 5, 15000) })
    await become(K)
    await deskSaveRevenue('2026-11-02', '2026-11-03', next, [codeRow('2026-11-02', 'BB001', 4, 8000)])
    const deskNext = await salesOf(HA)
    expect(deskNext).toEqual(ownerNext)
    expect(deskNext.codes).toEqual([
      { day: '2026-11-02', code: 'BB001', count: 4, amount: 8000 },
      { day: '2026-11-04', code: 'MM042', count: 5, amount: 15000 },
    ])
    expect(deskNext.days.map((line) => (line as Row).day_codes)).toEqual([true, true, true])
  })

  it('AC-8024.4: 코드 줄 null(옛 도우미)이면 day_codes 거짓이고 그 범위 HA 코드 줄을 지운다(원장 함수와 같음)', async () => {
    await operator()
    await put('public.sales_day_codes', { hospital_id: HA, ...codeRow('2026-11-02', 'MM042', 5, 15000) })
    await put('public.sales_day_codes', { hospital_id: HB, ...codeRow('2026-11-02', 'MM042', 5, 15000) })
    await become(K)
    await deskSaveRevenue('2026-11-02', '2026-11-02', [confirmedDay('2026-11-02')], null)
    const desk = await salesOf(HA)
    expect(desk.codes).toEqual([])
    expect((desk.days[0] as Row).day_codes).toBe(false)
    expect((await salesOf(HB)).codes).toHaveLength(1)
  })

  it('AC-8024.4: 날 줄·코드 줄의 hospital_id 열쇠는 쓰지 않는다 — HB 줄은 그대로이고 HA에만 들어간다', async () => {
    await operator()
    await put('public.sales_days', { hospital_id: HB, ...confirmedDay('2026-11-02', 300000), day_codes: true })
    await put('public.sales_day_codes', { hospital_id: HB, ...codeRow('2026-11-02', 'MM042', 7, 21000) })
    const keptB = await hospitalRows(HB)
    await become(K)
    await deskSaveRevenue(
      '2026-11-02',
      '2026-11-02',
      [{ ...confirmedDay('2026-11-02'), hospital_id: HB }],
      [{ ...codeRow('2026-11-02', 'MM042', 1, 3000), hospital_id: HB }],
    )
    expect(await hospitalRows(HB)).toEqual(keptB)
    const desk = await salesOf(HA)
    expect(desk.days).toHaveLength(1)
    expect(desk.codes).toEqual([{ day: '2026-11-02', code: 'MM042', count: 1, amount: 3000 }])
  })

  it('AC-8024.4: 검사는 save_revenue_range와 같다 — 같은 틀린 값에 같은 오류(31일 넘음·날 수 다름·범위 밖 날·코드 9,300개 넘음 등)이고 아무것도 안 바뀐다', async () => {
    const many = Array.from({ length: 9301 }, (_, i) => codeRow('2026-11-02', `C${i}`, 1, 100))
    const span = (from: string, n: number) => Array.from({ length: n }, (_, i) => confirmedDay(plusDays(from, i)))
    const cases: [string, string | null, string | null, unknown, unknown][] = [
      ['끝 < 시작', '2026-11-03', '2026-11-01', span('2026-11-01', 3), null],
      ['시작 null', null, '2026-11-01', span('2026-11-01', 1), null],
      ['32일', '2026-10-01', '2026-11-01', span('2026-10-01', 32), null],
      ['날 줄 null', '2026-11-01', '2026-11-01', null, null],
      ['날 줄이 배열 아님', '2026-11-01', '2026-11-01', { day: '2026-11-01' }, null],
      ['날 수 다름', '2026-11-01', '2026-11-03', span('2026-11-01', 2), null],
      ['범위 밖 날', '2026-11-01', '2026-11-02', [confirmedDay('2026-11-01'), confirmedDay('2026-11-05')], null],
      ['날 없는 줄', '2026-11-01', '2026-11-01', [{ ...confirmedDay('2026-11-01'), day: null }], null],
      ['코드 줄이 배열 아님', '2026-11-02', '2026-11-02', span('2026-11-02', 1), { day: '2026-11-02' }],
      ['코드 9,301개', '2026-11-02', '2026-11-02', span('2026-11-02', 1), many],
      ['범위 밖 코드 날', '2026-11-02', '2026-11-02', span('2026-11-02', 1), [codeRow('2026-11-03', 'MM042', 1, 100)]],
      ['같은 날 두 줄', '2026-11-01', '2026-11-02', [confirmedDay('2026-11-01'), confirmedDay('2026-11-01')], null],
      ['확인된 날 참고 금액', '2026-11-01', '2026-11-01', [{ ...confirmedDay('2026-11-01'), rough_total: 5 }], null],
      ['금액 음수', '2026-11-01', '2026-11-01', [confirmedDay('2026-11-01', -1)], null],
      ['코드 모양 아님', '2026-11-02', '2026-11-02', span('2026-11-02', 1), [codeRow('2026-11-02', 'bad code!', 1, 100)]],
    ]
    for (const [label, from, to, days, codes] of cases) {
      await become(A)
      const owner = await errorOf(() => ownerSaveRevenue(from, to, days, codes))
      await become(K)
      const desk = await errorOf(() => deskSaveRevenue(from, to, days, codes))
      expect(owner, label).not.toBeNull()
      expect(desk, label).toEqual(owner)
    }
    for (const h of [HA, HB]) expect(await salesOf(h), h).toEqual({ days: [], codes: [] })
  })

  it.each([
    ['원장 A', A],
    ['관리자이자 원장 D', D],
    ['대기 병원 데스크 메일 J', J],
    ['데스크도 병원도 없는 E', E],
  ])('AC-8024.4: %s가 부르면 42501이고(값이 틀려도 이것이 먼저) 아무 병원 매출 줄도 안 바뀐다', async (_label, user) => {
    await become(user)
    await expect(deskSaveRevenue('2026-11-02', '2026-11-02', [confirmedDay('2026-11-02')], null)).rejects.toMatchObject(DENIED)
    await expect(deskSaveRevenue('2026-11-03', '2026-11-01', null, null)).rejects.toMatchObject(DENIED)
    for (const h of [HA, HB, HC, HD]) expect(await salesOf(h), h).toEqual({ days: [], codes: [] })
  })
})

describe('AC-8024.5 통계 저장 desk_upsert_stats_months · desk_upsert_stats_days · desk_add_stats_coverage', SLOW, () => {
  it("AC-8024.5: 달 줄은 HA에 source 'bit'로 넣고(sections 포함) 다시 부르면 고친다 — 줄의 source·hospital_id 열쇠는 쓰지 않는다", async () => {
    await operator()
    await put('public.stats_months', { hospital_id: HB, source: 'file', ...monthRow('2026-10', false) })
    const keptB = await hospitalRows(HB)
    const oct = monthRow('2026-10', true, { rx: [{ code: 'MM042', n: 1 }] })
    await become(K)
    await upMonths([{ ...oct, source: 'file', hospital_id: HB }, monthRow('2026-11', true)])
    let saved = await statsMonthsOf(HA)
    expect(saved.map((r) => [r.month, r.partial, r.source, r.payload, r.sections])).toEqual([
      ['2026-10', true, 'bit', oct.payload, oct.sections],
      ['2026-11', true, 'bit', monthRow('2026-11', true).payload, monthRow('2026-11', true).sections],
    ])
    // 고치기: 덜 된 줄 → 다 된 줄(updated_at도 새로)
    await operator()
    await db.query(`update public.stats_months set updated_at = '2020-01-01' where hospital_id = $1`, [HA])
    const done = monthRow('2026-10', false, { rx: [{ code: 'MM042', n: 4 }] })
    await become(K)
    await upMonths([{ ...done, sections: null }])
    saved = await statsMonthsOf(HA)
    expect(saved[0]).toMatchObject({ month: '2026-10', partial: false, source: 'bit', payload: done.payload, sections: null })
    expect(String(saved[0].updated_at) > '2020-01-01 23:59').toBe(true)
    expect(await hospitalRows(HB)).toEqual(keptB)
  })

  it('AC-8024.5: 날 줄은 HA에 넣고 고친다 — 다 된 줄은 덜 된 줄로 덮이지 않는다(트리거 그대로)', async () => {
    await operator()
    await put('public.stats_days', { hospital_id: HB, source: 'bit', ...dayRow('2026-11-01', true) })
    const keptB = await hospitalRows(HB)
    await become(K)
    await upDays([{ ...dayRow('2026-11-01', false, { sunap: { block: 3 } }), hospital_id: HB, source: 'file' }, dayRow('2026-11-02', true)])
    const first1 = await statsDaysOf(HA)
    expect(first1.map((r) => [r.day, r.partial, r.source])).toEqual([
      ['2026-11-01', false, 'bit'],
      ['2026-11-02', true, 'bit'],
    ])
    // 다 된 11월 1일 위에 덜 된 줄 → 옛 줄 그대로(updated_at까지), 덜 된 11월 2일 위에 다 된 줄 → 바뀜
    await become(K)
    await upDays([dayRow('2026-11-01', true), dayRow('2026-11-02', false)])
    const after = await statsDaysOf(HA)
    expect(after[0]).toEqual(first1[0])
    expect(after[1]).toMatchObject({ day: '2026-11-02', partial: false, payload: dayRow('2026-11-02', false).payload })
    expect(await hospitalRows(HB)).toEqual(keptB)
  })

  it('AC-8024.5: 다 된 달 줄은 덜 된 달 줄로 덮이지 않는다(payload·sections 모두 옛 값)', async () => {
    await become(K)
    await upMonths([monthRow('2026-09', false, { dropoff: { asOf: '2026-11-20', lines: [] } })])
    const kept = await statsMonthsOf(HA)
    await become(K)
    await upMonths([{ ...monthRow('2026-09', true), sections: null }])
    expect(await statsMonthsOf(HA)).toEqual(kept)
  })

  it('AC-8024.5: 표 제약이 그대로 걸린다 — 판 번호 2가 아님·달/날/partial이 줄과 다름·sections 모양·크기 한도를 넘으면 23514이고 아무것도 안 바뀐다', async () => {
    const big = 'x'.repeat(65_536)
    const huge = 'x'.repeat(1_048_576)
    for (const list of [
      [{ ...monthRow('2026-10', false), payload: { ...monthRow('2026-10', false).payload, schemaVersion: 3 } }],
      [{ ...monthRow('2026-10', false), payload: { ...monthRow('2026-10', false).payload, month: '2026-11' } }],
      [{ ...monthRow('2026-10', false), payload: { ...monthRow('2026-10', false).payload, partial: true } }],
      [{ ...monthRow('2026-10', false), sections: { v: 2, month: '2026-10', partial: false } }],
      [{ ...monthRow('2026-10', false), sections: { v: 1, month: '2026-10', partial: false, pad: big } }],
      [monthRow('2026-09', false), monthRow('2026-10', false, { pad: huge })],
    ]) {
      await become(K)
      await expect(upMonths(list)).rejects.toMatchObject(CHECK)
    }
    for (const list of [
      [{ ...dayRow('2026-11-01', false), payload: { ...dayRow('2026-11-01', false).payload, schemaVersion: 1 } }],
      [{ ...dayRow('2026-11-01', false), payload: { ...dayRow('2026-11-01', false).payload, day: '2026-11-02' } }],
      [dayRow('2026-10-31', false), dayRow('2026-11-01', false, { pad: big })],
    ]) {
      await become(K)
      await expect(upDays(list)).rejects.toMatchObject(CHECK)
    }
    expect(await statsMonthsOf(HA)).toEqual([])
    expect(await statsDaysOf(HA)).toEqual([])
  })

  it('AC-8024.5: 줄 목록이 배열이 아니거나 null이면 22023이다', async () => {
    for (const list of [null, { month: '2026-10' }, 'x', 3]) {
      await become(K)
      await expect(upMonths(list), JSON.stringify(list)).rejects.toMatchObject(BAD)
      await become(K)
      await expect(upDays(list), JSON.stringify(list)).rejects.toMatchObject(BAD)
    }
    // 빈 배열은 아무것도 안 함
    await become(K)
    await upMonths([])
    await upDays([])
    expect(await statsMonthsOf(HA)).toEqual([])
  })

  it("AC-8024.5: 덮음은 HA에 (시작, 끝, 'bit') 한 줄 — 800일은 되고 801일·거꾸로·null은 22023이다", async () => {
    await become(K)
    await addCoverage('2026-10-01', '2026-11-15')
    await become(K)
    await addCoverage('2024-01-01', plusDays('2024-01-01', 799))
    expect(await coverageOf(HA)).toEqual([
      { from_day: '2024-01-01', to_day: plusDays('2024-01-01', 799), source: 'bit' },
      { from_day: '2026-10-01', to_day: '2026-11-15', source: 'bit' },
    ])
    for (const [from, to] of [
      ['2024-01-01', plusDays('2024-01-01', 800)],
      ['2026-11-02', '2026-11-01'],
      [null, '2026-11-01'],
      ['2026-11-01', null],
    ] as [string | null, string | null][]) {
      await become(K)
      await expect(addCoverage(from, to), `${from} ${to}`).rejects.toMatchObject(BAD)
    }
    expect(await coverageOf(HA)).toHaveLength(2)
    for (const h of [HB, HC, HD]) expect(await coverageOf(h), h).toEqual([])
  })

  it.each([
    ['원장 A', A],
    ['관리자이자 원장 D', D],
    ['대기 병원 데스크 메일 J', J],
    ['데스크도 병원도 없는 E', E],
  ])('AC-8024.5: %s가 쓰기 셋을 부르면 42501이고(값이 틀려도 이것이 먼저) 아무 병원 통계 줄도 안 바뀐다', async (_label, user) => {
    for (const call of [
      () => upMonths([monthRow('2026-10', false)]),
      () => upMonths(null),
      () => upDays([dayRow('2026-11-01', false)]),
      () => upDays({}),
      () => addCoverage('2026-11-01', '2026-11-02'),
      () => addCoverage(null, null),
    ]) {
      await become(user)
      await expect(call()).rejects.toMatchObject(DENIED)
    }
    for (const h of [HA, HB, HC, HD]) {
      expect(await statsMonthsOf(h), h).toEqual([])
      expect(await statsDaysOf(h), h).toEqual([])
      expect(await coverageOf(h), h).toEqual([])
    }
  })
})

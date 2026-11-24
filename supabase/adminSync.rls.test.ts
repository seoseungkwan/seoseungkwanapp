import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

// 저절로 올리기 DB: 채울 기간(auto_upload_plans)·올림 상태(auto_upload_status) 표 둘과 정의자 함수 여섯
// (my_auto_upload_plan·claim_auto_upload·report_auto_upload·admin_auto_upload_list·set_auto_upload_months·admin_compare_first_month)
// (admin-view REQ-8019, design.md '저절로 올리기 DB'·'시험 계획', ADR-048).
// adminView.rls.test.ts와 같은 방법: 진짜 Postgres(PGlite, WASM)에서 운영자가 SQL Editor에 붙일 migration 파일을 **지금 모든 migration**
// (운영 DB 차례 — adminView.rls.test.ts 사슬과 같은 차례 예외) → 20261124000000_admin_view.sql → 이 파일 → 이 파일 그대로 돌린다.
// 실제 Supabase에는 붙지 않는다. Supabase가 미리 갖춘 것(역할·auth·storage)만 흉내 내고, 요청 머리(PostgREST의 request.headers)는
// set_config로 흉내 낸다. 병원·사람·메일·비트 표시는 모두 지어낸 것이다
const fileOf = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))
const read = (rel: string) => readFileSync(fileOf(rel), 'utf-8')
const FILE_NAME = '20261124010000_admin_sync.sql'
const VIEW_FILE = '20261124000000_admin_view.sql'
// 운영 DB에 들어간 차례(adminView.rls.test.ts CHAIN_NAMES와 같다): 파일 이름 차례이되, 업무일지 덧붙임 둘·통계 묶음 둘은 업무일지 칸 파일 바로 뒤
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
// 파일이 아직 없으면 빈 글자로 돌아, 시험마다 '함수·표가 없다'로 실패한다(무엇이 빠졌는지 시험별로 보인다)
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

const A = '00000000-0000-4000-8000-0000000000a1' // 승인된 병원 HA 원장(관리자 아님) — 비트 PC에서 올리는 쪽
const B = '00000000-0000-4000-8000-0000000000b1' // 승인된 병원 HB 원장(관리자 아님) — 다른 의원
const D = '00000000-0000-4000-8000-0000000000d1' // 관리자, 승인된 병원 HD 원장
const C = '00000000-0000-4000-8000-0000000000c1' // 승인 대기 병원 HC 원장
const R = '00000000-0000-4000-8000-0000000000e1' // 거절된 병원 HR 원장
const K = '00000000-0000-4000-8000-0000000000d9' // HA의 데스크(병원 줄 없음)
const E = '00000000-0000-4000-8000-0000000000e9' // 병원 줄도 데스크 줄도 없음
const USERS = [A, B, D, C, R, K, E]
const hospitalOf = (user: string) => `10000000-0000-4000-8000-${user.slice(-12)}`
const HA = hospitalOf(A)
const HB = hospitalOf(B)
const HD = hospitalOf(D)
const HC = hospitalOf(C)
const HR = hospitalOf(R)
const NOWHERE = '00000000-0000-4000-8000-000000000999' // 없는 병원 id
const STATUS: Record<string, 'approved' | 'pending' | 'rejected'> = { [A]: 'approved', [B]: 'approved', [D]: 'approved', [C]: 'pending', [R]: 'rejected' }
const EMAIL: Record<string, string> = {
  [A]: 'a-clinic@fake.test',
  [B]: 'b-clinic@fake.test',
  [D]: 'd-admin@fake.test',
  [C]: 'c-clinic@fake.test',
  [R]: 'r-clinic@fake.test',
  [K]: 'desk-a@fake.test',
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

// ── 이 파일이 더하는 것(design.md '저절로 올리기 DB') ─────────────────────────
const NEW_TABLES = ['auto_upload_plans', 'auto_upload_status'] as const
// [이름(인자), 언어, 정의자인가, 변동성(s 안정·v 바뀜), 답 모양]. 모두 search_path 빔, authenticated만 부르고 PUBLIC·anon은 못 부른다
const NEW_FUNCTIONS: [string, string, boolean, string, string][] = [
  ['my_auto_upload_plan()', 'sql', true, 's', 'TABLE(months smallint, through_day date)'],
  ['claim_auto_upload(uuid,text)', 'plpgsql', true, 'v', 'boolean'],
  ['report_auto_upload(uuid,date,date,text,boolean)', 'plpgsql', true, 'v', 'void'],
  [
    'admin_auto_upload_list()',
    'plpgsql',
    true,
    's',
    'TABLE(hospital_id uuid, months smallint, through_day date, filled_from date, last_ok_at timestamp with time zone, error_code text, error_at timestamp with time zone)',
  ],
  ['set_auto_upload_months(uuid,smallint)', 'plpgsql', true, 'v', 'void'],
  ['admin_compare_first_month()', 'plpgsql', true, 's', 'date'],
]
const NEW_FUNCTION_NAMES = NEW_FUNCTIONS.map(([fn]) => fn.replace(/\(.*$/, ''))
// TASK-1 파일의 함수(부르기만 하고 다시 만들지 않는다)
const VIEW_FILE_FUNCTIONS = [
  'my_hospital_id',
  'admin_view_key',
  'admin_view_hospital_id',
  'read_hospital_id',
  'admin_view_open',
  'start_admin_view',
  'stop_admin_view',
  'my_admin_view',
  'admin_view_log',
  'admin_view_hospitals',
  'set_hospital_region',
  'admin_rows',
]
const FILL_MONTHS = [1, 2, 3, 6, 12, 24, 36, 60, 120]
// 줄여도 지우지 않는 표(set_auto_upload_months가 건드리지 않음)
const KEPT_TABLES = ['sales_days', 'stats_days', 'stats_months', 'stats_coverage']

let db: PGlite // 지금 사슬 → TASK-1 파일 → 이 파일 → 이 파일
type Shape = Awaited<ReturnType<typeof shapeOf>>
let before: Shape // 지금 사슬 → TASK-1 파일(이 파일 전)
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

/** 사용자·병원·관리자·데스크 줄과 매출·통계 줄(운영자). 병원 줄을 따라 표 줄·계획·상태 줄이 함께 비워진다 */
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
  await db.query('insert into public.admins (user_id) values ($1)', [D])
  await db.query(`insert into public.hospital_members (hospital_id, email) values ($1, 'desk-a@fake.test')`, [HA])
}

// 매출·통계 날 줄(가장 이른 달·줄여도 지우지 않음을 보려고). 대기 HC·거절 HR은 승인 병원보다 이른 날을 둔다(세지 않아야 한다)
const STATS_DAYS: [string, string][] = [
  [HA, '2025-03-15'],
  [HA, '2026-11-02'],
  [HB, '2026-10-01'],
  [HC, '2020-01-05'],
  [HR, '2019-02-01'],
]
const SALES_DAYS: [string, string][] = [
  [HA, '2026-11-02'],
  [HB, '2024-11-20'],
  [HC, '2019-06-01'],
  [HR, '2018-01-01'],
]

async function seedNumbers() {
  await operator()
  for (const [h, day] of STATS_DAYS) {
    await put('public.stats_days', { hospital_id: h, day, partial: false, source: 'bit', payload: { schemaVersion: 2, day, partial: false, totals: { visits: 10 } } })
  }
  for (const [h, day] of SALES_DAYS) {
    await put('public.sales_days', { hospital_id: h, day, visits: 10, new_patients: 1, return_visits: 9, unconfirmed: true, split_unconfirmed: false, rough_total: 500000 })
  }
  await put('public.stats_months', { hospital_id: HA, month: '2026-11', partial: false, source: 'bit', payload: { schemaVersion: 2, month: '2026-11', partial: false } })
  await put('public.stats_coverage', { hospital_id: HA, from_day: '2026-11-01', to_day: '2026-11-15', source: 'bit' })
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

/** 운영자 눈으로 본 그 병원 상태 줄 전부(글자) — 바뀌지 않았는지 견줌 */
async function rawStatus(h: string) {
  await operator()
  const [row] = await rows(`select to_jsonb(s)::text as line from public.auto_upload_status s where s.hospital_id = $1`, [h])
  return row ? String(row.line) : null
}

/** 운영자 눈으로 본 그 병원 상태 줄(시각은 글자·있음 여부로, 잡음은 끝 시각 글자와 남은 분 숫자로) */
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

async function planOf(h: string) {
  await operator()
  const [row] = await rows(`select months from public.auto_upload_plans where hospital_id = $1`, [h])
  return row ? Number(row.months) : null
}

async function countsOf(h: string) {
  await operator()
  const out: Record<string, number> = {}
  for (const table of KEPT_TABLES) out[table] = Number((await rows(`select count(*)::int as n from public.${table} where hospital_id = $1`, [h]))[0].n)
  return out
}

/** 관리자 D가 HA 보기를 시작하고 열쇠를 돌려준다(TASK-1 함수) */
async function startViewOfHa() {
  await become(D)
  const [row] = await rows(`select public.start_admin_view($1) as key`, [HA])
  return String(row.key)
}

const claim = async (tab: string | null, mark: string | null) => Boolean((await rows(`select public.claim_auto_upload($1, $2) as ok`, [tab, mark]))[0].ok)
const report = (tab: string | null, through: string | null, filledFrom: string | null, error: string | null, done: boolean | null) =>
  rows(`select public.report_auto_upload($1, $2::date, $3::date, $4, $5)`, [tab, through, filledFrom, error, done])
const myPlan = async () => (await rows(`select months, through_day::text as through_day from public.my_auto_upload_plan()`)).map((r) => ({ months: Number(r.months), through_day: r.through_day }))
const listAll = async () =>
  (
    await rows(
      `select hospital_id, months, through_day::text as through_day, filled_from::text as filled_from, last_ok_at is not null as has_ok,
              error_code, error_at is not null as has_error_at from public.admin_auto_upload_list() order by hospital_id`,
    )
  ).map((r): Row => ({ ...r, months: Number(r.months) }))

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
const isNewTable = (name: unknown) => (NEW_TABLES as readonly string[]).includes(bare(name))
const fnName = (fn: unknown) => bare(fn).replace(/\(.*$/, '')

/** 이 파일이 더한 것(새 표 둘·새 함수 여섯)을 뺀 모양 */
function withoutNew(shape: Shape): Shape {
  return {
    columns: shape.columns.filter((c) => !isNewTable(c.table_name)),
    constraints: shape.constraints.filter((c) => !isNewTable(c.tbl)),
    access: shape.access.filter((t) => !isNewTable(t.relname)),
    indexes: shape.indexes.filter((i) => !isNewTable(i.tablename)),
    policies: shape.policies,
    triggers: shape.triggers.filter((t) => !isNewTable(t.tbl)),
    functions: shape.functions.filter((f) => !NEW_FUNCTION_NAMES.includes(fnName(f.fn))),
    hospitalTables: shape.hospitalTables.filter((t) => !isNewTable(t.table_name)),
    buckets: shape.buckets,
  }
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

describe('AC-8019.1 파일 · 사슬 · 두 번 실행 · 더하기만', SLOW, () => {
  it('AC-8019.1: 시험 사슬은 이 파일보다 앞인 migration 모두다(TASK-1 파일이 마지막, 빠짐·겹침 없음)', () => {
    const files = readdirSync(fileOf('./migrations/'))
      .filter((name) => name.endsWith('.sql') && name < FILE_NAME)
      .sort()
    expect([...CHAIN_NAMES, VIEW_FILE].sort()).toEqual(files)
    expect(new Set(CHAIN_NAMES).size).toBe(CHAIN_NAMES.length)
    expect(files.at(-1)).toBe(VIEW_FILE)
  })

  it('AC-8019.1: 파일이 있고 줄 끝이 LF이며, 머리 주석에 무엇·실행·차례·두 번·관문·명세 번호가 있다', () => {
    expect(MIGRATION).not.toBe('')
    expect(MIGRATION).not.toContain('\r')
    const lines = MIGRATION.split('\n')
    const head = lines.slice(0, lines.findIndex((line) => !/^(--|\s*$)/.test(line))).join('\n')
    for (const word of [
      'auto_upload_plans',
      'auto_upload_status',
      ...NEW_FUNCTION_NAMES,
      'REQ-8019',
      'ADR-048',
      '20261124000000_admin_view.sql 다음에 붙인다',
      '운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다',
      '두 번 붙여 넣어도 그대로다',
      '이 파일을 먼저 붙여 넣고 그다음 사이트에 올린다',
    ]) {
      expect(head, word).toContain(word)
    }
  })

  it('AC-8019.1: 두 번 돌려도 되는 문장만 쓰고 지금 표·TASK-1 함수는 건드리지 않는다(표는 if not exists, 함수는 or replace, 정책 없음)', () => {
    const count = (pattern: RegExp) => (TOP.match(pattern) ?? []).length
    for (const table of NEW_TABLES) expect(count(new RegExp(`create\\s+table\\s+if\\s+not\\s+exists\\s+public\\.${table}\\b`, 'gi')), table).toBe(1)
    expect(TOP).not.toMatch(/create\s+table\s+(?!if\s+not\s+exists)/i)
    expect(TOP).not.toMatch(/create\s+(unique\s+)?index\s+(?!if\s+not\s+exists)/i)
    expect(TOP).not.toMatch(/create\s+function/i)
    expect(TOP).not.toMatch(/create\s+(constraint\s+)?trigger/i)
    expect(TOP).not.toMatch(/\bpolicy\b/i)
    expect(TOP).not.toMatch(/^\s*(drop|truncate|delete|update|insert)\b/im)
    expect(TOP).not.toMatch(/\bdo\s+''/i)
    const made = [...TOP.matchAll(/create\s+or\s+replace\s+function\s+public\.(\w+)/gi)].map(([, name]) => name)
    expect(made.sort()).toEqual([...NEW_FUNCTION_NAMES].sort())
    for (const name of VIEW_FILE_FUNCTIONS) expect(SQL, name).not.toMatch(new RegExp(`function\\s+public\\.${name}\\b`, 'i'))
    for (const [, target] of TOP.matchAll(/^\s*alter\s+table\s+(\S+)/gim)) expect(NEW_TABLES.map((t) => `public.${t}`)).toContain(target)
    for (const [, target] of TOP.matchAll(/^\s*revoke\s+[^;]*?\s+on\s+table\s+(\S+)/gim)) expect(NEW_TABLES.map((t) => `public.${t}`)).toContain(target)
    expect(TOP).not.toMatch(/^\s*grant\s+[^;]*\s+on\s+table\b/im)
    expect(TOP).not.toMatch(/alter\s+default\s+privileges/i)
  })

  it('AC-8019.1: 두 번째 실행 뒤 표·정책·권한·함수 모양이 첫 실행 뒤와 같다', () => {
    expect(second).toEqual(first)
  })

  it('AC-8019.1: TASK-1 파일·앞 migration의 표·칸·제약·색인·트리거·정책·표 권한·함수·바구니는 하나도 바뀌지 않는다(더하기만)', () => {
    expect(withoutNew(first)).toEqual(withoutNew(before))
  })

  it("AC-8019.1: 이 파일이 더한 hospital_id 표는 새 표 둘뿐이고(AC-8002.8 '함수로만' 목록에 드는 꼴), 정책이 하나도 없다", () => {
    const added = first.hospitalTables.map((t) => String(t.table_name)).filter((t) => !before.hospitalTables.some((b) => b.table_name === t))
    expect(added.sort()).toEqual([...NEW_TABLES].sort())
    for (const table of NEW_TABLES) expect(first.policies.filter((p) => p.tablename === table), table).toEqual([])
  })

  it('AC-8019.1: 두 표 칸·기본값이 design.md ① 모양이다', () => {
    const columnsOf = (table: string) =>
      first.columns.filter((c) => c.table_name === table).map((c) => [c.column_name, c.data_type, c.is_nullable, c.column_default])
    expect(columnsOf('auto_upload_plans')).toEqual([
      ['hospital_id', 'uuid', 'NO', null],
      ['months', 'smallint', 'NO', '2'],
      ['updated_at', 'timestamp with time zone', 'NO', 'now()'],
    ])
    expect(columnsOf('auto_upload_status')).toEqual([
      ['hospital_id', 'uuid', 'NO', null],
      ['through_day', 'date', 'YES', null],
      ['filled_from', 'date', 'YES', null],
      ['last_ok_at', 'timestamp with time zone', 'YES', null],
      ['error_code', 'text', 'YES', null],
      ['error_at', 'timestamp with time zone', 'YES', null],
      ['bit_mark', 'text', 'YES', null],
      ['lease_by', 'uuid', 'YES', null],
      ['lease_until', 'timestamp with time zone', 'YES', null],
      ['updated_at', 'timestamp with time zone', 'NO', 'now()'],
    ])
    for (const table of NEW_TABLES) {
      const keys = first.constraints.filter((c) => bare(c.tbl) === table).map((c) => String(c.def))
      expect(keys, table).toContain('PRIMARY KEY (hospital_id)')
      expect(keys.some((d) => /^FOREIGN KEY \(hospital_id\) REFERENCES (public\.)?hospitals\(id\) ON DELETE CASCADE$/.test(d)), table).toBe(true)
    }
  })

  it('AC-8019.1: 칸 검사 — 아홉 밖 달 수·1일 아닌 채운 달·채운 달 > 다 올라온 날·오류 번호 모양·비트 표시 모양은 운영자도 넣지 못한다', async () => {
    await operator()
    for (const months of [0, 4, 5, 7, 240]) {
      await expect(put('public.auto_upload_plans', { hospital_id: HA, months }), String(months)).rejects.toMatchObject(CHECK)
    }
    for (const row of [
      { through_day: '2026-11-20', filled_from: '2026-11-02' },
      { through_day: '2026-01-15', filled_from: '2026-02-01' },
      { through_day: null, filled_from: '2026-11-01' },
      { error_code: 'oops' },
      { error_code: 'e-auto-upload' },
      { error_code: `E-${'A'.repeat(41)}` },
      { bit_mark: 'xyz' },
      { bit_mark: 'A'.repeat(64) },
      { bit_mark: 'a'.repeat(63) },
    ]) {
      await expect(put('public.auto_upload_status', { hospital_id: HA, ...row }), JSON.stringify(row)).rejects.toMatchObject(CHECK)
    }
    // 맞는 값은 들어가고, 병원 줄을 지우면 함께 지워진다
    await put('public.auto_upload_plans', { hospital_id: HA, months: 120 })
    await put('public.auto_upload_status', { hospital_id: HA, through_day: '2026-11-23', filled_from: '2026-11-01', error_code: 'E-HELPER-OLD', bit_mark: M1 })
    await db.query('delete from public.hospitals where id = $1', [HA])
    expect(await planOf(HA)).toBeNull()
    expect(await statusOf(HA)).toBeNull()
  })

  it('AC-8019.1: 두 표 모두 RLS 켜짐·PUBLIC·anon·authenticated 표 권한 없음·정책 없음이다', () => {
    for (const table of NEW_TABLES) {
      const access = first.access.find((t) => t.relname === table)
      expect(access?.relrowsecurity, table).toBe(true)
      const acl = (access?.acl as string[] | null) ?? []
      for (const role of ['anon', 'authenticated']) expect(acl.some((item) => item.startsWith(`${role}=`)), `${table} ${role}`).toBe(false)
      expect(acl.some((item) => item.startsWith('=')), `${table} PUBLIC`).toBe(false)
      expect(((access?.columns as string[] | null) ?? []).every((c) => c.endsWith(':')), `${table} 칸 권한`).toBe(true)
    }
  })

  it.each(NEW_TABLES)('AC-8019.1: 원장·관리자·데스크·anon이 %s를 바로 select·insert·update·delete하면 42501이다', async (table) => {
    await operator()
    await put(`public.${table}`, { hospital_id: HA })
    const statements: [string, unknown[]][] = [
      [`select count(*) from public.${table}`, []],
      [`insert into public.${table} (hospital_id) values ($1)`, [HB]],
      [`update public.${table} set updated_at = now()`, []],
      [`delete from public.${table}`, []],
    ]
    for (const user of [A, D, K, null]) {
      for (const [sql, params] of statements) {
        if (user === null) await becomeAnon()
        else await become(user)
        await expect(rows(sql, params), `${user} ${sql}`).rejects.toMatchObject(DENIED)
      }
    }
    expect(await planOf(HB)).toBeNull()
  })

  it.each(NEW_FUNCTIONS)('AC-8019.1: 함수 %s 언어 %s · 정의자 %s · 변동성 %s · 답 %s, search_path 빔, authenticated만 부름', (fn, lang, definer, volatile, result) => {
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

  it('AC-8019.1: anon은 여섯 함수 어느 것도 부르지 못한다(42501)', async () => {
    for (const [sql, params] of [
      ['select * from public.my_auto_upload_plan()', []],
      ['select public.claim_auto_upload($1, $2)', [T1, M1]],
      ['select public.report_auto_upload($1, $2, $3, $4, $5)', [T1, null, null, null, true]],
      ['select * from public.admin_auto_upload_list()', []],
      ['select public.set_auto_upload_months($1, $2)', [HA, 12]],
      ['select public.admin_compare_first_month()', []],
    ] as [string, unknown[]][]) {
      await becomeAnon()
      await expect(rows(sql, params), sql).rejects.toMatchObject(DENIED)
    }
  })
})

describe('AC-8019.2 채울 기간 바꾸기 set_auto_upload_months', SLOW, () => {
  it('AC-8019.2: 관리자가 HA를 12로, 다시 1로 바꾸면 계획 줄이 생기고 바뀌며 HA 매출·통계 줄 수는 그대로다(줄여도 지우지 않음)', async () => {
    await seedNumbers()
    const kept = await countsOf(HA)
    expect(kept).toEqual({ sales_days: 1, stats_days: 2, stats_months: 1, stats_coverage: 1 })
    expect(await planOf(HA)).toBeNull()
    await become(D)
    await rows('select public.set_auto_upload_months($1, $2)', [HA, 12])
    expect(await planOf(HA)).toBe(12)
    expect(await countsOf(HA)).toEqual(kept)
    await become(D)
    await rows('select public.set_auto_upload_months($1, $2)', [HA, 1])
    expect(await planOf(HA)).toBe(1)
    expect(await countsOf(HA)).toEqual(kept)
    // 다른 병원 계획 줄은 생기지 않는다
    for (const h of [HB, HD, HC]) expect(await planOf(h), h).toBeNull()
  })

  it.each(FILL_MONTHS)('AC-8019.2: 아홉 값 %i달은 받는다', async (months) => {
    await become(D)
    await rows('select public.set_auto_upload_months($1, $2)', [HB, months])
    expect(await planOf(HB)).toBe(months)
  })

  it('AC-8019.2: 아홉 밖 값·null, 대기 HC·거절 HR·없는 병원·null 병원이면 22023이고 계획 줄은 그대로다', async () => {
    await become(D)
    await rows('select public.set_auto_upload_months($1, $2)', [HA, 6])
    for (const months of [0, -1, 4, 5, 7, 11, 13, 240, null]) {
      await become(D)
      await expect(rows('select public.set_auto_upload_months($1, $2)', [HA, months]), String(months)).rejects.toMatchObject(BAD)
    }
    for (const h of [HC, HR, NOWHERE, null]) {
      await become(D)
      await expect(rows('select public.set_auto_upload_months($1, $2)', [h, 12]), String(h)).rejects.toMatchObject(BAD)
    }
    expect(await planOf(HA)).toBe(6)
    for (const h of [HC, HR]) expect(await planOf(h)).toBeNull()
  })

  it.each([
    ['원장 A(자기 병원이어도)', A],
    ['데스크 K', K],
    ['대기 원장 C', C],
    ['병원 없는 E', E],
  ])('AC-8019.2: 관리자가 아닌 %s는 42501이다(값이 틀려도 이것이 먼저)', async (_label, user) => {
    for (const [h, months] of [
      [HA, 12],
      [HA, 5],
      [NOWHERE, 12],
    ] as [string, number][]) {
      await become(user)
      await expect(rows('select public.set_auto_upload_months($1, $2)', [h, months])).rejects.toMatchObject(DENIED)
    }
    expect(await planOf(HA)).toBeNull()
  })
})

describe('AC-8019.3 관리자 상태 목록 admin_auto_upload_list', SLOW, () => {
  it('AC-8019.3: 승인된 병원마다 한 줄 — 계획 줄 없으면 2달, 상태 줄 없으면 상태 칸 null, 대기·거절 병원 없음', async () => {
    await become(D)
    expect(await listAll()).toEqual(
      [HA, HB, HD].sort().map((h) => ({ hospital_id: h, months: 2, through_day: null, filled_from: null, has_ok: false, error_code: null, has_error_at: false })),
    )
  })

  it('AC-8019.3: 계획·상태 줄이 있으면 그 값(through_day·filled_from·last_ok_at·error_code·error_at)이고 lease_*·bit_mark 칸은 답에 없다', async () => {
    const { yesterday, monthStart } = await koreaDays()
    await become(D)
    await rows('select public.set_auto_upload_months($1, $2)', [HA, 120])
    await become(A)
    expect(await claim(T1, M1)).toBe(true)
    await report(T1, yesterday, monthStart, null, false)
    await become(B)
    expect(await claim(T2, M2)).toBe(true)
    await report(T2, null, null, 'E-HELPER-OLD', true)
    // 대기 병원 상태 줄(운영자)은 목록에 안 나온다
    await operator()
    await put('public.auto_upload_status', { hospital_id: HC, through_day: '2026-01-01' })
    await become(D)
    const all = await listAll()
    expect(all).toEqual([
      { hospital_id: HA, months: 120, through_day: yesterday, filled_from: monthStart, has_ok: true, error_code: null, has_error_at: false },
      { hospital_id: HB, months: 2, through_day: null, filled_from: null, has_ok: false, error_code: 'E-HELPER-OLD', has_error_at: true },
      { hospital_id: HD, months: 2, through_day: null, filled_from: null, has_ok: false, error_code: null, has_error_at: false },
    ])
    const [raw] = await rows('select * from public.admin_auto_upload_list() limit 1')
    expect(Object.keys(raw).sort()).toEqual(['error_at', 'error_code', 'filled_from', 'hospital_id', 'last_ok_at', 'months', 'through_day'])
  })

  it('AC-8019.3: 보는 중인 관리자도 목록을 읽는다(관리자 화면은 거르지 않음)', async () => {
    const key = await startViewOfHa()
    await become(D, viewHeader(key))
    expect((await listAll()).map((r) => r.hospital_id)).toEqual([HA, HB, HD].sort())
  })

  it.each([
    ['원장 A', A],
    ['원장 B', B],
    ['데스크 K', K],
    ['대기 원장 C', C],
    ['병원 없는 E', E],
  ])('AC-8019.3: 관리자가 아닌 %s는 42501이다', async (_label, user) => {
    await become(user)
    await expect(rows('select * from public.admin_auto_upload_list()')).rejects.toMatchObject(DENIED)
  })
})

describe('AC-8019.4 내 계획 읽기 · 잡기 my_auto_upload_plan · claim_auto_upload', SLOW, () => {
  it('AC-8019.4: 승인된 원장 A는 내 병원 한 줄(months — 줄 없으면 2, through_day — 줄 없으면 null)만 받는다', async () => {
    await become(A)
    expect(await myPlan()).toEqual([{ months: 2, through_day: null }])
    await become(D)
    await rows('select public.set_auto_upload_months($1, $2)', [HA, 36])
    await rows('select public.set_auto_upload_months($1, $2)', [HB, 120])
    const { yesterday } = await koreaDays()
    await become(A)
    expect(await claim(T1, M1)).toBe(true)
    await report(T1, yesterday, null, 'E-STATS-SAVE-FAILED', true)
    await become(A)
    expect(await myPlan()).toEqual([{ months: 36, through_day: yesterday }])
    // 두 칸뿐이다(오류·시각·잡음·표시는 주지 않는다)
    const [raw] = await rows('select * from public.my_auto_upload_plan()')
    expect(Object.keys(raw).sort()).toEqual(['months', 'through_day'])
    // 관리자 D도 자기 병원 원장이면 자기 병원 줄
    await become(D)
    expect(await myPlan()).toEqual([{ months: 2, through_day: null }])
  })

  it('AC-8019.4: 처음 잡으면 true이고 비트 표시 M1이 HA에 묶이며 잡음은 탭1·7분이다', async () => {
    await become(A)
    expect(await claim(T1, M1)).toBe(true)
    const row = await statusOf(HA)
    expect(row).toMatchObject({ bit_mark: M1, lease_by: T1, error_code: null, through_day: null })
    expect(Number(row?.lease_minutes)).toBeGreaterThan(6.9)
    expect(Number(row?.lease_minutes)).toBeLessThanOrEqual(7)
    // 다른 병원 줄은 생기지 않는다
    expect(await statusOf(HB)).toBeNull()
  })

  it('AC-8019.4: 다른 표시 M2로 부르면 false이고 HA 줄에 E-AUTO-OTHER-BIT·오류 시각만 적힌다(표시·잡음은 그대로)', async () => {
    await become(A)
    expect(await claim(T1, M1)).toBe(true)
    const held = await statusOf(HA)
    await become(A)
    expect(await claim(T2, M2)).toBe(false)
    // 잡음 끝 시각(lease_until)은 한 글자도 그대로다 — 남은 분만 시계를 따라 줄어든다
    expect(await statusOf(HA)).toEqual({ ...held, error_code: 'E-AUTO-OTHER-BIT', has_error_at: true, lease_minutes: expect.any(Number) })
    // 잡음이 풀린 뒤에도 다른 표시는 잡지 못한다
    await operator()
    await db.query(`update public.auto_upload_status set lease_until = now() - interval '1 second' where hospital_id = $1`, [HA])
    await become(A)
    expect(await claim(T2, M2)).toBe(false)
    expect(await claim(T1, M2)).toBe(false)
    expect(await statusOf(HA)).toMatchObject({ bit_mark: M1, lease_by: T1, error_code: 'E-AUTO-OTHER-BIT' })
  })

  it('AC-8019.4: 같은 때 탭2(같은 표시)는 false, 탭1이 다시 부르면 true(7분으로 늘림), 7분이 지나면(lease_until을 당겨 봄) 탭2가 true다', async () => {
    await become(A)
    expect(await claim(T1, M1)).toBe(true)
    expect(await claim(T2, M1)).toBe(false)
    expect(await statusOf(HA)).toMatchObject({ lease_by: T1, error_code: null })
    // 잡음이 1분 남았을 때 탭1이 다시 부르면 7분으로 늘어난다
    await operator()
    await db.query(`update public.auto_upload_status set lease_until = now() + interval '1 minute' where hospital_id = $1`, [HA])
    await become(A)
    expect(await claim(T1, M1)).toBe(true)
    expect(Number((await statusOf(HA))?.lease_minutes)).toBeGreaterThan(6.9)
    // 7분이 지남
    await operator()
    await db.query(`update public.auto_upload_status set lease_until = now() - interval '1 second' where hospital_id = $1`, [HA])
    await become(A)
    expect(await claim(T2, M1)).toBe(true)
    expect(await statusOf(HA)).toMatchObject({ lease_by: T2, bit_mark: M1 })
    await become(A)
    expect(await claim(T1, M1)).toBe(false)
  })

  it('AC-8019.4 · AC-8021.4: 묶인 표시가 없으면 표시 null(판이 낡은 도우미·번호 없는 의원)은 묶기·검사 없이 잡기만이고, 다음 표시가 묶인다', async () => {
    await become(A)
    expect(await claim(T1, null)).toBe(true)
    expect(await statusOf(HA)).toMatchObject({ bit_mark: null, lease_by: T1 })
    // 표시 없이 잡은 줄이 있어도(bit_mark null) 다시 null로 잡는다
    await become(A)
    expect(await claim(T1, null)).toBe(true)
    await become(A)
    expect(await claim(T1, M1)).toBe(true)
    expect(await statusOf(HA)).toMatchObject({ bit_mark: M1 })
  })

  it('AC-8021.4: 그 의원에 묶인 표시가 있으면 표시 null로는 잡지 못한다 — false이고 상태 줄은 한 글자도 그대로다(오류 번호도 안 적음)', async () => {
    await become(A)
    expect(await claim(T1, M1)).toBe(true)
    await operator()
    await db.query(`update public.auto_upload_status set lease_until = null, lease_by = null where hospital_id = $1`, [HA])
    const free = await rawStatus(HA)
    await become(A)
    expect(await claim(T3, null)).toBe(false)
    expect(await rawStatus(HA)).toBe(free)
    // 잡음이 끝난 줄·잡은 탭 자신이어도 null로는 잡지 못한다
    await operator()
    await db.query(`update public.auto_upload_status set lease_until = now() - interval '1 second', lease_by = $2 where hospital_id = $1`, [HA, T3])
    const ended = await rawStatus(HA)
    await become(A)
    expect(await claim(T3, null)).toBe(false)
    expect(await rawStatus(HA)).toBe(ended)
    // 같은 표시로는 그대로 잡는다
    await become(A)
    expect(await claim(T3, M1)).toBe(true)
    expect(await statusOf(HA)).toMatchObject({ bit_mark: M1, lease_by: T3, error_code: null })
    // 다른 병원(묶인 표시 없음)은 null로 잡는다
    await become(B)
    expect(await claim(T1, null)).toBe(true)
    expect(await statusOf(HB)).toMatchObject({ bit_mark: null, lease_by: T1 })
  })

  it('AC-8019.4: 표시 모양이 아니면(16진 64자 소문자) 22023이고 줄은 생기지 않는다', async () => {
    for (const mark of ['', 'xyz', 'A'.repeat(64), 'a'.repeat(63), 'a'.repeat(65), `${'a'.repeat(63)}g`]) {
      await become(A)
      await expect(claim(T1, mark), mark).rejects.toMatchObject(BAD)
    }
    expect(await statusOf(HA)).toBeNull()
  })

  it('AC-8019.4: 잡음이 풀린 뒤 다른 탭이 잡아도 B 병원 줄과 섞이지 않는다(병원마다 한 줄)', async () => {
    await become(A)
    expect(await claim(T1, M1)).toBe(true)
    await become(B)
    expect(await claim(T1, M2)).toBe(true)
    expect(await statusOf(HA)).toMatchObject({ bit_mark: M1, lease_by: T1 })
    expect(await statusOf(HB)).toMatchObject({ bit_mark: M2, lease_by: T1 })
  })

  it.each([
    ['데스크 K', K],
    ['대기 원장 C', C],
    ['거절 원장 R', R],
    ['병원 없는 E', E],
  ])('AC-8019.4: %s는 my_auto_upload_plan 줄이 없고 claim·report는 42501이다', async (_label, user) => {
    await become(user)
    expect(await myPlan()).toEqual([])
    await expect(claim(T1, M1)).rejects.toMatchObject(DENIED)
    await expect(report(T1, null, null, null, true)).rejects.toMatchObject(DENIED)
    for (const h of [HA, HB, HC, HR]) expect(await statusOf(h), h).toBeNull()
  })

  it('AC-8019.4: 보는 중(요청 머리 x-ssk-view)인 관리자는 my_auto_upload_plan 줄이 없고 claim·report는 42501이다(머리 없으면 자기 병원 그대로)', async () => {
    const key = await startViewOfHa()
    await become(D, viewHeader(key))
    expect(await myPlan()).toEqual([])
    await expect(claim(T1, M1)).rejects.toMatchObject(DENIED)
    await expect(claim(T1, null)).rejects.toMatchObject(DENIED)
    await expect(report(T1, null, null, null, true)).rejects.toMatchObject(DENIED)
    expect(await statusOf(HA)).toBeNull()
    expect(await statusOf(HD)).toBeNull()
    // 모양이 틀린 머리는 보는 중이 아니다(TASK-1 admin_view_hospital_id 그대로)
    await become(D, viewHeader('not-a-key'))
    expect(await myPlan()).toEqual([{ months: 2, through_day: null }])
    await become(D)
    expect(await myPlan()).toEqual([{ months: 2, through_day: null }])
  })

  it('AC-8019.4: 탭 id가 없으면 42501이다(표시가 틀려도 이것이 먼저)', async () => {
    await become(A)
    await expect(claim(null, M1)).rejects.toMatchObject(DENIED)
    await expect(claim(null, 'xyz')).rejects.toMatchObject(DENIED)
    await expect(report(null, null, null, null, true)).rejects.toMatchObject(DENIED)
    expect(await statusOf(HA)).toBeNull()
  })
})

describe('AC-8019.5 올림 보고 report_auto_upload', SLOW, () => {
  it('AC-8019.5: 잡은 탭1이 (어제, 그달 1일, 오류 없음, 끝)을 보내면 through_day·filled_from·last_ok_at이 쓰이고 오류 칸이 비며 잡음이 풀린다', async () => {
    const { yesterday, monthStart } = await koreaDays()
    await become(A)
    expect(await claim(T1, M1)).toBe(true)
    expect(await claim(T2, M2)).toBe(false) // E-AUTO-OTHER-BIT가 적힘
    expect(await statusOf(HA)).toMatchObject({ error_code: 'E-AUTO-OTHER-BIT' })
    await become(A)
    await report(T1, yesterday, monthStart, null, true)
    const row = await statusOf(HA)
    expect(row).toMatchObject({ through_day: yesterday, filled_from: monthStart, error_code: null, has_error_at: false, lease_by: null, lease_minutes: null, bit_mark: M1 })
    expect(row?.last_ok_at).not.toBeNull()
    // 잡음이 풀렸으니 다른 탭이 잡는다
    await become(A)
    expect(await claim(T2, M1)).toBe(true)
  })

  it('AC-8019.5: 끝이 아니면(done = false) 잡음을 7분 뒤로 늘리고 잡은 탭은 그대로다', async () => {
    const { yesterday } = await koreaDays()
    await become(A)
    expect(await claim(T1, M1)).toBe(true)
    await operator()
    await db.query(`update public.auto_upload_status set lease_until = now() + interval '1 minute' where hospital_id = $1`, [HA])
    await become(A)
    await report(T1, yesterday, null, null, false)
    const row = await statusOf(HA)
    expect(row).toMatchObject({ lease_by: T1, through_day: yesterday, filled_from: null })
    expect(Number(row?.lease_minutes)).toBeGreaterThan(6.9)
  })

  it('AC-8019.5: 오류 번호를 주면 error_code·error_at과 그때까지 된 날이 쓰이고 last_ok_at은 그대로다. 다음에 다 되면 오류 칸이 빈다', async () => {
    const { yesterday, monthStart } = await koreaDays()
    await become(A)
    expect(await claim(T1, M1)).toBe(true)
    await report(T1, '2026-10-31', '2026-10-01', null, false)
    const okAt = (await statusOf(HA))?.last_ok_at
    expect(okAt).not.toBeNull()
    await become(A)
    await report(T1, '2026-11-05', '2026-10-01', 'E-STATS-SAVE-FAILED', true)
    expect(await statusOf(HA)).toMatchObject({
      through_day: '2026-11-05',
      filled_from: '2026-10-01',
      error_code: 'E-STATS-SAVE-FAILED',
      has_error_at: true,
      last_ok_at: okAt,
      lease_by: null,
    })
    await become(A)
    expect(await claim(T2, M1)).toBe(true)
    await report(T2, yesterday, monthStart, null, true)
    expect(await statusOf(HA)).toMatchObject({ through_day: yesterday, filled_from: monthStart, error_code: null, has_error_at: false })
    expect((await statusOf(HA))?.last_ok_at).not.toBe(okAt)
  })

  it('AC-8019.5: 오류와 함께 날이 없으면(null) 그대로 null을 적는다(아직 올라온 날 없음 + 실패)', async () => {
    await become(A)
    expect(await claim(T1, null)).toBe(true)
    await report(T1, null, null, 'E-HELPER-OLD', true)
    expect(await statusOf(HA)).toMatchObject({ through_day: null, filled_from: null, error_code: 'E-HELPER-OLD', has_error_at: true, last_ok_at: null })
  })

  it('AC-8019.5: 잡지 않은 탭2가 부르면 아무것도 바뀌지 않는다(늦게 끝난 탭이 남의 상태를 덮지 않음)', async () => {
    const { yesterday, monthStart } = await koreaDays()
    await become(A)
    expect(await claim(T1, M1)).toBe(true)
    await report(T1, '2026-10-31', '2026-10-01', null, false)
    const held = await rawStatus(HA)
    await become(A)
    await report(T2, yesterday, monthStart, null, true)
    await report(T2, yesterday, monthStart, 'E-AUTO-UPLOAD', false)
    expect(await rawStatus(HA)).toBe(held)
    // 상태 줄이 없는 병원(B)에 보고해도 줄이 생기지 않는다
    await become(B)
    await report(T1, yesterday, null, null, true)
    expect(await statusOf(HB)).toBeNull()
  })

  it('AC-8019.5: p_through > 한국 어제 · filled_from이 1일 아님 · filled_from > p_through · 날 없이 filled_from · 오류 번호 모양이 아니면 22023이다', async () => {
    const { yesterday, today, monthStart } = await koreaDays()
    await become(A)
    expect(await claim(T1, M1)).toBe(true)
    const held = await rawStatus(HA)
    for (const [through, filledFrom, error] of [
      [today, null, null],
      ['2999-01-01', null, null],
      [yesterday, '2026-10-02', null],
      ['2026-01-15', '2026-02-01', null],
      [null, monthStart, null],
      [yesterday, monthStart, 'oops'],
      [yesterday, monthStart, 'e-auto-upload'],
      [yesterday, monthStart, `E-${'A'.repeat(41)}`],
      [yesterday, monthStart, 'E-AUTO UPLOAD'],
      [yesterday, monthStart, ''],
    ] as [string | null, string | null, string | null][]) {
      await become(A)
      await expect(report(T1, through, filledFrom, error, true), `${through} ${filledFrom} ${error}`).rejects.toMatchObject(BAD)
    }
    expect(await rawStatus(HA)).toBe(held)
    // 경계: 어제·그달 1일·40자 번호는 된다
    await become(A)
    await report(T1, yesterday, monthStart, `E-${'A'.repeat(40)}`, false)
    expect(await statusOf(HA)).toMatchObject({ through_day: yesterday, error_code: `E-${'A'.repeat(40)}` })
  })

  it('AC-8019.5: 다른 병원 HB 줄은 HA 원장의 어떤 부르기로도 바뀌지 않는다', async () => {
    const { yesterday, monthStart } = await koreaDays()
    await become(B)
    expect(await claim(T1, M2)).toBe(true)
    await report(T1, '2026-10-31', '2026-10-01', null, false)
    const kept = await rawStatus(HB)
    await become(A)
    expect(await claim(T1, M1)).toBe(true)
    expect(await claim(T1, M2)).toBe(false)
    await report(T1, yesterday, monthStart, null, false)
    await report(T1, yesterday, monthStart, 'E-AUTO-UPLOAD', true)
    expect(await rawStatus(HB)).toBe(kept)
  })
})

describe('AC-8019.6 의원 비교 가장 이른 달 admin_compare_first_month', SLOW, () => {
  it('AC-8019.6: 승인된 병원의 stats_days·sales_days 가운데 가장 이른 날의 달 1일이다(대기·거절 병원 줄은 세지 않음)', async () => {
    await seedNumbers()
    await become(D)
    expect((await rows('select public.admin_compare_first_month()::text as m'))[0].m).toBe('2024-11-01')
    // 매출 줄을 지우면 통계 줄의 가장 이른 날(2025-03-15)의 달
    await operator()
    await db.query(`delete from public.sales_days where hospital_id = $1`, [HB])
    await become(D)
    expect((await rows('select public.admin_compare_first_month()::text as m'))[0].m).toBe('2025-03-01')
  })

  it('AC-8019.6: 승인된 병원 줄이 하나도 없으면 null이다(대기·거절 병원 줄만 있어도)', async () => {
    await become(D)
    expect((await rows('select public.admin_compare_first_month() as m'))[0].m).toBeNull()
    await operator()
    await put('public.stats_days', { hospital_id: HC, day: '2020-01-05', partial: false, source: 'bit', payload: { schemaVersion: 2, day: '2020-01-05', partial: false } })
    await put('public.sales_days', { hospital_id: HR, day: '2018-01-01', visits: 1, new_patients: 0, return_visits: 1, unconfirmed: true, split_unconfirmed: false })
    await become(D)
    expect((await rows('select public.admin_compare_first_month() as m'))[0].m).toBeNull()
  })

  it.each([
    ['원장 A', A],
    ['데스크 K', K],
    ['대기 원장 C', C],
    ['병원 없는 E', E],
  ])('AC-8019.6: 관리자가 아닌 %s는 42501이다', async (_label, user) => {
    await seedNumbers()
    await become(user)
    await expect(rows('select public.admin_compare_first_month()')).rejects.toMatchObject(DENIED)
  })
})

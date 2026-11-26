import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { REVENUE_DAY_KEYS } from '@/types/revenue'
import { SUNAP_TOTAL_KEYS } from '@/types/sunap'

// 다른 의원 보기·의원 비교 DB: 보기 줄(admin_views)·지역 고친 값(hospital_regions)·보기 함수·병원별 표 정책 둘씩·바구니 읽기 정책·
// 다시 만든 읽기 함수 여섯·비교 읽기 함수 admin_rows (admin-view REQ-8001~8003, design.md 'DB'·'병원별 표'·'다시 만드는 읽기 함수'·
// '비교 읽기'·'시험 계획', ADR-046·047).
// location.rls.test.ts와 같은 방법: 진짜 Postgres(PGlite, WASM)에서 운영자가 SQL Editor에 붙일 migration 파일을 **지금 모든 migration**
// (운영 DB 차례 — location.rls.test.ts 사슬의 차례 예외를 따른다) → 이 파일 → 이 파일 그대로 돌린다. 실제 Supabase에는 붙지 않는다.
// 같은 읽기·쓰기를 이 파일 전 DB(pre)와 뒤 DB(db)에서 돌려 견준다. Supabase가 미리 갖춘 것(역할·auth·storage)만 흉내 내고,
// 요청 머리(PostgREST의 request.headers)는 set_config로 흉내 낸다. 병원·사람·메일·환자·직원은 모두 지어낸 것이다
const fileOf = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))
const read = (rel: string) => readFileSync(fileOf(rel), 'utf-8')
const FILE_NAME = '20261124000000_admin_view.sql'
// 운영 DB에 들어간 차례: 파일 이름 차례이되, 업무일지 덧붙임 둘·통계 묶음 둘은 업무일지 칸 파일 바로 뒤(location.rls.test.ts 사슬과 같은 예외)
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
// 주석을 뺀 SQL 글자, 그리고 함수·DO 몸통($$ … $$)까지 뺀 글자(맨 위 문장만 본다)
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
  -- 앞 migration이 보는 칸(마지막 로그인·주 관리자 고르기의 로그인 방법)
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

// Supabase Storage가 갖춘 것(앞 migration이 바구니 줄과 정책을 더한다). foldername은 Supabase 정의와 같은 뜻
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
  -- 정책이 없는 다른 기능의 버킷(이 파일의 정책이 여기에는 아무것도 열지 않는지 보려고)
  insert into storage.buckets (id, name) values ('other-bucket', 'other-bucket');
`

// 관리자 여럿 migration은 붙이기 전에 주 관리자 후보(구글로 들어온 관리자) 하나를 본다 — 운영자 계정을 흉내 낸다(시험 데이터에서는 지워진다)
const OP = '00000000-0000-4000-8000-0000000000ff'
const MULTI_ADMIN_SEED = `
  insert into auth.users (id, email, raw_app_meta_data) values ('${OP}', 'op@fake.test', '{"providers": ["google"]}');
  insert into public.admins (user_id) values ('${OP}');
`

const A = '00000000-0000-4000-8000-0000000000a1' // 관리자, 승인된 병원 HA 주인
const D = '00000000-0000-4000-8000-0000000000d1' // 관리자, 승인된 병원 HD 주인
const B = '00000000-0000-4000-8000-0000000000b1' // 승인된 병원 HB 주인, 관리자 아님(보이는 의원)
const F = '00000000-0000-4000-8000-0000000000f1' // 승인된 병원 HF 주인, 관리자 아님(병원 정보 없음)
const C = '00000000-0000-4000-8000-0000000000c1' // 승인 대기 병원 HC 주인
const R = '00000000-0000-4000-8000-0000000000e1' // 거절된 병원 HR 주인
const K = '00000000-0000-4000-8000-0000000000d9' // HA의 데스크(병원 줄 없음)
const E = '00000000-0000-4000-8000-0000000000e9' // 병원 줄도 데스크 줄도 없음
const USERS = [A, D, B, F, C, R, K, E]
const hospitalOf = (user: string) => `10000000-0000-4000-8000-${user.slice(-12)}`
const HA = hospitalOf(A)
const HD = hospitalOf(D)
const HB = hospitalOf(B)
const HF = hospitalOf(F)
const HC = hospitalOf(C)
const HR = hospitalOf(R)
const STATUS: Record<string, 'approved' | 'pending' | 'rejected'> = { [A]: 'approved', [D]: 'approved', [B]: 'approved', [F]: 'approved', [C]: 'pending', [R]: 'rejected' }
// 가입 이름(가짜). HB·HD는 병원 정보 이름이 따로 있다
const SIGNUP_NAME: Record<string, string> = { [A]: '가나의원', [D]: '마바의원', [B]: '다라의원', [F]: '사아의원', [C]: '자차의원', [R]: '카타의원' }
const EMAIL: Record<string, string> = {
  [A]: 'a-admin@fake.test',
  [D]: 'd-admin@fake.test',
  [B]: 'b-clinic@fake.test',
  [F]: 'f-clinic@fake.test',
  [C]: 'c-clinic@fake.test',
  [R]: 'r-clinic@fake.test',
  [K]: 'desk-a@fake.test',
  [E]: 'e-user@fake.test',
}
const emailOf = (user: string) => EMAIL[user]
const ADMINS = [A, D]
// 병원 id → 시험 글자
const LABEL: Record<string, string> = { [HA]: 'A', [HD]: 'D', [HB]: 'B', [HF]: 'F', [HC]: 'C', [HR]: 'R' }
const NOWHERE = '00000000-0000-4000-8000-000000000999' // 없는 병원 id

type Row = Record<string, unknown>
const SLOW = { timeout: 120_000 }
const DENIED = { code: '42501' }
const BAD = { code: '22023' }

// ── 이 파일이 더하는 것(design.md 'DB'·'병원별 표') ─────────────────────────
const NEW_TABLES = ['admin_views', 'hospital_regions'] as const
const VIEW_POLICY = '관리자 보는 의원 읽기'
const GUARD_POLICY = '보는 중에는 그 의원만 · 쓰기 없음'
const FILE_POLICY = '관리자 보는 의원 파일 읽기'
// [이름(인자), 언어, 정의자인가, 변동성(s 안정·v 바뀜), 답 모양, authenticated가 부르는가]. 모두 search_path 빔이고 PUBLIC·anon은 못 부른다
const NEW_FUNCTIONS: [string, string, boolean, string, string, boolean][] = [
  ['admin_view_key()', 'plpgsql', false, 's', 'uuid', false],
  ['admin_view_hospital_id()', 'sql', true, 's', 'uuid', true],
  ['read_hospital_id()', 'sql', true, 's', 'uuid', true],
  ['admin_view_open(text)', 'sql', true, 's', 'boolean', true],
  ['start_admin_view(uuid)', 'plpgsql', true, 'v', 'uuid', true],
  ['stop_admin_view()', 'plpgsql', true, 'v', 'void', true],
  ['my_admin_view()', 'sql', true, 's', 'TABLE(hospital_id uuid, name text)', true],
  [
    'admin_view_log()',
    'plpgsql',
    true,
    's',
    'TABLE(started_at timestamp with time zone, viewer_name text, viewer_email text, hospital_id uuid, hospital_name text)',
    true,
  ],
  ['admin_view_hospitals()', 'plpgsql', true, 's', 'TABLE(hospital_id uuid, name text, address text, region_set boolean, region text, is_me boolean)', true],
  ['set_hospital_region(uuid,text)', 'plpgsql', true, 'v', 'void', true],
  ['admin_rows(text,uuid[],date,date)', 'plpgsql', true, 's', 'TABLE(hospital_id uuid, "row" jsonb)', true],
]
const NEW_FUNCTION_NAMES = NEW_FUNCTIONS.map(([fn]) => fn.replace(/\(.*$/, ''))
// 다시 만드는 읽기 함수 여섯(인자·답 모양·호출자·권한 그대로, 읽을 병원만 read_hospital_id())
const REMADE = [
  'sales_code_totals(date,date)',
  'notice_list(boolean,text[],boolean,uuid[],boolean,integer,integer)',
  'notice_unread_count()',
  'notice_rule_alerts()',
  'rule_change_alerts()',
  'desk_members()',
]
const REMADE_NAMES = REMADE.map((fn) => fn.replace(/\(.*$/, ''))

// '병원별 표' 표 그대로: 보기 ○(정책 둘) · 보기 ×(restrictive 하나) · 함수로만(사용자 표 권한·정책 없음)
const VIEW_TABLES = [
  'stats_months',
  'stats_days',
  'stats_coverage',
  'stats_rx_picks',
  'stats_rx_groups',
  'stats_goals',
  'sales_days',
  'sales_codes',
  'sales_day_codes',
  'rx_groups',
  'worklog_days',
  'worklog_settings',
  'sunap_days',
  'sunap_spends',
  'sunap_settings',
  'staff_members',
  'staff_week_plans',
  'staff_day_changes',
  'staff_overtime',
  'staff_leaves',
  'staff_settings',
  'staff_incentive_rules',
  'staff_pay_lines',
  'staff_pay_months',
  'staff_files',
  'notice_marks',
  'notice_keywords',
  'notice_keyword_hits',
  'rule_change_marks',
  'location_settings',
  'location_candidates',
  'location_listings',
  'location_notes',
  'location_photos',
  'location_events',
  'location_flow_cache',
  'inventory_categories',
  'inventory_items',
  'inventory_counts',
  'inventory_count_lines',
  'inventory_receipts',
  'inventory_receipt_lines',
  'inventory_aliases',
  'contacts_companies',
  'contacts_people',
  'contacts_equipment',
  'contacts_repairs',
  'form_notices',
  'form_guides',
  'form_backgrounds',
  'ai_reports',
  'ai_usage',
  'clinic_profiles',
  'claim_rule_settings',
  'claim_hospital_settings',
  'calendar_settings',
  'calendar_allday',
]
const HIDDEN_TABLES = ['calendar_appts', 'calendar_rev', 'message_templates', 'contact_counts', 'claim_day_counts', 'claim_month_counts', 'claim_day_closes']
const FUNCTION_ONLY_TABLES = ['hospital_members', 'ai_image_days', 'notice_ask_days', 'notice_ask_holds', 'admin_views', 'hospital_regions']
// google-link AC-8502.2: 20261126000000_google_link.sql이 더하는 병원별 표 여덟(AC-8002.8 목록에만 — 그 파일이 정책 둘·하나를 더한다)
const GLINK_PATH = fileOf('./migrations/20261126000000_google_link.sql')
const GLINK_MIGRATION = existsSync(GLINK_PATH) ? readFileSync(GLINK_PATH, 'utf-8') : ''
const GLINK_VIEW_TABLES = ['gsheet_settings', 'gsheet_months', 'gsheet_runs']
const GLINK_HIDDEN_TABLES = ['gcal_links', 'gcal_state', 'gcal_fixes', 'gcal_deletes', 'gcal_off_days']
const SIDO = ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종', '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주']
const FILE_BUCKETS = ['clinic-logos', 'staff-files', 'inventory-photos', 'location-photos', 'form-backgrounds']
const ALL_BUCKETS = [...FILE_BUCKETS, 'install-files', 'other-bucket']

// 정책 글자(빈칸을 하나로 줄여 견줌)
const VIEW_QUAL = /^\(hospital_id = \( SELECT (public\.)?admin_view_hospital_id\(\) AS admin_view_hospital_id\)\)$/
const GUARD_QUAL =
  /^\(\(\( SELECT (public\.)?admin_view_hospital_id\(\) AS admin_view_hospital_id\) IS NULL\) OR \(hospital_id = \( SELECT (public\.)?admin_view_hospital_id\(\) AS admin_view_hospital_id\)\)\)$/
const GUARD_CHECK = /^\(\( SELECT (public\.)?admin_view_hospital_id\(\) AS admin_view_hospital_id\) IS NULL\)$/
const squash = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ')

// ── 심는 값(모두 지어낸 것) ─────────────────────────────────────────────
const rid = (n: number, owner: string) => `${n.toString(16).padStart(8, '0')}-0000-4000-8000-${owner.slice(-12)}`
const N1 = '20000000-0000-4000-8000-000000000001' // 고시 글 하나
const CH1 = '21000000-0000-4000-8000-000000000001' // 그 글의 live 바꿈 판
const HU1 = '21000000-0000-4000-8000-000000000002' // 그 글의 live 사람이 봐야 함 줄
const HASH = 'a'.repeat(64)
const SEVEN = [{}, {}, {}, {}, {}, {}, {}]
const DAY = '2026-11-02'
const MONTH = '2026-11'
const FROM = '2026-11-01'
const TO = '2026-11-30'
const AT = '2026-11-20T01:00:00.000Z' // 심는 시각(두 DB가 같게)
// 한국 날짜 어제(고시 글이 '최근 14일'에 들게)
const yesterday = () => new Date(Date.now() + 9 * 3600_000 - 86_400_000).toISOString().slice(0, 10)
// 병원마다 심는 날·달: HA는 기간 안 둘(뒤 날을 먼저 넣음)과 기간 밖 하나, 나머지는 기간 안 하나
const daysOf = (owner: string) => (owner === A ? ['2026-11-04', DAY, '2026-10-31'] : [DAY])
const monthsOf = (owner: string) => (owner === A ? [MONTH, '2026-10'] : [MONTH])
const SEEDED = [A, B, C, D] // 표 줄을 심는 병원(HF·HR은 병원 줄만)
const PROFILE: Record<string, Row> = {
  [A]: { display_name: null, address: '서울 가짜구 가짜로 1' },
  [B]: { display_name: '나다정형외과', address: '서울특별시 서초구 서초동 123-4' },
  [C]: { display_name: null, address: null },
  [D]: { display_name: '마바정형외과', address: null },
}

let db: PGlite // 지금 사슬 → 이 파일 → 이 파일
let pre: PGlite // 지금 사슬만(이 파일 전)
type Shape = Awaited<ReturnType<typeof shapeOf>>
let before: Shape
let first: Shape
let second: Shape

async function migrate(target: PGlite) {
  await target.exec(SUPABASE_MOCK)
  await target.exec(STORAGE_MOCK)
  for (const name of CHAIN_NAMES) {
    if (name === '20261122000000_multi_admin.sql') await target.exec(MULTI_ADMIN_SEED)
    await target.exec(read(`./migrations/${name}`))
  }
}

async function operator(t: PGlite = db) {
  await t.exec('reset role; reset request.jwt.claims; reset request.headers')
}

const viewHeader = (key: string) => JSON.stringify({ 'x-ssk-view': key })

/** 그 사용자로 로그인한 것처럼(JWT의 sub·email). headers = PostgREST가 넘기는 요청 머리 JSON 글자 */
async function become(user: string, headers: string | null = null, t: PGlite = db) {
  await operator(t)
  await t.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: user, email: emailOf(user) })])
  if (headers !== null) await t.query(`select set_config('request.headers', $1, false)`, [headers])
  await t.exec('set role authenticated')
}

async function becomeAnon(headers: string | null = null, t: PGlite = db) {
  await operator(t)
  if (headers !== null) await t.query(`select set_config('request.headers', $1, false)`, [headers])
  await t.exec('set role anon')
}

async function rows(sql: string, params: unknown[] = [], t: PGlite = db) {
  return (await t.query<Row>(sql, params)).rows
}

/** 문장 하나의 결과: 'ok <바뀐 줄 수>' 또는 'error <오류 번호>' */
async function outcome(run: () => Promise<{ affectedRows?: number }>) {
  try {
    const result = await run()
    return `ok ${result.affectedRows ?? 0}`
  } catch (error) {
    return `error ${(error as { code?: string }).code ?? '?'}`
  }
}

const uuids = (ids: readonly string[]) => `{${ids.join(',')}}`

/** 운영자가 그 표에 줄 하나(json → 표 모양) */
async function put(t: PGlite, table: string, row: Row) {
  const columns = Object.keys(row).join(', ')
  await t.query(`insert into ${table} (${columns}) select ${columns} from json_populate_record(null::${table}, $1::json)`, [JSON.stringify(row)])
}

/** 사용자·병원·관리자·데스크 줄과 표마다 줄(운영자). 병원 줄을 따라 표 줄·보기 줄·지역 줄이 함께 비워진다 */
async function resetData(t: PGlite = db) {
  await operator(t)
  await t.exec('truncate auth.users cascade')
  await t.exec('truncate public.notices cascade')
  await t.exec('truncate storage.objects')
  for (const user of USERS) {
    await t.query('insert into auth.users (id, email) values ($1, $2)', [user, emailOf(user)])
    const status = STATUS[user]
    if (status === undefined) continue
    await t.query(`insert into public.hospitals (id, owner_id, name, applicant_name, email, status) values ($1, $2, $3, '홍길동', $4, $5)`, [
      hospitalOf(user),
      user,
      SIGNUP_NAME[user],
      emailOf(user),
      status,
    ])
  }
  for (const user of ADMINS) await t.query('insert into public.admins (user_id) values ($1)', [user])
  await t.query(`insert into public.hospital_members (hospital_id, email) values ($1, 'desk-a@fake.test'), ($2, 'desk-b@fake.test')`, [HA, HB])
  await seedRows(t)
}

async function seedRows(t: PGlite) {
  await put(t, 'public.notices', { id: N1, group_key: 'gosi:2026-901', title: '[행위] 고시 제2026-901호 개정', kind: 'gosi', posted_on: yesterday(), notice_no: '2026-901', related: true, state: 'done' })
  await put(t, 'public.rule_changes', {
    id: CH1,
    notice_id: N1,
    rule_id: 'ES-04',
    base_version: '2026-10-19',
    verdict: 'change',
    by_ai: true,
    why: '횟수 기준이 바뀌었어요',
    before_text: '1년 5회',
    after_text: '1년 6회',
    effective_from: '2026-12-01',
    rule: { id: 'ES-04', effective_from: '2026-12-01' },
    state: 'live',
  })
  await put(t, 'public.rule_changes', {
    id: HU1,
    notice_id: N1,
    rule_id: 'IN-02',
    base_version: '2026-10-19',
    verdict: 'human',
    by_ai: true,
    check_code: 'names',
    why: '직접 확인해야 해요',
    before_text: '',
    after_text: '',
    state: 'live',
  })
  for (const [i, owner] of SEEDED.entries()) {
    const h = hospitalOf(owner)
    const n = i + 1
    for (const day of daysOf(owner)) {
      await put(t, 'public.stats_days', {
        hospital_id: h,
        day,
        partial: false,
        source: 'bit',
        payload: { schemaVersion: 2, day, partial: false, totals: { visits: 10 * n }, secret: 'day-payload-only' },
      })
      await put(t, 'public.sales_days', { hospital_id: h, day, visits: 10 * n, new_patients: n, return_visits: 9 * n, unconfirmed: true, split_unconfirmed: false, rough_total: 500000 * n })
      await put(t, 'public.sunap_days', { hospital_id: h, work_date: day, closed_at: AT, visits: 9 * n })
      await put(t, 'public.calendar_allday', { id: rid(day === DAY ? 12 : day === '2026-10-31' ? 112 : 212, owner), hospital_id: h, day: day === DAY ? '2026-11-03' : day, type: 'memo', memo: '휴진' })
      await put(t, 'public.calendar_appts', {
        id: rid(day === DAY ? 13 : day === '2026-10-31' ? 113 : 213, owner),
        hospital_id: h,
        day: day === DAY ? '2026-11-03' : day,
        start_min: 600,
        len_min: 30,
        name: '가짜환자',
        chart: '12345',
        staff_id: 's1',
        staff_name: '김치료',
        staff_mark: '김',
        kind_id: 'dosu',
        kind_name: '도수',
        memo: '가짜메모',
        status: 'auto',
      })
      await put(t, 'public.stats_coverage', { hospital_id: h, from_day: day, to_day: day === '2026-10-31' ? day : '2026-11-15', source: 'bit' })
    }
    for (const month of monthsOf(owner)) {
      const payload: Row = { schemaVersion: 2, month, partial: false, rx: { MM301: { patients: 3 * n } }, groups: { g1: n }, totals: { secret: 'month-payload-only' } }
      if (owner !== B) payload.dropoff = { asOf: '2026-11-20', lines: [] } // HB 달 줄은 몇 번까지 받나 합계 전(옛 줄)
      await put(t, 'public.stats_months', { hospital_id: h, month, partial: false, source: 'bit', payload, sections: { v: 1, month, partial: false, mix: { age: [n] } } })
      await put(t, 'public.stats_goals', { hospital_id: h, month, visits: 100 * n, new_patients: 5 * n, revenue: 1000000 * n })
      await put(t, 'public.sales_codes', { hospital_id: h, month: `${month}-01`, code: 'MM301', name: '주사', count: 3 * n, amount: 3000 * n })
    }
    // 날 단위 처방: HA는 같은 코드 둘(하나는 금액 빠짐)과 기간 밖 하나, HB는 다른 코드
    const codes: Row[] =
      owner === A
        ? [
            { day: DAY, code: 'MM301', count: 2, amount: 2000 },
            { day: '2026-11-03', code: 'MM301', count: 1, amount: null },
            { day: '2026-10-31', code: 'MM301', count: 9, amount: 9000 },
          ]
        : owner === B
          ? [{ day: DAY, code: 'MM302', count: 5, amount: 5000 }]
          : [{ day: DAY, code: 'MM309', count: 1, amount: 100 }]
    for (const code of codes) await put(t, 'public.sales_day_codes', { hospital_id: h, ...code })
    await put(t, 'public.stats_rx_groups', { id: rid(4, owner), hospital_id: h, name: '주사', codes: ['MM301'], sort_order: 1 })
    await put(t, 'public.stats_rx_groups', { id: rid(5, owner), hospital_id: h, name: '도수', codes: ['MM302'], sort_order: 0 })
    await put(t, 'public.sunap_settings', { hospital_id: h })
    await put(t, 'public.calendar_settings', { hospital_id: h })
    await put(t, 'public.calendar_rev', { hospital_id: h, rev: n, changed_at: AT })
    await put(t, 'public.clinic_profiles', { hospital_id: h, hours: SEVEN, ...PROFILE[owner] })
    await put(t, 'public.staff_members', {
      id: rid(15, owner),
      hospital_id: h,
      name: '김가짜',
      job: '물리치료사',
      employment: 'regular',
      hired_on: '2025-01-01',
      phone: '01012345678',
      birthday: '1990-01-01',
      address: '가짜로 1',
      bank: '가짜은행',
      account_no: '111-222-333',
      memo: '가짜 직원 메모',
      registered_on: '2025-01-01',
    })
    for (const month of monthsOf(owner)) {
      await put(t, 'public.staff_pay_lines', {
        id: rid(month === MONTH ? 16 : 116, owner),
        hospital_id: h,
        month,
        staff_id: rid(15, owner),
        amounts: { base: 2500000 * n },
        incentives: [],
        adjust: 0,
        adjust_reason: 'other',
        adjust_memo: '가짜사유',
      })
    }
    await put(t, 'public.staff_settings', { hospital_id: h })
    await put(t, 'public.worklog_days', { hospital_id: h, work_date: DAY, memo: '가짜 업무 메모' })
    await put(t, 'public.location_settings', { hospital_id: h })
    await put(t, 'public.contacts_companies', { id: rid(21, owner), hospital_id: h, category: 'other', name: '예시업체', site_pw: 'pw-1234' })
    await put(t, 'public.contacts_people', { id: rid(22, owner), hospital_id: h, company_id: rid(21, owner), name: '박담당', mobile: '01099998888' })
    await put(t, 'public.ai_reports', { hospital_id: h, month: '2026-10', report: {}, input_hash: HASH, model: 'claude-test' })
    await put(t, 'public.message_templates', { id: rid(26, owner), hospital_id: h, kind: 'followup', name: '경과', body: '안내 글' })
    await put(t, 'public.contact_counts', { hospital_id: h, followup_left: n, injection_left: n })
    await put(t, 'public.claim_day_counts', { hospital_id: h, visit_date: DAY, visits: n, need_memo: 1, entered: 0, needs_check: 0, skipped: 0 })
    await put(t, 'public.claim_month_counts', { hospital_id: h, claim_month: '2026-11-01', incomplete: 0, missing: 0, flagged: 0 })
    await put(t, 'public.claim_day_closes', { hospital_id: h, visit_date: DAY, closed_at: AT })
  }
  // 고시 표시: HA는 읽음·별표·규칙 확인·바꿈 판 봄, HB는 안 읽음 메모만, HC·HD는 줄 없음
  await put(t, 'public.notice_marks', { hospital_id: HA, notice_id: N1, read_at: AT, starred: true, rules_checked_at: AT })
  await put(t, 'public.notice_marks', { hospital_id: HB, notice_id: N1, starred: false, memo: 'B 메모' })
  await put(t, 'public.rule_change_marks', { hospital_id: HA, change_id: CH1, seen_at: AT })
}

/** 운영자가 보기 줄 하나를 넣는다(두 DB에서 같은 열쇠를 쓰려고). startedAgo = 몇 시간 전 시작 */
async function seedView(user: string, owner: string, id: string, startedAgo = '1 minute', t: PGlite = db) {
  await operator(t)
  await t.query(`insert into public.admin_views (id, user_id, hospital_id, started_at) values ($1, $2, $3, now() - $4::interval)`, [id, user, hospitalOf(owner), startedAgo])
}

/** 관리자가 보기를 시작하고 열쇠를 돌려준다 */
async function startView(user: string, owner: string, headers: string | null = null) {
  await become(user, headers)
  const [row] = await rows(`select public.start_admin_view($1) as key`, [hospitalOf(owner)])
  return String(row.key)
}

async function viewsNow() {
  await operator()
  return rows(`select id, user_id, hospital_id, ended_at from public.admin_views order by started_at, id`)
}

/** 지금 역할로 그 표의 줄이 어느 병원 것인지(병원 글자, 줄마다) */
async function labelsOf(table: string, t: PGlite = db) {
  return (await rows(`select hospital_id from public.${table}`, [], t)).map((r) => LABEL[String(r.hospital_id)] ?? '?').sort()
}

/** 운영자 눈으로 본 표 줄(바뀌지 않았는지). strip = 두 DB 견줄 때 DB가 정하는 id·시각을 뺀다 */
async function dump(tables: readonly string[], strip = false, t: PGlite = db) {
  await operator(t)
  const out: Record<string, string[]> = {}
  const minus = strip ? ` - 'id' - 'created_at' - 'updated_at' - 'changed_at' - 'closed_at' - 'fetched_at' - 'seen_at' - 'read_at' - 'registered_on'` : ''
  for (const table of tables) out[table] = (await rows(`select (to_jsonb(x)${minus})::text as line from public.${table} x order by 1`, [], t)).map((r) => String(r.line))
  return out
}

async function visibleFiles(t: PGlite = db) {
  return (await rows(`select bucket_id || ':' || name as f from storage.objects order by 1`, [], t)).map((r) => String(r.f))
}

async function seedFiles(t: PGlite = db) {
  await operator(t)
  for (const h of [HA, HB]) for (const bucket of ALL_BUCKETS) await t.query('insert into storage.objects (bucket_id, name) values ($1, $2)', [bucket, `${h}/${bucket}.bin`])
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
              (select array_agg(item::text order by item::text) from unnest(p.proacl) item) as acl
       from pg_proc p join pg_language l on l.oid = p.prolang where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' order by 1`,
    ),
    buckets: await q(`select id, name, public, file_size_limit, allowed_mime_types from storage.buckets order by 1`),
  }
}

const bare = (name: unknown) => String(name).replace(/^public\./, '')
const isNewTable = (name: unknown) => (NEW_TABLES as readonly string[]).includes(bare(name))
const fnName = (fn: unknown) => bare(fn).replace(/\(.*$/, '')
const isNewPolicy = (p: Row) =>
  (p.schemaname === 'public' && (p.policyname === VIEW_POLICY || p.policyname === GUARD_POLICY)) || (p.schemaname === 'storage' && p.policyname === FILE_POLICY)

/** 이 파일이 더한 것(새 표 둘·새 정책·새 함수)과 다시 만든 함수 여섯의 몸통을 뺀 모양 */
function withoutNew(shape: Shape): Shape {
  return {
    columns: shape.columns.filter((c) => !isNewTable(c.table_name)),
    constraints: shape.constraints.filter((c) => !isNewTable(c.tbl)),
    access: shape.access.filter((t) => !isNewTable(t.relname)),
    indexes: shape.indexes.filter((i) => !isNewTable(i.tablename)),
    policies: shape.policies.filter((p) => !isNewPolicy(p)),
    triggers: shape.triggers.filter((t) => !isNewTable(t.tbl)),
    functions: shape.functions
      .filter((f) => !NEW_FUNCTION_NAMES.includes(fnName(f.fn)))
      .map((f) => (REMADE_NAMES.includes(fnName(f.fn)) ? { ...f, def: '(다시 만듦)' } : f)),
    buckets: shape.buckets,
  }
}

const aclHas = (acl: unknown, role: string) => ((acl as string[] | null) ?? []).some((item) => item.startsWith(`${role}=`) && /=[^/]*X/.test(item))
const fnOf = (shape: Shape, fn: string) => shape.functions.find((f) => bare(f.fn) === fn)

beforeAll(async () => {
  pre = await PGlite.create()
  await migrate(pre)
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
  await pre.close()
})

// 시험마다 빈 표에서 시작한다. 운영자(superuser)는 RLS를 건너뛴다
beforeEach(async () => {
  await resetData(db)
}, 60_000)

describe('AC-8001.1 파일 · 사슬', SLOW, () => {
  it('AC-8001.1: 시험 사슬은 이 파일보다 앞인 migration 모두다(빠짐·겹침 없음)', () => {
    const files = readdirSync(fileOf('./migrations/'))
      .filter((name) => name.endsWith('.sql') && name < FILE_NAME)
      .sort()
    expect([...CHAIN_NAMES].sort()).toEqual(files)
    expect(new Set(CHAIN_NAMES).size).toBe(CHAIN_NAMES.length)
  })

  it('AC-8001.1: 파일이 있고 줄 끝이 LF이며, 머리 주석에 무엇·실행·먼저·두 번·관문·명세 번호가 있다', () => {
    expect(MIGRATION).not.toBe('')
    expect(MIGRATION).not.toContain('\r')
    const lines = MIGRATION.split('\n')
    const head = lines.slice(0, lines.findIndex((line) => !/^(--|\s*$)/.test(line))).join('\n')
    for (const word of [
      'admin_views',
      'hospital_regions',
      'admin_rows',
      'REQ-8001~8003',
      'ADR-046·047',
      '운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다',
      '지금 모든 migration',
      '두 번 붙여 넣어도 그대로다',
      '이 파일을 먼저 붙여 넣고 그다음 사이트에 올린다',
    ]) {
      expect(head, word).toContain(word)
    }
  })

  it('AC-8001.1: 두 번 돌려도 되는 문장만 쓰고 지금 표는 건드리지 않는다(표·색인은 if not exists, 함수는 or replace, 지우기는 정책뿐)', () => {
    const count = (pattern: RegExp) => (TOP.match(pattern) ?? []).length
    for (const table of NEW_TABLES) expect(count(new RegExp(`create\\s+table\\s+if\\s+not\\s+exists\\s+public\\.${table}\\b`, 'gi')), table).toBe(1)
    expect(TOP).not.toMatch(/create\s+table\s+(?!if\s+not\s+exists)/i)
    expect(TOP).not.toMatch(/create\s+(unique\s+)?index\s+(?!if\s+not\s+exists)/i)
    expect(TOP).not.toMatch(/create\s+function/i)
    expect(TOP).not.toMatch(/create\s+(constraint\s+)?trigger/i)
    expect(count(/create\s+or\s+replace\s+function/gi)).toBe(NEW_FUNCTIONS.length + REMADE.length)
    expect(TOP).not.toMatch(/^\s*(drop\s+(?!policy\s+if\s+exists)|truncate|delete|update|insert)\b/im)
    for (const [, target] of TOP.matchAll(/^\s*alter\s+table\s+(\S+)/gim)) expect(NEW_TABLES.map((t) => `public.${t}`)).toContain(target)
    for (const [, target] of TOP.matchAll(/^\s*revoke\s+[^;]*?\s+on\s+table\s+(\S+)/gim)) expect(NEW_TABLES.map((t) => `public.${t}`)).toContain(target)
    expect(TOP).not.toMatch(/^\s*grant\s+[^;]*\s+on\s+table\b/im)
    expect(TOP).not.toMatch(/alter\s+default\s+privileges/i)
    // my_hospital_id()는 다시 만들지 않는다(C1 글자는 앞 migration 것)
    expect(SQL).not.toMatch(/function\s+public\.my_hospital_id\b/i)
  })

  it('AC-8001.1: 두 번째 실행 뒤 표·정책·권한·함수 모양이 첫 실행 뒤와 같다', () => {
    expect(second).toEqual(first)
  })

  it('AC-8001.1: 지금 표·칸·제약·색인·트리거·정책·표 권한·바구니와 다른 함수는 하나도 바뀌지 않는다(더하기만)', () => {
    expect(withoutNew(first)).toEqual(withoutNew(before))
  })

  it('AC-8001.1: admin_views 칸·열쇠가 design.md ① 모양이고, RLS 켜짐·anon·authenticated 표 권한 없음·정책 없음이다', async () => {
    expect(
      first.columns.filter((c) => c.table_name === 'admin_views').map((c) => [c.column_name, c.data_type, c.is_nullable, c.column_default]),
    ).toEqual([
      ['id', 'uuid', 'NO', 'gen_random_uuid()'],
      ['user_id', 'uuid', 'NO', null],
      ['hospital_id', 'uuid', 'NO', null],
      ['started_at', 'timestamp with time zone', 'NO', 'now()'],
      ['ended_at', 'timestamp with time zone', 'YES', null],
    ])
    // PG18은 not null도 pg_constraint에 따로 적는다 → 기본 키·바깥 키·검사만 본다
    const defs = first.constraints.filter((c) => bare(c.tbl) === 'admin_views' && !/^NOT NULL /.test(String(c.def))).map((c) => squash(c.def))
    expect(defs).toEqual(
      expect.arrayContaining([
        'PRIMARY KEY (id)',
        expect.stringMatching(/^FOREIGN KEY \(user_id\) REFERENCES auth\.users\(id\) ON DELETE CASCADE$/),
        expect.stringMatching(/^FOREIGN KEY \(hospital_id\) REFERENCES (public\.)?hospitals\(id\) ON DELETE CASCADE$/),
        'CHECK (((ended_at IS NULL) OR (ended_at >= started_at)))',
      ]),
    )
    expect(defs).toHaveLength(4)
    expect(first.indexes.filter((i) => i.tablename === 'admin_views').map((i) => i.indexname)).toEqual(expect.arrayContaining(['admin_views_started']))
    for (const table of NEW_TABLES) {
      const access = first.access.find((t) => t.relname === table)
      expect(access?.relrowsecurity, table).toBe(true)
      for (const role of ['anon', 'authenticated']) expect(((access?.acl as string[] | null) ?? []).some((item) => item.startsWith(`${role}=`)), `${table} ${role}`).toBe(false)
      expect(((access?.acl as string[] | null) ?? []).some((item) => item.startsWith('=')), `${table} PUBLIC`).toBe(false)
      expect(first.policies.filter((p) => p.tablename === table), table).toEqual([])
    }
  })

  it.each(NEW_FUNCTIONS)('AC-8001.1: 함수 %s 언어 %s · 정의자 %s · 변동성 %s · 답 %s · authenticated 실행 %s, search_path 빔, PUBLIC·anon 못 부름', (fn, lang, definer, volatile, result, callable) => {
    const found = fnOf(first, fn)
    expect(found, fn).toBeDefined()
    expect(found?.lang).toBe(lang)
    expect(found?.definer).toBe(definer)
    expect(found?.volatile).toBe(volatile)
    expect(found?.result).toBe(result)
    expect(found?.config).toEqual(['search_path=""'])
    expect(aclHas(found?.acl, 'authenticated')).toBe(callable)
    expect(aclHas(found?.acl, 'anon')).toBe(false)
    expect(((found?.acl as string[] | null) ?? []).some((item) => item.startsWith('='))).toBe(false)
  })

  it('AC-8001.1: 사용자가 부르는 함수를 anon은 실행하지 못한다(42501)', async () => {
    for (const [sql, params] of [
      ['select public.start_admin_view($1)', [HB]],
      ['select public.stop_admin_view()', []],
      ['select * from public.my_admin_view()', []],
      ['select * from public.admin_view_log()', []],
      ['select * from public.admin_view_hospitals()', []],
      ['select public.set_hospital_region($1, $2)', [HB, '경기']],
      ['select * from public.admin_rows($1, $2::uuid[], $3, $4)', ['stats_days', uuids([HB]), FROM, TO]],
      ['select public.admin_view_hospital_id()', []],
      ['select public.read_hospital_id()', []],
      ['select public.admin_view_key()', []],
    ] as [string, unknown[]][]) {
      await becomeAnon()
      await expect(rows(sql, params), sql).rejects.toMatchObject(DENIED)
    }
    // admin_view_key는 정의자 함수 안에서만 돈다(로그인한 사람도 못 부른다)
    await become(A)
    await expect(rows('select public.admin_view_key()')).rejects.toMatchObject(DENIED)
  })
})

describe('AC-8001.2 보기 시작', SLOW, () => {
  it('AC-8001.2: 관리자 A가 승인된 남의 병원 HB를 고르면 새 열쇠(uuid)를 주고 (A, HB, 지금, 끝 없음) 한 줄이 생긴다', async () => {
    const key = await startView(A, B)
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    await operator()
    expect(await rows(`select id, user_id, hospital_id, ended_at, started_at > now() - interval '1 minute' as fresh from public.admin_views`)).toEqual([
      { id: key, user_id: A, hospital_id: HB, ended_at: null, fresh: true },
    ])
    // 다시 고르면 다른 열쇠(이 브라우저에 머리가 없으면 앞 줄은 그대로 열려 있다 — 다른 브라우저의 보기)
    const again = await startView(A, F)
    expect(again).not.toBe(key)
    expect((await viewsNow()).map((v) => [v.hospital_id, v.ended_at])).toEqual([
      [HB, null],
      [HF, null],
    ])
  })

  it.each([
    ['관리자 아닌 원장 B', B],
    ['데스크 K', K],
    ['병원 줄 없는 사용자 E', E],
    ['대기 병원 주인 C', C],
  ])('AC-8001.2: %s는 42501이다(인자가 틀려도 이것이 먼저), admin_views는 그대로', async (_label, user) => {
    for (const target of [HA, HB, HC, NOWHERE, null]) {
      await become(user)
      await expect(rows(`select public.start_admin_view($1)`, [target]), String(target)).rejects.toMatchObject(DENIED)
    }
    expect(await viewsNow()).toEqual([])
  })

  it.each([
    ['자기 병원 HA', HA],
    ['대기 병원 HC', HC],
    ['거절 병원 HR', HR],
    ['없는 id', NOWHERE],
    ['null', null],
  ])('AC-8001.2: 관리자 A가 %s를 고르면 22023이고 admin_views는 그대로', async (_label, target) => {
    await become(A)
    await expect(rows(`select public.start_admin_view($1)`, [target])).rejects.toMatchObject(BAD)
    expect(await viewsNow()).toEqual([])
  })

  it('AC-8001.2: 요청 머리에 같은 사용자의 열린 열쇠가 있으면 그 줄은 끝 시각이 찍히고 새 줄이 생긴다(남의 열쇠·끝난 열쇠는 건드리지 않음)', async () => {
    const k1 = await startView(A, B)
    const k2 = await startView(A, F, viewHeader(k1))
    expect(k2).not.toBe(k1)
    let views = await viewsNow()
    expect(views.find((v) => v.id === k1)?.ended_at).not.toBeNull()
    expect(views.find((v) => v.id === k2)?.ended_at).toBeNull()
    // D가 A의 열쇠를 머리에 붙여 시작해도 A의 줄은 그대로
    const k3 = await startView(D, B, viewHeader(k2))
    views = await viewsNow()
    expect(views.find((v) => v.id === k2)?.ended_at).toBeNull()
    expect(views.find((v) => v.id === k3)?.ended_at).toBeNull()
    expect(views).toHaveLength(3)
  })
})

describe('AC-8001.3 보기 열쇠 → 보는 의원', SLOW, () => {
  const probe = async () => ({
    view: (await rows(`select public.admin_view_hospital_id() as id`))[0].id,
    read: (await rows(`select public.read_hospital_id() as id`))[0].id,
    mine: (await rows(`select public.my_hospital_id() as id`))[0].id,
    current: await rows(`select * from public.my_admin_view()`),
  })

  it('AC-8001.3: 머리가 A의 열린 열쇠면 보는 의원 = HB, 읽을 병원 = HB, my_admin_view = (HB, 병원 정보 이름)', async () => {
    const key = await startView(A, B)
    await become(A, viewHeader(key))
    expect(await probe()).toEqual({ view: HB, read: HB, mine: HA, current: [{ hospital_id: HB, name: '나다정형외과' }] })
    // 병원 정보 이름이 없으면 가입 이름. 큰 글자 열쇠도 같은 열쇠다
    const other = await startView(A, F)
    await become(A, viewHeader(other.toUpperCase()))
    expect(await probe()).toEqual({ view: HF, read: HF, mine: HA, current: [{ hospital_id: HF, name: '사아의원' }] })
  })

  it.each([
    ['머리 없음', null],
    ['빈 글자', ''],
    ['JSON 아님', 'not json'],
    ['배열', '[]'],
    ['열쇠 칸 없음', '{"other": "x"}'],
    ['숫자', '{"x-ssk-view": 123}'],
    ['null', '{"x-ssk-view": null}'],
    ['uuid 모양 아님', '{"x-ssk-view": "zzz"}'],
    ['uuid 뒤 글자', `{"x-ssk-view": "${rid(1, A)}x"}`],
    ['없는 열쇠', `{"x-ssk-view": "${rid(77, A)}"}`],
  ])('AC-8001.3: %s이면 보는 의원 null · 읽을 병원 = 내 병원 · my_admin_view 빈 목록(오류 없음)', async (_label, headers) => {
    await startView(A, B)
    await become(A, headers)
    expect(await probe()).toEqual({ view: null, read: HA, mine: HA, current: [] })
  })

  it('AC-8001.3: 남의 열쇠·끝난 열쇠·12시간 지난 열쇠·관리자에서 빠진 사람·승인 상태가 아닌 병원이면 null이다', async () => {
    const expectNone = async (user: string, key: string) => {
      await become(user, viewHeader(key))
      const found = await probe()
      expect(found.view).toBeNull()
      expect(found.read).toBe(found.mine)
      expect(found.current).toEqual([])
    }
    // 남의 열쇠: D의 열쇠를 A가, A의 열쇠를 원장 B가 붙임
    const keyD = await startView(D, B)
    await expectNone(A, keyD)
    const keyA = await startView(A, F)
    await expectNone(B, keyA)
    // 끝난 열쇠
    await operator()
    await db.query(`update public.admin_views set ended_at = now() where id = $1`, [keyA])
    await expectNone(A, keyA)
    // 12시간: 11시간 59분은 아직, 12시간 1분은 끝
    const keyOld = await startView(A, B)
    await operator()
    await db.query(`update public.admin_views set started_at = now() - interval '11 hours 59 minutes' where id = $1`, [keyOld])
    await become(A, viewHeader(keyOld))
    expect((await probe()).view).toBe(HB)
    await operator()
    await db.query(`update public.admin_views set started_at = now() - interval '12 hours 1 minute' where id = $1`, [keyOld])
    await expectNone(A, keyOld)
    // 관리자에서 빠짐
    const keyGone = await startView(A, B)
    await operator()
    await db.query(`delete from public.admins where user_id = $1`, [A])
    await expectNone(A, keyGone)
    await operator()
    await db.query(`insert into public.admins (user_id) values ($1)`, [A])
    await become(A, viewHeader(keyGone))
    expect((await probe()).view).toBe(HB)
    // 보는 병원이 승인 상태가 아님
    for (const status of ['pending', 'rejected']) {
      await operator()
      await db.query(`update public.hospitals set status = $1 where id = $2`, [status, HB])
      await expectNone(A, keyGone)
    }
  })
})

describe('AC-8001.4 보기 끝', SLOW, () => {
  it('AC-8001.4: 머리 K로 stop_admin_view를 부르면 K 줄에 끝 시각이 찍히고 그 뒤 보는 의원은 null이다', async () => {
    const key = await startView(A, B)
    await become(A, viewHeader(key))
    await rows(`select public.stop_admin_view()`)
    expect((await rows(`select public.admin_view_hospital_id() as id`))[0].id).toBeNull()
    expect((await viewsNow())[0].ended_at).not.toBeNull()
  })

  it('AC-8001.4: 머리가 없거나 남의 열쇠면 아무 줄도 바뀌지 않고 오류도 없다', async () => {
    const keyA = await startView(A, B)
    const keyD = await startView(D, B)
    for (const headers of [null, viewHeader(keyD), 'not json']) {
      await become(A, headers)
      await rows(`select public.stop_admin_view()`)
    }
    // D가 A의 열쇠로 끝내도 A의 줄은 그대로
    await become(D, viewHeader(keyA))
    await rows(`select public.stop_admin_view()`)
    expect((await viewsNow()).map((v) => v.ended_at)).toEqual([null, null])
  })

  it.each([
    ['관리자 아닌 원장 B', B],
    ['데스크 K', K],
    ['병원 줄 없는 사용자 E', E],
  ])('AC-8001.4: %s는 42501이다', async (_label, user) => {
    const key = await startView(A, B)
    await become(user, viewHeader(key))
    await expect(rows(`select public.stop_admin_view()`)).rejects.toMatchObject(DENIED)
    expect((await viewsNow())[0].ended_at).toBeNull()
  })
})

describe('AC-8001.5 본 기록', SLOW, () => {
  async function seedLog() {
    await seedView(A, B, rid(31, A), '1 hour')
    await seedView(D, B, rid(32, D), '2 hours')
    await seedView(A, F, rid(33, A), '3 hours')
    await operator()
    await db.query(`update public.admin_views set ended_at = now() where id = $1`, [rid(33, A)])
    await seedView(A, B, rid(34, A), '31 days') // 30일 전 줄: 지우지 않고 답에만 없다
    // 병원 없는 관리자 E의 줄(본 관리자 이름 없음, 메일은 로그인 메일)
    await db.query(`insert into public.admins (user_id) values ($1)`, [E])
    await seedView(E, F, rid(35, E), '4 hours')
  }

  it('AC-8001.5: 관리자가 부르면 최근 30일 줄 모두를 최근 시작 차례로 (본 때, 본 관리자 의원 이름, 메일, 본 의원 id, 이름)만 준다', async () => {
    await seedLog()
    await operator()
    const at = Object.fromEntries((await rows(`select id, started_at from public.admin_views`)).map((r) => [String(r.id), r.started_at]))
    for (const viewer of [A, D, E]) {
      await become(viewer)
      expect(await rows(`select * from public.admin_view_log()`), viewer).toEqual([
        { started_at: at[rid(31, A)], viewer_name: '가나의원', viewer_email: 'a-admin@fake.test', hospital_id: HB, hospital_name: '나다정형외과' },
        { started_at: at[rid(32, D)], viewer_name: '마바정형외과', viewer_email: 'd-admin@fake.test', hospital_id: HB, hospital_name: '나다정형외과' },
        { started_at: at[rid(33, A)], viewer_name: '가나의원', viewer_email: 'a-admin@fake.test', hospital_id: HF, hospital_name: '사아의원' },
        { started_at: at[rid(35, E)], viewer_name: null, viewer_email: 'e-user@fake.test', hospital_id: HF, hospital_name: '사아의원' },
      ])
    }
    // 30일 전 줄은 표에 그대로 있다
    expect((await viewsNow()).map((v) => v.id)).toContain(rid(34, A))
  })

  it.each([
    ['보인 의원 주인 B', B],
    ['관리자 아닌 원장 F', F],
    ['데스크 K', K],
    ['대기 병원 주인 C', C],
  ])('AC-8001.5: %s는 42501이다', async (_label, user) => {
    await seedLog()
    await become(user)
    await expect(rows(`select * from public.admin_view_log()`)).rejects.toMatchObject(DENIED)
  })

  it('AC-8001.5: 누구도(관리자·원장·anon) admin_views·hospital_regions를 바로 읽거나 넣거나 고치거나 지우지 못한다', async () => {
    await seedLog()
    const statements: [string, unknown[]][] = [
      ['select * from public.admin_views', []],
      ['insert into public.admin_views (user_id, hospital_id) values ($1, $2)', [A, HB]],
      ['update public.admin_views set ended_at = now()', []],
      ['delete from public.admin_views', []],
      ['select * from public.hospital_regions', []],
      ['insert into public.hospital_regions (hospital_id, sido) values ($1, $2)', [HB, '경기']],
      ['update public.hospital_regions set sido = null', []],
      ['delete from public.hospital_regions', []],
    ]
    for (const user of [A, D, B, K, null]) {
      for (const [sql, params] of statements) {
        if (user === null) await becomeAnon()
        else await become(user)
        await expect(rows(sql, params), `${user} ${sql}`).rejects.toMatchObject(DENIED)
      }
    }
    expect(await viewsNow()).toHaveLength(5)
  })
})

describe('AC-8001.6 의원 목록', SLOW, () => {
  it('AC-8001.6: 관리자가 부르면 승인된 병원만 (id, 이름, 주소, 지역 정함, 정한 지역, 내 병원) 이름 차례로 준다', async () => {
    await operator()
    await db.query(`insert into public.hospital_regions (hospital_id, sido) values ($1, '경기'), ($2, null)`, [HB, HD])
    const expected = (me: string) => [
      { hospital_id: HA, name: '가나의원', address: '서울 가짜구 가짜로 1', region_set: false, region: null, is_me: me === HA },
      { hospital_id: HB, name: '나다정형외과', address: '서울특별시 서초구 서초동 123-4', region_set: true, region: '경기', is_me: false },
      { hospital_id: HD, name: '마바정형외과', address: null, region_set: true, region: null, is_me: me === HD },
      { hospital_id: HF, name: '사아의원', address: null, region_set: false, region: null, is_me: false },
    ]
    await become(A)
    expect(await rows(`select * from public.admin_view_hospitals()`)).toEqual(expected(HA))
    await become(D)
    expect(await rows(`select * from public.admin_view_hospitals()`)).toEqual(expected(HD))
    // 보는 중에도 같은 목록(보기 상태와 상관없다)
    const key = await startView(A, B)
    await become(A, viewHeader(key))
    expect(await rows(`select * from public.admin_view_hospitals()`)).toEqual(expected(HA))
  })

  it.each([
    ['관리자 아닌 원장 B', B],
    ['데스크 K', K],
    ['병원 줄 없는 사용자 E', E],
  ])('AC-8001.6: %s는 42501이다', async (_label, user) => {
    await become(user)
    await expect(rows(`select * from public.admin_view_hospitals()`)).rejects.toMatchObject(DENIED)
  })
})

describe('AC-8002.1 병원별 표 정책', SLOW, () => {
  it.each(VIEW_TABLES)("AC-8002.1: '보기 ○' 표 %s에 permissive '관리자 보는 의원 읽기'와 restrictive '보는 중에는 그 의원만 · 쓰기 없음'이 있다", (table) => {
    const mine = first.policies.filter((p) => p.schemaname === 'public' && p.tablename === table && isNewPolicy(p))
    expect(mine.map((p) => p.policyname).sort()).toEqual([GUARD_POLICY, VIEW_POLICY].sort())
    const view = mine.find((p) => p.policyname === VIEW_POLICY)
    expect(view).toMatchObject({ cmd: 'SELECT', permissive: 'PERMISSIVE', roles: ['authenticated'], with_check: null })
    expect(squash(view?.qual)).toMatch(VIEW_QUAL)
    const guard = mine.find((p) => p.policyname === GUARD_POLICY)
    expect(guard).toMatchObject({ cmd: 'ALL', permissive: 'RESTRICTIVE', roles: ['authenticated'] })
    expect(squash(guard?.qual)).toMatch(GUARD_QUAL)
    expect(squash(guard?.with_check)).toMatch(GUARD_CHECK)
  })

  it.each(HIDDEN_TABLES)("AC-8002.1: '보기 ×' 표 %s에는 restrictive 정책 하나만 더하고 permissive는 더하지 않는다", (table) => {
    const mine = first.policies.filter((p) => p.schemaname === 'public' && p.tablename === table && isNewPolicy(p))
    expect(mine).toHaveLength(1)
    expect(mine[0]).toMatchObject({ policyname: GUARD_POLICY, cmd: 'ALL', permissive: 'RESTRICTIVE', roles: ['authenticated'] })
    expect(squash(mine[0].qual)).toMatch(GUARD_QUAL)
    expect(squash(mine[0].with_check)).toMatch(GUARD_CHECK)
  })

  it("AC-8002.1: '함수로만' 표·hospitals·admins에는 정책을 더하지 않는다(42P17)", () => {
    for (const table of [...FUNCTION_ONLY_TABLES, 'hospitals', 'admins']) {
      expect(first.policies.filter((p) => p.schemaname === 'public' && p.tablename === table && isNewPolicy(p)), table).toEqual([])
      expect(
        first.policies.filter((p) => p.tablename === table),
        table,
      ).toEqual(before.policies.filter((p) => p.tablename === table))
    }
  })

  it("AC-8002.6: storage.objects에 '관리자 보는 의원 파일 읽기'(select, authenticated) 하나를 더하고, 바구니 다섯과 admin_view_open을 본다", () => {
    const added = first.policies.filter((p) => p.schemaname === 'storage' && isNewPolicy(p))
    expect(added).toHaveLength(1)
    expect(added[0]).toMatchObject({ tablename: 'objects', cmd: 'SELECT', permissive: 'PERMISSIVE', roles: ['authenticated'], with_check: null })
    const qual = squash(added[0].qual)
    for (const bucket of FILE_BUCKETS) expect(qual).toContain(`'${bucket}'`)
    expect(qual).not.toContain('install-files')
    expect(qual).toMatch(/admin_view_open\(\(storage\.foldername\(name\)\)\[1\]\)/)
  })
})

// 표본 표마다 쓰기 하나씩(design.md '시험 계획'): 고칠 칸(null = 사용자 고치기 권한 없음)·새 줄·겹치는 줄(upsert)·겹침 열쇠·지우기 권한
type Probe = { set: string | null; insert: (owner: string) => Row; upsert: (owner: string) => Row; conflict: string; del: boolean }
const dayPayload = (day: string) => ({ schemaVersion: 2, day, partial: false })
const SAMPLE: Record<string, Probe> = {
  stats_days: {
    set: 'partial',
    insert: () => ({ day: '2026-11-05', partial: false, source: 'bit', payload: dayPayload('2026-11-05') }),
    upsert: () => ({ day: DAY, partial: false, source: 'bit', payload: dayPayload(DAY) }),
    conflict: 'hospital_id, day',
    del: false,
  },
  clinic_profiles: { set: 'display_name', insert: () => ({ hours: SEVEN }), upsert: () => ({ hours: SEVEN }), conflict: 'hospital_id', del: false },
  staff_members: {
    set: 'memo',
    insert: () => ({ name: '새직원', job: '원무', employment: 'regular', hired_on: '2026-11-01' }),
    upsert: () => ({ name: '김가짜', job: '원무', employment: 'regular', hired_on: '2025-01-01' }),
    conflict: 'hospital_id, name, hired_on',
    del: true,
  },
  staff_pay_lines: {
    set: 'adjust',
    insert: () => ({ month: '2026-12' }),
    upsert: (owner) => ({ month: MONTH, staff_id: rid(15, owner), adjust: 1 }),
    conflict: 'hospital_id, month, staff_id',
    del: false,
  },
  worklog_days: {
    set: 'memo',
    insert: () => ({ work_date: '2026-11-05', memo: '새 메모' }),
    upsert: () => ({ work_date: DAY, memo: '새 메모' }),
    conflict: 'hospital_id, work_date',
    del: false,
  },
  sunap_days: { set: 'visits', insert: () => ({ work_date: '2026-11-05' }), upsert: () => ({ work_date: DAY, visits: 1 }), conflict: 'hospital_id, work_date', del: true },
  location_settings: { set: 'home_eswt', insert: () => ({ home_eswt: 1 }), upsert: () => ({ home_eswt: 1 }), conflict: 'hospital_id', del: false },
  contacts_people: {
    set: 'role',
    insert: (owner) => ({ company_id: rid(21, owner), name: '새담당' }),
    upsert: (owner) => ({ company_id: rid(21, owner), name: '박담당', role: '새' }),
    conflict: 'company_id, name',
    del: true,
  },
  ai_reports: {
    set: null,
    insert: () => ({ month: '2026-12', report: {}, input_hash: HASH, model: 'claude-test' }),
    upsert: () => ({ month: '2026-10', report: {}, input_hash: HASH, model: 'claude-new' }),
    conflict: 'hospital_id, month',
    del: false,
  },
  notice_marks: { set: 'memo', insert: () => ({ notice_id: N1, memo: '새' }), upsert: () => ({ notice_id: N1, memo: '새' }), conflict: 'hospital_id, notice_id', del: false },
  calendar_settings: { set: 'sunday', insert: () => ({ sunday: true }), upsert: () => ({ sunday: true }), conflict: 'hospital_id', del: false },
}
const SAMPLE_TABLES = Object.keys(SAMPLE)
// '보기 ×' 표마다 고칠 칸(null = 사용자 고치기 권한 없음)
const HIDDEN_SET: Record<string, string | null> = {
  calendar_appts: 'memo',
  calendar_rev: null,
  message_templates: 'body',
  contact_counts: 'followup_left',
  claim_day_counts: 'visits',
  claim_month_counts: 'flagged',
  claim_day_closes: null,
}

const insertSql = (table: string, row: Row, extra = '') => {
  const columns = Object.keys(row).join(', ')
  return `insert into public.${table} (${columns}) select ${columns} from json_populate_record(null::public.${table}, $1::json) ${extra}`
}
const upsertSql = (table: string, probe: Probe, row: Row) => {
  const set = probe.set ?? Object.keys(row)[Object.keys(row).length - 1]
  return insertSql(table, row, `on conflict (${probe.conflict}) do update set ${set} = excluded.${set}`)
}

/** 지금 역할로 표본 표 하나에 쓰기 다섯(넣기·남의 병원 id로 넣기·upsert·고치기·지우기)의 결과 */
async function writeProbe(table: string, owner: string, t: PGlite = db) {
  const probe = SAMPLE[table]
  const insert = probe.insert(owner)
  const upsert = probe.upsert(owner)
  return {
    insert: await outcome(() => t.query(insertSql(table, insert), [JSON.stringify(insert)])),
    insertOther: await outcome(() => t.query(insertSql(table, { hospital_id: HB, ...insert }), [JSON.stringify({ hospital_id: HB, ...insert })])),
    upsert: await outcome(() => t.query(upsertSql(table, probe, upsert), [JSON.stringify(upsert)])),
    update: await outcome(() => t.query(`update public.${table} set ${probe.set ?? 'hospital_id'} = ${probe.set ?? 'hospital_id'}`)),
    delete: await outcome(() => t.query(`delete from public.${table}`)),
  }
}

describe('AC-8002.2 보는 중 읽기 — 보기 ○ 표는 그 의원 줄만', SLOW, () => {
  it.each(SAMPLE_TABLES)('AC-8002.2: 머리 K(HB)로 %s를 거르기 없이 읽으면 HB 줄만(한 줄 표도 한 줄), 머리 없이는 지금과 같이 HA 줄만', async (table) => {
    const key = await startView(A, B)
    await become(A, viewHeader(key))
    expect(await labelsOf(table)).toEqual(['B'])
    await become(A)
    expect([...new Set(await labelsOf(table))]).toEqual(['A'])
  })

  it('AC-8002.2: 보는 중 한 줄 읽기(maybeSingle 모양 — limit 2)도 HB 한 줄이다', async () => {
    const key = await startView(A, B)
    await become(A, viewHeader(key))
    for (const table of ['clinic_profiles', 'location_settings', 'calendar_settings', 'sunap_settings', 'staff_settings', 'worklog_settings']) {
      const found = await rows(`select hospital_id from public.${table} limit 2`)
      expect(found.map((r) => LABEL[String(r.hospital_id)]), table).toEqual(table === 'worklog_settings' ? [] : ['B'])
    }
  })
})

describe('AC-8002.3 보는 중 읽기 — 보기 × 표는 아무 줄도', SLOW, () => {
  it.each(HIDDEN_TABLES)('AC-8002.3: 머리 K(HB)로 %s를 읽으면 HA·HB 줄 모두 안 나온다(머리 없이는 HA 줄)', async (table) => {
    const key = await startView(A, B)
    await become(A, viewHeader(key))
    expect(await labelsOf(table)).toEqual([])
    await become(A)
    expect([...new Set(await labelsOf(table))]).toEqual(['A'])
  })
})

describe('AC-8002.4 보는 중 쓰기 막기', SLOW, () => {
  it.each(SAMPLE_TABLES)('AC-8002.4: 머리 K(HB)로 %s에 넣기·upsert는 42501, 고치기·지우기는 0줄(권한 없는 표는 42501)이고 HA·HB 줄 모두 그대로', async (table) => {
    const key = await startView(A, B)
    const kept = await dump([table])
    await become(A, viewHeader(key))
    const probe = SAMPLE[table]
    expect(await writeProbe(table, A)).toEqual({
      insert: 'error 42501',
      insertOther: 'error 42501',
      upsert: 'error 42501',
      update: probe.set === null ? 'error 42501' : 'ok 0',
      delete: probe.del ? 'ok 0' : 'error 42501',
    })
    expect(await dump([table])).toEqual(kept)
  })

  it.each(Object.keys(HIDDEN_SET))("AC-8002.4: 머리 K(HB)로 '보기 ×' 표 %s 고치기·지우기는 0줄(권한 없는 표는 42501)이고 줄은 그대로", async (table) => {
    const key = await startView(A, B)
    const kept = await dump([table])
    await become(A, viewHeader(key))
    const set = HIDDEN_SET[table]
    expect(await outcome(() => db.query(`update public.${table} set ${set ?? 'hospital_id'} = ${set ?? 'hospital_id'}`))).toBe(set === null ? 'error 42501' : 'ok 0')
    expect(['ok 0', 'error 42501']).toContain(await outcome(() => db.query(`delete from public.${table}`)))
    expect(await dump([table])).toEqual(kept)
  })

  it('AC-8002.4: 같은 쓰기를 invoker 함수(save_stats_rx_groups·save_revenue_range·contacts_import·see_rule_changes)로 해도 42501이고 줄은 그대로', async () => {
    const key = await startView(A, B)
    const tables = ['stats_rx_groups', 'sales_days', 'sales_day_codes', 'contacts_companies', 'rule_change_marks']
    const kept = await dump(tables)
    const calls: [string, unknown[]][] = [
      ['select * from public.save_stats_rx_groups($1::jsonb)', [JSON.stringify([{ name: '새 묶음', codes: ['MM303'], sort_order: 2 }])]],
      [
        'select public.save_revenue_range($1, $1, $2::jsonb, null)',
        ['2026-11-05', JSON.stringify([{ day: '2026-11-05', visits: 1, new_patients: 0, return_visits: 1, unconfirmed: true, split_unconfirmed: false }])],
      ],
      ['select public.contacts_import($1::jsonb)', [JSON.stringify({ companies: [{ name: '새업체', category: 'other' }] })]],
      ['select public.see_rule_changes($1)', [N1]],
    ]
    for (const [sql, params] of calls) {
      await become(A, viewHeader(key))
      await expect(rows(sql, params), sql).rejects.toMatchObject(DENIED)
    }
    expect(await dump(tables)).toEqual(kept)
    // 머리 없이는 지금처럼 내 병원에 쓴다(시험 쓰기가 맞는 모양인지)
    await become(A)
    await expect(rows(calls[3][0], calls[3][1])).resolves.toBeDefined()
  })
})

describe('AC-8002.5 관리자가 아닌 사람은 이 파일 전과 같다', SLOW, () => {
  const KEY = rid(41, A) // A가 HB를 열어 둔 열쇠(두 DB에서 같은 글자)
  /** 그 사용자가 가짜 머리를 붙이고 하는 읽기·쓰기 결과와 그 뒤 표 줄 */
  async function session(user: string, headers: string | null, t: PGlite) {
    const out: Record<string, unknown> = {}
    for (const table of [...SAMPLE_TABLES, ...HIDDEN_TABLES]) {
      await become(user, headers, t)
      out[`read ${table}`] = await outcome(async () => {
        const found = await labelsOf(table, t)
        out[`labels ${table}`] = found
        return { affectedRows: found.length }
      })
    }
    for (const table of SAMPLE_TABLES) {
      await become(user, headers, t)
      out[`write ${table}`] = await writeProbe(table, user === K ? A : user, t)
    }
    out.dump = await dump([...SAMPLE_TABLES, ...HIDDEN_TABLES], true, t)
    return out
  }

  it.each([
    ['관리자 아닌 원장(보인 의원 주인) B', B],
    ['관리자 아닌 원장 F', F],
    ['데스크 K', K],
    ['대기 병원 주인 C', C],
    ['병원 줄 없는 사용자 E', E],
  ])('AC-8002.5: %s가 A의 열쇠를 머리에 붙여도 읽기·쓰기 결과가 이 파일 전과 같다', async (_label, user) => {
    await resetData(pre)
    await seedView(A, B, KEY)
    const after = await session(user, viewHeader(KEY), db)
    const was = await session(user, viewHeader(KEY), pre)
    expect(after).toEqual(was)
    // 머리 없이도 같다
    await resetData(db)
    await resetData(pre)
    expect(await session(user, null, db)).toEqual(await session(user, null, pre))
  })

  it('AC-8002.5: 관리자 A도 머리가 없으면 이 파일 전과 같다(열린 보기 줄이 있어도)', async () => {
    await resetData(pre)
    await seedView(A, B, KEY)
    expect(await session(A, null, db)).toEqual(await session(A, null, pre))
  })
})

describe('AC-8002.6 바구니 다섯 읽기', SLOW, () => {
  const KEY = rid(42, A)
  const hbFiles = FILE_BUCKETS.map((bucket) => `${bucket}:${HB}/${bucket}.bin`)
  async function filesOf(user: string, t: PGlite) {
    await become(user, null, t)
    return visibleFiles(t)
  }

  it('AC-8002.6: HB를 열어 둔 관리자 A는 HB 파일을 읽고(머리와 상관없이), 끝낸 보기·12시간 지난 보기·관리자에서 빠지면 이 파일 전과 같다', async () => {
    await resetData(pre)
    await seedFiles(pre)
    await seedFiles(db)
    const was = await filesOf(A, pre)
    expect(was.filter((f) => hbFiles.includes(f))).toEqual([])
    await seedView(A, B, KEY)
    expect(await filesOf(A, db)).toEqual([...was, ...hbFiles].sort())
    await become(A, viewHeader(KEY))
    expect(await visibleFiles()).toEqual([...was, ...hbFiles].sort())
    // 다른 바구니(install-files·other-bucket)의 HB 파일은 이 정책으로 열리지 않는다
    expect((await filesOf(A, db)).filter((f) => f.includes(HB) && !hbFiles.includes(f))).toEqual(was.filter((f) => f.includes(HB)))
    await operator()
    await db.query(`update public.admin_views set started_at = now() - interval '12 hours 1 minute' where id = $1`, [KEY])
    expect(await filesOf(A, db)).toEqual(was)
    await operator()
    await db.query(`update public.admin_views set started_at = now(), ended_at = now() where id = $1`, [KEY])
    expect(await filesOf(A, db)).toEqual(was)
    await operator()
    await db.query(`update public.admin_views set ended_at = null where id = $1`, [KEY])
    await db.query(`delete from public.admins where user_id = $1`, [A])
    await resetPreAdmins(A)
    expect(await filesOf(A, db)).toEqual(await filesOf(A, pre))
  })

  /** pre DB에서도 같은 사람을 관리자에서 뺀다(견줄 때 같은 조건) */
  async function resetPreAdmins(user: string) {
    await operator(pre)
    await pre.query(`delete from public.admins where user_id = $1`, [user])
  }

  it('AC-8002.6: 남의 보기(D가 HB를 열어 둠)로는 A가 HB 파일을 못 읽고, D만 읽는다', async () => {
    await resetData(pre)
    await seedFiles(pre)
    await seedFiles(db)
    await seedView(D, B, KEY)
    expect(await filesOf(A, db)).toEqual(await filesOf(A, pre))
    expect(await filesOf(D, db)).toEqual([...(await filesOf(D, pre)), ...hbFiles].sort())
  })

  it.each([
    ['보인 의원 주인 B', B],
    ['관리자 아닌 원장 F', F],
    ['데스크 K', K],
    ['대기 병원 주인 C', C],
    ['병원 줄 없는 사용자 E', E],
  ])('AC-8002.6: %s는 A가 보기를 열어 두어도(머리를 붙여도) 이 파일 전과 같다', async (_label, user) => {
    await resetData(pre)
    await seedFiles(pre)
    await seedFiles(db)
    await seedView(A, B, KEY)
    await become(user, viewHeader(KEY))
    const now = await visibleFiles()
    await become(user, viewHeader(KEY), pre)
    expect(now).toEqual(await visibleFiles(pre))
  })
})

describe('AC-8002.7 다시 만든 읽기 함수 여섯', SLOW, () => {
  async function answers(t: PGlite = db) {
    return {
      totals: await rows(`select * from public.sales_code_totals($1, $2)`, [FROM, TO], t),
      list: (await rows(`select public.notice_list(false, null, false, null, false, 50, 0) as j`, [], t))[0].j,
      unread: (await rows(`select public.notice_unread_count() as n`, [], t))[0].n,
      ruleAlerts: await rows(`select * from public.notice_rule_alerts()`, [], t),
      changeAlerts: await rows(`select * from public.rule_change_alerts()`, [], t),
      desks: await rows(`select email from public.desk_members()`, [], t),
    }
  }

  it('AC-8002.7: 머리 K(HB)로 부르면 HB 기준 답(= HB 주인이 받는 답)이고, 머리 없이는 이 파일 전과 같은 답이다', async () => {
    await resetData(pre)
    const key = await startView(A, B)
    await become(A, viewHeader(key))
    const viewing = await answers()
    await become(B)
    const asB = await answers()
    expect(viewing).toEqual(asB)
    await become(A)
    const plain = await answers()
    await become(A, null, pre)
    expect(plain).toEqual(await answers(pre))
    // 시험 자료가 병원마다 달라 견줌이 뜻이 있다
    expect(plain).not.toEqual(viewing)
    expect(viewing.unread).toBe(1)
    expect(plain.unread).toBe(0)
    expect(viewing.totals).toEqual([{ code: 'MM302', count: 5, amount: 5000, missing: false }])
    expect(viewing.desks).toEqual([{ email: 'desk-b@fake.test' }])
    expect(viewing.changeAlerts).toEqual([{ id: N1, notice_no: '2026-901', title: '[행위] 고시 제2026-901호 개정', change_count: 1 }])
    expect(viewing.ruleAlerts).toEqual([{ id: N1, notice_no: '2026-901', title: '[행위] 고시 제2026-901호 개정', rule_count: 1 }])
  })

  it.each(['B', 'K', 'C', 'E'])('AC-8002.7: 관리자 아닌 사용자 %s는 가짜 머리를 붙여도 이 파일 전과 같은 답이다', async (label) => {
    const user = { B, K, C, E }[label] as string
    await resetData(pre)
    const key = await startView(A, B)
    await become(user, viewHeader(key))
    const now = await answers()
    await become(user, viewHeader(key), pre)
    expect(now).toEqual(await answers(pre))
  })

  it.each(REMADE)('AC-8002.7: %s 인자·답 모양·호출자·search_path·권한은 그대로이고, 읽을 병원은 read_hospital_id()다', (fn) => {
    const was = fnOf(before, fn)
    const now = fnOf(first, fn)
    expect(was, fn).toBeDefined()
    const meta = (f: Row | undefined) => ({ fn: f?.fn, definer: f?.definer, config: f?.config, volatile: f?.volatile, lang: f?.lang, result: f?.result, acl: f?.acl })
    expect(meta(now)).toEqual(meta(was))
    if (fn === 'notice_unread_count()') {
      // 읽을 병원은 notice_list가 고른다(바꿀 글자 없음 — 글자 그대로 옮김)
      expect(squash(now?.def)).toBe(squash(was?.def))
    } else {
      expect(String(now?.def)).toContain('read_hospital_id()')
      expect(String(was?.def)).not.toContain('read_hospital_id()')
      // 바꾼 자리 말고는 글자 그대로
      expect(squash(now?.def).replace(/read_hospital_id\(\)/g, 'my_hospital_id()')).toBe(squash(was?.def))
    }
  })

  it('AC-8002.7: rule_change_alerts의 "내 병원이 승인됨" 검사는 my_hospital_id() 그대로다', () => {
    const def = squash(fnOf(first, 'rule_change_alerts()')?.def)
    expect(def).toContain('where (select public.my_hospital_id()) is not null')
    expect(def).toContain('m.hospital_id = (select public.read_hospital_id())')
  })
})

describe('AC-8002.8 병원별 표 목록 완전성 · 42P17 없음', SLOW, () => {
  it("AC-8002.8: hospital_id 칸이 있는 public 표 모두가 '보기 ○'·'보기 ×'·'함수로만' 가운데 정확히 한 곳에 있다", async () => {
    await operator()
    const tables = (
      await rows(
        `select c.table_name from information_schema.columns c join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
         where c.table_schema = 'public' and c.column_name = 'hospital_id' and t.table_type = 'BASE TABLE' order by 1`,
      )
    ).map((r) => String(r.table_name))
    const listed = [...VIEW_TABLES, ...HIDDEN_TABLES, ...FUNCTION_ONLY_TABLES]
    expect(new Set(listed).size).toBe(listed.length)
    expect([...listed].sort()).toEqual(tables)
    // google-link AC-8502.2: 이 파일 뒤에 20261126000000_google_link.sql을 더 붙인 DB에서도 새 표 여덟이 '보기 ○'(gsheet 셋)·'보기 ×'(gcal 다섯)에 든다
    const linked = await PGlite.create()
    try {
      await migrate(linked)
      await linked.exec(MIGRATION)
      await linked.exec(GLINK_MIGRATION)
      await operator(linked)
      const linkedTables = (
        await rows(
          `select c.table_name from information_schema.columns c join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
           where c.table_schema = 'public' and c.column_name = 'hospital_id' and t.table_type = 'BASE TABLE' order by 1`,
          [],
          linked,
        )
      ).map((r) => String(r.table_name))
      const withGlink = [...VIEW_TABLES, ...GLINK_VIEW_TABLES, ...HIDDEN_TABLES, ...GLINK_HIDDEN_TABLES, ...FUNCTION_ONLY_TABLES]
      expect(new Set(withGlink).size).toBe(withGlink.length)
      expect([...withGlink].sort()).toEqual(linkedTables)
    } finally {
      await linked.close()
    }
  })

  it("AC-8002.8: '함수로만' 표는 사용자 표 권한·정책이 없다", () => {
    for (const table of FUNCTION_ONLY_TABLES) {
      const access = first.access.find((t) => t.relname === table)
      expect(aclHas(access?.acl, 'authenticated') || ((access?.acl as string[] | null) ?? []).some((i) => i.startsWith('authenticated=')), table).toBe(false)
      expect(first.policies.filter((p) => p.schemaname === 'public' && p.tablename === table), table).toEqual([])
    }
  })

  it('AC-8002.8: 보기 ○·× 표 모두를 보는 관리자·관리자·원장·데스크·대기·병원 없는 사용자가 읽어도 무한 되부름(42P17)이 없다', async () => {
    const key = await startView(A, B)
    const who: [string, string | null][] = [
      [A, viewHeader(key)],
      [A, null],
      [D, viewHeader(key)],
      [B, viewHeader(key)],
      [K, viewHeader(key)],
      [C, null],
      [E, null],
    ]
    for (const [user, headers] of who) {
      for (const table of [...VIEW_TABLES, ...HIDDEN_TABLES]) {
        await become(user, headers)
        // 표 권한이 없는 표는 42501(이 파일 전과 같음), 무한 되부름 42P17은 어디에도 없다
        const result = await outcome(() => db.query(`select count(*) from public.${table}`))
        expect(result, `${user} ${table}`).toMatch(/^(ok 0|error 42501)$/)
      }
      await become(user, headers)
      for (const sql of ['select count(*) from public.hospitals', 'select count(*) from public.admins', 'select count(*) from storage.objects', 'select * from public.my_admin_view()']) {
        expect(await outcome(() => db.query(sql)), `${user} ${sql}`).toMatch(/^ok/)
      }
    }
  })
})

describe('AC-8003.1 지역 표 · 함수 모양', SLOW, () => {
  it('AC-8003.1: hospital_regions는 (병원 id 열쇠, sido = 17개 이름 또는 null, 고친 시각)이고 RLS 켜짐·사용자 표 권한 없음', async () => {
    expect(
      first.columns.filter((c) => c.table_name === 'hospital_regions').map((c) => [c.column_name, c.data_type, c.is_nullable, c.column_default]),
    ).toEqual([
      ['hospital_id', 'uuid', 'NO', null],
      ['sido', 'text', 'YES', null],
      ['updated_at', 'timestamp with time zone', 'NO', 'now()'],
    ])
    const defs = first.constraints.filter((c) => bare(c.tbl) === 'hospital_regions' && !/^NOT NULL /.test(String(c.def))).map((c) => squash(c.def))
    expect(defs).toEqual(
      expect.arrayContaining(['PRIMARY KEY (hospital_id)', expect.stringMatching(/^FOREIGN KEY \(hospital_id\) REFERENCES (public\.)?hospitals\(id\) ON DELETE CASCADE$/)]),
    )
    expect(defs).toHaveLength(3)
    await operator()
    for (const sido of [...SIDO, null]) {
      await db.query(`insert into public.hospital_regions (hospital_id, sido) values ($1, $2) on conflict (hospital_id) do update set sido = excluded.sido`, [HB, sido])
    }
    for (const sido of ['전남광주', '서울특별시', '', '지역 모름', '광주시']) {
      await expect(db.query(`insert into public.hospital_regions (hospital_id, sido) values ($1, $2)`, [HF, sido]), sido).rejects.toMatchObject({ code: '23514' })
    }
  })
})

describe('AC-8003.2 지역 고치기', SLOW, () => {
  const regionRows = async () => {
    await operator()
    return rows(`select hospital_id, sido from public.hospital_regions order by 1`)
  }

  it("AC-8003.2: 관리자가 '경기' → '광주' → null로 고치면 줄이 생기고·바뀌고·sido null(지역 모름으로 정함)인 줄로 남는다", async () => {
    await become(A)
    await rows(`select public.set_hospital_region($1, $2)`, [HB, '경기'])
    expect(await regionRows()).toEqual([{ hospital_id: HB, sido: '경기' }])
    await operator()
    await db.query(`update public.hospital_regions set updated_at = '2001-01-01T00:00:00Z'`)
    await become(D)
    await rows(`select public.set_hospital_region($1, $2)`, [HB, '광주'])
    expect(await regionRows()).toEqual([{ hospital_id: HB, sido: '광주' }])
    expect((await rows(`select updated_at > now() - interval '1 minute' as fresh from public.hospital_regions`))[0].fresh).toBe(true)
    await become(A)
    await rows(`select public.set_hospital_region($1, null)`, [HB])
    expect(await regionRows()).toEqual([{ hospital_id: HB, sido: null }])
    // 보는 중에도 된다(관리자 화면은 의원과 상관없다)
    const key = await startView(A, F)
    await become(A, viewHeader(key))
    await rows(`select public.set_hospital_region($1, $2)`, [HF, '제주'])
    expect(await regionRows()).toEqual([
      { hospital_id: HB, sido: null },
      { hospital_id: HF, sido: '제주' },
    ])
  })

  it.each([
    ['관리자 아닌 원장 B', B],
    ['데스크 K', K],
    ['대기 병원 주인 C', C],
  ])('AC-8003.2: %s는 42501이다(인자가 틀려도 먼저)', async (_label, user) => {
    for (const [target, sido] of [
      [HB, '경기'],
      [null, '전남광주'],
    ]) {
      await become(user)
      await expect(rows(`select public.set_hospital_region($1, $2)`, [target, sido])).rejects.toMatchObject(DENIED)
    }
    expect(await regionRows()).toEqual([])
  })

  it.each([
    ['대기 병원', HC, '서울'],
    ['거절 병원', HR, '서울'],
    ['없는 병원', NOWHERE, '서울'],
    ['null 병원', null, '서울'],
    ['17개 밖 이름 전남광주', HB, '전남광주'],
    ['정식 이름', HB, '서울특별시'],
    ['빈 글자', HB, ''],
  ])('AC-8003.2: 관리자가 %s로 고치면 22023이고 표는 그대로', async (_label, target, sido) => {
    await become(A)
    await expect(rows(`select public.set_hospital_region($1, $2)`, [target, sido])).rejects.toMatchObject(BAD)
    expect(await regionRows()).toEqual([])
  })
})

// design.md '비교 읽기' 표의 종류(열여덟)마다 줄 jsonb 열쇠 — 지금 lib/storage가 그 표에서 고르는 칸과 같다
const snake = (key: string) => (key === 'date' ? 'day' : key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`))
const KIND_KEYS: Record<string, string[]> = {
  stats_days: ['day', 'partial', 'source', 'payload', 'updated_at'], // lib/storage/stats.ts readPeriod
  stats_months: ['month', 'partial', 'rx', 'groups', 'dropoff', 'sections'],
  stats_day_totals: ['day', 'partial', 'totals'],
  stats_coverage: ['from_day', 'to_day'], // lib/storage/stats.ts readCoverage
  stats_rx_groups: ['id', 'name', 'codes', 'out_codes', 'cond', 'sort_order'], // lib/storage/statsRxGroups.ts
  stats_goals: ['month', 'visits', 'new_patients', 'revenue'],
  sales_days: [...REVENUE_DAY_KEYS.map(snake), 'rough_total', 'day_codes'], // lib/storage/revenue.ts SAVED_DAY_SELECT
  sales_code_totals: ['code', 'count', 'amount', 'missing'],
  sales_codes: ['month', 'code', 'name', 'count', 'amount'], // lib/storage/revenue.ts CODE_SELECT
  sunap_settings: ['block_group', 'pt_group', 'rsv_words'], // lib/storage/sunap.ts SETTINGS_COLUMNS
  sunap_days: ['work_date', 'closed_at', 'late', ...SUNAP_TOTAL_KEYS], // lib/storage/sunap.ts DAY_COLUMNS
  calendar_settings: ['kinds', 'staff', 'open_hour', 'close_hour', 'sunday'], // lib/storage/calendar.ts SETTINGS_COLUMNS
  calendar_allday: ['id', 'day', 'type', 'memo', 'staff_id', 'staff_name', 'part'], // lib/storage/calendar.ts ALLDAY_COLUMNS
  calendar_counts: ['day', 'staff_id', 'staff_name', 'kind_id', 'kind_name', 'status', 'auto', 'orig_day'], // lib/storage/calendar.ts COUNT_COLUMNS
  clinic_profiles: ['display_name', 'honorific', 'hours', 'closed_dates', 'staff'],
  staff_members: ['id', 'job', 'employment', 'hired_on', 'left_on'],
  staff_pay: ['month', 'staff_id', 'amounts', 'incentives', 'adjust'],
  staff_settings: ['pay_items'],
}
const KINDS = Object.keys(KIND_KEYS)
// 차례를 보는 열쇠(병원 다음)
const KIND_ORDER: Record<string, string | null> = {
  stats_days: 'day',
  stats_months: 'month',
  stats_day_totals: 'day',
  stats_coverage: 'from_day',
  stats_rx_groups: 'sort_order',
  stats_goals: 'month',
  sales_days: 'day',
  sales_code_totals: 'code',
  sales_codes: 'month',
  sunap_settings: null,
  sunap_days: 'work_date',
  calendar_settings: null,
  calendar_allday: 'day',
  calendar_counts: 'day',
  clinic_profiles: null,
  staff_members: 'id',
  staff_pay: 'month',
  staff_settings: null,
}
// 비교에 가면 안 되는 글자(환자·직원 개인정보와 payload 전체에만 있는 값)
const FORBIDDEN = ['가짜환자', '가짜메모', '김가짜', '01012345678', '1990-01-01', '가짜로 1', '가짜은행', '111-222-333', '가짜 직원 메모', '가짜사유', 'month-payload-only']

async function adminRows(kind: string, ids: readonly string[], from = FROM, to = TO) {
  return rows(`select hospital_id, "row" from public.admin_rows($1, $2::uuid[], $3, $4)`, [kind, uuids(ids), from, to])
}
const cmp = (a: unknown, b: unknown) => (typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), 'en'))

describe('AC-8003.3 비교 읽기 admin_rows', SLOW, () => {
  it.each(KINDS)('AC-8003.3: %s — 승인된 병원 줄만 (병원 id, 줄 jsonb)이고 열쇠는 design.md 표 칸뿐, 보내지 않은 병원·대기 병원 줄 없음', async (kind) => {
    await become(A)
    const found = await adminRows(kind, [HA, HB, HC])
    expect(new Set(found.map((r) => r.hospital_id))).toEqual(new Set([HA, HB]))
    for (const { row } of found) expect(Object.keys(row as Row).sort(), kind).toEqual([...KIND_KEYS[kind]].sort())
    for (const word of FORBIDDEN) expect(JSON.stringify(found), `${kind} ${word}`).not.toContain(word)
  })

  it.each(KINDS)('AC-8003.3: %s — 차례는 (병원, 날·달·id)로 정해져 있고 기간 밖 줄은 없다', async (kind) => {
    await become(A)
    const found = await adminRows(kind, [HB, HA, HD], '2026-10-01', TO)
    const order = KIND_ORDER[kind]
    const keyOf = (r: Row) => [String(r.hospital_id), order === null ? '' : (r.row as Row)[order]] as const
    const sorted = [...found].sort((x, y) => cmp(keyOf(x)[0], keyOf(y)[0]) || cmp(keyOf(x)[1], keyOf(y)[1]))
    expect(found).toEqual(sorted)
    expect(found[0].hospital_id).toBe(HA)
    // 좁은 기간(11월)에는 10월 줄이 없다
    const november = await adminRows(kind, [HA])
    for (const { row } of november) {
      const value = (row as Row)[order ?? ''] as string | undefined
      if (order !== null && /^\d{4}-\d{2}/.test(String(value)) && kind !== 'staff_members') expect(String(value) >= '2026-11', `${kind} ${value}`).toBe(true)
    }
  })

  it('AC-8003.3: calendar_counts에는 이름·차트번호·메모가 없고 숫자 칸만 온다', async () => {
    await become(A)
    const found = await adminRows('calendar_counts', [HB])
    expect(found).toEqual([
      { hospital_id: HB, row: { day: '2026-11-03', staff_id: 's1', staff_name: '김치료', kind_id: 'dosu', kind_name: '도수', status: 'auto', auto: null, orig_day: null } },
    ])
  })

  it('AC-8003.3: staff_members·staff_pay에는 이름·전화·생일·주소·계좌·메모가 없다', async () => {
    await become(A)
    expect(await adminRows('staff_members', [HB])).toEqual([
      { hospital_id: HB, row: { id: rid(15, B), job: '물리치료사', employment: 'regular', hired_on: '2025-01-01', left_on: null } },
    ])
    expect(await adminRows('staff_pay', [HB])).toEqual([
      { hospital_id: HB, row: { month: MONTH, staff_id: rid(15, B), amounts: { base: 5000000 }, incentives: [], adjust: 0 } },
    ])
  })

  it('AC-8003.3: stats_months는 payload 전체가 아니라 rx·groups·dropoff(없으면 null)·sections만, stats_day_totals는 totals만이다', async () => {
    await become(A)
    expect(await adminRows('stats_months', [HB])).toEqual([
      {
        hospital_id: HB,
        row: { month: MONTH, partial: false, rx: { MM301: { patients: 6 } }, groups: { g1: 2 }, dropoff: null, sections: { v: 1, month: MONTH, partial: false, mix: { age: [2] } } },
      },
    ])
    expect((await adminRows('stats_months', [HA]))[0].row).toMatchObject({ dropoff: { asOf: '2026-11-20', lines: [] } })
    expect(await adminRows('stats_day_totals', [HB])).toEqual([{ hospital_id: HB, row: { day: DAY, partial: false, totals: { visits: 20 } } }])
    // stats_days는 날 줄 그대로(payload 포함 — 통계 탭과 같은 검사를 쓰려고)
    expect((await adminRows('stats_days', [HB]))[0].row).toMatchObject({ day: DAY, partial: false, source: 'bit', payload: { schemaVersion: 2, day: DAY, totals: { visits: 20 } } })
  })

  it('AC-8003.3: sales_code_totals는 sales_code_totals 함수와 같은 합(건수 합·금액 합·금액 빠짐)을 병원마다 준다', async () => {
    await become(A)
    const own = await rows(`select * from public.sales_code_totals($1, $2)`, [FROM, TO])
    expect(own).toEqual([{ code: 'MM301', count: 3, amount: 2000, missing: true }])
    expect(await adminRows('sales_code_totals', [HA, HB])).toEqual([
      { hospital_id: HA, row: { code: 'MM301', count: 3, amount: 2000, missing: true } },
      { hospital_id: HB, row: { code: 'MM302', count: 5, amount: 5000, missing: false } },
    ])
  })

  it('AC-8003.3: 설정·병원 정보 줄은 기간과 상관없이 병원마다 한 줄이다', async () => {
    await become(A)
    for (const kind of ['sunap_settings', 'calendar_settings', 'clinic_profiles', 'staff_settings', 'stats_rx_groups']) {
      const found = await adminRows(kind, [HA, HB], '2020-01-01', '2020-01-02')
      expect(found.filter((r) => r.hospital_id === HB).length, kind).toBe(kind === 'stats_rx_groups' ? 2 : 1)
    }
    expect((await adminRows('clinic_profiles', [HB]))[0].row).toMatchObject({ display_name: '나다정형외과', honorific: '원장님' })
  })
})

describe('AC-8003.4 비교 읽기 거부', SLOW, () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => rid(200 + i, A))

  it.each([
    ['관리자 아닌 원장 B', B],
    ['데스크 K', K],
    ['대기 병원 주인 C', C],
    ['병원 줄 없는 사용자 E', E],
  ])('AC-8003.4: %s는 42501이다(인자가 틀려도 먼저)', async (_label, user) => {
    for (const [kind, ids] of [
      ['stats_days', [HB]],
      ['nope', []],
      [null, null],
    ] as [string | null, string[] | null][]) {
      await become(user)
      await expect(
        rows(`select * from public.admin_rows($1, $2::uuid[], $3, $4)`, [kind, ids === null ? null : uuids(ids), FROM, TO]),
      ).rejects.toMatchObject(DENIED)
    }
  })

  it('AC-8003.4: anon은 42501이다', async () => {
    await becomeAnon()
    await expect(adminRows('stats_days', [HB])).rejects.toMatchObject(DENIED)
  })

  const rejects: [string, unknown[]][] = [
    ['모르는 종류', ['nope', uuids([HB]), FROM, TO]],
    ['종류 null', [null, uuids([HB]), FROM, TO]],
    ['병원 null', ['stats_days', null, FROM, TO]],
    ['시작 null', ['stats_days', uuids([HB]), null, TO]],
    ['끝 null', ['stats_days', uuids([HB]), FROM, null]],
    ['병원 0개', ['stats_days', '{}', FROM, TO]],
    ['병원 31개', ['stats_days', uuids(many(31)), FROM, TO]],
    ['시작이 끝보다 뒤', ['stats_days', uuids([HB]), TO, FROM]],
    ['기간 401일', ['stats_days', uuids([HB]), '2025-11-01', '2026-12-06']],
  ]
  it.each(rejects)('AC-8003.4: %s → 22023(보는 중에도 같다)', async (_label, params) => {
    await become(A)
    await expect(rows(`select * from public.admin_rows($1, $2::uuid[], $3, $4)`, params)).rejects.toMatchObject(BAD)
    const key = await startView(A, B)
    await become(A, viewHeader(key))
    await expect(rows(`select * from public.admin_rows($1, $2::uuid[], $3, $4)`, params)).rejects.toMatchObject(BAD)
  })

  it('AC-8003.4: 병원 30개·기간 400일(끝 − 시작 = 399)은 되고, 보는 중(머리 K)에도 답이 같다', async () => {
    await become(A)
    await expect(adminRows('stats_days', [...many(28), HA, HB])).resolves.toBeDefined()
    expect(await adminRows('stats_days', [HB], '2025-11-01', '2026-12-05')).toHaveLength(1)
    const plain = await Promise.all(KINDS.map((kind) => adminRows(kind, [HA, HB])))
    const key = await startView(A, B)
    await become(A, viewHeader(key))
    const viewing = await Promise.all(KINDS.map((kind) => adminRows(kind, [HA, HB])))
    expect(viewing).toEqual(plain)
  })
})

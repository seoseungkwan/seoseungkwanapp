import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

// 직원 탭 DB: 열 표·칸 권한·RLS·제약·휴가 → 예약 '휴무' 트리거·직원 파일 바구니 staff-files
// (staff REQ-7601·REQ-7602·REQ-7603, design.md 1절·2절, ADR-035).
// clinicEmr.rls.test.ts와 같은 방법: 진짜 Postgres(PGlite, WASM)에서 운영자가 붙일 migration 파일을 차례로
// (… desk_accounts → clinic_profile → clinic_emr → hospital_emr → 이 파일 → 이 파일 다시) 그대로 돌린다. 실제 Supabase에는 붙지 않는다.
// Supabase가 미리 갖춘 것(역할·auth·storage)만 흉내 낸다. 사람·메일·전화·주소·계좌는 모두 지어낸 것이다
const fileOf = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))
const read = (rel: string) => readFileSync(fileOf(rel), 'utf-8')
// 앞 migration: 운영 DB에 이미 들어간 차례(hospitalEmr.rls.test.ts의 CHAIN 뒤에 가입 EMR)
const CHAIN = [
  '20261028000000_auth.sql',
  '20261030000000_precheck_settings.sql',
  '20261101000100_worklog.sql',
  '20261101000110_worklog_bit_fields.sql',
  '20261105000200_worklog_memo_font.sql',
  '20261105000300_worklog_cash_float.sql',
  '20261105000100_stats_rx_groups.sql',
  '20261112000000_stats_rx_groups_exclude.sql',
  '20261116000000_sunap.sql',
  '20261117010000_calendar.sql',
  '20261118100000_desk_accounts.sql',
  '20261119000000_clinic_profile.sql',
  '20261119300000_clinic_emr.sql',
  '20261119400000_hospital_emr.sql',
].map((name) => read(`./migrations/${name}`))
const CALENDAR_MIGRATION = read('./migrations/20261117010000_calendar.sql')
const PROFILE_MIGRATION = read('./migrations/20261119000000_clinic_profile.sql')
const STAFF_PATH = fileOf('./migrations/20261121000000_staff.sql')
// 파일이 아직 없으면 빈 글자로 돌아, 시험마다 '표가 없다'로 실패한다(무엇이 빠졌는지 시험별로 보인다)
const STAFF_MIGRATION = existsSync(STAFF_PATH) ? readFileSync(STAFF_PATH, 'utf-8') : ''
// 주석을 뺀 SQL 글자, 그리고 함수·DO 몸통($$ … $$)까지 뺀 글자(맨 위 문장만 본다)
const STAFF_SQL = STAFF_MIGRATION.split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n')
const STAFF_TOP = STAFF_SQL.replace(/\$\$[\s\S]*?\$\$/g, "''")

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

// Supabase Storage가 갖춘 것(clinicProfile.rls.test.ts와 같은 흉내): 바구니 표·파일 표(RLS 켜짐, 표 권한 있음)·foldername()
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
  -- 다른 기능의 바구니(이 파일의 정책이 여기에는 아무것도 열지 않는지 보려고)
  insert into storage.buckets (id, name) values ('other-bucket', 'other-bucket');
`

const A = '00000000-0000-4000-8000-00000000000a' // 승인된 병원 A 원장
const B = '00000000-0000-4000-8000-00000000000b' // 승인된 다른 병원 B 원장
const C = '00000000-0000-4000-8000-00000000000c' // 승인 대기
const D = '00000000-0000-4000-8000-00000000000d' // 거절
const E = '00000000-0000-4000-8000-00000000000e' // 병원 줄도 데스크 줄도 없는 사용자
const K = '00000000-0000-4000-8000-0000000000d1' // A의 데스크(병원 줄 없음)
const STATUS: Record<string, 'approved' | 'pending' | 'rejected' | null> = {
  [A]: 'approved',
  [B]: 'approved',
  [C]: 'pending',
  [D]: 'rejected',
  [E]: null,
  [K]: null,
}
const DESK_EMAIL: Record<string, string> = { [K]: 'desk-a@fake.test' }
const emailOf = (user: string) => DESK_EMAIL[user] ?? `${user.slice(-1)}@fake.test`

type Row = Record<string, unknown>

const TABLES = [
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
] as const
type Table = (typeof TABLES)[number]
// 직원 id를 가리키는 자식 표(직원 id + 병원 id 외래 키)
const CHILD_TABLES = [
  'staff_week_plans',
  'staff_day_changes',
  'staff_overtime',
  'staff_leaves',
  'staff_incentive_rules',
  'staff_pay_lines',
  'staff_files',
] as const satisfies readonly Table[]
const t = (table: string) => `public.${table}`
const MEMBERS = t('staff_members')
const LEAVES = t('staff_leaves')
const FILES = t('staff_files')
const ALLDAY = 'public.calendar_allday'
const PROFILES = 'public.clinic_profiles'

// 표마다 칸과 형(차례 그대로). 주민번호 칸은 어디에도 없다
const COLUMNS: Record<Table, [string, string][]> = {
  staff_members: [
    ['id', 'uuid'],
    ['hospital_id', 'uuid'],
    ['name', 'text'],
    ['job', 'text'],
    ['job_other', 'text'],
    ['employment', 'text'],
    ['weekly_hours', 'numeric'],
    ['hired_on', 'date'],
    ['left_on', 'date'],
    ['phone', 'text'],
    ['birthday', 'date'],
    ['address', 'text'],
    ['bank', 'text'],
    ['account_no', 'text'],
    ['calendar_staff_id', 'text'],
    ['memo', 'text'],
    ['used_before', 'numeric'],
    ['used_before_from', 'date'],
    ['carry_start', 'numeric'],
    ['registered_on', 'date'],
    ['created_at', 'timestamptz'],
    ['updated_at', 'timestamptz'],
  ],
  staff_week_plans: [
    ['id', 'uuid'],
    ['hospital_id', 'uuid'],
    ['staff_id', 'uuid'],
    ['from_day', 'date'],
    ['week', 'jsonb'],
    ['sat_rotation', 'text'],
  ],
  staff_day_changes: [
    ['id', 'uuid'],
    ['hospital_id', 'uuid'],
    ['staff_id', 'uuid'],
    ['day', 'date'],
    ['start_min', 'int2'],
    ['end_min', 'int2'],
    ['lunch_from', 'int2'],
    ['lunch_to', 'int2'],
    ['memo', 'text'],
  ],
  staff_overtime: [
    ['id', 'uuid'],
    ['hospital_id', 'uuid'],
    ['staff_id', 'uuid'],
    ['day', 'date'],
    ['kind', 'text'],
    ['minutes', 'int2'],
  ],
  staff_leaves: [
    ['id', 'uuid'],
    ['hospital_id', 'uuid'],
    ['group_id', 'uuid'],
    ['staff_id', 'uuid'],
    ['day', 'date'],
    ['kind', 'text'],
    ['part', 'text'],
    ['paid', 'bool'],
    ['memo', 'text'],
  ],
  staff_settings: [
    ['hospital_id', 'uuid'],
    ['leave_basis', 'text'],
    ['leftover', 'text'],
    ['pay_items', 'jsonb'],
    ['updated_at', 'timestamptz'],
  ],
  staff_incentive_rules: [
    ['id', 'uuid'],
    ['hospital_id', 'uuid'],
    ['staff_id', 'uuid'],
    ['name', 'text'],
    ['method', 'text'],
    ['unit_amount', 'int8'],
    ['percent', 'numeric'],
    ['sort', 'int4'],
  ],
  staff_pay_lines: [
    ['id', 'uuid'],
    ['hospital_id', 'uuid'],
    ['month', 'text'],
    ['staff_id', 'uuid'],
    ['amounts', 'jsonb'],
    ['incentives', 'jsonb'],
    ['adjust', 'int8'],
    ['adjust_reason', 'text'],
    ['adjust_memo', 'text'],
    ['updated_at', 'timestamptz'],
  ],
  staff_pay_months: [
    ['hospital_id', 'uuid'],
    ['month', 'text'],
    ['employer_cost', 'int8'],
    ['cost_saved_on', 'date'],
    ['copied_on', 'date'],
  ],
  staff_files: [
    ['id', 'uuid'],
    ['hospital_id', 'uuid'],
    ['kind', 'text'],
    ['staff_id', 'uuid'],
    ['month', 'text'],
    ['name', 'text'],
    ['path', 'text'],
    ['size', 'int4'],
    ['mime', 'text'],
    ['created_at', 'timestamptz'],
  ],
}

const MEMBER_COLUMNS = [
  'name',
  'job',
  'job_other',
  'employment',
  'weekly_hours',
  'hired_on',
  'left_on',
  'phone',
  'birthday',
  'address',
  'bank',
  'account_no',
  'calendar_staff_id',
  'memo',
  'used_before',
  'used_before_from',
  'carry_start',
]
// authenticated 권한: 표 단위(select·delete)와 칸 단위(넣기·고치기). id·hospital_id·created_at·updated_at과 직원 registered_on은 칸 권한 없음.
// design.md 1절 권한 표 그대로: 기본 근무·바뀐 날·더 일한 시간·급여 줄·달 줄의 열쇠 칸(직원·시작일·날·종류·달)에는 고치기 권한이 없다 —
// 앱은 upsert를 쓰지 않고 '고치고, 없으면 넣기'(값 칸만 update, 없으면 열쇠와 함께 insert)로 저장한다(design.md 5절)
const GRANTS: Record<Table, { table: string[]; insert: string[]; update: string[] }> = {
  staff_members: { table: ['DELETE', 'SELECT'], insert: MEMBER_COLUMNS, update: MEMBER_COLUMNS },
  staff_week_plans: {
    table: ['DELETE', 'SELECT'],
    insert: ['staff_id', 'from_day', 'week', 'sat_rotation'],
    update: ['week', 'sat_rotation'],
  },
  staff_day_changes: {
    table: ['DELETE', 'SELECT'],
    insert: ['staff_id', 'day', 'start_min', 'end_min', 'lunch_from', 'lunch_to', 'memo'],
    update: ['start_min', 'end_min', 'lunch_from', 'lunch_to', 'memo'],
  },
  staff_overtime: {
    table: ['DELETE', 'SELECT'],
    insert: ['staff_id', 'day', 'kind', 'minutes'],
    update: ['minutes'],
  },
  staff_leaves: { table: ['DELETE', 'SELECT'], insert: ['group_id', 'staff_id', 'day', 'kind', 'part', 'paid', 'memo'], update: [] },
  staff_settings: { table: ['SELECT'], insert: ['leave_basis', 'leftover', 'pay_items'], update: ['leave_basis', 'leftover', 'pay_items'] },
  staff_incentive_rules: {
    table: ['DELETE', 'SELECT'],
    insert: ['staff_id', 'name', 'method', 'unit_amount', 'percent', 'sort'],
    update: ['name', 'method', 'unit_amount', 'percent', 'sort'],
  },
  staff_pay_lines: {
    table: ['SELECT'],
    insert: ['month', 'staff_id', 'amounts', 'incentives', 'adjust', 'adjust_reason', 'adjust_memo'],
    update: ['amounts', 'incentives', 'adjust', 'adjust_reason', 'adjust_memo'],
  },
  staff_pay_months: {
    table: ['SELECT'],
    insert: ['month', 'employer_cost', 'cost_saved_on', 'copied_on'],
    update: ['employer_cost', 'cost_saved_on', 'copied_on'],
  },
  staff_files: { table: ['DELETE', 'SELECT'], insert: ['kind', 'staff_id', 'month', 'name', 'path', 'size', 'mime'], update: [] },
}
// 원장이 고칠 수 있는 칸 하나(고치기 권한이 없는 표는 null)·아무 칸(권한 없음 시험용)
const UPDATE_SET: Record<Table, string | null> = {
  staff_members: "memo = '고침'",
  staff_week_plans: "sat_rotation = '1-3'",
  staff_day_changes: "memo = '고침'",
  staff_overtime: 'minutes = 90',
  staff_leaves: null,
  staff_settings: "leftover = 'pay'",
  staff_incentive_rules: 'sort = 1',
  staff_pay_lines: 'adjust = 1000',
  staff_pay_months: 'employer_cost = 1',
  staff_files: null,
}
const ANY_SET: Record<Table, string> = { ...(UPDATE_SET as Record<Table, string>), staff_leaves: 'memo = memo', staff_files: 'name = name' }
const DELETABLE = new Set<Table>(['staff_members', 'staff_week_plans', 'staff_day_changes', 'staff_overtime', 'staff_leaves', 'staff_incentive_rules', 'staff_files'])

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const XLS = 'application/vnd.ms-excel'
const DOC_MIMES = ['application/pdf', 'image/jpeg', 'image/png']
const TAX_MIMES = ['application/pdf', 'application/zip', XLSX, XLS, 'image/jpeg', 'image/png']
const BUCKET = 'staff-files'
const OTHER_BUCKET = 'other-bucket'

const item = (id: string, name: string, kind = 'amount') => ({ id, name, kind, base: true, removedFrom: null })
const DEFAULT_PAY_ITEMS = [
  item('base', '기본급'),
  item('overtime', '연장수당'),
  item('meal', '식대'),
  item('incentive', '인센티브', 'incentive'),
  item('bonus', '상여'),
]

// 지어낸 병원 정보(진료시간은 분, 월(0)~일(6), null = 휴진)와 예약 시행자
const WEEKDAY = { open: 540, close: 1080, lunchFrom: 780, lunchTo: 840 }
const HOURS = [WEEKDAY, WEEKDAY, WEEKDAY, WEEKDAY, WEEKDAY, { open: 540, close: 780, lunchFrom: null, lunchTo: null }, null]
const PROFILE_STAFF = [
  { id: 'st-ga', name: '가원장', role: 'doctor', mark: '가', color: 'teal', calendar: true },
  { id: 'st-na', name: '나치료사', role: 'staff', mark: '나', color: 'pink', calendar: true },
  { id: 'st-da', name: '다치료사', role: 'staff', mark: '다', color: 'lime', calendar: true },
  { id: 'st-long', name: '가나다라마바사아자차카', role: 'staff', mark: '가', color: 'teal', calendar: true }, // 11자
]

const SHIFT = { start: 540, end: 1080, lunchFrom: 780, lunchTo: 840 }
const WEEK = [SHIFT, SHIFT, SHIFT, SHIFT, SHIFT, { start: 540, end: 780, lunchFrom: null, lunchTo: null }, null]
const GROUP = '00000000-0000-4000-8000-0000000000e1'
const MEMBER: Row = {
  name: '김하늘',
  job: '물리치료사',
  job_other: null,
  employment: 'regular',
  weekly_hours: 40,
  hired_on: '2021-03-02',
  left_on: null,
  phone: '01012345678',
  birthday: '1995-04-10',
  address: '서울시 가짜구 가짜로 2',
  bank: '가짜은행',
  account_no: '110-123-456789',
  calendar_staff_id: null,
  memo: '지어낸 사람',
  used_before: 0,
  used_before_from: null,
}
const SETTINGS: Row = { leave_basis: 'jan1', leftover: 'carry', pay_items: DEFAULT_PAY_ITEMS }
const PAY_MONTH: Row = { month: '2026-11', employer_cost: 2_150_000, cost_saved_on: '2026-11-21', copied_on: null }
const BODY: Record<Exclude<Table, 'staff_files'>, (staff: string) => Row> = {
  staff_members: () => MEMBER,
  staff_week_plans: (staff) => ({ staff_id: staff, from_day: '2026-01-01', week: WEEK, sat_rotation: 'every' }),
  staff_day_changes: (staff) => ({ staff_id: staff, day: '2026-11-10', start_min: 540, end_min: 1080, lunch_from: 780, lunch_to: 840, memo: '야간 진료' }),
  staff_overtime: (staff) => ({ staff_id: staff, day: '2026-11-10', kind: 'night', minutes: 60 }),
  staff_leaves: (staff) => ({ group_id: GROUP, staff_id: staff, day: '2026-11-07', kind: 'annual', part: null, paid: true, memo: null }),
  staff_settings: () => SETTINGS,
  staff_incentive_rules: (staff) => ({ staff_id: staff, name: '도수 건당', method: 'per_case', unit_amount: 5000, percent: null, sort: 0 }),
  staff_pay_lines: (staff) => ({
    month: '2026-11',
    staff_id: staff,
    amounts: { base: 3_000_000, meal: 200_000 },
    incentives: [],
    adjust: 0,
    adjust_reason: null,
    adjust_memo: null,
  }),
  staff_pay_months: () => PAY_MONTH,
}
const docFile = (h: string, staff: string, ext = 'pdf', mime = 'application/pdf'): Row => ({
  kind: 'doc',
  staff_id: staff,
  month: null,
  name: `근로계약서.${ext}`,
  path: `${h}/doc/${staff}/${randomUUID()}.${ext}`,
  size: 1000,
  mime,
})
const taxFile = (h: string, month = '2026-11', ext = 'xlsx', mime = XLSX): Row => ({
  kind: 'tax',
  staff_id: null,
  month,
  name: `급여자료.${ext}`,
  path: `${h}/tax/${month}/${randomUUID()}.${ext}`,
  size: 2000,
  mime,
})
const bodyOf = (table: Table, h: string, staff: string): Row => (table === 'staff_files' ? docFile(h, staff) : BODY[table](staff))

const SLOW = { timeout: 60_000 }
const DENIED = { code: '42501' } // 권한 없음
const CHECK_FAILED = { code: '23514' }
const NOT_NULL = { code: '23502' }
const UNIQUE = { code: '23505' }
const FK_FAILED = { code: '23503' }
const RLS_REJECTED = /row-level security/
const RLS_OR_NULL = /row-level security|null value/

let db: PGlite
let hospital: Record<string, string> = {}

async function migrateChain(target: PGlite) {
  await target.exec(SUPABASE_MOCK)
  await target.exec(STORAGE_MOCK)
  for (const sql of CHAIN) await target.exec(sql)
}

async function operator(target: PGlite = db) {
  await target.exec('reset role; reset request.jwt.claims')
}

/** 그 사용자로 로그인한 것처럼(JWT의 sub·email) */
async function become(user: string, target: PGlite = db) {
  await operator(target)
  await target.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: user, email: emailOf(user) })])
  await target.exec('set role authenticated')
}

async function becomeAnon() {
  await operator()
  await db.exec('set role anon')
}

async function rows(sql: string, params: unknown[] = [], target: PGlite = db) {
  return (await target.query<Row>(sql, params)).rows
}

/** 사용자·병원·데스크 줄을 넣고 병원 id를 돌려준다(운영자) */
async function seedPeople(target: PGlite) {
  await operator(target)
  const ids: Record<string, string> = {}
  for (const [user, status] of Object.entries(STATUS)) {
    await target.query('insert into auth.users (id, email) values ($1, $2)', [user, emailOf(user)])
    if (status === null) continue
    const [row] = await rows(
      `insert into public.hospitals (owner_id, name, applicant_name, email, status) values ($1, $2, '홍길동', $3, $4) returning id`,
      [user, `가짜병원${user.slice(-1)}`, emailOf(user), status],
      target,
    )
    ids[user] = row.id as string
  }
  await target.query(`insert into public.hospital_members (hospital_id, email) values ($1, $2)`, [ids[A], emailOf(K)])
  return ids
}

// 시험마다 빈 표에서 시작한다(병원·데스크·직원·예약 줄은 auth.users를 따라 함께 비워진다). 운영자(superuser)는 RLS를 건너뛴다
async function resetData() {
  await operator()
  await db.exec('truncate auth.users cascade')
  await db.exec('truncate storage.objects')
  hospital = await seedPeople(db)
}

// PostgREST insert·upsert와 같은 모양: json 줄을 표 모양으로 풀어 보낸 칸만 넣고, upsert는 겹치면 보낸 칸을 모두 SET에 쓴다
function postgrestInsert(table: string, body: Row[], conflict: string | null = null, target: PGlite = db, returning = '') {
  const columns = Object.keys(body[0] ?? {})
  const list = columns.join(', ')
  const onConflict = conflict === null ? '' : `on conflict (${conflict}) do update set ${columns.map((c) => `${c} = excluded.${c}`).join(', ')}`
  const back = returning === '' ? '' : `returning ${returning}`
  return target.query<Row>(
    `insert into ${table} (${list}) select ${list} from json_populate_recordset(null::${table}, $1::json) ${onConflict} ${back}`,
    [JSON.stringify(body)],
  )
}

// PostgREST update와 같은 모양: json 한 줄을 표 모양으로 풀어 보낸 칸만 SET에 쓰고, 거르기(eq)는 그 칸 = 값. 고친 줄을 돌려준다
function postgrestUpdate(table: string, values: Row, filters: Row, target: PGlite = db) {
  const set = Object.keys(values)
    .map((c) => `${c} = body.${c}`)
    .join(', ')
  const keys = Object.keys(filters)
  const where = keys.map((c, i) => `x.${c} = $${i + 2}`).join(' and ')
  return target.query<Row>(`update ${table} x set ${set} from json_populate_record(null::${table}, $1::json) body where ${where} returning to_jsonb(x) as r`, [
    JSON.stringify(values),
    ...keys.map((c) => filters[c]),
  ])
}

// 열쇠 줄 저장 표(design.md 5절): 열쇠 칸·PostgREST upsert onConflict·고칠 값·열쇠 칸을 바꾸는 SET(다른 직원으로 바꾸기는 시험에서 더함)
const KEYED: { table: Exclude<Table, 'staff_files'>; key: string[]; conflict: string; change: Row; keySets: string[] }[] = [
  { table: 'staff_week_plans', key: ['staff_id', 'from_day'], conflict: 'staff_id, from_day', change: { sat_rotation: '2-4' }, keySets: ["from_day = '2026-02-01'"] },
  {
    table: 'staff_day_changes',
    key: ['staff_id', 'day'],
    conflict: 'staff_id, day',
    change: { start_min: null, end_min: null, lunch_from: null, lunch_to: null, memo: '쉼' },
    keySets: ["day = '2026-11-11'"],
  },
  {
    table: 'staff_overtime',
    key: ['staff_id', 'day', 'kind'],
    conflict: 'staff_id, day, kind',
    change: { minutes: 90 },
    keySets: ["day = '2026-11-11'", "kind = 'extended'"],
  },
  {
    table: 'staff_pay_lines',
    key: ['month', 'staff_id'],
    conflict: 'hospital_id, month, staff_id',
    change: { adjust: -5000, adjust_reason: 'deduct' },
    keySets: ["month = '2026-12'", 'staff_id = null'],
  },
  { table: 'staff_pay_months', key: ['month'], conflict: 'hospital_id, month', change: { employer_cost: 0 }, keySets: ["month = '2026-12'"] },
]
const pick = (row: Row, columns: string[]) => Object.fromEntries(Object.entries(row).filter(([c]) => columns.includes(c)))
const omit = (row: Row, columns: string[]) => Object.fromEntries(Object.entries(row).filter(([c]) => !columns.includes(c)))

/** 지금 역할로 한 줄 넣고 그 줄을 돌려준다 */
async function insertAs(table: string, body: Row, target: PGlite = db) {
  return (await postgrestInsert(table, [body], null, target, '*')).rows[0]
}

/** 운영자가 그 병원 줄을 넣는다(RLS·칸 권한을 건너뛴다) */
async function seedRow(table: Table, h: string, body: Row, target: PGlite = db) {
  await operator(target)
  return (await postgrestInsert(t(table), [{ hospital_id: h, ...body }], null, target, '*')).rows[0]
}

/** 그 병원에 직원 한 사람과 열 표 줄을 하나씩 넣고 직원 id를 돌려준다(운영자) */
async function seedAll(h: string, member: Row = {}, target: PGlite = db) {
  const staff = (await seedRow('staff_members', h, { ...MEMBER, ...member }, target)).id as string
  for (const table of TABLES) if (table !== 'staff_members') await seedRow(table, h, bodyOf(table, h, staff), target)
  return staff
}

/** 운영자가 그 병원 병원 정보 줄(예약 시행자 목록)을 넣는다 */
async function seedProfile(h: string, staff: unknown[] = PROFILE_STAFF, target: PGlite = db) {
  await operator(target)
  await postgrestInsert(PROFILES, [{ hospital_id: h, hours: HOURS, staff }], null, target)
}

/** 운영자 눈으로 본 직원 표 열 개와 종일 줄 전체(줄 차례와 상관없이 견준다) */
async function everything(target: PGlite = db) {
  await operator(target)
  const out: Record<string, unknown[]> = {}
  for (const table of [...TABLES, 'calendar_allday']) {
    out[table] = (await rows(`select to_jsonb(x) as r from public.${table} x order by (to_jsonb(x))::text`, [], target)).map((r) => r.r)
  }
  return out
}

/** 운영자 눈으로 본 표마다 병원별 줄 수 */
async function countsByHospital() {
  await operator()
  const out: Record<string, Record<string, number>> = {}
  for (const table of TABLES) {
    const found = await rows(`select hospital_id, count(*)::int as n from public.${table} group by 1`)
    out[table] = Object.fromEntries(found.map((r) => [r.hospital_id as string, r.n as number]))
  }
  return out
}

/** 운영자 눈으로 본 그 병원 종일 줄 */
async function alldayOf(h: string, target: PGlite = db) {
  await operator(target)
  return rows(
    `select day::text as day, type, memo, staff_id, staff_name, part, leave_id from ${ALLDAY} where hospital_id = $1 order by day, staff_id, type`,
    [h],
    target,
  )
}

/** 운영자가 손으로 넣은 휴무 줄(예약 탭에서 넣은 것과 같은 칸) */
async function seedHandOff(h: string, day: string, staffId: string, staffName: string) {
  await operator()
  return (
    await rows(`insert into ${ALLDAY} (hospital_id, day, type, staff_id, staff_name) values ($1, $2, 'off', $3, $4) returning id`, [
      h,
      day,
      staffId,
      staffName,
    ])
  )[0].id as string
}

/** 운영자 눈으로 본 그 병원 rev(줄 없으면 0) */
async function revOf(h: string) {
  await operator()
  const found = await rows(`select rev::int as rev from public.calendar_rev where hospital_id = $1`, [h])
  return found.length === 0 ? 0 : (found[0].rev as number)
}

/** 한국 날짜 오늘(DB 시계) */
async function koreaToday() {
  await operator()
  return (await rows(`select (now() at time zone 'Asia/Seoul')::date::text as d`))[0].d as string
}

/** 날짜 + 기간(예 '-1 year', '7 days') */
async function shiftDay(day: string, by: string) {
  await operator()
  return (await rows(`select ($1::date + $2::interval)::date::text as d`, [day, by]))[0].d as string
}

async function objects() {
  await operator()
  return rows(`select bucket_id, name from storage.objects order by bucket_id, name`)
}

// 운영자가 파일 줄을 넣는다(Storage API가 하는 일을 흉내, 정책을 건너뛴다)
async function seedObject(name: string, bucket = BUCKET) {
  await operator()
  await rows(`insert into storage.objects (bucket_id, name) values ($1, $2)`, [bucket, name])
}

// 지금 역할로 파일을 올린다(Storage API의 upload, upsert 없음)
const upload = (name: string, bucket = BUCKET) =>
  rows(`insert into storage.objects (bucket_id, name) values ($1, $2) returning bucket_id, name`, [bucket, name])

/** 그 값이 jsonb 글자로 꼭 bytes가 되게 늘린다(pad 글자 수를 DB에 물어 맞춘다) */
async function jsonOfBytes(make: (pad: number) => unknown, bytes: number) {
  const size = async (value: unknown) => (await rows(`select octet_length($1::jsonb::text)::int as n`, [JSON.stringify(value)]))[0].n as number
  const made = make(bytes - (await size(make(0))))
  expect(await size(made)).toBe(bytes)
  return made
}

// 이 파일이 손댈 수 있는 것 전부: public 표의 칸·제약·색인·권한(표·칸)·트리거, 모든 정책, public 함수, 바구니
async function shapeOf(target: PGlite) {
  await operator(target)
  const q = (sql: string) => rows(sql, [], target)
  return {
    columns: await q(
      `select table_name, column_name, data_type, is_nullable, column_default from information_schema.columns
       where table_schema = 'public' order by 1, ordinal_position`,
    ),
    constraints: await q(
      `select conrelid::regclass::text as tbl, conname, pg_get_constraintdef(oid) as def from pg_constraint
       where connamespace = 'public'::regnamespace order by 1, 2`,
    ),
    indexes: await q(`select tablename, indexname, indexdef from pg_indexes where schemaname = 'public' order by 1, 2`),
    access: await q(
      `select c.relname, c.relrowsecurity, (select array_agg(item::text order by item::text) from unnest(c.relacl) item) as acl,
              (select array_agg(a.attname || ':' || coalesce(a.attacl::text, '') order by a.attnum) from pg_attribute a
                where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped) as columns
       from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v') order by 1`,
    ),
    policies: await q(
      `select schemaname, tablename, policyname, cmd, permissive, roles::text[] as roles, qual, with_check from pg_policies order by 1, 2, 3`,
    ),
    triggers: await q(
      `select tgrelid::regclass::text as tbl, tgname, pg_get_triggerdef(oid) as def from pg_trigger where not tgisinternal order by 1, 2`,
    ),
    functions: await q(
      `select p.oid::regprocedure::text as fn, pg_get_functiondef(p.oid) as def, p.prosecdef as definer, p.proconfig as config,
              (select array_agg(item::text order by item::text) from unnest(p.proacl) item) as acl
       from pg_proc p where p.pronamespace = 'public'::regnamespace order by 1`,
    ),
    buckets: await q(`select id, name, public, file_size_limit, allowed_mime_types from storage.buckets order by id`),
  }
}

beforeAll(async () => {
  db = await PGlite.create()
  await migrateChain(db)
  // 이 파일 → 이 파일 다시(두 번 실행해도 되는 모양으로 시험한다)
  await db.exec(STAFF_MIGRATION)
  await db.exec(STAFF_MIGRATION)
}, 240_000)

afterAll(async () => {
  await db.close()
})

beforeEach(resetData)

describe('AC-7601.1 파일·표·권한 모양', SLOW, () => {
  it('AC-7601.1: 파일이 있고 줄 끝이 LF이며, 머리 주석에 붙여 넣는 방법·앞 파일 차례·두 번 실행·관문·바구니 확인·REQ·ADR-035가 있다', () => {
    expect(STAFF_MIGRATION).not.toBe('')
    expect(STAFF_MIGRATION).not.toContain('\r')
    const lines = STAFF_MIGRATION.split('\n')
    const head = lines.slice(0, lines.findIndex((line) => !/^(--|\s*$)/.test(line))).join('\n')
    expect(head).toContain('운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다')
    const order = [
      '20261028000000_auth.sql',
      '20261030000000_precheck_settings.sql',
      '20261117010000_calendar.sql',
      '20261118100000_desk_accounts.sql',
      '20261119000000_clinic_profile.sql',
      '20261119300000_clinic_emr.sql',
      '20261119400000_hospital_emr.sql',
    ]
    for (const name of order) expect(head, name).toContain(name)
    const at = order.map((name) => head.indexOf(name))
    expect(at).toEqual([...at].sort((x, y) => x - y))
    expect(head).toMatch(/my_hospital_id\(\)·calendar_bump\(\)는 여기서 다시 만들지 않는다/)
    expect(head).toMatch(/두 번 붙여 넣어도/)
    expect(head).toMatch(/관문:[^\n]*먼저 붙여 넣고[^\n]*사이트에 올린다[^\n]*calendar_allday\.part/)
    expect(head).toMatch(/staff-files[^\n]*'Private'/)
    for (const word of ['REQ-7601', 'REQ-7602', 'REQ-7603', 'ADR-035', '주민번호']) expect(head, word).toContain(word)
  })

  it('AC-7601.1: 두 번 돌려도 되는 문장만 쓴다(표·색인 if not exists, 칸 if not exists, 함수·트리거 or replace, 정책 지우고 다시, 바구니 on conflict)', () => {
    const count = (pattern: RegExp) => (STAFF_TOP.match(pattern) ?? []).length
    expect(count(/create\s+table\s+if\s+not\s+exists\s+public\.staff_\w+/gi)).toBe(10)
    expect(STAFF_TOP).not.toMatch(/create\s+table\s+(?!if\s+not\s+exists)/i)
    expect(STAFF_TOP).not.toMatch(/create\s+(unique\s+)?index\s+(?!if\s+not\s+exists)/i)
    expect(STAFF_TOP).not.toMatch(/create\s+function/i)
    expect(count(/create\s+or\s+replace\s+function/gi)).toBe(4) // staff_touch·staff_files_limit·staff_leave_link·staff_member_relink
    expect(STAFF_TOP).not.toMatch(/create\s+(constraint\s+)?trigger/i)
    expect(count(/create\s+or\s+replace\s+trigger/gi)).toBe(6)
    expect(STAFF_TOP).not.toMatch(/add\s+column\s+(?!if\s+not\s+exists)/i)
    expect(count(/alter\s+table\s+public\.calendar_allday\s+add\s+column\s+if\s+not\s+exists/gi)).toBe(2)
    expect(STAFF_TOP).toMatch(/insert\s+into\s+storage\.buckets[\s\S]*?on\s+conflict\s+\(id\)\s+do\s+update/i)
    // 정책은 모두 바로 앞에서 같은 이름을 지운다
    const created = [...STAFF_TOP.matchAll(/create\s+policy\s+("[^"]+")\s+on\s+([\w.]+)/gi)]
    expect(created.length).toBeGreaterThanOrEqual(13)
    for (const [whole, name, table] of created) {
      const before = STAFF_TOP.slice(0, STAFF_TOP.indexOf(whole))
      expect(before, name).toMatch(new RegExp(`drop\\s+policy\\s+if\\s+exists\\s+${name}\\s+on\\s+${table.replace('.', '\\.')}\\s*;\\s*$`, 'i'))
    }
  })

  it('AC-7601.1: my_hospital_id()·calendar_bump()를 만들지 않고, 데스크 함수를 쓰지 않으며, 표마다 public·anon·authenticated 권한을 다 거둔 뒤에만 준다', () => {
    expect(STAFF_SQL).not.toMatch(/function\s+public\.my_hospital_id/i)
    expect(STAFF_SQL).not.toMatch(/function\s+public\.calendar_bump/i)
    expect(STAFF_SQL).not.toMatch(/my_desk_hospital_id|my_clinic_hospital_id/)
    for (const table of TABLES) {
      const revoke = STAFF_TOP.search(new RegExp(`revoke\\s+all\\s+on\\s+table\\s+public\\.${table}\\s+from\\s+public,\\s*anon,\\s*authenticated`, 'i'))
      const grant = STAFF_TOP.search(new RegExp(`grant\\s[^;]*\\son\\s+table\\s+public\\.${table}\\s`, 'i'))
      expect([table, revoke >= 0, grant > revoke]).toEqual([table, true, true])
    }
  })

  it('AC-7601.1: 열 표의 칸과 형이 design.md 1절 그대로이고, hospital_id 기본값은 my_hospital_id()다', async () => {
    for (const table of TABLES) {
      const found = await rows(
        `select column_name, udt_name, column_default from information_schema.columns where table_schema = 'public' and table_name = $1 order by ordinal_position`,
        [table],
      )
      expect([table, found.map((c) => [c.column_name, c.udt_name])]).toEqual([table, COLUMNS[table]])
      expect([table, found.find((c) => c.column_name === 'hospital_id')?.column_default]).toEqual([
        table,
        expect.stringMatching(/^(public\.)?my_hospital_id\(\)$/),
      ])
    }
    const numeric = await rows(
      `select table_name, column_name, numeric_precision, numeric_scale from information_schema.columns
       where table_schema = 'public' and table_name like 'staff\\_%' and udt_name = 'numeric' order by 1, 2`,
    )
    expect(numeric).toEqual([
      { table_name: 'staff_incentive_rules', column_name: 'percent', numeric_precision: 5, numeric_scale: 2 },
      { table_name: 'staff_members', column_name: 'carry_start', numeric_precision: 4, numeric_scale: 1 },
      { table_name: 'staff_members', column_name: 'used_before', numeric_precision: 3, numeric_scale: 1 },
      { table_name: 'staff_members', column_name: 'weekly_hours', numeric_precision: 4, numeric_scale: 1 },
    ])
  })

  it('AC-7601.4: 주민번호 칸은 어느 표에도 없다', async () => {
    expect(
      await rows(
        `select table_name, column_name from information_schema.columns
         where table_schema = 'public' and column_name ~* '(rrn|ssn|jumin|resident|registration|주민)'`,
      ),
    ).toEqual([])
  })

  it('AC-7601.1: 열 표 모두 RLS가 켜져 있고, anon·PUBLIC 권한은 없으며, authenticated 표 권한은 design.md 1절 그대로다', async () => {
    for (const table of TABLES) {
      expect([table, (await rows(`select relrowsecurity as on from pg_class where oid = to_regclass($1)`, [t(table)]))[0]?.on]).toEqual([table, true])
      const grants = await rows(
        `select grantee, privilege_type from information_schema.role_table_grants
         where table_schema = 'public' and table_name = $1 and grantee in ('anon', 'authenticated', 'PUBLIC') order by 1, 2`,
        [table],
      )
      expect([table, grants]).toEqual([table, GRANTS[table].table.map((privilege) => ({ grantee: 'authenticated', privilege_type: privilege }))])
      const anonColumns = await rows(
        `select column_name from information_schema.column_privileges where table_schema = 'public' and table_name = $1 and grantee in ('anon', 'PUBLIC')`,
        [table],
      )
      expect([table, anonColumns]).toEqual([table, []])
      for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']) {
        expect([table, privilege, (await rows(`select has_any_column_privilege('anon', $1, $2) as ok`, [t(table), privilege]))[0].ok]).toEqual([
          table,
          privilege,
          false,
        ])
      }
      for (const role of ['anon', 'authenticated']) {
        for (const privilege of ['TRUNCATE', 'TRIGGER', 'REFERENCES']) {
          expect([table, role, privilege, (await rows(`select has_table_privilege($1, $2, $3) as ok`, [role, t(table), privilege]))[0].ok]).toEqual([
            table,
            role,
            privilege,
            false,
          ])
        }
      }
    }
  })

  it('AC-7601.1: authenticated 넣기·고치기 칸이 정확히 정해 둔 칸이고 id·hospital_id·created_at·updated_at은 없다', async () => {
    for (const table of TABLES) {
      const found = await rows(
        `select column_name, privilege_type from information_schema.column_privileges
         where grantee = 'authenticated' and table_schema = 'public' and table_name = $1 and privilege_type in ('INSERT', 'UPDATE')`,
        [table],
      )
      const of = (privilege: string) =>
        found
          .filter((r) => r.privilege_type === privilege)
          .map((r) => r.column_name as string)
          .sort()
      expect([table, 'INSERT', of('INSERT')]).toEqual([table, 'INSERT', [...GRANTS[table].insert].sort()])
      expect([table, 'UPDATE', of('UPDATE')]).toEqual([table, 'UPDATE', [...GRANTS[table].update].sort()])
      for (const column of ['id', 'hospital_id', 'created_at', 'updated_at']) expect(of('INSERT').concat(of('UPDATE'))).not.toContain(column)
    }
  })

  it('AC-7601.2: 정책은 표마다 원장(my_hospital_id()) 하나이고(직원만 읽기·넣기·고치기·지우기 넷), 데스크 정책은 없다', async () => {
    const OWNER = /^\(hospital_id = \( SELECT (public\.)?my_hospital_id\(\) AS my_hospital_id\)\)$/
    const list = await rows(
      `select tablename, policyname, cmd, permissive, roles::text as roles, coalesce(qual, '') as qual, coalesce(with_check, '') as with_check
       from pg_policies where schemaname = 'public' and tablename like 'staff\\_%' order by tablename, cmd`,
    )
    for (const policy of list) expect(policy).toMatchObject({ permissive: 'PERMISSIVE', roles: '{authenticated}' })
    for (const policy of list) expect(`${policy.qual} ${policy.with_check}`).not.toMatch(/my_desk|my_clinic/)
    for (const table of TABLES.filter((x) => x !== 'staff_members')) {
      const own = list.filter((p) => p.tablename === table)
      expect([table, own.map((p) => p.cmd)]).toEqual([table, ['ALL']])
      expect(own[0]).toMatchObject({ qual: expect.stringMatching(OWNER), with_check: expect.stringMatching(OWNER) })
    }
    const members = list.filter((p) => p.tablename === 'staff_members')
    expect(members.map((p) => p.cmd)).toEqual(['DELETE', 'INSERT', 'SELECT', 'UPDATE'])
    const byCmd = Object.fromEntries(members.map((p) => [p.cmd, p]))
    expect(byCmd.SELECT).toMatchObject({ qual: expect.stringMatching(OWNER), with_check: '' })
    expect(byCmd.INSERT).toMatchObject({ qual: '', with_check: expect.stringMatching(OWNER) })
    expect(byCmd.UPDATE).toMatchObject({ qual: expect.stringMatching(OWNER), with_check: expect.stringMatching(OWNER) })
    expect(byCmd.DELETE.with_check).toBe('')
    for (const part of ['my_hospital_id()', 'left_on IS NOT NULL', "'3 years'::interval", "'Asia/Seoul'"]) expect(byCmd.DELETE.qual).toContain(part)
  })

  it('AC-7601.1: 함수 넷은 search_path 빔이고 누구도 바로 부르지 못한다(잇기 둘만 정의자 권한)', async () => {
    const found = await rows(
      `select proname, prosecdef as definer, proconfig as config, coalesce(array_to_string(proacl, ','), '') as acl from pg_proc
       where pronamespace = 'public'::regnamespace and proname in ('staff_touch', 'staff_files_limit', 'staff_leave_link', 'staff_member_relink')
       order by proname`,
    )
    expect(found.map((f) => [f.proname, f.definer, f.config])).toEqual([
      ['staff_files_limit', false, ['search_path=""']],
      ['staff_leave_link', true, ['search_path=""']],
      ['staff_member_relink', true, ['search_path=""']],
      ['staff_touch', false, ['search_path=""']],
    ])
    for (const fn of found) {
      expect(String(fn.acl)).not.toMatch(/(^|,)=/) // PUBLIC 몫 없음
      for (const role of ['anon', 'authenticated']) {
        expect([fn.proname, role, (await rows(`select has_function_privilege($1, $2, 'EXECUTE') as ok`, [role, `public.${fn.proname}()`]))[0].ok]).toEqual([
          fn.proname,
          role,
          false,
        ])
      }
    }
  })

  it('AC-7601.1: 트리거는 고칠 때 updated_at(직원·설정·급여 줄), 파일 20개 한도, 휴가 잇기, 연결 바꾸기 여섯이다', async () => {
    const found = await rows(
      `select tgrelid::regclass::text as tbl, tgname, pg_get_triggerdef(oid) as def from pg_trigger
       where not tgisinternal and tgrelid::regclass::text like '%staff\\_%' order by 1, 2`,
    )
    const fn = (name: string) => `EXECUTE FUNCTION (public\\.)?${name}\\(\\)$`
    expect(found.map((x) => [String(x.tbl).replace(/^public\./, ''), x.tgname])).toEqual([
      ['staff_files', 'staff_files_limit'],
      ['staff_leaves', 'staff_leave_link'],
      ['staff_members', 'staff_member_relink'],
      ['staff_members', 'staff_members_touch'],
      ['staff_pay_lines', 'staff_pay_lines_touch'],
      ['staff_settings', 'staff_settings_touch'],
    ])
    const def = Object.fromEntries(found.map((x) => [x.tgname, String(x.def)]))
    expect(def.staff_files_limit).toMatch(new RegExp(` BEFORE INSERT ON (public\\.)?staff_files FOR EACH ROW ${fn('staff_files_limit')}`))
    expect(def.staff_leave_link).toMatch(new RegExp(` AFTER INSERT ON (public\\.)?staff_leaves FOR EACH ROW ${fn('staff_leave_link')}`))
    expect(def.staff_member_relink).toMatch(
      new RegExp(
        ` AFTER UPDATE OF calendar_staff_id ON (public\\.)?staff_members FOR EACH ROW WHEN \\(\\(old\\.calendar_staff_id IS DISTINCT FROM new\\.calendar_staff_id\\)\\) ${fn('staff_member_relink')}`,
      ),
    )
    for (const table of ['staff_members', 'staff_settings', 'staff_pay_lines']) {
      expect(def[`${table}_touch`]).toMatch(new RegExp(` BEFORE UPDATE ON (public\\.)?${table} FOR EACH ROW ${fn('staff_touch')}`))
    }
  })

  it('AC-7601.1: 고치면 updated_at이 지금으로 바뀌고(직원·설정·급여 줄), 넣으면 created_at이 지금이다', async () => {
    const staff = (await seedRow('staff_members', hospital[A], MEMBER)).id as string
    await seedRow('staff_settings', hospital[A], SETTINGS)
    await seedRow('staff_pay_lines', hospital[A], BODY.staff_pay_lines(staff))
    await operator()
    for (const table of ['staff_members', 'staff_settings', 'staff_pay_lines']) await db.query(`update public.${table} set updated_at = '2020-01-01T00:00:00Z'`)
    expect(await rows(`select created_at > now() - interval '1 hour' as fresh from ${MEMBERS}`)).toEqual([{ fresh: true }])
    await become(A)
    for (const table of ['staff_members', 'staff_settings', 'staff_pay_lines']) {
      expect([table, (await db.query(`update public.${table} set ${UPDATE_SET[table as Table]}`)).affectedRows]).toEqual([table, 1])
    }
    await operator()
    for (const table of ['staff_members', 'staff_settings', 'staff_pay_lines']) {
      expect([table, await rows(`select updated_at > '2021-01-01' as fresh from public.${table}`)]).toEqual([table, [{ fresh: true }]])
    }
  })

  it('AC-7601.1: 앱 저장 모양(고치고, 없으면 넣기)이 기본 근무·바뀐 날·더 일한 시간·급여 줄·달 줄에서 돈다 — 값 칸 update·열쇠와 함께 insert가 되고, 같은 열쇠를 또 넣으면 겹침(23505)', async () => {
    const staff = (await seedRow('staff_members', hospital[A], MEMBER)).id as string
    for (const { table, key, change } of KEYED) {
      const row = BODY[table](staff)
      const filters = pick(row, key)
      const values = omit(row, key)
      // 처음: 그 열쇠 줄이 없어 고친 줄이 0이다 → 열쇠와 함께 넣는다
      await become(A)
      expect([table, (await postgrestUpdate(t(table), values, filters)).rows]).toEqual([table, []])
      await become(A)
      expect([table, (await insertAs(t(table), row)).hospital_id]).toEqual([table, hospital[A]])
      // 다시: 그 열쇠 줄의 값 칸만 고친다(한 줄)
      await become(A)
      const updated = (await postgrestUpdate(t(table), { ...values, ...change }, filters)).rows
      expect([table, updated.length]).toEqual([table, 1])
      expect(updated[0].r).toMatchObject({ hospital_id: hospital[A], ...filters, ...change })
      // 그새 다른 창이 넣은 열쇠면 넣기는 겹침(23505) — 앱은 한 번 더 고친다
      await become(A)
      await expect(postgrestInsert(t(table), [row]), table).rejects.toMatchObject(UNIQUE)
      await operator()
      const found = await rows(`select to_jsonb(x) as r from public.${table} x`)
      expect([table, found.length]).toEqual([table, 1])
      expect(found[0].r).toMatchObject({ hospital_id: hospital[A], ...filters, ...change })
    }
    // 설정만 upsert onConflict hospital_id: hospital_id를 보내지 않아(기본값 my_hospital_id()) 겹칠 때 SET은 값 세 칸뿐이다
    await become(A)
    await postgrestInsert(t('staff_settings'), [SETTINGS], 'hospital_id')
    await become(A)
    await postgrestInsert(t('staff_settings'), [{ ...SETTINGS, leftover: 'pay' }], 'hospital_id')
    await operator()
    expect(await rows(`select hospital_id, leave_basis, leftover from public.staff_settings`)).toEqual([
      { hospital_id: hospital[A], leave_basis: 'jan1', leftover: 'pay' },
    ])
  })

  it('AC-7601.1: 열쇠 칸(직원·시작일·날·종류·달)을 바꾸는 update와 열쇠 칸까지 SET하는 upsert는 원장도 권한 없음(42501)이고 줄은 그대로다', async () => {
    const staff = await seedAll(hospital[A])
    const other = (await seedRow('staff_members', hospital[A], { ...MEMBER, name: '이바다' })).id as string
    const before = await everything()
    for (const { table, key, conflict, keySets } of KEYED) {
      const sets = key.includes('staff_id') ? [...keySets, `staff_id = '${other}'`] : keySets
      for (const set of sets) {
        await become(A)
        await expect(db.query(`update public.${table} set ${set}`), `${table}: ${set}`).rejects.toMatchObject(DENIED)
      }
      await become(A)
      await expect(postgrestInsert(t(table), [BODY[table](staff)], conflict), `${table} upsert`).rejects.toMatchObject(DENIED)
    }
    expect(await everything()).toEqual(before)
  })

  it("AC-7601.1: SQL 주석은 열쇠 줄 저장을 '고치고, 없으면 넣기'로 적고, upsert는 설정(onConflict hospital_id) 줄에만 나온다", () => {
    expect(STAFF_MIGRATION).toContain('고치고, 없으면 넣기')
    const upsertLines = STAFF_MIGRATION.split('\n').filter((line) => /upsert/i.test(line))
    expect(upsertLines.length).toBeGreaterThan(0)
    for (const line of upsertLines) expect(line).toMatch(/^-- 설정:.*upsert onConflict hospital_id/)
  })

  it('AC-7601.1: 휴가·파일 줄은 원장도 고치기가, 설정·급여 줄·달 줄은 지우기가 권한 없음(42501)이다', async () => {
    await seedAll(hospital[A])
    const before = await everything()
    for (const table of ['staff_leaves', 'staff_files'] as const) {
      await become(A)
      await expect(db.query(`update public.${table} set ${ANY_SET[table]}`), table).rejects.toMatchObject(DENIED)
    }
    for (const table of ['staff_settings', 'staff_pay_lines', 'staff_pay_months'] as const) {
      await become(A)
      await expect(db.query(`delete from public.${table}`), table).rejects.toMatchObject(DENIED)
    }
    expect(await everything()).toEqual(before)
  })

  it('AC-7601.1: 병원 줄을 지우면 그 병원 직원 자료가 열 표 모두에서 함께 지워지고 다른 병원 줄은 그대로다', async () => {
    await seedAll(hospital[A])
    await seedAll(hospital[B])
    await operator()
    await db.query('delete from public.hospitals where id = $1', [hospital[A]])
    expect(await countsByHospital()).toEqual(Object.fromEntries(TABLES.map((table) => [table, { [hospital[B]]: 1 }])))
  })
})

describe('AC-7601.2 누가 읽고 쓰나', SLOW, () => {
  it('AC-7601.2: 원장 A는 열 표 모두에 hospital_id 없이 넣으면 A 병원 줄이 되고, A 줄만 읽는다', async () => {
    await seedAll(hospital[B])
    await become(A)
    const staff = (await insertAs(MEMBERS, MEMBER)).id as string
    for (const table of TABLES) {
      if (table === 'staff_members') continue
      await become(A)
      expect([table, (await insertAs(t(table), bodyOf(table, hospital[A], staff))).hospital_id]).toEqual([table, hospital[A]])
    }
    expect(await countsByHospital()).toEqual(Object.fromEntries(TABLES.map((table) => [table, { [hospital[A]]: 1, [hospital[B]]: 1 }])))
    await become(A)
    for (const table of TABLES) {
      expect([table, (await rows(`select hospital_id from public.${table}`)).map((r) => r.hospital_id)]).toEqual([table, [hospital[A]]])
    }
  })

  it('AC-7601.2: A가 B 병원 줄을 고치거나 지우면 0줄이고 B 줄은 그대로다', async () => {
    await seedAll(hospital[A])
    await seedAll(hospital[B], { name: '옛직원', hired_on: '2000-01-01', left_on: '2010-01-01' }) // 지울 수 있는 퇴사자여도 남의 병원이면 0줄
    const before = await everything()
    for (const table of TABLES) {
      await become(A)
      const set = UPDATE_SET[table]
      if (set) expect([table, (await db.query(`update public.${table} set ${set} where hospital_id = $1`, [hospital[B]])).affectedRows]).toEqual([table, 0])
      if (DELETABLE.has(table)) {
        expect([table, (await db.query(`delete from public.${table} where hospital_id = $1`, [hospital[B]])).affectedRows]).toEqual([table, 0])
      }
    }
    expect(await everything()).toEqual(before)
  })

  it('AC-7601.2: hospital_id·id·created_at·updated_at을 보내 넣거나 hospital_id를 고치면 권한 없음(42501)이다', async () => {
    const staff = (await seedRow('staff_members', hospital[A], MEMBER)).id as string
    for (const table of TABLES) {
      const own = COLUMNS[table].map(([name]) => name)
      const extras: Row[] = [{ hospital_id: hospital[A] }]
      if (own.includes('id')) extras.push({ id: randomUUID() })
      if (own.includes('created_at')) extras.push({ created_at: '2020-01-01T00:00:00Z' })
      if (own.includes('updated_at')) extras.push({ updated_at: '2020-01-01T00:00:00Z' })
      for (const extra of extras) {
        await become(A)
        await expect(postgrestInsert(t(table), [{ ...bodyOf(table, hospital[A], staff), ...extra }]), `${table} ${Object.keys(extra)}`).rejects.toMatchObject(DENIED)
      }
      await become(A)
      await expect(db.query(`update public.${table} set hospital_id = $1`, [hospital[B]]), table).rejects.toMatchObject(DENIED)
    }
  })

  it.each<[string, string]>([
    ['A의 데스크', K],
    ['승인 대기', C],
    ['거절', D],
    ['병원 줄 없음', E],
  ])('AC-7601.2: %s 사용자는 열 표 모두 읽기 0줄·넣기 거부·고치기 0줄·지우기 0줄이다', async (_name, user) => {
    const staffA = await seedAll(hospital[A])
    if (hospital[user]) await seedAll(hospital[user])
    const before = await everything()
    for (const table of TABLES) {
      await become(user)
      expect([table, await rows(`select * from public.${table}`)]).toEqual([table, []])
      await expect(postgrestInsert(t(table), [bodyOf(table, hospital[A], staffA)]), table).rejects.toThrow(RLS_OR_NULL)
      await become(user)
      const set = UPDATE_SET[table]
      if (set) expect([table, (await db.query(`update public.${table} set ${set}`)).affectedRows]).toEqual([table, 0])
      if (DELETABLE.has(table)) expect([table, (await db.query(`delete from public.${table}`)).affectedRows]).toEqual([table, 0])
    }
    expect(await everything()).toEqual(before)
  })

  it('AC-7601.2: anon은 열 표 모두 읽기·넣기·고치기·지우기가 권한 없음(42501)이다', async () => {
    const staffA = await seedAll(hospital[A])
    const before = await everything()
    for (const table of TABLES) {
      await becomeAnon()
      await expect(db.query(`select * from public.${table}`), table).rejects.toMatchObject(DENIED)
      await becomeAnon()
      await expect(postgrestInsert(t(table), [bodyOf(table, hospital[A], staffA)]), table).rejects.toMatchObject(DENIED)
      await becomeAnon()
      await expect(db.query(`update public.${table} set ${ANY_SET[table]}`), table).rejects.toMatchObject(DENIED)
      await becomeAnon()
      await expect(db.query(`delete from public.${table}`), table).rejects.toMatchObject(DENIED)
    }
    expect(await everything()).toEqual(before)
  })

  it('AC-7601.2: 승인됐던 병원이 거절되면 그 순간부터 자기 직원 줄도 안 보인다', async () => {
    await seedAll(hospital[A])
    await become(A)
    expect(await rows(`select name from ${MEMBERS}`)).toEqual([{ name: '김하늘' }])
    await operator()
    await db.query(`update public.hospitals set status = 'rejected' where id = $1`, [hospital[A]])
    for (const table of TABLES) {
      await become(A)
      expect([table, await rows(`select * from public.${table}`)]).toEqual([table, []])
    }
  })
})

describe('AC-7601.3 직원 키(직원 id + 병원 id)', SLOW, () => {
  it('AC-7601.3: 자식 표의 직원 키는 (staff_id, hospital_id) → staff_members (id, hospital_id)이고, 급여 줄만 지울 때 staff_id를 비운다', async () => {
    for (const table of CHILD_TABLES) {
      const found = await rows(
        `select pg_get_constraintdef(oid) as def from pg_constraint where conrelid = to_regclass($1) and contype = 'f' and pg_get_constraintdef(oid) like '%staff_members%'`,
        [t(table)],
      )
      const action = table === 'staff_pay_lines' ? 'ON DELETE SET NULL \\(staff_id\\)' : 'ON DELETE CASCADE'
      expect([table, found.map((f) => f.def)]).toEqual([
        table,
        [expect.stringMatching(new RegExp(`^FOREIGN KEY \\(staff_id, hospital_id\\) REFERENCES (public\\.)?staff_members\\(id, hospital_id\\) ${action}$`))],
      ])
    }
    for (const table of TABLES) {
      const found = await rows(
        `select pg_get_constraintdef(oid) as def from pg_constraint where conrelid = to_regclass($1) and contype = 'f' and pg_get_constraintdef(oid) like '%hospitals%'`,
        [t(table)],
      )
      expect([table, found.map((f) => f.def)]).toEqual([
        table,
        [expect.stringMatching(/^FOREIGN KEY \(hospital_id\) REFERENCES (public\.)?hospitals\(id\) ON DELETE CASCADE$/)],
      ])
    }
  })

  it.each(CHILD_TABLES.map((table) => [table]))('AC-7601.3: A가 %s에 B 병원 직원 id를 넣으면 거절(23503)된다', async (table) => {
    const staffB = (await seedRow('staff_members', hospital[B], MEMBER)).id as string
    await become(A)
    await expect(postgrestInsert(t(table), [bodyOf(table, hospital[A], staffB)])).rejects.toMatchObject(FK_FAILED)
    await operator()
    expect(await rows(`select * from public.${table}`)).toEqual([])
  })

  it('AC-7601.3: 자식 표의 직원 칸(staff_id)은 고치기 권한이 없어 B 병원 직원 id로 바꾸는 update도 거절(42501)된다', async () => {
    await seedAll(hospital[A])
    const staffB = (await seedRow('staff_members', hospital[B], MEMBER)).id as string
    const before = await everything()
    for (const table of CHILD_TABLES) {
      await become(A)
      await expect(db.query(`update public.${table} set staff_id = $1`, [staffB]), table).rejects.toMatchObject(DENIED)
    }
    expect(await everything()).toEqual(before)
  })

  it('AC-7601.3: 직원을 지우면 자식 줄(휴가에서 온 예약 휴무 줄 포함)이 함께 지워지고 급여 줄만 staff_id가 비어 남는다', async () => {
    await seedProfile(hospital[A])
    const staff = await seedAll(hospital[A], { calendar_staff_id: 'st-na' })
    await seedAll(hospital[B])
    expect(await alldayOf(hospital[A])).toHaveLength(1)
    await operator()
    await db.query(`delete from ${MEMBERS} where id = $1`, [staff])
    const counts = await countsByHospital()
    for (const table of TABLES) {
      const left = ['staff_settings', 'staff_pay_lines', 'staff_pay_months'].includes(table) ? 1 : 0
      expect([table, counts[table][hospital[A]] ?? 0, counts[table][hospital[B]]]).toEqual([table, left, 1])
    }
    expect(await rows(`select staff_id, month, amounts from public.staff_pay_lines where hospital_id = $1`, [hospital[A]])).toEqual([
      { staff_id: null, month: '2026-11', amounts: { base: 3_000_000, meal: 200_000 } },
    ])
    expect(await alldayOf(hospital[A])).toEqual([])
  })
})

describe('AC-7601.4 직원 제약', SLOW, () => {
  const addMember = (patch: Row) => postgrestInsert(MEMBERS, [{ ...MEMBER, ...patch }])

  it.each<[string, Row]>([
    ['이름 빈 글자', { name: '' }],
    ['이름 앞 빈칸', { name: ' 김하늘' }],
    ['이름 뒤 빈칸', { name: '김하늘 ' }],
    ['이름 21자', { name: '가'.repeat(21) }],
    ['직종 목록 밖', { job: '의사' }],
    ['직종 빈칸 섞임', { job: '물리 치료사' }],
    ['기타가 아닌데 직접 적은 직종', { job: '간호사', job_other: '운동처방사' }],
    ['직접 적은 직종 빈 글자', { job: '기타', job_other: '' }],
    ['직접 적은 직종 21자', { job: '기타', job_other: '가'.repeat(21) }],
    ['근무 형태 셋 밖', { employment: 'full' }],
    ['주 근무시간 0 밑', { weekly_hours: -0.5 }],
    ['주 근무시간 80 넘음', { weekly_hours: 80.5 }],
    ['주 근무시간 0.5 단위 아님', { weekly_hours: 37.3 }],
    ['퇴사일이 입사일 앞', { hired_on: '2026-03-02', left_on: '2026-03-01' }],
    ['연락처 숫자 8자', { phone: '01012345' }],
    ['연락처 숫자 12자', { phone: '010123456789' }],
    ['연락처 줄표', { phone: '010-1234-5678' }],
    ['계좌번호 글자 섞임', { account_no: '110-abc-1234' }],
    ['계좌번호 빈칸 섞임', { account_no: '110 123 456789' }],
    ['계좌번호 5자', { account_no: '12345' }],
    ['계좌번호 31자', { account_no: '1'.repeat(31) }],
    ['주소 101자', { address: '가'.repeat(101) }],
    ['은행 21자', { bank: '가'.repeat(21) }],
    ['메모 501자', { memo: '가'.repeat(501) }],
    ['올해 이미 쓴 연차 0 밑', { used_before: -0.5 }],
    ['올해 이미 쓴 연차 50 넘음', { used_before: 50.5 }],
    ['올해 이미 쓴 연차 0.5 단위 아님', { used_before: 1.3 }],
    ['예약 시행자 id 빈 글자', { calendar_staff_id: '' }],
    ['예약 시행자 id 41자', { calendar_staff_id: 'x'.repeat(41) }],
  ])('AC-7601.4: %s는 거부(23514)된다', async (_name, patch) => {
    await become(A)
    await expect(addMember(patch)).rejects.toMatchObject(CHECK_FAILED)
    await operator()
    expect(await rows(`select * from ${MEMBERS}`)).toEqual([])
  })

  it.each<[string, Row]>([
    ['이름 null', { name: null }],
    ['직종 null', { job: null }],
    ['근무 형태 null', { employment: null }],
    ['주 근무시간 null', { weekly_hours: null }],
    ['입사일 null', { hired_on: null }],
    ['올해 이미 쓴 연차 null', { used_before: null }],
  ])('AC-7601.4: %s는 거부(23502)된다', async (_name, patch) => {
    await become(A)
    await expect(addMember(patch)).rejects.toMatchObject(NOT_NULL)
  })

  it.each<[string, Row]>([
    ['이름 20자', { name: '가'.repeat(20) }],
    ['직종 여섯 모두', {}],
    ['기타 + 직접 적은 직종 20자', { job: '기타', job_other: '가'.repeat(20) }],
    ['기타 + 직접 적은 직종 없음', { job: '기타', job_other: null }],
    ['계약직·주 0시간', { employment: 'contract', weekly_hours: 0 }],
    ['파트타임·주 24시간', { employment: 'part', weekly_hours: 24 }],
    ['주 80시간', { weekly_hours: 80 }],
    ['주 37.5시간', { weekly_hours: 37.5 }],
    ['퇴사일 = 입사일', { hired_on: '2026-03-02', left_on: '2026-03-02' }],
    ['연락처 숫자 9자', { phone: '021234567' }],
    ['계좌번호 6자', { account_no: '123456' }],
    ['계좌번호 30자', { account_no: '1-'.repeat(15) }],
    ['주소 100자·은행 20자·메모 500자', { address: '가'.repeat(100), bank: '가'.repeat(20), memo: '가'.repeat(500) }],
    ['선택 칸 모두 null', { left_on: null, phone: null, birthday: null, address: null, bank: null, account_no: null, memo: null, used_before_from: null }],
    ['올해 이미 쓴 연차 50·기간 시작일', { used_before: 50, used_before_from: '2026-03-02' }],
    ['올해 이미 쓴 연차 0.5', { used_before: 0.5 }],
    ['예약 시행자 id 40자', { calendar_staff_id: 'x'.repeat(40) }],
  ])('AC-7601.4: %s는 들어간다', async (_name, patch) => {
    const jobs = Object.keys(patch).length === 0 ? ['간호사', '간호조무사', '물리치료사', '방사선사', '원무', '기타'] : [MEMBER.job]
    for (const [n, job] of jobs.entries()) {
      await become(A)
      await addMember({ job, ...patch, name: (patch.name as string | undefined) ?? `김하늘${n}` })
    }
    await operator()
    expect(await rows(`select count(*)::int as n from ${MEMBERS}`)).toEqual([{ n: jobs.length }])
  })

  it('AC-7601.4: 주 근무시간·올해 이미 쓴 연차를 보내지 않으면 40·0이다', async () => {
    const rest = Object.fromEntries(Object.entries(MEMBER).filter(([key]) => key !== 'weekly_hours' && key !== 'used_before'))
    await become(A)
    await postgrestInsert(MEMBERS, [rest])
    await operator()
    expect(await rows(`select weekly_hours::float8 as w, used_before::float8 as u from ${MEMBERS}`)).toEqual([{ w: 40, u: 0 }])
  })

  it('AC-7601.4: 같은 병원에 같은 이름 + 입사일은 하나(23505)이고, 입사일이 다르거나 다른 병원이면 된다', async () => {
    await become(A)
    await addMember({})
    await become(A)
    await expect(addMember({ phone: null })).rejects.toMatchObject(UNIQUE)
    await become(A)
    await addMember({ hired_on: '2022-03-02' })
    await become(B)
    await addMember({})
    expect(await countsByHospital().then((c) => c.staff_members)).toEqual({ [hospital[A]]: 2, [hospital[B]]: 1 })
  })

  it('AC-7601.4: 같은 예약 시행자 id는 병원 안 한 사람에게만(23505), 연결 없음(null)은 여럿, 다른 병원은 같은 id여도 된다', async () => {
    await become(A)
    await addMember({ name: '가', calendar_staff_id: 'st-na' })
    await become(A)
    await expect(addMember({ name: '나', calendar_staff_id: 'st-na' })).rejects.toMatchObject(UNIQUE)
    await become(A)
    await addMember({ name: '다', calendar_staff_id: null })
    await become(A)
    await addMember({ name: '라', calendar_staff_id: null })
    await become(B)
    await addMember({ name: '가', calendar_staff_id: 'st-na' })
    await become(A)
    await expect(db.query(`update ${MEMBERS} set calendar_staff_id = 'st-na' where name = '다'`)).rejects.toMatchObject(UNIQUE)
    expect(await countsByHospital().then((c) => c.staff_members)).toEqual({ [hospital[A]]: 3, [hospital[B]]: 1 })
  })

  it('AC-7601.4: 고칠 때도 제약이 그대로다', async () => {
    await seedRow('staff_members', hospital[A], MEMBER)
    const before = await everything()
    for (const set of ["name = ' 김'", "job = '의사'", "phone = '02-1234'", "left_on = '2020-01-01'", 'weekly_hours = 81', 'used_before = 0.3']) {
      await become(A)
      await expect(db.query(`update ${MEMBERS} set ${set}`), set).rejects.toMatchObject(CHECK_FAILED)
    }
    expect(await everything()).toEqual(before)
  })
})

describe('AC-7601.5 근무·휴가 제약', SLOW, () => {
  let staff = ''
  beforeEach(async () => {
    staff = (await seedRow('staff_members', hospital[A], MEMBER)).id as string
  })
  const add = (table: Table, patch: Row) => postgrestInsert(t(table), [{ ...bodyOf(table, hospital[A], staff), ...patch }])
  const okAdd = async (table: Table, patch: Row) => {
    await become(A)
    await add(table, patch)
  }

  it.each<[string, Row]>([
    ['요일 배열 아님(객체)', { week: { mon: SHIFT } }],
    ['요일 배열 아님(글자)', { week: 'x' }],
    ['요일 6칸', { week: WEEK.slice(0, 6) }],
    ['요일 8칸', { week: [...WEEK, null] }],
    ['요일 빈 배열', { week: [] }],
    ['토요일 격주 셋 밖', { sat_rotation: '1-3-5' }],
  ])('AC-7601.5: 기본 근무 %s는 거부(23514)된다', async (_name, patch) => {
    await become(A)
    await expect(add('staff_week_plans', patch)).rejects.toMatchObject(CHECK_FAILED)
  })

  it('AC-7601.5: 기본 근무 요일 칸은 1,000바이트까지 들어가고 1바이트 넘으면 거부(23514), 시작일·요일·격주는 비울 수 없다(23502)', async () => {
    const make = (pad: number) => [{ ...SHIFT, note: 'x'.repeat(pad) }, null, null, null, null, null, null]
    await become(A)
    await expect(add('staff_week_plans', { week: await jsonOfBytes(make, 1001) })).rejects.toMatchObject(CHECK_FAILED)
    await okAdd('staff_week_plans', { week: await jsonOfBytes(make, 1000) })
    for (const column of ['from_day', 'week', 'sat_rotation']) {
      await become(A)
      await expect(add('staff_week_plans', { from_day: '2027-01-01', [column]: null }), column).rejects.toMatchObject(NOT_NULL)
    }
  })

  it("AC-7601.5: 기본 근무는 격주 'every'·'1-3'·'2-4'와 모두 쉼(null 7칸)이 들어가고, 직원·시작일 하나에 한 줄(23505)이다", async () => {
    await okAdd('staff_week_plans', { from_day: '2026-01-01', sat_rotation: 'every' })
    await okAdd('staff_week_plans', { from_day: '2026-02-01', sat_rotation: '1-3' })
    await okAdd('staff_week_plans', { from_day: '2026-03-01', sat_rotation: '2-4', week: [null, null, null, null, null, null, null] })
    await become(A)
    await expect(add('staff_week_plans', { from_day: '2026-01-01', sat_rotation: '2-4' })).rejects.toMatchObject(UNIQUE)
  })

  it.each<[string, Row]>([
    ['시작만', { end_min: null, lunch_from: null, lunch_to: null }],
    ['끝만', { start_min: null, lunch_from: null, lunch_to: null }],
    ['시작 = 끝', { start_min: 540, end_min: 540, lunch_from: null, lunch_to: null }],
    ['시작 > 끝', { start_min: 600, end_min: 540, lunch_from: null, lunch_to: null }],
    ['시작 0 밑', { start_min: -10, lunch_from: null, lunch_to: null }],
    ['끝 1440 넘음', { end_min: 1450, lunch_from: null, lunch_to: null }],
    ['시작 10분 단위 아님', { start_min: 545 }],
    ['끝 10분 단위 아님', { end_min: 1085 }],
    ['점심 시작만', { lunch_to: null }],
    ['점심 끝만', { lunch_from: null }],
    ['점심 시작 = 끝', { lunch_from: 780, lunch_to: 780 }],
    ['점심이 근무 앞에 걸침', { lunch_from: 500, lunch_to: 560 }],
    ['점심이 근무 뒤에 걸침', { lunch_from: 1050, lunch_to: 1090 }],
    ['점심 10분 단위 아님', { lunch_from: 785 }],
    ['쉬는 날에 점심', { start_min: null, end_min: null }],
    ['메모 51자', { memo: '가'.repeat(51) }],
  ])('AC-7601.5: 바뀐 날 %s는 거부(23514)된다', async (_name, patch) => {
    await become(A)
    await expect(add('staff_day_changes', patch)).rejects.toMatchObject(CHECK_FAILED)
  })

  it('AC-7601.5: 바뀐 날은 0~1440 근무·점심 경계·점심 없음·쉼(모두 null)이 들어가고, 직원·날 하나에 한 줄(23505)이다', async () => {
    await okAdd('staff_day_changes', { day: '2026-11-01', start_min: 0, end_min: 1440, lunch_from: 0, lunch_to: 1440, memo: '가'.repeat(50) })
    await okAdd('staff_day_changes', { day: '2026-11-02', lunch_from: null, lunch_to: null })
    await okAdd('staff_day_changes', { day: '2026-11-03', start_min: null, end_min: null, lunch_from: null, lunch_to: null, memo: '쉼' })
    await okAdd('staff_day_changes', { day: '2026-11-04', start_min: null, end_min: null, lunch_from: null, lunch_to: null, memo: null })
    await become(A)
    await expect(add('staff_day_changes', { day: '2026-11-01' })).rejects.toMatchObject(UNIQUE)
  })

  it.each<[string, Row]>([
    ['종류 셋 밖', { kind: 'weekend' }],
    ['0분', { minutes: 0 }],
    ['20분', { minutes: 20 }],
    ['45분(30분 단위 아님)', { minutes: 45 }],
    ['1470분', { minutes: 1470 }],
    ['음수', { minutes: -30 }],
  ])('AC-7601.5: 더 일한 시간 %s는 거부(23514)된다', async (_name, patch) => {
    await become(A)
    await expect(add('staff_overtime', patch)).rejects.toMatchObject(CHECK_FAILED)
  })

  it("AC-7601.5: 더 일한 시간은 'extended'·'night'·'holiday' 30~1440분이 들어가고, 직원·날·종류 하나에 한 줄(23505)이다", async () => {
    await okAdd('staff_overtime', { kind: 'extended', minutes: 30 })
    await okAdd('staff_overtime', { kind: 'night', minutes: 1440 })
    await okAdd('staff_overtime', { kind: 'holiday', minutes: 240 })
    await become(A)
    await expect(add('staff_overtime', { kind: 'night', minutes: 60 })).rejects.toMatchObject(UNIQUE)
    for (const column of ['kind', 'minutes']) {
      await become(A)
      await expect(add('staff_overtime', { day: '2026-11-11', [column]: null }), column).rejects.toMatchObject(NOT_NULL)
    }
  })

  it.each<[string, Row]>([
    ['종류 여섯 밖', { kind: 'vacation' }],
    ['반차인데 오전·오후 없음', { kind: 'half', part: null }],
    ['연차인데 오전', { kind: 'annual', part: 'am' }],
    ['오전·오후 밖', { kind: 'half', part: 'noon' }],
    ['연차 무급', { kind: 'annual', paid: false }],
    ['반차 무급', { kind: 'half', part: 'am', paid: false }],
    ['경조사 무급', { kind: 'family', paid: false }],
    ['출산·육아휴직 무급', { kind: 'maternity', paid: false }],
    ['무급(결근)인데 유급', { kind: 'unpaid', paid: true }],
    ['무급(결근)에 유급 표시 안 보냄(기본 유급)', { kind: 'unpaid', paid: undefined }],
    ['메모 51자', { memo: '가'.repeat(51) }],
  ])('AC-7601.5: 휴가 %s는 거부(23514)된다', async (_name, patch) => {
    await become(A)
    const body = { ...bodyOf('staff_leaves', hospital[A], staff), ...patch }
    if (patch.paid === undefined && 'paid' in patch) delete body.paid
    await expect(postgrestInsert(LEAVES, [body])).rejects.toMatchObject(CHECK_FAILED)
  })

  it('AC-7601.5: 휴가는 종류 여섯(반차 오전·오후, 병가만 유급·무급 고름)이 들어가고, 직원·날 하나에 한 줄(23505)이며 묶음 id는 비울 수 없다', async () => {
    const days: [string, Row][] = [
      ['2026-11-02', { kind: 'annual', paid: true }],
      ['2026-11-03', { kind: 'half', part: 'am', paid: true }],
      ['2026-11-04', { kind: 'half', part: 'pm', paid: true }],
      ['2026-11-05', { kind: 'family', paid: true }],
      ['2026-11-06', { kind: 'sick', paid: true }],
      ['2026-11-09', { kind: 'sick', paid: false }],
      ['2026-11-10', { kind: 'maternity', paid: true }],
      ['2026-11-11', { kind: 'unpaid', paid: false, memo: '가'.repeat(50) }],
    ]
    for (const [day, patch] of days) await okAdd('staff_leaves', { day, ...patch })
    await become(A)
    await expect(add('staff_leaves', { day: '2026-11-02', kind: 'sick', paid: true })).rejects.toMatchObject(UNIQUE)
    await become(A)
    await expect(add('staff_leaves', { day: '2026-11-12', group_id: null })).rejects.toMatchObject(NOT_NULL)
    await become(A)
    await postgrestInsert(LEAVES, [{ group_id: GROUP, staff_id: staff, day: '2026-11-13', kind: 'annual' }])
    await operator()
    expect(await rows(`select paid, part, memo from ${LEAVES} where day = '2026-11-13'`)).toEqual([{ paid: true, part: null, memo: null }])
  })
})

describe('AC-7601.6 설정·급여 제약', SLOW, () => {
  let staff = ''
  beforeEach(async () => {
    staff = (await seedRow('staff_members', hospital[A], MEMBER)).id as string
  })
  const add = (table: Table, patch: Row) => postgrestInsert(t(table), [{ ...bodyOf(table, hospital[A], staff), ...patch }])

  it("AC-7601.6: 설정은 보내지 않은 칸이 'hire'·'pay'·기본 급여 항목 다섯(기본급·연장수당·식대·인센티브(실적)·상여)이고, 병원마다 한 줄(23505)이다", async () => {
    await become(A)
    await postgrestInsert(t('staff_settings'), [{ leave_basis: 'hire' }])
    await operator()
    expect(await rows(`select leave_basis, leftover, pay_items from public.staff_settings`)).toEqual([
      { leave_basis: 'hire', leftover: 'pay', pay_items: DEFAULT_PAY_ITEMS },
    ])
    await become(A)
    await postgrestInsert(t('staff_settings'), [{ leftover: 'carry' }], null)
      .then(() => expect.unreachable())
      .catch((error) => expect(error).toMatchObject(UNIQUE))
    await become(B)
    await postgrestInsert(t('staff_settings'), [{ leftover: 'carry' }])
    expect(await countsByHospital().then((c) => c.staff_settings)).toEqual({ [hospital[A]]: 1, [hospital[B]]: 1 })
  })

  it.each<[string, Row]>([
    ['연차 기준 둘 밖', { leave_basis: 'hire_date' }],
    ['못 쓴 연차 둘 밖', { leftover: 'drop' }],
    ['급여 항목 객체', { pay_items: { base: true } }],
    ['급여 항목 글자', { pay_items: 'x' }],
    ['급여 항목 31개', { pay_items: Array.from({ length: 31 }, (_v, n) => item(`i${n}`, `항목${n}`)) }],
  ])('AC-7601.6: 설정 %s는 거부(23514)된다', async (_name, patch) => {
    await become(A)
    await expect(add('staff_settings', patch)).rejects.toMatchObject(CHECK_FAILED)
  })

  it('AC-7601.6: 급여 항목은 30개·4,000바이트까지 들어가고 4,001바이트는 거부(23514), 비울 수 없다(23502)', async () => {
    await become(A)
    await add('staff_settings', { pay_items: Array.from({ length: 30 }, (_v, n) => item(`i${n}`, `항목${n}`)) })
    await operator()
    await db.exec('delete from public.staff_settings')
    const make = (pad: number) => [item('base', 'x'.repeat(pad))]
    await become(A)
    await expect(add('staff_settings', { pay_items: await jsonOfBytes(make, 4001) })).rejects.toMatchObject(CHECK_FAILED)
    await become(A)
    await add('staff_settings', { pay_items: await jsonOfBytes(make, 4000) })
    await become(A)
    await expect(db.query(`update public.staff_settings set pay_items = null`)).rejects.toMatchObject(NOT_NULL)
  })

  it.each<[string, Row]>([
    ['이름 빈 글자', { name: '' }],
    ['이름 21자', { name: '가'.repeat(21) }],
    ['방식 셋 밖', { method: 'ratio' }],
    ['건당인데 금액 없음', { method: 'per_case', unit_amount: null }],
    ['건당인데 % 있음', { method: 'per_case', unit_amount: 5000, percent: 10 }],
    ['건당 금액 음수', { method: 'per_case', unit_amount: -1 }],
    ['고정인데 금액 없음', { method: 'fixed', unit_amount: null }],
    ['고정인데 % 있음', { method: 'fixed', unit_amount: 100000, percent: 5 }],
    ['%인데 금액 있음', { method: 'percent', unit_amount: 1000, percent: 10 }],
    ['%인데 % 없음', { method: 'percent', unit_amount: null, percent: null }],
    ['% 0 밑', { method: 'percent', unit_amount: null, percent: -0.01 }],
    ['% 100 넘음', { method: 'percent', unit_amount: null, percent: 100.01 }],
  ])('AC-7601.6: 인센티브 규칙 %s는 거부(23514)된다', async (_name, patch) => {
    await become(A)
    await expect(add('staff_incentive_rules', patch)).rejects.toMatchObject(CHECK_FAILED)
  })

  it('AC-7601.6: 인센티브 규칙은 건당·고정 0원 이상, % 0~100(소수 둘째 자리)이 들어간다', async () => {
    const ok: Row[] = [
      { method: 'per_case', unit_amount: 0, percent: null },
      { method: 'per_case', unit_amount: 5000, percent: null },
      { method: 'fixed', unit_amount: 0, percent: null },
      { method: 'fixed', unit_amount: 150_000, percent: null },
      { method: 'percent', unit_amount: null, percent: 0 },
      { method: 'percent', unit_amount: null, percent: 100 },
      { method: 'percent', unit_amount: null, percent: 12.34 },
    ]
    for (const [n, patch] of ok.entries()) {
      await become(A)
      await add('staff_incentive_rules', { ...patch, name: '가'.repeat(n === 0 ? 20 : 1), sort: n })
    }
    await operator()
    expect(await rows(`select percent::float8 as p from public.staff_incentive_rules where percent is not null order by sort`)).toEqual([
      { p: 0 },
      { p: 100 },
      { p: 12.34 },
    ])
  })

  it.each<[string, Row]>([
    ['달 13월', { month: '2026-13' }],
    ['달 00월', { month: '2026-00' }],
    ['달 한 자리', { month: '2026-1' }],
    ['달 줄표 없음', { month: '202611' }],
    ['달에 날짜', { month: '2026-11-01' }],
    ['금액 배열', { amounts: [3_000_000] }],
    ['금액 글자', { amounts: 'x' }],
    ['인센티브 객체', { incentives: { a: 1 } }],
    ['조정 1억 넘음', { adjust: 100_000_001 }],
    ['조정 −1억 밑', { adjust: -100_000_001 }],
    ['조정 까닭 셋 밖', { adjust_reason: 'bonus' }],
    ['까닭 글 31자', { adjust_memo: '가'.repeat(31) }],
  ])('AC-7601.6: 급여 줄 %s는 거부(23514)된다', async (_name, patch) => {
    await become(A)
    await expect(add('staff_pay_lines', patch)).rejects.toMatchObject(CHECK_FAILED)
  })

  it.each<[string, string, (pad: number) => unknown, number]>([
    ['금액', 'amounts', (pad) => ({ base: 1, x: 'x'.repeat(pad) }), 2000],
    ['인센티브', 'incentives', (pad) => [{ name: 'x'.repeat(pad) }], 4000],
  ])('AC-7601.6: 급여 줄 %s(%s)는 한도 바이트까지 들어가고 1바이트 넘으면 거부(23514)된다', async (_name, column, make, limit) => {
    await become(A)
    await expect(add('staff_pay_lines', { [column]: await jsonOfBytes(make, limit + 1) })).rejects.toMatchObject(CHECK_FAILED)
    await become(A)
    await add('staff_pay_lines', { [column]: await jsonOfBytes(make, limit) })
    await operator()
    expect(await rows(`select octet_length(${column}::text)::int as n from public.staff_pay_lines`)).toEqual([{ n: limit }])
  })

  it("AC-7601.6: 급여 줄은 조정 ±1억·까닭 셋·까닭 글 30자가 들어가고, 달·직원 하나에 한 줄(23505)이며 직원 없는 줄(지운 사람)은 여럿이다", async () => {
    const months: [string, Row][] = [
      ['2026-01', { adjust: 100_000_000, adjust_reason: 'prorate', adjust_memo: '가'.repeat(30) }],
      ['2026-02', { adjust: -100_000_000, adjust_reason: 'deduct' }],
      ['2026-03', { adjust: 0, adjust_reason: 'other' }],
      ['2026-12', { adjust: 0, adjust_reason: null, adjust_memo: null }],
    ]
    for (const [month, patch] of months) {
      await become(A)
      await add('staff_pay_lines', { month, ...patch })
    }
    await become(A)
    await expect(add('staff_pay_lines', { month: '2026-01' })).rejects.toMatchObject(UNIQUE)
    await become(A)
    await add('staff_pay_lines', { month: '2026-01', staff_id: null })
    await become(A)
    await add('staff_pay_lines', { month: '2026-01', staff_id: null })
    await become(A)
    await postgrestInsert(t('staff_pay_lines'), [{ month: '2026-04', staff_id: staff }])
    await operator()
    expect(await rows(`select amounts, incentives, adjust::int as adjust from public.staff_pay_lines where month = '2026-04'`)).toEqual([
      { amounts: {}, incentives: [], adjust: 0 },
    ])
  })

  it('AC-7601.6: 달 줄은 병원 부담분 0 이상(비움 가능)이고 병원·달 하나에 한 줄(23505)이다', async () => {
    await become(A)
    await expect(add('staff_pay_months', { employer_cost: -1 })).rejects.toMatchObject(CHECK_FAILED)
    await become(A)
    await expect(add('staff_pay_months', { month: '2026-13' })).rejects.toMatchObject(CHECK_FAILED)
    await become(A)
    await add('staff_pay_months', { employer_cost: null })
    await become(A)
    await expect(add('staff_pay_months', { employer_cost: 0 })).rejects.toMatchObject(UNIQUE)
    await become(A)
    await add('staff_pay_months', { month: '2026-10', employer_cost: 0 })
    await become(B)
    await add('staff_pay_months', { employer_cost: 1 })
    expect(await countsByHospital().then((c) => c.staff_pay_months)).toEqual({ [hospital[A]]: 2, [hospital[B]]: 1 })
  })
})

describe('AC-7601.7 퇴사 3년 지난 직원만 지우기', SLOW, () => {
  it('AC-7601.7: A가 지우면 퇴사일 + 3년이 한국 오늘보다 앞인 사람만 지워지고 재직자·3년 안 된 퇴사자·B 병원 사람은 그대로다', async () => {
    const today = await koreaToday()
    const exactly = await shiftDay(today, '-3 years')
    const over = await shiftDay(exactly, '-1 day')
    const add = (h: string, name: string, left: string | null) => seedRow('staff_members', h, { ...MEMBER, name, hired_on: '2000-01-01', left_on: left })
    await add(hospital[A], '재직', null)
    await add(hospital[A], '꼭3년', exactly)
    const old = (await add(hospital[A], '3년넘음', over)).id as string
    await add(hospital[A], '지난달', await shiftDay(today, '-1 month'))
    await add(hospital[A], '앞으로', await shiftDay(today, '1 month'))
    await add(hospital[B], '비옛사람', '2010-01-01')
    await become(A)
    expect(await rows(`delete from ${MEMBERS} returning id`)).toEqual([{ id: old }])
    await operator()
    expect((await rows(`select name from ${MEMBERS} order by name`)).map((r) => r.name)).toEqual(['꼭3년', '비옛사람', '앞으로', '재직', '지난달'])
  })

  it('AC-7601.7: 지울 수 있는 퇴사자도 데스크·대기·거절·병원 없는 사용자는 0줄이고, 고친 퇴사일로 바로 지울 수 있다', async () => {
    const staff = (await seedRow('staff_members', hospital[A], { ...MEMBER, left_on: null })).id as string
    await become(A)
    expect((await db.query(`delete from ${MEMBERS}`)).affectedRows).toBe(0)
    await become(A)
    await db.query(`update ${MEMBERS} set left_on = '2021-03-02'`)
    for (const user of [K, C, D, E]) {
      await become(user)
      expect([user, (await db.query(`delete from ${MEMBERS}`)).affectedRows]).toEqual([user, 0])
    }
    await become(A)
    expect(await rows(`delete from ${MEMBERS} returning id`)).toEqual([{ id: staff }])
  })

  it('AC-7601.7·AC-7601.3: 지운 사람의 달별 급여 줄은 이름 없이(staff_id null) A에게 그대로 보인다', async () => {
    const staff = await seedAll(hospital[A], { left_on: '2022-12-31' })
    await become(A)
    expect((await db.query(`delete from ${MEMBERS} where id = $1`, [staff])).affectedRows).toBe(1)
    await become(A)
    expect(await rows(`select staff_id, month, adjust::int as adjust from public.staff_pay_lines`)).toEqual([{ staff_id: null, month: '2026-11', adjust: 0 }])
  })
})

// 넘어온 연차 시작 값(2026-11-21): carry_start = 'carry' 병원 셈의 시작 기간 넘어옴(원장이 적음), registered_on = 웹앱에 처음 넣은 날(DB만 정함)
const CARRY_START_DEF = 'carry_start numeric(4, 1) not null default 0 check (carry_start between -30 and 100 and carry_start * 2 = trunc(carry_start * 2))'
const REGISTERED_ON_DEF = "registered_on date not null default (now() at time zone 'Asia/Seoul')::date"

/** 운영자 눈으로 본 직원 표 한 칸의 정의(형·자리·not null·기본값) */
async function memberColumn(column: string, target: PGlite = db) {
  await operator(target)
  return (
    await rows(
      `select udt_name, numeric_precision, numeric_scale, is_nullable, column_default from information_schema.columns
       where table_schema = 'public' and table_name = 'staff_members' and column_name = $1`,
      [column],
      target,
    )
  )[0]
}

/** 직원 표에서 그 칸을 보는 검사 제약(이름·글) */
async function checksOn(column: string, target: PGlite = db) {
  await operator(target)
  return rows(
    `select c.conname, pg_get_constraintdef(c.oid) as def from pg_constraint c
     where c.conrelid = 'public.staff_members'::regclass and c.contype = 'c'
       and c.conkey = array[(select attnum from pg_attribute where attrelid = 'public.staff_members'::regclass and attname = $1)]::int2[]
     order by 1`,
    [column],
    target,
  )
}

/** 표마다 칸 순서와 상관없이 견주게 줄을 표·칸 이름 차례로 놓고, 칸 권한 목록도 이름 차례로 */
function orderFree(shape: Awaited<ReturnType<typeof shapeOf>>) {
  const key = (r: Row) => `${String(r.table_name)}.${String(r.column_name)}`
  return {
    ...shape,
    columns: [...shape.columns].sort((x, y) => key(x).localeCompare(key(y))),
    access: shape.access.map((a) => ({ ...a, columns: [...((a.columns as string[] | null) ?? [])].sort() })),
  }
}

describe('AC-7601.8 넘어온 연차 시작 값·웹앱 등록일', SLOW, () => {
  const addMember = (patch: Row) => postgrestInsert(MEMBERS, [{ ...MEMBER, ...patch }])

  it('AC-7601.8: create table 안 used_before_from 다음에 두 칸이 있고, 표 바로 아래 같은 정의의 add column if not exists 두 줄, 표 위 주석에 두 칸 뜻이 있다', () => {
    const create = STAFF_SQL.match(/create table if not exists public\.staff_members \(\n([\s\S]*?)\n\);/)
    expect(create).not.toBeNull()
    const body = (create?.[1] ?? '').split('\n').map((line) => line.trim().replace(/,$/, ''))
    const at = (name: string) => body.findIndex((line) => line.startsWith(`${name} `))
    expect([at('carry_start'), at('registered_on')]).toEqual([at('used_before_from') + 1, at('used_before_from') + 2])
    expect(body[at('carry_start')]).toBe(CARRY_START_DEF)
    expect(body[at('registered_on')]).toBe(REGISTERED_ON_DEF)
    // 표 만들기 바로 다음 문장 둘이 두 칸 없을 때만 더하기(같은 정의)
    const rest = STAFF_TOP.slice(STAFF_TOP.indexOf('create table if not exists public.staff_members ('))
    const statements = rest
      .split(';')
      .map((x) => x.replace(/\s+/g, ' ').trim())
      .filter((x) => x !== '')
    expect(statements.slice(1, 3)).toEqual([
      `alter table public.staff_members add column if not exists ${CARRY_START_DEF}`,
      `alter table public.staff_members add column if not exists ${REGISTERED_ON_DEF}`,
    ])
    expect((STAFF_TOP.match(/alter\s+table\s+public\.staff_members\s+add\s+column/gi) ?? []).length).toBe(2)
    // 직원 표 위 주석(used_before처럼 한 줄씩)
    const lines = STAFF_MIGRATION.split('\n')
    const createAt = lines.findIndex((line) => line.startsWith('create table if not exists public.staff_members ('))
    let top = createAt
    while (top > 0 && lines[top - 1].startsWith('--')) top -= 1
    const comment = lines.slice(top, createAt)
    expect(comment.filter((line) => line.startsWith('-- carry_start = '))).toHaveLength(1)
    expect(comment.filter((line) => line.startsWith('-- registered_on = '))).toHaveLength(1)
    expect(comment.find((line) => line.startsWith('-- carry_start = '))).toMatch(/넘어온 연차 시작 값[^\n]*'carry'[^\n]*시작 기간/)
    expect(comment.find((line) => line.startsWith('-- registered_on = '))).toMatch(/웹앱에 처음 넣은 날[^\n]*DB/)
  })

  it("AC-7601.8: carry_start는 numeric(4,1) not null 기본 0, registered_on은 date not null 기본 (now() at time zone 'Asia/Seoul')::date다", async () => {
    expect(await memberColumn('carry_start')).toMatchObject({ udt_name: 'numeric', numeric_precision: 4, numeric_scale: 1, is_nullable: 'NO' })
    expect(await memberColumn('registered_on')).toMatchObject({ udt_name: 'date', is_nullable: 'NO' })
    const registeredDefault = String((await memberColumn('registered_on')).column_default)
    for (const part of ['now()', "AT TIME ZONE 'Asia/Seoul'"]) expect(registeredDefault).toContain(part)
    expect(registeredDefault).toMatch(/::date$/)
    expect((await checksOn('carry_start')).map((c) => c.conname)).toEqual(['staff_members_carry_start_check'])
    expect(await checksOn('registered_on')).toEqual([])
  })

  it("AC-7601.8·AC-7601.1: 직원 넣기·고치기 칸 권한에 carry_start가 있고 registered_on은 없으며, SQL 주석은 '값 칸 열일곱'이다", async () => {
    expect(
      await rows(
        `select column_name, privilege_type from information_schema.column_privileges
         where table_schema = 'public' and table_name = 'staff_members' and column_name in ('carry_start', 'registered_on')
           and grantee in ('anon', 'authenticated', 'PUBLIC') order by 1, 2`,
      ),
    ).toEqual([
      { column_name: 'carry_start', privilege_type: 'INSERT' },
      { column_name: 'carry_start', privilege_type: 'SELECT' },
      { column_name: 'carry_start', privilege_type: 'UPDATE' },
      { column_name: 'registered_on', privilege_type: 'SELECT' },
    ])
    for (const privilege of ['INSERT', 'UPDATE']) {
      expect([privilege, (await rows(`select has_column_privilege('authenticated', $1, 'registered_on', $2) as ok`, [MEMBERS, privilege]))[0].ok]).toEqual([
        privilege,
        false,
      ])
    }
    expect(STAFF_MIGRATION).toMatch(/^-- 직원: [^\n]*값 칸 열일곱/m)
    expect(STAFF_MIGRATION).toMatch(/^-- [^\n]*registered_on[^\n]*칸 권한이 없/m)
  })

  it('AC-7601.8: 넘어온 연차 시작 값을 보내지 않으면 0이다', async () => {
    await become(A)
    await addMember({})
    await operator()
    expect(await rows(`select carry_start::float8 as c from ${MEMBERS}`)).toEqual([{ c: 0 }])
  })

  it.each<[string, number]>([
    ['−30', -30],
    ['100', 100],
    ['−0.5', -0.5],
    ['0.5', 0.5],
    ['99.5', 99.5],
    ['−29.5', -29.5],
  ])('AC-7601.8: 넘어온 연차 시작 값 %s는 들어간다(원장)', async (_name, value) => {
    await become(A)
    await addMember({ carry_start: value })
    await operator()
    expect(await rows(`select carry_start::float8 as c from ${MEMBERS}`)).toEqual([{ c: value }])
  })

  it.each<[string, number]>([
    ['−30.5', -30.5],
    ['100.5', 100.5],
    ['1.3', 1.3],
    ['−0.3', -0.3],
    ['−31', -31],
    ['101', 101],
  ])('AC-7601.8: 넘어온 연차 시작 값 %s는 거부(23514)된다', async (_name, value) => {
    await become(A)
    await expect(addMember({ carry_start: value })).rejects.toMatchObject(CHECK_FAILED)
    await operator()
    expect(await rows(`select * from ${MEMBERS}`)).toEqual([])
  })

  it('AC-7601.8: 넘어온 연차 시작 값 null은 거부(23502)되고, 고칠 때도 범위·null 제약이 그대로다', async () => {
    await become(A)
    await expect(addMember({ carry_start: null })).rejects.toMatchObject(NOT_NULL)
    await seedRow('staff_members', hospital[A], { ...MEMBER, carry_start: 3 })
    const before = await everything()
    for (const [set, error] of [
      ['carry_start = 100.5', CHECK_FAILED],
      ['carry_start = -30.5', CHECK_FAILED],
      ['carry_start = 1.3', CHECK_FAILED],
      ['carry_start = null', NOT_NULL],
    ] as const) {
      await become(A)
      await expect(db.query(`update ${MEMBERS} set ${set}`), set).rejects.toMatchObject(error)
    }
    expect(await everything()).toEqual(before)
  })

  it('AC-7601.8: 원장이 넣으면 registered_on은 넣은 때의 한국 오늘이다(세션 시간대와 상관없음)', async () => {
    const zones = ['UTC', 'Pacific/Kiritimati', 'Pacific/Pago_Pago'] // +14·−11은 늘 날짜가 달라 current_date였다면 한쪽이 틀린다
    try {
      for (const [n, zone] of zones.entries()) {
        await become(A)
        await db.query(`select set_config('timezone', $1, false)`, [zone])
        await addMember({ name: `김하늘${n}` })
      }
    } finally {
      await db.exec('reset timezone')
    }
    const today = await koreaToday()
    expect(await rows(`select name, registered_on::text as d from ${MEMBERS} order by name`)).toEqual(zones.map((_, n) => ({ name: `김하늘${n}`, d: today })))
  })

  it('AC-7601.8: 원장이 registered_on을 보내 넣거나 고치면 권한 없음(42501)이고 줄은 그대로다', async () => {
    const staff = (await seedRow('staff_members', hospital[A], { ...MEMBER, registered_on: '2025-03-02' })).id as string
    const before = await everything()
    await become(A)
    await expect(addMember({ name: '이바다', registered_on: '2026-01-01' })).rejects.toMatchObject(DENIED)
    await become(A)
    await expect(addMember({ name: '이바다', registered_on: null })).rejects.toMatchObject(DENIED)
    await become(A)
    await expect(db.query(`update ${MEMBERS} set registered_on = '2026-01-01'`)).rejects.toMatchObject(DENIED)
    await become(A)
    await expect(postgrestUpdate(MEMBERS, { memo: '고침', registered_on: '2026-01-01' }, { id: staff })).rejects.toMatchObject(DENIED)
    await become(A)
    await expect(postgrestInsert(MEMBERS, [{ ...MEMBER, registered_on: '2026-01-01' }], 'hospital_id, name, hired_on')).rejects.toMatchObject(DENIED)
    expect(await everything()).toEqual(before)
  })

  it('AC-7601.8: 원장이 다른 칸(넘어온 연차 시작 값·메모·퇴사일·연결)을 고쳐도 registered_on은 그대로다', async () => {
    await seedProfile(hospital[A])
    const staff = (await seedRow('staff_members', hospital[A], { ...MEMBER, registered_on: '2025-03-02' })).id as string
    await become(A)
    const updated = (await postgrestUpdate(MEMBERS, { carry_start: -1.5, memo: '고침', left_on: '2026-10-31', calendar_staff_id: 'st-na' }, { id: staff })).rows
    expect(updated.map((r) => r.r)).toMatchObject([{ carry_start: -1.5, memo: '고침', left_on: '2026-10-31', registered_on: '2025-03-02' }])
    await become(A)
    expect((await db.query(`update ${MEMBERS} set carry_start = 2.5, used_before = 1`)).affectedRows).toBe(1)
    await operator()
    expect(await rows(`select carry_start::float8 as c, registered_on::text as d from ${MEMBERS}`)).toEqual([{ c: 2.5, d: '2025-03-02' }])
  })
})

describe('AC-7601.8 두 칸이 없는 앞 판 표를 실행한 DB에 다시 붙여 넣기', SLOW, () => {
  let old: PGlite
  let ids: Record<string, string> = {}
  let existing = ''
  let pastedOn = ''

  beforeAll(async () => {
    old = await PGlite.create()
    await migrateChain(old)
    await old.exec(STAFF_MIGRATION)
    // 앞 판(2026-11-21 넘어온 연차 전): 두 칸이 없던 표. 칸 권한은 칸과 함께 없어진다. 그 판으로 직원 한 사람을 이미 넣었다
    await old.exec('alter table public.staff_members drop column if exists carry_start, drop column if exists registered_on')
    ids = await seedPeople(old)
    existing = (await seedRow('staff_members', ids[A], MEMBER, old)).id as string
    await operator(old)
    pastedOn = (await rows(`select (now() at time zone 'Asia/Seoul')::date::text as d`, [], old))[0].d as string
    await old.exec(STAFF_MIGRATION)
  }, 240_000)

  afterAll(async () => {
    await old.close()
  })

  it('AC-7601.8: 두 칸이 처음부터 만든 표와 같은 정의(형·자리·not null·기본값·검사 제약)로 생긴다', async () => {
    for (const column of ['carry_start', 'registered_on']) {
      const made = await memberColumn(column, old)
      expect([column, made]).toEqual([column, expect.objectContaining({ is_nullable: 'NO' })])
      expect([column, made]).toEqual([column, await memberColumn(column, db)])
      expect([column, await checksOn(column, old)]).toEqual([column, await checksOn(column, db)])
    }
    // 칸 차례(맨 끝에 붙음) 말고는 처음부터 만든 DB와 모양이 같다
    const shape = orderFree(await shapeOf(old))
    const freshShape = orderFree(await shapeOf(db))
    for (const key of ['columns', 'constraints', 'indexes', 'access', 'policies', 'triggers', 'functions', 'buckets'] as const) {
      expect([key, shape[key]]).toEqual([key, freshShape[key]])
    }
  })

  it('AC-7601.8: 이미 있던 직원은 넘어온 연차 시작 값 0·등록일 = 붙여 넣은 날(한국 오늘)이고 다른 칸은 그대로다', async () => {
    await operator(old)
    expect(
      await rows(`select id, name, hired_on::text as hired, carry_start::float8 as c, registered_on::text as d from ${MEMBERS}`, [], old),
    ).toEqual([{ id: existing, name: MEMBER.name, hired: MEMBER.hired_on, c: 0, d: pastedOn }])
  })

  it('AC-7601.8: 칸 권한이 design.md 1절 표 그대로가 되고, 원장이 넘어온 연차 시작 값을 넣고 고치며 registered_on은 넣지도 고치지도 못한다', async () => {
    await operator(old)
    const found = await rows(
      `select column_name, privilege_type from information_schema.column_privileges
       where grantee = 'authenticated' and table_schema = 'public' and table_name = 'staff_members' and privilege_type in ('INSERT', 'UPDATE')`,
      [],
      old,
    )
    for (const privilege of ['INSERT', 'UPDATE']) {
      const columns = found
        .filter((r) => r.privilege_type === privilege)
        .map((r) => r.column_name as string)
        .sort()
      expect([privilege, columns]).toEqual([privilege, [...GRANTS.staff_members.insert].sort()])
    }
    await become(A, old)
    await postgrestInsert(MEMBERS, [{ ...MEMBER, name: '이바다', carry_start: -0.5 }], null, old)
    await become(A, old)
    await expect(postgrestInsert(MEMBERS, [{ ...MEMBER, name: '박구름', carry_start: 1.3 }], null, old)).rejects.toMatchObject(CHECK_FAILED)
    await become(A, old)
    expect((await old.query(`update ${MEMBERS} set carry_start = 4 where id = $1`, [existing])).affectedRows).toBe(1)
    await become(A, old)
    await expect(old.query(`update ${MEMBERS} set registered_on = '2020-01-01'`)).rejects.toMatchObject(DENIED)
    await operator(old)
    expect(await rows(`select name, carry_start::float8 as c, registered_on::text as d from ${MEMBERS} order by name`, [], old)).toEqual([
      { name: MEMBER.name, c: 4, d: pastedOn },
      { name: '이바다', c: -0.5, d: pastedOn },
    ])
  })

  it('AC-7601.8: 한 번 더 붙여 넣어도 모양과 줄이 그대로다', async () => {
    const shape = await shapeOf(old)
    const data = await everything(old)
    await operator(old)
    await old.exec(STAFF_MIGRATION)
    expect(await shapeOf(old)).toEqual(shape)
    expect(await everything(old)).toEqual(data)
  })
})

describe('AC-7602.1 calendar_allday 두 칸', SLOW, () => {
  it("AC-7602.1: calendar_allday 끝에 part(text)·leave_id(uuid)가 있고, part 제약 calendar_allday_part와 leave_id → staff_leaves(id) on delete cascade가 있다", async () => {
    const columns = await rows(
      `select column_name, udt_name, is_nullable, column_default from information_schema.columns
       where table_schema = 'public' and table_name = 'calendar_allday' order by ordinal_position`,
    )
    expect(columns.slice(-2)).toEqual([
      { column_name: 'part', udt_name: 'text', is_nullable: 'YES', column_default: null },
      { column_name: 'leave_id', udt_name: 'uuid', is_nullable: 'YES', column_default: null },
    ])
    const part = await rows(`select pg_get_constraintdef(oid) as def from pg_constraint where conrelid = to_regclass($1) and conname = 'calendar_allday_part'`, [ALLDAY])
    expect(part).toHaveLength(1)
    for (const word of ['part IS NULL', "type = 'off'", "'am'", "'pm'"]) expect(part[0].def).toContain(word)
    const fk = await rows(
      `select pg_get_constraintdef(oid) as def from pg_constraint where conrelid = to_regclass($1) and contype = 'f' and pg_get_constraintdef(oid) like '%leave_id%'`,
      [ALLDAY],
    )
    expect(fk.map((f) => f.def)).toEqual([expect.stringMatching(/^FOREIGN KEY \(leave_id\) REFERENCES (public\.)?staff_leaves\(id\) ON DELETE CASCADE$/)])
  })

  it('AC-7602.1: 두 칸은 읽기만 되고(원장·데스크 표 권한) 넣기·고치기 권한이 없으며, 사용자 넣기 칸은 옛 다섯 그대로다', async () => {
    const insertColumns = await rows(
      `select column_name from information_schema.column_privileges
       where grantee = 'authenticated' and table_schema = 'public' and table_name = 'calendar_allday' and privilege_type = 'INSERT' order by 1`,
    )
    expect(insertColumns.map((r) => r.column_name)).toEqual(['day', 'memo', 'staff_id', 'staff_name', 'type'])
    for (const column of ['part', 'leave_id']) {
      const can = async (role: string, privilege: string) =>
        (await rows(`select has_column_privilege($1, $2, $3, $4) as ok`, [role, ALLDAY, column, privilege]))[0].ok
      expect([column, await can('authenticated', 'SELECT')]).toEqual([column, true])
      for (const privilege of ['INSERT', 'UPDATE', 'REFERENCES']) expect([column, privilege, await can('authenticated', privilege)]).toEqual([column, privilege, false])
      for (const privilege of ['SELECT', 'INSERT', 'UPDATE']) expect([column, privilege, await can('anon', privilege)]).toEqual([column, privilege, false])
    }
    const policies = await rows(`select policyname from pg_policies where schemaname = 'public' and tablename = 'calendar_allday' order by 1`)
    expect(policies.map((p) => p.policyname)).toEqual(['데스크 종일 줄', '승인된 내 병원 종일 줄만'])
  })

  it("AC-7602.1: part는 'off' 줄의 'am'·'pm'·null만 받는다(운영자로 넣어도 23514)", async () => {
    await operator()
    const insert = (type: string, part: string | null) =>
      db.query(
        `insert into ${ALLDAY} (hospital_id, day, type, memo, staff_id, staff_name, part) values ($1, '2026-11-02', $2, $3, $4, $5, $6)`,
        type === 'memo' ? [hospital[A], 'memo', '메모', null, null, part] : [hospital[A], 'off', null, `st-${part}`, '가', part],
      )
    await expect(insert('memo', 'am')).rejects.toMatchObject(CHECK_FAILED)
    await expect(insert('off', 'noon')).rejects.toMatchObject(CHECK_FAILED)
    await expect(insert('off', 'AM')).rejects.toMatchObject(CHECK_FAILED)
    await insert('off', 'am')
    await insert('off', 'pm')
    await insert('off', null)
    await insert('memo', null)
    expect(await rows(`select count(*)::int as n from ${ALLDAY}`)).toEqual([{ n: 4 }])
  })

  it('AC-7602.1: 원장·데스크 모두 part·leave_id를 보내 종일 줄을 넣으면 권한 없음(42501)이고, 옛 다섯 칸으로는 그대로 넣는다', async () => {
    const staff = (await seedRow('staff_members', hospital[A], MEMBER)).id as string
    const leave = (await seedRow('staff_leaves', hospital[A], BODY.staff_leaves(staff))).id as string
    const off = { day: '2026-11-03', type: 'off', memo: null, staff_id: 'st-na', staff_name: '나치료사' }
    for (const user of [A, K]) {
      await become(user)
      await expect(postgrestInsert(ALLDAY, [{ ...off, part: 'am' }]), user).rejects.toMatchObject(DENIED)
      await become(user)
      await expect(postgrestInsert(ALLDAY, [{ ...off, leave_id: leave }]), user).rejects.toMatchObject(DENIED)
      await become(user)
      await expect(db.query(`update ${ALLDAY} set part = 'am'`), user).rejects.toMatchObject(DENIED)
    }
    await become(K)
    await postgrestInsert(ALLDAY, [off])
    await become(A)
    await postgrestInsert(ALLDAY, [{ day: '2026-11-04', type: 'memo', memo: '회식', staff_id: null, staff_name: null }])
    expect(await alldayOf(hospital[A])).toEqual([
      { day: '2026-11-03', type: 'off', memo: null, staff_id: 'st-na', staff_name: '나치료사', part: null, leave_id: null },
      { day: '2026-11-04', type: 'memo', memo: '회식', staff_id: null, staff_name: null, part: null, leave_id: null },
    ])
  })
})

describe('AC-7602 휴가 → 예약 휴무 트리거', SLOW, () => {
  const leave = (staff: string, day: string, extra: Row = {}): Row => ({
    group_id: GROUP,
    staff_id: staff,
    day,
    kind: 'annual',
    part: null,
    paid: true,
    memo: null,
    ...extra,
  })
  async function addLeaves(user: string, body: Row[]) {
    await become(user)
    return (await postgrestInsert(LEAVES, body, null, db, 'id, day::text as day')).rows
  }
  const linked = async (calendarId: string | null, name = '나직원', h = hospital[A]) =>
    (await seedRow('staff_members', h, { ...MEMBER, name, calendar_staff_id: calendarId })).id as string
  const off = (day: string, staffId: string, staffName: string, leaveId: string | null, part: string | null = null) => ({
    day,
    type: 'off',
    memo: null,
    staff_id: staffId,
    staff_name: staffName,
    part,
    leave_id: leaveId,
  })

  it('AC-7602.2: 이어진 직원의 연차를 넣으면 같은 날 그 시행자 휴무 줄(병원 정보 이름·종일)이 생기고 내 rev만 오른다', async () => {
    await seedProfile(hospital[A])
    const staff = await linked('st-na')
    const revA = await revOf(hospital[A])
    await operator()
    await db.query(`insert into public.calendar_rev (hospital_id, rev) values ($1, 7)`, [hospital[B]])
    const [added] = await addLeaves(A, [leave(staff, '2026-11-07')])
    expect(await alldayOf(hospital[A])).toEqual([off('2026-11-07', 'st-na', '나치료사', added.id as string)])
    expect(await revOf(hospital[A])).toBeGreaterThan(revA)
    expect(await revOf(hospital[B])).toBe(7)
  })

  it('AC-7602.2: 반차는 오전·오후가 part에 들고, 여러 날 묶음은 날마다 한 줄이며, 데스크도 그 줄(part·leave_id)을 읽는다', async () => {
    await seedProfile(hospital[A])
    const staff = await linked('st-na')
    const added = await addLeaves(A, [
      leave(staff, '2026-11-13', { kind: 'half', part: 'pm' }),
      leave(staff, '2026-11-14', { kind: 'half', part: 'am' }),
      leave(staff, '2026-11-16', { kind: 'sick', paid: false }),
    ])
    const id = Object.fromEntries(added.map((r) => [r.day, r.id as string]))
    const expected = [
      off('2026-11-13', 'st-na', '나치료사', id['2026-11-13'], 'pm'),
      off('2026-11-14', 'st-na', '나치료사', id['2026-11-14'], 'am'),
      off('2026-11-16', 'st-na', '나치료사', id['2026-11-16']),
    ]
    expect(await alldayOf(hospital[A])).toEqual(expected)
    await become(K)
    expect(
      await rows(`select day::text as day, type, memo, staff_id, staff_name, part, leave_id from ${ALLDAY} order by day`),
    ).toEqual(expected)
  })

  it('AC-7602.2: 그날 그 시행자 휴무 줄이 이미 있으면(손으로 넣음) 새로 만들지 않고 손 줄은 그대로다', async () => {
    await seedProfile(hospital[A])
    const staff = await linked('st-na')
    const hand = await seedHandOff(hospital[A], '2026-11-07', 'st-na', '나')
    const added = await addLeaves(A, [leave(staff, '2026-11-07'), leave(staff, '2026-11-09')])
    const id = Object.fromEntries(added.map((r) => [r.day, r.id as string]))
    expect(await alldayOf(hospital[A])).toEqual([off('2026-11-07', 'st-na', '나', null), off('2026-11-09', 'st-na', '나치료사', id['2026-11-09'])])
    await operator()
    expect(await rows(`select id from ${ALLDAY} where day = '2026-11-07'`)).toEqual([{ id: hand }])
  })

  it('AC-7602.2: 연결이 없거나, 병원 정보 목록에 그 id가 없거나(다른 병원 목록에만 있음), 병원 정보 줄이 없으면 만들지 않고 휴가는 들어간다', async () => {
    await seedProfile(hospital[B], [{ id: 'st-only-b', name: '비사람', role: 'staff', mark: '비', color: 'teal', calendar: true }])
    const none = await linked(null, '연결없음')
    const missing = await linked('st-only-b', '목록밖')
    await addLeaves(A, [leave(none, '2026-11-07'), leave(missing, '2026-11-07')])
    expect(await alldayOf(hospital[A])).toEqual([])
    await operator()
    await db.query(`delete from ${PROFILES}`)
    const noProfile = await linked('st-na', '병원정보없음')
    await addLeaves(A, [leave(noProfile, '2026-11-08')])
    expect(await alldayOf(hospital[A])).toEqual([])
    await operator()
    expect(await rows(`select count(*)::int as n from ${LEAVES}`)).toEqual([{ n: 3 }])
    expect(await alldayOf(hospital[B])).toEqual([])
  })

  it('AC-7602.2: 병원 정보 이름이 10자를 넘으면 앞 10자로 적는다', async () => {
    await seedProfile(hospital[A])
    const staff = await linked('st-long')
    const [added] = await addLeaves(A, [leave(staff, '2026-11-07')])
    expect(await alldayOf(hospital[A])).toEqual([off('2026-11-07', 'st-long', '가나다라마바사아자차', added.id as string)])
  })

  it('AC-7602.3: 이어진 휴가를 지우면 그 줄도 지워지고 rev가 오르며, 묶음 고치기(지우고 다시 넣기)는 새 날 줄을 만들고 손 줄은 그대로다', async () => {
    await seedProfile(hospital[A])
    const staff = await linked('st-na')
    await seedHandOff(hospital[A], '2026-11-20', 'st-na', '나')
    await addLeaves(A, [leave(staff, '2026-11-07'), leave(staff, '2026-11-09')])
    const rev = await revOf(hospital[A])
    await become(A)
    expect((await db.query(`delete from ${LEAVES} where group_id = $1`, [GROUP])).affectedRows).toBe(2)
    expect(await alldayOf(hospital[A])).toEqual([off('2026-11-20', 'st-na', '나', null)])
    expect(await revOf(hospital[A])).toBeGreaterThan(rev)
    const added = await addLeaves(A, [leave(staff, '2026-11-10', { kind: 'half', part: 'am' })])
    expect(await alldayOf(hospital[A])).toEqual([
      off('2026-11-10', 'st-na', '나치료사', added[0].id as string, 'am'),
      off('2026-11-20', 'st-na', '나', null),
    ])
  })

  it('AC-7602.3: 손으로 넣은 휴무와 같은 날 휴가를 지워도 손 줄은 그대로다', async () => {
    await seedProfile(hospital[A])
    const staff = await linked('st-na')
    await seedHandOff(hospital[A], '2026-11-07', 'st-na', '나')
    await addLeaves(A, [leave(staff, '2026-11-07')])
    await become(A)
    await db.query(`delete from ${LEAVES}`)
    expect(await alldayOf(hospital[A])).toEqual([off('2026-11-07', 'st-na', '나', null)])
  })

  it('AC-7602.4: 연결을 끊으면 그 직원 휴가에서 온 줄이 모두 지워지고 rev가 오르며, 손 줄·다른 직원 줄은 그대로다', async () => {
    await seedProfile(hospital[A])
    const staff = await linked('st-na')
    const other = await linked('st-da', '다른직원')
    await seedHandOff(hospital[A], '2026-11-20', 'st-na', '나')
    await addLeaves(A, [leave(staff, '2026-11-07'), leave(staff, '2026-11-09')])
    const [kept] = await addLeaves(A, [leave(other, '2026-11-07')])
    const rev = await revOf(hospital[A])
    await become(A)
    expect((await db.query(`update ${MEMBERS} set calendar_staff_id = null where id = $1`, [staff])).affectedRows).toBe(1)
    expect(await alldayOf(hospital[A])).toEqual([off('2026-11-07', 'st-da', '다치료사', kept.id as string), off('2026-11-20', 'st-na', '나', null)])
    expect(await revOf(hospital[A])).toBeGreaterThan(rev)
    await operator()
    expect(await rows(`select count(*)::int as n from ${LEAVES}`)).toEqual([{ n: 3 }])
  })

  it('AC-7602.4: 다른 시행자로 바꾸면 옛 줄이 지워지고 한국 오늘 − 1년 이후 휴가로 새 시행자 줄이 생긴다(그날 새 시행자 손 줄은 그대로)', async () => {
    await seedProfile(hospital[A])
    const staff = await linked('st-na')
    const today = await koreaToday()
    const yearAgo = await shiftDay(today, '-1 year')
    const tooOld = await shiftDay(yearAgo, '-1 day')
    const soon = await shiftDay(today, '7 days')
    const handDay = await shiftDay(today, '8 days')
    await seedHandOff(hospital[A], handDay, 'st-da', '다')
    const added = await addLeaves(A, [leave(staff, tooOld), leave(staff, yearAgo), leave(staff, soon, { kind: 'half', part: 'pm' }), leave(staff, handDay)])
    const id = Object.fromEntries(added.map((r) => [r.day, r.id as string]))
    expect((await alldayOf(hospital[A])).filter((r) => r.staff_id === 'st-na')).toHaveLength(4)
    await become(A)
    await db.query(`update ${MEMBERS} set calendar_staff_id = 'st-da' where id = $1`, [staff])
    expect(await alldayOf(hospital[A])).toEqual([
      off(yearAgo, 'st-da', '다치료사', id[yearAgo]),
      off(soon, 'st-da', '다치료사', id[soon], 'pm'),
      off(handDay, 'st-da', '다', null),
    ])
    const [later] = await addLeaves(A, [leave(staff, await shiftDay(today, '9 days'))])
    expect((await alldayOf(hospital[A])).filter((r) => r.leave_id === later.id).map((r) => r.staff_id)).toEqual(['st-da'])
  })

  it('AC-7602.4: 연결 칸이 그대로면(다른 칸만 고치거나 같은 값으로 고침) 휴가 줄을 다시 만들지 않는다', async () => {
    await seedProfile(hospital[A])
    const staff = await linked('st-na')
    await addLeaves(A, [leave(staff, '2026-11-07')])
    await operator()
    const before = await rows(`select id, created_at from ${ALLDAY}`)
    await become(A)
    await db.query(`update ${MEMBERS} set memo = '고침' where id = $1`, [staff])
    await become(A)
    await db.query(`update ${MEMBERS} set calendar_staff_id = 'st-na' where id = $1`, [staff])
    await operator()
    expect(await rows(`select id, created_at from ${ALLDAY}`)).toEqual(before)
  })

  it('AC-7602.4: 끊었다가 다시 이으면 그 휴가 줄이 다시 생긴다', async () => {
    await seedProfile(hospital[A])
    const staff = await linked('st-na')
    const [added] = await addLeaves(A, [leave(staff, (await shiftDay(await koreaToday(), '3 days')))])
    await become(A)
    await db.query(`update ${MEMBERS} set calendar_staff_id = null`)
    expect(await alldayOf(hospital[A])).toEqual([])
    await become(A)
    await db.query(`update ${MEMBERS} set calendar_staff_id = 'st-na'`)
    expect((await alldayOf(hospital[A])).map((r) => [r.staff_id, r.leave_id])).toEqual([['st-na', added.id]])
  })

  it('AC-7602.5: 데스크가 휴가에서 온 줄을 예약 달력에서 지우면 지워지고 휴가는 그대로다', async () => {
    await seedProfile(hospital[A])
    const staff = await linked('st-na')
    const [added] = await addLeaves(A, [leave(staff, '2026-11-07')])
    await become(K)
    expect(await rows(`delete from ${ALLDAY} where leave_id = $1 returning day::text as day`, [added.id])).toEqual([{ day: '2026-11-07' }])
    expect(await alldayOf(hospital[A])).toEqual([])
    await become(A)
    expect(await rows(`select id from ${LEAVES}`)).toEqual([{ id: added.id }])
  })
})

describe('AC-7603.1 바구니 staff-files', SLOW, () => {
  it('AC-7603.1: staff-files 바구니는 공개가 아니고 한 파일 10,000,000바이트·PDF·JPEG·PNG·ZIP·XLSX·XLS만이다', async () => {
    await operator()
    const [bucket] = await rows(`select id, name, public, file_size_limit, allowed_mime_types from storage.buckets where id = $1`, [BUCKET])
    expect(bucket).toMatchObject({ id: BUCKET, name: BUCKET, public: false, file_size_limit: 10_000_000 })
    expect([...(bucket.allowed_mime_types as string[])].sort()).toEqual([...TAX_MIMES].sort())
  })

  it('AC-7603.2: storage.objects의 staff-files 정책은 읽기·올리기·지우기 셋뿐이고(고치기 없음), 첫 폴더 = my_hospital_id()·올리기는 staff_files 줄이 먼저다', async () => {
    const list = await rows(
      `select cmd, permissive, roles::text as roles, coalesce(qual, '') as qual, coalesce(with_check, '') as with_check from pg_policies
       where schemaname = 'storage' and tablename = 'objects' and (coalesce(qual, '') || coalesce(with_check, '')) like '%staff-files%' order by cmd`,
    )
    expect(list.map((p) => p.cmd)).toEqual(['DELETE', 'INSERT', 'SELECT'])
    for (const policy of list) {
      expect(policy).toMatchObject({ permissive: 'PERMISSIVE', roles: '{authenticated}' })
      const rule = String(policy.cmd === 'INSERT' ? policy.with_check : policy.qual)
      for (const word of [`'${BUCKET}'`, 'foldername', 'my_hospital_id()']) expect(rule).toContain(word)
      if (policy.cmd === 'INSERT') expect(rule).toMatch(/staff_files[\s\S]*path/)
      else expect(rule).not.toContain('staff_files')
      expect(rule).not.toMatch(/my_desk|my_clinic/)
    }
  })
})

describe('AC-7603.2 직원 파일 올리기·읽기·지우기', SLOW, () => {
  let staffA = ''
  let staffB = ''
  beforeEach(async () => {
    staffA = (await seedRow('staff_members', hospital[A], MEMBER)).id as string
    staffB = (await seedRow('staff_members', hospital[B], MEMBER)).id as string
  })

  it('AC-7603.2: 원장 A는 staff_files 줄을 먼저 넣고 같은 이름으로 올리고(서류·세무사 파일), 자기 폴더 파일을 읽고 지운다', async () => {
    const doc = docFile(hospital[A], staffA)
    const tax = taxFile(hospital[A])
    for (const file of [doc, tax]) {
      await become(A)
      await postgrestInsert(FILES, [file])
      expect(await upload(file.path as string)).toEqual([{ bucket_id: BUCKET, name: file.path }])
    }
    await become(A)
    expect((await rows(`select name from storage.objects order by name`)).map((r) => r.name)).toEqual([doc.path, tax.path].sort())
    expect(await rows(`delete from storage.objects where name = $1 returning name`, [doc.path])).toEqual([{ name: doc.path }])
    expect(await objects()).toEqual([{ bucket_id: BUCKET, name: tax.path }])
  })

  it('AC-7603.2: 줄 없이·줄과 다른 이름·다른 바구니로는 올리지 못하고, 줄을 지운 뒤에도 못 올린다', async () => {
    const file = docFile(hospital[A], staffA)
    await become(A)
    await expect(upload(file.path as string)).rejects.toThrow(RLS_REJECTED)
    await become(A)
    await postgrestInsert(FILES, [file])
    for (const name of [docFile(hospital[A], staffA).path as string, `${hospital[A]}/x.pdf`, 'x.pdf']) {
      await become(A)
      await expect(upload(name), name).rejects.toThrow(RLS_REJECTED)
    }
    await become(A)
    await expect(upload(file.path as string, OTHER_BUCKET)).rejects.toThrow(RLS_REJECTED)
    await become(A)
    await db.query(`delete from ${FILES}`)
    await expect(upload(file.path as string)).rejects.toThrow(RLS_REJECTED)
    expect(await objects()).toEqual([])
  })

  it('AC-7603.2: 다른 병원 파일·다른 바구니의 내 폴더 파일은 안 보이고 안 지워지며, B의 줄과 같은 이름으로 올릴 수 없다', async () => {
    const fileB = docFile(hospital[B], staffB)
    await seedRow('staff_files', hospital[B], fileB)
    await seedObject(fileB.path as string)
    await seedObject(`${hospital[A]}/doc/${staffA}/${randomUUID()}.pdf`, OTHER_BUCKET)
    const before = await objects()
    await become(A)
    expect(await rows(`select name from storage.objects`)).toEqual([])
    expect(await rows(`delete from storage.objects returning name`)).toEqual([])
    await expect(upload(taxFile(hospital[B]).path as string)).rejects.toThrow(RLS_REJECTED)
    expect(await objects()).toEqual(before)
  })

  it('AC-7603.2: 덮어쓰기(고치기)는 내 파일이어도 0줄이다', async () => {
    const file = docFile(hospital[A], staffA)
    await seedRow('staff_files', hospital[A], file)
    await seedObject(file.path as string)
    const before = await objects()
    await become(A)
    expect(await rows(`update storage.objects set metadata = '{}'::jsonb returning name`)).toEqual([])
    expect(await rows(`update storage.objects set name = $1 returning name`, [docFile(hospital[A], staffA).path])).toEqual([])
    expect(await objects()).toEqual(before)
  })

  it.each<[string, string]>([
    ['A의 데스크', K],
    ['승인 대기', C],
    ['거절', D],
    ['병원 줄 없음', E],
  ])('AC-7603.2: %s 사용자는 직원 파일을 못 보고 못 올리고 못 지운다', async (_name, user) => {
    const fileA = docFile(hospital[A], staffA)
    await seedRow('staff_files', hospital[A], fileA)
    await seedObject(fileA.path as string)
    let own = fileA
    if (hospital[user]) {
      const staff = (await seedRow('staff_members', hospital[user], MEMBER)).id as string
      own = docFile(hospital[user], staff)
      await seedRow('staff_files', hospital[user], own)
    }
    const before = await objects()
    await become(user)
    expect(await rows(`select name from storage.objects`)).toEqual([])
    await expect(upload(own.path as string)).rejects.toThrow(RLS_REJECTED)
    await become(user)
    expect(await rows(`delete from storage.objects returning name`)).toEqual([])
    expect(await objects()).toEqual(before)
  })

  it('AC-7603.2: anon은 직원 파일을 못 보고 못 올리고 못 고치고 못 지운다', async () => {
    const file = docFile(hospital[A], staffA)
    await seedRow('staff_files', hospital[A], file)
    await seedObject(file.path as string)
    const before = await objects()
    await becomeAnon()
    expect(await rows(`select name from storage.objects`)).toEqual([])
    await expect(upload(taxFile(hospital[A]).path as string)).rejects.toThrow(RLS_REJECTED)
    expect(await rows(`update storage.objects set metadata = '{}'::jsonb returning name`)).toEqual([])
    expect(await rows(`delete from storage.objects returning name`)).toEqual([])
    expect(await objects()).toEqual(before)
  })
})

describe('AC-7603.3 파일 줄 제약·20개 한도', SLOW, () => {
  let staff = ''
  let other = ''
  beforeEach(async () => {
    staff = (await seedRow('staff_members', hospital[A], MEMBER)).id as string
    other = (await seedRow('staff_members', hospital[A], { ...MEMBER, name: '다른사람' })).id as string
  })
  const addFile = (file: Row) => postgrestInsert(FILES, [file])
  const ext = (mime: string) => ({ 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'application/zip': 'zip', [XLSX]: 'xlsx', [XLS]: 'xls' })[mime] as string

  it('AC-7603.3: 서류는 PDF·JPEG·PNG, 세무사 파일은 PDF·ZIP·XLSX·XLS·JPEG·PNG가 들어가고, 이름 1~100자·크기 1~10,000,000이다', async () => {
    for (const mime of DOC_MIMES) {
      await become(A)
      await addFile(docFile(hospital[A], staff, ext(mime), mime))
    }
    for (const mime of TAX_MIMES) {
      await become(A)
      await addFile(taxFile(hospital[A], '2026-11', ext(mime), mime))
    }
    await become(A)
    await addFile({ ...docFile(hospital[A], staff), name: '가', size: 1 })
    await become(A)
    await addFile({ ...taxFile(hospital[A]), name: '가'.repeat(100), size: 10_000_000 })
    await operator()
    expect(await rows(`select kind, count(*)::int as n from ${FILES} group by 1 order by 1`)).toEqual([
      { kind: 'doc', n: DOC_MIMES.length + 1 },
      { kind: 'tax', n: TAX_MIMES.length + 1 },
    ])
  })

  it.each<[string, (h: string, staff: string, other: string) => Row]>([
    ['종류 둘 밖', (h, s) => ({ ...docFile(h, s), kind: 'photo' })],
    ['서류에 달 있음', (h, s) => ({ ...docFile(h, s), month: '2026-11' })],
    ['서류에 직원 없음', (h, s) => ({ ...docFile(h, s), staff_id: null })],
    ['서류 ZIP', (h, s) => docFile(h, s, 'zip', 'application/zip')],
    ['서류 XLSX', (h, s) => docFile(h, s, 'xlsx', XLSX)],
    ['세무사 파일에 직원 있음', (h, s) => ({ ...taxFile(h), staff_id: s })],
    ['세무사 파일에 달 없음', (h) => ({ ...taxFile(h), month: null })],
    ['세무사 파일 글자 파일', (h) => taxFile(h, '2026-11', 'txt', 'text/plain')],
    ['세무사 파일 달 13월', (h) => taxFile(h, '2026-13')],
    ['첫 폴더가 다른 병원', (h, s) => ({ ...docFile(h, s), path: `${hospital[B]}/doc/${s}/${randomUUID()}.pdf` })],
    ['서류 폴더의 직원이 다름', (h, s, o) => ({ ...docFile(h, s), path: `${h}/doc/${o}/${randomUUID()}.pdf` })],
    ['세무사 폴더의 달이 다름', (h) => ({ ...taxFile(h, '2026-11'), path: `${h}/tax/2026-10/${randomUUID()}.xlsx` })],
    ['서류인데 세무사 폴더', (h, s) => ({ ...docFile(h, s), path: `${h}/tax/2026-11/${randomUUID()}.pdf` })],
    ['세무사 파일인데 서류 폴더', (h, s) => ({ ...taxFile(h), path: `${h}/doc/${s}/${randomUUID()}.xlsx` })],
    ['확장자 대문자', (h, s) => ({ ...docFile(h, s), path: `${h}/doc/${s}/${randomUUID()}.PDF` })],
    ['확장자 6자', (h, s) => ({ ...docFile(h, s), path: `${h}/doc/${s}/${randomUUID()}.pdfxyz` })],
    ['확장자 없음', (h, s) => ({ ...docFile(h, s), path: `${h}/doc/${s}/${randomUUID()}` })],
    ['파일 이름이 uuid 아님', (h, s) => ({ ...docFile(h, s), path: `${h}/doc/${s}/계약서.pdf` })],
    ['uuid 대문자', (h, s) => ({ ...docFile(h, s), path: `${h}/doc/${s}/${randomUUID().toUpperCase()}.pdf` })],
    ['폴더 하나 더', (h, s) => ({ ...docFile(h, s), path: `${h}/doc/${s}/x/${randomUUID()}.pdf` })],
    ['이름 빈 글자', (h, s) => ({ ...docFile(h, s), name: '' })],
    ['이름 101자', (h, s) => ({ ...docFile(h, s), name: '가'.repeat(101) })],
    ['크기 0', (h, s) => ({ ...docFile(h, s), size: 0 })],
    ['크기 10,000,001', (h, s) => ({ ...docFile(h, s), size: 10_000_001 })],
  ])('AC-7603.3: %s는 거부(23514)된다', async (_name, make) => {
    await become(A)
    await expect(addFile(make(hospital[A], staff, other))).rejects.toMatchObject(CHECK_FAILED)
    await operator()
    expect(await rows(`select * from ${FILES}`)).toEqual([])
  })

  it('AC-7603.3: 같은 경로는 하나(23505)이고 이름·크기·종류는 비울 수 없다(23502)', async () => {
    const file = docFile(hospital[A], staff)
    await become(A)
    await addFile(file)
    await become(A)
    await expect(addFile({ ...file, name: '다른.pdf' })).rejects.toMatchObject(UNIQUE)
    for (const column of ['name', 'size', 'mime', 'kind', 'path']) {
      await become(A)
      await expect(addFile({ ...docFile(hospital[A], staff), [column]: null }), column).rejects.toMatchObject(NOT_NULL)
    }
  })

  it('AC-7603.3: 직원마다 서류 20개까지이고 21번째는 거절(23514), 다른 직원은 따로 세며 하나 지우면 다시 된다', async () => {
    await become(A)
    await expect(postgrestInsert(FILES, Array.from({ length: 21 }, () => docFile(hospital[A], staff)))).rejects.toMatchObject(CHECK_FAILED)
    await become(A)
    await postgrestInsert(FILES, Array.from({ length: 20 }, () => docFile(hospital[A], staff)))
    await become(A)
    await expect(addFile(docFile(hospital[A], staff))).rejects.toMatchObject({ ...CHECK_FAILED, message: expect.stringContaining('20') })
    await become(A)
    await addFile(docFile(hospital[A], other))
    await become(A)
    await db.query(`delete from ${FILES} where id = (select id from ${FILES} where staff_id = $1 limit 1)`, [staff])
    await become(A)
    await addFile(docFile(hospital[A], staff))
    await operator()
    expect(await rows(`select staff_id, count(*)::int as n from ${FILES} group by 1 order by 2`)).toEqual([
      { staff_id: other, n: 1 },
      { staff_id: staff, n: 20 },
    ])
  })

  it('AC-7603.3: 달마다 세무사 파일 20개까지이고 21번째는 거절(23514), 다른 달·다른 병원의 같은 달은 따로 센다', async () => {
    await operator()
    await postgrestInsert(FILES, Array.from({ length: 20 }, () => ({ hospital_id: hospital[B], ...taxFile(hospital[B]) })))
    await become(A)
    await postgrestInsert(FILES, Array.from({ length: 20 }, () => taxFile(hospital[A])))
    await become(A)
    await expect(addFile(taxFile(hospital[A]))).rejects.toMatchObject(CHECK_FAILED)
    await become(A)
    await addFile(taxFile(hospital[A], '2026-12'))
    await become(A)
    await addFile(docFile(hospital[A], staff))
    await operator()
    expect(await rows(`select hospital_id, kind, month, count(*)::int as n from ${FILES} group by 1, 2, 3 order by 1, 2, 3`)).toEqual(
      [
        { hospital_id: hospital[A], kind: 'doc', month: null, n: 1 },
        { hospital_id: hospital[A], kind: 'tax', month: '2026-11', n: 20 },
        { hospital_id: hospital[A], kind: 'tax', month: '2026-12', n: 1 },
        { hospital_id: hospital[B], kind: 'tax', month: '2026-11', n: 20 },
      ].sort((x, y) => (`${x.hospital_id}${x.kind}${x.month}` < `${y.hospital_id}${y.kind}${y.month}` ? -1 : 1)),
    )
  })
})

describe('AC-7601.1·AC-7602.1·AC-7603.1 이미 있는 DB에 붙여 넣기·두 번 실행', SLOW, () => {
  let fresh: PGlite
  let ids: Record<string, string> = {}
  let before: Awaited<ReturnType<typeof shapeOf>>
  let once: Awaited<ReturnType<typeof shapeOf>>
  let alldayBefore: Row[] = []
  const NEW_TABLE = /^(public\.)?staff_/
  const isNew = (table: unknown) => NEW_TABLE.test(String(table))

  beforeAll(async () => {
    fresh = await PGlite.create()
    await migrateChain(fresh)
    ids = await seedPeople(fresh)
    await seedProfile(ids[A], PROFILE_STAFF, fresh)
    await operator(fresh)
    await fresh.query(
      `insert into ${ALLDAY} (hospital_id, day, type, memo, staff_id, staff_name) values
         ($1, '2026-11-02', 'memo', '회식', null, null), ($1, '2026-11-03', 'off', null, 'st-na', '나'), ($2, '2026-11-03', 'off', null, 'st-x', '엑')`,
      [ids[A], ids[B]],
    )
    alldayBefore = await rows(`select id, hospital_id, day::text as day, type, memo, staff_id, staff_name, created_at from ${ALLDAY} order by id`, [], fresh)
    before = await shapeOf(fresh)
    await operator(fresh)
    await fresh.exec(STAFF_MIGRATION)
    once = await shapeOf(fresh)
  }, 240_000)

  afterAll(async () => {
    await fresh.close()
  })

  it('AC-7602.1: 이미 있던 종일 줄은 그대로이고 part·leave_id는 null이다', async () => {
    expect(alldayBefore).toHaveLength(3)
    await operator(fresh)
    expect(
      await rows(`select id, hospital_id, day::text as day, type, memo, staff_id, staff_name, created_at, part, leave_id from ${ALLDAY} order by id`, [], fresh),
    ).toEqual(alldayBefore.map((row) => ({ ...row, part: null, leave_id: null })))
  })

  it('AC-7602.1: 이 파일 전에 있던 표·칸·제약·색인·권한·정책·트리거·함수는 calendar_allday 두 칸·제약 둘 말고 그대로다', () => {
    const NEW_ALLDAY_COLUMN = (c: Row) => c.table_name === 'calendar_allday' && ['part', 'leave_id'].includes(String(c.column_name))
    expect(once.columns.filter((c) => !isNew(c.table_name) && !NEW_ALLDAY_COLUMN(c))).toEqual(before.columns)
    const addedConstraints = once.constraints.filter((c) => !isNew(c.tbl) && !before.constraints.some((b) => b.tbl === c.tbl && b.conname === c.conname))
    expect(addedConstraints.map((c) => [c.tbl, c.conname])).toEqual([
      ['calendar_allday', 'calendar_allday_leave_id_fkey'],
      ['calendar_allday', 'calendar_allday_part'],
    ])
    expect(once.constraints.filter((c) => before.constraints.some((b) => b.tbl === c.tbl && b.conname === c.conname))).toEqual(before.constraints)
    expect(once.indexes.filter((i) => !isNew(i.tablename))).toEqual(before.indexes)
    const access = once.access
      .filter((a) => !isNew(a.relname))
      .map((a) => (a.relname === 'calendar_allday' ? { ...a, columns: (a.columns as string[]).filter((col) => !/^(part|leave_id):/.test(col)) } : a))
    expect(access).toEqual(before.access)
    expect(once.policies.filter((p) => !isNew(p.tablename) && !String(p.qual ?? p.with_check).includes(BUCKET) && !String(p.with_check).includes(BUCKET))).toEqual(
      before.policies,
    )
    expect(once.triggers.filter((x) => !isNew(x.tbl))).toEqual(before.triggers)
    expect(once.functions.filter((f) => !/^staff_/.test(String(f.fn)))).toEqual(before.functions)
    expect(once.buckets.filter((b) => b.id !== BUCKET)).toEqual(before.buckets)
  })

  it('AC-7601.1·AC-7603.1: 두 번 붙여 넣어도 모양이 같고 이미 있던 직원·휴가·예약 줄이 그대로다(바구니를 바꿔 두었으면 이 파일 값으로 돌아온다)', async () => {
    const staff = await seedAll(ids[A], { calendar_staff_id: 'st-da' }, fresh)
    expect((await alldayOf(ids[A], fresh)).filter((r) => r.leave_id !== null)).toHaveLength(1)
    const data = await everything(fresh)
    await operator(fresh)
    await fresh.query(`update storage.buckets set public = true, file_size_limit = 1, allowed_mime_types = array['text/plain'] where id = $1`, [BUCKET])
    await fresh.exec(STAFF_MIGRATION)
    expect(await shapeOf(fresh)).toEqual(once)
    expect(await everything(fresh)).toEqual(data)
    expect(staff).toBeTruthy()
  })

  it('AC-7601.1: 열쇠 칸 고치기 권한을 주던 앞 판을 이미 실행한 DB에 이 파일을 다시 붙여 넣으면 칸 권한이 design.md 1절 표 그대로가 된다', async () => {
    const updateColumns = async (table: string) =>
      (
        await rows(
          `select column_name from information_schema.column_privileges
           where grantee = 'authenticated' and table_schema = 'public' and table_name = $1 and privilege_type = 'UPDATE'`,
          [table],
          fresh,
        )
      )
        .map((r) => r.column_name as string)
        .sort()
    await operator(fresh)
    // 앞 판(2026-11-21 검토 전)이 준 열쇠 칸 고치기 권한
    await fresh.exec(`
      grant update (staff_id, from_day, week, sat_rotation) on table public.staff_week_plans to authenticated;
      grant update (staff_id, day, start_min, end_min, lunch_from, lunch_to, memo) on table public.staff_day_changes to authenticated;
      grant update (staff_id, day, kind, minutes) on table public.staff_overtime to authenticated;
      grant update (month, staff_id, amounts, incentives, adjust, adjust_reason, adjust_memo) on table public.staff_pay_lines to authenticated;
      grant update (month, employer_cost, cost_saved_on, copied_on) on table public.staff_pay_months to authenticated;
    `)
    expect(await updateColumns('staff_week_plans')).toContain('from_day')
    await fresh.exec(STAFF_MIGRATION)
    for (const table of TABLES) expect([table, await updateColumns(table)]).toEqual([table, [...GRANTS[table].update].sort()])
    expect(await shapeOf(fresh)).toEqual(once)
  })

  it('AC-7601.1: 앞 파일(calendar.sql·clinic_profile.sql)을 다시 붙여 넣어도 이 파일이 더한 칸·트리거·권한은 그대로이고 휴가 잇기가 돈다', async () => {
    await operator(fresh)
    await fresh.exec(CALENDAR_MIGRATION)
    await fresh.exec(PROFILE_MIGRATION)
    const after = await shapeOf(fresh)
    for (const key of ['columns', 'constraints', 'access', 'triggers'] as const) {
      const staffOnly = (list: Row[]) =>
        list.filter((x) => isNew(x.table_name ?? x.tbl ?? x.relname) || x.table_name === 'calendar_allday' || x.relname === 'calendar_allday' || x.tbl === 'calendar_allday')
      expect([key, staffOnly(after[key])]).toEqual([key, staffOnly(once[key])])
    }
    const staff = (await seedRow('staff_members', ids[A], { ...MEMBER, name: '다시', calendar_staff_id: 'st-ga' }, fresh)).id as string
    await become(A, fresh)
    const [added] = (await postgrestInsert(LEAVES, [{ group_id: GROUP, staff_id: staff, day: '2026-12-01', kind: 'annual' }], null, fresh, 'id')).rows
    expect((await alldayOf(ids[A], fresh)).filter((r) => r.leave_id === added.id).map((r) => [r.staff_id, r.staff_name])).toEqual([['st-ga', '가원장']])
  })
})

describe('AC-7601.1 · ADR-035 문서', () => {
  const repo = (rel: string) => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), 'utf-8')
  const TITLE = '### ADR-035: 직원 자료(연락처·주소·생일·계좌·근무·휴가·급여·서류 파일)를 Supabase에 원장만 보게 둔다. 주민번호는 두지 않는다'

  it('AC-7601.1: docs/ADR.md 맨 끝에 ADR-035 하나가 design.md 2절 글로 있다', () => {
    const doc = repo('docs/ADR.md')
    expect(doc.split(/\r?\n/).filter((line) => line.startsWith('### ADR-035:'))).toEqual([TITLE])
    const body = doc.slice(doc.indexOf(TITLE))
    expect(body.slice(TITLE.length)).not.toMatch(/^### /m)
    for (const part of [
      "- plan.md 4절 '서버로 가는 것: 직원 이름·직종·금액'을 넓힌다. 표마다 RLS `my_hospital_id()`(승인된 원장) 하나, 데스크 정책 없음. 서류·세무사 파일은 비공개 바구니 `staff-files`.",
      "- 휴가 → 예약 '휴무'는 앱이 아니라 DB 트리거가 잇는다(휴가와 종일 줄이 어긋나지 않게). `calendar_allday`에 `part`·`leave_id`를 더한다.",
      '- [급여 확정] 잠금은 두지 않는다(사용자). 달 줄이 그때 인센티브 규칙을 복사해 두고, 규칙을 고치면 보는 달부터만 바꿔 지난 달 금액이 안 바뀐다.',
    ]) {
      expect(body).toContain(part)
    }
  })

  it('AC-7601.1: docs/ARCHITECTURE.md DB 표 목록에 열 표가 한 줄씩·바구니 staff-files 줄이 있고, 옛 employees·payroll_months 줄과 "계좌번호는 저장하지 않는다"는 없다', () => {
    const lines = repo('docs/ARCHITECTURE.md').split(/\r?\n/)
    for (const table of TABLES) {
      const found = lines.filter((line) => line.startsWith(`| \`${table}\` |`))
      expect([table, found.length]).toEqual([table, 1])
      expect(found[0]).toContain('specs/staff')
    }
    const bucket = lines.filter((line) => line.startsWith('- Storage 버킷 `staff-files`'))
    expect(bucket).toHaveLength(1)
    for (const word of ['20261121000000_staff.sql', 'ADR-035', '10,000,000']) expect(bucket[0]).toContain(word)
    expect(lines.filter((line) => /`employees`|`payroll_months`|`incentive_rules`/.test(line))).toEqual([])
    expect(lines.filter((line) => line.includes('계좌번호는 저장하지 않는다'))).toEqual([])
    expect(lines.filter((line) => line.includes('| `calendar_allday` |'))[0]).toContain('`part`')
  })
})

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { addDays, addMonthsToDay, todayInKorea } from '@/lib/analytics/dates'

// 웹앱 ↔ 병원 구글 시트·캘린더 잇기 DB: 예약 칸(g_*)·종일 칸·새 표 여덟(gcal_* 다섯·gsheet_* 셋)·트리거·색 옮기기·휴무 'm-' 줄·
// calendar_off_names() (google-link REQ-8502, design.md 7절, ADR-052~055).
// location.rls.test.ts·adminView.rls.test.ts와 같은 방법: 진짜 Postgres(PGlite, WASM)에서 운영자가 SQL Editor에 붙일 migration 파일을
// **지금 모든 migration**(파일 이름 차례) → 이 파일 → 이 파일 그대로 돌린다. 실제 Supabase에는 붙지 않는다.
// Supabase가 미리 갖춘 것(역할·auth·storage)만 흉내 내고, 요청 머리(PostgREST의 request.headers)는 set_config로 흉내 낸다.
// 병원·사람·메일·환자·직원·구글 일정 id·비밀 글자는 모두 지어낸 것이다
const fileOf = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))
const read = (rel: string) => readFileSync(fileOf(rel), 'utf-8')
const FILE_NAME = '20261126000000_google_link.sql'
// 지금 모든 migration(이 파일보다 앞 이름), 파일 이름 차례
const CHAIN_NAMES = readdirSync(fileOf('./migrations/'))
  .filter((name) => name.endsWith('.sql') && name < FILE_NAME)
  .sort()
const PATH = fileOf(`./migrations/${FILE_NAME}`)
// 파일이 아직 없으면 빈 글자로 돌아, 시험마다 '표·칸이 없다'로 실패한다(무엇이 빠졌는지 시험별로 보인다)
const MIGRATION = existsSync(PATH) ? readFileSync(PATH, 'utf-8') : ''
// 주석을 뺀 SQL 글자, 그리고 함수·DO 몸통($$ … $$)까지 뺀 글자(맨 위 문장만 본다)
const SQL = MIGRATION.split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n')
const TOP = SQL.replace(/\$\$[\s\S]*?\$\$/g, "''")
const STAFF_MIGRATION = read('./migrations/20261121000000_staff.sql')

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
`

// 관리자 여럿 migration은 붙이기 전에 주 관리자 후보(구글로 들어온 관리자) 하나를 본다 — 운영자 계정을 흉내 낸다(시험 데이터에서는 지워진다)
const OP = '00000000-0000-4000-8000-0000000000ff'
const MULTI_ADMIN_SEED = `
  insert into auth.users (id, email, raw_app_meta_data) values ('${OP}', 'op@fake.test', '{"providers": ["google"]}');
  insert into public.admins (user_id) values ('${OP}');
`

const A = '00000000-0000-4000-8000-0000000000a1' // 관리자, 승인된 병원 HA 원장
const B = '00000000-0000-4000-8000-0000000000b1' // 승인된 다른 병원 HB 원장(관리자가 보는 의원), 관리자 아님
const K = '00000000-0000-4000-8000-0000000000d9' // HA의 데스크(병원 줄 없음)
const C = '00000000-0000-4000-8000-0000000000c1' // 승인 대기 병원 HC 원장
const E = '00000000-0000-4000-8000-0000000000e9' // 병원 줄도 데스크 줄도 없음
const USERS = [A, B, K, C, E]
const hospitalOf = (user: string) => `10000000-0000-4000-8000-${user.slice(-12)}`
const HA = hospitalOf(A)
const HB = hospitalOf(B)
const HC = hospitalOf(C)
const STATUS: Record<string, 'approved' | 'pending'> = { [A]: 'approved', [B]: 'approved', [C]: 'pending' }
const EMAIL: Record<string, string> = {
  [A]: 'a-admin@fake.test',
  [B]: 'b-clinic@fake.test',
  [K]: 'desk-a@fake.test',
  [C]: 'c-clinic@fake.test',
  [E]: 'e-user@fake.test',
}
const LABEL: Record<string, string> = { [HA]: 'A', [HB]: 'B', [HC]: 'C' }
const VIEW_KEY = '30000000-0000-4000-8000-000000000001' // A가 HB를 보는 보기 줄(운영자가 심음)
const VIEWING = JSON.stringify({ 'x-ssk-view': VIEW_KEY })

type Row = Record<string, unknown>
const SLOW = { timeout: 120_000 }
const DENIED = { code: '42501' }
const CHECK_FAILED = { code: '23514' }
const UNIQUE_FAILED = { code: '23505' }

// 날짜·시각(1년 지우기·지움 줄 시험은 한국 날짜 오늘로 날을 정한다)
const TODAY = todayInKorea()
const DAY = addDays(TODAY, 1)
const DAY2 = addDays(TODAY, 2)
const YEAR_AGO = addMonthsToDay(TODAY, -12) // 한국 오늘 − 1년(이날 줄은 남고 적힌다)
const OLDEST = addDays(YEAR_AGO, -1) // 한국 오늘 − 1년보다 하루 이른 날
const AT = '2026-11-20T01:00:00.000Z'
const OLD_US = '2026-01-02T03:04:05.123456Z' // 마이크로초까지 있는 옛 시각(운영자가 트리거 없이 심음)
const SEVEN = [{}, {}, {}, {}, {}, {}, {}]

// 지어낸 구글 일정 id(웹앱이 만든 꼴 'ssk' + 32자 16진수)·주소·비밀 글자·파일 id
const EV = (n: number) => `ssk${n.toString(16).padStart(32, '0')}`
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbFAKEFAKEFAKE_0123456789-abc/exec'
const SECRET = 'fake-secret-0123456789-ABCDEFGHIJKLMNOPQRSTUVWXYZ_x'
const FILE_ID = '1FAKEfileID_0123456789-abcdefghij'
const rid = (n: number, owner: string) => `${n.toString(16).padStart(8, '0')}-0000-4000-8000-${owner.slice(-12)}`
const mId = (id: string) => `m-${id.replace(/-/g, '')}`

// 예약 한 줄(사용자가 보낼 수 있는 옛 칸만, 지어낸 이름·차트번호)
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

// ── 이 파일이 더하는 것(design.md 7절) ─────────────────────────────────────
const NEW_TABLES = ['gcal_links', 'gcal_state', 'gcal_fixes', 'gcal_deletes', 'gcal_off_days', 'gsheet_settings', 'gsheet_months', 'gsheet_runs'] as const
type NewTable = (typeof NEW_TABLES)[number]
const GCAL_TABLES = NEW_TABLES.filter((t) => t.startsWith('gcal_'))
const GSHEET_TABLES = NEW_TABLES.filter((t) => t.startsWith('gsheet_'))
const VIEW_POLICY = '관리자 보는 의원 읽기'
const GUARD_POLICY = '보는 중에는 그 의원만 · 쓰기 없음'

// 7-5 권한 표: 데스크도 쓰는가 · 사용자 넣기 · 고치기 · 지우기 · 보는 관리자 읽기
const RIGHTS: Record<NewTable, { deskWrite: boolean; insert: boolean; update: boolean; del: boolean; view: boolean }> = {
  gcal_links: { deskWrite: false, insert: true, update: true, del: false, view: false },
  gcal_state: { deskWrite: true, insert: true, update: true, del: false, view: false },
  gcal_fixes: { deskWrite: true, insert: true, update: true, del: true, view: false },
  gcal_deletes: { deskWrite: true, insert: false, update: false, del: true, view: false },
  gcal_off_days: { deskWrite: true, insert: true, update: true, del: true, view: false },
  gsheet_settings: { deskWrite: true, insert: true, update: true, del: false, view: true },
  gsheet_months: { deskWrite: true, insert: true, update: true, del: false, view: true },
  gsheet_runs: { deskWrite: true, insert: true, update: false, del: false, view: true },
}

// 사용자가 보낼 수 있는 칸(넣기·고치기). hospital_id·id·created_at·updated_at·at은 칸 권한이 없다
const WRITE: Record<NewTable, { insert: string[]; update: string[] }> = {
  gcal_links: {
    insert: ['script_url', 'secret', 'calendar_id', 'calendar_name', 'default_hex', 'linked_on', 'rules', 'look'],
    update: ['script_url', 'secret', 'calendar_id', 'calendar_name', 'default_hex', 'linked_on', 'rules', 'look'],
  },
  gcal_state: {
    insert: ['pulled_until', 'last_ok_at', 'fail_since', 'fail_code', 'arrival_until', 'arrival_done'],
    update: ['pulled_until', 'last_ok_at', 'fail_since', 'fail_code', 'arrival_until', 'arrival_done'],
  },
  gcal_fixes: {
    insert: ['g_event_id', 'day', 'start_min', 'len_min', 'all_day', 'g_color', 'g_title', 'reason', 'guess', 'state', 'g_updated'],
    update: ['g_event_id', 'day', 'start_min', 'len_min', 'all_day', 'g_color', 'g_title', 'reason', 'guess', 'state', 'g_updated'],
  },
  gcal_deletes: { insert: [], update: [] },
  gcal_off_days: {
    insert: ['day', 'g_event_id', 'g_title', 'g_updated', 'wait', 'wait_at'],
    update: ['day', 'g_event_id', 'g_title', 'g_updated', 'wait', 'wait_at'],
  },
  gsheet_settings: { insert: ['conf', 'secret_tag'], update: ['conf', 'secret_tag'] },
  gsheet_months: { insert: ['ym', 'file_id', 'gids', 'seen_at'], update: ['ym', 'file_id', 'gids', 'seen_at'] },
  gsheet_runs: { insert: ['day', 'via', 'mode', 'outcome', 'code', 'rows', 'counts', 'cells'], update: [] },
}
// 표 단위 권한(authenticated): r = 읽기, d = 지우기
const TABLE_ACL: Record<NewTable, string> = {
  gcal_links: 'r',
  gcal_state: 'r',
  gcal_fixes: 'rd',
  gcal_deletes: 'rd',
  gcal_off_days: 'rd',
  gsheet_settings: 'r',
  gsheet_months: 'r',
  gsheet_runs: 'r',
}

// 표마다 한 줄(병원 칸 없이 — 사용자가 보내는 값, 운영자는 hospital_id를 더해 심는다)
const ROW: Record<NewTable, Row> = {
  gcal_links: {
    script_url: SCRIPT_URL,
    secret: SECRET,
    calendar_id: 'cal-1@group.calendar.google.com',
    calendar_name: '예약',
    default_hex: '#4285F4',
    linked_on: DAY,
    rules: { pullMin: 2, onGoogleDelete: 'cancel', arrival: 'off', offAllStaff: true },
    look: { cancel: 'tomato', change: 'graphite', offWord: 'off' },
  },
  gcal_state: { pulled_until: AT, arrival_done: false },
  gcal_fixes: {
    g_event_id: EV(1),
    day: DAY,
    start_min: 600,
    len_min: 30,
    all_day: false,
    g_color: '3',
    g_title: '가짜 제목',
    reason: 'no-staff',
    guess: { name: '홍길동' },
    state: 'open',
    g_updated: AT,
  },
  gcal_deletes: { g_event_id: EV(2), day: DAY, kind: 'appt', label: '가짜 제목' },
  gcal_off_days: { day: DAY, g_event_id: EV(3), g_title: 'off 가', g_updated: AT, wait: false },
  gsheet_settings: { conf: { templateUrl: 'https://docs.google.com/spreadsheets/d/fake/edit', firstRow: 17 }, secret_tag: '0123456789abcdef' },
  gsheet_months: { ym: '2026-11', file_id: FILE_ID, gids: { '1': 0, '2': 12345 } },
  gsheet_runs: { day: DAY, via: 'auto', mode: 'fillEmpty', outcome: 'ok', code: null, rows: 3, counts: { added: 3, full: false }, cells: ['1!B17'] },
}
// 고치기 한 칸(표마다)
const SET: Record<NewTable, string> = {
  gcal_links: `calendar_name = '새 이름'`,
  gcal_state: `fail_code = 'E-GCAL-REACH'`,
  gcal_fixes: `state = 'skip'`,
  gcal_deletes: `label = '고침'`,
  gcal_off_days: `wait = true`,
  gsheet_settings: `secret_tag = 'fedcba9876543210'`,
  gsheet_months: `file_id = '${FILE_ID}x'`,
  gsheet_runs: `rows = 9`,
}

// 칸 [이름, 타입, 비울 수 있음, 기본값] (design.md 7-3)
const TZ = 'timestamp with time zone'
const MY_HOSPITAL = expect.stringMatching(/^(public\.)?my_hospital_id\(\)$/)
const MY_CLINIC = expect.stringMatching(/^(public\.)?my_clinic_hospital_id\(\)$/)
const COLUMNS: Record<NewTable, unknown[][]> = {
  gcal_links: [
    ['hospital_id', 'uuid', 'NO', MY_HOSPITAL],
    ['script_url', 'text', 'YES', null],
    ['secret', 'text', 'YES', null],
    ['calendar_id', 'text', 'YES', null],
    ['calendar_name', 'text', 'YES', null],
    ['default_hex', 'text', 'YES', null],
    ['linked_on', 'date', 'YES', null],
    ['rules', 'jsonb', 'YES', null],
    ['look', 'jsonb', 'YES', null],
    ['updated_at', TZ, 'NO', 'now()'],
  ],
  gcal_state: [
    ['hospital_id', 'uuid', 'NO', MY_CLINIC],
    ['pulled_until', TZ, 'YES', null],
    ['last_ok_at', TZ, 'YES', null],
    ['fail_since', TZ, 'YES', null],
    ['fail_code', 'text', 'YES', null],
    ['arrival_until', 'date', 'YES', null],
    ['arrival_done', 'boolean', 'NO', 'false'],
    ['updated_at', TZ, 'NO', 'now()'],
  ],
  gcal_fixes: [
    ['id', 'uuid', 'NO', 'gen_random_uuid()'],
    ['hospital_id', 'uuid', 'NO', MY_CLINIC],
    ['g_event_id', 'text', 'NO', null],
    ['day', 'date', 'NO', null],
    ['start_min', 'smallint', 'NO', null],
    ['len_min', 'smallint', 'NO', null],
    ['all_day', 'boolean', 'NO', 'false'],
    ['g_color', 'text', 'YES', null],
    ['g_title', 'text', 'NO', null],
    ['reason', 'text', 'NO', null],
    ['guess', 'jsonb', 'NO', "'{}'::jsonb"],
    ['state', 'text', 'NO', "'open'::text"],
    ['g_updated', TZ, 'NO', null],
    ['created_at', TZ, 'NO', 'now()'],
  ],
  gcal_deletes: [
    ['hospital_id', 'uuid', 'NO', null],
    ['g_event_id', 'text', 'NO', null],
    ['day', 'date', 'NO', null],
    ['kind', 'text', 'NO', null],
    ['label', 'text', 'YES', null],
    ['created_at', TZ, 'NO', 'now()'],
  ],
  gcal_off_days: [
    ['hospital_id', 'uuid', 'NO', MY_CLINIC],
    ['day', 'date', 'NO', null],
    ['g_event_id', 'text', 'YES', null],
    ['g_title', 'text', 'YES', null],
    ['g_updated', TZ, 'YES', null],
    ['wait', 'boolean', 'NO', 'false'],
    ['wait_at', TZ, 'YES', null],
  ],
  gsheet_settings: [
    ['hospital_id', 'uuid', 'NO', MY_CLINIC],
    ['conf', 'jsonb', 'NO', "'{}'::jsonb"],
    ['secret_tag', 'text', 'YES', null],
    ['updated_at', TZ, 'NO', 'now()'],
  ],
  gsheet_months: [
    ['hospital_id', 'uuid', 'NO', MY_CLINIC],
    ['ym', 'text', 'NO', null],
    ['file_id', 'text', 'NO', null],
    ['gids', 'jsonb', 'NO', "'{}'::jsonb"],
    ['seen_at', TZ, 'NO', 'now()'],
  ],
  gsheet_runs: [
    ['id', 'uuid', 'NO', 'gen_random_uuid()'],
    ['hospital_id', 'uuid', 'NO', MY_CLINIC],
    ['at', TZ, 'NO', 'now()'],
    ['day', 'date', 'NO', null],
    ['via', 'text', 'NO', null],
    ['mode', 'text', 'NO', null],
    ['outcome', 'text', 'NO', null],
    ['code', 'text', 'YES', null],
    ['rows', 'integer', 'NO', '0'],
    ['counts', 'jsonb', 'NO', "'{}'::jsonb"],
    ['cells', 'ARRAY', 'NO', "'{}'::text[]"],
  ],
}

// 예약·종일 줄 새 칸(표 끝에 더함, 7-1·7-2)
const APPT_NEW_COLUMNS: unknown[][] = [
  ['g_event_id', 'text', 'YES', null],
  ['g_updated', TZ, 'YES', null],
  ['g_title', 'text', 'YES', null],
  ['g_color', 'text', 'YES', null],
  ['color_from', 'text', 'NO', "'app'::text"],
  ['g_keep_title', 'boolean', 'NO', 'false'],
  ['g_moved', 'boolean', 'NO', 'false'],
  ['g_gone', 'boolean', 'NO', 'false'],
  ['g_wait', 'text', 'YES', null],
  ['g_wait_at', TZ, 'YES', null],
  ['g_note', 'text', 'YES', null],
  ['g_from', 'text', 'YES', null],
  ['g_how', 'jsonb', 'YES', null],
]
const ALLDAY_NEW_COLUMNS: unknown[][] = [
  ['g_event_id', 'text', 'YES', null],
  ['g_updated', TZ, 'YES', null],
  ['g_wait', 'boolean', 'NO', 'false'],
  ['g_wait_at', TZ, 'YES', null],
]
const APPT_OLD_WRITE = ['day', 'start_min', 'len_min', 'name', 'chart', 'staff_id', 'staff_name', 'staff_mark', 'kind_id', 'kind_name', 'memo', 'status']
const APPT_G_WRITE = ['g_event_id', 'g_updated', 'g_title', 'g_color', 'color_from', 'g_keep_title', 'g_moved', 'g_gone', 'g_wait', 'g_note', 'g_from', 'g_how']

// ── 색 옮기기(7-4) — 옛 20색이 든 설정·병원 정보(이 파일 전에 심는다) ──────────────
const OLD_KINDS = [
  { id: 'dosu', name: '도수', len: 30, color: null },
  { id: 'inj', name: '주사', len: 10, color: 'pink' },
  { id: 'visit', name: '진료', len: 10, color: 'lime' },
  { id: 'k1', name: '물리', len: 20, color: 'navy' },
  { id: 'k2', name: '상담', len: 10, color: 'zzz' },
  { id: 'jabo', name: '자보도수', len: 30, color: 'default', words: ['자보'] },
  { id: 'shock', name: '충격파', len: 15, color: 'sage' },
]
const MOVED_KINDS = [
  { id: 'dosu', name: '도수', len: 30, color: null, words: ['도수'] },
  { id: 'inj', name: '주사', len: 10, color: 'flamingo', words: ['주사'] },
  { id: 'visit', name: '진료', len: 10, color: 'sage', words: ['진료'] },
  { id: 'k1', name: '물리', len: 20, color: 'blueberry', words: ['물리'] },
  { id: 'k2', name: '상담', len: 10, color: 'graphite', words: ['상담'] },
  { id: 'jabo', name: '자보도수', len: 30, color: 'default', words: ['자보'] },
  { id: 'shock', name: '충격파', len: 15, color: 'sage', words: ['충격파', '타'] },
]
// 예약 SQL의 옛 기본 종류(HB 설정 줄)가 옮겨진 모양
const MOVED_OLD_DEFAULT = [
  { id: 'dosu', name: '도수', len: 30, color: null, words: ['도수'] },
  { id: 'jabo', name: '자보도수', len: 30, color: null, words: ['자보도수', '자보'] },
  { id: 'shock', name: '충격파', len: 15, color: null, words: ['충격파', '타'] },
  { id: 'inj', name: '주사', len: 10, color: 'flamingo', words: ['주사'] },
  { id: 'visit', name: '진료', len: 10, color: 'sage', words: ['진료'] },
]
// design.md 7-4 새 기본값
const NEW_DEFAULT_KINDS = [
  { id: 'dosu', name: '도수', len: 30, color: null, words: ['도수'] },
  { id: 'jabo', name: '자보도수', len: 30, color: null, words: ['자보도수', '자보'] },
  { id: 'shock', name: '충격파', len: 15, color: 'sage', words: ['충격파', '타'] },
  { id: 'inj', name: '주사', len: 10, color: null, words: ['주사'] },
  { id: 'visit', name: '진료', len: 10, color: null, words: ['진료'] },
]
const OLD_SETTINGS_STAFF = [
  { id: 'st-ga', name: '가', mark: '가', color: 'wine' },
  { id: 'st-na', name: '나', mark: '나', color: 'sky' },
  { id: 'st-da', name: '다', mark: '다', color: null },
]
const MOVED_SETTINGS_STAFF = [
  { id: 'st-ga', name: '가', mark: '가', color: 'tomato' },
  { id: 'st-na', name: '나', mark: '나', color: 'peacock' },
  { id: 'st-da', name: '다', mark: '다', color: null },
]
const OLD_PROFILE_STAFF = [
  { id: 'p1', name: '김원장', role: 'director', mark: '김', color: 'forest', calendar: true },
  { id: 'p2', name: '박치료', role: 'staff', mark: '박', color: 'magenta', calendar: true },
  { id: 'p3', name: '이실장', role: 'staff', mark: '이', color: null, calendar: false },
]
const MOVED_PROFILE_STAFF = [
  { id: 'p1', name: '김원장', role: 'director', mark: '김', color: 'basil', calendar: true },
  { id: 'p2', name: '박치료', role: 'staff', mark: '박', color: 'grape', calendar: true },
  { id: 'p3', name: '이실장', role: 'staff', mark: '이', color: null, calendar: false },
]
// 7-4 표 전부(옛 20색 → 11색, 새 이름은 그대로, 모르는 값은 흑연)
const COLOR_MOVES: [string, string][] = [
  ['blue', 'blueberry'],
  ['navy', 'blueberry'],
  ['teal', 'basil'],
  ['green', 'basil'],
  ['forest', 'basil'],
  ['purple', 'grape'],
  ['magenta', 'grape'],
  ['orange', 'tangerine'],
  ['brown', 'tangerine'],
  ['yellow', 'banana'],
  ['black', 'graphite'],
  ['gray', 'graphite'],
  ['pink', 'flamingo'],
  ['coral', 'flamingo'],
  ['lime', 'sage'],
  ['mint', 'sage'],
  ['sky', 'peacock'],
  ['red', 'tomato'],
  ['wine', 'tomato'],
  ['lavender', 'lavender'],
  ...['lavender', 'sage', 'grape', 'flamingo', 'banana', 'tangerine', 'peacock', 'graphite', 'blueberry', 'basil', 'tomato'].map(
    (name): [string, string] => [name, name],
  ),
  ['zzz', 'graphite'],
]

// 직원(이 파일 전에 심어 휴무 'm-' 채우기를 본다)
const M1 = rid(41, A) // 예약 시행자와 이어지지 않은 직원
const M2 = rid(42, A) // 이름 11자, 이어지지 않음
const M3 = rid(43, A) // 병원 정보 p2와 이어짐
const L1 = rid(51, A) // M1 하루 종일(10일 전)
const L2 = rid(52, A) // M1 하루 종일(400일 전 — 1년보다 이름)
const L3 = rid(53, A) // M1 반차(5일 전)
const L4 = rid(54, A) // M2 하루 종일(내일)
const L5 = rid(55, A) // M3 하루 종일(2일 전)
const LONG_NAME = '가나다라마바사아자차카'
const PRE_APPT = rid(61, A)
const PRE_MEMO = rid(62, A)
const PRE_OFF = rid(63, A)

let db: PGlite
type Shape = Awaited<ReturnType<typeof shapeOf>>
type Old = Awaited<ReturnType<typeof dumpOld>>
let before: Shape
let first: Shape
let second: Shape
let preRows: Old
let firstRows: Old
let secondRows: Old
let preApptNew: Row[]

async function migrate(target: PGlite) {
  await target.exec(SUPABASE_MOCK)
  await target.exec(STORAGE_MOCK)
  for (const name of CHAIN_NAMES) {
    if (name === '20261122000000_multi_admin.sql') await target.exec(MULTI_ADMIN_SEED)
    await target.exec(read(`./migrations/${name}`))
  }
}

async function operator() {
  await db.exec('reset role; reset request.jwt.claims; reset request.headers')
}

/** 그 사용자로 로그인한 것처럼(JWT의 sub·email). headers = PostgREST가 넘기는 요청 머리 JSON 글자 */
async function become(user: string, headers: string | null = null) {
  await operator()
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: user, email: EMAIL[user] })])
  if (headers !== null) await db.query(`select set_config('request.headers', $1, false)`, [headers])
  await db.exec('set role authenticated')
}

async function becomeAnon() {
  await operator()
  await db.exec('set role anon')
}

type Actor = 'owner' | 'desk' | 'other' | 'pending' | 'none' | 'anon' | 'viewer'
const ACTORS: Actor[] = ['owner', 'desk', 'other', 'pending', 'none', 'anon', 'viewer']
async function act(actor: Actor) {
  if (actor === 'owner') await become(A)
  else if (actor === 'desk') await become(K)
  else if (actor === 'other') await become(B)
  else if (actor === 'pending') await become(C)
  else if (actor === 'none') await become(E)
  else if (actor === 'anon') await becomeAnon()
  else await become(A, VIEWING)
}

async function rows(sql: string, params: unknown[] = []) {
  return (await db.query<Row>(sql, params)).rows
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

/** 지금 역할로 줄 하나 넣기(PostgREST 모양: json 줄을 표 모양으로 풀어 보낸 칸만) */
function send(table: string, row: Row, returning = '') {
  const columns = Object.keys(row).join(', ')
  return db.query<Row>(
    `insert into public.${table} (${columns}) select ${columns} from json_populate_record(null::public.${table}, $1::json)${returning ? ` returning ${returning}` : ''}`,
    [JSON.stringify(row)],
  )
}

/** 운영자가 줄 하나(RLS·칸 권한을 건너뛴다) */
async function put(table: string, row: Row, returning = '') {
  await operator()
  return (await send(table, row, returning)).rows[0]
}

/** 운영자가 트리거 없이 고친다(DB가 정하는 칸에 옛 값을 심으려고) */
async function quiet(sql: string, params: unknown[] = []) {
  await operator()
  await db.exec(`set session_replication_role = replica`)
  try {
    await db.query(sql, params)
  } finally {
    await db.exec(`set session_replication_role = origin`)
  }
}

/** 운영자가 트리거 없이 g_wait_at을 심는다(PGlite 시계는 밀리초라 마이크로초 값은 이렇게 만든다) */
const forceWaitAt = (table: 'calendar_appts' | 'calendar_allday', id: string, at: string | null) =>
  quiet(`update public.${table} set g_wait_at = $2 where id = $1`, [id, at])

/** 사용자·병원·관리자·데스크·보기 줄(운영자). 병원 줄을 따라 표 줄이 함께 비워진다 */
async function resetData() {
  await operator()
  await db.exec('truncate auth.users cascade')
  for (const user of USERS) {
    await db.query('insert into auth.users (id, email) values ($1, $2)', [user, EMAIL[user]])
    const status = STATUS[user]
    if (status === undefined) continue
    await db.query(`insert into public.hospitals (id, owner_id, name, applicant_name, email, status) values ($1, $2, '가짜의원', '홍길동', $3, $4)`, [
      hospitalOf(user),
      user,
      EMAIL[user],
      status,
    ])
  }
  await db.query('insert into public.admins (user_id) values ($1)', [A])
  await db.query(`insert into public.hospital_members (hospital_id, email) values ($1, 'desk-a@fake.test')`, [HA])
  await db.query(`insert into public.admin_views (id, user_id, hospital_id) values ($1, $2, $3)`, [VIEW_KEY, A, HB])
}

/** 운영자가 새 표마다 그 병원 줄 하나 */
async function seedNew(hospital: string, tables: readonly NewTable[] = NEW_TABLES) {
  for (const table of tables) await put(table, { hospital_id: hospital, ...ROW[table] })
}

const seedAppt = async (hospital: string, extra: Row = {}) => String((await put('calendar_appts', { hospital_id: hospital, ...APPT, ...extra }, 'id')).id)
const seedAllDay = async (hospital: string, values: Row) => String((await put('calendar_allday', { hospital_id: hospital, ...values }, 'id')).id)

/** 지금 역할로 그 표의 줄이 어느 병원 것인지(병원 글자, 줄마다) */
async function labelsOf(table: string) {
  return (await rows(`select hospital_id from public.${table}`)).map((r) => LABEL[String(r.hospital_id)] ?? '?').sort()
}

async function deletesNow() {
  await operator()
  return rows(`select hospital_id, g_event_id, day::text as day, kind, label from public.gcal_deletes order by hospital_id, g_event_id, day`)
}

async function offDaysNow() {
  await operator()
  return rows(`select hospital_id, day::text as day, g_event_id, g_title, wait, wait_at is not null as has_wait_at from public.gcal_off_days order by 1, 2`)
}

/** 운영자 눈으로 본 g_wait_at 글자(PostgREST 답과 같은 JSON 꼴, 마이크로초까지) */
async function waitAtOf(table: 'calendar_appts' | 'calendar_allday', id: string) {
  await operator()
  const [row] = await rows(`select to_jsonb(g_wait_at) #>> '{}' as at from public.${table} where id = $1`, [id])
  return (row?.at ?? null) as string | null
}

// 이 파일이 손댈 수 있는 것 전부: public 표의 칸·제약·권한(표·칸)·트리거·색인, 모든 정책, public 함수
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
  }
}

/** 이 파일 전에도 있던 칸만(운영자) — 이미 있던 줄이 그대로인지·색 옮기기·휴무 채우기 견주기 */
async function dumpOld() {
  await operator()
  return {
    settings: await rows(`select hospital_id, kinds, staff from public.calendar_settings order by 1`),
    profiles: await rows(`select hospital_id, staff, updated_at from public.clinic_profiles order by 1`),
    appts: await rows(
      `select id, hospital_id, day::text as day, start_min, len_min, name, chart, staff_id, staff_name, staff_mark, kind_id, kind_name, memo,
              status, auto, orig_day::text as orig_day, orig_start, created_at, updated_at from public.calendar_appts order by 1`,
    ),
    allday: await rows(
      `select id, hospital_id, day::text as day, type, memo, staff_id, staff_name, part, leave_id, created_at from public.calendar_allday
       order by day, staff_id, id`,
    ),
  }
}

/** 이 파일 전 DB에 심는 줄(옛 칸만): 옛 20색 설정·병원 정보, 예약·종일 줄, 이어지지 않은 직원의 휴가 */
async function seedBefore() {
  await resetData()
  await put('calendar_settings', { hospital_id: HA, kinds: OLD_KINDS, staff: OLD_SETTINGS_STAFF })
  await put('calendar_settings', { hospital_id: HB }) // 예약 SQL의 옛 기본 종류
  await put('clinic_profiles', { hospital_id: HA, hours: SEVEN, staff: OLD_PROFILE_STAFF })
  await put('calendar_appts', { id: PRE_APPT, hospital_id: HA, ...APPT })
  await put('calendar_allday', { id: PRE_MEMO, hospital_id: HA, day: DAY, type: 'memo', memo: '원장님 학회' })
  await put('calendar_allday', { id: PRE_OFF, hospital_id: HA, day: DAY2, type: 'off', staff_id: 'st-ga', staff_name: '가' })
  for (const [id, name, link] of [
    [M1, '최시안', null],
    [M2, LONG_NAME, null],
    [M3, '박치료', 'p2'],
  ] as const) {
    await put('staff_members', { id, hospital_id: HA, name, job: '물리치료사', employment: 'regular', hired_on: '2025-01-01', calendar_staff_id: link })
  }
  for (const [id, staff, day, kind, part] of [
    [L1, M1, addDays(TODAY, -10), 'annual', null],
    [L2, M1, addDays(TODAY, -400), 'annual', null],
    [L3, M1, addDays(TODAY, -5), 'half', 'am'],
    [L4, M2, DAY, 'annual', null],
    [L5, M3, addDays(TODAY, -2), 'annual', null],
  ] as const) {
    await put('staff_leaves', { id, hospital_id: HA, group_id: id, staff_id: staff, day, kind, part })
  }
}

const bare = (name: unknown) => String(name).replace(/^public\./, '')
const squash = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ')
const fnOf = (shape: Shape, fn: string) => shape.functions.find((f) => bare(f.fn) === fn)
const runsAs = (acl: unknown, role: string) => ((acl as string[] | null) ?? []).some((item) => item.startsWith(`${role}=`) && /=[^/]*X/.test(item))
/** 함수 몸통($$ … $$ 사이 글자) */
const bodyOf = (sql: string, fn: string) => sql.match(new RegExp(`create or replace function public\\.${fn}\\(\\)[^$]*\\$\\$([\\s\\S]*?)\\$\\$`))?.[1] ?? ''

beforeAll(async () => {
  db = await PGlite.create()
  await migrate(db)
  await seedBefore()
  before = await shapeOf(db)
  preRows = await dumpOld()
  await db.exec(MIGRATION)
  first = await shapeOf(db)
  firstRows = await dumpOld()
  // 파일이 아직 없으면 새 칸이 없다 — 빈 목록으로 두어 그 시험만 실패하게
  preApptNew = await rows(
    `select g_event_id, g_updated, g_title, g_color, color_from, g_keep_title, g_moved, g_gone, g_wait, g_wait_at, g_note, g_from, g_how
     from public.calendar_appts where id = $1`,
    [PRE_APPT],
  ).catch(() => [])
  await db.exec(MIGRATION)
  second = await shapeOf(db)
  secondRows = await dumpOld()
}, 300_000)

afterAll(async () => {
  await db.close()
})

// 시험마다 빈 표에서 시작한다. 운영자(superuser)는 RLS를 건너뛴다
beforeEach(async () => {
  await resetData()
}, 60_000)

describe('AC-8502.1 파일 · 사슬 · 두 번 실행 · 새 표 모양', SLOW, () => {
  it('AC-8502.1: 시험 사슬은 이 파일보다 앞인 migration 모두이고, 이 파일이 있으며 줄 끝이 LF이고 머리 주석에 무엇·실행·먼저·두 번·관문·명세 번호가 있다', () => {
    expect(CHAIN_NAMES).toContain('20261124000000_admin_view.sql')
    expect(CHAIN_NAMES).toContain('20261121000000_staff.sql')
    expect(MIGRATION).not.toBe('')
    expect(MIGRATION).not.toContain('\r')
    const lines = MIGRATION.split('\n')
    const head = lines.slice(0, lines.findIndex((line) => !/^(--|\s*$)/.test(line))).join('\n')
    for (const word of [
      ...NEW_TABLES,
      'calendar_off_names',
      'REQ-8502',
      'ADR-052',
      '운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다',
      '20261124000000_admin_view.sql',
      '두 번 붙여 넣어도 그대로다',
      '이 파일을 먼저 붙여 넣고 그다음 사이트에 올린다',
    ]) {
      expect(head, word).toContain(word)
    }
  })

  it('AC-8502.1: 두 번 돌려도 되는 문장만 쓴다(표·색인은 if not exists, 칸은 add column if not exists, 함수·트리거는 or replace, 정책은 지우고 다시)', () => {
    for (const table of NEW_TABLES) expect(TOP, table).toMatch(new RegExp(`create\\s+table\\s+if\\s+not\\s+exists\\s+public\\.${table}\\b`, 'i'))
    expect(TOP).not.toMatch(/create\s+table\s+(?!if\s+not\s+exists)/i)
    expect(TOP).not.toMatch(/create\s+(unique\s+)?index\s+(?!if\s+not\s+exists)/i)
    expect(TOP).not.toMatch(/create\s+function/i)
    expect(TOP).not.toMatch(/create\s+(constraint\s+)?trigger/i)
    expect(TOP).not.toMatch(/add\s+column\s+(?!if\s+not\s+exists)/i)
    expect(TOP).not.toMatch(/^\s*(drop\s+table|truncate|delete)\b/im)
    // my_hospital_id()·my_clinic_hospital_id()는 다시 만들지 않는다(글자·권한 그대로)
    expect(SQL).not.toMatch(/function\s+public\.my_(clinic_)?hospital_id\b/i)
    // 정책을 만들기 전에 늘 같은 이름을 지운다
    for (const [, name, table] of TOP.matchAll(/create\s+policy\s+"([^"]+)"\s+on\s+(\S+)/gi)) {
      expect(TOP, `${table} ${name}`).toContain(`drop policy if exists "${name}" on ${table}`)
    }
  })

  it('AC-8502.1: 두 번째 실행 뒤 표·칸·제약·정책·권한·함수·트리거 모양과 줄이 첫 실행 뒤와 같다', () => {
    expect(second).toEqual(first)
    expect(secondRows).toEqual(firstRows)
  })

  it.each(NEW_TABLES)('AC-8502.1: 새 표 %s는 design.md 7-3 칸이고 RLS 켜짐·anon·PUBLIC 권한 없음·authenticated는 정해 둔 것만이다', async (table) => {
    expect(first.columns.filter((c) => c.table_name === table).map((c) => [c.column_name, c.data_type, c.is_nullable, c.column_default])).toEqual(
      COLUMNS[table],
    )
    const access = first.access.find((t) => t.relname === table)
    expect(access?.relrowsecurity).toBe(true)
    const acl = (access?.acl as string[] | null) ?? []
    expect(acl.filter((item) => item.startsWith('anon=') || item.startsWith('='))).toEqual([])
    expect(acl.filter((item) => item.startsWith('authenticated=')).map((item) => item.replace(/^authenticated=([^/]*)\/.*$/, '$1'))).toEqual([TABLE_ACL[table]])
    for (const column of ((access?.columns as string[] | null) ?? []).map((c) => c.replace(/:.*$/, ''))) {
      const [privilege] = await rows(
        `select has_column_privilege('anon', $1, $2, 'SELECT') as anon_read,
                has_column_privilege('authenticated', $1, $2, 'INSERT') as can_insert,
                has_column_privilege('authenticated', $1, $2, 'UPDATE') as can_update`,
        [`public.${table}`, column],
      )
      expect(privilege, `${table}.${column}`).toEqual({
        anon_read: false,
        can_insert: WRITE[table].insert.includes(column),
        can_update: WRITE[table].update.includes(column),
      })
    }
  })

  it("AC-8502.1: gsheet 셋에는 '관리자 보는 의원 읽기'·'보는 중에는 그 의원만 · 쓰기 없음', gcal 다섯에는 restrictive 하나만 있다(admin_view.sql 꼴)", () => {
    for (const table of NEW_TABLES) {
      const mine = first.policies.filter((p) => p.schemaname === 'public' && p.tablename === table)
      const guard = mine.find((p) => p.policyname === GUARD_POLICY)
      expect(guard, table).toMatchObject({ cmd: 'ALL', permissive: 'RESTRICTIVE', roles: ['authenticated'] })
      expect(squash(guard?.qual)).toMatch(
        /^\(\(\( SELECT (public\.)?admin_view_hospital_id\(\) AS admin_view_hospital_id\) IS NULL\) OR \(hospital_id = \( SELECT (public\.)?admin_view_hospital_id\(\) AS admin_view_hospital_id\)\)\)$/,
      )
      expect(squash(guard?.with_check)).toMatch(/^\(\( SELECT (public\.)?admin_view_hospital_id\(\) AS admin_view_hospital_id\) IS NULL\)$/)
      const view = mine.find((p) => p.policyname === VIEW_POLICY)
      if (GSHEET_TABLES.includes(table)) {
        expect(view, table).toMatchObject({ cmd: 'SELECT', permissive: 'PERMISSIVE', roles: ['authenticated'], with_check: null })
        expect(squash(view?.qual)).toMatch(/^\(hospital_id = \( SELECT (public\.)?admin_view_hospital_id\(\) AS admin_view_hospital_id\)\)$/)
      } else {
        expect(view, table).toBeUndefined()
      }
      // 모든 정책은 authenticated에게만
      for (const policy of mine) expect(policy.roles, `${table} ${policy.policyname}`).toEqual(['authenticated'])
    }
  })

  it('AC-8502.1: 이미 있던 예약·종일 줄은 그대로이고(휴무 채우기 줄만 더함) 예약 새 칸은 기본값이다', () => {
    expect(firstRows.appts).toEqual(preRows.appts)
    expect(firstRows.allday.filter((r) => !String(r.staff_id ?? '').startsWith('m-'))).toEqual(preRows.allday)
    expect(preApptNew).toEqual([
      {
        g_event_id: null,
        g_updated: null,
        g_title: null,
        g_color: null,
        color_from: 'app',
        g_keep_title: false,
        g_moved: false,
        g_gone: false,
        g_wait: null,
        g_wait_at: null,
        g_note: null,
        g_from: null,
        g_how: null,
      },
    ])
  })

  it('AC-8502.1: 예약·종일 줄 새 칸이 표 끝에 붙고, 시행자 세 칸은 비울 수 있다', () => {
    const appt = first.columns.filter((c) => c.table_name === 'calendar_appts').map((c) => [c.column_name, c.data_type, c.is_nullable, c.column_default])
    expect(appt.slice(-APPT_NEW_COLUMNS.length)).toEqual(APPT_NEW_COLUMNS)
    for (const column of ['staff_id', 'staff_name', 'staff_mark']) expect(appt.find((c) => c[0] === column)?.[2], column).toBe('YES')
    const allday = first.columns.filter((c) => c.table_name === 'calendar_allday').map((c) => [c.column_name, c.data_type, c.is_nullable, c.column_default])
    expect(allday.slice(-ALLDAY_NEW_COLUMNS.length)).toEqual(ALLDAY_NEW_COLUMNS)
  })

  it('AC-8502.1: 트리거는 design.md 7절 이름·때·줄마다/문장마다이고, 지움·off 트리거만 정의자 권한이다', () => {
    const def = (tbl: string, name: string) => squash(first.triggers.find((t) => bare(t.tbl) === tbl && t.tgname === name)?.def)
    const fn = (name: string) => `EXECUTE FUNCTION (public\\.)?${name}\\(\\)`
    expect(def('calendar_appts', 'calendar_appts_gdel')).toMatch(new RegExp(`AFTER DELETE ON public\\.calendar_appts FOR EACH ROW ${fn('calendar_appts_gdel')}`))
    expect(def('calendar_appts', 'calendar_appts_gwait')).toMatch(
      new RegExp(`BEFORE INSERT OR UPDATE ON public\\.calendar_appts FOR EACH ROW ${fn('calendar_appts_gwait')}`),
    )
    expect(def('calendar_allday', 'calendar_allday_guard')).toMatch(new RegExp(`BEFORE UPDATE ON public\\.calendar_allday FOR EACH ROW ${fn('calendar_allday_guard')}`))
    expect(def('calendar_allday', 'calendar_allday_gwait')).toMatch(
      new RegExp(`BEFORE INSERT OR UPDATE ON public\\.calendar_allday FOR EACH ROW ${fn('calendar_allday_gwait')}`),
    )
    expect(def('calendar_allday', 'calendar_allday_gdel')).toMatch(new RegExp(`AFTER DELETE ON public\\.calendar_allday FOR EACH ROW ${fn('calendar_allday_gdel')}`))
    expect(def('calendar_allday', 'calendar_allday_offwait')).toMatch(
      new RegExp(`AFTER INSERT OR DELETE ON public\\.calendar_allday FOR EACH ROW ${fn('calendar_allday_offwait')}`),
    )
    expect(def('gcal_fixes', 'gcal_fixes_prune')).toMatch(new RegExp(`AFTER INSERT ON public\\.gcal_fixes FOR EACH STATEMENT ${fn('gcal_fixes_prune')}`))
    expect(def('gsheet_runs', 'gsheet_runs_prune')).toMatch(new RegExp(`AFTER INSERT ON public\\.gsheet_runs FOR EACH STATEMENT ${fn('gsheet_runs_prune')}`))
    expect(first.triggers.filter((t) => bare(t.tbl) === 'gcal_state').map((t) => squash(t.def))).toEqual([expect.stringMatching(/^CREATE TRIGGER \S+ BEFORE UPDATE ON public\.gcal_state FOR EACH ROW/)])
    // 앞 migration의 예약 트리거는 그대로(옮기면 처음 자리·도착 비움)
    expect(first.triggers.filter((t) => bare(t.tbl) === 'calendar_appts' && t.tgname === 'calendar_appts_move')).toEqual(
      before.triggers.filter((t) => bare(t.tbl) === 'calendar_appts' && t.tgname === 'calendar_appts_move'),
    )
    for (const [name, definer] of [
      ['calendar_appts_gdel()', true],
      ['calendar_allday_gdel()', true],
      ['calendar_allday_offwait()', true],
      ['gsheet_runs_prune()', true],
      ['calendar_appts_gwait()', false],
      ['calendar_allday_gwait()', false],
      ['calendar_allday_guard()', false],
      ['gcal_fixes_prune()', false],
    ] as const) {
      const f = fnOf(first, name)
      expect(f?.definer, name).toBe(definer)
      expect(f?.config, name).toEqual(['search_path=""'])
      // 트리거만 부른다(누구도 바로 부르지 못한다)
      for (const role of ['anon', 'authenticated', '']) expect(runsAs(f?.acl, role), `${name} ${role || 'PUBLIC'}`).toBe(false)
    }
  })

  it('AC-8502.1: 검사 함수 둘은 immutable sql이고 authenticated만 부르며, 색 이름 함수는 아무도 부르지 못한다', () => {
    for (const name of ['gsheet_counts_ok(jsonb)', 'gsheet_cells_ok(text[])']) {
      const f = fnOf(first, name)
      expect(f, name).toMatchObject({ lang: 'sql', volatile: 'i', result: 'boolean', definer: false, config: ['search_path=""'] })
      expect(runsAs(f?.acl, 'authenticated'), name).toBe(true)
      expect(runsAs(f?.acl, 'anon') || runsAs(f?.acl, ''), name).toBe(false)
    }
    const color = fnOf(first, 'gcal_color_name(text)')
    expect(color).toMatchObject({ volatile: 'i', result: 'text' })
    for (const role of ['anon', 'authenticated', '']) expect(runsAs(color?.acl, role), role || 'PUBLIC').toBe(false)
  })

  it('AC-8502.1: 새 표 칸 모양 검사 — 맞는 값은 들어가고 틀린 값은 23514다', async () => {
    const cases: [NewTable, Row, Row[]][] = [
      [
        'gcal_links',
        { script_url: 'https://script.google.com/a/macros/fake-clinic.co.kr/s/AKfycbFAKE_0123456789/exec' },
        [
          { script_url: 'http://script.google.com/macros/s/AKfycbFAKE_0123456789/exec' },
          { script_url: 'https://script.google.com/macros/s/short/exec' },
          { script_url: 'https://evil.example/macros/s/AKfycbFAKE_0123456789/exec' },
          { secret: 'x'.repeat(31) },
          { secret: 'x'.repeat(129) },
          { secret: `${'x'.repeat(40)}!` },
          { calendar_id: 'c'.repeat(301) },
          { calendar_name: '가'.repeat(101) },
          { default_hex: '#12345' },
          { default_hex: 'red' },
          { rules: [] },
          { rules: { pad: 'x'.repeat(2000) } },
          { look: { pad: 'x'.repeat(4000) } },
        ],
      ],
      ['gcal_state', { fail_code: 'E-GCAL-LIMIT' }, [{ fail_code: 'GCAL-LIMIT' }, { fail_code: 'E-gcal' }, { fail_code: `E-${'A'.repeat(31)}` }]],
      [
        'gcal_fixes',
        { g_event_id: `a_${'b'.repeat(298)}`, start_min: 1435, len_min: 1440, g_color: '11', reason: 'off-name', state: 'skip' },
        [
          { g_event_id: 'abcd' },
          { g_event_id: 'b'.repeat(301) },
          { g_event_id: 'abc-def' },
          { start_min: 1440 },
          { start_min: -5 },
          { len_min: 0 },
          { len_min: 1441 },
          { g_color: '12' },
          { g_color: '0' },
          { g_title: '가'.repeat(201) },
          { reason: 'other' },
          { state: 'done' },
          { guess: [] },
          { guess: { pad: 'x'.repeat(2000) } },
        ],
      ],
      ['gcal_off_days', { g_title: '가'.repeat(200) }, [{ g_title: '가'.repeat(201) }, { g_event_id: 'a-b-c-d' }]],
      [
        'gsheet_months',
        { ym: '2026-12', gids: { '31': 0, '9': 2147483647 } },
        [
          { ym: '2026-13' },
          { ym: '202611' },
          { file_id: 'short' },
          { file_id: `${'a'.repeat(30)}/x` },
          { gids: [] },
          { gids: { '0': 1 } },
          { gids: { '32': 1 } },
          { gids: { x: 1 } },
          { gids: { '1': 'x' } },
          { gids: { '1': 1.5 } },
          { gids: { '1': -1 } },
          { gids: { pad: 'x'.repeat(2000) } },
        ],
      ],
      [
        'gsheet_runs',
        { via: 'past', mode: 'overwrite', outcome: 'fail', code: 'E-GSHEET-KEY' },
        [{ via: 'cron' }, { mode: 'fill' }, { outcome: 'bad' }, { code: 'E-' }, { code: 'X-1' }, { rows: -1 }],
      ],
    ]
    for (const [table, good, bads] of cases) {
      await become(A)
      expect(await outcome(() => send(table, { ...ROW[table], ...good })), `${table} 맞는 값`).toBe('ok 1')
      await operator()
      await db.query(`delete from public.${table}`)
      for (const bad of bads) {
        await become(A)
        expect(await outcome(() => send(table, { ...ROW[table], ...bad })), `${table} ${JSON.stringify(bad).slice(0, 60)}`).toBe('error 23514')
      }
    }
  })
})

describe('AC-8502.2 권한 표(7-5) — 새 표 여덟', SLOW, () => {
  it.each(NEW_TABLES)('AC-8502.2: %s 읽기 — 원장·데스크는 내 병원 줄, 다른 병원은 자기 줄, 대기·병원 없음은 0줄, anon은 거부, 보는 관리자는 gsheet만 그 의원 줄', async (table) => {
    await seedNew(HA, [table])
    await seedNew(HB, [table])
    const seen: Record<Actor, string> = {} as Record<Actor, string>
    for (const actor of ACTORS) {
      await act(actor)
      try {
        seen[actor] = (await labelsOf(table)).join(',')
      } catch (error) {
        seen[actor] = `error ${(error as { code?: string }).code}`
      }
    }
    expect(seen).toEqual({
      owner: 'A',
      desk: 'A',
      other: 'B',
      pending: '',
      none: '',
      anon: 'error 42501',
      viewer: RIGHTS[table].view ? 'B' : '',
    })
  })

  it.each(NEW_TABLES)('AC-8502.2: %s 넣기 — 7-5 표의 ○만 되고, 병원 칸을 보내면 거부다', async (table) => {
    await seedNew(HB, [table])
    const r = RIGHTS[table]
    const got: Record<string, string> = {}
    for (const actor of ACTORS) {
      await operator()
      await db.query(`delete from public.${table} where hospital_id = $1`, [HA])
      await act(actor)
      got[actor] = await outcome(() => send(table, actor === 'other' ? { hospital_id: HA, ...ROW[table] } : ROW[table]))
    }
    const deny = 'error 42501'
    expect(got).toEqual({
      owner: r.insert ? 'ok 1' : deny,
      desk: r.insert ? (r.deskWrite ? 'ok 1' : expect.stringMatching(/^error (42501|23502)$/)) : deny,
      other: deny,
      pending: r.insert ? expect.stringMatching(/^error (42501|23502)$/) : deny,
      none: r.insert ? expect.stringMatching(/^error (42501|23502)$/) : deny,
      anon: deny,
      viewer: deny,
    })
    // 원장이 넣은 줄은 내 병원 줄이 된다(기본값)
    await operator()
    await db.query(`delete from public.${table} where hospital_id = $1`, [HA])
    await become(A)
    if (r.insert) {
      await send(table, ROW[table])
      await operator()
      expect((await rows(`select hospital_id from public.${table} where hospital_id = $1`, [HA])).length).toBe(1)
    }
  })

  it.each(NEW_TABLES)('AC-8502.2: %s 고치기·지우기 — 7-5 표의 ○만 되고, 남의 병원·보는 관리자는 0줄 또는 거부다', async (table) => {
    const r = RIGHTS[table]
    const updated: Record<string, string> = {}
    const deleted: Record<string, string> = {}
    for (const actor of ACTORS) {
      await resetData()
      await seedNew(HA, [table])
      await seedNew(HB, [table])
      const target = actor === 'viewer' ? HB : HA
      await act(actor)
      updated[actor] = await outcome(() => db.query(`update public.${table} set ${SET[table]} where hospital_id = $1`, [target]))
      await act(actor)
      deleted[actor] = await outcome(() => db.query(`delete from public.${table} where hospital_id = $1`, [target]))
    }
    const deny = 'error 42501'
    const zero = (ok: boolean) => (ok ? 'ok 0' : deny)
    expect(updated).toEqual({
      owner: r.update ? 'ok 1' : deny,
      desk: r.update ? (r.deskWrite ? 'ok 1' : 'ok 0') : deny,
      other: zero(r.update),
      pending: zero(r.update),
      none: zero(r.update),
      anon: deny,
      viewer: zero(r.update),
    })
    expect(deleted).toEqual({
      owner: r.del ? 'ok 1' : deny,
      desk: r.del ? 'ok 1' : deny,
      other: zero(r.del),
      pending: zero(r.del),
      none: zero(r.del),
      anon: deny,
      viewer: zero(r.del),
    })
  })

  it('AC-8502.2: gcal_links.secret은 그 병원 원장·데스크만 읽고 원장만 쓴다(데스크·다른 병원·보는 관리자 0줄)', async () => {
    await seedNew(HA, ['gcal_links'])
    await seedNew(HB, ['gcal_links'])
    for (const user of [A, K]) {
      await become(user)
      expect(await rows(`select secret from public.gcal_links`), user).toEqual([{ secret: SECRET }])
    }
    await become(A, VIEWING)
    expect(await rows(`select secret from public.gcal_links`)).toEqual([])
    const next = 'next-secret-0123456789-ABCDEFGHIJKLMNOPQ'
    for (const [user, headers, expected] of [
      [K, null, 'ok 0'],
      [B, null, 'ok 0'],
      [A, VIEWING, 'ok 0'],
      [A, null, 'ok 1'],
    ] as const) {
      await become(user, headers)
      expect(await outcome(() => db.query(`update public.gcal_links set secret = $1 where hospital_id = $2`, [next, HA])), `${user} ${headers}`).toBe(expected)
    }
    await operator()
    expect(await rows(`select secret from public.gcal_links where hospital_id = $1`, [HA])).toEqual([{ secret: next }])
  })

  it('AC-8502.2: 원장은 연결 전에 주소·비밀 글자 두 칸 없이 look만 넣을 수 있다(upsert가 그 두 칸 없이 줄을 만든다)', async () => {
    await become(A)
    expect(await outcome(() => send('gcal_links', { look: { cancel: 'tomato', offWord: 'off' } }))).toBe('ok 1')
    await become(A)
    expect(
      await outcome(() =>
        db.query(
          `insert into public.gcal_links (rules) values ('{"pullMin": 2}') on conflict (hospital_id) do update set rules = excluded.rules`,
        ),
      ),
    ).toBe('ok 1')
    await operator()
    expect(await rows(`select script_url, secret, rules, look from public.gcal_links where hospital_id = $1`, [HA])).toEqual([
      { script_url: null, secret: null, rules: { pullMin: 2 }, look: { cancel: 'tomato', offWord: 'off' } },
    ])
  })

  it('AC-8502.2: 예약 새 칸은 원장·데스크가 넣고 고치며(g_wait_at은 읽기만), 보는 관리자는 예약·gcal 줄을 한 줄도 못 읽고 종일 새 칸은 읽는다', async () => {
    const g: Row = {
      g_event_id: EV(7),
      g_updated: AT,
      g_title: '도수 가짜환자',
      g_color: '5',
      color_from: 'google',
      g_keep_title: true,
      g_moved: false,
      g_gone: false,
      g_wait: 'new',
      g_note: '덮인 쪽 한 줄',
      g_from: 'import',
      g_how: { staff: 'title', kind: 'title', memo: false, gStart: '10:00', gEnd: '10:30' },
    }
    for (const [user, n] of [
      [A, 7],
      [K, 8],
    ] as const) {
      await become(user)
      expect(await outcome(() => send('calendar_appts', { ...APPT, ...g, g_event_id: EV(n) })), user).toBe('ok 1')
      await become(user)
      expect(await outcome(() => db.query(`update public.calendar_appts set g_title = '고침', g_moved = true, g_how = '{}' where g_event_id = $1`, [EV(n)]))).toBe(
        'ok 1',
      )
      await become(user)
      expect(await outcome(() => send('calendar_allday', { day: DAY, type: 'memo', memo: '학회', g_event_id: EV(n + 10), g_updated: AT, g_wait: true }))).toBe('ok 1')
    }
    // g_wait_at은 넣기·고치기 모두 칸 권한이 없다
    await become(A)
    await expect(send('calendar_appts', { ...APPT, g_wait_at: AT })).rejects.toMatchObject(DENIED)
    await become(A)
    await expect(db.query(`update public.calendar_appts set g_wait_at = now()`)).rejects.toMatchObject(DENIED)
    await become(A)
    await expect(db.query(`update public.calendar_allday set g_wait_at = now()`)).rejects.toMatchObject(DENIED)
    // 칸 권한 표(7-1·7-2)
    for (const [table, insert, update] of [
      ['calendar_appts', [...APPT_OLD_WRITE, ...APPT_G_WRITE], [...APPT_OLD_WRITE, 'auto', ...APPT_G_WRITE]],
      ['calendar_allday', ['day', 'type', 'memo', 'staff_id', 'staff_name', 'g_event_id', 'g_updated', 'g_wait'], ['day', 'memo', 'g_event_id', 'g_updated', 'g_wait']],
    ] as const) {
      const columns = first.columns.filter((c) => c.table_name === table).map((c) => String(c.column_name))
      for (const column of columns) {
        const [privilege] = await rows(
          `select has_column_privilege('authenticated', $1, $2, 'INSERT') as can_insert, has_column_privilege('authenticated', $1, $2, 'UPDATE') as can_update`,
          [`public.${table}`, column],
        )
        expect(privilege, `${table}.${column}`).toEqual({ can_insert: (insert as readonly string[]).includes(column), can_update: (update as readonly string[]).includes(column) })
      }
    }
    // 보는 관리자(HB를 봄): HB 예약·gcal 줄은 0줄, HB 종일 줄은 새 칸까지 읽는다. 쓰기는 0줄·거부
    await seedAppt(HB, { g_event_id: EV(20), g_title: 'B 제목' })
    await seedAllDay(HB, { day: DAY, type: 'memo', memo: 'B 메모', g_event_id: EV(21), g_updated: AT, g_wait: true })
    await seedNew(HB, GCAL_TABLES)
    await become(A, VIEWING)
    expect(await rows(`select id from public.calendar_appts`)).toEqual([])
    for (const table of GCAL_TABLES) expect(await rows(`select * from public.${table}`), table).toEqual([])
    expect(await rows(`select hospital_id, memo, g_event_id, g_wait from public.calendar_allday`)).toEqual([{ hospital_id: HB, memo: 'B 메모', g_event_id: EV(21), g_wait: true }])
    await become(A, VIEWING)
    expect(await outcome(() => db.query(`update public.calendar_allday set g_wait = false where hospital_id = $1`, [HB]))).toBe('ok 0')
    await become(A, VIEWING)
    expect(await outcome(() => db.query(`update public.calendar_appts set g_wait = 'edit' where hospital_id = $1`, [HB]))).toBe('ok 0')
    await become(A, VIEWING)
    expect(await outcome(() => send('calendar_appts', { ...APPT, g_event_id: EV(22) }))).toBe('error 42501')
    // 다른 병원은 HA 줄을 못 본다, anon은 거부
    await become(B)
    expect((await rows(`select hospital_id from public.calendar_appts`)).map((r) => r.hospital_id)).toEqual([HB])
    await becomeAnon()
    await expect(db.query(`select g_event_id from public.calendar_appts`)).rejects.toMatchObject(DENIED)
  })
})

describe('AC-8502.3 예약 칸 제약', SLOW, () => {
  it('AC-8502.3: 시작 345·1435는 되고 343·1440은 거부, 시행자 세 칸 모두 비움·모두 참은 되고 일부만 빈 줄은 거부', async () => {
    const cases: [Row, string][] = [
      [{ start_min: 345 }, 'ok 1'], // google-link: 5분 단위 시작
      [{ start_min: 1435 }, 'ok 1'],
      [{ start_min: 0 }, 'ok 1'],
      [{ start_min: 343 }, 'error 23514'],
      [{ start_min: 1440 }, 'error 23514'],
      [{ start_min: -5 }, 'error 23514'],
      [{ staff_id: null, staff_name: null, staff_mark: null }, 'ok 1'],
      [{ staff_id: null }, 'error 23514'],
      [{ staff_name: null }, 'error 23514'],
      [{ staff_mark: null }, 'error 23514'],
      [{ staff_id: null, staff_name: null }, 'error 23514'],
      [{ staff_mark: '가나' }, 'error 23514'], // 그 밖 칸 길이 제약은 그대로
    ]
    for (const [extra, expected] of cases) {
      await become(A)
      expect(await outcome(() => send('calendar_appts', { ...APPT, ...extra })), JSON.stringify(extra)).toBe(expected)
    }
  })

  it('AC-8502.3: 같은 병원 같은 g_event_id 두 줄은 23505, 다른 병원 같은 id는 되고, 없는 id(null)는 여럿 된다', async () => {
    await become(A)
    await send('calendar_appts', { ...APPT, g_event_id: EV(1) })
    await become(A)
    await expect(send('calendar_appts', { ...APPT, g_event_id: EV(1), start_min: 1000 })).rejects.toMatchObject(UNIQUE_FAILED)
    await become(B)
    expect(await outcome(() => send('calendar_appts', { ...APPT, g_event_id: EV(1) }))).toBe('ok 1')
    for (let i = 0; i < 2; i++) {
      await become(A)
      expect(await outcome(() => send('calendar_appts', APPT))).toBe('ok 1')
    }
    // on conflict가 쓰는 유일 제약(부분 색인이 아님)
    const one = first.constraints.find((c) => bare(c.tbl) === 'calendar_appts' && c.conname === 'calendar_appts_g_event_one')
    expect(squash(one?.def)).toBe('UNIQUE (hospital_id, g_event_id)')
    await become(A)
    expect(
      await outcome(() =>
        db.query(
          `insert into public.calendar_appts (day, start_min, len_min, name, staff_id, staff_name, staff_mark, kind_id, kind_name, g_event_id)
           values ($1, 600, 30, '가짜', 'st', '가', '가', 'dosu', '도수', $2) on conflict (hospital_id, g_event_id) do nothing`,
          [DAY, EV(1)],
        ),
      ),
    ).toBe('ok 0')
  })

  it("AC-8502.3: g_color '12'·g_wait 'x'·g_title 201자·g_event_id 모양·g_from·color_from·g_note·g_how 크기는 거부다", async () => {
    const cases: [Row, string][] = [
      [{ g_color: '1' }, 'ok 1'],
      [{ g_color: '11' }, 'ok 1'],
      [{ g_color: '12' }, 'error 23514'],
      [{ g_color: '0' }, 'error 23514'],
      [{ g_wait: 'x' }, 'error 23514'],
      ...['new', 'edit', 'move', 'cancel', 'uncancel', 'color'].map((w): [Row, string] => [{ g_wait: w }, 'ok 1']),
      [{ g_title: '가'.repeat(200) }, 'ok 1'],
      [{ g_title: '가'.repeat(201) }, 'error 23514'],
      [{ g_event_id: 'abcd' }, 'error 23514'],
      [{ g_event_id: 'abc-def' }, 'error 23514'],
      [{ g_event_id: `x${'y'.repeat(299)}` }, 'ok 1'],
      [{ g_event_id: `x${'y'.repeat(300)}` }, 'error 23514'],
      [{ g_event_id: 'abc_20261126T010000Z' }, 'ok 1'],
      [{ g_from: 'pull' }, 'ok 1'],
      [{ g_from: 'other' }, 'error 23514'],
      [{ color_from: 'google' }, 'ok 1'],
      [{ color_from: 'bit' }, 'error 23514'],
      [{ g_note: '가'.repeat(101) }, 'error 23514'],
      [{ g_how: [] }, 'error 23514'],
      [{ g_how: { pad: 'x'.repeat(600) } }, 'error 23514'],
    ]
    for (const [extra, expected] of cases) {
      await become(A)
      expect(await outcome(() => send('calendar_appts', { ...APPT, ...extra })), JSON.stringify(extra).slice(0, 80)).toBe(expected)
    }
  })

  it('AC-8502.3: 종일 줄 g_event_id는 메모 줄에만, 같은 병원·id·날짜는 하나만(다른 날은 됨)', async () => {
    await become(A)
    expect(await outcome(() => send('calendar_allday', { day: DAY, type: 'off', staff_id: 'st-ga', staff_name: '가', g_event_id: EV(1) }))).toBe('error 23514')
    await become(A)
    expect(await outcome(() => send('calendar_allday', { day: DAY, type: 'memo', memo: '학회', g_event_id: EV(1) }))).toBe('ok 1')
    await become(A)
    expect(await outcome(() => send('calendar_allday', { day: DAY, type: 'memo', memo: '학회', g_event_id: EV(1) }))).toBe('error 23505')
    await become(A)
    expect(await outcome(() => send('calendar_allday', { day: DAY2, type: 'memo', memo: '학회', g_event_id: EV(1) }))).toBe('ok 1')
    await become(B)
    expect(await outcome(() => send('calendar_allday', { day: DAY, type: 'memo', memo: '학회', g_event_id: EV(1) }))).toBe('ok 1')
  })
})

describe('AC-8502.4 색 옮기기', SLOW, () => {
  it('AC-8502.4: calendar_settings.kinds 색이 11색 이름이 되고(null·default 그대로) words가 없으면 기본 단어가 생긴다', () => {
    const settings = (owner: string) => firstRows.settings.find((r) => r.hospital_id === owner)
    expect(settings(HA)?.kinds).toEqual(MOVED_KINDS)
    expect(settings(HB)?.kinds).toEqual(MOVED_OLD_DEFAULT)
  })

  it('AC-8502.4: clinic_profiles.staff·calendar_settings.staff 사람마다 색이 새 이름이 된다(null 그대로, 목록은 줄이지 않음)', () => {
    expect(firstRows.profiles.find((r) => r.hospital_id === HA)?.staff).toEqual(MOVED_PROFILE_STAFF)
    expect(firstRows.settings.find((r) => r.hospital_id === HA)?.staff).toEqual(MOVED_SETTINGS_STAFF)
    expect(firstRows.settings.find((r) => r.hospital_id === HB)?.staff).toEqual([])
  })

  it('AC-8502.4: 두 번째 실행은 아무것도 바꾸지 않는다(병원 정보 고친 시각까지 그대로)', () => {
    expect(secondRows.settings).toEqual(firstRows.settings)
    expect(secondRows.profiles).toEqual(firstRows.profiles)
  })

  it('AC-8502.4: 색 이름 함수는 7-4 표 그대로(옛 20색 → 11색, 새 이름 그대로, 모르는 값은 흑연)', async () => {
    await operator()
    for (const [from, to] of COLOR_MOVES) expect((await rows(`select public.gcal_color_name($1) as c`, [from]))[0].c, from).toBe(to)
    await become(A)
    await expect(db.query(`select public.gcal_color_name('pink')`)).rejects.toMatchObject(DENIED)
  })

  it('AC-8502.4: calendar_settings.kinds 기본값이 design.md 7-4 jsonb다', async () => {
    await become(A)
    await db.query(`insert into public.calendar_settings (open_hour) values (9)`)
    await operator()
    expect((await rows(`select kinds from public.calendar_settings where hospital_id = $1`, [HA]))[0].kinds).toEqual(NEW_DEFAULT_KINDS)
  })
})

describe('AC-8502.5 이어지지 않은 직원의 휴무 줄', SLOW, () => {
  async function seedStaff() {
    await put('clinic_profiles', { hospital_id: HA, hours: SEVEN, staff: MOVED_PROFILE_STAFF })
    await put('staff_members', { id: M1, hospital_id: HA, name: '최시안', job: '물리치료사', employment: 'regular', hired_on: '2025-01-01' })
    await put('staff_members', { id: M2, hospital_id: HA, name: LONG_NAME, job: '간호사', employment: 'regular', hired_on: '2025-01-01' })
    await put('staff_members', { id: M3, hospital_id: HA, name: '박치료', job: '물리치료사', employment: 'regular', hired_on: '2025-01-01', calendar_staff_id: 'p2' })
  }
  const offRows = async () => {
    await operator()
    return rows(`select day::text as day, staff_id, staff_name, part, leave_id from public.calendar_allday where type = 'off' order by day, staff_id`)
  }
  const leave = async (staff: string, day: string, kind = 'annual', part: string | null = null) => {
    await become(A)
    const [row] = (await send('staff_leaves', { group_id: rid(99, A), staff_id: staff, day, kind, part }, 'id')).rows
    return String(row.id)
  }

  it("AC-8502.5: 하루 종일 휴가는 'm-' + 직원 id 32자 · 이름 앞 10자 · leave_id 줄이 생기고, 반차는 안 생기며, 이어진 직원은 지금 그대로다", async () => {
    await seedStaff()
    const l1 = await leave(M1, DAY)
    await leave(M1, DAY2, 'half', 'am')
    const l3 = await leave(M2, DAY)
    const l4 = await leave(M3, DAY2)
    expect(mId(M1)).toMatch(/^m-[0-9a-f]{32}$/)
    expect(await offRows()).toEqual([
      { day: DAY, staff_id: mId(M1), staff_name: '최시안', part: null, leave_id: l1 },
      { day: DAY, staff_id: mId(M2), staff_name: LONG_NAME.slice(0, 10), part: null, leave_id: l3 },
      { day: DAY2, staff_id: 'p2', staff_name: '박치료', part: null, leave_id: l4 },
    ])
    // 휴가를 지우면 줄도 지워진다
    await become(A)
    await db.query(`delete from public.staff_leaves where id = $1`, [l1])
    expect((await offRows()).map((r) => r.staff_id)).toEqual([mId(M2), 'p2'])
  })

  it("AC-8502.5: 연결을 바꾸면 'm-' 줄이 이어진 줄로, 연결을 끊으면 다시 'm-' 줄로(하루 종일만) 바뀐다", async () => {
    await seedStaff()
    const l1 = await leave(M1, DAY)
    await leave(M1, DAY2, 'half', 'pm')
    await become(A)
    await db.query(`update public.staff_members set calendar_staff_id = 'p1' where id = $1`, [M1])
    expect(await offRows()).toEqual([
      { day: DAY, staff_id: 'p1', staff_name: '김원장', part: null, leave_id: l1 },
      { day: DAY2, staff_id: 'p1', staff_name: '김원장', part: 'pm', leave_id: expect.any(String) },
    ])
    await become(A)
    await db.query(`update public.staff_members set calendar_staff_id = null where id = $1`, [M1])
    expect(await offRows()).toEqual([{ day: DAY, staff_id: mId(M1), staff_name: '최시안', part: null, leave_id: l1 }])
  })

  it("AC-8502.5: 이 migration은 한국 오늘 − 1년 뒤 이미 있던 하루 종일 휴가를 한 번 'm-' 줄로 채운다(반차·1년 전·이어진 직원은 아님)", () => {
    const filled = firstRows.allday.filter((r) => String(r.staff_id ?? '').startsWith('m-')).map((r) => [r.day, r.staff_id, r.staff_name, r.part, r.leave_id])
    expect(filled).toEqual([
      [addDays(TODAY, -10), mId(M1), '최시안', null, L1],
      [DAY, mId(M2), LONG_NAME.slice(0, 10), null, L4],
    ])
    expect(firstRows.allday.filter((r) => r.staff_id === 'p2').map((r) => r.leave_id)).toEqual([L5])
  })

  it("AC-8502.5: 휴가 트리거 두 함수는 staff.sql 지금 글을 글자 그대로 옮기고 'm-' 갈래만 더한다", () => {
    for (const fn of ['staff_leave_link', 'staff_member_relink']) {
      const old = bodyOf(STAFF_MIGRATION, fn)
      const now = bodyOf(MIGRATION, fn)
      expect(old, fn).not.toBe('')
      const tail = old.slice(old.lastIndexOf('  return null;'))
      expect(now.startsWith(old.slice(0, old.lastIndexOf('  return null;'))), fn).toBe(true)
      expect(now.endsWith(tail), fn).toBe(true)
      expect(now.length, fn).toBeGreaterThan(old.length)
      expect(now.slice(old.lastIndexOf('  return null;')), fn).toContain("'m-' || replace(")
      expect(fnOf(first, `${fn}()`)).toMatchObject({ definer: true, config: ['search_path=""'] })
    }
  })
})

describe('AC-8502.6 하루 종일 off 줄 → gcal_off_days.wait', SLOW, () => {
  it('AC-8502.6: off 줄을 넣거나 지우면 그날 줄이 wait = true가 된다(없으면 생기고, 있던 짝 칸은 그대로)', async () => {
    await become(A)
    const [off] = (await send('calendar_allday', { day: DAY, type: 'off', staff_id: 'st-ga', staff_name: '가' }, 'id')).rows
    expect(await offDaysNow()).toEqual([{ hospital_id: HA, day: DAY, g_event_id: null, g_title: null, wait: true, has_wait_at: true }])
    await operator()
    await db.query(`update public.gcal_off_days set wait = false, wait_at = null, g_event_id = $1, g_title = 'off 가'`, [EV(5)])
    await become(K) // 데스크가 지워도 같다
    await db.query(`delete from public.calendar_allday where id = $1`, [off.id])
    expect(await offDaysNow()).toEqual([{ hospital_id: HA, day: DAY, g_event_id: EV(5), g_title: 'off 가', wait: true, has_wait_at: true }])
  })

  it('AC-8502.6: 반차 줄·메모 줄과 한국 오늘 − 1년보다 이른 날의 off 줄은 바꾸지 않는다', async () => {
    await put('calendar_allday', { hospital_id: HA, day: DAY, type: 'off', staff_id: 'st-ga', staff_name: '가', part: 'am' })
    await become(A)
    await send('calendar_allday', { day: DAY2, type: 'memo', memo: '학회' })
    await put('calendar_allday', { hospital_id: HA, day: OLDEST, type: 'off', staff_id: 'st-ga', staff_name: '가' })
    expect(await offDaysNow()).toEqual([])
    await operator()
    await db.query(`delete from public.calendar_allday`)
    expect(await offDaysNow()).toEqual([])
    // 1년 날(이날은 남는 날)은 적는다
    await put('calendar_allday', { hospital_id: HA, day: YEAR_AGO, type: 'off', staff_id: 'st-ga', staff_name: '가' })
    expect((await offDaysNow()).map((r) => r.day)).toEqual([YEAR_AGO])
  })
})

describe('AC-8502.7 지움 줄(gcal_deletes)', SLOW, () => {
  it('AC-8502.7: g_event_id가 있는 예약·종일 메모를 지우면 (병원, id, 그날) 줄이 생기고, id 없는 줄은 아무것도 안 남긴다', async () => {
    await become(A)
    await send('calendar_appts', { ...APPT, g_event_id: EV(1), g_title: '도수 가짜환자' })
    await become(A)
    await send('calendar_appts', { ...APPT, start_min: 1000 })
    await become(A)
    await send('calendar_allday', { day: DAY2, type: 'memo', memo: '학회', g_event_id: EV(2) })
    await become(A)
    await send('calendar_allday', { day: DAY2, type: 'memo', memo: '휴진' })
    await become(B)
    await send('calendar_appts', { ...APPT, g_event_id: EV(1) })
    await become(K) // 데스크가 지움
    expect(await outcome(() => db.query(`delete from public.calendar_appts`))).toBe('ok 2')
    await become(A)
    expect(await outcome(() => db.query(`delete from public.calendar_allday`))).toBe('ok 2')
    expect(await deletesNow()).toEqual([
      { hospital_id: HA, g_event_id: EV(1), day: DAY, kind: 'appt', label: '도수 가짜환자' },
      { hospital_id: HA, g_event_id: EV(2), day: DAY2, kind: 'memo', label: '학회' },
    ])
    // 같은 줄이 또 지워져도 하나(on conflict do nothing)
    await become(A)
    await send('calendar_appts', { ...APPT, g_event_id: EV(1), g_title: '다른 제목' })
    await become(A)
    await db.query(`delete from public.calendar_appts`)
    expect((await deletesNow()).filter((r) => r.kind === 'appt')).toEqual([{ hospital_id: HA, g_event_id: EV(1), day: DAY, kind: 'appt', label: '도수 가짜환자' }])
  })

  it('AC-8502.7: 한국 오늘 − 1년보다 이른 날의 줄은 지워도 아무것도 안 남기고, 1년 날 줄은 남긴다', async () => {
    await seedAppt(HA, { day: OLDEST, g_event_id: EV(3) })
    await seedAppt(HA, { day: YEAR_AGO, g_event_id: EV(4) })
    await seedAllDay(HA, { day: OLDEST, type: 'memo', memo: '옛 메모', g_event_id: EV(5) })
    await operator()
    await db.query(`delete from public.calendar_appts`)
    await db.query(`delete from public.calendar_allday`)
    expect(await deletesNow()).toEqual([{ hospital_id: HA, g_event_id: EV(4), day: YEAR_AGO, kind: 'appt', label: null }])
  })

  it('AC-8502.7: 병원 줄을 지우면(가입 삭제) 이어진 예약·메모·off 줄이 함께 지워지고 지움 트리거가 막지 않는다', async () => {
    await seedAppt(HA, { g_event_id: EV(1) })
    await seedAllDay(HA, { day: DAY, type: 'memo', memo: '학회', g_event_id: EV(2) })
    await seedAllDay(HA, { day: DAY2, type: 'off', staff_id: 'st-ga', staff_name: '가' }) // 그날 gcal_off_days 줄은 트리거가 만든다
    await seedNew(HA)
    await operator()
    expect(await outcome(() => db.query(`delete from public.hospitals where id = $1`, [HA]))).toBe('ok 1')
    for (const table of ['calendar_appts', 'calendar_allday', ...NEW_TABLES]) {
      expect((await rows(`select 1 from public.${table} where hospital_id = $1`, [HA])).length, table).toBe(0)
    }
  })
})

describe('AC-8502.8 맞춤 상태 · 넣은 기록 · 비밀 글자 표시', SLOW, () => {
  it('AC-8502.8: gcal_state.pulled_until은 더 이른 시각·null로 고쳐도 그대로이고 더 늦은 시각으로는 바뀐다(고친 시각은 DB가)', async () => {
    const t2 = '2026-11-20T02:00:00.000Z'
    await become(A)
    await send('gcal_state', { pulled_until: t2 })
    await quiet(`update public.gcal_state set updated_at = '2001-01-01'`)
    const pulled = async () => {
      await operator()
      const [row] = await rows(`select pulled_until, updated_at from public.gcal_state where hospital_id = $1`, [HA])
      return [(row.pulled_until as Date).toISOString(), (row.updated_at as Date).getUTCFullYear()]
    }
    for (const [value, expected] of [
      ['2026-11-20T01:00:00.000Z', t2],
      [null, t2],
      ['2026-11-20T03:00:00.000Z', '2026-11-20T03:00:00.000Z'],
    ] as const) {
      await become(K) // 데스크도 같다
      expect(await outcome(() => db.query(`update public.gcal_state set pulled_until = $1`, [value]))).toBe('ok 1')
      expect(await pulled()).toEqual([expected, expect.any(Number)])
    }
    expect((await pulled())[1]).toBeGreaterThan(2001)
    // upsert(PostgREST on conflict)도 같다
    await become(A)
    await db.query(
      `insert into public.gcal_state (pulled_until) values ('2026-11-19T00:00:00Z') on conflict (hospital_id) do update set pulled_until = excluded.pulled_until`,
    )
    expect((await pulled())[0]).toBe('2026-11-20T03:00:00.000Z')
  })

  it('AC-8502.8: gsheet_runs를 넣으면 같은 병원의 14일보다 오래된 줄만 지워진다', async () => {
    const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString()
    await put('gsheet_runs', { id: rid(1, A), hospital_id: HA, at: ago(15), ...ROW.gsheet_runs })
    await put('gsheet_runs', { id: rid(2, A), hospital_id: HA, at: ago(13), ...ROW.gsheet_runs })
    await put('gsheet_runs', { id: rid(3, B), hospital_id: HB, at: ago(15), ...ROW.gsheet_runs })
    await become(K) // 데스크가 넣어도 그 병원 줄을 지운다
    expect(await outcome(() => send('gsheet_runs', ROW.gsheet_runs))).toBe('ok 1')
    await operator()
    const left = await rows(`select id, hospital_id from public.gsheet_runs order by at`)
    expect(left.filter((r) => r.hospital_id === HB).map((r) => r.id)).toEqual([rid(3, B)])
    expect(left.filter((r) => r.hospital_id === HA)).toHaveLength(2)
    expect(left.map((r) => r.id)).not.toContain(rid(1, A))
    // 보는 관리자는 넣지 못한다(지우기도 돌지 않는다)
    await become(A, VIEWING)
    expect(await outcome(() => send('gsheet_runs', ROW.gsheet_runs))).toBe('error 42501')
    await operator()
    expect((await rows(`select id from public.gsheet_runs where hospital_id = $1`, [HB])).map((r) => r.id)).toEqual([rid(3, B)])
  })

  it('AC-8502.8: counts에 숫자·참거짓이 아닌 값이 있거나 4,000바이트를 넘으면, cells가 칸 주소 모양이 아니거나 20개를 넘으면 거부된다', async () => {
    const cases: [Row, string][] = [
      [{ counts: { added: 3, filled: 0, full: true, ratioSkippedCount: 2 } }, 'ok 1'],
      [{ counts: {} }, 'ok 1'],
      [{ counts: { added: '3' } }, 'error 23514'],
      [{ counts: { notPut: { noName: 1 } } }, 'error 23514'],
      [{ counts: { list: [1] } }, 'error 23514'],
      [{ counts: { none: null } }, 'error 23514'],
      [{ counts: [1, 2] }, 'error 23514'],
      [{ counts: Object.fromEntries(Array.from({ length: 300 }, (_, i) => [`key_${i}`, i])) }, 'error 23514'],
      [{ cells: ['1!B17', '31!AA302', '일일!P9999'] }, 'ok 1'],
      [{ cells: Array.from({ length: 20 }, (_, i) => `${i + 1}!B17`) }, 'ok 1'],
      [{ cells: Array.from({ length: 21 }, (_, i) => `${i + 1}!B17`) }, 'error 23514'],
      [{ cells: ['B17'] }, 'error 23514'],
      [{ cells: ['!B17'] }, 'error 23514'],
      [{ cells: [`${'가'.repeat(32)}!B17`] }, 'error 23514'],
      [{ cells: ['1!b17'] }, 'error 23514'],
      [{ cells: ['1!ABCD1'] }, 'error 23514'],
      [{ cells: ['1!B12345'] }, 'error 23514'],
      [{ cells: ['1!B1!C2'] }, 'error 23514'],
    ]
    for (const [extra, expected] of cases) {
      await become(A)
      expect(await outcome(() => send('gsheet_runs', { ...ROW.gsheet_runs, ...extra })), JSON.stringify(extra).slice(0, 80)).toBe(expected)
    }
    await operator()
    expect((await rows(`select public.gsheet_counts_ok('{"a": 1}') as a, public.gsheet_cells_ok('{1!A1}') as b`))[0]).toEqual({ a: true, b: true })
  })

  it('AC-8502.8: gsheet_settings.secret_tag는 16자 소문자 16진수만 받는다(비움은 됨)', async () => {
    for (const [tag, expected] of [
      ['0123456789abcdef', 'ok 1'],
      [null, 'ok 1'],
      ['0123456789ABCDEF', 'error 23514'],
      ['0123456789abcde', 'error 23514'],
      ['0123456789abcdef0', 'error 23514'],
      ['0123456789abcdeg', 'error 23514'],
    ] as const) {
      await operator()
      await db.query(`delete from public.gsheet_settings`)
      await become(A)
      expect(await outcome(() => send('gsheet_settings', { conf: {}, secret_tag: tag })), String(tag)).toBe(expected)
    }
  })
})

describe('AC-8502.9 calendar_off_names()', SLOW, () => {
  async function seedNames() {
    await put('clinic_profiles', { hospital_id: HA, hours: SEVEN, staff: MOVED_PROFILE_STAFF })
    await put('clinic_profiles', { hospital_id: HB, hours: SEVEN, staff: [{ id: 'q1', name: '남의원장', role: 'director', mark: '남', color: 'sage', calendar: true }] })
    const member = (id: string, hospital: string, name: string, extra: Row = {}) =>
      put('staff_members', { id, hospital_id: hospital, name, job: '원무', employment: 'regular', hired_on: '2025-01-01', ...extra })
    await member(M1, HA, '최시안')
    await member(M2, HA, '퇴사한직원', { left_on: TODAY })
    await member(M3, HA, '박치료', { calendar_staff_id: 'p2' })
    await member(rid(44, A), HA, '퇴사예정', { left_on: addDays(TODAY, 30) })
    await member(rid(45, B), HB, '남의직원')
  }
  const sorted = (list: unknown) => [...(list as Row[])].sort((x, y) => String(x.id).localeCompare(String(y.id)))
  const namesOf = async () => (await rows(`select public.calendar_off_names() as names`))[0].names

  it("AC-8502.9: 원장·데스크는 내 병원 병원 정보 사람(id·이름)과 예약 시행자와 이어지지 않은 재직 직원('m-' id·이름)만 받는다", async () => {
    await seedNames()
    const expected = sorted([
      { id: 'p1', name: '김원장' },
      { id: 'p2', name: '박치료' },
      { id: 'p3', name: '이실장' },
      { id: mId(M1), name: '최시안' },
      { id: mId(rid(44, A)), name: '퇴사예정' },
    ])
    for (const user of [A, K]) {
      await become(user)
      expect(sorted(await namesOf()), user).toEqual(expected)
    }
    await become(B)
    expect(sorted(await namesOf())).toEqual(sorted([{ id: 'q1', name: '남의원장' }, { id: mId(rid(45, B)), name: '남의직원' }]))
  })

  it('AC-8502.9: 승인 대기·병원 없음·보는 관리자는 빈 목록, anon은 거부다', async () => {
    await seedNames()
    for (const [user, headers] of [
      [C, null],
      [E, null],
      [A, VIEWING],
    ] as const) {
      await become(user, headers)
      expect(await namesOf(), user).toEqual([])
    }
    await becomeAnon()
    await expect(db.query(`select public.calendar_off_names()`)).rejects.toMatchObject(DENIED)
    const f = fnOf(first, 'calendar_off_names()')
    expect(f).toMatchObject({ definer: true, volatile: 's', result: 'jsonb', config: ['search_path=""'] })
    expect(runsAs(f?.acl, 'authenticated')).toBe(true)
    expect(runsAs(f?.acl, 'anon') || runsAs(f?.acl, '')).toBe(false)
  })
})

describe('AC-8502.10 1년 지우기와 구글', SLOW, () => {
  it('AC-8502.10: 구글과 이어진 1년 지난 예약·종일 메모·off 줄을 새 예약 넣기의 1년 지우기가 지워도 gcal_deletes·gcal_off_days는 그대로다', async () => {
    const oldAppt = await seedAppt(HA, { day: OLDEST, g_event_id: EV(1), g_title: '옛 예약' })
    const oldMemo = await seedAllDay(HA, { day: OLDEST, type: 'memo', memo: '옛 메모', g_event_id: EV(2) })
    const oldOff = await seedAllDay(HA, { day: OLDEST, type: 'off', staff_id: 'st-ga', staff_name: '가' })
    await put('gcal_off_days', { hospital_id: HA, day: OLDEST, g_event_id: EV(3), g_title: 'off 가', wait: false })
    await put('gcal_off_days', { hospital_id: HA, day: DAY, g_event_id: EV(4), g_title: 'off 나', wait: false })
    const offBefore = await offDaysNow()
    expect(await deletesNow()).toEqual([])
    await become(A)
    expect(await outcome(() => send('calendar_appts', APPT))).toBe('ok 1')
    await operator()
    expect((await rows(`select id from public.calendar_appts where id = $1`, [oldAppt])).length).toBe(0)
    expect((await rows(`select id from public.calendar_allday where id in ($1, $2)`, [oldMemo, oldOff])).length).toBe(0)
    expect(await deletesNow()).toEqual([])
    expect(await offDaysNow()).toEqual(offBefore)
  })
})

describe('AC-8502.11 g_wait_at(사용자가 고친 때)', SLOW, () => {
  const userEdits: [string, string][] = [
    ['day', `day = '${DAY2}'`],
    ['start_min', 'start_min = 905'],
    ['len_min', 'len_min = 35'],
    ['name', `name = '다른환자'`],
    ['chart', `chart = '99'`],
    ['staff', `staff_id = 'st-na', staff_name = '나', staff_mark = '나'`],
    ['staff_none', 'staff_id = null, staff_name = null, staff_mark = null'],
    ['kind_id', `kind_id = 'inj'`],
    ['kind_name', `kind_name = '주사'`],
    ['memo', `memo = '새 메모'`],
    ['status', `status = 'cancel'`],
  ]
  const others: [string, string][] = [
    ['auto', `auto = 'came'`],
    ['g_note', `g_note = '구글에서 고친 내용을 웹앱 내용으로 덮었어요'`],
    ['g_updated', `g_updated = now()`],
    ['g_title', `g_title = '새 제목'`],
    ['g_color', `g_color = '4'`],
    ['g_moved', `g_moved = true`],
  ]
  const recent = (at: string | null) => at !== null && Math.abs(Date.parse(at) - Date.now()) < 60_000

  it('AC-8502.11: g_wait를 처음 적으면(넣기·고치기) DB 지금 시각이 되고, g_wait 없이 넣으면 비어 있다', async () => {
    await become(A)
    const [withWait] = (await send('calendar_appts', { ...APPT, g_event_id: EV(1), g_wait: 'new', g_from: 'web' }, 'id')).rows
    expect(recent(await waitAtOf('calendar_appts', String(withWait.id)))).toBe(true)
    await become(A)
    const [plain] = (await send('calendar_appts', { ...APPT, start_min: 1000 }, 'id')).rows
    expect(await waitAtOf('calendar_appts', String(plain.id))).toBeNull()
    await become(A)
    await db.query(`update public.calendar_appts set g_wait = 'edit' where id = $1`, [plain.id])
    expect(recent(await waitAtOf('calendar_appts', String(plain.id)))).toBe(true)
  })

  it.each(userEdits)('AC-8502.11: 사용자 칸 %s를 고치면 g_wait_at이 DB 지금 시각으로 바뀐다', async (_label, set) => {
    const id = await seedAppt(HA, { g_wait: 'edit' })
    await forceWaitAt('calendar_appts', id, OLD_US)
    await become(K) // 데스크도 같다
    expect(await outcome(() => db.query(`update public.calendar_appts set ${set} where id = $1`, [id]))).toBe('ok 1')
    expect(recent(await waitAtOf('calendar_appts', id))).toBe(true)
  })

  it.each(others)('AC-8502.11: %s만 고치면 g_wait_at은 첫 값 그대로다', async (_label, set) => {
    const id = await seedAppt(HA, { g_wait: 'edit' })
    await forceWaitAt('calendar_appts', id, OLD_US)
    await become(A)
    expect(await outcome(() => db.query(`update public.calendar_appts set ${set} where id = $1`, [id]))).toBe('ok 1')
    expect(Date.parse(String(await waitAtOf('calendar_appts', id)))).toBe(Date.parse(OLD_US))
    expect(await waitAtOf('calendar_appts', id)).toMatch(/\.123456/)
  })

  it('AC-8502.11: 사용자 고침 → auto만 → g_note만 고침 사이 g_wait_at은 첫 값 그대로이고, g_wait가 바뀌면 새로, 비우면 null이다', async () => {
    const id = await seedAppt(HA)
    await become(A)
    await db.query(`update public.calendar_appts set name = '고친환자', g_wait = 'edit' where id = $1`, [id])
    const firstAt = await waitAtOf('calendar_appts', id)
    expect(recent(firstAt)).toBe(true)
    await become(A)
    await db.query(`update public.calendar_appts set auto = 'came' where id = $1`, [id])
    expect(await waitAtOf('calendar_appts', id)).toBe(firstAt)
    await become(A)
    await db.query(`update public.calendar_appts set g_note = '덮인 쪽 한 줄' where id = $1`, [id])
    expect(await waitAtOf('calendar_appts', id)).toBe(firstAt)
    await forceWaitAt('calendar_appts', id, OLD_US)
    await become(A)
    await db.query(`update public.calendar_appts set g_wait = 'move' where id = $1`, [id])
    expect(recent(await waitAtOf('calendar_appts', id))).toBe(true)
    await become(A)
    await db.query(`update public.calendar_appts set g_wait = null where id = $1`, [id])
    expect(await waitAtOf('calendar_appts', id)).toBeNull()
    // g_wait가 없으면 사용자 칸을 고쳐도 null
    await become(A)
    await db.query(`update public.calendar_appts set name = '또고침' where id = $1`, [id])
    expect(await waitAtOf('calendar_appts', id)).toBeNull()
  })

  it('AC-8502.11: g_wait_at은 DB가 준 시각 글자 그대로(마이크로초까지) 견줘야 1줄이고, JS Date로 바꿨다 되돌린 글자(밀리초)로는 0줄이다', async () => {
    const id = await seedAppt(HA, { g_wait: 'new' })
    await forceWaitAt('calendar_appts', id, OLD_US)
    await become(A)
    await db.query(`update public.calendar_appts set g_note = '맞춤 표시' where id = $1`, [id])
    await become(A)
    const [read] = await rows(`select to_jsonb(g_wait_at) #>> '{}' as at from public.calendar_appts where id = $1`, [id])
    const text = String(read.at)
    expect(text).toMatch(/\.123456/)
    const viaDate = new Date(text).toISOString()
    expect(viaDate).toMatch(/\.123Z$/)
    await become(A)
    expect(await outcome(() => db.query(`update public.calendar_appts set g_wait = null where id = $1 and g_wait_at = $2`, [id, viaDate]))).toBe('ok 0')
    await become(A)
    expect(await outcome(() => db.query(`update public.calendar_appts set g_wait = null where id = $1 and g_wait_at = $2`, [id, text]))).toBe('ok 1')
    expect(await waitAtOf('calendar_appts', id)).toBeNull()
    // 종일 메모도 같다
    const memo = await seedAllDay(HA, { day: DAY, type: 'memo', memo: '학회', g_event_id: EV(9), g_wait: true })
    await forceWaitAt('calendar_allday', memo, OLD_US)
    await become(K)
    const [m] = await rows(`select to_jsonb(g_wait_at) #>> '{}' as at from public.calendar_allday where id = $1`, [memo])
    await become(K)
    expect(await outcome(() => db.query(`update public.calendar_allday set g_wait = false where id = $1 and g_wait_at = $2`, [memo, new Date(String(m.at)).toISOString()]))).toBe(
      'ok 0',
    )
    await become(K)
    expect(await outcome(() => db.query(`update public.calendar_allday set g_wait = false where id = $1 and g_wait_at = $2`, [memo, m.at]))).toBe('ok 1')
    expect(await waitAtOf('calendar_allday', memo)).toBeNull()
  })

  it('AC-8502.11: 종일 메모 — g_wait를 켜거나 날짜·메모를 고치면 지금 시각, g_updated·g_event_id만 고치면 그대로, g_wait를 끄면 null', async () => {
    await become(A)
    const [plain] = (await send('calendar_allday', { day: DAY, type: 'memo', memo: '학회' }, 'id')).rows
    const id = String(plain.id)
    expect(await waitAtOf('calendar_allday', id)).toBeNull()
    await become(A)
    await db.query(`update public.calendar_allday set g_wait = true where id = $1`, [id])
    expect(recent(await waitAtOf('calendar_allday', id))).toBe(true)
    for (const set of [`memo = '휴진'`, `day = '${DAY2}'`]) {
      await forceWaitAt('calendar_allday', id, OLD_US)
      await become(A)
      await db.query(`update public.calendar_allday set ${set} where id = $1`, [id])
      expect(recent(await waitAtOf('calendar_allday', id)), set).toBe(true)
    }
    for (const set of [`g_updated = now()`, `g_event_id = '${EV(8)}'`]) {
      await forceWaitAt('calendar_allday', id, OLD_US)
      await become(A)
      await db.query(`update public.calendar_allday set ${set} where id = $1`, [id])
      expect(await waitAtOf('calendar_allday', id), set).toMatch(/\.123456/)
    }
    await become(A)
    await db.query(`update public.calendar_allday set g_wait = false where id = $1`, [id])
    expect(await waitAtOf('calendar_allday', id)).toBeNull()
    await become(A)
    const [withWait] = (await send('calendar_allday', { day: DAY, type: 'memo', memo: '새 메모', g_wait: true }, 'id')).rows
    expect(recent(await waitAtOf('calendar_allday', String(withWait.id)))).toBe(true)
  })
})

describe('AC-8502.12 처음 자리 5분', SLOW, () => {
  it('AC-8502.12: 시작 1435·345 예약을 옮기면 orig_start에 1435·345가 적힌다', async () => {
    for (const start of [1435, 345]) {
      await become(A)
      const [row] = (await send('calendar_appts', { ...APPT, start_min: start }, 'id')).rows
      await become(A)
      await db.query(`update public.calendar_appts set start_min = 600 where id = $1`, [row.id])
      await operator()
      expect(await rows(`select orig_day::text as orig_day, orig_start from public.calendar_appts where id = $1`, [row.id]), String(start)).toEqual([
        { orig_day: DAY, orig_start: start },
      ])
    }
    const orig = first.constraints.find((c) => bare(c.tbl) === 'calendar_appts' && c.conname === 'calendar_appts_orig_start_check')
    expect(squash(orig?.def)).toMatch(/1435/)
    expect(squash(orig?.def)).toMatch(/% 5\)? = 0/)
  })
})

describe('AC-8502.13 종일 메모 고치기 · off 줄 잠금', SLOW, () => {
  it('AC-8502.13: 원장·데스크가 구글과 이은 종일 메모의 memo·day를 고치면 같은 줄이 바뀌고 지움 줄이 생기지 않으며 g_event_id는 그대로다', async () => {
    for (const [user, n] of [
      [A, 1],
      [K, 2],
    ] as const) {
      await become(user)
      const [memo] = (await send('calendar_allday', { day: DAY, type: 'memo', memo: '학회', g_event_id: EV(n) }, 'id')).rows
      await become(user)
      expect(await outcome(() => db.query(`update public.calendar_allday set memo = '휴진', day = $2 where id = $1`, [memo.id, DAY2]))).toBe('ok 1')
      await operator()
      expect(await rows(`select id, day::text as day, memo, g_event_id from public.calendar_allday where id = $1`, [memo.id])).toEqual([
        { id: memo.id, day: DAY2, memo: '휴진', g_event_id: EV(n) },
      ])
    }
    expect(await deletesNow()).toEqual([])
  })

  it('AC-8502.13: off 줄의 memo·day 고치기는 P0001, type·staff_id·staff_name·part·leave_id 고치기는 권한 없음(42501)이다', async () => {
    await become(A)
    const [off] = (await send('calendar_allday', { day: DAY, type: 'off', staff_id: 'st-ga', staff_name: '가' }, 'id')).rows
    for (const user of [A, K]) {
      for (const set of [`day = '${DAY2}'`, `memo = '메모'`]) {
        await become(user)
        expect(await outcome(() => db.query(`update public.calendar_allday set ${set} where id = $1`, [off.id])), `${user} ${set}`).toBe('error P0001')
      }
      for (const set of [`type = 'memo'`, `staff_id = 'st-na'`, `staff_name = '나'`, `part = 'am'`, `leave_id = null`]) {
        await become(user)
        expect(await outcome(() => db.query(`update public.calendar_allday set ${set} where id = $1`, [off.id])), `${user} ${set}`).toBe('error 42501')
      }
    }
    // off 줄의 g 칸(맞춤 표시)은 고칠 수 있다
    await become(A)
    expect(await outcome(() => db.query(`update public.calendar_allday set g_updated = now() where id = $1`, [off.id]))).toBe('ok 1')
    await operator()
    expect(await rows(`select day::text as day, memo, staff_id from public.calendar_allday where id = $1`, [off.id])).toEqual([{ day: DAY, memo: null, staff_id: 'st-ga' }])
  })

  it('AC-8502.13: 보는 관리자·다른 병원은 종일 메모를 고치지 못한다(0줄)', async () => {
    const memoA = await seedAllDay(HA, { day: DAY, type: 'memo', memo: '학회', g_event_id: EV(1) })
    const memoB = await seedAllDay(HB, { day: DAY, type: 'memo', memo: 'B 학회', g_event_id: EV(2) })
    for (const [user, headers, id] of [
      [A, VIEWING, memoB],
      [A, VIEWING, memoA],
      [B, null, memoA],
    ] as const) {
      await become(user, headers)
      expect(await outcome(() => db.query(`update public.calendar_allday set memo = '고침' where id = $1`, [id])), `${user} ${id}`).toBe('ok 0')
    }
    await operator()
    expect((await rows(`select memo from public.calendar_allday order by memo`)).map((r) => r.memo)).toEqual(['B 학회', '학회'])
  })
})

describe('AC-8502.14 수납 시트 설정에 코드 주소·메일 열쇠 없음', SLOW, () => {
  it('AC-8502.14: conf에 scriptUrl·url·shareWith 열쇠가 있으면 거부되고, 그 밖 설정(원본·폴더 주소 포함)은 된다', async () => {
    const cases: [unknown, string][] = [
      [{ templateUrl: 'https://docs.google.com/spreadsheets/d/fake/edit', folderUrl: 'https://drive.google.com/drive/folders/fake', firstRow: 17, cols: { key: 'B' } }, 'ok 1'],
      [{}, 'ok 1'],
      [{ scriptUrl: SCRIPT_URL }, 'error 23514'],
      [{ url: SCRIPT_URL }, 'error 23514'],
      [{ shareWith: ['staff@fake.test'] }, 'error 23514'],
      [{ firstRow: 17, url: null }, 'error 23514'],
      [[], 'error 23514'],
      [{ pad: 'x'.repeat(16_000) }, 'error 23514'],
    ]
    for (const [conf, expected] of cases) {
      await operator()
      await db.query(`delete from public.gsheet_settings`)
      await become(A)
      expect(await outcome(() => send('gsheet_settings', { conf })), JSON.stringify(conf).slice(0, 60)).toBe(expected)
    }
    // 고치기로 넣어도 같다
    await become(A)
    await send('gsheet_settings', { conf: {} })
    await become(A)
    await expect(db.query(`update public.gsheet_settings set conf = '{"shareWith": []}'`)).rejects.toMatchObject(CHECK_FAILED)
  })
})

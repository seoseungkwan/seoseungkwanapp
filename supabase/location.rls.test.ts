import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SCORE_RULE } from '@/lib/location/score'

// 입지 분석 표 여섯·칸 권한·점수 설정 검사 함수·사진 30줄 트리거·사진 바구니 location-photos
// (location REQ-7902·REQ-7919 AC-7919.5, design.md 7·8절, TASK-1).
// contacts.rls.test.ts·inventory.rls.test.ts와 같은 방법: 진짜 Postgres(PGlite, WASM)에서 운영자가 SQL Editor에 붙일 migration 파일을
// 차례로(auth → … → 데스크 → 병원 정보 → 주소록 → 재고 → 이 파일) 그대로 돌린다. 실제 Supabase에는 붙지 않는다.
// Supabase가 미리 갖춘 것(역할·auth·storage)만 흉내 낸다. 병원·후보·매물·의원·메일은 모두 지어낸 것이다.
// 권한은 '승인된 병원의 원장 + admins 줄'(관리자)만이다. 관리자 줄이 있어도 승인 안 된 병원·병원 없음·데스크는 아무것도 못 한다
const fileOf = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))
const read = (rel: string) => readFileSync(fileOf(rel), 'utf-8')
// 앞 migration: contacts.rls.test.ts 사슬(auth → … → 데스크) + 병원 정보(로고 바구니) + 주소록(매물의 중개사가 가리킴) + 재고(사진 바구니)
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
].map((name) => read(`./migrations/${name}`))
const LOCATION_PATH = fileOf('./migrations/20261122000000_location.sql')
// 파일이 아직 없으면 빈 글자로 돌아, 시험마다 '표가 없다'로 실패한다(무엇이 빠졌는지 시험별로 보인다)
const LOCATION_MIGRATION = existsSync(LOCATION_PATH) ? readFileSync(LOCATION_PATH, 'utf-8') : ''
// 주석을 뺀 SQL 글자, 그리고 함수 몸통($$ … $$)과 글자 값('…')까지 뺀 글자(맨 위 문장만 본다)
const LOCATION_SQL = LOCATION_MIGRATION.split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n')
const LOCATION_TOP = LOCATION_SQL.replace(/\$\$[\s\S]*?\$\$/g, "''")

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

// Supabase Storage가 갖춘 것(이 파일은 버킷 줄과 정책만 더한다). foldername은 Supabase 정의와 같은 뜻
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

const A = '00000000-0000-4000-8000-00000000000a' // 승인된 병원 A 원장 + 관리자
const B = '00000000-0000-4000-8000-00000000000b' // 승인된 다른 병원 B 원장 + 관리자
const N = '00000000-0000-4000-8000-0000000000a2' // 승인된 병원 원장, 관리자 아님
const C = '00000000-0000-4000-8000-00000000000c' // 승인 대기 병원 원장(관리자 줄 있음)
const R = '00000000-0000-4000-8000-0000000000f1' // 거절된 병원 원장(관리자 줄 있음)
const E = '00000000-0000-4000-8000-00000000000e' // 병원 줄도 데스크 줄도 없음(관리자 줄 있음)
const K = '00000000-0000-4000-8000-0000000000d1' // A의 데스크(병원 줄 없음, 관리자 줄 있음 — 그래도 못 본다)
const STATUS: Record<string, 'approved' | 'pending' | 'rejected' | null> = {
  [A]: 'approved',
  [B]: 'approved',
  [N]: 'approved',
  [C]: 'pending',
  [R]: 'rejected',
  [E]: null,
  [K]: null,
}
const ADMINS = [A, B, C, R, E, K]
const DESK_EMAIL: Record<string, string> = { [K]: 'desk-a@fake.test' }
const emailOf = (user: string) => DESK_EMAIL[user] ?? `${user.slice(-2)}@fake.test`
// 로그인했지만 이 파일의 표·사진에서 아무것도 못 하는 사용자
const OUTSIDERS: [string, string][] = [
  ['관리자 아닌 원장', N],
  ['승인 대기(관리자 줄 있음)', C],
  ['거절(관리자 줄 있음)', R],
  ['병원 없음(관리자 줄 있음)', E],
  ['A의 데스크(관리자 줄 있음)', K],
]

type Row = Record<string, unknown>

const TABLES = [
  'location_settings',
  'location_candidates',
  'location_listings',
  'location_notes',
  'location_photos',
  'location_events',
] as const
type Table = (typeof TABLES)[number]
const FUNCTIONS = ['location_photo_limit()', 'location_score_rule_ok(jsonb)', 'location_touch()']
const BUCKET = 'location-photos'
const OTHER_BUCKET = 'other-bucket'
const OTHER_ID = '00000000-0000-4000-8000-000000000999'
const OLD = '2001-01-01T00:00:00.000Z' // 운영자가 심는 옛 시각(DB가 바꿨는지 보려고)
const DAY = '2026-11-22'

// 점수 설정 처음 값은 lib/location/score.ts의 DEFAULT_SCORE_RULE 한 곳이다(design.md 8절 표). 시험에서 칸을 바꿔 보려고 얼리지 않은 복사본을 쓴다
type Rule = {
  v: number
  weights: { people: number; rivals: number; transit: number; site: number; cost: number }
  bands: number[]
  items: Record<string, { w: number; full?: number; best?: number; worst?: number }>
}
const DEFAULT_RULE: Rule = structuredClone(DEFAULT_SCORE_RULE)

// 칸 [이름, 타입, 비울 수 있음, 기본값] (design.md 7절). 기본값 null = 없음
const ID: unknown[] = ['id', 'uuid', 'NO', 'gen_random_uuid()']
const HOSPITAL: unknown[] = ['hospital_id', 'uuid', 'NO', expect.stringMatching(/^(public\.)?my_hospital_id\(\)$/)]
const CREATED: unknown[] = ['created_at', 'timestamptz', 'NO', 'now()']
const UPDATED: unknown[] = ['updated_at', 'timestamptz', 'NO', 'now()']
const EMPTY = "''::text"
const text = (name: string): unknown[] => [name, 'text', 'NO', EMPTY]
const nullable = (name: string, type: string): unknown[] => [name, type, 'YES', null]
const required = (name: string, type: string): unknown[] => [name, type, 'NO', null]
const COLUMNS: Record<Table, unknown[][]> = {
  location_settings: [
    ['hospital_id', 'uuid', 'NO', expect.stringMatching(/^(public\.)?my_hospital_id\(\)$/)],
    ['score_rule', 'jsonb', 'NO', 'RULE_DEFAULT'], // 아래 시험이 처음 값 글자로 바꿔 견준다
    nullable('home_eswt', 'int8'),
    UPDATED,
  ],
  location_candidates: [
    ID,
    HOSPITAL,
    required('name', 'text'),
    text('address_note'),
    required('lat', 'float8'),
    required('lng', 'float8'),
    ['radius_m', 'int4', 'NO', '1000'],
    ['status', 'text', 'NO', "'watching'::text"],
    text('floor_label'),
    nullable('area_m2', 'numeric'),
    nullable('sign_visible', 'text'),
    nullable('violation', 'text'),
    ['costs', 'jsonb', 'NO', "'{}'::jsonb"],
    ['terms', 'jsonb', 'NO', "'{}'::jsonb"],
    ['checks', 'jsonb', 'NO', "'{}'::jsonb"],
    nullable('open_on', 'date'),
    ['tasks_done', 'jsonb', 'NO', "'[]'::jsonb"],
    nullable('snapshot', 'jsonb'),
    nullable('snapshot_at', 'timestamptz'),
    nullable('watch_checked_on', 'date'),
    CREATED,
    UPDATED,
  ],
  location_listings: [
    ID,
    HOSPITAL,
    nullable('candidate_id', 'uuid'),
    required('title', 'text'),
    text('url'),
    nullable('area_m2', 'numeric'),
    text('floor_label'),
    nullable('deposit', 'int8'),
    nullable('rent', 'int8'),
    nullable('premium', 'int8'),
    nullable('mgmt', 'int8'),
    nullable('broker_id', 'uuid'),
    text('broker_note'),
    text('memo'),
    nullable('lat', 'float8'),
    nullable('lng', 'float8'),
    CREATED,
    UPDATED,
  ],
  location_notes: [ID, HOSPITAL, required('candidate_id', 'uuid'), required('day', 'date'), required('body', 'text'), CREATED],
  location_photos: [
    ID,
    HOSPITAL,
    required('candidate_id', 'uuid'),
    required('path', 'text'),
    text('label'),
    ['taken_on', 'date', 'NO', expect.stringContaining("'Asia/Seoul'")],
    CREATED,
  ],
  location_events: [
    ID,
    HOSPITAL,
    required('candidate_id', 'uuid'),
    required('kind', 'text'),
    required('clinic_name', 'text'),
    text('dept'),
    required('event_on', 'date'),
    required('dist_m', 'int4'),
    nullable('seen_at', 'timestamptz'),
    CREATED,
  ],
}

// authenticated 칸 권한(넣기·고치기). 읽기는 표 전체. id·hospital_id·created_at·updated_at은 없다
const CANDIDATE_VALUES = [
  'name',
  'address_note',
  'lat',
  'lng',
  'radius_m',
  'status',
  'floor_label',
  'area_m2',
  'sign_visible',
  'violation',
  'costs',
  'terms',
  'checks',
  'open_on',
  'tasks_done',
  'snapshot',
  'snapshot_at',
  'watch_checked_on',
]
const LISTING_VALUES = [
  'candidate_id',
  'title',
  'url',
  'area_m2',
  'floor_label',
  'deposit',
  'rent',
  'premium',
  'mgmt',
  'broker_id',
  'broker_note',
  'memo',
  'lat',
  'lng',
]
const WRITES: Record<Table, { insert: string[]; update: string[] }> = {
  location_settings: { insert: ['score_rule', 'home_eswt'], update: ['score_rule', 'home_eswt'] },
  location_candidates: { insert: CANDIDATE_VALUES, update: CANDIDATE_VALUES },
  location_listings: { insert: LISTING_VALUES, update: LISTING_VALUES },
  location_notes: { insert: ['candidate_id', 'day', 'body'], update: [] },
  location_photos: { insert: ['candidate_id', 'path', 'label', 'taken_on'], update: [] },
  location_events: { insert: ['candidate_id', 'kind', 'clinic_name', 'dept', 'event_on', 'dist_m'], update: ['seen_at'] },
}
// 표 단위 권한(authenticated). 넣기·고치기는 칸 단위라 여기 없다. 설정은 지우기 없음
const TABLE_GRANTS: Record<Table, string[]> = {
  location_settings: ['SELECT'],
  location_candidates: ['DELETE', 'SELECT'],
  location_listings: ['DELETE', 'SELECT'],
  location_notes: ['DELETE', 'SELECT'],
  location_photos: ['DELETE', 'SELECT'],
  location_events: ['DELETE', 'SELECT'],
}

const SLOW = { timeout: 60_000 }
const DENIED = { code: '42501' } // 권한 없음(칸·표) 또는 RLS
const CHECK = { code: '23514' }
const NOT_NULL = { code: '23502' }
const UNIQUE = { code: '23505' }
const FOREIGN = { code: '23503' }
// 병원 없는 사람의 넣기: RLS(42501) 또는 hospital_id 비움(23502) 가운데 먼저 걸리는 것
const NO_HOSPITAL = { code: expect.stringMatching(/^(42501|23502)$/) }
// 표 정책 하나의 글자(빈칸을 하나로 줄여 견줌): 내 병원(원장 전용 my_hospital_id()) + admins에 내 줄
const POLICY_TEXT =
  /^\(\(hospital_id = \( SELECT (public\.)?my_hospital_id\(\) AS my_hospital_id\)\) AND \(EXISTS \( SELECT 1 FROM (public\.)?admins a WHERE \(a\.user_id = \( SELECT auth\.uid\(\) AS uid\)\)\)\)\)$/
const squash = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ')

let db: PGlite
let hospital: Record<string, string> = {}
type Shape = Awaited<ReturnType<typeof shapeOf>>
let before: Shape // 이 파일을 돌리기 전
let after: Shape // 돌린 뒤

async function operator() {
  await db.exec('reset role; reset request.jwt.claims')
}

/** 그 사용자로 로그인한 것처럼(JWT의 sub·email) */
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

async function affected(sql: string, params: unknown[] = []) {
  return (await db.query(sql, params)).affectedRows
}

/** 사용자·병원·관리자·데스크 줄을 넣는다(운영자). 병원·입지 줄은 auth.users를 따라 함께 비워진다 */
async function resetData() {
  await operator()
  await db.exec('truncate auth.users cascade')
  await db.exec('truncate storage.objects')
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

/** 지금 역할로 그 칸만 넣는 insert 문(칸이 없으면 기본값만). jsonb 칸은 JSON 글자로 보내고, null은 SQL null이다 */
function insertInto(table: string, values: Row, suffix = 'returning *') {
  const columns = Object.keys(values)
  if (columns.length === 0) return rows(`insert into ${table} default values ${suffix}`)
  return rows(
    `insert into ${table} (${columns.join(', ')}) values (${columns.map((_, i) => `$${i + 1}`).join(', ')}) ${suffix}`,
    columns.map((column) => toParam(column, values[column])),
  )
}
const JSONB_COLUMNS = new Set(['score_rule', 'costs', 'terms', 'checks', 'tasks_done', 'snapshot'])
const toParam = (column: string, value: unknown) =>
  value === null || value === undefined ? null : JSONB_COLUMNS.has(column) || typeof value === 'object' ? JSON.stringify(value) : value
/** 지금 역할로 점수 설정 줄 넣기(JSON null·글자도 jsonb 값으로 보낸다) */
const insertRule = (rule: unknown) => rows(`insert into public.location_settings (score_rule) values ($1::jsonb)`, [JSON.stringify(rule)])

/** 운영자가 줄 하나를 넣고 넣은 줄을 돌려준다(칸 권한·RLS를 건너뛴다) */
async function seedRow(table: Table | 'contacts_companies', owner: string, values: Row) {
  await operator()
  const [added] = await insertInto(`public.${table}`, { hospital_id: hospital[owner], ...values })
  return added
}

const CANDIDATE: Row = { name: '예시빌딩 3층', lat: 37.5, lng: 127.0 }
const photoPath = (owner: string, candidate: string, id: string = randomUUID()) => `${hospital[owner]}/${candidate}/${id}.jpg`

async function seedCandidate(owner: string, values: Row = {}) {
  return (await seedRow('location_candidates', owner, { ...CANDIDATE, ...values })).id as string
}
/** 고친 시각(트리거가 바꿈)만 뺀 줄 */
const withoutTouched = (row: Row): Row => Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'updated_at'))
let companies = 0 // 업체 이름은 병원 안에서 하나라 부를 때마다 번호를 붙인다
async function seedCompany(owner: string) {
  companies += 1
  return (await seedRow('contacts_companies', owner, { category: 'other', name: `예시공인중개사${companies}`, work: '부동산 중개' })).id as string
}

/** 여섯 표에 한 줄씩(운영자). 설정은 병원마다 한 줄이라 두 번째 부르기에서는 그대로 둔다 */
async function seedAll(owner: string) {
  const company = await seedCompany(owner)
  await operator()
  await db.query(`insert into public.location_settings (hospital_id, home_eswt) values ($1, 50000) on conflict (hospital_id) do nothing`, [hospital[owner]])
  const candidate = await seedCandidate(owner)
  const listing = (await seedRow('location_listings', owner, { candidate_id: candidate, title: '예시 매물', broker_id: company, rent: 3000000 }))
    .id as string
  const note = (await seedRow('location_notes', owner, { candidate_id: candidate, day: DAY, body: '중개사에게 전화함' })).id as string
  const photo = (await seedRow('location_photos', owner, { candidate_id: candidate, path: photoPath(owner, candidate) })).id as string
  const event = (
    await seedRow('location_events', owner, { candidate_id: candidate, kind: 'open', clinic_name: '예시정형외과의원', event_on: DAY, dist_m: 300 })
  ).id as string
  return { company, candidate, listing, note, photo, event }
}

/** 운영자 눈으로 본 여섯 표 전체와 사진 파일(바뀌지 않았는지 견줄 때) */
async function dump() {
  await operator()
  const out: Record<string, string[]> = {}
  for (const table of TABLES) out[table] = (await rows(`select to_jsonb(t)::text as line from public.${table} t order by 1`)).map((r) => String(r.line))
  out.objects = (await rows(`select bucket_id || '/' || name as line from storage.objects order by 1`)).map((r) => String(r.line))
  return out
}

/** 운영자 눈으로 본 그 표의 병원별 줄 수 */
async function countOf(table: Table, owner: string) {
  await operator()
  return (await rows(`select count(*)::int as n from public.${table} where hospital_id = $1`, [hospital[owner]]))[0].n as number
}

/** jsonb 글자(::text)의 바이트 수 */
async function textBytes(value: unknown) {
  await operator()
  return (await rows(`select octet_length($1::jsonb::text) as n`, [JSON.stringify(value)]))[0].n as number
}
/** jsonb 글자(::text)가 꼭 bytes바이트인 객체({"a": "xx…"}) 또는 배열(["xx…"]) */
const sized = (kind: 'object' | 'array', bytes: number) => (kind === 'object' ? { a: 'x'.repeat(bytes - 9) } : ['x'.repeat(bytes - 4)])

const ruleWith = (change: (rule: Rule) => void) => {
  const rule = structuredClone(DEFAULT_RULE)
  change(rule)
  return rule
}
/** 모양은 맞고 jsonb 글자가 꼭 bytes바이트인 점수 설정(세부 항목 하나를 이름 길이로 채운다) */
async function ruleOfBytes(bytes: number) {
  const probe = ruleWith((rule) => (rule.items['x-'] = { w: 0, full: 1 }))
  const pad = bytes - (await textBytes(probe))
  return ruleWith((rule) => (rule.items[`x-${'a'.repeat(pad)}`] = { w: 0, full: 1 }))
}
async function ruleOk(value: unknown) {
  await operator()
  return (await rows(`select public.location_score_rule_ok($1::jsonb) as ok`, [JSON.stringify(value)]))[0].ok
}

// 이 파일이 손댈 수 있는 것 전부: public 표의 칸·제약·권한(표·칸)·트리거·색인, 모든 정책, public 함수, 버킷
async function shapeOf(target: PGlite) {
  await target.exec('reset role; reset request.jwt.claims')
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
              p.provolatile as volatile, (select array_agg(item::text order by item::text) from unnest(p.proacl) item) as acl
       from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' order by 1`,
    ),
    buckets: await q(`select id, name, public, file_size_limit, allowed_mime_types from storage.buckets order by 1`),
  }
}

const isOurs = (name: unknown) => (TABLES as readonly string[]).includes(String(name).replace(/^public\./, ''))
const isOurStoragePolicy = (policy: Row) =>
  policy.schemaname === 'storage' && `${policy.qual ?? ''} ${policy.with_check ?? ''}`.includes(`'${BUCKET}'`)

/** 이 파일이 더한 것(표 여섯·함수 셋·사진 바구니와 그 정책)을 뺀 모양 */
function withoutLocation(shape: Shape): Shape {
  return {
    columns: shape.columns.filter((c) => !isOurs(c.table_name)),
    constraints: shape.constraints.filter((c) => !isOurs(c.tbl)),
    access: shape.access.filter((t) => !isOurs(t.relname)),
    indexes: shape.indexes.filter((i) => !isOurs(i.tablename)),
    policies: shape.policies.filter((p) => !(p.schemaname === 'public' && isOurs(p.tablename)) && !isOurStoragePolicy(p)),
    triggers: shape.triggers.filter((t) => !isOurs(t.tbl)),
    functions: shape.functions.filter((f) => !FUNCTIONS.includes(String(f.fn))),
    buckets: shape.buckets.filter((b) => b.id !== BUCKET),
  }
}

beforeAll(async () => {
  db = await PGlite.create()
  await db.exec(SUPABASE_MOCK)
  await db.exec(STORAGE_MOCK)
  for (const sql of CHAIN) await db.exec(sql)
  before = await shapeOf(db)
  await db.exec(LOCATION_MIGRATION)
  after = await shapeOf(db)
}, 240_000)

afterAll(async () => {
  await db.close()
})

// 시험마다 빈 표에서 시작한다. 운영자(superuser)는 RLS를 건너뛴다
beforeEach(resetData)

describe('AC-7902.1 파일', SLOW, () => {
  it('AC-7902.1: 파일이 있고 줄 끝이 LF이며, 머리 주석에 붙여 넣는 방법·먼저 들어갈 파일(주소록 포함)·두 번 붙여도 된다는 말·사이트보다 먼저·바구니 Private 확인·ADR-042~044가 있다', () => {
    expect(LOCATION_MIGRATION).not.toBe('')
    expect(LOCATION_MIGRATION).not.toContain('\r')
    const lines = LOCATION_MIGRATION.split('\n')
    const head = lines.slice(0, lines.findIndex((line) => !/^(--|\s*$)/.test(line))).join('\n')
    for (const word of [
      '운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다',
      '20261028000000_auth.sql',
      '20261030000000_precheck_settings.sql',
      '20261121000000_contacts.sql',
      '두 번 붙여 넣어도 그대로다',
      '이 파일을 먼저 붙여 넣고 그다음 사이트에 올린다',
      'location-photos',
      'Private',
      'ADR-042~044',
      '카카오',
    ]) {
      expect(head, word).toContain(word)
    }
  })

  it('AC-7902.1: score_rule 처음 값 글자는 DEFAULT_SCORE_RULE의 JSON과 같다(빈칸·줄바꿈만 다름 — 열쇠 차례·숫자 모양까지)', () => {
    const found = /score_rule jsonb not null default '([^']*)'::jsonb/.exec(LOCATION_MIGRATION)
    expect(found).not.toBeNull()
    expect(found?.[1].replace(/\s+/g, '')).toBe(JSON.stringify(DEFAULT_SCORE_RULE))
    // 의료급여·차상위 비율도 처음 값(무게 0·많을수록 5%)으로 들어 있다
    expect(found?.[1]).toContain('"p-welfare": {"w": 0, "full": 5}')
  })

  it('AC-7902.1: 두 번 돌려도 되는 문장만 쓴다(표·색인은 if not exists, 함수·트리거는 or replace, 정책은 지우고 다시 만들기, 지우기 없음)', () => {
    const count = (pattern: RegExp) => (LOCATION_TOP.match(pattern) ?? []).length
    for (const table of TABLES) expect(count(new RegExp(`create\\s+table\\s+if\\s+not\\s+exists\\s+public\\.${table}\\b`, 'gi')), table).toBe(1)
    expect(LOCATION_TOP).not.toMatch(/create\s+table\s+(?!if\s+not\s+exists)/i)
    expect(LOCATION_TOP).not.toMatch(/create\s+(unique\s+)?index\s+(?!if\s+not\s+exists)/i)
    expect(LOCATION_TOP).not.toMatch(/create\s+function/i)
    expect(LOCATION_TOP).not.toMatch(/create\s+(constraint\s+)?trigger/i)
    expect(count(/create\s+or\s+replace\s+function/gi)).toBe(FUNCTIONS.length)
    expect(count(/create\s+or\s+replace\s+trigger/gi)).toBe(4)
    expect(LOCATION_TOP).not.toMatch(/^\s*(drop\s+(?!policy\s+if\s+exists)|truncate|delete)\b/im)
    expect(count(/create\s+policy/gi)).toBe(TABLES.length + 3)
    expect(count(/drop\s+policy\s+if\s+exists/gi)).toBe(TABLES.length + 3)
    for (const [, target] of LOCATION_TOP.matchAll(/^\s*alter table\s+(\S+)/gim)) expect(TABLES.map((t) => `public.${t}`)).toContain(target)
    // my_hospital_id()·touch_updated_at()은 앞 migration 것이고 여기서 만들지 않는다. 데스크 정책·정의자 함수 없음
    expect(LOCATION_SQL).not.toMatch(/function\s+public\.(my_hospital_id|touch_updated_at)\b/i)
    expect(LOCATION_SQL).not.toMatch(/my_desk_hospital_id|my_clinic_hospital_id/)
    expect(LOCATION_SQL).not.toMatch(/security\s+definer/i)
  })

  it.each(TABLES)('AC-7902.1: %s 표 권한은 revoke all 뒤에만 준다', (table) => {
    const revoke = LOCATION_TOP.search(new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated;`))
    expect(revoke).toBeGreaterThanOrEqual(0)
    const grants = [...LOCATION_TOP.matchAll(new RegExp(`^grant [^;]+ on table public\\.${table} to [^;]+;`, 'gm'))]
    expect(grants.length).toBeGreaterThan(0)
    for (const grant of grants) expect(grant.index).toBeGreaterThan(revoke)
  })
})

describe('AC-7902.1 표 여섯의 칸·열쇠·권한·정책', SLOW, () => {
  it.each(TABLES)('AC-7902.1: %s 칸·타입·비울 수 있음·기본값이 design.md 7절 모양이다(hospital_id 기본값은 my_hospital_id())', async (table) => {
    const found = (
      await rows(
        `select column_name, udt_name, is_nullable, column_default from information_schema.columns
         where table_schema = 'public' and table_name = $1 order by ordinal_position`,
        [table],
      )
    ).map((c) => [c.column_name, c.udt_name, c.is_nullable, c.column_default])
    const ruleDefault = `'${(await rows(`select $1::jsonb::text as t`, [JSON.stringify(DEFAULT_RULE)]))[0].t}'::jsonb`
    expect(found).toEqual(COLUMNS[table].map((column) => (column[3] === 'RULE_DEFAULT' ? [...column.slice(0, 3), ruleDefault] : column)))
  })

  it('AC-7902.1: 넓이 칸은 numeric(8,2)다', async () => {
    expect(
      await rows(
        `select table_name, numeric_precision, numeric_scale from information_schema.columns
         where table_schema = 'public' and column_name = 'area_m2' and table_name like 'location%' order by 1`,
      ),
    ).toEqual([
      { table_name: 'location_candidates', numeric_precision: 8, numeric_scale: 2 },
      { table_name: 'location_listings', numeric_precision: 8, numeric_scale: 2 },
    ])
  })

  const HOSPITAL_FK = { contype: 'f', def: expect.stringMatching(/^FOREIGN KEY \(hospital_id\) REFERENCES (public\.)?hospitals\(id\) ON DELETE CASCADE$/) }
  const CANDIDATE_CASCADE = {
    contype: 'f',
    def: expect.stringMatching(/^FOREIGN KEY \(hospital_id, candidate_id\) REFERENCES (public\.)?location_candidates\(hospital_id, id\) ON DELETE CASCADE$/),
  }
  const PK_ID = { contype: 'p', def: 'PRIMARY KEY (id)' }
  it.each<[Table, Row[]]>([
    ['location_settings', [HOSPITAL_FK, { contype: 'p', def: 'PRIMARY KEY (hospital_id)' }]],
    ['location_candidates', [HOSPITAL_FK, PK_ID, { contype: 'u', def: 'UNIQUE (hospital_id, id)' }]],
    [
      'location_listings',
      [
        HOSPITAL_FK,
        PK_ID,
        {
          contype: 'f',
          def: expect.stringMatching(
            /^FOREIGN KEY \(hospital_id, candidate_id\) REFERENCES (public\.)?location_candidates\(hospital_id, id\) ON DELETE SET NULL \(candidate_id\)$/,
          ),
        },
        {
          contype: 'f',
          def: expect.stringMatching(
            /^FOREIGN KEY \(hospital_id, broker_id\) REFERENCES (public\.)?contacts_companies\(hospital_id, id\) ON DELETE SET NULL \(broker_id\)$/,
          ),
        },
      ],
    ],
    ['location_notes', [HOSPITAL_FK, PK_ID, CANDIDATE_CASCADE]],
    ['location_photos', [HOSPITAL_FK, PK_ID, CANDIDATE_CASCADE, { contype: 'u', def: 'UNIQUE (path)' }]],
    ['location_events', [HOSPITAL_FK, PK_ID, CANDIDATE_CASCADE, { contype: 'u', def: 'UNIQUE (candidate_id, kind, clinic_name, event_on)' }]],
  ])('AC-7902.1: %s 기본 키·바깥 키((hospital_id, 부모 id) 둘로)·하나뿐 제약이 design.md 7절 그대로다', async (table, expected) => {
    const found = await rows(
      `select contype, pg_get_constraintdef(oid) as def from pg_constraint where conrelid = to_regclass($1) and contype in ('p', 'f', 'u')`,
      [`public.${table}`],
    )
    expect(found).toHaveLength(expected.length)
    expect(found).toEqual(expect.arrayContaining(expected))
  })

  it.each<[Table, string[]]>([
    ['location_settings', ['unique (hospital_id)']],
    ['location_candidates', ['unique (id)', 'unique (hospital_id, id)']],
    ['location_listings', ['unique (id)', '(candidate_id)', '(broker_id)']],
    ['location_notes', ['unique (id)', '(candidate_id)']],
    ['location_photos', ['unique (id)', 'unique (path)', '(candidate_id)']],
    ['location_events', ['unique (id)', 'unique (candidate_id, kind, clinic_name, event_on)']],
  ])('AC-7902.1: %s 색인은 %j뿐이다', async (table, expected) => {
    const found = (await rows(`select indexdef from pg_indexes where schemaname = 'public' and tablename = $1`, [table])).map((r) =>
      String(r.indexdef).replace(/^CREATE (UNIQUE )?INDEX \S+ ON \S+ USING btree /, (_, unique?: string) => (unique ? 'unique ' : '')),
    )
    expect(found.sort()).toEqual([...expected].sort())
  })

  it.each(TABLES)('AC-7902.1: %s는 RLS가 켜져 있다', async (table) => {
    expect(await rows(`select relrowsecurity as on from pg_class where oid = to_regclass($1)`, [`public.${table}`])).toEqual([{ on: true }])
  })

  it.each(TABLES)('AC-7902.1: anon에게 %s의 표·칸 권한이 하나도 없다(기본 권한을 먼저 거뒀다)', async (table) => {
    await rows(`select $1::regclass`, [`public.${table}`]) // 표가 없으면 여기서 실패한다(빈 목록과 헷갈리지 않게)
    for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']) {
      expect([privilege, (await rows(`select has_any_column_privilege('anon', $1, $2) as ok`, [`public.${table}`, privilege]))[0].ok]).toEqual([
        privilege,
        false,
      ])
    }
    for (const privilege of ['DELETE', 'TRUNCATE', 'TRIGGER']) {
      expect([privilege, (await rows(`select has_table_privilege('anon', $1, $2) as ok`, [`public.${table}`, privilege]))[0].ok]).toEqual([
        privilege,
        false,
      ])
    }
  })

  it.each(TABLES)('AC-7902.1: authenticated의 %s 표 전체 권한은 design.md 7절 것뿐이다(넣기·고치기는 칸 단위, 바깥 키 걸기·비우기·트리거 없음)', async (table) => {
    await rows(`select $1::regclass`, [`public.${table}`])
    const granted = await rows(
      `select grantee, privilege_type from information_schema.role_table_grants
       where table_schema = 'public' and table_name = $1 and grantee in ('anon', 'authenticated', 'PUBLIC')
       order by grantee, privilege_type`,
      [table],
    )
    expect(granted).toEqual(TABLE_GRANTS[table].map((privilege_type) => ({ grantee: 'authenticated', privilege_type })))
    expect((await rows(`select has_any_column_privilege('authenticated', $1, 'REFERENCES') as ok`, [`public.${table}`]))[0].ok).toBe(false)
  })

  it.each(TABLES.flatMap((table) => (['INSERT', 'UPDATE'] as const).map((privilege): [Table, string] => [table, privilege])))(
    'AC-7902.1: authenticated의 %s %s 칸 권한은 값 칸뿐이다(id·hospital_id·created_at·updated_at 없음)',
    async (table, privilege) => {
      await rows(`select $1::regclass`, [`public.${table}`])
      const list = await rows(
        `select column_name from information_schema.columns
         where table_schema = 'public' and table_name = $1 and has_column_privilege('authenticated', $2, column_name, $3)
         order by ordinal_position`,
        [table, `public.${table}`, privilege],
      )
      expect(list.map((row) => row.column_name)).toEqual(privilege === 'INSERT' ? WRITES[table].insert : WRITES[table].update)
    },
  )

  it.each(TABLES)('AC-7902.1: %s 정책은 하나(for all, authenticated, 내 병원 + admins 줄)이고 데스크 정책이 없다', async (table) => {
    const list = await rows(
      `select cmd, permissive, roles::text as roles, qual, with_check from pg_policies where schemaname = 'public' and tablename = $1`,
      [table],
    )
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ cmd: 'ALL', permissive: 'PERMISSIVE', roles: '{authenticated}' })
    expect(squash(list[0].qual)).toMatch(POLICY_TEXT)
    expect(list[0].with_check).toBe(list[0].qual)
    expect(String(list[0].qual)).not.toMatch(/my_desk_hospital_id|my_clinic_hospital_id/)
  })

  it('AC-7902.1: 트리거는 고친 시각 셋(설정·후보·매물, 고치기 전)과 사진 30줄(넣기 전) 넷뿐이다', async () => {
    const found = await rows(
      `select tgrelid::regclass::text as tbl, tgname, pg_get_triggerdef(oid) as def from pg_trigger
       where not tgisinternal and tgrelid::regclass::text like '%location_%' order by 2`,
    )
    const fn = (name: string) => `EXECUTE FUNCTION (public\\.)?${name}\\(\\)$`
    expect(found.map((t) => t.tgname)).toEqual(['location_candidates_touch', 'location_listings_touch', 'location_photo_limit', 'location_settings_touch'])
    const def = Object.fromEntries(found.map((t) => [t.tgname, String(t.def)]))
    for (const table of ['location_settings', 'location_candidates', 'location_listings']) {
      expect(def[`${table}_touch`]).toMatch(new RegExp(` BEFORE UPDATE ON (public\\.)?${table} FOR EACH ROW ${fn('location_touch')}`))
    }
    expect(def.location_photo_limit).toMatch(new RegExp(` BEFORE INSERT ON (public\\.)?location_photos FOR EACH ROW ${fn('location_photo_limit')}`))
  })

  it('AC-7902.1: 함수 셋은 부른 사람 권한(security invoker)·search_path 빔이고, 점수 검사만 authenticated가 부르며(표 검사가 부름) 트리거 함수는 아무도 못 부른다', async () => {
    const found = await rows(
      `select p.oid::regprocedure::text as fn, t.typname as returns, l.lanname as lang, p.prosecdef as definer, p.provolatile as volatile,
              p.proconfig as config
       from pg_proc p join pg_type t on t.oid = p.prorettype join pg_language l on l.oid = p.prolang
       where p.pronamespace = 'public'::regnamespace and p.proname like 'location%' order by 1`,
    )
    expect(found).toEqual([
      { fn: 'location_photo_limit()', returns: 'trigger', lang: 'plpgsql', definer: false, volatile: 'v', config: ['search_path=""'] },
      { fn: 'location_score_rule_ok(jsonb)', returns: 'bool', lang: 'plpgsql', definer: false, volatile: 'i', config: ['search_path=""'] },
      { fn: 'location_touch()', returns: 'trigger', lang: 'plpgsql', definer: false, volatile: 'v', config: ['search_path=""'] },
    ])
    const can = async (role: string, fn: string) => (await rows(`select has_function_privilege($1, $2, 'EXECUTE') as ok`, [role, `public.${fn}`]))[0].ok
    expect(await can('authenticated', 'location_score_rule_ok(jsonb)')).toBe(true)
    expect(await can('anon', 'location_score_rule_ok(jsonb)')).toBe(false)
    for (const fn of ['location_touch()', 'location_photo_limit()']) {
      expect([fn, await can('authenticated', fn), await can('anon', fn)]).toEqual([fn, false, false])
    }
    const acl = await rows(`select proname, coalesce(array_to_string(proacl, ','), '') as acl from pg_proc where proname like 'location%' order by 1`)
    expect(acl).toHaveLength(3)
    for (const { proname, acl: list } of acl) expect(String(list), String(proname)).not.toMatch(/(^|,)=/) // PUBLIC 몫 없음
  })

  it('AC-7902.1: 병원 줄을 지우면 여섯 표의 그 병원 줄도 지워지고 다른 병원 줄은 그대로다', async () => {
    await seedAll(A)
    await seedAll(B)
    await operator()
    await db.query('delete from public.hospitals where id = $1', [hospital[A]])
    for (const table of TABLES) expect([table, await countOf(table, A), await countOf(table, B)]).toEqual([table, 0, 1])
  })
})

describe('AC-7902.1 다른 것은 그대로', SLOW, () => {
  it('AC-7902.1: 표 여섯·함수 셋·사진 바구니와 그 정책 셋만 더하고, my_hospital_id()·다른 표·함수·정책·Storage 정책·버킷은 그대로다', () => {
    expect(before.columns.some((c) => isOurs(c.table_name))).toBe(false)
    expect(withoutLocation(after)).toEqual(before)
    expect(after.access.filter((t) => isOurs(t.relname)).map((t) => t.relname)).toEqual([...TABLES].sort())
    expect(after.functions.filter((f) => FUNCTIONS.includes(String(f.fn))).map((f) => f.fn)).toEqual(FUNCTIONS)
    const storagePolicies = (shape: Shape) => shape.policies.filter((p) => p.schemaname === 'storage').length
    expect(storagePolicies(after)).toBe(storagePolicies(before) + 3)
    expect(after.buckets.map((b) => b.id)).toEqual([...before.buckets.map((b) => b.id), BUCKET].sort())
    const mine = (shape: Shape) => shape.functions.filter((f) => f.fn === 'my_hospital_id()')
    expect(mine(before)).toHaveLength(1)
    expect(mine(after)).toEqual(mine(before))
    // 앞 migration이 만든 Storage 정책(병원 로고·재고 사진)이 비교에 들어 있다(빈 비교가 아니다)
    expect(storagePolicies(before)).toBeGreaterThan(0)
  })
})

describe('AC-7902.2 관리자는 자기 병원 줄만', SLOW, () => {
  it('AC-7902.2: 관리자가 여섯 표에 값 칸만 넣으면 id·hospital_id(내 병원)·시각·적지 않은 칸은 DB가 정한다', async () => {
    const company = await seedCompany(A)
    await become(A)
    const [settings] = await insertInto('public.location_settings', { home_eswt: 50000 })
    expect(settings).toMatchObject({ hospital_id: hospital[A], score_rule: DEFAULT_RULE, home_eswt: 50000 })
    const [candidate] = await insertInto('public.location_candidates', CANDIDATE)
    expect(candidate).toMatchObject({
      id: expect.any(String),
      hospital_id: hospital[A],
      ...CANDIDATE,
      address_note: '',
      radius_m: 1000,
      status: 'watching',
      floor_label: '',
      area_m2: null,
      sign_visible: null,
      violation: null,
      costs: {},
      terms: {},
      checks: {},
      open_on: null,
      tasks_done: [],
      snapshot: null,
      snapshot_at: null,
      watch_checked_on: null,
    })
    const id = candidate.id as string
    const [listing] = await insertInto('public.location_listings', { candidate_id: id, title: '예시 매물', broker_id: company })
    expect(listing).toMatchObject({ hospital_id: hospital[A], candidate_id: id, broker_id: company, url: '', floor_label: '', broker_note: '', memo: '', lat: null })
    const [note] = await insertInto('public.location_notes', { candidate_id: id, day: DAY, body: '보러 감' })
    expect(note).toMatchObject({ hospital_id: hospital[A], candidate_id: id, body: '보러 감' })
    const path = photoPath(A, id)
    const [photo] = await insertInto('public.location_photos', { candidate_id: id, path })
    expect(photo).toMatchObject({ hospital_id: hospital[A], path, label: '' })
    const [seoulToday] = await rows(`select ((now() at time zone 'Asia/Seoul')::date)::text as day`)
    expect((await rows(`select taken_on::text as day from public.location_photos`))[0]).toEqual(seoulToday)
    const [event] = await insertInto('public.location_events', { candidate_id: id, kind: 'close', clinic_name: '예시의원', event_on: DAY, dist_m: 0 })
    expect(event).toMatchObject({ hospital_id: hospital[A], dept: '', seen_at: null })
    for (const row of [candidate, listing, note, photo, event]) {
      expect(row.id).toMatch(/^[0-9a-f-]{36}$/)
      expect(new Date(String(row.created_at)).getTime()).toBeGreaterThan(new Date(OLD).getTime())
    }
  })

  it('AC-7902.2: 관리자는 여섯 표를 읽고 값 칸을 고치고(설정은 겹치면 고치는 upsert) 지울 수 있다(설정은 지우기 없음)', async () => {
    const mine = await seedAll(A)
    await become(A)
    for (const table of TABLES) expect([table, (await rows(`select hospital_id from public.${table}`)).map((r) => r.hospital_id)]).toEqual([table, [hospital[A]]])
    const rule = ruleWith((r) => (r.weights.people = 50))
    const upsert = `insert into public.location_settings (score_rule) values ($1::jsonb)
                    on conflict (hospital_id) do update set score_rule = excluded.score_rule`
    expect(await affected(upsert, [JSON.stringify(rule)])).toBe(1)
    expect(await affected(`update public.location_settings set home_eswt = 70000`)).toBe(1)
    expect(await rows(`select score_rule, home_eswt from public.location_settings`)).toEqual([{ score_rule: rule, home_eswt: 70000 }])
    const snapshot = { v: 1, at: '2026-11-22T09:00:00+09:00', radiusM: 1000 }
    expect(
      await affected(
        `update public.location_candidates set name = '예시빌딩 2층', status = 'visited', radius_m = 500, snapshot = $1::jsonb, snapshot_at = now(),
           costs = '{"rent": 3000000}', tasks_done = '["contract"]', violation = 'no', area_m2 = 99.83, open_on = '2027-05-01' where id = $2`,
        [JSON.stringify(snapshot), mine.candidate],
      ),
    ).toBe(1)
    expect(await rows(`select name, status, radius_m, snapshot, area_m2::text as area from public.location_candidates`)).toEqual([
      { name: '예시빌딩 2층', status: 'visited', radius_m: 500, snapshot, area: '99.83' },
    ])
    expect(await affected(`update public.location_listings set candidate_id = null, broker_id = null, rent = 2500000 where id = $1`, [mine.listing])).toBe(1)
    expect(await affected(`update public.location_events set seen_at = now() where id = $1`, [mine.event])).toBe(1)
    for (const table of ['location_events', 'location_photos', 'location_notes', 'location_listings', 'location_candidates'] as const) {
      expect([table, await affected(`delete from public.${table}`)]).toEqual([table, 1])
    }
    await expect(db.query(`delete from public.location_settings`)).rejects.toMatchObject(DENIED)
  })

  it('AC-7902.2: 설정·후보·매물을 고치면 updated_at은 DB가 지금으로 바꾼다', async () => {
    const mine = await seedAll(A)
    await operator()
    for (const table of ['location_settings', 'location_candidates', 'location_listings']) await db.query(`update public.${table} set updated_at = $1`, [OLD])
    await become(A)
    await db.query(`update public.location_settings set home_eswt = 1`)
    await db.query(`update public.location_candidates set address_note = '예시로 1' where id = $1`, [mine.candidate])
    await db.query(`update public.location_listings set memo = '1층 약국' where id = $1`, [mine.listing])
    await operator()
    for (const table of ['location_settings', 'location_candidates', 'location_listings']) {
      const [{ fresh }] = await rows(`select bool_and(updated_at > $1::timestamptz) as fresh from public.${table}`, [OLD])
      expect([table, fresh]).toEqual([table, true])
    }
  })

  it.each(
    TABLES.flatMap((table): [Table, string][] =>
      (table === 'location_settings' ? ['hospital_id', 'updated_at'] : ['id', 'hospital_id', 'created_at']).map((column): [Table, string] => [table, column]),
    ),
  )('AC-7902.2: 관리자가 %s 줄을 넣을 때 %s 칸은 보낼 수 없다(권한 없음)', async (table, column) => {
    const candidate = await seedCandidate(A)
    const base: Record<Table, Row> = {
      location_settings: {},
      location_candidates: CANDIDATE,
      location_listings: { title: '새 매물' },
      location_notes: { candidate_id: candidate, day: DAY, body: '새 메모' },
      location_photos: { candidate_id: candidate, path: photoPath(A, candidate) },
      location_events: { candidate_id: candidate, kind: 'open', clinic_name: '새의원', event_on: DAY, dist_m: 10 },
    }
    const value: Record<string, unknown> = { id: OTHER_ID, hospital_id: hospital[A], created_at: OLD, updated_at: OLD }
    const old = await dump()
    await become(A)
    await expect(insertInto(`public.${table}`, { ...base[table], [column]: value[column] })).rejects.toMatchObject(DENIED)
    expect(await dump()).toEqual(old)
  })

  it.each<[Table, string]>([
    ...TABLES.flatMap((table): [Table, string][] =>
      (table === 'location_settings' ? ['hospital_id', 'updated_at'] : ['id', 'hospital_id', 'created_at']).map((column): [Table, string] => [table, column]),
    ),
    ['location_candidates', 'updated_at'],
    ['location_listings', 'updated_at'],
    ['location_notes', 'candidate_id'],
    ['location_notes', 'body'],
    ['location_photos', 'path'],
    ['location_photos', 'candidate_id'],
    ['location_events', 'kind'],
    ['location_events', 'clinic_name'],
    ['location_events', 'candidate_id'],
  ])('AC-7902.2: 관리자는 %s의 %s 칸을 고칠 수 없다(권한 없음)', async (table, column) => {
    const mine = await seedAll(A)
    const second = await seedCandidate(A, { name: '두 번째 후보' })
    const value: Record<string, unknown> = {
      id: OTHER_ID,
      hospital_id: hospital[B],
      created_at: OLD,
      updated_at: OLD,
      candidate_id: second,
      body: '바꿈',
      path: photoPath(A, second),
      kind: 'close',
      clinic_name: '바꾼의원',
    }
    const old = await dump()
    await become(A)
    await expect(db.query(`update public.${table} set ${column} = $1`, [value[column]])).rejects.toMatchObject(DENIED)
    expect(await dump()).toEqual(old)
    expect(mine.candidate).not.toBe(second)
  })

  it('AC-7902.2: 관리자에게는 내 병원 줄만 보이고, 남의 줄은 고치거나 지워도 0줄이다', async () => {
    const mine = await seedAll(A)
    const other = await seedAll(B)
    const old = await dump()
    await become(A)
    expect((await rows(`select id from public.location_candidates`)).map((r) => r.id)).toEqual([mine.candidate])
    expect((await rows(`select id from public.location_listings`)).map((r) => r.id)).toEqual([mine.listing])
    for (const table of TABLES) expect([table, (await rows(`select hospital_id from public.${table}`)).map((r) => r.hospital_id)]).toEqual([table, [hospital[A]]])
    expect(await affected(`update public.location_candidates set name = '바꿈' where id = $1`, [other.candidate])).toBe(0)
    expect(await affected(`update public.location_listings set memo = '바꿈' where id = $1`, [other.listing])).toBe(0)
    expect(await affected(`update public.location_events set seen_at = now() where id = $1`, [other.event])).toBe(0)
    for (const [table, id] of [
      ['location_events', other.event],
      ['location_photos', other.photo],
      ['location_notes', other.note],
      ['location_listings', other.listing],
      ['location_candidates', other.candidate],
    ]) {
      expect([table, await affected(`delete from public.${table} where id = $1`, [id])]).toEqual([table, 0])
    }
    expect(await dump()).toEqual(old)
  })

  it('AC-7902.2: 관리자 A가 B의 후보·주소록 업체를 가리키는 줄은 거부된다(바깥 키가 병원까지 본다)', async () => {
    const other = await seedAll(B)
    await seedCandidate(A)
    const old = await dump()
    const tries: [string, Row][] = [
      ['public.location_listings', { title: '새 매물', candidate_id: other.candidate }],
      ['public.location_listings', { title: '새 매물', broker_id: other.company }],
      ['public.location_listings', { title: '새 매물', candidate_id: OTHER_ID }],
      ['public.location_notes', { candidate_id: other.candidate, day: DAY, body: '메모' }],
      ['public.location_photos', { candidate_id: other.candidate, path: `${hospital[A]}/${other.candidate}/${randomUUID()}.jpg` }],
      ['public.location_events', { candidate_id: other.candidate, kind: 'open', clinic_name: '예시의원', event_on: DAY, dist_m: 1 }],
    ]
    for (const [table, values] of tries) {
      await become(A)
      await expect(insertInto(table, values), `${table} ${JSON.stringify(values)}`).rejects.toMatchObject(FOREIGN)
    }
    expect(await dump()).toEqual(old)
  })

  it('AC-7902.2: 다른 병원 관리자 B는 A의 여섯 표를 0줄로 보고 고치기·지우기는 0줄이다', async () => {
    await seedAll(A)
    const old = await dump()
    await become(B)
    for (const table of TABLES) expect([table, await rows(`select * from public.${table}`)]).toEqual([table, []])
    expect(await affected(`update public.location_settings set home_eswt = 1`)).toBe(0)
    expect(await affected(`update public.location_candidates set name = '바꿈'`)).toBe(0)
    expect(await affected(`update public.location_listings set memo = '바꿈'`)).toBe(0)
    expect(await affected(`update public.location_events set seen_at = now()`)).toBe(0)
    for (const table of TABLES.filter((t) => t !== 'location_settings')) expect([table, await affected(`delete from public.${table}`)]).toEqual([table, 0])
    expect(await dump()).toEqual(old)
  })

  it('AC-7902.2: A의 admins 줄을 빼면 A도 자기 병원 줄을 0줄로 보고 넣기는 거부된다', async () => {
    await seedAll(A)
    await operator()
    await db.query('delete from public.admins where user_id = $1', [A])
    const old = await dump()
    await become(A)
    for (const table of TABLES) expect([table, await rows(`select * from public.${table}`)]).toEqual([table, []])
    await expect(insertInto('public.location_candidates', CANDIDATE)).rejects.toMatchObject(DENIED)
    await become(A)
    expect(await affected(`update public.location_candidates set name = '바꿈'`)).toBe(0)
    expect(await dump()).toEqual(old)
  })

  it.each(OUTSIDERS)('AC-7902.2: %s 사용자는 여섯 표에서 0줄이고 넣기는 거부되며 고치기·지우기는 0줄이다', async (_label, user) => {
    const mine = await seedAll(A)
    if (hospital[user]) await seedAll(user) // 그 사용자 병원의 줄(운영자가 넣음)도 그 사용자에게 안 보인다
    const old = await dump()
    await become(user)
    for (const table of TABLES) expect([table, await rows(`select * from public.${table}`)]).toEqual([table, []])
    const tries: [string, Row][] = [
      ['public.location_settings', { home_eswt: 1 }],
      ['public.location_candidates', CANDIDATE],
      ['public.location_listings', { title: '새 매물' }],
      ['public.location_notes', { candidate_id: mine.candidate, day: DAY, body: '메모' }],
      ['public.location_photos', { candidate_id: mine.candidate, path: photoPath(A, mine.candidate) }],
      ['public.location_events', { candidate_id: mine.candidate, kind: 'open', clinic_name: '예시의원', event_on: DAY, dist_m: 1 }],
    ]
    for (const [table, values] of tries) {
      await become(user)
      await expect(insertInto(table, values), table).rejects.toMatchObject(NO_HOSPITAL)
    }
    await become(user)
    expect(await affected(`update public.location_settings set home_eswt = 1`)).toBe(0)
    expect(await affected(`update public.location_candidates set name = '바꿈'`)).toBe(0)
    expect(await affected(`update public.location_listings set memo = '바꿈'`)).toBe(0)
    expect(await affected(`update public.location_events set seen_at = now()`)).toBe(0)
    for (const table of TABLES.filter((t) => t !== 'location_settings')) expect([table, await affected(`delete from public.${table}`)]).toEqual([table, 0])
    expect(await dump()).toEqual(old)
  })

  it('AC-7902.2: anon은 여섯 표 모두 읽기·넣기·고치기·지우기가 권한 없음이다', async () => {
    const mine = await seedAll(A)
    const old = await dump()
    for (const table of TABLES) {
      await becomeAnon()
      await expect(db.query(`select * from public.${table}`), table).rejects.toMatchObject(DENIED)
      await expect(db.query(`delete from public.${table}`), table).rejects.toMatchObject(DENIED)
      await expect(db.query(`update public.${table} set hospital_id = hospital_id`), table).rejects.toMatchObject(DENIED)
    }
    await becomeAnon()
    await expect(insertInto('public.location_candidates', CANDIDATE)).rejects.toMatchObject(DENIED)
    await expect(insertInto('public.location_notes', { candidate_id: mine.candidate, day: DAY, body: '메모' })).rejects.toMatchObject(DENIED)
    expect(await dump()).toEqual(old)
  })

  it('AC-7902.2: 같은 알림 줄은 한 번만 들고(겹치면 23505), 겹치면 건너뛰는 넣기(on conflict do nothing)는 넣기 권한만으로 된다', async () => {
    const candidate = await seedCandidate(A)
    const event = { candidate_id: candidate, kind: 'open', clinic_name: '예시정형외과의원', dept: '정형외과', event_on: DAY, dist_m: 420 }
    await become(A)
    await insertInto('public.location_events', event)
    await expect(insertInto('public.location_events', { ...event, dist_m: 1 })).rejects.toMatchObject(UNIQUE)
    await become(A)
    const skip = `insert into public.location_events (candidate_id, kind, clinic_name, dept, event_on, dist_m)
                  select candidate_id, kind, clinic_name, dept, event_on, dist_m from json_populate_recordset(null::public.location_events, $1::json)
                  on conflict (candidate_id, kind, clinic_name, event_on) do nothing`
    expect(await affected(skip, [JSON.stringify([event, { ...event, kind: 'close' }])])).toBe(1)
    expect(await countOf('location_events', A)).toBe(2)
  })
})

describe('AC-7902.3 값 제약', SLOW, () => {
  const word = (n: number, ch = '가') => ch.repeat(n)
  type Make = (candidate: string) => Row
  const candidateCase = (values: Row): Make => () => ({ ...CANDIDATE, ...values })
  const listingCase = (values: Row): Make => () => ({ title: '예시 매물', ...values })
  const noteCase = (values: Row): Make => (candidate) => ({ candidate_id: candidate, day: DAY, body: '메모', ...values })
  const photoCase = (values: Row | ((candidate: string) => Row)): Make => (candidate) => ({
    candidate_id: candidate,
    path: photoPath(A, candidate),
    ...(typeof values === 'function' ? values(candidate) : values),
  })
  const eventCase = (values: Row): Make => (candidate) => ({
    candidate_id: candidate,
    kind: 'open',
    clinic_name: '예시의원',
    event_on: DAY,
    dist_m: 10,
    ...values,
  })
  const settingsCase = (values: Row): Make => () => values
  const without = (make: Make, key: string): Make => (candidate) => {
    const values = make(candidate)
    delete values[key]
    return values
  }
  const MONEY = ['deposit', 'rent', 'premium', 'mgmt']

  it.each<[string, Table, Make, Row]>([
    ['후보 위도 32.99', 'location_candidates', candidateCase({ lat: 32.99 }), CHECK],
    ['후보 위도 39.01', 'location_candidates', candidateCase({ lat: 39.01 }), CHECK],
    ['후보 경도 123.99', 'location_candidates', candidateCase({ lng: 123.99 }), CHECK],
    ['후보 경도 132.01', 'location_candidates', candidateCase({ lng: 132.01 }), CHECK],
    ['후보 위도 NaN', 'location_candidates', candidateCase({ lat: 'NaN' }), CHECK],
    ['후보 위도 없음', 'location_candidates', without(candidateCase({}), 'lat'), NOT_NULL],
    ['후보 경도 없음', 'location_candidates', without(candidateCase({}), 'lng'), NOT_NULL],
    ['범위 299', 'location_candidates', candidateCase({ radius_m: 299 }), CHECK],
    ['범위 3001', 'location_candidates', candidateCase({ radius_m: 3001 }), CHECK],
    ['범위 1200(일곱 값 밖)', 'location_candidates', candidateCase({ radius_m: 1200 }), CHECK],
    ['범위 null', 'location_candidates', candidateCase({ radius_m: null }), NOT_NULL],
    ['상태 여섯째(signed)', 'location_candidates', candidateCase({ status: 'signed' }), CHECK],
    ['상태 null', 'location_candidates', candidateCase({ status: null }), NOT_NULL],
    ['후보 이름 없음', 'location_candidates', without(candidateCase({}), 'name'), NOT_NULL],
    ["후보 이름 ''", 'location_candidates', candidateCase({ name: '' }), CHECK],
    ["후보 이름 ' 가'", 'location_candidates', candidateCase({ name: ' 가' }), CHECK],
    ['후보 이름 41자', 'location_candidates', candidateCase({ name: word(41) }), CHECK],
    ['후보 이름 41자(코드포인트)', 'location_candidates', candidateCase({ name: word(41, '🏥') }), CHECK],
    ['적은 주소 101자', 'location_candidates', candidateCase({ address_note: word(101) }), CHECK],
    ['적은 주소 null', 'location_candidates', candidateCase({ address_note: null }), NOT_NULL],
    ['후보 층 21자', 'location_candidates', candidateCase({ floor_label: word(21) }), CHECK],
    ['후보 넓이 0', 'location_candidates', candidateCase({ area_m2: 0 }), CHECK],
    ['후보 넓이 −1', 'location_candidates', candidateCase({ area_m2: -1 }), CHECK],
    ['간판 보임 maybe', 'location_candidates', candidateCase({ sign_visible: 'maybe' }), CHECK],
    ['위반 건축물 있음(한글)', 'location_candidates', candidateCase({ violation: '있음' }), CHECK],
    ['비용 배열', 'location_candidates', candidateCase({ costs: [] }), CHECK],
    ['비용 2,001바이트', 'location_candidates', candidateCase({ costs: sized('object', 2001) }), CHECK],
    ['비용 null', 'location_candidates', candidateCase({ costs: null }), NOT_NULL],
    ['협상표 6,001바이트', 'location_candidates', candidateCase({ terms: sized('object', 6001) }), CHECK],
    ['협상표 배열', 'location_candidates', candidateCase({ terms: ['x'] }), CHECK],
    ['점검표 4,001바이트', 'location_candidates', candidateCase({ checks: sized('object', 4001) }), CHECK],
    ['점검표 글자', 'location_candidates', candidateCase({ checks: 'yes' }), CHECK],
    ['다 함 표시 객체', 'location_candidates', candidateCase({ tasks_done: {} }), CHECK],
    ['다 함 표시 2,001바이트', 'location_candidates', candidateCase({ tasks_done: sized('array', 2001) }), CHECK],
    ['그날 값 배열', 'location_candidates', candidateCase({ snapshot: [] }), CHECK],
    ['그날 값 65,537바이트', 'location_candidates', candidateCase({ snapshot: sized('object', 65537) }), CHECK],
    ['매물 제목 없음', 'location_listings', without(listingCase({}), 'title'), NOT_NULL],
    ["매물 제목 ''", 'location_listings', listingCase({ title: '' }), CHECK],
    ["매물 제목 '매물 '", 'location_listings', listingCase({ title: '매물 ' }), CHECK],
    ['매물 제목 41자', 'location_listings', listingCase({ title: word(41) }), CHECK],
    ['링크 http://', 'location_listings', listingCase({ url: 'http://land.example.test/1' }), CHECK],
    ['링크 javascript:', 'location_listings', listingCase({ url: 'javascript:alert(1)' }), CHECK],
    ['링크 501자', 'location_listings', listingCase({ url: `https://${word(493, 'a')}` }), CHECK],
    ['링크 null', 'location_listings', listingCase({ url: null }), NOT_NULL],
    ['매물 넓이 0', 'location_listings', listingCase({ area_m2: 0 }), CHECK],
    ['매물 층 21자', 'location_listings', listingCase({ floor_label: word(21) }), CHECK],
    ...MONEY.flatMap((column): [string, Table, Make, Row][] => [
      [`매물 ${column} −1`, 'location_listings', listingCase({ [column]: -1 }), CHECK],
      [`매물 ${column} 10,000,000,000`, 'location_listings', listingCase({ [column]: 10_000_000_000 }), CHECK],
    ]),
    ['중개사 메모 41자', 'location_listings', listingCase({ broker_note: word(41) }), CHECK],
    ['매물 메모 501자', 'location_listings', listingCase({ memo: word(501) }), CHECK],
    ['매물 위도만', 'location_listings', listingCase({ lat: 37.5 }), CHECK],
    ['매물 경도만', 'location_listings', listingCase({ lng: 127 }), CHECK],
    ['매물 위도 범위 밖', 'location_listings', listingCase({ lat: 40, lng: 127 }), CHECK],
    ['메모 날짜 없음', 'location_notes', without(noteCase({}), 'day'), NOT_NULL],
    ['메모 후보 없음', 'location_notes', without(noteCase({}), 'candidate_id'), NOT_NULL],
    ["메모 ''", 'location_notes', noteCase({ body: '' }), CHECK],
    ['메모 빈칸·줄바꿈만', 'location_notes', noteCase({ body: ' \n\t ' }), CHECK],
    ['메모 501자', 'location_notes', noteCase({ body: word(501) }), CHECK],
    ['사진 경로 없음', 'location_photos', without(photoCase({}), 'path'), NOT_NULL],
    ['사진 경로 다른 병원', 'location_photos', photoCase((c) => ({ path: photoPath(B, c) })), CHECK],
    ['사진 경로 다른 후보', 'location_photos', photoCase(() => ({ path: `${hospital[A]}/${OTHER_ID}/${randomUUID()}.jpg` })), CHECK],
    ['사진 경로 png', 'location_photos', photoCase((c) => ({ path: photoPath(A, c).replace(/\.jpg$/, '.png') })), CHECK],
    ['사진 경로 폴더 하나', 'location_photos', photoCase(() => ({ path: `${hospital[A]}/${randomUUID()}.jpg` })), CHECK],
    ['사진 경로 이름이 uuid 아님', 'location_photos', photoCase((c) => ({ path: `${hospital[A]}/${c}/photo.jpg` })), CHECK],
    ['사진 경로 뒤에 더 붙음', 'location_photos', photoCase((c) => ({ path: `${photoPath(A, c)}/x` })), CHECK],
    ['사진 이름 41자', 'location_photos', photoCase({ label: word(41) }), CHECK],
    ['사진 날짜 null', 'location_photos', photoCase({ taken_on: null }), NOT_NULL],
    ['알림 종류 moved', 'location_events', eventCase({ kind: 'moved' }), CHECK],
    ['알림 종류 없음', 'location_events', without(eventCase({}), 'kind'), NOT_NULL],
    ["의원 이름 ''", 'location_events', eventCase({ clinic_name: '' }), CHECK],
    ['의원 이름 101자', 'location_events', eventCase({ clinic_name: word(101) }), CHECK],
    ['과목 51자', 'location_events', eventCase({ dept: word(51) }), CHECK],
    ['알림 날짜 없음', 'location_events', without(eventCase({}), 'event_on'), NOT_NULL],
    ['거리 −1', 'location_events', eventCase({ dist_m: -1 }), CHECK],
    ['거리 3001', 'location_events', eventCase({ dist_m: 3001 }), CHECK],
    ['거리 없음', 'location_events', without(eventCase({}), 'dist_m'), NOT_NULL],
    ['지금 의원 체외충격파 값 −1', 'location_settings', settingsCase({ home_eswt: -1 }), CHECK],
    ['지금 의원 체외충격파 값 10,000,000,000', 'location_settings', settingsCase({ home_eswt: 10_000_000_000 }), CHECK],
    ['점수 설정 null', 'location_settings', settingsCase({ score_rule: null }), NOT_NULL],
    ['점수 설정 무게 101', 'location_settings', settingsCase({ score_rule: ruleWith((r) => (r.weights.people = 101)) }), CHECK],
  ])('AC-7902.3: %s → 거부', async (_name, table, make, error) => {
    const candidate = await seedCandidate(A)
    const old = await dump()
    await become(A)
    await expect(insertInto(`public.${table}`, make(candidate))).rejects.toMatchObject(error)
    expect(await dump()).toEqual(old)
  })

  it('AC-7902.3: jsonb 크기는 jsonb 글자(::text)의 바이트로 잰다(시험이 만드는 값이 꼭 그 크기다)', async () => {
    for (const bytes of [2000, 2001, 4000, 6000, 6001, 65536]) {
      expect([bytes, await textBytes(sized('object', bytes))]).toEqual([bytes, bytes])
      expect([bytes, await textBytes(sized('array', bytes))]).toEqual([bytes, bytes])
    }
    expect(await textBytes(await ruleOfBytes(4001))).toBe(4001)
  })

  it('AC-7902.3: 한도 그대로(글자 수·범위 끝·금액 0과 9,999,999,999·jsonb 크기 그대로·https 링크 500자·사진 날짜)는 넣을 수 있다', async () => {
    const company = await seedCompany(A)
    const bigRule = await ruleOfBytes(4000) // 운영자로 잰다(아래 넣기 전에)
    await become(A)
    const corners: Row[] = [
      { name: word(40), lat: 33, lng: 124, radius_m: 300, status: 'dropped', address_note: word(100), floor_label: word(20), area_m2: 0.01 },
      { name: word(40, '🏥'), lat: 39, lng: 132, radius_m: 3000, status: 'reviewing', sign_visible: 'unknown', violation: 'yes' },
      { name: '가', costs: sized('object', 2000), terms: sized('object', 6000), checks: sized('object', 4000), tasks_done: sized('array', 2000) },
      { name: '나', snapshot: sized('object', 65536), area_m2: 999999.99 },
    ]
    for (const radius of [500, 700, 1000, 1500, 2000]) corners.push({ name: `범위 ${radius}`, radius_m: radius })
    for (const status of ['watching', 'contacted', 'visited']) corners.push({ name: status, status })
    for (const values of corners) await insertInto('public.location_candidates', { ...CANDIDATE, ...values })
    const [{ id: candidate }] = await rows(`select id from public.location_candidates limit 1`)
    for (const values of [
      { title: word(40), url: `https://${word(492, 'a')}`, floor_label: word(20), broker_note: word(40), memo: word(500), lat: 33, lng: 132 },
      { title: '돈 0', deposit: 0, rent: 0, premium: 0, mgmt: 0, url: '' },
      { title: '돈 끝', deposit: 9_999_999_999, rent: 9_999_999_999, premium: 9_999_999_999, mgmt: 9_999_999_999, broker_id: company },
      { title: '후보 있음', candidate_id: candidate, area_m2: 33.06 },
    ]) {
      await insertInto('public.location_listings', values)
    }
    await insertInto('public.location_notes', { candidate_id: candidate, day: DAY, body: word(500) })
    await insertInto('public.location_photos', { candidate_id: candidate, path: photoPath(A, String(candidate)), label: word(40), taken_on: '2026-01-02' })
    await insertInto('public.location_events', { candidate_id: candidate, kind: 'open', clinic_name: word(100), dept: word(50), event_on: DAY, dist_m: 3000 })
    await insertInto('public.location_events', { candidate_id: candidate, kind: 'close', clinic_name: '가', event_on: DAY, dist_m: 0 })
    await insertInto('public.location_settings', { home_eswt: 9_999_999_999, score_rule: bigRule })
    expect(await countOf('location_candidates', A)).toBe(corners.length)
    expect(await countOf('location_listings', A)).toBe(4)
    expect(await countOf('location_events', A)).toBe(2)
    expect(await countOf('location_settings', A)).toBe(1)
  })

  it('AC-7902.3: 병원마다 설정은 한 줄이고(23505), 사진 경로는 하나뿐이다(23505)', async () => {
    const candidate = await seedCandidate(A)
    const path = photoPath(A, candidate)
    await become(A)
    await insertInto('public.location_settings', {})
    await expect(insertInto('public.location_settings', { home_eswt: 1 })).rejects.toMatchObject(UNIQUE)
    await become(A)
    await insertInto('public.location_photos', { candidate_id: candidate, path })
    await expect(insertInto('public.location_photos', { candidate_id: candidate, path })).rejects.toMatchObject(UNIQUE)
  })
})

describe('AC-7902.4 후보·업체를 지우면', SLOW, () => {
  const idsIn = async (table: Table) => {
    await operator()
    return (await rows(`select id from public.${table}`)).map((r) => r.id).sort()
  }

  it('AC-7902.4: 후보를 지우면 그 메모·사진 줄·알림 줄은 함께 지워지고, 매물은 남되 후보 칸만 빈다(병원·다른 칸 그대로)', async () => {
    const x = await seedAll(A)
    const y = await seedAll(A) // 같은 병원 다른 후보(그대로여야 한다)
    const other = await seedAll(B)
    await operator()
    const [listingBefore] = await rows(`select * from public.location_listings where id = $1`, [x.listing])
    await become(A)
    expect(await affected(`delete from public.location_candidates where id = $1`, [x.candidate])).toBe(1)
    expect(await idsIn('location_candidates')).toEqual([y.candidate, other.candidate].sort())
    expect(await idsIn('location_notes')).toEqual([y.note, other.note].sort())
    expect(await idsIn('location_photos')).toEqual([y.photo, other.photo].sort())
    expect(await idsIn('location_events')).toEqual([y.event, other.event].sort())
    expect(await idsIn('location_listings')).toEqual([x.listing, y.listing, other.listing].sort())
    const [listingAfter] = await rows(`select * from public.location_listings where id = $1`, [x.listing])
    // 고친 시각은 트리거가 바꾼다(후보 칸이 비었으므로). 그 밖의 칸은 그대로다
    const restBefore = withoutTouched(listingBefore)
    const restAfter = withoutTouched(listingAfter)
    expect(restAfter).toEqual({ ...restBefore, candidate_id: null })
    expect(restAfter.hospital_id).toBe(hospital[A])
    expect(restAfter.broker_id).toBe(x.company)
  })

  it('AC-7902.4: 주소록 업체를 지우면 매물의 중개사 칸만 빈다(후보·병원·다른 칸 그대로)', async () => {
    const x = await seedAll(A)
    await operator()
    const [listingBefore] = await rows(`select * from public.location_listings where id = $1`, [x.listing])
    await become(A)
    expect(await affected(`delete from public.contacts_companies where id = $1`, [x.company])).toBe(1)
    await operator()
    const [listingAfter] = await rows(`select * from public.location_listings where id = $1`, [x.listing])
    const restBefore = withoutTouched(listingBefore)
    const restAfter = withoutTouched(listingAfter)
    expect(restAfter).toEqual({ ...restBefore, broker_id: null })
    expect(restAfter.candidate_id).toBe(x.candidate)
    expect(await countOf('location_candidates', A)).toBe(1)
  })

  it('AC-7902.4: 사진 줄은 후보마다 30줄까지이고 31번째는 거부(23514)되며, 다른 후보·하나 지운 뒤에는 다시 된다', async () => {
    const full = await seedCandidate(A)
    const second = await seedCandidate(A, { name: '두 번째 후보' })
    await operator()
    for (let i = 0; i < 29; i++) await seedRow('location_photos', A, { candidate_id: full, path: photoPath(A, full) })
    await become(A)
    await insertInto('public.location_photos', { candidate_id: full, path: photoPath(A, full) }) // 30번째
    await expect(insertInto('public.location_photos', { candidate_id: full, path: photoPath(A, full) })).rejects.toMatchObject(CHECK)
    await become(A)
    await insertInto('public.location_photos', { candidate_id: second, path: photoPath(A, second) })
    await db.query(`delete from public.location_photos where id = (select id from public.location_photos where candidate_id = $1 limit 1)`, [full])
    await insertInto('public.location_photos', { candidate_id: full, path: photoPath(A, full) })
    await operator()
    expect(await rows(`select candidate_id, count(*)::int as n from public.location_photos group by 1 order by 2`)).toEqual([
      { candidate_id: second, n: 1 },
      { candidate_id: full, n: 30 },
    ])
  })
})

describe('AC-7919.5 점수 설정 검사 location_score_rule_ok', SLOW, () => {
  it('AC-7919.5: 처음 값(design.md 8절)은 통과하고, 설정 줄을 값 없이 넣으면 그 처음 값이 든다', async () => {
    expect(await ruleOk(DEFAULT_RULE)).toBe(true)
    await become(A)
    await insertInto('public.location_settings', {})
    expect(await rows(`select score_rule from public.location_settings`)).toEqual([{ score_rule: DEFAULT_RULE }])
    // 처음 값의 세부 무게는 항목마다 합 100
    const sums: Record<string, number> = {}
    for (const [id, item] of Object.entries(DEFAULT_RULE.items)) sums[id[0]] = (sums[id[0]] ?? 0) + item.w
    expect(sums).toEqual({ p: 100, c: 100, t: 100, s: 100, k: 100 })
  })

  it.each<[string, () => unknown]>([
    ['무게를 모두 0·100으로', () => ruleWith((r) => (r.weights = { people: 0, rivals: 100, transit: 0, site: 100, cost: 0 }))],
    ['세부 무게 0', () => ruleWith((r) => (r.items['p-density'].w = 0))],
    ['나이대 11칸 모두', () => ruleWith((r) => (r.bands = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]))],
    ['나이대 하나(0)', () => ruleWith((r) => (r.bands = [0]))],
    ['나이대 차례 섞임', () => ruleWith((r) => (r.bands = [10, 4, 6]))],
    ['기준 1', () => ruleWith((r) => (r.items['p-density'].full = 1))],
    ['100점 값 음수', () => ruleWith((r) => (r.items['c-count'] = { w: 30, best: -5, worst: -4 }))],
    ['큰 금액 기준', () => ruleWith((r) => (r.items['k-deposit'] = { w: 15, best: 0, worst: 9_999_999_999 }))],
    ['세부 항목 없음', () => ruleWith((r) => (r.items = {}))],
    ['4,000바이트', () => ruleOfBytes(4000)],
  ])('AC-7919.5: %s → 통과', async (_name, make) => {
    const rule = await make()
    expect(await ruleOk(rule)).toBe(true)
    await become(A)
    await insertRule(rule)
    expect(await countOf('location_settings', A)).toBe(1)
  })

  const BAD: [string, () => unknown][] = [
    ['바깥 무게 101', () => ruleWith((r) => (r.weights.people = 101))],
    ['바깥 무게 −1', () => ruleWith((r) => (r.weights.cost = -1))],
    ['바깥 무게 2.5', () => ruleWith((r) => (r.weights.site = 2.5))],
    ['바깥 무게 글자', () => ruleWith((r) => ((r.weights as Record<string, unknown>).people = '30'))],
    ['바깥 무게 null', () => ruleWith((r) => ((r.weights as Record<string, unknown>).people = null))],
    ['바깥 무게 넷', () => ruleWith((r) => delete (r.weights as Partial<Rule['weights']>).cost)],
    ['바깥 무게 여섯', () => ruleWith((r) => ((r.weights as Record<string, number>).extra = 0))],
    ['바깥 무게 배열', () => ruleWith((r) => ((r as Record<string, unknown>).weights = [30, 25, 20, 15, 10]))],
    ['세부 무게 101', () => ruleWith((r) => (r.items['p-density'].w = 101))],
    ['세부 무게 −1', () => ruleWith((r) => (r.items['t-flow'].w = -1))],
    ['세부 무게 없음', () => ruleWith((r) => (r.items['p-density'] = { full: 10000 } as never))],
    ['기준 0', () => ruleWith((r) => (r.items['p-density'].full = 0))],
    ['기준 −1', () => ruleWith((r) => (r.items['p-senior'].full = -1))],
    ['기준 1.5', () => ruleWith((r) => (r.items['p-trend'].full = 1.5))],
    ['기준 글자', () => ruleWith((r) => ((r.items['p-trend'] as Record<string, unknown>).full = '5'))],
    ['100점 값 = 0점 값', () => ruleWith((r) => (r.items['c-count'] = { w: 30, best: 6, worst: 6 }))],
    ['100점 값 > 0점 값', () => ruleWith((r) => (r.items['t-station'] = { w: 40, best: 1500, worst: 200 }))],
    ['100점 값 소수', () => ruleWith((r) => (r.items['s-floor'] = { w: 25, best: 0.5, worst: 5 }))],
    ['0점 값 없음', () => ruleWith((r) => (r.items['s-age'] = { w: 10, best: 5 }))],
    ['100점 값 없음', () => ruleWith((r) => (r.items['s-age'] = { w: 10, worst: 30 }))],
    ['기준과 100점·0점 값을 함께', () => ruleWith((r) => (r.items['s-age'] = { w: 10, full: 1, best: 5, worst: 30 }))],
    ['세부 항목 열쇠 더함', () => ruleWith((r) => (r.items['s-sign'] = { w: 10, full: 1, note: 1 } as never))],
    ['세부 항목이 숫자', () => ruleWith((r) => ((r.items as Record<string, unknown>)['s-sign'] = 10))],
    ['세부 항목 묶음이 배열', () => ruleWith((r) => ((r as Record<string, unknown>).items = []))],
    ['나이대 0개', () => ruleWith((r) => (r.bands = []))],
    ['나이대 11', () => ruleWith((r) => (r.bands = [4, 11]))],
    ['나이대 −1', () => ruleWith((r) => (r.bands = [-1, 4]))],
    ['나이대 겹침', () => ruleWith((r) => (r.bands = [4, 5, 4]))],
    ['나이대 12개', () => ruleWith((r) => (r.bands = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10]))],
    ['나이대 소수', () => ruleWith((r) => (r.bands = [4.5]))],
    ['나이대 글자', () => ruleWith((r) => ((r as Record<string, unknown>).bands = ['4']))],
    ['나이대 객체', () => ruleWith((r) => ((r as Record<string, unknown>).bands = {}))],
    ['판 번호 2', () => ruleWith((r) => (r.v = 2))],
    ['판 번호 없음', () => ruleWith((r) => delete (r as Partial<Rule>).v)],
    ['세부 항목 묶음 없음', () => ruleWith((r) => delete (r as Partial<Rule>).items)],
    ['맨 위 열쇠 더함', () => ruleWith((r) => ((r as Record<string, unknown>).extra = 1))],
    ['배열', () => [DEFAULT_RULE]],
    ['글자', () => 'rule'],
    ['JSON null', () => null],
    ['4,001바이트', () => ruleOfBytes(4001)],
  ]

  it.each(BAD.filter(([name]) => name !== '4,001바이트'))('AC-7919.5: %s → 검사 함수가 false', async (_name, make) => {
    expect(await ruleOk(await make())).toBe(false)
  })

  it.each(BAD)('AC-7919.5: %s → 설정 줄 넣기·고치기가 거부(23514)된다', async (_name, make) => {
    const rule = await make()
    await become(A)
    await expect(insertRule(rule)).rejects.toMatchObject(CHECK)
    await seedRow('location_settings', A, {})
    await become(A)
    await expect(db.query(`update public.location_settings set score_rule = $1::jsonb`, [JSON.stringify(rule)])).rejects.toMatchObject(CHECK)
    await operator()
    expect(await rows(`select score_rule from public.location_settings`)).toEqual([{ score_rule: DEFAULT_RULE }])
  })

  it('AC-7919.5: 4,001바이트 설정은 모양이 맞아 검사 함수는 통과하지만 표 제약이 거부한다', async () => {
    expect(await ruleOk(await ruleOfBytes(4001))).toBe(true)
  })
})

describe('AC-7902.5 사진 바구니 location-photos', SLOW, () => {
  const objectOf = (owner: string, candidate = OTHER_ID, id = '0f8fad5b-d9cb-469f-a165-70867728950e') => `${hospital[owner]}/${candidate}/${id}.jpg`
  const upload = (name: string, bucket = BUCKET) =>
    rows(`insert into storage.objects (bucket_id, name) values ($1, $2) returning bucket_id, name`, [bucket, name])
  async function seedObject(name: string, bucket = BUCKET) {
    await operator()
    await rows(`insert into storage.objects (bucket_id, name) values ($1, $2)`, [bucket, name])
  }
  async function objects() {
    await operator()
    return rows(`select bucket_id, name from storage.objects order by 1, 2`)
  }

  it('AC-7902.5: 바구니는 공개가 아니고 한 파일 3,000,000바이트·image/jpeg만이다', async () => {
    expect(await rows(`select id, name, public, file_size_limit, allowed_mime_types from storage.buckets where id = $1`, [BUCKET])).toEqual([
      { id: BUCKET, name: BUCKET, public: false, file_size_limit: 3_000_000, allowed_mime_types: ['image/jpeg'] },
    ])
  })

  it('AC-7902.5: 이 바구니 정책은 읽기·올리기·지우기 셋(고치기 없음)이고 authenticated·첫 폴더 = my_hospital_id()·admins 줄로 거른다', async () => {
    const list = (
      await rows(`select schemaname, cmd, permissive, roles::text as roles, qual, with_check from pg_policies where schemaname = 'storage' order by cmd`)
    ).filter((policy) => isOurStoragePolicy(policy))
    expect(list.map((p) => p.cmd)).toEqual(['DELETE', 'INSERT', 'SELECT'])
    for (const policy of list) {
      expect(policy).toMatchObject({ permissive: 'PERMISSIVE', roles: '{authenticated}' })
      const rule = squash(policy.cmd === 'INSERT' ? policy.with_check : policy.qual)
      expect(rule).toContain(`bucket_id = '${BUCKET}'::text`)
      expect(rule).toContain('(storage.foldername(name))[1]')
      expect(rule).toContain('my_hospital_id()')
      expect(rule).toMatch(/EXISTS \( SELECT 1 FROM (public\.)?admins a WHERE \(a\.user_id = \( SELECT auth\.uid\(\) AS uid\)\)\)/)
      expect(rule).not.toMatch(/my_desk|my_clinic/)
    }
  })

  it('AC-7902.5: 관리자 A는 내 병원 폴더에 사진을 올리고 읽고 지운다', async () => {
    await become(A)
    expect(await upload(objectOf(A))).toEqual([{ bucket_id: BUCKET, name: objectOf(A) }])
    expect(await rows(`select name from storage.objects`)).toEqual([{ name: objectOf(A) }])
    expect(await rows(`delete from storage.objects where name = $1 returning name`, [objectOf(A)])).toEqual([{ name: objectOf(A) }])
    expect(await objects()).toEqual([])
  })

  it('AC-7902.5: A는 다른 병원 폴더·폴더 없는 이름·다른 바구니에는 올리지 못한다', async () => {
    for (const [name, bucket] of [
      [objectOf(B), BUCKET],
      ['0f8fad5b-d9cb-469f-a165-70867728950e.jpg', BUCKET],
      [`${OTHER_ID}/${OTHER_ID}/x.jpg`, BUCKET],
      [objectOf(A), OTHER_BUCKET],
    ]) {
      await become(A)
      await expect(upload(name, bucket), `${bucket}/${name}`).rejects.toThrow(/row-level security/)
    }
    expect(await objects()).toEqual([])
  })

  it('AC-7902.5: A에게 B 병원 사진·다른 바구니 파일은 안 보이고 안 지워지며, 고치기(이름·자리 바꾸기)는 내 사진도 0줄이다', async () => {
    await seedObject(objectOf(A))
    await seedObject(objectOf(B))
    await seedObject(objectOf(A, OTHER_ID, OTHER_ID), OTHER_BUCKET)
    const old = await objects()
    await become(A)
    expect(await rows(`select bucket_id, name from storage.objects`)).toEqual([{ bucket_id: BUCKET, name: objectOf(A) }])
    expect(await rows(`update storage.objects set name = $1 returning name`, [objectOf(A, OTHER_ID, OTHER_ID)])).toEqual([])
    expect(await rows(`update storage.objects set metadata = '{}'::jsonb returning name`)).toEqual([])
    expect(await rows(`delete from storage.objects where bucket_id <> $1 or name <> $2 returning name`, [BUCKET, objectOf(A)])).toEqual([])
    expect(await objects()).toEqual(old)
  })

  it('AC-7902.5: A의 admins 줄을 빼면 A도 내 병원 사진을 못 보고 못 올린다', async () => {
    await seedObject(objectOf(A))
    await operator()
    await db.query('delete from public.admins where user_id = $1', [A])
    await become(A)
    expect(await rows(`select name from storage.objects where bucket_id = $1`, [BUCKET])).toEqual([])
    await expect(upload(objectOf(A, OTHER_ID, OTHER_ID))).rejects.toThrow(/row-level security/)
  })

  it.each(OUTSIDERS)('AC-7902.5: %s 사용자는 사진을 못 보고 못 올리고 못 지운다', async (_label, user) => {
    await seedObject(objectOf(A))
    if (hospital[user]) await seedObject(objectOf(user))
    const old = await objects()
    await become(user)
    expect(await rows(`select name from storage.objects where bucket_id = $1`, [BUCKET])).toEqual([])
    const own = hospital[user] ? objectOf(user, OTHER_ID, OTHER_ID) : `${OTHER_ID}/${OTHER_ID}/${OTHER_ID}.jpg`
    for (const name of [own, objectOf(A, OTHER_ID, OTHER_ID)]) {
      await become(user)
      await expect(upload(name), name).rejects.toThrow(/row-level security/)
    }
    await become(user)
    expect(await rows(`delete from storage.objects where bucket_id = $1 returning name`, [BUCKET])).toEqual([])
    expect(await objects()).toEqual(old)
  })

  it('AC-7902.5: anon은 사진을 못 보고 못 올리고 못 고치고 못 지운다', async () => {
    await seedObject(objectOf(A))
    const old = await objects()
    await becomeAnon()
    expect(await rows(`select name from storage.objects`)).toEqual([])
    await expect(upload(objectOf(A, OTHER_ID, OTHER_ID))).rejects.toThrow(/row-level security/)
    await becomeAnon()
    expect(await rows(`update storage.objects set metadata = '{}'::jsonb returning name`)).toEqual([])
    expect(await rows(`delete from storage.objects returning name`)).toEqual([])
    expect(await objects()).toEqual(old)
  })
})

describe('AC-7902.1 두 번 붙여 넣기', SLOW, () => {
  it('AC-7902.1: 다시 붙여도 오류가 없고, 모양·권한·정책·함수·버킷 설정은 이 파일 값이며 넣어 둔 줄·사진은 그대로다', async () => {
    const mine = await seedAll(A)
    await seedAll(B)
    await operator()
    await db.query(`update public.location_settings set score_rule = $1::jsonb where hospital_id = $2`, [
      JSON.stringify(ruleWith((r) => (r.weights.cost = 0))),
      hospital[A],
    ])
    await rows(`insert into storage.objects (bucket_id, name) values ($1, $2)`, [BUCKET, `${hospital[A]}/${mine.candidate}/${randomUUID()}.jpg`])
    // 누가 관리 화면에서 바구니를 공개로 바꿔 두었어도 다시 붙이면 이 파일 값으로 돌아온다
    await rows(`update storage.buckets set public = true, file_size_limit = 1, allowed_mime_types = null where id = $1`, [BUCKET])
    const data = await dump()

    await db.exec(LOCATION_MIGRATION)

    expect(await shapeOf(db)).toEqual(after)
    expect(await dump()).toEqual(data)
    for (const table of TABLES) expect([table, data[table]]).toEqual([table, expect.any(Array)])
    expect(data.location_candidates).toHaveLength(2)
    expect(data.objects).toHaveLength(1)
    // 다시 붙인 뒤에도 권한·트리거가 그대로 돈다
    await become(A)
    await insertInto('public.location_notes', { candidate_id: mine.candidate, day: DAY, body: '다시 붙인 뒤' })
    expect(await countOf('location_notes', A)).toBe(2)
  }, 120_000)
})

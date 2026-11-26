import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { addDays } from '@/lib/analytics/dates'

// 의사랑 엑셀 올리기 DB: 표 uis_periods(처방 하루·한 주·한 달 · 나이대 하루)·통계 출처 'uisarang'(stats_days·stats_coverage)·
// 관리자 비교 읽기 함수 admin_uis_rows (uisarang-upload REQ-8801, design.md 7절, ADR-056).
// googleLink.rls.test.ts·adminView.rls.test.ts와 같은 방법: 진짜 Postgres(PGlite, WASM)에서 운영자가 SQL Editor에 붙일 migration 파일을
// **지금 모든 migration**(파일 이름 차례) → 이 파일 → 이 파일 그대로 돌린다. 실제 Supabase에는 붙지 않는다.
// Supabase가 미리 갖춘 것(역할·auth·storage)만 흉내 내고, 요청 머리(PostgREST의 request.headers)는 set_config로 흉내 낸다.
// 병원·사람·메일·처방 코드·숫자는 모두 지어낸 것이다(환자 자료는 없다)
const fileOf = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))
const read = (rel: string) => readFileSync(fileOf(rel), 'utf-8')
const FILE_NAME = '20261127000000_uisarang_upload.sql'
// 지금 모든 migration(이 파일보다 앞 이름), 파일 이름 차례
const CHAIN_NAMES = readdirSync(fileOf('./migrations/'))
  .filter((name) => name.endsWith('.sql') && name < FILE_NAME)
  .sort()
const PATH = fileOf(`./migrations/${FILE_NAME}`)
// 파일이 아직 없으면 빈 글자로 돌아, 시험마다 '표·함수·제약이 없다'로 실패한다(무엇이 빠졌는지 시험별로 보인다)
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
const F = '00000000-0000-4000-8000-0000000000f1' // 승인된 병원 HF 원장, 관리자 아님
const C = '00000000-0000-4000-8000-0000000000c1' // 승인 대기 병원 HC 원장
const R = '00000000-0000-4000-8000-0000000000e1' // 거절된 병원 HR 원장
const K = '00000000-0000-4000-8000-0000000000d9' // HA의 데스크(병원 줄 없음)
const E = '00000000-0000-4000-8000-0000000000e9' // 병원 줄도 데스크 줄도 없음
const USERS = [A, B, F, C, R, K, E]
const hospitalOf = (user: string) => `10000000-0000-4000-8000-${user.slice(-12)}`
const HA = hospitalOf(A)
const HB = hospitalOf(B)
const HF = hospitalOf(F)
const HC = hospitalOf(C)
const HR = hospitalOf(R)
const STATUS: Record<string, 'approved' | 'pending' | 'rejected'> = { [A]: 'approved', [B]: 'approved', [F]: 'approved', [C]: 'pending', [R]: 'rejected' }
// 가입 때 고른 EMR(clinic_emr coalesce 시험: HA는 병원 정보가 이기고, HB는 병원 정보가 없어 가입 값, HF는 병원 정보가 이김)
const SIGNUP_EMR: Record<string, string> = { [A]: 'bit', [B]: 'other', [F]: 'egis', [C]: 'uisarang', [R]: 'uisarang' }
const EMAIL: Record<string, string> = {
  [A]: 'a-admin@fake.test',
  [B]: 'b-clinic@fake.test',
  [F]: 'f-clinic@fake.test',
  [C]: 'c-clinic@fake.test',
  [R]: 'r-clinic@fake.test',
  [K]: 'desk-a@fake.test',
  [E]: 'e-user@fake.test',
}
const LABEL: Record<string, string> = { [HA]: 'A', [HB]: 'B', [HF]: 'F', [HC]: 'C', [HR]: 'R' }
const NOWHERE = '00000000-0000-4000-8000-000000000999' // 없는 병원 id
const VIEW_KEY = '30000000-0000-4000-8000-000000000001' // A가 HB를 보는 보기 줄(운영자가 심음)
const VIEWING = JSON.stringify({ 'x-ssk-view': VIEW_KEY })

type Row = Record<string, unknown>
const SLOW = { timeout: 120_000 }
const DENIED = { code: '42501' }
const BAD = { code: '22023' }

// ── 이 파일이 더하는 것(design.md 7절) ─────────────────────────────────────
const TABLE = 'uis_periods'
const FN = 'admin_uis_rows(text,uuid[],date,date)'
const LIMIT = 262_144 // payload jsonb 글 모양 바이트 한도(256KB)
const OWN_POLICIES = ['내 병원 의사랑 숫자 읽기', '내 병원 의사랑 숫자 넣기', '내 병원 의사랑 숫자 고치기']
const VIEW_POLICY = '관리자 보는 의원 읽기'
const GUARD_POLICY = '보는 중에는 그 의원만 · 쓰기 없음'
const SOURCE_CHECKS: Record<string, string> = { stats_days: 'stats_days_source_check', stats_coverage: 'stats_coverage_source_check' }
const WRITE_COLUMNS = ['kind', 'from_day', 'to_day', 'payload']
const TZ = 'timestamp with time zone'
const MY_HOSPITAL = expect.stringMatching(/^(public\.)?my_hospital_id\(\)$/)

// 정책 글자(빈칸을 하나로 줄여 견줌, adminView.rls.test.ts와 같다)
const MINE_QUAL = /^\(hospital_id = \( SELECT (public\.)?my_hospital_id\(\) AS my_hospital_id\)\)$/
const VIEW_QUAL = /^\(hospital_id = \( SELECT (public\.)?admin_view_hospital_id\(\) AS admin_view_hospital_id\)\)$/
const GUARD_QUAL =
  /^\(\(\( SELECT (public\.)?admin_view_hospital_id\(\) AS admin_view_hospital_id\) IS NULL\) OR \(hospital_id = \( SELECT (public\.)?admin_view_hospital_id\(\) AS admin_view_hospital_id\)\)\)$/
const GUARD_CHECK = /^\(\( SELECT (public\.)?admin_view_hospital_id\(\) AS admin_view_hospital_id\) IS NULL\)$/

// ── 심는 값(모두 지어낸 것) ─────────────────────────────────────────────
const DAY = '2026-11-02' // 월요일
const DAY2 = '2026-11-15'
const AT = '2026-11-20T01:00:00.000Z'
const OLD = '2026-01-02T03:04:05.000Z' // 운영자가 트리거 없이 심는 옛 고친 시각
const SEVEN = [{}, {}, {}, {}, {}, {}, {}]
const RX = { v: 1, rows: [{ code: 'ESWT 1부위', name: '충격파 1부위', qty: 3, amount: 150000 }], total: 150000 }
const RX2 = { v: 1, rows: [{ code: 'mm010 100/100', name: '가짜 주사', qty: 1.5, amount: 2000 }], total: 2000 }
const AGE = { v: 1, patients: 3, newPatients: 1, bands: [0, 0, 0, 1, 1, 1, 0, 0, 0, 0], newBands: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0] }
const uis = (kind: string, from: string, to: string, payload: unknown = kind === 'age' ? AGE : RX): Row => ({ kind, from_day: from, to_day: to, payload })
const dayPayload = (day: string) => ({ schemaVersion: 2, quality: 'valid', day, partial: false, totals: { patients: 3, newPatients: 1, returning: 2, unknown: 0 } })

let db: PGlite // 지금 사슬 → 이 파일 → 이 파일
type Shape = Awaited<ReturnType<typeof shapeOf>>
type Old = Awaited<ReturnType<typeof dumpOld>>
let before: Shape
let first: Shape
let second: Shape
let preRows: Old
let firstRows: Old
let secondRows: Old
let firstUis: Row[]
let secondUis: Row[]

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
function send(table: string, row: Row) {
  const columns = Object.keys(row).join(', ')
  return db.query<Row>(`insert into public.${table} (${columns}) select ${columns} from json_populate_record(null::public.${table}, $1::json)`, [
    JSON.stringify(row),
  ])
}

/** 지금 역할로 PostgREST upsert(onConflict 'hospital_id,kind,from_day,to_day' — 보낸 칸 모두를 DO UPDATE SET에) */
function upsert(row: Row) {
  const keys = Object.keys(row)
  const columns = keys.join(', ')
  const set = keys.map((c) => `${c} = excluded.${c}`).join(', ')
  return db.query<Row>(
    `insert into public.${TABLE} (${columns}) select ${columns} from json_populate_record(null::public.${TABLE}, $1::json)
     on conflict (hospital_id, kind, from_day, to_day) do update set ${set}`,
    [JSON.stringify(row)],
  )
}

/** 운영자가 줄 하나(RLS·칸 권한을 건너뛴다) */
async function put(table: string, row: Row) {
  await operator()
  await send(table, row)
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

/** 사용자·병원·관리자·데스크·보기 줄(운영자). 병원 줄을 따라 표 줄이 함께 비워진다 */
async function resetData() {
  await operator()
  await db.exec('truncate auth.users cascade')
  for (const user of USERS) {
    await db.query('insert into auth.users (id, email) values ($1, $2)', [user, EMAIL[user]])
    const status = STATUS[user]
    if (status === undefined) continue
    await db.query(`insert into public.hospitals (id, owner_id, name, applicant_name, email, status, emr) values ($1, $2, '가짜의원', '홍길동', $3, $4, $5)`, [
      hospitalOf(user),
      user,
      EMAIL[user],
      status,
      SIGNUP_EMR[user],
    ])
  }
  await db.query('insert into public.admins (user_id) values ($1)', [A])
  await db.query(`insert into public.hospital_members (hospital_id, email) values ($1, 'desk-a@fake.test')`, [HA])
  await db.query(`insert into public.admin_views (id, user_id, hospital_id) values ($1, $2, $3)`, [VIEW_KEY, A, HB])
}

/** 운영자가 병원마다 uis_periods 줄 하나씩(HA·HB·HC·HR — HF는 없음) */
async function seedUis() {
  for (const h of [HA, HB, HC, HR]) await put(TABLE, { hospital_id: h, ...uis('rx', DAY, DAY) })
}

/** 지금 역할로 그 표의 줄이 어느 병원 것인지(병원 글자, 줄마다) */
async function labelsOf(table: string) {
  return (await rows(`select hospital_id from public.${table}`)).map((r) => LABEL[String(r.hospital_id)] ?? '?').sort()
}

/** 운영자 눈으로 본 uis_periods 줄 */
async function dumpUis() {
  await operator()
  return rows(
    `select hospital_id, kind, from_day::text as from_day, to_day::text as to_day, payload, updated_at from public.${TABLE} order by 1, 2, 3, 4`,
  )
}

/** 이 파일 전에도 있던 줄(운영자) — 이미 있던 줄이 그대로인지 */
async function dumpOld() {
  await operator()
  return {
    days: await rows(`select hospital_id, day::text as day, partial, source, payload, updated_at from public.stats_days order by 1, 2`),
    coverage: await rows(`select hospital_id, from_day::text as from_day, to_day::text as to_day, source, created_at from public.stats_coverage order by 1, 2, 3, 4`),
    months: await rows(`select hospital_id, month, partial, source, payload from public.stats_months order by 1, 2`),
    profiles: await rows(`select hospital_id, emr from public.clinic_profiles order by 1`),
    hospitals: await rows(`select id, status, emr from public.hospitals order by 1`),
  }
}

/** 이 파일 전 DB에 심는 줄: 비트·파일 출처 통계 줄과 병원 정보 */
async function seedBefore() {
  await resetData()
  await put('stats_days', { hospital_id: HA, day: DAY, partial: false, source: 'bit', payload: dayPayload(DAY) })
  await put('stats_days', { hospital_id: HB, day: DAY, partial: false, source: 'file', payload: dayPayload(DAY) })
  await put('stats_coverage', { hospital_id: HA, from_day: DAY, to_day: DAY2, source: 'bit', created_at: AT })
  await put('stats_coverage', { hospital_id: HB, from_day: DAY, to_day: DAY, source: 'file', created_at: AT })
  await put('stats_months', { hospital_id: HA, month: '2026-11', partial: true, source: 'bit', payload: { schemaVersion: 2, month: '2026-11', partial: true } })
  await put('clinic_profiles', { hospital_id: HA, hours: SEVEN, emr: 'uisarang' })
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

const bare = (name: unknown) => String(name).replace(/^public\./, '')
const squash = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ')
const fnOf = (shape: Shape, fn: string) => shape.functions.find((f) => bare(f.fn) === fn)
const aclHas = (acl: unknown, role: string) => ((acl as string[] | null) ?? []).some((item) => item.startsWith(`${role}=`) && /=[^/]*X/.test(item))
const isSourceCheck = (c: Row) => SOURCE_CHECKS[bare(c.tbl)] === c.conname
const constraintOf = (shape: Shape, table: string, name: string) => shape.constraints.find((c) => bare(c.tbl) === table && c.conname === name)

/** 이 파일이 더한 것(표 uis_periods·함수 admin_uis_rows)과 바꾼 출처 제약 둘을 뺀 모양 */
function withoutThis(shape: Shape): Shape {
  return {
    columns: shape.columns.filter((c) => c.table_name !== TABLE),
    constraints: shape.constraints.filter((c) => bare(c.tbl) !== TABLE && !isSourceCheck(c)),
    access: shape.access.filter((a) => a.relname !== TABLE),
    indexes: shape.indexes.filter((i) => i.tablename !== TABLE),
    policies: shape.policies.filter((p) => p.tablename !== TABLE),
    triggers: shape.triggers.filter((t) => bare(t.tbl) !== TABLE),
    functions: shape.functions.filter((f) => bare(f.fn) !== FN),
  }
}

/** 관리자 비교 읽기(지금 역할로) */
async function adminUis(kind: string | null, ids: readonly string[] | null, from: string | null, to: string | null) {
  return rows(`select hospital_id, "row" from public.admin_uis_rows($1, $2::uuid[], $3::date, $4::date)`, [
    kind,
    ids === null ? null : `{${ids.join(',')}}`,
    from,
    to,
  ])
}

beforeAll(async () => {
  db = await PGlite.create()
  await migrate(db)
  await seedBefore()
  before = await shapeOf(db)
  preRows = await dumpOld()
  await db.exec(MIGRATION)
  first = await shapeOf(db)
  firstRows = await dumpOld()
  // 두 번째 실행이 지우거나 바꾸지 않는지 볼 의사랑 줄(파일이 아직 없으면 표가 없다 — 빈 목록으로 두어 그 시험만 실패하게)
  await put(TABLE, { hospital_id: HA, ...uis('rx', DAY, DAY) }).catch(() => undefined)
  await put('stats_days', { hospital_id: HA, day: DAY2, partial: false, source: 'uisarang', payload: dayPayload(DAY2) }).catch(() => undefined)
  firstUis = await dumpUis().catch(() => [])
  const firstDays = await dumpOld()
  await db.exec(MIGRATION)
  second = await shapeOf(db)
  secondRows = await dumpOld()
  secondUis = await dumpUis().catch(() => [])
  // 두 번째 실행 전과 뒤의 줄을 견주려고 firstRows를 '두 번째 전' 줄로 바꿔 둔다(uisarang 날 줄 포함)
  firstRows = firstDays
}, 300_000)

afterAll(async () => {
  await db.close()
})

// 시험마다 빈 표에서 시작한다. 운영자(superuser)는 RLS를 건너뛴다
beforeEach(async () => {
  await resetData()
}, 60_000)

describe('AC-8801.7 파일 · 사슬 · 두 번 실행 · 더하기만', SLOW, () => {
  it('AC-8801.7: 시험 사슬은 이 파일보다 앞인 migration 모두이고, 이 파일이 있으며 줄 끝이 LF이고 머리 주석에 무엇·실행·먼저·두 번·관문·명세 번호가 있다', () => {
    for (const name of [
      '20261101000200_stats.sql',
      '20261101000400_revenue.sql',
      '20261119300000_clinic_emr.sql',
      '20261119400000_hospital_emr.sql',
      '20261124000000_admin_view.sql',
    ]) {
      expect(CHAIN_NAMES).toContain(name)
    }
    expect(MIGRATION).not.toBe('')
    expect(MIGRATION).not.toContain('\r')
    const lines = MIGRATION.split('\n')
    const head = lines.slice(0, lines.findIndex((line) => !/^(--|\s*$)/.test(line))).join('\n')
    for (const word of [
      TABLE,
      'admin_uis_rows',
      'uisarang',
      'stats_days',
      'stats_coverage',
      'REQ-8801',
      'ADR-056',
      '운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다',
      '20261101000200_stats.sql',
      '20261101000400_revenue.sql',
      '20261119300000_clinic_emr.sql',
      '20261119400000_hospital_emr.sql',
      '20261124000000_admin_view.sql',
      '두 번 붙여 넣어도 그대로다',
      '이 파일을 먼저 붙여 넣고 그다음 사이트에 올린다',
    ]) {
      expect(head, word).toContain(word)
    }
  })

  it('AC-8801.7: 두 번 돌려도 되는 문장만 쓴다(표는 if not exists, 제약·정책·트리거는 지우고 다시, 함수는 or replace)', () => {
    const count = (pattern: RegExp) => (TOP.match(pattern) ?? []).length
    expect(count(/create\s+table\s+if\s+not\s+exists\s+public\.uis_periods\b/gi)).toBe(1)
    expect(TOP).not.toMatch(/create\s+table\s+(?!if\s+not\s+exists)/i)
    expect(TOP).not.toMatch(/create\s+(unique\s+)?index\s+(?!if\s+not\s+exists)/i)
    expect(TOP).not.toMatch(/create\s+function/i)
    expect(count(/create\s+or\s+replace\s+function/gi)).toBe(1)
    expect(TOP).toMatch(/create\s+or\s+replace\s+function\s+public\.admin_uis_rows\s*\(/i)
    expect(TOP).not.toMatch(/add\s+column\s+(?!if\s+not\s+exists)/i)
    expect(TOP).not.toMatch(/^\s*(drop\s+(?!policy\s+if\s+exists|trigger\s+if\s+exists)|truncate|delete|update|insert)\b/im)
    expect(TOP).not.toMatch(/alter\s+default\s+privileges/i)
    // 제약을 더하기 전에 늘 같은 이름을 지운다
    const added = [...TOP.matchAll(/alter\s+table\s+(\S+)\s+add\s+constraint\s+(\S+)/gi)]
    expect(added.map(([, , name]) => name).sort()).toEqual(['stats_coverage_source_check', 'stats_days_source_check', 'uis_periods_payload_ok', 'uis_periods_span_ok'])
    for (const [, table, name] of added) expect(TOP, `${table} ${name}`).toMatch(new RegExp(`alter\\s+table\\s+${table.replace('.', '\\.')}\\s+drop\\s+constraint\\s+if\\s+exists\\s+${name};`, 'i'))
    // 정책을 만들기 전에 늘 같은 이름을 지운다
    const policies = [...TOP.matchAll(/create\s+policy\s+"([^"]+)"\s+on\s+(\S+)/gi)]
    expect(policies).toHaveLength(5)
    for (const [, name, table] of policies) expect(TOP, `${table} ${name}`).toContain(`drop policy if exists "${name}" on ${table}`)
    // 트리거를 만들기 전에 늘 같은 이름을 지운다
    const triggers = [...TOP.matchAll(/create\s+trigger\s+(\S+)\s+[\s\S]*?\s+on\s+(\S+)/gi)]
    expect(triggers).toHaveLength(1)
    for (const [, name, table] of triggers) expect(TOP, `${table} ${name}`).toContain(`drop trigger if exists ${name} on ${table}`)
    // 고치는 표는 셋뿐(새 표 · 출처 제약 둘), 표 권한은 새 표에만
    for (const [, target] of TOP.matchAll(/^\s*alter\s+table\s+(\S+)/gim)) expect(['public.uis_periods', 'public.stats_days', 'public.stats_coverage']).toContain(target)
    for (const [, target] of TOP.matchAll(/^\s*(?:revoke|grant)\s+[^;]*?\s+on\s+table\s+(\S+)/gim)) expect(target).toBe('public.uis_periods')
  })

  it('AC-8801.7: admin_rows·stats_months·공용 함수(my_hospital_id·touch_updated_at·admin_view_hospital_id)는 다시 만들지 않는다', () => {
    // 트리거가 부르는 execute function public.touch_updated_at()은 된다 — 만들기·바꾸기·지우기·권한만 본다
    const SHARED = '(my_hospital_id|touch_updated_at|admin_view_hospital_id|admin_view_key|admin_rows)\\b'
    expect(SQL).not.toMatch(new RegExp(`(create(\\s+or\\s+replace)?|alter|drop)\\s+function\\s+public\\.${SHARED}`, 'i'))
    expect(SQL).not.toMatch(new RegExp(`on\\s+function\\s+public\\.${SHARED}`, 'i'))
    expect(SQL).not.toMatch(/stats_months/i)
  })

  it('AC-8801.7: 두 번째 실행 뒤 표·칸·제약·정책·권한·함수·트리거 모양과 줄이 첫 실행 뒤와 같다(이미 있던 줄 그대로)', () => {
    expect(second).toEqual(first)
    expect(secondRows).toEqual(firstRows)
    expect(firstUis).toHaveLength(1)
    expect(secondUis).toEqual(firstUis)
    expect(firstRows.days.map((d) => d.source)).toEqual(['bit', 'uisarang', 'file'])
  })

  it('AC-8801.7: 이 파일 전에 있던 줄(비트·파일 출처 통계 줄·병원 정보·가입 EMR)은 그대로다', () => {
    const { days, ...rest } = firstRows
    const { days: preDays, ...preRest } = preRows
    expect(rest).toEqual(preRest)
    expect(days.filter((d) => d.source !== 'uisarang')).toEqual(preDays)
  })

  it('AC-8801.7: 새 표·새 함수·출처 제약 둘 밖의 표·칸·제약·색인·트리거·정책·권한·함수는 하나도 바뀌지 않는다(더하기만)', () => {
    expect(withoutThis(first)).toEqual(withoutThis(before))
  })
})

describe('AC-8801.1 표 모양 · 원장 넣기·읽기·고치기 · 지우기 없음', SLOW, () => {
  it('AC-8801.1: uis_periods 칸은 design.md 7절 ①이고 열쇠는 (병원, 종류, 시작, 끝), 병원을 지우면 같이 지워진다', () => {
    expect(first.columns.filter((c) => c.table_name === TABLE).map((c) => [c.column_name, c.data_type, c.is_nullable, c.column_default])).toEqual([
      ['hospital_id', 'uuid', 'NO', MY_HOSPITAL],
      ['kind', 'text', 'NO', null],
      ['from_day', 'date', 'NO', null],
      ['to_day', 'date', 'NO', null],
      ['payload', 'jsonb', 'NO', null],
      ['updated_at', TZ, 'NO', 'now()'],
    ])
    // PG18은 not null도 pg_constraint에 따로 적는다 → 기본 키·바깥 키·검사만 본다
    const defs = first.constraints.filter((c) => bare(c.tbl) === TABLE && !/^NOT NULL /.test(String(c.def))).map((c) => squash(c.def))
    expect(defs).toEqual(
      expect.arrayContaining([
        'PRIMARY KEY (hospital_id, kind, from_day, to_day)',
        expect.stringMatching(/^FOREIGN KEY \(hospital_id\) REFERENCES (public\.)?hospitals\(id\) ON DELETE CASCADE$/),
      ]),
    )
    expect(defs).toHaveLength(6) // 기본 키 · 바깥 키 · kind · from_day · 기간 · payload
  })

  it('AC-8801.1: RLS 켜짐 · anon·PUBLIC 권한 없음 · authenticated는 표 읽기와 네 칸 넣기·고치기만(hospital_id·updated_at 칸 권한 없음, 지우기 없음)', async () => {
    const access = first.access.find((t) => t.relname === TABLE)
    expect(access?.relrowsecurity).toBe(true)
    const acl = (access?.acl as string[] | null) ?? []
    expect(acl.filter((item) => item.startsWith('anon=') || item.startsWith('='))).toEqual([])
    expect(acl.filter((item) => item.startsWith('authenticated=')).map((item) => item.replace(/^authenticated=([^/]*)\/.*$/, '$1'))).toEqual(['r'])
    await operator()
    for (const column of ['hospital_id', 'kind', 'from_day', 'to_day', 'payload', 'updated_at']) {
      const [privilege] = await rows(
        `select has_column_privilege('anon', $1, $2, 'SELECT') as anon_read,
                has_column_privilege('anon', $1, $2, 'INSERT') as anon_insert,
                has_column_privilege('authenticated', $1, $2, 'INSERT') as can_insert,
                has_column_privilege('authenticated', $1, $2, 'UPDATE') as can_update`,
        [`public.${TABLE}`, column],
      )
      expect(privilege, column).toEqual({
        anon_read: false,
        anon_insert: false,
        can_insert: WRITE_COLUMNS.includes(column),
        can_update: WRITE_COLUMNS.includes(column),
      })
    }
    const [table] = await rows(`select has_table_privilege('authenticated', $1, 'DELETE') as can_delete`, [`public.${TABLE}`])
    expect(table.can_delete).toBe(false)
  })

  it('AC-8801.1: 정책은 내 병원 읽기·넣기·고치기 셋과 보는 중 정책 둘뿐이다(지우기 정책 없음)', () => {
    const mine = first.policies.filter((p) => p.schemaname === 'public' && p.tablename === TABLE)
    expect(mine.map((p) => p.policyname).sort()).toEqual([...OWN_POLICIES, VIEW_POLICY, GUARD_POLICY].sort())
    expect(mine.some((p) => p.cmd === 'DELETE')).toBe(false)
    const byName = (name: string) => mine.find((p) => p.policyname === name)
    expect(byName(OWN_POLICIES[0])).toMatchObject({ cmd: 'SELECT', permissive: 'PERMISSIVE', roles: ['authenticated'] })
    expect(squash(byName(OWN_POLICIES[0])?.qual)).toMatch(MINE_QUAL)
    expect(byName(OWN_POLICIES[1])).toMatchObject({ cmd: 'INSERT', permissive: 'PERMISSIVE', roles: ['authenticated'], qual: null })
    expect(squash(byName(OWN_POLICIES[1])?.with_check)).toMatch(MINE_QUAL)
    expect(byName(OWN_POLICIES[2])).toMatchObject({ cmd: 'UPDATE', permissive: 'PERMISSIVE', roles: ['authenticated'] })
    expect(squash(byName(OWN_POLICIES[2])?.qual)).toMatch(MINE_QUAL)
    expect(squash(byName(OWN_POLICIES[2])?.with_check)).toMatch(MINE_QUAL)
    expect(byName(VIEW_POLICY)).toMatchObject({ cmd: 'SELECT', permissive: 'PERMISSIVE', roles: ['authenticated'] })
    expect(squash(byName(VIEW_POLICY)?.qual)).toMatch(VIEW_QUAL)
    expect(byName(GUARD_POLICY)).toMatchObject({ cmd: 'ALL', permissive: 'RESTRICTIVE', roles: ['authenticated'] })
    expect(squash(byName(GUARD_POLICY)?.qual)).toMatch(GUARD_QUAL)
    expect(squash(byName(GUARD_POLICY)?.with_check)).toMatch(GUARD_CHECK)
  })

  it('AC-8801.1: 고친 시각 트리거는 uis_periods_touch(고치기 전 · 줄마다 · touch_updated_at) 하나다', () => {
    const triggers = first.triggers.filter((t) => bare(t.tbl) === TABLE)
    expect(triggers.map((t) => t.tgname)).toEqual(['uis_periods_touch'])
    expect(squash(triggers[0]?.def)).toMatch(
      /^CREATE TRIGGER uis_periods_touch BEFORE UPDATE ON (public\.)?uis_periods FOR EACH ROW EXECUTE FUNCTION (public\.)?touch_updated_at\(\)$/,
    )
  })

  it('AC-8801.1: 승인된 원장이 네 칸만 보내 넣으면 hospital_id = 내 병원 · updated_at = 지금이 되고, 읽으면 그 줄이 보인다', async () => {
    await become(A)
    expect(await outcome(() => send(TABLE, uis('rx', DAY, DAY)))).toBe('ok 1')
    expect(await outcome(() => send(TABLE, uis('age', DAY, DAY)))).toBe('ok 1')
    expect(await outcome(() => send(TABLE, uis('rx', '2026-11-02', '2026-11-08')))).toBe('ok 1')
    expect(await outcome(() => send(TABLE, uis('rx', '2026-11-01', '2026-11-30')))).toBe('ok 1')
    const mine = await rows(`select hospital_id, kind, from_day::text as from_day, to_day::text as to_day, payload, updated_at > now() - interval '1 minute' as fresh from public.uis_periods order by 2, 3, 4`)
    expect(mine).toEqual([
      { hospital_id: HA, kind: 'age', from_day: DAY, to_day: DAY, payload: AGE, fresh: true },
      { hospital_id: HA, kind: 'rx', from_day: '2026-11-01', to_day: '2026-11-30', payload: RX, fresh: true },
      { hospital_id: HA, kind: 'rx', from_day: DAY, to_day: DAY, payload: RX, fresh: true },
      { hospital_id: HA, kind: 'rx', from_day: '2026-11-02', to_day: '2026-11-08', payload: RX, fresh: true },
    ])
  })

  it('AC-8801.1: hospital_id·updated_at을 보내면 넣기·고치기 모두 칸 권한 없음(42501)이다', async () => {
    await become(A)
    expect(await outcome(() => send(TABLE, { hospital_id: HA, ...uis('rx', DAY, DAY) }))).toBe('error 42501')
    expect(await outcome(() => send(TABLE, { ...uis('rx', DAY, DAY), updated_at: AT }))).toBe('error 42501')
    expect(await outcome(() => send(TABLE, uis('rx', DAY, DAY)))).toBe('ok 1')
    expect(await outcome(() => db.query(`update public.uis_periods set hospital_id = $1`, [HB]))).toBe('error 42501')
    expect(await outcome(() => db.query(`update public.uis_periods set updated_at = $1`, [AT]))).toBe('error 42501')
    expect((await dumpUis()).map((r) => r.hospital_id)).toEqual([HA])
  })

  it('AC-8801.1: 원장이 고치면 payload가 바뀌고 updated_at도 지금으로 바뀐다(같은 기간 upsert도 같은 줄을 바꾼다)', async () => {
    await put(TABLE, { hospital_id: HA, ...uis('rx', DAY, DAY) })
    await put(TABLE, { hospital_id: HA, ...uis('age', DAY, DAY) })
    await quiet(`update public.uis_periods set updated_at = $2 where hospital_id = $1`, [HA, OLD])
    await become(A)
    expect(await outcome(() => db.query(`update public.uis_periods set payload = $1::jsonb where kind = 'rx'`, [JSON.stringify(RX2)]))).toBe('ok 1')
    await operator()
    expect(await rows(`select kind, payload, updated_at > $1::timestamptz as touched from public.uis_periods order by 1`, [OLD])).toEqual([
      { kind: 'age', payload: AGE, touched: false },
      { kind: 'rx', payload: RX2, touched: true },
    ])
    // PostgREST upsert(보낸 칸 모두를 DO UPDATE SET에): 같은 (병원, 종류, 시작, 끝)이면 줄 하나를 바꾼다
    await become(A)
    const NEXT = { ...AGE, patients: 4, bands: [0, 0, 0, 1, 1, 1, 1, 0, 0, 0] }
    expect(await outcome(() => upsert(uis('age', DAY, DAY, NEXT)))).toBe('ok 1')
    expect(await outcome(() => upsert(uis('age', DAY2, DAY2)))).toBe('ok 1')
    await operator()
    expect(await rows(`select kind, from_day::text as from_day, payload, updated_at > $1::timestamptz as touched from public.uis_periods order by 1, 2`, [OLD])).toEqual([
      { kind: 'age', from_day: DAY, payload: NEXT, touched: true },
      { kind: 'age', from_day: DAY2, payload: AGE, touched: true },
      { kind: 'rx', from_day: DAY, payload: RX2, touched: true },
    ])
  })

  it('AC-8801.1: 지우기는 아무에게도 권한이 없다(원장·관리자·데스크 42501)', async () => {
    await seedUis()
    for (const user of [A, B, K, C]) {
      await become(user)
      expect(await outcome(() => db.query(`delete from public.uis_periods`)), user).toBe('error 42501')
    }
    await becomeAnon()
    expect(await outcome(() => db.query(`delete from public.uis_periods`))).toBe('error 42501')
    expect(await dumpUis()).toHaveLength(4)
  })
})

describe('AC-8801.2 남의 병원 · 데스크 · 승인 대기·거절 · 병원 없음 · 로그인 안 함', SLOW, () => {
  it('AC-8801.2: 다른 병원 원장은 자기 줄만 보고, 데스크·승인 대기·거절·병원 없음은 자기 병원 줄이 있어도 한 줄도 못 본다', async () => {
    await seedUis()
    const seen: Record<string, string[]> = {}
    for (const [name, user] of [
      ['A', A],
      ['B', B],
      ['F', F],
      ['K', K],
      ['C', C],
      ['R', R],
      ['E', E],
    ] as const) {
      await become(user)
      seen[name] = await labelsOf(TABLE)
    }
    expect(seen).toEqual({ A: ['A'], B: ['B'], F: [], K: [], C: [], R: [], E: [] })
    await becomeAnon()
    await expect(rows(`select * from public.uis_periods`)).rejects.toMatchObject(DENIED)
  })

  it('AC-8801.2: 다른 병원 원장은 남의 병원 줄을 넣지도(hospital_id 칸 권한 없음) 고치지도(0줄) 못한다', async () => {
    await seedUis()
    const beforeRows = await dumpUis()
    await become(B)
    expect(await outcome(() => send(TABLE, { hospital_id: HA, ...uis('rx', DAY2, DAY2) }))).toBe('error 42501')
    expect(await outcome(() => db.query(`update public.uis_periods set payload = $2::jsonb where hospital_id = $1`, [HA, JSON.stringify(RX2)]))).toBe('ok 0')
    expect(await dumpUis()).toEqual(beforeRows)
  })

  it.each([
    ['데스크', K],
    ['승인 대기 원장', C],
    ['거절된 원장', R],
    ['병원 없는 사용자', E],
  ])('AC-8801.2: %s은 넣기가 막히고(42501) 고치기는 0줄이다', async (_who, user) => {
    await seedUis()
    const beforeRows = await dumpUis()
    await become(user)
    expect(await outcome(() => send(TABLE, uis('rx', DAY2, DAY2)))).toBe('error 42501')
    expect(await outcome(() => upsert(uis('rx', DAY, DAY, RX2)))).toBe('error 42501')
    expect(await outcome(() => db.query(`update public.uis_periods set payload = $1::jsonb`, [JSON.stringify(RX2)]))).toBe('ok 0')
    expect(await dumpUis()).toEqual(beforeRows)
  })

  it('AC-8801.2: 로그인 안 한 사람(anon)은 읽기·넣기·고치기 모두 권한 없음(42501)이다', async () => {
    await seedUis()
    const beforeRows = await dumpUis()
    await becomeAnon()
    expect(await outcome(() => db.query(`select * from public.uis_periods`))).toBe('error 42501')
    expect(await outcome(() => send(TABLE, uis('rx', DAY2, DAY2)))).toBe('error 42501')
    expect(await outcome(() => db.query(`update public.uis_periods set payload = $1::jsonb`, [JSON.stringify(RX2)]))).toBe('error 42501')
    expect(await dumpUis()).toEqual(beforeRows)
  })
})

describe('AC-8801.3 줄 모양 제약', SLOW, () => {
  it('AC-8801.3: 제약은 기간 uis_periods_span_ok · payload uis_periods_payload_ok(묶음 전체를 IS TRUE로 감쌈)이다', () => {
    expect(squash(constraintOf(first, TABLE, 'uis_periods_payload_ok')?.def)).toMatch(/^CHECK \(\(\(.*\) IS TRUE\)\)$/)
    expect(squash(constraintOf(first, TABLE, 'uis_periods_payload_ok')?.def)).toContain('262144')
    expect(constraintOf(first, TABLE, 'uis_periods_span_ok')).toBeDefined()
    expect(SQL).toMatch(/add\s+constraint\s+uis_periods_payload_ok\s+check\s*\(\s*\([\s\S]*?\)\s+is\s+true\s*\)\s*;/i)
  })

  it.each([
    ['rx', DAY, DAY, '처방 하루'],
    ['age', DAY, DAY, '나이대 하루'],
    ['rx', '2026-11-02', '2026-11-08', '처방 월~일 한 주'],
    ['rx', '2026-11-30', '2026-12-06', '처방 달을 넘는 월~일 한 주'],
    ['rx', '2026-11-01', '2026-11-30', '처방 11월 한 달'],
    ['rx', '2026-02-01', '2026-02-28', '처방 2월 한 달'],
    ['rx', '2028-02-01', '2028-02-29', '처방 윤년 2월 한 달'],
    ['rx', '2026-12-01', '2026-12-31', '처방 12월 한 달(해 넘김)'],
    ['rx', '2020-01-01', '2020-01-01', '2020-01-01 하루'],
    ['age', '2020-01-01', '2020-01-01', '2020-01-01 나이대 하루'],
  ])('AC-8801.3: %s %s~%s(%s)는 들어간다', async (kind, from, to) => {
    await become(A)
    expect(await outcome(() => send(TABLE, uis(kind, from, to)))).toBe('ok 1')
  })

  it.each([
    ['visit', DAY, DAY, '종류가 rx·age 밖'],
    ['RX', DAY, DAY, '대문자 종류'],
    ['age', '2026-11-02', '2026-11-08', '나이대 한 주'],
    ['age', '2026-11-01', '2026-11-30', '나이대 한 달'],
    ['rx', '2026-11-03', '2026-11-09', '화~월 7일'],
    ['rx', '2026-11-02', '2026-11-07', '월~토'],
    ['rx', '2026-11-02', '2026-11-09', '월~다음 월 8일'],
    ['rx', '2026-11-01', '2026-11-29', '1일~말일 전날'],
    ['rx', '2026-11-02', '2026-12-01', '2일~다음 달 1일'],
    ['rx', '2026-02-01', '2026-03-01', '1일~다음 달 1일'],
    ['rx', '2026-11-01', '2026-12-31', '두 달'],
    ['rx', '2026-11-03', '2026-11-02', '시작이 끝보다 뒤'],
    ['rx', '2019-12-31', '2019-12-31', '2020-01-01 앞 하루'],
    ['rx', '2019-12-30', '2020-01-05', '2020-01-01 앞에서 시작한 월~일'],
    ['rx', '2019-12-01', '2019-12-31', '2020-01-01 앞 한 달'],
  ])('AC-8801.3: %s %s~%s(%s)는 23514로 막힌다', async (kind, from, to) => {
    await become(A)
    expect(await outcome(() => send(TABLE, uis(kind, from, to)))).toBe('error 23514')
  })

  it.each([
    ['v 열쇠가 없는 객체', {}],
    ['v 없이 rows만', { rows: [], total: null }],
    ['v가 2', { v: 2, rows: [], total: null }],
    ['v가 0', { v: 0 }],
    ['v가 null', { v: null }],
    ['v가 1.5', { v: 1.5 }],
    ['배열', [{ v: 1 }]],
    ['글자', 'v'],
    ['숫자', 1],
    ['참거짓', true],
    ['jsonb null', null],
  ])('AC-8801.3: payload가 %s이면 23514로 막힌다(NULL로 빠져나가지 않음)', async (_what, payload) => {
    await become(A)
    expect(await outcome(() => db.query(`insert into public.uis_periods (kind, from_day, to_day, payload) values ('rx', $1, $1, $2::jsonb)`, [DAY, JSON.stringify(payload)]))).toBe(
      'error 23514',
    )
  })

  it('AC-8801.3: payload 칸을 비우면(SQL NULL) not null로 막힌다', async () => {
    await become(A)
    expect(await outcome(() => db.query(`insert into public.uis_periods (kind, from_day, to_day, payload) values ('rx', $1, $1, null)`, [DAY]))).toBe('error 23502')
  })

  it('AC-8801.3: v가 1인 객체는 다른 열쇠가 없어도 들어간다(안 모양 검사는 앱 lib/payload/uisarang)', async () => {
    await become(A)
    expect(await outcome(() => send(TABLE, uis('rx', DAY, DAY, { v: 1 })))).toBe('ok 1')
    expect(await outcome(() => send(TABLE, uis('age', DAY, DAY, { v: 1, extra: 'x' })))).toBe('ok 1')
  })

  it('AC-8801.3: payload jsonb 글 모양이 262,144바이트면 들어가고 1바이트라도 넘으면(한글은 3바이트로 셈) 23514다', async () => {
    await operator()
    const bytes = async (value: unknown) => Number((await rows(`select octet_length($1::jsonb::text) as n`, [JSON.stringify(value)]))[0].n)
    const base = await bytes({ v: 1, pad: '' })
    const exact = { v: 1, pad: 'x'.repeat(LIMIT - base) }
    const over = { v: 1, pad: 'x'.repeat(LIMIT - base + 1) }
    const hangul = { v: 1, pad: '가'.repeat(Math.ceil((LIMIT - base + 1) / 3)) }
    expect(await bytes(exact)).toBe(LIMIT)
    expect(await bytes(over)).toBe(LIMIT + 1)
    expect(await bytes(hangul)).toBeGreaterThan(LIMIT)
    expect(hangul.pad.length + base).toBeLessThan(LIMIT) // 글자 수로는 한도 안
    await become(A)
    expect(await outcome(() => send(TABLE, uis('rx', DAY, DAY, exact)))).toBe('ok 1')
    expect(await outcome(() => send(TABLE, uis('rx', DAY2, DAY2, over)))).toBe('error 23514')
    expect(await outcome(() => send(TABLE, uis('age', DAY2, DAY2, hangul)))).toBe('error 23514')
  })

  it('AC-8801.3: 고치기도 같은 제약을 받는다(기간·payload)', async () => {
    await put(TABLE, { hospital_id: HA, ...uis('rx', DAY, DAY) })
    await become(A)
    expect(await outcome(() => db.query(`update public.uis_periods set payload = '{}'::jsonb`))).toBe('error 23514')
    expect(await outcome(() => db.query(`update public.uis_periods set to_day = '2026-11-05'`))).toBe('error 23514')
    expect(await outcome(() => db.query(`update public.uis_periods set kind = 'age', to_day = '2026-11-08'`))).toBe('error 23514')
    expect(await outcome(() => db.query(`update public.uis_periods set to_day = '2026-11-08'`))).toBe('ok 1')
  })
})

describe('AC-8801.4 통계 출처 uisarang', SLOW, () => {
  it('AC-8801.4: 바꾸는 출처 제약 이름은 지금 사슬의 pg_constraint에 있는 자동 이름이고, 바꾼 뒤 옛 검사가 남지 않는다', () => {
    for (const [table, name] of Object.entries(SOURCE_CHECKS)) {
      const old = constraintOf(before, table, name)
      expect(old, `${table} ${name} (이 파일 전)`).toBeDefined()
      expect(squash(old?.def)).toContain("'bit'::text")
      expect(squash(old?.def)).toContain("'file'::text")
      expect(squash(old?.def)).not.toContain('uisarang')
      const now = constraintOf(first, table, name)
      expect(squash(now?.def), `${table} ${name}`).toMatch(/^CHECK \(\(source = ANY \(ARRAY\['bit'::text, 'file'::text, 'uisarang'::text\]\)\)\)$/)
      // source를 보는 CHECK는 그 하나뿐(옛 이름이 따로 남지 않음 — PG18의 NOT NULL 줄은 CHECK가 아니다)
      const checks = first.constraints.filter((c) => bare(c.tbl) === table && /^CHECK /.test(String(c.def)) && /\bsource\b/.test(String(c.def)))
      expect(checks.map((c) => c.conname), table).toEqual([name])
    }
    // stats_months 출처는 그대로(bit·file)
    expect(constraintOf(first, 'stats_months', 'stats_months_source_check')).toEqual(constraintOf(before, 'stats_months', 'stats_months_source_check'))
    expect(squash(constraintOf(first, 'stats_months', 'stats_months_source_check')?.def)).not.toContain('uisarang')
  })

  it("AC-8801.4: 원장은 stats_days·stats_coverage에 출처 'uisarang' 줄을 넣고, 'bit'·'file'도 그대로 되며 그 밖 글자는 23514다", async () => {
    await become(A)
    for (const [i, source] of ['bit', 'file', 'uisarang'].entries()) {
      const day = addDays(DAY, i)
      expect(await outcome(() => send('stats_days', { day, partial: false, source, payload: dayPayload(day) })), `stats_days ${source}`).toBe('ok 1')
      expect(await outcome(() => send('stats_coverage', { from_day: day, to_day: day, source })), `stats_coverage ${source}`).toBe('ok 1')
    }
    for (const source of ['egis', 'UISARANG', 'uisarang ', '']) {
      const day = addDays(DAY, 10)
      expect(await outcome(() => send('stats_days', { day, partial: false, source, payload: dayPayload(day) })), `stats_days ${source}`).toBe('error 23514')
      expect(await outcome(() => send('stats_coverage', { from_day: day, to_day: day, source })), `stats_coverage ${source}`).toBe('error 23514')
    }
    expect(await rows(`select source from public.stats_days order by day`)).toEqual([{ source: 'bit' }, { source: 'file' }, { source: 'uisarang' }])
    expect(await rows(`select source from public.stats_coverage order by from_day`)).toEqual([{ source: 'bit' }, { source: 'file' }, { source: 'uisarang' }])
  })

  it("AC-8801.4: 출처 'uisarang' 날 줄도 PostgREST upsert로 바꿀 수 있다(지금 칸 권한 그대로)", async () => {
    await become(A)
    const row = { day: DAY, partial: false, source: 'uisarang', payload: dayPayload(DAY) }
    const columns = Object.keys(row).join(', ')
    const set = Object.keys(row).map((c) => `${c} = excluded.${c}`).join(', ')
    const save = (value: Row) =>
      db.query(`insert into public.stats_days (${columns}) select ${columns} from json_populate_record(null::public.stats_days, $1::json) on conflict (hospital_id, day) do update set ${set}`, [
        JSON.stringify(value),
      ])
    expect(await outcome(() => save(row))).toBe('ok 1')
    const next = { ...row, payload: { ...dayPayload(DAY), totals: { patients: 9, newPatients: 2, returning: 7, unknown: 0 } } }
    expect(await outcome(() => save(next))).toBe('ok 1')
    await operator()
    expect(await rows(`select source, payload -> 'totals' ->> 'patients' as patients from public.stats_days where hospital_id = $1`, [HA])).toEqual([
      { source: 'uisarang', patients: '9' },
    ])
  })

  it("AC-8801.4: stats_months는 'uisarang'을 받지 않는다(지금 그대로 bit·file)", async () => {
    await become(A)
    const month = (source: string, m: string) => ({ month: m, partial: false, source, payload: { schemaVersion: 2, month: m, partial: false } })
    expect(await outcome(() => send('stats_months', month('uisarang', '2026-10')))).toBe('error 23514')
    expect(await outcome(() => send('stats_months', month('bit', '2026-09')))).toBe('ok 1')
    expect(await outcome(() => send('stats_months', month('file', '2026-08')))).toBe('ok 1')
  })
})

describe('AC-8801.5 관리자가 다른 의원을 보는 중', SLOW, () => {
  it('AC-8801.5: 보는 중이면 그 의원 줄만 보이고(내 줄은 숨김), 보는 중이 아니면 자기 줄만 그대로 보인다', async () => {
    await seedUis()
    await become(A, VIEWING)
    expect(await labelsOf(TABLE)).toEqual(['B'])
    await become(A)
    expect(await labelsOf(TABLE)).toEqual(['A'])
    // 남의 열쇠를 머리에 실어도 보는 중이 아니다(B는 관리자가 아님)
    await become(B, VIEWING)
    expect(await labelsOf(TABLE)).toEqual(['B'])
    await become(E, VIEWING)
    expect(await labelsOf(TABLE)).toEqual([])
  })

  it('AC-8801.5: 보는 중에는 넣기·upsert가 막히고(42501) 고치기는 0줄이다(줄 그대로)', async () => {
    await seedUis()
    const beforeRows = await dumpUis()
    await become(A, VIEWING)
    expect(await outcome(() => send(TABLE, uis('rx', DAY2, DAY2)))).toBe('error 42501')
    expect(await outcome(() => upsert(uis('rx', DAY, DAY, RX2)))).toBe('error 42501')
    expect(await outcome(() => db.query(`update public.uis_periods set payload = $1::jsonb`, [JSON.stringify(RX2)]))).toBe('ok 0')
    expect(await outcome(() => db.query(`update public.uis_periods set payload = $1::jsonb where hospital_id = $2`, [JSON.stringify(RX2), HB]))).toBe('ok 0')
    expect(await dumpUis()).toEqual(beforeRows)
    // 보기를 멈추면(머리 없음) 내 병원 줄을 다시 쓴다
    await become(A)
    expect(await outcome(() => send(TABLE, uis('rx', DAY2, DAY2)))).toBe('ok 1')
  })

  it('AC-8801.5: 끝난 보기 열쇠·12시간 지난 열쇠로는 보는 중이 아니다(자기 줄만)', async () => {
    await seedUis()
    await operator()
    await db.query(`update public.admin_views set ended_at = now() where id = $1`, [VIEW_KEY])
    await become(A, VIEWING)
    expect(await labelsOf(TABLE)).toEqual(['A'])
    await operator()
    await db.query(`update public.admin_views set ended_at = null, started_at = now() - interval '13 hours' where id = $1`, [VIEW_KEY])
    await become(A, VIEWING)
    expect(await labelsOf(TABLE)).toEqual(['A'])
  })
})

describe('AC-8801.6 관리자 비교 읽기 admin_uis_rows', SLOW, () => {
  /** 비교 시험 줄: HA는 기간 안 넷(앞 끝에 걸친 주·끝 날 포함)과 기간 밖 둘, HB는 안 둘, HC(대기)·HR(거절)은 안 하나씩 */
  async function seedCompare() {
    const W = { v: 1, rows: [{ code: 'carm', name: '가짜 처방', qty: 7, amount: 7000 }], total: 7000 }
    const lines: [string, Row][] = [
      [HA, uis('age', '2026-11-30', '2026-11-30')],
      [HA, uis('rx', '2026-10-26', '2026-11-01', W)],
      [HA, uis('rx', '2026-11-01', '2026-11-30')],
      [HA, uis('rx', DAY, DAY, RX2)],
      [HA, uis('rx', '2026-12-01', '2026-12-01')],
      [HA, uis('age', '2026-10-31', '2026-10-31')],
      [HB, uis('rx', DAY2, DAY2)],
      [HB, uis('age', DAY2, DAY2)],
      [HC, uis('rx', DAY, DAY)],
      [HR, uis('rx', DAY, DAY)],
    ]
    for (const [h, row] of lines) await put(TABLE, { hospital_id: h, ...row })
    return W
  }

  it('AC-8801.6: 함수는 plpgsql · 정의자 · 안정 · search_path 빔 · 답 (hospital_id, row)이고 authenticated만 부른다(PUBLIC·anon 못 부름)', () => {
    const found = fnOf(first, FN)
    expect(found, FN).toBeDefined()
    expect(found?.lang).toBe('plpgsql')
    expect(found?.definer).toBe(true)
    expect(found?.volatile).toBe('s')
    expect(found?.result).toBe('TABLE(hospital_id uuid, "row" jsonb)')
    expect(found?.config).toEqual(['search_path=""'])
    expect(aclHas(found?.acl, 'authenticated')).toBe(true)
    expect(aclHas(found?.acl, 'anon')).toBe(false)
    expect(((found?.acl as string[] | null) ?? []).some((item) => item.startsWith('='))).toBe(false)
  })

  it('AC-8801.6: 관리자가 아니면 42501이다(원장·데스크·대기·거절·병원 없음 — 틀린 인자보다 먼저), anon은 실행 권한이 없다', async () => {
    await seedCompare()
    for (const user of [B, F, K, C, R, E]) {
      await become(user)
      await expect(adminUis('uis_periods', [HA, HB], '2026-11-01', '2026-11-30'), user).rejects.toMatchObject(DENIED)
      await expect(adminUis('clinic_emr', [HA], DAY, DAY), user).rejects.toMatchObject(DENIED)
      await expect(adminUis('nope', [], null, null), user).rejects.toMatchObject(DENIED)
    }
    await become(B, VIEWING)
    await expect(adminUis('uis_periods', [HA], DAY, DAY)).rejects.toMatchObject(DENIED)
    await becomeAnon()
    await expect(adminUis('uis_periods', [HA], DAY, DAY)).rejects.toMatchObject(DENIED)
  })

  it('AC-8801.6: 종류가 uis_periods·clinic_emr 밖이거나 병원이 1~30곳 밖이거나 기간이 틀리면 관리자에게도 22023이다', async () => {
    await become(A)
    const ids = [HA]
    const many = Array.from({ length: 31 }, (_, i) => `20000000-0000-4000-8000-${String(i).padStart(12, '0')}`)
    for (const [kind, hospitals, from, to] of [
      ['stats_days', ids, DAY, DAY],
      ['sales_days', ids, DAY, DAY],
      ['UIS_PERIODS', ids, DAY, DAY],
      ['', ids, DAY, DAY],
      [null, ids, DAY, DAY],
      ['uis_periods', [], DAY, DAY],
      ['uis_periods', many, DAY, DAY],
      ['uis_periods', null, DAY, DAY],
      ['clinic_emr', [], DAY, DAY],
      ['uis_periods', ids, null, DAY],
      ['uis_periods', ids, DAY, null],
      ['uis_periods', ids, DAY2, DAY],
      ['uis_periods', ids, DAY, addDays(DAY, 400)],
      ['clinic_emr', ids, DAY, addDays(DAY, 400)],
    ] as [string | null, string[] | null, string | null, string | null][]) {
      await expect(adminUis(kind, hospitals, from, to), `${kind} ${hospitals?.length} ${from}~${to}`).rejects.toMatchObject(BAD)
    }
    // 끝 − 시작 = 399(400일)·병원 30곳은 된다
    await expect(adminUis('uis_periods', ids, DAY, addDays(DAY, 399))).resolves.toEqual([])
    await expect(adminUis('uis_periods', many.slice(0, 30), DAY, DAY)).resolves.toEqual([])
  })

  it('AC-8801.6: uis_periods는 승인된 의원의 기간과 겹치는 줄 {kind, from_day, to_day, payload}만 (병원, 종류, 시작, 끝) 차례로 준다', async () => {
    const W = await seedCompare()
    await become(A)
    const got = await adminUis('uis_periods', [NOWHERE, HR, HC, HB, HA], '2026-11-01', '2026-11-30')
    expect(got).toEqual([
      { hospital_id: HA, row: { kind: 'age', from_day: '2026-11-30', to_day: '2026-11-30', payload: AGE } },
      { hospital_id: HA, row: { kind: 'rx', from_day: '2026-10-26', to_day: '2026-11-01', payload: W } },
      { hospital_id: HA, row: { kind: 'rx', from_day: '2026-11-01', to_day: '2026-11-30', payload: RX } },
      { hospital_id: HA, row: { kind: 'rx', from_day: DAY, to_day: DAY, payload: RX2 } },
      { hospital_id: HB, row: { kind: 'age', from_day: DAY2, to_day: DAY2, payload: AGE } },
      { hospital_id: HB, row: { kind: 'rx', from_day: DAY2, to_day: DAY2, payload: RX } },
    ])
    // 하루만: 그날을 덮는 주·달 줄도 겹친다
    expect((await adminUis('uis_periods', [HA], '2026-11-01', '2026-11-01')).map((r) => r.row)).toEqual([
      { kind: 'rx', from_day: '2026-10-26', to_day: '2026-11-01', payload: W },
      { kind: 'rx', from_day: '2026-11-01', to_day: '2026-11-30', payload: RX },
    ])
    // 승인되지 않은 병원만 고르면 빈 목록
    expect(await adminUis('uis_periods', [HC, HR, NOWHERE], '2026-11-01', '2026-11-30')).toEqual([])
    // 보는 중이어도(요청 머리) 답은 같다
    await become(A, VIEWING)
    expect(await adminUis('uis_periods', [NOWHERE, HR, HC, HB, HA], '2026-11-01', '2026-11-30')).toEqual(got)
  })

  it('AC-8801.6: clinic_emr은 승인된 의원마다 한 줄 {emr} — 병원 정보 EMR, 줄이 없으면 가입 때 EMR — 를 병원 차례로 준다', async () => {
    await put('clinic_profiles', { hospital_id: HA, hours: SEVEN, emr: 'uisarang' })
    await put('clinic_profiles', { hospital_id: HF, hours: SEVEN, emr: 'bit' })
    await put('clinic_profiles', { hospital_id: HC, hours: SEVEN, emr: 'egis' })
    await become(A)
    expect(await adminUis('clinic_emr', [HF, NOWHERE, HC, HR, HB, HA, HA], DAY, DAY)).toEqual([
      { hospital_id: HA, row: { emr: 'uisarang' } },
      { hospital_id: HB, row: { emr: 'other' } },
      { hospital_id: HF, row: { emr: 'bit' } },
    ])
    // 보는 중이면(lib/storage/clinicProfile readViewedEmr 길) 그 의원 한 줄
    await become(A, VIEWING)
    expect(await adminUis('clinic_emr', [HB], DAY, DAY)).toEqual([{ hospital_id: HB, row: { emr: 'other' } }])
  })
})

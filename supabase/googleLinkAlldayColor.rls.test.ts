import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { addDays, todayInKorea } from '@/lib/analytics/dates'
import { CAL_COLORS } from '@/types/calendar'

// 종일 메모 구글 색 칸 calendar_allday.g_color (google-link REQ-8554 AC-8554.2, design.md 21-13).
// googleLinkOffColor.rls.test.ts와 같은 방법: 진짜 Postgres(PGlite, WASM)에서 운영자가 SQL Editor에 붙일 migration 파일을
// **이 파일보다 앞 migration 모두**(파일 이름 차례, 20261126000000_google_link.sql·20261127000000_google_link_offcolor.sql 포함) → 이 파일 → 이 파일 그대로 돌린다.
// 실제 Supabase에는 붙지 않는다. Supabase가 미리 갖춘 것(역할·auth·storage)만 흉내 내고, 요청 머리(PostgREST의 request.headers)는 set_config로 흉내 낸다.
// 병원·사람·메일·메모·구글 일정 id는 모두 지어낸 것이다
const fileOf = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))
const read = (rel: string) => readFileSync(fileOf(rel), 'utf-8')
const FILE_NAME = '20261127100000_google_link_allday_color.sql'
// 이 파일보다 앞 이름 migration 모두, 파일 이름 차례
const CHAIN_NAMES = readdirSync(fileOf('./migrations/'))
  .filter((name) => name.endsWith('.sql') && name < FILE_NAME)
  .sort()
const PATH = fileOf(`./migrations/${FILE_NAME}`)
// 파일이 아직 없으면 빈 글자로 돌아, 시험마다 '칸이 없다'로 실패한다
const MIGRATION = existsSync(PATH) ? readFileSync(PATH, 'utf-8') : ''
// 주석을 뺀 SQL 글자, 그리고 DO 몸통($$ … $$)까지 뺀 글자(맨 위 문장만 본다)
const SQL = MIGRATION.split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n')
const TOP = SQL.replace(/\$\$[\s\S]*?\$\$/g, "''")
const MEMO_COLORS = [...CAL_COLORS, 'default']

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
const STATUS: Record<string, 'approved' | 'pending'> = { [A]: 'approved', [B]: 'approved', [C]: 'pending' }
const EMAIL: Record<string, string> = {
  [A]: 'a-admin@fake.test',
  [B]: 'b-clinic@fake.test',
  [K]: 'desk-a@fake.test',
  [C]: 'c-clinic@fake.test',
  [E]: 'e-user@fake.test',
}
const VIEW_KEY = '30000000-0000-4000-8000-000000000001' // A가 HB를 보는 보기 줄(운영자가 심음)
const VIEWING = JSON.stringify({ 'x-ssk-view': VIEW_KEY })

type Row = Record<string, unknown>
const SLOW = { timeout: 120_000 }

// 날짜·시각(1년 지우기에 걸리지 않게 한국 오늘 다음 날로 둔다)
const DAY = addDays(todayInKorea(), 1)
const DAY2 = addDays(todayInKorea(), 2)
const AT = '2026-11-20T01:00:00.000Z'
const OLD_US = '2026-01-02T03:04:05.123456Z' // 마이크로초까지 있는 옛 시각(운영자가 트리거 없이 심음)
// 웹앱 꼴 구글 일정 id('ssk' + 32자 16진수)
const EV = (n: number) => `ssk${n.toString(16).padStart(32, '0')}`

// 종일 줄 칸 권한(google-link design.md 7-2 + 21-13 g_color)
const ALLDAY_INSERT = ['day', 'type', 'memo', 'staff_id', 'staff_name', 'g_event_id', 'g_updated', 'g_wait', 'g_color']
const ALLDAY_UPDATE = ['day', 'memo', 'g_event_id', 'g_updated', 'g_wait', 'g_color']

let db: PGlite
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

/** 그 역할로 문장 하나: 'ok <바뀐 줄 수>' 또는 'error <오류 번호>' */
async function tryAs(actor: Actor, sql: string, params: unknown[] = []): Promise<string> {
  await act(actor)
  try {
    const result = await db.query(sql, params)
    return `ok ${result.affectedRows ?? 0}`
  } catch (error) {
    return `error ${(error as { code?: string }).code ?? '?'}`
  } finally {
    await operator()
  }
}

/** 그 역할로 종일 줄 하나 넣기(PostgREST 모양: json 줄을 표 모양으로 풀어 보낸 칸만) */
function insertAs(actor: Actor, row: Row): Promise<string> {
  const columns = Object.keys(row).join(', ')
  return tryAs(actor, `insert into public.calendar_allday (${columns}) select ${columns} from json_populate_record(null::public.calendar_allday, $1::json)`, [
    JSON.stringify(row),
  ])
}

/** 운영자가 종일 줄 하나(RLS·칸 권한을 건너뛴다) → id */
async function seed(hospital: string, row: Row): Promise<string> {
  await operator()
  const columns = ['hospital_id', ...Object.keys(row)].join(', ')
  const [saved] = await rows(
    `insert into public.calendar_allday (${columns}) select ${columns} from json_populate_record(null::public.calendar_allday, $1::json) returning id`,
    [JSON.stringify({ hospital_id: hospital, ...row })],
  )
  return String(saved?.id)
}

/** 운영자가 트리거 없이 g_wait_at을 심는다(PGlite 시계는 밀리초라 마이크로초 값은 이렇게 만든다) */
async function forceWaitAt(id: string, at: string) {
  await operator()
  await db.exec('set session_replication_role = replica')
  try {
    await db.query('update public.calendar_allday set g_wait_at = $2 where id = $1', [id, at])
  } finally {
    await db.exec('set session_replication_role = origin')
  }
}

/** 운영자 눈으로 본 종일 줄 전부(시각은 PostgREST 답과 같은 JSON 글자, 마이크로초까지) */
async function allDayNow() {
  await operator()
  return rows(
    `select id, hospital_id, day::text as day, type, memo, staff_id, staff_name, part, g_event_id,
            to_jsonb(g_updated) #>> '{}' as g_updated, g_wait, to_jsonb(g_wait_at) #>> '{}' as g_wait_at, g_color
       from public.calendar_allday order by id`,
  )
}
const colorOf = async (id: string) => (await allDayNow()).find((r) => r.id === id)?.g_color

/** 사용자·병원·관리자·데스크·보기 줄(운영자). 병원 줄을 따라 종일 줄이 함께 비워진다 */
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

const isNewColumn = (c: Row) => c.table_name === 'calendar_allday' && c.column_name === 'g_color'
const isNewConstraint = (c: Row) => c.conname === 'calendar_allday_g_color'
const newColumnAcl = (shape: Shape) => ((shape.access.find((a) => a.relname === 'calendar_allday')?.columns as string[] | undefined) ?? []).find((x) => x.startsWith('g_color:'))
/** 이 파일이 더하는 것(g_color 칸·그 제약·그 칸 권한)을 뺀 모양 */
const withoutNew = (shape: Shape) => ({
  ...shape,
  columns: shape.columns.filter((c) => !isNewColumn(c)),
  constraints: shape.constraints.filter((c) => !isNewConstraint(c)),
  access: shape.access.map((a) => (a.relname === 'calendar_allday' ? { ...a, columns: (a.columns as string[]).filter((x) => !x.startsWith('g_color:')) } : a)),
})

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

// 시험마다 같은 줄에서 시작한다. 운영자(superuser)는 RLS를 건너뛴다
beforeEach(async () => {
  await resetData()
}, 60_000)

describe('AC-8554.2 파일 · 사슬 · 두 번 실행 · 칸 하나만 더함', SLOW, () => {
  it('AC-8554.2: 시험 사슬은 이 파일보다 앞인 migration 모두(google_link·offcolor 포함)이고, 이 파일이 있으며 줄 끝이 LF이고 머리 주석에 무엇·실행·먼저·두 번·관문·명세 번호가 있다', () => {
    expect(CHAIN_NAMES).toContain('20261126000000_google_link.sql')
    expect(CHAIN_NAMES).toContain('20261127000000_google_link_offcolor.sql')
    expect(CHAIN_NAMES).not.toContain(FILE_NAME)
    expect(MIGRATION).not.toBe('')
    expect(MIGRATION).not.toContain('\r')
    const lines = MIGRATION.split('\n')
    const head = lines.slice(0, lines.findIndex((line) => !/^(--|\s*$)/.test(line))).join('\n')
    for (const word of [
      'calendar_allday',
      'g_color',
      'REQ-8554',
      'AC-8554.2',
      'design.md 21-13',
      '운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다',
      '20261126000000_google_link.sql',
      '두 번 붙여 넣어도 그대로다',
      '이 파일을 먼저 붙여 넣고 그다음 사이트에 올린다',
    ]) {
      expect(head, word).toContain(word)
    }
  })

  it('AC-8554.2: 두 번 돌려도 되는 문장만 쓴다(칸은 if not exists, 제약은 없을 때만, 칸 권한 주기) — 표·정책·트리거·함수·색인·줄은 건드리지 않는다', () => {
    expect(TOP).toMatch(/alter\s+table\s+public\.calendar_allday\s+add\s+column\s+if\s+not\s+exists\s+g_color\s+text\s*;/i)
    expect(SQL).toMatch(
      /if\s+not\s+exists\s*\(\s*select\s+1\s+from\s+pg_constraint\s+where\s+conrelid\s*=\s*'public\.calendar_allday'::regclass\s+and\s+conname\s*=\s*'calendar_allday_g_color'\s*\)/i,
    )
    expect(TOP).toMatch(/grant\s+insert\s*\(\s*g_color\s*\)\s*,\s*update\s*\(\s*g_color\s*\)\s+on\s+table\s+public\.calendar_allday\s+to\s+authenticated\s*;/i)
    expect(TOP).not.toMatch(/\b(create|drop)\s+(or\s+replace\s+)?(table|policy|trigger|index|view|schema|role|function)\b/i)
    expect(TOP).not.toMatch(/^\s*(insert|update|delete|truncate|revoke)\b/im)
    expect(TOP).not.toMatch(/\bgrant\s+(select|delete|all)\b/i)
    expect(TOP).not.toMatch(/\banon\b/i)
  })

  it('AC-8554.2: 붙인 뒤 calendar_allday.g_color 칸(글, 비어도 됨, 기본값 없음)·제약 calendar_allday_g_color·그 칸의 authenticated 넣기·고치기 권한만 더해지고 나머지 모양은 그대로다', () => {
    expect(before.columns.filter(isNewColumn)).toEqual([])
    expect(first.columns.filter(isNewColumn)).toEqual([{ table_name: 'calendar_allday', column_name: 'g_color', data_type: 'text', is_nullable: 'YES', column_default: null }])
    expect(before.constraints.filter(isNewConstraint)).toEqual([])
    expect(first.constraints.filter(isNewConstraint).map((c) => c.tbl)).toEqual(['calendar_allday'])
    // 칸 권한 글: a = INSERT, w = UPDATE (authenticated만, anon 없음)
    expect(newColumnAcl(first)).toMatch(/^g_color:\{authenticated=aw\/[^,}]+\}$/)
    expect(withoutNew(first)).toEqual(before)
  })

  it('AC-8554.2: 두 번 붙여 넣어도 그대로다(모양 전부 같음)', () => {
    expect(first.columns.filter(isNewColumn)).toHaveLength(1)
    expect(second).toEqual(first)
  })

  it("AC-8554.2: 제약은 '비었거나, 메모 줄이고 구글 11색(CAL_COLORS 차례)·default 가운데 하나'다", () => {
    const def = String(first.constraints.find(isNewConstraint)?.def ?? '')
    expect(def).toMatch(/g_color IS NULL/)
    expect(def).toMatch(/type = 'memo'::text/)
    expect([...def.matchAll(/'([a-z]+)'::text/g)].map((m) => m[1])).toEqual(['memo', ...MEMO_COLORS])
    const listed = [...(SQL.match(/g_color\s+in\s*\(([^)]*)\)/i)?.[1] ?? '').matchAll(/'([a-z]+)'/g)].map((m) => m[1])
    expect(listed).toEqual(MEMO_COLORS)
  })

  it('AC-8554.2: 칸 권한 표 — authenticated는 g_color를 넣고 고친다(다른 칸 권한은 그대로), anon은 어느 칸도 넣거나 고치지 못한다', async () => {
    await operator()
    const columns = first.columns.filter((c) => c.table_name === 'calendar_allday').map((c) => String(c.column_name))
    expect(columns).toContain('g_color')
    for (const column of columns) {
      const [privilege] = await rows(
        `select has_column_privilege('authenticated', $1, $2, 'INSERT') as can_insert, has_column_privilege('authenticated', $1, $2, 'UPDATE') as can_update,
                has_column_privilege('anon', $1, $2, 'INSERT') or has_column_privilege('anon', $1, $2, 'UPDATE') as anon_writes`,
        ['public.calendar_allday', column],
      )
      expect(privilege, column).toEqual({ can_insert: ALLDAY_INSERT.includes(column), can_update: ALLDAY_UPDATE.includes(column), anon_writes: false })
    }
  })

  it('AC-8554.2: 줄이 있는 DB에 한 번 더 붙여 넣어도 색·줄은 그대로다', async () => {
    await seed(HA, { day: DAY, type: 'memo', memo: '학회', g_event_id: EV(1), g_color: 'grape' })
    await seed(HA, { day: DAY, type: 'memo', memo: '휴진' })
    await seed(HB, { day: DAY, type: 'off', staff_id: 'st-ga', staff_name: '가' })
    const was = await allDayNow()
    expect(was.map((r) => r.g_color).sort()).toEqual(['grape', null, null])
    await operator()
    await db.exec(MIGRATION)
    expect(await allDayNow()).toEqual(was)
    expect(await shapeOf(db)).toEqual(first)
  })
})

describe('AC-8554.2 누가 넣고 고치나', SLOW, () => {
  it.each(['owner', 'desk'] as const)('AC-8554.2: %s는 자기 병원 메모 줄을 색(11색·default·null)과 함께 넣는다 — 병원은 DB가 정한다', async (actor) => {
    expect(await insertAs(actor, { day: DAY, type: 'memo', memo: '학회', g_event_id: EV(1), g_updated: AT, g_color: 'grape' })).toBe('ok 1')
    expect(await insertAs(actor, { day: DAY, type: 'memo', memo: '휴진', g_event_id: EV(2), g_color: 'default' })).toBe('ok 1')
    expect(await insertAs(actor, { day: DAY, type: 'memo', memo: '웹앱 메모', g_color: null })).toBe('ok 1')
    expect(await insertAs(actor, { day: DAY2, type: 'memo', memo: '색 칸 없음' })).toBe('ok 1')
    const now = await allDayNow()
    expect(now.map((r) => r.hospital_id)).toEqual([HA, HA, HA, HA])
    expect(Object.fromEntries(now.map((r) => [r.memo, r.g_color]))).toEqual({ 학회: 'grape', 휴진: 'default', '웹앱 메모': null, '색 칸 없음': null })
  })

  it.each(['owner', 'desk'] as const)(
    'AC-8554.2: %s가 자기 병원 메모 줄의 색만 고치면 그 칸만 바뀌고 g_wait·g_wait_at·g_updated·날짜·메모는 그대로다',
    async (actor) => {
      const waiting = await seed(HA, { day: DAY, type: 'memo', memo: '학회', g_event_id: EV(3), g_updated: AT, g_wait: true })
      await forceWaitAt(waiting, OLD_US)
      const sent = await seed(HA, { day: DAY, type: 'memo', memo: '휴진', g_event_id: EV(4), g_updated: AT, g_wait: false })
      const was = await allDayNow()
      expect(was.find((r) => r.id === waiting)?.g_wait_at).toMatch(/\.123456/)
      expect(await tryAs(actor, `update public.calendar_allday set g_color = 'grape' where id = $1`, [waiting])).toBe('ok 1')
      // 색 채우기 꼴(아직 비었을 때만): 처음은 1줄, 이미 색이 있으면 0줄
      expect(await tryAs(actor, `update public.calendar_allday set g_color = 'default' where id = $1 and g_color is null`, [sent])).toBe('ok 1')
      expect(await tryAs(actor, `update public.calendar_allday set g_color = 'tomato' where id = $1 and g_color is null`, [sent])).toBe('ok 0')
      expect(await allDayNow()).toEqual(
        was.map((r) => (r.id === waiting ? { ...r, g_color: 'grape' } : r.id === sent ? { ...r, g_color: 'default' } : r)),
      )
      // 색을 비울 수도 있다
      expect(await tryAs(actor, `update public.calendar_allday set g_color = null where id = $1`, [waiting])).toBe('ok 1')
      expect(await allDayNow()).toEqual(was.map((r) => (r.id === sent ? { ...r, g_color: 'default' } : r)))
    },
  )

  it('AC-8554.2: 다른 병원 원장이 이 병원 메모 줄 색을 고치면 0줄이고 그대로다(자기 병원 줄만 고친다)', async () => {
    const mine = await seed(HA, { day: DAY, type: 'memo', memo: '학회', g_event_id: EV(5) })
    const theirs = await seed(HB, { day: DAY, type: 'memo', memo: '학회', g_event_id: EV(5) })
    expect(await tryAs('other', `update public.calendar_allday set g_color = 'grape' where id = $1`, [mine])).toBe('ok 0')
    expect(await tryAs('other', `update public.calendar_allday set g_color = 'grape'`)).toBe('ok 1')
    expect(await colorOf(mine)).toBeNull()
    expect(await colorOf(theirs)).toBe('grape')
  })

  it.each(['pending', 'none', 'viewer'] as const)('AC-8554.2: %s 사용자(승인 전·병원 없음·다른 의원 보기 중)는 색을 넣지도(42501) 고치지도(0줄) 못한다', async (actor) => {
    const ha = await seed(HA, { day: DAY, type: 'memo', memo: '학회', g_event_id: EV(6) })
    const hb = await seed(HB, { day: DAY, type: 'memo', memo: '학회', g_event_id: EV(6) })
    const was = await allDayNow()
    expect(await tryAs(actor, `update public.calendar_allday set g_color = 'grape'`)).toBe('ok 0')
    expect(await tryAs(actor, `update public.calendar_allday set g_color = 'grape' where id in ($1, $2)`, [ha, hb])).toBe('ok 0')
    expect(await insertAs(actor, { day: DAY, type: 'memo', memo: '학회', g_color: 'grape' })).toBe('error 42501')
    expect(await allDayNow()).toEqual(was)
  })

  it('AC-8554.2: 로그인 안 한 사용자(anon)는 색을 읽지도 넣지도 고치지도 못한다(42501)', async () => {
    const ha = await seed(HA, { day: DAY, type: 'memo', memo: '학회', g_event_id: EV(7), g_color: 'grape' })
    const was = await allDayNow()
    expect(await tryAs('anon', `select g_color from public.calendar_allday`)).toBe('error 42501')
    expect(await tryAs('anon', `update public.calendar_allday set g_color = 'tomato' where id = $1`, [ha])).toBe('error 42501')
    expect(await insertAs('anon', { day: DAY, type: 'memo', memo: '학회', g_color: 'grape' })).toBe('error 42501')
    expect(await allDayNow()).toEqual(was)
  })

  it.each([
    ['옛 색 이름', 'red'],
    ['대문자', 'Grape'],
    ['colorId 글', '3'],
    ['빈 글자', ''],
    ['앞뒤 빈칸', ' grape'],
    ['default 대문자', 'Default'],
  ])('AC-8554.2: 구글 11색·default 밖(%s)은 넣기·고치기 모두 거절하고(23514) 그대로 둔다', async (_name, color) => {
    const memo = await seed(HA, { day: DAY, type: 'memo', memo: '학회', g_event_id: EV(8), g_color: 'sage' })
    expect(await insertAs('owner', { day: DAY, type: 'memo', memo: '휴진', g_color: color })).toBe('error 23514')
    expect(await tryAs('desk', `update public.calendar_allday set g_color = $2 where id = $1`, [memo, color])).toBe('error 23514')
    expect((await allDayNow()).map((r) => [r.id, r.g_color])).toEqual([[memo, 'sage']])
  })

  it('AC-8554.2: 11색과 default는 모두 메모 줄에 넣고 고칠 수 있다', async () => {
    const memo = await seed(HA, { day: DAY, type: 'memo', memo: '학회', g_event_id: EV(9) })
    for (const [i, color] of MEMO_COLORS.entries()) {
      expect(await tryAs('owner', `update public.calendar_allday set g_color = $2 where id = $1`, [memo, color]), color).toBe('ok 1')
      expect(await colorOf(memo), color).toBe(color)
      expect(await insertAs('desk', { day: DAY2, type: 'memo', memo: `메모${i}`, g_color: color }), color).toBe('ok 1')
    }
  })

  it('AC-8554.2: off 줄의 색은 넣기·고치기 모두 거절하고(23514, default도) 색 없는 off 줄은 지금처럼 넣는다', async () => {
    for (const color of ['grape', 'default']) {
      expect(await insertAs('owner', { day: DAY, type: 'off', staff_id: 'st-ga', staff_name: '가', g_color: color }), color).toBe('error 23514')
    }
    expect(await insertAs('owner', { day: DAY, type: 'off', staff_id: 'st-ga', staff_name: '가' })).toBe('ok 1')
    const [off] = await allDayNow()
    expect(off).toMatchObject({ type: 'off', g_color: null })
    for (const color of ['grape', 'default']) {
      expect(await tryAs('desk', `update public.calendar_allday set g_color = $2 where id = $1`, [off?.id, color]), color).toBe('error 23514')
    }
    expect(await colorOf(String(off?.id))).toBeNull()
  })
})

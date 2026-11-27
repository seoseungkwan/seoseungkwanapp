import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { CAL_COLORS } from '@/types/calendar'

// 휴무 줄 색 따라가기 DB 함수 gcal_set_off_color(p_color) (google-link REQ-8547 AC-8547.4, design.md 21-5).
// googleLink.rls.test.ts와 같은 방법: 진짜 Postgres(PGlite, WASM)에서 운영자가 SQL Editor에 붙일 migration 파일을
// **이 파일보다 앞 migration 모두**(파일 이름 차례, 20261126000000_google_link.sql 포함) → 이 파일 → 이 파일 그대로 돌린다. 실제 Supabase에는 붙지 않는다.
// Supabase가 미리 갖춘 것(역할·auth·storage)만 흉내 내고, 요청 머리(PostgREST의 request.headers)는 set_config로 흉내 낸다.
// 병원·사람·메일·구글 캘린더 id·비밀 글자는 모두 지어낸 것이다
const fileOf = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))
const read = (rel: string) => readFileSync(fileOf(rel), 'utf-8')
const FILE_NAME = '20261127000000_google_link_offcolor.sql'
// 이 파일보다 앞 이름 migration 모두, 파일 이름 차례
const CHAIN_NAMES = readdirSync(fileOf('./migrations/'))
  .filter((name) => name.endsWith('.sql') && name < FILE_NAME)
  .sort()
const PATH = fileOf(`./migrations/${FILE_NAME}`)
// 파일이 아직 없으면 빈 글자로 돌아, 시험마다 '함수가 없다'로 실패한다
const MIGRATION = existsSync(PATH) ? readFileSync(PATH, 'utf-8') : ''
// 주석을 뺀 SQL 글자, 그리고 함수 몸통($$ … $$)까지 뺀 글자(맨 위 문장만 본다)
const SQL = MIGRATION.split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n')
const TOP = SQL.replace(/\$\$[\s\S]*?\$\$/g, "''")
const FN = 'gcal_set_off_color(text)'

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
const HB = hospitalOf(B) // 승인 대기 병원(C)은 hospitalOf(C) — 연결 줄을 두지 않는다
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

// 병원마다 구글 연결 한 줄(지어낸 주소·비밀 글자·캘린더)
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbFAKEFAKEFAKE_0123456789-abc/exec'
const SECRET = 'fake-secret-0123456789-ABCDEFGHIJKLMNOPQRSTUVWXYZ_x'
const RULES = { pullMin: 2, onGoogleDelete: 'cancel', arrival: 'off', offAllStaff: true }
const LOOK = {
  cancel: 'tomato',
  change: 'graphite',
  offWord: 'off',
  offColor: 'banana',
  noKind: 'fix',
  staffByColor: true,
  noStaffKinds: [],
  titleLen: true,
  titleMemo: true,
}
const LINK: Row = {
  script_url: SCRIPT_URL,
  secret: SECRET,
  calendar_id: 'cal-1@group.calendar.google.com',
  calendar_name: '예약',
  default_hex: '#4285F4',
  linked_on: '2026-11-23',
  rules: RULES,
  look: LOOK,
}
const B_LOOK = { ...LOOK, offColor: 'peacock' }

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

/** 지금 역할로 함수를 부른 결과: 'true'·'false' 또는 'error <오류 번호>' */
async function callAs(actor: Actor, color: string | null): Promise<string> {
  await act(actor)
  try {
    const [row] = await rows(`select public.gcal_set_off_color($1::text) as ok`, [color])
    return String(row?.ok)
  } catch (error) {
    return `error ${(error as { code?: string }).code ?? '?'}`
  } finally {
    await operator()
  }
}

/** 운영자 눈으로 본 병원마다 연결 줄(updated_at 빼고) */
async function linksNow() {
  await operator()
  return rows(
    `select hospital_id, script_url, secret, calendar_id, calendar_name, default_hex, linked_on::text as linked_on, rules, look
       from public.gcal_links order by hospital_id`,
  )
}
const lookOf = async (hospital: string) => (await linksNow()).find((r) => r.hospital_id === hospital)?.look

/** 사용자·병원·관리자·데스크·보기 줄(운영자) + HA·HB 구글 연결 줄. 병원 줄을 따라 표 줄이 함께 비워진다 */
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
  for (const [hospital, look] of [
    [HA, LOOK],
    [HB, B_LOOK],
  ] as const) {
    await db.query(
      `insert into public.gcal_links (hospital_id, script_url, secret, calendar_id, calendar_name, default_hex, linked_on, rules, look)
       values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb)`,
      [hospital, LINK.script_url, LINK.secret, LINK.calendar_id, LINK.calendar_name, LINK.default_hex, LINK.linked_on, JSON.stringify(RULES), JSON.stringify(look)],
    )
  }
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
const fnOf = (shape: Shape, fn: string) => shape.functions.find((f) => bare(f.fn) === fn)
const runsAs = (acl: unknown, role: string) => ((acl as string[] | null) ?? []).some((item) => item.startsWith(`${role}=`) && /=[^/]*X/.test(item))
const without = (shape: Shape, fn: string) => ({ ...shape, functions: shape.functions.filter((f) => bare(f.fn) !== fn) })

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

describe('AC-8547.4 파일 · 사슬 · 두 번 실행 · 함수 하나만 더함', SLOW, () => {
  it('AC-8547.4: 시험 사슬은 이 파일보다 앞인 migration 모두(20261126000000_google_link.sql 포함)이고, 이 파일이 있으며 줄 끝이 LF이고 머리 주석에 무엇·실행·먼저·두 번·관문·명세 번호가 있다', () => {
    expect(CHAIN_NAMES).toContain('20261126000000_google_link.sql')
    expect(CHAIN_NAMES).toContain('20261124000000_admin_view.sql')
    expect(CHAIN_NAMES).not.toContain(FILE_NAME)
    expect(MIGRATION).not.toBe('')
    expect(MIGRATION).not.toContain('\r')
    const lines = MIGRATION.split('\n')
    const head = lines.slice(0, lines.findIndex((line) => !/^(--|\s*$)/.test(line))).join('\n')
    for (const word of [
      'gcal_set_off_color',
      'REQ-8547',
      'design.md 21-5',
      '운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다',
      '20261126000000_google_link.sql',
      '두 번 붙여 넣어도 그대로다',
      '이 파일을 먼저 붙여 넣고 그다음 사이트에 올린다',
    ]) {
      expect(head, word).toContain(word)
    }
  })

  it('AC-8547.4: 두 번 돌려도 되는 문장만 쓴다(함수는 or replace, 권한은 거두고 다시) — 표·칸·정책·트리거·색인·줄은 건드리지 않는다', () => {
    expect(TOP).toMatch(/create\s+or\s+replace\s+function\s+public\.gcal_set_off_color\s*\(\s*p_color\s+text\s*\)/i)
    expect(TOP).not.toMatch(/create\s+function/i)
    expect(TOP).not.toMatch(/\b(create|alter|drop)\s+(table|policy|trigger|index|view|schema|role)\b/i)
    expect(TOP).not.toMatch(/^\s*(insert|update|delete|truncate)\b/im)
    expect(TOP).toMatch(/revoke\s+all\s+on\s+function\s+public\.gcal_set_off_color\(text\)\s+from\s+public,\s*anon,\s*authenticated/i)
    expect(TOP).toMatch(/grant\s+execute\s+on\s+function\s+public\.gcal_set_off_color\(text\)\s+to\s+authenticated/i)
  })

  it('AC-8547.4: 붙인 뒤 public 표·칸·제약·권한·색인·정책·트리거와 다른 함수는 그대로이고 함수 gcal_set_off_color(text) 하나만 더해진다', () => {
    expect(fnOf(before, FN)).toBeUndefined()
    expect(fnOf(first, FN)).toBeDefined()
    expect(without(first, FN)).toEqual(before)
  })

  it('AC-8547.4: 두 번 붙여 넣어도 그대로다(모양 전부 같음)', () => {
    expect(second).toEqual(first)
  })

  it("AC-8547.4: 정의자 함수 · search_path 빈 값 · plpgsql · 참거짓 답 · public·anon 실행 없음, authenticated만 실행", () => {
    const f = fnOf(first, FN)
    expect(f).toMatchObject({ definer: true, config: ['search_path=""'], lang: 'plpgsql', result: 'boolean', volatile: 'v' })
    expect(runsAs(f?.acl, 'authenticated')).toBe(true)
    expect(runsAs(f?.acl, 'anon')).toBe(false)
    expect(runsAs(f?.acl, '')).toBe(false)
  })

  it('AC-8547.4: 받는 11색은 CAL_COLORS(구글 11색)와 같다', () => {
    const listed = [...(SQL.match(/not\s+in\s*\(([^)]*)\)/i)?.[1] ?? '').matchAll(/'([a-z]+)'/g)].map((m) => m[1])
    expect(listed).toEqual([...CAL_COLORS])
  })
})

describe('AC-8547.4 누가 부르면 무엇이 바뀌나', SLOW, () => {
  it('AC-8547.4: 원장이 부르면 참이고 그 병원 look.offColor만 바뀐다(다른 look 칸·rules·secret·다른 칸 그대로, 다른 병원 줄 그대로)', async () => {
    const was = await linksNow()
    expect(await callAs('owner', 'grape')).toBe('true')
    const now = await linksNow()
    expect(now).toEqual(was.map((r) => (r.hospital_id === HA ? { ...r, look: { ...LOOK, offColor: 'grape' } } : r)))
  })

  it('AC-8547.4: 데스크가 부르면 참이고 자기 병원(my_clinic_hospital_id()) 줄의 offColor만 바뀐다', async () => {
    const was = await linksNow()
    expect(await callAs('desk', 'sage')).toBe('true')
    expect(await linksNow()).toEqual(was.map((r) => (r.hospital_id === HA ? { ...r, look: { ...LOOK, offColor: 'sage' } } : r)))
  })

  it('AC-8547.4: 다른 병원 사용자가 불러도 이 병원 줄은 그대로다(자기 병원 줄만 바뀜)', async () => {
    expect(await callAs('other', 'basil')).toBe('true')
    expect(await lookOf(HA)).toEqual(LOOK)
    expect(await lookOf(HB)).toEqual({ ...B_LOOK, offColor: 'basil' })
  })

  it.each(['pending', 'none'] as const)('AC-8547.4: %s 사용자(승인 전·병원 없음)는 거짓이고 아무 줄도 바뀌지 않는다', async (actor) => {
    const was = await linksNow()
    expect(await callAs(actor, 'grape')).toBe('false')
    expect(await linksNow()).toEqual(was)
  })

  it('AC-8547.4: 로그인 안 한 사용자(anon)는 부를 수 없다(42501)', async () => {
    const was = await linksNow()
    expect(await callAs('anon', 'grape')).toBe('error 42501')
    expect(await linksNow()).toEqual(was)
  })

  it("AC-8547.4: 관리자가 '다른 의원 보기' 중(요청 머리)이면 거짓이고 보는 의원·자기 병원 줄 모두 그대로다", async () => {
    const was = await linksNow()
    expect(await callAs('viewer', 'grape')).toBe('false')
    expect(await linksNow()).toEqual(was)
    // 머리가 없으면 관리자도 자기 병원 원장으로 바꾼다
    expect(await callAs('owner', 'grape')).toBe('true')
  })

  it.each<[string, string | null]>([
    ['옛 색 이름', 'red'],
    ['대문자', 'Grape'],
    ['colorId 글', '3'],
    ['캘린더 기본 색', 'default'],
    ['빈 글자', ''],
    ['앞뒤 빈칸', ' grape'],
    ['null', null],
  ])('AC-8547.4: 구글 11색 이름 밖(%s)은 거절하고(22023) 아무것도 바꾸지 않는다', async (_name, color) => {
    const was = await linksNow()
    expect(await callAs('owner', color)).toBe('error 22023')
    expect(await linksNow()).toEqual(was)
  })

  it('AC-8547.4: 구글 11색은 모두 받는다', async () => {
    for (const color of CAL_COLORS) {
      expect(await callAs('desk', color), color).toBe('true')
      expect(((await lookOf(HA)) as Row).offColor, color).toBe(color)
    }
  })

  it('AC-8547.4: 연결 줄의 look이 비어 있으면(아직 보이기를 저장하지 않음) 거짓이고 그대로 둔다', async () => {
    await operator()
    await db.query('update public.gcal_links set look = null where hospital_id = $1', [HA])
    expect(await callAs('owner', 'grape')).toBe('false')
    expect(await lookOf(HA)).toBeNull()
  })

  it('AC-8547.4: 고친 시각(updated_at)은 지금 트리거가 적는다', async () => {
    // 운영자가 트리거 없이 옛 시각을 심는다
    await operator()
    await db.exec('set session_replication_role = replica')
    try {
      await db.query(`update public.gcal_links set updated_at = '2026-01-01T00:00:00Z' where hospital_id = $1`, [HA])
    } finally {
      await db.exec('set session_replication_role = origin')
    }
    expect(await callAs('owner', 'grape')).toBe('true')
    await operator()
    const [row] = await rows(`select updated_at > '2026-01-02T00:00:00Z'::timestamptz as touched from public.gcal_links where hospital_id = $1`, [HA])
    expect(row.touched).toBe(true)
  })
})

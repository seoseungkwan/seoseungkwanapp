import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

// 자료실 표 library_files · 비공개 바구니 library와 그 권한 (spec library REQ-8101, design.md 'SQL'·'시험', ADR-051).
// deskInstallFiles.rls.test.ts와 같은 방법: 진짜 Postgres(PGlite, WASM)에서 운영자가 SQL 편집기에 붙일 파일을 차례로 그대로 돌린다 —
// desk_accounts 앞 migration → install_files → desk_accounts → desk_install_files → multi_admin(tab_access, AC-8101.6이 견줌) → 이 파일(두 번).
// 실제 Supabase에는 붙지 않는다. Supabase가 미리 갖춘 것(역할·auth 스키마·새 표·함수의 기본 권한, storage 스키마의 버킷 표·objects 표·RLS·권한)만 흉내 낸다.
// 메일·파일은 모두 지어낸 것이다
const fileOf = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))
const read = (rel: string) => readFileSync(fileOf(rel), 'utf-8')
const readRepo = (rel: string) => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), 'utf-8')
// deskInstallFiles.rls.test.ts의 사슬(데스크 파일이 기대는 것) + 옛 설치 파일 두 파일
const BEFORE = [
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
  '20261117000000_install_files.sql',
  '20261118100000_desk_accounts.sql',
  '20261119200000_desk_install_files.sql',
].map((name) => read(`./migrations/${name}`))
// tab_access를 만드는 파일(사람 줄이 먼저 있어야 돈다 — 주 관리자 후보 하나)
const MULTI_ADMIN = read('./migrations/20261122000000_multi_admin.sql')
const FILE_NAME = '20261125000000_library.sql'
const THIS_PATH = fileOf(`./migrations/${FILE_NAME}`)
// 파일이 아직 없으면 빈 글자로 돌아, 시험마다 '표·바구니·규칙이 없다'로 실패한다(무엇이 빠졌는지 시험별로 보인다)
const THIS_MIGRATION = existsSync(THIS_PATH) ? readFileSync(THIS_PATH, 'utf-8') : ''
// 주석을 뺀 SQL 글자(머리 주석이 설명으로 다른 낱말을 말할 수 있다)
const THIS_SQL = THIS_MIGRATION.split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n')

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
    raw_app_meta_data jsonb not null default '{}',
    email_confirmed_at timestamptz,
    last_sign_in_at timestamptz
  );
  create function auth.jwt() returns jsonb language sql stable
    as $$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
`

// Supabase Storage가 미리 갖춘 것(deskInstallFiles.rls.test.ts와 같다). RLS는 켜져 있고 anon·authenticated는 표 권한이 모두 있다(막는 것은 정책뿐)
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
  -- 다른 기능의 버킷(새 규칙이 여기에는 아무것도 열지 않는지 보려고)
  insert into storage.buckets (id, name) values ('other-bucket', 'other-bucket');
`

// 사람 여덟: 일곱 계정 + anon
const ADMIN = '00000000-0000-4000-8000-0000000000a1' // 관리자: 승인된 의원 원장 + admins 줄(구글로 들어옴 — multi_admin.sql이 주 관리자로 고른다)
const A = '00000000-0000-4000-8000-00000000000a' // 승인된 의원 원장(관리자 아님)
const K = '00000000-0000-4000-8000-0000000000d1' // 승인된 의원 A의 데스크(병원 줄 없음)
const C = '00000000-0000-4000-8000-00000000000c' // 승인 대기 의원 원장
const M = '00000000-0000-4000-8000-0000000000d3' // 대기 의원 C의 데스크
const D = '00000000-0000-4000-8000-00000000000d' // 거절된 의원 원장
const E = '00000000-0000-4000-8000-00000000000e' // 병원 줄도 데스크 줄도 없는 사용자
const USERS = [ADMIN, A, K, C, M, D, E]
const STATUS: Record<string, string> = { [ADMIN]: 'approved', [A]: 'approved', [C]: 'pending', [D]: 'rejected' }
const DESK_OF: Record<string, string> = { [K]: A, [M]: C } // 데스크 → 그 의원 원장
const emailOf = (user: string) => (DESK_OF[user] ? `desk-${user.slice(-2)}@fake.test` : `${user.slice(-2)}@fake.test`)

type Row = Record<string, unknown>

const BUCKET = 'library'
const INSTALL_BUCKET = 'install-files'
const OTHER_BUCKET = 'other-bucket'
const MAX_BYTES = 52_428_800
// 정책 이름은 Postgres 이름 한도 63바이트 안이어야 잘리지 않는다('…사용자·데스크·관리자'는 66바이트라 '원장'으로 줄임)
const TABLE_READ = '자료실 목록 읽기(승인된 원장·데스크·관리자)'
const TABLE_INSERT = '자료실 목록 넣기(관리자)'
const TABLE_DELETE = '자료실 목록 지우기(관리자)'
const FILE_READ = '자료실 파일 읽기(승인된 원장·데스크·관리자)'
const FILE_UPLOAD = '자료실 파일 올리기(관리자)'
const FILE_DELETE = '자료실 파일 지우기(관리자)'
const NEW_POLICIES = [TABLE_READ, TABLE_INSERT, TABLE_DELETE, FILE_READ, FILE_UPLOAD, FILE_DELETE]
const SLOW = { timeout: 60_000 }
const DENIED = { code: '42501' } // 권한 없음 · 행 보안 규칙에 걸림
const CHECK_FAILED = { code: '23514' }
const NOT_NULL = { code: '23502' }
const UNIQUE_FAILED = { code: '23505' }

// 바구니 안 이름(uuid 모양, 폴더 없음)
const P1 = '11111111-1111-4111-8111-111111111111'
const P2 = '22222222-2222-4222-8222-222222222222'
const P3 = '33333333-3333-4333-8333-333333333333'
const P4 = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
type FileRow = {
  file_name: string
  name: string
  category: string | null
  description?: string
  storage_path: string
  size: number
  uploaded_by?: string | null
}
const FILES: FileRow[] = [
  { file_name: 'precheck-helper-0.14.0.zip', name: 'precheck-helper-0.14.0.zip', category: 'install', description: '청구 도우미 · 비트 자료를 읽는 PC 프로그램', storage_path: P1, size: 1_258_291 },
  { file_name: '자료실 사용 설명서.pdf', name: '자료실 사용 설명서', category: 'guide', description: '', storage_path: P2, size: 655_360 },
  { file_name: 'notes.txt', name: '메모', category: 'other', description: '', storage_path: P3, size: 0 },
]
const FILE_NAMES = FILES.map((f) => f.file_name) // 바구니 이름(storage_path) 차례
const PATHS = FILES.map((f) => f.storage_path)
const NEW_FILE: FileRow = { file_name: 'precheck-extension-0.4.0.zip', name: '크롬 확장', category: 'install', description: '크롬 확장 · 크롬에 붙이는 작은 프로그램', storage_path: P4, size: MAX_BYTES }

let db: PGlite // 흉내 → 앞 migration → 사람 줄 → multi_admin → 이 파일(두 번)
type Schema = Awaited<ReturnType<typeof schemaOf>>
let beforeThis: Schema // 이 파일을 돌리기 전
let afterOnce: Schema // 한 번 돌린 뒤
let afterThis: Schema // 두 번 돌린 뒤

async function operator() {
  await db.exec('reset role; reset request.jwt.claims')
}

/** 그 사용자로 로그인한 것처럼(JWT의 sub·email — 데스크는 로그인 메일로 맞춘다) */
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

/** 운영자(superuser, RLS를 건너뜀)가 사용자·의원·데스크 줄·관리자를 넣는다 */
async function seedPeople() {
  await operator()
  for (const user of USERS) {
    const provider = user === ADMIN ? 'google' : 'email'
    await db.query('insert into auth.users (id, email, raw_app_meta_data) values ($1, $2, $3)', [
      user,
      emailOf(user),
      JSON.stringify({ provider, providers: [provider] }),
    ])
  }
  const hospital: Record<string, string> = {}
  for (const [user, status] of Object.entries(STATUS)) {
    const [row] = await rows(
      `insert into public.hospitals (owner_id, name, applicant_name, email, status)
       values ($1, '가짜의원', '가짜신청자', $2, $3) returning id`,
      [user, emailOf(user), status],
    )
    hospital[user] = row.id as string
  }
  for (const [desk, owner] of Object.entries(DESK_OF)) {
    await db.query('insert into public.hospital_members (hospital_id, email) values ($1, $2)', [hospital[owner], emailOf(desk)])
  }
  await db.query('insert into public.admins (user_id) values ($1)', [ADMIN])
}

async function setUp() {
  await db.exec(SUPABASE_MOCK)
  await db.exec(STORAGE_MOCK)
  for (const sql of BEFORE) await db.exec(sql)
  await seedPeople()
  await db.exec(MULTI_ADMIN)
}

// 시험마다 사람 줄을 새로 넣는다(의원·데스크·관리자·자료실 줄은 auth.users를 따라 함께 비워진다)
async function resetData() {
  await operator()
  await db.exec('truncate auth.users cascade')
  await db.exec('truncate storage.objects')
  await seedPeople()
}

// 다른 것이 그대로인지 보려고 public 표(RLS·권한)·함수(정의·권한)·정책(모양 전부)·storage 권한·RLS·버킷과 tab_access·hospitals·admins 줄을 모은다
async function schemaOf() {
  const q = async (sql: string) => (await db.query<Row>(sql)).rows
  return {
    tables: await q(
      `select c.relname, c.relrowsecurity, (select array_agg(item::text order by item::text) from unnest(c.relacl) item) as acl
       from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' order by 1`,
    ),
    functions: await q(
      `select p.oid::regprocedure::text as fn, pg_get_functiondef(p.oid) as def, coalesce(p.proacl::text, '') as acl
       from pg_proc p where p.pronamespace in ('public'::regnamespace, 'storage'::regnamespace) order by 1`,
    ),
    policies: await q(
      `select schemaname, tablename, policyname, cmd, permissive, roles::text as roles, qual, with_check from pg_policies
       order by 1, 2, 3`,
    ),
    storageGrants: await q(
      `select table_name, grantee, privilege_type from information_schema.role_table_grants
       where table_schema = 'storage' order by 1, 2, 3`,
    ),
    storageRls: await q(
      `select relname, relrowsecurity, relforcerowsecurity from pg_class
       where relnamespace = 'storage'::regnamespace and relkind = 'r' order by 1`,
    ),
    buckets: await q(`select id, name, public, file_size_limit, allowed_mime_types from storage.buckets order by id`),
    tabAccess: await q(`select * from public.tab_access order by path`),
    hospitals: await q(`select * from public.hospitals order by id`),
    admins: await q(`select * from public.admins order by user_id`),
  }
}

/** 지금 역할로 자료실 줄을 넣는다(uploaded_by를 빼면 기본값) */
async function insertRow(row: FileRow) {
  const cols = Object.keys(row)
  return rows(
    `insert into public.library_files (${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')})
     returning file_name, uploaded_by`,
    Object.values(row),
  )
}

// 운영자가 파일 줄을 넣는다(Storage API가 하는 일을 흉내, 정책을 건너뛴다)
async function seedObject(name: string, bucket = BUCKET) {
  await operator()
  await rows(`insert into storage.objects (bucket_id, name, metadata) values ($1, $2, '{"size": 1}'::jsonb)`, [bucket, name])
}

// 운영자가 자료실 줄 셋·바구니 파일 셋과 다른 두 바구니의 파일을 넣는다
async function seedLibrary() {
  await operator()
  for (const f of FILES) {
    await rows(
      `insert into public.library_files (file_name, name, category, description, storage_path, size, uploaded_by)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [f.file_name, f.name, f.category, f.description, f.storage_path, f.size, ADMIN],
    )
    await seedObject(f.storage_path)
  }
  await seedObject(P1, OTHER_BUCKET)
  await seedObject('helper/precheck-helper-0.12.0.zip', INSTALL_BUCKET)
}

// 지금 역할로 파일을 올린다(Storage API의 upload, upsert 없음)
const upload = (name: string, bucket = BUCKET) =>
  rows(`insert into storage.objects (bucket_id, name) values ($1, $2) returning bucket_id, name, owner`, [bucket, name])

// 지금 역할로 본 자료실 줄(바구니 이름 차례) · 바구니 파일
const listed = async () => (await rows(`select file_name from public.library_files order by storage_path`)).map((r) => r.file_name)
const stored = async () => (await rows(`select name from storage.objects where bucket_id = $1 order by name`, [BUCKET])).map((r) => r.name)
// 운영자 눈으로 본 전부(바뀌지 않았는지 견줄 때)
async function everything() {
  await operator()
  return {
    files: await rows(`select * from public.library_files order by storage_path`),
    objects: await rows(`select bucket_id, name, owner, metadata from storage.objects order by bucket_id, name`),
  }
}

const policiesOf = (schema: Schema, schemaname: string, tablename: string) =>
  schema.policies
    .filter((p) => p.schemaname === schemaname && p.tablename === tablename)
    .map((p) => [p.cmd, p.policyname] as [string, string])
    .sort((x, y) => (x[1] < y[1] ? -1 : 1))
const policy = (name: string) => afterThis.policies.find((p) => p.policyname === name)

beforeAll(async () => {
  db = await PGlite.create()
  await setUp()
  beforeThis = await schemaOf()
  await db.exec(THIS_MIGRATION)
  afterOnce = await schemaOf()
  await db.exec(THIS_MIGRATION)
  afterThis = await schemaOf()
}, 120_000)

afterAll(async () => {
  await db.close()
})

beforeEach(resetData, 60_000)

describe('AC-8101.1 표·바구니·권한 · 두 번 실행', SLOW, () => {
  it('AC-8101.1: 비공개 바구니 library가 있고 한 파일 52,428,800바이트·파일 형식 제한 없음(null)이다', async () => {
    await operator()
    expect(await rows(`select id, name, public, file_size_limit, allowed_mime_types from storage.buckets where id = $1`, [BUCKET])).toEqual([
      { id: BUCKET, name: BUCKET, public: false, file_size_limit: MAX_BYTES, allowed_mime_types: null },
    ])
  })

  it('AC-8101.1: 표 library_files의 칸(모양·빈칸 허용·기본값)이 design.md 그대로이고 RLS가 켜져 있다', async () => {
    await operator()
    expect(
      (
        await rows(
          `select column_name, data_type, is_nullable, column_default from information_schema.columns
           where table_schema = 'public' and table_name = 'library_files' order by ordinal_position`,
        )
      ).map((c) => [c.column_name, c.data_type, c.is_nullable, c.column_default]),
    ).toEqual([
      ['id', 'uuid', 'NO', 'gen_random_uuid()'],
      ['file_name', 'text', 'NO', null],
      ['name', 'text', 'NO', null],
      ['category', 'text', 'NO', null],
      ['description', 'text', 'NO', "''::text"],
      ['storage_path', 'text', 'NO', null],
      ['size', 'bigint', 'NO', null],
      ['uploaded_by', 'uuid', 'YES', 'auth.uid()'],
      ['created_at', 'timestamp with time zone', 'NO', 'now()'],
    ])
    expect(afterThis.tables.find((t) => t.relname === 'library_files')?.relrowsecurity).toBe(true)
    // hospital_id가 없다(모든 의원이 같은 한 벌)
    expect(await rows(`select 1 from information_schema.columns where table_schema = 'public' and table_name = 'library_files' and column_name = 'hospital_id'`)).toEqual([])
  })

  it('AC-8101.1: 표 권한은 anon 없음 · authenticated는 select·insert·delete뿐(update·칸 권한 없음)이다', async () => {
    await operator()
    expect(
      await rows(
        `select grantee, privilege_type from information_schema.role_table_grants
         where table_schema = 'public' and table_name = 'library_files' and grantee in ('PUBLIC', 'anon', 'authenticated') order by 1, 2`,
      ),
    ).toEqual([
      { grantee: 'authenticated', privilege_type: 'DELETE' },
      { grantee: 'authenticated', privilege_type: 'INSERT' },
      { grantee: 'authenticated', privilege_type: 'SELECT' },
    ])
    for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) {
      expect([privilege, (await rows(`select has_table_privilege('anon', 'public.library_files', $1) as ok`, [privilege]))[0].ok]).toEqual([privilege, false])
    }
    for (const privilege of ['UPDATE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) {
      expect([privilege, (await rows(`select has_table_privilege('authenticated', 'public.library_files', $1) as ok`, [privilege]))[0].ok]).toEqual([privilege, false])
    }
    expect((await rows(`select has_any_column_privilege('authenticated', 'public.library_files', 'UPDATE') as ok`))[0].ok).toBe(false)
    expect((await rows(`select has_any_column_privilege('anon', 'public.library_files', 'SELECT') as ok`))[0].ok).toBe(false)
  })

  it('AC-8101.1: 정책은 표에 읽기·넣기·지우기 셋, storage.objects에 자료실 읽기·올리기·지우기 셋이고 모두 authenticated에만 걸린다', () => {
    expect(policiesOf(afterThis, 'public', 'library_files')).toEqual(
      [
        ['INSERT', TABLE_INSERT],
        ['SELECT', TABLE_READ],
        ['DELETE', TABLE_DELETE],
      ].sort((x, y) => (x[1] < y[1] ? -1 : 1)),
    )
    const libraryStorage = afterThis.policies.filter(
      (p) => p.schemaname === 'storage' && `${p.qual ?? ''} ${p.with_check ?? ''}`.includes(`'${BUCKET}'::text`),
    )
    expect(libraryStorage.map((p) => [p.cmd, p.policyname]).sort((x, y) => (String(x[1]) < String(y[1]) ? -1 : 1))).toEqual(
      [
        ['SELECT', FILE_READ],
        ['INSERT', FILE_UPLOAD],
        ['DELETE', FILE_DELETE],
      ].sort((x, y) => (x[1] < y[1] ? -1 : 1)),
    )
    for (const name of NEW_POLICIES) {
      expect(Buffer.byteLength(name), name).toBeLessThanOrEqual(63)
      expect(policy(name), name).toMatchObject({ permissive: 'PERMISSIVE', roles: '{authenticated}' })
    }
    expect(String(policy(FILE_READ)?.qual)).toContain(`bucket_id = '${BUCKET}'::text`)
    expect(String(policy(FILE_READ)?.qual)).toContain('my_clinic_hospital_id()')
    expect(String(policy(FILE_READ)?.qual)).toContain('admins')
    expect(String(policy(FILE_UPLOAD)?.with_check)).toContain(`bucket_id = '${BUCKET}'::text`)
    expect(String(policy(FILE_UPLOAD)?.with_check)).toContain('admins')
    expect(String(policy(FILE_DELETE)?.qual)).toContain(`bucket_id = '${BUCKET}'::text`)
    expect(String(policy(FILE_DELETE)?.qual)).toContain('admins')
    expect(String(policy(TABLE_READ)?.qual)).toContain('my_clinic_hospital_id()')
    expect(String(policy(TABLE_INSERT)?.with_check)).toContain('uploaded_by')
  })

  it('AC-8101.1: 두 번 돌려도 오류 없이 표·함수·정책·권한·바구니가 한 번 돌린 뒤와 같다', () => {
    expect(THIS_MIGRATION).not.toBe('')
    expect(afterThis).toEqual(afterOnce)
  })

  it('AC-8101.1: 올린 줄·파일이 있을 때 다시 붙여도 그대로 남고, 바꾼 바구니 설정은 이 파일 값으로 돌아오고, 규칙은 그대로 돈다', async () => {
    await become(ADMIN)
    await insertRow(NEW_FILE)
    await upload(P4)
    const before = await everything()
    expect(before.files).toHaveLength(1)
    const shape = await schemaOf()
    await db.exec(`update storage.buckets set public = true, file_size_limit = 1, allowed_mime_types = array['application/zip'] where id = '${BUCKET}'`)

    await db.exec(THIS_MIGRATION)

    expect(await everything()).toEqual(before)
    expect(await schemaOf()).toEqual(shape)
    expect(shape.buckets.find((b) => b.id === BUCKET)).toEqual({ id: BUCKET, name: BUCKET, public: false, file_size_limit: MAX_BYTES, allowed_mime_types: null })
    await become(K)
    expect(await listed()).toEqual([NEW_FILE.file_name])
    expect(await stored()).toEqual([P4])
    await become(M)
    expect(await listed()).toEqual([])
  })

  it('AC-8101.1: 올린 관리자 계정이 지워져도 자료실 줄은 남고 uploaded_by만 비워진다', async () => {
    await become(ADMIN)
    expect(await insertRow(NEW_FILE)).toEqual([{ file_name: NEW_FILE.file_name, uploaded_by: ADMIN }])
    await operator()
    await db.query('delete from auth.users where id = $1', [ADMIN])
    expect(await rows(`select file_name, uploaded_by from public.library_files`)).toEqual([{ file_name: NEW_FILE.file_name, uploaded_by: null }])
  })

  it('AC-8101.1: 파일이 있고 줄 끝이 LF이며, 머리 주석에 무엇·실행·먼저·두 번·관문·명세 번호가 있다', () => {
    expect(THIS_MIGRATION).not.toBe('')
    expect(THIS_MIGRATION).not.toContain('\r')
    const lines = THIS_MIGRATION.split('\n')
    const head = lines.slice(0, lines.findIndex((line) => !/^(--|\s*$)/.test(line))).join('\n')
    for (const word of [
      'library_files',
      BUCKET,
      'REQ-8101',
      'ADR-051',
      '운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다',
      '20261028000000_auth.sql',
      '20261118100000_desk_accounts.sql',
      '두 번 붙여 넣어도 그대로다',
      '이 파일을 먼저 붙여 넣고 그다음 사이트에 올린다',
      INSTALL_BUCKET,
      '환자 자료는 들어가지 않는다',
    ]) {
      expect(head, word).toContain(word)
    }
  })
})

describe('AC-8101.2 읽기: 승인된 의원의 원장·데스크·관리자만', SLOW, () => {
  it.each([
    ['관리자', ADMIN],
    ['승인된 의원의 원장(관리자 아님)', A],
    ['승인된 의원의 데스크', K],
  ])('AC-8101.2: %s는 표 줄과 바구니 파일을 모두 읽는다', async (_label, user) => {
    await seedLibrary()
    await become(user)
    expect(await listed()).toEqual(FILE_NAMES)
    expect(await stored()).toEqual(PATHS)
  })

  it.each([
    ['승인 대기 의원 원장', C],
    ['승인 대기 의원의 데스크', M],
    ['거절된 의원 원장', D],
    ['병원 줄도 데스크 줄도 없는 사용자', E],
  ])('AC-8101.2: %s는 표·바구니 모두 한 줄도 못 읽는다', async (_label, user) => {
    await seedLibrary()
    await become(user)
    expect(await listed()).toEqual([])
    expect(await stored()).toEqual([])
  })

  it('AC-8101.2: anon은 표를 읽을 권한이 없고(42501) 바구니 파일도 한 줄도 못 읽는다', async () => {
    await seedLibrary()
    await becomeAnon()
    await expect(listed()).rejects.toMatchObject(DENIED)
    await becomeAnon()
    expect(await stored()).toEqual([])
  })

  it('AC-8101.2: 관리자는 자기 의원 줄이 없어도 읽는다', async () => {
    await seedLibrary()
    await operator()
    await db.query('delete from public.hospitals where owner_id = $1', [ADMIN])
    await become(ADMIN)
    expect(await listed()).toEqual(FILE_NAMES)
    expect(await stored()).toEqual(PATHS)
  })

  it('AC-8101.2: 의원 승인이 거절로 바뀌면(운영자) 그 원장·데스크는 곧바로 못 읽는다', async () => {
    await seedLibrary()
    await become(K)
    expect(await listed()).toEqual(FILE_NAMES)
    await operator()
    await db.query(`update public.hospitals set status = 'rejected' where owner_id = $1`, [A])
    for (const user of [A, K]) {
      await become(user)
      expect(await listed()).toEqual([])
      expect(await stored()).toEqual([])
    }
  })

  it.each([
    ['관리자', ADMIN],
    ['원장', A],
    ['데스크', K],
  ])('AC-8101.2: %s에게도 자료실 규칙은 다른 바구니 파일을 열지 않는다', async (_label, user) => {
    await seedLibrary()
    await become(user)
    expect(await rows(`select name from storage.objects where bucket_id = $1`, [OTHER_BUCKET])).toEqual([])
  })
})

describe('AC-8101.3 넣기·올리기: 관리자만, 자기 id로, uuid 이름으로', SLOW, () => {
  it('AC-8101.3: 관리자는 uploaded_by = 자기 id로(적거나 기본값으로) 표 줄을 넣는다', async () => {
    await become(ADMIN)
    expect(await insertRow({ ...NEW_FILE, uploaded_by: ADMIN })).toEqual([{ file_name: NEW_FILE.file_name, uploaded_by: ADMIN }])
    expect(await insertRow({ ...FILES[0] })).toEqual([{ file_name: FILES[0].file_name, uploaded_by: ADMIN }])
  })

  it.each([
    ['남의 id', A],
    ['빈 값(null)', null],
  ])('AC-8101.3: 관리자라도 uploaded_by가 %s면 거절된다(42501)', async (_label, other) => {
    await become(ADMIN)
    await expect(insertRow({ ...NEW_FILE, uploaded_by: other })).rejects.toMatchObject(DENIED)
    expect((await everything()).files).toEqual([])
  })

  it.each([
    ['승인된 의원의 원장(관리자 아님)', A],
    ['승인된 의원의 데스크', K],
    ['승인 대기 의원 원장', C],
    ['승인 대기 의원의 데스크', M],
    ['거절된 의원 원장', D],
    ['병원 줄도 데스크 줄도 없는 사용자', E],
  ])('AC-8101.3: %s는 표 줄도 바구니 파일도 넣지 못한다(42501)', async (_label, user) => {
    await become(user)
    await expect(insertRow({ ...NEW_FILE, uploaded_by: user })).rejects.toMatchObject(DENIED)
    await become(user)
    await expect(upload(P4)).rejects.toMatchObject(DENIED)
    expect(await everything()).toEqual({ files: [], objects: [] })
  })

  it('AC-8101.3: anon은 표 줄도 바구니 파일도 넣지 못한다', async () => {
    await becomeAnon()
    await expect(insertRow(NEW_FILE)).rejects.toMatchObject(DENIED)
    await becomeAnon()
    await expect(upload(P4)).rejects.toMatchObject(DENIED)
    expect(await everything()).toEqual({ files: [], objects: [] })
  })

  it('AC-8101.3: 관리자는 uuid 모양 이름(폴더 없음)으로 바구니 파일을 올린다', async () => {
    await become(ADMIN)
    expect(await upload(P4)).toEqual([{ bucket_id: BUCKET, name: P4, owner: ADMIN }])
    expect(await upload(P1)).toEqual([{ bucket_id: BUCKET, name: P1, owner: ADMIN }])
  })

  it.each([
    ['원래 파일 이름', 'precheck-helper-0.14.0.zip'],
    ['한글 이름', '자료실 사용 설명서.pdf'],
    ['폴더 아래 uuid', `helper/${P4}`],
    ['대문자 uuid', P4.toUpperCase()],
    ['uuid 뒤에 끝 글자', `${P4}.zip`],
    ['하이픈 없는 uuid', P4.replaceAll('-', '')],
  ])('AC-8101.3: 관리자라도 바구니 이름이 uuid 모양이 아니면(%s) 거절된다', async (_label, name) => {
    await become(ADMIN)
    await expect(upload(name)).rejects.toMatchObject(DENIED)
    expect((await everything()).objects).toEqual([])
  })
})

describe('AC-8101.4 표 제약', SLOW, () => {
  it.each([
    ['분류가 셋 밖', { category: 'manual' }, CHECK_FAILED],
    ['분류가 대문자', { category: 'Install' }, CHECK_FAILED],
    ['분류가 빈 값', { category: null }, NOT_NULL],
    ['설명 61자', { description: '가'.repeat(61) }, CHECK_FAILED],
    ['크기가 음수', { size: -1 }, CHECK_FAILED],
    ['크기가 52,428,801', { size: MAX_BYTES + 1 }, CHECK_FAILED],
    ['이름이 빈칸뿐', { name: '   ' }, CHECK_FAILED],
    ['이름이 빈 글자', { name: '' }, CHECK_FAILED],
    ['이름 201자', { name: '가'.repeat(201) }, CHECK_FAILED],
    ['파일 이름이 빈 글자', { file_name: '' }, CHECK_FAILED],
    ['파일 이름 201자', { file_name: `${'a'.repeat(197)}.zip` }, CHECK_FAILED],
    ['storage_path가 파일 이름', { storage_path: 'precheck-helper-0.14.0.zip' }, CHECK_FAILED],
    ['storage_path가 폴더 아래 uuid', { storage_path: `x/${P4}` }, CHECK_FAILED],
    ['storage_path가 대문자 uuid', { storage_path: P4.toUpperCase() }, CHECK_FAILED],
  ])('AC-8101.4: %s이면 넣기가 거절된다', async (_label, change, code) => {
    await become(ADMIN)
    await expect(insertRow({ ...NEW_FILE, ...change })).rejects.toMatchObject(code)
    expect((await everything()).files).toEqual([])
  })

  it('AC-8101.4: 경계값(설명 60자·크기 0과 52,428,800·이름과 파일 이름 200자)은 들어간다', async () => {
    await become(ADMIN)
    await insertRow({ ...NEW_FILE, description: '가'.repeat(60), size: 0 })
    await insertRow({ ...FILES[0], size: MAX_BYTES, name: '가'.repeat(200), file_name: `${'a'.repeat(196)}.zip` })
    expect((await everything()).files.map((f) => [f.description, f.size])).toEqual([
      [FILES[0].description, MAX_BYTES],
      ['가'.repeat(60), 0],
    ])
  })

  it('AC-8101.4: 같은 file_name이나 같은 storage_path가 이미 있으면 거절된다(23505)', async () => {
    await become(ADMIN)
    await insertRow(NEW_FILE)
    await expect(insertRow({ ...FILES[0], file_name: NEW_FILE.file_name })).rejects.toMatchObject(UNIQUE_FAILED)
    await become(ADMIN)
    await expect(insertRow({ ...FILES[0], storage_path: NEW_FILE.storage_path })).rejects.toMatchObject(UNIQUE_FAILED)
    expect((await everything()).files.map((f) => f.file_name)).toEqual([NEW_FILE.file_name])
  })
})

describe('AC-8101.5 지우기·고치기', SLOW, () => {
  it('AC-8101.5: 관리자가 지우면 표 줄과 바구니 파일이 지워진다', async () => {
    await seedLibrary()
    await become(ADMIN)
    expect(await rows(`delete from public.library_files where storage_path = $1 returning file_name`, [P1])).toEqual([{ file_name: FILES[0].file_name }])
    expect(await rows(`delete from storage.objects where bucket_id = $1 and name = $2 returning name`, [BUCKET, P1])).toEqual([{ name: P1 }])
    const after = await everything()
    expect(after.files.map((f) => f.storage_path)).toEqual([P2, P3])
    expect(after.objects.filter((o) => o.bucket_id === BUCKET).map((o) => o.name)).toEqual([P2, P3])
    // 다른 바구니의 같은 이름 파일은 그대로
    expect(after.objects.filter((o) => o.bucket_id === OTHER_BUCKET).map((o) => o.name)).toEqual([P1])
  })

  it.each([
    ['승인된 의원의 원장(관리자 아님)', A],
    ['승인된 의원의 데스크', K],
    ['승인 대기 의원 원장', C],
    ['병원 줄도 데스크 줄도 없는 사용자', E],
  ])('AC-8101.5: %s의 지우기는 표·바구니 모두 0줄이다', async (_label, user) => {
    await seedLibrary()
    const before = await everything()
    await become(user)
    expect(await rows(`delete from public.library_files returning file_name`)).toEqual([])
    expect(await rows(`delete from storage.objects where bucket_id = $1 returning name`, [BUCKET])).toEqual([])
    expect(await everything()).toEqual(before)
  })

  it('AC-8101.5: anon은 표를 지울 권한이 없고(42501) 바구니 지우기는 0줄이다', async () => {
    await seedLibrary()
    const before = await everything()
    await becomeAnon()
    await expect(rows(`delete from public.library_files returning file_name`)).rejects.toMatchObject(DENIED)
    await becomeAnon()
    expect(await rows(`delete from storage.objects where bucket_id = $1 returning name`, [BUCKET])).toEqual([])
    expect(await everything()).toEqual(before)
  })

  it.each([
    ['관리자', ADMIN],
    ['원장', A],
    ['데스크', K],
  ])('AC-8101.5: %s도 표 줄을 고칠 권한이 없다(42501)', async (_label, user) => {
    await seedLibrary()
    const before = await everything()
    await become(user)
    await expect(rows(`update public.library_files set name = '바꾼 이름' returning name`)).rejects.toMatchObject(DENIED)
    await become(user)
    await expect(rows(`update public.library_files set category = 'other' where storage_path = $1`, [P1])).rejects.toMatchObject(DENIED)
    expect(await everything()).toEqual(before)
  })

  it('AC-8101.5: 바구니 고치기 규칙이 없어 관리자도 파일을 고치거나 옮기지 못하고(0줄) 덮어쓰기(upsert)도 못 한다', async () => {
    await seedLibrary()
    const before = await everything()
    await become(ADMIN)
    expect(await rows(`update storage.objects set metadata = '{"size": 2}'::jsonb where bucket_id = $1 returning name`, [BUCKET])).toEqual([])
    expect(await rows(`update storage.objects set name = $1 where bucket_id = $2 returning name`, [P4, BUCKET])).toEqual([])
    expect(await rows(`update storage.objects set bucket_id = $1 where bucket_id = $2 returning name`, [OTHER_BUCKET, BUCKET])).toEqual([])
    await expect(
      rows(
        `insert into storage.objects (bucket_id, name) values ($1, $2)
         on conflict (bucket_id, name) do update set metadata = '{"size": 2}'::jsonb returning name`,
        [BUCKET, P1],
      ),
    ).rejects.toMatchObject(DENIED)
    expect(await everything()).toEqual(before)
    const updates = afterThis.policies.filter(
      (p) =>
        (p.cmd === 'UPDATE' || p.cmd === 'ALL') &&
        ((p.schemaname === 'public' && p.tablename === 'library_files') || `${p.qual ?? ''} ${p.with_check ?? ''}`.includes(`'${BUCKET}'::text`)),
    )
    expect(updates).toEqual([])
  })
})

describe('AC-8101.6 다른 것은 그대로', SLOW, () => {
  const others = (schema: Schema) => schema.policies.filter((p) => !NEW_POLICIES.includes(String(p.policyname)))

  it('AC-8101.6: 옛 바구니 install-files의 설정과 두 규칙이 그대로다', () => {
    const install = (schema: Schema) => schema.buckets.find((b) => b.id === INSTALL_BUCKET)
    expect(install(beforeThis)).toBeDefined()
    expect(install(afterThis)).toEqual(install(beforeThis))
    const installPolicies = (schema: Schema) =>
      schema.policies.filter((p) => p.schemaname === 'storage' && `${p.qual ?? ''} ${p.with_check ?? ''}`.includes(`'${INSTALL_BUCKET}'::text`))
    expect(installPolicies(beforeThis).map((p) => p.policyname)).toEqual(['설치 파일 올리기(관리자)', '설치 파일 읽기(승인된 사용자·데스크·관리자)'])
    expect(installPolicies(afterThis)).toEqual(installPolicies(beforeThis))
    // 다른 바구니도 그대로이고, 더해진 바구니는 library 하나뿐
    expect(afterThis.buckets.filter((b) => b.id !== BUCKET)).toEqual(beforeThis.buckets)
    expect(afterThis.buckets.map((b) => b.id)).toEqual([...beforeThis.buckets.map((b) => b.id), BUCKET].sort())
  })

  it('AC-8101.6: tab_access·hospitals·admins의 줄·정책·권한이 그대로다', () => {
    expect(beforeThis.tabAccess.length).toBeGreaterThan(0)
    expect(beforeThis.hospitals.length).toBeGreaterThan(0)
    expect(beforeThis.admins.length).toBeGreaterThan(0)
    expect(afterThis.tabAccess).toEqual(beforeThis.tabAccess)
    expect(afterThis.hospitals).toEqual(beforeThis.hospitals)
    expect(afterThis.admins).toEqual(beforeThis.admins)
    for (const table of ['tab_access', 'hospitals', 'admins']) {
      const shape = (schema: Schema) => [schema.tables.find((t) => t.relname === table), policiesOf(schema, 'public', table), schema.policies.filter((p) => p.tablename === table)]
      expect(shape(beforeThis)[1], table).not.toEqual([])
      expect(shape(afterThis), table).toEqual(shape(beforeThis))
    }
  })

  it('AC-8101.6: my_hospital_id()·my_clinic_hospital_id() 정의와 모든 함수(정의·권한)가 그대로다', () => {
    const def = (schema: Schema, fn: string) => schema.functions.find((f) => f.fn === fn)
    for (const fn of ['my_hospital_id()', 'my_clinic_hospital_id()']) {
      expect(def(beforeThis, fn), fn).toBeDefined()
      expect(def(afterThis, fn), fn).toEqual(def(beforeThis, fn))
    }
    expect(afterThis.functions).toEqual(beforeThis.functions)
  })

  it('AC-8101.6: 다른 표(RLS·권한)·다른 정책·storage 권한·RLS는 그대로이고, 더해진 표는 library_files 하나뿐이다', () => {
    expect(afterThis.tables.filter((t) => t.relname !== 'library_files')).toEqual(beforeThis.tables)
    expect(afterThis.tables.map((t) => t.relname)).toEqual([...beforeThis.tables.map((t) => t.relname), 'library_files'].sort())
    expect(others(afterThis)).toEqual(others(beforeThis))
    expect(afterThis.policies.length).toBe(beforeThis.policies.length + NEW_POLICIES.length)
    expect(afterThis.storageGrants).toEqual(beforeThis.storageGrants)
    expect(afterThis.storageRls).toEqual(beforeThis.storageRls)
  })

  it('AC-8101.6: 주석을 뺀 SQL에 tab_access·install-files·함수 만들기가 없고, 바꾸는 것은 library_files·storage.objects 정책·library 바구니뿐이다', () => {
    expect(THIS_SQL.trim()).not.toBe('')
    expect(THIS_SQL).not.toContain('tab_access')
    expect(THIS_SQL).not.toContain(INSTALL_BUCKET)
    expect(THIS_SQL).not.toMatch(/create\s+or\s+replace\s+function/i)
    expect(THIS_SQL).not.toMatch(/\bfunction\b/i)
    expect(THIS_SQL).not.toMatch(/\btruncate\b/i)
    expect(THIS_SQL).not.toMatch(/\bdelete\s+from\b/i)
    expect(THIS_SQL).not.toMatch(/\bupdate\s+(public|storage)\./i)
    // 지우는 문장은 정책 지우기(drop policy if exists)뿐
    expect(new Set([...THIS_SQL.matchAll(/\bdrop\s+(\w+)/gi)].map((m) => m[1].toLowerCase()))).toEqual(new Set(['policy']))
    expect(THIS_SQL).not.toMatch(/drop policy (?!if exists)/i)
    expect(new Set([...THIS_SQL.matchAll(/\binsert\s+into\s+([\w.]+)/gi)].map((m) => m[1]))).toEqual(new Set(['storage.buckets']))
    expect(new Set([...THIS_SQL.matchAll(/\b(?:create|alter)\s+table\s+(?:if\s+not\s+exists\s+)?([\w.]+)/gi)].map((m) => m[1]))).toEqual(
      new Set(['public.library_files']),
    )
    expect(new Set([...THIS_SQL.matchAll(/\b(?:grant|revoke)\b[^;]*?\bon\s+table\s+([\w.]+)/gi)].map((m) => m[1]))).toEqual(
      new Set(['public.library_files']),
    )
    expect(new Set([...THIS_SQL.matchAll(/\bpolicy\s+(?:if\s+exists\s+)?"[^"]+"\s+on\s+([\w.]+)/gi)].map((m) => m[1]))).toEqual(
      new Set(['public.library_files', 'storage.objects']),
    )
  })

  it('AC-8101.6: 만드는 정책 여섯은 저마다 같은 이름을 먼저 지운 뒤 만든다', () => {
    const creates = [...THIS_SQL.matchAll(/create policy "([^"]+)" on ([\w.]+)/gi)].map((m) => [m[1], m[2]])
    expect(creates.map(([name]) => name).sort()).toEqual([...NEW_POLICIES].sort())
    for (const [name, table] of creates) {
      const drop = THIS_SQL.indexOf(`drop policy if exists "${name}" on ${table};`)
      expect(drop, name).toBeGreaterThanOrEqual(0)
      expect(drop, name).toBeLessThan(THIS_SQL.indexOf(`create policy "${name}" on ${table}`))
    }
  })
})

// ADR 절(제목 줄부터 다음 제목 앞까지). 없으면 ''
function adrSection(doc: string, no: string): string {
  const head = new RegExp(`^### ADR-${no}: `, 'm').exec(doc)
  if (head === null) return ''
  const rest = doc.slice(head.index + 1)
  const next = rest.search(/^### ADR-/m)
  return next === -1 ? doc.slice(head.index) : doc.slice(head.index, head.index + 1 + next)
}

describe('REQ-8101 TASK-1: 결정 기록 ADR-051 · ARCHITECTURE', () => {
  it('REQ-8101 TASK-1: docs/ADR.md에 ADR-051이 한 번 있고 공용 표·공용 바구니·관리자만·50MB·install-files를 적는다', () => {
    const doc = readRepo('docs/ADR.md')
    expect([...doc.matchAll(/^### ADR-051: /gm)]).toHaveLength(1)
    const body = adrSection(doc, '051')
    for (const word of ['`library_files`', '`library`', '`install-files`', '관리자', '50MB', '데스크', 'ADR-046', '20261125000000_library.sql']) {
      expect(body, word).toContain(word)
    }
  })

  it('REQ-8101 TASK-1: docs/ARCHITECTURE.md에 library_files 표 줄 하나 · 공용 표 예외 줄 · Storage library 줄이 있다', () => {
    const lines = readRepo('docs/ARCHITECTURE.md').split('\n')
    const table = lines.filter((line) => line.startsWith('| `library_files`'))
    expect(table).toHaveLength(1)
    expect(table[0]).toContain('ADR-051')
    expect(table[0]).toContain('specs/library')
    const exception = lines.filter((line) => line.startsWith('예외: 고시·공지 공용 표'))
    expect(exception).toHaveLength(1)
    expect(exception[0]).toContain('`library_files`')
    expect(exception[0]).toContain('ADR-051')
    const storage = lines.filter((line) => line.startsWith('- Storage 버킷 `library`'))
    expect(storage).toHaveLength(1)
    expect(storage[0]).toContain('20261125000000_library.sql')
    expect(storage[0]).toContain('`install-files`')
    expect(storage[0]).toContain('ADR-051')
  })
})

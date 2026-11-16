import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

// 도우미·크롬 확장 설치 파일 보관함(Storage 버킷 install-files)과 읽기·올리기 규칙 (helper-download REQ-5101, TASK-1).
// formBackgrounds.rls.test.ts와 같은 방법: 진짜 Postgres(PGlite, WASM)에서 운영자가 SQL 편집기에 붙일 파일을 그대로 돌린다.
// 실제 Supabase에는 붙지 않는다. Supabase가 미리 갖춘 것(역할·auth 스키마·새 표·함수의 기본 권한,
// 그리고 storage 스키마의 버킷 표·objects 표·RLS·권한·foldername 함수)만 흉내 낸다
const fileOf = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))
const read = (rel: string) => readFileSync(fileOf(rel), 'utf-8')
const AUTH_MIGRATION = read('./migrations/20261028000000_auth.sql')
const NOTICES_MIGRATION = read('./migrations/20261110000000_form_notices.sql')
const BACKGROUNDS_MIGRATION = read('./migrations/20261115020000_form_backgrounds.sql')
const INSTALL_PATH = fileOf('./migrations/20261117000000_install_files.sql')
// 파일이 아직 없으면 빈 글자로 돌아, 시험마다 '버킷·규칙이 없다'로 실패한다(무엇이 빠졌는지 시험별로 보인다)
const INSTALL_MIGRATION = existsSync(INSTALL_PATH) ? readFileSync(INSTALL_PATH, 'utf-8') : ''
// 주석을 뺀 SQL 글자(머리 주석이 설명으로 다른 낱말을 말할 수 있다)
const INSTALL_SQL = INSTALL_MIGRATION.split('\n')
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
  create table auth.users (id uuid primary key, email text);
  create function auth.jwt() returns jsonb language sql stable
    as $$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
`

// Supabase Storage가 미리 갖춘 것(이 migration은 표를 만들거나 고치지 않고 버킷 줄과 정책만 더한다).
// RLS는 켜져 있고 anon·authenticated는 표 권한이 모두 있다(그래서 막는 것은 정책뿐이다). 같은 버킷 안 같은 이름은 하나뿐이다
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
  -- 다른 기능의 버킷(이 파일의 정책이 여기에는 아무것도 열지 않는지 보려고)
  insert into storage.buckets (id, name) values ('other-bucket', 'other-bucket');
`

// 갈래 규칙 C1: 다른 갈래와 글자까지 같아야 어느 순서로 붙여 넣어도 된다
const C1_MY_HOSPITAL_ID = `create or replace function public.my_hospital_id() returns uuid language sql stable security definer set search_path = ''
  as $$ select h.id from public.hospitals h where h.owner_id = (select auth.uid()) and h.status = 'approved' $$;
revoke execute on function public.my_hospital_id() from public, anon;
grant execute on function public.my_hospital_id() to authenticated;
`

const ADMIN = '00000000-0000-4000-8000-0000000000a1' // 관리자(병원 줄 없음)
const A = '00000000-0000-4000-8000-00000000000a' // 승인된 병원 A
const B = '00000000-0000-4000-8000-00000000000b' // 승인된 다른 병원 B
const PENDING = '00000000-0000-4000-8000-00000000000c' // 승인 대기
const REJECTED = '00000000-0000-4000-8000-00000000000d' // 거절
const NO_HOSPITAL = '00000000-0000-4000-8000-00000000000e' // 로그인만 하고 가입 신청을 안 함(병원 줄 없음)
const USERS = [ADMIN, A, B, PENDING, REJECTED, NO_HOSPITAL]
const STATUS: Record<string, string> = { [A]: 'approved', [B]: 'approved', [PENDING]: 'pending', [REJECTED]: 'rejected' }

type Row = Record<string, unknown>

const BUCKET = 'install-files'
const OTHER_BUCKET = 'other-bucket'
const HELPER = 'helper/precheck-helper-0.9.0.zip'
const EXTENSION = 'extension/precheck-extension-0.3.0.zip'
const SLOW = { timeout: 60_000 }
const RLS = /row-level security/
const DUPLICATE = /duplicate key value/

// 관리자라도 이 이름으로는 올리지 못한다(폴더와 종류가 다름·판 모양이 다름·zip이 아님·폴더가 다름)
const BAD_NAMES: [string, string][] = [
  ['확장 폴더에 도우미', 'extension/precheck-helper-0.9.0.zip'],
  ['도우미 폴더에 확장', 'helper/precheck-extension-0.3.0.zip'],
  ['폴더 없음', 'precheck-helper-0.9.0.zip'],
  ['다른 폴더', 'files/precheck-helper-0.9.0.zip'],
  ['폴더 아래 폴더', 'helper/old/precheck-helper-0.9.0.zip'],
  ['폴더 이름 대문자', 'Helper/precheck-helper-0.9.0.zip'],
  ['앞에 /', '/helper/precheck-helper-0.9.0.zip'],
  ['앞에 빈칸', ' helper/precheck-helper-0.9.0.zip'],
  ['판 번호 둘', 'helper/precheck-helper-0.9.zip'],
  ['판 번호 넷', 'helper/precheck-helper-0.9.0.1.zip'],
  ['판 번호 네 자리', 'helper/precheck-helper-1000.0.0.zip'],
  ['판 번호가 글자', 'helper/precheck-helper-a.b.c.zip'],
  ['점 대신 다른 글자', 'helper/precheck-helper-0x9x0.zip'],
  ['.zip 앞 점 대신 다른 글자', 'helper/precheck-helper-0.9.0xzip'],
  ['같은 이름 둘째 받기', 'helper/precheck-helper-0.9.0 (1).zip'],
  ['대문자 ZIP', 'helper/precheck-helper-0.9.0.ZIP'],
  ['exe', 'helper/precheck-helper-0.9.0.exe'],
  ['zip 뒤에 더', 'helper/precheck-helper-0.9.0.zip.exe'],
  ['끝에 줄바꿈', 'helper/precheck-helper-0.9.0.zip\n'],
  ['종류 이름 다름', 'helper/precheck-tool-0.9.0.zip'],
  ['폴더만', 'helper/'],
]

let db: PGlite // 흉내 → 인증 → 이 파일
let full: PGlite // 흉내 → 인증 → 휴진 안내 → 내 배경(form-backgrounds 정책) → 이 파일
type Schema = Awaited<ReturnType<typeof schemaOf>>
let beforeInstall: Schema // full에 이 파일을 돌리기 전
let afterInstall: Schema // 돌린 뒤

async function setUp(target: PGlite) {
  await target.exec(SUPABASE_MOCK)
  await target.exec(STORAGE_MOCK)
  await target.exec(AUTH_MIGRATION)
}

// 다른 갈래 것이 그대로인지 보려고 public의 표·함수(정의·권한), storage 정책(모양 전부)·버킷을 모은다
async function schemaOf(target: PGlite) {
  const q = async (sql: string) => (await target.query<Row>(sql)).rows
  return {
    tables: (
      await q(`select relname from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' order by 1`)
    ).map((row) => row.relname as string),
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
  }
}

async function operator() {
  await db.exec('reset role; reset request.jwt.claims')
}

// 로그인 토큰: sub = uid
async function become(user: string) {
  await operator()
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: user })])
  await db.exec('set role authenticated')
}

async function becomeAnon() {
  await operator()
  await db.exec('set role anon')
}

async function rows(sql: string, params: unknown[] = []) {
  return (await db.query<Row>(sql, params)).rows
}

// 시험마다 사용자·병원·관리자·파일을 새로 넣는다. 운영자(superuser)는 RLS를 건너뛴다
async function resetData() {
  await operator()
  await db.exec('truncate auth.users cascade') // 병원·관리자 줄도 같이 비워진다
  await db.exec('truncate storage.objects')
  for (const user of USERS) {
    await db.query('insert into auth.users (id, email) values ($1, $2)', [user, `${user}@fake.test`])
  }
  for (const [user, status] of Object.entries(STATUS)) {
    await db.query(
      `insert into public.hospitals (owner_id, name, applicant_name, email, status) values ($1, '가짜병원', '가짜신청자', $2, $3)`,
      [user, `${user}@fake.test`, status],
    )
  }
  await db.query('insert into public.admins (user_id) values ($1)', [ADMIN])
}

// 운영자 눈으로 본 파일 전체(바뀌지 않았는지 비교할 때)
async function objects() {
  await operator()
  return rows(`select bucket_id, name, owner, metadata from storage.objects order by bucket_id, name`)
}

// 운영자가 파일 줄을 넣는다(Storage API가 하는 일을 흉내, 정책을 건너뛴다)
async function seedObject(name: string, bucket = BUCKET) {
  await operator()
  await rows(`insert into storage.objects (bucket_id, name, metadata) values ($1, $2, '{"size": 1}'::jsonb)`, [bucket, name])
}

async function seedFiles() {
  await seedObject(HELPER)
  await seedObject('helper/precheck-helper-0.8.0.zip')
  await seedObject(EXTENSION)
  await seedObject(HELPER, OTHER_BUCKET)
}

// 지금 역할로 파일을 올린다(Storage API의 upload, upsert 없음)
const upload = (name: string, bucket = BUCKET) =>
  rows(`insert into storage.objects (bucket_id, name) values ($1, $2) returning bucket_id, name, owner`, [bucket, name])

// 지금 역할로 덮어쓰며 올린다(Storage API의 upload upsert: true — 있으면 고치기)
const upsert = (name: string) =>
  rows(
    `insert into storage.objects (bucket_id, name) values ($1, $2)
     on conflict (bucket_id, name) do update set metadata = '{"size": 2}'::jsonb returning name`,
    [BUCKET, name],
  )

const visible = async () => (await rows(`select bucket_id, name from storage.objects order by bucket_id, name`)).map((r) => `${r.bucket_id}:${r.name}`)
const INSTALL_FILES = [`${BUCKET}:${EXTENSION}`, `${BUCKET}:helper/precheck-helper-0.8.0.zip`, `${BUCKET}:${HELPER}`]

beforeAll(async () => {
  db = await PGlite.create()
  await setUp(db)
  await db.exec(INSTALL_MIGRATION)

  full = await PGlite.create()
  await setUp(full)
  await full.exec(NOTICES_MIGRATION)
  await full.exec(BACKGROUNDS_MIGRATION)
  beforeInstall = await schemaOf(full)
  await full.exec(INSTALL_MIGRATION)
  afterInstall = await schemaOf(full)
}, 120_000)

afterAll(async () => {
  await db.close()
  await full.close()
})

beforeEach(resetData)

describe('AC-5101.1 보관함 버킷', SLOW, () => {
  it('AC-5101.1: install-files 버킷은 공개가 아니고 한 파일 5,000,000바이트·application/zip만이다', async () => {
    await operator()
    expect(
      await rows(`select id, name, public, file_size_limit, allowed_mime_types from storage.buckets where id = $1`, [BUCKET]),
    ).toEqual([{ id: BUCKET, name: BUCKET, public: false, file_size_limit: 5_000_000, allowed_mime_types: ['application/zip'] }])
  })

  it('AC-5101.1: storage.objects 정책은 이 파일의 읽기·올리기 둘뿐이고 고치기·지우기 정책이 없다', async () => {
    const list = await rows(
      `select cmd, permissive, roles::text as roles, qual, with_check from pg_policies
       where schemaname = 'storage' and tablename = 'objects' order by cmd`,
    )
    expect(list.map((p) => p.cmd)).toEqual(['INSERT', 'SELECT'])
    for (const policy of list) expect(policy).toMatchObject({ permissive: 'PERMISSIVE', roles: '{authenticated}' })
    const [insert, select] = list
    expect(String(select.qual)).toContain(`'${BUCKET}'`)
    expect(String(select.qual)).toContain('my_hospital_id()')
    expect(String(select.qual)).toContain('admins')
    expect(select.with_check).toBeNull()
    expect(String(insert.with_check)).toContain(`'${BUCKET}'`)
    expect(String(insert.with_check)).toContain('admins')
    expect(String(insert.with_check)).not.toContain('my_hospital_id()')
    expect(insert.qual).toBeNull()
  })

  it('AC-5101.1: storage.buckets에는 정책을 두지 않는다(버킷 목록은 사용자에게 열지 않는다)', async () => {
    expect(await rows(`select policyname from pg_policies where schemaname = 'storage' and tablename = 'buckets'`)).toEqual([])
  })
})

describe('AC-5101.2 읽기(목록·받기)', SLOW, () => {
  it.each([
    ['승인된 병원 A', A],
    ['승인된 다른 병원 B', B],
    ['관리자(병원 줄 없음)', ADMIN],
  ])('AC-5101.2: %s는 두 폴더의 설치 파일을 모두 읽고, 다른 버킷 파일은 못 읽는다', async (_label, user) => {
    await seedFiles()
    await become(user)
    expect(await visible()).toEqual(INSTALL_FILES)
  })

  it.each([
    ['승인 대기', PENDING],
    ['거절', REJECTED],
    ['가입 신청 없음', NO_HOSPITAL],
  ])('AC-5101.2: %s 사용자는 한 줄도 못 읽는다', async (_label, user) => {
    await seedFiles()
    await become(user)
    expect(await visible()).toEqual([])
  })

  it('AC-5101.2: anon은 한 줄도 못 읽는다', async () => {
    await seedFiles()
    await becomeAnon()
    expect(await visible()).toEqual([])
  })

  it('AC-5101.2: 승인이 거절로 바뀌면(운영자) 그 사용자는 곧바로 못 읽는다', async () => {
    await seedFiles()
    await become(A)
    expect(await visible()).toEqual(INSTALL_FILES)
    await operator()
    await rows(`update public.hospitals set status = 'rejected' where owner_id = $1`, [A])
    await become(A)
    expect(await visible()).toEqual([])
  })
})

describe('AC-5101.3 올리기·고치기·지우기', SLOW, () => {
  it.each([
    HELPER,
    EXTENSION,
    'helper/precheck-helper-10.20.300.zip',
    'extension/precheck-extension-1.0.0.zip',
  ])('AC-5101.3: 관리자는 %s를 올리고, 올린 사람은 관리자로 남는다', async (name) => {
    await become(ADMIN)
    expect(await upload(name)).toEqual([{ bucket_id: BUCKET, name, owner: ADMIN }])
    expect(await visible()).toEqual([`${BUCKET}:${name}`])
  })

  it.each(BAD_NAMES)('AC-5101.3: 관리자라도 이름 모양이 다르면 거절된다 — %s', async (_label, name) => {
    await become(ADMIN)
    await expect(upload(name)).rejects.toThrow(RLS)
    expect(await objects()).toEqual([])
  })

  it('AC-5101.3: 관리자라도 다른 버킷에는 올리지 못한다', async () => {
    await become(ADMIN)
    await expect(upload(HELPER, OTHER_BUCKET)).rejects.toThrow(RLS)
    expect(await objects()).toEqual([])
  })

  it.each([
    ['승인된 병원 사용자', A],
    ['승인 대기', PENDING],
    ['거절', REJECTED],
    ['가입 신청 없음', NO_HOSPITAL],
  ])('AC-5101.3: %s는 맞는 이름이어도 올리지 못한다', async (_label, user) => {
    await become(user)
    await expect(upload(HELPER)).rejects.toThrow(RLS)
    await expect(upload(EXTENSION)).rejects.toThrow(RLS)
    expect(await objects()).toEqual([])
  })

  it('AC-5101.3: anon은 맞는 이름이어도 올리지 못한다', async () => {
    await becomeAnon()
    await expect(upload(HELPER)).rejects.toThrow(RLS)
    expect(await objects()).toEqual([])
  })

  it('AC-5101.3: 같은 이름을 다시 올리면 거절되고, 덮어쓰기(upsert)도 고치기 규칙이 없어 거절된다', async () => {
    await become(ADMIN)
    await upload(HELPER)
    const before = await objects()
    await become(ADMIN)
    await expect(upload(HELPER)).rejects.toThrow(DUPLICATE)
    await expect(upsert(HELPER)).rejects.toThrow(RLS)
    expect(await objects()).toEqual(before)
  })

  it.each([
    ['관리자', ADMIN],
    ['승인된 병원 사용자', A],
    ['승인 대기', PENDING],
    ['거절', REJECTED],
  ])('AC-5101.3: %s는 파일을 고치거나(이름 바꾸기·옮기기 포함) 지우지 못한다(0줄)', async (_label, user) => {
    await seedFiles()
    const before = await objects()
    await become(user)
    expect(await rows(`update storage.objects set metadata = '{"size": 2}'::jsonb returning name`)).toEqual([])
    expect(await rows(`update storage.objects set name = $1 returning name`, ['helper/precheck-helper-9.9.9.zip'])).toEqual([])
    expect(await rows(`update storage.objects set bucket_id = $1 returning name`, [OTHER_BUCKET])).toEqual([])
    expect(await rows(`delete from storage.objects returning name`)).toEqual([])
    expect(await objects()).toEqual(before)
  })

  it('AC-5101.3: anon은 파일을 고치거나 지우지 못한다(0줄)', async () => {
    await seedFiles()
    const before = await objects()
    await becomeAnon()
    expect(await rows(`update storage.objects set metadata = '{"size": 2}'::jsonb returning name`)).toEqual([])
    expect(await rows(`delete from storage.objects returning name`)).toEqual([])
    expect(await objects()).toEqual(before)
  })
})

describe('AC-5101.1 파일', SLOW, () => {
  it('AC-5101.1: 파일 머리 주석에 붙여 넣는 방법·먼저 있어야 하는 파일·여러 번 실행해도 된다는 말이 있다', () => {
    const lines = INSTALL_MIGRATION.split('\n')
    const head = lines.slice(0, lines.findIndex((line) => !/^(--|\s*$)/.test(line))).join('\n')
    expect(head).toContain('운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다')
    expect(head).toContain('20261028000000_auth.sql')
    expect(head).toContain('여러 번 실행해도')
    expect(head).toContain(BUCKET)
  })

  it('AC-5101.1: my_hospital_id()는 cross-branch C1 글자 그대로다', () => {
    expect(INSTALL_MIGRATION).toContain(C1_MY_HOSPITAL_ID)
  })

  it('AC-5101.1: 표를 만들거나 고치지 않는다 — storage 표도 건드리지 않고, 함수는 my_hospital_id()만 다시 만든다', () => {
    expect(INSTALL_SQL).not.toMatch(/\b(create|alter)\s+table\b/i)
    expect(INSTALL_SQL).not.toMatch(/\bgrant\b[^;]+\bon\s+(table\s+)?storage\./i)
    expect(INSTALL_SQL).not.toMatch(/\brevoke\b[^;]+\bon\s+(table\s+)?storage\./i)
    expect([...INSTALL_SQL.matchAll(/create\s+(or replace\s+)?function\s+(\S+?)\(/gi)].map((m) => [m[1]?.trim(), m[2]])).toEqual([
      ['or replace', 'public.my_hospital_id'],
    ])
  })

  it('AC-5101.1: 지우는 문장은 정책 다시 만들기(drop policy if exists)뿐이고, 비우기·줄 지우기가 없다', () => {
    expect(INSTALL_SQL).not.toMatch(/\b(truncate|delete\s+from)\b/i)
    const drops = [...INSTALL_SQL.matchAll(/\bdrop\s+(\w+)/gi)].map((m) => m[1].toLowerCase())
    expect(new Set(drops)).toEqual(new Set(['policy']))
    expect(INSTALL_SQL).not.toMatch(/drop policy (?!if exists)/i)
  })

  it('AC-5101.1: 여러 번 실행해도 되게 쓴다 — 정책은 지우고 다시 만들고, 버킷은 on conflict로 설정을 되돌린다', () => {
    const creates = [...INSTALL_SQL.matchAll(/create policy ("[^"]+") on (\S+)/gi)]
    expect(creates).toHaveLength(2)
    for (const [, policy, on] of creates) {
      expect(on).toBe('storage.objects')
      const drop = INSTALL_SQL.indexOf(`drop policy if exists ${policy} on ${on};`)
      expect(drop, `${policy} on ${on}`).toBeGreaterThanOrEqual(0)
      expect(drop).toBeLessThan(INSTALL_SQL.indexOf(`create policy ${policy} on ${on}`))
    }
    expect(INSTALL_SQL).toMatch(/insert into storage\.buckets[^;]+on conflict \(id\) do update set[^;]+public = false/)
  })

  it('AC-5101.1: 내 배경 migration이 먼저 있어도 돌고, storage 정책 둘·버킷 하나만 더하며 그 밖의 정책·함수·권한·표는 그대로다', () => {
    expect(afterInstall.tables).toEqual(beforeInstall.tables)
    expect(afterInstall.functions).toEqual(beforeInstall.functions)
    expect(afterInstall.storageGrants).toEqual(beforeInstall.storageGrants)
    expect(afterInstall.storageRls).toEqual(beforeInstall.storageRls)
    const added = afterInstall.policies.filter((p) => !beforeInstall.policies.some((old) => old.policyname === p.policyname && old.tablename === p.tablename))
    expect(added.map((p) => `${p.schemaname}.${p.tablename}:${p.cmd}`).sort()).toEqual(['storage.objects:INSERT', 'storage.objects:SELECT'])
    expect(afterInstall.policies.filter((p) => !added.includes(p))).toEqual(beforeInstall.policies)
    expect(beforeInstall.policies.filter((p) => p.schemaname === 'storage')).toHaveLength(3) // 내 배경 그림 읽기·올리기·지우기
    expect(afterInstall.buckets.map((b) => b.id)).toEqual([...beforeInstall.buckets.map((b) => b.id), BUCKET].sort())
    expect(afterInstall.buckets.filter((b) => b.id !== BUCKET)).toEqual(beforeInstall.buckets)
  })

  it('AC-5101.1: 내 배경 migration과 함께 있어도 서로의 버킷을 열지 않는다', async () => {
    const main = db
    db = full
    try {
      await resetData()
      await seedFiles()
      await seedObject(`${'0'.repeat(8)}-0000-4000-8000-000000000001/${'0'.repeat(8)}-0000-4000-8000-000000000002.jpg`, 'form-backgrounds')
      await become(ADMIN)
      expect(await visible()).toEqual(INSTALL_FILES)
      await expect(upload(HELPER, 'form-backgrounds')).rejects.toThrow(RLS)
      await become(A)
      expect(await visible()).toEqual(INSTALL_FILES)
      await become(PENDING)
      expect(await visible()).toEqual([])
    } finally {
      await db.exec('reset role; reset request.jwt.claims')
      db = main
    }
  })

  it('AC-5101.1: 두 번 실행해도 오류가 없고, 올린 파일은 남고, 정책·함수·권한·버킷 설정은 이 파일 값으로 같다', async () => {
    const twice = await PGlite.create()
    const main = db
    try {
      await setUp(twice)
      await twice.exec(INSTALL_MIGRATION)
      const first = await schemaOf(twice)
      db = twice
      await resetData()
      await become(ADMIN)
      await upload(HELPER)
      await upload(EXTENSION)
      const files = await objects()
      // 누가 관리 화면에서 버킷을 공개로 바꿔 두었어도 다시 붙이면 이 파일 값으로 돌아온다
      await twice.exec(`update storage.buckets set public = true, file_size_limit = 1, allowed_mime_types = null where id = '${BUCKET}'`)

      await twice.exec(INSTALL_MIGRATION)

      expect(await schemaOf(twice)).toEqual(first)
      expect(await objects()).toEqual(files)
      expect(files).toHaveLength(2)
      expect(await rows(`select public, file_size_limit, allowed_mime_types from storage.buckets where id = $1`, [BUCKET])).toEqual([
        { public: false, file_size_limit: 5_000_000, allowed_mime_types: ['application/zip'] },
      ])
      // 다시 붙인 뒤에도 규칙은 그대로 돈다
      await become(A)
      expect(await visible()).toEqual([`${BUCKET}:${EXTENSION}`, `${BUCKET}:${HELPER}`])
      await expect(upload('helper/precheck-helper-1.0.0.zip')).rejects.toThrow(RLS)
      await become(ADMIN)
      expect(await upload('helper/precheck-helper-1.0.0.zip')).toHaveLength(1)
    } finally {
      await db.exec('reset role; reset request.jwt.claims')
      db = main
      await twice.close()
    }
  }, 120_000)
})

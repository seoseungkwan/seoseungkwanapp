import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

// 데스크도 설치 파일 보관함(install-files)을 읽는다 — 읽기 규칙을 '승인된 사용자·데스크·관리자'로 바꾸는 migration (desk-setup REQ-7005, design.md 6절)
// 그리고 결정 기록 ADR-031 (REQ-7007, design.md 6-2절).
// installFiles.rls.test.ts·desk.rls.test.ts와 같은 방법: 진짜 Postgres(PGlite, WASM)에서 운영자가 SQL 편집기에 붙일 파일을 차례로 그대로 돌린다.
// 실제 Supabase에는 붙지 않는다. Supabase가 미리 갖춘 것(역할·auth 스키마·새 표·함수의 기본 권한, storage 스키마의 버킷 표·objects 표·RLS·권한)만 흉내 낸다.
// 메일은 모두 지어낸 것이다
const fileOf = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))
const read = (rel: string) => readFileSync(fileOf(rel), 'utf-8')
// desk_accounts.sql 머리 주석의 앞 migration(desk.rls.test.ts의 차례에서 데스크 파일이 기대는 것만)
const BEFORE_DESK = [
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
].map((name) => read(`./migrations/${name}`))
const INSTALL_MIGRATION = read('./migrations/20261117000000_install_files.sql')
const DESK_MIGRATION = read('./migrations/20261118100000_desk_accounts.sql')
const THIS_PATH = fileOf('./migrations/20261119200000_desk_install_files.sql')
// 파일이 아직 없으면 빈 글자로 돌아, 시험마다 '데스크가 못 읽는다·새 규칙이 없다'로 실패한다(무엇이 빠졌는지 시험별로 보인다)
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
  create table auth.users (id uuid primary key, email text, last_sign_in_at timestamptz);
  create function auth.jwt() returns jsonb language sql stable
    as $$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
`

// Supabase Storage가 미리 갖춘 것(installFiles.rls.test.ts와 같다). RLS는 켜져 있고 anon·authenticated는 표 권한이 모두 있다(막는 것은 정책뿐)
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

const ADMIN = '00000000-0000-4000-8000-0000000000a1' // 관리자(병원 줄 없음)
const A = '00000000-0000-4000-8000-00000000000a' // 승인된 병원 A 원장
const B = '00000000-0000-4000-8000-00000000000b' // 승인된 다른 병원 B 원장
const C = '00000000-0000-4000-8000-00000000000c' // 승인 대기 병원 원장
const D = '00000000-0000-4000-8000-00000000000d' // 거절된 병원 원장
const E = '00000000-0000-4000-8000-00000000000e' // 병원 줄도 데스크 줄도 없는 사용자
const K = '00000000-0000-4000-8000-0000000000d1' // A의 데스크(병원 줄 없음)
const L = '00000000-0000-4000-8000-0000000000d2' // B의 데스크
const M = '00000000-0000-4000-8000-0000000000d3' // 대기 병원 C의 데스크
const N = '00000000-0000-4000-8000-0000000000d4' // 거절된 병원 D의 데스크
const USERS = [ADMIN, A, B, C, D, E, K, L, M, N]
const STATUS: Record<string, string> = { [A]: 'approved', [B]: 'approved', [C]: 'pending', [D]: 'rejected' }
const DESK_OF: Record<string, string> = { [K]: A, [L]: B, [M]: C, [N]: D } // 데스크 → 그 병원 원장
const emailOf = (user: string) => (DESK_OF[user] ? `desk-${user.slice(-2)}@fake.test` : `${user.slice(-2)}@fake.test`)

type Row = Record<string, unknown>

const BUCKET = 'install-files'
const OTHER_BUCKET = 'other-bucket'
const HELPER = 'helper/precheck-helper-0.12.0.zip'
const EXTENSION = 'extension/precheck-extension-0.3.0.zip'
const OLD_READ = '설치 파일 읽기(승인된 사용자·관리자)'
const NEW_READ = '설치 파일 읽기(승인된 사용자·데스크·관리자)'
const UPLOAD = '설치 파일 올리기(관리자)'
const SLOW = { timeout: 60_000 }
const RLS = /row-level security/

let db: PGlite // 흉내 → desk_accounts 앞 migration → install_files → desk_accounts → 이 파일
type Schema = Awaited<ReturnType<typeof schemaOf>>
let beforeThis: Schema // db에 이 파일을 돌리기 전
let afterThis: Schema // 돌린 뒤

async function setUp(target: PGlite) {
  await target.exec(SUPABASE_MOCK)
  await target.exec(STORAGE_MOCK)
  for (const sql of BEFORE_DESK) await target.exec(sql)
  await target.exec(INSTALL_MIGRATION)
  await target.exec(DESK_MIGRATION)
}

// 다른 것이 그대로인지 보려고 public의 표·함수(정의·권한), 정책(모양 전부), storage 권한·RLS·버킷을 모은다
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

// 시험마다 사용자·병원·데스크 줄·관리자를 새로 넣는다(병원·데스크 줄은 auth.users를 따라 함께 비워진다). 운영자(superuser)는 RLS를 건너뛴다
async function resetData() {
  await operator()
  await db.exec('truncate auth.users cascade')
  await db.exec('truncate storage.objects')
  for (const user of USERS) {
    await db.query('insert into auth.users (id, email) values ($1, $2)', [user, emailOf(user)])
  }
  const hospital: Record<string, string> = {}
  for (const [user, status] of Object.entries(STATUS)) {
    const [row] = await rows(
      `insert into public.hospitals (owner_id, name, applicant_name, email, status)
       values ($1, '가짜병원', '가짜신청자', $2, $3) returning id`,
      [user, emailOf(user), status],
    )
    hospital[user] = row.id as string
  }
  for (const [desk, owner] of Object.entries(DESK_OF)) {
    await db.query('insert into public.hospital_members (hospital_id, email) values ($1, $2)', [hospital[owner], emailOf(desk)])
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
  await seedObject('helper/precheck-helper-0.11.0.zip')
  await seedObject(EXTENSION)
  await seedObject(HELPER, OTHER_BUCKET)
}

// 지금 역할로 파일을 올린다(Storage API의 upload, upsert 없음)
const upload = (name: string, bucket = BUCKET) =>
  rows(`insert into storage.objects (bucket_id, name) values ($1, $2) returning bucket_id, name, owner`, [bucket, name])

// 지금 역할로 덮어쓰며 올린다(upsert: true — 있으면 고치기)
const upsert = (name: string) =>
  rows(
    `insert into storage.objects (bucket_id, name) values ($1, $2)
     on conflict (bucket_id, name) do update set metadata = '{"size": 2}'::jsonb returning name`,
    [BUCKET, name],
  )

const visible = async () => (await rows(`select bucket_id, name from storage.objects order by bucket_id, name`)).map((r) => `${r.bucket_id}:${r.name}`)
const INSTALL_FILES = [`${BUCKET}:${EXTENSION}`, `${BUCKET}:helper/precheck-helper-0.11.0.zip`, `${BUCKET}:${HELPER}`]
// 받기: Storage API가 파일 하나를 줄 때 읽는 줄
const fileRow = async (name: string) => (await rows(`select name from storage.objects where bucket_id = $1 and name = $2`, [BUCKET, name])).map((r) => r.name)
const storagePolicies = (schema: Schema) => schema.policies.filter((p) => p.schemaname === 'storage' && p.tablename === 'objects')

/** 다른 PGlite를 잠깐 db로 쓰고(시험 도우미가 그대로 돌게) 끝나면 되돌린다 */
async function withDb(target: PGlite, run: () => Promise<void>) {
  const main = db
  db = target
  try {
    await run()
  } finally {
    await db.exec('reset role; reset request.jwt.claims')
    db = main
  }
}

beforeAll(async () => {
  db = await PGlite.create()
  await setUp(db)
  beforeThis = await schemaOf(db)
  await db.exec(THIS_MIGRATION)
  afterThis = await schemaOf(db)
}, 120_000)

afterAll(async () => {
  await db.close()
})

beforeEach(resetData)

describe('AC-7005.1 승인된 병원의 데스크는 설치 파일을 읽는다', SLOW, () => {
  it.each([
    ['A의 데스크', K],
    ['B의 데스크', L],
  ])('AC-7005.1: %s(자기 병원 줄 없음)는 install-files 두 폴더의 파일 목록을 모두 읽고, 다른 버킷 파일은 못 읽는다', async (_label, user) => {
    await seedFiles()
    await become(user)
    expect(await visible()).toEqual(INSTALL_FILES)
  })

  it('AC-7005.1: 승인된 병원의 데스크는 파일 하나(도우미·확장)를 이름으로 받는다', async () => {
    await seedFiles()
    await become(K)
    expect(await fileRow(HELPER)).toEqual([HELPER])
    expect(await fileRow(EXTENSION)).toEqual([EXTENSION])
  })
})

describe('AC-7005.2 못 읽는 사용자와 지금처럼 읽는 사용자', SLOW, () => {
  it.each([
    ['승인 대기 병원의 데스크', M],
    ['거절된 병원의 데스크', N],
    ['병원 줄도 데스크 줄도 없는 사용자', E],
    ['승인 대기 병원 원장', C],
    ['거절된 병원 원장', D],
  ])('AC-7005.2: %s는 한 줄도 못 읽는다', async (_label, user) => {
    await seedFiles()
    await become(user)
    expect(await visible()).toEqual([])
    expect(await fileRow(HELPER)).toEqual([])
  })

  it('AC-7005.2: anon은 한 줄도 못 읽는다', async () => {
    await seedFiles()
    await becomeAnon()
    expect(await visible()).toEqual([])
  })

  it.each([
    ['승인된 병원 A 원장', A],
    ['승인된 병원 B 원장', B],
    ['관리자(병원 줄 없음)', ADMIN],
  ])('AC-7005.2: %s는 지금처럼 설치 파일을 모두 읽는다', async (_label, user) => {
    await seedFiles()
    await become(user)
    expect(await visible()).toEqual(INSTALL_FILES)
  })

  it('AC-7005.2: 승인이 거절로 바뀌면(운영자) 그 병원 데스크도 곧바로 못 읽는다', async () => {
    await seedFiles()
    await become(K)
    expect(await visible()).toEqual(INSTALL_FILES)
    await operator()
    await rows(`update public.hospitals set status = 'rejected' where owner_id = $1`, [A])
    await become(K)
    expect(await visible()).toEqual([])
    await become(A)
    expect(await visible()).toEqual([])
    await become(L) // 다른 병원 데스크는 그대로
    expect(await visible()).toEqual(INSTALL_FILES)
  })
})

describe('AC-7005.3 데스크는 올리기·고치기·지우기를 못 하고, 다른 버킷은 열리지 않는다', SLOW, () => {
  it('AC-7005.3: 데스크는 맞는 이름이어도 올리지 못하고, 덮어쓰기(upsert)도 못 한다', async () => {
    await become(K)
    await expect(upload(HELPER)).rejects.toThrow(RLS)
    await expect(upload(EXTENSION)).rejects.toThrow(RLS)
    expect(await objects()).toEqual([])
    await seedFiles()
    const before = await objects()
    await become(K)
    await expect(upsert(HELPER)).rejects.toThrow(RLS)
    expect(await objects()).toEqual(before)
  })

  it('AC-7005.3: 데스크는 파일을 고치거나(이름 바꾸기·옮기기 포함) 지우지 못한다(0줄)', async () => {
    await seedFiles()
    const before = await objects()
    await become(K)
    expect(await rows(`update storage.objects set metadata = '{"size": 2}'::jsonb returning name`)).toEqual([])
    expect(await rows(`update storage.objects set name = $1 returning name`, ['helper/precheck-helper-9.9.9.zip'])).toEqual([])
    expect(await rows(`update storage.objects set bucket_id = $1 returning name`, [OTHER_BUCKET])).toEqual([])
    expect(await rows(`delete from storage.objects returning name`)).toEqual([])
    expect(await objects()).toEqual(before)
  })

  it('AC-7005.3: 올리기는 지금처럼 관리자만 된다', async () => {
    await become(ADMIN)
    expect(await upload(HELPER)).toEqual([{ bucket_id: BUCKET, name: HELPER, owner: ADMIN }])
    await become(A)
    await expect(upload(EXTENSION)).rejects.toThrow(RLS)
  })

  it.each([
    ['데스크', K],
    ['원장', A],
    ['관리자', ADMIN],
  ])('AC-7005.3: %s도 install-files 밖 버킷의 파일은 못 읽는다', async (_label, user) => {
    await seedFiles()
    await seedObject('x/other.jpg', OTHER_BUCKET)
    await become(user)
    expect(await rows(`select name from storage.objects where bucket_id <> $1`, [BUCKET])).toEqual([])
  })

  it('AC-7005.3: 새 읽기 규칙은 install-files 버킷에만 걸리고 읽기(select)만 연다', () => {
    const policy = storagePolicies(afterThis).find((p) => p.policyname === NEW_READ)
    expect(policy).toMatchObject({ cmd: 'SELECT', permissive: 'PERMISSIVE', roles: '{authenticated}', with_check: null })
    expect(String(policy?.qual)).toContain(`bucket_id = '${BUCKET}'`)
    expect(String(policy?.qual)).toContain('my_clinic_hospital_id()')
    expect(String(policy?.qual)).toContain('admins')
  })
})

describe('AC-7005.4 migration 파일', SLOW, () => {
  it('AC-7005.4: 옛 읽기 정책은 없어지고 새 이름의 읽기 정책이 생긴다 — storage.objects 정책은 올리기·새 읽기 둘뿐이다', () => {
    expect(storagePolicies(beforeThis).map((p) => [p.cmd, p.policyname])).toEqual([
      ['INSERT', UPLOAD],
      ['SELECT', OLD_READ],
    ])
    expect(storagePolicies(afterThis).map((p) => [p.cmd, p.policyname])).toEqual([
      ['INSERT', UPLOAD],
      ['SELECT', NEW_READ],
    ])
  })

  it('AC-7005.4: 표·함수·버킷·storage 권한·RLS는 그대로이고, 바뀐 정책은 설치 파일 읽기 하나뿐이다', () => {
    expect(afterThis.tables).toEqual(beforeThis.tables)
    expect(afterThis.functions).toEqual(beforeThis.functions)
    expect(afterThis.storageGrants).toEqual(beforeThis.storageGrants)
    expect(afterThis.storageRls).toEqual(beforeThis.storageRls)
    expect(afterThis.buckets).toEqual(beforeThis.buckets)
    const others = (schema: Schema) => schema.policies.filter((p) => p.policyname !== OLD_READ && p.policyname !== NEW_READ)
    expect(others(afterThis)).toEqual(others(beforeThis))
    // 올리기 규칙도 글자까지 그대로다
    expect(storagePolicies(afterThis).find((p) => p.policyname === UPLOAD)).toEqual(storagePolicies(beforeThis).find((p) => p.policyname === UPLOAD))
  })

  it('AC-7005.4: 표·함수·버킷을 만들거나 고치지 않고, 권한 문장·줄 지우기가 없다', () => {
    expect(THIS_SQL).not.toMatch(/\b(create|alter)\s+table\b/i)
    expect(THIS_SQL).not.toMatch(/\bfunction\b/i)
    expect(THIS_SQL).not.toMatch(/storage\.buckets/i)
    expect(THIS_SQL).not.toMatch(/\b(grant|revoke|truncate|delete|insert|update)\b/i)
  })

  it('AC-7005.4: 지우는 문장은 정책 지우기(drop policy if exists)뿐이고, 옛 이름·새 이름을 지운 뒤 새 이름으로 만든다', () => {
    const drops = [...THIS_SQL.matchAll(/\bdrop\s+(\w+)/gi)].map((m) => m[1].toLowerCase())
    expect(new Set(drops)).toEqual(new Set(['policy']))
    expect(THIS_SQL).not.toMatch(/drop policy (?!if exists)/i)
    const dropOld = THIS_SQL.indexOf(`drop policy if exists "${OLD_READ}" on storage.objects;`)
    const dropNew = THIS_SQL.indexOf(`drop policy if exists "${NEW_READ}" on storage.objects;`)
    const creates = [...THIS_SQL.matchAll(/create policy ("[^"]+") on (\S+)/gi)].map((m) => [m[1], m[2]])
    expect(creates).toEqual([[`"${NEW_READ}"`, 'storage.objects']])
    const create = THIS_SQL.indexOf(`create policy "${NEW_READ}" on storage.objects`)
    expect(dropOld).toBeGreaterThanOrEqual(0)
    expect(dropNew).toBeGreaterThanOrEqual(0)
    expect(dropOld).toBeLessThan(create)
    expect(dropNew).toBeLessThan(create)
  })

  it('AC-7005.4: 머리 주석에 붙여 넣는 방법·먼저 있어야 하는 두 파일·두 번 붙여도 그대로라는 말이 있다', () => {
    const lines = THIS_MIGRATION.split('\n')
    const head = lines.slice(0, lines.findIndex((line) => !/^(--|\s*$)/.test(line))).join('\n')
    expect(head).toContain('운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다')
    expect(head).toContain('20261117000000_install_files.sql')
    expect(head).toContain('20261118100000_desk_accounts.sql')
    expect(head).toContain('두 번 붙여 넣어도 그대로다')
    expect(head).toContain(BUCKET)
  })

  it('AC-7005.4: 두 번 붙여 넣어도 오류가 없고, 올린 파일은 남고, 정책·함수·권한·버킷은 같고, 규칙은 그대로 돈다', async () => {
    const twice = await PGlite.create()
    try {
      await setUp(twice)
      await twice.exec(THIS_MIGRATION)
      const first = await schemaOf(twice)
      await withDb(twice, async () => {
        await resetData()
        await become(ADMIN)
        await upload(HELPER)
        await upload(EXTENSION)
        const files = await objects()

        await twice.exec(THIS_MIGRATION)

        expect(await schemaOf(twice)).toEqual(first)
        expect(await objects()).toEqual(files)
        await become(K)
        expect(await visible()).toEqual([`${BUCKET}:${EXTENSION}`, `${BUCKET}:${HELPER}`])
        await become(M)
        expect(await visible()).toEqual([])
      })
    } finally {
      await twice.close()
    }
  }, 120_000)

  it('AC-7005.4: 나중에 install_files.sql을 다시 붙여 옛 정책이 다시 생겨도, 데스크 읽기는 새 정책이 그대로 연다', async () => {
    const again = await PGlite.create()
    try {
      await setUp(again)
      await again.exec(THIS_MIGRATION)
      await again.exec(INSTALL_MIGRATION)
      // 정책 이름 차례(옛 이름 '…사용자·관리자'가 새 이름 '…사용자·데스크·관리자'보다 앞)
      expect(storagePolicies(await schemaOf(again)).map((p) => [p.cmd, p.policyname])).toEqual([
        ['INSERT', UPLOAD],
        ['SELECT', OLD_READ],
        ['SELECT', NEW_READ],
      ])
      await withDb(again, async () => {
        await resetData()
        await seedFiles()
        await become(K)
        expect(await visible()).toEqual(INSTALL_FILES)
        await become(N)
        expect(await visible()).toEqual([])
        await become(E)
        expect(await visible()).toEqual([])
      })
    } finally {
      await again.close()
    }
  }, 120_000)
})

// ADR 절(제목 줄부터 다음 제목 앞까지). 없으면 ''
function adrSection(doc: string, no: string): string {
  const head = new RegExp(`^### ADR-${no}: `, 'm').exec(doc)
  if (head === null) return ''
  const rest = doc.slice(head.index + 1)
  const next = rest.search(/^### ADR-/m)
  return next === -1 ? doc.slice(head.index) : doc.slice(head.index, head.index + 1 + next)
}
const readRepo = (rel: string) => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), 'utf-8')
// 파일 안 // 주석 줄만
const commentsOf = (src: string) =>
  src
    .split('\n')
    .filter((line) => /^\s*\/\//.test(line))
    .join('\n')

describe('AC-7007.1 결정 기록 ADR-031', () => {
  const adr031 = () => adrSection(readRepo('docs/ADR.md'), '031')

  it('AC-7007.1: ADR-031은 데스크가 탭 셋 밖에서 여는 주소가 비트 PC 연결 화면(/claim/setup) 하나뿐이라고 적는다', () => {
    expect([...readRepo('docs/ADR.md').matchAll(/^### ADR-031: /gm)]).toHaveLength(1)
    expect(adr031()).toContain('탭 셋 밖에서 여는 주소는 비트 PC 연결 화면(`/claim/setup`) 하나뿐')
  })

  it('AC-7007.1: ADR-031은 데스크도 그 화면에서 설치 파일(install-files, 새 읽기 규칙)을 받아 깔고 연결한다고 적고, 옛 "원장 계정으로 한다"는 없다', () => {
    const body = adr031()
    expect(body).toContain('`install-files`')
    expect(body).toContain(NEW_READ)
    expect(body).toContain('20261119200000_desk_install_files.sql')
    expect(body).toContain('데스크도 비트 PC 연결 화면에서 설치 파일')
    expect(body).not.toContain('데스크 PC의 확장·도우미 설치와 비트 PC 연결은 원장 계정으로 한다')
  })

  it('AC-7007.1: installFiles.ts·DownloadButton.tsx 머리 주석도 데스크가 받는다고 말한다', () => {
    const lib = commentsOf(readRepo('src/lib/storage/installFiles.ts'))
    expect(lib).toContain('데스크')
    expect(lib).toContain('20261119200000_desk_install_files.sql')
    expect(commentsOf(readRepo('src/components/install/DownloadButton.tsx'))).toContain('데스크')
  })
})

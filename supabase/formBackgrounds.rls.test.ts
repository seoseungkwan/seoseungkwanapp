import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

// 휴진 안내 '내 배경'(form_backgrounds)·AI 그림 하루 한도(ai_image_days·take_ai_image)·그림 저장소(Storage 버킷 form-backgrounds)
// 와 휴진 안내 theme 칸 넓히기 (forms-themes REQ-4607·REQ-4608, TASK-2).
// formGuides.rls.test.ts와 같은 방법: 진짜 Postgres(PGlite, WASM)에서 운영자가 SQL 편집기에 붙일 파일을 그대로 돌린다.
// 실제 Supabase에는 붙지 않는다. Supabase가 미리 갖춘 것(역할·auth 스키마·새 표·함수·순서표의 기본 권한,
// 그리고 storage 스키마의 버킷 표·objects 표·RLS·권한·foldername 함수)만 흉내 낸다
const fileOf = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))
const read = (rel: string) => readFileSync(fileOf(rel), 'utf-8')
const AUTH_MIGRATION = read('./migrations/20261028000000_auth.sql')
const STATS_MIGRATION = read('./migrations/20261101000200_stats.sql')
const REVENUE_MIGRATION = read('./migrations/20261101000400_revenue.sql')
const PICKS_MIGRATION = read('./migrations/20261103000000_rx_picks.sql')
const GROUPS_MIGRATION = read('./migrations/20261105000100_stats_rx_groups.sql')
const AI_MIGRATION = read('./migrations/20261101000000_ai_report.sql')
const NOTICES_MIGRATION = read('./migrations/20261110000000_form_notices.sql')
const GUIDES_MIGRATION = read('./migrations/20261115010000_form_guides.sql')
const BACKGROUNDS_PATH = fileOf('./migrations/20261115020000_form_backgrounds.sql')
// 파일이 아직 없으면 빈 글자로 돌아, 시험마다 '표가 없다'로 실패한다(무엇이 빠졌는지 시험별로 보인다)
const BACKGROUNDS_MIGRATION = existsSync(BACKGROUNDS_PATH) ? readFileSync(BACKGROUNDS_PATH, 'utf-8') : ''
// 주석을 뺀 SQL 글자(머리 주석이 다른 갈래 표·함수 이름을 설명으로 말할 수 있다)
const BACKGROUNDS_SQL = BACKGROUNDS_MIGRATION.split('\n')
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
// 칸은 Supabase 표의 일부(이 파일이 쓰는 칸 + 올리는 사람·시각), RLS는 켜져 있고 anon·authenticated는 표 권한이 모두 있다.
// foldername은 Supabase 정의와 같은 뜻: '/'로 나눈 조각에서 마지막(파일 이름)을 뺀 것
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

const A = '00000000-0000-4000-8000-00000000000a' // 승인된 병원 A
const B = '00000000-0000-4000-8000-00000000000b' // 승인된 다른 병원 B
const PENDING = '00000000-0000-4000-8000-00000000000c' // 승인 대기
const REJECTED = '00000000-0000-4000-8000-00000000000d' // 거절
const NO_HOSPITAL = '00000000-0000-4000-8000-00000000000e' // 로그인만 하고 가입 신청을 안 함(병원 줄 없음)
const STATUS: Record<string, string> = { [A]: 'approved', [B]: 'approved', [PENDING]: 'pending', [REJECTED]: 'rejected' }

type Row = Record<string, unknown>

const TABLE = 'public.form_backgrounds'
const COLUMNS = ['id', 'hospital_id', 'words', 'accent', 'thumb', 'path', 'created_at']
const SENT = ['words', 'accent', 'thumb'] // 사용자가 넣을 수 있는 칸(그 밖은 칸 권한이 없다)
const DAYS = 'public.ai_image_days'
const TAKE = 'public.take_ai_image()'
const NOTICES = 'public.form_notices'
const BUCKET = 'form-backgrounds'
const OTHER_BUCKET = 'other-bucket'
const PER_DAY = 20
const OLD = '2001-01-01T00:00:00.000Z'
const OTHER_ID = '00000000-0000-4000-8000-000000000123'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const BG_UUID = '0f8fad5b-d9cb-469f-a165-70867728950e'

// 지어낸 내 배경(작은 그림은 JPEG base64 모양의 가짜 글)
const THUMB = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsL'
const ROW: Row = { words: '봄 벚꽃', accent: '#c2185b', thumb: THUMB }

const SLOW = { timeout: 60_000 }
const DENIED = /permission denied/
const CHECK = /check constraint/
const RLS = /row-level security/
const NOT_NULL = /null value in column/
const GENERATED = /cannot insert a non-DEFAULT value into column "path"/

let db: PGlite // 흉내 → 인증 → 휴진 안내 → 이 파일
let full: PGlite // 흉내 → 인증 → 통계 → 매출 → 처방 → 통계 묶음 → AI 리포트 → 휴진 안내 → 환자 안내문 → 이 파일
let hospital: Record<string, string> = {}
type Schema = Awaited<ReturnType<typeof schemaOf>>
let beforeBackgrounds: Schema // full에 이 파일을 돌리기 전
let afterBackgrounds: Schema // 돌린 뒤
type Shape = Awaited<ReturnType<typeof noticesShape>>
let noticesBefore: Shape
let noticesAfter: Shape
let oldNotices: Row[] = [] // full에 이 파일을 돌리기 전에 들어 있던 휴진 안내 줄

async function setUp(target: PGlite) {
  await target.exec(SUPABASE_MOCK)
  await target.exec(STORAGE_MOCK)
  await target.exec(AUTH_MIGRATION)
}

// 다른 갈래 것이 그대로인지 보려고 public의 표 이름과 함수(정의·권한), storage.objects 정책을 모은다
async function schemaOf(target: PGlite) {
  const q = async (sql: string) => (await target.query<Row>(sql)).rows
  return {
    tables: (
      await q(`select relname from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' order by 1`)
    ).map((row) => row.relname as string),
    functions: await q(
      `select p.oid::regprocedure::text as fn, pg_get_functiondef(p.oid) as def, coalesce(p.proacl::text, '') as acl
       from pg_proc p where p.pronamespace = 'public'::regnamespace order by 1`,
    ),
    storagePolicies: (await q(`select policyname from pg_policies where schemaname = 'storage' order by 1`)).map(
      (row) => row.policyname as string,
    ),
  }
}

// 휴진 안내 표의 모양(칸·제약·권한·정책·트리거·RLS). theme 제약 말고는 그대로여야 한다
async function noticesShape(target: PGlite) {
  const q = async (sql: string) => (await target.query<Row>(sql)).rows
  return {
    columns: await q(
      `select column_name, data_type, is_nullable, column_default from information_schema.columns
       where table_schema = 'public' and table_name = 'form_notices' order by ordinal_position`,
    ),
    constraints: await q(
      `select conname, contype, pg_get_constraintdef(oid) as def from pg_constraint
       where conrelid = 'public.form_notices'::regclass order by conname`,
    ),
    tableGrants: await q(
      `select grantee, privilege_type from information_schema.role_table_grants
       where table_schema = 'public' and table_name = 'form_notices' order by grantee, privilege_type`,
    ),
    columnGrants: await q(
      `select grantee, column_name, privilege_type from information_schema.column_privileges
       where table_schema = 'public' and table_name = 'form_notices' order by grantee, column_name, privilege_type`,
    ),
    policies: await q(
      `select policyname, cmd, permissive, roles::text as roles, qual, with_check from pg_policies
       where schemaname = 'public' and tablename = 'form_notices' order by policyname`,
    ),
    triggers: await q(
      `select tgname, pg_get_triggerdef(oid) as def from pg_trigger
       where tgrelid = 'public.form_notices'::regclass and not tgisinternal order by tgname`,
    ),
    rls: await q(`select relrowsecurity, relforcerowsecurity from pg_class where oid = 'public.form_notices'::regclass`),
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

async function resetData() {
  await operator()
  await db.exec('truncate auth.users cascade') // 병원·내 배경·하루 한도·휴진 안내 줄도 같이 비워진다
  await db.exec('truncate storage.objects')
  hospital = {}
  for (const [user, status] of Object.entries(STATUS)) {
    await db.query('insert into auth.users (id, email) values ($1, $2)', [user, `${user}@fake.test`])
    const [row] = await rows(
      `insert into public.hospitals (owner_id, name, applicant_name, email, status)
       values ($1, '가짜병원', '가짜신청자', $2, $3) returning id`,
      [user, `${user}@fake.test`, status],
    )
    hospital[user] = row.id as string
  }
}

function insertInto(table: string, row: Row, suffix = '') {
  const columns = Object.keys(row)
  return rows(
    `insert into ${table} (${columns.join(', ')}) values (${columns.map((_, i) => `$${i + 1}`).join(', ')}) ${suffix}`,
    columns.map((column) => row[column]),
  )
}

const insert = (row: Row, suffix = '') => insertInto(TABLE, row, suffix)

// 운영자가 owner 병원 줄을 넣는다(칸 권한·RLS를 건너뛴다). 넣은 줄을 돌려준다
async function seed(owner: string, row: Row = ROW) {
  await operator()
  const [added] = await insert({ hospital_id: hospital[owner], ...row }, 'returning *')
  return added
}

// 운영자 눈으로 본 표 전체(바뀌지 않았는지 비교할 때)
async function snapshot(table = TABLE) {
  await operator()
  return rows(`select * from ${table} order by 1, 2`)
}

async function objects() {
  await operator()
  return rows(`select bucket_id, name, owner from storage.objects order by bucket_id, name`)
}

// 운영자가 그림 파일 줄을 넣는다(Storage API가 하는 일을 흉내, 정책을 건너뛴다)
async function seedObject(name: string, bucket = BUCKET) {
  await operator()
  await rows(`insert into storage.objects (bucket_id, name) values ($1, $2)`, [bucket, name])
}

// 지금 역할로 그림 파일을 올린다(Storage API의 upload, upsert 없음)
const upload = (name: string, bucket = BUCKET) =>
  rows(`insert into storage.objects (bucket_id, name) values ($1, $2) returning bucket_id, name, owner`, [bucket, name])

const take = async () => (await rows(`select ${TAKE} as ok`))[0].ok

// 한국 날짜(YYYY-MM-DD). 자정을 걸칠 때를 위해 부르기 앞뒤로 잰다
const seoulDay = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

async function days() {
  await operator()
  return rows(`select hospital_id, day::text as day, images from ${DAYS} order by hospital_id, day`)
}

beforeAll(async () => {
  db = await PGlite.create()
  await setUp(db)
  await db.exec(NOTICES_MIGRATION)
  await db.exec(BACKGROUNDS_MIGRATION)

  full = await PGlite.create()
  await setUp(full)
  for (const migration of [
    STATS_MIGRATION,
    REVENUE_MIGRATION,
    PICKS_MIGRATION,
    GROUPS_MIGRATION,
    AI_MIGRATION,
    NOTICES_MIGRATION,
    GUIDES_MIGRATION,
  ]) {
    await full.exec(migration)
  }
  // 이미 저장해 둔 휴진 안내(저절로·테마 열쇠·옛 한도 32자)가 새 제약도 넘는지 보려고 먼저 넣어 둔다
  await full.exec(`insert into auth.users (id, email) values ('${A}', 'a@fake.test')`)
  await full.exec(`insert into public.hospitals (owner_id, name, applicant_name, email, status)
                   values ('${A}', '가짜병원', '가짜신청자', 'a@fake.test', 'approved')`)
  await full.exec(`insert into public.form_notices (hospital_id, year, month, cards, theme)
                   select h.id, 2027, 5, '[{"name":"가짜"}]'::jsonb, t.theme
                   from public.hospitals h, (values (null), ('m05'), ('${'a'.repeat(32)}')) as t (theme)`)
  oldNotices = (await full.query<Row>(`select id, theme from public.form_notices order by id`)).rows
  beforeBackgrounds = await schemaOf(full)
  noticesBefore = await noticesShape(full)
  await full.exec(BACKGROUNDS_MIGRATION)
  afterBackgrounds = await schemaOf(full)
  noticesAfter = await noticesShape(full)
}, 120_000)

afterAll(async () => {
  await db.close()
  await full.close()
})

// 시험마다 빈 표에서 시작한다. 운영자(superuser)는 RLS를 건너뛴다
beforeEach(resetData)

describe('AC-4608.1 내 배경 표·칸·RLS·권한', SLOW, () => {
  it('AC-4608.1: 칸은 id·hospital_id·words·accent·thumb·path·created_at 일곱뿐이고 path만 DB가 만드는 칸이다', async () => {
    const columns = await rows(
      `select column_name, udt_name, is_nullable, is_generated from information_schema.columns
       where table_schema = 'public' and table_name = 'form_backgrounds' order by ordinal_position`,
    )
    expect(columns.map((row) => row.column_name)).toEqual(COLUMNS)
    expect(columns.map((row) => [row.column_name, row.udt_name, row.is_nullable, row.is_generated])).toEqual([
      ['id', 'uuid', 'NO', 'NEVER'],
      ['hospital_id', 'uuid', 'NO', 'NEVER'],
      ['words', 'text', 'NO', 'NEVER'],
      ['accent', 'text', 'NO', 'NEVER'],
      ['thumb', 'text', 'NO', 'NEVER'],
      ['path', 'text', 'YES', 'ALWAYS'],
      ['created_at', 'timestamptz', 'NO', 'NEVER'],
    ])
  })

  it('AC-4608.1: 기본 키는 id이고, RLS가 켜져 있다', async () => {
    const key = await rows(
      `select a.attname from pg_index i
       join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
       where i.indrelid = $1::regclass and i.indisprimary`,
      [TABLE],
    )
    expect(key.map((row) => row.attname)).toEqual(['id'])
    expect(await rows(`select relrowsecurity as on from pg_class where oid = $1::regclass`, [TABLE])).toEqual([{ on: true }])
  })

  it('AC-4608.1: 병원 줄을 지우면(운영자) 그 병원 배경도 지워지고 다른 병원 줄은 그대로다', async () => {
    await seed(A)
    await seed(B)
    await operator()
    await rows('delete from public.hospitals where id = $1', [hospital[A]])
    expect(await rows(`select hospital_id from ${TABLE}`)).toEqual([{ hospital_id: hospital[B] }])
  })

  it('AC-4608.1: 표 단위 권한은 authenticated의 읽기·지우기뿐이다(넣기는 칸 단위, 고치기·비우기 등 없음)', async () => {
    for (const [privilege, expected] of [
      ['SELECT', true],
      ['DELETE', true],
      ['INSERT', false],
      ['UPDATE', false],
      ['TRUNCATE', false],
      ['REFERENCES', false],
      ['TRIGGER', false],
    ] as const) {
      const [row] = await rows(`select has_table_privilege('authenticated', $1, $2) as ok`, [TABLE, privilege])
      expect([privilege, row.ok]).toEqual([privilege, expected])
    }
    const granted = await rows(
      `select grantee, privilege_type from information_schema.role_table_grants
       where table_schema = 'public' and table_name = 'form_backgrounds' and grantee in ('anon', 'authenticated', 'PUBLIC')
       order by grantee, privilege_type`,
    )
    expect(granted).toEqual([
      { grantee: 'authenticated', privilege_type: 'DELETE' },
      { grantee: 'authenticated', privilege_type: 'SELECT' },
    ])
  })

  it('AC-4608.1: authenticated의 넣기 칸 권한은 words·accent·thumb뿐이고, 고치기 칸 권한은 하나도 없다', async () => {
    await rows(`select $1::regclass`, [TABLE]) // 표가 없으면 여기서 실패한다(빈 목록과 헷갈리지 않게)
    const list = await rows(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'form_backgrounds'
         and has_column_privilege('authenticated', 'public.form_backgrounds', column_name, 'INSERT')
       order by ordinal_position`,
    )
    expect(list.map((row) => row.column_name)).toEqual(SENT)
    expect(await rows(`select has_any_column_privilege('authenticated', $1, 'UPDATE') as ok`, [TABLE])).toEqual([{ ok: false }])
  })

  it('AC-4608.1: anon에게 표·칸 권한이 하나도 없다', async () => {
    for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']) {
      expect(await rows(`select has_any_column_privilege('anon', $1, $2) as ok`, [TABLE, privilege])).toEqual([{ ok: false }])
    }
    for (const privilege of ['DELETE', 'TRUNCATE', 'TRIGGER']) {
      expect(await rows(`select has_table_privilege('anon', $1, $2) as ok`, [TABLE, privilege])).toEqual([{ ok: false }])
    }
  })

  it('AC-4608.1: 정책은 읽기·넣기·지우기 셋뿐이고(고치기 없음) authenticated 대상이며 my_hospital_id()로 거른다', async () => {
    const list = await rows(
      `select cmd, permissive, roles::text as roles, qual, with_check from pg_policies
       where schemaname = 'public' and tablename = 'form_backgrounds' order by cmd`,
    )
    expect(list.map((p) => p.cmd)).toEqual(['DELETE', 'INSERT', 'SELECT'])
    for (const policy of list) {
      expect(policy).toMatchObject({ permissive: 'PERMISSIVE', roles: '{authenticated}' })
      expect(policy.cmd === 'INSERT' ? policy.with_check : policy.qual).toContain('my_hospital_id()')
    }
  })

  it('AC-4608.1: hospital_id 기본값은 my_hospital_id()이고, path는 hospital_id/id.jpg로 DB가 만든다', async () => {
    expect(
      await rows(
        `select column_name, column_default, generation_expression from information_schema.columns
         where table_schema = 'public' and table_name = 'form_backgrounds' and column_name in ('hospital_id', 'path')
         order by column_name`,
      ),
    ).toEqual([
      { column_name: 'hospital_id', column_default: 'my_hospital_id()', generation_expression: null },
      {
        column_name: 'path',
        column_default: null,
        generation_expression: expect.stringMatching(/hospital_id\)?::text \|\| '\/'::text\)? \|\| \(?id\)?::text\)? \|\| '\.jpg'::text/),
      },
    ])
  })

  it.each([
    ['public', false],
    ['anon', false],
    ['authenticated', true],
  ])('AC-4608.1: my_hospital_id() 실행 권한 %s = %s', async (role, allowed) => {
    await rows(`select $1::regclass`, [TABLE]) // 이 파일이 돌았는지
    expect(await rows(`select has_function_privilege($1, 'public.my_hospital_id()', 'EXECUTE') as ok`, [role])).toEqual([
      { ok: allowed },
    ])
  })
})

describe('AC-4608.2 내 배경 읽기·넣기·지우기', SLOW, () => {
  it('AC-4608.2: anon은 읽기·넣기·고치기·지우기 모두 권한 없음이고 줄은 그대로다', async () => {
    await seed(A)
    const before = await snapshot()
    await becomeAnon()
    await expect(rows(`select * from ${TABLE}`)).rejects.toThrow(DENIED)
    await expect(insert(ROW)).rejects.toThrow(DENIED)
    await expect(rows(`update ${TABLE} set words = '겨울 눈'`)).rejects.toThrow(DENIED)
    await expect(rows(`delete from ${TABLE}`)).rejects.toThrow(DENIED)
    await expect(rows('select public.my_hospital_id()')).rejects.toThrow(DENIED)
    expect(await snapshot()).toEqual(before)
  })

  it('AC-4608.2: A는 자기 배경을 넣고 읽고 지우며, 넣은 줄의 id·hospital_id·path·시각은 DB가 정한다', async () => {
    await become(A)
    const [added] = await insert(ROW, `returning id, hospital_id, path, created_at > now() - interval '1 hour' as created`)
    expect(added).toMatchObject({ hospital_id: hospital[A], created: true })
    expect(added.id).toMatch(UUID)
    expect(await rows(`select words, accent, thumb from ${TABLE}`)).toEqual([ROW])
    expect(await rows(`delete from ${TABLE} where id = $1 returning id`, [added.id])).toEqual([{ id: added.id }])
    expect(await rows(`select * from ${TABLE}`)).toEqual([])
    expect(await snapshot()).toEqual([])
  })

  it('AC-4608.2: path는 <병원 id>/<id>.jpg다', async () => {
    await become(A)
    const [added] = await insert(ROW, 'returning id, path')
    expect(added.path).toBe(`${hospital[A]}/${added.id}.jpg`)
    await become(B)
    const [theirs] = await insert(ROW, 'returning id, path')
    expect(theirs.path).toBe(`${hospital[B]}/${theirs.id}.jpg`)
  })

  it('AC-4608.2: 고치기는 내 줄이어도 권한 없음이고 줄은 그대로다', async () => {
    await seed(A)
    const before = await snapshot()
    await become(A)
    for (const change of [`words = '겨울 눈'`, `accent = '#123456'`, `thumb = '/9j/AAAA'`]) {
      await expect(rows(`update ${TABLE} set ${change}`)).rejects.toThrow(DENIED)
    }
    expect(await snapshot()).toEqual(before)
  })

  it('AC-4608.2: B의 줄은 A에게 보이지 않고 id로 골라도 지워지지 않는다', async () => {
    const theirs = await seed(B)
    const before = await snapshot()
    await become(A)
    expect(await rows(`select * from ${TABLE}`)).toEqual([])
    expect(await rows(`select * from ${TABLE} where id = $1`, [theirs.id])).toEqual([])
    expect(await rows(`delete from ${TABLE} where id = $1 returning id`, [theirs.id])).toEqual([])
    expect(await rows(`delete from ${TABLE} returning id`)).toEqual([])
    expect(await snapshot()).toEqual(before)
  })

  it('AC-4608.2: A와 B가 둘 다 줄이 있으면 A는 자기 줄만 보고 지운다', async () => {
    const mine = await seed(A)
    const theirs = await seed(B)
    await become(A)
    expect(await rows(`select id, hospital_id from ${TABLE}`)).toEqual([{ id: mine.id, hospital_id: hospital[A] }])
    expect(await rows(`delete from ${TABLE} returning id`)).toEqual([{ id: mine.id }])
    await operator()
    expect(await rows(`select id from ${TABLE}`)).toEqual([{ id: theirs.id }])
  })

  it.each([
    ['승인 대기', PENDING],
    ['거절', REJECTED],
    ['가입 신청 안 함', NO_HOSPITAL],
  ])('AC-4608.2: %s 사용자는 줄을 0줄로 읽고, 넣기는 거부되고, 지우기는 0줄이다', async (_label, user) => {
    if (hospital[user]) await seed(user)
    const before = await snapshot()
    await become(user)
    expect(await rows(`select * from ${TABLE}`)).toEqual([])
    await expect(insert(ROW)).rejects.toThrow(RLS)
    expect(await rows(`delete from ${TABLE} returning id`)).toEqual([])
    expect(await snapshot()).toEqual(before)
  })

  it.each([
    ['내 병원', A],
    ['B 병원', B],
  ])('AC-4608.2: hospital_id를 직접 넣으면(%s) 권한 없음이다', async (_label, owner) => {
    await become(A)
    await expect(insert({ hospital_id: hospital[owner], ...ROW })).rejects.toThrow(DENIED)
    expect(await snapshot()).toEqual([])
  })

  it.each([
    ['id', OTHER_ID],
    ['created_at', OLD],
  ])('AC-4608.2: %s를 직접 넣으면 권한 없음이다', async (column, value) => {
    await become(A)
    await expect(insert({ ...ROW, [column]: value })).rejects.toThrow(DENIED)
    expect(await snapshot()).toEqual([])
  })

  it('AC-4608.2: path를 직접 넣으면(내 병원 모양이어도) 거부된다', async () => {
    await become(A)
    await expect(insert({ ...ROW, path: `${hospital[A]}/${OTHER_ID}.jpg` })).rejects.toThrow(GENERATED)
    expect(await snapshot()).toEqual([])
  })
})

describe('AC-4608.3 내 배경 칸 제약', SLOW, () => {
  beforeEach(() => become(A))

  it.each([
    ['words 0자', { words: '' }],
    ['words 31자', { words: 'a'.repeat(31) }],
    ['words 한글 31자', { words: '가'.repeat(31) }],
    ['words 줄바꿈', { words: '봄\n벚꽃' }],
    ['words 뒤 줄바꿈', { words: '봄 벚꽃\n' }],
    ['words 탭', { words: '봄\t벚꽃' }],
    ['words 제어 문자(DEL)', { words: '봄\u007f벚꽃' }],
    ['accent 대문자', { accent: '#C2185B' }],
    ['accent 7자리', { accent: '#c2185b0' }],
    ['accent 5자리', { accent: '#c2185' }],
    ['accent # 없음', { accent: 'c2185b' }],
    ['accent 16진수 아님', { accent: '#c2185g' }],
    ['accent 뒤 줄바꿈', { accent: '#c2185b\n' }],
    ['thumb /9j/ 아님(PNG)', { thumb: 'iVBORw0KGgoAAAANSUhEUgAA' }],
    ['thumb data: 주소', { thumb: `data:image/jpeg;base64,${THUMB}` }],
    ['thumb 빈 글', { thumb: '' }],
    ['thumb 빈칸', { thumb: '/9j/4AAQ SkZJ' }],
    ['thumb = 셋', { thumb: '/9j/4AAQSkZ===' }],
    ['thumb 뒤 줄바꿈', { thumb: `${THUMB}\n` }],
    ['thumb 16,001자', { thumb: `/9j/${'A'.repeat(15997)}` }],
  ])('AC-4608.3 거부: %s → 줄이 남지 않는다', async (_label, change) => {
    await expect(insert({ ...ROW, ...change })).rejects.toThrow(CHECK)
    expect(await snapshot()).toEqual([])
  })

  it.each([
    ['words 1자', { words: '봄' }],
    ['words 30자', { words: 'a'.repeat(30) }],
    ['words 한글 30자', { words: '가'.repeat(30) }],
    ['words 그림 문자', { words: '🌸 봄 벚꽃' }],
    ['accent 숫자만', { accent: '#000000' }],
    ['thumb = 둘', { thumb: '/9j/4AAQSkZJRg==' }],
    ['thumb 16,000자', { thumb: `/9j/${'A'.repeat(15996)}` }],
  ])('AC-4608.3 허용: %s → 그대로 저장된다', async (_label, change) => {
    const row = { ...ROW, ...change }
    await insert(row)
    await operator()
    expect(await rows(`select words, accent, thumb from ${TABLE}`)).toEqual([row])
  })

  it.each(['words', 'accent', 'thumb'])('AC-4608.3: %s는 비울 수 없다(SQL null)', async (column) => {
    await expect(insert({ ...ROW, [column]: null })).rejects.toThrow(NOT_NULL)
    expect(await snapshot()).toEqual([])
  })

  it('AC-4608.3: 운영자가 넣어도 칸 제약은 같다', async () => {
    await operator()
    await expect(insert({ hospital_id: hospital[A], ...ROW, words: '' })).rejects.toThrow(CHECK)
    await expect(insert({ hospital_id: hospital[A], ...ROW, accent: '#ABCDEF' })).rejects.toThrow(CHECK)
    await expect(insert({ hospital_id: hospital[A], ...ROW, thumb: 'AAAA' })).rejects.toThrow(CHECK)
    expect(await snapshot()).toEqual([])
  })
})

describe('AC-4607.1 하루 한도 표', SLOW, () => {
  it('AC-4607.1: 칸은 hospital_id·day·images이고 기본 키는 (hospital_id, day), RLS가 켜져 있다', async () => {
    const columns = await rows(
      `select column_name, udt_name, is_nullable from information_schema.columns
       where table_schema = 'public' and table_name = 'ai_image_days' order by ordinal_position`,
    )
    expect(columns).toEqual([
      { column_name: 'hospital_id', udt_name: 'uuid', is_nullable: 'NO' },
      { column_name: 'day', udt_name: 'date', is_nullable: 'NO' },
      { column_name: 'images', udt_name: 'int4', is_nullable: 'NO' },
    ])
    const key = await rows(
      `select a.attname from pg_index i
       join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
       where i.indrelid = $1::regclass and i.indisprimary order by a.attnum`,
      [DAYS],
    )
    expect(key.map((row) => row.attname)).toEqual(['hospital_id', 'day'])
    expect(await rows(`select relrowsecurity as on from pg_class where oid = $1::regclass`, [DAYS])).toEqual([{ on: true }])
  })

  it('AC-4607.1: anon·authenticated·PUBLIC에게 표·칸 권한이 하나도 없고, 정책도 없다', async () => {
    for (const role of ['anon', 'authenticated', 'public']) {
      for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']) {
        expect([role, privilege, (await rows(`select has_any_column_privilege($1, $2, $3) as ok`, [role, DAYS, privilege]))[0].ok]).toEqual([
          role,
          privilege,
          false,
        ])
      }
      for (const privilege of ['DELETE', 'TRUNCATE', 'TRIGGER']) {
        expect([role, privilege, (await rows(`select has_table_privilege($1, $2, $3) as ok`, [role, DAYS, privilege]))[0].ok]).toEqual([
          role,
          privilege,
          false,
        ])
      }
    }
    expect(await rows(`select policyname from pg_policies where schemaname = 'public' and tablename = 'ai_image_days'`)).toEqual([])
  })

  it.each([
    ['A(승인)', () => become(A)],
    ['anon', () => becomeAnon()],
  ])('AC-4607.1: %s는 ai_image_days를 직접 읽기·넣기·고치기·지우기 모두 권한 없음이다', async (_label, as) => {
    await operator()
    await insertInto(DAYS, { hospital_id: hospital[A], day: '2027-05-05', images: 3 })
    const before = await days()
    await as()
    await expect(rows(`select * from ${DAYS}`)).rejects.toThrow(DENIED)
    await expect(insertInto(DAYS, { hospital_id: hospital[A], day: '2027-05-06', images: 0 })).rejects.toThrow(DENIED)
    await expect(rows(`update ${DAYS} set images = 0`)).rejects.toThrow(DENIED)
    await expect(rows(`delete from ${DAYS}`)).rejects.toThrow(DENIED)
    expect(await days()).toEqual(before)
  })

  it.each([
    ['21', 21],
    ['-1', -1],
  ])('AC-4607.1: images %s는 운영자가 넣어도 거부된다(0~20)', async (_label, images) => {
    await operator()
    await expect(insertInto(DAYS, { hospital_id: hospital[A], day: '2027-05-05', images })).rejects.toThrow(CHECK)
    await insertInto(DAYS, { hospital_id: hospital[A], day: '2027-05-05', images: PER_DAY })
    expect(await days()).toEqual([{ hospital_id: hospital[A], day: '2027-05-05', images: PER_DAY }])
  })

  it('AC-4607.1: 병원 줄을 지우면(운영자) 그 병원 하루 한도 줄도 지워진다', async () => {
    await operator()
    await insertInto(DAYS, { hospital_id: hospital[A], day: '2027-05-05', images: 1 })
    await insertInto(DAYS, { hospital_id: hospital[B], day: '2027-05-05', images: 2 })
    await rows('delete from public.hospitals where id = $1', [hospital[A]])
    expect(await days()).toEqual([{ hospital_id: hospital[B], day: '2027-05-05', images: 2 }])
  })
})

describe('AC-4607.2 take_ai_image()', SLOW, () => {
  it('AC-4607.2: 인자 없이 참/거짓을 돌려주고, 만든 사람 권한(security definer)·빈 search_path다', async () => {
    expect(
      await rows(
        `select prosecdef, proconfig, prorettype::regtype::text as returns, pronargs from pg_proc where oid = to_regprocedure($1)`,
        [TAKE],
      ),
    ).toEqual([{ prosecdef: true, proconfig: ['search_path=""'], returns: 'boolean', pronargs: 0 }])
  })

  it.each([
    ['public', false],
    ['anon', false],
    ['authenticated', true],
  ])('AC-4607.2: take_ai_image() 실행 권한 %s = %s', async (role, allowed) => {
    expect(await rows(`select has_function_privilege($1, $2, 'EXECUTE') as ok`, [role, TAKE])).toEqual([{ ok: allowed }])
  })

  it('AC-4607.2: 하루 20번째까지 true, 21번째부터 false이고 장 수는 20에서 멈춘다(오늘은 한국 날짜)', async () => {
    const dayBefore = seoulDay()
    await become(A)
    const results: unknown[] = []
    for (let i = 0; i < PER_DAY + 2; i += 1) results.push(await take())
    const dayAfter = seoulDay()
    expect(results).toEqual([...Array<boolean>(PER_DAY).fill(true), false, false])
    const list = await days()
    expect(list).toEqual([{ hospital_id: hospital[A], day: expect.any(String), images: PER_DAY }])
    expect([dayBefore, dayAfter]).toContain(list[0].day)
  })

  it('AC-4607.2: 세션 시간대가 한국이 아니어도 오늘은 한국 날짜다', async () => {
    const dayBefore = seoulDay()
    await become(A)
    await db.exec(`set timezone = 'Pacific/Honolulu'`)
    try {
      expect(await take()).toBe(true)
    } finally {
      await db.exec('reset timezone')
    }
    const dayAfter = seoulDay()
    const list = await days()
    expect(list).toHaveLength(1)
    expect([dayBefore, dayAfter]).toContain(list[0].day)
  })

  it('AC-4607.2: 다른 날 줄(어제 20장·내일 20장)은 오늘 수에 들지 않고 그대로다', async () => {
    await operator()
    for (const shift of ['- 1', '+ 1']) {
      await rows(
        `insert into ${DAYS} (hospital_id, day, images) values ($1, (now() at time zone 'Asia/Seoul')::date ${shift}, $2)`,
        [hospital[A], PER_DAY],
      )
    }
    const others = await days()
    await become(A)
    expect(await take()).toBe(true)
    expect(await take()).toBe(true)
    const list = await days()
    expect(list).toHaveLength(3)
    expect(list).toEqual(expect.arrayContaining(others))
    expect(list.filter((row) => !others.some((old) => old.day === row.day))).toEqual([
      { hospital_id: hospital[A], day: expect.any(String), images: 2 },
    ])
  })

  it('AC-4607.2: 병원끼리 따로 센다(B가 20장을 써도 A는 된다)', async () => {
    await become(B)
    for (let i = 0; i < PER_DAY; i += 1) await take()
    expect(await take()).toBe(false)
    await become(A)
    expect(await take()).toBe(true)
    const list = await days()
    expect(list.map((row) => [row.hospital_id, row.images]).sort()).toEqual(
      [
        [hospital[A], 1],
        [hospital[B], PER_DAY],
      ].sort(),
    )
  })

  it.each([
    ['승인 대기', PENDING],
    ['거절', REJECTED],
    ['가입 신청 안 함', NO_HOSPITAL],
  ])('AC-4607.2: %s 사용자는 오류 42501이고 줄이 생기지 않는다', async (_label, user) => {
    await become(user)
    await expect(take()).rejects.toMatchObject({ code: '42501', message: expect.stringMatching(/hospital not approved/) })
    expect(await days()).toEqual([])
  })

  it('AC-4607.2: anon은 부를 권한이 없다', async () => {
    await becomeAnon()
    await expect(take()).rejects.toThrow(/permission denied for function take_ai_image/)
    expect(await days()).toEqual([])
  })
})

describe('AC-4608.4 그림 저장소 버킷', SLOW, () => {
  it('AC-4608.4: form-backgrounds 버킷은 공개가 아니고 한 파일 3,000,000바이트·image/jpeg만이다', async () => {
    await operator()
    expect(
      await rows(`select id, name, public, file_size_limit, allowed_mime_types from storage.buckets where id = $1`, [BUCKET]),
    ).toEqual([{ id: BUCKET, name: BUCKET, public: false, file_size_limit: 3_000_000, allowed_mime_types: ['image/jpeg'] }])
  })

  it('AC-4608.4: storage.objects 정책은 이 파일의 읽기·올리기·지우기 셋뿐이고 고치기 정책이 없다', async () => {
    const list = await rows(
      `select cmd, permissive, roles::text as roles, qual, with_check from pg_policies
       where schemaname = 'storage' and tablename = 'objects' order by cmd`,
    )
    expect(list.map((p) => p.cmd)).toEqual(['DELETE', 'INSERT', 'SELECT'])
    for (const policy of list) {
      expect(policy).toMatchObject({ permissive: 'PERMISSIVE', roles: '{authenticated}' })
      const rule = String(policy.cmd === 'INSERT' ? policy.with_check : policy.qual)
      expect(rule).toContain(`'${BUCKET}'`)
      expect(rule).toContain('foldername')
      expect(rule).toContain('my_hospital_id()')
      if (policy.cmd === 'INSERT') expect(rule).toContain('form_backgrounds')
      else expect(rule).not.toContain('form_backgrounds')
    }
  })

  it('AC-4608.4: A는 내 줄의 path로 그림을 올리고 읽고 지운다(줄 넣기 → 올리기)', async () => {
    await become(A)
    const [mine] = await insert(ROW, 'returning path')
    expect(await upload(mine.path as string)).toEqual([{ bucket_id: BUCKET, name: mine.path, owner: A }])
    expect(await rows(`select name from storage.objects`)).toEqual([{ name: mine.path }])
    expect(await rows(`delete from storage.objects where name = $1 returning name`, [mine.path])).toEqual([{ name: mine.path }])
    expect(await objects()).toEqual([])
  })

  it('AC-4608.4: 줄을 먼저 지워도 내 폴더 그림은 지울 수 있다(치우기)', async () => {
    await become(A)
    const [mine] = await insert(ROW, 'returning id, path')
    await upload(mine.path as string)
    await rows(`delete from ${TABLE} where id = $1`, [mine.id])
    expect(await rows(`delete from storage.objects where name = $1 returning name`, [mine.path])).toEqual([{ name: mine.path }])
    expect(await objects()).toEqual([])
  })

  it('AC-4608.4: 내 폴더라도 표에 줄이 없는 이름은 올리지 못한다', async () => {
    await become(A)
    const [mine] = await insert(ROW, 'returning id')
    for (const name of [
      `${hospital[A]}/${OTHER_ID}.jpg`,
      `${hospital[A]}/${mine.id}.png`,
      `${hospital[A]}/${mine.id}`,
      `${hospital[A]}/x/${mine.id}.jpg`,
      `${hospital[A]}/`,
    ]) {
      await expect(upload(name), name).rejects.toThrow(RLS)
    }
    expect(await objects()).toEqual([])
  })

  it('AC-4608.4: 다른 병원 줄의 path(다른 병원 폴더)로는 올리지 못한다', async () => {
    const theirs = await seed(B)
    await become(A)
    await expect(upload(theirs.path as string)).rejects.toThrow(RLS)
    expect(await objects()).toEqual([])
  })

  it('AC-4608.4: 내 줄의 path라도 다른 버킷에는 올리지 못한다', async () => {
    await become(A)
    const [mine] = await insert(ROW, 'returning path')
    await expect(upload(mine.path as string, OTHER_BUCKET)).rejects.toThrow(RLS)
    expect(await objects()).toEqual([])
  })

  it('AC-4608.4: 다른 병원 그림은 안 보이고 안 지워지며, 다른 버킷의 내 폴더 그림도 안 보이고 안 지워진다', async () => {
    const theirs = await seed(B)
    await seedObject(theirs.path as string)
    await seedObject(`${hospital[A]}/${OTHER_ID}.jpg`, OTHER_BUCKET)
    const before = await objects()
    await become(A)
    expect(await rows(`select name from storage.objects`)).toEqual([])
    expect(await rows(`delete from storage.objects returning name`)).toEqual([])
    expect(await objects()).toEqual(before)
  })

  it('AC-4608.4: 고치기(이름 바꾸기·옮기기)는 내 그림이어도 0줄이다', async () => {
    await become(A)
    const [mine] = await insert(ROW, 'returning path')
    await upload(mine.path as string)
    const theirs = await seed(B)
    await seedObject(theirs.path as string)
    const before = await objects()
    await become(A)
    expect(await rows(`update storage.objects set metadata = '{}'::jsonb returning name`)).toEqual([])
    expect(await rows(`update storage.objects set name = $1 returning name`, [`${hospital[A]}/${OTHER_ID}.jpg`])).toEqual([])
    expect(await rows(`update storage.objects set bucket_id = $1 returning name`, [OTHER_BUCKET])).toEqual([])
    expect(await objects()).toEqual(before)
  })

  it.each([
    ['승인 대기', PENDING],
    ['거절', REJECTED],
  ])('AC-4608.4: %s 사용자는 자기 폴더 그림도 못 보고 못 올리고 못 지운다', async (_label, user) => {
    const theirs = await seed(user)
    await seedObject(theirs.path as string)
    const before = await objects()
    await become(user)
    expect(await rows(`select name from storage.objects`)).toEqual([])
    await expect(upload(`${hospital[user]}/${OTHER_ID}.jpg`)).rejects.toThrow(RLS)
    expect(await rows(`delete from storage.objects returning name`)).toEqual([])
    expect(await objects()).toEqual(before)
  })

  it('AC-4608.4: anon은 그림을 못 보고 못 올리고 못 고치고 못 지운다', async () => {
    const mine = await seed(A)
    await seedObject(mine.path as string)
    const before = await objects()
    await becomeAnon()
    expect(await rows(`select name from storage.objects`)).toEqual([])
    await expect(upload(`${hospital[A]}/${OTHER_ID}.jpg`)).rejects.toThrow(RLS)
    expect(await rows(`update storage.objects set metadata = '{}'::jsonb returning name`)).toEqual([])
    expect(await rows(`delete from storage.objects returning name`)).toEqual([])
    expect(await objects()).toEqual(before)
  })
})

describe('AC-4608.5 휴진 안내 theme 칸', SLOW, () => {
  it.each([
    ['내 배경 bg-<uuid> 39자', `bg-${BG_UUID}`],
    ['40자', 'a'.repeat(40)],
    ['저절로(null)', null],
    ['테마 열쇠 m05', 'm05'],
    ['그림 2 m05-2', 'm05-2'],
    ['저절로 그림 2 auto-2', 'auto-2'],
  ])('AC-4608.5 허용: %s', async (_label, theme) => {
    expect(`bg-${BG_UUID}`).toHaveLength(39)
    await become(A)
    expect(
      await insertInto(NOTICES, { year: 2027, month: 5, cards: '[{"name":"가짜"}]', theme }, 'returning hospital_id, theme'),
    ).toEqual([{ hospital_id: hospital[A], theme }])
  })

  it.each([
    ['41자', 'a'.repeat(41)],
    ['bg- 대문자 uuid', `bg-${BG_UUID.toUpperCase()}`],
    ['대문자·밑줄', 'Bad_Theme'],
    ['빈 글', ''],
    ['뒤 줄바꿈', 'm05\n'],
  ])('AC-4608.5 거부: %s', async (_label, theme) => {
    await become(A)
    await expect(insertInto(NOTICES, { year: 2027, month: 5, cards: '[{"name":"가짜"}]', theme })).rejects.toThrow(CHECK)
    expect(await snapshot(NOTICES)).toEqual([])
  })

  it('AC-4608.5: 고치기에도 같은 제약이 걸린다(bg- 값으로 고치기 되고, 41자는 거부)', async () => {
    await become(A)
    const [added] = await insertInto(NOTICES, { year: 2027, month: 5, cards: '[{"name":"가짜"}]', theme: 'm05' }, 'returning id')
    expect(await rows(`update ${NOTICES} set theme = $1 returning theme`, [`bg-${BG_UUID}`])).toEqual([{ theme: `bg-${BG_UUID}` }])
    await expect(rows(`update ${NOTICES} set theme = $1`, ['a'.repeat(41)])).rejects.toThrow(CHECK)
    await operator()
    expect(await rows(`select id, theme from ${NOTICES}`)).toEqual([{ id: added.id, theme: `bg-${BG_UUID}` }])
  })

  it('AC-4608.5: theme 제약 하나만 32자 → 40자로 바뀌고 칸·다른 제약·권한·정책·트리거·RLS는 그대로다', () => {
    const theme = (shape: Shape) => shape.constraints.filter((c) => String(c.def).includes('theme'))
    expect(theme(noticesBefore)).toEqual([
      { conname: 'form_notices_theme_check', contype: 'c', def: `CHECK ((theme ~ '^[a-z0-9-]{1,32}$'::text))` },
    ])
    expect(theme(noticesAfter)).toEqual([
      { conname: 'form_notices_theme_check', contype: 'c', def: `CHECK ((theme ~ '^[a-z0-9-]{1,40}$'::text))` },
    ])
    const rest = (shape: Shape) => ({ ...shape, constraints: shape.constraints.filter((c) => !String(c.def).includes('theme')) })
    expect(rest(noticesAfter)).toEqual(rest(noticesBefore))
    expect(noticesBefore.columnGrants.length).toBeGreaterThan(0) // 빈 비교가 아니다
    expect(noticesBefore.policies).toHaveLength(4)
  })

  it('AC-4608.5: 이미 저장된 휴진 안내(null·m05·32자)는 이 파일을 돌린 뒤에도 그대로다', async () => {
    expect(oldNotices.map((row) => row.theme).sort()).toEqual([null, 'm05', 'a'.repeat(32)].sort())
    expect((await full.query<Row>(`select id, theme from public.form_notices order by id`)).rows).toEqual(oldNotices)
  })
})

describe('AC-4608.1 파일', SLOW, () => {
  it('AC-4608.1: 파일 머리 주석에 붙여 넣는 방법·먼저 있어야 하는 파일·여러 번 실행해도 된다는 말이 있다', () => {
    const lines = BACKGROUNDS_MIGRATION.split('\n')
    const head = lines.slice(0, lines.findIndex((line) => !/^(--|\s*$)/.test(line))).join('\n')
    expect(head).toContain('운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다')
    expect(head).toContain('20261028000000_auth.sql')
    expect(head).toContain('20261110000000_form_notices.sql')
    expect(head).toContain('여러 번 실행해도')
    expect(head).toContain('form-backgrounds')
  })

  it('AC-4608.1: my_hospital_id()는 cross-branch C1 글자 그대로다', () => {
    expect(BACKGROUNDS_MIGRATION).toContain(C1_MY_HOSPITAL_ID)
  })

  it.each([
    ['table', TABLE],
    ['table', DAYS],
    ['function', TAKE],
  ])('AC-4608.1: %s %s 권한은 revoke all 뒤에만 준다', (kind, name) => {
    const revoke = BACKGROUNDS_SQL.indexOf(`revoke all on ${kind} ${name} from public, anon, authenticated;`)
    expect(revoke).toBeGreaterThanOrEqual(0)
    const escaped = name.replace(/[.()]/g, (c) => `\\${c}`)
    for (const grant of BACKGROUNDS_SQL.matchAll(new RegExp(`^grant [^;]+ on ${kind} ${escaped} to [^;]+;`, 'gm'))) {
      expect(grant.index).toBeGreaterThan(revoke)
    }
  })

  it('AC-4607.3: 하루 한도 숫자 20이 함수(d.images < 20)와 표 제약(between 0 and 20)에 글자로 있다', () => {
    expect(BACKGROUNDS_SQL).toContain('d.images < 20')
    expect(BACKGROUNDS_SQL).toContain('between 0 and 20')
  })

  it('AC-4608.1: 다른 갈래 표를 고치지 않는다 — 고치는 표는 이 파일의 두 표와 form_notices(theme 제약)뿐, storage 표는 고치지 않는다', () => {
    const targets = [...BACKGROUNDS_SQL.matchAll(/^\s*alter table\s+(\S+)/gim)].map((m) => m[1])
    expect(new Set(targets)).toEqual(new Set([TABLE, DAYS, NOTICES]))
    expect(BACKGROUNDS_SQL).not.toMatch(/alter table\s+storage\./i)
    expect([...BACKGROUNDS_SQL.matchAll(/^\s*alter table public\.form_notices\s+([^;]+);/gim)].map((m) => m[1].replace(/\s+/g, ' '))).toEqual([
      'drop constraint form_notices_theme_check',
      `add constraint form_notices_theme_check check (theme ~ '^[a-z0-9-]{1,40}$')`,
    ])
    for (const other of [/\btouch_updated_at\b/, /\bform_guides\b/, /\brx_groups\b/, /\bstats_/, /\bclaim_/, /\bai_usage\b/, /\bai_reports\b/]) {
      expect(BACKGROUNDS_SQL).not.toMatch(other)
    }
  })

  it('AC-4608.1: 지우는 문장은 theme 제약 바꾸기와 정책 다시 만들기(drop policy if exists)뿐이고, 비우기·줄 지우기가 없다', () => {
    expect(BACKGROUNDS_SQL).not.toMatch(/^\s*(drop\s+(table|function|schema|index|trigger|bucket)|truncate|delete\s+from)\b/im)
    const drops = [...BACKGROUNDS_SQL.matchAll(/\bdrop\s+(\w+)/gi)].map((m) => m[1].toLowerCase())
    expect(new Set(drops)).toEqual(new Set(['constraint', 'policy']))
    expect(BACKGROUNDS_SQL).not.toMatch(/drop policy (?!if exists)/i)
  })

  it('AC-4608.1: 여러 번 실행해도 되게 쓴다 — 표는 if not exists, 함수는 create or replace, 정책은 지우고 다시 만들고, 버킷은 on conflict', () => {
    expect([...BACKGROUNDS_SQL.matchAll(/create table\s+(if not exists\s+)?(\S+)/gi)].map((m) => [m[1]?.trim(), m[2]])).toEqual([
      ['if not exists', TABLE],
      ['if not exists', DAYS],
    ])
    expect([...BACKGROUNDS_SQL.matchAll(/create\s+(or replace\s+)?function\s+(\S+?)\(/gi)].map((m) => [m[1]?.trim(), m[2]])).toEqual([
      ['or replace', 'public.my_hospital_id'],
      ['or replace', 'public.take_ai_image'],
    ])
    const creates = [...BACKGROUNDS_SQL.matchAll(/create policy ("[^"]+") on (\S+)/gi)]
    expect(creates).toHaveLength(6)
    for (const [, policy, on] of creates) {
      const drop = BACKGROUNDS_SQL.indexOf(`drop policy if exists ${policy} on ${on};`)
      expect(drop, `${policy} on ${on}`).toBeGreaterThanOrEqual(0)
      expect(drop).toBeLessThan(BACKGROUNDS_SQL.indexOf(`create policy ${policy} on ${on}`))
    }
    expect(BACKGROUNDS_SQL).toMatch(/insert into storage\.buckets[^;]+on conflict \(id\) do update/)
  })

  it('AC-4608.1: 다른 migration이 먼저 있어도 돌고, 새 표 둘·함수 하나·storage 정책 셋만 더하며 이미 있던 함수는 정의·권한이 그대로다', () => {
    expect(afterBackgrounds.tables).toEqual([...beforeBackgrounds.tables, 'ai_image_days', 'form_backgrounds'].sort())
    const added = afterBackgrounds.functions.filter((fn) => !beforeBackgrounds.functions.some((old) => old.fn === fn.fn))
    expect(added.map((fn) => fn.fn)).toEqual(['take_ai_image()'])
    expect(afterBackgrounds.functions.filter((fn) => fn.fn !== 'take_ai_image()')).toEqual(beforeBackgrounds.functions)
    expect(beforeBackgrounds.functions.map((fn) => fn.fn)).toEqual(
      expect.arrayContaining(['my_hospital_id()', 'add_ai_usage(bigint,bigint,bigint)', 'form_notices_touch()', 'form_guides_touch()']),
    )
    expect(beforeBackgrounds.storagePolicies).toEqual([])
    expect(afterBackgrounds.storagePolicies).toHaveLength(3)
  })

  it('AC-4608.1: 다른 migration이 먼저 있는 DB에서도 새 표·함수와 이미 있던 표(휴진·환자 안내문)가 함께 돈다', async () => {
    const main = db
    db = full
    try {
      await resetData()
      await become(A)
      const [mine] = await insert(ROW, 'returning hospital_id, path')
      expect(mine.hospital_id).toBe(hospital[A])
      expect(await upload(mine.path as string)).toHaveLength(1)
      expect(await take()).toBe(true)
      expect(
        await insertInto(NOTICES, { year: 2027, month: 5, cards: '[{"name":"가짜"}]', theme: `bg-${BG_UUID}` }, 'returning hospital_id'),
      ).toEqual([{ hospital_id: hospital[A] }])
      expect(await rows(`insert into public.form_guides (content) values ('{}'::jsonb) returning hospital_id`)).toEqual([
        { hospital_id: hospital[A] },
      ])
    } finally {
      await db.exec('reset role; reset request.jwt.claims')
      db = main
    }
  })

  it('AC-4608.1: 두 번 실행해도 오류가 없고, 넣어 둔 줄은 남고, 표·함수·정책·권한·버킷 설정은 이 파일 값으로 같다', async () => {
    const twice = await PGlite.create()
    const main = db
    try {
      await setUp(twice)
      await twice.exec(NOTICES_MIGRATION)
      await twice.exec(BACKGROUNDS_MIGRATION)
      const first = { schema: await schemaOf(twice), notices: await noticesShape(twice), all: await everything(twice) }
      db = twice
      await resetData()
      await become(A)
      const [mine] = await insert(ROW, 'returning id, path')
      await upload(mine.path as string)
      expect(await take()).toBe(true)
      await insertInto(NOTICES, { year: 2027, month: 5, cards: '[{"name":"가짜"}]', theme: `bg-${mine.id}` })
      await operator()
      // 누가 관리 화면에서 버킷을 공개로 바꿔 두었어도 다시 붙이면 이 파일 값으로 돌아온다
      await twice.exec(`update storage.buckets set public = true, file_size_limit = 1, allowed_mime_types = null where id = '${BUCKET}'`)
      const data = {
        backgrounds: await snapshot(),
        days: await days(),
        objects: await objects(),
        notices: await rows(`select id, theme from ${NOTICES}`),
      }

      await twice.exec(BACKGROUNDS_MIGRATION)

      expect({ schema: await schemaOf(twice), notices: await noticesShape(twice), all: await everything(twice) }).toEqual(first)
      expect({
        backgrounds: await snapshot(),
        days: await days(),
        objects: await objects(),
        notices: await rows(`select id, theme from ${NOTICES}`),
      }).toEqual(data)
      expect(data.backgrounds).toHaveLength(1)
      expect(await rows(`select public, file_size_limit, allowed_mime_types from storage.buckets where id = $1`, [BUCKET])).toEqual([
        { public: false, file_size_limit: 3_000_000, allowed_mime_types: ['image/jpeg'] },
      ])
      // 다시 붙인 뒤에도 하루 한도는 이어서 센다
      await become(A)
      expect(await take()).toBe(true)
      expect((await days())[0].images).toBe(2)
    } finally {
      db = main
      await twice.close()
    }
  }, 120_000)
})

// 두 번 실행 비교용: 이 파일이 만드는 것의 모양(칸·제약·권한·정책·함수 설정·버킷)
async function everything(target: PGlite) {
  const q = async (sql: string) => (await target.query<Row>(sql)).rows
  return {
    columns: await q(
      `select table_name, column_name, data_type, is_nullable, column_default, generation_expression from information_schema.columns
       where table_schema = 'public' and table_name in ('form_backgrounds', 'ai_image_days') order by table_name, ordinal_position`,
    ),
    constraints: await q(
      `select conrelid::regclass::text as tbl, conname, pg_get_constraintdef(oid) as def from pg_constraint
       where conrelid in ('public.form_backgrounds'::regclass, 'public.ai_image_days'::regclass) order by 1, 2`,
    ),
    tableGrants: await q(
      `select table_name, grantee, privilege_type from information_schema.role_table_grants
       where table_schema = 'public' and table_name in ('form_backgrounds', 'ai_image_days') order by 1, 2, 3`,
    ),
    columnGrants: await q(
      `select table_name, grantee, column_name, privilege_type from information_schema.column_privileges
       where table_schema = 'public' and table_name in ('form_backgrounds', 'ai_image_days') order by 1, 2, 3, 4`,
    ),
    policies: await q(
      `select schemaname, tablename, policyname, cmd, permissive, roles::text as roles, qual, with_check from pg_policies
       where (schemaname = 'public' and tablename in ('form_backgrounds', 'ai_image_days')) or schemaname = 'storage' order by 1, 2, 3`,
    ),
    rls: await q(
      `select relname, relrowsecurity, relforcerowsecurity from pg_class
       where oid in ('public.form_backgrounds'::regclass, 'public.ai_image_days'::regclass) order by 1`,
    ),
    take: await q(`select prosecdef, proconfig, coalesce(proacl::text, '') as acl from pg_proc where oid = to_regprocedure('${TAKE}')`),
    buckets: await q(`select id, name, public, file_size_limit, allowed_mime_types from storage.buckets order by id`),
  }
}

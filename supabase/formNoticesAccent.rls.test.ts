import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

// 휴진 안내 글자 색 칸(form_notices.accent) (forms-accent REQ-4704, TASK-1).
// formBackgrounds.rls.test.ts와 같은 방법: 진짜 Postgres(PGlite, WASM)에서 운영자가 SQL 편집기에 붙일 파일을 그대로 돌린다.
// 실제 Supabase에는 붙지 않는다. Supabase가 미리 갖춘 것(역할·auth 스키마·새 표·함수·순서표의 기본 권한,
// 그리고 내 배경 파일이 쓰는 storage 스키마의 버킷 표·objects 표·foldername 함수)만 흉내 낸다.
// 앞 마이그레이션(인증 → 휴진 안내 → 내 배경)을 먼저 돌린 DB에 이 파일을 더한다
const fileOf = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))
const read = (rel: string) => readFileSync(fileOf(rel), 'utf-8')
const AUTH_MIGRATION = read('./migrations/20261028000000_auth.sql')
const NOTICES_MIGRATION = read('./migrations/20261110000000_form_notices.sql')
const BACKGROUNDS_MIGRATION = read('./migrations/20261115020000_form_backgrounds.sql')
const ACCENT_PATH = fileOf('./migrations/20261115030000_form_notices_accent.sql')
// 파일이 아직 없으면 빈 글자로 돌아, 시험마다 '칸이 없다'로 실패한다(무엇이 빠졌는지 시험별로 보인다)
const ACCENT_MIGRATION = existsSync(ACCENT_PATH) ? readFileSync(ACCENT_PATH, 'utf-8') : ''
// 주석을 뺀 SQL 글자(머리 주석이 다른 표·파일 이름을 설명으로 말할 수 있다)
const ACCENT_SQL = ACCENT_MIGRATION.split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n')

// design.md 8절의 SQL(글자 그대로, 문장마다)
const DESIGN_STATEMENTS = [
  'alter table public.form_notices add column if not exists accent text',
  'alter table public.form_notices drop constraint if exists form_notices_accent_check',
  `alter table public.form_notices add constraint form_notices_accent_check check (accent ~ '^#[0-9a-f]{6}$')`,
  'grant insert (accent), update (accent) on table public.form_notices to authenticated',
]

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

// 내 배경 파일(20261115020000)이 버킷 줄과 storage 정책을 더하므로 formBackgrounds.rls.test.ts와 같은 흉내를 둔다
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

const A = '00000000-0000-4000-8000-00000000000a' // 승인된 병원 A
const B = '00000000-0000-4000-8000-00000000000b' // 승인된 다른 병원 B
const PENDING = '00000000-0000-4000-8000-00000000000c' // 승인 대기
const REJECTED = '00000000-0000-4000-8000-00000000000d' // 거절
const NO_HOSPITAL = '00000000-0000-4000-8000-00000000000e' // 로그인만 하고 가입 신청을 안 함(병원 줄 없음)
const STATUS: Record<string, string> = { [A]: 'approved', [B]: 'approved', [PENDING]: 'pending', [REJECTED]: 'rejected' }

type Row = Record<string, unknown>

const TABLE = 'public.form_notices'
const CHECK_NAME = 'form_notices_accent_check'
const SENT = ['year', 'month', 'cards', 'theme', 'accent'] // 사용자가 보낼 수 있는 칸(그 밖은 칸 권한이 없다)
const OLD = '2001-01-01T00:00:00.000Z' // 운영자가 심는 옛 시각(DB가 바꿨는지 보려고)
const OTHER_ID = '00000000-0000-4000-8000-000000000123'
const BG_UUID = '0f8fad5b-d9cb-469f-a165-70867728950e'

// 지어낸 안내문. 카드 모양은 src/types/forms.ts NoticeCard(DB는 배열 길이·크기만 본다)
const CARD = { start: '2027-05-05', end: null, name: '어린이날', status: '휴진' }
const NOTICE: Row = { year: 2027, month: 5, cards: [CARD], theme: 'm05', accent: '#c2185b' }

const SLOW = { timeout: 60_000 }
const DENIED = /permission denied/
const CHECK = /check constraint/
const RLS = /row-level security/

let db: PGlite // 흉내 → 인증 → 휴진 안내 → 내 배경 → 이 파일
let hospital: Record<string, string> = {}
type Shape = Awaited<ReturnType<typeof noticesShape>>
type Schema = Awaited<ReturnType<typeof schemaOf>>
let shapeBefore: Shape // 이 파일을 돌리기 전 휴진 안내 표 모양
let shapeAfter: Shape // 돌린 뒤
let schemaBefore: Schema
let schemaAfter: Schema
let oldBefore: Row[] = [] // 이 파일을 돌리기 전에 들어 있던 휴진 안내 줄
let oldAfter: Row[] = [] // 같은 줄을 돌린 뒤에 다시 읽은 것

async function setUp(target: PGlite) {
  await target.exec(SUPABASE_MOCK)
  await target.exec(STORAGE_MOCK)
  await target.exec(AUTH_MIGRATION)
  await target.exec(NOTICES_MIGRATION)
  await target.exec(BACKGROUNDS_MIGRATION)
}

// 휴진 안내 표의 모양(칸·제약·권한·정책·트리거·RLS). formBackgrounds.rls.test.ts의 noticesShape와 같다
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

// 다른 표·함수가 그대로인지 보려고 public의 표 이름과 함수(정의·권한), storage 정책, 버킷을 모은다
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
    storagePolicies: await q(
      `select tablename, policyname, cmd, qual, with_check from pg_policies where schemaname = 'storage' order by 1, 2`,
    ),
    buckets: await q(`select id, public, file_size_limit, allowed_mime_types from storage.buckets order by id`),
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
  await db.exec('truncate auth.users cascade') // 병원·안내문·내 배경 줄도 같이 비워진다
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

// cards는 JSON 글로 보낸다(PGlite는 글을 그대로 넘긴다). SQL null은 null 그대로
const param = (column: string, value: unknown) => (column === 'cards' && value !== null ? JSON.stringify(value) : value)

function insert(row: Row, suffix = '') {
  const columns = Object.keys(row)
  return rows(
    `insert into ${TABLE} (${columns.join(', ')}) values (${columns.map((_, i) => `$${i + 1}`).join(', ')}) ${suffix}`,
    columns.map((column) => param(column, row[column])),
  )
}

// 운영자가 owner 병원 줄을 넣는다(칸 권한·RLS를 건너뛴다). 넣은 줄을 돌려준다
async function seed(owner: string, row: Row = NOTICE) {
  await operator()
  const [added] = await insert({ hospital_id: hospital[owner], ...row }, 'returning *')
  return added
}

// 운영자 눈으로 본 표 전체(바뀌지 않았는지 비교할 때)
async function snapshot() {
  await operator()
  return rows(`select * from ${TABLE} order by hospital_id, year, month, id`)
}

beforeAll(async () => {
  db = await PGlite.create()
  await setUp(db)
  // 이 파일을 붙이기 전에 저장해 둔 휴진 안내(저절로·테마 열쇠·내 배경)가 그대로 남는지 보려고 먼저 넣어 둔다
  await db.exec(`insert into auth.users (id, email) values ('${A}', 'a@fake.test')`)
  await db.exec(`insert into public.hospitals (owner_id, name, applicant_name, email, status)
                 values ('${A}', '가짜병원', '가짜신청자', 'a@fake.test', 'approved')`)
  await db.exec(`insert into public.form_notices (hospital_id, year, month, cards, theme)
                 select h.id, 2027, 5, '[{"name":"가짜"}]'::jsonb, t.theme
                 from public.hospitals h, (values (null), ('m05'), ('bg-${BG_UUID}')) as t (theme)`)
  oldBefore = (await db.query<Row>(`select * from public.form_notices order by id`)).rows
  shapeBefore = await noticesShape(db)
  schemaBefore = await schemaOf(db)
  await db.exec(ACCENT_MIGRATION)
  shapeAfter = await noticesShape(db)
  schemaAfter = await schemaOf(db)
  oldAfter = (await db.query<Row>(`select * from public.form_notices order by id`)).rows
}, 120_000)

afterAll(async () => {
  await db.close()
})

// 시험마다 빈 표에서 시작한다. 운영자(superuser)는 RLS를 건너뛴다
beforeEach(resetData)

describe('AC-4704.1 accent 칸·제약·권한', SLOW, () => {
  it('AC-4704.1: form_notices 맨 끝에 accent 칸이 있고 text·비워 둘 수 있음(null)·기본값 없음이다', async () => {
    const columns = await rows(
      `select column_name, udt_name, is_nullable, column_default from information_schema.columns
       where table_schema = 'public' and table_name = 'form_notices' order by ordinal_position`,
    )
    expect(columns.map((row) => row.column_name)).toEqual([
      'id',
      'hospital_id',
      'kind',
      'year',
      'month',
      'cards',
      'theme',
      'created_at',
      'updated_at',
      'accent',
    ])
    expect(columns.at(-1)).toEqual({ column_name: 'accent', udt_name: 'text', is_nullable: 'YES', column_default: null })
  })

  it('AC-4704.1: SQL 전후로 늘어난 칸은 accent 하나, 늘어난 제약은 accent 모양 제약 하나이고 다른 칸·제약은 그대로다', () => {
    expect(shapeAfter.columns).toEqual([
      ...shapeBefore.columns,
      { column_name: 'accent', data_type: 'text', is_nullable: 'YES', column_default: null },
    ])
    expect(shapeBefore.constraints.some((c) => c.conname === CHECK_NAME)).toBe(false)
    expect(shapeAfter.constraints.filter((c) => c.conname === CHECK_NAME)).toEqual([
      { conname: CHECK_NAME, contype: 'c', def: `CHECK ((accent ~ '^#[0-9a-f]{6}$'::text))` },
    ])
    expect(shapeAfter.constraints.filter((c) => c.conname !== CHECK_NAME)).toEqual(shapeBefore.constraints)
    expect(shapeBefore.constraints.length).toBeGreaterThan(0) // 빈 비교가 아니다
  })

  it('AC-4704.1: SQL 전후로 정책·표 권한·트리거·RLS는 그대로다', () => {
    const rest = ({ policies, tableGrants, triggers, rls }: Shape) => ({ policies, tableGrants, triggers, rls })
    expect(rest(shapeAfter)).toEqual(rest(shapeBefore))
    expect(shapeBefore.policies).toHaveLength(4) // 빈 비교가 아니다
    expect(shapeBefore.tableGrants.length).toBeGreaterThan(0)
    expect(shapeBefore.triggers).toHaveLength(1)
    expect(shapeBefore.rls).toEqual([{ relrowsecurity: true, relforcerowsecurity: false }])
  })

  it('AC-4704.1: 늘어난 칸 권한은 accent 칸 것뿐이고(authenticated 넣기·고치기, 읽기는 표 권한으로), 그 밖의 칸 권한은 그대로다', () => {
    expect(shapeBefore.columnGrants.some((g) => g.column_name === 'accent')).toBe(false)
    expect(shapeAfter.columnGrants.filter((g) => g.column_name !== 'accent')).toEqual(shapeBefore.columnGrants)
    expect(shapeBefore.columnGrants.length).toBeGreaterThan(0) // 빈 비교가 아니다
    expect(
      shapeAfter.columnGrants.filter((g) => g.column_name === 'accent' && ['anon', 'authenticated', 'PUBLIC'].includes(String(g.grantee))),
    ).toEqual([
      { grantee: 'authenticated', column_name: 'accent', privilege_type: 'INSERT' },
      { grantee: 'authenticated', column_name: 'accent', privilege_type: 'SELECT' },
      { grantee: 'authenticated', column_name: 'accent', privilege_type: 'UPDATE' },
    ])
  })

  it.each(['INSERT', 'UPDATE'])(
    'AC-4704.1: authenticated의 %s 칸 권한은 year·month·cards·theme·accent뿐이다(hospital_id·id·kind·시각은 그대로 없다)',
    async (privilege) => {
      await rows(`select $1::regclass`, [TABLE]) // 표가 없으면 여기서 실패한다(빈 목록과 헷갈리지 않게)
      const list = await rows(
        `select column_name from information_schema.columns
         where table_schema = 'public' and table_name = 'form_notices'
           and has_column_privilege('authenticated', 'public.form_notices', column_name, $1)
         order by column_name`,
        [privilege],
      )
      expect(list.map((row) => row.column_name)).toEqual([...SENT].sort())
    },
  )

  it('AC-4704.1: anon에게는 accent 칸을 포함해 표·칸 권한이 하나도 없다', async () => {
    for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']) {
      expect(await rows(`select has_any_column_privilege('anon', $1, $2) as ok`, [TABLE, privilege])).toEqual([{ ok: false }])
    }
    for (const privilege of ['DELETE', 'TRUNCATE', 'TRIGGER']) {
      expect(await rows(`select has_table_privilege('anon', $1, $2) as ok`, [TABLE, privilege])).toEqual([{ ok: false }])
    }
  })

  it('AC-4704.1: 다른 표·함수·storage 정책·버킷은 SQL 전후로 그대로다', () => {
    expect(schemaAfter).toEqual(schemaBefore)
    expect(schemaBefore.tables).toEqual(expect.arrayContaining(['form_notices', 'form_backgrounds', 'ai_image_days', 'hospitals']))
    expect(schemaBefore.storagePolicies).toHaveLength(3) // 빈 비교가 아니다
  })

  it('AC-4704.1: 이미 저장된 휴진 안내(저절로·m05·내 배경)는 accent가 null(자동)이 되고 다른 칸은 그대로다', () => {
    expect(oldBefore.map((row) => row.theme).sort()).toEqual([null, 'm05', `bg-${BG_UUID}`].sort())
    expect(oldAfter).toEqual(oldBefore.map((row) => ({ ...row, accent: null })))
  })

  it('AC-4704.1: 두 번 실행해도 오류가 없고, 표 모양·다른 것은 같으며 넣어 둔 줄(글자 색 포함)은 그대로다', async () => {
    const twice = await PGlite.create()
    const main = db
    try {
      await setUp(twice)
      await twice.exec(ACCENT_MIGRATION)
      const first = { notices: await noticesShape(twice), schema: await schemaOf(twice) }
      db = twice
      await resetData()
      await become(A)
      await insert(NOTICE)
      await insert({ ...NOTICE, month: 6, accent: null })
      const data = await snapshot()
      expect(data.map((row) => row.accent).sort()).toEqual(['#c2185b', null].sort())

      await twice.exec(ACCENT_MIGRATION)

      expect({ notices: await noticesShape(twice), schema: await schemaOf(twice) }).toEqual(first)
      expect(await snapshot()).toEqual(data)
      // 다시 붙인 뒤에도 넣기·고치기 권한과 모양 제약이 그대로다
      await become(A)
      expect(await rows(`update ${TABLE} set accent = '#1e88e5' where month = 6 returning accent`)).toEqual([{ accent: '#1e88e5' }])
      await expect(rows(`update ${TABLE} set accent = 'red'`)).rejects.toThrow(CHECK)
    } finally {
      db = main
      await twice.close()
    }
  }, 120_000)
})

describe('AC-4704.1 내 줄에 글자 색 넣기·고치기', SLOW, () => {
  it('AC-4704.1: A는 글자 색을 넣고 읽고 고치고 자동(null)으로 되돌린다', async () => {
    await become(A)
    const [added] = await insert(NOTICE, 'returning id, hospital_id, accent')
    expect(added).toMatchObject({ hospital_id: hospital[A], accent: '#c2185b' })
    expect(await rows(`select accent from ${TABLE}`)).toEqual([{ accent: '#c2185b' }])
    expect(await rows(`update ${TABLE} set accent = $1 where id = $2 returning accent`, ['#1e88e5', added.id])).toEqual([
      { accent: '#1e88e5' },
    ])
    expect(await rows(`update ${TABLE} set accent = null where id = $1 returning accent`, [added.id])).toEqual([{ accent: null }])
    await operator()
    expect(await rows(`select id, accent from ${TABLE}`)).toEqual([{ id: added.id, accent: null }])
  })

  it('AC-4704.1: 저장 몸통처럼 다섯 칸을 한 번에 고칠 수 있다', async () => {
    const mine = await seed(A, { ...NOTICE, accent: null })
    await become(A)
    const changed = { year: 2027, month: 6, cards: [CARD], theme: null, accent: '#000000' }
    expect(
      await rows(
        `update ${TABLE} set year = $1, month = $2, cards = $3, theme = $4, accent = $5 where id = $6
         returning year, month, cards, theme, accent`,
        [changed.year, changed.month, JSON.stringify(changed.cards), changed.theme, changed.accent, mine.id],
      ),
    ).toEqual([changed])
  })

  it('AC-4704.1: accent 없이 넣으면(옛 화면) null(자동)이다', async () => {
    const old = Object.fromEntries(Object.entries(NOTICE).filter(([column]) => column !== 'accent'))
    expect(Object.keys(old)).toEqual(['year', 'month', 'cards', 'theme'])
    await become(A)
    expect(await insert(old, 'returning accent')).toEqual([{ accent: null }])
  })

  it('AC-4704.1: 글자 색만 고쳐도 updated_at 트리거가 지금 시각으로 바꾸고 created_at은 그대로다', async () => {
    await seed(A, { ...NOTICE, created_at: OLD, updated_at: OLD })
    await become(A)
    expect(
      await rows(
        `update ${TABLE} set accent = '#1e88e5' returning accent, updated_at > now() - interval '1 hour' as fresh, created_at`,
      ),
    ).toEqual([{ accent: '#1e88e5', fresh: true, created_at: new Date(OLD) }])
  })
})

describe('AC-4704.2 막힘', SLOW, () => {
  it('AC-4704.2: anon은 글자 색을 읽기·넣기·고치기 모두 권한 없음이고 줄은 그대로다', async () => {
    await seed(A)
    const before = await snapshot()
    await becomeAnon()
    await expect(rows(`select accent from ${TABLE}`)).rejects.toThrow(DENIED)
    await expect(insert(NOTICE)).rejects.toThrow(DENIED)
    await expect(rows(`update ${TABLE} set accent = '#000000'`)).rejects.toThrow(DENIED)
    await expect(rows(`update ${TABLE} set accent = null`)).rejects.toThrow(DENIED)
    expect(await snapshot()).toEqual(before)
  })

  it('AC-4704.2: A가 B 병원 줄의 글자 색을 고치면(id로 골라도) 0줄이고 B 줄은 그대로다', async () => {
    const theirs = await seed(B)
    const before = await snapshot()
    await become(A)
    expect(await rows(`select accent from ${TABLE}`)).toEqual([])
    expect(await rows(`update ${TABLE} set accent = '#000000' where id = $1 returning id`, [theirs.id])).toEqual([])
    expect(await rows(`update ${TABLE} set accent = null returning id`)).toEqual([])
    expect(await snapshot()).toEqual(before)
  })

  it('AC-4704.2: A와 B가 둘 다 줄이 있으면 A의 글자 색 고치기는 자기 줄만 바꾼다', async () => {
    const mine = await seed(A)
    const theirs = await seed(B)
    await become(A)
    expect(await rows(`update ${TABLE} set accent = '#000000' returning id`)).toEqual([{ id: mine.id }])
    await operator()
    expect(await rows(`select accent from ${TABLE} where id = $1`, [mine.id])).toEqual([{ accent: '#000000' }])
    expect(await rows(`select accent from ${TABLE} where id = $1`, [theirs.id])).toEqual([{ accent: NOTICE.accent }])
  })

  it.each([
    ['승인 대기', PENDING],
    ['거절', REJECTED],
    ['가입 신청 안 함', NO_HOSPITAL],
  ])('AC-4704.2: %s 사용자는 글자 색을 0줄로 읽고, 넣기는 거부되고, 고치기는 0줄이다', async (_label, user) => {
    if (hospital[user]) await seed(user)
    const before = await snapshot()
    await become(user)
    expect(await rows(`select accent from ${TABLE}`)).toEqual([])
    await expect(insert(NOTICE)).rejects.toThrow(RLS)
    expect(await rows(`update ${TABLE} set accent = '#000000' returning id`)).toEqual([])
    expect(await snapshot()).toEqual(before)
  })

  it.each([
    ['hospital_id', () => hospital[B]], // 병원 uuid는 시험마다 새로 생긴다
    ['id', () => OTHER_ID],
    ['kind', () => 'closure'],
    ['created_at', () => OLD],
    ['updated_at', () => OLD],
  ])('AC-4704.1: %s는 글자 색과 함께 고쳐도 권한 없음이고 줄은 그대로다(그 밖의 칸 권한 그대로)', async (column, value) => {
    await seed(A)
    const before = await snapshot()
    await become(A)
    await expect(rows(`update ${TABLE} set accent = '#000000', ${column} = $1`, [value()])).rejects.toThrow(DENIED)
    expect(await snapshot()).toEqual(before)
  })

  it.each([
    ['hospital_id', () => hospital[A]],
    ['id', () => OTHER_ID],
    ['kind', () => 'closure'],
  ])('AC-4704.1: %s는 글자 색과 함께 넣어도 권한 없음이다', async (column, value) => {
    await become(A)
    await expect(insert({ ...NOTICE, [column]: value() })).rejects.toThrow(DENIED)
    expect(await snapshot()).toEqual([])
  })
})

describe('AC-4704.2 글자 색 모양 제약', SLOW, () => {
  const BAD: [string, string][] = [
    ['대문자', '#C2185B'],
    ['대문자 한 글자', '#c2185B'],
    ['색 이름 red', 'red'],
    ['3자리 #abc', '#abc'],
    ['8자리', '#c2185b00'],
    ['7자리', '#c2185b0'],
    ['5자리', '#c2185'],
    ['# 없음', 'c2185b'],
    ['16진수 아님', '#c2185g'],
    ['뒤 줄바꿈', '#c2185b\n'],
    ['앞 빈칸', ' #c2185b'],
    ['빈 글', ''],
    ['rgb()', 'rgb(194,24,91)'],
  ]

  it.each(BAD)('AC-4704.2 거부(넣기): %s → 줄이 남지 않는다', async (_label, accent) => {
    await become(A)
    await expect(insert({ ...NOTICE, accent })).rejects.toThrow(CHECK)
    expect(await snapshot()).toEqual([])
  })

  it.each(BAD)('AC-4704.2 거부(고치기): %s → 줄은 그대로다', async (_label, accent) => {
    await seed(A)
    const before = await snapshot()
    await become(A)
    await expect(rows(`update ${TABLE} set accent = $1`, [accent])).rejects.toThrow(CHECK)
    expect(await snapshot()).toEqual(before)
  })

  it('AC-4704.2: 운영자가 넣어도 모양 제약은 같다', async () => {
    await operator()
    for (const accent of ['#ABCDEF', 'red', '#abc', '#abcdef00']) {
      await expect(insert({ hospital_id: hospital[A], ...NOTICE, accent }), accent).rejects.toThrow(CHECK)
    }
    expect(await snapshot()).toEqual([])
  })

  it.each([
    ['없음(null = 자동)', null],
    ['소문자 6자리', '#c2185b'],
    ['숫자만', '#000000'],
    ['흰색', '#ffffff'],
    ['숫자·글자 섞임', '#0a1b2c'],
  ])('AC-4704.2 허용: %s → 그대로 저장된다', async (_label, accent) => {
    await become(A)
    await insert({ ...NOTICE, accent })
    await operator()
    expect(await rows(`select accent from ${TABLE}`)).toEqual([{ accent }])
  })
})

describe('AC-4704.1 파일', SLOW, () => {
  it('AC-4704.1: 파일 머리 주석에 붙여 넣는 방법·먼저 있어야 하는 파일·여러 번 실행해도 된다는 말이 있다', () => {
    const lines = ACCENT_MIGRATION.split('\n')
    const end = lines.findIndex((line) => !/^(--|\s*$)/.test(line))
    expect(end).toBeGreaterThan(0)
    const head = lines.slice(0, end).join('\n')
    expect(head).toContain('운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다')
    expect(head).toContain('20261110000000_form_notices.sql')
    expect(head).toContain('사이트에 올리기 전에 붙인다')
    expect(head).toContain('여러 번 실행해도')
    expect(head).toContain('forms-accent')
  })

  it('AC-4704.1: 주석 밖 SQL은 design.md 8절의 네 문장 그대로다(정책·다른 칸 권한·다른 표를 건드리지 않는다)', () => {
    const statements = ACCENT_SQL.split(';')
      .map((part) => part.replace(/\s+/g, ' ').trim())
      .filter((part) => part !== '')
    expect(statements).toEqual(DESIGN_STATEMENTS)
  })
})

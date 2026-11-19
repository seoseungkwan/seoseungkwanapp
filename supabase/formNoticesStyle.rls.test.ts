import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

// 휴진 안내 글씨·로고 여섯 칸(form_notices.title_scale·body_scale·logo_scale·title_color·body_color·logo_color)
// (form-style REQ-6806, TASK-2). formNoticesAccent.rls.test.ts와 같은 방법: 진짜 Postgres(PGlite, WASM)에서 운영자가
// SQL 편집기에 붙일 파일을 그대로 돌린다. 실제 Supabase에는 붙지 않는다. Supabase가 미리 갖춘 것(역할·auth 스키마·
// 새 표·함수·순서표의 기본 권한, 그리고 내 배경 파일이 쓰는 storage 스키마)만 흉내 낸다.
// 앞 마이그레이션(인증 → 휴진 안내 → 내 배경 → 글자 색)을 먼저 돌린 DB에 이 파일을 더한다
const fileOf = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))
const read = (rel: string) => readFileSync(fileOf(rel), 'utf-8')
const AUTH_MIGRATION = read('./migrations/20261028000000_auth.sql')
const NOTICES_MIGRATION = read('./migrations/20261110000000_form_notices.sql')
const BACKGROUNDS_MIGRATION = read('./migrations/20261115020000_form_backgrounds.sql')
const ACCENT_MIGRATION = read('./migrations/20261115030000_form_notices_accent.sql')
const STYLE_PATH = fileOf('./migrations/20261119100000_form_notices_style.sql')
// 파일이 아직 없으면 빈 글자로 돌아, 시험마다 '칸이 없다'로 실패한다(무엇이 빠졌는지 시험별로 보인다)
const STYLE_MIGRATION = existsSync(STYLE_PATH) ? readFileSync(STYLE_PATH, 'utf-8') : ''
// 주석을 뺀 SQL 글자(머리 주석이 다른 표·파일 이름을 설명으로 말할 수 있다)
const STYLE_SQL = STYLE_MIGRATION.split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n')

// design.md 7-1절의 SQL(글자 그대로, 문장마다)
const DESIGN_STATEMENTS = [
  'alter table public.form_notices add column if not exists title_scale smallint',
  'alter table public.form_notices add column if not exists body_scale smallint',
  'alter table public.form_notices add column if not exists logo_scale smallint',
  'alter table public.form_notices add column if not exists title_color text',
  'alter table public.form_notices add column if not exists body_color text',
  'alter table public.form_notices add column if not exists logo_color text',
  'alter table public.form_notices drop constraint if exists form_notices_style_check',
  `alter table public.form_notices add constraint form_notices_style_check check ((title_scale is null or (title_scale between 80 and 130 and title_scale % 5 = 0)) and (body_scale is null or (body_scale between 80 and 130 and body_scale % 5 = 0)) and (logo_scale is null or (logo_scale between 60 and 150 and logo_scale % 5 = 0)) and (title_color is null or title_color ~ '^#[0-9a-f]{6}$') and (body_color is null or body_color ~ '^#[0-9a-f]{6}$') and (logo_color is null or logo_color ~ '^#[0-9a-f]{6}$'))`,
  'grant insert (title_scale, body_scale, logo_scale, title_color, body_color, logo_color), update (title_scale, body_scale, logo_scale, title_color, body_color, logo_color) on table public.form_notices to authenticated',
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

// 내 배경 파일(20261115020000)이 버킷 줄과 storage 정책을 더하므로 formNoticesAccent.rls.test.ts와 같은 흉내를 둔다
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
const STATUS: Record<string, string> = { [A]: 'approved', [B]: 'approved', [PENDING]: 'pending' }

type Row = Record<string, unknown>

const TABLE = 'public.form_notices'
const CHECK_NAME = 'form_notices_style_check'
const SCALES = ['title_scale', 'body_scale', 'logo_scale'] as const
const COLORS = ['title_color', 'body_color', 'logo_color'] as const
const STYLE_COLUMNS = [...SCALES, ...COLORS]
const SENT = ['year', 'month', 'cards', 'theme', 'accent', ...STYLE_COLUMNS] // 사용자가 보낼 수 있는 칸(그 밖은 칸 권한이 없다)
const OLD = '2001-01-01T00:00:00.000Z' // 운영자가 심는 옛 시각(DB가 바꿨는지 보려고)

// 지어낸 안내문. 카드 모양은 src/types/forms.ts NoticeCard(DB는 배열 길이·크기만 본다)
const CARD = { start: '2027-05-05', end: null, name: '어린이날', status: '휴진' }
const NOTICE: Row = { year: 2027, month: 5, cards: [CARD], theme: 'm05', accent: '#c2185b' }
const STYLE: Row = {
  title_scale: 115,
  body_scale: 90,
  logo_scale: 140,
  title_color: '#1e88e5',
  body_color: '#333333',
  logo_color: '#c2185b',
}
const NO_STYLE: Row = Object.fromEntries(STYLE_COLUMNS.map((column) => [column, null]))

const SLOW = { timeout: 60_000 }
const DENIED = /permission denied/
const CHECK = /check constraint/
const RLS = /row-level security/

let db: PGlite // 흉내 → 인증 → 휴진 안내 → 내 배경 → 글자 색 → 이 파일
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
  await target.exec(ACCENT_MIGRATION)
}

// 휴진 안내 표의 모양(칸·제약·권한·정책·트리거·RLS). formNoticesAccent.rls.test.ts의 noticesShape와 같다
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

const styleOf = (row: Row) => Object.fromEntries(STYLE_COLUMNS.map((column) => [column, row[column]]))

beforeAll(async () => {
  db = await PGlite.create()
  await setUp(db)
  // 이 파일을 붙이기 전에 저장해 둔 휴진 안내(저절로·테마 열쇠·글자 색)가 그대로 남는지 보려고 먼저 넣어 둔다
  await db.exec(`insert into auth.users (id, email) values ('${A}', 'a@fake.test')`)
  await db.exec(`insert into public.hospitals (owner_id, name, applicant_name, email, status)
                 values ('${A}', '가짜병원', '가짜신청자', 'a@fake.test', 'approved')`)
  await db.exec(`insert into public.form_notices (hospital_id, year, month, cards, theme, accent)
                 select h.id, 2027, 5, '[{"name":"가짜"}]'::jsonb, t.theme, t.accent
                 from public.hospitals h, (values (null, null), ('m05', '#c2185b')) as t (theme, accent)`)
  oldBefore = (await db.query<Row>(`select * from public.form_notices order by id`)).rows
  shapeBefore = await noticesShape(db)
  schemaBefore = await schemaOf(db)
  await db.exec(STYLE_MIGRATION)
  shapeAfter = await noticesShape(db)
  schemaAfter = await schemaOf(db)
  oldAfter = (await db.query<Row>(`select * from public.form_notices order by id`)).rows
}, 120_000)

afterAll(async () => {
  await db.close()
})

// 시험마다 빈 표에서 시작한다. 운영자(superuser)는 RLS를 건너뛴다
beforeEach(resetData)

describe('AC-6806.1 여섯 칸·제약·권한', SLOW, () => {
  it('AC-6806.1: form_notices 맨 끝에 여섯 칸이 차례대로 있고(크기 smallint·색 text) 모두 비워 둘 수 있고 기본값이 없다', () => {
    expect(shapeAfter.columns).toEqual([
      ...shapeBefore.columns,
      ...SCALES.map((column) => ({ column_name: column, data_type: 'smallint', is_nullable: 'YES', column_default: null })),
      ...COLORS.map((column) => ({ column_name: column, data_type: 'text', is_nullable: 'YES', column_default: null })),
    ])
    expect(shapeBefore.columns.at(-1)).toMatchObject({ column_name: 'accent' }) // 글자 색 칸 다음에 붙는다
  })

  it('AC-6806.1: 늘어난 제약은 form_notices_style_check 하나(검사 제약)이고 다른 제약은 그대로다', () => {
    expect(shapeBefore.constraints.some((c) => c.conname === CHECK_NAME)).toBe(false)
    const added = shapeAfter.constraints.filter((c) => c.conname === CHECK_NAME)
    expect(added).toHaveLength(1)
    expect(added[0]).toMatchObject({ conname: CHECK_NAME, contype: 'c' })
    for (const column of STYLE_COLUMNS) expect(String(added[0].def)).toContain(column)
    expect(shapeAfter.constraints.filter((c) => c.conname !== CHECK_NAME)).toEqual(shapeBefore.constraints)
    expect(shapeBefore.constraints.some((c) => c.conname === 'form_notices_accent_check')).toBe(true) // 빈 비교가 아니다
  })

  it('AC-6806.1: SQL 전후로 정책·표 권한·트리거·RLS는 그대로다', () => {
    const rest = ({ policies, tableGrants, triggers, rls }: Shape) => ({ policies, tableGrants, triggers, rls })
    expect(rest(shapeAfter)).toEqual(rest(shapeBefore))
    expect(shapeBefore.policies).toHaveLength(4) // 빈 비교가 아니다
    expect(shapeBefore.tableGrants.length).toBeGreaterThan(0)
    expect(shapeBefore.triggers).toHaveLength(1)
    expect(shapeBefore.rls).toEqual([{ relrowsecurity: true, relforcerowsecurity: false }])
  })

  it('AC-6806.1: 늘어난 칸 권한은 여섯 칸 것뿐이고(authenticated 넣기·고치기, 읽기는 표 권한으로), 그 밖의 칸 권한은 그대로다', () => {
    const isNew = (g: Row) => (STYLE_COLUMNS as readonly string[]).includes(String(g.column_name))
    expect(shapeBefore.columnGrants.some(isNew)).toBe(false)
    expect(shapeAfter.columnGrants.filter((g) => !isNew(g))).toEqual(shapeBefore.columnGrants)
    expect(shapeBefore.columnGrants.length).toBeGreaterThan(0) // 빈 비교가 아니다
    expect(
      shapeAfter.columnGrants.filter((g) => isNew(g) && ['anon', 'authenticated', 'PUBLIC'].includes(String(g.grantee))),
    ).toEqual(
      [...STYLE_COLUMNS].sort().flatMap((column) =>
        ['INSERT', 'SELECT', 'UPDATE'].map((privilege) => ({ grantee: 'authenticated', column_name: column, privilege_type: privilege })),
      ),
    )
  })

  it.each(['INSERT', 'UPDATE'])(
    'AC-6806.1: authenticated의 %s 칸 권한은 year·month·cards·theme·accent와 여섯 칸뿐이다(hospital_id·id·kind·시각은 그대로 없다)',
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

  it('AC-6806.1: anon에게는 여섯 칸을 포함해 표·칸 권한이 하나도 없다', async () => {
    for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']) {
      expect(await rows(`select has_any_column_privilege('anon', $1, $2) as ok`, [TABLE, privilege])).toEqual([{ ok: false }])
    }
    for (const privilege of ['DELETE', 'TRUNCATE', 'TRIGGER']) {
      expect(await rows(`select has_table_privilege('anon', $1, $2) as ok`, [TABLE, privilege])).toEqual([{ ok: false }])
    }
  })

  it('AC-6806.1: 다른 표·함수·storage 정책·버킷은 SQL 전후로 그대로다', () => {
    expect(schemaAfter).toEqual(schemaBefore)
    expect(schemaBefore.tables).toEqual(expect.arrayContaining(['form_notices', 'form_backgrounds', 'hospitals']))
    expect(schemaBefore.storagePolicies.length).toBeGreaterThan(0) // 빈 비교가 아니다
  })

  it('AC-6806.1: 이미 저장된 휴진 안내(글자 색 있음·없음)는 여섯 칸이 null(처음대로)이 되고 다른 칸은 그대로다', () => {
    expect(oldBefore.map((row) => row.accent).sort()).toEqual(['#c2185b', null].sort())
    expect(oldAfter).toEqual(oldBefore.map((row) => ({ ...row, ...NO_STYLE })))
  })

  it('AC-6806.1: 두 번 실행해도 오류가 없고, 표 모양·다른 것은 같으며 넣어 둔 줄(여섯 칸 포함)은 그대로다', async () => {
    const twice = await PGlite.create()
    const main = db
    try {
      await setUp(twice)
      await twice.exec(STYLE_MIGRATION)
      const first = { notices: await noticesShape(twice), schema: await schemaOf(twice) }
      expect(first.notices.columns.map((c) => c.column_name)).toEqual(expect.arrayContaining(STYLE_COLUMNS))
      db = twice
      await resetData()
      await become(A)
      await insert({ ...NOTICE, ...STYLE })
      await insert({ ...NOTICE, month: 6, ...NO_STYLE })
      const data = await snapshot()
      expect(data.map(styleOf)).toEqual([STYLE, NO_STYLE])

      await twice.exec(STYLE_MIGRATION)

      expect({ notices: await noticesShape(twice), schema: await schemaOf(twice) }).toEqual(first)
      expect(await snapshot()).toEqual(data)
      // 다시 붙인 뒤에도 넣기·고치기 권한과 검사 제약이 그대로다
      await become(A)
      expect(await rows(`update ${TABLE} set title_scale = 130 where month = 6 returning title_scale`)).toEqual([{ title_scale: 130 }])
      await expect(rows(`update ${TABLE} set title_scale = 135`)).rejects.toThrow(CHECK)
      await expect(rows(`update ${TABLE} set logo_color = 'red'`)).rejects.toThrow(CHECK)
    } finally {
      db = main
      await twice.close()
    }
  }, 120_000)
})

describe('AC-6806.1 내 줄에 여섯 칸 넣기·고치기', SLOW, () => {
  it('AC-6806.1: A는 여섯 칸을 넣고 읽고 고치고 모두 null(처음대로)로 되돌린다', async () => {
    await become(A)
    const [added] = await insert({ ...NOTICE, ...STYLE }, `returning id, hospital_id, ${STYLE_COLUMNS.join(', ')}`)
    expect(added).toEqual({ id: added.id, hospital_id: hospital[A], ...STYLE })
    expect(await rows(`select ${STYLE_COLUMNS.join(', ')} from ${TABLE}`)).toEqual([STYLE])
    const changed = { title_scale: 80, body_scale: 130, logo_scale: 60, title_color: '#000000', body_color: '#ffffff', logo_color: '#0a1b2c' }
    expect(
      await rows(
        `update ${TABLE} set title_scale = $1, body_scale = $2, logo_scale = $3, title_color = $4, body_color = $5, logo_color = $6
         where id = $7 returning ${STYLE_COLUMNS.join(', ')}`,
        [...STYLE_COLUMNS.map((column) => changed[column]), added.id],
      ),
    ).toEqual([changed])
    expect(
      await rows(
        `update ${TABLE} set ${STYLE_COLUMNS.map((column) => `${column} = null`).join(', ')} where id = $1
         returning ${STYLE_COLUMNS.join(', ')}`,
        [added.id],
      ),
    ).toEqual([NO_STYLE])
    await operator()
    expect((await snapshot()).map(styleOf)).toEqual([NO_STYLE])
  })

  it('AC-6806.1: 저장 몸통처럼 열한 칸(다섯 + 여섯)을 한 번에 고칠 수 있다', async () => {
    const mine = await seed(A, { ...NOTICE, ...NO_STYLE })
    await become(A)
    const changed: Row = { year: 2027, month: 6, cards: [CARD], theme: null, accent: null, ...STYLE }
    const columns = Object.keys(changed)
    expect(
      await rows(
        `update ${TABLE} set ${columns.map((column, i) => `${column} = $${i + 1}`).join(', ')} where id = $${columns.length + 1}
         returning ${columns.join(', ')}`,
        [...columns.map((column) => param(column, changed[column])), mine.id],
      ),
    ).toEqual([changed])
  })

  it('AC-6806.1: 여섯 칸 없이 넣으면(옛 화면) 모두 null(처음대로)이다', async () => {
    await become(A)
    expect(await insert(NOTICE, `returning ${STYLE_COLUMNS.join(', ')}`)).toEqual([NO_STYLE])
  })

  it('AC-6806.1: 여섯 칸만 고쳐도 updated_at 트리거가 지금 시각으로 바꾸고 created_at은 그대로다', async () => {
    await seed(A, { ...NOTICE, created_at: OLD, updated_at: OLD })
    await become(A)
    expect(
      await rows(
        `update ${TABLE} set logo_scale = 150, logo_color = '#1e88e5'
         returning logo_scale, logo_color, updated_at > now() - interval '1 hour' as fresh, created_at`,
      ),
    ).toEqual([{ logo_scale: 150, logo_color: '#1e88e5', fresh: true, created_at: new Date(OLD) }])
  })
})

describe('AC-6806.1 크기·색 검사 제약', SLOW, () => {
  // [칸, 값]: 제목·본문 80~130, 로고 60~150, 모두 5의 배수
  const GOOD_SCALES: [string, number][] = [
    ['title_scale', 80],
    ['title_scale', 100],
    ['title_scale', 130],
    ['body_scale', 80],
    ['body_scale', 105],
    ['body_scale', 130],
    ['logo_scale', 60],
    ['logo_scale', 75], // 제목·본문에는 너무 작지만 로고에는 된다
    ['logo_scale', 135], // 제목·본문에는 너무 크지만 로고에는 된다
    ['logo_scale', 150],
  ]
  const BAD_SCALES: [string, number][] = [
    ['title_scale', 75],
    ['title_scale', 135],
    ['title_scale', 83],
    ['title_scale', 0],
    ['title_scale', -100],
    ['body_scale', 75],
    ['body_scale', 135],
    ['body_scale', 83],
    ['body_scale', 79],
    ['body_scale', 131],
    ['logo_scale', 55],
    ['logo_scale', 155],
    ['logo_scale', 83],
    ['logo_scale', 59],
    ['logo_scale', 151],
  ]
  const GOOD_COLORS = ['#000000', '#ffffff', '#0a1b2c', '#c2185b']
  const BAD_COLORS = ['red', '#ABCDEF', '#c2185B', '#abc', '#abcdef00', '#abcde', 'abcdef', '#abcdeg', '#abcdef\n', ' #abcdef', '']

  it.each(GOOD_SCALES)('AC-6806.1 허용: %s = %d → 그대로 저장된다', async (column, value) => {
    await become(A)
    await insert({ ...NOTICE, [column]: value })
    await operator()
    expect(await rows(`select ${column} from ${TABLE}`)).toEqual([{ [column]: value }])
  })

  it.each(COLORS.flatMap((column) => GOOD_COLORS.map((value) => [column, value] as const)))(
    'AC-6806.1 허용: %s = %s → 그대로 저장된다',
    async (column, value) => {
      await become(A)
      await insert({ ...NOTICE, [column]: value })
      await operator()
      expect(await rows(`select ${column} from ${TABLE}`)).toEqual([{ [column]: value }])
    },
  )

  it('AC-6806.1 허용: 여섯 칸 모두 null이면 저장된다', async () => {
    await become(A)
    await insert({ ...NOTICE, ...NO_STYLE })
    expect((await snapshot()).map(styleOf)).toEqual([NO_STYLE])
  })

  it.each(BAD_SCALES)('AC-6806.1 거부(넣기): %s = %d → 줄이 남지 않는다', async (column, value) => {
    await become(A)
    await expect(insert({ ...NOTICE, [column]: value })).rejects.toThrow(CHECK)
    expect(await snapshot()).toEqual([])
  })

  it.each(BAD_SCALES)('AC-6806.1 거부(고치기): %s = %d → 줄은 그대로다', async (column, value) => {
    await seed(A, { ...NOTICE, ...STYLE })
    const before = await snapshot()
    await become(A)
    await expect(rows(`update ${TABLE} set ${column} = $1`, [value])).rejects.toThrow(CHECK)
    expect(await snapshot()).toEqual(before)
  })

  it.each(COLORS.flatMap((column) => BAD_COLORS.map((value) => [column, value] as const)))(
    'AC-6806.1 거부(넣기): %s = %j → 줄이 남지 않는다',
    async (column, value) => {
      await become(A)
      await expect(insert({ ...NOTICE, [column]: value })).rejects.toThrow(CHECK)
      expect(await snapshot()).toEqual([])
    },
  )

  it.each(COLORS.flatMap((column) => ['red', '#ABCDEF'].map((value) => [column, value] as const)))(
    'AC-6806.1 거부(고치기): %s = %s → 줄은 그대로다',
    async (column, value) => {
      await seed(A, { ...NOTICE, ...STYLE })
      const before = await snapshot()
      await become(A)
      await expect(rows(`update ${TABLE} set ${column} = $1`, [value])).rejects.toThrow(CHECK)
      expect(await snapshot()).toEqual(before)
    },
  )

  it('AC-6806.1: 운영자가 넣어도 검사 제약은 같다', async () => {
    await operator()
    const bad: Row[] = [{ title_scale: 135 }, { body_scale: 83 }, { logo_scale: 155 }, { title_color: '#ABCDEF' }, { logo_color: 'red' }]
    for (const row of bad) {
      await expect(insert({ hospital_id: hospital[A], ...NOTICE, ...row }), JSON.stringify(row)).rejects.toThrow(CHECK)
    }
    expect(await snapshot()).toEqual([])
  })
})

describe('AC-6806.1 막힘', SLOW, () => {
  it('AC-6806.1: anon은 여섯 칸을 읽기·넣기·고치기 모두 권한 없음이고 줄은 그대로다', async () => {
    await seed(A, { ...NOTICE, ...STYLE })
    const before = await snapshot()
    await becomeAnon()
    for (const column of STYLE_COLUMNS) {
      await expect(rows(`select ${column} from ${TABLE}`), column).rejects.toThrow(DENIED)
      await expect(rows(`update ${TABLE} set ${column} = null`), column).rejects.toThrow(DENIED)
    }
    await expect(insert({ ...NOTICE, ...STYLE })).rejects.toThrow(DENIED)
    await expect(rows(`update ${TABLE} set title_scale = 100`)).rejects.toThrow(DENIED)
    expect(await snapshot()).toEqual(before)
  })

  it('AC-6806.1: A가 B 병원 줄의 여섯 칸을 고치면(id로 골라도) 0줄이고 B 줄은 그대로다(정책 그대로)', async () => {
    const theirs = await seed(B, { ...NOTICE, ...STYLE })
    const before = await snapshot()
    await become(A)
    expect(await rows(`select title_scale from ${TABLE}`)).toEqual([])
    expect(await rows(`update ${TABLE} set title_scale = 80, logo_color = null where id = $1 returning id`, [theirs.id])).toEqual([])
    expect(await snapshot()).toEqual(before)
  })

  it('AC-6806.1: 승인 대기 사용자는 여섯 칸을 0줄로 읽고, 넣기는 거부되고, 고치기는 0줄이다', async () => {
    await seed(PENDING, { ...NOTICE, ...STYLE })
    const before = await snapshot()
    await become(PENDING)
    expect(await rows(`select title_scale from ${TABLE}`)).toEqual([])
    await expect(insert({ ...NOTICE, ...STYLE })).rejects.toThrow(RLS)
    expect(await rows(`update ${TABLE} set title_scale = 80 returning id`)).toEqual([])
    expect(await snapshot()).toEqual(before)
  })

  it.each([
    ['hospital_id', () => hospital[B]],
    ['kind', () => 'closure'],
    ['updated_at', () => OLD],
  ])('AC-6806.1: %s는 여섯 칸과 함께 고쳐도 권한 없음이고 줄은 그대로다(그 밖의 칸 권한 그대로)', async (column, value) => {
    await seed(A)
    const before = await snapshot()
    await become(A)
    await expect(rows(`update ${TABLE} set title_scale = 110, ${column} = $1`, [value()])).rejects.toThrow(DENIED)
    expect(await snapshot()).toEqual(before)
  })
})

describe('AC-6806.1 파일', SLOW, () => {
  it('AC-6806.1: 파일 머리 주석에 붙여 넣는 방법·먼저 있어야 하는 파일·여러 번 실행해도 된다는 말이 있다', () => {
    const lines = STYLE_MIGRATION.split('\n')
    const end = lines.findIndex((line) => !/^(--|\s*$)/.test(line))
    expect(end).toBeGreaterThan(0)
    const head = lines.slice(0, end).join('\n')
    expect(head).toContain('운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다')
    expect(head).toContain('20261110000000_form_notices.sql')
    expect(head).toContain('20261115030000_form_notices_accent.sql')
    expect(head).toContain('사이트에 올리기 전에 붙인다')
    expect(head).toContain('여러 번 실행해도')
    expect(head).toContain('form-style')
  })

  it('AC-6806.1: 주석 밖 SQL은 design.md 7-1절의 아홉 문장 그대로다(정책·다른 칸 권한·다른 표를 건드리지 않는다)', () => {
    const statements = STYLE_SQL.split(';')
      .map((part) => part.replace(/\s+/g, ' ').trim())
      .filter((part) => part !== '')
    expect(statements).toEqual(DESIGN_STATEMENTS)
  })
})

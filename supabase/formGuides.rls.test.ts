import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

// 서식 탭 환자 안내문 저장 표(form_guides) (forms-guide REQ-4508, TASK-2).
// formNotices.rls.test.ts와 같은 방법: 진짜 Postgres(PGlite, WASM)에서 운영자가 SQL 편집기에 붙일 파일을 그대로 돌린다.
// 실제 Supabase에는 붙지 않는다. Supabase가 미리 갖춘 것(역할·auth 스키마·새 표·함수·순서표의 기본 권한)만 흉내 낸다
const fileOf = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))
const read = (rel: string) => readFileSync(fileOf(rel), 'utf-8')
const AUTH_MIGRATION = read('./migrations/20261028000000_auth.sql')
const STATS_MIGRATION = read('./migrations/20261101000200_stats.sql')
const REVENUE_MIGRATION = read('./migrations/20261101000400_revenue.sql')
const PICKS_MIGRATION = read('./migrations/20261103000000_rx_picks.sql')
const GROUPS_MIGRATION = read('./migrations/20261105000100_stats_rx_groups.sql')
const NOTICES_MIGRATION = read('./migrations/20261110000000_form_notices.sql')
const GUIDES_PATH = fileOf('./migrations/20261115010000_form_guides.sql')
// 파일이 아직 없으면 빈 글자로 돌아, 시험마다 '표가 없다'로 실패한다(무엇이 빠졌는지 시험별로 보인다)
const GUIDES_MIGRATION = existsSync(GUIDES_PATH) ? readFileSync(GUIDES_PATH, 'utf-8') : ''
// 주석을 뺀 SQL 글자(머리 주석이 다른 갈래 표·함수 이름을 설명으로 말할 수 있다)
const GUIDES_SQL = GUIDES_MIGRATION.split('\n')
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
const STATUS: Record<string, string> = { [A]: 'approved', [B]: 'approved', [PENDING]: 'pending', [REJECTED]: 'rejected' }

type Row = Record<string, unknown>

const TABLE = 'public.form_guides'
const COLUMNS = ['id', 'hospital_id', 'content', 'created_at', 'updated_at']
const SENT = ['content'] // 사용자가 보낼 수 있는 칸(그 밖은 칸 권한이 없다)
const TOUCH = 'form_guides_touch()'
const OLD = '2001-01-01T00:00:00.000Z' // 운영자가 심는 옛 시각(DB가 바꿨는지 보려고)
const OTHER_ID = '00000000-0000-4000-8000-000000000123'

// 지어낸 안내문. 모양은 src/types/formGuide.ts GuideContent(DB는 객체인지·크기만 본다)
const GUIDE: Row = {
  tag: '보험 서류 안내',
  subtitle: '보험사에 낼 서류는',
  big1: '수납할 때',
  big2: '말씀해 주세요',
  firstSmall: false,
  boxTop: '이렇게 말씀해 주세요',
  boxBottom: '"보험 서류 필요해요"',
  picture: 'document',
  bandTitle: '이런 서류가 필요하실 때',
  mark: 'check',
  lines: [
    { text: '진단서', em: '진단서' },
    { text: '진료비 영수증', em: '' },
  ],
  note: '필요한 서류는 보험사마다 달라요',
}
const GUIDE2: Row = { ...GUIDE, tag: '도수치료 안내', mark: 'number', picture: null, lines: [{ text: '예약 시간을 지켜 주세요', em: '예약' }] }
const ROW: Row = { content: GUIDE }

const SLOW = { timeout: 60_000 }
const DENIED = /permission denied/
const CHECK = /check constraint/
const RLS = /row-level security/
const NOT_NULL = /null value in column/

let db: PGlite // 인증 → 이 파일만 돌린 DB(다른 갈래 표가 없다)
let full: PGlite // 인증 → 통계 → 매출 → 처방 골라 보기 → 통계 묶음 → 휴진 안내 → 이 파일
let hospital: Record<string, string> = {}
type Schema = Awaited<ReturnType<typeof schemaOf>>
let beforeGuides: Schema // full에 이 파일을 돌리기 전
let afterGuides: Schema // 돌린 뒤

async function setUp(target: PGlite) {
  await target.exec(SUPABASE_MOCK)
  await target.exec(AUTH_MIGRATION)
}

// 다른 갈래 것이 그대로인지 보려고 public의 표 이름과 함수(정의·권한)를 모은다
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
  await db.exec('truncate auth.users cascade') // 병원·안내문 줄도 같이 비워진다
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

// content는 JSON 글로 보낸다(PGlite는 글을 그대로 넘긴다). SQL null은 null 그대로
const param = (column: string, value: unknown) => (column === 'content' && value !== null ? JSON.stringify(value) : value)

function insert(row: Row, suffix = '') {
  const columns = Object.keys(row)
  return rows(
    `insert into ${TABLE} (${columns.join(', ')}) values (${columns.map((_, i) => `$${i + 1}`).join(', ')}) ${suffix}`,
    columns.map((column) => param(column, row[column])),
  )
}

// 운영자가 owner 병원 줄을 넣는다(칸 권한·RLS를 건너뛴다). 넣은 줄을 돌려준다
async function seed(owner: string, row: Row = ROW) {
  await operator()
  const [added] = await insert({ hospital_id: hospital[owner], ...row }, 'returning *')
  return added
}

// 운영자 눈으로 본 표 전체(바뀌지 않았는지 비교할 때)
async function snapshot() {
  await operator()
  return rows(`select * from ${TABLE} order by hospital_id, id`)
}

beforeAll(async () => {
  db = await PGlite.create()
  await setUp(db)
  await db.exec(GUIDES_MIGRATION)

  full = await PGlite.create()
  await setUp(full)
  await full.exec(STATS_MIGRATION)
  await full.exec(REVENUE_MIGRATION)
  await full.exec(PICKS_MIGRATION)
  await full.exec(GROUPS_MIGRATION)
  await full.exec(NOTICES_MIGRATION)
  beforeGuides = await schemaOf(full)
  await full.exec(GUIDES_MIGRATION)
  afterGuides = await schemaOf(full)
}, 120_000)

afterAll(async () => {
  await db.close()
  await full.close()
})

// 시험마다 빈 표에서 시작한다. 운영자(superuser)는 RLS를 건너뛴다
beforeEach(resetData)

describe('AC-4508.1 표·칸·RLS·권한·파일', SLOW, () => {
  it('AC-4508.1: 칸은 id·hospital_id·content·created_at·updated_at 다섯뿐이고 모두 비울 수 없다', async () => {
    const columns = await rows(
      `select column_name, udt_name, is_nullable from information_schema.columns
       where table_schema = 'public' and table_name = 'form_guides' order by ordinal_position`,
    )
    expect(columns.map((row) => row.column_name)).toEqual(COLUMNS)
    expect(columns.map((row) => [row.udt_name, row.is_nullable])).toEqual([
      ['uuid', 'NO'],
      ['uuid', 'NO'],
      ['jsonb', 'NO'],
      ['timestamptz', 'NO'],
      ['timestamptz', 'NO'],
    ])
  })

  it('AC-4508.1: 기본 키는 id다', async () => {
    const key = await rows(
      `select a.attname from pg_index i
       join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
       where i.indrelid = $1::regclass and i.indisprimary`,
      [TABLE],
    )
    expect(key.map((row) => row.attname)).toEqual(['id'])
  })

  it('AC-4508.1: RLS가 켜져 있다', async () => {
    expect(await rows(`select relrowsecurity as on from pg_class where oid = $1::regclass`, [TABLE])).toEqual([{ on: true }])
  })

  it('AC-4508.1: 병원 줄을 지우면(운영자) 그 병원 안내문도 지워지고 다른 병원 줄은 그대로다', async () => {
    await seed(A)
    await seed(B)
    await operator()
    await rows('delete from public.hospitals where id = $1', [hospital[A]])
    expect(await rows(`select hospital_id from ${TABLE}`)).toEqual([{ hospital_id: hospital[B] }])
  })

  it('AC-4508.1: 표 단위 권한은 authenticated의 읽기·지우기뿐이다(넣기·고치기는 칸 단위, 비우기 등 없음)', async () => {
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
       where table_schema = 'public' and table_name = 'form_guides' and grantee in ('anon', 'authenticated', 'PUBLIC')
       order by grantee, privilege_type`,
    )
    expect(granted).toEqual([
      { grantee: 'authenticated', privilege_type: 'DELETE' },
      { grantee: 'authenticated', privilege_type: 'SELECT' },
    ])
  })

  it.each(['INSERT', 'UPDATE'])('AC-4508.1: authenticated의 %s 칸 권한은 content 하나뿐이다', async (privilege) => {
    await rows(`select $1::regclass`, [TABLE]) // 표가 없으면 여기서 실패한다(빈 목록과 헷갈리지 않게)
    const list = await rows(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'form_guides'
         and has_column_privilege('authenticated', 'public.form_guides', column_name, $1)
       order by ordinal_position`,
      [privilege],
    )
    expect(list.map((row) => row.column_name)).toEqual(SENT)
  })

  it('AC-4508.1: anon에게 표·칸 권한이 하나도 없다', async () => {
    for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']) {
      expect(await rows(`select has_any_column_privilege('anon', $1, $2) as ok`, [TABLE, privilege])).toEqual([{ ok: false }])
    }
    for (const privilege of ['DELETE', 'TRUNCATE', 'TRIGGER']) {
      expect(await rows(`select has_table_privilege('anon', $1, $2) as ok`, [TABLE, privilege])).toEqual([{ ok: false }])
    }
  })

  it('AC-4508.1: 정책 넷은 authenticated 대상이고 모두 my_hospital_id()로 거른다', async () => {
    const list = await rows(
      `select cmd, permissive, roles::text as roles, qual, with_check from pg_policies
       where schemaname = 'public' and tablename = 'form_guides' order by cmd`,
    )
    expect(list.map((p) => p.cmd)).toEqual(['DELETE', 'INSERT', 'SELECT', 'UPDATE'])
    for (const policy of list) {
      expect(policy).toMatchObject({ permissive: 'PERMISSIVE', roles: '{authenticated}' })
      if (policy.cmd !== 'INSERT') expect(policy.qual).toContain('my_hospital_id()')
      if (policy.cmd === 'INSERT' || policy.cmd === 'UPDATE') expect(policy.with_check).toContain('my_hospital_id()')
    }
  })

  it('AC-4508.1: updated_at 트리거는 고치기 전에 줄마다 돌고, 함수는 부른 사람 권한·빈 search_path다', async () => {
    const triggers = await rows(
      `select tgname, pg_get_triggerdef(oid) as def from pg_trigger
       where tgrelid = $1::regclass and not tgisinternal order by tgname`,
      [TABLE],
    )
    expect(triggers).toHaveLength(1)
    expect(triggers[0].def).toMatch(
      /BEFORE UPDATE ON public\.form_guides FOR EACH ROW EXECUTE FUNCTION (public\.)?form_guides_touch\(\)$/,
    )
    expect(
      await rows(`select prosecdef, proconfig from pg_proc where oid = to_regprocedure($1)`, [`public.${TOUCH}`]),
    ).toEqual([{ prosecdef: false, proconfig: ['search_path=""'] }])
  })

  it.each([
    ['public', false],
    ['anon', false],
    ['authenticated', false],
  ])('AC-4508.1: 트리거 함수 실행 권한 %s = %s(트리거만 부른다)', async (role, allowed) => {
    expect(await rows(`select has_function_privilege($1, $2, 'EXECUTE') as ok`, [role, `public.${TOUCH}`])).toEqual([
      { ok: allowed },
    ])
  })

  it.each([
    ['public', false],
    ['anon', false],
    ['authenticated', true],
  ])('AC-4508.1: my_hospital_id() 실행 권한 %s = %s', async (role, allowed) => {
    await rows(`select $1::regclass`, [TABLE]) // 이 파일이 돌았는지(인증 파일만으로도 함수는 있다)
    expect(await rows(`select has_function_privilege($1, 'public.my_hospital_id()', 'EXECUTE') as ok`, [role])).toEqual([
      { ok: allowed },
    ])
  })

  it('AC-4508.1: 파일 머리 주석에 운영자가 붙여 넣는 방법이 있다', () => {
    const lines = GUIDES_MIGRATION.split('\n')
    const head = lines.slice(0, lines.findIndex((line) => !/^(--|\s*$)/.test(line)))
    expect(head.join('\n')).toContain('운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다')
  })

  it('AC-4508.1: my_hospital_id()는 cross-branch C1 글자 그대로다', () => {
    expect(GUIDES_MIGRATION).toContain(C1_MY_HOSPITAL_ID)
  })

  it('AC-4508.1: 표 권한은 revoke all 뒤에만 준다', () => {
    const revoke = GUIDES_SQL.indexOf(`revoke all on table ${TABLE} from public, anon, authenticated;`)
    expect(revoke).toBeGreaterThanOrEqual(0)
    const grants = [...GUIDES_SQL.matchAll(new RegExp(`^grant [^;]+ on table ${TABLE.replace('.', '\\.')} to [^;]+;`, 'gm'))]
    expect(grants.length).toBeGreaterThan(0)
    for (const grant of grants) expect(grant.index).toBeGreaterThan(revoke)
  })

  it('AC-4508.1: 인증 → 이 파일만으로 돈다(통계·매출·처방·휴진 안내 표와 공용 touch 함수가 없는 DB)', async () => {
    expect(
      await rows(
        `select to_regclass('public.stats_days') as stats, to_regclass('public.rx_groups') as revenue,
                to_regclass('public.stats_rx_groups') as groups, to_regclass('public.form_notices') as notices,
                to_regprocedure('public.touch_updated_at()') as touch`,
      ),
    ).toEqual([{ stats: null, revenue: null, groups: null, notices: null, touch: null }])
    await become(A)
    expect(await insert(ROW, 'returning hospital_id, content')).toEqual([{ hospital_id: hospital[A], content: GUIDE }])
  })

  it('AC-4508.1: 다른 migration이 먼저 있어도 돌고, 새 표·함수 하나씩만 더하며 이미 있던 함수는 정의·권한이 그대로다', () => {
    expect(afterGuides.tables).toEqual([...beforeGuides.tables, 'form_guides'].sort())
    const added = afterGuides.functions.filter((fn) => !beforeGuides.functions.some((old) => old.fn === fn.fn))
    expect(added.map((fn) => fn.fn)).toEqual([TOUCH])
    expect(afterGuides.functions.filter((fn) => fn.fn !== TOUCH)).toEqual(beforeGuides.functions)
    expect(beforeGuides.functions.map((fn) => fn.fn)).toEqual(
      expect.arrayContaining(['my_hospital_id()', 'touch_updated_at()', 'stats_rx_groups_touch()', 'form_notices_touch()']),
    )
  })

  it('AC-4508.1: 다른 migration이 먼저 있는 DB에서도 새 표와 이미 있던 표(휴진 안내·처방 골라 보기)가 함께 돈다', async () => {
    const main = db
    db = full
    try {
      await resetData()
      await become(A)
      expect(await insert(ROW, 'returning hospital_id')).toEqual([{ hospital_id: hospital[A] }])
      // 이미 있던 표의 기본값이 공용 함수를 그대로 쓴다: 함수를 지웠다 다시 만들었다면 여기서 걸린다
      expect(
        await rows(
          `insert into public.form_notices (year, month, cards) values (2027, 5, '[{"name":"가짜"}]'::jsonb) returning hospital_id`,
        ),
      ).toEqual([{ hospital_id: hospital[A] }])
      expect(await rows(`insert into public.stats_rx_picks (code, name) values ('A1', '가짜') returning hospital_id`)).toEqual([
        { hospital_id: hospital[A] },
      ])
    } finally {
      await db.exec('reset role; reset request.jwt.claims')
      db = main
    }
  })

  it('AC-4508.1: 파일은 다른 갈래 표·함수를 부르거나 만들지 않고, 지우거나 비우는 문장도 없다(주석 밖 글자)', () => {
    expect(GUIDES_SQL).toContain(`create table ${TABLE}`)
    for (const other of [
      /\btouch_updated_at\b/,
      /\bform_notices/,
      /\brx_groups\b/,
      /\bstats_rx_groups\b/,
      /\bstats_rx_picks\b/,
      /\bstats_days\b/,
      /\bclaim_/,
    ]) {
      expect(GUIDES_SQL).not.toMatch(other)
    }
    expect(GUIDES_SQL).not.toMatch(/^\s*(drop|truncate)\b/im)
    for (const [, target] of GUIDES_SQL.matchAll(/^\s*alter table\s+(\S+)/gim)) expect(target).toBe(TABLE)
    // create or replace는 공용 함수 하나뿐이다
    expect([...GUIDES_SQL.matchAll(/create or replace function\s+(\S+?)\(/gi)].map((m) => m[1])).toEqual(['public.my_hospital_id'])
  })
})

describe('AC-4508.2 로그인 안 함', SLOW, () => {
  it('AC-4508.2: anon은 읽기·넣기·고치기·지우기 모두 권한 없음이고 줄은 그대로다', async () => {
    await seed(A)
    const before = await snapshot()
    await becomeAnon()
    await expect(rows(`select * from ${TABLE}`)).rejects.toThrow(DENIED)
    await expect(insert(ROW)).rejects.toThrow(DENIED)
    await expect(rows(`update ${TABLE} set content = $1`, [JSON.stringify(GUIDE2)])).rejects.toThrow(DENIED)
    await expect(rows(`delete from ${TABLE}`)).rejects.toThrow(DENIED)
    expect(await snapshot()).toEqual(before)
  })

  it('AC-4508.2: anon은 my_hospital_id()를 부르지 못한다', async () => {
    await rows(`select $1::regclass`, [TABLE])
    await becomeAnon()
    await expect(rows('select public.my_hospital_id()')).rejects.toThrow(DENIED)
  })
})

describe('AC-4508.2 승인된 병원은 자기 줄만, 대기·거절 병원은 아무것도', SLOW, () => {
  it('AC-4508.2: A는 자기 안내문을 넣고 읽고 고치고 지우며, 넣은 줄의 hospital_id·id·시각은 DB가 정한다', async () => {
    await become(A)
    const [added] = await insert(
      ROW,
      `returning id, hospital_id, created_at > now() - interval '1 hour' as created, updated_at > now() - interval '1 hour' as updated`,
    )
    expect(added).toMatchObject({ hospital_id: hospital[A], created: true, updated: true })
    expect(added.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect(await rows(`select content from ${TABLE}`)).toEqual([ROW])

    expect(
      await rows(`update ${TABLE} set content = $1 where id = $2 returning content`, [JSON.stringify(GUIDE2), added.id]),
    ).toEqual([{ content: GUIDE2 }])
    expect(await rows(`delete from ${TABLE} where id = $1 returning id`, [added.id])).toEqual([{ id: added.id }])
    expect(await rows(`select * from ${TABLE}`)).toEqual([])
    expect(await snapshot()).toEqual([])
  })

  it('AC-4508.2: B의 줄은 A에게 보이지 않고 id로 골라도 안 바뀌고, A가 지워도 0줄이다', async () => {
    const theirs = await seed(B)
    const before = await snapshot()
    await become(A)
    const changed = JSON.stringify(GUIDE2)
    expect(await rows(`select * from ${TABLE}`)).toEqual([])
    expect(await rows(`select * from ${TABLE} where id = $1`, [theirs.id])).toEqual([])
    expect(await rows(`update ${TABLE} set content = $1 where id = $2 returning id`, [changed, theirs.id])).toEqual([])
    expect(await rows(`update ${TABLE} set content = $1 returning id`, [changed])).toEqual([])
    expect(await rows(`delete from ${TABLE} where id = $1 returning id`, [theirs.id])).toEqual([])
    expect(await rows(`delete from ${TABLE} returning id`)).toEqual([])
    expect(await snapshot()).toEqual(before)
  })

  it('AC-4508.2: A와 B가 둘 다 줄이 있으면 A는 자기 줄만 보고 고치고 지운다', async () => {
    const mine = await seed(A)
    const theirs = await seed(B)
    await become(A)
    expect(await rows(`select id, hospital_id from ${TABLE}`)).toEqual([{ id: mine.id, hospital_id: hospital[A] }])
    expect(await rows(`update ${TABLE} set content = $1 returning id`, [JSON.stringify(GUIDE2)])).toEqual([{ id: mine.id }])
    expect(await rows(`delete from ${TABLE} returning id`)).toEqual([{ id: mine.id }])
    await operator()
    expect(await rows(`select id, content from ${TABLE}`)).toEqual([{ id: theirs.id, content: GUIDE }])
  })

  it.each([
    ['승인 대기', PENDING],
    ['거절', REJECTED],
  ])('AC-4508.2: %s 병원은 자기 줄도 0줄로 읽고, 넣기는 거부되고, 고치기·지우기는 0줄이다', async (_label, user) => {
    await seed(user)
    const before = await snapshot()
    await become(user)
    expect(await rows(`select * from ${TABLE}`)).toEqual([])
    await expect(insert(ROW)).rejects.toThrow(RLS)
    expect(await rows(`update ${TABLE} set content = $1 returning id`, [JSON.stringify(GUIDE2)])).toEqual([])
    expect(await rows(`delete from ${TABLE} returning id`)).toEqual([])
    expect(await snapshot()).toEqual(before)
  })

  it.each([
    ['내 병원', A],
    ['B 병원', B],
  ])('AC-4508.2: hospital_id를 직접 넣으면(%s) 권한 없음이다', async (_label, owner) => {
    await become(A)
    await expect(insert({ hospital_id: hospital[owner], ...ROW })).rejects.toThrow(DENIED)
    expect(await snapshot()).toEqual([])
  })

  it.each([
    ['id', OTHER_ID],
    ['created_at', OLD],
    ['updated_at', OLD],
  ])('AC-4508.2: %s를 직접 넣으면 권한 없음이다', async (column, value) => {
    await become(A)
    await expect(insert({ ...ROW, [column]: value })).rejects.toThrow(DENIED)
    expect(await snapshot()).toEqual([])
  })

  it.each([
    ['hospital_id', () => hospital[B]], // 병원 uuid는 시험마다 새로 생긴다
    ['id', () => OTHER_ID],
    ['created_at', () => OLD],
    ['updated_at', () => OLD],
  ])('AC-4508.2: %s를 고치면 권한 없음이고 줄은 그대로다', async (column, value) => {
    await seed(A)
    const before = await snapshot()
    await become(A)
    await expect(rows(`update ${TABLE} set ${column} = $1`, [value()])).rejects.toThrow(DENIED)
    expect(await snapshot()).toEqual(before)
  })
})

describe('AC-4508.3 칸 제약', SLOW, () => {
  beforeEach(() => become(A))

  // content는 JSON 글 그대로 보낸다('null'은 SQL null이 아니라 JSON null)
  it.each([
    ['content가 배열', JSON.stringify([GUIDE])],
    ['content가 빈 배열', '[]'],
    ['content가 글', JSON.stringify('보험 서류 안내')],
    ['content가 숫자', '1'],
    ['content가 참/거짓', 'true'],
    ['content가 JSON null', 'null'],
  ])('AC-4508.3 거부: %s → 줄이 남지 않는다', async (_label, json) => {
    await expect(rows(`insert into ${TABLE} (content) values ($1::jsonb)`, [json])).rejects.toThrow(CHECK)
    expect(await snapshot()).toEqual([])
  })

  it.each([
    ['안내문 객체', GUIDE],
    ['빈 객체(안 모양은 앱이 checkGuideValue로 본다)', {}],
  ])('AC-4508.3 허용: %s → 그대로 저장된다', async (_label, content) => {
    await insert({ content })
    await operator()
    expect(await rows(`select content from ${TABLE}`)).toEqual([{ content }])
  })

  it('AC-4508.3: 고치기에도 같은 제약이 걸리고 줄은 그대로다', async () => {
    await insert(ROW)
    const before = await snapshot()
    await become(A)
    await expect(rows(`update ${TABLE} set content = '[]'::jsonb`)).rejects.toThrow(CHECK)
    await expect(rows(`update ${TABLE} set content = $1::jsonb`, [JSON.stringify([GUIDE])])).rejects.toThrow(CHECK)
    await expect(rows(`update ${TABLE} set content = '"글"'::jsonb`)).rejects.toThrow(CHECK)
    await expect(rows(`update ${TABLE} set content = 'null'::jsonb`)).rejects.toThrow(CHECK)
    await expect(rows(`update ${TABLE} set content = $1::jsonb`, [JSON.stringify({ ...GUIDE, note: 'x'.repeat(4000) })])).rejects.toThrow(
      CHECK,
    )
    expect(await snapshot()).toEqual(before)
  })

  // content 글(jsonb를 글로 바꾼 것)의 바이트 수. 한글은 한 글자 3바이트다
  async function bytesOf(content: unknown) {
    const [row] = await rows(`select octet_length($1::jsonb::text) as n, char_length($1::jsonb::text) as chars`, [
      JSON.stringify(content),
    ])
    return row
  }

  it('AC-4508.3: content 글이 4,000바이트면 들어가고 4,001바이트면 거부된다', async () => {
    const ok = { ...GUIDE, note: 'x'.repeat(10) }
    const pad = 4000 - ((await bytesOf(ok)).n as number)
    const exact = { ...GUIDE, note: 'x'.repeat(10 + pad) }
    const over = { ...GUIDE, note: 'x'.repeat(10 + pad + 1) }
    expect((await bytesOf(exact)).n).toBe(4000)
    expect((await bytesOf(over)).n).toBe(4001)
    await expect(insert({ content: over })).rejects.toThrow(CHECK)
    await become(A)
    await insert({ content: exact })
    await operator()
    expect(await rows(`select content from ${TABLE}`)).toEqual([{ content: exact }])
  })

  it('AC-4508.3: 크기는 글자 수가 아니라 바이트다(한글 1,400자는 4,000바이트를 넘는다)', async () => {
    const korean = { ...GUIDE, note: '가'.repeat(1400) }
    const size = await bytesOf(korean)
    expect(size.chars).toBeLessThan(4000)
    expect(size.n).toBeGreaterThan(4000)
    await expect(insert({ content: korean })).rejects.toThrow(CHECK)
    expect(await snapshot()).toEqual([])
  })

  it('AC-4508.3: content는 비울 수 없다(SQL null)', async () => {
    await expect(insert({ content: null })).rejects.toThrow(NOT_NULL)
    await become(A)
    await expect(rows(`insert into ${TABLE} default values`)).rejects.toThrow(NOT_NULL)
    expect(await snapshot()).toEqual([])
  })

  it('AC-4508.3: 운영자가 넣어도 content 제약은 같다', async () => {
    await operator()
    await expect(insert({ hospital_id: hospital[A], content: [GUIDE] })).rejects.toThrow(CHECK)
    expect(await snapshot()).toEqual([])
  })

  it('AC-4508.3: 고칠 때마다 updated_at은 DB가 지금 시각으로 바꾸고 created_at은 그대로다(같은 값으로 고쳐도)', async () => {
    await seed(A, { ...ROW, created_at: OLD, updated_at: OLD })
    for (const content of [GUIDE2, GUIDE2, GUIDE]) {
      await operator()
      expect(await rows(`select updated_at from ${TABLE}`)).toEqual([{ updated_at: new Date(OLD) }])
      await become(A)
      expect(
        await rows(`update ${TABLE} set content = $1 returning updated_at > now() - interval '1 hour' as fresh, created_at, content`, [
          JSON.stringify(content),
        ]),
      ).toEqual([{ fresh: true, created_at: new Date(OLD), content }])
      // 다음 고치기를 보려고 옛 시각으로 되돌린다(운영자가 이 문장에서만 트리거를 끈다)
      await operator()
      await db.exec(`set session_replication_role = replica; update ${TABLE} set updated_at = '${OLD}'; set session_replication_role = origin`)
    }
  })

  it('AC-4508.3: 운영자가 updated_at을 직접 적어 고쳐도 트리거가 지금 시각으로 덮는다', async () => {
    await seed(A, { ...ROW, updated_at: OLD })
    await operator()
    expect(
      await rows(`update ${TABLE} set updated_at = $1 returning updated_at > now() - interval '1 hour' as fresh`, [OLD]),
    ).toEqual([{ fresh: true }])
  })
})

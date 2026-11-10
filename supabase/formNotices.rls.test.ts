import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

// 서식 탭 휴진 안내문 저장 표(form_notices) (forms REQ-3508, TASK-4).
// rxPicks.rls.test.ts·statsRxGroups.rls.test.ts와 같은 방법: 진짜 Postgres(PGlite, WASM)에서 운영자가 SQL 편집기에 붙일 파일을 그대로 돌린다.
// 실제 Supabase에는 붙지 않는다. Supabase가 미리 갖춘 것(역할·auth 스키마·새 표·함수·순서표의 기본 권한)만 흉내 낸다
const fileOf = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))
const read = (rel: string) => readFileSync(fileOf(rel), 'utf-8')
const AUTH_MIGRATION = read('./migrations/20261028000000_auth.sql')
const STATS_MIGRATION = read('./migrations/20261101000200_stats.sql')
const REVENUE_MIGRATION = read('./migrations/20261101000400_revenue.sql')
const PICKS_MIGRATION = read('./migrations/20261103000000_rx_picks.sql')
const GROUPS_MIGRATION = read('./migrations/20261105000100_stats_rx_groups.sql')
const NOTICES_PATH = fileOf('./migrations/20261110000000_form_notices.sql')
// 파일이 아직 없으면 빈 글자로 돌아, 시험마다 '표가 없다'로 실패한다(무엇이 빠졌는지 시험별로 보인다)
const NOTICES_MIGRATION = existsSync(NOTICES_PATH) ? readFileSync(NOTICES_PATH, 'utf-8') : ''
// 주석을 뺀 SQL 글자(머리 주석이 다른 갈래 표·함수 이름을 설명으로 말할 수 있다)
const NOTICES_SQL = NOTICES_MIGRATION.split('\n')
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

const TABLE = 'public.form_notices'
const COLUMNS = ['id', 'hospital_id', 'kind', 'year', 'month', 'cards', 'theme', 'created_at', 'updated_at']
const SENT = ['year', 'month', 'cards', 'theme'] // 사용자가 보낼 수 있는 칸(그 밖은 칸 권한이 없다)
const TOUCH = 'form_notices_touch()'
const OLD = '2001-01-01T00:00:00.000Z' // 운영자가 심는 옛 시각(DB가 바꿨는지 보려고)
const OTHER_ID = '00000000-0000-4000-8000-000000000123'

// 지어낸 안내문. 카드 모양은 src/types/forms.ts NoticeCard(DB는 배열 길이·크기만 본다)
const CARD = { start: '2027-05-05', end: null, name: '어린이날', status: '휴진' }
const CARD2 = { start: '2027-05-15', end: '2027-05-16', name: '학회', status: '휴진' }
const NOTICE: Row = { year: 2027, month: 5, cards: [CARD], theme: 'children' }

const SLOW = { timeout: 60_000 }
const DENIED = /permission denied/
const CHECK = /check constraint/
const RLS = /row-level security/
const NOT_NULL = /null value in column/

let db: PGlite // 인증 → 이 파일만 돌린 DB(다른 갈래 표가 없다)
let full: PGlite // 인증 → 통계 → 매출 → 처방 골라 보기 → 통계 묶음 → 이 파일
let hospital: Record<string, string> = {}
type Schema = Awaited<ReturnType<typeof schemaOf>>
let beforeNotices: Schema // full에 이 파일을 돌리기 전
let afterNotices: Schema // 돌린 뒤

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
  await db.exec(NOTICES_MIGRATION)

  full = await PGlite.create()
  await setUp(full)
  await full.exec(STATS_MIGRATION)
  await full.exec(REVENUE_MIGRATION)
  await full.exec(PICKS_MIGRATION)
  await full.exec(GROUPS_MIGRATION)
  beforeNotices = await schemaOf(full)
  await full.exec(NOTICES_MIGRATION)
  afterNotices = await schemaOf(full)
}, 120_000)

afterAll(async () => {
  await db.close()
  await full.close()
})

// 시험마다 빈 표에서 시작한다. 운영자(superuser)는 RLS를 건너뛴다
beforeEach(resetData)

describe('AC-3508.1 표·칸·RLS·권한·파일', SLOW, () => {
  it('AC-3508.1: 칸은 id·hospital_id·kind·year·month·cards·theme·created_at·updated_at 아홉뿐이고 theme만 비워 둘 수 있다', async () => {
    const columns = await rows(
      `select column_name, udt_name, is_nullable from information_schema.columns
       where table_schema = 'public' and table_name = 'form_notices' order by ordinal_position`,
    )
    expect(columns.map((row) => row.column_name)).toEqual(COLUMNS)
    expect(columns.map((row) => [row.udt_name, row.is_nullable])).toEqual([
      ['uuid', 'NO'],
      ['uuid', 'NO'],
      ['text', 'NO'],
      ['int2', 'NO'],
      ['int2', 'NO'],
      ['jsonb', 'NO'],
      ['text', 'YES'],
      ['timestamptz', 'NO'],
      ['timestamptz', 'NO'],
    ])
  })

  it('AC-3508.1: 기본 키는 id다', async () => {
    const key = await rows(
      `select a.attname from pg_index i
       join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
       where i.indrelid = $1::regclass and i.indisprimary`,
      [TABLE],
    )
    expect(key.map((row) => row.attname)).toEqual(['id'])
  })

  it('AC-3508.1: RLS가 켜져 있다', async () => {
    expect(await rows(`select relrowsecurity as on from pg_class where oid = $1::regclass`, [TABLE])).toEqual([{ on: true }])
  })

  it('AC-3508.1: 병원 줄을 지우면(운영자) 그 병원 안내문도 지워지고 다른 병원 줄은 그대로다', async () => {
    await seed(A)
    await seed(B)
    await operator()
    await rows('delete from public.hospitals where id = $1', [hospital[A]])
    expect(await rows(`select hospital_id from ${TABLE}`)).toEqual([{ hospital_id: hospital[B] }])
  })

  it('AC-3508.1: 표 단위 권한은 authenticated의 읽기·지우기뿐이다(넣기·고치기는 칸 단위, 비우기 등 없음)', async () => {
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
       where table_schema = 'public' and table_name = 'form_notices' and grantee in ('anon', 'authenticated', 'PUBLIC')
       order by grantee, privilege_type`,
    )
    expect(granted).toEqual([
      { grantee: 'authenticated', privilege_type: 'DELETE' },
      { grantee: 'authenticated', privilege_type: 'SELECT' },
    ])
  })

  it.each(['INSERT', 'UPDATE'])('AC-3508.1: authenticated의 %s 칸 권한은 year·month·cards·theme뿐이다', async (privilege) => {
    await rows(`select $1::regclass`, [TABLE]) // 표가 없으면 여기서 실패한다(빈 목록과 헷갈리지 않게)
    const list = await rows(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'form_notices'
         and has_column_privilege('authenticated', 'public.form_notices', column_name, $1)
       order by ordinal_position`,
      [privilege],
    )
    expect(list.map((row) => row.column_name)).toEqual(SENT)
  })

  it('AC-3508.1: anon에게 표·칸 권한이 하나도 없다', async () => {
    for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']) {
      expect(await rows(`select has_any_column_privilege('anon', $1, $2) as ok`, [TABLE, privilege])).toEqual([{ ok: false }])
    }
    for (const privilege of ['DELETE', 'TRUNCATE', 'TRIGGER']) {
      expect(await rows(`select has_table_privilege('anon', $1, $2) as ok`, [TABLE, privilege])).toEqual([{ ok: false }])
    }
  })

  it('AC-3508.1: 정책 넷은 authenticated 대상이고 모두 my_hospital_id()로 거른다', async () => {
    const list = await rows(
      `select cmd, permissive, roles::text as roles, qual, with_check from pg_policies
       where schemaname = 'public' and tablename = 'form_notices' order by cmd`,
    )
    expect(list.map((p) => p.cmd)).toEqual(['DELETE', 'INSERT', 'SELECT', 'UPDATE'])
    for (const policy of list) {
      expect(policy).toMatchObject({ permissive: 'PERMISSIVE', roles: '{authenticated}' })
      if (policy.cmd !== 'INSERT') expect(policy.qual).toContain('my_hospital_id()')
      if (policy.cmd === 'INSERT' || policy.cmd === 'UPDATE') expect(policy.with_check).toContain('my_hospital_id()')
    }
  })

  it('AC-3508.1: updated_at 트리거는 고치기 전에 줄마다 돌고, 함수는 부른 사람 권한·빈 search_path다', async () => {
    const triggers = await rows(
      `select tgname, pg_get_triggerdef(oid) as def from pg_trigger
       where tgrelid = $1::regclass and not tgisinternal order by tgname`,
      [TABLE],
    )
    expect(triggers).toHaveLength(1)
    expect(triggers[0].def).toMatch(
      /BEFORE UPDATE ON public\.form_notices FOR EACH ROW EXECUTE FUNCTION (public\.)?form_notices_touch\(\)$/,
    )
    expect(
      await rows(`select prosecdef, proconfig from pg_proc where oid = to_regprocedure($1)`, [`public.${TOUCH}`]),
    ).toEqual([{ prosecdef: false, proconfig: ['search_path=""'] }])
  })

  it.each([
    ['public', false],
    ['anon', false],
    ['authenticated', false],
  ])('AC-3508.1: 트리거 함수 실행 권한 %s = %s(트리거만 부른다)', async (role, allowed) => {
    expect(await rows(`select has_function_privilege($1, $2, 'EXECUTE') as ok`, [role, `public.${TOUCH}`])).toEqual([
      { ok: allowed },
    ])
  })

  it.each([
    ['public', false],
    ['anon', false],
    ['authenticated', true],
  ])('AC-3508.1: my_hospital_id() 실행 권한 %s = %s', async (role, allowed) => {
    await rows(`select $1::regclass`, [TABLE]) // 이 파일이 돌았는지(인증 파일만으로도 함수는 있다)
    expect(await rows(`select has_function_privilege($1, 'public.my_hospital_id()', 'EXECUTE') as ok`, [role])).toEqual([
      { ok: allowed },
    ])
  })

  it('AC-3508.1: 파일 머리 주석에 운영자가 붙여 넣는 방법이 있다', () => {
    const lines = NOTICES_MIGRATION.split('\n')
    const head = lines.slice(0, lines.findIndex((line) => !/^(--|\s*$)/.test(line)))
    expect(head.join('\n')).toContain('운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다')
  })

  it('AC-3508.1: my_hospital_id()는 cross-branch C1 글자 그대로다', () => {
    expect(NOTICES_MIGRATION).toContain(C1_MY_HOSPITAL_ID)
  })

  it('AC-3508.1: 표 권한은 revoke all 뒤에만 준다', () => {
    const revoke = NOTICES_SQL.indexOf(`revoke all on table ${TABLE} from public, anon, authenticated;`)
    expect(revoke).toBeGreaterThanOrEqual(0)
    const grants = [...NOTICES_SQL.matchAll(new RegExp(`^grant [^;]+ on table ${TABLE.replace('.', '\\.')} to [^;]+;`, 'gm'))]
    expect(grants.length).toBeGreaterThan(0)
    for (const grant of grants) expect(grant.index).toBeGreaterThan(revoke)
  })

  it('AC-3508.1: 인증 → 이 파일만으로 돈다(통계·매출·처방 표와 공용 touch 함수가 없는 DB)', async () => {
    expect(
      await rows(
        `select to_regclass('public.stats_days') as stats, to_regclass('public.rx_groups') as revenue,
                to_regclass('public.stats_rx_groups') as groups, to_regprocedure('public.touch_updated_at()') as touch`,
      ),
    ).toEqual([{ stats: null, revenue: null, groups: null, touch: null }])
    await become(A)
    expect(await insert(NOTICE, 'returning hospital_id, year, month, cards, theme')).toEqual([{ hospital_id: hospital[A], ...NOTICE }])
  })

  it('AC-3508.1: 다른 migration이 먼저 있어도 돌고, 새 표·함수 하나씩만 더하며 이미 있던 함수는 정의·권한이 그대로다', () => {
    expect(afterNotices.tables).toEqual([...beforeNotices.tables, 'form_notices'].sort())
    const added = afterNotices.functions.filter((fn) => !beforeNotices.functions.some((old) => old.fn === fn.fn))
    expect(added.map((fn) => fn.fn)).toEqual([TOUCH])
    expect(afterNotices.functions.filter((fn) => fn.fn !== TOUCH)).toEqual(beforeNotices.functions)
    expect(beforeNotices.functions.map((fn) => fn.fn)).toEqual(
      expect.arrayContaining(['my_hospital_id()', 'touch_updated_at()', 'stats_rx_groups_touch()']),
    )
  })

  it('AC-3508.1: 다른 migration이 먼저 있는 DB에서도 새 표와 이미 있던 표가 함께 돈다', async () => {
    const main = db
    db = full
    try {
      await resetData()
      await become(A)
      expect(await insert(NOTICE, 'returning hospital_id')).toEqual([{ hospital_id: hospital[A] }])
      // 이미 있던 표의 기본값이 공용 함수를 그대로 쓴다: 함수를 지웠다 다시 만들었다면 여기서 걸린다
      expect(await rows(`insert into public.stats_rx_picks (code, name) values ('A1', '가짜') returning hospital_id`)).toEqual([
        { hospital_id: hospital[A] },
      ])
    } finally {
      await db.exec('reset role; reset request.jwt.claims')
      db = main
    }
  })

  it('AC-3508.1: 파일은 다른 갈래 표·함수를 부르거나 만들지 않고, 지우거나 비우는 문장도 없다(주석 밖 글자)', () => {
    expect(NOTICES_SQL).toContain(`create table ${TABLE}`)
    for (const other of [/\btouch_updated_at\b/, /\brx_groups\b/, /\bstats_rx_groups\b/, /\bstats_rx_picks\b/, /\bstats_days\b/, /\bclaim_/]) {
      expect(NOTICES_SQL).not.toMatch(other)
    }
    expect(NOTICES_SQL).not.toMatch(/^\s*(drop|truncate)\b/im)
    for (const [, target] of NOTICES_SQL.matchAll(/^\s*alter table\s+(\S+)/gim)) expect(target).toBe(TABLE)
    // create or replace는 공용 함수 하나뿐이다
    expect([...NOTICES_SQL.matchAll(/create or replace function\s+(\S+?)\(/gi)].map((m) => m[1])).toEqual(['public.my_hospital_id'])
  })
})

describe('AC-3508.2 로그인 안 함', SLOW, () => {
  it('AC-3508.2: anon은 읽기·넣기·고치기·지우기 모두 권한 없음이고 줄은 그대로다', async () => {
    await seed(A)
    const before = await snapshot()
    await becomeAnon()
    await expect(rows(`select * from ${TABLE}`)).rejects.toThrow(DENIED)
    await expect(insert(NOTICE)).rejects.toThrow(DENIED)
    await expect(rows(`update ${TABLE} set month = 6`)).rejects.toThrow(DENIED)
    await expect(rows(`delete from ${TABLE}`)).rejects.toThrow(DENIED)
    expect(await snapshot()).toEqual(before)
  })

  it('AC-3508.2: anon은 my_hospital_id()를 부르지 못한다', async () => {
    await rows(`select $1::regclass`, [TABLE])
    await becomeAnon()
    await expect(rows('select public.my_hospital_id()')).rejects.toThrow(DENIED)
  })
})

describe('AC-3508.2 승인된 병원은 자기 줄만, 대기·거절 병원은 아무것도', SLOW, () => {
  it('AC-3508.2: A는 자기 안내문을 넣고 읽고 고치고 지우며, 넣은 줄의 hospital_id·kind·id·시각은 DB가 정한다', async () => {
    await become(A)
    const [added] = await insert(
      NOTICE,
      `returning id, hospital_id, kind, created_at > now() - interval '1 hour' as created, updated_at > now() - interval '1 hour' as updated`,
    )
    expect(added).toMatchObject({ hospital_id: hospital[A], kind: 'closure', created: true, updated: true })
    expect(added.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect(await rows(`select year, month, cards, theme from ${TABLE}`)).toEqual([NOTICE])

    const changed = { year: 2027, month: 6, cards: [CARD, CARD2], theme: null }
    expect(
      await rows(`update ${TABLE} set year = $1, month = $2, cards = $3, theme = $4 where id = $5 returning year, month, cards, theme`, [
        changed.year,
        changed.month,
        JSON.stringify(changed.cards),
        changed.theme,
        added.id,
      ]),
    ).toEqual([changed])
    expect(await rows(`delete from ${TABLE} where id = $1 returning id`, [added.id])).toEqual([{ id: added.id }])
    expect(await rows(`select * from ${TABLE}`)).toEqual([])
    expect(await snapshot()).toEqual([])
  })

  it('AC-3508.2: B의 줄은 A에게 보이지 않고 id로 골라도 안 바뀌고, A가 지워도 0줄이다', async () => {
    const theirs = await seed(B)
    const before = await snapshot()
    await become(A)
    expect(await rows(`select * from ${TABLE}`)).toEqual([])
    expect(await rows(`select * from ${TABLE} where id = $1`, [theirs.id])).toEqual([])
    expect(await rows(`update ${TABLE} set month = 6 where id = $1 returning id`, [theirs.id])).toEqual([])
    expect(await rows(`update ${TABLE} set month = 6 returning id`)).toEqual([])
    expect(await rows(`delete from ${TABLE} where id = $1 returning id`, [theirs.id])).toEqual([])
    expect(await rows(`delete from ${TABLE} returning id`)).toEqual([])
    expect(await snapshot()).toEqual(before)
  })

  it('AC-3508.2: A와 B가 둘 다 줄이 있으면 A는 자기 줄만 보고 고치고 지운다', async () => {
    const mine = await seed(A)
    const theirs = await seed(B)
    await become(A)
    expect(await rows(`select id, hospital_id from ${TABLE}`)).toEqual([{ id: mine.id, hospital_id: hospital[A] }])
    expect(await rows(`update ${TABLE} set month = 6 returning id`)).toEqual([{ id: mine.id }])
    expect(await rows(`delete from ${TABLE} returning id`)).toEqual([{ id: mine.id }])
    await operator()
    expect(await rows(`select id, month from ${TABLE}`)).toEqual([{ id: theirs.id, month: NOTICE.month }])
  })

  it.each([
    ['승인 대기', PENDING],
    ['거절', REJECTED],
  ])('AC-3508.2: %s 병원은 자기 줄도 0줄로 읽고, 넣기는 거부되고, 고치기·지우기는 0줄이다', async (_label, user) => {
    await seed(user)
    const before = await snapshot()
    await become(user)
    expect(await rows(`select * from ${TABLE}`)).toEqual([])
    await expect(insert(NOTICE)).rejects.toThrow(RLS)
    expect(await rows(`update ${TABLE} set month = 6 returning id`)).toEqual([])
    expect(await rows(`delete from ${TABLE} returning id`)).toEqual([])
    expect(await snapshot()).toEqual(before)
  })

  it.each([
    ['내 병원', A],
    ['B 병원', B],
  ])('AC-3508.2: hospital_id를 직접 넣으면(%s) 권한 없음이다', async (_label, owner) => {
    await become(A)
    await expect(insert({ hospital_id: hospital[owner], ...NOTICE })).rejects.toThrow(DENIED)
    expect(await snapshot()).toEqual([])
  })

  it.each([
    ['id', OTHER_ID],
    ['kind', 'closure'],
    ['created_at', OLD],
    ['updated_at', OLD],
  ])('AC-3508.2: %s를 직접 넣으면 권한 없음이다', async (column, value) => {
    await become(A)
    await expect(insert({ ...NOTICE, [column]: value })).rejects.toThrow(DENIED)
    expect(await snapshot()).toEqual([])
  })

  it.each([
    ['hospital_id', () => hospital[B]], // 병원 uuid는 시험마다 새로 생긴다
    ['id', () => OTHER_ID],
    ['kind', () => 'closure'],
    ['created_at', () => OLD],
    ['updated_at', () => OLD],
  ])('AC-3508.2: %s를 고치면 권한 없음이고 줄은 그대로다', async (column, value) => {
    await seed(A)
    const before = await snapshot()
    await become(A)
    await expect(rows(`update ${TABLE} set ${column} = $1`, [value()])).rejects.toThrow(DENIED)
    expect(await snapshot()).toEqual(before)
  })
})

describe('AC-3508.3 칸 제약', SLOW, () => {
  beforeEach(() => become(A))

  it.each([
    ['year 2019', { year: 2019 }],
    ['year 2101', { year: 2101 }],
    ['month 0', { month: 0 }],
    ['month 13', { month: 13 }],
    ['카드 0장', { cards: [] }],
    ['카드 5장', { cards: [CARD, CARD2, CARD, CARD2, CARD] }],
    ['cards가 객체', { cards: { 0: CARD } }],
    ['cards가 글', { cards: '어린이날' }],
    ['cards가 숫자', { cards: 1 }],
    ['cards가 JSON null', { cards: null, jsonNull: true }],
    ['theme 대문자·밑줄', { theme: 'Bad_Theme' }],
    ['theme 대문자', { theme: 'Children' }],
    ['theme 빈 글', { theme: '' }],
    ['theme 33자', { theme: 'a'.repeat(33) }],
    ['theme 빈칸', { theme: 'chil dren' }],
    ['theme 뒤 줄바꿈', { theme: 'children\n' }],
    ['theme 한글', { theme: '어린이날' }],
    ['theme 점', { theme: 'm.01' }],
  ])('AC-3508.3 거부: %s → 줄이 남지 않는다', async (_label, change: Row) => {
    const { jsonNull, ...values } = change
    const row = { ...NOTICE, ...values }
    if (jsonNull) {
      await expect(
        rows(`insert into ${TABLE} (year, month, cards, theme) values ($1, $2, 'null'::jsonb, $3)`, [row.year, row.month, row.theme]),
      ).rejects.toThrow(CHECK)
    } else {
      await expect(insert(row)).rejects.toThrow(CHECK)
    }
    expect(await snapshot()).toEqual([])
  })

  it.each([
    ['year 2020', { year: 2020 }],
    ['year 2100', { year: 2100 }],
    ['month 1', { month: 1 }],
    ['month 12', { month: 12 }],
    ['카드 1장', { cards: [CARD] }],
    ['카드 4장', { cards: [CARD, CARD2, CARD, CARD2] }],
    ['theme 없음(null = 저절로)', { theme: null }],
    ['theme m01', { theme: 'm01' }],
    ['theme 32자', { theme: 'a'.repeat(32) }],
    ['theme 붙임표', { theme: 'new-year-2' }],
  ])('AC-3508.3 허용: %s → 그대로 저장된다', async (_label, change: Row) => {
    const row = { ...NOTICE, ...change }
    await insert(row)
    await operator()
    expect(await rows(`select year, month, cards, theme from ${TABLE}`)).toEqual([row])
  })

  it('AC-3508.3: 고치기에도 같은 제약이 걸리고 줄은 그대로다', async () => {
    await insert(NOTICE)
    const before = await snapshot()
    await become(A)
    await expect(rows(`update ${TABLE} set year = 2019`)).rejects.toThrow(CHECK)
    await expect(rows(`update ${TABLE} set month = 13`)).rejects.toThrow(CHECK)
    await expect(rows(`update ${TABLE} set cards = '[]'::jsonb`)).rejects.toThrow(CHECK)
    await expect(rows(`update ${TABLE} set cards = $1::jsonb`, [JSON.stringify([CARD, CARD, CARD, CARD, CARD])])).rejects.toThrow(
      CHECK,
    )
    await expect(rows(`update ${TABLE} set theme = 'Bad_Theme'`)).rejects.toThrow(CHECK)
    expect(await snapshot()).toEqual(before)
  })

  // 카드 글(jsonb를 글로 바꾼 것)의 바이트 수. 한글은 한 글자 3바이트다
  async function bytesOf(cards: unknown) {
    const [row] = await rows(`select octet_length($1::jsonb::text) as n, char_length($1::jsonb::text) as chars`, [
      JSON.stringify(cards),
    ])
    return row
  }

  it('AC-3508.3: cards 글이 4,000바이트면 들어가고 4,001바이트면 거부된다', async () => {
    const ok = [{ ...CARD, name: 'x'.repeat(10) }]
    const pad = 4000 - ((await bytesOf(ok)).n as number)
    const exact = [{ ...CARD, name: 'x'.repeat(10 + pad) }]
    const over = [{ ...CARD, name: 'x'.repeat(10 + pad + 1) }]
    expect((await bytesOf(exact)).n).toBe(4000)
    expect((await bytesOf(over)).n).toBe(4001)
    await expect(insert({ ...NOTICE, cards: over })).rejects.toThrow(CHECK)
    await become(A)
    await insert({ ...NOTICE, cards: exact })
    await operator()
    expect(await rows(`select cards from ${TABLE}`)).toEqual([{ cards: exact }])
  })

  it('AC-3508.3: 크기는 글자 수가 아니라 바이트다(한글 1,400자는 4,000바이트를 넘는다)', async () => {
    const korean = [{ ...CARD, name: '가'.repeat(1400) }]
    const size = await bytesOf(korean)
    expect(size.chars).toBeLessThan(4000)
    expect(size.n).toBeGreaterThan(4000)
    await expect(insert({ ...NOTICE, cards: korean })).rejects.toThrow(CHECK)
    expect(await snapshot()).toEqual([])
  })

  it('AC-3508.3: year·month·cards는 비울 수 없다', async () => {
    for (const column of ['year', 'month', 'cards']) {
      await become(A)
      await expect(insert({ ...NOTICE, [column]: null })).rejects.toThrow(NOT_NULL)
    }
    expect(await snapshot()).toEqual([])
  })

  it("AC-3508.3: kind는 'closure'만 된다(운영자가 넣어도)", async () => {
    await operator()
    await expect(insert({ hospital_id: hospital[A], ...NOTICE, kind: 'other' })).rejects.toThrow(CHECK)
    expect(await snapshot()).toEqual([])
  })

  it('AC-3508.3: 고칠 때마다 updated_at은 DB가 지금 시각으로 바꾸고 created_at은 그대로다', async () => {
    await seed(A, { ...NOTICE, created_at: OLD, updated_at: OLD })
    for (const change of ['month = 6', `cards = '${JSON.stringify([CARD2])}'::jsonb`, 'theme = null']) {
      await operator()
      expect(await rows(`select updated_at from ${TABLE}`)).toEqual([{ updated_at: new Date(OLD) }])
      await become(A)
      expect(
        await rows(`update ${TABLE} set ${change} returning updated_at > now() - interval '1 hour' as fresh, created_at`),
      ).toEqual([{ fresh: true, created_at: new Date(OLD) }])
      // 다음 고치기를 보려고 옛 시각으로 되돌린다(운영자가 이 문장에서만 트리거를 끈다)
      await operator()
      await db.exec(`set session_replication_role = replica; update ${TABLE} set updated_at = '${OLD}'; set session_replication_role = origin`)
    }
  })

  it('AC-3508.3: 운영자가 updated_at을 직접 적어 고쳐도 트리거가 지금 시각으로 덮는다', async () => {
    await seed(A, { ...NOTICE, updated_at: OLD })
    await operator()
    expect(
      await rows(`update ${TABLE} set updated_at = $1 returning updated_at > now() - interval '1 hour' as fresh`, [OLD]),
    ).toEqual([{ fresh: true }])
  })
})

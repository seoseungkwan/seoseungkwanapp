import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

// 통계 '치료별 추세'의 묶음 표(stats_rx_groups)·저장 함수(save_stats_rx_groups)와 계획 문서 줄 (treatment-trend REQ-1202·REQ-1214, TASK-1).
// revenue.rls.test.ts·rxPicks.rls.test.ts와 같은 방법: 진짜 Postgres(PGlite, WASM)에서 운영자가 SQL 편집기에 붙일 파일을 그대로 돌린다.
// 실제 Supabase에는 붙지 않는다. Supabase가 미리 갖춘 것(역할·auth 스키마·새 표·함수·순서표의 기본 권한)만 흉내 낸다
const fileOf = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))
const read = (rel: string) => readFileSync(fileOf(rel), 'utf-8')
const AUTH_MIGRATION = read('./migrations/20261028000000_auth.sql')
const STATS_MIGRATION = read('./migrations/20261101000200_stats.sql')
const REVENUE_MIGRATION = read('./migrations/20261101000400_revenue.sql')
const PICKS_MIGRATION = read('./migrations/20261103000000_rx_picks.sql')
const GROUPS_PATH = fileOf('./migrations/20261105000100_stats_rx_groups.sql')
// 파일이 아직 없으면 빈 글자로 돌아, 시험마다 '표가 없다'로 실패한다(무엇이 빠졌는지 시험별로 보인다)
const GROUPS_MIGRATION = existsSync(GROUPS_PATH) ? readFileSync(GROUPS_PATH, 'utf-8') : ''
// 주석을 뺀 SQL 글자(머리 주석이 다른 갈래 표·함수 이름을 설명으로 말한다)
const GROUPS_SQL = GROUPS_MIGRATION.split('\n')
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

const TABLE = 'public.stats_rx_groups'
const COLUMNS = ['id', 'hospital_id', 'name', 'codes', 'sort_order', 'updated_at']
const SENT = ['name', 'codes', 'sort_order'] // 사용자가 보낼 수 있는 칸(그 밖은 칸 권한이 없다)
const NEW_FUNCTIONS = [
  'save_stats_rx_groups(jsonb)',
  'stats_rx_group_codes_ok(text[])',
  'stats_rx_groups_code_once()',
  'stats_rx_groups_touch()',
]
// 지어낸 묶음. 코드는 통계 일 숫자의 코드 모양(100자까지, 빈칸·괄호 가능)을 따른다
const GROUP: Row = { name: '도수치료', codes: ['MM101', 'MM102'], sort_order: 0 }
const PROPOSALS = [
  { name: '도수치료', codes: ['도수'], sort_order: 0 },
  { name: '체외충격파', codes: ['ESWT1', 'eswt7'], sort_order: 1 },
  { name: 'C-arm 주사', codes: ['CARM1'], sort_order: 2 },
  { name: '초음파', codes: ['SONO1'], sort_order: 3 },
  { name: '냉동치료', codes: ['CRYO'], sort_order: 4 },
]
const SAVE = 'select * from public.save_stats_rx_groups(groups := $1::jsonb)'

const SLOW = { timeout: 60_000 }
const DENIED = /permission denied/
const CHECK = /check constraint/
const RLS = /row-level security/
const NOT_NULL = /null value in column/
const BAD_INPUT = /invalid input syntax/
const BAD_GROUPS = /bad groups/
const NOT_MINE = /not my group/
// 둘 다 23505다. 이름 겹침은 고유 제약, 코드 겹침은 끝에 도는 제약 트리거
const SAME_NAME = { code: '23505', message: expect.stringMatching(/duplicate key value violates unique constraint/) }
const CODE_TWICE = { code: '23505', message: 'code in two groups' }

let db: PGlite // 인증 → 이 파일만 돌린 DB(다른 갈래 표가 없다)
let full: PGlite // 인증 → 통계 → 매출 → 처방 골라 보기 → 이 파일
let hospital: Record<string, string> = {}
type Schema = Awaited<ReturnType<typeof schemaOf>>
let beforeGroups: Schema // full에 이 파일을 돌리기 전
let afterGroups: Schema // 돌린 뒤

async function setUp(target: PGlite) {
  await target.exec(SUPABASE_MOCK)
  await target.exec(AUTH_MIGRATION)
}

// 다른 갈래 것이 그대로인지 보려고 public의 표 이름, 함수(정의·권한), rx_groups 표의 모든 모양을 모은다
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
    rxGroups: {
      table: await q(`select relacl::text as acl, relrowsecurity from pg_class where oid = to_regclass('public.rx_groups')`),
      columns: await q(
        `select column_name, data_type, column_default, is_nullable from information_schema.columns
         where table_schema = 'public' and table_name = 'rx_groups' order by ordinal_position`,
      ),
      constraints: await q(
        `select conname, pg_get_constraintdef(oid) as def, condeferrable, condeferred from pg_constraint
         where conrelid = to_regclass('public.rx_groups') order by conname`,
      ),
      triggers: await q(
        `select tgname, pg_get_triggerdef(oid) as def from pg_trigger
         where tgrelid = to_regclass('public.rx_groups') and not tgisinternal order by tgname`,
      ),
      policies: await q(
        `select policyname, cmd, roles::text as roles, qual, with_check from pg_policies
         where schemaname = 'public' and tablename = 'rx_groups' order by policyname`,
      ),
    },
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
  await db.exec('rollback') // 앞 시험이 트랜잭션 도중에 실패해도 다음 시험까지 번지지 않게
  await operator()
  await db.exec('truncate auth.users cascade') // 병원·묶음 줄도 같이 비워진다
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

function insert(row: Row, suffix = '') {
  const columns = Object.keys(row)
  return rows(
    `insert into ${TABLE} (${columns.join(', ')}) values (${columns.map((_, i) => `$${i + 1}`).join(', ')}) ${suffix}`,
    Object.values(row),
  )
}

// 운영자가 owner 병원 줄을 넣는다(칸 권한·RLS를 건너뛴다). 넣은 줄을 돌려준다
async function seed(owner: string, row: Row = GROUP) {
  await operator()
  const [added] = await insert({ hospital_id: hospital[owner], ...row }, 'returning *')
  return added
}

// 운영자 눈으로 본 표 전체(바뀌지 않았는지 비교할 때)
async function snapshot(table = TABLE) {
  await operator()
  return rows(`select * from ${table} order by hospital_id, sort_order, name`)
}

async function groupNames() {
  await operator()
  return (await rows(`select name from ${TABLE} order by name`)).map((row) => row.name)
}

// PostgREST처럼 BEGIN → 함수 호출 → COMMIT. 이름·코드 겹침 검사는 COMMIT에서 돈다
async function save(groups: unknown, sql = SAVE) {
  await db.exec('begin')
  try {
    const saved = await rows(sql, [JSON.stringify(groups)])
    await db.exec('commit')
    return saved
  } catch (error) {
    await db.exec('rollback')
    throw error
  }
}

// 함수 호출은 지나가고(겹침 검사가 미뤄져 있다) COMMIT에서 실패해야 한다. 함수가 돌려준 목록을 돌려준다(그때 이미 지움까지 돌았다)
async function expectSaveFailsAtCommit(groups: unknown, error: Row) {
  await db.exec('begin')
  const returned = await rows(SAVE, [JSON.stringify(groups)])
  await expect(db.exec('commit')).rejects.toMatchObject(error)
  return returned
}

// full DB로 바꿔 빈 표에서 시험한다
async function onFull(run: () => Promise<void>) {
  const main = db
  db = full
  try {
    await resetData()
    await run()
  } finally {
    await db.exec('rollback; reset role; reset request.jwt.claims')
    db = main
  }
}

beforeAll(async () => {
  db = await PGlite.create()
  await setUp(db)
  await db.exec(GROUPS_MIGRATION)

  full = await PGlite.create()
  await setUp(full)
  await full.exec(STATS_MIGRATION)
  await full.exec(REVENUE_MIGRATION)
  await full.exec(PICKS_MIGRATION)
  beforeGroups = await schemaOf(full)
  await full.exec(GROUPS_MIGRATION)
  afterGroups = await schemaOf(full)
}, 120_000)

afterAll(async () => {
  await db.close()
  await full.close()
})

// 시험마다 빈 표에서 시작한다. 운영자(superuser)는 RLS를 건너뛴다
beforeEach(resetData)

describe('AC-1202.1 표·칸·RLS·파일 머리·다른 갈래와 함께 돌기', SLOW, () => {
  it('AC-1202.1: 칸은 id·hospital_id·name·codes·sort_order·updated_at 여섯뿐이다(환자 칸 없음)', async () => {
    const columns = await rows(
      `select column_name, udt_name, is_nullable from information_schema.columns
       where table_schema = 'public' and table_name = 'stats_rx_groups' order by ordinal_position`,
    )
    expect(columns.map((row) => row.column_name)).toEqual(COLUMNS)
    expect(columns.map((row) => [row.udt_name, row.is_nullable])).toEqual([
      ['uuid', 'NO'],
      ['uuid', 'NO'],
      ['text', 'NO'],
      ['_text', 'NO'],
      ['int4', 'NO'],
      ['timestamptz', 'NO'],
    ])
  })

  it('AC-1202.1: 기본 키는 id다', async () => {
    const key = await rows(
      `select a.attname from pg_index i
       join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
       where i.indrelid = $1::regclass and i.indisprimary`,
      [TABLE],
    )
    expect(key.map((row) => row.attname)).toEqual(['id'])
  })

  it('AC-1202.1: RLS가 켜져 있다', async () => {
    expect(await rows(`select relrowsecurity as on from pg_class where oid = $1::regclass`, [TABLE])).toEqual([{ on: true }])
  })

  it('AC-1202.1: 병원 줄을 지우면(운영자) 그 병원 묶음도 지워지고 다른 병원 줄은 그대로다', async () => {
    await seed(A)
    await seed(B)
    await operator()
    await rows('delete from public.hospitals where id = $1', [hospital[A]])
    expect(await rows(`select hospital_id from ${TABLE}`)).toEqual([{ hospital_id: hospital[B] }])
  })

  it('AC-1202.1: 파일 머리 주석에 운영자가 붙여 넣는 방법이 있다', () => {
    const lines = GROUPS_MIGRATION.split('\n')
    const head = lines.slice(0, lines.findIndex((line) => !/^(--|\s*$)/.test(line)))
    expect(head.join('\n')).toContain('운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다')
  })

  it('AC-1202.1: my_hospital_id()는 cross-branch C1 글자 그대로다', () => {
    expect(GROUPS_MIGRATION).toContain(C1_MY_HOSPITAL_ID)
  })

  it('AC-1202.1: 인증 → 이 파일만으로 돈다(통계·매출·처방 골라 보기 표와 함수가 없는 DB)', async () => {
    expect(
      await rows(
        `select to_regclass('public.stats_days') as stats, to_regclass('public.rx_groups') as revenue,
                to_regclass('public.stats_rx_picks') as picks, to_regprocedure('public.save_rx_groups(jsonb)') as save,
                to_regprocedure('public.touch_updated_at()') as touch`,
      ),
    ).toEqual([{ stats: null, revenue: null, picks: null, save: null, touch: null }])
    await become(A)
    expect(await insert(GROUP, 'returning hospital_id, name, codes, sort_order')).toEqual([{ hospital_id: hospital[A], ...GROUP }])
  })

  it('AC-1202.1: 다른 migration이 먼저 있어도 돌고, 새 표·함수 넷만 더하며 다른 표·함수(my_hospital_id·touch_updated_at·save_rx_groups 등)와 rx_groups는 그대로다', () => {
    expect(afterGroups.tables).toEqual([...beforeGroups.tables, 'stats_rx_groups'].sort())
    const added = afterGroups.functions.filter((fn) => !beforeGroups.functions.some((old) => old.fn === fn.fn))
    expect(added.map((fn) => fn.fn)).toEqual(NEW_FUNCTIONS)
    // 이미 있던 함수는 정의도 권한도 한 글자 그대로다(my_hospital_id는 같은 글자로 다시 만든다)
    expect(afterGroups.functions.filter((fn) => !NEW_FUNCTIONS.includes(fn.fn as string))).toEqual(beforeGroups.functions)
    expect(beforeGroups.functions.map((fn) => fn.fn)).toEqual(
      expect.arrayContaining(['my_hospital_id()', 'touch_updated_at()', 'save_rx_groups(jsonb)', 'rx_group_codes_ok(text[])']),
    )
    expect(afterGroups.rxGroups).toEqual(beforeGroups.rxGroups)
    expect(beforeGroups.rxGroups.columns).toHaveLength(6) // 빈 비교가 아니다: rx_groups가 정말 있다
  })

  it('AC-1202.1: 다른 migration이 먼저 있는 DB에서도 새 표와 이미 있던 표가 함께 돈다', async () => {
    await onFull(async () => {
      await become(A)
      expect(await insert(GROUP, 'returning hospital_id')).toEqual([{ hospital_id: hospital[A] }])
      // 이미 있던 표의 기본값·트리거가 공용 함수를 그대로 쓴다: 함수를 지웠다 다시 만들었다면 여기서 걸린다
      expect(await rows(`insert into public.rx_groups (name, codes) values ('가짜 묶음', array['A1']) returning hospital_id`)).toEqual([
        { hospital_id: hospital[A] },
      ])
      expect(await rows(`insert into public.stats_rx_picks (code, name) values ('A1', '가짜') returning hospital_id`)).toEqual([
        { hospital_id: hospital[A] },
      ])
      await operator()
      await rows(`update public.rx_groups set updated_at = '2001-01-01T00:00:00Z'`)
      await become(A)
      expect(
        await rows(`update public.rx_groups set sort_order = 1 returning updated_at > now() - interval '1 hour' as fresh`),
      ).toEqual([{ fresh: true }])
    })
  })

  it('AC-1202.1: 파일은 다른 갈래 표·함수를 부르거나 만들지 않고, 지우거나 비우는 문장도 없다(주석 밖 글자)', () => {
    expect(GROUPS_SQL).toContain(`create table ${TABLE}`)
    for (const other of [/\brx_groups\b/, /\bsave_rx_groups\b/, /\btouch_updated_at\b/, /\brx_group_codes_ok\b/, /\bstats_days\b/, /\bstats_rx_picks\b/]) {
      expect(GROUPS_SQL).not.toMatch(other)
    }
    expect(GROUPS_SQL).not.toMatch(/^\s*(drop|truncate)\b/im)
    for (const [, target] of GROUPS_SQL.matchAll(/^\s*alter table\s+(\S+)/gim)) expect(target).toBe(TABLE)
    // create or replace는 공용 함수 하나뿐이다
    expect([...GROUPS_SQL.matchAll(/create or replace function\s+(\S+?)\(/gi)].map((m) => m[1])).toEqual(['public.my_hospital_id'])
  })
})

describe('AC-1202.2 로그인 안 함', SLOW, () => {
  it('AC-1202.2: anon에게 표·칸 권한이 하나도 없다', async () => {
    for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']) {
      expect(await rows(`select has_any_column_privilege('anon', $1, $2) as ok`, [TABLE, privilege])).toEqual([{ ok: false }])
    }
    for (const privilege of ['DELETE', 'TRUNCATE', 'TRIGGER']) {
      expect(await rows(`select has_table_privilege('anon', $1, $2) as ok`, [TABLE, privilege])).toEqual([{ ok: false }])
    }
  })

  it('AC-1202.2: anon은 읽기·넣기·고치기·지우기 모두 권한 없음이고 줄은 그대로다', async () => {
    await seed(A)
    const before = await snapshot()
    await becomeAnon()
    await expect(rows(`select * from ${TABLE}`)).rejects.toThrow(DENIED)
    await expect(insert({ ...GROUP, name: '새 묶음', codes: ['X1'] })).rejects.toThrow(DENIED)
    await expect(rows(`update ${TABLE} set sort_order = 9`)).rejects.toThrow(DENIED)
    await expect(rows(`delete from ${TABLE}`)).rejects.toThrow(DENIED)
    expect(await snapshot()).toEqual(before)
  })

  it('AC-1202.2: anon은 save_stats_rx_groups를 부르지 못하고(빈 목록도) 줄은 그대로다', async () => {
    await seed(A)
    const before = await snapshot()
    await becomeAnon()
    await expect(rows(SAVE, ['[]'])).rejects.toThrow(DENIED)
    await becomeAnon()
    await expect(rows(SAVE, [JSON.stringify(PROPOSALS)])).rejects.toThrow(DENIED)
    expect(await snapshot()).toEqual(before)
  })

  it('AC-1202.2: anon은 my_hospital_id()·stats_rx_group_codes_ok도 부르지 못한다', async () => {
    await becomeAnon()
    await expect(rows('select public.my_hospital_id()')).rejects.toThrow(DENIED)
    await becomeAnon()
    await expect(rows(`select public.stats_rx_group_codes_ok('{}')`)).rejects.toThrow(DENIED)
  })
})

describe('AC-1202.3 승인된 병원은 자기 줄만, 대기·거절 병원은 아무것도', SLOW, () => {
  it('AC-1202.3: A는 자기 묶음을 넣고 읽고 고치고 지우며, 넣은 줄의 hospital_id는 A다', async () => {
    await become(A)
    const [added] = await insert(GROUP, 'returning *')
    expect(added).toMatchObject({ hospital_id: hospital[A], ...GROUP })
    expect(await rows(`select name, codes, sort_order from ${TABLE}`)).toEqual([GROUP])
    expect(
      await rows(`update ${TABLE} set name = '도수', codes = $1, sort_order = 5 where id = $2 returning name, codes, sort_order`, [
        ['MM103'],
        added.id,
      ]),
    ).toEqual([{ name: '도수', codes: ['MM103'], sort_order: 5 }])
    expect(await rows(`delete from ${TABLE} where id = $1 returning id`, [added.id])).toEqual([{ id: added.id }])
    expect(await rows(`select * from ${TABLE}`)).toEqual([])
  })

  it('AC-1202.3: B의 줄은 A에게 보이지 않고 id로 골라도 안 바뀌고, A가 지워도 0줄이다', async () => {
    const theirs = await seed(B)
    const before = await snapshot()
    await become(A)
    expect(await rows(`select * from ${TABLE}`)).toEqual([])
    expect(await rows(`select * from ${TABLE} where id = $1`, [theirs.id])).toEqual([])
    expect(await rows(`update ${TABLE} set name = '바꿈' where id = $1 returning id`, [theirs.id])).toEqual([])
    expect(await rows(`delete from ${TABLE} returning id`)).toEqual([])
    expect(await snapshot()).toEqual(before)
  })

  it('AC-1202.3: A와 B가 둘 다 줄이 있으면 A는 자기 줄만 본다', async () => {
    await seed(A)
    await seed(B)
    await become(A)
    expect(await rows(`select hospital_id from ${TABLE}`)).toEqual([{ hospital_id: hospital[A] }])
  })

  it.each([
    ['승인 대기', PENDING],
    ['거절', REJECTED],
  ])('AC-1202.3: %s 병원은 자기 줄도 0줄로 읽고, 넣기·저장은 거부되고, 고치기·지우기·빈 목록 저장은 0줄이다', async (_label, user) => {
    await seed(user)
    const before = await snapshot()
    await become(user)
    expect(await rows(`select * from ${TABLE}`)).toEqual([])
    await expect(insert({ ...GROUP, name: '새 묶음', codes: ['X1'] })).rejects.toThrow(RLS)
    await become(user)
    expect(await rows(`update ${TABLE} set sort_order = 9 returning id`)).toEqual([])
    expect(await rows(`delete from ${TABLE} returning id`)).toEqual([])
    await expect(save(PROPOSALS)).rejects.toThrow(RLS)
    await become(user)
    expect(await save([])).toEqual([])
    expect(await snapshot()).toEqual(before)
  })
})

describe('AC-1202.4 칸 권한', SLOW, () => {
  async function columnsWith(privilege: string) {
    await rows(`select $1::regclass`, [TABLE]) // 표가 없으면 여기서 실패한다(빈 목록과 헷갈리지 않게)
    const list = await rows(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'stats_rx_groups'
         and has_column_privilege('authenticated', 'public.stats_rx_groups', column_name, $1)
       order by ordinal_position`,
      [privilege],
    )
    return list.map((row) => row.column_name)
  }

  it.each(['INSERT', 'UPDATE'])('AC-1202.4: authenticated의 %s 칸 권한은 name·codes·sort_order뿐이다', async (privilege) => {
    expect(await columnsWith(privilege)).toEqual(SENT)
  })

  it('AC-1202.4: 표 단위 권한은 authenticated의 읽기·지우기뿐이다(넣기·고치기는 칸 단위, 비우기 등 없음)', async () => {
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
  })

  it.each([
    ['내 병원', A],
    ['B 병원', B],
  ])('AC-1202.4: hospital_id를 직접 넣으면(%s) 권한 없음이다', async (_label, owner) => {
    await become(A)
    await expect(insert({ hospital_id: hospital[owner], ...GROUP })).rejects.toThrow(DENIED)
    expect(await snapshot()).toEqual([])
  })

  it.each([
    ['id', '00000000-0000-4000-8000-000000000123'],
    ['updated_at', '2001-01-01T00:00:00Z'],
  ])('AC-1202.4: %s를 직접 넣으면 권한 없음이다', async (column, value) => {
    await become(A)
    await expect(insert({ ...GROUP, [column]: value })).rejects.toThrow(DENIED)
    expect(await snapshot()).toEqual([])
  })

  it.each([
    ['hospital_id', B],
    ['id', null],
    ['updated_at', null],
  ])('AC-1202.4: %s를 고치면 권한 없음이고 줄은 그대로다', async (column, owner) => {
    await seed(A)
    const before = await snapshot()
    await become(A)
    const value = column === 'hospital_id' ? hospital[owner as string] : column === 'id' ? '00000000-0000-4000-8000-000000000123' : '2001-01-01T00:00:00Z'
    await expect(rows(`update ${TABLE} set ${column} = $1`, [value])).rejects.toThrow(DENIED)
    expect(await snapshot()).toEqual(before)
  })

  it('AC-1202.4: DB가 정한다: id는 새 uuid, hospital_id는 내 병원, updated_at은 넣을 때·고칠 때 DB 시각이다', async () => {
    await seed(A, { ...GROUP, updated_at: '2001-01-01T00:00:00Z' })
    await become(A)
    expect(
      await rows(`update ${TABLE} set sort_order = 1 returning sort_order, updated_at > now() - interval '1 hour' as fresh`),
    ).toEqual([{ sort_order: 1, fresh: true }])
    const [added] = await insert({ ...GROUP, name: '새 묶음', codes: ['X1'] }, `returning id, hospital_id, updated_at > now() - interval '1 hour' as fresh`)
    expect(added).toMatchObject({ hospital_id: hospital[A], fresh: true })
    expect(added.id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('AC-1202.4: 정책 넷은 authenticated 대상이고 모두 my_hospital_id()로 거른다', async () => {
    const list = await rows(
      `select cmd, permissive, roles::text as roles, qual, with_check from pg_policies
       where schemaname = 'public' and tablename = 'stats_rx_groups' order by cmd`,
    )
    expect(list.map((p) => p.cmd)).toEqual(['DELETE', 'INSERT', 'SELECT', 'UPDATE'])
    for (const policy of list) {
      expect(policy).toMatchObject({ permissive: 'PERMISSIVE', roles: '{authenticated}' })
      if (policy.cmd !== 'INSERT') expect(policy.qual).toContain('my_hospital_id()')
      if (policy.cmd === 'INSERT' || policy.cmd === 'UPDATE') expect(policy.with_check).toContain('my_hospital_id()')
    }
  })
})

describe('AC-1202.5 칸 제약', SLOW, () => {
  beforeEach(() => become(A))

  it.each([
    ['빈 이름', ''],
    ['31자', '가'.repeat(31)],
    ['앞 빈칸', ' 도수'],
    ['뒤 빈칸', '도수 '],
    ['줄바꿈', '도수\n치료'],
    ['탭', '도수\t치료'],
    ['제어 문자', '도수\u0001치료'],
    ['제어 문자 U+0085', 'a\u0085b'],
    ['숫자 여섯 자리', '123456'],
    ['주민번호 모양', '900101-1234567'],
    ['전화번호 모양', '01012345678'],
    ['글자 사이 숫자 여섯 자리', '묶음123456묶음'],
  ])('AC-1202.5: 이름이 %s이면 거부된다', async (_label, name) => {
    await expect(insert({ ...GROUP, name })).rejects.toThrow(CHECK)
    expect(await snapshot()).toEqual([])
  })

  it.each([
    ['30자', '가'.repeat(30)],
    ['숫자 다섯 자리', '12345'],
    ['가운데 빈칸', '도수 치료'],
    ['끊긴 숫자', '123 456'],
    ['괄호', 'C-arm 주사(20분)'],
  ])('AC-1202.5: 이름이 %s면 들어간다', async (_label, name) => {
    await insert({ ...GROUP, name })
    expect(await groupNames()).toEqual([name])
  })

  it.each([
    ['빈 코드', ['']],
    ['101자 코드', ['x'.repeat(101)]],
    ['101자 한글 코드', ['가'.repeat(101)]],
    ['줄바꿈이 든 코드', ['a\nb']],
    ['탭이 든 코드', ['a\tb']],
    ['제어 문자가 든 코드', ['a\u0001b']],
    ['DEL 문자가 든 코드', ['a\u007fb']],
    ['null 칸만', [null]],
    ['null 칸 섞임', ['MM101', null]],
    ['1,001개', Array.from({ length: 1001 }, (_, i) => `C${i}`)],
  ])('AC-1202.5: codes가 %s면 거부된다', async (_label, codes) => {
    await expect(insert({ ...GROUP, codes })).rejects.toThrow(CHECK)
    expect(await snapshot()).toEqual([])
  })

  it.each([
    ['100자 코드', ['x'.repeat(100)]],
    ['100자 한글 코드', ['가'.repeat(100)]],
    ['빈칸·괄호가 든 코드', ['도수(20분)', '도수 치료', 'A/B']],
    ['빈 목록', []],
    ['1,000개', Array.from({ length: 1000 }, (_, i) => `C${i}`)],
  ])('AC-1202.5: codes가 %s면 들어간다', async (_label, codes) => {
    await insert({ ...GROUP, codes })
    await operator()
    expect(await rows(`select codes from ${TABLE}`)).toEqual([{ codes }])
  })

  it('AC-1202.5: 이름·codes·sort_order는 null일 수 없고, codes를 빼면 빈 목록·sort_order를 빼면 0이다', async () => {
    await expect(insert({ ...GROUP, codes: null })).rejects.toThrow(NOT_NULL)
    await become(A)
    await expect(insert({ ...GROUP, name: null })).rejects.toThrow(NOT_NULL)
    await become(A)
    await expect(insert({ ...GROUP, sort_order: null })).rejects.toThrow(NOT_NULL)
    await become(A)
    await insert({ name: '기본값' })
    await operator()
    expect(await rows(`select codes, sort_order from ${TABLE}`)).toEqual([{ codes: [], sort_order: 0 }])
  })

  it('AC-1202.5: sort_order는 0~49다', async () => {
    await expect(insert({ ...GROUP, sort_order: -1 })).rejects.toThrow(CHECK)
    await become(A)
    await expect(insert({ ...GROUP, sort_order: 50 })).rejects.toThrow(CHECK)
    await become(A)
    await insert({ name: '처음', codes: ['C1'], sort_order: 0 })
    await insert({ name: '끝', codes: ['C2'], sort_order: 49 })
    expect(await groupNames()).toEqual(['끝', '처음'])
  })
})

describe('AC-1202.6 같은 이름', SLOW, () => {
  it('AC-1202.6: 이름 고유 제약은 (hospital_id, name)이고 트랜잭션 끝으로 미뤄져 있다', async () => {
    const list = await rows(
      `select condeferrable, condeferred, pg_get_constraintdef(oid) as def from pg_constraint
       where conrelid = $1::regclass and contype = 'u'`,
      [TABLE],
    )
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ condeferrable: true, condeferred: true })
    expect(list[0].def).toContain('(hospital_id, name)')
  })

  it('AC-1202.6: 같은 병원에 같은 이름을 또 넣으면 23505로 거부된다(한 문장으로 보내도)', async () => {
    await become(A)
    await insert(GROUP)
    await expect(insert({ ...GROUP, codes: ['X1'] })).rejects.toMatchObject(SAME_NAME)
    expect(await groupNames()).toEqual(['도수치료'])
  })

  it('AC-1202.6: 한 트랜잭션 안의 같은 이름은 COMMIT에서 거부되고 두 번째 줄은 남지 않는다', async () => {
    await become(A)
    await insert(GROUP)
    await db.exec('begin')
    await insert({ ...GROUP, codes: ['X1'] }) // 겹침 검사가 미뤄져 있어 여기서는 지나간다
    await expect(db.exec('commit')).rejects.toMatchObject(SAME_NAME)
    expect(await groupNames()).toEqual(['도수치료'])
  })

  it('AC-1202.6: 저장 한 번에 보낸 새 묶음 둘의 이름이 같으면 COMMIT에서 거부되고 표는 그대로다', async () => {
    await become(A)
    await expectSaveFailsAtCommit(
      [
        { name: '같은 이름', codes: ['X1'], sort_order: 0 },
        { name: '같은 이름', codes: ['X2'], sort_order: 1 },
      ],
      SAME_NAME,
    )
    expect(await groupNames()).toEqual([])
  })

  it.each([
    ['A 먼저', true],
    ['B 먼저', false],
  ])('AC-1202.6: 저장 한 번 안에서 두 묶음의 이름을 맞바꾸면 COMMIT까지 된다(%s)', async (_label, aFirst) => {
    const a = await seed(A, { name: 'A', codes: ['CA'], sort_order: 0 })
    const b = await seed(A, { name: 'B', codes: ['CB'], sort_order: 1 })
    await become(A)
    const toB = { id: a.id, name: 'B', codes: ['CA'], sort_order: 0 }
    const toA = { id: b.id, name: 'A', codes: ['CB'], sort_order: 1 }
    await save(aFirst ? [toB, toA] : [toA, toB])
    await operator()
    expect(await rows(`select id, name from ${TABLE} order by name`)).toEqual([
      { id: b.id, name: 'A' },
      { id: a.id, name: 'B' },
    ])
  })

  it('AC-1202.6: 다른 병원은 같은 이름을 쓸 수 있다', async () => {
    await seed(B)
    await become(A)
    await insert(GROUP)
    expect(await groupNames()).toEqual(['도수치료', '도수치료'])
  })
})

describe('AC-1202.7 처방 하나는 한 묶음에만', SLOW, () => {
  it('AC-1202.7: 코드 검사는 트랜잭션 끝으로 미룬 제약 트리거다', async () => {
    expect(
      await rows(
        `select tgname, tgdeferrable, tginitdeferred, tgconstraint <> 0 as constraint_trigger from pg_trigger
         where tgrelid = $1::regclass and not tgisinternal order by tgname`,
        [TABLE],
      ),
    ).toEqual([
      { tgname: 'stats_rx_groups_code_once', tgdeferrable: true, tginitdeferred: true, constraint_trigger: true },
      { tgname: 'stats_rx_groups_updated_at', tgdeferrable: false, tginitdeferred: false, constraint_trigger: false },
    ])
  })

  it('AC-1202.7: 한 코드를 두 묶음에 넣으면 한 문장씩 보내도 23505로 거부되고 둘째 줄은 남지 않는다', async () => {
    await become(A)
    await insert({ name: '첫째', codes: ['MM101'], sort_order: 0 })
    await expect(insert({ name: '둘째', codes: ['MM101'], sort_order: 1 })).rejects.toMatchObject(CODE_TWICE)
    expect(await groupNames()).toEqual(['첫째'])
  })

  it('AC-1202.7: 한 트랜잭션 안에서는 넣을 때 지나가고 COMMIT에서 23505로 거부된다', async () => {
    await become(A)
    await db.exec('begin')
    await insert({ name: '첫째', codes: ['MM101'], sort_order: 0 })
    await insert({ name: '둘째', codes: ['MM102', 'MM101'], sort_order: 1 }) // 끝에 검사하므로 여기서는 지나간다
    await expect(db.exec('commit')).rejects.toMatchObject(CODE_TWICE)
    expect(await groupNames()).toEqual([])
  })

  it.each([
    ['소문자 먼저', 'eswt1', 'ESWT1'],
    ['대문자 먼저', 'ESWT1', 'eswt1'],
    ['섞인 글자', 'Eswt1', 'eSWT1'],
  ])('AC-1202.7: 대소문자만 다른 코드도 두 묶음에 있으면 거부된다(%s)', async (_label, first, second) => {
    await become(A)
    await insert({ name: '첫째', codes: [first], sort_order: 0 })
    await expect(insert({ name: '둘째', codes: [second], sort_order: 1 })).rejects.toMatchObject(CODE_TWICE)
    expect(await groupNames()).toEqual(['첫째'])
  })

  it.each([
    ['같은 글자', ['MM101', 'MM101']],
    ['대소문자만 다름', ['eswt1', 'ESWT1']],
  ])('AC-1202.7: 한 묶음 안에 같은 코드가 두 번 있으면(%s) 거부된다', async (_label, codes) => {
    await become(A)
    await expect(insert({ ...GROUP, codes })).rejects.toMatchObject(CODE_TWICE)
    expect(await snapshot()).toEqual([])
  })

  it('AC-1202.7: 고쳐서 다른 묶음의 코드(대소문자만 다름)를 넣어도 거부되고 줄은 그대로다', async () => {
    await seed(A, { name: '첫째', codes: ['ESWT1'], sort_order: 0 })
    const second = await seed(A, { name: '둘째', codes: ['MM101'], sort_order: 1 })
    const before = await snapshot()
    await become(A)
    await expect(rows(`update ${TABLE} set codes = $1 where id = $2`, [['MM101', 'eswt1'], second.id])).rejects.toMatchObject(
      CODE_TWICE,
    )
    expect(await snapshot()).toEqual(before)
  })

  it('AC-1202.7: 저장 한 번에 한 코드를 두 묶음에 보내면 COMMIT에서 거부되고 표는 그대로다', async () => {
    const kept = await seed(A, { name: '둘 줄', codes: ['K1'], sort_order: 0 })
    await become(A)
    const before = await snapshot()
    await become(A)
    await expectSaveFailsAtCommit(
      [
        { id: kept.id, name: '둘 줄', codes: ['K1', 'MM101'], sort_order: 0 },
        { name: '새 묶음', codes: ['mm101'], sort_order: 1 },
      ],
      CODE_TWICE,
    )
    expect(await snapshot()).toEqual(before)
  })

  it.each([
    ['받는 묶음이 먼저', true],
    ['주는 묶음이 먼저', false],
  ])('AC-1202.7: 저장 한 번 안에서 코드를 한 묶음에서 다른 묶음으로 옮기면 된다(%s)', async (_label, receiverFirst) => {
    const giver = await seed(A, { name: '주는 묶음', codes: ['MM101', 'MM102'], sort_order: 0 })
    const receiver = await seed(A, { name: '받는 묶음', codes: ['ESWT1'], sort_order: 1 })
    await become(A)
    const give = { id: giver.id, name: '주는 묶음', codes: ['MM102'], sort_order: 0 }
    const take = { id: receiver.id, name: '받는 묶음', codes: ['ESWT1', 'MM101'], sort_order: 1 }
    const saved = await save(receiverFirst ? [take, give] : [give, take])
    expect(saved.map((g) => [g.name, g.codes])).toEqual([
      ['주는 묶음', ['MM102']],
      ['받는 묶음', ['ESWT1', 'MM101']],
    ])
  })

  it('AC-1202.7: 저장 한 번 안에서 묶음을 지우고 그 코드를 새 묶음에 넣으면 된다', async () => {
    await seed(A, { name: '지울 묶음', codes: ['MM101'], sort_order: 0 })
    await become(A)
    const saved = await save([{ name: '새 묶음', codes: ['mm101'], sort_order: 0 }])
    expect(saved.map((g) => [g.name, g.codes])).toEqual([['새 묶음', ['mm101']]])
  })

  it('AC-1202.7: 다른 병원은 같은 코드를 쓸 수 있다', async () => {
    await seed(B, { name: '남의 묶음', codes: ['ESWT1'], sort_order: 0 })
    await become(A)
    await insert({ name: '내 묶음', codes: ['eswt1'], sort_order: 0 })
    await become(A)
    expect(await save([...PROPOSALS])).toHaveLength(5) // 체외충격파에 ESWT1이 있다
    await operator()
    expect(await rows(`select count(*)::int as n from ${TABLE} where 'ESWT1' = any(codes)`)).toEqual([{ n: 2 }])
  })
})

describe('AC-1202.8 save_stats_rx_groups 입력 거부', SLOW, () => {
  it.each([
    ['null', 'null'],
    ['JSON null', `'null'::jsonb`],
    ['배열 아닌 객체 {}', `'{}'::jsonb`],
    ['글자', `'"x"'::jsonb`],
    ['숫자', `'1'::jsonb`],
  ])('AC-1202.8: groups가 %s이면 거부되고 표는 그대로다', async (_label, value) => {
    await seed(A)
    const before = await snapshot()
    await become(A)
    await expect(rows(`select * from public.save_stats_rx_groups(groups := ${value})`)).rejects.toThrow(BAD_GROUPS)
    expect(await snapshot()).toEqual(before)
  })

  const many = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `묶음${i}`, codes: [`C${i}`], sort_order: i }))

  it('AC-1202.8: 51개는 거부되고 50개는 된다', async () => {
    await become(A)
    await expect(save(many(51))).rejects.toThrow(BAD_GROUPS)
    expect(await groupNames()).toEqual([])
    await become(A)
    const saved = await save(many(50))
    expect(saved.map((g) => g.sort_order)).toEqual(Array.from({ length: 50 }, (_, i) => i))
    expect(await groupNames()).toHaveLength(50)
  })

  it.each([
    ['글자', { codes: 'MM101' }],
    ['객체', { codes: { a: 'MM101' } }],
    ['JSON null', { codes: null }],
    ['키가 없음', {}],
  ])('AC-1202.8: codes가 배열이 아니면(%s) 있던 묶음을 고칠 때도 새 묶음을 넣을 때도 거부되고 표는 그대로다', async (_label, codes) => {
    const kept = await seed(A, { name: '둘 줄', codes: ['K1', 'K2'], sort_order: 0 })
    const before = await snapshot()
    for (const bad of [
      [{ id: kept.id, name: '고친 이름', sort_order: 5, ...codes }],
      [
        { id: kept.id, name: '둘 줄', codes: ['K1', 'K2'], sort_order: 0 },
        { name: '새 묶음', sort_order: 1, ...codes },
      ],
    ]) {
      await become(A)
      await expect(save(bad)).rejects.toThrow(BAD_GROUPS)
      expect(await snapshot()).toEqual(before)
    }
  })

  it('AC-1202.8: 이름·차례가 빠지거나 id 모양이 틀리거나 코드가 규칙 밖이면 거부되고 표는 그대로다', async () => {
    for (const [bad, error] of [
      [{ codes: [], sort_order: 0 }, NOT_NULL],
      [{ name: '새 묶음', codes: [] }, NOT_NULL],
      [{ id: 'not-a-uuid', name: '새 묶음', codes: [], sort_order: 0 }, BAD_INPUT],
      [{ name: '새 묶음', codes: ['MM101', null], sort_order: 0 }, CHECK],
      [{ name: '새 묶음', codes: ['x'.repeat(101)], sort_order: 0 }, CHECK],
      [{ name: '새 묶음', codes: [], sort_order: 50 }, CHECK],
    ] as const) {
      await become(A)
      await expect(save([bad])).rejects.toThrow(error)
      expect(await groupNames()).toEqual([])
    }
  })

  it('AC-1202.8: B 병원의 id를 넣으면 거부되고 B 줄도 내 줄(앞서 고친 것)도 그대로다', async () => {
    const theirs = await seed(B, { name: '남의 줄', codes: ['THEIR'], sort_order: 0 })
    const mine = await seed(A, { name: '내 줄', codes: ['MINE'], sort_order: 0 })
    const before = await snapshot()
    await become(A)
    await expect(
      save([
        { id: mine.id, name: '고친 줄', codes: [], sort_order: 1 },
        { id: theirs.id, name: '빼앗은 줄', codes: [], sort_order: 2 },
      ]),
    ).rejects.toThrow(NOT_MINE)
    expect(await snapshot()).toEqual(before)
  })

  it('AC-1202.8: 없는 id도 거부되고 표는 그대로다', async () => {
    await become(A)
    await expect(save([{ id: '00000000-0000-4000-8000-000000000123', name: '새 묶음', codes: [], sort_order: 0 }])).rejects.toThrow(
      NOT_MINE,
    )
    expect(await groupNames()).toEqual([])
  })
})

describe('AC-1202.8 save_stats_rx_groups 저장', SLOW, () => {
  beforeEach(() => become(A))

  it('AC-1202.8: id 없는 다섯 묶음은 새로 넣고, 내 병원 줄을 sort_order 차례로 돌려준다', async () => {
    const saved = await save([...PROPOSALS].reverse())
    expect(saved.map((g) => [g.name, g.codes, g.sort_order])).toEqual(PROPOSALS.map((g) => [g.name, g.codes, g.sort_order]))
    expect(saved.every((g) => g.hospital_id === hospital[A])).toBe(true)
    expect(new Set(saved.map((g) => g.id)).size).toBe(5)
    expect(Object.keys(saved[0])).toEqual(COLUMNS)
  })

  // 화면 저장 코드는 새 묶음에도 id 칸을 늘 null로 보낸다
  it('AC-1202.8: id: null도 새 묶음이다', async () => {
    const saved = await save(PROPOSALS.map((g) => ({ id: null, ...g })))
    expect(saved).toHaveLength(5)
    expect(new Set(saved.map((g) => g.id)).size).toBe(5)
  })

  it('AC-1202.8: id 있는 내 묶음은 그 줄을 고친다(id 그대로, 이름·코드·차례 바뀜, updated_at은 DB 시각)', async () => {
    const mine = await seed(A, { ...GROUP, updated_at: '2001-01-01T00:00:00Z' })
    await become(A)
    const [saved] = await save([{ id: mine.id, name: '도수', codes: ['도수(20분)', 'mm103'], sort_order: 7 }])
    expect(saved).toMatchObject({ id: mine.id, hospital_id: hospital[A], name: '도수', codes: ['도수(20분)', 'mm103'], sort_order: 7 })
    await operator()
    expect(await rows(`select updated_at > now() - interval '1 hour' as fresh from ${TABLE}`)).toEqual([{ fresh: true }])
  })

  it('AC-1202.8: 있는 묶음과 새 묶음을 함께 보내면 있던 줄은 id 그대로 남고 새 줄이 더해진다', async () => {
    const kept = await seed(A, { name: '둘 줄', codes: ['K1'], sort_order: 0 })
    await become(A)
    const saved = await save([
      { id: kept.id, name: '둘 줄', codes: ['K1'], sort_order: 0 },
      { id: null, name: '새 묶음', codes: ['N1'], sort_order: 1 },
    ])
    expect(saved.map((g) => [g.name, g.codes])).toEqual([
      ['둘 줄', ['K1']],
      ['새 묶음', ['N1']],
    ])
    expect(saved[0].id).toBe(kept.id)
    expect(saved[1].id).not.toBe(kept.id)
  })

  it('AC-1202.8: 받은 목록에 없는 내 묶음은 지우고, 빈 배열이면 내 묶음을 모두 지우며, B 묶음은 그대로다', async () => {
    const kept = await seed(A, { name: '둘 줄', codes: ['K1'], sort_order: 0 })
    await seed(A, { name: '뺄 줄', codes: ['K2'], sort_order: 1 })
    await seed(B, { name: '남의 줄', codes: ['K2'], sort_order: 0 })
    await become(A)
    const saved = await save([{ id: kept.id, name: '둘 줄', codes: ['K1'], sort_order: 0 }])
    expect(saved.map((g) => g.name)).toEqual(['둘 줄']) // B 줄은 돌려주지 않는다
    expect(await groupNames()).toEqual(['남의 줄', '둘 줄'])
    await become(A)
    expect(await save([])).toEqual([])
    expect(await groupNames()).toEqual(['남의 줄'])
  })

  it('AC-1202.8: groups에 hospital_id·updated_at을 넣어도 무시되고 내 병원이다', async () => {
    const [saved] = await save([
      { hospital_id: hospital[B], updated_at: '2001-01-01T00:00:00Z', name: '새 묶음', codes: [], sort_order: 0 },
    ])
    expect(saved.hospital_id).toBe(hospital[A])
    await operator()
    expect(await rows(`select updated_at > now() - interval '1 hour' as fresh from ${TABLE}`)).toEqual([{ fresh: true }])
  })

  it('AC-1202.8: 고리 도중에 실패하면 앞서 고친 줄과 뺄 줄이 모두 그대로다', async () => {
    const kept = await seed(A, { name: '둘 줄', codes: ['K1'], sort_order: 0 })
    await seed(A, { name: '뺄 줄', codes: ['K2'], sort_order: 1 })
    const before = await snapshot()
    await become(A)
    await expect(
      save([
        { id: kept.id, name: '고친 이름', codes: ['K9'], sort_order: 5 },
        { name: '가'.repeat(31), codes: [], sort_order: 6 },
      ]),
    ).rejects.toThrow(CHECK)
    expect(await snapshot()).toEqual(before)
  })

  it('AC-1202.8: 한 문장으로 보내도(자동 COMMIT) 실패하면 앞의 줄이 남지 않는다', async () => {
    const bad = PROPOSALS.map((g, i) => (i === 4 ? { ...g, name: '가'.repeat(31) } : g))
    await expect(rows(SAVE, [JSON.stringify(bad)])).rejects.toThrow(CHECK)
    expect(await groupNames()).toEqual([])
  })

  it('AC-1202.8: 지움까지 돈 뒤 COMMIT에서 실패해도(코드 겹침) 뺀 줄이 돌아오고 표는 그대로다', async () => {
    const kept = await seed(A, { name: '둘 줄', codes: ['K1'], sort_order: 0 })
    const dropped = await seed(A, { name: '뺄 줄', codes: ['K2'], sort_order: 1 })
    const before = await snapshot()
    await become(A)
    const returned = await expectSaveFailsAtCommit(
      [
        { id: kept.id, name: '둘 줄', codes: ['K1'], sort_order: 0 },
        { name: '새 묶음', codes: ['k1'], sort_order: 1 },
      ],
      CODE_TWICE,
    )
    expect(returned.map((g) => g.id)).not.toContain(dropped.id) // COMMIT 전에 지움이 정말 돌았다
    expect(await snapshot()).toEqual(before)
  })

  it('AC-1202.8: 첫 저장이 실패한 뒤 고친 목록을 다시 보내면 다섯 줄이다(앞선 실패의 조각이 남지 않는다)', async () => {
    const bad = PROPOSALS.map((g, i) => (i === 4 ? { ...g, name: '가'.repeat(31) } : g))
    await expect(save(bad)).rejects.toThrow(CHECK)
    await become(A)
    expect(await save(PROPOSALS)).toHaveLength(5)
    expect(await groupNames()).toHaveLength(5)
  })
})

describe('AC-1202.9 매출 묶음(rx_groups)과 따로', SLOW, () => {
  const REVENUE_GROUP = { name: '도수치료', codes: ['MT001'], sort_order: 0 }

  it('AC-1202.9: save_rx_groups로 매출 묶음을 저장·모두 지워도 통계 묶음은 그대로다', async () => {
    await onFull(async () => {
      await seed(A, { name: '도수치료', codes: ['MT001'], sort_order: 0 })
      await operator()
      await rows(`insert into public.rx_groups (hospital_id, name, codes, sort_order) values ($1, '도수치료', '{MT001}', 0)`, [hospital[A]])
      const before = await snapshot()
      expect(before).toHaveLength(1)

      await become(A)
      expect(await save([], 'select * from public.save_rx_groups(groups := $1::jsonb)')).toEqual([])
      expect(await snapshot()).toEqual(before)
      await become(A)
      expect(await save([REVENUE_GROUP, { name: '새 매출 묶음', codes: ['MT002'], sort_order: 1 }], 'select * from public.save_rx_groups(groups := $1::jsonb)')).toHaveLength(2)
      expect(await snapshot()).toEqual(before)
    })
  })

  it('AC-1202.9: save_stats_rx_groups로 통계 묶음을 저장·모두 지워도 매출 묶음은 그대로다', async () => {
    await onFull(async () => {
      await seed(A, { name: '뺄 통계 묶음', codes: ['K1'], sort_order: 0 })
      await operator()
      await rows(`insert into public.rx_groups (hospital_id, name, codes, sort_order) values ($1, '도수치료', '{MT001}', 0)`, [hospital[A]])
      const before = await snapshot('public.rx_groups')
      expect(before).toHaveLength(1)

      await become(A)
      expect(await save([{ name: '도수치료', codes: ['MT001'], sort_order: 0 }])).toHaveLength(1) // 같은 이름·코드도 된다
      expect(await snapshot('public.rx_groups')).toEqual(before)
      await become(A)
      expect(await save([])).toEqual([])
      expect(await snapshot('public.rx_groups')).toEqual(before)
    })
  })
})

describe('AC-1202.10 흉내의 기본 권한과 migration이 거둔 것', SLOW, () => {
  it('AC-1202.10: 시험의 Supabase 흉내는 새 표·함수에 anon·authenticated 모든 권한을 진짜로 준다', async () => {
    await db.exec(`create table public.mock_probe (x int); create function public.mock_probe_fn() returns int language sql as 'select 1'`)
    try {
      for (const role of ['anon', 'authenticated']) {
        for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) {
          expect(await rows(`select has_table_privilege($1, 'public.mock_probe', $2) as ok`, [role, privilege])).toEqual([{ ok: true }])
        }
        expect(await rows(`select has_function_privilege($1, 'public.mock_probe_fn()', 'EXECUTE') as ok`, [role])).toEqual([
          { ok: true },
        ])
      }
    } finally {
      await db.exec('drop function public.mock_probe_fn(); drop table public.mock_probe')
    }
  })

  it('AC-1202.10: 표 권한: anon은 없고 authenticated는 읽기·지우기(표)와 name·codes·sort_order 넣기·고치기(칸)뿐이다', async () => {
    expect(
      await rows(
        `select grantee, privilege_type from information_schema.role_table_grants
         where table_schema = 'public' and table_name = 'stats_rx_groups' and grantee in ('anon', 'authenticated', 'PUBLIC')
         order by grantee, privilege_type`,
      ),
    ).toEqual([
      { grantee: 'authenticated', privilege_type: 'DELETE' },
      { grantee: 'authenticated', privilege_type: 'SELECT' },
    ])
    expect(
      await rows(
        `select grantee, privilege_type, column_name from information_schema.column_privileges
         where table_schema = 'public' and table_name = 'stats_rx_groups' and grantee in ('anon', 'authenticated', 'PUBLIC')
           and privilege_type in ('INSERT', 'UPDATE', 'REFERENCES')
         order by grantee, privilege_type, column_name`,
      ),
    ).toEqual(
      ['INSERT', 'UPDATE'].flatMap((privilege) =>
        [...SENT].sort().map((column) => ({ grantee: 'authenticated', privilege_type: privilege, column_name: column })),
      ),
    )
  })

  it.each([
    ['public.save_stats_rx_groups(jsonb)', false, false, true],
    ['public.stats_rx_group_codes_ok(text[])', false, false, true],
    ['public.stats_rx_groups_touch()', false, false, false],
    ['public.stats_rx_groups_code_once()', false, false, false],
    ['public.my_hospital_id()', false, false, true],
  ])('AC-1202.10: %s 실행 권한 public=%s anon=%s authenticated=%s', async (fn, everyone, anon, authenticated) => {
    const can = async (role: string) => (await rows(`select has_function_privilege($1, $2, 'EXECUTE') as ok`, [role, fn]))[0].ok
    expect([await can('public'), await can('anon'), await can('authenticated')]).toEqual([everyone, anon, authenticated])
  })

  it('AC-1202.10: 새 함수 넷은 모두 부른 사람 권한이고 search_path가 비어 있다(정의자 권한은 my_hospital_id뿐)', async () => {
    const list = await rows(
      `select p.oid::regprocedure::text as fn, prosecdef, proconfig::text as config from pg_proc p
       where pronamespace = 'public'::regnamespace and proname = any($1::text[]) order by 1`,
      [['my_hospital_id', 'save_stats_rx_groups', 'stats_rx_group_codes_ok', 'stats_rx_groups_code_once', 'stats_rx_groups_touch']],
    )
    expect(list.map((f) => [f.fn, f.prosecdef])).toEqual([
      ['my_hospital_id()', true],
      ['save_stats_rx_groups(jsonb)', false],
      ['stats_rx_group_codes_ok(text[])', false],
      ['stats_rx_groups_code_once()', false],
      ['stats_rx_groups_touch()', false],
    ])
    for (const fn of list) expect(fn.config).toBe('{"search_path=\\"\\""}')
  })

  it('AC-1202.10: 실행 권한이 없어도 트리거 둘과 CHECK 함수는 authenticated의 넣기·고치기에서 돈다', async () => {
    await become(A)
    expect(await rows(`select public.stats_rx_group_codes_ok('{MM101}') as ok`)).toEqual([{ ok: true }])
    const [added] = await insert(GROUP, 'returning id')
    expect(
      await rows(`update ${TABLE} set codes = $1 where id = $2 returning codes, updated_at > now() - interval '1 hour' as fresh`, [
        ['MM103'],
        added.id,
      ]),
    ).toEqual([{ codes: ['MM103'], fresh: true }])
    await expect(insert({ name: '둘째', codes: ['mm103'], sort_order: 1 })).rejects.toMatchObject(CODE_TWICE)
  })
})

describe('AC-1214 계획 문서 줄', () => {
  const linesOf = (rel: string) => read(rel).split('\n')
  // 찾는 줄이 꼭 한 번 있어야 하고, 그 바로 다음 줄을 돌려준다
  function lineAfter(lines: string[], line: string) {
    expect(lines.filter((candidate) => candidate === line)).toHaveLength(1)
    return lines[lines.indexOf(line) + 1]
  }

  const GROUP_LINE =
    '- **치료별 추세의 묶음**은 통계 탭에서 따로 만든다(표 `stats_rx_groups`). 매출 탭 묶음(`rx_groups`)을 고쳐도 그대로이고 거꾸로도 같다. 같은 날 같은 환자는 묶음 안 처방을 여러 개 받아도 1건이다 **(사용자, 2026-11-05)**. 처방 하나는 한 묶음에만 든다 **(Claude 판단, 2026-11-05 시안 승인)**'

  it('AC-1214.1: plan.md §2-2의 처방코드 그룹 줄 바로 아래에 치료별 추세 묶음 줄이 한 번 있고 백슬래시가 없다', () => {
    const lines = linesOf('../plan.md')
    const group = '- **처방코드 그룹 + 즐겨찾기** **(사용자)**: 즐겨찾기는 별표한 그룹이다. 코드 하나짜리 그룹도 만들 수 있다 → 표 하나로 끝난다 **(Claude 판단)**'
    expect(lineAfter(lines, group)).toBe(GROUP_LINE)
    expect(lines.filter((line) => line.includes('**치료별 추세의 묶음**'))).toHaveLength(1)
    expect(GROUP_LINE).not.toContain('\\')
    // §2-2 안이다
    const at = lines.indexOf(GROUP_LINE)
    expect(lines.slice(0, at).filter((line) => line.startsWith('#')).pop()).toBe('### 2-2. 환자 통계 (파일럿 코드 이식)')
  })

  it('AC-1214.2: plan.md §7 코드 그룹 줄 끝에 통계 묶음의 예외가 붙고 앞 글은 그대로다', () => {
    const lines = linesOf('../plan.md')
    const old = '- 코드 그룹은 코드 기준이다(처방명이 바뀌어도 그대로). 한 코드가 여러 그룹에 들어가도 된다'
    const tail = '다만 통계 치료별 추세 묶음(`stats_rx_groups`)은 처방 하나가 한 묶음에만 든다(2-2)'
    const found = lines.filter((line) => line.startsWith(old))
    expect(found).toEqual([`${old}. ${tail}`])
  })

  it('AC-1214.3: plan.md DB 표에서 stats_rx_picks 줄 아래에 stats_rx_groups 줄이 한 번 있고 다른 줄은 그대로다', () => {
    const lines = linesOf('../plan.md')
    const start = lines.indexOf('### DB 표 (Claude 판단)') + 1
    const end = lines.findIndex((line, i) => i > start && !line.startsWith('|'))
    const table = lines.slice(start, end)
    const row =
      '| `stats_rx_groups` | 통계 치료별 추세의 묶음(이름·코드 목록·차례). 매출 탭 묶음(`rx_groups`)과 따로 둔다. specs/treatment-trend **(사용자, 2026-11-05)** |'
    const picks =
      '| `stats_rx_picks` | 처방 골라 보기에서 고른 처방(코드·이름·차례). 낱개 처방이라 묶음 표(`rx_groups`)와 따로 둔다. specs/rx-picker **(Claude 판단, 2026-11-03)** |'
    expect(table.filter((line) => line === row)).toHaveLength(1)
    expect(table.indexOf(row)).toBeGreaterThan(table.indexOf(picks))
    expect(row).not.toContain('\\')
    // 다른 줄은 그대로: 묶음 표 근처 줄의 글자·차례가 그대로다(rx-picker AC-815.3의 rx_groups → stats_rx_picks → sales_days). 표 전체 줄 수는 못 박지 않는다(다른 기능이 줄을 더할 수 있다)
    expect(table.filter((line) => line !== row).slice(5, 8)).toEqual([
      '| `rx_groups` | 그룹 이름·코드 목록·즐겨찾기 |',
      picks,
      '| `sales_days` | 일 매출 집계. 칸은 specs/revenue design.md 6절 |',
    ])
  })

  it('AC-1214.4: docs/ARCHITECTURE.md rx_groups 줄 끝이 바뀌고, stats_rx_picks 줄 아래에 stats_rx_groups 줄이 있다', () => {
    const lines = linesOf('../docs/ARCHITECTURE.md')
    expect(lines.filter((line) => line.startsWith('| `rx_groups` |'))).toEqual([
      '| `rx_groups` | 치료 묶음. 칸: 이름·코드 목록·순서. 즐겨찾기는 아직 없음. 매출 탭 묶음. 통계 치료별 추세는 따로 `stats_rx_groups`를 쓴다 (specs/revenue) |',
    ])
    expect(lines.some((line) => line.includes('매출 탭이 만들고 통계가 나중에 함께 씀'))).toBe(false)

    const picks = lines.filter((line) => line.startsWith('| `stats_rx_picks` |'))
    expect(picks).toHaveLength(1)
    const row = lineAfter(lines, picks[0])
    expect(lines.filter((line) => line.startsWith('| `stats_rx_groups` |'))).toEqual([row])
    for (const part of [
      '| `stats_rx_groups` |',
      '`id`·`hospital_id`·`name`·`codes`·`sort_order`·`updated_at`',
      '`save_stats_rx_groups`로 목록 통째',
      '처방 하나는 한 묶음에만',
      '(specs/treatment-trend) |',
    ]) {
      expect(row).toContain(part)
    }
  })

  it('AC-1214.4: docs/ARCHITECTURE.md storage/ 줄과 백업 줄에 stats_rx_groups가 더해지고 앞 글은 그대로다', () => {
    const lines = linesOf('../docs/ARCHITECTURE.md')
    const storage = lines.filter((line) => line.includes('├── storage/'))
    expect(storage).toHaveLength(1)
    expect(storage[0]).toContain('rxGroups.ts = rx_groups (specs/revenue). stats.ts = stats_months·stats_days·stats_coverage (specs/stats)')
    expect(storage[0]).toContain('statsRxGroups.ts = stats_rx_groups (specs/treatment-trend)')

    const backup = lines.filter((line) => line.startsWith('- 백업 목록(`lib/backup/tables.ts`)'))
    expect(backup).toHaveLength(1)
    // 매출(AC-010.4)·처방 골라 보기(REQ-810) 시험이 읽는 글자는 그대로 둔다
    expect(backup[0]).toContain(
      '백업 목록(`lib/backup/tables.ts`)에 `sales_days`·`sales_codes`·`rx_groups`를 넣는다(`rx_groups`는 총괄이 손으로 만든 유일한 자료)',
    )
    expect(backup[0]).toContain('`stats_rx_picks`: `lib/backup/tables.ts`가 생기면 이 표도 넣는다')
    expect(backup[0]).toContain('`stats_rx_groups`(손으로 만든 자료')
  })
})

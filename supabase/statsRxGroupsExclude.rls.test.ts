import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

// 처방별 추세 묶음의 '제외할 처방' 칸(exclude_codes)·바꾼 저장 함수(save_stats_rx_groups)와 계획 문서 줄 (rx-group-exclude REQ-2701·AC-2709.3, TASK-1).
// statsRxGroups.rls.test.ts와 같은 방법: 진짜 Postgres(PGlite, WASM)에서 운영자가 SQL 편집기에 붙일 파일을 그대로 돌린다.
// 운영과 같은 차례: 인증 → 통계 → stats_rx_groups → 이 파일. 그 시험 파일은 이 칸 없이 도는 AC를 보므로 그대로 둔다.
// 실제 Supabase에는 붙지 않는다. Supabase가 미리 갖춘 것(역할·auth 스키마·새 표·함수·순서표의 기본 권한)만 흉내 낸다
const fileOf = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))
const read = (rel: string) => readFileSync(fileOf(rel), 'utf-8')
const AUTH_MIGRATION = read('./migrations/20261028000000_auth.sql')
const STATS_MIGRATION = read('./migrations/20261101000200_stats.sql')
const GROUPS_MIGRATION = read('./migrations/20261105000100_stats_rx_groups.sql')
const EXCLUDE_PATH = fileOf('./migrations/20261112000100_stats_rx_groups_exclude.sql')
// 파일이 아직 없으면 빈 글자로 돌아, 시험마다 '칸·함수가 없다'로 실패한다(무엇이 빠졌는지 시험별로 보인다)
const EXCLUDE_MIGRATION = existsSync(EXCLUDE_PATH) ? readFileSync(EXCLUDE_PATH, 'utf-8') : ''
// 주석을 뺀 SQL 글자(머리 주석이 다른 파일·함수 이름을 설명으로 말한다)
const EXCLUDE_SQL = EXCLUDE_MIGRATION.split('\n')
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

const A = '00000000-0000-4000-8000-00000000000a' // 승인된 병원 A
const B = '00000000-0000-4000-8000-00000000000b' // 승인된 다른 병원 B
const PENDING = '00000000-0000-4000-8000-00000000000c' // 승인 대기
const STATUS: Record<string, string> = { [A]: 'approved', [B]: 'approved', [PENDING]: 'pending' }

type Row = Record<string, unknown>

const TABLE = 'public.stats_rx_groups'
const EXCLUDE = 'exclude_codes'
const OLD_COLUMNS = ['id', 'hospital_id', 'name', 'codes', 'sort_order', 'updated_at']
const COLUMNS = [...OLD_COLUMNS, EXCLUDE]
const SENT = ['name', 'codes', 'sort_order', EXCLUDE] // 사용자가 보낼 수 있는 칸(그 밖은 칸 권한이 없다)
const SAVE_FN = 'save_stats_rx_groups(jsonb)'
const EXCLUDE_FN = 'stats_rx_group_exclude_ok(text[],text[])'
// 지어낸 묶음: 표층열을 받았어도 같은 날 체외충격파를 받은 환자는 빼고 센다. 코드는 통계 일 숫자의 코드 모양(100자까지, 빈칸·괄호 가능)
const GROUP: Row = { name: '표층열만', codes: ['MM010'], exclude_codes: ['ESWT7'], sort_order: 0 }
const SAVE = 'select * from public.save_stats_rx_groups(groups := $1::jsonb)'

const SLOW = { timeout: 60_000 }
const DENIED = /permission denied/
const CHECK = /check constraint/
const APART = /check constraint "stats_rx_groups_exclude_apart"/ // 같은 줄 넣은 처방과 겹침·제외 안 두 번
const RLS = /row-level security/
const NOT_NULL = /null value in column "exclude_codes"/
const BAD_GROUPS = /bad groups/
const NOT_MINE = /not my group/
// 둘 다 23505다. 이름 겹침은 고유 제약, 코드 겹침은 끝에 도는 제약 트리거
const SAME_NAME = { code: '23505', message: expect.stringMatching(/duplicate key value violates unique constraint/) }
const CODE_TWICE = { code: '23505', message: 'code in two groups' }

let db: PGlite // 인증 → 통계 → stats_rx_groups → 이 파일
let hospital: Record<string, string> = {}
type Schema = Awaited<ReturnType<typeof schemaOf>>
let before: Schema // 이 파일을 붙여 넣기 전(새 칸·새 칸의 제약·칸 권한은 빼고 본다)
let after: Schema // 붙여 넣은 뒤
let saveBefore: Row[] // 저장 함수의 이름·인자·돌려주는 모양·권한(붙여 넣기 전)
let saveAfter: Row[]
// 붙여 넣기 전에 있던 줄이 붙여 넣기 전·뒤에 어떻게 보이는지(운영자 눈, 모든 칸)
let existingBefore: Row[] = []
let existingAfter: Row[] = []

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
async function snapshot() {
  await operator()
  return rows(`select * from ${TABLE} order by hospital_id, sort_order, name`)
}

async function groupNames() {
  await operator()
  return (await rows(`select name from ${TABLE} order by name`)).map((row) => row.name)
}

// PostgREST처럼 BEGIN → 함수 호출 → COMMIT. 이름·코드 겹침 검사는 COMMIT에서 돈다
async function save(groups: unknown) {
  await db.exec('begin')
  try {
    const saved = await rows(SAVE, [JSON.stringify(groups)])
    await db.exec('commit')
    return saved
  } catch (error) {
    await db.exec('rollback')
    throw error
  }
}

// 함수 호출은 지나가고(겹침 검사가 미뤄져 있다) COMMIT에서 실패해야 한다
async function expectSaveFailsAtCommit(groups: unknown, error: Row) {
  await db.exec('begin')
  await rows(SAVE, [JSON.stringify(groups)])
  await expect(db.exec('commit')).rejects.toMatchObject(error)
}

// 새 칸(exclude_codes)·그 칸을 담은 제약·그 칸 권한·새 함수를 빼고 본 public 전체 모양. 붙여 넣기 전·뒤가 같아야 한다
async function schemaOf() {
  await operator()
  const q = async (sql: string) => (await db.query<Row>(sql)).rows
  return {
    tables: await q(
      `select relname, relrowsecurity, relforcerowsecurity, coalesce(relacl::text, '') as acl from pg_class
       where relnamespace = 'public'::regnamespace and relkind = 'r' order by 1`,
    ),
    columns: await q(
      `select table_name, column_name, ordinal_position, data_type, udt_name, column_default, is_nullable
       from information_schema.columns
       where table_schema = 'public' and not (table_name = 'stats_rx_groups' and column_name = 'exclude_codes')
       order by table_name, ordinal_position`,
    ),
    constraints: await q(
      `select conrelid::regclass::text as tbl, conname, contype, pg_get_constraintdef(oid) as def, condeferrable, condeferred
       from pg_constraint
       where connamespace = 'public'::regnamespace and pg_get_constraintdef(oid) not like '%exclude_codes%'
       order by 1, 2`,
    ),
    indexes: await q(`select tablename, indexname, indexdef from pg_indexes where schemaname = 'public' order by 1, 2`),
    triggers: await q(
      `select t.tgrelid::regclass::text as tbl, t.tgname, pg_get_triggerdef(t.oid) as def, t.tgdeferrable, t.tginitdeferred
       from pg_trigger t join pg_class c on c.oid = t.tgrelid
       where c.relnamespace = 'public'::regnamespace and not t.tgisinternal order by 1, 2`,
    ),
    policies: await q(
      `select tablename, policyname, cmd, permissive, roles::text as roles, qual, with_check from pg_policies
       where schemaname = 'public' order by 1, 2`,
    ),
    tableGrants: await q(
      `select table_name, grantee, privilege_type from information_schema.role_table_grants
       where table_schema = 'public' order by 1, 2, 3`,
    ),
    columnGrants: await q(
      `select table_name, column_name, grantee, privilege_type from information_schema.column_privileges
       where table_schema = 'public' and not (table_name = 'stats_rx_groups' and column_name = 'exclude_codes')
       order by 1, 2, 3, 4`,
    ),
    functions: await q(
      `select p.oid::regprocedure::text as fn, pg_get_functiondef(p.oid) as def, coalesce(p.proacl::text, '') as acl
       from pg_proc p where p.pronamespace = 'public'::regnamespace order by 1`,
    ),
  }
}

// 함수의 이름·인자·돌려주는 모양·권한(본문은 빼고)
async function functionShape(signature: string) {
  await operator()
  return rows(
    `select pg_get_function_identity_arguments(p.oid) as args, pg_get_function_result(p.oid) as result, p.prosecdef,
            p.provolatile, p.proconfig::text as config, l.lanname as lang, coalesce(p.proacl::text, '') as acl
     from pg_proc p join pg_language l on l.oid = p.prolang where p.oid = to_regprocedure($1::text)`,
    [signature],
  )
}

beforeAll(async () => {
  db = await PGlite.create()
  await db.exec(SUPABASE_MOCK)
  await db.exec(AUTH_MIGRATION)
  await db.exec(STATS_MIGRATION)
  await db.exec(GROUPS_MIGRATION)
  // 붙여 넣기 전에 운영에 이미 있던 묶음 줄
  await resetData()
  await seed(A, { name: '도수치료', codes: ['MM101', 'MM102'], sort_order: 0 })
  await seed(A, { name: '빈 묶음', codes: [], sort_order: 1 })
  await seed(B, { name: '체외충격파', codes: ['ESWT7'], sort_order: 0 })
  existingBefore = await snapshot()
  before = await schemaOf()
  saveBefore = await functionShape(`public.${SAVE_FN}`)
  await operator()
  await db.exec(EXCLUDE_MIGRATION)
  after = await schemaOf()
  saveAfter = await functionShape(`public.${SAVE_FN}`)
  existingAfter = await snapshot()
}, 120_000)

afterAll(async () => {
  await db.close()
})

// 시험마다 빈 표에서 시작한다. 운영자(superuser)는 RLS를 건너뛴다
beforeEach(resetData)

describe('AC-2701.1 exclude_codes 칸 하나가 더해지고 나머지는 그대로다', SLOW, () => {
  it('AC-2701.1: exclude_codes(text[], null 아님, 기본 빈 배열)가 updated_at 뒤 맨 끝에 하나 더해진다', async () => {
    const columns = await rows(
      `select column_name, udt_name, is_nullable, column_default from information_schema.columns
       where table_schema = 'public' and table_name = 'stats_rx_groups' order by ordinal_position`,
    )
    expect(columns.map((row) => row.column_name)).toEqual(COLUMNS)
    expect(columns.at(-1)).toEqual({ column_name: EXCLUDE, udt_name: '_text', is_nullable: 'NO', column_default: "'{}'::text[]" })
  })

  it('AC-2701.1: 붙여 넣기 전에 있던 줄은 exclude_codes가 빈 배열이고 다른 칸(updated_at 포함)은 그대로다', () => {
    expect(existingBefore).toHaveLength(3)
    expect(existingBefore[0]).not.toHaveProperty(EXCLUDE)
    expect(existingAfter).toEqual(existingBefore.map((row) => ({ ...row, exclude_codes: [] })))
  })

  it('AC-2701.1: exclude_codes를 빼고 넣으면(예전 화면처럼 name·codes·sort_order만) 빈 배열이다', async () => {
    await become(A)
    expect(await insert({ name: '도수치료', codes: ['MM101'], sort_order: 0 }, `returning ${EXCLUDE}`)).toEqual([{ exclude_codes: [] }])
  })

  it('AC-2701.1: 다른 칸·제약·색인·트리거·RLS·정책·표 권한·다른 칸 권한과 다른 표는 붙여 넣기 전과 같다', () => {
    for (const part of ['tables', 'columns', 'constraints', 'indexes', 'triggers', 'policies', 'tableGrants', 'columnGrants'] as const) {
      expect([part, after[part]]).toEqual([part, before[part]])
    }
    // 빈 비교가 아니다: 묶음 표의 칸·이름 고유 제약·코드 검사 트리거·정책 넷·통계 표가 정말 있다
    expect(before.columns.filter((c) => c.table_name === 'stats_rx_groups').map((c) => c.column_name)).toEqual(OLD_COLUMNS)
    expect(before.constraints.some((c) => c.tbl === 'stats_rx_groups' && c.contype === 'u' && c.condeferred)).toBe(true)
    expect(before.triggers.filter((t) => t.tbl === 'stats_rx_groups').map((t) => t.tgname)).toEqual([
      'stats_rx_groups_code_once',
      'stats_rx_groups_updated_at',
    ])
    expect(before.policies.filter((p) => p.tablename === 'stats_rx_groups')).toHaveLength(4)
    expect(before.tables.map((t) => t.relname)).toEqual(expect.arrayContaining(['stats_rx_groups', 'stats_days', 'hospitals']))
  })

  it('AC-2701.1: 새 함수는 stats_rx_group_exclude_ok 하나뿐이고, 저장 함수 밖의 함수는 정의·권한이 한 글자 그대로다', () => {
    const added = after.functions.filter((fn) => !before.functions.some((old) => old.fn === fn.fn))
    expect(added.map((fn) => fn.fn)).toEqual([EXCLUDE_FN])
    expect(after.functions.filter((fn) => fn.fn !== EXCLUDE_FN && fn.fn !== SAVE_FN)).toEqual(
      before.functions.filter((fn) => fn.fn !== SAVE_FN),
    )
    expect(before.functions.map((fn) => fn.fn)).toEqual(
      expect.arrayContaining(['my_hospital_id()', 'stats_rx_group_codes_ok(text[])', 'stats_rx_groups_code_once()', SAVE_FN]),
    )
  })

  it('AC-2701.1: 더한 CHECK는 exclude_codes 코드 규칙(stats_rx_group_codes_ok)과 넣은 처방과 떨어짐(stats_rx_group_exclude_ok) 둘이다', async () => {
    const checks = await rows(
      `select conname, pg_get_constraintdef(oid) as def from pg_constraint
       where conrelid = $1::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%exclude_codes%' order by conname`,
      [TABLE],
    )
    expect(checks.map((c) => c.conname)).toEqual(['stats_rx_groups_exclude_apart', 'stats_rx_groups_exclude_codes_check'])
    expect(checks[0].def).toContain('stats_rx_group_exclude_ok(codes, exclude_codes)')
    expect(checks[1].def).toContain('stats_rx_group_codes_ok(exclude_codes)')
  })

  it('AC-2701.1: 이름 고유는 그대로다(같은 병원 같은 이름은 23505)', async () => {
    await become(A)
    await insert(GROUP)
    await expect(insert({ ...GROUP, codes: ['X1'], exclude_codes: [] })).rejects.toMatchObject(SAME_NAME)
    expect(await groupNames()).toEqual(['표층열만'])
  })

  it('AC-2701.1: 넣은 처방은 한 묶음에만 검사는 그대로다(두 묶음 codes에 대소문자만 다른 코드면 23505)', async () => {
    await become(A)
    await insert(GROUP)
    await expect(insert({ name: '둘째', codes: ['mm010'], exclude_codes: [], sort_order: 1 })).rejects.toMatchObject(CODE_TWICE)
    await become(A)
    await expectSaveFailsAtCommit(
      [
        { name: '가', codes: ['ESWT1'], exclude_codes: ['ESWT7'], sort_order: 0 },
        { name: '나', codes: ['eswt1'], exclude_codes: [], sort_order: 1 },
      ],
      CODE_TWICE,
    )
    expect(await groupNames()).toEqual(['표층열만'])
  })

  it('AC-2701.1: 넣은 처방 검사는 codes만 본다: 두 묶음이 같은 코드를 제외할 처방에 두어도 된다', async () => {
    await become(A)
    await insert(GROUP)
    await insert({ name: '도수만', codes: ['도수'], exclude_codes: ['eswt7'], sort_order: 1 })
    await operator()
    expect(await rows(`select name, ${EXCLUDE} from ${TABLE} order by sort_order`)).toEqual([
      { name: '표층열만', exclude_codes: ['ESWT7'] },
      { name: '도수만', exclude_codes: ['eswt7'] },
    ])
  })

  it('AC-2701.1: 파일 머리 주석에 운영자가 붙여 넣는 방법과 "사이트에 올리기 전에" 붙인다는 말이 있다', () => {
    const lines = EXCLUDE_MIGRATION.split('\n')
    const head = lines.slice(0, lines.findIndex((line) => !/^(--|\s*$)/.test(line))).join('\n')
    expect(head).toContain('운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다')
    expect(head).toContain('20261105000100_stats_rx_groups.sql')
    expect(head).toContain('사이트에 올리기 전에 붙인다')
  })

  it('AC-2701.1: 파일은 stats_rx_groups만 고치고, 새 함수 하나·저장 함수 바꾸기 밖의 표·함수·정책을 만들거나 지우지 않는다(주석 밖 글자)', () => {
    expect(EXCLUDE_SQL).toMatch(/alter table public\.stats_rx_groups\b/)
    for (const [, target] of EXCLUDE_SQL.matchAll(/^\s*alter table\s+(\S+)/gim)) expect(target).toBe(TABLE)
    expect(EXCLUDE_SQL).not.toMatch(/^\s*(drop|truncate)\b/im)
    expect(EXCLUDE_SQL).not.toMatch(/\bcreate\s+table\b/i)
    expect(EXCLUDE_SQL).not.toMatch(/\b(create|alter|drop)\s+policy\b/i)
    expect(EXCLUDE_SQL).not.toMatch(/\bcreate\s+(constraint\s+)?trigger\b/i)
    expect([...EXCLUDE_SQL.matchAll(/create or replace function\s+(\S+?)\(/gi)].map((m) => m[1])).toEqual(['public.save_stats_rx_groups'])
    expect([...EXCLUDE_SQL.matchAll(/create function\s+(\S+?)\(/gi)].map((m) => m[1])).toEqual(['public.stats_rx_group_exclude_ok'])
    for (const other of [/\brx_groups\b/, /\bsave_rx_groups\b/, /\btouch_updated_at\b/, /\bstats_days\b/, /\bstats_rx_picks\b/]) {
      expect(EXCLUDE_SQL).not.toMatch(other)
    }
  })
})

describe('AC-2701.2 exclude_codes 칸 제약', SLOW, () => {
  beforeEach(() => become(A))

  it.each([
    ['빈 코드', ['']],
    ['101자 코드', ['x'.repeat(101)]],
    ['101자 한글 코드', ['가'.repeat(101)]],
    ['줄바꿈이 든 코드', ['a\nb']],
    ['탭이 든 코드', ['a\tb']],
    ['제어 문자가 든 코드', ['a\u0001b']],
    ['DEL 문자가 든 코드', ['a\u007fb']],
    ['null 칸만', [null]],
    ['null 칸 섞임', ['ESWT7', null]],
    ['1,001개', Array.from({ length: 1001 }, (_, i) => `X${i}`)],
  ])('AC-2701.2: exclude_codes가 %s면 거부된다(codes와 같은 규칙)', async (_label, exclude_codes) => {
    await expect(insert({ ...GROUP, exclude_codes })).rejects.toThrow(CHECK)
    expect(await snapshot()).toEqual([])
  })

  it('AC-2701.2: exclude_codes는 null일 수 없다(넣기·고치기)', async () => {
    await expect(insert({ ...GROUP, exclude_codes: null })).rejects.toThrow(NOT_NULL)
    await become(A)
    await insert(GROUP)
    const kept = await snapshot()
    await become(A)
    await expect(rows(`update ${TABLE} set ${EXCLUDE} = null`)).rejects.toThrow(NOT_NULL)
    expect(await snapshot()).toEqual(kept)
  })

  it.each([
    ['같은 글자', ['MM010'], ['MM010']],
    ['대소문자만 다름', ['MM010'], ['mm010']],
    ['여러 코드 중 하나, 섞인 글자', ['ESWT1', 'mm010'], ['ESWT7', 'Mm010']],
  ])('AC-2701.2: 같은 줄의 codes와 겹치는 코드가 있으면(%s) 거부된다', async (_label, codes, exclude_codes) => {
    await expect(insert({ ...GROUP, codes, exclude_codes })).rejects.toThrow(APART)
    expect(await snapshot()).toEqual([])
  })

  it.each([
    ['같은 글자', ['ESWT7', 'ESWT7']],
    ['대소문자만 다름', ['eswt7', 'ESWT7']],
  ])('AC-2701.2: exclude_codes 안에 같은 코드가 두 번 나오면(%s) 거부된다', async (_label, exclude_codes) => {
    await expect(insert({ ...GROUP, exclude_codes })).rejects.toThrow(APART)
    expect(await snapshot()).toEqual([])
  })

  it('AC-2701.2: 고쳐서 겹치게 하면(제외할 처방에 넣은 처방을 더함·넣은 처방에 제외할 처방을 더함) 거부되고 줄은 그대로다', async () => {
    const [added] = await insert(GROUP, 'returning id')
    const kept = await snapshot()
    await become(A)
    await expect(rows(`update ${TABLE} set ${EXCLUDE} = $1 where id = $2`, [['ESWT7', 'mm010'], added.id])).rejects.toThrow(APART)
    await become(A)
    await expect(rows(`update ${TABLE} set codes = $1 where id = $2`, [['MM010', 'eswt7'], added.id])).rejects.toThrow(APART)
    expect(await snapshot()).toEqual(kept)
  })

  it.each([
    ['100자 코드', ['x'.repeat(100)]],
    ['100자 한글 코드', ['가'.repeat(100)]],
    ['빈칸·괄호가 든 코드', ['도수(20분)', '도수 치료', 'A/B']],
    ['빈 목록', []],
    ['1,000개', Array.from({ length: 1000 }, (_, i) => `X${i}`)],
  ])('AC-2701.2: exclude_codes가 %s면 들어간다', async (_label, exclude_codes) => {
    await insert({ ...GROUP, exclude_codes })
    await operator()
    expect(await rows(`select codes, ${EXCLUDE} from ${TABLE}`)).toEqual([{ codes: GROUP.codes, exclude_codes }])
  })

  it('AC-2701.2: 다른 묶음의 codes에 든 코드(대소문자만 다름)도 제외할 처방에 들어가고, 그 묶음은 그대로다', async () => {
    await insert({ name: '체외충격파', codes: ['ESWT7'], sort_order: 0 })
    await become(A)
    await insert({ name: '표층열만', codes: ['MM010'], exclude_codes: ['eswt7'], sort_order: 1 })
    await operator()
    expect(await rows(`select name, codes, ${EXCLUDE} from ${TABLE} order by sort_order`)).toEqual([
      { name: '체외충격파', codes: ['ESWT7'], exclude_codes: [] },
      { name: '표층열만', codes: ['MM010'], exclude_codes: ['eswt7'] },
    ])
  })
})

describe('AC-2701.3 exclude_codes 칸 권한', SLOW, () => {
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

  it.each(['INSERT', 'UPDATE'])('AC-2701.3: authenticated의 %s 칸 권한은 name·codes·sort_order·exclude_codes뿐이다', async (privilege) => {
    expect(await columnsWith(privilege)).toEqual(SENT)
  })

  it('AC-2701.3: 표 권한은 그대로(anon 없음, authenticated 읽기·지우기)이고 칸 권한은 네 칸 넣기·고치기뿐이다', async () => {
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

  it('AC-2701.3: authenticated는 exclude_codes를 넣고 읽고 고치며(updated_at은 DB 시각) 비울 수 있다', async () => {
    await become(A)
    const [added] = await insert(GROUP, `returning id, hospital_id, ${EXCLUDE}`)
    expect(added).toMatchObject({ hospital_id: hospital[A], exclude_codes: ['ESWT7'] })
    expect(await rows(`select ${EXCLUDE} from ${TABLE}`)).toEqual([{ exclude_codes: ['ESWT7'] }])
    expect(
      await rows(
        `update ${TABLE} set ${EXCLUDE} = $1 where id = $2 returning ${EXCLUDE}, updated_at > now() - interval '1 hour' as fresh`,
        [['ESWT7', 'ESWT1'], added.id],
      ),
    ).toEqual([{ exclude_codes: ['ESWT7', 'ESWT1'], fresh: true }])
    expect(await rows(`update ${TABLE} set ${EXCLUDE} = '{}' where id = $1 returning ${EXCLUDE}`, [added.id])).toEqual([
      { exclude_codes: [] },
    ])
  })

  it('AC-2701.3: B의 줄 exclude_codes는 A가 고쳐도 0줄이고, 승인 대기 병원은 넣지 못한다(RLS 그대로)', async () => {
    const theirs = await seed(B)
    const kept = await snapshot()
    await become(A)
    expect(await rows(`update ${TABLE} set ${EXCLUDE} = '{}' where id = $1 returning id`, [theirs.id])).toEqual([])
    expect(await rows(`select ${EXCLUDE} from ${TABLE}`)).toEqual([])
    await become(PENDING)
    await expect(insert({ ...GROUP, name: '새 묶음', codes: ['X1'] })).rejects.toThrow(RLS)
    expect(await snapshot()).toEqual(kept)
  })

  it('AC-2701.3: anon에게 exclude_codes 칸 권한이 하나도 없다', async () => {
    for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']) {
      const [row] = await rows(`select has_column_privilege('anon', $1, $2, $3) as ok`, [TABLE, EXCLUDE, privilege])
      expect([privilege, row.ok]).toEqual([privilege, false])
    }
  })

  it('AC-2701.3: anon은 exclude_codes 읽기·넣기·고치기 모두 권한 없음이고 줄은 그대로다', async () => {
    await seed(A)
    const kept = await snapshot()
    await becomeAnon()
    await expect(rows(`select ${EXCLUDE} from ${TABLE}`)).rejects.toThrow(DENIED)
    await expect(insert({ ...GROUP, name: '새 묶음', codes: ['X1'] })).rejects.toThrow(DENIED)
    await expect(rows(`update ${TABLE} set ${EXCLUDE} = '{}'`)).rejects.toThrow(DENIED)
    expect(await snapshot()).toEqual(kept)
  })

  it.each([
    ['내 병원 hospital_id', 'hospital_id', () => hospital[A]],
    ['B 병원 hospital_id', 'hospital_id', () => hospital[B]],
    ['id', 'id', () => '00000000-0000-4000-8000-000000000123'],
    ['updated_at', 'updated_at', () => '2001-01-01T00:00:00Z'],
  ])('AC-2701.3: exclude_codes와 함께 %s를 직접 넣으면 권한 없음이다', async (_label, column, value) => {
    await become(A)
    await expect(insert({ ...GROUP, [column]: value() })).rejects.toThrow(DENIED)
    expect(await snapshot()).toEqual([])
  })

  it.each([
    ['hospital_id', () => hospital[B]],
    ['id', () => '00000000-0000-4000-8000-000000000123'],
    ['updated_at', () => '2001-01-01T00:00:00Z'],
  ])('AC-2701.3: exclude_codes를 고치면서 %s를 고치면 권한 없음이고 줄은 그대로다', async (column, value) => {
    await seed(A)
    const kept = await snapshot()
    await become(A)
    await expect(rows(`update ${TABLE} set ${EXCLUDE} = '{}', ${column} = $1`, [value()])).rejects.toThrow(DENIED)
    expect(await snapshot()).toEqual(kept)
  })
})

describe('AC-2701.4 save_stats_rx_groups와 exclude_codes', SLOW, () => {
  it('AC-2701.4: 저장 함수의 이름·인자·돌려주는 모양·부른 사람 권한·search_path·실행 권한은 붙여 넣기 전과 같다', () => {
    expect(saveBefore).toHaveLength(1)
    expect(saveBefore[0]).toMatchObject({ args: 'groups jsonb', prosecdef: false, lang: 'plpgsql', config: '{"search_path=\\"\\""}' })
    expect(saveAfter).toEqual(saveBefore)
  })

  it('AC-2701.4: exclude_codes 배열이 있는 새 묶음은 그 값으로 넣고, 돌려주는 줄(칸 일곱)에 exclude_codes가 있다', async () => {
    await become(A)
    const saved = await save([
      { id: null, name: '체외충격파', codes: ['ESWT7', 'ESWT1'], exclude_codes: [], sort_order: 1 },
      { id: null, name: '표층열만', codes: ['MM010'], exclude_codes: ['eswt7', '도수(20분)'], sort_order: 0 },
    ])
    // 다른 묶음의 codes에 든 코드(ESWT7)도 제외할 처방이 된다(COMMIT 검사는 codes만 본다)
    expect(saved.map((g) => [g.name, g.codes, g.exclude_codes, g.sort_order])).toEqual([
      ['표층열만', ['MM010'], ['eswt7', '도수(20분)'], 0],
      ['체외충격파', ['ESWT7', 'ESWT1'], [], 1],
    ])
    expect(saved.every((g) => g.hospital_id === hospital[A])).toBe(true)
    expect(Object.keys(saved[0])).toEqual(COLUMNS)
    expect(await snapshot()).toEqual(saved)
  })

  it('AC-2701.4: id 있는 내 묶음은 exclude_codes 배열로 고친다(바꿈·비움, id 그대로)', async () => {
    const mine = await seed(A, { name: '표층열', codes: ['MM010'], sort_order: 0 })
    expect(mine.exclude_codes).toEqual([])
    await become(A)
    const [changed] = await save([{ id: mine.id, name: '표층열만', codes: ['MM010'], exclude_codes: ['ESWT7', 'ESWT1'], sort_order: 2 }])
    expect(changed).toMatchObject({ id: mine.id, name: '표층열만', codes: ['MM010'], exclude_codes: ['ESWT7', 'ESWT1'], sort_order: 2 })
    await become(A)
    const [cleared] = await save([{ id: mine.id, name: '표층열만', codes: ['MM010'], exclude_codes: [], sort_order: 2 }])
    expect(cleared).toMatchObject({ id: mine.id, exclude_codes: [] })
  })

  it('AC-2701.4: 한 저장 안에서 넣은 처방 하나를 같은 묶음의 제외할 처방으로 옮길 수 있다', async () => {
    const mine = await seed(A, { name: '표층열', codes: ['MM010', 'ESWT7'], sort_order: 0 })
    await become(A)
    const [saved] = await save([{ id: mine.id, name: '표층열만', codes: ['MM010'], exclude_codes: ['ESWT7'], sort_order: 0 }])
    expect(saved).toMatchObject({ id: mine.id, codes: ['MM010'], exclude_codes: ['ESWT7'] })
  })

  it('AC-2701.4: exclude_codes 열쇠가 없으면(예전 모양 본문) 새 묶음은 빈 배열, 있던 묶음은 그 값을 그대로 두고 다른 칸은 고친다', async () => {
    const kept = await seed(A, { name: '표층열만', codes: ['MM010'], exclude_codes: ['ESWT7', '도수(20분)'], sort_order: 0 })
    await become(A)
    const saved = await save([
      { id: kept.id, name: '표층열', codes: ['MM010', 'MM011'], sort_order: 1 },
      { id: null, name: '새 묶음', codes: ['N1'], sort_order: 0 },
    ])
    expect(saved.map((g) => [g.id === kept.id, g.name, g.codes, g.exclude_codes, g.sort_order])).toEqual([
      [false, '새 묶음', ['N1'], [], 0],
      [true, '표층열', ['MM010', 'MM011'], ['ESWT7', '도수(20분)'], 1],
    ])
    expect(await snapshot()).toEqual(saved)
  })

  it.each([
    ['글자', { exclude_codes: 'ESWT7' }],
    ['숫자', { exclude_codes: 1 }],
    ['JSON null', { exclude_codes: null }],
    ['객체', { exclude_codes: { a: 'ESWT7' } }],
    ['참거짓', { exclude_codes: true }],
  ])('AC-2701.4: exclude_codes가 배열이 아니면(%s) 있던 묶음을 고칠 때도 새 묶음을 넣을 때도 거부되고 표는 그대로다', async (_label, exclude) => {
    const kept = await seed(A, { name: '표층열만', codes: ['MM010'], exclude_codes: ['ESWT7'], sort_order: 0 })
    const kept0 = await snapshot()
    for (const bad of [
      [{ id: kept.id, name: '고친 이름', codes: ['MM010'], sort_order: 5, ...exclude }],
      [
        { id: kept.id, name: '고친 이름', codes: ['MM010'], exclude_codes: [], sort_order: 5 },
        { id: null, name: '새 묶음', codes: ['N1'], sort_order: 1, ...exclude },
      ],
    ]) {
      await become(A)
      await expect(save(bad)).rejects.toThrow(BAD_GROUPS)
      expect(await snapshot()).toEqual(kept0)
    }
  })

  it.each([
    ['넣은 처방과 겹침(대소문자 무시)', { codes: ['MM010'], exclude_codes: ['mm010'] }, APART],
    ['제외할 처방 안에서 두 번', { codes: ['MM010'], exclude_codes: ['ESWT7', 'eswt7'] }, APART],
    ['101자 코드', { codes: ['MM010'], exclude_codes: ['x'.repeat(101)] }, CHECK],
    ['null 칸', { codes: ['MM010'], exclude_codes: ['ESWT7', null] }, CHECK],
  ])('AC-2701.4: 고리 도중 묶음의 exclude_codes가 칸 규칙 밖이면(%s) 앞서 고친 줄(제외할 처방 포함)과 뺄 줄이 모두 그대로다', async (_label, bad, error) => {
    const kept = await seed(A, { name: '둘 줄', codes: ['K1'], exclude_codes: ['E1'], sort_order: 0 })
    await seed(A, { name: '뺄 줄', codes: ['K2'], exclude_codes: ['E2'], sort_order: 1 })
    const kept0 = await snapshot()
    await become(A)
    await expect(
      save([
        { id: kept.id, name: '고친 이름', codes: ['K9'], exclude_codes: ['E9'], sort_order: 5 },
        { id: null, name: '새 묶음', sort_order: 6, ...bad },
      ]),
    ).rejects.toThrow(error)
    expect(await snapshot()).toEqual(kept0)
  })

  const many = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ name: `묶음${i}`, codes: [`C${i}`], exclude_codes: [`E${i}`], sort_order: i }))

  it('AC-2701.4: 51개는 거부되고 50개는 된다(exclude_codes를 실어도)', async () => {
    await become(A)
    await expect(save(many(51))).rejects.toThrow(BAD_GROUPS)
    expect(await groupNames()).toEqual([])
    await become(A)
    const saved = await save(many(50))
    expect(saved.map((g) => [g.sort_order, g.exclude_codes])).toEqual(Array.from({ length: 50 }, (_, i) => [i, [`E${i}`]]))
  })

  it('AC-2701.4: B 병원의 id를 넣으면 거부되고(exclude_codes를 실어도) B 줄도 내 줄(앞서 고친 것)도 그대로다', async () => {
    const theirs = await seed(B, { name: '남의 줄', codes: ['THEIR'], exclude_codes: ['E1'], sort_order: 0 })
    const mine = await seed(A, { name: '내 줄', codes: ['MINE'], sort_order: 0 })
    const kept = await snapshot()
    await become(A)
    await expect(
      save([
        { id: mine.id, name: '고친 줄', codes: [], exclude_codes: ['ESWT7'], sort_order: 1 },
        { id: theirs.id, name: '빼앗은 줄', codes: [], exclude_codes: [], sort_order: 2 },
      ]),
    ).rejects.toThrow(NOT_MINE)
    expect(await snapshot()).toEqual(kept)
  })

  it('AC-2701.4: 받은 목록에 없는 내 묶음은(제외할 처방이 있어도) 지우고, 빈 배열이면 모두 지우며, B 묶음은 그대로다', async () => {
    const kept = await seed(A, { name: '둘 줄', codes: ['K1'], exclude_codes: ['E1'], sort_order: 0 })
    await seed(A, { name: '뺄 줄', codes: ['K2'], exclude_codes: ['E2'], sort_order: 1 })
    await seed(B, { name: '남의 줄', codes: ['K2'], exclude_codes: ['E2'], sort_order: 0 })
    await become(A)
    const saved = await save([{ id: kept.id, name: '둘 줄', codes: ['K1'], exclude_codes: ['E1'], sort_order: 0 }])
    expect(saved.map((g) => [g.name, g.exclude_codes])).toEqual([['둘 줄', ['E1']]]) // B 줄은 돌려주지 않는다
    expect(await groupNames()).toEqual(['남의 줄', '둘 줄'])
    await become(A)
    expect(await save([])).toEqual([])
    expect(await groupNames()).toEqual(['남의 줄'])
  })

  it('AC-2701.4: anon은 save_stats_rx_groups를 부르지 못하고(exclude_codes를 실어도) 줄은 그대로다', async () => {
    const kept = await seed(A)
    const kept0 = await snapshot()
    await becomeAnon()
    await expect(rows(SAVE, [JSON.stringify([{ ...GROUP, id: kept.id, exclude_codes: [] }])])).rejects.toThrow(DENIED)
    await becomeAnon()
    await expect(rows(SAVE, ['[]'])).rejects.toThrow(DENIED)
    expect(await snapshot()).toEqual(kept0)
  })
})

describe('AC-2701.5 흉내의 기본 권한과 migration이 거둔 것', SLOW, () => {
  it('AC-2701.5: 시험의 Supabase 흉내는 새 함수(인자 text[] 둘)에 public·anon·authenticated 실행 권한을 진짜로 준다', async () => {
    await db.exec(`create function public.mock_probe_fn(a text[], b text[]) returns boolean language sql immutable as 'select true'`)
    try {
      for (const role of ['public', 'anon', 'authenticated']) {
        const [row] = await rows(`select has_function_privilege($1, 'public.mock_probe_fn(text[], text[])', 'EXECUTE') as ok`, [role])
        expect([role, row.ok]).toEqual([role, true])
      }
    } finally {
      await db.exec('drop function public.mock_probe_fn(text[], text[])')
    }
  })

  it.each([
    ['public.stats_rx_group_exclude_ok(text[], text[])', false, false, true],
    ['public.save_stats_rx_groups(jsonb)', false, false, true],
    ['public.stats_rx_group_codes_ok(text[])', false, false, true],
  ])('AC-2701.5: %s 실행 권한 public=%s anon=%s authenticated=%s', async (fn, everyone, anon, authenticated) => {
    const can = async (role: string) => (await rows(`select has_function_privilege($1, $2, 'EXECUTE') as ok`, [role, fn]))[0].ok
    expect([await can('public'), await can('anon'), await can('authenticated')]).toEqual([everyone, anon, authenticated])
  })

  it('AC-2701.5: 새 검사 함수는 sql·immutable·부른 사람 권한이고 search_path가 비어 있다', async () => {
    expect(await functionShape(`public.${EXCLUDE_FN}`)).toEqual([
      {
        args: 'codes text[], exclude_codes text[]',
        result: 'boolean',
        prosecdef: false,
        provolatile: 'i',
        config: '{"search_path=\\"\\""}',
        lang: 'sql',
        acl: expect.not.stringContaining('anon='),
      },
    ])
  })

  it('AC-2701.5: authenticated는 새 검사 함수를 부르고(대소문자 무시 겹침·두 번이면 false), anon은 부르지 못한다', async () => {
    await become(A)
    expect(
      await rows(
        `select public.stats_rx_group_exclude_ok('{MM010}', '{ESWT7}') as apart,
                public.stats_rx_group_exclude_ok('{MM010}', '{}') as empty,
                public.stats_rx_group_exclude_ok('{MM010}', '{mm010}') as overlap,
                public.stats_rx_group_exclude_ok('{}', '{eswt7,ESWT7}') as twice`,
      ),
    ).toEqual([{ apart: true, empty: true, overlap: false, twice: false }])
    await becomeAnon()
    await expect(rows(`select public.stats_rx_group_exclude_ok('{}', '{}')`)).rejects.toThrow(DENIED)
  })
})

describe('AC-2709.3 계획 문서 줄', () => {
  const linesOf = (rel: string) => read(rel).split('\n')
  // 찾는 줄이 꼭 한 번 있어야 하고, 그 바로 다음 줄을 돌려준다
  function lineAfter(lines: string[], line: string) {
    expect(lines.filter((candidate) => candidate === line)).toHaveLength(1)
    return lines[lines.indexOf(line) + 1]
  }

  const GROUP_LINE =
    '- **처방별 추세의 묶음**은 통계 탭에서 따로 만든다(표 `stats_rx_groups`). 매출 탭 묶음(`rx_groups`)을 고쳐도 그대로이고 거꾸로도 같다. 같은 날 같은 환자는 묶음 안 처방을 여러 개 받아도 1건이다 **(사용자, 2026-11-05)**. 처방 하나는 한 묶음에만 든다 **(Claude 판단, 2026-11-05 시안 승인)**'
  const EXCLUDE_LINE =
    '- 묶음마다 **제외할 처방**을 둘 수 있다. 그날 묶음 처방을 받았어도 같은 날 제외할 처방을 받은 환자는 그 묶음에서 세지 않는다 **(사용자, 2026-11-12)**. 제외할 처방을 바꾸면 그 기간을 다시 불러와야 숫자가 나온다'

  it('AC-2709.3: plan.md §2-2의 처방별 추세 묶음 줄 바로 아래에 제외할 처방 줄이 한 번 있고, 그 다음 줄은 그대로다', () => {
    const lines = linesOf('../plan.md')
    expect(lineAfter(lines, GROUP_LINE)).toBe(EXCLUDE_LINE)
    expect(lineAfter(lines, EXCLUDE_LINE)).toBe('- 그래프·증감률: 파일럿 규칙 그대로(완전한 기간끼리만 비교) **(사용자)**')
    expect(lines.filter((line) => line.includes('**제외할 처방**'))).toHaveLength(1)
    expect(EXCLUDE_LINE).not.toContain('\\')
    // §2-2 안이다
    const at = lines.indexOf(EXCLUDE_LINE)
    expect(lines.slice(0, at).filter((line) => line.startsWith('#')).pop()).toBe('### 2-2. 환자 통계 (파일럿 코드 이식)')
  })

  it('AC-2709.3: docs/ARCHITECTURE.md stats_rx_groups 줄 칸 목록에 exclude_codes(제외할 처방)가 더해지고 앞 글은 그대로다', () => {
    const lines = linesOf('../docs/ARCHITECTURE.md')
    const found = lines.filter((line) => line.startsWith('| `stats_rx_groups` |'))
    expect(found).toHaveLength(1)
    const [row] = found
    // stats_rx_picks 줄 바로 아래 그대로
    expect(lines[lines.indexOf(row) - 1].startsWith('| `stats_rx_picks` |')).toBe(true)
    expect(row).toContain('칸: `id`·`hospital_id`·`name`·`codes`·`sort_order`·`updated_at`·`exclude_codes`.')
    expect(row).toContain('`exclude_codes`는 제외할 처방')
    expect(row).toContain('specs/rx-group-exclude')
    // 앞 글(treatment-trend AC-1214.4가 읽는 글자)은 그대로
    for (const part of [
      '| `stats_rx_groups` | 통계 처방별 추세의 묶음. 칸: ',
      '저장은 `save_stats_rx_groups`로 목록 통째(새 묶음 넣기·고치기·빠진 묶음 지우기)',
      '처방 하나는 한 묶음에만 든다(대소문자 무시, 저장이 끝날 때 DB가 검사)',
      '매출 탭 묶음(`rx_groups`)과 따로 둔다 (specs/treatment-trend) |',
    ]) {
      expect(row).toContain(part)
    }
    expect(row.endsWith('(specs/treatment-trend) |')).toBe(true)
  })
})

import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

// 통계 '처방별 추세' 묶음 표(stats_rx_groups)에 더한 빼는 처방(out_codes)·조건(cond) 칸, 칸 검사, 저장 함수와 문서 줄 (group-exclude REQ-3701, TASK-2).
// statsRxGroups.rls.test.ts와 같은 방법: 진짜 Postgres(PGlite, WASM)에서 운영자가 SQL 편집기에 붙일 파일을 그대로 돌린다.
// 실제 Supabase에는 붙지 않는다. Supabase가 미리 갖춘 것(역할·auth 스키마·새 표·함수·순서표의 기본 권한)만 흉내 낸다
const fileOf = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))
const read = (rel: string) => readFileSync(fileOf(rel), 'utf-8')
const AUTH_MIGRATION = read('./migrations/20261028000000_auth.sql')
const STATS_MIGRATION = read('./migrations/20261101000200_stats.sql')
const REVENUE_MIGRATION = read('./migrations/20261101000400_revenue.sql')
const PICKS_MIGRATION = read('./migrations/20261103000000_rx_picks.sql')
const GROUPS_MIGRATION = read('./migrations/20261105000100_stats_rx_groups.sql')
const EXCLUDE_PATH = fileOf('./migrations/20261112000000_stats_rx_groups_exclude.sql')
// 파일이 아직 없으면 빈 글자로 돌아, 시험마다 '칸이 없다'로 실패한다(무엇이 빠졌는지 시험별로 보인다)
const EXCLUDE_MIGRATION = existsSync(EXCLUDE_PATH) ? readFileSync(EXCLUDE_PATH, 'utf-8') : ''
// 주석을 뺀 SQL 글자(머리 주석이 다른 갈래 표·함수 이름을 설명으로 말한다)
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
const REJECTED = '00000000-0000-4000-8000-00000000000d' // 거절
const STATUS: Record<string, string> = { [A]: 'approved', [B]: 'approved', [PENDING]: 'pending', [REJECTED]: 'rejected' }

type Row = Record<string, unknown>

const TABLE = 'public.stats_rx_groups'
const COLUMNS = ['id', 'hospital_id', 'name', 'codes', 'sort_order', 'updated_at', 'out_codes', 'cond']
const SENT = ['name', 'codes', 'sort_order', 'out_codes', 'cond'] // 사용자가 보낼 수 있는 칸(그 밖은 칸 권한이 없다)
const PARTS_FN = 'stats_rx_group_parts_ok(text[],text[],jsonb)'
const SAVE_FN = 'save_stats_rx_groups(jsonb)'
// 지어낸 묶음과 코드. 실제 병원 처방 목록이 아니다
const BASIC: Row = { name: '기본 PT', codes: ['MM010', 'MM015', 'MM080'], sort_order: 0 }
const SHOCK: Row = { name: '충격파', codes: ['ESWT7', 'ESWT9'], sort_order: 1 }
const OUT = ['ESWT7', '도수']
const COND = [{ code: 'MM080', unless: ['MM020', 'MM030', 'TENS'] }]
const SAVE = 'select * from public.save_stats_rx_groups(groups := $1::jsonb)'
const many = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i}`)

const SLOW = { timeout: 60_000 }
const DENIED = /permission denied/
const RLS = /row-level security/
const NOT_NULL = /null value in column/
const BAD_GROUPS = /bad groups/
// 칸 검사 실패는 CHECK 오류(23514)이고 새 제약 이름이 보인다
const PARTS_FAIL = { code: '23514', message: expect.stringContaining('stats_rx_groups_parts_ok') }
const CODE_TWICE = { code: '23505', message: 'code in two groups' }

let db: PGlite // 인증 → 통계 → 묶음 → 이 파일
let old: PGlite // 인증 → 통계 → 매출 → 처방 골라 보기 → 묶음 → (옛 줄 넣기) → 이 파일
let hospital: Record<string, string> = {}
let oldHospital: Record<string, string> = {}
let oldRows: Row[] = [] // 이 파일을 붙이기 전에 운영자가 본 옛 줄
type Schema = Awaited<ReturnType<typeof schemaOf>>
let beforeExclude: Schema // old에 이 파일을 돌리기 전
let afterExclude: Schema // 돌린 뒤

const isNotNull = (constraint: Row) => String(constraint.def).startsWith('NOT NULL ')

async function setUp(target: PGlite) {
  await target.exec(SUPABASE_MOCK)
  await target.exec(AUTH_MIGRATION)
}

// 다른 갈래 것이 그대로인지 보려고 public의 표 이름, 함수(정의·권한), 두 묶음 표의 모든 모양을 모은다
async function schemaOf(target: PGlite) {
  const q = async (sql: string, params: unknown[] = []) => (await target.query<Row>(sql, params)).rows
  const shape = async (name: string) => ({
    table: await q(`select relacl::text as acl, relrowsecurity from pg_class where oid = to_regclass($1)`, [`public.${name}`]),
    columns: await q(
      `select column_name, data_type, column_default, is_nullable from information_schema.columns
       where table_schema = 'public' and table_name = $1 order by ordinal_position`,
      [name],
    ),
    constraints: await q(
      `select conname, pg_get_constraintdef(oid) as def, condeferrable, condeferred from pg_constraint
       where conrelid = to_regclass($1) order by conname`,
      [`public.${name}`],
    ),
    triggers: await q(
      `select tgname, pg_get_triggerdef(oid) as def from pg_trigger
       where tgrelid = to_regclass($1) and not tgisinternal order by tgname`,
      [`public.${name}`],
    ),
    policies: await q(
      `select policyname, cmd, roles::text as roles, qual, with_check from pg_policies
       where schemaname = 'public' and tablename = $1 order by policyname`,
      [name],
    ),
  })
  return {
    tables: (
      await q(`select relname from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' order by 1`)
    ).map((row) => row.relname as string),
    functions: await q(
      `select p.oid::regprocedure::text as fn, pg_get_functiondef(p.oid) as def, coalesce(p.proacl::text, '') as acl
       from pg_proc p where p.pronamespace = 'public'::regnamespace order by 1`,
    ),
    rxGroups: await shape('rx_groups'),
    statsRxGroups: await shape('stats_rx_groups'),
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

// 사용자 넷과 병원 줄을 운영자로 넣고 사용자 → 병원 id를 돌려준다
async function addHospitals(target: PGlite) {
  const ids: Record<string, string> = {}
  for (const [user, status] of Object.entries(STATUS)) {
    await target.query('insert into auth.users (id, email) values ($1, $2)', [user, `${user}@fake.test`])
    const { rows: added } = await target.query<Row>(
      `insert into public.hospitals (owner_id, name, applicant_name, email, status)
       values ($1, '가짜병원', '가짜신청자', $2, $3) returning id`,
      [user, `${user}@fake.test`, status],
    )
    ids[user] = added[0].id as string
  }
  return ids
}

async function resetData() {
  await db.exec('rollback') // 앞 시험이 트랜잭션 도중에 실패해도 다음 시험까지 번지지 않게
  await operator()
  await db.exec('truncate auth.users cascade') // 병원·묶음 줄도 같이 비워진다
  hospital = await addHospitals(db)
}

// cond는 jsonb 칸이라 JSON 글자로 보낸다(null도 JSON null이 된다. SQL null은 따로 문장으로 넣는다)
const valueOf = (column: string, value: unknown) => (column === 'cond' ? JSON.stringify(value) : value)

function insert(row: Row, suffix = '') {
  const columns = Object.keys(row)
  return rows(
    `insert into ${TABLE} (${columns.join(', ')}) values (${columns.map((_, i) => `$${i + 1}`).join(', ')}) ${suffix}`,
    columns.map((column) => valueOf(column, row[column])),
  )
}

function update(id: unknown, column: string, value: unknown, suffix = '') {
  return rows(`update ${TABLE} set ${column} = $1 where id = $2 ${suffix}`, [valueOf(column, value), id])
}

// 운영자가 owner 병원 줄을 넣는다(칸 권한·RLS를 건너뛴다). 넣은 줄을 돌려준다
async function seed(owner: string, row: Row = BASIC) {
  await operator()
  const [added] = await insert({ hospital_id: hospital[owner], ...row }, 'returning *')
  return added
}

// 운영자 눈으로 본 표 전체(바뀌지 않았는지 비교할 때)
async function snapshot() {
  await operator()
  return rows(`select * from ${TABLE} order by hospital_id, sort_order, name`)
}

async function partsOf(name: string) {
  await operator()
  const [row] = await rows(`select out_codes, cond from ${TABLE} where name = $1`, [name])
  return row
}

// PostgREST처럼 BEGIN → 함수 호출 → COMMIT. 코드 겹침 검사는 COMMIT에서 돈다
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

// old DB로 바꿔 돌린다. 옛 줄을 그대로 두려고 데이터는 비우지 않고, 바꾼 것은 끝에 되돌린다
async function onOld(run: () => Promise<void>) {
  const main = db
  db = old
  try {
    await run()
  } finally {
    await db.exec('rollback; reset role; reset request.jwt.claims')
    db = main
  }
}

beforeAll(async () => {
  db = await PGlite.create()
  await setUp(db)
  await db.exec(STATS_MIGRATION)
  await db.exec(GROUPS_MIGRATION)
  await db.exec(EXCLUDE_MIGRATION)

  old = await PGlite.create()
  await setUp(old)
  await old.exec(STATS_MIGRATION)
  await old.exec(REVENUE_MIGRATION)
  await old.exec(PICKS_MIGRATION)
  await old.exec(GROUPS_MIGRATION)
  // 이 파일 전에 저장된 옛 줄(칸 둘이 없던 때)
  oldHospital = await addHospitals(old)
  for (const [owner, name, codes, order] of [
    [A, '도수치료', ['MM101', 'MM102'], 0],
    [A, '체외충격파', ['ESWT1', 'eswt7'], 1],
    [B, '남의 묶음', ['MM101'], 0],
  ] as const) {
    await old.query(`insert into ${TABLE} (hospital_id, name, codes, sort_order) values ($1, $2, $3, $4)`, [
      oldHospital[owner],
      name,
      codes,
      order,
    ])
  }
  oldRows = (await old.query<Row>(`select * from ${TABLE} order by hospital_id, sort_order, name`)).rows
  beforeExclude = await schemaOf(old)
  await old.exec(EXCLUDE_MIGRATION)
  afterExclude = await schemaOf(old)
}, 120_000)

afterAll(async () => {
  await db.close()
  await old.close()
})

// 시험마다 빈 표에서 시작한다. 운영자(superuser)는 RLS를 건너뛴다
beforeEach(resetData)

describe('AC-3701.1 칸 둘과 옛 줄', SLOW, () => {
  it('AC-3701.1: 칸은 지금 여섯 칸 뒤에 out_codes(text[], not null, 기본 빈 배열)·cond(jsonb, not null, 기본 빈 배열)다', async () => {
    const columns = await rows(
      `select column_name, udt_name, is_nullable, column_default from information_schema.columns
       where table_schema = 'public' and table_name = 'stats_rx_groups' order by ordinal_position`,
    )
    expect(columns.map((row) => row.column_name)).toEqual(COLUMNS)
    expect(columns.slice(6)).toEqual([
      { column_name: 'out_codes', udt_name: '_text', is_nullable: 'NO', column_default: `'{}'::text[]` },
      { column_name: 'cond', udt_name: 'jsonb', is_nullable: 'NO', column_default: `'[]'::jsonb` },
    ])
  })

  it('AC-3701.1: 두 칸을 빼고 넣으면 빈 값이고, null은 넣을 수 없다', async () => {
    await become(A)
    expect(await insert(BASIC, 'returning out_codes, cond')).toEqual([{ out_codes: [], cond: [] }])
    await become(A)
    await expect(insert({ ...SHOCK, out_codes: null })).rejects.toThrow(NOT_NULL)
    await become(A)
    await expect(rows(`insert into ${TABLE} (name, codes, cond) values ('둘째', '{X1}', null)`)).rejects.toThrow(NOT_NULL)
    expect(await snapshot()).toHaveLength(1)
  })

  it('AC-3701.1: 이 파일 전에 있던 줄은 다른 칸이 그대로이고 두 칸이 빈 값이다(운영자 눈)', async () => {
    expect(oldRows).toHaveLength(3) // 빈 비교가 아니다: 옛 줄이 정말 있다
    await onOld(async () => {
      await operator()
      expect(await rows(`select * from ${TABLE} order by hospital_id, sort_order, name`)).toEqual(
        oldRows.map((row) => ({ ...row, out_codes: [], cond: [] })),
      )
    })
  })

  it('AC-3701.1: 옛 줄은 자기 병원 사용자에게 그대로 읽히고, 두 칸을 채워 고칠 수 있다', async () => {
    await onOld(async () => {
      await become(A)
      expect(await rows(`select hospital_id, name, codes, out_codes, cond from ${TABLE} order by sort_order`)).toEqual([
        { hospital_id: oldHospital[A], name: '도수치료', codes: ['MM101', 'MM102'], out_codes: [], cond: [] },
        { hospital_id: oldHospital[A], name: '체외충격파', codes: ['ESWT1', 'eswt7'], out_codes: [], cond: [] },
      ])
      await db.exec('begin')
      expect(
        await rows(`update ${TABLE} set out_codes = $1, cond = $2 where name = '도수치료' returning out_codes, cond`, [
          ['ESWT1'],
          JSON.stringify([{ code: 'mm101', unless: ['MM102'] }]),
        ]),
      ).toEqual([{ out_codes: ['ESWT1'], cond: [{ code: 'mm101', unless: ['MM102'] }] }])
    })
  })

  it('AC-3701.1: 파일 머리 주석에 운영자가 붙여 넣는 방법과 먼저 있어야 할 파일이 있다', () => {
    const lines = EXCLUDE_MIGRATION.split('\n')
    const head = lines.slice(0, lines.findIndex((line) => !/^(--|\s*$)/.test(line))).join('\n')
    expect(head).toContain('운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다')
    expect(head).toContain('20261105000100_stats_rx_groups.sql')
    expect(head).toContain('specs/group-exclude')
  })

  it('AC-3701.1: 표에 더하는 것은 칸 둘과 칸 검사 제약 하나뿐이고, 이미 있던 칸·제약·트리거·정책·표 권한·RLS는 그대로다', () => {
    const [before, after] = [beforeExclude.statsRxGroups, afterExclude.statsRxGroups]
    expect(before.columns).toHaveLength(6) // 빈 비교가 아니다
    expect(after.columns.slice(0, 6)).toEqual(before.columns)
    expect(after.columns.slice(6).map((column) => column.column_name)).toEqual(['out_codes', 'cond'])
    // PostgreSQL 18(PGlite)은 칸의 NOT NULL도 제약 줄로 둔다. not null은 위 칸 시험이 보므로 여기서는 CHECK·고유 등만 견준다
    const added = after.constraints.filter(
      (c) => !isNotNull(c) && !before.constraints.some((old) => old.conname === c.conname),
    )
    expect(added.map((c) => c.conname)).toEqual(['stats_rx_groups_parts_ok'])
    expect(after.constraints.filter(isNotNull).map((c) => c.def)).toEqual(
      expect.arrayContaining(['NOT NULL out_codes', 'NOT NULL cond']),
    )
    expect(added[0].def).toContain('stats_rx_group_parts_ok(codes, out_codes, cond)')
    expect(after.constraints.filter((c) => c.conname !== 'stats_rx_groups_parts_ok' && !/^NOT NULL (out_codes|cond)$/.test(String(c.def)))).toEqual(
      before.constraints,
    )
    expect(after.triggers).toEqual(before.triggers)
    expect(after.policies).toEqual(before.policies)
    expect(before.policies).toHaveLength(4)
    expect(after.table).toEqual(before.table)
    expect(after.table).toMatchObject([{ relrowsecurity: true }])
  })
})

describe('AC-3701.2 권한과 RLS', SLOW, () => {
  it('AC-3701.2: 승인된 A는 두 칸을 넣고 읽고 고친다', async () => {
    await become(A)
    const [added] = await insert({ ...BASIC, out_codes: OUT, cond: COND }, 'returning id, hospital_id, out_codes, cond')
    expect(added).toMatchObject({ hospital_id: hospital[A], out_codes: OUT, cond: COND })
    expect(await rows(`select out_codes, cond from ${TABLE}`)).toEqual([{ out_codes: OUT, cond: COND }])
    const cond = [
      { code: 'MM010', unless: ['ESWT9'] },
      { code: 'mm080', unless: ['TENS'] },
    ]
    expect(await update(added.id, 'out_codes', ['ESWT9', 'MS1'], 'returning out_codes')).toEqual([{ out_codes: ['ESWT9', 'MS1'] }])
    expect(await update(added.id, 'cond', cond, 'returning cond')).toEqual([{ cond }])
    expect(await update(added.id, 'cond', [], 'returning cond')).toEqual([{ cond: [] }])
  })

  it.each(['INSERT', 'UPDATE'])('AC-3701.2: authenticated의 %s 칸 권한은 name·codes·sort_order·out_codes·cond뿐이다', async (privilege) => {
    const list = await rows(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'stats_rx_groups'
         and has_column_privilege('authenticated', 'public.stats_rx_groups', column_name, $1)
       order by ordinal_position`,
      [privilege],
    )
    expect(list.map((row) => row.column_name)).toEqual(SENT)
  })

  it('AC-3701.2: 표 단위 권한은 그대로 authenticated의 읽기·지우기뿐이다(두 칸 넣기·고치기는 칸 단위)', async () => {
    for (const [privilege, expected] of [
      ['SELECT', true],
      ['DELETE', true],
      ['INSERT', false],
      ['UPDATE', false],
      ['TRUNCATE', false],
    ] as const) {
      const [row] = await rows(`select has_table_privilege('authenticated', $1, $2) as ok`, [TABLE, privilege])
      expect([privilege, row.ok]).toEqual([privilege, expected])
    }
    for (const column of ['out_codes', 'cond']) {
      const [row] = await rows(`select has_column_privilege('authenticated', $1, $2, 'SELECT') as ok`, [TABLE, column])
      expect([column, row.ok]).toEqual([column, true])
    }
  })

  it('AC-3701.2: anon은 두 칸에 읽기·넣기·고치기 권한이 없다', async () => {
    for (const column of ['out_codes', 'cond']) {
      for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']) {
        const [row] = await rows(`select has_column_privilege('anon', $1, $2, $3) as ok`, [TABLE, column, privilege])
        expect([column, privilege, row.ok]).toEqual([column, privilege, false])
      }
    }
  })

  it('AC-3701.2: anon이 두 칸을 읽거나 넣거나 고치면 권한 없음이고 줄은 그대로다', async () => {
    await seed(A, { ...BASIC, out_codes: OUT, cond: COND })
    const before = await snapshot()
    await becomeAnon()
    await expect(rows(`select out_codes, cond from ${TABLE}`)).rejects.toThrow(DENIED)
    await becomeAnon()
    await expect(insert({ ...SHOCK, out_codes: ['X1'], cond: [] })).rejects.toThrow(DENIED)
    await becomeAnon()
    await expect(rows(`update ${TABLE} set out_codes = '{}'`)).rejects.toThrow(DENIED)
    await becomeAnon()
    await expect(rows(`update ${TABLE} set cond = '[]'::jsonb`)).rejects.toThrow(DENIED)
    expect(await snapshot()).toEqual(before)
  })

  it('AC-3701.2: B의 두 칸은 A에게 보이지 않고, A가 id로 골라 고쳐도 0줄이다', async () => {
    const theirs = await seed(B, { ...BASIC, out_codes: OUT, cond: COND })
    const before = await snapshot()
    await become(A)
    expect(await rows(`select out_codes, cond from ${TABLE}`)).toEqual([])
    expect(await update(theirs.id, 'out_codes', ['X1'], 'returning id')).toEqual([])
    expect(await update(theirs.id, 'cond', [], 'returning id')).toEqual([])
    expect(await snapshot()).toEqual(before)
  })

  it.each([
    ['승인 대기', PENDING],
    ['거절', REJECTED],
  ])('AC-3701.2: %s 병원은 두 칸 든 자기 줄도 0줄로 읽고, 넣기는 거부되고 고치기는 0줄이다', async (_label, user) => {
    const mine = await seed(user, { ...BASIC, out_codes: OUT, cond: COND })
    const before = await snapshot()
    await become(user)
    expect(await rows(`select out_codes, cond from ${TABLE}`)).toEqual([])
    await expect(insert({ ...SHOCK, out_codes: ['X1'], cond: [] })).rejects.toThrow(RLS)
    await become(user)
    expect(await update(mine.id, 'out_codes', ['X1'], 'returning id')).toEqual([])
    expect(await snapshot()).toEqual(before)
  })
})

describe('AC-3701.3 빼는 처방 칸 검사', SLOW, () => {
  beforeEach(() => become(A))

  it.each([
    ['넣는 처방과 같은 코드', ['MM010']],
    ['넣는 처방과 대소문자만 다른 코드', ['mm015']],
    ['넣는 처방과 겹친 코드가 뒤에 섞임', ['ESWT7', 'Mm080']],
    ['같은 코드 두 번', ['ESWT7', 'ESWT7']],
    ['대소문자만 다른 겹침', ['ESWT7', 'eswt7']],
    ['빈 글자', ['']],
    ['101자 코드', ['x'.repeat(101)]],
    ['101자 한글 코드', ['가'.repeat(101)]],
    ['줄바꿈이 든 코드', ['a\nb']],
    ['탭이 든 코드', ['a\tb']],
    ['제어 문자가 든 코드', ['a\u0001b']],
    ['DEL 문자가 든 코드', ['a\u007fb']],
    ['null 칸만', [null]],
    ['null 칸 섞임', ['ESWT7', null]],
    ['1,001개', many('X', 1001)],
  ])('AC-3701.3: out_codes가 %s면 CHECK(23514)로 거부된다', async (_label, out) => {
    await expect(insert({ ...BASIC, out_codes: out })).rejects.toMatchObject(PARTS_FAIL)
    expect(await snapshot()).toEqual([])
  })

  it.each([
    ['빈 목록', []],
    ['100자 코드', ['x'.repeat(100)]],
    ['100자 한글 코드', ['가'.repeat(100)]],
    ['빈칸·괄호가 든 코드', ['도수(20분)', '충격파 7', 'A/B']],
    ['1,000개', many('X', 1000)],
  ])('AC-3701.3: out_codes가 %s면 들어간다', async (_label, out) => {
    await insert({ ...BASIC, out_codes: out })
    expect(await partsOf('기본 PT')).toEqual({ out_codes: out, cond: [] })
  })

  it('AC-3701.3: 고칠 때도 같은 검사다: 빼는 처방에 넣는 처방을 넣거나, 넣는 처방에 빼는 처방(대소문자만 다름)을 넣으면 거부되고 줄은 그대로다', async () => {
    const mine = await seed(A, { ...BASIC, out_codes: ['ESWT7'] })
    const before = await snapshot()
    await become(A)
    await expect(update(mine.id, 'out_codes', ['ESWT7', 'mm010'])).rejects.toMatchObject(PARTS_FAIL)
    await become(A)
    await expect(update(mine.id, 'codes', ['MM010', 'eswt7'])).rejects.toMatchObject(PARTS_FAIL)
    await become(A)
    await expect(update(mine.id, 'out_codes', ['ESWT7', 'Eswt7'])).rejects.toMatchObject(PARTS_FAIL)
    expect(await snapshot()).toEqual(before)
  })
})

describe('AC-3701.4 조건 칸 검사', SLOW, () => {
  beforeEach(() => become(A))

  it.each([
    // (가) 배열이 아님
    ['객체', { code: 'MM080', unless: ['MM020'] }],
    ['빈 객체', {}],
    ['글자', 'MM080'],
    ['숫자', 1],
    ['JSON null', null],
    // (나) 항목 칸이 code·unless 둘이 아님
    ['항목이 글자', ['MM080']],
    ['항목이 null', [null]],
    ['항목이 배열', [['MM080', 'MM020']]],
    ['unless가 없음', [{ code: 'MM080' }]],
    ['code가 없음', [{ unless: ['MM020'] }]],
    ['칸이 셋', [{ code: 'MM080', unless: ['MM020'], note: '메모' }]],
    ['칸은 둘인데 unless가 아님', [{ code: 'MM080', other: ['MM020'] }]],
    ['code가 숫자', [{ code: 80, unless: ['MM020'] }]],
    ['code가 null', [{ code: null, unless: ['MM020'] }]],
    ['unless가 글자', [{ code: 'MM080', unless: 'MM020' }]],
    ['unless가 객체', [{ code: 'MM080', unless: { a: 'MM020' } }]],
    // (다) code가 그 줄 넣는 처방에 없음
    ['code가 넣는 처방에 없음', [{ code: 'MM999', unless: ['MM020'] }]],
    ['code가 빼는 처방', [{ code: 'ESWT7', unless: ['MM020'] }]],
    // (라) 같은 code 항목 둘
    [
      '같은 code 항목 둘',
      [
        { code: 'MM080', unless: ['MM020'] },
        { code: 'MM080', unless: ['TENS'] },
      ],
    ],
    [
      '대소문자만 다른 code 항목 둘',
      [
        { code: 'MM080', unless: ['MM020'] },
        { code: 'mm080', unless: ['TENS'] },
      ],
    ],
    // (마) unless 규칙
    ['unless가 빈 배열', [{ code: 'MM080', unless: [] }]],
    ['unless 1,001개', [{ code: 'MM080', unless: many('U', 1001) }]],
    ['unless에 숫자', [{ code: 'MM080', unless: ['MM020', 20] }]],
    ['unless에 null', [{ code: 'MM080', unless: [null] }]],
    ['unless에 객체', [{ code: 'MM080', unless: [{ code: 'MM020' }] }]],
    ['unless에 code 자신', [{ code: 'MM080', unless: ['MM020', 'MM080'] }]],
    ['unless에 대소문자만 다른 code 자신', [{ code: 'MM080', unless: ['mm080'] }]],
    ['unless 안 겹침', [{ code: 'MM080', unless: ['MM020', 'MM020'] }]],
    ['unless 안 대소문자만 다른 겹침', [{ code: 'MM080', unless: ['TENS', 'tens'] }]],
    // (바) 코드 글자 규칙
    ['unless에 빈 글자', [{ code: 'MM080', unless: [''] }]],
    ['unless에 101자', [{ code: 'MM080', unless: ['x'.repeat(101)] }]],
    ['unless에 줄바꿈', [{ code: 'MM080', unless: ['a\nb'] }]],
    ['unless에 제어 문자', [{ code: 'MM080', unless: ['a\u0001b'] }]],
    ['unless에 DEL 문자', [{ code: 'MM080', unless: ['a\u007fb'] }]],
    ['code가 빈 글자', [{ code: '', unless: ['MM020'] }]],
    ['code가 101자', [{ code: 'x'.repeat(101), unless: ['MM020'] }]],
    ['code에 제어 문자', [{ code: 'MM\u0001080', unless: ['MM020'] }]],
    // (사) 항목 1,001개
    ['항목 1,001개', Array.from({ length: 1001 }, (_, i) => ({ code: ['MM010', 'MM015', 'MM080'][i % 3], unless: [`U${i}`] }))],
  ])('AC-3701.4: cond가 %s이면 CHECK(23514)로 거부된다', async (_label, cond) => {
    await expect(insert({ ...BASIC, out_codes: ['ESWT7'], cond })).rejects.toMatchObject(PARTS_FAIL)
    expect(await snapshot()).toEqual([])
  })

  it.each([
    ['빈 배열', []],
    ['넣는 처방 하나에 조건', COND],
    ['code가 넣는 처방과 대소문자만 다름', [{ code: 'mm080', unless: ['MM020'] }]],
    [
      '넣는 처방마다 조건',
      [
        { code: 'MM010', unless: ['MS1'] },
        { code: 'MM015', unless: ['MS1'] },
        { code: 'MM080', unless: ['MM020'] },
      ],
    ],
    ['unless에 같은 묶음의 다른 넣는 처방', [{ code: 'MM080', unless: ['MM010', 'mm015'] }]],
    ['unless에 같은 묶음의 빼는 처방', [{ code: 'MM080', unless: ['ESWT7', 'eswt7x'] }]],
    ['unless에 100자 코드·빈칸·괄호', [{ code: 'MM080', unless: ['x'.repeat(100), '도수(20분)', 'T E N S'] }]],
    ['unless 1,000개', [{ code: 'MM080', unless: many('U', 1000) }]],
  ])('AC-3701.4: cond가 %s면 들어가고 그대로 읽힌다', async (_label, cond) => {
    await insert({ ...BASIC, out_codes: ['ESWT7'], cond })
    expect(await partsOf('기본 PT')).toEqual({ out_codes: ['ESWT7'], cond })
  })

  it('AC-3701.4: 항목 1,000개(넣는 처방 1,000개마다 조건)까지 들어간다', async () => {
    const codes = many('C', 1000)
    const cond = codes.map((code) => ({ code, unless: ['U1'] }))
    await insert({ name: '큰 묶음', codes, sort_order: 0, cond })
    expect(await partsOf('큰 묶음')).toEqual({ out_codes: [], cond })
  }, 120_000)

  it('AC-3701.4: SQL null은 넣을 수 없다(JSON 빈 배열이 기본값)', async () => {
    await expect(rows(`insert into ${TABLE} (name, codes, cond) values ('기본 PT', '{MM010}', null)`)).rejects.toThrow(NOT_NULL)
    expect(await snapshot()).toEqual([])
  })

  it('AC-3701.4: 고칠 때도 같은 검사다: 넣는 처방에서 조건 처방을 빼거나 조건을 틀리게 고치면 거부되고 줄은 그대로다', async () => {
    const mine = await seed(A, { ...BASIC, cond: COND })
    const before = await snapshot()
    await become(A)
    await expect(update(mine.id, 'codes', ['MM010', 'MM015'])).rejects.toMatchObject(PARTS_FAIL)
    await become(A)
    await expect(update(mine.id, 'cond', [{ code: 'MM080', unless: [] }])).rejects.toMatchObject(PARTS_FAIL)
    await become(A)
    await expect(update(mine.id, 'cond', { code: 'MM080', unless: ['MM020'] })).rejects.toMatchObject(PARTS_FAIL)
    expect(await snapshot()).toEqual(before)
  })
})

describe('AC-3701.5 save_stats_rx_groups가 두 칸을 저장', SLOW, () => {
  beforeEach(() => become(A))

  it('AC-3701.5: 새 묶음의 out_codes·cond가 그대로 들어가고, 돌려준 줄은 여덟 칸이다', async () => {
    const saved = await save([
      { id: null, ...BASIC, out_codes: OUT, cond: COND },
      { id: null, ...SHOCK, out_codes: [], cond: [] },
    ])
    expect(saved.map((g) => [g.name, g.codes, g.out_codes, g.cond])).toEqual([
      ['기본 PT', BASIC.codes, OUT, COND],
      ['충격파', SHOCK.codes, [], []],
    ])
    expect(Object.keys(saved[0])).toEqual(COLUMNS)
    expect(saved.every((g) => g.hospital_id === hospital[A])).toBe(true)
    expect(await partsOf('기본 PT')).toEqual({ out_codes: OUT, cond: COND })
  })

  it('AC-3701.5: 있는 묶음의 두 칸을 바꾸고, 빈 배열을 보내면 비운다', async () => {
    const mine = await seed(A, { ...BASIC, out_codes: ['ESWT7'], cond: COND })
    await become(A)
    const cond = [{ code: 'MM010', unless: ['ESWT9'] }]
    const [changed] = await save([{ id: mine.id, ...BASIC, out_codes: ['ESWT9', 'MS1'], cond }])
    expect(changed).toMatchObject({ id: mine.id, out_codes: ['ESWT9', 'MS1'], cond })
    await become(A)
    const [cleared] = await save([{ id: mine.id, ...BASIC, out_codes: [], cond: [] }])
    expect(cleared).toMatchObject({ id: mine.id, out_codes: [], cond: [] })
    expect(await partsOf('기본 PT')).toEqual({ out_codes: [], cond: [] })
  })

  it('AC-3701.5: 열쇠가 없는 새 묶음(옛 앱)은 두 칸이 빈 값이다', async () => {
    const [saved] = await save([{ id: null, ...BASIC }])
    expect(saved).toMatchObject({ name: '기본 PT', out_codes: [], cond: [] })
  })

  it('AC-3701.5: 열쇠가 없는 고친 줄(옛 앱 탭)은 두 칸을 지금 값 그대로 두고, 이름·차례는 고친다', async () => {
    const mine = await seed(A, { ...BASIC, out_codes: OUT, cond: COND })
    await become(A)
    const [saved] = await save([{ id: mine.id, name: '기본 PT만', codes: BASIC.codes, sort_order: 3 }])
    expect(saved).toMatchObject({ id: mine.id, name: '기본 PT만', sort_order: 3, out_codes: OUT, cond: COND })
    expect(await partsOf('기본 PT만')).toEqual({ out_codes: OUT, cond: COND })
  })

  it.each([
    ['out_codes만 보냄', { out_codes: ['MS1'] }, { out_codes: ['MS1'], cond: COND }],
    ['cond만 보냄', { cond: [{ code: 'MM010', unless: ['MS1'] }] }, { out_codes: OUT, cond: [{ code: 'MM010', unless: ['MS1'] }] }],
  ])('AC-3701.5: 고친 줄에 열쇠 하나만 있으면(%s) 그 칸만 바꾸고 다른 칸은 그대로다', async (_label, parts, expected) => {
    const mine = await seed(A, { ...BASIC, out_codes: OUT, cond: COND })
    await become(A)
    const [saved] = await save([{ id: mine.id, ...BASIC, ...parts }])
    expect(saved).toMatchObject(expected)
    expect(await partsOf('기본 PT')).toEqual(expected)
  })

  it.each([
    ['out_codes가 글자', { out_codes: 'ESWT7' }],
    ['out_codes가 객체', { out_codes: { a: 'ESWT7' } }],
    ['out_codes가 숫자', { out_codes: 7 }],
    ['out_codes가 JSON null', { out_codes: null }],
    ['cond가 객체', { cond: { code: 'MM080', unless: ['MM020'] } }],
    ['cond가 글자', { cond: 'MM080' }],
    ['cond가 숫자', { cond: 1 }],
    ['cond가 JSON null', { cond: null }],
  ])('AC-3701.5: %s이면 새 묶음이든 고친 줄이든 bad groups로 아무것도 바뀌지 않는다', async (_label, bad) => {
    const kept = await seed(A, { ...BASIC, out_codes: OUT, cond: COND })
    await seed(A, { ...SHOCK, out_codes: ['MM010'] }) // 목록에서 빠지면 지워질 줄
    const before = await snapshot()
    for (const groups of [
      [{ id: kept.id, ...BASIC, name: '고친 이름', ...bad }],
      [
        { id: kept.id, ...BASIC, out_codes: [], cond: [] },
        { id: null, name: '새 묶음', codes: ['N1'], sort_order: 2, ...bad },
      ],
    ]) {
      await become(A)
      await expect(save(groups)).rejects.toThrow(BAD_GROUPS)
      expect(await snapshot()).toEqual(before)
    }
  })

  it.each([
    ['out_codes에 넣는 처방', { out_codes: ['mm010'] }],
    ['out_codes에 null', { out_codes: ['ESWT7', null] }],
    ['cond code가 넣는 처방에 없음', { cond: [{ code: 'MM999', unless: ['MM020'] }] }],
    ['cond unless가 빈 배열', { cond: [{ code: 'MM080', unless: [] }] }],
  ])('AC-3701.5: 배열이어도 칸 검사에 걸리면(%s) CHECK(23514)이고 앞서 고친 줄·뺄 줄이 그대로다', async (_label, bad) => {
    const kept = await seed(A, { ...BASIC, out_codes: OUT, cond: COND })
    await seed(A, { ...SHOCK, out_codes: ['MM010'] })
    const before = await snapshot()
    await become(A)
    await expect(
      save([
        { id: kept.id, ...BASIC, name: '앞서 고친 이름', out_codes: [], cond: [] },
        { id: null, ...BASIC, name: '새 묶음', codes: ['MM010', 'MM080'], sort_order: 2, ...bad },
      ]),
    ).rejects.toMatchObject(PARTS_FAIL)
    expect(await snapshot()).toEqual(before)
  })
})

describe('AC-3701.6 처방 하나는 한 묶음에만은 넣는 처방에만', SLOW, () => {
  it('AC-3701.6: 다른 묶음의 넣는 처방(대소문자만 다름)을 out_codes·cond unless에 넣어 저장해도 COMMIT까지 된다', async () => {
    await become(A)
    const saved = await save([
      { id: null, ...BASIC, out_codes: ['eswt7', 'ESWT9'], cond: [{ code: 'MM080', unless: ['Eswt7', 'MM020'] }] },
      { id: null, ...SHOCK, out_codes: ['MM010'], cond: [{ code: 'ESWT9', unless: ['mm080'] }] },
    ])
    expect(saved.map((g) => [g.name, g.out_codes, g.cond])).toEqual([
      ['기본 PT', ['eswt7', 'ESWT9'], [{ code: 'MM080', unless: ['Eswt7', 'MM020'] }]],
      ['충격파', ['MM010'], [{ code: 'ESWT9', unless: ['mm080'] }]],
    ])
    expect(await snapshot()).toHaveLength(2)
  })

  it('AC-3701.6: 두 묶음이 같은 빼는 처방·같은 조건 처방을 가져도 된다(한 문장씩 넣어도)', async () => {
    await become(A)
    await insert({ ...BASIC, out_codes: ['ESWT7'], cond: [{ code: 'MM080', unless: ['TENS'] }] })
    await become(A)
    await insert({ name: '다른 PT', codes: ['MM020'], sort_order: 1, out_codes: ['eswt7'], cond: [{ code: 'MM020', unless: ['tens'] }] })
    expect(await snapshot()).toHaveLength(2)
  })

  it('AC-3701.6: 넣는 처방 겹침은 그대로 codes만 보고 거부한다(두 칸이 있어도)', async () => {
    await become(A)
    await insert({ ...BASIC, out_codes: ['ESWT7'], cond: COND })
    await become(A)
    await expect(insert({ name: '둘째', codes: ['mm080'], sort_order: 1, out_codes: ['ESWT7'] })).rejects.toMatchObject(CODE_TWICE)
    const after = await snapshot()
    expect(after.map((g) => g.name)).toEqual(['기본 PT'])
  })

  it('AC-3701.6: 넣는 처방 겹침 검사 함수·제약 트리거는 이 파일 전과 한 글자 그대로이고 codes만 보며, 두 칸 검사는 따로 있는 CHECK 제약이다', () => {
    const fn = (schema: Schema) => schema.functions.filter((f) => f.fn === 'stats_rx_groups_code_once()')
    expect(fn(beforeExclude)).toHaveLength(1)
    expect(fn(afterExclude)).toEqual(fn(beforeExclude))
    expect(String(fn(afterExclude)[0].def)).not.toMatch(/out_codes|cond/)
    expect(afterExclude.statsRxGroups.triggers.map((t) => t.tgname)).toContain('stats_rx_groups_code_once')
    expect(afterExclude.statsRxGroups.triggers).toEqual(beforeExclude.statsRxGroups.triggers)
    const checks = afterExclude.statsRxGroups.constraints.filter((c) => !isNotNull(c))
    expect(checks.filter((c) => /out_codes|cond/.test(String(c.def))).map((c) => c.conname)).toEqual([
      'stats_rx_groups_parts_ok',
    ])
  })
})

describe('AC-3701.7 새 함수 권한과 다른 갈래', SLOW, () => {
  const aclOf = async (fn: string) => {
    const [row] = await rows(`select coalesce(proacl::text, '') as acl from pg_proc where oid = to_regprocedure($1)`, [`public.${fn}`])
    return row.acl as string
  }

  it.each([PARTS_FN, SAVE_FN])('AC-3701.7: %s(이 파일이 만들거나 바꾼 것)는 authenticated만 부르고 public·anon은 못 부른다', async (fn) => {
    // 이 파일이 만든·바꾼 함수다(두 칸을 다룬다)
    const [def] = await rows(`select pg_get_functiondef(to_regprocedure($1)) as def`, [`public.${fn}`])
    expect(def.def).toContain('out_codes')
    const can = async (role: string) => (await rows(`select has_function_privilege($1, $2, 'EXECUTE') as ok`, [role, `public.${fn}`]))[0].ok
    expect(await can('authenticated')).toBe(true)
    expect(await can('anon')).toBe(false)
    const acl = await aclOf(fn)
    expect(acl).toContain('authenticated=X/')
    expect(acl).not.toMatch(/[{,]=X\//) // public(빈 이름)에 준 권한이 없다
    expect(acl).not.toContain('anon=')
  })

  it('AC-3701.7: anon이 칸 검사 함수·저장 함수를 부르면 권한 없음이고, authenticated는 칸 검사 함수를 부른다', async () => {
    await becomeAnon()
    await expect(rows(`select public.stats_rx_group_parts_ok('{MM010}', '{}', '[]'::jsonb)`)).rejects.toThrow(DENIED)
    await becomeAnon()
    await expect(rows(SAVE, [JSON.stringify([{ ...BASIC, out_codes: [], cond: [] }])])).rejects.toThrow(DENIED)
    expect(await snapshot()).toEqual([])
    await become(A)
    expect(
      await rows(
        `select public.stats_rx_group_parts_ok('{MM010}', '{ESWT7}', '[{"code":"MM010","unless":["TENS"]}]'::jsonb) as ok,
                public.stats_rx_group_parts_ok('{MM010}', '{mm010}', '[]'::jsonb) as bad`,
      ),
    ).toEqual([{ ok: true, bad: false }])
  })

  it('AC-3701.7: 다른 migration이 먼저 있는 DB에서 새 함수는 칸 검사 하나뿐이고, 바뀐 함수는 저장 함수뿐이며 다른 표·함수(my_hospital_id·touch_updated_at·save_rx_groups 등)와 rx_groups는 그대로다', () => {
    expect(afterExclude.tables).toEqual(beforeExclude.tables)
    const added = afterExclude.functions.filter((fn) => !beforeExclude.functions.some((old) => old.fn === fn.fn))
    expect(added.map((fn) => fn.fn)).toEqual([PARTS_FN])
    const kept = afterExclude.functions.filter((fn) => fn.fn !== PARTS_FN)
    expect(kept.map((fn) => fn.fn)).toEqual(beforeExclude.functions.map((fn) => fn.fn)) // 지운 함수가 없다
    const changed = kept.filter((fn) => {
      const was = beforeExclude.functions.find((old) => old.fn === fn.fn)
      return was?.def !== fn.def || was?.acl !== fn.acl
    })
    expect(changed.map((fn) => fn.fn)).toEqual([SAVE_FN])
    expect(beforeExclude.functions.map((fn) => fn.fn)).toEqual(
      expect.arrayContaining(['my_hospital_id()', 'touch_updated_at()', 'save_rx_groups(jsonb)', 'stats_rx_group_codes_ok(text[])']),
    )
    expect(afterExclude.rxGroups).toEqual(beforeExclude.rxGroups)
    expect(beforeExclude.rxGroups.columns).toHaveLength(6) // 빈 비교가 아니다: rx_groups가 정말 있다
  })

  it('AC-3701.7: 파일은 다른 갈래 표·함수를 부르거나 만들지 않고, 지우거나 비우는 문장도 없다(주석 밖 글자)', () => {
    expect(EXCLUDE_SQL).toContain(`alter table ${TABLE}`)
    for (const other of [/\brx_groups\b/, /\bsave_rx_groups\b/, /\btouch_updated_at\b/, /\brx_group_codes_ok\b/, /\bstats_days\b/, /\bstats_rx_picks\b/]) {
      expect(EXCLUDE_SQL).not.toMatch(other)
    }
    expect(EXCLUDE_SQL).not.toMatch(/^\s*(drop|truncate)\b/im)
    for (const [, target] of EXCLUDE_SQL.matchAll(/^\s*alter table\s+(\S+)/gim)) expect(target).toBe(TABLE)
    expect([...EXCLUDE_SQL.matchAll(/create function\s+(\S+?)\(/gi)].map((m) => m[1])).toEqual(['public.stats_rx_group_parts_ok'])
    expect([...EXCLUDE_SQL.matchAll(/create or replace function\s+(\S+?)\(/gi)].map((m) => m[1])).toEqual(['public.save_stats_rx_groups'])
  })
})

describe('AC-3701.8 docs/ARCHITECTURE.md 묶음 표 줄', () => {
  // 윈도우에서 받은 파일은 줄 끝이 CRLF일 수 있다
  const lines = () => read('../docs/ARCHITECTURE.md').split(/\r?\n/)
  // treatment-trend 시험(statsRxGroups.rls.test.ts AC-1214.4)이 읽는 글자. 그대로 남아야 한다
  const KEPT = [
    '| `stats_rx_groups` |',
    '`id`·`hospital_id`·`name`·`codes`·`sort_order`·`updated_at`',
    '`save_stats_rx_groups`로 목록 통째',
    '처방 하나는 한 묶음에만',
    '(specs/treatment-trend) |',
  ]

  it('AC-3701.8: stats_rx_groups 줄 칸 목록에 out_codes·cond가 있고 specs/group-exclude를 가리키며, 앞서 있던 글자는 그대로다', () => {
    const found = lines().filter((line) => line.startsWith('| `stats_rx_groups` |'))
    expect(found).toHaveLength(1)
    const [row] = found
    for (const part of KEPT) expect(row).toContain(part)
    for (const part of ['`out_codes`', '`cond`', 'specs/group-exclude']) expect(row).toContain(part)
    // 새 글은 칸 목록 뒤, 줄 끝 괄호 앞에 넣었다
    const end = row.lastIndexOf('(specs/treatment-trend) |')
    expect(end).toBe(row.length - '(specs/treatment-trend) |'.length)
    expect(row.indexOf('`out_codes`')).toBeGreaterThan(row.indexOf('`updated_at`'))
    expect(row.indexOf('specs/group-exclude')).toBeLessThan(end)
    expect(row).not.toContain('\\')
  })

  it('AC-3701.8: 줄 자리는 그대로 stats_rx_picks 줄 바로 아래다', () => {
    const all = lines()
    const picks = all.findIndex((line) => line.startsWith('| `stats_rx_picks` |'))
    expect(picks).toBeGreaterThan(-1)
    expect(all[picks + 1]).toMatch(/^\| `stats_rx_groups` \|.*`out_codes`.*specs\/group-exclude/)
  })
})

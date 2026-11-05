import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

// 통계 '처방 골라 보기'의 고른 처방 표(stats_rx_picks)와 계획 문서 줄 (rx-picker REQ-810·REQ-815, TASK-1).
// stats-rls.test.ts·revenue.rls.test.ts와 같은 방법: 진짜 Postgres(PGlite, WASM)에서 운영자가 SQL 편집기에 붙일 파일을 그대로 돌린다.
// 실제 Supabase에는 붙지 않는다. Supabase가 미리 갖춘 것(역할·auth 스키마·새 표·함수·순서표의 기본 권한)만 흉내 낸다
const fileOf = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))
const read = (rel: string) => readFileSync(fileOf(rel), 'utf-8')
const AUTH_MIGRATION = read('./migrations/20261028000000_auth.sql')
const STATS_MIGRATION = read('./migrations/20261101000200_stats.sql')
const REVENUE_MIGRATION = read('./migrations/20261101000400_revenue.sql')
const PICKS_PATH = fileOf('./migrations/20261103000000_rx_picks.sql')
// 파일이 아직 없으면 빈 글자로 돌아, 시험마다 '표가 없다'로 실패한다(무엇이 빠졌는지 시험별로 보인다)
const PICKS_MIGRATION = existsSync(PICKS_PATH) ? readFileSync(PICKS_PATH, 'utf-8') : ''

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

const TABLE = 'public.stats_rx_picks'
const SEQUENCE = 'public.stats_rx_picks_pick_order_seq'
const SLOW = { timeout: 60_000 }
const DENIED = /permission denied/
const CHECK = /check constraint/
const RLS = /row-level security/

let db: PGlite
let hospital: Record<string, string>

async function setUp(target: PGlite) {
  await target.exec(SUPABASE_MOCK)
  await target.exec(AUTH_MIGRATION)
}

async function operator() {
  await db.exec('reset role; reset request.jwt.claims')
}

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
  return (await db.query<Record<string, unknown>>(sql, params)).rows
}

async function resetHospitals() {
  await operator()
  await db.exec('truncate auth.users cascade')
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

// 운영자(RLS를 건너뜀)가 줄을 심는다
async function seed(owner: string, code: string, name = '가짜 처방') {
  await operator()
  await db.query(`insert into ${TABLE} (hospital_id, code, name) values ($1, $2, $3)`, [hospital[owner], code, name])
}

// 그 병원 줄의 코드를 저장된 차례대로
async function stored(owner: string) {
  await operator()
  const found = await rows(`select code from ${TABLE} where hospital_id = $1 order by pick_order`, [hospital[owner]])
  return found.map((row) => row.code)
}

const insert = (code: string, name = '가짜 처방') =>
  rows(`insert into ${TABLE} (code, name) values ($1, $2) returning hospital_id, code, name`, [code, name])

beforeAll(async () => {
  db = await PGlite.create()
  await setUp(db)
  await db.exec(PICKS_MIGRATION)
}, 60_000)

afterAll(async () => {
  await db.close()
})

// 시험마다 빈 표에서 시작한다. auth.users를 비우면 병원·고른 처방 줄도 같이 비워진다
beforeEach(resetHospitals)

describe('AC-810.1 표·RLS·파일 머리·공용 함수', SLOW, () => {
  it('AC-810.1: 칸은 hospital_id·code·name·pick_order 넷뿐이다(환자 칸 없음)', async () => {
    const columns = await rows(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'stats_rx_picks' order by ordinal_position`,
    )
    expect(columns.map((row) => row.column_name)).toEqual(['hospital_id', 'code', 'name', 'pick_order'])
  })

  it('AC-810.1: RLS가 켜져 있다', async () => {
    expect(await rows(`select relrowsecurity as on from pg_class where oid = $1::regclass`, [TABLE])).toEqual([{ on: true }])
  })

  it('AC-810.1: 파일 머리 주석에 운영자가 붙여 넣는 방법이 있다', () => {
    const head = PICKS_MIGRATION.split('\n').slice(0, PICKS_MIGRATION.split('\n').findIndex((line) => !/^(--|\s*$)/.test(line)))
    expect(head.join('\n')).toContain('운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다')
  })

  it('AC-810.1: my_hospital_id()는 cross-branch C1 글자 그대로다', () => {
    expect(PICKS_MIGRATION).toContain(C1_MY_HOSPITAL_ID)
  })

  it('AC-810.1: 인증 → 이 파일만으로 돈다(통계·매출 표가 없는 DB)', async () => {
    expect(await rows(`select to_regclass('public.stats_days') as stats, to_regclass('public.rx_groups') as revenue`)).toEqual([
      { stats: null, revenue: null },
    ])
    await become(A)
    expect(await insert('A1')).toEqual([{ hospital_id: hospital[A], code: 'A1', name: '가짜 처방' }])
  })

  it('AC-810.1: 통계·매출 마이그레이션이 먼저 있어도 돌고, 공용 함수와 그 표들을 건드리지 않는다', async () => {
    const main = db
    const other = await PGlite.create()
    db = other
    try {
      await setUp(other)
      await other.exec(STATS_MIGRATION)
      await other.exec(REVENUE_MIGRATION)
      const definition = () => rows(`select pg_get_functiondef('public.my_hospital_id()'::regprocedure) as mine`)
      const before = await definition()

      await other.exec(PICKS_MIGRATION)
      expect(await definition()).toEqual(before)

      await resetHospitals()
      await become(A)
      expect(await insert('A1')).toEqual([{ hospital_id: hospital[A], code: 'A1', name: '가짜 처방' }])
      // 이미 있던 표의 기본값이 공용 함수를 그대로 쓴다: 함수를 지웠다 다시 만들었다면 여기서 걸린다
      expect(
        await rows(`insert into public.rx_groups (name, codes) values ('가짜 묶음', array['A1']) returning hospital_id`),
      ).toEqual([{ hospital_id: hospital[A] }])
    } finally {
      db = main
      await other.close()
    }
  })
})

describe('AC-810.2 로그인 안 함', SLOW, () => {
  it('AC-810.2: anon은 읽기·넣기·지우기 모두 권한 없음이다', async () => {
    await seed(A, 'A1')
    await becomeAnon()
    await expect(rows(`select * from ${TABLE}`)).rejects.toThrow(DENIED)
    await expect(rows(`insert into ${TABLE} (code, name) values ('X1', '가짜')`)).rejects.toThrow(DENIED)
    await expect(rows(`delete from ${TABLE}`)).rejects.toThrow(DENIED)
    expect(await stored(A)).toEqual(['A1'])
  })

  it.each([
    ['public', false],
    ['anon', false],
    ['authenticated', true],
  ])('AC-810.2: my_hospital_id() 실행 권한 %s = %s', async (role, allowed) => {
    expect(await rows(`select has_function_privilege($1, 'public.my_hospital_id()', 'EXECUTE') as ok`, [role])).toEqual([
      { ok: allowed },
    ])
  })
})

describe('AC-810.3 승인된 병원', SLOW, () => {
  it('AC-810.3: 자기 줄을 읽고 넣고 지울 수 있고, 넣은 줄의 hospital_id는 자기 병원이다', async () => {
    await become(A)
    expect(await insert('A1', '가짜 처방 하나')).toEqual([{ hospital_id: hospital[A], code: 'A1', name: '가짜 처방 하나' }])
    expect(await rows(`select code, name from ${TABLE}`)).toEqual([{ code: 'A1', name: '가짜 처방 하나' }])
    expect(await rows(`delete from ${TABLE} where code = 'A1' returning code`)).toEqual([{ code: 'A1' }])
    expect(await rows(`select code from ${TABLE}`)).toEqual([])
  })

  it('AC-810.3: B의 줄은 A에게 보이지 않고, 지워도 0줄이다', async () => {
    await seed(B, 'B1')
    await become(A)
    expect(await rows(`select code from ${TABLE}`)).toEqual([])
    expect(await rows(`delete from ${TABLE} returning code`)).toEqual([])
    expect(await stored(B)).toEqual(['B1'])
  })
})

describe('AC-810.4 승인 대기·거절 병원', SLOW, () => {
  it.each([
    ['승인 대기', PENDING],
    ['거절', REJECTED],
  ])('AC-810.4: %s 병원은 자기 줄도 0줄로 읽고, 넣기는 거부되고, 지워도 0줄이다', async (_label, user) => {
    await seed(user, 'P1')
    await become(user)
    expect(await rows(`select code from ${TABLE}`)).toEqual([])
    await expect(insert('P2')).rejects.toThrow(RLS)
    expect(await rows(`delete from ${TABLE} returning code`)).toEqual([])
    expect(await stored(user)).toEqual(['P1'])
  })
})

describe('AC-810.5 칸 권한·순서표 권한', SLOW, () => {
  it('AC-810.5: hospital_id를 직접 넣으면(자기 병원이어도) 권한 없음이다', async () => {
    await become(A)
    await expect(
      rows(`insert into ${TABLE} (hospital_id, code, name) values ($1, 'A1', '가짜')`, [hospital[A]]),
    ).rejects.toThrow(DENIED)
    expect(await stored(A)).toEqual([])
  })

  it('AC-810.5: pick_order를 직접 넣으면 권한 없음이다(규칙을 넘는 overriding도)', async () => {
    await become(A)
    await expect(
      rows(`insert into ${TABLE} (code, name, pick_order) overriding system value values ('A1', '가짜', 5)`),
    ).rejects.toThrow(DENIED)
    // overriding 없이는 권한을 보기 전에 generated always가 먼저 막는다(428C9). 넣지 못하는 것은 같다
    await expect(rows(`insert into ${TABLE} (code, name, pick_order) values ('A1', '가짜', 5)`)).rejects.toMatchObject({
      code: '428C9',
    })
    expect(await stored(A)).toEqual([])
  })

  it.each(['hospital_id', 'code', 'name'])('AC-810.5: %s 칸을 고치면(update) 권한 없음이다', async (column) => {
    await seed(A, 'A1')
    await become(A)
    await expect(rows(`update ${TABLE} set ${column} = ${column}`)).rejects.toThrow(DENIED)
  })

  it('AC-810.5: pick_order 칸을 고치면(update) 권한 없음이다', async () => {
    await seed(A, 'A1')
    await become(A)
    await expect(rows(`update ${TABLE} set pick_order = default`)).rejects.toThrow(DENIED)
    // 값을 주면 권한을 보기 전에 generated always가 먼저 막는다(428C9). 고치지 못하는 것은 같다
    await expect(rows(`update ${TABLE} set pick_order = 5`)).rejects.toMatchObject({ code: '428C9' })
  })

  it('AC-810.5: 넣기 칸은 authenticated의 code·name뿐이고, 고치기 권한은 아무에게도 없다', async () => {
    const can = async (role: string, column: string, privilege: string) =>
      (await rows(`select has_column_privilege($1, $2, $3, $4) as ok`, [role, TABLE, column, privilege]))[0].ok
    for (const column of ['code', 'name']) expect(await can('authenticated', column, 'INSERT')).toBe(true)
    for (const column of ['hospital_id', 'pick_order']) expect(await can('authenticated', column, 'INSERT')).toBe(false)
    for (const column of ['hospital_id', 'code', 'name', 'pick_order']) {
      expect(await can('anon', column, 'INSERT')).toBe(false)
      for (const role of ['anon', 'authenticated']) expect(await can(role, column, 'UPDATE')).toBe(false)
    }
  })

  it('AC-810.5: 표 권한은 authenticated의 읽기·지우기뿐이다(anon 없음, 비우기 등 나머지 없음)', async () => {
    const granted = await rows(
      `select grantee, privilege_type from information_schema.role_table_grants
       where table_schema = 'public' and table_name = 'stats_rx_picks' and grantee in ('anon', 'authenticated')
       order by grantee, privilege_type`,
    )
    expect(granted).toEqual([
      { grantee: 'authenticated', privilege_type: 'DELETE' },
      { grantee: 'authenticated', privilege_type: 'SELECT' },
    ])
  })

  it('AC-810.5: 시험의 Supabase 흉내는 새 순서표에 기본 권한을 진짜로 준다(그래서 거둔 것이 증명된다)', async () => {
    await db.exec('create sequence public.mock_probe_seq')
    try {
      expect(await rows(`select has_sequence_privilege('authenticated', 'public.mock_probe_seq', 'USAGE') as ok`)).toEqual([
        { ok: true },
      ])
    } finally {
      await db.exec('drop sequence public.mock_probe_seq')
    }
  })

  it.each(['anon', 'authenticated'])('AC-810.5: 순서표 권한은 %s에게 없고, 그래도 넣기는 된다', async (role) => {
    for (const privilege of ['USAGE', 'SELECT', 'UPDATE']) {
      expect(await rows(`select has_sequence_privilege($1, $2, $3) as ok`, [role, SEQUENCE, privilege])).toEqual([{ ok: false }])
    }
    await become(A)
    expect(await insert('A1')).toHaveLength(1)
    expect(await stored(A)).toEqual(['A1'])
  })
})

describe('AC-810.6 칸 제약', SLOW, () => {
  it.each([
    ['빈 코드', '', '가짜'],
    ['101자 코드', 'x'.repeat(101), '가짜'],
    ['101자 한글 코드', '가'.repeat(101), '가짜'],
    ['줄바꿈이 든 코드', 'a\nb', '가짜'],
    ['탭이 든 코드', 'a\tb', '가짜'],
    ['제어 문자가 든 코드', 'a\u0001b', '가짜'],
    ['DEL 문자가 든 코드', 'a\u007fb', '가짜'],
    ['줄바꿈이 든 이름', 'A1', 'a\nb'],
    ['탭이 든 이름', 'A1', 'a\tb'],
    ['제어 문자가 든 이름', 'A1', 'a\u0001b'],
    ['101자 이름', 'A1', '가'.repeat(101)],
  ])('AC-810.6 거부: %s', async (_label, code, name) => {
    await become(A)
    await expect(insert(code, name)).rejects.toThrow(CHECK)
  })

  it.each([
    ['빈 이름', 'A1', ''],
    ['100자 코드', 'x'.repeat(100), '가짜'],
    ['100자 한글 코드', '가'.repeat(100), '가짜'],
    ['100자 이름', 'A1', '가'.repeat(100)],
    ['빈칸이 든 코드', '도수 치료', '가짜'],
    ['괄호가 든 코드', 'MM(10)', '가짜'],
    ['슬래시가 든 코드', 'A/B', '가짜'],
    ['셋 다 든 코드', '물리 치료(1회)/A', '가짜'],
  ])('AC-810.6 허용: %s', async (_label, code, name) => {
    await become(A)
    expect(await insert(code, name)).toEqual([{ hospital_id: hospital[A], code, name }])
  })
})

describe('AC-810.7 같은 코드', SLOW, () => {
  it('AC-810.7: 같은 병원에 같은 코드를 또 넣으면 23505로 거부된다', async () => {
    await become(A)
    await insert('AB12')
    await expect(insert('AB12')).rejects.toMatchObject({ code: '23505' })
  })

  it('AC-810.7: 같은 병원에 대소문자만 다른 코드를 또 넣으면 23505로 거부된다', async () => {
    await become(A)
    await insert('ab12')
    await expect(insert('AB12')).rejects.toMatchObject({ code: '23505' })
    await expect(insert('Ab12')).rejects.toMatchObject({ code: '23505' })
    expect(await stored(A)).toEqual(['ab12'])
  })

  it('AC-810.7: 다른 병원은 같은 코드를 넣을 수 있다', async () => {
    await seed(A, 'AB12')
    await become(B)
    expect(await insert('AB12')).toEqual([{ hospital_id: hospital[B], code: 'AB12', name: '가짜 처방' }])
    expect(await stored(A)).toEqual(['AB12'])
    expect(await stored(B)).toEqual(['AB12'])
  })
})

describe('AC-810.8 차례', SLOW, () => {
  it('AC-810.8: pick_order로 읽으면 넣은 차례다(코드 글자 차례가 아니다)', async () => {
    await become(A)
    for (const code of ['C3', 'A1', 'B2']) await insert(code)
    expect(await rows(`select code from ${TABLE} order by pick_order`)).toEqual([{ code: 'C3' }, { code: 'A1' }, { code: 'B2' }])
  })

  it('AC-810.8: 뺐다가 다시 넣으면 맨 뒤다', async () => {
    await become(A)
    for (const code of ['C3', 'A1', 'B2']) await insert(code)
    await rows(`delete from ${TABLE} where code = 'C3'`)
    await insert('C3')
    expect(await rows(`select code from ${TABLE} order by pick_order`)).toEqual([{ code: 'A1' }, { code: 'B2' }, { code: 'C3' }])
  })
})

describe('AC-810.9 파일 글자', () => {
  it('AC-810.9: rx_groups·claim_*·stats_days 표를 건드리지 않고, 지우거나 비우는 문장도 없다', () => {
    expect(PICKS_MIGRATION).toContain('create table public.stats_rx_picks')
    expect(PICKS_MIGRATION).not.toMatch(/\brx_groups\b/)
    expect(PICKS_MIGRATION).not.toMatch(/\bclaim_/)
    expect(PICKS_MIGRATION).not.toMatch(/\bstats_days\b/)
    expect(PICKS_MIGRATION).not.toMatch(/^\s*(drop|truncate)\b/im)
    for (const [, target] of PICKS_MIGRATION.matchAll(/^\s*alter table\s+(\S+)/gim)) expect(target).toBe(TABLE)
  })

  it('AC-810.9: revoke all … from anon, authenticated 뒤에 필요한 권한만 준다', () => {
    const revoke = PICKS_MIGRATION.indexOf(`revoke all on table ${TABLE} from anon, authenticated;`)
    const select = PICKS_MIGRATION.indexOf(`grant select, delete on table ${TABLE} to authenticated;`)
    const insertColumns = PICKS_MIGRATION.indexOf(`grant insert (code, name) on table ${TABLE} to authenticated;`)
    expect(revoke).toBeGreaterThanOrEqual(0)
    expect(select).toBeGreaterThan(revoke)
    expect(insertColumns).toBeGreaterThan(revoke)
    expect(PICKS_MIGRATION.match(/^grant [^;]+;/gm)).toEqual([
      'grant execute on function public.my_hospital_id() to authenticated;',
      `grant select, delete on table ${TABLE} to authenticated;`,
      `grant insert (code, name) on table ${TABLE} to authenticated;`,
    ])
  })
})

describe('AC-815 계획 문서 줄', () => {
  const RATE_LINE =
    '**처방 골라 보기 칸의 신환율·재진율** = 건을 밑수로 쓴다(신환 ÷ 건수, 재진 ÷ 건수). 이 칸에만 해당하고, 처방별 신환·재진 칸은 명 그대로다. 2026-11-03 사용자가 시안을 승인했고 건수 기준을 안내받았으며 이의를 말하지 않았다'
  const linesOf = (rel: string) => read(rel).split('\n')

  // 찾는 줄이 꼭 한 번 있어야 하고, 그 바로 다음 줄을 돌려준다
  function lineAfter(lines: string[], line: string) {
    expect(lines.filter((candidate) => candidate === line)).toHaveLength(1)
    return lines[lines.indexOf(line) + 1]
  }

  it('AC-815.1: plan.md 처방별 신환율·재진율 줄 바로 아래에 이 칸의 비율 기준 줄이 한 번 있다', () => {
    const lines = linesOf('../plan.md')
    expect(lineAfter(lines, '- **처방별 신환율·재진율** = 그 처방을 받은 환자 중 신환·재진 비율 **(사용자)**')).toBe(`- ${RATE_LINE}`)
    expect(lines.filter((line) => line.includes('처방 골라 보기 칸의 신환율·재진율'))).toHaveLength(1)
  })

  it('AC-815.2: docs/PRD.md 처방별 비율 줄 바로 아래에 같은 문장이 목록 들여쓰기로 한 번 있다', () => {
    const lines = linesOf('../docs/PRD.md')
    expect(lineAfter(lines, '   - 처방별 신환율·재진율 = 그 처방을 받은 환자 중 신환·재진 비율')).toBe(`   - ${RATE_LINE}`)
    expect(lines.filter((line) => line.includes('처방 골라 보기 칸의 신환율·재진율'))).toHaveLength(1)
  })

  it('AC-815.3: plan.md DB 표에서 rx_groups 줄 아래에 stats_rx_picks 줄이 있고(백슬래시 없음) 다음 줄은 그대로다', () => {
    const lines = linesOf('../plan.md')
    const row =
      '| `stats_rx_picks` | 처방 골라 보기에서 고른 처방(코드·이름·차례). 낱개 처방이라 묶음 표(`rx_groups`)와 따로 둔다. specs/rx-picker **(Claude 판단, 2026-11-03)** |'
    expect(lineAfter(lines, '| `rx_groups` | 그룹 이름·코드 목록·즐겨찾기 |')).toBe(row)
    expect(lineAfter(lines, row)).toBe('| `sales_days` | 일 매출 집계. 칸은 specs/revenue design.md 6절 |')
  })

  it('REQ-810 TASK-1: docs/ARCHITECTURE.md DB 표에 stats_rx_picks 줄이 있고 백업 목록 줄이 이 표를 적는다', () => {
    const lines = linesOf('../docs/ARCHITECTURE.md')
    expect(lines.filter((line) => line.startsWith('| `stats_rx_picks` |'))).toHaveLength(1)
    const backup = lines.filter((line) => line.startsWith('- 백업 목록(`lib/backup/tables.ts`)'))
    expect(backup).toHaveLength(1)
    expect(backup[0]).toContain('`stats_rx_picks`')
    expect(backup[0]).toContain('`lib/backup/tables.ts`가 생기면 이 표도 넣는다')
  })
})

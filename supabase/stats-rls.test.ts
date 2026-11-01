import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { DayPayload, MonthPayload } from '@/types/payload'

// 진짜 Postgres(PGlite, WASM)에서 인증 → 통계 마이그레이션 파일을 그대로 돌리고 표·권한·RLS·제약·트리거를 확인한다.
// Supabase가 미리 갖춘 것(역할·auth 스키마·기본 권한)만 rls.test.ts처럼 흉내 낸다. 실제 Supabase에는 붙지 않는다
const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf-8')
const AUTH_MIGRATION = './migrations/20261028000000_auth.sql'
const STATS_MIGRATION = './migrations/20261101000200_stats.sql'

const SUPABASE_MOCK = `
  create role anon nologin;
  create role authenticated nologin;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;

  create schema auth;
  grant usage on schema auth to anon, authenticated;
  create table auth.users (id uuid primary key, email text);
  create function auth.jwt() returns jsonb language sql stable
    as $$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
`

// 여러 브랜치가 같이 쓰는 함수(cross-branch C1). 글자 하나도 달라지면 합칠 때 뜻이 바뀐다
const MY_HOSPITAL_ID = `create or replace function public.my_hospital_id() returns uuid language sql stable security definer set search_path = ''
  as $$ select h.id from public.hospitals h where h.owner_id = (select auth.uid()) and h.status = 'approved' $$;
revoke execute on function public.my_hospital_id() from public, anon;
grant execute on function public.my_hospital_id() to authenticated;`

const A = '00000000-0000-4000-8000-00000000000a' // 승인된 병원 A
const B = '00000000-0000-4000-8000-00000000000b' // 승인된 다른 병원 B
const PENDING = '00000000-0000-4000-8000-00000000000c' // 승인 대기
const REJECTED = '00000000-0000-4000-8000-00000000000d' // 거절
const STATUS: Record<string, string> = { [A]: 'approved', [B]: 'approved', [PENDING]: 'pending', [REJECTED]: 'rejected' }

const SLOW = { timeout: 30_000 }
const DENIED = /permission denied/
const CHECK = /check constraint/
const RLS = /row-level security/
const OLD = '2020-01-01T00:00:00.000Z' // 트리거가 새 시각을 넣었는지 가르려고 씨앗 줄에 넣는 옛 시각

const TOTALS = { newPatients: 0, returning: 1, unknown: 0 }
const REVISIT = { cohort: 0, within7: null, within14: null }

function monthPayload(month: string, partial: boolean, patients = 1): MonthPayload {
  const totals = { patients, ...TOTALS }
  return { schemaVersion: 2, quality: 'valid', month, partial, totals, rx: [], groups: [], revisit: REVISIT, regions: [] }
}

function dayPayload(day: string, partial: boolean, patients = 1): DayPayload {
  const totals = { patients, ...TOTALS }
  return { schemaVersion: 2, quality: 'valid', day, partial, totals, rx: [], groups: [], revisit: REVISIT }
}

type Payload = (key: string, partial: boolean, patients?: number) => Record<string, unknown>
type Table = { name: string; key: string; first: string; second: string; payload: Payload }

const MONTHS: Table = { name: 'public.stats_months', key: 'month', first: '2026-10', second: '2026-09', payload: monthPayload }
const DAYS: Table = { name: 'public.stats_days', key: 'day', first: '2026-10-05', second: '2026-10-06', payload: dayPayload }
const TABLES = [MONTHS, DAYS]
const COVERAGE = 'public.stats_coverage'

let db: PGlite
let hospital: Record<string, string>

beforeAll(async () => {
  db = await PGlite.create()
  await db.exec(SUPABASE_MOCK)
  await db.exec(read(AUTH_MIGRATION))
  await db.exec(read(STATS_MIGRATION))
}, 30_000)

// 시험마다 빈 표에서 시작한다. auth.users를 비우면 병원·통계 줄도 같이 비워진다
beforeEach(async () => {
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
})

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

// 운영자(RLS를 건너뜀)가 줄을 심는다. 넣기에는 트리거가 없어 옛 시각이 그대로 남는다
async function seed(t: Table, owner: string, key: string, partial = false, patients = 1) {
  await operator()
  await db.query(
    `insert into ${t.name} (hospital_id, ${t.key}, partial, source, payload, updated_at)
     values ($1, $2, $3, 'file', $4::jsonb, $5)`,
    [hospital[owner], key, partial, JSON.stringify(t.payload(key, partial, patients)), OLD],
  )
}

async function stored(t: Table, owner: string, key: string) {
  await operator()
  const [row] = await rows(
    `select partial, source, payload, updated_at from ${t.name} where hospital_id = $1 and ${t.key} = $2`,
    [hospital[owner], key],
  )
  return row
}

async function countAll(table: string) {
  await operator()
  const [row] = await rows(`select count(*)::int as n from ${table}`)
  return row.n
}

// 사용자 역할로 도는 문장들. 칸은 lib/storage가 보낼 그대로다
function insert(t: Table, key: string, partial: boolean, payload: unknown, source = 'bit') {
  return db.query(`insert into ${t.name} (${t.key}, partial, source, payload) values ($1, $2, $3, $4::jsonb)`, [
    key,
    partial,
    source,
    JSON.stringify(payload),
  ])
}

function update(t: Table, key: string, partial: boolean, payload: unknown, source = 'bit') {
  return db.query(`update ${t.name} set partial = $1, source = $2, payload = $3::jsonb where ${t.key} = $4`, [
    partial,
    source,
    JSON.stringify(payload),
    key,
  ])
}

// PostgREST upsert가 만드는 문장 꼴: 보낸 칸 모두(열쇠 칸도)를 DO UPDATE SET에 넣는다
function upsert(t: Table, key: string, partial: boolean, payload: unknown, source = 'bit') {
  return db.query(
    `insert into ${t.name} (${t.key}, partial, source, payload) values ($1, $2, $3, $4::jsonb)
     on conflict (hospital_id, ${t.key}) do update set ${t.key} = excluded.${t.key},
       partial = excluded.partial, source = excluded.source, payload = excluded.payload`,
    [key, partial, source, JSON.stringify(payload)],
  )
}

function cover(from: string, to: string, source = 'bit') {
  return db.query(`insert into ${COVERAGE} (from_day, to_day, source) values ($1, $2, $3)`, [from, to, source])
}

function without(value: Record<string, unknown>, key: string) {
  return Object.fromEntries(Object.entries(value).filter(([name]) => name !== key))
}

// 칸 값과 어긋나거나 모양이 틀린 payload
function badPayloads(t: Table, key: string, partial: boolean, otherKey: string): Array<[string, unknown]> {
  const good = t.payload(key, partial)
  return [
    ['배열', []],
    ['글자', 'x'],
    ['숫자', 2],
    ['JSON null', null],
    ['schemaVersion 1', { ...good, schemaVersion: 1 }],
    ['schemaVersion 글자', { ...good, schemaVersion: '2' }],
    [`${t.key}이 칸과 다름`, { ...good, [t.key]: otherKey }],
    ['partial이 칸과 다름', { ...good, partial: !partial }],
    ['partial 글자', { ...good, partial: String(partial) }],
  ]
}

// 열쇠가 빠지면 비교가 NULL이 된다. check는 NULL을 통과시키므로 이 줄들이 'is true'를 지킨다
function missingKeys(t: Table, key: string, partial: boolean): Array<[string, unknown]> {
  const good = t.payload(key, partial)
  return [
    ['{}', {}],
    ['schemaVersion만 없음', without(good, 'schemaVersion')],
    ['partial만 없음', without(good, 'partial')],
    [`${t.key}만 없음`, without(good, t.key)],
  ]
}

describe('AC-506.1 세 표·RLS·anon 권한 없음·같이 쓰는 함수', SLOW, () => {
  async function columns(table: string) {
    return rows(
      `select column_name, data_type from information_schema.columns
       where table_schema = 'public' and table_name = $1 order by ordinal_position`,
      [table],
    )
  }

  const names = (cols: Array<Record<string, unknown>>) => cols.map((col) => col.column_name)

  it('AC-506.1 stats_months·stats_days·stats_coverage가 정한 칸으로 있다', async () => {
    expect(names(await columns('stats_months'))).toEqual(['hospital_id', 'month', 'partial', 'source', 'payload', 'updated_at'])
    expect(names(await columns('stats_days'))).toEqual(['hospital_id', 'day', 'partial', 'source', 'payload', 'updated_at'])
    expect(names(await columns('stats_coverage'))).toEqual(['hospital_id', 'from_day', 'to_day', 'source', 'created_at'])
    expect(await columns('stats_days')).toContainEqual({ column_name: 'day', data_type: 'date' })
    expect(await columns('stats_days')).toContainEqual({ column_name: 'payload', data_type: 'jsonb' })
    expect(await columns('stats_months')).toContainEqual({ column_name: 'payload', data_type: 'jsonb' })
    expect(await columns('stats_coverage')).toContainEqual({ column_name: 'from_day', data_type: 'date' })
    expect(await columns('stats_coverage')).toContainEqual({ column_name: 'to_day', data_type: 'date' })
  })

  it('AC-506.1 달·일 표의 기본 키는 hospital_id + month|day다', async () => {
    const keys = await rows(
      `select k.table_name, k.column_name from information_schema.key_column_usage k
       join information_schema.table_constraints c using (constraint_name, table_schema, table_name)
       where c.constraint_type = 'PRIMARY KEY' and k.table_schema = 'public' and k.table_name like 'stats_%'
       order by k.table_name, k.ordinal_position`,
    )
    expect(keys).toEqual([
      { table_name: 'stats_days', column_name: 'hospital_id' },
      { table_name: 'stats_days', column_name: 'day' },
      { table_name: 'stats_months', column_name: 'hospital_id' },
      { table_name: 'stats_months', column_name: 'month' },
    ])
  })

  it('AC-506.1 세 표 모두 RLS가 켜져 있다', async () => {
    const tables = await rows(
      `select relname, relrowsecurity from pg_class
       where relnamespace = 'public'::regnamespace and relname like 'stats_%' and relkind = 'r' order by relname`,
    )
    expect(tables).toEqual([
      { relname: 'stats_coverage', relrowsecurity: true },
      { relname: 'stats_days', relrowsecurity: true },
      { relname: 'stats_months', relrowsecurity: true },
    ])
  })

  it('AC-506.1 anon에게 준 표·칸·함수 권한이 하나도 없다', async () => {
    const where = `where grantee = 'anon' and table_schema = 'public'`
    expect(await rows(`select table_name, privilege_type from information_schema.role_table_grants ${where}`)).toEqual([])
    expect(await rows(`select table_name, column_name from information_schema.column_privileges ${where}`)).toEqual([])
    expect(
      await rows(`select routine_name from information_schema.routine_privileges where grantee = 'anon' and routine_schema = 'public'`),
    ).toEqual([])
    const [fn] = await rows(
      `select has_function_privilege('anon', 'public.my_hospital_id()', 'execute') as my_hospital,
              has_function_privilege('anon', 'public.stats_keep_complete()', 'execute') as keep_complete`,
    )
    expect(fn).toEqual({ my_hospital: false, keep_complete: false })
  })

  it('AC-506.1 stats_coverage는 불러올 때마다 한 줄씩 쌓인다(같은 기간을 또 불러와도)', async () => {
    await become(A)
    await cover('2026-10-01', '2026-10-31')
    await cover('2026-10-01', '2026-10-31')
    expect(await countAll(COVERAGE)).toBe(2)
  })

  it('AC-506.1 anon은 세 표를 읽지도 쓰지도 못하고 줄은 그대로다', async () => {
    await seed(MONTHS, A, MONTHS.first)
    await seed(DAYS, A, DAYS.first)
    await becomeAnon()
    for (const t of TABLES) {
      await expect(db.query(`select * from ${t.name}`)).rejects.toThrow(DENIED)
      await expect(insert(t, t.second, false, t.payload(t.second, false))).rejects.toThrow(DENIED)
      await expect(update(t, t.first, false, t.payload(t.first, false))).rejects.toThrow(DENIED)
      await expect(db.query(`delete from ${t.name}`)).rejects.toThrow(DENIED)
    }
    await expect(db.query(`select * from ${COVERAGE}`)).rejects.toThrow(DENIED)
    await expect(cover('2026-10-01', '2026-10-02')).rejects.toThrow(DENIED)
    await expect(db.query('select public.my_hospital_id()')).rejects.toThrow(DENIED)
    expect(await countAll(MONTHS.name)).toBe(1)
    expect(await countAll(DAYS.name)).toBe(1)
    expect(await countAll(COVERAGE)).toBe(0)
  })

  it('AC-506.1 my_hospital_id()는 여러 브랜치가 같이 쓰는 글자 그대로다', async () => {
    expect(read(STATS_MIGRATION)).toContain(MY_HOSPITAL_ID)
    const [fn] = await rows(
      `select prosecdef, proconfig, has_function_privilege('authenticated', oid, 'execute') as can_run
       from pg_proc where oid = 'public.my_hospital_id()'::regprocedure`,
    )
    expect(fn).toEqual({ prosecdef: true, proconfig: ['search_path=""'], can_run: true })
  })

  it('AC-506.1 트리거 함수는 definer가 아니고 search_path가 비었고 사용자가 직접 쓸 권한이 없다', async () => {
    const [fn] = await rows(
      `select prosecdef, proconfig, has_function_privilege('authenticated', oid, 'execute') as can_run
       from pg_proc where oid = 'public.stats_keep_complete()'::regprocedure`,
    )
    expect(fn).toEqual({ prosecdef: false, proconfig: ['search_path=""'], can_run: false })
  })

  it('AC-506.1 다른 브랜치가 my_hospital_id()를 먼저 만든 DB에서도 오류 없이 돌고 함수가 그대로 동작한다', async () => {
    const other = await PGlite.create()
    try {
      await other.exec(SUPABASE_MOCK)
      await other.exec(read(AUTH_MIGRATION))
      await other.exec(MY_HOSPITAL_ID)
      // 다른 브랜치의 표가 이미 이 함수를 기본값으로 쓴다(함수를 지우고 다시 만들면 여기서 막힌다)
      await other.exec('create table public.other_branch (hospital_id uuid default public.my_hospital_id())')
      await expect(other.exec(read(STATS_MIGRATION))).resolves.toBeDefined()

      await other.query('insert into auth.users (id, email) values ($1, $2)', [A, 'a@fake.test'])
      const inserted = await other.query<{ id: string }>(
        `insert into public.hospitals (owner_id, name, applicant_name, email, status)
         values ($1, '가짜병원', '가짜신청자', 'a@fake.test', 'approved') returning id`,
        [A],
      )
      await other.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: A })])
      await other.exec('set role authenticated')
      const mine = await other.query<{ id: string }>('select public.my_hospital_id() as id')
      expect(mine.rows).toEqual([{ id: inserted.rows[0].id }])
    } finally {
      await other.close()
    }
  })
})

describe('AC-506.2 자기 병원 줄만, hospital_id는 DB가 정하고, 지우기는 없다', SLOW, () => {
  it('AC-506.2 hospital_id는 어느 권한에도 없고 지우기 권한이 없다', async () => {
    const tableGrants = await rows(
      `select table_name, privilege_type from information_schema.role_table_grants
       where grantee = 'authenticated' and table_schema = 'public' and table_name like 'stats_%'
       order by table_name, privilege_type`,
    )
    expect(tableGrants).toEqual([
      { table_name: 'stats_coverage', privilege_type: 'SELECT' },
      { table_name: 'stats_days', privilege_type: 'SELECT' },
      { table_name: 'stats_months', privilege_type: 'SELECT' },
    ])
    const written = await rows(
      `select table_name, privilege_type, column_name from information_schema.column_privileges
       where grantee = 'authenticated' and table_schema = 'public' and table_name like 'stats_%'
         and privilege_type in ('INSERT', 'UPDATE')
       order by table_name, privilege_type, column_name`,
    )
    const line = (table_name: string, privilege_type: string, cols: string[]) =>
      cols.map((column_name) => ({ table_name, privilege_type, column_name }))
    expect(written).toEqual([
      ...line('stats_coverage', 'INSERT', ['from_day', 'source', 'to_day']),
      ...line('stats_days', 'INSERT', ['day', 'partial', 'payload', 'source']),
      ...line('stats_days', 'UPDATE', ['day', 'partial', 'payload', 'source']),
      ...line('stats_months', 'INSERT', ['month', 'partial', 'payload', 'source']),
      ...line('stats_months', 'UPDATE', ['month', 'partial', 'payload', 'source']),
    ])
  })

  for (const t of TABLES) {
    it(`AC-506.2 ${t.name}: A는 자기 줄만 보고, 넣으면 hospital_id는 내 병원이다`, async () => {
      await seed(t, A, t.first)
      await seed(t, B, t.first)
      await become(A)
      expect(await rows(`select hospital_id from ${t.name}`)).toEqual([{ hospital_id: hospital[A] }])
      await insert(t, t.second, false, t.payload(t.second, false))
      expect(await rows(`select hospital_id from ${t.name} where ${t.key} = $1`, [t.second])).toEqual([{ hospital_id: hospital[A] }])
      expect(await stored(t, A, t.second)).toMatchObject({ partial: false, source: 'bit' })
    })

    it(`AC-506.2 ${t.name}: hospital_id·updated_at을 보내면 권한 거부다`, async () => {
      await seed(t, A, t.first)
      const payload = JSON.stringify(t.payload(t.second, false))
      await become(A)
      for (const owner of [A, B]) {
        await expect(
          db.query(`insert into ${t.name} (hospital_id, ${t.key}, partial, source, payload) values ($1, $2, false, 'bit', $3::jsonb)`, [
            hospital[owner],
            t.second,
            payload,
          ]),
        ).rejects.toThrow(DENIED)
        await expect(db.query(`update ${t.name} set hospital_id = $1`, [hospital[owner]])).rejects.toThrow(DENIED)
      }
      await expect(
        db.query(`insert into ${t.name} (${t.key}, partial, source, payload, updated_at) values ($1, false, 'bit', $2::jsonb, now())`, [
          t.second,
          payload,
        ]),
      ).rejects.toThrow(DENIED)
      await expect(db.query(`update ${t.name} set updated_at = now()`)).rejects.toThrow(DENIED)
      expect(await countAll(t.name)).toBe(1)
    })

    it(`AC-506.2 ${t.name}: 지우기는 자기 줄도 안 된다(A·B·대기·거절 모두)`, async () => {
      await seed(t, A, t.first)
      for (const user of [A, B, PENDING, REJECTED]) {
        await become(user)
        await expect(db.query(`delete from ${t.name}`), user).rejects.toThrow(DENIED)
      }
      expect(await countAll(t.name)).toBe(1)
    })

    it(`AC-506.2 ${t.name}: B·대기·거절 사용자는 A 줄을 읽지도 고치지도 못한다`, async () => {
      await seed(t, A, t.first)
      for (const user of [B, PENDING, REJECTED]) {
        await become(user)
        expect(await rows(`select * from ${t.name}`)).toEqual([])
        const result = await update(t, t.first, false, t.payload(t.first, false, 99))
        expect(result.affectedRows).toBe(0)
        expect(await stored(t, A, t.first)).toMatchObject({ source: 'file', payload: t.payload(t.first, false) })
      }
    })

    it(`AC-506.2 ${t.name}: B가 같은 달(날)로 넣어도 자기 병원 줄이 되고 A 줄은 그대로다`, async () => {
      await seed(t, A, t.first)
      await become(B)
      await upsert(t, t.first, false, t.payload(t.first, false, 99))
      expect(await stored(t, B, t.first)).toMatchObject({ payload: t.payload(t.first, false, 99) })
      expect(await stored(t, A, t.first)).toMatchObject({ source: 'file', payload: t.payload(t.first, false) })
    })

    it(`AC-506.2 ${t.name}: 대기·거절 사용자는 넣지 못하고 자기 병원 줄도 못 보고 못 고친다`, async () => {
      for (const user of [PENDING, REJECTED]) {
        await seed(t, user, t.first)
        await become(user)
        expect(await rows(`select * from ${t.name}`)).toEqual([])
        await expect(insert(t, t.second, false, t.payload(t.second, false))).rejects.toThrow(RLS)
        await expect(upsert(t, t.second, false, t.payload(t.second, false))).rejects.toThrow(RLS)
        const result = await update(t, t.first, false, t.payload(t.first, false, 99))
        expect(result.affectedRows).toBe(0)
        expect(await stored(t, user, t.first)).toMatchObject({ source: 'file', payload: t.payload(t.first, false) })
      }
      expect(await countAll(t.name)).toBe(2)
    })
  }

  it('AC-506.2 stats_coverage: 자기 병원 줄만 보이고 넣기만 된다(고치기·지우기 거부)', async () => {
    await become(B)
    await cover('2026-09-01', '2026-09-30')
    await become(A)
    await cover('2026-10-01', '2026-10-31', 'file')
    expect(await rows(`select hospital_id, from_day::text, to_day::text, source from ${COVERAGE}`)).toEqual([
      { hospital_id: hospital[A], from_day: '2026-10-01', to_day: '2026-10-31', source: 'file' },
    ])
    await expect(db.query(`update ${COVERAGE} set to_day = '2026-10-02'`)).rejects.toThrow(DENIED)
    await expect(db.query(`delete from ${COVERAGE}`)).rejects.toThrow(DENIED)
    expect(await countAll(COVERAGE)).toBe(2)
  })

  it('AC-506.2 stats_coverage: hospital_id를 보내면 권한 거부, 대기·거절은 넣지도 읽지도 못한다', async () => {
    await become(A)
    await cover('2026-10-01', '2026-10-31')
    await expect(
      db.query(`insert into ${COVERAGE} (hospital_id, from_day, to_day, source) values ($1, '2026-10-01', '2026-10-02', 'bit')`, [hospital[B]]),
    ).rejects.toThrow(DENIED)
    await expect(
      db.query(`insert into ${COVERAGE} (from_day, to_day, source, created_at) values ('2026-10-01', '2026-10-02', 'bit', now())`),
    ).rejects.toThrow(DENIED)
    for (const user of [B, PENDING, REJECTED]) {
      await become(user)
      expect(await rows(`select * from ${COVERAGE}`)).toEqual([])
      await expect(db.query(`update ${COVERAGE} set to_day = '2026-10-02'`), user).rejects.toThrow(DENIED)
      await expect(db.query(`delete from ${COVERAGE}`), user).rejects.toThrow(DENIED)
    }
    for (const user of [PENDING, REJECTED]) {
      await become(user)
      await expect(cover('2026-10-01', '2026-10-02')).rejects.toThrow(RLS)
    }
    expect(await countAll(COVERAGE)).toBe(1)
  })
})

describe('AC-506.3 payload·출처·덮은 기간 제약', SLOW, () => {
  for (const t of TABLES) {
    it(`AC-506.3 ${t.name}: 맞는 저장 모양은 들어간다`, async () => {
      await become(A)
      await insert(t, t.first, false, t.payload(t.first, false), 'bit')
      await insert(t, t.second, true, t.payload(t.second, true), 'file')
      expect(await countAll(t.name)).toBe(2)
    })

    it(`AC-506.3 ${t.name}: 모양이 틀리거나 칸과 어긋난 payload는 넣지 못한다`, async () => {
      await become(A)
      for (const [label, payload] of badPayloads(t, t.first, false, t.second)) {
        await expect(insert(t, t.first, false, payload), label).rejects.toThrow(CHECK)
      }
      expect(await countAll(t.name)).toBe(0)
    })

    it(`AC-506.3 ${t.name}: 열쇠가 빠진 payload는 넣지 못한다(NULL로 통과하지 않는다)`, async () => {
      await become(A)
      for (const [label, payload] of missingKeys(t, t.first, false)) {
        await expect(insert(t, t.first, false, payload), label).rejects.toThrow(CHECK)
      }
      expect(await countAll(t.name)).toBe(0)
    })

    it(`AC-506.3 ${t.name}: 고칠 때도 같은 제약이고 줄은 그대로다`, async () => {
      await seed(t, A, t.first, true)
      await become(A)
      const tooBig: [string, unknown] = ['65,536바이트 넘음', { ...t.payload(t.first, true), pad: 'x'.repeat(65_536) }]
      const bad = [...badPayloads(t, t.first, true, t.second), ...missingKeys(t, t.first, true), tooBig]
      for (const [label, payload] of bad) {
        await expect(update(t, t.first, true, payload), label).rejects.toThrow(CHECK)
      }
      await expect(update(t, t.first, true, t.payload(t.first, true), 'x')).rejects.toThrow(CHECK)
      expect(await stored(t, A, t.first)).toMatchObject({ partial: true, source: 'file', payload: t.payload(t.first, true) })
    })

    it(`AC-506.3 ${t.name}: source는 bit·file만 된다`, async () => {
      await become(A)
      for (const source of ['x', 'BIT', '']) {
        await expect(insert(t, t.first, false, t.payload(t.first, false), source), source).rejects.toThrow(CHECK)
      }
    })

    it(`AC-506.3 ${t.name}: payload는 65,536바이트까지 된다(글자 수가 아니라 바이트)`, async () => {
      const base = t.payload(t.first, false)
      const [{ size }] = await rows(`select octet_length($1::jsonb::text)::int as size`, [JSON.stringify({ ...base, pad: '' })])
      const fit = { ...base, pad: 'x'.repeat(65_536 - (size as number)) }
      const [{ exact }] = await rows(`select octet_length($1::jsonb::text)::int as exact`, [JSON.stringify(fit)])
      expect(exact).toBe(65_536)

      await become(A)
      await insert(t, t.first, false, fit)
      // first·second는 글자 수가 같아 1바이트만 넘는다
      await expect(insert(t, t.second, false, { ...t.payload(t.second, false), pad: `${fit.pad}x` })).rejects.toThrow(CHECK)
      // 글자 수로는 3만 자라 재면 통과하지만 바이트로는 9만이다
      await expect(insert(t, t.second, false, { ...t.payload(t.second, false), pad: '가'.repeat(30_000) })).rejects.toThrow(CHECK)
      expect(await countAll(t.name)).toBe(1)
    })
  }

  it("AC-506.3 stats_months: month는 'YYYY-MM' 모양만 된다", async () => {
    await become(A)
    for (const month of ['2026-13', '2026-00', '2026-1', '26-10', '2026-10-01']) {
      await expect(insert(MONTHS, month, false, monthPayload(month, false)), month).rejects.toThrow(CHECK)
    }
    expect(await countAll(MONTHS.name)).toBe(0)
  })

  it('AC-506.3 stats_coverage: from_day ≤ to_day이고 800일 이하만 된다', async () => {
    await become(A)
    await cover('2026-10-01', '2026-10-01') // 하루
    await cover('2024-01-01', '2026-03-10') // 양 끝을 합쳐 꼭 800일
    await expect(cover('2024-01-01', '2026-03-11')).rejects.toThrow(CHECK) // 801일
    await expect(cover('2026-10-02', '2026-10-01')).rejects.toThrow(CHECK)
    await expect(cover('2026-10-01', '2026-10-02', 'x')).rejects.toThrow(CHECK)
    expect(await countAll(COVERAGE)).toBe(2)
  })
})

describe('AC-506.4 완전한 줄은 덜 덮인 줄로 안 바뀐다', SLOW, () => {
  const fresh = (row: Record<string, unknown>) => (row.updated_at as Date).getTime() > new Date(OLD).getTime()

  for (const t of TABLES) {
    for (const [label, write] of [
      ['고치기', update],
      ['upsert', upsert],
    ] as const) {
      it(`AC-506.4 ${t.name} ${label}: 완전 → 덜이면 옛 줄이 그대로 남는다`, async () => {
        await seed(t, A, t.first, false)
        await become(A)
        await write(t, t.first, true, t.payload(t.first, true, 99))
        const row = await stored(t, A, t.first)
        expect(row).toMatchObject({ partial: false, source: 'file', payload: t.payload(t.first, false) })
        expect(row.updated_at).toEqual(new Date(OLD))
      })

      for (const [before, after] of [
        [false, false],
        [true, false],
        [true, true],
      ]) {
        const name = (partial: boolean) => (partial ? '덜' : '완전')
        it(`AC-506.4 ${t.name} ${label}: ${name(before)} → ${name(after)}은 바뀌고 updated_at이 새 시각이다`, async () => {
          await seed(t, A, t.first, before)
          await become(A)
          await write(t, t.first, after, t.payload(t.first, after, 99))
          const row = await stored(t, A, t.first)
          expect(row).toMatchObject({ partial: after, source: 'bit', payload: t.payload(t.first, after, 99) })
          expect(fresh(row)).toBe(true)
        })
      }
    }

    it(`AC-506.4 ${t.name}: PostgREST 꼴 upsert가 사용자 역할로 없으면 넣고 있으면 고친다`, async () => {
      await become(A)
      await upsert(t, t.first, true, t.payload(t.first, true, 1))
      expect(await stored(t, A, t.first)).toMatchObject({ partial: true, payload: t.payload(t.first, true, 1) })
      await become(A)
      await upsert(t, t.first, false, t.payload(t.first, false, 2), 'file')
      expect(await stored(t, A, t.first)).toMatchObject({ partial: false, source: 'file', payload: t.payload(t.first, false, 2) })
      expect(await countAll(t.name)).toBe(1)
    })
  }
})

describe('AC-506.5 환자 칸이 없고 실제 DB에는 사용자가 붙인다', SLOW, () => {
  it('AC-506.5 세 표에 환자 번호·차트번호·이름 칸이 없다', async () => {
    const cols = await rows(
      `select column_name from information_schema.columns where table_schema = 'public' and table_name like 'stats_%'`,
    )
    expect(cols.length).toBeGreaterThan(0)
    const hits = cols.map((col) => String(col.column_name)).filter((name) => /patient|chart|name|phone|rrn|jumin/i.test(name))
    expect(hits).toEqual([])
  })

  it('AC-506.5 마이그레이션 머리말이 사용자가 허락한 뒤 SQL 편집기에서 붙인다고 적는다', () => {
    const head = read(STATS_MIGRATION).split('\n').slice(0, 10).join('\n')
    expect(head).toContain('허락')
    expect(head).toContain('SQL 편집기')
  })
})

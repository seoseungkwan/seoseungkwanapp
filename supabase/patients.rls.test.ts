import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

// 진짜 Postgres(PGlite, WASM)에서 운영자가 SQL 편집기에 붙일 migration 파일을 그대로 실행하고 RLS를 확인한다.
// Supabase 흉내와 사용자 바꾸기는 rls.test.ts와 같다. 실제 Supabase에는 붙지 않는다
const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf-8')
const AUTH_MIGRATION = read('./migrations/20261028000000_auth.sql')
const PATIENTS_MIGRATION = read('./migrations/20261101000300_patients.sql')
// 라이브 줄(청구 사전점검)이 운영에 먼저 넣는 두 파일. 읽기만 한다(AC-607.5)
const PRECHECK_SETTINGS_MIGRATION = read('./migrations/20261030000000_precheck_settings.sql')
const PRECHECK_COUNTS_MIGRATION = read('./migrations/20261030000100_precheck_counts.sql')

const SUPABASE_MOCK = `
  create role anon nologin;
  create role authenticated nologin;
  grant usage on schema public to anon, authenticated;
  -- Supabase는 public에 새로 만든 표·함수에 anon·authenticated 모든 권한을 준다(migration이 거둬야 한다)
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

// cross-branch C1: 업무일지·통계·매출·precheck 갈래와 글자까지 같아야 어느 순서로 붙여 넣어도 된다
const C1_MY_HOSPITAL_ID = `create or replace function public.my_hospital_id() returns uuid language sql stable security definer set search_path = ''
  as $$ select h.id from public.hospitals h where h.owner_id = (select auth.uid()) and h.status = 'approved' $$;
revoke execute on function public.my_hospital_id() from public, anon;
grant execute on function public.my_hospital_id() to authenticated;
`
const C1_TOUCH_UPDATED_AT = `create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$ begin new.updated_at = now(); return new; end $$;
`

const A = '00000000-0000-4000-8000-00000000000a' // 승인
const B = '00000000-0000-4000-8000-00000000000b' // 승인
const C = '00000000-0000-4000-8000-00000000000c' // 승인 대기
const D = '00000000-0000-4000-8000-00000000000d' // 거절
const EMAIL: Record<string, string> = { [A]: 'a@fake.test', [B]: 'b@fake.test', [C]: 'c@fake.test', [D]: 'd@fake.test' }

const TEMPLATES = 'public.message_templates'
const COUNTS = 'public.contact_counts'
const TABLE_NAMES = ['message_templates', 'contact_counts']

const INSERT_TEMPLATE = `insert into ${TEMPLATES} (kind, name, body, sort_order) values ($1, $2, $3, $4)
  returning hospital_id, kind, name, body, sort_order`
// supabase-js upsert(…, { onConflict: 'hospital_id' })가 만드는 모양
const UPSERT_COUNTS = `insert into ${COUNTS} (followup_left, injection_left) values ($1, $2)
  on conflict (hospital_id) do update set followup_left = excluded.followup_left, injection_left = excluded.injection_left`
// PostgREST가 supabase-js의 JSON 몸통을 칸 종류로 풀어 넣는 모양
const COUNTS_FROM_JSON = `insert into ${COUNTS} (followup_left, injection_left)
  select b.followup_left, b.injection_left from json_to_record($1::json) as b(followup_left integer, injection_left integer)`

const DENIED = /permission denied/
const CHECK = /check constraint/
const NOT_INTEGER = /invalid input syntax for type integer/
const NOT_NULL = /null value in column/
const NOT_MY_ROW = /row-level security/
// 운영자가 미리 넣는 줄의 바뀐 시각. 고치면 이보다 뒤가 되어야 한다
const LONG_AGO = '2020-01-01T00:00:00Z'

// PGlite 첫 실행(WASM 불러오기)이 느린 PC·CI에서도 흔들리지 않게
const SLOW = { timeout: 30_000 }
let db: PGlite
let hospitalA: string
let hospitalB: string
let hospitalC: string
let hospitalD: string

beforeAll(async () => {
  db = await PGlite.create()
  await db.exec(SUPABASE_MOCK)
  await db.exec(AUTH_MIGRATION)
  await db.exec(PATIENTS_MIGRATION)
}, 30_000)

afterAll(async () => {
  await db.close()
})

// 시험마다 빈 표에서 시작한다. 운영자(superuser)는 RLS를 건너뛴다
beforeEach(async () => {
  await operator()
  await db.exec('truncate auth.users cascade')
  for (const user of [A, B, C, D]) {
    await db.query('insert into auth.users (id, email) values ($1, $2)', [user, EMAIL[user]])
  }
  hospitalA = await addHospital(A, 'approved')
  hospitalB = await addHospital(B, 'approved')
  hospitalC = await addHospital(C, 'pending')
  hospitalD = await addHospital(D, 'rejected')
})

async function operator(target: PGlite = db) {
  await target.exec('reset role; reset request.jwt.claims')
}

async function become(user: string, target: PGlite = db) {
  await operator(target)
  await target.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: user, email: EMAIL[user] })])
  await target.exec('set role authenticated')
}

async function becomeAnon(target: PGlite = db) {
  await operator(target)
  await target.exec('set role anon')
}

async function rows(sql: string, params: unknown[] = [], target: PGlite = db) {
  return (await target.query<Record<string, unknown>>(sql, params)).rows
}

async function addHospital(owner: string, status: 'pending' | 'approved' | 'rejected') {
  await operator()
  const [row] = await rows(
    `insert into public.hospitals (owner_id, name, applicant_name, email, status)
     values ($1, '가짜병원', '홍길동', $2, $3) returning id`,
    [owner, EMAIL[owner], status],
  )
  return row.id as string
}

// 운영자가 줄을 미리 넣어 둔다(승인이 풀린 병원의 옛 줄, 다른 병원 줄)
async function seedTemplate(hospital: string, name = '주사 안내') {
  await operator()
  const [row] = await rows(
    `insert into ${TEMPLATES} (hospital_id, kind, name, body, updated_at) values ($1, 'injection', $2, '내일 오세요', $3) returning id`,
    [hospital, name, LONG_AGO],
  )
  return row.id as string
}

async function seedCounts(hospital: string) {
  await operator()
  await db.query(`insert into ${COUNTS} (hospital_id, followup_left, injection_left, updated_at) values ($1, 1, 2, $2)`, [
    hospital,
    LONG_AGO,
  ])
}

async function allTemplates() {
  await operator()
  return rows(`select hospital_id, name from ${TEMPLATES} order by hospital_id, name`)
}

async function allCounts() {
  await operator()
  return rows(`select hospital_id, followup_left, injection_left from ${COUNTS} order by hospital_id`)
}

async function columnsWith(role: string, table: string, privilege: string) {
  const found = await rows(
    `select column_name from information_schema.columns
     where table_schema = 'public' and table_name = '${table}'
       and has_column_privilege('${role}', 'public.${table}', column_name, '${privilege}')
     order by column_name`,
  )
  return found.map((row) => row.column_name)
}

async function columnKinds(table: string) {
  return rows(
    `select column_name, data_type from information_schema.columns
     where table_schema = 'public' and table_name = '${table}' order by ordinal_position`,
  )
}

// 함수 글·권한, 정책, 트리거, 표 권한을 한 번에 모은다. 두 DB가 같은 모양인지 비교할 때 쓴다
async function shape(target: PGlite) {
  const functions = await rows(
    `select p.proname, pg_get_functiondef(p.oid) as def, p.prosecdef, p.proconfig,
            (select array_agg(item::text order by item::text) from unnest(p.proacl) item) as acl
     from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.proname in ('my_hospital_id', 'touch_updated_at')
     order by p.proname`,
    [],
    target,
  )
  const policies = await rows(
    `select tablename, policyname, cmd, roles::text[] as roles, qual, with_check from pg_policies
     where schemaname = 'public' and tablename in ('message_templates', 'contact_counts')
     order by tablename, policyname`,
    [],
    target,
  )
  const triggers = await rows(
    `select tgrelid::regclass::text as table_name, tgname, pg_get_triggerdef(oid) as def from pg_trigger
     where not tgisinternal and tgrelid in ('${TEMPLATES}'::regclass, '${COUNTS}'::regclass)
     order by 1, 2`,
    [],
    target,
  )
  const grants = await rows(
    `select c.relname, (select array_agg(item::text order by item::text) from unnest(c.relacl) item) as table_acl,
            (select array_agg(a.attname || ':' || item::text order by a.attname, item::text)
             from pg_attribute a, unnest(a.attacl) item where a.attrelid = c.oid) as column_acl,
            c.relrowsecurity
     from pg_class c where c.oid in ('${TEMPLATES}'::regclass, '${COUNTS}'::regclass) order by c.relname`,
    [],
    target,
  )
  return { functions, policies, triggers, grants }
}

// 두 표의 칸·제약·표와 칸 권한·RLS·정책·트리거. 공용 함수는 뺀다(함수 권한은 붙인 길마다 다를 수 있다)
async function tableShape(target: PGlite) {
  const { policies, triggers, grants } = await shape(target)
  const columns = await rows(
    `select table_name, column_name, ordinal_position, data_type, is_nullable, column_default from information_schema.columns
     where table_schema = 'public' and table_name in ('message_templates', 'contact_counts')
     order by table_name, ordinal_position`,
    [],
    target,
  )
  const constraints = await rows(
    `select conrelid::regclass::text as table_name, conname, contype, pg_get_constraintdef(oid) as def from pg_constraint
     where conrelid in ('${TEMPLATES}'::regclass, '${COUNTS}'::regclass)
     order by 1, 2`,
    [],
    target,
  )
  return { columns, constraints, grants, policies, triggers }
}

// 공용 함수 둘의 글·definer·search_path(권한은 뺀다)
async function functionBodies(target: PGlite) {
  return rows(
    `select p.proname, pg_get_functiondef(p.oid) as def, p.prosecdef, p.proconfig from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.proname in ('my_hospital_id', 'touch_updated_at')
     order by p.proname`,
    [],
    target,
  )
}

// 운영자가 auth 다음에 steps를 차례로 붙인 새 DB. 닫는 것은 부른 쪽이 한다
async function freshDb(steps: string[]) {
  const fresh = await PGlite.create()
  try {
    await fresh.exec(SUPABASE_MOCK)
    await fresh.exec(AUTH_MIGRATION)
    for (const step of steps) await fresh.exec(step)
    return fresh
  } catch (error) {
    await fresh.close()
    throw error
  }
}

async function inFreshDb(steps: string[], check: (fresh: PGlite) => Promise<void>) {
  const fresh = await freshDb(steps)
  try {
    await check(fresh)
  } finally {
    await fresh.close()
  }
}

describe('AC-607.1 auth migration 다음에 실행하면 두 표가 정해 둔 칸·제약으로 생긴다', SLOW, () => {
  it('AC-607.1 message_templates 칸', async () => {
    expect(await columnKinds('message_templates')).toEqual([
      { column_name: 'id', data_type: 'uuid' },
      { column_name: 'hospital_id', data_type: 'uuid' },
      { column_name: 'kind', data_type: 'text' },
      { column_name: 'name', data_type: 'text' },
      { column_name: 'body', data_type: 'text' },
      { column_name: 'sort_order', data_type: 'integer' },
      { column_name: 'updated_at', data_type: 'timestamp with time zone' },
    ])
  })

  it('AC-607.1 contact_counts 칸은 uuid·integer·timestamptz뿐이다(글자·jsonb 없음)', async () => {
    expect(await columnKinds('contact_counts')).toEqual([
      { column_name: 'hospital_id', data_type: 'uuid' },
      { column_name: 'followup_left', data_type: 'integer' },
      { column_name: 'injection_left', data_type: 'integer' },
      { column_name: 'updated_at', data_type: 'timestamp with time zone' },
    ])
  })

  it('AC-607.1 hospital_id 기본값은 my_hospital_id()이고 내 병원으로 채워진다', async () => {
    const defaults = await rows(
      `select table_name, column_default from information_schema.columns
       where table_schema = 'public' and column_name = 'hospital_id' and table_name in ('message_templates', 'contact_counts')
       order by table_name`,
    )
    expect(defaults).toEqual([
      { table_name: 'contact_counts', column_default: expect.stringMatching(/my_hospital_id\(\)/) },
      { table_name: 'message_templates', column_default: expect.stringMatching(/my_hospital_id\(\)/) },
    ])
    await become(A)
    expect(await rows(INSERT_TEMPLATE, ['injection', '주사 안내', '내일 오세요', 0])).toEqual([
      { hospital_id: hospitalA, kind: 'injection', name: '주사 안내', body: '내일 오세요', sort_order: 0 },
    ])
    await db.query(UPSERT_COUNTS, [3, 4])
    expect(await allCounts()).toEqual([{ hospital_id: hospitalA, followup_left: 3, injection_left: 4 }])
  })

  it('AC-607.1 문구 경계값(이름 1·30자, 내용 1·2000자, 순서 0·99, 종류 둘)은 되고 순서를 빼면 0이다', async () => {
    await become(A)
    await db.query(INSERT_TEMPLATE, ['injection', '가', '나', 0])
    await db.query(INSERT_TEMPLATE, ['followup', '가'.repeat(30), '나'.repeat(2000), 99])
    const [row] = await rows(`insert into ${TEMPLATES} (kind, name, body) values ('followup', '이름', '글') returning sort_order`)
    expect(row).toEqual({ sort_order: 0 })
  })

  it.each([
    ['이름 0자', ['injection', '', '글', 0]],
    ['이름 31자', ['injection', '가'.repeat(31), '글', 0]],
    ['내용 0자', ['injection', '이름', '', 0]],
    ['내용 2001자', ['injection', '이름', '나'.repeat(2001), 0]],
    ['kind 다른 값', ['jusa', '이름', '글', 0]],
    ['sort_order -1', ['injection', '이름', '글', -1]],
    ['sort_order 100', ['injection', '이름', '글', 100]],
  ])('AC-607.1 AC-607.2 문구 %s는 거부된다', async (_label, values) => {
    await become(A)
    await expect(db.query(INSERT_TEMPLATE, values)).rejects.toThrow(CHECK)
    expect(await allTemplates()).toEqual([])
  })

  it.each([
    ['kind', [null, '이름', '글', 0]],
    ['name', ['injection', null, '글', 0]],
    ['body', ['injection', '이름', null, 0]],
    ['sort_order', ['injection', '이름', '글', null]],
  ])('AC-607.1 문구 %s는 비울 수 없다', async (_label, values) => {
    await become(A)
    await expect(db.query(INSERT_TEMPLATE, values)).rejects.toThrow(NOT_NULL)
  })

  it('AC-607.1 AC-607.2 범위 밖 값으로 고치기도 거부되고 줄은 그대로다', async () => {
    await seedTemplate(hospitalA, '주사 안내')
    await seedCounts(hospitalA)
    await become(A)
    await expect(db.query(`update ${TEMPLATES} set name = ''`)).rejects.toThrow(CHECK)
    await expect(db.query(`update ${TEMPLATES} set sort_order = 100`)).rejects.toThrow(CHECK)
    await expect(db.query(`update ${COUNTS} set followup_left = -1`)).rejects.toThrow(CHECK)
    await expect(db.query(`update ${COUNTS} set injection_left = 100001`)).rejects.toThrow(CHECK)
    expect(await allTemplates()).toEqual([{ hospital_id: hospitalA, name: '주사 안내' }])
    expect(await allCounts()).toEqual([{ hospital_id: hospitalA, followup_left: 1, injection_left: 2 }])
  })

  it.each([
    [{ followup_left: 0, injection_left: 0 }],
    [{ followup_left: 100000, injection_left: 100000 }],
  ])('AC-607.1 건수 경계값 %j는 된다', async (body) => {
    await become(A)
    await db.query(COUNTS_FROM_JSON, [JSON.stringify(body)])
    expect(await allCounts()).toEqual([{ hospital_id: hospitalA, ...body }])
  })

  it.each([
    [{ followup_left: -1, injection_left: 0 }],
    [{ followup_left: 100001, injection_left: 0 }],
    [{ followup_left: 0, injection_left: -1 }],
    [{ followup_left: 0, injection_left: 100001 }],
  ])('AC-607.1 AC-607.2 범위 밖 건수 %j는 거부된다', async (body) => {
    await become(A)
    await expect(db.query(COUNTS_FROM_JSON, [JSON.stringify(body)])).rejects.toThrow(CHECK)
    await expect(db.query(UPSERT_COUNTS, [body.followup_left, body.injection_left])).rejects.toThrow(CHECK)
    expect(await allCounts()).toEqual([])
  })

  it.each([
    ['소수', { followup_left: 1.5, injection_left: 0 }],
    ['소수', { followup_left: 0, injection_left: 1.5 }],
    ['글자', { followup_left: '많음', injection_left: 0 }],
    ['글자', { followup_left: 0, injection_left: '많음' }],
  ])('AC-607.1 AC-607.2 %s 건수 %j는 거부된다', async (_label, body) => {
    await become(A)
    await expect(db.query(COUNTS_FROM_JSON, [JSON.stringify(body)])).rejects.toThrow(NOT_INTEGER)
    await expect(db.query(UPSERT_COUNTS, [body.followup_left, body.injection_left])).rejects.toThrow(NOT_INTEGER)
    expect(await allCounts()).toEqual([])
  })

  it('AC-607.1 건수 줄은 병원마다 하나다', async () => {
    await become(A)
    await db.query(COUNTS_FROM_JSON, [JSON.stringify({ followup_left: 1, injection_left: 1 })])
    await expect(db.query(COUNTS_FROM_JSON, [JSON.stringify({ followup_left: 2, injection_left: 2 })])).rejects.toThrow(
      /duplicate key|unique/,
    )
    expect(await allCounts()).toEqual([{ hospital_id: hospitalA, followup_left: 1, injection_left: 1 }])
  })

  it('AC-607.1 병원 줄이 지워지면 그 병원 줄만 같이 지워진다', async () => {
    await seedTemplate(hospitalA)
    await seedCounts(hospitalA)
    await seedTemplate(hospitalB)
    await seedCounts(hospitalB)
    await db.query('delete from public.hospitals where id = $1', [hospitalA])
    expect(await allTemplates()).toEqual([{ hospital_id: hospitalB, name: '주사 안내' }])
    expect(await allCounts()).toEqual([{ hospital_id: hospitalB, followup_left: 1, injection_left: 2 }])
  })
})

describe('AC-607.2 승인된 내 병원만 내 줄을 읽고 쓴다', SLOW, () => {
  it('AC-607.2 anon은 두 표를 읽지도 넣지도 고치지도 지우지도 못하고 줄은 그대로다', async () => {
    await seedTemplate(hospitalA)
    await seedCounts(hospitalA)
    await becomeAnon()
    for (const table of [TEMPLATES, COUNTS]) {
      await expect(db.query(`select * from ${table}`)).rejects.toThrow(DENIED)
      await expect(db.query(`delete from ${table}`)).rejects.toThrow(DENIED)
    }
    await expect(db.query(INSERT_TEMPLATE, ['injection', '이름', '글', 0])).rejects.toThrow(DENIED)
    await expect(db.query(UPSERT_COUNTS, [9, 9])).rejects.toThrow(DENIED)
    await expect(db.query(`update ${TEMPLATES} set name = '바꿈'`)).rejects.toThrow(DENIED)
    await expect(db.query(`update ${COUNTS} set followup_left = 9`)).rejects.toThrow(DENIED)
    await expect(db.query('select public.my_hospital_id()')).rejects.toThrow(DENIED)
    expect(await allTemplates()).toEqual([{ hospital_id: hospitalA, name: '주사 안내' }])
    expect(await allCounts()).toEqual([{ hospital_id: hospitalA, followup_left: 1, injection_left: 2 }])
  })

  it('AC-607.2 승인된 A는 자기 줄만 읽는다', async () => {
    await seedTemplate(hospitalA, 'A 문구')
    await seedTemplate(hospitalB, 'B 문구')
    await seedCounts(hospitalA)
    await seedCounts(hospitalB)
    await become(A)
    expect(await rows(`select hospital_id, name from ${TEMPLATES}`)).toEqual([{ hospital_id: hospitalA, name: 'A 문구' }])
    expect(await rows(`select hospital_id from ${COUNTS}`)).toEqual([{ hospital_id: hospitalA }])
    expect(await rows(`select id from ${TEMPLATES} where hospital_id = $1`, [hospitalB])).toEqual([])
    expect(await rows(`select hospital_id from ${COUNTS} where hospital_id = $1`, [hospitalB])).toEqual([])
  })

  it('AC-607.2 승인된 A는 자기 문구를 고치고 지운다', async () => {
    const id = await seedTemplate(hospitalA)
    await become(A)
    await db.query(`update ${TEMPLATES} set kind = 'followup', name = '진료 안내', body = '모레 오세요', sort_order = 5 where id = $1`, [id])
    expect(await rows(`select kind, name, body, sort_order from ${TEMPLATES}`)).toEqual([
      { kind: 'followup', name: '진료 안내', body: '모레 오세요', sort_order: 5 },
    ])
    expect(await rows(`delete from ${TEMPLATES} where id = $1 returning id`, [id])).toEqual([{ id }])
    expect(await allTemplates()).toEqual([])
  })

  it('AC-607.2 B는 A의 줄을 못 보고 못 고치고 못 지운다', async () => {
    const id = await seedTemplate(hospitalA)
    await seedCounts(hospitalA)
    await become(B)
    expect(await rows(`select id from ${TEMPLATES} where id = $1`, [id])).toEqual([])
    expect(await rows(`select hospital_id from ${COUNTS}`)).toEqual([])
    expect(await rows(`update ${TEMPLATES} set name = '바꿈' where id = $1 returning id`, [id])).toEqual([])
    expect(await rows(`delete from ${TEMPLATES} where id = $1 returning id`, [id])).toEqual([])
    expect(await rows(`update ${COUNTS} set followup_left = 9 returning hospital_id`)).toEqual([])
    expect(await allTemplates()).toEqual([{ hospital_id: hospitalA, name: '주사 안내' }])
    expect(await allCounts()).toEqual([{ hospital_id: hospitalA, followup_left: 1, injection_left: 2 }])
  })

  it.each([
    ['승인 대기', C, () => hospitalC],
    ['거절', D, () => hospitalD],
  ])('AC-607.2 %s 병원은 아무 줄도 못 쓰고 옛 줄도 못 본다', async (_label, user, hospital) => {
    const id = await seedTemplate(hospital())
    await seedCounts(hospital())
    await become(user)
    expect(await rows('select public.my_hospital_id() as id')).toEqual([{ id: null }])
    expect(await rows(`select id from ${TEMPLATES}`)).toEqual([])
    expect(await rows(`select hospital_id from ${COUNTS}`)).toEqual([])
    await expect(db.query(INSERT_TEMPLATE, ['injection', '이름', '글', 0])).rejects.toThrow(NOT_MY_ROW)
    await expect(db.query(UPSERT_COUNTS, [9, 9])).rejects.toThrow(NOT_MY_ROW)
    expect(await rows(`update ${TEMPLATES} set name = '바꿈' where id = $1 returning id`, [id])).toEqual([])
    expect(await rows(`delete from ${TEMPLATES} where id = $1 returning id`, [id])).toEqual([])
    expect(await rows(`update ${COUNTS} set followup_left = 9 returning hospital_id`)).toEqual([])
    expect(await allTemplates()).toEqual([{ hospital_id: hospital(), name: '주사 안내' }])
    expect(await allCounts()).toEqual([{ hospital_id: hospital(), followup_left: 1, injection_left: 2 }])
  })

  it.each([
    ['내 병원', () => hospitalA],
    ['다른 병원', () => hospitalB],
  ])('AC-607.2 hospital_id(%s)를 직접 넣으면 권한 오류이고 줄이 생기지 않는다', async (_label, hospital) => {
    await become(A)
    await expect(
      db.query(`insert into ${TEMPLATES} (hospital_id, kind, name, body) values ($1, 'injection', '이름', '글')`, [hospital()]),
    ).rejects.toThrow(DENIED)
    await expect(
      db.query(`insert into ${COUNTS} (hospital_id, followup_left, injection_left) values ($1, 1, 1)`, [hospital()]),
    ).rejects.toThrow(DENIED)
    expect(await allTemplates()).toEqual([])
    expect(await allCounts()).toEqual([])
  })

  it('AC-607.2 내 줄의 hospital_id·id·updated_at을 바꾸면 권한 오류이고 줄은 그대로다', async () => {
    await seedTemplate(hospitalA)
    await seedCounts(hospitalA)
    await become(A)
    await expect(db.query(`update ${TEMPLATES} set hospital_id = $1`, [hospitalB])).rejects.toThrow(DENIED)
    await expect(db.query(`update ${TEMPLATES} set id = gen_random_uuid()`)).rejects.toThrow(DENIED)
    await expect(db.query(`update ${TEMPLATES} set updated_at = now()`)).rejects.toThrow(DENIED)
    await expect(db.query(`update ${COUNTS} set hospital_id = $1`, [hospitalB])).rejects.toThrow(DENIED)
    await expect(db.query(`update ${COUNTS} set updated_at = now()`)).rejects.toThrow(DENIED)
    expect(await allTemplates()).toEqual([{ hospital_id: hospitalA, name: '주사 안내' }])
    expect(await allCounts()).toEqual([{ hospital_id: hospitalA, followup_left: 1, injection_left: 2 }])
  })

  it('AC-607.2 id·updated_at을 직접 넣으면 권한 오류다', async () => {
    await become(A)
    await expect(
      db.query(`insert into ${TEMPLATES} (id, kind, name, body) values (gen_random_uuid(), 'injection', '이름', '글')`),
    ).rejects.toThrow(DENIED)
    await expect(
      db.query(`insert into ${TEMPLATES} (updated_at, kind, name, body) values (now(), 'injection', '이름', '글')`),
    ).rejects.toThrow(DENIED)
    await expect(
      db.query(`insert into ${COUNTS} (updated_at, followup_left, injection_left) values (now(), 1, 1)`),
    ).rejects.toThrow(DENIED)
  })

  it('AC-607.2 건수 줄은 내 줄도 지우지 못한다', async () => {
    await seedCounts(hospitalA)
    await become(A)
    await expect(db.query(`delete from ${COUNTS}`)).rejects.toThrow(DENIED)
    expect(await allCounts()).toEqual([{ hospital_id: hospitalA, followup_left: 1, injection_left: 2 }])
  })

  it('AC-607.2 건수 upsert: 승인된 병원에서 되고 두 번째에는 값만 바뀐다', async () => {
    await become(A)
    await db.query(UPSERT_COUNTS, [3, 4])
    expect(await allCounts()).toEqual([{ hospital_id: hospitalA, followup_left: 3, injection_left: 4 }])
    await become(A)
    await db.query(UPSERT_COUNTS, [5, 6])
    expect(await allCounts()).toEqual([{ hospital_id: hospitalA, followup_left: 5, injection_left: 6 }])
  })

  it('AC-607.2 건수 upsert: 다른 병원 줄은 그대로다', async () => {
    await seedCounts(hospitalB)
    await become(A)
    await db.query(UPSERT_COUNTS, [3, 4])
    const counts = await allCounts()
    expect(counts).toHaveLength(2)
    expect(counts).toContainEqual({ hospital_id: hospitalA, followup_left: 3, injection_left: 4 })
    expect(counts).toContainEqual({ hospital_id: hospitalB, followup_left: 1, injection_left: 2 })
  })

  it('AC-607.2 건수 upsert는 updated_at을 바꾼다', async () => {
    await seedCounts(hospitalA)
    await become(A)
    await db.query(UPSERT_COUNTS, [3, 4])
    await operator()
    const [row] = await rows(`select updated_at > $1::timestamptz as moved from ${COUNTS}`, [LONG_AGO])
    expect(row).toEqual({ moved: true })
  })

  it('AC-607.2 문구를 고치면 updated_at이 바뀐다', async () => {
    const id = await seedTemplate(hospitalA)
    await become(A)
    await db.query(`update ${TEMPLATES} set name = '바꿈' where id = $1`, [id])
    await operator()
    const [row] = await rows(`select updated_at > $1::timestamptz as moved from ${TEMPLATES}`, [LONG_AGO])
    expect(row).toEqual({ moved: true })
  })
})

describe('AC-607.3 기본 권한을 거두고 authenticated에 칸 단위로만 준다', SLOW, () => {
  const ALL_PRIVILEGES = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']

  it('AC-607.3 두 표 모두 RLS가 켜져 있다', async () => {
    const tables = await rows(
      `select relname, relrowsecurity from pg_class
       where oid in ('${TEMPLATES}'::regclass, '${COUNTS}'::regclass) order by relname`,
    )
    expect(tables).toEqual([
      { relname: 'contact_counts', relrowsecurity: true },
      { relname: 'message_templates', relrowsecurity: true },
    ])
  })

  it.each(TABLE_NAMES)('AC-607.3 anon은 %s에 표·칸 권한이 하나도 없다', async (table) => {
    for (const privilege of ALL_PRIVILEGES) {
      const [row] = await rows(`select has_table_privilege('anon', 'public.${table}', '${privilege}') as allowed`)
      expect(row).toEqual({ allowed: false })
    }
    for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']) {
      expect(await columnsWith('anon', table, privilege)).toEqual([])
    }
  })

  it.each([
    ['message_templates', { SELECT: true, INSERT: false, UPDATE: false, DELETE: true }],
    ['contact_counts', { SELECT: true, INSERT: false, UPDATE: false, DELETE: false }],
  ])('AC-607.3 authenticated의 %s 표 권한은 읽기(문구는 지우기도)뿐이다', async (table, expected) => {
    for (const [privilege, allowed] of Object.entries({ ...expected, TRUNCATE: false, REFERENCES: false, TRIGGER: false })) {
      const [row] = await rows(`select has_table_privilege('authenticated', 'public.${table}', '${privilege}') as allowed`)
      expect({ privilege, ...row }).toEqual({ privilege, allowed })
    }
  })

  it.each([
    ['message_templates', ['body', 'kind', 'name', 'sort_order']],
    ['contact_counts', ['followup_left', 'injection_left']],
  ])('AC-607.3 %s 넣기·고치기는 칸 단위이고 id·hospital_id·updated_at은 빠진다', async (table, columns) => {
    expect(await columnsWith('authenticated', table, 'INSERT')).toEqual(columns)
    expect(await columnsWith('authenticated', table, 'UPDATE')).toEqual(columns)
  })

  // 정책은 표마다 하나(모든 동작)다(AC-607.5, precheck와 같은 모양). 어떤 동작이 되는지는 위의 표·칸 권한이 정한다
  // (contact_counts는 delete 권한이 없어 지우기가 안 된다, AC-607.2)
  it('AC-607.3 AC-607.5 정책은 표마다 하나, authenticated에게만 있고 읽기·쓰기 모두 내 병원 조건이다', async () => {
    const policies = await rows(
      `select tablename, cmd, roles::text[] as roles, qual, with_check from pg_policies
       where schemaname = 'public' and tablename in ('message_templates', 'contact_counts')
       order by tablename, cmd`,
    )
    // Postgres가 글을 다시 쓸 때 search_path에 있는 스키마 이름은 뺀다
    const MINE = expect.stringMatching(/^\(hospital_id = \( SELECT (public\.)?my_hospital_id\(\)/)
    const row = (tablename: string, cmd: string, qual: unknown, with_check: unknown) => ({
      tablename,
      cmd,
      roles: ['authenticated'],
      qual,
      with_check,
    })
    expect(policies).toEqual([row('contact_counts', 'ALL', MINE, MINE), row('message_templates', 'ALL', MINE, MINE)])
  })

  it('AC-607.3 my_hospital_id()는 authenticated만 실행하고 public·anon은 못 한다', async () => {
    const fn = 'public.my_hospital_id()'
    const [privileges] = await rows(
      `select has_function_privilege('authenticated', '${fn}', 'execute') as authenticated,
              has_function_privilege('anon', '${fn}', 'execute') as anon,
              has_function_privilege('public', '${fn}', 'execute') as public`,
    )
    expect(privileges).toEqual({ authenticated: true, anon: false, public: false })
    const grantees = await rows(
      `select coalesce(nullif(a.grantee, 0)::regrole::text, 'PUBLIC') as grantee
       from pg_proc p, aclexplode(p.proacl) a
       where p.oid = '${fn}'::regprocedure and a.grantee <> p.proowner and a.privilege_type = 'EXECUTE'
       order by 1`,
    )
    expect(grantees).toEqual([{ grantee: 'authenticated' }])
  })

  it('AC-607.3 AC-607.4 my_hospital_id는 definer, touch_updated_at은 definer가 아니고 둘 다 search_path가 비어 있다', async () => {
    const fns = await rows(
      `select proname, prosecdef, proconfig from pg_proc
       where pronamespace = 'public'::regnamespace and proname in ('my_hospital_id', 'touch_updated_at')
       order by proname`,
    )
    expect(fns).toEqual([
      { proname: 'my_hospital_id', prosecdef: true, proconfig: ['search_path=""'] },
      { proname: 'touch_updated_at', prosecdef: false, proconfig: ['search_path=""'] },
    ])
  })
})

describe('AC-607.4 두 번 실행하거나 다른 브랜치 함수가 먼저 있어도 깨지지 않는다', SLOW, () => {
  it('AC-607.4 공용 함수 두 개가 C1 글자 그대로 있다', () => {
    expect(PATIENTS_MIGRATION).toContain(C1_MY_HOSPITAL_ID)
    expect(PATIENTS_MIGRATION).toContain(C1_TOUCH_UPDATED_AT)
  })

  it('AC-607.4 AC-607.5 두 번 실행해도 되는 문장만 쓴다(정책·트리거는 표마다 하나)', () => {
    const sql = PATIENTS_MIGRATION.replace(/--.*$/gm, '') // 주석을 뺀 SQL만 본다
    const count = (pattern: RegExp) => (sql.match(pattern) ?? []).length
    expect(sql).not.toMatch(/create\s+function/i)
    expect(sql).not.toMatch(/create\s+table\s+(?!if\s+not\s+exists)/i)
    expect(count(/create\s+policy/gi)).toBe(2)
    expect(count(/drop\s+policy\s+if\s+exists/gi)).toBe(2)
    expect(count(/create\s+trigger/gi)).toBe(2)
    expect(count(/drop\s+trigger\s+if\s+exists/gi)).toBe(2)
  })

  it('AC-607.4 두 번 실행해도 오류가 없고 줄·함수·정책·트리거·권한이 그대로다', async () => {
    const once = await shape(db)
    await inFreshDb([PATIENTS_MIGRATION], async (fresh) => {
      await fresh.query('insert into auth.users (id, email) values ($1, $2)', [A, EMAIL[A]])
      const [hospital] = await rows(
        `insert into public.hospitals (owner_id, name, applicant_name, email, status)
         values ($1, '가짜병원', '홍길동', $2, 'approved') returning id`,
        [A, EMAIL[A]],
        fresh,
      )
      await fresh.query(`insert into ${TEMPLATES} (hospital_id, kind, name, body) values ($1, 'injection', '이름', '글')`, [hospital.id])
      await fresh.query(`insert into ${COUNTS} (hospital_id, followup_left, injection_left) values ($1, 1, 2)`, [hospital.id])

      await fresh.exec(PATIENTS_MIGRATION)

      expect(await shape(fresh)).toEqual(once)
      expect(await rows(`select name from ${TEMPLATES}`, [], fresh)).toEqual([{ name: '이름' }])
      expect(await rows(`select followup_left, injection_left from ${COUNTS}`, [], fresh)).toEqual([
        { followup_left: 1, injection_left: 2 },
      ])
    })
  })

  it('AC-607.4 다른 브랜치가 C1 함수를 먼저 만든 DB에서 실행해도 오류가 없고 함수 몸통이 같다', async () => {
    const once = await shape(db)
    await inFreshDb([C1_MY_HOSPITAL_ID, C1_TOUCH_UPDATED_AT, PATIENTS_MIGRATION], async (fresh) => {
      expect(await shape(fresh)).toEqual(once)
    })
  })

  it('AC-607.4 이 migration 뒤에 다른 브랜치가 C1 함수를 다시 만들어도 오류가 없고 함수 몸통이 같다', async () => {
    const once = await shape(db)
    await inFreshDb([PATIENTS_MIGRATION, C1_MY_HOSPITAL_ID, C1_TOUCH_UPDATED_AT], async (fresh) => {
      expect(await shape(fresh)).toEqual(once)
    })
  })
})

describe('AC-607.5 라이브 precheck migration이 두 표를 먼저 만든 DB에 붙여도 두 표가 그대로다', SLOW, () => {
  const LIVE = [PRECHECK_SETTINGS_MIGRATION, PRECHECK_COUNTS_MIGRATION]
  const MINE = /^\(hospital_id = \( SELECT (public\.)?my_hospital_id\(\)/
  let beforePatients: Awaited<ReturnType<typeof tableShape>>
  let onTop: PGlite

  beforeAll(async () => {
    // 이 migration 전: auth → precheck_settings → precheck_counts
    await inFreshDb(LIVE, async (live) => {
      beforePatients = await tableShape(live)
    })
    // 운영 차례: auth → precheck_settings → precheck_counts → 이 migration
    onTop = await freshDb([...LIVE, PATIENTS_MIGRATION])
  }, 60_000)

  afterAll(async () => {
    if (onTop) await onTop.close()
  })

  it('AC-607.5 오류 없이 붙고 두 표의 칸·제약·표와 칸 권한·RLS·정책·트리거가 이 migration 전과 같다', async () => {
    expect(await tableShape(onTop)).toEqual(beforePatients)
  })

  it('AC-607.5 정책·트리거는 표마다 하나이고 precheck와 같은 이름·글이다', async () => {
    const { policies, triggers } = await shape(onTop)
    expect(policies).toEqual(
      ['contact_counts', 'message_templates'].map((tablename) => ({
        tablename,
        policyname: '승인된 내 병원 줄만',
        cmd: 'ALL',
        roles: ['authenticated'],
        qual: expect.stringMatching(MINE),
        with_check: expect.stringMatching(MINE),
      })),
    )
    expect(triggers).toEqual(
      ['contact_counts', 'message_templates'].map((table) => ({
        table_name: table,
        tgname: `${table}_touch`,
        def: expect.stringMatching(
          new RegExp(`^CREATE TRIGGER ${table}_touch BEFORE UPDATE ON public\\.${table} FOR EACH ROW EXECUTE FUNCTION (public\\.)?touch_updated_at\\(\\)$`),
        ),
      })),
    )
  })

  it('AC-607.5 공용 함수 둘은 precheck 글을 덮어 C1 글이 된다(touch_updated_at은 definer가 아니다)', async () => {
    const functions = await functionBodies(onTop)
    expect(functions).toEqual(await functionBodies(db))
    expect(functions.map(({ proname, prosecdef }) => ({ proname, prosecdef }))).toEqual([
      { proname: 'my_hospital_id', prosecdef: true },
      { proname: 'touch_updated_at', prosecdef: false },
    ])
  })

  it('AC-607.5 auth 다음에 이 migration만 실행해도 같은 칸·제약·권한·RLS·정책·트리거가 생긴다', async () => {
    expect(await tableShape(db)).toEqual(beforePatients)
  })

  // C1 touch_updated_at은 definer가 아니다(invoker). 라이브 표(claim_rule_settings)의 트리거도 그대로 도는지 본다
  it('AC-607.5 라이브 위에서도 anon은 못 읽고 승인 대기 병원은 줄이 안 보이며, 승인된 A는 자기 줄만 보고 고치면 바뀐 시각이 바뀐다', async () => {
    const RULES = 'public.claim_rule_settings'
    const hospital: Record<string, string> = {}
    await operator(onTop)
    for (const [user, status, label] of [
      [A, 'approved', 'A 문구'],
      [B, 'approved', 'B 문구'],
      [C, 'pending', 'C 문구'],
    ]) {
      await onTop.query('insert into auth.users (id, email) values ($1, $2)', [user, EMAIL[user]])
      const [row] = await rows(
        `insert into public.hospitals (owner_id, name, applicant_name, email, status)
         values ($1, '가짜병원', '홍길동', $2, $3) returning id`,
        [user, EMAIL[user], status],
        onTop,
      )
      hospital[user] = row.id as string
      await onTop.query(
        `insert into ${TEMPLATES} (hospital_id, kind, name, body, updated_at) values ($1, 'injection', $2, '내일 오세요', $3)`,
        [row.id, label, LONG_AGO],
      )
      await onTop.query(`insert into ${COUNTS} (hospital_id, followup_left, injection_left, updated_at) values ($1, 1, 2, $2)`, [
        row.id,
        LONG_AGO,
      ])
      await onTop.query(`insert into ${RULES} (hospital_id, rule_id, enabled, updated_at) values ($1, 'AB-01', true, $2)`, [
        row.id,
        LONG_AGO,
      ])
    }
    const movedSince = async (table: string) => {
      await operator(onTop)
      return rows(`select updated_at > $1::timestamptz as moved from ${table} where hospital_id = $2`, [LONG_AGO, hospital[A]], onTop)
    }
    try {
      await becomeAnon(onTop)
      for (const table of [TEMPLATES, COUNTS]) {
        await expect(onTop.query(`select * from ${table}`)).rejects.toThrow(DENIED)
      }

      await become(C, onTop)
      expect(await rows(`select id from ${TEMPLATES}`, [], onTop)).toEqual([])
      expect(await rows(`select hospital_id from ${COUNTS}`, [], onTop)).toEqual([])

      await become(A, onTop)
      expect(await rows(`select hospital_id, name from ${TEMPLATES}`, [], onTop)).toEqual([
        { hospital_id: hospital[A], name: 'A 문구' },
      ])
      expect(await rows(`select hospital_id from ${COUNTS}`, [], onTop)).toEqual([{ hospital_id: hospital[A] }])

      expect(await rows(`update ${TEMPLATES} set name = '바꿈' returning hospital_id`, [], onTop)).toEqual([
        { hospital_id: hospital[A] },
      ])
      expect(await movedSince(TEMPLATES)).toEqual([{ moved: true }])

      await become(A, onTop)
      expect(await rows(`update ${RULES} set enabled = false returning hospital_id`, [], onTop)).toEqual([
        { hospital_id: hospital[A] },
      ])
      expect(await movedSince(RULES)).toEqual([{ moved: true }])
    } finally {
      await operator(onTop)
    }
  })
})

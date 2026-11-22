import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

// 관리자 여럿 · 주 관리자 · 관리자만 보는 탭 DB (multi-admin REQ-7701·REQ-7705, design.md 'DB'·'시험 계획').
// setup-sql.test.ts·desk.rls.test.ts와 같은 방법: 진짜 Postgres(PGlite, WASM)에서 운영자가 붙일 파일을 그대로 돌린다 —
// 20261028000000_auth.sql → 사용자·병원·admins(주 관리자 후보 하나) → 이 파일 → 이 파일(두 번).
// 실제 Supabase에는 붙지 않는다. Supabase가 미리 갖춘 것만 흉내 낸다(auth.users에는 이 SQL이 보는 email·raw_app_meta_data).
// 데스크 migration은 돌리지 않는다(데스크도 '로그인한 사람'이라 병원 줄 없는 사용자 N으로 본다). 메일·병원 이름은 모두 지어낸 것이다
const fileOf = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))
const read = (rel: string) => readFileSync(fileOf(rel), 'utf-8')
const AUTH = read('./migrations/20261028000000_auth.sql')
const MULTI_ADMIN_PATH = fileOf('./migrations/20261122000000_multi_admin.sql')
// 파일이 아직 없으면 빈 글자로 돌아, 시험마다 '함수·칸·표가 없다'로 실패한다(무엇이 빠졌는지 시험별로 보인다)
const MULTI_ADMIN = existsSync(MULTI_ADMIN_PATH) ? readFileSync(MULTI_ADMIN_PATH, 'utf-8') : ''

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
  create table auth.users (
    id uuid primary key,
    email text,
    raw_app_meta_data jsonb not null default '{}',
    email_confirmed_at timestamptz
  );
  create function auth.jwt() returns jsonb language sql stable
    as $$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
`

type Provider = 'email' | 'google'
type Status = 'approved' | 'pending' | 'rejected'
type Account = { id: string; email: string; provider: Provider; status: Status | null; admin: boolean; name: string }
type Row = Record<string, unknown>

const A = '00000000-0000-4000-8000-0000000000a1' // 주 관리자 후보: 구글 · 메일 앞부분에 e2e- 없음 · 관리자. 승인된 병원 HA
const B = '00000000-0000-4000-8000-0000000000b1' // 구글로 들어왔지만 관리자 아님. 승인된 병원 HB
const C = '00000000-0000-4000-8000-0000000000c1' // 대기 병원 HC 주인(관리자 아님)
const D = '00000000-0000-4000-8000-0000000000d1' // 이메일로 만든 관리자. 승인된 병원 HD
const R = '00000000-0000-4000-8000-0000000000e1' // 시험 관리자(구글, 메일 앞부분 e2e-). 거절 병원 HR(주인이 관리자여도)
const E = '00000000-0000-4000-8000-0000000000f1' // 병원 줄 없는 관리자(이메일)
const N = '00000000-0000-4000-8000-0000000000f2' // 병원 줄 없는 사용자(데스크 자리)
const NOWHERE = '00000000-0000-4000-8000-000000000999' // 없는 병원 id

const ACCOUNTS: readonly Account[] = [
  { id: A, email: 'owner@fake.test', provider: 'google', status: 'approved', admin: true, name: '가짜병원에이' },
  { id: B, email: 'b-clinic@fake.test', provider: 'google', status: 'approved', admin: false, name: '가짜병원비' },
  { id: C, email: 'c-clinic@fake.test', provider: 'email', status: 'pending', admin: false, name: '가짜병원씨' },
  { id: D, email: 'd-clinic@fake.test', provider: 'email', status: 'approved', admin: true, name: '가짜병원디' },
  { id: R, email: 'tester+e2e-admin@fake.test', provider: 'google', status: 'rejected', admin: true, name: 'E2E 거절 의원' },
  { id: E, email: 'e-admin@fake.test', provider: 'email', status: null, admin: true, name: '' },
  { id: N, email: 'n-user@fake.test', provider: 'email', status: null, admin: false, name: '' },
]
const emailOf = (user: string) => ACCOUNTS.find((a) => a.id === user)!.email

// 지금 탭 12개(menu.ts MENU 차례, 대시보드·설정 뺌)
const TABS = [
  '/stats',
  '/claim',
  '/notices',
  '/patients',
  '/worklog',
  '/sunap',
  '/calendar',
  '/ai-report',
  '/forms',
  '/staff',
  '/inventory',
  '/contacts',
] as const
const NEW_FUNCTIONS = ['public.admin_hospitals()', 'public.set_admin(uuid, boolean)', 'public.set_tab_access(text[], text[])']
const OWNER_FAIL_0 = [/주 관리자/, /0개예요/, /아무것도 바꾸지 않았어요/, /Claude에게 알려 주세요/]
const OWNER_FAIL_2 = [/주 관리자/, /2개 이상이에요/, /아무것도 바꾸지 않았어요/, /Claude에게 알려 주세요/]

const SLOW = { timeout: 60_000 }
const DENIED = { code: '42501' } // 권한 없음
const NOT_ALLOWED = { code: '22023' } // 인자가 틀림
const UNIQUE_FAILED = { code: '23505' }
const CHECK_FAILED = { code: '23514' }

let db: PGlite
let hospital: Record<string, string> = {}
// 이 파일을 돌리기 전·두 번 돌린 뒤의 hospitals·admins 모양(칸·제약·색인·권한·정책·트리거)과 set_hospital_status
let shapeBefore: Row
let shapeAfter: Row

async function operator(target: PGlite = db) {
  await target.exec('reset role; reset request.jwt.claims')
}

/** 그 사용자로 로그인한 것처럼(JWT의 sub·email) */
async function become(user: string) {
  await operator()
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: user, email: emailOf(user) })])
  await db.exec('set role authenticated')
}

async function becomeAnon() {
  await operator()
  await db.exec('set role anon')
}

async function rows(sql: string, params: unknown[] = [], target: PGlite = db) {
  return (await target.query<Row>(sql, params)).rows
}

/** 운영자(superuser)가 사용자·병원·관리자 줄을 넣는다. 병원 id를 돌려준다 */
async function seed(target: PGlite, accounts: readonly Account[]) {
  await operator(target)
  const ids: Record<string, string> = {}
  for (const a of accounts) {
    await target.query(
      `insert into auth.users (id, email, raw_app_meta_data, email_confirmed_at) values ($1, $2, $3, now())`,
      [a.id, a.email, JSON.stringify({ provider: a.provider, providers: [a.provider] })],
    )
  }
  for (const a of accounts) {
    if (a.status === null) continue
    const [row] = await rows(
      `insert into public.hospitals (owner_id, name, applicant_name, phone, email, status, reviewed_at)
       values ($1, $2, '홍길동', '01012345678', $3, $4, case when $4 = 'pending' then null else now() end) returning id`,
      [a.id, a.name, a.email, a.status],
      target,
    )
    ids[a.id] = row.id as string
  }
  for (const a of accounts) {
    if (a.admin) await target.query('insert into public.admins (user_id) values ($1)', [a.id])
  }
  return ids
}

/** 운영자가 이 파일 전체를 SQL Editor에 붙여 Run 한 것과 같다 */
async function runFile(target: PGlite = db) {
  await operator(target)
  await target.exec(MULTI_ADMIN)
}

/** 운영자 눈으로 본 모든 줄(바뀌지 않았는지 견줄 때). tab_access가 아직 없으면 null */
async function dataNow(target: PGlite = db) {
  await operator(target)
  const [{ has }] = await rows(`select to_regclass('public.tab_access') is not null as has`, [], target)
  return {
    hospitals: await rows('select * from public.hospitals order by owner_id', [], target),
    admins: await rows('select * from public.admins order by user_id', [], target),
    tabs: has ? await rows('select * from public.tab_access order by path', [], target) : null,
  }
}

/** 운영자 눈으로 본 관리자 줄: [user_id, is_owner] (is_owner 칸이 없으면 user_id만) */
async function adminsNow() {
  await operator()
  return (await rows('select to_jsonb(a) as r from public.admins a order by user_id')).map((x) => {
    const r = x.r as Row
    return 'is_owner' in r ? [r.user_id, r.is_owner] : [r.user_id]
  })
}

async function tabsNow() {
  await operator()
  return rows('select path, admin_only from public.tab_access order by path')
}

/** 시험마다 처음 상태: 줄을 모두 비우고 다시 심은 뒤 이 파일을 두 번 돌린다(주 관리자 A·탭 12줄 '모두에게') */
async function resetData() {
  await operator()
  await db.exec('truncate auth.users cascade')
  await db.exec(`do $$ begin
    if to_regclass('public.tab_access') is not null then truncate public.tab_access; end if;
  end $$`)
  hospital = await seed(db, ACCOUNTS)
  await runFile()
  await runFile()
}

/** 표 하나의 모양(칸·제약·색인·권한·RLS·정책·트리거) */
async function tableShape(table: string, target: PGlite = db) {
  const reg = `public.${table}`
  return {
    columns: await rows(
      `select column_name, data_type, is_nullable, column_default from information_schema.columns
       where table_schema = 'public' and table_name = $1 order by ordinal_position`,
      [table],
      target,
    ),
    constraints: await rows(
      `select conname, contype, pg_get_constraintdef(oid) as def from pg_constraint where conrelid = to_regclass($1) order by conname`,
      [reg],
      target,
    ),
    indexes: await rows(`select indexname, indexdef from pg_indexes where schemaname = 'public' and tablename = $1 order by 1`, [table], target),
    access: await rows(
      `select c.relrowsecurity, c.relforcerowsecurity,
              (select array_agg(item::text order by item::text) from unnest(c.relacl) item) as table_acl,
              (select array_agg(a.attname || ':' || item::text order by a.attname, item::text)
                 from pg_attribute a, unnest(a.attacl) item where a.attrelid = c.oid) as column_acl
         from pg_class c where c.oid = to_regclass($1)`,
      [reg],
      target,
    ),
    policies: await rows(
      `select policyname, cmd, permissive, roles::text[] as roles, qual, with_check from pg_policies
       where schemaname = 'public' and tablename = $1 order by policyname`,
      [table],
      target,
    ),
    triggers: await rows(
      `select tgname, tgtype, tgfoid::regproc::text as fn from pg_trigger where not tgisinternal and tgrelid = to_regclass($1) order by 1`,
      [reg],
      target,
    ),
  }
}

async function catalogShape(target: PGlite = db) {
  await operator(target)
  return {
    hospitals: await tableShape('hospitals', target),
    admins: await tableShape('admins', target),
    setHospitalStatus: await rows(
      `select prosecdef, proconfig, prosrc, (select array_agg(item::text order by item::text) from unnest(proacl) item) as acl
         from pg_proc where oid = to_regprocedure('public.set_hospital_status(uuid, text)')`,
      [],
      target,
    ),
  }
}

/** 새 함수 하나의 모양(이름이 같은 함수가 하나뿐인지도 본다) */
async function functionShape(name: string) {
  await operator()
  return rows(
    `select l.lanname as lang, p.prosecdef as definer, p.proconfig as config, p.provolatile as volatility,
            pg_get_function_arguments(p.oid) as args, pg_get_function_result(p.oid) as result
       from pg_proc p join pg_language l on l.oid = p.prolang
      where p.pronamespace = 'public'::regnamespace and p.proname = $1`,
    [name],
  )
}

async function canExecute(role: string, signature: string) {
  await operator()
  const [row] = await rows(`select has_function_privilege($1, $2, 'EXECUTE') as ok`, [role, signature])
  return row.ok
}

function callSetAdmin(hospitalId: string | null, admin: boolean | null) {
  return db.query('select public.set_admin($1::uuid, $2::boolean)', [hospitalId, admin])
}

async function adminHospitals() {
  const found = await rows('select hospital_id, is_me, is_owner from public.admin_hospitals()')
  return found.sort((x, y) => String(x.hospital_id).localeCompare(String(y.hospital_id)))
}

const byId = (list: Row[]) => [...list].sort((x, y) => String(x.hospital_id).localeCompare(String(y.hospital_id)))

type Paths = readonly (string | null)[] | null
// 시험이 정한 경로 글자만 SQL 글자로 옮긴다(따옴표가 없는 값만)
const sqlArray = (paths: Paths) =>
  paths === null ? 'null::text[]' : `array[${paths.map((p) => (p === null ? 'null' : `'${p}'`)).join(', ')}]::text[]`

function callSetTabAccess(adminOnly: Paths, everyone: Paths) {
  return db.query(`select public.set_tab_access(${sqlArray(adminOnly)}, ${sqlArray(everyone)})`)
}

/** 씨앗 12줄에 바꾼 값을 덮은 기대 표 */
function expectedTabs(changes: Record<string, boolean> = {}) {
  const all: Record<string, boolean> = Object.fromEntries(TABS.map((p) => [p, false]))
  Object.assign(all, changes)
  return Object.entries(all)
    .sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))
    .map(([path, admin_only]) => ({ path, admin_only }))
}

beforeAll(async () => {
  db = await PGlite.create()
  await db.exec(SUPABASE_MOCK)
  await db.exec(AUTH)
  hospital = await seed(db, ACCOUNTS)
  shapeBefore = await catalogShape()
  // 이 파일 → 이 파일(두 번). 오류가 나면 모든 시험이 멈춘다
  await runFile()
  await runFile()
  shapeAfter = await catalogShape()
}, 120_000)

afterAll(async () => {
  await db.close()
})

beforeEach(resetData)

describe('AC-7701.1 함수 모양·실행 권한·admins·hospitals 그대로', SLOW, () => {
  it('AC-7701.1: 두 번 돌려도 오류가 없고 set_admin(p_hospital_id uuid, p_admin boolean) returns void가 plpgsql·security definer·search_path 빈 값으로 하나 있다', async () => {
    expect(await functionShape('set_admin')).toEqual([
      { lang: 'plpgsql', definer: true, config: ['search_path=""'], volatility: 'v', args: 'p_hospital_id uuid, p_admin boolean', result: 'void' },
    ])
  })

  it('AC-7701.1: admin_hospitals() returns table (hospital_id uuid, is_me boolean, is_owner boolean)가 plpgsql·security definer·search_path 빈 값으로 하나 있다', async () => {
    expect(await functionShape('admin_hospitals')).toEqual([
      {
        lang: 'plpgsql',
        definer: true,
        config: ['search_path=""'],
        volatility: 's',
        args: '',
        result: 'TABLE(hospital_id uuid, is_me boolean, is_owner boolean)',
      },
    ])
  })

  it.each(['public.set_admin(uuid, boolean)', 'public.admin_hospitals()'])(
    'AC-7701.1: %s는 public·anon이 실행할 수 없고 authenticated만 실행한다',
    async (signature) => {
      expect(await canExecute('public', signature)).toBe(false)
      expect(await canExecute('anon', signature)).toBe(false)
      expect(await canExecute('authenticated', signature)).toBe(true)
    },
  )

  it("AC-7701.1: admins 정책은 '내 관리자 줄 읽기' 하나이고, authenticated의 admins 표 권한은 select 하나, anon은 없음, 칸 권한도 없다", async () => {
    const shape = await tableShape('admins')
    expect(shape.policies).toEqual([
      {
        policyname: '내 관리자 줄 읽기',
        cmd: 'SELECT',
        permissive: 'PERMISSIVE',
        roles: ['authenticated'],
        qual: expect.stringContaining('auth.uid()'),
        with_check: null,
      },
    ])
    expect(
      await rows(
        `select grantee, privilege_type from information_schema.role_table_grants
         where table_schema = 'public' and table_name = 'admins' and grantee in ('anon', 'authenticated') order by 1, 2`,
      ),
    ).toEqual([{ grantee: 'authenticated', privilege_type: 'SELECT' }])
    expect(shape.access).toEqual([expect.objectContaining({ relrowsecurity: true, column_acl: null })])
  })

  it('AC-7701.1: hospitals 표의 칸·제약·색인·권한·RLS·정책·트리거와 set_hospital_status는 이 파일을 두 번 돌리기 전과 같다', () => {
    expect(shapeAfter.hospitals).toEqual(shapeBefore.hospitals)
    expect(shapeAfter.setHospitalStatus).toEqual(shapeBefore.setHospitalStatus)
    expect((shapeBefore.hospitals as { policies: Row[] }).policies).toHaveLength(2)
  })

  it('AC-7701.1: admins 표는 칸 is_owner와 색인 하나만 더해졌고 제약·권한·RLS·정책·트리거는 그대로다', () => {
    const before = shapeBefore.admins as Record<string, Row[]>
    const after = shapeAfter.admins as Record<string, Row[]>
    expect(after.columns).toEqual([...before.columns, expect.objectContaining({ column_name: 'is_owner' })])
    // 이름 차례: admins_one_owner < admins_pkey
    expect(after.indexes).toEqual([
      { indexname: 'admins_one_owner', indexdef: 'CREATE UNIQUE INDEX admins_one_owner ON public.admins USING btree (is_owner) WHERE is_owner' },
      ...before.indexes,
    ])
    // 새 칸의 not null은 PGlite(Postgres 18)가 제약 줄로도 적는다 — 그 한 줄만 더해진다
    const ownerNotNull = (c: Row) => c.contype === 'n' && c.def === 'NOT NULL is_owner'
    expect(after.constraints.filter(ownerNotNull)).toHaveLength(1)
    expect(after.constraints.filter((c) => !ownerNotNull(c))).toEqual(before.constraints)
    for (const key of ['access', 'policies', 'triggers']) expect(after[key], key).toEqual(before[key])
  })

  it('AC-7701.1: 어느 사용자도 admins에서 남의 줄을 읽거나 넣거나 고치거나 지울 수 없다(자기 주 관리자 표시도 못 바꾼다)', async () => {
    const before = await dataNow()
    for (const [user, own] of [
      [A, [{ user_id: A, is_owner: true }]],
      [D, [{ user_id: D, is_owner: false }]],
      [B, []],
      [N, []],
    ] as const) {
      await become(user)
      expect(await rows('select user_id, is_owner from public.admins'), user).toEqual(own)
      await expect(db.query('insert into public.admins (user_id) values ($1)', [N]), user).rejects.toMatchObject(DENIED)
      await expect(db.query('update public.admins set is_owner = true'), user).rejects.toMatchObject(DENIED)
      await expect(db.query('update public.admins set is_owner = false where user_id = $1', [user]), user).rejects.toMatchObject(DENIED)
      await expect(db.query('delete from public.admins'), user).rejects.toMatchObject(DENIED)
    }
    await becomeAnon()
    await expect(db.query('select * from public.admins')).rejects.toMatchObject(DENIED)
    expect(await dataNow()).toEqual(before)
  })
})

describe('AC-7701.2 admin_hospitals(): 주인이 관리자인 승인된 병원만, 관리자에게만', SLOW, () => {
  it('AC-7701.2: 주 관리자 A가 부르면 (HA, 나, 주 관리자)·(HD, 남, 아님) 두 줄이다(대기·거절 병원과 병원 줄 없는 관리자는 없다)', async () => {
    await become(A)
    expect(await adminHospitals()).toEqual(
      byId([
        { hospital_id: hospital[A], is_me: true, is_owner: true },
        { hospital_id: hospital[D], is_me: false, is_owner: false },
      ]),
    )
  })

  it('AC-7701.2: 다른 관리자 D가 부르면 (HA, 남, 주 관리자)·(HD, 나, 아님)이다', async () => {
    await become(D)
    expect(await adminHospitals()).toEqual(
      byId([
        { hospital_id: hospital[A], is_me: false, is_owner: true },
        { hospital_id: hospital[D], is_me: true, is_owner: false },
      ]),
    )
  })

  it('AC-7701.2: 병원 줄 없는 관리자 E가 부르면 같은 두 줄이고 내 병원은 없다', async () => {
    await become(E)
    expect(await adminHospitals()).toEqual(
      byId([
        { hospital_id: hospital[A], is_me: false, is_owner: true },
        { hospital_id: hospital[D], is_me: false, is_owner: false },
      ]),
    )
  })

  it.each([
    ['승인된 원장 B', B],
    ['대기 병원 주인 C', C],
    ['병원 줄 없는 사용자 N', N],
  ])('AC-7701.2: 관리자가 아닌 %s가 부르면 42501이다', async (_, user) => {
    await become(user)
    await expect(db.query('select * from public.admin_hospitals()')).rejects.toMatchObject(DENIED)
  })

  it('AC-7701.2: anon이 부르면 권한 오류(42501)다', async () => {
    await becomeAnon()
    await expect(db.query('select * from public.admin_hospitals()')).rejects.toMatchObject(DENIED)
  })
})

describe('AC-7701.3 set_admin: 정하기·빼기, 두 번 불러도 같음', SLOW, () => {
  it('AC-7701.3: A가 set_admin(HB, true)를 부르면 B 줄(is_owner 거짓)이 생기고, 한 번 더 불러도 오류 없이 한 줄이다. hospitals와 다른 관리자 줄은 그대로다', async () => {
    const before = await dataNow()
    await become(A)
    await callSetAdmin(hospital[B], true)
    await callSetAdmin(hospital[B], true)
    const after = await dataNow()
    expect(after.hospitals).toEqual(before.hospitals)
    expect(after.admins.filter((r) => r.user_id !== B)).toEqual(before.admins)
    expect(after.admins.filter((r) => r.user_id === B)).toEqual([{ user_id: B, is_owner: false, created_at: expect.any(Date) }])
  })

  it('AC-7701.3: set_admin(HB, false)면 B 줄이 없어지고, 한 번 더 불러도(이미 없음) 오류가 없다. hospitals와 다른 관리자 줄은 그대로다', async () => {
    await become(A)
    await callSetAdmin(hospital[B], true)
    const before = await dataNow()
    await become(A)
    await callSetAdmin(hospital[B], false)
    await callSetAdmin(hospital[B], false)
    const after = await dataNow()
    expect(after.hospitals).toEqual(before.hospitals)
    expect(after.admins).toEqual(before.admins.filter((r) => r.user_id !== B))
  })

  it('AC-7701.3: 주 관리자가 아닌 관리자 D도 정하고 뺀다(관리자 누구나)', async () => {
    // id 차례: A < B < D < R < E
    await become(D)
    await callSetAdmin(hospital[B], true)
    expect(await adminsNow()).toEqual([
      [A, true],
      [B, false],
      [D, false],
      [R, false],
      [E, false],
    ])
    await become(D)
    await callSetAdmin(hospital[B], false)
    expect(await adminsNow()).toEqual([
      [A, true],
      [D, false],
      [R, false],
      [E, false],
    ])
  })

  it('AC-7701.3: set_admin은 부른 사람의 관리자 줄을 for update로 잠그며 본다(같은 때 서로 빼도 한쪽만 — PGlite는 연결이 하나라 글자로 본다)', async () => {
    await operator()
    const [row] = await rows(`select prosrc from pg_proc where oid = to_regprocedure('public.set_admin(uuid, boolean)')`)
    expect(String(row?.prosrc ?? '')).toMatch(/from public\.admins a where a\.user_id = \(select auth\.uid\(\)\) for update/)
  })
})

describe('AC-7701.4 set_admin 거부: 오류이고 admins·hospitals 그대로', SLOW, () => {
  it.each([
    ['승인된 원장 B', B],
    ['대기 병원 주인 C', C],
    ['병원 줄 없는 사용자 N', N],
  ])('AC-7701.4: 관리자가 아닌 %s는 42501이다(인자가 틀려도 이것이 먼저)', async (_, user) => {
    const before = await dataNow()
    await become(user)
    for (const [id, admin] of [
      [hospital[B], true],
      [hospital[D], false],
      [hospital[A], false],
      [hospital[C], true],
      [NOWHERE, true],
      [null, true],
      [hospital[B], null],
    ] as const) {
      await expect(callSetAdmin(id, admin), `${id} ${admin}`).rejects.toMatchObject(DENIED)
    }
    expect(await dataNow()).toEqual(before)
  })

  it('AC-7701.4: anon은 권한 오류(42501)다', async () => {
    const before = await dataNow()
    await becomeAnon()
    await expect(callSetAdmin(hospital[B], true)).rejects.toMatchObject(DENIED)
    await expect(callSetAdmin(hospital[D], false)).rejects.toMatchObject(DENIED)
    expect(await dataNow()).toEqual(before)
  })

  it('AC-7701.4: 관리자가 자기 병원으로 true·false(A의 HA, D의 HD)는 22023이다', async () => {
    const before = await dataNow()
    for (const user of [A, D]) {
      for (const admin of [true, false]) {
        await become(user)
        await expect(callSetAdmin(hospital[user], admin), `${user} ${admin}`).rejects.toMatchObject(NOT_ALLOWED)
      }
    }
    expect(await dataNow()).toEqual(before)
  })

  it('AC-7701.4: 다른 관리자 D가 주 관리자 병원 HA로 true·false는 22023이다(주 관리자는 아무도 못 뺀다)', async () => {
    const before = await dataNow()
    for (const admin of [true, false]) {
      await become(D)
      await expect(callSetAdmin(hospital[A], admin), String(admin)).rejects.toMatchObject(NOT_ALLOWED)
    }
    expect(await dataNow()).toEqual(before)
  })

  it('AC-7701.4: 대기·거절 병원·없는 병원 id·null 병원 id·null 참거짓은 22023이다(A·D 모두)', async () => {
    const before = await dataNow()
    for (const user of [A, D]) {
      for (const [id, admin] of [
        [hospital[C], true],
        [hospital[C], false],
        [hospital[R], true],
        [hospital[R], false],
        [NOWHERE, true],
        [NOWHERE, false],
        [null, true],
        [null, false],
        [hospital[B], null],
      ] as const) {
        await become(user)
        await expect(callSetAdmin(id, admin), `${user} ${id} ${admin}`).rejects.toMatchObject(NOT_ALLOWED)
      }
    }
    expect(await dataNow()).toEqual(before)
  })
})

describe('AC-7701.5 정한 뒤·뺀 뒤 B', SLOW, () => {
  it('AC-7701.5: A가 B를 정하면 B는 모든 병원 줄을 읽고 승인하고 admin_hospitals·set_admin을 쓴다. 뺀 뒤에는 내 병원 줄만이고 모두 42501이다(42P17 없음)', async () => {
    await become(A)
    await callSetAdmin(hospital[B], true)

    await become(B)
    const all = Object.values(hospital).sort()
    expect((await rows('select id from public.hospitals order by id')).map((r) => r.id)).toEqual(all)
    expect(await rows('select user_id, is_owner from public.admins')).toEqual([{ user_id: B, is_owner: false }])
    await db.query(`select public.set_hospital_status($1, 'approved')`, [hospital[C]])
    expect(await adminHospitals()).toEqual(
      byId([
        { hospital_id: hospital[A], is_me: false, is_owner: true },
        { hospital_id: hospital[B], is_me: true, is_owner: false },
        { hospital_id: hospital[D], is_me: false, is_owner: false },
      ]),
    )
    // 방금 승인한 다른 병원 HC 주인을 정하고 뺀다
    await callSetAdmin(hospital[C], true)
    expect((await adminsNow()).map(([id]) => id)).toContain(C)
    await become(B)
    await callSetAdmin(hospital[C], false)
    expect((await adminsNow()).map(([id]) => id)).not.toContain(C)
    // 자기 병원 HB와 주 관리자 병원 HA는 22023
    for (const [id, admin] of [
      [hospital[B], true],
      [hospital[B], false],
      [hospital[A], true],
      [hospital[A], false],
    ] as const) {
      await become(B)
      await expect(callSetAdmin(id, admin), `${id} ${admin}`).rejects.toMatchObject(NOT_ALLOWED)
    }

    await become(A)
    await callSetAdmin(hospital[B], false)

    await become(B)
    expect((await rows('select id from public.hospitals')).map((r) => r.id)).toEqual([hospital[B]])
    expect(await rows('select user_id from public.admins')).toEqual([])
    await expect(db.query(`select public.set_hospital_status($1, 'pending')`, [hospital[R]])).rejects.toMatchObject(DENIED)
    await expect(db.query('select * from public.admin_hospitals()')).rejects.toMatchObject(DENIED)
    await expect(callSetAdmin(hospital[D], false)).rejects.toMatchObject(DENIED)
    expect((await adminsNow()).map(([id]) => id)).toEqual([A, D, R, E].sort())
  })
})

describe('AC-7705.1 주 관리자 표시 is_owner', SLOW, () => {
  it('AC-7705.1: admins.is_owner는 boolean not null default false이다', async () => {
    expect(
      await rows(
        `select data_type, is_nullable, column_default from information_schema.columns
         where table_schema = 'public' and table_name = 'admins' and column_name = 'is_owner'`,
      ),
    ).toEqual([{ data_type: 'boolean', is_nullable: 'NO', column_default: 'false' }])
  })

  it('AC-7705.1: 구글·e2e- 없음·관리자인 A 줄만 참이다(시험 관리자 R·이메일 관리자 D·E는 거짓, 구글이지만 관리자 아닌 B는 줄 없음)', async () => {
    expect(await adminsNow()).toEqual([
      [A, true],
      [D, false],
      [R, false],
      [E, false],
    ])
  })

  it('AC-7705.1: 참인 줄을 하나 더 만들면(SQL 편집기로) 유일 위반(23505)이다', async () => {
    await operator()
    await expect(db.query('update public.admins set is_owner = true where user_id = $1', [D])).rejects.toMatchObject(UNIQUE_FAILED)
    await expect(db.query('insert into public.admins (user_id, is_owner) values ($1, true)', [B])).rejects.toMatchObject(UNIQUE_FAILED)
    expect((await adminsNow()).filter(([, owner]) => owner)).toEqual([[A, true]])
  })

  it('AC-7705.1: 다시 돌리면(그 사이 구글 계정 B를 관리자로 더 정했어도) 오류 없이 주 관리자·admins 줄·병원 줄이 그대로다', async () => {
    await become(A)
    await callSetAdmin(hospital[B], true)
    const before = await dataNow()
    expect(before.admins.filter((r) => r.user_id === B)).toHaveLength(1)
    await runFile()
    await runFile()
    expect(await dataNow()).toEqual(before)
    expect((await adminsNow()).filter(([, owner]) => owner)).toEqual([[A, true]])
  })
})

describe('AC-7705.2 주 관리자 후보가 0개·2개 이상이면 아무것도 바꾸지 않고 멈춘다(새 PGlite)', SLOW, () => {
  let fresh: PGlite

  beforeAll(async () => {
    fresh = await PGlite.create()
    await fresh.exec(SUPABASE_MOCK)
    await fresh.exec(AUTH)
  }, 120_000)

  afterAll(async () => {
    await fresh.close()
  })

  async function expectStopsWithoutChange(accounts: readonly Account[], messages: RegExp[]) {
    await operator(fresh)
    await fresh.exec('truncate auth.users cascade')
    await seed(fresh, accounts)
    const before = await dataNow(fresh)
    const error = await fresh.exec(MULTI_ADMIN).then(
      () => null,
      (e: unknown) => e as Error,
    )
    expect(error, '오류로 멈춰야 한다').toBeInstanceOf(Error)
    for (const m of messages) expect(error!.message).toMatch(m)
    expect(error!.message).not.toContain('@')
    await operator(fresh)
    expect(await dataNow(fresh)).toEqual(before)
    expect(
      (
        await rows(
          `select column_name from information_schema.columns where table_schema = 'public' and table_name = 'admins' order by ordinal_position`,
          [],
          fresh,
        )
      ).map((r) => r.column_name),
    ).toEqual(['user_id', 'created_at'])
    expect(await rows(`select indexname from pg_indexes where schemaname = 'public' and tablename = 'admins'`, [], fresh)).toEqual([
      { indexname: 'admins_pkey' },
    ])
    expect(await rows(`select to_regclass('public.tab_access') as t`, [], fresh)).toEqual([{ t: null }])
    for (const fn of NEW_FUNCTIONS) {
      expect(await rows(`select to_regprocedure($1) as f`, [fn], fresh), fn).toEqual([{ f: null }])
    }
  }

  it('AC-7705.2: 후보가 0개(구글 관리자가 시험 계정뿐, 운영자는 관리자가 아님)면 0개예요 오류이고 칸·표·함수 셋이 없고 admins 그대로다', async () => {
    await expectStopsWithoutChange(
      ACCOUNTS.map((a) => (a.id === A ? { ...a, admin: false } : a)),
      OWNER_FAIL_0,
    )
  })

  it('AC-7705.2: 후보가 2개(구글·e2e- 없음·관리자인 A와 B)면 2개 이상이에요 오류이고 칸·표·함수 셋이 없고 admins 그대로다', async () => {
    await expectStopsWithoutChange(
      ACCOUNTS.map((a) => (a.id === B ? { ...a, admin: true } : a)),
      OWNER_FAIL_2,
    )
  })

  it('AC-7705.2: 시험 계정 표시는 메일 앞부분만 본다 — 대문자 E2E-도 시험 계정이고, 도메인의 e2e-는 시험 계정이 아니다', async () => {
    // 운영자 A 대신: 앞부분 대문자 E2E- 구글 관리자(빠짐) + 도메인에만 e2e-가 있는 구글 관리자(후보) → 후보 하나라 멈추지 않는다
    const others = ACCOUNTS.filter((a) => a.id !== A)
    const upper: Account = { ...ACCOUNTS[0], id: '00000000-0000-4000-8000-0000000000a8', email: 'Tester+E2E-Admin2@fake.test', status: null }
    const domain: Account = { ...ACCOUNTS[0], id: '00000000-0000-4000-8000-0000000000a9', email: 'real@e2e-fake.test', status: null }
    await expectStopsWithoutChange([...others, upper], OWNER_FAIL_0)
    await expectStopsWithoutChange([...others, upper, domain, ACCOUNTS[0]], OWNER_FAIL_2)
  })
})

describe('AC-7705.3 tab_access 표: 칸·제약·RLS·씨앗 12줄·읽기·쓰기 막힘', SLOW, () => {
  it('AC-7705.3: 칸은 path text(기본 키)·admin_only boolean not null 둘이고 RLS가 켜져 있다', async () => {
    const shape = await tableShape('tab_access')
    expect(shape.columns).toEqual([
      { column_name: 'path', data_type: 'text', is_nullable: 'NO', column_default: null },
      { column_name: 'admin_only', data_type: 'boolean', is_nullable: 'NO', column_default: null },
    ])
    expect(shape.constraints.filter((c) => c.contype === 'p')).toEqual([expect.objectContaining({ def: 'PRIMARY KEY (path)' })])
    expect(shape.access).toEqual([expect.objectContaining({ relrowsecurity: true })])
  })

  it.each(['stats', '/Stats', '/', '/1st', '/a_b', '/a/b', '/claim/setup', '/stats ', '', '/dashboard', '/settings', '/admin'])(
    'AC-7705.3: 경로 %j는 넣을 수 없다(모양 ^/[a-z][a-z0-9-]*$, 대시보드·설정·가입 승인 빼고)',
    async (path) => {
      await operator()
      await expect(db.query('insert into public.tab_access (path, admin_only) values ($1, true)', [path])).rejects.toMatchObject(
        CHECK_FAILED,
      )
    },
  )

  it('AC-7705.3: 모양이 맞는 새 탭 경로(/new-tab·/x1)는 넣을 수 있다(DB는 탭 이름 목록을 모른다)', async () => {
    await operator()
    await db.query(`insert into public.tab_access (path, admin_only) values ('/new-tab', true), ('/x1', false)`)
    expect(await tabsNow()).toEqual(expectedTabs({ '/new-tab': true, '/x1': false }))
  })

  it('AC-7705.3: 지금 탭 12개가 모두 admin_only 거짓으로 들어 있다', async () => {
    expect(await tabsNow()).toEqual(expectedTabs())
    expect(await tabsNow()).toHaveLength(12)
  })

  it('AC-7705.3: 다시 돌려도 그 사이 바꾼 줄(관리자만으로 바꾼 탭·새 탭 줄)은 그대로다', async () => {
    await become(A)
    await callSetTabAccess(['/staff', '/new-tab'], ['/claim'])
    await operator()
    await db.query(`update public.tab_access set admin_only = true where path = '/inventory'`)
    const before = await tabsNow()
    await runFile()
    await runFile()
    expect(await tabsNow()).toEqual(before)
    expect(before).toEqual(expectedTabs({ '/staff': true, '/new-tab': true, '/inventory': true }))
  })

  it.each([
    ['주 관리자 A', A],
    ['다른 관리자 D', D],
    ['승인된 원장 B', B],
    ['대기 병원 주인 C', C],
    ['병원 줄 없는 사용자(데스크 자리) N', N],
  ])('AC-7705.3: 로그인한 %s는 모든 줄을 읽는다', async (_, user) => {
    await become(user)
    expect(await rows('select path, admin_only from public.tab_access order by path')).toEqual(expectedTabs())
  })

  it('AC-7705.3: anon은 읽지 못한다(42501)', async () => {
    await becomeAnon()
    await expect(db.query('select * from public.tab_access')).rejects.toMatchObject(DENIED)
  })

  it.each([
    ['주 관리자 A', A],
    ['승인된 원장 B', B],
    ['병원 줄 없는 사용자 N', N],
  ])('AC-7705.3: %s도 표에 바로 넣거나 고치거나 지우지 못한다(42501, 표 그대로)', async (_, user) => {
    const before = await tabsNow()
    await become(user)
    await expect(db.query(`insert into public.tab_access (path, admin_only) values ('/new-tab', true)`)).rejects.toMatchObject(DENIED)
    await expect(db.query(`update public.tab_access set admin_only = true`)).rejects.toMatchObject(DENIED)
    await expect(db.query(`delete from public.tab_access`)).rejects.toMatchObject(DENIED)
    await becomeAnon()
    await expect(db.query(`update public.tab_access set admin_only = true`)).rejects.toMatchObject(DENIED)
    expect(await tabsNow()).toEqual(before)
  })

  it("AC-7705.3: authenticated 표 권한은 select 하나, anon은 없음, 정책은 로그인한 사람 모두 읽기 하나다", async () => {
    expect(
      await rows(
        `select grantee, privilege_type from information_schema.role_table_grants
         where table_schema = 'public' and table_name = 'tab_access' and grantee in ('anon', 'authenticated') order by 1, 2`,
      ),
    ).toEqual([{ grantee: 'authenticated', privilege_type: 'SELECT' }])
    const shape = await tableShape('tab_access')
    expect(shape.policies).toEqual([
      { policyname: '로그인한 사람 모두 탭 목록 읽기', cmd: 'SELECT', permissive: 'PERMISSIVE', roles: ['authenticated'], qual: 'true', with_check: null },
    ])
    expect(shape.access).toEqual([expect.objectContaining({ column_acl: null })])
  })
})

describe('AC-7705.4 set_tab_access: 주 관리자만, 보낸 경로만 넣거나 고친다', SLOW, () => {
  it('AC-7705.4: set_tab_access(p_admin_only text[], p_everyone text[]) returns void가 plpgsql·security definer·search_path 빈 값으로 하나 있고 authenticated만 실행한다', async () => {
    expect(await functionShape('set_tab_access')).toEqual([
      { lang: 'plpgsql', definer: true, config: ['search_path=""'], volatility: 'v', args: 'p_admin_only text[], p_everyone text[]', result: 'void' },
    ])
    const signature = 'public.set_tab_access(text[], text[])'
    expect(await canExecute('public', signature)).toBe(false)
    expect(await canExecute('anon', signature)).toBe(false)
    expect(await canExecute('authenticated', signature)).toBe(true)
  })

  it('AC-7705.4: 주 관리자 A가 부르면 보낸 경로마다 넣거나 고치고(관리자만 참·모두에게 거짓) 보내지 않은 줄은 그대로이며 두 번 불러도 같다', async () => {
    await become(A)
    await callSetTabAccess(['/staff', '/inventory', '/new-tab'], ['/stats'])
    const once = await tabsNow()
    expect(once).toEqual(expectedTabs({ '/staff': true, '/inventory': true, '/new-tab': true }))
    await become(A)
    await callSetTabAccess(['/staff', '/inventory', '/new-tab'], ['/stats'])
    expect(await tabsNow()).toEqual(once)
    await become(A)
    await callSetTabAccess(['/stats'], ['/staff', '/new-tab'])
    expect(await tabsNow()).toEqual(expectedTabs({ '/stats': true, '/inventory': true, '/new-tab': false }))
    await become(A)
    await callSetTabAccess([], [])
    expect(await tabsNow()).toEqual(expectedTabs({ '/stats': true, '/inventory': true, '/new-tab': false }))
  })

  it('AC-7705.4: 12개를 한꺼번에 나눠 보내면(설정 [저장]) 그대로 들어간다', async () => {
    await become(A)
    await callSetTabAccess(['/ai-report', '/staff', '/inventory'], TABS.filter((p) => !['/ai-report', '/staff', '/inventory'].includes(p)))
    expect(await tabsNow()).toEqual(expectedTabs({ '/ai-report': true, '/staff': true, '/inventory': true }))
  })

  it.each([
    ['주 관리자가 아닌 관리자 D', D],
    ['병원 줄 없는 관리자 E', E],
    ['승인된 원장 B', B],
    ['대기 병원 주인 C', C],
    ['병원 줄 없는 사용자(데스크 자리) N', N],
  ])('AC-7705.4: %s는 42501이다(인자가 틀려도 이것이 먼저), 표 그대로', async (_, user) => {
    const before = await tabsNow()
    for (const [adminOnly, everyone] of [
      [['/staff'], ['/stats']],
      [null, null],
      [['/dashboard'], []],
      [['/staff', '/staff'], []],
    ] as const) {
      await become(user)
      await expect(callSetTabAccess(adminOnly, everyone), JSON.stringify([adminOnly, everyone])).rejects.toMatchObject(DENIED)
    }
    expect(await tabsNow()).toEqual(before)
  })

  it('AC-7705.4: anon은 권한 오류(42501)다, 표 그대로', async () => {
    const before = await tabsNow()
    await becomeAnon()
    await expect(callSetTabAccess(['/staff'], [])).rejects.toMatchObject(DENIED)
    expect(await tabsNow()).toEqual(before)
  })

  it.each([
    ['관리자만 null', null, []],
    ['모두에게 null', [], null],
    ['null 원소(관리자만)', ['/staff', null], []],
    ['null 원소(모두에게)', [], [null]],
    ['앞 / 없음', ['stats'], []],
    ['대문자', ['/Stats'], []],
    ['아래 주소', ['/claim/setup'], []],
    ['빈 글자', [''], []],
    ['밑줄', ['/a_b'], []],
    ['/dashboard', ['/dashboard'], []],
    ['/settings', [], ['/settings']],
    ['/admin', ['/admin'], []],
    ['한 배열 안 같은 경로 두 번', ['/staff', '/staff'], []],
    ['모두에게 안 같은 경로 두 번', [], ['/stats', '/stats']],
    ['두 배열에 걸쳐 같은 경로', ['/staff'], ['/staff']],
  ] as const)('AC-7705.4: 주 관리자라도 %s면 22023이고 표 그대로다', async (_, adminOnly, everyone) => {
    await become(A)
    await callSetTabAccess(['/inventory'], [])
    const before = await tabsNow()
    await become(A)
    await expect(callSetTabAccess(adminOnly, everyone)).rejects.toMatchObject(NOT_ALLOWED)
    expect(await tabsNow()).toEqual(before)
  })
})

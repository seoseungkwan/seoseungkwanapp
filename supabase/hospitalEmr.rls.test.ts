import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

// 가입 신청 줄 hospitals의 쓰는 EMR 칸 emr과 읽기 함수 my_signup_emr() (emr-signup REQ-7301, design.md 1절).
// clinicEmr.rls.test.ts와 같은 방법: 진짜 Postgres(PGlite, WASM)에서 운영자가 붙일 migration 파일을 차례로
// (auth → … → 데스크 → 병원 정보 → 병원 정보 EMR → 이 파일) 그대로 돌린다. 실제 Supabase에는 붙지 않는다.
// Supabase가 미리 갖춘 것(역할·auth·storage)만 흉내 낸다. 메일·이름은 모두 지어낸 것이다
const fileOf = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))
const read = (rel: string) => readFileSync(fileOf(rel), 'utf-8')
// 앞 migration: 운영 DB에 이미 들어간 차례(clinicEmr.rls.test.ts의 CHAIN 뒤에 병원 정보·병원 정보 EMR)
const CHAIN = [
  '20261028000000_auth.sql',
  '20261030000000_precheck_settings.sql',
  '20261101000100_worklog.sql',
  '20261101000110_worklog_bit_fields.sql',
  '20261105000200_worklog_memo_font.sql',
  '20261105000300_worklog_cash_float.sql',
  '20261105000100_stats_rx_groups.sql',
  '20261112000000_stats_rx_groups_exclude.sql',
  '20261116000000_sunap.sql',
  '20261117010000_calendar.sql',
  '20261118100000_desk_accounts.sql',
  '20261119000000_clinic_profile.sql',
  '20261119300000_clinic_emr.sql',
].map((name) => read(`./migrations/${name}`))
const EMR_PATH = fileOf('./migrations/20261119400000_hospital_emr.sql')
// 파일이 아직 없으면 빈 글자로 돌아, 시험마다 'emr 칸이 없다'로 실패한다(무엇이 빠졌는지 시험별로 보인다)
const EMR_MIGRATION = existsSync(EMR_PATH) ? readFileSync(EMR_PATH, 'utf-8') : ''
// 주석을 뺀 SQL 글자
const EMR_SQL = EMR_MIGRATION.split('\n')
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
  create table auth.users (id uuid primary key, email text, last_sign_in_at timestamptz);
  create function auth.jwt() returns jsonb language sql stable
    as $$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
`

// Supabase Storage가 갖춘 것(clinic_profile.sql이 로고 바구니·정책을 만든다)
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

const A = '00000000-0000-4000-8000-00000000000a' // 승인된 병원 A 원장
const B = '00000000-0000-4000-8000-00000000000b' // 승인된 다른 병원 B 원장
const C = '00000000-0000-4000-8000-00000000000c' // 승인 대기
const R = '00000000-0000-4000-8000-00000000000f' // 거절됨
const E = '00000000-0000-4000-8000-00000000000e' // 병원 줄도 데스크 줄도 없는 사용자(새로 가입 신청할 사람)
const K = '00000000-0000-4000-8000-0000000000d1' // A의 데스크(병원 줄 없음)
const STATUS: Record<string, 'approved' | 'pending' | 'rejected' | null> = {
  [A]: 'approved',
  [B]: 'approved',
  [C]: 'pending',
  [R]: 'rejected',
  [E]: null,
  [K]: null,
}
const DESK_EMAIL: Record<string, string> = { [K]: 'desk-a@fake.test' }
const emailOf = (user: string) => DESK_EMAIL[user] ?? `${user.slice(-1)}@fake.test`

type Row = Record<string, unknown>

const HOSPITALS = 'public.hospitals'
const EMR_KINDS = ['bit', 'uisarang', 'egis', 'other']
const SIGNUP_COLUMNS = ['applicant_name', 'emr', 'name', 'phone']

const SLOW = { timeout: 60_000 }
const DENIED = { code: '42501' } // 권한 없음
const CHECK_FAILED = { code: '23514' }

let db: PGlite
let hospital: Record<string, string> = {}

async function migrateChain(target: PGlite) {
  await target.exec(SUPABASE_MOCK)
  await target.exec(STORAGE_MOCK)
  for (const sql of CHAIN) await target.exec(sql)
}

async function operator(target: PGlite = db) {
  await target.exec('reset role; reset request.jwt.claims')
}

/** 그 사용자로 로그인한 것처럼(JWT의 sub·email) */
async function become(user: string, target: PGlite = db) {
  await operator(target)
  await target.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: user, email: emailOf(user) })])
  await target.exec('set role authenticated')
}

async function becomeAnon() {
  await operator()
  await db.exec('set role anon')
}

async function rows(sql: string, params: unknown[] = [], target: PGlite = db) {
  return (await target.query<Row>(sql, params)).rows
}

/** 사용자·병원·데스크 줄을 넣고 병원 id를 돌려준다(운영자, emr 칸 없이 — 칸이 생기기 전 DB에도 쓴다) */
async function seedPeople(target: PGlite) {
  await operator(target)
  const ids: Record<string, string> = {}
  for (const [user, status] of Object.entries(STATUS)) {
    await target.query('insert into auth.users (id, email) values ($1, $2)', [user, emailOf(user)])
    if (status === null) continue
    const [row] = await rows(
      `insert into ${HOSPITALS} (owner_id, name, applicant_name, email, status) values ($1, $2, '홍길동', $3, $4) returning id`,
      [user, `가짜병원${user.slice(-1)}`, emailOf(user), status],
      target,
    )
    ids[user] = row.id as string
  }
  await target.query(`insert into public.hospital_members (hospital_id, email) values ($1, $2)`, [ids[A], emailOf(K)])
  return ids
}

// 시험마다 빈 표에서 시작한다(병원·데스크 줄은 auth.users를 따라 함께 비워진다). 운영자(superuser)는 RLS를 건너뛴다
async function resetData() {
  await operator()
  await db.exec('truncate auth.users cascade')
  hospital = await seedPeople(db)
}

// PostgREST insert와 같은 모양: json 줄을 표 모양으로 풀어 보낸 칸만 넣는다(앱의 submitSignup)
function postgrestInsert(table: string, body: Row, target: PGlite = db) {
  const list = Object.keys(body).join(', ')
  return target.query(`insert into ${table} (${list}) select ${list} from json_populate_recordset(null::${table}, $1::json)`, [
    JSON.stringify([body]),
  ])
}

/** 운영자가 그 병원 emr을 바꾼다(가입 때 고른 것처럼) */
async function setEmr(hospitalId: string, emr: string, target: PGlite = db) {
  await operator(target)
  await target.query(`update ${HOSPITALS} set emr = $2 where id = $1`, [hospitalId, emr])
}

/** 운영자 눈으로 본 그 사용자 병원 줄 emr(줄 없으면 undefined) */
async function emrOfOwner(user: string, target: PGlite = db) {
  await operator(target)
  return (await rows(`select emr from ${HOSPITALS} where owner_id = $1`, [user], target))[0]?.emr
}

/** 지금 역할로 my_signup_emr() */
async function signupEmr(target: PGlite = db) {
  return (await rows('select public.my_signup_emr() as emr', [], target))[0].emr
}

// 이 파일이 손댈 수 있는 것 전부: public 표의 칸·제약·권한(표·칸)·트리거, 모든 정책, public 함수
async function shapeOf(target: PGlite) {
  await operator(target)
  const q = (sql: string) => rows(sql, [], target)
  return {
    columns: await q(
      `select table_name, column_name, data_type, is_nullable, column_default from information_schema.columns
       where table_schema = 'public' order by 1, ordinal_position`,
    ),
    constraints: await q(
      `select conrelid::regclass::text as tbl, conname, pg_get_constraintdef(oid) as def from pg_constraint
       where connamespace = 'public'::regnamespace order by 1, 2`,
    ),
    access: await q(
      `select c.relname, c.relrowsecurity, (select array_agg(item::text order by item::text) from unnest(c.relacl) item) as acl,
              (select array_agg(a.attname || ':' || coalesce(a.attacl::text, '') order by a.attnum) from pg_attribute a
                where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped) as columns
       from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v') order by 1`,
    ),
    policies: await q(
      `select schemaname, tablename, policyname, cmd, permissive, roles::text[] as roles, qual, with_check from pg_policies order by 1, 2, 3`,
    ),
    triggers: await q(
      `select tgrelid::regclass::text as tbl, tgname, pg_get_triggerdef(oid) as def from pg_trigger where not tgisinternal order by 1, 2`,
    ),
    functions: await q(
      `select p.oid::regprocedure::text as fn, pg_get_functiondef(p.oid) as def, p.prosecdef as definer, p.proconfig as config,
              (select array_agg(item::text order by item::text) from unnest(p.proacl) item) as acl
       from pg_proc p where p.pronamespace = 'public'::regnamespace order by 1`,
    ),
  }
}
type Shape = Awaited<ReturnType<typeof shapeOf>>

/** hospitals.emr에 딸린 것(칸·제약·칸 권한)과 my_signup_emr()을 뺀 모양 */
function withoutEmr(shape: Shape): Shape {
  return {
    ...shape,
    columns: shape.columns.filter((c) => !(c.table_name === 'hospitals' && c.column_name === 'emr')),
    constraints: shape.constraints.filter((c) => !(c.tbl === 'hospitals' && /\bemr\b/.test(String(c.def)))),
    access: shape.access.map((t) =>
      t.relname === 'hospitals' ? { ...t, columns: (t.columns as string[]).filter((col) => !col.startsWith('emr:')) } : t,
    ),
    functions: shape.functions.filter((f) => f.fn !== 'my_signup_emr()'),
  }
}

beforeAll(async () => {
  db = await PGlite.create()
  await migrateChain(db)
  await db.exec(EMR_MIGRATION)
}, 180_000)

afterAll(async () => {
  await db.close()
})

beforeEach(resetData)

describe('AC-7301.1 hospitals.emr 칸 모양·붙여 넣기', SLOW, () => {
  it('AC-7301.1: 파일이 있고 줄 끝이 LF이며, 머리 주석에 붙여 넣는 방법·먼저 들어갈 desk_accounts.sql·두 번 붙여도 된다는 말·사이트보다 먼저라는 말이 있다', () => {
    expect(EMR_MIGRATION).not.toBe('')
    expect(EMR_MIGRATION).not.toContain('\r')
    const lines = EMR_MIGRATION.split('\n')
    const head = lines.slice(0, lines.findIndex((line) => !/^(--|\s*$)/.test(line))).join('\n')
    expect(head).toContain('운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다')
    expect(head).toMatch(/먼저[^\n]*20261118100000_desk_accounts\.sql/)
    expect(head).toMatch(/두 번 붙여 넣어도/)
    expect(head).toMatch(/이 파일을 먼저 붙여 넣고 그다음 사이트에 올린다/)
    expect(head).toContain('REQ-7301')
  })

  it('AC-7301.1·AC-7301.2: 문장은 emr 칸 더하기·가입 넣기 권한·my_signup_emr 만들기·권한 거두기·authenticated에 실행 주기 다섯뿐이다', () => {
    const statements = EMR_SQL.split(';')
      .map((s) => s.trim().replace(/\s+/g, ' '))
      .filter(Boolean)
    expect(statements).toEqual([
      "alter table public.hospitals add column if not exists emr text not null default 'bit' check (emr in ('bit', 'uisarang', 'egis', 'other'))",
      'grant insert (name, applicant_name, phone, emr) on table public.hospitals to authenticated',
      "create or replace function public.my_signup_emr() returns text language sql stable security definer set search_path = '' as $$ select h.emr from public.hospitals h where h.id = public.my_clinic_hospital_id() $$",
      'revoke all on function public.my_signup_emr() from public, anon, authenticated',
      'grant execute on function public.my_signup_emr() to authenticated',
    ])
  })

  it("AC-7301.1: hospitals 맨 끝에 emr(text, 비울 수 없음, 기본 'bit')이 있고, 값 넷만 받는 제약이 하나 있다", async () => {
    const columns = await rows(
      `select column_name, udt_name, is_nullable, column_default from information_schema.columns
       where table_schema = 'public' and table_name = 'hospitals' order by ordinal_position`,
    )
    expect(columns.at(-1)).toEqual({ column_name: 'emr', udt_name: 'text', is_nullable: 'NO', column_default: "'bit'::text" })
    const checks = await rows(
      `select pg_get_constraintdef(oid) as def from pg_constraint where conrelid = to_regclass($1) and contype = 'c' and pg_get_constraintdef(oid) ~ '\\memr\\M'`,
      [HOSPITALS],
    )
    expect(checks).toHaveLength(1)
    for (const kind of EMR_KINDS) expect(checks[0].def).toContain(`'${kind}'`)
  })

  it('AC-7301.1: authenticated가 hospitals에 넣을 수 있는 칸은 정확히 name·applicant_name·phone·emr이고, 고치기 권한은 어느 칸에도 없다. anon·PUBLIC은 emr 권한이 없다', async () => {
    const found = await rows(
      `select column_name, privilege_type from information_schema.column_privileges
       where grantee = 'authenticated' and table_schema = 'public' and table_name = 'hospitals' and privilege_type in ('INSERT', 'UPDATE')`,
    )
    expect(found.filter((r) => r.privilege_type === 'INSERT').map((r) => r.column_name).sort()).toEqual(SIGNUP_COLUMNS)
    expect(found.filter((r) => r.privilege_type === 'UPDATE')).toEqual([])
    const can = async (role: string, privilege: string) =>
      (await rows(`select has_column_privilege($1, $2, 'emr', $3) as ok`, [role, HOSPITALS, privilege]))[0].ok
    expect(await can('authenticated', 'SELECT')).toBe(true)
    expect(await can('authenticated', 'INSERT')).toBe(true)
    expect(await can('authenticated', 'UPDATE')).toBe(false)
    for (const role of ['anon', 'public']) {
      for (const privilege of ['SELECT', 'INSERT', 'UPDATE']) {
        expect([role, privilege, await can(role, privilege)]).toEqual([role, privilege, false])
      }
    }
  })

  it('AC-7301.1: 새 사용자는 가입 신청에 emr을 넣을 수 있고(대기 줄), 빼면 bit, 넷 밖 값은 거절된다', async () => {
    await become(E)
    await postgrestInsert(HOSPITALS, { name: '새정형외과', applicant_name: '김하늘', phone: null, emr: 'egis' })
    expect(await emrOfOwner(E)).toBe('egis')
    await operator()
    expect((await rows(`select status from ${HOSPITALS} where owner_id = $1`, [E]))[0].status).toBe('pending')

    await operator()
    await db.query(`delete from ${HOSPITALS} where owner_id = $1`, [E])
    await become(E)
    await postgrestInsert(HOSPITALS, { name: '새정형외과', applicant_name: '김하늘', phone: null })
    expect(await emrOfOwner(E)).toBe('bit')

    await operator()
    await db.query(`delete from ${HOSPITALS} where owner_id = $1`, [E])
    await become(E)
    await expect(postgrestInsert(HOSPITALS, { name: '새정형외과', applicant_name: '김하늘', phone: null, emr: 'mine' })).rejects.toMatchObject(
      CHECK_FAILED,
    )
    expect(await emrOfOwner(E)).toBeUndefined()
  })

  it('AC-7301.1: emr을 실어도 상태·소유자는 여전히 못 넣는다(칸 권한)', async () => {
    await become(E)
    await expect(
      postgrestInsert(HOSPITALS, { name: '새정형외과', applicant_name: '김하늘', emr: 'bit', status: 'approved' }),
    ).rejects.toMatchObject(DENIED)
    await become(E)
    await expect(postgrestInsert(HOSPITALS, { name: '새정형외과', applicant_name: '김하늘', emr: 'bit', owner_id: B })).rejects.toMatchObject(
      DENIED,
    )
    expect(await emrOfOwner(E)).toBeUndefined()
  })

  it('AC-7301.1: 원장·대기 신청자·데스크 누구도 emr을 고치지 못한다', async () => {
    for (const user of [A, C, K]) {
      await become(user)
      await expect(db.query(`update ${HOSPITALS} set emr = 'other'`)).rejects.toMatchObject(DENIED)
    }
    expect(await emrOfOwner(A)).toBe('bit')
    expect(await emrOfOwner(C)).toBe('bit')
  })

  describe('이미 있는 DB에 붙여 넣기', () => {
    let fresh: PGlite
    let ids: Record<string, string> = {}
    let before: Shape
    let once: Shape
    let dataBefore: Row[] = []

    const hospitalsNow = async (withEmr: boolean) => {
      await operator(fresh)
      return rows(`select id, owner_id, name, applicant_name, phone, email, status${withEmr ? ', emr' : ''} from ${HOSPITALS} order by owner_id`, [], fresh)
    }

    beforeAll(async () => {
      fresh = await PGlite.create()
      await migrateChain(fresh)
      ids = await seedPeople(fresh)
      dataBefore = await hospitalsNow(false)
      before = await shapeOf(fresh)
      await operator(fresh)
      await fresh.exec(EMR_MIGRATION)
      once = await shapeOf(fresh)
    }, 240_000)

    afterAll(async () => {
      await fresh.close()
    })

    it("AC-7301.1: 이미 있던 가입 줄은 emr이 'bit'가 되고 다른 값은 그대로다", async () => {
      expect(dataBefore).toHaveLength(4)
      expect(await hospitalsNow(true)).toEqual(dataBefore.map((row) => ({ ...row, emr: 'bit' })))
    })

    it('AC-7301.1: 다른 칸·제약·표 권한·칸 권한·정책·트리거·함수는 emr 칸과 my_signup_emr 말고 그대로다', () => {
      expect(withoutEmr(once)).toEqual(before)
      expect(once.columns.length).toBe(before.columns.length + 1)
      expect(once.functions.length).toBe(before.functions.length + 1)
      const added = once.constraints.filter((c) => !before.constraints.some((b) => b.tbl === c.tbl && b.conname === c.conname))
      for (const c of added) expect(c).toMatchObject({ tbl: 'hospitals', def: expect.stringMatching(/\bemr\b/) })
      expect(added.filter((c) => /^CHECK /.test(String(c.def)))).toHaveLength(1)
    })

    it('AC-7301.1: 두 번 붙여 넣어도 모양이 같고, 이미 고른 emr 값도 그대로다', async () => {
      await setEmr(ids[A], 'uisarang', fresh)
      await operator(fresh)
      await fresh.exec(EMR_MIGRATION)
      expect(await shapeOf(fresh)).toEqual(once)
      expect(await emrOfOwner(A, fresh)).toBe('uisarang')
      expect(await emrOfOwner(B, fresh)).toBe('bit')
    })
  })
})

describe('AC-7301.2 my_signup_emr() 누가 무엇을 읽나', SLOW, () => {
  it("AC-7301.2: 인자 없음·text·sql·stable·security definer·search_path ''이고, 실행은 authenticated만 된다(anon·PUBLIC 안 됨)", async () => {
    const [fn] = await rows(
      `select p.pronargs as args, p.prorettype::regtype::text as returns, l.lanname as lang, p.provolatile as volatile,
              p.prosecdef as definer, p.proconfig as config
       from pg_proc p join pg_language l on l.oid = p.prolang where p.oid = to_regprocedure('public.my_signup_emr()')`,
    )
    expect(fn).toEqual({ args: 0, returns: 'text', lang: 'sql', volatile: 's', definer: true, config: ['search_path=""'] })
    const can = async (role: string) =>
      (await rows(`select has_function_privilege($1, 'public.my_signup_emr()', 'EXECUTE') as ok`, [role]))[0].ok
    expect(await can('authenticated')).toBe(true)
    expect(await can('anon')).toBe(false)
    expect(await can('public')).toBe(false)
  })

  it('AC-7301.2: 승인된 원장은 내 병원 emr, 데스크는 그 병원 emr, 다른 병원 원장은 자기 것을 읽는다', async () => {
    await setEmr(hospital[A], 'uisarang')
    await setEmr(hospital[B], 'egis')
    await become(A)
    expect(await signupEmr()).toBe('uisarang')
    await become(K)
    expect(await signupEmr()).toBe('uisarang')
    await become(B)
    expect(await signupEmr()).toBe('egis')
  })

  it('AC-7301.2: 대기·거절된 원장과 병원 없는 사용자는 null이다(자기 줄 emr이 있어도)', async () => {
    await setEmr(hospital[C], 'other')
    await setEmr(hospital[R], 'egis')
    for (const user of [C, R, E]) {
      await become(user)
      expect([user, await signupEmr()]).toEqual([user, null])
    }
  })

  it('AC-7301.2: 로그인 안 한 사용자(anon)는 실행하지 못한다', async () => {
    await becomeAnon()
    await expect(db.query('select public.my_signup_emr()')).rejects.toMatchObject(DENIED)
  })

  it('AC-7301.2: 남의 병원 emr은 표 읽기로도 보이지 않는다(데스크는 hospitals 줄이 안 보이고, 원장은 내 줄만)', async () => {
    await setEmr(hospital[A], 'uisarang')
    await become(K)
    expect(await rows(`select emr from ${HOSPITALS}`)).toEqual([])
    await become(B)
    expect(await rows(`select owner_id, emr from ${HOSPITALS}`)).toEqual([{ owner_id: B, emr: 'bit' }])
  })
})

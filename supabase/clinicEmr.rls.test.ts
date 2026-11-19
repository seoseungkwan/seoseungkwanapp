import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

// 병원 정보 표 clinic_profiles의 쓰는 EMR 칸 emr (emr-choice REQ-7101, design.md 6절, ADR-033).
// clinicProfile.rls.test.ts와 같은 방법: 진짜 Postgres(PGlite, WASM)에서 운영자가 붙일 migration 파일을 차례로
// (… desk_accounts → clinic_profile → 이 파일) 그대로 돌린다. 실제 Supabase에는 붙지 않는다.
// Supabase가 미리 갖춘 것(역할·auth·storage)만 흉내 낸다. 메일·이름·전화·주소는 모두 지어낸 것이다
const fileOf = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))
const read = (rel: string) => readFileSync(fileOf(rel), 'utf-8')
// 앞 migration: clinicProfile.rls.test.ts와 같은 차례(auth → … → 예약 → 데스크)
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
].map((name) => read(`./migrations/${name}`))
const PROFILE_MIGRATION = read('./migrations/20261119000000_clinic_profile.sql')
const EMR_PATH = fileOf('./migrations/20261119300000_clinic_emr.sql')
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
const E = '00000000-0000-4000-8000-00000000000e' // 병원 줄도 데스크 줄도 없는 사용자
const K = '00000000-0000-4000-8000-0000000000d1' // A의 데스크(병원 줄 없음)
const STATUS: Record<string, 'approved' | 'pending' | null> = { [A]: 'approved', [B]: 'approved', [C]: 'pending', [E]: null, [K]: null }
const DESK_EMAIL: Record<string, string> = { [K]: 'desk-a@fake.test' }
const emailOf = (user: string) => DESK_EMAIL[user] ?? `${user.slice(-1)}@fake.test`

type Row = Record<string, unknown>

const PROFILES = 'public.clinic_profiles'
const EMR_KINDS = ['bit', 'uisarang', 'egis', 'other']
// clinic_profile.sql이 준 넣기·고치기 칸 여덟
const VALUE_COLUMNS = ['address', 'closed_dates', 'display_name', 'honorific', 'hours', 'logo_path', 'phone', 'staff']

const WEEKDAY = { open: 540, close: 1080, lunchFrom: 780, lunchTo: 840 }
const HOURS = [WEEKDAY, WEEKDAY, WEEKDAY, WEEKDAY, WEEKDAY, { open: 540, close: 780, lunchFrom: null, lunchTo: null }, null]
const BODY: Row = {
  display_name: '가짜정형외과',
  phone: '0212345678',
  address: '서울시 가짜구 가짜로 1',
  honorific: '대표원장님',
  hours: HOURS,
  closed_dates: ['2026-12-31'],
  staff: [{ id: 'st-ga', name: '가원장', role: 'doctor', mark: '가', color: 'teal', calendar: true }],
  logo_path: null,
}

const SLOW = { timeout: 60_000 }
const DENIED = { code: '42501' } // 권한 없음
const CHECK_FAILED = { code: '23514' }
const NOT_NULL = { code: '23502' }
const RLS_OR_NULL = /row-level security|null value/

let db: PGlite
let hospital: Record<string, string> = {}

async function migrateChain(target: PGlite) {
  await target.exec(SUPABASE_MOCK)
  await target.exec(STORAGE_MOCK)
  for (const sql of CHAIN) await target.exec(sql)
  await target.exec(PROFILE_MIGRATION)
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

/** 사용자·병원·데스크 줄을 넣고 병원 id를 돌려준다(운영자) */
async function seedPeople(target: PGlite) {
  await operator(target)
  const ids: Record<string, string> = {}
  for (const [user, status] of Object.entries(STATUS)) {
    await target.query('insert into auth.users (id, email) values ($1, $2)', [user, emailOf(user)])
    if (status === null) continue
    const [row] = await rows(
      `insert into public.hospitals (owner_id, name, applicant_name, email, status) values ($1, $2, '홍길동', $3, $4) returning id`,
      [user, `가짜병원${user.slice(-1)}`, emailOf(user), status],
      target,
    )
    ids[user] = row.id as string
  }
  await target.query(`insert into public.hospital_members (hospital_id, email) values ($1, $2)`, [ids[A], emailOf(K)])
  return ids
}

// 시험마다 빈 표에서 시작한다(병원·데스크·병원 정보 줄은 auth.users를 따라 함께 비워진다). 운영자(superuser)는 RLS를 건너뛴다
async function resetData() {
  await operator()
  await db.exec('truncate auth.users cascade')
  hospital = await seedPeople(db)
}

// PostgREST insert·upsert와 같은 모양: json 줄을 표 모양으로 풀어 보낸 칸만 넣고, upsert는 겹치면 보낸 칸만 SET에 쓴다(hospital_id는 보내지 않는다)
function postgrestInsert(table: string, body: Row[], conflict: string | null = null, target: PGlite = db) {
  const columns = Object.keys(body[0] ?? {})
  const list = columns.join(', ')
  const onConflict = conflict === null ? '' : `on conflict (${conflict}) do update set ${columns.map((c) => `${c} = excluded.${c}`).join(', ')}`
  return target.query(`insert into ${table} (${list}) select ${list} from json_populate_recordset(null::${table}, $1::json) ${onConflict}`, [
    JSON.stringify(body),
  ])
}

/** 지금 역할로 병원 정보 저장(앱의 upsert onConflict hospital_id) */
const saveProfile = (body: Row, target: PGlite = db) => postgrestInsert(PROFILES, [body], 'hospital_id', target)

/** 운영자가 그 병원 병원 정보 줄을 넣는다(RLS·칸 권한을 건너뛴다) */
async function seedProfile(hospitalId: string, values: Row = BODY, target: PGlite = db) {
  await operator(target)
  await postgrestInsert(PROFILES, [{ hospital_id: hospitalId, ...values }], null, target)
}

/** 운영자 눈으로 본 병원 정보 줄 전체(emr 포함은 고를 수 있다) */
async function profilesNow(target: PGlite = db, withEmr = true) {
  await operator(target)
  const emr = withEmr ? ', emr' : ''
  return rows(
    `select hospital_id, display_name, phone, address, honorific, hours, closed_dates, staff, logo_path${emr} from ${PROFILES} order by hospital_id`,
    [],
    target,
  )
}

/** 운영자 눈으로 본 그 병원 emr(줄 없으면 null) */
async function emrOf(hospitalId: string, target: PGlite = db) {
  await operator(target)
  const found = await rows(`select emr from ${PROFILES} where hospital_id = $1`, [hospitalId], target)
  return found.length === 0 ? null : found[0].emr
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

/** emr 칸에 딸린 것(칸·제약·칸 권한)을 뺀 모양 */
function withoutEmr(shape: Shape): Shape {
  return {
    ...shape,
    columns: shape.columns.filter((c) => !(c.table_name === 'clinic_profiles' && c.column_name === 'emr')),
    constraints: shape.constraints.filter((c) => !(c.tbl === 'clinic_profiles' && /\bemr\b/.test(String(c.def)))),
    access: shape.access.map((t) =>
      t.relname === 'clinic_profiles' ? { ...t, columns: (t.columns as string[]).filter((col) => !col.startsWith('emr:')) } : t,
    ),
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

describe('AC-7101.1 emr 칸 모양·붙여 넣기', SLOW, () => {
  it('AC-7101.1: 파일이 있고 줄 끝이 LF이며, 머리 주석에 붙여 넣는 방법·먼저 들어갈 clinic_profile.sql·앞 파일을 다시 붙이면 emr 권한이 지워져 이 파일도 다시 붙인다는 말이 있다', () => {
    expect(EMR_MIGRATION).not.toBe('')
    expect(EMR_MIGRATION).not.toContain('\r')
    const lines = EMR_MIGRATION.split('\n')
    const head = lines.slice(0, lines.findIndex((line) => !/^(--|\s*$)/.test(line))).join('\n')
    expect(head).toContain('운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다')
    expect(head).toMatch(/먼저[^\n]*20261119000000_clinic_profile\.sql/)
    expect(head).toMatch(/20261119000000_clinic_profile\.sql[^\n]*다시 붙여 넣으면[^\n]*emr[^\n]*권한[^\n]*이 파일도 다시 붙여 넣는다/)
    expect(head).toMatch(/두 번 붙여 넣어도/)
    expect(head).toContain('REQ-7101')
  })

  it('AC-7101.1: 문장은 emr 칸 더하기(없을 때만, 비울 수 없음, 기본 bit, 넷만)와 emr 넣기·고치기 권한 주기 둘뿐이다', () => {
    const statements = EMR_SQL.split(';')
      .map((s) => s.trim().replace(/\s+/g, ' '))
      .filter(Boolean)
    expect(statements).toEqual([
      "alter table public.clinic_profiles add column if not exists emr text not null default 'bit' check (emr in ('bit', 'uisarang', 'egis', 'other'))",
      'grant insert (emr), update (emr) on table public.clinic_profiles to authenticated',
    ])
  })

  it("AC-7101.1: clinic_profiles 맨 끝에 emr(text, 비울 수 없음, 기본 'bit')이 있고, 값 넷만 받는 제약이 하나 있다", async () => {
    const columns = await rows(
      `select column_name, udt_name, is_nullable, column_default from information_schema.columns
       where table_schema = 'public' and table_name = 'clinic_profiles' order by ordinal_position`,
    )
    expect(columns.at(-1)).toEqual({ column_name: 'emr', udt_name: 'text', is_nullable: 'NO', column_default: "'bit'::text" })
    const checks = await rows(
      `select pg_get_constraintdef(oid) as def from pg_constraint where conrelid = to_regclass($1) and contype = 'c' and pg_get_constraintdef(oid) ~ '\\memr\\M'`,
      [PROFILES],
    )
    expect(checks).toHaveLength(1)
    for (const kind of EMR_KINDS) expect(checks[0].def).toContain(`'${kind}'`)
  })

  it('AC-7101.1: authenticated는 emr을 읽고(표 권한) 넣고 고칠 수 있고(칸 권한), anon·PUBLIC은 emr 권한이 없다', async () => {
    const can = async (role: string, privilege: string) =>
      (await rows(`select has_column_privilege($1, $2, 'emr', $3) as ok`, [role, PROFILES, privilege]))[0].ok
    for (const privilege of ['SELECT', 'INSERT', 'UPDATE']) expect([privilege, await can('authenticated', privilege)]).toEqual([privilege, true])
    expect(await can('authenticated', 'REFERENCES')).toBe(false)
    for (const role of ['anon', 'public']) {
      for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']) {
        expect([role, privilege, await can(role, privilege)]).toEqual([role, privilege, false])
      }
    }
    const found = await rows(
      `select column_name, privilege_type from information_schema.column_privileges
       where grantee = 'authenticated' and table_schema = 'public' and table_name = 'clinic_profiles' and privilege_type in ('INSERT', 'UPDATE')`,
    )
    for (const privilege of ['INSERT', 'UPDATE']) {
      expect([privilege, found.filter((r) => r.privilege_type === privilege).map((r) => r.column_name).sort()]).toEqual([
        privilege,
        [...VALUE_COLUMNS, 'emr'].sort(),
      ])
    }
  })

  describe('이미 있는 DB에 붙여 넣기', () => {
    let fresh: PGlite
    let ids: Record<string, string> = {}
    let before: Shape
    let once: Shape
    let dataBefore: Row[] = []

    beforeAll(async () => {
      fresh = await PGlite.create()
      await migrateChain(fresh)
      ids = await seedPeople(fresh)
      await seedProfile(ids[A], BODY, fresh)
      await seedProfile(ids[B], { ...BODY, display_name: '비정형외과', honorific: '선생님' }, fresh)
      dataBefore = await profilesNow(fresh, false)
      before = await shapeOf(fresh)
      await operator(fresh)
      await fresh.exec(EMR_MIGRATION)
      once = await shapeOf(fresh)
    }, 240_000)

    afterAll(async () => {
      await fresh.close()
    })

    it("AC-7101.1: 이미 있던 병원 정보 줄은 emr이 'bit'가 되고 다른 값은 그대로다", async () => {
      expect(dataBefore).toHaveLength(2)
      expect(await profilesNow(fresh)).toEqual(dataBefore.map((row) => ({ ...row, emr: 'bit' })))
    })

    it('AC-7101.1: 다른 칸·제약·표 권한·칸 권한·정책·트리거·함수는 emr에 딸린 것 말고 그대로다', () => {
      expect(withoutEmr(once)).toEqual(before)
      expect(once.columns.length).toBe(before.columns.length + 1)
      // 새로 생긴 제약은 emr 것뿐이고(Postgres 판에 따라 NOT NULL도 제약 줄로 보인다) 그중 CHECK가 하나다
      const added = once.constraints.filter((c) => !before.constraints.some((b) => b.tbl === c.tbl && b.conname === c.conname))
      for (const c of added) expect(c).toMatchObject({ tbl: 'clinic_profiles', def: expect.stringMatching(/\bemr\b/) })
      expect(added.filter((c) => /^CHECK /.test(String(c.def)))).toHaveLength(1)
    })

    it('AC-7101.1: 두 번 붙여 넣어도 모양이 같고, 원장이 고른 emr 값도 그대로다', async () => {
      await operator(fresh)
      await fresh.query(`update ${PROFILES} set emr = 'egis' where hospital_id = $1`, [ids[A]])
      await fresh.exec(EMR_MIGRATION)
      expect(await shapeOf(fresh)).toEqual(once)
      expect(await emrOf(ids[A], fresh)).toBe('egis')
      expect(await emrOf(ids[B], fresh)).toBe('bit')
    })

    it('AC-7101.1: 앞 파일 → 이 파일 → 앞 파일 → 이 파일 차례로 돌려도 원장이 emr을 넣어 저장할 수 있다(앞 파일만 다시 붙이면 emr 저장이 막힌다)', async () => {
      await operator(fresh)
      await fresh.exec(PROFILE_MIGRATION)
      await become(A, fresh)
      await expect(saveProfile({ ...BODY, emr: 'other' }, fresh)).rejects.toMatchObject(DENIED)

      await operator(fresh)
      await fresh.exec(EMR_MIGRATION)
      expect(await shapeOf(fresh)).toEqual(once)
      await become(A, fresh)
      await saveProfile({ ...BODY, display_name: '고친정형외과', emr: 'uisarang' }, fresh)
      await become(A, fresh)
      expect((await fresh.query(`update ${PROFILES} set emr = 'other'`)).affectedRows).toBe(1)
      expect(await emrOf(ids[A], fresh)).toBe('other')
      expect(await emrOf(ids[B], fresh)).toBe('bit')
    })
  })
})

describe('AC-7101.2 누가 emr을 읽고 쓰나', SLOW, () => {
  it('AC-7101.2: 원장 A는 emr을 넣어 저장하고(upsert, hospital_id 없이) 다시 저장·고치기로 바꿀 수 있다', async () => {
    await become(A)
    await saveProfile({ ...BODY, emr: 'uisarang' })
    expect(await profilesNow()).toEqual([{ hospital_id: hospital[A], ...BODY, emr: 'uisarang' }])
    await become(A)
    await saveProfile({ ...BODY, emr: 'egis' })
    expect(await emrOf(hospital[A])).toBe('egis')
    await become(A)
    expect((await db.query(`update ${PROFILES} set emr = 'other'`)).affectedRows).toBe(1)
    expect(await rows(`select emr from ${PROFILES}`)).toEqual([{ emr: 'other' }])
    await become(A)
    expect((await db.query(`update ${PROFILES} set emr = 'bit'`)).affectedRows).toBe(1)
    expect(await emrOf(hospital[A])).toBe('bit')
  })

  it("AC-7101.2: emr 없이 저장하면 새 줄은 'bit'이고, 있던 줄은 고른 값이 그대로다", async () => {
    await become(A)
    await saveProfile(BODY)
    expect(await emrOf(hospital[A])).toBe('bit')
    await operator()
    await db.query(`update ${PROFILES} set emr = 'egis'`)
    await become(A)
    await saveProfile({ ...BODY, display_name: '고친정형외과' })
    expect(await profilesNow()).toEqual([{ hospital_id: hospital[A], ...BODY, display_name: '고친정형외과', emr: 'egis' }])
  })

  it('AC-7101.2: A는 B 줄의 emr을 읽지도 고치지도 못하고 B 줄은 그대로다', async () => {
    await seedProfile(hospital[A])
    await seedProfile(hospital[B], { ...BODY, emr: 'egis' })
    await become(A)
    expect(await rows(`select hospital_id, emr from ${PROFILES} order by hospital_id`)).toEqual([{ hospital_id: hospital[A], emr: 'bit' }])
    expect(await rows(`select emr from ${PROFILES} where hospital_id = $1`, [hospital[B]])).toEqual([])
    expect((await db.query(`update ${PROFILES} set emr = 'other' where hospital_id = $1`, [hospital[B]])).affectedRows).toBe(0)
    expect(await emrOf(hospital[B])).toBe('egis')
  })

  it('AC-7101.2: A의 데스크는 A 줄의 emr을 읽지만 넣기는 거부, 고치기는 0줄이다', async () => {
    await seedProfile(hospital[A], { ...BODY, emr: 'uisarang' })
    await seedProfile(hospital[B], { ...BODY, emr: 'egis' })
    const before = await profilesNow()
    await become(K)
    expect(await rows(`select hospital_id, emr from ${PROFILES}`)).toEqual([{ hospital_id: hospital[A], emr: 'uisarang' }])
    await expect(saveProfile({ ...BODY, emr: 'other' })).rejects.toThrow(RLS_OR_NULL)
    await become(K)
    await expect(postgrestInsert(PROFILES, [{ hours: HOURS, emr: 'other' }])).rejects.toThrow(RLS_OR_NULL)
    await become(K)
    expect((await db.query(`update ${PROFILES} set emr = 'other'`)).affectedRows).toBe(0)
    expect(await profilesNow()).toEqual(before)
  })

  it.each<[string, string]>([
    ['승인 대기', C],
    ['병원 줄 없음', E],
  ])('AC-7101.2: %s 사용자는 emr을 읽지도 넣지도 고치지도 못한다', async (_name, user) => {
    await seedProfile(hospital[A])
    if (hospital[user]) await seedProfile(hospital[user])
    const before = await profilesNow()
    await become(user)
    expect(await rows(`select emr from ${PROFILES}`)).toEqual([])
    await expect(saveProfile({ ...BODY, emr: 'egis' })).rejects.toThrow(RLS_OR_NULL)
    await become(user)
    expect((await db.query(`update ${PROFILES} set emr = 'egis'`)).affectedRows).toBe(0)
    expect(await profilesNow()).toEqual(before)
  })

  it('AC-7101.2: anon은 emr 읽기·넣기·고치기가 모두 권한 없음이다', async () => {
    await seedProfile(hospital[A])
    await becomeAnon()
    await expect(db.query(`select emr from ${PROFILES}`)).rejects.toMatchObject(DENIED)
    await expect(postgrestInsert(PROFILES, [{ hours: HOURS, emr: 'egis' }])).rejects.toMatchObject(DENIED)
    await expect(db.query(`update ${PROFILES} set emr = 'egis'`)).rejects.toMatchObject(DENIED)
    expect(await emrOf(hospital[A])).toBe('bit')
  })

  it.each<[string, string]>([
    ['대문자', 'BIT'],
    ['첫 글자만 대문자', 'Bit'],
    ['앞 빈칸', ' bit'],
    ['뒤 빈칸', 'egis '],
    ['빈 글자', ''],
    ['한글 이름', '의사랑'],
    ['넷 밖 영문', 'etc'],
  ])('AC-7101.2: 넷 밖의 값(%s %j)은 넣기·저장(upsert)·고치기 모두 DB가 거절한다(23514)', async (_name, value) => {
    await become(A)
    await expect(saveProfile({ ...BODY, emr: value })).rejects.toMatchObject(CHECK_FAILED)
    expect(await profilesNow()).toEqual([])
    await seedProfile(hospital[A], { ...BODY, emr: 'egis' })
    await become(A)
    await expect(saveProfile({ ...BODY, emr: value })).rejects.toMatchObject(CHECK_FAILED)
    await become(A)
    await expect(db.query(`update ${PROFILES} set emr = $1`, [value])).rejects.toMatchObject(CHECK_FAILED)
    expect(await emrOf(hospital[A])).toBe('egis')
  })

  it('AC-7101.2: emr을 비워(null) 보내면 DB가 거절한다(23502)', async () => {
    await become(A)
    await expect(saveProfile({ ...BODY, emr: null })).rejects.toMatchObject(NOT_NULL)
    await seedProfile(hospital[A])
    await become(A)
    await expect(db.query(`update ${PROFILES} set emr = null`)).rejects.toMatchObject(NOT_NULL)
    expect(await emrOf(hospital[A])).toBe('bit')
  })
})

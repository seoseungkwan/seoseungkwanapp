import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

// 병원 정보 표 clinic_profiles·로고 바구니 clinic-logos·예약 시행자 옮기기·my_desk() 이름·청구 입력 방식 칸 input_mode
// (clinic-profile REQ-6601·REQ-6610, design.md 1절·12절, ADR-033).
// desk.rls.test.ts와 같은 방법: 진짜 Postgres(PGlite, WASM)에서 운영자가 붙일 migration 파일을 차례로(… calendar → desk_accounts → 이 파일) 그대로 돌린다.
// 실제 Supabase에는 붙지 않는다. Supabase가 미리 갖춘 것(역할·auth·storage)만 흉내 낸다. 메일·이름·전화·주소는 모두 지어낸 것이다
const fileOf = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))
const read = (rel: string) => readFileSync(fileOf(rel), 'utf-8')
// 앞 migration: auth → precheck_settings(my_hospital_id·claim_hospital_settings) → 업무일지 넷 → 통계 묶음 둘 → 수납일지 → 예약 → 데스크
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
const PROFILE_PATH = fileOf('./migrations/20261119000000_clinic_profile.sql')
// 파일이 아직 없으면 빈 글자로 돌아, 시험마다 '표·함수가 없다'로 실패한다(무엇이 빠졌는지 시험별로 보인다)
const PROFILE_MIGRATION = existsSync(PROFILE_PATH) ? readFileSync(PROFILE_PATH, 'utf-8') : ''
// 주석을 뺀 SQL 글자, 그리고 함수·DO 몸통($$ … $$)까지 뺀 글자(맨 위 문장만 본다)
const PROFILE_SQL = PROFILE_MIGRATION.split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n')
const PROFILE_TOP = PROFILE_SQL.replace(/\$\$[\s\S]*?\$\$/g, "''")

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

// Supabase Storage가 갖춘 것(formBackgrounds.rls.test.ts와 같은 흉내): 바구니 표·파일 표(RLS 켜짐, 표 권한 있음)·foldername()
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
  -- 다른 기능의 바구니(이 파일의 정책이 여기에는 아무것도 열지 않는지 보려고)
  insert into storage.buckets (id, name) values ('other-bucket', 'other-bucket');
`

const A = '00000000-0000-4000-8000-00000000000a' // 승인된 병원 A 원장
const B = '00000000-0000-4000-8000-00000000000b' // 승인된 다른 병원 B 원장
const C = '00000000-0000-4000-8000-00000000000c' // 승인 대기
const D = '00000000-0000-4000-8000-00000000000d' // 거절
const E = '00000000-0000-4000-8000-00000000000e' // 병원 줄도 데스크 줄도 없는 사용자
const K = '00000000-0000-4000-8000-0000000000d1' // A의 데스크(병원 줄 없음)
const L = '00000000-0000-4000-8000-0000000000d2' // B의 데스크(병원 줄 없음)
const STATUS: Record<string, 'approved' | 'pending' | 'rejected' | null> = {
  [A]: 'approved',
  [B]: 'approved',
  [C]: 'pending',
  [D]: 'rejected',
  [E]: null,
  [K]: null,
  [L]: null,
}
const DESK_EMAIL: Record<string, string> = { [K]: 'desk-a@fake.test', [L]: 'desk-b@fake.test' }
const emailOf = (user: string) => DESK_EMAIL[user] ?? `${user.slice(-1)}@fake.test`
const NAME: Record<string, string> = { [A]: '가짜병원에이', [B]: '가짜병원비', [C]: '가짜병원씨', [D]: '가짜병원디' }

type Row = Record<string, unknown>

const PROFILES = 'public.clinic_profiles'
const CLAIM = 'public.claim_hospital_settings'
const BUCKET = 'clinic-logos'
const OTHER_BUCKET = 'other-bucket'
// 사용자가 넣고 고칠 수 있는 칸(hospital_id·updated_at 빼고)
const VALUE_COLUMNS = ['address', 'closed_dates', 'display_name', 'honorific', 'hours', 'logo_path', 'phone', 'staff']

// 지어낸 병원 정보(진료시간은 분, 월(0)~일(6), null = 휴진)
const WEEKDAY = { open: 540, close: 1080, lunchFrom: 780, lunchTo: 840 }
const HOURS = [WEEKDAY, WEEKDAY, WEEKDAY, WEEKDAY, WEEKDAY, { open: 540, close: 780, lunchFrom: null, lunchTo: null }, null]
const STAFF = [
  { id: 'st-ga', name: '가원장', role: 'doctor', mark: '가', color: 'teal', calendar: true },
  { id: 'st-na', name: '나직원', role: 'staff', mark: '나', color: 'pink', calendar: false },
]
const BODY: Row = {
  display_name: '가짜정형외과',
  phone: '0212345678',
  address: '서울시 가짜구 가짜로 1',
  honorific: '대표원장님',
  hours: HOURS,
  closed_dates: ['2026-12-31'],
  staff: STAFF,
  logo_path: null,
}

const SLOW = { timeout: 60_000 }
const DENIED = { code: '42501' } // 권한 없음
const CHECK_FAILED = { code: '23514' }
const NOT_NULL = { code: '23502' }
const RLS_REJECTED = /row-level security/
const RLS_OR_NULL = /row-level security|null value/

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

// 시험마다 빈 표에서 시작한다(병원·데스크·병원 정보·청구 설정 줄은 auth.users를 따라 함께 비워진다). 운영자(superuser)는 RLS를 건너뛴다
async function resetData() {
  await operator()
  await db.exec('truncate auth.users cascade')
  await db.exec('truncate storage.objects')
  hospital = {}
  for (const [user, status] of Object.entries(STATUS)) {
    await db.query('insert into auth.users (id, email) values ($1, $2)', [user, emailOf(user)])
    if (status === null) continue
    const [row] = await rows(
      `insert into public.hospitals (owner_id, name, applicant_name, email, status)
       values ($1, $2, '홍길동', $3, $4) returning id`,
      [user, NAME[user], emailOf(user), status],
    )
    hospital[user] = row.id as string
  }
  await db.query(`insert into public.hospital_members (hospital_id, email) values ($1, $2), ($3, $4)`, [hospital[A], emailOf(K), hospital[B], emailOf(L)])
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
const saveProfile = (body: Row = BODY) => postgrestInsert(PROFILES, [body], 'hospital_id')

/** 운영자가 그 병원 병원 정보 줄을 넣는다(RLS·칸 권한을 건너뛴다) */
async function seedProfile(owner: string, values: Row = BODY, target: PGlite = db) {
  await operator(target)
  await postgrestInsert(PROFILES, [{ hospital_id: hospital[owner], ...values }], null, target)
}

/** 운영자 눈으로 본 병원 정보 줄 전체 */
async function profilesNow(target: PGlite = db) {
  await operator(target)
  return rows(
    `select hospital_id, display_name, phone, address, honorific, hours, closed_dates, staff, logo_path from ${PROFILES} order by hospital_id`,
    [],
    target,
  )
}

/** 지금 역할로 본 병원 정보 줄들의 병원 id */
async function hospitalsSeen() {
  return (await rows(`select hospital_id from ${PROFILES} order by hospital_id`)).map((r) => r.hospital_id)
}

/** 운영자 눈으로 본 그 병원 rev(줄 없으면 null) */
async function revOf(owner: string): Promise<number | null> {
  await operator()
  const found = await rows(`select rev::int as rev from public.calendar_rev where hospital_id = $1`, [hospital[owner]])
  return found.length === 0 ? null : (found[0].rev as number)
}

async function objects() {
  await operator()
  return rows(`select bucket_id, name from storage.objects order by bucket_id, name`)
}

// 운영자가 파일 줄을 넣는다(Storage API가 하는 일을 흉내, 정책을 건너뛴다)
async function seedObject(name: string, bucket = BUCKET) {
  await operator()
  await rows(`insert into storage.objects (bucket_id, name) values ($1, $2)`, [bucket, name])
}

// 지금 역할로 파일을 올린다(Storage API의 upload, upsert 없음)
const upload = (name: string, bucket = BUCKET) =>
  rows(`insert into storage.objects (bucket_id, name) values ($1, $2) returning bucket_id, name`, [bucket, name])

const logoOf = (owner: string, file = 'logo-1.png') => `${hospital[owner]}/${file}`

/** 그 값이 jsonb 글자로 꼭 bytes가 되게 늘린다(pad 글자 수를 DB에 물어 맞춘다) */
async function jsonOfBytes(make: (pad: number) => unknown, bytes: number) {
  const size = async (value: unknown) => (await rows(`select octet_length($1::jsonb::text)::int as n`, [JSON.stringify(value)]))[0].n as number
  const made = make(bytes - (await size(make(0))))
  expect(await size(made)).toBe(bytes)
  return made
}

beforeAll(async () => {
  db = await PGlite.create()
  await migrateChain(db)
  await db.exec(PROFILE_MIGRATION)
}, 180_000)

afterAll(async () => {
  await db.close()
})

beforeEach(resetData)

describe('AC-6601.1 표 모양·권한', SLOW, () => {
  it('AC-6601.1: clinic_profiles 칸은 hospital_id(my_hospital_id())·display_name·phone·address·honorific(기본 원장님)·hours·closed_dates·staff(기본 [])·logo_path·updated_at(now())다', async () => {
    const found = await rows(
      `select column_name, udt_name, is_nullable, column_default from information_schema.columns
       where table_schema = 'public' and table_name = 'clinic_profiles' order by ordinal_position`,
    )
    expect(found).toEqual([
      { column_name: 'hospital_id', udt_name: 'uuid', is_nullable: 'NO', column_default: expect.stringMatching(/^(public\.)?my_hospital_id\(\)$/) },
      { column_name: 'display_name', udt_name: 'text', is_nullable: 'YES', column_default: null },
      { column_name: 'phone', udt_name: 'text', is_nullable: 'YES', column_default: null },
      { column_name: 'address', udt_name: 'text', is_nullable: 'YES', column_default: null },
      { column_name: 'honorific', udt_name: 'text', is_nullable: 'NO', column_default: "'원장님'::text" },
      { column_name: 'hours', udt_name: 'jsonb', is_nullable: 'NO', column_default: null },
      { column_name: 'closed_dates', udt_name: 'jsonb', is_nullable: 'NO', column_default: "'[]'::jsonb" },
      { column_name: 'staff', udt_name: 'jsonb', is_nullable: 'NO', column_default: "'[]'::jsonb" },
      { column_name: 'logo_path', udt_name: 'text', is_nullable: 'YES', column_default: null },
      { column_name: 'updated_at', udt_name: 'timestamptz', is_nullable: 'NO', column_default: 'now()' },
    ])
  })

  it('AC-6601.1: 기본 키는 hospital_id이고 병원 표를 가리킨다(병원을 지우면 함께 지움)', async () => {
    const found = await rows(
      `select contype, pg_get_constraintdef(oid) as def from pg_constraint
       where conrelid = to_regclass($1) and contype in ('p', 'f', 'u') order by contype`,
      [PROFILES],
    )
    expect(found).toEqual([
      { contype: 'f', def: expect.stringMatching(/^FOREIGN KEY \(hospital_id\) REFERENCES (public\.)?hospitals\(id\) ON DELETE CASCADE$/) },
      { contype: 'p', def: 'PRIMARY KEY (hospital_id)' },
    ])
    await seedProfile(A)
    await seedProfile(B)
    await operator()
    await db.query('delete from public.hospitals where id = $1', [hospital[A]])
    expect((await profilesNow()).map((r) => r.hospital_id)).toEqual([hospital[B]])
  })

  it('AC-6601.1: RLS가 켜져 있고, anon·PUBLIC 권한은 없으며, authenticated 표 권한은 select뿐이다', async () => {
    expect(await rows(`select relrowsecurity as on from pg_class where oid = to_regclass($1)`, [PROFILES])).toEqual([{ on: true }])
    const grants = await rows(
      `select grantee, privilege_type from information_schema.role_table_grants
       where table_schema = 'public' and table_name = 'clinic_profiles' and grantee in ('anon', 'authenticated', 'PUBLIC') order by 1, 2`,
    )
    expect(grants).toEqual([{ grantee: 'authenticated', privilege_type: 'SELECT' }])
    const anonColumns = await rows(
      `select column_name from information_schema.column_privileges
       where table_schema = 'public' and table_name = 'clinic_profiles' and grantee in ('anon', 'PUBLIC')`,
    )
    expect(anonColumns).toEqual([])
    for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']) {
      expect([privilege, (await rows(`select has_any_column_privilege('anon', $1, $2) as ok`, [PROFILES, privilege]))[0].ok]).toEqual([privilege, false])
    }
    for (const role of ['anon', 'authenticated']) {
      for (const privilege of ['DELETE', 'TRUNCATE', 'TRIGGER', 'REFERENCES']) {
        expect([role, privilege, (await rows(`select has_table_privilege($1, $2, $3) as ok`, [role, PROFILES, privilege]))[0].ok]).toEqual([
          role,
          privilege,
          false,
        ])
      }
    }
  })

  it('AC-6601.1: authenticated의 넣기·고치기는 값 칸 여덟(hospital_id·updated_at 빼고)뿐이다', async () => {
    const found = await rows(
      `select column_name, privilege_type from information_schema.column_privileges
       where grantee = 'authenticated' and table_schema = 'public' and table_name = 'clinic_profiles' and privilege_type in ('INSERT', 'UPDATE')`,
    )
    for (const privilege of ['INSERT', 'UPDATE']) {
      expect([privilege, found.filter((r) => r.privilege_type === privilege).map((r) => r.column_name).sort()]).toEqual([privilege, VALUE_COLUMNS])
    }
  })

  it('AC-6601.1: 정책은 원장 읽기·넣기·고치기(my_hospital_id())와 데스크 읽기(my_desk_hospital_id()) 넷뿐이고 지우기 정책은 없다', async () => {
    const list = await rows(
      `select policyname, cmd, permissive, roles::text as roles, coalesce(qual, '') as qual, coalesce(with_check, '') as with_check from pg_policies
       where schemaname = 'public' and tablename = 'clinic_profiles' order by cmd, policyname`,
    )
    const OWNER = /^\(hospital_id = \( SELECT (public\.)?my_hospital_id\(\) AS my_hospital_id\)\)$/
    const DESK = /^\(hospital_id = \( SELECT (public\.)?my_desk_hospital_id\(\) AS my_desk_hospital_id\)\)$/
    expect(list.map((p) => [p.cmd, p.policyname])).toEqual([
      ['INSERT', '내 병원 정보 넣기'],
      ['SELECT', '내 병원 정보 읽기'],
      ['SELECT', '데스크 병원 정보 읽기'],
      ['UPDATE', '내 병원 정보 고치기'],
    ].sort((x, y) => (x[0] === y[0] ? (x[1] < y[1] ? -1 : 1) : x[0] < y[0] ? -1 : 1)))
    for (const policy of list) expect(policy).toMatchObject({ permissive: 'PERMISSIVE', roles: '{authenticated}' })
    const byName = Object.fromEntries(list.map((p) => [p.policyname, p]))
    expect(byName['내 병원 정보 넣기']).toMatchObject({ qual: '', with_check: expect.stringMatching(OWNER) })
    expect(byName['내 병원 정보 읽기']).toMatchObject({ qual: expect.stringMatching(OWNER), with_check: '' })
    expect(byName['내 병원 정보 고치기']).toMatchObject({ qual: expect.stringMatching(OWNER), with_check: expect.stringMatching(OWNER) })
    expect(byName['데스크 병원 정보 읽기']).toMatchObject({ qual: expect.stringMatching(DESK), with_check: '' })
  })

  it('AC-6601.1: 트리거는 고칠 때 updated_at(줄마다, 자기 touch 함수)과 넣고 고친 뒤 calendar_bump(문장마다) 둘이다', async () => {
    const found = await rows(
      `select tgname, pg_get_triggerdef(oid) as def from pg_trigger where tgrelid = to_regclass($1) and not tgisinternal order by tgname`,
      [PROFILES],
    )
    expect(found.map((t) => t.tgname)).toEqual(['clinic_profiles_bump', 'clinic_profiles_touch'])
    expect(found[0].def).toMatch(/ AFTER INSERT OR UPDATE ON (public\.)?clinic_profiles FOR EACH STATEMENT EXECUTE FUNCTION (public\.)?calendar_bump\(\)$/)
    expect(found[1].def).toMatch(/ BEFORE UPDATE ON (public\.)?clinic_profiles FOR EACH ROW EXECUTE FUNCTION (public\.)?clinic_profiles_touch\(\)$/)
  })

  it('AC-6601.1: clinic_profiles_touch는 security invoker·search_path 빔이고 누구도 바로 부르지 못하며 touch_updated_at을 부르지 않는다', async () => {
    const [fn] = await rows(
      `select prosecdef as definer, proconfig as config, prosrc as src, coalesce(array_to_string(proacl, ','), '') as acl from pg_proc
       where pronamespace = 'public'::regnamespace and proname = 'clinic_profiles_touch'`,
    )
    expect(fn).toMatchObject({ definer: false, config: ['search_path=""'] })
    expect(fn.src).toContain('updated_at')
    expect(fn.src).not.toContain('touch_updated_at')
    for (const role of ['anon', 'authenticated']) {
      expect([role, (await rows(`select has_function_privilege($1, 'public.clinic_profiles_touch()', 'EXECUTE') as ok`, [role]))[0].ok]).toEqual([
        role,
        false,
      ])
    }
    expect(String(fn.acl)).not.toMatch(/(^|,)=/) // PUBLIC 몫 없음
  })

  it('AC-6601.1: 원장이 고치면 updated_at이 저절로 지금으로 바뀐다(트리거)', async () => {
    await seedProfile(A, { ...BODY, updated_at: '2020-01-01T00:00:00Z' })
    await become(A)
    expect((await db.query(`update ${PROFILES} set phone = '0312345678'`)).affectedRows).toBe(1)
    await operator()
    expect(await rows(`select phone, updated_at > '2021-01-01' as fresh from ${PROFILES}`)).toEqual([{ phone: '0312345678', fresh: true }])
  })

  it('AC-6601.1: 파일이 있고 줄 끝이 LF이며, 머리 주석에 붙여 넣는 방법·앞 migration·ADR-033·데스크 SQL을 다시 붙이면 이 파일도 다시 붙인다는 말이 있다', () => {
    expect(PROFILE_MIGRATION).not.toBe('')
    expect(PROFILE_MIGRATION).not.toContain('\r')
    const lines = PROFILE_MIGRATION.split('\n')
    const head = lines.slice(0, lines.findIndex((line) => !/^(--|\s*$)/.test(line))).join('\n')
    expect(head).toContain('운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다')
    expect(head).toContain('ADR-033')
    for (const before of ['20261028000000_auth.sql', '20261030000000_precheck_settings.sql', '20261117010000_calendar.sql', '20261118100000_desk_accounts.sql']) {
      expect(head, before).toContain(before)
    }
    expect(head).toMatch(/20261118100000_desk_accounts\.sql[^\n]*다시 붙여 넣으면[^\n]*이 파일도 다시/)
    expect(head).toMatch(/두 번 붙여 넣어도/)
  })

  it('AC-6601.1: 두 번 돌려도 되는 문장만 쓴다(표 if not exists, 칸 if not exists, 함수·트리거 or replace, 정책 지우고 다시, 넣기는 on conflict)', () => {
    const count = (pattern: RegExp) => (PROFILE_TOP.match(pattern) ?? []).length
    expect(count(/create\s+table\s+if\s+not\s+exists\s+public\.clinic_profiles\b/gi)).toBe(1)
    expect(PROFILE_TOP).not.toMatch(/create\s+table\s+(?!if\s+not\s+exists)/i)
    expect(PROFILE_TOP).not.toMatch(/create\s+(unique\s+)?index\s+(?!if\s+not\s+exists)/i)
    expect(PROFILE_TOP).not.toMatch(/create\s+function/i)
    expect(count(/create\s+or\s+replace\s+function/gi)).toBe(2) // clinic_profiles_touch·my_desk
    expect(PROFILE_TOP).not.toMatch(/create\s+(constraint\s+)?trigger/i)
    expect(count(/create\s+or\s+replace\s+trigger/gi)).toBe(2)
    // 문장(; 사이)마다 첫 낱말을 본다: 지우는 문장은 정책 지우기뿐이고, 줄을 지우거나 고치는 문장이 없다
    const statements = PROFILE_TOP.split(';').map((s) => s.trim()).filter(Boolean)
    for (const statement of statements) expect(statement).not.toMatch(/^(drop\s+(?!policy\s+if\s+exists)|truncate|delete|update)\b/i)
    const inserts = [...PROFILE_TOP.matchAll(/^\s*insert\s+into\s+([\w.]+)[^;]+;/gim)]
    expect(inserts.map((m) => m[1])).toEqual(['public.clinic_profiles', 'storage.buckets'])
    for (const [statement] of inserts) expect(statement).toMatch(/on\s+conflict\s+\(\s*\w+\s*\)\s+do\s+/i)
    expect(count(/create\s+policy/gi)).toBe(7)
    expect(count(/drop\s+policy\s+if\s+exists/gi)).toBe(count(/create\s+policy/gi))
    // 고치는 표는 clinic_profiles의 RLS 켜기와 claim_hospital_settings의 input_mode 칸(없을 때만) 더하기뿐이다
    const alters = [...PROFILE_TOP.matchAll(/^\s*alter\s+table[^;]+;/gim)].map(([s]) => s.trim().replace(/\s+/g, ' '))
    expect(alters).toEqual([
      'alter table public.clinic_profiles enable row level security;',
      'alter table public.claim_hospital_settings add column if not exists input_mode text;',
    ])
    // 이름 있는 제약은 없을 때만 더한다(DO 몸통 안)
    expect(PROFILE_SQL).toMatch(
      /if\s+not\s+exists\s*\(\s*select\s+1\s+from\s+pg_constraint[\s\S]*?claim_hospital_settings_input_mode_check[\s\S]*?add\s+constraint\s+claim_hospital_settings_input_mode_check\s+check\s*\(\s*input_mode\s+is\s+null\s+or\s+input_mode\s+in\s*\(\s*'code'\s*,\s*'date'\s*\)\s*\)/i,
    )
  })

  it('AC-6601.1: my_hospital_id()·calendar_bump()는 만들지도 권한을 바꾸지도 않고, 표 권한은 revoke all 뒤에만 준다', () => {
    expect(PROFILE_TOP).not.toMatch(/create\s+(or\s+replace\s+)?function\s+public\.(my_hospital_id|calendar_bump|my_desk_hospital_id|my_clinic_hospital_id)\b/i)
    expect(PROFILE_TOP).not.toMatch(/(grant|revoke)[^;]*on\s+function\s+public\.(my_hospital_id|calendar_bump)\b/i)
    const revoke = PROFILE_TOP.search(/revoke all on table public\.clinic_profiles from public, anon, authenticated;/)
    expect(revoke).toBeGreaterThanOrEqual(0)
    const grants = [...PROFILE_TOP.matchAll(/grant [^;]+ on table public\.clinic_profiles to authenticated;/g)]
    expect(grants).toHaveLength(2)
    for (const grant of grants) expect(grant.index).toBeGreaterThan(revoke)
    expect(PROFILE_TOP).not.toMatch(/grant\s+(all|delete)[^;]*public\.clinic_profiles/i)
  })
})

describe('AC-6601.2 누가 읽고 쓰나', SLOW, () => {
  it('AC-6601.2: 원장 A는 hospital_id 없이 저장하면 A 줄이 생기고(DB 기본값), 다시 저장하면 그 줄을 고친다', async () => {
    await become(A)
    await saveProfile()
    await saveProfile({ ...BODY, display_name: '고친정형외과', honorific: '선생님' })
    const found = await profilesNow()
    expect(found).toEqual([{ hospital_id: hospital[A], ...BODY, display_name: '고친정형외과', honorific: '선생님' }])
  })

  it('AC-6601.2: A는 A 줄만 읽고, B 줄은 고쳐도 0줄이며 B 줄은 그대로다', async () => {
    await seedProfile(A)
    await seedProfile(B, { ...BODY, display_name: '비정형외과' })
    await become(A)
    expect(await hospitalsSeen()).toEqual([hospital[A]])
    expect((await db.query(`update ${PROFILES} set display_name = '바꿈' where hospital_id = $1`, [hospital[B]])).affectedRows).toBe(0)
    await operator()
    expect(await rows(`select display_name from ${PROFILES} where hospital_id = $1`, [hospital[B]])).toEqual([{ display_name: '비정형외과' }])
  })

  it('AC-6601.2: hospital_id·updated_at을 직접 보내거나 바꾸면 권한 없음(42501)이고 지우기도 권한 없음이다', async () => {
    await seedProfile(A)
    await become(A)
    for (const owner of [A, B]) {
      await expect(postgrestInsert(PROFILES, [{ hospital_id: hospital[owner], hours: HOURS }])).rejects.toMatchObject(DENIED)
    }
    await expect(postgrestInsert(PROFILES, [{ hours: HOURS, updated_at: '2020-01-01T00:00:00Z' }])).rejects.toMatchObject(DENIED)
    await expect(db.query(`update ${PROFILES} set hospital_id = $1`, [hospital[B]])).rejects.toMatchObject(DENIED)
    await expect(db.query(`update ${PROFILES} set updated_at = now()`)).rejects.toMatchObject(DENIED)
    await expect(db.query(`delete from ${PROFILES}`)).rejects.toMatchObject(DENIED)
    expect((await profilesNow()).map((r) => r.hospital_id)).toEqual([hospital[A]])
  })

  it('AC-6601.2: A의 데스크는 A 줄을 읽기만 한다(넣기 거부·고치기 0줄·지우기 권한 없음), B의 데스크는 B 줄만 본다', async () => {
    await seedProfile(A)
    await seedProfile(B, { ...BODY, display_name: '비정형외과' })
    const before = await profilesNow()
    await become(K)
    expect(await hospitalsSeen()).toEqual([hospital[A]])
    await expect(saveProfile({ ...BODY, display_name: '데스크가 바꿈' })).rejects.toThrow(RLS_OR_NULL)
    await become(K)
    await expect(postgrestInsert(PROFILES, [{ hours: HOURS }])).rejects.toThrow(RLS_OR_NULL)
    await become(K)
    expect((await db.query(`update ${PROFILES} set display_name = '데스크가 바꿈'`)).affectedRows).toBe(0)
    await expect(db.query(`delete from ${PROFILES}`)).rejects.toMatchObject(DENIED)
    await become(L)
    expect(await hospitalsSeen()).toEqual([hospital[B]])
    expect(await profilesNow()).toEqual(before)
  })

  it.each<[string, string]>([
    ['승인 대기', C],
    ['거절', D],
    ['병원 줄 없음', E],
  ])('AC-6601.2: %s 사용자는 아무 줄도 못 읽고 못 넣고 못 고친다', async (_name, user) => {
    await seedProfile(A)
    if (hospital[user]) await seedProfile(user)
    const before = await profilesNow()
    await become(user)
    expect(await hospitalsSeen()).toEqual([])
    await expect(saveProfile()).rejects.toThrow(RLS_OR_NULL)
    await become(user)
    expect((await db.query(`update ${PROFILES} set display_name = '바꿈'`)).affectedRows).toBe(0)
    expect(await profilesNow()).toEqual(before)
  })

  it('AC-6601.2: anon은 읽기·넣기·고치기·지우기가 모두 권한 없음이다', async () => {
    await seedProfile(A)
    await becomeAnon()
    await expect(db.query(`select * from ${PROFILES}`)).rejects.toMatchObject(DENIED)
    await expect(postgrestInsert(PROFILES, [{ hours: HOURS }])).rejects.toMatchObject(DENIED)
    await expect(db.query(`update ${PROFILES} set display_name = '바꿈'`)).rejects.toMatchObject(DENIED)
    await expect(db.query(`delete from ${PROFILES}`)).rejects.toMatchObject(DENIED)
    expect(await profilesNow()).toHaveLength(1)
  })

  it('AC-6601.2: 승인됐던 병원이 거절되면 그 순간부터 자기 줄도 안 보이고 그 데스크도 못 본다', async () => {
    await seedProfile(A)
    await operator()
    await db.query(`update public.hospitals set status = 'rejected' where id = $1`, [hospital[A]])
    await become(A)
    expect(await hospitalsSeen()).toEqual([])
    await become(K)
    expect(await hospitalsSeen()).toEqual([])
  })
})

describe('AC-6601.3 제약', SLOW, () => {
  const patchSave = (patch: Row) => saveProfile({ ...BODY, ...patch })

  it.each<[string, Row]>([
    ['이름 빈 글자', { display_name: '' }],
    ['이름 앞 빈칸', { display_name: ' 가짜' }],
    ['이름 뒤 빈칸', { display_name: '가짜 ' }],
    ['이름 51자', { display_name: '가'.repeat(51) }],
    ['전화 줄표', { phone: '02-1234-5678' }],
    ['전화 숫자 8자', { phone: '12345678' }],
    ['전화 숫자 12자', { phone: '123456789012' }],
    ['전화 글자 섞임', { phone: '0212345a78' }],
    ['주소 101자', { address: '가'.repeat(101) }],
    ['호칭 셋 밖(원장)', { honorific: '원장' }],
    ['호칭 셋 밖(빈칸 섞임)', { honorific: '대표 원장님' }],
    ['호칭 빈 글자', { honorific: '' }],
    ['진료시간 객체', { hours: {} }],
    ['진료시간 글자', { hours: 'x' }],
    ['진료시간 6칸', { hours: HOURS.slice(0, 6) }],
    ['진료시간 8칸', { hours: [...HOURS, null] }],
    ['진료시간 빈 배열', { hours: [] }],
    ['휴진일 객체', { closed_dates: {} }],
    ['휴진일 글자', { closed_dates: '2026-12-31' }],
    ['직원 객체', { staff: {} }],
    ['로고 자리 121자', { logo_path: 'x'.repeat(121) }],
  ])('AC-6601.3: %s는 거부(23514)된다', async (_name, patch) => {
    await become(A)
    await expect(patchSave(patch)).rejects.toMatchObject(CHECK_FAILED)
    expect(await profilesNow()).toEqual([])
  })

  it.each<[string, Row]>([
    ['호칭 null', { honorific: null }],
    ['진료시간 null', { hours: null }],
    ['휴진일 null', { closed_dates: null }],
    ['직원 null', { staff: null }],
  ])('AC-6601.3: %s는 거부(23502)된다', async (_name, patch) => {
    await become(A)
    await expect(patchSave(patch)).rejects.toMatchObject(NOT_NULL)
    expect(await profilesNow()).toEqual([])
  })

  it('AC-6601.3: 진료시간은 기본값이 없어 보내지 않으면 거부(23502)되고, 호칭·휴진일·직원은 보내지 않으면 원장님·[]·[]다', async () => {
    await become(A)
    await expect(postgrestInsert(PROFILES, [{ display_name: '가짜' }])).rejects.toMatchObject(NOT_NULL)
    await become(A)
    await postgrestInsert(PROFILES, [{ hours: HOURS }])
    expect(await profilesNow()).toEqual([
      { hospital_id: hospital[A], display_name: null, phone: null, address: null, honorific: '원장님', hours: HOURS, closed_dates: [], staff: [], logo_path: null },
    ])
  })

  it.each<[string, Row]>([
    ['이름·전화·주소·로고 자리 null', { display_name: null, phone: null, address: null, logo_path: null }],
    ['이름 1자', { display_name: '가' }],
    ['이름 50자', { display_name: '가'.repeat(50) }],
    ['전화 숫자 9자', { phone: '021234567' }],
    ['전화 숫자 11자', { phone: '01012345678' }],
    ['주소 100자', { address: '가'.repeat(100) }],
    ['호칭 원장님', { honorific: '원장님' }],
    ['호칭 대표원장님', { honorific: '대표원장님' }],
    ['호칭 선생님', { honorific: '선생님' }],
    ['진료시간 7칸 모두 휴진', { hours: [null, null, null, null, null, null, null] }],
    ['로고 자리 120자', { logo_path: 'x'.repeat(120) }],
  ])('AC-6601.3: %s는 들어간다', async (_name, patch) => {
    await become(A)
    await patchSave(patch)
    expect(await profilesNow()).toEqual([{ hospital_id: hospital[A], ...BODY, ...patch }])
  })

  it.each<[string, string, (pad: number) => unknown, number]>([
    ['진료시간', 'hours', (pad) => ['x'.repeat(pad), null, null, null, null, null, null], 2000],
    ['휴진일', 'closed_dates', (pad) => ['x'.repeat(pad)], 8000],
    ['직원', 'staff', (pad) => [{ id: 'x'.repeat(pad) }], 12000],
  ])('AC-6601.3: %s(%s)는 %#번째 한도 — 글자로 한도 바이트까지는 들어가고 1바이트 넘으면 거부(23514)된다', async (_name, column, make, limit) => {
    await become(A)
    const over = await jsonOfBytes(make, limit + 1)
    await expect(patchSave({ [column]: over })).rejects.toMatchObject(CHECK_FAILED)
    await become(A)
    const fits = await jsonOfBytes(make, limit)
    await patchSave({ [column]: fits })
    await operator()
    expect(await rows(`select octet_length(${column}::text)::int as n from ${PROFILES}`)).toEqual([{ n: limit }])
  })

  it('AC-6601.3: 고칠 때도 제약이 그대로다', async () => {
    await seedProfile(A)
    await become(A)
    await expect(db.query(`update ${PROFILES} set phone = '02-123-4567'`)).rejects.toMatchObject(CHECK_FAILED)
    await expect(db.query(`update ${PROFILES} set hours = '[]'::jsonb`)).rejects.toMatchObject(CHECK_FAILED)
    await expect(db.query(`update ${PROFILES} set honorific = '사장님'`)).rejects.toMatchObject(CHECK_FAILED)
    await expect(db.query(`update ${PROFILES} set display_name = ' '`)).rejects.toMatchObject(CHECK_FAILED)
    expect(await profilesNow()).toEqual([{ hospital_id: hospital[A], ...BODY }])
  })
})

describe('AC-6601.5 바뀜 숫자(calendar_rev)', SLOW, () => {
  async function seedRev(owner: string, rev: number) {
    await operator()
    await db.query(`insert into public.calendar_rev (hospital_id, rev) values ($1, $2)`, [hospital[owner], rev])
  }

  it('AC-6601.5: 원장이 병원 정보를 넣으면 내 rev가 하나, 고치면 또 하나 오르고 다른 병원 rev는 그대로다', async () => {
    await seedRev(A, 5)
    await seedRev(B, 7)
    await become(A)
    await postgrestInsert(PROFILES, [{ hours: HOURS, display_name: '가짜' }])
    expect(await revOf(A)).toBe(6)
    await become(A)
    expect((await db.query(`update ${PROFILES} set display_name = '고침'`)).affectedRows).toBe(1)
    expect(await revOf(A)).toBe(7)
    expect(await revOf(B)).toBe(7)
  })

  it('AC-6601.5: 앱의 저장(upsert)으로 넣고 고쳐도 내 rev가 오르고, rev 줄이 없던 병원은 줄이 생긴다', async () => {
    await seedRev(B, 7)
    await become(A)
    await saveProfile()
    const first = await revOf(A)
    expect(first).not.toBeNull()
    expect(first as number).toBeGreaterThanOrEqual(1)
    await become(A)
    await saveProfile({ ...BODY, phone: '0311234567' })
    expect(await revOf(A)).toBeGreaterThan(first as number)
    expect(await revOf(B)).toBe(7)
  })

  it('AC-6601.5: 저장이 거부되면(제약) rev도 그대로고, 운영자가 넣는 줄은 rev를 만들지 않는다', async () => {
    await seedRev(A, 5)
    await become(A)
    await expect(saveProfile({ ...BODY, phone: 'x' })).rejects.toMatchObject(CHECK_FAILED)
    expect(await revOf(A)).toBe(5)
    await seedProfile(B)
    expect(await revOf(B)).toBeNull()
  })
})

describe('AC-6601.6 로고 바구니 clinic-logos', SLOW, () => {
  it('AC-6601.6: clinic-logos 바구니는 공개가 아니고 한 파일 1,000,000바이트·image/png만이다', async () => {
    await operator()
    expect(await rows(`select id, name, public, file_size_limit, allowed_mime_types from storage.buckets where id = $1`, [BUCKET])).toEqual([
      { id: BUCKET, name: BUCKET, public: false, file_size_limit: 1_000_000, allowed_mime_types: ['image/png'] },
    ])
  })

  it('AC-6601.6: storage.objects 정책은 이 바구니의 읽기·올리기·지우기 셋뿐이고 고치기 정책이 없다', async () => {
    const list = await rows(
      `select cmd, permissive, roles::text as roles, coalesce(qual, '') as qual, coalesce(with_check, '') as with_check from pg_policies
       where schemaname = 'storage' and tablename = 'objects' order by cmd`,
    )
    expect(list.map((p) => p.cmd)).toEqual(['DELETE', 'INSERT', 'SELECT'])
    for (const policy of list) {
      expect(policy).toMatchObject({ permissive: 'PERMISSIVE', roles: '{authenticated}' })
      const rule = String(policy.cmd === 'INSERT' ? policy.with_check : policy.qual)
      expect(rule).toContain(`'${BUCKET}'`)
      expect(rule).toContain('foldername')
      expect(rule).toContain('my_hospital_id()')
      if (policy.cmd === 'INSERT') expect(rule).toMatch(/clinic_profiles[\s\S]*logo_path/)
      else expect(rule).not.toContain('clinic_profiles')
    }
  })

  it('AC-6601.6: 원장 A는 자기 logo_path와 같은 이름으로 올리고, 자기 폴더 파일을 읽고 지운다', async () => {
    await become(A)
    await saveProfile({ ...BODY, logo_path: logoOf(A) })
    expect(await upload(logoOf(A))).toEqual([{ bucket_id: BUCKET, name: logoOf(A) }])
    expect(await rows(`select name from storage.objects`)).toEqual([{ name: logoOf(A) }])
    expect(await rows(`delete from storage.objects where name = $1 returning name`, [logoOf(A)])).toEqual([{ name: logoOf(A) }])
    expect(await objects()).toEqual([])
  })

  it('AC-6601.6: 로고를 바꾸면 새 이름을 logo_path에 적고 올린 뒤, 옛 파일(지금 logo_path가 아님)도 지울 수 있다', async () => {
    await become(A)
    await saveProfile({ ...BODY, logo_path: logoOf(A) })
    await upload(logoOf(A))
    await saveProfile({ ...BODY, logo_path: logoOf(A, 'logo-2.png') })
    await upload(logoOf(A, 'logo-2.png'))
    expect(await rows(`delete from storage.objects where name = $1 returning name`, [logoOf(A)])).toEqual([{ name: logoOf(A) }])
    expect(await objects()).toEqual([{ bucket_id: BUCKET, name: logoOf(A, 'logo-2.png') }])
  })

  it('AC-6601.6: 자기 폴더라도 logo_path와 다른 이름·병원 정보 줄이 없을 때·logo_path가 null일 때는 올리지 못한다', async () => {
    await become(A)
    await expect(upload(logoOf(A))).rejects.toThrow(RLS_REJECTED) // 줄 없음
    await become(A)
    await saveProfile({ ...BODY, logo_path: null })
    await expect(upload(logoOf(A))).rejects.toThrow(RLS_REJECTED)
    await become(A)
    await saveProfile({ ...BODY, logo_path: logoOf(A) })
    for (const name of [logoOf(A, 'logo-2.png'), `${hospital[A]}/x/logo-1.png`, `${hospital[A]}/`, 'logo-1.png']) {
      await become(A)
      await expect(upload(name), name).rejects.toThrow(RLS_REJECTED)
    }
    expect(await objects()).toEqual([])
  })

  it('AC-6601.6: logo_path가 다른 병원 폴더 이름이거나 다른 바구니면 올리지 못한다', async () => {
    await become(A)
    await saveProfile({ ...BODY, logo_path: logoOf(B) })
    await expect(upload(logoOf(B))).rejects.toThrow(RLS_REJECTED)
    await become(A)
    await saveProfile({ ...BODY, logo_path: logoOf(A) })
    await expect(upload(logoOf(A), OTHER_BUCKET)).rejects.toThrow(RLS_REJECTED)
    expect(await objects()).toEqual([])
  })

  it('AC-6601.6: 다른 병원 로고는 안 보이고 안 지워지며, 다른 바구니의 내 폴더 파일도 안 보이고 안 지워진다', async () => {
    await seedObject(logoOf(B))
    await seedObject(logoOf(A), OTHER_BUCKET)
    const before = await objects()
    await become(A)
    expect(await rows(`select name from storage.objects`)).toEqual([])
    expect(await rows(`delete from storage.objects returning name`)).toEqual([])
    expect(await objects()).toEqual(before)
  })

  it('AC-6601.6: 덮어쓰기(고치기)는 내 로고여도 0줄이다', async () => {
    await seedProfile(A, { ...BODY, logo_path: logoOf(A) })
    await seedObject(logoOf(A))
    const before = await objects()
    await become(A)
    expect(await rows(`update storage.objects set metadata = '{}'::jsonb returning name`)).toEqual([])
    expect(await rows(`update storage.objects set name = $1 returning name`, [logoOf(A, 'logo-2.png')])).toEqual([])
    expect(await objects()).toEqual(before)
  })

  it.each<[string, string]>([
    ['A의 데스크', K],
    ['승인 대기', C],
    ['거절', D],
    ['병원 줄 없음', E],
  ])('AC-6601.6: %s 사용자는 로고를 못 보고 못 올리고 못 지운다', async (_name, user) => {
    await seedProfile(A, { ...BODY, logo_path: logoOf(A) })
    await seedObject(logoOf(A))
    if (hospital[user]) {
      await seedProfile(user, { ...BODY, logo_path: logoOf(user) })
      await seedObject(logoOf(user))
    }
    const before = await objects()
    await become(user)
    expect(await rows(`select name from storage.objects`)).toEqual([])
    await expect(upload(hospital[user] ? logoOf(user, 'logo-2.png') : logoOf(A, 'logo-2.png'))).rejects.toThrow(RLS_REJECTED)
    await become(user)
    expect(await rows(`delete from storage.objects returning name`)).toEqual([])
    expect(await objects()).toEqual(before)
  })

  it('AC-6601.6: anon은 로고를 못 보고 못 올리고 못 고치고 못 지운다', async () => {
    await seedProfile(A, { ...BODY, logo_path: logoOf(A) })
    await seedObject(logoOf(A))
    const before = await objects()
    await becomeAnon()
    expect(await rows(`select name from storage.objects`)).toEqual([])
    await expect(upload(logoOf(A, 'logo-2.png'))).rejects.toThrow(RLS_REJECTED)
    expect(await rows(`update storage.objects set metadata = '{}'::jsonb returning name`)).toEqual([])
    expect(await rows(`delete from storage.objects returning name`)).toEqual([])
    expect(await objects()).toEqual(before)
  })
})

describe('AC-6601.7 my_desk() 이름', SLOW, () => {
  const myDesk = async () => rows(`select * from public.my_desk()`)

  it('AC-6601.7: 병원 정보 줄이 없으면 데스크의 hospital_name은 가입 이름이다', async () => {
    await become(K)
    expect(await myDesk()).toEqual([{ hospital_id: hospital[A], hospital_name: NAME[A] }])
  })

  it('AC-6601.7: 병원 정보 이름이 있으면 그 이름, 이름 칸이 비었으면 가입 이름이고 다른 병원 데스크는 자기 병원 이름이다', async () => {
    await seedProfile(A, { ...BODY, display_name: '가짜정형외과' })
    await become(K)
    expect(await myDesk()).toEqual([{ hospital_id: hospital[A], hospital_name: '가짜정형외과' }])
    await become(L)
    expect(await myDesk()).toEqual([{ hospital_id: hospital[B], hospital_name: NAME[B] }])
    await operator()
    await db.query(`update ${PROFILES} set display_name = null where hospital_id = $1`, [hospital[A]])
    await become(K)
    expect(await myDesk()).toEqual([{ hospital_id: hospital[A], hospital_name: NAME[A] }])
  })

  it('AC-6601.7: 데스크가 아닌 사용자(원장·대기·거절·병원 없음)는 지금처럼 빈 목록이다', async () => {
    await seedProfile(A)
    for (const user of [A, B, C, D, E]) {
      await become(user)
      expect([user, await myDesk()]).toEqual([user, []])
    }
  })

  it('AC-6601.7: my_desk()는 돌려주는 칸·정의자 권한·search_path·변하는 정도·권한이 그대로이고 몸통이 병원 정보 이름을 먼저 쓴다', async () => {
    const [fn] = await rows(
      `select p.prosecdef as definer, p.proconfig as config, p.provolatile as volatility, pg_get_function_result(p.oid) as result,
              pg_get_function_arguments(p.oid) as args, p.prosrc as src, coalesce(array_to_string(p.proacl, ','), '') as acl
       from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'my_desk'`,
    )
    expect(fn).toMatchObject({ definer: true, config: ['search_path=""'], volatility: 's', result: 'TABLE(hospital_id uuid, hospital_name text)', args: '' })
    expect(String(fn.src).replace(/\s+/g, ' ')).toContain('coalesce(p.display_name, h.name)')
    expect(fn.src).toContain('public.clinic_profiles')
    expect(fn.src).toContain('public.my_desk_hospital_id()')
    expect((await rows(`select has_function_privilege('anon', 'public.my_desk()', 'EXECUTE') as ok`))[0].ok).toBe(false)
    expect((await rows(`select has_function_privilege('authenticated', 'public.my_desk()', 'EXECUTE') as ok`))[0].ok).toBe(true)
    expect(String(fn.acl)).not.toMatch(/(^|,)=/)
  })
})

describe('AC-6610.1 청구 입력 방식 칸 input_mode', SLOW, () => {
  async function seedClaim(owner: string) {
    await operator()
    await db.query(`insert into ${CLAIM} (hospital_id, phrases, dx_links) values ($1, '{"TPL": {}}', '[["MM410"]]')`, [hospital[owner]])
  }
  async function claimNow() {
    await operator()
    return rows(`select hospital_id, phrases, dx_links, input_mode from ${CLAIM} order by hospital_id`)
  }

  it('AC-6610.1: claim_hospital_settings에 input_mode(text, 비울 수 있음, 기본값 없음) 칸과 이름 있는 제약이 있다', async () => {
    expect(
      await rows(
        `select column_name, udt_name, is_nullable, column_default from information_schema.columns
         where table_schema = 'public' and table_name = 'claim_hospital_settings' and column_name = 'input_mode'`,
      ),
    ).toEqual([{ column_name: 'input_mode', udt_name: 'text', is_nullable: 'YES', column_default: null }])
    const [constraint] = await rows(
      `select pg_get_constraintdef(oid) as def from pg_constraint where conrelid = to_regclass($1) and conname = 'claim_hospital_settings_input_mode_check'`,
      [CLAIM],
    )
    expect(constraint.def).toMatch(/input_mode IS NULL/)
    expect(constraint.def).toMatch(/'code'/)
    expect(constraint.def).toMatch(/'date'/)
  })

  it('AC-6610.1: authenticated는 input_mode를 고치기만 할 수 있고 넣기 권한은 없으며, anon은 아무 권한도 없다', async () => {
    const found = await rows(
      `select grantee, privilege_type from information_schema.column_privileges
       where table_schema = 'public' and table_name = 'claim_hospital_settings' and column_name = 'input_mode'
         and grantee in ('anon', 'authenticated', 'PUBLIC') and privilege_type in ('INSERT', 'UPDATE') order by 1, 2`,
    )
    expect(found).toEqual([{ grantee: 'authenticated', privilege_type: 'UPDATE' }])
  })

  it("AC-6610.1: 원장은 내 줄의 input_mode를 'code'·'date'·null로 고치고, 병원 문구·상병 연결표는 그대로다", async () => {
    await seedClaim(A)
    await become(A)
    for (const mode of ['code', 'date', null]) {
      expect((await db.query(`update ${CLAIM} set input_mode = $1`, [mode])).affectedRows).toBe(1)
      expect(await claimNow()).toEqual([{ hospital_id: hospital[A], phrases: { TPL: {} }, dx_links: [['MM410']], input_mode: mode }])
      await become(A)
    }
  })

  it.each(['Code', 'DATE', '', 'auto', ' code'])("AC-6610.1: input_mode가 'code'·'date'·null 밖(%j)이면 거부(23514)된다", async (mode) => {
    await seedClaim(A)
    await become(A)
    await expect(db.query(`update ${CLAIM} set input_mode = $1`, [mode])).rejects.toMatchObject(CHECK_FAILED)
    expect((await claimNow())[0].input_mode).toBeNull()
  })

  it('AC-6610.1: 넣을 때 input_mode를 보내면 권한 없음(42501)이다(지금 넣기 칸 그대로)', async () => {
    await become(A)
    await expect(db.query(`insert into ${CLAIM} (phrases, input_mode) values ('{}', 'code')`)).rejects.toMatchObject(DENIED)
    expect(await claimNow()).toEqual([])
  })

  it('AC-6610.1: 원장은 남의 병원 줄을 못 고치고, 데스크·대기·거절·병원 없음은 아무 줄도 못 고친다', async () => {
    await seedClaim(A)
    await seedClaim(B)
    if (hospital[C]) await seedClaim(C)
    const before = await claimNow()
    await become(A)
    expect((await db.query(`update ${CLAIM} set input_mode = 'code' where hospital_id = $1`, [hospital[B]])).affectedRows).toBe(0)
    for (const user of [K, C, D, E]) {
      await become(user)
      expect([user, (await db.query(`update ${CLAIM} set input_mode = 'code'`)).affectedRows]).toEqual([user, 0])
      expect([user, await rows(`select hospital_id from ${CLAIM}`)]).toEqual([user, []])
    }
    await becomeAnon()
    await expect(db.query(`update ${CLAIM} set input_mode = 'code'`)).rejects.toMatchObject(DENIED)
    expect(await claimNow()).toEqual(before)
  })
})

// 운영자 눈으로 본 이 파일이 만드는 것과 고치는 것의 모양(두 번 돌려도 같은지 견줄 때)
async function shapeOf(target: PGlite) {
  const q = (sql: string, params: unknown[] = []) => rows(sql, params, target)
  const TABLES = ['clinic_profiles', 'claim_hospital_settings']
  return {
    columns: await q(
      `select table_name, column_name, data_type, is_nullable, column_default from information_schema.columns
       where table_schema = 'public' and table_name = any($1) order by 1, ordinal_position`,
      [TABLES],
    ),
    constraints: await q(
      `select conrelid::regclass::text as tbl, conname, pg_get_constraintdef(oid) as def from pg_constraint
       where conrelid = any($1::regclass[]) order by 1, 2`,
      [TABLES.map((t) => `public.${t}`)],
    ),
    access: await q(
      `select c.relname, c.relrowsecurity, (select array_agg(item::text order by item::text) from unnest(c.relacl) item) as acl,
              (select array_agg(a.attname || ':' || coalesce(a.attacl::text, '') order by a.attnum) from pg_attribute a
                where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped) as columns
       from pg_class c where c.relnamespace = 'public'::regnamespace and c.relname = any($1) order by 1`,
      [TABLES],
    ),
    policies: await q(
      `select schemaname, tablename, policyname, cmd, permissive, roles::text[] as roles, qual, with_check from pg_policies
       where (schemaname = 'public' and tablename = any($1)) or schemaname = 'storage' order by 1, 2, 3`,
      [TABLES],
    ),
    triggers: await q(
      `select tgrelid::regclass::text as tbl, tgname, pg_get_triggerdef(oid) as def from pg_trigger
       where tgrelid = any($1::regclass[]) and not tgisinternal order by 1, 2`,
      [TABLES.map((t) => `public.${t}`)],
    ),
    functions: await functionsOf(target),
    buckets: await q(`select id, name, public, file_size_limit, allowed_mime_types from storage.buckets order by id`),
  }
}

// public 함수마다 정의 글·권한·속성
async function functionsOf(target: PGlite) {
  return rows(
    `select p.oid::regprocedure::text as fn, pg_get_functiondef(p.oid) as def, p.prosecdef as definer, p.proconfig as config,
            p.provolatile as volatility, pg_get_function_result(p.oid) as result,
            (select array_agg(item::text order by item::text) from unnest(p.proacl) item) as acl
     from pg_proc p where p.pronamespace = 'public'::regnamespace order by 1`,
    [],
    target,
  )
}

describe('AC-6601.4 예약 시행자 옮기기 · 두 번 실행', SLOW, () => {
  const F = '00000000-0000-4000-8000-00000000000f' // 시행자가 아주 많은 병원(옮기면 12,000바이트를 넘음)
  const OWNERS: Record<string, 'approved' | 'pending'> = { [A]: 'approved', [B]: 'approved', [C]: 'pending', [D]: 'approved', [F]: 'approved' }
  const STAFF_A = [
    { id: 'st-na', name: '나다라', mark: '나', color: 'pink' },
    { id: 'st-ga', name: '가나다', mark: '가', color: 'teal' },
  ]
  const STAFF_C = [{ id: 'st-x', name: '엑스', mark: '엑', color: 'lime' }]
  const STAFF_F = Array.from({ length: 260 }, (_, i) => ({ id: `s${i}` }))
  const moved = (people: Row[]) => people.map((person) => ({ ...person, role: 'staff', calendar: true }))
  const days = (open: number, close: number, sunday: boolean) => {
    const day = { open: open * 60, close: close * 60, lunchFrom: null, lunchTo: null }
    return [day, day, day, day, day, day, sunday ? day : null]
  }

  let fresh: PGlite
  const ids: Record<string, string> = {}
  let functionsBefore: Row[] = []
  let calendarBefore: Row = {}
  let once: Awaited<ReturnType<typeof shapeOf>>

  // 운영자 눈으로 본 예약 표 넷(바뀌지 않았는지 견줄 때)
  async function calendarNow() {
    await operator(fresh)
    const pick = (table: string) => rows(`select hospital_id, (to_jsonb(t) - 'hospital_id')::text as body from ${table} t order by 1, 2`, [], fresh)
    return {
      settings: await pick('public.calendar_settings'),
      appts: await pick('public.calendar_appts'),
      allday: await pick('public.calendar_allday'),
      rev: await pick('public.calendar_rev'),
    }
  }

  const profileOf = async (owner: string) =>
    rows(
      `select display_name, phone, address, honorific, hours, closed_dates, staff, logo_path from ${PROFILES} where hospital_id = $1`,
      [ids[owner]],
      fresh,
    )

  beforeAll(async () => {
    fresh = await PGlite.create()
    await migrateChain(fresh)
    functionsBefore = await functionsOf(fresh)
    for (const [user, status] of Object.entries(OWNERS)) {
      await fresh.query('insert into auth.users (id, email) values ($1, $2)', [user, emailOf(user)])
      const [row] = await rows(
        `insert into public.hospitals (owner_id, name, applicant_name, email, status) values ($1, $2, '홍길동', $3, $4) returning id`,
        [user, `가짜병원${user.slice(-1)}`, emailOf(user), status],
        fresh,
      )
      ids[user] = row.id as string
    }
    const settings = (owner: string, staff: Row[], open: number, close: number, sunday: boolean) =>
      fresh.query(`insert into public.calendar_settings (hospital_id, staff, open_hour, close_hour, sunday) values ($1, $2::jsonb, $3, $4, $5)`, [
        ids[owner],
        JSON.stringify(staff),
        open,
        close,
        sunday,
      ])
    await settings(A, STAFF_A, 9, 19, false)
    await settings(B, [], 8, 24, true)
    await settings(C, STAFF_C, 8, 20, false)
    await settings(F, STAFF_F, 8, 20, false)
    await fresh.query(
      `insert into public.calendar_appts (hospital_id, day, start_min, len_min, name, staff_id, staff_name, staff_mark, kind_id, kind_name)
       values ($1, '2026-11-18', 600, 30, '가짜환자', 'st-ga', '가나다', '가', 'dosu', '도수'), ($1, '2026-11-19', 660, 10, '가짜환자둘', 'st-na', '나다라', '나', 'inj', '주사')`,
      [ids[A]],
    )
    await fresh.query(`insert into public.calendar_allday (hospital_id, day, type, staff_id, staff_name) values ($1, '2026-11-20', 'off', 'st-na', '나다라')`, [ids[A]])
    await fresh.query(`insert into public.calendar_rev (hospital_id, rev) values ($1, 41)`, [ids[A]])
    calendarBefore = await calendarNow()
    await fresh.exec(PROFILE_MIGRATION)
    once = await shapeOf(fresh)
  }, 240_000)

  afterAll(async () => {
    await fresh.close()
  })

  it('AC-6601.4: 예약 설정이 있는 병원마다 병원 정보 줄이 생기고, staff는 시행자 id·이름·표시·색·차례 그대로에 role staff·calendar true가 붙는다', async () => {
    expect(await profileOf(A)).toEqual([
      { display_name: null, phone: null, address: null, honorific: '원장님', hours: days(9, 19, false), closed_dates: [], staff: moved(STAFF_A), logo_path: null },
    ])
    expect((await profileOf(A))[0].staff).toEqual([
      { id: 'st-na', name: '나다라', mark: '나', color: 'pink', role: 'staff', calendar: true },
      { id: 'st-ga', name: '가나다', mark: '가', color: 'teal', role: 'staff', calendar: true },
    ])
    expect(await profileOf(C)).toEqual([expect.objectContaining({ staff: moved(STAFF_C), hours: days(8, 20, false) })])
  })

  it('AC-6601.4: hours는 월~토 open_hour~close_hour(분)·점심 없음이고, 일요일은 예약 설정에서 켜졌을 때만 같은 시간이다(아니면 null)', async () => {
    const [a] = await profileOf(A)
    expect(a.hours).toEqual([...Array.from({ length: 6 }, () => ({ open: 540, close: 1140, lunchFrom: null, lunchTo: null })), null])
    const [b] = await profileOf(B)
    expect(b.hours).toEqual(Array.from({ length: 7 }, () => ({ open: 480, close: 1440, lunchFrom: null, lunchTo: null })))
    expect(b.staff).toEqual([])
  })

  it('AC-6601.4: 예약 설정이 없는 병원은 줄이 없고, 옮기면 staff가 12,000바이트를 넘는 병원은 건너뛰며 SQL은 끝까지 돈다', async () => {
    expect(await profileOf(D)).toEqual([])
    expect(await profileOf(F)).toEqual([])
    expect((await rows(`select count(*)::int as n from ${PROFILES}`, [], fresh))[0].n).toBe(3)
    // 끝 문장(바구니·my_desk·input_mode)까지 돌았다
    expect(await rows(`select id from storage.buckets where id = $1`, [BUCKET], fresh)).toEqual([{ id: BUCKET }])
    expect(await rows(`select column_name from information_schema.columns where table_name = 'claim_hospital_settings' and column_name = 'input_mode'`, [], fresh)).toHaveLength(1)
  })

  it('AC-6601.4: 예약 설정·예약·종일 줄·바뀜 숫자는 바뀌지 않는다(운영자가 넣은 줄이라 rev도 그대로)', async () => {
    expect(await calendarNow()).toEqual(calendarBefore)
  })

  it('AC-6601.1·AC-6601.7: 이 파일 전에 있던 함수는 my_desk 말고 글자·권한·속성이 그대로다(my_hospital_id·calendar_bump 포함)', async () => {
    const after = await functionsOf(fresh)
    const byName = (list: Row[]) => Object.fromEntries(list.map((f) => [f.fn as string, f]))
    const old = byName(functionsBefore)
    const now = byName(after)
    expect(Object.keys(old)).toEqual(expect.arrayContaining(['my_hospital_id()', 'calendar_bump()', 'my_desk()', 'my_desk_hospital_id()', 'my_clinic_hospital_id()']))
    expect(String(old['calendar_bump()'].def)).toContain('public.my_clinic_hospital_id()')
    for (const name of Object.keys(old).filter((n) => n !== 'my_desk()')) expect([name, now[name]]).toEqual([name, old[name]])
    // my_desk는 모양·권한이 그대로이고 정의 글만 바뀐다
    const pick = ({ definer, config, volatility, result, acl }: Row) => ({ definer, config, volatility, result, acl })
    expect(pick(now['my_desk()'])).toEqual(pick(old['my_desk()']))
    expect(now['my_desk()'].def).not.toEqual(old['my_desk()'].def)
    // 새로 생긴 함수는 clinic_profiles_touch 하나뿐이다
    expect(Object.keys(now).filter((n) => !(n in old))).toEqual(['clinic_profiles_touch()'])
  })

  it('AC-6601.1·AC-6601.4: 두 번 돌리면 이미 있는 줄은 그대로(원장이 고친 값), 새로 예약 설정이 생긴 병원만 줄이 생기고, 모양·바구니 설정이 첫 번째와 같다', async () => {
    await operator(fresh)
    await fresh.query(`update ${PROFILES} set display_name = '고친이름', staff = '[]', hours = $2::jsonb where hospital_id = $1`, [ids[A], JSON.stringify(HOURS)])
    await fresh.query(`insert into public.calendar_settings (hospital_id, staff) values ($1, $2::jsonb)`, [ids[D], JSON.stringify(STAFF_C)])
    await fresh.query(`update storage.buckets set public = true, file_size_limit = 1, allowed_mime_types = null where id = $1`, [BUCKET])
    const kept = { a: await profileOf(A), b: await profileOf(B), c: await profileOf(C) }
    expect(kept.a[0]).toMatchObject({ display_name: '고친이름', staff: [], hours: HOURS })

    await fresh.exec(PROFILE_MIGRATION)

    expect({ a: await profileOf(A), b: await profileOf(B), c: await profileOf(C) }).toEqual(kept)
    expect(await profileOf(D)).toEqual([expect.objectContaining({ staff: moved(STAFF_C), hours: days(8, 20, false) })])
    expect(await profileOf(F)).toEqual([])
    expect(await shapeOf(fresh)).toEqual(once)
  })
})

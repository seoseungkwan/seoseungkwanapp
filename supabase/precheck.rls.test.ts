import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

// 청구 설정 표 세 개와 건수 표 세 개의 RLS·권한·제약 (precheck REQ-012·REQ-019, design.md 8-1·8-2·8-3).
// rls.test.ts와 같은 방법: 진짜 Postgres(PGlite, WASM)에서 운영자가 SQL 편집기에 붙일 마이그레이션 파일을 차례로 그대로 돌린다.
// 실제 Supabase에는 붙지 않는다. Supabase가 미리 갖춘 것(역할·auth 스키마·auth.uid()·auth.jwt()·새 표와 함수의 기본 권한·storage)만 아래에서 흉내 낸다
const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf-8')
const AUTH_MIGRATION = read('./migrations/20261028000000_auth.sql')
const SETTINGS_MIGRATION = read('./migrations/20261030000000_precheck_settings.sql')
const COUNTS_MIGRATION = read('./migrations/20261030000100_precheck_counts.sql')
// 병원 정보 SQL(clinic-profile REQ-6610)이 claim_hospital_settings에 입력 방식 칸 input_mode를 더한다(고치기 칸 권한만).
// 그 파일이 기대는 앞 migration(업무일지 넷·통계 묶음 둘·수납일지·예약·데스크)도 차례로 돌린다. 파일이 아직 없으면 빈 글자다
const PROFILE_PATH = fileURLToPath(new URL('./migrations/20261119000000_clinic_profile.sql', import.meta.url))
const PROFILE_CHAIN = [
  ...[
    '20261101000100_worklog.sql',
    '20261101000110_worklog_bit_fields.sql',
    '20261105000200_worklog_memo_font.sql',
    '20261105000300_worklog_cash_float.sql',
    '20261105000100_stats_rx_groups.sql',
    '20261112000000_stats_rx_groups_exclude.sql',
    '20261116000000_sunap.sql',
    '20261117010000_calendar.sql',
    '20261118100000_desk_accounts.sql',
  ].map((name) => read(`./migrations/${name}`)),
  existsSync(PROFILE_PATH) ? readFileSync(PROFILE_PATH, 'utf-8') : '',
]

const SUPABASE_MOCK = `
  create role anon nologin;
  create role authenticated nologin;
  grant usage on schema public to anon, authenticated;
  -- Supabase는 public에 새로 만든 표·함수에 anon·authenticated 모든 권한을 준다(migration이 거둬야 한다)
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;

  create schema auth;
  grant usage on schema auth to anon, authenticated;
  create table auth.users (id uuid primary key, email text, last_sign_in_at timestamptz);
  create function auth.jwt() returns jsonb language sql stable
    as $$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
`

// Supabase Storage가 갖춘 것(병원 정보 SQL이 로고 바구니와 그 정책을 만든다). 모양은 formBackgrounds.rls.test.ts와 같다
const STORAGE_MOCK = `
  create schema storage;
  grant usage on schema storage to anon, authenticated;
  create table storage.buckets (id text primary key, name text not null, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text not null, owner uuid default auth.uid(), unique (bucket_id, name));
  alter table storage.buckets enable row level security;
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language plpgsql as $$
  declare _parts text[];
  begin
    select string_to_array(name, '/') into _parts;
    return _parts[1:array_length(_parts, 1) - 1];
  end $$;
`

const A = '00000000-0000-4000-8000-00000000000a'
const B = '00000000-0000-4000-8000-00000000000b'
const C = '00000000-0000-4000-8000-00000000000c'
const D = '00000000-0000-4000-8000-00000000000d'
const E = '00000000-0000-4000-8000-00000000000e' // 병원 줄이 없는 사용자
const USERS = [A, B, C, D, E]
const emailOf = (user: string) => `${user.slice(-1)}@fake.test`

type Status = 'pending' | 'approved' | 'rejected'

const TABLES = ['claim_rule_settings', 'claim_hospital_settings', 'message_templates'] as const
const ADD_RULE = `insert into public.claim_rule_settings (rule_id, enabled, grade) values ('LA-01', false, '알림')`
const ADD_PHRASES = `insert into public.claim_hospital_settings (phrases) values ('{"TPL": {}}')`
const ADD_TEMPLATE = `insert into public.message_templates (kind, name, body) values ('followup', 'F/U 안내', '안녕하세요')`
const ADDS = [ADD_RULE, ADD_PHRASES, ADD_TEMPLATE]

// PGlite 첫 실행(WASM 불러오기)이 느린 PC·CI에서도 흔들리지 않게
const SLOW = { timeout: 30_000 }
const DENIED = /permission denied/
const CHECK = /check constraint/
// 승인 안 됐으면 hospital_id 기본값이 null이고, 정책 with check가 not null 제약보다 먼저 거부한다
const RLS_REJECTED = /row-level security/

let db: PGlite

beforeAll(async () => {
  db = await PGlite.create()
  await db.exec(SUPABASE_MOCK)
  await db.exec(STORAGE_MOCK)
  await db.exec(AUTH_MIGRATION)
  await db.exec(SETTINGS_MIGRATION)
  await db.exec(COUNTS_MIGRATION)
  for (const sql of PROFILE_CHAIN) await db.exec(sql)
}, 180_000)

// 시험마다 빈 표에서 시작한다(병원·설정 줄은 auth.users를 따라 함께 비워진다). 운영자(superuser)는 RLS를 건너뛴다
beforeEach(async () => {
  await operator()
  await db.exec('truncate auth.users cascade')
  for (const user of USERS) await db.query('insert into auth.users (id, email) values ($1, $2)', [user, emailOf(user)])
})

async function operator() {
  await db.exec('reset role; reset request.jwt.claims')
}

async function become(user: string) {
  await operator()
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: user, email: emailOf(user) })])
  await db.exec('set role authenticated')
}

async function becomeAnon() {
  await operator()
  await db.exec('set role anon')
}

async function rows(sql: string, params: unknown[] = []) {
  return (await db.query<Record<string, unknown>>(sql, params)).rows
}

async function addHospital(owner: string, status: Status) {
  await operator()
  const [row] = await rows(
    `insert into public.hospitals (owner_id, name, applicant_name, email, status)
     values ($1, '가짜병원', '홍길동', $2, $3) returning id`,
    [owner, emailOf(owner), status],
  )
  return row.id as string
}

// 운영자가 그 병원 줄을 표마다 하나씩 넣는다(RLS를 건너뛴다). 다음 명령은 다시 역할을 정하고 돌린다
async function seed(hospital: string, updatedAt = '2020-01-01T00:00:00Z') {
  await operator()
  await db.query(
    `insert into public.claim_rule_settings (hospital_id, rule_id, enabled, grade, updated_at) values ($1, 'LA-01', false, '알림', $2)`,
    [hospital, updatedAt],
  )
  await db.query(`insert into public.claim_hospital_settings (hospital_id, phrases, updated_at) values ($1, '{"TPL": {}}', $2)`, [
    hospital,
    updatedAt,
  ])
  await db.query(
    `insert into public.message_templates (hospital_id, kind, name, body, updated_at) values ($1, 'followup', 'F/U 안내', '안녕하세요', $2)`,
    [hospital, updatedAt],
  )
}

async function countAll(table: string) {
  await operator()
  const [row] = await rows(`select count(*)::int as n from public.${table}`)
  return row.n as number
}

describe('AC-012.1 세 표의 RLS·권한, 두 함수의 속성', SLOW, () => {
  it('AC-012.1: 세 표 모두 RLS가 켜져 있다', async () => {
    const found = await rows(
      `select relname, relrowsecurity from pg_class
       where relnamespace = 'public'::regnamespace and relname = any($1) order by relname`,
      [[...TABLES]],
    )
    expect(found).toEqual(
      [...TABLES].sort().map((relname) => ({ relname, relrowsecurity: true })),
    )
  })

  it('AC-012.1: anon에게 준 표·칸 권한이 하나도 없다(기본 권한을 먼저 거뒀다)', async () => {
    const tables = await rows(
      `select table_name from information_schema.role_table_grants
       where grantee = 'anon' and table_schema = 'public' and table_name = any($1)`,
      [[...TABLES]],
    )
    expect(tables).toEqual([])
    const columns = await rows(
      `select table_name from information_schema.column_privileges
       where grantee = 'anon' and table_schema = 'public' and table_name = any($1)`,
      [[...TABLES]],
    )
    expect(columns).toEqual([])
  })

  it('AC-012.1: authenticated의 표 전체 권한은 select와, claim_rule_settings·message_templates의 delete뿐이다(all을 주지 않았다)', async () => {
    const grants = await rows(
      `select table_name, privilege_type from information_schema.role_table_grants
       where grantee = 'authenticated' and table_schema = 'public' and table_name = any($1)
       order by table_name, privilege_type`,
      [[...TABLES]],
    )
    expect(grants).toEqual([
      { table_name: 'claim_hospital_settings', privilege_type: 'SELECT' },
      { table_name: 'claim_rule_settings', privilege_type: 'DELETE' },
      { table_name: 'claim_rule_settings', privilege_type: 'SELECT' },
      { table_name: 'message_templates', privilege_type: 'DELETE' },
      { table_name: 'message_templates', privilege_type: 'SELECT' },
    ])
  })

  it('AC-012.1·AC-6610.1: 넣기·고치기는 칸 단위이고 hospital_id·updated_at·id 칸이 빠졌다(병원 문구 고치기에는 입력 방식 input_mode가 더해진다)', async () => {
    const found = await rows(
      `select table_name, column_name, privilege_type from information_schema.column_privileges
       where grantee = 'authenticated' and table_schema = 'public' and table_name = any($1)
         and privilege_type in ('INSERT', 'UPDATE')`,
      [[...TABLES]],
    )
    const columnsOf = (table: string, privilege: string) =>
      found
        .filter((r) => r.table_name === table && r.privilege_type === privilege)
        .map((r) => r.column_name as string)
        .sort()
    for (const privilege of ['INSERT', 'UPDATE']) {
      expect(columnsOf('claim_rule_settings', privilege), privilege).toEqual(['enabled', 'grade', 'rule_id'])
      expect(columnsOf('message_templates', privilege), privilege).toEqual(['body', 'kind', 'name', 'sort_order'])
    }
    expect(columnsOf('claim_hospital_settings', 'INSERT'), 'INSERT').toEqual(['dx_links', 'phrases'])
    expect(columnsOf('claim_hospital_settings', 'UPDATE'), 'UPDATE').toEqual(['dx_links', 'input_mode', 'phrases'])
  })

  it.each(['my_hospital_id', 'touch_updated_at'])('AC-012.1: %s()는 security definer·search_path 빈칸이고 authenticated만 부를 수 있다', async (name) => {
    const [fn] = await rows(
      `select prosecdef, proconfig,
              has_function_privilege('anon', oid, 'execute') as anon,
              has_function_privilege('authenticated', oid, 'execute') as authenticated,
              exists (select 1 from aclexplode(proacl) a where a.grantee = 0) as to_public
       from pg_proc where proname = $1 and pronamespace = 'public'::regnamespace`,
      [name],
    )
    expect(fn).toEqual({ prosecdef: true, proconfig: ['search_path=""'], anon: false, authenticated: true, to_public: false })
  })

  it('AC-012.1: anon은 my_hospital_id()를 부를 수 없다', async () => {
    await becomeAnon()
    await expect(db.query('select public.my_hospital_id()')).rejects.toThrow(DENIED)
  })

  it('AC-012.1: my_hospital_id()는 승인된 내 병원 id만 돌려준다(승인 안 됐거나 병원이 없으면 null)', async () => {
    const approved = await addHospital(A, 'approved')
    await addHospital(C, 'pending')
    await addHospital(D, 'rejected')
    await become(A)
    expect(await rows('select public.my_hospital_id() as id')).toEqual([{ id: approved }])
    for (const user of [C, D, E]) {
      await become(user)
      expect(await rows('select public.my_hospital_id() as id'), user).toEqual([{ id: null }])
    }
  })

  // 표마다 다른 기능(업무일지·환자·매출)도 같은 공용 함수를 create or replace로 만든다(worklog design.md cross-branch C1).
  // 어느 쪽이 먼저 붙여 넣어져도 되어야 한다. 그쪽 함수에는 definer가 없을 수 있어, 이 파일이 AC-012.1 속성으로 맞춘다
  it('AC-012.1: 다른 기능이 공용 함수를 먼저 만들었어도 그대로 붙여 넣어지고 함수 속성은 AC-012.1대로다', async () => {
    const other = await PGlite.create()
    try {
      await other.exec(SUPABASE_MOCK)
      await other.exec(AUTH_MIGRATION)
      await other.exec(`
        create or replace function public.my_hospital_id() returns uuid language sql stable security definer set search_path = ''
          as $$ select h.id from public.hospitals h where h.owner_id = (select auth.uid()) and h.status = 'approved' $$;
        revoke execute on function public.my_hospital_id() from public, anon;
        grant execute on function public.my_hospital_id() to authenticated;
        create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = ''
          as $$ begin new.updated_at = now(); return new; end $$;
      `)
      await other.exec(SETTINGS_MIGRATION)
      const { rows: fns } = await other.query(
        `select proname, prosecdef, proconfig,
                has_function_privilege('anon', oid, 'execute') as anon,
                has_function_privilege('authenticated', oid, 'execute') as authenticated
         from pg_proc where proname in ('my_hospital_id', 'touch_updated_at') and pronamespace = 'public'::regnamespace order by proname`,
      )
      const expected = { prosecdef: true, proconfig: ['search_path=""'], anon: false, authenticated: true }
      expect(fns).toEqual([
        { proname: 'my_hospital_id', ...expected },
        { proname: 'touch_updated_at', ...expected },
      ])
    } finally {
      await other.close()
    }
  }, 120_000)
})

describe('AC-012.2 로그인 안 한 사용자와 승인 안 된 병원', SLOW, () => {
  it.each(TABLES)('AC-012.2: anon은 %s 읽기·고치기·지우기가 거부되고 줄은 그대로다', async (table) => {
    await seed(await addHospital(A, 'approved'))
    await becomeAnon()
    await expect(db.query(`select * from public.${table}`)).rejects.toThrow(DENIED)
    await expect(db.query(`delete from public.${table}`)).rejects.toThrow(DENIED)
    await expect(db.query(`update public.${table} set updated_at = now()`)).rejects.toThrow(DENIED)
    expect(await countAll(table)).toBe(1)
  })

  it.each(ADDS)('AC-012.2: anon은 넣기가 거부된다: %s', async (sql) => {
    await becomeAnon()
    await expect(db.query(sql)).rejects.toThrow(DENIED)
  })

  it.each([
    ['pending', C],
    ['rejected', D],
  ] as const)('AC-012.2: %s 병원의 사용자는 자기 병원 줄도 안 보이고, 고치고 지워도 바뀌는 줄이 없고, 넣기가 거부된다', async (status, user) => {
    await seed(await addHospital(user, status))
    await become(user)
    for (const table of TABLES) expect(await rows(`select * from public.${table}`), table).toEqual([])
    expect((await db.query(`update public.claim_rule_settings set enabled = true`)).affectedRows).toBe(0)
    expect((await db.query(`update public.claim_hospital_settings set phrases = '{"x": 1}'`)).affectedRows).toBe(0)
    expect((await db.query(`update public.message_templates set name = '바꿈'`)).affectedRows).toBe(0)
    expect((await db.query(`delete from public.claim_rule_settings`)).affectedRows).toBe(0)
    expect((await db.query(`delete from public.message_templates`)).affectedRows).toBe(0)
    await expect(db.query(ADD_RULE.replace('LA-01', 'LA-02'))).rejects.toThrow(RLS_REJECTED)
    await expect(db.query(ADD_PHRASES)).rejects.toThrow(RLS_REJECTED)
    await expect(db.query(ADD_TEMPLATE)).rejects.toThrow(RLS_REJECTED)
    for (const table of TABLES) expect(await countAll(table), table).toBe(1)
    // 고쳐지지 않았는지 내용도 본다(운영자로 읽는다)
    expect(await rows('select phrases from public.claim_hospital_settings')).toEqual([{ phrases: { TPL: {} } }])
  })

  it('AC-012.2: 병원 줄이 아예 없는 사용자도 아무 줄도 안 보이고 넣기가 거부된다', async () => {
    await seed(await addHospital(A, 'approved'))
    await become(E)
    for (const table of TABLES) expect(await rows(`select * from public.${table}`), table).toEqual([])
    for (const sql of ADDS) await expect(db.query(sql), sql).rejects.toThrow(RLS_REJECTED)
  })

  it('AC-012.2: 승인됐던 병원이 거절되면 그 순간부터 자기 줄도 안 보인다', async () => {
    const id = await addHospital(A, 'approved')
    await seed(id)
    await become(A)
    expect(await rows('select rule_id from public.claim_rule_settings')).toEqual([{ rule_id: 'LA-01' }])
    await operator()
    await db.query(`update public.hospitals set status = 'rejected' where id = $1`, [id])
    await become(A)
    expect(await rows('select rule_id from public.claim_rule_settings')).toEqual([])
  })
})

describe('AC-012.3 승인된 사용자는 자기 병원 줄만', SLOW, () => {
  it.each(ADDS)('AC-012.3: hospital_id 없이 넣으면 DB 기본값으로 내 병원이 들어간다: %s', async (sql) => {
    const mine = await addHospital(A, 'approved')
    await become(A)
    const [row] = (await db.query<{ hospital_id: string }>(`${sql} returning hospital_id`)).rows
    expect(row.hospital_id).toBe(mine)
  })

  it('AC-012.3: 남의 병원 줄은 안 보이고 고쳐지지도 지워지지도 않는다', async () => {
    const mine = await addHospital(A, 'approved')
    const other = await addHospital(B, 'approved')
    await seed(mine)
    await seed(other)
    await become(A)
    for (const table of TABLES) {
      expect(await rows(`select hospital_id from public.${table}`), table).toEqual([{ hospital_id: mine }])
    }
    expect(
      (await db.query(`update public.claim_rule_settings set grade = '참고' where hospital_id = $1`, [other])).affectedRows,
    ).toBe(0)
    expect((await db.query(`update public.claim_hospital_settings set phrases = '{}' where hospital_id = $1`, [other])).affectedRows).toBe(0)
    expect((await db.query(`update public.message_templates set body = 'x' where hospital_id = $1`, [other])).affectedRows).toBe(0)
    expect((await db.query(`delete from public.message_templates where hospital_id = $1`, [other])).affectedRows).toBe(0)
    await operator()
    expect(await rows(`select grade from public.claim_rule_settings where hospital_id = $1`, [other])).toEqual([{ grade: '알림' }])
    expect(await rows(`select body from public.message_templates where hospital_id = $1`, [other])).toEqual([{ body: '안녕하세요' }])
  })

  it('AC-012.3·AC-012.6: [기본값으로]의 delete는 내 병원 줄만 지운다 — 조건 없이 지워도 남의 줄은 남는다', async () => {
    const mine = await addHospital(A, 'approved')
    const other = await addHospital(B, 'approved')
    await seed(mine)
    await seed(other)
    await become(A)
    expect((await db.query(`delete from public.claim_rule_settings where rule_id = any($1)`, [['LA-01']])).affectedRows).toBe(1)
    expect((await db.query('delete from public.claim_rule_settings')).affectedRows).toBe(0)
    await operator()
    expect(await rows('select hospital_id from public.claim_rule_settings')).toEqual([{ hospital_id: other }])
  })

  it('AC-012.3: 내 병원의 문자 문구는 지울 수 있고, 병원 문구 줄을 지우는 권한은 없다', async () => {
    await seed(await addHospital(A, 'approved'))
    await become(A)
    expect((await db.query('delete from public.message_templates')).affectedRows).toBe(1)
    await expect(db.query('delete from public.claim_hospital_settings')).rejects.toThrow(DENIED)
  })

  it.each([
    [`insert into public.claim_rule_settings (hospital_id, rule_id, enabled) values ($1, 'LA-02', true)`],
    [`insert into public.claim_hospital_settings (hospital_id, phrases) values ($1, '{}')`],
    [`insert into public.message_templates (hospital_id, kind, name, body) values ($1, 'followup', 'x', 'y')`],
  ])('AC-012.3: hospital_id를 직접 넣으면 내 병원이어도 남의 병원이어도 거부된다: %s', async (sql) => {
    const mine = await addHospital(A, 'approved')
    const other = await addHospital(B, 'approved')
    await become(A)
    await expect(db.query(sql, [mine])).rejects.toThrow(DENIED)
    await expect(db.query(sql, [other])).rejects.toThrow(DENIED)
  })

  it.each(TABLES)('AC-012.3: %s의 hospital_id·updated_at을 바꾸면 거부된다', async (table) => {
    const mine = await addHospital(A, 'approved')
    const other = await addHospital(B, 'approved')
    await seed(mine)
    await become(A)
    await expect(db.query(`update public.${table} set hospital_id = $1`, [other])).rejects.toThrow(DENIED)
    await expect(db.query(`update public.${table} set updated_at = now()`)).rejects.toThrow(DENIED)
  })

  it.each([
    [`insert into public.claim_rule_settings (rule_id, enabled, updated_at) values ('LA-02', true, '2020-01-01')`],
    [`insert into public.claim_hospital_settings (phrases, updated_at) values ('{}', '2020-01-01')`],
    [`insert into public.message_templates (kind, name, body, updated_at) values ('followup', 'x', 'y', '2020-01-01')`],
  ])('AC-012.3: updated_at을 직접 넣으면 거부된다: %s', async (sql) => {
    await addHospital(A, 'approved')
    await become(A)
    await expect(db.query(sql)).rejects.toThrow(DENIED)
  })

  it('AC-012.3: message_templates의 id를 직접 넣거나 바꾸면 거부된다', async () => {
    await seed(await addHospital(A, 'approved'))
    await become(A)
    await expect(
      db.query(`insert into public.message_templates (id, kind, name, body) values (gen_random_uuid(), 'followup', 'x', 'y')`),
    ).rejects.toThrow(DENIED)
    await expect(db.query('update public.message_templates set id = gen_random_uuid()')).rejects.toThrow(DENIED)
  })

  it.each([
    ['claim_rule_settings', `update public.claim_rule_settings set enabled = true`],
    ['claim_hospital_settings', `update public.claim_hospital_settings set phrases = '{"a": 1}'`],
    ['message_templates', `update public.message_templates set body = '바꿈'`],
  ])('AC-012.3: %s를 고치면 updated_at이 저절로 지금으로 바뀐다(트리거)', async (table, sql) => {
    await seed(await addHospital(A, 'approved'))
    await become(A)
    expect((await db.query(sql)).affectedRows).toBe(1)
    const [row] = await rows(`select updated_at from public.${table}`)
    expect((row.updated_at as Date).getTime()).toBeGreaterThan(new Date('2020-01-02T00:00:00Z').getTime())
  })

  it('AC-012.5: 저장 코드의 upsert(hospital_id를 보내지 않고 칸 단위 권한으로)가 그대로 된다 — 없으면 넣고, 있으면 고친다', async () => {
    const mine = await addHospital(A, 'approved')
    await become(A)
    const upsertRule = (enabled: boolean, grade: string | null) =>
      db.query(
        `insert into public.claim_rule_settings (rule_id, enabled, grade) values ('LA-01', $1, $2)
         on conflict (hospital_id, rule_id) do update set rule_id = excluded.rule_id, enabled = excluded.enabled, grade = excluded.grade`,
        [enabled, grade],
      )
    await upsertRule(false, null)
    await upsertRule(true, '참고')
    expect(await rows('select hospital_id, rule_id, enabled, grade from public.claim_rule_settings')).toEqual([
      { hospital_id: mine, rule_id: 'LA-01', enabled: true, grade: '참고' },
    ])
    const upsertPhrases = (phrases: string) =>
      db.query(
        `insert into public.claim_hospital_settings (phrases, dx_links) values ($1::jsonb, '[]')
         on conflict (hospital_id) do update set phrases = excluded.phrases, dx_links = excluded.dx_links`,
        [phrases],
      )
    await upsertPhrases('{"a": 1}')
    await upsertPhrases('{"a": 2}')
    expect(await rows('select hospital_id, phrases from public.claim_hospital_settings')).toEqual([{ hospital_id: mine, phrases: { a: 2 } }])
  })
})

describe('AC-012.4 제약', SLOW, () => {
  beforeEach(async () => {
    await addHospital(A, 'approved')
    await become(A)
  })

  const addRule = (ruleId: string, grade: string | null = null) =>
    db.query('insert into public.claim_rule_settings (rule_id, enabled, grade) values ($1, true, $2)', [ruleId, grade])
  const addPhrases = (phrases: string, dxLinks = '[]') =>
    db.query('insert into public.claim_hospital_settings (phrases, dx_links) values ($1::jsonb, $2::jsonb)', [phrases, dxLinks])
  const addTemplate = (kind: string, name: string, body: string, sortOrder = 0) =>
    db.query('insert into public.message_templates (kind, name, body, sort_order) values ($1, $2, $3, $4)', [kind, name, body, sortOrder])

  // pg_column_size가 꼭 bytes인 object JSON(한 글자 = 1바이트)
  async function jsonOfSize(bytes: number) {
    const json = (n: number) => JSON.stringify({ a: 'x'.repeat(n) })
    const [row] = await rows('select pg_column_size($1::jsonb) as size', [json(1000)])
    const made = json(1000 + bytes - (row.size as number))
    const [check] = await rows('select pg_column_size($1::jsonb) as size', [made])
    expect(check.size).toBe(bytes)
    return made
  }

  it.each(['la-01', 'LA-1', 'LA-0001', 'LAA-01', 'L-01', 'LA01', 'LA-01A', 'LA-01ab', ' LA-01', ''])(
    'AC-012.4: 규칙 ID 모양이 아니면 거부된다: "%s"',
    async (id) => {
      await expect(addRule(id)).rejects.toThrow(CHECK)
    },
  )

  it.each(['LA-01', 'DX-123', 'MM-41a'])('AC-012.4: 규칙 ID 모양이 맞으면 넣는다: %s', async (id) => {
    await addRule(id)
    expect(await rows('select rule_id from public.claim_rule_settings')).toEqual([{ rule_id: id }])
  })

  it.each(['경고', '확인 필요', ''])('AC-012.4: 등급이 셋 밖이면 거부된다: "%s"', async (grade) => {
    await expect(addRule('LA-01', grade)).rejects.toThrow(CHECK)
  })

  it.each(['확인필요', '알림', '참고', null])('AC-012.4: 등급 %s는 넣는다(null = 규칙표 기본 등급)', async (grade) => {
    await addRule('LA-01', grade)
    expect(await rows('select grade from public.claim_rule_settings')).toEqual([{ grade }])
  })

  it.each(['[]', '"글자"', '1', 'null'])('AC-012.4: 문구 jsonb가 object가 아니면 거부된다: %s', async (phrases) => {
    await expect(addPhrases(phrases)).rejects.toThrow(CHECK)
  })

  it('AC-012.4: 문구 jsonb는 256KB(262144바이트) 이상이면 거부되고 그 아래는 넣는다', async () => {
    await expect(addPhrases(await jsonOfSize(262_144))).rejects.toThrow(CHECK)
    await addPhrases(await jsonOfSize(262_143))
    expect(await rows('select count(*)::int as n from public.claim_hospital_settings')).toEqual([{ n: 1 }])
  })

  it('AC-012.4: 상병 연결표 jsonb는 배열이 아니거나 256KB 이상이면 거부되고, 안 넣으면 빈 배열이다', async () => {
    await expect(addPhrases('{}', '{}')).rejects.toThrow(CHECK)
    await expect(addPhrases('{}', JSON.stringify(['x'.repeat(262_144)]))).rejects.toThrow(CHECK)
    await db.query(`insert into public.claim_hospital_settings (phrases) values ('{}')`)
    expect(await rows('select dx_links from public.claim_hospital_settings')).toEqual([{ dx_links: [] }])
    // 순서가 뜻이 있다(추천 상병이 앞줄부터 고른다, AC-012.7): jsonb 배열은 넣은 순서 그대로 읽힌다 → 줄 순서가 저절로 바뀌어 틀린 경보가 나지 않는다
    const ordered = [
      ['MM410', 'M751', '회전근개', 0, 's'],
      ['HA280', 'M170', '무릎관절증', 1, 't'],
      ['AA100', 'Z001', '가나다', 0, 'r'],
    ]
    await become(A)
    await db.query(`update public.claim_hospital_settings set dx_links = $1::jsonb`, [JSON.stringify(ordered)])
    expect(await rows('select dx_links from public.claim_hospital_settings')).toEqual([{ dx_links: ordered }])
  })

  it.each(['', 'x'.repeat(31)])('AC-012.4: 문자 문구 이름이 1~30자 밖이면 거부된다(길이 %#)', async (name) => {
    await expect(addTemplate('followup', name, '내용')).rejects.toThrow(CHECK)
  })

  it.each(['', 'x'.repeat(2001)])('AC-012.4: 문자 문구 내용이 1~2000자 밖이면 거부된다(길이 %#)', async (body) => {
    await expect(addTemplate('followup', '이름', body)).rejects.toThrow(CHECK)
  })

  it('AC-012.4: 문자 문구 이름 1·30자, 내용 1·2000자는 넣는다(글자 수로 센다)', async () => {
    await addTemplate('followup', '가', '나')
    await addTemplate('injection', '가'.repeat(30), '나'.repeat(2000))
    expect(await rows('select count(*)::int as n from public.message_templates')).toEqual([{ n: 2 }])
  })

  it.each(['other', 'Injection', ''])('AC-012.4: 문자 문구 종류가 injection·followup이 아니면 거부된다: "%s"', async (kind) => {
    await expect(addTemplate(kind, '이름', '내용')).rejects.toThrow(CHECK)
  })

  it.each([-1, 100])('AC-012.4: 문자 문구 순서가 0~99 밖이면 거부된다: %s', async (sortOrder) => {
    await expect(addTemplate('followup', '이름', '내용', sortOrder)).rejects.toThrow(CHECK)
  })
})

// ── 건수 표 세 개(REQ-019, design.md 8-2): 칸은 uuid(병원)·date·integer·timestamptz뿐이다. 규칙은 설정 표와 같다 ──

const COUNT_TABLES = ['claim_day_counts', 'claim_month_counts', 'contact_counts'] as const
type CountTable = (typeof COUNT_TABLES)[number]
/** 표마다 사용자가 쓸 수 있는 칸 */
const WRITABLE: Record<CountTable, string[]> = {
  claim_day_counts: ['entered', 'need_memo', 'needs_check', 'skipped', 'visit_date', 'visits'],
  claim_month_counts: ['claim_month', 'flagged', 'incomplete', 'missing'],
  contact_counts: ['followup_left', 'injection_left'],
}
const ADD_COUNT: Record<CountTable, string> = {
  claim_day_counts: `insert into public.claim_day_counts (visit_date, visits, need_memo, entered, needs_check, skipped) values ('2026-10-28', 20, 7, 2, 1, 0)`,
  claim_month_counts: `insert into public.claim_month_counts (claim_month, incomplete, missing, flagged) values ('2026-10-01', 2, 3, 1)`,
  contact_counts: `insert into public.contact_counts (followup_left, injection_left) values (4, 3)`,
}
const addDay = (date: string, need: number, entered: number, check = 0, skipped = 0, visits = 0) =>
  db.query(`insert into public.claim_day_counts (visit_date, visits, need_memo, entered, needs_check, skipped) values ($1, $2, $3, $4, $5, $6)`, [date, visits, need, entered, check, skipped])
const addMonth = (month: string, incomplete = 0, missing = 0, flagged = 0) =>
  db.query(`insert into public.claim_month_counts (claim_month, incomplete, missing, flagged) values ($1, $2, $3, $4)`, [month, incomplete, missing, flagged])
const addContact = (followup: number, injection: number) => db.query(`insert into public.contact_counts (followup_left, injection_left) values ($1, $2)`, [followup, injection])

/** 운영자가 그 병원 줄을 표마다 하나씩 넣는다(RLS를 건너뛴다) */
async function seedCounts(hospital: string, updatedAt = '2020-01-01T00:00:00Z') {
  await operator()
  await db.query(`insert into public.claim_day_counts (hospital_id, visit_date, visits, need_memo, entered, needs_check, skipped, updated_at) values ($1, '2026-10-28', 20, 7, 2, 1, 0, $2)`, [hospital, updatedAt])
  await db.query(`insert into public.claim_month_counts (hospital_id, claim_month, incomplete, missing, flagged, updated_at) values ($1, '2026-10-01', 2, 3, 1, $2)`, [hospital, updatedAt])
  await db.query(`insert into public.contact_counts (hospital_id, followup_left, injection_left, updated_at) values ($1, 4, 3, $2)`, [hospital, updatedAt])
}

describe('AC-019.1 건수 표: 칸 종류와 권한', SLOW, () => {
  it('AC-019.1: 칸 종류는 uuid(병원)·date·integer·timestamp with time zone뿐이다. 글자·jsonb 칸이 없다', async () => {
    const found = await rows(
      `select table_name, column_name, data_type from information_schema.columns
       where table_schema = 'public' and table_name = any($1) order by table_name, ordinal_position`,
      [[...COUNT_TABLES]],
    )
    const columns = (table: string) => found.filter((row) => row.table_name === table).map((row) => [row.column_name, row.data_type])
    const STAMP = 'timestamp with time zone'
    expect(columns('claim_day_counts')).toEqual([
      ['hospital_id', 'uuid'],
      ['visit_date', 'date'],
      ['visits', 'integer'],
      ['need_memo', 'integer'],
      ['entered', 'integer'],
      ['needs_check', 'integer'],
      ['skipped', 'integer'],
      ['updated_at', STAMP],
    ])
    expect(columns('claim_month_counts')).toEqual([
      ['hospital_id', 'uuid'],
      ['claim_month', 'date'],
      ['incomplete', 'integer'],
      ['missing', 'integer'],
      ['flagged', 'integer'],
      ['updated_at', STAMP],
    ])
    expect(columns('contact_counts')).toEqual([
      ['hospital_id', 'uuid'],
      ['followup_left', 'integer'],
      ['injection_left', 'integer'],
      ['updated_at', STAMP],
    ])
    expect(new Set(found.map((row) => row.data_type))).toEqual(new Set(['uuid', 'date', 'integer', STAMP]))
  })

  it('AC-019.1: 세 표 모두 RLS가 켜져 있다', async () => {
    const found = await rows(
      `select relname, relrowsecurity from pg_class
       where relnamespace = 'public'::regnamespace and relname = any($1) order by relname`,
      [[...COUNT_TABLES]],
    )
    expect(found).toEqual([...COUNT_TABLES].sort().map((relname) => ({ relname, relrowsecurity: true })))
  })

  it('AC-019.1: anon에게 준 표·칸 권한이 하나도 없다(기본 권한을 먼저 거뒀다)', async () => {
    const tables = await rows(
      `select table_name from information_schema.role_table_grants
       where grantee = 'anon' and table_schema = 'public' and table_name = any($1)`,
      [[...COUNT_TABLES]],
    )
    expect(tables).toEqual([])
    const columns = await rows(
      `select table_name from information_schema.column_privileges
       where grantee = 'anon' and table_schema = 'public' and table_name = any($1)`,
      [[...COUNT_TABLES]],
    )
    expect(columns).toEqual([])
  })

  it('AC-019.1: authenticated의 표 전체 권한은 select뿐이다. 지우기가 없다', async () => {
    const grants = await rows(
      `select table_name, privilege_type from information_schema.role_table_grants
       where grantee = 'authenticated' and table_schema = 'public' and table_name = any($1) order by table_name`,
      [[...COUNT_TABLES]],
    )
    expect(grants).toEqual([...COUNT_TABLES].sort().map((table_name) => ({ table_name, privilege_type: 'SELECT' })))
  })

  it.each(COUNT_TABLES)('AC-019.1: %s의 넣기·고치기 칸에 hospital_id·updated_at이 없다', async (table) => {
    const found = await rows(
      `select column_name, privilege_type from information_schema.column_privileges
       where grantee = 'authenticated' and table_schema = 'public' and table_name = $1 and privilege_type in ('INSERT', 'UPDATE')`,
      [table],
    )
    for (const privilege of ['INSERT', 'UPDATE']) {
      expect(found.filter((row) => row.privilege_type === privilege).map((row) => row.column_name).sort()).toEqual(WRITABLE[table])
    }
  })

  it.each(COUNT_TABLES)('AC-019.1: anon은 %s를 읽지도 쓰지도 못한다', async (table) => {
    await becomeAnon()
    await expect(db.query(`select * from public.${table}`)).rejects.toThrow(DENIED)
    await expect(db.exec(ADD_COUNT[table])).rejects.toThrow(DENIED)
  })

  it.each(COUNT_TABLES)('AC-019.1: 승인된 병원은 %s에 hospital_id 없이 넣고, 줄은 DB 기본값으로 내 병원에 들어간다', async (table) => {
    const mine = await addHospital(A, 'approved')
    await become(A)
    await db.exec(ADD_COUNT[table])
    expect(await rows(`select hospital_id from public.${table}`)).toEqual([{ hospital_id: mine }])
  })

  it.each(COUNT_TABLES)('AC-019.1: %s의 hospital_id·updated_at을 직접 넣거나 바꾸지 못하고 줄을 지우지 못한다', async (table) => {
    const mine = await addHospital(A, 'approved')
    await seedCounts(mine)
    await become(A)
    await expect(db.exec(`insert into public.${table} (hospital_id) values ('${mine}')`)).rejects.toThrow(DENIED)
    await expect(db.exec(`insert into public.${table} (updated_at) values (now())`)).rejects.toThrow(DENIED)
    await expect(db.exec(`update public.${table} set hospital_id = '${mine}'`)).rejects.toThrow(DENIED)
    await expect(db.exec(`update public.${table} set updated_at = now()`)).rejects.toThrow(DENIED)
    await expect(db.exec(`delete from public.${table}`)).rejects.toThrow(DENIED)
    expect(await countAll(table)).toBe(1)
  })

  it.each(COUNT_TABLES)('AC-019.1: %s에서 남의 병원 줄은 보이지 않고 고쳐지지 않는다', async (table) => {
    const other = await addHospital(B, 'approved')
    await addHospital(A, 'approved')
    await seedCounts(other)
    await become(A)
    expect(await rows(`select * from public.${table}`)).toEqual([])
    const [column] = WRITABLE[table].filter((name) => !['visit_date', 'claim_month'].includes(name))
    const updated = await db.query(`update public.${table} set ${column} = 0`)
    expect(updated.affectedRows).toBe(0)
    await operator()
    const [row] = await rows(`select ${column} as value from public.${table} where hospital_id = $1`, [other])
    expect(row.value).toBe({ claim_day_counts: 2, claim_month_counts: 1, contact_counts: 4 }[table]) // seedCounts 값 그대로
    expect(await countAll(table)).toBe(1)
  })

  it.each<[string, string, Status | null]>([
    ['승인 대기', C, 'pending'],
    ['거절', D, 'rejected'],
    ['병원 줄 없음', E, null],
  ])('AC-019.1: %s인 사용자는 건수 줄을 보지도 넣지도 못한다', async (_name, user, status) => {
    if (status) await addHospital(user, status)
    const other = await addHospital(B, 'approved')
    await seedCounts(other)
    await become(user)
    for (const table of COUNT_TABLES) {
      expect(await rows(`select * from public.${table}`)).toEqual([])
      await expect(db.exec(ADD_COUNT[table])).rejects.toThrow(RLS_REJECTED)
    }
  })

  it('AC-019.1·AC-019.4: PostgREST가 보내는 upsert 모양(칸 넣기 + on conflict 고치기)이 내 권한으로 돈다. 다시 올리면 같은 줄이 바뀌고 바뀐 시각이 새로 찍힌다', async () => {
    const mine = await addHospital(A, 'approved')
    await seedCounts(mine, '2020-01-01T00:00:00Z')
    await become(A)
    await db.exec(`
      insert into public.claim_day_counts (visit_date, visits, need_memo, entered, needs_check, skipped)
      values ('2026-10-28', 23, 9, 5, 2, 1), ('2026-10-29', 8, 3, 0, 0, 0)
      on conflict (hospital_id, visit_date) do update
      set visit_date = excluded.visit_date, visits = excluded.visits, need_memo = excluded.need_memo, entered = excluded.entered, needs_check = excluded.needs_check, skipped = excluded.skipped`)
    const found = await rows(`select visit_date::text as day, visits, need_memo, entered, needs_check, skipped, updated_at > '2021-01-01' as fresh from public.claim_day_counts order by visit_date`)
    expect(found).toEqual([
      { day: '2026-10-28', visits: 23, need_memo: 9, entered: 5, needs_check: 2, skipped: 1, fresh: true },
      { day: '2026-10-29', visits: 8, need_memo: 3, entered: 0, needs_check: 0, skipped: 0, fresh: true },
    ])
  })

  it('AC-019.1: 남의 병원 날짜와 겹쳐도 upsert는 내 병원 줄만 만든다', async () => {
    const other = await addHospital(B, 'approved')
    const mine = await addHospital(A, 'approved')
    await seedCounts(other)
    await become(A)
    await db.exec(`
      insert into public.claim_day_counts (visit_date, visits, need_memo, entered, needs_check, skipped) values ('2026-10-28', 1, 1, 1, 0, 0)
      on conflict (hospital_id, visit_date) do update set need_memo = excluded.need_memo, entered = excluded.entered`)
    await operator()
    const found = await rows(`select hospital_id, need_memo from public.claim_day_counts order by need_memo`)
    expect(found).toEqual([
      { hospital_id: mine, need_memo: 1 },
      { hospital_id: other, need_memo: 7 },
    ])
  })

  it.each(COUNT_TABLES)('AC-019.1: %s의 줄을 고치면 updated_at을 트리거가 새로 찍는다', async (table) => {
    const mine = await addHospital(A, 'approved')
    await seedCounts(mine, '2020-01-01T00:00:00Z')
    await become(A)
    const column = WRITABLE[table].find((name) => !['visit_date', 'claim_month', 'entered', 'need_memo'].includes(name))
    await db.exec(`update public.${table} set ${column} = 9`)
    expect(await rows(`select updated_at > '2021-01-01' as fresh from public.${table}`)).toEqual([{ fresh: true }])
  })
})

describe('AC-019.2 건수 표의 제약', SLOW, () => {
  beforeEach(async () => {
    await addHospital(A, 'approved')
    await become(A)
  })

  it.each<[string, () => Promise<unknown>]>([
    ['진료 수 음수', () => addDay('2026-10-28', 5, 0, 0, 0, -1)],
    ['진료 수 100,001', () => addDay('2026-10-28', 5, 0, 0, 0, 100_001)],
    ['메모 필요 수 음수', () => addDay('2026-10-28', -1, 0)],
    ['입력 수 음수', () => addDay('2026-10-28', 5, -1)],
    ['확인 필요 수 음수', () => addDay('2026-10-28', 5, 0, -1)],
    ['건너뜀 수 음수', () => addDay('2026-10-28', 5, 0, 0, -1)],
    ['메모 필요 수 100,001', () => addDay('2026-10-28', 100_001, 0)],
    ['확인 필요 수 100,001', () => addDay('2026-10-28', 5, 0, 100_001)],
    ['건너뜀 수 100,001', () => addDay('2026-10-28', 5, 0, 0, 100_001)],
    ['입력 수 > 메모 필요 수', () => addDay('2026-10-28', 5, 6)],
    ['달 첫날이 아닌 claim_month', () => addMonth('2026-10-02')],
    ['달 끝날 claim_month', () => addMonth('2026-10-31')],
    ['미완료 수 음수', () => addMonth('2026-10-01', -1)],
    ['빠진 것 수 100,001', () => addMonth('2026-10-01', 0, 100_001)],
    ['확인 표시 수 100,001', () => addMonth('2026-10-01', 0, 0, 100_001)],
    ['F/U 남은 수 음수', () => addContact(-1, 0)],
    ['정기 주사 남은 수 100,001', () => addContact(0, 100_001)],
  ])('AC-019.2: %s는 거부된다', async (_name, add) => {
    await expect(add()).rejects.toThrow(CHECK)
  })

  it.each(['많음', '가상환자'])('AC-019.2: 수 칸에 글자를 넣으면 거부된다: %s', async (text) => {
    await expect(db.query(`insert into public.claim_day_counts (visit_date, visits, need_memo, entered, needs_check, skipped) values ('2026-10-28', 0, $1, 0, 0, 0)`, [text])).rejects.toThrow()
    await expect(db.query(`insert into public.claim_day_counts (visit_date, visits, need_memo, entered, needs_check, skipped) values ('2026-10-28', $1, 0, 0, 0, 0)`, [text])).rejects.toThrow()
    expect(await rows('select * from public.claim_day_counts')).toEqual([])
  })

  it('AC-019.2: 진료 수를 비우면 거부된다(기본값이 없다)', async () => {
    await expect(db.exec(`insert into public.claim_day_counts (visit_date, need_memo, entered, needs_check, skipped) values ('2026-10-28', 1, 0, 0, 0)`)).rejects.toThrow(/null value/)
  })

  it('AC-019.2: 날짜 칸에 글자를 넣으면 거부된다', async () => {
    await expect(addDay('가상환자', 1, 0)).rejects.toThrow()
    expect(await rows('select * from public.claim_day_counts')).toEqual([])
  })

  it('AC-019.2: 끝값 0·100,000, 입력 수 = 메모 필요 수, 달 첫날은 들어간다', async () => {
    await addDay('2026-10-28', 100_000, 100_000, 100_000, 100_000, 100_000)
    await addDay('2026-10-29', 0, 0, 0, 0, 0)
    await addMonth('2026-10-01', 100_000, 0, 100_000)
    await addContact(100_000, 0)
    expect(await rows('select count(*)::int as n from public.claim_day_counts')).toEqual([{ n: 2 }])
    expect(await rows('select count(*)::int as n from public.claim_month_counts')).toEqual([{ n: 1 }])
    expect(await rows('select count(*)::int as n from public.contact_counts')).toEqual([{ n: 1 }])
  })

  it('AC-019.2: 고칠 때도 제약이 그대로다', async () => {
    await addDay('2026-10-28', 5, 5)
    await expect(db.exec(`update public.claim_day_counts set need_memo = 4`)).rejects.toThrow(CHECK)
    await expect(db.exec(`update public.claim_day_counts set entered = 6`)).rejects.toThrow(CHECK)
    await expect(db.exec(`update public.claim_day_counts set visits = -1`)).rejects.toThrow(CHECK)
    await expect(db.exec(`update public.claim_day_counts set visits = 100001`)).rejects.toThrow(CHECK)
    expect(await rows('select need_memo, entered, visits from public.claim_day_counts')).toEqual([{ need_memo: 5, entered: 5, visits: 0 }])
  })
})

import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

// 주소록 서버 표 contacts_companies·contacts_people·contacts_equipment·contacts_repairs와 넣기 함수 contacts_import의
// 칸·제약·RLS·권한·cascade·바깥 키 (contacts REQ-6501, design.md 'DB'). calendar.rls.test.ts·desk.rls.test.ts와 같은 방법:
// 진짜 Postgres(PGlite, WASM)에서 운영자가 붙일 migration 파일을 차례로 그대로 돌린다(데스크 경우를 보려고 desk_accounts까지).
// 실제 Supabase에는 붙지 않는다. Supabase가 미리 갖춘 것만 흉내 낸다. 업체·담당자·장비 이름과 번호는 모두 지어낸 것이다
const fileOf = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))
const read = (rel: string) => readFileSync(fileOf(rel), 'utf-8')
// 앞 migration: desk.rls.test.ts가 쓰는 사슬 → 데스크 계정
const CHAIN = [
  '20261028000000_auth.sql',
  '20261030000000_precheck_settings.sql',
  '20261101000100_worklog.sql',
  '20261101000110_worklog_bit_fields.sql',
  '20261105000200_worklog_memo_font.sql',
  '20261105000300_worklog_cash_float.sql',
  '20261105000100_stats_rx_groups.sql',
  '20261112000000_stats_rx_groups_exclude.sql',
  '20261101000200_stats.sql',
  '20261101000400_revenue.sql',
  '20261101000000_ai_report.sql',
  '20261116000000_sunap.sql',
  '20261117010000_calendar.sql',
  '20261118100000_desk_accounts.sql',
].map((name) => read(`./migrations/${name}`))
const CONTACTS_PATH = fileOf('./migrations/20261121000000_contacts.sql')
// 파일이 아직 없으면 빈 글자로 돌아, 시험마다 '표·함수가 없다'로 실패한다(무엇이 빠졌는지 시험별로 보인다)
const CONTACTS_MIGRATION = existsSync(CONTACTS_PATH) ? readFileSync(CONTACTS_PATH, 'utf-8') : ''
// 주석을 뺀 SQL 글자, 그리고 함수 몸통($$ … $$)까지 뺀 글자(맨 위 문장만 본다)
const CONTACTS_SQL = CONTACTS_MIGRATION.split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n')
const CONTACTS_TOP = CONTACTS_SQL.replace(/\$\$[\s\S]*?\$\$/g, "''")

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

const A = '00000000-0000-4000-8000-00000000000a' // 승인된 병원 A 원장
const B = '00000000-0000-4000-8000-00000000000b' // 승인된 다른 병원 B 원장
const C = '00000000-0000-4000-8000-00000000000c' // 승인 대기
const D = '00000000-0000-4000-8000-00000000000d' // 거절
const E = '00000000-0000-4000-8000-00000000000e' // 병원 줄도 데스크 줄도 없는 사용자
const K = '00000000-0000-4000-8000-0000000000d1' // A의 데스크(병원 줄 없음, ADR-031)
const STATUS: Record<string, 'approved' | 'pending' | 'rejected' | null> = {
  [A]: 'approved',
  [B]: 'approved',
  [C]: 'pending',
  [D]: 'rejected',
  [E]: null,
  [K]: null,
}
const DESK_EMAIL: Record<string, string> = { [K]: 'desk-a@fake.test' }
const emailOf = (user: string) => DESK_EMAIL[user] ?? `${user.slice(-1)}@fake.test`
const NAME: Record<string, string> = { [A]: '가짜병원에이', [B]: '가짜병원비', [C]: '가짜병원씨', [D]: '가짜병원디' }

type Row = Record<string, unknown>

const COMPANIES = 'public.contacts_companies'
const PEOPLE = 'public.contacts_people'
const EQUIPMENT = 'public.contacts_equipment'
const REPAIRS = 'public.contacts_repairs'
const TABLES = [COMPANIES, PEOPLE, EQUIPMENT, REPAIRS] as const
const nameOf = (table: string) => table.replace('public.', '')

// 업체의 빈 글자 기본값 칸과 글자 수 한도(design.md 'DB' 칸·제약)
const COMPANY_TEXT: [string, number][] = [
  ['phone', 30],
  ['work', 100],
  ['address', 200],
  ['homepage', 200],
  ['biz_no', 20],
  ['account', 100],
  ['site_id', 100],
  ['site_pw', 100],
  ['memo', 1000],
]
// 사용자가 보낼 수 있는 칸(그 밖은 칸 권한이 없다). 표의 칸 차례
const COMPANY_SENT = ['category', 'name', ...COMPANY_TEXT.map(([c]) => c)]
const PERSON_INSERT = ['company_id', 'name', 'mobile', 'role']
const PERSON_UPDATE = ['name', 'mobile', 'role']
const EQUIPMENT_INSERT = ['company_id', 'name', 'serial', 'bought_on', 'warranty_until']
const EQUIPMENT_UPDATE = ['name', 'serial', 'bought_on', 'warranty_until']
const REPAIR_INSERT = ['equipment_id', 'day', 'content', 'cost']
const REPAIR_UPDATE = ['day', 'content', 'cost']

// 지어낸 업체·날짜·id
const COMPANY: Row = { category: 'supplier', name: '예시메디칼' }
const FULL_COMPANY: Row = {
  category: 'repair',
  name: '예시설비',
  phone: '031-000-0000',
  work: '물리치료 기계 수리, 충격파 헤드',
  address: '가짜시 가짜로 1',
  homepage: 'example.test',
  biz_no: '000-00-00000',
  account: '가짜은행 000-000-000000',
  site_id: 'fake-id',
  site_pw: 'fake-pw-0000',
  memo: '매달 말에 주문',
}
const DAY = '2026-11-21'
const DAY2 = '2026-11-22'
const OLD = '2001-01-01T00:00:00.000Z' // 운영자가 심는 옛 시각(DB가 바꿨는지 보려고)
const OTHER_ID = '00000000-0000-4000-8000-000000000999'

const SLOW = { timeout: 60_000 }
const DENIED = { code: '42501' } // 권한 없음
const CHECK_FAILED = { code: '23514' }
const NOT_NULL_FAILED = { code: '23502' }
const UNIQUE_FAILED = { code: '23505' }
const FK_FAILED = { code: '23503' }
// 병원 없는 사람의 넣기: RLS(42501) 또는 hospital_id 비움(23502) 가운데 먼저 걸리는 것
const NO_HOSPITAL = { code: expect.stringMatching(/^(42501|23502)$/) }
const MY_HOSPITAL = expect.stringMatching(/^(public\.)?my_hospital_id\(\)$/)
const POLICY_TEXT = /^\(hospital_id = \( SELECT (public\.)?my_hospital_id\(\) AS my_hospital_id\)\)$/

let db: PGlite
let hospital: Record<string, string> = {}

async function migrate(target: PGlite) {
  await target.exec(SUPABASE_MOCK)
  for (const sql of CHAIN) await target.exec(sql)
  await target.exec(CONTACTS_MIGRATION)
}

async function operator() {
  await db.exec('reset role; reset request.jwt.claims')
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

// 시험마다 빈 표에서 시작한다(병원·데스크·주소록 줄은 auth.users를 따라 함께 비워진다). 운영자(superuser)는 RLS를 건너뛴다.
// A는 데스크 메일이 하나 있다(K)
async function resetData() {
  await operator()
  await db.exec('truncate auth.users cascade')
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
  await db.query(`insert into public.hospital_members (hospital_id, email) values ($1, $2)`, [hospital[A], emailOf(K)])
}

/** 지금 역할로 값 칸만 넣는 insert 문(칸 이름은 시험이 정한 것뿐) */
function insertInto(table: string, values: Row, returning = 'id') {
  const columns = Object.keys(values)
  return db.query<Row>(
    `insert into ${table} (${columns.join(', ')}) values (${columns.map((_, i) => `$${i + 1}`).join(', ')}) returning ${returning}`,
    columns.map((column) => values[column]),
  )
}

/** 운영자가 그 병원 줄을 넣는다(RLS·칸 권한을 건너뛴다). 넣은 줄의 id */
async function seedRow(table: string, owner: string, values: Row) {
  await operator()
  const { rows: added } = await insertInto(table, { hospital_id: hospital[owner], ...values })
  return added[0].id as string
}
const seedCompany = (owner: string, values: Row = {}) => seedRow(COMPANIES, owner, { ...COMPANY, ...values })
const seedPerson = (owner: string, company: string, values: Row = {}) => seedRow(PEOPLE, owner, { company_id: company, name: '김예시', ...values })
const seedEquipment = (owner: string, company: string, values: Row = {}) =>
  seedRow(EQUIPMENT, owner, { company_id: company, name: '충격파 기계', ...values })
const seedRepair = (owner: string, equipment: string, values: Row = {}) =>
  seedRow(REPAIRS, owner, { equipment_id: equipment, day: DAY, content: '헤드 교체', ...values })

type Book = { company: string; person: string; equipment: string; repair: string }

/** 운영자가 그 병원에 업체 하나·담당자 하나·장비 하나·수리 기록 하나를 넣는다 */
async function seedBook(owner: string, name = '예시메디칼'): Promise<Book> {
  const company = await seedCompany(owner, { name })
  const person = await seedPerson(owner, company)
  const equipment = await seedEquipment(owner, company, { serial: 'SN-0001' })
  const repair = await seedRepair(owner, equipment, { cost: 50000 })
  return { company, person, equipment, repair }
}

/** 운영자 눈으로 본 네 표 전체(바뀌지 않았는지 견줄 때) */
async function snapshot() {
  await operator()
  const shot: Row = {}
  for (const table of TABLES) shot[table] = (await rows(`select to_jsonb(t)::text as line from ${table} t order by id`)).map((r) => r.line)
  return shot
}

/** 운영자 눈으로 본 그 표의 병원별 줄 수 */
async function countOf(table: string, owner: string) {
  await operator()
  return (await rows(`select count(*)::int as n from ${table} where hospital_id = $1`, [hospital[owner]]))[0].n as number
}

/** 지금 역할로 그 표 줄들의 병원 id */
async function hospitalsSeenIn(table: string) {
  return (await rows(`select hospital_id from ${table}`)).map((r) => r.hospital_id)
}

/** 지금 역할로 넣기 함수를 부른다(undefined = SQL null) */
function importAs(payload: unknown) {
  return db.query(`select public.contacts_import($1::jsonb) as done`, [payload === undefined ? null : JSON.stringify(payload)])
}

// 줄 목록을 글자 차례로(DB 정렬 규칙과 상관없이 견주려고)
const sorted = (list: Row[]) => [...list].sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y)))

/** 운영자 눈으로 본 그 병원 업체(칸 모두)·담당자·장비 */
async function bookOf(owner: string) {
  await operator()
  const h = [hospital[owner]]
  return {
    companies: sorted(await rows(`select ${COMPANY_SENT.join(', ')} from ${COMPANIES} where hospital_id = $1`, h)),
    people: sorted(
      await rows(`select c.name as company, p.name, p.mobile, p.role from ${PEOPLE} p join ${COMPANIES} c on c.id = p.company_id where p.hospital_id = $1`, h),
    ),
    equipment: sorted(
      await rows(
        `select e.id, c.name as company, e.name, e.serial, e.bought_on::text as bought_on, e.warranty_until::text as warranty_until
         from ${EQUIPMENT} e join ${COMPANIES} c on c.id = e.company_id where e.hospital_id = $1`,
        h,
      ),
    ),
  }
}

const many = (n: number, make: (i: number) => Row) => Array.from({ length: n }, (_, i) => make(i))

beforeAll(async () => {
  db = await PGlite.create()
  await migrate(db)
}, 180_000)

afterAll(async () => {
  await db.close()
})

beforeEach(resetData)

describe('AC-6501.1 표 모양', SLOW, () => {
  async function columnsOf(table: string) {
    return (
      await rows(
        `select column_name, udt_name, is_nullable, column_default from information_schema.columns
         where table_schema = 'public' and table_name = $1 order by ordinal_position`,
        [nameOf(table)],
      )
    ).map((c) => [c.column_name, c.udt_name, c.is_nullable, c.column_default])
  }
  const ID = ['id', 'uuid', 'NO', 'gen_random_uuid()']
  const HOSPITAL = ['hospital_id', 'uuid', 'NO', MY_HOSPITAL]
  const CREATED = ['created_at', 'timestamptz', 'NO', 'now()']
  const EMPTY = "''::text"

  it.each<[string, unknown[][]]>([
    [
      COMPANIES,
      [
        ID,
        HOSPITAL,
        ['category', 'text', 'NO', null],
        ['name', 'text', 'NO', null],
        ...COMPANY_TEXT.map(([c]) => [c, 'text', 'NO', EMPTY]),
        CREATED,
      ],
    ],
    [
      PEOPLE,
      [ID, HOSPITAL, ['company_id', 'uuid', 'NO', null], ['name', 'text', 'NO', null], ['mobile', 'text', 'NO', EMPTY], ['role', 'text', 'NO', EMPTY], CREATED],
    ],
    [
      EQUIPMENT,
      [
        ID,
        HOSPITAL,
        ['company_id', 'uuid', 'NO', null],
        ['name', 'text', 'NO', null],
        ['serial', 'text', 'NO', EMPTY],
        ['bought_on', 'date', 'YES', null],
        ['warranty_until', 'date', 'YES', null],
        CREATED,
      ],
    ],
    [
      REPAIRS,
      [ID, HOSPITAL, ['equipment_id', 'uuid', 'NO', null], ['day', 'date', 'NO', null], ['content', 'text', 'NO', null], ['cost', 'int8', 'YES', null], CREATED],
    ],
  ])('AC-6501.1: %s 칸·타입·비울 수 있음·기본값이 design.md DB 모양이다(hospital_id 기본값은 my_hospital_id())', async (table, expected) => {
    expect(await columnsOf(table)).toEqual(expected)
  })

  const HOSPITAL_FK = { contype: 'f', def: expect.stringMatching(/^FOREIGN KEY \(hospital_id\) REFERENCES (public\.)?hospitals\(id\) ON DELETE CASCADE$/) }
  it.each<[string, Row[]]>([
    [
      COMPANIES,
      [HOSPITAL_FK, { contype: 'p', def: 'PRIMARY KEY (id)' }, { contype: 'u', def: 'UNIQUE (hospital_id, name)' }, { contype: 'u', def: 'UNIQUE (hospital_id, id)' }],
    ],
    [
      PEOPLE,
      [
        HOSPITAL_FK,
        {
          contype: 'f',
          def: expect.stringMatching(/^FOREIGN KEY \(hospital_id, company_id\) REFERENCES (public\.)?contacts_companies\(hospital_id, id\) ON DELETE CASCADE$/),
        },
        { contype: 'p', def: 'PRIMARY KEY (id)' },
        { contype: 'u', def: 'UNIQUE (company_id, name)' },
      ],
    ],
    [
      EQUIPMENT,
      [
        HOSPITAL_FK,
        {
          contype: 'f',
          def: expect.stringMatching(/^FOREIGN KEY \(hospital_id, company_id\) REFERENCES (public\.)?contacts_companies\(hospital_id, id\) ON DELETE CASCADE$/),
        },
        { contype: 'p', def: 'PRIMARY KEY (id)' },
        { contype: 'u', def: 'UNIQUE (hospital_id, id)' },
      ],
    ],
    [
      REPAIRS,
      [
        HOSPITAL_FK,
        {
          contype: 'f',
          def: expect.stringMatching(/^FOREIGN KEY \(hospital_id, equipment_id\) REFERENCES (public\.)?contacts_equipment\(hospital_id, id\) ON DELETE CASCADE$/),
        },
        { contype: 'p', def: 'PRIMARY KEY (id)' },
      ],
    ],
  ])('AC-6501.1: %s 기본 키·바깥 키(병원, (hospital_id, 부모 id) 둘로)·겹침 제약이 design.md 그대로다(장비는 이름·일련번호 겹침 제약 없음)', async (table, expected) => {
    const found = await rows(
      `select contype, pg_get_constraintdef(oid) as def from pg_constraint where conrelid = to_regclass($1) and contype in ('p', 'f', 'u')`,
      [table],
    )
    expect(found).toHaveLength(expected.length)
    expect(found).toEqual(expect.arrayContaining(expected))
  })

  it.each<[string, string[]]>([
    [COMPANIES, ['unique (hospital_id, id)', 'unique (hospital_id, name)', 'unique (id)']],
    [PEOPLE, ['unique (company_id, name)', 'unique (id)']],
    [EQUIPMENT, ['(company_id)', '(hospital_id, warranty_until)', 'unique (hospital_id, id)', 'unique (id)']],
    [REPAIRS, ['(equipment_id)', 'unique (id)']],
  ])('AC-6501.1: %s 색인은 %j뿐이다', async (table, expected) => {
    const found = (await rows(`select indexdef from pg_indexes where schemaname = 'public' and tablename = $1`, [nameOf(table)])).map((r) =>
      String(r.indexdef).replace(/^CREATE (UNIQUE )?INDEX \S+ ON \S+ USING btree /, (_, unique?: string) => (unique ? 'unique ' : '')),
    )
    expect(found.sort()).toEqual([...expected].sort())
  })

  it('AC-6501.1: 병원 줄을 지우면 네 표의 그 병원 줄도 지워지고 다른 병원 줄은 그대로다', async () => {
    await seedBook(A)
    const kept = await seedBook(B)
    await operator()
    await db.query('delete from public.hospitals where id = $1', [hospital[A]])
    await operator()
    expect((await rows(`select id from ${COMPANIES}`)).map((r) => r.id)).toEqual([kept.company])
    expect((await rows(`select id from ${PEOPLE}`)).map((r) => r.id)).toEqual([kept.person])
    expect((await rows(`select id from ${EQUIPMENT}`)).map((r) => r.id)).toEqual([kept.equipment])
    expect((await rows(`select id from ${REPAIRS}`)).map((r) => r.id)).toEqual([kept.repair])
  })

  it.each(TABLES)('AC-6501.1: %s는 RLS가 켜져 있다', async (table) => {
    expect(await rows(`select relrowsecurity as on from pg_class where oid = to_regclass($1)`, [table])).toEqual([{ on: true }])
  })

  it.each(TABLES)('AC-6501.1: anon에게 %s의 표·칸 권한이 하나도 없다(기본 권한을 먼저 거뒀다)', async (table) => {
    await rows(`select $1::regclass`, [table]) // 표가 없으면 여기서 실패한다(빈 목록과 헷갈리지 않게)
    for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']) {
      expect([privilege, (await rows(`select has_any_column_privilege('anon', $1, $2) as ok`, [table, privilege]))[0].ok]).toEqual([privilege, false])
    }
    for (const privilege of ['DELETE', 'TRUNCATE', 'TRIGGER']) {
      expect([privilege, (await rows(`select has_table_privilege('anon', $1, $2) as ok`, [table, privilege]))[0].ok]).toEqual([privilege, false])
    }
  })

  it.each(TABLES)('AC-6501.1: authenticated의 %s 표 전체 권한은 SELECT·DELETE뿐이다(넣기·고치기는 칸 단위, 바깥 키 걸기·비우기·트리거 없음)', async (table) => {
    await rows(`select $1::regclass`, [table])
    const granted = await rows(
      `select grantee, privilege_type from information_schema.role_table_grants
       where table_schema = 'public' and table_name = $1 and grantee in ('anon', 'authenticated', 'PUBLIC')
       order by grantee, privilege_type`,
      [nameOf(table)],
    )
    expect(granted).toEqual([
      { grantee: 'authenticated', privilege_type: 'DELETE' },
      { grantee: 'authenticated', privilege_type: 'SELECT' },
    ])
    expect((await rows(`select has_any_column_privilege('authenticated', $1, 'REFERENCES') as ok`, [table]))[0].ok).toBe(false)
  })

  it.each<[string, string, string[]]>([
    [COMPANIES, 'INSERT', COMPANY_SENT],
    [COMPANIES, 'UPDATE', COMPANY_SENT],
    [PEOPLE, 'INSERT', PERSON_INSERT],
    [PEOPLE, 'UPDATE', PERSON_UPDATE],
    [EQUIPMENT, 'INSERT', EQUIPMENT_INSERT],
    [EQUIPMENT, 'UPDATE', EQUIPMENT_UPDATE],
    [REPAIRS, 'INSERT', REPAIR_INSERT],
    [REPAIRS, 'UPDATE', REPAIR_UPDATE],
  ])('AC-6501.1: authenticated의 %s %s 칸 권한은 design.md 권한 표의 칸뿐이다(id·hospital_id·created_at 없음)', async (table, privilege, expected) => {
    await rows(`select $1::regclass`, [table])
    const list = await rows(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = $1 and has_column_privilege('authenticated', $2, column_name, $3)
       order by ordinal_position`,
      [nameOf(table), table, privilege],
    )
    expect(list.map((row) => row.column_name)).toEqual(expected)
  })

  it.each(TABLES)('AC-6501.1: %s 정책은 하나(for all, authenticated, my_hospital_id())이고 데스크 정책이 없다', async (table) => {
    const list = await rows(
      `select cmd, permissive, roles::text as roles, coalesce(qual, '') as qual, coalesce(with_check, '') as with_check from pg_policies
       where schemaname = 'public' and tablename = $1`,
      [nameOf(table)],
    )
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ cmd: 'ALL', permissive: 'PERMISSIVE', roles: '{authenticated}' })
    expect(list[0].qual).toMatch(POLICY_TEXT)
    expect(list[0].with_check).toBe(list[0].qual)
    expect(String(list[0].qual) + String(list[0].with_check)).not.toMatch(/my_desk_hospital_id|my_clinic_hospital_id/)
  })

  it('AC-6501.1: contacts_import(jsonb)는 void를 돌려주는 plpgsql 부른 사람 권한(security invoker) 함수이고 search_path가 비어 있다', async () => {
    const found = await rows(
      `select p.proname, pg_get_function_arguments(p.oid) as args, t.typname as returns, l.lanname as lang, p.prosecdef as definer, p.proconfig as config
       from pg_proc p join pg_type t on t.oid = p.prorettype join pg_language l on l.oid = p.prolang
       where p.pronamespace = 'public'::regnamespace and p.proname like 'contacts%'`,
    )
    expect(found).toEqual([{ proname: 'contacts_import', args: 'p jsonb', returns: 'void', lang: 'plpgsql', definer: false, config: ['search_path=""'] }])
  })

  it('AC-6501.1: contacts_import 실행 권한은 authenticated에만 있다(public·anon에서 거둠)', async () => {
    const fn = 'public.contacts_import(jsonb)'
    expect((await rows(`select has_function_privilege('authenticated', $1, 'EXECUTE') as ok`, [fn]))[0].ok).toBe(true)
    expect((await rows(`select has_function_privilege('anon', $1, 'EXECUTE') as ok`, [fn]))[0].ok).toBe(false)
    const [acl] = await rows(`select coalesce(array_to_string(proacl, ','), '') as acl from pg_proc where proname = 'contacts_import'`)
    expect(String(acl.acl)).toMatch(/(^|,)authenticated=X/)
    expect(String(acl.acl)).not.toMatch(/(^|,)=/) // PUBLIC 몫 없음
    expect(String(acl.acl)).not.toMatch(/(^|,)anon=/)
  })

  it('AC-6501.1: 파일이 있고 줄 끝이 LF이며, 머리 주석에 운영자가 붙여 넣는 방법·앞에 있어야 할 파일·ADR-034가 있다', () => {
    expect(CONTACTS_MIGRATION).not.toBe('')
    expect(CONTACTS_MIGRATION).not.toContain('\r')
    const lines = CONTACTS_MIGRATION.split('\n')
    const head = lines.slice(0, lines.findIndex((line) => !/^(--|\s*$)/.test(line))).join('\n')
    expect(head).toContain('운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다')
    expect(head).toContain('20261030000000_precheck_settings.sql')
    expect(head).toContain('ADR-034')
  })

  it('AC-6501.1: 두 번 돌려도 되는 문장만 쓴다(표·색인은 if not exists, 함수는 or replace, 정책은 지우고 다시 만들기, 지우기 없음)', () => {
    const count = (pattern: RegExp) => (CONTACTS_TOP.match(pattern) ?? []).length
    for (const table of TABLES) {
      expect(count(new RegExp(`create\\s+table\\s+if\\s+not\\s+exists\\s+${table.replace('.', '\\.')}\\b`, 'gi'))).toBe(1)
    }
    expect(CONTACTS_TOP).not.toMatch(/create\s+table\s+(?!if\s+not\s+exists)/i)
    expect(CONTACTS_TOP).not.toMatch(/create\s+(unique\s+)?index\s+(?!if\s+not\s+exists)/i)
    expect(CONTACTS_TOP).not.toMatch(/create\s+function/i)
    expect(CONTACTS_TOP).not.toMatch(/create\s+(or\s+replace\s+)?(constraint\s+)?trigger/i)
    expect(count(/create\s+or\s+replace\s+function/gi)).toBe(1)
    expect(CONTACTS_TOP).not.toMatch(/^\s*(drop\s+(?!policy\s+if\s+exists)|truncate|delete)\b/im)
    expect(count(/create\s+policy/gi)).toBe(4)
    expect(count(/drop\s+policy\s+if\s+exists/gi)).toBe(4)
    for (const [, target] of CONTACTS_TOP.matchAll(/^\s*alter table\s+(\S+)/gim)) expect(TABLES).toContain(target)
    // my_hospital_id()는 앞 migration 것을 쓴다(여기서 다시 만들지 않는다). 데스크 정책·정의자 함수 없음
    expect(CONTACTS_SQL).not.toMatch(/function\s+public\.my_hospital_id/i)
    expect(CONTACTS_SQL).not.toMatch(/my_desk_hospital_id|my_clinic_hospital_id/)
    expect(CONTACTS_SQL).not.toMatch(/security\s+definer/i)
    // 업체는 이름으로 찾아 고치고 없으면 넣는다(on conflict 없음)
    expect(CONTACTS_SQL).not.toMatch(/on\s+conflict/i)
  })

  it.each(TABLES)('AC-6501.1: %s 표 권한은 revoke all 뒤에만 준다', (table) => {
    const escaped = table.replace('.', '\\.')
    const revoke = CONTACTS_TOP.search(new RegExp(`revoke all on table ${escaped} from anon, authenticated;`))
    expect(revoke).toBeGreaterThanOrEqual(0)
    const grants = [...CONTACTS_TOP.matchAll(new RegExp(`^grant [^;]+ on table ${escaped} to [^;]+;`, 'gm'))]
    expect(grants.length).toBeGreaterThan(0)
    for (const grant of grants) expect(grant.index).toBeGreaterThan(revoke)
  })

  it('AC-6501.1: 함수 실행 권한은 public·anon에서 거둔 뒤 authenticated에만 준다', () => {
    const revoke = CONTACTS_TOP.search(/revoke all on function public\.contacts_import\(jsonb\) from public, anon;/)
    const grant = CONTACTS_TOP.search(/grant execute on function public\.contacts_import\(jsonb\) to authenticated;/)
    expect(revoke).toBeGreaterThanOrEqual(0)
    expect(grant).toBeGreaterThan(revoke)
  })

  // 표마다 칸·제약·색인·표와 칸 권한·RLS·정책, 그리고 함수
  async function shape(target: PGlite) {
    const shapes: Row = {}
    for (const table of TABLES) {
      const q = (sql: string) => rows(sql, [table, nameOf(table)], target)
      shapes[table] = {
        columns: await q(
          `select column_name, data_type, is_nullable, column_default from information_schema.columns
           where table_schema = 'public' and table_name = $2 and $1 <> '' order by ordinal_position`,
        ),
        constraints: await q(
          `select conname, contype, pg_get_constraintdef(oid) as def from pg_constraint
           where conrelid = to_regclass($1) and $2 <> '' order by conname`,
        ),
        indexes: await q(`select indexname, indexdef from pg_indexes where schemaname = 'public' and tablename = $2 and $1 <> '' order by 1`),
        access: await q(
          `select c.relrowsecurity, c.relforcerowsecurity,
                  (select array_agg(item::text order by item::text) from unnest(c.relacl) item) as table_acl,
                  (select array_agg(a.attname || ':' || item::text order by a.attname, item::text)
                   from pg_attribute a, unnest(a.attacl) item where a.attrelid = c.oid) as column_acl
           from pg_class c where c.oid = to_regclass($1) and $2 <> ''`,
        ),
        policies: await q(
          `select policyname, cmd, roles::text[] as roles, qual, with_check from pg_policies
           where schemaname = 'public' and tablename = $2 and $1 <> '' order by policyname`,
        ),
      }
    }
    shapes.functions = await rows(
      `select proname, prosecdef, proconfig, prosrc, (select array_agg(item::text order by item::text) from unnest(proacl) item) as acl
       from pg_proc where pronamespace = 'public'::regnamespace and proname like 'contacts%' order by proname`,
      [],
      target,
    )
    return shapes
  }

  it('AC-6501.1: 같은 DB에 두 번 돌려도 오류 없이 칸·제약·색인·권한·RLS·정책·함수와 이미 있던 줄이 그대로다', async () => {
    const fresh = await PGlite.create()
    try {
      await migrate(fresh)
      const once = await shape(fresh)
      expect((once[COMPANIES] as { columns: Row[] }).columns).toHaveLength(14)
      expect(once.functions as Row[]).toHaveLength(1)
      await fresh.query('insert into auth.users (id, email) values ($1, $2)', [A, emailOf(A)])
      const [h] = await rows(
        `insert into public.hospitals (owner_id, name, applicant_name, email, status) values ($1, '가짜병원', '홍길동', $2, 'approved') returning id`,
        [A, emailOf(A)],
        fresh,
      )
      const one = async (sql: string, params: unknown[]) => (await rows(sql, params, fresh))[0].id as string
      const company = await one(`insert into ${COMPANIES} (hospital_id, category, name, site_pw) values ($1, 'agency', '예시공단', 'fake-pw') returning id`, [h.id])
      await fresh.query(`insert into ${PEOPLE} (hospital_id, company_id, name, role) values ($1, $2, '김예시', '과장')`, [h.id, company])
      const equipment = await one(
        `insert into ${EQUIPMENT} (hospital_id, company_id, name, warranty_until) values ($1, $2, '온열기', '2027-01-04') returning id`,
        [h.id, company],
      )
      await fresh.query(`insert into ${REPAIRS} (hospital_id, equipment_id, day, content, cost) values ($1, $2, $3, '팬 교체', 120000)`, [h.id, equipment, DAY])
      const seeded = async () => {
        const shot: Row = {}
        for (const table of TABLES) shot[table] = await rows(`select to_jsonb(t)::text as line from ${table} t order by id`, [], fresh)
        return shot
      }
      const before = await seeded()

      await fresh.exec(CONTACTS_MIGRATION)

      expect(await shape(fresh)).toEqual(once)
      expect(await seeded()).toEqual(before)
      for (const table of TABLES) expect(before[table] as Row[], table).toHaveLength(1)
    } finally {
      await fresh.close()
    }
  }, 180_000)
})

describe('AC-6501.2 승인된 병원 원장은 자기 병원 줄만', SLOW, () => {
  it('AC-6501.2: 원장이 업체를 넣으면 id·hospital_id(my_hospital_id())·created_at은 DB가 정하고 적지 않은 칸은 빈 글자다', async () => {
    await become(A)
    const { rows: added } = await insertInto(
      COMPANIES,
      COMPANY,
      `id, hospital_id, ${COMPANY_SENT.join(', ')}, created_at > '${OLD}'::timestamptz as fresh`,
    )
    expect(added).toEqual([
      { id: expect.any(String), hospital_id: hospital[A], ...COMPANY, ...Object.fromEntries(COMPANY_TEXT.map(([c]) => [c, ''])), fresh: true },
    ])
  })

  it('AC-6501.2: 원장은 네 표에 줄을 넣고 읽고 정해 둔 칸을 고치고 지울 수 있다', async () => {
    await become(A)
    const [company] = (await insertInto(COMPANIES, FULL_COMPANY, `id, hospital_id, ${COMPANY_SENT.join(', ')}`)).rows
    expect(company).toEqual({ id: expect.any(String), hospital_id: hospital[A], ...FULL_COMPANY })
    const [person] = (await insertInto(PEOPLE, { company_id: company.id, name: '김예시', mobile: '010-0000-0000', role: '영업' }, 'id, hospital_id, name, mobile, role')).rows
    expect(person).toEqual({ id: expect.any(String), hospital_id: hospital[A], name: '김예시', mobile: '010-0000-0000', role: '영업' })
    const [equipment] = (
      await insertInto(
        EQUIPMENT,
        { company_id: company.id, name: '충격파 기계', bought_on: '2026-01-05', warranty_until: '2028-01-04' },
        'id, hospital_id, name, serial, bought_on::text as bought_on, warranty_until::text as warranty_until',
      )
    ).rows
    expect(equipment).toEqual({ id: expect.any(String), hospital_id: hospital[A], name: '충격파 기계', serial: '', bought_on: '2026-01-05', warranty_until: '2028-01-04' })
    const [repair] = (await insertInto(REPAIRS, { equipment_id: equipment.id, day: DAY, content: '헤드 교체' }, 'id, hospital_id, day::text as day, content, cost')).rows
    expect(repair).toEqual({ id: expect.any(String), hospital_id: hospital[A], day: DAY, content: '헤드 교체', cost: null })

    for (const table of TABLES) expect(await hospitalsSeenIn(table)).toEqual([hospital[A]])

    const set = (columns: string[]) => columns.map((c, i) => `${c} = $${i + 2}`).join(', ')
    const companyChange: Row = { ...FULL_COMPANY, category: 'other', name: '예시설비2', phone: '', memo: '바꾼 메모', site_pw: 'new-pw' }
    expect(
      (await db.query(`update ${COMPANIES} set ${set(COMPANY_SENT)} where id = $1`, [company.id, ...COMPANY_SENT.map((c) => companyChange[c])])).affectedRows,
    ).toBe(1)
    expect((await db.query(`update ${PEOPLE} set ${set(PERSON_UPDATE)} where id = $1`, [person.id, '이예시', '010-1111-1111', '수리 기사'])).affectedRows).toBe(1)
    expect(
      (await db.query(`update ${EQUIPMENT} set ${set(EQUIPMENT_UPDATE)} where id = $1`, [equipment.id, '온열기', 'SN-0002', null, '2027-12-31'])).affectedRows,
    ).toBe(1)
    expect((await db.query(`update ${REPAIRS} set ${set(REPAIR_UPDATE)} where id = $1`, [repair.id, DAY2, '팬 교체', 0])).affectedRows).toBe(1)
    expect(await rows(`select ${COMPANY_SENT.join(', ')} from ${COMPANIES}`)).toEqual([companyChange])
    expect(await rows(`select name, mobile, role from ${PEOPLE}`)).toEqual([{ name: '이예시', mobile: '010-1111-1111', role: '수리 기사' }])
    expect(await rows(`select name, serial, bought_on, warranty_until::text as warranty_until from ${EQUIPMENT}`)).toEqual([
      { name: '온열기', serial: 'SN-0002', bought_on: null, warranty_until: '2027-12-31' },
    ])
    expect(await rows(`select day::text as day, content, cost from ${REPAIRS}`)).toEqual([{ day: DAY2, content: '팬 교체', cost: 0 }])

    expect((await db.query(`delete from ${REPAIRS} where id = $1`, [repair.id])).affectedRows).toBe(1)
    expect((await db.query(`delete from ${PEOPLE} where id = $1`, [person.id])).affectedRows).toBe(1)
    expect((await db.query(`delete from ${EQUIPMENT} where id = $1`, [equipment.id])).affectedRows).toBe(1)
    expect((await db.query(`delete from ${COMPANIES} where id = $1`, [company.id])).affectedRows).toBe(1)
    for (const table of TABLES) expect(await countOf(table, A)).toBe(0)
  })

  it('AC-6501.2: 원장에게는 내 병원 줄만 보이고, 남의 줄은 id로 고치거나 지워도 0줄이다', async () => {
    const mine = await seedBook(A)
    const other = await seedBook(B, '남의업체')
    const before = await snapshot()
    await become(A)
    expect((await rows(`select id from ${COMPANIES}`)).map((r) => r.id)).toEqual([mine.company])
    expect((await rows(`select id from ${PEOPLE}`)).map((r) => r.id)).toEqual([mine.person])
    expect((await rows(`select id from ${EQUIPMENT}`)).map((r) => r.id)).toEqual([mine.equipment])
    expect((await rows(`select id from ${REPAIRS}`)).map((r) => r.id)).toEqual([mine.repair])
    expect((await db.query(`update ${COMPANIES} set memo = '바꿈' where id = $1`, [other.company])).affectedRows).toBe(0)
    expect((await db.query(`update ${PEOPLE} set role = '바꿈' where id = $1`, [other.person])).affectedRows).toBe(0)
    expect((await db.query(`update ${EQUIPMENT} set serial = '바꿈' where id = $1`, [other.equipment])).affectedRows).toBe(0)
    expect((await db.query(`update ${REPAIRS} set content = '바꿈' where id = $1`, [other.repair])).affectedRows).toBe(0)
    expect((await db.query(`delete from ${REPAIRS} where id = $1`, [other.repair])).affectedRows).toBe(0)
    expect((await db.query(`delete from ${PEOPLE} where id = $1`, [other.person])).affectedRows).toBe(0)
    expect((await db.query(`delete from ${EQUIPMENT} where id = $1`, [other.equipment])).affectedRows).toBe(0)
    expect((await db.query(`delete from ${COMPANIES} where id = $1`, [other.company])).affectedRows).toBe(0)
    expect(await snapshot()).toEqual(before)
  })

  it.each<[string, string, string, Row]>([
    ...['id', 'hospital_id', 'created_at'].flatMap((column): [string, string, string, Row][] => [
      [COMPANIES, column, 'company', {}],
      [PEOPLE, column, 'person', {}],
      [EQUIPMENT, column, 'equipment', {}],
      [REPAIRS, column, 'repair', {}],
    ]),
  ])('AC-6501.2: 원장이 %s 줄을 넣을 때 %s 칸은 보낼 수 없다(권한 없음)', async (table, column) => {
    const { company, equipment } = await seedBook(A)
    const before = await snapshot()
    const base: Record<string, Row> = {
      [COMPANIES]: { ...COMPANY, name: '새업체' },
      [PEOPLE]: { company_id: company, name: '새담당' },
      [EQUIPMENT]: { company_id: company, name: '새장비' },
      [REPAIRS]: { equipment_id: equipment, day: DAY, content: '새 기록' },
    }
    const value: Record<string, unknown> = { id: OTHER_ID, hospital_id: hospital[A], created_at: OLD }
    await become(A)
    await expect(insertInto(table, { ...base[table], [column]: value[column] })).rejects.toMatchObject(DENIED)
    expect(await snapshot()).toEqual(before)
  })

  it.each<[string, string]>([
    ...['id', 'hospital_id', 'created_at'].flatMap((column): [string, string][] => TABLES.map((table): [string, string] => [table, column])),
    [PEOPLE, 'company_id'],
    [EQUIPMENT, 'company_id'],
    [REPAIRS, 'equipment_id'],
  ])('AC-6501.2: 원장은 %s의 %s 칸을 직접 고칠 수 없다(권한 없음)', async (table, column) => {
    const mine = await seedBook(A)
    const second = await seedBook(A, '예시설비')
    const before = await snapshot()
    const value: Record<string, unknown> = {
      id: OTHER_ID,
      hospital_id: hospital[B],
      created_at: OLD,
      company_id: second.company,
      equipment_id: second.equipment,
    }
    const idOf: Record<string, string> = { [COMPANIES]: mine.company, [PEOPLE]: mine.person, [EQUIPMENT]: mine.equipment, [REPAIRS]: mine.repair }
    await become(A)
    await expect(db.query(`update ${table} set ${column} = $1 where id = $2`, [value[column], idOf[table]])).rejects.toMatchObject(DENIED)
    expect(await snapshot()).toEqual(before)
  })

  it('AC-6501.2: 원장 A가 B의 업체 id·장비 id를 담당자·장비·수리 기록 줄에 넣으면 거부된다(바깥 키가 병원까지 본다)', async () => {
    const other = await seedBook(B, '남의업체')
    const before = await snapshot()
    await become(A)
    // B 업체에 이미 있는 담당자 이름(김예시)과 겹치지 않게 새 이름으로 넣는다(겹침 검사가 바깥 키보다 먼저 걸리므로)
    await expect(insertInto(PEOPLE, { company_id: other.company, name: '이예시' })).rejects.toMatchObject(FK_FAILED)
    await expect(insertInto(EQUIPMENT, { company_id: other.company, name: '충격파 기계' })).rejects.toMatchObject(FK_FAILED)
    await expect(insertInto(REPAIRS, { equipment_id: other.equipment, day: DAY, content: '헤드 교체' })).rejects.toMatchObject(FK_FAILED)
    await expect(insertInto(PEOPLE, { company_id: OTHER_ID, name: '이예시' })).rejects.toMatchObject(FK_FAILED)
    expect(await snapshot()).toEqual(before)
  })

  it('AC-6501.2: 다른 병원 B의 원장은 A의 네 표를 0줄로 보고, A의 업체·장비 밑에 줄을 넣지 못하며 고치기·지우기는 0줄이다', async () => {
    const mine = await seedBook(A)
    const before = await snapshot()
    await become(B)
    for (const table of TABLES) expect(await rows(`select * from ${table}`)).toEqual([])
    await expect(insertInto(PEOPLE, { company_id: mine.company, name: '이예시' })).rejects.toMatchObject(FK_FAILED)
    await expect(insertInto(EQUIPMENT, { company_id: mine.company, name: '온열기' })).rejects.toMatchObject(FK_FAILED)
    await expect(insertInto(REPAIRS, { equipment_id: mine.equipment, day: DAY, content: '팬 교체' })).rejects.toMatchObject(FK_FAILED)
    await become(B)
    expect((await db.query(`update ${COMPANIES} set memo = '바꿈'`)).affectedRows).toBe(0)
    expect((await db.query(`update ${PEOPLE} set role = '바꿈'`)).affectedRows).toBe(0)
    expect((await db.query(`update ${EQUIPMENT} set serial = '바꿈'`)).affectedRows).toBe(0)
    expect((await db.query(`update ${REPAIRS} set content = '바꿈'`)).affectedRows).toBe(0)
    for (const table of TABLES) expect((await db.query(`delete from ${table}`)).affectedRows).toBe(0)
    expect(await snapshot()).toEqual(before)
  })

  it.each<[string, string]>([
    ['승인 대기', C],
    ['거절', D],
    ['병원 줄 없음', E],
    ['A의 데스크', K],
  ])('AC-6501.2: %s 사용자는 네 표에서 0줄이고 넣기는 거부되며 고치기·지우기는 0줄이다', async (_name, user) => {
    const mine = await seedBook(A)
    if (hospital[user]) await seedBook(user, '대기업체') // 승인 안 된 병원의 줄(운영자가 넣음)도 그 사용자에게 안 보인다
    const before = await snapshot()
    await become(user)
    for (const table of TABLES) expect(await rows(`select * from ${table}`)).toEqual([])
    await expect(insertInto(COMPANIES, { ...COMPANY, name: '새업체' })).rejects.toMatchObject(NO_HOSPITAL)
    await become(user)
    await expect(insertInto(PEOPLE, { company_id: mine.company, name: '이예시' })).rejects.toMatchObject(NO_HOSPITAL)
    await become(user)
    await expect(insertInto(EQUIPMENT, { company_id: mine.company, name: '온열기' })).rejects.toMatchObject(NO_HOSPITAL)
    await become(user)
    await expect(insertInto(REPAIRS, { equipment_id: mine.equipment, day: DAY, content: '팬 교체' })).rejects.toMatchObject(NO_HOSPITAL)
    await become(user)
    expect((await db.query(`update ${COMPANIES} set memo = '바꿈'`)).affectedRows).toBe(0)
    expect((await db.query(`update ${PEOPLE} set role = '바꿈'`)).affectedRows).toBe(0)
    expect((await db.query(`update ${EQUIPMENT} set serial = '바꿈'`)).affectedRows).toBe(0)
    expect((await db.query(`update ${REPAIRS} set content = '바꿈'`)).affectedRows).toBe(0)
    for (const table of TABLES) expect((await db.query(`delete from ${table}`)).affectedRows).toBe(0)
    expect(await snapshot()).toEqual(before)
  })

  it('AC-6501.2: anon은 네 표 모두 읽기·넣기·고치기·지우기가 권한 없음이고 넣기 함수도 부르지 못한다', async () => {
    const mine = await seedBook(A)
    const before = await snapshot()
    await becomeAnon()
    for (const table of TABLES) {
      await expect(db.query(`select * from ${table}`)).rejects.toMatchObject(DENIED)
      await expect(db.query(`delete from ${table}`)).rejects.toMatchObject(DENIED)
    }
    await expect(insertInto(COMPANIES, { ...COMPANY, name: '새업체' })).rejects.toMatchObject(DENIED)
    await expect(insertInto(PEOPLE, { company_id: mine.company, name: '이예시' })).rejects.toMatchObject(DENIED)
    await expect(insertInto(EQUIPMENT, { company_id: mine.company, name: '온열기' })).rejects.toMatchObject(DENIED)
    await expect(insertInto(REPAIRS, { equipment_id: mine.equipment, day: DAY, content: '팬 교체' })).rejects.toMatchObject(DENIED)
    await expect(db.query(`update ${COMPANIES} set memo = 'x'`)).rejects.toMatchObject(DENIED)
    await expect(db.query(`update ${PEOPLE} set role = 'x'`)).rejects.toMatchObject(DENIED)
    await expect(db.query(`update ${EQUIPMENT} set serial = 'x'`)).rejects.toMatchObject(DENIED)
    await expect(db.query(`update ${REPAIRS} set content = 'x'`)).rejects.toMatchObject(DENIED)
    await expect(importAs({ companies: [{ name: '새업체', category: 'other' }] })).rejects.toMatchObject(DENIED)
    expect(await snapshot()).toEqual(before)
  })
})

describe('AC-6501.3 값 제약', SLOW, () => {
  const word = (n: number, ch = '가') => ch.repeat(n)

  // [이름, 표, 칸 값(부모 id를 받아 만듦), 기대 오류]
  type Parent = { company: string; equipment: string }
  const companyCase = (values: Row) => () => ({ ...COMPANY, name: '새업체', ...values })
  const personCase = (values: Row) => (p: Parent) => ({ company_id: p.company, name: '새담당', ...values })
  const equipmentCase = (values: Row) => (p: Parent) => ({ company_id: p.company, name: '새장비', ...values })
  const repairCase = (values: Row) => (p: Parent) => ({ equipment_id: p.equipment, day: DAY, content: '새 기록', ...values })
  const withoutKey = (make: (p: Parent) => Row, key: string) => (p: Parent) => {
    const values = make(p)
    delete values[key]
    return values
  }

  it.each<[string, string, (p: Parent) => Row, Row]>([
    ['분류 x', COMPANIES, companyCase({ category: 'x' }), CHECK_FAILED],
    ['분류 한글(거래처)', COMPANIES, companyCase({ category: '거래처' }), CHECK_FAILED],
    ['분류 없음', COMPANIES, withoutKey(companyCase({}), 'category'), NOT_NULL_FAILED],
    ['업체 이름 없음', COMPANIES, withoutKey(companyCase({}), 'name'), NOT_NULL_FAILED],
    ["업체 이름 ''", COMPANIES, companyCase({ name: '' }), CHECK_FAILED],
    ["업체 이름 ' 가'", COMPANIES, companyCase({ name: ' 가' }), CHECK_FAILED],
    ["업체 이름 '가 '", COMPANIES, companyCase({ name: '가 ' }), CHECK_FAILED],
    ['업체 이름 41자', COMPANIES, companyCase({ name: word(41) }), CHECK_FAILED],
    ['업체 이름 41자(코드포인트)', COMPANIES, companyCase({ name: word(41, '🏥') }), CHECK_FAILED],
    ...COMPANY_TEXT.map(([column, max]): [string, string, (p: Parent) => Row, Row] => [`업체 ${column} ${max + 1}자`, COMPANIES, companyCase({ [column]: word(max + 1) }), CHECK_FAILED]),
    ...COMPANY_TEXT.map(([column]): [string, string, (p: Parent) => Row, Row] => [`업체 ${column} null`, COMPANIES, companyCase({ [column]: null }), NOT_NULL_FAILED]),
    ['담당자 업체 없음', PEOPLE, withoutKey(personCase({}), 'company_id'), NOT_NULL_FAILED],
    ["담당자 이름 ''", PEOPLE, personCase({ name: '' }), CHECK_FAILED],
    ["담당자 이름 ' 김예시'", PEOPLE, personCase({ name: ' 김예시' }), CHECK_FAILED],
    ['담당자 이름 21자', PEOPLE, personCase({ name: word(21) }), CHECK_FAILED],
    ['담당자 휴대폰 31자', PEOPLE, personCase({ mobile: word(31, '0') }), CHECK_FAILED],
    ['담당자 맡은 일 41자', PEOPLE, personCase({ role: word(41) }), CHECK_FAILED],
    ['담당자 휴대폰 null', PEOPLE, personCase({ mobile: null }), NOT_NULL_FAILED],
    ['장비 업체 없음', EQUIPMENT, withoutKey(equipmentCase({}), 'company_id'), NOT_NULL_FAILED],
    ["장비 이름 ''", EQUIPMENT, equipmentCase({ name: '' }), CHECK_FAILED],
    ["장비 이름 '기계 '", EQUIPMENT, equipmentCase({ name: '기계 ' }), CHECK_FAILED],
    ['장비 이름 61자', EQUIPMENT, equipmentCase({ name: word(61) }), CHECK_FAILED],
    ['일련번호 61자', EQUIPMENT, equipmentCase({ serial: word(61, 'S') }), CHECK_FAILED],
    ["일련번호 ' SN1'", EQUIPMENT, equipmentCase({ serial: ' SN1' }), CHECK_FAILED],
    ['일련번호 null', EQUIPMENT, equipmentCase({ serial: null }), NOT_NULL_FAILED],
    ['수리 장비 없음', REPAIRS, withoutKey(repairCase({}), 'equipment_id'), NOT_NULL_FAILED],
    ['수리 날짜 없음', REPAIRS, withoutKey(repairCase({}), 'day'), NOT_NULL_FAILED],
    ["수리 내용 ''", REPAIRS, repairCase({ content: '' }), CHECK_FAILED],
    ["수리 내용 ' 교체'", REPAIRS, repairCase({ content: ' 교체' }), CHECK_FAILED],
    ['수리 내용 201자', REPAIRS, repairCase({ content: word(201) }), CHECK_FAILED],
    ['비용 −1', REPAIRS, repairCase({ cost: -1 }), CHECK_FAILED],
    ['비용 10,000,000,000', REPAIRS, repairCase({ cost: 10_000_000_000 }), CHECK_FAILED],
  ])('AC-6501.3: %s → 거부', async (_name, table, make, error) => {
    const company = await seedCompany(A)
    const equipment = await seedEquipment(A, company)
    const before = await snapshot()
    await become(A)
    await expect(insertInto(table, make({ company, equipment }))).rejects.toMatchObject(error)
    expect(await snapshot()).toEqual(before)
  })

  it('AC-6501.3: 글자 수 한도 그대로(코드포인트로 셈)·비용 0·9,999,999,999·비움은 넣을 수 있다', async () => {
    await become(A)
    const full: Row = { category: 'agency', name: word(40), ...Object.fromEntries(COMPANY_TEXT.map(([c, max]) => [c, word(max)])) }
    const [company] = (await insertInto(COMPANIES, full)).rows
    await insertInto(COMPANIES, { category: 'other', name: word(40, '🏥') })
    await insertInto(PEOPLE, { company_id: company.id, name: word(20), mobile: word(30, '0'), role: word(40) })
    const [equipment] = (await insertInto(EQUIPMENT, { company_id: company.id, name: word(60), serial: word(60, 'S') })).rows
    for (const cost of [0, 9_999_999_999, null]) await insertInto(REPAIRS, { equipment_id: equipment.id, day: DAY, content: word(200), cost })
    expect(await rows(`select cost from ${REPAIRS} order by cost nulls last`)).toEqual([{ cost: 0 }, { cost: 9_999_999_999 }, { cost: null }])
    expect(await countOf(COMPANIES, A)).toBe(2)
  })

  it('AC-6501.3: 같은 병원에 같은 업체 이름은 거부(23505)되고 다른 병원이면 된다', async () => {
    await seedCompany(A)
    await become(A)
    await expect(insertInto(COMPANIES, { ...COMPANY, category: 'other' })).rejects.toMatchObject(UNIQUE_FAILED)
    await become(B)
    await insertInto(COMPANIES, COMPANY)
    expect([await countOf(COMPANIES, A), await countOf(COMPANIES, B)]).toEqual([1, 1])
  })

  it('AC-6501.3: 같은 업체에 같은 담당자 이름은 거부(23505)되고 다른 업체면 된다', async () => {
    const first = await seedCompany(A)
    const second = await seedCompany(A, { name: '예시설비' })
    await seedPerson(A, first)
    await become(A)
    await expect(insertInto(PEOPLE, { company_id: first, name: '김예시', role: '부장' })).rejects.toMatchObject(UNIQUE_FAILED)
    await become(A)
    await insertInto(PEOPLE, { company_id: second, name: '김예시' })
    expect(await countOf(PEOPLE, A)).toBe(2)
  })

  it('AC-6501.3: 장비는 같은 업체에 같은 이름·같은 일련번호여도 넣을 수 있다(장비에는 겹침 제약이 없다)', async () => {
    const company = await seedCompany(A)
    await become(A)
    for (const serial of ['SN-0001', 'SN-0001', '', '']) await insertInto(EQUIPMENT, { company_id: company, name: '치료기', serial })
    expect(await countOf(EQUIPMENT, A)).toBe(4)
  })
})

describe('AC-6501.4 지우면 함께 지워진다', SLOW, () => {
  async function seedTwo() {
    const x = await seedCompany(A)
    const xPeople = [await seedPerson(A, x), await seedPerson(A, x, { name: '이예시' })]
    const xEquipment = [await seedEquipment(A, x), await seedEquipment(A, x, { name: '온열기' })]
    const xRepairs = [
      await seedRepair(A, xEquipment[0]),
      await seedRepair(A, xEquipment[0], { day: DAY2, content: '팬 교체' }),
      await seedRepair(A, xEquipment[1], { content: '선 교체' }),
    ]
    const y = await seedBook(A, '예시설비')
    return { x, xPeople, xEquipment, xRepairs, y }
  }
  const idsIn = async (table: string) => (await rows(`select id from ${table}`)).map((r) => r.id).sort()

  it('AC-6501.4: 업체를 지우면 그 담당자 둘·장비 둘·수리 기록 셋이 모두 지워지고 다른 업체 줄은 그대로다', async () => {
    const { x, y } = await seedTwo()
    const other = await seedBook(B)
    await become(A)
    expect((await db.query(`delete from ${COMPANIES} where id = $1`, [x])).affectedRows).toBe(1)
    await operator()
    expect(await idsIn(COMPANIES)).toEqual([y.company, other.company].sort())
    expect(await idsIn(PEOPLE)).toEqual([y.person, other.person].sort())
    expect(await idsIn(EQUIPMENT)).toEqual([y.equipment, other.equipment].sort())
    expect(await idsIn(REPAIRS)).toEqual([y.repair, other.repair].sort())
  })

  it('AC-6501.4: 장비를 지우면 그 장비의 수리 기록만 지워진다(업체·담당자·다른 장비와 그 기록은 그대로)', async () => {
    const { x, xPeople, xEquipment, xRepairs, y } = await seedTwo()
    await become(A)
    expect((await db.query(`delete from ${EQUIPMENT} where id = $1`, [xEquipment[0]])).affectedRows).toBe(1)
    await operator()
    expect(await idsIn(COMPANIES)).toEqual([x, y.company].sort())
    expect(await idsIn(PEOPLE)).toEqual([...xPeople, y.person].sort())
    expect(await idsIn(EQUIPMENT)).toEqual([xEquipment[1], y.equipment].sort())
    expect(await idsIn(REPAIRS)).toEqual([xRepairs[2], y.repair].sort())
  })
})

describe('AC-6501.5 넣기 함수 contacts_import', SLOW, () => {
  const EMPTY_TEXT = Object.fromEntries(COMPANY_TEXT.map(([c]) => [c, '']))

  it('AC-6501.5: 새 업체·담당자·장비는 넣는다(몸통에 없는 칸은 빈 글자·비움, hospital_id는 내 병원)', async () => {
    await become(A)
    await importAs({
      companies: [FULL_COMPANY, { name: '예시메디칼', category: 'supplier', phone: '02-000-0000' }],
      people: [
        { company: '예시메디칼', name: '김예시', mobile: '010-0000-0000', role: '영업' },
        { company: '예시설비', name: '박예시' },
      ],
      equipment: [
        { company: '예시메디칼', name: '충격파 기계', serial: '0000-0001', bought_on: '2026-01-05', warranty_until: '2028-01-04' },
        { company: '예시설비', name: '온열기' },
      ],
    })
    const book = await bookOf(A)
    expect(book.companies).toEqual(sorted([FULL_COMPANY, { ...EMPTY_TEXT, name: '예시메디칼', category: 'supplier', phone: '02-000-0000' }]))
    expect(book.people).toEqual(
      sorted([
        { company: '예시메디칼', name: '김예시', mobile: '010-0000-0000', role: '영업' },
        { company: '예시설비', name: '박예시', mobile: '', role: '' },
      ]),
    )
    expect(book.equipment.every((e) => typeof e.id === 'string')).toBe(true)
    const withoutId = (e: Row) => Object.fromEntries(Object.entries(e).filter(([key]) => key !== 'id'))
    expect(sorted(book.equipment.map(withoutId))).toEqual(
      sorted([
        { company: '예시메디칼', name: '충격파 기계', serial: '0000-0001', bought_on: '2026-01-05', warranty_until: '2028-01-04' },
        { company: '예시설비', name: '온열기', serial: '', bought_on: null, warranty_until: null },
      ]),
    )
    for (const table of [COMPANIES, PEOPLE, EQUIPMENT]) expect(await countOf(table, A)).toBe(2)
    expect(await countOf(COMPANIES, B)).toBe(0)
  })

  it("AC-6501.5: 있는 업체는 몸통에 있는 칸만 고치고 없는 칸은 그대로다(분류 없이 고쳐도 되고, '' 값은 빈 글자로 고친다)", async () => {
    await seedCompany(A, { ...FULL_COMPANY, name: '예시메디칼', category: 'supplier' })
    await become(A)
    await importAs({ companies: [{ name: '예시메디칼', phone: '02-111-1111', site_pw: '', memo: '새 메모' }] })
    expect((await bookOf(A)).companies).toEqual([{ ...FULL_COMPANY, name: '예시메디칼', category: 'supplier', phone: '02-111-1111', site_pw: '', memo: '새 메모' }])
    await become(A)
    await importAs({ companies: [{ name: '예시메디칼', category: 'other' }] })
    expect((await bookOf(A)).companies).toEqual([{ ...FULL_COMPANY, name: '예시메디칼', category: 'other', phone: '02-111-1111', site_pw: '', memo: '새 메모' }])
    expect(await countOf(COMPANIES, A)).toBe(1)
  })

  it('AC-6501.5: 담당자는 (업체 이름, 담당자 이름)이 있으면 몸통 칸만 고치고 없으면 넣는다(같은 몸통의 새 업체 밑에도)', async () => {
    const company = await seedCompany(A)
    await seedPerson(A, company, { mobile: '010-0000-0000', role: '영업' })
    await seedPerson(A, company, { name: '최예시', mobile: '010-2222-2222', role: '경리' })
    await become(A)
    await importAs({
      companies: [{ name: '예시설비', category: 'repair' }],
      people: [
        { company: '예시메디칼', name: '김예시', role: '부장' },
        { company: '예시메디칼', name: '이예시', mobile: '010-0000-0001', role: '수리 기사' },
        { company: '예시설비', name: '김예시', mobile: '010-3333-3333' },
      ],
    })
    expect((await bookOf(A)).people).toEqual(
      sorted([
        { company: '예시메디칼', name: '김예시', mobile: '010-0000-0000', role: '부장' },
        { company: '예시메디칼', name: '최예시', mobile: '010-2222-2222', role: '경리' },
        { company: '예시메디칼', name: '이예시', mobile: '010-0000-0001', role: '수리 기사' },
        { company: '예시설비', name: '김예시', mobile: '010-3333-3333', role: '' },
      ]),
    )
  })

  it('AC-6501.5: 장비는 id가 있으면 그 장비의 몸통 칸만 고치고(이름·수리 기록 그대로) id가 없으면 같은 이름이 있어도 넣는다', async () => {
    const company = await seedCompany(A)
    const target = await seedEquipment(A, company, { name: '치료기', serial: '', bought_on: '2026-01-05', warranty_until: '2027-01-04' })
    const kept = await seedEquipment(A, company, { name: '치료기', serial: 'SN1', warranty_until: '2027-06-30' })
    const repair = await seedRepair(A, target, { cost: 30000 })
    await become(A)
    await importAs({
      equipment: [
        { id: target, company: '예시메디칼', name: '치료기', serial: 'SN2', warranty_until: '2028-01-04' },
        { company: '예시메디칼', name: '치료기', serial: 'SN1' },
      ],
    })
    const equipment = (await bookOf(A)).equipment
    expect(equipment).toHaveLength(3)
    expect(equipment.find((e) => e.id === target)).toEqual({
      id: target,
      company: '예시메디칼',
      name: '치료기',
      serial: 'SN2',
      bought_on: '2026-01-05',
      warranty_until: '2028-01-04',
    })
    expect(equipment.find((e) => e.id === kept)).toMatchObject({ serial: 'SN1', bought_on: null, warranty_until: '2027-06-30' })
    expect(equipment.filter((e) => e.id !== target && e.id !== kept)).toEqual([
      { id: expect.any(String), company: '예시메디칼', name: '치료기', serial: 'SN1', bought_on: null, warranty_until: null },
    ])
    await operator()
    expect(await rows(`select id, equipment_id, cost from ${REPAIRS}`)).toEqual([{ id: repair, equipment_id: target, cost: 30000 }])
  })

  it('AC-6501.5: 몸통에 없는 업체·담당자·장비·수리 기록과 다른 병원 줄은 그대로다', async () => {
    const mine = await seedBook(A)
    const untouched = await seedBook(A, '예시설비')
    await seedBook(B)
    const before = await snapshot()
    await become(A)
    await importAs({
      companies: [{ name: '예시메디칼', memo: '바뀐 메모' }],
      people: [{ company: '예시메디칼', name: '이예시' }],
      equipment: [{ id: mine.equipment, company: '예시메디칼', name: '충격파 기계', bought_on: '2026-02-01' }],
    })
    const after = await snapshot()
    const linesWith = (shot: Row, table: string, id: string) => (shot[table] as string[]).filter((line) => line.includes(id))
    for (const [table, id] of [
      [COMPANIES, untouched.company],
      [PEOPLE, untouched.person],
      [PEOPLE, mine.person],
      [EQUIPMENT, untouched.equipment],
      [REPAIRS, untouched.repair],
      [REPAIRS, mine.repair],
    ] as const) {
      expect(linesWith(after, table, id), `${table} ${id}`).toEqual(linesWith(before, table, id))
    }
    expect(await countOf(PEOPLE, A)).toBe(3)
    for (const table of TABLES) expect((after[table] as string[]).filter((line) => line.includes(hospital[B]))).toEqual(
      (before[table] as string[]).filter((line) => line.includes(hospital[B])),
    )
  })

  it('AC-6501.5: 세 키가 없거나 빈 배열이면 아무것도 바꾸지 않고 오류도 없다', async () => {
    await seedBook(A)
    const before = await snapshot()
    await become(A)
    await importAs({})
    await importAs({ companies: [], people: [], equipment: [] })
    expect(await snapshot()).toEqual(before)
  })

  it('AC-6501.5: 부른 사람 권한이라 B의 업체 이름은 보이지 않는다 — A가 같은 이름을 넣으면 A의 새 업체가 생기고 B 업체는 그대로다', async () => {
    await seedCompany(B, { phone: '02-999-9999' })
    const before = await snapshot()
    await become(A)
    await importAs({ companies: [{ name: '예시메디칼', category: 'other', phone: '02-000-0000' }] })
    expect((await bookOf(A)).companies).toEqual([{ ...EMPTY_TEXT, name: '예시메디칼', category: 'other', phone: '02-000-0000' }])
    expect((await bookOf(B)).companies).toEqual([{ ...EMPTY_TEXT, ...COMPANY, phone: '02-999-9999' }])
    expect((await snapshot())[COMPANIES]).toEqual(expect.arrayContaining(before[COMPANIES] as string[]))
  })

  it('AC-6501.5: 한도 그대로(업체 2,000 · 담당자 2,000 · 장비 1,000줄)는 넣을 수 있다', async () => {
    await seedCompany(A)
    await become(A)
    await importAs({
      companies: many(2000, (i) => ({ name: `가짜업체${i}`, category: 'other' })),
      people: many(2000, (i) => ({ company: '예시메디칼', name: `담당${i}` })),
      equipment: many(1000, (i) => ({ company: '예시메디칼', name: `장비${i}` })),
    })
    expect([await countOf(COMPANIES, A), await countOf(PEOPLE, A), await countOf(EQUIPMENT, A)]).toEqual([2001, 2000, 1000])
  }, 120_000)
})

describe('AC-6501.6 넣기 함수는 한 줄이라도 틀리면 아무것도 바꾸지 않는다', SLOW, () => {
  type Seeded = { mine: Book; second: Book; other: Book }
  const OK_COMPANY = { name: '새업체', category: 'other' }
  const OK_CHANGE = { name: '예시메디칼', phone: '02-111-1111', memo: '바뀐 메모' }

  it.each<[string, (s: Seeded) => unknown]>([
    ['p가 SQL null', () => undefined],
    ['p가 json null', () => null],
    ['p가 배열', () => [OK_COMPANY]],
    ['p가 글자', () => 'companies'],
    ['companies가 객체', () => ({ companies: { 0: OK_COMPANY } })],
    ['people이 글자', () => ({ companies: [OK_CHANGE], people: '김예시' })],
    ['equipment가 null', () => ({ companies: [OK_CHANGE], equipment: null })],
    ['업체 줄이 객체가 아님', () => ({ companies: [OK_CHANGE, '새업체'] })],
    ['업체 name 없음', () => ({ companies: [OK_CHANGE, { category: 'other' }] })],
    ['업체 name이 숫자', () => ({ companies: [OK_CHANGE, { name: 5, category: 'other' }] })],
    ['담당자 줄이 배열', () => ({ companies: [OK_CHANGE], people: [['예시메디칼', '이예시']] })],
    ['담당자 company 없음', () => ({ companies: [OK_CHANGE], people: [{ name: '이예시' }] })],
    ['담당자 name 없음', () => ({ companies: [OK_CHANGE], people: [{ company: '예시메디칼' }] })],
    ['장비 company 없음', () => ({ companies: [OK_CHANGE], equipment: [{ name: '온열기' }] })],
    ['장비 name이 숫자', () => ({ companies: [OK_CHANGE], equipment: [{ company: '예시메디칼', name: 1 }] })],
    ['장비 id가 uuid 아님', () => ({ companies: [OK_CHANGE], equipment: [{ id: 'abc', company: '예시메디칼', name: '충격파 기계' }] })],
    ['장비 id가 숫자', () => ({ companies: [OK_CHANGE], equipment: [{ id: 7, company: '예시메디칼', name: '충격파 기계' }] })],
    ['가운데 업체가 제약 위반(이름 41자)', () => ({ companies: [OK_COMPANY, { name: '가'.repeat(41), category: 'other' }, { name: '새업체2', category: 'other' }] })],
    ['새 업체에 분류 없음', () => ({ companies: [OK_COMPANY, { name: '예시상사', phone: '02-000-0000' }] })],
    ['분류 x', () => ({ companies: [OK_CHANGE, { name: '예시상사', category: 'x' }] })],
    ['있는 업체 칸 글자 수 넘침', () => ({ companies: [OK_COMPANY, { name: '예시메디칼', memo: '가'.repeat(1001) }] })],
    ['가운데 담당자 이름 21자', () => ({ companies: [OK_CHANGE], people: [{ company: '예시메디칼', name: '이예시' }, { company: '예시메디칼', name: '가'.repeat(21) }] })],
    ['없는 업체 이름(담당자)', () => ({ companies: [OK_CHANGE], people: [{ company: '없는상사', name: '이예시' }] })],
    ['남의 업체 이름(담당자)', () => ({ companies: [OK_CHANGE], people: [{ company: '남의업체', name: '이예시' }] })],
    ['없는 업체 이름(장비)', () => ({ companies: [OK_CHANGE], equipment: [{ company: '없는상사', name: '온열기' }] })],
    ['장비 일련번호 61자', () => ({ companies: [OK_CHANGE], equipment: [{ company: '예시메디칼', name: '온열기', serial: 'S'.repeat(61) }] })],
    ['장비 날짜 모양 틀림', () => ({ companies: [OK_CHANGE], equipment: [{ company: '예시메디칼', name: '온열기', bought_on: '2026-13-01' }] })],
    ['남의 장비 id', (s) => ({ companies: [OK_CHANGE], equipment: [{ id: s.other.equipment, company: '예시메디칼', name: '충격파 기계', serial: 'SN-9' }] })],
    ['없는 장비 id', () => ({ companies: [OK_CHANGE], equipment: [{ id: OTHER_ID, company: '예시메디칼', name: '충격파 기계', serial: 'SN-9' }] })],
    ['다른 내 업체의 장비 id', (s) => ({ companies: [OK_CHANGE], equipment: [{ id: s.second.equipment, company: '예시메디칼', name: '충격파 기계', serial: 'SN-9' }] })],
    ['업체 2,001줄', () => ({ companies: many(2001, (i) => ({ name: `가짜업체${i}`, category: 'other' })) })],
    ['담당자 2,001줄', () => ({ companies: [OK_CHANGE], people: many(2001, (i) => ({ company: '예시메디칼', name: `담당${i}` })) })],
    ['장비 1,001줄', () => ({ companies: [OK_CHANGE], equipment: many(1001, (i) => ({ company: '예시메디칼', name: `장비${i}` })) })],
  ])('AC-6501.6: %s → 오류이고 네 표 어디에도 달라진 줄이 없다', async (_name, make) => {
    const seeded: Seeded = { mine: await seedBook(A), second: await seedBook(A, '예시설비'), other: await seedBook(B, '남의업체') }
    const before = await snapshot()
    await become(A)
    await expect(importAs(make(seeded))).rejects.toThrow()
    expect(await snapshot()).toEqual(before)
  })

  it.each<[string, string]>([
    ['A의 데스크', K],
    ['승인 대기', C],
    ['거절', D],
    ['병원 줄 없음', E],
  ])('AC-6501.6: %s가 부르면 오류이고 아무것도 바뀌지 않는다(빈 몸통이어도)', async (_name, user) => {
    await seedBook(A)
    const before = await snapshot()
    for (const payload of [
      { companies: [{ name: '새업체', category: 'other' }] },
      { companies: [{ name: '예시메디칼', memo: '바꿈' }], people: [{ company: '예시메디칼', name: '이예시' }] },
      {},
    ]) {
      await become(user)
      await expect(importAs(payload), JSON.stringify(payload)).rejects.toThrow()
    }
    expect(await snapshot()).toEqual(before)
  })
})

describe('REQ-6501 TASK-1 문서', () => {
  const readRepo = (rel: string) => read(`../${rel}`)

  it('REQ-6501 TASK-1: docs/ADR.md에 ADR-034 주소록 글이 한 번 있고 맥락·결정·이유·대안·트레이드오프·바꾸는 것이 있다', () => {
    const doc = readRepo('docs/ADR.md')
    const heads = [...doc.matchAll(/^### ADR-034: (.+)$/gm)]
    expect(heads.map((m) => m[1])).toEqual(['주소록 — 사이트 비밀번호·계좌를 잠그지 않고 다른 칸처럼 서버에 둔다'])
    const rest = doc.slice((heads[0]?.index ?? 0) + 1)
    const next = rest.search(/^### ADR-/m)
    const section = next === -1 ? rest : rest.slice(0, next)
    for (const part of ['**맥락**', '**결정**', '**이유**', '**대안**', '**트레이드오프**', '**바꾸는 것**']) expect(section, part).toContain(part)
    expect(section).toContain('my_hospital_id()')
    expect(section).toContain('`site_pw`')
  })

  it('REQ-6501 TASK-1: plan.md §4 서버로 가는 것에 주소록(ADR-034)이 있고, §5 DB 표 clinic_profiles 줄 바로 다음이 contacts_* 줄이다', () => {
    const lines = readRepo('plan.md').split('\n')
    const server = lines.filter((line) => line.startsWith('- 서버(Supabase, 서울)로 가는 것:'))
    expect(server).toHaveLength(1)
    expect(server[0]).toContain('주소록(업체 연락처·담당자·장비·수리 기록, 사이트 비밀번호·계좌 포함 — ADR-034)')
    const clinic = lines.findIndex((line) => line.startsWith('| `clinic_profiles` |'))
    expect(clinic).toBeGreaterThan(0)
    expect(lines[clinic + 1]).toMatch(/^\| `contacts_\*` \| .*ADR-034.* \|$/)
    expect(lines[clinic + 2]).toMatch(/^\| `inventory_items` · `inventory_moves` \|/)
    expect(lines.filter((line) => line.startsWith('| `contacts_'))).toHaveLength(1)
  })

  it('REQ-6501 TASK-1: docs/ARCHITECTURE.md DB 표에 주소록 네 표 줄이 하나 있다', () => {
    const lines = readRepo('docs/ARCHITECTURE.md').split('\n')
    const found = lines.filter((line) => line.startsWith('| `contacts_'))
    expect(found).toHaveLength(1)
    for (const table of TABLES) expect(found[0]).toContain(`\`${nameOf(table)}\``)
    expect(found[0]).toContain('contacts_import')
    expect(found[0]).toContain('ADR-034')
  })
})

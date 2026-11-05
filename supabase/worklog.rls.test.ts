import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { WORKLOG_COLUMNS } from '@/types/worklog'

// 진짜 Postgres(PGlite, WASM)에서 운영자가 SQL 편집기에 붙일 migration 파일을 그대로 실행하고 RLS를 확인한다.
// Supabase 흉내와 사용자 바꾸기는 rls.test.ts와 같다. 실제 Supabase에는 붙지 않는다
const AUTH_MIGRATION = readFileSync(
  fileURLToPath(new URL('./migrations/20261028000000_auth.sql', import.meta.url)),
  'utf-8',
)
const WORKLOG_MIGRATION = readFileSync(
  fileURLToPath(new URL('./migrations/20261101000100_worklog.sql', import.meta.url)),
  'utf-8',
)

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

// cross-branch C1: 통계·환자·매출·사전점검 갈래와 글자까지 같아야 어느 순서로 붙여 넣어도 된다
const C1_SHARED_FUNCTION = `create or replace function public.my_hospital_id() returns uuid language sql stable security definer set search_path = ''
  as $$ select h.id from public.hospitals h where h.owner_id = (select auth.uid()) and h.status = 'approved' $$;
revoke execute on function public.my_hospital_id() from public, anon;
grant execute on function public.my_hospital_id() to authenticated;
`

const COUNT_COLUMNS = ['new_patients', 'return_patients']
const WON_COLUMNS = [
  'total_fee',
  'claim_amount',
  'cash_in',
  'card_in',
  'transfer_in',
  'local_currency_in',
  'unpaid_new',
  'unpaid_paid',
  'spend_cash',
  'spend_card',
  'spend_refund',
  'spend_free',
]
const NUMBER_COLUMNS = [...COUNT_COLUMNS, ...WON_COLUMNS]
const NOTE_COLUMNS = ['note_cash', 'note_card', 'note_refund', 'note_free', 'note_total']
const NAME_COLUMNS = [
  'name_total_fee',
  'name_claim_amount',
  'name_cash_in',
  'name_card_in',
  'name_transfer_in',
  'name_local_currency_in',
  'name_unpaid_new',
  'name_unpaid_paid',
  'name_spend_cash',
  'name_spend_card',
  'name_spend_refund',
  'name_spend_free',
]
const VALUE_COLUMNS = [...NUMBER_COLUMNS, ...NOTE_COLUMNS, 'memo', ...NAME_COLUMNS]
// 앱이 upsert로 보낼 수 있는 칸 전부(AC-005.2). hospital_id는 없다
const SENT_COLUMNS = ['work_date', ...VALUE_COLUMNS]

const A = '00000000-0000-4000-8000-00000000000a'
const B = '00000000-0000-4000-8000-00000000000b'
const C = '00000000-0000-4000-8000-00000000000c'
const D = '00000000-0000-4000-8000-00000000000d'
const USERS: { id: string; email: string; status: string }[] = [
  { id: A, email: 'a@fake.test', status: 'approved' },
  { id: B, email: 'b@fake.test', status: 'approved' },
  { id: C, email: 'c@fake.test', status: 'pending' },
  { id: D, email: 'd@fake.test', status: 'rejected' },
]

const DAY = '2020-01-02'
const NO_PERMISSION = { code: '42501' }
const CHECK_FAILED = { code: '23514' }

const TABLE = 'public.worklog_days'
const INSERT_SOME = `insert into ${TABLE} (work_date, total_fee, note_cash) values ($1, $2, $3)`
// PostgREST upsert와 같은 모양: 보낸 칸만 SET에 쓴다. hospital_id는 SET에 없다
const UPSERT_SOME = `${INSERT_SOME}
  on conflict (hospital_id, work_date) do update set total_fee = excluded.total_fee, note_cash = excluded.note_cash`
const UPSERT_ALL = `insert into ${TABLE} (${SENT_COLUMNS.join(', ')})
  values (${SENT_COLUMNS.map((_, i) => `$${i + 1}`).join(', ')})
  on conflict (hospital_id, work_date) do update set ${SENT_COLUMNS.map((c) => `${c} = excluded.${c}`).join(', ')}`

// 보낸 칸만 SET에 쓰는 upsert. PostgREST처럼 work_date는 늘 보내므로 SET에 있고, hospital_id는 없다
function upsertOf(columns: string[]) {
  const sent = ['work_date', ...columns]
  return `insert into ${TABLE} (${sent.join(', ')}) values (${sent.map((_, i) => `$${i + 1}`).join(', ')})
    on conflict (hospital_id, work_date) do update set ${sent.map((c) => `${c} = excluded.${c}`).join(', ')}`
}

// 칸 하나만 보낸 upsert
function upsertOne(column: string) {
  return upsertOf([column])
}

function sentValues(date: string, number: string, text: string) {
  return [
    date,
    ...NUMBER_COLUMNS.map(() => number),
    ...NOTE_COLUMNS.map(() => text),
    text,
    ...NAME_COLUMNS.map(() => text),
  ]
}

// 보낸 칸 밖의 값 칸이 모두 null인지(보내지 않은 칸을 건드리지 않았는지) 본다
function expectOnlyFilled(row: Record<string, unknown>, filled: Record<string, unknown>) {
  const blanks = Object.fromEntries(VALUE_COLUMNS.filter((c) => !(c in filled)).map((c) => [c, null]))
  expect(row).toMatchObject({ ...blanks, ...filled })
}

// PGlite 첫 실행(WASM 불러오기)이 느린 PC·CI에서도 흔들리지 않게
const SLOW = { timeout: 30_000 }
let db: PGlite
// 사용자 id → 그 사용자의 병원 id
const hospital: Record<string, string> = {}

async function operator() {
  await db.exec('reset role; reset request.jwt.claims')
}

async function become(user: string) {
  const email = USERS.find((u) => u.id === user)?.email
  await operator()
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: user, email })])
  await db.exec('set role authenticated')
}

async function becomeAnon() {
  await operator()
  await db.exec('set role anon')
}

async function rows(sql: string, params: unknown[] = []) {
  return (await db.query<Record<string, unknown>>(sql, params)).rows
}

// 시험마다 빈 표에서 시작한다. A·B는 승인, C는 대기, D는 거절
async function seedUsers() {
  await operator()
  await db.exec('truncate auth.users cascade')
  for (const user of USERS) {
    await db.query('insert into auth.users (id, email) values ($1, $2)', [user.id, user.email])
    const [row] = await rows(
      `insert into public.hospitals (owner_id, name, applicant_name, email, status)
       values ($1, '가상병원', '가상 신청자', $2, $3) returning id`,
      [user.id, user.email, user.status],
    )
    hospital[user.id] = row.id as string
  }
}

// 운영자가 그 병원 줄을 넣어 둔다(RLS를 건너뛴다)
async function addDay(user: string, date = DAY) {
  await operator()
  await db.query(
    `insert into ${TABLE} (hospital_id, work_date, total_fee, note_cash)
     values ($1, $2, '100000', '가상 비고')`,
    [hospital[user], date],
  )
}

// 운영자 눈으로 본 그 병원 줄 전부
async function daysOf(user: string) {
  await operator()
  return rows(
    `select work_date::text as work_date, total_fee, note_cash, new_patients
     from ${TABLE} where hospital_id = $1 order by work_date`,
    [hospital[user]],
  )
}

const UNTOUCHED = { work_date: DAY, total_fee: '100000', note_cash: '가상 비고', new_patients: null }

describe('AC-004.1 칸 목록이 앱의 WORKLOG_COLUMNS와 같다', () => {
  it('값 칸은 32개이고 이름·순서가 WORKLOG_COLUMNS 그대로다', () => {
    expect(VALUE_COLUMNS).toHaveLength(32)
    expect(Object.values(WORKLOG_COLUMNS)).toEqual(VALUE_COLUMNS)
  })
})

describe('AC-004.8 공용 함수 글자가 다른 갈래와 같다', () => {
  it('공용 함수 줄이 cross-branch C1과 글자까지 같고 맨 앞에 있다', () => {
    const sql = WORKLOG_MIGRATION.replace(/^(--.*\n|\s*\n)+/, '')
    expect(sql.slice(0, C1_SHARED_FUNCTION.length)).toBe(C1_SHARED_FUNCTION)
  })
})

// AC-004.8: 공용 함수가 이미 있어도 "위 시험이 그대로 통과"해야 하니, 같은 시험을 두 DB에서 돈다
describe.each([
  { name: '공용 함수가 없던 DB', sharedFirst: false },
  { name: 'AC-004.8 공용 함수가 이미 있는 DB(다른 갈래가 먼저 들어감)', sharedFirst: true },
])('$name', SLOW, ({ sharedFirst }) => {
  beforeAll(async () => {
    db = await PGlite.create()
    await db.exec(SUPABASE_MOCK)
    await db.exec(AUTH_MIGRATION)
    if (sharedFirst) await db.exec(C1_SHARED_FUNCTION)
    await db.exec(WORKLOG_MIGRATION)
  }, 30_000)

  afterAll(async () => {
    await db.close()
  })

  beforeEach(seedUsers)

  describe('AC-004.1 표 칸이 정해 둔 목록과 정확히 같다', () => {
    it('칸 이름·종류·순서·빈 칸 허용이 목록과 같다', async () => {
      const columns = await rows(
        `select column_name, data_type, is_nullable from information_schema.columns
         where table_schema = 'public' and table_name = 'worklog_days' order by ordinal_position`,
      )
      expect(columns).toEqual([
        { column_name: 'hospital_id', data_type: 'uuid', is_nullable: 'NO' },
        { column_name: 'work_date', data_type: 'date', is_nullable: 'NO' },
        ...VALUE_COLUMNS.map((column_name) => ({ column_name, data_type: 'text', is_nullable: 'YES' })),
      ])
    })

    it('합계 칸과 저장 시각 칸이 없다', async () => {
      const extra = await rows(
        `select column_name from information_schema.columns
         where table_name = 'worklog_days' and column_name ~* '(visits|received|spent|^net|sum|합계|updated|created|_at$)'`,
      )
      expect(extra).toEqual([])
    })

    it('hospital_id 기본값은 my_hospital_id()다', async () => {
      const [row] = await rows(
        `select column_default from information_schema.columns
         where table_name = 'worklog_days' and column_name = 'hospital_id'`,
      )
      expect(row.column_default).toContain('my_hospital_id()')
    })

    it('기본 열쇠는 hospital_id·work_date다', async () => {
      const key = await rows(
        `select a.attname from pg_index i
         join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
         where i.indrelid = $1::regclass and i.indisprimary order by a.attnum`,
        [TABLE],
      )
      expect(key).toEqual([{ attname: 'hospital_id' }, { attname: 'work_date' }])
    })

    it('병원 줄이 지워지면 그 병원 하루 줄도 같이 지워진다', async () => {
      await addDay(A)
      await db.query('delete from public.hospitals where id = $1', [hospital[A]])
      expect(await rows(`select 1 from ${TABLE}`)).toEqual([])
    })
  })

  describe('AC-004.2 로그인 안 한 사용자(anon)는 읽지도 쓰지도 못한다', () => {
    it('RLS가 켜져 있고 anon에게 준 표·칸 권한이 하나도 없다', async () => {
      const [table] = await rows('select relrowsecurity from pg_class where oid = $1::regclass', [TABLE])
      expect(table.relrowsecurity).toBe(true)
      expect(
        await rows(
          `select privilege_type from information_schema.role_table_grants
           where grantee = 'anon' and table_name = 'worklog_days'`,
        ),
      ).toEqual([])
      expect(
        await rows(
          `select column_name from information_schema.column_privileges
           where grantee = 'anon' and table_name = 'worklog_days'`,
        ),
      ).toEqual([])
    })

    it('읽기·넣기·고치기·지우기·upsert가 모두 42501로 거부되고 줄은 그대로다', async () => {
      await addDay(A)
      await becomeAnon()
      await expect(db.query(`select * from ${TABLE}`)).rejects.toMatchObject(NO_PERMISSION)
      await expect(db.query(INSERT_SOME, ['2020-01-03', '200000', '가상'])).rejects.toMatchObject(NO_PERMISSION)
      await expect(db.query(UPSERT_SOME, [DAY, '200000', '가상'])).rejects.toMatchObject(NO_PERMISSION)
      await expect(db.query(`update ${TABLE} set total_fee = '1'`)).rejects.toMatchObject(NO_PERMISSION)
      await expect(db.query(`delete from ${TABLE}`)).rejects.toMatchObject(NO_PERMISSION)
      expect(await daysOf(A)).toMatchObject([UNTOUCHED])
    })

    it('my_hospital_id()를 직접 부를 수 없다', async () => {
      await becomeAnon()
      await expect(db.query('select public.my_hospital_id()')).rejects.toMatchObject(NO_PERMISSION)
    })
  })

  describe('AC-004.3 승인된 병원 사용자는 hospital_id 없이 넣고·읽고·upsert로 고친다', () => {
    it('hospital_id 없이 넣으면 내 병원 id로 채워지고 읽힌다', async () => {
      await become(A)
      await db.query(INSERT_SOME, [DAY, '100000', '가상 비고'])
      const found = await rows(`select hospital_id, work_date::text as work_date, total_fee, note_cash from ${TABLE}`)
      expect(found).toEqual([{ hospital_id: hospital[A], work_date: DAY, total_fee: '100000', note_cash: '가상 비고' }])
    })

    it('같은 날 upsert는 보낸 칸만 고치고, 보내지 않은 칸은 그대로다', async () => {
      await become(A)
      await db.query(`insert into ${TABLE} (work_date, new_patients, total_fee) values ($1, '10', '100000')`, [DAY])
      await db.query(UPSERT_SOME, [DAY, '200000', '가상 비고'])
      const found = await rows(`select hospital_id, new_patients, total_fee, note_cash from ${TABLE}`)
      expect(found).toEqual([
        { hospital_id: hospital[A], new_patients: '10', total_fee: '200000', note_cash: '가상 비고' },
      ])
    })

    it('work_date + 값 32칸을 다 보낸 upsert가 넣기와 고치기 모두 된다', async () => {
      await become(A)
      await db.query(UPSERT_ALL, sentValues(DAY, '100000', '가상 글자'))
      await db.query(UPSERT_ALL, sentValues(DAY, '200000', '가상 다른 글자'))
      const found = await rows(`select * from ${TABLE}`)
      expect(found).toHaveLength(1)
      expect(found[0]).toMatchObject({
        hospital_id: hospital[A],
        new_patients: '200000',
        return_patients: '200000',
        total_fee: '200000',
        spend_free: '200000',
        note_cash: '가상 다른 글자',
        note_total: '가상 다른 글자',
        memo: '가상 다른 글자',
        name_total_fee: '가상 다른 글자',
        name_spend_free: '가상 다른 글자',
      })
    })

    it('날짜가 다르면 줄이 따로 생긴다', async () => {
      await become(A)
      await db.query(UPSERT_SOME, ['2020-01-02', '100000', '가상'])
      await db.query(UPSERT_SOME, ['2020-01-03', '200000', '가상'])
      expect(await daysOf(A)).toMatchObject([
        { work_date: '2020-01-02', total_fee: '100000' },
        { work_date: '2020-01-03', total_fee: '200000' },
      ])
    })

    it.each(['INSERT', 'UPDATE'])('%s 칸 권한은 work_date와 WORKLOG_COLUMNS 32칸과 정확히 같다', async (privilege) => {
      await operator()
      const allowed = await rows(
        `select column_name from information_schema.column_privileges
         where grantee = 'authenticated' and table_name = 'worklog_days' and privilege_type = $1`,
        [privilege],
      )
      const expected = ['work_date', ...Object.values(WORKLOG_COLUMNS)].sort()
      expect(allowed.map((r) => r.column_name).sort()).toEqual(expected)
      expect(expected).not.toContain('hospital_id')
    })

    it.each(VALUE_COLUMNS)('%s 칸만 보낸 upsert가 줄을 만들고 고친다', async (column) => {
      await become(A)
      await db.query(upsertOne(column), [DAY, '가상 1'])
      await db.query(upsertOne(column), [DAY, '가상 2'])
      const found = await rows(`select * from ${TABLE}`)
      expect(found).toHaveLength(1)
      expectOnlyFilled(found[0], { hospital_id: hospital[A], [column]: '가상 2' })
    })
  })

  describe('AC-004.4 다른 병원 줄은 안 보이고 안 바뀌며 hospital_id는 직접 못 건드린다', () => {
    it('다른 병원 줄은 읽어도 0줄이다', async () => {
      await addDay(B)
      await become(A)
      expect(await rows(`select * from ${TABLE}`)).toEqual([])
      expect(await rows(`select * from ${TABLE} where hospital_id = $1`, [hospital[B]])).toEqual([])
    })

    it('다른 병원 줄을 고쳐도 0줄이 바뀌고 그대로다', async () => {
      await addDay(B)
      await become(A)
      const changed = await db.query(`update ${TABLE} set total_fee = '1' where hospital_id = $1`, [hospital[B]])
      expect(changed.affectedRows).toBe(0)
      expect(await daysOf(B)).toMatchObject([UNTOUCHED])
    })

    it('같은 날 upsert는 내 줄만 만들고 다른 병원 줄은 그대로다', async () => {
      await addDay(B)
      await become(A)
      await db.query(UPSERT_SOME, [DAY, '200000', '가상'])
      expect(await daysOf(A)).toMatchObject([{ work_date: DAY, total_fee: '200000' }])
      expect(await daysOf(B)).toMatchObject([UNTOUCHED])
    })

    it('hospital_id를 직접 넣으면 남의 병원이든 내 병원이든 42501이다', async () => {
      await become(A)
      for (const target of [hospital[B], hospital[A]]) {
        await expect(
          db.query(`insert into ${TABLE} (hospital_id, work_date) values ($1, $2)`, [target, DAY]),
        ).rejects.toMatchObject(NO_PERMISSION)
      }
      expect(await daysOf(A)).toEqual([])
      expect(await daysOf(B)).toEqual([])
    })

    it('내 줄의 hospital_id를 바꾸면 42501이다', async () => {
      await addDay(A)
      await become(A)
      await expect(db.query(`update ${TABLE} set hospital_id = $1`, [hospital[B]])).rejects.toMatchObject(NO_PERMISSION)
      expect(await daysOf(A)).toMatchObject([UNTOUCHED])
      expect(await daysOf(B)).toEqual([])
    })

    it('정책은 읽기·넣기·고치기 셋이고 모두 my_hospital_id()로 거른다', async () => {
      const policies = await rows(
        `select cmd, qual, with_check from pg_policies where tablename = 'worklog_days' order by cmd`,
      )
      expect(policies.map((p) => p.cmd)).toEqual(['INSERT', 'SELECT', 'UPDATE'])
      const [insert, select, update] = policies
      expect(insert.with_check).toContain('my_hospital_id()')
      expect(select.qual).toContain('my_hospital_id()')
      expect(update.qual).toContain('my_hospital_id()')
      expect(update.with_check).toContain('my_hospital_id()')
    })
  })

  describe.each([
    { label: '승인 대기', user: C },
    { label: '거절', user: D },
  ])('AC-004.5 $label 병원 사용자는 아무 줄도 못 보고 못 쓴다', ({ user }) => {
    it('my_hospital_id()가 null이다', async () => {
      await become(user)
      expect(await rows('select public.my_hospital_id() as id')).toEqual([{ id: null }])
    })

    it('자기 병원 줄이 있어도 읽으면 0줄, 고쳐도 0줄이 바뀐다', async () => {
      await addDay(user)
      await addDay(A)
      await become(user)
      expect(await rows(`select * from ${TABLE}`)).toEqual([])
      const changed = await db.query(`update ${TABLE} set total_fee = '1'`)
      expect(changed.affectedRows).toBe(0)
      expect(await daysOf(user)).toMatchObject([UNTOUCHED])
      expect(await daysOf(A)).toMatchObject([UNTOUCHED])
    })

    it('넣기와 upsert는 42501로 거부된다', async () => {
      await become(user)
      await expect(db.query(INSERT_SOME, [DAY, '100000', '가상'])).rejects.toMatchObject(NO_PERMISSION)
      await expect(db.query(UPSERT_SOME, [DAY, '100000', '가상'])).rejects.toMatchObject(NO_PERMISSION)
      await expect(db.query(UPSERT_ALL, sentValues(DAY, '100000', '가상'))).rejects.toMatchObject(NO_PERMISSION)
      await expect(db.query(upsertOne('memo'), [DAY, '가상'])).rejects.toMatchObject(NO_PERMISSION)
      expect(await daysOf(user)).toEqual([])
    })
  })

  describe('AC-004.6 값 제약', () => {
    type Case = [column: string, label: string, value: string | null]
    const cases = (columns: string[], values: [string, string | null][]) =>
      columns.flatMap((column) => values.map(([label, value]): Case => [column, label, value]))

    const LIMITS: [columns: string[], max: number][] = [
      [NUMBER_COLUMNS, 50],
      [NOTE_COLUMNS, 100],
      [['memo'], 2000],
      [NAME_COLUMNS, 20],
    ]
    const REJECTED = LIMITS.flatMap(([columns, max]) =>
      cases(columns, [
        ['빈 글자', ''],
        [`${max + 1}자`, '가'.repeat(max + 1)],
      ]),
    )
    const ACCEPTED = [
      ...LIMITS.flatMap(([columns, max]) =>
        cases(columns, [
          ['한 글자', '가'],
          [`${max}자`, '가'.repeat(max)],
          ['null', null],
        ]),
      ),
      // 숫자 칸은 글자 칸이다. DB는 길이만 본다(사용자 결정 2)
      ...cases(NUMBER_COLUMNS, [
        ['12,000 별도', '12,000 별도'],
        ['-5,000', '-5,000'],
      ]),
    ]

    it.each(REJECTED)('%s에 %s를 넣으면 23514로 거부된다', async (column, _label, value) => {
      await become(A)
      await expect(
        db.query(`insert into ${TABLE} (work_date, ${column}) values ($1, $2)`, [DAY, value]),
      ).rejects.toMatchObject(CHECK_FAILED)
      expect(await daysOf(A)).toEqual([])
    })

    it.each(ACCEPTED)('%s에 %s는 된다', async (column, _label, value) => {
      await become(A)
      const [row] = await rows(`insert into ${TABLE} (work_date, ${column}) values ($1, $2) returning ${column}`, [
        DAY,
        value,
      ])
      expect(row[column]).toBe(value)
    })

    it('고칠 때도 같은 제약이 걸린다', async () => {
      await addDay(A)
      await become(A)
      const tooLong = (max: number) => '가'.repeat(max + 1)
      for (const [column, value] of [
        ['total_fee', ''],
        ['total_fee', tooLong(50)],
        ['note_cash', ''],
        ['note_cash', tooLong(100)],
        ['memo', ''],
        ['memo', tooLong(2000)],
        ['name_total_fee', ''],
        ['name_total_fee', tooLong(20)],
      ]) {
        await expect(db.query(`update ${TABLE} set ${column} = $1`, [value])).rejects.toMatchObject(CHECK_FAILED)
      }
      expect(await daysOf(A)).toMatchObject([UNTOUCHED])
    })
  })

  describe('AC-004.7 지우기 거부, 저장 시각 칸·방아쇠 없음', () => {
    it('authenticated의 표 권한은 읽기뿐이고 지우기 권한은 없다', async () => {
      const table = await rows(
        `select privilege_type from information_schema.role_table_grants
         where grantee = 'authenticated' and table_name = 'worklog_days'`,
      )
      expect(table).toEqual([{ privilege_type: 'SELECT' }])
    })

    it('내 줄을 지우면 42501이고 줄은 그대로다', async () => {
      await addDay(A)
      await become(A)
      await expect(db.query(`delete from ${TABLE}`)).rejects.toMatchObject(NO_PERMISSION)
      expect(await daysOf(A)).toMatchObject([UNTOUCHED])
    })

    it('표에 방아쇠가 없고 touch_updated_at()을 만들지 않으며 파일에 updated_at 글자도 없다', async () => {
      const triggers = await rows(
        `select tgname from pg_trigger where tgrelid = $1::regclass and not tgisinternal`,
        [TABLE],
      )
      expect(triggers).toEqual([])
      expect(await rows(`select proname from pg_proc where proname = 'touch_updated_at'`)).toEqual([])
      expect(WORKLOG_MIGRATION).not.toContain('updated_at')
    })

    it('공용 함수 실행 권한: my_hospital_id는 authenticated만 있다', async () => {
      const grantees = await rows(
        `select coalesce(nullif(a.grantee, 0)::regrole::text, 'PUBLIC') as grantee
         from pg_proc p, aclexplode(p.proacl) a
         where p.oid = 'public.my_hospital_id()'::regprocedure and a.grantee <> p.proowner and a.privilege_type = 'EXECUTE'`,
      )
      expect(grantees).toEqual([{ grantee: 'authenticated' }])
    })

    it('security definer 함수는 auth의 승인 함수와 my_hospital_id뿐이다', async () => {
      const definers = await rows(
        `select proname from pg_proc
         where pronamespace = 'public'::regnamespace and prosecdef order by proname`,
      )
      expect(definers).toEqual([{ proname: 'my_hospital_id' }, { proname: 'set_hospital_status' }])
    })
  })

  describe('AC-004.9 칸 하나만 보낸 upsert는 다른 칸을 남긴다', () => {
    it('다른 칸으로 두 번 보내면 두 칸 다 남고 보내지 않은 칸은 그대로다', async () => {
      await become(A)
      await db.query(upsertOne('cash_in'), [DAY, '100000'])
      await db.query(upsertOne('card_in'), [DAY, '200000'])
      const found = await rows(`select * from ${TABLE}`)
      expect(found).toHaveLength(1)
      expect(found[0].memo).toBeNull()
      expectOnlyFilled(found[0], { cash_in: '100000', card_in: '200000' })
    })

    it('같은 칸을 두 번 보내면 나중 값이 남는다', async () => {
      await become(A)
      await db.query(upsertOne('cash_in'), [DAY, '100000'])
      await db.query(upsertOne('cash_in'), [DAY, '200000'])
      const found = await rows(`select * from ${TABLE}`)
      expect(found).toHaveLength(1)
      expectOnlyFilled(found[0], { cash_in: '200000' })
    })

    it('줄이 없는 날에 칸 하나만 보내도 줄이 만들어진다', async () => {
      await become(A)
      await db.query(upsertOne('cash_in'), [DAY, '100000'])
      const found = await rows(`select hospital_id, work_date::text as work_date, cash_in, card_in from ${TABLE}`)
      expect(found).toEqual([{ hospital_id: hospital[A], work_date: DAY, cash_in: '100000', card_in: null }])
    })

    it('업무사항 memo와 항목 이름도 칸 하나만 보내면 있던 칸을 남긴다', async () => {
      await become(A)
      await db.query(upsertOne('cash_in'), [DAY, '100000'])
      await db.query(upsertOne('memo'), [DAY, '가상 업무사항'])
      await db.query(upsertOne('name_cash_in'), [DAY, '가상 항목'])
      await db.query(upsertOne('name_card_in'), [DAY, '가상 다른 항목'])
      const found = await rows(`select * from ${TABLE}`)
      expect(found).toHaveLength(1)
      expectOnlyFilled(found[0], {
        cash_in: '100000',
        memo: '가상 업무사항',
        name_cash_in: '가상 항목',
        name_card_in: '가상 다른 항목',
      })
    })

    it('칸을 null로 보내면 그 칸만 비워지고 다른 칸은 남는다', async () => {
      await become(A)
      await db.query(upsertOne('cash_in'), [DAY, '100000'])
      await db.query(upsertOne('card_in'), [DAY, '200000'])
      await db.query(upsertOne('cash_in'), [DAY, null])
      const [row] = await rows(`select * from ${TABLE}`)
      expectOnlyFilled(row, { card_in: '200000' })
    })
  })
})

// ── Phase 4: 비트 칸 표시(bit_fields, REQ-015, design.md 20-4절) ──
// 운영자가 auth → 업무일지(TASK-4) → 0110 차례로 붙여 넣은 DB. 위 시험은 TASK-4 파일만 넣은 DB 그대로 둔다(이미 붙여 넣었을 수 있다)
const BIT_MIGRATION_URL = new URL('./migrations/20261101000110_worklog_bit_fields.sql', import.meta.url)

// 비트가 채울 수 있는 DB 칸 열 개(design.md 20-2절). 미수발생·지역화폐는 아직 안 채우지만 나중 계약을 위해 받는다
const BIT_FIELDS = [
  'new_patients',
  'return_patients',
  'total_fee',
  'claim_amount',
  'cash_in',
  'card_in',
  'transfer_in',
  'local_currency_in',
  'unpaid_new',
  'unpaid_paid',
]
// 지출·비고·업무사항·항목 이름 칸은 손으로만 적는다. 앱 열쇠 이름(cashIn)·빈 이름·다른 칸 이름도 받지 않는다
const NOT_BIT_NAMES = [
  ...VALUE_COLUMNS.filter((c) => !BIT_FIELDS.includes(c)),
  'work_date',
  'hospital_id',
  'cashIn',
  '',
]

// 0110이 바꾸면 안 되는 것 전부: RLS·정책·함수(공용 함수 포함)·bit_fields 밖 칸·제약·방아쇠·표 권한·칸 권한
async function schemaSnapshot() {
  await operator()
  return {
    rls: await rows('select relrowsecurity, relforcerowsecurity from pg_class where oid = $1::regclass', [TABLE]),
    policies: await rows(
      `select policyname, cmd, roles::text as roles, qual, with_check from pg_policies
       where tablename = 'worklog_days' order by policyname`,
    ),
    functions: await rows(
      `select p.oid::regprocedure::text as name, pg_get_functiondef(p.oid) as body, p.proacl::text as acl
       from pg_proc p where p.pronamespace = 'public'::regnamespace order by 1`,
    ),
    columns: await rows(
      `select column_name, data_type, is_nullable, column_default from information_schema.columns
       where table_schema = 'public' and table_name = 'worklog_days' and column_name <> 'bit_fields'
       order by ordinal_position`,
    ),
    constraints: await rows(
      `select conname, pg_get_constraintdef(oid) as def from pg_constraint
       where conrelid = $1::regclass and pg_get_constraintdef(oid) not like '%bit_fields%' order by conname`,
      [TABLE],
    ),
    triggers: await rows('select tgname from pg_trigger where tgrelid = $1::regclass', [TABLE]),
    tableGrants: await rows(
      `select grantee, privilege_type from information_schema.role_table_grants
       where table_name = 'worklog_days' order by 1, 2`,
    ),
    columnGrants: await rows(
      `select grantee, privilege_type, column_name from information_schema.column_privileges
       where table_name = 'worklog_days' and column_name <> 'bit_fields' order by 1, 2, 3`,
    ),
  }
}

// 운영자 눈으로 본 그 병원 줄의 비트 칸과 값 몇 칸
async function bitsOf(user: string) {
  await operator()
  return rows(
    `select work_date::text as work_date, bit_fields, total_fee, cash_in, memo
     from ${TABLE} where hospital_id = $1 order by work_date`,
    [hospital[user]],
  )
}

describe('REQ-015 비트 칸 표시 migration(0110)을 업무일지 표 위에 붙여 넣은 DB', SLOW, () => {
  let bitMigration = ''
  let before: Awaited<ReturnType<typeof schemaSnapshot>>
  let after: Awaited<ReturnType<typeof schemaSnapshot>>
  // 0110 전에 있던 줄이 0110 뒤에 어떻게 보이는지
  let existing: Record<string, unknown>[] = []

  beforeAll(async () => {
    db = await PGlite.create()
    await db.exec(SUPABASE_MOCK)
    await db.exec(AUTH_MIGRATION)
    await db.exec(WORKLOG_MIGRATION)
    await seedUsers()
    await addDay(A)
    before = await schemaSnapshot()
    bitMigration = readFileSync(fileURLToPath(BIT_MIGRATION_URL), 'utf-8')
    await operator()
    await db.exec(bitMigration)
    after = await schemaSnapshot()
    existing = await bitsOf(A)
  }, 30_000)

  afterAll(async () => {
    await db.close()
  })

  beforeEach(seedUsers)

  describe('AC-015.1 bit_fields 칸이 더해진다', () => {
    it('AC-015.1: bit_fields text[] not null default {}가 맨 끝에 하나 더해지고 다른 칸은 그대로다', async () => {
      const columns = await rows(
        `select column_name, data_type, udt_name, is_nullable, column_default from information_schema.columns
         where table_schema = 'public' and table_name = 'worklog_days' order by ordinal_position`,
      )
      expect(columns.map((c) => c.column_name)).toEqual(['hospital_id', 'work_date', ...VALUE_COLUMNS, 'bit_fields'])
      expect(columns.at(-1)).toEqual({
        column_name: 'bit_fields',
        data_type: 'ARRAY',
        udt_name: '_text',
        is_nullable: 'NO',
        column_default: "'{}'::text[]",
      })
    })

    it('AC-015.1: RLS·정책·공용 함수·다른 칸·제약·방아쇠·표 권한·다른 칸 권한이 붙여 넣기 전과 같다', () => {
      expect(after).toEqual(before)
      expect(after.policies).toHaveLength(3)
      expect(after.functions.map((f) => f.name)).toContain('my_hospital_id()')
    })

    it('AC-015.1: 파일은 함수·정책을 만들거나 고치거나 지우지 않는다', () => {
      expect(bitMigration).toContain('alter table public.worklog_days add column')
      expect(bitMigration).not.toMatch(/create\s+(or\s+replace\s+)?function/i)
      expect(bitMigration).not.toMatch(/(create|alter|drop)\s+policy/i)
      expect(bitMigration).not.toMatch(/\b(drop|revoke|truncate|delete)\b/i)
    })

    it('AC-015.1: 붙여 넣기 전에 있던 줄은 빈 목록이 되고 값은 그대로다', () => {
      expect(existing).toEqual([{ work_date: DAY, bit_fields: [], total_fee: '100000', cash_in: null, memo: null }])
    })

    it('AC-015.1: 두 번 붙여 넣어도 오류 없이 그대로다', async () => {
      await db.exec(bitMigration)
      expect(await schemaSnapshot()).toEqual(after)
      // check 제약(contype 'c')만 센다. PG18은 not null도 pg_constraint에 따로 적는다
      const checks = await rows(
        `select conname from pg_constraint
         where conrelid = $1::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%bit_fields%'`,
        [TABLE],
      )
      expect(checks).toEqual([{ conname: 'worklog_days_bit_fields_check' }])
    })

    it('AC-015.1: bit_fields 없이 넣은 줄은 빈 목록이다', async () => {
      await become(A)
      const [row] = await rows(`insert into ${TABLE} (work_date, cash_in) values ($1, '100000') returning bit_fields`, [
        DAY,
      ])
      expect(row.bit_fields).toEqual([])
    })

    it.each(BIT_FIELDS)('AC-015.1: 채울 수 있는 칸 이름 %s 하나만 담은 목록은 된다', async (name) => {
      await become(A)
      const [row] = await rows(`insert into ${TABLE} (work_date, bit_fields) values ($1, $2) returning bit_fields`, [
        DAY,
        [name],
      ])
      expect(row.bit_fields).toEqual([name])
    })

    it('AC-015.1: 열 칸을 모두 담은 목록과 빈 목록은 된다', async () => {
      await become(A)
      for (const [date, list] of [
        ['2020-01-02', BIT_FIELDS],
        ['2020-01-03', []],
      ] as const) {
        const [row] = await rows(`insert into ${TABLE} (work_date, bit_fields) values ($1, $2) returning bit_fields`, [
          date,
          list,
        ])
        expect(row.bit_fields).toEqual(list)
      }
    })

    it.each(NOT_BIT_NAMES)('AC-015.1: 목록 밖 이름 "%s"는 넣기·고치기 모두 23514로 거부된다', async (name) => {
      await become(A)
      await expect(
        db.query(`insert into ${TABLE} (work_date, bit_fields) values ($1, $2)`, [DAY, ['cash_in', name]]),
      ).rejects.toMatchObject(CHECK_FAILED)
      expect(await bitsOf(A)).toEqual([])
      await become(A)
      await db.query(upsertOne('bit_fields'), [DAY, ['cash_in']])
      await expect(db.query(`update ${TABLE} set bit_fields = $1`, [[name]])).rejects.toMatchObject(CHECK_FAILED)
      expect(await bitsOf(A)).toMatchObject([{ bit_fields: ['cash_in'] }])
    })

    it('AC-015.1: 이름 대신 null 한 칸이 든 목록은 23514, 목록 자체가 null이면 23502로 거부된다', async () => {
      await become(A)
      await expect(
        db.query(`insert into ${TABLE} (work_date, bit_fields) values ($1, array['cash_in', null]::text[])`, [DAY]),
      ).rejects.toMatchObject(CHECK_FAILED)
      await expect(
        db.query(`insert into ${TABLE} (work_date, bit_fields) values ($1, null)`, [DAY]),
      ).rejects.toMatchObject({ code: '23502' })
      expect(await bitsOf(A)).toEqual([])
    })
  })

  describe('AC-015.2 승인 사용자 upsert에 bit_fields가 되고 다른 규칙은 REQ-004 그대로다', () => {
    it('AC-015.2: 새 칸 권한은 authenticated의 넣기·고치기 둘뿐이다(anon 없음, 표 권한은 읽기뿐)', async () => {
      const granted = await rows(
        `select grantee, privilege_type from information_schema.column_privileges
         where table_name = 'worklog_days' and column_name = 'bit_fields' and grantee in ('anon', 'authenticated')
         order by 1, 2`,
      )
      expect(granted).toEqual([
        { grantee: 'authenticated', privilege_type: 'INSERT' },
        { grantee: 'authenticated', privilege_type: 'SELECT' },
        { grantee: 'authenticated', privilege_type: 'UPDATE' },
      ])
      const table = await rows(
        `select grantee, privilege_type from information_schema.role_table_grants
         where table_name = 'worklog_days' and grantee in ('anon', 'authenticated')`,
      )
      expect(table).toEqual([{ grantee: 'authenticated', privilege_type: 'SELECT' }])
    })

    it.each(['INSERT', 'UPDATE'])(
      'AC-015.2: %s 칸 권한은 work_date·WORKLOG_COLUMNS 32칸·bit_fields와 정확히 같다',
      async (privilege) => {
        const allowed = await rows(
          `select column_name from information_schema.column_privileges
           where grantee = 'authenticated' and table_name = 'worklog_days' and privilege_type = $1`,
          [privilege],
        )
        const expected = ['work_date', ...Object.values(WORKLOG_COLUMNS), 'bit_fields'].sort()
        expect(allowed.map((r) => r.column_name).sort()).toEqual(expected)
      },
    )

    it('AC-015.2: bit_fields만 보낸 upsert가 hospital_id 없이 내 줄을 만들고 고친다', async () => {
      await become(A)
      await db.query(upsertOne('bit_fields'), [DAY, ['cash_in', 'card_in']])
      await db.query(upsertOne('bit_fields'), [DAY, ['total_fee']])
      const found = await rows(`select hospital_id, work_date::text as work_date, bit_fields, cash_in from ${TABLE}`)
      expect(found).toEqual([{ hospital_id: hospital[A], work_date: DAY, bit_fields: ['total_fee'], cash_in: null }])
    })

    it('AC-015.2: 바뀐 칸과 bit_fields를 함께 보낸 upsert가 되고, 보내지 않은 칸은 그대로다', async () => {
      await become(A)
      await db.query(upsertOne('memo'), [DAY, '가상 업무사항'])
      await db.query(upsertOf(['cash_in', 'bit_fields']), [DAY, '100000', ['cash_in']])
      expect(await bitsOf(A)).toEqual([
        { work_date: DAY, bit_fields: ['cash_in'], total_fee: null, cash_in: '100000', memo: '가상 업무사항' },
      ])
    })

    it('AC-015.2: work_date + 값 32칸 + bit_fields를 다 보낸 upsert가 넣기와 고치기 모두 된다', async () => {
      await become(A)
      const sql = upsertOf([...VALUE_COLUMNS, 'bit_fields'])
      await db.query(sql, [...sentValues(DAY, '100000', '가상 글자'), BIT_FIELDS])
      await db.query(sql, [...sentValues(DAY, '200000', '가상 다른 글자'), ['new_patients']])
      expect(await bitsOf(A)).toEqual([
        { work_date: DAY, bit_fields: ['new_patients'], total_fee: '200000', cash_in: '200000', memo: '가상 다른 글자' },
      ])
    })

    it('AC-015.2: bit_fields를 SET에 넣지 않은 upsert는 저장된 bit_fields를 바꾸지 않는다', async () => {
      await become(A)
      await db.query(upsertOne('bit_fields'), [DAY, ['cash_in', 'total_fee']])
      await db.query(upsertOne('cash_in'), [DAY, '100000'])
      await db.query(upsertOne('memo'), [DAY, '가상 업무사항'])
      await db.query(UPSERT_SOME, [DAY, '200000', '가상 비고'])
      await db.query(UPSERT_ALL, sentValues(DAY, '300000', '가상 글자'))
      await db.query(upsertOne('cash_in'), [DAY, null])
      expect(await bitsOf(A)).toEqual([
        { work_date: DAY, bit_fields: ['cash_in', 'total_fee'], total_fee: '300000', cash_in: null, memo: '가상 글자' },
      ])
    })

    it('AC-015.2: 다른 병원 줄의 bit_fields는 안 보이고, 고쳐도 0줄이며, 같은 날 upsert는 내 줄만 만든다', async () => {
      await addDay(B)
      await become(B)
      await db.query(upsertOne('bit_fields'), [DAY, ['card_in']])
      await become(A)
      expect(await rows(`select bit_fields from ${TABLE}`)).toEqual([])
      const changed = await db.query(`update ${TABLE} set bit_fields = '{cash_in}' where hospital_id = $1`, [
        hospital[B],
      ])
      expect(changed.affectedRows).toBe(0)
      await db.query(upsertOne('bit_fields'), [DAY, ['cash_in']])
      expect(await bitsOf(A)).toMatchObject([{ bit_fields: ['cash_in'] }])
      expect(await bitsOf(B)).toMatchObject([{ bit_fields: ['card_in'], total_fee: '100000' }])
    })

    it('AC-015.2: anon은 bit_fields를 읽기·넣기·upsert·고치기 모두 42501이고 줄은 그대로다', async () => {
      await addDay(A)
      await becomeAnon()
      await expect(db.query(`select bit_fields from ${TABLE}`)).rejects.toMatchObject(NO_PERMISSION)
      await expect(
        db.query(`insert into ${TABLE} (work_date, bit_fields) values ($1, $2)`, ['2020-01-03', ['cash_in']]),
      ).rejects.toMatchObject(NO_PERMISSION)
      await expect(db.query(upsertOne('bit_fields'), [DAY, ['cash_in']])).rejects.toMatchObject(NO_PERMISSION)
      await expect(db.query(`update ${TABLE} set bit_fields = '{cash_in}'`)).rejects.toMatchObject(NO_PERMISSION)
      expect(await bitsOf(A)).toMatchObject([{ bit_fields: [], total_fee: '100000' }])
    })

    it.each([
      { label: '승인 대기', user: C },
      { label: '거절', user: D },
    ])('AC-015.2: $label 병원 사용자는 bit_fields upsert가 42501이고 고쳐도 0줄이다', async ({ user }) => {
      await addDay(user)
      await become(user)
      await expect(db.query(upsertOne('bit_fields'), [DAY, ['cash_in']])).rejects.toMatchObject(NO_PERMISSION)
      const changed = await db.query(`update ${TABLE} set bit_fields = '{cash_in}'`)
      expect(changed.affectedRows).toBe(0)
      expect(await bitsOf(user)).toMatchObject([{ bit_fields: [] }])
    })
  })
})

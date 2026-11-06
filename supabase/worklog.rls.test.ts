import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  CASH_COUNT_KEYS,
  CASH_COUNT_MAX,
  CASH_FLOAT_DEFAULT,
  CASH_FLOAT_MAX,
  CASH_REASON_MAX,
  MEMO_FONT_PTS,
  WORKLOG_CASH_COLUMNS,
  WORKLOG_COLUMNS,
} from '@/types/worklog'

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

// 칸을 더하는 migration(0110·0200·0300)이 바꾸면 안 되는 것 전부: RLS·정책·함수(공용 함수 포함)·더한 칸 밖 칸·제약·방아쇠·표 권한·칸 권한.
// added = 그 migration이 더하는 칸 이름 하나 또는 목록(기본 0110의 bit_fields). 그 칸들과 그 칸을 담은 제약·그 칸 권한만 빼고 본다
async function schemaSnapshot(added: string | readonly string[] = 'bit_fields') {
  const names = typeof added === 'string' ? [added] : [...added]
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
       where table_schema = 'public' and table_name = 'worklog_days' and column_name <> all($1::text[])
       order by ordinal_position`,
      [names],
    ),
    constraints: await rows(
      `select c.conname, pg_get_constraintdef(c.oid) as def from pg_constraint c
       where c.conrelid = $1::regclass
         and not exists (select 1 from unnest($2::text[]) as n(name) where pg_get_constraintdef(c.oid) like ('%' || n.name || '%'))
       order by c.conname`,
      [TABLE, names],
    ),
    triggers: await rows('select tgname from pg_trigger where tgrelid = $1::regclass', [TABLE]),
    tableGrants: await rows(
      `select grantee, privilege_type from information_schema.role_table_grants
       where table_name = 'worklog_days' order by 1, 2`,
    ),
    columnGrants: await rows(
      `select grantee, privilege_type, column_name from information_schema.column_privileges
       where table_name = 'worklog_days' and column_name <> all($1::text[]) order by 1, 2, 3`,
      [names],
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

// ── 업무사항 글씨 크기(memo_font_pt, specs/worklog-memo-font REQ-1502) ──
// 운영과 같은 차례: auth → 업무일지(0100) → 비트 칸 표시(0110) → 0200. 위 두 묶음(0100만·0110까지)은 그대로 둔다
const MEMO_FONT_MIGRATION_URL = new URL('./migrations/20261105000200_worklog_memo_font.sql', import.meta.url)
const MEMO_FONT = 'memo_font_pt'
// 목록 옆 값(7·13·15·17)과 터무니없는 값. 앱 목록(MEMO_FONT_PTS)에 없다
const NOT_MEMO_FONT_PTS = [7, 13, 15, 17, 0, -11, 100]
const NOT_NULL_FAILED = { code: '23502' }

// 운영자 눈으로 본 그 병원 줄의 글씨 크기·비트 칸 표시와 값 몇 칸
async function fontsOf(user: string) {
  await operator()
  return rows(
    `select work_date::text as work_date, memo_font_pt, bit_fields, total_fee, cash_in, memo
     from ${TABLE} where hospital_id = $1 order by work_date`,
    [hospital[user]],
  )
}

// 새 칸 하나의 모양(칸·그 칸을 담은 제약·그 칸 권한). schemaSnapshot(MEMO_FONT)이 빼고 보는 몫이다
async function memoFontShape() {
  await operator()
  return {
    column: await rows(
      `select column_name, data_type, is_nullable, column_default, ordinal_position from information_schema.columns
       where table_schema = 'public' and table_name = 'worklog_days' and column_name = $1::text`,
      [MEMO_FONT],
    ),
    constraints: await rows(
      `select conname, contype, pg_get_constraintdef(oid) as def from pg_constraint
       where conrelid = $1::regclass and pg_get_constraintdef(oid) like ('%' || $2::text || '%') order by conname`,
      [TABLE, MEMO_FONT],
    ),
    grants: await rows(
      `select grantee, privilege_type from information_schema.column_privileges
       where table_name = 'worklog_days' and column_name = $1::text order by 1, 2`,
      [MEMO_FONT],
    ),
  }
}

describe('REQ-1502 업무사항 글씨 크기 migration(0200)을 0110 위에 붙여 넣은 DB', SLOW, () => {
  let memoFontMigration = ''
  let before: Awaited<ReturnType<typeof schemaSnapshot>>
  let after: Awaited<ReturnType<typeof schemaSnapshot>>
  let shape: Awaited<ReturnType<typeof memoFontShape>>
  // 0200 전에 있던 줄이 0200 전·뒤에 어떻게 보이는지(운영자 눈, 모든 칸)
  let existingBefore: Record<string, unknown>[] = []
  let existingAfter: Record<string, unknown>[] = []

  beforeAll(async () => {
    db = await PGlite.create()
    await db.exec(SUPABASE_MOCK)
    await db.exec(AUTH_MIGRATION)
    await db.exec(WORKLOG_MIGRATION)
    await db.exec(readFileSync(fileURLToPath(BIT_MIGRATION_URL), 'utf-8'))
    await seedUsers()
    await addDay(A)
    await operator()
    await db.query(
      `update ${TABLE} set cash_in = '50000', memo = '가상 업무사항', bit_fields = '{cash_in}' where hospital_id = $1`,
      [hospital[A]],
    )
    existingBefore = await rows(`select * from ${TABLE}`)
    before = await schemaSnapshot(MEMO_FONT)
    memoFontMigration = readFileSync(fileURLToPath(MEMO_FONT_MIGRATION_URL), 'utf-8')
    await operator()
    await db.exec(memoFontMigration)
    after = await schemaSnapshot(MEMO_FONT)
    shape = await memoFontShape()
    await operator()
    existingAfter = await rows(`select * from ${TABLE}`)
  }, 30_000)

  afterAll(async () => {
    await db.close()
  })

  beforeEach(seedUsers)

  describe('AC-1502.1 memo_font_pt 칸 하나만 더해지고 나머지는 그대로다', () => {
    it('AC-1502.1: memo_font_pt smallint not null default 11이 bit_fields 뒤 맨 끝에 하나 더해진다', async () => {
      const columns = await rows(
        `select column_name, data_type, is_nullable, column_default from information_schema.columns
         where table_schema = 'public' and table_name = 'worklog_days' order by ordinal_position`,
      )
      expect(columns.map((c) => c.column_name)).toEqual([
        'hospital_id',
        'work_date',
        ...VALUE_COLUMNS,
        'bit_fields',
        MEMO_FONT,
      ])
      expect(columns.at(-1)).toEqual({
        column_name: MEMO_FONT,
        data_type: 'smallint',
        is_nullable: 'NO',
        column_default: '11',
      })
    })

    it('AC-1502.1: RLS·정책 셋·공용 함수·다른 칸(값 32칸·bit_fields)·다른 제약·표 권한·다른 칸 권한이 붙여 넣기 전과 같다', () => {
      expect(after).toEqual(before)
      expect(after.rls).toEqual([{ relrowsecurity: true, relforcerowsecurity: false }])
      expect(after.policies).toHaveLength(3)
      expect(after.functions.map((f) => f.name)).toContain('my_hospital_id()')
      // 견준 칸에 bit_fields가 들어 있다(거르는 칸 이름이 memo_font_pt 하나뿐이다)
      expect(after.columns.map((c) => c.column_name)).toEqual(['hospital_id', 'work_date', ...VALUE_COLUMNS, 'bit_fields'])
      expect(after.constraints.some((c) => String(c.def).includes('bit_fields'))).toBe(true)
      expect(after.columnGrants.some((g) => g.column_name === 'bit_fields')).toBe(true)
    })

    it('AC-1502.1: 방아쇠는 실행 뒤에도 없다', async () => {
      const triggers = await rows(`select tgname from pg_trigger where tgrelid = $1::regclass and not tgisinternal`, [
        TABLE,
      ])
      expect(triggers).toEqual([])
      expect(after.triggers).toEqual(before.triggers)
    })

    it('AC-1502.1: 더한 제약은 memo_font_pt 목록 check 하나와 not null뿐이다', () => {
      const checks = shape.constraints.filter((c) => c.contype === 'c')
      expect(checks.map((c) => c.conname)).toEqual(['worklog_days_memo_font_pt_check'])
      // PG18은 not null도 pg_constraint에 따로 적는다(contype 'n'). 그 밖의 종류는 없다
      expect(shape.constraints.every((c) => c.contype === 'c' || c.contype === 'n')).toBe(true)
    })

    it('AC-1502.1: 파일은 칸 하나와 그 칸 권한만 더하고 함수·정책을 만들거나 고치거나 지우지 않는다', () => {
      expect(memoFontMigration).toContain('alter table public.worklog_days add column if not exists memo_font_pt')
      expect(memoFontMigration).toContain(
        'grant insert (memo_font_pt), update (memo_font_pt) on table public.worklog_days to authenticated;',
      )
      expect(memoFontMigration).not.toMatch(/create\s+(or\s+replace\s+)?function/i)
      expect(memoFontMigration).not.toMatch(/(create|alter|drop)\s+policy/i)
      expect(memoFontMigration).not.toMatch(/\b(drop|revoke|truncate|delete)\b/i)
    })
  })

  describe('AC-1502.2 있던 줄은 11이 되고 두 번 붙여 넣어도 그대로다', () => {
    it('AC-1502.2: 붙여 넣기 전에 있던 줄은 memo_font_pt가 11이고 다른 값·bit_fields는 그대로다', () => {
      expect(existingBefore).toHaveLength(1)
      expect(existingBefore[0]).not.toHaveProperty(MEMO_FONT)
      expect(existingBefore[0]).toMatchObject({ total_fee: '100000', cash_in: '50000', bit_fields: ['cash_in'] })
      expect(existingAfter).toEqual([{ ...existingBefore[0], memo_font_pt: 11 }])
    })

    it('AC-1502.2: 두 번 붙여 넣어도 오류 없이 모양·저장된 크기가 그대로다', async () => {
      await addDay(A)
      await become(A)
      await db.query(upsertOne(MEMO_FONT), [DAY, 14])
      await operator()
      await db.exec(memoFontMigration)
      expect(await schemaSnapshot(MEMO_FONT)).toEqual(after)
      expect(await memoFontShape()).toEqual(shape)
      expect(await fontsOf(A)).toEqual([
        { work_date: DAY, memo_font_pt: 14, bit_fields: [], total_fee: '100000', cash_in: null, memo: null },
      ])
    })
  })

  describe('AC-1502.3 값 제약은 MEMO_FONT_PTS 일곱 값만 받는다', () => {
    it('AC-1502.3: 시험의 거부 값은 MEMO_FONT_PTS에 없고, 목록 옆 값(±1)을 모두 담는다', () => {
      const list: readonly number[] = MEMO_FONT_PTS
      expect(list).toHaveLength(7)
      expect(NOT_MEMO_FONT_PTS.filter((v) => list.includes(v))).toEqual([])
      const neighbors = list.flatMap((v) => [v - 1, v + 1]).filter((v) => !list.includes(v))
      for (const v of neighbors) expect(NOT_MEMO_FONT_PTS).toContain(v)
    })

    it.each(MEMO_FONT_PTS)('AC-1502.3: %d pt는 넣기·고치기·upsert 모두 된다', async (pt) => {
      await become(A)
      const [inserted] = await rows(
        `insert into ${TABLE} (work_date, memo_font_pt) values ($1, $2) returning memo_font_pt`,
        [DAY, pt],
      )
      expect(inserted.memo_font_pt).toBe(pt)
      await db.query(`insert into ${TABLE} (work_date) values ($1)`, ['2020-01-03'])
      const [updated] = await rows(
        `update ${TABLE} set memo_font_pt = $1 where work_date = $2 returning memo_font_pt`,
        [pt, '2020-01-03'],
      )
      expect(updated.memo_font_pt).toBe(pt)
      await db.query(upsertOne(MEMO_FONT), ['2020-01-04', pt])
      expect((await fontsOf(A)).map((r) => r.memo_font_pt)).toEqual([pt, pt, pt])
    })

    it.each(NOT_MEMO_FONT_PTS)('AC-1502.3: %d는 넣기·고치기·upsert 모두 23514로 거부되고 줄은 그대로다', async (value) => {
      await become(A)
      await expect(
        db.query(`insert into ${TABLE} (work_date, memo_font_pt) values ($1, $2)`, [DAY, value]),
      ).rejects.toMatchObject(CHECK_FAILED)
      await expect(db.query(upsertOne(MEMO_FONT), [DAY, value])).rejects.toMatchObject(CHECK_FAILED)
      expect(await fontsOf(A)).toEqual([])
      await become(A)
      await db.query(upsertOne('cash_in'), [DAY, '100000'])
      await expect(db.query(`update ${TABLE} set memo_font_pt = $1`, [value])).rejects.toMatchObject(CHECK_FAILED)
      await expect(db.query(upsertOne(MEMO_FONT), [DAY, value])).rejects.toMatchObject(CHECK_FAILED)
      expect(await fontsOf(A)).toMatchObject([{ memo_font_pt: 11, cash_in: '100000' }])
    })

    it('AC-1502.3: null은 넣기·고치기·upsert 모두 23502로 거부된다', async () => {
      await become(A)
      await expect(
        db.query(`insert into ${TABLE} (work_date, memo_font_pt) values ($1, null)`, [DAY]),
      ).rejects.toMatchObject(NOT_NULL_FAILED)
      expect(await fontsOf(A)).toEqual([])
      await become(A)
      await db.query(upsertOne(MEMO_FONT), [DAY, 14])
      await expect(db.query(`update ${TABLE} set memo_font_pt = null`)).rejects.toMatchObject(NOT_NULL_FAILED)
      await expect(db.query(upsertOne(MEMO_FONT), [DAY, null])).rejects.toMatchObject(NOT_NULL_FAILED)
      expect(await fontsOf(A)).toMatchObject([{ memo_font_pt: 14 }])
    })

    it('AC-1502.3: memo_font_pt 없이 넣은 줄은 11이다', async () => {
      await become(A)
      const [row] = await rows(
        `insert into ${TABLE} (work_date, cash_in) values ($1, '100000') returning memo_font_pt`,
        [DAY],
      )
      expect(row.memo_font_pt).toBe(11)
    })
  })

  describe('AC-1502.4 승인 사용자 upsert에 memo_font_pt가 되고, 보내지 않으면 그대로다', () => {
    it.each(['INSERT', 'UPDATE'])(
      'AC-1502.4: %s 칸 권한은 work_date·WORKLOG_COLUMNS 32칸·bit_fields·memo_font_pt와 정확히 같다',
      async (privilege) => {
        const allowed = await rows(
          `select column_name from information_schema.column_privileges
           where grantee = 'authenticated' and table_name = 'worklog_days' and privilege_type = $1`,
          [privilege],
        )
        const expected = ['work_date', ...Object.values(WORKLOG_COLUMNS), 'bit_fields', MEMO_FONT].sort()
        expect(allowed.map((r) => r.column_name).sort()).toEqual(expected)
        expect(expected).not.toContain('hospital_id')
      },
    )

    it('AC-1502.4: 줄이 없던 날에 work_date + memo_font_pt만 보낸 upsert가 hospital_id 없이 내 줄을 만들고 고친다', async () => {
      await become(A)
      await db.query(upsertOne(MEMO_FONT), [DAY, 14])
      const [created] = await rows(`select * from ${TABLE}`)
      expectOnlyFilled(created, { hospital_id: hospital[A], memo_font_pt: 14, bit_fields: [] })
      await db.query(upsertOne(MEMO_FONT), [DAY, 12])
      const found = await rows(`select * from ${TABLE}`)
      expect(found).toHaveLength(1)
      expectOnlyFilled(found[0], { hospital_id: hospital[A], memo_font_pt: 12, bit_fields: [] })
    })

    it('AC-1502.4: 있던 날에 memo_font_pt만 보낸 upsert는 그 칸만 고치고 다른 칸·bit_fields는 그대로다', async () => {
      await become(A)
      await db.query(upsertOf(['cash_in', 'memo', 'bit_fields']), [DAY, '100000', '가상 업무사항', ['cash_in']])
      await db.query(upsertOne(MEMO_FONT), [DAY, 16])
      expect(await fontsOf(A)).toEqual([
        { work_date: DAY, memo_font_pt: 16, bit_fields: ['cash_in'], total_fee: null, cash_in: '100000', memo: '가상 업무사항' },
      ])
    })

    it('AC-1502.4: memo_font_pt를 SET에 넣지 않은 upsert는 저장된 memo_font_pt를 바꾸지 않는다', async () => {
      await become(A)
      await db.query(upsertOne(MEMO_FONT), [DAY, 14])
      await db.query(upsertOne('cash_in'), [DAY, '100000'])
      await db.query(upsertOne('memo'), [DAY, '가상 업무사항'])
      await db.query(upsertOne('bit_fields'), [DAY, ['cash_in']])
      await db.query(upsertOf(['cash_in', 'bit_fields']), [DAY, '200000', ['cash_in', 'total_fee']])
      await db.query(UPSERT_SOME, [DAY, '200000', '가상 비고'])
      await db.query(UPSERT_ALL, sentValues(DAY, '300000', '가상 글자'))
      await db.query(upsertOne('cash_in'), [DAY, null])
      expect(await fontsOf(A)).toEqual([
        {
          work_date: DAY,
          memo_font_pt: 14,
          bit_fields: ['cash_in', 'total_fee'],
          total_fee: '300000',
          cash_in: null,
          memo: '가상 글자',
        },
      ])
    })

    it('AC-1502.4: work_date + 값 32칸 + bit_fields + memo_font_pt를 다 보낸 upsert가 넣기와 고치기 모두 된다', async () => {
      await become(A)
      const sql = upsertOf([...VALUE_COLUMNS, 'bit_fields', MEMO_FONT])
      await db.query(sql, [...sentValues(DAY, '100000', '가상 글자'), BIT_FIELDS, 8])
      await db.query(sql, [...sentValues(DAY, '200000', '가상 다른 글자'), ['new_patients'], 16])
      expect(await fontsOf(A)).toEqual([
        {
          work_date: DAY,
          memo_font_pt: 16,
          bit_fields: ['new_patients'],
          total_fee: '200000',
          cash_in: '200000',
          memo: '가상 다른 글자',
        },
      ])
    })
  })

  describe('AC-1502.5 로그인 안 한 사용자·다른 병원·승인 대기·거절은 REQ-004 그대로 막힌다', () => {
    it('AC-1502.5: anon에게는 새 칸 권한이 하나도 없고, 새 칸 권한은 authenticated의 넣기·고치기와 표 읽기뿐이다', async () => {
      const granted = await rows(
        `select grantee, privilege_type from information_schema.column_privileges
         where table_name = 'worklog_days' and column_name = $1::text and grantee in ('anon', 'authenticated')
         order by 1, 2`,
        [MEMO_FONT],
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

    it('AC-1502.5: anon은 memo_font_pt를 읽기·넣기·upsert·고치기 모두 42501이고 줄은 그대로다', async () => {
      await addDay(A)
      await becomeAnon()
      await expect(db.query(`select memo_font_pt from ${TABLE}`)).rejects.toMatchObject(NO_PERMISSION)
      await expect(
        db.query(`insert into ${TABLE} (work_date, memo_font_pt) values ($1, $2)`, ['2020-01-03', 14]),
      ).rejects.toMatchObject(NO_PERMISSION)
      await expect(db.query(upsertOne(MEMO_FONT), [DAY, 14])).rejects.toMatchObject(NO_PERMISSION)
      await expect(db.query(`update ${TABLE} set memo_font_pt = 14`)).rejects.toMatchObject(NO_PERMISSION)
      expect(await fontsOf(A)).toEqual([
        { work_date: DAY, memo_font_pt: 11, bit_fields: [], total_fee: '100000', cash_in: null, memo: null },
      ])
    })

    it('AC-1502.5: 다른 병원 줄의 memo_font_pt는 안 보이고, 고쳐도 0줄이며, 같은 날 upsert는 내 줄만 만든다', async () => {
      await addDay(B)
      await become(B)
      await db.query(upsertOne(MEMO_FONT), [DAY, 14])
      await become(A)
      expect(await rows(`select memo_font_pt from ${TABLE}`)).toEqual([])
      expect(await rows(`select memo_font_pt from ${TABLE} where hospital_id = $1`, [hospital[B]])).toEqual([])
      const changed = await db.query(`update ${TABLE} set memo_font_pt = 8 where hospital_id = $1`, [hospital[B]])
      expect(changed.affectedRows).toBe(0)
      await db.query(upsertOne(MEMO_FONT), [DAY, 16])
      expect(await fontsOf(A)).toMatchObject([{ work_date: DAY, memo_font_pt: 16, total_fee: null }])
      expect(await fontsOf(B)).toEqual([
        { work_date: DAY, memo_font_pt: 14, bit_fields: [], total_fee: '100000', cash_in: null, memo: null },
      ])
    })

    it.each([
      { label: '승인 대기', user: C },
      { label: '거절', user: D },
    ])(
      'AC-1502.5: $label 병원 사용자는 memo_font_pt를 읽으면 0줄, 넣기·upsert는 42501, 고쳐도 0줄이고 줄은 그대로다',
      async ({ user }) => {
        await addDay(user)
        await become(user)
        expect(await rows(`select memo_font_pt from ${TABLE}`)).toEqual([])
        await expect(
          db.query(`insert into ${TABLE} (work_date, memo_font_pt) values ($1, $2)`, ['2020-01-03', 14]),
        ).rejects.toMatchObject(NO_PERMISSION)
        await expect(db.query(upsertOne(MEMO_FONT), [DAY, 14])).rejects.toMatchObject(NO_PERMISSION)
        const changed = await db.query(`update ${TABLE} set memo_font_pt = 14`)
        expect(changed.affectedRows).toBe(0)
        expect(await fontsOf(user)).toEqual([
          { work_date: DAY, memo_font_pt: 11, bit_fields: [], total_fee: '100000', cash_in: null, memo: null },
        ])
      },
    )
  })
})

// ── 업무일지 현금 시재(specs/worklog-cash-float REQ-1602) ──
// 운영과 같은 차례: auth → 0100 → 0110 → 0200 → 0300. 위 세 묶음(0100만·0110까지·0200까지)은 그대로 둔다.
// 같은 파일이 만드는 병원 설정 표(worklog_settings)도 이 묶음에서 본다
const CASH_MIGRATION_URL = new URL('./migrations/20261105000300_worklog_cash_float.sql', import.meta.url)
// 새 12칸. DB 칸 차례 = 앱 WORKLOG_CASH_COLUMNS 차례(장수 5만원권부터 · 시재 · 확인란 둘 · 이유)
const CASH_COLUMNS = Object.values(WORKLOG_CASH_COLUMNS)
const CASH_COUNT_COLUMNS = CASH_COUNT_KEYS.map((key) => WORKLOG_CASH_COLUMNS[key])
const FLOAT_COLUMN = WORKLOG_CASH_COLUMNS.floatWon
const REFUND_COLUMN = WORKLOG_CASH_COLUMNS.refundCash
const UNPAID_COLUMN = WORKLOG_CASH_COLUMNS.unpaidCash
const REASON_COLUMN = WORKLOG_CASH_COLUMNS.reason
const COUNT_50000 = WORKLOG_CASH_COLUMNS.count50000
const COUNT_10000 = WORKLOG_CASH_COLUMNS.count10000
const COUNT_5000 = WORKLOG_CASH_COLUMNS.count5000
const COUNT_1000 = WORKLOG_CASH_COLUMNS.count1000
// 붙여 넣기 뒤 이미 있던 줄과 시재를 보내지 않은 줄의 시재 칸(기본값)
const CASH_BLANK: Record<string, unknown> = {
  ...Object.fromEntries(CASH_COUNT_COLUMNS.map((column) => [column, 0])),
  [FLOAT_COLUMN]: null,
  [REFUND_COLUMN]: false,
  [UNPAID_COLUMN]: false,
  [REASON_COLUMN]: null,
}
// 시재 12칸을 모두 채운 값(장수 9999·시재 최대·켬·이유 최대 길이)
const CASH_FULL = [
  ...CASH_COUNT_COLUMNS.map(() => CASH_COUNT_MAX),
  CASH_FLOAT_MAX,
  true,
  true,
  '가'.repeat(CASH_REASON_MAX),
]
const SETTINGS = 'public.worklog_settings'
// PostgREST upsert(onConflict: 'hospital_id')와 같은 모양: cash_float만 보내고 hospital_id는 DB 기본값으로 채운다
const UPSERT_SETTING = `insert into ${SETTINGS} (cash_float) values ($1)
  on conflict (hospital_id) do update set cash_float = excluded.cash_float`

// 운영자 눈으로 본 그 병원 줄의 시재 12칸과 다른 칸 몇 개
async function cashOf(user: string) {
  await operator()
  return rows(
    `select work_date::text as work_date, ${CASH_COLUMNS.join(', ')}, memo_font_pt, bit_fields, total_fee, cash_in, memo
     from ${TABLE} where hospital_id = $1 order by work_date`,
    [hospital[user]],
  )
}

// 운영자 눈으로 본 그 병원의 설정 줄
async function settingsOf(user: string) {
  await operator()
  return rows(`select cash_float from ${SETTINGS} where hospital_id = $1`, [hospital[user]])
}

// 운영자가 그 병원 설정 줄을 넣어 둔다(RLS를 건너뛴다)
async function addSetting(user: string, won = 250_000) {
  await operator()
  await db.query(`insert into ${SETTINGS} (hospital_id, cash_float) values ($1, $2)`, [hospital[user], won])
}

// 새 12칸의 모양(칸·그 칸들을 담은 제약·그 칸 권한). schemaSnapshot(CASH_COLUMNS)이 빼고 보는 몫이다
async function cashShape() {
  await operator()
  return {
    columns: await rows(
      `select column_name, data_type, is_nullable, column_default, ordinal_position from information_schema.columns
       where table_schema = 'public' and table_name = 'worklog_days' and column_name = any($1::text[])
       order by ordinal_position`,
      [CASH_COLUMNS],
    ),
    constraints: await rows(
      `select c.conname, c.contype, pg_get_constraintdef(c.oid) as def from pg_constraint c
       where c.conrelid = $1::regclass
         and exists (select 1 from unnest($2::text[]) as n(name) where pg_get_constraintdef(c.oid) like ('%' || n.name || '%'))
       order by c.conname`,
      [TABLE, CASH_COLUMNS],
    ),
    grants: await rows(
      `select grantee, privilege_type, column_name from information_schema.column_privileges
       where table_name = 'worklog_days' and column_name = any($1::text[]) order by 1, 2, 3`,
      [CASH_COLUMNS],
    ),
  }
}

// 설정 표의 모양 전부(칸·제약·RLS·정책·anon·authenticated 권한·방아쇠)
async function settingsShape() {
  await operator()
  return {
    columns: await rows(
      `select column_name, data_type, is_nullable, column_default from information_schema.columns
       where table_schema = 'public' and table_name = 'worklog_settings' order by ordinal_position`,
    ),
    constraints: await rows(
      `select conname, contype, pg_get_constraintdef(oid) as def from pg_constraint
       where conrelid = $1::regclass order by conname`,
      [SETTINGS],
    ),
    rls: await rows('select relrowsecurity, relforcerowsecurity from pg_class where oid = $1::regclass', [SETTINGS]),
    policies: await rows(
      `select policyname, cmd, roles::text as roles, qual, with_check from pg_policies
       where tablename = 'worklog_settings' order by policyname`,
    ),
    tableGrants: await rows(
      `select grantee, privilege_type from information_schema.role_table_grants
       where table_name = 'worklog_settings' and grantee in ('anon', 'authenticated') order by 1, 2`,
    ),
    columnGrants: await rows(
      `select grantee, privilege_type, column_name from information_schema.column_privileges
       where table_name = 'worklog_settings' and grantee in ('anon', 'authenticated') order by 1, 2, 3`,
    ),
    triggers: await rows('select tgname from pg_trigger where tgrelid = $1::regclass and not tgisinternal', [SETTINGS]),
  }
}

// 제약 글에 나오는 시재 칸 이름(cash_count_50은 cash_count_500·50000과 다른 칸으로 센다)
function cashColumnsIn(def: string) {
  return CASH_COLUMNS.filter((column) => new RegExp(`\\b${column}\\b`).test(def))
}

// 범위 밖 값(AC-1602.2): 장수 -1·9999+1, 시재 -1·최대+1, 이유 빈 글·최대+1자
const CASH_OUT_OF_RANGE: { label: string; column: string; value: number | string }[] = [
  ...CASH_COUNT_COLUMNS.flatMap((column) => [
    { label: `${column} = -1`, column, value: -1 },
    { label: `${column} = ${CASH_COUNT_MAX + 1}`, column, value: CASH_COUNT_MAX + 1 },
  ]),
  { label: `${FLOAT_COLUMN} = -1`, column: FLOAT_COLUMN, value: -1 },
  { label: `${FLOAT_COLUMN} = ${CASH_FLOAT_MAX + 1}`, column: FLOAT_COLUMN, value: CASH_FLOAT_MAX + 1 },
  { label: `${REASON_COLUMN} = 빈 글`, column: REASON_COLUMN, value: '' },
  { label: `${REASON_COLUMN} = ${CASH_REASON_MAX + 1}자`, column: REASON_COLUMN, value: '가'.repeat(CASH_REASON_MAX + 1) },
]

describe('REQ-1602 현금 시재 migration(0300)을 0200 위에 붙여 넣은 DB', SLOW, () => {
  let cashMigration = ''
  let before: Awaited<ReturnType<typeof schemaSnapshot>>
  let after: Awaited<ReturnType<typeof schemaSnapshot>>
  let shape: Awaited<ReturnType<typeof cashShape>>
  let settings: Awaited<ReturnType<typeof settingsShape>>
  // 0300 전에 있던 줄이 0300 전·뒤에 어떻게 보이는지(운영자 눈, 모든 칸)
  let existingBefore: Record<string, unknown>[] = []
  let existingAfter: Record<string, unknown>[] = []

  beforeAll(async () => {
    db = await PGlite.create()
    await db.exec(SUPABASE_MOCK)
    await db.exec(AUTH_MIGRATION)
    await db.exec(WORKLOG_MIGRATION)
    await db.exec(readFileSync(fileURLToPath(BIT_MIGRATION_URL), 'utf-8'))
    await db.exec(readFileSync(fileURLToPath(MEMO_FONT_MIGRATION_URL), 'utf-8'))
    await seedUsers()
    await addDay(A)
    await operator()
    await db.query(
      `update ${TABLE} set cash_in = '50000', memo = '가상 업무사항', bit_fields = '{cash_in}', memo_font_pt = 14
       where hospital_id = $1`,
      [hospital[A]],
    )
    existingBefore = await rows(`select * from ${TABLE}`)
    before = await schemaSnapshot(CASH_COLUMNS)
    cashMigration = readFileSync(fileURLToPath(CASH_MIGRATION_URL), 'utf-8')
    await operator()
    await db.exec(cashMigration)
    after = await schemaSnapshot(CASH_COLUMNS)
    shape = await cashShape()
    settings = await settingsShape()
    await operator()
    existingAfter = await rows(`select * from ${TABLE}`)
  }, 30_000)

  afterAll(async () => {
    await db.close()
  })

  beforeEach(seedUsers)

  describe('AC-1602.1 worklog_days 끝에 시재 12칸이 더해지고 나머지는 그대로다', () => {
    it('AC-1602.1: 새 12칸이 memo_font_pt 뒤 맨 끝에 WORKLOG_CASH_COLUMNS 차례로 더해진다', async () => {
      expect(CASH_COLUMNS).toHaveLength(12)
      const columns = await rows(
        `select column_name from information_schema.columns
         where table_schema = 'public' and table_name = 'worklog_days' order by ordinal_position`,
      )
      expect(columns.map((c) => c.column_name)).toEqual([
        'hospital_id',
        'work_date',
        ...VALUE_COLUMNS,
        'bit_fields',
        MEMO_FONT,
        ...CASH_COLUMNS,
      ])
    })

    it('AC-1602.1: 장수 8칸은 정수 not null 기본 0, 그날 시재는 정수 null 허용, 켬/끔 둘은 참거짓 not null 기본 거짓, 이유는 글 null 허용이다', () => {
      const described = shape.columns.map((c) => ({
        column_name: c.column_name,
        data_type: c.data_type,
        is_nullable: c.is_nullable,
        column_default: c.column_default,
      }))
      expect(described).toEqual([
        ...CASH_COUNT_COLUMNS.map((column_name) => ({
          column_name,
          data_type: 'integer',
          is_nullable: 'NO',
          column_default: '0',
        })),
        { column_name: FLOAT_COLUMN, data_type: 'integer', is_nullable: 'YES', column_default: null },
        { column_name: REFUND_COLUMN, data_type: 'boolean', is_nullable: 'NO', column_default: 'false' },
        { column_name: UNPAID_COLUMN, data_type: 'boolean', is_nullable: 'NO', column_default: 'false' },
        { column_name: REASON_COLUMN, data_type: 'text', is_nullable: 'YES', column_default: null },
      ])
    })

    it('AC-1602.1: RLS·정책 셋·공용 함수·다른 칸(값 32칸·bit_fields·memo_font_pt)·다른 제약·표 권한·다른 칸 권한이 붙여 넣기 전과 같다', () => {
      expect(after).toEqual(before)
      expect(after.rls).toEqual([{ relrowsecurity: true, relforcerowsecurity: false }])
      expect(after.policies).toHaveLength(3)
      expect(after.functions.map((f) => f.name)).toContain('my_hospital_id()')
      // 견준 칸에 bit_fields·memo_font_pt가 들어 있다(거르는 칸 이름이 새 12칸뿐이다)
      expect(after.columns.map((c) => c.column_name)).toEqual([
        'hospital_id',
        'work_date',
        ...VALUE_COLUMNS,
        'bit_fields',
        MEMO_FONT,
      ])
      expect(after.constraints.some((c) => String(c.def).includes('bit_fields'))).toBe(true)
      expect(after.constraints.some((c) => String(c.def).includes(MEMO_FONT))).toBe(true)
      expect(after.columnGrants.some((g) => g.column_name === MEMO_FONT)).toBe(true)
    })

    it('AC-1602.1: 방아쇠는 실행 뒤에도 없다', async () => {
      const triggers = await rows(`select tgname from pg_trigger where tgrelid = $1::regclass and not tgisinternal`, [
        TABLE,
      ])
      expect(triggers).toEqual([])
      expect(after.triggers).toEqual(before.triggers)
    })

    it('AC-1602.1: 더한 제약은 칸마다 check 하나(장수 8·시재·이유)와 not null뿐이고 칸끼리 묶는 제약이 없다', () => {
      const checks = shape.constraints.filter((c) => c.contype === 'c')
      expect(checks.map((c) => c.conname).sort()).toEqual(
        [...CASH_COUNT_COLUMNS, FLOAT_COLUMN, REASON_COLUMN].map((column) => `worklog_days_${column}_check`).sort(),
      )
      for (const check of checks) {
        expect(cashColumnsIn(String(check.def)), String(check.conname)).toHaveLength(1)
      }
      // PG18은 not null도 pg_constraint에 따로 적는다(contype 'n'). 그 밖의 종류(외래 키·고유 등)는 없다
      expect(shape.constraints.every((c) => c.contype === 'c' || c.contype === 'n')).toBe(true)
      for (const constraint of shape.constraints) {
        expect(cashColumnsIn(String(constraint.def)), String(constraint.conname)).toHaveLength(1)
      }
    })

    it('AC-1602.1: 파일은 시재 칸·그 칸 권한·설정 표만 만들고 함수·worklog_days 정책을 만들거나 고치거나 지우지 않는다', () => {
      expect(cashMigration).toContain('alter table public.worklog_days')
      expect(cashMigration).toContain('create table if not exists public.worklog_settings')
      expect(cashMigration).not.toMatch(/create\s+(or\s+replace\s+)?function/i)
      const policyStatements = cashMigration.match(/(create|alter|drop)\s+policy[^;]*/gi) ?? []
      expect(policyStatements).toHaveLength(2)
      for (const statement of policyStatements) expect(statement).toContain('on public.worklog_settings')
      const revokes = cashMigration.match(/\brevoke\b[^;]*/gi) ?? []
      expect(revokes).toHaveLength(1)
      expect(revokes[0]).toContain('on table public.worklog_settings')
      expect(cashMigration).not.toMatch(/\b(truncate|delete\s+from)\b/i)
      expect(cashMigration).not.toMatch(/\bdrop\s+(table|column|function|constraint)\b/i)
    })
  })

  describe('AC-1602.1 있던 줄은 기본값이 되고 한 번 더 붙여 넣어도 그대로다', () => {
    it('AC-1602.1: 붙여 넣기 전에 있던 줄은 시재 칸이 기본값이고 다른 값·bit_fields·memo_font_pt는 그대로다', () => {
      expect(existingBefore).toHaveLength(1)
      for (const column of CASH_COLUMNS) expect(existingBefore[0]).not.toHaveProperty(column)
      expect(existingBefore[0]).toMatchObject({
        total_fee: '100000',
        cash_in: '50000',
        memo: '가상 업무사항',
        bit_fields: ['cash_in'],
        memo_font_pt: 14,
      })
      expect(existingAfter).toEqual([{ ...existingBefore[0], ...CASH_BLANK }])
    })

    it('AC-1602.1: 한 번 더 붙여 넣어도 오류 없이 모양·설정 표·저장된 시재·설정 줄이 그대로다', async () => {
      await addDay(A)
      await become(A)
      await db.query(upsertOf([COUNT_5000, FLOAT_COLUMN, REFUND_COLUMN, REASON_COLUMN]), [
        DAY,
        2,
        300_000,
        true,
        '가상 이유',
      ])
      await db.query(UPSERT_SETTING, [250_000])
      await operator()
      await db.exec(cashMigration)
      expect(await schemaSnapshot(CASH_COLUMNS)).toEqual(after)
      expect(await cashShape()).toEqual(shape)
      expect(await settingsShape()).toEqual(settings)
      expect(await cashOf(A)).toEqual([
        {
          work_date: DAY,
          ...CASH_BLANK,
          [COUNT_5000]: 2,
          [FLOAT_COLUMN]: 300_000,
          [REFUND_COLUMN]: true,
          [REASON_COLUMN]: '가상 이유',
          memo_font_pt: 11,
          bit_fields: [],
          total_fee: '100000',
          cash_in: null,
          memo: null,
        },
      ])
      expect(await settingsOf(A)).toEqual([{ cash_float: 250_000 }])
    })
  })

  describe('AC-1602.2 값 제약', () => {
    it.each(CASH_OUT_OF_RANGE)(
      'AC-1602.2: $label은 넣기·고치기·upsert 모두 23514로 거부되고 줄은 그대로다',
      async ({ column, value }) => {
        await become(A)
        await expect(
          db.query(`insert into ${TABLE} (work_date, ${column}) values ($1, $2)`, [DAY, value]),
        ).rejects.toMatchObject(CHECK_FAILED)
        await expect(db.query(upsertOne(column), [DAY, value])).rejects.toMatchObject(CHECK_FAILED)
        expect(await cashOf(A)).toEqual([])
        await become(A)
        await db.query(upsertOne('cash_in'), [DAY, '100000'])
        await expect(db.query(`update ${TABLE} set ${column} = $1`, [value])).rejects.toMatchObject(CHECK_FAILED)
        await expect(db.query(upsertOne(column), [DAY, value])).rejects.toMatchObject(CHECK_FAILED)
        expect(await cashOf(A)).toMatchObject([{ ...CASH_BLANK, cash_in: '100000' }])
      },
    )

    it('AC-1602.2: 범위 끝 값(장수 0·9999, 시재 0·10,000,000·null, 이유 1자·200자)은 넣기·고치기·upsert 모두 된다', async () => {
      await become(A)
      const columns = CASH_COLUMNS.join(', ')
      const marks = CASH_COLUMNS.map((_, i) => `$${i + 2}`).join(', ')
      await db.query(`insert into ${TABLE} (work_date, ${columns}) values ($1, ${marks})`, [DAY, ...CASH_FULL])
      const full = Object.fromEntries(CASH_COLUMNS.map((column, i) => [column, CASH_FULL[i]]))
      expect(await cashOf(A)).toMatchObject([full])
      await become(A)
      await db.query(
        `update ${TABLE} set ${CASH_COUNT_COLUMNS.map((c) => `${c} = 0`).join(', ')},
           ${FLOAT_COLUMN} = 0, ${REFUND_COLUMN} = false, ${UNPAID_COLUMN} = false, ${REASON_COLUMN} = '가'`,
      )
      expect(await cashOf(A)).toMatchObject([{ ...CASH_BLANK, [FLOAT_COLUMN]: 0, [REASON_COLUMN]: '가' }])
      await become(A)
      await db.query(upsertOne(FLOAT_COLUMN), [DAY, null])
      await db.query(upsertOne(REASON_COLUMN), [DAY, null])
      expect(await cashOf(A)).toMatchObject([CASH_BLANK])
      await become(A)
      await db.query(upsertOf(CASH_COLUMNS), ['2020-01-03', ...CASH_FULL])
      expect((await cashOf(A))[1]).toMatchObject({ work_date: '2020-01-03', ...full })
    })

    it.each([...CASH_COUNT_COLUMNS, REFUND_COLUMN, UNPAID_COLUMN])(
      'AC-1602.2: %s null은 넣기·고치기·upsert 모두 23502로 거부되고 줄은 그대로다',
      async (column) => {
        await become(A)
        await expect(
          db.query(`insert into ${TABLE} (work_date, ${column}) values ($1, null)`, [DAY]),
        ).rejects.toMatchObject(NOT_NULL_FAILED)
        await expect(db.query(upsertOne(column), [DAY, null])).rejects.toMatchObject(NOT_NULL_FAILED)
        expect(await cashOf(A)).toEqual([])
        await become(A)
        await db.query(upsertOne('cash_in'), [DAY, '100000'])
        await expect(db.query(`update ${TABLE} set ${column} = null`)).rejects.toMatchObject(NOT_NULL_FAILED)
        await expect(db.query(upsertOne(column), [DAY, null])).rejects.toMatchObject(NOT_NULL_FAILED)
        expect(await cashOf(A)).toMatchObject([{ ...CASH_BLANK, cash_in: '100000' }])
      },
    )
  })

  describe('AC-1602.3 승인 사용자가 시재 칸 일부만 보낸 upsert는 그 칸만 바꾼다', () => {
    it.each(['INSERT', 'UPDATE'])(
      'AC-1602.3: %s 칸 권한은 work_date·WORKLOG_COLUMNS 32칸·bit_fields·memo_font_pt·시재 12칸과 정확히 같다',
      async (privilege) => {
        const allowed = await rows(
          `select column_name from information_schema.column_privileges
           where grantee = 'authenticated' and table_name = 'worklog_days' and privilege_type = $1`,
          [privilege],
        )
        const expected = [
          'work_date',
          ...Object.values(WORKLOG_COLUMNS),
          'bit_fields',
          MEMO_FONT,
          ...Object.values(WORKLOG_CASH_COLUMNS),
        ].sort()
        expect(allowed.map((r) => r.column_name).sort()).toEqual(expected)
        expect(expected).not.toContain('hospital_id')
      },
    )

    it('AC-1602.3: 줄이 없던 날에 work_date + 장수만 보낸 upsert가 hospital_id 없이 내 줄을 만들고 고치며, 다른 시재 칸은 기본값이다', async () => {
      await become(A)
      await db.query(upsertOf([COUNT_5000, COUNT_1000]), [DAY, 2, 3])
      const [created] = await rows(`select * from ${TABLE}`)
      expectOnlyFilled(created, {
        hospital_id: hospital[A],
        bit_fields: [],
        memo_font_pt: 11,
        ...CASH_BLANK,
        [COUNT_5000]: 2,
        [COUNT_1000]: 3,
      })
      await db.query(upsertOf([COUNT_5000]), [DAY, 4])
      const found = await rows(`select * from ${TABLE}`)
      expect(found).toHaveLength(1)
      expectOnlyFilled(found[0], {
        hospital_id: hospital[A],
        bit_fields: [],
        memo_font_pt: 11,
        ...CASH_BLANK,
        [COUNT_5000]: 4,
        [COUNT_1000]: 3,
      })
    })

    it('AC-1602.3: cash_float이 null인 있던 줄에도 장수·확인란·이유만 보낸 upsert가 거부되지 않는다(칸끼리 묶는 제약이 없다)', async () => {
      await addDay(A)
      await become(A)
      await db.query(upsertOne(COUNT_10000), [DAY, 5])
      await db.query(upsertOf([UNPAID_COLUMN, REASON_COLUMN]), [DAY, true, '가상 이유'])
      await db.query(`update ${TABLE} set ${COUNT_50000} = 1`)
      expect(await cashOf(A)).toEqual([
        {
          work_date: DAY,
          ...CASH_BLANK,
          [COUNT_50000]: 1,
          [COUNT_10000]: 5,
          [UNPAID_COLUMN]: true,
          [REASON_COLUMN]: '가상 이유',
          memo_font_pt: 11,
          bit_fields: [],
          total_fee: '100000',
          cash_in: null,
          memo: null,
        },
      ])
    })

    it('AC-1602.3: 있던 날에 시재 칸 일부만 보낸 upsert는 그 칸만 고치고 다른 시재 칸·값 32칸·bit_fields·memo_font_pt는 그대로다', async () => {
      await become(A)
      await db.query(upsertOf(['cash_in', 'memo', 'bit_fields', MEMO_FONT, COUNT_50000, FLOAT_COLUMN]), [
        DAY,
        '100000',
        '가상 업무사항',
        ['cash_in'],
        14,
        6,
        300_000,
      ])
      await db.query(upsertOf([COUNT_5000, REFUND_COLUMN]), [DAY, 2, true])
      await db.query(upsertOne(REASON_COLUMN), [DAY, '가상 이유'])
      expect(await cashOf(A)).toEqual([
        {
          work_date: DAY,
          ...CASH_BLANK,
          [COUNT_50000]: 6,
          [COUNT_5000]: 2,
          [FLOAT_COLUMN]: 300_000,
          [REFUND_COLUMN]: true,
          [REASON_COLUMN]: '가상 이유',
          memo_font_pt: 14,
          bit_fields: ['cash_in'],
          total_fee: null,
          cash_in: '100000',
          memo: '가상 업무사항',
        },
      ])
    })

    it('AC-1602.3: 시재 칸을 SET에 넣지 않은 upsert(칸·목록·크기 저장)는 저장된 시재를 바꾸지 않는다', async () => {
      await become(A)
      await db.query(upsertOf(CASH_COLUMNS), [DAY, ...CASH_FULL])
      await db.query(upsertOne('cash_in'), [DAY, '100000'])
      await db.query(upsertOne('memo'), [DAY, '가상 업무사항'])
      await db.query(upsertOne('bit_fields'), [DAY, ['cash_in']])
      await db.query(upsertOne(MEMO_FONT), [DAY, 16])
      await db.query(UPSERT_SOME, [DAY, '200000', '가상 비고'])
      await db.query(UPSERT_ALL, sentValues(DAY, '300000', '가상 글자'))
      const full = Object.fromEntries(CASH_COLUMNS.map((column, i) => [column, CASH_FULL[i]]))
      expect(await cashOf(A)).toEqual([
        {
          work_date: DAY,
          ...full,
          memo_font_pt: 16,
          bit_fields: ['cash_in'],
          total_fee: '300000',
          cash_in: '300000',
          memo: '가상 글자',
        },
      ])
    })

    it('AC-1602.3: work_date + 값 32칸 + bit_fields + memo_font_pt + 시재 12칸을 다 보낸 upsert가 넣기와 고치기 모두 된다', async () => {
      await become(A)
      const sql = upsertOf([...VALUE_COLUMNS, 'bit_fields', MEMO_FONT, ...CASH_COLUMNS])
      await db.query(sql, [...sentValues(DAY, '100000', '가상 글자'), BIT_FIELDS, 8, ...CASH_FULL])
      const second = [...CASH_COUNT_COLUMNS.map(() => 1), 0, false, false, null]
      await db.query(sql, [...sentValues(DAY, '200000', '가상 다른 글자'), ['new_patients'], 16, ...second])
      expect(await cashOf(A)).toEqual([
        {
          work_date: DAY,
          ...CASH_BLANK,
          ...Object.fromEntries(CASH_COUNT_COLUMNS.map((column) => [column, 1])),
          [FLOAT_COLUMN]: 0,
          memo_font_pt: 16,
          bit_fields: ['new_patients'],
          total_fee: '200000',
          cash_in: '200000',
          memo: '가상 다른 글자',
        },
      ])
    })
  })

  describe('AC-1602.4 병원 설정 표 worklog_settings', () => {
    it('AC-1602.4: 칸은 hospital_id(uuid, 기본 my_hospital_id())·cash_float(정수 not null 기본 300000) 둘뿐이고 기본 키는 hospital_id다', async () => {
      expect(settings.columns).toEqual([
        {
          column_name: 'hospital_id',
          data_type: 'uuid',
          is_nullable: 'NO',
          column_default: expect.stringContaining('my_hospital_id()'),
        },
        { column_name: 'cash_float', data_type: 'integer', is_nullable: 'NO', column_default: String(CASH_FLOAT_DEFAULT) },
      ])
      expect(CASH_FLOAT_DEFAULT).toBe(300_000)
      const key = await rows(
        `select a.attname from pg_index i
         join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
         where i.indrelid = $1::regclass and i.indisprimary order by a.attnum`,
        [SETTINGS],
      )
      expect(key).toEqual([{ attname: 'hospital_id' }])
    })

    it('AC-1602.4: 제약은 기본 키·병원 외래 키(병원이 지워지면 같이 지워짐)·cash_float 범위 check(0~10,000,000)와 not null뿐이다', async () => {
      const kinds = settings.constraints.filter((c) => c.contype !== 'n')
      expect(kinds.map((c) => c.contype).sort()).toEqual(['c', 'f', 'p'])
      const check = kinds.find((c) => c.contype === 'c')
      expect(String(check?.def)).toContain('cash_float')
      expect(String(check?.def)).toContain(String(CASH_FLOAT_MAX))
      const foreign = kinds.find((c) => c.contype === 'f')
      expect(String(foreign?.def)).toMatch(/REFERENCES hospitals\(id\) ON DELETE CASCADE/)
      await addSetting(A)
      await db.query('delete from public.hospitals where id = $1', [hospital[A]])
      expect(await rows(`select 1 from ${SETTINGS}`)).toEqual([])
    })

    it('AC-1602.4: RLS가 켜져 있고, anon 권한이 없고, authenticated는 표 읽기 + cash_float 넣기·고치기뿐이며 지우기가 없다', () => {
      expect(settings.rls).toEqual([{ relrowsecurity: true, relforcerowsecurity: false }])
      expect(settings.tableGrants).toEqual([{ grantee: 'authenticated', privilege_type: 'SELECT' }])
      expect(settings.columnGrants).toEqual([
        { grantee: 'authenticated', privilege_type: 'INSERT', column_name: 'cash_float' },
        { grantee: 'authenticated', privilege_type: 'SELECT', column_name: 'cash_float' },
        { grantee: 'authenticated', privilege_type: 'SELECT', column_name: 'hospital_id' },
        { grantee: 'authenticated', privilege_type: 'UPDATE', column_name: 'cash_float' },
      ])
      expect(settings.policies).toEqual([
        {
          policyname: '승인된 내 병원 줄만',
          cmd: 'ALL',
          roles: '{authenticated}',
          qual: expect.stringContaining('my_hospital_id()'),
          with_check: expect.stringContaining('my_hospital_id()'),
        },
      ])
      expect(settings.triggers).toEqual([])
    })

    it('AC-1602.4: 승인 사용자는 cash_float만 보낸 upsert(on conflict hospital_id)로 hospital_id 없이 자기 줄을 만들고 고친다', async () => {
      await become(A)
      await db.query(UPSERT_SETTING, [250_000])
      expect(await rows(`select hospital_id, cash_float from ${SETTINGS}`)).toEqual([
        { hospital_id: hospital[A], cash_float: 250_000 },
      ])
      await db.query(UPSERT_SETTING, [0])
      expect(await rows(`select hospital_id, cash_float from ${SETTINGS}`)).toEqual([
        { hospital_id: hospital[A], cash_float: 0 },
      ])
      await db.query(UPSERT_SETTING, [CASH_FLOAT_MAX])
      await db.query(`update ${SETTINGS} set cash_float = 120000`)
      expect(await settingsOf(A)).toEqual([{ cash_float: 120_000 }])
    })

    it.each([-1, CASH_FLOAT_MAX + 1])('AC-1602.4: cash_float %d은 넣기·고치기·upsert 모두 23514로 거부되고 줄은 그대로다', async (value) => {
      await become(A)
      await expect(db.query(UPSERT_SETTING, [value])).rejects.toMatchObject(CHECK_FAILED)
      expect(await settingsOf(A)).toEqual([])
      await become(A)
      await db.query(UPSERT_SETTING, [250_000])
      await expect(db.query(`update ${SETTINGS} set cash_float = $1`, [value])).rejects.toMatchObject(CHECK_FAILED)
      await expect(db.query(UPSERT_SETTING, [value])).rejects.toMatchObject(CHECK_FAILED)
      expect(await settingsOf(A)).toEqual([{ cash_float: 250_000 }])
    })

    it('AC-1602.4: cash_float null은 넣기·고치기·upsert 모두 23502로 거부된다', async () => {
      await become(A)
      await expect(db.query(UPSERT_SETTING, [null])).rejects.toMatchObject(NOT_NULL_FAILED)
      expect(await settingsOf(A)).toEqual([])
      await become(A)
      await db.query(UPSERT_SETTING, [250_000])
      await expect(db.query(`update ${SETTINGS} set cash_float = null`)).rejects.toMatchObject(NOT_NULL_FAILED)
      await expect(db.query(UPSERT_SETTING, [null])).rejects.toMatchObject(NOT_NULL_FAILED)
      expect(await settingsOf(A)).toEqual([{ cash_float: 250_000 }])
    })

    it('AC-1602.4: 승인 사용자도 hospital_id를 직접 넣거나 고치지 못하고 지우기는 42501이며 줄은 그대로다', async () => {
      await become(A)
      await db.query(UPSERT_SETTING, [250_000])
      await expect(
        db.query(`insert into ${SETTINGS} (hospital_id, cash_float) values ($1, 1)`, [hospital[A]]),
      ).rejects.toMatchObject(NO_PERMISSION)
      await expect(
        db.query(`insert into ${SETTINGS} (hospital_id, cash_float) values ($1, 1)`, [hospital[B]]),
      ).rejects.toMatchObject(NO_PERMISSION)
      await expect(db.query(`update ${SETTINGS} set hospital_id = $1`, [hospital[B]])).rejects.toMatchObject(
        NO_PERMISSION,
      )
      await expect(db.query(`delete from ${SETTINGS}`)).rejects.toMatchObject(NO_PERMISSION)
      expect(await settingsOf(A)).toEqual([{ cash_float: 250_000 }])
      expect(await settingsOf(B)).toEqual([])
    })
  })

  describe('AC-1602.5 로그인 안 한 사용자·다른 병원·승인 대기·거절은 새 칸·설정 표에서 막힌다', () => {
    it('AC-1602.5: anon에게는 새 12칸·설정 표 권한이 하나도 없고, 새 칸 권한은 authenticated의 넣기·고치기와 표 읽기뿐이다', async () => {
      const granted = await rows(
        `select grantee, privilege_type, column_name from information_schema.column_privileges
         where table_name = 'worklog_days' and column_name = any($1::text[]) and grantee in ('anon', 'authenticated')
         order by 1, 2, 3`,
        [CASH_COLUMNS],
      )
      const sorted = [...CASH_COLUMNS].sort()
      expect(granted).toEqual(
        ['INSERT', 'SELECT', 'UPDATE'].flatMap((privilege_type) =>
          sorted.map((column_name) => ({ grantee: 'authenticated', privilege_type, column_name })),
        ),
      )
      const table = await rows(
        `select grantee, privilege_type from information_schema.role_table_grants
         where table_name = 'worklog_days' and grantee in ('anon', 'authenticated')`,
      )
      expect(table).toEqual([{ grantee: 'authenticated', privilege_type: 'SELECT' }])
      expect(settings.tableGrants.filter((g) => g.grantee === 'anon')).toEqual([])
      expect(settings.columnGrants.filter((g) => g.grantee === 'anon')).toEqual([])
    })

    it('AC-1602.5: anon은 새 칸·설정 표를 읽기·넣기·upsert·고치기·지우기 모두 42501이고 줄은 그대로다', async () => {
      await addDay(A)
      await addSetting(A)
      await becomeAnon()
      await expect(db.query(`select ${COUNT_5000}, ${FLOAT_COLUMN} from ${TABLE}`)).rejects.toMatchObject(NO_PERMISSION)
      await expect(
        db.query(`insert into ${TABLE} (work_date, ${COUNT_5000}) values ($1, $2)`, ['2020-01-03', 2]),
      ).rejects.toMatchObject(NO_PERMISSION)
      await expect(db.query(upsertOf([COUNT_5000, FLOAT_COLUMN]), [DAY, 2, 300_000])).rejects.toMatchObject(
        NO_PERMISSION,
      )
      await expect(db.query(`update ${TABLE} set ${REASON_COLUMN} = '가상 이유'`)).rejects.toMatchObject(NO_PERMISSION)
      await expect(db.query(`select cash_float from ${SETTINGS}`)).rejects.toMatchObject(NO_PERMISSION)
      await expect(db.query(UPSERT_SETTING, [1])).rejects.toMatchObject(NO_PERMISSION)
      await expect(db.query(`update ${SETTINGS} set cash_float = 1`)).rejects.toMatchObject(NO_PERMISSION)
      await expect(db.query(`delete from ${SETTINGS}`)).rejects.toMatchObject(NO_PERMISSION)
      expect(await cashOf(A)).toMatchObject([{ work_date: DAY, ...CASH_BLANK, total_fee: '100000' }])
      expect(await settingsOf(A)).toEqual([{ cash_float: 250_000 }])
    })

    it('AC-1602.5: 다른 병원 줄의 시재·설정은 안 보이고, 고쳐도 0줄이며, 같은 날 upsert는 내 줄만 만든다', async () => {
      await addDay(B)
      await become(B)
      await db.query(upsertOf([COUNT_5000, FLOAT_COLUMN]), [DAY, 2, 300_000])
      await db.query(UPSERT_SETTING, [250_000])
      await become(A)
      expect(await rows(`select ${CASH_COLUMNS.join(', ')} from ${TABLE}`)).toEqual([])
      expect(await rows(`select cash_float from ${SETTINGS}`)).toEqual([])
      expect(await rows(`select cash_float from ${SETTINGS} where hospital_id = $1`, [hospital[B]])).toEqual([])
      const changedDay = await db.query(`update ${TABLE} set ${COUNT_5000} = 9 where hospital_id = $1`, [hospital[B]])
      expect(changedDay.affectedRows).toBe(0)
      const changedSetting = await db.query(`update ${SETTINGS} set cash_float = 1 where hospital_id = $1`, [
        hospital[B],
      ])
      expect(changedSetting.affectedRows).toBe(0)
      await expect(db.query(`delete from ${SETTINGS} where hospital_id = $1`, [hospital[B]])).rejects.toMatchObject(
        NO_PERMISSION,
      )
      await db.query(upsertOne(COUNT_5000), [DAY, 4])
      await db.query(UPSERT_SETTING, [100_000])
      expect(await cashOf(A)).toMatchObject([{ work_date: DAY, ...CASH_BLANK, [COUNT_5000]: 4, total_fee: null }])
      expect(await settingsOf(A)).toEqual([{ cash_float: 100_000 }])
      expect(await cashOf(B)).toMatchObject([
        { work_date: DAY, ...CASH_BLANK, [COUNT_5000]: 2, [FLOAT_COLUMN]: 300_000, total_fee: '100000' },
      ])
      expect(await settingsOf(B)).toEqual([{ cash_float: 250_000 }])
    })

    it.each([
      { label: '승인 대기', user: C },
      { label: '거절', user: D },
    ])(
      'AC-1602.5: $label 병원 사용자는 새 칸·설정을 읽으면 0줄, 넣기·upsert는 42501, 고쳐도 0줄, 지우기는 42501이고 줄은 그대로다',
      async ({ user }) => {
        await addDay(user)
        await addSetting(user)
        await become(user)
        expect(await rows(`select ${CASH_COLUMNS.join(', ')} from ${TABLE}`)).toEqual([])
        await expect(
          db.query(`insert into ${TABLE} (work_date, ${COUNT_5000}) values ($1, $2)`, ['2020-01-03', 2]),
        ).rejects.toMatchObject(NO_PERMISSION)
        await expect(db.query(upsertOf([COUNT_5000, FLOAT_COLUMN]), [DAY, 2, 300_000])).rejects.toMatchObject(
          NO_PERMISSION,
        )
        const changedDay = await db.query(`update ${TABLE} set ${COUNT_5000} = 2`)
        expect(changedDay.affectedRows).toBe(0)
        expect(await rows(`select cash_float from ${SETTINGS}`)).toEqual([])
        await expect(db.query(UPSERT_SETTING, [1])).rejects.toMatchObject(NO_PERMISSION)
        const changedSetting = await db.query(`update ${SETTINGS} set cash_float = 1`)
        expect(changedSetting.affectedRows).toBe(0)
        await expect(db.query(`delete from ${SETTINGS}`)).rejects.toMatchObject(NO_PERMISSION)
        expect(await cashOf(user)).toEqual([
          {
            work_date: DAY,
            ...CASH_BLANK,
            memo_font_pt: 11,
            bit_fields: [],
            total_fee: '100000',
            cash_in: null,
            memo: null,
          },
        ])
        expect(await settingsOf(user)).toEqual([{ cash_float: 250_000 }])
      },
    )
  })
})

describe('REQ-1602 TASK-2 docs/ARCHITECTURE.md DB 표 목록', () => {
  const lines = () =>
    readFileSync(fileURLToPath(new URL('../docs/ARCHITECTURE.md', import.meta.url)), 'utf-8').split('\n')

  it('REQ-1602 TASK-2: worklog_days 줄 끝에 현금 시재가 더해지고, 바로 아래에 worklog_settings 줄이 있다', () => {
    const all = lines()
    const at = all.findIndex((line) => line.startsWith('| `worklog_days` |'))
    expect(all.filter((line) => line.startsWith('| `worklog_days` |'))).toHaveLength(1)
    expect(all[at]).toBe(
      '| `worklog_days` | 업무일지 하루 한 줄: 인원 2·수입 8·지출 4칸은 글자, 비고 5·업무사항 1·항목 이름 12칸 · 업무사항 글씨 크기 `memo_font_pt`(8·9·10·11·12·14·16pt, 기본 11, specs/worklog-memo-font) · 현금 시재(장수 8칸·그날 시재·환불/미수입금 현금 표시·차이 이유, specs/worklog-cash-float) |',
    )
    expect(all[at + 1]).toBe(
      '| `worklog_settings` | 병원 업무일지 설정 한 줄: 시재 금액 `cash_float`(기본 300,000원) (specs/worklog-cash-float) |',
    )
  })
})

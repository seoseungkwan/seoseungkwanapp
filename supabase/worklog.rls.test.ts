import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

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
const C1_SHARED_FUNCTIONS = `create or replace function public.my_hospital_id() returns uuid language sql stable security definer set search_path = ''
  as $$ select h.id from public.hospitals h where h.owner_id = (select auth.uid()) and h.status = 'approved' $$;
revoke execute on function public.my_hospital_id() from public, anon;
grant execute on function public.my_hospital_id() to authenticated;
create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$ begin new.updated_at = now(); return new; end $$;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;
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
const NOTE_COLUMNS = ['note_cash', 'note_card', 'note_refund', 'note_free', 'note_total']
const VALUE_COLUMNS = [...COUNT_COLUMNS, ...WON_COLUMNS, ...NOTE_COLUMNS]
// 앱이 upsert로 보내는 칸(AC-005.2). hospital_id·updated_at은 없다
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
const LONG_AGO = '2020-01-01T00:00:00Z'
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

function sentValues(date: string, count: number, won: number, note: string) {
  return [date, ...COUNT_COLUMNS.map(() => count), ...WON_COLUMNS.map(() => won), ...NOTE_COLUMNS.map(() => note)]
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

// 운영자가 그 병원 줄을 넣어 둔다(RLS를 건너뛴다). 방아쇠는 고칠 때만 도니 updated_at은 옛 시각 그대로다
async function addDay(user: string, date = DAY) {
  await operator()
  await db.query(
    `insert into ${TABLE} (hospital_id, work_date, total_fee, note_cash, updated_at)
     values ($1, $2, 100000, '가상 비고', $3)`,
    [hospital[user], date, LONG_AGO],
  )
}

// 운영자 눈으로 본 그 병원 줄 전부
async function daysOf(user: string) {
  await operator()
  return rows(
    `select work_date::text as work_date, total_fee, note_cash, new_patients, updated_at
     from ${TABLE} where hospital_id = $1 order by work_date`,
    [hospital[user]],
  )
}

const UNTOUCHED = { work_date: DAY, total_fee: 100000, note_cash: '가상 비고', new_patients: null }

describe('AC-004.8 공용 함수 글자가 다른 갈래와 같다', () => {
  it('공용 함수 줄이 cross-branch C1과 글자까지 같고 맨 앞에 있다', () => {
    const sql = WORKLOG_MIGRATION.replace(/^(--.*\n|\s*\n)+/, '')
    expect(sql.slice(0, C1_SHARED_FUNCTIONS.length)).toBe(C1_SHARED_FUNCTIONS)
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
    if (sharedFirst) await db.exec(C1_SHARED_FUNCTIONS)
    await db.exec(WORKLOG_MIGRATION)
  }, 30_000)

  afterAll(async () => {
    await db.close()
  })

  // 시험마다 빈 표에서 시작한다. A·B는 승인, C는 대기, D는 거절
  beforeEach(async () => {
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
  })

  describe('AC-004.1 표 칸이 정해 둔 목록과 정확히 같다', () => {
    it('칸 이름·종류·순서·빈 칸 허용이 목록과 같다', async () => {
      const columns = await rows(
        `select column_name, data_type, is_nullable from information_schema.columns
         where table_schema = 'public' and table_name = 'worklog_days' order by ordinal_position`,
      )
      expect(columns).toEqual([
        { column_name: 'hospital_id', data_type: 'uuid', is_nullable: 'NO' },
        { column_name: 'work_date', data_type: 'date', is_nullable: 'NO' },
        ...COUNT_COLUMNS.map((column_name) => ({ column_name, data_type: 'integer', is_nullable: 'YES' })),
        ...WON_COLUMNS.map((column_name) => ({ column_name, data_type: 'bigint', is_nullable: 'YES' })),
        ...NOTE_COLUMNS.map((column_name) => ({ column_name, data_type: 'text', is_nullable: 'YES' })),
        { column_name: 'updated_at', data_type: 'timestamp with time zone', is_nullable: 'NO' },
      ])
      expect(VALUE_COLUMNS).toHaveLength(19)
    })

    it('업무사항 칸이 없다', async () => {
      const memo = await rows(
        `select column_name from information_schema.columns
         where table_name = 'worklog_days' and column_name ~* '(memo|work_note|업무)'`,
      )
      expect(memo).toEqual([])
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
      await expect(db.query(INSERT_SOME, ['2020-01-03', 200000, '가상'])).rejects.toMatchObject(NO_PERMISSION)
      await expect(db.query(UPSERT_SOME, [DAY, 200000, '가상'])).rejects.toMatchObject(NO_PERMISSION)
      await expect(db.query(`update ${TABLE} set total_fee = 1`)).rejects.toMatchObject(NO_PERMISSION)
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
      await db.query(INSERT_SOME, [DAY, 100000, '가상 비고'])
      const found = await rows(`select hospital_id, work_date::text as work_date, total_fee, note_cash from ${TABLE}`)
      expect(found).toEqual([{ hospital_id: hospital[A], work_date: DAY, total_fee: 100000, note_cash: '가상 비고' }])
    })

    it('같은 날 upsert는 보낸 칸만 고치고, 보내지 않은 칸은 그대로다', async () => {
      await become(A)
      await db.query(`insert into ${TABLE} (work_date, new_patients, total_fee) values ($1, 10, 100000)`, [DAY])
      await db.query(UPSERT_SOME, [DAY, 200000, '가상 비고'])
      const found = await rows(`select hospital_id, new_patients, total_fee, note_cash from ${TABLE}`)
      expect(found).toEqual([{ hospital_id: hospital[A], new_patients: 10, total_fee: 200000, note_cash: '가상 비고' }])
    })

    it('앱이 보내는 모양(work_date + 값 19칸) upsert가 넣기와 고치기 모두 된다', async () => {
      await become(A)
      await db.query(UPSERT_ALL, sentValues(DAY, 10, 100000, '가상 비고'))
      await db.query(UPSERT_ALL, sentValues(DAY, 20, 200000, '가상 다른 비고'))
      const found = await rows(`select * from ${TABLE}`)
      expect(found).toHaveLength(1)
      expect(found[0]).toMatchObject({
        hospital_id: hospital[A],
        new_patients: 20,
        return_patients: 20,
        total_fee: 200000,
        spend_free: 200000,
        note_cash: '가상 다른 비고',
        note_total: '가상 다른 비고',
      })
    })

    it('날짜가 다르면 줄이 따로 생긴다', async () => {
      await become(A)
      await db.query(UPSERT_SOME, ['2020-01-02', 100000, '가상'])
      await db.query(UPSERT_SOME, ['2020-01-03', 200000, '가상'])
      expect(await daysOf(A)).toMatchObject([
        { work_date: '2020-01-02', total_fee: 100000 },
        { work_date: '2020-01-03', total_fee: 200000 },
      ])
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
      const changed = await db.query(`update ${TABLE} set total_fee = 1 where hospital_id = $1`, [hospital[B]])
      expect(changed.affectedRows).toBe(0)
      expect(await daysOf(B)).toMatchObject([UNTOUCHED])
    })

    it('같은 날 upsert는 내 줄만 만들고 다른 병원 줄은 그대로다', async () => {
      await addDay(B)
      await become(A)
      await db.query(UPSERT_SOME, [DAY, 200000, '가상'])
      expect(await daysOf(A)).toMatchObject([{ work_date: DAY, total_fee: 200000 }])
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
      const changed = await db.query(`update ${TABLE} set total_fee = 1`)
      expect(changed.affectedRows).toBe(0)
      expect(await daysOf(user)).toMatchObject([UNTOUCHED])
      expect(await daysOf(A)).toMatchObject([UNTOUCHED])
    })

    it('넣기와 upsert는 42501로 거부된다', async () => {
      await become(user)
      await expect(db.query(INSERT_SOME, [DAY, 100000, '가상'])).rejects.toMatchObject(NO_PERMISSION)
      await expect(db.query(UPSERT_SOME, [DAY, 100000, '가상'])).rejects.toMatchObject(NO_PERMISSION)
      await expect(db.query(UPSERT_ALL, sentValues(DAY, 10, 100000, '가상'))).rejects.toMatchObject(NO_PERMISSION)
      expect(await daysOf(user)).toEqual([])
    })
  })

  describe('AC-004.6 값 제약', () => {
    type Case = [column: string, label: string, value: unknown]
    const cases = (columns: string[], values: [string, unknown][]) =>
      columns.flatMap((column) => values.map(([label, value]): Case => [column, label, value]))

    const REJECTED = [
      ...cases(COUNT_COLUMNS, [
        ['음수', -1],
        ['99,999 초과', 100_000],
      ]),
      ...cases(WON_COLUMNS, [
        ['음수', -1],
        ['999,999,999,999 초과', 1_000_000_000_000],
      ]),
      ...cases(NOTE_COLUMNS, [
        ['빈 글자', ''],
        ['101자', '가'.repeat(101)],
      ]),
    ]
    const ACCEPTED = [
      ...cases(COUNT_COLUMNS, [
        ['0', 0],
        ['99,999', 99_999],
        ['null', null],
      ]),
      ...cases(WON_COLUMNS, [
        ['0', 0],
        ['999,999,999,999', 999_999_999_999],
        ['null', null],
      ]),
      ...cases(NOTE_COLUMNS, [
        ['한 글자', '가'],
        ['100자', '가'.repeat(100)],
        ['null', null],
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
      await expect(db.query(`update ${TABLE} set total_fee = -1`)).rejects.toMatchObject(CHECK_FAILED)
      await expect(db.query(`update ${TABLE} set note_cash = ''`)).rejects.toMatchObject(CHECK_FAILED)
      expect(await daysOf(A)).toMatchObject([UNTOUCHED])
    })
  })

  describe('AC-004.7 지우기·updated_at 직접 넣기 거부, 고치면 updated_at이 바뀐다', () => {
    it('authenticated의 넣기·고치기 권한은 work_date와 값 19칸뿐이고 지우기 권한은 없다', async () => {
      const allowed = async (privilege: string) =>
        (
          await rows(
            `select column_name from information_schema.column_privileges
             where grantee = 'authenticated' and table_name = 'worklog_days' and privilege_type = $1`,
            [privilege],
          )
        )
          .map((r) => r.column_name)
          .sort()
      expect(await allowed('INSERT')).toEqual([...SENT_COLUMNS].sort())
      expect(await allowed('UPDATE')).toEqual([...SENT_COLUMNS].sort())
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

    it('updated_at을 직접 넣거나 고치면 42501이다', async () => {
      await addDay(A)
      await become(A)
      await expect(
        db.query(`insert into ${TABLE} (work_date, updated_at) values ($1, $2)`, ['2020-01-03', LONG_AGO]),
      ).rejects.toMatchObject(NO_PERMISSION)
      await expect(db.query(`update ${TABLE} set updated_at = $1`, [LONG_AGO])).rejects.toMatchObject(NO_PERMISSION)
      await expect(
        db.query(
          `insert into ${TABLE} (work_date, total_fee) values ($1, 1)
           on conflict (hospital_id, work_date) do update set updated_at = excluded.updated_at`,
          [DAY],
        ),
      ).rejects.toMatchObject(NO_PERMISSION)
    })

    it('update로 고치면 updated_at이 새 시각으로 바뀐다', async () => {
      await addDay(A)
      await become(A)
      await db.query(`update ${TABLE} set total_fee = 200000`)
      const [day] = await daysOf(A)
      expect((day.updated_at as Date).getTime()).toBeGreaterThan(new Date(LONG_AGO).getTime())
    })

    it('upsert로 고쳐도 updated_at이 새 시각으로 바뀐다', async () => {
      await addDay(A)
      await become(A)
      await db.query(UPSERT_SOME, [DAY, 200000, '가상'])
      const [day] = await daysOf(A)
      expect((day.updated_at as Date).getTime()).toBeGreaterThan(new Date(LONG_AGO).getTime())
    })

    it('방아쇠는 고칠 때 도는 공용 touch_updated_at() 하나다', async () => {
      const triggers = await rows(
        `select t.tgname, p.proname from pg_trigger t join pg_proc p on p.oid = t.tgfoid
         where t.tgrelid = $1::regclass and not t.tgisinternal`,
        [TABLE],
      )
      expect(triggers).toEqual([{ tgname: 'worklog_days_updated_at', proname: 'touch_updated_at' }])
    })

    it('방아쇠 함수를 직접 실행하면 로그인 사용자도 anon도 42501이다', async () => {
      await become(A)
      await expect(db.query('select public.touch_updated_at()')).rejects.toMatchObject(NO_PERMISSION)
      await becomeAnon()
      await expect(db.query('select public.touch_updated_at()')).rejects.toMatchObject(NO_PERMISSION)
    })

    it('공용 함수 실행 권한: my_hospital_id는 authenticated만, touch_updated_at은 아무도 없다', async () => {
      const grantees = async (fn: string) =>
        rows(
          `select coalesce(nullif(a.grantee, 0)::regrole::text, 'PUBLIC') as grantee
           from pg_proc p, aclexplode(p.proacl) a
           where p.oid = $1::regprocedure and a.grantee <> p.proowner and a.privilege_type = 'EXECUTE'`,
          [fn],
        )
      expect(await grantees('public.my_hospital_id()')).toEqual([{ grantee: 'authenticated' }])
      expect(await grantees('public.touch_updated_at()')).toEqual([])
    })

    it('security definer 함수는 auth의 승인 함수와 my_hospital_id뿐이다', async () => {
      const definers = await rows(
        `select proname from pg_proc
         where pronamespace = 'public'::regnamespace and prosecdef order by proname`,
      )
      expect(definers).toEqual([{ proname: 'my_hospital_id' }, { proname: 'set_hospital_status' }])
    })
  })
})

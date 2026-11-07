import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

// 날짜별 완료 표시 표 claim_day_closes의 칸·RLS·권한 (claim-day-done REQ-2805, design.md 'DB').
// precheck.rls.test.ts와 같은 방법: 진짜 Postgres(PGlite)에서 운영자가 붙일 마이그레이션 파일을 차례로 그대로 돌린다
// (auth → precheck_settings → precheck_counts → 이 파일). Supabase가 미리 갖춘 것만 아래에서 흉내 낸다
const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf-8')
const AUTH_MIGRATION = read('./migrations/20261028000000_auth.sql')
const SETTINGS_MIGRATION = read('./migrations/20261030000000_precheck_settings.sql')
const COUNTS_MIGRATION = read('./migrations/20261030000100_precheck_counts.sql')
const CLOSES_MIGRATION = read('./migrations/20261108000000_claim_day_closes.sql')

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

const A = '00000000-0000-4000-8000-00000000000a'
const B = '00000000-0000-4000-8000-00000000000b'
const C = '00000000-0000-4000-8000-00000000000c'
const D = '00000000-0000-4000-8000-00000000000d'
const E = '00000000-0000-4000-8000-00000000000e' // 병원 줄이 없는 사용자
const USERS = [A, B, C, D, E]
const emailOf = (user: string) => `${user.slice(-1)}@fake.test`

type Status = 'pending' | 'approved' | 'rejected'

const TABLE = 'public.claim_day_closes'
// 지어낸 날짜·시각
const DAY = '2026-09-28'
const DAY2 = '2026-09-29'
const DAY3 = '2026-10-05'
const OLD = '2020-01-01T00:00:00Z'
const CLOSE = `insert into ${TABLE} (visit_date) values ($1)`

// PGlite 첫 실행(WASM 불러오기)이 느린 PC·CI에서도 흔들리지 않게
const SLOW = { timeout: 30_000 }
const DENIED = /permission denied/
// 승인 안 됐으면 hospital_id 기본값이 null이고, 정책 with check가 not null 제약보다 먼저 거부한다
const RLS_REJECTED = /row-level security/

let db: PGlite

async function migrate(target: PGlite) {
  await target.exec(SUPABASE_MOCK)
  await target.exec(AUTH_MIGRATION)
  await target.exec(SETTINGS_MIGRATION)
  await target.exec(COUNTS_MIGRATION)
  await target.exec(CLOSES_MIGRATION)
}

beforeAll(async () => {
  db = await PGlite.create()
  await migrate(db)
}, 120_000)

// 시험마다 빈 표에서 시작한다(병원·완료 표시 줄은 auth.users를 따라 함께 비워진다). 운영자(superuser)는 RLS를 건너뛴다
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

async function rows(sql: string, params: unknown[] = [], target: PGlite = db) {
  return (await target.query<Record<string, unknown>>(sql, params)).rows
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

/** 운영자가 그 병원의 완료 표시 줄을 넣는다(RLS·칸 권한을 건너뛴다) */
async function seedClose(hospital: string, day: string, closedAt = OLD) {
  await operator()
  await db.query(`insert into ${TABLE} (hospital_id, visit_date, closed_at) values ($1, $2, $3)`, [hospital, day, closedAt])
}

/** 운영자가 보는 완료 표시 줄 전체(병원·날짜 차례) */
async function allCloses() {
  await operator()
  return rows(
    `select hospital_id, visit_date::text as day, closed_at = $1::timestamptz as old
     from ${TABLE} order by hospital_id, visit_date`,
    [OLD],
  )
}

describe('AC-2805.1 표 모양', SLOW, () => {
  it('AC-2805.1: 칸은 hospital_id(uuid)·visit_date(date)·closed_at(timestamptz) 셋뿐이고 모두 비울 수 없다. 글자 칸이 없다', async () => {
    const found = await rows(
      `select column_name, data_type, is_nullable from information_schema.columns
       where table_schema = 'public' and table_name = 'claim_day_closes' order by ordinal_position`,
    )
    expect(found).toEqual([
      { column_name: 'hospital_id', data_type: 'uuid', is_nullable: 'NO' },
      { column_name: 'visit_date', data_type: 'date', is_nullable: 'NO' },
      { column_name: 'closed_at', data_type: 'timestamp with time zone', is_nullable: 'NO' },
    ])
  })

  it('AC-2805.1: hospital_id 기본값은 my_hospital_id(), closed_at 기본값은 now(), visit_date는 기본값이 없다', async () => {
    const found = await rows(
      `select column_name, column_default from information_schema.columns
       where table_schema = 'public' and table_name = 'claim_day_closes' order by ordinal_position`,
    )
    expect(found).toEqual([
      { column_name: 'hospital_id', column_default: expect.stringMatching(/^(public\.)?my_hospital_id\(\)$/) },
      { column_name: 'visit_date', column_default: null },
      { column_name: 'closed_at', column_default: 'now()' },
    ])
  })

  it('AC-2805.1: (hospital_id, visit_date)가 기본 키이고, 바깥 키는 병원 표 하나이며 병원을 지우면 함께 지운다', async () => {
    // PG18은 not null도 pg_constraint에 따로 적는다(contype 'n') → 기본 키·바깥 키·유일·검사만 본다
    const found = await rows(
      `select contype, pg_get_constraintdef(oid) as def, confdeltype from pg_constraint
       where conrelid = to_regclass('public.claim_day_closes') and contype in ('p', 'f', 'u', 'c')
       order by contype`,
    )
    expect(found).toEqual([
      {
        contype: 'f',
        def: expect.stringMatching(/^FOREIGN KEY \(hospital_id\) REFERENCES (public\.)?hospitals\(id\) ON DELETE CASCADE$/),
        confdeltype: 'c',
      },
      { contype: 'p', def: 'PRIMARY KEY (hospital_id, visit_date)', confdeltype: ' ' },
    ])
  })

  it('AC-2805.1: 같은 병원 같은 날짜 두 줄은 거부되고, 다른 병원은 같은 날짜를 가질 수 있다', async () => {
    const mine = await addHospital(A, 'approved')
    const other = await addHospital(B, 'approved')
    await seedClose(mine, DAY)
    await expect(seedClose(mine, DAY)).rejects.toThrow(/duplicate key/)
    await seedClose(other, DAY)
    expect(await allCloses()).toHaveLength(2)
  })

  it('AC-2805.1: 병원 줄을 지우면 그 병원의 완료 표시도 함께 지워진다', async () => {
    const mine = await addHospital(A, 'approved')
    const other = await addHospital(B, 'approved')
    await seedClose(mine, DAY)
    await seedClose(other, DAY)
    await operator()
    await db.query('delete from public.hospitals where id = $1', [mine])
    expect(await allCloses()).toEqual([{ hospital_id: other, day: DAY, old: true }])
  })

  it('AC-2805.1: RLS가 켜져 있다', async () => {
    expect(await rows(`select relrowsecurity from pg_class where oid = to_regclass('public.claim_day_closes')`)).toEqual([
      { relrowsecurity: true },
    ])
  })
})

describe('AC-2805.2 로그인 안 한 사용자(anon)', SLOW, () => {
  it('AC-2805.2: anon에게 준 표·칸 권한이 하나도 없다(기본 권한을 먼저 거뒀다)', async () => {
    expect(await rows(`select 1 from pg_class where oid = to_regclass('public.claim_day_closes')`)).toHaveLength(1)
    const tables = await rows(
      `select privilege_type from information_schema.role_table_grants
       where grantee = 'anon' and table_schema = 'public' and table_name = 'claim_day_closes'`,
    )
    expect(tables).toEqual([])
    const columns = await rows(
      `select column_name from information_schema.column_privileges
       where grantee = 'anon' and table_schema = 'public' and table_name = 'claim_day_closes'`,
    )
    expect(columns).toEqual([])
  })

  it('AC-2805.2: anon은 읽기·넣기·지우기·고치기가 모두 거부되고 줄은 그대로다', async () => {
    await seedClose(await addHospital(A, 'approved'), DAY)
    await becomeAnon()
    await expect(db.query(`select * from ${TABLE}`)).rejects.toThrow(DENIED)
    await expect(db.query(CLOSE, [DAY2])).rejects.toThrow(DENIED)
    await expect(db.query(`insert into ${TABLE} (visit_date) values ($1) on conflict do nothing`, [DAY2])).rejects.toThrow(DENIED)
    await expect(db.query(`delete from ${TABLE}`)).rejects.toThrow(DENIED)
    await expect(db.query(`update ${TABLE} set visit_date = $1`, [DAY3])).rejects.toThrow(DENIED)
    expect(await allCloses()).toEqual([{ hospital_id: expect.any(String), day: DAY, old: true }])
  })
})

describe('AC-2805.3 승인된 병원은 자기 병원 줄만', SLOW, () => {
  it('AC-2805.3: hospital_id 없이 visit_date만 넣으면 DB 기본값으로 내 병원과 지금 시각이 들어간다', async () => {
    const mine = await addHospital(A, 'approved')
    await become(A)
    const [row] = await rows(`${CLOSE} returning hospital_id, visit_date::text as day, closed_at > $2::timestamptz as fresh`, [
      DAY,
      OLD,
    ])
    expect(row).toEqual({ hospital_id: mine, day: DAY, fresh: true })
  })

  it('AC-2805.3: 내 병원 줄만 보이고 남의 병원 줄은 안 보인다', async () => {
    const mine = await addHospital(A, 'approved')
    const other = await addHospital(B, 'approved')
    await seedClose(mine, DAY)
    await seedClose(other, DAY2)
    await become(A)
    expect(await rows(`select hospital_id, visit_date::text as day from ${TABLE}`)).toEqual([{ hospital_id: mine, day: DAY }])
    await become(B)
    expect(await rows(`select hospital_id, visit_date::text as day from ${TABLE}`)).toEqual([{ hospital_id: other, day: DAY2 }])
  })

  it('AC-2805.3: 내 병원 줄은 지우고, 남의 병원 줄은 같은 날짜여도 조건 없이 지워도 지워지지 않는다', async () => {
    const mine = await addHospital(A, 'approved')
    const other = await addHospital(B, 'approved')
    await seedClose(mine, DAY)
    await seedClose(mine, DAY2)
    await seedClose(other, DAY)
    await seedClose(other, DAY3)
    await become(A)
    // 되돌리기 모양: 날짜로 지운다
    expect((await db.query(`delete from ${TABLE} where visit_date = any($1::date[])`, [[DAY]])).affectedRows).toBe(1)
    expect((await db.query(`delete from ${TABLE} where hospital_id = $1`, [other])).affectedRows).toBe(0)
    expect((await db.query(`delete from ${TABLE} where visit_date = $1`, [DAY3])).affectedRows).toBe(0)
    expect((await db.query(`delete from ${TABLE}`)).affectedRows).toBe(1)
    expect(await allCloses()).toEqual([
      { hospital_id: other, day: DAY, old: true },
      { hospital_id: other, day: DAY3, old: true },
    ])
  })

  it.each<[string, string, Status | null]>([
    ['승인 대기', C, 'pending'],
    ['거절', D, 'rejected'],
    ['병원 줄 없음', E, null],
  ])('AC-2805.3: %s인 사용자는 아무 줄도 보지 못하고 넣지 못하며 지워도 바뀌는 줄이 없다', async (_name, user, status) => {
    const own = status ? await addHospital(user, status) : null
    const other = await addHospital(B, 'approved')
    if (own) await seedClose(own, DAY)
    await seedClose(other, DAY)
    await become(user)
    expect(await rows(`select * from ${TABLE}`)).toEqual([])
    await expect(db.query(CLOSE, [DAY2])).rejects.toThrow(RLS_REJECTED)
    await expect(
      db.query(`insert into ${TABLE} (visit_date) values ($1) on conflict (hospital_id, visit_date) do nothing`, [DAY2]),
    ).rejects.toThrow(RLS_REJECTED)
    expect((await db.query(`delete from ${TABLE}`)).affectedRows).toBe(0)
    expect(await allCloses()).toHaveLength(own ? 2 : 1)
  })

  it('AC-2805.3: 승인됐던 병원이 거절되면 그 순간부터 자기 줄도 안 보이고 넣지 못한다', async () => {
    const id = await addHospital(A, 'approved')
    await seedClose(id, DAY)
    await become(A)
    expect(await rows(`select visit_date::text as day from ${TABLE}`)).toEqual([{ day: DAY }])
    await operator()
    await db.query(`update public.hospitals set status = 'rejected' where id = $1`, [id])
    await become(A)
    expect(await rows(`select * from ${TABLE}`)).toEqual([])
    await expect(db.query(CLOSE, [DAY2])).rejects.toThrow(RLS_REJECTED)
  })
})

describe('AC-2805.4 넣기는 visit_date 칸만, 고치기 권한 없음', SLOW, () => {
  it('AC-2805.4: authenticated의 표 전체 권한은 select·delete뿐이다(insert·update·all을 주지 않았다)', async () => {
    const grants = await rows(
      `select privilege_type from information_schema.role_table_grants
       where grantee = 'authenticated' and table_schema = 'public' and table_name = 'claim_day_closes'
       order by privilege_type`,
    )
    expect(grants).toEqual([{ privilege_type: 'DELETE' }, { privilege_type: 'SELECT' }])
  })

  it('AC-2805.4: 칸 단위 넣기 권한은 visit_date 하나이고 고치기 권한은 어느 칸에도 없다', async () => {
    const found = await rows(
      `select column_name, privilege_type from information_schema.column_privileges
       where grantee = 'authenticated' and table_schema = 'public' and table_name = 'claim_day_closes'
         and privilege_type in ('INSERT', 'UPDATE')
       order by privilege_type, column_name`,
    )
    expect(found).toEqual([{ column_name: 'visit_date', privilege_type: 'INSERT' }])
  })

  it('AC-2805.4: hospital_id를 직접 넣으면 내 병원이어도 남의 병원이어도 거부된다', async () => {
    const mine = await addHospital(A, 'approved')
    const other = await addHospital(B, 'approved')
    await become(A)
    const sql = `insert into ${TABLE} (hospital_id, visit_date) values ($1, $2)`
    await expect(db.query(sql, [mine, DAY])).rejects.toThrow(DENIED)
    await expect(db.query(sql, [other, DAY])).rejects.toThrow(DENIED)
    expect(await allCloses()).toEqual([])
  })

  it('AC-2805.4: closed_at을 직접 넣으면 거부된다(시각은 DB가 정한다)', async () => {
    await addHospital(A, 'approved')
    await become(A)
    await expect(db.query(`insert into ${TABLE} (visit_date, closed_at) values ($1, $2)`, [DAY, OLD])).rejects.toThrow(DENIED)
    expect(await allCloses()).toEqual([])
  })

  it('AC-2805.4: 내 줄의 visit_date·closed_at·hospital_id를 고치면 거부되고 줄은 그대로다', async () => {
    const mine = await addHospital(A, 'approved')
    const other = await addHospital(B, 'approved')
    await seedClose(mine, DAY)
    await become(A)
    await expect(db.query(`update ${TABLE} set visit_date = $1`, [DAY2])).rejects.toThrow(DENIED)
    await expect(db.query(`update ${TABLE} set closed_at = now()`)).rejects.toThrow(DENIED)
    await expect(db.query(`update ${TABLE} set hospital_id = $1`, [other])).rejects.toThrow(DENIED)
    expect(await allCloses()).toEqual([{ hospital_id: mine, day: DAY, old: true }])
  })

  it('AC-2805.4: 고치는 upsert(on conflict do update)는 거부된다 — 처음 시각을 덮어쓸 길이 없다', async () => {
    const mine = await addHospital(A, 'approved')
    await seedClose(mine, DAY)
    await become(A)
    await expect(
      db.query(
        `insert into ${TABLE} (visit_date) values ($1) on conflict (hospital_id, visit_date) do update set visit_date = excluded.visit_date`,
        [DAY],
      ),
    ).rejects.toThrow(DENIED)
    expect(await allCloses()).toEqual([{ hospital_id: mine, day: DAY, old: true }])
  })
})

describe('AC-2805.5 이미 있는 날을 다시 넣기(on conflict do nothing)', SLOW, () => {
  it('AC-2805.5: 같은 날을 on conflict do nothing으로 두 번 넣어도 오류 없이 줄 하나와 처음 closed_at이 남는다', async () => {
    const mine = await addHospital(A, 'approved')
    await become(A)
    const sql = `insert into ${TABLE} (visit_date) values ($1) on conflict do nothing`
    await db.query(sql, [DAY])
    const [first] = await rows(`select closed_at::text as at from ${TABLE}`)
    expect((await db.query(sql, [DAY])).affectedRows).toBe(0)
    expect(await rows(`select hospital_id, visit_date::text as day, closed_at::text as at from ${TABLE}`)).toEqual([
      { hospital_id: mine, day: DAY, at: first.at },
    ])
  })

  it('AC-2805.5: 이미 있는 날과 새 날을 한 번에 넣으면 새 날만 들어가고 이미 있던 날의 시각은 그대로다', async () => {
    const mine = await addHospital(A, 'approved')
    await seedClose(mine, DAY)
    await become(A)
    const result = await db.query(
      `insert into ${TABLE} (visit_date) values ($1), ($2) on conflict (hospital_id, visit_date) do nothing`,
      [DAY, DAY2],
    )
    expect(result.affectedRows).toBe(1)
    expect(await allCloses()).toEqual([
      { hospital_id: mine, day: DAY, old: true },
      { hospital_id: mine, day: DAY2, old: false },
    ])
  })

  it('AC-2805.5: PostgREST가 보내는 ignoreDuplicates upsert 모양(json 줄 + on conflict do nothing)이 내 권한으로 돈다', async () => {
    const mine = await addHospital(A, 'approved')
    await seedClose(mine, DAY)
    await become(A)
    const upsert = (days: string[]) =>
      db.query(
        `insert into ${TABLE} (visit_date)
         select pgrst_body.visit_date
         from (select $1::json as json_data) pgrst_payload,
         lateral (select visit_date from json_populate_recordset(null::${TABLE}, pgrst_payload.json_data) as _) pgrst_body
         on conflict (hospital_id, visit_date) do nothing`,
        [JSON.stringify(days.map((visit_date) => ({ visit_date })))],
      )
    await upsert([DAY, DAY2])
    await upsert([DAY2])
    expect(await allCloses()).toEqual([
      { hospital_id: mine, day: DAY, old: true },
      { hospital_id: mine, day: DAY2, old: false },
    ])
  })

  it('AC-2805.5: 남의 병원에 같은 날이 있어도 내 병원 줄이 새로 생기고 남의 줄은 그대로다', async () => {
    const mine = await addHospital(A, 'approved')
    const other = await addHospital(B, 'approved')
    await seedClose(other, DAY)
    await become(A)
    expect((await db.query(`insert into ${TABLE} (visit_date) values ($1) on conflict do nothing`, [DAY])).affectedRows).toBe(1)
    const found = await allCloses()
    expect(found).toHaveLength(2)
    expect(found).toContainEqual({ hospital_id: other, day: DAY, old: true })
    expect(found).toContainEqual({ hospital_id: mine, day: DAY, old: false })
  })
})

describe('AC-2805.6 건수 표와 서로 묶이지 않는다', SLOW, () => {
  /** 운영자가 그 병원의 날짜별 건수 줄을 넣는다 */
  async function seedDayCount(hospital: string, day: string) {
    await operator()
    await db.query(
      `insert into public.claim_day_counts (hospital_id, visit_date, visits, need_memo, entered, needs_check, skipped, updated_at)
       values ($1, $2, 53, 53, 32, 0, 0, $3)`,
      [hospital, day, OLD],
    )
  }

  async function dayCounts() {
    await operator()
    return rows(
      `select visit_date::text as day, need_memo, entered, updated_at = $1::timestamptz as old from public.claim_day_counts order by visit_date`,
      [OLD],
    )
  }

  it('AC-2805.6: 같은 병원·날짜의 건수를 다시 올려도(upsert) 완료 표시 줄과 그 시각은 그대로다', async () => {
    const mine = await addHospital(A, 'approved')
    await seedDayCount(mine, DAY)
    await seedClose(mine, DAY)
    await become(A)
    // 건수 올리기(PostgREST upsert) 모양
    await db.query(
      `insert into public.claim_day_counts (visit_date, visits, need_memo, entered, needs_check, skipped)
       values ($1, 54, 54, 40, 0, 0)
       on conflict (hospital_id, visit_date) do update
       set visit_date = excluded.visit_date, visits = excluded.visits, need_memo = excluded.need_memo,
           entered = excluded.entered, needs_check = excluded.needs_check, skipped = excluded.skipped`,
      [DAY],
    )
    expect(await dayCounts()).toEqual([{ day: DAY, need_memo: 54, entered: 40, old: false }])
    expect(await allCloses()).toEqual([{ hospital_id: mine, day: DAY, old: true }])
  })

  it('AC-2805.6: 건수 줄이 없는 날도 완료로 넣고 지울 수 있고, 건수 표에는 줄이 생기지 않는다', async () => {
    const mine = await addHospital(A, 'approved')
    await become(A)
    await db.query(CLOSE, [DAY3])
    expect(await allCloses()).toEqual([{ hospital_id: mine, day: DAY3, old: false }])
    expect(await dayCounts()).toEqual([])
    await become(A)
    expect((await db.query(`delete from ${TABLE} where visit_date = $1`, [DAY3])).affectedRows).toBe(1)
    expect(await allCloses()).toEqual([])
    expect(await dayCounts()).toEqual([])
  })

  it('AC-2805.6: 완료로 넣거나 되돌려도(지워도) 같은 날 건수 줄의 숫자·바뀐 시각은 그대로다', async () => {
    const mine = await addHospital(A, 'approved')
    await seedDayCount(mine, DAY)
    await become(A)
    await db.query(CLOSE, [DAY])
    expect(await dayCounts()).toEqual([{ day: DAY, need_memo: 53, entered: 32, old: true }])
    await become(A)
    await db.query(`delete from ${TABLE} where visit_date = $1`, [DAY])
    expect(await dayCounts()).toEqual([{ day: DAY, need_memo: 53, entered: 32, old: true }])
  })

  it('AC-2805.6: 완료 표시 표에는 트리거가 없고, 건수 표를 가리키는 바깥 키도 없다', async () => {
    expect(await rows(`select 1 from pg_class where oid = to_regclass('public.claim_day_closes')`)).toHaveLength(1)
    const triggers = await rows(
      `select tgname from pg_trigger where not tgisinternal and tgrelid = to_regclass('public.claim_day_closes')`,
    )
    expect(triggers).toEqual([])
    const links = await rows(
      `select conrelid::regclass::text as from_table, confrelid::regclass::text as to_table from pg_constraint
       where contype = 'f' and (
         (conrelid = to_regclass('public.claim_day_closes') and confrelid <> to_regclass('public.hospitals'))
         or confrelid = to_regclass('public.claim_day_closes'))`,
    )
    expect(links).toEqual([])
  })
})

// 표 하나의 칸·제약·표와 칸 권한·RLS·정책·트리거
async function tableShape(target: PGlite) {
  const q = (sql: string) => rows(sql, [], target)
  const columns = await q(
    `select column_name, data_type, is_nullable, column_default from information_schema.columns
     where table_schema = 'public' and table_name = 'claim_day_closes' order by ordinal_position`,
  )
  const constraints = await q(
    `select conname, contype, pg_get_constraintdef(oid) as def from pg_constraint
     where conrelid = to_regclass('public.claim_day_closes') order by conname`,
  )
  const access = await q(
    `select c.relrowsecurity, c.relforcerowsecurity,
            (select array_agg(item::text order by item::text) from unnest(c.relacl) item) as table_acl,
            (select array_agg(a.attname || ':' || item::text order by a.attname, item::text)
             from pg_attribute a, unnest(a.attacl) item where a.attrelid = c.oid) as column_acl
     from pg_class c where c.oid = to_regclass('public.claim_day_closes')`,
  )
  const policies = await q(
    `select policyname, cmd, roles::text[] as roles, qual, with_check from pg_policies
     where schemaname = 'public' and tablename = 'claim_day_closes' order by policyname`,
  )
  const triggers = await q(`select tgname from pg_trigger where not tgisinternal and tgrelid = to_regclass('public.claim_day_closes')`)
  return { columns, constraints, access, policies, triggers }
}

describe('AC-2805.7 두 번 붙여 넣어도 그대로', SLOW, () => {
  it('AC-2805.7: 두 번 돌려도 되는 문장만 쓴다(표는 if not exists, 정책은 지우고 다시 만들기, 함수·트리거는 만들지 않는다)', () => {
    const sql = CLOSES_MIGRATION.replace(/--.*$/gm, '') // 주석을 뺀 SQL만 본다
    const count = (pattern: RegExp) => (sql.match(pattern) ?? []).length
    expect(count(/create\s+table\s+if\s+not\s+exists\s+public\.claim_day_closes\b/gi)).toBe(1)
    expect(sql).not.toMatch(/create\s+table\s+(?!if\s+not\s+exists)/i)
    expect(sql).not.toMatch(/create\s+(or\s+replace\s+)?function/i)
    expect(sql).not.toMatch(/create\s+trigger/i)
    expect(count(/create\s+policy/gi)).toBe(1)
    expect(count(/drop\s+policy\s+if\s+exists/gi)).toBe(1)
  })

  it('AC-2805.7: 같은 DB에 두 번 돌려도 오류 없이 칸·제약·권한·RLS·정책과 이미 있던 줄이 그대로다', async () => {
    const fresh = await PGlite.create()
    try {
      await migrate(fresh)
      const once = await tableShape(fresh)
      expect(once.columns).toHaveLength(3)
      expect(once.policies).toEqual([
        {
          policyname: '승인된 내 병원 줄만',
          cmd: 'ALL',
          roles: ['authenticated'],
          qual: expect.stringMatching(/my_hospital_id\(\)/),
          with_check: expect.stringMatching(/my_hospital_id\(\)/),
        },
      ])
      await fresh.query('insert into auth.users (id, email) values ($1, $2)', [A, emailOf(A)])
      const [hospital] = await rows(
        `insert into public.hospitals (owner_id, name, applicant_name, email, status)
         values ($1, '가짜병원', '홍길동', $2, 'approved') returning id`,
        [A, emailOf(A)],
        fresh,
      )
      await fresh.query(`insert into ${TABLE} (hospital_id, visit_date, closed_at) values ($1, $2, $3)`, [hospital.id, DAY, OLD])

      await fresh.exec(CLOSES_MIGRATION)

      expect(await tableShape(fresh)).toEqual(once)
      expect(
        await rows(`select hospital_id, visit_date::text as day, closed_at = $1::timestamptz as old from ${TABLE}`, [OLD], fresh),
      ).toEqual([{ hospital_id: hospital.id, day: DAY, old: true }])
    } finally {
      await fresh.close()
    }
  }, 120_000)
})

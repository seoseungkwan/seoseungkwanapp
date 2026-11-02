import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { monthOf, todayInKorea } from '@/lib/analytics/dates'

// AI 리포트 저장 표(ai_reports·ai_usage)와 쓰기 함수 둘(save_ai_report·add_ai_usage)의 권한을
// 진짜 Postgres(PGlite, WASM)에서 확인한다. 운영자가 SQL 편집기에 붙일 auth migration → 이 migration을 차례로 그대로 실행한다.
// Supabase가 미리 갖춘 것(역할·auth 스키마·auth.uid()·auth.jwt()·새 표와 함수의 기본 권한)은 rls.test.ts의 흉내를 복사해 쓴다
const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf-8')

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

// 가짜 사용자: A·B는 서로 다른 승인 병원, 대기·거절 병원, 병원 없는 사용자, 관리자 둘(자기 승인 병원 있음·병원 없음)
const A = '00000000-0000-4000-8000-00000000000a'
const B = '00000000-0000-4000-8000-00000000000b'
const PENDING = '00000000-0000-4000-8000-00000000000c'
const REJECTED = '00000000-0000-4000-8000-00000000000d'
const NO_HOSPITAL = '00000000-0000-4000-8000-00000000000e'
const ADMIN = '00000000-0000-4000-8000-0000000000a1'
const ADMIN_NO_HOSPITAL = '00000000-0000-4000-8000-0000000000a2'
const USERS = [A, B, PENDING, REJECTED, NO_HOSPITAL, ADMIN, ADMIN_NO_HOSPITAL]
const EMAIL = (user: string) => `${user.slice(-2)}@fake.test`

type Status = 'pending' | 'approved' | 'rejected'

// PGlite 첫 실행(WASM 불러오기)이 느린 PC·CI에서도 흔들리지 않게
const SLOW = { timeout: 30_000 }
let db: PGlite
let hospital: Record<string, string>

beforeAll(async () => {
  db = await PGlite.create()
  // Supabase 세션 시간대는 UTC다. PGlite는 이 PC 시간대(시험의 TZ=Asia/Seoul)를 물려받으므로 UTC로 맞춘다
  await db.exec(`set time zone 'UTC'`)
  await db.exec(SUPABASE_MOCK)
  await db.exec(read('./migrations/20261028000000_auth.sql'))
  await db.exec(read('./migrations/20261101000000_ai_report.sql'))
}, 30_000)

// 시험마다 빈 표에서 시작한다(병원을 지우면 AI 줄도 같이 지워진다). 운영자(superuser)는 RLS를 건너뛴다
beforeEach(async () => {
  await operator()
  await db.exec('truncate auth.users cascade')
  for (const user of USERS) {
    await db.query('insert into auth.users (id, email) values ($1, $2)', [user, EMAIL(user)])
  }
  hospital = {
    [A]: await addHospital(A, 'approved'),
    [B]: await addHospital(B, 'approved'),
    [PENDING]: await addHospital(PENDING, 'pending'),
    [REJECTED]: await addHospital(REJECTED, 'rejected'),
    [ADMIN]: await addHospital(ADMIN, 'approved'),
  }
  await addAdmin(ADMIN)
  await addAdmin(ADMIN_NO_HOSPITAL)
})

async function operator() {
  await db.exec('reset role; reset request.jwt.claims')
}

// 로그인 토큰: sub = uid, email = 구글 계정 이메일
async function become(user: string) {
  await operator()
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: user, email: EMAIL(user) })])
  await db.exec('set role authenticated')
}

async function becomeAnon() {
  await operator()
  await db.exec('set role anon')
}

async function rows(sql: string, params: unknown[] = []) {
  return (await db.query<Record<string, unknown>>(sql, params)).rows
}

// 운영자가 SQL 편집기에서 병원 줄을 만든 것과 같다. 병원 id를 돌려준다
async function addHospital(owner: string, status: Status) {
  await operator()
  const [row] = await rows(
    `insert into public.hospitals (owner_id, name, applicant_name, email, status)
     values ($1, '가짜병원', '홍길동', $2, $3) returning id`,
    [owner, EMAIL(owner), status],
  )
  return row.id as string
}

async function addAdmin(user: string) {
  await operator()
  await db.query('insert into public.admins (user_id) values ($1)', [user])
}

// 운영자 눈으로 본 표 전체(RLS 없이)
async function allReports() {
  await operator()
  return rows('select hospital_id, month, report, input_hash, model, created_at from public.ai_reports order by hospital_id, month')
}

async function allUsage() {
  await operator()
  const usage = await rows(
    `select hospital_id, month, calls, input_tokens, output_tokens, cost_micro_usd
     from public.ai_usage order by hospital_id, month`,
  )
  // bigint 칸은 드라이버에 따라 bigint로 올 수 있어 숫자로 맞춘다
  return usage.map((u) => ({
    ...u,
    calls: Number(u.calls),
    input_tokens: Number(u.input_tokens),
    output_tokens: Number(u.output_tokens),
    cost_micro_usd: Number(u.cost_micro_usd),
  }))
}

// 가짜 리포트·지문·모델. 리포트 jsonb 모양은 SavedReport의 { partial, summary, cards }
const REPORT = { partial: false, summary: '가짜 요약', cards: [{ tag: 'up', text: '신환이 늘었어요', metric: 'total.newPatients', basis: '근거 · 가짜' }] }
const REPORT_2 = { partial: true, summary: '다시 분석한 가짜 요약', cards: [] }
const HASH = 'a'.repeat(64)
const HASH_2 = '0123456789abcdef'.repeat(4)
const MODEL = 'claude-opus-5-5'
const MODEL_2 = 'claude-opus-5'

const SAVE = 'select public.save_ai_report($1, $2::jsonb, $3, $4)'
const ADD_USAGE = 'select public.add_ai_usage($1, $2, $3)'
const save = (month = '2026-10', report: unknown = REPORT, hash = HASH, model = MODEL) =>
  db.query(SAVE, [month, JSON.stringify(report), hash, model])
const addUsage = (input: number, output: number, cost: number) => db.query(ADD_USAGE, [input, output, cost])

const TABLES = ['public.ai_reports', 'public.ai_usage']
const FUNCTIONS = ['public.save_ai_report(text, jsonb, text, text)', 'public.add_ai_usage(bigint, bigint, bigint)']
const DENIED = /permission denied/

// 한국 날짜 기준 이번 달(lib/analytics/dates.ts)과, add_ai_usage가 달을 정하는 식(migration과 글자까지 같다)
const thisMonth = () => monthOf(todayInKorea())
const KOREA_MONTH = `to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM')`

describe('AC-504.1 로그인 안 한 사용자(anon)는 ai_reports·ai_usage를 읽지도 쓰지도 못하고 두 함수도 못 부른다', SLOW, () => {
  it('AC-504.1 anon에게 두 표 권한과 두 함수 실행 권한이 하나도 없다', async () => {
    const grants = await rows(
      `select table_name, privilege_type from information_schema.role_table_grants
       where grantee = 'anon' and table_schema = 'public' and table_name in ('ai_reports', 'ai_usage')`,
    )
    expect(grants).toEqual([])
    for (const fn of FUNCTIONS) {
      const [privilege] = await rows(`select has_function_privilege('anon', $1, 'execute') as anon`, [fn])
      expect(privilege).toEqual({ anon: false })
    }
  })

  it('AC-504.1 두 표 읽기·넣기·고치기·지우기와 두 함수 부르기가 모두 거부되고 줄은 그대로다', async () => {
    await become(A)
    await save()
    await addUsage(10, 2, 30)
    const reports = await allReports()
    const usage = await allUsage()

    await becomeAnon()
    for (const table of TABLES) {
      await expect(db.query(`select * from ${table}`)).rejects.toThrow(DENIED)
      await expect(db.query(`update ${table} set month = '2026-01'`)).rejects.toThrow(DENIED)
      await expect(db.query(`delete from ${table}`)).rejects.toThrow(DENIED)
    }
    await expect(
      db.query(`insert into public.ai_reports (hospital_id, month, report, input_hash, model) values ($1, '2026-09', '{}', $2, $3)`, [
        hospital[A],
        HASH,
        MODEL,
      ]),
    ).rejects.toThrow(DENIED)
    await expect(
      db.query(`insert into public.ai_usage (hospital_id, month, calls) values ($1, '2026-09', 1)`, [hospital[A]]),
    ).rejects.toThrow(DENIED)
    await expect(save('2026-09')).rejects.toThrow(DENIED)
    await expect(addUsage(1, 1, 1)).rejects.toThrow(DENIED)

    expect(await allReports()).toEqual(reports)
    expect(await allUsage()).toEqual(usage)
  })
})

describe('AC-504.2 승인된 병원 사용자가 save_ai_report를 부르면 그 병원·달 줄 하나가 생기고, 같은 달로 다시 부르면 덮어쓴다', SLOW, () => {
  it('AC-504.2 처음 부르면 A 병원 2026-10 줄이 하나 생기고 A가 읽을 수 있다', async () => {
    await become(A)
    await save('2026-10', REPORT, HASH, MODEL)

    const all = await allReports()
    expect(all).toHaveLength(1)
    expect(all[0]).toMatchObject({ hospital_id: hospital[A], month: '2026-10', report: REPORT, input_hash: HASH, model: MODEL })
    expect(all[0].created_at).toBeInstanceOf(Date)

    await become(A)
    expect(await rows('select hospital_id, month, report, input_hash, model from public.ai_reports')).toEqual([
      { hospital_id: hospital[A], month: '2026-10', report: REPORT, input_hash: HASH, model: MODEL },
    ])
  })

  it('AC-504.2 같은 달로 다시 부르면 줄은 하나 그대로이고 내용·지문·모델·created_at이 새 값이다', async () => {
    await become(A)
    await save('2026-10', REPORT, HASH, MODEL)
    // 두 부름이 같은 시각으로 찍혀도 비교가 흔들리지 않게 처음 값을 과거로 돌려 둔다
    await operator()
    await db.exec(`update public.ai_reports set created_at = '2020-01-01T00:00:00Z'`)

    await become(A)
    await save('2026-10', REPORT_2, HASH_2, MODEL_2)

    const all = await allReports()
    expect(all).toHaveLength(1)
    expect(all[0]).toMatchObject({ hospital_id: hospital[A], month: '2026-10', report: REPORT_2, input_hash: HASH_2, model: MODEL_2 })
    expect((all[0].created_at as Date).getTime()).toBeGreaterThan(new Date('2020-01-01T00:00:00Z').getTime())
  })

  it('AC-504.2 다른 달은 따로 한 줄씩이다', async () => {
    await become(A)
    await save('2026-09')
    await save('2026-10')
    expect((await allReports()).map((r) => [r.hospital_id, r.month])).toEqual([
      [hospital[A], '2026-09'],
      [hospital[A], '2026-10'],
    ])
  })
})

describe('AC-504.3 다른 병원 사용자와 관리자는 A의 리포트·사용량을 보지 못한다', SLOW, () => {
  it('AC-504.3 두 표 모두 RLS가 켜져 있다', async () => {
    const tables = await rows(
      `select relname, relrowsecurity from pg_class
       where relnamespace = 'public'::regnamespace and relname in ('ai_reports', 'ai_usage') order by relname`,
    )
    expect(tables).toEqual([
      { relname: 'ai_reports', relrowsecurity: true },
      { relname: 'ai_usage', relrowsecurity: true },
    ])
  })

  it('AC-504.3 다른 병원 사용자 B는 자기 줄만 보고 A의 줄은 안 보인다', async () => {
    await become(A)
    await save()
    await addUsage(10, 2, 30)
    await become(B)
    await save('2026-10', REPORT_2, HASH_2, MODEL_2)
    await addUsage(1, 1, 1)

    await become(B)
    expect(await rows('select hospital_id from public.ai_reports')).toEqual([{ hospital_id: hospital[B] }])
    expect(await rows('select hospital_id from public.ai_usage')).toEqual([{ hospital_id: hospital[B] }])
    expect(await rows('select month from public.ai_reports where hospital_id = $1', [hospital[A]])).toEqual([])
    expect(await rows('select month from public.ai_usage where hospital_id = $1', [hospital[A]])).toEqual([])
  })

  it.each([
    ['자기 병원이 있는 관리자', ADMIN],
    ['병원 없는 관리자', ADMIN_NO_HOSPITAL],
  ])('AC-504.3 %s도 A의 줄을 보지 못한다(관리자 예외 없음)', async (_name, admin) => {
    await become(A)
    await save()
    await addUsage(10, 2, 30)

    await become(admin)
    for (const table of TABLES) {
      expect(await rows(`select hospital_id from ${table} where hospital_id = $1`, [hospital[A]])).toEqual([])
      expect(await rows(`select hospital_id from ${table}`)).toEqual([])
    }
  })
})

describe('AC-504.4 승인 대기·거절 병원 사용자와 병원 없는 사용자가 두 함수를 부르면 거부되고 줄이 생기지 않는다', SLOW, () => {
  it.each([
    ['승인 대기 병원 사용자', PENDING],
    ['거절된 병원 사용자', REJECTED],
    ['병원 없는 사용자', NO_HOSPITAL],
    ['병원 없는 관리자', ADMIN_NO_HOSPITAL],
  ])('AC-504.4 %s는 42501로 거부된다', async (_name, user) => {
    await become(user)
    await expect(save()).rejects.toMatchObject({ code: '42501' })
    await expect(addUsage(10, 2, 30)).rejects.toMatchObject({ code: '42501' })
    expect(await allReports()).toEqual([])
    expect(await allUsage()).toEqual([])
  })
})

describe('AC-504.5 로그인한 사용자는 두 표에 직접 넣기·고치기·지우기를 못 한다(쓰기는 함수로만)', SLOW, () => {
  it('AC-504.5 authenticated 표 권한은 두 표 읽기뿐이다', async () => {
    const grants = await rows(
      `select table_name, privilege_type from information_schema.role_table_grants
       where grantee = 'authenticated' and table_schema = 'public' and table_name in ('ai_reports', 'ai_usage')
       order by table_name, privilege_type`,
    )
    expect(grants).toEqual([
      { table_name: 'ai_reports', privilege_type: 'SELECT' },
      { table_name: 'ai_usage', privilege_type: 'SELECT' },
    ])
    const columns = await rows(
      `select table_name, column_name, privilege_type from information_schema.column_privileges
       where grantee = 'authenticated' and table_schema = 'public' and table_name in ('ai_reports', 'ai_usage')
         and privilege_type <> 'SELECT'`,
    )
    expect(columns).toEqual([])
  })

  it('AC-504.5 승인된 A가 자기 병원 줄에 직접 insert·update·delete·upsert를 하면 거부되고 줄은 그대로다', async () => {
    await become(A)
    await save()
    await addUsage(10, 2, 30)
    const reports = await allReports()
    const usage = await allUsage()

    await become(A)
    await expect(
      db.query(`insert into public.ai_reports (hospital_id, month, report, input_hash, model) values ($1, '2026-09', '{}', $2, $3)`, [
        hospital[A],
        HASH,
        MODEL,
      ]),
    ).rejects.toThrow(DENIED)
    await expect(
      db.query(
        `insert into public.ai_reports (hospital_id, month, report, input_hash, model) values ($1, '2026-10', '{}', $2, $3)
         on conflict (hospital_id, month) do update set model = 'x'`,
        [hospital[A], HASH, MODEL],
      ),
    ).rejects.toThrow(DENIED)
    await expect(db.query(`update public.ai_reports set model = 'x'`)).rejects.toThrow(DENIED)
    await expect(db.query('delete from public.ai_reports')).rejects.toThrow(DENIED)

    await expect(
      db.query(`insert into public.ai_usage (hospital_id, month, calls) values ($1, '2026-09', 1)`, [hospital[A]]),
    ).rejects.toThrow(DENIED)
    await expect(db.query('update public.ai_usage set calls = 0, cost_micro_usd = 0')).rejects.toThrow(DENIED)
    await expect(db.query('delete from public.ai_usage')).rejects.toThrow(DENIED)

    expect(await allReports()).toEqual(reports)
    expect(await allUsage()).toEqual(usage)
  })

  it('AC-504.5 두 함수는 security definer이고 search_path가 비어 있으며 실행 권한은 authenticated에만 있다', async () => {
    const fns = await rows(
      `select proname, prosecdef, proconfig from pg_proc
       where pronamespace = 'public'::regnamespace and proname in ('add_ai_usage', 'save_ai_report') order by proname`,
    )
    expect(fns).toEqual([
      { proname: 'add_ai_usage', prosecdef: true, proconfig: ['search_path=""'] },
      { proname: 'save_ai_report', prosecdef: true, proconfig: ['search_path=""'] },
    ])
    for (const fn of FUNCTIONS) {
      const grantees = await rows(
        `select coalesce(nullif(a.grantee, 0)::regrole::text, 'PUBLIC') as grantee
         from pg_proc p, aclexplode(p.proacl) a
         where p.oid = $1::regprocedure and a.grantee <> p.proowner and a.privilege_type = 'EXECUTE'
         order by 1`,
        [fn],
      )
      expect(grantees).toEqual([{ grantee: 'authenticated' }])
    }
  })
})

describe('AC-504.6 save_ai_report는 달·리포트·지문 모양이 틀리면 거부한다', SLOW, () => {
  // 표 검사 제약(23514) 또는 함수가 먼저 막은 오류(22023)
  const REJECTED_INPUT = /^(23514|22023)$/

  async function expectRejected(month: string, report: unknown, hash: string, model = MODEL) {
    await become(A)
    await expect(save(month, report, hash, model)).rejects.toMatchObject({ code: expect.stringMatching(REJECTED_INPUT) })
    expect(await allReports()).toEqual([])
  }

  it.each(['2026-13', '2026-1', '2026-00', '26-10', '2026/10', '2026-10-01', ''])("AC-504.6 달 '%s'는 거부된다", async (month) => {
    await expectRejected(month, REPORT, HASH)
  })

  it.each([
    ['배열', []],
    ['글자', 'x'],
    ['숫자', 1],
    ['null', null],
  ])('AC-504.6 JSON 객체가 아닌 리포트(%s)는 거부된다', async (_name, report) => {
    await expectRejected('2026-10', report, HASH)
  })

  it('AC-504.6 32KB를 넘는 리포트는 거부된다', async () => {
    // 압축으로 작아지지 않게 서로 다른 글자로 채운다
    const filler = Array.from({ length: 6000 }, (_, i) => (i * 7919).toString(36)).join(' ')
    const big = { partial: false, summary: filler, cards: [] }
    expect(JSON.stringify(big).length).toBeGreaterThan(32 * 1024)
    await expectRejected('2026-10', big, HASH)
  })

  it.each([
    ['대문자', 'A'.repeat(64)],
    ['63자', 'a'.repeat(63)],
    ['65자', 'a'.repeat(65)],
    ['16진수 밖 글자', 'g'.repeat(64)],
    ['빈 글자', ''],
  ])('AC-504.6 지문(%s)은 거부된다', async (_name, hash) => {
    await expectRejected('2026-10', REPORT, hash)
  })

  it.each([
    ['빈 모델 이름', ''],
    ['101자 모델 이름', 'm'.repeat(101)],
  ])('AC-504.6 %s도 거부된다', async (_name, model) => {
    await expectRejected('2026-10', REPORT, HASH, model)
  })

  it('AC-504.6 이미 있는 줄을 틀린 값으로 덮으려 하면 거부되고 처음 줄이 그대로다', async () => {
    await become(A)
    await save()
    const before = await allReports()
    await become(A)
    await expect(save('2026-10', [], HASH_2, MODEL_2)).rejects.toMatchObject({ code: expect.stringMatching(REJECTED_INPUT) })
    await expect(save('2026-10', REPORT_2, 'A'.repeat(64), MODEL_2)).rejects.toMatchObject({
      code: expect.stringMatching(REJECTED_INPUT),
    })
    expect(await allReports()).toEqual(before)
  })
})

describe('AC-504.7 add_ai_usage는 한국 날짜 기준 이번 달 줄 하나에 횟수·토큰·비용을 더하고 음수는 거부한다', SLOW, () => {
  it('AC-504.7 두 번 부르면 이번 달 줄 하나에 횟수 2, 토큰·비용은 두 번의 합이다', async () => {
    await become(A)
    await addUsage(1200, 300, 10_800)
    await addUsage(800, 150, 6_200)

    expect(await allUsage()).toEqual([
      {
        hospital_id: hospital[A],
        month: thisMonth(),
        calls: 2,
        input_tokens: 2000,
        output_tokens: 450,
        cost_micro_usd: 17_000,
      },
    ])
  })

  // Supabase(와 위에서 맞춘 PGlite) 세션 시간대는 UTC라, 위 시험만으로는 UTC 달로 세는 실수가 한국 1일 00~09시에만 드러난다.
  // 그래서 함수 본문이 한국 시각 식으로 달을 정하는지, 그 식이 정해 둔 순간에 한국 달을 내는지 따로 본다
  it('AC-504.7 이번 달은 한국 시각으로 정한다(함수 본문이 Asia/Seoul 식을 쓰고 맨 now()로 달을 셈하지 않는다)', async () => {
    await operator()
    const [fn] = await rows(
      `select p.prosrc from pg_catalog.pg_proc p where p.oid = 'public.add_ai_usage(bigint, bigint, bigint)'::regprocedure`,
    )
    const body = String(fn.prosrc)
    expect(body).toContain(KOREA_MONTH)
    // 한국 시각 식을 빼고 나면 달을 셈하는 다른 식(맨 now()의 to_char 등)이 남지 않는다
    expect(body.split(KOREA_MONTH).join('')).not.toMatch(/to_char\s*\(|date_trunc\s*\(|current_date|localtimestamp/i)

    // UTC 2026-10-31 15:30 = 한국 2026-11-01 00:30
    const instant = `'2026-10-31 15:30:00+00'::timestamptz`
    const [months] = await rows(
      `select current_setting('TimeZone') as session_zone,
              ${KOREA_MONTH.replace('now()', instant)} as korea,
              to_char(${instant}, 'YYYY-MM') as plain`,
    )
    expect(months).toEqual({ session_zone: 'UTC', korea: '2026-11', plain: '2026-10' })
  })

  it('AC-504.7 0도 한 번의 부름으로 센다', async () => {
    await become(A)
    await addUsage(0, 0, 0)
    expect(await allUsage()).toMatchObject([{ hospital_id: hospital[A], calls: 1, input_tokens: 0, output_tokens: 0, cost_micro_usd: 0 }])
  })

  it('AC-504.7 병원마다 따로 센다', async () => {
    await become(A)
    await addUsage(10, 2, 30)
    await become(B)
    await addUsage(1, 1, 1)
    const usage = await allUsage()
    expect(usage).toHaveLength(2)
    expect(usage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ hospital_id: hospital[A], calls: 1, input_tokens: 10, output_tokens: 2, cost_micro_usd: 30 }),
        expect.objectContaining({ hospital_id: hospital[B], calls: 1, input_tokens: 1, output_tokens: 1, cost_micro_usd: 1 }),
      ]),
    )
  })

  it.each([
    [-1, 0, 0],
    [0, -1, 0],
    [0, 0, -1],
    [-5, -5, -5],
  ])('AC-504.7 음수(%i, %i, %i)는 22023으로 거부되고 줄은 그대로다', async (input, output, cost) => {
    await become(A)
    await expect(addUsage(input, output, cost)).rejects.toMatchObject({ code: '22023' })
    expect(await allUsage()).toEqual([])

    await become(A)
    await addUsage(10, 2, 30)
    const before = await allUsage()
    await become(A)
    await expect(addUsage(input, output, cost)).rejects.toMatchObject({ code: '22023' })
    expect(await allUsage()).toEqual(before)
  })
})

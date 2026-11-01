// 매출 숫자 저장·읽기(TASK-7, REQ-007 · AC-007.2·AC-007.4). 실제 Supabase에 붙지 않는다.
// 어느 표에 어떤 칸이 어떤 차례로 나가는지만 본다. 권한 자체는 supabase/revenue.rls.test.ts가 증명한다. 숫자·코드는 모두 가짜다
import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import type { RevenueCodeRow, RevenueDayRow, RevenueDaysResult } from '@/types/revenue'
import { createRevenueStore, RevenueStoreError } from './revenue'

type Recorded = {
  table: string
  op: 'delete' | 'insert' | 'upsert' | 'select'
  rows?: Record<string, unknown>[]
  options?: unknown
  columns?: string
  filters: [string, string, unknown][]
  orders: string[]
  range?: [number, number]
}
type Reply = { data?: unknown; error?: unknown }

const RAW = 'permission denied for table sales_days (secret detail)'

/** 부른 표·칸·차례를 기록하는 가짜 클라이언트. reply가 던지면 네트워크 예외와 같다 */
function fakeClient(reply: (call: Recorded) => Reply = () => ({})) {
  const calls: Recorded[] = []
  const query = (call: Omit<Recorded, 'filters' | 'orders'>) => {
    const recorded: Recorded = { ...call, filters: [], orders: [] }
    calls.push(recorded)
    const q = {
      eq: (column: string, value: unknown) => (recorded.filters.push(['eq', column, value]), q),
      gte: (column: string, value: unknown) => (recorded.filters.push(['gte', column, value]), q),
      lte: (column: string, value: unknown) => (recorded.filters.push(['lte', column, value]), q),
      order: (column: string) => (recorded.orders.push(column), q),
      range: (from: number, to: number) => ((recorded.range = [from, to]), q),
      then: (ok: (value: unknown) => unknown, bad: (reason: unknown) => unknown) =>
        Promise.resolve()
          .then(() => reply(recorded))
          .then((r) => ({ data: r.data ?? null, error: r.error ?? null }))
          .then(ok, bad),
    }
    return q
  }
  const client = {
    from: (table: string) => ({
      delete: () => query({ table, op: 'delete' }),
      insert: (rows: Record<string, unknown>[]) => query({ table, op: 'insert', rows }),
      upsert: (rows: Record<string, unknown>[], options: unknown) => query({ table, op: 'upsert', rows, options }),
      select: (columns: string) => query({ table, op: 'select', columns }),
    }),
  }
  return { client: client as unknown as SupabaseClient, calls }
}

const steps = (calls: Recorded[]) => calls.map((call) => [call.table, call.op])

const day = (date: string, over: Partial<RevenueDayRow> = {}): RevenueDayRow => ({
  date,
  visits: 11,
  newPatients: 2,
  returnVisits: 9,
  patientsToDate: 8,
  total: 1060,
  insurer: 500,
  noncovered: 300,
  copay: 120,
  otherTotal: 140,
  cash: 310,
  card: 420,
  transfer: 130,
  receivableIn: 70,
  unconfirmed: false,
  splitUnconfirmed: false,
  ...over,
})

const sentDay = (date: string) => ({
  day: date,
  visits: 11,
  new_patients: 2,
  return_visits: 9,
  patients_to_date: 8,
  total: 1060,
  insurer: 500,
  noncovered: 300,
  copay: 120,
  other_total: 140,
  cash: 310,
  card: 420,
  transfer: 130,
  receivable_in: 70,
  unconfirmed: false,
  split_unconfirmed: false,
})

const DAY_COLUMNS = Object.keys(sentDay('2026-09-01')).sort()
const CODE_COLUMNS = ['amount', 'code', 'count', 'month', 'name']

const code = (name: string | null = '가짜 처방'): RevenueCodeRow => ({ code: 'AA100', name, count: 7, amount: 3500 })

const september = (): RevenueDaysResult => ({
  days: [day('2026-09-01'), day('2026-09-02')],
  codes: [code(), { code: '_REST', name: null, count: 2, amount: null }],
})

async function failure(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run()
  } catch (e) {
    return e
  }
  throw new Error('던져야 하는데 던지지 않았어요')
}

function expectFailure(error: unknown, code: string) {
  expect(error).toBeInstanceOf(RevenueStoreError)
  expect((error as RevenueStoreError).code).toBe(code)
  // Supabase 오류 내용은 버린다: 글에도 cause에도 남기지 않는다
  expect((error as RevenueStoreError).message).toBe(code)
  expect((error as RevenueStoreError).cause).toBeUndefined()
  expect(JSON.stringify(error)).not.toContain('secret detail')
}

describe('AC-007.2 saveMonth', () => {
  it('AC-007.2 그 달 코드 줄을 지우고 넣은 뒤 마지막에 날 줄을 upsert한다', async () => {
    const { client, calls } = fakeClient()
    await createRevenueStore(client).saveMonth('2026-09', september())
    expect(steps(calls)).toEqual([
      ['sales_codes', 'delete'],
      ['sales_codes', 'insert'],
      ['sales_days', 'upsert'],
    ])
  })

  it('AC-007.2 지우기는 그 달(YYYY-MM-01) 줄만 고른다', async () => {
    const { client, calls } = fakeClient()
    await createRevenueStore(client).saveMonth('2026-09', september())
    expect(calls[0].filters).toEqual([['eq', 'month', '2026-09-01']])
  })

  it('AC-007.2 코드 줄은 month·code·name·count·amount 다섯 칸뿐이고 값이 맞다', async () => {
    const { client, calls } = fakeClient()
    await createRevenueStore(client).saveMonth('2026-09', september())
    expect(calls[1].rows).toEqual([
      { month: '2026-09-01', code: 'AA100', name: '가짜 처방', count: 7, amount: 3500 },
      { month: '2026-09-01', code: '_REST', name: null, count: 2, amount: null },
    ])
    for (const row of calls[1].rows ?? []) expect(Object.keys(row).sort()).toEqual(CODE_COLUMNS)
  })

  it('AC-007.2 날 줄은 열여섯 칸(day~split_unconfirmed)뿐이고 snake_case로 바꿔 hospital_id+day로 upsert한다', async () => {
    const { client, calls } = fakeClient()
    await createRevenueStore(client).saveMonth('2026-09', september())
    expect(calls[2].rows).toEqual([sentDay('2026-09-01'), sentDay('2026-09-02')])
    expect(calls[2].options).toEqual({ onConflict: 'hospital_id,day' })
    expect(DAY_COLUMNS).toHaveLength(16)
    for (const row of calls[2].rows ?? []) expect(Object.keys(row).sort()).toEqual(DAY_COLUMNS)
  })

  it('AC-007.2 표시 칸과 null 칸이 그대로 간다: splitUnconfirmed → split_unconfirmed, 나눔 네 칸만 null', async () => {
    const { client, calls } = fakeClient()
    const splitDay = day('2026-09-01', { splitUnconfirmed: true, insurer: null, noncovered: null, copay: null, otherTotal: null })
    await createRevenueStore(client).saveMonth('2026-09', { days: [splitDay], codes: [code()] })
    expect(calls[2].rows).toEqual([
      { ...sentDay('2026-09-01'), split_unconfirmed: true, insurer: null, noncovered: null, copay: null, other_total: null },
    ])
  })

  it('AC-007.2 unconfirmed인 날은 금액 아홉 칸이 null인 채 간다', async () => {
    const { client, calls } = fakeClient()
    const blank = { total: null, insurer: null, noncovered: null, copay: null, otherTotal: null, cash: null, card: null, transfer: null, receivableIn: null }
    await createRevenueStore(client).saveMonth('2026-09', { days: [day('2026-09-01', { unconfirmed: true, ...blank })], codes: [] })
    expect(calls.at(-1)?.rows).toEqual([
      {
        ...sentDay('2026-09-01'),
        unconfirmed: true,
        total: null,
        insurer: null,
        noncovered: null,
        copay: null,
        other_total: null,
        cash: null,
        card: null,
        transfer: null,
        receivable_in: null,
      },
    ])
  })

  it('AC-007.2 답에 정해 두지 않은 칸이 섞여 있어도 보내지 않는다(chart·name·hospital_id·fetched_at 없음)', async () => {
    const { client, calls } = fakeClient()
    const planted = { chart: '900001', name: '가상환자01', hospital_id: 'h-1', fetched_at: '2026-01-01T00:00:00+00:00' }
    await createRevenueStore(client).saveMonth('2026-09', {
      days: [{ ...day('2026-09-01'), ...planted }],
      codes: [{ ...code(), chart: '900001', hospital_id: 'h-1', fetched_at: planted.fetched_at } as RevenueCodeRow],
    })
    const sentCode = calls[1].rows?.[0] ?? {}
    const sentDayRow = calls[2].rows?.[0] ?? {}
    expect(Object.keys(sentCode).sort()).toEqual(CODE_COLUMNS)
    expect(Object.keys(sentDayRow).sort()).toEqual(DAY_COLUMNS)
    for (const row of [sentCode, sentDayRow]) {
      for (const key of ['chart', 'hospital_id', 'fetched_at']) expect(row).not.toHaveProperty(key)
    }
    expect(sentDayRow).not.toHaveProperty('name')
    const sent = JSON.stringify(calls.map((call) => call.rows))
    expect(sent).not.toContain('900001')
    expect(sent).not.toContain('가상환자01')
  })

  it('AC-007.2 코드가 하나도 없는 달은 지우기만 하고 넣기를 건너뛴다', async () => {
    const { client, calls } = fakeClient()
    await createRevenueStore(client).saveMonth('2026-09', { days: [day('2026-09-01')], codes: [] })
    expect(steps(calls)).toEqual([
      ['sales_codes', 'delete'],
      ['sales_days', 'upsert'],
    ])
  })

  it.each([
    ['1일이 아닌 날로 시작', { days: [day('2026-09-02')], codes: [code()] }],
    ['다른 달의 1일로 시작', { days: [day('2026-10-01')], codes: [code()] }],
    ['날 줄이 없음', { days: [], codes: [code()] }],
  ])('AC-007.2 답의 첫 날이 그 달 1일이 아니면(%s) 아무것도 보내지 않고 E-REVENUE-SAVE-FAILED', async (_name, result) => {
    const { client, calls } = fakeClient()
    expectFailure(await failure(() => createRevenueStore(client).saveMonth('2026-09', result)), 'E-REVENUE-SAVE-FAILED')
    expect(calls).toEqual([])
  })

  it('AC-007.2 지우기 실패 → 넣기·upsert 없이 E-REVENUE-SAVE-FAILED', async () => {
    const { client, calls } = fakeClient((call) => (call.op === 'delete' ? { error: { message: RAW } } : {}))
    expectFailure(await failure(() => createRevenueStore(client).saveMonth('2026-09', september())), 'E-REVENUE-SAVE-FAILED')
    expect(steps(calls)).toEqual([['sales_codes', 'delete']])
  })

  it('AC-007.2 코드 넣기 실패 → 날 upsert 없이 E-REVENUE-SAVE-FAILED(날 줄이 없어 그 달을 다시 가져온다)', async () => {
    const { client, calls } = fakeClient((call) => (call.op === 'insert' ? { error: { message: RAW } } : {}))
    expectFailure(await failure(() => createRevenueStore(client).saveMonth('2026-09', september())), 'E-REVENUE-SAVE-FAILED')
    expect(steps(calls)).toEqual([
      ['sales_codes', 'delete'],
      ['sales_codes', 'insert'],
    ])
  })

  it('AC-007.2 날 upsert 실패 → E-REVENUE-SAVE-FAILED', async () => {
    const { client } = fakeClient((call) => (call.op === 'upsert' ? { error: { message: RAW } } : {}))
    expectFailure(await failure(() => createRevenueStore(client).saveMonth('2026-09', september())), 'E-REVENUE-SAVE-FAILED')
  })

  it.each(['delete', 'insert', 'upsert'])('AC-007.2 %s에서 예외가 나도(네트워크) 같은 번호만 던지고 글을 버린다', async (op) => {
    const { client } = fakeClient((call) => {
      if (call.op === op) throw new Error(RAW)
      return {}
    })
    expectFailure(await failure(() => createRevenueStore(client).saveMonth('2026-09', september())), 'E-REVENUE-SAVE-FAILED')
  })
})

const dbDay = (date: string, fetchedAt: string) => ({ ...sentDay(date), fetched_at: fetchedAt })
const dbCode = (month: string, codeName: string) => ({ month, code: codeName, name: '가짜 처방', count: 3, amount: 900 })

/** 줄을 돌려주는 가짜. 실제 서버처럼 한 번에 cap줄까지만 준다 */
function readingClient(days: unknown[], codes: unknown[], cap = 1000) {
  return fakeClient((call) => {
    const rows = call.table === 'sales_days' ? days : codes
    const [from, to] = call.range ?? [0, cap - 1]
    return { data: rows.slice(from, Math.min(to + 1, from + cap)) }
  })
}

const AT = '2026-11-01T01:00:00+00:00'
const selectOf = (calls: Recorded[], table: string) => calls.filter((call) => call.table === table && call.op === 'select')
const columnsOf = (call: Recorded) => (call.columns ?? '').split(',').map((column) => column.trim()).sort()

describe('AC-007.4 loadRevenue', () => {
  it('AC-007.4 sales_days는 첫 달 1일~끝 달 말일, sales_codes는 첫 달~끝 달을 읽고 쓰기는 없다', async () => {
    const { client, calls } = readingClient([], [])
    await createRevenueStore(client).loadRevenue('2025-10', '2026-02')
    expect(calls.every((call) => call.op === 'select')).toBe(true)
    expect(selectOf(calls, 'sales_days')[0].filters).toEqual([
      ['gte', 'day', '2025-10-01'],
      ['lte', 'day', '2026-02-28'],
    ])
    expect(selectOf(calls, 'sales_codes')[0].filters).toEqual([
      ['gte', 'month', '2025-10-01'],
      ['lte', 'month', '2026-02-01'],
    ])
  })

  it('AC-007.4 칸을 골라 읽는다: sales_days 열여섯 칸 + fetched_at, sales_codes 다섯 칸(이름 포함). hospital_id는 읽지 않는다', async () => {
    const { client, calls } = readingClient([], [])
    await createRevenueStore(client).loadRevenue('2026-09', '2026-09')
    expect(columnsOf(selectOf(calls, 'sales_days')[0])).toEqual([...DAY_COLUMNS, 'fetched_at'].sort())
    expect(columnsOf(selectOf(calls, 'sales_codes')[0])).toEqual(CODE_COLUMNS)
  })

  it('AC-007.4 날 줄을 camelCase RevenueDayRow로 돌려준다(fetched_at·day 칸 없음, 표시와 null 그대로)', async () => {
    const splitDb = { ...dbDay('2026-09-02', AT), split_unconfirmed: true, insurer: null, noncovered: null, copay: null, other_total: null }
    const { client } = readingClient([dbDay('2026-09-01', AT), splitDb], [])
    const { days } = await createRevenueStore(client).loadRevenue('2026-09', '2026-09')
    expect(days).toEqual([
      day('2026-09-01'),
      day('2026-09-02', { splitUnconfirmed: true, insurer: null, noncovered: null, copay: null, otherTotal: null }),
    ])
  })

  it("AC-007.4 코드 줄은 이름을 포함해 돌려주고 month는 'YYYY-MM'이다", async () => {
    const { client } = readingClient([], [dbCode('2026-09-01', 'AA100'), { month: '2026-10-01', code: '_REST', name: null, count: 2, amount: null }])
    const { codes } = await createRevenueStore(client).loadRevenue('2026-09', '2026-10')
    expect(codes).toEqual([
      { month: '2026-09', code: 'AA100', name: '가짜 처방', count: 3, amount: 900 },
      { month: '2026-10', code: '_REST', name: null, count: 2, amount: null },
    ])
  })

  it('AC-007.4 fetchedAt은 날 줄 가운데 가장 늦은 시각이다(글자 순서가 아니라 시각으로 본다)', async () => {
    const earlierButBiggerText = '2026-11-01T01:00:00+09:00' // 2026-10-31 16:00 UTC
    const latest = '2026-10-31T20:00:00+00:00'
    const { client } = readingClient(
      [dbDay('2026-09-01', '2026-10-01T00:00:00+00:00'), dbDay('2026-09-02', latest), dbDay('2026-09-03', earlierButBiggerText)],
      [],
    )
    const { fetchedAt } = await createRevenueStore(client).loadRevenue('2026-09', '2026-09')
    expect(fetchedAt).toBe(latest)
  })

  it('AC-007.4 줄이 없으면 빈 목록과 fetchedAt null이다', async () => {
    const { client } = readingClient([], [])
    await expect(createRevenueStore(client).loadRevenue('2026-09', '2026-09')).resolves.toEqual({ days: [], codes: [], fetchedAt: null })
  })

  it.each([
    [2345, 1000],
    [2000, 1000],
    [1000, 1000],
    [1200, 500],
  ])('AC-007.4 코드 줄 %i개를 서버가 한 번에 %i줄씩만 줘도 빠짐없이 돌려준다(13달이면 넘친다)', async (count, cap) => {
    const rows = Array.from({ length: count }, (_, index) => dbCode('2026-09-01', `C${index}`))
    const { client, calls } = readingClient([], rows, cap)
    const { codes } = await createRevenueStore(client).loadRevenue('2026-09', '2026-09')
    expect(codes.map((row) => row.code)).toEqual(rows.map((row) => row.code))
    for (const call of selectOf(calls, 'sales_codes')) expect(call.orders).toEqual(['month', 'code'])
  })

  it('AC-007.4 날 줄도 차례를 정해 쪽으로 나눠 읽는다', async () => {
    const rows = Array.from({ length: 3 }, (_, index) => dbDay(`2026-09-0${index + 1}`, AT))
    const { client, calls } = readingClient(rows, [], 2)
    const { days } = await createRevenueStore(client).loadRevenue('2026-09', '2026-09')
    expect(days.map((row) => row.date)).toEqual(['2026-09-01', '2026-09-02', '2026-09-03'])
    for (const call of selectOf(calls, 'sales_days')) expect(call.orders).toEqual(['day'])
  })

  it.each(['sales_days', 'sales_codes'])('AC-007.4 %s 읽기가 실패하면 빈 목록을 돌려주지 않고 번호만 던진다(글을 버린다)', async (table) => {
    const { client } = fakeClient((call) => (call.table === table ? { error: { message: RAW } } : { data: [] }))
    expectFailure(await failure(() => createRevenueStore(client).loadRevenue('2026-09', '2026-09')), 'E-PAGE-FAILED')
  })

  it('AC-007.4 둘째 쪽 읽기가 실패해도 일부만 돌려주지 않는다', async () => {
    const rows = Array.from({ length: 1000 }, (_, index) => dbCode('2026-09-01', `C${index}`))
    const { client } = fakeClient((call) => {
      if (call.table !== 'sales_codes') return { data: [] }
      return call.range?.[0] === 0 ? { data: rows } : { error: { message: RAW } }
    })
    expectFailure(await failure(() => createRevenueStore(client).loadRevenue('2026-09', '2026-09')), 'E-PAGE-FAILED')
  })

  it('AC-007.4 읽다 예외가 나도(네트워크) 번호만 던진다', async () => {
    const { client } = fakeClient(() => {
      throw new Error(RAW)
    })
    expectFailure(await failure(() => createRevenueStore(client).loadRevenue('2026-09', '2026-09')), 'E-PAGE-FAILED')
  })
})

// 매출 숫자 저장·읽기(stats-revenue REQ-4104 · AC-4104.3·AC-4104.4, 옛 달 저장은 지움 AC-4110.4). 실제 Supabase에 붙지 않는다.
// 어느 표에 어떤 칸이 어떤 차례로 나가는지만 본다. 권한 자체는 supabase/revenue.rls.test.ts가 증명한다. 숫자·코드는 모두 가짜다
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { addDays } from '@/lib/analytics/dates'
import type { RevenueCodeRow, RevenueDayCodeRow, RevenueDayRow, RevenueDaysResult } from '@/types/revenue'
import { createRevenueStore, RevenueStoreError } from './revenue'

type Recorded = {
  /** 표 이름. op가 'rpc'면 함수 이름 */
  table: string
  op: 'delete' | 'insert' | 'upsert' | 'select' | 'rpc'
  rows?: Record<string, unknown>[]
  options?: unknown
  columns?: string
  /** rpc에 넘긴 인자 */
  args?: Record<string, unknown>
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
    rpc: (fn: string, args: Record<string, unknown>) => query({ table: fn, op: 'rpc', args }),
  }
  return { client: client as unknown as SupabaseClient, calls }
}

const steps = (calls: Recorded[]) => calls.map((call) => [call.table, call.op])

const day = (date: string, over: Partial<RevenueDayRow> = {}): RevenueDayRow => ({
  date,
  visits: 11,
  newPatients: 2,
  returnVisits: 9,
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
  // 참고 금액(first90 AC-4406.3): 확인된 날·열쇠가 없는 답은 null로 보낸다
  rough_total: null,
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

// 옛 매출 탭 저장(saveMonth·loadRevenue)과 그 시험은 지웠다(stats-revenue TASK-8, AC-4110.4). 통계 매출 칸은 아래 saveRange·읽기 셋만 쓴다
describe('AC-4110.4 옛 매출 탭 저장 함수가 없다', () => {
  it('AC-4110.4 저장소에는 saveRange·loadDays·codeTotals·monthCodes만 있고 saveMonth·loadRevenue가 없다', () => {
    const store = createRevenueStore(fakeClient().client)
    expect(Object.keys(store).sort()).toEqual(['codeTotals', 'loadDays', 'monthCodes', 'saveRange'])
    expect('saveMonth' in store).toBe(false)
    expect('loadRevenue' in store).toBe(false)
  })

  it('AC-4110.4 소스에 옛 함수와 옛 저장 모양(RevenueStore)이 없다', () => {
    const source = readFileSync(join(process.cwd(), 'src/lib/storage/revenue.ts'), 'utf8')
    for (const name of ['saveMonth', 'loadRevenue']) expect(source, name).not.toContain(name)
    expect(source).not.toMatch(/\bexport type RevenueStore\b/)
  })
})

const dbCode = (month: string, codeName: string) => ({ month, code: codeName, name: '가짜 처방', count: 3, amount: 900 })

const columnsOf = (call: Recorded) => (call.columns ?? '').split(',').map((column) => column.trim()).sort()

// ── 통계 매출(stats-revenue TASK-3, REQ-4104 · AC-4104.3·AC-4104.4): 날 단위 저장 함수 하나 · 읽기 셋 ──

const RANGE = { from: '2026-09-01', to: '2026-09-02' }
const DAY_CODES: RevenueDayCodeRow[] = [
  ['2026-09-01', 'AA100', 7, 3500],
  ['2026-09-01', '_REST', 2, null],
  ['2026-09-02', 'AA100', 0, 0],
]
const withCodes = (): RevenueDaysResult => ({ ...september(), dayCodes: DAY_CODES })
const RPC_KEYS = ['p_day_codes', 'p_days', 'p_from', 'p_to']
const DAY_CODE_KEYS = ['amount', 'code', 'count', 'day']

describe('AC-4104.3 saveRange', () => {
  it('AC-4104.3 save_revenue_range 하나만 부르고 표에 직접 쓰지 않는다', async () => {
    const { client, calls } = fakeClient()
    await createRevenueStore(client).saveRange(RANGE, withCodes())
    expect(steps(calls)).toEqual([['save_revenue_range', 'rpc']])
  })

  it('AC-4104.3·AC-4406.3 인자는 정확히 넷: p_from·p_to = 덩어리 범위, p_days = 날 줄(rough_total 포함), p_day_codes = 날 단위 코드 줄', async () => {
    const { client, calls } = fakeClient()
    await createRevenueStore(client).saveRange(RANGE, withCodes())
    const args = calls[0].args ?? {}
    expect(Object.keys(args).sort()).toEqual(RPC_KEYS)
    expect(args).toEqual({
      p_from: '2026-09-01',
      p_to: '2026-09-02',
      p_days: [sentDay('2026-09-01'), sentDay('2026-09-02')],
      p_day_codes: [
        { day: '2026-09-01', code: 'AA100', count: 7, amount: 3500 },
        { day: '2026-09-01', code: '_REST', count: 2, amount: null },
        { day: '2026-09-02', code: 'AA100', count: 0, amount: 0 },
      ],
    })
  })

  it('AC-4104.3·AC-4406.3 날 줄은 정해 둔 열다섯 칸 + rough_total(snake_case)뿐이고, 표시·null 칸이 그대로 간다', async () => {
    const { client, calls } = fakeClient()
    const split = day('2026-09-02', { splitUnconfirmed: true, insurer: null, noncovered: null, copay: null, otherTotal: null })
    await createRevenueStore(client).saveRange(RANGE, { days: [day('2026-09-01'), split], codes: [], dayCodes: [] })
    const sent = calls[0].args?.p_days as Record<string, unknown>[]
    expect(sent).toEqual([
      sentDay('2026-09-01'),
      { ...sentDay('2026-09-02'), split_unconfirmed: true, insurer: null, noncovered: null, copay: null, other_total: null },
    ])
    for (const row of sent) expect(Object.keys(row).sort()).toEqual(DAY_COLUMNS)
  })

  it('AC-4104.3 날 단위 코드 줄은 {day, code, count, amount} 새 객체다(튜플을 그대로 보내지 않는다)', async () => {
    const { client, calls } = fakeClient()
    await createRevenueStore(client).saveRange(RANGE, withCodes())
    const sent = calls[0].args?.p_day_codes as unknown[]
    expect(sent).toHaveLength(3)
    for (const row of sent) {
      expect(Array.isArray(row)).toBe(false)
      expect(Object.keys(row as object).sort()).toEqual(DAY_CODE_KEYS)
    }
  })

  it('AC-4104.3 옛 도우미 답(dayCodes 없음)이면 p_day_codes는 null이다', async () => {
    const { client, calls } = fakeClient()
    await createRevenueStore(client).saveRange(RANGE, september())
    expect(calls[0].args).toHaveProperty('p_day_codes', null)
    expect(Object.keys(calls[0].args ?? {}).sort()).toEqual(RPC_KEYS)
  })

  it('AC-4104.3 새 도우미의 빈 dayCodes는 null이 아니라 빈 목록으로 보낸다(그 범위에 처방이 없다는 뜻)', async () => {
    const { client, calls } = fakeClient()
    await createRevenueStore(client).saveRange(RANGE, { ...september(), dayCodes: [] })
    expect(calls[0].args).toHaveProperty('p_day_codes', [])
  })

  it('AC-4104.3 기간 합계 codes는 보내지 않는다(날 단위 줄로 센다)', async () => {
    const { client, calls } = fakeClient()
    await createRevenueStore(client).saveRange(RANGE, withCodes())
    expect(JSON.stringify(calls[0].args)).not.toContain('가짜 처방')
  })

  it('AC-4104.3·AC-4406.3 답에 정해 두지 않은 칸이 섞여 있어도 보내지 않는다(chart·name·hospital_id·fetched_at 없음, 칸은 열다섯 + rough_total)', async () => {
    const { client, calls } = fakeClient()
    const planted = { chart: '900001', name: '가상환자01', hospital_id: 'h-1', fetched_at: '2026-01-01T00:00:00+00:00' }
    await createRevenueStore(client).saveRange(RANGE, {
      days: [{ ...day('2026-09-01'), ...planted }, day('2026-09-02')],
      codes: [],
      dayCodes: [['2026-09-01', 'AA100', 7, 3500, '900001'] as unknown as RevenueDayCodeRow],
    })
    const args = calls[0].args ?? {}
    expect(Object.keys(args).sort()).toEqual(RPC_KEYS)
    for (const row of args.p_days as Record<string, unknown>[]) expect(Object.keys(row).sort()).toEqual(DAY_COLUMNS)
    expect(args.p_day_codes).toEqual([{ day: '2026-09-01', code: 'AA100', count: 7, amount: 3500 }])
    const sent = JSON.stringify(args)
    for (const text of ['900001', '가상환자01', 'h-1', 'fetched_at', 'hospital_id']) expect(sent).not.toContain(text)
  })

  it('AC-4104.3 함수 오류면 E-REVENUE-SAVE-FAILED이고 서버 글은 버린다', async () => {
    const { client } = fakeClient(() => ({ error: { message: RAW } }))
    expectFailure(await failure(() => createRevenueStore(client).saveRange(RANGE, withCodes())), 'E-REVENUE-SAVE-FAILED')
  })

  it('AC-4104.3 부르다 예외가 나도(네트워크) 같은 번호만 던지고 글을 버린다', async () => {
    const { client } = fakeClient(() => {
      throw new Error(RAW)
    })
    expectFailure(await failure(() => createRevenueStore(client).saveRange(RANGE, withCodes())), 'E-REVENUE-SAVE-FAILED')
  })
})

/** 표(또는 함수)마다 줄을 주는 가짜. 실제 서버처럼 한 번에 cap줄까지만 준다 */
function pagedClient(rows: Record<string, unknown[]>, cap = 1000) {
  return fakeClient((call) => {
    const all = rows[call.table] ?? []
    const [from, to] = call.range ?? [0, cap - 1]
    return { data: all.slice(from, Math.min(to + 1, from + cap)) }
  })
}

const savedDb = (date: string, dayCodes: boolean) => ({ ...sentDay(date), day_codes: dayCodes })
const totalDb = (c: string) => ({ code: c, count: 12, amount: 34_000, missing: false })
const PAGES: [number, number][] = [
  [2345, 1000],
  [2000, 1000],
  [1000, 1000],
  [1200, 500],
]

describe('AC-4104.4 loadDays', () => {
  it('AC-4104.4 sales_days에서 범위 첫날~끝날을 day 차례로 읽고 쓰기는 없다', async () => {
    const { client, calls } = pagedClient({})
    await createRevenueStore(client).loadDays({ from: '2026-08-17', to: '2026-11-13' })
    expect(steps(calls)).toEqual([['sales_days', 'select']])
    expect(calls[0].filters).toEqual([
      ['gte', 'day', '2026-08-17'],
      ['lte', 'day', '2026-11-13'],
    ])
    expect(calls[0].orders).toEqual(['day'])
  })

  it('AC-4104.4·AC-4406.3 칸을 골라 읽는다: 열다섯 칸 + rough_total + day_codes(hospital_id·fetched_at은 읽지 않는다)', async () => {
    const { client, calls } = pagedClient({})
    await createRevenueStore(client).loadDays(RANGE)
    expect(columnsOf(calls[0])).toEqual([...DAY_COLUMNS, 'day_codes'].sort())
  })

  it('AC-4104.4·AC-4406.3 날 줄을 camelCase로, 날 단위 처방 금액이 있는지를 dayCodes로, 참고 금액을 roughTotal로 돌려준다', async () => {
    const splitDb = { ...savedDb('2026-09-02', false), split_unconfirmed: true, insurer: null, noncovered: null, copay: null, other_total: null }
    const { client } = pagedClient({ sales_days: [savedDb('2026-09-01', true), splitDb] })
    const days = await createRevenueStore(client).loadDays(RANGE)
    expect(days).toEqual([
      { ...day('2026-09-01'), dayCodes: true, roughTotal: null },
      { ...day('2026-09-02', { splitUnconfirmed: true, insurer: null, noncovered: null, copay: null, otherTotal: null }), dayCodes: false, roughTotal: null },
    ])
    for (const row of days) expect(Object.keys(row).sort()).toEqual([...Object.keys(day('2026-09-01')), 'dayCodes', 'roughTotal'].sort())
  })

  it('AC-4104.4 줄이 없으면 빈 목록이다', async () => {
    const { client } = pagedClient({})
    await expect(createRevenueStore(client).loadDays(RANGE)).resolves.toEqual([])
  })

  it.each(PAGES)('AC-4104.4 날 줄 %i개를 서버가 한 번에 %i줄씩만 줘도 빈 쪽까지 읽어 빠짐없이 돌려준다', async (count, cap) => {
    const rows = Array.from({ length: count }, (_, i) => savedDb(addDays('2020-01-01', i), i % 2 === 0))
    const { client, calls } = pagedClient({ sales_days: rows }, cap)
    const days = await createRevenueStore(client).loadDays({ from: '2020-01-01', to: '2026-11-13' })
    expect(days.map((row) => row.date)).toEqual(rows.map((row) => row.day))
    const ranges = calls.map((call) => call.range)
    expect(ranges[0]).toEqual([0, 999])
    expect(calls.at(-1)?.range?.[0]).toBe(count)
    for (const call of calls) expect(call.orders).toEqual(['day'])
  })

  it('AC-4104.4 읽기가 실패하면 빈 목록을 돌려주지 않고 E-STATS-READ-FAILED만 던진다(글을 버린다)', async () => {
    const { client } = fakeClient(() => ({ error: { message: RAW } }))
    expectFailure(await failure(() => createRevenueStore(client).loadDays(RANGE)), 'E-STATS-READ-FAILED')
  })

  it('AC-4104.4 둘째 쪽 읽기가 실패해도 일부만 돌려주지 않는다', async () => {
    const rows = Array.from({ length: 1000 }, (_, i) => savedDb(addDays('2020-01-01', i), true))
    const { client } = fakeClient((call) => (call.range?.[0] === 0 ? { data: rows } : { error: { message: RAW } }))
    expectFailure(await failure(() => createRevenueStore(client).loadDays(RANGE)), 'E-STATS-READ-FAILED')
  })

  it('AC-4104.4 읽다 예외가 나도(네트워크) 번호만 던진다', async () => {
    const { client } = fakeClient(() => {
      throw new Error(RAW)
    })
    expectFailure(await failure(() => createRevenueStore(client).loadDays(RANGE)), 'E-STATS-READ-FAILED')
  })
})

describe('AC-4104.4 codeTotals', () => {
  it('AC-4104.4 sales_code_totals 함수를 인자 p_from·p_to로 부르고 code 차례로 읽는다', async () => {
    const { client, calls } = pagedClient({})
    await createRevenueStore(client).codeTotals({ from: '2026-10-16', to: '2026-11-13' })
    expect(steps(calls)).toEqual([['sales_code_totals', 'rpc']])
    expect(calls[0].args).toEqual({ p_from: '2026-10-16', p_to: '2026-11-13' })
    expect(calls[0].orders).toEqual(['code'])
  })

  it('AC-4104.4 코드마다 code·count·amount·missing 네 칸을 돌려준다', async () => {
    const { client } = pagedClient({
      sales_code_totals: [totalDb('AA100'), { code: '_REST', count: 3, amount: 0, missing: true, hospital_id: 'h-1' }],
    })
    const totals = await createRevenueStore(client).codeTotals(RANGE)
    expect(totals).toEqual([
      { code: 'AA100', count: 12, amount: 34_000, missing: false },
      { code: '_REST', count: 3, amount: 0, missing: true },
    ])
    for (const row of totals) expect(Object.keys(row).sort()).toEqual(['amount', 'code', 'count', 'missing'])
  })

  it.each(PAGES)('AC-4104.4 코드 합계 %i줄을 서버가 한 번에 %i줄씩만 줘도 빈 쪽까지 읽는다', async (count, cap) => {
    const rows = Array.from({ length: count }, (_, i) => totalDb(`C${i}`))
    const { client, calls } = pagedClient({ sales_code_totals: rows }, cap)
    const totals = await createRevenueStore(client).codeTotals(RANGE)
    expect(totals.map((row) => row.code)).toEqual(rows.map((row) => row.code))
    expect(calls[0].range).toEqual([0, 999])
    for (const call of calls) {
      expect(call.table).toBe('sales_code_totals')
      expect(call.args).toEqual({ p_from: RANGE.from, p_to: RANGE.to })
    }
  })

  it('AC-4104.4 함수 오류면 E-STATS-READ-FAILED만 던진다(빈 목록 아님, 글을 버린다)', async () => {
    const { client } = fakeClient(() => ({ error: { message: RAW } }))
    expectFailure(await failure(() => createRevenueStore(client).codeTotals(RANGE)), 'E-STATS-READ-FAILED')
  })

  it('AC-4104.4 둘째 쪽에서 실패해도 일부만 돌려주지 않는다', async () => {
    const rows = Array.from({ length: 1000 }, (_, i) => totalDb(`C${i}`))
    const { client } = fakeClient((call) => (call.range?.[0] === 0 ? { data: rows } : { error: { message: RAW } }))
    expectFailure(await failure(() => createRevenueStore(client).codeTotals(RANGE)), 'E-STATS-READ-FAILED')
  })

  it('AC-4104.4 부르다 예외가 나도 번호만 던진다', async () => {
    const { client } = fakeClient(() => {
      throw new Error(RAW)
    })
    expectFailure(await failure(() => createRevenueStore(client).codeTotals(RANGE)), 'E-STATS-READ-FAILED')
  })
})

describe('AC-4104.4 monthCodes', () => {
  it('AC-4104.4 옛 sales_codes에서 첫 달~끝 달(YYYY-MM-01)을 month·code 차례로 읽고 쓰기는 없다', async () => {
    const { client, calls } = pagedClient({})
    await createRevenueStore(client).monthCodes('2025-12', '2026-11')
    expect(steps(calls)).toEqual([['sales_codes', 'select']])
    expect(calls[0].filters).toEqual([
      ['gte', 'month', '2025-12-01'],
      ['lte', 'month', '2026-11-01'],
    ])
    expect(calls[0].orders).toEqual(['month', 'code'])
    expect(columnsOf(calls[0])).toEqual(CODE_COLUMNS)
  })

  it("AC-4104.4 이름을 포함해 돌려주고 month는 'YYYY-MM'이다", async () => {
    const { client } = pagedClient({
      sales_codes: [dbCode('2026-09-01', 'AA100'), { month: '2026-10-01', code: '_REST', name: null, count: 2, amount: null }],
    })
    const codes = await createRevenueStore(client).monthCodes('2026-09', '2026-10')
    expect(codes).toEqual([
      { month: '2026-09', code: 'AA100', name: '가짜 처방', count: 3, amount: 900 },
      { month: '2026-10', code: '_REST', name: null, count: 2, amount: null },
    ])
  })

  it.each(PAGES)('AC-4104.4 달 합계 %i줄을 서버가 한 번에 %i줄씩만 줘도 빈 쪽까지 읽는다', async (count, cap) => {
    const rows = Array.from({ length: count }, (_, i) => dbCode('2026-09-01', `C${i}`))
    const { client } = pagedClient({ sales_codes: rows }, cap)
    const codes = await createRevenueStore(client).monthCodes('2026-09', '2026-09')
    expect(codes.map((row) => row.code)).toEqual(rows.map((row) => row.code))
  })

  it('AC-4104.4 읽기가 실패하면 E-STATS-READ-FAILED만 던진다(빈 목록 아님, 글을 버린다)', async () => {
    const { client } = fakeClient(() => ({ error: { message: RAW } }))
    expectFailure(await failure(() => createRevenueStore(client).monthCodes('2026-09', '2026-09')), 'E-STATS-READ-FAILED')
  })

  it('AC-4104.4 둘째 쪽에서 실패해도 일부만 돌려주지 않는다', async () => {
    const rows = Array.from({ length: 1000 }, (_, i) => dbCode('2026-09-01', `C${i}`))
    const { client } = fakeClient((call) => (call.range?.[0] === 0 ? { data: rows } : { error: { message: RAW } }))
    expectFailure(await failure(() => createRevenueStore(client).monthCodes('2026-09', '2026-09')), 'E-STATS-READ-FAILED')
  })

  it('AC-4104.4 읽다 예외가 나도 번호만 던진다', async () => {
    const { client } = fakeClient(() => {
      throw new Error(RAW)
    })
    expectFailure(await failure(() => createRevenueStore(client).monthCodes('2026-09', '2026-09')), 'E-STATS-READ-FAILED')
  })
})

// ── 참고 금액 roughTotal ↔ rough_total(first90 TASK-3, REQ-4406 · AC-4406.3). 금액은 모두 지어낸 값이다 ──

/** 확인 필요한 날(금액 아홉 칸 null). over로 roughTotal을 단다 */
const uncheckedDay = (date: string, over: Partial<RevenueDayRow> = {}): RevenueDayRow =>
  day(date, {
    total: null,
    insurer: null,
    noncovered: null,
    copay: null,
    otherTotal: null,
    cash: null,
    card: null,
    transfer: null,
    receivableIn: null,
    unconfirmed: true,
    ...over,
  })
const MONEY_NULLS = {
  total: null,
  insurer: null,
  noncovered: null,
  copay: null,
  other_total: null,
  cash: null,
  card: null,
  transfer: null,
  receivable_in: null,
}
/** 저장된 확인 필요한 날 줄(표 칸 이름) */
const uncheckedDb = (date: string, rough: number | null) => ({ ...savedDb(date, true), ...MONEY_NULLS, unconfirmed: true, rough_total: rough })

describe('AC-4406.3 참고 금액 저장·읽기', () => {
  it('AC-4406.3 저장: 확인 필요한 날의 roughTotal을 rough_total로 보내고(음수·0 포함), 열쇠가 없는 날은 null이다', async () => {
    const { client, calls } = fakeClient()
    const days = [uncheckedDay('2026-09-01', { roughTotal: -52_000 }), uncheckedDay('2026-09-02', { roughTotal: 0 }), uncheckedDay('2026-09-03')]
    await createRevenueStore(client).saveRange({ from: '2026-09-01', to: '2026-09-03' }, { days, codes: [], dayCodes: [] })
    const sent = calls[0].args?.p_days as Record<string, unknown>[]
    expect(sent.map((row) => row.rough_total)).toEqual([-52_000, 0, null])
    expect(sent[0]).toEqual({ ...sentDay('2026-09-01'), ...MONEY_NULLS, unconfirmed: true, rough_total: -52_000 })
    for (const row of sent) expect(Object.keys(row).sort()).toEqual(DAY_COLUMNS)
  })

  it('AC-4406.3 저장: 옛 도우미 답(dayCodes·roughTotal 없음)도 rough_total null로 보낸다', async () => {
    const { client, calls } = fakeClient()
    await createRevenueStore(client).saveRange(RANGE, { days: [day('2026-09-01'), uncheckedDay('2026-09-02')], codes: [] })
    const sent = calls[0].args?.p_days as Record<string, unknown>[]
    expect(sent.map((row) => row.rough_total)).toEqual([null, null])
    expect(calls[0].args).toHaveProperty('p_day_codes', null)
  })

  it('AC-4406.3 읽기: rough_total을 roughTotal로 돌려준다(음수·0 그대로, 확인된 날은 null)', async () => {
    const { client } = pagedClient({
      sales_days: [uncheckedDb('2026-09-01', -52_000), uncheckedDb('2026-09-02', 0), uncheckedDb('2026-09-03', 870_000), savedDb('2026-09-04', true)],
    })
    const days = await createRevenueStore(client).loadDays({ from: '2026-09-01', to: '2026-09-04' })
    expect(days.map((row) => [row.date, row.unconfirmed, row.roughTotal])).toEqual([
      ['2026-09-01', true, -52_000],
      ['2026-09-02', true, 0],
      ['2026-09-03', true, 870_000],
      ['2026-09-04', false, null],
    ])
    expect(days[0]).toEqual({ ...uncheckedDay('2026-09-01'), dayCodes: true, roughTotal: -52_000 })
  })

  it('AC-4406.3 읽기: 옛 줄(참고 금액을 모르는 확인 필요한 날, rough_total null)은 roughTotal null이다', async () => {
    const { client } = pagedClient({ sales_days: [uncheckedDb('2026-09-01', null)] })
    const [row] = await createRevenueStore(client).loadDays(RANGE)
    expect(row).toHaveProperty('roughTotal', null)
  })

  it('AC-4406.3 읽기: 답 줄에 rough_total 칸이 아예 없어도 roughTotal은 undefined가 아니라 null이다', async () => {
    const legacy: Record<string, unknown> = { ...uncheckedDb('2026-09-01', null) }
    delete legacy.rough_total
    const { client } = pagedClient({ sales_days: [legacy] })
    const [row] = await createRevenueStore(client).loadDays(RANGE)
    expect(row).toHaveProperty('roughTotal', null)
  })
})

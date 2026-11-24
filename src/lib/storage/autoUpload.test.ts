import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AutoUploadError, claimUpload, readMyUploadPlan, readSavedSalesDays, readStatsMarks, reportUpload } from './autoUpload'

// 저절로 올리기 — 의원 쪽 브라우저 함수(spec admin-view REQ-8020 AC-8020.3, design.md '저절로 올리기 — 셈 · 글 · 브라우저 함수').
// 실제 Supabase에 붙지 않는다. 어느 rpc·표에 어떤 값이 몇 번 나가는지(쪽 나눔 포함)와 답을 바꾼 모양만 본다.
// 권한(원장만·보는 중 막음·잡은 탭만 보고)은 supabase/adminSync.rls.test.ts가 증명한다
type Call = [string, ...unknown[]]
type Reply = { data: unknown; error: unknown }

const { rpc, from, supabaseBrowser, tables } = vi.hoisted(() => {
  const tables: Record<string, { log: [string, ...unknown[]][]; replies: (Reply | Error)[] }> = {}
  const rpc = vi.fn()
  const from = vi.fn((table: string) => {
    const entry = tables[table]
    if (!entry) throw new Error(`표 흉내 없음: ${table}`)
    const query: Record<string, unknown> = {}
    for (const method of ['select', 'gte', 'lte', 'order']) {
      query[method] = (...args: unknown[]) => {
        entry.log.push([method, ...args])
        return query
      }
    }
    query.range = (first: number, last: number) => {
      entry.log.push(['range', first, last])
      const reply = entry.replies.shift() ?? { data: [], error: null }
      return reply instanceof Error ? Promise.reject(reply) : Promise.resolve(reply)
    }
    return query
  })
  const supabaseBrowser = vi.fn(() => ({ rpc, from }))
  return { rpc, from, supabaseBrowser, tables }
})
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser }))

const RAW = 'permission denied for function claim_auto_upload (secret detail)'
const TAB = '30000000-0000-4000-8000-000000000001'
const MARK = 'a'.repeat(64)

/** 표 흉내: 쪽마다 답(차례대로). 다 쓰면 빈 쪽 */
function fakeTable(name: string, replies: (Reply | Error)[]) {
  tables[name] = { log: [], replies: [...replies] }
  return tables[name].log as Call[]
}
const page = (data: unknown[]): Reply => ({ data, error: null })
const rangesOf = (log: Call[]) => log.filter(([method]) => method === 'range').map(([, a, b]) => [a, b])

beforeEach(() => {
  rpc.mockReset()
  rpc.mockResolvedValue({ data: null, error: null, status: 204 })
  from.mockClear()
  supabaseBrowser.mockClear()
  for (const key of Object.keys(tables)) delete tables[key]
})

async function caught(run: () => Promise<unknown>): Promise<Error> {
  const thrown = await run().then(
    () => undefined,
    (e: unknown) => e,
  )
  expect(thrown).toBeInstanceOf(AutoUploadError)
  expect(String((thrown as Error).message)).not.toContain('secret')
  return thrown as Error
}

describe('readMyUploadPlan(): rpc my_auto_upload_plan → { months, throughDay } | null', () => {
  it('AC-8020.3: my_auto_upload_plan을 인자 없이 한 번만 부르고 표는 읽지 않는다 — 한 줄이면 두 칸', async () => {
    rpc.mockResolvedValue({ data: [{ months: 12, through_day: '2026-11-23' }], error: null })
    await expect(readMyUploadPlan()).resolves.toEqual({ months: 12, throughDay: '2026-11-23' })
    expect(rpc).toHaveBeenCalledExactlyOnceWith('my_auto_upload_plan')
    expect(from).not.toHaveBeenCalled()
  })

  it('AC-8020.3: 아직 올라온 날이 없으면 throughDay null, 줄이 없으면(원장 아님·데스크·승인 전·보는 중) null', async () => {
    rpc.mockResolvedValue({ data: [{ months: 2, through_day: null }], error: null })
    await expect(readMyUploadPlan()).resolves.toEqual({ months: 2, throughDay: null })
    rpc.mockResolvedValue({ data: [], error: null })
    await expect(readMyUploadPlan()).resolves.toBeNull()
  })

  it.each([
    ['목록 아님', { months: 2, through_day: null }],
    ['null', null],
    ['두 줄', [{ months: 2, through_day: null }, { months: 2, through_day: null }]],
    ['아홉 밖 달 수', [{ months: 5, through_day: null }]],
    ['달 수 글자', [{ months: '2', through_day: null }]],
    ['날 모양 아님', [{ months: 2, through_day: '2026/11/23' }]],
    ['줄이 객체 아님', ['x']],
  ])('AC-8020.3: 답 모양이 틀리면(%s) AutoUploadError', async (_label, data) => {
    rpc.mockResolvedValue({ data, error: null })
    await caught(() => readMyUploadPlan())
  })
})

describe('claimUpload(): rpc claim_auto_upload → boolean', () => {
  it('AC-8020.3: claim_auto_upload({ p_tab, p_bit_mark })를 한 번만 부르고 잡았는지를 준다', async () => {
    rpc.mockResolvedValue({ data: true, error: null })
    await expect(claimUpload(TAB, MARK)).resolves.toBe(true)
    expect(rpc).toHaveBeenCalledExactlyOnceWith('claim_auto_upload', { p_tab: TAB, p_bit_mark: MARK })
    rpc.mockClear()
    rpc.mockResolvedValue({ data: false, error: null })
    await expect(claimUpload(TAB, null)).resolves.toBe(false)
    expect(rpc).toHaveBeenCalledExactlyOnceWith('claim_auto_upload', { p_tab: TAB, p_bit_mark: null })
  })

  it.each([null, 'true', 1, [true]])('AC-8020.3: 답이 참·거짓이 아니면(%j) AutoUploadError', async (data) => {
    rpc.mockResolvedValue({ data, error: null })
    await caught(() => claimUpload(TAB, MARK))
  })
})

describe('reportUpload(): rpc report_auto_upload', () => {
  it('AC-8020.3: report_auto_upload({ p_tab, p_through, p_filled_from, p_error, p_done })를 한 번만 부른다', async () => {
    await expect(reportUpload(TAB, { through: '2026-11-23', filledFrom: '2026-10-01', error: null, done: false })).resolves.toBeUndefined()
    expect(rpc).toHaveBeenCalledExactlyOnceWith('report_auto_upload', {
      p_tab: TAB,
      p_through: '2026-11-23',
      p_filled_from: '2026-10-01',
      p_error: null,
      p_done: false,
    })
    rpc.mockClear()
    await reportUpload(TAB, { through: null, filledFrom: null, error: 'E-HELPER-OLD', done: true })
    expect(rpc).toHaveBeenCalledExactlyOnceWith('report_auto_upload', { p_tab: TAB, p_through: null, p_filled_from: null, p_error: 'E-HELPER-OLD', p_done: true })
  })
})

describe('readSavedSalesDays(): sales_days 네 칸을 1,000줄씩', () => {
  const saved = (i: number) => ({ day: `2026-${String(1 + Math.floor(i / 28) % 12).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`, day_codes: true, unconfirmed: false, rough_total: null })

  it('AC-8020.3: sales_days에서 day·day_codes·unconfirmed·rough_total만 기간 안(날 차례)으로 고르고 SavedRevenueDay 칸 이름으로 준다', async () => {
    const log = fakeTable('sales_days', [
      page([
        { day: '2026-09-01', day_codes: true, unconfirmed: false, rough_total: null },
        { day: '2026-11-23', day_codes: false, unconfirmed: true, rough_total: 1234500 },
      ]),
    ])
    await expect(readSavedSalesDays('2026-09-01', '2026-11-23')).resolves.toEqual([
      { date: '2026-09-01', dayCodes: true, unconfirmed: false, roughTotal: null },
      { date: '2026-11-23', dayCodes: false, unconfirmed: true, roughTotal: 1234500 },
    ])
    expect(from).toHaveBeenCalledExactlyOnceWith('sales_days')
    expect(log).toEqual([
      ['select', 'day, day_codes, unconfirmed, rough_total'],
      ['gte', 'day', '2026-09-01'],
      ['lte', 'day', '2026-11-23'],
      ['order', 'day'],
      ['range', 0, 999],
    ])
    expect(rpc).not.toHaveBeenCalled()
  })

  it.each([
    [0, [[0, 999]]],
    [1000, [[0, 999], [1000, 1999]]],
    [1001, [[0, 999], [1000, 1999]]],
  ] as const)('AC-8020.3: %i줄이면 쪽 %j를 읽는다(짧은 쪽이 오면 멈춤)', async (total, ranges) => {
    const all = Array.from({ length: total }, (_, i) => saved(i))
    const log = fakeTable('sales_days', [page(all.slice(0, 1000)), page(all.slice(1000, 2000))])
    expect(await readSavedSalesDays('2016-11-01', '2026-11-23')).toHaveLength(total)
    expect(rangesOf(log)).toEqual(ranges)
  })

  it.each([
    ['날 모양 아님', { day: '2026-9-1', day_codes: true, unconfirmed: false, rough_total: null }],
    ['day_codes 없음', { day: '2026-09-01', unconfirmed: false, rough_total: null }],
    ['unconfirmed 글자', { day: '2026-09-01', day_codes: true, unconfirmed: 'no', rough_total: null }],
    ['rough_total 글자', { day: '2026-09-01', day_codes: true, unconfirmed: true, rough_total: '100' }],
  ])('AC-8020.3: 줄 모양이 틀리면(%s) AutoUploadError', async (_label, row) => {
    fakeTable('sales_days', [page([row])])
    await caught(() => readSavedSalesDays('2026-09-01', '2026-11-23'))
  })
})

describe('readStatsMarks(): 통계 날 줄·달 줄 표시만 1,000줄씩', () => {
  it('AC-8020.3: 날 줄은 day·partial·payload->sunap(있는지만), 달 줄은 month·partial·payload->dropoff->>asOf만 고르고 합계 몸통은 주지 않는다', async () => {
    const days = fakeTable('stats_days', [
      page([
        { day: '2026-09-01', partial: false, sunap: { blocks: 3 } },
        { day: '2026-09-02', partial: false, sunap: null },
        { day: '2026-11-23', partial: true, sunap: null },
      ]),
    ])
    const months = fakeTable('stats_months', [
      page([
        { month: '2026-09', partial: false, asOf: '2026-11-23' },
        { month: '2026-10', partial: false, asOf: null },
      ]),
    ])
    await expect(readStatsMarks('2026-09-01', '2026-11-23')).resolves.toEqual({
      days: [
        { day: '2026-09-01', partial: false, hasSunap: true },
        { day: '2026-09-02', partial: false, hasSunap: false },
        { day: '2026-11-23', partial: true, hasSunap: false },
      ],
      months: [
        { month: '2026-09', partial: false, dropoffAsOf: '2026-11-23' },
        { month: '2026-10', partial: false, dropoffAsOf: null },
      ],
    })
    expect(from.mock.calls.map(([table]) => table).sort()).toEqual(['stats_days', 'stats_months'])
    expect(days).toEqual([
      ['select', 'day, partial, sunap:payload->sunap'],
      ['gte', 'day', '2026-09-01'],
      ['lte', 'day', '2026-11-23'],
      ['order', 'day'],
      ['range', 0, 999],
    ])
    expect(months).toEqual([
      ['select', 'month, partial, asOf:payload->dropoff->>asOf'],
      ['gte', 'month', '2026-09'],
      ['lte', 'month', '2026-11'],
      ['order', 'month'],
      ['range', 0, 999],
    ])
    expect(rpc).not.toHaveBeenCalled()
  })

  it.each([
    [0, [[0, 999]]],
    [1000, [[0, 999], [1000, 1999]]],
    [1001, [[0, 999], [1000, 1999]]],
  ] as const)('AC-8020.3: 날 줄 %i줄이면 쪽 %j를 읽는다', async (total, ranges) => {
    const all = Array.from({ length: total }, (_, i) => ({ day: `20${String(10 + Math.floor(i / 336)).padStart(2, '0')}-${String(1 + (Math.floor(i / 28) % 12)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`, partial: false, sunap: null }))
    const log = fakeTable('stats_days', [page(all.slice(0, 1000)), page(all.slice(1000, 2000))])
    fakeTable('stats_months', [page([])])
    expect((await readStatsMarks('2016-11-01', '2026-11-23')).days).toHaveLength(total)
    expect(rangesOf(log)).toEqual(ranges)
  })

  it('AC-8020.3: 달 줄도 1,000줄이 차면 다음 쪽을 읽는다', async () => {
    const all = Array.from({ length: 1000 }, (_, i) => ({ month: `${1900 + Math.floor(i / 12)}-${String(1 + (i % 12)).padStart(2, '0')}`, partial: false, asOf: null }))
    fakeTable('stats_days', [page([])])
    const log = fakeTable('stats_months', [page(all), page([])])
    expect((await readStatsMarks('1900-01-01', '1983-04-30')).months).toHaveLength(1000)
    expect(rangesOf(log)).toEqual([
      [0, 999],
      [1000, 1999],
    ])
  })

  it.each([
    ['날 모양 아님', 'stats_days', { day: '2026/09/01', partial: false, sunap: null }],
    ['partial 없음', 'stats_days', { day: '2026-09-01', sunap: null }],
    ['달 모양 아님', 'stats_months', { month: '2026-13', partial: false, asOf: null }],
    ['asOf 숫자', 'stats_months', { month: '2026-09', partial: false, asOf: 20261123 }],
  ])('AC-8020.3: 줄 모양이 틀리면(%s) AutoUploadError', async (_label, table, row) => {
    fakeTable('stats_days', [page(table === 'stats_days' ? [row] : [])])
    fakeTable('stats_months', [page(table === 'stats_months' ? [row] : [])])
    await caught(() => readStatsMarks('2026-09-01', '2026-11-23'))
  })
})

describe('실패: Supabase 글 없이 AutoUploadError · 다시 부르지 않음', () => {
  const RPC_CALLS = [
    ['readMyUploadPlan', () => readMyUploadPlan()],
    ['claimUpload', () => claimUpload(TAB, MARK)],
    ['reportUpload', () => reportUpload(TAB, { through: null, filledFrom: null, error: null, done: true })],
  ] as const

  it.each(RPC_CALLS)('AC-8020.3: %s — 오류 답·던짐·클라이언트 만들기 실패 모두 AutoUploadError(한 번만 부름)', async (_name, run) => {
    rpc.mockResolvedValue({ data: null, error: { message: RAW, code: '42501' } })
    await caught(run)
    expect(rpc).toHaveBeenCalledTimes(1)
    rpc.mockReset()
    rpc.mockRejectedValue(new Error(RAW))
    await caught(run)
    expect(rpc).toHaveBeenCalledTimes(1)
    supabaseBrowser.mockImplementationOnce(() => {
      throw new Error(RAW)
    })
    await caught(run)
  })

  it.each([
    ['오류 답', { data: null, error: { message: RAW } }],
    ['던짐', new Error(RAW)],
    ['목록 아님', { data: { rows: [] }, error: null }],
  ] as const)('AC-8020.3: 표 읽기 둘 — 쪽이 %s면 AutoUploadError(다음 쪽·다시 읽기 없음)', async (_label, reply) => {
    const sales = fakeTable('sales_days', [reply as Reply | Error])
    await caught(() => readSavedSalesDays('2026-09-01', '2026-11-23'))
    expect(rangesOf(sales)).toEqual([[0, 999]])
    fakeTable('stats_days', [reply as Reply | Error])
    fakeTable('stats_months', [page([])])
    await caught(() => readStatsMarks('2026-09-01', '2026-11-23'))
  })

  it('AC-8020.3: 표 읽기 둘도 클라이언트 만들기 실패는 AutoUploadError', async () => {
    supabaseBrowser.mockImplementationOnce(() => {
      throw new Error(RAW)
    })
    await caught(() => readSavedSalesDays('2026-09-01', '2026-11-23'))
    supabaseBrowser.mockImplementationOnce(() => {
      throw new Error(RAW)
    })
    await caught(() => readStatsMarks('2026-09-01', '2026-11-23'))
  })
})

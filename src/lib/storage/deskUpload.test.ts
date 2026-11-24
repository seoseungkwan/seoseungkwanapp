import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AutoUploadError } from './autoUpload'
import { deskClaimUpload, deskReportUpload, readDeskCoverage, readDeskSalesMarks, readDeskStatsMarks, readDeskUploadPlan } from './deskUpload'
import { StorageError } from './stats'

// 데스크 계정 올리기 — 브라우저 함수(spec admin-view REQ-8024 AC-8024.6, design.md '데스크 계정 올리기').
// 실제 Supabase에 붙지 않는다. 정의자 함수를 이름으로 부르는 모양(인자·쪽 나눔)과 답을 원장 읽기와 같은 모양으로 바꾸는지만 본다.
// 표(from)는 한 번도 부르지 않는다. 권한(데스크만·보는 중 막음·자기 병원만)은 TASK-20 SQL 시험이 증명한다. 날짜는 지어낸 값이다
type Reply = { data: unknown; error: unknown }
type Log = [string, ...unknown[]][]

const { rpc, from, supabaseBrowser, functions } = vi.hoisted(() => {
  const functions: Record<string, { log: [string, ...unknown[]][]; replies: (Reply | Error)[] }> = {}
  const rpc = vi.fn((fn: string, args?: unknown) => {
    const entry = functions[fn]
    if (!entry) throw new Error(`함수 흉내 없음: ${fn}`)
    entry.log.push(['rpc', args])
    const next = () => {
      const reply = entry.replies.shift() ?? { data: [], error: null }
      return reply instanceof Error ? Promise.reject(reply) : Promise.resolve(reply)
    }
    const query = {
      order: (...orderArgs: unknown[]) => {
        entry.log.push(['order', ...orderArgs])
        return query
      },
      range: (first: number, last: number) => {
        entry.log.push(['range', first, last])
        return next()
      },
      then: (ok: (value: unknown) => unknown, bad: (reason: unknown) => unknown) => next().then(ok, bad),
    }
    return query
  })
  const from = vi.fn(() => {
    throw new Error('데스크는 표를 바로 읽지 않는다')
  })
  const supabaseBrowser = vi.fn(() => ({ rpc, from }))
  return { rpc, from, supabaseBrowser, functions }
})
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser }))

const RAW = 'permission denied for function desk_sales_marks (secret detail)'
const TAB = '30000000-0000-4000-8000-000000000001'
const MARK = 'b'.repeat(64)

function fakeFunction(name: string, replies: (Reply | Error)[] = []): Log {
  functions[name] = { log: [], replies: [...replies] }
  return functions[name].log
}
const ok = (data: unknown): Reply => ({ data, error: null })
const rangesOf = (log: Log) => log.filter(([method]) => method === 'range').map(([, a, b]) => [a, b])

beforeEach(() => {
  rpc.mockClear()
  from.mockClear()
  supabaseBrowser.mockClear()
  for (const key of Object.keys(functions)) delete functions[key]
})

async function caught<E extends Error>(run: () => Promise<unknown>, type: new (...args: never[]) => E): Promise<E> {
  const thrown = await run().then(
    () => undefined,
    (e: unknown) => e,
  )
  expect(thrown).toBeInstanceOf(type)
  expect(String((thrown as Error).message)).not.toContain('secret')
  return thrown as E
}

describe('AC-8024.6 계획 · 잡기 · 보고 — 원장 함수와 같은 모양으로 desk_* 함수를 한 번씩', () => {
  it('AC-8024.6 readDeskUploadPlan: desk_upload_plan을 인자 없이 한 번 — 한 줄이면 { months, throughDay }, 줄이 없으면 null', async () => {
    const log = fakeFunction('desk_upload_plan', [ok([{ months: 12, through_day: '2026-11-23' }]), ok([{ months: 2, through_day: null }]), ok([])])
    await expect(readDeskUploadPlan()).resolves.toEqual({ months: 12, throughDay: '2026-11-23' })
    await expect(readDeskUploadPlan()).resolves.toEqual({ months: 2, throughDay: null })
    await expect(readDeskUploadPlan()).resolves.toBeNull()
    expect(log).toEqual([['rpc', undefined], ['rpc', undefined], ['rpc', undefined]])
    expect(from).not.toHaveBeenCalled()
  })

  it.each<[string, Reply | Error]>([
    ['오류 답', { data: null, error: { message: RAW } }],
    ['네트워크 예외', new Error(RAW)],
    ['줄이 둘', ok([{ months: 2, through_day: null }, { months: 2, through_day: null }])],
    ['고를 수 없는 달 수', ok([{ months: 7, through_day: null }])],
    ['날짜가 아닌 through_day', ok([{ months: 2, through_day: '2026-13-01' }])],
  ])('AC-8024.6 readDeskUploadPlan: %s이면 AutoUploadError(서버 글 없음)', async (_name, reply) => {
    fakeFunction('desk_upload_plan', [reply])
    await caught(() => readDeskUploadPlan(), AutoUploadError)
  })

  it('AC-8024.6 deskClaimUpload: desk_claim_upload(p_tab, p_bit_mark)를 한 번 — 참·거짓 그대로, 표시 null도 그대로 보낸다', async () => {
    const log = fakeFunction('desk_claim_upload', [ok(true), ok(false)])
    await expect(deskClaimUpload(TAB, MARK)).resolves.toBe(true)
    await expect(deskClaimUpload(TAB, null)).resolves.toBe(false)
    expect(log).toEqual([
      ['rpc', { p_tab: TAB, p_bit_mark: MARK }],
      ['rpc', { p_tab: TAB, p_bit_mark: null }],
    ])
  })

  it('AC-8024.6 deskClaimUpload: 참·거짓이 아니거나 실패면 AutoUploadError', async () => {
    fakeFunction('desk_claim_upload', [ok(null), { data: null, error: { message: RAW } }])
    await caught(() => deskClaimUpload(TAB, MARK), AutoUploadError)
    await caught(() => deskClaimUpload(TAB, MARK), AutoUploadError)
  })

  it('AC-8024.6 deskReportUpload: desk_report_upload에 다섯 칸(p_tab·p_through·p_filled_from·p_error·p_done)을 한 번, 실패면 AutoUploadError', async () => {
    const log = fakeFunction('desk_report_upload', [ok(null), { data: null, error: { message: RAW } }])
    await deskReportUpload(TAB, { through: '2026-11-23', filledFrom: '2026-09-01', error: 'E-BIT-READ-FAILED', done: false })
    expect(log).toEqual([['rpc', { p_tab: TAB, p_through: '2026-11-23', p_filled_from: '2026-09-01', p_error: 'E-BIT-READ-FAILED', p_done: false }]])
    await caught(() => deskReportUpload(TAB, { through: null, filledFrom: null, error: null, done: true }), AutoUploadError)
  })
})

describe('AC-8024.6 readDeskSalesMarks — desk_sales_marks → 원장 readSavedSalesDays와 같은 모양', () => {
  it('AC-8024.6 기간을 p_from·p_to로, 날 차례 1,000줄 쪽으로 다 읽고 { date, dayCodes, unconfirmed, roughTotal }로 바꾼다(has_rough면 표시용 0)', async () => {
    const first = Array.from({ length: 1000 }, () => ({ day: '2026-09-01', day_codes: true, unconfirmed: false, has_rough: false }))
    const log = fakeFunction('desk_sales_marks', [ok(first), ok([{ day: '2026-09-02', day_codes: false, unconfirmed: true, has_rough: true }])])
    const marks = await readDeskSalesMarks('2026-09-01', '2026-09-30')
    expect(marks).toHaveLength(1001)
    expect(marks[0]).toEqual({ date: '2026-09-01', dayCodes: true, unconfirmed: false, roughTotal: null })
    expect(marks[1000]).toEqual({ date: '2026-09-02', dayCodes: false, unconfirmed: true, roughTotal: 0 })
    expect(log.filter(([method]) => method === 'rpc')).toEqual([
      ['rpc', { p_from: '2026-09-01', p_to: '2026-09-30' }],
      ['rpc', { p_from: '2026-09-01', p_to: '2026-09-30' }],
    ])
    expect(log.filter(([method]) => method === 'order')).toEqual([
      ['order', 'day'],
      ['order', 'day'],
    ])
    expect(rangesOf(log)).toEqual([
      [0, 999],
      [1000, 1999],
    ])
    expect(from).not.toHaveBeenCalled()
  })

  it.each<[string, Reply | Error]>([
    ['오류 답', { data: null, error: { message: RAW } }],
    ['네트워크 예외', new Error(RAW)],
    ['목록이 아닌 답', ok({ day: '2026-09-01' })],
    ['날짜가 아닌 줄', ok([{ day: '2026-02-30', day_codes: true, unconfirmed: false, has_rough: false }])],
    ['참·거짓이 아닌 칸', ok([{ day: '2026-09-01', day_codes: 'yes', unconfirmed: false, has_rough: false }])],
    ['has_rough 없음', ok([{ day: '2026-09-01', day_codes: true, unconfirmed: false }])],
  ])('AC-8024.6 %s이면 반쪽 목록 대신 AutoUploadError', async (_name, reply) => {
    fakeFunction('desk_sales_marks', [reply])
    await caught(() => readDeskSalesMarks('2026-09-01', '2026-09-30'), AutoUploadError)
  })
})

describe('AC-8024.6 readDeskStatsMarks — 날·달 표시 함수 둘 → 원장 readStatsMarks와 같은 모양', () => {
  it('AC-8024.6 desk_stats_day_marks·desk_stats_month_marks를 같은 기간으로 쪽 읽기, 달은 YYYY-MM-01 → YYYY-MM, has_sunap → hasSunap', async () => {
    const dayLog = fakeFunction('desk_stats_day_marks', [
      ok([
        { day: '2026-09-01', partial: false, has_sunap: true },
        { day: '2026-11-23', partial: true, has_sunap: false },
      ]),
    ])
    const monthLog = fakeFunction('desk_stats_month_marks', [
      ok([
        { month: '2026-09-01', partial: false, dropoff_as_of: '2026-11-23' },
        { month: '2026-11-01', partial: true, dropoff_as_of: null },
      ]),
    ])
    await expect(readDeskStatsMarks('2026-09-01', '2026-11-23')).resolves.toEqual({
      days: [
        { day: '2026-09-01', partial: false, hasSunap: true },
        { day: '2026-11-23', partial: true, hasSunap: false },
      ],
      months: [
        { month: '2026-09', partial: false, dropoffAsOf: '2026-11-23' },
        { month: '2026-11', partial: true, dropoffAsOf: null },
      ],
    })
    expect(dayLog).toEqual([
      ['rpc', { p_from: '2026-09-01', p_to: '2026-11-23' }],
      ['order', 'day'],
      ['range', 0, 999],
    ])
    expect(monthLog).toEqual([
      ['rpc', { p_from: '2026-09-01', p_to: '2026-11-23' }],
      ['order', 'month'],
      ['range', 0, 999],
    ])
    expect(from).not.toHaveBeenCalled()
  })

  it.each<[string, string, Reply]>([
    ['날 줄 partial 없음', 'desk_stats_day_marks', ok([{ day: '2026-09-01', has_sunap: true }])],
    ['달이 1일이 아님', 'desk_stats_month_marks', ok([{ month: '2026-09-02', partial: false, dropoff_as_of: null }])],
    ['dropoff_as_of가 날짜 아님', 'desk_stats_month_marks', ok([{ month: '2026-09-01', partial: false, dropoff_as_of: 'soon' }])],
    ['오류 답', 'desk_stats_month_marks', { data: null, error: { message: RAW } }],
  ])('AC-8024.6 %s이면 AutoUploadError', async (_name, broken, reply) => {
    fakeFunction('desk_stats_day_marks')
    fakeFunction('desk_stats_month_marks')
    functions[broken].replies = [reply]
    await caught(() => readDeskStatsMarks('2026-09-01', '2026-11-23'), AutoUploadError)
  })
})

describe('AC-8024.6 readDeskCoverage — desk_stats_coverage → 원장 readCoverage와 같은 합친 기간', () => {
  it('AC-8024.6 기간을 p_from·p_to로 쪽 읽기(from_day·to_day 차례)하고 겹치거나 붙은 기간을 합친다', async () => {
    const log = fakeFunction('desk_stats_coverage', [
      ok([
        { from_day: '2026-09-01', to_day: '2026-09-15' },
        { from_day: '2026-09-16', to_day: '2026-10-10' },
        { from_day: '2026-10-05', to_day: '2026-10-20' },
        { from_day: '2026-11-01', to_day: '2026-11-23' },
      ]),
    ])
    await expect(readDeskCoverage({ from: '2026-09-01', to: '2026-11-23' })).resolves.toEqual([
      { from: '2026-09-01', to: '2026-10-20' },
      { from: '2026-11-01', to: '2026-11-23' },
    ])
    expect(log).toEqual([
      ['rpc', { p_from: '2026-09-01', p_to: '2026-11-23' }],
      ['order', 'from_day'],
      ['order', 'to_day'],
      ['range', 0, 999],
    ])
    expect(from).not.toHaveBeenCalled()
  })

  it.each<[string, Reply | Error]>([
    ['오류 답', { data: null, error: { message: RAW } }],
    ['네트워크 예외', new Error(RAW)],
    ['날짜가 아닌 줄', ok([{ from_day: 'x', to_day: '2026-09-15' }])],
  ])('AC-8024.6 %s이면 원장 길과 같은 E-STATS-READ-FAILED', async (_name, reply) => {
    fakeFunction('desk_stats_coverage', [reply])
    const error = await caught(() => readDeskCoverage({ from: '2026-09-01', to: '2026-11-23' }), StorageError)
    expect(error.code).toBe('E-STATS-READ-FAILED')
  })
})

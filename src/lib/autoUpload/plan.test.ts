import { describe, expect, it } from 'vitest'
import { addDays, addMonths, compareYmd, diffDays, eachDay, monthOf, monthRange } from '@/lib/analytics/dates'
import { MAX_READ_DAYS } from '@/components/stats/loadPlan'
import { REVENUE_MAX_DAYS } from '@/types/revenue'
import type { SavedSalesMark, StatsMarks } from '@/lib/storage/autoUpload'
import type { DateRange } from '@/types/dates'
import type { RevenueDayRow } from '@/types/revenue'
import { FILL_CHOICES, fillRange } from './range'
import { marksOfResult, progressOf, revenueSaved, uploadPlan, type PlanInput, type UploadTask } from './plan'

// 저절로 올리기 — 할 일 셈(spec admin-view REQ-8021 AC-8021.2·AC-8021.9, design.md '저절로 올리기 — 통계 조각'·'2차 기본값' 3·4).
// 순수 함수만 본다. 날짜·숫자는 모두 지어낸 값이다. 오늘은 2026-11-24(화) — 어제 11월 23일, 채울 기간 2달 = 9월 1일 ~ 11월 23일

const TODAY = '2026-11-24'
const YESTERDAY = '2026-11-23'
const FILL = { from: '2026-09-01', to: YESTERDAY }
const ALL_GROUPS = { rx: true, sunap: true }

const saved = (range: DateRange, over: Partial<SavedSalesMark> = {}): SavedSalesMark[] =>
  eachDay(range).map((date) => ({ date, dayCodes: true, unconfirmed: false, roughTotal: null, ...over }))
const NO_MARKS: StatsMarks = { days: [], months: [] }

// 다 올라온 2달(9·10·11월): 매출 다 저장, 통계 다 덮음, 날 줄마다 수납 합계, 끝난 달 줄마다 몇 번까지 받나(자료 끝 = 어제)
function doneMarks(range: DateRange = FILL): StatsMarks {
  const months: StatsMarks['months'] = []
  for (let month = monthOf(range.from); month <= monthOf(range.to); month = addMonths(month, 1)) {
    const finished = compareYmd(monthRange(month).to, YESTERDAY) <= 0
    months.push({ month, partial: !finished, dropoffAsOf: finished ? YESTERDAY : null })
  }
  return { days: eachDay(range).map((day) => ({ day, partial: false, hasSunap: true })), months }
}

function input(over: Partial<PlanInput> = {}): PlanInput {
  return {
    today: TODAY,
    months: 2,
    throughDay: YESTERDAY,
    sales: saved(FILL),
    coverage: [FILL],
    marks: doneMarks(),
    groups: ALL_GROUPS,
    helperVersion: '0.13.2',
    ...over,
  }
}

const revenue = (from: string, to: string): UploadTask => ({ kind: 'revenue', range: { from, to } })
const stats = (save: DateRange, read: DateRange): UploadTask => ({ kind: 'stats', part: { save, read } })
const statsOnly = (tasks: UploadTask[]) => tasks.filter((task) => task.kind === 'stats')
const endOf = (task: UploadTask) => (task.kind === 'revenue' ? task.range.to : task.part.save.to)

describe('AC-8021.2 uploadPlan — 할 일이 없으면 빈 목록', () => {
  it('AC-8021.2 매출·통계·합계가 다 올라왔고 그날 두 번째 열기(through_day = 어제)면 빈 목록이다', () => {
    expect(uploadPlan(input())).toEqual([])
  })

  it('AC-8021.2 그날 두 번째 열기면 저장된 어제 매출은 다시 읽지 않는다(어제는 그날 처음일 때만)', () => {
    expect(uploadPlan(input({ throughDay: '2026-11-30' }))).toEqual([])
  })
})

describe('AC-8021.2 uploadPlan — 어제 묶음 먼저, 그다음 끝날이 늦은 것부터', () => {
  it('AC-8021.2 처음(through_day 없음, 아무것도 없음): 어제가 든 매출 덩어리 → 어제까지 저장하는 통계 새 조각 → 옛 매출 덩어리 차례다', () => {
    const tasks = uploadPlan(input({ throughDay: null, sales: [], coverage: [], marks: NO_MARKS }))
    expect(tasks).toEqual([
      revenue('2026-10-24', '2026-11-23'),
      stats({ from: '2026-09-01', to: YESTERDAY }, { from: '2026-08-01', to: YESTERDAY }),
      revenue('2026-09-23', '2026-10-23'),
      revenue('2026-09-01', '2026-09-22'),
    ])
  })

  it('AC-8021.2 그날 처음 열면(through_day < 어제) 다 저장된 어제 매출도 한 번 다시 읽는다 — 통계는 덮었으면 다시 읽지 않는다', () => {
    expect(uploadPlan(input({ throughDay: '2026-11-22' }))).toEqual([revenue(YESTERDAY, YESTERDAY)])
  })

  it('AC-8021.2 그날 두 번째 열기라도 어제 매출이 다 저장되지 않았으면 읽는다', () => {
    const sales = saved(FILL).map((row) => (row.date === YESTERDAY ? { ...row, dayCodes: false } : row))
    expect(uploadPlan(input({ sales }))).toEqual([revenue(YESTERDAY, YESTERDAY)])
  })

  it('AC-8021.2 매출은 planRevenue·savedMark 그대로: 저장 안 된 날만 31일 이하 덩어리, 확인 필요한 날은 도우미 판에 따라 다시 읽는다', () => {
    const sales = saved(FILL)
      .filter((row) => row.date !== '2026-09-10')
      .map((row) => (row.date === '2026-10-05' ? { ...row, unconfirmed: true } : row))
    // 판을 모르면 확인 필요한 날은 저장된 것으로 본다(지금 savedMark)
    expect(uploadPlan(input({ sales, helperVersion: null }))).toEqual([revenue('2026-09-10', '2026-09-10')])
    // 0.13.0 이상이면 확인 필요한 날도 한 번 다시 읽는다
    expect(uploadPlan(input({ sales, helperVersion: '0.13.2' }))).toEqual([revenue('2026-10-05', '2026-10-05'), revenue('2026-09-10', '2026-09-10')])
  })

  it('AC-8021.2 같은 끝날이면 매출이 먼저이고, 옛 통계 조각은 끝날 차례로 매출 덩어리 사이에 든다', () => {
    const tasks = uploadPlan(input({ months: 36, throughDay: null, sales: [], coverage: [], marks: NO_MARKS }))
    const ends = tasks.map(endOf)
    expect([...ends].sort((a, b) => compareYmd(b, a))).toEqual(ends)
    expect(tasks.slice(0, 2).map((task) => task.kind)).toEqual(['revenue', 'stats'])
    expect(endOf(tasks[0])).toBe(YESTERDAY)
    expect(endOf(tasks[1])).toBe(YESTERDAY)
    const old = statsOnly(tasks).slice(1)
    expect(old.length).toBeGreaterThan(0)
    for (const task of old) {
      const at = tasks.indexOf(task)
      expect(tasks[at - 1].kind).toBe('revenue')
    }
  })
})

describe('AC-8021.2 uploadPlan — 통계 할 달(최근 24달은 새 조각 하나)', () => {
  it('AC-8021.2 (가) 덮지 않은 날이 있는 달부터 어제까지 한 조각으로 다시 저장한다(가운데 다 된 달도 같이)', () => {
    const coverage = [
      { from: '2026-09-01', to: '2026-09-29' },
      { from: '2026-10-01', to: YESTERDAY },
    ]
    expect(statsOnly(uploadPlan(input({ coverage })))).toEqual([stats({ from: '2026-09-01', to: YESTERDAY }, { from: '2026-08-01', to: YESTERDAY })])
  })

  it('AC-8021.2 (가) 붙어 있는 덮은 기간은 이어진 것으로 본다', () => {
    const coverage = [
      { from: '2026-10-16', to: YESTERDAY },
      { from: '2026-09-01', to: '2026-10-15' },
    ]
    expect(uploadPlan(input({ coverage }))).toEqual([])
  })

  it('AC-8021.2 (나) Block·물리치료 묶음이 있는데 수납 합계 없는 날 줄이 있는 달 — 묶음이 없으면 할 달이 아니다', () => {
    const marks = doneMarks()
    marks.days = marks.days.map((row) => (row.day === '2026-10-10' ? { ...row, hasSunap: false } : row))
    expect(statsOnly(uploadPlan(input({ marks })))).toEqual([stats({ from: '2026-10-01', to: YESTERDAY }, { from: '2026-08-31', to: YESTERDAY })])
    expect(uploadPlan(input({ marks, groups: { rx: true, sunap: false } }))).toEqual([])
  })

  it('AC-8021.2 (다) 처방 묶음이 있고 다 끝난 달인데 dropoff가 없거나 asOf < min(그 달 + 석 달 끝, 어제)인 달 — 묶음이 없으면 아니다', () => {
    const marks = doneMarks()
    marks.months = marks.months.map((row) => (row.month === '2026-09' ? { ...row, dropoffAsOf: null } : row))
    expect(statsOnly(uploadPlan(input({ marks })))).toEqual([stats({ from: '2026-09-01', to: YESTERDAY }, { from: '2026-08-01', to: YESTERDAY })])
    expect(uploadPlan(input({ marks, groups: { rx: false, sunap: true } }))).toEqual([])

    const older = doneMarks()
    older.months = older.months.map((row) => (row.month === '2026-10' ? { ...row, dropoffAsOf: '2026-11-22' } : row))
    expect(statsOnly(uploadPlan(input({ marks: older })))).toEqual([stats({ from: '2026-10-01', to: YESTERDAY }, { from: '2026-08-31', to: YESTERDAY })])
  })

  it('AC-8021.2 (다) 석 달 넘게 지켜본 달(asOf ≥ 그 달 + 석 달의 끝)은 다시 읽지 않는다', () => {
    const fill = fillRange(TODAY, 6) // 2026-05-01 ~ 11-23
    const marks = doneMarks(fill)
    // 7월 + 석 달 = 10월 31일. 그날까지 지켜봤으면 됐고, 하루 모자라면 할 달이다
    const at = (asOf: string) => ({ ...marks, months: marks.months.map((row) => (row.month === '2026-07' ? { ...row, dropoffAsOf: asOf } : row)) })
    const base = { months: 6, sales: saved(fill), coverage: [fill] }
    expect(uploadPlan(input({ ...base, marks: at('2026-10-31') }))).toEqual([])
    expect(statsOnly(uploadPlan(input({ ...base, marks: at('2026-10-30') })))).toEqual([
      stats({ from: '2026-07-01', to: YESTERDAY }, { from: '2026-05-31', to: YESTERDAY }),
    ])
  })

  it('AC-8021.2 (다) 지금 달(다 끝나지 않음)·달 줄이 없는 달(그달 내원 없음)은 dropoff가 없어도 할 달이 아니다', () => {
    const marks = doneMarks()
    marks.months = marks.months.filter((row) => row.month !== '2026-09')
    expect(marks.months.find((row) => row.month === '2026-11')?.dropoffAsOf).toBeNull()
    expect(uploadPlan(input({ marks }))).toEqual([])
  })

  it('AC-8021.2 묶음 정의 읽기가 실패했으면(groups null) 통계 일은 없고 매출 일만 있다', () => {
    const tasks = uploadPlan(input({ throughDay: null, sales: [], coverage: [], marks: NO_MARKS, groups: null }))
    expect(statsOnly(tasks)).toEqual([])
    expect(tasks.map((task) => task.kind)).toEqual(['revenue', 'revenue', 'revenue'])
  })
})

describe('AC-8021.2 uploadPlan — 24달보다 옛 달은 이어진 12달 이하 옛 조각', () => {
  // 5년 = 2021-11-01 ~ 2026-11-23. 최근 24달 = 2024-12 ~ 2026-11
  const fill5y = fillRange(TODAY, 60)

  it('AC-8021.2 아무것도 없으면 새 조각(2024-12 ~ 어제) 하나와 최근 달부터 12달씩 옛 조각: 저장 = 그 달들, 읽기 = 앞 31일 ~ 끝 달 + 석 달의 끝', () => {
    const parts = statsOnly(uploadPlan(input({ months: 60, throughDay: null, sales: [], coverage: [], marks: NO_MARKS })))
    expect(parts).toEqual([
      stats({ from: '2024-12-01', to: YESTERDAY }, { from: '2024-10-31', to: YESTERDAY }),
      stats({ from: '2023-12-01', to: '2024-11-30' }, { from: '2023-10-31', to: '2025-02-28' }),
      stats({ from: '2022-12-01', to: '2023-11-30' }, { from: '2022-10-31', to: '2024-02-29' }),
      stats({ from: '2021-12-01', to: '2022-11-30' }, { from: '2021-10-31', to: '2023-02-28' }),
      stats({ from: '2021-11-01', to: '2021-11-30' }, { from: '2021-10-01', to: '2022-02-28' }),
    ])
  })

  it('AC-8021.2 옛 조각은 이어진 할 달끼리만 묶는다(사이에 다 된 달이 있으면 나뉜다)', () => {
    const coverage = [
      { from: fill5y.from, to: '2023-02-28' },
      { from: '2023-05-01', to: '2023-05-31' },
      { from: '2023-07-01', to: YESTERDAY },
    ]
    expect(statsOnly(uploadPlan(input({ months: 60, sales: saved(fill5y), coverage, marks: doneMarks(fill5y) })))).toEqual([
      stats({ from: '2023-06-01', to: '2023-06-30' }, { from: '2023-05-01', to: '2023-09-30' }),
      stats({ from: '2023-03-01', to: '2023-04-30' }, { from: '2023-01-29', to: '2023-07-31' }),
    ])
  })

  it('AC-8021.2 24달보다 옛 달은 (가)만 본다 — 수납 합계·dropoff가 없어도 덮었으면 다시 읽지 않는다', () => {
    const marks = doneMarks(fill5y)
    marks.days = marks.days.map((row) => (row.day < '2024-12-01' ? { ...row, hasSunap: false } : row))
    marks.months = marks.months.map((row) => (row.month < '2024-12' ? { ...row, dropoffAsOf: null } : row))
    expect(uploadPlan(input({ months: 60, sales: saved(fill5y), coverage: [fill5y], marks }))).toEqual([])
  })
})

describe('AC-8021.2 uploadPlan — 저장은 늘 달째, 읽기는 800일 이하', () => {
  it('AC-8021.2 2026 ~ 2030년 여러 오늘 × 채울 기간 아홉(아무것도 없음): 조각 저장은 달 1일 ~ 달 끝(지금 달만 어제), 읽기 = 저장 앞 31일 ~ (어제 이하), 800일 이하, 빈틈·겹침 없이 채울 기간을 덮는다', () => {
    for (let today = '2026-01-01'; today <= '2030-12-31'; today = addDays(today, 37)) {
      for (const { months } of FILL_CHOICES) {
        const fill = fillRange(today, months)
        const yesterday = fill.to
        const tasks = uploadPlan({ today, months, throughDay: null, sales: [], coverage: [], marks: NO_MARKS, groups: ALL_GROUPS, helperVersion: null })
        expect(endOf(tasks[0])).toBe(yesterday)
        const parts = statsOnly(tasks).map((task) => (task as Extract<UploadTask, { kind: 'stats' }>).part)
        for (const { save, read } of parts) {
          expect(save.from.slice(8)).toBe('01')
          expect(save.to === yesterday || save.to === monthRange(monthOf(save.to)).to).toBe(true)
          expect(read.from).toBe(addDays(save.from, -31))
          expect(compareYmd(read.to, yesterday)).toBeLessThanOrEqual(0)
          expect(compareYmd(read.to, save.to)).toBeGreaterThanOrEqual(0)
          expect(diffDays(read.from, read.to) + 1).toBeLessThanOrEqual(MAX_READ_DAYS)
        }
        const sorted = [...parts].sort((a, b) => compareYmd(a.save.from, b.save.from))
        expect(sorted[0].save.from).toBe(fill.from)
        expect(sorted.at(-1)!.save.to).toBe(yesterday)
        sorted.slice(1).forEach((part, i) => expect(part.save.from).toBe(addDays(sorted[i].save.to, 1)))
        const ranges = tasks.flatMap((task) => (task.kind === 'revenue' ? [task.range] : []))
        for (const range of ranges) expect(diffDays(range.from, range.to) + 1).toBeLessThanOrEqual(REVENUE_MAX_DAYS)
        expect(ranges.reduce((sum, range) => sum + diffDays(range.from, range.to) + 1, 0)).toBe(diffDays(fill.from, fill.to) + 1)
      }
    }
  })
})

describe('AC-8021.9 progressOf — 매출·통계가 둘 다 저장된 날로 through_day·filled_from', () => {
  const marks = (range: DateRange) => revenueSaved(saved(range), '0.13.2')

  it('AC-8021.9 둘 다 저장된 날이 없으면 둘 다 null이다', () => {
    expect(progressOf(FILL, new Map(), [FILL])).toEqual({ through: null, filledFrom: null })
    expect(progressOf(FILL, marks(FILL), [])).toEqual({ through: null, filledFrom: null })
  })

  it('AC-8021.9 다 저장됐으면 through = 어제, filled_from = 채울 기간 첫날(1일)', () => {
    expect(progressOf(FILL, marks(FILL), [FILL])).toEqual({ through: YESTERDAY, filledFrom: '2026-09-01' })
  })

  it('AC-8021.9 끊김 없이 저장된 첫날이 1일이 아니면 그 다음 달 1일이다', () => {
    expect(progressOf(FILL, marks({ from: '2026-09-15', to: YESTERDAY }), [FILL])).toEqual({ through: YESTERDAY, filledFrom: '2026-10-01' })
  })

  it('AC-8021.9 그런 달이 없으면(다음 달 1일이 through보다 뒤) filled_from은 null이다', () => {
    expect(progressOf(FILL, marks({ from: '2026-11-10', to: YESTERDAY }), [FILL])).toEqual({ through: YESTERDAY, filledFrom: null })
  })

  it('AC-8021.9 through = 어제부터 거꾸로 보아 둘 다 저장된 가장 늦은 날(어제가 아직이면 그 앞)', () => {
    expect(progressOf(FILL, marks({ from: '2026-09-01', to: '2026-11-20' }), [FILL])).toEqual({ through: '2026-11-20', filledFrom: '2026-09-01' })
    expect(progressOf(FILL, marks(FILL), [{ from: '2026-09-01', to: '2026-11-21' }])).toEqual({ through: '2026-11-21', filledFrom: '2026-09-01' })
  })

  it('AC-8021.9 사이에 빈 날이 있으면 그 뒤에서 끊긴다', () => {
    const revenue = marks(FILL)
    revenue.set('2026-10-15', false)
    expect(progressOf(FILL, revenue, [FILL])).toEqual({ through: YESTERDAY, filledFrom: '2026-11-01' })
    expect(progressOf(FILL, marks(FILL), [{ from: '2026-09-01', to: '2026-09-30' }, { from: '2026-10-02', to: YESTERDAY }])).toEqual({
      through: YESTERDAY,
      filledFrom: '2026-11-01',
    })
  })

  it('AC-8021.9 revenueSaved는 savedMark 그대로(판에 따라 확인 필요한 날은 거짓), marksOfResult는 저장한 답을 같은 표시로 바꾼다', () => {
    const rows = saved({ from: '2026-09-01', to: '2026-09-02' }, { unconfirmed: true })
    expect([...revenueSaved(rows, null).values()]).toEqual([true, true])
    expect([...revenueSaved(rows, '0.13.2').values()]).toEqual([false, false])
    const day = (date: string, unconfirmed: boolean, roughTotal?: number) => ({ date, unconfirmed, ...(roughTotal === undefined ? {} : { roughTotal }) }) as RevenueDayRow
    expect(marksOfResult({ days: [day('2026-09-01', false), day('2026-09-02', true, 500)], codes: [], dayCodes: [] })).toEqual([
      { date: '2026-09-01', dayCodes: true, unconfirmed: false, roughTotal: null },
      { date: '2026-09-02', dayCodes: true, unconfirmed: true, roughTotal: 500 },
    ])
    expect(marksOfResult({ days: [day('2026-09-01', false)], codes: [] })).toEqual([{ date: '2026-09-01', dayCodes: false, unconfirmed: false, roughTotal: null }])
  })
})

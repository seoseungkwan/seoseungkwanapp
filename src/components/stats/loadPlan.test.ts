import { describe, expect, it } from 'vitest'
import commands from '@/lib/bridge/commands.json'
import { addDays, addMonths, compareYmd, diffDays, monthOf, monthRange } from '@/lib/analytics/dates'
import type { DateRange } from '@/types/dates'
import type { DayPayload, MonthPayload, MonthSections } from '@/types/payload'
import type { StatsLoaded } from '@/types/stats'
import {
  LOAD_SPANS,
  MAX_READ_DAYS,
  REVENUE_HINT,
  doneText,
  loadHint,
  monthsLabel,
  partSave,
  planLoad,
  progressText,
  revenueProgressText,
  stoppedText,
  type LoadPart,
  type LoadSpan,
} from './loadPlan'
import { pickRange } from './periodPick'
import { statsRange, type StatsRange } from './view'

// 통계 비트 불러올 기간의 나눠 읽기 계획과 글 (stats-load-range REQ-3301·REQ-3302·REQ-3303·REQ-3305, design.md loadPlan.ts).
// 시험의 오늘은 2026-11-09(월)이고 '오늘 진료 끝'은 꺼져 있다(끝난 마지막 날 = 어제 11월 8일). 숫자는 모두 지어낸 값이다

const TODAY = '2026-11-09'
const SPANS: LoadSpan[] = ['view', '1y', '2y', 'all']
const recent30 = statsRange(TODAY, '30d')
const recent12m = statsRange(TODAY, '12m')
const monthPick = (month: string) => pickRange(TODAY, { kind: 'month', unit: 'day', month }, false)
const yearPick = (year: string) => pickRange(TODAY, { kind: 'year', year }, false)
const days = (span: DateRange) => diffDays(span.from, span.to) + 1
const saves = (parts: readonly LoadPart[]) => parts.map((part) => part.save)
const reads = (parts: readonly LoadPart[]) => parts.map((part) => part.read)

describe('AC-3301.1 불러올 기간 단추 이름', () => {
  it("AC-3301.1 LOAD_SPANS는 차례로 지금 보는 기간 · 최근 1년 · 최근 2년 · 전체 기간이고 '2020년부터 전부'라는 이름은 없다", () => {
    expect(LOAD_SPANS.map(({ span }) => span)).toEqual(SPANS)
    expect(LOAD_SPANS.map(({ name }) => name)).toEqual(['지금 보는 기간', '최근 1년', '최근 2년', '전체 기간'])
    expect(LOAD_SPANS.some(({ name }) => name.includes('2020년부터'))).toBe(false)
  })
})

describe('AC-3302.1 읽을 전체 기간(whole)', () => {
  it('AC-3302.1 최근 30일: 지금 보는 기간은 range.load, 1년·2년은 11·23달 전 달 1일, 전체 기간은 이름을 바꿔도 2020-01-01부터 오늘까지', () => {
    expect(recent30.load).toEqual({ from: '2026-09-01', to: TODAY })
    expect(planLoad(TODAY, recent30, 'view').whole).toEqual(recent30.load)
    expect(SPANS.map((span) => planLoad(TODAY, recent30, span).whole)).toEqual([
      { from: '2026-09-01', to: TODAY },
      { from: '2025-12-01', to: TODAY },
      { from: '2024-12-01', to: TODAY },
      { from: '2020-01-01', to: TODAY },
    ])
  })

  it('AC-3302.1 range.load가 단추 첫날보다 앞이면 range.load 첫날이다', () => {
    expect(recent12m.load.from).toBe('2024-12-01')
    expect(planLoad(TODAY, recent12m, '1y').whole).toEqual({ from: '2024-12-01', to: TODAY })
    const year2020 = yearPick('2020')
    expect(year2020.load.from).toBe('2019-01-01')
    expect(planLoad(TODAY, year2020, 'all').whole).toEqual({ from: '2019-01-01', to: TODAY })
  })

  it('AC-3302.1 plan.span은 고른 것이다', () => {
    for (const span of SPANS) expect(planLoad(TODAY, recent30, span).span).toBe(span)
  })
})

describe('AC-3302.2 800일 이하는 한 번에', () => {
  it('AC-3302.2 MAX_READ_DAYS는 800이다', () => {
    expect(MAX_READ_DAYS).toBe(800)
  })

  it('AC-3302.2 최근 2년(709일)은 조각 하나이고 save = read = whole, keepAt 0', () => {
    const plan = planLoad(TODAY, recent30, '2y')
    expect(days(plan.whole)).toBe(709)
    expect(plan.parts).toEqual([{ save: plan.whole, read: plan.whole }])
    expect(plan.keepAt).toBe(0)
  })

  it('AC-3302.2 지금 보는 기간(최근 30일)도 조각 하나다', () => {
    const plan = planLoad(TODAY, recent30, 'view')
    expect(plan.parts).toEqual([{ save: recent30.load, read: recent30.load }])
    expect(plan.keepAt).toBe(0)
  })

  it('AC-3302.2 2025년 9월 일별(800일)은 하나, 2025년 8월 일별(831일)은 둘', () => {
    const september = planLoad(TODAY, monthPick('2025-09'), 'view')
    expect(september.whole).toEqual({ from: '2024-09-01', to: TODAY })
    expect(days(september.whole)).toBe(800)
    expect(september.parts).toEqual([{ save: september.whole, read: september.whole }])
    const august = planLoad(TODAY, monthPick('2025-08'), 'view')
    expect(days(august.whole)).toBe(831)
    expect(august.parts).toHaveLength(2)
  })
})

describe('AC-3302.3 800일을 넘으면 24달씩 새것부터', () => {
  it('AC-3302.3 최근 30일 + 전체 기간: save 넷', () => {
    expect(saves(planLoad(TODAY, recent30, 'all').parts)).toEqual([
      { from: '2024-12-01', to: '2026-11-09' },
      { from: '2022-12-01', to: '2024-11-30' },
      { from: '2020-12-01', to: '2022-11-30' },
      { from: '2020-01-01', to: '2020-11-30' },
    ])
  })

  it('AC-3302.3 2025년 8월 일별: 가장 옛 조각은 whole 첫날에 시작한다', () => {
    expect(saves(planLoad(TODAY, monthPick('2025-08'), 'view').parts)).toEqual([
      { from: '2024-12-01', to: '2026-11-09' },
      { from: '2024-08-01', to: '2024-11-30' },
    ])
  })
})

describe('AC-3302.4 read는 이웃 조각 쪽으로 31일씩 더한 것', () => {
  it('AC-3302.4 최근 30일 + 전체 기간: read 넷', () => {
    expect(reads(planLoad(TODAY, recent30, 'all').parts)).toEqual([
      { from: '2024-10-31', to: '2026-11-09' },
      { from: '2022-10-31', to: '2024-12-31' },
      { from: '2020-10-31', to: '2022-12-31' },
      { from: '2020-01-01', to: '2020-12-31' },
    ])
  })

  it('AC-3302.4 2월 예: 오늘 2027-01-15 + 전체 기간의 둘째 read는 2023-01-01 ~ 2025-03-03 (한 달씩이면 2월 28일에 끝나 1월 말 날의 30일 창이 잘렸다)', () => {
    const today = '2027-01-15'
    const second = planLoad(today, statsRange(today, '30d'), 'all').parts[1]
    expect(second).toEqual({ save: { from: '2023-02-01', to: '2025-01-31' }, read: { from: '2023-01-01', to: '2025-03-03' } })
  })

  it('AC-3302.4 2월 예: 오늘 2027-02-10 + 전체 기간의 첫 read는 2025-01-29부터 (한 달씩이면 2월 1일부터라 3월 초 날의 앞 30일이 잘렸다)', () => {
    const today = '2027-02-10'
    const first = planLoad(today, statsRange(today, '30d'), 'all').parts[0]
    expect(first).toEqual({ save: { from: '2025-03-01', to: today }, read: { from: '2025-01-29', to: today } })
  })

  it('AC-3302.4 2026 ~ 2032년 모든 오늘 × 네 단추 × load 첫날 셋: read ≤ 800일, save ≤ 731일, save는 whole을 빈틈·겹침 없이 잇는다', () => {
    // expect를 수만 번 부르면 느려서, 어긋난 것을 모아 마지막에 한 번 본다
    const wrong: string[] = []
    let checked = 0
    for (let today = '2026-01-01'; today <= '2032-12-31'; today = addDays(today, 1)) {
      const base = statsRange(today, '30d')
      for (const loadFrom of [monthRange(monthOf(today)).from, '2020-01-01', '2015-01-01']) {
        const range: StatsRange = { ...base, load: { from: loadFrom, to: today } }
        for (const span of SPANS) {
          const { whole, parts } = planLoad(today, range, span)
          const check = (ok: boolean, what: string) => ok || wrong.push(`${today} ${loadFrom} ${span}: ${what}`)
          const oldest = parts.length - 1
          check(whole.to === today, 'whole 끝')
          check(parts[0].save.to === today && parts[0].read.to === today, '가장 새 조각 끝 = 오늘')
          check(parts[oldest].save.from === whole.from && parts[oldest].read.from === whole.from, '가장 옛 조각 첫날 = whole 첫날')
          parts.forEach(({ save, read }, i) => {
            check(days(read) <= MAX_READ_DAYS, `read ${i} ${read.from}~${read.to} ${days(read)}일`)
            check(days(save) <= 731, `save ${i} ${save.from}~${save.to} ${days(save)}일`)
            if (i > 0) check(addDays(save.to, 1) === parts[i - 1].save.from, `save ${i}와 ${i - 1} 사이 빈틈·겹침`)
            if (parts.length === 1) return
            // 달 경계: 가장 새 조각만 오늘에 끝나고 가장 옛 조각만 whole 첫날에 시작한다
            if (i > 0) check(save.to === monthRange(monthOf(save.to)).to, `save ${i} 끝이 말일이 아님`)
            if (i < oldest) check(save.from === monthRange(monthOf(save.from)).from, `save ${i} 첫날이 1일이 아님`)
            // 이웃 쪽으로 31일씩: 30일 창을 늘 다 담고, 이웃 달도 늘 통째로 담는다
            if (i > 0) {
              check(read.to === addDays(save.to, 31), `read ${i} 끝 ${read.to} ≠ save 끝 + 31일`)
              check(diffDays(save.to, read.to) >= 30, `read ${i} 끝이 save 끝 + 30일보다 앞`)
              check(compareYmd(read.to, monthRange(addMonths(monthOf(save.to), 1)).to) >= 0, `read ${i} 끝이 다음 달 말일보다 앞`)
            }
            if (i < oldest) {
              check(read.from === addDays(save.from, -31), `read ${i} 첫날 ${read.from} ≠ save 첫날 − 31일`)
              check(diffDays(read.from, save.from) >= 30, `read ${i} 첫날이 save 첫날 − 30일보다 뒤`)
              check(compareYmd(read.from, monthRange(addMonths(monthOf(save.from), -1)).from) <= 0, `read ${i} 첫날이 앞 달 1일보다 뒤`)
            }
          })
          checked++
        }
      }
    }
    expect(wrong.slice(0, 10)).toEqual([])
    expect(checked).toBe(2557 * 3 * 4)
  }, 30_000)
})

describe('AC-3302.5 keepAt = 비교 범위를 다 담는 가장 새 조각, 없으면 지금 범위, 그것도 없으면 0', () => {
  it('AC-3302.5 최근 30일 + 전체 기간 → 0 (첫 read가 비교할 지난 30일까지 담음)', () => {
    expect(planLoad(TODAY, recent30, 'all').keepAt).toBe(0)
  })

  it('AC-3302.5 2025년(월별) + 지금 보는 기간 → 0 (비교할 2024년을 다 담는 read가 없어, 2025년을 다 담는 첫 조각 · 첫 read 2024-10-31 ~)', () => {
    const plan = planLoad(TODAY, yearPick('2025'), 'view')
    expect(plan.parts[0].read).toEqual({ from: '2024-10-31', to: TODAY })
    expect(plan.parts.some(({ read }) => read.from <= '2024-01-01' && read.to >= '2025-12-31')).toBe(false)
    expect(plan.keepAt).toBe(0)
  })

  it('AC-3302.5 2024년 11월(일별) + 지금 보는 기간 → 1 (첫 read 2024-10-31 ~ 은 11월만 담고, 둘째 read 2023-11-01 ~ 2024-12-31이 비교할 10월·작년 11월까지 담음)', () => {
    const plan = planLoad(TODAY, monthPick('2024-11'), 'view')
    expect(plan.parts.map(({ read }) => read)).toEqual([
      { from: '2024-10-31', to: TODAY },
      { from: '2023-11-01', to: '2024-12-31' },
    ])
    expect(plan.keepAt).toBe(1)
  })

  it('AC-3302.5 2024년(월별) + 지금 보는 기간 → 1 (둘째 read 2023-01-01 ~ 2024-12-31)', () => {
    const plan = planLoad(TODAY, yearPick('2024'), 'view')
    expect(plan.parts[1].read).toEqual({ from: '2023-01-01', to: '2024-12-31' })
    expect(plan.keepAt).toBe(1)
  })

  it('AC-3302.5 직접 날짜 2024-06-01 ~ 2025-03-31(주별) + 지금 보는 기간 → 0 (어느 read도 비교 범위도 지금 범위도 다 담지 못함)', () => {
    const range = pickRange(TODAY, { kind: 'custom', unit: 'week', from: '2024-06-01', to: '2025-03-31' }, false)
    const plan = planLoad(TODAY, range, 'view')
    expect(plan.parts.length).toBeGreaterThan(1)
    expect(plan.parts.some(({ read }) => read.from <= '2024-06-01' && read.to >= '2025-03-31')).toBe(false)
    expect(plan.keepAt).toBe(0)
  })

  it('AC-3302.5 지금 보는 기간의 끝이 오늘보다 뒤면 오늘까지만 담으면 된다', () => {
    // 최근 12개월의 current는 이번 달 말일(2026-11-30)까지다
    expect(recent12m.current.to).toBe('2026-11-30')
    expect(planLoad(TODAY, recent12m, 'all').keepAt).toBe(0)
  })
})

// ── partSave ────────────────────────────────────────────

// 재방문 칸은 Worker 값(after30 숫자). 가장 새 조각이 아닌 조각은 after30만 null로 보낸다(AC-3302.7)
const REVISIT = { cohort: 5, within7: 1, within14: 2, within30: 3, after30: 1 }
const UNSURE = { ...REVISIT, after30: null }
const monthRow = (month: string, revisit: object = REVISIT) => ({ month, partial: false, revisit }) as unknown as MonthPayload
const dayRow = (day: string, revisit: object = REVISIT, rx: readonly object[] = []) => ({ day, partial: false, revisit, rx }) as unknown as DayPayload
const sectionRow = (month: string) => ({ v: 1, month, partial: false }) as unknown as MonthSections

function loaded(read: DateRange, extra: Partial<StatsLoaded> = {}): StatsLoaded {
  return {
    range: read,
    covered: read,
    quality: 'valid',
    checks: { noChart: 0, duplicate: 0, noFirst: 0 },
    months: [],
    days: [],
    report: { daily: [], monthly: [] },
    ...extra,
  }
}

describe('AC-3302.6 partSave는 save 안의 줄만 저장한다', () => {
  const part = planLoad(TODAY, recent30, 'all').parts[1] // save 2022-12-01 ~ 2024-11-30, read 2022-10-31 ~ 2024-12-31
  const months = ['2022-11', '2022-12', '2023-06', '2024-11', '2024-12']
  const dayList = ['2022-11-30', '2022-12-01', '2023-06-15', '2024-11-30', '2024-12-01']

  it('AC-3302.6 달·날·세 칸은 save 안의 것만, covered는 save와 겹친 구간, source bit (둘째 조각이라 달·날 줄의 after30은 null, AC-3302.7)', () => {
    const view = loaded(part.read, { months: months.map((month) => monthRow(month)), days: dayList.map((ymd) => dayRow(ymd)), sections: months.map(sectionRow) })
    expect(partSave(view, part)).toEqual({
      months: ['2022-12', '2023-06', '2024-11'].map((month) => monthRow(month, UNSURE)),
      days: ['2022-12-01', '2023-06-15', '2024-11-30'].map((ymd) => dayRow(ymd, UNSURE)),
      sections: ['2022-12', '2023-06', '2024-11'].map(sectionRow),
      covered: { from: '2022-12-01', to: '2024-11-30' },
      source: 'bit',
    })
  })

  it('AC-3302.6 covered가 save 일부와 겹치면 겹친 구간이다(가장 새 조각, 어제까지 덮음)', () => {
    const newest = planLoad(TODAY, recent30, 'all').parts[0]
    const view = loaded(newest.read, { covered: { from: '2024-11-01', to: '2026-11-08' } })
    expect(partSave(view, newest).covered).toEqual({ from: '2024-12-01', to: '2026-11-08' })
  })

  it('AC-3302.6 covered가 save와 겹치지 않거나 null이면 null', () => {
    expect(partSave(loaded(part.read, { covered: { from: '2024-12-01', to: '2024-12-31' } }), part).covered).toBeNull()
    expect(partSave(loaded(part.read, { covered: null }), part).covered).toBeNull()
  })

  it('AC-3302.6 sections가 null이면 null, 열쇠가 없으면 열쇠 없음', () => {
    expect(partSave(loaded(part.read, { sections: null }), part)).toHaveProperty('sections', null)
    expect('sections' in partSave(loaded(part.read), part)).toBe(false)
  })

  it('AC-3302.6 조각이 하나(save = read)면 Worker 답 그대로다', () => {
    const [only] = planLoad(TODAY, recent30, 'view').parts
    const view = loaded(only.read, {
      covered: { from: '2026-09-01', to: '2026-11-08' },
      months: ['2026-09', '2026-10', '2026-11'].map((month) => monthRow(month)),
      days: ['2026-09-01', '2026-10-15', '2026-11-09'].map((ymd) => dayRow(ymd)),
      sections: ['2026-09', '2026-10', '2026-11'].map(sectionRow),
    })
    expect(partSave(view, only)).toEqual({ months: view.months, days: view.days, covered: view.covered, sections: view.sections, source: 'bit' })
  })
})

describe("AC-3302.7 가장 새 조각이 아닌 조각은 '30일 넘어 다시 옴'(after30)을 null로 보낸다", () => {
  // 조각의 save 첫 달·끝 달 줄과 첫날·끝날 줄(모두 save 안이라 걸러지지 않는다)
  const monthsOf = ({ save }: LoadPart) => [monthOf(save.from), monthOf(save.to)]
  const daysOf = ({ save }: LoadPart) => [save.from, save.to]
  const viewFor = (part: LoadPart) =>
    loaded(part.read, {
      months: monthsOf(part).map((month) => monthRow(month)),
      days: daysOf(part).map((ymd) => dayRow(ymd)),
      sections: monthsOf(part).map(sectionRow),
    })
  const revisits = (input: ReturnType<typeof partSave>) => [...input.months, ...input.days].map((row) => row.revisit)

  it('AC-3302.7 최근 30일 + 전체 기간: 첫 조각 줄은 after30이 Worker 값, 둘째 ~ 넷째 조각 줄은 null이고 cohort·within7·14·30·다른 칸·세 칸·covered는 그대로', () => {
    const { parts } = planLoad(TODAY, recent30, 'all')
    expect(parts).toHaveLength(4)
    parts.forEach((part, i) => {
      const view = viewFor(part)
      const revisit = i === 0 ? REVISIT : UNSURE
      expect(partSave(view, part)).toEqual({
        months: monthsOf(part).map((month) => monthRow(month, revisit)),
        days: daysOf(part).map((ymd) => dayRow(ymd, revisit)),
        sections: monthsOf(part).map(sectionRow),
        covered: part.save,
        source: 'bit',
      })
      // Worker 답은 바꾸지 않는다
      expect([...view.months!, ...view.days!].map((row) => row.revisit)).toEqual([REVISIT, REVISIT, REVISIT, REVISIT])
    })
  })

  it('AC-3302.7 2025년 8월 일별 + 지금 보는 기간(조각 둘): 둘째(2024-08-01 ~ 11-30)의 줄은 null, 첫 조각은 Worker 값', () => {
    const { parts } = planLoad(TODAY, monthPick('2025-08'), 'view')
    expect(saves(parts)).toEqual([
      { from: '2024-12-01', to: TODAY },
      { from: '2024-08-01', to: '2024-11-30' },
    ])
    expect(revisits(partSave(viewFor(parts[0]), parts[0]))).toEqual([REVISIT, REVISIT, REVISIT, REVISIT])
    expect(revisits(partSave(viewFor(parts[1]), parts[1]))).toEqual([UNSURE, UNSURE, UNSURE, UNSURE])
  })

  it('AC-3302.7 조각 하나인 계획(지금 보는 기간 · 최근 2년)은 after30도 Worker 값 그대로다', () => {
    for (const span of ['view', '2y'] as const) {
      const [only] = planLoad(TODAY, recent30, span).parts
      expect(revisits(partSave(viewFor(only), only))).toEqual([REVISIT, REVISIT, REVISIT, REVISIT])
    }
  })
})

describe('AC-4409.3 가장 새 조각이 아닌 조각은 날 줄 처방 줄의 once(1회 신환)를 뺀다', () => {
  // 날 줄 처방 줄: once 1 · once 0 · once 없음(이 기능 전 Worker 값과 같은 모양). 달 줄 처방 줄에는 once가 없다
  const RX = [
    { code: 'A1', name: '물리치료', type: '급여', patients: 4, newPatients: 2, returning: 2, once: 1 },
    { code: 'B2', name: '도수치료', type: '비급여', patients: 2, newPatients: 1, returning: 1, once: 0 },
    { code: 'C3', name: '주사', type: '급여', patients: 1, newPatients: 0, returning: 1 },
  ]
  const NO_ONCE = RX.map(({ code, name, type, patients, newPatients, returning }) => ({ code, name, type, patients, newPatients, returning }))
  const MONTH_RX = [{ code: 'A1', name: '물리치료', type: '급여', patients: 40, newPatients: 20, returning: 20, followup: [10, 5, 3, 2] }]
  const monthsOf = ({ save }: LoadPart) => [monthOf(save.from), monthOf(save.to)]
  const daysOf = ({ save }: LoadPart) => [save.from, save.to]
  const viewFor = (part: LoadPart) =>
    loaded(part.read, {
      months: monthsOf(part).map((month) => ({ ...monthRow(month), rx: MONTH_RX }) as unknown as MonthPayload),
      days: daysOf(part).map((ymd) => dayRow(ymd, REVISIT, RX)),
    })
  // 날 줄마다 처방 줄의 once 열쇠가 있는지(toEqual은 undefined 열쇠를 없는 것과 같게 보므로 열쇠를 따로 본다)
  const onceKeys = (input: ReturnType<typeof partSave>) => input.days.map((row) => row.rx.map((line) => 'once' in line))
  const WITH_KEYS = [true, true, false]
  const WITHOUT_KEYS = [false, false, false]

  it('AC-4409.3 최근 30일 + 전체 기간(조각 넷): 첫 조각 날 줄은 once 그대로, 둘째 ~ 넷째 조각 날 줄의 처방 줄에는 once 열쇠가 없고 다른 칸·달 줄 처방 줄은 그대로', () => {
    const { parts } = planLoad(TODAY, recent30, 'all')
    expect(parts).toHaveLength(4)
    parts.forEach((part, i) => {
      const view = viewFor(part)
      const saved = partSave(view, part)
      const revisit = i === 0 ? REVISIT : UNSURE
      expect(saved.days).toEqual(daysOf(part).map((ymd) => dayRow(ymd, revisit, i === 0 ? RX : NO_ONCE)))
      expect(onceKeys(saved)).toEqual(i === 0 ? [WITH_KEYS, WITH_KEYS] : [WITHOUT_KEYS, WITHOUT_KEYS])
      expect(saved.months).toEqual(monthsOf(part).map((month) => ({ ...monthRow(month, revisit), rx: MONTH_RX })))
      // Worker 답은 바꾸지 않는다
      expect(view.days!.map((row) => row.rx)).toEqual([RX, RX])
      expect(view.days!.map((row) => row.rx.map((line) => 'once' in line))).toEqual([WITH_KEYS, WITH_KEYS])
    })
  })

  it('AC-4409.3 2025년 8월 일별 + 지금 보는 기간(조각 둘): 둘째(2024-08-01 ~ 11-30) 날 줄은 once 없음, 첫 조각은 그대로', () => {
    const { parts } = planLoad(TODAY, monthPick('2025-08'), 'view')
    expect(parts).toHaveLength(2)
    expect(onceKeys(partSave(viewFor(parts[0]), parts[0]))).toEqual([WITH_KEYS, WITH_KEYS])
    expect(onceKeys(partSave(viewFor(parts[1]), parts[1]))).toEqual([WITHOUT_KEYS, WITHOUT_KEYS])
  })

  it('AC-4409.3 조각 하나인 계획(지금 보는 기간 · 최근 2년)은 날 줄 once가 Worker 값 그대로다', () => {
    for (const span of ['view', '2y'] as const) {
      const { parts } = planLoad(TODAY, recent30, span)
      expect(parts).toHaveLength(1)
      const saved = partSave(viewFor(parts[0]), parts[0])
      expect(saved.days.map((row) => row.rx)).toEqual([RX, RX])
      expect(onceKeys(saved)).toEqual([WITH_KEYS, WITH_KEYS])
    }
  })
})

// ── 글 ──────────────────────────────────────────────────

describe('AC-3301.3 최근 30일의 안내 줄 (시안 네 글)', () => {
  it('AC-3301.3·AC-4108.1 고른 것마다 시안 글 그대로다(첫 줄 끝은 환자·처방·매출을 함께 · 나눠 읽어요)', () => {
    expect(SPANS.map((span) => loadHint(TODAY, recent30, planLoad(TODAY, recent30, span)))).toEqual([
      '지금 보는 기간(최근 30일)과 비교할 지난 30일이 든 9월 1일 – 11월 9일의 환자·처방·매출을 함께 읽어요. 빨리 끝나요.',
      '2025년 12월 1일 – 2026년 11월 9일(1년)의 환자·처방·매출을 함께 읽어요. 30초쯤 걸려요.',
      '2024년 12월 1일 – 2026년 11월 9일(2년)의 환자·처방·매출을 함께 읽어요. 1분쯤 걸려요.',
      '2020년 1월 1일 – 2026년 11월 9일의 환자·처방·매출을 2년씩 4번에 나눠 읽어요. 4분쯤 걸려요. 한 번 저장한 달은 남으니 처음 한 번만 하면 돼요.',
    ])
  })
})

describe('AC-3301.4 다른 기간의 안내 줄 규칙', () => {
  const hint = (range: StatsRange, span: LoadSpan) => loadHint(TODAY, range, planLoad(TODAY, range, span))

  it('AC-3301.4·AC-4108.1 2026년 10월 일별 + 지금 보는 기간: 비교 이름 둘을 ·로 잇고 받침이면 이', () => {
    expect(hint(monthPick('2026-10'), 'view')).toBe(
      '지금 보는 기간(2026년 10월)과 비교할 9월·작년 10월이 든 2025년 10월 1일 – 2026년 11월 9일의 환자·처방·매출을 함께 읽어요. 1분쯤 걸려요.',
    )
  })

  it('AC-3301.4·AC-4108.1 직접 날짜 2026-10-03 ~ 11-01: 받침이 없으면 가', () => {
    const range = pickRange(TODAY, { kind: 'custom', unit: 'day', from: '2026-10-03', to: '2026-11-01' }, false)
    expect(hint(range, 'view')).toBe(
      '지금 보는 기간(직접 고른 기간)과 비교할 바로 전 30일·작년 같은 날짜가 든 2025년 10월 1일 – 2026년 11월 9일의 환자·처방·매출을 함께 읽어요. 1분쯤 걸려요.',
    )
  })

  it("AC-3301.4·AC-4108.1 최근 12개월 + 최근 1년: whole 첫날이 단추 첫날과 다르면 '(1년)'이 없다", () => {
    expect(hint(recent12m, '1y')).toBe('2024년 12월 1일 – 2026년 11월 9일의 환자·처방·매출을 함께 읽어요. 1분쯤 걸려요.')
  })

  it('AC-3301.4·AC-4108.1 2025년(월별) + 지금 보는 기간: 조각이 둘이면 2년씩 2번에 나눠 읽고 2분쯤', () => {
    expect(hint(yearPick('2025'), 'view')).toBe(
      '지금 보는 기간(2025년)과 비교할 2024년이 든 2024년 1월 1일 – 2026년 11월 9일의 환자·처방·매출을 2년씩 2번에 나눠 읽어요. 2분쯤 걸려요.',
    )
  })

  it('AC-3301.4·AC-4108.1 걸리는 때: 조각 하나면 100일 이하 빨리 · 400일 이하 30초 · 그 위 1분', () => {
    // 최근 7일: 2026-10-01 ~ 11-09 = 40일 · 최근 90일: 2026-05-01 ~ 11-09 = 193일
    expect(hint(statsRange(TODAY, '7d'), 'view')).toBe('지금 보는 기간(최근 7일)과 비교할 지난 7일이 든 10월 1일 – 11월 9일의 환자·처방·매출을 함께 읽어요. 빨리 끝나요.')
    expect(hint(statsRange(TODAY, '90d'), 'view')).toBe('지금 보는 기간(최근 90일)과 비교할 지난 90일이 든 5월 1일 – 11월 9일의 환자·처방·매출을 함께 읽어요. 30초쯤 걸려요.')
    expect(hint(recent30, '2y')).toMatch(/1분쯤 걸려요\.$/)
  })

  it("AC-3301.4·AC-4108.1 '한 번 저장한 달은 남으니…'는 전체 기간일 때만 붙는다", () => {
    expect(hint(yearPick('2020'), 'all')).toBe(
      '2019년 1월 1일 – 2026년 11월 9일의 환자·처방·매출을 2년씩 4번에 나눠 읽어요. 4분쯤 걸려요. 한 번 저장한 달은 남으니 처음 한 번만 하면 돼요.',
    )
    expect(hint(yearPick('2020'), 'view')).not.toContain('처음 한 번만')
    expect(hint(yearPick('2020'), '2y')).not.toContain('처음 한 번만')
  })
})

describe('AC-3303.4 읽는 중 줄의 달 글', () => {
  it("AC-3303.4 monthsLabel: 양 끝 해·달, 한 달이면 '2020년 1월'", () => {
    expect(monthsLabel({ from: '2022-12-01', to: '2024-11-30' })).toBe('2022년 12월 – 2024년 11월')
    expect(monthsLabel({ from: '2020-01-01', to: '2020-11-30' })).toBe('2020년 1월 – 2020년 11월')
    expect(monthsLabel({ from: '2020-01-01', to: '2020-01-31' })).toBe('2020년 1월')
  })

  it("AC-3303.4 progressText: '(k/N · k번째 save 달 글)'", () => {
    const plan = planLoad(TODAY, recent30, 'all')
    expect(progressText(plan, 1)).toBe('비트 PC에서 읽는 중이에요 (2/4 · 2022년 12월 – 2024년 11월). 다 끝날 때까지 이 창을 닫지 마세요.')
    expect(progressText(plan, 0)).toBe('비트 PC에서 읽는 중이에요 (1/4 · 2024년 12월 – 2026년 11월). 다 끝날 때까지 이 창을 닫지 마세요.')
    expect(progressText(plan, 3)).toBe('비트 PC에서 읽는 중이에요 (4/4 · 2020년 1월 – 2020년 11월). 다 끝날 때까지 이 창을 닫지 마세요.')
  })
})

describe('AC-3303.5 다 저장한 상자 글', () => {
  it('AC-3303.5 최근 30일 + 전체 기간, 끝난 날 어제: 해를 넘으면 양 끝에 해', () => {
    expect(doneText(planLoad(TODAY, recent30, 'all'), '2026-11-08')).toEqual([
      '2020년 1월 1일 – 2026년 11월 8일을 저장했어요.',
      '이제 위쪽 기간 고르기에서 2020년부터 어느 달·해든 볼 수 있어요.',
    ])
  })

  it("AC-3303.5 오늘 진료 끝이면 끝날이 오늘이고, whole 첫날이 1월 1일이 아니면 '{Y}년 {M}월부터'", () => {
    const plan = planLoad(TODAY, monthPick('2025-03'), 'view')
    expect(plan.parts.length).toBeGreaterThan(1)
    expect(doneText(plan, TODAY)).toEqual([
      '2024년 3월 1일 – 2026년 11월 9일을 저장했어요.',
      '이제 위쪽 기간 고르기에서 2024년 3월부터 어느 달·해든 볼 수 있어요.',
    ])
  })
})

describe('AC-3303.6 멈춘 상자 글', () => {
  const plan = planLoad(TODAY, recent30, 'all')

  it('AC-3303.6 셋째에서 멈춤(2번째까지 저장): 시안 글 + 오류 번호', () => {
    expect(stoppedText(plan, 2, '(오류 번호 E-BRIDGE-DISCONNECTED)')).toEqual([
      '4번 가운데 2번째까지 저장하고 멈췄어요.',
      '2022년 12월 – 2026년 11월은 저장됐어요. 남은 2020년 1월 – 2022년 11월은 [이어서 불러오기]로 읽어요. (오류 번호 E-BRIDGE-DISCONNECTED)',
    ])
  })

  it('AC-3303.6 저장된 달 = (k−1)번째 save 첫날 ~ 첫 조각 save 끝날, 남은 달 = whole 첫날 ~ k번째 save 끝날', () => {
    expect(stoppedText(plan, 1, '(오류 번호 E-STATS-SAVE-FAILED)')).toEqual([
      '4번 가운데 1번째까지 저장하고 멈췄어요.',
      '2024년 12월 – 2026년 11월은 저장됐어요. 남은 2020년 1월 – 2024년 11월은 [이어서 불러오기]로 읽어요. (오류 번호 E-STATS-SAVE-FAILED)',
    ])
    expect(stoppedText(plan, 3, '차트번호 없는 내원 2건이 있어요. 비트에서 이 기록을 고친 뒤 다시 불러와 주세요.')).toEqual([
      '4번 가운데 3번째까지 저장하고 멈췄어요.',
      '2020년 12월 – 2026년 11월은 저장됐어요. 남은 2020년 1월 – 2020년 11월은 [이어서 불러오기]로 읽어요. 차트번호 없는 내원 2건이 있어요. 비트에서 이 기록을 고친 뒤 다시 불러와 주세요.',
    ])
  })
})

// ── 매출을 함께 읽는 글 (stats-revenue REQ-4108, 시안 docs/mockups/stats-revenue notes.md '불러오기', requirements.md 기본값 12) ──

describe('AC-4108.1 불러오기 설정 안내 두 줄', () => {
  it('AC-4108.1: 최근 30일 · 오늘 11월 14일의 첫 줄은 시안 글 그대로다(…의 환자·처방·매출을 함께 읽어요.)', () => {
    const today = '2026-11-14'
    const range = statsRange(today, '30d')
    expect(loadHint(today, range, planLoad(today, range, 'view'))).toBe(
      '지금 보는 기간(최근 30일)과 비교할 지난 30일이 든 9월 1일 – 11월 14일의 환자·처방·매출을 함께 읽어요. 빨리 끝나요.',
    )
  })

  it('AC-4108.1: 첫 줄 끝은 두 모양뿐이다 — 한 번에 읽으면 함께 읽어요, 나눠 읽으면 2년씩 n번에 나눠 읽어요(기본값 12)', () => {
    for (const span of SPANS) {
      const plan = planLoad(TODAY, recent30, span)
      const text = loadHint(TODAY, recent30, plan)
      const tail = plan.parts.length > 1 ? `의 환자·처방·매출을 2년씩 ${plan.parts.length}번에 나눠 읽어요. ` : '의 환자·처방·매출을 함께 읽어요. '
      expect(text, span).toContain(tail)
      expect(text, span).not.toContain('을 읽어요.')
    }
  })

  it('AC-4108.1: 둘째 줄 REVENUE_HINT는 시안 글 그대로이고 불러올 기간과 상관없이 같다', () => {
    expect(REVENUE_HINT).toBe('매출은 이 가운데 아직 가져오지 않은 날만 읽어요. 처음 한 번은 한 달에 10초쯤 더 걸려요.')
  })
})

describe('AC-4108.3 매출 읽는 중 줄', () => {
  it('AC-4108.3: 덩어리가 하나면 시안 글 그대로다', () => {
    expect(revenueProgressText(1, 1)).toBe('비트 PC에서 읽는 중이에요 (환자·처방 저장 끝 · 매출 읽는 중). 다 끝날 때까지 이 창을 닫지 마세요.')
  })

  it('AC-4108.3: 덩어리가 둘 이상이면 차례를 붙인다(기본값 12: 매출 읽는 중 3/13)', () => {
    expect(revenueProgressText(3, 13)).toBe('비트 PC에서 읽는 중이에요 (환자·처방 저장 끝 · 매출 읽는 중 3/13). 다 끝날 때까지 이 창을 닫지 마세요.')
    expect(revenueProgressText(1, 2)).toBe('비트 PC에서 읽는 중이에요 (환자·처방 저장 끝 · 매출 읽는 중 1/2). 다 끝날 때까지 이 창을 닫지 마세요.')
  })

  it('AC-4108.3: 읽을 덩어리를 세는 동안(0/0)은 차례 없이 시안 글이다', () => {
    expect(revenueProgressText(0, 0)).toBe(revenueProgressText(1, 1))
  })
})

describe('AC-3305.1 한 번 읽기 한도는 명령 표와 같다', () => {
  it('AC-3305.1 commands.json stats.rows maxDays는 800이고 MAX_READ_DAYS와 같다', () => {
    expect(commands.commands['stats.rows'].maxDays).toBe(800)
    expect(MAX_READ_DAYS).toBe(commands.commands['stats.rows'].maxDays)
  })
})

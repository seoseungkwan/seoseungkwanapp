import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { compareNumbers } from '@/lib/analytics/compare'
import { checkCustom, defaultPick, lastDayOf, pickRange, pickReportText, stepPick, type StatsPick } from './periodPick'
import type { StatsRange, SummaryCell } from './view'

// 통계 기간 고르기의 날짜·이름 셈 (stats-period REQ-1701·REQ-1702·REQ-1707, design.md periodPick.ts). 시험의 오늘은 2026-11-06(금)이다.
// 숫자는 모두 지어낸 값이다

const TODAY = '2026-11-06'
const YESTERDAY = '2026-11-05'
const october: StatsPick = { kind: 'month', unit: 'day', month: '2026-10' }
const span = (range: { from: string; to: string }) => ({ from: range.from, to: range.to })

describe('AC-1701.1 달 고르기 (끝난 달)', () => {
  it('AC-1701.1 2026년 10월 일별: 이름·글·세 기간·칸·불러올 범위', () => {
    expect(pickRange(TODAY, october, false)).toEqual({
      period: null,
      name: '2026년 10월',
      current: { from: '2026-10-01', to: '2026-10-31', label: '2026년 10월 1일 – 31일' },
      previous: { from: '2026-09-01', to: '2026-09-30', label: '9월 1일 – 30일', name: '9월', why: '바로 전 달' },
      lastYear: { from: '2025-10-01', to: '2025-10-31', label: '2025년 10월 1일 – 31일', name: '작년 10월', why: '작년 같은 달' },
      finishedCohort: null,
      load: { from: '2025-10-01', to: '2026-11-06' },
      grain: 'day',
      bucket: 'day',
      label: '2026년 10월 1일 – 31일',
    })
  })

  it("AC-1701.1 unit 'week'면 bucket만 'week'다", () => {
    const day = pickRange(TODAY, october, false)
    const week = pickRange(TODAY, { ...october, unit: 'week' }, false)
    expect(week).toEqual({ ...day, bucket: 'week' })
  })

  it('AC-1701.1 오늘이 끝났어도 끝난 달은 같다', () => {
    expect(pickRange(TODAY, october, true)).toEqual(pickRange(TODAY, october, false))
  })
})

describe('AC-1701.2 끝나지 않은 달·달 경계', () => {
  const november: StatsPick = { kind: 'month', unit: 'day', month: '2026-11' }

  it('AC-1701.2 오늘이 안 끝났으면 세 기간 모두 5일까지이고 why는 같은 날까지다', () => {
    const range = pickRange(TODAY, november, false)
    expect(range.name).toBe('2026년 11월')
    expect(range.current).toEqual({ from: '2026-11-01', to: '2026-11-05', label: '2026년 11월 1일 – 5일' })
    expect(range.label).toBe('2026년 11월 1일 – 5일')
    expect(range.previous).toEqual({ from: '2026-10-01', to: '2026-10-05', label: '10월 1일 – 5일', name: '10월', why: '바로 전 달 같은 날까지' })
    expect(range.lastYear).toEqual({ from: '2025-11-01', to: '2025-11-05', label: '2025년 11월 1일 – 5일', name: '작년 11월', why: '작년 같은 날까지' })
    expect(range.load).toEqual({ from: '2025-11-01', to: TODAY })
  })

  it('AC-1701.2 오늘이 끝났으면 세 끝이 모두 6일이다', () => {
    const range = pickRange(TODAY, november, true)
    expect([range.current, range.previous, range.lastYear!].map(span)).toEqual([
      { from: '2026-11-01', to: '2026-11-06' },
      { from: '2026-10-01', to: '2026-10-06' },
      { from: '2025-11-01', to: '2025-11-06' },
    ])
    expect(range.previous.why).toBe('바로 전 달 같은 날까지')
    expect(range.lastYear?.why).toBe('작년 같은 날까지')
  })

  it('AC-1701.2 3월 31일까지인 3월의 바로 전은 2월 말일에서 끝난다', () => {
    const march: StatsPick = { kind: 'month', unit: 'day', month: '2026-03' }
    const done = pickRange('2026-03-31', march, true)
    expect(span(done.current)).toEqual({ from: '2026-03-01', to: '2026-03-31' })
    expect(done.previous).toMatchObject({ from: '2026-02-01', to: '2026-02-28', why: '바로 전 달' })
    // 3월 30일까지(오늘 31일이 안 끝남)도 2월 말일까지다
    const open = pickRange('2026-03-31', march, false)
    expect(open.previous).toMatchObject({ from: '2026-02-01', to: '2026-02-28', why: '바로 전 달 같은 날까지' })
    // 작년 2월이 윤달이면 작년 같은 날까지도 말일에서 멈춘다
    const leap = pickRange('2029-03-01', { kind: 'month', unit: 'day', month: '2029-02' }, false)
    expect(leap.lastYear).toMatchObject({ from: '2028-02-01', to: '2028-02-29', why: '작년 같은 달' })
    const leapOpen = pickRange('2028-03-01', { kind: 'month', unit: 'day', month: '2028-02' }, false)
    expect(span(leapOpen.current)).toEqual({ from: '2028-02-01', to: '2028-02-29' })
    expect(leapOpen.lastYear).toMatchObject({ from: '2027-02-01', to: '2027-02-28', why: '작년 같은 달' })
  })

  it("AC-1701.2 '2026-01'의 바로 전 이름은 '2025년 12월'이다", () => {
    const range = pickRange(TODAY, { kind: 'month', unit: 'day', month: '2026-01' }, false)
    expect(range.previous).toEqual({ from: '2025-12-01', to: '2025-12-31', label: '2025년 12월 1일 – 31일', name: '2025년 12월', why: '바로 전 달' })
    expect(range.lastYear).toMatchObject({ from: '2025-01-01', to: '2025-01-31', name: '작년 1월' })
    expect(range.load).toEqual({ from: '2025-01-01', to: TODAY })
  })
})

describe('AC-1701.3 해 고르기', () => {
  it('AC-1701.3 끝나지 않은 2026년: 어제까지, 달 칸, 비교는 작년 같은 날까지 하나', () => {
    const range = pickRange(TODAY, { kind: 'year', year: '2026' }, false)
    expect(range).toEqual({
      period: null,
      name: '2026년',
      current: { from: '2026-01-01', to: '2026-11-05', label: '2026년 1월 1일 – 11월 5일' },
      previous: { from: '2025-01-01', to: '2025-11-05', label: '2025년 1월 1일 – 11월 5일', name: '2025년', why: '작년 같은 날까지' },
      lastYear: null,
      finishedCohort: null,
      load: { from: '2025-01-01', to: TODAY },
      grain: 'day',
      bucket: 'month',
      label: '2026년 1월 1일 – 11월 5일',
      whole: { from: '2026-01-01', to: '2026-12-31' },
    })
  })

  it("AC-1701.3 끝난 2025년은 해 전체이고 why '작년', 불러오기는 2024-01-01부터다", () => {
    const range = pickRange(TODAY, { kind: 'year', year: '2025' }, false)
    expect(range.name).toBe('2025년')
    expect(range.current).toEqual({ from: '2025-01-01', to: '2025-12-31', label: '2025년 1월 1일 – 12월 31일' })
    expect(range.previous).toEqual({ from: '2024-01-01', to: '2024-12-31', label: '2024년 1월 1일 – 12월 31일', name: '2024년', why: '작년' })
    expect(range.lastYear).toBeNull()
    expect(range.bucket).toBe('month')
    expect(range.load).toEqual({ from: '2024-01-01', to: TODAY })
  })

  it('AC-1701.3 해 고르기만 자르지 않은 그 해(whole, 1월 1일 ~ 12월 31일)를 갖는다 — 달·직접 날짜는 whole이 없다(월별 막대가 고른 기간 밖 달을 잇지 않는다)', () => {
    expect(pickRange(TODAY, { kind: 'year', year: '2025' }, false).whole).toEqual({ from: '2025-01-01', to: '2025-12-31' })
    expect(pickRange(TODAY, { kind: 'year', year: '2026' }, true).whole).toEqual({ from: '2026-01-01', to: '2026-12-31' })
    expect(pickRange(TODAY, { kind: 'month', unit: 'day', month: '2026-11' }, false).whole).toBeUndefined()
    expect(pickRange(TODAY, { kind: 'custom', unit: 'month', from: '2025-12-01', to: '2026-11-05' }, false).whole).toBeUndefined()
    expect(pickRange(TODAY, { kind: 'custom', unit: 'month', from: '2026-06-01', to: '2026-11-05' }, false)).not.toHaveProperty('whole')
  })

  it('AC-1701.3 오늘이 끝났으면 2026년은 오늘까지다', () => {
    const range = pickRange(TODAY, { kind: 'year', year: '2026' }, true)
    expect(span(range.current)).toEqual({ from: '2026-01-01', to: '2026-11-06' })
    expect(span(range.previous)).toEqual({ from: '2025-01-01', to: '2025-11-06' })
  })
})

describe('AC-1701.4 직접 날짜', () => {
  it('AC-1701.4 10월 3일 – 11월 1일 주별: 바로 전 30일과 작년 같은 날짜', () => {
    const range = pickRange(TODAY, { kind: 'custom', unit: 'week', from: '2026-10-03', to: '2026-11-01' }, false)
    expect(range).toEqual({
      period: null,
      name: '직접 고른 기간',
      current: { from: '2026-10-03', to: '2026-11-01', label: '2026년 10월 3일 – 11월 1일' },
      previous: { from: '2026-09-03', to: '2026-10-02', label: '9월 3일 – 10월 2일', name: '바로 전 30일', why: '바로 전 30일' },
      lastYear: { from: '2025-10-03', to: '2025-11-01', label: '2025년 10월 3일 – 11월 1일', name: '작년 같은 날짜', why: '작년 같은 날짜' },
      finishedCohort: null,
      load: { from: '2025-10-01', to: TODAY },
      grain: 'day',
      bucket: 'week',
      label: '2026년 10월 3일 – 11월 1일',
    })
  })

  it('AC-1701.4 2024-02-29의 작년은 2023-02-28이다', () => {
    const range = pickRange('2024-03-10', { kind: 'custom', unit: 'day', from: '2024-02-20', to: '2024-02-29' }, false)
    expect(span(range.lastYear!)).toEqual({ from: '2023-02-20', to: '2023-02-28' })
    expect(range.previous.name).toBe('바로 전 10일')
  })

  it('AC-1701.4 해를 넘는 기간의 글은 양 끝에 해를 붙인다', () => {
    const range = pickRange(TODAY, { kind: 'custom', unit: 'month', from: '2025-12-20', to: '2026-01-10' }, false)
    expect(range.label).toBe('2025년 12월 20일 – 2026년 1월 10일')
    expect(range.previous.label).toBe('2025년 11월 28일 – 12월 19일')
    expect(range.lastYear?.label).toBe('2024년 12월 20일 – 2025년 1월 10일')
    expect(range.bucket).toBe('month')
  })

  it('AC-1701.4 작년 기간이 고른 기간과 겹치면 작년 비교는 없다: 365일은 남고 366일은 null', () => {
    const days365 = pickRange(TODAY, { kind: 'custom', unit: 'month', from: '2025-11-06', to: '2026-11-05' }, false)
    expect(span(days365.lastYear!)).toEqual({ from: '2024-11-06', to: '2025-11-05' })
    expect(days365.previous.name).toBe('바로 전 365일')
    const days366 = pickRange(TODAY, { kind: 'custom', unit: 'month', from: '2025-11-05', to: '2026-11-05' }, false)
    expect(days366.lastYear).toBeNull()
    expect(span(days366.previous)).toEqual({ from: '2024-11-04', to: '2025-11-04' })
    expect(days366.load).toEqual({ from: '2024-11-01', to: TODAY })
  })
})

describe('AC-1702.1 끝난 마지막 날과 ◀▶', () => {
  it('AC-1702.1 끝난 마지막 날은 오늘이 끝났으면 오늘, 아니면 어제다', () => {
    expect(lastDayOf(TODAY, false)).toBe(YESTERDAY)
    expect(lastDayOf(TODAY, true)).toBe(TODAY)
    expect(lastDayOf('2026-01-01', false)).toBe('2025-12-31')
  })

  it("AC-1702.1 ▶: '2026-11'·'2026'은 못 가고 '2026-10'은 간다", () => {
    expect(stepPick({ kind: 'month', unit: 'day', month: '2026-11' }, 1, YESTERDAY)).toBeNull()
    expect(stepPick({ kind: 'year', year: '2026' }, 1, YESTERDAY)).toBeNull()
    expect(stepPick({ kind: 'month', unit: 'week', month: '2026-10' }, 1, YESTERDAY)).toEqual({ kind: 'month', unit: 'week', month: '2026-11' })
    expect(stepPick({ kind: 'year', year: '2025' }, 1, YESTERDAY)).toEqual({ kind: 'year', year: '2026' })
  })

  it("AC-1702.1 11월 1일에 오늘이 안 끝났으면 '2026-10'에서도 못 간다", () => {
    const lastDay = lastDayOf('2026-11-01', false)
    expect(stepPick(october, 1, lastDay)).toBeNull()
    expect(stepPick(october, 1, lastDayOf('2026-11-01', true))).toEqual({ ...october, month: '2026-11' })
  })

  it('AC-1702.1 ◀는 해 경계를 넘어 간다', () => {
    expect(stepPick(october, -1, YESTERDAY)).toEqual({ ...october, month: '2026-09' })
    expect(stepPick({ kind: 'month', unit: 'day', month: '2026-01' }, -1, YESTERDAY)).toEqual({ kind: 'month', unit: 'day', month: '2025-12' })
    expect(stepPick({ kind: 'year', year: '2026' }, -1, YESTERDAY)).toEqual({ kind: 'year', year: '2025' })
  })

  it('AC-1702.1 ◀는 2020년 1월(월별은 2020년)까지 가고 그 앞으로는 못 간다', () => {
    expect(stepPick({ kind: 'month', unit: 'day', month: '2020-02' }, -1, YESTERDAY)).toEqual({ kind: 'month', unit: 'day', month: '2020-01' })
    expect(stepPick({ kind: 'month', unit: 'week', month: '2021-01' }, -1, YESTERDAY)).toEqual({ kind: 'month', unit: 'week', month: '2020-12' })
    expect(stepPick({ kind: 'month', unit: 'day', month: '2020-01' }, -1, YESTERDAY)).toBeNull()
    expect(stepPick({ kind: 'month', unit: 'week', month: '2020-01' }, -1, YESTERDAY)).toBeNull()
    expect(stepPick({ kind: 'year', year: '2021' }, -1, YESTERDAY)).toEqual({ kind: 'year', year: '2020' })
    expect(stepPick({ kind: 'year', year: '2020' }, -1, YESTERDAY)).toBeNull()
  })

  it('AC-1702.1 2020년 1월·2020년에서도 ▶는 간다', () => {
    expect(stepPick({ kind: 'month', unit: 'day', month: '2020-01' }, 1, YESTERDAY)).toEqual({ kind: 'month', unit: 'day', month: '2020-02' })
    expect(stepPick({ kind: 'year', year: '2020' }, 1, YESTERDAY)).toEqual({ kind: 'year', year: '2021' })
  })
})

describe('AC-1703.2 처음 고를 때의 달·해 (defaultPick)', () => {
  it('AC-1703.2 일별·주별은 끝난 날이 든 달의 앞 달, 월별은 끝난 날의 해다', () => {
    expect(defaultPick('day', YESTERDAY)).toEqual({ kind: 'month', unit: 'day', month: '2026-10' })
    expect(defaultPick('week', YESTERDAY)).toEqual({ kind: 'month', unit: 'week', month: '2026-10' })
    expect(defaultPick('month', YESTERDAY)).toEqual({ kind: 'year', year: '2026' })
  })

  it('AC-1703.2 11월 1일에 오늘이 안 끝났으면 지난달은 2026-09다', () => {
    expect(defaultPick('day', lastDayOf('2026-11-01', false))).toEqual({ kind: 'month', unit: 'day', month: '2026-09' })
    expect(defaultPick('month', lastDayOf('2026-01-01', false))).toEqual({ kind: 'year', year: '2025' })
  })
})

describe('AC-1702.2 직접 날짜 검사', () => {
  it('AC-1702.2 날짜가 비면 오류다', () => {
    const text = '시작 날짜와 끝 날짜를 모두 골라 주세요.'
    expect(checkCustom('', '2026-11-01', 'day', YESTERDAY)).toEqual({ kind: 'error', text })
    expect(checkCustom('2026-10-01', '', 'day', YESTERDAY)).toEqual({ kind: 'error', text })
    expect(checkCustom('', '', 'week', YESTERDAY)).toEqual({ kind: 'error', text })
  })

  it('AC-1702.2 끝이 시작보다 앞이면 오류다', () => {
    expect(checkCustom('2026-10-10', '2026-10-09', 'day', YESTERDAY)).toEqual({ kind: 'error', text: '끝 날짜가 시작 날짜보다 앞이에요.' })
  })

  it('AC-1702.2 끝이 끝난 날보다 뒤면 오류다(어제·오늘)', () => {
    expect(checkCustom('2026-10-01', TODAY, 'day', YESTERDAY)).toEqual({ kind: 'error', text: '어제(11월 5일)까지만 고를 수 있어요.' })
    expect(checkCustom('2026-10-01', '2026-11-07', 'day', TODAY, true)).toEqual({ kind: 'error', text: '오늘(11월 6일)까지만 고를 수 있어요.' })
  })

  it('AC-1702.2 맞으면 날 수를 준다', () => {
    expect(checkCustom('2026-10-03', '2026-11-01', 'week', YESTERDAY)).toEqual({ kind: 'ok', days: 30 })
    expect(checkCustom(YESTERDAY, YESTERDAY, 'day', YESTERDAY)).toEqual({ kind: 'ok', days: 1 })
    expect(checkCustom('2026-10-01', TODAY, 'day', TODAY, true)).toEqual({ kind: 'ok', days: 37 })
  })
})

describe('AC-1702.3 일별 92일 한도', () => {
  it('AC-1702.3 일별 93일은 경고이고 볼 수 없다', () => {
    expect(checkCustom('2026-08-05', '2026-11-05', 'day', YESTERDAY)).toEqual({
      kind: 'warn',
      text: '일별은 92일까지 볼 수 있어요. 고른 기간이 93일이라 주별이나 월별로 보면 한눈에 보여요.',
      days: 93,
    })
  })

  it('AC-1702.3 일별 92일은 된다', () => {
    expect(checkCustom('2026-08-06', '2026-11-05', 'day', YESTERDAY)).toEqual({ kind: 'ok', days: 92 })
  })

  it('AC-1702.3 주별·월별은 400일도 된다', () => {
    expect(checkCustom('2025-10-02', '2026-11-05', 'week', YESTERDAY)).toEqual({ kind: 'ok', days: 400 })
    expect(checkCustom('2025-10-02', '2026-11-05', 'month', YESTERDAY)).toEqual({ kind: 'ok', days: 400 })
  })
})

describe('AC-1702.4 고를 수 있는 날짜 한도 (2020-01-01부터, 한 번에 1827일까지)', () => {
  const tooEarly = { kind: 'error', text: '2020년 1월 1일부터 고를 수 있어요.' }
  const tooLong = { kind: 'error', text: '한 번에 5년까지 볼 수 있어요.' }

  it('AC-1702.4 시작이 2020-01-01보다 앞이면 오류다', () => {
    expect(checkCustom('2019-12-31', '2020-01-31', 'week', YESTERDAY)).toEqual(tooEarly)
    expect(checkCustom('2019-12-31', '2019-12-31', 'day', YESTERDAY)).toEqual(tooEarly)
    // 해를 한 자리씩 치는 동안의 먼 날짜(0202년)도 같은 오류다
    expect(checkCustom('0202-10-01', '2026-10-31', 'month', YESTERDAY)).toEqual(tooEarly)
  })

  it('AC-1702.4 2020-01-01 시작은 된다', () => {
    expect(checkCustom('2020-01-01', '2020-01-31', 'day', YESTERDAY)).toEqual({ kind: 'ok', days: 31 })
  })

  it('AC-1702.4 1827일(5년)을 넘으면 오류이고 1827일은 된다', () => {
    // 2021-11-05 ~ 2026-11-05 = 1827일(2024 윤년 포함)
    expect(checkCustom('2021-11-05', '2026-11-05', 'month', YESTERDAY)).toEqual({ kind: 'ok', days: 1827 })
    expect(checkCustom('2021-11-04', '2026-11-05', 'month', YESTERDAY)).toEqual(tooLong)
    expect(checkCustom('2021-11-04', '2026-11-05', 'week', YESTERDAY)).toEqual(tooLong)
    // 2020-01-01 ~ 2024-12-31 = 1827일(2020·2024 윤년)
    expect(checkCustom('2020-01-01', '2024-12-31', 'week', YESTERDAY)).toEqual({ kind: 'ok', days: 1827 })
    expect(checkCustom('2020-01-01', '2025-01-01', 'week', YESTERDAY)).toEqual(tooLong)
  })

  it('AC-1702.4 일별로 1827일을 넘으면 92일 경고가 아니라 5년 오류다', () => {
    expect(checkCustom('2021-11-04', '2026-11-05', 'day', YESTERDAY)).toEqual(tooLong)
  })
})

// 기간 요약 칸(view.ts summaryCells가 고른 기간에 주는 모양). 비교 칸의 delta null = 견줄 수 없음
function cellsOf(o: { average: number | null; newCount?: number; returning?: number; compare?: number | null; lastYear?: number | null }): SummaryCell[] {
  const compareCell = (key: 'compare' | 'lastYear', before: number | null | undefined): SummaryCell[] =>
    before === undefined
      ? []
      : [{ key, label: '', value: before, note: '', partial: false, delta: before === null || o.average === null ? null : compareNumbers(o.average, before) }]
  return [
    { key: 'average', label: '하루 평균 환자 수', value: o.average, note: '', partial: false, delta: null },
    { key: 'new', label: '신환', value: o.newCount ?? null, note: '', partial: false, delta: null },
    { key: 'returning', label: '재진', value: o.returning ?? null, note: '', partial: false, delta: null },
    ...compareCell('compare', o.compare),
    ...compareCell('lastYear', o.lastYear),
  ]
}

const octoberRange = (): StatsRange => pickRange(TODAY, october, false)
const top2 = [
  { name: '도수치료', count: 310 },
  { name: '체외충격파', count: 95 },
]

describe('AC-1707.2 고른 기간 보고 문장', () => {
  it('AC-1707.2 10월: 바로 전·작년과 견주고 처방 1·2위를 쓴다(비율은 소수 첫째 자리까지 버림)', () => {
    const cells = cellsOf({ average: 42, newCount: 120, returning: 980, compare: 39, lastYear: 44 })
    expect(pickReportText(octoberRange(), cells, top2)).toBe(
      '2026년 10월 1일 – 31일 환자는 하루 평균 42명, 신환 120명·재진 980명입니다. 하루 평균은 9월보다 3명(7.6%) 늘었고, 작년 10월보다는 2명(4.5%) 줄었습니다. 처방은 도수치료 310건, 체외충격파 95건 순으로 많았습니다.',
    )
  })

  it('AC-1707.2 세 자리마다 쉼표를 찍고 3위부터는 쓰지 않는다', () => {
    const cells = cellsOf({ average: 1200, newCount: 3400, returning: 25000, compare: 1000, lastYear: 1200 })
    const top = [...top2, { name: '주사', count: 50 }]
    expect(pickReportText(octoberRange(), cells, top)).toBe(
      '2026년 10월 1일 – 31일 환자는 하루 평균 1,200명, 신환 3,400명·재진 25,000명입니다. 하루 평균은 9월보다 200명(20.0%) 늘었고, 작년 10월과는 같았습니다. 처방은 도수치료 310건, 체외충격파 95건 순으로 많았습니다.',
    )
  })

  it('AC-1707.2 해 고르기는 비교 하나다', () => {
    const range = pickRange(TODAY, { kind: 'year', year: '2025' }, false)
    const cells = cellsOf({ average: 40, newCount: 1000, returning: 9000, compare: 50 })
    expect(pickReportText(range, cells, [])).toBe(
      '2025년 1월 1일 – 12월 31일 환자는 하루 평균 40명, 신환 1,000명·재진 9,000명입니다. 하루 평균은 2024년보다 10명(20.0%) 줄었습니다.',
    )
  })
})

describe('AC-1707.3 견줄 수 없거나 자료가 없을 때', () => {
  it('AC-1707.3 바로 전과 같고 작년 자료가 없으며 처방 1위만 있을 때의 전체 글', () => {
    const cells = cellsOf({ average: 42, newCount: 120, returning: 980, compare: 42, lastYear: null })
    expect(pickReportText(octoberRange(), cells, [top2[0]])).toBe(
      '2026년 10월 1일 – 31일 환자는 하루 평균 42명, 신환 120명·재진 980명입니다. 하루 평균은 9월과 같았습니다. 작년 10월은 자료가 없어 비교하지 않았습니다. 처방은 도수치료 310건이 가장 많았습니다.',
    )
  })

  it('AC-1707.3 바로 전 자료가 없으면 그 비교 대신 자료 없음 문장이고, 묶음 줄이 없으면 처방 문장이 없다', () => {
    const cells = cellsOf({ average: 42, newCount: 120, returning: 980, compare: null, lastYear: 44 })
    expect(pickReportText(octoberRange(), cells, [])).toBe(
      '2026년 10월 1일 – 31일 환자는 하루 평균 42명, 신환 120명·재진 980명입니다. 하루 평균은 작년 10월보다 2명(4.5%) 줄었습니다. 9월은 자료가 없어 비교하지 않았습니다.',
    )
  })

  it('AC-1707.3 비교 둘 다 자료가 없으면 견주는 문장 없이 자료 없음 문장 둘이다', () => {
    const cells = cellsOf({ average: 42, newCount: 120, returning: 980, compare: null, lastYear: null })
    expect(pickReportText(octoberRange(), cells, [])).toBe(
      '2026년 10월 1일 – 31일 환자는 하루 평균 42명, 신환 120명·재진 980명입니다. 9월은 자료가 없어 비교하지 않았습니다. 작년 10월은 자료가 없어 비교하지 않았습니다.',
    )
  })

  it("AC-1707.3 받침 없는 이름은 '와'·'는'이다(작년 같은 날짜)", () => {
    const range = pickRange(TODAY, { kind: 'custom', unit: 'day', from: '2026-10-03', to: '2026-11-01' }, false)
    const same = cellsOf({ average: 42, newCount: 120, returning: 980, compare: 40, lastYear: 42 })
    expect(pickReportText(range, same, [])).toContain('하루 평균은 바로 전 30일보다 2명(5.0%) 늘었고, 작년 같은 날짜와는 같았습니다.')
    const none = cellsOf({ average: 42, newCount: 120, returning: 980, compare: 40, lastYear: null })
    expect(pickReportText(range, none, [])).toContain(' 작년 같은 날짜는 자료가 없어 비교하지 않았습니다.')
  })

  it('AC-1707.3 current 자료가 없으면 글을 만들지 않는다(null)', () => {
    expect(pickReportText(octoberRange(), cellsOf({ average: null, compare: 39, lastYear: 44 }), top2)).toBeNull()
  })
})

describe('periodPick.ts 소스', () => {
  it('AC-1701.1 view.ts에서는 타입만 불러오고 날짜는 dates.ts·comparisonRange만 쓴다', () => {
    const source = readFileSync(join(__dirname, 'periodPick.ts'), 'utf8')
    const imports = source.match(/^import .+$/gm) ?? []
    for (const line of imports.filter((line) => line.includes("'./view'"))) expect(line).toMatch(/^import type /)
    expect(source).not.toMatch(/new Date|Date\.now|todayInKorea/)
  })
})

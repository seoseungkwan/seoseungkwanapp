import { describe, expect, it } from 'vitest'
import { keyedIn } from '@/components/stats/treatmentView'
import { compareNumbers } from '@/lib/analytics/compare'
import { addDays } from '@/lib/analytics/dates'
import type { DayPayload, RevisitPayload } from '@/types/payload'
import type { RxGroupLine } from './source'
import {
  DEFAULT_PERIOD,
  groupRank,
  longDate,
  PERIODS,
  periodRange,
  reportSentence,
  revisitCohortCaption,
  revisitView,
  tickLabels,
  todayView,
  topRx,
  trendBuckets,
  weekdayBuckets,
  type Period,
} from './view'

// 오늘 하루 분석 · 기간별 흐름 · 보고 문장 계산 (tab-frame REQ-311·REQ-317, design.md '오늘 하루 분석 · 기간별 흐름 · 보고 문장').
// 가짜 DayPayload는 이 시험 파일 안에서만 만든다(앱 코드에는 예시 숫자가 없다, AC-312.3)

type Rx = DayPayload['rx'][number]
const rx = (code: string, name: string, patients: number): Rx => ({ code, name, type: '처치', patients, newPatients: 0, returning: patients })

type GroupLine = DayPayload['groups'][number]
// 일 줄의 묶음 열쇠 줄(id = 묶음 열쇠)
const g = (id: string, patients: number): GroupLine => ({ id, patients, newPatients: 0, returning: patients })

type DayOptions = { partial?: boolean; newPatients?: number; returning?: number; rx?: Rx[]; groups?: GroupLine[]; revisit?: RevisitPayload }
function day(ymd: string, o: DayOptions = {}): DayPayload {
  const newPatients = o.newPatients ?? 2
  const returning = o.returning ?? 8
  return {
    schemaVersion: 2,
    quality: 'valid',
    day: ymd,
    partial: o.partial ?? false,
    totals: { patients: newPatients + returning, newPatients, returning, unknown: 0 },
    rx: o.rx ?? [],
    groups: o.groups ?? [],
    revisit: o.revisit ?? { cohort: newPatients, within7: 0, within14: 0 },
  }
}

const TODAY = '2026-10-31' // 토요일
const LAST_WEEK = '2026-10-24'
const WAIT = { kind: 'wait' } as const

describe('todayView — 오늘 숫자와 넷째 칸', () => {
  it('AC-311.2: 오늘 줄이 없으면 none · counts null · 비교는 "오늘 진료가 끝나면"(wait)', () => {
    expect(todayView(TODAY, [])).toEqual({ state: 'none', counts: null, compare: WAIT })
    expect(todayView(TODAY, [day('2026-10-30'), day(LAST_WEEK)])).toEqual({ state: 'none', counts: null, compare: WAIT })
  })

  it('AC-311.2: 오늘 줄이 덜 끝났으면(partial true) open · 오늘 totals · 7일 전이 끝났어도 비교는 wait', () => {
    const view = todayView(TODAY, [day(TODAY, { partial: true, newPatients: 3, returning: 11 }), day(LAST_WEEK)])
    expect(view).toEqual({ state: 'open', counts: { patients: 14, newPatients: 3, returning: 11 }, compare: WAIT })
  })

  it('AC-311.2: 오늘 끝남(partial false) + 7일 전 끝남 → compareNumbers(오늘 환자, 7일 전 환자) + 요일 "토"', () => {
    const view = todayView(TODAY, [day(TODAY, { newPatients: 4, returning: 9 }), day(LAST_WEEK, { newPatients: 2, returning: 8 })])
    expect(view).toEqual({
      state: 'closed',
      counts: { patients: 13, newPatients: 4, returning: 9 },
      compare: { kind: 'delta', delta: compareNumbers(13, 10), weekday: '토' },
    })
  })

  it('AC-311.2·AC-311.6: 오늘 끝남 + 7일 전 줄 없음 또는 덜 끝남 → 지난주 자료 없음(6일·8일 전 줄로 채우지 않는다)', () => {
    const closed = day(TODAY, { newPatients: 4, returning: 9 })
    expect(todayView(TODAY, [closed, day('2026-10-25'), day('2026-10-23')]).compare).toEqual({ kind: 'no-last-week' })
    expect(todayView(TODAY, [closed, day(LAST_WEEK, { partial: true })]).compare).toEqual({ kind: 'no-last-week' })
    expect(todayView(TODAY, [closed]).state).toBe('closed')
  })

  it('AC-311.2: 7일 전이 0명이고 오늘이 있으면 compareNumbers 그대로(새로 생김)', () => {
    const view = todayView(TODAY, [day(TODAY, { newPatients: 1, returning: 2 }), day(LAST_WEEK, { newPatients: 0, returning: 0 })])
    expect(view.compare).toEqual({ kind: 'delta', delta: compareNumbers(3, 0), weekday: '토' })
  })

  it('AC-311.2: 요일 이름은 오늘의 요일 한 글자(월 … 일)', () => {
    const week = ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']
    const names = week.map((t) => {
      const compare = todayView(t, [day(t), day(addDays(t, -7))]).compare
      return compare.kind === 'delta' ? compare.weekday : null
    })
    expect(names).toEqual(['월', '화', '수', '목', '금', '토', '일'])
  })
})

describe('periodRange · tickLabels — 어제까지 N일과 날짜 눈금', () => {
  it('AC-311.3: 기간 단추는 7·30·90일, 처음은 30일', () => {
    expect(PERIODS).toEqual([7, 30, 90])
    expect(DEFAULT_PERIOD).toBe(30)
  })

  it('AC-311.3: 오늘 10월 31일 → 어제까지 N일 "{월}월 {일}일 – {월}월 {일}일"', () => {
    expect(periodRange(TODAY, 30)).toEqual({ from: '2026-10-01', to: '2026-10-30', label: '10월 1일 – 10월 30일' })
    expect(periodRange(TODAY, 7)).toEqual({ from: '2026-10-24', to: '2026-10-30', label: '10월 24일 – 10월 30일' })
    expect(periodRange(TODAY, 90)).toEqual({ from: '2026-08-02', to: '2026-10-30', label: '8월 2일 – 10월 30일' })
  })

  it('AC-311.3: 해·달이 바뀌어도 끝 날짜는 어제(2027-01-01 · 2026-03-01)', () => {
    expect(periodRange('2027-01-01', 7)).toEqual({ from: '2026-12-25', to: '2026-12-31', label: '12월 25일 – 12월 31일' })
    expect(periodRange('2026-03-01', 30)).toEqual({ from: '2026-01-30', to: '2026-02-28', label: '1월 30일 – 2월 28일' })
  })

  it('AC-311.4: 날짜 눈금 "{월}.{일}" — 7일 날마다 · 30일 기간 첫날부터 7일마다 · 90일 21일마다', () => {
    const labels = (p: Period) => tickLabels(periodRange(TODAY, p), p).map((t) => t.label)
    expect(labels(7)).toEqual(['10.24', '10.25', '10.26', '10.27', '10.28', '10.29', '10.30'])
    expect(labels(30)).toEqual(['10.1', '10.8', '10.15', '10.22', '10.29'])
    expect(labels(90)).toEqual(['8.2', '8.23', '9.13', '10.4', '10.25'])
  })

  it('AC-311.4: 눈금마다 그 날짜(day)를 같이 준다', () => {
    expect(tickLabels(periodRange(TODAY, 30), 30)).toEqual([
      { day: '2026-10-01', label: '10.1' },
      { day: '2026-10-08', label: '10.8' },
      { day: '2026-10-15', label: '10.15' },
      { day: '2026-10-22', label: '10.22' },
      { day: '2026-10-29', label: '10.29' },
    ])
  })
})

describe('trendBuckets — 환자 수 추이 칸', () => {
  const MONTH = periodRange(TODAY, 30)

  it('AC-311.5: 기간 안 자료가 있는 날만 날짜 순 · 값 [신환, 재진] · 덜 끝난 날 partial · rangeLabel "{월}월 {일}일" · 눈금 날에만 label', () => {
    const days = [
      day('2026-10-30', { newPatients: 5, returning: 0 }),
      day('2026-10-08', { newPatients: 1, returning: 4 }),
      day(TODAY, { partial: true }),
      day('2026-09-30'),
      day('2026-10-02', { partial: true, newPatients: 0, returning: 3 }),
    ]
    expect(trendBuckets(days, MONTH, 30)).toEqual([
      { key: '2026-10-02', label: '', rangeLabel: '10월 2일', state: 'partial', values: [0, 3] },
      { key: '2026-10-08', label: '10.8', rangeLabel: '10월 8일', state: 'complete', values: [1, 4] },
      { key: '2026-10-30', label: '', rangeLabel: '10월 30일', state: 'complete', values: [5, 0] },
    ])
  })

  it('AC-311.5: 7일은 모든 칸에 날짜 글자, 90일은 21일마다의 날에만', () => {
    const week = periodRange(TODAY, 7)
    expect(trendBuckets([day('2026-10-24'), day('2026-10-27')], week, 7)?.map((b) => b.label)).toEqual(['10.24', '10.27'])
    const quarter = periodRange(TODAY, 90)
    expect(trendBuckets([day('2026-08-02'), day('2026-08-03'), day('2026-08-23')], quarter, 90)?.map((b) => b.label)).toEqual(['8.2', '', '8.23'])
  })

  it('AC-311.5·AC-311.6: 기간 안 자료가 하나도 없으면 null(오늘 줄·기간 앞 날·90일 넘는 날만 있을 때)', () => {
    expect(trendBuckets([], MONTH, 30)).toBeNull()
    expect(trendBuckets([day(TODAY), day('2026-09-30')], MONTH, 30)).toBeNull()
    expect(trendBuckets([day('2026-08-01')], periodRange(TODAY, 90), 90)).toBeNull()
  })

  it('AC-311.6: 빠진 날은 칸을 만들지 않는다 — 0으로 채운 칸이 없다', () => {
    const buckets = trendBuckets([day('2026-10-03'), day('2026-10-17'), day('2026-10-29')], MONTH, 30) ?? []
    expect(buckets.map((b) => b.key)).toEqual(['2026-10-03', '2026-10-17', '2026-10-29'])
    expect(buckets.filter((b) => b.values.every((v) => v === 0))).toEqual([])
  })
})

describe('revisitView — 신환 재방문율 7·14일', () => {
  const MONTH = periodRange(TODAY, 30)
  // 이 시험들의 가짜 자료에는 30일 값이 없다 → null로 친다(AC-516.2). 고친 것은 30일 칸 기대값뿐이다(AC-516.4)
  const NO_D30 = { d30: { kind: 'in-progress' }, d30Cohort: null }

  it('AC-311.5·AC-516.4: Σwithin ÷ Σcohort, 그 값이 null인 날은 분자·분모 모두에서 뺀다(7일·14일 따로)', () => {
    const days = [
      day('2026-10-10', { revisit: { cohort: 4, within7: 1, within14: 2 } }),
      day('2026-10-20', { revisit: { cohort: 6, within7: 3, within14: null } }),
      day('2026-10-29', { revisit: { cohort: 10, within7: null, within14: null } }),
    ]
    expect(revisitView(days, MONTH)).toEqual({ d7: { kind: 'rate', value: 4 / 10 }, d14: { kind: 'rate', value: 2 / 4 }, ...NO_D30 })
  })

  it('AC-311.5·AC-516.4: 모든 날이 null이면 집계 중(in-progress)', () => {
    const days = [day('2026-10-28', { revisit: { cohort: 3, within7: null, within14: null } })]
    expect(revisitView(days, MONTH)).toEqual({ d7: { kind: 'in-progress' }, d14: { kind: 'in-progress' }, ...NO_D30 })
  })

  it('AC-311.5·AC-516.4: 남은 분모가 0이면 자료 없음(none), 기간 안 날이 없어도 none', () => {
    const days = [day('2026-10-28', { newPatients: 0, revisit: { cohort: 0, within7: 0, within14: 0 } })]
    expect(revisitView(days, MONTH)).toEqual({ d7: { kind: 'none' }, d14: { kind: 'none' }, ...NO_D30 })
    expect(revisitView([], MONTH)).toEqual({ d7: { kind: 'none' }, d14: { kind: 'none' }, d30: { kind: 'none' }, d30Cohort: null })
  })

  it('AC-311.6·AC-516.4: 기간 밖 날(오늘·기간 앞)은 셈에 들지 않는다', () => {
    const days = [
      day('2026-10-15', { revisit: { cohort: 5, within7: 1, within14: 1 } }),
      day(TODAY, { revisit: { cohort: 100, within7: 100, within14: 100 } }),
      day('2026-09-01', { revisit: { cohort: 100, within7: 0, within14: 0 } }),
    ]
    expect(revisitView(days, MONTH)).toEqual({ d7: { kind: 'rate', value: 1 / 5 }, d14: { kind: 'rate', value: 1 / 5 }, ...NO_D30 })
  })
})

describe('revisitView — 신환 재방문율 30일 줄 (AC-516.2)', () => {
  // 오늘 11월 13일: 30일 기간 = 10월 14일 ~ 11월 12일, 30일 줄이 세는 날 = 9월 14일(오늘 − 60) ~ 10월 13일(오늘 − 31)
  const NOV = '2026-11-13'
  const WEEK = periodRange(NOV, 7)
  const MONTH = periodRange(NOV, 30)
  const QUARTER = periodRange(NOV, 90)
  const d30 = (ymd: string, cohort: number, within30: number | null) => day(ymd, { revisit: { cohort, within7: 0, within14: 0, within30 } })

  it('AC-516.2: 30일 줄도 7·14일과 같은 규칙이다 — 값이 null이 아닌 날들의 합 ÷ 집단 합, period를 주지 않으면 고른 기간 그대로이고 d30Cohort는 null', () => {
    const days = [d30('2026-10-20', 4, 1), d30('2026-10-25', 6, 3), d30('2026-11-01', 90, null)]
    expect(revisitView(days, MONTH).d30).toEqual({ kind: 'rate', value: 4 / 10 })
    expect(revisitView(days, MONTH).d30Cohort).toBeNull()
  })

  it('AC-516.2: within30이 빠진 가짜 자료는 null로 친다 — 숫자인 날만 세고, 모두 빠지면 집계 중', () => {
    const missing = day('2026-10-20', { revisit: { cohort: 90, within7: 0, within14: 0 } })
    expect(revisitView([missing, d30('2026-10-25', 5, 2)], MONTH).d30).toEqual({ kind: 'rate', value: 2 / 5 })
    expect(revisitView([missing], MONTH).d30).toEqual({ kind: 'in-progress' })
    expect(revisitView([missing], MONTH, 30).d30).toEqual({ kind: 'none' }) // 그 날은 고른 기간 안이라 30일 줄이 세는 날이 없다
  })

  it('AC-516.2: 오늘이 11월 13일인 30일 기간 — 30일 줄이 9월 14일 ~ 10월 13일을 세고 그 날짜를 보인다', () => {
    const days = [
      d30('2026-09-13', 100, 100), // 하루 앞: 세지 않는다
      d30('2026-10-13', 6, 3),
      d30('2026-09-14', 4, 1),
      d30('2026-10-14', 100, 0), // 하루 뒤(고른 기간의 첫날): 세지 않는다
    ]
    const view = revisitView(days, MONTH, 30)
    expect(view.d30).toEqual({ kind: 'rate', value: 4 / 10 })
    expect(view.d30Cohort).toEqual({ from: '2026-09-14', to: '2026-10-13', within: 4, cohort: 10 })
    expect(revisitCohortCaption(view.d30Cohort!)).toBe('9월 14일 – 10월 13일에 온 신환 10명 가운데 4명 · 온 뒤 30일이 지난 가장 최근 신환이에요')
  })

  it('AC-516.2: 가장 새로운 날들이 null — 날짜가 숫자인 날까지로 줄어든다(합도 그 날들만)', () => {
    const days = [d30('2026-09-14', 50, null), d30('2026-09-20', 4, 2), d30('2026-10-01', 6, 1), d30('2026-10-10', 50, null), d30('2026-10-13', 50, null)]
    const view = revisitView(days, MONTH, 30)
    expect(view.d30).toEqual({ kind: 'rate', value: 3 / 10 })
    expect(view.d30Cohort).toEqual({ from: '2026-09-20', to: '2026-10-01', within: 3, cohort: 10 })
    expect(revisitCohortCaption(view.d30Cohort!)).toBe('9월 20일 – 10월 1일에 온 신환 10명 가운데 3명 · 온 뒤 30일이 지난 가장 최근 신환이에요')
  })

  it('AC-516.2: 7일 기간 — 30일 줄이 집계 중이다(고른 기간의 날은 온 지 30일이 안 됐다), 끝난 날을 가져다 세지 않는다', () => {
    const days = [d30('2026-09-20', 4, 2), d30('2026-11-08', 3, null), d30('2026-11-10', 3, null)]
    const view = revisitView(days, WEEK, 7)
    expect(view.d30).toEqual({ kind: 'in-progress' })
    expect(view.d30Cohort).toBeNull()
  })

  it('AC-516.2: 90일 기간은 바뀌지 않는다 — 30일 줄도 고른 기간 그대로 세고 caption 값이 없다', () => {
    const days = [d30('2026-08-20', 4, 1), d30('2026-10-01', 6, 3), d30('2026-11-10', 5, null)]
    const view = revisitView(days, QUARTER, 90)
    expect(view.d30).toEqual({ kind: 'rate', value: 4 / 10 })
    expect(view.d30Cohort).toBeNull()
  })

  it('AC-516.2: 30일 기간에 그 범위의 날이 모두 null이면 집계 중이고 d30Cohort는 null', () => {
    const view = revisitView([d30('2026-09-20', 4, null), d30('2026-10-01', 6, null)], MONTH, 30)
    expect(view.d30).toEqual({ kind: 'in-progress' })
    expect(view.d30Cohort).toBeNull()
  })

  it('AC-516.2: 30일 기간에 분모가 0이거나 그 범위에 줄이 없으면 자료 없음이고 d30Cohort는 null', () => {
    for (const days of [[d30('2026-09-20', 0, 0)], [], [d30('2026-10-20', 4, 1)]]) {
      const view = revisitView(days, MONTH, 30)
      expect(view.d30).toEqual({ kind: 'none' })
      expect(view.d30Cohort).toBeNull()
    }
  })

  it('AC-516.2: 30일 기간에서도 7·14일 줄은 고른 기간 그대로다 — 30일 줄이 세는 날은 7·14일 셈에 들지 않는다', () => {
    const days = [
      day('2026-09-20', { revisit: { cohort: 100, within7: 100, within14: 100, within30: 1 } }),
      day('2026-10-20', { revisit: { cohort: 4, within7: 1, within14: 2, within30: null } }),
    ]
    const view = revisitView(days, MONTH, 30)
    expect(view.d7).toEqual({ kind: 'rate', value: 1 / 4 })
    expect(view.d14).toEqual({ kind: 'rate', value: 2 / 4 })
    expect(view.d30).toEqual({ kind: 'rate', value: 1 / 100 })
  })

  it('AC-516.2: caption의 숫자는 formatCount 글자다(천 단위 쉼표)', () => {
    expect(revisitCohortCaption({ from: '2026-09-14', to: '2026-09-14', within: 1200, cohort: 3400 })).toBe(
      '9월 14일 – 9월 14일에 온 신환 3,400명 가운데 1,200명 · 온 뒤 30일이 지난 가장 최근 신환이에요',
    )
  })
})

describe('weekdayBuckets — 요일별 환자 수', () => {
  const MONTH = periodRange(TODAY, 30)

  it('AC-311.5: 월 → 일 가운데 자료 있는 요일만 · 하루 평균 버림 · 그 요일에 덜 끝난 날이 있으면 partial', () => {
    const days = [
      day('2026-10-25', { partial: true, newPatients: 0, returning: 4 }), // 일
      day('2026-10-28', { newPatients: 0, returning: 1 }), // 수
      day('2026-10-26', { newPatients: 1, returning: 9 }), // 월 10
      day('2026-10-21', { newPatients: 0, returning: 2 }), // 수
      day('2026-10-19', { newPatients: 0, returning: 5 }), // 월 5
    ]
    expect(weekdayBuckets(days, MONTH)).toEqual([
      { key: '1', label: '월', rangeLabel: '월요일', state: 'complete', values: [7] },
      { key: '3', label: '수', rangeLabel: '수요일', state: 'complete', values: [1] },
      { key: '7', label: '일', rangeLabel: '일요일', state: 'partial', values: [4] },
    ])
  })

  it('AC-311.6: 평균은 그 요일 자료 있는 날로만 나눈다(빠진 월요일을 0으로 세지 않는다)', () => {
    expect(weekdayBuckets([day('2026-10-12', { newPatients: 3, returning: 9 })], MONTH)).toEqual([
      { key: '1', label: '월', rangeLabel: '월요일', state: 'complete', values: [12] },
    ])
  })

  it('AC-311.5: 기간 안 자료가 없으면 null(오늘 줄은 기간 밖)', () => {
    expect(weekdayBuckets([day(TODAY)], MONTH)).toBeNull()
  })
})

describe('topRx — 처방 상위', () => {
  const MONTH = periodRange(TODAY, 30)

  it('AC-311.5: 코드별 patients 합 큰 5개, 같으면 코드 순 · 이름은 그 코드가 나온 가장 최근 날의 이름 · 기간 밖은 빼고', () => {
    const days = [
      day('2026-10-20', { rx: [rx('A1', '새 이름', 1), rx('D4', '도수', 4), rx('E5', '견인', 2), rx('F6', '초음파', 2)] }),
      day('2026-10-05', { rx: [rx('A1', '옛 이름', 3), rx('B2', '물리치료', 2), rx('C3', '주사', 1)] }),
      day(TODAY, { partial: true, rx: [rx('Z9', '오늘만', 50)] }),
      day('2026-09-01', { rx: [rx('Y8', '기간 밖', 40)] }),
    ]
    expect(topRx(days, MONTH)).toEqual([
      { name: '새 이름', value: 4 },
      { name: '도수', value: 4 },
      { name: '물리치료', value: 2 },
      { name: '견인', value: 2 },
      { name: '초음파', value: 2 },
    ])
  })

  it('AC-311.5: 기간 안 자료가 없으면 null, 처방이 없는 날만 있으면 빈 목록', () => {
    expect(topRx([day(TODAY, { rx: [rx('A1', '물리치료', 3)] })], MONTH)).toBeNull()
    expect(topRx([day('2026-10-10')], MONTH)).toEqual([])
  })
})

describe('groupRank — 처방 상위 = 통계 탭 묶음 (REQ-606)', () => {
  const MONTH = periodRange(TODAY, 30) // 2026-10-01 – 2026-10-30
  // 묶음 열쇠(treatment-trend groupKey 모양: 't' + 16진수 16자리)
  const key = (n: number) => `t${n.toString(16).padStart(16, '0')}`
  const line = (name: string, n: number): RxGroupLine => ({ name, key: key(n) })

  it('AC-606.1: 줄 이름은 묶음 이름, 값은 기간 안 그 열쇠 줄 patients의 합이다. 처방 코드별 줄(재진진찰료·약 이름)과 묶음에 없는 열쇠 줄은 나오지 않는다', () => {
    const days = [
      day('2026-10-05', { rx: [rx('AA254', '재진진찰료', 30), rx('643301234', '록소프로펜정', 25)], groups: [g(key(1), 3), g(key(2), 1), g(key(9), 80)] }),
      day('2026-10-20', { rx: [rx('MM042', '도수치료 30분', 9)], groups: [g(key(1), 4), g(key(2), 0), g(key(9), 70)] }),
      day(TODAY, { partial: true, groups: [g(key(1), 50), g(key(2), 50)] }),
      day('2026-09-01', { groups: [g(key(1), 40), g(key(2), 40)] }),
    ]
    const rank = groupRank(days, MONTH, [line('도수치료', 1), line('충격파', 2)])
    expect(rank).toEqual({ items: [{ name: '도수치료', value: 7 }, { name: '충격파', value: 1 }], stale: [] })
    for (const rxName of ['재진진찰료', '록소프로펜정', '도수치료 30분']) expect(rank!.items.map((item) => item.name)).not.toContain(rxName)
  })

  it('AC-606.1: 같은 날 줄이 둘이면 뒤의 것으로 센다(다른 기간별 흐름 칸과 같다)', () => {
    const days = [day('2026-10-10', { groups: [g(key(1), 100)] }), day('2026-10-11', { groups: [g(key(1), 2)] }), day('2026-10-10', { groups: [g(key(1), 5)] })]
    expect(groupRank(days, MONTH, [line('도수치료', 1)])).toEqual({ items: [{ name: '도수치료', value: 7 }], stale: [] })
  })

  it('AC-606.2: 건수 큰 차례, 같으면 받은 차례(통계 탭 sortOrder 차례)이고 많아야 5줄이다', () => {
    const lines = [line('견인', 1), line('충격파', 2), line('도수치료', 3), line('주사', 4), line('체외충격파', 5), line('운동치료', 6), line('초음파', 7)]
    const values = [2, 5, 2, 0, 7, 0, 1]
    const days = [day('2026-10-12', { groups: lines.map((l, i) => g(l.key, values[i]!)) })]
    expect(groupRank(days, MONTH, lines)).toEqual({
      items: [
        { name: '체외충격파', value: 7 },
        { name: '충격파', value: 5 },
        { name: '견인', value: 2 },
        { name: '도수치료', value: 2 },
        { name: '초음파', value: 1 },
      ],
      stale: [],
    })
  })

  it('AC-606.2: 같은 건수는 이름·열쇠 차례가 아니라 받은 차례다', () => {
    const lines = [line('충격파', 9), line('도수치료', 3), line('견인', 5)]
    const days = [day('2026-10-12', { groups: [g(key(3), 4), g(key(5), 4), g(key(9), 4)] })]
    expect(groupRank(days, MONTH, lines)!.items.map((item) => item.name)).toEqual(['충격파', '도수치료', '견인'])
  })

  it('AC-606.2: 0건인 묶음도 5줄 안에 들면 숨기지 않는다(열쇠 줄이 0명이어도 센 날이다)', () => {
    const lines = [line('견인', 1), line('도수치료', 2), line('충격파', 3)]
    const days = [day('2026-10-12', { groups: [g(key(1), 0), g(key(2), 3), g(key(3), 0)] }), day('2026-10-13', { groups: [g(key(1), 0), g(key(2), 1), g(key(3), 0)] })]
    expect(groupRank(days, MONTH, lines)).toEqual({
      items: [
        { name: '도수치료', value: 4 },
        { name: '견인', value: 0 },
        { name: '충격파', value: 0 },
      ],
      stale: [],
    })
  })

  it('AC-606.3: 기간 안 일 줄 가운데 하루라도 열쇠 줄이 없는 묶음은 세지 않고 stale(받은 차례)에 이름을 둔다. 기간 밖 날은 상관없다', () => {
    const lines = [line('충격파', 3), line('도수치료', 1), line('견인', 2)]
    const days = [
      day('2026-10-03', { groups: [g(key(1), 2), g(key(2), 5), g(key(3), 6)] }),
      day('2026-10-04', { groups: [g(key(1), 1), g(key(3), 6)] }), // 견인 열쇠 없음
      day('2026-10-05', { groups: [g(key(1), 3)] }), // 견인·충격파 열쇠 없음
      day('2026-09-01', { groups: [] }), // 기간 밖
      day(TODAY, { partial: true, groups: [] }), // 오늘은 기간 밖
    ]
    expect(groupRank(days, MONTH, lines)).toEqual({ items: [{ name: '도수치료', value: 6 }], stale: ['충격파', '견인'] })
  })

  it('AC-606.3: 셀 수 있는 묶음이 하나도 없으면 items는 비고 stale에 모든 이름이 있다(숫자를 지어내지 않는다)', () => {
    const lines = [line('도수치료', 1), line('충격파', 2)]
    const days = [day('2026-10-03', { rx: [rx('MM042', '도수치료 30분', 9)], groups: [g(key(1), 3)] }), day('2026-10-04', { rx: [rx('MM042', '도수치료 30분', 4)] })]
    expect(groupRank(days, MONTH, lines)).toEqual({ items: [], stale: ['도수치료', '충격파'] })
  })

  it('AC-606.3: 같은 날 줄이 둘이면 뒤의 줄로 열쇠를 본다(앞 줄에만 있는 열쇠는 없는 것이다)', () => {
    const days = [day('2026-10-10', { groups: [g(key(1), 5)] }), day('2026-10-10', { groups: [g(key(2), 5)] })]
    expect(groupRank(days, MONTH, [line('도수치료', 1), line('충격파', 2)])).toEqual({ items: [{ name: '충격파', value: 5 }], stale: ['도수치료'] })
  })

  it('AC-606.4: 묶음이 없으면 줄도 안내할 이름도 없다', () => {
    expect(groupRank([day('2026-10-10', { groups: [g(key(1), 5)] })], MONTH, [])).toEqual({ items: [], stale: [] })
  })

  it('AC-606.1: 기간 안 일 줄이 없으면 null(오늘 줄·기간 밖 줄만 있음 포함)', () => {
    const lines = [line('도수치료', 1)]
    expect(groupRank([], MONTH, lines)).toBeNull()
    expect(groupRank([day(TODAY, { groups: [g(key(1), 5)] }), day('2026-09-30', { groups: [g(key(1), 5)] })], MONTH, lines)).toBeNull()
    expect(groupRank([day(TODAY)], MONTH, [])).toBeNull()
  })

  it('AC-606.3: 셀 수 있음/다시 불러와야 함 판단이 treatment-trend keyedIn과 같다(같은 가짜 자료)', () => {
    const days = [
      day('2026-10-03', { groups: [g(key(1), 2), g(key(2), 0), g(key(3), 1), g(key(4), 1)] }),
      day('2026-10-04', { groups: [g(key(1), 1), g(key(2), 0), g(key(4), 1)] }),
      day('2026-10-04', { groups: [g(key(1), 1), g(key(2), 0), g(key(3), 4)] }), // 같은 날 뒤 줄: 4번 열쇠가 빠지고 3번이 생김
      day('2026-10-24', { groups: [g(key(1), 0), g(key(2), 3), g(key(3), 2)] }),
      day('2026-10-28', { groups: [g(key(1), 5), g(key(3), 2), g(key(4), 2)] }), // 2번 열쇠 없음
      day('2026-09-15', { groups: [] }), // 기간 밖
    ]
    const ranges = [MONTH, periodRange(TODAY, 7), { from: '2026-10-03', to: '2026-10-04', label: '' }, { from: '2026-10-24', to: '2026-10-24', label: '' }]
    const keys = [1, 2, 3, 4, 5].map(key)
    for (const range of ranges) {
      for (const k of keys) {
        const rank = groupRank(days, range, [{ name: '묶음', key: k }])
        expect(rank, `${range.from}–${range.to} ${k}`).not.toBeNull()
        expect(rank!.stale.length === 0, `${range.from}–${range.to} ${k}`).toBe(keyedIn(days, range, k))
      }
    }
    // 두 판단이 모두 참·거짓인 경우가 실제로 있다(한쪽으로만 맞는 시험이 아니다)
    expect(keys.map((k) => keyedIn(days, MONTH, k))).toEqual([true, false, true, false, false])
  })
})

describe('reportSentence — 원장님 보고 문장', () => {
  const closedToday = (newPatients: number, returning: number) => day(TODAY, { newPatients, returning })

  it('AC-317.1: 오늘 줄이 없으면 null', () => {
    expect(reportSentence(todayView(TODAY, [day(LAST_WEEK)]))).toBeNull()
  })

  it('AC-317.1: 덜 끝남 — "오늘 지금까지 환자 N명이 왔습니다." + "신환 N명, 재진 N명입니다."(숫자는 formatCount)', () => {
    const view = todayView(TODAY, [day(TODAY, { partial: true, newPatients: 120, returning: 1114 }), day(LAST_WEEK)])
    expect(reportSentence(view)).toEqual({
      first: '오늘 지금까지 환자 1,234명이 왔습니다.',
      rest: '신환 120명, 재진 1,114명입니다.',
      full: '오늘 지금까지 환자 1,234명이 왔습니다. 신환 120명, 재진 1,114명입니다.',
    })
  })

  it('AC-317.1: 끝남 + 지난주 비교 — 많음 · 적음 · 같음', () => {
    const more = reportSentence(todayView(TODAY, [closedToday(4, 9), day(LAST_WEEK, { newPatients: 2, returning: 8 })]))
    expect(more?.full).toBe('오늘 환자 13명이 왔습니다. 신환 4명, 재진 9명입니다. 지난주 토요일보다 3명 많습니다.')
    const fewer = reportSentence(todayView(TODAY, [closedToday(1, 6), day(LAST_WEEK, { newPatients: 2, returning: 8 })]))
    expect(fewer?.full).toBe('오늘 환자 7명이 왔습니다. 신환 1명, 재진 6명입니다. 지난주 토요일보다 3명 적습니다.')
    const same = reportSentence(todayView(TODAY, [closedToday(5, 5), day(LAST_WEEK, { newPatients: 2, returning: 8 })]))
    expect(same?.full).toBe('오늘 환자 10명이 왔습니다. 신환 5명, 재진 5명입니다. 지난주 토요일과 같습니다.')
  })

  it('AC-317.1: 지난주가 0명이면 차이는 오늘 환자 수만큼 많다', () => {
    const view = todayView(TODAY, [closedToday(1, 2), day(LAST_WEEK, { newPatients: 0, returning: 0 })])
    expect(reportSentence(view)?.rest).toBe('신환 1명, 재진 2명입니다. 지난주 토요일보다 3명 많습니다.')
  })

  it('AC-317.1: 끝남 + 지난주 자료 없음 → 비교 문장 없이 두 문장', () => {
    expect(reportSentence(todayView(TODAY, [closedToday(4, 9)]))).toEqual({
      first: '오늘 환자 13명이 왔습니다.',
      rest: '신환 4명, 재진 9명입니다.',
      full: '오늘 환자 13명이 왔습니다. 신환 4명, 재진 9명입니다.',
    })
  })

  it('AC-317.1: first는 처음 "다."까지, rest는 그 뒤(앞뒤 빈칸 없음), full은 둘을 빈칸 하나로 이은 글', () => {
    const s = reportSentence(todayView(TODAY, [closedToday(4, 9), day(LAST_WEEK, { newPatients: 2, returning: 8 })]))
    if (s === null) throw new Error('보고 문장이 없다')
    expect(s.first.endsWith('다.')).toBe(true)
    expect(s.first.indexOf('다.')).toBe(s.first.length - 2)
    expect(s.rest).toBe(s.rest.trim())
    expect(s.full).toBe(`${s.first} ${s.rest}`)
  })

  it('AC-317.1: 처방 이름·코드는 문장에 들지 않는다(totals만)', () => {
    const today = day(TODAY, { newPatients: 4, returning: 9, rx: [rx('MM042', '홍길동 처방', 13)] })
    const s = reportSentence(todayView(TODAY, [today, day(LAST_WEEK)]))
    expect(s?.full).not.toContain('홍길동')
    expect(s?.full).not.toContain('MM042')
  })
})

// 날짜 고르기 (bit-dashboard REQ-605, design.md '### 날짜 고르기'): 지난 날짜도 todayView를 그대로 쓰고 문장의 "오늘"만 dayLabel로 바꾼다
describe('reportSentence — 지난 날짜', () => {
  const SATURDAY = '2026-10-31'
  const WEEK_BEFORE = '2026-10-24'
  const LABEL = '10월 31일'

  it('AC-605.2: "{월}월 {일}일 환자 N명이 왔습니다."로 시작하고 "오늘" 글자가 없다. 7일 전 자료가 있으면 "지난주 X요일보다 …"가 붙는다', () => {
    const days = [day(SATURDAY, { newPatients: 4, returning: 9 }), day(WEEK_BEFORE)]
    expect(reportSentence(todayView(SATURDAY, days), LABEL)).toEqual({
      first: '10월 31일 환자 13명이 왔습니다.',
      rest: '신환 4명, 재진 9명입니다. 지난주 토요일보다 3명 많습니다.',
      full: '10월 31일 환자 13명이 왔습니다. 신환 4명, 재진 9명입니다. 지난주 토요일보다 3명 많습니다.',
    })
  })

  it('AC-605.2: 7일 전보다 적거나 같으면 그대로 말한다', () => {
    const fewer = [day(SATURDAY, { newPatients: 1, returning: 2 }), day(WEEK_BEFORE)]
    expect(reportSentence(todayView(SATURDAY, fewer), LABEL)?.rest).toBe('신환 1명, 재진 2명입니다. 지난주 토요일보다 7명 적습니다.')
    const same = [day(SATURDAY), day(WEEK_BEFORE)]
    expect(reportSentence(todayView(SATURDAY, same), LABEL)?.rest).toBe('신환 2명, 재진 8명입니다. 지난주 토요일과 같습니다.')
  })

  it('AC-605.2: 7일 전 자료가 없으면 비교 문장이 없다', () => {
    const s = reportSentence(todayView(SATURDAY, [day(SATURDAY)]), LABEL)
    expect(s?.full).toBe('10월 31일 환자 10명이 왔습니다. 신환 2명, 재진 8명입니다.')
  })

  it('AC-605.9: 그날 줄이 partial: true면 "{월}월 {일}일 환자 N명까지 확인됐어요." + "그날 자료가 중간까지만 저장돼 있어요."이고 full은 두 줄을 빈칸 하나로 이은 글', () => {
    const days = [day(SATURDAY, { partial: true, newPatients: 120, returning: 1114 }), day(WEEK_BEFORE)]
    expect(reportSentence(todayView(SATURDAY, days), LABEL)).toEqual({
      first: '10월 31일 환자 1,234명까지 확인됐어요.',
      rest: '그날 자료가 중간까지만 저장돼 있어요.',
      full: '10월 31일 환자 1,234명까지 확인됐어요. 그날 자료가 중간까지만 저장돼 있어요.',
    })
  })

  it('AC-605.9: 덜 끝난 지난 날은 신환·재진 문장과 지난주 비교가 붙지 않고 "오늘" 글자가 없다', () => {
    const s = reportSentence(todayView(SATURDAY, [day(SATURDAY, { partial: true }), day(WEEK_BEFORE, { newPatients: 0, returning: 1 })]), LABEL)
    if (s === null) throw new Error('보고 문장이 없다')
    expect(s.full).not.toContain('신환')
    expect(s.full).not.toContain('재진')
    expect(s.full).not.toContain('지난주')
    expect(s.full).not.toContain('오늘')
  })

  it('AC-605.9: 오늘의 partial: true와 partial: false인 날은 지금 그대로다', () => {
    const openToday = reportSentence(todayView(SATURDAY, [day(SATURDAY, { partial: true }), day(WEEK_BEFORE)]))
    expect(openToday?.full).toBe('오늘 지금까지 환자 10명이 왔습니다. 신환 2명, 재진 8명입니다.')
    const closedPast = reportSentence(todayView(SATURDAY, [day(SATURDAY), day(WEEK_BEFORE)]), LABEL)
    expect(closedPast?.full).toBe('10월 31일 환자 10명이 왔습니다. 신환 2명, 재진 8명입니다. 지난주 토요일과 같습니다.')
  })

  it('AC-605.4: 그 날 줄이 없으면 문장이 없다', () => {
    expect(reportSentence(todayView(SATURDAY, [day(WEEK_BEFORE)]), LABEL)).toBeNull()
  })

  it('AC-605.2: dayLabel이 없으면 지금처럼 "오늘"로 시작한다', () => {
    const closed = reportSentence(todayView(SATURDAY, [day(SATURDAY)]))
    expect(closed?.first).toBe('오늘 환자 10명이 왔습니다.')
    const open = reportSentence(todayView(SATURDAY, [day(SATURDAY, { partial: true })]))
    expect(open?.first).toBe('오늘 지금까지 환자 10명이 왔습니다.')
  })

  it('AC-605.2: longDate는 앞 0 없이 "{월}월 {일}일"이다', () => {
    expect(longDate('2026-10-05')).toBe('10월 5일')
    expect(longDate('2027-01-31')).toBe('1월 31일')
  })
})

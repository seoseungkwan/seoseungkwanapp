import { describe, expect, it } from 'vitest'
import { compareNumbers } from '@/lib/analytics/compare'
import { addDays } from '@/lib/analytics/dates'
import type { DayPayload, RevisitPayload } from '@/types/payload'
import {
  DEFAULT_PERIOD,
  PERIODS,
  periodRange,
  reportSentence,
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

type DayOptions = { partial?: boolean; newPatients?: number; returning?: number; rx?: Rx[]; revisit?: RevisitPayload }
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
    groups: [],
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

  it('AC-311.5: Σwithin ÷ Σcohort, 그 값이 null인 날은 분자·분모 모두에서 뺀다(7일·14일 따로)', () => {
    const days = [
      day('2026-10-10', { revisit: { cohort: 4, within7: 1, within14: 2 } }),
      day('2026-10-20', { revisit: { cohort: 6, within7: 3, within14: null } }),
      day('2026-10-29', { revisit: { cohort: 10, within7: null, within14: null } }),
    ]
    expect(revisitView(days, MONTH)).toEqual({ d7: { kind: 'rate', value: 4 / 10 }, d14: { kind: 'rate', value: 2 / 4 } })
  })

  it('AC-311.5: 모든 날이 null이면 집계 중(in-progress)', () => {
    const days = [day('2026-10-28', { revisit: { cohort: 3, within7: null, within14: null } })]
    expect(revisitView(days, MONTH)).toEqual({ d7: { kind: 'in-progress' }, d14: { kind: 'in-progress' } })
  })

  it('AC-311.5: 남은 분모가 0이면 자료 없음(none), 기간 안 날이 없어도 none', () => {
    const days = [day('2026-10-28', { newPatients: 0, revisit: { cohort: 0, within7: 0, within14: 0 } })]
    expect(revisitView(days, MONTH)).toEqual({ d7: { kind: 'none' }, d14: { kind: 'none' } })
    expect(revisitView([], MONTH)).toEqual({ d7: { kind: 'none' }, d14: { kind: 'none' } })
  })

  it('AC-311.6: 기간 밖 날(오늘·기간 앞)은 셈에 들지 않는다', () => {
    const days = [
      day('2026-10-15', { revisit: { cohort: 5, within7: 1, within14: 1 } }),
      day(TODAY, { revisit: { cohort: 100, within7: 100, within14: 100 } }),
      day('2026-09-01', { revisit: { cohort: 100, within7: 0, within14: 0 } }),
    ]
    expect(revisitView(days, MONTH)).toEqual({ d7: { kind: 'rate', value: 1 / 5 }, d14: { kind: 'rate', value: 1 / 5 } })
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

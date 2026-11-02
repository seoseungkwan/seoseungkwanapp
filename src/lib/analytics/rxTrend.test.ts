import { describe, expect, it } from 'vitest'
import type { DateRange } from '@/types/dates'
import type { DayPayload } from '@/types/payload'
import { compareNumbers } from './compare'
import { addDays } from './dates'
import { buildTrend, comparisonLabel, comparisonRange, trendChange } from './rxTrend'
import type { TrendPoint } from './rxTrend'

// 원본 vendor/drbit_export/TrendTests.cs의 사례를 옮겼다(모두 가짜 자료). 시험 이름 끝의 '원본:'이 원본 확인 글이다.
// 원본과 다르게 한 것은 여기에만 적는다
const knownDiffs = [
  {
    original: "'코드별 소모량 독립 대조'·'단위가 다른 소모량 합산 방지'·'기간 중 단위가 변경된 코드의 부정확한 합산 방지', 금액 합계",
    reason: '금액·소모량은 저장 모양에 없다 — 매출 탭 몫. quantity·amount는 늘 null이고 단위 검사도 없다',
  },
  {
    original: "TrendChange.RateLabel 글자('신규 (비교값 0)' 등)",
    reason: '원본 글자 대신 앱의 증감 글자를 쓴다(compareNumbers가 낸 Delta를 화면의 formatDelta가 글자로 바꾼다)',
  },
  {
    original: "'음수 기준 증감률 미산출'(이전 음수 → 비율 없음)",
    reason:
      'compareNumbers는 이전이 음수여도 pct를 낸다(5, -2 → -350). compare.ts는 이 TASK 범위 밖이라 trendChange가 compareNumbers 위에서 pct만 null로 둔다. 이 앱의 건수는 음수가 없어 이 경우는 원본 시험에서만 나온다',
  },
  {
    original: "'누락 날짜 0 보간' — 조회에 성공한 뒤 기록이 없는 날은 모두 0",
    reason: '원본은 읽은 기간 전체가 자료라 늘 0이다. 우리는 덮은 기간 안의 줄 없는 날만 0(휴진)이고, 덮은 기간 밖의 날은 더하지 않고 그 칸을 일부 기간으로 둔다',
  },
  {
    original: '건수 = 처방 상세 행 수',
    reason: '저장 모양에 행 수가 없어 그날 그 처방 환자 수(patients)의 합을 건으로 쓴다',
  },
  {
    original: "'월별 외래 신환은 그 달(조회 기간 안) 첫 내원 환자의 처방'(6건)·'신환 일별 상세가 같은 기준으로 합쳐짐'(11건)·'첫 내원일 없는 신환·재진 집계 차단'",
    reason: '저장 모양에 첫 내원일이 없다. 주·달 칸의 신환·재진은 그날 newPatients·returning의 합이다(AC-508.3, 같은 사례의 달 칸 신환은 2건)',
  },
  {
    original: "'미등록 코드 차단'",
    reason: '입력에 등록 처방코드 목록이 없다. 줄이 없는 코드는 건수 0인 점이 된다',
  },
  {
    original: 'TrendPatientScope(전체·외래·입원·신환·재진 고르기), Summaries·DailyFacts·공통 안내 글, 비교 기준 값 검사',
    reason: '저장 모양에 외래·입원 구분이 없고, 처방 하나의 건수·신환·재진을 점마다 함께 낸다. 비교 기간 점은 comparisonRange 뒤에 buildTrend를 한 번 더 부른다. 비교 기준 값은 타입이 막는다',
  },
  {
    original: "'추세 HTML 보고서 생성'·'편집 가능한 Excel 차트 포함'·'추세 화면 렌더링'",
    reason: '셈만 옮긴다. 화면은 통계 탭 몫이고 HTML·Excel 보고서는 만들지 않는다',
  },
]

const A = '00123'
const B = '00456'

const r = (from: string, to: string): DateRange => ({ from, to })

// 신환·재진을 주지 않으면 신환 0, 나머지는 재진
const rx = (code: string, patients: number, newPatients = 0, returning = patients - newPatients): DayPayload['rx'][number] => ({
  code,
  name: `가짜 ${code}`,
  type: '가짜',
  patients,
  newPatients,
  returning,
})

const dayRow = (day: string, lines: DayPayload['rx'], partial = false): DayPayload => ({
  schemaVersion: 2,
  quality: 'valid',
  day,
  partial,
  totals: { patients: 0, newPatients: 0, returning: 0, unknown: 0 },
  rx: lines,
  groups: [],
  revisit: { cohort: 0, within7: null, within14: null },
})

// 원본 Facts()와 같은 숫자(11월 1일은 기간 밖이라 어디에도 더해지지 않아야 한다)
const FACTS = [
  dayRow('2026-09-24', [rx(A, 1)]),
  dayRow('2026-09-30', [rx(A, 1)]),
  dayRow('2026-10-01', [rx(A, 2)]),
  dayRow('2026-10-02', [rx(B, 4)]),
  dayRow('2026-10-07', [rx(A, 1)]),
  dayRow('2026-11-01', [rx(A, 100)]),
]

// 원본은 읽은 기간 전체가 자료다
const ALL_READ = [r('2026-08-01', '2026-11-30')]

// 원본 Request(): 10월 1일(목) ~ 7일(수), 일별, 코드 둘
const REQUEST = { from: '2026-10-01', to: '2026-10-07', bucket: 'day' as const, codes: [A, B] }

function pointAt(points: TrendPoint[], code: string, start: string): TrendPoint {
  const point = points.find((p) => p.code === code && p.start === start)
  if (point === undefined) throw new Error(`점이 없어요: ${code} ${start}`)
  return point
}

const sumOf = (totals: Map<string, number>) => [...totals.values()].reduce((sum, n) => sum + n, 0)

describe('AC-508.1 buildTrend — 칸 점과 건수', () => {
  it('AC-508.1 칸마다 코드 순서대로 시작·끝·이름·일부 기간 여부·건수를 낸다', () => {
    const { points } = buildTrend(FACTS, ALL_READ, { ...REQUEST, to: '2026-10-02' })
    expect(points.map((p) => [p.code, p.start, p.end, p.label, p.partial, p.count])).toEqual([
      [A, '2026-10-01', '2026-10-01', '2026-10-01', false, 2],
      [B, '2026-10-01', '2026-10-01', '2026-10-01', false, 0],
      [A, '2026-10-02', '2026-10-02', '2026-10-02', false, 0],
      [B, '2026-10-02', '2026-10-02', '2026-10-02', false, 4],
    ])
  })

  it('AC-508.1 원본: 누락 날짜 0 보간과 코드 분리', () => {
    const { points } = buildTrend(FACTS, ALL_READ, REQUEST)
    expect(points).toHaveLength(14)
    expect(pointAt(points, A, '2026-10-03').count).toBe(0)
    expect(pointAt(points, A, '2026-10-02').count).toBe(0) // 그날 B만 있다
    expect(pointAt(points, B, '2026-10-02').count).toBe(4)
  })

  it('AC-508.1 원본: 부분 주 표시 및 월요일 경계', () => {
    const { points } = buildTrend(FACTS, ALL_READ, { ...REQUEST, bucket: 'week' })
    expect(points).toHaveLength(4)
    expect(points.every((p) => p.partial)).toBe(true)
    expect(points[0].start).toBe('2026-10-01')
    expect(pointAt(points, A, '2026-10-01')).toMatchObject({ end: '2026-10-04', label: '10-01 ~ 10-04 (일부 기간)', count: 2 })
    expect(pointAt(points, B, '2026-10-01')).toMatchObject({ end: '2026-10-04', count: 4 })
    expect(pointAt(points, A, '2026-10-05')).toMatchObject({ end: '2026-10-07', label: '10-05 ~ 10-07 (일부 기간)', count: 1 })
  })

  it('AC-508.1 주는 월요일 ~ 일요일 — 일요일과 월요일은 다른 칸', () => {
    const { points } = buildTrend([], ALL_READ, { from: '2026-10-04', to: '2026-10-05', bucket: 'week', codes: [A] })
    expect(points.map((p) => [p.start, p.end])).toEqual([
      ['2026-10-04', '2026-10-04'],
      ['2026-10-05', '2026-10-05'],
    ])
  })

  it('AC-508.1 원본: 서로 다른 월 버킷 수 보존', () => {
    const req = { from: '2026-10-01', to: '2026-10-31', bucket: 'month' as const, codes: [A, B] }
    const current = buildTrend(FACTS, ALL_READ, req).points
    const { from, to } = comparisonRange(req.from, req.to, 'PreviousEqualDays')
    const previous = buildTrend(FACTS, ALL_READ, { ...req, from, to }).points
    expect(current).toHaveLength(2)
    expect(previous).toHaveLength(4)
    expect(current.some((p) => p.partial)).toBe(false)
    expect(pointAt(current, A, '2026-10-01')).toMatchObject({ end: '2026-10-31', label: '2026-10', count: 3 })
    expect(pointAt(previous, A, '2026-08-31')).toMatchObject({ end: '2026-08-31', label: '2026-08 (일부 기간)', partial: true, count: 0 })
    expect(pointAt(previous, A, '2026-09-01')).toMatchObject({ end: '2026-09-30', label: '2026-09', partial: false, count: 2 })
  })

  it('AC-508.1 기간 밖의 줄은 더하지 않고, 처방마다 합을 totals로 준다', () => {
    const { totals } = buildTrend(FACTS, ALL_READ, REQUEST)
    expect([...totals]).toEqual([
      [A, 3],
      [B, 4],
    ])
  })

  it('AC-508.1 줄이 하나도 없는 코드도 점과 0인 합이 있다', () => {
    const { points, totals } = buildTrend(FACTS, ALL_READ, { ...REQUEST, codes: ['ZZZ'] })
    expect(points).toHaveLength(7)
    expect(points.every((p) => p.count === 0 && !p.partial)).toBe(true)
    expect(totals.get('ZZZ')).toBe(0)
  })

  it('AC-508.1 덮은 기간 안의 휴진·일요일은 0인 날이고 칸을 일부 기간으로 만들지 않는다', () => {
    const monToSat = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10'].map((day) => dayRow(day, [rx(A, 2)]))
    const week = buildTrend(monToSat, [r('2026-10-05', '2026-10-11')], { from: '2026-10-05', to: '2026-10-11', bucket: 'week', codes: [A] })
    expect(week.points).toHaveLength(1)
    expect(week.points[0]).toMatchObject({ label: '10-05 ~ 10-11', partial: false, count: 12 })

    const month = buildTrend(monToSat, [r('2026-10-01', '2026-10-31')], { from: '2026-10-01', to: '2026-10-31', bucket: 'month', codes: [A] })
    expect(month.points[0]).toMatchObject({ label: '2026-10', partial: false, count: 12 })

    const sunday = buildTrend(monToSat, [r('2026-10-05', '2026-10-11')], { from: '2026-10-11', to: '2026-10-11', bucket: 'day', codes: [A] })
    expect(sunday.points[0]).toMatchObject({ partial: false, count: 0 })
  })

  it('AC-508.1 덮은 기간 끝이 어제이고 오늘 줄이 없음 → 오늘은 0인 날이 아니라 덮은 기간 밖(그 칸 일부 기간)이다', () => {
    const rows = [dayRow('2026-10-05', [rx(A, 3)]), dayRow('2026-10-06', [rx(A, 2)])]
    const covered = [r('2026-10-05', '2026-10-07')]
    const daily = buildTrend(rows, covered, { from: '2026-10-07', to: '2026-10-08', bucket: 'day', codes: [A] }).points
    expect(pointAt(daily, A, '2026-10-07')).toMatchObject({ label: '2026-10-07', partial: false, count: 0 }) // 어제: 덮었고 줄 없음 = 휴진
    expect(pointAt(daily, A, '2026-10-08')).toMatchObject({ label: '2026-10-08 (일부 기간)', partial: true, count: 0 }) // 오늘

    const weekly = buildTrend(rows, covered, { from: '2026-10-05', to: '2026-10-11', bucket: 'week', codes: [A] }).points
    expect(weekly[0]).toMatchObject({ label: '10-05 ~ 10-11 (일부 기간)', partial: true, count: 5 })
  })

  it('AC-508.1 덮은 기간 밖의 날은 줄이 있어도 더하지 않는다(파일 사이 공백도 같다)', () => {
    const rows = [dayRow('2026-10-03', [rx(A, 1)]), dayRow('2026-10-04', [rx(A, 9)]), dayRow('2026-10-06', [rx(A, 2)])]
    const covered = [r('2026-10-01', '2026-10-03'), r('2026-10-06', '2026-10-31')]
    const { points, totals } = buildTrend(rows, covered, { from: '2026-10-01', to: '2026-10-31', bucket: 'month', codes: [A] })
    expect(points[0]).toMatchObject({ label: '2026-10 (일부 기간)', partial: true, count: 3 })
    expect(totals.get(A)).toBe(3)
  })

  it('AC-508.1 덮은 기간이 없으면 모든 칸이 일부 기간이고 건수를 더하지 않는다', () => {
    const { points, totals } = buildTrend(FACTS, [], REQUEST)
    expect(points.every((p) => p.partial && p.count === 0)).toBe(true)
    expect(sumOf(totals)).toBe(0)
  })

  it('AC-508.1 아직 끝나지 않은 날(오늘 partial 줄)이 든 칸은 그 처방이 없어도 일부 기간이고, 덮은 날이면 건수는 더한다', () => {
    const october = [r('2026-10-01', '2026-10-31')]
    const req = { from: '2026-10-01', to: '2026-10-31', bucket: 'month' as const, codes: [A, B] }

    const finished = buildTrend([dayRow('2026-10-08', [rx(A, 3)], false)], october, req).points
    expect(finished.every((p) => !p.partial)).toBe(true)

    const unfinished = buildTrend([dayRow('2026-10-08', [rx(A, 3)], true)], october, req).points
    expect(pointAt(unfinished, A, '2026-10-01')).toMatchObject({ label: '2026-10 (일부 기간)', partial: true, count: 3 })
    expect(pointAt(unfinished, B, '2026-10-01')).toMatchObject({ partial: true, count: 0 })
  })

  it('AC-508.1 오늘 partial 줄이 덮은 기간 밖이면 더하지 않는다', () => {
    const rows = [dayRow('2026-10-08', [rx(A, 3)], true)]
    const { points } = buildTrend(rows, [r('2026-10-01', '2026-10-07')], { from: '2026-10-08', to: '2026-10-08', bucket: 'day', codes: [A] })
    expect(points[0]).toMatchObject({ partial: true, count: 0 })
  })

  it('AC-508.1 코드는 원본처럼 대소문자를 가리지 않고 합치며, 점의 코드는 처음 고른 글자다', () => {
    const rows = [dayRow('2026-10-01', [rx('AB1', 2), rx('ab1', 3)])]
    const { points, totals } = buildTrend(rows, ALL_READ, { from: '2026-10-01', to: '2026-10-01', bucket: 'day', codes: ['ab1', 'AB1'] })
    expect(points).toHaveLength(1)
    expect(points[0]).toMatchObject({ code: 'ab1', count: 5 })
    expect([...totals]).toEqual([['ab1', 5]])
  })

  it('AC-508.1 원본 Validate: 코드 없음·200개 넘음·끝이 시작보다 앞·연도 범위·10년 넘음을 막는다', () => {
    const codes = Array.from({ length: 200 }, (_, i) => `C${i}`)
    const single = { ...REQUEST, codes: [A] }
    expect(() => buildTrend(FACTS, ALL_READ, { ...REQUEST, codes: [] })).toThrow('등록된 처방코드를 선택해 주세요.')
    expect(() => buildTrend(FACTS, ALL_READ, { ...REQUEST, to: '2026-10-01', codes })).not.toThrow()
    expect(() => buildTrend(FACTS, ALL_READ, { ...REQUEST, codes: [...codes, 'C200'] })).toThrow('한 번에 최대 200개 처방코드를 선택할 수 있습니다.')
    expect(() => buildTrend(FACTS, ALL_READ, { ...single, from: '2026-10-02', to: '2026-10-01' })).toThrow('종료일은 시작일보다 빠를 수 없습니다.')
    expect(() => buildTrend(FACTS, ALL_READ, { ...single, from: '1901-12-31' })).toThrow('분석 가능한 연도는 1902~9997년입니다.')
    expect(() => buildTrend(FACTS, ALL_READ, { ...single, from: '9998-01-01', to: '9998-01-02' })).toThrow('분석 가능한 연도는 1902~9997년입니다.')
    const from = '2016-01-01'
    expect(() => buildTrend([], [], { ...single, bucket: 'month', from, to: addDays(from, 3660) })).not.toThrow()
    expect(() => buildTrend([], [], { ...single, bucket: 'month', from, to: addDays(from, 3661) })).toThrow('한 번에 최대 10년 범위로 분석할 수 있습니다.')
  })
})

describe('AC-508.2 comparisonRange·comparisonLabel — 원본과 같은 기간·이름', () => {
  it('AC-508.2 원본: 직전 동일일수 비교 범위', () => {
    const range = comparisonRange('2026-10-01', '2026-10-07', 'PreviousEqualDays')
    expect(range).toMatchObject({ from: '2026-09-24', to: '2026-09-30' })
    expect(range.notes).toEqual(['비교 기간은 시작일 직전의 동일 일수입니다. 전월과 동일한 의미가 아닙니다.'])
  })

  it('AC-508.2 원본: 윤년 비교 일수 차이 표시', () => {
    const range = comparisonRange('2024-02-28', '2024-03-01', 'PreviousYear')
    expect(range).toMatchObject({ from: '2023-02-28', to: '2023-03-01' })
    expect(range.notes.some((note) => note.startsWith('윤년'))).toBe(true)
  })

  it('AC-508.2 윤년 2월 29일은 전년 2월 28일로 대응되고, 일수가 같으면 윤년 안내가 없다', () => {
    const leapDay = comparisonRange('2024-02-29', '2024-02-29', 'PreviousYear')
    expect(leapDay).toMatchObject({ from: '2023-02-28', to: '2023-02-28' })
    expect(leapDay.notes).toEqual(['비교 기간은 전년 같은 날짜 범위입니다. 2월 29일은 전년 2월 28일로 대응됩니다.'])

    const february = comparisonRange('2024-02-01', '2024-02-29', 'PreviousYear')
    expect(february).toMatchObject({ from: '2023-02-01', to: '2023-02-28' })
    expect(february.notes).toContain('윤년 차이로 현재 기간과 비교 기간의 일수가 다릅니다. 합계와 기간 일수를 함께 확인해 주세요.')
  })

  it('AC-508.2 전월 비교는 같은 날짜를 한 달 앞으로 옮기고, 없는 날짜는 전월 말일로 맞춘다', () => {
    const range = comparisonRange('2026-10-05', '2026-10-10', 'PreviousMonth')
    expect(range).toMatchObject({ from: '2026-09-05', to: '2026-09-10' })
    expect(range.notes).toEqual([
      '전월 비교는 같은 날짜 범위를 한 달 전으로 옮깁니다. 없는 날짜는 전월 말일로 맞추고, 전체 월 선택은 전월 전체와 비교합니다. 여러 달 범위는 지원하지 않습니다.',
      '월 길이 차이는 합계와 달력일 평균을 함께 확인하세요. 달력일 평균은 휴진일을 포함하며 진료일 평균이 아닙니다.',
    ])
    expect(comparisonRange('2026-03-29', '2026-03-31', 'PreviousMonth')).toMatchObject({ from: '2026-02-28', to: '2026-02-28' })
    expect(comparisonRange('2026-01-10', '2026-01-20', 'PreviousMonth')).toMatchObject({ from: '2025-12-10', to: '2025-12-20' })
  })

  it('AC-508.2 전체 월을 고르면 전월 전체와 비교한다', () => {
    expect(comparisonRange('2026-02-01', '2026-02-28', 'PreviousMonth')).toMatchObject({ from: '2026-01-01', to: '2026-01-31' })
    expect(comparisonRange('2026-03-01', '2026-03-31', 'PreviousMonth')).toMatchObject({ from: '2026-02-01', to: '2026-02-28' })
  })

  it('AC-508.2 원본 ValidateDates: 잘못된 기간은 막는다', () => {
    expect(() => comparisonRange('2026-10-02', '2026-10-01', 'PreviousEqualDays')).toThrow('종료일은 시작일보다 빠를 수 없습니다.')
    expect(() => comparisonRange('2026-09-30', '2026-10-01', 'PreviousMonth')).toThrow('전월 비교는 한 달 안의 조회 기간을 선택해 주세요.')
    expect(() => comparisonRange('2025-09-01', '2026-09-30', 'PreviousMonth')).toThrow('전월 비교는 한 달 안의 조회 기간을 선택해 주세요.')
    expect(() => comparisonRange('2025-10-01', '2026-10-01', 'PreviousYear')).toThrow('전년 같은 기간 비교는 분석 기간을 1년 이내로 선택해 주세요.')
    expect(comparisonRange('2025-10-01', '2026-09-30', 'PreviousYear')).toMatchObject({ from: '2024-10-01', to: '2025-09-30' })
    expect(() => comparisonRange('1901-12-31', '1902-01-01', 'PreviousEqualDays')).toThrow('분석 가능한 연도는 1902~9997년입니다.')
    expect(() => comparisonRange('2016-01-01', addDays('2016-01-01', 3661), 'PreviousEqualDays')).toThrow('한 번에 최대 10년 범위로 분석할 수 있습니다.')
  })

  it('AC-508.2 비교 이름이 원본과 같다', () => {
    expect(comparisonLabel('PreviousEqualDays')).toBe('시작일 직전 동일 일수')
    expect(comparisonLabel('PreviousMonth')).toBe('전월 같은 날짜 / 전체 월')
    expect(comparisonLabel('PreviousYear')).toBe('전년 같은 날짜 범위')
  })
})

describe('AC-508.3 신환·재진 나눔', () => {
  // 원본 VisitScopeChecks의 줄: 10월 1일 첫 내원 2·예전 환자 3, 10월 6일 같은 달 앞서 온 환자 4, 9월 27일 첫 내원 5·전에 온 환자 6.
  // 일 저장 모양은 그날 첫 내원이 신환이다
  const VISITS = [
    dayRow('2026-09-27', [rx(A, 11, 5, 6)]),
    dayRow('2026-10-01', [rx(A, 5, 2, 3)]),
    dayRow('2026-10-06', [rx(A, 4, 0, 4)]),
  ]
  const req = { from: '2026-10-01', to: '2026-10-07', bucket: 'day' as const, codes: [A] }
  const sum = (points: TrendPoint[], key: 'newCount' | 'returningCount') => points.reduce((total, p) => total + p[key], 0)

  it('AC-508.3 원본: 일별 외래 신환은 그날 첫 내원만', () => {
    const { from, to } = comparisonRange(req.from, req.to, 'PreviousEqualDays')
    expect(sum(buildTrend(VISITS, ALL_READ, req).points, 'newCount')).toBe(2)
    expect(sum(buildTrend(VISITS, ALL_READ, { ...req, from, to }).points, 'newCount')).toBe(5)
  })

  it('AC-508.3 원본: 일별 외래 재진은 나머지', () => {
    const { from, to } = comparisonRange(req.from, req.to, 'PreviousEqualDays')
    expect(sum(buildTrend(VISITS, ALL_READ, req).points, 'returningCount')).toBe(7)
    expect(sum(buildTrend(VISITS, ALL_READ, { ...req, from, to }).points, 'returningCount')).toBe(6)
  })

  it('AC-508.3 칸마다 신환 = newPatients 합, 재진 = returning 합이다(주·달 칸도 날의 합)', () => {
    const weekly = buildTrend(VISITS, ALL_READ, { ...req, bucket: 'week' }).points
    expect(pointAt(weekly, A, '2026-10-01')).toMatchObject({ count: 5, newCount: 2, returningCount: 3 })
    expect(pointAt(weekly, A, '2026-10-05')).toMatchObject({ count: 4, newCount: 0, returningCount: 4 })

    const monthly = buildTrend(VISITS, ALL_READ, { from: '2026-10-01', to: '2026-10-31', bucket: 'month', codes: [A] }).points
    expect(monthly[0]).toMatchObject({ count: 9, newCount: 2, returningCount: 7 })
  })

  it('AC-508.3 신환·재진을 알 수 없는 환자가 있으면 신환 + 재진 < 건수다', () => {
    const rows = [dayRow('2026-10-01', [rx(A, 5, 2, 2)]), dayRow('2026-10-02', [rx(A, 3, 1, 1)])]
    const [point] = buildTrend(rows, ALL_READ, { from: '2026-10-01', to: '2026-10-02', bucket: 'week', codes: [A] }).points
    expect(point).toMatchObject({ count: 8, newCount: 3, returningCount: 3 })
    expect(point.newCount + point.returningCount).toBeLessThanOrEqual(point.count)
  })

  it('AC-508.3 덮은 기간 밖 날의 신환·재진도 더하지 않는다', () => {
    const [point] = buildTrend(VISITS, [r('2026-10-02', '2026-10-31')], { from: '2026-10-01', to: '2026-10-31', bucket: 'month', codes: [A] }).points
    expect(point).toMatchObject({ partial: true, count: 4, newCount: 0, returningCount: 4 })
  })
})

describe('AC-508.4 소모량·금액은 자료 없음', () => {
  it('AC-508.4 건수가 있는 점도 0인 점도 일부 기간 점도 소모량·금액은 늘 null이다', () => {
    const covered = [r('2026-10-01', '2026-10-03')]
    const { points } = buildTrend(FACTS, covered, REQUEST)
    expect(points.some((p) => p.count > 0)).toBe(true)
    expect(points.some((p) => p.count === 0 && !p.partial)).toBe(true)
    expect(points.some((p) => p.partial)).toBe(true)
    for (const point of points) {
      expect(point.quantity).toBeNull()
      expect(point.amount).toBeNull()
    }
  })

  it('AC-508.4 원본의 소모량·금액·단위 사례는 knownDiffs에 이유와 함께 적었다', () => {
    const entry = knownDiffs.find((diff) => diff.original.includes('소모량'))
    expect(entry?.original).toContain('단위')
    expect(entry?.reason).toContain('금액·소모량은 저장 모양에 없다 — 매출 탭 몫')
  })
})

describe('AC-508.5 증감은 compareNumbers 규칙', () => {
  it('AC-508.5 원본: 현재·이전 건수와 증감률 독립 대조(7건 vs 2건 → +250%)', () => {
    const current = sumOf(buildTrend(FACTS, ALL_READ, REQUEST).totals)
    const { from, to } = comparisonRange(REQUEST.from, REQUEST.to, 'PreviousEqualDays')
    const previous = sumOf(buildTrend(FACTS, ALL_READ, { ...REQUEST, from, to }).totals)
    expect(current).toBe(7)
    expect(previous).toBe(2)
    expect(trendChange(current, previous)).toEqual({ kind: 'change', diff: 5, pct: 250 })
  })

  it('AC-508.5 원본: 0 기준 증감률 미산출(이전 0 → 비율 없음·신규)', () => {
    expect(trendChange(5, 0)).toEqual({ kind: 'new' })
    expect(trendChange(0, 0)).toEqual({ kind: 'change', diff: 0, pct: null })
  })

  it('AC-508.5 원본: 음수 기준 증감률 미산출(이전 음수 → 비율 없음)', () => {
    expect(trendChange(5, -2)).toEqual({ kind: 'change', diff: 7, pct: null })
  })

  it('AC-508.5 원본: 감소율 부호 검증(100 → 75는 −25%)', () => {
    expect(trendChange(75, 100)).toEqual({ kind: 'change', diff: -25, pct: -25 })
  })

  it('AC-508.5 이전이 음수가 아니면 compareNumbers와 똑같다', () => {
    const cases = [[7, 2], [5, 0], [0, 0], [0, 4], [75, 100], [3, 3]]
    for (const [current, previous] of cases) {
      expect(trendChange(current, previous)).toEqual(compareNumbers(current, previous))
    }
  })

  it('AC-508.5 RateLabel 글자와 음수 기준을 다르게 한 까닭은 knownDiffs에 적었다', () => {
    expect(knownDiffs.some((diff) => diff.original.includes('RateLabel') && diff.reason.includes('formatDelta'))).toBe(true)
    expect(knownDiffs.some((diff) => diff.original.includes('음수') && diff.reason.includes('compareNumbers'))).toBe(true)
  })
})

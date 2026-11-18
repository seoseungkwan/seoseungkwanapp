import { describe, expect, it } from 'vitest'
import type { DayPayload } from '@/types/payload'
import { eachDay, weekdayOf } from './dates'
import { holidayEffect, type HolidayRow } from './holidayEffect'
import { HOLIDAYS } from './holidays'

// 휴일에 따라 (stats-insights REQ-6107 AC-6107.2). 지어낸 하루 내원 수다.
// 오늘 2026-11-18(수) → 최근 12달 = 2025-11-18 ~ 2026-11-17(어제)

const TODAY = '2026-11-18'
const HOLIDAY = new Set(HOLIDAYS)

function day(ymd: string, patients: number, partial = false): DayPayload {
  return {
    schemaVersion: 2,
    quality: 'valid',
    day: ymd,
    partial,
    totals: { patients, newPatients: 0, returning: patients, unknown: 0 },
    rx: [],
    groups: [],
    revisit: { cohort: 0, within7: null, within14: null },
  }
}

// from~to 가운데 일요일·공휴일을 뺀 날마다 줄 하나(의원이 문을 연 날)
function openDays(from: string, to: string, visits: (ymd: string) => number): DayPayload[] {
  return eachDay({ from, to })
    .filter((ymd) => weekdayOf(ymd) !== 7 && !HOLIDAY.has(ymd))
    .map((ymd) => day(ymd, visits(ymd)))
}

const rowOf = (rows: HolidayRow[] | null, key: HolidayRow['key']) => {
  const row = rows?.find((item) => item.key === key)
  if (!row) throw new Error(`줄이 없어요: ${key}`)
  return row
}

// 요일마다 평소 내원: 월 100 · 화~금 80 · 토 50
const USUAL_BY_WEEKDAY = [0, 100, 80, 80, 80, 80, 50]
const usual = (ymd: string) => USUAL_BY_WEEKDAY[weekdayOf(ymd)]!

describe('AC-6107.2 연휴 · 연휴 전날 · 연휴 다음 날 · 평소', () => {
  // 2026-09-14(월) ~ 10-02(금). 추석 9/24(목)~9/26(토) + 9/27(일) = 연휴 하나. 9/20(일)은 공휴일이 없어 연휴가 아니다
  const AROUND_CHUSEOK = openDays('2026-09-14', '2026-10-02', (ymd) => (ymd === '2026-09-23' ? 60 : ymd === '2026-09-28' ? 150 : usual(ymd)))

  it('AC-6107.2: 줄은 평소 · 연휴 전날 · 연휴 다음 날 차례로 셋이다', () => {
    const rows = holidayEffect({ today: TODAY, days: AROUND_CHUSEOK })
    expect(rows?.map((row) => [row.key, row.name])).toEqual([
      ['usual', '평소'],
      ['before', '연휴 전날'],
      ['after', '연휴 다음 날'],
    ])
  })

  it('AC-6107.2: 공휴일이 든 연 날 없는 이어진 날들의 바로 앞 날이 연휴 전날, 바로 뒤 날이 연휴 다음 날이고 나머지 연 날은 평소다', () => {
    const rows = holidayEffect({ today: TODAY, days: AROUND_CHUSEOK })
    // 연 날 14일 = 평소 12일 + 9/23(수) + 9/28(월). 9/19(토)·9/21(월)은 일요일만 쉰 앞뒤라 평소다
    expect(rowOf(rows, 'usual')).toMatchObject({ days: 12 })
    expect(rowOf(rows, 'before')).toMatchObject({ days: 1, average: 60 })
    expect(rowOf(rows, 'after')).toMatchObject({ days: 1, average: 150 })
  })

  it('AC-6107.2: 하루 평균 내원은 그 날들 내원 합 ÷ 날 수를 반올림한 정수다', () => {
    // 평소 12일 합 970 → 80.83 → 81
    expect(rowOf(holidayEffect({ today: TODAY, days: AROUND_CHUSEOK }), 'usual')).toMatchObject({ average: 81, vsUsual: null })
  })

  it('AC-6107.2: 평소보다 = (내원 합 ÷ 그 날들 요일의 평소 평균 합 − 1)을 반올림한 정수 % — 같은 요일끼리 견준다', () => {
    const rows = holidayEffect({ today: TODAY, days: AROUND_CHUSEOK })
    // 9/23(수) 60 ÷ 평소 수요일 80 − 1 = −25%. 9/28(월) 150 ÷ 평소 월요일 100 − 1 = +50% (전체 평소 81과 견주지 않는다)
    expect(rowOf(rows, 'before').vsUsual).toBe(-25)
    expect(rowOf(rows, 'after').vsUsual).toBe(50)
  })

  it('AC-6107.2: 여러 연휴를 모두 모아 센다(2026-04-27 ~ 06-13: 노동절·어린이날·부처님오신날·지방선거·현충일 다섯)', () => {
    const special: Record<string, number> = {
      '2026-04-30': 80, // 5/1(금) 전날
      '2026-05-02': 130, // 5/1 다음 날(토)
      '2026-05-04': 80, // 5/5(화) 전날
      '2026-05-06': 130,
      '2026-05-23': 80, // 5/24(일)~5/25(월) 전날(토)
      '2026-05-26': 130,
      '2026-06-02': 80, // 6/3(수) 선거일 전날
      '2026-06-04': 130,
      '2026-06-05': 80, // 6/6(토)~6/7(일) 전날
      '2026-06-08': 130,
    }
    const rows = holidayEffect({ today: TODAY, days: openDays('2026-04-27', '2026-06-13', (ymd) => special[ymd] ?? 100) })
    expect(rows).toEqual([
      { key: 'usual', name: '평소', days: 27, average: 100, vsUsual: null },
      { key: 'before', name: '연휴 전날', days: 5, average: 80, vsUsual: -20 },
      { key: 'after', name: '연휴 다음 날', days: 5, average: 130, vsUsual: 30 },
    ])
  })

  it('AC-6107.2: 문을 연 공휴일(내원 1 이상)은 연휴가 아니라 연 날이다', () => {
    // 10/9(금) 한글날에 열었다: 앞뒤 날도 평소다
    const days = [...openDays('2026-10-06', '2026-10-17', () => 80), day('2026-10-09', 70)]
    const rows = holidayEffect({ today: TODAY, days })
    expect(rowOf(rows, 'usual').days).toBe(11)
    expect(rowOf(rows, 'before').days).toBe(0)
    expect(rowOf(rows, 'after').days).toBe(0)
  })

  it('AC-6107.2: 내원 0인 줄은 연 날이 아니다', () => {
    // 9/24~9/26 줄이 0명으로 있어도 연휴는 그대로다
    const days = [...AROUND_CHUSEOK, day('2026-09-24', 0), day('2026-09-25', 0)]
    const rows = holidayEffect({ today: TODAY, days })
    expect(rowOf(rows, 'before')).toMatchObject({ days: 1, vsUsual: -25 })
    expect(rowOf(rows, 'after')).toMatchObject({ days: 1, vsUsual: 50 })
  })

  it('AC-6107.2: 저장된 첫날 앞·마지막 날 뒤의 모르는 날은 연휴로 보지 않는다(첫날이 공휴일 바로 뒤라도 평소)', () => {
    // 저장이 9/28(월)부터 시작한다: 9/28은 연휴 다음 날이 아니다
    const rows = holidayEffect({ today: TODAY, days: openDays('2026-09-28', '2026-10-02', usual) })
    expect(rowOf(rows, 'usual').days).toBe(5)
    expect(rowOf(rows, 'after').days).toBe(0)
  })

  it('AC-6107.2: 평소 날이 없는 요일은 평소보다를 셀 수 없다(null). 날 수가 0인 줄의 하루 평균도 null', () => {
    // 저장이 9/23(수)과 9/28(월)뿐: 둘 다 연휴 앞뒤라 평소가 하루도 없다
    const rows = holidayEffect({ today: TODAY, days: [day('2026-09-23', 60), day('2026-09-28', 150)] })
    expect(rows).toEqual([
      { key: 'usual', name: '평소', days: 0, average: null, vsUsual: null },
      { key: 'before', name: '연휴 전날', days: 1, average: 60, vsUsual: null },
      { key: 'after', name: '연휴 다음 날', days: 1, average: 150, vsUsual: null },
    ])
  })
})

describe('AC-6107.2 최근 12달 · 저장된 날', () => {
  it('AC-6107.2: 최근 12달(오늘 12달 전 같은 날 ~ 어제) 밖 줄과 오늘 줄은 세지 않는다', () => {
    const start = [day('2025-11-17', 5000), day('2025-11-18', 100), day('2025-11-19', 100)]
    expect(rowOf(holidayEffect({ today: TODAY, days: start }), 'usual')).toMatchObject({ days: 2, average: 100 })
    const end = [day('2026-11-16', 100), day('2026-11-17', 100), day('2026-11-18', 9000)]
    expect(rowOf(holidayEffect({ today: TODAY, days: end }), 'usual')).toMatchObject({ days: 2, average: 100 })
  })

  it('AC-6107.2: 덜 끝난(partial) 줄은 저장된 날로 보지 않는다', () => {
    const days = [day('2026-11-16', 100), day('2026-11-17', 3, true)]
    expect(rowOf(holidayEffect({ today: TODAY, days }), 'usual')).toMatchObject({ days: 1, average: 100 })
  })

  it('AC-6107.2: 같은 날 줄이 둘이면 뒤의 것을 쓴다', () => {
    const days = [day('2026-11-16', 100), day('2026-11-16', 120)]
    expect(rowOf(holidayEffect({ today: TODAY, days }), 'usual')).toMatchObject({ days: 1, average: 120 })
  })

  it('AC-6107.2: 연 날이 하루도 없으면 null이다(칸을 그리지 않는다)', () => {
    expect(holidayEffect({ today: TODAY, days: [] })).toBeNull()
    expect(holidayEffect({ today: TODAY, days: [day('2026-11-16', 0), day('2026-11-18', 50), day('2024-01-02', 50)] })).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import { addDays, eachDay, weekdayOf } from './dates'
import { goalPace, statsDayValues, type DayValue } from './goalPace'

// 이번 달 목표의 셈 (stats-insights REQ-6102 AC-6102.3, TASK-1). 순수 함수라 저장소·화면 없이 하루 값만 넣는다.
// 숫자는 지어낸 값이다. 2026-11-18은 수요일, 2026-11-01은 일요일이다

const TODAY = '2026-11-18'
const day = (date: string, value: number): DayValue => ({ day: date, value })

// 앞 56일(2026-09-23 ~ 2026-11-17)과 이번 달 어제까지: 월 10 · 화 20 · 수 30 · 목 40 · 금 50 · 토 5, 일요일은 저장된 날이 없다
const BY_WEEKDAY: Record<number, number> = { 1: 10, 2: 20, 3: 30, 4: 40, 5: 50, 6: 5 }
const STEADY = eachDay({ from: addDays(TODAY, -56), to: addDays(TODAY, -1) }).flatMap((date) => {
  const value = BY_WEEKDAY[weekdayOf(date)]
  return value === undefined ? [] : [day(date, value)]
})

describe('AC-6102.3 goalPace: 지금까지·월말 예상·달성률·예상률·지나간 만큼', () => {
  it('AC-6102.3: 지금까지 = 이번 달 1일 ~ 어제의 합(오늘·지난달 값은 넣지 않는다)', () => {
    const days = [day('2026-10-31', 500), ...eachDay({ from: '2026-11-01', to: '2026-11-17' }).map((date) => day(date, 10)), day(TODAY, 999)]
    expect(goalPace({ today: TODAY, goal: 1000, days }).soFar).toBe(170)
  })

  it('AC-6102.3: 월말 예상 = 지금까지 + 오늘~월말 날마다 지난 8주 같은 요일 평균(저장된 날이 없는 요일은 0)', () => {
    // 지금까지: 11/2~11/7 155 + 11/9~11/14 155 + 11/16 월 10 + 11/17 화 20 = 340
    // 남은 날 11/18 수 ~ 11/30 월: 수 30×2 + 목 40×2 + 금 50×2 + 토 5×2 + 일 0×2 + 월 10×2 + 화 20 = 290
    const pace = goalPace({ today: TODAY, goal: 700, days: STEADY })
    expect(pace).toEqual({ soFar: 340, forecast: 630, donePct: 48, forecastPct: 90, elapsed: 17 / 30 })
  })

  it('AC-6102.3: 요일 평균은 지난 8주 그 요일의 저장된 날만 나눈다(빠진 날은 0으로 세지 않는다)', () => {
    // 오늘 11/30 월. 앞 56일 안 월요일은 11/16 10, 11/23 11 두 날만 저장됨 → 평균 10.5 → 남은 날(11/30) 10.5 → 버림 10
    // 9/28 월(56일 밖)의 1000은 평균에 넣지 않는다
    const days = [day('2026-09-28', 1000), day('2026-11-16', 10), day('2026-11-23', 11)]
    expect(goalPace({ today: '2026-11-30', goal: 100, days })).toEqual({ soFar: 21, forecast: 31, donePct: 21, forecastPct: 31, elapsed: 29 / 30 })
  })

  it('AC-6102.3: 앞 56일은 오늘을 넣지 않는다(오늘 값은 평균에도 지금까지에도 없다)', () => {
    // 오늘 11/18 수 999, 앞 56일 안 수요일은 11/11 하나뿐 30 → 남은 수요일 11/18·11/25 = 60
    const days = [day('2026-11-11', 30), day(TODAY, 999)]
    expect(goalPace({ today: TODAY, goal: 100, days })).toMatchObject({ soFar: 30, forecast: 90 })
  })

  it('AC-6102.3: 월말 예상의 원 미만은 버린다(남은 날 평균의 합을 한 번 버림)', () => {
    // 오늘 11/23 월, 남은 날 11/23 월 · 11/30 월. 앞 56일 안 월요일 셋: 1,000,000 · 1,000,001 · 1,000,001 → 평균 1,000,000.66…
    // 남은 두 월요일 합 2,000,001.33… → 버림 2,000,001. 지금까지 = 11/2·11/9·11/16 = 3,000,002
    const days = [day('2026-11-02', 1_000_000), day('2026-11-09', 1_000_001), day('2026-11-16', 1_000_001)]
    expect(goalPace({ today: '2026-11-23', goal: 10_000_000, days })).toMatchObject({ soFar: 3_000_002, forecast: 5_000_003 })
  })

  it('AC-6102.3: 달성률·예상률은 목표로 나눈 % 정수(버림)이고 100을 넘을 수 있다', () => {
    // 11/1 ~ 11/17 날마다 7 → 지금까지 119(일요일 포함 17일). 남은 13일도 요일 평균 7 → 예상 119 + 91 = 210
    const days = eachDay({ from: '2026-09-23', to: '2026-11-17' }).map((date) => day(date, 7))
    expect(goalPace({ today: TODAY, goal: 180, days })).toMatchObject({ soFar: 119, forecast: 210, donePct: 66, forecastPct: 116 })
  })

  it('AC-6102.3: 지나간 만큼 = (오늘 날짜 − 1) ÷ 그 달 날 수. 1일이면 0이고 지금까지도 0이다', () => {
    expect(goalPace({ today: '2026-11-01', goal: 100, days: STEADY })).toMatchObject({ soFar: 0, elapsed: 0 })
    expect(goalPace({ today: '2027-02-15', goal: 100, days: [] }).elapsed).toBe(14 / 28)
    expect(goalPace({ today: '2028-02-15', goal: 100, days: [] }).elapsed).toBe(14 / 29)
    expect(goalPace({ today: '2026-12-31', goal: 100, days: [] }).elapsed).toBe(30 / 31)
  })

  it('AC-6102.3: 저장된 날이 하나도 없으면 지금까지·예상 0, 달성률·예상률 0%', () => {
    expect(goalPace({ today: TODAY, goal: 3200, days: [] })).toEqual({ soFar: 0, forecast: 0, donePct: 0, forecastPct: 0, elapsed: 17 / 30 })
  })

  it('AC-6102.3: 목표가 0이면(나눌 수 없음) 달성률·예상률은 100%로 본다', () => {
    expect(goalPace({ today: TODAY, goal: 0, days: STEADY })).toMatchObject({ donePct: 100, forecastPct: 100 })
  })

  it('AC-6102.3: 받은 날 줄의 차례와 상관없다', () => {
    expect(goalPace({ today: TODAY, goal: 700, days: [...STEADY].reverse() })).toEqual(goalPace({ today: TODAY, goal: 700, days: STEADY }))
  })
})

describe('AC-6102.4 statsDayValues: 저장된 하루 숫자 → 내원·신환 하루 값', () => {
  const stored = [
    { day: '2026-11-16', totals: { patients: 120, newPatients: 7 } },
    { day: '2026-11-17', totals: { patients: 98, newPatients: 4 } },
  ]

  it('AC-6102.4: 내원은 그날 totals.patients, 신환은 totals.newPatients다', () => {
    expect(statsDayValues(stored, 'visits')).toEqual([day('2026-11-16', 120), day('2026-11-17', 98)])
    expect(statsDayValues(stored, 'newPatients')).toEqual([day('2026-11-16', 7), day('2026-11-17', 4)])
  })
})

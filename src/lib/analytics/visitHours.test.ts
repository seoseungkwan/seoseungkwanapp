import { describe, expect, it } from 'vitest'
import type { VisitHours } from '@/types/stats'
import {
  VISIT_HOURS,
  averageText,
  cellAverage,
  cellLevel,
  hourName,
  unknownHoursNote,
  visitHours,
  visitHoursHeadline,
} from './visitHours'

// 지어낸 접수 줄. 2026-11-02는 월요일, 2026-11-15는 일요일이다
const FROM = '2026-11-02'
const TO = '2026-11-15'
const at = (d: string, h: number | null) => ({ d, h })
const times = (n: number, d: string, h: number | null) => Array.from({ length: n }, () => at(d, h))

const rowOf = (view: VisitHours, weekday: number) => {
  const row = view.rows.find((r) => r.weekday === weekday)
  if (!row) throw new Error(`요일 줄이 없어요: ${weekday}`)
  return row
}
const cellOf = (view: VisitHours, weekday: number, hour: number) => rowOf(view, weekday).cells[view.hours.indexOf(hour)]

describe('AC-2704.1 칸 = 그 요일·그 시 접수 합 ÷ 그 요일의 문 연 날 수', () => {
  it('AC-2704.1: 문 연 날은 기간 안에서 센 접수가 하나라도 있는 날이고, 칸에는 접수 합을 둔다', () => {
    const view = visitHours(
      [
        ...times(3, '2026-11-02', 9), // 월
        at('2026-11-09', 9), // 월
        at('2026-11-09', 14),
        at('2026-11-03', 9), // 화
        at('2026-11-16', 9), // 기간 밖 월요일
        at('2026-11-01', 9), // 기간 밖 일요일
      ],
      FROM,
      TO,
    )
    expect(rowOf(view, 1)).toMatchObject({ weekday: 1, openDays: 2 })
    expect(cellOf(view, 1, 9)).toBe(4)
    expect(cellOf(view, 1, 14)).toBe(1)
    expect(rowOf(view, 2).openDays).toBe(1)
    expect(rowOf(view, 7).openDays).toBe(0)
    expect(cellAverage(cellOf(view, 1, 9), rowOf(view, 1).openDays)).toBe(2)
  })

  it('AC-2704.1: 접수 시각을 모르는 접수만 있는 날은 문 연 날이 아니다(센 접수가 아니다)', () => {
    const view = visitHours([at('2026-11-04', null), at('2026-11-11', 10)], FROM, TO)
    expect(rowOf(view, 3).openDays).toBe(1)
  })

  it.each<[number, number, number]>([
    [4, 2, 2],
    [0, 2, 0],
    [5, 0, 0],
    [1, 3, 1 / 3],
  ])('AC-2704.1: 합 %d ÷ 문 연 날 %d = %d', (sum, openDays, average) => {
    expect(cellAverage(sum, openDays)).toBe(average)
  })

  it.each<[number, string]>([
    [2, '2.0'],
    [1 / 3, '0.3'],
    [29 / 20, '1.5'], // 1.45 → 소수 한 자리 반올림
    [14.25, '14.3'],
    [0.04, '0.0'],
    [0, '–'],
  ])('AC-2704.1: 평균 %d → %s', (average, text) => {
    expect(averageText(average)).toBe(text)
  })
})

describe('AC-2704.2 월~일 일곱 줄 · 8시~20시 열세 칸', () => {
  it('AC-2704.2: 줄은 늘 월~일, 열은 8시~20시 고정이고 8시 전은 8시 칸, 21시 이후는 20시 칸에 더한다', () => {
    const view = visitHours([at('2026-11-02', 6), at('2026-11-02', 7), at('2026-11-02', 8), at('2026-11-02', 20), at('2026-11-02', 21), at('2026-11-02', 23)], FROM, TO)
    expect(VISIT_HOURS).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20])
    expect(view.hours).toEqual(VISIT_HOURS)
    expect(view.rows.map((r) => r.weekday)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(view.rows.every((r) => r.cells.length === 13)).toBe(true)
    expect(cellOf(view, 1, 8)).toBe(3)
    expect(cellOf(view, 1, 20)).toBe(3)
    expect(rowOf(view, 1).cells.reduce((a, b) => a + b, 0)).toBe(6)
  })

  it('AC-2704.2: 문 연 날이 없는 요일도 줄이 있고 칸은 모두 0이다', () => {
    const view = visitHours([], FROM, TO)
    expect(view.rows).toHaveLength(7)
    expect(view.rows.every((r) => r.openDays === 0 && r.cells.every((c) => c === 0))).toBe(true)
    expect(view.peak).toBeNull()
  })

  it('AC-2704.2: 접수 시각을 모르는 접수는 칸에서 빼고 수를 센다', () => {
    const view = visitHours([at('2026-11-02', null), at('2026-11-03', null), at('2026-11-03', 9), at('2026-11-20', null)], FROM, TO)
    expect(view.unknown).toBe(2)
    expect(rowOf(view, 2).cells.reduce((a, b) => a + b, 0)).toBe(1)
    expect(unknownHoursNote(view.unknown)).toBe('접수 시각을 모르는 2건은 뺐어요.')
    expect(unknownHoursNote(1234)).toBe('접수 시각을 모르는 1,234건은 뺐어요.')
    expect(unknownHoursNote(0)).toBeNull()
  })
})

describe('AC-2704.3 머리글: 가장 붐비는 때', () => {
  it.each<[number, string]>([
    [0, '오전 0시'],
    [8, '오전 8시'],
    [11, '오전 11시'],
    [12, '낮 12시'],
    [13, '오후 1시'],
    [20, '오후 8시'],
    [23, '오후 11시'],
  ])('AC-2704.3: %d시 → %s', (hour, name) => {
    expect(hourName(hour)).toBe(name)
  })

  it('AC-2704.3: 하루 평균이 가장 큰 칸으로 머리글을 만든다', () => {
    const view = visitHours(
      [
        ...times(3, '2026-11-02', 9),
        at('2026-11-09', 9), // 월 9시: 4 ÷ 2 = 2.0
        ...times(3, '2026-11-06', 14), // 금 14시: 3 ÷ 1 = 3.0
      ],
      FROM,
      TO,
    )
    expect(view.peak).toEqual({ weekday: 5, hour: 14, average: 3 })
    expect(visitHoursHeadline(view)).toBe('가장 붐비는 때는 금요일 오후 2시예요 · 하루 평균 3.0건')
  })

  it('AC-2704.3: 가장 큰 칸이 여럿이면 앞 요일·이른 시다', () => {
    const view = visitHours([at('2026-11-03', 15), at('2026-11-03', 10), at('2026-11-07', 9)], FROM, TO)
    expect(view.peak).toEqual({ weekday: 2, hour: 10, average: 1 })
    expect(visitHoursHeadline(view)).toBe('가장 붐비는 때는 화요일 오전 10시예요 · 하루 평균 1.0건')
  })

  it('AC-2704.3: 센 접수가 없으면 머리글이 없다', () => {
    expect(visitHoursHeadline(visitHours([at('2026-11-02', null)], FROM, TO))).toBeNull()
  })
})

describe('AC-2704.4 칸 색 단계 = ⌈칸 ÷ 가장 큰 칸 × 5⌉', () => {
  it.each<[number, number, number]>([
    [0, 3, 0],
    [3, 3, 5],
    [0.6, 3, 1], // 0.2 × 5 = 1
    [0.61, 3, 2],
    [0.8, 2, 2], // 0.4 × 5 = 2 (경계가 3으로 넘어가지 않는다)
    [0.01, 3, 1],
    [1.8, 3, 3],
  ])('AC-2704.4: 칸 %d · 가장 큰 칸 %d → %d단계', (average, peak, level) => {
    expect(cellLevel(average, peak)).toBe(level)
  })
})

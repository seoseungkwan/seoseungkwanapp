import { describe, expect, it } from 'vitest'
import type { VisitHours } from '@/types/stats'
import {
  VISIT_HOURS,
  averageText,
  cellAverage,
  cellLevel,
  foldHours,
  foldNote,
  foldWindow,
  heatLevel,
  heatText,
  heatTip,
  hourName,
  hourSpan,
  peakParts,
  unknownHoursNote,
  visitHours,
  visitHoursHeadline,
  withoutWeekdays,
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

describe('AC-2704.5 [자세히] 합계 표의 바탕', () => {
  it('AC-2704.5: 칸에는 평균이 아닌 접수 건수 합이, 요일 줄에는 문 연 날 수가 있어 합계 표(첫 칸 "월 (2일)")를 그대로 그릴 수 있다', () => {
    const view = visitHours([...times(5, '2026-11-02', 9), at('2026-11-09', 9), at('2026-11-09', 14)], FROM, TO)
    expect(rowOf(view, 1)).toMatchObject({ weekday: 1, openDays: 2 })
    expect(cellOf(view, 1, 9)).toBe(6)
    expect(cellOf(view, 1, 14)).toBe(1)
    expect(view.rows.reduce((sum, row) => sum + row.cells.reduce((a, b) => a + b, 0), 0)).toBe(7)
  })
})

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

// ── first90 진료 운영 카드: 시간대별 접수 글자·칸 색 (REQ-4414 AC-4414.3, 시안 docs/mockups/first90/redesign.html .s-hm) ──
// 위 셈(칸 합·문 연 날·가장 붐비는 칸·averageText)은 그대로 쓰고 글자와 색 구간만 더한다
describe('AC-4414.3 시간대별 접수 칸 글자·색 구간·아래 줄 글', () => {
  it.each<[number, string]>([
    [8, '08:00–08:59'],
    [9, '09:00–09:59'],
    [12, '12:00–12:59'],
    [20, '20:00–20:59'],
  ])('AC-4414.3: %d시 칸 이름은 %s다', (hour, span) => {
    expect(hourSpan(hour)).toBe(span)
  })

  it.each<[number, number]>([
    [0, 0],
    [0.02, 1], // 소수 한 자리로 0.0이어도 접수가 있으면 첫 구간
    [0.1, 1],
    [4.9, 1],
    [4.94, 1],
    [4.95, 2], // 보이는 글자 5.0 → 5–9.9
    [5, 2],
    [9.9, 2],
    [10, 3],
    [14.5, 3],
    [14.96, 4], // 15.0
    [15.3, 4],
    [19.9, 4],
    [20, 5],
    [24.25, 5],
  ])('AC-4414.3: 하루 평균 %d → 색 %d단계(범례 0건 · 0.1–4.9 · 5–9.9 · 10–14.9 · 15–19.9 · 20건 이상)', (average, level) => {
    expect(heatLevel(average)).toBe(level)
  })

  it('AC-4414.3: 칸 글자는 0이면 "0", 아니면 소수 한 자리(averageText 그대로)다', () => {
    expect(heatText(0)).toBe('0')
    expect(heatText(57 / 4)).toBe(averageText(57 / 4))
    expect(heatText(57 / 4)).toBe('14.3')
    expect(heatText(8)).toBe('8.0')
  })

  it('AC-4414.3: 아래 줄 글은 "{요일}요일 {hh}:00–{hh}:59 · 하루 평균 {v}건 · {요일}요일 {d}일 동안 {n}건 ÷ {d}일"이다', () => {
    expect(heatTip(1, 9, 97, 4)).toBe('월요일 09:00–09:59 · 하루 평균 24.3건 · 월요일 4일 동안 97건 ÷ 4일')
    expect(heatTip(6, 13, 0, 4)).toBe('토요일 13:00–13:59 · 하루 평균 0.0건 · 토요일 4일 동안 0건 ÷ 4일')
    expect(heatTip(3, 10, 1234, 52)).toBe('수요일 10:00–10:59 · 하루 평균 23.7건 · 수요일 52일 동안 1,234건 ÷ 52일')
  })

  it('AC-4414.3: 머리 줄 조각은 가장 붐비는 칸(visitHours 셈 그대로)의 요일·시간, 하루 평균, 그 요일 문 연 날·접수 합이다', () => {
    const view = visitHours(
      [
        ...times(3, '2026-11-02', 9),
        at('2026-11-09', 9), // 월 9시: 4 ÷ 2 = 2.0
        ...times(3, '2026-11-06', 14), // 금 14시: 3 ÷ 1 = 3.0
      ],
      FROM,
      TO,
    )
    expect(peakParts(view)).toEqual({ when: '금요일 14:00–14:59', average: '3.0건', detail: '(금요일 1일 동안 3건)' })
  })

  it('AC-4414.3: 센 접수가 없으면 머리 줄이 없다', () => {
    expect(peakParts(visitHours([at('2026-11-02', null)], FROM, TO))).toBeNull()
  })
})

// ── clinic-profile: 병원 진료시간으로 접기·휴진 요일 줄 빼기 (REQ-6606 AC-6606.1, design.md 8절) ──
// 진료시간은 화면 부품이 병원 정보에서 읽어 값(시·요일 번호)으로만 넘긴다(lib/analytics는 병원 정보를 읽지 않는다)
describe('AC-6606.1 진료시간 밖 칸은 끝 칸에 더하고 휴진 요일 줄은 뺀다', () => {
  // 월 8시 2건 · 9시 3건 · 17시 1건 · 18시 4건 · 20시 5건, 일요일 10시 7건(문 연 날 하루씩)
  const FULL = visitHours(
    [
      ...times(2, '2026-11-02', 8),
      ...times(3, '2026-11-02', 9),
      at('2026-11-02', 17),
      ...times(4, '2026-11-02', 18),
      ...times(5, '2026-11-02', 20),
      ...times(7, '2026-11-08', 10),
      at('2026-11-03', null),
    ],
    FROM,
    TO,
  )

  it.each<[string, { openHour: number; closeHour: number }, { from: number; to: number }]>([
    ['09:00~18:00 → 18시는 끝 경계라 마지막 칸은 17시', { openHour: 9, closeHour: 18 }, { from: 9, to: 17 }],
    ['09:00~18:30 → 끝 경계 19시 → 마지막 칸 18시(18:00–18:59 안에 문 연 30분이 있다)', { openHour: 9, closeHour: 19 }, { from: 9, to: 18 }],
    ['문 여는 날 없음(8~20) → 8시~19시 칸', { openHour: 8, closeHour: 20 }, { from: 8, to: 19 }],
  ])('AC-6606.1: calendarRange 값 %s', (_name, range, window) => {
    expect(foldWindow(range)).toEqual(window)
  })

  it('AC-6606.1: from 앞 칸은 from 칸에, to 뒤 칸은 to 칸에 더하고 칸은 from~to 시뿐이다(합·문 연 날·시각 모름은 그대로)', () => {
    const view = foldHours(FULL, { from: 9, to: 17 })
    expect(view.hours).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17])
    expect(view.rows.map((row) => row.cells.length)).toEqual([9, 9, 9, 9, 9, 9, 9])
    expect(cellOf(view, 1, 9)).toBe(5) // 8시 2 + 9시 3
    expect(cellOf(view, 1, 17)).toBe(10) // 17시 1 + 18시 4 + 20시 5
    expect(rowOf(view, 1).cells.reduce((a, b) => a + b, 0)).toBe(15)
    expect(rowOf(view, 1).openDays).toBe(1)
    expect(cellOf(view, 7, 10)).toBe(7)
    expect(view.unknown).toBe(1)
  })

  it('AC-6606.1: 가장 붐비는 칸은 접은 칸으로 다시 찾는다', () => {
    expect(FULL.peak).toEqual({ weekday: 7, hour: 10, average: 7 })
    const view = foldHours(FULL, { from: 9, to: 17 })
    expect(view.peak).toEqual({ weekday: 1, hour: 17, average: 10 })
    expect(peakParts(view)).toEqual({ when: '월요일 17:00–17:59', average: '10.0건', detail: '(월요일 1일 동안 10건)' })
  })

  it.each<[string, { from: number; to: number }, number[]]>([
    ['8시 전·20시 뒤는 8~20으로 자른다', { from: 6, to: 23 }, VISIT_HOURS as number[]],
    ['from이 20 넘으면 20시 한 칸', { from: 21, to: 22 }, [20]],
    ['to가 from보다 앞이면 from 한 칸', { from: 12, to: 10 }, [12]],
  ])('AC-6606.1: 8 ≤ from ≤ to ≤ 20 — %s', (_name, window, hours) => {
    const view = foldHours(FULL, window)
    expect(view.hours).toEqual(hours)
    expect(rowOf(view, 1).cells.reduce((a, b) => a + b, 0)).toBe(15)
  })

  it('AC-6606.1: 휴진 요일(1 = 월 … 7 = 일) 줄을 빼고 가장 붐비는 칸은 남은 줄로 다시 찾는다', () => {
    const view = withoutWeekdays(FULL, [7])
    expect(view.rows.map((row) => row.weekday)).toEqual([1, 2, 3, 4, 5, 6])
    expect(view.hours).toEqual(FULL.hours)
    expect(view.peak).toEqual({ weekday: 1, hour: 20, average: 5 })
    expect(view.unknown).toBe(1)
    expect(withoutWeekdays(FULL, []).rows).toHaveLength(7)
  })

  it("AC-6606.1: 아래 글은 '{시작}시~{끝}시, 그 밖의 접수는 맨 앞·맨 뒤 칸에 더했어요'(접은 첫 칸·끝 칸)", () => {
    expect(foldNote(foldHours(FULL, { from: 9, to: 17 }))).toBe('9시~17시, 그 밖의 접수는 맨 앞·맨 뒤 칸에 더했어요')
    expect(foldNote(foldHours(FULL, foldWindow({ openHour: 8, closeHour: 20 })))).toBe('8시~19시, 그 밖의 접수는 맨 앞·맨 뒤 칸에 더했어요')
  })
})

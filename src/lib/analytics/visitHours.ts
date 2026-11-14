import type { VisitHourRow, VisitHours, VisitPeak } from '@/types/stats'
import { weekdayOf } from './dates'
import type { VisitLine } from './patientMix'

// 시간대별 접수(요일 × 시) [환자 자료 구역] (stats-bit-sections REQ-2704). 접수 줄은 세는 데만 쓰고 결과에는 칸마다 수만 남긴다.
// 칸 값 = 그 요일·그 시 접수 합 ÷ 그 요일의 문 연 날 수. 나누기·글자·색 단계는 화면이 아래 순수 함수로 한다

export type { VisitHours } from '@/types/stats'

const FIRST_HOUR = 8
const LAST_HOUR = 20
// 병원 접수 시간 8시~20시 열세 칸 고정(2026-11-07 사용자 결정). 8시 전은 8시 칸, 21시 이후는 20시 칸에 더한다
export const VISIT_HOURS: readonly number[] = Array.from({ length: LAST_HOUR - FIRST_HOUR + 1 }, (_, i) => FIRST_HOUR + i)
const WEEKDAYS = '월화수목금토일'
const LEVELS = 5
const EPSILON = 1e-9 // 1.45 × 10 = 14.4999…, 0.4 × 5 = 2.0000…4 같은 부동소수 오차가 반올림·올림을 바꾸지 않게

const comma = (n: number) => n.toLocaleString('en-US')

// 문 연 날 = 기간 안에서 센 접수(시각을 아는 접수)가 하나라도 있는 날(AC-2704.1)
export function visitHours(visits: readonly Pick<VisitLine, 'd' | 'h'>[], from: string, to: string): VisitHours {
  const rows: VisitHourRow[] = Array.from({ length: WEEKDAYS.length }, (_, i) => ({
    weekday: i + 1,
    openDays: 0,
    cells: VISIT_HOURS.map(() => 0),
  }))
  const openDays = new Map<string, number>() // 문 연 날 → 요일
  let unknown = 0
  for (const { d, h } of visits) {
    if (d < from || d > to) continue
    if (h === null) {
      unknown++
      continue
    }
    let weekday = openDays.get(d)
    if (weekday === undefined) {
      weekday = weekdayOf(d)
      openDays.set(d, weekday)
      rows[weekday - 1].openDays++
    }
    rows[weekday - 1].cells[Math.min(LAST_HOUR, Math.max(FIRST_HOUR, h)) - FIRST_HOUR]++
  }
  return { hours: [...VISIT_HOURS], rows, unknown, peak: peakOf(rows) }
}

// 하루 평균이 가장 큰 칸. 여럿이면 앞 요일·이른 시(같은 분수는 같은 부동소수라 그대로 견준다, AC-2704.3)
function peakOf(rows: readonly VisitHourRow[]): VisitPeak | null {
  let peak: VisitPeak | null = null
  for (const row of rows) {
    for (let i = 0; i < row.cells.length; i++) {
      const average = cellAverage(row.cells[i], row.openDays)
      if (average > 0 && (peak === null || average > peak.average)) peak = { weekday: row.weekday, hour: VISIT_HOURS[i], average }
    }
  }
  return peak
}

// 칸 하나의 하루 평균. 문 연 날이 없으면 0
export function cellAverage(sum: number, openDays: number): number {
  return openDays > 0 ? sum / openDays : 0
}

// 칸 글자: 소수 한 자리로 반올림, 0이면 '–'(AC-2704.1)
export function averageText(average: number): string {
  if (average === 0) return '–'
  return (Math.round(average * 10 + EPSILON) / 10).toFixed(1)
}

// 칸 색 단계 1~5 = ⌈칸 ÷ 가장 큰 칸 × 5⌉, 0인 칸은 0(색 없음, AC-2704.4)
export function cellLevel(average: number, peakAverage: number): number {
  if (!(average > 0) || !(peakAverage > 0)) return 0
  return Math.min(LEVELS, Math.max(1, Math.ceil((average / peakAverage) * LEVELS - EPSILON)))
}

// 0~11시 '오전 N시', 12시 '낮 12시', 13~23시 '오후 (N−12)시'
export function hourName(hour: number): string {
  if (hour < 12) return `오전 ${hour}시`
  return hour === 12 ? '낮 12시' : `오후 ${hour - 12}시`
}

// 머리글. 센 접수가 없으면 null
export function visitHoursHeadline(view: VisitHours): string | null {
  const { peak } = view
  if (peak === null) return null
  return `가장 붐비는 때는 ${WEEKDAYS[peak.weekday - 1]}요일 ${hourName(peak.hour)}예요 · 하루 평균 ${averageText(peak.average)}건`
}

// 표 아래 글. 시각을 모르는 접수가 없으면 null(AC-2704.2)
export function unknownHoursNote(unknown: number): string | null {
  return unknown > 0 ? `접수 시각을 모르는 ${comma(unknown)}건은 뺐어요.` : null
}

// ── 진료 운영 카드 시간대별 접수 글자·칸 색 (first90 REQ-4414 AC-4414.3, 시안 docs/mockups/first90/redesign.html .s-hm) ──
// 위 셈(칸 합·문 연 날·가장 붐비는 칸·averageText)을 그대로 쓰고 글자와 색 구간만 더한다

const HEAT_STEP = 5 // 색 구간 폭: 0건 · 0.1–4.9 · 5–9.9 · 10–14.9 · 15–19.9 · 20건 이상
const weekdayName = (weekday: number) => `${WEEKDAYS[weekday - 1]}요일`
// 소수 한 자리 반올림(averageText와 같은 규칙, 0도 '0.0')
const oneDecimal = (average: number) => (Math.round(average * 10 + EPSILON) / 10).toFixed(1)

// 시 칸 이름 '09:00–09:59'
export function hourSpan(hour: number): string {
  const hh = String(hour).padStart(2, '0')
  return `${hh}:00–${hh}:59`
}

// 칸 색 단계 0~5(범례 여섯 구간). 보이는 글자(소수 한 자리)로 고르고, 접수가 있으면 0.0으로 보여도 첫 구간이다
export function heatLevel(average: number): number {
  if (!(average > 0)) return 0
  return Math.min(LEVELS, 1 + Math.floor(Number(oneDecimal(average)) / HEAT_STEP))
}

// 칸 글자: 0이면 '0'(진료한 날이지만 그 시간 접수가 없었음), 아니면 averageText
export function heatText(average: number): string {
  return average === 0 ? '0' : averageText(average)
}

// 칸을 누르면 아래 줄에 나오는 글(칸 단추 이름도 같다)
export function heatTip(weekday: number, hour: number, sum: number, openDays: number): string {
  const name = weekdayName(weekday)
  return `${name} ${hourSpan(hour)} · 하루 평균 ${oneDecimal(cellAverage(sum, openDays))}건 · ${name} ${comma(openDays)}일 동안 ${comma(sum)}건 ÷ ${comma(openDays)}일`
}

// 머리 줄 조각: '가장 붐비는 때 {when} · 하루 평균 {average} {detail}'. 센 접수가 없으면 null
export function peakParts(view: VisitHours): { when: string; average: string; detail: string } | null {
  const { peak } = view
  if (peak === null) return null
  const row = view.rows.find((one) => one.weekday === peak.weekday)
  if (row === undefined) return null
  const sum = row.cells[view.hours.indexOf(peak.hour)] ?? 0
  const name = weekdayName(peak.weekday)
  return { when: `${name} ${hourSpan(peak.hour)}`, average: `${averageText(peak.average)}건`, detail: `(${name} ${comma(row.openDays)}일 동안 ${comma(sum)}건)` }
}

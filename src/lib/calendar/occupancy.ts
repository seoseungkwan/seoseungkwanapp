import { addDays, compareYmd, eachDay, weekdayOf } from '@/lib/analytics/dates'
import type { CalAllDay, CalSettings, CalSlotRow } from '@/types/calendar'
import { hoursOn } from './clinic'
import { HALF_DAY_NOON } from './rules'

// 예약 빈자리 (spec stats-insights REQ-6105 AC-6105.1·AC-6105.2). 순수 함수다.
// 기간 = 오늘 앞 56일(어제까지), 칸 = 요일(월~토, 설정이 일요일을 쓰면 일도) × 시(여는 시 ~ 닫는 시 − 1).
// 찬 분 = 취소 아닌 예약이 그 시와 겹친 분의 합, 자리 = 그 요일 날짜마다 (그날 휴무 아닌 시행자 수 × 60)의 합,
// 찬 정도 = 찬 분 ÷ 자리(반올림 정수 %, 100 넘으면 100), 자리가 0이면 null. 시행자를 고르면 그 시행자 예약만·그 시행자 자리만.
// 반차 휴무(part 'am'·'pm', spec staff AC-7616.3)는 그 시행자의 그날 자리에서 오전이면 경계 앞, 오후면 경계 뒤 분만 뺀다.
// 경계 = 그 요일 병원 점심 시작(없으면 13:00) — 예약 넣기 휴무 경고(AC-7616.2)와 같다. part 없는 휴무·같은 날 오전과 오후는 하루 전체다.
// 찬 분이 0인 칸(기간 동안 그 요일·시와 겹친 예약이 한 번도 없음)은 안 여는 시간으로 보고 null이다(2026-11-18 사용자 결정 — 점심·토요일 오후가
// 늘 0%로 '늘 비는 시간'을 채웠다). 찬 분이 조금이라도 있으면 반올림해 0이어도 0이다

export const OCCUPANCY_DAYS = 56
const HOUR_MIN = 60
const WEEKDAY = ['월', '화', '수', '목', '금', '토', '일'] // weekdayOf 1=월 … 7=일
const EMPTY_BELOW = 50 // '늘 비는 시간' = 이보다 낮은 칸
const FULL_FROM = 85 // '꽉 차는 시간' = 이 이상인 칸
const EMPTY_TOP = 3
const FULL_TOP = 2
const LEVEL_FROM = [45, 65, 85] as const // 색 네 단계 경계(AC-6105.3)

type OccupancyInput = {
  rows: readonly Pick<CalSlotRow, 'day' | 'staffId' | 'status' | 'start' | 'len'>[]
  offs: readonly Pick<CalAllDay, 'day' | 'type' | 'staffId' | 'part'>[]
  settings: Pick<CalSettings, 'staff' | 'openHour' | 'closeHour' | 'sunday' | 'days'> // days = 반차 경계(점심 시작)를 볼 요일 진료시간
  today: string
  staffId: string | null // null = 모두
}
type OffPart = 'day' | 'am' | 'pm' // 하루 전체 · 오전(경계 앞) · 오후(경계 뒤)

/** 그 시(hour) 60분 가운데 휴무가 아닌 분. 오전 휴무는 경계 뒤, 오후 휴무는 경계 앞만 남는다 */
function openMinutes(hour: number, part: OffPart | undefined, noon: number): number {
  const from = hour * HOUR_MIN
  const to = from + HOUR_MIN
  if (part === undefined) return HOUR_MIN
  if (part === 'am') return Math.max(0, to - Math.max(from, noon))
  if (part === 'pm') return Math.max(0, Math.min(to, noon) - from)
  return 0
}
/** cells[요일 차례][시 차례] = 찬 정도 %(자리 0이거나 찬 분 0이면 null). booked = 기간·보이는 요일·고른 시행자의 취소 아닌 예약 수 */
export type Occupancy = { weekdays: number[]; hours: number[]; cells: (number | null)[][]; booked: number }

/** 기간: 오늘 − 56일 ~ 어제 */
export function occupancySpan(today: string): { from: string; to: string } {
  return { from: addDays(today, -OCCUPANCY_DAYS), to: addDays(today, -1) }
}

export function occupancy({ rows, offs, settings, today, staffId }: OccupancyInput): Occupancy {
  const { from, to } = occupancySpan(today)
  const weekdays = settings.sunday ? [1, 2, 3, 4, 5, 6, 7] : [1, 2, 3, 4, 5, 6]
  const hours = Array.from({ length: Math.max(0, settings.closeHour - settings.openHour) }, (_, i) => settings.openHour + i)
  const inSpan = (day: string) => compareYmd(day, from) >= 0 && compareYmd(day, to) <= 0
  const filled = weekdays.map(() => hours.map(() => 0))
  const seats = weekdays.map(() => hours.map(() => 0)) // 요일 × 시마다 자리(분)

  const staffIds = staffId === null ? settings.staff.map((person) => person.id) : [staffId]
  // 날|시행자 → 휴무 모양. 같은 날 오전과 오후(또는 종일)가 겹치면 하루 전체
  const offOn = new Map<string, OffPart>()
  for (const item of offs) {
    if (item.type !== 'off' || item.staffId === null) continue
    const key = `${item.day}|${item.staffId}`
    const part: OffPart = item.part === 'am' || item.part === 'pm' ? item.part : 'day'
    const had = offOn.get(key)
    offOn.set(key, had === undefined || had === part ? part : 'day')
  }
  for (const day of eachDay({ from, to })) {
    const at = weekdays.indexOf(weekdayOf(day))
    if (at < 0) continue
    const noon = hoursOn(settings, day)?.lunchFrom ?? HALF_DAY_NOON
    for (const id of staffIds) {
      const part = offOn.get(`${day}|${id}`)
      hours.forEach((hour, i) => {
        seats[at]![i]! += openMinutes(hour, part, noon)
      })
    }
  }

  let booked = 0
  for (const row of rows) {
    if (row.status === 'cancel' || !inSpan(row.day) || (staffId !== null && row.staffId !== staffId)) continue
    const at = weekdays.indexOf(weekdayOf(row.day))
    if (at < 0) continue
    booked++
    const end = row.start + row.len
    hours.forEach((hour, i) => {
      const overlap = Math.min(end, (hour + 1) * HOUR_MIN) - Math.max(row.start, hour * HOUR_MIN)
      if (overlap > 0) filled[at]![i]! += overlap
    })
  }

  const cells = filled.map((minutes, at) =>
    minutes.map((n, i) => {
      const seat = seats[at]![i]!
      return seat === 0 || n === 0 ? null : Math.min(100, Math.round((n / seat) * 100))
    }),
  )
  return { weekdays, hours, cells, booked }
}

type Spot = { weekday: number; hour: number; pct: number }
const spotText = (spot: Spot) => `${WEEKDAY[spot.weekday - 1]} ${spot.hour}시 ${spot.pct}%`
const joined = (spots: readonly Spot[]) => (spots.length === 0 ? null : spots.map(spotText).join(' · '))

/** '늘 비는 시간'(50보다 낮은 칸, 낮은 순 3개)·'꽉 차는 시간'(85 이상, 높은 순 2개). 같으면 요일·시 차례, 없으면 null */
export function occupancyLists(view: Occupancy): { empty: string | null; full: string | null } {
  const spots = view.weekdays.flatMap((weekday, at) =>
    view.hours.flatMap((hour, i) => {
      const pct = view.cells[at]?.[i] ?? null
      return pct === null ? [] : [{ weekday, hour, pct }]
    }),
  )
  const empty = spots.filter((spot) => spot.pct < EMPTY_BELOW).sort((a, b) => a.pct - b.pct)
  const full = spots.filter((spot) => spot.pct >= FULL_FROM).sort((a, b) => b.pct - a.pct)
  return { empty: joined(empty.slice(0, EMPTY_TOP)), full: joined(full.slice(0, FULL_TOP)) }
}

/** 칸 색 단계: 45 미만 0 · 65 미만 1 · 85 미만 2 · 85 이상 3 */
export function occupancyLevel(pct: number): 0 | 1 | 2 | 3 {
  const level = LEVEL_FROM.findIndex((from) => pct < from)
  return (level < 0 ? LEVEL_FROM.length : level) as 0 | 1 | 2 | 3
}

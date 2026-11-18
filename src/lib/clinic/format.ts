import { WEEKDAY_NAMES, type DayHours } from '@/types/clinicProfile'

// 병원 정보 표시 도우미(spec clinic-profile design.md 2절). 순수 함수다 — 네트워크·React·저장소를 쓰지 않아
// 환자 자료 구역(lib/calendar·lib/analytics)에서도 부를 수 있다. 문자 문구(AC-6605.1)·예약 시간 줄(AC-6603.2)·통계가 함께 쓴다

type OpenDay = Exclude<DayHours, null>

const pad = (n: number) => String(n).padStart(2, '0')

/** 분 → 'HH:MM'(1440 = '24:00') */
export function clockText(minutes: number): string {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`
}

// 앞자리 차례가 중요하다: 02(서울) → 050X(안심번호) → 그 밖의 0XX
const PHONE_SHAPES = [/^(02)(\d{3,4})(\d{4})$/, /^(050\d)(\d{3})(\d{4})$/, /^(0\d{2})(\d{3,4})(\d{4})$/]

/** 숫자만 적은 전화 → 02-123-4567·02-1234-5678·031-123-4567·010-1234-5678 모양. 비었으면 '', 모양을 모르면 받은 그대로 */
export function phoneText(digits: string | null): string {
  if (digits === null) return ''
  for (const shape of PHONE_SHAPES) {
    const found = shape.exec(digits)
    if (found) return found.slice(1).join('-')
  }
  return digits
}

const sameDay = (a: OpenDay, b: OpenDay) => a.open === b.open && a.close === b.close && a.lunchFrom === b.lunchFrom && a.lunchTo === b.lunchTo

function dayText(day: OpenDay): string {
  const base = `${clockText(day.open)}~${clockText(day.close)}`
  return day.lunchFrom === null || day.lunchTo === null ? base : `${base}(점심 ${clockText(day.lunchFrom)}~${clockText(day.lunchTo)})`
}

// 요일 묶음 이름: 월~금 = 평일, 일곱 날 = 매일, 셋 넘게 이어지면 '월~목', 아니면 '월·수·금'
function daysText(days: number[]): string {
  if (days.length === 7) return '매일'
  if (days.join() === '0,1,2,3,4') return '평일'
  const run = days.every((d, i) => i === 0 || d === days[i - 1] + 1)
  if (run && days.length >= 3) return `${WEEKDAY_NAMES[days[0]]}~${WEEKDAY_NAMES[days[days.length - 1]]}`
  return days.map((d) => WEEKDAY_NAMES[d]).join('·')
}

/**
 * 진료시간 글(AC-6605.1). 같은 시간인 요일끼리 묶고(처음 나온 차례), 점심은 괄호, 휴진 요일은 끝에 '…·공휴일 휴진'.
 * 예: '평일 09:00~18:00(점심 13:00~14:00), 토 09:00~13:00, 일·공휴일 휴진'. 문 여는 날이 없으면 ''(문구를 그대로 둔다)
 */
export function hoursText(hours: readonly DayHours[]): string {
  const groups: { day: OpenDay; days: number[] }[] = []
  const closed: number[] = []
  hours.forEach((day, index) => {
    if (day === null) {
      closed.push(index)
      return
    }
    const group = groups.find((g) => sameDay(g.day, day))
    if (group) group.days.push(index)
    else groups.push({ day, days: [index] })
  })
  if (groups.length === 0) return ''
  const parts = groups.map((g) => `${daysText(g.days)} ${dayText(g.day)}`)
  if (closed.length > 0) parts.push(`${closed.map((d) => WEEKDAY_NAMES[d]).join('·')}·공휴일 휴진`)
  return parts.join(', ')
}

/**
 * 예약 주·일 보기의 시간 줄(AC-6603.2): 문 여는 요일의 가장 이른 시작을 정시로 내림 ~ 가장 늦은 끝을 정시로 올림.
 * closeHour는 끝 경계(그 시각에서 줄이 끝난다). 문 여는 날이 없으면 8~20
 */
export function calendarRange(hours: readonly DayHours[]): { openHour: number; closeHour: number } {
  const open = hours.filter((day): day is OpenDay => day !== null)
  if (open.length === 0) return { openHour: 8, closeHour: 20 }
  return {
    openHour: Math.floor(Math.min(...open.map((d) => d.open)) / 60),
    closeHour: Math.ceil(Math.max(...open.map((d) => d.close)) / 60),
  }
}

import { eachDay, weekdayOf } from '@/lib/analytics/dates'
import { HOLIDAYS } from '@/lib/analytics/holidays'
import type { DateRange } from '@/types/dates'

// 근무표 셈 (staff REQ-7605, design.md 4절). 순수 함수 — 네트워크·저장소·React를 쓰지 않는다.
// 형은 `@/types/staff`를 불러오지 않고 design.md 3절과 같은 이름·모양으로 필요한 칸만 둔다(구조가 같아 그대로 넘긴다).
// 시간은 0시부터 분(10분 단위), 날짜는 'YYYY-MM-DD', 요일 칸은 월(0)~일(6).

/** 하루 근무. null = 쉼 */
export type DayShift = { start: number; end: number; lunchFrom: number | null; lunchTo: number | null } | null
export type SatRotation = 'every' | '1-3' | '2-4'
export type OvertimeKind = 'extended' | 'night' | 'holiday'
export type LeaveKind = 'annual' | 'half' | 'family' | 'sick' | 'maternity' | 'unpaid'

export type ScheduleMember = { id: string; hiredOn: string; leftOn: string | null }
export type ScheduleWeekPlan = { staffId: string; from: string; week: readonly DayShift[]; sat: SatRotation }
export type ScheduleDayChange = { staffId: string; day: string; shift: DayShift }
export type ScheduleOvertime = { staffId: string; day: string; kind: OvertimeKind; minutes: number }
export type ScheduleLeave = { staffId: string; day: string; kind: LeaveKind }

/** 병원 정보의 진료시간(월~일, null = 휴진 요일)과 휴진일 — ClinicProfile을 그대로 넘겨도 된다 */
export type DayCtx = { hours: readonly ({ open: number; close: number } | null)[]; closedDates: readonly string[] }
export type DayKind = { holiday: boolean; closed: boolean; noHolidayList: boolean }

const DAY_MINUTES = 1440
const STEP = 10
const OVERTIME_STEP = 30
const SATURDAY = 6 // weekdayOf: 1=월 … 7=일
const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'] as const
const OVERTIME_KINDS: readonly OvertimeKind[] = ['extended', 'night', 'holiday']
const HOLIDAY_SET = new Set(HOLIDAYS)
const HOLIDAY_YEARS = HOLIDAYS.map((day) => Number(day.slice(0, 4)))
const FIRST_HOLIDAY_YEAR = Math.min(...HOLIDAY_YEARS)
const LAST_HOLIDAY_YEAR = Math.max(...HOLIDAY_YEARS)

// ── 모양 ─────────────────────────────────────────────────────

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const isMinute = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= DAY_MINUTES && value % STEP === 0

function checkShift(value: unknown): DayShift | undefined {
  if (value === null) return null
  if (!isRecord(value)) return undefined
  const { start, end, lunchFrom, lunchTo } = value
  if (!isMinute(start) || !isMinute(end) || start >= end) return undefined
  if (lunchFrom === null && lunchTo === null) return { start, end, lunchFrom: null, lunchTo: null }
  if (!isMinute(lunchFrom) || !isMinute(lunchTo)) return undefined
  if (!(start <= lunchFrom && lunchFrom < lunchTo && lunchTo <= end)) return undefined
  return { start, end, lunchFrom, lunchTo }
}

/**
 * 기본 근무 일곱 칸(월~일) 검사. 칸은 쉼(null) 또는 0~1440분·10분 단위·시작 < 끝, 점심은 둘 다 있거나 둘 다 null이고 근무 안.
 * 맞으면 네 칸만 든 새 배열, 틀리면 null (DB는 배열·길이·크기만 본다, design.md 1절)
 */
export function checkWeek(value: unknown): DayShift[] | null {
  if (!Array.isArray(value) || value.length !== WEEKDAYS.length) return null
  const week: DayShift[] = []
  for (const item of value) {
    const shift = checkShift(item)
    if (shift === undefined) return null
    week.push(shift)
  }
  return week
}

const sameShift = (a: DayShift, b: DayShift) =>
  a === null || b === null ? a === b : a.start === b.start && a.end === b.end && a.lunchFrom === b.lunchFrom && a.lunchTo === b.lunchTo

// ── 기본 근무·바뀐 날 ─────────────────────────────────────────

/** 그달 몇째 같은 요일인가(토요일이면 몇째 토요일). 1~5 */
export function nthSaturday(day: string): number {
  weekdayOf(day) // 날짜 모양 검사
  return Math.ceil(Number(day.slice(8, 10)) / 7)
}

/** 한 사람의 기본 근무 판 가운데 그날(포함) 이전 가장 늦은 시작일 판. 없으면 null */
export function planOn<P extends { from: string }>(plans: readonly P[], day: string): P | null {
  let found: P | null = null
  for (const plan of plans) if (plan.from <= day && (found === null || plan.from > found.from)) found = plan
  return found
}

const employedOn = (member: ScheduleMember, day: string) => member.hiredOn <= day && (member.leftOn === null || day <= member.leftOn)

type ShiftArgs = {
  member: ScheduleMember
  plans: readonly ScheduleWeekPlan[]
  changes: readonly ScheduleDayChange[]
  day: string
  /** 주면 휴일 날(공휴일·휴진일·휴진 요일)의 기본 근무는 쉼이다 — 그날 일하면 바뀐 날로 넣는다 */
  ctx?: DayCtx
}

// 바뀐 날을 보기 전 그날 근무(입사 전·퇴사 뒤는 쉼)
function baseShift({ member, plans, day, ctx }: ShiftArgs): DayShift {
  if (!employedOn(member, day)) return null
  if (ctx !== undefined && isRestDay(day, ctx)) return null
  const plan = planOn(plans.filter((p) => p.staffId === member.id), day)
  if (plan === null) return null
  const weekday = weekdayOf(day)
  const shift = plan.week[weekday - 1] ?? null
  if (weekday !== SATURDAY || plan.sat === 'every') return shift
  const nth = nthSaturday(day)
  return (plan.sat === '1-3' ? nth === 1 || nth === 3 : nth === 2 || nth === 4) ? shift : null
}

const changeOf = (changes: readonly ScheduleDayChange[], staffId: string, day: string) =>
  changes.find((c) => c.staffId === staffId && c.day === day)

/**
 * 그날 근무(AC-7605.1·7605.2). 입사 전·퇴사 뒤는 쉼, 그다음 바뀐 날 값이 이기고, 없으면 그날 이전 가장 늦은 판의 요일 칸
 * (토요일은 'every' 늘 · '1-3' 첫째·셋째 · '2-4' 둘째·넷째, 다섯째는 쉼)
 */
export function shiftOn(args: ShiftArgs): DayShift {
  const { member, changes, day } = args
  if (!employedOn(member, day)) return null
  const change = changeOf(changes, member.id, day)
  return change !== undefined ? change.shift : baseShift(args)
}

/** 바뀐 날이 있고 그 근무가 기본(바뀐 날을 뺀 그날 근무)과 다르면 '바꾼 날'. 메모만 있으면 아니다(AC-7605.2) */
export function isChangedDay(args: ShiftArgs): boolean {
  const change = changeOf(args.changes, args.member.id, args.day)
  if (change === undefined || !employedOn(args.member, args.day)) return false
  return !sameShift(change.shift, baseShift(args))
}

// ── 휴일 날 ──────────────────────────────────────────────────

/**
 * 날의 종류(AC-7605.3). holiday = 공휴일 목록(lib/analytics/holidays.ts), closed = 병원 휴진일 또는 휴진 요일,
 * noHolidayList = 공휴일 목록이 없는 해(목록 첫 해~끝 해 밖). holiday·closed 가운데 하나면 '휴일 날'
 */
export function dayKind(day: string, { hours, closedDates }: DayCtx): DayKind {
  const year = Number(day.slice(0, 4))
  const closedWeekday = hours[weekdayOf(day) - 1] === null
  return {
    holiday: HOLIDAY_SET.has(day),
    closed: closedWeekday || closedDates.includes(day),
    noHolidayList: year < FIRST_HOLIDAY_YEAR || year > LAST_HOLIDAY_YEAR,
  }
}

function isRestDay(day: string, ctx: DayCtx): boolean {
  const kind = dayKind(day, ctx)
  return kind.holiday || kind.closed
}

/** 휴일 날을 '일함'으로 바꿀 때 미리 채울 휴일 분 = (근무 길이 − 점심)을 30분 단위로 버림(AC-7605.4). 쉼이면 0 */
export function holidayPrefill(shift: DayShift): number {
  if (shift === null) return 0
  const lunch = shift.lunchFrom !== null && shift.lunchTo !== null ? shift.lunchTo - shift.lunchFrom : 0
  const minutes = shift.end - shift.start - lunch
  return Math.max(0, Math.floor(minutes / OVERTIME_STEP) * OVERTIME_STEP)
}

// ── 더 일한 시간 ─────────────────────────────────────────────

export type OvertimeTotals = { extended: number; night: number; holiday: number; total: number }
export type PersonOvertime = OvertimeTotals & { days: { day: string; kind: OvertimeKind; minutes: number }[] }
export type MonthOvertime = { people: Record<string, PersonOvertime>; all: OvertimeTotals }

const zeroTotals = (): OvertimeTotals => ({ extended: 0, night: 0, holiday: 0, total: 0 })

/**
 * 달('YYYY-MM') 더 일한 시간 요약(AC-7605.5): 사람마다 연장·야간·휴일·합계 분과 적은 날 목록(날짜 차례, 같은 날은 연장·야간·휴일 차례),
 * 모두 합. 적은 것이 없는 사람은 people에 없다
 */
export function monthOvertime(overtime: readonly ScheduleOvertime[], month: string): MonthOvertime {
  const people: Record<string, PersonOvertime> = {}
  const all = zeroTotals()
  for (const row of overtime) {
    if (row.day.slice(0, 7) !== month) continue
    const person = (people[row.staffId] ??= { ...zeroTotals(), days: [] })
    person[row.kind] += row.minutes
    person.total += row.minutes
    person.days.push({ day: row.day, kind: row.kind, minutes: row.minutes })
    all[row.kind] += row.minutes
    all.total += row.minutes
  }
  for (const person of Object.values(people))
    person.days.sort((a, b) => (a.day === b.day ? OVERTIME_KINDS.indexOf(a.kind) - OVERTIME_KINDS.indexOf(b.kind) : a.day < b.day ? -1 : 1))
  return { people, all }
}

/** 분 → '2시간 30분' · '4시간' · '30분' · '0시간' */
export function fmtMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (rest === 0) return `${hours}시간`
  return hours === 0 ? `${rest}분` : `${hours}시간 ${rest}분`
}

// ── 휴가 펼치기·일한 사람 수 ──────────────────────────────────

type PersonCtx = DayCtx & { member: ScheduleMember; plans: readonly ScheduleWeekPlan[]; changes: readonly ScheduleDayChange[] }

/**
 * 여러 날 휴가(시작~끝, 양 끝 포함)를 그 사람 근무가 있는 날만으로 펼친다(AC-7605.6). 공휴일·휴진일·휴진 요일은
 * 바뀐 날로 일함을 넣었어도 빠진다. 끝이 시작보다 앞이면 빈 목록
 */
export function expandLeave(range: DateRange, ctx: PersonCtx): string[] {
  const { member, plans, changes } = ctx
  return eachDay(range).filter((day) => !isRestDay(day, ctx) && shiftOn({ member, plans, changes, day, ctx }) !== null)
}

type DayCountCtx = DayCtx & {
  members: readonly ScheduleMember[]
  plans: readonly ScheduleWeekPlan[]
  changes: readonly ScheduleDayChange[]
  leaves: readonly ScheduleLeave[]
}

/** 그날 일한 사람 수(AC-7605.7) = 그날 근무가 있는 재직자 − 하루 휴가(반차 아닌 휴가)인 사람. 반차는 센다 */
export function workingCount(day: string, ctx: DayCountCtx): number {
  const { members, plans, changes, leaves } = ctx
  const away = new Set(leaves.filter((l) => l.day === day && l.kind !== 'half').map((l) => l.staffId))
  return members.filter((member) => !away.has(member.id) && shiftOn({ member, plans, changes, day, ctx }) !== null).length
}

// ── 기본 근무 요약 글 ────────────────────────────────────────

const hm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`

// 요일 칸 번호들 → '월~금' · '월·수·금' · '월~수·금' · '토·일'(이어진 세 요일부터 ~)
function dayNames(indexes: number[]): string {
  const parts: string[] = []
  let i = 0
  while (i < indexes.length) {
    let j = i
    while (j + 1 < indexes.length && indexes[j + 1] === indexes[j] + 1) j++
    if (j - i >= 2) parts.push(`${WEEKDAYS[indexes[i]]}~${WEEKDAYS[indexes[j]]}`)
    else for (let k = i; k <= j; k++) parts.push(WEEKDAYS[indexes[k]])
    i = j + 1
  }
  return parts.join('·')
}

const SAT_TEXT: Record<Exclude<SatRotation, 'every'>, string> = { '1-3': '격주 — 첫째·셋째 주', '2-4': '격주 — 둘째·넷째 주' }

/**
 * 기본 근무 요약 줄(직원 카드): 같은 근무 요일끼리 한 줄, 첫 요일 차례.
 * '월~금 09:00~18:00 (점심 13:00~14:00)' · '토 09:00~13:00 격주 — 둘째·넷째 주'(격주 토요일은 따로) · '일 쉬는 날'
 */
export function weekSummary(plan: Pick<ScheduleWeekPlan, 'week' | 'sat'>): string[] {
  const groups: { shift: DayShift; rotation: SatRotation; indexes: number[] }[] = []
  WEEKDAYS.forEach((_, index) => {
    const shift = plan.week[index] ?? null
    const rotation: SatRotation = index === SATURDAY - 1 && shift !== null ? plan.sat : 'every'
    const group = groups.find((g) => g.rotation === rotation && sameShift(g.shift, shift))
    if (group) group.indexes.push(index)
    else groups.push({ shift, rotation, indexes: [index] })
  })
  return groups.map(({ shift, rotation, indexes }) => {
    const days = dayNames(indexes)
    if (shift === null) return `${days} 쉬는 날`
    const lunch = shift.lunchFrom !== null && shift.lunchTo !== null ? ` (점심 ${hm(shift.lunchFrom)}~${hm(shift.lunchTo)})` : ''
    const sat = rotation === 'every' ? '' : ` ${SAT_TEXT[rotation]}`
    return `${days} ${hm(shift.start)}~${hm(shift.end)}${lunch}${sat}`
  })
}

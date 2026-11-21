// 연차 셈(staff REQ-7604, 근로기준법 60조 · 18조 시행령 별표2). 순수 함수 — 날짜는 lib/analytics/dates만 쓴다.
// 형은 design.md 3절과 같은 칸 이름의 자기 입력 형이다(@/types/staff를 불러오지 않음 — 구조가 같아 그대로 넘긴다).
//
// 기간(연차가 생기고 쓰이고 정산되는 한 덩어리):
// - 입사일 기준: 0번 = [입사일, 입사 1년 앞날] 달마다 1일, k번 = [입사일 + k년, + k+1년 앞날]에 annualDays(k)
// - 1월 1일 기준: 0번 = [입사일, 입사한 해 12-31], 그 뒤 해마다 [1-01, 12-31]. 달마다 1일은 생긴 날이 든 해의 기간에 들고,
//   입사 다음 해 1월 1일에 15 × (입사일~12-31 날 수) ÷ (그해 날 수), 그 뒤 1월 1일마다 annualDays(그해 − 입사한 해 − 1)
// - 퇴사하면 퇴사일이 든 기간은 퇴사일에 끝나고 그 뒤 기간은 없다. 연차는 생기는 날 재직(퇴사일 ≥ 그날)일 때만 생긴다
import { addDays, addMonthsToDay, compareYmd, diffDays, monthOf, monthRange } from '@/lib/analytics/dates'

export type LeaveBasis = 'hire' | 'jan1'
export type Leftover = 'pay' | 'carry'
export type LeaveKind = 'annual' | 'half' | 'family' | 'sick' | 'maternity' | 'unpaid'

// StaffMember에서 셈에 쓰는 칸만. id를 주면 staffId가 다른 휴가는 세지 않는다
export type LeavePerson = {
  id?: string
  employment: 'regular' | 'contract' | 'part'
  weeklyHours: number
  hiredOn: string
  leftOn: string | null
  usedBefore: number
  usedBeforeFrom: string | null
}

// Leave에서 셈에 쓰는 칸만
export type LeaveDay = { staffId?: string; day: string; kind: LeaveKind }

export type LeaveInput = { person: LeavePerson; leaves: readonly LeaveDay[]; basis: LeaveBasis; leftover: Leftover }

export type LeavePeriod = { from: string; to: string }

export type LeaveStatus = {
  period: LeavePeriod
  basis: LeaveBasis
  firstYear: boolean // 입사 1년 미만(달마다 1일이 아직 생김)
  granted: number // 이번 기간에 오늘까지 생긴 일수
  carried: number // 'carry'일 때 지난 기간에서 넘어온 일수(음수도 그대로)
  used: number // 이번 기간 연차 1 · 반차 0.5 합(앞날 포함) + 그 기간에 적은 '올해 이미 쓴 연차'
  left: number // granted + carried − used (0 밑이면 음수 그대로)
  next: { day: string; days: number; inDays: number } | null // 다음에 연차가 생기는 날. 더 생길 일이 없으면 null
  endsThisMonth: boolean // 이번 기간이 오늘이 든 달에 끝남
  previous: { from: string; to: string; granted: number; used: number; left: number; settledMonth: string | null } | null
}

const MAX_PERIODS = 200 // 무한 반복 막기(입사일 기준 200년)

// 근속 n년째(n ≥ 1) 연차: 15 + ⌊(n−1)/2⌋, 25일까지. 1년 미만은 0
export function annualDays(years: number): number {
  if (!(years >= 1)) return 0
  return Math.min(25, 15 + Math.floor((Math.floor(years) - 1) / 2))
}

// 0.5일 단위로 올림. 9.000000000000002처럼 소수 셈 찌꺼기는 먼저 지운다
export function ceilHalf(x: number): number {
  const twice = Math.round(x * 2 * 1e6) / 1e6
  return Math.ceil(twice) / 2 || 0
}

// ── 생기는 연차 ───────────────────────────────────────────

type Grant = { day: string; days: number }
type Period = { from: string; to: string; grants: Grant[] }

const within = (day: string, from: string, to: string) => compareYmd(from, day) <= 0 && compareYmd(day, to) <= 0
const employedOn = (p: LeavePerson, day: string) =>
  compareYmd(p.hiredOn, day) <= 0 && (p.leftOn === null || compareYmd(day, p.leftOn) <= 0)

// 주 15시간 미만 0, 파트타임 일수 × min(주시간, 40) ÷ 40(0.5 올림), 정규직·계약직 그대로
function byHours(p: LeavePerson, days: number): number {
  if (!(p.weeklyHours >= 15)) return 0
  if (p.employment !== 'part') return days
  return ceilHalf((days * Math.min(p.weeklyHours, 40)) / 40)
}

// 입사일 + m달(m = 1~11)마다 1일. 그 한 달 [입사일 + (m−1)달, 입사일 + m달) 안에 무급(결근)이 있으면 그 달은 없음.
// 파트타임 비례는 쌓인 합에 한 번 올리고, 그날 늘어난 만큼을 그날 생긴 일수로 둔다
function monthlyGrants(p: LeavePerson, leaves: readonly LeaveDay[]): Grant[] {
  const absences = leaves.filter((l) => l.kind === 'unpaid').map((l) => l.day)
  const grants: Grant[] = []
  let months = 0
  for (let m = 1; m <= 11; m++) {
    const day = addMonthsToDay(p.hiredOn, m)
    if (!employedOn(p, day)) break
    const start = addMonthsToDay(p.hiredOn, m - 1)
    if (absences.some((d) => within(d, start, addDays(day, -1)))) continue
    const before = byHours(p, months)
    months += 1
    grants.push({ day, days: byHours(p, months) - before })
  }
  return grants
}

// 입사한 해 12-31까지 일한 날 ÷ 그해 날 수 × 15(0.5 올림) — 1월 1일 기준 입사 다음 해 1월 1일 몫
function firstJan1Days(hiredOn: string): number {
  const year = hiredOn.slice(0, 4)
  const worked = diffDays(hiredOn, `${year}-12-31`) + 1
  const yearDays = diffDays(`${year}-01-01`, `${year}-12-31`) + 1
  return ceilHalf((15 * worked) / yearDays)
}

// 입사일부터 `until`이 든 기간 + 그다음 기간 하나(다음 새 연차를 보려고)까지. 퇴사일 뒤 기간·연차는 없다
function buildPeriods(p: LeavePerson, leaves: readonly LeaveDay[], basis: LeaveBasis, until: string): Period[] {
  const monthly = monthlyGrants(p, leaves)
  const periods: Period[] = []
  const add = (from: string, to: string, yearly: Grant | null) => {
    const grants = monthly.filter((g) => within(g.day, from, to))
    periods.push({ from, to, grants: yearly ? [yearly, ...grants] : grants })
    return compareYmd(from, until) > 0
  }

  if (basis === 'hire') {
    for (let k = 0; k < MAX_PERIODS; k++) {
      const from = addMonthsToDay(p.hiredOn, 12 * k)
      const to = addDays(addMonthsToDay(p.hiredOn, 12 * (k + 1)), -1)
      if (add(from, to, k === 0 ? null : { day: from, days: byHours(p, annualDays(k)) })) break
    }
  } else {
    // 입사한 해 기간은 달마다 1일만이라 늘 다음 해(1월 1일 몫)까지 만든다
    const hiredYear = Number(p.hiredOn.slice(0, 4))
    add(p.hiredOn, `${hiredYear}-12-31`, null)
    for (let y = hiredYear + 1; y < hiredYear + MAX_PERIODS; y++) {
      const from = `${y}-01-01`
      const full = y === hiredYear + 1 ? firstJan1Days(p.hiredOn) : annualDays(y - hiredYear - 1)
      if (add(from, `${y}-12-31`, { day: from, days: byHours(p, full) })) break
    }
  }

  const leftOn = p.leftOn
  if (leftOn === null) return periods
  return periods
    .filter((period, i) => i === 0 || compareYmd(period.from, leftOn) <= 0)
    .map((period) =>
      compareYmd(leftOn, period.to) < 0
        ? { from: period.from, to: leftOn, grants: period.grants.filter((g) => compareYmd(g.day, leftOn) <= 0) }
        : period,
    )
}

// ── 쓴 연차·기간 장부 ─────────────────────────────────────

const ownLeaves = ({ person, leaves }: Pick<LeaveInput, 'person' | 'leaves'>) =>
  person.id === undefined ? leaves : leaves.filter((l) => l.staffId === undefined || l.staffId === person.id)

const leaveDays = (l: LeaveDay) => (l.kind === 'annual' ? 1 : l.kind === 'half' ? 0.5 : 0)

function usedIn(period: Period, p: LeavePerson, leaves: readonly LeaveDay[]): number {
  let used = 0
  for (const l of leaves) if (within(l.day, period.from, period.to)) used += leaveDays(l)
  if (p.usedBeforeFrom !== null && within(p.usedBeforeFrom, period.from, period.to)) used += p.usedBefore
  return used
}

type Row = { from: string; to: string; granted: number; carried: number; used: number; left: number }

// `asOf`가 든 기간(입사 전이면 첫 기간, 퇴사 뒤면 마지막 기간)까지 차례로 셈한다. 그 기간은 asOf까지 생긴 것만 센다
function ledger(input: LeaveInput, asOf: string) {
  const leaves = ownLeaves(input)
  const periods = buildPeriods(input.person, leaves, input.basis, asOf)
  let index = periods.findIndex((period) => within(asOf, period.from, period.to))
  if (index < 0) index = compareYmd(asOf, input.person.hiredOn) < 0 ? 0 : periods.length - 1
  const rows: Row[] = []
  let carried = 0
  for (let i = 0; i <= index; i++) {
    const period = periods[i]
    const cut = i === index ? asOf : period.to
    const granted = period.grants.filter((g) => compareYmd(g.day, cut) <= 0).reduce((sum, g) => sum + g.days, 0)
    const used = usedIn(period, input.person, leaves)
    const left = granted + carried - used
    rows.push({ from: period.from, to: period.to, granted, carried, used, left })
    carried = input.leftover === 'carry' ? left : 0
  }
  return { periods, rows, index }
}

// ── 내보내는 셈 ───────────────────────────────────────────

export function leaveStatus(input: LeaveInput & { today: string }): LeaveStatus {
  const { today, person, leftover } = input
  const { periods, rows, index } = ledger(input, today)
  const row = rows[index]
  // 다음에 생기는 날과 그날 생기는 일수의 합(1월 1일 몫과 달마다 1일이 같은 날일 수 있다)
  const later = periods
    .slice(index)
    .flatMap((period) => period.grants)
    .filter((g) => g.days > 0 && compareYmd(today, g.day) < 0)
  const nextDay = later.map((g) => g.day).sort(compareYmd)[0]
  const nextDays = later.filter((g) => g.day === nextDay).reduce((sum, g) => sum + g.days, 0)
  const prev = index > 0 ? rows[index - 1] : null
  return {
    period: { from: row.from, to: row.to },
    basis: input.basis,
    firstYear: compareYmd(today, addMonthsToDay(person.hiredOn, 12)) < 0,
    granted: row.granted,
    carried: row.carried,
    used: row.used,
    left: row.left,
    next: nextDay === undefined ? null : { day: nextDay, days: nextDays, inDays: diffDays(today, nextDay) },
    endsThisMonth: compareYmd(today, row.to) <= 0 && monthOf(row.to) === monthOf(today),
    previous: prev && {
      from: prev.from,
      to: prev.to,
      granted: prev.granted,
      used: prev.used,
      left: prev.left,
      settledMonth: leftover === 'pay' ? monthOf(prev.to) : null,
    },
  }
}

// 그달에 끝난 기간의 정산 일수(0 밑이면 0). 'pay'면 기간 끝마다, 퇴사로 끝난 기간은 넘길 곳이 없어 'carry'도 정산한다.
// 그달에 끝난 기간이 없으면(또는 'carry'로 넘겼으면) null
export function settleInMonth(input: LeaveInput & { month: string }): number | null {
  const { rows } = ledger(input, monthRange(input.month).to)
  const leftOn = input.person.leftOn
  let total: number | null = null
  for (const row of rows) {
    if (monthOf(row.to) !== input.month) continue
    if (input.leftover !== 'pay' && row.to !== leftOn) continue
    total = (total ?? 0) + Math.max(0, row.left)
  }
  return total
}

// 그날 기준 그날이 든 기간의 남은 일수(그날까지 생긴 것 + 넘어옴 − 그 기간 쓴 것). 입사 전이면 null, 퇴사 뒤면 퇴사일 기준
export function remainingAt(input: LeaveInput, day: string): number | null {
  if (compareYmd(day, input.person.hiredOn) < 0) return null
  const leftOn = input.person.leftOn
  const at = leftOn !== null && compareYmd(leftOn, day) < 0 ? leftOn : day
  const { rows, index } = ledger(input, at)
  return rows[index].left
}

// 1월 1일 기준 퇴사자: 입사~퇴사 동안 입사일 기준으로 생겼을 합 − 1월 1일 기준으로 생긴 합(0 밑이면 0).
// 입사일 기준이거나 퇴사일이 없으면 0
export function retireGap(input: Pick<LeaveInput, 'person' | 'leaves' | 'basis'>): number {
  const { person } = input
  const leftOn = person.leftOn
  if (input.basis !== 'jan1' || leftOn === null) return 0
  const leaves = ownLeaves(input)
  const total = (basis: LeaveBasis) =>
    buildPeriods(person, leaves, basis, leftOn)
      .flatMap((period) => period.grants)
      .reduce((sum, g) => sum + g.days, 0)
  return Math.max(0, total('hire') - total('jan1'))
}

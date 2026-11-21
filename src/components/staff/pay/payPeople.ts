import { monthOf, monthRange } from '@/lib/analytics/dates'
import { leaveStatus, remainingAt, settleInMonth, type LeaveInput } from '@/lib/staff/leave'
import { dayKind, type DayCtx, type MonthOvertime } from '@/lib/staff/schedule'
import type { TaxInput, TaxPerson } from '@/lib/staff/taxExcel'
import type { Leave, PayItem, PayLine, StaffMember, StaffSettings } from '@/types/staff'

// 급여 화면이 사람마다 모으는 값 (staff AC-7615.7·AC-7615.10): 세무사 엑셀 한 사람 줄(taxExcel.ts TaxPerson)과 명세서의 휴가·남은 연차.
// 셈은 lib/staff(leave·schedule·taxExcel)가 하고 여기서는 그달 값만 골라 넘긴다. 순수 함수다

const leaveInput = (member: StaffMember, leaves: readonly Leave[], settings: StaffSettings): LeaveInput => ({
  person: member,
  leaves: leaves.filter((leave) => leave.staffId === member.id),
  basis: settings.leaveBasis,
  leftover: settings.leftover,
})

/** 그 사람의 그달 휴가 줄(날짜 차례) */
export function monthLeaves(leaves: readonly Leave[], staffId: string, month: string): Leave[] {
  return leaves.filter((leave) => leave.staffId === staffId && monthOf(leave.day) === month).sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))
}

/** 그달 끝날 기준 남은 연차(remainingAt). 입사 전이면 null */
export function remainingIn(member: StaffMember, leaves: readonly Leave[], settings: StaffSettings, month: string): number | null {
  return remainingAt(leaveInput(member, leaves, settings), monthRange(month).to)
}

/** 그달에 끝난 연차 기간의 끝날과 정산 일수(settleInMonth). 끝난 기간이 없으면 null */
export function settledIn(member: StaffMember, leaves: readonly Leave[], settings: StaffSettings, month: string): TaxPerson['settled'] {
  const input = leaveInput(member, leaves, settings)
  const days = settleInMonth({ ...input, month })
  if (days === null) return null
  const monthEnd = monthRange(month).to
  const status = leaveStatus({ ...input, today: monthEnd })
  const ends = [status.previous?.to, status.period.to, member.leftOn].filter((day): day is string => typeof day === 'string' && monthOf(day) === month && day <= monthEnd).sort()
  return { end: ends[ends.length - 1] ?? monthEnd, days }
}

/** 세무사 엑셀 입력(AC-7615.7): 그달 재직자를 명단 차례로. 그달 줄이 없으면 line null, 더 일한 시간이 없으면 0 */
export function taxInput(args: {
  month: string
  hospitalName: string
  items: readonly PayItem[]
  members: readonly StaffMember[]
  lines: readonly PayLine[]
  overtime: MonthOvertime
  leaves: readonly Leave[]
  settings: StaffSettings
  days: DayCtx
}): TaxInput {
  const { month, members, lines, overtime, leaves, settings, days } = args
  const people = members.map((member): TaxPerson => {
    const hours = overtime.people[member.id]
    const holidayWork = (hours?.days ?? [])
      .filter((row) => row.kind === 'holiday' && row.minutes > 0)
      .map((row) => ({ day: row.day, kind: dayKind(row.day, days).holiday ? ('public' as const) : ('closed' as const) }))
    return {
      member,
      line: lines.find((line) => line.month === month && line.staffId === member.id) ?? null,
      overtime: { extended: hours?.extended ?? 0, night: hours?.night ?? 0, holiday: hours?.holiday ?? 0 },
      holidayWork,
      leaves: monthLeaves(leaves, member.id, month).map((leave) => ({ day: leave.day, kind: leave.kind, part: leave.part, paid: leave.paid })),
      remaining: remainingIn(member, leaves, settings, month),
      settled: settledIn(member, leaves, settings, month),
    }
  })
  return { month, hospitalName: args.hospitalName, items: args.items, people }
}

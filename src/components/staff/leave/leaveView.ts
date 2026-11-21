import { addDays, addMonths, compareYmd, diffDays, eachDay, isYmd, monthOf, monthRange, weekdayOf, weekStartOf } from '@/lib/analytics/dates'
import { leaveStatus, type LeaveStatus } from '@/lib/staff/leave'
import { dayKind, expandLeave, type DayCtx } from '@/lib/staff/schedule'
import type { LeaveDraft } from '@/lib/storage/staff'
import type { ClinicProfile, ClinicStaff } from '@/types/clinicProfile'
import type { DayChange, Leave, LeaveKind, StaffMember, StaffSettings, WeekPlan } from '@/types/staff'
import { LEAVE_KIND_LABEL } from '../labels'

// 휴가 화면(staff REQ-7614)이 그리기 전에 하는 작은 셈과 글 모양. 연차 셈은 lib/staff/leave, 쉬는 날은 lib/staff/schedule을 그대로 부르고
// 여기서는 화면 글('9.5일'·'2026-08-03 (월) ~ 08-05 (수)')·표 줄 묶기·미리 보기 숫자만 만든다. 네트워크·저장소를 쓰지 않는다

const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'] as const

export const weekdayName = (day: string) => WEEKDAYS[weekdayOf(day) - 1]
/** '2026-11-28 (토)' */
export const withWeekday = (day: string) => `${day} (${weekdayName(day)})`
/** '11-28' */
export const mmdd = (day: string) => day.slice(5)
/** 9.5 → '9.5일' (−0은 0) */
export const fmtDays = (n: number) => `${n === 0 ? 0 : n}일`
/** 하루 '2026-10-23 (금)', 여러 날 '2026-08-03 (월) ~ 08-05 (수)' (AC-7614.4) */
export const rangeText = (from: string, to: string) => (from === to ? withWeekday(from) : `${withWeekday(from)} ~ ${mmdd(to)} (${weekdayName(to)})`)
/** '2026년 11월' */
export const monthTitle = (month: string) => `${month.slice(0, 4)}년 ${Number(month.slice(5, 7))}월`
/** '11월 26일 (목)' */
export const dayLabel = (day: string) => `${Number(day.slice(5, 7))}월 ${Number(day.slice(8, 10))}일 (${weekdayName(day)})`

/** 연차에서 빼는 일수: 연차 1 · 반차 0.5, 나머지 0 (AC-7604.6) */
export const deductOf = (kind: LeaveKind) => (kind === 'annual' ? 1 : kind === 'half' ? 0.5 : 0)

export const isActive = (m: Pick<StaffMember, 'leftOn'>, today: string) => m.leftOn === null || m.leftOn >= today

/** 병원 정보 → 쉬는 날 셈에 넘기는 값(진료시간·휴진일) */
export const dayCtxOf = (profile: Pick<ClinicProfile, 'hours' | 'closedDates'>): DayCtx => ({ hours: profile.hours, closedDates: profile.closedDates })

/** 예약 시행자 연결: 직원의 시행자 id가 병원 정보 원장님·직원 목록에 있을 때만(예약 '휴무'를 만드는 DB 트리거와 같은 조건, AC-7602.2) */
export function linkOf(member: Pick<StaffMember, 'calendarStaffId'>, staff: readonly ClinicStaff[]): ClinicStaff | null {
  if (member.calendarStaffId === null) return null
  return staff.find((s) => s.id === member.calendarStaffId) ?? null
}

/** 한 사람 연차(오늘 기준) */
export function statusOf(member: StaffMember, leaves: readonly Leave[], settings: Pick<StaffSettings, 'leaveBasis' | 'leftover'>, today: string): LeaveStatus {
  return leaveStatus({ person: member, leaves, basis: settings.leaveBasis, leftover: settings.leftover, today })
}

/** 남은 비율 % = 남은 ÷ (생긴 + 넘어옴) 반올림. 생긴 것이 없으면 null (AC-7614.1) */
export function ratioOf(status: Pick<LeaveStatus, 'granted' | 'carried' | 'left'>): number | null {
  const total = status.granted + status.carried
  return total > 0 ? Math.round((status.left / total) * 100) : null
}

/** 다음 새 연차 글: '{YYYY-MM-DD}' + '· {n}일'(1년 미만이고 이번 기간 안이면 '· {n}일 더'), 7일 안이면 '{n}일 뒤' (AC-7614.1) */
export function nextOf(status: Pick<LeaveStatus, 'next' | 'firstYear' | 'period'>): { day: string; tail: string; soon: string | null } | null {
  const { next } = status
  if (next === null) return null
  const more = status.firstYear && compareYmd(next.day, status.period.to) <= 0
  return { day: next.day, tail: more ? `· ${next.days}일 더` : `· ${next.days}일`, soon: next.inDays <= 7 ? `${next.inDays}일 뒤` : null }
}

const MAX_SPAN = 731 // 한 번에 넣는 휴가는 2년까지(그보다 길면 셀 날이 없다고 본다)

/**
 * 휴가로 셀 날(AC-7614.3·AC-7605.6): 그 사람 근무표에서 일하는 날만 — 쉬는 요일·공휴일·휴진일은 뺀다(바뀐 날 반영).
 * 기본 근무가 아직 없는 사람은 근무표로 쉬는 요일을 알 수 없어 공휴일·휴진일만 빼고 재직한 날을 센다
 */
export function countableDays(
  member: StaffMember,
  from: string,
  to: string,
  ctx: { plans: readonly WeekPlan[]; changes: readonly DayChange[]; day: DayCtx },
): string[] {
  if (!isYmd(from) || !isYmd(to) || compareYmd(from, to) > 0 || diffDays(from, to) > MAX_SPAN) return []
  const plans = ctx.plans.filter((p) => p.staffId === member.id)
  if (plans.length === 0) {
    return eachDay({ from, to }).filter((day) => {
      const kind = dayKind(day, ctx.day)
      const employed = member.hiredOn <= day && (member.leftOn === null || day <= member.leftOn)
      return employed && !kind.holiday && !kind.closed
    })
  }
  const changes = ctx.changes.filter((c) => c.staffId === member.id)
  return expandLeave({ from, to }, { ...ctx.day, member, plans, changes })
}

/** 넣을 줄(AC-7610.2): 반차만 part, 유급 표시는 병가만 고른 값(무급(결근)은 늘 무급, 나머지는 늘 유급), 메모는 앞뒤 빈칸을 빼고 비면 null */
export function draftRows(
  staffId: string,
  days: readonly string[],
  pick: { kind: LeaveKind; part: 'am' | 'pm'; paid: boolean; memo: string },
): LeaveDraft[] {
  const memo = pick.memo.trim() || null
  return days.map((day) => ({
    staffId,
    day,
    kind: pick.kind,
    part: pick.kind === 'half' ? pick.part : null,
    paid: pick.kind === 'sick' ? pick.paid : pick.kind !== 'unpaid',
    memo,
  }))
}

/** 저장 전·뒤 남은 연차(고치기면 그 묶음을 빼고 새 줄을 넣어 셈) — 미리 보기 '{a}일 → {b}일' */
export function leftBeforeAfter(
  member: StaffMember,
  leaves: readonly Leave[],
  settings: Pick<StaffSettings, 'leaveBasis' | 'leftover'>,
  today: string,
  replace: { groupId: string | null; rows: readonly LeaveDraft[] },
): { before: number; after: number } {
  const own = leaves.filter((l) => l.staffId === member.id)
  const kept = replace.groupId === null ? own : own.filter((l) => l.groupId !== replace.groupId)
  const added: Leave[] = replace.rows.map((row, i) => ({ ...row, id: `draft-${i}`, groupId: 'draft' }))
  return { before: statusOf(member, own, settings, today).left, after: statusOf(member, [...kept, ...added], settings, today).left }
}

// ── 한 사람 기록 ─────────────────────────────────────────────

export type RecordRow = { groupId: string; from: string; to: string; kind: LeaveKind; part: 'am' | 'pm' | null; count: number; memo: string | null; leaves: Leave[] }

/** 이번 기간 쓴 휴가를 묶음마다 한 줄로, 최근 날부터 (AC-7614.4) */
export function recordRows(staffId: string, leaves: readonly Leave[], period: { from: string; to: string }): RecordRow[] {
  const groups = new Map<string, Leave[]>()
  for (const l of leaves) {
    if (l.staffId !== staffId || compareYmd(l.day, period.from) < 0 || compareYmd(l.day, period.to) > 0) continue
    const list = groups.get(l.groupId)
    if (list) list.push(l)
    else groups.set(l.groupId, [l])
  }
  const rows = [...groups.entries()].map(([groupId, list]): RecordRow => {
    const sorted = [...list].sort((a, b) => compareYmd(a.day, b.day))
    const first = sorted[0]
    return { groupId, from: first.day, to: sorted[sorted.length - 1].day, kind: first.kind, part: first.part, count: sorted.length, memo: first.memo, leaves: sorted }
  })
  return rows.sort((a, b) => compareYmd(b.from, a.from))
}

/** 표 '일수' 칸 숫자: 반차는 0.5일씩 */
export const rowDays = (row: Pick<RecordRow, 'kind' | 'count'>) => (row.kind === 'half' ? row.count * 0.5 : row.count)

/** '연차·반차 합계 {n}일 · {다른 종류} {n}일'(+ 이번 기간에 든 올해 이미 쓴 연차) */
export function recordSummary(rows: readonly RecordRow[], usedBefore: number): string {
  const deducted = rows.reduce((sum, row) => sum + (deductOf(row.kind) > 0 ? rowDays(row) : 0), 0)
  const parts = [`연차·반차 합계 ${fmtDays(deducted)}`]
  for (const kind of ['family', 'sick', 'maternity', 'unpaid'] as const) {
    const n = rows.filter((row) => row.kind === kind).reduce((sum, row) => sum + row.count, 0)
    if (n > 0) parts.push(`${LEAVE_KIND_LABEL[kind]} ${fmtDays(n)}`)
  }
  if (usedBefore > 0) parts.push(`올해 이미 쓴 연차 ${fmtDays(usedBefore)}`)
  return parts.join(' · ')
}

/** 이번 기간 쓴 연차에 든 '올해 이미 쓴 연차'(그 값을 적은 날이 이번 기간 안일 때만, AC-7604.6) */
export function usedBeforeIn(member: Pick<StaffMember, 'usedBefore' | 'usedBeforeFrom'>, period: { from: string; to: string }): number {
  const at = member.usedBeforeFrom
  return at !== null && compareYmd(period.from, at) <= 0 && compareYmd(at, period.to) <= 0 ? member.usedBefore : 0
}

// ── 이번 달 연차 기간 끝 안내 (AC-7614.6, 시안 ⑥ 나) ────────────

export type NoticePerson = { id: string; name: string; end: string; days: number; ended: boolean }
export type EndNotice = { kind: 'pay'; people: NoticePerson[]; firstEnd: string | null } | { kind: 'carry' } | null

/**
 * 오늘이 든 달에 연차 기간이 끝나는(또는 이미 끝난) 재직자. 끝나기 전은 지금 남은 일수, 끝난 뒤는 끝난 기간 남은 일수(0 밑이면 0).
 * 'carry'면 사람 목록 대신 한 줄. 그런 사람이 없으면 null
 */
export function endNotice(rows: readonly { member: StaffMember; status: LeaveStatus }[], leftover: StaffSettings['leftover'], today: string): EndNotice {
  const month = monthOf(today)
  const people = rows.flatMap(({ member, status }): NoticePerson[] => {
    if (status.endsThisMonth) return [{ id: member.id, name: member.name, end: status.period.to, days: Math.max(0, status.left), ended: false }]
    const prev = status.previous
    if (prev !== null && monthOf(prev.to) === month && compareYmd(prev.to, today) < 0)
      return [{ id: member.id, name: member.name, end: prev.to, days: Math.max(0, prev.left), ended: true }]
    return []
  })
  if (people.length === 0) return null
  if (leftover === 'carry') return { kind: 'carry' }
  const pending = people.filter((p) => !p.ended).map((p) => p.end)
  pending.sort(compareYmd)
  return { kind: 'pay', people, firstEnd: pending[0] ?? null }
}

// ── 달력 ─────────────────────────────────────────────────────

/** 그달을 덮는 월~일 주들의 날(월요일부터) */
export function monthDays(month: string): string[] {
  const { from, to } = monthRange(month)
  return eachDay({ from: weekStartOf(from), to: addDays(weekStartOf(to), 6) })
}

/** 휴가를 한 번에 읽을 범위: 가장 이른 입사일(또는 보는 달 첫 주)부터 오늘 + 2년(또는 보는 달 끝 주)까지 */
export function loadRange(members: readonly Pick<StaffMember, 'hiredOn'>[], today: string, month: string): { from: string; to: string } {
  const days = monthDays(month)
  const starts = [days[0], ...members.map((m) => m.hiredOn)].sort(compareYmd)
  const ends = [addDays(today, MAX_SPAN), days[days.length - 1]].sort(compareYmd)
  return { from: starts[0], to: ends[ends.length - 1] }
}

export const shiftMonth = (month: string, n: number) => addMonths(month, n)

'use client'

import { useId } from 'react'
import { LEAVE_CHIP, OVERTIME_KIND_LABEL, leaveLabel } from '@/components/staff/labels'
import { TableScroll } from '@/components/staff/TableScroll'
import { ds } from '@/components/ui/classes'
import { addDays, eachDay, monthRange, weekStartOf } from '@/lib/analytics/dates'
import { employedIn } from '@/lib/staff/roster'
import { dayKind, fmtMinutes, monthOvertime, workingCount, type DayCtx, type OvertimeTotals } from '@/lib/staff/schedule'
import type { DayChange, Leave, Overtime, StaffMember, WeekPlan } from '@/types/staff'
import { WEEKDAYS, dateNum, dayTitle, monthName, restName, shortDay, weekdayName } from './format'
import { REST_HOVER, REST_SHADE } from './parts'

// 달 보기 (staff AC-7613.2, 시안 schedule.html ②·⑤). 월~일 7칸 달력에 날마다 일한 사람 수(AC-7605.7)·휴가 칩,
// 그 아래 이달 휴가 목록과 '{M}월 더 일한 시간' 표(AC-7605.5 — 요약에 없는 사람은 0으로). 날짜를 누르면 그 주 주 보기(onDay).
// 모양은 예약 달력 월 보기(components/calendar/MonthGrid)와 같은 틀이다. 달 밖 날은 숫자만(누를 수 없음)

/** 달력이 덮는 주 전부(첫 주 월요일 ~ 끝 주 일요일) */
export function monthGridRange(month: string): { from: string; to: string } {
  const { from, to } = monthRange(month)
  return { from: weekStartOf(from), to: addDays(weekStartOf(to), 6) }
}

type MonthViewProps = {
  month: string
  today: string
  members: readonly StaffMember[]
  plans: readonly WeekPlan[]
  changes: readonly DayChange[]
  overtime: readonly Overtime[]
  leaves: readonly Leave[]
  ctx: DayCtx
  onDay(day: string): void
}

const dash = (minutes: number) => (minutes > 0 ? fmtMinutes(minutes) : '–')

export function MonthView({ month, today, members, plans, changes, overtime, leaves, ctx, onDay }: MonthViewProps) {
  const range = monthRange(month)
  const days = eachDay(monthGridRange(month))
  const order = new Map(members.map((member, index) => [member.id, index]))
  const nameOf = new Map(members.map((member) => [member.id, member.name]))
  // 이달 휴가(명단에 있는 사람만): 날 차례, 같은 날은 명단 차례
  const monthLeaves = leaves
    .filter((l) => l.day >= range.from && l.day <= range.to && nameOf.has(l.staffId))
    .sort((a, b) => (a.day === b.day ? order.get(a.staffId)! - order.get(b.staffId)! : a.day < b.day ? -1 : 1))

  return (
    <div className="flex flex-col gap-4">
      <p className="text-small text-ink-2">칸의 숫자는 그날 일한 사람 수예요. 하루 휴가는 빼고, 반차는 넣어서 세요.</p>
      {/* 폰 전용 모양 없음: 좁으면 이 칸만 옆으로 밀리고 달력은 최소 폭을 지킨다(휴가 달력과 같다, AC-7611.4) */}
      <TableScroll label="달 근무표 칸">
        <section aria-label="달 근무표" className="min-w-190 overflow-clip rounded-control border border-line bg-surface">
          <div className="grid grid-cols-7 border-b border-line bg-canvas">
            {WEEKDAYS.map((w) => (
              <span key={w} className="px-2 py-1.5 text-caption font-semibold text-muted">
                {w}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((day, i) => {
              const edge = (i + 1) % 7 ? 'border-r' : ''
              if (day < range.from || day > range.to) {
                return (
                  <div key={day} className={`min-h-24 border-b border-line bg-canvas/60 px-2 pt-1.5 text-small font-semibold text-muted tabular-nums ${edge}`}>
                    {dateNum(day)}
                  </div>
                )
              }
              const kind = dayKind(day, ctx)
              const rest = restName(kind)
              const count = workingCount(day, { ...ctx, members, plans, changes, leaves })
              const status = rest === null ? `${count}명` : count > 0 ? `${rest} ${count}명` : rest
              const isToday = day === today
              const chips = monthLeaves.filter((l) => l.day === day).map((l) => ({ id: l.id, kind: l.kind, text: `${leaveLabel(l.kind, l.part)} ${nameOf.get(l.staffId)}` }))
              return (
                <button
                  key={day}
                  type="button"
                  aria-label={[dayTitle(day), ...(isToday ? ['오늘'] : []), status, ...chips.map((c) => c.text)].join(' ')}
                  aria-current={isToday ? 'date' : undefined}
                  data-rest={rest !== null ? 'true' : undefined}
                  onClick={() => onDay(day)}
                  className={`flex min-h-24 min-w-0 cursor-pointer flex-col items-start gap-1 border-b border-line px-2 pt-1.5 pb-2 text-left ${
                    rest !== null ? `${REST_SHADE} ${REST_HOVER}` : 'hover:bg-canvas'
                  } ${isToday ? 'ring-2 ring-accent ring-inset' : ''} ${edge} ${ds.focusRing}`}
                >
                  <span className={`text-small font-semibold tabular-nums ${isToday ? 'text-accent' : 'text-ink'}`}>
                    {dateNum(day)}
                    {isToday ? <span className="text-caption font-medium"> 오늘</span> : null}
                  </span>
                  <span className={`text-small tabular-nums ${rest !== null && count === 0 ? 'text-muted' : 'text-ink'}`}>{status}</span>
                  {chips.map((chip) => (
                    <span key={chip.id} className={LEAVE_CHIP[chip.kind]}>
                      {chip.text}
                    </span>
                  ))}
                </button>
              )
            })}
          </div>
        </section>
      </TableScroll>
      {monthLeaves.length > 0 ? (
        <ul aria-label="이달 휴가" className="flex flex-col gap-1.5 text-small text-ink">
          {monthLeaves.map((l) => (
            <li key={l.id} className="flex items-center gap-2">
              <b className="font-semibold tabular-nums">{shortDay(l.day)}</b> <span className={LEAVE_CHIP[l.kind]}>{leaveLabel(l.kind, l.part)}</span> {nameOf.get(l.staffId)}
            </li>
          ))}
        </ul>
      ) : null}
      <OvertimeTable month={month} members={members} overtime={overtime} ctx={ctx} />
    </div>
  )
}

// ── ⑤ 이달 더 일한 시간 ──────────────────────────────────────

const ZERO: OvertimeTotals = { extended: 0, night: 0, holiday: 0, total: 0 }

function OvertimeTable({ month, members, overtime, ctx }: { month: string; members: readonly StaffMember[]; overtime: readonly Overtime[]; ctx: DayCtx }) {
  const titleId = useId()
  const summary = monthOvertime(overtime, month)
  const title = `${monthName(month)} 더 일한 시간`
  // 그달 재직자(명단 차례) + 적은 것이 있는 사람
  const rows = members.filter((member) => employedIn(member, month) || summary.people[member.id] !== undefined)
  // 내역 '{d}일 ({요일}) {종류} {시간}' — 휴진일·공휴일이면 요일 뒤에 그 이름(시안 '15일 (일, 휴진일) 휴일 4시간')
  const detail = (day: string) => {
    const rest = restName(dayKind(day, ctx))
    return `${dateNum(day)}일 (${weekdayName(day)}${rest === '휴진' ? ', 휴진일' : rest === '공휴일' ? ', 공휴일' : ''})`
  }
  const th = 'h-10 whitespace-nowrap border-b border-line px-3 text-left font-medium text-muted first:pl-5 last:pr-5'
  const cellBase = 'h-11 whitespace-nowrap border-b border-line tabular-nums'
  const num = `${cellBase} px-3`
  const numLast = `${cellBase} pr-5 pl-3` // 끝 칸 오른쪽 20px = 표 안쪽(ds.table과 같다)
  const zeroTone = (minutes: number) => (minutes > 0 ? 'text-ink' : 'text-muted')
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3">
      <h2 id={titleId} className="text-subtitle font-semibold text-ink">
        {title}
      </h2>
      <TableScroll label={title}>
        <table aria-label={title} className={`${ds.table.table} min-w-160 rounded-control border border-line bg-surface`}>
          <thead>
            <tr>
              {['이름', '연장', '야간', '휴일', '합계'].map((head) => (
                <th key={head} scope="col" className={th}>
                  {head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((member) => {
              const person = summary.people[member.id]
              const totals = person ?? ZERO
              const days = person?.days ?? []
              return (
                <tr key={member.id}>
                  <th scope="row" className="border-b border-line py-2 pr-3 pl-5 text-left align-top font-normal">
                    <span className="font-semibold text-ink">{member.name}</span>
                    {days.length > 0 ? (
                      <>
                        {' '}
                        <span className="block text-caption text-muted">{days.map((d) => `${detail(d.day)} ${OVERTIME_KIND_LABEL[d.kind]} ${fmtMinutes(d.minutes)}`).join(' · ')}</span>
                      </>
                    ) : null}
                  </th>
                  <td className={`${num} ${zeroTone(totals.extended)}`}>{dash(totals.extended)}</td>
                  <td className={`${num} ${zeroTone(totals.night)}`}>{dash(totals.night)}</td>
                  <td className={`${num} ${zeroTone(totals.holiday)}`}>{dash(totals.holiday)}</td>
                  <td className={`${numLast} font-semibold ${zeroTone(totals.total)}`}>{dash(totals.total)}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="bg-canvas font-semibold text-ink">
              <th scope="row" className="h-11 py-2 pr-3 pl-5 text-left">
                모두
              </th>
              <td className="h-11 px-3 tabular-nums">{dash(summary.all.extended)}</td>
              <td className="h-11 px-3 tabular-nums">{dash(summary.all.night)}</td>
              <td className="h-11 px-3 tabular-nums">{dash(summary.all.holiday)}</td>
              <td className="h-11 pr-5 pl-3 tabular-nums">{dash(summary.all.total)}</td>
            </tr>
          </tfoot>
        </table>
      </TableScroll>
      <p className="text-small text-ink-2">💡 이 시간은 급여 화면과 세무사 자료에 자동으로 들어가요.</p>
    </section>
  )
}

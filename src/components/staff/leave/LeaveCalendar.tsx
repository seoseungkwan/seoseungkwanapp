'use client'

import { ds } from '@/components/ui/classes'
import { monthOf } from '@/lib/analytics/dates'
import { dayKind } from '@/lib/staff/schedule'
import type { ClinicProfile } from '@/types/clinicProfile'
import type { Leave, StaffMember } from '@/types/staff'
import { LEAVE_CHIP, LEAVE_KIND_LABEL, leaveLabel } from '../labels'
import { TableScroll } from '../TableScroll'
import { dayCtxOf, dayLabel, linkOf, monthDays, monthTitle } from './leaveView'

// 휴가 달력 (staff AC-7614.2, 시안 leave.html ②). 연차 현황 표 아래 달 보기: 월~일 7칸으로 그 달을 덮는 주 전부(예약 달력 MonthGrid와 같은 모양).
// 칸에 '{이름} {종류}' 칩(휴가 종류 색 = 예약 달력 색 토큰, labels.ts LEAVE_CHIP), 예약 시행자와 이어진 사람은 노란 '예약 휴무'(반차면 '· 오전'·'· 오후').
// 공휴일·휴진일(병원 정보 휴진 요일·휴진일)은 회색 칸. 날짜 칸을 누르면 그날로 휴가 넣기, 칩을 누르면 그 휴가 고치기다.
// 칸 전체가 '휴가 넣기' 단추이고(칸 위에 깔림) 칩은 그 위에 따로 놓인 단추다(단추 안에 단추를 두지 않는다).
// 넓은 달력이라 화면이 좁으면 이 칸만 옆으로 밀린다(TableScroll, AC-7611.4)

const WEEK_HEAD = ['월', '화', '수', '목', '금', '토', '일']
const LEGEND = (['annual', 'half', 'family', 'sick', 'maternity', 'unpaid'] as const).map((kind) => ({ kind, text: LEAVE_KIND_LABEL[kind] }))

type LeaveCalendarProps = {
  month: string // 'YYYY-MM'
  today: string
  leaves: readonly Leave[]
  /** 모든 직원(퇴사자 포함) — 칩 이름과 차례 */
  members: readonly StaffMember[]
  profile: ClinicProfile
  onMonth(step: -1 | 1): void
  onThisMonth(): void
  onDay(day: string): void
  onChip(leave: Leave): void
}

export function LeaveCalendar({ month, today, leaves, members, profile, onMonth, onThisMonth, onDay, onChip }: LeaveCalendarProps) {
  const ctx = dayCtxOf(profile)
  const days = monthDays(month)
  const order = new Map(members.map((m, i) => [m.id, i]))
  const byDay = new Map<string, Leave[]>()
  for (const l of leaves) {
    if (!order.has(l.staffId) || monthOf(l.day) !== month) continue
    const list = byDay.get(l.day)
    if (list) list.push(l)
    else byDay.set(l.day, [l])
  }
  for (const list of byDay.values()) list.sort((a, b) => (order.get(a.staffId) ?? 0) - (order.get(b.staffId) ?? 0))
  const memberOf = new Map(members.map((m) => [m.id, m]))
  const weeks: string[][] = []
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7))
  const noList = dayKind(`${month}-01`, ctx).noHolidayList

  return (
    <section aria-label="휴가 달력" className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <button type="button" aria-label="지난달" onClick={() => onMonth(-1)} className={ds.button.secondarySmall}>
            ‹
          </button>
          <h2 className="text-subtitle font-semibold text-ink tabular-nums">{monthTitle(month)}</h2>
          <button type="button" aria-label="다음 달" onClick={() => onMonth(1)} className={ds.button.secondarySmall}>
            ›
          </button>
          <button type="button" onClick={onThisMonth} className={ds.button.ghostSmall}>
            이번 달
          </button>
        </div>
        <ul aria-label="색 안내" className="flex flex-wrap items-center gap-1.5">
          {LEGEND.map(({ kind, text }) => (
            <li key={kind} className="flex">
              <span className={LEAVE_CHIP[kind]}>{text}</span>
            </li>
          ))}
          <li className="flex">
            <span className={ds.chip.warning}>예약 휴무</span>
          </li>
          <li className="flex items-center gap-1 text-caption text-muted">
            <span aria-hidden="true" className="size-3.5 rounded-control border border-line-strong bg-canvas" />
            공휴일·휴진일
          </li>
        </ul>
      </div>
      {noList ? (
        <p className="rounded-control bg-warning-soft px-3 py-2 text-small text-warning">{`${month.slice(0, 4)}년 공휴일 목록이 아직 없어요. 쉬는 날은 설정 → 병원 정보 휴진일로 넣어 주세요.`}</p>
      ) : null}
      <div className={ds.panel}>
        <TableScroll label="휴가 달력 칸">
          <table className="w-full min-w-190 table-fixed border-collapse">
            <thead>
              <tr className="border-b border-line bg-canvas">
                {WEEK_HEAD.map((w) => (
                  <th key={w} scope="col" className="px-2 py-1.5 text-left text-caption font-semibold text-muted">
                    {w}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weeks.map((week) => (
                <tr key={week[0]} className="border-b border-line last:border-b-0">
                  {week.map((day) => {
                    const out = monthOf(day) !== month
                    const kind = dayKind(day, ctx)
                    const off = kind.holiday || kind.closed
                    const isToday = day === today
                    const date = Number(day.slice(8, 10))
                    const dayLeaves = byDay.get(day) ?? []
                    return (
                      <td
                        key={day}
                        data-day={day}
                        data-off={off ? 'true' : undefined}
                        data-out={out ? 'true' : undefined}
                        className={`relative h-23 border-r border-line p-0 align-top last:border-r-0 ${off ? 'bg-canvas' : ''}`}
                      >
                        <button
                          type="button"
                          aria-label={`${dayLabel(day)} 휴가 넣기`}
                          aria-current={isToday ? 'date' : undefined}
                          onClick={() => onDay(day)}
                          className={`absolute inset-0 flex cursor-pointer items-start gap-1 px-1.5 pt-1 text-left hover:bg-canvas ${ds.focusRing}`}
                        >
                          <span
                            className={
                              isToday
                                ? 'grid size-5.5 place-items-center rounded-full bg-accent text-caption font-semibold text-surface tabular-nums'
                                : `text-caption font-semibold tabular-nums ${out || off ? 'text-muted' : 'text-ink-2'}`
                            }
                          >
                            {date === 1 ? `${Number(day.slice(5, 7))}/1` : date}
                          </span>{' '}
                          {off && !out ? <span className="text-caption text-muted">{kind.holiday ? '공휴일' : '휴진'}</span> : null}
                        </button>
                        {!out && dayLeaves.length > 0 ? (
                          <div className="pointer-events-none relative flex min-w-0 flex-col items-start gap-1 px-1.5 pt-8 pb-1.5">
                            {dayLeaves.map((l) => {
                              const person = memberOf.get(l.staffId)
                              if (!person) return null
                              const link = linkOf(person, profile.staff)
                              return (
                                <span key={l.id} className="flex min-w-0 max-w-full flex-col items-start gap-0.5">
                                  <button
                                    type="button"
                                    onClick={() => onChip(l)}
                                    className={`pointer-events-auto relative max-w-full cursor-pointer text-left ${LEAVE_CHIP[l.kind]} ${ds.focusRing}`}
                                  >
                                    {`${person.name} ${leaveLabel(l.kind, l.part)}`}
                                  </button>{' '}
                                  {link !== null ? (
                                    <span className={ds.chip.warning}>{l.part === null ? '예약 휴무' : `예약 휴무 · ${l.part === 'am' ? '오전' : '오후'}`}</span>
                                  ) : null}
                                </span>
                              )
                            })}
                          </div>
                        ) : null}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </div>
      <p className={ds.help}>회색 칸 = 공휴일(웹앱 공휴일 목록)과 병원 휴진일(설정 → 병원 정보).</p>
    </section>
  )
}


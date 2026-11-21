'use client'

import { LEAVE_CHIP, OVERTIME_KIND_LABEL, jobLabel, leaveLabel } from '@/components/staff/labels'
import { TableScroll } from '@/components/staff/TableScroll'
import { ds } from '@/components/ui/classes'
import { dayKind, fmtMinutes, isChangedDay, planOn, shiftOn, workingCount, type DayCtx } from '@/lib/staff/schedule'
import type { DayChange, Leave, Overtime, OvertimeKind, StaffMember, WeekPlan } from '@/types/staff'
import { cellTime, dateNum, dayTitle, halfWorked, restName, weekdayName, workDaysText } from './format'
import { REST_HOVER, REST_SHADE } from './parts'

// 주 보기 표 (staff AC-7613.1, 시안 schedule.html ①). 줄은 사람(명단 차례), 칸은 월~일.
// 칸: 근무 '09–18' · '쉼' · 하루 휴가 칩 · 반차는 일한 반나절 + 칩 · '+연장 {시간}' · 기본과 다르게 바꾼 날은 주황 점. 공휴일·휴진일은 회색(바꾼 날이 없으면 빈 칸).
// 맨 아래 '일한 사람' 줄(AC-7605.7). 칸을 누르면 그날만 바꾸기(onCell), 이름을 누르면 기본 근무(onName). 셈은 lib/staff/schedule.ts에 병원 정보(ctx)를 꼭 넘긴다.
// 넓은 표라 TableScroll 칸만 옆으로 밀린다(폰 전용 모양 없음, AC-7611.4)

const KINDS: readonly OvertimeKind[] = ['extended', 'night', 'holiday']

type WeekTableProps = {
  days: readonly string[]
  today: string
  /** 이 주에 재직한 사람(명단 차례) */
  members: readonly StaffMember[]
  plans: readonly WeekPlan[]
  changes: readonly DayChange[]
  overtime: readonly Overtime[]
  leaves: readonly Leave[]
  ctx: DayCtx
  /** 창이 열린 칸 '{직원 id}|{날짜}' */
  picked: string | null
  onCell(member: StaffMember, day: string): void
  onName(member: StaffMember): void
}

// 머리 바탕은 칸마다 준다: 보통 canvas, 공휴일·휴진일 REST_SHADE
const TH = 'h-10 whitespace-nowrap border-b border-l border-line px-2.5 text-left align-middle text-caption font-medium first:border-l-0'
const TD = 'h-px border-b border-l border-line p-0 align-top'
const DOT = 'size-1.5 shrink-0 rounded-full bg-cal-orange'

const employedOn = (member: StaffMember, day: string) => member.hiredOn <= day && (member.leftOn === null || day <= member.leftOn)

type CellView = { time: string | null; off: boolean; leave: Leave | null; extra: string[]; changed: boolean }

function cellView(member: StaffMember, day: string, props: WeekTableProps, rest: boolean): CellView {
  const { plans, changes, overtime, leaves, ctx } = props
  const args = { member, plans, changes, day, ctx }
  const shift = shiftOn(args)
  const leave = leaves.find((l) => l.staffId === member.id && l.day === day) ?? null
  let time: string | null = null
  if (shift !== null && leave === null) time = cellTime(shift.start, shift.end)
  if (shift !== null && leave?.kind === 'half') {
    const half = halfWorked(shift, leave.part)
    time = half === null ? null : cellTime(half.start, half.end)
  }
  const extra = KINDS.flatMap((kind) =>
    overtime
      .filter((o) => o.staffId === member.id && o.day === day && o.kind === kind && o.minutes > 0)
      .map((o) => `+${OVERTIME_KIND_LABEL[kind]} ${fmtMinutes(o.minutes)}`),
  )
  return { time, off: shift === null && leave === null && !rest, leave, extra, changed: isChangedDay(args) }
}

export function WeekTable(props: WeekTableProps) {
  const { days, today, members, plans, changes, leaves, ctx, picked, onCell, onName } = props
  const kinds = days.map((day) => dayKind(day, ctx))
  const lastDay = days[days.length - 1]!
  const counts = days.map((day) => workingCount(day, { ...ctx, members, plans, changes, leaves }))

  return (
    <TableScroll label="주 근무표">
      <table aria-label="주 근무표" className="w-full min-w-240 table-fixed border-collapse border border-line bg-surface text-small">
        <colgroup>
          <col className="w-40" />
          {days.map((day) => (
            <col key={day} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className={`${TH} bg-canvas text-muted`}>
              이름
            </th>
            {days.map((day, i) => {
              const rest = restName(kinds[i]!)
              const isToday = day === today
              return (
                <th
                  key={day}
                  scope="col"
                  data-today={isToday ? 'true' : undefined}
                  className={`${TH} ${rest !== null ? REST_SHADE : 'bg-canvas'} ${isToday ? 'border-t-2 border-t-accent text-accent' : 'text-muted'}`}
                >
                  <span className={`text-body font-semibold tabular-nums ${isToday ? 'text-accent' : 'text-ink'}`}>{dateNum(day)}</span> {weekdayName(day)}
                  {isToday ? ' · 오늘' : ''}
                  {rest !== null ? ` · ${rest}` : ''}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {members.map((member) => {
            const work = workDaysText(planOn(plans.filter((p) => p.staffId === member.id), lastDay))
            return (
              <tr key={member.id}>
                <th scope="row" className="border-b border-line p-0 text-left align-top font-normal">
                  <button
                    type="button"
                    title="기본 근무 고치기"
                    className={`flex w-full cursor-pointer flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-canvas ${ds.focusRing}`}
                    onClick={() => onName(member)}
                  >
                    <span className="font-semibold text-accent">{member.name}</span>{' '}
                    <span className="text-caption text-muted">{work === null ? jobLabel(member) : `${jobLabel(member)} · ${work}`}</span>
                  </button>
                </th>
                {days.map((day, i) => {
                  const kind = kinds[i]!
                  const rest = kind.holiday || kind.closed
                  const shade = rest ? REST_SHADE : ''
                  if (!employedOn(member, day)) return <td key={day} data-rest={rest ? 'true' : undefined} className={`${TD} ${shade}`} />
                  const view = cellView(member, day, props, rest)
                  const key = `${member.id}|${day}`
                  const leaveText = view.leave === null ? null : leaveLabel(view.leave.kind, view.leave.part)
                  const name = [
                    member.name,
                    dayTitle(day),
                    ...(rest ? [restName(kind)!] : []),
                    ...(view.time !== null ? [view.time] : []),
                    ...(view.off ? ['쉼'] : []),
                    ...(leaveText !== null ? [leaveText] : []),
                    ...view.extra,
                    ...(view.changed ? ['기본과 다르게 바꾼 날'] : []),
                  ].join(' ')
                  return (
                    <td key={day} data-rest={rest ? 'true' : undefined} className={`${TD} ${shade}`}>
                      <button
                        type="button"
                        aria-label={name}
                        className={`relative flex size-full min-h-14 cursor-pointer flex-col items-start gap-0.5 px-2.5 py-2 text-left ${
                          rest ? REST_HOVER : 'hover:bg-canvas'
                        } ${picked === key ? 'outline-2 -outline-offset-2 outline-accent' : ''} ${ds.focusRing}`}
                        onClick={() => onCell(member, day)}
                      >
                        {view.changed ? <span role="img" aria-label="기본과 다르게 바꾼 날" title="기본과 다르게 바꾼 날" className={`absolute top-2 right-2 ${DOT}`} /> : null}
                        {view.time !== null ? <span className="text-ink tabular-nums">{view.time}</span> : null}
                        {view.off ? <span className="text-muted">쉼</span> : null}
                        {view.leave !== null ? <span className={LEAVE_CHIP[view.leave.kind]}>{leaveText}</span> : null}
                        {view.extra.map((text) => (
                          <span key={text} className="text-caption font-semibold whitespace-nowrap text-positive">
                            {text}
                          </span>
                        ))}
                      </button>
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" className="h-10 bg-canvas px-3 text-left text-caption font-medium text-ink-2">
              일한 사람
            </th>
            {days.map((day, i) => (
              <td key={day} className="h-10 border-l border-line bg-canvas px-2.5 text-caption text-ink-2 tabular-nums">
                {counts[i]}명
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </TableScroll>
  )
}

/** 칸 뜻 안내 줄(시안 ① .legend) */
export function WeekLegend() {
  const item = 'inline-flex items-center gap-1.5 whitespace-nowrap'
  return (
    <ul aria-label="칸 뜻" className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-caption text-ink-2">
      <li className={item}>
        <span className="font-medium text-ink tabular-nums">09–18</span> 근무 시간
      </li>
      <li className={item}>
        <span className="text-muted">쉼</span> 쉬는 날
      </li>
      <li className={item}>
        <span className={LEAVE_CHIP.annual}>연차</span> <span className={LEAVE_CHIP.half}>오후 반차</span> <span className={LEAVE_CHIP.sick}>병가</span> 휴가(휴가 화면에서 넣은 것)
      </li>
      <li className={item}>
        <span aria-hidden="true" className={DOT} />
        기본과 다르게 바꾼 날
      </li>
      <li className={item}>
        <span className="font-semibold text-positive">+연장 2시간</span> 더 일한 시간
      </li>
      <li className={item}>
        <span aria-hidden="true" className={`size-3.5 shrink-0 rounded-control border border-line-strong ${REST_SHADE}`} />
        공휴일·휴진일
      </li>
    </ul>
  )
}

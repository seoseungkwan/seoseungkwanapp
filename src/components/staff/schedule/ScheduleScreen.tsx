'use client'

import { useCallback, useRef, useState } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { useStaffBase } from '@/components/staff/useStaffBase'
import { ds } from '@/components/ui/classes'
import { addDays, addMonths, eachDay, monthOf, monthRange, weekRange, weekStartOf } from '@/lib/analytics/dates'
import { dayKind } from '@/lib/staff/schedule'
import type { StaffMember } from '@/types/staff'
import { DayDialog } from './DayDialog'
import { monthTitle, weekRangeText, type ClinicCtx } from './format'
import { MonthView, monthGridRange } from './MonthView'
import { Segment } from './parts'
import { PlanEditor } from './PlanEditor'
import { useScheduleRange } from './useScheduleRange'
import { WeekLegend, WeekTable } from './WeekTable'

// 근무표 화면 (staff REQ-7613, 시안 docs/mockups/staff/schedule.html ①~⑤ — 폰 장면 ⑥은 만들지 않음, 폰에서도 PC 모양 그대로).
// 제목 '직원'과 작은 메뉴는 staff/layout이 그린다. 직원·설정·기본 근무·병원 정보는 useStaffBase, 보는 기간의 바뀐 날·더 일한 시간·휴가는 useScheduleRange가 읽는다.
// [주]·[달] 보기, 이름을 누르면 기본 근무(PlanEditor), 칸을 누르면 그날만 바꾸기 창(DayDialog). 보기·날짜는 화면 상태에만 둔다(브라우저 저장소 없음).
// 셈(lib/staff/schedule.ts)에는 병원 진료시간·휴진일(ctx)을 늘 넘긴다 — 공휴일·휴진일은 바뀐 날이 없으면 쉼이다

type Mode = 'week' | 'month'
const MODES: readonly (readonly [Mode, string])[] = [
  ['week', '주'],
  ['month', '달'],
]

const employedBetween = (member: StaffMember, from: string, to: string) => member.hiredOn <= to && (member.leftOn === null || member.leftOn >= from)

export function ScheduleScreen({ today }: { today: string }) {
  const base = useStaffBase()
  const [mode, setMode] = useState<Mode>('week')
  const [weekStart, setWeekStart] = useState(() => weekStartOf(today))
  const [month, setMonth] = useState(() => monthOf(today))
  const [planFor, setPlanFor] = useState<string | null>(null)
  const [open, setOpen] = useState<{ staffId: string; day: string } | null>(null)
  const opener = useRef<HTMLElement | null>(null)

  const range = mode === 'week' ? weekRange(weekStart) : monthGridRange(month)
  const loaded = useScheduleRange(base.store, range.from, range.to)
  const ctx: ClinicCtx = { hours: base.clinic.profile.hours, closedDates: base.clinic.profile.closedDates }

  const closeDialog = useCallback(() => {
    setOpen(null)
    opener.current?.focus()
  }, [])
  const reloadRange = loaded.reload
  const savedDialog = useCallback(() => {
    setOpen(null)
    reloadRange()
    opener.current?.focus()
  }, [reloadRange])

  const planMember = planFor === null ? undefined : base.members.find((m) => m.id === planFor)
  if (planMember !== undefined) {
    return (
      <PlanEditor
        key={planMember.id}
        member={planMember}
        plans={base.plans}
        ctx={ctx}
        today={today}
        store={base.store}
        onBack={() => setPlanFor(null)}
        onSaved={() => {
          base.reload()
          setPlanFor(null)
        }}
      />
    )
  }

  const shownDays = mode === 'week' ? eachDay(range) : eachDay(monthRange(month))
  const missingYears = [...new Set(shownDays.filter((day) => dayKind(day, ctx).noHolidayList).map((day) => day.slice(0, 4)))]
  const move = (by: -1 | 1) => (mode === 'week' ? setWeekStart((w) => addDays(w, by * 7)) : setMonth((m) => addMonths(m, by)))
  const goToday = () => (mode === 'week' ? setWeekStart(weekStartOf(today)) : setMonth(monthOf(today)))
  const pickMode = (next: Mode) => {
    if (next === mode) return
    if (next === 'month') setMonth(monthOf(addDays(weekStart, 3)))
    else setWeekStart(monthOf(today) === month ? weekStartOf(today) : weekStartOf(`${month}-01`))
    setMode(next)
  }
  const failed = base.state === 'failed' || loaded.state === 'failed'
  const data = base.state === 'ready' ? loaded.data : null
  const openMember = open === null ? undefined : base.members.find((m) => m.id === open.staffId)

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={ds.button.secondarySmall} onClick={() => move(-1)}>
          {mode === 'week' ? '◀ 지난주' : '◀ 지난달'}
        </button>
        <button type="button" className={ds.button.secondarySmall} onClick={goToday}>
          {mode === 'week' ? '이번 주' : '이번 달'}
        </button>
        <button type="button" className={ds.button.secondarySmall} onClick={() => move(1)}>
          {mode === 'week' ? '다음 주 ▶' : '다음 달 ▶'}
        </button>
        <span className="ml-2 text-lead font-semibold text-ink tabular-nums">{mode === 'week' ? weekRangeText(range.from, range.to) : monthTitle(month)}</span>
        <Segment label="보기" className="ml-auto" options={MODES} value={mode} onChange={pickMode} />
      </div>

      {missingYears.map((year) => (
        <p key={year} className="rounded-control bg-warning-soft px-4 py-3 text-small text-warning">
          {`${year}년 공휴일 목록이 아직 없어요. 쉬는 날은 설정 → 병원 정보 휴진일로 넣어 주세요.`}
        </p>
      ))}

      {failed ? (
        <div className="flex flex-col items-start gap-3">
          <ErrorCard code="E-STAFF-READ-FAILED" />
          <button
            type="button"
            className={ds.button.secondary}
            onClick={() => {
              base.reload()
              loaded.reload()
            }}
          >
            다시 불러오기
          </button>
        </div>
      ) : data === null ? (
        <p className="text-small text-muted">근무표를 불러오는 중이에요</p>
      ) : mode === 'week' ? (
        <>
          <WeekTable
            days={shownDays}
            today={today}
            members={base.members.filter((m) => employedBetween(m, range.from, range.to))}
            plans={base.plans}
            changes={data.changes}
            overtime={data.overtime}
            leaves={data.leaves}
            ctx={ctx}
            picked={open === null ? null : `${open.staffId}|${open.day}`}
            onCell={(member, day) => {
              opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
              setOpen({ staffId: member.id, day })
            }}
            onName={(member) => setPlanFor(member.id)}
          />
          <WeekLegend />
        </>
      ) : (
        <MonthView
          month={month}
          today={today}
          members={base.members}
          plans={base.plans}
          changes={data.changes}
          overtime={data.overtime}
          leaves={data.leaves}
          ctx={ctx}
          onDay={(day) => {
            setWeekStart(weekStartOf(day))
            setMode('week')
          }}
        />
      )}

      {open !== null && openMember !== undefined && data !== null ? (
        <DayDialog
          key={`${open.staffId}|${open.day}`}
          member={openMember}
          day={open.day}
          plans={base.plans}
          changes={data.changes}
          overtime={data.overtime}
          ctx={ctx}
          store={base.store}
          onClose={closeDialog}
          onSaved={savedDialog}
        />
      ) : null}
    </div>
  )
}

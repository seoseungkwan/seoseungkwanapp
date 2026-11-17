'use client'

import { useState, type MouseEvent } from 'react'
import { ds } from '@/components/ui/classes'
import { layoutDay } from '@/lib/calendar/layout'
import type { BitGhost } from '@/lib/calendar/shapes'
import type { CalAllDay, CalAppt, CalSettings } from '@/types/calendar'
import { apptColor } from '../colors'
import { ApptBlock, BLOCK_GUTTER_PX } from './ApptBlock'
import { GHOST_LEN, GhostBlock } from './GhostBlock'
import { allDayChipClass, allDayText, dateNum, dayLabel, hm, SLOT_PX, weekdayName } from './parts'

// 예약표 일·주 시간 표(spec clinic-calendar AC-5905.1·AC-5905.7·AC-5905.8·AC-5906.2, design.md '화면' rows/TimeGrid, 시안 ?s=week·day·empty).
// 울타리 안 부품(components/calendar/rows): 예약·종일 줄·비트 예약 칸을 props로만 받아 그리고, 누름은 콜백으로만 넘긴다. 읽기·저장 없음.
// 10분 = 20px, 보이는 시간은 설정(openHour~closeHour) — 그 밖 예약은 칸이 없다(날짜 머리 수·월 수·요약에는 든다).
// 같은 날 칸은 layoutDay로 옆으로 나란히(비트 예약·취소 칸 포함). 날이 하나면 일 보기(칸마다 시간·길이·메모)

export type GridDraft = { day: string; start: number; len: number; editing: boolean; warn: boolean }

export type TimeGridProps = {
  days: readonly string[] // 주 보기 월~토(설정이 켜면 일요일까지), 일 보기는 하루
  settings: Pick<CalSettings, 'kinds' | 'staff' | 'openHour' | 'closeHour'>
  appts: readonly CalAppt[]
  ghosts?: readonly BitGhost[] // 비트 PC만(화면이 visibleGhosts 결과를 준다). 없으면 그리지 않는다
  allday: readonly CalAllDay[]
  today: string // 한국 날짜
  nowMin: number | null // 한국 시각(0시부터 분). null이면 지금 선 없음
  draft?: GridDraft | null // 더하기·고치기 판이 열려 있을 때 그 자리 표시
  onSlot: (day: string, start: number) => void
  onAppt: (id: string) => void
  onGhost: (key: string) => void
  onAllDay: (day: string) => void
  onDay: (day: string) => void
  onAdd?: () => void // 빈 화면 카드의 [예약 더하기]
}

// 시간 줄 칸 폭 52px(768px 미만 40px). 머리·종일·몸 줄이 같은 폭을 쓴다
const GUTTER = 'w-13 shrink-0 max-md:w-10'

function PlusIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M8 3v10M3 8h10" />
    </svg>
  )
}

export function TimeGrid({
  days,
  settings,
  appts,
  ghosts = [],
  allday,
  today,
  nowMin,
  draft = null,
  onSlot,
  onAppt,
  onGhost,
  onAllDay,
  onDay,
  onAdd,
}: TimeGridProps) {
  // edge = 날 칸 오른쪽 빈 줄(BLOCK_GUTTER_PX) 위(spec calendar-colors AC-6003.3)
  const [hover, setHover] = useState<{ day: string; start: number; edge: boolean } | null>(null)
  const mode = days.length === 1 ? 'day' : 'week'
  const open = settings.openHour * 60
  const close = settings.closeHour * 60
  const slots = (close - open) / 10
  const yOf = (min: number) => ((min - open) / 10) * SLOT_PX
  const bodyHeight = yOf(close)
  const staffOrder = (id: string) => {
    const i = settings.staff.findIndex((s) => s.id === id)
    return i < 0 ? settings.staff.length : i
  }
  // 누른 높이 → 10분에 맞춘 시각(표 밖으로 넘치면 첫·마지막 칸)
  const slotAt = (e: MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const index = Math.min(Math.max(Math.floor((e.clientY - rect.top) / SLOT_PX), 0), slots - 1)
    return open + index * 10
  }
  const onBlock = (e: MouseEvent<HTMLElement>) => (e.target as Element).closest('[data-block]') !== null

  const hours: number[] = []
  for (let m = open; m < close; m += 60) hours.push(m)

  function column(day: string) {
    // 같은 시각·같은 길이면 시행자 차례(시안 lay), 비트 예약 칸은 뒤
    const list = appts.filter((a) => a.day === day).sort((a, b) => staffOrder(a.staffId) - staffOrder(b.staffId))
    const dayGhosts = ghosts.filter((g) => g.day === day)
    const places = layoutDay([
      ...list.map((a) => ({ key: `a:${a.id}`, start: a.start, len: a.len })),
      ...dayGhosts.map((g) => ({ key: `g:${g.key}`, start: g.start, len: GHOST_LEN })),
    ])
    // 보이는 시간과 겹치는 부분만: 위 = 시작 자리, 높이 = 길이 − 1px(14px 이상)
    const frame = (start: number, len: number) => {
      const end = start + len
      if (end <= open || start >= close) return null
      const top = Math.max(0, yOf(start))
      return { top, height: Math.max(Math.min(yOf(close), yOf(end)) - top - 1, 14) }
    }
    const isToday = day === today
    const hovered = hover?.day === day ? hover : null
    const draftHere = draft?.day === day ? draft : null
    return (
      <div
        key={day}
        data-slot-day={day}
        data-today={isToday ? 'true' : undefined}
        className={`relative min-w-0 flex-1 cursor-pointer border-l border-line ${isToday ? 'bg-accent-soft/40' : ''}`}
        onClick={(e) => {
          if (!onBlock(e)) onSlot(day, slotAt(e))
        }}
        onMouseMove={(e) => {
          // 같은 칸·같은 줄이면 그대로 둔다(움직일 때마다 표 전체를 다시 그리지 않게)
          if (onBlock(e)) {
            setHover(null)
            return
          }
          const start = slotAt(e)
          const edge = e.clientX >= e.currentTarget.getBoundingClientRect().right - BLOCK_GUTTER_PX
          setHover((prev) => (prev?.day === day && prev.start === start && prev.edge === edge ? prev : { day, start, edge }))
        }}
        onMouseLeave={() => setHover(null)}
      >
        {hours.map((m) => (
          <div key={m} aria-hidden="true" className="pointer-events-none absolute inset-x-0" style={{ top: yOf(m), height: SLOT_PX * 6 }}>
            <div className="h-1/2 border-t border-line" />
            <div className="h-1/2 border-t border-line/50" />
          </div>
        ))}
        {list.map((a) => {
          const f = frame(a.start, a.len)
          const place = places.get(`a:${a.id}`)
          if (!f || !place) return null
          return <ApptBlock key={a.id} appt={a} place={place} top={f.top} height={f.height} mode={mode} color={apptColor(a, settings)} onOpen={onAppt} />
        })}
        {dayGhosts.map((g) => {
          const f = frame(g.start, GHOST_LEN)
          const place = places.get(`g:${g.key}`)
          if (!f || !place) return null
          return <GhostBlock key={g.key} ghost={g} place={place} top={f.top} height={f.height} mode={mode} onOpen={onGhost} />
        })}
        {isToday && nowMin !== null && nowMin >= open && nowMin <= close ? (
          <div title={`지금 ${hm(nowMin)}`} className="pointer-events-none absolute -left-px right-0 z-6 h-0 border-t-2 border-negative" style={{ top: yOf(nowMin) }}>
            <span className="absolute -top-1.5 -left-1.25 size-2.5 rounded-full bg-negative" />
          </div>
        ) : null}
        {hovered !== null && draftHere === null ? (
          hovered.edge ? (
            // 오른쪽 빈 줄 안에만 글 없는 좁은 점선 칸(10분 높이) — 예약이 있는 시간에도 그 시각으로 더하기(AC-6003.3)
            <div
              aria-hidden="true"
              data-hover="edge"
              className="pointer-events-none absolute right-0.5 z-3 w-4 rounded-control border border-dashed border-accent bg-accent-soft/60 max-md:hidden"
              style={{ top: yOf(hovered.start), height: SLOT_PX - 2 }}
            />
          ) : (
            <div
              aria-hidden="true"
              data-hover="full"
              className="pointer-events-none absolute inset-x-0.5 z-3 rounded-control border border-dashed border-accent bg-accent-soft/60 px-1.5 py-0.5 text-caption font-semibold text-accent-strong max-md:hidden"
              style={{ top: yOf(hovered.start), height: SLOT_PX * 3 - 2 }}
            >
              + {hm(hovered.start)}
            </div>
          )
        ) : null}
        {draftHere ? (
          <div
            className={`pointer-events-none absolute inset-x-0.5 z-7 overflow-clip rounded-control border-2 border-dashed px-1.5 py-0.5 text-caption font-semibold ${
              draftHere.warn ? 'border-warning bg-warning-soft text-warning' : 'border-accent bg-accent-soft text-accent-strong'
            }`}
            style={{ top: yOf(draftHere.start), height: Math.max((draftHere.len / 10) * SLOT_PX - 1, 18) }}
          >
            {draftHere.editing ? '고치는 중' : '새 예약'} {hm(draftHere.start)}–{hm(draftHere.start + draftHere.len)}
            {draftHere.warn ? ' · 확인' : ''}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <section aria-label="예약표" className="relative min-w-0 overflow-clip rounded-control border border-line bg-surface">
      <div className="sticky top-0 z-8 flex border-b border-line bg-surface">
        <div className={GUTTER} />
        {days.map((day) => {
          const isToday = day === today
          const count = appts.filter((a) => a.day === day && a.status !== 'cancel').length
          return (
            <button
              key={day}
              type="button"
              aria-label={`${dayLabel(day)}${isToday ? ' 오늘' : ''} 예약 ${count}`}
              tabIndex={mode === 'day' ? -1 : undefined}
              onClick={() => onDay(day)}
              className={`flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 border-l border-line px-2 py-1.5 text-left hover:bg-canvas ${ds.focusRing}`}
            >
              <span
                className={
                  isToday
                    ? 'grid size-7.5 shrink-0 place-items-center rounded-full bg-accent text-lead font-semibold text-surface tabular-nums'
                    : 'text-title font-semibold text-ink tabular-nums max-md:text-lead'
                }
              >
                {dateNum(day)}
              </span>{' '}
              <span className={`whitespace-nowrap text-small ${isToday ? 'font-semibold text-accent-strong' : 'font-medium text-muted'}`}>
                {weekdayName(day)}
                {isToday ? ' · 오늘' : ''}
              </span>
              {count > 0 ? (
                <>
                  {' '}
                  <span className="ml-auto whitespace-nowrap text-caption text-muted">예약 {count}</span>
                </>
              ) : null}
            </button>
          )
        })}
      </div>

      <div className="flex border-b border-line-strong">
        <div className={`${GUTTER} pt-1.5 pr-2 text-right text-caption text-muted`}>종일</div>
        {days.map((day) => {
          const items = allday.filter((it) => it.day === day)
          return (
            <div
              key={day}
              data-allday-day={day}
              title="눌러서 종일 메모·휴무 더하기"
              onClick={() => onAllDay(day)}
              className="group flex min-h-8.5 min-w-0 flex-1 cursor-pointer flex-col gap-0.5 border-l border-line p-1 hover:bg-canvas"
            >
              {items.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onAllDay(day)
                  }}
                  className={`flex h-5.5 max-w-full min-w-0 cursor-pointer items-center rounded-control px-1.5 text-left text-caption font-semibold text-ink ${allDayChipClass(it, settings.staff)} ${ds.focusRing}`}
                >
                  <span className="truncate">{allDayText(it, settings.staff)}</span>
                </button>
              ))}
              {items.length === 0 ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onAllDay(day)
                  }}
                  className={`w-fit cursor-pointer rounded-control px-1 py-0.5 text-caption text-accent opacity-0 group-hover:opacity-100 focus-visible:opacity-100 ${ds.focusRing}`}
                >
                  + 종일
                </button>
              ) : null}
            </div>
          )
        })}
      </div>

      <div data-grid-body className="relative flex" style={{ height: bodyHeight }}>
        <div className={`relative ${GUTTER}`}>
          {hours.map((m) => (
            <span
              key={m}
              className={`absolute right-1.5 text-caption text-muted tabular-nums max-md:right-1 ${m === open ? 'top-0.5' : '-translate-y-1/2'}`}
              style={m === open ? undefined : { top: yOf(m) }}
            >
              {hm(m)}
            </span>
          ))}
        </div>
        {days.map(column)}
        {mode === 'week' && appts.length === 0 ? (
          <div className={`absolute inset-x-4 top-37.5 z-7 mx-auto grid max-w-105 justify-items-start gap-2 p-5 ${ds.layer}`}>
            <h2 className="text-subtitle font-semibold text-ink">이번 주 예약이 아직 없어요</h2>
            <p className="text-small text-ink-2">빈 칸을 누르면 그 시간으로 예약을 넣어요. 구글 캘린더에 있던 예약은 옮겨 오지 않아요.</p>
            {onAdd ? (
              <button type="button" onClick={onAdd} className={`mt-1 ${ds.button.primary}`}>
                <PlusIcon />
                예약 더하기
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  )
}

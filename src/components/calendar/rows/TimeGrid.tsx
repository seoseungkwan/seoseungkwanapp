'use client'

import { useState, type MouseEvent } from 'react'
import { ds } from '@/components/ui/classes'
import { hoursOn, isClosedOn } from '@/lib/calendar/clinic'
import { apptPaint } from '@/lib/calendar/gpaint'
import type { RowsGoogle } from '@/lib/calendar/gshapes'
import { layoutDay } from '@/lib/calendar/layout'
import type { BitGhost } from '@/lib/calendar/shapes'
import type { CalAllDay, CalAppt, CalSettings } from '@/types/calendar'
import { apptColor } from '../colors'
import { ApptBlock, BLOCK_GUTTER_PX } from './ApptBlock'
import { FixBlock } from './FixBlock'
import { GHOST_LEN, GhostBlock } from './GhostBlock'
import { dateNum, dayChips, dayLabel, FIX_LOOK, fixLabel, FixText, Hatch, hm, SLOT_PX, weekdayName } from './parts'

// 예약표 일·주 시간 표(spec clinic-calendar AC-5905.1·AC-5905.7·AC-5905.8·AC-5906.2, design.md '화면' rows/TimeGrid, 시안 ?s=week·day·empty).
// 울타리 안 부품(components/calendar/rows): 예약·종일 줄·비트 예약 칸을 props로만 받아 그리고, 누름은 콜백으로만 넘긴다. 읽기·저장 없음.
// 10분 = 20px, 보이는 시간은 설정(openHour~closeHour) — 그 밖 예약은 칸이 없다(날짜 머리 수·월 수·요약에는 든다).
// 같은 날 칸은 layoutDay로 옆으로 나란히(비트 예약·취소 칸 포함). 날이 하나면 일 보기(칸마다 시간·길이·메모).
// 병원 정보(spec clinic-profile AC-6603.2·AC-6603.3): 받은 days(요일 진료시간)로 그 요일 진료시간 밖·점심을 회색 띠(점심 띠에 '점심'),
// 받은 closedDates(휴진일)·휴진 요일은 머리에 '휴진' + 열 전체 회색. 띠는 누름을 막지 않는다(예약은 지금처럼 넣는다). days가 없으면 띠가 없다.
// 구글과 이은 병원(google: RowsGoogle, spec google-link REQ-8532, 시안 ?s=week·fix·err): 칸 색은 lib/calendar/gpaint apptPaint,
// 못 보낸 예약(waiting)은 주황 시계, 고쳐야 할 구글 일정(fixes)은 노란 빗금 칸(시간 있음 → 예약 칸과 나란히, 하루 종일 → 종일 줄 칩, 누르면 onFix),
// 종일 줄은 하루 종일 휴무 한 칩·반차 흰 칩·메모 캘린더 기본 색(parts dayChips). google이 없으면 지금 모양 그대로.
// 시작은 5분 단위(09:15)도 그 분 자리에 놓고, 시간 표 칸·누름·마우스 올림은 10분 그대로다(AC-8532.4)

export type GridDraft = { day: string; start: number; len: number; editing: boolean; warn: boolean }

type OffBand = { kind: 'before' | 'after' | 'lunch' | 'closed'; from: number; to: number }

export type TimeGridProps = {
  days: readonly string[] // 주 보기 월~토(설정이 켜면 일요일까지), 일 보기는 하루
  settings: Pick<CalSettings, 'kinds' | 'staff' | 'openHour' | 'closeHour' | 'days' | 'closedDates'>
  appts: readonly CalAppt[]
  ghosts?: readonly BitGhost[] // 비트 PC만(화면이 visibleGhosts 결과를 준다). 없으면 그리지 않는다
  allday: readonly CalAllDay[]
  today: string // 한국 날짜
  nowMin: number | null // 한국 시각(0시부터 분). null이면 지금 선 없음
  draft?: GridDraft | null // 더하기·고치기 판이 열려 있을 때 그 자리 표시
  google?: RowsGoogle | null // 구글과 이은 병원만(TASK-21이 넘김). 없으면 지금 모양
  offWord?: string // 휴무 줄 끝 글(구글 연결 설정 look.offWord, 기본 'off'). google이 있을 때만 쓴다
  onFix?: (id: string) => void // 고쳐야 할 칸·칩 누름 → 고쳐야 할 판
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
  google = null,
  offWord = 'off',
  onFix,
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
  // 시행자 없는 예약(null)·목록에 없는 시행자는 뒤
  const staffOrder = (id: string | null) => {
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
  const fixes = google?.fixes ?? []
  const openFix = (id: string) => onFix?.(id)
  const paintOf = (a: CalAppt) => (google ? apptPaint(a, google.ctx).key : apptColor(a, settings))

  const hours: number[] = []
  for (let m = open; m < close; m += 60) hours.push(m)

  // 그날 회색 띠(표 시간 안으로 자른다): 휴진이면 열 전체, 아니면 여는 시각 전·닫는 시각 뒤·점심
  function offBands(day: string): OffBand[] {
    if (isClosedOn(settings, day)) return [{ kind: 'closed', from: open, to: close }]
    const dayHours = hoursOn(settings, day)
    if (!dayHours) return []
    const bands: OffBand[] = [
      { kind: 'before', from: open, to: Math.min(dayHours.open, close) },
      { kind: 'after', from: Math.max(dayHours.close, open), to: close },
    ]
    if (dayHours.lunchFrom !== null && dayHours.lunchTo !== null) {
      bands.push({ kind: 'lunch', from: Math.max(dayHours.lunchFrom, open), to: Math.min(dayHours.lunchTo, close) })
    }
    return bands.filter((band) => band.from < band.to)
  }

  function column(day: string) {
    // 같은 시각·같은 길이면 시행자 차례(시안 lay), 비트 예약 칸은 뒤
    const list = appts.filter((a) => a.day === day).sort((a, b) => staffOrder(a.staffId) - staffOrder(b.staffId))
    const dayGhosts = ghosts.filter((g) => g.day === day)
    const dayFixes = fixes.filter((f) => f.day === day && !f.allDay)
    const places = layoutDay([
      ...list.map((a) => ({ key: `a:${a.id}`, start: a.start, len: a.len })),
      ...dayGhosts.map((g) => ({ key: `g:${g.key}`, start: g.start, len: GHOST_LEN })),
      ...dayFixes.map((f) => ({ key: `f:${f.id}`, start: f.start, len: f.len })),
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
        data-closed={isClosedOn(settings, day) ? 'true' : undefined}
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
        {offBands(day).map((band) => (
          <div
            key={band.kind}
            data-off={band.kind}
            className="pointer-events-none absolute inset-x-0 bg-canvas"
            style={{ top: yOf(band.from), height: yOf(band.to) - yOf(band.from) }}
          >
            {band.kind === 'lunch' ? <span className="absolute top-0.5 left-1.5 text-caption text-muted">점심</span> : null}
          </div>
        ))}
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
          return (
            <ApptBlock
              key={a.id}
              appt={a}
              place={place}
              top={f.top}
              height={f.height}
              mode={mode}
              color={paintOf(a)}
              google={google ? { waiting: google.waiting.has(a.id) } : null}
              onOpen={onAppt}
            />
          )
        })}
        {dayGhosts.map((g) => {
          const f = frame(g.start, GHOST_LEN)
          const place = places.get(`g:${g.key}`)
          if (!f || !place) return null
          return <GhostBlock key={g.key} ghost={g} place={place} top={f.top} height={f.height} mode={mode} onOpen={onGhost} />
        })}
        {dayFixes.map((fix) => {
          const f = frame(fix.start, fix.len)
          const place = places.get(`f:${fix.id}`)
          if (!f || !place) return null
          return <FixBlock key={fix.id} fix={fix} place={place} top={f.top} height={f.height} mode={mode} onOpen={openFix} />
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
          const closed = isClosedOn(settings, day)
          const count = appts.filter((a) => a.day === day && a.status !== 'cancel').length
          return (
            <button
              key={day}
              type="button"
              aria-label={`${dayLabel(day)}${isToday ? ' 오늘' : ''}${closed ? ' 휴진' : ''} 예약 ${count}`}
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
              {closed ? (
                <>
                  {' '}
                  <span className="rounded-control bg-canvas px-1 text-caption font-semibold whitespace-nowrap text-muted">휴진</span>
                </>
              ) : null}
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
          const chips = dayChips(
            allday.filter((it) => it.day === day),
            settings.staff,
            google ? { offColor: google.ctx.look.offColor, offWord } : null,
          )
          const dayFixes = fixes.filter((f) => f.day === day && f.allDay)
          return (
            <div
              key={day}
              data-allday-day={day}
              title="눌러서 종일 메모·휴무 더하기"
              onClick={() => onAllDay(day)}
              className="group flex min-h-8.5 min-w-0 flex-1 cursor-pointer flex-col gap-0.5 border-l border-line p-1 hover:bg-canvas"
            >
              {chips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  title={chip.title}
                  onClick={(e) => {
                    e.stopPropagation()
                    onAllDay(day)
                  }}
                  className={`flex h-5.5 max-w-full min-w-0 cursor-pointer items-center rounded-control px-1.5 text-left text-caption font-semibold ${chip.cls} ${ds.focusRing}`}
                >
                  <span className="truncate">{chip.text}</span>
                </button>
              ))}
              {dayFixes.map((fix) => (
                <button
                  key={fix.id}
                  type="button"
                  data-block="fix"
                  aria-label={fixLabel(fix)}
                  title={fixLabel(fix)}
                  onClick={(e) => {
                    e.stopPropagation()
                    openFix(fix.id)
                  }}
                  className={`relative flex h-5.5 max-w-full min-w-0 cursor-pointer items-center overflow-clip rounded-control px-1.5 text-left text-caption ${FIX_LOOK} ${ds.focusRing}`}
                >
                  <Hatch kind="fix" className="text-warning opacity-10" />
                  <span className="relative truncate">
                    <FixText fix={fix} />
                  </span>
                </button>
              ))}
              {chips.length === 0 && dayFixes.length === 0 ? (
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
        {mode === 'week' && appts.length === 0 && !fixes.some((f) => days.includes(f.day)) ? (
          <div className={`absolute inset-x-4 top-37.5 z-7 mx-auto grid max-w-105 justify-items-start gap-2 p-5 ${ds.layer}`}>
            <h2 className="text-subtitle font-semibold text-ink">이번 주 예약이 아직 없어요</h2>
            <p className="text-small text-ink-2">빈 칸을 누르면 그 시간으로 예약을 넣어요.</p>
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

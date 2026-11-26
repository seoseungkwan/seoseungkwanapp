'use client'

import { useState } from 'react'
import { ds } from '@/components/ui/classes'
import { compareYmd } from '@/lib/analytics/dates'
import { apptPaint } from '@/lib/calendar/gpaint'
import type { RowsGoogle } from '@/lib/calendar/gshapes'
import { shownStatus } from '@/lib/calendar/rules'
import type { BitGhost, CalAllDay, ShownStatus } from '@/lib/calendar/shapes'
import type { CalAppt, CalSettings } from '@/types/calendar'
import { apptColor, CAL_TONES, type CalPaint } from '../colors'
import { apptLabel, dateNum, dayChips, dayLabel, ghostLabel, hm, isMoved, kindBits, linkedApptLabel, MovedMark, WaitMark, weekdayName } from './parts'

// 폰 주 보기(768px 미만, spec clinic-calendar AC-5905.8·AC-5906.2, 시안 ?s=phone-week·기본값 7번).
// 날짜별 목록: 날짜 줄(요약) + 종일 칩 + 펼치면 그날 예약 줄. 처음에는 오늘만 펼친다. 울타리 안 부품: props로만 받고 누름은 콜백으로만 넘긴다.
// 받은 휴진일(closedDates, spec clinic-profile AC-6603.3)은 날짜 줄에 '휴진' + 카드 회색. 펼치기·예약 줄·+ 종일은 그대로다.
// 반차 휴무 칩은 같은 모양에 글만 '오전 휴무'·'오후 휴무'(parts allDayText, spec staff AC-7616.1).
// 구글과 이은 병원(google: RowsGoogle, spec google-link AC-8532.2·AC-8532.3): 지금 목록 모양 그대로 색 띠만 apptPaint, '변경' 꼬리표는 gMoved에도,
// 못 보낸 예약은 주황 시계, 종일 칩은 예약표와 같다(parts dayChips). 고쳐야 할 구글 일정은 이 목록에 넣지 않는다(띠의 고쳐야 할 판에서 본다).
// 이은 병원의 '변경' 꼬리표는 g_moved만(google-link AC-8545.1). 종류 줄은 종류 이름에 든 시행자 표시를 다시 적지 않는다(parts kindBits, AC-8548.2)

export type PhoneWeekListProps = {
  days: readonly string[]
  settings: Pick<CalSettings, 'kinds' | 'staff' | 'closedDates'>
  appts: readonly CalAppt[]
  ghosts?: readonly BitGhost[] // 좁은 창의 비트 PC만. 폰은 주지 않는다
  allday: readonly CalAllDay[]
  today: string
  google?: RowsGoogle | null // 구글과 이은 병원만(TASK-21이 넘김). 없으면 지금 모양
  offWord?: string // 휴무 줄 끝 글(기본 'off'). google이 있을 때만 쓴다
  onAppt: (id: string) => void
  onGhost: (key: string) => void
  onAllDay: (day: string) => void
}

const STATUS_CHIP: Record<ShownStatus, { text: string; cls: string } | null> = {
  came: { text: '왔음', cls: ds.chip.positive },
  noshow: { text: '안 옴', cls: ds.chip.negative },
  cancel: { text: '취소', cls: ds.chip.neutral },
  none: null,
}

const ROW = `flex min-h-13 w-full cursor-pointer items-center gap-2.5 border-b border-line px-3 py-1.5 text-left last:border-b-0 hover:bg-canvas ${ds.focusRing}`

type Line = { at: number; order: number; appt: CalAppt | null; ghost: BitGhost | null }

export function PhoneWeekList({ days, settings, appts, ghosts = [], allday, today, google = null, offWord = 'off', onAppt, onGhost, onAllDay }: PhoneWeekListProps) {
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set(days.includes(today) ? [today] : []))
  const toggle = (day: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(day)) next.delete(day)
      else next.add(day)
      return next
    })
  // 시행자 없는 예약(null)·목록에 없는 시행자는 뒤
  const staffOrder = (id: string | null) => {
    const i = settings.staff.findIndex((s) => s.id === id)
    return i < 0 ? settings.staff.length : i
  }

  const closedDates = new Set(settings.closedDates ?? [])

  return (
    <div className="flex flex-col gap-2">
      {days.map((day) => {
        const isOpen = open.has(day)
        const isToday = day === today
        const closed = closedDates.has(day)
        const dayAppts = appts.filter((a) => a.day === day)
        const live = dayAppts.filter((a) => a.status !== 'cancel')
        const came = live.filter((a) => shownStatus(a) === 'came').length
        const noshow = live.filter((a) => shownStatus(a) === 'noshow').length
        const chips = dayChips(
          allday.filter((it) => it.day === day),
          settings.staff,
          google ? { offColor: google.ctx.look.offColor, offWord } : null,
        )
        // 시작 차례, 같으면 시행자 차례(비트 예약 칸은 뒤)
        const lines: Line[] = [
          ...dayAppts.map((a) => ({ at: a.start, order: staffOrder(a.staffId), appt: a, ghost: null })),
          ...ghosts.filter((g) => g.day === day).map((g) => ({ at: g.start, order: settings.staff.length + 1, appt: null, ghost: g })),
        ].sort((x, y) => x.at - y.at || x.order - y.order)
        return (
          <div
            key={day}
            data-closed={closed ? 'true' : undefined}
            className={`overflow-clip rounded-control border ${closed ? 'bg-canvas' : 'bg-surface'} ${isToday ? 'border-accent' : 'border-line'}`}
          >
            <button
              type="button"
              aria-expanded={isOpen}
              aria-label={`${dayLabel(day)}${isToday ? ' 오늘' : ''}${closed ? ' 휴진' : ''} 예약 ${live.length}`}
              onClick={() => toggle(day)}
              className={`flex min-h-13 w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left hover:bg-canvas ${ds.focusRing}`}
            >
              <span
                className={
                  isToday
                    ? 'grid size-7.5 shrink-0 place-items-center rounded-full bg-accent text-lead font-semibold text-surface tabular-nums'
                    : 'w-7.5 shrink-0 text-center text-subtitle font-semibold text-ink tabular-nums'
                }
              >
                {dateNum(day)}
              </span>{' '}
              <span className={`text-body ${isToday ? 'font-semibold text-accent-strong' : 'font-medium text-ink-2'}`}>
                {weekdayName(day)}
                {isToday ? ' · 오늘' : ''}
              </span>{' '}
              {closed ? (
                <>
                  <span className="rounded-control bg-surface px-1.5 text-caption font-semibold text-muted">휴진</span>{' '}
                </>
              ) : null}
              <span className="ml-auto text-right text-caption text-muted">
                {live.length ? (
                  <>
                    <span className="block">예약 {live.length}</span>
                    {compareYmd(day, today) <= 0 ? (
                      <>
                        {' '}
                        <span className="block">
                          왔음 {came}
                          {noshow ? (
                            <>
                              {' · '}
                              <span className="font-semibold text-negative">안 옴 {noshow}</span>
                            </>
                          ) : null}
                        </span>
                      </>
                    ) : null}
                  </>
                ) : (
                  '예약 없음'
                )}
              </span>{' '}
              <span aria-hidden="true" className="text-caption text-muted">
                {isOpen ? '▲' : '▼'}
              </span>
            </button>

            {chips.length || isOpen ? (
              <div className="flex flex-wrap items-center gap-1 px-3 pb-2">
                {chips.map((chip) => (
                  <button
                    key={chip.key}
                    type="button"
                    title={chip.title}
                    onClick={() => onAllDay(day)}
                    className={`flex h-6 max-w-full min-w-0 cursor-pointer items-center rounded-control px-2 text-caption font-semibold ${chip.cls} ${ds.focusRing}`}
                  >
                    <span className="truncate">{chip.text}</span>
                  </button>
                ))}
                {isOpen ? (
                  <button type="button" onClick={() => onAllDay(day)} className={`${ds.textButton} text-small`}>
                    + 종일
                  </button>
                ) : null}
              </div>
            ) : null}

            {isOpen ? (
              lines.length ? (
                <div className="border-t border-line">
                  {lines.map((line) =>
                    line.appt ? (
                      <ApptRow
                        key={line.appt.id}
                        appt={line.appt}
                        color={google ? apptPaint(line.appt, google.ctx).key : apptColor(line.appt, settings)}
                        google={google ? { waiting: google.waiting.has(line.appt.id) } : null}
                        onOpen={onAppt}
                      />
                    ) : (
                      <GhostRow key={line.ghost!.key} ghost={line.ghost!} onOpen={onGhost} />
                    ),
                  )}
                </div>
              ) : (
                <div className="border-t border-line p-3 text-small text-muted">예약이 없어요</div>
              )
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function ApptRow({
  appt,
  color,
  google,
  onOpen,
}: {
  appt: CalAppt
  color: CalPaint
  google: { waiting: boolean } | null
  onOpen: (id: string) => void
}) {
  const shown = shownStatus(appt)
  const cancel = shown === 'cancel'
  const chip = STATUS_CHIP[shown]
  const label = google ? linkedApptLabel(appt, shown, google.waiting) : apptLabel(appt, shown)
  const { mark } = kindBits(appt)
  return (
    <button type="button" aria-label={label} title={label} onClick={() => onOpen(appt.id)} className={ROW}>
      <span className={`w-11 shrink-0 text-body leading-4.5 font-semibold tabular-nums ${cancel ? 'text-muted line-through' : 'text-ink'}`}>
        {hm(appt.start)}
        <small className="block text-caption font-normal text-muted no-underline">{appt.len}분</small>
      </span>
      <span data-bar className={`w-1 shrink-0 self-stretch rounded-control ${CAL_TONES[color].fill}`} />
      <span className="min-w-0 flex-1 leading-4.5">
        <b className={`block truncate text-body font-semibold ${cancel ? 'text-muted line-through' : 'text-ink'}`}>
          {google?.waiting ? <WaitMark /> : null}
          {isMoved(appt, google !== null) ? <MovedMark /> : null}
          {appt.chart ? (
            <>
              <span className={`font-medium tabular-nums ${cancel ? '' : 'text-ink-2'}`}>{appt.chart}</span>{' '}
            </>
          ) : null}
          <span className={cancel ? 'line-through' : ''}>{appt.name}</span>
        </b>
        <small className="block truncate text-caption text-ink-2">
          {appt.staffId === null ? appt.kindName : `${appt.kindName}${mark === null ? '' : ` (${mark})`} ${appt.staffName}`}
          {appt.memo ? ` · ${appt.memo}` : ''}
        </small>
      </span>
      {chip ? <span className={`shrink-0 ${chip.cls}`}>{chip.text}</span> : null}
    </button>
  )
}

function GhostRow({ ghost, onOpen }: { ghost: BitGhost; onOpen: (key: string) => void }) {
  const label = ghostLabel(ghost)
  const who = [ghost.chart, ghost.name].filter(Boolean).join(' ')
  return (
    <button type="button" aria-label={label} title={label} onClick={() => onOpen(ghost.key)} className={ROW}>
      <span className="w-11 shrink-0 text-body leading-4.5 font-semibold text-ink tabular-nums">
        {hm(ghost.start)}
        <small className="block text-caption font-normal text-muted">비트</small>
      </span>
      <span data-bar className="w-1 shrink-0 self-stretch border-l-4 border-dashed border-faint" />
      <span className="min-w-0 flex-1 leading-4.5">
        <b className="block truncate text-body font-semibold text-muted">비트 예약{who ? ` · ${who}` : ''}</b>
        <small className="block truncate text-caption text-ink-2">보기만 해요</small>
      </span>
    </button>
  )
}

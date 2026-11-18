'use client'

import { useState } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { ds } from '@/components/ui/classes'
import { occupancy, occupancyLevel, occupancyLists } from '@/lib/calendar/occupancy'
import type { CalSettings } from '@/types/calendar'
import type { CalendarSlots } from './CalendarSection'
import { Note, Section } from './parts'

// 통계 '예약' 칸 안 '예약 빈자리' (spec stats-insights REQ-6105 AC-6105.2·AC-6105.3, 시안 docs/mockups/stats-insights ⑤).
// 최근 8주 요일 × 시 찬 정도 표(칸에 숫자, 네 단계 색), 시행자 고르기(모두 + 설정의 시행자), 늘 비는 시간·꽉 차는 시간, 세는 법.
// 숫자는 받은 줄(listCalendarSlots·listAllDay)을 lib/calendar occupancy로 센다. 저장소는 부르지 않는다(읽기·다시 읽기는 화면이 한다).
// 고른 시행자는 이 칸의 React 상태뿐이다. 폰 폭에서는 표만 옆으로 민다

const TITLE = '예약 빈자리'
const EMPTY = '예약이 쌓이면 보여요'
const RETRY = '다시 읽기'
const FOOT = '최근 8주. 찬 정도 = 그 시간에 잡힌 예약 분 ÷ (일하는 시행자 수 × 60분). 휴무인 시행자와 취소된 예약은 빼요. 8주 동안 예약이 없던 시간은 비워 둬요.'
const SCROLL_NAME = '예약 빈자리 표, 옆으로 밀어 볼 수 있어요'
const WEEKDAYS = '월화수목금토일'
// 색 네 단계(45 미만·65 미만·85 미만·85 이상, 시안 heat 색). 빈 칸(자리 0 · 8주 동안 예약이 없던 시간, AC-6105.1)은 빈 바탕
const LEVEL_TONE = ['bg-st-h1 text-st-ink', 'bg-st-h2 text-st-ink', 'bg-st-h3 text-st-ink', 'bg-st-h5 text-surface'] as const
const NONE_TONE = 'bg-st-canvas'
const CELL = 'st-move-heat h-7.5 rounded-control text-center text-small font-semibold tabular-nums'
const HEAD = 'px-0.5 pb-0.5 text-center text-caption font-medium whitespace-nowrap text-st-muted'
const WEEKDAY = 'sticky left-0 z-1 bg-surface pr-1.5 text-left text-small font-semibold whitespace-nowrap text-st-ink-2'
const PICK = `h-8 cursor-pointer rounded-control border px-3 text-small whitespace-nowrap max-md:h-11 ${ds.focusRing}`
const PICK_ON = 'border-st-ink bg-surface font-semibold text-st-ink'
const PICK_OFF = 'border-line-strong bg-surface font-medium text-st-ink-2 hover:bg-canvas'

type Props = {
  slots: CalendarSlots
  settings?: CalSettings // 시행자 목록·여는 시간·일요일(없으면 시행자가 없는 것으로 본다)
  today: string
  onReread(): void
}

export function OccupancySection({ slots, settings, today, onReread }: Props) {
  const [picked, setPicked] = useState<string | null>(null)

  if (slots === 'reading') {
    return <Section title={TITLE}>{null}</Section>
  }
  if (slots === 'failed') {
    return (
      <Section title={TITLE}>
        <div className="mt-3">
          <ErrorCard code="E-STATS-READ-FAILED" />
        </div>
        <div className="mt-2">
          <button type="button" onClick={onReread} className={`${ds.button.secondarySmall} max-md:w-full`}>
            {RETRY}
          </button>
        </div>
      </Section>
    )
  }

  const staff = settings?.staff ?? []
  const all = settings ? occupancy({ rows: slots.rows, offs: slots.offs, settings, today, staffId: null }) : null
  if (!settings || !all || staff.length === 0 || all.booked === 0) {
    return (
      <Section title={TITLE}>
        <p className="mt-3 text-body text-st-ink-2">{EMPTY}</p>
      </Section>
    )
  }

  const chosen = picked !== null && staff.some((person) => person.id === picked) ? picked : null
  const view = chosen === null ? all : occupancy({ rows: slots.rows, offs: slots.offs, settings, today, staffId: chosen })
  const lists = occupancyLists(view)
  const choices = [{ id: null, name: '모두' }, ...staff.map((person) => ({ id: person.id, name: person.name }))]

  return (
    <Section title={TITLE}>
      <div role="group" aria-label="시행자" className="mt-3 flex flex-wrap gap-1.5">
        {choices.map((choice) => (
          <button
            key={choice.id ?? ''}
            type="button"
            aria-pressed={choice.id === chosen}
            onClick={() => setPicked(choice.id)}
            className={`${PICK} ${choice.id === chosen ? PICK_ON : PICK_OFF}`}
          >
            {choice.name}
          </button>
        ))}
      </div>
      <div role="region" tabIndex={0} aria-label={SCROLL_NAME} className="mt-3 overflow-x-auto rounded-st-sm focus-visible:outline-2 focus-visible:outline-accent">
        <table className="w-full min-w-105 table-fixed border-separate border-spacing-0.5">
          <caption className="sr-only">요일·시간마다 예약이 찬 정도 (%)</caption>
          <colgroup>
            <col className="w-9" />
            <col span={view.hours.length} />
          </colgroup>
          <thead>
            <tr>
              <th scope="col" className={HEAD}>
                <span className="sr-only">요일</span>
              </th>
              {view.hours.map((hour) => (
                <th key={hour} scope="col" className={HEAD}>{`${hour}시`}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.weekdays.map((weekday, at) => (
              <tr key={weekday}>
                <th scope="row" className={WEEKDAY}>
                  {WEEKDAYS[weekday - 1]}
                </th>
                {view.cells[at]!.map((pct, i) => {
                  const level = pct === null ? null : occupancyLevel(pct)
                  return (
                    <td key={view.hours[i]} data-level={level ?? 'none'} className={`${CELL} ${level === null ? NONE_TONE : LEVEL_TONE[level]}`}>
                      {pct ?? ''}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 flex items-center gap-1.5 text-small text-st-muted">
        <span>비어 있음</span>
        {LEVEL_TONE.map((tone) => (
          <span key={tone} aria-hidden="true" className={`inline-block h-3 w-4.5 rounded-control ${tone}`} />
        ))}
        <span>꽉 참</span>
      </p>
      {(lists.empty || lists.full) && (
        <ul className="mt-3 grid gap-1 text-st-15 leading-6 text-st-ink-2">
          {lists.empty && (
            <li>
              <span className="font-semibold text-st-ink">늘 비는 시간</span>
              {`: ${lists.empty}`}
            </li>
          )}
          {lists.full && (
            <li>
              <span className="font-semibold text-st-ink">꽉 차는 시간</span>
              {`: ${lists.full}`}
            </li>
          )}
        </ul>
      )}
      <Note>{FOOT}</Note>
    </Section>
  )
}

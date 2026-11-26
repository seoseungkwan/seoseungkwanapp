'use client'

import { useId, type CSSProperties, type ReactNode } from 'react'
import { Icon } from '@/components/common/Icon'
import type { GColor } from '@/types/gcal'
import { RESULT_AFTER, RESULT_BEFORE, RESULT_NOTES, ROW_HEAD, mdw, rangeHint, sentLine, type Chip, type DayPreview, type GcalOffInfo } from './gcalOff'

// 휴가 넣기 칸 오른쪽 '저장하면 이렇게 바뀌어요' → 저장 뒤 '저장한 뒤' (spec google-link AC-8537.1·AC-8537.2, 시안 calendar.html ?s=staff).
// 미리 보기 넷째 날의 예약 탭 종일 줄(메모 · off 칩 하나 · 반차 흰 칩)과 구글 캘린더 하루 종일 줄(메모 · off 줄),
// 구글에 적었으면 '구글 캘린더에도 적었어요 · {HH:mm}', 아래 안내 넷. 색은 예약 색판 토큰(--cal-*)이고 캘린더 기본 색은 그 병원 값으로 덮는다

const offVar = (color: GColor, on = false) => `var(--cal-${color}${on ? '-on' : ''})`
const chipBase = 'block rounded-control px-1.5 py-0.5 text-caption font-semibold break-words'

function ChipView({ chip, offColor }: { chip: Chip; offColor: GColor }) {
  if (chip.kind === 'half') return <span className={`${chipBase} bg-surface font-medium text-ink-2 ring-1 ring-line-strong ring-inset`}>{chip.text}</span>
  const style: CSSProperties =
    chip.kind === 'off' ? { background: offVar(offColor), color: offVar(offColor, true) } : { background: 'var(--cal-default)', color: 'var(--cal-default-on)' }
  return (
    <span className={chipBase} style={style}>
      {chip.text}
    </span>
  )
}

function MiniCal({ label, days, today, cells, offColor }: { label: ReactNode; days: readonly string[]; today: string; cells: readonly Chip[][]; offColor: GColor }) {
  const labelId = useId()
  return (
    <div className="grid gap-1">
      <span id={labelId} className="text-caption text-muted">
        {label}
      </span>
      <table aria-labelledby={labelId} className="w-full table-fixed border-collapse rounded-control border border-line bg-surface">
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className="w-13" />
            {days.map((day) => (
              <th
                key={day}
                scope="col"
                className={`border-l border-line px-2 py-1.5 text-left text-caption font-semibold whitespace-nowrap tabular-nums ${day === today ? 'text-accent-strong' : 'text-muted'}`}
              >
                {mdw(day)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row" className="pt-2 pr-2 text-right align-top text-caption font-normal text-muted">
              {ROW_HEAD}
            </th>
            {cells.map((chips, i) => (
              <td key={days[i]} className="h-10 space-y-0.5 border-l border-line p-1 align-top">
                {chips.map((chip, j) => (
                  <ChipView key={`${chip.kind}-${j}`} chip={chip} offColor={offColor} />
                ))}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  )
}

type GcalOffResultProps = {
  info: GcalOffInfo
  days: readonly string[]
  /** 그릴 모습(읽는 중이면 null — 빈 칸) */
  views: readonly DayPreview[] | null
  today: string
  saved: boolean
  /** 구글에 적은 한국 시각 'HH:mm'(못 보냈거나 보낼 것이 없으면 null) */
  sentAt: string | null
}

export function GcalOffResult({ info, days, views, today, saved, sentAt }: GcalOffResultProps) {
  const headId = useId()
  const style = { '--cal-default': info.defaultHex } as CSSProperties
  const cellsOf = (side: 'app' | 'google') => days.map((day) => views?.find((v) => v.day === day)?.[side] ?? [])
  return (
    <section aria-labelledby={headId} style={style} className="grid min-w-0 content-start gap-3 rounded-control border border-line bg-surface p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id={headId} className="text-lead font-semibold text-ink">
          {saved ? RESULT_AFTER : RESULT_BEFORE}
        </h3>
        <span className="text-caption text-muted tabular-nums">{rangeHint(days[0], days[days.length - 1])}</span>
      </div>
      <MiniCal
        label={
          <>
            <b className="font-semibold text-ink-2">예약 탭</b> 종일 줄
          </>
        }
        days={days}
        today={today}
        cells={cellsOf('app')}
        offColor={info.offColor}
      />
      <MiniCal
        label={
          <>
            <b className="font-semibold text-ink-2">구글 캘린더</b> {`${info.calendarName} · 하루 종일 줄`}
          </>
        }
        days={days}
        today={today}
        cells={cellsOf('google')}
        offColor={info.offColor}
      />
      {sentAt !== null ? (
        <p className="flex items-center gap-1.5 text-small font-semibold text-positive">
          <Icon name="check" size={14} />
          {sentLine(sentAt)}
        </p>
      ) : null}
      <ul className="grid gap-1.5 rounded-control border border-line bg-canvas px-3 py-2.5 text-small text-ink-2">
        {RESULT_NOTES.map((note) => (
          <li key={note} className="flex items-start gap-2">
            <Icon name="info" size={14} className="mt-0.5 shrink-0 text-muted" />
            <span>{note}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

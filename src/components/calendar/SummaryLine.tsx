'use client'

import { Fragment, useId, useState } from 'react'
import { formatCount } from '@/components/charts/format'
import { ds } from '@/components/ui/classes'
import { rateSummary, ratePct } from '@/lib/calendar/counts'
import type { CalCountRow, CalSettings } from '@/types/calendar'
import { periodLabel, type CalView } from './CalendarToolbar'
import { RateBreakdown } from './RateTable'

// 보이는 기간 합계 줄 + 나눠 보기 (spec clinic-calendar AC-5907.2, 시안 ?s=summary).
// `이 주 합계  예약 N · 취소 N (x.x%) · 변경 N (x.x%) · 안 옴 N (x.x%)   시행자·종류별 ▾`, 누르면 아래에 시행자별·종류별 표.
// 수는 lib/calendar rateSummary(취소 포함·지운 것 빼고, 비트 예약 칸은 줄에 없다). 받은 줄만 센다(읽기는 화면이 한다)

const PER: Record<CalView, string> = { day: '이 날', week: '이 주', month: '이 달' }
const HINT = '예약 수는 취소 포함·지운 것 빼고 · 비율은 그 줄 예약 수로 나눠요 · 안 옴은 시간이 지난 예약만 · 비트 예약 칸은 세지 않아요'

type SummaryLineProps = {
  view: CalView
  from: string
  to: string
  rows: readonly CalCountRow[] // 보이는 기간 예약(이름·차트번호 없이 세는 칸만)
  settings?: CalSettings // 주면 나눠 보기가 설정 차례·(표시) 이름
  defaultOpen?: boolean
}

/** 합계 줄(누르면 나눠 보기) */
export function SummaryLine({ view, from, to, rows, settings, defaultOpen = false }: SummaryLineProps) {
  const [open, setOpen] = useState(defaultOpen)
  const panelId = useId()
  const sum = rateSummary(rows)
  const items: [string, number, string | null][] = [
    ['예약', sum.total, null],
    ['취소', sum.cancel, ratePct(sum.cancel, sum.total)],
    ['변경', sum.moved, ratePct(sum.moved, sum.total)],
    ['안 옴', sum.noshow, ratePct(sum.noshow, sum.total)],
  ]

  return (
    <div className="grid gap-1">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        className={`flex min-h-10 w-full cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 rounded-control border bg-surface px-3 py-2 text-left text-body text-ink-2 ${ds.focusRing} ${
          open ? 'border-accent ring-1 ring-accent ring-inset' : 'border-line hover:border-line-strong'
        }`}
        onClick={() => setOpen((now) => !now)}
      >
        <span className="text-caption whitespace-nowrap text-muted">{`${PER[view]} 합계`}</span>
        <span className="flex flex-wrap items-baseline tabular-nums">
          {items.map(([name, n, rate], i) => (
            <Fragment key={name}>
              {i > 0 && (
                <span aria-hidden="true" className="mx-2 text-muted">
                  ·
                </span>
              )}
              <span data-item className="whitespace-nowrap">
                {name} <b className="font-semibold text-ink">{formatCount(n)}</b>
                {rate !== null && <span className="text-muted">{` (${rate})`}</span>}
              </span>
            </Fragment>
          ))}
        </span>
        <span className="ml-auto text-small font-semibold whitespace-nowrap text-accent">{open ? '접기 ▴' : '시행자·종류별 ▾'}</span>
      </button>
      {open && (
        <section id={panelId} aria-label={`${PER[view]} 나눠 보기`} className="grid min-w-0 gap-3 rounded-control border border-line bg-surface px-4 pt-3 pb-4">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <h3 className="text-body font-semibold text-ink">{`${periodLabel(view, from, to)} · 나눠 보기`}</h3>
            <span className="text-caption text-muted">{HINT}</span>
          </div>
          <RateBreakdown summary={sum} settings={settings} />
        </section>
      )}
    </div>
  )
}

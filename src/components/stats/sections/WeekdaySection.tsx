'use client'

import { ChartLegend, type LegendItem } from '@/components/charts/ChartLegend'
import { formatCount, percentOf } from '@/components/charts/format'
import type { BarBucket } from '@/components/charts/StackedBarChart'
import { periodDesc, weekdayBars, weekdayRows, type StatsRange, type WeekdayRow } from '@/components/stats/view'
import { compareYmd, weekdayOf } from '@/lib/analytics/dates'
import type { DayPayload } from '@/types/payload'
import { DetailToggle, type DetailTable } from './DetailToggle'
import { EmptyNote, NO_RANGE_DATA, Note, PartialChip, Section, todayOf } from './parts'

// 요일별 내원 (stats REQ-513 AC-513.1·513.3·513.4, AC-511.5, first90 REQ-4414 AC-4414.1·AC-4414.2, REQ-4417 AC-4417.2,
// 시안 docs/mockups/first90/redesign.html .s-week). 월~일 일곱 줄마다 가로 막대 + "{n}건", 진료한 날이 없는 요일은 막대 대신 "진료한 날 없음".
// 평균은 weekdayBars 셈 그대로다(view.ts weekdayRows). 막대 폭은 기간을 바꾸면 움직인다(st-move-period).
// 덜 끝난 줄이 든 요일은 지금처럼 빗금 막대 + "일부 기간" 범례이고, '오늘(진료 중)' 글은 덜 끝난 줄이 정말 오늘일 때만 쓴다

const TITLE = '요일별 내원'
const DESC = '하루 평균 · 요일마다'
const EMPTY = '불러오면 요일마다 하루 평균 환자 수가 보여요.'
const UNIT = '건'
const NO_DAYS = '진료한 날 없음'
const TODAY_NOTE = '빗금 막대에는 오늘(진료 중) 숫자가 들어 있어요.'
const LEGEND_PARTIAL: LegendItem[] = [
  { label: '내원', mark: 'accent' },
  { label: '일부 기간', mark: 'hatch' },
]
// 줄(시안 .s-week li): 요일 24px · 막대 · 건수. 15px 글자
const LIST = 'mt-3 grid max-w-140 gap-1.5'
const ROW = 'grid min-h-8 grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-x-3 text-st-15 leading-6'
const NAME = 'font-semibold text-st-ink-2'
const VALUE = 'min-w-15 text-right font-semibold tabular-nums text-st-ink'
const TRACK = 'block h-2.5 overflow-clip bg-canvas'
// 빗금: 45° 선 4px 간격(StackedBarChart 덜 끝난 막대와 같은 그림). 막대 폭 560px + 높이 10px까지 덮는다
const HATCH = Array.from({ length: 145 }, (_, i) => 4 * (i + 1))
  .map((k) => `M0 ${k} L${k} 0`)
  .join(' ')

const isPartial = (bucket: BarBucket) => bucket.state !== 'complete'

// 요일(key)마다 자료 있는 날 수. 같은 날 줄이 둘이어도 하루다
function daysPerWeekday(days: readonly DayPayload[], range: StatsRange): Map<string, number> {
  const { from, to } = range.current
  const inRange = new Set(days.map((row) => row.day).filter((day) => compareYmd(day, from) >= 0 && compareYmd(day, to) <= 0))
  const counts = new Map<string, number>()
  for (const day of inRange) {
    const key = String(weekdayOf(day))
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

function tableOf(buckets: readonly BarBucket[], counts: ReadonlyMap<string, number>): DetailTable {
  return {
    caption: TITLE,
    columns: ['요일', '하루 평균', '자료 있는 날'],
    rows: buckets.map((bucket) => [
      <>
        {bucket.rangeLabel}
        {isPartial(bucket) && <PartialChip />}
      </>,
      <span key="average" className="font-semibold">
        {`${formatCount(bucket.values[0] ?? 0)}${UNIT}`}
      </span>,
      `${formatCount(counts.get(bucket.key) ?? 0)}일`,
    ]),
  }
}

// 오늘(진료 중) 줄이 보는 기간 안에 들 때만 안내 한 줄
function todayNote(days: readonly DayPayload[], range: StatsRange): string | null {
  const today = todayOf(range)
  const todayInRange = compareYmd(today, range.current.from) >= 0 && compareYmd(today, range.current.to) <= 0
  return todayInRange && days.some((row) => row.day === today && row.partial) ? TODAY_NOTE : null
}

// 가로 막대(꾸밈, 값은 옆 "{n}건"). 덜 끝난 줄이 든 요일은 빗금 막대
function Bar({ row, max }: { row: WeekdayRow; max: number }) {
  const width = { width: `${percentOf(row.average ?? 0, max)}%` }
  return (
    <span aria-hidden="true" className={TRACK}>
      {row.partial ? (
        <span className="st-move-period relative block h-full border border-accent bg-surface" style={width}>
          <svg className="absolute inset-0 size-full text-accent">
            <path d={HATCH} fill="none" stroke="currentColor" strokeWidth="1" />
          </svg>
        </span>
      ) : (
        <span className="st-move-period block h-full bg-accent" style={width} />
      )}
    </span>
  )
}

function WeekdayList({ rows }: { rows: readonly WeekdayRow[] }) {
  const max = Math.max(0, ...rows.map((row) => row.average ?? 0))
  return (
    <ul aria-label="요일마다 하루 평균 내원" className={LIST}>
      {rows.map((row) => (
        <li key={row.key} className={ROW}>
          <span className={NAME}>{row.name}</span>
          {row.average === null ? (
            <span className="col-span-2 text-small text-st-muted">{NO_DAYS}</span>
          ) : (
            <>
              <Bar row={row} max={max} />
              <span className={VALUE}>{`${formatCount(row.average)}${UNIT}`}</span>
            </>
          )}
        </li>
      ))}
    </ul>
  )
}

export function WeekdaySection({ days, range, saved, className }: { days: readonly DayPayload[]; range: StatsRange; saved: boolean; className?: string }) {
  const buckets = weekdayBars(days, range)
  const rows = weekdayRows(days, range)
  if (buckets === null || rows === null) {
    return (
      <Section title={TITLE} className={className}>
        <EmptyNote>{saved ? NO_RANGE_DATA : EMPTY}</EmptyNote>
      </Section>
    )
  }
  const note = todayNote(days, range)
  return (
    <DetailToggle table={tableOf(buckets, daysPerWeekday(days, range))}>
      {({ button, panel }) => (
        <Section title={TITLE} desc={periodDesc(DESC, range)} action={button} className={className}>
          {buckets.some(isPartial) && (
            <div className="mt-2">
              <ChartLegend items={LEGEND_PARTIAL} />
            </div>
          )}
          <WeekdayList rows={rows} />
          {note !== null && <Note>{note}</Note>}
          {panel}
        </Section>
      )}
    </DetailToggle>
  )
}

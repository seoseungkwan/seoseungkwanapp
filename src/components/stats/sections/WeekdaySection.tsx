'use client'

import { ChartLegend, type LegendItem } from '@/components/charts/ChartLegend'
import { formatCount } from '@/components/charts/format'
import { StackedBarChart, type BarBucket, type BarSeries } from '@/components/charts/StackedBarChart'
import { periodDesc, weekdayBars, type StatsRange } from '@/components/stats/view'
import { compareYmd, weekdayOf } from '@/lib/analytics/dates'
import type { DayPayload } from '@/types/payload'
import { DetailToggle, type DetailTable } from './DetailToggle'
import { EmptyNote, NO_RANGE_DATA, Note, PartialChip, Section, todayOf } from './parts'

// 요일별 환자 수 (stats REQ-513 AC-513.1·513.3·513.4, AC-511.5, 시안 notes.md §3 '요일별 환자 수').
// '오늘(진료 중)' 글은 덜 끝난 줄이 정말 오늘일 때만 쓴다. 다른 날의 덜 끝난 줄은 빗금과 '일부 기간'만 보인다

const TITLE = '요일별 환자 수'
const EMPTY = '불러오면 요일마다 하루 평균 환자 수가 보여요.'
const SERIES: BarSeries[] = [{ name: '환자 수', tone: 'accent' }]
const LEGEND_PARTIAL: LegendItem[] = [
  { label: '환자 수', mark: 'accent' },
  { label: '일부 기간', mark: 'hatch' },
]
const SUNDAY = '7' // weekdayBuckets의 칸 key = weekdayOf 글자

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
        {`${formatCount(bucket.values[0] ?? 0)}명`}
      </span>,
      `${formatCount(counts.get(bucket.key) ?? 0)}일`,
    ]),
  }
}

function noteOf(buckets: readonly BarBucket[], days: readonly DayPayload[], range: StatsRange): string {
  const parts = ['자료 있는 요일만 보여요.']
  if (!buckets.some((bucket) => bucket.key === SUNDAY)) parts.push('일요일은 진료한 날이 없어요.')
  const today = todayOf(range)
  const todayInRange = compareYmd(today, range.current.from) >= 0 && compareYmd(today, range.current.to) <= 0
  if (todayInRange && days.some((row) => row.day === today && row.partial)) parts.push('빗금 막대에는 오늘(진료 중) 숫자가 들어 있어요.')
  return parts.join(' ')
}

export function WeekdaySection({ days, range, saved, className }: { days: readonly DayPayload[]; range: StatsRange; saved: boolean; className?: string }) {
  const buckets = weekdayBars(days, range)
  if (buckets === null) {
    return (
      <Section title={TITLE} className={className}>
        <EmptyNote>{saved ? NO_RANGE_DATA : EMPTY}</EmptyNote>
      </Section>
    )
  }
  return (
    <DetailToggle table={tableOf(buckets, daysPerWeekday(days, range))}>
      {({ button, panel }) => (
        <Section title={TITLE} desc={periodDesc('하루 평균, 요일마다', range)} action={button} className={className}>
          {buckets.some(isPartial) && (
            <div className="mt-2">
              <ChartLegend items={LEGEND_PARTIAL} />
            </div>
          )}
          <div className="mt-2">
            <StackedBarChart title={TITLE} unit="명" series={SERIES} buckets={buckets} />
          </div>
          <Note>{noteOf(buckets, days, range)}</Note>
          {panel}
        </Section>
      )}
    </DetailToggle>
  )
}

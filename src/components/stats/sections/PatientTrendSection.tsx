'use client'

import { ChartLegend, type LegendItem } from '@/components/charts/ChartLegend'
import { formatCount } from '@/components/charts/format'
import { StackedBarChart, type BarBucket } from '@/components/charts/StackedBarChart'
import { patientTrend, periodDesc, type StatsInput, type StatsRange } from '@/components/stats/view'
import { isCovered } from '@/lib/analytics/coverage'
import { eachDay } from '@/lib/analytics/dates'
import type { TrendBucket } from '@/types/analysis'
import { DetailToggle, type DetailTable } from './DetailToggle'
import { CHART_NO_SIDE_SCROLL, dateWithWeekday, dayNumber, EmptyNote, monthNumber, NO_RANGE_DATA, Note, onlyThisMonthPartial, PartialChip, Section, thinTotals, todayOf, TREND_SERIES } from './parts'

// 환자 수 추이 (stats REQ-513 AC-513.1·513.3·513.4·513.13, AC-511.3, 시안 notes.md §3 '환자 수 추이').
// 고른 기간(stats-period AC-1704.3·AC-1704.4)은 칸이 range.bucket이고 빈 칸(blank)이 있다: 자료 없는 칸은 [자세히] 표의 숫자가 '–', 앞으로 올 달은 표에 없다

const TITLE = '환자 수 추이'
const EMPTY = '불러오면 이 기간의 하루하루가 신환·재진 막대로 그려져요.'
const LEGEND: LegendItem[] = [
  { label: '신환', mark: 'accent' },
  { label: '재진', mark: 'chart-3' },
]
const LEGEND_PARTIAL: LegendItem[] = [...LEGEND, { label: '일부 기간', mark: 'hatch' }]
const DENSE_OVER = 31 // 막대 위 합계는 칸 31개 이하일 때만(시안 §3)
const DESC: Record<TrendBucket, string> = { day: '신환·재진, 하루씩', week: '신환·재진, 한 주씩', month: '신환·재진, 한 달씩' }
const COLUMN: Record<TrendBucket, string> = { day: '날짜', week: '주', month: '달' }
const CLOSED_NOTE = '휴진한 날은 칸이 없어요.'
const NO_DATA_NOTE: Record<TrendBucket, string> = { day: "'–'는 자료가 없는 날이에요.", week: "'–'는 자료가 없는 주예요.", month: "'–'는 자료가 없는 달이에요." }

const isPartial = (bucket: BarBucket) => bucket.state !== 'complete'
// 그림 칸. 빠른 단추는 지금처럼 12개월만 달이고 나머지는 날 막대다(90일도), 고른 기간은 range.bucket
const unitOf = (range: StatsRange): TrendBucket => (range.period === null ? range.bucket : range.period === '12m' ? 'month' : 'day')

// 고른 기간의 날이 모두 덮였는지(AC-513.13). 날마다 덮은 기간만 보고 그날 줄이 있는지는 보지 않는다. 일 기간은 어제에서 끝나므로 오늘은 들지 않는다
function wholeRangeCovered({ covered, range }: StatsInput): boolean {
  const spans = [...covered]
  return eachDay(range.current).every((day) => isCovered({ from: day, to: day }, spans))
}

function tableOf(buckets: readonly BarBucket[], unit: TrendBucket): DetailTable {
  return {
    caption: `${TITLE} (명)`,
    columns: [COLUMN[unit], '신환', '재진', '합계'],
    rows: buckets
      .filter((bucket) => bucket.blank !== 'future')
      .map((bucket) => {
        const [newPatients = 0, returning = 0] = bucket.values
        const noData = bucket.blank === 'no-data'
        return [
          <>
            {unit === 'day' ? dateWithWeekday(bucket.key) : bucket.rangeLabel}
            {!noData && isPartial(bucket) && <PartialChip />}
          </>,
          noData ? '–' : formatCount(newPatients),
          noData ? '–' : formatCount(returning),
          noData ? (
            '–'
          ) : (
            <span key="total" className="font-semibold">
              {formatCount(newPatients + returning)}
            </span>
          ),
        ]
      }),
  }
}

// 고른 기간의 아래 글: 일별은 휴진 한 줄, 자료 없는 칸이 있으면 '–' 뜻을 더한다
function pickNote(buckets: readonly BarBucket[], unit: TrendBucket): string | null {
  const parts = [...(unit === 'day' ? [CLOSED_NOTE] : []), ...(buckets.some((bucket) => bucket.blank === 'no-data') ? [NO_DATA_NOTE[unit]] : [])]
  return parts.length === 0 ? null : parts.join(' ')
}

function quickNote(input: StatsInput, buckets: readonly BarBucket[], monthly: boolean): string | null {
  const today = todayOf(input.range)
  if (!monthly) return wholeRangeCovered(input) ? CLOSED_NOTE : '휴진한 날과 아직 불러오지 않은 날은 칸이 없어요.'
  return onlyThisMonthPartial(buckets.filter(isPartial).map((bucket) => bucket.key), today)
    ? `빗금 칸은 아직 끝나지 않은 달이에요(${monthNumber(today)}월은 ${dayNumber(today)}일까지).`
    : null
}

export function PatientTrendSection({ input, saved, className }: { input: StatsInput; saved: boolean; className?: string }) {
  const buckets = patientTrend(input)
  if (buckets === null) {
    return (
      <Section title={TITLE} className={className}>
        <EmptyNote>{saved ? NO_RANGE_DATA : EMPTY}</EmptyNote>
      </Section>
    )
  }
  const unit = unitOf(input.range)
  // 빈 칸(자료 없음·앞으로 올 달)은 빗금 칸이 아니다
  const anyPartial = buckets.some((bucket) => !bucket.blank && isPartial(bucket))
  const note = input.range.period === null ? pickNote(buckets, unit) : quickNote(input, buckets, unit === 'month')
  return (
    <DetailToggle table={tableOf(buckets, unit)}>
      {({ button, panel }) => (
        <Section title={TITLE} desc={periodDesc(DESC[unit], input.range)} action={button} className={className}>
          <div className="mt-2">
            <ChartLegend items={anyPartial ? LEGEND_PARTIAL : LEGEND} />
          </div>
          <div className={`mt-2 ${thinTotals(buckets.length)} ${CHART_NO_SIDE_SCROLL}`}>
            <StackedBarChart title={TITLE} unit="명" series={TREND_SERIES} buckets={buckets} dense={buckets.length > DENSE_OVER} />
          </div>
          {note !== null && <Note>{note}</Note>}
          {panel}
        </Section>
      )}
    </DetailToggle>
  )
}

'use client'

import { useState } from 'react'
import { ChartLegend, type LegendItem } from '@/components/charts/ChartLegend'
import { formatCount } from '@/components/charts/format'
import { StackedBarChart, type BarBucket, type BarSeries } from '@/components/charts/StackedBarChart'
import { trendSeries } from '@/components/stats/trendSeries'
import { visitTrend, type StatsInput, type StatsRange } from '@/components/stats/view'
import { isCovered } from '@/lib/analytics/coverage'
import { eachDay } from '@/lib/analytics/dates'
import type { TrendBucket } from '@/types/analysis'
import { DetailToggle, type DetailTable } from './DetailToggle'
import {
  CHART_NO_SIDE_SCROLL,
  dateWithWeekday,
  dayNumber,
  EmptyNote,
  monthNumber,
  NO_RANGE_DATA,
  Note,
  onlyThisMonthPartial,
  PartialChip,
  Section,
  todayOf,
  weekdayName,
} from './parts'
import { VisitMixSection } from './VisitMixSection'

// 일별 내원(옛 환자 수 추이) + 내원 구성 도넛 (stats REQ-513 AC-513.1·513.3·513.4·513.13, first90 REQ-4412 AC-4412.1·AC-4412.2, REQ-4417 AC-4417.2,
// design.md 5-0, 시안 docs/mockups/first90/redesign.html .s-row-pat). 1100px 이상은 도넛(4) | 막대(8) 한 줄, 좁으면 도넛이 위다.
// 막대는 90일초진을 아는 기간이면 신환·90일초진·재진 세 갈래, 아니면 신환·재진(90일초진 포함) 두 갈래다(view.ts visitTrend).
// 칸을 누르면(PC는 올리기도) 아래 줄(role="status")에 그 칸 숫자가 나온다. 고른 칸은 이 칸의 React 상태뿐이다.
// 고른 기간(stats-period AC-1704.3)은 칸이 range.bucket이고 빈 칸(blank)이 있다: 자료 없는 칸은 [자세히] 표의 숫자가 '–', 앞으로 올 달은 표에 없다

const TITLE: Record<TrendBucket, string> = { day: '일별 내원', week: '주별 내원', month: '월별 내원' }
const UNIT = '건'
const EMPTY = '불러오면 이 기간의 하루하루가 신환·재진 막대로 그려져요.'
const PARTIAL_LEGEND: LegendItem = { label: '일부 기간', mark: 'hatch' }
const DENSE_OVER = 31 // 막대 위 합계는 칸 31개 이하일 때만(시안 §3)
const COLUMN: Record<TrendBucket, string> = { day: '날짜', week: '주', month: '달' }
const PICK_NOTE = '막대를 누르면 그날 숫자가 나와요.'
const CLOSED_NOTE = '휴진한 날은 칸이 없어요.'
const NOT_LOADED_NOTE = '휴진한 날과 아직 불러오지 않은 날은 칸이 없어요.'
const NO_DATA_NOTE: Record<TrendBucket, string> = { day: "'–'는 자료가 없는 날이에요.", week: "'–'는 자료가 없는 주예요.", month: "'–'는 자료가 없는 달이에요." }
// 고른 칸 아래 줄: 숫자가 바뀌어도 줄 높이가 흔들리지 않는다(min-h-5)
const STATUS = 'mt-2 min-h-5 text-body font-semibold tabular-nums text-st-ink'

const isPartial = (bucket: BarBucket) => bucket.state !== 'complete'
// 그림 칸. 빠른 단추는 지금처럼 12개월만 달이고 나머지는 날 막대다(90일도), 고른 기간은 range.bucket
const unitOf = (range: StatsRange): TrendBucket => (range.period === null ? range.bucket : range.period === '12m' ? 'month' : 'day')

// 고른 기간의 날이 모두 덮였는지(AC-513.13). 날마다 덮은 기간만 보고 그날 줄이 있는지는 보지 않는다. 일 기간은 어제에서 끝나므로 오늘은 들지 않는다
function wholeRangeCovered({ covered, range }: StatsInput): boolean {
  const spans = [...covered]
  return eachDay(range.current).every((day) => isCovered({ from: day, to: day }, spans))
}

function tableOf(buckets: readonly BarBucket[], series: readonly BarSeries[], unit: TrendBucket): DetailTable {
  return {
    caption: `${TITLE[unit]} (${UNIT})`,
    columns: [COLUMN[unit], ...series.map((one) => one.name), '합계'],
    rows: buckets
      .filter((bucket) => bucket.blank !== 'future')
      .map((bucket) => {
        const noData = bucket.blank === 'no-data'
        const values = series.map((_, i) => bucket.values[i] ?? 0)
        const total = values.reduce((all, value) => all + value, 0)
        return [
          <>
            {unit === 'day' ? dateWithWeekday(bucket.key) : bucket.rangeLabel}
            {!noData && isPartial(bucket) && <PartialChip />}
          </>,
          ...values.map((value) => (noData ? '–' : formatCount(value))),
          noData ? (
            '–'
          ) : (
            <span key="total" className="font-semibold">
              {formatCount(total)}
            </span>
          ),
        ]
      }),
  }
}

// 아래 글: 휴진 한 줄(빠른 단추 일 칸은 덮이지 않은 날이 있으면 그 글) + 누르기 안내, 고른 기간에 자료 없는 칸이 있으면 '–' 뜻,
// 빠른 단추 12개월에 덜 끝난 칸이 오늘이 든 달뿐이면 빗금 글
function noteOf(input: StatsInput, buckets: readonly BarBucket[], unit: TrendBucket): string {
  const { range } = input
  const closed = range.period !== null && unit === 'day' && !wholeRangeCovered(input) ? NOT_LOADED_NOTE : CLOSED_NOTE
  const parts = [closed, PICK_NOTE]
  if (range.period === null && buckets.some((bucket) => bucket.blank === 'no-data')) parts.push(NO_DATA_NOTE[unit])
  if (range.period !== null && unit === 'month') {
    const today = todayOf(range)
    if (onlyThisMonthPartial(buckets.filter(isPartial).map((bucket) => bucket.key), today)) {
      parts.push(`빗금 칸은 아직 끝나지 않은 달이에요(${monthNumber(today)}월은 ${dayNumber(today)}일까지).`)
    }
  }
  return parts.join(' ')
}

// 고른 칸 줄: 일 칸은 "11.3(화)", 주·달 칸은 칸 기간 글. 계열 이름 그대로 값을 잇는다
function pickText(bucket: BarBucket, series: readonly BarSeries[], unit: TrendBucket): string {
  const head = unit === 'day' ? `${monthNumber(bucket.key)}.${dayNumber(bucket.key)}(${weekdayName(bucket.key)})` : bucket.rangeLabel
  const values = series.map((_, i) => bucket.values[i] ?? 0)
  const parts = series.map((one, i) => `${one.name} ${formatCount(values[i]!)}`)
  return [`${head} 내원 ${formatCount(values.reduce((all, value) => all + value, 0))}건`, ...parts].join(' · ')
}

export function PatientTrendSection({ input, saved, className = '' }: { input: StatsInput; saved: boolean; className?: string }) {
  const [picked, setPicked] = useState<string | null>(null)
  const trend = visitTrend(input)
  const unit = unitOf(input.range)
  if (trend === null) {
    return (
      <Section title={TITLE[unit]} className={className}>
        <EmptyNote>{saved ? NO_RANGE_DATA : EMPTY}</EmptyNote>
      </Section>
    )
  }
  const { buckets, known } = trend
  const series = trendSeries(known)
  // 빈 칸(자료 없음·앞으로 올 달)은 빗금 칸이 아니다
  const anyPartial = buckets.some((bucket) => !bucket.blank && isPartial(bucket))
  const legend: LegendItem[] = [...series.map((one): LegendItem => ({ label: one.name, mark: one.tone })), ...(anyPartial ? [PARTIAL_LEGEND] : [])]
  // 기간을 바꿔 고른 칸이 없어지면 아래 줄이 빈다. 자료 없는 칸은 고르지 않는다
  const pick = buckets.find((bucket) => bucket.key === picked && !bucket.blank)
  const onPick = (key: string) => {
    if (buckets.some((bucket) => bucket.key === key && !bucket.blank)) setPicked(key)
  }
  return (
    <div className={`grid min-w-0 gap-6 min-[1100px]:grid-cols-[minmax(280px,4fr)_8fr] min-[1100px]:gap-8 ${className}`}>
      <VisitMixSection input={input} />
      <DetailToggle table={tableOf(buckets, series, unit)}>
        {({ button, panel }) => (
          <Section title={TITLE[unit]} action={button}>
            <div className="mt-2">
              <ChartLegend items={legend} />
            </div>
            <div className={`mt-2 ${CHART_NO_SIDE_SCROLL}`}>
              <StackedBarChart
                title={TITLE[unit]}
                unit={UNIT}
                series={series}
                buckets={buckets}
                dense={buckets.length > DENSE_OVER}
                motion
                selected={pick?.key}
                onPick={onPick}
              />
              <p role="status" aria-live="polite" className={STATUS}>
                {pick ? pickText(pick, series, unit) : ''}
              </p>
            </div>
            <Note>{noteOf(input, buckets, unit)}</Note>
            {panel}
          </Section>
        )}
      </DetailToggle>
    </div>
  )
}

'use client'

import { ChartLegend, type LegendItem } from '@/components/charts/ChartLegend'
import { formatCount } from '@/components/charts/format'
import { StackedBarChart, type BarBucket } from '@/components/charts/StackedBarChart'
import { patientTrend, type StatsInput } from '@/components/stats/view'
import { DetailToggle, type DetailTable } from './DetailToggle'
import { CHART_NO_SIDE_SCROLL, dateWithWeekday, dayNumber, EmptyNote, monthNumber, NO_RANGE_DATA, Note, onlyThisMonthPartial, PartialChip, Section, thinTotals, todayOf, TREND_SERIES } from './parts'

// 환자 수 추이 (stats REQ-513 AC-513.1·513.3·513.4, AC-511.3, 시안 notes.md §3 '환자 수 추이')

const TITLE = '환자 수 추이'
const EMPTY = '불러오면 이 기간의 하루하루가 신환·재진 막대로 그려져요.'
const LEGEND: LegendItem[] = [
  { label: '신환', mark: 'accent' },
  { label: '재진', mark: 'chart-3' },
]
const LEGEND_PARTIAL: LegendItem[] = [...LEGEND, { label: '일부 기간', mark: 'hatch' }]
const DENSE_OVER = 31 // 막대 위 합계는 칸 31개 이하일 때만(시안 §3)

const isPartial = (bucket: BarBucket) => bucket.state !== 'complete'

function tableOf(buckets: readonly BarBucket[], monthly: boolean): DetailTable {
  return {
    caption: `${TITLE} (명)`,
    columns: [monthly ? '달' : '날짜', '신환', '재진', '합계'],
    rows: buckets.map((bucket) => {
      const [newPatients = 0, returning = 0] = bucket.values
      return [
        <>
          {monthly ? bucket.rangeLabel : dateWithWeekday(bucket.key)}
          {isPartial(bucket) && <PartialChip />}
        </>,
        formatCount(newPatients),
        formatCount(returning),
        <span key="total" className="font-semibold">
          {formatCount(newPatients + returning)}
        </span>,
      ]
    }),
  }
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
  const monthly = input.range.period === '12m'
  const today = todayOf(input.range)
  const anyPartial = buckets.some(isPartial)
  const note = !monthly
    ? '휴진한 날은 칸이 없어요.'
    : onlyThisMonthPartial(buckets.filter(isPartial).map((bucket) => bucket.key), today)
      ? `빗금 칸은 아직 끝나지 않은 달이에요(${monthNumber(today)}월은 ${dayNumber(today)}일까지).`
      : null
  return (
    <DetailToggle table={tableOf(buckets, monthly)}>
      {({ button, panel }) => (
        <Section title={TITLE} desc={monthly ? '신환·재진, 한 달씩' : '신환·재진, 하루씩'} action={button} className={className}>
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

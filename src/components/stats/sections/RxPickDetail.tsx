'use client'

import { ChartLegend, type LegendItem } from '@/components/charts/ChartLegend'
import { formatCount } from '@/components/charts/format'
import { StackedBarChart, type BarBucket, type BarSeries } from '@/components/charts/StackedBarChart'
import { COLUMN_NAME, GRAIN_NAME } from '@/components/stats/rxPickView'
import { rxDetail, type RxDetailPoint, type RxLine, type StatsInput } from '@/components/stats/view'
import { DetailToggle, type DetailTable } from './DetailToggle'
import { CHART_NO_SIDE_SCROLL, Note, thinTotals, todayOf, TREND_SERIES } from './parts'
import { comparisonAt, detailNote, longLabel, tickLabel } from './RxTrendSection'

// 처방 골라 보기의 열린 칸 안 (rx-picker REQ-806·807, AC-809.2 그래프 단추, 시안 panelHtml).
// 바깥 칸(id·hidden·바탕·여백)은 표가 그린다. 그래프 모양은 prop이라 기간을 바꿔도 부모가 지키고, [자세히] 열림은 DetailToggle이 지킨다.
// 처방 추세와 달리 dense를 주지 않는다: 이 칸은 전체 폭이라 30칸에도 막대 위 글자를 둔다(design.md '차트 부품', 시안 :498)

export type RxPickMode = 'total' | 'split'

const MODES: { mode: RxPickMode; name: string }[] = [
  { mode: 'total', name: '건수만' },
  { mode: 'split', name: '신환·재진 나눠 보기' },
]
const TOTAL_SERIES: BarSeries[] = [{ name: '건수', tone: 'accent' }]
const GAP_NAME = '구분 없음'
const SPLIT_LEGEND: LegendItem[] = [
  { label: '신환', mark: 'accent' },
  { label: '재진', mark: 'chart-3' },
]
const GAP_NOTE = ' 주황 빗금은 신환·재진 구분이 없는 건이에요.'

// 모양은 기간 단추와 같다(시안 .seg). 휴대폰은 둘이 반씩 전체 폭 44px(시안 .seg.mode)
const MODE_GROUP = 'inline-flex shrink-0 overflow-clip rounded-control border border-line-strong bg-surface max-md:grid max-md:w-full max-md:grid-cols-2'
const MODE_BUTTON =
  'h-7.5 cursor-pointer border-l border-line-strong px-3 text-small first:border-l-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent max-md:h-11 max-md:px-1'
const MODE_ON = 'bg-accent-soft font-semibold text-accent-strong'
const MODE_OFF = 'font-medium text-ink-2 transition hover:bg-canvas'

const gapOf = (point: RxDetailPoint) => point.count - point.newCount - point.returningCount

export function RxPickDetail({ line, input, mode, onMode }: { line: RxLine; input: StatsInput; mode: RxPickMode; onMode: (mode: RxPickMode) => void }) {
  const { period } = input.range
  const { current, previous } = rxDetail(input, line.code)
  const grain = GRAIN_NAME[period]
  const title = `${line.name} ${grain}별 건수`
  const split = mode === 'split'
  const anyGap = current.some((point) => gapOf(point) > 0)
  const anyPartial = current.some((point) => point.partial)

  const showGap = split && anyGap

  const series: BarSeries[] = !split ? TOTAL_SERIES : showGap ? [...TREND_SERIES, { name: GAP_NAME, tone: 'hatch-warning' }] : TREND_SERIES
  const buckets: BarBucket[] = current.map((point, i) => ({
    key: point.start,
    label: tickLabel(point, i, current.length, period),
    rangeLabel: longLabel(point, period),
    state: point.partial ? 'partial' : 'complete',
    values: split ? [point.newCount, point.returningCount, gapOf(point)] : [point.count], // 계열 수만큼만 읽는다
    comparison: comparisonAt(previous, i),
  }))
  const legend: LegendItem[] = [
    ...(split ? SPLIT_LEGEND : [{ label: '건수', mark: 'accent' } satisfies LegendItem]),
    ...(showGap ? [{ label: GAP_NAME, mark: 'hatch-warning' } satisfies LegendItem] : []),
    { label: '비교 기간', mark: 'prev' },
    ...(anyPartial ? [{ label: '일부 기간', mark: 'hatch' } satisfies LegendItem] : []),
  ]
  const table: DetailTable = {
    caption: title,
    columns: [grain === '일' ? '날짜' : grain, '건수', '신환', '재진', ...(anyGap ? [GAP_NAME] : []), COLUMN_NAME[period]],
    rows: current.map((point, i) => {
      const comparison = comparisonAt(previous, i)
      return [
        point.partial ? `${longLabel(point, period)} · 일부` : longLabel(point, period),
        <span key="count" className="font-semibold">
          {`${formatCount(point.count)}건`}
        </span>,
        formatCount(point.newCount),
        formatCount(point.returningCount),
        ...(anyGap ? [formatCount(gapOf(point))] : []),
        comparison === null ? '–' : `${formatCount(comparison)}건`,
      ]
    }),
  }

  return (
    <DetailToggle table={table}>
      {({ button, panel }) => (
        <>
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <p className="text-body font-semibold text-ink wrap-anywhere">{`${line.name} · ${grain}별 건수`}</p>
            <div role="group" aria-label="그래프 모양" className={MODE_GROUP}>
              {MODES.map((item) => (
                <button key={item.mode} type="button" aria-pressed={item.mode === mode} onClick={() => onMode(item.mode)} className={`${MODE_BUTTON} ${item.mode === mode ? MODE_ON : MODE_OFF}`}>
                  {item.name}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-2">
            <ChartLegend items={legend} />
          </div>
          <div className={`mt-2 ${thinTotals(buckets.length)} ${CHART_NO_SIDE_SCROLL}`}>
            <StackedBarChart title={title} unit="건" series={series} buckets={buckets} compact hideZeroTotals />
          </div>
          <Note>{`${detailNote(period, current, todayOf(input.range))}${showGap ? GAP_NOTE : ''}`}</Note>
          <div className="mt-2">{button}</div>
          {panel}
        </>
      )}
    </DetailToggle>
  )
}

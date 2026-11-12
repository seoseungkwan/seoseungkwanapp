'use client'

import { useState } from 'react'
import { ChartLegend, type LegendItem } from '@/components/charts/ChartLegend'
import { formatCount } from '@/components/charts/format'
import { RateLineChart, type RatePoint } from '@/components/charts/RateLineChart'
import { StackedBarChart, type BarBucket, type ChartTrend } from '@/components/charts/StackedBarChart'
import { rateText } from '@/components/stats/rxPickView'
import { chartCells, perDayText, periodPatients, sumLabel, trendFit, trendText, type ChartMode, type TrendFit } from '@/components/stats/treatmentChart'
import type { TreatmentRow } from '@/components/stats/treatmentView'
import type { StatsInput } from '@/components/stats/view'
import { ds } from '@/components/ui/classes'
import { DetailToggle, type DetailLabels, type DetailTable } from './DetailToggle'
import { CHART_NO_SIDE_SCROLL, Note, PartialChip, thinTotals, todayOf, TREND_SERIES } from './parts'
import { BUCKET_NAME, detailNote, longLabel, tickLabel } from './trendLabels'

// 처방별 추세 열린 칸 (treatment-trend REQ-1209 AC-1209.2·1209.3·1209.4·1209.6, AC-1206.5 회색 막대·표 비교 칸, design.md '화면').
// 처방 추세 RxDetail과 같은 짜임이다: 제목 · 범례 · 막대(신환·재진 쌓음 + 같은 차례 회색 비교 막대) · 안내 · [숫자로 보기] → 표.
// 다른 점: 전체 폭이라 막대 위 합계는 칸 13개 넘을 때만 숨긴다(시안 showTot = 칸 ≤ 13), 단추 글자가 숫자로 보기·접기다.
// 비교하지 않는 묶음(compared 거짓)은 비교 점이 모두 덮이지 않아 회색 막대가 없고 표 비교 칸이 –다.
// 이 칸을 담는 바깥 칸(id·hidden·canvas 바탕·여백·휴대폰 좌우 끝 넓힘 max-md:-mx-4)은 표(TreatmentTable)가 그린다. 여기서 또 넓히면 휴대폰에서 쪽이 밀린다.
// 이 칸은 그림 칸의 CHART_NO_SIDE_SCROLL과 숫자 표 머리의 canvas 바탕을 맡는다(AC-1209.6).
// 칸은 range.bucket, 표 비교 칸 이름은 range.previous.name이다(빠른 단추는 COMPARE_NAME과 같다, 고른 기간은 '9월' 같은 바로 전 기간, stats-period AC-1705.4)
//
// group-exclude REQ-3709(시안 docs/mockups/group-exclude chartHtml(), design.md '화면'): 머리 오른쪽 모양 단추 [건수]·[총환자 대비 %](ds.segment),
// 요약 줄(합계 · 총환자 중 % · 하루 평균), [건수]면 막대 + 점선 추세선, [총환자 대비 %]면 꺾은선(RateLineChart) + 추세선, 추세 글(왼쪽 2px ink 선, 바탕 없음),
// 안내(+ 추세선 글), 표 칸 일곱. 숫자는 treatmentChart(chartCells·trendFit·trendText·sumLabel·perDayText)다.
// 모양은 mode·onMode(선택)로 받는다: 칸(TreatmentTrendSection)이 줄마다 들고 있어 줄을 닫았다 열어도 그대로다. 두 prop이 없으면 제 상태로 [건수]부터 그린다(AC-3709.7).
// 범례의 추세선은 선을 그었을 때만 있다(그을 칸이 모자라면 선도 범례도 없고 추세 글이 그것을 알린다)

export type ReadyTreatment = Extract<TreatmentRow, { kind: 'ready' }>

const DENSE_OVER = 13
const LABELS: DetailLabels = { closed: '숫자로 보기', open: '접기' }
const MODES: { mode: ChartMode; name: string }[] = [
  { mode: 'count', name: '건수' },
  { mode: 'pct', name: '총환자 대비 %' },
]
const MODE_TITLE: Record<ChartMode, string> = { count: '건수', pct: '총환자 대비' }
const TREND_NOTE = '추세선은 쉬는 날(총환자 0명)과 빗금 칸을 빼고 그었어요.'
const TREND_MARK: LegendItem = { label: '추세선', mark: 'trend' }

// 추세선 직선의 첫·끝 칸 값(그림 부품의 trend 모양)
function trendOf(fit: TrendFit | null): ChartTrend | null {
  if (fit === null) return null
  const at = (x: number) => ({ at: x, value: fit.slope * x + fit.intercept })
  return { from: at(fit.from), to: at(fit.to) }
}

export function TreatmentDetail({
  input,
  item,
  mode,
  onMode,
}: {
  input: StatsInput
  item: ReadyTreatment
  mode?: ChartMode // 그래프 모양(없으면 제 상태)
  onMode?: (mode: ChartMode) => void
}) {
  const [own, setOwn] = useState<ChartMode>('count')
  const shown = mode ?? own
  const choose = (next: ChartMode) => {
    setOwn(next)
    onMode?.(next)
  }
  const pct = shown === 'pct'

  const { bucket } = input.range
  const picked = input.range.period === null
  const { name } = item.group
  const cells = chartCells(input, item)
  const grain = BUCKET_NAME[bucket]
  const caption = `${name} ${grain}별 건수`
  const dense = cells.length > DENSE_OVER
  const fit = trendFit(cells, shown)
  const trend = trendOf(fit)
  const count = item.row.count
  const { patients, openDays } = periodPatients(input.days, input.range.current)

  const buckets: BarBucket[] = cells.map((cell, i) => ({
    key: cell.start,
    label: tickLabel(cell, i, cells.length, bucket),
    rangeLabel: longLabel(cell, bucket),
    state: cell.partial ? 'partial' : 'complete',
    values: [cell.newCount, cell.returningCount],
    comparison: cell.comparison,
  }))
  const points: RatePoint[] = cells.map((cell, i) => ({
    key: cell.start,
    label: tickLabel(cell, i, cells.length, bucket),
    rangeLabel: longLabel(cell, bucket),
    value: cell.pct,
    partial: cell.partial,
  }))
  const anyPartial = cells.some((cell) => cell.partial)
  const trendMark = trend === null ? [] : [TREND_MARK]
  const legend: LegendItem[] = pct
    ? [{ label: '총환자 대비 %', mark: 'line' }, ...trendMark]
    : [
        { label: '신환', mark: 'accent' },
        { label: '재진', mark: 'chart-3' },
        { label: '비교 기간', mark: 'prev' },
        ...(anyPartial ? [{ label: '일부 기간', mark: 'hatch' } satisfies LegendItem] : []),
        ...trendMark,
      ]
  const note = pct
    ? `총환자 대비 = 그 ${grain}의 ${name} 건수 ÷ 그 ${grain}의 총환자예요. ${TREND_NOTE}`
    : `${detailNote(bucket, cells, todayOf(input.range), picked)} ${TREND_NOTE}`
  const table: DetailTable = {
    caption,
    columns: [grain === '일' ? '날짜' : grain, '건수', '총환자', '총환자 대비', '신환', '재진', input.range.previous.name],
    rows: cells.map((cell) => [
      <>
        {longLabel(cell, bucket)}
        {cell.partial && <PartialChip />}
      </>,
      <span key="count" className="font-semibold">
        {`${formatCount(cell.count)}건`}
      </span>,
      `${formatCount(cell.patients)}명`,
      rateText(cell.count, cell.patients),
      formatCount(cell.newCount),
      formatCount(cell.returningCount),
      cell.comparison === null ? '–' : `${formatCount(cell.comparison)}건`,
    ]),
  }
  return (
    <div className="[&_th]:bg-canvas">
      <DetailToggle table={table} labels={LABELS}>
        {({ button, panel }) => (
          <>
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <p className="min-w-0 text-body font-semibold text-ink wrap-anywhere">{`${name} · ${grain}별 ${MODE_TITLE[shown]}`}</p>
              <div role="group" aria-label="그래프 모양" className={`${ds.segment.group} max-md:grid-cols-2`}>
                {MODES.map((choice) => (
                  <button
                    key={choice.mode}
                    type="button"
                    aria-pressed={choice.mode === shown}
                    onClick={() => choose(choice.mode)}
                    className={`${ds.segment.button} ${choice.mode === shown ? ds.segment.on : ds.segment.off}`}
                  >
                    {choice.name}
                  </button>
                ))}
              </div>
            </div>
            <p className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-small text-ink-2 tabular-nums">
              <span>
                {`${sumLabel(input.range)} `}
                <span className="font-semibold text-ink">{`${formatCount(count)}건`}</span>
              </span>
              <span>
                {`총환자 ${formatCount(patients)}명 중 `}
                <span className="font-semibold text-ink">{rateText(count, patients)}</span>
              </span>
              <span>
                {'하루 평균 '}
                <span className="font-semibold text-ink">{`${perDayText(count, openDays)}건`}</span>
                {` (진료한 날 ${formatCount(openDays)}일)`}
              </span>
            </p>
            <div className="mt-2">
              <ChartLegend items={legend} />
            </div>
            <div className={`mt-2 ${thinTotals(cells.length)} ${CHART_NO_SIDE_SCROLL}`}>
              {pct ? (
                <RateLineChart title={`${name} ${grain}별 총환자 대비`} points={points} trend={trend} dense={dense} />
              ) : (
                <StackedBarChart title={caption} unit="건" series={TREND_SERIES} buckets={buckets} compact dense={dense} trend={trend} />
              )}
            </div>
            <p className="mt-3 border-l-2 border-ink pl-3 text-small text-ink">{trendText(fit, cells, shown, bucket)}</p>
            <Note>{note}</Note>
            <div className="mt-2">{button}</div>
            {panel}
          </>
        )}
      </DetailToggle>
    </div>
  )
}

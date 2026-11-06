'use client'

import { ChartLegend, type LegendItem } from '@/components/charts/ChartLegend'
import { formatCount } from '@/components/charts/format'
import { StackedBarChart, type BarBucket } from '@/components/charts/StackedBarChart'
import { treatmentDetail, type TreatmentRow } from '@/components/stats/treatmentView'
import type { StatsInput } from '@/components/stats/view'
import { DetailToggle, type DetailLabels, type DetailTable } from './DetailToggle'
import { CHART_NO_SIDE_SCROLL, Note, PartialChip, thinTotals, todayOf, TREND_SERIES } from './parts'
import { BUCKET_NAME, comparisonAt, detailNote, longLabel, tickLabel } from './trendLabels'

// 처방별 추세 열린 칸 (treatment-trend REQ-1209 AC-1209.2·1209.3·1209.4·1209.6, AC-1206.5 회색 막대·표 비교 칸, design.md '화면').
// 처방 추세 RxDetail과 같은 짜임이다: 제목 · 범례 · 막대(신환·재진 쌓음 + 같은 차례 회색 비교 막대) · 안내 · [숫자로 보기] → 표.
// 다른 점: 전체 폭이라 막대 위 합계는 칸 13개 넘을 때만 숨긴다(시안 showTot = 칸 ≤ 13), 단추 글자가 숫자로 보기·접기다.
// 숫자는 treatmentDetail(TASK-4)이다. 비교하지 않는 묶음(compared 거짓)은 비교 점이 모두 덮이지 않아 회색 막대가 없고 표 비교 칸이 –다.
// 이 칸을 담는 바깥 칸(id·hidden·canvas 바탕·여백·휴대폰 좌우 끝 넓힘 max-md:-mx-4)은 표(TreatmentTable)가 그린다. 여기서 또 넓히면 휴대폰에서 쪽이 밀린다.
// 이 칸은 그림 칸의 CHART_NO_SIDE_SCROLL과 숫자 표 머리의 canvas 바탕을 맡는다(AC-1209.6).
// 칸은 range.bucket, 표 비교 칸 이름은 range.previous.name이다(빠른 단추는 COMPARE_NAME과 같다, 고른 기간은 '9월' 같은 바로 전 기간, stats-period AC-1705.4)

export type ReadyTreatment = Extract<TreatmentRow, { kind: 'ready' }>

const DENSE_OVER = 13
const LABELS: DetailLabels = { closed: '숫자로 보기', open: '접기' }

export function TreatmentDetail({ input, item }: { input: StatsInput; item: ReadyTreatment }) {
  const { bucket } = input.range
  const picked = input.range.period === null
  const { name } = item.group
  const { current, previous } = treatmentDetail(input, item)
  const grain = BUCKET_NAME[bucket]
  const caption = `${name} ${grain}별 건수`
  const buckets: BarBucket[] = current.map((point, i) => ({
    key: point.start,
    label: tickLabel(point, i, current.length, bucket),
    rangeLabel: longLabel(point, bucket),
    state: point.partial ? 'partial' : 'complete',
    values: [point.newCount, point.returningCount],
    comparison: comparisonAt(previous, i),
  }))
  const anyPartial = current.some((point) => point.partial)
  const legend: LegendItem[] = [
    { label: '신환', mark: 'accent' },
    { label: '재진', mark: 'chart-3' },
    { label: '비교 기간', mark: 'prev' },
    ...(anyPartial ? [{ label: '일부 기간', mark: 'hatch' } satisfies LegendItem] : []),
  ]
  const table: DetailTable = {
    caption,
    columns: [grain === '일' ? '날짜' : grain, '건수', '신환', '재진', input.range.previous.name],
    rows: current.map((point, i) => {
      const comparison = comparisonAt(previous, i)
      return [
        <>
          {longLabel(point, bucket)}
          {point.partial && <PartialChip />}
        </>,
        <span key="count" className="font-semibold">
          {`${formatCount(point.count)}건`}
        </span>,
        formatCount(point.newCount),
        formatCount(point.returningCount),
        comparison === null ? '–' : `${formatCount(comparison)}건`,
      ]
    }),
  }
  return (
    <div className="[&_th]:bg-canvas">
      <DetailToggle table={table} labels={LABELS}>
        {({ button, panel }) => (
          <>
            <p className="text-body font-semibold text-ink wrap-anywhere">{`${name} · ${grain}별 건수`}</p>
            <div className="mt-2">
              <ChartLegend items={legend} />
            </div>
            <div className={`mt-2 ${thinTotals(buckets.length)} ${CHART_NO_SIDE_SCROLL}`}>
              <StackedBarChart title={caption} unit="건" series={TREND_SERIES} buckets={buckets} compact dense={buckets.length > DENSE_OVER} />
            </div>
            <Note>{detailNote(bucket, current, todayOf(input.range), picked)}</Note>
            <div className="mt-2">{button}</div>
            {panel}
          </>
        )}
      </DetailToggle>
    </div>
  )
}

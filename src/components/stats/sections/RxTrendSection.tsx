'use client'

import { useId, useState } from 'react'
import { ChartLegend, type LegendItem } from '@/components/charts/ChartLegend'
import { formatCount } from '@/components/charts/format'
import { InlineBar } from '@/components/charts/InlineBar'
import { StackedBarChart, type BarBucket } from '@/components/charts/StackedBarChart'
import { Icon } from '@/components/common/Icon'
import { COMPARE_NAME, rxComparedCells, rxDetail, rxList, type RxDetailPoint, type RxTrendRow, type StatsInput, type StatsPeriod } from '@/components/stats/view'
import { ds } from '@/components/ui/classes'
import { monthOf } from '@/lib/analytics/dates'
import { DetailToggle, type DetailTable } from './DetailToggle'
import { CHART_NO_SIDE_SCROLL, dateWithWeekday, dayNumber, DeltaText, EmptyNote, longDate, monthNumber, NO_RANGE_DATA, Note, onlyThisMonthPartial, PartialChip, PERIOD_NAME, Section, thinTotals, todayOf, TREND_SERIES, yearMonth } from './parts'

// 처방 추세 (stats REQ-513 AC-513.2·513.3·513.4·513.5·513.11·513.12, AC-511.6·511.8·511.9, 시안 notes.md §3 '처방 추세').
// 줄의 막대·눈금은 comparable(끝난 칸끼리의 합)로 그리고 글자 건수는 count다. comparable이 null이면 막대는 count, 눈금 없음, 증감 "비교할 수 없음".
// 줄을 열면 rxDetail 칸마다 같은 차례 비교 점을 comparison으로 넘긴다. 비교 점이 없거나(90일 주 칸 수가 달라서) covered: false이면 null이다. 남는 비교 칸은 그리지 않는다

const TITLE = '처방 추세'
const EMPTY = '불러오면 많이 낸 처방 5가지와 그 흐름이 보여요.'
const GRAIN_NAME: Record<StatsPeriod, '일' | '주' | '달'> = { '7d': '일', '30d': '일', '90d': '주', '12m': '달' }
const DENSE_DETAIL_OVER = 16

// 줄·머리의 칸: 처방 · 건수 · 증감 · 신환 재진 · 꺾쇠(시안 .rxr). '일부 기간'이 있으면 건수 칸이 넓어지고 좁으면 칩이 건수 아래로 내려간다. 휴대폰은 두 줄
const COLUMNS = 'grid grid-cols-[minmax(0,1fr)_84px_176px_132px_16px] items-center gap-x-3'
const COLUMNS_PARTIAL = 'grid grid-cols-[minmax(96px,1fr)_minmax(84px,140px)_176px_132px_16px] items-center gap-x-3'
const PHONE_ROW = 'max-md:grid-cols-[minmax(0,1fr)_auto] max-md:gap-y-1'

// 뺀 짝이 있을 때의 안내(AC-513.12). 12개월은 달, 나머지는 표시 칸과 상관없이 날이다(AC-511.9)
const comparedNote = (period: StatsPeriod, kept: number) =>
  period === '12m' ? `증감과 막대는 끝난 ${kept}달만 견줘요. 건수는 기간 전체예요.` : `증감과 막대는 두 기간 모두 자료가 있는 ${kept}일만 견줘요. 건수는 기간 전체예요.`

export const longLabel = (point: RxDetailPoint, period: StatsPeriod) =>
  GRAIN_NAME[period] === '일' ? dateWithWeekday(point.start) : GRAIN_NAME[period] === '주' ? `${longDate(point.start)} – ${longDate(point.end)}` : yearMonth(point.start)

export function tickLabel(point: RxDetailPoint, i: number, cells: number, period: StatsPeriod): string {
  const grain = GRAIN_NAME[period]
  if (grain === '달') return `${monthNumber(point.start)}월`
  const step = grain === '주' ? 3 : cells <= 7 ? 1 : 7
  return i % step === 0 ? `${monthNumber(point.start)}.${dayNumber(point.start)}` : ''
}

// 같은 차례 비교 점의 건수. 점이 없거나 덮이지 않았으면 null
export function comparisonAt(previous: readonly RxDetailPoint[], i: number): number | null {
  const point = previous[i]
  return point === undefined || !point.covered ? null : point.count
}

export function detailNote(period: StatsPeriod, current: readonly RxDetailPoint[], today: string): string {
  const grain = GRAIN_NAME[period]
  if (grain === '일') return '하루씩 센 건수예요. 회색 막대는 비교 기간의 같은 차례 날이에요.'
  if (grain === '주') return '주는 월요일–일요일이에요. 기간 처음과 끝에 걸린 주는 일부 기간(빗금)이에요. 회색 막대는 비교 기간의 같은 차례 주예요.'
  const gray = '회색 막대는 작년 같은 달이에요.'
  const partial = current.filter((point) => point.partial).map((point) => monthOf(point.start))
  return onlyThisMonthPartial(partial, today) ? `빗금 칸은 아직 끝나지 않은 달이에요(${monthNumber(today)}월은 ${dayNumber(today)}일까지). ${gray}` : gray
}

function RxDetail({ row, input }: { row: RxTrendRow; input: StatsInput }) {
  const { period } = input.range
  const { current, previous } = rxDetail(input, row.code)
  const grain = GRAIN_NAME[period]
  const buckets: BarBucket[] = current.map((point, i) => ({
    key: point.start,
    label: tickLabel(point, i, current.length, period),
    rangeLabel: longLabel(point, period),
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
    caption: `${row.name} ${grain}별 건수`,
    columns: [grain === '일' ? '날짜' : grain, '건수', '신환', '재진', COMPARE_NAME[period]],
    rows: current.map((point, i) => {
      const comparison = comparisonAt(previous, i)
      return [
        <>
          {longLabel(point, period)}
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
    <DetailToggle table={table}>
      {({ button, panel }) => (
        <>
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <p className="text-body font-semibold text-ink wrap-anywhere">{`${row.name} · ${grain}별 건수`}</p>
            <ChartLegend items={legend} />
          </div>
          <div className={`mt-2 ${thinTotals(buckets.length)} ${CHART_NO_SIDE_SCROLL}`}>
            <StackedBarChart title={`${row.name} ${grain}별 건수`} unit="건" series={TREND_SERIES} buckets={buckets} compact dense={buckets.length > DENSE_DETAIL_OVER} />
          </div>
          <Note>{detailNote(period, current, todayOf(input.range))}</Note>
          <div>{button}</div>
          {panel}
        </>
      )}
    </DetailToggle>
  )
}

function RxRow({ row, max, open, onToggle, input, columns }: { row: RxTrendRow; max: number; open: boolean; onToggle: () => void; input: StatsInput; columns: string }) {
  const panelId = useId()
  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className={`${columns} ${PHONE_ROW} w-full cursor-pointer border-b border-line py-3 text-left text-body text-ink transition hover:bg-canvas ${ds.focusRing}`}
      >
        <span className="min-w-0">
          <span className="block truncate font-semibold">{row.name}</span>
          <span className="mt-1.5 block [&>span]:w-full">
            <InlineBar current={row.comparable?.current ?? row.count} previous={row.comparable?.previous ?? null} max={max} />
          </span>
        </span>
        <span className="flex flex-wrap items-center justify-end gap-x-1.5 gap-y-0.5 whitespace-nowrap font-semibold tabular-nums">
          {`${formatCount(row.count)}건`}
          {row.partial && <PartialChip className="" />}
        </span>
        <span className="text-small font-semibold">
          <DeltaText delta={row.delta} unit="건" />
        </span>
        <span className="whitespace-nowrap text-small text-ink-2 tabular-nums max-md:text-right">{`신환 ${formatCount(row.newCount)} · 재진 ${formatCount(row.returningCount)}`}</span>
        <Icon name="chev" size={16} className={`text-muted transition max-md:hidden ${open ? 'rotate-180' : ''}`} />
      </button>
      <div id={panelId} hidden={!open} className="border-b border-line bg-canvas p-4 max-md:-mx-4 [&_th]:bg-canvas">
        {open && <RxDetail row={row} input={input} />}
      </div>
    </li>
  )
}

export function RxTrendSection({ input, saved, className }: { input: StatsInput; saved: boolean; className?: string }) {
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set())
  const rows = rxList(input)
  if (rows === null) {
    return (
      <Section title={TITLE} className={className}>
        <EmptyNote>{saved ? NO_RANGE_DATA : EMPTY}</EmptyNote>
      </Section>
    )
  }
  const { period } = input.range
  const { kept, dropped } = rxComparedCells(input)
  // 목록에서 그리는 값(막대·눈금) 가운데 가장 큰 값
  const max = Math.max(...rows.flatMap((row) => (row.comparable === null ? [row.count] : [row.comparable.current, row.comparable.previous])))
  const columns = rows.some((row) => row.partial) ? COLUMNS_PARTIAL : COLUMNS
  const toggle = (code: string) => {
    const next = new Set(opened)
    if (!next.delete(code)) next.add(code)
    setOpened(next)
  }
  return (
    <Section title={TITLE} desc="많이 낸 처방 5가지 · 건수" className={className}>
      <div aria-hidden="true" className={`${columns} mt-2 h-9 border-b border-line text-small font-medium text-muted max-md:hidden`}>
        <span>처방</span>
        <span className="text-right">{PERIOD_NAME[period]}</span>
        <span>{`${COMPARE_NAME[period]}보다`}</span>
        <span>신환 · 재진</span>
        <span />
      </div>
      <ul className="list-none">
        {rows.map((row) => (
          <RxRow key={row.code} row={row} max={max} open={opened.has(row.code)} onToggle={() => toggle(row.code)} input={input} columns={columns} />
        ))}
      </ul>
      {dropped && kept >= 1 && <p className="mt-3 text-small text-muted">{comparedNote(period, kept)}</p>}
      <p className="mt-3 text-small text-muted">{`줄을 누르면 그 처방의 ${GRAIN_NAME[period]}별 건수와 신환·재진이 열려요. 막대 안 회색 눈금은 비교 기간 건수예요. 건 = 날마다 그 처방을 받은 환자 수를 더한 값이에요.`}</p>
      <p className="mt-1 text-small text-ink-2">금액·소모량은 매출 탭에서 볼 수 있어요</p>
    </Section>
  )
}

'use client'

import { formatCount, formatRate } from '@/components/charts/format'
import { InlineBar } from '@/components/charts/InlineBar'
import { periodDesc, revisitRates, type FirstRevisit, type RevisitRates, type StatsInput, type StatsPeriod, type StatsRateCell } from '@/components/stats/view'
import { compareYmd } from '@/lib/analytics/dates'
import type { DateRange } from '@/types/dates'
import { DetailToggle, type DetailTable } from './DetailToggle'
import { EmptyNote, hasRows, longDate, NO_RANGE_DATA, Note, Section, yearMonth } from './parts'

// 신환 재방문율 + 첫 재방문까지 날수 (stats REQ-513 AC-513.1·513.3·513.4·513.10, AC-511.4, 시안 notes.md §3 '신환 재방문율').
// 날짜는 revisitRates의 d30Cohort·firstRevisit의 from·to를 그대로, 숫자는 비율 칸의 within·cohort를 쓴다.
// 첫 재방문은 first.items 차례 그대로 그린다(시안 .rk). 막대 폭은 다섯 가운데 가장 큰 값 대비이고 '아직 다시 안 옴'만 막대가 line-strong이다

const TITLE = '신환 재방문율'
const DESC = '처음 온 환자가 다시 온 비율'
const FIRST_TITLE = '첫 재방문까지 날수'
const EMPTY = '불러오면 처음 온 환자가 7·14·30일 안에 다시 온 비율이 보여요.'
const OTHER_PERIOD = ' 최근 90일이나 최근 12개월에서 볼 수 있어요.'
const NO_DATA = '자료 없음'
const IN_PROGRESS = '집계 중'

type Line = { name: string; days: 7 | 14 | 30; cell: StatsRateCell }
// null = 고른 기간(stats-period). 고른 기간은 일 칸이라 글은 일 기간과 같고 다른 기간을 권하지 않는다
type Period = StatsPeriod | null

const linesOf = (rates: RevisitRates): Line[] => [
  { name: '7일 안에 다시 옴', days: 7, cell: rates.d7 },
  { name: '14일 안에 다시 옴', days: 14, cell: rates.d14 },
  { name: '30일 안에 다시 옴', days: 30, cell: rates.d30 },
]

const asksOtherPeriod = (period: Period) => period === '7d' || period === '30d'
const rangeText = ({ from, to }: DateRange) => `${longDate(from)} – ${longDate(to)}`

function captionOf({ cell, days }: Line, period: Period, d30Cohort: DateRange | null): string {
  if (cell.kind === 'none') return NO_DATA
  if (cell.kind === 'in-progress') return `신환이 온 뒤 ${days}일이 지나야 셀 수 있어요.${days === 30 && asksOtherPeriod(period) ? OTHER_PERIOD : ''}`
  const counts = `신환 ${formatCount(cell.cohort)}명 가운데 ${formatCount(cell.within)}명`
  // 최근 30일의 30일 줄은 AC-513.10이 caption을 정한다
  if (days === 30 && d30Cohort !== null) return `${rangeText(d30Cohort)}에 온 ${counts} · 온 뒤 30일이 지난 가장 최근 신환이에요`
  return cell.excluded ? `${counts} · 온 뒤 ${days}일이 안 된 ${period === '12m' ? '달' : '날'}의 신환은 빼고 셌어요` : counts
}

function LineRow({ line, caption }: { line: Line; caption: string }) {
  const { cell } = line
  return (
    <li className="border-t border-line py-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-body text-ink-2">{line.name}</span>
        <span className={`whitespace-nowrap text-subtitle font-semibold tabular-nums ${cell.kind === 'rate' ? 'text-ink' : 'text-muted'}`}>
          {cell.kind === 'rate' ? `${formatRate(cell.value)}%` : cell.kind === 'in-progress' ? IN_PROGRESS : '–'}
        </span>
      </div>
      {cell.kind === 'rate' && (
        <span className="mt-1.5 block [&>span]:w-full">
          <InlineBar current={cell.value} previous={null} max={1} />
        </span>
      )}
      <p className="mt-1 text-caption text-muted">{caption}</p>
    </li>
  )
}

function baseLine(first: FirstRevisit, period: Period): string {
  const cohort = formatCount(first.cohort)
  if (period === '12m') return `${yearMonth(first.from)} – ${yearMonth(first.to)}에 온 신환 ${cohort}명 기준 (온 뒤 30일이 지난 달만)`
  return `${rangeText(first)}에 온 신환 ${cohort}명 기준 (온 뒤 30일이 지난 날만)`
}

// 불러온 자료 끝날: 덮은 기간 끝(끝난 날까지). 덮은 기간을 못 읽었으면 가장 늦은 줄의 날
function lastDay({ covered, days }: StatsInput): string | null {
  const ends = covered.length > 0 ? covered.map((range) => range.to) : days.map((row) => row.day)
  return ends.reduce<string | null>((latest, day) => (latest === null || compareYmd(day, latest) > 0 ? day : latest), null)
}

// 줄 = 이름 · 막대 · 값 + 몫. 값 칸은 최소 폭을 둬서 막대 길이를 줄끼리 견줄 수 있게 한다. 이름은 자르지 않는다
function FirstRevisitList({ first }: { first: FirstRevisit }) {
  const max = Math.max(...first.items.map((item) => item.count))
  return (
    <ol aria-label={FIRST_TITLE} className="mt-2">
      {first.items.map((item) => (
        <li key={item.key} className={`grid min-h-9 grid-cols-[112px_minmax(0,1fr)_auto] items-center gap-x-3 border-t border-line ${item.key === 'never' ? '[&_.bg-accent]:bg-line-strong' : ''}`}>
          <span className="text-small text-ink-2">{item.label}</span>
          <span className="min-w-0 [&>span]:w-full">
            <InlineBar current={item.count} previous={null} max={max} />
          </span>
          <span className="flex min-w-22 items-baseline justify-end gap-1.5 whitespace-nowrap">
            <span className="text-small font-semibold text-ink tabular-nums">{`${formatCount(item.count)}명`}</span>
            <span className="text-small text-muted tabular-nums">{`${formatRate(item.count / first.cohort)}%`}</span>
          </span>
        </li>
      ))}
    </ol>
  )
}

function FirstRevisitBlock({ rates, input }: { rates: RevisitRates; input: StatsInput }) {
  const { period } = input.range
  const first = rates.firstRevisit
  const heading = <h3 className="mt-5 text-subtitle font-semibold text-ink">{FIRST_TITLE}</h3>
  if (first === null) {
    return (
      <>
        {heading}
        {rates.d30.kind === 'none' ? (
          <EmptyNote>{NO_RANGE_DATA}</EmptyNote>
        ) : (
          <EmptyNote title={IN_PROGRESS}>{`신환이 온 뒤 30일이 지나야 날수를 셀 수 있어요.${asksOtherPeriod(period) ? OTHER_PERIOD : ''}`}</EmptyNote>
        )}
      </>
    )
  }
  const end = lastDay(input)
  return (
    <>
      {heading}
      <p className="mt-1 text-caption text-muted">{baseLine(first, period)}</p>
      <FirstRevisitList first={first} />
      {end !== null && <Note>{`'30일 넘어 다시 옴'은 불러온 자료 끝날(${longDate(end)})까지 본 수라, 다시 불러오면 늘 수 있어요.`}</Note>}
    </>
  )
}

function tableOf(lines: readonly Line[], first: FirstRevisit | null): DetailTable {
  const firstRows =
    first === null ? [] : first.items.map((item) => [`첫 재방문 ${item.label}`, `${formatCount(item.count)}명`, `${formatCount(first.cohort)}명`, `${formatRate(item.count / first.cohort)}%`])
  return {
    caption: TITLE,
    columns: ['구분', '다시 온 신환', '센 신환', '비율'],
    rows: [
      ...lines.map(({ name, cell }) =>
        cell.kind === 'rate'
          ? [name, `${formatCount(cell.within)}명`, `${formatCount(cell.cohort)}명`, <span key="rate" className="font-semibold">{`${formatRate(cell.value)}%`}</span>]
          : [name, '–', '–', cell.kind === 'in-progress' ? IN_PROGRESS : NO_DATA],
      ),
      ...firstRows,
    ],
  }
}

export function RevisitSection({ input, saved, className }: { input: StatsInput; saved: boolean; className?: string }) {
  if (!hasRows(input)) {
    return (
      <Section title={TITLE} desc={saved ? periodDesc(DESC, input.range) : undefined} className={className}>
        <EmptyNote>{saved ? NO_RANGE_DATA : EMPTY}</EmptyNote>
      </Section>
    )
  }
  const rates = revisitRates(input)
  const lines = linesOf(rates)
  return (
    <DetailToggle table={tableOf(lines, rates.firstRevisit)}>
      {({ button, panel }) => (
        <Section title={TITLE} desc={periodDesc(DESC, input.range)} action={button} className={className}>
          <ul className="mt-2 list-none">
            {lines.map((line) => (
              <LineRow key={line.days} line={line} caption={captionOf(line, input.range.period, rates.d30Cohort)} />
            ))}
          </ul>
          <FirstRevisitBlock rates={rates} input={input} />
          {panel}
        </Section>
      )}
    </DetailToggle>
  )
}

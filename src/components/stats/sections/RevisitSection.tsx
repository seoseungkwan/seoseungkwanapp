'use client'

import { Icon } from '@/components/common/Icon'
import { formatCount, formatRate } from '@/components/charts/format'
import { InlineBar } from '@/components/charts/InlineBar'
import { periodDesc, revisitRates, type FirstRevisit, type FirstRevisitKey, type RevisitRates, type StatsInput, type StatsPeriod, type StatsRange, type StatsRateCell } from '@/components/stats/view'
import { ds } from '@/components/ui/classes'
import { compareYmd } from '@/lib/analytics/dates'
import type { DateRange } from '@/types/dates'
import { DetailToggle, type DetailTable } from './DetailToggle'
import { HowCounted } from './HowCounted'
import { EmptyNote, hasRows, longDate, NO_RANGE_DATA, Note, Section, yearMonth } from './parts'

// 신환 재방문율 + 첫 재방문까지 날수 (stats REQ-513 AC-513.1·513.3·513.4·513.10, AC-511.4, first90 REQ-4412 AC-4412.3, REQ-4417 AC-4417.2,
// 시안 docs/mockups/first90/redesign.html .s-rates·.s-why). 줄 셋은 768px 이상 세 칸이고 비율 줄은 인원 · 대상 기간(revisitRates.spans) · 관찰 기준을 적는다.
// 셀 수 있는 줄이 둘 이상이면 줄 아래에 대상이 서로 다른 까닭 단락을 둔다. 첫 재방문까지 날수는 처음 닫힌 접는 칸(details) 안이고 안 내용은 그대로다.
// 날짜는 revisitRates의 d30Cohort·firstRevisit의 from·to를 그대로, 숫자는 비율 칸의 within·cohort를 쓴다.
// 첫 재방문은 first.items 차례 그대로 그린다(시안 .rk). 막대 폭은 다섯 가운데 가장 큰 값 대비이고 '아직 다시 안 옴'만 막대가 line-strong이다.
// 합친 넷(stats-load-range AC-3306.2)이면 넷 가운데 가장 큰 값 대비, 합친 줄만 line-strong이고 '30일 넘어 다시 옴' 끝날 안내는 없다.
// 끝날 안내는 "어떻게 세나요?" 안에 접는다(stats-pc-ux AC-4004.2 ④). 안내가 없으면 접는 칸도 없다(기본값 11)

const TITLE = '신환 재방문율'
const DESC = '처음 온 환자가 온 다음 날부터 그 날수 안에 다시 온 비율'
const FIRST_TITLE = '첫 재방문까지 날수'
const EMPTY = '불러오면 처음 온 환자가 7·14·30일 안에 다시 온 비율이 보여요.'
const OTHER_PERIOD = ' 최근 90일이나 최근 12개월에서 볼 수 있어요.'
const NO_DATA = '자료 없음'
const IN_PROGRESS = '집계 중'
const WHY = '세 비율은 대상 신환이 서로 달라요. 온 뒤 그 날수가 다 지난 신환만 세기 때문이에요.'
const WHY_END = '그래서 30일 비율이 14일보다 낮게 나올 수 있어요. 같은 신환끼리 보면 30일 비율은 14일보다 낮을 수 없어요.'
// 까닭 단락: 옅은 바탕의 작은 칸(테두리 없음, 시안 .s-why)
const WHY_BOX = 'mt-3 rounded-st-sm bg-st-canvas px-3 py-2 text-small text-st-ink-2'
// 접는 칸 머리(RxPickAgain의 details 머리와 같은 글자 단추 모양). 꺾쇠는 펼치면 180°
const FOLD_SUMMARY = `inline-flex min-h-8 cursor-pointer list-none items-center gap-1 rounded-control text-small font-medium text-accent-strong ${ds.focusRing} max-md:min-h-11 [&::-webkit-details-marker]:hidden`

type Line = { name: string; days: 7 | 14 | 30; cell: StatsRateCell; span: DateRange | null }
// null = 고른 기간(stats-period). 고른 기간은 일 칸이라 글은 일 기간과 같고 다른 기간을 권하지 않는다
type Period = StatsPeriod | null

const linesOf = (rates: RevisitRates): Line[] => [
  { name: '7일 안에 다시 옴', days: 7, cell: rates.d7, span: rates.spans.d7 },
  { name: '14일 안에 다시 옴', days: 14, cell: rates.d14, span: rates.spans.d14 },
  { name: '30일 안에 다시 옴', days: 30, cell: rates.d30, span: rates.spans.d30 },
]

const asksOtherPeriod = (period: Period) => period === '7d' || period === '30d'
const rangeText = ({ from, to }: DateRange) => `${longDate(from)} – ${longDate(to)}`

// 비율이 아닌 줄의 글(집계 중 · 자료 없음). 지금 글 그대로다
function waitingText({ cell, days }: Line, period: Period): string {
  if (cell.kind === 'in-progress') return `신환이 온 뒤 ${days}일이 지나야 셀 수 있어요.${days === 30 && asksOtherPeriod(period) ? OTHER_PERIOD : ''}`
  return NO_DATA
}

// 대상 기간 글: 12개월(달 칸)은 달, 나머지는 날
const spanText = (span: DateRange, grain: StatsRange['grain']) => (grain === 'month' ? `${yearMonth(span.from)} – ${yearMonth(span.to)}` : rangeText(span))

// 줄 하나(시안 .s-rate): 이름 · 비율(크게) · 막대 · 인원 · 대상 기간 + 관찰 기준. 768px 미만은 이름과 비율이 한 줄이다
function LineRow({ line, range }: { line: Line; range: StatsRange }) {
  const { cell } = line
  const rest = 'max-md:col-span-2'
  return (
    <li className="min-w-0 max-md:grid max-md:grid-cols-[minmax(0,1fr)_auto] max-md:items-baseline max-md:gap-x-2">
      <p className="text-body font-semibold text-st-ink-2">{line.name}</p>
      <span
        className={`block whitespace-nowrap text-metric font-semibold tabular-nums md:mt-0.5 max-md:text-heading-m ${cell.kind === 'rate' ? 'text-st-ink' : 'text-st-muted'}`}
      >
        {cell.kind === 'rate' ? `${formatRate(cell.value)}%` : cell.kind === 'in-progress' ? IN_PROGRESS : '–'}
      </span>
      {cell.kind === 'rate' ? (
        <>
          <span className={`mt-1.5 block [&>span]:w-full ${rest}`}>
            <InlineBar current={cell.value} previous={null} max={1} motion />
          </span>
          <p className={`mt-2 text-body font-semibold tabular-nums text-st-ink ${rest}`}>{`신환 ${formatCount(cell.cohort)}명 중 ${formatCount(cell.within)}명`}</p>
          {line.span !== null && (
            <p className={`mt-0.5 text-small text-st-muted ${rest}`}>
              <span className="block">{`대상: ${spanText(line.span, range.grain)}에 온 신환`}</span>
              <span className="block">{`온 뒤 ${line.days}일이 다 지난 신환만 셌어요`}</span>
            </p>
          )}
        </>
      ) : (
        <p className={`mt-1 text-small text-st-muted ${rest}`}>{waitingText(line, range.period)}</p>
      )}
    </li>
  )
}

// 줄 아래 까닭(AC-4412.3). 셀 수 있는 줄이 둘보다 적으면 없다. 최근 30일의 30일 줄은 그 앞 30일 신환이라 그 날짜를 적는다
function whyText(lines: readonly Line[], rates: RevisitRates, period: Period): string | null {
  if (lines.filter((line) => line.cell.kind === 'rate').length < 2) return null
  const cohort = period === '30d' && rates.d30.kind === 'rate' ? rates.d30Cohort : null
  const before = cohort !== null ? [`30일은 최근 30일 신환이 아직 30일이 안 지나서 그 앞 30일(${rangeText(cohort)})에 온 신환을 셌어요.`] : []
  return [WHY, ...before, WHY_END].join(' ')
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

// '아직 다시 안 옴'과 그것을 품은 합친 줄(stats-load-range AC-3306.2)만 막대가 line-strong이다
const notBack = (key: FirstRevisitKey) => key === 'never' || key === 'after30OrNever'

// 줄 = 이름 · 막대 · 값 + 몫. 값 칸은 최소 폭을 둬서 막대 길이를 줄끼리 견줄 수 있게 한다. 이름은 자르지 않는다
function FirstRevisitList({ first }: { first: FirstRevisit }) {
  const max = Math.max(...first.items.map((item) => item.count))
  return (
    <ol aria-label={FIRST_TITLE} className="mt-2">
      {first.items.map((item) => (
        <li key={item.key} className={`grid min-h-9 grid-cols-[112px_minmax(0,1fr)_auto] items-center gap-x-3 border-t border-line ${notBack(item.key) ? '[&_.bg-accent]:bg-line-strong' : ''}`}>
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

// 첫 재방문까지 날수: 처음 닫힌 접는 칸(details, AC-4412.3). 안 내용(기준 줄 · 목록 · 끝날 안내, 없을 때 글)은 그대로다
function FirstRevisitBlock({ rates, input }: { rates: RevisitRates; input: StatsInput }) {
  return (
    <details className="group mt-3">
      <summary className={FOLD_SUMMARY}>
        <span>{FIRST_TITLE}</span>
        <Icon name="chev" size={14} className="transition group-open:rotate-180" />
      </summary>
      <FirstRevisitBody rates={rates} input={input} />
    </details>
  )
}

function FirstRevisitBody({ rates, input }: { rates: RevisitRates; input: StatsInput }) {
  const { period } = input.range
  const first = rates.firstRevisit
  if (first === null) {
    return (
      <>
        {rates.d30.kind === 'none' ? (
          <EmptyNote>{NO_RANGE_DATA}</EmptyNote>
        ) : (
          <EmptyNote title={IN_PROGRESS}>{`신환이 온 뒤 30일이 지나야 날수를 셀 수 있어요.${asksOtherPeriod(period) ? OTHER_PERIOD : ''}`}</EmptyNote>
        )}
      </>
    )
  }
  // 끝날 안내는 '30일 넘어 다시 옴' 줄이 있을 때만이다(합친 넷이면 그 줄이 없다, AC-3306.2)
  const end = first.items.some((item) => item.key === 'after30') ? lastDay(input) : null
  return (
    <>
      <p className="mt-1 text-caption text-muted">{baseLine(first, period)}</p>
      <FirstRevisitList first={first} />
      {end !== null && (
        <HowCounted>
          <Note>{`'30일 넘어 다시 옴'은 불러온 자료 끝날(${longDate(end)})까지 본 수라, 다시 불러오면 늘 수 있어요.`}</Note>
        </HowCounted>
      )}
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
  const why = whyText(lines, rates, input.range.period)
  return (
    <DetailToggle table={tableOf(lines, rates.firstRevisit)}>
      {({ button, panel }) => (
        <Section title={TITLE} desc={periodDesc(DESC, input.range)} action={button} className={className}>
          <ul className="mt-3 grid list-none grid-cols-3 gap-6 max-md:grid-cols-1 max-md:gap-4">
            {lines.map((line) => (
              <LineRow key={line.days} line={line} range={input.range} />
            ))}
          </ul>
          {why !== null && <p className={WHY_BOX}>{why}</p>}
          <FirstRevisitBlock rates={rates} input={input} />
          {panel}
        </Section>
      )}
    </DetailToggle>
  )
}

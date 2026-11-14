import { formatCount } from '@/components/charts/format'
import { KpiStat } from '@/components/charts/KpiStat'
import type { BarBucket } from '@/components/charts/StackedBarChart'
import type { RevenueCell } from '@/components/stats/revenueView'
import { missingDays, patientTrend, summaryCells, type StatsInput, type SummaryCell } from '@/components/stats/view'
import { addMonths, monthOf } from '@/lib/analytics/dates'
import { DeltaText, EmptyNote, monthNumber, NO_RANGE_DATA, PartialChip, Section, todayOf } from './parts'

// 기간 요약 (stats REQ-513 AC-513.1·513.4, AC-511.2, 시안 notes.md §3 '기간 요약'). 칸은 key로 고른다.
// 값이 있는 칸의 아래 글·칩은 KpiStat 자리가 없어 그 아래에 둔다. 넷째 칸(값이 증감)은 대시보드 DeltaStat과 같은 글자 단계다.
// 둘째 줄(stats-revenue REQ-4106, 시안 docs/mockups/stats-revenue): revenue(revenueCells 네 칸)를 주면 첫 줄 바로 아래 같은 칸 모양·같은 CELLS·휴대폰 2칸 × 2줄로 매출 네 칸. 주지 않으면 지금 마크업 그대로다

const EMPTY = '숫자를 불러오면 이 기간의 평균 환자 수와 신환·재진이 보여요.'

// 숫자 칸 넷: 위아래 16·좌우 20, 첫 칸 왼쪽 0, 칸 사이 1px line. 768px 미만 2칸 × 2줄(대시보드 숫자 줄과 같다)
const CELLS = [
  'min-w-0 py-4 pr-5 pl-0 max-md:py-3 max-md:pr-4',
  'min-w-0 border-l border-line py-4 px-5 max-md:py-3 max-md:px-4',
  'min-w-0 border-l border-line py-4 pr-5 pl-5 max-md:border-t max-md:border-l-0 max-md:py-3 max-md:pr-4 max-md:pl-0',
  'min-w-0 border-l border-line py-4 px-5 max-md:border-t max-md:py-3 max-md:px-4',
] as const

// 고른 기간(stats-period AC-1704.1): PC는 한 줄(비교 칸 1~2개라 4·5칸), 768px 미만은 평균·신환·재진 셋이 한 줄이고 비교 칸마다 한 줄(전체 폭)이다
const PICK_CELLS = [
  'min-w-0 py-4 pr-5 pl-0 max-md:py-3 max-md:pr-3',
  'min-w-0 border-l border-line py-4 px-5 max-md:py-3 max-md:px-3',
  'min-w-0 border-l border-line py-4 px-5 max-md:py-3 max-md:px-3',
] as const
const PICK_COMPARE = 'min-w-0 border-l border-line py-4 px-5 max-md:col-span-3 max-md:border-t max-md:border-l-0 max-md:py-3 max-md:px-0'
const PICK_GRID: Record<number, string> = { 4: 'grid-cols-4', 5: 'grid-cols-5' }

const isCompare = (cell: SummaryCell) => cell.key === 'compare' || cell.key === 'lastYear'

// 매출 칸 값 글은 금액 글('1억 3,261만')이라 KpiStat(숫자만 받음)과 DeltaText(Delta를 셈)를 쓰지 못한다. 같은 마크업·같은 글자 단계로 그린다
const REVENUE_GRID = 'grid grid-cols-4 border-b border-line max-md:grid-cols-2 max-md:[&_.text-metric]:text-heading-m'
const VALUE_TONE = { ink: 'text-ink', warn: 'text-warning', none: 'text-muted' } as const
const DELTA_TONE = { up: 'text-positive', down: 'text-negative', flat: 'text-muted' } as const
const ARROW = { up: '▲', down: '▼' } as const

function RevenueCellView({ cell }: { cell: RevenueCell }) {
  const note = cell.note !== null && <p className="text-small text-muted">{cell.note}</p>
  const { tone } = cell
  if (tone === 'up' || tone === 'down' || tone === 'flat') {
    // 증감 칸: 꾸밈 ▲·▼(aria-hidden) + 글 + 방향 글('늘어남'·'줄어듦'). 색만 쓰지 않는다(UI_GUIDE)
    return (
      <>
        <div className="flex h-7 items-start">
          <span className="text-small text-muted">{cell.label}</span>
        </div>
        <p className="mt-1 text-metric font-semibold max-md:text-heading-m">
          <span className={`inline-flex flex-wrap items-baseline gap-x-1.5 tabular-nums ${DELTA_TONE[tone]}`}>
            <span>
              {tone !== 'flat' && <span aria-hidden="true">{`${ARROW[tone]} `}</span>}
              {cell.value}
            </span>
            {cell.srText && <span className="text-small font-medium">{cell.srText}</span>}
          </span>
        </p>
        {note}
      </>
    )
  }
  return (
    <>
      <div className="min-w-0">
        <div className="flex h-7 items-start justify-between gap-2">
          <span className="text-small text-muted">{cell.label}</span>
        </div>
        <p className={`mt-1 text-metric font-semibold tabular-nums ${VALUE_TONE[tone]}`}>
          {cell.value}
          {cell.unit !== null && <span className="ml-0.5 text-body font-medium tracking-normal text-muted">{cell.unit}</span>}
        </p>
      </div>
      {note}
    </>
  )
}

function Cell({ cell }: { cell: SummaryCell }) {
  if (isCompare(cell) && cell.delta !== null) {
    return (
      <>
        <div className="flex h-7 items-start">
          <span className="text-small text-muted">{cell.label}</span>
        </div>
        <p className="mt-1 text-metric font-semibold max-md:text-heading-m">
          <DeltaText delta={cell.delta} unit="명" />
        </p>
        <p className="text-small text-muted">{cell.note}</p>
      </>
    )
  }
  return (
    <>
      <KpiStat label={cell.label} value={cell.value} format="count" unit="명" emptyText={cell.note} />
      {cell.value !== null && (
        <p className="text-small text-muted">
          {cell.note}
          {cell.partial && <PartialChip />}
        </p>
      )}
    </>
  )
}

// '12m'에서 오늘이 든 달이 덜 끝난 칸일 때만 쓰는 글. 지난 달의 덜 덮인 칸은 칩만 보인다
function monthNote(input: StatsInput, trend: readonly BarBucket[], hasAverage: boolean): string | null {
  if (input.range.period !== '12m') return null
  const today = todayOf(input.range)
  const thisMonth = monthOf(today)
  if (!trend.some((bucket) => bucket.key === thisMonth && bucket.state !== 'complete')) return null
  const month = monthNumber(today)
  if (hasAverage) return `${month}월은 아직 끝나지 않은 달이라 평균과 견주기에서 빼요(작년 ${month}월도 빼요). 신환·재진 합계에는 넣어요.`
  const next = monthNumber(`${addMonths(thisMonth, 1)}-01`)
  return `끝난 달 숫자가 아직 없어요. ${month}월은 끝나지 않은 달이라 평균에 넣지 않아요. ${next}월 1일이 지나면 평균이 보여요.`
}

export function PeriodSummary({ input, saved, revenue, className }: { input: StatsInput; saved: boolean; revenue?: readonly RevenueCell[]; className?: string }) {
  const trend = patientTrend(input)
  if (trend === null) {
    return (
      <Section title="기간 요약" className={className}>
        <EmptyNote>{saved ? NO_RANGE_DATA : EMPTY}</EmptyNote>
      </Section>
    )
  }
  const cells = summaryCells(input)
  const hasAverage = cells.some((cell) => cell.key === 'average' && cell.value !== null)
  const note = monthNote(input, trend, hasAverage)
  const picked = input.range.period === null
  const missing = missingDays(input)
  const desc = `${input.range.name} · ${input.range.label}${missing > 0 ? ` · 자료 없는 날 ${formatCount(missing)}일은 빼고 셌어요` : ''}`
  const grid = picked ? `${PICK_GRID[cells.length] ?? 'grid-cols-4'} border-b border-line max-md:grid-cols-3` : 'grid-cols-4 border-b border-line max-md:grid-cols-2'
  return (
    <Section title="기간 요약" desc={desc} className={className}>
      <div className={`mt-2 grid ${grid} max-md:[&_.text-metric]:text-heading-m`}>
        {cells.map((cell, i) => (
          <div key={cell.key} className={picked ? (isCompare(cell) ? PICK_COMPARE : PICK_CELLS[i]) : CELLS[i]}>
            <Cell cell={cell} />
          </div>
        ))}
      </div>
      {revenue && (
        <div className={REVENUE_GRID}>
          {revenue.map((cell, i) => (
            <div key={cell.key} className={CELLS[i]}>
              <RevenueCellView cell={cell} />
            </div>
          ))}
        </div>
      )}
      {note !== null && <p className="mt-3 max-w-208 text-small text-muted">{note}</p>}
    </Section>
  )
}

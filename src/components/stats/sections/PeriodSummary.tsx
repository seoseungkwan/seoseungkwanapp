import Link from 'next/link'
import { formatCount } from '@/components/charts/format'
import type { BarBucket } from '@/components/charts/StackedBarChart'
import { missingDays, patientTrend, summaryCells, summaryDesc, type StatsInput, type SummaryCell } from '@/components/stats/view'
import { ds } from '@/components/ui/classes'
import { addMonths, monthOf } from '@/lib/analytics/dates'
import { EmptyNote, monthNumber, NO_RANGE_DATA, StatsCard, todayOf, useSectionAnchor } from './parts'
import { deltaLine, SummaryCell as CellView, type SummaryLine } from './SummaryCell'

// 환자 요약 (first90 REQ-4403 AC-4403.1~AC-4403.3, design.md 5-0, 시안 docs/mockups/first90/redesign.html #s-sum-pat. 옛 기간 요약 stats REQ-513).
// 큰 카드(StatsCard) 하나: h2 "환자 요약" + 옆 글(증감은 {비교 이름}과/와 비교) → 칸 넷(하루 평균 내원 · 신환 · 90일초진 · 재진, PC 한 줄 · 768px 미만 2칸 × 2줄).
// 증감은 칸 안 숫자 아래 줄이다(넷째 '비교 기간보다' 칸은 없다). 고른 기간은 평균 칸에만 증감이 있고 작년 비교는 둘째 줄이다.
// 바로가기 자리(SectionAnchor stats-summary) 안이면 이 카드가 그 id를 갖는다. 매출 요약은 StatsSections가 이 카드 바로 뒤에 따로 놓는다(AC-4408.2).
// 90일초진을 셀 수 없으면(first90 없는 날) 칸은 '확인 불가'이고 아래에 새 도우미 안내 글을 둔다(AC-4403.3)

const TITLE = '환자 요약'
const EMPTY = '숫자를 불러오면 이 기간의 평균 환자 수와 신환·재진이 보여요.'
const UNKNOWN_VALUE = '확인 불가'
const HELPER_LEAD = '90일초진과 참고 금액은 새 도우미(0.7.0)가 있어야 보여요.'
const HELPER_REST = '비트 PC 연결 화면에서 새 도우미를 받아 깐 뒤 [비트에서 불러오기]를 다시 누르면 보여요.'
const HELPER_LINK = '새 도우미 내려받기'

// 칸 넷: 칸 사이 세로 선, 첫 칸 왼쪽 0. 768px 미만 2칸 × 2줄이고 아랫줄 위에 선
const GRID = 'grid grid-cols-4 max-md:grid-cols-2 max-md:gap-x-4 max-md:gap-y-3'
const CELLS = [
  'pr-5 max-md:pr-0',
  'border-l border-st-line px-5 max-md:border-l-0 max-md:px-0',
  'border-l border-st-line px-5 max-md:border-t max-md:border-l-0 max-md:px-0 max-md:pt-3',
  'border-l border-st-line px-5 max-md:border-t max-md:border-l-0 max-md:px-0 max-md:pt-3',
] as const
const NOTE = 'mt-3 text-small text-st-muted'
const HELPER_BOX = 'mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-st-sm bg-warning-soft px-4 py-3 text-body text-st-warn-ink'

// 칸 하나. 값이 없으면 증감 줄 없이 '–' + 까닭 글이다. 90일초진·재진의 늘고 줆은 좋고 나쁨이 아니라 증감 줄을 ink-2로 그린다
function PatientCell({ cell, className }: { cell: SummaryCell; className: string }) {
  if (cell.unknown) return <CellView label={cell.label} value={UNKNOWN_VALUE} tone="na" notes={[cell.note]} className={className} />
  const lines: SummaryLine[] =
    cell.value === null
      ? []
      : [...(cell.delta === null ? [] : [deltaLine(cell.delta, cell.unit)]), ...(cell.delta2 === null ? [] : [deltaLine(cell.delta2.delta, cell.unit, cell.delta2.label)])]
  return (
    <CellView
      label={cell.label}
      hint={cell.hint}
      partial={cell.partial}
      value={cell.value === null ? null : formatCount(cell.value)}
      unit={cell.unit}
      lines={lines}
      neutral={cell.key === 'first90' || cell.key === 'returning'}
      notes={cell.value === null ? [cell.note] : []}
      className={className}
    />
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

export function PeriodSummary({ input, saved }: { input: StatsInput; saved: boolean }) {
  const id = useSectionAnchor() ?? undefined
  const trend = patientTrend(input)
  if (trend === null) {
    return (
      <StatsCard id={id} title={TITLE}>
        <EmptyNote>{saved ? NO_RANGE_DATA : EMPTY}</EmptyNote>
      </StatsCard>
    )
  }
  const cells = summaryCells(input)
  const hasAverage = cells.some((cell) => cell.key === 'average' && cell.value !== null)
  const note = monthNote(input, trend, hasAverage)
  const missing = missingDays(input)
  const unknown = cells.some((cell) => cell.unknown)
  return (
    <StatsCard id={id} title={TITLE} desc={summaryDesc(input.range)}>
      {/* 카드 몸 칸 사이에 선이 그어지므로 칸 넷과 아래 글을 한 칸에 담는다 */}
      <div>
        <div className={GRID}>
          {cells.map((cell, i) => (
            <PatientCell key={cell.key} cell={cell} className={CELLS[i] ?? CELLS[3]} />
          ))}
        </div>
        {missing > 0 && <p className={NOTE}>{`자료 없는 날 ${formatCount(missing)}일은 빼고 셌어요`}</p>}
        {note !== null && <p className={`${NOTE} max-w-208`}>{note}</p>}
        {unknown && (
          <div role="note" className={HELPER_BOX}>
            <p>
              <strong className="font-semibold">{HELPER_LEAD}</strong> {HELPER_REST}
            </p>
            <Link href="/settings" className={ds.button.secondarySmall}>
              {HELPER_LINK}
            </Link>
          </div>
        )}
      </div>
    </StatsCard>
  )
}

import { useId, type ReactNode } from 'react'
import { formatDelta, type DeltaUnit } from '@/components/charts/format'
import type { BarSeries } from '@/components/charts/StackedBarChart'
import { patientTrend, type StatsInput, type StatsPeriod, type StatsRange } from '@/components/stats/view'
import { ds } from '@/components/ui/classes'
import { monthOf, weekdayOf } from '@/lib/analytics/dates'
import type { Delta } from '@/types/analysis'

// 통계 섹션들이 같이 쓰는 틀·글자 (stats REQ-513, 시안 docs/mockups/stats/notes.md §2·§3·§4). props만 받는다

export const PERIOD_NAME: Record<StatsPeriod, string> = { '7d': '최근 7일', '30d': '최근 30일', '90d': '최근 90일', '12m': '최근 12개월' }
export const NO_RANGE_DATA = '불러온 숫자에 이 기간 자료가 없어요.'
export const TREND_SERIES: BarSeries[] = [
  { name: '신환', tone: 'accent' },
  { name: '재진', tone: 'chart-3' },
]

const WEEKDAYS = '월화수목금토일'
export const weekdayName = (ymd: string) => WEEKDAYS[weekdayOf(ymd) - 1]!
export const monthNumber = (ymd: string) => Number(ymd.slice(5, 7))
export const dayNumber = (ymd: string) => Number(ymd.slice(8, 10))
export const longDate = (ymd: string) => `${monthNumber(ymd)}월 ${dayNumber(ymd)}일`
export const dateWithWeekday = (ymd: string) => `${longDate(ymd)} (${weekdayName(ymd)})`
export const yearMonth = (ymd: string) => `${Number(ymd.slice(0, 4))}년 ${monthNumber(ymd)}월`

// statsRange의 불러올 범위 끝이 곧 오늘이다
export const todayOf = (range: StatsRange) => range.load.to
// 고른 기간에 일 줄이 하나라도 있는지(patientTrend는 줄이 없으면 null이다)
export const hasRows = (input: StatsInput) => patientTrend(input) !== null
// 덜 끝난 칸(12개월 달 칸)이 오늘이 든 달 하나뿐인지. '아직 끝나지 않은 달' 글은 이때만 쓴다: 지난 달의 덜 덮인 칸은 끝나지 않은 달이 아니다
export function onlyThisMonthPartial(partialMonths: readonly string[], today: string): boolean {
  return partialMonths.length === 1 && partialMonths[0] === monthOf(today)
}

const SECTION = 'mt-12 min-w-0 border-t border-line-strong pt-5 max-md:mt-8 max-md:pt-4'

// 섹션 틀: 위 1px line-strong + h2 + 옆 설명(small muted) + 오른쪽 단추. 차트 칸(col-span)은 놓는 쪽이 className으로 준다
export function Section({ title, desc, action, className = '', children }: { title: string; desc?: string; action?: ReactNode; className?: string; children: ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className={`${SECTION} ${className}`}>
      <div className="flex min-h-8 flex-wrap items-center gap-x-3 gap-y-1">
        <h2 id={id} className="text-title font-semibold text-ink">
          {title}
        </h2>
        {desc && <span className="text-small text-muted">{desc}</span>}
        {action && <span className="ml-auto">{action}</span>}
      </div>
      {children}
    </section>
  )
}

// 빈 상태 한 줄: **자료 없음** · 안내(그래프·빈 틀 없음, AC-513.4)
export function EmptyNote({ title = '자료 없음', children }: { title?: string; children: string }) {
  return (
    <p className="mt-3 text-body text-ink-2">
      <span className="font-semibold text-ink">{title}</span> · {children}
    </p>
  )
}

// 덜 끝난 칸 표시. 글 뒤에 붙일 때는 왼쪽 6px, 사이가 정해진 자리는 className=""
export const PartialChip = ({ className = 'ml-1.5' }: { className?: string }) => <span className={`${ds.chip.warning} ${className}`}>일부 기간</span>

// 안내 줄(시안 .ch-n)
export const Note = ({ children }: { children: ReactNode }) => <p className="mt-2 text-small text-muted">{children}</p>

const DELTA_TONE = { up: 'text-positive', down: 'text-negative', flat: 'text-muted', none: 'text-muted' } as const
const ARROW = { up: '▲', down: '▼' } as const

// 증감 글자: ▲▼ + formatDelta 글자 + "늘어남"·"줄어듦". 색만 쓰지 않는다(AC-513.2, UI_GUIDE). 글자 크기는 놓는 자리를 따른다
export function DeltaText({ delta, unit }: { delta: Delta; unit: DeltaUnit }) {
  const view = formatDelta(delta, unit)
  const arrow = view.dir === 'up' || view.dir === 'down' ? ARROW[view.dir] : null
  return (
    <span className={`inline-flex flex-wrap items-baseline gap-x-1.5 tabular-nums ${DELTA_TONE[view.dir]}`}>
      <span>
        {arrow && <span aria-hidden="true">{arrow} </span>}
        {view.text}
      </span>
      {view.srText && <span className="text-small font-medium">{view.srText}</span>}
    </span>
  )
}

// 칸이 많으면 휴대폰에서 막대 위 합계를 마지막 끝난 칸만 남긴다(시안 §3 '칸 13개 이상이면 마지막 칸만'). 합계 글자만 text-ink-2다
export const thinTotals = (cells: number) => (cells >= 13 ? 'max-md:[&_.text-ink-2]:invisible' : '')

'use client'

import type { RevenueCell } from '@/components/stats/revenueView'
import { StatsCard } from './parts'
import { SummaryCell } from './SummaryCell'

// 매출 요약 (bit-total REQ-6904 AC-6904.1·AC-6904.4, design.md 2절. 처음 만든 것은 first90 REQ-4408, 시안 docs/mockups/first90/redesign.html #s-sum-rev).
// 환자 요약 바로 뒤의 큰 카드: h2 "매출 요약" + 옆 글 → 칸 둘(총매출 · 건당 진료비). 스위치·꼬리표·바꿀 때 강조가 없다.
// 칸 값·글은 revenueView(revenueCells)가 센다

const TITLE = '매출 요약'
const DESC = '총진료비 · 수납한 날 기준'
// PC 5칸 격자에 3 : 2(사이 세로 선). 768px 미만은 총매출 한 줄 아래 건당 진료비 한 줄(사이 가로 선)이다
const GRID = 'grid grid-cols-5 max-md:grid-cols-1'
const CELL: Record<RevenueCell['key'], string> = {
  total: 'col-span-3 pr-5 max-md:col-span-1 max-md:border-b max-md:border-st-line max-md:pr-0 max-md:pb-3',
  perVisit: 'col-span-2 border-l border-st-line px-5 max-md:col-span-1 max-md:border-l-0 max-md:px-0 max-md:pt-3',
}

export function RevenueSummary({ cells }: { cells: readonly RevenueCell[] }) {
  return (
    <StatsCard title={TITLE} desc={DESC}>
      <div className={GRID}>
        {cells.map((cell) => (
          <SummaryCell
            key={cell.key}
            label={cell.label}
            hint={cell.hint}
            value={cell.tone === 'none' ? null : cell.value}
            unit={cell.unit}
            size={cell.key === 'total' ? 'xl' : 'base'}
            lines={cell.delta === null ? [] : [{ dir: cell.delta.dir, text: cell.delta.text, tail: cell.delta.srText }]}
            neutral={cell.key === 'perVisit'}
            notes={cell.notes}
            className={`${CELL[cell.key]} rounded-st-sm`}
          />
        ))}
      </div>
    </StatsCard>
  )
}

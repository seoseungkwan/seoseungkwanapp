'use client'

import { useEffect, useState } from 'react'
import type { RevenueCell, RevenueMode, RoughInfo } from '@/components/stats/revenueView'
import { StatsCard } from './parts'
import { RoughSwitch } from './RoughSwitch'
import { SummaryCell } from './SummaryCell'

// 매출 요약 (first90 REQ-4408 AC-4408.1·AC-4408.2, REQ-4417 AC-4417.3, design.md 5-7, 시안 docs/mockups/first90/redesign.html #s-sum-rev).
// 환자 요약 바로 뒤의 큰 카드: h2 "매출 요약" + 옆 글 + 오른쪽 참고 금액 포함 스위치 → 칸 셋(총매출 · 건당 진료비 · 확인 필요한 날, PC 1.5 : 1 : 1).
// 칸 값·글은 revenueView(revenueCells)가 센다. 스위치 상태(mode)는 StatsSections가 갖고, 여기는 바뀔 때 칸 바탕을 250ms 강조(st-flash)만 한다

const FLASH_MS = 250
const TITLE = '매출 요약'
const DESC = '총진료비 · 수납한 날 기준'
// PC 7칸 격자에 3 : 2 : 2(≈ 1.5 : 1 : 1). 768px 미만은 총매출이 한 줄 전체이고 나머지 둘이 아래 한 줄이다
const GRID = 'grid grid-cols-7 max-md:grid-cols-2 max-md:gap-x-4 max-md:gap-y-3'
const CELL: Record<RevenueCell['key'], string> = {
  total: 'col-span-3 pr-5 max-md:col-span-2 max-md:border-b max-md:border-st-line max-md:pr-0 max-md:pb-3',
  perVisit: 'col-span-2 border-l border-st-line px-5 max-md:col-span-1 max-md:border-l-0 max-md:px-0',
  unchecked: 'col-span-2 border-l border-st-line px-5 max-md:col-span-1 max-md:border-l-0 max-md:px-0',
}

type Props = {
  cells: readonly RevenueCell[]
  mode: RevenueMode
  onMode(mode: RevenueMode): void
  rough: RoughInfo | null // null = 읽는 중·읽기 실패·저장된 매출 없음(스위치 없음)
}

export function RevenueSummary({ cells, mode, onMode, rough }: Props) {
  // mode가 바뀐 그림에서 강조를 켜고, 타이머 하나로 250ms 뒤 끈다. 또 바뀌면 그 타이머를 지우고 새로 건다(effect 정리)
  const [seen, setSeen] = useState(mode)
  const [flashing, setFlashing] = useState(false)
  if (seen !== mode) {
    setSeen(mode)
    setFlashing(true)
  }
  useEffect(() => {
    if (!flashing) return
    const timer = setTimeout(() => setFlashing(false), FLASH_MS)
    return () => clearTimeout(timer)
  }, [flashing, mode])
  return (
    <StatsCard title={TITLE} desc={DESC}>
      {rough && <RoughSwitch mode={mode} onChange={onMode} days={rough.days} roughDays={rough.roughDays} />}
      <div className={GRID}>
        {cells.map((cell) => (
          <SummaryCell
            key={cell.key}
            label={cell.label}
            hint={cell.hint}
            tag={cell.tag}
            value={cell.tone === 'none' ? null : cell.value}
            unit={cell.unit}
            size={cell.key === 'total' ? 'xl' : 'base'}
            tone={cell.tone === 'warn' ? 'warn' : 'ink'}
            lines={cell.delta === null ? [] : [{ dir: cell.delta.dir, text: cell.delta.text, tail: cell.delta.srText }]}
            neutral={cell.key === 'perVisit'}
            notes={cell.notes}
            className={`${CELL[cell.key]} rounded-st-sm${flashing ? ' st-flash' : ''}`}
          />
        ))}
      </div>
    </StatsCard>
  )
}

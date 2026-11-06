'use client'

import { useCallback, useEffect, useState } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { DashboardHome } from '@/components/dashboard/briefing/DashboardHome'
import { BitDashboard } from '@/components/dashboard/live/BitDashboard'
import { LOOKBACK_DAYS } from '@/components/dashboard/live/readBitDays'
import { ds } from '@/components/ui/classes'
import { addDays } from '@/lib/analytics/dates'
import { readDays } from '@/lib/storage/stats'
import { DashboardAnalysis } from './DashboardAnalysis'
import { toSummarySource, type SummarySource } from './source'

// 대시보드가 저장 숫자를 먼저 읽어 BitDashboard에 넘김 (bit-dashboard AC-601.14·AC-601.19, stats AC-516.1·AC-516.3, design.md '### 화면').
// 저장 숫자(오늘 − LOOKBACK_DAYS ~ 오늘)를 읽는 곳은 여기 한 곳이고, 연결 전·뒤 모양은 BitDashboard가 고른다.
// 읽기가 끝나거나 한도가 지나기 전에는 서버가 그리는 연결 전 모양 그대로이고 BitDashboard(비트 읽기)를 아직 놓지 않는다.
// 읽은 숫자는 화면 상태에만 둔다. 이 읽기는 받아 오기만 하고 비트 숫자를 보내지 않는다(AC-601.9 밖, 2026-11-06 사용자 결정)

export const SAVED_READ_TIMEOUT_MS = 10_000

type SavedResult = Awaited<ReturnType<typeof readDays>>

/** 저장 숫자 한 번 읽기. null = 실패했거나 한도 안에 끝나지 않음. 한도가 먼저 오면 늦게 온 답은 버린다 */
function readSaved(today: string): Promise<SavedResult | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), SAVED_READ_TIMEOUT_MS)
    const settle = (result: SavedResult | null) => {
      clearTimeout(timer)
      resolve(result)
    }
    readDays({ from: addDays(today, -LOOKBACK_DAYS), to: today }).then(settle, () => settle(null))
  })
}

/** round: BitDashboard를 새 처음 자료로 다시 놓을 때 올린다. failed: 오류 카드. bitLoaded: 비트 숫자가 왔다(그 뒤 저장 숫자 답은 쓰지 않는다) */
type Drawn = { initial: SummarySource; round: number; failed: boolean; retrying: boolean; bitLoaded: boolean }

function withAnswer(state: Drawn | null, result: SavedResult | null): Drawn {
  const initial = toSummarySource(result) // 실패·한도는 toSummarySource(null) = 저장 숫자 없음
  if (state === null) return { initial, round: 0, failed: result === null, retrying: false, bitLoaded: false }
  if (state.bitLoaded) return { ...state, retrying: false }
  if (result === null) return { ...state, failed: true, retrying: false }
  // 다시 읽기 성공: 카드를 거두고, 숫자가 있으면 그 숫자로 BitDashboard를 새로 놓는다
  return initial.kind === 'data' ? { ...state, initial, round: state.round + 1, failed: false, retrying: false } : { ...state, failed: false, retrying: false }
}

export function LiveDashboard({ today }: { today: string }) {
  const [drawn, setDrawn] = useState<Drawn | null>(null) // null = 저장 숫자를 읽는 중

  useEffect(() => {
    let gone = false // 떠났거나 날짜가 바뀐 뒤에 온 답은 버린다
    void readSaved(today).then((result) => {
      if (!gone) setDrawn((current) => withAnswer(current, result))
    })
    return () => {
      gone = true
    }
  }, [today])

  const markBitLoaded = useCallback(() => setDrawn((current) => (current === null ? current : { ...current, bitLoaded: true })), [])

  if (drawn === null) return <DashboardHome today={today} report={null} analysis={<DashboardAnalysis today={today} source={{ kind: 'none' }} />} />

  const readAgain = () => {
    if (drawn.retrying) return
    setDrawn((current) => (current === null ? current : { ...current, retrying: true }))
    void readSaved(today).then((result) => setDrawn((current) => withAnswer(current, result)))
  }

  return (
    <>
      {/* 오류 카드와 그 아래 [다시 읽기]: 시안에 없어 통계 탭의 같은 카드 모양(StatsScreen ErrorWithAction)을 따른다 */}
      {drawn.failed && !drawn.bitLoaded && (
        <div className="mt-4">
          <ErrorCard code="E-STATS-READ-FAILED" />
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
            <button type="button" className={`${ds.button.secondarySmall} max-md:w-full`} disabled={drawn.retrying} onClick={readAgain}>
              {drawn.retrying ? '다시 읽는 중' : '다시 읽기'}
            </button>
          </div>
        </div>
      )}
      <BitDashboard key={drawn.round} today={today} initial={drawn.initial} onBitLoaded={markBitLoaded} />
    </>
  )
}

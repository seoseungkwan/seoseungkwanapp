'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { BitDashboard } from '@/components/dashboard/live/BitDashboard'
import { DashboardSkeleton } from '@/components/dashboard/live/DashboardSkeleton'
import { LOOKBACK_DAYS } from '@/components/dashboard/live/readBitDays'
import { readDashboardGroups, type DashboardGroups } from '@/components/dashboard/live/rxGroups'
import { ds } from '@/components/ui/classes'
import { addDays } from '@/lib/analytics/dates'
import { readDays } from '@/lib/storage/stats'
import { toSummarySource, type OlderDays, type SummarySource } from './source'

// 대시보드가 저장 숫자를 먼저 읽어 BitDashboard에 넘김 (bit-dashboard AC-601.14·AC-601.19, stats AC-516.1·AC-516.3, design.md '### 화면').
// 저장 숫자(오늘 − LOOKBACK_DAYS ~ 오늘)를 읽는 곳은 여기 한 곳이고, 연결 전·뒤 모양은 BitDashboard가 고른다.
// 읽기가 끝나거나 한도가 지나기 전에는 뼈대(DashboardSkeleton)이고 BitDashboard(비트 읽기)를 아직 놓지 않는다. 연결 전 화면이 아니다(dashboard-ux AC-2701.1).
// 읽은 숫자는 화면 상태에만 둔다. 이 읽기는 받아 오기만 하고 비트 숫자를 보내지 않는다(AC-601.9 밖, 2026-11-06 사용자 결정)
// 통계 탭 묶음(처방 상위, REQ-606)도 여기 한 곳이 화면을 열 때 한 번 읽어 BitDashboard에 넘긴다(AC-606.8). 저장 숫자가 오면 묶음을 기다리지 않고
// BitDashboard를 놓고, 묶음은 읽는 동안 'pending'으로 넘긴다(처방 상위만 "묶음을 읽는 중", 비트 읽기는 묶음이 끝난 뒤 — AC-2701.2·AC-606.7).
// [다시 읽기]와 날짜가 바뀔 때는 저장 숫자만 다시 읽고 묶음은 처음 값을 그대로 둔다(AC-606.5, design.md '처방 상위 = 통계 탭 묶음')
// 늦게 온 답(떠난 뒤·날짜가 바뀐 뒤)은 상태를 바꾸지 않는다(AC-2701.6)

export const SAVED_READ_TIMEOUT_MS = 10_000

type SavedResult = Awaited<ReturnType<typeof readDays>>

/** 한 번 읽기에 한도를 건다. null = 실패했거나 한도 안에 끝나지 않음. 한도가 먼저 오면 늦게 온 답은 버린다 */
function withinLimit<T>(read: () => Promise<T>): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), SAVED_READ_TIMEOUT_MS)
    const settle = (result: T | null) => {
      clearTimeout(timer)
      resolve(result)
    }
    read().then(settle, () => settle(null))
  })
}

/** 저장 숫자 한 번 읽기(AC-601.19) */
const readSaved = (today: string) => withinLimit(() => readDays({ from: addDays(today, -LOOKBACK_DAYS), to: today }))

/**
 * 기간별 흐름의 옛 기간 읽기(dashboard-period REQ-1804). 손에 든 숫자의 첫날(오늘 − LOOKBACK_DAYS)보다 앞에서 시작하는 고른 기간만
 * 그 기간의 저장 숫자를 같은 10초 한도로 한 번 읽어 줄만 넘긴다(null = 실패·한도). 받아 오기만 하고 아무것도 보내지 않는다
 */
function olderDays(today: string): OlderDays {
  return { from: addDays(today, -LOOKBACK_DAYS), read: (range) => withinLimit(() => readDays(range)).then((result) => result?.rows ?? null) }
}

/**
 * round: BitDashboard를 새 처음 자료로 다시 놓을 때 올린다. failed: 오류 카드. retrying: [다시 읽기] 중(단추 글자). bitLoaded: 비트 숫자가 왔다(그 뒤 저장 숫자 답은 쓰지 않는다).
 * savedAt: 처음 자료의 마지막 저장 시각(readDays latest.at, 없으면 null). 머리 줄 시각 글에 쓴다(dashboard-ux AC-2701.3)
 */
type Drawn = { initial: SummarySource; savedAt: string | null; round: number; failed: boolean; retrying: boolean; bitLoaded: boolean }

function withAnswer(state: Drawn | null, result: SavedResult | null): Drawn {
  const initial = toSummarySource(result) // 실패·한도는 toSummarySource(null) = 저장 숫자 없음
  const savedAt = result?.latest?.at ?? null
  if (state === null) return { initial, savedAt, round: 0, failed: result === null, retrying: false, bitLoaded: false }
  if (state.bitLoaded) return { ...state, retrying: false }
  if (result === null) return { ...state, failed: true, retrying: false }
  // 다시 읽기 성공: 카드를 거두고, 숫자가 있으면 그 숫자(와 저장 시각)로 BitDashboard를 새로 놓는다
  return initial.kind === 'data'
    ? { ...state, initial, savedAt, round: state.round + 1, failed: false, retrying: false }
    : { ...state, failed: false, retrying: false }
}

export function LiveDashboard({ today }: { today: string }) {
  const [drawn, setDrawn] = useState<Drawn | null>(null) // null = 저장 숫자를 읽는 중
  const [groups, setGroups] = useState<DashboardGroups | null | undefined>(undefined) // undefined = 묶음을 읽는 중, null = 읽지 못함(AC-606.5)
  // [다시 읽기] 하나만 돌게 하는 표시(AC-2701.5). 상태는 다음 그림 때 바뀌어 같은 틱에 두 번 누르면 둘 다 지나가므로 ref로 막는다
  const retrying = useRef(false)
  // 날짜가 바뀌거나 떠날 때 올린다. 그 전에 시작한 [다시 읽기]의 늦은 답은 버린다(AC-2701.6)
  const era = useRef(0)

  // 묶음은 화면을 열 때 한 번만 읽는다(같은 10초 한도). 날짜가 바뀌어도 다시 읽지 않는다
  useEffect(() => {
    let gone = false // 떠난 뒤에 온 답은 버린다
    void withinLimit(() => readDashboardGroups()).then((result) => {
      if (!gone) setGroups(result)
    })
    return () => {
      gone = true
    }
  }, [])

  useEffect(() => {
    let gone = false // 떠났거나 날짜가 바뀐 뒤에 온 답은 버린다
    void readSaved(today).then((result) => {
      if (!gone) setDrawn((current) => withAnswer(current, result))
    })
    return () => {
      gone = true
      era.current += 1
      retrying.current = false
    }
  }, [today])

  const markBitLoaded = useCallback(() => setDrawn((current) => (current === null ? current : { ...current, bitLoaded: true })), [])
  // 날짜가 바뀔 때만 새로 만든다(같은 객체라 기간별 흐름이 다시 그려져도 읽기를 다시 시작하지 않는다)
  const older = useMemo(() => olderDays(today), [today])

  // 저장 숫자를 읽는 동안: 연결 전 화면이 아니라 뼈대(AC-2701.1). 묶음은 기다리지 않는다(AC-2701.2)
  if (drawn === null) return <DashboardSkeleton />

  const readAgain = () => {
    if (retrying.current) return
    retrying.current = true
    const started = era.current
    setDrawn((current) => (current === null ? current : { ...current, retrying: true }))
    void readSaved(today).then((result) => {
      if (era.current !== started) return
      retrying.current = false
      setDrawn((current) => withAnswer(current, result))
    })
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
      {/* key는 다시 읽기로 새 처음 자료가 올 때만 바뀐다. 묶음이 와도 그대로라 다시 놓지 않는다(고른 날 유지, AC-2701.2) */}
      <BitDashboard
        key={drawn.round}
        today={today}
        initial={drawn.initial}
        savedAt={drawn.savedAt}
        groups={groups === undefined ? 'pending' : groups}
        older={older}
        onBitLoaded={markBitLoaded}
      />
    </>
  )
}

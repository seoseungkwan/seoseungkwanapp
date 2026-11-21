'use client'

import { useCallback, useEffect, useState } from 'react'
import type { StaffStore } from '@/lib/storage/staff'
import type { DayChange, Leave, Overtime } from '@/types/staff'

// 근무표가 보는 기간(주 7일 또는 달력이 덮는 주 전부)의 바뀐 날·더 일한 시간·휴가 읽기 (staff AC-7613.1·AC-7613.2, AC-7610.1).
// 셋을 함께 읽고 하나라도 실패하면 failed(화면은 E-STAFF-READ-FAILED와 [다시 불러오기]). 같은 기간을 다시 읽는 동안은 앞 값을 그대로 보이고,
// 기간이 바뀌면 그 기간 값이 올 때까지 loading이다(다른 주 값을 섞어 보이지 않게). 늦게 온 앞 읽기의 답은 버린다. 자료는 React 상태에만 둔다

export type RangeData = { changes: DayChange[]; overtime: Overtime[]; leaves: Leave[] }
export type ScheduleRange = { state: 'loading' | 'ready' | 'failed'; data: RangeData | null; reload(): void }

type Held = { key: string; attempt: number; value: RangeData | 'failed' }

export function useScheduleRange(store: StaffStore, from: string, to: string): ScheduleRange {
  const key = `${from}|${to}`
  const [attempt, setAttempt] = useState(0)
  const [held, setHeld] = useState<Held | null>(null)

  useEffect(() => {
    let current = true
    const range = { from, to }
    const answer = `${from}|${to}`
    Promise.resolve()
      .then(() => Promise.all([store.listChanges(range), store.listOvertime(range), store.listLeaves(range)]))
      .then(
        ([changes, overtime, leaves]) => {
          if (current) setHeld({ key: answer, attempt, value: { changes, overtime, leaves } })
        },
        () => {
          if (current) setHeld({ key: answer, attempt, value: 'failed' })
        },
      )
    return () => {
      current = false
    }
  }, [store, from, to, attempt])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])
  const mine = held !== null && held.key === key ? held : null
  const data = mine !== null && mine.value !== 'failed' ? mine.value : null
  const settled = mine !== null && mine.attempt === attempt
  const state = data !== null ? 'ready' : settled ? 'failed' : 'loading'
  return { state, data, reload }
}

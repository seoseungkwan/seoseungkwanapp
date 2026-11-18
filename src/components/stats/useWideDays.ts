'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { addDays, addMonthsToDay } from '@/lib/analytics/dates'
import { readDays } from '@/lib/storage/stats'
import type { DayPayload } from '@/types/payload'

// 넓은 하루 읽기 (stats-insights design.md '넓은 하루 읽기', REQ-6101 AC-6101.5 · REQ-6107 AC-6107.3).
// 기간 고르기와 상관없이 오늘 앞 12달 stats_days를 한 번 읽는다(useAgainDays와 같은 길). 알림·휴일·목표(내원·신환)가 함께 쓴다.
// 열쇠 = 오늘|revision: 저장에 성공하거나 [다시 읽기]를 누르면 revision이 늘어 다시 읽는다. 마지막 읽기가 아닌 답은 늦게 온 앞 답이라 버린다.
// 받은 줄은 React 상태에만 둔다. 실패 번호는 readDays가 던지는 E-STATS-READ-FAILED 그대로다(화면은 정해 둔 문구만 보인다)

export type WideDaysState = 'reading' | 'ready' | 'failed'
export type WideDays = { state: WideDaysState; days: readonly DayPayload[]; retry(): void }

type Held = { key: string; state: WideDaysState; days: readonly DayPayload[] }

const NO_DAYS: readonly DayPayload[] = []

/** 읽는 범위: 오늘 12달 전 같은 날 ~ 어제(오늘 줄은 아무 칸도 쓰지 않는다) */
export function wideSpan(today: string): { from: string; to: string } {
  return { from: addMonthsToDay(today, -12), to: addDays(today, -1) }
}

export function useWideDays(today: string, revision = 0): WideDays {
  const { from, to } = wideSpan(today)
  const key = `${today}|${revision}`
  const [held, setHeld] = useState<Held | null>(null)
  const latest = useRef<Held | null>(null)

  const read = useCallback(() => {
    const mine: Held = { key, state: 'reading', days: NO_DAYS }
    const finish = (next: Held) => {
      if (latest.current !== mine) return
      latest.current = next
      setHeld(next)
    }
    latest.current = mine
    setHeld(mine)
    readDays({ from, to }).then(
      (answer) => finish({ key, state: 'ready', days: answer.rows }),
      () => finish({ key, state: 'failed', days: NO_DAYS }),
    )
  }, [key, from, to])

  // 이 열쇠로 아직 읽지 않았으면 읽는다. 다시 그려도(StrictMode 포함) 열쇠가 같으면 읽은(또는 읽는 중인) 답을 쓴다
  useEffect(() => {
    if (latest.current?.key !== key) read()
  }, [key, read])

  const retry = useCallback(() => {
    if (latest.current?.key === key && latest.current.state === 'failed') read()
  }, [key, read])

  const current = held?.key === key ? held : null
  return { state: current?.state ?? 'reading', days: current?.days ?? NO_DAYS, retry }
}

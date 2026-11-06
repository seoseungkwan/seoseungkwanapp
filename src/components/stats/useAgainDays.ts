'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { mergeRanges } from '@/lib/analytics/coverage'
import { readCoverage, readDays } from '@/lib/storage/stats'
import type { DateRange } from '@/types/dates'
import type { AgainWindow, DayPayload } from '@/types/payload'
import { againExtraSpan, needsExtra } from './againView'
import type { StatsInput } from './view'

// 같은 처방 재방문의 넓은 날 줄 읽기 (fu-rate REQ-1306, design.md '훅'). 받은 줄은 React 상태에만 둔다.
// 최근 7일 + 14·30일만 페이지 읽기 앞을 더 읽는다. 30일 창에 맞춘 범위를 한 번 읽어 14일에도 쓴다(열쇠 = 오늘|revision).
// 마지막 읽기가 아닌 답은 늦게 온 앞 답이라 버린다(useRxCatalog와 같은 방법). 실패 번호는 readDays·readCoverage가 던지는 E-STATS-READ-FAILED 그대로다

export type AgainDaysState = 'ready' | 'reading' | 'failed'
export type AgainDays = { input: StatsInput; state: AgainDaysState; retry(): void }

type Extra = { key: string; state: AgainDaysState; days: readonly DayPayload[]; covered: readonly DateRange[] }

const NO_DAYS: readonly DayPayload[] = []
const NO_RANGES: readonly DateRange[] = []

export function useAgainDays(input: StatsInput, win: AgainWindow, revision: number, enabled: boolean): AgainDays {
  const span = againExtraSpan(input.range)
  const wanted = enabled && needsExtra(input.range, win)
  const key = `${input.range.load.to}|${revision}`
  const from = span?.from ?? null
  const to = span?.to ?? null

  const [extra, setExtra] = useState<Extra | null>(null)
  const latest = useRef<Extra | null>(null)

  const read = useCallback(() => {
    if (from === null || to === null) return
    const mine: Extra = { key, state: 'reading', days: NO_DAYS, covered: NO_RANGES }
    const finish = (next: Extra) => {
      if (latest.current !== mine) return
      latest.current = next
      setExtra(next)
    }
    latest.current = mine
    setExtra(mine)
    Promise.all([readDays({ from, to }), readCoverage({ from, to })]).then(
      ([days, covered]) => finish({ key, state: 'ready', days: days.rows, covered }),
      () => finish({ key, state: 'failed', days: NO_DAYS, covered: NO_RANGES }),
    )
  }, [key, from, to])

  // 필요할 때 이 열쇠로 아직 읽지 않았으면 읽는다. 14일 ↔ 30일·기간을 오가도 열쇠가 같으면 읽은(또는 읽는 중인) 답을 쓴다
  useEffect(() => {
    if (wanted && latest.current?.key !== key) read()
  }, [wanted, key, read])

  const retry = useCallback(() => {
    if (wanted && latest.current?.key === key && latest.current.state === 'failed') read()
  }, [wanted, key, read])

  const current = wanted && extra?.key === key ? extra : null
  const state: AgainDaysState = wanted ? (current?.state ?? 'reading') : 'ready'
  const merged = useMemo(() => {
    if (current === null || current.state !== 'ready') return input
    return {
      days: [...current.days, ...input.days],
      covered: mergeRanges([...current.covered, ...input.covered]),
      range: input.range,
    }
  }, [current, input])

  return { input: merged, state, retry }
}

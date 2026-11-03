'use client'

import { useCallback, useRef, useState } from 'react'
import { validateRxPick } from '@/lib/payload/validate'
import { readDays } from '@/lib/storage/stats'
import type { DayPayload } from '@/types/payload'
import { statsRange, type RxLine } from './view'

// 찾기 목록의 넓은 읽기 (rx-picker AC-802.5~802.7, design.md '찾기 목록'). 처음 열 때 한 번만 읽고 일 줄은 React 상태에만 둔다.
// 일 줄은 읽어 낸 때(ready)만 준다. 읽는 중·실패 때 부르는 쪽 글이 '지금 보는 기간의 처방만'이라고 말하므로 앞 답을 남기지 않는다

type CatalogState = 'idle' | 'reading' | 'ready' | 'failed'
type Asked = { key: string; state: Exclude<CatalogState, 'idle'>; days: readonly DayPayload[] }

const NO_DAYS: readonly DayPayload[] = []

/** rxCatalog의 check로 넘긴다. 목록에 고를 수 없는 줄이 없어야 저장 실패가 생기지 않는다(AC-802.11) */
export const isSavableLine = (line: RxLine): boolean => validateRxPick(line) !== null

export function useRxCatalog(today: string, revision: number): { days: readonly DayPayload[]; state: CatalogState; open(): void; retry(): void } {
  const key = `${today}|${revision}`
  const [asked, setAsked] = useState<Asked | null>(null)
  const latest = useRef<Asked | null>(null) // 마지막 읽기. 이것이 아닌 답은 늦게 온 앞 답이라 버린다(AC-802.7)

  const read = useCallback(() => {
    const mine: Asked = { key, state: 'reading', days: NO_DAYS }
    const finish = (state: Asked['state'], days: readonly DayPayload[]) => {
      if (latest.current !== mine) return
      latest.current = { key, state, days }
      setAsked(latest.current)
    }
    latest.current = mine
    setAsked(mine)
    const widest = statsRange(today, '12m')
    readDays({ from: widest.previous.from, to: widest.current.to }).then(
      ({ rows }) => finish('ready', rows),
      () => finish('failed', NO_DAYS),
    )
  }, [key, today])

  const open = useCallback(() => {
    if (latest.current?.key !== key) read()
  }, [key, read])

  const retry = useCallback(() => {
    if (latest.current?.key === key && latest.current.state === 'failed') read()
  }, [key, read])

  const current = asked?.key === key ? asked : null
  return { days: current?.days ?? NO_DAYS, state: current?.state ?? 'idle', open, retry }
}

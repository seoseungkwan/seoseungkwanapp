'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { compareYmd } from '@/lib/analytics/dates'
import type { DayPayload } from '@/types/payload'
import type { OlderDays } from './source'

// 대시보드 기간별 흐름의 옛 기간 읽기 (dashboard-period REQ-1804, design.md '데이터 흐름 (읽기)').
// 고른 기간의 첫날이 손에 든 숫자의 첫날(older.from)보다 앞일 때만 그 기간을 한 번 읽는다. 읽기 함수는 주입받는다(lib/storage를 부르지 않는다).
// 열쇠 = 첫날~끝날: 단위만 바뀌면 같은 열쇠라 다시 읽지 않는다. 마지막 읽기가 아닌 답은 늦게 온 앞 답이라 버린다(통계 useAgainDays와 같은 방법).
// 앞 열쇠의 답은 남겨 두지 않는다(돌아오면 다시 읽는다). 받은 줄은 React 상태에만 둔다

export type PeriodDays = { kind: 'ready'; days: readonly DayPayload[] } | { kind: 'reading' } | { kind: 'failed'; retrying: boolean }

type Answer = { key: string } & ({ kind: 'reading' } | { kind: 'ready'; rows: readonly DayPayload[] } | { kind: 'failed'; retrying: boolean })

const READING: PeriodDays = { kind: 'reading' }

export function usePeriodDays(held: readonly DayPayload[], current: { from: string; to: string }, older?: OlderDays): { state: PeriodDays; retry: () => void } {
  const { from, to } = current
  const wanted = older !== undefined && compareYmd(from, older.from) < 0
  const key = `${from}~${to}`

  const [answer, setAnswer] = useState<Answer | null>(null)
  const latest = useRef<Answer | null>(null)
  // 마지막으로 받은 읽기. 효과의 의존에 넣지 않는다(부모가 다시 그려 새 객체를 줘도 다시 읽지 않게, BitDashboard와 같은 방법)
  const reader = useRef(older)
  useEffect(() => {
    reader.current = older
  })

  const read = useCallback(
    (retrying: boolean) => {
      const source = reader.current
      if (source === undefined) return
      const mine: Answer = retrying ? { key, kind: 'failed', retrying: true } : { key, kind: 'reading' }
      const finish = (next: Answer) => {
        if (latest.current !== mine) return
        latest.current = next
        setAnswer(next)
      }
      latest.current = mine
      setAnswer(mine)
      source.read({ from, to }).then(
        (rows) => finish(rows === null ? { key, kind: 'failed', retrying: false } : { key, kind: 'ready', rows }),
        () => finish({ key, kind: 'failed', retrying: false }),
      )
    },
    [key, from, to],
  )

  // 옛 기간이고 이 열쇠로 아직 읽지 않았으면 읽는다. 손에 든 기간으로 옮기면 읽던 답을 버린다
  useEffect(() => {
    if (!wanted) latest.current = null
    else if (latest.current?.key !== key) read(false)
  }, [wanted, key, read])

  const retry = useCallback(() => {
    const last = latest.current
    if (wanted && last?.key === key && last.kind === 'failed' && !last.retrying) read(true)
  }, [wanted, key, read])

  const shown = wanted && answer?.key === key ? answer : null
  const rows = shown?.kind === 'ready' ? shown.rows : null
  // 읽은 줄 먼저, 손에 든 줄 뒤: 같은 날은 뒤의 것을 쓰므로 손에 든 숫자(비트 PC면 비트 숫자)가 이긴다
  const merged = useMemo(() => (rows === null ? null : [...rows, ...held]), [rows, held])

  let state: PeriodDays
  if (!wanted) state = { kind: 'ready', days: held }
  else if (shown === null || shown.kind === 'reading') state = READING
  else if (shown.kind === 'failed') state = { kind: 'failed', retrying: shown.retrying }
  else state = { kind: 'ready', days: merged ?? held }

  return { state, retry }
}

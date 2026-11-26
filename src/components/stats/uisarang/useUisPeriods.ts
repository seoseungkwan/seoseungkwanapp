'use client'

import { useEffect, useState } from 'react'
import { readUisPeriods } from '@/lib/storage/uisarang'
import type { DateRange } from '@/types/dates'
import type { UisAgePayload, UisPeriodRow, UisRxPayload } from '@/types/uisarang'

// 통계 탭 의사랑 처방·나이대 줄 읽기(specs/uisarang-upload design.md §10-3 useUisPeriods).
// 지금 기간의 처방 줄(readUisPeriods('rx'))·나이대 줄('age')을 함께 읽는다. 보는 중에도 읽는다(RLS가 보는 의원 줄을 준다).
// 열쇠 = 기간 + revision(= data.revision): 올리기 칸이 저장한 뒤 날 숫자를 다시 읽어 revision이 오르면 같이 다시 읽는다.
// 기간이 null(의사랑 의원이 아님)이면 읽지 않고 null이다. 늦게 온 앞 열쇠의 답은 버린다. 하나라도 못 읽으면 failed(그 자리 E-UIS-READ-FAILED 카드)

export type UisPeriodsView =
  | { state: 'reading' }
  | { state: 'failed' }
  | { state: 'ready'; rx: readonly UisPeriodRow<UisRxPayload>[]; age: readonly UisPeriodRow<UisAgePayload>[] }

type Answer = { key: string; view: UisPeriodsView }

const READING: UisPeriodsView = { state: 'reading' }

export function useUisPeriods(range: DateRange | null, revision: number): UisPeriodsView | null {
  const from = range?.from ?? null
  const to = range?.to ?? null
  const key = from === null || to === null ? null : `${from}|${to}|${revision}`
  const [answer, setAnswer] = useState<Answer | null>(null)

  useEffect(() => {
    if (key === null || from === null || to === null) return
    let current = true
    const span = { from, to }
    Promise.all([readUisPeriods('rx', span), readUisPeriods('age', span)]).then(
      ([rx, age]) => {
        if (current) setAnswer({ key, view: { state: 'ready', rx, age } })
      },
      () => {
        if (current) setAnswer({ key, view: { state: 'failed' } })
      },
    )
    return () => {
      current = false
    }
  }, [key, from, to])

  if (key === null) return null
  return answer !== null && answer.key === key ? answer.view : READING
}

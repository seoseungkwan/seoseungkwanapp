'use client'

import { useCallback, useEffect, useState } from 'react'
import { addMonths, monthRange } from '@/lib/analytics/dates'
import type { DayValue } from '@/lib/analytics/goalPace'
import { loadGoal } from '@/lib/storage/goals'
import { createRevenueStore } from '@/lib/storage/revenue'
import { supabaseBrowser } from '@/lib/supabase/browser'
import type { Goal } from '@/types/goals'

// 월간 보고서의 서버 읽기 (stats-insights REQ-6108 AC-6108.2, design.md '월간 보고서'). 고른 달마다 둘을 함께 읽는다:
// 고른 달·앞 달의 하루 매출(sales_days 총액, 총액이 빈 날은 뺀다 — 목표 칸과 같다) · 고른 달 목표(loadGoal, withGoal이 거짓이면 읽지 않는다 —
// 이번 달 목표는 요약 칸 목표 훅이 이미 읽어 저장 뒤 값까지 갖고 있다). 내원·신환·묶음 숫자는 넓은 하루 읽기가 따로 준다.
// 달·revision이 바뀔 때·[다시 읽기]에 다시 읽고 늦게 온 앞 답은 버린다(useStatsGoals와 같은 방식). 읽은 값은 React 상태에만 둔다

export type ReportRead<T> = T | 'reading' | 'failed'
export type ReportReads = { sales: ReportRead<readonly DayValue[]>; goal: ReportRead<Goal>; retry(): void }

type Held = { key: string; sales: ReportRead<readonly DayValue[]>; goal: ReportRead<Goal> }

// 서버 클라이언트를 만들다 던져도(설정 없는 환경) 거절로 받는다
const readSales = (from: string, to: string) =>
  Promise.resolve()
    .then(() => createRevenueStore(supabaseBrowser()).loadDays({ from, to }))
    .then((days) => days.flatMap((row): DayValue[] => (row.total === null ? [] : [{ day: row.date, value: row.total }])))
const readGoal = (month: string) => Promise.resolve().then(() => loadGoal(supabaseBrowser(), month))

/** month null = 고른 달이 없음(읽지 않음) */
export function useReportReads(month: string | null, { revision = 0, withGoal = true }: { revision?: number; withGoal?: boolean } = {}): ReportReads {
  const [attempt, setAttempt] = useState(0)
  const key = `${month}|${withGoal}|${revision}|${attempt}`
  const [held, setHeld] = useState<Held | null>(null)

  useEffect(() => {
    if (month === null) return
    let current = true
    // 둘 다 끝나기 전에 먼저 온 쪽을 보인다
    const put = (part: Partial<Omit<Held, 'key'>>) => {
      if (!current) return
      setHeld((now) => ({ ...(now?.key === key ? now : { key, sales: 'reading', goal: 'reading' }), ...part }))
    }
    readSales(monthRange(addMonths(month, -1)).from, monthRange(month).to).then(
      (sales) => put({ sales }),
      () => put({ sales: 'failed' }),
    )
    if (withGoal) {
      readGoal(month).then(
        (goal) => put({ goal }),
        () => put({ goal: 'failed' }),
      )
    }
    return () => {
      current = false
    }
  }, [key, month, withGoal])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])
  const shown = held?.key === key ? held : null
  return { sales: shown?.sales ?? 'reading', goal: shown?.goal ?? 'reading', retry }
}

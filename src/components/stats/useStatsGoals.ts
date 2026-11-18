'use client'

import { useCallback, useEffect, useState } from 'react'
import { addDays, monthOf } from '@/lib/analytics/dates'
import type { DayValue } from '@/lib/analytics/goalPace'
import { loadGoal, saveGoal } from '@/lib/storage/goals'
import { createRevenueStore } from '@/lib/storage/revenue'
import { supabaseBrowser } from '@/lib/supabase/browser'
import type { Goal } from '@/types/goals'
import type { GoalRead, StatsGoalsShown } from './sections/GoalSection'

// 통계 요약 '이번 달 목표'의 서버 읽기·저장 (stats-insights REQ-6102 AC-6102.2·AC-6102.4·AC-6102.5, design.md '목표').
// 읽기 둘을 함께 한다: 오늘이 든 달의 목표(loadGoal) · 오늘 앞 56일 ~ 어제의 하루 매출(sales_days, lib/storage/revenue.ts의 loadDays).
// 이번 달 1일은 늘 앞 56일 안이라 이 기간 하나로 '지금까지'와 요일 평균을 다 센다. 총액이 빈 날(확인 필요)은 하루 매출에서 뺀다.
// 하나가 실패해도 다른 하나는 그대로 보인다. 내원·신환 하루 숫자는 넓은 하루 읽기(useWideDays)가 따로 준다.
// 오늘이 바뀔 때·[다시 읽기]에 다시 읽고 늦게 온 앞 답은 버린다(useStatsCalendar와 같은 방식).
// 저장(onSave)은 saveGoal 하나이고, 끝나면 다시 읽지 않고 보낸 목표를 그대로 보인다. 실패하면 거절해 칸이 오류 문구를 보이게 한다.
// 목표·매출은 React 상태에만 둔다. 브라우저 저장소에 쓰지 않는다

type Held = { key: string; goal: GoalRead<Goal>; revenue: GoalRead<readonly DayValue[]> }

const AVERAGE_DAYS = 56

// 서버 클라이언트를 만들다 던져도(설정 없는 환경) 거절로 받는다
const readGoal = (month: string) => Promise.resolve().then(() => loadGoal(supabaseBrowser(), month))
const readRevenue = (from: string, to: string) =>
  Promise.resolve()
    .then(() => createRevenueStore(supabaseBrowser()).loadDays({ from, to }))
    .then((days) => days.flatMap((row): DayValue[] => (row.total === null ? [] : [{ day: row.date, value: row.total }])))

export function useStatsGoals(today: string): StatsGoalsShown {
  const month = monthOf(today)
  const from = addDays(today, -AVERAGE_DAYS)
  const to = addDays(today, -1)
  const [attempt, setAttempt] = useState(0)
  const key = `${month}|${from}|${to}|${attempt}`
  const [held, setHeld] = useState<Held | null>(null)

  useEffect(() => {
    let current = true
    // 둘 다 끝나기 전에 먼저 온 쪽을 보인다
    const put = (part: Partial<Omit<Held, 'key'>>) => {
      if (!current) return
      setHeld((now) => ({ ...(now?.key === key ? now : { key, goal: 'reading', revenue: 'reading' }), ...part }))
    }
    readGoal(month).then(
      (goal) => put({ goal }),
      () => put({ goal: 'failed' }),
    )
    readRevenue(from, to).then(
      (revenue) => put({ revenue }),
      () => put({ revenue: 'failed' }),
    )
    return () => {
      current = false
    }
  }, [key, month, from, to])

  const onReread = useCallback(() => setAttempt((n) => n + 1), [])

  const onSave = useCallback(
    async (goal: Goal) => {
      await saveGoal(supabaseBrowser(), month, goal)
      const saved: Goal = { visits: goal.visits, newPatients: goal.newPatients, revenue: goal.revenue }
      setHeld((now) => (now?.key === key ? { ...now, goal: saved } : now))
    },
    [key, month],
  )

  const shown = held?.key === key ? held : null
  return { today, goal: shown?.goal ?? 'reading', revenue: shown?.revenue ?? 'reading', onReread, onSave }
}

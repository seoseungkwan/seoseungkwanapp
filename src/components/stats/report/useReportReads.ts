'use client'

import { useCallback, useEffect, useState } from 'react'
import { addDays, addMonths, compareYmd, monthRange } from '@/lib/analytics/dates'
import type { DayValue } from '@/lib/analytics/goalPace'
import { loadGoal } from '@/lib/storage/goals'
import { createRevenueStore } from '@/lib/storage/revenue'
import { supabaseBrowser } from '@/lib/supabase/browser'
import type { Goal } from '@/types/goals'

// 월간 보고서의 서버 읽기 (stats-insights REQ-6108 AC-6108.2, design.md '월간 보고서'). 고른 달마다 둘을 함께 읽는다:
// 고른 달·앞 달의 하루 매출(sales_days 총액, 총액이 빈 날은 뺀다 — 목표 칸과 같다) · 고른 달 목표(loadGoal, withGoal이 거짓이면 읽지 않는다 —
// 이번 달 목표는 요약 칸 목표 훅이 이미 읽어 저장 뒤 값까지 갖고 있다). 내원·신환·묶음 숫자는 넓은 하루 읽기가 따로 준다.
// 하루 매출은 앞 달 1일 ~ 고른 달 끝, 이번 달이면 어제까지다(넓은 하루 읽기·목표 칸과 같은 끝 — 오늘은 진료 중이라 세지 않는다).
// 달·revision이 바뀔 때·[다시 읽기]에 다시 읽고 늦게 온 앞 답은 버린다(useStatsGoals와 같은 방식). revision은 통계 화면이 [비트에서 불러오기]·저장·
// 매출 읽기가 끝날 때 늘린다(AC-6102.6). 같은 달을 다시 읽는 동안은 앞서 읽은 값을 그대로 보이고 답이 오면 바꾼다(매출 칸·목표 줄이 사라지지 않게,
// AC-6101.6과 같은 방식). 실패였던 쪽과 다른 달은 읽는 중이다. 읽은 값은 React 상태에만 둔다

export type ReportRead<T> = T | 'reading' | 'failed'
export type ReportReads = { sales: ReportRead<readonly DayValue[]>; goal: ReportRead<Goal>; retry(): void }

type Held = { key: string; month: string | null; sales: ReportRead<readonly DayValue[]>; goal: ReportRead<Goal> }

// 서버 클라이언트를 만들다 던져도(설정 없는 환경) 거절로 받는다
const readSales = (from: string, to: string) =>
  Promise.resolve()
    .then(() => createRevenueStore(supabaseBrowser()).loadDays({ from, to }))
    .then((days) => days.flatMap((row): DayValue[] => (row.total === null ? [] : [{ day: row.date, value: row.total }])))
const readGoal = (month: string) => Promise.resolve().then(() => loadGoal(supabaseBrowser(), month))

// 새 열쇠로 읽기 시작할 때 보일 것: 같은 달이면 앞서 읽은 값(실패는 읽는 중으로), 다른 달이면 둘 다 읽는 중
function startOf(now: Held | null, key: string, month: string | null): Held {
  if (now === null || now.month !== month) return { key, month, sales: 'reading', goal: 'reading' }
  return { key, month, sales: now.sales === 'failed' ? 'reading' : now.sales, goal: now.goal === 'failed' ? 'reading' : now.goal }
}

/** 하루 매출 읽는 끝: 고른 달 끝, 그 끝이 어제보다 늦으면(이번 달) 어제 */
export function salesEnd(month: string, today: string): string {
  const end = monthRange(month).to
  const yesterday = addDays(today, -1)
  return compareYmd(end, yesterday) <= 0 ? end : yesterday
}

/** month null = 고른 달이 없음(읽지 않음). today = 한국 날짜 */
export function useReportReads(
  month: string | null,
  today: string,
  { revision = 0, withGoal = true }: { revision?: number; withGoal?: boolean } = {},
): ReportReads {
  const [attempt, setAttempt] = useState(0)
  const to = month === null ? null : salesEnd(month, today)
  const key = `${month}|${to}|${withGoal}|${revision}|${attempt}`
  const [held, setHeld] = useState<Held | null>(null)

  useEffect(() => {
    if (month === null || to === null) return
    let current = true
    // 둘 다 끝나기 전에 먼저 온 쪽을 보인다
    const put = (part: Partial<Pick<Held, 'sales' | 'goal'>>) => {
      if (!current) return
      setHeld((now) => ({ ...(now?.key === key ? now : startOf(now, key, month)), ...part }))
    }
    readSales(monthRange(addMonths(month, -1)).from, to).then(
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
  }, [key, month, to, withGoal])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])
  // 열쇠가 바뀐 뒤 첫 답이 오기 전에도 같은 달이면 앞서 읽은 값을 보인다
  const shown = held?.key === key ? held : startOf(held, key, month)
  return { sales: shown.sales, goal: shown.goal, retry }
}

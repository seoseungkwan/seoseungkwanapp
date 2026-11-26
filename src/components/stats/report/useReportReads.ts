'use client'

import { useCallback, useEffect, useState } from 'react'
import { addDays, addMonths, compareYmd, monthRange } from '@/lib/analytics/dates'
import type { DayValue } from '@/lib/analytics/goalPace'
import { revenueDayValues } from '@/lib/revenue/summary'
import { loadGoal } from '@/lib/storage/goals'
import { createRevenueStore } from '@/lib/storage/revenue'
import { readCoverage } from '@/lib/storage/stats'
import { readUisPeriods } from '@/lib/storage/uisarang'
import { supabaseBrowser } from '@/lib/supabase/browser'
import type { DateRange } from '@/types/dates'
import type { Goal } from '@/types/goals'
import type { UisReportData } from './reportData'

// 월간 보고서의 서버 읽기 (stats-insights REQ-6108 AC-6108.2, design.md '월간 보고서'). 고른 달마다 둘을 함께 읽는다:
// 고른 달·앞 달의 하루 매출(sales_days 줄의 revenueDayValues — 참고 금액만 있는 날도 들고 금액을 모르는 날은 뺀다, 목표 칸과 같다, bit-total AC-6901.3·AC-6906.2)
// · 고른 달 목표(loadGoal, withGoal이 거짓이면 읽지 않는다 —
// 이번 달 목표는 요약 칸 목표 훅이 이미 읽어 저장 뒤 값까지 갖고 있다). 내원·신환·묶음 숫자는 넓은 하루 읽기가 따로 준다.
// 하루 매출은 앞 달 1일 ~ 고른 달 끝, 이번 달이면 어제까지다(넓은 하루 읽기·목표 칸과 같은 끝 — 오늘은 진료 중이라 세지 않는다).
// 달·revision이 바뀔 때·[다시 읽기]에 다시 읽고 늦게 온 앞 답은 버린다(useStatsGoals와 같은 방식). revision은 통계 화면이 [비트에서 불러오기]·저장·
// 매출 읽기가 끝날 때 늘린다(AC-6102.6). 같은 달을 다시 읽는 동안은 앞서 읽은 값을 그대로 보이고 답이 오면 바꾼다(매출 칸·목표 줄이 사라지지 않게,
// AC-6101.6과 같은 방식). 실패였던 쪽과 다른 달은 읽는 중이다. 읽은 값은 React 상태에만 둔다
// 의사랑 의원(uisarang-upload AC-8817.5, design.md §10-6): uis가 참이면 같은 열쇠·같은 늦은 답 버리기로 고른 달 1일 ~ salesEnd의
// 처방 줄(readUisPeriods 'rx')·나이대 줄('age')·덮은 날(readCoverage)을 함께 읽어 uis로 준다. 하나라도 못 읽으면 failed(E-UIS-READ-FAILED 카드).
// uis가 거짓이면 의사랑 읽기를 하지 않고 uis는 null이다(AC-8817.6)

export type ReportRead<T> = T | 'reading' | 'failed'
export type ReportReads = { sales: ReportRead<readonly DayValue[]>; goal: ReportRead<Goal>; uis: ReportRead<UisReportData> | null; retry(): void }

type Held = { key: string; month: string | null; sales: ReportRead<readonly DayValue[]>; goal: ReportRead<Goal>; uis: ReportRead<UisReportData> | null }

// 서버 클라이언트를 만들다 던져도(설정 없는 환경) 거절로 받는다
const readSales = (from: string, to: string) =>
  Promise.resolve()
    .then(() => createRevenueStore(supabaseBrowser()).loadDays({ from, to }))
    .then((days): DayValue[] => revenueDayValues(days))
const readGoal = (month: string) => Promise.resolve().then(() => loadGoal(supabaseBrowser(), month))
const readUis = (range: DateRange) =>
  Promise.resolve()
    .then(() => Promise.all([readUisPeriods('rx', range), readUisPeriods('age', range), readCoverage(range)]))
    .then(([rx, age, covered]): UisReportData => ({ rx, age, covered }))

// 다시 읽을 때 앞 값을 둘지: 실패였으면 읽는 중으로
const again = <T>(read: ReportRead<T>): ReportRead<T> => (read === 'failed' ? 'reading' : read)

// 새 열쇠로 읽기 시작할 때 보일 것: 같은 달이면 앞서 읽은 값(실패는 읽는 중으로), 다른 달이면 모두 읽는 중. 의사랑이 아니면 uis는 null
function startOf(now: Held | null, key: string, month: string | null, uis: boolean): Held {
  const same = now !== null && now.month === month
  const uisShown = !uis ? null : same && now.uis !== null ? again(now.uis) : 'reading'
  if (!same) return { key, month, sales: 'reading', goal: 'reading', uis: uisShown }
  return { key, month, sales: again(now.sales), goal: again(now.goal), uis: uisShown }
}

/** 하루 매출 읽는 끝: 고른 달 끝, 그 끝이 어제보다 늦으면(이번 달) 어제 */
export function salesEnd(month: string, today: string): string {
  const end = monthRange(month).to
  const yesterday = addDays(today, -1)
  return compareYmd(end, yesterday) <= 0 ? end : yesterday
}

/** month null = 고른 달이 없음(읽지 않음). today = 한국 날짜. uis = 의사랑 의원(처방·나이대·덮은 날도 읽는다) */
export function useReportReads(
  month: string | null,
  today: string,
  { revision = 0, withGoal = true, uis = false }: { revision?: number; withGoal?: boolean; uis?: boolean } = {},
): ReportReads {
  const [attempt, setAttempt] = useState(0)
  const to = month === null ? null : salesEnd(month, today)
  const key = `${month}|${to}|${withGoal}|${uis}|${revision}|${attempt}`
  const [held, setHeld] = useState<Held | null>(null)

  useEffect(() => {
    if (month === null || to === null) return
    let current = true
    // 모두 끝나기 전에 먼저 온 쪽을 보인다
    const put = (part: Partial<Pick<Held, 'sales' | 'goal' | 'uis'>>) => {
      if (!current) return
      setHeld((now) => ({ ...(now?.key === key ? now : startOf(now, key, month, uis)), ...part }))
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
    if (uis) {
      readUis({ from: monthRange(month).from, to }).then(
        (data) => put({ uis: data }),
        () => put({ uis: 'failed' }),
      )
    }
    return () => {
      current = false
    }
  }, [key, month, to, withGoal, uis])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])
  // 열쇠가 바뀐 뒤 첫 답이 오기 전에도 같은 달이면 앞서 읽은 값을 보인다
  const shown = held?.key === key ? held : startOf(held, key, month, uis)
  return { sales: shown.sales, goal: shown.goal, uis: shown.uis, retry }
}

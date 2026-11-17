'use client'

import { useCallback, useEffect, useState } from 'react'
import { addMonths, monthOf } from '@/lib/analytics/dates'
import { listCalendarCounts, loadCalendarSettings } from '@/lib/storage/calendar'
import { supabaseBrowser } from '@/lib/supabase/browser'
import type { CalCountRow, CalSettings } from '@/types/calendar'
import type { CalendarRows, StatsCalendarShown } from './sections/CalendarSection'

// 통계 '예약' 칸의 서버 숫자 (spec clinic-calendar REQ-5907 AC-5907.3, design.md '화면' 통계 칸, tasks.md TASK-9).
// 이번 달 1일 −11달 ~ 오늘(통계 기간 단추와 상관없음)의 예약을 listCalendarCounts(이름·차트번호·메모 칸 없음)로 읽는다.
// 셈(monthTrend·rateSummary)은 CalendarSection이 한다. 설정(loadCalendarSettings)은 나눠 보기 차례·표시 이름에만 쓴다:
// 설정을 읽지 못해도 칸은 그리고(설정 없이), 예약 줄을 읽지 못했을 때만 failed다.
// 오늘이 바뀔 때·[다시 읽기]에 다시 읽고 늦게 온 앞 답은 버린다(useStatsSunap과 같은 방식). 줄·설정은 React 상태에만 둔다. 저장하지 않는다

type Read = { rows: CalCountRow[]; settings: CalSettings | null } // settings null = 설정 읽기 실패
type Held = { key: string; value: Read | null } // value null = 예약 줄 읽기 실패

/** 읽는 기간: 이번 달을 넣은 최근 12달의 첫날 ~ 오늘 */
function calendarSpan(today: string): { from: string; to: string } {
  return { from: `${addMonths(monthOf(today), -11)}-01`, to: today }
}

// 서버 클라이언트를 만들다 던져도(설정 없는 환경) 거절로 받는다
const read = (from: string, to: string): Promise<Read> =>
  Promise.resolve().then(async () => {
    const client = supabaseBrowser()
    const [rows, settings] = await Promise.all([listCalendarCounts(client, from, to), loadCalendarSettings(client).catch(() => null)])
    return { rows, settings }
  })

export function useStatsCalendar(today: string): StatsCalendarShown {
  const { from, to } = calendarSpan(today)
  const [attempt, setAttempt] = useState(0)
  const key = `${from}|${to}|${attempt}`
  const [held, setHeld] = useState<Held | null>(null)

  useEffect(() => {
    let current = true
    read(from, to).then(
      (value) => {
        if (current) setHeld({ key, value })
      },
      () => {
        if (current) setHeld({ key, value: null })
      },
    )
    return () => {
      current = false
    }
  }, [key, from, to])

  const onReread = useCallback(() => setAttempt((n) => n + 1), [])
  const shown = held === null || held.key !== key ? null : held
  const rows: CalendarRows = shown === null ? 'reading' : (shown.value?.rows ?? 'failed')
  const settings = shown?.value?.settings ?? null
  return settings === null ? { rows, today, onReread } : { rows, today, onReread, settings }
}
